'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog, Menu, Tray, shell } from 'electron'
const log = require('electron-log');
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
const activeWin = require('active-win');
const isDevelopment = process.env.NODE_ENV !== 'production'
import sdl from '@kmamal/sdl'
const fs = require('fs')
const path = require('path')
const https = require('https')
const vm = require('vm')

if (process.platform === 'win32') {
  app.setAppUserModelId('GamePad Screenshot Tool');
}

//Scripts
const { resolutionEnum, screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum } = require('@/lib/enum')
const configStore = require('@/lib/configLoader')

//Path Define
const preloadPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/preload.js') : path.join(__dirname, '../src/preload.js')

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
])

//#region 重写ipcMain.handle，添加全局错误捕获

const originalHandle = ipcMain.handle;
ipcMain.handle = function (channel, listener) {
  // 返回包裹后的新 listener
  return originalHandle.call(ipcMain, channel, async (event, ...args) => {
    try {
      // 执行原本的业务逻辑
      return await listener(event, ...args);
    } catch (error) {
      crashAndExit('Uncaught Exception in IpcMain Handle', error);
      throw error; // 仍然抛出，维持原本的返回特性
    }
  });
};
//#endregion

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
    title: $t('gamepadScreenShotTool'),
    width: 700,
    height: 900,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../src/gamepad.ico'),
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: true,
      contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
      preload: preloadPath,
      // 设置为 false 以禁用后台节流
      backgroundThrottling: false
    }
  })


  // --- 拦截关闭事件 ---
  win.on('close', (event) => {
    let closeType = configStore.get('closeType', 'exit')

    if (closeType === 'exit') {
      app.isQuiting = true;
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

  const normalIcon = getAssetPath('gamepad.ico');
  const recordingIcon = getAssetPath('assets', 'recording.ico');

  tray = new Tray(normalIcon);
  // win.webContents.send('open-folder-triggered')
  let isListening = false; // 初始假设未监听
  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: $t('TrayMenu.openScreenshotFolder'),
        click: () => win.webContents.send('open-folder-triggered')
      },
      {
        label: $t('TrayMenu.startListen'),
        visible: !isListening,
        click: () => {
          win.webContents.send('start-listen-from-tray');
        }
      },
      {
        label: $t('TrayMenu.stopListen'),
        visible: isListening,
        click: () => {
          win.webContents.send('stop-listen-from-tray');
        }
      },
      {
        label: $t('TrayMenu.exit'),
        click: () => {
          app.isQuiting = true; // 设置一个标记位，允许真正退出
          app.quit();
        }
      }
    ]);
    tray.setContextMenu(contextMenu);
  };

  updateMenu();

  tray.setToolTip('GamePad Screenshot Tool');

  // 点击托盘图标重新打开界面
  tray.on('click', () => {
    win.isVisible() ? win.focus() : win.show();
  });

  // 监听图标更新事件
  ipcMain.on('update-tray-icon', (_, isListening) => {
    tray.setImage(isListening ? recordingIcon : normalIcon);
  });

  // 监听监听状态更新事件
  ipcMain.on('update-listening-state', (_, state) => {
    isListening = state;
    updateMenu();
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
      await installExtension(VUEJS_DEVTOOLS)
    } catch (e) {
      console.error('Vue Devtools failed to install:', e.toString())
    }
  }
  createWindow()
  createTray()

  // 设置开机自启动
  const autoStart = configStore.get('autoStart', false);
  app.setLoginItemSettings({ openAtLogin: autoStart });

  // 检查最小化启动
  const minimizeOnStartup = configStore.get('minimizeOnStartup', false);
  if (minimizeOnStartup) {
    win.hide();
  }

  // 启动时检测更新
  if (!isDevelopment) {
    const checkOnStartup = configStore.get('checkUpdateOnStartup', 'enabled');
    if (checkOnStartup === 'enabled') {
      // 非阻塞检测，避免启动失败
      setTimeout(() => {
        checkForUpdates().catch(err => {
          console.error('Startup update check failed:', err);
        });
      }, 1000); // 延迟1秒
    }
  }
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

