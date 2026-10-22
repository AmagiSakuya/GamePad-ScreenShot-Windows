<template>
  <!-- data-gp-pause：录制组合键期间暂停手柄界面导航，按键全部交给录制逻辑 -->
  <div class="page" :data-gp-pause="detectionIndex != -1 ? '' : null">
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

    <!-- ===== 状态 hero（与映射页共用同一个横幅组件） ===== -->
    <PageHero
      :live="listening"
      :tag="listening ? $t('ui.listeningTag') : $t('ui.readyTag')"
      :title="listening ? $t('listening') : $t('ui.ready')">
      <template #body>
        <div class="hero-combo">
          <template v-for="(key, index) in config.comboKeys" :key="index">
            <span v-if="index > 0" class="hero-plus">+</span>
            <span class="hero-key">{{ comboKeyLabel(key) }}</span>
          </template>
          <span v-if="!config.comboKeys.length" class="hero-key empty">{{ $t('ui.noCombo') }}</span>
        </div>
      </template>

      <template #actions>
        <button class="ui-btn ghost" :disabled="!config.path" @click="openScreenShotFolder">
          <AppIcon name="folder" :size="15" />
          {{ $t('openScreenshotFolder') }}
        </button>
        <button v-if="!listening" class="hero-cta start" data-gp-autofocus @click="startListen">
          <AppIcon name="play" :size="15" />
          {{ $t('start') }}
        </button>
        <button v-else class="hero-cta stop" data-gp-autofocus @click="stopListen">
          <AppIcon name="stop" :size="15" />
          {{ $t('stop') }}
        </button>
      </template>

      <template #meta>
        <span>{{ $t('captureTarget') }}<b>{{ targetSummary }}</b></span>
        <span>{{ $t('savePath') }}<b>{{ config.path || $t('ui.notSet') }}</b></span>
        <span>{{ $t('savingMode') }}<b>{{ $t('saveWay.' + config.screenShotSaveWay) }}</b></span>
        <span>{{ $t('imageFormat') }}<b>{{ (config.imageFormat || 'jpg').toUpperCase() }}</b></span>
      </template>
    </PageHero>

    <!-- ===== 配置卡片 ===== -->
    <div class="cards" :class="{ 'is-locked': listening }">
      <!-- 截图来源 -->
      <div class="ui-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico"><AppIcon name="camera" :size="13" /></div>
            <span class="ui-card-title">{{ $t('screenshotSource') }}</span>
          </div>
          <span class="ui-badge">{{ captureTypeLabel }}</span>
        </div>
        <div class="ui-rows">
          <div class="ui-row">
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

          <div class="ui-row" v-if="config.captureTargetType === captureTargetTypeEnum.Screen">
            <span class="ui-label"><AppIcon name="monitor" :size="13" />{{ $t('screenToCapture') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <select class="ui-select" v-model="config.screenSourceId" @focus="loadScreenSources" style="min-width:176px">
                <option v-for="(source, index) in screenSources" :key="source.id" :value="source.id">
                  {{ screenSourceLabel(index) }}
                </option>
              </select>
            </div>
          </div>

          <div class="ui-row" v-if="config.captureTargetType === captureTargetTypeEnum.Window">
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

          <!-- 循环录制（回放缓存）：长按截图触发键保存最近 N 秒。
               采集目标直接跟随上面的截图来源，所以这里只有开关、长按阈值和设置入口 -->
          <div class="ui-row">
            <span class="ui-label"><AppIcon name="camera" :size="13" />{{ $t('ui.sectionRecording') }}</span>
            <div class="ui-ctl">
              <div class="ui-seg">
                <button :class="{ on: recordingConfig.enabled }"
                  @click="setRecordingEnabled(true)">{{ $t('Recording.switchOn') }}</button>
                <button :class="{ on: !recordingConfig.enabled }"
                  @click="setRecordingEnabled(false)">{{ $t('Recording.switchOff') }}</button>
              </div>
              <button class="ui-btn sm" data-gp @click="openRecordingDialog">
                <AppIcon name="sliders" :size="12" />{{ $t('Recording.settings') }}
              </button>
            </div>
          </div>

          <p class="rec-tip">{{ $t('Recording.longPressHint') }}</p>

          <!-- 长按阈值：只在开启时出现，关着的时候这一行没有任何意义 -->
          <div class="ui-row" v-if="recordingConfig.enabled">
            <span class="ui-label"><AppIcon name="clock" :size="13" />{{ $t('Recording.longPress') }}</span>
            <div class="ui-ctl" style="flex:1;justify-content:flex-end">
              <input class="ui-range" type="range" min="300" max="3000" step="100"
                v-model.number="recordingConfig.longPressMs" @change="saveRecordingConfig">
              <span class="range-val" style="width:46px">{{ longPressLabel(recordingConfig.longPressMs) }}</span>
            </div>
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

    <!-- 录像设置弹窗：来源跟随截图来源，所以这里只配引擎/分辨率/帧率/缓冲。
         必须留在 .page 内部 —— MainPage 是 v-show 常驻的，多根节点会让 v-show 失效，
         整个页面永远可见，其他页面的手柄导航会被它的元素污染。 -->
    <div class="rec-mask" v-if="showRecordingDialog" @click.self="closeRecordingDialog">
      <div class="rec-dialog" data-gp-scope="overlay">
        <div class="rec-dialog-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico warn"><AppIcon name="camera" :size="13" /></div>
            <span class="ui-card-title">{{ $t('Recording.settings') }}</span>
          </div>
        </div>
        <RecordingSettings :config="recordingConfig" :state="replayState" :target="recordingTarget"
          :source-label="recordingSourceLabel" :source-icon="recordingSourceIcon" @change="onRecordingConfigChange" />
        <!-- 关闭按钮放在 DOM 末尾：手柄进弹窗时第一个焦点应该是配置项，
             而不是这个一按就把窗口关掉的东西 -->
        <button class="ui-btn sm icon-only rec-dialog-close" data-gp :title="$t('Recording.close')"
          @click="closeRecordingDialog">
          <AppIcon name="close" :size="12" />
        </button>
      </div>
    </div>
  </div>
</template>

<script>
const { screenshotSoundEnum, ScreenShotSaveWayEnum, CaptureTargetTypeEnum } = require('@/lib/enum')
const { KeyCode } = require('@/lib/keycode')
import { hasCaptureSound, setCaptureSound, playCaptureSound as playSound } from '@/lib/captureSound'
import { toPlain } from '@/lib/ipcSafe'
import { isPadMode, pickFolder, askConfirm } from '@/lib/gamepadNav'
import RecordingSettings from '@/components/RecordingSettings.vue'
import AppIcon from '@/components/AppIcon.vue'
import PageHero from '@/components/PageHero.vue'

let timer;
let active_info_getter_timer;
let lastButtonsValue;
let lastAxesValue;
let activeWinInfoResult;
let autoListenResolutionKey = 'autoListenResolution';
let errorFlashTimer;

export default {
  name: 'MainPage',
  components: { RecordingSettings, AppIcon, PageHero },
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
        sound: screenshotSoundEnum.Sound1,
        soundPower: 1,
        captureTargetType: CaptureTargetTypeEnum.Screen,
        screenSourceId: '',
        windowSourceId: '',
        screenShotSaveWay: ScreenShotSaveWayEnum.FileOnly,
        imageFormat: 'jpg',
        fileNameTemplate: 'Screenshot_%timestamp%',
        saveByActiveWinTitle: false,
        keyboardTrigger: false,
        keyboardTriggerKeyCode: null
      },
      screenshotSoundEnum: screenshotSoundEnum,
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
      // 内置录像引擎配置（与截图配置分开存，互不影响）
      recordingConfig: {
        enabled: false,
        // 长按多少毫秒触发保存（界面上叫「循环录制长按触发」，300~3000ms）
        longPressMs: 1000,
        encoderId: '',
        fps: 60,
        mode: 'quality',
        quality: 23,
        bitrate: 12000000,
        preset: 'balanced',
        profile: 'main',
        bf: 0,
        gopSeconds: 1,
        bufferSeconds: 30,
        bufferMaxMB: 2048,
        width: 1920,
        height: 1080,
        cursor: true,
        // 系统声音（WASAPI 环回）：必录，没有开关；deviceId 为空 = 跟随系统默认输出
        audio: { deviceId: '', bitrate: 192000 }
      },
      // 回放缓存的实时状态（主进程主动推送）
      replayState: { active: false, ready: false, duration: 0, targetSeconds: 0, bytes: 0 },
      // 录像设置弹窗
      showRecordingDialog: false
    }
  },
  watch: {
    // 音效/音量一改就同步到共享状态，系统设置页的通知预览要立刻用新值
    'config.sound'(value) {
      setCaptureSound(value, this.config.soundPower)
    },
    'config.soundPower'(value) {
      setCaptureSound(this.config.sound, value)
    },
    // 组合键选项里的「十字键 / 轴」是本地化的，切语言后要按新文案重建一次
    '$i18n.locale'() {
      this.refreshDeviceCapabilities()
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
    /** 「截图来源」卡片右上角的徽标：屏幕 / 窗口 */
    captureTypeLabel() {
      return this.config.captureTargetType === CaptureTargetTypeEnum.Window
        ? this.$t('captureTargetWindow')
        : this.$t('captureTargetScreen')
    },
    targetSummary() {
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
    },
    /** 录制目标直接由截图配置推导，不另外存一份 */
    recordingTarget() {
      const isWindow = this.config.captureTargetType === CaptureTargetTypeEnum.Window
      if (isWindow) {
        const hwnd = Number(this.config.windowSourceId)
        return hwnd > 0 ? { type: 'window', hwnd } : { type: 'screen', displayIndex: 0 }
      }
      const index = this.screenSources.findIndex(s => String(s.id) === String(this.config.screenSourceId))
      return { type: 'screen', displayIndex: index >= 0 ? index : 0 }
    },
    recordingSourceLabel() {
      // targetSummary 已经按截图配置算好了显示文案，直接复用
      return this.targetSummary
    },
    recordingSourceIcon() {
      return this.config.captureTargetType === CaptureTargetTypeEnum.Window ? 'appWindow' : 'monitor'
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

    await this.tryStartListen();

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

    // 录像配置与缓冲状态
    await this.loadRecordingConfig();
    // 主动拉一次当前状态：渲染进程重载（或热更新）后缓冲可能还在跑，
    // 只靠推送会一直显示「未启动」直到下一次进度回调
    try {
      const initialState = await window.electronAPI.getReplayState();
      if (initialState && initialState.active) this.replayState = initialState;
    } catch (error) { /* 状态读不到就按未启动显示 */ }
    window.electronAPI.onReplayProgress((state) => {
      if (state && state.buffer) {
        // 过载信息单独带出来：buffer 里只有缓冲时长/字节，没有编码压力
        this.replayState = {
          ...state.buffer,
          overloaded: !!state.overloaded,
          speed: Number(state.speed) || 0,
          dropped: Number(state.dropped) || 0
        };
      }
      this.trackOverload(state);
    });
    window.electronAPI.onReplayExit(() => {
      this.replayState = { active: false, ready: false, duration: 0, targetSeconds: this.replayState.targetSeconds, bytes: 0 };
    });

    // ESC 关录像弹窗（鼠标/键盘用户的主要退出方式）
    this._escHandler = (event) => {
      if (event.key === 'Escape' && this.showRecordingDialog) {
        this.closeRecordingDialog();
      }
    };
    window.addEventListener('keydown', this._escHandler);
  },
  async   beforeUnmount() {
    if (this.listening) {
      this.stopListen();
    }
    await window.electronAPI.offDeviceChanged('main')
    await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
    await window.electronAPI.offReplayProgress()
    await window.electronAPI.offReplayExit()
    if (this._escHandler) window.removeEventListener('keydown', this._escHandler)
    clearInterval(timer)
    clearInterval(active_info_getter_timer)
    this.saveCurrentConfig()
  },
  methods: {
    // ===== 内置录像 =====

    async loadRecordingConfig() {
      try {
        const saved = await window.electronAPI.getRecordingConfig();
        if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
          // 只覆盖已知字段：老版本存下的配置可能缺 key，直接整体替换会让下拉框空掉
          this.recordingConfig = { ...this.recordingConfig, ...saved };
        }
      } catch (error) {
        // 读不到就用默认值，不该影响截图功能
      }
      // 长按阈值必须落在滑条范围内，否则滑条位置会跑偏
      const longPressMs = Number(this.recordingConfig.longPressMs);
      this.recordingConfig.longPressMs = Number.isFinite(longPressMs) && longPressMs > 0
        ? Math.min(3000, Math.max(300, Math.round(longPressMs / 100) * 100))
        : 1000;
    },

    /** 把录像配置落盘（开关和长按阈值这些不需要重启进程的改动走这里） */
    saveRecordingConfig() {
      try {
        window.electronAPI.saveRecordingConfig(JSON.parse(JSON.stringify(this.recordingConfig)));
      } catch (error) { /* 存不下不影响本次会话 */ }
    },

    /** 长按阈值的显示文案：800ms → 0.8 s，1000ms → 1 s */
    longPressLabel(value) {
      const seconds = Number(value) / 1000;
      return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
    },

    // ===== 编码测试门禁 =====

    /**
     * 「当前这套编码设置」到底测过没有。
     *
     *   ok      —— 测过，而且实测出了真实负载，可以直接开监听
     *   missing —— 从来没测过
     *   stale   —— 测过，但之后改过引擎 / 分辨率 / 帧率，结论不再适用
     *   idle    —— 测过，但当时画面是静止的（0 帧），没测出实际负载
     *
     * 判据只看会显著改变负载的三项（引擎、分辨率、帧率）；
     * 画质、码率、缓冲时长这些不影响「会不会过载」，改了不要求重测。
     */
    encoderTestState() {
      const test = this.recordingConfig.lastTest;
      if (!test || !test.at) return 'missing';
      const config = this.recordingConfig;
      const changed = String(test.encoderId || '') !== String(config.encoderId || '')
        || Number(test.fps) !== Number(config.fps)
        || Number(test.width) !== Number(config.width)
        || Number(test.height) !== Number(config.height);
      if (changed) return 'stale';
      if (test.measured === false) return 'idle';
      return 'ok';
    },

    /**
     * 没测过就开监听时问一次；返回 false 表示「先去测试」。
     *
     * 一律用应用内确认框，不再弹系统 MessageBox ——
     * 白色系统框压在这个深色界面上非常突兀，而且和手柄模式下的同一个问题长得不一样。
     */
    async confirmEncoderUntested(state) {
      const key = state === 'stale' ? 'Recording.encoderCheckStale'
        : state === 'idle' ? 'Recording.encoderCheckIdle'
          : 'Recording.encoderCheckMissing';
      return await askConfirm({
        title: this.$t('Recording.encoderCheckTitle'),
        message: this.$t(key),
        detail: this.$t('Recording.encoderCheckHint'),
        okLabel: this.$t('Recording.encoderCheckStart'),
        cancelLabel: this.$t('Recording.encoderCheckTest'),
        icon: 'info'
      });
    },

    /**
     * 运行时过载监控。
     *
     * 主进程推来的 overloaded 来自 session.summarize（近 8 个采样的 speed 中位数
     * + 窗口内丢帧增量），阈值和编码测试共用 lib/recorder/load.js 里的 judgeLoad。
     * 单个采样抖动不会误报；连续两次（约 1 秒）才提示，一次监听里只提示一次 ——
     * 过载是持续性状态，每 500ms 弹一次只会让提示失去意义。
     */
    trackOverload(state) {
      if (!this.listening || !this.recordingConfig.enabled) return;
      if (!state || !state.overloaded) {
        this._overloadStreak = 0;
        return;
      }
      this._overloadStreak = (this._overloadStreak || 0) + 1;
      if (this._overloadStreak < 2 || this._overloadWarned) return;
      this._overloadWarned = true;
      const text = this.$t('Recording.overloadRuntime', {
        speed: Number(state.speed || 0).toFixed(2),
        dropped: Number(state.dropped || 0)
      });
      this.showError(text);
      // 玩游戏时窗口在后台，页内红条根本看不见，这时候靠系统通知兜底
      if (document.hidden && this.windowsNotify) this.windowsNotify(text);
    },

    onRecordingConfigChange(config) {
      // 滑条和输入框每动一下都会触发，防抖后再落盘
      clearTimeout(this._recSaveTimer);
      this._recSaveTimer = setTimeout(() => {
        try {
          window.electronAPI.saveRecordingConfig(JSON.parse(JSON.stringify(config)));
        } catch (error) { /* 配置存不下不影响当前会话 */ }
      }, 400);

      // 已经在缓冲时改参数，必须重启 ffmpeg 才生效。
      // 这里也用防抖 —— 拖画质滑条会连续触发十几次，不防抖会疯狂重启进程。
      clearTimeout(this._recRestartTimer);
      if (this.listening && this.recordingConfig.enabled) {
        this._recRestartTimer = setTimeout(() => this.restartReplayBuffer(), 800);
      }
    },

    /** 按当前配置启动缓冲，成功时同步状态 */
    async startReplayWithCurrentConfig() {
      const c = this.recordingConfig;
      const result = await window.electronAPI.startReplayBuffer({
        // 采集目标来自截图配置（recordingTarget），不在这里重复维护
        targetType: this.recordingTarget.type,
        windowSourceId: this.recordingTarget.hwnd || '',
        displayIndex: this.recordingTarget.displayIndex || 0,
        encoderId: c.encoderId,
        fps: c.fps,
        mode: c.mode,
        quality: c.quality,
        bitrate: c.bitrate,
        preset: c.preset,
        profile: c.profile,
        bf: c.bf,
        gopSeconds: c.gopSeconds,
        bufferSeconds: c.bufferSeconds,
        bufferMaxMB: c.bufferMaxMB,
        width: c.width,
        height: c.height,
        // 系统声音：必录，这里只决定录哪一路输出（空 = 跟随 Windows 默认）
        audio: {
          deviceId: (c.audio && c.audio.deviceId) || ''
        }
      });
      if (result && result.ok) {
        this.replayState = result.state;
        // 设备被占用 / 被拔掉时录制会降级成无声，必须让用户看到原因，
        // 否则就会出现「录了半天没有声音」却毫无提示的情况
        if (result.meta && result.meta.audioError) {
          this.showError(this.$t('Recording.audioFailed', { reason: result.meta.audioError }));
        } else if (result.meta && result.meta.fallbackFrom) {
          // 窗口抓不动、自动换成录它所在的屏幕：不说明白，用户会以为「选错来源了」
          this.showError(this.$t('Recording.testFallback'));
        }
        return true;
      }
      if (result && result.error) {
        this.showError(this.$t('Recording.testFail', { reason: result.error }));
      }
      return false;
    },

    openRecordingDialog() {
      this.showRecordingDialog = true;
    },

    closeRecordingDialog() {
      this.showRecordingDialog = false;
    },

    /** 开关循环录制：立即落盘并同步缓冲进程 */
    async setRecordingEnabled(enabled) {
      if (this.recordingConfig.enabled === enabled) return;
      this.recordingConfig.enabled = enabled;
      this.saveRecordingConfig();
      await this.syncReplayBuffer();
    },

    async stopReplayBufferSilently() {
      try {
        await window.electronAPI.stopReplayBuffer();
      } catch (error) { /* 进程可能已经自己退出 */ }
      this.replayState = { active: false, ready: false, duration: 0, targetSeconds: 0, bytes: 0 };
    },

    async restartReplayBuffer() {
      await this.stopReplayBufferSilently();
      if (this.listening && this.recordingConfig.enabled) {
        await this.startReplayWithCurrentConfig();
      }
    },

    /**
     * 让缓冲状态跟上「是否在监听」。
     *
     * 缓冲 = 编码器持续工作，所以只在监听期间跑：
     * 开始监听才启动、停止监听立刻关掉，待机时一点 GPU 都不占。
     */
    async syncReplayBuffer() {
      if (!window.electronAPI.startReplayBuffer) return;
      const shouldRun = this.listening && this.recordingConfig.enabled;

      let state = null;
      try {
        state = await window.electronAPI.getReplayState();
      } catch (error) {
        return;
      }
      const running = !!(state && state.active);

      if (shouldRun && !running) {
        await this.startReplayWithCurrentConfig();
      } else if (!shouldRun && running) {
        await this.stopReplayBufferSilently();
      }
    },

    /** 长按保存最近 N 秒（内置引擎） */
    async saveReplayByBuiltin() {
      const state = await window.electronAPI.getReplayState();
      if (!state || !state.ready) {
        // 「刚启动还没攒够第一段」和「画面完全没变化」都会走到这里，
        // 具体原因不重要，给一句能指导下一步动作的话就行
        this.showError(this.$t('Recording.emptyBuffer'));
        return;
      }

      const replayConfig = await this.prepareCaptureConfig();
      // 记下这次存了多长：通知和文件名之外的反馈都用它，避免和缓冲状态抢时序
      const seconds = Math.max(1, Math.round(state.duration || state.targetSeconds || 0));
      const result = await window.electronAPI.saveReplay({
        path: replayConfig.path,
        calcedFileName: replayConfig.calcedFileName
      });

      if (result && result.ok) {
        await this.playCaptureSound();
        // 和截图一样带预览位：主进程会用 ffmpeg 从刚存的文件里抽一帧当缩略图，
        // 抽不出来时 img 为空，浮窗自动退回通用录像图标
        await this.showCaptureNotification({
          img: result.thumb,
          type: 'video',
          title: this.$t('overlayNotify.replaySaved'),
          desc: this.$t('overlayNotify.replaySavedDesc', { sec: seconds })
        });
      } else if (result && result.error) {
        this.showError(result.error);
      }
    },

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
        const filePath = await window.electronAPI.screenShot(m_config)

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
      playSound(this.config.sound, this.config.soundPower)
    },
    async showCaptureNotification({ img, title, desc, type }) {
      const overlayNotify = await window.electronAPI.getStore('overlayNotify', 'show');
      const overlayNotifyDuration = Number(await window.electronAPI.getStore('overlayNotifyDuration', 2)) || 2;
      if (overlayNotify === 'show') {
        await window.electronAPI.showScreenshotNotification({ img, title, desc, type, duration: overlayNotifyDuration * 1000 });
      }
    },
    async chooseFolder() {
      // 手柄模式下系统「选择文件夹」对话框点不了，改用应用内的文件夹浏览器
      if (isPadMode()) {
        const picked = await pickFolder(this.config.path)
        if (picked) this.config.path = picked
        return
      }
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
          const label = (hatTotal > 1 ? this.$t('ui.hatsIndexed', { n: h + 1 }) : this.$t('ui.hats')) + ' ' + dirNames[d];
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
          return (this.hatCount > 1 ? this.$t('ui.hatShortIndexed', { n: hat + 1 }) : this.$t('ui.hatShort')) + dir;
        }
        return 'B' + index;
      }
      if (value.startsWith('Axis')) {
        return value.replace('Axis', this.$t('ui.axis')).replace('+', '＋').replace('-', '－');
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
      this.dropLegacyCaptureConfig();
      this.normalizeLegacySound();
      this.config.comboKeys = [];
    },
    /**
     * OBS 截图方式已整体移除，老存档里的 screenshotWay / obsReplayBufferOnLongPress
     * 读进来只会被一路重新写回去，这里直接丢掉，避免存档里长期留着死字段。
     */
    dropLegacyCaptureConfig() {
      delete this.config.screenshotWay;
      delete this.config.obsReplayBufferOnLongPress;
    },
    /**
     * 旧存档的音效值是 NS2 / PS，平台音效已废弃，统一回落到音效 1。
     * loadConfig（有手柄）与 loadGlobalConfig（无手柄）两条路径都要走一遍，否则下拉会显示空白。
     */
    normalizeLegacySound() {
      // 「静音」是合法值，不能被当成失效值重置成音效 1
      if (this.config.sound !== screenshotSoundEnum.None && !hasCaptureSound(this.config.sound)) {
        this.config.sound = screenshotSoundEnum.Sound1;
      }
      // 同步给共享状态：系统设置页的「覆层通知预览」要用同一个音效发声
      setCaptureSound(this.config.sound, this.config.soundPower);
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
      this.dropLegacyCaptureConfig();

      if (Array.isArray(this.config.comboKeys)) {
        this.config.comboKeys = this.config.comboKeys.map(k => typeof k === 'number' ? 'Button' + k : k);
      }

      // 旧存档里的音效值是 NS2 / PS，已随平台音效一并废弃，回落到音效 1
      this.normalizeLegacySound();

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
        sound: screenshotSoundEnum.Sound1,
        soundPower: 1,
        captureTargetType: CaptureTargetTypeEnum.Screen,
        screenSourceId: '',
        windowSourceId: '',
        screenShotSaveWay: ScreenShotSaveWayEnum.FileOnly,
        imageFormat: 'jpg',
        fileNameTemplate: 'Screenshot_%timestamp%',
        saveByActiveWinTitle: false,
        keyboardTrigger: false,
        keyboardTriggerKeyCode: null
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
    /**
     * 打开设备实例。device 来自 this.loadedGamePads，是 Vue 的响应式 Proxy，
     * 直接传过 contextBridge 会抛 "An object could not be cloned."，必须先拍平。
     */
    openDevice(device) {
      return window.electronAPI.openSdl2Device(toPlain(device))
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
      const success = await this.openDevice(device)
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

      if (this.config.captureTargetType === CaptureTargetTypeEnum.Window) {
        await this.loadCaptureWindows();
        if (!this.config.windowSourceId) {
          this.showError(this.$t('alertMsg.captureWindowEmpty'));
          return;
        }
      }

      // 开了循环录制就先确认这套编码设置测试过没有 ——
      // 没测过直接开监听，很可能在想存的那一段上丢帧，而且丢得无声无息
      if (this.recordingConfig.enabled) {
        const testState = this.encoderTestState();
        if (testState !== 'ok') {
          const goOn = await this.confirmEncoderUntested(testState);
          if (!goOn) {
            // 「先测试」：直接把编码设置弹窗打开，省得用户自己找
            this.openRecordingDialog();
            return;
          }
        }
      }

      // 每次开始监听都重置过载提示：上一次的告警不该压住这一次
      this._overloadWarned = false;
      this._overloadStreak = 0;

      //尝试启动
      let m_device = this.resolveCurrentDevice()
      if (!m_device) {
        this.showError(this.$t('ui.noGamepad'))
        return
      }
      let success = await this.openDevice(m_device)
      if (!success) {
        this.showError(this.$t('alertMsg.openGamepadFail'))
        return;
      }
      await this.refreshDeviceCapabilities();
      this.saveCurrentConfig();
      this.listening = true;

      // 开了「长按保存最近一段」的话，监听一开始就把回放缓存跑起来 ——
      // 缓冲需要提前积累，等按下长按再启动就来不及了
      if (this.recordingConfig.enabled) {
        await this.syncReplayBuffer();
      }

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
    // 「自动开始监听」开关打开后，软件启动和设备变化这两条路径都走这里
    async tryStartListen() {
      await this.loadGamePadList();
      if (this.loadedGamePads.length === 0) return;
      const autoListen = await window.electronAPI.getStore(autoListenResolutionKey, false);
      // 兼容旧存档的字符串取值（never / whenDeviceAvailable / onAppStart），新版只存布尔值
      const enabled = autoListen === true || autoListen === 'true'
        || autoListen === 'whenDeviceAvailable' || autoListen === 'onAppStart';
      if (!enabled) return;

      try {
        await this.startListen();
      } catch (error) {
        this.showError((error && error.message) ? error.message : String(error));
      }
      // 界面不可见时（隐藏到托盘等）页内红色提示看不到，改用系统通知兜底，
      // 避免「自动开始监听失败」变成一个完全无声的问题
      if (this.errorMessage && document.hidden && this.windowsNotify) {
        this.windowsNotify(this.errorMessage);
      }
    },
    async handleScreenShotTrigger() {
      this.buttonsValuePreview = await window.electronAPI.getCurrentButtonsValue()
      this.axesValuePreview = await window.electronAPI.getCurrentAxesValue()

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

      // 长按阈值由「循环录制 → 长按触发」决定：到点就直接存最近一段，
      // 松手时因为 comboLongPressHandled 已置位，不会再补一张截图
      const longPressMs = Number(this.recordingConfig.longPressMs) || 1000;
      if (this.recordingConfig.enabled && !this.comboLongPressHandled &&
        Date.now() - this.comboPressedAt >= longPressMs) {
        this.comboLongPressHandled = true;
        await this.saveReplayByBuiltin();
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
      // 过载提示的状态跟着监听会话走，下次开始重新计
      this._overloadWarned = false;
      this._overloadStreak = 0;
      // 停止监听就关掉回放缓存，不让编码器在待机时白占 GPU
      await this.syncReplayBuffer();
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
      const success = await this.openDevice(device)
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
        // 这里的 m_device 是 Vue 响应式对象，preload 会先拍平成纯数据再发给主进程；
        // 整段包一层 try/catch，任何一步失败都只提示，不能让渲染进程异常把程序带崩
        try {
          let success = await this.openDevice(m_device)
          if (!success) {
            // 不用原生 alert：手柄模式下无法操作系统对话框
            this.showError(this.$t('alertMsg.openGamepadFail'))
            if (this.windowsNotify) this.windowsNotify(this.$t('alertMsg.openGamepadFail'))
            return;
          }
          // 打开设备后刷新按键/十字键数量，识别到的 hat 方向才能正确命名
          await this.refreshDeviceCapabilities();
          this.detectionIndex = detectionIndex;
          this.buttonsValuePreview = await window.electronAPI.getCurrentButtonsValue();
          this.axesValuePreview = await window.electronAPI.getCurrentAxesValue();
          lastButtonsValue = JSON.parse(JSON.stringify(this.buttonsValuePreview || []));
          lastAxesValue = JSON.parse(JSON.stringify(this.axesValuePreview || []));
        } catch (error) {
          this.detectionIndex = -1;
          this.showError((error && error.message) ? error.message : String(error));
        }
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
/* ---------- 录像设置弹窗 ---------- */
/* 不做成独立页面：配置项不多，弹窗能保留「来源跟随截图」的上下文 */
.rec-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.52);
}

.rec-dialog {
  position: relative;
  width: min(520px, 100%);
  /* 高度给足：配置项比第一版多了「系统声音」一行，
     700px 的旧上限在 1080p / 125% 缩放下会刚好溢出，冒出滚动条 */
  max-height: min(92vh, 780px);
  overflow-y: auto;
  /* 兜底：内容再长也不出现系统那根白色滚动条 */
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
  padding: 14px 16px 16px;
  border-radius: var(--radius);
  border: 1px solid var(--line-strong);
  /* 两层背景：--surface 是半透明高光渐变，必须垫在实色 --bg 上，
     否则弹窗是透的，后面的卡片会透上来（第一版就踩了这个） */
  background: var(--surface), var(--bg);
  box-shadow: var(--shadow);
}

.rec-dialog::-webkit-scrollbar {
  width: 8px;
}

.rec-dialog::-webkit-scrollbar-track {
  background: transparent;
}

.rec-dialog::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 99px;
  background: var(--line-strong);
  background-clip: padding-box;
}

.rec-dialog::-webkit-scrollbar-thumb:hover {
  background: var(--ink-3);
  background-clip: padding-box;
}

.rec-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

/* 视觉上在右上角，DOM 上在最后 —— 保证手柄进弹窗时不会一按就关 */
.rec-dialog-close {
  position: absolute;
  top: 12px;
  right: 12px;
}

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

/* ---------- hero 内容（容器样式在 PageHero.vue 里统一维护） ---------- */
.hero-combo {
  display: flex;
  align-items: center;
  gap: 7px;
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

/* 循环录制的说明行：缩进到和标签文字对齐，和「可用字段」那种整块说明区分开 */
.rec-tip {
  margin: 0;
  padding-left: 20px;
  font-size: 10.5px;
  line-height: 1.55;
  color: var(--ink-3);
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
