'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
const isDevelopment = process.env.NODE_ENV !== 'production'
const HID = require('node-hid')
const sound = require('sound-play')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
//Scripts
const { resolutionEnum, screenshotSoundEnum, CommonButtonEnum } = require('@/lib/enum')
//Path Define
const exeDir = path.dirname(app.getPath('exe'))
const configPath = app.isPackaged ? path.join(exeDir, 'userConfig.json') : path.join(app.getAppPath(), 'userConfig.json')
const soundPath = app.isPackaged ? path.join(process.resourcesPath, 'assets', 'ns2截图音.mp3') : path.join(__dirname, '../src/assets/ns2截图音.mp3')
const preloadPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/preload.js') : path.join(__dirname, '../src/preload.js')
const controllerDefinePath = app.isPackaged ? path.join(process.resourcesPath, 'controllerDefinition.js') : path.join(__dirname, '../src/controllerDefinition.js')

//Temp Varibles
const defaultConfig = { path: '', resolution: resolutionEnum.R_4K, controller: '', comboKeys: [], sound: screenshotSoundEnum.NS2 }
let win, device;
let lastFlag = false;
let controllerDefine;
let lastBuffer;

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

async function createWindow() {
  //Read Controller Define JS
  controllerDefine = await getControllerDefine(controllerDefinePath);
  // Create the browser window.
  win = new BrowserWindow({
    title: 'Gamepad Full-ScreenShot Tool',
    width: 800,
    height: 900,
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

//选择文件夹
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

async function getConfig() {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
    return defaultConfig
  }
  var res = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  return res
}

ipcMain.handle('read-config', async () => {
  return await getConfig()
})

ipcMain.handle('save-config', async (_, data) => {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2))
})

ipcMain.handle('init-device', async () => {
  var m_config = await getConfig()
  var success = initHidDevice(m_config)
  return success
})

ipcMain.handle('get-controller-define', () => {
  return JSON.parse(JSON.stringify(controllerDefine))
})

ipcMain.handle('get-last-buffer', () => {
  return lastBuffer
})

function initHidDevice(configData) {
  lastBuffer = void 0
  //尝试销毁上一个
  if (device) {
    try {
      device.close()
      device = null
    } catch (err) {
      console.error('关闭设备时出错:', err)
      return false
    }
  }
  lastFlag = false
  try {
    let m_config = GetControllerConfigInDefine(configData.controller);
    device = new HID.HID(m_config.vid, m_config.pid)
    device.on("data", function (data) {
      lastBuffer = data
      Update_KeyDownCheck(m_config.parseDataFunction(data), configData)
    })
  } catch (e) {
    console.error(`${e}`)
    console.error(`无法读取设备：${configData.controller}`)
    return false
  }

  return true
}

function Update_KeyDownCheck(commonButtonMap, config) {
  var flag = true
  if (config.comboKeys.length == 0) flag = false

  for (let i = 0; i < config.comboKeys.length; i++) {
    var selectedItem = config.comboKeys[i]
    if (!commonButtonMap[selectedItem]) flag = false
  }

  if (flag != lastFlag && flag) {
    win.webContents.send('hotkey-triggered')
    sound.play(soundPath)
  }

  lastFlag = flag
}

function getControllerDefine(filePath) {
  try {
    // 2. 读取文件内容（字符串）
    const code = fs.readFileSync(filePath, 'utf8');

    // 3. 创建一个上下文环境
    const context = { module: { exports: {} } };
    vm.createContext(context);

    // 4. 执行代码
    vm.runInContext(code, context);

    // 5. 获取结果
    return context.module.exports;
  } catch (err) {
    console.error("动态加载配置失败:", err);
  }
}

function GetControllerConfigInDefine(deviceName) {
  for (let i = 0; i < controllerDefine.length; i++) {
    if (controllerDefine[i].deviceName === deviceName) return controllerDefine[i]
  }
}