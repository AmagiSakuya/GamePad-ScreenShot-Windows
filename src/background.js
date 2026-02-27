'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog, Menu, Tray } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer'
const isDevelopment = process.env.NODE_ENV !== 'production'
import sdl from '@kmamal/sdl'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

//Scripts
const { resolutionEnum, screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum } = require('@/lib/enum')
const configStore = require('@/lib/configLoader')

//Path Define
const preloadPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/preload.js') : path.join(__dirname, '../src/preload.js')

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

//#region app
let win;
let tray;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果获取锁失败，说明已有实例在运行，直接强制退出当前实例
  app.quit();
}

async function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    title: 'Gamepad Full-ScreenShot Tool',
    width: 700,
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


  // --- 拦截关闭事件 ---
  win.on('close', (event) => {
    let closeType = configStore.get('closeType', 'exit')

    if (closeType === 'exit') {
      app.isQuiting =  true;
    }

    if (!app.isQuiting) {
      event.preventDefault(); // 阻止默认的关闭行为
      win.hide();      // 隐藏窗口
    }
    return false;
  });

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

// 创建系统托盘
function createTray() {
  // 图标路径，建议使用 16x16 或 32x32 的图片
  
  tray = new Tray(getAssetPath('gamepad.ico'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示界面',
      click: () => win.show()
    },
    {
      label: '退出程序',
      click: () => {
        app.isQuiting = true; // 设置一个标记位，允许真正退出
        app.quit();
      }
    }
  ]);

  tray.setToolTip('GamePad Screenshot Tool');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标重新打开界面
  tray.on('click', () => {
    win.isVisible() ? win.focus() : win.show();
  });
}


app.on('will-quit', () => {
  //globalShortcut.unregisterAll()
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

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
  createTray()
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

//#region 多语言模拟

const messages = {
  zh: require('@/locales/zh.json'),
  en: require('@/locales/en.json')
};

// 2. 模拟 $t 函数
function $t(key, locale = 'zh') {
  // 支持 "menu.file.save" 这种嵌套路径
  return key.split('.').reduce((obj, i) => (obj ? obj[i] : null), messages[locale]) || key;
}
//#endregion

// 获取资源路径的函数
function getAssetPath(...relativePaths) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...relativePaths) // 打包后的路径
    : path.join(__dirname, '../src', ...relativePaths);           // 开发环境路径
}

//#region 文件名冲突处理 #fouced program name#
let filenameConflictResolutionKey = 'filenameConflictResolution';

ipcMain.handle('file-conflict-handle', async (_, config) => {
  let filePath = path.join(config.path, `${config.calcedFileName}.${config.imageFormat}`);
  if (fs.existsSync(filePath)) {
    let filenameConflictResolution = configStore.get(filenameConflictResolutionKey, 'overwrite')
    if (filenameConflictResolution === 'appendTimestamp') {
      const timestamp = Date.now();
      filePath = path.join(config.path, `${config.calcedFileName}_${timestamp}.${config.imageFormat}`)
    } else if (filenameConflictResolution === 'notSave') {
      return null;
    } else if (filenameConflictResolution === 'askEveryTime') {
      let res = await showConfirmMessageBox($t('SystemSettingsPage.overwriteConfirm.title'), $t('SystemSettingsPage.overwriteConfirm.message'), filePath, [$t('SystemSettingsPage.overwriteConfirm.confirmButton'), $t('SystemSettingsPage.overwriteConfirm.cancelButton')]);
      if (!res) {
        return null;
      }
    }
  }
  return filePath;
})
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

ipcMain.handle('get-device-instance-button-number', async () => {
  if (device_instance) {
    return device_instance.buttons.length
  }
  return 0
})

//#endregion

//#region  Win32
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('show-confirm-messageBox', async (_, title, message, detail, buttons) => {
  return showConfirmMessageBox(title, message, detail, buttons);
})

async function showConfirmMessageBox(title, message, detail, buttons) {
  const result = await dialog.showMessageBox({
    type: 'question',          // 图标类型：question, info, warning, error
    buttons: buttons,     // 按钮文本数组，索引从 0 开始
    defaultId: 0,              // 默认聚焦的按钮索引
    title: title,          // 对话框窗口标题
    message: message, // 主提示内容
    detail: detail,   // 额外详细说明
    cancelId: 1,               // 用户点击关闭或按下 Esc 键时返回的索引
  });

  return result.response === 0; // 返回 true 表示用户点击了 "是"
}

//#endregion

//#region store
ipcMain.handle('set-store', (_, key, value) => {
  configStore.set(key, value)
})

ipcMain.handle('get-store', (_, key, defaultValue) => {
  return configStore.get(key, defaultValue)
})

//#endregion