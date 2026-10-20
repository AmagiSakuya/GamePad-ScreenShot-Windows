'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog, Menu, Tray, shell, clipboard, nativeImage, session, screen } from 'electron'
const log = require('electron-log');
const { uIOhook, UiohookKey } = require('uiohook-napi')
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
// Vue DevTools 改为「只读本地扩展目录」，不再联网下载（国内网络下载 clients2.google.com 会超时刷屏）
const { installDevtoolsSafe } = require('@/lib/devtools')
const activeWin = require('active-win');
const screenshot = require('screenshot-desktop');
const { Window: ScreenshotWindow } = require('node-screenshots');
const isDevelopment = process.env.NODE_ENV !== 'production'
import sdl from '@kmamal/sdl'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

if (process.platform === 'win32') {
  app.setAppUserModelId('GamePad Screenshot Tool');
}

//Scripts
const { screenshotSoundEnum, CommonButtonEnum, ScreenShotWayEnum, ScreenShotSaveWayEnum } = require('@/lib/enum')
const { snapUiScale, migrateLegacyUiScale, UI_SCALE_DEFAULT, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_VERSION } = require('@/lib/uiScale')
const configStore = require('@/lib/configLoader')
// 手柄按键映射（手柄 → 键盘）：引擎读 SDL 设备状态，键盘通过常驻 PowerShell 调用 keybd_event 发送
const { createKeySender } = require('@/lib/keySender')
const { createMappingEngine } = require('@/lib/gamepadMapping')
// 热更新（检查 → 下载 → 退出后替换 app.asar → 自动重启）
const { createUpdater } = require('@/lib/updater')

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
      // IPC 业务错误（例如保存目录被删除或没有权限）不应导致整个应用退出。
      // 记录错误并返回 null，让渲染进程按失败结果处理即可。
      log.error(`[IPC ERROR] ${channel}:`, error);
      return null;
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

