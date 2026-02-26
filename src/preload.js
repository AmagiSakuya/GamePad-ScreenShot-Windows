const { contextBridge, ipcRenderer, desktopCapturer, clipboard, nativeImage } = require('electron')
const { resolutionEnum , ScreenShotSaveWayEnum } = require('../src/lib/enum')
const fs = require('fs')
const path = require('path')
const os = require('os')
let filenameConflictResolutionKey = 'filenameConflictResolution';

// 1. 加载语言包
const messages = {
  zh: require('./locales/zh.json'),
  en: require('./locales/en.json')
};

// 2. 模拟 $t 函数
function $t(key, locale = 'zh') {
  // 支持 "menu.file.save" 这种嵌套路径
  return key.split('.').reduce((obj, i) => (obj ? obj[i] : null), messages[locale]) || key;
}

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

        let filePath = null;
         const img = sources[0].thumbnail

            let buffer;
            switch (config.imageFormat) {
                case 'jpg':
                    buffer = img.toJPEG(100)
                    break
                case 'png':
                    buffer = img.toPNG()
                    break
            }

        if (config.screenShotSaveWay != ScreenShotSaveWayEnum.CilpboardOnly) {
            filePath = path.join(config.path, `${config.calcedFileName}.${config.imageFormat}`)
            
            if (fs.existsSync(filePath)) {
                let filenameConflictResolution = await ipcRenderer.invoke('get-store', filenameConflictResolutionKey, 'overwrite');
                if (filenameConflictResolution === 'appendTimestamp') {
                    const timestamp = Date.now();
                    filePath = path.join(config.path, `${config.calcedFileName}_${timestamp}.${config.imageFormat}`)
                }else if (filenameConflictResolution === 'notSave') {
                    return null;
                }else if (filenameConflictResolution === 'askEveryTime') {
                    let res = await ipcRenderer.invoke('show-confirm-messageBox', $t('SystemSettingsPage.overwriteConfirm.title'), $t('SystemSettingsPage.overwriteConfirm.message'), filePath, [$t('SystemSettingsPage.overwriteConfirm.confirmButton'), $t('SystemSettingsPage.overwriteConfirm.cancelButton')]);
                    if (!res) {
                        return null;
                    }
                }
            } 
           
            fs.writeFileSync(filePath, buffer)
        }

        if (config.screenShotSaveWay != ScreenShotSaveWayEnum.FileOnly) {
            const image = nativeImage.createFromBuffer(buffer);
            clipboard.writeImage(image);
        }

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
    setStore: (key, value) => ipcRenderer.invoke('set-store', key, value),
    getStore: (key, defaultValue) => ipcRenderer.invoke('get-store', key, defaultValue)
})