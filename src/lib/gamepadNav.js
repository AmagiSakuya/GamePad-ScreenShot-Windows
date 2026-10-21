/**
 * 手柄界面导航引擎（运行在渲染进程）
 *
 * 目标：不依赖鼠标也能完整操作整个界面。
 *  - 方向输入（十字键 / 左摇杆）在界面里做「空间导航」，焦点环高亮当前元素
 *  - 下方面键（确认）/ 右方面键（返回）
 *  - 肩键 L / R 切换左侧页面
 *  - 左方面键 打开按键说明
 *  - 菜单键 退出手柄焦点
 *
 * 有 4 类控件手柄天然点不了，这里统一封装成应用内的覆盖层（不再弹系统窗口）：
 *  - <select>        → 列表选择器（原生下拉弹层无法用键盘/手柄操作）
 *  - 文本 / 密码输入  → 软键盘
 *  - 选择文件夹       → 应用内文件夹浏览器（替代 dialog.showOpenDialog）
 *  - 系统确认框       → 应用内确认对话框（替代 dialog.showMessageBox）
 *
 * 输入来源统一走主进程的 SDL 设备实例快照（get-nav-state），
 * 和截图监听 / 映射引擎共用同一个手柄实例，不会重复抢占设备。
 */
import { reactive, nextTick } from 'vue'

export const GP_NAV_STORE_KEY = 'gamepadUiNavEnabled'

/**
 * 按键索引。SDL 的 joystick 按键编号各厂商并不统一：
 *  - Xbox / XInput 系（SDL HIDAPI）：0=A 1=B 2=X 3=Y 4=LB 5=RB 6=BACK 7=START 9=L3 10=R3
 *  - DualShock / DualSense：0=□ 1=✕ 2=○ 3=△ 4=Share 6=Options 9=L1 10=R1
 * 所以这里不按「名字」绑定，而是按「功能位置」绑定，并且肩键同时接受 4/5 与 9/10 两套编号，
 * 这样任何手柄都不会出现「按了没反应」。菜单键取 6（Xbox=BACK / PS=Options / 通用=Start）。
 */
const BTN = {
  CONFIRM: 0,
  BACK: 1,
  HELP: 2,
  PREV_PAGE: [4, 9],
  NEXT_PAGE: [5, 10],
  EXIT: [6]
}

const POLL_MS = 40
/** 摇杆判定阈值（和截图组合键保持一致的上限，避免轻推就触发） */
const AXIS_THRESHOLD = 0.55
/** 按住方向的首次重复延迟 / 重复间隔 */
const REPEAT_DELAY_MS = 340
const REPEAT_INTERVAL_MS = 110

const FOCUSABLE_SELECTOR = [
  'button',
  'select',
  'textarea',
  'input',
  'a[href]',
  '[data-gp]'
].join(',')

/**
 * 顶栏工具按钮（主题 / 主题色 / 字号 / 语言）的标记。
 *
 * 这一组是「专属通道」，不参与页面内的空间导航：
 *  - 十字键左右按下 = 强制把焦点拿到这一组，并在组内首尾循环；
 *  - 摇杆 = 页面内导航，一旦发现焦点还停在顶栏，就把它抢回页面内容。
 * 所以它们必须从 collect() 里排除，否则摇杆会把焦点导航上去。
 */
const BAR_ATTR = 'data-gp-bar'

/** 供界面读取的响应式状态 */
export const gpNav = reactive({
  // 默认关闭（实验功能）
  enabled: false,
  /** 手柄模式：最近一次输入来自手柄，此时显示焦点环与按键提示 */
  padMode: false,
  connected: false,
  /** 当前覆盖层：{ kind, id, props } */
  overlay: null,
  /** 当前焦点元素的文字说明（提示条右侧显示） */
  focusLabel: '',
  /** 当前焦点元素的类型（range 时界面提示「按确定调节」） */
  focusKind: '',
  /**
   * 数值调节模式：滑条必须先按「确认」进入，进入后左右才改值。
   * 否则焦点停在滑条上时左右键会被吃掉，走不出这一行。
   */
  adjusting: false,
  /** 按键提示条是否显示（长时间无输入自动隐藏，再按一下手柄又出来） */
  hintVisible: false,
  /** 按键说明面板 */
  hintOpen: false,
  /** 模式切换提示（时间戳，界面据此做一次性 toast） */
  modeTip: 0,
  /** 最近一次退出手柄模式的原因（排查用） */
  exitReason: ''
})

let timer = null
let busy = false
let currentEl = null
let anchorEl = null
let prevPressed = []
let holdDir = null
/** 「输入来源:方向」，例如 hat:left / stick:up —— 来源变了要立刻响应，不等重复间隔 */
let holdKey = ''
/** 上一次停在页面内的焦点元素：从顶栏用摇杆抢回时优先后到它 */
let lastStageEl = null
let nextRepeatAt = 0
/** 最近一次手柄输入时间：提示条据此自动隐藏 */
let lastInputAt = 0
/** 连续收不到设备快照的次数（拔线后自动退出焦点） */
let missingTicks = 0
/** 连续多少次拿不到设备快照就认为手柄已断开（40ms × 75 ≈ 3s） */
const MISSING_TICKS_LIMIT = 75
let overlaySeq = 0
const overlayResolvers = new Map()
let listenersBound = false
let lastMouseX = null
let lastMouseY = null
/** 由 App.vue 注入的 i18n 函数，用来给覆盖层生成默认文案 */
let translate = (key) => key

