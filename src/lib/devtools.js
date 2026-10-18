'use strict'

/**
 * 开发环境 Vue DevTools 加载器（中国大陆网络友好版）
 *
 * 背景：
 *   electron-devtools-installer 默认会去 clients2.google.com 下载 crx 包，
 *   国内网络基本连不上，于是每次 `npm run electron:serve` 启动时都会刷：
 *     Failed to fetch extension, trying 4 more times
 *     Failed to fetch extension, trying 3 more times ...
 *   而且它会 await 在主进程 ready 里，白白拖慢启动。
 *
 * 现在的策略：只认「本地已解压好的扩展目录」，全程不联网、不重试、不阻塞。
 *   1) <项目根>/devtools-extension    —— 用 `npm run devtools:fetch` 下载，或手动解压到这里
 *   2) userData/extensions/<扩展ID>   —— electron-devtools-installer 的缓存位置（兼容老缓存）
 * 都没有就静默跳过，只打一行提示，绝不影响开发。
 *
 * 注意：Electron 13（Chromium 91）只支持 Manifest V2 扩展。
 *       Vue DevTools 6.6+ 是 MV3，即使下载下来也加载不了，脚本里会给出提示。
 */

const fs = require('fs')
const path = require('path')

/** Vue DevTools 3.x（Chrome 商店 ID），仅用于兼容旧缓存目录 */
const VUE3_EXTENSION_ID = 'ljjemllljcmogpfapbkkighbhhppjdbg'

function getCandidateDirs(app) {
  const dirs = []
  // 开发环境主进程产物在 dist_electron，上一级就是项目根目录
  dirs.push(path.join(__dirname, '..', 'devtools-extension'))
  dirs.push(path.join(__dirname, 'devtools-extension'))
  dirs.push(path.join(process.cwd(), 'devtools-extension'))
  try {
    dirs.push(path.join(app.getAppPath(), 'devtools-extension'))
    dirs.push(path.join(app.getPath('userData'), 'extensions', VUE3_EXTENSION_ID))
  } catch (e) {
    // app 未 ready 时 getPath 可能抛错，忽略即可
  }
  return dirs
}

/** 找到第一个带 manifest.json 的本地扩展目录 */
function findLocalExtension(app) {
  for (const dir of getCandidateDirs(app)) {
    try {
      if (fs.existsSync(path.join(dir, 'manifest.json'))) {
        return dir
      }
    } catch (e) {
      // 目录不存在 / 无权限，继续找下一个
    }
  }
  return null
}

/**
 * 加载本地 Vue DevTools 扩展。
 * 任何异常都会被吞掉（只记日志），保证开发模式一定能正常启动。
 * @returns {Promise<object|null>} 加载成功返回 Electron.Extension，否则 null
 */
async function installDevtoolsSafe({ app, session, isDevelopment }) {
  if (!isDevelopment) {
    return null
  }

  const extensionDir = findLocalExtension(app)
  if (!extensionDir) {
    // 只提示一次，不重试、不联网
    console.log('[devtools] 未检测到本地 Vue DevTools 扩展，已跳过加载（不影响开发）。')
    console.log('[devtools] 需要 Vue 调试面板时执行: npm run devtools:fetch')
    return null
  }

  try {
    const extension = await session.defaultSession.loadExtension(extensionDir, {
      allowFileAccess: true
    })
    console.log(`[devtools] 已加载本地扩展: ${extension.name} v${extension.version}`)
    return extension
  } catch (error) {
    console.warn(`[devtools] 本地扩展加载失败（${extensionDir}）: ${error && error.message}`)
    console.warn('[devtools] 提示: Electron 13 只支持 Manifest V2 扩展，MV3 版本的 DevTools 无法加载。')
    return null
  }
}

module.exports = {
  installDevtoolsSafe,
  findLocalExtension,
  VUE3_EXTENSION_ID
}
