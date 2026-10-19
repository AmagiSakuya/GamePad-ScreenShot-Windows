<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ $t('gamepadTester') }}</h1>
        <p class="page-sub">
          <span class="dot" :class="{ off: !(currentGamePad && currentGamePad.name) }"></span>
          {{ currentGamePad && currentGamePad.name ? currentGamePad.name : $t('ui.noGamepad') }}
        </p>
      </div>
      <button class="ui-btn" @click="refreshDevice">
        <AppIcon name="refresh" :size="13" />{{ $t('refresh') }}
      </button>
    </div>

    <div class="tester-grid">
      <!-- 设备 -->
      <div class="ui-card device">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico cyan"><AppIcon name="gamepad" :size="13" /></div>
            <span class="ui-card-title">{{ $t('GampadTesterPage.selectController') }}</span>
          </div>
          <span class="ui-badge">{{ deviceMeta }}</span>
        </div>
        <div class="device-row">
          <select class="ui-select device-select" v-model="currentGamePad" @change="onCurrentGameSelectChanged">
            <option v-for="(value, index) in loadedGamePads" :key="index" :value="value">
              {{ value.name }} (VID:{{ value.vendor }} PID:{{ value.product }})
            </option>
          </select>
          <div class="stat-chips">
            <span class="stat-chip">
              <b>{{ physicalButtonCount }}</b>{{ $t('ui.buttons') }}
            </span>
            <span class="stat-chip">
              <b>{{ hatCount }}</b>{{ $t('ui.hats') }}
            </span>
            <span class="stat-chip">
              <b>{{ deviceInstanceAxisCount }}</b>{{ $t('ui.axes') }}
            </span>
          </div>
        </div>
      </div>

      <!-- 按键状态 -->
      <div class="ui-card buttons">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico"><AppIcon name="clock" :size="13" /></div>
            <span class="ui-card-title">{{ $t('GampadTesterPage.buttonState') }}</span>
            <span class="ui-card-hint">{{ $t('ui.pressHint') }}</span>
          </div>
          <span class="ui-badge" :class="{ on: pressedButtonCount > 0 }">{{ pressedButtonCount }} / {{ physicalButtonCount }}</span>
        </div>
        <div class="pad-grid" v-if="physicalButtonCount > 0">
          <div class="pad" v-for="i in physicalButtonCount" :key="'b' + (i - 1)">
            <div class="pad-led" :class="{ on: buttonsValuePreview[i - 1] }"></div>
            <span class="pad-cap">B{{ i - 1 }}</span>
          </div>
        </div>
        <div v-else class="empty-state">{{ $t('ui.noDevice') }}</div>
      </div>

      <!-- 轴状态 -->
      <div class="ui-card axes">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico violet"><AppIcon name="wave" :size="13" /></div>
            <span class="ui-card-title">{{ $t('GampadTesterPage.axisState') }}</span>
          </div>
          <span class="ui-badge">{{ deviceInstanceAxisCount }} AXIS</span>
        </div>
        <div class="axis-list" v-if="axesValuePreview.length">
          <div class="axis-row" v-for="(val, index) in axesValuePreview" :key="'a' + index">
            <span class="axis-name">Axis {{ index }}</span>
            <div class="axis-track">
              <span class="axis-mid"></span>
              <span class="axis-fill" :style="axisFillStyle(val)"></span>
              <span class="axis-thumb" :style="{ left: axisPercent(val) + '%' }"></span>
            </div>
            <span class="axis-val" :class="{ muted: Math.abs(val) < 0.02 }">{{ formatAxisVal(val) }}</span>
          </div>
        </div>
        <div v-else class="empty-state">{{ $t('ui.noDevice') }}</div>
      </div>

      <!-- 十字键 -->
      <div class="ui-card hat">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico warn"><AppIcon name="dpad" :size="13" /></div>
            <span class="ui-card-title">{{ $t('ui.hatState') }}</span>
          </div>
          <span class="ui-badge" :class="{ on: hatActive }">{{ hatActive ? $t('ui.pressed') : 'HAT' }}</span>
        </div>

        <div class="hat-body" v-if="hatCount > 0">
          <div class="dpad">
            <div class="dpad-cell up" :class="{ on: hatDirs[0] }"></div>
            <div class="dpad-cell left" :class="{ on: hatDirs[3] }"></div>
            <div class="dpad-cell center"></div>
            <div class="dpad-cell right" :class="{ on: hatDirs[1] }"></div>
            <div class="dpad-cell down" :class="{ on: hatDirs[2] }"></div>
          </div>
          <div class="hat-meta">
            <span class="ui-hint">{{ $t('ui.hatHint') }}</span>
            <span class="ui-chip muted">Button {{ physicalButtonCount }} – {{ physicalButtonCount + hatCount * 4 - 1 }}</span>
          </div>
        </div>
        <div v-else class="empty-state">{{ $t('ui.noHat') }}</div>
      </div>

      <div class="ui-card tips-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico"><AppIcon name="bulb" :size="13" /></div>
            <span class="ui-card-title">{{ $t('ui.testerTips') }}</span>
          </div>
        </div>
        <div class="tips-list">
          <div class="tip"><span class="tip-dot"></span>{{ $t('ui.tipHat') }}</div>
          <div class="tip"><span class="tip-dot"></span>{{ $t('ui.tipBluetooth') }}</div>
          <div class="tip"><span class="tip-dot"></span>{{ $t('ui.tipAxis') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue'
import { toPlain } from '@/lib/ipcSafe'

let rawDevices;
let timer;

export default {
  name: 'ControllerSettingsPage',
  components: { AppIcon },
  data() {
    return {
      loadedGamePads: [],
      currentGamePad: {},
      buttonsValuePreview: new Array(20).fill(false),
      axesValuePreview: [],
      hatValuePreview: [],
      physicalButtonCount: 0,
      hatCount: 0,
      deviceInstanceAxisCount: 0
    }
  },
  computed: {
    pressedButtonCount() {
      return (this.buttonsValuePreview || []).slice(0, this.physicalButtonCount).filter(Boolean).length
    },
    hatDirs() {
      return [
        !!this.hatValuePreview[0],
        !!this.hatValuePreview[1],
        !!this.hatValuePreview[2],
        !!this.hatValuePreview[3]
      ]
    },
    hatActive() {
      return this.hatDirs.some(Boolean)
    },
    deviceMeta() {
      if (!this.currentGamePad || !this.currentGamePad.name) return '—'
      const vendor = this.currentGamePad.vendor
      const product = this.currentGamePad.product
      return `${vendor || '----'} / ${product || '----'}`
    }
  },
  async mounted() {
    await window.electronAPI.onDeviceChanged(this.onSDL2DeviceChanged, 'tester')
    await this.loadGamePadList()
    timer = setInterval(this.getCurrentButtonsValue, 60);
  },
  async beforeUnmount() {
    await window.electronAPI.offDeviceChanged('tester')
    await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
    clearInterval(timer)
  },
  methods: {
    async loadGamePadList() {
      rawDevices = (await window.electronAPI.getAllGamePad()) || []
      this.loadedGamePads = rawDevices;
      if (this.loadedGamePads.length > 0) {
        this.currentGamePad = this.loadedGamePads[0]
        this.initDevice(rawDevices[0])
      } else {
        // 手柄断开后要清空状态，否则页面会残留上一次的已连接显示
        this.currentGamePad = {}
        this.physicalButtonCount = 0
        this.hatCount = 0
        this.deviceInstanceAxisCount = 0
        this.buttonsValuePreview = []
        this.axesValuePreview = []
        this.hatValuePreview = []
      }
    },
    async initDevice(hidDevice) {
      // 设备对象可能来自响应式数组，过 contextBridge 前必须拍平
      let success = await window.electronAPI.openSdl2Device(toPlain(hidDevice))
      let btnNum = 0;
      let axisNum = 0;
      let physicalNum = 0;
      let hatNum = 0;
      if (!success) {
        alert(this.$t('alertMsg.openGamepadFail'))
      } else {
        btnNum = await window.electronAPI.getDeviceInstanceButtonNumber();
        axisNum = await window.electronAPI.getDeviceInstanceAxisNumber();
        physicalNum = await window.electronAPI.getDeviceInstancePhysicalButtonNumber();
        hatNum = await window.electronAPI.getDeviceInstanceHatNumber();
      }
      this.physicalButtonCount = physicalNum || 0;
      this.hatCount = hatNum || 0;
      this.deviceInstanceAxisCount = axisNum || 0;
      // btnNum 含十字键虚拟按键，这里只用于兜底
      if (!physicalNum && btnNum) {
        this.physicalButtonCount = btnNum;
      }
    },
    async refreshDevice() {
      await this.loadGamePadList()
    },
    async onSDL2DeviceChanged() {
      await this.loadGamePadList();
    },
    async onCurrentGameSelectChanged() {
      await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
      let m_device = rawDevices[this.currentGamePad._index]
      await this.initDevice(m_device)
    },
    async getCurrentButtonsValue() {
      const all = await window.electronAPI.getCurrentButtonsValue()
      this.buttonsValuePreview = (all || []).slice(0, this.physicalButtonCount)
      const axes = await window.electronAPI.getCurrentAxesValue()
      this.axesValuePreview = (axes || []).slice(0, this.deviceInstanceAxisCount)
      if (this.hatCount > 0) {
        this.hatValuePreview = await window.electronAPI.getCurrentHatValue()
      }
    },
    axisPercent(val) {
      const v = Math.max(-1, Math.min(1, Number(val) || 0))
      return ((v + 1) / 2) * 100
    },
    axisFillStyle(val) {
      const v = Math.max(-1, Math.min(1, Number(val) || 0))
      const center = 50
      const pos = ((v + 1) / 2) * 100
      const left = Math.min(center, pos)
      const width = Math.abs(pos - center)
      return { left: left + '%', width: width + '%' }
    },
    formatAxisVal(val) {
      if (val === undefined || val === null || isNaN(val)) return '0.00';
      return (val >= 0 ? '+' : '') + Number(val).toFixed(2);
    }
  }
}
</script>

<style scoped>
.tester-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: auto auto 264px auto;
  align-content: start;
  gap: 12px;
}

.device,
.buttons {
  grid-column: span 2;
}

.device-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.device-select {
  min-width: 280px;
  max-width: 420px;
}

.stat-chips {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  padding: 0 11px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: 10px;
  line-height: 1;
  color: var(--ink-3);
}

.stat-chip b {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1;
  color: var(--ink);
  font-weight: 600;
}

/* 按键矩阵 */
.pad-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 12px 6px;
  align-content: start;
  flex: 1;
}

.pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.pad-led {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  display: grid;
  place-items: center;
  transition: all 0.08s linear;
}

.pad-led::after {
  content: "";
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--line-strong);
  transition: all 0.08s linear;
}

.pad-led.on {
  background: var(--accent-soft);
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft), 0 0 20px -4px var(--accent);
}

.pad-led.on::after {
  background: var(--accent);
  box-shadow: 0 0 10px var(--accent);
}

.pad-cap {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9px;
  color: var(--ink-3);
}

.pad-led.on + .pad-cap {
  color: var(--accent);
}

/* 轴 */
.axis-list {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  flex: 1;
}

.axis-row {
  display: grid;
  grid-template-columns: 52px 1fr 54px;
  align-items: center;
  gap: 10px;
}

.axis-name {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink-3);
}

.axis-track {
  height: 5px;
  border-radius: 99px;
  background: var(--surface-2);
  position: relative;
}

.axis-mid {
  position: absolute;
  left: 50%;
  top: -3px;
  bottom: -3px;
  width: 1px;
  background: var(--line-strong);
}

.axis-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 99px;
  background: var(--accent);
  opacity: 0.85;
}

.axis-thumb {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.axis-val {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink);
  text-align: right;
}

.axis-val.muted {
  color: var(--ink-3);
}

