'use strict'

/**
 * 系统声音冒烟测试：真机验证「循环录制带声音」这条链路。
 *
 *   node scripts/audio-smoke.js              用默认输出设备，缓冲 3 秒
 *   node scripts/audio-smoke.js --sec 5      自定义缓冲时长
 *   node scripts/audio-smoke.js --strict     把「音量必须非静音」也当成失败
 *
 * 校验点：
 *   1) 能枚举到输出设备（WASAPI 渲染端点）
 *   2) 采集进程能起来并给出格式（s16le/48k/2ch 或设备混音格式）
 *   3) 保存出来的回放文件有音轨，且音轨时长和视频对得上
 *   4) 音轨不是静音（--strict 时强制；默认只提示，因为有些机器扬声器被静音）
 *
 * 为什么要放一段声音：WASAPI 环回在设备完全空闲时不出包，
 * 不主动播声音的话「音轨正常但全是静音」和「根本没录到」看起来一样。
 */

const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const { createRecorder } = require('../src/lib/recorder')
const { run } = require('../src/lib/recorder/ffmpeg')
const { readBox, locateTfdts } = require('../src/lib/recorder/fmp4')

const ROOT = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const secIndex = argv.indexOf('--sec')
const BUFFER_SECONDS = secIndex >= 0 ? Number(argv[secIndex + 1]) || 3 : 3
const STRICT = argv.includes('--strict')
const RECORD_MS = (BUFFER_SECONDS + 5) * 1000
const WAV = path.join(ROOT, 'src/assets/sound-soft-chime.wav')

/** 用系统默认输出设备循环播放一段 wav，让环回有真实声音可抓 */
function playSound(seconds) {
    const script = `$p = New-Object System.Media.SoundPlayer '${WAV.replace(/'/g, "''")}'; ` +
        `$sw = [Diagnostics.Stopwatch]::StartNew(); while ($sw.Elapsed.TotalSeconds -lt ${seconds}) { $p.PlaySync() }`
    try {
        return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true })
    } catch (error) {
        return null
    }
}

