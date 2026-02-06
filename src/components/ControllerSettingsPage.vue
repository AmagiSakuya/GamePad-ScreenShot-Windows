<template>
    <div class="settings-container">
        <div class="settings-content">

            <div class="setting-row">
                <div class="setting-label">
                    <i class="fas fa-gamepad"></i>
                    <span>选择控制器</span>
                </div>
                <div class="setting-controls">
                    <select class="form-select" v-model="currentGamePad" @change="onCurrentGameSelectChanged">
                        <option v-for="(value, index) in loadedGamePads" :key="index" :value="value">
                            {{ value.name + ' ( VID:' + value.vendor + ' PID:' + value.product + ' )' }}</option>
                    </select>
                </div>

            </div>

            <div class="setting-row button-preview-row">
                <div class="buttons-grid">
                    <h2>按键状态</h2>
                    <div class="buttons-row">
                        <div class="button-item" v-for="(button, index) in buttonsValuePreview" :key="index">
                            <div v-show="index < deviceInstanceButtonCount" class="button-label">Button{{ index }}</div>
                            <div v-show="index < deviceInstanceButtonCount" class="button-state" :class="button ? 'button-pressed' : 'button-released'"
                                tabindex="0"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>

let rawDevices;
let timer;
export default {
    name: 'ControllerSettingsPage',
    components: {

    },
    data() {
        return {
            activeTab: 'home',
            loadedGamePads: [],
            currentGamePad: {},
            buttonsValuePreview: new Array(20).fill(false),
            deviceInstanceButtonCount:0
        }
    },
    async beforeMount() {

    },
    async mounted() {
        await window.electronAPI.onDeviceChanged(this.onSDL2DeviceChanged)
        await this.loadGamePadList()
        timer = setInterval(this.getCurrentButtonsValue, 60);
    },
    async beforeUnmount() {
        await window.electronAPI.offDeviceChanged()
        await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
        clearInterval(timer)
    },
    async unmounted() {

    },
    methods: {
        async loadGamePadList() {
            rawDevices = await window.electronAPI.getAllGamePad()
            this.loadedGamePads = rawDevices;
            if (this.loadedGamePads.length > 0) {
                this.currentGamePad = this.loadedGamePads[0]
                this.initDevice(rawDevices[0])
            }
        },
        async initDevice(hidDevice) {
            let success = await window.electronAPI.openSdl2Device(hidDevice)
            let num = 0;
            if (!success) {
                alert('打开控制器失败')
            } else {
                num = await window.electronAPI.getDeviceInstanceButtonNumber();
            }
            this.deviceInstanceButtonCount = num;
        },
        async onSDL2DeviceChanged() {
            await this.loadGamePadList();
        },
        async onCurrentGameSelectChanged() {
            await window.electronAPI.removeSdl2DeviceInstanceAllListeners()
            let m_device = rawDevices[this.currentGamePad._index]
            await this.initDevice(m_device)
        },
        async getCurrentButtonsValue() {
            this.buttonsValuePreview = await window.electronAPI.getCurrentButtonsValue()
        }
    }
}
</script>

<style>
.buffer-debug-container {
    border-top: 1px solid #e0e0e0;
    padding-top: 15px;
    margin-top: 10px;
}

.buffer-list-container {
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

.buttons-grid {
    flex: 1;
    min-width: 300px;
    max-width: 800px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 15px;
    padding: 25px;
    /* box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3); */
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 690px;
}

.buttons-row {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 32px;
    margin-bottom: 15px;
}

.button-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 80px;
}

.button-label {
    font-size: 0.85rem;
    margin-bottom: 8px;
    color: #ccc;
    text-align: center;
    min-height: 30px;
    display: flex;
    align-items: center;
}

.button-state {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.3rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    user-select: none;
}

.button-pressed {
    background: linear-gradient(145deg, #a8e6cf, #7ed9b2);
    color: #1b4332;
    box-shadow: 0 8px 20px rgba(168, 230, 207, 0.3);
    border: 2px solid #a8e6cf;
}

.button-released {
    background: linear-gradient(145deg, #f5f5f5, #e0e0e0);
    color: #616161;
    border: 2px solid #e0e0e0;
}
.button-preview-row{
    align-items: center;
}
</style>
