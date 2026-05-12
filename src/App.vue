<template>
  <div class="app-container">
    <!-- Tab 导航 -->
    <div class="tabs-header">
      <button class="tab-btn" :class="{ active: activeTab === 'home' }" @click="activeTab = 'home'">
        <i class="fas fa-home"></i>
        <span>{{ $t('screenshotSettings') }}</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'obs' }" @click="activeTab = 'obs'">
        <i class="fas fa-obs"></i>
        <span>{{ $t('obsConnect') }}</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'debug' }" @click="activeTab = 'debug'">
        <i class="fas fa-bug"></i>
        <span>{{ $t('gamepadTester') }}</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'system' }" @click="activeTab = 'system'">
        <i class="fas fa-system"></i>
        <span>{{ $t('systemSettings') }}</span>
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="tab-content">
      <!-- 首页内容 -->
      <div v-if="activeTab === 'home'" class="tab-pane">
        <MainPage ref="mainPageRef" :compOBS="obsPageInstance" :windowsNotify="windowsNotify"></MainPage>
      </div>

      <!-- OBS连接 -->
      <div v-show="activeTab === 'obs'" class="tab-pane">
        <OBSConnectPage ref="obsPageRef" :compMain="mainPageInstance" :windowsNotify="windowsNotify"></OBSConnectPage>
      </div>

      <!-- Debug 页面内容 -->
      <div v-if="activeTab === 'debug'" class="tab-pane">
        <ControllerSettingsPage></ControllerSettingsPage>
      </div>

      <!-- 系统设置 -->
      <div v-show="activeTab === 'system'" class="tab-pane">
        <SystemSettingsPage :windowsNotify="windowsNotify"></SystemSettingsPage>
      </div>

    </div>
  </div>
</template>

<script>
import MainPage from '@/components/MainPage.vue'
import ControllerSettingsPage from '@/components/ControllerSettingsPage.vue'
import OBSConnectPage from '@/components/OBSConnectPage.vue'
import SystemSettingsPage from '@/components/SystemSettingsPage.vue'

import { ref } from 'vue';

export default {
  name: 'App',
  components: {
    MainPage,
    OBSConnectPage,
    ControllerSettingsPage,
    SystemSettingsPage
  },
  data() {
    return {
      activeTab: 'home',
      obsPageInstance: null,
      mainPageInstance: null,
      traySyncTimer: null,
      currentTrayListening: false
    }
  },
  async beforeMount() {

  },
  async mounted() {
    this.obsPageInstance = this.$refs.obsPageRef;
    this.mainPageInstance = this.$refs.mainPageRef;
    this.startTraySync();
    // 检查是否启用启动时更新检测
    try {
      const checkUpdateOnStartup = await window.electronAPI.getStore('checkUpdateOnStartup', 'disabled');
      if (checkUpdateOnStartup === 'enabled') {
        // 延迟一下再检测，避免影响应用启动
        setTimeout(async () => {
          try {
            const result = await window.electronAPI.checkForUpdates();
            if (result.hasUpdate) {
              // 自动打开浏览器进入发布页面
              await window.electronAPI.openReleasePage(result.releaseUrl);
              this.windowsNotify(`${this.$t('SystemSettingsPage.updateAvailable')}: ${result.latestVersion}`);
            }
          } catch (error) {
            console.error('Startup update check failed:', error);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to check startup update setting:', error);
    }
  },
  unmounted() {
    if (this.traySyncTimer) {
      clearInterval(this.traySyncTimer);
      this.traySyncTimer = null;
    }
  },
  methods: {
    startTraySync() {
      const syncTrayState = () => {
        const listening = this.$refs['mainPageRef'] == void 0 ? false : this.$refs['mainPageRef'].listening
        if (listening !== this.currentTrayListening) {
          this.currentTrayListening = listening;
          window.electronAPI.updateTrayIcon(listening);
          window.electronAPI.updateTrayListeningState(listening);
        }
      };

      syncTrayState();
      this.traySyncTimer = setInterval(syncTrayState, 300);
    },
    windowsNotify(message) {
      new Notification('', {
        body: message
      })
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
  height: 100%;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

html {
  height: 100%;
  margin: 0;
  /* 顺便去掉 body 默认的外边距 */
}

body {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  margin: 0;
  overflow: hidden;
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

thead,
tbody tr {
  display: table;
  width: 100%;
  table-layout: fixed;
}

tbody {
  display: block;
  max-height: 600px;
  /* 设置tbody的最大高度 */
  /* overflow-y: auto; */
  /* 垂直滚动条 */
  overflow-x: hidden;
}

.tabs-header {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  padding: 0 20px;
  height: 45px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  font-size: 14px;
  color: #6c757d;
  transition: all 0.3s ease;
}

.tab-btn:hover {
  color: #495057;
  background: #e9ecef;
}

.tab-btn.active {
  color: #007bff;
  border-bottom-color: #007bff;
  background: white;
  font-weight: 500;
}

.tab-content {
  background: white;
  height: calc(100% - 45px);
}

.tab-pane {
  /* padding: 20px; */
  height: 100%;
}

.app-container {
  height: 100%;
}
</style>
