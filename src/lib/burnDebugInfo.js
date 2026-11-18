'use strict'

/**
 * DebugInfo（实验性功能）：把调试信息直接「烧」进截图像素里。
 *
 * 目前只烧截图延迟 —— 目的是回答「按下按键到画面真的被抓下来，中间隔了多久」。
 * 之所以烧进图片而不是写在文件名或日志里：延迟这件事必须由那张图自己说话，
 * 图发到群里、贴进工单时数字还在，不会跟文件走散。
 *
 * 实现走项目自带的 ffmpeg（vendor/ffmpeg/ffmpeg.exe，录像引擎那份），
 * 用它的 drawtext 滤镜。好处是不用为了写几个字再引一个图像库：
 * 主进程本来没有 PNG/JPEG 编解码能力，nativeImage 也只认「转格式」不会写字。
 *
 * 几处细节值得说明：
 *   · 每行一个 drawtext，靠 y 偏移排布。drawtext 的 text 里换行转义在不同 ffmpeg
 *     构建上表现不一致（测过：`\n` 会被吃成一个字面 n），分行拼滤镜最稳。
 *   · 字号按图片高度换算，4K 截图和 800×450 的小窗口都能看清、也不糊满画面。
 *   · 字体优先找带汉字的（微软雅黑 → 黑体 → 宋体 → 等宽），
 *     截图里的延迟标签是母语的，找不到带汉字的字体就退回 drawtext 默认字体。
 *   · 任何失败（ffmpeg 缺失、滤镜失败、超时）只记日志并返回 null，
 *     调用方拿到 null 就保存原始截图 —— 调试信息不该把截图本身弄没。
 */

const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

/** 实验性功能开关（存档键名） */
const DEBUG_INFO_KEY = 'debugInfo'

/** 字体候选：先找能显示汉字的，再退到拉丁字体 */
const FONT_CANDIDATES = [
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/msyhbd.ttc',
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/simsun.ttc',
  'C:/Windows/Fonts/consola.ttf',
  'C:/Windows/Fonts/arial.ttf',
  // 非 Windows 的兜底（本项目主要面向 Windows，这两条只是不让别的平台直接没字体）
  '/System/Library/Fonts/PingFang.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
]

/** 一次烧录的超时：1080p 实测约 150ms，给 8 秒是防止磁盘/进程异常把截图卡住 */
const BURN_TIMEOUT_MS = 8000

let cachedFontPath = null

function isDebugInfoEnabled(configStore) {
  const value = configStore.get(DEBUG_INFO_KEY, false)
  return value === true || value === 'true'
}

/** 找一次可用字体，找不到返回 null（让 drawtext 用它自己的默认字体） */
function resolveFontPath() {
  if (cachedFontPath !== null) return cachedFontPath
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      cachedFontPath = candidate
      return cachedFontPath
    }
  }
  cachedFontPath = ''
  return cachedFontPath
}

/**
 * 滤镜文本转义。
 * 反斜杠要写成两个（滤镜解析吃一层，剩下的一层才是文字里的反斜杠）；
 * 冒号 / 百分号 / @ / 单引号 / 分号在滤镜串里都有语法含义，一律前置反斜杠。
 */
function escapeFilterText(raw) {
  let out = ''
  for (const ch of String(raw)) {
    if (ch === '\\') {
      out += '\\\\'
      continue
    }
    if (ch === ':' || ch === '%' || ch === '@' || ch === "'" || ch === ';') out += '\\'
    out += ch
  }
  return out
}

/** 滤镜里的路径：反斜杠统一换成正斜杠，盘符的冒号再转义掉（C\:/Windows/…） */
function escapeFilterPath(target) {
  return String(target).replace(/\\/g, '/').replace(/:/g, '\\:')
}

/**
 * 读图片自身的宽高（PNG 的 IHDR / JPEG 的 SOF 段）。
 * 之所以自己解析而不是再问一次 ffmpeg：多起一个进程只为拿两个数字，
 * 比烧录本身还慢，而字号必须按高度先算出来。
 */
function readImageSize(buffer, format) {
  if (!buffer || buffer.length < 24) return null
  try {
    if (format === 'png') {
      // 89 50 4E 47 0D 0A 1A 0A | 4 字节长度 | "IHDR" | width(4) height(4)
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50) return null
      const width = buffer.readUInt32BE(16)
      const height = buffer.readUInt32BE(20)
      if (width > 0 && height > 0) return { width, height }
      return null
    }

    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue }
      const marker = buffer[offset + 1]
      // SOF0–SOF15，跳过 DHT(C4) / 保留(C8) / DAC(CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buffer.readUInt16BE(offset + 5)
        const width = buffer.readUInt16BE(offset + 7)
        if (width > 0 && height > 0) return { width, height }
        return null
      }
      const segmentLength = buffer.readUInt16BE(offset + 2)
      if (segmentLength < 2) return null
      offset += 2 + segmentLength
    }
  } catch (error) {
    return null
  }
  return null
}

