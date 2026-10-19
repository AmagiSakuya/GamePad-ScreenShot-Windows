'use strict'

/**
 * 热更新模块（主进程侧）
 *
 * 整体流程：
 *   检查 → 拉版本清单 latest.json（多个镜像依次尝试，清单就在最新 Release 的附件里）
 *        → 语义化版本比对
 *        → 下载补丁包 update-x.y.z.zip 到 resources/.update-staging（校验 sha256，失败自动换镜像）
 *        → 解包到暂存目录（路径相对 resources 根，还原成 app.asar / app.asar.unpacked/… 的目录结构）
 *        → 拉起独立助手 apply-update.js（以 ELECTRON_RUN_AS_NODE 启动的纯 Node 进程）
 *        → 本进程退出，助手等进程真的退出后替换 app.asar 等文件，再重新拉起应用
 *
 * 为什么补丁用「一个 zip」而不是「一堆散文件」：
 *   Release 附件区不用再拖几十上百个文件，上传时也不容易漏；清单从几十 KB 缩到几百字节；
 *   下载只需要一条连接，进度和断点逻辑都简单得多。
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
const { extractZip } = require('./unzip')
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
    /**
     * manual 的具体原因，界面据此显示对应提示，避免所有情况都笼统地说
     * 「目录不可写或缺少组件」（真实原因可能只是客户端版本低于 patch.minVersion）。
     * dev / no-patch / old-version / readonly / missing-helper
     */
    manualReason: '',
    /** 本次补丁要求的最低客户端版本（用于「版本过旧」时的提示文案） */
    minVersion: '',
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

  /**
   * 解析补丁描述。
   * 新方案只认「一个 zip」：patch.asset = update-x.y.z.zip。
   * 老方案（逐文件 asset 列表）不再支持 —— 那时的客户端读不到新清单里的 files，
   * 会自然退化成「手动下载完整包」，正好是跨代升级该走的路径。
   */
  function normalizePatch(patchRaw, downloadBase) {
    if (!patchRaw || typeof patchRaw !== 'object') return null

    const asset = typeof patchRaw.asset === 'string' ? patchRaw.asset.trim() : ''
    if (!asset) return null
    // 只接受单层文件名，避免清单里塞进路径拼出奇怪的 URL
    if (asset.includes('/') || asset.includes('\\') || asset.includes('..')) return null

    const format = Number(patchRaw.format) || 1
    // 比当前客户端认识的格式更新，说明这份清单是给更晚的版本准备的
    if (format > config.PATCH_FORMAT) return null

    const size = Number(patchRaw.size) || 0
    return {
      format,
      minVersion: normalizeVersion(patchRaw.minVersion || '0.0.0'),
      asset,
      url: typeof patchRaw.url === 'string' && patchRaw.url
        ? patchRaw.url
        : `${downloadBase}${encodeURIComponent(asset)}`,
      size,
      sha256: String(patchRaw.sha256 || '').toLowerCase(),
      totalSize: size,
      remove: Array.isArray(patchRaw.remove) ? patchRaw.remove.filter(isSafeRelativePath) : []
    }
  }

  function normalizeManifest(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('版本清单格式无效')

    const version = normalizeVersion(raw.version || raw.tag_name || raw.tag || '')
    if (!version || !/^\d+\.\d+\.\d+/.test(version)) throw new Error('版本清单缺少合法版本号')

    const downloadBase = String(
      raw.downloadBase
      || `${config.RELEASE_DOWNLOAD_BASE}/v${version}/`
    ).replace(/\/?$/, '/')

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
      patch: normalizePatch(raw.patch, downloadBase)
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
   *
   * latest.json 的文件名是固定的（不随版本变化），加速镜像很可能把它缓存住，
   * 所以每次都带一个时间戳参数。GitHub 解析附件时只看路径、忽略查询串
   * （实测仍会正常 302 到 v<版本>/latest.json），但镜像站会把它当成新 URL，
   * 这样发版后不会有人读到上一版的清单。
   */
  function withCacheBust(url) {
    return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
  }

  async function fetchManifest(proxy, token) {
    const errors = []
    for (const url of config.MANIFEST_SOURCES) {
      if (token) token.throwIfCancelled()
      try {
        const raw = await net.fetchJson(withCacheBust(url), { proxy, timeout: 8000, cancelToken: token })
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

  /**
   * 决定这次更新能不能原地热更。
   * 返回 { mode, reason }：reason 会透到界面上，让用户看到真正的原因，
   * 而不是一律提示「目录不可写」。
   */
  function resolveMode(next) {
    if (!app.isPackaged) return { mode: 'manual', reason: 'dev' }
    if (isDevelopment) return { mode: 'manual', reason: 'dev' }
    if (!next.patch) return { mode: 'manual', reason: 'no-patch' }
    // 客户端比补丁要求的最低版本还老：老客户端的更新器不认识新补丁格式，
    // 必须让用户手动装一次完整包。这是唯一「注定要手动」的情况。
    if (compareVersions(currentVersion, next.patch.minVersion) < 0) {
      return { mode: 'manual', reason: 'old-version' }
    }
    if (!isResourcesWritable()) return { mode: 'manual', reason: 'readonly' }
    // 助手必须是「已经在 resources 里的真实文件」，补丁包里的那份要等下载解包后才拿得到，
    // 而这时候还没下载，所以只能检查已安装的那份。
    if (!fs.existsSync(helperPath)) return { mode: 'manual', reason: 'missing-helper' }
    return { mode: 'hot', reason: '' }
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

        const resolved = resolveMode(next)
        return setState({
          status: resolved.mode === 'hot' ? STATUS.AVAILABLE : STATUS.MANUAL,
          mode: resolved.mode,
          manualReason: resolved.reason,
          minVersion: next.patch ? next.patch.minVersion : '',
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

  /**
   * 下载补丁 zip：整包一条连接，失败自动换镜像。
   * 文件名直接用清单里的 asset（update-x.y.z.zip），落地后再解包。
   */
  async function downloadPatchArchive(token) {
    const patch = manifest.patch
    const target = path.join(stageDir, patch.asset)
    const urls = buildMirrorUrls(patch.url, manifest.mirrors)
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
          expectedSize: patch.size,
          onProgress: (received) => reportProgress(received, patch.size)
        })
        if (patch.sha256 && result.sha256 !== patch.sha256) {
          throw new Error('sha256 校验失败')
        }
        return target
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

    try {
      const zipPath = await downloadPatchArchive(cancelToken)

      // 解包是同步的（几十 MB 大约几百毫秒），先让「下载完成」这一帧发出去，
      // 否则界面会停在 99% 卡一下
      lastEmitAt = 0
      reportProgress(manifest.patch.size, manifest.patch.size)
      await new Promise((resolve) => setImmediate(resolve))
      cancelToken.throwIfCancelled()

      const extracted = extractZip(zipPath, stageDir)
      await fs.promises.rm(zipPath, { force: true })

      const plan = {
        version: manifest.version,
        createdAt: new Date().toISOString(),
        // 助手靠这个 PID 判断应用是否真的退出了
        pid: process.pid,
        resourcesDir,
        stagingDir: stageDir,
        restart: appExePath,
        logFile: logFile(),
        files: extracted.map((file) => ({
          path: file.path,
          staged: path.join(stageDir, ...file.path.split('/')),
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
