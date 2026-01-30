<template>
    <div class="settings-container">
        <div class="settings-content">
            <!-- 服务器地址 -->
            <div v-show="!isConnected" class="setting-row">
                <div class="setting-label">
                    <i class="fas fa-folder-open"></i>
                    <span>OBS服务连接地址</span>
                </div>
                <div class="setting-controls">
                    <div class="input-wrapper">
                        <input type="text" class="form-input" placeholder="ws://127.0.0.1:4455"
                            v-model="obsConfig.server">
                    </div>
                </div>
            </div>

            <!-- 服务器密码 -->
            <div v-show="!isConnected" class="setting-row">
                <div class="setting-label">
                    <i class="fas fa-folder-open"></i>
                    <span>OBS服务连接密码</span>
                </div>
                <div class="setting-controls">
                    <div class="input-wrapper">
                        <input type="text" class="form-input" placeholder="" v-model="obsConfig.pwd">
                    </div>
                </div>
            </div>

            <!-- <div v-show="isConnected" class="setting-row">
                <div class="setting-label">
                    <i class="fas fa-expand-alt"></i>
                    <span>截图来源</span>
                </div>
                <div class="setting-controls">
                    <select class="form-select" v-model="obsConfig.sourceFromScene">
                        <option :value="true">场景</option>
                        <option :value="false">源</option>
                    </select>
                </div>
            </div> -->

            <div v-show="isConnected" class="setting-row" @change="refreshList">
                <div class="setting-label">
                    <i class="fas fa-expand-alt"></i>
                    <span>选择场景</span>
                </div>
                <div class="setting-controls">
                    <select class="form-select" v-model="selectedScene">
                        <option v-for="(value, index) in sceneList" :key="index" :value="value">{{ value.sceneName }}
                        </option>
                    </select>
                </div>
            </div>


            <!-- <div v-show="isConnected && !obsConfig.sourceFromScene" class="setting-row">
                <div class="setting-label">
                    <i class="fas fa-expand-alt"></i>
                    <span>选择源</span>
                </div>
                <div class="setting-controls">
                    <select class="form-select" v-model="selectedSource">
                        <option v-for="(value, index) in screenshotableSources" :key="index" :value="value">{{
                            value.inputName }}</option>
                    </select>
                </div>
            </div> -->


            <button v-if="!isConnected" class="save-button" @click="connectOBS">
                <span>连接服务</span>
            </button>

            <button v-if="isConnected" class="save-button" @click="disconnectOBS">
                <span>断开连接</span>
            </button>
        </div>
    </div>
</template>

<script>
import { OBSWebSocket } from 'obs-websocket-js';
const obs = new OBSWebSocket();
const STORAGE_KEY = 'obs_config_data';
const { screenshotSoundEnum } = require('@/lib/enum')
export default {
    name: 'OBSConnectPage',
    components: {

    },
    data() {
        return {
            obsConfig: {
                server: "ws://127.0.0.1:4455",
                pwd: ""
            },
            isConnected: false,
            screenshotableSources: [],
            sceneList: [],
            selectedScene: void 0,
            selectedSource: void 0
        }
    },
    async beforeMount() {
        // 连接断开
        obs.on('ConnectionClosed', (error) => {
            console.log('🔌 连接已断开');
            this.isConnected = false
        });

        // 连接过程中的底层错误
        obs.on('ConnectionError', (error) => {
            alert('未找到OBS Websocket服务')
            console.error('❌ WebSocket 底层发生错误:', error.message);
            this.isConnected = false
        });
    },
    async mounted() {
        this.loadConfig();
    },
    unmounted() {

    },
    methods: {
        async connectOBS() {
            try {
                await obs.connect(this.obsConfig.server, this.obsConfig.pwd);
                console.log('✅ 已成功连接到 OBS');
                this.isConnected = true
                this.saveConfig()
                this.refreshList();
            } catch (error) {
                this.isConnected = false
            }
        },
        async refreshList() {
            this.sceneList = await this.getSceneList();
            this.screenshotableSources = await this.getScreenshotableSources();
            if (this.sceneList.length > 0) {
                this.selectedScene = this.sceneList[0]
            }
            if (this.screenshotableSources.length > 0) {
                this.selectedSource = this.screenshotableSources[0]
            }
        },
        async disconnectOBS() {
            await obs.disconnect();
            console.log('✅ 已成功断开连接');
        },
        async getSceneName() {
            const { currentProgramSceneName } = await obs.call('GetSceneList');
            return currentProgramSceneName
        },
        async takeScreenshot(config) {
            if (!this.isConnected) {
                alert('尚未连接OBS')
                return
            }
            let filepath = `${config.path}\\Screenshot_${Date.now()}.png`;
            let finalSceneName;
            if (this.selectedScene == void 0 || this.selectedScene.sceneName == '') {
                alert('没有选择正确的场景')
                return
            }
            finalSceneName = this.selectedScene.sceneName;
            console.log(finalSceneName);
            try {
                let videoSettings = await obs.call('GetVideoSettings');
                let { baseWidth, baseHeight } = videoSettings;

                let response = await obs.call('SaveSourceScreenshot', {
                    sourceName: finalSceneName,          // 你想要截图的源名称或场景名称
                    imageFormat: 'png',              // 图片格式: jpg, png, bmp etc.
                    imageFilePath: filepath, // 保存的绝对路径 (注意权限)
                    imageWidth: baseWidth,                // 可选：缩放宽度
                    imageHeight: baseHeight,               // 可选：缩放高度
                    imageCompressionQuality: -1      // 可选：压缩质量 (JPEG 为 1-100, PNG 为 0-9)
                });
                if (config.sound != screenshotSoundEnum.None) {
                    window.electronAPI.playScreenshotSound()
                }

                //console.log('📸 截图已保存:', response.imageFilePath);
            } catch (error) {
                alert('OBS截图出错' + error.message)
                console.error('❌ 出错啦:', error.code, error.message);
            }
        },
        saveConfig() {
            const configStr = JSON.stringify(this.obsConfig);
            localStorage.setItem(STORAGE_KEY, configStr);
        },
        loadConfig() {
            const savedConfig = localStorage.getItem(STORAGE_KEY);
            if (savedConfig) {
                this.obsConfig = JSON.parse(savedConfig);
            }
        },
        async getSceneList() {
            let scenesResponse = await obs.call('GetSceneList');
            //console.log(scenesResponse.scenes);
            return scenesResponse.scenes; // 这是一个包含场景名称和索引的数组

        },
        async getScreenshotableSources() {
            const { inputs } = await obs.call('GetInputList');
            const visualInputs = inputs.filter(input => {
                const kind = input.inputKind;
                return !kind.includes('audio') && !kind.includes('wasapi');
            });
            //console.log(visualInputs);
            return visualInputs
        },
        async getSourceOriginalSize(sceneName, sourceName) {
            // 1. 首先需要通过场景名和源名获取该源的 SceneItemId
            const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
            const item = sceneItems.find(i => i.sourceName === sourceName);

            if (!item) throw new Error('在该场景中找不到指定的源');

            // 2. 获取该 SceneItem 的详细变换信息
            const { sceneItemTransform } = await obs.call('GetSceneItemTransform', {
                sceneName: sceneName,
                sceneItemId: item.sceneItemId
            });

            // 这里的 sourceWidth/Height 就是该源未经缩放的原始尺寸
            return {
                width: sceneItemTransform.sourceWidth,
                height: sceneItemTransform.sourceHeight
            };
        }
    }
}
</script>

<style></style>
