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
const { pathToFileURL } = require('url')
const vm = require('vm')

if (process.platform === 'win32') {
  app.setAppUserModelId('GamePad Screenshot Tool');
}

//Scripts
const { screenshotSoundEnum, CommonButtonEnum, ScreenShotSaveWayEnum } = require('@/lib/enum')
const { snapUiScale, migrateLegacyUiScale, UI_SCALE_DEFAULT, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_VERSION } = require('@/lib/uiScale')
// 窗口来源枚举：不要求窗口带标题栏，否则无边框全屏的游戏会被过滤掉
const { enumerateCaptureWindows, listCaptureMonitors, findCaptureMonitor } = require('@/lib/captureWindows')
// 截图编码：JPEG 走 Chromium 的 libjpeg-turbo，比 node-screenshots 自带编码器快约 5 倍
const { encodeCapturedImage } = require('@/lib/captureEncode')
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
  // 录制进程必须强杀：Windows 上父进程退出不会带走子进程，
  // 留着会让 ffmpeg 继续占着编码器（下次启动就抢不到硬件了）
  if (recorderEngine) recorderEngine.killNow()
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
// params 是可选的占位符表：`{ms}` 这类记号和渲染进程 vue-i18n 的写法保持一致，
// 这样同一条文案（比如 DebugInfo 烧进图的那两行）在主进程里也能带数字。
function $t(key, params) {
  let locale = configStore.get(localeKey, 'zh');
  const dict = messages[locale] || messages.en;
  // 支持 "menu.file.save" 这种嵌套路径
  const text = key.split('.').reduce((obj, i) => (obj ? obj[i] : null), dict) || key;
  if (!params || typeof text !== 'string') return text;
  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
    params[name] !== undefined ? String(params[name]) : match);
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

//#region DebugInfo（实验性功能）
/**
 * ffmpeg 定位。录像引擎已经带一份（vendor / resources 里的 ffmpeg.exe），
 * 这里复用它，并顺手把「找不到」降级成 null —— DebugInfo 不该因为缺 ffmpeg 就影响截图。
 */
function getBurnFfmpegPath() {
  try {
    return recorderEngine.ffmpegPath();
  } catch (error) {
    log.warn('[DebugInfo] ffmpeg 定位失败:', error);
    return '';
  }
}

function formatMs(value) {
  return `${Number.isFinite(value) ? Math.round(value) : 0} ms`;
}

/** 烧进图片的两行：总延迟 + 各阶段拆开 */
function buildDebugInfoLines(stages) {
  return [
    $t('debugInfo.burnTotal', { ms: Math.round(stages.total || 0) }),
    $t('debugInfo.burnStages', {
      dismiss: Math.round(stages.dismiss || 0),
      capture: Math.round(stages.capture || 0),
      encode: Math.round(stages.encode || 0)
    })
  ];
}

async function burnCaptureDebugInfo(buffer, format, stages, { windowCapture }) {
  const burned = await burnDebugInfo(buffer, format, buildDebugInfoLines(stages), {
    ffmpegPath: getBurnFfmpegPath(),
    tempDir: app.getPath('temp'),
    log
  });
  if (!burned) {
    log.warn('[DebugInfo] 本次烧录未成功，保存的是没有调试信息的原始截图', windowCapture ? '(窗口抓屏)' : '(整屏)');
  }
  return burned;
}

/** 同一组数字也写进日志，方便对照「图上的延迟」和「实际耗时」 */
function logCaptureDebugInfo(stages, { windowCapture, format, filePath }) {
  const line = `[DebugInfo] ${windowCapture ? '窗口' : '整屏'} ${format.toUpperCase()}`
    + ` 总延迟 ${formatMs(stages.total)}`
    + ` · 清场 ${formatMs(stages.dismiss)}`
    + ` · 抓屏 ${formatMs(stages.capture)}`
    + ` · 编码 ${formatMs(stages.encode)}`
    + ` · 烧录 ${formatMs(stages.burn)}`
    + ` · 保存 ${formatMs(stages.save)}`
    + ` → ${filePath || '(仅剪贴板)'}`;
  log.info(line);
}
//#endregion

/** 显示器下拉框 / 抓屏共用的来源列表（id 用显示器设备名，兼容老配置） */
function refreshScreenSourceCache() {
  screenSourceCache = listCaptureMonitors().map((monitor) => {
    const id = monitor.name || String(monitor.id);
    return { id, name: id };
  });
  return screenSourceCache;
}

