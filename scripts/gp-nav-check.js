#!/usr/bin/env node
/**
 * 手柄界面导航自检
 * =========================================================
 * 改完 UI 之后跑一遍，回答四个问题：
 *   1. 每个可聚焦元素的上下左右分别落到哪个元素？（导航图）
 *   2. 有没有「按了没反应又出不去」的死胡同？
 *   3. 滑条和档位条（int progress）是不是仍然「先按确定才能调值」的两段式？
 *      档位条还必须整条只算一个焦点，且按上落在紧邻的上一行。
 *   4. 返回键会不会「保底定格」在某个元素上？连续按返回必须走到「没有任何被选中」。
 *
 * 用法：
 *   node scripts/gp-nav-check.js                 检查 + 终端摘要 + JSON/HTML 报告
 *   node scripts/gp-nav-check.js --shots         额外输出每个框的四方向标注图（慢，约 1~2 分钟）
 *   node scripts/gp-nav-check.js --build         先跑一次 npm run build 再检查
 *   node scripts/gp-nav-check.js --update-baseline  把当前导航图存成基线（用于以后对比）
 *   node scripts/gp-nav-check.js --out <dir>     指定输出目录
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败（可直接接 CI）。
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const BASELINE_FILE = path.join(__dirname, 'gp-nav-baseline.json')

/* =========================================================
   参数
   ========================================================= */
const argv = process.argv.slice(2)
const arg = (name) => argv.includes(name)
const argValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const SHOTS = arg('--shots')
const OUT = path.resolve(argValue('--out', path.join(ROOT, '.workbuddy/reports/gp-nav-check')))
const UPDATE_BASELINE = arg('--update-baseline')

/* =========================================================
   依赖：playwright-core + 本机浏览器
   ========================================================= */
function resolvePlaywright() {
  const candidates = [
    'playwright-core',
    process.env.GP_PLAYWRIGHT,
    path.join(ROOT, 'node_modules/playwright-core'),
    path.join(process.env.USERPROFILE || '', '.workbuddy/binaries/node/workspace/node_modules/playwright-core')
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      return require(c)
    } catch (error) { /* 继续找下一个 */ }
  }
  console.error('✗ 找不到 playwright-core。请先安装：')
  console.error('    npm i -D playwright-core')
  console.error('  （playwright-core 不下载浏览器，会直接用系统已装的 Edge / Chrome）')
  process.exit(1)
}

function findBrowser() {
  const candidates = [
    process.env.GP_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/Application/msedge.exe'),
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch (error) { /* ignore */ }
  }
  console.error('✗ 没找到可用的浏览器。可以手动指定：')
  console.error('    GP_BROWSER="C:/path/to/msedge.exe" node scripts/gp-nav-check.js')
  process.exit(1)
}

/* =========================================================
   静态服务 + electronAPI 桩
   ========================================================= */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav'
}

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0])
    if (p === '/') p = '/index.html'
    const file = path.resolve(DIST, '.' + p)
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

/**
 * 渲染进程的 electronAPI 桩：
 *  - getStore 让手柄导航处于启用状态（默认关闭，不启用就完全没有导航图）
 *  - getNavState 返回 window.__padState，脚本可以随时模拟按键
 */
function stubElectronAPI() {
  window.__padState = { axes: [0, 0], buttons: [], hats: [false, false, false, false] }
  window.electronAPI = new Proxy({}, {
    get(_, prop) {
      if (prop === 'getStore') {
        return (key, def) => {
          if (key === 'gamepadUiNavEnabled') return Promise.resolve('enabled')
          if (key === 'locale') return Promise.resolve('zh')
          return Promise.resolve(def)
        }
      }
      if (prop === 'getNavState') {
        return () => Promise.resolve(JSON.parse(JSON.stringify(window.__padState)))
      }
      if (prop === 'isWindowMaximized') return () => Promise.resolve(false)
      return () => Promise.resolve(undefined)
    }
  })
}

/**
 * 页面内探针：收集可聚焦元素 -> 逐个聚焦后按四个方向 -> 记录落点。
 * 注意：这里的可见性判定必须和 src/lib/gamepadNav.js 的 collect() 保持一致，
 * 改了那边的 FOCUSABLE_SELECTOR / skip 规则记得同步这里。
 */
