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
    if (!isVisible(el)) continue
    list.push(el)
  }
  return list
}

/**
 * 进入手柄模式时的起点：页面主操作（data-gp-autofocus，如「启动」）优先，
 * 其次内容区第一个可操作项，最后才退回左侧导航按钮。
 */
function initialFocusTarget(list) {
  if (!list.length) return null
  const marked = scopeRoot().querySelector('[data-gp-autofocus]')
  if (marked && list.indexOf(marked) !== -1) return marked
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
  const row = el.closest('.ui-row, .set-row, .obs-field, .data-item')
  if (!row) return ''
  const label = row.querySelector('.ui-label, .set-label, .obs-field > span, .data-title')
  if (!label) return ''
  const text = (label.textContent || '').replace(/\s+/g, ' ').trim()
  return text
}

function labelOf(el) {
  if (!el) return ''
  const explicit = el.getAttribute('aria-label') || el.getAttribute('title')
  if (explicit) return explicit.trim()
  if (el.tagName === 'SELECT' && el.selectedIndex >= 0 && el.options[el.selectedIndex]) {
    return el.options[el.selectedIndex].textContent.trim()
  }
  if (el.tagName === 'INPUT') return (el.value || el.placeholder || '').trim()
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  return text.slice(0, 48)
}

function setFocus(el, options) {
  if (!el) return
  const instant = !!(options && options.instant)
  if (currentEl && currentEl !== el) currentEl.classList.remove('gp-focus')
  currentEl = el
  el.classList.add('gp-focus')
  gpNav.focusLabel = labelOf(el)

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

/**
 * 在指定方向上找「最近且方向合理」的下一个元素。
 * 评分 = 主方向距离 + 正交偏移（同一行/列内的元素正交偏移几乎为 0，优先命中）。
 */
function findNext(list, cur, dir) {
  const cr = cur.getBoundingClientRect()
  const ccx = cr.left + cr.width / 2
  const ccy = cr.top + cr.height / 2
  let best = null
  let bestScore = Infinity

  for (let i = 0; i < list.length; i++) {
    const el = list[i]
    if (el === cur) continue
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2

    let primary = 0
    let perp = 0
    let sameBand = false

    if (dir === 'right' || dir === 'left') {
      primary = dir === 'right' ? cx - ccx : ccx - cx
      perp = Math.abs(cy - ccy)
      sameBand = r.top < cr.bottom && r.bottom > cr.top
    } else {
      primary = dir === 'down' ? cy - ccy : ccy - cy
      perp = Math.abs(cx - ccx)
      sameBand = r.left < cr.right && r.right > cr.left
    }

    // 目标必须真的在那一侧（留 1px 容差，避免同一元素边界抖动）
    if (primary <= 1) continue

    const score = primary + (sameBand ? perp * 0.35 : perp * 1.9)
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

function move(dir) {
  const list = collect()
  if (!list.length) return

  // 滑条：左右直接调值，不移动焦点（否则永远走不出滑条）
  if (currentEl && currentEl.tagName === 'INPUT' && currentEl.type === 'range'
    && (dir === 'left' || dir === 'right')) {
    nudgeRange(currentEl, dir === 'right' ? 1 : -1)
    return
  }

  if (!currentEl || !list.includes(currentEl)) {
    setFocus(initialFocusTarget(list))
    return
  }
  const next = findNext(list, currentEl, dir)
  if (next) setFocus(next)
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
  // 覆盖层里可以用 data-gp-autofocus 指定默认焦点（例如文件夹选择器的「选择此文件夹」）
  setTimeout(() => {
    if (!gpNav.overlay) return
    const list = collect()
    if (!list.length) return
    const marked = scopeRoot().querySelector('[data-gp-autofocus]')
    setFocus(marked && list.indexOf(marked) !== -1 ? marked : list[0], { instant: true })
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
  if (currentEl) currentEl.classList.remove('gp-focus')
  currentEl = null
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
    danger: !!opts.danger
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
  if (tag === 'INPUT' && el.type === 'range') return nudgeRange(el, 1)
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
  exitPadMode('back')
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

function dirsFromState(state) {
  const hats = state.hats || []
  const axes = state.axes || []
  let up = !!hats[0]
  let right = !!hats[1]
  let down = !!hats[2]
  let left = !!hats[3]

  const ax = Number(axes[0]) || 0
  const ay = Number(axes[1]) || 0
  if (ay <= -AXIS_THRESHOLD) up = true
  if (ay >= AXIS_THRESHOLD) down = true
  if (ax <= -AXIS_THRESHOLD) left = true
  if (ax >= AXIS_THRESHOLD) right = true

  // 斜向时只认一个方向，避免焦点在列表里乱跳
  if (down) return 'down'
  if (up) return 'up'
  if (right) return 'right'
  if (left) return 'left'
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
  const direction = dirsFromState(state)

  // 提示条：有输入时亮出来，静置 6 秒后自动收起，避免长期挡住界面
  if (pressed.some(Boolean) || direction) lastInputAt = Date.now()
  if (gpNav.padMode) gpNav.hintVisible = Date.now() - lastInputAt < 6000

  // 正在录制组合键：按键全部交给录制逻辑，导航只同步基线状态
  if (isPaused()) {
    prevPressed = pressed
    holdDir = null
    return
  }

  if (!gpNav.padMode) {
    // 第一次输入只负责「点亮」手柄模式，不触发操作，避免误点
    if (direction || pressed.some(Boolean)) enterPadMode()
    prevPressed = pressed
    return
  }

  for (let i = 0; i < pressed.length; i++) {
    if (pressed[i] && !prevPressed[i]) handleButton(i)
  }
  prevPressed = pressed

  if (!direction) {
    holdDir = null
    return
  }
  const now = Date.now()
  if (direction !== holdDir) {
    holdDir = direction
    nextRepeatAt = now + REPEAT_DELAY_MS
    move(direction)
  } else if (now >= nextRepeatAt) {
    nextRepeatAt = now + REPEAT_INTERVAL_MS
    move(direction)
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
  if (currentEl) currentEl.classList.remove('gp-focus')
  currentEl = null
  gpNav.padMode = false
  gpNav.hintOpen = false
  gpNav.hintVisible = false
  holdDir = null
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
    exit: exitPadMode,
    refocus: refocusOverlay,
    focusEl: (el) => setFocus(el, { instant: true }),
    current: () => currentEl,
    enter: () => enterPadMode(),
    button: (index) => handleButton(index),
    stats: () => ({ missingTicks, now: Date.now() }),
    chooser: (props) => openOverlay('chooser', props || {}),
    keyboard: (props) => openOverlay('keyboard', props || {}),
    folder: (props) => openOverlay('folder', props || {}),
    confirm: (props) => openOverlay('confirm', props || {})
  }
}