const packagePath = path.join(app.getAppPath(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// 更新器要在窗口创建之后才知道往哪个窗口推状态，这里先用闭包引用
const updater = createUpdater({
  app,
  configStore,
  log,
  packageJson,
  isDevelopment,
  getWindow: () => win
})

/**
 * 启动窗口尺寸：按「设计稿 CSS 尺寸 × 当前界面缩放」换算。
 * 高度贴合主界面真实内容（标题栏 46 + 内容约 800），留少量余量兼容不同语言/更多组合键，
 * 保证启动时所有卡片完整可见、不出现滚动条；同时以显示器工作区为上限，避免超出屏幕。
 */
const DESIGN_VIEWPORT = { width: 1350, height: 890 }

function getDefaultWindowSize() {
  const scale = readUiScale()
  let workArea = { width: 1600, height: 900 }
  try {
    workArea = screen.getPrimaryDisplay().workAreaSize
  } catch (error) {
    log.warn('[WINDOW] Failed to read display work area, fallback to default size:', error)
  }

  const maxWidth = Math.max(960, workArea.width - 60)
  const maxHeight = Math.max(640, workArea.height - 60)
  const width = Math.min(maxWidth, Math.round(DESIGN_VIEWPORT.width * scale))
  const height = Math.min(maxHeight, Math.round(DESIGN_VIEWPORT.height * scale))

  return { width, height }
}

async function createWindow() {
  // 自绘标题栏：去掉 Windows 原生外框，最小化/最大化/关闭交给渲染进程的顶栏按钮
  const theme = configStore.get('theme', 'dark')
  const { width: winWidth, height: winHeight } = getDefaultWindowSize()
  // 「静默启动」（存档键名沿用历史的 minimizeOnStartup）：窗口先不显示，
  // 等首帧准备好再决定是亮出来还是只留托盘图标。这样开机自启时不会出现
  // 「闪一下窗口又消失」的观感（旧实现是先显示再 hide）。
  const minimizeOnStartup = configStore.get('minimizeOnStartup', false) === true
    || configStore.get('minimizeOnStartup', false) === 'true'
  // Create the browser window.
  win = new BrowserWindow({
    title: $t('gamepadScreenShotTool') + ` ver.${packageJson.version}`,
    width: winWidth,
    height: winHeight,
    minWidth: 960,
    minHeight: 640,
    center: true,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: theme === 'light' ? '#F4F6F1' : '#08090C',
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

  applyUiScaleToWindow();

  // 首帧渲染完成后再显示：静默启动时保持隐藏（只留托盘图标），否则正常亮出窗口。
  // 3 秒兜底，避免极端情况下 ready-to-show 不触发导致「应用启动后什么都没有」。
  let startupRevealed = false
  let revealTimer = null
  const revealOnStartup = () => {
    if (startupRevealed || !win || win.isDestroyed()) return
    startupRevealed = true
    if (revealTimer) clearTimeout(revealTimer)
    if (!minimizeOnStartup) win.show()
  }
  revealTimer = setTimeout(revealOnStartup, 3000)
  win.once('ready-to-show', revealOnStartup)

  // 最大化状态同步给渲染进程，用于切换「最大化 / 还原」按钮图标
  win.on('maximize', () => {
    if (win && win.webContents) win.webContents.send('window-maximized-changed', true)
  })
  win.on('unmaximize', () => {
    if (win && win.webContents) win.webContents.send('window-maximized-changed', false)
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

//#region 界面缩放（界面字体大小）
const uiScaleKey = 'uiScale';
const uiScaleVersionKey = 'uiScaleVersion';

/** 读取界面缩放比例（绝对 zoom，标准档 = 1.2x，对应面板 100%）；旧版存档仅在首次读取时吸附迁移 */
function readUiScale() {
  const stored = configStore.get(uiScaleKey, UI_SCALE_DEFAULT)
  if (configStore.get(uiScaleVersionKey, 0) !== UI_SCALE_VERSION) {
    const migrated = migrateLegacyUiScale(stored)
    configStore.set(uiScaleKey, migrated)
    configStore.set(uiScaleVersionKey, UI_SCALE_VERSION)
    return migrated
  }
  return snapUiScale(stored)
}

/** 缩放整页渲染（等价于浏览器 Ctrl +/-），文字与控件同步放大，不会出现布局错位 */
function applyUiScaleToWindow() {
  if (!win || !win.webContents) return;
  const scale = readUiScale();
  win.webContents.setZoomFactor(scale);
  // 页面导航后缩放会被重置，加载完成后再应用一次
  win.webContents.on('did-finish-load', () => {
    if (win && win.webContents) win.webContents.setZoomFactor(readUiScale());
  });
}

ipcMain.handle('set-ui-scale', (_, scale) => {
  const value = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, snapUiScale(scale)));
  configStore.set(uiScaleKey, value);
  configStore.set(uiScaleVersionKey, UI_SCALE_VERSION);
  if (win && win.webContents) win.webContents.setZoomFactor(value);
  return value;
});
//#endregion

//#region 自绘标题栏窗口控制
ipcMain.handle('window-minimize', () => {
  if (win) win.minimize();
});

ipcMain.handle('window-toggle-maximize', () => {
  if (!win) return false;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
  return win.isMaximized();
});

ipcMain.handle('window-close', () => {
  // 走 close 事件，保留「关闭到托盘 / 退出」的策略
  if (win) win.close();
});

ipcMain.handle('window-is-maximized', () => (win ? win.isMaximized() : false));
//#endregion

// 创建系统托盘
// 托盘菜单文案在构建时取值，语言切换后需要重建菜单才能生效，
// 因此把重建函数提到模块作用域，供 apply-locale 复用。
let rebuildTrayMenu = null;
let trayListeningState = false;

/** 托盘悬停提示：跟随当前语言 */
function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip($t('gamepadScreenShotTool'));
}

function createTray() {
  // 图标路径，建议使用 16x16 或 32x32 的图片

  const normalIcon = getAssetPath('gamepad.ico');
  const recordingIcon = getAssetPath('assets', 'recording.ico');

  tray = new Tray(normalIcon);
  trayListeningState = false; // 初始假设未监听
  rebuildTrayMenu = () => {
    if (!tray || tray.isDestroyed()) return;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: $t('TrayMenu.openScreenshotFolder'),
        click: () => win.webContents.send('open-folder-triggered')
      },
      {
        label: $t('TrayMenu.startListen'),
        visible: !trayListeningState,
        click: () => {
          win.webContents.send('start-listen-from-tray');
        }
      },
      {
        label: $t('TrayMenu.stopListen'),
        visible: trayListeningState,
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
    updateTrayTooltip();
  };

  rebuildTrayMenu();

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
    trayListeningState = state;
    if (typeof rebuildTrayMenu === 'function') rebuildTrayMenu();
  });
}

/**
 * 语言热切换：重建托盘菜单 + 刷新窗口标题 / 托盘提示。
 * 主进程里所有文案都是在使用时通过 $t 取值的，只有托盘菜单是构建时缓存的，
 * 所以重建菜单即可完成全量热替换，无需重启应用。
 */
function applyLanguageToShell() {
  if (win && !win.isDestroyed()) {
    win.setTitle($t('gamepadScreenShotTool') + ` ver.${packageJson.version}`);
  }
  if (typeof rebuildTrayMenu === 'function') rebuildTrayMenu();
  updateTrayTooltip();
}

ipcMain.handle('apply-locale', (_, locale) => {
  if (typeof locale !== 'string' || !locale) return false;
  configStore.set(localeKey, locale);
  applyLanguageToShell();
  return true;
});

app.on('will-quit', () => {
  //globalShortcut.unregisterAll()
  uIOhook.stop()
  // 释放映射引擎与常驻的键盘发送进程
  if (mappingEngine) mappingEngine.dispose()
  if (mappingKeySender) mappingKeySender.dispose()
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
    // 加载本地 Vue DevTools（纯本地读取，不联网、失败不影响启动）
    await installDevtoolsSafe({ app, session, isDevelopment })
  }
  // 配置中的截图目录可能已被用户手动删除，启动时自动恢复目录。
  ensureConfiguredScreenshotPath();

  createWindow()
  createTray()

  // 按键映射引擎：配置里已启用的话，启动即生效（不依赖任何页面是否打开过）
  initMappingEngine()

  // 清理上次热更新残留的 .old / .part 文件（删不掉的下次启动再试）
  updater.init()

  // 设置开机自启动
  const autoStart = configStore.get('autoStart', false);
  app.setLoginItemSettings({ openAtLogin: autoStart });

  // 开启底层钩子监听
  uIOhook.start()
  // 监听全局键盘按下事件
  uIOhook.on('keydown', (event) => {
    win.webContents.send('screen-shot-keyboard-triggered', event);
  })
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
  'zh-TW': require('@/locales/zh-TW.json'),
  en: require('@/locales/en.json'),
  ja: require('@/locales/ja.json'),
  ko: require('@/locales/ko.json'),
  de: require('@/locales/de.json'),
  fr: require('@/locales/fr.json'),
  es: require('@/locales/es.json'),
  ru: require('@/locales/ru.json')
};

// 2. 模拟 $t 函数
function $t(key) {
  let locale = configStore.get(localeKey, 'zh');
  const dict = messages[locale] || messages.en;
  // 支持 "menu.file.save" 这种嵌套路径
  return key.split('.').reduce((obj, i) => (obj ? obj[i] : null), dict) || key;
}
//#endregion

// 获取资源路径的函数
function getAssetPath(...relativePaths) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...relativePaths) // 打包后的路径
    : path.join(__dirname, '../src', ...relativePaths);           // 开发环境路径
}

