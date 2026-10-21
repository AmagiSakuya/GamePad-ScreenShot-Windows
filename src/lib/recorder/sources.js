'use strict'

/**
 * 采集源：把「录屏幕 / 录某个窗口」翻译成 ffmpeg 的输入参数。
 *
 * 三种后端，能力从强到弱：
 *
 *   ddagrab    — DXGI Desktop Duplication。直读 GPU 前台缓冲，
 *                独占全屏的游戏也能抓到，输出 D3D11 纹理，可以零拷贝进 NVENC。
 *                限制：一次只能录一个显示器，不能按窗口录。
 *
 *   gfxcapture — Windows.Graphics.Capture（FFmpeg 8.1 新增）。
 *                能按窗口抓，窗口被别的窗口挡住也能拿到真实帧；
 *                也能按显示器抓。游戏用「无边框窗口」时表现最好。
 *
 *   gdigrab    — 老 GDI。只能抓桌面合成后的画面，
 *                GPU 直接渲染的内容（游戏、硬件加速的视频）会黑屏，仅作兜底。
 *
 * 实测（RTX 5070 Ti + UHD 770，Windows）：
 *   gfxcapture 和 ddagrab 输出的都是 `wrapped_avframe, d3d11`，
 *   所以「要不要 hwdownload」这件事跟采集后端无关，只跟编码器有关。
 */

const BACKENDS = {
    DDAGRAB: 'ddagrab',
    GFXCAPTURE: 'gfxcapture',
    GDIGRAB: 'gdigrab'
}

// lavfi 的 filter 字符串用 ':' 分隔参数，值里的特殊字符必须转义，
// 否则一个含冒号的窗口标题就能让整条命令解析失败。
function escapeFilterValue(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/,/g, '\\,')
}

/**
 * 构造采集输入。
 *
 * @param {object} target
 *   { type: 'screen', displayIndex: 0 }
 *   { type: 'window', hwnd: 123456 }          ← active-win 返回的 id 就是 HWND
 * @param {object} options
 *   { fps, cursor, backend }                   backend 可选，不传就按 target 自动选
 * @returns {{ args: string[], backend: string, hardwareFrames: boolean }}
 */
function buildCaptureInput(target = {}, options = {}) {
    const fps = Math.max(1, Math.round(options.fps || 60))
    const cursor = options.cursor === false ? 0 : 1
    const type = target.type === 'window' ? 'window' : 'screen'

    let backend = options.backend
    if (!backend) {
        // 窗口只能走 gfxcapture（ddagrab 没有窗口概念）；
        // 显示器优先 ddagrab —— 它有 GPU 零拷贝路径，且能抓独占全屏。
        backend = type === 'window' ? BACKENDS.GFXCAPTURE : BACKENDS.DDAGRAB
    }

    if (backend === BACKENDS.DDAGRAB) {
        if (type === 'window') {
            throw new Error('ddagrab cannot capture a single window')
        }
        const index = Math.max(0, Number(target.displayIndex) || 0)
        const params = [
            `output_idx=${index}`,
            `framerate=${fps}`,
            `draw_mouse=${cursor}`
        ]
        return {
            args: ['-f', 'lavfi', '-i', `ddagrab=${params.join(':')}`],
            backend,
            hardwareFrames: true
        }
    }

    if (backend === BACKENDS.GFXCAPTURE) {
        const params = [`max_framerate=${fps}`, `capture_cursor=${cursor}`]
        if (type === 'window') {
            const hwnd = normalizeHwnd(target.hwnd)
            if (!hwnd) throw new Error('Window capture requires a valid hwnd')
            // 用 hwnd 而不是 window_title：标题会变、可能含冒号，hwnd 唯一且稳定
            params.unshift(`hwnd=${hwnd}`)
        } else {
            params.unshift(`monitor_idx=${Math.max(0, Number(target.displayIndex) || 0)}`)
        }
        return {
            args: ['-f', 'lavfi', '-i', `gfxcapture=${params.join(':')}`],
            backend,
            hardwareFrames: true
        }
    }

    // gdigrab 兜底：抓不到 GPU 内容，但至少不会让整个录制失败
    const args = ['-f', 'gdigrab', `-framerate`, String(fps), `-draw_mouse`, String(cursor)]
    if (type === 'window') {
        const hwnd = normalizeHwnd(target.hwnd)
        if (!hwnd) throw new Error('Window capture requires a valid hwnd')
        args.push('-i', `hwnd=0x${hwnd.toString(16)}`)
    } else {
        args.push('-i', 'desktop')
    }
    return { args, backend, hardwareFrames: false }
}

