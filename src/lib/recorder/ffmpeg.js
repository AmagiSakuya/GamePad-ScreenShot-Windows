'use strict'

/**
 * FFmpeg 定位与能力探测。
 *
 * 为什么要探测而不是写死：
 * 同一份 ffmpeg.exe 在不同机器上的可用编码器完全取决于驱动 ——
 * 没有 N 卡就没有 nvenc，装了 Intel 驱动才有 qsv，笔记本双显卡还可能出现
 * 「qsv 能初始化但 MFX session 建不起来」这种半可用状态。
 * 所以「能不能用」只能靠真跑一次来回答，配置表里写的都只是候选。
 */

const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

// 一次探测的结果在进程内复用：ffmpeg -encoders 要 200ms 左右，
// 每次打开设置页都跑一遍太浪费。
let cachedPath = null
let cachedCapabilities = null

/**
 * 找到内置的 ffmpeg.exe。
 * 打包后走 extraResources（resources/ffmpeg/ffmpeg.exe），
 * 开发期直接用工程里的 vendor 目录。
 */
function resolveFfmpegPath({ isPackaged, resourcesPath, appPath }) {
    if (cachedPath && fs.existsSync(cachedPath)) return cachedPath

    const candidates = isPackaged
        ? [
            path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
            path.join(resourcesPath, 'ffmpeg.exe')
        ]
        : [
            path.join(appPath, 'vendor', 'ffmpeg', 'ffmpeg.exe'),
            // 开发期 webpack 把主进程输出到 dist_electron，__dirname 在那里；
            // 万一 appPath 不是项目根（比如被当成 library 加载），靠这两条兜底
            path.join(__dirname, '..', '..', 'vendor', 'ffmpeg', 'ffmpeg.exe'),
            path.join(process.cwd(), 'vendor', 'ffmpeg', 'ffmpeg.exe')
        ]

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedPath = candidate
            return candidate
        }
    }
    throw new Error(`ffmpeg.exe not found, looked in: ${candidates.join(' | ')}`)
}

/**
 * 跑一次 ffmpeg 并收集输出。所有探测都走这里，统一超时与错误形态。
 */
function run(exe, args, timeout = 20000) {
    return new Promise((resolve) => {
        execFile(exe, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
            resolve({
                ok: !error,
                timedOut: !!(error && error.killed),
                code: error && typeof error.code === 'number' ? error.code : (error ? 1 : 0),
                stdout: stdout || '',
                stderr: stderr || '',
                message: error ? String(error.message || error) : ''
            })
        })
    })
}

/** 解析 `ffmpeg -encoders` 里所有视频编码器 id */
function parseVideoEncoders(text) {
    const ids = new Set()
    for (const line of String(text).split(/\r?\n/)) {
        // 行首是 6 位能力标志，第一个字符 V 表示视频编码器
        const m = line.match(/^\s+V\S{5}\s+(\S+)/)
        if (m) ids.add(m[1])
    }
    return ids
}

/** 解析 `ffmpeg -filters` 里是否存在某个 filter */
function hasFilter(text, name) {
    return new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(String(text))
}

// `-progress pipe:2` 的采样也写在 stderr 里（frame= / fps= / speed= / progress=…），
// 直接取「最后两行」拿到的全是进度信息 —— 用户看到的就是
// 「失败：drop_frames=0 speed=N/A progress=end」，真正的报错被埋在几百行上面。
const PROGRESS_LINE = /^[a-z_]+=/

/**
 * 从 ffmpeg 的 stderr 里提炼人话级的失败原因。
 * 去掉进度采样行、把超长行（filtergraph 会把上百种像素格式一次列出来）截断。
 */
function errorTail(stderr, message, limit = 3) {
    const lines = String(stderr || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !PROGRESS_LINE.test(line))
        .map((line) => (line.length > 200 ? `${line.slice(0, 200)}…` : line))
    if (lines.length === 0) return String(message || '').slice(0, 300)
    return lines.slice(-limit).join(' ').slice(0, 400)
}

