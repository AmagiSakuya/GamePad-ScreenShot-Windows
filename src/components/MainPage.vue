<template>
  <div class="settings-container">
    <div class="settings-content-scroll">
      <div class="settings-content">
        <div class="setting-row-horizontal">
          <!-- 截图方式设置 -->
          <div v-show="!listening" class="setting-row">
            <div class="setting-label">
              <i class="fas fa-expand-alt"></i>
              <span>{{ $t('screenshotSource') }}</span>
            </div>
            <div class="setting-controls">
              <select class="form-select" v-model="config.screenshotWay">
                <option v-for="(value, index) in screenShotWayEnum" :key="index">{{ value }}</option>
              </select>
            </div>
            <!-- <span class="hint-text">选择截图的分辨率大小</span> -->
          </div>

          <!-- 尺寸设置 -->
          <div v-show="config.screenshotWay == screenShotWayEnum.DesktopCapturer && !listening" class="setting-row">
            <div class="setting-label">
              <i class="fas fa-expand-alt"></i>
              <span>{{ $t('thumbnailSize') }}</span>
            </div>
            <div class="setting-controls">
              <select class="form-select" v-model="config.resolution">
                <option v-for="(value, index) in resolutionEnum" :key="index">{{ value }}</option>
              </select>
            </div>
            <!-- <span class="hint-text">选择截图的分辨率大小</span> -->
          </div>
        </div>

        <div class="setting-row-horizontal">
          <div v-show="!listening" class="setting-row">
            <div class="setting-label">
              <i class="fas fa-folder-open"></i>
              <span>{{ $t('savingMode') }}</span>
            </div>
            <div class="setting-controls">
              <select class="form-select" v-model="config.screenShotSaveWay">
                <option v-for="(value, index) in screenShotSaveWayEnum" :key="index" :value="value"> {{
                  $t(`saveWay.${value}`) }}</option>
              </select>
            </div>
          </div>

          <!--路径设置 -->
          <div v-show="!listening && config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly"
            class="setting-row" style="flex: 2;">
            <div class="setting-label">
              <i class="fas fa-folder-open"></i>
              <span>{{ $t('savePath') }}</span>
              <div class="action-buttons" style="margin-left: 10px; display: inline-flex; gap: 8px;">
                <button class="btn btn-primary" @click="chooseFolder">
                  <span>{{ $t('select') }}</span>
                </button>
              </div>
            </div>
            <div class="setting-controls">
              <div class="input-wrapper">
                <input type="text" class="form-input" :placeholder="$t('selectFolderPath')" v-model="config.path">
              </div>
            </div>
            <!-- <span class="hint-text">选择保存截图的文件夹位置</span> -->
          </div>
          <!-- 保存格式 -->
          <div v-show="!listening && config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly"
            class="setting-row" style="flex: 0.5;">
            <div class="setting-label">
              <i class="fas fa-folder-open"></i>
              <span>{{ $t('imageFormat') }}</span>
            </div>
            <div class="setting-controls">
              <select class="form-select" v-model="config.imageFormat">
                <option v-for="(value, index) in saveImageFormateOptions" :key="index" :value="value">
                  {{ value }}</option>
              </select>
            </div>
            <!-- <span class="hint-text">选择您使用的游戏控制器类型</span> -->
          </div>

        </div>

        <!-- 文件名自定义 -->
        <div v-show="!listening && config.screenShotSaveWay != screenShotSaveWayEnum.CilpboardOnly" class="setting-row">
          <div class="setting-label">
            <i class="fas fa-folder-open"></i>
            <span>{{ $t('saveFileName') }}</span>
            <span class="hint-text" style="user-select: text;"> {{ $t('availableFields') }} : ( {{
              availableFields.join('、') }} )</span>
          </div>
          <div class="setting-controls">
            <div class="input-wrapper">
              <input type="text" class="form-input" placeholder="Screenshot_%datetime%"
                v-model="config.fileNameTemplate" style="user-select: text;">
            </div>
          </div>
          <span class="hint-text" style="user-select: text;margin-left: 5px;">{{ $t('fileNamePreview') }}：{{
            formatFileName(config.fileNameTemplate, formatPreviewTicker) }}.{{ config.imageFormat }}</span>
        </div>

        <!--  控制器设置 -->
        <div v-show="!listening" class="setting-row">
          <div class="setting-label">
            <i class="fas fa-gamepad"></i>
            <span>{{ $t('controller') }}</span>
          </div>
          <div class="setting-controls">
            <select class="form-select" v-model="currentGamePad" @change="onUserSelectedDeviceChange">
              <option v-for="(value, index) in loadedGamePads" :key="index" :value="value">
                {{ value.name }}</option>
            </select>
          </div>
          <!-- <span class="hint-text">选择您使用的游戏控制器类型</span> -->
        </div>

        <!-- 组合按键设置 -->
        <div v-show="!listening" class="setting-row">
          <div class="setting-label">
            <i class="fas fa-keyboard"></i>
            <span>{{ $t('keyCombo') }}</span>
            <div class="action-buttons" style="margin-left: 10px; display: inline-flex; gap: 8px;">
              <button class="btn btn-success" @click="addCombo">
                <span>{{ $t('addKey') }}</span>
              </button>
            </div>
          </div>
          <div class="setting-controls">
            <div class="combo-rows-container">
              <div v-for="(key, index) in config.comboKeys" :key="index" class="combo-row">
                <select class="form-select combo-select" v-model="config.comboKeys[index]">
                  <option v-for="(n, index) in 20" :key="index" :value="index">Button{{ index }}</option>
                </select>
                <button v-show="loadedGamePads.length > 0" @click="automatedDetection(index)" class="btn btn-primary">
                  <span>{{ detectionIndex == -1 ? $t('recognize') : detectionIndex == index ? $t('recognizing') :
                    $t('unavailable') }}</span>
                </button>
                <button @click="removeCombo(index)" class="btn btn-danger">
                  <span>{{ $t('delete') }}</span>
                </button>
              </div>
            </div>
          </div>
          <!-- 移除原来在这里的action-buttons -->
        </div>

        <div class="setting-row-horizontal">
          <!-- 截图音频设置 -->
          <div v-show="!listening" class="setting-row">
            <div class="setting-label">
              <i class="fas fa-volume-up"></i>
              <span>{{ $t('audio') }}</span>
            </div>
            <div class="setting-controls">
              <select class="form-select" v-model="config.sound">
                <option v-for="(value, index) in screenshotSoundEnum" :key="index" :value="value">{{
                  $t(`screenshotSound.${value}`) }}</option>
              </select>
            </div>
            <!-- <span class="hint-text">选择截图时播放的音效</span> -->
          </div>

          <!-- 截图音量设置 -->
          <div v-show="!listening && config.sound != screenshotSoundEnum.None" class="setting-row">
            <div class="setting-label">
              <i class="fas fa-volume-up"></i>
              <span>{{ $t('volume') }}</span>
            </div>
            <div class="setting-controls">
              <select class="form-select" v-model="config.soundPower">
                <option v-for="(value, index) in volumeOptions" :key="index" :value="value">{{ value * 100 + '%' }}
                </option>
              </select>
            </div>
            <!-- <span class="hint-text">选择截图时播放的音效</span> -->
          </div>
        </div>

        <div v-show="listening" class="setting-row">
          <span class="setting-row-listening-tip">{{ $t('listening') }}</span>
        </div>

      </div>
    </div>

    <div class="settings-footer-btn">
      <div v-if="errorMessage" class="error-tip">{{ errorMessage }}</div>
      <!-- 开始 -->
      <button v-show="!listening" class="save-button" @click="startListen">
        <span class="icon">▶</span>
        <span>{{ $t('start') }}</span>
      </button>

      <div v-show="listening" class="button-group">
        <button class="save-button primary" @click="openScreenShotFolder">
          <span class="icon">📂</span>
          {{ $t('openScreenshotFolder') }}
        </button>
        <button class="save-button" @click="stopListen">
          <span class="icon">⏹</span>
          {{ $t('stop') }}
        </button>
      </div>
    </div>

  </div>