ipcMain.handle('get-screen-sources', async () => {
  // 枚举口径统一到 node-screenshots —— 它本来就是真正抓屏的那个库，
  // 列表里的 id 和「能截到的显示器」天然一致（原来用 screenshot-desktop 列、
  // 再拿它的 id 去抓，中间隔着一次 cmd.exe 调用，列表和抓屏两套口径）。
  // id 仍沿用显示器设备名（\\.\DISPLAY1），老配置里的 screenSourceId 不用迁移。
  return refreshScreenSourceCache();
})

ipcMain.handle('get-capture-windows', async () => {
  captureWindowCache = await enumerateCaptureWindows();
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

/**
 * 抓屏只负责「把画面拿到手」，编码放到下一步 —— 这样 DebugInfo 才能把
 * 「抓屏」和「编码」分开计时，也方便把同一份 raw 复用给黑帧检测和 JPEG 编码。
 */
async function captureWindowImage(windowId) {
  const windows = ScreenshotWindow.all();
  const targetWindow = windows.find((item) => String(getScreenshotWindowId(item)) === String(windowId));
  if (!targetWindow) {
    throw new Error($t('captureWindowNotFound'));
  }

  return targetWindow.captureImage();
}

/**
 * 整屏抓屏：进程内 WGC，不需要起子进程。
 *
 * 旧实现走 screenshot-desktop：每次抓屏都要 cmd.exe → 现场编译/调起的 C# 程序
 * → 写临时 bmp → 再读回 Node（实测 4K 下 280~320ms，其中光 listDisplays 就 95ms）。
 * 换成本库后同一块屏约 65ms，而且和窗口抓屏共用一套 DPI / 坐标系。
 */
async function captureMonitorImage(screenSourceId) {
  let monitor = findCaptureMonitor(screenSourceId);
  if (!monitor) {
    // 缓存可能是空的（渲染进程还没拉过来源列表），也可能是 id 失效（换显示器、热插拔）。
    // 两种情况都现场重枚举一次，再退回第一块屏，和旧逻辑一致。
    const sources = refreshScreenSourceCache();
    if (sources.length) {
      monitor = findCaptureMonitor(sources[0].id);
    }
  }
  if (!monitor) {
    throw new Error('No screen source available for capture');
  }

  return monitor.captureImage();
}

/**
 * 兜底：WGC 不可用（Win7 等老系统）或注入失败时，退回旧的外部进程抓屏。
 * 慢，但只在异常路径上走。
 */
async function captureScreenBufferByDesktop(screenSourceId, format) {
  const known = screenSourceId && screenSourceCache.some((display) => display.id === screenSourceId);
  try {
    const buffer = await screenshot(known ? { screen: screenSourceId, format } : { format });
    return encodeScreenshotBuffer(buffer, format);
  } catch (error) {
    log.warn('Legacy screen capture failed, retrying with default display:', error);
    const buffer = await screenshot({ format });
    return encodeScreenshotBuffer(buffer, format);
  }
}

async function resolveCaptureWindow(config) {
  const windowId = String(config.windowSourceId);
  let selectedWindow = captureWindowCache.find((item) => String(item.id) === windowId);
  if (!selectedWindow) {
    // 缓存过期（比如截完图窗口才切换）就现场重枚举一次，口径和下拉框保持一致
    try {
      captureWindowCache = await enumerateCaptureWindows();
    } catch (error) {
      log.warn('Re-enumerate capture windows failed:', error);
    }
    selectedWindow = captureWindowCache.find((item) => String(item.id) === windowId);
  }
  if (!selectedWindow) {
    throw new Error($t('captureWindowNotFound'));
  }
  return selectedWindow;
}

ipcMain.handle('screen-shot', async (_, config) => {
  const format = config.imageFormat === 'png' ? 'png' : 'jpg';
  let buffer;
  let image = null;

  // DebugInfo（实验性功能）：秒表从进入 handler 起算，每段各记自己花了多久。
  // 「总延迟」= 清场 + 抓屏 + 编码，也就是「按键到画面真的被抓下来」这段时间；
  // 烧录和保存发生在画面已经到手之后，只进日志、不计进总延迟。
  const debugInfoEnabled = isDebugInfoEnabled(configStore);
  let stageStart = Date.now();
  const handlerStartedAt = stageStart;
  const stages = {};
  const markStage = (name) => {
    const now = Date.now();
    stages[name] = now - stageStart;
    stageStart = now;
  };

  const isWindowCapture = config.captureTargetType === 'window';
  // 「截图前销毁浮层」开关开启时：先把上一次截图的预览浮层清掉再抓画面，
  // 否则浮层（alwaysOnTop + screen-saver 层级）会被一起截进新图里。
  // 整屏抓屏要在浮层销毁后补一帧合成；窗口抓屏只关浮层、不等帧。
  await dismissOverlayBeforeCapture({ waitForComposition: !isWindowCapture });
  markStage('dismiss');

  if (isWindowCapture) {
    try {
      const selectedWindow = await resolveCaptureWindow(config);
      image = await captureWindowImage(selectedWindow.id);
    } catch (error) {
      log.warn('Game window capture rejected:', error);
      return null;
    }
  } else {
    try {
      image = await captureMonitorImage(config.screenSourceId);
    } catch (error) {
      // 进程内抓屏起不来才退回旧实现，正常情况下不该走到这里
      log.warn('[CAPTURE] In-process screen capture failed, falling back to legacy capture:', error);
      buffer = await captureScreenBufferByDesktop(config.screenSourceId, format);
    }
  }
  markStage('capture');

  if (image) {
    if (isWindowCapture) {
      // 黑帧检测：WGC 抓受保护内容（部分 DRM / 独占全屏）会返回一整张纯黑，
      // 存下来就是一张黑图。raw 顺手复用给 JPEG 编码，不多花一次拷贝。
      const raw = await image.toRaw(true);
      const width = getScreenshotImageDimension(image, 'width');
      const height = getScreenshotImageDimension(image, 'height');
      if (isLikelyBlackGameFrame(raw, width, height)) {
        log.warn('Game window capture rejected: 检测到游戏黑帧，拒绝保存黑屏截图');
        return null;
      }
      buffer = await encodeCapturedImage(image, format, { raw });
    } else {
      buffer = await encodeCapturedImage(image, format);
    }
  }
  markStage('encode');

  // 画面到手的那一刻就是「延迟」的终点：抓屏之后做的事（烧录、写盘）不该算进去
  const totalDelayMs = Date.now() - handlerStartedAt;
  stages.total = totalDelayMs;

  if (debugInfoEnabled) {
    const burned = await burnCaptureDebugInfo(buffer, format, stages, { windowCapture: isWindowCapture });
    if (burned) buffer = burned;
    markStage('burn');
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
  markStage('save');

  if (config.screenShotSaveWay != ScreenShotSaveWayEnum.FileOnly) {
    const image = nativeImage.createFromBuffer(buffer);
    clipboard.writeImage(image);
  }

  if (debugInfoEnabled) logCaptureDebugInfo(stages, { windowCapture: isWindowCapture, format, filePath });

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

// 扳机/摇杆「越过阈值」的推送状态：只在跨越时推一次，摇杆抖动不会刷屏
const AXIS_PUSH_THRESHOLD = 0.85;
let axisArmed = [];

/**
 * 手柄输入变化的即时推送。
 *
 * 渲染进程本来靠 60ms 一次轮询判断组合键，也就是说「松手」这个动作最多要多等
 * 一整个轮询周期（平均 30ms、最坏 60ms）才会被截图逻辑看到。
 * 这里在状态真正变化时补一条推送，让渲染进程立刻复查一次；轮询继续负责长按判定
 * 和界面预览，两者互不冲突（截图入口本身有 screenShoting 互斥）。
 */
function pushGamepadInputEvent(kind) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('gamepad-input-event', kind);
  } catch (e) {
    // 窗口正在销毁时 send 会抛，忽略即可
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
  axisArmed = new Array(axisCount).fill(false);
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

//#region 内置录制引擎（FFmpeg 子进程）
//
// 这整套是为了替掉「必须装 OBS 才能存最近 N 秒」的依赖。
// 采集、编码、内存环形缓冲全在自己进程里，配置项与 OBS 对等：
// 采集源（全屏/窗口）、编码引擎（NVENC / QSV / AMF / x264）、
// 分辨率帧率码率、以及编码过载自检。

const { createRecorder } = require('@/lib/recorder')
const { run: runFfmpeg } = require('@/lib/recorder/ffmpeg')
// DebugInfo（实验性功能）：把截图延迟烧进图片像素
const { isDebugInfoEnabled, burnDebugInfo } = require('@/lib/burnDebugInfo')

const RECORDING_CONFIG_KEY = 'recordingConfig'

const recorderEngine = createRecorder({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  appPath: app.getAppPath(),
  // 采集脚本写到 userData 下（和 keySender 一样），打包后也能原地更新
  app,
  log
})

// 缓冲进度推送的节流时间戳（主进程侧，避免每个采样都过一遍 IPC）
let lastReplayPush = 0
// 上一次生成的回放缩略图（保存新片段时顺手删掉，避免临时目录堆积）
let lastReplayThumb = ''

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 采集源的原始像素尺寸，以及「这个窗口是不是正好铺满某块屏」。
 *
 * 尺寸的用途有两个：
 *   1. 判断用户选的分辨率是不是「和源一样大」——一样大就不能挂 scale，
 *      否则 d3d11 硬件帧协商不出 CPU 像素格式，整条命令 0 帧退出。
 *   2. 给压测报一个真实分辨率。
 *
 * 全部按物理像素算：显示器信息来自 node-screenshots（本来就是物理像素），
 * 窗口的 bounds 是 DIP，要乘它所在显示器的 scaleFactor。
 *
 * fallbackDisplayIndex 只在「窗口尺寸刚好等于某块屏的物理尺寸」且唯一匹配时给出 ——
 * 这就是独占全屏游戏的情形：gfxcapture 打不开这种窗口，但直接录那块屏效果一样。
 */
function resolveSourceInfo(target) {
  try {
    const { listCaptureMonitors, listCaptureWindows } = require('@/lib/captureWindows')
    const monitors = listCaptureMonitors()

    if (target.type === 'window') {
      const hwnd = Number(target.hwnd)
      const win = captureWindowCache.find((item) => Number(item.id) === hwnd)
        // 缓存里没有（用户没打开过窗口下拉框）就现枚举一次
        || listCaptureWindows().find((item) => Number(item.id) === hwnd)
      const bounds = win && win.bounds
      if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) {
        return { width: 0, height: 0, displayIndex: undefined }
      }
      const factor = Number(win.scaleFactor) || 1
      const width = Math.round(bounds.width * factor)
      const height = Math.round(bounds.height * factor)
      const matching = monitors.filter(
        (m) => Math.abs(m.width - width) <= 2 && Math.abs(m.height - height) <= 2
      )
      return {
        width,
        height,
        // 多块同分辨率屏时无法判断是哪一块，宁可不给（走 gdigrab 兜底）
        displayIndex: matching.length === 1 ? matching[0].index : undefined
      }
    }

    const monitor = monitors[Number(target.displayIndex) || 0]
      || monitors.find((m) => m.primary)
      || null
    if (monitor) return { width: monitor.width, height: monitor.height, displayIndex: monitor.index }
    return { width: 0, height: 0, displayIndex: undefined }
  } catch (error) {
    log.warn('[recorder] resolve source size failed:', error)
    return { width: 0, height: 0, displayIndex: undefined }
  }
}

/**
 * 把设置页存的录像配置 + 本次调用的覆盖项，合成引擎参数。
 *
 * 窗口模式必须拿到有效 HWND（active-win 返回的 id 就是 HWND），
 * 拿不到就静默退回全屏 —— 总比抛错让长按没反应好。
 */
function buildRecorderOptions(overrides = {}) {
  const saved = configStore.get(RECORDING_CONFIG_KEY, {}) || {}
  const merged = { ...saved, ...overrides }

  const isWindow = merged.targetType === 'window'
  const hwnd = Number(merged.windowSourceId)
  const target = isWindow && Number.isFinite(hwnd) && hwnd > 0
    ? { type: 'window', hwnd }
    : { type: 'screen', displayIndex: clampNumber(merged.displayIndex, 0, 16, 0) }

  const width = clampNumber(merged.width, 0, 7680, 0)
  const height = clampNumber(merged.height, 0, 4320, 0)

  // 源的原始像素尺寸：决定「要不要真的缩放」，也用来给压测报一个真实分辨率
  const sourceInfo = resolveSourceInfo(target)

  // 压测用的分辨率：没指定缩放时按采集源的物理像素算。
  let testWidth = width
  let testHeight = height
  if (!testWidth || !testHeight) {
    testWidth = width || sourceInfo.width || 1920
    testHeight = height || sourceInfo.height || 1080
  }

  return {
    target,
    sourceWidth: sourceInfo.width,
    sourceHeight: sourceInfo.height,
    // 窗口铺满某块屏时（独占全屏游戏），gfxcapture 抓不动就改录这块屏
    fallbackDisplayIndex: sourceInfo.displayIndex,
    encoderId: typeof merged.encoderId === 'string' && merged.encoderId ? merged.encoderId : 'h264_nvenc',
    fps: clampNumber(merged.fps, 15, 240, 60),
    mode: merged.mode === 'bitrate' ? 'bitrate' : 'quality',
    // 质量值 0~51（OBS 的 ICQ/CQ/CRF 同一套刻度），老配置里是 0~100 的百分比
    quality: Number.isFinite(Number(merged.quality))
      ? clampNumber(merged.quality, 0, 51, 23)
      : undefined,
    qualityPercent: clampNumber(merged.qualityPercent, 0, 100, 55),
    bitrate: clampNumber(merged.bitrate, 500000, 200000000, 12000000),
    // 对齐 OBS 编码器面板的细项
    preset: ['speed', 'balanced', 'quality'].includes(merged.preset) ? merged.preset : 'balanced',
    profile: merged.profile === 'high' ? 'high' : 'main',
    // B 帧固定关闭：它会让 fMP4 的 DTS/PTS 顺序错开，
    // 回放缓存按关键帧切片时容易切出无法解码的片段，收益不值这个风险
    bf: 0,
    // 关键帧间隔：回放缓存里由 startReplayBuffer 强制 1 秒，这里只作默认值
    gopSeconds: 1,
    bufferSeconds: clampNumber(merged.bufferSeconds, 5, 300, 30),
    // 回放缓存的内存上限（OBS 里叫「最大内存」）
    bufferMaxMB: clampNumber(merged.bufferMaxMB, 64, 8192, 2048),
    cursor: merged.cursor !== false,
    width,
    height,
    testWidth,
    testHeight,
    // 系统声音：必录，配置里只记「录哪一路输出」。
    // deviceId 为空表示跟随系统默认输出（用户在 Windows 里换默认设备会跟着变）
    audio: {
      deviceId: merged.audio && typeof merged.audio.deviceId === 'string' ? merged.audio.deviceId : '',
      bitrate: clampNumber(merged.audio && merged.audio.bitrate, 64000, 512000, 192000)
    }
  }
}

ipcMain.handle('recorder:audio-devices', async (_, options) => {
  try {
    return await recorderEngine.listAudioDevices({ force: !!(options && options.force) })
  } catch (error) {
    log.error('[recorder] audio device list failed:', error)
    return { ok: false, devices: [], error: error.message || String(error) }
  }
})

ipcMain.handle('recorder:audio-probe', async (_, deviceId) => {
  try {
    return await recorderEngine.probeAudioDevice(deviceId || '')
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('recorder:capabilities', async (_, options) => {
  try {
    return await recorderEngine.getCapabilities({ force: !!(options && options.force) })
  } catch (error) {
    log.error('[recorder] capabilities failed:', error)
    return { error: error.message || String(error) }
  }
})

ipcMain.handle('recorder:selftest', async (_, config) => {
  try {
    return await recorderEngine.selfTest(buildRecorderOptions(config || {}))
  } catch (error) {
    log.error('[recorder] selftest failed:', error)
    return { ok: false, frames: 0, error: error.message || String(error) }
  }
})

ipcMain.handle('recorder:config-get', () => configStore.get(RECORDING_CONFIG_KEY, {}) || {})

ipcMain.handle('recorder:config-set', (_, config) => {
  if (!config || typeof config !== 'object') return false
  configStore.set(RECORDING_CONFIG_KEY, config)
  return true
})

/**
 * 启动回放缓存。上层应该在「开始监听手柄」时调它、停止监听时关它 ——
 * 缓存期间编码器是持续工作的，不适合开机常驻。
 */
ipcMain.handle('recorder:replay-start', async (_, overrides) => {
  try {
    const options = buildRecorderOptions(overrides || {})
    const started = await recorderEngine.startReplayBuffer(options, {
      onProgress: (sample, summary) => {
        // 前端只关心「缓冲了多少秒」，完整采样太吵，按 500ms 节流推送
        const now = Date.now()
        if (now - lastReplayPush < 500) return
        lastReplayPush = now
        // 过载判定用 session.summarize 的结论（近 8 个采样的 speed 中位数 + 真实丢帧），
        // 不要用单个采样的 speed —— ddagrab 画面静止时突增一批帧会把瞬时 speed 打到 0.5
        const overload = summary || {}
        if (win && !win.isDestroyed()) {
          win.webContents.send('recorder:replay-progress', {
            buffer: sample.buffer,
            speed: overload.medianSpeed || sample.speed,
            fps: overload.avgFps || sample.fps,
            dropFrames: sample.dropFrames,
            dropped: overload.dropped || 0,
            overloaded: !!overload.overloaded
          })
        }
      },
      onLog: (line) => log.warn('[ffmpeg] ' + line),
      onExit: (result) => {
        if (result && !result.stopped) {
          log.warn('[recorder] replay buffer exited unexpectedly:', result)
        }
        if (win && !win.isDestroyed()) {
          win.webContents.send('recorder:replay-exit', {
            code: result ? result.code : null,
            stopped: !!(result && result.stopped)
          })
        }
      }
    })
    return { ok: true, ...started, state: recorderEngine.getReplayState() }
  } catch (error) {
    log.error('[recorder] replay start failed:', error)
    return { ok: false, error: error.message || String(error) }
  }
})

ipcMain.handle('recorder:replay-stop', async () => {
  try {
    await recorderEngine.stopReplayBuffer()
    return true
  } catch (error) {
    log.error('[recorder] replay stop failed:', error)
    return false
  }
})

ipcMain.handle('recorder:replay-state', () => recorderEngine.getReplayState())

/**
 * 给刚保存的回放片段抽一帧当浮窗缩略图。
 *
 * 存的是分片 MP4（moov 里没有样本索引），所以不用 -ss 跳转 ——
 * 直接从第一帧解，省掉退索引的麻烦，1~2 秒的缓冲里抽一张也足够快。
 * 任何失败都只返回空串：缩略图是锦上添花，不能让它把「保存成功」变成失败。
 */
async function makeReplayThumbnail(videoPath) {
  try {
    const exe = recorderEngine.ffmpegPath()
    const target = path.join(app.getPath('temp'), `replay-thumb-${Date.now()}.jpg`)
    const result = await runFfmpeg(exe, [
      '-hide_banner', '-loglevel', 'error',
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=192:-2',
      '-q:v', '4',
      '-y', target
    ], 10000)
    if (!result.ok || !fs.existsSync(target)) return ''

    // 只留最新一张：浮窗要的尺寸很小，没必要攒文件
    if (lastReplayThumb && lastReplayThumb !== target) {
      try { fs.unlinkSync(lastReplayThumb) } catch (error) { /* 正被浮窗占用就算了 */ }
    }
    lastReplayThumb = target
    return pathToFileURL(target).href
  } catch (error) {
    log.warn('[recorder] replay thumbnail failed:', error)
    return ''
  }
}

/**
 * 保存最近 N 秒。
 * 文件名走和截图一样的模板与冲突策略，扩展名固定 mp4。
 */
ipcMain.handle('recorder:replay-save', async (_, config) => {
  try {
    const request = config || {}
    const filePath = await resolveScreenshotFilePath({
      path: request.path,
      calcedFileName: request.calcedFileName,
      imageFormat: 'mp4'
    })
    if (!filePath) return { ok: false, cancelled: true }

    const saved = await recorderEngine.saveReplay(filePath)
    log.info('[recorder] replay saved:', filePath, saved)
    const thumb = await makeReplayThumbnail(filePath)
    return { ok: true, path: filePath, thumb, ...saved }
  } catch (error) {
    log.error('[recorder] replay save failed:', error)
    return { ok: false, error: error.message || String(error) }
  }
})

//#endregion

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
    pushGamepadInputEvent('button');
  })

  device_instance.on('buttonUp', (data) => {
    buttons[data.button] = false;
    pushGamepadInputEvent('button');
  })

  // 十字键（hat）：不再限定 Xbox 型号，任何带 hat 的设备都会记录
  device_instance.on('hatMotion', (data) => {
    const index = Number.isInteger(data.hat) ? data.hat : 0;
    if (index >= 0 && index < hatCount) {
      hatStates[index] = data.value;
      pushGamepadInputEvent('hat');
    }
  })

  device_instance.on('axisMotion', (data) => {
    axes[data.axis] = data.value;
    // 只在「按下/松开」跨越阈值时推一次：摇杆静止时的细碎抖动不该触发整条截图链路
    const armed = Math.abs(data.value) >= AXIS_PUSH_THRESHOLD;
    if (axisArmed[data.axis] !== armed) {
      axisArmed[data.axis] = armed;
      pushGamepadInputEvent('axis');
    }
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

//#region 手柄界面导航输入
let lastNavEnsureAt = 0;

/**
 * 界面导航用的输入快照（按键 + 十字键 + 轴）。
 * 没有页面打开过设备时自己拉起第一支手柄，让「用手柄操作界面」开机即可用；
 * 失败时 2 秒才重试一次，避免每次轮询都去 openDevice。
 */
ipcMain.handle('get-nav-state', () => {
  if (!device_instance) {
    const now = Date.now();
    if (now - lastNavEnsureAt > 2000) {
      lastNavEnsureAt = now;
      ensureNavDevice();
    }
    if (!device_instance) return null;
  }
  try {
    syncHatStatesFromDevice();
    return {
      buttons: device_instance.buttons ? Array.from(device_instance.buttons) : [],
      axes: device_instance.axes ? Array.from(device_instance.axes) : [],
      hats: hatCount > 0 ? flattenHatStates() : []
    };
  } catch (error) {
    return null;
  }
});

/** 界面导航专用：没有已打开的设备时打开第一支手柄（与映射引擎的兜底逻辑一致） */
function ensureNavDevice() {
  if (device_instance) return true;
  const devices = sdl.joystick.devices || [];
  if (!devices.length) return false;
  try {
    return openDeviceInstance(0);
  } catch (error) {
    log.warn('[NAV] Failed to open gamepad for UI navigation:', error);
    return false;
  }
}
//#endregion

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

//#region 应用内文件夹浏览（手柄无法操作系统对话框，改由渲染进程自绘）
/** 目录列表里过滤掉的系统目录 */
const NAV_HIDDEN_DIRS = new Set(['System Volume Information', '$RECYCLE.BIN', 'Config.Msi', 'Recovery'])
const NAV_MAX_DIRS = 400

function listChildDirectories(targetPath) {
  const dirs = []
  let entries = []
  entries = fs.readdirSync(targetPath, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
    if (NAV_HIDDEN_DIRS.has(entry.name)) continue;
    dirs.push({ name: entry.name, path: path.join(targetPath, entry.name) })
    if (dirs.length >= NAV_MAX_DIRS) break;
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }))
  return dirs
}

function listWindowsDrives() {
  const drives = []
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i)
    const root = `${letter}:\\`
    try {
      if (fs.existsSync(root)) drives.push({ name: `${letter}:`, path: root })
    } catch (error) {
      // 光驱 / 无权限的盘符直接跳过
    }
  }
  return drives
}

/** 把用户传进来的路径（可能是文件、可能已失效）折算成一个真实存在的目录 */
function resolveExistingDirectory(input) {
  const candidates = []
  if (typeof input === 'string' && input.trim()) {
    const raw = input.trim().replace(/^"+|"+$/g, '')
    candidates.push(raw)
    // 传的是文件路径时退到父目录
    if (path.extname(raw)) candidates.push(path.dirname(raw))
  }
  candidates.push(getConfiguredScreenshotPath())
  for (const key of ['pictures', 'desktop', 'home']) {
    try {
      candidates.push(app.getPath(key))
    } catch (error) {
      // 个别系统上取不到该目录，忽略
    }
  }
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = path.resolve(candidate)
      if (fs.statSync(resolved).isDirectory()) return resolved;
    } catch (error) {
      // 不存在就试下一个
    }
  }
  return '';
}

function getQuickPaths() {
  const quick = []
  for (const key of ['desktop', 'pictures', 'documents', 'downloads']) {
    try {
      const dir = app.getPath(key)
      if (dir && fs.existsSync(dir)) quick.push({ key, path: dir })
    } catch (error) {
      // 该平台没有这个目录
    }
  }
  return quick
}

ipcMain.handle('list-directories', (_, targetPath) => {
  const current = resolveExistingDirectory(targetPath)
  if (!current) {
    return { path: '', parent: '', dirs: [], drives: listWindowsDrives(), quick: getQuickPaths(), error: 'empty' }
  }
  let dirs = []
  let failed = false
  try {
    dirs = listChildDirectories(current)
  } catch (error) {
    failed = true
    log.warn('[NAV] Failed to list directory:', current, error && error.message)
  }
  const parentPath = path.dirname(current)
  return {
    path: current,
    parent: parentPath && parentPath !== current ? parentPath : '',
    dirs,
    drives: listWindowsDrives(),
    quick: getQuickPaths(),
    error: failed ? 'unreadable' : ''
  }
})

ipcMain.handle('get-quick-paths', () => getQuickPaths())
//#endregion

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

// 「截图前先销毁浮层」开关（默认关闭，保持旧版行为）
const overlayDismissBeforeCaptureKey = 'overlayDismissBeforeCapture';
// 'closed' 事件的兜底上限。正常情况下销毁完成的那一刻事件就派发了，只有一两毫秒；
// 这个上限只在极端情况下生效（浮层被外部强杀、事件没派发），保证截图不会被卡死。
const OVERLAY_CLOSED_GUARD_MS = 150;
// 读不到显示器刷新率时用它估一帧
const OVERLAY_FALLBACK_HZ = 60;

function isOverlayDismissBeforeCaptureEnabled() {
  const value = configStore.get(overlayDismissBeforeCaptureKey, false);
  return value === true || value === 'true';
}

/**
 * 一帧的时长：直接问显示器自己的刷新率，不写死延时。
 * 主进程拿不到 DWM 的 vsync 回调，所以只能按刷新率换算出「一帧」来逼近下一帧。
 */
function displayFrameMs() {
  let hz = 0;
  try {
    hz = Number(screen.getPrimaryDisplay().displayFrequency) || 0;
  } catch (error) {
    hz = 0;
  }
  if (!Number.isFinite(hz) || hz < 20 || hz > 400) hz = OVERLAY_FALLBACK_HZ;
  // 上下限夹一下：240Hz 约 4ms，异常数据不会退化成几百毫秒的等待
  return Math.min(64, Math.max(4, Math.round(1000 / hz)));
}

/**
 * 等显示器过一帧。
 * Node 的定时器不对齐 vsync，所以这里只能按刷新率近似：到点后再接一个
 * setImmediate，确保真正排到事件循环的下一个 tick 才去抓屏。
 */
function waitFrame(frameMs) {
  return new Promise((resolve) => {
    setTimeout(() => setImmediate(resolve), frameMs);
  });
}

/**
 * 等浮层的原生窗口真正销毁。
 * 'closed' 派发时 HWND 已经没了 —— 也就是 DWM 上那一层确定没了的那一刻。
 */
function onceNativeWindowClosed(target) {
  return new Promise((resolve) => {
    if (target.isDestroyed()) {
      resolve();
      return;
    }
    let guardTimer = null;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (guardTimer) clearTimeout(guardTimer);
      resolve();
    };
    guardTimer = setTimeout(finish, OVERLAY_CLOSED_GUARD_MS);
    target.once('closed', finish);
  });
}

