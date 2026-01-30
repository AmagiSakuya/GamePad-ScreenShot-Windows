<template>
  <div class="settings-container">
    <div class="settings-content">
      <!-- 1. 路径设置 -->
      <div v-show="!listening" class="setting-row">
        <div class="setting-label">
          <i class="fas fa-folder-open"></i>
          <span>截图保存路径</span>
        </div>
        <div class="setting-controls">
          <div class="input-wrapper">
            <input type="text" class="form-input" placeholder="请选择文件夹路径" v-model="config.path">
          </div>
          <button class="btn btn-primary" @click="chooseFolder">
            <span>选择</span>
          </button>
        </div>
        <!-- <span class="hint-text">选择保存截图的文件夹位置</span> -->
      </div>

      <div v-show="!listening" class="setting-row">
        <div class="setting-label">
          <i class="fas fa-expand-alt"></i>
          <span>截图方式</span>
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="config.screenshotWay">
            <option v-for="(value, index) in screenShotWayEnum" :key="index">{{ value }}</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择截图的分辨率大小</span> -->
      </div>

      <!-- 2. 尺寸设置 -->
      <div v-show="config.screenshotWay == screenShotWayEnum.DesktopCapturer && !listening" class="setting-row">
        <div class="setting-label">
          <i class="fas fa-expand-alt"></i>
          <span>截图尺寸</span>
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="config.resolution">
            <option v-for="(value, index) in resolutionEnum" :key="index">{{ value }}</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择截图的分辨率大小</span> -->
      </div>

      <!-- 3. 控制器设置 -->
      <div v-show="!listening" class="setting-row">
        <div class="setting-label">
          <i class="fas fa-gamepad"></i>
          <span>控制器</span>
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="currentGamePad" @change="onUserSelectedDeviceChange">
            <option v-for="(value, index) in loadedGamePads" :key="index" :value="value">
              {{ value.name }}</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择您使用的游戏控制器类型</span> -->
      </div>

      <!-- 4. 组合按键设置 -->
      <div v-show="!listening" class="setting-row">
        <div class="setting-label">
          <i class="fas fa-keyboard"></i>
          <span>组合按键</span>
          <div class="action-buttons" style="margin-left: 10px; display: inline-flex; gap: 8px;">
            <button class="btn btn-success" @click="addCombo">
              <span>添加按键</span>
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
                <span>{{ detectionIndex == -1 ? '识别' : detectionIndex == index ? '识别中' : '不可用' }}</span>
              </button>
              <button @click="removeCombo(index)" class="btn btn-danger">
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
        <!-- 移除原来在这里的action-buttons -->
      </div>

      <!-- 5. 截图音频设置 -->
      <div v-show="!listening" class="setting-row">
        <div class="setting-label">
          <i class="fas fa-volume-up"></i>
          <span>截图音频</span>
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="config.sound">
            <option v-for="(value, index) in screenshotSoundEnum" :key="index">{{ value }}</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择截图时播放的音效</span> -->
      </div>

      <div v-show="listening" class="setting-row">
        <span>正在监听中</span>

      </div>

      <!-- 开始 -->
      <button v-show="!listening" class="save-button" @click="startListen">
        <span>启动</span>
      </button>

      <button v-show="listening" class="save-button" @click="stopListen">
        <span>停止</span>
      </button>

    </div>
  </div>
</template>

<script>
const { resolutionEnum, screenshotSoundEnum, ScreenShotWayEnum } = require('@/lib/enum')

