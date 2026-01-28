<template>
  <div class="settings-container">
    <!-- <div class="settings-header">
      <i class="fas fa-sliders-h"></i>
      <h2>设置</h2>
    </div> -->

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

      <!-- 2. 尺寸设置 -->
      <div class="setting-row">
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
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="config.controller" @change="onControllerrSelectChange">
            <option v-for="(value, index) in controllerDefine" :key="index" :value="value.deviceName">
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

      <!-- <div class="setting-row">
        <div class="setting-label">
          <i class="fas fa-volume-up"></i>
          <span>Buffer(Debug)</span>
        </div>
        <div class="setting-controls" style="overflow: hidden;">
          <p class="setting-controls-p">{{ bufferPreview }}</p>
        </div>
        <button class="btn btn-primary" @click="copyBuffer">
          <span>复制当前值</span>
        </button>
      </div> -->
      <div class="setting-row">
        <div class="setting-label">
          <i class="fas fa-bug"></i>
          <span>Buffer Debug</span>
          <label class="switch" style="margin-left: 10px;">
            <input type="checkbox" v-model="showBufferDebug">
            <span class="slider round"></span>
          </label>
        </div>
        <div class="setting-controls">
          <!-- 这里可以留空或者放其他控件 -->
        </div>
      </div>

      <div v-if="showBufferDebug" class="setting-row buffer-debug-container">
        <div class="setting-controls buffer-list-container">
          <div class="buffer-table-wrapper">
            <table class="buffer-table">
              <thead>
                <tr>
                  <th class="buffer-index-header">
                    <div class="header-content">
                      <span class="header-desc">索引</span>
                    </div>
                  </th>
                  <th v-for="bit in 8" :key="bit" class="bit-header">
                    <div class="header-content">
                      <span class="bit-label">bit{{ 8 - bit }}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(binaryStr, index) in bufferDebugList" :key="index" class="buffer-row">
                  <td class="buffer-index-cell">
                    <div class="index-content">
                      <span class="buffer-index">buffer[{{ index }}]</span>
                    </div>
                  </td>
                  <td v-for="bitPos in 8" :key="bitPos" class="bit-cell" :class="getBitClass(binaryStr, bitPos)"
                    :title="`bit${8 - bitPos}: ${getBitValue(binaryStr, bitPos)}`">
                    <div class="bit-content">
                      <span class="bit-value">{{ getBitValue(binaryStr, bitPos) }}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <button class="save-button" @click="save">
        <span>保存设置</span>
      </button>
    </div>
  </div>
</template>

<script>
const { resolutionEnum, screenshotSoundEnum, CommonButtonEnum } = require('@/lib/enum')

