<template>
  <div class="settings-container">
    <div class="settings-header">
      <i class="fas fa-sliders-h"></i>
      <h2>设置</h2>
    </div>

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
            <option>1080P</option>
            <option selected>2K</option>
            <option>4K</option>
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
          <select class="form-select" v-model="config.controller">
            <option selected>XBOX</option>
            <option>DS4</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择您使用的游戏控制器类型</span> -->
      </div>

      <!-- 4. 组合按键设置 -->
      <div class="setting-row">
        <div class="setting-label">
          <i class="fas fa-keyboard"></i>
          <span>组合按键</span>
        </div>
        <div class="setting-controls">
          <div class="combo-rows-container">

            <div v-for="(key, index) in config.comboKeys" :key="index" class="combo-row">
              <select class="form-select combo-select" v-model="config.comboKeys[index]">
                <option selected>PS(XBOX)</option>
                <option selected>L1(LB)</option>
                <option>R1(RB)</option>
                <option>Share(Select)</option>
                <option>Option(Start)</option>
              </select>
              <button @click="removeCombo(index)" class="btn btn-danger">
                <i class="fas fa-trash-alt"></i>
                <span>删除</span>
              </button>
            </div>

          </div>
        </div>
        <div class="action-buttons">
          <button class="btn btn-success" @click="addCombo">
            <span>添加按键</span>
          </button>
        </div>
        <!-- <span class="hint-text">添加或删除截图组合按键</span> -->
      </div>

      <!-- 5. 截图音频设置 -->
      <div class="setting-row">
        <div class="setting-label">
          <i class="fas fa-volume-up"></i>
          <span>截图音频</span>
        </div>
        <div class="setting-controls">
          <select class="form-select" v-model="config.sound">
            <option selected>无声音</option>
            <option>NS2</option>
          </select>
        </div>
        <!-- <span class="hint-text">选择截图时播放的音效</span> -->
      </div>

      <button class="save-button" @click="save">
        <span>保存设置</span>
      </button>
    </div>
  </div>
</template>

<script>

export default {
  name: 'App',
  components: {},
  data() {
    return {
      desktopPath: "",
      config: {
        path: '',
        resolution: '4K',
        controller: 'DS4',
        comboKeys: [],
        sound: 'NS2'
      }
    }
  },
  async mounted() {
    window.electronAPI.onHotkeyTriggered(this.takeScreenshot)
    this.config = await window.electronAPI.readConfig();
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
      this.config.comboKeys.push('L1(LB)')
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
      let success = await window.electronAPI.initDevice()
      if (!success) {
        alert('初始化设备失败 请确保控制已连接')
      }
      return success
    }
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
  padding: 32px;
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
  width: 200px;
  font-weight: 600;
  color: #2d3748;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 10px;
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

@media (max-width: 768px) {
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
}
</style>