const PROBE = async () => {
  // 冻结滚动：否则 focus() 的自动滚动会让后续 getBoundingClientRect 全部偏移
  Element.prototype.scrollIntoView = function () {}
  // 组件改值要等 Vue 重渲染后 aria-valuenow 才是新的
  const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 40))

  const SELECTOR = ['button', 'select', 'textarea', 'input', 'a[href]', '[data-gp]'].join(',')
  const isVisible = (el) => {
    if (!el || !el.isConnected || el.disabled || el.type === 'hidden') return false
    // 顶栏工具按钮走十字键专属通道，不参与页面内导航
    if (el.hasAttribute('data-gp-bar')) return false
    const position = getComputedStyle(el).position
    if (!el.offsetParent && position !== 'fixed') return false
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    if (el.closest('.is-locked') || el.closest('[data-gp-skip]')) return false
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.opacity === '0') return false
    return true
  }

  const nav = window.__gpNav
  if (!nav) return { error: '__gpNav missing' }
  nav.enter()

  const list = Array.from(document.querySelectorAll(SELECTOR)).filter((el) => {
    if (el.getAttribute('tabindex') === '-1') return false
    return isVisible(el)
  })

  const describe = (el) => {
    // 档位条本体没有文字，用「行标题 + 当前档位文案」描述（和提示条里的说法一致）
    const rowEl = el.hasAttribute('data-gp-adjust') ? el.closest('.set-row') : null
    const rowText = rowEl
      ? ((rowEl.querySelector('.set-label') || {}).innerText || '').replace(/\s+/g, ' ').trim()
      : ''
    const own = (el.getAttribute('aria-valuetext') || el.getAttribute('aria-label') || el.getAttribute('title')
      || el.innerText || el.textContent || el.value || '').replace(/\s+/g, ' ').trim()
    const text = rowText ? (rowText + ' ' + own).trim() : own
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''
    return `${text.slice(0, 40)} <${el.tagName.toLowerCase()}${el.type ? ':' + el.type : ''}${cls}>`
  }
  const rectOf = (el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  }

  const items = list.map((el) => ({
    label: describe(el),
    tag: el.tagName,
    type: el.type || '',
    inHeader: !!el.closest('header'),
    isBar: el.hasAttribute('data-gp-bar'),
    rect: rectOf(el),
    el
  }))

  const result = []
  items.forEach((item, i) => {
    const dirs = {}
    for (const dir of ['up', 'down', 'left', 'right']) {
      nav.focusEl(item.el)
      nav.move(dir)
      const cur = nav.current()
      dirs[dir] = items.findIndex((x) => x.el === cur)
    }
    result.push({ i, label: item.label, tag: item.tag, type: item.type, inHeader: item.inHeader, rect: item.rect, dirs })
  })

  // 滑条两段式检查：聚焦按右 -> 应导航；确认 -> 进入调节；调节中按右 -> 改值；返回 -> 退出调节
  const ranges = []
  items.filter((x) => x.tag === 'INPUT' && x.type === 'range').forEach((item) => {
    const el = item.el
    const before = el.value
    nav.focusEl(el)
    nav.move('right')
    const leftSliderWithoutConfirm = nav.current() !== el
    const valueUntouched = el.value === before

    nav.focusEl(el)
    nav.activate()
    const adjustEntered = !!nav.state.adjusting
    nav.move('right')
    const valueChanged = el.value !== before
    nav.activate()
    const adjustExited = !nav.state.adjusting
    ranges.push({
      index: items.indexOf(item),
      label: item.label,
      leftSliderWithoutConfirm,
      valueUntouched,
      adjustEntered,
      valueChanged,
      adjustExited
    })
  })

  // 档位条（int progress）两段式：整条只算一个焦点，体验必须和滑条一致
  const steps = []
  for (const item of items.filter((x) => x.el.hasAttribute('data-gp-adjust'))) {
    const el = item.el
    const read = () => Number(el.getAttribute('aria-valuenow'))
    const before = read()
    // 内部方块必须 tabindex=-1：否则手柄会一格一格停在方块上（本次修复的根因）
    const innerStops = Array.from(el.querySelectorAll('button, [data-gp]'))
      .filter((n) => n.getAttribute('tabindex') !== '-1').length

    nav.focusEl(el)
    nav.move('right')
    const leftWithoutConfirm = nav.current() !== el
    const valueUntouched = read() === before

    nav.focusEl(el)
    nav.activate()
    const adjustEntered = !!nav.state.adjusting
    nav.move('right')
    await tick()
    const rightChanged = read() !== before
    nav.move('left')
    await tick()
    const leftRestored = read() === before
    nav.activate()
    const adjustExited = !nav.state.adjusting

    // 上方邻居必须是紧邻的那一行（曾经会从最右边那格直接飞到上一行的「启用」按钮）
    nav.focusEl(el)
    nav.move('up')
    const upEl = nav.current()
    const upLabel = upEl && upEl !== el ? describe(upEl) : ''
    const upGap = upEl && upEl !== el
      ? Math.round(el.getBoundingClientRect().top - upEl.getBoundingClientRect().bottom)
      : null

    steps.push({
      index: items.indexOf(item),
      label: item.label,
      innerStops,
      leftWithoutConfirm,
      valueUntouched,
      adjustEntered,
      rightChanged,
      leftRestored,
      adjustExited,
      upLabel,
      upGap
    })
  }

  // 返回键语义：不应「保底定格」在某个元素上，连续按返回必须能走到「没有任何被选中」
  const backProbe = (() => {
    const marked = Array.from(document.querySelectorAll('[data-gp-autofocus]'))
      .filter((el) => items.some((x) => x.el === el))
    const home = marked[0] || null
    const start = items.find((x) => x.el !== home) || items[0]
    if (!start) return null
    nav.focusEl(start.el)
    nav.back()
    const first = nav.current()
    const toHome = start.el === home ? true : (home ? first === home : first === null)
    nav.back()
    const second = nav.current()
    nav.back()
    const third = nav.current()
    return {
      hasHome: !!home,
      homeLabel: home ? describe(home) : '',
      startLabel: start.label,
      firstStop: first ? describe(first) : '',
      toHome,
      cleared: second === null,
      stays: third === null
    }
  })()

  // 调试页专有：右上「刷新」与下方「选择控制器」必须左右互通
  // （两者上下相邻但左右完全不重叠，是最容易「按了没反应」的地方）
  const headProbe = (() => {
    // MainPage 是 v-show 常驻的，同名按钮在别的页面里也存在，必须只取当前可见的那个
    const pick = (sel) => Array.from(document.querySelectorAll(sel)).find((el) => isVisible(el)) || null
    const refresh = pick('.page-head .ui-btn')
    const sel = pick('.device-row select')
    if (!refresh || !sel) return null
    nav.focusEl(refresh)
    nav.move('left', 'stick')
    const left = nav.current()
    nav.focusEl(sel)
    nav.move('right', 'stick')
    const right = nav.current()
    return {
      leftToSelect: left === sel,
      rightToRefresh: right === refresh,
      leftLabel: left ? describe(left) : '',
      rightLabel: right ? describe(right) : ''
    }
  })()

  // 顶栏工具按钮（主题 / 主题色 / 字号 / 语言）：
  // 十字键是它独占的通道（任意方向都不进页面），摇杆负责把焦点抢回页面
  const barProbe = (() => {
    const bars = nav.bar ? nav.bar() : []
    const out = { count: bars.length, listed: items.filter((x) => x.isBar).length }
    if (!bars.length) return out
    const start = items.find((x) => !x.el.closest('header'))
    if (!start) return out

    // 十字键任何方向都只能把焦点拿到顶栏，不能在页面内移动
    nav.focusEl(start.el)
    nav.move('up', 'hat')
    out.upEnters = !!nav.barFocus()
    nav.focusEl(start.el)
    nav.move('right', 'hat')
    out.entered = !!nav.barFocus() && bars.indexOf(nav.current()) === 0
    if (!out.entered) return out

    // 顶栏内十字键上下同样不离开这一组
    nav.move('down', 'hat')
    out.verticalStays = !!nav.barFocus()
    nav.move('up', 'hat')
    out.verticalBack = !!nav.barFocus()

    // 组内首尾循环
    const seen = new Set([bars.indexOf(nav.current())])
    for (let i = 0; i < bars.length; i++) {
      nav.move('right', 'hat')
      seen.add(bars.indexOf(nav.current()))
    }
    out.covered = seen.size
    out.looped = bars.indexOf(nav.current()) === 0

    // 摇杆：抢回页面，并且回到十字键按下之前停留的那个元素
    nav.move('left', 'stick')
    const cur = nav.current()
    out.grabbed = !!cur && !cur.closest('header')
    out.backToLast = cur === start.el
    nav.clear()
    return out
  })()

  window.__gpNavEls = items.map((x) => x.el)
  nav.exit('probe')
  return {
    items: result.map(({ i, label, tag, type, inHeader, rect, dirs }) => ({ i, label, tag, type, inHeader, rect, dirs })),
    ranges,
    steps,
    back: backProbe,
    bar: barProbe,
    head: headProbe
  }
}

