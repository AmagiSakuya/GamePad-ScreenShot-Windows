/**
 * 界面字体大小（整页缩放）预设。
 *
 * 说明：新版把「标准」定为 1.1x —— 也就是旧版本「大」的实际观感，
 * 用户反馈这个字号才是舒服的标准大小。其余档位围绕它上下分布。
 *
 * 旧版存档（0.9 / 1 / 1.25）只在首次读取时迁移一次（见 uiScaleVersion 标记），
 * 迁移完成后一律按「吸附到最近预设」处理，否则新档位的 1.0x（小）会被旧映射吞掉。
 */
const UI_SCALE_SMALL = 1
const UI_SCALE_NORMAL = 1.1
const UI_SCALE_LARGE = 1.2
const UI_SCALE_XLARGE = 1.3

const UI_SCALE_DEFAULT = UI_SCALE_NORMAL
const UI_SCALE_MIN = UI_SCALE_SMALL
const UI_SCALE_MAX = UI_SCALE_XLARGE
const UI_SCALE_VERSION = 2

const UI_SCALE_PRESETS = [UI_SCALE_SMALL, UI_SCALE_NORMAL, UI_SCALE_LARGE, UI_SCALE_XLARGE]

/** 吸附到最近的一档预设（非法值回落到默认档） */
function snapUiScale(raw) {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return UI_SCALE_DEFAULT
  return UI_SCALE_PRESETS.reduce(
    (best, current) => (Math.abs(current - value) < Math.abs(best - value) ? current : best),
    UI_SCALE_DEFAULT
  )
}

/** 旧版本存档值迁移：旧的「大」(1.1) 与旧的「标准」(1) 都落到新的「标准」(1.1) */
const LEGACY_MAP = {
  0.9: UI_SCALE_SMALL,
  1: UI_SCALE_NORMAL,
  1.1: UI_SCALE_NORMAL,
  1.25: UI_SCALE_XLARGE
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
  snapUiScale,
  migrateLegacyUiScale
}