/** 字号：高度 / 21.6 上下夹住（1080 → 50px，2160 → 64px，450 → 21px） */
function pickFontSize(height) {
  return Math.min(64, Math.max(14, Math.round(height / 21.6)))
}

/** 每行一个 drawtext，y 逐行下移 */
function buildDrawTextFilters(lines, { fontPath, fontSize, margin }) {
  const boxBorder = Math.max(4, Math.round(fontSize * 0.24))
  const lineHeight = fontSize + Math.max(2, Math.round(fontSize * 0.22))
  const fontOption = fontPath ? `fontfile='${escapeFilterPath(fontPath)}':` : ''

  return lines.map((line, index) => {
    const y = margin + index * lineHeight
    return `drawtext=${fontOption}text='${escapeFilterText(line)}'`
      + `:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=${boxBorder}`
      + `:x=${margin}:y=${y}`
  }).join(',')
}

/**
 * 把若干行文字烧进截图。
 *
 * @param {Buffer} buffer  抓屏得到、已经编码好的图（png / jpg 的字节）
 * @param {'png'|'jpg'} format
 * @param {string[]} lines  要显示的行（最多 4 行，多出来的截掉）
 * @param {{ffmpegPath: string, tempDir: string, log?: object}} options
 * @returns {Promise<Buffer|null>} 烧好的同一格式字节；失败返回 null
 */
async function burnDebugInfo(buffer, format, lines, { ffmpegPath, tempDir, log }) {
  const report = (method, ...args) => {
    if (log && typeof log[method] === 'function') log[method](...args)
  }

  if (!buffer || !buffer.length) return null
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    report('warn', '[DebugInfo] 找不到内置 ffmpeg，跳过烧录');
    return null
  }
  const contentLines = (lines || []).filter(Boolean).slice(0, 4)
  if (!contentLines.length) return null

  const size = readImageSize(buffer, format)
  if (!size) {
    report('warn', '[DebugInfo] 读不到截图尺寸，跳过烧录');
    return null
  }

  const fontSize = pickFontSize(size.height)
  const margin = Math.max(8, Math.round(fontSize * 0.45))
  const filter = buildDrawTextFilters(contentLines, { fontPath: resolveFontPath(), fontSize, margin })

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const inputPath = path.join(tempDir, `debuginfo-in-${stamp}.${format}`)
  const outputPath = path.join(tempDir, `debuginfo-out-${stamp}.${format}`)

  try {
    fs.writeFileSync(inputPath, buffer)
  } catch (error) {
    report('error', '[DebugInfo] 写临时文件失败:', error);
    return null
  }

  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-i', inputPath]
    // JPEG 用高画质档（1 最好，2 接近无损）：截图本来已经被 JPEG 压过一遍，
    // 再默认 -q:v 30 会让第二次编码把画面压得更糊
    if (format === 'jpg') args.push('-q:v', '2')
    args.push('-vf', filter, '-y', outputPath)

    const result = await new Promise((resolve) => {
      execFile(ffmpegPath, args, { timeout: BURN_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          resolve({ error, stderr: stderr || '' })
        })
    })

    if (result.error || !fs.existsSync(outputPath)) {
      report('warn', '[DebugInfo] 烧录失败:', (result.stderr || (result.error && result.error.message) || '').slice(0, 400));
      return null
    }

    const burned = fs.readFileSync(outputPath)
    if (!burned || burned.length === 0) return null
    return burned
  } catch (error) {
    report('error', '[DebugInfo] 烧录异常:', error);
    return null
  } finally {
    // 临时文件是截图副本，留在 temp 目录只会越攒越多，成功失败都清掉
    for (const target of [inputPath, outputPath]) {
      try {
        if (target && fs.existsSync(target)) fs.unlinkSync(target)
      } catch (error) {
        // 被占用就算了，temp 目录的事不该影响截图
      }
    }
  }
}

module.exports = {
  DEBUG_INFO_KEY,
  isDebugInfoEnabled,
  burnDebugInfo,
  // 暴露给自检脚本 / 单测
  readImageSize,
  escapeFilterText,
  pickFontSize
}
