'use strict'

/**
 * 编码器目录：把「用户选的引擎 + 那套细项」翻译成 ffmpeg 编码参数。
 *
 * 参数项对齐 OBS 的「编码器设置」面板：
 *   速率控制（质量优先 / 码率优先）、质量值、preset、profile、B 帧、关键帧间隔。
 * 各家硬编的参数名完全不统一（nvenc 用 -cq、qsv 用 -global_quality、amf 用 -qp_i），
 * 所以用表驱动，以后加 AV1 只需往表里加一条。
 *
 * zeroCopy = true 表示编码器能直接吃 ddagrab/gfxcapture 吐出的 D3D11 帧，
 * 不经过 CPU 内存；false 就必须在采集端先 hwdownload。
 * 实测这台机器（UHD 770 + 驱动 32.0.101.7092）上，从 ddagrab 的 d3d11 设备
 * 派生 qsv 设备会失败（MFX session -9，oneVPL 找不到支持 D3D11 共享的实现），
 * 所以 qsv 只能走软件帧。NVENC 的零拷贝是正常的。
 */

// 质量值的含义跟各家术语对应：nvenc=CQ、qsv=ICQ、amf=QP、x264=CRF
// 取值范围统一 0~51，越小画质越好、体积越大
const QUALITY_MIN = 0
const QUALITY_MAX = 51
const QUALITY_DEFAULT = 23

/** 老配置里存的是 0~100 的百分比，换算成 0~51 的质量值 */
function qualityFromPercent(percent) {
    const p = Math.min(100, Math.max(0, Number(percent) || 0))
    return Math.round(QUALITY_MAX - (p / 100) * (QUALITY_MAX - 10))
}

/** preset 统一三档，各引擎自己映射（OBS 的「目标使用 TU7 最快」对应 speed） */
const PRESETS = ['speed', 'balanced', 'quality']

const PRESET_MAP = {
    nvenc: { speed: 'p1', balanced: 'p5', quality: 'p7' },
    qsv: { speed: 'veryfast', balanced: 'medium', quality: 'slow' },
    amf: { speed: 'speed', balanced: 'balanced', quality: 'quality' },
    cpu: { speed: 'ultrafast', balanced: 'veryfast', quality: 'medium' }
}

function presetOf(vendor, preset) {
    const key = PRESETS.includes(preset) ? preset : 'balanced'
    return PRESET_MAP[vendor][key]
}

const ENCODERS = [
    {
        id: 'h264_nvenc',
        vendor: 'nvidia',
        codec: 'h264',
        label: 'NVIDIA NVENC · H.264',
        qualityTerm: 'CQ',
        zeroCopy: true,
        args: (o) => {
            const base = ['-preset', presetOf('nvenc', o.preset), '-tune', 'hq', '-profile:v', o.profile]
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-rc', 'cbr', '-b:v', b, '-maxrate', b, '-bufsize', `${Math.round(o.bitrate / 500)}k`]
            }
            return [...base, '-rc', 'vbr', '-cq', String(o.quality), '-b:v', '0']
        }
    },
    {
        id: 'hevc_nvenc',
        vendor: 'nvidia',
        codec: 'hevc',
        label: 'NVIDIA NVENC · HEVC',
        qualityTerm: 'CQ',
        zeroCopy: true,
        args: (o) => {
            const base = ['-preset', presetOf('nvenc', o.preset), '-tune', 'hq', '-tag:v', 'hvc1']
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-rc', 'cbr', '-b:v', b, '-maxrate', b, '-bufsize', `${Math.round(o.bitrate / 500)}k`]
            }
            return [...base, '-rc', 'vbr', '-cq', String(o.quality), '-b:v', '0']
        }
    },
    {
        id: 'h264_qsv',
        vendor: 'intel',
        codec: 'h264',
        label: 'Intel Quick Sync · H.264',
        qualityTerm: 'ICQ',
        zeroCopy: false,
        args: (o) => {
            const base = ['-preset', presetOf('qsv', o.preset), '-profile:v', o.profile]
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-b:v', b, '-maxrate', b]
            }
            // QSV 的 ICQ 在 ffmpeg 里就是 global_quality
            return [...base, '-global_quality', String(o.quality)]
        }
    },
    {
        id: 'hevc_qsv',
        vendor: 'intel',
        codec: 'hevc',
        label: 'Intel Quick Sync · HEVC',
        qualityTerm: 'ICQ',
        zeroCopy: false,
        args: (o) => {
            const base = ['-preset', presetOf('qsv', o.preset), '-tag:v', 'hvc1', '-profile:v', o.profile]
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-b:v', b, '-maxrate', b]
            }
            return [...base, '-global_quality', String(o.quality)]
        }
    },
    {
        id: 'h264_amf',
        vendor: 'amd',
        codec: 'h264',
        label: 'AMD AMF · H.264',
        qualityTerm: 'QP',
        zeroCopy: true,
        args: (o) => {
            const q = String(o.quality)
            const base = ['-quality', presetOf('amf', o.preset)]
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-rc', 'cbr', '-b:v', b, '-maxrate', b]
            }
            // AMF 的 cqp 要分别给 I / P / B
            return [...base, '-rc', 'cqp', '-qp_i', q, '-qp_p', q, '-qp_b', q]
        }
    },
    {
        id: 'hevc_amf',
        vendor: 'amd',
        codec: 'hevc',
        label: 'AMD AMF · HEVC',
        qualityTerm: 'QP',
        zeroCopy: true,
        args: (o) => {
            const q = String(o.quality)
            const base = ['-quality', presetOf('amf', o.preset), '-tag:v', 'hvc1']
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-rc', 'cbr', '-b:v', b, '-maxrate', b]
            }
            return [...base, '-rc', 'cqp', '-qp_i', q, '-qp_p', q, '-qp_b', q]
        }
    },
    {
        // 纯软件兜底：没有可用硬件的机器、或者驱动出问题时的最后一条路
        id: 'libx264',
        vendor: 'cpu',
        codec: 'h264',
        label: 'CPU · x264',
        qualityTerm: 'CRF',
        zeroCopy: false,
        args: (o) => {
            const base = ['-preset', presetOf('cpu', o.preset), '-profile:v', o.profile]
            if (o.gopFrames > 0) base.push('-g', String(o.gopFrames))
            if (o.bf > 0) base.push('-bf', String(o.bf))
            if (o.mode === 'bitrate') {
                const b = `${Math.max(1, Math.round(o.bitrate / 1000))}k`
                return [...base, '-b:v', b, '-maxrate', b, '-bufsize', `${Math.round(o.bitrate / 500)}k`]
            }
            return [...base, '-crf', String(o.quality)]
        }
    }
]

