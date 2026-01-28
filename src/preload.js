const { contextBridge, ipcRenderer, desktopCapturer, clipboard } = require('electron')
const { resolutionEnum } = require('../src/lib/enum')
const fs = require('fs')
const path = require('path')
const os = require('os')

contextBridge.exposeInMainWorld('electronAPI', {
    screenShot: async () => {
        const config = await ipcRenderer.invoke('read-config')
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
    offHotkeyTriggered: (callback) => {
        ipcRenderer.removeListener('hotkey-triggered', callback)
    },
    onScreenShotDeviceError: (callback) => {
        ipcRenderer.on('screenshot-device-err', callback)
    },
    offScreenShotDeviceError: (callback) => {
        ipcRenderer.removeListener('screenshot-device-err', callback)
    },
    onControllerSettingsDeviceError: (callback) => {
        ipcRenderer.on('controller-settings-device-err', callback)
    },
    offControllerSettingsDeviceError: (callback) => {
        ipcRenderer.removeListener('controller-settings-device-err', callback)
    },
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    readConfig: () => ipcRenderer.invoke('read-config'),
    saveConfig: (data) => ipcRenderer.invoke('save-config', data),
    initDevice: () => ipcRenderer.invoke('init-device'),
    getLastBuffer: () => ipcRenderer.invoke('get-last-buffer'),
    copyText: (text) => clipboard.writeText(text),
    getControllerConfig: () => ipcRenderer.invoke('read-controller-config'),
    getAllGamePad: () => ipcRenderer.invoke('get-all-gamepad'),
    getLastControllerSettingUseBuffer: () => ipcRenderer.invoke('get-last-controller-settings-buffer'),
    initControllerSettingsDevice: (vid, pid) => ipcRenderer.invoke('init-controller-settings-device', vid, pid),
    setScreenShotTrigger: (active) => ipcRenderer.invoke('set-screenshot-triggert', active)
})