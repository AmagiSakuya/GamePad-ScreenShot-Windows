const { contextBridge, ipcRenderer, clipboard } = require('electron')
const log = require('electron-log');

// device-changed 是主进程广播的公共通道，多个页面都会订阅。
// 这里按 key 分别登记回调，注销时只移除自己那一个，避免一个页面销毁时把其他页面的监听一起删掉。
const deviceChangedHandlers = new Map()
function bindDeviceChanged(key, callback) {
    if (typeof callback !== 'function') return
    const name = key || 'default'
    const prev = deviceChangedHandlers.get(name)
    if (prev) {
        ipcRenderer.removeListener('device-changed', prev)
        deviceChangedHandlers.delete(name)
    }
    const listener = (_event, ...args) => callback(...args)
    deviceChangedHandlers.set(name, listener)
    ipcRenderer.on('device-changed', listener)
}
function unbindDeviceChanged(key) {
    const name = key || 'default'
    const listener = deviceChangedHandlers.get(name)
    if (listener) {
        ipcRenderer.removeListener('device-changed', listener)
        deviceChangedHandlers.delete(name)
    }
}

contextBridge.exposeInMainWorld('electronAPI', {
    showScreenshotNotification: (data) => ipcRenderer.invoke('show-screenshot-notification', data),
    getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
    getCaptureWindows: () => ipcRenderer.invoke('get-capture-windows'),
    screenShot: (config) => ipcRenderer.invoke('screen-shot', config),
    onOpenFolderTriggered: (callback) => {
        ipcRenderer.on('open-folder-triggered', callback)
    },
    offOpenFolderTriggered: () => {
        ipcRenderer.removeAllListeners('open-folder-triggered')
    },
    onDeviceChanged: (callback, key) => {
        bindDeviceChanged(key, callback)
    },
    offDeviceChanged: (key) => {
        unbindDeviceChanged(key)
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
    getDeviceInstancePhysicalButtonNumber: () => ipcRenderer.invoke('get-device-instance-physical-button-number'),
    getDeviceInstanceHatNumber: () => ipcRenderer.invoke('get-device-instance-hat-number'),
    getDeviceInstanceAxisNumber: () => ipcRenderer.invoke('get-device-instance-axis-number'),
    setStore: (key, value) => ipcRenderer.invoke('set-store', key, value),
    getStore: (key, defaultValue) => ipcRenderer.invoke('get-store', key, defaultValue),
    showConfirmMessageBox: (title, message, detail, buttons) => ipcRenderer.invoke('show-confirm-messageBox', title, message, detail, buttons),
    fileConflictHandle: (config) => ipcRenderer.invoke('file-conflict-handle', config),
    openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
    getLogFolder: () => ipcRenderer.invoke('get-log-folder'),
    // 打开外部网页链接（GitHub 项目主页等）
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    // 数据管理：清空日志
    clearLogFiles: () => ipcRenderer.invoke('clear-log-files'),
    // Ensure folder exists (creates recursively). Returns true on success, false on failure.
    ensureFolder: (folderPath) => ipcRenderer.invoke('ensure-folder', folderPath),
    restartApp: () => ipcRenderer.send('restart-app'),
    // 语言热切换：通知主进程重建托盘菜单 / 刷新窗口标题（无需重启）
    applyLocale: (locale) => ipcRenderer.invoke('apply-locale', locale),
    getActiveWindowsInfo: () => ipcRenderer.invoke('get-active-win-info'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    openReleasePage: (url) => ipcRenderer.invoke('open-release-page', url),
    // ===== 热更新（GitHub + 国内镜像）=====
    getUpdateState: () => ipcRenderer.invoke('updater:get-state'),
    /** options: { quiet: true } 静默检测（失败不弹错误） */
    checkUpdate: (options) => ipcRenderer.invoke('updater:check', options),
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    cancelUpdate: () => ipcRenderer.invoke('updater:cancel'),
    applyUpdate: () => ipcRenderer.invoke('updater:apply'),
    openUpdateReleasePage: (url) => ipcRenderer.invoke('updater:open-release', url),
    onUpdaterState: (callback) => {
        const listener = (_event, state) => callback(state)
        ipcRenderer.removeAllListeners('updater:state')
        ipcRenderer.on('updater:state', listener)
    },
    offUpdaterState: () => {
        ipcRenderer.removeAllListeners('updater:state')
    },
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
    // 自绘标题栏
    minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
    toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
    closeWindow: () => ipcRenderer.invoke('window-close'),
    isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    onWindowMaximizedChanged: (callback) => ipcRenderer.on('window-maximized-changed', callback),
    // 界面字体大小（整页缩放）
    setUiScale: (scale) => ipcRenderer.invoke('set-ui-scale', scale),
    // ===== 手柄按键映射（手柄 → 键盘）=====
    getMappingConfig: () => ipcRenderer.invoke('mapping:get-config'),
    saveMappingConfig: (config) => ipcRenderer.invoke('mapping:save-config', config),
    setMappingEnabled: (enabled) => ipcRenderer.invoke('mapping:set-enabled', enabled),
    getMappingStatus: () => ipcRenderer.invoke('mapping:get-status'),
    getMappingLogs: () => ipcRenderer.invoke('mapping:get-logs'),
    clearMappingLogs: () => ipcRenderer.invoke('mapping:clear-logs'),
    testMappingOutput: (codes) => ipcRenderer.invoke('mapping:test-output', codes),
    onMappingEnabledChanged: (callback) => {
      const listener = (_event, enabled) => callback(enabled)
      ipcRenderer.removeAllListeners('mapping:enabled-changed')
      ipcRenderer.on('mapping:enabled-changed', listener)
    },
    offMappingEnabledChanged: () => {
      ipcRenderer.removeAllListeners('mapping:enabled-changed')
    },
    onMappingLog: (callback) => {
      const listener = (_event, entry) => callback(entry)
      ipcRenderer.removeAllListeners('mapping:log')
      ipcRenderer.on('mapping:log', listener)
    },
    offMappingLog: () => {
      ipcRenderer.removeAllListeners('mapping:log')
    },
})
