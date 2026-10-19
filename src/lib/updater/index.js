'use strict'

/**
 * 热更新模块（主进程侧）
 *
 * 整体流程：
 *   检查 → 拉版本清单 latest.json（多个镜像依次尝试）→ 语义化版本比对
 *        → 下载补丁文件到 resources/.update-staging（边下边校验 sha256，失败自动换镜像）
 *        → 拉起独立助手 apply-update.js（以 ELECTRON_RUN_AS_NODE 启动的纯 Node 进程）
 *        → 本进程退出，助手等进程真的退出后替换 app.asar 等文件，再重新拉起应用
 *
 * 为什么不在进程内直接替换 app.asar：
 *   Electron 启动时就把 app.asar 打开并常驻，运行中覆盖会失败或产生半新半旧的运行态。
 *   所以「换文件」这一步必须交给一个不在 Electron 里的进程，等主进程彻底退出后再做。
 */

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const config = require('./config')
const net = require('./net')
const { compareVersions, normalizeVersion } = require('./semver')

const STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  UP_TO_DATE: 'uptodate',
  AVAILABLE: 'available',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  APPLYING: 'applying',
  MANUAL: 'manual',
  ERROR: 'error'
}

function rmrf(target) {
  return fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
}

function readDirSize(dirPath) {
  let total = 0
  let entries = []
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (error) {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name)
    try {
      if (entry.isDirectory()) total += readDirSize(full)
      else total += fs.statSync(full).size
    } catch (error) { /* ignore */ }
  }
  return total
}

/** 只允许相对路径，且不能跳出 resources 目录 */
function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value) return false
  const normalized = value.replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return false
  return !normalized.split('/').includes('..')
}

