/**
 * 手柄 → 键盘映射引擎（运行在主进程，窗口最小化/隐藏时也照常工作）。
 *
 * 按键读取直接复用 background.js 里已经打开的 SDL 设备实例状态（buttons / axes / hats），
 * 不额外抢占设备；没有设备时会尝试自动打开第一支手柄。
 *
 * 规则结构：
 *   { id, pad: ['Button0','Button5'], keys: ['ControlLeft','KeyS'], trigger: 'press'|'hold'|'repeat', enabled: true }
 *
 * 触发模式：
 *   press  —— 组合键同时按下瞬间触发一次
 *   hold   —— 按住超过 longPressMs 后触发一次
 *   repeat —— 按住期间按 repeatMs 间隔连续触发
 */
const { toSendKeys } = require('./keymap')

const STORE_KEY = 'mappingConfig'
const TICK_MS = 25
/** 短规则（如单键 A）遇到「包含它的更长组合」（如 A+B）时，先等一小段时间让长组合有优先权 */
const COMBO_GRACE_MS = 70
/** 轴的模拟量转数字键的阈值 */
const AXIS_THRESHOLD = 0.55

const DEFAULT_CONFIG = {
  enabled: false,
  longPressMs: 600,
  repeatMs: 60,
  // 最近触发日志默认关闭：不记录任何内容
  logEnabled: false,
  rules: []
}

const TRIGGERS = ['press', 'hold', 'repeat']

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

/** 规整一份外部传入的配置，避免脏数据把引擎带崩 */
function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const rules = Array.isArray(source.rules) ? source.rules : []
  const normalizedRules = []
  const seen = new Set()

  for (const item of rules) {
    if (!item || typeof item !== 'object') continue
    const pad = Array.isArray(item.pad)
      ? item.pad.filter((token) => typeof token === 'string' && token.trim()).map((token) => token.trim())
      : []
    const keys = Array.isArray(item.keys)
      ? item.keys.filter((code) => typeof code === 'string' && code.trim()).map((code) => code.trim())
      : []
    // 空规则（还没录按键）保留下来，方便用户在界面上继续编辑
    let id = typeof item.id === 'string' && item.id ? item.id : ''
    if (!id || seen.has(id)) id = `rule_${Date.now()}_${normalizedRules.length}`
    seen.add(id)
    normalizedRules.push({
      id,
      pad: Array.from(new Set(pad)).slice(0, 4),
      keys: Array.from(new Set(keys)).slice(0, 4),
      trigger: TRIGGERS.indexOf(item.trigger) !== -1 ? item.trigger : 'press',
      enabled: item.enabled !== false
    })
  }

  return {
    enabled: source.enabled === true,
    longPressMs: clampNumber(source.longPressMs, 100, 2000, DEFAULT_CONFIG.longPressMs),
    repeatMs: clampNumber(source.repeatMs, 20, 500, DEFAULT_CONFIG.repeatMs),
    logEnabled: source.logEnabled === true,
    rules: normalizedRules
  }
}