export function setNavI18n(fn) {
  if (typeof fn === 'function') translate = fn
}

function gpT(key, fallback) {
  const text = translate(key)
  return text === key && fallback !== undefined ? fallback : text
}

/* =========================================================
   焦点收集与空间导航
   ========================================================= */

/** 覆盖层 / 弹窗存在时，焦点只能在那一层里移动，不能跑到背后的页面上 */
function scopeRoot() {
  return document.querySelector('[data-gp-scope="overlay"]')
    || document.querySelector('[data-gp-scope="dialog"]')
    || document
}

/** 录制手柄按键等场景会打上 data-gp-pause，此时导航完全让位给业务逻辑 */
function isPaused() {
  return !!document.querySelector('[data-gp-pause]')
}

function isVisible(el) {
  if (!el || !el.isConnected) return false
  if (el.disabled) return false
  if (el.type === 'hidden') return false
  // display:none 的元素没有 offsetParent（自身就是 fixed 的情况除外）
  const position = window.getComputedStyle(el).position
  if (!el.offsetParent && position !== 'fixed') return false
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  // 监听中锁定的配置区、以及明确标记跳过的区域不参与导航
  if (el.closest('.is-locked')) return false
  if (el.closest('[data-gp-skip]')) return false
  const style = window.getComputedStyle(el)
  if (style.visibility === 'hidden' || style.opacity === '0') return false
  return true
}

function collect() {
  const root = scopeRoot()
  const nodes = root.querySelectorAll(FOCUSABLE_SELECTOR)
  const list = []
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]
    if (el.getAttribute('tabindex') === '-1') continue
    // 顶栏工具按钮走十字键专属通道，不参与页面内导航
    if (el.hasAttribute(BAR_ATTR)) continue
    if (!isVisible(el)) continue
    list.push(el)
  }
  return list
}

/** 顶栏工具按钮（按 DOM 顺序，即可见的 4 个） */
function barButtons() {
  const nodes = document.querySelectorAll(`[${BAR_ATTR}]`)
  const list = []
  for (let i = 0; i < nodes.length; i++) {
    if (!isVisible(nodes[i])) continue
    list.push(nodes[i])
  }
  return list
}

function isBarFocused() {
  return !!currentEl && typeof currentEl.hasAttribute === 'function'
    && currentEl.hasAttribute(BAR_ATTR)
}

/** 顶栏浮层（主题色 / 字号 / 语言）展开时，方向键交给浮层自己用 */
function popoverOpen() {
  return !!document.querySelector('.popover')
}

/**
 * 进入手柄模式时的起点：页面主操作（data-gp-autofocus，如「启动」）优先，
 * 其次内容区第一个可操作项，最后才退回左侧导航按钮。
 *
 * 注意：必须只用「当前导航列表里」的标记元素。MainPage 是 v-show 常驻的，
 * 直接 querySelector 会拿到别的页面里隐藏着的启动按钮（宽高为 0），
 * 导致映射/调试/设置页永远聚焦不到自己的主操作。
 */
function markedIn(list) {
  const nodes = Array.from(scopeRoot().querySelectorAll('[data-gp-autofocus]'))
  for (let i = 0; i < nodes.length; i++) {
    if (list.indexOf(nodes[i]) !== -1) return nodes[i]
  }
  return null
}

function initialFocusTarget(list) {
  if (!list.length) return null
  const marked = markedIn(list)
  if (marked) return marked
  const stage = document.querySelector('.stage')
  if (stage) {
    for (let i = 0; i < list.length; i++) {
      if (stage.contains(list[i])) return list[i]
    }
  }
  const activeRail = document.querySelector('.rail > .rail-btn.on')
  if (activeRail && list.indexOf(activeRail) !== -1) return activeRail
  return list[0]
}

/**
 * 控件所在行的标题文案（「保存路径」「截图方式」这类），
 * 覆盖层的标题用它比用当前值更清楚。
 */
