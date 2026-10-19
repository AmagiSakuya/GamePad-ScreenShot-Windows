'use strict'

/**
 * 发布脚本：构建 → 生成热更新补丁 → 生成 latest.json → 整理出「直接上传」的目录
 *
 * 用法（一般通过 build.bat 调用）：
 *   node scripts/release.js 2.1.0
 *   node scripts/release.js 2.1.0 --notes "修复手柄断连" --nozip
 *   node scripts/release.js 2.1.0 --patch-from 2.1.0     # 本次改了 exe/dll，老版本必须走完整包
 *   node scripts/release.js 2.1.0 --no-build             # 复用已有 dist_electron（调试脚本用）
 *
 * 产物：
 *   release_upload/v<版本>/release-assets/   → 全部拖到 GitHub Release（tag = v<版本>）
 *   release_upload/v<版本>/update-branch/    → latest.json 提交到 update 分支
 *   release_upload/v<版本>/UPLOAD.md         → 上传步骤
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

// 热更新模块从 2.0.0 起才有，比它老的版本连清单都读不到
const DEFAULT_PATCH_FROM = '2.0.0'

const ASSET_MIRRORS = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
  ''
]

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
const patchFrom = String(args['patch-from'] || DEFAULT_PATCH_FROM)
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

async function describeFile(filePath) {
  const stat = await fs.promises.stat(filePath)
  return { size: stat.size, sha256: await sha256File(filePath) }
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
      out.push({
        full,
        relative: path.relative(base, full).replace(/\\/g, '/')
      })
    }
  }
  return out
}

/**
 * Release 资源名不能带斜杠，这里把路径压平成单层文件名；
 * 路径过长（Windows 260 字符限制）时截断并追加哈希，保证唯一。
 */
function assetNameFor(relative, suffix = '') {
  let name = `${relative.replace(/\//g, '__')}${suffix}`
  if (name.length <= 120) return name
  const hash = crypto.createHash('sha1').update(relative).digest('hex').slice(0, 8)
  const ext = path.extname(name)
  return `${name.slice(0, 100)}-${hash}${ext}`
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

function zipDirectory(srcDir, zipPath) {
  rmrf(zipPath)

  // 优先用 bsdtar（Windows 10 1803+ 自带，比 Compress-Archive 快很多）
  try {
    execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', srcDir, '.'], { stdio: 'ignore' })
    if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 0) return 'tar'
  } catch (error) { /* 继续尝试 PowerShell */ }

  const escapedSrc = srcDir.replace(/'/g, "''")
  const escapedZip = zipPath.replace(/'/g, "''")
  execFileSync('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -Path '${escapedSrc}\\*' -DestinationPath '${escapedZip}' -CompressionLevel Optimal -Force`
  ], { stdio: 'inherit' })
  return 'powershell'
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

  // 3. 收集补丁文件（resources 下的全部文件，等于「代码 + 运行时资源」完整覆盖）
  step('计算补丁文件')
  const collected = walkFiles(RESOURCES_DIR)
  const files = []
  let totalSize = 0
  for (const item of collected) {
    const info = await describeFile(item.full)
    files.push({
      relative: item.relative,
      full: item.full,
      size: info.size,
      sha256: info.sha256
    })
    totalSize += info.size
  }
  files.sort((a, b) => (a.relative === 'app.asar' ? -1 : b.relative === 'app.asar' ? 1 : a.relative.localeCompare(b.relative)))
  log(`  ${files.length} 个文件，合计 ${formatBytes(totalSize)}`)

  // 4. 建输出目录
  const outDir = path.join(OUT_ROOT, `v${version}`)
  const assetsDir = path.join(outDir, 'release-assets')
  const updateBranchDir = path.join(outDir, 'update-branch')
  rmrf(outDir)
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.mkdirSync(updateBranchDir, { recursive: true })

  // 5. 复制补丁文件（压平命名）
  step('整理补丁资源')
  const patchEntries = []
  if (!noPatch) {
    const usedNames = new Set()
    for (const file of files) {
      let asset = assetNameFor(file.relative)
      if (usedNames.has(asset.toLowerCase())) {
        // 极少数情况下两条路径压平后会重名，追加短哈希区分
        const hash = crypto.createHash('sha1').update(file.relative).digest('hex').slice(0, 8)
        asset = `${path.basename(asset, path.extname(asset))}-${hash}${path.extname(asset)}`
      }
      usedNames.add(asset.toLowerCase())
      fs.copyFileSync(file.full, path.join(assetsDir, asset))
      patchEntries.push({
        path: file.relative,
        asset,
        size: file.size,
        sha256: file.sha256
      })
    }
    log(`  ${patchEntries.length} 个补丁文件已复制到 release-assets/`)
  } else {
    log('  已跳过补丁（--no-patch），本次只发完整包')
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
      log(`  ⚠ 完整包打包失败：${error.message}（不影响补丁）`)
    }
  } else {
    log('\n  跳过完整包（--nozip）')
  }

  // 7. 生成 latest.json
  step('生成 latest.json')
  const notes = buildNotes()
  const manifest = {
    schema: 1,
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
    patch: noPatch ? null : {
      minVersion: patchFrom,
      totalSize,
      files: patchEntries.map((item) => ({
        path: item.path,
        asset: item.asset,
        size: item.size,
        sha256: item.sha256
      })),
      remove: []
    },
    full: fullInfo
  }

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  fs.writeFileSync(path.join(updateBranchDir, 'latest.json'), manifestText, 'utf8')
  // Release 附件里也放一份：客户端主清单拉不到时，会用 GitHub API 找到它兜底
  fs.writeFileSync(path.join(assetsDir, 'latest.json'), manifestText, 'utf8')
  log(`  补丁 ${patchEntries.length} 个文件 / ${formatBytes(totalSize)}`)

  // 8. 上传说明
  writeUploadGuide(outDir, {
    version,
    patchCount: patchEntries.length,
    totalSize,
    fullInfo
  })

  // 9. 汇总
  log('\n============================================')
  log('  完成，待上传目录：')
  log(`  ${path.relative(ROOT, outDir)}`)
  log('')
  log('  1) release-assets/  →  全部上传到 GitHub Release（tag: v' + version + '）')
  log('  2) update-branch/latest.json  →  提交到 update 分支')
  log('')
  log(`  补丁体积: ${formatBytes(totalSize)}`)
  if (fullInfo) log(`  完整包:   ${formatBytes(fullInfo.size)}`)
  log('============================================\n')
}

