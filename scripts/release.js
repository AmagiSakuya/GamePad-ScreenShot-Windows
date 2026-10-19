'use strict'

/**
 * 发布脚本：构建 → 打热更新包（一个 zip）→ 打完整包 → 生成 latest.json
 *
 * 用法（一般通过 build.bat 调用）：
 *   node scripts/release.js 2.1.0
 *   node scripts/release.js 2.1.0 --notes "修复手柄断连" --nozip
 *   node scripts/release.js 2.1.0 --patch-from 2.1.0     # 本次改了 exe/dll，老版本必须走完整包
 *   node scripts/release.js 2.1.0 --no-build             # 复用已有 dist_electron（调试脚本用）
 *
 * 产物（一共 3 个文件，全部传到同一个 GitHub Release）：
 *   release_upload/v<版本>/release-assets/GamepadShot-<版本>-win-x64.zip   完整包
 *   release_upload/v<版本>/release-assets/update-<版本>.zip                热更新包
 *   release_upload/v<版本>/release-assets/latest.json                      版本清单
 *   release_upload/v<版本>/UPLOAD.md                                       上传步骤
 *
 * 客户端读清单的地址是
 *   https://github.com/<repo>/releases/latest/download/latest.json
 * 它是 GitHub 的固定地址，永远指向「最新发布的正式 Release」的附件，
 * 所以发完 Release 就不用再去 update 分支提交任何东西了。
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const PKG_PATH = path.join(ROOT, 'package.json')
const BUILD_DIR = path.join(ROOT, 'dist_electron')
const UNPACKED_DIR = path.join(BUILD_DIR, 'win-unpacked')
const RESOURCES_DIR = path.join(UNPACKED_DIR, 'resources')
const OUT_ROOT = path.join(ROOT, 'release_upload')

const REPO = 'AmagiSakuya/GamePad-ScreenShot-Windows'
const RELEASE_PAGE = `https://github.com/${REPO}/releases`
const DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`

/**
 * 第一个支持「zip 补丁」的版本。
 * 比它老的客户端（2.0.0）只会读 patch.files 逐文件下载，读不到就会自动退化成
 * 「有新版本，请手动下载完整包」——正是跨代升级应该走的路径。
 * 所以这里默认取这个值：2.0.0 的用户手动装一次，之后全走热更新。
 */
const ZIP_PATCH_SINCE = '2.1.0'

const ASSET_MIRRORS = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
  ''
]

// 打包前要清掉的运行期残留（上一次更新留下的备份、半截下载、暂存目录）
const SKIP_DIRS = new Set(['.update-staging'])
const SKIP_RE = /(\.old$|\.part$|^\.write-test-|\.log$)/i

// ---------------------------------------------------------------- 参数

function parseArgs(argv) {
  const args = { positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (!item.startsWith('--')) {
      args.positional.push(item)
      continue
    }
    const key = item.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const targetVersion = args.positional[0] ? String(args.positional[0]).replace(/^v/i, '').trim() : ''
const noZip = !!args.nozip
const noBuild = !!args['no-build']
const noPatch = !!args['no-patch']
const channel = String(args.channel || 'stable')
const mandatory = !!args.mandatory
const patchFrom = String(args['patch-from'] || ZIP_PATCH_SINCE)
const notesArg = typeof args.notes === 'string' ? args.notes : ''

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

function log(message) {
  console.log(message)
}

function step(message) {
  // Windows cmd 下如果没开启 VT 处理，颜色转义会变成乱码，所以只在真终端里上色
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR
  console.log(useColor ? `\n\x1b[36m▸ ${message}\x1b[0m` : `\n▸ ${message}`)
}

function isValidVersion(value) {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(String(value || ''))
}

// ---------------------------------------------------------------- 基础工具

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function walkFiles(dir, base = dir, out = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walkFiles(path.join(dir, entry.name), base, out)
    } else {
      if (SKIP_RE.test(entry.name)) continue
      const full = path.join(dir, entry.name)
      out.push({ full, relative: path.relative(base, full).replace(/\\/g, '/') })
    }
  }
  return out
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

/**
 * 打包前先确认旧的 win-unpacked 没被占用。
 * 应用还开着 / 资源管理器预览 / 杀毒软件扫描都会锁住 app.asar，
 * electron-builder 只会抛一句看不懂的 ERR_ELECTRON_BUILDER_CANNOT_EXECUTE。
 */
function assertNotLocked() {
  const asar = path.join(RESOURCES_DIR, 'app.asar')
  if (!fs.existsSync(asar)) return
  try {
    const fd = fs.openSync(asar, 'r+')
    fs.closeSync(fd)
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES') {
      fail(
        '上一次的打包产物正被占用，无法覆盖：\n'
        + `  ${asar}\n\n`
        + '请先完全退出正在运行的 GamePad ScreenShot（含托盘图标），\n'
        + '关闭可能预览该目录的资源管理器窗口，然后重新执行 build.bat。'
      )
    }
  }
}

