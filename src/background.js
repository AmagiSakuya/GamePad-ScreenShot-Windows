'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
const isDevelopment = process.env.NODE_ENV !== 'production'
import sdl from '@kmamal/sdl'
const sound = require('sound-play')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
//Scripts
const { resolutionEnum, screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum } = require('@/lib/enum')
//Path Define
const preloadPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/preload.js') : path.join(__dirname, '../src/preload.js')

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

//#region app
let win;

async function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    title: 'Gamepad Full-ScreenShot Tool',
    width: 800,
    height: 1000,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../src/gamepad.ico'),
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: true,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      preload: preloadPath
    }
  })

  win.on('page-title-updated', (e) => {
    e.preventDefault()
  })

  if (process.env.WEBPACK_DEV_SERVER_URL) {
    // Load the url of the dev server if in development mode
    await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
    if (!process.env.IS_TEST) win.webContents.openDevTools()
  } else {
    createProtocol('app')
    // Load the index.html when not in development
    win.loadURL('app://./index.html')
  }
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  if (isDevelopment && !process.env.IS_TEST) {
    // Install Vue Devtools
    try {
      await installExtension(VUEJS3_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }
  createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
  if (process.platform === 'win32') {
    process.on('message', (data) => {
      if (data === 'graceful-exit') {
        app.quit()
      }
    })
  } else {
    process.on('SIGTERM', () => {
      app.quit()
    })
  }
}

//#endregion




//#region SDL2方法
let device_instance;
let buttons = new Array(20).fill(false);

ipcMain.handle('get-all-gamepad', () => {
  return sdl.joystick.devices
})

ipcMain.handle('open-sdl2-device', async (_, device) => {
  try {

    device_instance = sdl.joystick.openDevice(sdl.joystick.devices[device._index]);
    buttons = new Array(20).fill(false);

    device_instance.on('buttonDown', (data) => {
      buttons[data.button] = true;
    })

    device_instance.on('buttonUp', (data) => {
      buttons[data.button] = false;
    })

  } catch (err) {
    console.error('打开控制器失败', err);
    return false
  }
  return true;
})

ipcMain.handle('remove-sdl2-device-instance-all-listeners', async (_, device) => {
  if (device_instance) {
    buttons = new Array(20).fill(false);
    device_instance.removeAllListeners();
  }
})

ipcMain.handle('get-current-buttons-value', async () => {
  return buttons;
})

sdl.joystick.on('deviceAdd', (device) => {
  win.webContents.send('device-changed')
})

sdl.joystick.on('deviceRemove', (device) => {
  win.webContents.send('device-changed')
})
//#endregion


//#region 截图音频
const soundPath = app.isPackaged ? path.join(process.resourcesPath, 'assets', 'ns2截图音.mp3') : path.join(__dirname, '../src/assets/ns2截图音.mp3')

ipcMain.handle('play-screenshot-sound', () => {
  playScreenShotSound()
})

function playScreenShotSound() {
  sound.play(soundPath)
}

//#endregion


//#region  Win32
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})
//#endregion