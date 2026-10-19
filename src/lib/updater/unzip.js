'use strict'

/**
 * 极简 ZIP 解包器
 *
 * 为什么自己写：
 *   热更新跑在 Electron 主进程里，不想为了解个 zip 引入 adm-zip / extract-zip
 *   这类依赖（还要打进 app.asar）。zip 的「存储 + deflate」两种压缩方式已经覆盖
 *   tar / Compress-Archive / 7z 产出的包，用 Node 自带的 zlib 就够了。
 *
 * 安全约束（补丁包是从网络下载的，必须当不可信输入处理）：
 *   - 拒绝绝对路径、盘符、`..`，不允许写到目标目录之外
 *   - 拒绝符号链接条目
 *   - 限制条目数量与解压后总体积，避免 zip 炸弹
 *
 * 不做 CRC32 校验：整个 zip 的 sha256 在下载时已经校验过，逐条再算一遍没有意义。
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

const MAX_ENTRIES = 20000
const MAX_TOTAL_SIZE = 1536 * 1024 * 1024

function readRange(fd, length, position) {
  if (length <= 0) return Buffer.alloc(0)
  const buffer = Buffer.allocUnsafe(length)
  let offset = 0
  while (offset < length) {
    const bytes = fs.readSync(fd, buffer, offset, length - offset, position + offset)
    if (!bytes) break
    offset += bytes
  }
  return offset === length ? buffer : buffer.subarray(0, offset)
}

/** 在文件尾部 64KB 内倒着找 EOCD（后面可能跟注释） */
function locateEocd(fd, fileSize) {
  const tailSize = Math.min(fileSize, 66 * 1024)
  const tailStart = fileSize - tailSize
  const tail = readRange(fd, tailSize, tailStart)
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      return {
        entries: tail.readUInt16LE(i + 10),
        cdSize: tail.readUInt32LE(i + 12),
        cdOffset: tail.readUInt32LE(i + 16)
      }
    }
  }
  throw new Error('不是有效的 zip 文件')
}

/** 只接受干净的相对路径，返回 '' 表示跳过 */
function normalizeEntryPath(name) {
  const normalized = String(name || '').replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalized || normalized.endsWith('/')) return ''
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return ''
  const parts = normalized.split('/').filter((part) => part && part !== '.')
  if (!parts.length || parts.includes('..')) return ''
  return parts.join('/')
}

/**
 * 解压到 destDir，返回 `[{ path, size, sha256 }]`（path 为相对路径）。
 */
function extractZip(zipPath, destDir) {
  const fd = fs.openSync(zipPath, 'r')
  const entries = []

  try {
    const fileSize = fs.fstatSync(fd).size
    const eocd = locateEocd(fd, fileSize)

    if (eocd.entries === 0xffff || eocd.cdOffset === 0xffffffff) {
      throw new Error('暂不支持 ZIP64 格式的补丁包')
    }
    if (eocd.entries > MAX_ENTRIES) {
      throw new Error(`补丁包条目过多（${eocd.entries}）`)
    }

    const cd = readRange(fd, eocd.cdSize, eocd.cdOffset)
    let cursor = 0
    let totalSize = 0

    while (cursor + 46 <= cd.length) {
      if (cd.readUInt32LE(cursor) !== CEN_SIG) break

      const flags = cd.readUInt16LE(cursor + 8)
      const method = cd.readUInt16LE(cursor + 10)
      const compressedSize = cd.readUInt32LE(cursor + 20)
      const uncompressedSize = cd.readUInt32LE(cursor + 24)
      const nameLength = cd.readUInt16LE(cursor + 28)
      const extraLength = cd.readUInt16LE(cursor + 30)
      const commentLength = cd.readUInt16LE(cursor + 32)
      const localOffset = cd.readUInt32LE(cursor + 42)
      const name = cd.toString('utf8', cursor + 46, cursor + 46 + nameLength)

      cursor += 46 + nameLength + extraLength + commentLength

      const relative = normalizeEntryPath(name)
      if (!relative) continue
      if (flags & 0x01) throw new Error(`补丁包包含加密条目: ${relative}`)
      // bit 3 = 大小写在数据描述符里，中央目录可能是 0
      if (flags & 0x08 && (!compressedSize || !uncompressedSize)) {
        throw new Error(`补丁包条目缺少大小信息: ${relative}`)
      }

      totalSize += uncompressedSize
      if (totalSize > MAX_TOTAL_SIZE) throw new Error('补丁包解压后体积异常')

      const local = readRange(fd, 30, localOffset)
      if (local.length < 30 || local.readUInt32LE(0) !== LOC_SIG) {
        throw new Error(`补丁包结构损坏: ${relative}`)
      }
      const localNameLength = local.readUInt16LE(26)
      const localExtraLength = local.readUInt16LE(28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength

      const raw = readRange(fd, compressedSize, dataStart)
      let data
      if (method === 0) {
        data = raw
      } else if (method === 8) {
        data = zlib.inflateRawSync(raw)
      } else {
        throw new Error(`不支持的压缩方式 ${method}: ${relative}`)
      }

      if (uncompressedSize && data.length !== uncompressedSize) {
        throw new Error(`解压后大小不符: ${relative}`)
      }

      const target = path.join(destDir, ...relative.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, data)

      entries.push({
        path: relative,
        size: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex')
      })
    }
  } finally {
    fs.closeSync(fd)
  }

  if (!entries.length) throw new Error('补丁包是空的')
  return entries
}

module.exports = { extractZip }