function normalizeHwnd(value) {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.floor(n)
}

/** 编码器要求的宽高必须是偶数：yuv420p 的色度平面是 2x2 子采样 */
function evenSize(value) {
    const n = Math.round(Number(value) || 0)
    if (n <= 0) return 0
    return n - (n % 2)
}

/**
 * 构造视频滤镜链。
 *
 * 两种输入帧形态：
 *   hardwareFrames = true  → D3D11 纹理。零拷贝编码器什么都不用做；
 *                            其余编码器必须先 hwdownload 回 CPU 内存。
 *   hardwareFrames = false → 已经是软件帧，只按需缩放。
 *
 * 缩放为什么一律走 CPU：GPU 侧缩放要 scale_cuda / scale_d3d11，
 * 后者只认 width/height/format，还得从 ddagrab 的 d3d11 设备另派生 hwframe，
 * 实测直接 "Task finished with error: Invalid argument" 0 帧退出。
 * 而 4K→1080p 的单次 swscale 在现代 CPU 上只占几毫秒，先按可靠的做。
 *
 * 为什么「尺寸没变就绝对不能挂 scale」（2026-10-21 修）：
 * scale / format 这类软件滤镜一旦存在，filtergraph 就要协商像素格式，
 * 而 d3d11 硬件帧没有自动 hwdownload 的路径，于是报
 *   Impossible to convert between the formats supported by the filter ...
 *   Error reinitializing filters! / Task finished with error: Function not implemented
 * 整条命令 0 帧退出。用户在 4K 屏上选「3840×2160」——明明和桌面一样大——
 * 就会踩到这条，测试结果显示 speed=N/A。所以先比尺寸，真的变了才下载+缩放。
 *
 * @returns {{ filters: string[], hardwareFrames: boolean }}
 *   filters        — 滤镜片段，调用方用 ',' 拼起来交给 -vf
 *   hardwareFrames — 跑完滤镜后帧是否还留在 GPU 上（决定能不能零拷贝进编码器）
 */
function buildVideoFilters({
    hardwareFrames,
    zeroCopy,
    width,
    height,
    encoderId,
    sourceWidth,
    sourceHeight
}) {
    const outW = evenSize(width)
    const outH = evenSize(height)
    const srcW = Math.round(Number(sourceWidth) || 0)
    const srcH = Math.round(Number(sourceHeight) || 0)
    // 采集源尺寸未知时按「需要缩放」处理：宁可多一次 CPU 拷贝，也不要输出错尺寸
    const sizeKnown = srcW > 0 && srcH > 0
    // 源本身是奇数宽高时必须缩一下：yuv420p / NVENC 都只吃偶数尺寸，
    // 窗口录制很容易碰上（1919×1079 这种）。
    const srcOdd = sizeKnown && ((srcW % 2) !== 0 || (srcH % 2) !== 0)
    let scaleW = outW
    let scaleH = outH
    if (srcOdd && (!scaleW || !scaleH)) {
        scaleW = evenSize(srcW)
        scaleH = evenSize(srcH)
    }
    const needScale = scaleW > 0 && scaleH > 0 && (!sizeKnown || scaleW !== srcW || scaleH !== srcH)

    // 硬件帧 + 零拷贝 + 不用缩放，才是真正的「一个滤镜都不挂」
    const keepHardware = !!hardwareFrames && !!zeroCopy && !needScale

    const filters = []
    // 要缩放，或者编码器本身吃不了硬件帧 → 先落回 CPU 内存
    if (hardwareFrames && !keepHardware) {
        filters.push('hwdownload', 'format=bgra')
    }
    if (needScale) {
        filters.push(`scale=${scaleW}:${scaleH}:flags=fast_bilinear`)
    }
    // QSV 只吃 nv12；其余编码器统一 yuv420p
    if (filters.length > 0) {
        filters.push(encoderId && String(encoderId).includes('_qsv') ? 'format=nv12' : 'format=yuv420p')
    }

    return { filters, hardwareFrames: keepHardware }
}

module.exports = {
    BACKENDS,
    buildCaptureInput,
    buildVideoFilters,
    evenSize,
    escapeFilterValue
}
