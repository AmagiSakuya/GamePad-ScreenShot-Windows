'use strict'

/**
 * 把「用户配置」翻译成一条完整的 ffmpeg 命令行。
 *
 * 参数顺序是有讲究的，不能随意调整：
 *   全局选项 → 输入 → 输入侧滤镜 → 编码参数 → 输出
 * 其中 `-framerate` / `-video_size` 这类属于「输入设备选项」的必须写在 -i 之前，
 * 而 `-vf` 属于输出侧，必须写在 -i 之后。写反了 ffmpeg 会静默忽略或直接报错。
 */

const { buildCaptureInput, buildVideoFilters } = require('./sources')
const { buildVideoArgs, isZeroCopy } = require('./encoders')

/**
 * @param {object} options
 *   ffmpegPath  — 可执行文件（仅用于日志/调试，不参与拼参）
 *   target      — { type:'screen'|'window', displayIndex, hwnd }
 *   encoderId   — encoders.js 里的 id
 *   fps         — 目标帧率
 *   width/height— 输出分辨率，0 表示保持原始
 *   mode        — 'quality' | 'bitrate'
 *   qualityPercent — 0~100
 *   bitrate     — 码率模式下的目标码率（bps）
 *   cursor      — 是否录鼠标
 *   backend     — 强制采集后端（调试用）
 *   output      — { type:'file', path } 或 { type:'pipe' }
 *
 * @returns {{ args: string[], meta: object }}
 */
function buildRecordCommand(options = {}) {
    const {
        target = { type: 'screen', displayIndex: 0 },
        encoderId = 'libx264',
        fps = 60,
        width = 0,
        height = 0,
        mode = 'quality',
        // 质量优先模式：quality 是 0~51 的实际值，qualityPercent 兼容旧配置
        quality,
        qualityPercent,
        bitrate = 12000000,
        // 跟 OBS 编码器面板对齐的细项
        preset = 'balanced',
        profile = 'main',
        bf = 0,
        gopSeconds = 1,
        cursor = true,
        backend,
        output = { type: 'pipe' }
    } = options

    const capture = buildCaptureInput(target, { fps, cursor, backend })
    const zeroCopy = isZeroCopy(encoderId)
    const filters = buildVideoFilters({
        hardwareFrames: capture.hardwareFrames,
        zeroCopy,
        width,
        height,
        encoderId
    })

    const videoArgs = buildVideoArgs(encoderId, {
        mode,
        quality,
        qualityPercent,
        bitrate,
        fps,
        gopSeconds,
        preset,
        profile,
        bf,
        // 硬件帧且编码器能零拷贝 → 别碰像素格式；否则帧已经落到 CPU 了，可以指定
        softwareFrames: !(capture.hardwareFrames && zeroCopy)
    })

    // 各段分开拼，最后再合成一条完整命令。
    // 分段保留是为了让「压测」能复用输入+编码段、只把输出换成 null muxer，
    // 而不是拿整条命令行回头做字符串反解析（那样太容易错）。
    const globalArgs = [
        '-hide_banner',
        '-loglevel', 'warning',
        // 关掉默认的统计行，避免和 -progress 的输出混在一起
        '-nostats',
        '-progress', 'pipe:2'
    ]

    const filterArgs = filters.length > 0 ? ['-vf', filters.join(',')] : []

    // 帧率节奏：默认交给采集源自己管（ddagrab/gfxcapture 都有 framerate 参数）。
    //
    // 不能用 `-fps_mode cfr -r N`：帧还是 D3D11 硬件帧时，帧率滤镜需要
    // 在 GPU 帧上重初始化，实测直接报 "Error reinitializing filters: Function not implemented"，
    // 整条录制 0 帧退出。等帧落到 CPU 之后再加就没有意义了，所以干脆不加。
    // 代价是输出是 VFR（画面静止时不出帧），回放缓存的时长要按 PTS 算而不是按帧数算。
    const pacingArgs = []

    // 分片 MP4：每个关键帧切一片，随时中断都不会损坏已写入的部分。
    // 回放缓存靠这个特性做「按片段淘汰」，录制到文件时也顺带获得断电容错。
    const movFlags = '+frag_keyframe+empty_moov+default_base_moof'
    let outputArgs
    if (output.type === 'file') {
        if (!output.path) throw new Error('output.path is required for file output')
        outputArgs = ['-movflags', movFlags, '-f', 'mp4', '-y', output.path]
    } else {
        outputArgs = ['-movflags', movFlags, '-f', 'mp4', 'pipe:1']
    }

    const parts = {
        global: globalArgs,
        input: capture.args,
        filters: filterArgs,
        pacing: pacingArgs,
        video: videoArgs,
        output: outputArgs
    }

    const args = [
        ...parts.global,
        ...parts.input,
        ...parts.filters,
        ...parts.pacing,
        ...parts.video,
        ...parts.output
    ]

    return {
        args,
        parts,
        meta: {
            backend: capture.backend,
            zeroCopy,
            filters,
            hardwareFrames: capture.hardwareFrames,
            gopFrames: Math.max(1, Math.round(fps))
        }
    }
}

module.exports = { buildRecordCommand }