let rawDevices;
let timer;
let lastButtonsValue;
export default {
  name: 'MainPage',
  components: {},
  props: {
    compOBS: {
      type: Object,
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
        screenshotWay: ScreenShotWayEnum.DesktopCapturer
      },
      screenshotSoundEnum: screenshotSoundEnum,
      resolutionEnum: resolutionEnum,
      screenShotWayEnum: ScreenShotWayEnum,
      showBufferDebug: false,
      listening: false,
      loadedGamePads: [],
      currentGamePad: {},
      buttonsValuePreview: new Array(20).fill(false),
      screenShoting : false,
      detectionIndex : -1
    }
  },
  async mounted() {
    await window.electronAPI.onDeviceChanged(this.onSDL2DeviceChanged);
    await window.electronAPI.onHotkeyTriggered(this.takeScreenshot);
    await this.loadGamePadList();
    timer = setInterval(this.getCurrentButtonsValue, 60);
  },
  async beforeUnmount() {
    await window.electronAPI.offDeviceChanged()
    await window.electronAPI.offHotkeyTriggered()
    await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
    clearInterval(timer)
    this.saveCurrentConfig()
  },
  methods: {
    async takeScreenshot() {
      if (this.screenShoting) return;
      this.screenShoting = true;
      if (this.config.screenshotWay == this.screenShotWayEnum.DesktopCapturer) {
        var m_config = JSON.parse(JSON.stringify(this.config));
        await window.electronAPI.screenShot(m_config)
        if(this.config.sound != screenshotSoundEnum.None){
          window.electronAPI.playScreenshotSound()
        }
      } else if (this.config.screenshotWay == this.screenShotWayEnum.OBS) {
        await this.compOBS.takeScreenshot(this.config)
      }
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
        localStorage.setItem(STORAGE_KEY, configStr);
      }
    },
    async loadConfig(deviceName) {
      let STORAGE_KEY = deviceName
      const savedConfig = localStorage.getItem(STORAGE_KEY);
      if (savedConfig) {
        this.config = JSON.parse(savedConfig);
      } else {
        this.resetConfig();
      }
    },
    async initDevice() {
      return false
    },
    resetConfig() {
      this.config = {
        path: '',
        resolution: resolutionEnum.R_1080P,
        comboKeys: [],
        sound: screenshotSoundEnum.NS2,
        screenshotWay: ScreenShotWayEnum.DesktopCapturer
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
      //1.检查配置
      var m_config = JSON.parse(JSON.stringify(this.config));
      if (m_config.path == "") {
        alert('截图路径不可以为空')
        return;
      }
      if (m_config.comboKeys.length == 0) {
        alert('没有添加快捷键')
        return;
      }
      if(this.detectionIndex != -1){
        alert('正在识别按键中');
        return;
      }
      //尝试启动
      let m_device = rawDevices[this.currentGamePad._index]
      let success = await window.electronAPI.openSdl2Device(m_device)
      if (!success) {
        alert('打开控制器失败')
        return;
      }
      this.saveCurrentConfig();
      this.listening = true;
    },
    async onSDL2DeviceChanged() {
      if (this.listening) {
        alert('设备发生变化 已停止截图监听');
      }
      if (this.detectionIndex != -1) {
        this.detectionIndex = -1;
        await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
        return;
      }
      this.listening = false;
      await this.loadGamePadList();
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
    },
    async onUserSelectedDeviceChange() {
      this.loadConfig(this.currentGamePad.name)
    },
    async automatedDetection(detectionIndex) {
      if (this.detectionIndex == -1) {
        let m_device = rawDevices[this.currentGamePad._index]
        let success = await window.electronAPI.openSdl2Device(m_device)
        if (!success) {
          alert('打开控制器失败')
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
    }
  }
}
</script>

<style>
.settings-container {
  background-color: white;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  width: 100%;
  overflow: hidden;
  transition: transform 0.3s ease;
}

/* .settings-container:hover {
  transform: translateY(-5px);
} */

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
  padding: 0 32px 32px 32px;
}

.setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  padding: 20px 0;
  border-bottom: 1px solid #eef2f7;
  transition: background-color 0.2s;
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
}

/* 确保按钮在标题行内正确显示 */
.setting-label .action-buttons {
  display: inline-flex;
  align-items: center;
  margin: 0;
}

/* 调整按钮样式以适应标题行 */
.setting-label .btn {
  padding: 4px 12px;
  font-size: 13px;
  height: 28px;
}

.setting-label .hint-text {
  color: #666;
  font-size: 13px;
}

.setting-label i {
  color: #4b6cb7;
  width: 20px;
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
  background: linear-gradient(to right, #4b6cb7, #182848);
  color: white;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.save-button:hover {
  /* transform: translateY(-3px); */
  box-shadow: 0 8px 20px rgba(75, 108, 183, 0.3);
}

.hint-text {
  font-size: 0.85rem;
  color: #718096;
  margin-top: 6px;
  display: block;
}


.setting-row {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.setting-label {
  width: 100%;
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
</style>
