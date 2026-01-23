'use strict'

import { app, protocol, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
const isDevelopment = process.env.NODE_ENV !== 'production'
const HID = require('node-hid')
const fs = require('fs')
const path = require('path')

var device = new HID.HID(1118, 654);


var lasta = false;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

const preloadPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked/preload.js')
  : path.join(__dirname, '../src/preload.js')

async function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 900,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: true,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      preload: preloadPath
    }
  })

  //test 
  device.on("data", function (data) {
    //console.log(data);
    const parseStick = (offset) => {
      const val = data.readInt16LE(offset);
      return parseFloat((val / 32768).toFixed(3)); // 归一化为 -1 到 1
    };

    const state = {
      leftStickX: parseStick(1),
      leftStickY: parseStick(3),
      rightStickX: parseStick(5),
      rightStickY: parseStick(7),

      // 2. 扳机键 (LT/RT 通常在 Index 9 和 10)
      // Xbox 蓝牙版有时候把两个扳机放在一个 16 位里，或者独立字节
      leftTrigger: data[9],  // 0-255
      rightTrigger: data[10], // 0-255

      // 3. 按钮解析 (Index 11 开始是位掩码)
      buttons: {
        a: !!(data[11] & 0x01),
        b: !!(data[11] & 0x02),
        x: !!(data[11] & 0x04),
        y: !!(data[11] & 0x08),
        lb: !!(data[11] & 0x10),
        rb: !!(data[11] & 0x20),
        view: !!(data[11] & 0x40), // 菜单键
        menu: !!(data[11] & 0x80),
        ls: !!(data[12] & 0x01), // 左摇杆下压
        rs: !!(data[12] & 0x02), // 右摇杆下压
      },

      // 4. 方向键 (Xbox 蓝牙通常用 Index 13 的低位表示)
      // 1=北, 2=东北, 3=东, 4=东南, 5=南, 6=西南, 7=西, 8=西北, 0=释放
      dpad: data[13]
    };

    if (lasta != state.buttons.a) {
      console.log(state.buttons.a);
      if (state.buttons.a == true) {
        win.webContents.send('global-hotkey')
      }
    }
    lasta = state.buttons.a;
  });

  // 注册全局快捷键
  globalShortcut.register('F', () => {
    win.webContents.send('global-hotkey')
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