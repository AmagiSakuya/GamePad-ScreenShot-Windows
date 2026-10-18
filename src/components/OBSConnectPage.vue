<template>
  <div class="obs-body">
    <template v-if="!isConnected">
      <label class="obs-field">
        <span>{{ $t('OBSPage.obsAddress') }}</span>
        <input class="ui-input mono" type="text" placeholder="ws://127.0.0.1:4455" v-model="obsConfig.server">
      </label>
      <label class="obs-field">
        <span>{{ $t('OBSPage.obsPassword') }}</span>
        <input class="ui-input mono" type="password" placeholder="••••••" v-model="obsConfig.pwd">
      </label>
      <div class="obs-actions">
        <button class="ui-btn primary obs-connect" @click="connectOBS">
          <AppIcon name="link" :size="13" />{{ $t('OBSPage.connectService') }}
        </button>
      </div>
    </template>

    <template v-else>
      <label class="obs-field">
        <span>{{ $t('OBSPage.selectScene') }}</span>
        <select class="ui-select" v-model="selectedScene">
          <option v-for="(value, index) in sceneList" :key="index" :value="value">{{ value.sceneName }}</option>
        </select>
      </label>
      <div class="obs-actions between">
        <span class="ui-chip obs-ok">
          <AppIcon name="check" :size="11" />{{ $t('OBSPage.obsStatusConnected') }}
        </span>
        <button class="ui-btn danger obs-connect" @click="disconnectOBS">{{ $t('OBSPage.disconnect') }}</button>
      </div>
    </template>
  </div>
</template>

<script>
import { OBSWebSocket } from 'obs-websocket-js';
import AppIcon from '@/components/AppIcon.vue';
const obs = new OBSWebSocket();
const STORAGE_KEY = 'obs_config_data';
// OBS 连接是模块级单例，组件随「截图方式」切换而反复挂载/卸载，
// 这里把连接状态保存在模块作用域，避免重新挂载后误显示为「未连接」。
let persistentConnected = false;