/** 清掉 resources 里的运行期残留，避免把它们打进补丁包 */
function cleanResources() {
  let removed = 0
  const walk = (dirPath, depth) => {
    if (depth > 8) return
    let entries = []
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch (error) {
      return
    }
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          rmrf(full)
          removed++
          continue
        }
        walk(full, depth + 1)
      } else if (SKIP_RE.test(entry.name)) {
        rmrf(full)
        removed++
      }
    }
  }
  walk(RESOURCES_DIR, 0)
  if (removed) log(`  已清理 ${removed} 个运行期残留文件`)
}

// ---------------------------------------------------------------- 构建

function runBuild() {
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    log('  执行 npm run electron:build …（首次会比较慢）')
    const child = spawn(npm, ['run', 'electron:build'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'production' }
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`构建失败，退出码 ${code}`))
    })
    child.on('error', reject)
  })
}

// ---------------------------------------------------------------- 打 zip

/**
 * 把 srcDir 的内容打成 zip（条目路径相对 srcDir）。
 * 用 `-C srcDir .` 而不是逐个列文件名，避免命令行过长。
 */
function isZipFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r')
    const head = Buffer.alloc(4)
    fs.readSync(fd, head, 0, 4, 0)
    fs.closeSync(fd)
    // PK\x03\x04（有内容）或 PK\x05\x06（空包）
    return head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05)
  } catch (error) {
    return false
  }
}

/**
 * zip 工具按「快 → 慢」排：
 *   Windows 10 1803+ 自带的 System32\tar.exe 是 bsdtar，打 zip 最快；
 *   注意不能直接写 'tar'——如果装了 Git for Windows，PATH 里命中的是 GNU tar，
 *   它不支持 `-a`（按扩展名推断格式），会白白退回到很慢的 Compress-Archive。
 */
function zipToolCandidates() {
  const list = []
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    list.push(path.join(systemRoot, 'System32', 'tar.exe'))
    list.push('bsdtar')
  } else {
    list.push('bsdtar', 'tar')
  }
  return list
}

