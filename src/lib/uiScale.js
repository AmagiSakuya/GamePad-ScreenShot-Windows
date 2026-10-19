/**
 * 界面字体大小（整页缩放）预设。
 *
 * 基准：「标准」= 1.2x 整页缩放（即上一版的「大」），显示为 100%。
 * 其余档位按相对百分比等比分布：90% / 100% / 110% / 120%。
 *
 * 注意：面板上显示的百分比是「相对标准档」的比值，不是绝对 zoom，
 * 所以绝对缩放值需要 = 标准 × 百分比。
 *
 * 历史存档迁移：旧版存的是绝对 zoom（0.9~1.3）。首次读取时按 LEGACY_MAP 迁移一次
 * （原来选「标准」或「大」的都落到新的「标准」，也就是上一版「大」的观感），
 * 迁移后写入 uiScaleVersion 标记，之后一律用 snapUiScale 吸附。
 */
const UI_SCALE_SMALL = 1.08
const UI_SCALE_NORMAL = 1.2
const UI_SCALE_LARGE = 1.32
const UI_SCALE_XLARGE = 1.44

const UI_SCALE_DEFAULT = UI_SCALE_NORMAL
const UI_SCALE_MIN = UI_SCALE_SMALL
const UI_SCALE_MAX = UI_SCALE_XLARGE
const UI_SCALE_VERSION = 3

/** value 是绝对 zoom，percent 是面板上显示的相对百分比 */
const UI_SCALE_PRESETS = [
  { value: UI_SCALE_SMALL, percent: 90 },
  { value: UI_SCALE_NORMAL, percent: 100 },
  { value: UI_SCALE_LARGE, percent: 110 },
  { value: UI_SCALE_XLARGE, percent: 120 }
]

const UI_SCALE_VALUES = UI_SCALE_PRESETS.map((preset) => preset.value)

/** 吸附到最近的一档预设（非法值回落到默认档） */
function snapUiScale(raw) {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return UI_SCALE_DEFAULT
  return UI_SCALE_VALUES.reduce(
    (best, current) => (Math.abs(current - value) < Math.abs(best - value) ? current : best),
    UI_SCALE_DEFAULT
  )
}

/**
 * 旧存档迁移用的显式映射（只在首次读取时跑一次）：
 * - 0.9（旧·小）/ 1.0（v2·小）      → 新·小
 * - 1 / 1.1（旧·标准 / 旧·大）/ 1.1 1.2（v2·标准 / v2·大）→ 新·标准
 *   （因为「标准」的定义就是上一版「大」的观感，所以这两档都落到标准）
 * - 1.25（旧·特大）/ 1.3（v2·特大） → 新·特大
 */
const LEGACY_MAP = {
  0.9: UI_SCALE_SMALL,
  1: UI_SCALE_NORMAL,
  1.1: UI_SCALE_NORMAL,
  1.25: UI_SCALE_XLARGE,
  1.2: UI_SCALE_NORMAL,
  1.3: UI_SCALE_XLARGE
}

function migrateLegacyUiScale(raw) {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return UI_SCALE_DEFAULT
  if (Object.prototype.hasOwnProperty.call(LEGACY_MAP, value)) return LEGACY_MAP[value]
  return snapUiScale(value)
}

module.exports = {
  UI_SCALE_SMALL,
  UI_SCALE_NORMAL,
  UI_SCALE_LARGE,
  UI_SCALE_XLARGE,
  UI_SCALE_DEFAULT,
  UI_SCALE_MIN,
  UI_SCALE_MAX,
  UI_SCALE_VERSION,
  UI_SCALE_PRESETS,
  UI_SCALE_VALUES,
  snapUiScale,
  migrateLegacyUiScale
}
