'use strict'

/**
 * 截图链路耗时基准（自己机器上验证用）。
 *
 *   npx electron scripts/capture-bench.js
 *
 * Windows 上 electron.exe 是 GUI 子系统程序，控制台看不到 stdout，
 * 所以结果同时写到 log/capture-bench.txt，跑完会打印文件路径。
 *
 * 对比的是「同一帧的两种处理方式」：
 *   旧：node-screenshots 自带 JPEG 编码器 / screenshot-desktop 外部进程抓屏
 *   新：Chromium(libjpeg-turbo) 编码 / node-screenshots 进程内抓屏
 */

const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const LOG_DIR = path.join(ROOT, 'log')
const REPORT = path.join(LOG_DIR, 'capture-bench.txt')

const rows = []
const round = (v) => Math.round(v * 10) / 10

async function timeIt(label, fn) {
    const started = process.hrtime.bigint()
    const value = await fn()
    const ms = round(Number(process.hrtime.bigint() - started) / 1e6)
    rows.push({ label, ms })
    return { value, ms }
}

function report(lines) {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.writeFileSync(REPORT, lines.join('\n') + '\n')
    process.stdout.write(lines.join('\n') + '\n')
}

app.whenReady().then(async () => {
    const lines = []
    try {
        const screenshot = require('screenshot-desktop')
        const { Window: SW, Monitor: SM } = require('node-screenshots')
        const { encodeCapturedImage, encodeJpegFromRaw } = require(path.join(ROOT, 'src/lib/captureEncode.js'))

        const monitor = SM.all()[0]
        if (!monitor) throw new Error('no monitor found')

        // ---- 整屏 ----
        await timeIt('旧·整屏 screenshot-desktop(jpg)', () => screenshot({ format: 'jpg' }))

        const monitorShot = await timeIt('新·整屏 抓屏(WGC)', () => monitor.captureImage())
        const image = monitorShot.value
        await timeIt('新·整屏 编码 png', () => encodeCapturedImage(image, 'png'))
        await timeIt('新·整屏 编码 jpg', () => encodeCapturedImage(image, 'jpg'))
        await timeIt('旧·整屏 编码 node-screenshots toJpeg', () => image.toJpeg(true))

        // ---- 窗口 ----
        const windows = SW.all()
        const target = windows
            .filter((item) => item.title && item.width > 200 && item.height > 200 && !item.isMinimized)
            .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]

        if (target) {
            const captured = await timeIt('新·窗口 抓屏(WGC)', () => target.captureImage())
            const windowImage = captured.value
            await timeIt('新·窗口 取 raw(RGBA)', () => windowImage.toRaw(true))
            const rawShot = await windowImage.toRaw(true)
            await timeIt('新·窗口 编码 jpg', () => encodeJpegFromRaw(windowImage, rawShot, 92))
            await timeIt('旧·窗口 编码 node-screenshots toJpeg', () => windowImage.toJpeg(true))
            lines.push(`窗口目标: ${String(target.title).slice(0, 48)} ${windowImage.width}×${windowImage.height}`)
        }

        lines.push(`显示器: ${monitor.name} ${image.width}×${image.height} ${monitor.frequency}Hz`)
        lines.push('')
        const width = Math.max(...rows.map((row) => row.label.length))
        rows.forEach((row) => lines.push(`${row.label.padEnd(width)}  ${String(row.ms).padStart(7)} ms`))
        lines.push('')
        lines.push(`报告: ${REPORT}`)
        report(lines)
    } catch (error) {
        lines.push('基准测试失败: ' + String((error && error.stack) || error))
        report(lines)
    }
    app.exit(0)
})
