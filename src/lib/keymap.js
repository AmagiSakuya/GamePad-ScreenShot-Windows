/**
 * 键盘按键表：KeyboardEvent.code（物理键位，与输入法/布局无关）→ Windows 虚拟键码(VK)。
 *
 * - code  ：渲染进程录制组合键时直接取 event.code，能区分左右 Ctrl/Shift/Alt 与 Win 键
 * - vk    ：Windows 虚拟键码，主进程调用 keybd_event 时使用
 * - ext   ：是否为「扩展键」，发送时必须带 KEYEVENTF_EXTENDEDKEY，
 *           否则方向键会被识别成小键盘数字、Right Alt 会被识别成 AltGr 等
 * - label ：界面上键帽显示的短文案（统一用 ASCII，避免 9 种语言各翻一套）
 */
const KEY_DEFS = [
  // 功能键
  { code: 'Escape', vk: 0x1B, label: 'Esc' },
  { code: 'F1', vk: 0x70, label: 'F1' },
  { code: 'F2', vk: 0x71, label: 'F2' },
  { code: 'F3', vk: 0x72, label: 'F3' },
  { code: 'F4', vk: 0x73, label: 'F4' },
  { code: 'F5', vk: 0x74, label: 'F5' },
  { code: 'F6', vk: 0x75, label: 'F6' },
  { code: 'F7', vk: 0x76, label: 'F7' },
  { code: 'F8', vk: 0x77, label: 'F8' },
  { code: 'F9', vk: 0x78, label: 'F9' },
  { code: 'F10', vk: 0x79, label: 'F10' },
  { code: 'F11', vk: 0x7A, label: 'F11' },
  { code: 'F12', vk: 0x7B, label: 'F12' },
  { code: 'F13', vk: 0x7C, label: 'F13' },
  { code: 'F14', vk: 0x7D, label: 'F14' },
  { code: 'F15', vk: 0x7E, label: 'F15' },
  { code: 'F16', vk: 0x7F, label: 'F16' },
  { code: 'F17', vk: 0x80, label: 'F17' },
  { code: 'F18', vk: 0x81, label: 'F18' },
  { code: 'F19', vk: 0x82, label: 'F19' },
  { code: 'F20', vk: 0x83, label: 'F20' },
  { code: 'F21', vk: 0x84, label: 'F21' },
  { code: 'F22', vk: 0x85, label: 'F22' },
  { code: 'F23', vk: 0x86, label: 'F23' },
  { code: 'F24', vk: 0x87, label: 'F24' },

  // 编辑键
  { code: 'Backquote', vk: 0xC0, label: '`' },
  { code: 'Digit1', vk: 0x31, label: '1' },
  { code: 'Digit2', vk: 0x32, label: '2' },
  { code: 'Digit3', vk: 0x33, label: '3' },
  { code: 'Digit4', vk: 0x34, label: '4' },
  { code: 'Digit5', vk: 0x35, label: '5' },
  { code: 'Digit6', vk: 0x36, label: '6' },
  { code: 'Digit7', vk: 0x37, label: '7' },
  { code: 'Digit8', vk: 0x38, label: '8' },
  { code: 'Digit9', vk: 0x39, label: '9' },
  { code: 'Digit0', vk: 0x30, label: '0' },
  { code: 'Minus', vk: 0xBD, label: '-' },
  { code: 'Equal', vk: 0xBB, label: '=' },
  { code: 'Backspace', vk: 0x08, label: 'Back' },
  { code: 'Tab', vk: 0x09, label: 'Tab' },
  { code: 'BracketLeft', vk: 0xDB, label: '[' },
  { code: 'BracketRight', vk: 0xDD, label: ']' },
  { code: 'Backslash', vk: 0xDC, label: '\\' },
  { code: 'CapsLock', vk: 0x14, label: 'Caps' },
  { code: 'Semicolon', vk: 0xBA, label: ';' },
  { code: 'Quote', vk: 0xDE, label: "'" },
  { code: 'Enter', vk: 0x0D, label: 'Enter' },
  { code: 'Comma', vk: 0xBC, label: ',' },
  { code: 'Period', vk: 0xBE, label: '.' },
  { code: 'Slash', vk: 0xBF, label: '/' },
  { code: 'IntlBackslash', vk: 0xE2, label: 'Intl\\' },
  { code: 'Space', vk: 0x20, label: 'Space' },

  // 字母
  { code: 'KeyA', vk: 0x41, label: 'A' },
  { code: 'KeyB', vk: 0x42, label: 'B' },
  { code: 'KeyC', vk: 0x43, label: 'C' },
  { code: 'KeyD', vk: 0x44, label: 'D' },
  { code: 'KeyE', vk: 0x45, label: 'E' },
  { code: 'KeyF', vk: 0x46, label: 'F' },
  { code: 'KeyG', vk: 0x47, label: 'G' },
  { code: 'KeyH', vk: 0x48, label: 'H' },
  { code: 'KeyI', vk: 0x49, label: 'I' },
  { code: 'KeyJ', vk: 0x4A, label: 'J' },
  { code: 'KeyK', vk: 0x4B, label: 'K' },
  { code: 'KeyL', vk: 0x4C, label: 'L' },
  { code: 'KeyM', vk: 0x4D, label: 'M' },
  { code: 'KeyN', vk: 0x4E, label: 'N' },
  { code: 'KeyO', vk: 0x4F, label: 'O' },
  { code: 'KeyP', vk: 0x50, label: 'P' },
  { code: 'KeyQ', vk: 0x51, label: 'Q' },
  { code: 'KeyR', vk: 0x52, label: 'R' },
  { code: 'KeyS', vk: 0x53, label: 'S' },
  { code: 'KeyT', vk: 0x54, label: 'T' },
  { code: 'KeyU', vk: 0x55, label: 'U' },
  { code: 'KeyV', vk: 0x56, label: 'V' },
  { code: 'KeyW', vk: 0x57, label: 'W' },
  { code: 'KeyX', vk: 0x58, label: 'X' },
  { code: 'KeyY', vk: 0x59, label: 'Y' },
  { code: 'KeyZ', vk: 0x5A, label: 'Z' },

  // 导航 / 系统
  { code: 'PrintScreen', vk: 0x2C, label: 'PrtSc', ext: true },
  { code: 'ScrollLock', vk: 0x91, label: 'Scroll' },
  { code: 'Pause', vk: 0x13, label: 'Pause' },
  { code: 'Insert', vk: 0x2D, label: 'Ins', ext: true },
  { code: 'Delete', vk: 0x2E, label: 'Del', ext: true },
  { code: 'Home', vk: 0x24, label: 'Home', ext: true },
  { code: 'End', vk: 0x23, label: 'End', ext: true },
  { code: 'PageUp', vk: 0x21, label: 'PgUp', ext: true },
  { code: 'PageDown', vk: 0x22, label: 'PgDn', ext: true },
  { code: 'ArrowLeft', vk: 0x25, label: '←', ext: true },
  { code: 'ArrowUp', vk: 0x26, label: '↑', ext: true },
  { code: 'ArrowRight', vk: 0x27, label: '→', ext: true },
  { code: 'ArrowDown', vk: 0x28, label: '↓', ext: true },
  { code: 'NumLock', vk: 0x90, label: 'NumLk', ext: true },
  { code: 'ContextMenu', vk: 0x5D, label: 'Menu', ext: true },

  // 修饰键（Win 键也在这里，可以正常映射）
  { code: 'ControlLeft', vk: 0xA2, label: 'Ctrl' },
  { code: 'ControlRight', vk: 0xA3, label: 'RCtrl', ext: true },
  { code: 'ShiftLeft', vk: 0xA0, label: 'Shift' },
  { code: 'ShiftRight', vk: 0xA1, label: 'RShift' },
  { code: 'AltLeft', vk: 0xA4, label: 'Alt' },
  { code: 'AltRight', vk: 0xA5, label: 'RAlt', ext: true },
  { code: 'MetaLeft', vk: 0x5B, label: 'Win', ext: true },
  { code: 'MetaRight', vk: 0x5C, label: 'RWin', ext: true },

  // 小键盘
  { code: 'Numpad0', vk: 0x60, label: 'Num0' },
  { code: 'Numpad1', vk: 0x61, label: 'Num1' },
  { code: 'Numpad2', vk: 0x62, label: 'Num2' },
  { code: 'Numpad3', vk: 0x63, label: 'Num3' },
  { code: 'Numpad4', vk: 0x64, label: 'Num4' },
  { code: 'Numpad5', vk: 0x65, label: 'Num5' },
  { code: 'Numpad6', vk: 0x66, label: 'Num6' },
  { code: 'Numpad7', vk: 0x67, label: 'Num7' },
  { code: 'Numpad8', vk: 0x68, label: 'Num8' },
  { code: 'Numpad9', vk: 0x69, label: 'Num9' },
  { code: 'NumpadMultiply', vk: 0x6A, label: 'Num*' },
  { code: 'NumpadAdd', vk: 0x6B, label: 'Num+' },
  { code: 'NumpadSubtract', vk: 0x6D, label: 'Num-' },
  { code: 'NumpadDecimal', vk: 0x6E, label: 'Num.' },
  { code: 'NumpadDivide', vk: 0x6F, label: 'Num/', ext: true },
  { code: 'NumpadEnter', vk: 0x0D, label: 'NumEnter', ext: true },

  // 多媒体 / 浏览器键
  { code: 'VolumeMute', vk: 0xAD, label: 'Mute', ext: true },
  { code: 'VolumeDown', vk: 0xAE, label: 'Vol-', ext: true },
  { code: 'VolumeUp', vk: 0xAF, label: 'Vol+', ext: true },
  { code: 'MediaTrackNext', vk: 0xB0, label: 'Next', ext: true },
  { code: 'MediaTrackPrevious', vk: 0xB1, label: 'Prev', ext: true },
  { code: 'MediaStop', vk: 0xB2, label: 'MStop', ext: true },
  { code: 'MediaPlayPause', vk: 0xB3, label: 'Play', ext: true },
  { code: 'BrowserBack', vk: 0xA6, label: 'Web←', ext: true },
  { code: 'BrowserForward', vk: 0xA7, label: 'Web→', ext: true },
  { code: 'BrowserRefresh', vk: 0xA8, label: 'Web⟳', ext: true },
  { code: 'BrowserStop', vk: 0xA9, label: 'WebStop', ext: true },
  { code: 'BrowserSearch', vk: 0xAA, label: 'WebFind', ext: true },
  { code: 'BrowserFavorites', vk: 0xAB, label: 'WebFav', ext: true },
  { code: 'BrowserHome', vk: 0xAC, label: 'WebHome', ext: true }
]

