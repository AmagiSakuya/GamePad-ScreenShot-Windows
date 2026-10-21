'use strict'

/**
 * 系统声音采集（WASAPI 环回）。
 *
 * 采集到的 PCM 走「命名管道」交给 ffmpeg 作为第二路输入，
 * 不用 stdin 是因为 ffmpeg 的 stdin 要留给 'q'（优雅收尾，写完 moov）。
 *
 * 进程关系：
 *   本模块 spawn powershell.exe（执行 wasapi-capture.ps1）
 *     → 脚本内建命名管道服务器 \\.\pipe\<name>
 *     → ffmpeg 用 `-f s16le -i \\.\pipe\<name>` 当输入连上去
 *   顺序必须是「先起采集进程（等连接）→ 再起 ffmpeg（去连接）」。
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { WASAPI_SCRIPT, SCRIPT_VERSION } = require('./wasapiScript')

const POWERSHELL = 'powershell.exe'

// 设备列表缓存：枚举一次要 ~1.5s（PowerShell 启动 + 编译），
// 设置页反复展开收起时没必要每次都付这个成本。
const LIST_CACHE_MS = 5000

// 首次启动要现场编译 C#，给足余量；之后约 0.6s
const START_TIMEOUT_MS = 25000

function createAudioCapture(deps = {}) {
    const { app, log = console, scriptDir = '' } = deps

    let scriptPath = ''
    let scriptError = ''
    let lastDevices = null
    let lastDevicesAt = 0
    const active = new Set()

    function baseDir() {
        if (scriptDir) return scriptDir
        if (app && typeof app.getPath === 'function') return app.getPath('userData')
        return process.cwd()
    }

    function ensureScript() {
        const target = path.join(baseDir(), `wasapi-capture-v${SCRIPT_VERSION}.ps1`)
        if (scriptPath === target && fs.existsSync(target)) return true
        try {
            fs.mkdirSync(path.dirname(target), { recursive: true })
            // 带 BOM：Windows PowerShell 5.1 读无 BOM 的 UTF-8 会按 ANSI 解码，
            // 脚本里的中文注释会被转坏（虽然只是注释，但容易连带吃掉下一行）
            fs.writeFileSync(target, '\ufeff' + WASAPI_SCRIPT, 'utf8')
            scriptPath = target
            scriptError = ''
            return true
        } catch (error) {
            scriptError = error.message || String(error)
            log.error('[audio] failed to write capture script:', error)
            return false
        }
    }

    /** 跑一次脚本并拿 stdout 的全部文本（list / probe 两种模式共用） */
    function runOnce(args, timeoutMs = 20000) {
        return new Promise((resolve) => {
            if (!ensureScript()) {
                resolve({ ok: false, out: '', err: scriptError })
                return
            }
            let child
            try {
                child = spawn(POWERSHELL, [
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-WindowStyle', 'Hidden', '-File', scriptPath, ...args
                ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
            } catch (error) {
                resolve({ ok: false, out: '', err: error.message })
                return
            }

            let out = ''
            let err = ''
            let settled = false
            const finish = (result) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve(result)
            }
            const timer = setTimeout(() => {
                try { child.kill() } catch (error) { /* ignore */ }
                finish({ ok: false, out, err: err || 'timeout' })
            }, timeoutMs)

            child.stdout.setEncoding('utf8')
            child.stdout.on('data', (chunk) => { out += chunk })
            child.stderr.setEncoding('utf8')
            child.stderr.on('data', (chunk) => { err += chunk })
            child.on('error', (error) => finish({ ok: false, out, err: error.message }))
            child.on('exit', (code) => {
                const text = out.trim()
                if (text.startsWith('ERR|') || text.startsWith('err|')) {
                    finish({ ok: false, out: text, err: text.slice(4) })
                } else {
                    finish({ ok: code === 0, out: text, err })
                }
            })
        })
    }

    /**
     * 列出所有「输出设备」（eRender 端点）。
     * 这些才是用户截图里那些 扬声器 / HDMI / S/PDIF —— 环回只能抓它们。
     */
    async function listDevices({ force = false } = {}) {
        const now = Date.now()
        if (!force && lastDevices && now - lastDevicesAt < LIST_CACHE_MS) {
            return { ok: true, devices: lastDevices, cached: true }
        }
        const result = await runOnce(['-Mode', 'list'])
        if (!result.ok) {
            return { ok: false, devices: [], error: result.err || 'list failed' }
        }
        try {
            const devices = JSON.parse(result.out)
            if (!Array.isArray(devices)) throw new Error('bad payload')
            lastDevices = devices
            lastDevicesAt = now
            return { ok: true, devices }
        } catch (error) {
            log.warn('[audio] device list parse failed:', error.message, result.out.slice(0, 200))
            return { ok: false, devices: [], error: 'parse failed' }
        }
    }

    /** 不建管道、只问「这个设备能不能开、什么格式」，用于设置页自检 */
    async function probe(deviceId = '') {
        const result = await runOnce(['-Mode', 'probe', '-DeviceId', deviceId || ''])
        if (!result.ok) return { ok: false, error: result.err || 'probe failed' }
        const seg = result.out.split('|')
        if (seg[0] !== 'ok') return { ok: false, error: seg.slice(1).join('|') || 'probe failed' }
        return {
            ok: true,
            sampleRate: Number(seg[1]) || 48000,
            channels: Number(seg[2]) || 2,
            sampleFormat: seg[3] || 's16le',
            converted: seg[4] === '1'
        }
    }

    /**
     * 启动采集进程。resolve 时管道服务器已建好、正等 ffmpeg 连接。
     * @returns {Promise<{pipePath, sampleRate, channels, sampleFormat, kill, stop}>}
     */
    function start({ deviceId = '' } = {}) {
        if (!ensureScript()) {
            return Promise.reject(new Error(scriptError || 'capture script unavailable'))
        }
        const pipeName = `gp-audio-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        let child
        try {
            child = spawn(POWERSHELL, [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden', '-File', scriptPath,
                '-Mode', 'capture', '-DeviceId', deviceId || '', '-Pipe', pipeName
            ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        } catch (error) {
            return Promise.reject(error)
        }

        return new Promise((resolve, reject) => {
            let buffer = ''
            let settled = false
            let stderr = ''

            const handle = {
                pipePath: `\\\\.\\pipe\\${pipeName}`,
                sampleRate: 48000,
                channels: 2,
                sampleFormat: 's16le',
                pid: child.pid,
                alive: () => child.exitCode === null,
                kill() {
                    active.delete(handle)
                    try { child.kill() } catch (error) { /* 已退出 */ }
                },
                /** 优雅停止：先关管道（ffmpeg 侧读不到数据会自行收尾），短暂等待后强杀 */
                stop(waitMs = 300) {
                    active.delete(handle)
                    if (child.exitCode !== null) return Promise.resolve()
                    return new Promise((done) => {
                        const timer = setTimeout(() => {
                            try { child.kill() } catch (error) { /* ignore */ }
                            done()
                        }, waitMs)
                        child.once('exit', () => { clearTimeout(timer); done() })
                        try { child.kill() } catch (error) { clearTimeout(timer); done() }
                    })
                }
            }

            const fail = (message) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                try { child.kill() } catch (error) { /* ignore */ }
                reject(new Error(message))
            }

            const timer = setTimeout(() => fail(`capture start timeout${stderr ? ': ' + stderr.slice(0, 160) : ''}`), START_TIMEOUT_MS)

            child.stdout.setEncoding('utf8')
            child.stdout.on('data', (chunk) => {
                buffer += chunk
                if (settled) return
                const line = buffer.split('\n')[0].trim()
                if (line.startsWith('READY|')) {
                    settled = true
                    clearTimeout(timer)
                    const seg = line.split('|')
                    handle.sampleRate = Number(seg[1]) || 48000
                    handle.channels = Number(seg[2]) || 2
                    handle.sampleFormat = seg[3] || 's16le'
                    active.add(handle)
                    resolve(handle)
                } else if (line.startsWith('ERR|')) {
                    fail(line.slice(4) || 'capture failed')
                }
            })

            child.stderr.setEncoding('utf8')
            child.stderr.on('data', (chunk) => {
                stderr += chunk
                const text = String(chunk).trim()
                if (text) log.warn('[audio] capture stderr:', text.slice(0, 200))
            })

            child.on('error', (error) => fail(error.message))
            child.on('exit', (code) => {
                active.delete(handle)
                if (!settled) fail(`capture exited with code ${code}`)
            })
        })
    }

    /** 强杀所有采集进程（app 退出、异常兜底） */
    function killAll() {
        for (const handle of Array.from(active)) {
            handle.kill()
        }
        active.clear()
    }

    return {
        listDevices,
        probe,
        start,
        killAll,
        get activeCount() { return active.size }
    }
}

module.exports = { createAudioCapture }