/**
 * 探测一次：版本、可用视频编码器、关键采集滤镜。
 * 结果缓存，force = true 可强制重测。
 */
async function probeCapabilities(exe, { force = false } = {}) {
    if (cachedCapabilities && !force) return cachedCapabilities

    const version = await run(exe, ['-hide_banner', '-version'], 8000)
    if (!version.ok) {
        throw new Error(`ffmpeg not runnable: ${version.message || version.stderr.slice(0, 200)}`)
    }
    const versionLine = (version.stdout.split(/\r?\n/)[0] || '').trim()
    const versionMatch = versionLine.match(/ffmpeg version (\S+)/i)

    const encodersOut = await run(exe, ['-hide_banner', '-encoders'], 15000)
    const filtersOut = await run(exe, ['-hide_banner', '-filters'], 15000)

    cachedCapabilities = {
        version: versionMatch ? versionMatch[1] : versionLine,
        versionLine,
        // 只有真正编译进来的编码器才会出现在这里；
        // 能不能跑起来还要靠 selfTest 逐个确认。
        videoEncoders: Array.from(parseVideoEncoders(encodersOut.stdout)),
        filters: {
            ddagrab: hasFilter(filtersOut.stdout, 'ddagrab'),
            gfxcapture: hasFilter(filtersOut.stdout, 'gfxcapture')
        }
    }
    return cachedCapabilities
}

/**
 * 单个编码器的可用性自检（只验证「编码器本体能不能工作」，不涉及采集）。
 * 用 0.2 秒纯色帧，跑得快，失败也不会留下文件。
 */
async function testEncoder(exe, encoderId) {
    const result = await run(exe, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30:d=0.2',
        '-c:v', encoderId,
        '-f', 'null', '-'
    ], 15000)

    if (result.ok) return { ok: true, reason: '' }
    return { ok: false, reason: errorTail(result.stderr, result.message) }
}

/**
 * 单个采集后端的可用性自检。
 * 只抓 2 帧就退出 —— 桌面完全静止时 ddagrab 可能一帧都不出，
 * 所以「超时且 0 帧」不算失败，只有明确报错才算。
 */
async function testBackend(exe, backend, { displayIndex = 0, hwnd = 0 } = {}) {
    let inputArgs
    if (backend === 'ddagrab') {
        inputArgs = ['-f', 'lavfi', '-i', `ddagrab=output_idx=${displayIndex}:framerate=30`]
    } else if (backend === 'gfxcapture') {
        inputArgs = hwnd
            ? ['-f', 'lavfi', '-i', `gfxcapture=hwnd=${hwnd}:max_framerate=30`]
            : ['-f', 'lavfi', '-i', `gfxcapture=monitor_idx=${displayIndex}:max_framerate=30`]
    } else {
        inputArgs = ['-f', 'gdigrab', '-framerate', '30', '-i', 'desktop']
    }

    const result = await run(exe, [
        '-hide_banner', '-loglevel', 'error',
        ...inputArgs,
        '-frames:v', '2',
        '-f', 'null', '-'
    ], 15000)

    if (result.ok) return { ok: true, reason: '' }
    return { ok: false, reason: errorTail(result.stderr, result.message) }
}

/**
 * 端到端自检：真实采集 + 真实编码 + 真出帧。
 *
 * 这是「这套配置在我机器上到底行不行」的唯一可信答案 ——
 * 编码器单独能跑、采集单独能跑，拼在一起仍然可能因为
 * 硬件帧格式不匹配而 0 帧（实测 ddagrab + qsv 就是这种情况）。
 *
 * @returns {{ ok, frames, dropFrames, speed, error }}
 */