async function main() {
    const recorder = createRecorder({
        isPackaged: false,
        appPath: ROOT,
        // 脚本落到项目目录下的临时位置，测试结束手动清理
        audioScriptDir: path.join(os.tmpdir(), 'gp-audio-smoke'),
        log: { info: () => {}, warn: () => {}, error: () => {} }
    })

    const list = await recorder.listAudioDevices({ force: true })
    if (!list.ok || list.devices.length === 0) {
        console.log(`SKIP 枚举不到输出设备（${list.error || 'empty'}）`)
        return
    }
    const target = list.devices.find((d) => d.default) || list.devices[0]
    console.log(`设备 ${list.devices.length} 个，使用「${target.name}」`)

    const probe = await recorder.probeAudioDevice(target.id)
    if (!probe.ok) {
        console.log(`FAIL 设备打不开：${probe.error}`)
        process.exit(1)
    }
    console.log(`格式 ${probe.sampleFormat} ${probe.sampleRate}Hz ${probe.channels}ch${probe.converted ? '（引擎已转换）' : ''}`)

    const caps = await recorder.getCapabilities()
    const usable = caps.encoders.filter((e) => e.available)
    const preferred = ['h264_nvenc', 'h264_qsv', 'libx264']
    const chosen = preferred.map((id) => usable.find((e) => e.id === id)).find(Boolean) || usable[0]
    console.log(`引擎 ${chosen.id}  缓冲 ${BUFFER_SECONDS}s  录制 ${RECORD_MS / 1000}s`)

    const started = await recorder.startReplayBuffer({
        target: { type: 'screen', displayIndex: 0 },
        encoderId: chosen.id,
        fps: 60,
        mode: 'quality',
        quality: 23,
        bufferSeconds: BUFFER_SECONDS,
        audio: { deviceId: target.id }
    }, {
        onProgress: (sample) => {
            const b = sample.buffer
            if (b && b.duration > 0) {
                process.stdout.write(`\r  缓冲 ${b.duration.toFixed(1)}s / ${BUFFER_SECONDS}s  片段=${b.fragments}  `)
            }
        }
    })

    if (started.meta && started.meta.audioError) {
        process.stdout.write('\n')
        console.log(`FAIL 采集启动失败：${started.meta.audioError}`)
        await recorder.stopReplayBuffer()
        process.exit(1)
    }
    if (!started.meta || !started.meta.audio) {
        process.stdout.write('\n')
        console.log('FAIL 命令里没有音频输入（meta.audio 为空）')
        await recorder.stopReplayBuffer()
        process.exit(1)
    }
    console.log(`\n  音频输入 ${started.meta.audio.sampleFormat} ${started.meta.audio.sampleRate}Hz/${started.meta.audio.channels}ch`)

    const player = playSound(RECORD_MS / 1000)
    await new Promise((resolve) => setTimeout(resolve, RECORD_MS))
    if (player) { try { player.kill() } catch (error) { /* ignore */ } }
    process.stdout.write('\n')

    const outFile = path.join(os.tmpdir(), `replay-audio-${Date.now()}.mp4`)
    const saved = await recorder.saveReplay(outFile)
    console.log(`  保存 ${(saved.bytes / 1024 / 1024).toFixed(2)}MB → ${outFile}`)

    const info = await run(recorder.ffmpegPath(), ['-hide_banner', '-i', outFile], 15000)
    const durationMatch = info.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/)
    const durationSec = durationMatch
        ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
        : 0
    const hasVideo = /Stream #\d+:\d+.*: Video: /.test(info.stderr)
    const audioLine = (info.stderr.match(/Stream #\d+:\d+.*: Audio: ([^\r\n]+)/) || [])[1] || ''
    const hasAudio = !!audioLine

    /**
     * 时间轴归零校验。
     *
     * 保存回放片段时要把 tfdt 改成「相对第一片」的值，而且必须逐条轨道改。
     * 只改视频轨的话，音频会保留绝对录制时间（录了 10 分钟才保存的话
     * 音频从第 600 秒开始），播放器里表现为整段没有声音。
     * 这里直接读保存后文件的第一片 moof，要求每条轨道的 tfdt 都是 0。
     */
    let tfdtDetail = ''
    let tfdtOk = true
    try {
        const buf = fs.readFileSync(outFile)
        let pos = 0
        let firstMoof = null
        while (pos + 8 <= buf.length) {
            const box = readBox(buf, pos)
            if (!box) break
            if (box.type === 'moof') { firstMoof = box; break }
            pos += box.size
        }
        if (!firstMoof) {
            tfdtOk = false
            tfdtDetail = '找不到 moof'
        } else {
            // 只取这个 moof 自己的字节，起始位置归零后再解析
            const slice = buf.subarray(firstMoof.start, firstMoof.start + firstMoof.size)
            const items = locateTfdts(slice, { type: 'moof', start: 0, size: firstMoof.size, headerSize: firstMoof.headerSize })
            const bad = items.filter((item) => item.value !== 0)
            tfdtOk = items.length > 0 && bad.length === 0
            tfdtDetail = items.length + ' 条轨道，非零 ' + bad.length
        }
    } catch (error) {
        tfdtOk = false
        tfdtDetail = error.message
    }

    // 音量：静音轨也要能测出来（max_volume 一般是 -91dB）
    const vol = await run(recorder.ffmpegPath(),
        ['-hide_banner', '-i', outFile, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], 20000)
    const maxVol = Number((vol.stderr.match(/max_volume: (-?[\d.]+) dB/) || [])[1])
    const meanVol = Number((vol.stderr.match(/mean_volume: (-?[\d.]+) dB/) || [])[1])

    await recorder.stopReplayBuffer()

    const lower = BUFFER_SECONDS * 0.6
    const upper = BUFFER_SECONDS + 3
    const checks = [
        ['有视频轨', hasVideo],
        ['有音频轨', hasAudio],
        [`时长 ${durationSec.toFixed(2)}s 在 [${lower.toFixed(1)}, ${upper.toFixed(1)}]`, durationSec >= lower && durationSec <= upper],
        ['文件非空', fs.statSync(outFile).size > 0],
        [`音视频时间轴都已归零（${tfdtDetail}）`, tfdtOk]
    ]
    if (Number.isFinite(meanVol)) {
        const audible = meanVol > -60
        checks.push([`音轨不是静音（mean ${meanVol.toFixed(1)}dB / max ${maxVol.toFixed(1)}dB）`, audible || !STRICT])
    }

    console.log('')
    if (hasAudio) console.log(`  音轨：${audioLine.trim()}`)
    let failed = 0
    for (const [label, ok] of checks) {
        console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`)
        if (!ok) failed++
    }
    if (failed > 0) process.exit(1)
    // 成功后删掉测试文件，别在临时目录堆垃圾
    try { fs.unlinkSync(outFile) } catch (error) { /* ignore */ }
}

main().catch((error) => {
    console.error('系统声音测试失败：', error)
    process.exit(1)
})