function writeUploadGuide(outDir, info) {
  const lines = [
    `# v${info.version} 发布清单`,
    '',
    '## 1. 上传到 GitHub Release',
    '',
    `1. 打开 ${RELEASE_PAGE}/new，Tag 填 \`v${info.version}\`，标题随意`,
    `2. 把 \`release-assets/\` 里的**所有文件**拖进附件区`,
    '3. 发布 Release',
    '',
    `> 共 ${info.patchCount} 个补丁文件（${formatBytes(info.totalSize)}）` + (info.fullInfo
      ? ` + 1 个完整包（${formatBytes(info.fullInfo.size)}）`
      : ''),
    '',
    '## 2. 更新版本清单（客户端靠它判断有没有新版本）',
    '',
    '把 `update-branch/latest.json` 提交到仓库的 `update` 分支根目录：',
    '',
    '```bash',
    `git fetch origin`,
    `git checkout update   # 第一次：git checkout --orphan update && git rm -rf . `,
    `cp release_upload/v${info.version}/update-branch/latest.json ./latest.json`,
    `git add latest.json && git commit -m "release v${info.version}" && git push origin update`,
    '```',
    '',
    '## 3. 客户端会怎么做',
    '',
    '1. 依次尝试 `ghfast.top` / `gh-proxy.com` / `gitmirror` / `raw.githubusercontent.com` / `jsDelivr` 读取 latest.json',
    '2. 语义化版本比对（同版本再比 build 号）',
    '3. 下载补丁，边下边校验 sha256，失败自动换下一个镜像',
    '4. 校验通过后提示「重启并安装」→ 退出 → 独立进程替换 app.asar → 自动重启',
    '',
    '> 如果某次改动涉及 Electron 版本 / exe / dll，请用 `--patch-from <新版本>` 重新发布，',
    '> 让老版本走完整包下载，避免只换 resources 导致版本错配。'
  ]
  fs.writeFileSync(path.join(outDir, 'UPLOAD.md'), `${lines.join('\n')}\n`, 'utf8')
}

main().catch((error) => {
  fail(error && error.stack ? error.stack : String(error))
})