/** 页面内：把当前框和四方向落点画成 SVG（截图用） */
const DRAW = ({ currentIndex, targets }) => {
  document.querySelectorAll('.gpviz').forEach((n) => n.remove())
  const COLORS = { up: '#4ea1ff', down: '#7c5cff', left: '#ffb020', right: '#22c78a' }
  const list = window.__gpvizItems
  const els = window.__gpNavEls || []
  list.forEach((it) => {
    const el = els[it.i]
    if (!el) return
    const r = el.getBoundingClientRect()
    it.rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  })
  const cur = list[currentIndex]
  if (!cur) return false

  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'gpviz')
  svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99999;'
  const defs = document.createElementNS(NS, 'defs')
  Object.entries(COLORS).forEach(([dir, color]) => {
    const marker = document.createElementNS(NS, 'marker')
    marker.setAttribute('id', 'ar-' + dir)
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6')
    marker.setAttribute('orient', 'auto-start-reverse')
    const p = document.createElementNS(NS, 'path')
    p.setAttribute('d', 'M0,0 L10,5 L0,10 z')
    p.setAttribute('fill', color)
    marker.appendChild(p)
    defs.appendChild(marker)
  })
  svg.appendChild(defs)

  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag)
    for (const k in attrs) n.setAttribute(k, attrs[k])
    return n
  }

  Object.entries(targets).forEach(([dir, idx]) => {
    const t = list[idx]
    if (!t || idx === currentIndex) return
    const r = t.rect
    svg.appendChild(mk('rect', {
      x: r.x, y: r.y, width: r.w, height: r.h, rx: 8,
      fill: COLORS[dir] + '18', stroke: COLORS[dir], 'stroke-width': 2, 'stroke-dasharray': '6 4'
    }))
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2
    svg.appendChild(mk('circle', { cx, cy, r: 13, fill: COLORS[dir] }))
    const text = mk('text', {
      x: cx, y: cy + 4.5, 'text-anchor': 'middle', fill: '#0b0d12',
      'font-size': 12, 'font-weight': 700, 'font-family': 'Segoe UI, sans-serif'
    })
    text.textContent = dir[0].toUpperCase()
    svg.appendChild(text)
  })

  const c = cur.rect
  svg.appendChild(mk('rect', {
    x: c.x - 2, y: c.y - 2, width: c.w + 4, height: c.h + 4, rx: 9,
    fill: 'none', stroke: '#ff3b6b', 'stroke-width': 3
  }))
  const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2
  Object.entries(targets).forEach(([dir, idx]) => {
    const t = list[idx]
    if (!t || idx === currentIndex) return
    const r = t.rect
    const tx = r.x + r.w / 2, ty = r.y + r.h / 2
    const dx = tx - ccx, dy = ty - ccy
    const len = Math.hypot(dx, dy) || 1
    const half = Math.abs(dx) > Math.abs(dy) ? r.w / 2 : r.h / 2
    svg.appendChild(mk('line', {
      x1: ccx + (dx / len) * 6, y1: ccy + (dy / len) * 6,
      x2: tx - (dx / len) * half * 0.9, y2: ty - (dy / len) * half * 0.9,
      stroke: COLORS[dir], 'stroke-width': 2.2, 'stroke-opacity': 0.85,
      'marker-end': `url(#ar-${dir})`
    }))
  })

  const title = mk('text', {
    x: 24, y: 30, fill: '#fff', 'font-size': 12, 'font-family': 'Consolas, monospace'
  })
  title.textContent = `#${currentIndex} ${cur.label}`.slice(0, 70)
  const bg = mk('rect', { x: 12, y: 12, width: Math.min(760, 20 + title.textContent.length * 7.2), height: 28, rx: 8, fill: '#0b0d12dd', stroke: '#ff3b6b' })
  svg.appendChild(bg)
  svg.appendChild(title)
  document.body.appendChild(svg)
  return true
}

