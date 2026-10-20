<template>
  <div class="page">
    <!-- ===== 页头 ===== -->
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ $t('mappingSettings') }}</h1>
        <p class="page-sub">
          <span class="dot" :class="{ off: !deviceName }"></span>
          {{ deviceName || $t('ui.noGamepad') }}
          <span v-if="deviceName" class="ui-hint">{{ deviceMeta }}</span>
        </p>
      </div>
      <div class="head-actions">
        <button class="ui-btn sm" :title="$t('refresh')" @click="refreshDevice">
          <AppIcon name="refresh" :size="12" />{{ $t('refresh') }}
        </button>
      </div>
    </div>

    <!-- ===== 状态 hero（与截图页共用同一个横幅组件，启动/停止按钮一致） ===== -->
    <PageHero
      :live="config.enabled"
      tag="MAPPING ENGINE"
      :title="config.enabled ? $t('MappingPage.onTitle') : $t('MappingPage.offTitle')"
      :sub="config.enabled ? $t('MappingPage.onDesc') : $t('MappingPage.offDesc')">
      <template #actions>
        <button v-if="!config.enabled" class="hero-cta start" data-gp-autofocus
          :title="$t('MappingPage.masterSwitchHint')" @click="toggleEnabled">
          <AppIcon name="play" :size="15" />
          {{ $t('start') }}
        </button>
        <button v-else class="hero-cta stop" data-gp-autofocus
          :title="$t('MappingPage.masterSwitchHint')" @click="toggleEnabled">
          <AppIcon name="stop" :size="15" />
          {{ $t('stop') }}
        </button>
      </template>

      <template #meta>
        <span>{{ $t('MappingPage.metaDevice') }}<b>{{ deviceShort }}</b></span>
        <span>{{ $t('MappingPage.metaRules') }}<b>{{ activeRuleCount }} / {{ config.rules.length }}</b></span>
        <span>{{ $t('MappingPage.metaOutput') }}<b>keybd_event</b></span>
        <span>
          {{ $t('MappingPage.metaConflict') }}
          <b :class="conflictGroups.length ? 'warn' : 'ok'">
            {{ conflictGroups.length ? $t('MappingPage.conflictCount', { count: conflictGroups.length }) : $t('MappingPage.noConflict') }}
          </b>
        </span>
      </template>
    </PageHero>

    <!-- ===== 映射规则 ===== -->
    <!-- 映射未启动时整块不可用：手柄导航也直接跳过（只留横幅上的启动按钮可点） -->
    <div class="ui-card map-rules" :class="{ 'is-disabled': !config.enabled }"
      :data-gp-skip="!config.enabled ? '' : null">
      <div class="ui-card-head">
        <div class="ui-card-head-left">
          <div class="ui-card-ico"><AppIcon name="keyboard" :size="13" /></div>
          <span class="ui-card-title">{{ $t('MappingPage.rules') }}</span>
          <span class="ui-card-hint">{{ $t('MappingPage.rulesHint') }}</span>
        </div>
        <div class="head-actions">
          <span class="ui-badge" :class="{ on: activeRuleCount > 0 }">
            {{ $t('MappingPage.enabledCount', { enabled: activeRuleCount, total: config.rules.length }) }}
          </span>
          <button class="ui-btn primary sm" @click="addRule">
            <AppIcon name="plus" :size="12" />{{ $t('MappingPage.addRule') }}
          </button>
        </div>
      </div>

      <div v-if="config.rules.length" class="rule-cols">
        <span></span>
        <span>{{ $t('MappingPage.colPad') }}</span>
        <span></span>
        <span>{{ $t('MappingPage.colKeys') }}</span>
        <span>{{ $t('MappingPage.colTrigger') }}</span>
        <span>{{ $t('MappingPage.colEnable') }}</span>
        <span></span>
      </div>

      <div v-if="config.rules.length" class="rule-list">
        <div v-for="(rule, index) in config.rules" :key="rule.id" class="rule"
          :class="{ 'is-rec': detect.ruleId === rule.id, 'is-off': !rule.enabled }"
          :data-gp-pause="isListeningPad(rule) ? '' : null">
          <span class="rule-no">{{ String(index + 1).padStart(2, '0') }}</span>

          <!-- 手柄输入 -->
          <div class="side pad">
            <span class="side-ico"><AppIcon name="gamepad" :size="13" /></span>
            <div v-if="isListeningPad(rule)" class="rec-box" data-gp @click="cancelDetect">
              <span>{{ $t('MappingPage.pressPad') }}</span><span class="caret"></span>
            </div>
            <div v-else class="keys">
              <template v-if="rule.pad.length">
                <template v-for="(token, i) in rule.pad" :key="token">
                  <span v-if="i > 0" class="kplus">+</span>
                  <span class="key">{{ padKeyLabel(token) }}</span>
                </template>
              </template>
              <span v-else class="key ghost">{{ $t('MappingPage.emptyPad') }}</span>
            </div>
            <button class="ui-btn sm detect-btn" :class="{ primary: isListeningPad(rule) }"
              :title="$t('MappingPage.recognizePad')" @click="toggleDetectPad(rule)">
              {{ isListeningPad(rule) ? $t('MappingPage.cancel') : $t('MappingPage.recognize') }}
            </button>
          </div>

          <div class="arrow"><AppIcon name="chevronRight" :size="13" /></div>

          <!-- 键盘输出 -->
          <div class="side keys">
            <span class="side-ico kb"><AppIcon name="keyboard" :size="13" /></span>
            <div class="keys">
              <span v-for="code in rule.keys" :key="code" class="key kb removable" data-gp
                :title="$t('MappingPage.removeKey')" @click="removeKey(rule, code)">
                {{ keyLabelOf(code) }}
                <span class="chip-x"><AppIcon name="close" :size="8" :stroke-width="2.6" /></span>
              </span>
              <div v-if="isListeningKey(rule)" class="rec-box" @click="cancelDetect">
                <span>{{ $t('MappingPage.pressOneKey') }}</span><span class="caret"></span>
              </div>
              <button v-else-if="rule.keys.length < maxKeys" class="add-key" :title="$t('MappingPage.addKey')"
                @click="startDetectKey(rule)">
                <AppIcon name="plus" :size="10" />{{ $t('MappingPage.addKey') }}
              </button>
              <span v-if="!rule.keys.length && !isListeningKey(rule)" class="ui-hint">{{ $t('MappingPage.emptyKeys') }}</span>
            </div>
          </div>

          <div class="rule-tail">
            <div class="ui-seg map-trigger">
              <button v-for="mode in triggers" :key="mode" :class="{ on: rule.trigger === mode }"
                @click="rule.trigger = mode">{{ $t('MappingPage.trigger' + triggerKey(mode)) }}</button>
            </div>

            <button class="ui-switch" :class="{ on: rule.enabled }" @click="rule.enabled = !rule.enabled"></button>

            <button class="ui-btn sm icon-only danger delete-btn" :title="$t('delete')" @click="removeRule(index)">
              <AppIcon name="trash" :size="12" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="rule-empty">
        <AppIcon name="keyboard" :size="18" />
        <div class="rule-empty-text">
          <b>{{ $t('MappingPage.noRules') }}</b>
          <span class="ui-hint">{{ $t('MappingPage.noRulesHint') }}</span>
        </div>
      </div>

      <div class="rules-foot">
        <AppIcon name="bulb" :size="12" />
        <span class="ui-hint">{{ $t('MappingPage.detectHint') }}</span>
        <span class="spacer"></span>
        <span class="ui-hint mono">{{ $t('MappingPage.ruleCount', { count: config.rules.length }) }}</span>
      </div>
    </div>

    <!-- ===== 下半区 ===== -->
    <div class="map-bottom" :class="{ 'is-disabled': !config.enabled }"
      :data-gp-skip="!config.enabled ? '' : null">
      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico violet"><AppIcon name="sliders" :size="13" /></div>
            <span class="ui-card-title">{{ $t('MappingPage.output') }}</span>
          </div>
          <span class="ui-badge">{{ $t('MappingPage.global') }}</span>
        </div>
        <div class="ui-rows">
          <div class="ui-row">
            <span class="ui-label">{{ $t('MappingPage.longPress') }}</span>
            <div class="map-range">
              <input class="ui-range" type="range" min="100" max="2000" step="50" v-model.number="config.longPressMs" />
              <span class="range-val">{{ (config.longPressMs / 1000).toFixed(2) }} s</span>
            </div>
          </div>
          <div class="ui-row">
            <span class="ui-label">{{ $t('MappingPage.repeatInterval') }}</span>
            <div class="map-range">
              <input class="ui-range" type="range" min="20" max="200" step="10" v-model.number="config.repeatMs" />
              <span class="range-val">{{ config.repeatMs }} ms</span>
            </div>
          </div>
          <p class="ui-hint param-hint">{{ $t('MappingPage.paramHint') }}</p>
        </div>
      </div>

      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico cyan"><AppIcon name="clock" :size="13" /></div>
            <span class="ui-card-title">{{ $t('MappingPage.recent') }}</span>
            <span class="ui-card-hint">{{ $t('MappingPage.recentHint') }}</span>
          </div>
          <div class="head-actions">
            <span class="ui-hint">{{ $t('MappingPage.logSwitch') }}</span>
            <button class="ui-switch" :class="{ on: config.logEnabled }" :title="$t('MappingPage.logSwitchHint')"
              @click="toggleLog"></button>
            <button class="ui-btn sm ghost" :disabled="!logs.length" @click="clearLogs">{{ $t('MappingPage.clear') }}</button>
          </div>
        </div>
        <div class="log-list" v-if="logs.length">
          <div class="log-row" v-for="(entry, index) in visibleLogs" :key="index">
            <span class="log-time">{{ formatTime(entry.ts) }}</span>
            <div class="log-body">
              <span class="mini pad">{{ padComboLabel(entry.pad) }}</span>
              <AppIcon name="chevronRight" :size="10" />
              <span class="mini kb">{{ keyComboLabel(entry.keys) }}</span>
            </div>
            <span class="log-state" :class="{ muted: entry.ok === false }">
              {{ entry.ok === false ? $t('MappingPage.sendFailed') : $t('MappingPage.sent') }}
            </span>
          </div>
        </div>
        <div v-else class="log-empty">{{ config.logEnabled ? $t('MappingPage.noLogs') : $t('MappingPage.logOff') }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import PageHero from '@/components/PageHero.vue'
import { KEY_BY_CODE, keyLabel } from '@/lib/keymap'

const TRIGGERS = ['press', 'hold', 'repeat']
const POLL_MS = 60
/** 手柄组合键录制：最后一次变动后再等这么久，把同时按住的键一起收下 */
const PAD_SETTLE_MS = 350
const PAD_MAX_WAIT_MS = 4000
const MAX_KEYS = 4

let pollTimer = null

export default {
  name: 'MappingSettingsPage',
  components: { AppIcon, PageHero },
  data() {
    return {
      config: {
        enabled: false,
        longPressMs: 600,
        repeatMs: 60,
        // 最近触发记录，默认关闭
        logEnabled: false,
        rules: []
      },
      triggers: TRIGGERS,
      devices: [],
      physicalCount: 0,
      hatCount: 0,
      axisCount: 0,
      logs: [],
      // 单条规则最多几个键（手柄 / 键盘各自计算）
      maxKeys: MAX_KEYS,
      // 录制状态：{ ruleId, kind: 'pad'|'key', baseline:Set, candidate:[], lastChange, startAt }
      detect: { ruleId: '', kind: '', candidate: [] },
      saveTimer: null,
      keyHandler: null
    }
  },
  computed: {
    deviceName() {
      const device = this.devices[0]
      return device && device.name ? device.name : ''
    },
    deviceShort() {
      return this.deviceName || '—'
    },
    deviceMeta() {
      const device = this.devices[0]
      if (!device) return ''
      return `VID:${device.vendor || '----'} / PID:${device.product || '----'}`
    },
    activeRuleCount() {
      return this.config.rules.filter((rule) => rule.enabled && rule.pad.length && rule.keys.length).length
    },
    /** 相同手柄组合的重复规则（会互相抢触发，提示用户去重） */
    conflictGroups() {
      const map = new Map()
      for (const rule of this.config.rules) {
        if (!rule.enabled || !rule.pad.length) continue
        const key = rule.pad.slice().sort().join('+')
        map.set(key, (map.get(key) || 0) + 1)
      }
      return Array.from(map.values()).filter((count) => count > 1)
    },
    visibleLogs() {
      return this.logs.slice(0, 4)
    }
  },
  watch: {
    config: {
      deep: true,
      handler() {
        this.scheduleSave()
      }
    }
  },
  async mounted() {
    await this.loadConfig()
    await this.refreshDevice()
    this.loadLogs()
    if (window.electronAPI.onMappingLog) {
      window.electronAPI.onMappingLog((entry) => {
        if (!entry) return
        this.logs.unshift(entry)
        if (this.logs.length > 40) this.logs.length = 40
      })
    }
    if (window.electronAPI.onDeviceChanged) {
      await window.electronAPI.onDeviceChanged(() => this.refreshDevice(), 'mapping')
    }
    pollTimer = setInterval(this.pollInput, POLL_MS)
  },
  async beforeUnmount() {
    if (window.electronAPI.offMappingLog) window.electronAPI.offMappingLog()
    if (window.electronAPI.offDeviceChanged) await window.electronAPI.offDeviceChanged('mapping')
    clearInterval(pollTimer)
    this.detachKeyListeners()
    // 页面关闭前落盘，避免最后几笔修改丢掉
    await this.persist()
  },
  methods: {
    triggerKey(mode) {
      if (mode === 'hold') return 'Hold'
      if (mode === 'repeat') return 'Repeat'
      return 'Press'
    },
    async loadConfig() {
      const saved = await window.electronAPI.getMappingConfig()
      if (saved) {
        this.config = {
          enabled: saved.enabled === true,
          longPressMs: saved.longPressMs || 600,
          repeatMs: saved.repeatMs || 60,
          logEnabled: saved.logEnabled === true,
          rules: (saved.rules || []).map((rule) => ({
            id: rule.id,
            pad: rule.pad || [],
            keys: rule.keys || [],
            trigger: rule.trigger || 'press',
            enabled: rule.enabled !== false
          }))
        }
      }
    },
    async loadLogs() {
      const list = await window.electronAPI.getMappingLogs()
      this.logs = Array.isArray(list) ? list : []
    },
    toggleLog() {
      this.config.logEnabled = !this.config.logEnabled
      // 关掉时立刻清空列表，避免还留着旧记录
      if (!this.config.logEnabled) this.logs = []
    },
    async clearLogs() {
      await window.electronAPI.clearMappingLogs()
      this.logs = []
    },
    async refreshDevice() {
      const list = (await window.electronAPI.getAllGamePad()) || []
      this.devices = list
      if (!list.length) {
        this.physicalCount = 0
        this.hatCount = 0
        this.axisCount = 0
        return
      }
      // 页面需要拿到按键/十字键/轴数量，才能把手柄键帽翻译成可读标签
      await window.electronAPI.openSdl2Device({ _index: list[0]._index })
      const physical = await window.electronAPI.getDeviceInstancePhysicalButtonNumber()
      const hats = await window.electronAPI.getDeviceInstanceHatNumber()
      const axes = await window.electronAPI.getDeviceInstanceAxisNumber()
      this.physicalCount = physical || 0
      this.hatCount = hats || 0
      this.axisCount = axes || 0
    },
    scheduleSave() {
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => this.persist(), 250)
    },
    async persist() {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
      const payload = JSON.parse(JSON.stringify(this.config))
      await window.electronAPI.saveMappingConfig(payload)
    },
    toggleEnabled() {
      this.config.enabled = !this.config.enabled
      if (!this.config.enabled) this.cancelDetect()
    },
    addRule() {
      const rule = {
        id: 'rule_' + Date.now() + '_' + Math.random().toString(16).slice(2, 6),
        pad: [],
        keys: [],
        trigger: 'press',
        enabled: true
      }
      this.config.rules.push(rule)
      // 新增后直接进入手柄按键录制，少点一次
      this.$nextTick(() => this.startDetectPad(rule))
    },
    removeRule(index) {
      const rule = this.config.rules[index]
      if (rule && this.detect.ruleId === rule.id) this.cancelDetect()
      this.config.rules.splice(index, 1)
    },

    // ===== 手柄键帽标签 =====
    padKeyLabel(token) {
      if (typeof token !== 'string') return '—'
      if (token.startsWith('Button')) {
        const index = Number(token.slice(6))
        if (this.hatCount > 0 && this.physicalCount > 0 && index >= this.physicalCount) {
          const rel = index - this.physicalCount
          const dirs = ['↑', '→', '↓', '←']
          const dir = dirs[rel % 4]
          const hatIndex = Math.floor(rel / 4)
          const prefix = this.$t('MappingPage.hat')
          return (this.hatCount > 1 ? prefix + (hatIndex + 1) : prefix) + dir
        }
        return 'B' + index
      }
      if (token.startsWith('Axis')) {
        return token
      }
      return token
    },
    padComboLabel(tokens) {
      if (!tokens || !tokens.length) return '—'
      return tokens.map((token) => this.padKeyLabel(token)).join('+')
    },
    keyLabelOf(code) {
      return keyLabel(code)
    },
    keyComboLabel(codes) {
      if (!codes || !codes.length) return '—'
      return codes.map((code) => keyLabel(code)).join('+')
    },
    formatTime(ts) {
      const date = new Date(ts || Date.now())
      const pad = (value) => String(value).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    },
    isListeningPad(rule) {
      return this.detect.ruleId === rule.id && this.detect.kind === 'pad'
    },
    isListeningKey(rule) {
      return this.detect.ruleId === rule.id && this.detect.kind === 'key'
    },

    // ===== 录制：手柄组合键 =====
    toggleDetectPad(rule) {
      if (this.detect.ruleId === rule.id && this.detect.kind === 'pad') {
        this.cancelDetect()
        return
      }
      this.startDetectPad(rule)
    },
    startDetectPad(rule) {
      this.cancelDetect()
      this.detect = {
        ruleId: rule.id,
        kind: 'pad',
        baseline: new Set(),
        candidate: [],
        lastChange: 0,
        startAt: Date.now()
      }
      // 已经按住的键当基线忽略，避免"一进录制就命中"
      this.currentPressedTokens().then((tokens) => {
        if (this.detect.ruleId === rule.id) {
          this.detect.baseline = new Set(tokens)
        }
      })
    },

    // ===== 录制：键盘按键（一次只录一个） =====
    /**
     * 组合键逐个录入：点「添加按键」→ 只等下一个键 → 收进列表并退出监听。
     * 不直接录整组组合键，是因为按下 Ctrl+Shift+S 这类组合时，
     * 系统与游戏会先收到一次真实按键（可能触发快捷键），逐个录入可以完全避开。
     */
    startDetectKey(rule) {
      if (!rule || rule.keys.length >= MAX_KEYS) return
      this.cancelDetect()
      this.detect = { ruleId: rule.id, kind: 'key', candidate: [], startAt: Date.now() }

      this.keyHandler = (event) => {
        if (!this.detect.ruleId || this.detect.kind !== 'key') return
        // 监听期间吃掉这次按键，避免它继续触发应用/系统快捷键
        event.preventDefault()
        event.stopPropagation()
        const code = event.code
        if (!KEY_BY_CODE[code]) return
        const target = this.findRule(this.detect.ruleId)
        this.cancelDetect()
        if (!target) return
        if (target.keys.indexOf(code) === -1 && target.keys.length < MAX_KEYS) {
          target.keys.push(code)
        }
      }
      window.addEventListener('keydown', this.keyHandler, true)
    },
    removeKey(rule, code) {
      const index = rule.keys.indexOf(code)
      if (index !== -1) rule.keys.splice(index, 1)
    },
    detachKeyListeners() {
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true)
      this.keyHandler = null
    },
    cancelDetect() {
      this.detachKeyListeners()
      this.detect = { ruleId: '', kind: '', candidate: [] }
    },
    findRule(ruleId) {
      return this.config.rules.find((rule) => rule.id === ruleId) || null
    },

    // ===== 输入轮询 =====
    async currentPressedTokens() {
      const tokens = []
      try {
        const buttons = (await window.electronAPI.getCurrentButtonsValue()) || []
        buttons.forEach((value, index) => {
          if (value) tokens.push('Button' + index)
        })
        const axes = (await window.electronAPI.getCurrentAxesValue()) || []
        axes.forEach((value, index) => {
          const num = Number(value) || 0
          if (num >= 0.55) tokens.push('Axis' + index + '+')
          else if (num <= -0.55) tokens.push('Axis' + index + '-')
        })
      } catch (error) {
        // 设备没打开时忽略
      }
      return tokens
    },
    async pollInput() {
      if (!this.detect.ruleId || this.detect.kind !== 'pad') return
      const now = Date.now()
      const tokens = await this.currentPressedTokens()
      const fresh = tokens.filter((token) => !(this.detect.baseline && this.detect.baseline.has(token)))

      if (fresh.length) {
        const merged = new Set(this.detect.candidate || [])
        fresh.forEach((token) => merged.add(token))
        const next = Array.from(merged)
        if (next.length !== (this.detect.candidate || []).length) {
          this.detect.candidate = next
          this.detect.lastChange = now
        }
      }

      const candidate = this.detect.candidate || []
      if (!candidate.length) {
        if (now - this.detect.startAt > PAD_MAX_WAIT_MS * 3) this.cancelDetect()
        return
      }
      const settled = now - (this.detect.lastChange || now) > PAD_SETTLE_MS
      const timedOut = now - this.detect.startAt > PAD_MAX_WAIT_MS
      if (settled || timedOut) this.finishPadDetect(candidate)
    },
    finishPadDetect(candidate) {
      const rule = this.findRule(this.detect.ruleId)
      const tokens = (candidate || []).slice(0, MAX_KEYS)
      this.cancelDetect()
      if (!rule || !tokens.length) return
      rule.pad = tokens
    }
  }
}
</script>