/* 十字键 */
.hat-body {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 1;
}

.dpad {
  display: grid;
  grid-template-columns: repeat(3, 34px);
  grid-template-rows: repeat(3, 34px);
  gap: 5px;
  flex: 0 0 auto;
}

.dpad-cell {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  color: var(--ink-3);
  transition: all 0.08s linear;
}

.dpad-cell.up { grid-area: 1 / 2; }
.dpad-cell.left { grid-area: 2 / 1; }
.dpad-cell.center { grid-area: 2 / 2; background: transparent; border-color: transparent; }

.dpad-cell.center::after {
  content: "";
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--line-strong);
}
.dpad-cell.right { grid-area: 2 / 3; }
.dpad-cell.down { grid-area: 3 / 2; }

.dpad-cell.on {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft), 0 0 16px -4px var(--accent);
}

.hat-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.tips-card {
  grid-column: span 2;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 2px;
}

.tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11px;
  color: var(--ink-2);
  line-height: 1.5;
}

.tip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: 6px;
  flex: 0 0 auto;
}

.empty-state {
  flex: 1;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  color: var(--ink-3);
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  min-height: 80px;
}

@media (max-width: 1080px) {
  .tester-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }

  .device,
  .buttons {
    grid-column: span 1;
  }
}
</style>
