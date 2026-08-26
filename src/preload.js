const { contextBridge, ipcRenderer, clipboard } = require('electron')
const fs = require('fs')
const log = require('electron-log');

contextBridge.exposeInMainWorld('electronAPI', {
    showScreenshotNotification: (data) => ipcRenderer.invoke('show-screenshot-notification', data),
    getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
    screenShot: (config) => ipcRenderer.invoke('screen-shot', config),
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
    onScreenshotKeyboardTriggered: (callback) => {
        ipcRenderer.on('screen-shot-keyboard-triggered', callback)
    },
    offScreenshotKeyboardTriggered: () => {
        ipcRenderer.removeAllListeners('screen-shot-keyboard-triggered')
    },
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    copyText: (text) => clipboard.writeText(text),
    getAllGamePad: () => ipcRenderer.invoke('get-all-gamepad'),
    openSdl2Device: (device) => ipcRenderer.invoke('open-sdl2-device', device),
    closeSdl2DeviceInstance: () => ipcRenderer.invoke('close-sdl2-instance-device'),
    removeSdl2DeviceInstanceAllListeners: () => ipcRenderer.invoke('remove-sdl2-device-instance-all-listeners'),
    getCurrentButtonsValue: () => ipcRenderer.invoke('get-current-buttons-value'),
    getCurrentAxesValue: () => ipcRenderer.invoke('get-current-axes-value'),
    getCurrentHatValue: () => ipcRenderer.invoke('get-current-hats-value'),
    getDeviceInstanceButtonNumber: () => ipcRenderer.invoke('get-device-instance-button-number'),
    getDeviceInstanceAxisNumber: () => ipcRenderer.invoke('get-device-instance-axis-number'),
    setStore: (key, value) => ipcRenderer.invoke('set-store', key, value),
    getStore: (key, defaultValue) => ipcRenderer.invoke('get-store', key, defaultValue),
    showConfirmMessageBox: (title, message, detail, buttons) => ipcRenderer.invoke('show-confirm-messageBox', title, message, detail, buttons),
    fileConflictHandle: (config) => ipcRenderer.invoke('file-conflict-handle', config),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    getLogFolder: () => ipcRenderer.invoke('get-log-folder'),
    // Ensure folder exists (creates recursively). Returns true on success, false on failure.
    ensureFolder: (folderPath) => {
        try {
            if (!folderPath || folderPath.trim() === '') return false;
            fs.mkdirSync(folderPath, { recursive: true });
            return true;
        } catch (e) {
            console.error('ensureFolder failed', e);
            return false;
        }
    },
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
    updateTrayListeningState: (state) => ipcRenderer.send('update-listening-state', state),
    sendListenStatusChanged: () => ipcRenderer.send('listen-status-changed'),
    logInfo: (...args) => log.info(...args),
    logWarn: (...args) => log.warn(...args),
    logError: (...args) => log.error(...args),
    sendFatalError: (error) => ipcRenderer.send('renderer-fatal-error', error.message || error.toString()),
})