function fieldLabel(el) {
  if (!el) return ''
  // 从最近的行容器一路往上找标题：行容器里没有标题时（调试页的选择控制器
  // 标题在卡片头部）继续退到卡片
  const scopes = ['.ui-row', '.set-row', '.obs-field', '.data-item', '.device-row', '.ui-card']
  for (let i = 0; i < scopes.length; i++) {
    const row = el.closest(scopes[i])
    if (!row) continue
    const label = row.querySelector('.ui-label, .set-label, .obs-field > span, .data-title, .ui-card-title')
    if (!label) continue
    const text = (label.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return ''
}

function labelOf(el) {
  if (!el) return ''
  const explicit = el.getAttribute('aria-label') || el.getAttribute('title')
  if (explicit) return explicit.trim()
  if (el.tagName === 'SELECT') {
    const option = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null
    const text = option ? option.textContent.trim() : ''
    // 列表为空（还没插上手柄）时退回标题，别让提示条显示成「未选择」
    if (text) return text
    return fieldLabel(el) || gpT('GpNav.selectOption')
  }
  // 滑条显示「行标题 + 当前值」，调节时提示条上能直接看到数值变化
  if (el.tagName === 'INPUT' && el.type === 'range') {
    const row = fieldLabel(el)
    return (row ? row + ' ' : '') + el.value
  }
  if (el.tagName === 'INPUT') return (el.value || el.placeholder || '').trim()
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 48)
}

/** 滑条：进入 / 退出「数值调节」模式 */
function enterAdjust(el) {
  if (!el || el.tagName !== 'INPUT' || el.type !== 'range') return
  gpNav.adjusting = true
  currentEl = el
  el.classList.add('gp-adjust')
  gpNav.hintVisible = true
  lastInputAt = Date.now()
}

function exitAdjust() {
  if (!gpNav.adjusting) return
  gpNav.adjusting = false
  if (currentEl) currentEl.classList.remove('gp-adjust')
}

/**
 * 取消选中：焦点环消失，界面上没有任何被选中的元素。
 * 只表示「这一层没有选中项」，不退出手柄模式 —— 提示条还在，按方向键重新选中即可。
 */
function clearFocus() {
  exitAdjust()
  if (currentEl) currentEl.classList.remove('gp-focus')
  currentEl = null
  anchorEl = null
  gpNav.focusLabel = ''
  gpNav.focusKind = ''
  holdDir = null
  holdKey = ''
}

function setFocus(el, options) {
  if (!el) return
  const instant = !!(options && options.instant)
  if (currentEl && currentEl !== el) {
    currentEl.classList.remove('gp-focus')
    // 焦点换到别的控件时，滑条自动结束调节，回到导航状态
    exitAdjust()
  }
  currentEl = el
  el.classList.add('gp-focus')
  gpNav.focusLabel = labelOf(el)
  gpNav.focusKind = el.hasAttribute(BAR_ATTR)
    ? 'bar'
    : (el.tagName === 'INPUT' && el.type === 'range' ? 'range' : '')
  // 记住页面内（非顶栏工具组）的落点，摇杆从顶栏抢回时回到这里
  if (!el.hasAttribute(BAR_ATTR)) lastStageEl = el

  const tag = el.tagName
  if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'A') {
    try {
      el.focus({ preventScroll: true })
    } catch (error) {
      // 个别自定义元素 focus 会抛错，忽略即可（视觉焦点靠 gp-focus 类）
    }
  }
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: instant ? 'auto' : 'smooth' })
  } catch (error) {
    // 老内核不支持 options 时退化成直接滚动
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView()
  }
}

/** 两个区间（一维）的重叠长度 */
function overlapLen(a1, a2, b1, b2) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
}

/**
 * 元素所属的「区域」。界面是三条互不相同的带状结构：
 *  顶栏（只有横向）、左导航（只有纵向）、内容区（二维）。
 * 方向键跨区域时收紧到「紧邻」才允许，避免从内容区按上直接飞到左上角版本号。
 */
function zoneOf(el) {
  if (!el || !el.closest) return 'stage'
  if (el.closest('header')) return 'top'
  if (el.closest('.rail')) return 'rail'
  return 'stage'
}

/**
 * 元素所属的「视觉容器」。方向键优先在同一容器内解决，
 * 避免从左侧卡片按一下右就飞到右边卡片里完全不同的一行。
 */
const GROUP_SELECTOR = [
  '.rail',
  '.ui-card',
  '.hero',
  '.popover',
  '.upd-card',
  '.gp-sheet',
  '.gp-path-bar'
].join(',')

function groupOf(el) {
  if (!el || !el.closest) return null
  return el.closest(GROUP_SELECTOR)
}

/**
 * 相邻距离上限：超过这个距离就不认为是「邻居」，
 * 宁可按了没反应也不要乱跳（用户能靠上下/切页找到目标）。
 */
function hopLimit(horizontal) {
  const size = horizontal ? window.innerWidth : window.innerHeight
  return Math.max(horizontal ? 300 : 260, size * 0.55)
}

/** 跨区域 / 跨容器之间只接受「贴在一起」的邻居 */
const ADJACENT_GAP = 64

/**
 * 「准同行」容差：两块在正交轴上没有重叠、只隔一条缝时，只要缝隙小于这个值，
 * 仍然算同一条视觉行带。
 *
 * 典型例子（调试页）：右上角的「刷新」按钮和它正下方的「选择控制器」下拉框，
 * 左右方向完全没有重叠，纵向只隔 54px。按以前的规则它们永远不是邻居，
 * 刷新按左会一直「原地不动」甚至被孤立元素兜底甩到顶栏去。
 */
const NEAR_MISS_GAP = 64

/**
 * 在指定方向上找下一个元素。
 *
 * 判定顺序（按「几何直觉」而不是单纯的中心距离）：
 *  1. 目标中心必须真的落在那一侧；
 *  2. 优先「正交轴有重叠」的候选（同一行 / 同一列），只有在不存在这类候选时
 *     才考虑斜向，并且斜向要落在 45° 左右的锥形内；
 *  3. 跨区域（顶栏 / 左导航 / 内容区）、跨容器的移动必须是紧邻（gap ≤ 64），
 *     否则宁可不动 —— 这是「按一下上就飞到左上角版本号」的根因；
 *  4. 同容器、边缘对齐、正交重叠比例高的候选依次减分。
 *
 * 主轴距离用「间隙」（两块之间的空白）而不是中心距，这样紧挨着的邻居一定赢过
 * 虽然中心更近但面积巨大的卡片。
 */
