const { contextBridge, ipcRenderer, desktopCapturer } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

contextBridge.exposeInMainWorld('electronAPI', {
    screenShot: async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 3840, height: 2160 }
        })

        const img = sources[0].thumbnail
        const buffer = img.toPNG() // ⚠ 必须直接调用

        const desktopPath = path.join(
            os.homedir(),
            'Desktop',
            `screenshot_${Date.now()}.png`
        )

        fs.writeFileSync(desktopPath, buffer)

        return desktopPath
    }, 
    onGlobalHotkey: (callback) => {
        ipcRenderer.on('global-hotkey', callback)
    },
    offGlobalHotkey: (callback) => {
        ipcRenderer.removeListener('global-hotkey', callback)
    }
})