function zipDirectory(srcDir, zipPath) {
  rmrf(zipPath)

  for (const tool of zipToolCandidates()) {
    try {
      execFileSync(tool, ['-a', '-c', '-f', zipPath, '-C', srcDir, '.'], { stdio: 'ignore' })
      if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0 && isZipFile(zipPath)) {
        return path.basename(tool)
      }
      rmrf(zipPath)
    } catch (error) {
      rmrf(zipPath)
    }
  }

  // 兜底：PowerShell 的 Compress-Archive（慢，但任何 Windows 都有）
  const escapedSrc = srcDir.replace(/'/g, "''")
  const escapedZip = zipPath.replace(/'/g, "''")
  execFileSync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -Path '${escapedSrc}\\*' -DestinationPath '${escapedZip}' -CompressionLevel Optimal -Force`
  ], { stdio: 'inherit' })

  if (!isZipFile(zipPath)) throw new Error('压缩失败：产物不是有效的 zip')
  return 'Compress-Archive'
}

// ---------------------------------------------------------------- 说明文本

function gitNotes(limit = 10) {
  try {
    const out = execFileSync('git', ['log', `-n${limit}`, '--pretty=format:- %s'], {
      cwd: ROOT,
      encoding: 'utf8'
    })
    return String(out || '').trim()
  } catch (error) {
    return ''
  }
}

function buildNotes() {
  if (notesArg) return notesArg
  const generated = gitNotes()
  if (generated) return generated
  return ''
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'))
  const previousVersion = pkg.version
  const version = targetVersion || previousVersion

  if (!isValidVersion(version)) {
    fail(`版本号不合法: ${version}（示例：2.1.0 或 2.1.0-beta.1）`)
  }

  log('\n============================================')
  log('  GamePad ScreenShot · 发布打包')
  log(`  版本: ${previousVersion} → ${version}`)
  log(`  通道: ${channel}${mandatory ? '（重要更新）' : ''}`)
  log('============================================')

  // 1. 写入版本号（必须早于构建，app.asar 里的 package.json 才是新版本）
  if (pkg.version !== version) {
    pkg.version = version
    fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
    log(`\n  已更新 package.json version = ${version}`)
  }

  // 2. 构建
  if (!noBuild) {
    step('构建应用')
    assertNotLocked()
    try {
      await runBuild()
    } catch (error) {
      fail(
        `${error.message}\n\n`
        + '如果日志里出现 "cannot access the file because it is being used by another process"，\n'
        + '说明 dist_electron\\win-unpacked\\resources\\app.asar 被别的程序占用：\n'
        + '  · 先完全退出正在运行的 GamePad ScreenShot（含托盘图标）\n'
        + '  · 关掉可能正在预览该目录的资源管理器窗口\n'
        + '  · 杀毒软件正在扫描时也会短暂占用，稍等一会儿再试\n'
        + '  · 实在不行就重启电脑后删掉 dist_electron 目录再打包'
      )
    }
  } else {
    log('\n  跳过构建（--no-build），直接使用现有 dist_electron')
  }

  if (!fs.existsSync(RESOURCES_DIR)) {
    fail(`找不到打包产物: ${RESOURCES_DIR}\n  请先执行 npm run electron:build`)
  }
  const asarPath = path.join(RESOURCES_DIR, 'app.asar')
  if (!fs.existsSync(asarPath)) {
    fail(`找不到 app.asar: ${asarPath}`)
  }

  // 3. 统计 resources 内容（补丁包就是它的完整快照）
  step('统计补丁内容')
  cleanResources()
  const collected = walkFiles(RESOURCES_DIR)
  let patchRawSize = 0
  for (const item of collected) {
    try {
      patchRawSize += fs.statSync(item.full).size
    } catch (error) { /* 文件刚被删掉，忽略 */ }
  }
  log(`  ${collected.length} 个文件，原始体积 ${formatBytes(patchRawSize)}`)

  // 4. 建输出目录
  const outDir = path.join(OUT_ROOT, `v${version}`)
  const assetsDir = path.join(outDir, 'release-assets')
  rmrf(outDir)
  fs.mkdirSync(assetsDir, { recursive: true })

  // 5. 热更新包：一个 zip，内部路径相对 resources 根
  let patchInfo = null
  if (!noPatch) {
    step('打热更新包（update-<版本>.zip）')
    const patchName = `update-${version}.zip`
    const patchPath = path.join(assetsDir, patchName)
    try {
      const tool = zipDirectory(RESOURCES_DIR, patchPath)
      patchInfo = {
        asset: patchName,
        size: fs.statSync(patchPath).size,
        sha256: await sha256File(patchPath),
        url: `${DOWNLOAD_BASE}/v${version}/${patchName}`
      }
      log(`  ${patchName}（${formatBytes(patchInfo.size)}，使用 ${tool}）`)
    } catch (error) {
      log(`  ⚠ 热更新包打包失败：${error.message}（本次只发完整包）`)
    }
  } else {
    log('\n  跳过热更新包（--no-patch）')
  }

  // 6. 完整包
  let fullInfo = null
  if (!noZip) {
    step('打包完整压缩包（体积较大，请稍等）')
    const zipName = `GamepadShot-${version}-win-x64.zip`
    const zipPath = path.join(assetsDir, zipName)
    try {
      const tool = zipDirectory(UNPACKED_DIR, zipPath)
      fullInfo = {
        asset: zipName,
        size: fs.statSync(zipPath).size,
        sha256: await sha256File(zipPath),
        url: `${DOWNLOAD_BASE}/v${version}/${zipName}`
      }
      log(`  ${zipName}（${formatBytes(fullInfo.size)}，使用 ${tool}）`)
    } catch (error) {
      log(`  ⚠ 完整包打包失败：${error.message}（不影响热更新）`)
    }
  } else {
    log('\n  跳过完整包（--nozip）')
  }

  // 7. 生成 latest.json
  step('生成 latest.json')
  const notes = buildNotes()
  const manifest = {
    schema: 2,
    channel,
    version,
    build: Date.now(),
    minSupportedVersion: patchFrom,
    mandatory,
    publishedAt: new Date().toISOString(),
    releaseUrl: `${RELEASE_PAGE}/tag/v${version}`,
    downloadBase: `${DOWNLOAD_BASE}/v${version}/`,
    notes: {
      zh: notes,
      en: notes
    },
    mirrors: ASSET_MIRRORS,
    patch: patchInfo
      ? {
        // format 2 = 单个 zip；1 = 老的逐文件方案（客户端已不再使用）
        format: 2,
        minVersion: patchFrom,
        asset: patchInfo.asset,
        size: patchInfo.size,
        sha256: patchInfo.sha256,
        url: patchInfo.url,
        totalSize: patchInfo.size,
        remove: []
      }
      : null,
    full: fullInfo
  }

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  fs.writeFileSync(path.join(assetsDir, 'latest.json'), manifestText, 'utf8')
  log(`  热更新包 ${patchInfo ? formatBytes(patchInfo.size) : '无'} / 完整包 ${fullInfo ? formatBytes(fullInfo.size) : '无'}`)

  // 8. 上传说明
  writeUploadGuide(outDir, { version, patchInfo, fullInfo, patchFrom })

  // 9. 汇总
  log('\n============================================')
  log('  完成，待上传目录：')
  log(`  ${path.relative(ROOT, outDir).replace(/\\/g, '/')}/release-assets`)
  log('')
  log('  把这 3 个文件拖进同一个 Release 的附件区即可：')
  if (fullInfo) log(`    · ${fullInfo.asset}`)
  if (patchInfo) log(`    · ${patchInfo.asset}`)
  log('    · latest.json')
  log('')
  log(`  热更新包: ${patchInfo ? formatBytes(patchInfo.size) : '无'}`)
  if (fullInfo) log(`  完整包:   ${formatBytes(fullInfo.size)}`)
  log('============================================\n')
}

function writeUploadGuide(outDir, info) {
  const lines = [
    `# v${info.version} 发布清单`,
    '',
    '## 1. 建 Release 并上传附件',
    '',
    `1. 打开 ${RELEASE_PAGE}/new，Tag 填 \`v${info.version}\`，标题随意`,
    '2. 把 `release-assets/` 里的这 3 个文件拖进附件区：',
    '',
    info.fullInfo ? `   - \`${info.fullInfo.asset}\`（完整包，新用户 / 老版本跨代升级用）` : '',
    info.patchInfo ? `   - \`${info.patchInfo.asset}\`（热更新包，客户端只下这一个）` : '',
    '   - `latest.json`（版本清单）',
    '',
    '3. 直接点 **Publish release**（不要存成 Draft，也不要勾 Pre-release，否则客户端读不到）',
    '',
    '## 2. 不用再做别的事',
    '',
    '客户端读清单的地址是：',
    '',
    '```',
    `https://github.com/${REPO}/releases/latest/download/latest.json`,
    '```',
    '',
    '这是 GitHub 的固定地址，永远指向「最新发布的正式 Release」的附件。',
    '所以**不需要**再开 update 分支，也不需要提交任何东西。',
    '',
    '## 3. 客户端会怎么做',
    '',
    '1. 依次尝试 ghfast.top / gh-proxy.com / ghproxy.net / 直连，读取 latest.json',
    '2. 语义化版本比对（同版本再比 build 号）',
    `3. 下载 \`${info.patchInfo ? info.patchInfo.asset : 'update-x.y.z.zip'}\` 这一个文件，校验 sha256，失败自动换下一个镜像`,
    '4. 解包到 resources/.update-staging，还原出 app.asar / app.asar.unpacked/… 的目录结构',
    '5. 提示「重启并安装」→ 退出 → 独立进程逐文件备份替换 → 自动重启',
    '',
    '> 如果某次改动涉及 Electron 版本 / exe / dll（resources 之外的东西），',
    `> 请用 \`--patch-from ${info.version}\` 重新发布，让老版本走完整包下载。`,
    '>',
    `> 当前 \`patch.minVersion = ${info.patchFrom}\`：低于这个版本的客户端会提示手动下载完整包。`,
    `> 第一个支持 zip 补丁的版本是 ${ZIP_PATCH_SINCE}，比它老的（2.0.0）必须手动装一次。`
  ]

  fs.writeFileSync(path.join(outDir, 'UPLOAD.md'), `${lines.filter((line) => line !== '').join('\n')}\n`, 'utf8')
}

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error))
})
