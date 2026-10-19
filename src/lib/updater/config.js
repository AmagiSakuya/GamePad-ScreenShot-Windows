'use strict'

/**
 * 更新源配置
 *
 * 设计要点：
 * - 版本清单（latest.json）放在仓库的独立分支 update 上，不污染 master，也不用发 Release 就能改。
 * - 镜像前缀列表对「清单」和「release 资源」都生效：镜像站挂掉时按顺序自动换下一个。
 * - 清单里的 mirrors 字段可以覆盖这里的 ASSET_MIRRORS，所以以后换镜像不用重新发客户端。
 */

const REPO = 'AmagiSakuya/GamePad-ScreenShot-Windows'
const MANIFEST_BRANCH = 'update'
const MANIFEST_FILE = 'latest.json'

// GitHub 原始文件直链（国内经常不通，仅作为最后兜底）
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${MANIFEST_BRANCH}/${MANIFEST_FILE}`

/**
 * 清单获取顺序：国内可用性从高到低。
 * ghfast.top / gh-proxy.com / raw.gitmirror.com 都是「前缀 + 完整 URL」形式的加速代理。
 */
const MANIFEST_SOURCES = [
  `https://ghfast.top/${RAW_BASE}`,
  `https://gh-proxy.com/${RAW_BASE}`,
  `https://raw.gitmirror.com/${REPO}/${MANIFEST_BRANCH}/${MANIFEST_FILE}`,
  RAW_BASE,
  `https://cdn.jsdelivr.net/gh/${REPO}@${MANIFEST_BRANCH}/${MANIFEST_FILE}`
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

// GitHub API 兜底（清单全部拉不到时，用 API 拿 release 概要，再从资源里找 latest.json）
const GITHUB_API_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`

const RELEASE_DOWNLOAD_BASE = `https://github.com/${REPO}/releases/download`
const RELEASE_PAGE = `https://github.com/${REPO}/releases`
const PROJECT_HOME = `https://github.com/${REPO}`

// 热更新落地文件名（打包时由 scripts/release.js 生成，走 extraResources 复制到 resources/）
const HELPER_NAME = 'apply-update.js'
// 下载暂存目录（相对 resources）
const STAGING_DIR = '.update-staging'

module.exports = {
  REPO,
  MANIFEST_BRANCH,
  MANIFEST_FILE,
  MANIFEST_SOURCES,
  ASSET_MIRRORS,
  GITHUB_API_RELEASE,
  RELEASE_DOWNLOAD_BASE,
  RELEASE_PAGE,
  PROJECT_HOME,
  HELPER_NAME,
  STAGING_DIR
}
