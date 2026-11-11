'use strict'

/**
 * 更新源配置
 *
 * 设计要点：
 * - 清单（latest.json）直接作为附件放在 Release 里，用 GitHub 的
 *   `/releases/latest/download/<文件名>` 固定地址读，不需要再维护 update 分支，
 *   也不用发完 Release 再单独提交一次清单。
 * - 镜像前缀列表对「清单」和「补丁包」都生效：镜像站挂掉时按顺序自动换下一个。
 * - 清单里的 mirrors 字段可以覆盖这里的 ASSET_MIRRORS（仅「中国大陆加速」模式），
 *   所以以后换镜像不用重新发客户端；用户选择「GitHub」时则只走官方直连。
 */

const REPO = 'AmagiSakuya/GamePad-ScreenShot-Windows'
const MANIFEST_FILE = 'latest.json'

// GitHub 固定指向「最新一个正式 Release」的附件，地址本身不变，内容随 Release 更新
const LATEST_RELEASE_BASE = `https://github.com/${REPO}/releases/latest/download`
const LATEST_MANIFEST = `${LATEST_RELEASE_BASE}/${MANIFEST_FILE}`

/**
 * 清单获取顺序：国内可用性从高到低。
 * ghfast.top / gh-proxy.com / ghproxy.net 都是「前缀 + 完整 URL」形式的加速代理，
 * 它们会把 /releases/latest/download/xxx 的 302 一起跟完，所以能直接拿到最终内容。
 */
const MANIFEST_SOURCES = [
  `https://ghfast.top/${LATEST_MANIFEST}`,
  `https://gh-proxy.com/${LATEST_MANIFEST}`,
  `https://ghproxy.net/${LATEST_MANIFEST}`,
  LATEST_MANIFEST
]

/**
 * Release 资源下载加速前缀（'' 表示直连官方）。
 * 顺序即优先级：先走加速，再直连。
 */
const ASSET_MIRRORS = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://ghproxy.net/',
  ''
]

/**
 * 用户可选的更新源：
 * - mirror：中国大陆加速源优先，全部失败后回退 GitHub 直连（默认，国内可用性最高）
 * - github：只走 GitHub 官方直连（海外用户 / 使用代理时更快，也不会经过第三方镜像）
 */
const UPDATE_SOURCE_MIRROR = 'mirror'
const UPDATE_SOURCE_GITHUB = 'github'
const UPDATE_SOURCE_DEFAULT = UPDATE_SOURCE_MIRROR

function normalizeUpdateSource(value) {
  return value === UPDATE_SOURCE_GITHUB ? UPDATE_SOURCE_GITHUB : UPDATE_SOURCE_MIRROR
}

/**
 * 按用户设置返回本次检查 / 下载要用的源列表。
 * github 模式下不再接受清单里的 mirrors 覆盖，避免又绕回第三方镜像。
 */
function getUpdateSourceConfig(value) {
  if (normalizeUpdateSource(value) === UPDATE_SOURCE_GITHUB) {
    return {
      manifestSources: [LATEST_MANIFEST],
      assetMirrors: [''],
      useManifestMirrors: false
    }
  }
  return {
    manifestSources: MANIFEST_SOURCES,
    assetMirrors: ASSET_MIRRORS,
    useManifestMirrors: true
  }
}

// GitHub API 兜底（清单全部拉不到时，用 API 拿 release 概要，再从资源里找 latest.json）
const GITHUB_API_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`

const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`
const RELEASE_PAGE = `https://github.com/${REPO}/releases`
const PROJECT_HOME = `https://github.com/${REPO}`

// 热更新落地文件名（打包时由 scripts/release.js 生成，走 extraResources 复制到 resources/）
const HELPER_NAME = 'apply-update.js'
// 下载暂存目录（相对 resources）
const STAGING_DIR = '.update-staging'

// 补丁包格式：2 = 单个 update-x.y.z.zip（1 = 老方案，逐文件上传）
const PATCH_FORMAT = 2

module.exports = {
  REPO,
  MANIFEST_FILE,
  LATEST_RELEASE_BASE,
  MANIFEST_SOURCES,
  ASSET_MIRRORS,
  UPDATE_SOURCE_MIRROR,
  UPDATE_SOURCE_GITHUB,
  UPDATE_SOURCE_DEFAULT,
  normalizeUpdateSource,
  getUpdateSourceConfig,
  GITHUB_API_RELEASE,
  RELEASE_DOWNLOAD_BASE,
  RELEASE_PAGE,
  PROJECT_HOME,
  HELPER_NAME,
  STAGING_DIR,
  PATCH_FORMAT
}
