<template>
  <div class="settings-container">
    <div class="settings-content">
      <!-- 1. 路径设置 -->
      <div class="setting-row">
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

      <div class="setting-row">
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
      <div v-show="config.screenshotWay == screenShotWayEnum.DesktopCapturer" class="setting-row">
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
      <div class="setting-row">
        <div class="setting-label">
          <i class="fas fa-gamepad"></i>
          <span>控制器</span>
          <div v-if="!deviceOpen" class="action-buttons" style="margin-left: 10px; display: inline-flex; gap: 8px;">
            <button class="btn btn-primary" @click="reOpenDevice">
              <span>重新连接</span>
            </button>
          </div>
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="config.controller">
            <option v-for="(value, index) in controllerConfig" :key="index" :value="value.deviceName">
              {{ value.deviceName }}</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择您使用的游戏控制器类型</span> -->
      </div>

      <!-- 4. 组合按键设置 -->
      <div class="setting-row">
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
                <option v-for="(value, index) in buttonKeys" :key="index">{{ value }}</option>
              </select>
              <button @click="removeCombo(index)" class="btn btn-danger">
                <span>删除</span>
              </button>
            </div>
          </div>
        </div>
        <!-- 移除原来在这里的action-buttons -->
      </div>

      <!-- 5. 截图音频设置 -->
      <div class="setting-row">
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

      <!-- 保存按钮 -->
      <button class="save-button" @click="save">
        <span>保存设置</span>
      </button>
    </div>
  </div>
</template>

<script>
const { resolutionEnum, screenshotSoundEnum, CommonButtonEnum , ScreenShotWayEnum } = require('@/lib/enum')

let timer;
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
        resolution: '',
        controller: '',
        comboKeys: [],
        sound: '',
        screenshotWay : ''
      },
      screenshotSoundEnum: screenshotSoundEnum,
      resolutionEnum: resolutionEnum,
      screenShotWayEnum:ScreenShotWayEnum,
      buttonKeys: Object.keys(CommonButtonEnum),
      showBufferDebug: false,
      buffer: [],
      bufferDebugList: [],
      deviceOpen: false
    }
  },
  async beforeMount() {
    this.controllerConfig = await window.electronAPI.getControllerConfig();
  },
  async mounted() {
    await window.electronAPI.onHotkeyTriggered(this.takeScreenshot)
    await window.electronAPI.onScreenShotDeviceError(this.onScreenShotDeviceError)
    await window.electronAPI.setScreenShotTrigger(true)
    await this.reOpenDevice();
  },
  async beforeUnmount() {
    await window.electronAPI.offHotkeyTriggered()
    await window.electronAPI.offScreenShotDeviceError()
    await window.electronAPI.setScreenShotTrigger(false)
  },
  async unmounted() {

  },
  methods: {
    async takeScreenshot() {
      if(this.config.screenshotWay == this.screenShotWayEnum.DesktopCapturer){
          await window.electronAPI.screenShot()
          window.electronAPI.playScreenshotSound()
      }else if(this.config.screenshotWay == this.screenShotWayEnum.OBS){
          this.compOBS.takeScreenshot(this.config)
      }
    },
    async chooseFolder() {
      const folder = await window.electronAPI.selectFolder()
      if (folder) {
        this.config.path = folder
      }
    },
    addCombo() {
      this.config.comboKeys.push(CommonButtonEnum.HOME)
    },
    removeCombo(index) {
      this.config.comboKeys.splice(index, 1)
    },
    async save() {
      var stringData = JSON.stringify(this.config);
      var pureObj = JSON.parse(stringData);
      if (pureObj.path == "") {
        alert('截图路径不可以为空')
        return;
      }
      await window.electronAPI.saveConfig(pureObj)
      let success = await this.initDevice();
      if (success) {
        alert('保存成功')
      }
    },
    async initDevice() {
      if (timer) {
        clearInterval(timer)
        timer = null
        this.bufferPreview = ''
      }
      if (!this.config.controller) return
      let success = await window.electronAPI.initDevice()

      this.deviceOpen = success
      if (!success) {
        alert('初始化设备失败 请确保控制已连接')
      }
      return success
    },
    async reOpenDevice() {
      this.config = await window.electronAPI.readConfig();
      await this.initDevice();
    },
    onScreenShotDeviceError() {
      alert('控制器连接已断开，请确保插上控制器后重启软件')
      this.deviceOpen = false
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
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(75, 108, 183, 0.2);
}

.btn-secondary {
  background-color: #edf2f7;
  color: #4a5568;
}

.btn-secondary:hover {
  background-color: #e2e8f0;
  transform: translateY(-2px);
}

.btn-danger {
  background-color: #fed7d7;
  color: #c53030;
  padding: 8px 16px;
  font-size: 0.85rem;
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
  transform: translateY(-3px);
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

.combo-row {
  flex-direction: column;
  align-items: flex-start;
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
