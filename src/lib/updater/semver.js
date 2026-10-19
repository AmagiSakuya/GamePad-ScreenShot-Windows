'use strict'

/**
 * 版本号解析与比较
 *
 * 支持 `1.2.3`、`v1.2.3`、`1.2`、`1.2.3-beta.2`、`1.2.3+build5`。
 * 预发布版本按 semver 规则排序：1.0.0-beta.1 < 1.0.0-beta.2 < 1.0.0。
 */

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseVersion(input) {
  const match = String(input == null ? '' : input).trim().match(VERSION_RE)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    pre: match[4] ? match[4].split('.') : []
  }
}

function isPrerelease(input) {
  const parsed = parseVersion(input)
  return !!parsed && parsed.pre.length > 0
}

/** 比较单个预发布标识：数字段按数值比，字母段按字典序，数字段永远小于字母段 */
function comparePreToken(a, b) {
  const numA = /^\d+$/.test(a)
  const numB = /^\d+$/.test(b)
  if (numA && numB) return Number(a) - Number(b) > 0 ? 1 : (Number(a) === Number(b) ? 0 : -1)
  if (numA) return -1
  if (numB) return 1
  return a === b ? 0 : (a > b ? 1 : -1)
}

/** 返回 1 / 0 / -1；无法解析的版本视为最小 */
function compareVersions(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va && !vb) return 0
  if (!va) return -1
  if (!vb) return 1

  for (const key of ['major', 'minor', 'patch']) {
    if (va[key] > vb[key]) return 1
    if (va[key] < vb[key]) return -1
  }

  // 正式版 > 同号预发布版
  if (!va.pre.length && vb.pre.length) return 1
  if (va.pre.length && !vb.pre.length) return -1

  const len = Math.max(va.pre.length, vb.pre.length)
  for (let i = 0; i < len; i++) {
    const tokenA = va.pre[i]
    const tokenB = vb.pre[i]
    if (tokenA === undefined) return -1
    if (tokenB === undefined) return 1
    const cmp = comparePreToken(tokenA, tokenB)
    if (cmp !== 0) return cmp > 0 ? 1 : -1
  }
  return 0
}

/** 规整成 `1.2.3` / `1.2.3-beta.1`，用于展示 */
function normalizeVersion(input) {
  const parsed = parseVersion(input)
  if (!parsed) return String(input || '').replace(/^v/i, '')
  const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  return parsed.pre.length ? `${core}-${parsed.pre.join('.')}` : core
}

module.exports = { parseVersion, compareVersions, normalizeVersion, isPrerelease }
