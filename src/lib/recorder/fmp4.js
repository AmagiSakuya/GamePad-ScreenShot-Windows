'use strict'

/**
 * fMP4 分片解析 + 内存环形缓冲。
 *
 * 这是「长按保存最近 30 秒」的实现核心，等价于 OBS 的 replay buffer，
 * 但缓冲放在主进程内存里，不写盘。
 *
 * 为什么用分片 MP4（fragmented MP4）而不是 webm / 裸流：
 *   ffmpeg 用 `-movflags +frag_keyframe+empty_moov` 输出时，整个文件是
 *     ftyp + moov（只含结构，不含样本） + (moof + mdat) × N
 *   每个 moof 对应一个关键帧起始的 GOP。这意味着：
 *     1) 任意一个 (moof+mdat) 都是自包含的，从中间开始解码不会有花屏；
 *     2) 丢弃前面的片段不需要重编码，剩下的拼起来就是合法文件；
 *     3) 录制进程意外挂掉，已写入的部分也能直接播放。
 *   webm 做不到这点（block 依赖 EBML 头的 Duration/SeekHead），
 *   裸 H.264 流则需要自己写 SPS/PPS 和容器，得不偿失。
 *
 * 时长一律按 tfdt 里的 baseMediaDecodeTime / mdhd timescale 计算，
 * 不按帧数 —— 采集源是 VFR（画面静止时不出帧），按帧数会算错。
 */

const fs = require('fs')

/** 读一个 box 头。数据不完整时返回 null，等下一个 chunk。 */
function readBox(buf, offset) {
    if (buf.length < offset + 8) return null
    let size = buf.readUInt32BE(offset)
    const type = buf.toString('latin1', offset + 4, offset + 8)
    let headerSize = 8
    if (size === 1) {
        if (buf.length < offset + 16) return null
        size = Number(buf.readBigUInt64BE(offset + 8))
        headerSize = 16
    } else if (size === 0) {
        // size 0 表示「一直到文件末尾」，直播流里常见，这里没法预判，先等
        return null
    }
    if (size < headerSize) return null
    if (buf.length < offset + size) return null
    return { start: offset, size, headerSize, type }
}

/** 遍历 buffer 里从 offset 到 end 的所有子 box（只返回已完整的） */
function forEachBox(buf, offset, end, callback) {
    let pos = offset
    while (pos < end) {
        const box = readBox(buf, pos)
        if (!box || box.start + box.size > end) return
        callback(box)
        pos += box.size
    }
}

/** mdhd 里的 timescale（track 的时间刻度，tfdt 的 baseMediaDecodeTime 就以它为分母） */
function readMdhdTimescale(buf, box) {
    const p = box.start + box.headerSize
    const version = buf[p]
    // version 0: creation(4) modification(4) timescale(4)
    // version 1: creation(8) modification(8) timescale(4)
    const offset = version === 1 ? p + 4 + 8 + 8 : p + 4 + 4 + 4
    if (offset + 4 > buf.length) return 0
    return buf.readUInt32BE(offset)
}

/** 从 moov 里取第一个 trak 的 timescale（本项目只录视频轨） */
function parseMoovTimescale(moovBuf, moovBox) {
    let timescale = 0
    forEachBox(moovBuf, moovBox.start + moovBox.headerSize, moovBox.start + moovBox.size, (child) => {
        if (timescale || child.type !== 'trak') return
        forEachBox(moovBuf, child.start + child.headerSize, child.start + child.size, (mdia) => {
            if (timescale || mdia.type !== 'mdia') return
            forEachBox(moovBuf, mdia.start + mdia.headerSize, mdia.start + mdia.size, (mdhd) => {
                if (mdhd.type === 'mdhd') timescale = readMdhdTimescale(moovBuf, mdhd)
            })
        })
    })
    return timescale
}

/**
 * 定位 moof 里的 tfdt。
 *
 * 除了值本身，还要返回「值在 buffer 里的字节位置」——
 * 保存时要把时间轴归零，直接原地改写这几个字节，比重封装一次快得多。
 */
