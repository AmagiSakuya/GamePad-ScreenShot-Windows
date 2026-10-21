'use strict'

/**
 * 录制进程的生命周期管理。
 *
 * ffmpeg 同时往两个流写东西：
 *   stdout — MP4 数据（录制到文件时不用，回放缓存时是 fMP4 片段流）
 *   stderr — 日志 + `-progress` 的 key=value 块
 *
 * 所以 stderr 必须自己拆：能识别的 key 归进度，其余当日志。
 * 进度里的 speed / drop_frames 就是「编码有没有过载」的原始依据：
 * speed < 1 表示编码速度跟不上采集速度，ffmpeg 开始丢帧。
 */

const { spawn } = require('child_process')

// -progress 会输出的字段。只认这些，避免把普通日志里的 `=` 误判成进度。
const PROGRESS_KEYS = new Set([
    'frame', 'fps', 'stream_0_0_q', 'bitrate', 'total_size',
    'out_time_us', 'out_time_ms', 'out_time', 'dup_frames', 'drop_frames', 'speed'
])

function createSession({ exe, args, onProgress, onLog, onData, onExit }) {
    const startedAt = Date.now()
    let stopped = false
    let exitResolve = null
    const exitPromise = new Promise((resolve) => { exitResolve = resolve })

    const child = spawn(exe, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
    })

    // stderr 解析状态
    let pending = {}
    let lineBuffer = ''
    // 最近若干次进度块，用来判断「持续过载」而不是偶发抖动
    const history = []

    function flushProgress() {
        if (Object.keys(pending).length === 0) return

        const sample = {
            frame: Number(pending.frame) || 0,
            fps: Number(pending.fps) || 0,
            // speed 形如 "1.02x"，去掉 x 才能转数字
            speed: parseFloat(String(pending.speed || '0').replace('x', '')) || 0,
            dropFrames: Number(pending.drop_frames) || 0,
            dupFrames: Number(pending.dup_frames) || 0,
            totalSize: Number(pending.total_size) || 0,
            // out_time_ms 在部分版本里其实是微秒，这里只用于算时长差，不做绝对时间
            outTimeMs: Number(pending.out_time_ms) || 0,
            at: Date.now()
        }

        history.push(sample)
        if (history.length > 30) history.shift()

        if (pending.progress === 'end') {
            pending = {}
            return
        }
        pending = {}

        if (typeof onProgress === 'function') {
            try { onProgress(sample, summarize(history)) } catch (error) { /* 回调是外部代码，不能影响解析 */ }
        }
    }

    function handleLine(line) {
        const idx = line.indexOf('=')
        if (idx > 0 && !line.startsWith('[')) {
            const key = line.slice(0, idx).trim()
            const value = line.slice(idx + 1).trim()
            if (key === 'progress') {
                pending.progress = value
                flushProgress()
                return
            }
            if (PROGRESS_KEYS.has(key)) {
                pending[key] = value
                return
            }
        }
        if (line.length > 0 && typeof onLog === 'function') {
            try { onLog(line) } catch (error) { /* ignore */ }
        }
    }

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
        lineBuffer += chunk
        // 进度块用 \n 分隔，但部分平台会混入 \r
        const lines = lineBuffer.split(/\r?\n/)
        lineBuffer = lines.pop() || ''
        for (const line of lines) handleLine(line)
    })

    child.stdout.on('data', (chunk) => {
        if (typeof onData === 'function') {
            try { onData(chunk) } catch (error) { /* ignore */ }
        }
    })

    child.on('error', (error) => {
        if (typeof onLog === 'function') onLog(`spawn error: ${error.message}`)
    })

    child.on('exit', (code, signal) => {
        if (lineBuffer) handleLine(lineBuffer)
        flushProgress()
        const result = {
            code,
            signal,
            stopped,
            durationMs: Date.now() - startedAt,
            summary: summarize(history)
        }
        if (typeof onExit === 'function') {
            try { onExit(result) } catch (error) { /* ignore */ }
        }
        if (exitResolve) exitResolve(result)
    })

    /**
     * 停止录制。
     * 先给 ffmpeg 发 'q' —— 它会正常收尾（写完最后一个 fragment 和索引）；
     * 等不到就强杀，此时已写入的 fMP4 片段依然可以播放。
     */
    async function stop({ timeoutMs = 5000 } = {}) {
        if (stopped || child.exitCode !== null) return exitPromise
        stopped = true
        try { child.stdin.write('q') } catch (error) { /* 进程可能已经退出 */ }

        const timer = setTimeout(() => {
            if (child.exitCode === null) {
                try { child.kill() } catch (error) { /* ignore */ }
            }
        }, timeoutMs)

        const result = await exitPromise
        clearTimeout(timer)
        return result
    }

    return {
        pid: child.pid,
        startedAt,
        stop,
        get exited() { return child.exitCode !== null },
        killed: () => child.exitCode !== null,
        _child: child
    }
}

/**
 * 汇总近期采样，给出「是否过载」的判断。
 *
 * 判据不是单次 speed：ddagrab 在画面静止时会突增一批帧，
 * 瞬时 speed 掉到 0.5 很常见，但那不是过载。
 * 所以取最近 8 个采样的中位数，再叠加累计丢帧数的增长。
 */
function summarize(history) {
    if (!history || history.length === 0) {
        return { overloaded: false, medianSpeed: 0, dropped: 0, avgFps: 0, samples: 0 }
    }
    const recent = history.slice(-8)
    const speeds = recent.map((s) => s.speed).filter((v) => v > 0).sort((a, b) => a - b)
    const medianSpeed = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0
    const fpsList = recent.map((s) => s.fps).filter((v) => v > 0)
    const avgFps = fpsList.length ? fpsList.reduce((a, b) => a + b, 0) / fpsList.length : 0
    const last = history[history.length - 1]
    const first = recent[0]
    const dropped = Math.max(0, (last.dropFrames || 0) - (first.dropFrames || 0))

    return {
        // 速度跟不上 + 确实在丢帧，才算过载
        overloaded: medianSpeed > 0 && medianSpeed < 0.95 && dropped > 0,
        medianSpeed,
        dropped,
        avgFps,
        samples: history.length
    }
}

module.exports = { createSession, summarize }
