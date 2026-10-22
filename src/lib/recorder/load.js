'use strict'

/**
 * 「编码器跟不跟得上」的唯一判定口径。
 *
 * 以前这里有两套判断，用户看到的就是自相矛盾：
 *   测试端（RecordingSettings.vue）—— drop_frames > 3 才算过载，speed < 1 一律说「可用」；
 *   运行时（session.js）—— 丢 1 帧 + speed 中位数 < 0.95 就报「编码过载」。
 * 于是同一台机器上「测试说可用，一开录就说过载」。
 *
 * 现在两边都只调这里，阈值也只在这里改。
 *
 * speed 是「编码速度 / 实时速度」：1.0 表示刚好追平，没有任何余量。
 * 但 speed < 1 本身不等于过载 —— 采集源是 VFR，画面静止时几乎不出帧，
 * 测出来的 speed 会偏高；真正会毁掉素材的是「跟不上 + 确实在丢帧」。
 */

// 有实时余量的界限。低于 1.0 就是「刚好追平或更慢」，只能算临界
const FULL_SPEED = 1.0
// 慢到这个程度，一旦有丢帧就认定过载
const OVERLOAD_SPEED = 0.95
// 慢到这个程度，即使当前没丢帧也撑不住（静止画面下 speed 会虚高）
const SEVERE_SPEED = 0.85
// 单帧抖动不报警：至少 2 帧。不用丢帧率当门槛 ——
// 统计窗口随 VFR 变化（3 秒可能只编出 90 帧），1 帧就占 1.1%，
// 按比例算反而比单帧更敏感，实测会把「整段只丢 1 帧」误报成过载
const DROP_FRAMES_MIN = 2

/**
 * @param {{ speed?: number, dropped?: number, frames?: number }} sample
 *   speed   —— 编码速度倍数（ffmpeg -progress 的 speed）
 *   dropped —— 统计窗口内的丢帧增量（不是累计值）
 *   frames  —— 同一个窗口内编出来的帧数，用来算丢帧率
 * @returns {{ level: 'ok'|'tight'|'overload', overloaded: boolean, tight: boolean,
 *             speed: number, dropped: number, frames: number, dropRate: number, margin: number }}
 */
function judgeLoad(sample = {}) {
    const speed = Number(sample.speed)
    const spd = Number.isFinite(speed) && speed > 0 ? speed : 0
    const dropped = Math.max(0, Math.round(Number(sample.dropped) || 0))
    const frames = Math.max(0, Math.round(Number(sample.frames) || 0))
    const dropRate = frames > 0 ? dropped / frames : 0

    // 丢 1 帧是 vsync 抖动，不代表撑不住
    const dropping = dropped >= DROP_FRAMES_MIN

    let level = 'ok'
    if (spd > 0 && spd < SEVERE_SPEED) {
        // 连 0.85 都不到：不用等丢帧，录制中必丢
        level = 'overload'
    } else if (spd > 0 && spd < OVERLOAD_SPEED && dropping) {
        level = 'overload'
    } else if (spd > 0 && spd < FULL_SPEED) {
        // 不丢帧，但没有余量。4K60 硬编基本都在这个区间
        level = 'tight'
    } else if (spd === 0 && dropping) {
        // speed 拿不到（进度块里是 N/A）时只能看丢帧
        level = 'overload'
    }

    return {
        level,
        overloaded: level === 'overload',
        tight: level === 'tight',
        speed: spd,
        dropped,
        frames,
        dropRate,
        // 文案里的余量：1.08x → 8（%）
        margin: Math.max(0, Math.round((spd - 1) * 100))
    }
}

module.exports = { judgeLoad, FULL_SPEED, OVERLOAD_SPEED, SEVERE_SPEED, DROP_FRAMES_MIN }
