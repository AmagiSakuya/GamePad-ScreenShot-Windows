'use strict'

/**
 * 录制引擎门面。
 *
 * 对外只暴露四件事：
 *   getCapabilities() — 这台机器能用哪些采集后端和编码器（真跑一遍得出的结论）
 *   selfTest()        — 用指定配置真录一段，回答「会不会过载」
 *   startRecord()     — 开始录制
 *   stopRecord()      — 停止
 *
 * 上层（background.js / IPC）不需要知道 ffmpeg 参数长什么样。
 */

const { resolveFfmpegPath, probeCapabilities, testEncoder, testBackend, selfTestPipeline } = require('./ffmpeg')
const { ENCODERS } = require('./encoders')
const { buildRecordCommand } = require('./command')
const { createSession } = require('./session')
const { Fmp4RingBuffer } = require('./fmp4')

function createRecorder(deps = {}) {
    const { isPackaged = false, resourcesPath = '', appPath = process.cwd(), log = console } = deps

    let activeSession = null
    let activeConfig = null
    let capabilitiesCache = null

    // 回放缓存（长按保存最近 N 秒）的独立状态
    let replayBuffer = null
    let replaySession = null
    let replayConfig = null

    function ffmpegPath() {
        return resolveFfmpegPath({ isPackaged, resourcesPath, appPath })
    }

    /**
     * 探测本机能力。
     *
     * 编码器是并发测的（每个 0.3 秒左右，串行要 2 秒以上），
     * 但并发度压到 3 —— 硬编初始化会去抢 GPU 设备，一次开太多反而容易互相踩。
     */
    async function getCapabilities({ force = false } = {}) {
        if (capabilitiesCache && !force) return capabilitiesCache

        const exe = ffmpegPath()
        const base = await probeCapabilities(exe, { force })

        const compiled = new Set(base.videoEncoders)
        const candidates = ENCODERS.filter((enc) => compiled.has(enc.id))

        const results = await mapLimit(candidates, 3, async (enc) => {
            const test = await testEncoder(exe, enc.id)
            return {
                id: enc.id,
                label: enc.label,
                vendor: enc.vendor,
                codec: enc.codec,
                // 各家对「质量值」的叫法不同，UI 上直接显示 ICQ 23 / CQ 23 这种
                qualityTerm: enc.qualityTerm,
                zeroCopy: enc.zeroCopy,
                available: test.ok,
                reason: test.reason
            }
        })

        const backends = []
        if (base.filters.ddagrab) {
            const test = await testBackend(exe, 'ddagrab')
            backends.push({ id: 'ddagrab', available: test.ok, reason: test.reason })
        }
        if (base.filters.gfxcapture) {
            const test = await testBackend(exe, 'gfxcapture')
            backends.push({ id: 'gfxcapture', available: test.ok, reason: test.reason })
        }
        // gdigrab 是内置设备，几乎总是存在，但仍实测一次
        const gdiTest = await testBackend(exe, 'gdigrab')
        backends.push({ id: 'gdigrab', available: gdiTest.ok, reason: gdiTest.reason })

        capabilitiesCache = {
            ffmpegPath: exe,
            version: base.version,
            versionLine: base.versionLine,
            encoders: results,
            backends
        }
        if (log && typeof log.info === 'function') {
            log.info('[recorder] capabilities', {
                version: base.version,
                encoders: results.filter((r) => r.available).map((r) => r.id),
                backends: backends.filter((r) => r.available).map((r) => r.id)
            })
        }
        return capabilitiesCache
    }

    /**
     * 端到端自检：真实采集 → 真实编码 → 读 ffmpeg 自己的丢帧统计。
     *
     * 为什么最终选真实采集而不是合成源：
     * 试过两条路，合成源（testsrc2）反而更不准 —— 生成 4K60 图案本身就把 CPU 吃满，
     * 实测同一台机器 4K60 QSV 用真实采集是 0.96x、用合成源只有 0.78x，
     * 差的那部分全是图案生成的 CPU 开销，跟编码器无关。
     *
     * 代价是采集源「画面有变化才出帧」，桌面静止时可能一帧都没有。
     * 这种情况不判失败 —— 返回 measured:false，由上层提示用户动一下画面再测。
     */
    async function selfTest(config = {}) {
        const exe = ffmpegPath()
        const { parts, meta } = buildRecordCommand({
            ...config,
            output: { type: 'pipe' }
        })

        const result = await selfTestPipeline(exe, {
            inputArgs: [...parts.input, ...parts.filters],
            videoArgs: parts.video,
            durationSeconds: 3
        })

        // 帧数太少说明测的是「静止桌面」，数字没有参考价值
        const measured = result.frames >= 5

        return {
            ...result,
            ok: measured,
            measured,
            testWidth: Number(config.testWidth) || Number(config.width) || 0,
            testHeight: Number(config.testHeight) || Number(config.height) || 0,
            backend: meta.backend,
            zeroCopy: meta.zeroCopy
        }
    }

    /**
     * 开始录制。output 传 { type:'file', path } 录制到文件；
     * 传 { type:'pipe' } 则通过 onData 吐出 fMP4 片段流（回放缓存用）。
     */
    async function startRecord(config = {}, handlers = {}) {
        if (activeSession) throw new Error('A recording session is already running')

        const exe = ffmpegPath()
        const { args, meta } = buildRecordCommand(config)
        const session = createSession({
            exe,
            args,
            onProgress: handlers.onProgress,
            onLog: handlers.onLog,
            onData: handlers.onData,
            onExit: (result) => {
                if (activeSession === session) {
                    activeSession = null
                    activeConfig = null
                }
                if (typeof handlers.onExit === 'function') handlers.onExit(result, meta)
            }
        })

        activeSession = session
        activeConfig = { config, meta }
        if (log && typeof log.info === 'function') {
            log.info('[recorder] start', { backend: meta.backend, args: args.join(' ') })
        }
        return { session, meta, args }
    }

    async function stopRecord(options) {
        if (!activeSession) return null
        const session = activeSession
        const result = await session.stop(options)
        return result
    }

    function isRecording() {
        return !!(activeSession && !activeSession.exited)
    }

    // ===== 回放缓存（等价于 OBS 的 Replay Buffer）=====

    /**
     * 启动回放缓存。
     *
     * 和普通录制的区别只有一个：输出走 pipe 而不是文件，
     * 数据全部进内存环形缓冲，按下保存时才把最近 N 秒写成文件。
     *
     * 代价是「只要在缓冲就一直有编码开销」，所以上层应该把它绑到
     * 「正在监听手柄」这种明确的状态上，而不是开机常驻。
     */
    async function startReplayBuffer(config = {}, handlers = {}) {
        if (replaySession) throw new Error('Replay buffer is already running')

        const bufferSeconds = Math.max(1, Math.round(config.bufferSeconds || 30))
        // 内存上限：用户显式设了就用他的（对应 OBS 的「最大内存」），
        // 否则按「目标码率 × 时长 × 1.5」估，给 VBR 波动留余量
        const bitrate = Math.max(500000, Number(config.bitrate) || 12000000)
        const estimated = config.mode === 'bitrate'
            ? (bitrate / 8) * bufferSeconds * 1.5
            : (bitrate / 8) * bufferSeconds * 3
        const maxBytes = config.bufferMaxMB
            ? Math.max(64 * 1024 * 1024, Number(config.bufferMaxMB) * 1024 * 1024)
            : Math.min(1024 * 1024 * 1024, Math.max(64 * 1024 * 1024, estimated))

        replayBuffer = new Fmp4RingBuffer({ durationSeconds: bufferSeconds, maxBytes })
        // 回放缓存强制 1 秒 GOP：fMP4 是「遇到下一个关键帧才切一片」，
        // GOP 越长，从点开启到能保存第一段的时间就越久（用户会以为坏了）。
        // 固定 1 秒后最多 1 秒就有可保存的画面，满了之后就是正常循环。
        replayConfig = { ...config, bufferSeconds, gopSeconds: 1 }

        const { session, meta } = await startRecord(
            { ...replayConfig, output: { type: 'pipe' } },
            {
                onData: (chunk) => {
                    replayBuffer.push(chunk)
                    if (handlers.onData) handlers.onData(chunk)
                },
                onProgress: (sample, summary) => {
                    if (handlers.onProgress) {
                        handlers.onProgress({ ...sample, buffer: getReplayState() }, summary)
                    }
                },
                onLog: handlers.onLog,
                onExit: (result, exitMeta) => {
                    replaySession = null
                    if (handlers.onExit) handlers.onExit(result, exitMeta)
                }
            }
        )
        replaySession = session
        return { meta, bufferSeconds, maxBytes }
    }

    /** 保存最近 N 秒到文件。纯内存拷贝 + 一次写盘，毫秒级。 */
    async function saveReplay(filePath) {
        if (!replayBuffer || !replayBuffer.ready) {
            throw new Error('Replay buffer is empty')
        }
        return replayBuffer.save(filePath)
    }

    async function stopReplayBuffer(options) {
        const session = replaySession
        replaySession = null
        replayBuffer = null
        replayConfig = null
        if (!session) return null
        return session.stop(options)
    }

    function getReplayState() {
        if (!replayBuffer) {
            return { active: false, ready: false, duration: 0, fragments: 0, bytes: 0, targetSeconds: 0 }
        }
        return {
            active: !!(replaySession && !replaySession.exited),
            ready: replayBuffer.ready,
            duration: Number(replayBuffer.duration.toFixed(2)),
            fragments: replayBuffer.fragmentCount,
            bytes: replayBuffer.byteLength,
            targetSeconds: replayConfig ? replayConfig.bufferSeconds : 0
        }
    }

    /**
     * 同步强杀所有 ffmpeg 子进程。
     * 给 app 退出用 —— will-quit 是同步阶段，来不及等优雅停止，
     * 而 Windows 上父进程退出不会带走子进程，不杀就会留下孤儿进程继续吃 GPU。
     */
    function killNow() {
        for (const session of [replaySession, activeSession]) {
            if (session && session._child) {
                try { session._child.kill() } catch (error) { /* 已经退出 */ }
            }
        }
        replaySession = null
        replayBuffer = null
        activeSession = null
    }

    return {
        ffmpegPath,
        getCapabilities,
        selfTest,
        startRecord,
        stopRecord,
        isRecording,
        startReplayBuffer,
        saveReplay,
        stopReplayBuffer,
        getReplayState,
        killNow,
        getActiveConfig: () => activeConfig
    }
}

/** 有并发上限的 map，保证结果顺序与输入一致 */
async function mapLimit(items, limit, worker) {
    const results = new Array(items.length)
    let cursor = 0
    const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (cursor < items.length) {
            const index = cursor++
            results[index] = await worker(items[index], index)
        }
    })
    await Promise.all(runners)
    return results
}

module.exports = { createRecorder }