function findNext(list, cur, dir) {
  const cr = cur.getBoundingClientRect()
  const ccx = cr.left + cr.width / 2
  const ccy = cr.top + cr.height / 2
  const horizontal = dir === 'right' || dir === 'left'
  const forward = dir === 'right' || dir === 'down'
  const curGroup = groupOf(cur)
  const curZone = zoneOf(cur)
  const maxHop = hopLimit(horizontal)

  const aligned = []
  const diagonal = []

  for (let i = 0; i < list.length; i++) {
    const el = list[i]
    if (el === cur) continue
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2

    // 1) 中心必须在方向侧（1px 容差，避免边界抖动）
    const delta = horizontal ? cx - ccx : cy - ccy
    if (forward ? delta <= 1 : delta >= -1) continue

    // 2) 主轴间隙 / 正交偏移 / 正交重叠
    let gap
    let perp
    let overlap
    let crossSize
    if (horizontal) {
      gap = forward ? Math.max(0, r.left - cr.right) : Math.max(0, cr.left - r.right)
      perp = Math.abs(cy - ccy)
      overlap = overlapLen(cr.top, cr.bottom, r.top, r.bottom)
      crossSize = Math.min(cr.height, r.height)
    } else {
      gap = forward ? Math.max(0, r.top - cr.bottom) : Math.max(0, cr.top - r.bottom)
      perp = Math.abs(cx - ccx)
      overlap = overlapLen(cr.left, cr.right, r.left, r.right)
      crossSize = Math.min(cr.width, r.width)
    }
    const sameZone = zoneOf(el) === curZone
    const sameGroup = !!curGroup && groupOf(el) === curGroup
    const adjacent = gap <= ADJACENT_GAP
    // 3) 跨区域（顶栏 / 左导航 / 内容区）只能走「贴边的正交邻居」，
    //    否则宁可不动 —— 这是「按一下上就飞到左上角版本号」的根因。
    if (!sameZone && (!adjacent || overlap <= 0)) continue

    // 正交轴上的「缝隙」：两块不重叠时它们之间的空白距离。
    // 缝隙很小 = 上下相邻的两条行带（刷新 ↔ 选择控制器），左右走得远一点也符合直觉。
    const perpGap = horizontal
      ? Math.max(0, r.top - cr.bottom, cr.top - r.bottom)
      : Math.max(0, r.left - cr.right, cr.left - r.right)
    const nearMiss = overlap <= 0 && sameZone && perpGap <= NEAR_MISS_GAP

    // 同一容器内不受跳跃上限限制（卡片内部本来就近）；跨容器必须够近
    if (!nearMiss && !sameGroup && gap > maxHop) continue

    // 4) 评分
    let bonus = 0
    if (sameGroup) bonus -= 60
    else if (sameZone) bonus += 120
    if (horizontal) {
      if (Math.abs(r.top - cr.top) <= 3 || Math.abs(r.bottom - cr.bottom) <= 3) bonus -= 30
    } else if (Math.abs(r.left - cr.left) <= 3 || Math.abs(r.right - cr.right) <= 3) {
      bonus -= 30
    }

    const ratio = crossSize > 0 ? Math.min(1, overlap / crossSize) : 0

    if (overlap > 0) {
      // 行内 / 列内：间隙为主，正交偏移微调，重叠越完整越像「同一行」
      aligned.push({ el, score: gap + perp * 0.5 - ratio * 200 + bonus })
    } else if (nearMiss) {
      // 准同行：正交缝隙越小越像同一条行带；主轴距离超过跳跃上限时略作惩罚，
      // 这样近处的斜向候选仍然有机会赢过远端的行带邻居
      const far = gap > maxHop ? 200 : 0
      diagonal.push({ el, score: gap + perpGap * 2 + 260 + far + bonus })
    } else {
      // 斜向：只在同一区域内、且距离够近时兜底，且正交偏移不能超过主轴间隙太多
      if (!sameZone) continue
      if (gap > maxHop * 0.45) continue
      if (perp > gap * 0.8 + 30) continue
      diagonal.push({ el, score: gap + perp * 1.6 + 400 + bonus })
    }
  }

  const pool = aligned.length ? aligned : diagonal
  let best = null
  let bestScore = Infinity
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].score < bestScore) {
      bestScore = pool[i].score
      best = pool[i].el
    }
  }
  return best
}

/** 中心距离最近的可聚焦元素（兜底用）；超过 maxDist 视为没有邻居 */
function nearestOf(list, cur, maxDist) {
  const cr = cur.getBoundingClientRect()
  const ccx = cr.left + cr.width / 2
  const ccy = cr.top + cr.height / 2
  let best = null
  let bestDist = Infinity
  for (let i = 0; i < list.length; i++) {
    const el = list[i]
    if (el === cur) continue
    const r = el.getBoundingClientRect()
    const dx = r.left + r.width / 2 - ccx
    const dy = r.top + r.height / 2 - ccy
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = el
    }
  }
  if (best && typeof maxDist === 'number' && bestDist > maxDist * maxDist) return null
  return best
}

/**
 * 顶栏工具按钮的循环（十字键专属）。
 *
 * 这一组按钮只有横排一行，所以「上/下」没有真实目标：把上/左当「上一个」、
 * 下/右当「下一个」，保证十字键任意方向都有响应，而且永远不离开这一组。
 * 焦点不在顶栏时，按左/上进最后一个、按右/下进第一个。
 */
