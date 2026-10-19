<template>
  <div class="ui-card set-card">
    <div class="ui-card-head set-head" @click="$emit('toggle')">
      <div class="ui-card-head-left">
        <div class="ui-card-ico" :class="group.tone"><AppIcon :name="group.icon" :size="13" /></div>
        <span class="ui-card-title">{{ $t('SystemSettingsPage.' + group.key) }}</span>
      </div>
      <AppIcon name="chevronDown" :size="14" class="chev"
        :style="{ transform: group.collapsed ? 'rotate(-90deg)' : 'none' }" />
    </div>

    <div class="set-rows" v-show="!group.collapsed">
      <div class="set-row" v-for="setting in group.settings" :key="setting.key">
        <div class="set-label">
          <AppIcon :name="setting.icon" :size="13" />
          <span>{{ $t('SystemSettingsPage.' + setting.key) }}</span>
        </div>
        <div class="set-ctl">
          <!-- 布尔开关 -->
          <div v-if="setting.type === 'seg'" class="ui-seg">
            <button v-for="option in setting.options" :key="String(option.value)"
              :class="{ on: valueOf(setting) === option.value }" @click="emitValue(setting, option.value)">
              {{ $t(option.label) }}
            </button>
          </div>

          <!-- 下拉 -->
          <select v-else-if="setting.type === 'select'" class="ui-select" :value="valueOf(setting)"
            @change="onSelectChange(setting, $event)">
            <option v-for="(option, optionIndex) in setting.options" :key="optionIndex" :value="option.value">
              {{ option.text || $t(option.label) }}
            </option>
          </select>

          <!-- 输入框 -->
          <input v-else-if="setting.type === 'input'" class="ui-input" type="text" :placeholder="setting.placeholder"
            :value="valueOf(setting)" @input="emitValue(setting, $event.target.value)">

          <!-- 滑条 -->
          <div v-else-if="setting.type === 'range'" class="range-wrap">
            <span class="range-bound">{{ setting.min }}x</span>
            <input class="ui-range" type="range" :min="setting.min" :max="setting.max" :step="setting.step"
              :value="valueOf(setting)" @input="emitValue(setting, parseFloat($event.target.value))">
            <span class="range-bound">{{ setting.max }}x</span>
            <span class="range-badge">{{ formatOverlayScale(valueOf(setting)) }}</span>
          </div>

          <!-- 按钮 -->
          <button v-else-if="setting.type === 'button'" class="ui-btn" @click="$emit('action', setting)">
            <AppIcon v-if="setting.buttonIcon" :name="setting.buttonIcon" :size="13" />
            {{ $t('SystemSettingsPage.' + setting.key) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue';

const { formatOverlayScale } = require('@/lib/overlayScale');

export default {
  name: 'SettingsCard',
  components: { AppIcon },
  props: {
    // 分组数据：{ key, icon, tone, collapsed, settings[] }
    group: {
      type: Object,
      required: true
    },
    // 设置页的配置对象，单向读取，改动统一通过 change 事件回传
    config: {
      type: Object,
      required: true
    }
  },
  emits: ['change', 'action', 'toggle'],
  methods: {
    formatOverlayScale,
    valueOf(setting) {
      return this.config[setting.configKey];
    },
    emitValue(setting, value) {
      this.$emit('change', setting, value);
    },
    // 下拉选项可能是布尔/数字，DOM 取回的是字符串，需要按原始类型回填
    onSelectChange(setting, event) {
      const raw = event.target.value;
      const matched = setting.options.find(option => String(option.value) === raw);
      this.$emit('change', setting, matched ? matched.value : raw);
    }
  }
}
</script>

<style scoped>
.set-card {
  padding: 11px 14px 4px;
}

.set-head {
  cursor: pointer;
  user-select: none;
  margin-bottom: 4px;
}

.set-head .chev {
  color: var(--ink-3);
  transition: transform 0.18s ease;
}

.set-rows {
  display: flex;
  flex-direction: column;
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
  min-height: 44px;
}

.set-row:first-child {
  border-top: 0;
}

.set-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-2);
  min-width: 0;
}

.set-label .app-icon {
  color: var(--ink-3);
}

.set-ctl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.set-ctl .ui-select {
  min-width: 132px;
}

.set-ctl .ui-input {
  width: 160px;
  flex: 0 0 auto;
}

.range-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-bound {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9.5px;
  color: var(--ink-3);
}

.range-badge {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: 5px;
  padding: 2px 6px;
  min-width: 42px;
  text-align: center;
}

.ui-range {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 4px;
  border-radius: 99px;
  background: var(--line-strong);
  outline: none;
  cursor: pointer;
}

.ui-range::-webkit-slider-thumb {
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
</style>
