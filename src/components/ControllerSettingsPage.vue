<template>
    <div class="settings-container">
        <div class="settings-content">
            <div class="setting-row">
                <div class="setting-label">
                    <i class="fas fa-gamepad"></i>
                    <span>选择控制器</span>
                    <div class="action-buttons" style="margin-left: 10px; display: inline-flex; gap: 8px;">
                        <button class="btn btn-primary" @click="loadGamePadList">
                            <span>刷新列表</span>
                        </button>
                    </div>
                </div>
                <div class="setting-controls">
                    <select class="form-select" v-model="currentGamePad" @change="onCurrentGameSelectChanged">
                        <option v-for="(value, index) in loadedGamePads" :key="index" :value="value">
                            {{ value.product + ' vid:' + value.vendorId + ' pid:' + value.productId }}</option>
                    </select>
                </div>

            </div>

            <div class="setting-controls buffer-list-container">
                <div class="buffer-table-wrapper">
                    <table class="buffer-table">
                        <thead>
                            <tr>
                                <th class="buffer-index-header col-buffer">
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
                                <td class="buffer-index-cell col-buffer">
                                    <div class="index-content">
                                        <span class="buffer-index">buffer[{{ index }}]</span>
                                    </div>
                                </td>
                                <td v-for="bitPos in 8" :key="bitPos" class="bit-cell"
                                    :class="getBitClass(binaryStr, bitPos)"
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
    </div>
</template>

<script>
let timer;
export default {
    name: 'ControllerSettingsPage',
    components: {

    },
    data() {
        return {
            activeTab: 'home',
            bufferDebugList: [],
            loadedGamePads: [],
            currentGamePad: {}
        }
    },
    async beforeMount() {

    },
    async mounted() {
        this.loadGamePadList()
        await window.electronAPI.onControllerSettingsDeviceError(this.onDeviceError)
    },
    async beforeUnmount() {
        await window.electronAPI.offControllerSettingsDeviceError()
    },
    async unmounted() {

    },
    methods: {
        updateBufferDebug(bufferArray) {
            let m_list = []
            if (!bufferArray) {
                return;
            }
            bufferArray.map((buffer, index) => {
                m_list.push(buffer.toString(2).padStart(8, '0'))
            });
            this.bufferDebugList = m_list;
        },
        getBitValue(binaryStr, bitPos) {
            const index = bitPos - 1;
            return binaryStr[index];
        },
        getBitClass(binaryStr, bitPos) {
            const bitValue = this.getBitValue(binaryStr, bitPos);
            return bitValue === '1' ? 'bit-1' : 'bit-0';
        },
        async loadGamePadList() {
            this.loadedGamePads = await window.electronAPI.getAllGamePad();
            if (this.loadedGamePads.length > 0) {
                this.currentGamePad = this.loadedGamePads[0]
                this.initDevice(this.currentGamePad)
            }
        },
        async initDevice(hidDevice) {
            if (timer) {
                clearInterval(timer)
                timer = null
            }
            if (!hidDevice) return
            console.log(hidDevice)
            let success = await window.electronAPI.initControllerSettingsDevice(hidDevice.vendorId, hidDevice.productId)

            this.deviceOpen = success
            if (!success) {
                alert('初始化设备失败 请确保控制已连接')
            } else {

                timer = setInterval(async () => {
                    this.buffer = await window.electronAPI.getLastControllerSettingUseBuffer()
                    this.updateBufferDebug(this.buffer);
                }, 60);
            }

            return success
        },
        onCurrentGameSelectChanged() {
            this.initDevice(this.currentGamePad)
        },
        onDeviceError() {
            this.loadGamePadList()
            //alert('控制器连接已断开，请确保插上控制器后重启软件')
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
</style>