</template>

<script>
const { resolutionEnum, screenshotSoundEnum, ScreenShotWayEnum, ScreenShotSaveWayEnum } = require('@/lib/enum')

import { Howl } from 'howler'
import ns2SoundSrc from '@/assets/ns2截图音.mp3'

let rawDevices;
let timer;
let active_info_getter_timer;
let lastButtonsValue;
let activeWinInfoResult;
let autoListenResolutionKey = 'autoListenResolution';

export default {
  name: 'MainPage',
  components: {},
  props: {
    compOBS: {
      type: Object,
      default: null
    },
    windowsNotify: {
      type: Function,
      default: null
    }
  },
  data() {
    return {
      controllerConfig: [],
      config: {
        path: '',
        resolution: resolutionEnum.R_1080P,
        comboKeys: [],
        sound: screenshotSoundEnum.NS2,
        soundPower: 1,
        screenshotWay: ScreenShotWayEnum.DesktopCapturer,
        screenShotSaveWay: ScreenShotSaveWayEnum.FileOnly,
        imageFormat: 'jpg',
        fileNameTemplate: 'Screenshot_%timestamp%'
      },
      screenshotSoundEnum: screenshotSoundEnum,
      resolutionEnum: resolutionEnum,
      screenShotWayEnum: ScreenShotWayEnum,
      screenShotSaveWayEnum: ScreenShotSaveWayEnum,
      showBufferDebug: false,
      listening: false,
      loadedGamePads: [],
      currentGamePad: {},
      buttonsValuePreview: new Array(20).fill(false),
      screenShoting: false,
      detectionIndex: -1,
      volumeOptions: [0.5, 1, 1.5, 2, 3, 4, 5],
      saveImageFormateOptions: ['jpg', 'png'],
      availableFields: ['activeWinTitle', 'activeWinOwner', 'timestamp', 'datetime', 'YYYY', 'MM', 'DD', 'hh', 'mm', 'ss', 'cs', 'ms'],
      formatPreviewTicker: 0,
      errorMessage: ''
    }
  },
  async mounted() {
    await window.electronAPI.onDeviceChanged(this.onSDL2DeviceChanged);
    await window.electronAPI.offOpenFolderTriggered();
    await window.electronAPI.onOpenFolderTriggered(this.openScreenShotFolder);
    // 添加托盘监听事件
    window.electronAPI.onStartListenFromTray(this.onStartListenFromTray);
    window.electronAPI.onStopListenFromTray(this.onStopListenFromTray);

    await this.tryStartListen('appStart');

    timer = setInterval(this.getCurrentButtonsValue, 60);

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
  },
  async beforeUnmount() {
    if (this.listening) {
      this.stopListen();
    }
    await window.electronAPI.offDeviceChanged()
    await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
    clearInterval(timer)
    clearInterval(active_info_getter_timer)
    this.saveCurrentConfig()
  },
  methods: {
    async takeScreenshot() {
      if (this.screenShoting) return;
      this.screenShoting = true;
      var m_config = JSON.parse(JSON.stringify(this.config));
      m_config.calcedFileName = this.formatFileName(m_config.fileNameTemplate);
      let filePath;
      if (this.config.screenshotWay == this.screenShotWayEnum.DesktopCapturer) {
        filePath = await window.electronAPI.screenShot(m_config)
      } else if (this.config.screenshotWay == this.screenShotWayEnum.OBS) {
        filePath = await this.compOBS.takeScreenshot(m_config)
      }

      if (filePath == void 0 || filePath == null) {
        this.screenShoting = false;
        return;
      }
      if (this.config.sound == screenshotSoundEnum.NS2) {
        let sound = new Howl({
          src: [ns2SoundSrc], volume: this.config.soundPower, onend: function () {
            this.unload();
          }
        })
        sound.play();
      }
      
      await window.electronAPI.showScreenshotNotification({
        img: filePath, 
        title: this.$t('overlayNotify.screenshotSuccess'), 
        desc: this.$t('overlayNotify.screenshotSaved'), 
      })

      this.screenShoting = false;
    },
    async chooseFolder() {
      const folder = await window.electronAPI.selectFolder()
      if (folder) {
        this.config.path = folder
      }
    },
    addCombo() {
      this.config.comboKeys.push(0)
    },
    removeCombo(index) {
      this.config.comboKeys.splice(index, 1)
    },
    async saveCurrentConfig() {
      if (this.currentGamePad && this.currentGamePad.name) {
        const configStr = JSON.stringify(this.config);
        let STORAGE_KEY = this.currentGamePad.name
        await window.electronAPI.setStore(STORAGE_KEY, configStr);
      }
    },
    async loadConfig(deviceName) {
      let STORAGE_KEY = deviceName
      const savedConfig = await window.electronAPI.getStore(STORAGE_KEY, void 0);

      if (savedConfig) {
        this.config = JSON.parse(savedConfig);
      } else {
        this.resetConfig();
      }

      //#region 升级老配置
      if (this.config.fileNameTemplate == null || this.config.fileNameTemplate == undefined || this.config.fileNameTemplate.trim() == '') {
        this.config.fileNameTemplate = 'Screenshot_%timestamp%'
      }

      if (this.config.screenShotSaveWay == null || this.config.screenShotSaveWay == undefined || this.config.screenShotSaveWay.trim() == '') {
        this.config.screenShotSaveWay = ScreenShotSaveWayEnum.FileOnly
      }

      if (this.config.imageFormat == null || this.config.imageFormat == undefined || this.config.imageFormat.trim() == '') {
        this.config.imageFormat = 'jpg'
      }
      //#endregion

    },
    resetConfig() {
      this.config = {
        path: '',
        resolution: resolutionEnum.R_1080P,
        comboKeys: [],
        sound: screenshotSoundEnum.NS2,
        soundPower: 1,
        screenshotWay: ScreenShotWayEnum.DesktopCapturer,
        screenShotSaveWay: ScreenShotSaveWayEnum.FileOnly,
        imageFormat: 'jpg',
        fileNameTemplate: 'Screenshot_%timestamp%'
      }
    },
    async loadGamePadList() {
      rawDevices = await window.electronAPI.getAllGamePad()
      this.loadedGamePads = rawDevices;
      if (this.loadedGamePads.length > 0) {
        this.currentGamePad = this.loadedGamePads[0]
        this.loadConfig(this.currentGamePad.name)
      } else {
        this.resetConfig();
      }
    },
    async startListen() {
      this.errorMessage = '';
      //1.检查配置
      var m_config = JSON.parse(JSON.stringify(this.config));
      if (m_config.path == "") {
        this.errorMessage = this.$t('alertMsg.emptyPath')
        return;
      }
      if (m_config.comboKeys.length == 0) {
        this.errorMessage = this.$t('alertMsg.noKeyCombo')
        return;
      }
      if (this.detectionIndex != -1) {
        this.errorMessage = this.$t('alertMsg.detectionInProgress')
        return;
      }

      //尝试连接OBS
      if (this.config.screenshotWay == ScreenShotWayEnum.OBS && !this.compOBS.isConnected) {
        await this.compOBS.connectOBS();
        if (!this.compOBS.isConnected) {
          this.errorMessage = this.$t('OBSPage.obsNotConnected')
          return;
        }
      }

      //尝试启动
      let m_device = rawDevices[this.currentGamePad._index]
      let success = await window.electronAPI.openSdl2Device(m_device)
      if (!success) {
        this.errorMessage = this.$t('alertMsg.openGamepadFail')
        return;
      }
      this.saveCurrentConfig();
      this.listening = true;
      this.windowsNotify(this.$t('alertMsg.listeningStarted'));
    },
    async onSDL2DeviceChanged() {
      if (this.listening) {
        this.windowsNotify(this.$t('alertMsg.deviceChangedCancelListening'));
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
    async getCurrentButtonsValue() {
      this.buttonsValuePreview = await window.electronAPI.getCurrentButtonsValue()
      if (this.listening) {
        let flag = true;
        for (let i = 0; i < this.config.comboKeys.length; i++) {
          let m_index = this.config.comboKeys[i];
          let buttonValue = this.buttonsValuePreview[m_index];
          if (!buttonValue) flag = false
        }
        if (flag) {
          this.takeScreenshot();
        }
      }

      if (!this.listening && this.detectionIndex != -1) {
        for (let i = 0; i < this.buttonsValuePreview.length; i++) {
          if (this.buttonsValuePreview[i] != lastButtonsValue[i]) {
            this.config.comboKeys[this.detectionIndex] = i;
            this.detectionIndex = -1;
            await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
            break;
          }
        }
      }
    },
    async stopListen() {
      this.listening = false;
      this.windowsNotify(this.$t('alertMsg.listeningStopped'));
    },
    async onUserSelectedDeviceChange() {
      this.loadConfig(this.currentGamePad.name)
    },
    async automatedDetection(detectionIndex) {
      if (this.detectionIndex == -1) {
        let m_device = rawDevices[this.currentGamePad._index]
        let success = await window.electronAPI.openSdl2Device(m_device)
        if (!success) {
          alert(this.$t('alertMsg.openGamepadFail'))
          return;
        }
        this.detectionIndex = detectionIndex;
        lastButtonsValue = JSON.parse(JSON.stringify(this.buttonsValuePreview));
        return;
      }
      if (this.detectionIndex == detectionIndex) {
        this.detectionIndex = -1;
        await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
        return;
      }
    },
    formatFileName(template, ticker = 0) {
      if (template == null || template == undefined || template.trim() == '') {
        return '';
      }
      //const activeWinInfo = await window.electronAPI.getActiveWinInfo();
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
      if (this.listening) return; // 如果已经在监听，不做任何事
      await this.startListen();
      if (this.errorMessage) {
        this.windowsNotify(this.errorMessage);
      }
    },
    async onStopListenFromTray() {
      if (!this.listening) return; // 如果没有在监听，不做任何事
      this.stopListen();
    },
    openScreenShotFolder() {
      window.electronAPI.openFolder(this.config.path);
    }
  }
}
</script>

<style>
.settings-container {
  background-color: white;
  box-shadow: 0 10px 30px rgb(0 0 0 / 10%);
  width: 100%;
  transition: transform 0.3s ease;
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  max-height: 100%;
  padding-bottom: 32px;
}

.settings-header {
  background: linear-gradient(to right, #4b6cb7, #182848);
  color: white;
  padding: 24px 32px;
  display: flex;
  align-items: center;
  gap: 15px;
}

.settings-header h2 {
  font-size: 1.8rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.settings-header i {
  font-size: 1.6rem;
}

.settings-content {
  padding: 0 32px;
  height: 100%;
  overflow: hidden;
}

.settings-content-scroll {
  overflow: auto;
}

.setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid #eef2f7;
  transition: background-color 0.2s;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.setting-row:hover {
  background-color: #f9fbfd;
  padding-left: 10px;
  padding-right: 10px;
  margin-left: -10px;
  margin-right: -10px;
  border-radius: 8px;
}

.setting-label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  min-height: 30px;
  user-select: none;
}


/* 确保按钮在标题行内正确显示 */
.setting-label .action-buttons {
  display: inline-flex;
  align-items: center;
  margin: 0;
}

/* 调整按钮样式以适应标题行 */
.setting-label .btn {
  padding: 4px 15px;
  font-size: 13px;
  height: 30px;
}

.setting-label .hint-text {
  color: #666;
  font-size: 12px;
  text-align: left;
  margin-left: 5px;
  user-select: none;
}

.setting-label i {
  color: #4b6cb7;
  width: 3px;
  text-align: center;
}


.setting-controls {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.input-wrapper {
  flex: 1;
  position: relative;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.3s;
  color: #2d3748;
  background-color: #f8fafc;
}

.form-input:focus {
  outline: none;
  border-color: #4b6cb7;
  background-color: white;
  box-shadow: 0 0 0 3px rgba(75, 108, 183, 0.1);
}

.form-input::placeholder {
  color: #a0aec0;
}

.form-select {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  background-color: #f8fafc;
  color: #2d3748;
  cursor: pointer;
  transition: all 0.3s;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234b6cb7' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 16px center;
  background-size: 16px;
}

.form-select:focus {
  outline: none;
  border-color: #4b6cb7;
  background-color: white;
  box-shadow: 0 0 0 3px rgba(75, 108, 183, 0.1);
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-primary {
  background-color: #4b6cb7;
  color: white;
}

.btn-primary:hover {
  background-color: #3a5795;
  /* transform: translateY(-2px); */
  box-shadow: 0 5px 15px rgba(75, 108, 183, 0.2);
}

.btn-secondary {
  background-color: #edf2f7;
  color: #4a5568;
}

.btn-secondary:hover {
  background-color: #e2e8f0;
  /* transform: translateY(-2px); */
}

.btn-danger {
  background-color: #fed7d7;
  color: #c53030;
}

.btn-danger:hover {
  background-color: #feb2b2;
}

.btn-success {
  background-color: #c6f6d5;
  color: #22543d;
  padding: 8px 16px;
  font-size: 0.85rem;
}

.btn-success:hover {
  background-color: #9ae6b4;
}

.combo-rows-container {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 10px;
}

.combo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background-color: #f8fafc;
  border-radius: 8px;
  border-left: 4px solid #4b6cb7;
}

.combo-select {
  flex: 1;
  max-width: 300px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
}

.save-button {
  margin-top: 30px;
  padding: 16px 32px;
  font-size: 1.1rem;
  width: 100%;
  background: linear-gradient(to right, #4b6cb7, #4b6cb7);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.save-button:hover {
  /* transform: translateY(-3px); */
  box-shadow: 0 8px 20px rgba(75, 108, 183, 0.3);
}

.save-button.primary {
  background: linear-gradient(135deg, #414345 0%, #414345 100%);
}


.hint-text {
  font-size: 0.85rem;
  color: #718096;
  margin-top: 6px;
  display: block;
}

.error-tip {
  width: 100%;
  color: #e53e3e;
  background: #fff5f5;
  border: 1px solid #feb2b2;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 0.95rem;
}


.setting-controls {
  width: 100%;
}


.combo-select {
  max-width: 100%;
  width: 100%;
}

.setting-controls-p {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.settings-footer-btn {
  padding: 0 32px;
}


/* 开关样式保持不变 */
.switch {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: .4s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  transition: .4s;
}

input:checked+.slider {
  background-color: #2196F3;
}

input:checked+.slider:before {
  transform: translateX(26px);
}

.slider.round {
  border-radius: 24px;
}

.slider.round:before {
  border-radius: 50%;
}

.col-buffer {
  min-width: 150px;
  width: 150px;
}

.setting-row-listening-tip {
  display: block;
  width: 100%;
  user-select: none;
}

.setting-row-horizontal {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.setting-row-horizontal .setting-row {
  flex: 1;
}

/* 按钮容器 */
.button-group {
  display: flex;
  gap: 16px;
  width: 100%;
  box-sizing: border-box;
}
</style>