function createUpdater(deps) {
  const { app, configStore, log, packageJson, isDevelopment, getWindow } = deps

  const currentVersion = normalizeVersion((packageJson && packageJson.version) || app.getVersion() || '0.0.0')
  const resourcesDir = process.resourcesPath
  const stageDir = path.join(resourcesDir, config.STAGING_DIR)
  const planPath = path.join(stageDir, 'plan.json')
  const helperPath = path.join(resourcesDir, config.HELPER_NAME)
  const appExePath = process.execPath

  let manifest = null
  let patchFiles = []
  let cancelToken = null
  let checkPromise = null
  let lastEmitAt = 0
  let lastProgressAt = 0
  let lastProgressBytes = 0
  let speed = 0

  const state = {
    status: STATUS.IDLE,
    currentVersion,
    latestVersion: '',
    notes: '',
    publishedAt: '',
    releaseUrl: config.RELEASE_PAGE,
    /** hot = 可以原地热更新；manual = 只能去网页手动下载（开发模式 / 目录只读 / 缺补丁） */
    mode: 'manual',
    mandatory: false,
    size: 0,
    progress: 0,
    received: 0,
    total: 0,
    speed: 0,
    source: '',
    error: '',
    checkedAt: 0
  }

  function logFile() {
    try {
      const baseDir = app.getPath('logs') || path.join(app.getPath('userData'), 'logs')
      return path.join(baseDir, 'updater.log')
    } catch (error) {
      return path.join(app.getPath('userData'), 'updater.log')
    }
  }

  function emit(force) {
    const now = Date.now()
    if (!force && now - lastEmitAt < 120) return
    lastEmitAt = now
    const win = typeof getWindow === 'function' ? getWindow() : null
    if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return
    try {
      win.webContents.send('updater:state', { ...state })
    } catch (error) { /* 窗口正在销毁，忽略 */ }
  }

  function setState(patch, force = true) {
    Object.assign(state, patch)
    emit(force)
    return { ...state }
  }

  /** resources 目录是否可写（装在 Program Files 下时会不可写，此时只能走手动下载） */
  function isResourcesWritable() {
    try {
      fs.accessSync(resourcesDir, fs.constants.W_OK)
      const probe = path.join(resourcesDir, `.write-test-${Date.now()}`)
      fs.writeFileSync(probe, '1')
      fs.unlinkSync(probe)
      return true
    } catch (error) {
      return false
    }
  }

  /** 启动时清理上次更新留下的 .old 备份与半截下载 */
  function cleanupLeftovers() {
    if (!app.isPackaged) return
    const walk = (dirPath, depth) => {
      if (depth > 6) return
      let entries = []
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
      } catch (error) {
        return
      }
      for (const entry of entries) {
        const full = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          walk(full, depth + 1)
        } else if (/\.old$/i.test(entry.name) || /\.part$/i.test(entry.name)) {
          // 被占用时删不掉，下次启动再试即可
          fs.promises.rm(full, { force: true }).catch(() => {})
        }
      }
    }
    walk(resourcesDir, 0)
    // 上次「已下载但没安装」的包，超过 3 天就清掉，避免占空间
    try {
      const stamp = fs.statSync(stageDir)
      if (Date.now() - stamp.mtimeMs > 3 * 24 * 3600 * 1000) rmrf(stageDir)
    } catch (error) { /* 不存在即忽略 */ }
  }

  function buildMirrorUrls(originalUrl, mirrors) {
    const list = Array.isArray(mirrors) && mirrors.length ? mirrors : config.ASSET_MIRRORS
    const urls = []
    for (const prefix of list) {
      const base = String(prefix || '').trim()
      if (!base) {
        urls.push(originalUrl)
        continue
      }
      urls.push(base.endsWith('/') ? `${base}${originalUrl}` : `${base}/${originalUrl}`)
    }
    if (!urls.includes(originalUrl)) urls.push(originalUrl)
    return [...new Set(urls)]
  }

  function normalizeManifest(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('版本清单格式无效')

    const version = normalizeVersion(raw.version || raw.tag_name || raw.tag || '')
    if (!version || !/^\d+\.\d+\.\d+/.test(version)) throw new Error('版本清单缺少合法版本号')

    const downloadBase = String(
      raw.downloadBase
      || `${config.RELEASE_DOWNLOAD_BASE}/v${version}/`
    ).replace(/\/?$/, '/')

    const patchRaw = raw.patch && typeof raw.patch === 'object' ? raw.patch : null
    const files = []
    if (patchRaw && Array.isArray(patchRaw.files)) {
      for (const item of patchRaw.files) {
        if (!item || !isSafeRelativePath(item.path)) continue
        const assetName = item.asset || item.path.replace(/\//g, '__')
        files.push({
          path: item.path.replace(/\\/g, '/'),
          url: item.url || `${downloadBase}${encodeURIComponent(assetName).replace(/%2F/gi, '/')}`,
          size: Number(item.size) || 0,
          sha256: String(item.sha256 || '').toLowerCase()
        })
      }
    }

    return {
      version,
      build: Number(raw.build) || 0,
      channel: String(raw.channel || 'stable'),
      mandatory: !!raw.mandatory,
      notes: typeof raw.notes === 'object' && raw.notes
        ? raw.notes
        : { zh: String(raw.notes || ''), en: String(raw.notes || '') },
      publishedAt: String(raw.publishedAt || ''),
      releaseUrl: String(raw.releaseUrl || `${config.RELEASE_PAGE}/tag/v${version}`),
      mirrors: Array.isArray(raw.mirrors) ? raw.mirrors : null,
      patch: files.length
        ? {
          minVersion: normalizeVersion(raw.patch.minVersion || '0.0.0'),
          totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
          remove: Array.isArray(raw.patch.remove) ? raw.patch.remove.filter(isSafeRelativePath) : [],
          files
        }
        : null
    }
  }

  /** 清单全部镜像都拉不到时，用 GitHub API 拿 release 概要，再从它的附件里找 latest.json */
  async function fetchManifestFromApi(proxy) {
    const release = await net.fetchJson(config.GITHUB_API_RELEASE, {
      proxy,
      timeout: 12000,
      headers: { Accept: 'application/vnd.github.v3+json' }
    })
    const assets = Array.isArray(release.assets) ? release.assets : []
    const manifestAsset = assets.find((item) => item.name === config.MANIFEST_FILE)
    if (manifestAsset && manifestAsset.browser_download_url) {
      const urls = buildMirrorUrls(manifestAsset.browser_download_url, null)
      for (const url of urls) {
        try {
          return normalizeManifest(await net.fetchJson(url, { proxy, timeout: 10000 }))
        } catch (error) { /* 换下一个镜像 */ }
      }
    }
    // 连清单附件都没有：只能给出「有新版本，请手动下载」的信息
    return normalizeManifest({
      version: release.tag_name,
      notes: release.body,
      releaseUrl: release.html_url,
      publishedAt: release.published_at
    })
  }

  /**
   * 拉取版本清单：按 MANIFEST_SOURCES 顺序尝试，任意一个成功即返回。
   * 国内直连 raw.githubusercontent.com 基本不可用，所以把加速前缀放在前面。
   */
  async function fetchManifest(proxy, token) {
    const errors = []
    for (const url of config.MANIFEST_SOURCES) {
      if (token) token.throwIfCancelled()
      try {
        const raw = await net.fetchJson(url, { proxy, timeout: 8000, cancelToken: token })
        return normalizeManifest(raw)
      } catch (error) {
        errors.push(`${new URL(url).host}: ${error.message}`)
      }
    }
    try {
      return await fetchManifestFromApi(proxy)
    } catch (error) {
      errors.push(`api.github.com: ${error.message}`)
    }
    throw new Error(`无法获取版本信息（${errors.join('；')}）`)
  }

  /** 是否有更新：先比语义化版本，同版本再比构建号（支持「同版本重发」的热修） */
  function isNewer(next, current, nextBuild, currentBuild) {
    const cmp = compareVersions(next, current)
    if (cmp !== 0) return cmp > 0
    if (nextBuild && currentBuild) return nextBuild > currentBuild
    return false
  }

  function resolveMode(next) {
    if (!app.isPackaged) return 'manual'
    if (isDevelopment) return 'manual'
    if (!next.patch) return 'manual'
    if (compareVersions(currentVersion, next.patch.minVersion) < 0) return 'manual'
    if (!isResourcesWritable()) return 'manual'
    // 助手可能来自两处：已安装的 resources/apply-update.js，或本次更新包里自带的那份
    const patchHasHelper = next.patch.files.some((file) => file.path === config.HELPER_NAME)
    if (!fs.existsSync(helperPath) && !patchHasHelper) return 'manual'
    return 'hot'
  }

  async function check(options = {}) {
    if (checkPromise) return checkPromise
    if (state.status === STATUS.DOWNLOADING || state.status === STATUS.APPLYING) return { ...state }

    checkPromise = (async () => {
      setState({ status: STATUS.CHECKING, error: '' })
      const proxy = net.normalizeProxy(configStore.get('proxy', ''))
      const channel = String(configStore.get('updateChannel', 'stable') || 'stable')

      try {
        const next = await fetchManifest(proxy)
        manifest = next

        if (next.channel !== 'stable' && channel !== next.channel && channel !== 'beta') {
          return setState({ status: STATUS.UP_TO_DATE, checkedAt: Date.now(), latestVersion: currentVersion })
        }

        const installedBuild = Number(configStore.get('installedBuild', 0)) || 0
        const hasUpdate = isNewer(next.version, currentVersion, next.build, installedBuild)

        if (!hasUpdate) {
          return setState({
            status: STATUS.UP_TO_DATE,
            latestVersion: next.version,
            checkedAt: Date.now(),
            progress: 0,
            error: ''
          })
        }

        const mode = resolveMode(next)
        patchFiles = next.patch ? next.patch.files : []
        return setState({
          status: mode === 'hot' ? STATUS.AVAILABLE : STATUS.MANUAL,
          mode,
          latestVersion: next.version,
          notes: next.notes,
          publishedAt: next.publishedAt,
          releaseUrl: next.releaseUrl,
          mandatory: next.mandatory,
          size: next.patch ? next.patch.totalSize : 0,
          checkedAt: Date.now(),
          progress: 0,
          received: 0,
          total: next.patch ? next.patch.totalSize : 0,
          error: ''
        })
      } catch (error) {
        log.warn('[UPDATER] check failed:', error && error.message)
        // 启动时的静默检测失败不打扰用户，保持 idle
        if (options.quiet) {
          return setState({ status: STATUS.IDLE, error: error.message }, false)
        }
        return setState({ status: STATUS.ERROR, error: error.message || '检查更新失败' })
      } finally {
        checkPromise = null
      }
    })()

    return checkPromise
  }

  function reportProgress(received, total) {
    const now = Date.now()
    state.received = received
    if (total) state.total = total
    if (now - lastProgressAt > 400) {
      const deltaBytes = received - lastProgressBytes
      const deltaTime = (now - lastProgressAt) / 1000
      if (deltaTime > 0) speed = deltaBytes / deltaTime
      lastProgressAt = now
      lastProgressBytes = received
      state.speed = Math.max(0, Math.round(speed))
    }
    if (state.total) {
      state.progress = Math.min(100, Math.round((received / state.total) * 1000) / 10)
    }
    emit(false)
  }

  async function downloadOne(file, offset, token) {
    const target = path.join(stageDir, file.path)
    const urls = buildMirrorUrls(file.url, manifest ? manifest.mirrors : null)
    let lastError = null

    for (const url of urls) {
      token.throwIfCancelled()
      state.source = (() => {
        try {
          return new URL(url).host
        } catch (error) {
          return ''
        }
      })()
      emit(true)
      try {
        const result = await net.downloadFile(url, target, {
          proxy: net.normalizeProxy(configStore.get('proxy', '')),
          cancelToken: token,
          expectedSize: file.size,
          onProgress: (received) => reportProgress(offset + received, state.total)
        })
        if (file.sha256 && result.sha256 !== file.sha256) {
          throw new Error('sha256 校验失败')
        }
        return result
      } catch (error) {
        lastError = error
        await rmrf(target)
        if (token.cancelled) throw error
        log.warn(`[UPDATER] 源失败 ${state.source}: ${error.message}`)
      }
    }
    throw new Error(lastError ? lastError.message : '下载失败')
  }

  async function download() {
    if (state.status === STATUS.DOWNLOADING) return { ...state }
    if (!manifest || !manifest.patch) {
      return setState({ status: STATUS.MANUAL, error: '' })
    }

    cancelToken = net.createCancelToken()
    speed = 0
    lastProgressAt = Date.now()
    lastProgressBytes = 0

    await rmrf(stageDir)
    await fs.promises.mkdir(stageDir, { recursive: true })

    setState({
      status: STATUS.DOWNLOADING,
      progress: 0,
      received: 0,
      total: manifest.patch.totalSize,
      speed: 0,
      error: ''
    })

    const staged = []
    let offset = 0

    try {
      for (const file of manifest.patch.files) {
        await downloadOne(file, offset, cancelToken)
        staged.push(file)
        offset += file.size || 0
        reportProgress(offset, manifest.patch.totalSize)
      }

      const plan = {
        version: manifest.version,
        createdAt: new Date().toISOString(),
        // 助手靠这个 PID 判断应用是否真的退出了
        pid: process.pid,
        resourcesDir,
        stagingDir: stageDir,
        restart: appExePath,
        logFile: logFile(),
        files: staged.map((file) => ({
          path: file.path,
          staged: path.join(stageDir, file.path),
          sha256: file.sha256,
          size: file.size
        })),
        remove: manifest.patch.remove
      }
      await fs.promises.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf8')

      lastEmitAt = 0
      return setState({ status: STATUS.READY, progress: 100, received: manifest.patch.totalSize, speed: 0 })
    } catch (error) {
      await rmrf(stageDir)
      if (cancelToken && cancelToken.cancelled) {
        return setState({ status: STATUS.AVAILABLE, progress: 0, received: 0, speed: 0, error: '' })
      }
      log.error('[UPDATER] download failed:', error)
      return setState({ status: STATUS.ERROR, error: error.message || '下载失败' })
    } finally {
      cancelToken = null
    }
  }

  function cancel() {
    if (cancelToken) cancelToken.cancel()
    return { ...state }
  }

  /**
   * 应用更新：拉起助手进程后本进程退出。
   * 助手会等 PID 真正消失再替换文件，替换完自动重启应用。
   */
  function apply() {
    if (state.status !== STATUS.READY) return { ok: false, reason: 'not-ready' }
    if (!fs.existsSync(planPath)) return { ok: false, reason: 'missing-plan' }

    // 优先用更新包里自带的那份助手（补丁里会包含它），其次是已安装的那份
    const stagedHelper = path.join(stageDir, config.HELPER_NAME)
    const helper = fs.existsSync(stagedHelper) ? stagedHelper : helperPath
    if (!fs.existsSync(helper)) return { ok: false, reason: 'missing-helper' }

    try {
      const child = spawn(appExePath, [helper, '--plan', planPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
      child.unref()
    } catch (error) {
      log.error('[UPDATER] spawn helper failed:', error)
      return { ok: false, reason: error.message }
    }

    if (manifest && manifest.build) {
      configStore.set('installedBuild', manifest.build)
    }
    setState({ status: STATUS.APPLYING, progress: 100 })

    // 留一点时间让渲染进程收到状态、动画走完
    setTimeout(() => {
      try {
        app.exit(0)
      } catch (error) {
        process.exit(0)
      }
    }, 700)

    return { ok: true }
  }

  /** 更新包里最多这么大（兜底，防止清单写错把磁盘写满） */
  function assertSaneSize() {
    const total = (manifest && manifest.patch && manifest.patch.totalSize) || 0
    if (total > 400 * 1024 * 1024) throw new Error('更新包体积异常')
  }

  function getState() {
    return { ...state }
  }

  function getNotes(locale) {
    if (!manifest) return ''
    const notes = manifest.notes || {}
    const lang = String(locale || 'zh')
    return notes[lang] || notes[lang.split('-')[0]] || notes.en || notes.zh || ''
  }

  function init() {
    try {
      cleanupLeftovers()
    } catch (error) {
      log.warn('[UPDATER] cleanup failed:', error)
    }
    // 未打包 / 开发模式：直接标记为手动，界面按钮会走 GitHub 网页
    if (!app.isPackaged) {
      state.mode = 'manual'
    }
    emit(true)
  }

  return {
    STATUS,
    init,
    check,
    download,
    cancel,
    apply,
    getState,
    getNotes,
    assertSaneSize,
    emitState: () => emit(true),
    getManifest: () => manifest
  }
}

module.exports = { createUpdater, STATUS, readDirSize }
