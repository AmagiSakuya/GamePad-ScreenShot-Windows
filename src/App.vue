<template>
  <div class="app-container">
    <!-- Tab 导航 -->
    <div class="tabs-header">
      <button class="tab-btn" :class="{ active: activeTab === 'home' }" @click="activeTab = 'home'">
        <i class="fas fa-home"></i>
        <span>截图设置</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'obs' }" @click="activeTab = 'obs'">
        <i class="fas fa-obs"></i>
        <span>OBS连接</span>
      </button>

      <button class="tab-btn" :class="{ active: activeTab === 'debug' }" @click="activeTab = 'debug'">
        <i class="fas fa-bug"></i>
        <span>控制器调试工具</span>
      </button>
    </div>

    <!-- Tab 内容 -->
    <div class="tab-content">
      <!-- 首页内容 -->
      <div v-if="activeTab === 'home'" class="tab-pane">
        <MainPage ref="mainPageRef" :compOBS="obsPageInstance" ></MainPage>
      </div>

      <!-- OBS连接 -->
      <div v-show="activeTab === 'obs'" class="tab-pane">
        <OBSConnectPage ref="obsPageRef"></OBSConnectPage>
      </div>

      <!-- Debug 页面内容 -->
      <div v-if="activeTab === 'debug'" class="tab-pane">
        <ControllerSettingsPage></ControllerSettingsPage>
      </div>
    </div>
  </div>
</template>

<script>
import MainPage from '@/components/MainPage.vue'
import ControllerSettingsPage from '@/components/ControllerSettingsPage.vue'
import OBSConnectPage from '@/components/OBSConnectPage.vue'
import { ref } from 'vue';

export default {
  name: 'App',
  components: {
    MainPage,
    OBSConnectPage,
    ControllerSettingsPage
  },
  data() {
    return {
      activeTab: 'home',
      obsPageInstance:null
    }
  },
  async beforeMount() {

  },
  async mounted() {
    this.obsPageInstance = this.$refs.obsPageRef;
  },
  unmounted() {

  },
  methods: {

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
  overflow-y: auto;
  /* 垂直滚动条 */
  overflow-x: hidden;
}

.tabs-header {
  display: flex;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  padding: 0 20px;
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
  flex: 1;
  overflow: auto;
  background: white;
}

.tab-pane {
  padding: 20px;
  height: 100%;
}
</style>