/* =========================================================
   断言
   ========================================================= */
function analysePage(name, data) {
  const { items, ranges, steps, back, bar, head } = data
  const dirs = ['up', 'down', 'left', 'right']

  // 同名元素很多（设置页一排「启用/禁用」），diff 必须用「名称#第几个」当唯一键
  const counters = {}
  items.forEach((r) => {
    counters[r.label] = (counters[r.label] || 0) + 1
    r.uid = `${r.label}#${counters[r.label]}`
  })

  const inDegree = {}
  items.forEach((r) => dirs.forEach((d) => {
    const v = r.dirs[d]
    if (v >= 0) inDegree[v] = (inDegree[v] || 0) + 1
  }))

  const deadEnds = items.filter((r) => dirs.every((d) => r.dirs[d] < 0 || r.dirs[d] === r.i))
  const unreachable = items.filter((r) => !inDegree[r.i] && !r.inHeader)
  return { name, items, ranges, steps, back, bar, head, deadEnds, unreachable }
}

function runAssertions(pages) {
  const checks = []
  const warnings = []
  const push = (ok, title, detail) => checks.push({ ok, title, detail })

  pages.forEach((p) => {
    push(p.items.length > 0, `[${p.name}] 有可聚焦元素`, `${p.items.length} 个`)
    push(p.deadEnds.length === 0, `[${p.name}] 没有死胡同`,
      p.deadEnds.length ? p.deadEnds.map((r) => `#${r.i} ${r.label}`).join(' / ') : '0 处')
    // 没有入边不代表导航坏了（可能是页面内容为空、按钮本身是入口），只提示
    if (p.unreachable.length) {
      warnings.push({
        title: `[${p.name}] 这些元素只能靠兜底/初焦点到达`,
        detail: p.unreachable.map((r) => `#${r.i} ${r.label}`).join(' / ')
      })
    }
    // 返回键：不允许「保底定格」在某个元素上，最终必须是「没有任何被选中」
    if (p.back) {
      const b = p.back
      push(b.toHome,
        b.hasHome
          ? `[${p.name}] 返回先回到页面主操作`
          : `[${p.name}] 返回直接取消选中（没有保底元素）`,
        b.hasHome
          ? `「${b.startLabel}」→「${b.homeLabel}」`
          : `「${b.startLabel}」→ 无选中`)
      push(b.cleared && b.stays,
        `[${p.name}] 连续返回最终没有任何被选中`,
        b.cleared && b.stays
          ? '焦点清空，且空选中后继续按返回保持空'
          : `清空=${b.cleared ? '是' : '否'}，空选中后继续按=${b.stays ? '保持空' : '又被聚焦'}`)
    }
    p.ranges.forEach((r) => {
      // 核心是「没按确定时左右不改值」；按右是移开焦点还是原地不动取决于右侧有没有邻居
      const ok = r.valueUntouched && r.adjustEntered && r.valueChanged && r.adjustExited
      push(ok, `[${p.name}] 滑条两段式 #${r.index}`,
        ok
          ? `按右${r.leftSliderWithoutConfirm ? '移开焦点' : '原地不动'}且不改值 → 确认进入调节 → 调节改值 → 再确认退出`
          : JSON.stringify(r))
    })

    // 档位条：整条一个焦点 + 两段式 + 上方邻居必须是紧邻的那一行
    p.steps.forEach((s) => {
      const ok = s.innerStops === 0 && s.valueUntouched && s.adjustEntered
        && s.rightChanged && s.leftRestored && s.adjustExited
      push(ok, `[${p.name}] 档位条两段式 #${s.index}`,
        ok
          ? `整条 1 个焦点 → 按右${s.leftWithoutConfirm ? '移开焦点' : '原地不动'}且不改档 → 确认进入调节 → 左右改档 → 再确认退出`
          : JSON.stringify(s))
      const upOk = typeof s.upGap === 'number' && s.upGap <= 64
      push(upOk, `[${p.name}] 档位条按上 → 紧邻的上一行 #${s.index}`,
        upOk ? `→ ${s.upLabel}（间隙 ${s.upGap}px）` : `落到了「${s.upLabel || '没有元素'}」，间隙 ${s.upGap === null ? '—' : s.upGap + 'px'}`)
    })

    // 调试页：右上「刷新」与下方「选择控制器」左右互通
    if (p.head) {
      push(p.head.leftToSelect, `[${p.name}] 「刷新」按左 → 选择控制器`,
        p.head.leftLabel ? `→ ${p.head.leftLabel}` : '没有移动')
      push(p.head.rightToRefresh, `[${p.name}] 「选择控制器」按右 → 刷新`,
        p.head.rightLabel ? `→ ${p.head.rightLabel}` : '没有移动')
    }

    // 顶栏工具按钮（十字键专属通道）
    if (p.bar && p.bar.count) {
      const b = p.bar
      push(b.listed === 0, `[${p.name}] 顶栏按钮不参与页面内导航`,
        b.listed === 0 ? '摇杆到不了顶栏' : `导航图里出现 ${b.listed} 个顶栏按钮`)
      push(!!b.upEnters && !!b.entered, `[${p.name}] 十字键任意方向都强制拿到顶栏`,
        b.upEnters && b.entered
          ? '从页面元素按上/右，焦点都进顶栏，页面焦点不动'
          : `按上夺焦=${b.upEnters ? '是' : '否'}，按右夺焦=${b.entered ? '是' : '否'}`)
      push(!!b.verticalStays && !!b.verticalBack, `[${p.name}] 顶栏内十字键上下不离开`,
        b.verticalStays && b.verticalBack ? '上/下都还在这一组里' : '跑出去了')
      push(b.covered === b.count && !!b.looped, `[${p.name}] 顶栏在组内首尾循环`,
        b.covered === b.count && b.looped
          ? `连按 ${b.count} 次走遍 ${b.count} 个并回到起点`
          : `走到 ${b.covered}/${b.count} 个，回起点=${b.looped ? '是' : '否'}`)
      push(!!b.grabbed, `[${p.name}] 摇杆把焦点从顶栏抢回页面`,
        b.grabbed ? '顶栏 → 页面内容' : '焦点仍停在顶栏')
      push(!!b.backToLast, `[${p.name}] 摇杆抢回时回到进顶栏前的位置`,
        b.backToLast ? '回到原元素' : '落到了别处')
    }
  })
  return { checks, warnings }
}