function createMappingEngine({ configStore, log, getSnapshot, ensureDevice, keySender, notify, onStateChange }) {
  let config = DEFAULT_CONFIG
  let timer = null
  let running = false
  let lastDeviceCheckAt = 0
  let deviceReady = false
  const runtime = new Map()
  const logs = []
  const MAX_LOGS = 50

  function load() {
    let raw = configStore.get(STORE_KEY, null)
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw)
      } catch (error) {
        log.warn('[MAPPING] Failed to parse saved mapping config, fallback to default:', error)
        raw = null
      }
    }
    config = normalizeConfig(raw)
    return config
  }

  function save(nextConfig) {
    const wasEnabled = config.enabled
    config = normalizeConfig(nextConfig)
    configStore.set(STORE_KEY, JSON.stringify(config))
    if (!config.logEnabled) logs.length = 0
    // 保存后立即按新配置生效（启用开关、规则增删都走这里）
    applyEnabledState()
    if (wasEnabled !== config.enabled) emitStateChange()
    return config
  }

  function emitStateChange() {
    if (typeof onStateChange !== 'function') return
    try {
      onStateChange(config.enabled)
    } catch (error) {
      // 渲染进程已销毁时忽略
    }
  }

  function getConfig() {
    return config
  }

  function pushLog(entry) {
    // 记录开关关闭时既不存也不推送
    if (!config.logEnabled) return
    logs.unshift(entry)
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS
    if (typeof notify === 'function') {
      try {
        notify(entry)
      } catch (error) {
        // 窗口已销毁时忽略
      }
    }
  }

  function isTokenPressed(token, snapshot) {
    if (typeof token !== 'string') return false
    if (token.startsWith('Button')) {
      const index = Number(token.slice(6))
      if (!Number.isInteger(index) || index < 0) return false
      return snapshot.buttons[index] === true
    }
    if (token.startsWith('Axis')) {
      const match = token.match(/^Axis(\d+)([+-])$/)
      if (!match) return false
      const index = Number(match[1])
      const value = Number(snapshot.axes[index]) || 0
      return match[2] === '+' ? value >= AXIS_THRESHOLD : value <= -AXIS_THRESHOLD
    }
    return false
  }

  function ruleState(ruleId) {
    let state = runtime.get(ruleId)
    if (!state) {
      state = { activeSince: 0, firedOnce: false, nextRepeatAt: 0, pendingSince: 0, suppressed: false }
      runtime.set(ruleId, state)
    }
    return state
  }

  function fire(rule) {
    const keys = toSendKeys(rule.keys)
    if (!keys.length) return false
    const ok = keySender.tap(keys)
    pushLog({
      ts: Date.now(),
      ruleId: rule.id,
      pad: rule.pad.slice(),
      keys: rule.keys.slice(),
      ok: ok !== false,
      trigger: rule.trigger
    })
    return true
  }

  /** 触发一条规则，并把「键更少且被子集包含」的规则标记为已消费，避免同一按压触发多次 */
  function fireAndSuppress(rule, rules) {
    fire(rule)
    for (const other of rules) {
      if (other.id === rule.id) continue
      if (other.pad.length >= rule.pad.length) continue
      const isSubset = other.pad.every((token) => rule.pad.indexOf(token) !== -1)
      if (isSubset) ruleState(other.id).suppressed = true
    }
  }

  /**
   * 定时轮询入口。主进程装了 uncaughtException → 直接弹窗退出，
   * 所以这里必须把所有异常吞掉：映射出问题不能连累整个应用。
   */
  function tick() {
    try {
      evaluate()
    } catch (error) {
      log.warn('[MAPPING] Tick failed:', error)
    }
  }

  function evaluate() {
    if (!running || !config.enabled) return
    const now = Date.now()

    let snapshot = null
    try {
      snapshot = getSnapshot()
    } catch (error) {
      snapshot = null
    }

    if (!snapshot) {
      deviceReady = false
      // 每 2 秒尝试拉一次设备，避免用户还没打开任何页面时映射不工作
      if (now - lastDeviceCheckAt > 2000) {
        lastDeviceCheckAt = now
        if (typeof ensureDevice === 'function') {
          try {
            ensureDevice()
          } catch (error) {
            log.warn('[MAPPING] Failed to ensure gamepad device:', error)
          }
        }
      }
      return
    }
    deviceReady = true

    // 长组合优先：先处理键多的规则，短规则才不会被抢先触发
    const rules = config.rules
      .filter((rule) => rule.enabled && rule.pad.length && rule.keys.length)
      .sort((a, b) => b.pad.length - a.pad.length)
    if (!rules.length) {
      runtime.clear()
      return
    }

    // 一次算出每条规则按下了几个键
    const pressedCount = new Map()
    for (const rule of rules) {
      let count = 0
      for (const token of rule.pad) {
        if (isTokenPressed(token, snapshot)) count++
      }
      pressedCount.set(rule.id, count)
    }

    for (const rule of rules) {
      const state = ruleState(rule.id)
      const count = pressedCount.get(rule.id) || 0
      const satisfied = count === rule.pad.length

      if (!satisfied) {
        // 松开（或缺键）就复位，下次按下可以重新触发
        state.activeSince = 0
        state.firedOnce = false
        state.pendingSince = 0
        state.nextRepeatAt = 0
        state.suppressed = false
        continue
      }

      if (!state.activeSince) state.activeSince = now

      // 已被同一次按压里的长组合吃掉（例如按了 A+B，就不再单独触发 A）
      if (state.suppressed) continue

      // 「还有更长的组合没按完」时，先给长组合让路
      const longerPending = rules.some((other) => {
        if (other.id === rule.id || other.pad.length <= rule.pad.length) return false
        const otherCount = pressedCount.get(other.id) || 0
        if (otherCount === 0 || otherCount === other.pad.length) return false
        return rule.pad.every((token) => other.pad.indexOf(token) !== -1)
      })

      if (longerPending) {
        if (!state.pendingSince) state.pendingSince = now
        if (now - state.pendingSince < COMBO_GRACE_MS) continue
      } else {
        state.pendingSince = 0
      }

      if (rule.trigger === 'hold') {
        if (state.firedOnce) continue
        if (now - state.activeSince < config.longPressMs) continue
        state.firedOnce = true
        fireAndSuppress(rule, rules)
        continue
      }

      if (rule.trigger === 'repeat') {
        if (now < state.nextRepeatAt) continue
        state.nextRepeatAt = now + config.repeatMs
        fireAndSuppress(rule, rules)
        continue
      }

      // press
      if (state.firedOnce) continue
      state.firedOnce = true
      fireAndSuppress(rule, rules)
    }
  }

  function startTimer() {
    if (timer) return
    timer = setInterval(tick, TICK_MS)
    if (timer.unref) timer.unref()
  }

  function stopTimer() {
    if (!timer) return
    clearInterval(timer)
    timer = null
  }

  function applyEnabledState() {
    if (config.enabled) {
      keySender.start()
      running = true
      startTimer()
    } else {
      running = false
      stopTimer()
      runtime.clear()
    }
  }

  return {
    init() {
      load()
      /**
       * 启动时的启用状态只由系统设置里的「启动时运行键盘映射」决定，
       * 不再沿用上次退出前的开关：没开这个设置，启动后映射一律是关闭的。
       */
      const autoStart = configStore.get('mappingAutoStart', false)
      const autoEnabled = autoStart === true || autoStart === 'true'
      config = normalizeConfig({ ...config, enabled: autoEnabled })
      configStore.set(STORE_KEY, JSON.stringify(config))
      applyEnabledState()
      emitStateChange()
      return config
    },
    getConfig,
    save,
    /** 界面上的总开关 */
    setEnabled(enabled) {
      config = normalizeConfig({ ...config, enabled: enabled === true })
      configStore.set(STORE_KEY, JSON.stringify(config))
      applyEnabledState()
      emitStateChange()
      return config
    },
    getStatus() {
      return {
        enabled: config.enabled,
        deviceReady,
        sender: keySender.getStatus(),
        ruleCount: config.rules.length,
        activeRuleCount: config.rules.filter((rule) => rule.enabled && rule.pad.length && rule.keys.length).length
      }
    },
    getLogs() {
      return logs.slice()
    },
    clearLogs() {
      logs.length = 0
    },
    /** 界面上的「测试输出」：立即发送一次指定组合键，用来确认键盘通道可用 */
    testOutput(codes) {
      keySender.start()
      const keys = toSendKeys(Array.isArray(codes) ? codes : [])
      if (!keys.length) return false
      return keySender.tap(keys) !== false
    },
    dispose() {
      running = false
      stopTimer()
      runtime.clear()
    }
  }
}

module.exports = { createMappingEngine, normalizeConfig, DEFAULT_CONFIG, STORE_KEY, TRIGGERS }