function locateTfdt(moofBuf, moofBox) {
    let result = null
    forEachBox(moofBuf, moofBox.start + moofBox.headerSize, moofBox.start + moofBox.size, (traf) => {
        if (result || traf.type !== 'traf') return
        forEachBox(moofBuf, traf.start + traf.headerSize, traf.start + traf.size, (child) => {
            if (result || child.type !== 'tfdt') return
            const p = child.start + child.headerSize
            const version = moofBuf[p]
            let value = null
            if (version === 1) {
                if (p + 4 + 8 <= moofBuf.length) value = Number(moofBuf.readBigUInt64BE(p + 4))
            } else {
                if (p + 4 + 4 <= moofBuf.length) value = moofBuf.readUInt32BE(p + 4)
            }
            if (value !== null) result = { value, offset: p + 4, version }
        })
    })
    return result
}

/** 原地改写 tfdt 的 baseMediaDecodeTime */
function writeBaseMediaDecodeTime(buf, offset, version, value) {
    const v = Math.max(0, Math.round(value))
    if (version === 1) {
        buf.writeBigUInt64BE(BigInt(v), offset)
    } else {
        buf.writeUInt32BE(Math.min(0xffffffff, v), offset)
    }
}

/** 从 moof 里取 tfdt 的 baseMediaDecodeTime（单位：timescale tick） */
function parseBaseMediaDecodeTime(moofBuf, moofBox) {
    const tfdt = locateTfdt(moofBuf, moofBox)
    return tfdt ? tfdt.value : null
}

class Fmp4RingBuffer {
    /**
     * @param {object} options
     *   durationSeconds — 保留最近多少秒
     *   maxBytes        — 内存上限兜底（防止高码率把内存吃爆）
     *   fps             — 只用于估算最后一个片段的时长
     */
    constructor(options = {}) {
        this.durationSeconds = Math.max(1, Number(options.durationSeconds) || 30)
        this.maxBytes = Math.max(16 * 1024 * 1024, Number(options.maxBytes) || 512 * 1024 * 1024)
        this.estimatedFragmentSeconds = Math.max(0.2, Number(options.fragmentSeconds) || 1)

        // ftyp + moov，保存时必须放在最前面
        this.initSegment = null
        this.timescale = 0
        // { data: Buffer(moof+mdat), startTime: 秒, duration: 秒 }
        this.fragments = []
        this.totalBytes = 0

        // 解析状态
        this._pending = Buffer.alloc(0)
        this._pendingMoof = null
        this._fallbackStartTime = 0
    }

    /** 喂入 ffmpeg stdout 的数据 */
    push(chunk) {
        if (!chunk || chunk.length === 0) return
        this._pending = this._pending.length === 0 ? chunk : Buffer.concat([this._pending, chunk])
        this._drain()
    }

    _drain() {
        let guard = 0
        while (this._pending.length >= 8 && guard++ < 4096) {
            const box = readBox(this._pending, 0)
            if (!box) break

            const data = this._pending.subarray(0, box.size)
            this._pending = this._pending.subarray(box.size)

            if (box.type === 'ftyp' || box.type === 'moov') {
                this._appendInit(Buffer.from(data), box)
            } else if (box.type === 'moof') {
                // moof 单独没用，要等紧跟的 mdat 拼成一个完整片段
                this._pendingMoof = Buffer.from(data)
            } else if (box.type === 'mdat') {
                if (this._pendingMoof) {
                    const fragment = Buffer.concat([this._pendingMoof, Buffer.from(data)])
                    this._pendingMoof = null
                    this._pushFragment(fragment)
                }
            }
            // 其他 box（sidx/mfra 等）直接丢：环形缓冲不需要随机访问索引
        }
    }

    _appendInit(data, box) {
        this.initSegment = this.initSegment ? Buffer.concat([this.initSegment, data]) : data
        if (box.type === 'moov') {
            const ts = parseMoovTimescale(data, { ...box, start: 0 })
            if (ts > 0) this.timescale = ts
        }
    }

