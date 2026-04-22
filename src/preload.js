const { contextBridge, ipcRenderer, desktopCapturer, clipboard, nativeImage } = require('electron')
const { resolutionEnum , ScreenShotSaveWayEnum } = require('../src/lib/enum')
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
            filePath = await ipcRenderer.invoke('file-conflict-handle', config);
            if (filePath != null) {
                fs.writeFileSync(filePath, buffer)
            }
        }

        if (config.screenShotSaveWay != ScreenShotSaveWayEnum.FileOnly) {
            const image = nativeImage.createFromBuffer(buffer);
            clipboard.writeImage(image);
        }

        return filePath
    },
    onOpenFolderTriggered: (callback) => {
        ipcRenderer.on('open-folder-triggered', callback)
    },
    offOpenFolderTriggered: () => {
        ipcRenderer.removeAllListeners('open-folder-triggered')
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
    getStore: (key, defaultValue) => ipcRenderer.invoke('get-store', key, defaultValue),
    showConfirmMessageBox: (title, message, detail, buttons) => ipcRenderer.invoke('show-confirm-messageBox', title, message, detail, buttons),
    fileConflictHandle: (config) => ipcRenderer.invoke('file-conflict-handle', config),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    restartApp: () => ipcRenderer.send('restart-app'),
    getActiveWindowsInfo: () => ipcRenderer.invoke('get-active-win-info'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    openReleasePage: (url) => ipcRenderer.invoke('open-release-page', url),
    setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
    startListenFromTray: () => ipcRenderer.invoke('start-listen-from-tray'),
    stopListenFromTray: () => ipcRenderer.invoke('stop-listen-from-tray'),
    onStartListenFromTray: (callback) => ipcRenderer.on('start-listen-from-tray', callback),
    onStopListenFromTray: (callback) => ipcRenderer.on('stop-listen-from-tray', callback),
    updateTrayIcon: (isListening) => ipcRenderer.send('update-tray-icon', isListening),
    sendListenStatusChanged: () => ipcRenderer.send('listen-status-changed')
})