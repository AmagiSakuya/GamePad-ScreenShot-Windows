<template>
  <div class="page">
    <!-- ===== 页头 ===== -->
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ $t('screenshotSettings') }}</h1>
        <p class="page-sub">
          <span class="dot" :class="{ off: !deviceConnected }"></span>
          {{ deviceLabel }}
        </p>
      </div>
      <div class="head-actions">
        <span v-if="listening" class="ui-hint">{{ $t('ui.lockedHint') }}</span>
        <button class="ui-btn sm" :disabled="refreshingDevices" :title="$t('refresh')" @click="refreshDevices">
          <AppIcon name="refresh" :size="12" />{{ $t('refresh') }}
        </button>
      </div>
    </div>

    <div v-if="errorMessage" ref="errorAlert" class="ui-alert" role="alert">
      <AppIcon name="alert" :size="14" />
      <span>{{ errorMessage }}</span>
    </div>

    <!-- ===== 状态 hero ===== -->
    <section class="hero" :class="{ live: listening }">
      <div class="hero-main">
        <div class="hero-left">
          <div class="hero-tag">
            <span class="hero-dot"></span>
            {{ listening ? $t('ui.listeningTag') : $t('ui.readyTag') }}
          </div>
          <h2 class="hero-title">{{ listening ? $t('listening') : $t('ui.ready') }}</h2>
          <div class="hero-combo">
            <template v-for="(key, index) in config.comboKeys" :key="index">
              <span v-if="index > 0" class="hero-plus">+</span>
              <span class="hero-key">{{ comboKeyLabel(key) }}</span>
            </template>
            <span v-if="!config.comboKeys.length" class="hero-key empty">{{ $t('ui.noCombo') }}</span>
          </div>
        </div>

        <div class="hero-actions">
          <button class="ui-btn ghost" :disabled="!config.path" @click="openScreenShotFolder">
            <AppIcon name="folder" :size="15" />
            {{ $t('openScreenshotFolder') }}
          </button>
          <button v-if="!listening" class="hero-cta start" @click="startListen">
            <AppIcon name="play" :size="15" />
            {{ $t('start') }}
          </button>
          <button v-else class="hero-cta stop" @click="stopListen">
            <AppIcon name="stop" :size="15" />
            {{ $t('stop') }}
          </button>
        </div>
      </div>

      <div class="hero-meta">
        <span>{{ $t('captureTarget') }}<b>{{ targetSummary }}</b></span>
        <span>{{ $t('savePath') }}<b class="ellipsis">{{ config.path || $t('ui.notSet') }}</b></span>
        <span>{{ $t('savingMode') }}<b>{{ $t('saveWay.' + config.screenShotSaveWay) }}</b></span>
        <span>{{ $t('imageFormat') }}<b>{{ (config.imageFormat || 'jpg').toUpperCase() }}</b></span>
      </div>
    </section>

    <!-- ===== 配置卡片 ===== -->
    <div class="cards" :class="{ 'is-locked': listening }">
      <!-- 截图来源 -->
      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico"><AppIcon name="camera" :size="13" /></div>
            <span class="ui-card-title">{{ $t('screenshotSource') }}</span>
          </div>
          <span class="ui-badge">{{ screenshotWayLabel }}</span>
        </div>
        <div class="ui-rows">
          <div class="ui-row">
            <span class="ui-label"><AppIcon name="sliders" :size="13" />{{ $t('ui.captureMethod') }}</span>
            <div class="ui-ctl">
              <select class="ui-select" v-model="config.screenshotWay" style="min-width:158px">
                <option v-for="(value, index) in screenShotWayEnum" :key="index" :value="value">
                  {{ value === screenShotWayEnum.OBS ? 'OBS' : $t('ui.desktopCapture') }}
                </option>
              </select>
            </div>
          </div>

          <div class="ui-row" v-if="config.screenshotWay == screenShotWayEnum.DesktopCapturer">
            <span class="ui-label"><AppIcon name="target" :size="13" />{{ $t('captureTarget') }}</span>
            <div class="ui-ctl">
              <div class="ui-seg">
                <button :class="{ on: config.captureTargetType === captureTargetTypeEnum.Screen }"
                  @click="config.captureTargetType = captureTargetTypeEnum.Screen">{{ $t('captureTargetScreen') }}</button>
                <button :class="{ on: config.captureTargetType === captureTargetTypeEnum.Window }"
                  @click="config.captureTargetType = captureTargetTypeEnum.Window">{{ $t('captureTargetWindow') }}</button>
              </div>
            </div>
          </div>

          <div class="ui-row"
            v-if="config.screenshotWay == screenShotWayEnum.DesktopCapturer && config.captureTargetType === captureTargetTypeEnum.Screen">
            <span class="ui-label"><AppIcon name="monitor" :size="13" />{{ $t('screenToCapture') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <select class="ui-select" v-model="config.screenSourceId" @focus="loadScreenSources" style="min-width:176px">
                <option v-for="(source, index) in screenSources" :key="source.id" :value="source.id">
                  {{ screenSourceLabel(index) }}
                </option>
              </select>
            </div>
          </div>

          <div class="ui-row"
            v-if="config.screenshotWay == screenShotWayEnum.DesktopCapturer && config.captureTargetType === captureTargetTypeEnum.Window">
            <span class="ui-label"><AppIcon name="appWindow" :size="13" />{{ $t('windowToCapture') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <select class="ui-select" v-model="config.windowSourceId" @focus="loadCaptureWindows" style="min-width:150px;max-width:100%">
                <option v-for="source in captureWindows" :key="source.id" :value="source.id">
                  {{ windowSourceLabel(source) }}
                </option>
              </select>
              <button class="ui-btn sm" @click="loadCaptureWindows" :title="$t('refresh')">
                <AppIcon name="refresh" :size="13" />
              </button>
            </div>
          </div>

          <!-- 截图方式为 OBS 时才在「截图来源」内展开 OBS 连接设置 -->
          <div class="obs-inline" v-if="config.screenshotWay == screenShotWayEnum.OBS">
            <div class="obs-inline-head">
              <span class="ui-label"><AppIcon name="link" :size="13" />{{ $t('obsConnect') }}</span>
              <div class="obs-head-right">
                <span class="ui-hint" :title="$t('OBSPage.replayBufferHint')">{{ $t('OBSPage.saveReplayBufferOnLongPress') }}</span>
                <button class="ui-switch" :class="{ on: config.obsReplayBufferOnLongPress }"
                  @click="config.obsReplayBufferOnLongPress = !config.obsReplayBufferOnLongPress"></button>
                <span class="ui-badge" :class="{ on: obsConnected }">
                  {{ obsConnected ? $t('OBSPage.obsStatusConnected') : $t('OBSPage.obsStatusDisconnected') }}
                </span>
              </div>
            </div>
            <OBSConnectPage ref="obsConnectPageRef" :windowsNotify="windowsNotify" />
          </div>
        </div>
      </div>

      <!-- 保存方式 -->
      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico violet"><AppIcon name="save" :size="13" /></div>
            <span class="ui-card-title">{{ $t('ui.sectionSave') }}</span>
          </div>
          <span class="ui-badge">{{ (config.imageFormat || 'jpg').toUpperCase() }}</span>
        </div>
        <div class="ui-rows">
          <div class="ui-row">
            <span class="ui-label"><AppIcon name="list" :size="13" />{{ $t('savingMode') }}</span>
            <div class="ui-ctl">
              <div class="ui-seg">
                <button :class="{ on: config.screenShotSaveWay === screenShotSaveWayEnum.FileOnly }"
                  @click="config.screenShotSaveWay = screenShotSaveWayEnum.FileOnly">{{ $t('saveWay.file') }}</button>
                <button :class="{ on: config.screenShotSaveWay === screenShotSaveWayEnum.CilpboardOnly }"
                  @click="config.screenShotSaveWay = screenShotSaveWayEnum.CilpboardOnly">{{ $t('saveWay.clipboard') }}</button>
                <button :class="{ on: config.screenShotSaveWay === screenShotSaveWayEnum.FileAndCilpboard }"
                  @click="config.screenShotSaveWay = screenShotSaveWayEnum.FileAndCilpboard">{{ $t('saveWay.fileAndClipboard') }}</button>
              </div>
            </div>
          </div>

          <div class="ui-row" v-if="config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly">
            <span class="ui-label"><AppIcon name="folder" :size="13" />{{ $t('savePath') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <input class="ui-input" type="text" :placeholder="$t('selectFolderPath')" v-model="config.path">
              <button class="ui-btn sm" @click="chooseFolder">{{ $t('select') }}</button>
            </div>
          </div>

          <div class="ui-row" v-if="config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly">
            <span class="ui-label"><AppIcon name="appWindow" :size="13" />{{ $t('saveByActiveWinTitle') }}</span>
            <div class="ui-ctl">
              <button class="ui-switch" :class="{ on: config.saveByActiveWinTitle }"
                @click="config.saveByActiveWinTitle = !config.saveByActiveWinTitle"></button>
            </div>
          </div>

          <div class="ui-row" v-if="config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly">
            <span class="ui-label"><AppIcon name="fileText" :size="13" />{{ $t('saveFileName') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <input ref="fileNameInput" class="ui-input mono" type="text" placeholder="Screenshot_%datetime%" v-model="config.fileNameTemplate">
              <div class="ui-seg">
                <button v-for="fmt in saveImageFormateOptions" :key="fmt"
                  :class="{ on: config.imageFormat === fmt }" @click="config.imageFormat = fmt">{{ fmt.toUpperCase() }}</button>
              </div>
            </div>
          </div>

          <div class="ui-row" v-if="config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly">
            <span class="ui-label">{{ $t('fileNamePreview') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end;min-width:0">
              <span class="ui-hint mono ellipsis" style="max-width:100%" :title="previewFileName">
                {{ previewFileName }}
              </span>
            </div>
          </div>

          <!-- 可用字段：完整展示（自动换行），点击可直接插入到文件名模板 -->
          <div class="field-block" v-if="config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly">
            <div class="field-block-head">
              <span class="ui-hint">{{ $t('availableFields') }}</span>
              <span class="ui-hint">{{ $t('ui.fieldClickHint') }}</span>
            </div>
            <div class="field-chips">
              <button v-for="field in availableFields" :key="field" class="ui-chip field-chip"
                :title="'%' + field + '%'" @mousedown.prevent @click="insertFileNameField(field)">%{{ field }}%</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 触发方式 -->
      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico cyan"><AppIcon name="gamepad" :size="13" /></div>
            <span class="ui-card-title">{{ $t('controller') }} · {{ $t('keyCombo') }}</span>
          </div>
          <button class="ui-btn sm" @click="addCombo">
            <AppIcon name="plus" :size="12" />{{ $t('addKey') }}
          </button>
        </div>
        <div class="ui-rows">
          <div class="ui-row">
            <span class="ui-label"><AppIcon name="gamepad" :size="13" />{{ $t('controller') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <select class="ui-select" v-model="currentGamePad" @change="onUserSelectedDeviceChange"
                style="min-width:180px;max-width:100%">
                <option v-for="(value, index) in loadedGamePads" :key="index" :value="value">{{ value.name }}</option>
              </select>
            </div>
          </div>

          <div class="combo-list" v-if="config.comboKeys.length">
            <div class="combo-row" v-for="(key, index) in config.comboKeys" :key="index">
              <span class="combo-index">{{ index + 1 }}</span>
              <select class="ui-select combo-select" v-model="config.comboKeys[index]">
                <option v-for="(opt, i) in comboKeyOptions" :key="i" :value="opt.value">{{ opt.label }}</option>
              </select>
              <button class="ui-btn sm" :class="{ primary: detectionIndex === index }"
                @click="automatedDetection(index)">
                {{ detectionIndex == -1 ? $t('recognize') : detectionIndex == index ? $t('recognizing') : $t('unavailable') }}
              </button>
              <button class="ui-btn sm icon-only danger" @click="removeCombo(index)" :title="$t('delete')">
                <AppIcon name="trash" :size="12" />
              </button>
            </div>
          </div>
          <div v-else class="combo-empty">{{ $t('ui.noCombo') }}</div>

          <div class="ui-row">
            <span class="ui-label"><AppIcon name="keyboard" :size="13" />{{ $t('keyboardTrigger') }}</span>
            <div class="ui-ctl">
              <span class="ui-chip muted" v-if="config.keyboardTrigger">{{ computedKeyCodeLabel() }}</span>
              <button v-if="config.keyboardTrigger" class="ui-btn sm"
                :class="{ primary: detectiontingKeyboard }" @click="detectiontingKeyboard = !detectiontingKeyboard">
                {{ detectiontingKeyboard ? $t('recognizing') : $t('recognize') }}
              </button>
              <button class="ui-switch" :class="{ on: config.keyboardTrigger }"
                @click="config.keyboardTrigger = !config.keyboardTrigger"></button>
            </div>
          </div>
        </div>
      </div>

      <!-- 音效 -->
      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico warn"><AppIcon name="volume" :size="13" /></div>
            <span class="ui-card-title">{{ $t('audio') }}</span>
          </div>
          <span class="ui-badge">{{ $t('screenshotSound.' + config.sound) }}</span>
        </div>
        <div class="ui-rows">
          <div class="ui-row">
            <span class="ui-label"><AppIcon name="volume" :size="13" />{{ $t('audio') }}</span>
            <div class="ui-ctl">
              <select class="ui-select" v-model="config.sound" style="min-width:168px">
                <option v-for="(value, index) in screenshotSoundEnum" :key="index" :value="value">
                  {{ $t(`screenshotSound.${value}`) }}
                </option>
              </select>
            </div>
          </div>

          <div class="ui-row" v-if="config.sound != screenshotSoundEnum.None">
            <span class="ui-label"><AppIcon name="wave" :size="13" />{{ $t('volume') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <input class="ui-range" type="range" min="0" max="5" step="0.1" v-model.number="config.soundPower">
              <span class="range-val">{{ Math.round(config.soundPower * 100) }}%</span>
              <button class="ui-btn sm" @click="playCaptureSound">{{ $t('ui.testSound') }}</button>
            </div>
          </div>

          <div class="ui-row">
            <span class="ui-label"><AppIcon name="bell" :size="13" />{{ $t('SystemSettingsPage.overlayNotify') }}</span>
            <div class="ui-ctl">
              <span class="ui-hint">{{ $t('ui.notifyHintDesc') }}</span>
              <button class="ui-btn sm" @click="$emit('navigate', 'settings')">
                <AppIcon name="chevronRight" :size="12" />{{ $t('systemSettings') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const { screenshotSoundEnum, ScreenShotWayEnum, ScreenShotSaveWayEnum, CaptureTargetTypeEnum } = require('@/lib/enum')
const { KeyCode } = require('@/lib/keycode')
import { Howl } from 'howler'
import ns2SoundSrc from '@/assets/ns2截图音.mp3'
import psSoundSrc from '@/assets/PS通知.mp3'
import OBSConnectPage from '@/components/OBSConnectPage.vue'
import AppIcon from '@/components/AppIcon.vue'

let timer;
let active_info_getter_timer;
let lastButtonsValue;
let lastAxesValue;
let activeWinInfoResult;
let autoListenResolutionKey = 'autoListenResolution';
let errorFlashTimer;

export default {
  name: 'MainPage',
  components: { OBSConnectPage, AppIcon },
  props: {
    windowsNotify: {
      type: Function,
      default: null
    }
  },
  emits: ['navigate'],
  data() {
    return {
      controllerConfig: [],
      config: {
        path: '',
        comboKeys: [],
        sound: screenshotSoundEnum.NS2,
        soundPower: 1,
        screenshotWay: ScreenShotWayEnum.DesktopCapturer,
        captureTargetType: CaptureTargetTypeEnum.Screen,
        screenSourceId: '',
        windowSourceId: '',
        screenShotSaveWay: ScreenShotSaveWayEnum.FileOnly,
        imageFormat: 'jpg',
        fileNameTemplate: 'Screenshot_%timestamp%',
        saveByActiveWinTitle: false,
        keyboardTrigger: false,
        keyboardTriggerKeyCode: null,
        obsReplayBufferOnLongPress: false
      },
      screenshotSoundEnum: screenshotSoundEnum,
      screenShotWayEnum: ScreenShotWayEnum,
      screenShotSaveWayEnum: ScreenShotSaveWayEnum,
      captureTargetTypeEnum: CaptureTargetTypeEnum,
      screenSources: [],
      captureWindows: [],
      listening: false,
      loadedGamePads: [],
      currentGamePad: {},
      // 设备列表刷新的序号：只有最后一次请求的结果会被采用，避免并发刷新时状态来回跳
      gamePadListSeq: 0,
      refreshingDevices: false,
      buttonsValuePreview: new Array(20).fill(false),
      axesValuePreview: [],
      screenShoting: false,
      detectionIndex: -1,
      detectiontingKeyboard: false,
      saveImageFormateOptions: ['jpg', 'png'],
      availableFields: ['activeWinTitle', 'activeWinOwner', 'timestamp', 'datetime', 'YYYY', 'MM', 'DD', 'hh', 'mm', 'ss', 'cs', 'ms'],
      formatPreviewTicker: 0,
      errorMessage: '',
      comboKeyOptions: [],
      comboPressedAt: 0,
      comboLongPressHandled: false,
      physicalButtonCount: 0,
      hatCount: 0,
      obsConnected: false
    }
  },
  computed: {
    deviceLabel() {
      if (this.deviceConnected) {
        return this.currentGamePad.name
      }
      return this.$t('ui.noGamepad')
    },
    /** 当前选中的手柄是否真的还插在电脑上（不能只看对象是否存在） */
    deviceConnected() {
      if (!this.currentGamePad || !this.currentGamePad.name) return false
      return (this.loadedGamePads || []).some(device => this.isSameDevice(device, this.currentGamePad))
    },
    screenshotWayLabel() {
      return this.config.screenshotWay === ScreenShotWayEnum.OBS ? 'OBS' : this.$t('ui.desktopCapture')
    },
    targetSummary() {
      if (this.config.screenshotWay === ScreenShotWayEnum.OBS) {
        return 'OBS'
      }
      if (this.config.captureTargetType === CaptureTargetTypeEnum.Window) {
        const win = this.captureWindows.find(w => String(w.id) === String(this.config.windowSourceId))
        return win ? this.windowSourceLabel(win) : this.$t('captureTargetWindow')
      }
      const index = this.screenSources.findIndex(s => s.id === this.config.screenSourceId)
      return index >= 0 ? this.$t('screenToCaptureOption', { number: index + 1 }) : this.$t('captureTargetScreen')
    },
    previewFileName() {
      // formatPreviewTicker 仅用于触发刷新（时间类字段会随时间变化）
      const ticker = this.formatPreviewTicker
      const name = this.formatFileName(this.config.fileNameTemplate, ticker)
      return name ? `${name}.${this.config.imageFormat}` : ''
    }
  },
  async mounted() {
    await window.electronAPI.onDeviceChanged(this.onSDL2DeviceChanged, 'main');
    await window.electronAPI.onScreenshotKeyboardTriggered(this.onScreenshotKeyboardTriggeredCallback);
    await window.electronAPI.offOpenFolderTriggered();
    await window.electronAPI.onOpenFolderTriggered(this.openScreenShotFolder);
    await this.loadScreenSources();
    await this.loadCaptureWindows();

    // 添加托盘监听事件
    window.electronAPI.onStartListenFromTray(this.onStartListenFromTray);
    window.electronAPI.onStopListenFromTray(this.onStopListenFromTray);

    await this.tryStartListen('appStart');

    timer = setInterval(this.handleScreenShotTrigger, 60);

    active_info_getter_timer = setInterval(async () => {
      if (!this.config.fileNameTemplate.includes('%activeWinTitle%') && !this.config.fileNameTemplate.includes('%activeWinOwner%')) {
        return;
      }
      activeWinInfoResult = await window.electronAPI.getActiveWindowsInfo();
      if (this.formatPreviewTicker > 1) {
        this.formatPreviewTicker--;
      } else {
        this.formatPreviewTicker++;
      }
    }, 3000);

    //按键选项初始化
    this.initComboKeyOptions();
  },
  async   beforeUnmount() {
    if (this.listening) {
      this.stopListen();
    }
    await window.electronAPI.offDeviceChanged('main')
    await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
    clearInterval(timer)
    clearInterval(active_info_getter_timer)
    this.saveCurrentConfig()
  },
  methods: {
    async loadScreenSources() {
      const screenSources = await window.electronAPI.getScreenSources();
      this.screenSources = screenSources;
      if (screenSources.length && !screenSources.some((source) => source.id === this.config.screenSourceId)) {
        this.config.screenSourceId = screenSources[0].id;
      }
    },
    screenSourceLabel(index) {
      return this.$t('screenToCaptureOption', { number: index + 1 });
    },
    async loadCaptureWindows() {
      const windows = await window.electronAPI.getCaptureWindows();
      this.captureWindows = windows;
      if (windows.length && !windows.some((source) => String(source.id) === String(this.config.windowSourceId))) {
        this.config.windowSourceId = windows[0].id;
      }
    },
    windowSourceLabel(source) {
      const ownerName = source.ownerName ? `${source.ownerName} - ` : '';
      return `${ownerName}${source.title}`;
    },
    async takeScreenshot() {
      if (this.screenShoting) return;
      this.screenShoting = true;

      try {
        const m_config = await this.prepareCaptureConfig();
        let filePath;
        if (this.config.screenshotWay == this.screenShotWayEnum.DesktopCapturer) {
          filePath = await window.electronAPI.screenShot(m_config)
        } else if (this.config.screenshotWay == this.screenShotWayEnum.OBS) {
          filePath = await this.$refs.obsConnectPageRef.takeScreenshot(m_config)
        }

        if (filePath == void 0 || filePath == null) {
          return;
        }
        await this.playCaptureSound();
        await this.showCaptureNotification({
          img: filePath,
          title: this.$t('overlayNotify.screenshotSuccess'),
          desc: this.$t('overlayNotify.screenshotSaved')
        });
      } catch (error) {
        console.error('Screenshot failed:', error);
      } finally {
        this.screenShoting = false;
      }
    },
    async prepareCaptureConfig() {
      const config = JSON.parse(JSON.stringify(this.config));
      config.calcedFileName = this.formatFileName(config.fileNameTemplate);
      if (config.saveByActiveWinTitle) {
        activeWinInfoResult = await window.electronAPI.getActiveWindowsInfo();
        const folderName = this.sanitizeToValidFolderName(activeWinInfoResult ? activeWinInfoResult.title : 'UnknownWindow');
        config.path = config.path.replace(/[\\/]$/, '') + '\\' + folderName;
        await window.electronAPI.ensureFolder(config.path);
      }
      return config;
    },
    async playCaptureSound() {
      if (this.config.sound == screenshotSoundEnum.None) return;
      var soundSrc = this.config.sound == screenshotSoundEnum.NS2 ? ns2SoundSrc : psSoundSrc;
      const sound = new Howl({
        src: [soundSrc], volume: this.config.soundPower, onend: function () {
          this.unload();
        }
      });
      sound.play();
    },
    async showCaptureNotification({ img, title, desc, type }) {
      const overlayNotify = await window.electronAPI.getStore('overlayNotify', 'show');
      const overlayNotifyDuration = Number(await window.electronAPI.getStore('overlayNotifyDuration', 2)) || 2;
      if (overlayNotify === 'show') {
        await window.electronAPI.showScreenshotNotification({ img, title, desc, type, duration: overlayNotifyDuration * 1000 });
      }
    },
    async chooseFolder() {
      const folder = await window.electronAPI.selectFolder()
      if (folder) {
        this.config.path = folder
      }
    },
    /**
     * 生成组合键可选列表。
     * 物理按键之后追加十字键（hat）方向，索引与主进程 get-current-buttons-value 保持一致：
     * 索引 = 物理按键数 + hat序号 * 4 + 方向(上/右/下/左)。
     */
    initComboKeyOptions(buttonCount, axisCount) {
      const options = [];
      const physicalCount = buttonCount !== undefined ? buttonCount : this.physicalButtonCount;
      const hatTotal = this.hatCount || 0;
      const hasHats = hatTotal > 0;
      // 有 hat 时只列真实物理按键，避免与十字键索引重叠；未知设备时按 20 个兜底
      const bCount = hasHats ? (physicalCount || 0) : Math.max(physicalCount || 0, 20);
      const dirNames = ['↑', '→', '↓', '←'];

      for (let i = 0; i < bCount; i++) {
        options.push({ label: 'Button ' + i, value: 'Button' + i });
      }

      // 十字键（hat）方向作为虚拟按键
      for (let h = 0; h < hatTotal; h++) {
        for (let d = 0; d < 4; d++) {
          const index = physicalCount + h * 4 + d;
          const label = (hatTotal > 1 ? `十字键${h + 1}` : '十字键') + ' ' + dirNames[d];
          options.push({ label, value: 'Button' + index });
        }
      }

      const aCount = Math.max(axisCount !== undefined ? axisCount : 6, 6);
      for (let i = 0; i < aCount; i++) {
        options.push({ label: 'Axis' + i + ' +', value: 'Axis' + i + '+' });
        options.push({ label: 'Axis' + i + ' -', value: 'Axis' + i + '-' });
      }
      if (this.config && Array.isArray(this.config.comboKeys)) {
        for (const key of this.config.comboKeys) {
          const value = typeof key === 'number' ? 'Button' + key : key;
          if (value && !options.some(o => o.value === value)) {
            options.push({ label: value, value });
          }
        }
      }
      this.comboKeyOptions = options;
    },
    /** 读取当前设备的按键/轴/十字键数量，用于生成准确的组合键选项 */
    async refreshDeviceCapabilities() {
      try {
        const physical = await window.electronAPI.getDeviceInstancePhysicalButtonNumber();
        const hats = await window.electronAPI.getDeviceInstanceHatNumber();
        const axes = await window.electronAPI.getDeviceInstanceAxisNumber();
        this.physicalButtonCount = physical || 0;
        this.hatCount = hats || 0;
        this.initComboKeyOptions(this.physicalButtonCount, axes || 6);
      } catch (e) {
        this.initComboKeyOptions();
      }
    },
    /** 组合键的短标签，用于状态区展示 */
    comboKeyLabel(key) {
      let value = typeof key === 'number' ? 'Button' + key : key;
      if (typeof value !== 'string') return '—';
      if (value.startsWith('Button')) {
        const index = Number(value.replace('Button', ''));
        if (this.hatCount > 0 && index >= this.physicalButtonCount) {
          const rel = index - this.physicalButtonCount;
          const dir = ['↑', '→', '↓', '←'][rel % 4];
          const hat = Math.floor(rel / 4);
          return (this.hatCount > 1 ? `十字${hat + 1}` : '十字') + dir;
        }
        return 'B' + index;
      }
      if (value.startsWith('Axis')) {
        return value.replace('Axis', '轴').replace('+', '＋').replace('-', '－');
      }
      return value;
    },
    addCombo() {
      this.config.comboKeys.push('Button0')
    },
    removeCombo(index) {
      this.config.comboKeys.splice(index, 1)
    },
    async loadGlobalConfig() {
      const savedGlobal = await window.electronAPI.getStore('globalConfig', void 0);
      if (savedGlobal) {
        const globalParsed = JSON.parse(savedGlobal);
        this.config = { ...this.config, ...globalParsed };
      }
      this.config.comboKeys = [];
    },
    async saveCurrentConfig() {
      const globalConfig = { ...this.config };
      delete globalConfig.comboKeys;
      await window.electronAPI.setStore('globalConfig', JSON.stringify(globalConfig));

      if (this.currentGamePad && this.currentGamePad.name) {
        const padConfig = { comboKeys: this.config.comboKeys };
        await window.electronAPI.setStore(this.currentGamePad.name, JSON.stringify(padConfig));
      }
    },
    async loadConfig(deviceName) {
      const savedGlobal = await window.electronAPI.getStore('globalConfig', void 0);
      if (savedGlobal) {
        const globalParsed = JSON.parse(savedGlobal);
        this.config = { ...this.config, ...globalParsed };
      } else {
        this.resetConfig();
      }

      const savedPad = await window.electronAPI.getStore(deviceName, void 0);
      if (savedPad) {
        const padParsed = JSON.parse(savedPad);
        this.config.comboKeys = Array.isArray(padParsed.comboKeys) ? padParsed.comboKeys : [];
      } else {
        this.config.comboKeys = [];
      }

      //#region 升级老配置
      if (Array.isArray(this.config.comboKeys)) {
        this.config.comboKeys = this.config.comboKeys.map(k => typeof k === 'number' ? 'Button' + k : k);
      }

      if (this.config.fileNameTemplate == null || this.config.fileNameTemplate == undefined || this.config.fileNameTemplate.trim() == '') {
        this.config.fileNameTemplate = 'Screenshot_%timestamp%'
      }

      if (this.config.screenShotSaveWay == null || this.config.screenShotSaveWay == undefined || this.config.screenShotSaveWay.trim() == '') {
        this.config.screenShotSaveWay = ScreenShotSaveWayEnum.FileOnly
      }

      if (this.config.imageFormat == null || this.config.imageFormat == undefined || this.config.imageFormat.trim() == '') {
        this.config.imageFormat = 'jpg'
      }

      if (this.config.saveByActiveWinTitle == null || this.config.saveByActiveWinTitle == undefined) {
        this.config.saveByActiveWinTitle = false;
      }

      if (this.config.obsReplayBufferOnLongPress == null || this.config.obsReplayBufferOnLongPress == undefined) {
        this.config.obsReplayBufferOnLongPress = false;
      }

      if (this.config.screenSourceId == null) {
        this.config.screenSourceId = '';
      }

      if (this.config.captureTargetType !== CaptureTargetTypeEnum.Window) {
        this.config.captureTargetType = CaptureTargetTypeEnum.Screen;
      }

      if (this.config.windowSourceId == null) {
        this.config.windowSourceId = '';
      }
      //#endregion
      this.initComboKeyOptions();
    },
    resetConfig() {
      this.config = {
        path: '',
        comboKeys: [],
        sound: screenshotSoundEnum.NS2,
        soundPower: 1,
        screenshotWay: ScreenShotWayEnum.DesktopCapturer,
        captureTargetType: CaptureTargetTypeEnum.Screen,
        screenSourceId: '',
        windowSourceId: '',
        screenShotSaveWay: ScreenShotSaveWayEnum.FileOnly,
        imageFormat: 'jpg',
        fileNameTemplate: 'Screenshot_%timestamp%',
        saveByActiveWinTitle: false,
        keyboardTrigger: false,
        keyboardTriggerKeyCode: null,
        obsReplayBufferOnLongPress: false
      }
    },
    /** 用名称 + VID/PID 判定是否同一支手柄（设备重连后 _index 会变，不能只靠它） */
    deviceIdentity(device) {
      if (!device) return ''
      return [device.name, device.vendor, device.product, device.serial].join('|')
    },
    isSameDevice(a, b) {
      if (!a || !b) return false
      const identityA = this.deviceIdentity(a)
      const identityB = this.deviceIdentity(b)
      if (identityA && identityA === identityB) return true
      return a._index !== undefined && b._index !== undefined && a._index === b._index
    },
    /** 找到当前选中设备在最新设备列表里的对应项（拔掉则返回 undefined） */
    resolveCurrentDevice() {
      const list = this.loadedGamePads || []
      if (!list.length) return undefined
      if (this.currentGamePad && this.currentGamePad.name) {
        const matched = list.find(device => this.isSameDevice(device, this.currentGamePad))
        if (matched) return matched
        return undefined
      }
      return list[0]
    },
    async loadGamePadList() {
      const seq = ++this.gamePadListSeq
      const devices = (await window.electronAPI.getAllGamePad()) || []
      // 期间又发起了新的刷新，丢弃这次的结果，避免状态被旧数据覆盖
      if (seq !== this.gamePadListSeq) return

      this.loadedGamePads = devices

      if (!devices.length) {
        // 手柄全部断开：必须把“已连接”状态清干净，否则页面会一直显示上一次的手柄名和绿灯
        this.currentGamePad = {}
        this.physicalButtonCount = 0
        this.hatCount = 0
        this.buttonsValuePreview = []
        this.axesValuePreview = []
        await this.loadGlobalConfig()
        this.initComboKeyOptions()
        return
      }

      // 保持用户已选中的手柄；只有它不在了才退回第一个
      const previous = this.currentGamePad
      const matched = previous && previous.name
        ? devices.find(device => this.isSameDevice(device, previous))
        : undefined
      const next = matched || devices[0]
      const selectionChanged = !previous || !previous.name || !this.isSameDevice(previous, next)
      this.currentGamePad = next
      // 只是插拔了别的手柄时不要重新读配置，避免冲掉界面上还没保存的修改
      if (selectionChanged) {
        await this.loadConfig(this.currentGamePad.name)
      }
      await this.loadScreenSources()
      this.initComboKeyOptions()
    },
    async refreshDevices() {
      if (this.refreshingDevices) return
      this.refreshingDevices = true
      try {
        await this.loadGamePadList()
      } finally {
        this.refreshingDevices = false
      }
    },
    /** 从其他页面切回截图设置页时调用：重新同步手柄状态，必要时重新绑定设备实例 */
    async onPageShown() {
      await this.loadGamePadList()
      if (!this.listening) return
      const device = this.resolveCurrentDevice()
      if (!device) {
        this.listening = false;
        window.electronAPI.sendListenStatusChanged();
        return
      }
      // 调试页会重新打开/释放设备实例，返回后需要重新绑定监听，否则监听中却收不到按键
      const success = await window.electronAPI.openSdl2Device(device)
      if (!success) {
        this.listening = false;
        this.showError(this.$t('alertMsg.openGamepadFail'))
        window.electronAPI.sendListenStatusChanged();
        return
      }
      await this.refreshDeviceCapabilities()
    },
    // 设置错误提示并把内容区滚回顶部，避免用户停留在下方看不到报错
    showError(message) {
      this.errorMessage = message || '';
      if (!this.errorMessage) return;
      this.$nextTick(() => this.revealError());
    },
    // 找到最近的滚动容器（内容区 .stage）并滚到顶部，同时让提示闪一下
    revealError() {
      const el = this.$refs.errorAlert;
      if (!el) return;
      let scroller = el.parentElement;
      while (scroller && scroller !== document.body) {
        const style = window.getComputedStyle(scroller);
        const scrollable = /(auto|scroll|overlay)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight;
        if (scrollable) break;
        scroller = scroller.parentElement;
      }
      if (scroller && scroller !== document.body) {
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          scroller.scrollTop = 0;
        }
      } else {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      // 重新触发一次高亮动画（连续点击同一错误时也能被注意到）
      el.classList.remove('is-flash');
      void el.offsetWidth;
      el.classList.add('is-flash');
      clearTimeout(errorFlashTimer);
      errorFlashTimer = setTimeout(() => {
        if (el.isConnected) el.classList.remove('is-flash');
      }, 1000);
    },
    async startListen() {
      this.errorMessage = '';
      var m_config = JSON.parse(JSON.stringify(this.config));
      if (m_config.path == "") {
        this.showError(this.$t('alertMsg.emptyPath'))
        return;
      }
      if (m_config.comboKeys.length == 0) {
        this.showError(this.$t('alertMsg.noKeyCombo'))
        return;
      }
      if (this.detectionIndex != -1) {
        this.showError(this.$t('alertMsg.detectionInProgress'))
        return;
      }

      if (this.config.screenshotWay === ScreenShotWayEnum.DesktopCapturer && this.config.captureTargetType === CaptureTargetTypeEnum.Window) {
        await this.loadCaptureWindows();
        if (!this.config.windowSourceId) {
          this.showError(this.$t('alertMsg.captureWindowEmpty'));
          return;
        }
      }

      //尝试连接OBS
      if (this.config.screenshotWay == ScreenShotWayEnum.OBS) {
        const obsPage = this.$refs.obsConnectPageRef
        if (!obsPage) {
          this.showError(this.$t('OBSPage.obsNotConnected'))
          return;
        }
        if (!obsPage.isConnected) {
          await obsPage.connectOBS();
          if (!obsPage.isConnected) {
            this.showError(this.$t('OBSPage.obsNotConnected'))
            return;
          }
        }
      }

      //尝试启动
      let m_device = this.resolveCurrentDevice()
      if (!m_device) {
        this.showError(this.$t('ui.noGamepad'))
        return
      }
      let success = await window.electronAPI.openSdl2Device(m_device)
      if (!success) {
        this.showError(this.$t('alertMsg.openGamepadFail'))
        return;
      }
      await this.refreshDeviceCapabilities();
      this.saveCurrentConfig();
      this.listening = true;

      let listenNotifyPolicy = await window.electronAPI.getStore('listenNotifyPolicy', 'all');
      if (listenNotifyPolicy === 'all' || listenNotifyPolicy === 'start') {
        this.windowsNotify(this.$t('alertMsg.listeningStarted'));
      }
    },
    async onSDL2DeviceChanged() {
      if (this.listening) {
        let listenNotifyPolicy = await window.electronAPI.getStore('listenNotifyPolicy', 'all');
        if (listenNotifyPolicy === 'all' || listenNotifyPolicy === 'stop') {
          this.windowsNotify(this.$t('alertMsg.deviceChangedCancelListening'));
        }

        if (this.detectionIndex != -1) {
          this.detectionIndex = -1;
          await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
        }
        this.listening = false;
        await this.loadGamePadList();
        window.electronAPI.sendListenStatusChanged();
      } else {
        await this.tryStartListen();
      }
    },
    async tryStartListen(from = 'deviceChange') {
      await this.loadGamePadList();
      if (this.loadedGamePads.length > 0) {
        let res = await window.electronAPI.getStore(autoListenResolutionKey, 'never');
        if ((from === 'appStart' && res === 'onAppStart') || (from === 'deviceChange' && res === 'whenDeviceAvailable')) {
          await this.startListen();
        }
      }
    },
    async handleScreenShotTrigger() {
      this.buttonsValuePreview = await window.electronAPI.getCurrentButtonsValue()
      this.axesValuePreview = await window.electronAPI.getCurrentAxesValue()

      // 同步 OBS 连接状态到卡片徽章
      const obsPage = this.$refs.obsConnectPageRef
      if (obsPage) {
        this.obsConnected = !!obsPage.isConnected
      }

      //如果是监听中
      if (this.listening) {
        let flag = true;
        for (let i = 0; i < this.config.comboKeys.length; i++) {
          let m_btn_key = this.config.comboKeys[i];
          if (typeof m_btn_key === 'number') {
            m_btn_key = 'Button' + m_btn_key;
          }
          if (typeof m_btn_key === 'string') {
            if (m_btn_key.startsWith('Button')) {
              let btn_index = Number(m_btn_key.replace('Button', ''));
              if (!this.buttonsValuePreview || !this.buttonsValuePreview[btn_index]) {
                flag = false;
              }
            } else if (m_btn_key.startsWith('Axis')) {
              let match = m_btn_key.match(/^Axis\s*(\d+)\s*([+-])$/i);
              if (match) {
                let axis_index = Number(match[1]);
                let dir = match[2];
                let val = (this.axesValuePreview && this.axesValuePreview[axis_index] !== undefined) ? this.axesValuePreview[axis_index] : 0;
                if (dir === '+' && val < 0.85) {
                  flag = false;
                } else if (dir === '-' && val > -0.85) {
                  flag = false;
                }
              } else {
                flag = false;
              }
            }
          }
        }
        if (flag) {
          this.handleComboPressed();
        } else {
          this.handleComboReleased();
        }
      }

      //如果是识别中
      if (!this.listening && this.detectionIndex != -1) {
        // 检查按键变化（含十字键虚拟按键）
        if (this.buttonsValuePreview && lastButtonsValue) {
          for (let i = 0; i < this.buttonsValuePreview.length; i++) {
            if (this.buttonsValuePreview[i] && !lastButtonsValue[i]) {
              const detectedKey = 'Button' + i;
              this.config.comboKeys[this.detectionIndex] = detectedKey;
              this.initComboKeyOptions();
              this.detectionIndex = -1;
              await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
              return;
            }
          }
        }

        // 检查轴变化 (从非极值状态变成 1 或 -1)
        if (this.axesValuePreview && lastAxesValue) {
          for (let i = 0; i < this.axesValuePreview.length; i++) {
            const curVal = this.axesValuePreview[i] || 0;
            const lastVal = lastAxesValue[i] !== undefined ? lastAxesValue[i] : 0;

            if (curVal >= 0.85 && lastVal < 0.85) {
              const detectedKey = 'Axis' + i + '+';
              this.config.comboKeys[this.detectionIndex] = detectedKey;
              this.initComboKeyOptions();
              this.detectionIndex = -1;
              await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
              return;
            }

            if (curVal <= -0.85 && lastVal > -0.85) {
              const detectedKey = 'Axis' + i + '-';
              this.config.comboKeys[this.detectionIndex] = detectedKey;
              this.initComboKeyOptions();
              this.detectionIndex = -1;
              await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
              return;
            }
          }
        }
      }
    },
    async handleComboPressed() {
      if (!this.comboPressedAt) {
        this.comboPressedAt = Date.now();
        this.comboLongPressHandled = false;
        return;
      }

      const isLongPressReplay = this.config.screenshotWay === ScreenShotWayEnum.OBS &&
        this.config.obsReplayBufferOnLongPress &&
        !this.comboLongPressHandled &&
        Date.now() - this.comboPressedAt >= 1000;
      if (isLongPressReplay) {
        this.comboLongPressHandled = true;
        const obsPage = this.$refs.obsConnectPageRef
        if (!obsPage) return;
        const replayConfig = await this.prepareCaptureConfig();
        const saved = await obsPage.saveReplayBuffer(replayConfig);
        if (saved) {
          await this.playCaptureSound();
          await this.showCaptureNotification({
            title: this.$t('overlayNotify.replayBufferSaved'),
            desc: this.$t('overlayNotify.replayBufferSavedDesc'),
            type: 'text'
          });
        }
      }
    },
    async handleComboReleased() {
      if (!this.comboPressedAt) return;
      const shouldTakeScreenshot = !this.comboLongPressHandled;
      this.comboPressedAt = 0;
      this.comboLongPressHandled = false;
      if (shouldTakeScreenshot) {
        await this.takeScreenshot();
      }
    },
    async stopListen() {
      this.listening = false;
      let listenNotifyPolicy = await window.electronAPI.getStore('listenNotifyPolicy', 'all');
      if (listenNotifyPolicy === 'all' || listenNotifyPolicy === 'stop') {
        this.windowsNotify(this.$t('alertMsg.listeningStopped'));
      }
    },
    async onUserSelectedDeviceChange() {
      if (!this.currentGamePad || !this.currentGamePad.name) {
        await this.loadGamePadList()
        return
      }
      await this.loadConfig(this.currentGamePad.name)
      await this.loadScreenSources()
      // 监听/识别中切换手柄时，设备实例必须跟着切，否则还在读上一支手柄的按键
      if (!this.listening && this.detectionIndex == -1) return
      const device = this.resolveCurrentDevice()
      if (!device) return
      const success = await window.electronAPI.openSdl2Device(device)
      if (!success) {
        this.detectionIndex = -1
        this.listening = false
        this.showError(this.$t('alertMsg.openGamepadFail'))
        window.electronAPI.sendListenStatusChanged()
        return
      }
      await this.refreshDeviceCapabilities()
    },
    async automatedDetection(detectionIndex) {
      if (this.detectionIndex == -1) {
        let m_device = this.resolveCurrentDevice()
        if (!m_device) {
          this.showError(this.$t('ui.noGamepad'))
          return
        }
        let success = await window.electronAPI.openSdl2Device(m_device)
        if (!success) {
          alert(this.$t('alertMsg.openGamepadFail'))
          return;
        }
        // 打开设备后刷新按键/十字键数量，识别到的 hat 方向才能正确命名
        await this.refreshDeviceCapabilities();
        this.detectionIndex = detectionIndex;
        this.buttonsValuePreview = await window.electronAPI.getCurrentButtonsValue();
        this.axesValuePreview = await window.electronAPI.getCurrentAxesValue();
        lastButtonsValue = JSON.parse(JSON.stringify(this.buttonsValuePreview || []));
        lastAxesValue = JSON.parse(JSON.stringify(this.axesValuePreview || []));
        return;
      }
      if (this.detectionIndex == detectionIndex) {
        this.detectionIndex = -1;
        await window.electronAPI.removeSdl2DeviceInstanceAllListeners();
        return;
      }
    },
    insertFileNameField(field) {
      const token = `%${field}%`
      const template = this.config.fileNameTemplate || ''
      const input = this.$refs.fileNameInput
      if (!input) {
        this.config.fileNameTemplate = template + token
        return
      }
      // 输入框没在编辑时直接追加到末尾，正在编辑时插入到光标处
      const editing = document.activeElement === input
      const start = editing && typeof input.selectionStart === 'number' ? input.selectionStart : template.length
      const end = editing && typeof input.selectionEnd === 'number' ? input.selectionEnd : template.length
      this.config.fileNameTemplate = template.slice(0, start) + token + template.slice(end)
      this.$nextTick(() => {
        input.focus()
        const pos = start + token.length
        input.setSelectionRange(pos, pos)
      })
    },
    formatFileName(template, ticker = 0) {
      if (template == null || template == undefined || template.trim() == '') {
        return '';
      }
      const now = new Date();
      const replacements = {
        '%timestamp%': now.getTime(),
        '%datetime%': now.getFullYear() + '_' + String(now.getMonth() + 1).padStart(2, '0') + '_' + String(now.getDate()).padStart(2, '0') + '-' + String(now.getHours()).padStart(2, '0') + '_' + String(now.getMinutes()).padStart(2, '0') + '_' + String(now.getSeconds()).padStart(2, '0'),
        '%YYYY%': now.getFullYear(),
        '%MM%': String(now.getMonth() + 1).padStart(2, '0'),
        '%DD%': String(now.getDate()).padStart(2, '0'),
        '%hh%': String(now.getHours()).padStart(2, '0'),
        '%mm%': String(now.getMinutes()).padStart(2, '0'),
        '%ss%': String(now.getSeconds()).padStart(2, '0'),
        '%cs%': String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0'),
        '%ms%': String(now.getMilliseconds()).padStart(3, '0'),
        '%activeWinTitle%': activeWinInfoResult ? activeWinInfoResult.title : 'UnknownWindow',
        '%activeWinOwner%': activeWinInfoResult ? activeWinInfoResult.owner.name : 'UnknownOwner'
      };
      return template.replace(/%timestamp%|%datetime%|%YYYY%|%MM%|%DD%|%hh%|%mm%|%ss%|%cs%|%ms%|%activeWinTitle%|%activeWinOwner%/g, match => replacements[match] || match);
    },
    async onStartListenFromTray() {
      if (this.listening) return;
      await this.startListen();
      if (this.errorMessage) {
        this.windowsNotify(this.errorMessage);
      }
    },
    async onStopListenFromTray() {
      if (!this.listening) return;
      this.stopListen();
    },
    openScreenShotFolder() {
      window.electronAPI.openFolder(this.config.path);
    },
    sanitizeToValidFolderName(str) {
      if (!str || typeof str !== 'string') return 'untitled_folder';
      return str
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_')
        .replace(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i, '_$1$2')
        .replace(/_+/g, '_')
        .replace(/^[\s_]+|[\s_]+$/g, '')
        .substring(0, 255);
    },
    onScreenshotKeyboardTriggeredCallback(_, event) {
      if (this.detectiontingKeyboard == true) {
        this.config.keyboardTriggerKeyCode = event.keycode;
        this.detectiontingKeyboard = false;
      }
      if (this.config.keyboardTrigger && this.listening && event.keycode == this.config.keyboardTriggerKeyCode) {
        this.takeScreenshot();
      }
    },
    computedKeyCodeLabel() {
      let m_key = this.config.keyboardTriggerKeyCode;
      let keys = Object.keys(KeyCode);
      for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        if (KeyCode[k] == m_key) {
          return k;
        }
      }
      return 'None'
    }
  }
}
</script>

<style scoped>
/* ---------- 报错提示：出现时闪一下，配合自动滚回顶部 ---------- */
.ui-alert.is-flash {
  animation: alertFlash 1s ease;
}

@keyframes alertFlash {
  0% {
    box-shadow: 0 0 0 0 rgba(251, 95, 118, 0.55);
  }

  45% {
    box-shadow: 0 0 0 7px rgba(251, 95, 118, 0);
  }

  60% {
    box-shadow: 0 0 0 0 rgba(251, 95, 118, 0.35);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(251, 95, 118, 0);
  }
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ---------- hero ---------- */
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  padding: 12px 16px 7px;
  margin-bottom: 9px;
  transition: border-color 0.25s ease, background 0.25s ease;
}

.hero.live {
  border-color: var(--accent-line);
  background:
    radial-gradient(520px 200px at 92% 30%, var(--accent-soft), transparent 70%),
    linear-gradient(112deg, var(--violet-soft), rgba(20, 24, 33, 0.0) 48%),
    var(--surface);
}

html.theme-light .hero.live {
  background:
    radial-gradient(520px 200px at 92% 30%, var(--accent-soft), transparent 70%),
    linear-gradient(112deg, var(--violet-soft), rgba(255, 255, 255, 0) 48%),
    var(--surface);
}

.hero::after {
  content: "";
  position: absolute;
  right: -70px;
  top: -80px;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: conic-gradient(from 210deg, var(--accent-soft), var(--cyan-soft), transparent 62%);
  filter: blur(30px);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.hero.live::after {
  opacity: 1;
}

.hero-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: relative;
  z-index: 1;
}

.hero-left {
  min-width: 0;
}

.hero-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--ink-3);
}

.hero.live .hero-tag {
  color: var(--accent);
}

.hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-3);
}

.hero.live .hero-dot {
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
  animation: heroPulse 1.8s ease-in-out infinite;
}

@keyframes heroPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.85); }
}

.hero-title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 5px 0 0;
  line-height: 1.25;
}

.hero-combo {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.hero-key {
  height: 28px;
  min-width: 38px;
  padding: 0 10px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.25);
}

.hero.live .hero-key {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

.hero-key.empty {
  color: var(--ink-3);
  box-shadow: none;
  border-style: dashed;
  font-family: inherit;
  font-size: 11px;
}

.hero-plus {
  color: var(--ink-3);
  font-size: 11px;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.hero-cta {
  height: 40px;
  padding: 0 18px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 650;
  font-family: inherit;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.16s ease;
}

.hero-cta.start {
  background: linear-gradient(180deg, var(--accent-hi), var(--accent));
  color: var(--accent-ink);
  box-shadow: 0 12px 26px -14px var(--accent);
}

.hero-cta.start:hover {
  filter: brightness(1.06);
}

.hero-cta.stop {
  background: rgba(251, 95, 118, 0.14);
  border-color: rgba(251, 95, 118, 0.4);
  color: var(--danger);
}

.hero-cta.stop:hover {
  background: rgba(251, 95, 118, 0.2);
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 7px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
  position: relative;
  z-index: 1;
  overflow: hidden;
}

.hero-meta b {
  color: var(--ink-2);
  font-weight: 600;
  margin-left: 6px;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10.5px;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- cards ---------- */
.cards {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* 行高按内容走：卡片不再被拉到满屏，行间距和卡片内部都不会出现大片空白 */
  grid-template-rows: repeat(2, minmax(148px, auto));
  align-content: start;
  gap: 9px;
  transition: opacity 0.2s ease;
}

.cards .wide {
  grid-column: span 2;
}

.combo-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.combo-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.combo-index {
  width: 16px;
  text-align: center;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink-3);
  flex: 0 0 auto;
}

.combo-select {
  flex: 1;
  min-width: 0;
}

.combo-empty {
  padding: 8px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: 8px;
  font-size: 11px;
  color: var(--ink-3);
  text-align: center;
}

/* 音量滑块 */
.ui-range {
  -webkit-appearance: none;
  appearance: none;
  width: 110px;
  height: 4px;
  border-radius: 99px;
  background: var(--line-strong);
  outline: none;
  cursor: pointer;
  flex: 0 0 auto;
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

.range-val {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10.5px;
  color: var(--ink-2);
  width: 36px;
  text-align: right;
}

/* OBS 内嵌块（仅截图方式为 OBS 时出现在「截图来源」卡片内） */
.obs-inline {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  /* 贴近上方「截图方式」行，避免内容被垂直居中后上下各留一大块空白 */
  justify-content: flex-start;
  gap: 8px;
  padding-top: 9px;
  margin-top: 2px;
  border-top: 1px dashed var(--line-strong);
}

.obs-inline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.obs-head-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
}

.obs-head-right .ui-hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 150px;
}

@media (max-width: 1080px) {
  .cards {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }

  .cards .wide {
    grid-column: span 1;
  }
}

/* 可用字段：完整换行展示，点击插入 */
.field-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 9px;
  margin-top: 2px;
  border-top: 1px dashed var(--line-strong);
}

.field-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.field-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.field-chip {
  height: 22px;
  min-width: 0;
  padding: 0 7px;
  font-size: 9.5px;
  font-weight: 500;
  color: var(--ink-2);
  background: var(--surface-2);
  border-color: var(--line);
  cursor: pointer;
  transition: all 0.14s ease;
}

.field-chip:hover {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-line);
}
</style>