    _pushFragment(data) {
        let startTime = this._fallbackStartTime
        let tfdt = null

        if (this.timescale > 0) {
            // 从片段自己的 moof 里读 tfdt —— 用 ffmpeg 给的绝对时间轴，
            // 比自己累加帧间隔可靠（VFR 下帧间隔不固定）
            const moof = readBox(data, 0)
            if (moof && moof.type === 'moof') {
                tfdt = locateTfdt(data.subarray(0, moof.size), { ...moof, start: 0 })
                if (tfdt) startTime = tfdt.value / this.timescale
            }
        }

        // 新片段的时间起点就是上一个片段的终点，用它回填上一个片段的实际时长
        const prev = this.fragments[this.fragments.length - 1]
        if (prev) {
            const gap = startTime - prev.startTime
            prev.duration = gap > 0 ? gap : prev.duration
        }

        this.fragments.push({
            data,
            startTime,
            duration: this.estimatedFragmentSeconds,
            // 保存时把整段的时间轴整体平移到 0，这三项是改写 tfdt 需要的全部信息
            tfdtOffset: tfdt ? tfdt.offset : -1,
            tfdtVersion: tfdt ? tfdt.version : 0,
            tfdtTicks: tfdt ? tfdt.value : null
        })
        this.totalBytes += data.length
        this._fallbackStartTime = startTime + this.estimatedFragmentSeconds

        this._trim()
    }

    /** 淘汰旧片段：保留「最后一片的结束时间 - N 秒」之后的所有片段 */
    _trim() {
        const last = this.fragments[this.fragments.length - 1]
        if (!last) return
        const endTime = last.startTime + last.duration

        while (this.fragments.length > 1) {
            const first = this.fragments[0]
            const tooOld = endTime - first.startTime > this.durationSeconds
            const tooBig = this.totalBytes > this.maxBytes
            if (!tooOld && !tooBig) break
            this.fragments.shift()
            this.totalBytes -= first.data.length
        }
    }

    /** 当前缓冲里实际覆盖的时长（秒） */
    get duration() {
        if (this.fragments.length === 0) return 0
        const first = this.fragments[0]
        const last = this.fragments[this.fragments.length - 1]
        return Math.max(0, last.startTime + last.duration - first.startTime)
    }

    get fragmentCount() {
        return this.fragments.length
    }

    get byteLength() {
        return (this.initSegment ? this.initSegment.length : 0) + this.totalBytes
    }

    get ready() {
        return !!(this.initSegment && this.fragments.length > 0)
    }

    /**
     * 取出「最近 N 秒」拼成一个可播放的 MP4。
     *
     * 关键一步是把时间轴归零：保留的片段带着原始录制时间轴上的
     * baseMediaDecodeTime（比如从第 5.25 秒开始），不处理的话播放器
     * 会把前 5 秒当成空白，一个 2 秒的片段显示成 7 秒黑屏。
     * 这里直接改 tfdt 的 8 个字节，不做重封装。
     */
    snapshot() {
        if (!this.ready) return null

        const baseTicks = this.fragments[0].tfdtTicks
        const pieces = this.fragments.map((f) => {
            if (f.tfdtOffset < 0 || f.tfdtTicks === null || baseTicks === null) return f.data
            const copy = Buffer.from(f.data)
            writeBaseMediaDecodeTime(copy, f.tfdtOffset, f.tfdtVersion, f.tfdtTicks - baseTicks)
            return copy
        })
        return Buffer.concat([this.initSegment, ...pieces])
    }

    /**
     * 落盘。
     * 分片 MP4 大多数播放器都能直接播，但剪辑软件 / Windows 自带播放器
     * 对分片格式兼容性一般，所以调用方可以再用 ffmpeg `-c copy` 快速重封装一次。
     */
    async save(filePath) {
        const buffer = this.snapshot()
        if (!buffer) throw new Error('Replay buffer is empty')
        await fs.promises.writeFile(filePath, buffer)
        return { bytes: buffer.length, fragments: this.fragments.length, duration: this.duration }
    }

    clear() {
        this.initSegment = null
        this.timescale = 0
        this.fragments = []
        this.totalBytes = 0
        this._pending = Buffer.alloc(0)
        this._pendingMoof = null
        this._fallbackStartTime = 0
    }
}

module.exports = { Fmp4RingBuffer, readBox, parseMoovTimescale, parseBaseMediaDecodeTime }
