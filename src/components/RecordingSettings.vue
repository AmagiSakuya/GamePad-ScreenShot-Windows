<template>
  <div class="rec-body">
    <!-- 录制来源不再单独配置，直接跟随截图来源，避免两套设置打架 -->
    <div class="rec-field">
      <span>{{ $t('Recording.target') }}</span>
      <div class="rec-source">
        <AppIcon :name="sourceIcon" :size="12" />
        <span class="rec-source-text">{{ sourceLabel || $t('Recording.sourceFollowsScreenshot') }}</span>
      </div>
    </div>

    <!-- 系统声音：WASAPI 环回抓的是「输出设备正在播放的混音」，
         不是麦克风，也不需要用户装虚拟声卡。
         声音是必录项（没有开关），这里只让用户指定「录哪一路输出」——
         有多个输出设备（扬声器 / HDMI / 虚拟设备）时必须能选，
         不选就是「跟随 Windows 当前默认」，换默认设备时自动跟着变。 -->
    <div class="rec-group" v-if="config.audio">
      <div class="rec-field">
        <span>{{ $t('Recording.audio') }}</span>
        <select class="ui-select" v-model="config.audio.deviceId" data-gp :title="$t('Recording.audioDevice')">
          <option value="">{{ $t('Recording.audioDeviceDefault') }}</option>
          <option v-for="device in audioDevices" :key="device.id" :value="device.id">
            {{ device.name }}{{ device.default ? ' · ' + $t('Recording.audioDeviceCurrent') : '' }}
          </option>
        </select>
        <button class="rec-icon-btn" data-gp :disabled="audioLoading"
          :title="$t('refresh')" @click="loadAudioDevices(true)">
          <AppIcon name="refresh" :size="12" />
        </button>
      </div>

      <p class="rec-hint" v-if="audioError">{{ audioError }}</p>
      <p class="rec-hint" v-else-if="audioLoading">{{ $t('Recording.probing') }}</p>
      <p class="rec-hint" v-else>{{ $t('Recording.audioDeviceHint') }}</p>
    </div>

    <label class="rec-field">
      <span>{{ $t('Recording.engine') }}</span>
      <select class="ui-select" v-model="config.encoderId">
        <option v-for="enc in encoderOptions" :key="enc.id" :value="enc.id" :disabled="!enc.available">
          {{ enc.label }}{{ enc.available ? '' : ' · ' + $t('Recording.engineUnavailable') }}
        </option>
      </select>
    </label>

    <label class="rec-field">
      <span>{{ $t('Recording.resolution') }}</span>
      <select class="ui-select" :value="resolutionValue" @change="onResolutionChange">
        <option value="0x0">{{ $t('Recording.resolutionSource') }}</option>
        <option value="1920x1080">1920 × 1080</option>
        <option value="2560x1440">2560 × 1440</option>
        <option value="3840x2160">3840 × 2160</option>
      </select>
    </label>

    <label class="rec-field">
      <span>{{ $t('Recording.fps') }}</span>
      <select class="ui-select" v-model.number="config.fps">
        <option :value="30">30 fps</option>
        <option :value="60">60 fps</option>
        <option :value="120">120 fps</option>
      </select>
    </label>

    <div class="rec-group">
      <div class="rec-field">
        <span>{{ $t('Recording.rateControl') }}</span>
        <div class="ui-seg">
          <button :class="{ on: config.mode !== 'bitrate' }" @click="config.mode = 'quality'">
            {{ $t('Recording.modeQuality') }}
          </button>
          <button :class="{ on: config.mode === 'bitrate' }" @click="config.mode = 'bitrate'">
            {{ $t('Recording.modeBitrate') }}
          </button>
        </div>
      </div>
      <p class="rec-hint">{{ $t('Recording.rateControlHint') }}</p>
    </div>

    <div class="rec-group" v-if="config.mode !== 'bitrate'">
      <div class="rec-field">
        <span>{{ $t('Recording.quality') }}</span>
        <div class="rec-slider">
          <input class="ui-range" type="range" min="0" max="51" step="1" v-model.number="config.quality">
          <span class="rec-badge">{{ qualityLabel }}</span>
        </div>
      </div>
      <p class="rec-hint">{{ $t('Recording.qualityHint') }}</p>
    </div>

    <div class="rec-group" v-else>
      <div class="rec-field">
        <span>{{ $t('Recording.bitrate') }}</span>
        <div class="rec-slider">
          <input class="ui-input mono" type="number" min="1" max="200" v-model.number="bitrateMbps">
          <span class="rec-badge">Mbps</span>
        </div>
      </div>
      <p class="rec-hint">{{ $t('Recording.bitrateHint') }}</p>
    </div>

    <div class="rec-group">
      <div class="rec-field">
        <span>{{ $t('Recording.preset') }}</span>
        <div class="ui-seg">
          <button :class="{ on: config.preset === 'speed' }" @click="config.preset = 'speed'">
            {{ $t('Recording.presetSpeed') }}
          </button>
          <button :class="{ on: config.preset === 'balanced' }" @click="config.preset = 'balanced'">
            {{ $t('Recording.presetBalanced') }}
          </button>
          <button :class="{ on: config.preset === 'quality' }" @click="config.preset = 'quality'">
            {{ $t('Recording.presetQuality') }}
          </button>
        </div>
      </div>
      <p class="rec-hint">{{ $t('Recording.presetHint') }}</p>
    </div>

    <div class="rec-group">
      <div class="rec-field">
        <span>{{ $t('Recording.profile') }}</span>
        <div class="ui-seg">
          <button :class="{ on: config.profile !== 'high' }" @click="config.profile = 'main'">main</button>
          <button :class="{ on: config.profile === 'high' }" @click="config.profile = 'high'">high</button>
        </div>
      </div>
      <p class="rec-hint">{{ $t('Recording.profileHint') }}</p>
    </div>

    <div class="rec-group">
      <div class="rec-field">
        <span>{{ $t('Recording.bufferSeconds') }}</span>
        <select class="ui-select" v-model.number="config.bufferSeconds">
          <option :value="10">10 s</option>
          <option :value="20">20 s</option>
          <option :value="30">30 s</option>
          <option :value="60">60 s</option>
          <option :value="120">120 s</option>
        </select>
      </div>
      <p class="rec-hint">{{ $t('Recording.bufferHint') }}</p>
    </div>

    <!-- 实时缓冲状态：只要进程在跑就亮绿点，ready 只影响显示内容 ——
         「已经在录但还没攒够第一段」和「根本没启动」是两件事 -->
    <div class="rec-status" :class="{ live: state.active }">
      <span class="rec-dot"></span>
      <span v-if="!state.active">{{ $t('Recording.stateIdle') }}</span>
      <span v-else-if="!state.ready">{{ $t('Recording.stateStarting') }}</span>
      <span v-else>
        {{ $t('Recording.stateBuffered', { sec: state.duration.toFixed(1), total: state.targetSeconds }) }}
      </span>
      <span class="rec-status-meta" v-if="state.active && state.bytes > 0">
        {{ (state.bytes / 1024 / 1024).toFixed(0) }} MB
      </span>
    </div>

    <!-- 实时过载：录制中编码跟不上，正在丢帧 -->
    <div class="rec-result warn" v-if="overloadText">{{ overloadText }}</div>

    <div class="rec-actions">
      <span class="rec-last-test" v-if="lastTestText">{{ lastTestText }}</span>
      <button class="ui-btn" :disabled="testing || engineBroken" @click="runSelfTest">
        <AppIcon name="wave" :size="13" />
        {{ testing ? $t('Recording.testing') : $t('Recording.test') }}
      </button>
    </div>

    <!-- 引擎整个不可用时（内置 ffmpeg 缺失 / 被杀软隔离）直接说清楚 -->
    <div class="rec-result bad" v-if="engineBroken">
      {{ $t('Recording.engineMissing', { reason: capabilities.error }) }}
    </div>

    <div class="rec-result" v-if="testResult" :class="testResult.tone">
      {{ testResult.text }}
    </div>
  </div>
