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
 *   sourceWidth/sourceHeight — 采集源的原始像素尺寸，用来判断「到底要不要缩放」
 *                  （和输出一样大时不挂 scale，否则硬件帧的滤镜链会 0 帧退出）
 *   mode        — 'quality' | 'bitrate'
 *   qualityPercent — 0~100
 *   bitrate     — 码率模式下的目标码率（bps）
 *   cursor      — 是否录鼠标
 *   backend     — 强制采集后端（调试用）
 *   audio       — 系统声音：{ pipePath, sampleRate, channels, sampleFormat, bitrate }
 *                 由 audioCapture 先起好采集进程、拿到管道路径后传进来
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
        // 采集源原始像素尺寸（屏幕的物理分辨率 / 窗口的实际尺寸）。
        // 用来跳过「和源一样大」的 scale —— 那种滤镜会让硬件帧的滤镜链直接 0 帧。
        sourceWidth = 0,
        sourceHeight = 0,
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
        audio = null,
        output = { type: 'pipe' }
    } = options

    const capture = buildCaptureInput(target, { fps, cursor, backend })
    const zeroCopy = isZeroCopy(encoderId)
    const filterPlan = buildVideoFilters({
        hardwareFrames: capture.hardwareFrames,
        zeroCopy,
        width,
        height,
        encoderId,
        sourceWidth,
        sourceHeight
    })
    const filters = filterPlan.filters
    // 滤镜跑完帧还在不在 GPU 上：只有「硬件帧 + 零拷贝 + 不用缩放」才留得住
    const gpuFrames = filterPlan.hardwareFrames

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
        // 帧已经落到 CPU 内存时才可以指定像素格式
        softwareFrames: !gpuFrames
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

    const audioInput = buildAudioInput(audio)
    const audioArgs = audioInput ? buildAudioArgs(audio) : []

    const filterArgs = filters.length > 0 ? ['-vf', filters.join(',')] : []

    // 两路输入时必须显式 map：默认策略会「每种类型挑一路最好的」，
    // 一旦将来加了麦克风或第二屏就会挑错。
    const mapArgs = audioInput ? ['-map', '0:v:0', '-map', '1:a:0'] : []

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
        audioInput: audioInput ? audioInput.args : [],
        map: mapArgs,
        filters: filterArgs,
        pacing: pacingArgs,
        video: videoArgs,
        audio: audioArgs,
        output: outputArgs
    }

    const args = [
        ...parts.global,
        ...parts.input,
        ...parts.audioInput,
        ...parts.map,
        ...parts.filters,
        ...parts.pacing,
        ...parts.video,
        ...parts.audio,
        ...parts.output
    ]

    return {
        args,
        parts,
        meta: {
            backend: capture.backend,
            zeroCopy,
            filters,
            // 滤镜之后帧是否仍在 GPU 上（这才是「有没有走零拷贝」的真实答案）
            hardwareFrames: gpuFrames,
            // 采集源的原始尺寸，日志里用它解释「为什么这次挂了 scale」
            sourceWidth: Math.round(Number(sourceWidth) || 0),
            sourceHeight: Math.round(Number(sourceHeight) || 0),
            gopFrames: Math.max(1, Math.round(fps)),
            audio: audioInput
                ? {
                    sampleRate: Number(audio.sampleRate) || 48000,
                    channels: Number(audio.channels) || 2,
                    sampleFormat: audioInput.sampleFormat
                }
                : null
        }
    }
}

/**
 * 系统声音的输入段。
 *
 * 采集端给的是裸 PCM（没有容器、没有时间戳），所以必须把采样率/声道/样本格式
 * 写全，否则 ffmpeg 会按 44100/mono 去解释，出来就是「快放 + 变调」。
 */
const RAW_SAMPLE_FORMATS = new Set(['u8', 's16le', 's24le', 's32le', 'f32le', 'f64le'])

function buildAudioInput(audio) {
    if (!audio || !audio.pipePath) return null
    const sampleFormat = RAW_SAMPLE_FORMATS.has(String(audio.sampleFormat))
        ? String(audio.sampleFormat)
        : 's16le'
    const sampleRate = Math.max(8000, Math.min(192000, Math.round(Number(audio.sampleRate) || 48000)))
    const channels = Math.max(1, Math.min(8, Math.round(Number(audio.channels) || 2)))
    return {
        sampleFormat,
        args: [
            '-f', sampleFormat,
            '-ar', String(sampleRate),
            '-ac', String(channels),
            // 命名管道：Windows 上 ffmpeg 直接按普通文件打开
            '-i', audio.pipePath
        ]
    }
}

/**
 * 音频编码段。统一出 AAC-LC 48k 立体声 —— MP4 里兼容性最好，
 * 而且和视频同一个 moof 切片，回放缓存的「按关键帧淘汰」天然对齐。
 */
function buildAudioArgs(audio) {
    const bitrate = Math.max(64000, Math.min(512000, Math.round(Number(audio.bitrate) || 192000)))
    return [
        '-c:a', 'aac',
        '-b:a', String(bitrate),
        '-ar', '48000',
        // 设备是 5.1 时让 ffmpeg 按标准矩阵下混到立体声
        '-ac', '2'
    ]
}

module.exports = { buildRecordCommand }