ipcMain.on('restart-app', () => {
  app.relaunch();
  app.exit(0);
});
//#endregion

//#region 多语言模拟
let localeKey = 'locale';

const messages = {
  zh: require('@/locales/zh.json'),
  en: require('@/locales/en.json')
};

// 2. 模拟 $t 函数
function $t(key) {
  let locale = configStore.get(localeKey, 'zh');
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
let hats = [false, false, false, false];
let isXboxController = false;

ipcMain.handle('get-all-gamepad', () => {
  return sdl.joystick.devices
})

ipcMain.handle('open-sdl2-device', async (_, device) => {
  device_instance = sdl.joystick.openDevice(sdl.joystick.devices[device._index]);
  isXboxController = device_instance._device.vendor == 1118 && device_instance._device.product == 654;

  buttons = new Array(20).fill(false);

  device_instance.on('buttonDown', (data) => {
    buttons[data.button] = true;
  })

  device_instance.on('buttonUp', (data) => {
    buttons[data.button] = false;
  })

  device_instance.on('hatMotion', (data) => {
    hats = mapHatMotionToDirections(data.value);
  })
  return true;
})

ipcMain.handle('remove-sdl2-device-instance-all-listeners', async (_, device) => {
  if (device_instance) {
    buttons = new Array(20).fill(false);
    hats = [false, false, false, false]
    device_instance.removeAllListeners();
  }
})

ipcMain.handle('close-sdl2-instance-device', async (_, device) => {
  if (device_instance) {
    device_instance.close();
    device_instance = void 0;
  }
})

ipcMain.handle('get-current-buttons-value', async () => {
  if (isXboxController) {
    let res = [];
    res = buttons.slice(0, device_instance.buttons.length);
    res = res.concat(hats);
    return res;
  }
  return buttons
})

ipcMain.handle('get-current-hats-value', async () => {
  return hats
})

sdl.joystick.on('deviceAdd', (device) => {
  win.webContents.send('device-changed')
})

sdl.joystick.on('deviceRemove', (device) => {
  win.webContents.send('device-changed')
})

ipcMain.handle('get-device-instance-button-number', async () => {
  if (device_instance) {
    if (isXboxController) {
      return device_instance.buttons.length + 4;
    }
    return device_instance.buttons.length
  }
  return 0
})

function mapHatMotionToDirections(motion) {
  // 初始化 [上, 右, 下, 左] 全为 false (0)
  let directions = [false, false, false, false];

  // 如果是中心点，直接返回全 false
  if (motion === 'hatMotion centered') {
    return directions;
  }

  // 转为小写，方便模糊匹配，防止大小写拼写错误
  const m = motion.toLowerCase();

  // 检查是否包含对应的方向关键字
  if (m.includes('up')) directions[0] = true; // 0 是上
  if (m.includes('right')) directions[1] = true; // 1 是右
  if (m.includes('down')) directions[2] = true; // 2 是下
  if (m.includes('left')) directions[3] = true; // 3 是左

  return directions;
}


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

ipcMain.handle('open-folder', async (_, folderPath) => {
  shell.openPath(folderPath).then((errorMessage) => {
    if (errorMessage) {
      console.error('打开文件失败:', errorMessage);
    }
  });
})
// 返回日志文件夹路径（开发/打包环境不同）
ipcMain.handle('get-log-folder', async () => {
  let filePath = log.transports.file.getFile().path;
  let folderPath = path.dirname(filePath);
  return folderPath;
});

//#endregion

//#region store
ipcMain.handle('set-store', (_, key, value) => {
  configStore.set(key, value)
})

ipcMain.handle('get-store', (_, key, defaultValue) => {
  return configStore.get(key, defaultValue)
})

//#endregion

//#region 更新检测

// 检查GitHub最新release
function checkForUpdates() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/AmagiSakuya/GamePad-ScreenShot-Windows/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'GamePad-ScreenShot-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    // 设置代理
    const proxy = configStore.get('proxy', '');
    if (proxy) {
      process.env.HTTPS_PROXY = `http://${proxy}`;
      process.env.HTTP_PROXY = `http://${proxy}`;
    } else {
      // 清空代理变量
      process.env.HTTPS_PROXY = ``;
      process.env.HTTP_PROXY = ``;
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          // 使用标题而不是tag，标题格式为 vx.x.x
          const titleMatch = release.name.match(/v(\d+\.\d+\.\d+)/);
          const latestVersion = titleMatch ? titleMatch[1] : release.tag_name.replace('v', '');

          // 获取当前版本
          let currentVersion;
          try {
            const packagePath = path.join(app.getAppPath(), 'package.json');
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            currentVersion = packageJson.version;
          } catch (error) {
            console.warn('Failed to read package.json:', error);
            currentVersion = '0.0.0'; // 默认版本
          }

          const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

          // 打印版本信息
          //console.log(`当前版本: ${currentVersion}`);
          //console.log(`最新版本: ${latestVersion}`);
          //console.log(`是否有更新: ${hasUpdate}`);

          resolve({
            hasUpdate,
            latestVersion,
            currentVersion,
            releaseUrl: release.html_url
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// 版本比较函数
function compareVersions(version1, version2) {
  const v1 = version1.split('.').map(Number);
  const v2 = version2.split('.').map(Number);

  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}

ipcMain.handle('check-for-updates', async () => {
  return await checkForUpdates();
});

ipcMain.handle('open-release-page', async (_, url) => {
  shell.openExternal(url);
});

ipcMain.handle('set-auto-start', async (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
});

ipcMain.handle('start-listen-from-tray', async () => {
  win.webContents.send('start-listen-from-tray');
});

ipcMain.handle('stop-listen-from-tray', async () => {
  win.webContents.send('stop-listen-from-tray');
});

//#endregion

//#region 聚焦窗口信息
ipcMain.handle('get-active-win-info', () => {
  return activeWin();
})
//#endregion

//#region 截图通知浮窗

let overlayWindow = null;
let overlayTimeout = null;

function showScreenshotNotification({ img, title = '截图成功', desc = '已保存到本地', duration = 3000 }) {
  // 如果已有通知，先关闭
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
    clearTimeout(overlayTimeout);
  }

  // 获取主屏幕尺寸，定位到左上角
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const x = 0;
  const y = 0;

  overlayWindow = new BrowserWindow({
    width: 480,
    height: 150,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true);


  const overlayWindowFilePath = app.isPackaged ? path.join(process.resourcesPath, 'html', 'screenshot-notification.html') : '../src/screenshot-notification.html';

  overlayWindow.loadFile(overlayWindowFilePath, {
    query: { img, title, desc }
  });

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive(); // 不抢焦点
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    clearTimeout(overlayTimeout);
  });

  // 5秒后自动关闭
  overlayTimeout = setTimeout(() => {
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null;
    }
  }, duration);
}

ipcMain.handle('show-screenshot-notification', (event, args) => {
  showScreenshotNotification(args);
});

//#endregion

//#region 主线程错误日志记录

log.transports.file.level = 'error'; // 只记录 error 及以上级别
log.transports.console.level = false; // 生产环境可以关闭控制台打印

// 封装一个优雅的“闪退”函数
function crashAndExit(title, error) {
  // 同步写入日志，确保程序退出前数据已经落盘
  log.error(`[FATAL CRASH] ${title}:`, error);
  let path = log.transports.file.getFile().path;
  dialog.showErrorBox(
    $t('alertMsg.fatalCrashTitle'),
    $t('alertMsg.fatalCrashMessage') + `\n\n${path}`
  );

  // 退出程序。1 表示异常退出
  app.exit(1); 
}

// 2. 捕获主进程未处理的同步/异步异常
process.on('uncaughtException', (error) => {
  crashAndExit('Uncaught Exception in Main Process', error);
});

process.on('unhandledRejection', (reason, promise) => {
  crashAndExit('Unhandled Rejection in Main Process', reason);
});

// 3. 响应渲染进程未处理的同步/异步异常
ipcMain.on('renderer-fatal-error', function (event, errorMsg) {
  // 收到前端传来的死讯，直接调用上面的闪退函数
  crashAndExit('Renderer Process Exception', errorMsg);
});

//#endregion