function ensureDirectoryExists(directoryPath, source = 'unknown') {
  if (typeof directoryPath !== 'string' || directoryPath.trim() === '') {
    return false;
  }

  try {
    fs.mkdirSync(directoryPath.trim(), { recursive: true });
    return true;
  } catch (error) {
    log.error(`[DIRECTORY ERROR] Failed to create screenshot directory (${source}): ${directoryPath}`, error);
    return false;
  }
}

function getConfiguredScreenshotPath() {
  const savedGlobalConfig = configStore.get('globalConfig', void 0);
  if (!savedGlobalConfig) {
    return '';
  }

  try {
    const globalConfig = typeof savedGlobalConfig === 'string'
      ? JSON.parse(savedGlobalConfig)
      : savedGlobalConfig;
    return globalConfig && typeof globalConfig.path === 'string' ? globalConfig.path : '';
  } catch (error) {
    log.warn('Failed to parse saved screenshot configuration:', error);
    return '';
  }
}

function ensureConfiguredScreenshotPath() {
  const screenshotPath = getConfiguredScreenshotPath();
  if (screenshotPath) {
    ensureDirectoryExists(screenshotPath, 'startup');
  }
}

//#region 文件名冲突处理 #fouced program name#
let filenameConflictResolutionKey = 'filenameConflictResolution';
let screenSourceCache = [];
let captureWindowCache = [];

