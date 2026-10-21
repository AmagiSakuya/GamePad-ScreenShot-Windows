'use strict'

/**
 * 拉取内置的 ffmpeg.exe 到 vendor/ffmpeg/。
 *
 * 为什么不把 160MB 的 exe 塞进仓库：
 * git 里放大二进制会让所有人的 clone 都变慢，而且改动无法 diff。
 * 所以改成「构建前跑一次这个脚本」，产物目录进 .gitignore。
 *
 *   node scripts/fetch-ffmpeg.js            已存在就跳过
 *   node scripts/fetch-ffmpeg.js --force    强制重新下载
 *
 * 国内直连 GitHub 通常很慢（实测 20KB/s），默认走加速镜像；
 * 需要换源时设置环境变量：
 *   FFMPEG_MIRROR=https://gh-proxy.com/ node scripts/fetch-ffmpeg.js --force
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TARGET_DIR = path.join(ROOT, 'vendor', 'ffmpeg')
const TARGET_EXE = path.join(TARGET_DIR, 'ffmpeg.exe')

const MIRROR = process.env.FFMPEG_MIRROR || 'https://gh-proxy.com/'
const SOURCE = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
const URL = MIRROR + SOURCE

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest)
        const request = (currentUrl, redirects = 0) => {
            https.get(currentUrl, { headers: { 'User-Agent': 'gamepad-screenshot-build' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
                    res.resume()
                    request(res.headers.location, redirects + 1)
                    return
                }
                if (res.statusCode !== 200) {
                    res.resume()
                    reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`))
                    return
                }
                const total = Number(res.headers['content-length']) || 0
                let received = 0
                let lastPrint = 0
                res.on('data', (chunk) => {
                    received += chunk.length
                    const now = Date.now()
                    if (now - lastPrint > 1000) {
                        lastPrint = now
                        const pct = total ? ((received / total) * 100).toFixed(1) : '?'
                        process.stdout.write(`\r  ${(received / 1024 / 1024).toFixed(1)}MB / ${total ? (total / 1024 / 1024).toFixed(1) + 'MB' : '?'}  ${pct}%   `)
                    }
                })
                res.pipe(file)
                file.on('finish', () => {
                    file.close(() => {
                        process.stdout.write('\n')
                        resolve()
                    })
                })
            }).on('error', reject)
        }
        request(url)
    })
}

function expand(zipPath, outDir) {
    // Windows 10+ 自带 bsdtar，能直接解 zip；PowerShell 做兜底
    try {
        execFileSync('tar', ['-xf', zipPath, '-C', outDir], { stdio: 'inherit' })
        return
    } catch (error) {
        execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force`], { stdio: 'inherit' })
    }
}

function findFile(dir, name) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            const found = findFile(full, name)
            if (found) return found
        } else if (entry.name === name) {
            return full
        }
    }
    return null
}

async function main() {
    const force = process.argv.includes('--force')

    if (fs.existsSync(TARGET_EXE) && !force) {
        const size = fs.statSync(TARGET_EXE).size
        console.log(`已存在：${TARGET_EXE}（${(size / 1024 / 1024).toFixed(0)}MB），跳过`)
        console.log('需要重新下载请加 --force')
        return
    }

    if (process.platform !== 'win32') {
        console.warn('警告：本脚本下载的是 Windows 版 ffmpeg，当前平台可能不适用')
    }

    fs.mkdirSync(TARGET_DIR, { recursive: true })
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-fetch-'))
    const zipPath = path.join(workDir, 'ffmpeg.zip')

    console.log('下载 ' + URL)
    await download(URL, zipPath)

    console.log('解压…')
    expand(zipPath, workDir)

    const exe = findFile(workDir, 'ffmpeg.exe')
    if (!exe) throw new Error('压缩包里没找到 ffmpeg.exe')

    fs.copyFileSync(exe, TARGET_EXE)
    fs.rmSync(workDir, { recursive: true, force: true })

    const size = fs.statSync(TARGET_EXE).size
    console.log(`完成：${TARGET_EXE}（${(size / 1024 / 1024).toFixed(0)}MB）`)

    // 顺手校验关键能力，避免下载到不含 gfxcapture 的旧版本
    try {
        const out = execFileSync(TARGET_EXE, ['-hide_banner', '-filters'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
        const hasGfx = /gfxcapture/.test(out)
        const hasDda = /ddagrab/.test(out)
        console.log(`采集源：gfxcapture=${hasGfx ? '有' : '缺失'}  ddagrab=${hasDda ? '有' : '缺失'}`)
        if (!hasGfx || !hasDda) {
            console.warn('警告：这个构建缺少必要的采集滤镜，窗口/全屏录制会不可用')
        }
    } catch (error) {
        console.warn('能力校验跳过：' + error.message)
    }
}

main().catch((error) => {
    console.error('\n下载失败：' + error.message)
    console.error('国内网络建议改用镜像：')
    console.error('  FFMPEG_MIRROR=https://gh-proxy.com/ node scripts/fetch-ffmpeg.js --force')
    process.exit(1)
})
