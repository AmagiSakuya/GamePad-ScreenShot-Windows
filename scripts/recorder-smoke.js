'use strict'

/**
 * 录制引擎冒烟测试（不依赖 Electron，直接 node 跑）。
 *
 *   node scripts/recorder-smoke.js           完整跑：探测 + 逐编码器压测 + 录 3 秒
 *   node scripts/recorder-smoke.js --quick   只探测 + 录 3 秒
 *   node scripts/recorder-smoke.js --window  额外测窗口录制（取当前前台窗口）
 *
 * 这个脚本是后续接 UI 之前的唯一验证手段，
 * 改动 sources/encoders/command 之后都应该先跑一遍它。
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { createRecorder } = require('../src/lib/recorder')

const ROOT = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const QUICK = argv.includes('--quick')
const WITH_WINDOW = argv.includes('--window')

function line(char = '-', len = 68) {
    return char.repeat(len)
}

async function main() {
    const recorder = createRecorder({
        isPackaged: false,
        appPath: ROOT,
        log: { info: () => {} }
    })

    console.log(line('='))
    console.log('FFmpeg 路径')
    console.log('  ' + recorder.ffmpegPath())
    console.log(line('='))

    const caps = await recorder.getCapabilities()
    console.log(`版本  ${caps.version}`)
    console.log('')

    console.log('采集后端')
    for (const b of caps.backends) {
        console.log(`  ${b.available ? '可用  ' : '不可用'} ${b.id}${b.available ? '' : '  ← ' + b.reason}`)
    }
    console.log('')

    console.log('视频编码器')
    for (const e of caps.encoders) {
        const flag = e.available ? '可用  ' : '不可用'
        const meta = e.zeroCopy ? '零拷贝' : '需下载'
        console.log(`  ${flag} ${e.id.padEnd(14)} ${meta}  ${e.label}${e.available ? '' : '  ← ' + e.reason}`)
    }
    console.log('')

    const usable = caps.encoders.filter((e) => e.available)
    if (usable.length === 0) {
        console.error('没有任何可用编码器，无法继续')
        process.exit(1)
    }

    // 选择一个默认引擎：优先 NVENC，其次 QSV，最后 x264
    const preferred = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264']
    const chosen = preferred.map((id) => usable.find((e) => e.id === id)).find(Boolean) || usable[0]
    console.log(`默认引擎  ${chosen.id}`)
    console.log('')

    // 硬失败计数：分辨率组合这类「必须出帧」的检查失败时让脚本以非 0 退出，方便接 CI
    let failures = 0

    if (!QUICK) {
        console.log(line('='))
        console.log('逐个编码器端到端压测（真实采集 → 编码 1.5 秒）')
        console.log(line('-'))
        for (const enc of usable) {
            const result = await recorder.selfTest({
                target: { type: 'screen', displayIndex: 0 },
                encoderId: enc.id,
                fps: 60
            })
            const verdict = result.ok
                ? `OK   ${String(result.frames).padStart(4)} 帧  speed=${result.speed.toFixed(2)}x  丢帧=${result.dropFrames}`
                : `FAIL ${result.error}`
            console.log(`  ${enc.id.padEnd(14)} ${verdict}`)
        }
        console.log('')
    }

    // ===== 分辨率组合 =====
    //
    // 这一节是 2026-10-21 那次「NVENC 测试失败：speed=N/A」的回归闸门：
    // 用户在 4K 屏上选「3840×2160」——和桌面一样大——旧实现照样挂了 scale，
    // d3d11 硬件帧协商不出 CPU 像素格式，filtergraph 直接 0 帧退出。
    // 所以「同尺寸」和「真缩放」两条都必须能出帧。
    {
        const { probeSourceSize } = require('../src/lib/recorder/ffmpeg')
        const source = await probeSourceSize(recorder.ffmpegPath(), { displayIndex: 0 })
        if (!source.width) {
            console.log('分辨率组合：探测不到采集源尺寸，跳过')
        } else {
            console.log(line('='))
            console.log(`分辨率组合（源 ${source.width}×${source.height}，引擎 ${chosen.id}）`)
            console.log(line('-'))
            const combos = [
                ['同尺寸（不挂滤镜）', { width: source.width, height: source.height }],
                ['缩放到 1920×1080', { width: 1920, height: 1080 }]
            ]
            for (const [label, size] of combos) {
                const result = await recorder.selfTest({
                    target: { type: 'screen', displayIndex: 0 },
                    encoderId: chosen.id,
                    fps: 60,
                    sourceWidth: source.width,
                    sourceHeight: source.height,
                    ...size
                })
                // 判据是「有没有出帧」：静止桌面帧数少只是测不出负载，不算失败
                const ok = result.frames > 0
                if (!ok) failures++
                const detail = ok
                    ? `${String(result.frames).padStart(4)} 帧  speed=${result.speed.toFixed(2)}x${result.measured ? '' : '（静止画面，负载未测出）'}`
                    : (result.error || '没出帧')
                console.log(`  ${label.padEnd(18)} ${ok ? 'OK  ' : 'FAIL'} ${detail}`)
            }
            console.log('')
        }
    }

    // ===== 真实录制到文件 =====
    const outFile = path.join(os.tmpdir(), `recorder-smoke-${Date.now()}.mp4`)
    console.log(line('='))
    console.log('录制 3 秒 → ' + outFile)
    console.log(line('-'))

    let lastPrint = 0
    await recorder.startRecord(
        {
            target: { type: 'screen', displayIndex: 0 },
            encoderId: chosen.id,
            fps: 60,
            mode: 'quality',
            quality: 23,
            // 系统声音必录：带上 audio 段走和生产一致的链路（无设备时自动降级为无声）
            audio: {},
            output: { type: 'file', path: outFile }
        },
        {
            onProgress: (sample, summary) => {
                const now = Date.now()
                if (now - lastPrint < 500) return
                lastPrint = now
                console.log(
                    `  帧=${String(sample.frame).padStart(4)}  fps=${sample.fps.toFixed(1).padStart(5)}  ` +
                    `speed=${sample.speed.toFixed(2)}x  丢帧=${sample.dropFrames}` +
                    (summary.overloaded ? '  [过载]' : '')
                )
            },
            onLog: (logLine) => {
                if (/error|failed|invalid/i.test(logLine)) console.log('  [ffmpeg] ' + logLine)
            }
        }
    )

    await new Promise((resolve) => setTimeout(resolve, 3000))
    const stopResult = await recorder.stopRecord()
    console.log(`  停止：code=${stopResult ? stopResult.code : 'n/a'}  时长=${stopResult ? stopResult.durationMs : 0}ms`)

    if (fs.existsSync(outFile)) {
        const size = fs.statSync(outFile).size
        console.log(`  文件大小：${(size / 1024 / 1024).toFixed(2)} MB`)

        // 用 ffprobe 验证可播（这里直接读 fMP4 头，不依赖 ffprobe.exe）
        const { run } = require('../src/lib/recorder/ffmpeg')
        const probe = await run(recorder.ffmpegPath(), ['-hide_banner', '-i', outFile], 15000)
        const duration = (probe.stderr.match(/Duration: ([0-9:.]+)/) || [])[1]
        const stream = (probe.stderr.match(/Video: (\w+).*?(\d{3,5}x\d{3,5})/) || [])
        console.log(`  校验：时长=${duration || '未知'}  编码=${stream[1] || '?'}  分辨率=${stream[2] || '?'}`)
        console.log(`  输出：${outFile}`)
    } else {
        console.error('  录制文件不存在')
        process.exit(1)
    }

    if (WITH_WINDOW) {
        console.log('')
        console.log(line('='))
        console.log('窗口录制测试（前台窗口）')
        console.log(line('-'))
        try {
            const activeWin = require('active-win')
            const win = await activeWin()
            if (!win) {
                console.log('  没有前台窗口，跳过')
            } else {
                console.log(`  目标：${win.title} (hwnd=${win.id})`)
                const winFile = path.join(os.tmpdir(), `recorder-window-${Date.now()}.mp4`)
                let frames = 0
                await recorder.startRecord(
                    {
                        target: { type: 'window', hwnd: win.id },
                        encoderId: chosen.id,
                        fps: 30,
                        output: { type: 'file', path: winFile }
                    },
                    { onProgress: (s) => { frames = s.frame } }
                )
                await new Promise((resolve) => setTimeout(resolve, 2000))
                await recorder.stopRecord()
                const ok = fs.existsSync(winFile) && fs.statSync(winFile).size > 0
                console.log(`  ${ok ? 'OK' : 'FAIL'} 帧=${frames} 大小=${ok ? (fs.statSync(winFile).size / 1024).toFixed(0) + 'KB' : 0}`)
                if (ok) console.log(`  输出：${winFile}`)
            }
        } catch (error) {
            console.log('  窗口录制失败：' + error.message)
        }
    }

    console.log('')
    console.log(line('='))
    console.log(failures > 0 ? `完成，但有 ${failures} 项失败` : '完成')
    if (failures > 0) process.exitCode = 1
}

main().catch((error) => {
    console.error('冒烟测试失败：', error)
    process.exit(1)
})