ipcMain.handle('file-conflict-handle', async (_, config) => {
  return resolveScreenshotFilePath(config);
})

async function resolveScreenshotFilePath(config) {
  if (!config || typeof config.path !== 'string' || config.path.trim() === '') {
    throw new Error('Screenshot directory is empty');
  }

  const screenshotDirectory = config.path.trim();
  if (!ensureDirectoryExists(screenshotDirectory, 'screenshot')) {
    throw new Error(`Unable to create screenshot directory: ${screenshotDirectory}`);
  }

  let filePath = path.join(screenshotDirectory, `${config.calcedFileName}.${config.imageFormat}`);
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
}

function encodeScreenshotBuffer(buffer, format) {
  const image = nativeImage.createFromBuffer(buffer);
  return format === 'png' ? image.toPNG() : image.toJPEG(100);
}

ipcMain.handle('get-screen-sources', async () => {
  const displays = await screenshot.listDisplays();
  screenSourceCache = displays.map((display) => ({ id: display.id, name: display.name }));
  return screenSourceCache;
})

ipcMain.handle('get-capture-windows', async () => {
  if (process.platform !== 'win32' || typeof activeWin.getOpenWindows !== 'function') {
    captureWindowCache = [];
    return captureWindowCache;
  }

  const windows = await activeWin.getOpenWindows();
  captureWindowCache = windows
    .filter((item) => item && item.id && item.title && item.bounds)
    .filter((item) => item.bounds.width > 0 && item.bounds.height > 0)
    .filter((item) => item.bounds.x > -10000 && item.bounds.y > -10000)
    .map((item) => {
      return {
        id: item.id,
        title: item.title,
        ownerName: item.owner && item.owner.name ? item.owner.name : '',
        processId: item.owner && item.owner.processId ? item.owner.processId : 0,
        path: item.owner && item.owner.path ? item.owner.path : '',
        bounds: item.bounds
      };
    });

  return captureWindowCache;
})

function isLikelyBlackGameFrame(raw, width, height) {
  if (!raw || raw.length < width * height * 4 || width <= 0 || height <= 0) {
    return true;
  }

  const step = width * height > 1920 * 1080 ? 8 : 4;
  let sampled = 0;
  let dark = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const r = raw[offset];
      const g = raw[offset + 1];
      const b = raw[offset + 2];
      sampled++;
      if (r <= 8 && g <= 8 && b <= 8) dark++;
    }
  }

  return sampled > 0 && dark / sampled >= 0.995;
}

function getScreenshotWindowId(item) {
  return typeof item.id === 'function' ? item.id() : item.id;
}

function getScreenshotImageDimension(image, key) {
  return typeof image[key] === 'function' ? image[key]() : image[key];
}

async function captureWindowBuffer(windowId, format) {
  const windows = ScreenshotWindow.all();
  const targetWindow = windows.find((item) => String(getScreenshotWindowId(item)) === String(windowId));
  if (!targetWindow) {
    throw new Error($t('captureWindowNotFound'));
  }

  const image = await targetWindow.captureImage();
  const width = getScreenshotImageDimension(image, 'width');
  const height = getScreenshotImageDimension(image, 'height');
  const raw = await image.toRaw(true);
  if (isLikelyBlackGameFrame(raw, width, height)) {
    throw new Error('检测到游戏黑帧，拒绝保存黑屏截图');
  }

  const buffer = format === 'png' ? await image.toPng(true) : await image.toJpeg(true);
  if (!buffer || buffer.length === 0) {
    throw new Error('窗口捕获返回了空画面');
  }
  return buffer;
}

async function resolveCaptureWindow(config) {
  let selectedWindow = captureWindowCache.find((item) => String(item.id) === String(config.windowSourceId));
  if (!selectedWindow) {
    const windows = await activeWin.getOpenWindows();
    selectedWindow = windows
      .filter((item) => item && item.id && item.title && item.bounds)
      .find((item) => String(item.id) === String(config.windowSourceId));
  }
  if (!selectedWindow) {
    throw new Error($t('captureWindowNotFound'));
  }
  return selectedWindow;
}