/**
 * 截图前清场：把上一次截图留下的预览浮层销毁掉。
 * 事件驱动，不睡固定时长：hide() 让浮层当场从屏幕上撤掉，close() 销毁窗口，
 * 等待全部交给 'closed' 事件 —— 销毁完成的一瞬间返回，之后只补显示器的一帧，
 * 让 BitBlt 捞到的是已经重新合成的干净画面。
 *
 * 只有整屏抓屏需要补这一帧：窗口抓屏走 Windows Graphics Capture，
 * 抓的是目标窗口自己的画面，浮层本来就截不进去 —— 浮层照样立刻关掉，但一毫秒都不用等。
 */
async function dismissOverlayBeforeCapture({ waitForComposition = true } = {}) {
  if (!isOverlayDismissBeforeCaptureEnabled()) return false;
  if (!overlayWindow || overlayWindow.isDestroyed()) return false;

  const closing = overlayWindow;
  const frameWaitMs = waitForComposition ? displayFrameMs() : 0;
  overlayWindow = null;
  if (overlayTimeout) {
    clearTimeout(overlayTimeout);
    overlayTimeout = null;
  }

  const startedAt = Date.now();
  try {
    closing.hide(); // 立刻撤掉画面
    closing.close(); // 销毁窗口，'closed' 派发即原生窗口已经没了
  } catch (error) {
    log.warn('[OVERLAY] Failed to dismiss overlay before capture:', error);
  }

  if (waitForComposition) {
    // 两个条件同时成立才抓屏，但计时并行跑，总等待 = 两者较大值而不是相加：
    // 1) 'closed' 派发 —— 原生窗口确定没了（正常只有一两毫秒）
    // 2) 显示器过一帧 —— DWM 重新合成完，画面里不会再有浮层的残影
    // 60Hz 下典型耗时约 17ms，240Hz 约 4ms，取代原来固定 240ms。
    await Promise.all([
      onceNativeWindowClosed(closing),
      waitFrame(frameWaitMs)
    ]);
  }

  const elapsed = Date.now() - startedAt;
  const expectedMax = frameWaitMs + OVERLAY_CLOSED_GUARD_MS;
  if (elapsed > expectedMax) {
    // 正常路径不会走到这里；走到了说明浮层销毁异常慢，留条线索好排查
    log.warn(`[OVERLAY] 截图前销毁浮层耗时异常: ${elapsed}ms（等一帧 ${frameWaitMs}ms）`);
  }
  return true;
}

/**
 * 浮窗预览图统一转成 file:// URL。
 * 通知页本身是 file:// 页面，直接把 `C:\a\b.jpg` 塞进 img.src 会被当成
 * 非法 scheme（"c:"），预览位就永远加载不出来。
 */
function toPreviewUrl(target) {
  if (!target || typeof target !== 'string') return ''
  if (/^(file|data|https?):/i.test(target)) return target
  try {
    return pathToFileURL(target).href
  } catch (error) {
    return ''
  }
}

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
    query: { img: toPreviewUrl(img), title, desc, type: type || '', pos, scale }
  });

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.showInactive(); // 不抢焦点
  });

  const currentOverlay = overlayWindow;
  currentOverlay.on('closed', () => {
    // 只回收「自己」这一份。截图前清场会让老窗口的 closed 延后派发，
    // 那时新浮层可能已经建好 —— 绝不能把新浮层的引用和它的自动关闭定时器一起清掉，
    // 否则新浮层没人管，会一直留在屏幕上。
    if (overlayWindow !== currentOverlay) return;
    overlayWindow = null;
    clearTimeout(overlayTimeout);
    overlayTimeout = null;
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
