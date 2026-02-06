const { contextBridge, ipcRenderer, desktopCapturer, clipboard } = require('electron')
const { resolutionEnum } = require('../src/lib/enum')
const fs = require('fs')
const path = require('path')
const os = require('os')

contextBridge.exposeInMainWorld('electronAPI', {
    screenShot: async (config) => {
        var sizeArr = [{ width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]
        var size
        switch (config.resolution) {
            case resolutionEnum.R_1080P:
                size = sizeArr[0]
                break

            case resolutionEnum.R_2K:
                size = sizeArr[1]
                break

            case resolutionEnum.R_4K:
                size = sizeArr[2]
                break

            default:
                size = sizeArr[0]
        }

        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: size
        })

        const img = sources[0].thumbnail
        const buffer = img.toJPEG(100)

        const filePath = path.join(
            config.path,
            `Screenshot_${Date.now()}.jpg`
        )

        fs.writeFileSync(filePath, buffer)

        return filePath
    },
    onHotkeyTriggered: (callback) => {
        ipcRenderer.on('hotkey-triggered', callback)
    },
    offHotkeyTriggered: () => {
        ipcRenderer.removeAllListeners('hotkey-triggered')
    },
    onDeviceChanged: (callback) => {
        ipcRenderer.on('device-changed', callback)
    },
    offDeviceChanged: () => {
        ipcRenderer.removeAllListeners('device-changed')
    },
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    copyText: (text) => clipboard.writeText(text),
    getAllGamePad: () => ipcRenderer.invoke('get-all-gamepad'),
    openSdl2Device: (device) => ipcRenderer.invoke('open-sdl2-device', device),
    removeSdl2DeviceInstanceAllListeners: () => ipcRenderer.invoke('remove-sdl2-device-instance-all-listeners'),
    getCurrentButtonsValue: () => ipcRenderer.invoke('get-current-buttons-value'),
    getDeviceInstanceButtonNumber: () => ipcRenderer.invoke('get-device-instance-button-number'),
})