ipcMain.handle('screen-shot', async (_, config) => {
  const format = config.imageFormat === 'png' ? 'png' : 'jpg';
  let buffer;

  const isWindowCapture = config.captureTargetType === 'window';
  if (isWindowCapture) {
    try {
      const selectedWindow = await resolveCaptureWindow(config);
      buffer = await captureWindowBuffer(selectedWindow.id, format);
    } catch (error) {
      log.warn('Game window capture rejected:', error);
      return null;
    }
  } else {
    let screenSourceId = config.screenSourceId;
    if (!screenSourceCache.some((display) => display.id === screenSourceId)) {
      screenSourceId = screenSourceCache[0] && screenSourceCache[0].id;
    }

    try {
      buffer = await screenshot({
        screen: screenSourceId,
        format
      });
    } catch (error) {
      screenSourceCache = (await screenshot.listDisplays()).map((display) => ({ id: display.id, name: display.name }));
      const fallbackDisplay = screenSourceCache[0];
      if (!fallbackDisplay) {
        throw new Error('No screen source available for capture');
      }
      buffer = await screenshot({
        screen: fallbackDisplay.id,
        format
      });
    }
  }

  if (!isWindowCapture) {
    buffer = encodeScreenshotBuffer(buffer, format);
  }

  let filePath = null;
  if (config.screenShotSaveWay != ScreenShotSaveWayEnum.CilpboardOnly) {
    try {
      filePath = await resolveScreenshotFilePath(config);
      if (filePath != null) {
        fs.writeFileSync(filePath, buffer);
      }
    } catch (error) {
      // 保存失败只影响本次截图，不要让 ENOENT/权限错误升级成应用崩溃。
      log.error(`Screenshot save failed: ${config && config.path ? config.path : '<empty path>'}`, error);
      return null;
    }
  }

  if (config.screenShotSaveWay != ScreenShotSaveWayEnum.FileOnly) {
    const image = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(image);
  }

  return filePath;
})
//#endregion

//#region SDL2方法
let device_instance;
let buttons = new Array(20).fill(false);
let axes = new Array(10).fill(0);
// 每个 hat 一个方向字符串（SDL 原生取值：centered / up / right / down / left / rightup / rightdown / leftup / leftdown）
let hatStates = [];
let hatCount = 0;

const HAT_DIRECTION_KEYS = ['up', 'right', 'down', 'left'];

/**
 * 把 SDL 的 hat 位置字符串展开成 [上, 右, 下, 左] 四个布尔值。
 * 斜向（rightup / leftdown 等）会同时命中两个方向。
 */
function hatValueToDirections(value) {
  const directions = [false, false, false, false];
  const v = String(value === undefined || value === null ? 'centered' : value).toLowerCase();
  if (!v || v === 'centered') {
    return directions;
  }
  for (let i = 0; i < HAT_DIRECTION_KEYS.length; i++) {
    if (v.includes(HAT_DIRECTION_KEYS[i])) {
      directions[i] = true;
    }
  }
  return directions;
}

/** 把所有 hat 的方向展开成一维布尔数组（多个 hat 依次拼接）。 */
function flattenHatStates() {
  const result = [];
  for (let i = 0; i < hatCount; i++) {
    result.push(...hatValueToDirections(hatStates[i]));
  }
  return result;
}

/**
 * 从设备实例同步一次 hat 状态。
 * hatMotion 事件在某些驱动/设备上会被合并甚至丢失，读取时再同步一次更可靠。
 */
function syncHatStatesFromDevice() {
  if (!device_instance || hatCount === 0) {
    return;
  }
  let current;
  try {
    current = device_instance.hats;
  } catch (e) {
    return;
  }
  if (!current) {
    return;
  }
  for (let i = 0; i < hatCount; i++) {
    if (current[i] !== undefined) {
      hatStates[i] = current[i];
    }
  }
}

function resetDeviceState() {
  const buttonCount = (device_instance && device_instance.buttons && device_instance.buttons.length)
    ? device_instance.buttons.length
    : 20;
  buttons = new Array(buttonCount).fill(false);
  const axisCount = (device_instance && device_instance.axes && device_instance.axes.length)
    ? device_instance.axes.length
    : 10;
  axes = new Array(axisCount).fill(0);
  hatCount = (device_instance && device_instance.hats && device_instance.hats.length)
    ? device_instance.hats.length
    : 0;
  hatStates = new Array(hatCount).fill('centered');
}