async function selfTestPipeline(exe, { inputArgs, videoArgs, filters, durationSeconds = 1.5 }) {
    const args = [
        '-hide_banner', '-loglevel', 'error', '-nostats',
        '-progress', 'pipe:2',
        ...inputArgs
    ]
    if (filters && filters.length) args.push('-vf', filters.join(','))
    args.push(...videoArgs)
    args.push('-t', String(durationSeconds), '-f', 'null', '-')

    const result = await run(exe, args, Math.max(15000, durationSeconds * 8000))

    const frames = pickNumber(result.stderr, 'frame')
    const dropFrames = pickNumber(result.stderr, 'drop_frames')
    // 用整段测试的 speed 中位数，而不是最后一个进度块 ——
    // 末尾那一个可能刚好是「画面静止后突然来一帧」的虚高值，
    // 运行时也是取中位数，两边口径必须一样
    const speed = median(pickAll(result.stderr, 'speed').filter((v) => v > 0))

    if (!result.ok && frames === 0) {
        return { ok: false, frames: 0, dropFrames: 0, speed: 0, error: errorTail(result.stderr, result.message) }
    }

    return {
        ok: frames > 0,
        frames,
        dropFrames,
        speed,
        error: frames > 0 ? '' : 'no frame produced'
    }
}

/**
 * 采集源能不能「打开」——只看打开这一步，不判帧数。
 *
 * 判据是 stderr 里有没有 "Error opening input" 这类硬错误：
 * 静止画面 0 帧是正常的（采集源「画面变化才出帧」），不能当失败。
 *
 * 用在窗口录制的后端选择上：Windows.Graphics.Capture 打不开某些窗口
 * （实测独占全屏的 Falcom 引擎游戏会直接 "Generic error in an external library"），
 * 那种情况要先探一下再决定换哪个后端，免得整段录制 0 帧退出。
 */
async function probeCaptureOpen(exe, inputArgs, { timeout = 8000 } = {}) {
    const result = await run(exe, [
        '-hide_banner',
        ...inputArgs,
        '-t', '1',
        '-frames:v', '1',
        '-f', 'null', '-'
    ], timeout)

    const text = `${result.stderr || ''}\n${result.message || ''}`
    const failed = /Error opening input|Error opening (file|device)|Could not open|Function not implemented/i.test(text)
    return { ok: !failed, reason: failed ? errorTail(result.stderr, result.message) : '' }
}

/**
 * 编码器吞吐测试（合成源）。
 *
 * 为什么不用真实采集来测：
 * ddagrab / gfxcapture 都是「画面有变化才出帧」，桌面静止时一秒能出 0 帧，
 * 于是 frames=0、speed=N/A，测试会被误判成「失败」——
 * 用户看到的就是「测试 NV 失败：drop_frames=0 speed=N/A」。
 *
 * 合成源（testsrc2）恒定出帧，测出来的 speed 才是编码器真实的吞吐能力，
 * 也才能回答「这套分辨率 + 帧率会不会过载」。
 */
async function testEncoderThroughput(exe, { videoArgs, width, height, fps, durationSeconds = 2 }) {
    const w = Math.max(2, Math.round(width || 1920));
    const h = Math.max(2, Math.round(height || 1080));
    const rate = Math.max(1, Math.round(fps || 60));

    const args = [
        '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:2',
        '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=${rate}`,
        '-t', String(durationSeconds),
        ...videoArgs,
        '-f', 'null', '-'
    ];

    const result = await run(exe, args, Math.max(20000, durationSeconds * 10000));
    const frames = pickNumber(result.stderr, 'frame');
    const dropFrames = pickNumber(result.stderr, 'drop_frames');
    const speed = pickNumber(result.stderr, 'speed');
    let actualFps = pickNumber(result.stderr, 'fps');

    // 编码比实时快很多时（比如 1080p30 用 x264），ffmpeg 的 fps 字段会是 N/A，
    // 这时候用「出帧数 / 测试时长」反推，否则 UI 上会显示 0fps
    if (!actualFps && frames > 0 && durationSeconds > 0) {
        actualFps = frames / durationSeconds;
    }

    if (!result.ok && frames === 0) {
        return { ok: false, frames: 0, fps: 0, speed: 0, dropFrames: 0, error: errorTail(result.stderr, result.message) };
    }

    return {
        // speed < 1 就是编码器喂不满目标帧率，会开始丢帧
        ok: frames > 0,
        frames,
        fps: actualFps,
        speed,
        dropFrames,
        error: ''
    };
}