function barStep(dir) {
  const list = barButtons()
  if (!list.length) return false
  const back = dir === 'left' || dir === 'up'
  const index = isBarFocused() ? list.indexOf(currentEl) : -1
  if (index < 0) {
    setFocus(list[back ? list.length - 1 : 0], { instant: true })
    return true
  }
  const step = back ? -1 : 1
  const next = (index + step + list.length) % list.length
  if (next !== index) setFocus(list[next], { instant: true })
  return true
}

function move(dir, source) {
  const from = source || 'stick'

  // 数值调节模式：左右改值，其它方向先退出调节
  if (gpNav.adjusting) {
    if (currentEl && currentEl.tagName === 'INPUT' && currentEl.type === 'range'
      && (dir === 'left' || dir === 'right')) {
      nudgeRange(currentEl, dir === 'right' ? 1 : -1)
      return
    }
    exitAdjust()
  }

  /*
   * 两条互不干扰的通道：
   *  - 十字键（hat）  = 顶栏 4 个工具按钮独占，任意方向都只在这一组里消化，
   *                     绝不参与页面内的焦点移动；
   *  - 左摇杆（stick）= 页面内导航，永远到不了顶栏。
   * 只有「覆盖层」（下拉列表 / 软键盘 / 选文件夹 / 确认框）和「顶栏浮层」
   * 这两种自己要用方向键的场合，才把十字键交还出去。
   */
  if (from === 'hat' && !gpNav.overlay && !popoverOpen()) {
    if (barStep(dir)) return
  }

  const list = collect()
  if (!list.length) return

  // 焦点还在顶栏（此时只可能是摇杆）：把焦点抢回页面内容。
  // 优先回到上一次停留的元素，找不到才退回页面初焦点 —— 改完主题按一下摇杆
  // 就回到刚才那一行，而不是被扔回页面顶部。
  if (isBarFocused()) {
    const back = lastStageEl && lastStageEl.isConnected && list.indexOf(lastStageEl) !== -1
    const target = back ? lastStageEl : initialFocusTarget(list)
    if (target) setFocus(target)
    return
  }

  if (!currentEl || !list.includes(currentEl)) {
    setFocus(initialFocusTarget(list))
    return
  }
  const next = findNext(list, currentEl, dir)
  if (next) {
    setFocus(next)
    return
  }
  // 兜底：只有「四个方向都走不通」的孤立元素（如顶栏版本号）才允许跳最近邻，
  // 避免焦点落在上面之后彻底出不来。正常的边界「按了不动」保持原样；
  // 最近的邻居也太远（> 420px）时宁可不动，否则会「按一下跳到半个屏幕外」。
  const stuck = !findNext(list, currentEl, 'up')
    && !findNext(list, currentEl, 'down')
    && !findNext(list, currentEl, 'left')
    && !findNext(list, currentEl, 'right')
  if (stuck) {
    const fallback = nearestOf(list, currentEl, 420)
    if (fallback) setFocus(fallback)
  }
}

/* =========================================================
   控件操作
   ========================================================= */

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')
  if (setter && setter.set) setter.set.call(el, value)
  else el.value = value
}

function nudgeRange(el, direction) {
  const min = el.min === '' ? 0 : Number(el.min)
  const max = el.max === '' ? 100 : Number(el.max)
  const step = Number(el.step) || 1
  const current = Number(el.value) || 0
  const next = Math.min(max, Math.max(min, Number((current + direction * step).toFixed(4))))
  if (next === current) return
  setNativeValue(el, String(next))
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  gpNav.focusLabel = labelOf(el)
}

/* =========================================================
   覆盖层
   ========================================================= */

async function openOverlay(kind, props) {
  anchorEl = currentEl && currentEl.isConnected ? currentEl : null
  const id = ++overlaySeq
  const promise = new Promise((resolve) => overlayResolvers.set(id, resolve))
  gpNav.overlay = { kind, id, props: props || {} }
  await nextTick()
  // 覆盖层里可以用 data-gp-autofocus 指定默认焦点（例如文件夹选择器的「选择此文件夹」）。
  // 只在手柄模式下落焦点：鼠标用户没必要看到那个发光焦点环，键盘用户自己 Tab 就行。
  if (!gpNav.padMode) return promise
  setTimeout(() => {
    if (!gpNav.overlay) return
    const list = collect()
    if (!list.length) return
    const marked = markedIn(list)
    setFocus(marked || list[0], { instant: true })
  }, 40)
  return promise
}

/** 覆盖层内容变化（列表刷新、数据加载完）后重新锚定焦点 */
export function refocusOverlay() {
  nextTick(() => {
    if (!gpNav.overlay) return
    const list = collect()
    if (!list.length) return
    if (!currentEl || !list.includes(currentEl)) setFocus(list[0], { instant: true })
  })
}

export function resolveOverlay(id, value) {
  const resolve = overlayResolvers.get(id)
  overlayResolvers.delete(id)
  gpNav.overlay = null
  exitAdjust()
  if (currentEl) currentEl.classList.remove('gp-focus')
  currentEl = null
  gpNav.focusKind = ''
  if (resolve) resolve(value)
  nextTick(() => {
    if (!gpNav.padMode) return
    const list = collect()
    if (anchorEl && anchorEl.isConnected && list.includes(anchorEl)) {
      setFocus(anchorEl, { instant: true })
    } else if (list.length) {
      setFocus(list[0], { instant: true })
    }
  })
}