<style scoped>
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ===== 规则列表 ===== */
.map-rules {
  margin-bottom: 8px;
  flex: 0 0 auto;
  transition: opacity 0.22s ease, filter 0.22s ease;
}

.rule-cols,
.rule {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 18px minmax(0, 1fr) auto 36px 30px;
  align-items: center;
  gap: 8px;
}

.rule-cols {
  padding: 0 10px 6px;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  font-weight: 600;
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rule {
  padding: 4px 10px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  transition: border-color 0.16s ease, background 0.16s ease, opacity 0.2s ease;
}

.rule:hover {
  border-color: var(--line-strong);
}

.rule.is-rec {
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.rule.is-off {
  opacity: 0.45;
}

.rule-no {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink-3);
  text-align: center;
}

.side {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.side-ico {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  background: var(--cyan-soft);
  color: var(--cyan);
}

.side-ico.kb {
  background: var(--accent-soft);
  color: var(--accent);
}

.keys {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.key {
  height: 25px;
  min-width: 28px;
  padding: 0 8px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--cyan);
  background: var(--cyan-soft);
  border: 1px solid rgba(110, 227, 240, 0.28);
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.18);
  white-space: nowrap;
}

html.theme-light .key {
  color: #0F7F94;
  background: rgba(30, 159, 184, 0.12);
  border-color: rgba(15, 127, 148, 0.34);
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.05);
}

