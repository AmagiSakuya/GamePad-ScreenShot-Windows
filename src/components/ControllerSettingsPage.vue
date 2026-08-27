<template>
    <div class="controller-settings-container">
        <div class="controller-settings-scroll">
            <div class="controller-settings-content">
                <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-gamepad"></i>
                        <span>{{ $t('GampadTesterPage.selectController') }}</span>
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
                        <h2>{{ $t('GampadTesterPage.buttonState') }}</h2>
                        <div class="buttons-row">
                            <div class="button-item" v-for="(button, index) in buttonsValuePreview" :key="'btn' + index">
                                <div v-show="index < deviceInstanceButtonCount" class="button-label">Button{{ index }}</div>
                                <div v-show="index < deviceInstanceButtonCount" class="button-state"
                                    :class="button ? 'button-pressed' : 'button-released'" tabindex="0"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="setting-row button-preview-row" v-if="deviceInstanceAxisCount > 0">
                    <div class="buttons-grid">
                        <h2>{{ $t('GampadTesterPage.axisState') }}</h2>
                        <div class="axes-container">
                            <div class="axis-card" v-for="(axisVal, index) in axesValuePreview" :key="'axis' + index">
                                <div class="axis-header">
                                    <span class="axis-title">Axis {{ index }}</span>
                                    <span class="axis-val-badge">{{ formatAxisVal(axisVal) }}</span>
                                </div>
                                <div class="axis-controls">
                                    <div class="axis-dir-badge" :class="axisVal <= -0.85 ? 'axis-active' : 'axis-inactive'">
                                        Axis{{ index }}-
                                    </div>
                                    <div class="axis-track">
                                        <div class="axis-center-mark"></div>
                                        <div class="axis-thumb" :style="{ left: ((Math.max(-1, Math.min(1, axisVal || 0)) + 1) / 2 * 100) + '%' }"></div>
                                    </div>
                                    <div class="axis-dir-badge" :class="axisVal >= 0.85 ? 'axis-active' : 'axis-inactive'">
                                        Axis{{ index }}+
                                    </div>
                                </div>
                            </div>
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
            axesValuePreview: [],
            deviceInstanceButtonCount: 0,
            deviceInstanceAxisCount: 0
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
            let btnNum = 0;
            let axisNum = 0;
            if (!success) {
                alert(this.$t('alertMsg.openGamepadFail'))
            } else {
                btnNum = await window.electronAPI.getDeviceInstanceButtonNumber();
                axisNum = await window.electronAPI.getDeviceInstanceAxisNumber();
            }
            this.deviceInstanceButtonCount = btnNum;
            this.deviceInstanceAxisCount = axisNum;
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
            this.buttonsValuePreview = this.buttonsValuePreview.slice(0, this.deviceInstanceButtonCount);
            let axes = await window.electronAPI.getCurrentAxesValue()
            this.axesValuePreview = (axes || []).slice(0, this.deviceInstanceAxisCount);
        },
        formatAxisVal(val) {
            if (val === undefined || val === null || isNaN(val)) return '0.00';
            return (val >= 0 ? '+' : '') + Number(val).toFixed(2);
        }
    }
}
</script>
<style>
.controller-settings-container {
    background-color: white;
    box-shadow: 0 10px 30px rgb(0 0 0 / 10%);
    width: 100%;
    height: 100%;
    max-height: 100%;
    transition: transform 0.3s ease;
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    overflow: hidden;
}

.controller-settings-scroll {
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
    width: 100%;
    flex: 1;
    min-height: 0;
}

.controller-settings-content {
    padding: 0 32px 32px 32px;
    height: auto;
    min-height: 100%;
}

.buttons-grid {
    flex: 1;
    min-width: 300px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 16px 0px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    max-width: 690px;
    width: 100%;
}

.buttons-grid h2 {
    font-size: 1.1rem;
    margin-bottom: 12px;
}

.buttons-row {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 8px;
}

.button-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 56px;
}

.button-label {
    font-size: 0.75rem;
    margin-bottom: 4px;
    color: #ccc;
    text-align: center;
    min-height: 18px;
    display: flex;
    align-items: center;
}

.button-state {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
    user-select: none;
}

.button-pressed {
    background: linear-gradient(145deg, #a8e6cf, #7ed9b2);
    color: #1b4332;
    box-shadow: 0 4px 12px rgba(168, 230, 207, 0.3);
    border: 2px solid #a8e6cf;
}

.button-released {
    background: linear-gradient(145deg, #f5f5f5, #e0e0e0);
    color: #616161;
    border: 2px solid #e0e0e0;
}

.button-preview-row {
    align-items: center;
}

.axes-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(max(130px, calc((100% - 36px) / 4)), 1fr));
    gap: 12px;
    width: 100%;
    margin-top: 15px;
}

@media (max-width: 600px) {
    .axes-container {
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    }
}

.axis-card {
    background: rgba(0, 0, 0, 0.03);
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-sizing: border-box;
}

.axis-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.axis-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: #2d3748;
}

.axis-val-badge {
    font-family: monospace;
    font-size: 0.75rem;
    padding: 1px 6px;
    background: #edf2f7;
    border-radius: 4px;
    color: #4a5568;
}

.axis-controls {
    display: flex;
    align-items: center;
    gap: 6px;
}

.axis-dir-badge {
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.72rem;
    font-weight: bold;
    min-width: 48px;
    text-align: center;
    transition: all 0.2s ease;
    user-select: none;
    white-space: nowrap;
}

.axis-active {
    background: linear-gradient(145deg, #a8e6cf, #7ed9b2);
    color: #1b4332;
    box-shadow: 0 3px 8px rgba(168, 230, 207, 0.4);
    border: 1px solid #7ed9b2;
}

.axis-inactive {
    background: #edf2f7;
    color: #718096;
    border: 1px solid #e2e8f0;
}

.axis-track {
    flex: 1;
    position: relative;
    height: 6px;
    min-width: 20px;
    background: #e2e8f0;
    border-radius: 3px;
}

.axis-center-mark {
    position: absolute;
    left: 50%;
    top: -2px;
    width: 2px;
    height: 10px;
    background: #a0aec0;
    transform: translateX(-50%);
}

.axis-thumb {
    position: absolute;
    top: -4px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #4b6cb7;
    transform: translateX(-50%);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: left 0.05s ease-out;
}
</style>