export default {
  name: 'OBSConnectPage',
  components: { AppIcon },
  props: {
    windowsNotify: {
      type: Function,
      default: null
    }
  },
  data() {
    return {
      obsConfig: {
        server: "ws://127.0.0.1:4455",
        pwd: ""
      },
      isConnected: persistentConnected,
      screenshotableSources: [],
      sceneList: [],
      selectedScene: void 0
    }
  },
  beforeMount() {
    this.onConnectionClosed = () => {
      persistentConnected = false;
      this.isConnected = false;
    };

    this.onConnectionError = (error) => {
      if (this.windowsNotify) {
        this.windowsNotify(this.$t('OBSPage.obsNotConnected'))
      }
      console.error('WebSocket error:', error.message);
      persistentConnected = false;
      this.isConnected = false
    };

    obs.on('ConnectionClosed', this.onConnectionClosed);
    obs.on('ConnectionError', this.onConnectionError);
  },
  async mounted() {
    await this.loadConfig();
    if (persistentConnected) {
      await this.refreshList();
    }
  },
  beforeUnmount() {
    // 只解绑本组件的事件，OBS 连接本身保留，切回 OBS 截图方式时可直接复用
    obs.off('ConnectionClosed', this.onConnectionClosed);
    obs.off('ConnectionError', this.onConnectionError);
  },
  methods: {
    async connectOBS() {
      try {
        await obs.connect(this.obsConfig.server, this.obsConfig.pwd);
        persistentConnected = true
        this.isConnected = true
        await this.saveConfig()
        await this.refreshList();
      } catch (error) {
        this.isConnected = false
      }
    },
    async refreshList() {
      this.sceneList = await this.getSceneList();
      this.screenshotableSources = await this.getScreenshotableSources();
      if (this.sceneList.length > 0 && !this.sceneList.some(scene => scene.sceneName === this.selectedScene?.sceneName)) {
        this.selectedScene = this.sceneList[0]
      }
    },
    async disconnectOBS() {
      await obs.disconnect();
      persistentConnected = false;
      this.isConnected = false;
    },
    async getSceneName() {
      const { currentProgramSceneName } = await obs.call('GetSceneList');
      return currentProgramSceneName
    },
    async takeScreenshot(config) {
      if (!this.isConnected) {
        this.windowsNotify(this.$t('OBSPage.obsNotConnected'))
        return
      }

      // OBS 不会替桌面截图流程兜底创建目录，保存前统一确保目标目录存在。
      const folderReady = await window.electronAPI.ensureFolder(config && config.path);
      if (!folderReady) {
        this.windowsNotify(this.$t('OBSPage.obsScreenshotError') + '保存目录无法创建');
        return;
      }

      let filepath = await window.electronAPI.fileConflictHandle(config);

      if (filepath == null) {
        return;
      }

      let finalSceneName;
      if (this.selectedScene == void 0 || this.selectedScene.sceneName == '') {
        this.windowsNotify(this.$t('OBSPage.invalidSceneSelected'))
        return
      }
      finalSceneName = this.selectedScene.sceneName;

      try {
        let videoSettings = await obs.call('GetVideoSettings');
        let { baseWidth, baseHeight } = videoSettings;

        await obs.call('SaveSourceScreenshot', {
          sourceName: finalSceneName,
          imageFormat: config.imageFormat,
          imageFilePath: filepath,
          imageWidth: baseWidth,
          imageHeight: baseHeight,
          imageCompressionQuality: -1
        });

        return filepath;
      } catch (error) {
        this.windowsNotify(this.$t('OBSPage.obsScreenshotError') + error.message)
        console.error('OBS screenshot failed:', error.code, error.message);
      }
    },
    async saveReplayBuffer(config) {
      if (!this.isConnected) {
        this.windowsNotify(this.$t('OBSPage.obsNotConnected'))
        return;
      }

      try {
        const folderReady = await window.electronAPI.ensureFolder(config && config.path);
        if (!folderReady) {
          throw new Error('保存目录无法创建');
        }

        const { outputActive } = await obs.call('GetReplayBufferStatus');
        if (!outputActive) {
          this.windowsNotify(this.$t('OBSPage.replayBufferNotActive'));
          return;
        }

        const { outputs } = await obs.call('GetOutputList');
        const replayBufferOutput = outputs.find(output => output.outputKind === 'replay_buffer');
        if (!replayBufferOutput) {
          throw new Error('Replay buffer output was not found');
        }

        const outputName = replayBufferOutput.outputName;
        const { outputSettings: originalOutputSettings } = await obs.call('GetOutputSettings', { outputName });

        try {
          // 活动中的回放缓存会锁定启动时的 profile 值，这里直接改 output 自身，
          // 保证本次保存使用当前配置的目录与文件名。
          await obs.call('SetOutputSettings', {
            outputName,
            outputSettings: {
              ...originalOutputSettings,
              directory: config.path,
              format: config.calcedFileName
            }
          });
          const replaySaveWaiter = this.createReplayBufferSavedWaiter();
          try {
            await obs.call('SaveReplayBuffer');
            await replaySaveWaiter.promise;
            return true;
          } finally {
            replaySaveWaiter.cancel();
          }
        } finally {
          await obs.call('SetOutputSettings', { outputName, outputSettings: originalOutputSettings });
        }
      } catch (error) {
        this.windowsNotify(this.$t('OBSPage.replayBufferError') + error.message);
        console.error('Failed to save OBS replay buffer:', error);
        return false;
      }
    },
    createReplayBufferSavedWaiter() {
      let timeout;
      let onReplaySaved;
      const cancel = () => {
        clearTimeout(timeout);
        obs.off('ReplayBufferSaved', onReplaySaved);
      };
      const promise = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          cancel();
          reject(new Error('Timed out waiting for the replay buffer to save'));
        }, 10000);
        onReplaySaved = () => {
          cancel();
          resolve();
        };
        obs.on('ReplayBufferSaved', onReplaySaved);
      });
      return { promise, cancel };
    },
    async saveConfig() {
      const configStr = JSON.stringify(this.obsConfig);
      await window.electronAPI.setStore(STORAGE_KEY, configStr);
    },
    async loadConfig() {
      const savedConfig = await window.electronAPI.getStore(STORAGE_KEY, void 0);
      if (savedConfig) {
        this.obsConfig = JSON.parse(savedConfig);
      }
    },
    async getSceneList() {
      let scenesResponse = await obs.call('GetSceneList');
      return scenesResponse.scenes;
    },
    async getScreenshotableSources() {
      const { inputs } = await obs.call('GetInputList');
      const visualInputs = inputs.filter(input => {
        const kind = input.inputKind;
        return !kind.includes('audio') && !kind.includes('wasapi');
      });
      return visualInputs
    },
    async getSourceOriginalSize(sceneName, sourceName) {
      const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
      const item = sceneItems.find(i => i.sourceName === sourceName);

      if (!item) throw new Error('在该场景中找不到指定的源');

      const { sceneItemTransform } = await obs.call('GetSceneItemTransform', {
        sceneName: sceneName,
        sceneItemId: item.sceneItemId
      });

      return {
        width: sceneItemTransform.sourceWidth,
        height: sceneItemTransform.sourceHeight
      };
    }
  }
}
</script>

<style scoped>
/* 一行一个字段：左侧标签固定宽度，右侧输入框占满剩余宽度 */
.obs-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.obs-field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.obs-field span {
  flex: 0 0 auto;
  width: 96px;
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.obs-field .ui-input,
.obs-field .ui-select {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  height: 36px;
  font-size: 12px;
}

.obs-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 2px;
}

.obs-actions.between {
  justify-content: space-between;
}

/* 连接 / 断开按钮不参与字段布局，单独占一行 */
.obs-connect {
  min-width: 148px;
  height: 34px;
  padding: 0 18px;
}

.obs-ok {
  height: 28px;
}
</style>