let timer;
export default {
  name: 'App',
  components: {},
  data() {
    return {
      desktopPath: "",
      controllerDefine: [],
      config: {
        path: '',
        resolution: '',
        controller: '',
        comboKeys: [],
        sound: ''
      },
      screenshotSoundEnum: screenshotSoundEnum,
      resolutionEnum: resolutionEnum,
      buttonKeys: Object.keys(CommonButtonEnum),
      showBufferDebug: false,
      buffer: [],
      bufferDebugList: []
    }
  },
  async mounted() {
    window.electronAPI.onHotkeyTriggered(this.takeScreenshot)
    this.config = await window.electronAPI.readConfig();
    this.controllerDefine = await window.electronAPI.getControllerDefine();
    await this.initDevice();
  },
  unmounted() {
    window.electronAPI.offHotkeyTriggered(this.takeScreenshot)
  },
  methods: {
    async takeScreenshot() {
      this.desktopPath = await window.electronAPI.screenShot()
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
        alert('截图路径为空')
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
      if (!success) {
        alert('初始化设备失败 请确保控制已连接')
      } else {
        timer = setInterval(async () => {
          if (!this.showBufferDebug) return
          this.buffer = await window.electronAPI.getLastBuffer()
          this.updateBufferDebug(this.buffer);
        }, 60);
      }
      return success
    },
    onControllerrSelectChange() {
      //this.config.comboKeys = []
    },
    updateBufferDebug(bufferArray) {
      let m_list = []
      bufferArray.map((buffer, index) => {
        m_list.push(buffer.toString(2).padStart(8, '0'))
      });
      this.bufferDebugList = m_list;
    },
    getBitValue(binaryStr, bitPos) {
      // bitPos: 1表示bit7，8表示bit0
      // 字符串索引：0表示bit7，7表示bit0
      const index = bitPos - 1;
      return binaryStr[index];
    },

    // 获取bit的CSS类名
    getBitClass(binaryStr, bitPos) {
      const bitValue = this.getBitValue(binaryStr, bitPos);
      return bitValue === '1' ? 'bit-1' : 'bit-0';
    },
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  width: 100%;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

body {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

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

.buffer-debug-container {
  border-top: 1px solid #e0e0e0;
  padding-top: 15px;
  margin-top: 10px;
}

.buffer-list-container {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  background: #f8fafc;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  /* 重置所有影响定位的属性 */
  position: relative;
  padding: 0;
  margin: 0;
  display: block;
}

.buffer-table-wrapper {
  width: 100%;
  overflow-x: auto;
  /* 确保从顶部开始 */
  margin: 0;
  padding: 0;
}

.buffer-table {
  width: 100%;
  border-collapse: collapse;
  /* 使用collapse而不是separate */
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  margin: 0;
  padding: 0;
  border-spacing: 0;
}

.buffer-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: sticky;
  top: 0;
  z-index: 10;
}

.buffer-index-header {
  min-width: 90px;
  padding: 12px 8px;
  text-align: center;
  color: white;
  border-bottom: 2px solid #5a67d8;
  position: relative;
  font-weight: 500;
}

.bit-header {
  min-width: 50px;
  padding: 12px 4px;
  text-align: center;
  color: white;
  border-bottom: 2px solid #5a67d8;
  position: relative;
  font-weight: 500;
}

.header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.header-title {
  font-size: 13px;
  font-weight: 600;
}

.header-desc {
  font-size: 11px;
  opacity: 0.9;
}

.bit-label {
  font-size: 13px;
  font-weight: 600;
}

.bit-position {
  font-size: 10px;
  opacity: 0.9;
}

.buffer-row {
  border-bottom: 1px solid #eef2f7;
  background: white;
  transition: all 0.2s ease;
}

.buffer-row:hover {
  background: linear-gradient(135deg, #f6f9ff 0%, #edf2ff 100%);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.buffer-row:last-child {
  border-bottom: none;
}

.buffer-index-cell {
  padding: 12px 8px;
  text-align: center;
  background: #f8fafc;
  border-right: 1px solid #eef2f7;
  transition: background-color 0.2s ease;
}

.buffer-row:hover .buffer-index-cell {
  background: #e3f2fd;
}

.index-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.buffer-index {
  font-weight: 700;
  color: #4f46e5;
  font-size: 14px;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
}

.buffer-sequence {
  font-size: 11px;
  color: #64748b;
  background: #e2e8f0;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.bit-cell {
  padding: 14px 2px;
  text-align: center;
  border-right: 1px solid #eef2f7;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.bit-cell:last-child {
  border-right: none;
}

.bit-cell::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: currentColor;
  opacity: 0.05;
  z-index: 1;
}

.bit-cell.bit-0 {
  color: #94a3b8;
  background: #f8fafc;
}

.bit-cell.bit-1 {
  color: #3b82f6;
  background: #eff6ff;
}

.bit-cell.bit-0:hover {
  background: #f1f5f9;
  color: #64748b;
}

.bit-cell.bit-1:hover {
  background: #dbeafe;
  color: #1d4ed8;
}

.bit-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.bit-value {
  font-size: 14px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.buffer-table tfoot {
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.summary-cell {
  padding: 12px 16px;
  text-align: center;
  border-top: 2px solid #e2e8f0;
}

.summary-content {
  display: flex;
  justify-content: center;
  align-items: center;
}

.summary-text {
  font-size: 13px;
  color: #475569;
  font-weight: 500;
}

.bit-count {
  font-size: 12px;
  color: #64748b;
  margin-left: 8px;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 12px;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
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
</style>