</template>

<script>
import AppIcon from '@/components/AppIcon.vue';

const DEFAULTS = {
  enabled: false,
  encoderId: '',
  fps: 60,
  // 速率控制：quality = 固定质量值（OBS 的 ICQ/CQ），bitrate = 固定码率
  mode: 'quality',
  quality: 23,
  bitrate: 12000000,
  // 编码器细项，对齐 OBS 的编码器设置面板
  preset: 'balanced',
  profile: 'main',
  bf: 0,
  gopSeconds: 1,
  bufferSeconds: 30,
  bufferMaxMB: 2048,
  // 长按触发阈值（毫秒）：截图页那一行下拉设置的实际值，这里只做兜底补齐
  longPressMs: 1000,
  // 默认缩到 1080p：4K 原生在多数机器上刚好卡在过载边缘（实测 4K60 NVENC 只有 1.0x），
  // 而 1080p 用核显 QSV 都有 1.35x 余量 —— 这也正好对齐 OBS 默认的「重缩放输出」
  width: 1920,
  height: 1080,
  cursor: true,
  // 系统声音是必录项（没有开关），deviceId 为空 = 跟随系统默认输出设备
  audio: { deviceId: '', bitrate: 192000 }
};

export default {
  name: 'RecordingSettings',
  components: { AppIcon },
  props: {
    // 配置对象由父组件持有，这里只负责就地修改并通知保存
    config: {
      type: Object,
      required: true
    },
    // 父组件传下来的实时缓冲状态（{ active, ready, duration, bytes, targetSeconds }）
    state: {
      type: Object,
      default: () => ({ active: false, ready: false, duration: 0, targetSeconds: 0, bytes: 0 })
    },
    // 录制来源直接跟随截图配置，由父组件算好 target 和展示文案传进来
    target: {
      type: Object,
      default: null
    },
    sourceLabel: {
      type: String,
      default: ''
    },
    sourceIcon: {
      type: String,
      default: 'monitor'
    }
  },
  emits: ['change'],
  data() {
    return {
      capabilities: null,
      loading: false,
      testing: false,
      testResult: null,
      // 系统声音：可选输出设备列表（WASAPI 渲染端点）
      audioDevices: [],
      audioLoading: false,
      audioError: ''
    };
  },
  computed: {
    encoderOptions() {
      const list = this.capabilities && Array.isArray(this.capabilities.encoders)
        ? this.capabilities.encoders
        : [];
      if (list.length === 0) {
        // 还没探测完时给个占位，避免下拉框是空的
        return [{ id: this.config.encoderId || 'h264_nvenc', label: this.$t('Recording.probing'), available: true }];
      }
      return list;
    },
    resolutionValue() {
      const w = Number(this.config.width) || 0;
      const h = Number(this.config.height) || 0;
      return w > 0 && h > 0 ? `${w}x${h}` : '0x0';
    },
    /** 当前选的编码器，用来拿它家的「质量值」叫法（ICQ / CQ / QP / CRF） */
    currentEncoder() {
      const list = this.capabilities && Array.isArray(this.capabilities.encoders)
        ? this.capabilities.encoders
        : [];
      return list.find((e) => e.id === this.config.encoderId) || null;
    },
    qualityLabel() {
      const term = (this.currentEncoder && this.currentEncoder.qualityTerm) || 'QP';
      return `${term} ${Math.round(Number(this.config.quality) || 0)}`;
    },
    /** 码率用 Mbps 展示，内部还是 bps */
    bitrateMbps: {
      get() {
        return Math.round((Number(this.config.bitrate) || 0) / 1000000);
      },
      set(value) {
        const mbps = Math.max(1, Math.min(200, Math.round(Number(value) || 1)));
        this.config.bitrate = mbps * 1000000;
      }
    },
    /** ffmpeg 整个跑不起来（缺失/被杀软隔离），此时所有配置都没意义 */
    engineBroken() {
      return !!(this.capabilities && this.capabilities.error);
    },
    /** 实时过载提示：由父组件把主进程的 summary 结论传进来 */
    overloadText() {
      const state = this.state || {};
      if (!state.overloaded) return '';
      return this.$t('Recording.overloadLive', {
        speed: (Number(state.speed) || 0).toFixed(2),
        dropped: Number(state.dropped) || 0
      });
    },
    /** 「这套设置测过没有 / 测出什么」，直接摆在测试按钮左边，避免用户来回猜 */
    lastTestText() {
      const test = this.config && this.config.lastTest;
      if (!test || !test.at) return this.$t('Recording.lastTestNever');
      if (test.measured === false) return this.$t('Recording.encoderCheckIdle');
      let time = '';
      try {
        time = new Date(test.at).toLocaleString();
      } catch (error) {
        time = '';
      }
      return this.$t('Recording.lastTest', {
        time,
        speed: (Number(test.speed) || 0).toFixed(2),
        dropped: Number(test.dropped) || 0
      });
    }
  },
  watch: {
    // 任何配置改动都通知父组件落盘（父组件自己做防抖）
    config: {
      deep: true,
      handler() {
        this.$emit('change', this.config);
      }
    }
  },
  async mounted() {
    this.applyDefaults();
    await this.probe();
    // 声音必录，设备列表进弹窗就拿 —— 越早越好，选设备时不用等
    this.loadAudioDevices(false);
  },
  methods: {
    /** 补齐缺失字段：老版本配置里没有这些 key，直接用会让 select 空掉 */
    applyDefaults() {
      Object.keys(DEFAULTS).forEach((key) => {
        const fallback = DEFAULTS[key];
        const current = this.config[key];
        if (current === undefined || current === null) {
          // 对象型默认值要展开拷贝，否则多个 recorder 实例会共用同一个引用
          this.$set(this.config, key, fallback && typeof fallback === 'object' ? { ...fallback } : fallback);
        }
      });
      // 老配置里的 audio 可能只有一部分字段
      if (this.config.audio && typeof this.config.audio === 'object') {
        // 上一版有「录制/关闭」开关，现在声音必录，清掉残留字段免得两套语义并存
        if ('enabled' in this.config.audio) delete this.config.audio.enabled;
        Object.keys(DEFAULTS.audio).forEach((key) => {
          if (this.config.audio[key] === undefined || this.config.audio[key] === null) {
            this.$set(this.config.audio, key, DEFAULTS.audio[key]);
          }
        });
      }
    },

    /**
     * 拉取「输出设备」列表。
     *
     * 枚举本身要 1.5 秒左右（PowerShell 启动 + 现场编译 C#），
     * 所以只在展开设置/点刷新时拉，不做轮询 —— 热插拔靠刷新按钮。
     */
    async loadAudioDevices(force) {
      if (!window.electronAPI || !window.electronAPI.getAudioDevices) return;
      this.audioLoading = true;
      this.audioError = '';
      try {
        const result = await window.electronAPI.getAudioDevices({ force: !!force });
        if (result && result.ok) {
          this.audioDevices = result.devices || [];
          // 之前选的设备被拔掉了：退回「跟随系统默认」，避免录不到声音还看不出原因
          const picked = this.config.audio.deviceId;
          if (picked && !this.audioDevices.some((d) => d.id === picked)) {
            this.config.audio.deviceId = '';
          }
        } else {
          this.audioError = (result && result.error) || 'device list failed';
        }
      } catch (error) {
        this.audioError = String(error);
      } finally {
        this.audioLoading = false;
      }
    },
    async probe() {
      if (!window.electronAPI || !window.electronAPI.getRecorderCapabilities) return;
      this.loading = true;
      try {
        const caps = await window.electronAPI.getRecorderCapabilities();
        this.capabilities = caps;
        if (caps && !caps.error) {
          const usable = (caps.encoders || []).filter((e) => e.available);
          // 之前选的引擎在这台机器上不可用（换机器 / 驱动变了）时自动纠正
          const currentOk = usable.some((e) => e.id === this.config.encoderId);
          if (!currentOk && usable.length > 0) {
            const preferred = ['h264_nvenc', 'hevc_nvenc', 'h264_qsv', 'h264_amf', 'libx264'];
            const pick = preferred.map((id) => usable.find((e) => e.id === id)).find(Boolean) || usable[0];
            this.config.encoderId = pick.id;
          }
        }
      } catch (error) {
        this.capabilities = { error: String(error) };
      } finally {
        this.loading = false;
      }
    },
    onResolutionChange(event) {
      const [w, h] = String(event.target.value).split('x').map((v) => Number(v) || 0);
      this.config.width = w;
      this.config.height = h;
    },
    async runSelfTest() {
      if (!window.electronAPI || !window.electronAPI.recorderSelfTest) return;
      this.testing = true;
      this.testResult = null;
      try {
        const result = await window.electronAPI.recorderSelfTest({
          // target 由父组件按截图来源算好传下来
          targetType: this.target ? this.target.type : 'screen',
          windowSourceId: this.target && this.target.hwnd ? this.target.hwnd : '',
          displayIndex: this.target && this.target.displayIndex ? this.target.displayIndex : 0,
          encoderId: this.config.encoderId,
          fps: this.config.fps,
          mode: this.config.mode,
          quality: this.config.quality,
          bitrate: this.config.bitrate,
          preset: this.config.preset,
          profile: this.config.profile,
          bf: this.config.bf,
          gopSeconds: this.config.gopSeconds,
          width: this.config.width,
          height: this.config.height
        });

        if (!result || (result.ok === false && !result.measured && !result.frames)) {
          this.testResult = {
            tone: 'bad',
            text: this.$t('Recording.testFail', { reason: (result && result.error) || 'unknown' })
          };
        } else if (!result.measured) {
          // 采集源「画面有变化才出帧」，桌面完全静止时测不出负载。
          // 这不是失败，但也不能报「可用」—— 如实说明。
          this.testResult = { tone: 'warn', text: this.$t('Recording.testIdle') };
        } else {
          const speed = Number(result.speed) || 0;
          const dropped = Number(result.dropFrames) || 0;
          const size = `${result.testWidth || 0}×${result.testHeight || 0}`;
          const fps = Math.round(Number(this.config.fps) || 0);

          // speed = 编码速度 / 实时速度。小于 1 只说明「连续满帧输入时会略紧」，
          // 不等于过载 —— 采集源是 VFR（画面静止时不出帧），实际录制时很难持续满帧。
          // OBS 也是看实际丢帧数，所以这里以 drop_frames 为准，speed 只作余量参考。
          if (dropped > 3) {
            this.testResult = {
              tone: 'warn',
              text: this.$t('Recording.testOverload', { size, fps, speed: speed.toFixed(2), dropped })
            };
          } else if (speed > 0 && speed < 1) {
            // 不丢帧就能用，只是没余量。4K60 硬编基本都在这个区间。
            this.testResult = {
              tone: 'good',
              text: this.$t('Recording.testTight', { size, fps, speed: speed.toFixed(2), dropped })
            };
          } else {
            this.testResult = {
              tone: 'good',
              text: this.$t('Recording.testOk', {
                size, fps, speed: speed.toFixed(2), dropped,
                margin: Math.max(0, Math.round((speed - 1) * 100))
              })
            };
          }
        }

        // 把「这套设置测过了」记进配置：截图页在开始监听前会读它决定要不要提醒。
        // 硬失败（引擎跑不起来 / 一帧没出）不记录，免得把「没测过」伪装成「测过」。
        if (result && (result.ok || result.measured)) {
          this.config.lastTest = {
            at: Date.now(),
            measured: !!result.measured,
            ok: !!result.ok,
            speed: Number(result.speed) || 0,
            dropped: Number(result.dropFrames) || 0,
            encoderId: this.config.encoderId,
            fps: this.config.fps,
            width: this.config.width,
            height: this.config.height
          };
        }
      } catch (error) {
        this.testResult = { tone: 'bad', text: String(error) };
      } finally {
        this.testing = false;
      }
    }
  }
};
</script>

