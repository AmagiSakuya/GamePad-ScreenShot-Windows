/**
 * 覆层通知缩放值的读写工具。
 *
 * 历史存档里这个字段曾经存的是 small/medium/large 这类字符串，新版统一用 0.8x ~ 2.0x
 * 的数值，读到旧值时按下面的映射兜底，避免界面上滑条位置错乱。
 */
const OVERLAY_SCALE_MIN = 0.8
const OVERLAY_SCALE_MAX = 2
const OVERLAY_SCALE_STEP = 0.05

const LEGACY_SCALES = { small: 0.8, medium: 1, large: 1.25 }

/** 任意输入 → 合法的缩放数值（夹在 0.8 ~ 2 之间） */
function normalizeOverlayScale(v) {
  let n = Number.parseFloat(v)
  if (!Number.isFinite(n)) {
    n = LEGACY_SCALES[String(v).toLowerCase()] || 1
  }
  return Math.min(OVERLAY_SCALE_MAX, Math.max(OVERLAY_SCALE_MIN, n))
}

/** 缩放数值 → 界面展示文本（如 1.25x） */
function formatOverlayScale(v) {
  const n = Number.parseFloat(v)
  if (!Number.isFinite(n)) return '-'
  return (Math.round(n * 100) / 100).toString() + 'x'
}

module.exports = {
  OVERLAY_SCALE_MIN,
  OVERLAY_SCALE_MAX,
  OVERLAY_SCALE_STEP,
  normalizeOverlayScale,
  formatOverlayScale
}