function diffBaseline(baseline, pages) {
  if (!baseline) return null
  const changes = []
  pages.forEach((p) => {
    const old = baseline[p.name]
    if (!old) { changes.push(`[${p.name}] 新增页面`); return }
    const oldMap = new Map(old.map((r) => [r.uid || r.label, r]))
    p.items.forEach((r) => {
      const key = r.uid
      const prev = oldMap.get(key)
      if (!prev) { changes.push(`[${p.name}] + ${key}`); return }
      const moved = ['up', 'down', 'left', 'right'].filter((d) => prev.dirs[d] !== r.dirs[d])
      if (moved.length) {
        changes.push(`[${p.name}] ${key} —— ${moved.map((d) => `${d}: #${prev.dirs[d]} → #${r.dirs[d]}`).join('，')}`)
      }
      oldMap.delete(key)
    })
    oldMap.forEach((r, key) => changes.push(`[${p.name}] - ${key}`))
  })
  return changes
}

/* =========================================================
   报告
   ========================================================= */
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function writeHtml(report, shotsExist) {
  const dirChip = (dir, v, items) => {
    if (v === undefined) return ''
    const t = items[v]
    const text = v < 0 ? '原地不动' : `#${v} ${esc((t ? t.label : '').slice(0, 26))}`
    return `<span class="chip ${v < 0 ? 'none' : dir}"><i>${dir[0].toUpperCase()}</i>${text}</span>`
  }
  const pageBlocks = report.pages.map((p) => {
    const rows = p.items.map((r) => `
      <tr>
        <td class="mono">#${r.i}</td>
        <td>${esc(r.label)}</td>
        <td>${['up', 'down', 'left', 'right'].map((d) => `<span class="mini ${r.dirs[d] < 0 ? 'off' : ''}">${r.dirs[d] < 0 ? '·' : '#' + r.dirs[d]}</span>`).join('')}</td>
        <td class="mono">${r.rect.x},${r.rect.y}</td>
        ${shotsExist ? `<td>${fs.existsSync(path.join(OUT, `shot-${p.key}-${r.i}.png`))
          ? `<a href="./shot-${p.key}-${r.i}.png" target="_blank"><img class="thumb" src="./shot-${p.key}-${r.i}.png" alt=""></a>` : ''}</td>` : ''}
      </tr>`).join('')
    const rangeRows = p.ranges.map((r) => `
      <tr><td class="mono">#${r.index}</td><td>${esc(r.label)}</td>
      <td>${r.leftSliderWithoutConfirm ? '✅' : '❌'}</td>
      <td>${r.valueUntouched ? '✅' : '❌'}</td>
      <td>${r.adjustEntered ? '✅' : '❌'}</td>
      <td>${r.valueChanged ? '✅' : '❌'}</td>
      <td>${r.adjustExited ? '✅' : '❌'}</td></tr>`).join('')
    const stepRows = (p.steps || []).map((s) => `
      <tr><td class="mono">#${s.index}</td><td>${esc(s.label)}</td>
      <td>${s.innerStops === 0 ? '✅' : '❌'}</td>
      <td>${s.valueUntouched ? '✅' : '❌'}</td>
      <td>${s.adjustEntered ? '✅' : '❌'}</td>
      <td>${s.rightChanged && s.leftRestored ? '✅' : '❌'}</td>
      <td>${s.adjustExited ? '✅' : '❌'}</td>
      <td>${typeof s.upGap === 'number' && s.upGap <= 64 ? '✅ ' : '❌ '}${s.upLabel ? esc(s.upLabel.slice(0, 24)) + ` (${s.upGap}px)` : '没有落点'}</td></tr>`).join('')
    return `
    <section>
      <h2>${esc(p.name)} <span class="muted">${p.items.length} 个可聚焦元素 · 死胡同 ${p.deadEnds.length}${p.back ? ` · 返回 → ${p.back.hasHome ? '主操作 → 无选中' : '直接无选中'}` : ''}</span></h2>
      ${rangeRows ? `<table class="ranges"><thead><tr><th>滑条</th><th>名称</th><th>右=导航</th><th>未确认不改值</th><th>确认进调节</th><th>调节改值</th><th>再确认退出</th></tr></thead><tbody>${rangeRows}</tbody></table>` : ''}
      ${stepRows ? `<table class="ranges"><thead><tr><th>档位条</th><th>名称</th><th>整条 1 焦点</th><th>未确认不改档</th><th>确认进调节</th><th>左右改档</th><th>再确认退出</th><th>按上落点</th></tr></thead><tbody>${stepRows}</tbody></table>` : ''}
      <table><thead><tr><th>#</th><th>元素</th><th>↑ ↓ ← →</th><th>位置</th>${shotsExist ? '<th>标注图</th>' : ''}</tr></thead><tbody>${rows}</tbody></table>
    </section>`
  }).join('')

  const failed = report.checks.filter((c) => !c.ok)
  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>手柄导航自检 · ${new Date(report.at).toLocaleString('zh-CN')}</title>
<style>
:root{--bg:#0b0d12;--panel:#12161f;--line:#232a38;--ink:#e8edf6;--ink2:#a7b2c4;--ink3:#6f7c91;--ok:#22c78a;--bad:#ff5c7a;--up:#4ea1ff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.65 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;padding:40px 28px 80px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:24px;margin:0 0 8px}
h2{font-size:16px;margin:44px 0 12px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.muted{color:var(--ink3);font-weight:400;font-size:12px;margin-left:10px}
.banner{border-radius:12px;padding:14px 18px;margin:18px 0 0;font-weight:600}
.banner.pass{background:#0f2721;border:1px solid #1f4a3b;color:#7fe3bb}
.banner.fail{background:#2a1720;border:1px solid #4a2634;color:#ff9db1}
.checks{display:grid;gap:6px;margin:16px 0 0;font-size:13px}
.check{display:flex;gap:10px;align-items:flex-start;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:8px 12px}
.check .dot{flex:0 0 auto;width:16px}
.check.fail{border-color:#4a2634;background:#1c1319}
.check.warn{border-color:#4a3d1c;background:#1e1a10;color:#ffe0a3}
.check .detail{color:var(--ink3);font-size:12px;margin-left:auto;text-align:right;max-width:56%}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--ink3);font-size:11px;letter-spacing:.05em;text-transform:uppercase}
tr:last-child td{border-bottom:0}
td.mono,.mono{font-family:"Cascadia Mono",Consolas,monospace;color:var(--ink2)}
.mini{display:inline-block;min-width:34px;font-family:"Cascadia Mono",Consolas,monospace;color:#9ec7ff}
.mini.off{color:var(--ink3)}
.thumb{width:180px;border-radius:6px;border:1px solid var(--line);display:block}
.ranges{margin-bottom:16px}
.foot{margin-top:40px;color:var(--ink3);font-size:12px}
</style></head><body><div class="wrap">
<h1>手柄界面导航自检</h1>
<p class="muted" style="margin:0">${new Date(report.at).toLocaleString('zh-CN')} · ${report.browser} · 视口 ${report.viewport}</p>
<div class="banner ${failed.length ? 'fail' : 'pass'}">
  ${failed.length ? `✗ ${failed.length} 项断言失败` : `✓ 全部 ${report.checks.length} 项断言通过`}
</div>
<div class="checks">
${report.checks.map((c) => `<div class="check ${c.ok ? '' : 'fail'}"><span class="dot">${c.ok ? '✅' : '❌'}</span><span>${esc(c.title)}</span><span class="detail">${esc(c.detail || '')}</span></div>`).join('')}
${(report.warnings || []).map((w) => `<div class="check warn"><span class="dot">⚠️</span><span>${esc(w.title)}</span><span class="detail">${esc(w.detail || '')}</span></div>`).join('')}
</div>
${report.diff && report.diff.length ? `<h2>与基线对比 <span class="muted">${report.diff.length} 处落点变化</span></h2>
<table><thead><tr><th>变化</th></tr></thead><tbody>${report.diff.map((d) => `<tr><td class="mono">${esc(d)}</td></tr>`).join('')}</tbody></table>` : ''}
${pageBlocks}
<div class="foot">重新生成：<code>node scripts/gp-nav-check.js${shotsExist ? ' --shots' : ''}</code>　·　基线：<code>node scripts/gp-nav-check.js --update-baseline</code></div>
</div></body></html>`
  fs.writeFileSync(path.join(OUT, 'index.html'), html)
}

/* =========================================================
   主流程
   ========================================================= */
;(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('✗ dist/ 不存在，先构建：npm run build（或加 --build 参数）')
    process.exit(1)
  }
  if (arg('--build')) {
    console.log('· 构建 dist ...')
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })
  }

  const { chromium } = resolvePlaywright()
  const browserPath = findBrowser()
  const server = await startServer()
  const port = server.address().port
  fs.mkdirSync(OUT, { recursive: true })

  const VIEWPORT = { width: 1280, height: 820 }
  const browser = await chromium.launch({ executablePath: browserPath, headless: true })
  const ctx = await browser.newContext({ viewport: VIEWPORT })
  const page = await ctx.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await page.addInitScript(stubElectronAPI)
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const pages = await page.evaluate(() => Array.from(document.querySelectorAll('.rail > .rail-btn'))
    .map((el, i) => ({ i, name: (el.title || el.innerText || '').replace(/\s+/g, ' ').trim() || ('page-' + i) })))
  if (!pages.length) {
    console.error('✗ 页面上没找到 .rail > .rail-btn，界面结构可能变了')
    await browser.close(); server.close(); process.exit(1)
  }

  const reportPages = []
  for (const p of pages) {
    await page.evaluate((i) => {
      const btn = document.querySelectorAll('.rail > .rail-btn')[i]
      if (btn) btn.click()
    }, p.i)
    await page.waitForTimeout(500)

    const data = await page.evaluate(PROBE)
    if (data.error) {
      console.error('✗ 探针失败：' + data.error)
      await browser.close(); server.close(); process.exit(1)
    }
    const analysed = analysePage(p.name, data)
    analysed.key = p.name
    reportPages.push(analysed)

    if (SHOTS) {
      await page.evaluate((items) => { window.__gpvizItems = items }, data.items)
      for (const row of data.items) {
        await page.evaluate(DRAW, { currentIndex: row.i, targets: row.dirs })
        await page.screenshot({ path: path.join(OUT, `shot-${p.name}-${row.i}.png`) })
      }
      await page.evaluate(() => document.querySelectorAll('.gpviz').forEach((n) => n.remove()))
    }
    console.log(`· ${p.name}: ${data.items.length} 个元素，死胡同 ${analysed.deadEnds.length}`)
  }

  const { checks, warnings } = runAssertions(reportPages)
  let baseline = null
  if (fs.existsSync(BASELINE_FILE)) {
    try { baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) } catch (error) { baseline = null }
  }
  const diff = diffBaseline(baseline && baseline.pages, reportPages)

  const report = {
    at: Date.now(),
    browser: path.basename(browserPath),
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    checks,
    warnings,
    diff,
    pages: reportPages.map((p) => ({
      key: p.key,
      name: p.name,
      ranges: p.ranges,
      steps: p.steps,
      back: p.back,
      bar: p.bar,
      head: p.head,
      deadEnds: p.deadEnds.map((r) => ({ i: r.i, label: r.label })),
      unreachable: p.unreachable.map((r) => ({ i: r.i, label: r.label })),
      items: p.items
    }))
  }

  fs.writeFileSync(path.join(OUT, 'gp-nav-report.json'), JSON.stringify(report, null, 2))
  writeHtml(report, SHOTS)

  if (UPDATE_BASELINE) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify({
      at: new Date().toISOString(),
      viewport: report.viewport,
      pages: Object.fromEntries(reportPages.map((p) => [p.name, p.items]))
    }, null, 2))
    console.log(`· 基线已更新：${path.relative(ROOT, BASELINE_FILE)}`)
  }

  await browser.close()
  server.close()

  // 终端摘要
  const failed = checks.filter((c) => !c.ok)
  console.log('')
  if (pageErrors.length) {
    console.log('⚠ 页面运行时报错：')
    pageErrors.slice(0, 5).forEach((e) => console.log('   ' + e.split('\n')[0]))
  }
  if (diff && diff.length) {
    console.log(`· 与基线相比有 ${diff.length} 处落点变化（前 10 条）：`)
    diff.slice(0, 10).forEach((d) => console.log('   ' + d))
  }
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} 条提示（不影响退出码）：`)
    warnings.forEach((w) => console.log(`   ⚠ ${w.title} — ${w.detail}`))
  }
  if (failed.length) {
    console.log(`\n✗ ${failed.length} / ${checks.length} 项断言失败：`)
    failed.forEach((c) => console.log(`   ✗ ${c.title} — ${c.detail}`))
  } else {
    console.log(`✓ 全部 ${checks.length} 项断言通过`)
  }
  console.log(`\n报告：${path.relative(ROOT, path.join(OUT, 'index.html'))}`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