const BY_ID = new Map(ENCODERS.map((e) => [e.id, e]))

function getEncoder(id) {
    return BY_ID.get(id) || null
}

/**
 * 生成完整的编码参数。
 *
 * @param {string} id 编码器 id
 * @param {object} options
 *   mode            'quality' | 'bitrate'
 *   quality         0~51 质量值（质量优先模式）
 *   qualityPercent  兼容旧配置的 0~100
 *   bitrate         码率优先模式的目标码率（bps）
 *   fps             目标帧率（用来把「关键帧间隔秒数」换算成帧数）
 *   gopSeconds      关键帧间隔秒数，0 = 交给编码器自动决定
 *   preset          'speed' | 'balanced' | 'quality'
 *   profile         'main' | 'high'
 *   bf              B 帧数量，0 = 不启用
 *   softwareFrames  输入是否已是软件帧（决定要不要锁 -pix_fmt）
 */
function buildVideoArgs(id, options = {}) {
    const enc = getEncoder(id)
    if (!enc) throw new Error(`Unknown encoder: ${id}`)

    const fps = Math.max(1, Math.round(options.fps || 60))
    // gopSeconds = 0 表示「自动」，不传 -g 让编码器按自己的默认来。
    // 默认 1 秒：fMP4 每个关键帧切一片，回放缓存的「最近 N 秒」才能精确切片。
    const gopSeconds = options.gopSeconds === undefined ? 1 : Number(options.gopSeconds)
    const gopFrames = gopSeconds > 0 ? Math.max(1, Math.round(fps * gopSeconds)) : 0

    const mode = options.mode === 'bitrate' ? 'bitrate' : 'quality'
    let quality = Number(options.quality)
    if (!Number.isFinite(quality)) {
        quality = options.qualityPercent == null
            ? QUALITY_DEFAULT
            : qualityFromPercent(options.qualityPercent)
    }
    quality = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, Math.round(quality)))

    const bitrate = Math.max(500000, Number(options.bitrate) || 12000000)
    const preset = PRESETS.includes(options.preset) ? options.preset : 'balanced'
    const profile = options.profile === 'high' ? 'high' : 'main'
    const bf = Math.min(4, Math.max(0, Math.round(Number(options.bf) || 0)))

    const args = [
        '-c:v', enc.id,
        ...enc.args({ mode, quality, bitrate, gopFrames, preset, profile, bf })
    ]

    // 只有输入已经是软件帧时才锁像素格式。
    // 零拷贝路径上帧还是 D3D11 纹理，此时给 -pix_fmt 会让 ffmpeg 插一个
    // GPU→CPU 的格式转换滤镜，实测直接 "Error reinitializing filters"、
    // 整条录制 0 帧退出。硬件帧的格式交给编码器自己在 GPU 上协商。
    if (options.softwareFrames !== false) {
        args.push('-pix_fmt', 'yuv420p')
    }

    return args
}

/** 该编码器能否零拷贝吃 GPU 帧（决定采集端是否加 hwdownload） */
function isZeroCopy(id) {
    const enc = getEncoder(id)
    return !!(enc && enc.zeroCopy)
}

/** 探测用的最小参数：编码 3 帧纯色，只关心能不能跑通 */
function buildProbeArgs(id) {
    const enc = getEncoder(id)
    if (!enc) return null
    return ['-c:v', enc.id, '-g', '10']
}

module.exports = {
    ENCODERS,
    PRESETS,
    QUALITY_MIN,
    QUALITY_MAX,
    QUALITY_DEFAULT,
    qualityFromPercent,
    getEncoder,
    buildVideoArgs,
    buildProbeArgs,
    isZeroCopy
}
