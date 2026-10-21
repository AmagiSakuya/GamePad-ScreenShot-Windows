'use strict'

/**
 * 回放缓存冒烟测试（等价于 OBS 的 Replay Buffer）。
 *
 *   node scripts/replay-smoke.js            缓冲 3 秒，录 8 秒，保存并校验时长
 *   node scripts/replay-smoke.js --sec 5    自定义缓冲时长
 *
 * 校验点：
 *   1) 缓冲时长是否接近设定值（允许 ±1 个 GOP）
 *   2) 保存出来的文件能否被 ffmpeg 正常解析、时长是否对得上
 *   3) 保存动作耗时（应当远小于录制时长，证明没有重编码）
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { createRecorder } = require('../src/lib/recorder')
const { run } = require('../src/lib/recorder/ffmpeg')

const ROOT = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const secIndex = argv.indexOf('--sec')
const BUFFER_SECONDS = secIndex >= 0 ? Number(argv[secIndex + 1]) || 3 : 3
const RECORD_MS = (BUFFER_SECONDS + 5) * 1000

async function main() {
    const recorder = createRecorder({
        isPackaged: false,
        appPath: ROOT,
        log: { info: () => {} }
    })

    const caps = await recorder.getCapabilities()
    const usable = caps.encoders.filter((e) => e.available)
    const preferred = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264']
    const chosen = preferred.map((id) => usable.find((e) => e.id === id)).find(Boolean) || usable[0]

    console.log(`引擎 ${chosen.id}  缓冲 ${BUFFER_SECONDS} 秒  录制 ${RECORD_MS / 1000} 秒`)

    const started = await recorder.startReplayBuffer(
        {
            target: { type: 'screen', displayIndex: 0 },
            encoderId: chosen.id,
            fps: 60,
            mode: 'quality',
            quality: 23,
            bufferSeconds: BUFFER_SECONDS,
            // 系统声音必录：回放缓存也要带上音频轨（否则和生产链路不一致）
            audio: {}
        },
        {
            onProgress: (sample) => {
                const b = sample.buffer
                if (b && b.duration > 0) {
                    process.stdout.write(
                        `\r  缓冲 ${b.duration.toFixed(1)}s / ${BUFFER_SECONDS}s  片段=${b.fragments}  ` +
                        `内存=${(b.bytes / 1024 / 1024).toFixed(1)}MB  speed=${sample.speed.toFixed(2)}x   `
                    )
                }
            }
        }
    )
    console.log(`  实际内存上限 ${(started.maxBytes / 1024 / 1024).toFixed(0)}MB`)

    await new Promise((resolve) => setTimeout(resolve, RECORD_MS))
    process.stdout.write('\n')

    const stateBefore = recorder.getReplayState()
    console.log(`  保存前：ready=${stateBefore.ready} 时长=${stateBefore.duration}s 片段=${stateBefore.fragments}`)

    const outFile = path.join(os.tmpdir(), `replay-${Date.now()}.mp4`)
    const t0 = Date.now()
    const saved = await recorder.saveReplay(outFile)
    const saveMs = Date.now() - t0

    console.log(`  保存耗时 ${saveMs}ms  写入 ${(saved.bytes / 1024 / 1024).toFixed(2)}MB`)

    const probe = await run(recorder.ffmpegPath(), ['-hide_banner', '-i', outFile], 15000)
    const durationText = (probe.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/) || [])
    const durationSec = durationText.length === 4
        ? Number(durationText[1]) * 3600 + Number(durationText[2]) * 60 + Number(durationText[3])
        : 0
    const stream = probe.stderr.match(/Video: (\w+).*?(\d{3,5}x\d{3,5})/) || []

    console.log(`  文件：${outFile}`)
    console.log(`  校验：时长=${durationSec.toFixed(2)}s  编码=${stream[1] || '?'}  分辨率=${stream[2] || '?'}`)

    await recorder.stopReplayBuffer()

    // 缓冲时长允许比设定值多一个 GOP（最后一个片段必然完整保留），但不能少太多
    const lower = BUFFER_SECONDS * 0.6
    const upper = BUFFER_SECONDS + (60 / 60) * 2 + 1
    const okDuration = durationSec >= lower && durationSec <= upper
    const okTime = saveMs < 2000

    console.log('')
    console.log(`  ${okDuration ? 'PASS' : 'FAIL'} 缓冲时长 ${durationSec.toFixed(2)}s 落在 [${lower.toFixed(1)}, ${upper.toFixed(1)}]`)
    console.log(`  ${okTime ? 'PASS' : 'FAIL'} 保存耗时 ${saveMs}ms < 2000ms（未重编码）`)
    console.log(`  ${fs.statSync(outFile).size > 0 ? 'PASS' : 'FAIL'} 文件非空`)

    if (!okDuration || !okTime) process.exit(1)
}

main().catch((error) => {
    console.error('回放缓存测试失败：', error)
    process.exit(1)
})