.key.kb {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

html.theme-light .key.kb {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

.key.ghost,
.key.kb.ghost {
  color: var(--ink-3);
  background: transparent;
  border-style: dashed;
  border-color: var(--line-strong);
  box-shadow: none;
  font-weight: 500;
}

.kplus {
  color: var(--ink-3);
  font-size: 10px;
  flex: 0 0 auto;
}

.arrow {
  color: var(--ink-3);
  display: grid;
  place-items: center;
}

.rec-box {
  flex: 1;
  height: 25px;
  min-width: 0;
  border-radius: 7px;
  border: 1px dashed var(--accent);
  background: var(--accent-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 10.5px;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  animation: recGlow 1.4s ease-in-out infinite;
}

@keyframes recGlow {
  0%, 100% { box-shadow: 0 0 0 0 var(--accent-soft); }
  50% { box-shadow: 0 0 0 4px var(--accent-soft); }
}

.caret {
  width: 1.5px;
  height: 12px;
  background: var(--accent);
  animation: caretBlink 1s steps(2) infinite;
}

@keyframes caretBlink {
  50% { opacity: 0; }
}

/* 手柄侧的文字按钮：比图标按钮更好认，高度压到与键帽一致 */
.ui-btn.detect-btn {
  height: 25px;
  padding: 0 9px;
  font-size: 10.5px;
  flex: 0 0 auto;
}

/* 键盘侧「添加按键」占位按钮 */
.add-key {
  height: 25px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  border-radius: 7px;
  border: 1px dashed var(--line-strong);
  background: transparent;
  color: var(--ink-2);
  font-size: 10.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-key:hover {
  color: var(--accent);
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

/* 键盘键帽：点一下移除 */
.key.removable {
  cursor: pointer;
  padding-right: 6px;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.key.removable:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.chip-x {
  display: inline-flex;
  align-items: center;
  margin-left: 3px;
  opacity: 0.45;
  transition: opacity 0.15s ease;
}

.key.removable:hover .chip-x {
  opacity: 1;
}

.rule-tail {
  display: contents;
}

.map-trigger {
  height: 25px;
  padding: 2px;
  flex: 0 0 auto;
}

.map-trigger button {
  height: 19px;
  padding: 0 7px;
  font-size: 10px;
  border-radius: 5px;
}

.rules-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--line-strong);
  color: var(--ink-3);
}

.rules-foot .spacer {
  margin-left: auto;
}

.rules-foot .ui-hint {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border: 1px dashed var(--line-strong);
  border-radius: 11px;
  color: var(--ink-3);
}

.rule-empty-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.rule-empty-text b {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.rule-empty .ui-btn {
  flex: 0 0 auto;
}

/* ===== 下半区 ===== */
.map-bottom {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.16fr);
  gap: 8px;
  /* 卡片按内容高度收敛，避免窗口拉高时底部大片留白 */
  flex: 0 0 auto;
  min-height: 0;
  transition: opacity 0.22s ease, filter 0.22s ease;
}

.map-rules.is-disabled,
.map-bottom.is-disabled {
  opacity: 0.45;
  pointer-events: none;
  filter: saturate(0.7);
}

.map-range {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: 1;
  justify-content: flex-end;
}

.map-range .ui-range {
  -webkit-appearance: none;
  appearance: none;
  width: 132px;
  height: 4px;
  border-radius: 99px;
  background: var(--line-strong);
  outline: none;
  cursor: pointer;
  flex: 0 0 auto;
}

.map-range .ui-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  box-shadow: 0 0 0 2px var(--accent-soft);
  cursor: pointer;
}

.range-val {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10.5px;
  color: var(--ink-2);
  width: 52px;
  text-align: right;
}

.param-hint {
  margin: 8px 0 0;
  line-height: 1.5;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: hidden;
}

.log-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 60px;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--ink-3);
}

.log-row + .log-row {
  border-top: 1px solid var(--line);
}

.log-time {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink-3);
}