// 只把纯数据交给渲染进程：SDL 的 device 对象带内部引用，
// 一旦被 Vue 包成响应式 Proxy 再传回来就过不了结构化克隆（An object could not be cloned）
function toPlainDevice(device) {
  if (!device) return null;
  return {
    _index: device._index,
    id: device.id,
    name: device.name,
    path: device.path,
    guid: device.guid,
    type: device.type,
    vendor: device.vendor,
    product: device.product,
    version: device.version,
    player: device.player
  };
}

ipcMain.handle('get-all-gamepad', () => {
  return (sdl.joystick.devices || []).map(toPlainDevice);
})

ipcMain.handle('open-sdl2-device', async (_, device) => {
  // 兼容两种入参：设备对象（可能被 Vue 包成 Proxy）或直接的索引数字
  const rawIndex = (device !== null && typeof device === 'object') ? device._index : device;
  return openDeviceInstance(Number(rawIndex));
})

/**
 * 打开指定索引的手柄实例（截图页 / 调试页 / 映射引擎共用）。
 * 同一时刻只维护一个实例，重复打开会先释放旧的。
 */
function openDeviceInstance(index) {
  if (!Number.isInteger(index) || index < 0) {
    return false;
  }
  const sdlDevice = sdl.joystick.devices[index];
  if (!sdlDevice) {
    return false;
  }

  if (device_instance) {
    try {
      device_instance.removeAllListeners();
      device_instance.close();
    } catch (e) {
      // ignore
    }
    device_instance = void 0;
  }

  try {
    device_instance = sdl.joystick.openDevice(sdlDevice);
  } catch (e) {
    console.error('Failed to open SDL device:', e);
    return false;
  }

  resetDeviceState();

  device_instance.on('buttonDown', (data) => {
    buttons[data.button] = true;
  })

  device_instance.on('buttonUp', (data) => {
    buttons[data.button] = false;
  })

  // 十字键（hat）：不再限定 Xbox 型号，任何带 hat 的设备都会记录
  device_instance.on('hatMotion', (data) => {
    const index = Number.isInteger(data.hat) ? data.hat : 0;
    if (index >= 0 && index < hatCount) {
      hatStates[index] = data.value;
    }
  })

  device_instance.on('axisMotion', (data) => {
    axes[data.axis] = data.value;
  })

  return true
}

ipcMain.handle('remove-sdl2-device-instance-all-listeners', async () => {
  if (device_instance) {
    device_instance.removeAllListeners();
  }
  resetDeviceState();
})

ipcMain.handle('close-sdl2-instance-device', async () => {
  if (device_instance) {
    try {
      device_instance.removeAllListeners();
      device_instance.close();
    } catch (e) {
      // ignore
    }
    device_instance = void 0;
  }
  hatStates = [];
  hatCount = 0;
})

ipcMain.handle('get-current-buttons-value', async () => {
  if (!device_instance) {
    return buttons;
  }

  syncHatStatesFromDevice();

  let physicalButtons;
  try {
    physicalButtons = device_instance.buttons ? Array.from(device_instance.buttons) : buttons.slice();
  } catch (e) {
    physicalButtons = buttons.slice();
  }

  // 十字键作为虚拟按键追加在物理按键之后，索引 = 物理按键数 + hat * 4 + 方向
  if (hatCount > 0) {
    return physicalButtons.concat(flattenHatStates());
  }
  return physicalButtons;
})

ipcMain.handle('get-current-axes-value', async () => {
  if (device_instance && device_instance.axes) {
    const currentAxes = device_instance.axes;
    for (let i = 0; i < currentAxes.length; i++) {
      axes[i] = currentAxes[i];
    }
    return Array.from(currentAxes);
  }
  return axes;
})

ipcMain.handle('get-current-hats-value', async () => {
  syncHatStatesFromDevice();
  return flattenHatStates();
})

sdl.joystick.on('deviceAdd', (device) => {
  win.webContents.send('device-changed')
})

sdl.joystick.on('deviceRemove', (device) => {
  win.webContents.send('device-changed')
})

ipcMain.handle('get-device-instance-button-number', async () => {
  if (device_instance) {
    const physicalButtonCount = device_instance.buttons ? device_instance.buttons.length : 0;
    return physicalButtonCount + hatCount * 4;
  }
  return 0
})