/**
 * 采集连通性测试。
 *
 * 只回答「这个采集源在当前配置下能不能启动」，不判帧数 ——
 * 静止桌面 0 帧是正常的，不是错误。
 */
async function testCaptureChain(exe, { inputArgs, durationSeconds = 1 }) {
    const result = await run(exe, [
        '-hide_banner', '-loglevel', 'error',
        ...inputArgs,
        '-t', String(durationSeconds),
        '-f', 'null', '-'
    ], Math.max(12000, durationSeconds * 8000));

    // 静止桌面可能一帧都不出，ffmpeg 会一直等到 -t 结束，这属于正常；
    // 只有明确报错（设备打不开 / 参数不支持）才算失败
    if (result.ok || result.timedOut) return { ok: true, error: '' };
    return { ok: false, error: errorTail(result.stderr, result.message) };
}

/**
 * 抓一帧问出采集源的真实像素尺寸（ddagrab / gfxcapture 都有「画面变化才出帧」，
 * 但启动时一定会先给一帧，所以 -frames:v 1 能拿到 Stream 行）。
 *
 * 生产路径不靠它：主进程直接用 Electron 的显示器信息，
 * 省一次 ffmpeg 启动。这里给回归脚本和「元数据拿不到」的场景兜底。
 */
async function probeSourceSize(exe, { backend = 'ddagrab', displayIndex = 0, hwnd = 0 } = {}) {
    let inputArgs
    if (backend === 'gfxcapture') {
        inputArgs = hwnd
            ? ['-f', 'lavfi', '-i', `gfxcapture=hwnd=${hwnd}:max_framerate=30`]
            : ['-f', 'lavfi', '-i', `gfxcapture=monitor_idx=${displayIndex}:max_framerate=30`]
    } else {
        inputArgs = ['-f', 'lavfi', '-i', `ddagrab=output_idx=${displayIndex}:framerate=30`]
    }

    const result = await run(exe, [
        '-hide_banner',
        ...inputArgs,
        '-frames:v', '1',
        '-f', 'null', '-'
    ], 12000)

    const match = String(result.stderr).match(/Video: [^,]+, (?:\w+, )?(\d{2,5})x(\d{2,5})/)
    if (!match || !result.ok) return { width: 0, height: 0 }
    return { width: Number(match[1]) || 0, height: Number(match[2]) || 0 }
}

/** 从 -progress 输出里取最后一个 key=value */
function pickNumber(text, key) {
    const re = new RegExp(`^${key}=(.+)$`, 'gm')
    let last = null
    let m
    while ((m = re.exec(text)) !== null) last = m[1]
    if (last == null) return 0
    return parseFloat(String(last).replace('x', '')) || 0
}

/** 从 -progress 输出里取出某个 key 的所有取值（保留出现顺序） */
function pickAll(text, key) {
    const re = new RegExp(`^${key}=(.+)$`, 'gm')
    const values = []
    let m
    while ((m = re.exec(text)) !== null) {
        const value = parseFloat(String(m[1]).replace('x', ''))
        if (Number.isFinite(value)) values.push(value)
    }
    return values
}

/** 中位数：空数组返回 0，偶数个取偏小的那个（和 session.summarize 一致） */
function median(values) {
    if (!values || values.length === 0) return 0
    const sorted = values.slice().sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
}

module.exports = {
    resolveFfmpegPath,
    run,
    probeCapabilities,
    testEncoder,
    testBackend,
    selfTestPipeline,
    testEncoderThroughput,
    testCaptureChain,
    probeCaptureOpen,
    probeSourceSize,
    errorTail,
    pickNumber
}