<style scoped>
.rec-body {
  display: flex;
  flex-direction: column;
  /* 8px 而不是 10px：多一行「系统声音」后弹窗刚好卡在滚动边缘，
     每个间距省 2px，整块能少 20 多像素，768p 上也不会出滚动条 */
  gap: 8px;
  min-height: 0;
}

.rec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
}

/* 一行配置 + 一行说明，说明缩进到和控件左边缘对齐 */
.rec-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rec-hint {
  margin: 0;
  padding-left: 108px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ink-3);
}

/* 来源只读展示：跟截图配置联动，样式上做成「值」而不是「控件」 */
.rec-source {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px dashed var(--line-strong);
  background: var(--surface-2, rgba(255, 255, 255, 0.03));
  font-size: 12px;
  color: var(--ink-2);
  min-width: 0;
}

.rec-source .app-icon {
  color: var(--ink-3);
  flex: 0 0 auto;
}

.rec-source-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-2);
}

.rec-label .app-icon {
  color: var(--ink-3);
}

.rec-field {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.rec-field > span {
  flex: 0 0 auto;
  width: 96px;
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.rec-field .ui-input,
.rec-field .ui-select {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  height: 32px;
  font-size: 12px;
}

.rec-slider {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
}

/* 音频设备行右侧的刷新按钮：固定 32×32，和 select 同高 */
.rec-icon-btn {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  border: 1px solid var(--line-strong);
  background: var(--surface-2, rgba(255, 255, 255, 0.03));
  color: var(--ink-2);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.rec-icon-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent-line);
}

.rec-icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.rec-slider .ui-range {
  flex: 1 1 auto;
  width: auto;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 99px;
  background: var(--line-strong);
  outline: none;
  cursor: pointer;
}

.rec-slider .ui-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.rec-badge {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: 5px;
  padding: 2px 6px;
  min-width: 52px;
  text-align: center;
  flex: 0 0 auto;
}

/* 实时缓冲状态：未启动是灰的，缓冲中就亮绿灯 */
.rec-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-2, rgba(255, 255, 255, 0.03));
  font-size: 11px;
  color: var(--ink-3);
}

.rec-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-3);
  flex: 0 0 auto;
}

.rec-status.live {
  border-color: var(--accent-line);
  color: var(--ink-2);
}

.rec-status.live .rec-dot {
  background: var(--ok, #4ade80);
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.16);
}

.rec-status-meta {
  margin-left: auto;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink-3);
}

.rec-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

/* 上次测试结论：贴着测试按钮左侧，长文案省略而不是换行挤压按钮 */
.rec-last-test {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 10px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-result {
  font-size: 11px;
  line-height: 1.6;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid var(--line);
  color: var(--ink-2);
}

.rec-result.good {
  border-color: rgba(74, 222, 128, 0.34);
  background: rgba(74, 222, 128, 0.08);
}

.rec-result.warn {
  border-color: rgba(243, 186, 74, 0.34);
  background: rgba(243, 186, 74, 0.08);
}

.rec-result.bad {
  border-color: rgba(239, 108, 108, 0.34);
  background: rgba(239, 108, 108, 0.08);
}

@media (max-width: 720px) {
  .rec-field {
    flex-wrap: wrap;
  }

  .rec-field > span {
    width: 100%;
  }
}
</style>