ipcMain.handle('get-device-instance-physical-button-number', async () => {
  if (device_instance && device_instance.buttons) {
    return device_instance.buttons.length;
  }
  return 0
})

ipcMain.handle('get-device-instance-hat-number', async () => {
  return hatCount;
})

ipcMain.handle('get-device-instance-axis-number', async () => {
  if (device_instance && device_instance.axes) {
    return device_instance.axes.length;
  }
  return 0;
})

//#endregion

//#region 手柄按键映射（手柄 → 键盘）
let mappingEngine = null
let mappingKeySender = null

/**
 * 给映射引擎的手柄快照：物理按键 + 十字键虚拟按键 + 轴值。
 * 和 get-current-buttons-value 保持同一套索引规则，界面里录到的 ButtonN 才能对得上。
 */
function getMappingSnapshot() {
  if (!device_instance) return null
  try {
    const physical = device_instance.buttons ? Array.from(device_instance.buttons) : []
    syncHatStatesFromDevice()
    const hatButtons = hatCount > 0 ? flattenHatStates() : []
    const axisValues = device_instance.axes ? Array.from(device_instance.axes) : []
    return { buttons: physical.concat(hatButtons), axes: axisValues }
  } catch (error) {
    return null
  }
}

/** 没有任何页面打开过设备时，引擎自己拉起第一支手柄，保证映射随时可用 */
function ensureMappingDevice() {
  if (device_instance) return
  const devices = sdl.joystick.devices || []
  if (!devices.length) return
  openDeviceInstance(0)
}

function initMappingEngine() {
  if (mappingEngine) return mappingEngine
  mappingKeySender = createKeySender({ app, log })
  mappingEngine = createMappingEngine({
    configStore,
    log,
    getSnapshot: getMappingSnapshot,
    ensureDevice: ensureMappingDevice,
    keySender: mappingKeySender,
    notify: (entry) => {
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send('mapping:log', entry)
      }
    },
    // 顶栏的「映射监听」胶囊跟着总开关走
    onStateChange: (enabled) => {
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send('mapping:enabled-changed', !!enabled)
      }
    }
  })
  mappingEngine.init()
  return mappingEngine
}

ipcMain.handle('mapping:get-config', () => initMappingEngine().getConfig())
ipcMain.handle('mapping:save-config', (_, config) => initMappingEngine().save(config))
ipcMain.handle('mapping:set-enabled', (_, enabled) => initMappingEngine().setEnabled(enabled))
ipcMain.handle('mapping:get-status', () => initMappingEngine().getStatus())
ipcMain.handle('mapping:get-logs', () => initMappingEngine().getLogs())
ipcMain.handle('mapping:clear-logs', () => initMappingEngine().clearLogs())
ipcMain.handle('mapping:test-output', (_, codes) => initMappingEngine().testOutput(codes))
//#endregion

//#region  Win32
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('ensure-folder', async (_, folderPath) => {
  return ensureDirectoryExists(folderPath, 'ipc');
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

//#region 数据管理（日志 / 外部链接）
/** 打开外部网页链接（仅允许 http/https） */
ipcMain.handle('open-external', async (_, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return false;
  }
  await shell.openExternal(url);
  return true;
});

/** 递归删除目录（逐个文件删除，被占用的文件跳过并计数，避免整体失败） */
function removeDirectoryRecursive(targetPath) {
  const result = { removed: 0, failed: 0 };
  const walk = (currentPath) => {
    let stat;
    try {
      stat = fs.lstatSync(currentPath);
    } catch (error) {
      result.failed++;
      return;
    }
    if (!stat.isDirectory()) {
      try {
        fs.unlinkSync(currentPath);
        result.removed++;
      } catch (error) {
        result.failed++;
      }
      return;
    }
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath);
    } catch (error) {
      result.failed++;
      return;
    }
    for (const entry of entries) {
      walk(path.join(currentPath, entry));
    }
    try {
      fs.rmdirSync(currentPath);
      result.removed++;
    } catch (error) {
      result.failed++;
    }
  };
  walk(targetPath);
  return result;
}