.log-body {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.mini {
  height: 20px;
  padding: 0 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--ink-2);
  background: var(--surface-2);
  border: 1px solid var(--line);
  white-space: nowrap;
}

.mini.pad {
  color: var(--cyan);
  background: var(--cyan-soft);
  border-color: rgba(110, 227, 240, 0.28);
}

html.theme-light .mini.pad {
  color: #0F7F94;
  border-color: rgba(15, 127, 148, 0.34);
}

.mini.kb {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

.log-state {
  text-align: right;
  font-size: 9.5px;
  color: var(--ok);
  font-family: "Cascadia Mono", Consolas, monospace;
}

.log-state.muted {
  color: var(--danger);
}

.log-empty {
  flex: 1;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--ink-3);
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  min-height: 76px;
}

/* 窄窗口：每条规则改成上下两段（手柄在上、键盘在下），尾部控件单独一行 */
@media (max-width: 900px) {
  .map-bottom {
    grid-template-columns: minmax(0, 1fr);
  }

  .rule-cols {
    display: none;
  }

  .rule {
    grid-template-columns: 20px minmax(0, 1fr) auto;
    grid-template-areas:
      "no pad  pad"
      "no keys tail";
    row-gap: 6px;
    padding: 7px 10px;
  }

  .rule-no {
    grid-area: no;
    align-self: start;
    padding-top: 6px;
  }

  .side.pad {
    grid-area: pad;
  }

  .side.keys {
    grid-area: keys;
  }

  .arrow {
    display: none;
  }

  .rule-tail {
    grid-area: tail;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-self: end;
  }
}
</style>