async function openSelect(el) {
  const options = Array.from(el.options || [])
  if (!options.length) return
  const items = options.map((option, index) => ({
    id: index,
    label: (option.textContent || '').trim() || String(index + 1),
    selected: index === el.selectedIndex,
    disabled: option.disabled
  }))
  const current = el.selectedIndex >= 0 ? (items[el.selectedIndex] || {}).label : ''
  const chosen = await openOverlay('chooser', {
    title: fieldLabel(el) || gpT('GpNav.selectOption'),
    subtitle: current || gpT('GpNav.selectOption'),
    items,
    cancelLabel: gpT('GpNav.cancel')
  })
  if (typeof chosen !== 'number' || chosen < 0 || chosen >= options.length) return
  el.selectedIndex = chosen
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

async function openKeyboard(el) {
  const value = await openOverlay('keyboard', {
    title: fieldLabel(el) || labelOf(el) || gpT('GpNav.inputTitle'),
    value: el.value || '',
    placeholder: el.placeholder || ''
  })
  if (typeof value !== 'string') return
  setNativeValue(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/* =========================================================
   对外能力：文件夹选择器 / 确认框
   ========================================================= */

/** 手柄模式下选择文件夹（应用内浏览器），返回选中路径或 null */
export async function pickFolder(startPath) {
  const result = await openOverlay('folder', {
    startPath: startPath || '',
    title: gpT('GpNav.chooseFolder'),
    cancelLabel: gpT('GpNav.cancel')
  })
  return typeof result === 'string' && result ? result : null
}

/** 手柄模式下的确认框（替代系统消息框），返回是否点了确定 */
export async function askConfirm(options) {
  const opts = options || {}
  const result = await openOverlay('confirm', {
    title: opts.title || gpT('GpNav.confirmTitle'),
    message: opts.message || '',
    detail: opts.detail || '',
    okLabel: opts.okLabel || gpT('GpNav.finish'),
    cancelLabel: opts.cancelLabel || gpT('GpNav.cancel'),
    danger: !!opts.danger,
    icon: opts.icon || ''
  })
  return result === 'ok'
}

/* =========================================================
   动作分发
   ========================================================= */

async function activate() {
  if (!currentEl || !currentEl.isConnected) {
    const list = collect()
    if (list.length) setFocus(initialFocusTarget(list))
    return
  }
  const el = currentEl
  const tag = el.tagName

  if (tag === 'SELECT') return openSelect(el)
  if (tag === 'INPUT' && el.type === 'range') {
    // 确认键 = 开始调节（再按一次结束）。滑条不会一聚焦就被左右键改值。
    if (gpNav.adjusting) exitAdjust()
    else enterAdjust(el)
    return undefined
  }
  if (tag === 'INPUT' || tag === 'TEXTAREA') return openKeyboard(el)
  if (el.disabled) return

  const scopeBefore = scopeRoot()
  const popoverWrap = el.closest('.pop-wrap')
  el.click()
  await nextTick()

  const scopeAfter = scopeRoot()
  if (scopeAfter !== scopeBefore) {
    // 打开了新的弹窗 / 覆盖层
    const list = collect()
    if (list.length) setFocus(list[0], { instant: true })
    return
  }
  // 顶栏浮层（主题色 / 字号 / 语言）刚打开：焦点移进浮层
  const popover = document.querySelector('.popover')
  if (popover) {
    const first = popover.querySelector('button')
    if (first) setFocus(first, { instant: true })
    return
  }
  // 在顶栏浮层里选完一项后浮层关闭：焦点回到触发它的图标按钮
  if (popoverWrap) {
    const trigger = popoverWrap.querySelector('.icon-btn')
    if (trigger && trigger.isConnected) {
      setFocus(trigger, { instant: true })
      return
    }
  }
  /*
   * 顶栏按钮点完但没弹浮层（切换浅色/深色就是这种）：焦点必须留在原按钮上。
   * 顶栏按钮本来就不在页面导航列表里，如果落到下面的兜底逻辑会被误判成
   * 「原元素已消失」，焦点被扔回页面内容 —— 用户就会看到焦点「自己跑下去了」。
   */
  if (el.hasAttribute(BAR_ATTR) && el.isConnected) {
    setFocus(el, { instant: true })
    return
  }
  // 点击导致列表刷新（增删条目）后，原来那个元素可能已经没了
  const list = collect()
  if (list.length && (!currentEl || !currentEl.isConnected || !list.includes(currentEl))) {
    setFocus(initialFocusTarget(list), { instant: true })
  }
}

function back() {
  if (gpNav.hintOpen) {
    gpNav.hintOpen = false
    return
  }
  // 调节模式下「返回」= 结束调节，焦点留在滑条上，不发散到页面外
  if (gpNav.adjusting) {
    exitAdjust()
    return
  }
  if (gpNav.overlay) {
    resolveOverlay(gpNav.overlay.id, null)
    return
  }
  const dialogClose = document.querySelector('.upd-card .upd-close')
  if (dialogClose) {
    dialogClose.click()
    return
  }
  const popover = document.querySelector('.popover')
  if (popover) {
    const trigger = popover.parentElement ? popover.parentElement.querySelector('.icon-btn') : null
    document.body.click()
    if (trigger) nextTick(() => setFocus(trigger, { instant: true }))
    return
  }

  // 页面层：「返回」= 取消选中，不直接退出手柄模式（退出统一走菜单键 / 鼠标 / 键盘）。
  //
  // 只有页面自己用 data-gp-autofocus 声明了「主操作」（截图页的启动 / 映射页的启用）时，
  // 返回才先回到那个主操作；再按一次同样会取消选中。
  // 调试 / 设置这类没有主操作的页面不做「定格在第一个元素」的保底 —— 那会让返回键
  // 永远卡在「刷新」「基础设置」上，看起来像坏了。
  const list = collect()
  if (!list.length) return
  // 已经没有任何选中项：返回保持空状态，不再把焦点「保底」塞回某个元素
  if (!currentEl) return
  // 焦点指向的元素已经被移除（列表刷新等），直接取消选中，而不是另找一个顶上
  if (!list.includes(currentEl)) {
    clearFocus()
    return
  }
  const home = markedIn(list)
  if (home && currentEl !== home) {
    setFocus(home)
    return
  }
  clearFocus()
}

function switchPage(direction) {
  const railButtons = Array.from(document.querySelectorAll('.rail > .rail-btn'))
  if (!railButtons.length) return
  let index = railButtons.findIndex((el) => el.classList.contains('on'))
  if (index < 0) index = 0
  const next = (index + direction + railButtons.length) % railButtons.length
  railButtons[next].click()
  // 页面是 v-if 渲染的，等它挂载完再重新锚定焦点
  setTimeout(() => {
    if (!gpNav.padMode) return
    const list = collect()
    if (currentEl && list.includes(currentEl)) return
    if (list.length) setFocus(initialFocusTarget(list), { instant: true })
  }, 90)
}

function toggleHelp() {
  gpNav.hintOpen = !gpNav.hintOpen
}

/* =========================================================
   输入轮询
   ========================================================= */

function inputFromState(state) {
  const hats = state.hats || []
  // 十字键（hat）优先：它的左右被顶栏独占，所以必须和摇杆区分开
  let dir = null
  if (hats[2]) dir = 'down'
  else if (hats[0]) dir = 'up'
  else if (hats[1]) dir = 'right'
  else if (hats[3]) dir = 'left'
  if (dir) return { dir, source: 'hat' }

  const axes = state.axes || []
  const ax = Number(axes[0]) || 0
  const ay = Number(axes[1]) || 0
  // 斜向时只认一个方向，避免焦点在列表里乱跳
  if (ay >= AXIS_THRESHOLD) return { dir: 'down', source: 'stick' }
  if (ay <= -AXIS_THRESHOLD) return { dir: 'up', source: 'stick' }
  if (ax >= AXIS_THRESHOLD) return { dir: 'right', source: 'stick' }
  if (ax <= -AXIS_THRESHOLD) return { dir: 'left', source: 'stick' }
  return null
}

function handleButton(index) {
  if (index === BTN.CONFIRM) return activate()
  if (index === BTN.BACK) return back()
  if (index === BTN.HELP) return toggleHelp()
  if (BTN.EXIT.indexOf(index) !== -1) return exitPadMode('menu')
  if (BTN.PREV_PAGE.indexOf(index) !== -1) return switchPage(-1)
  if (BTN.NEXT_PAGE.indexOf(index) !== -1) return switchPage(1)
  return undefined
}

async function runTick() {
  if (!gpNav.enabled || busy) return
  if (document.hidden || !document.hasFocus()) return
  if (!window.electronAPI || !window.electronAPI.getNavState) return

  busy = true
  let state = null
  try {
    state = await window.electronAPI.getNavState()
  } catch (error) {
    state = null
  }
  busy = false

  gpNav.connected = !!state
  if (!state) {
    // 手柄拔掉后不要让焦点环停留在原地（连续 3 秒收不到快照才算断了）
    if (!gpNav.padMode) {
      missingTicks = 0
      return
    }
    missingTicks += 1
    if (missingTicks > MISSING_TICKS_LIMIT) exitPadMode('disconnected')
    return
  }
  missingTicks = 0

  const pressed = (state.buttons || []).map((value) => !!value)
  const input = inputFromState(state)

  // 提示条：有输入时亮出来，静置 6 秒后自动收起，避免长期挡住界面
  if (pressed.some(Boolean) || input) lastInputAt = Date.now()
  if (gpNav.padMode) gpNav.hintVisible = Date.now() - lastInputAt < 6000

  // 正在录制组合键：按键全部交给录制逻辑，导航只同步基线状态
  if (isPaused()) {
    prevPressed = pressed
    holdDir = null
    holdKey = ''
    return
  }

  if (!gpNav.padMode) {
    // 第一次输入只负责「点亮」手柄模式，不触发操作，避免误点
    if (input || pressed.some(Boolean)) enterPadMode()
    prevPressed = pressed
    return
  }

  for (let i = 0; i < pressed.length; i++) {
    if (pressed[i] && !prevPressed[i]) handleButton(i)
  }
  prevPressed = pressed

  if (!input) {
    holdDir = null
    holdKey = ''
    return
  }
  // 输入来源也算进「同一个方向」的判定：摇杆推着的时候按十字键要立刻响应
  const key = input.source + ':' + input.dir
  const now = Date.now()
  if (key !== holdKey) {
    holdKey = key
    holdDir = input.dir
    nextRepeatAt = now + REPEAT_DELAY_MS
    move(input.dir, input.source)
  } else if (now >= nextRepeatAt) {
    nextRepeatAt = now + REPEAT_INTERVAL_MS
    move(input.dir, input.source)
  }
}

function startPolling() {
  if (timer) return
  // 导航本身出任何问题都不能影响截图 / 映射，异常在轮询入口全部吞掉
  timer = setInterval(() => {
    runTick().catch(() => {})
  }, POLL_MS)
}

function stopPolling() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

/* =========================================================
   模式切换（手柄 ⇄ 鼠标）
   ========================================================= */

function enterPadMode() {
  gpNav.padMode = true
  missingTicks = 0
  gpNav.modeTip = Date.now()
  lastInputAt = Date.now()
  gpNav.hintVisible = true
  if (!currentEl || !currentEl.isConnected) {
    const list = collect()
    if (list.length) setFocus(initialFocusTarget(list), { instant: true })
  }
}

export function exitPadMode(reason) {
  gpNav.exitReason = reason || 'manual'
  exitAdjust()
  if (currentEl) currentEl.classList.remove('gp-focus')
  currentEl = null
  gpNav.padMode = false
  gpNav.hintOpen = false
  gpNav.hintVisible = false
  gpNav.focusKind = ''
  holdDir = null
  holdKey = ''
}

function onMouseMove(event) {
  if (!gpNav.padMode) return
  if (lastMouseX === null) {
    lastMouseX = event.clientX
    lastMouseY = event.clientY
    return
  }
  // 忽略 1~2px 的手抖，真的要动鼠标才退回鼠标模式
  if (Math.abs(event.clientX - lastMouseX) + Math.abs(event.clientY - lastMouseY) < 6) return
  lastMouseX = event.clientX
  lastMouseY = event.clientY
  exitPadMode('mouse')
}

function onMouseDown() {
  if (gpNav.padMode) exitPadMode('mouse')
}

function onKeyDown() {
  // 软键盘输入走的是覆盖层按钮，这里只处理真实的物理键盘
  if (gpNav.padMode) exitPadMode('keyboard')
}

function onWindowBlur() {
  if (gpNav.padMode) exitPadMode('blur')
}

function bindListeners() {
  if (listenersBound) return
  listenersBound = true
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('wheel', onMouseDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('blur', onWindowBlur)
}

function unbindListeners() {
  if (!listenersBound) return
  listenersBound = false
  document.removeEventListener('mousemove', onMouseMove, true)
  document.removeEventListener('mousedown', onMouseDown, true)
  document.removeEventListener('wheel', onMouseDown, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('blur', onWindowBlur)
}

/* =========================================================
   生命周期
   ========================================================= */

export async function initGamepadNav() {
  if (!window.electronAPI || !window.electronAPI.getNavState) return
  // 实验性质：默认关闭，只有存档明确写了 enabled 才启用
  let saved = 'disabled'
  try {
    saved = await window.electronAPI.getStore(GP_NAV_STORE_KEY, 'disabled')
  } catch (error) {
    saved = 'disabled'
  }
  gpNav.enabled = saved === 'enabled'
  bindListeners()
  if (gpNav.enabled) startPolling()
  installDebugBridge()
}

export function setNavEnabled(enabled) {
  const next = !!enabled
  gpNav.enabled = next
  if (next) {
    bindListeners()
    startPolling()
  } else {
    stopPolling()
    exitPadMode('disabled')
  }
}

export function disposeGamepadNav() {
  stopPolling()
  unbindListeners()
  exitPadMode('dispose')
}

export function isNavEnabled() {
  return gpNav.enabled
}

/** 手柄模式是否处于激活状态（页面据此决定用应用内对话框还是系统对话框） */
export function isPadMode() {
  return !!gpNav.padMode
}

/** 页面切换后重新锚定焦点（新页面是 v-if 挂载的，元素全换了） */
export function notifyViewChanged() {
  if (!gpNav.padMode) return
  setTimeout(() => {
    if (!gpNav.padMode) return
    const list = collect()
    if (!list.length) return
    if (currentEl && currentEl.isConnected && list.includes(currentEl)) return
    setFocus(initialFocusTarget(list), { instant: true })
  }, 90)
}

/**
 * 调试通道：没有手柄时也能在浏览器/开发工具里验证各个覆盖层。
 * 只在窗口上挂一个只读入口，不参与任何业务逻辑。
 */
function installDebugBridge() {
  if (typeof window === 'undefined') return
  window.__gpNav = {
    state: gpNav,
    move,
    activate,
    back,
    clear: clearFocus,
    exit: exitPadMode,
    refocus: refocusOverlay,
    focusEl: (el) => setFocus(el, { instant: true }),
    current: () => currentEl,
    enter: () => enterPadMode(),
    button: (index) => handleButton(index),
    stats: () => ({ missingTicks, now: Date.now() }),
    adjust: () => (gpNav.adjusting ? exitAdjust() : enterAdjust(currentEl)),
    /** 顶栏工具按钮组（十字键左右专属通道） */
    bar: () => barButtons(),
    barFocus: () => isBarFocused(),
    chooser: (props) => openOverlay('chooser', props || {}),
    keyboard: (props) => openOverlay('keyboard', props || {}),
    folder: (props) => openOverlay('folder', props || {}),
    confirm: (props) => openOverlay('confirm', props || {})
  }
}