/** 清空日志：当前日志文件用 electron-log 自带方法清空，其余文件直接删除 */
ipcMain.handle('clear-log-files', async () => {
  const logFile = log.transports.file.getFile().path;
  const logFolder = path.dirname(logFile);
  let removed = 0;
  let failed = 0;

  try {
    log.transports.file.getFile().clear();
    removed++;
  } catch (error) {
    failed++;
    log.error('[DATA] Failed to clear current log file:', error);
  }

  let entries = [];
  try {
    entries = fs.readdirSync(logFolder, { withFileTypes: true });
  } catch (error) {
    entries = [];
  }

  for (const entry of entries) {
    const fullPath = path.join(logFolder, entry.name);
    if (path.resolve(fullPath) === path.resolve(logFile)) continue;
    try {
      if (entry.isDirectory()) {
        const result = removeDirectoryRecursive(fullPath);
        removed += result.removed;
        failed += result.failed;
      } else {
        fs.unlinkSync(fullPath);
        removed++;
      }
    } catch (error) {
      failed++;
    }
  }

  return { ok: failed === 0, removed, failed, folder: logFolder };
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

/**
 * 热更新：GitHub 为源，国内镜像加速。
 * 检查 / 下载 / 落地替换的细节都在 @/lib/updater 里，这里只做 IPC 桥接。
 */

// 兼容旧接口：返回 { hasUpdate, latestVersion, currentVersion, releaseUrl }
ipcMain.handle('check-for-updates', async () => {
  const state = await updater.check().catch(() => updater.getState())
  const hasUpdate = state.status === updater.STATUS.AVAILABLE || state.status === updater.STATUS.MANUAL
  return {
    hasUpdate,
    latestVersion: state.latestVersion,
    currentVersion: state.currentVersion,
    releaseUrl: state.releaseUrl,
    mode: state.mode,
    notes: state.notes,
    status: state.status,
    error: state.error
  }
})

ipcMain.handle('updater:get-state', () => updater.getState())

ipcMain.handle('updater:check', async (_, options) => {
  return await updater.check({ quiet: !!(options && options.quiet) })
})

ipcMain.handle('updater:download', async () => {
  try {
    updater.assertSaneSize()
  } catch (error) {
    return { ...updater.getState(), status: updater.STATUS.ERROR, error: error.message }
  }
  return await updater.download()
})

ipcMain.handle('updater:cancel', () => updater.cancel())

ipcMain.handle('updater:apply', () => updater.apply())

ipcMain.handle('updater:open-release', async (_, url) => {
  const target = url || updater.getState().releaseUrl
  if (target) shell.openExternal(target)
})

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

function showScreenshotNotification({ img, title = '截图成功', desc = '已保存到本地', type, duration = 3000 }) {
  // 如果已有通知，先关闭
  if (overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
    clearTimeout(overlayTimeout);
  }

  // 获取主屏幕尺寸，根据通知位置设置定位到左上角或右上角
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();

  // 浮层大小：卡片内容通过 scale（CSS zoom）整体等比缩放，滑动条可在 0.8x–2x 间连续调节；
  // 兼容旧版 small/medium/large 预设值（等价于 0.8x / 1x / 1.25x）。
  // 窗口尺寸只需容纳对应缩放后的卡片 + 角部偏移即可（透明区域不可见）。
  // Electron BrowserWindow 以逻辑像素（DIP）创建，会随系统缩放/DPI 自动放大。
  const rawSizePreset = configStore.get('overlayNotifySize', 1);
  let scale = Number.parseFloat(rawSizePreset);
  if (!Number.isFinite(scale)) {
    const legacyScales = { small: 0.8, medium: 1, large: 1.25 };
    scale = legacyScales[String(rawSizePreset).toLowerCase()] || 1;
  }
  scale = Math.min(2, Math.max(0.8, scale));
  // 以中号（scale=1）为基准尺寸，窗口随缩放比例放大/缩小
  const baseWidth = 480;
  const baseHeight = 210;
  const overlayWidth = Math.round(baseWidth * scale);
  const overlayHeight = Math.round(baseHeight * scale);

  const pos = configStore.get('overlayNotifyPosition', 'left') === 'right' ? 'right' : 'left';
  const x = pos === 'right' ? Math.max(0, display.bounds.width - overlayWidth) : 0;
  const y = 0;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
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
    query: { img, title, desc, type, pos, scale }
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
  log.error(`[FATAL CRASH] [Version:${packageJson.version}] ${title}:`, error);
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