const KEY_BY_CODE = {}
const KEY_BY_VK = {}
for (const def of KEY_DEFS) {
  KEY_BY_CODE[def.code] = def
  // 只保留首个（NumpadEnter 与 Enter 共用 VK，反查时以 Enter 为准）
  if (!KEY_BY_VK[def.vk]) KEY_BY_VK[def.vk] = def
}

/** 修饰键：录制时先按修饰键、后按主键，展示与发送顺序都按这个顺序排 */
const MODIFIER_ORDER = [
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'
]

function isModifierCode(code) {
  return MODIFIER_ORDER.indexOf(code) !== -1
}

/** 按「修饰键在前、其余按录制顺序」整理组合键 */
function sortCombo(codes) {
  const list = Array.from(new Set(codes.filter((code) => !!KEY_BY_CODE[code])))
  return list.sort((a, b) => {
    const ai = MODIFIER_ORDER.indexOf(a)
    const bi = MODIFIER_ORDER.indexOf(b)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function keyLabel(code) {
  const def = KEY_BY_CODE[code]
  return def ? def.label : code
}

/** code 数组 → 发送用的按键描述（含 vk 与扩展键标记） */
function toSendKeys(codes) {
  const result = []
  for (const code of sortCombo(codes)) {
    const def = KEY_BY_CODE[code]
    if (def) result.push({ vk: def.vk, ext: !!def.ext })
  }
  return result
}

module.exports = {
  KEY_DEFS,
  KEY_BY_CODE,
  KEY_BY_VK,
  MODIFIER_ORDER,
  isModifierCode,
  sortCombo,
  keyLabel,
  toSendKeys
}
