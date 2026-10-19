<template>
  <div class="app-shell" :class="{ 'is-max': maximized }">
    <!-- ===== 顶部应用栏（自绘标题栏：可拖动 / 双击最大化） ===== -->
    <header class="app-bar">
      <div class="brand">
        <img class="brand-logo" :src="logoSrc" alt="Gamepad Shot">
        <div class="brand-text">
          <div class="brand-title">
            <span class="brand-name">{{ $t('gamepadScreenShotTool') }}</span>
            <button class="ver-chip" :class="{ 'has-new': updateAvailable }" @click="openVersionInfo"
              :title="updateAvailable ? $t('ui.newVersionHint', { version: latestVersion }) : $t('ui.currentVersion')">
              <span>v{{ version }}</span>
              <span v-if="updateAvailable" class="new-tag">NEW</span>
            </button>
          </div>
          <span class="brand-sub">Gamepad Shot</span>
        </div>
      </div>

      <div class="bar-mid">
        <span class="state-pill" :class="listening ? 'on' : 'off'">
          <i></i>{{ listening ? $t('ui.listening') : $t('ui.idle') }}
        </span>
      </div>

      <div class="bar-actions">
        <button class="icon-btn" :title="$t('ui.themeToggle')" @click="toggleTheme">
          <AppIcon :name="isDark ? 'sun' : 'moon'" :size="15" />
        </button>

        <!-- 主题颜色 -->
        <div class="pop-wrap">
          <button class="icon-btn" :class="{ on: accentOpen }" :title="$t('ui.accentColor')"
            @click.stop="togglePopover('accent')">
            <span class="accent-dot" :style="{ background: currentAccentHex }"></span>
          </button>
          <div v-if="accentOpen" class="popover pop-accent" @click.stop>
            <div class="pop-title">{{ $t('ui.accentColor') }}</div>
            <div class="accent-grid">
              <button v-for="color in accentColors" :key="color.key" class="accent-swatch"
                :class="{ on: accent === color.key }" :style="{ background: swatchColor(color) }"
                :title="$t('ui.accent.' + color.key)" @click="setAccent(color.key)">
                <AppIcon v-if="accent === color.key" name="check" :size="12" />
              </button>
            </div>
          </div>
        </div>

        <!-- 界面字体大小 -->
        <div class="pop-wrap">
          <button class="icon-btn" :class="{ on: fontOpen }" :title="$t('ui.fontSize')"
            @click.stop="togglePopover('font')">
            <AppIcon name="textSize" :size="15" />
          </button>
          <div v-if="fontOpen" class="popover pop-font" @click.stop>
            <div class="pop-title">{{ $t('ui.fontSize') }}</div>
            <div class="font-list">
              <button v-for="option in fontOptions" :key="option.value" class="font-opt"
                :class="{ on: uiScale === option.value }" @click="setUiScale(option.value)">
                <span>{{ $t(option.label) }}</span>
                <span class="font-pct">{{ option.percent }}%</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 语言 -->
        <div class="pop-wrap">
          <button class="icon-btn lang-btn" :class="{ on: langOpen }" :title="$t('SystemSettingsPage.language')"
            @click.stop="togglePopover('lang')">
            {{ currentLanguage.short }}
          </button>
          <div v-if="langOpen" class="popover pop-lang" @click.stop>
            <div class="pop-title">{{ $t('SystemSettingsPage.language') }}</div>
            <div class="lang-list">
              <button v-for="lang in languages" :key="lang.code" class="lang-opt"
                :class="{ on: currentLocale === lang.code }" @click="setLanguage(lang.code)">
                <span class="lang-native">{{ lang.native }}</span>
                <AppIcon v-if="currentLocale === lang.code" name="check" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 窗口控制 -->
      <div class="win-ctrls">
        <button class="win-btn" :title="$t('ui.minimize')" @click="minimizeWindow">
          <AppIcon name="minus" :size="14" />
        </button>
        <button class="win-btn" :title="maximized ? $t('ui.restore') : $t('ui.maximize')" @click="toggleMaximize">
          <AppIcon :name="maximized ? 'restore' : 'square'" :size="maximized ? 13 : 12" />
        </button>
        <button class="win-btn close" :title="$t('ui.close')" @click="closeWindow">
          <AppIcon name="close" :size="14" />
        </button>
      </div>
    </header>

    <div class="app-body">
      <!-- ===== 左侧导航 ===== -->
      <nav class="rail">
        <button v-for="item in navItems" :key="item.key" class="rail-btn" :class="{ on: view === item.key }"
          :title="$t(item.title)" @click="view = item.key">
          <AppIcon :name="item.icon" :size="20" />
          <span>{{ $t(item.label) }}</span>
        </button>

        <!-- 底部：GitHub 项目主页 -->
        <div class="rail-foot">
          <button class="rail-btn rail-github" :title="$t('ui.projectHomepage')" @click="openProjectHomepage">
            <AppIcon name="github" :size="19" />
            <span>GitHub</span>
          </button>
        </div>
      </nav>

      <!-- ===== 内容区 ===== -->
      <main class="stage">
        <MainPage v-show="view === 'screenshot'" ref="mainPageRef" :windowsNotify="windowsNotify"
          @navigate="view = $event" />
        <ControllerSettingsPage v-if="view === 'tester'" />
        <SystemSettingsPage v-if="view === 'settings'" ref="systemPageRef" :windowsNotify="windowsNotify"
          @open-update="openVersionInfo" />
      </main>
    </div>

    <!-- 热更新弹窗：检查 / 下载进度 / 重启安装 -->
    <UpdateDialog :open="updateOpen" :state="updateState" :notes="updateNotes" @close="updateOpen = false"
      @check="runUpdateCheck" @download="startUpdateDownload" @cancel="cancelUpdateDownload"
      @apply="installUpdate" @open-release="openUpdateRelease" />

    <!-- 语言切换提示（主界面文案与托盘菜单均已热更新，无需重启） -->
    <transition name="lang-toast">
      <div v-if="langToast" class="lang-toast">
        <AppIcon name="check" :size="12" />
        <span>{{ $t('ui.languageSwitched') }}</span>
      </div>
    </transition>
  </div>
</template>

<script>
import MainPage from '@/components/MainPage.vue'
import ControllerSettingsPage from '@/components/ControllerSettingsPage.vue'
import SystemSettingsPage from '@/components/SystemSettingsPage.vue'
import UpdateDialog from '@/components/UpdateDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import { LANGUAGES, getLanguage, normalizeLocale } from '@/locales/languages'
import pkg from '../package.json'

const {
  UI_SCALE_PRESETS, UI_SCALE_DEFAULT, snapUiScale
} = require('@/lib/uiScale')

const THEME_KEY = 'theme'
const LOCALE_KEY = 'locale'
const ACCENT_KEY = 'accentColor'
const UI_SCALE_KEY = 'uiScale'
/** 十六进制色 → rgba，用于生成 accent-soft / accent-line 这类半透明色 */
function hexToRgba(hex, alpha) {
  const value = String(hex || '').replace('#', '')
  if (value.length < 6) return `rgba(180, 244, 97, ${alpha})`
  const r = parseInt(value.substring(0, 2), 16)
  const g = parseInt(value.substring(2, 4), 16)
  const b = parseInt(value.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default {
  name: 'App',
  components: { MainPage, ControllerSettingsPage, SystemSettingsPage, UpdateDialog, AppIcon },
  data() {
    return {
      // 图标与主进程 BrowserWindow icon 使用同一份 gamepad.ico（放在 public 下由 webpack 直接拷贝）
      logoSrc: `${process.env.BASE_URL}gamepad.ico`,
      version: pkg.version,
      updateAvailable: false,
      latestVersion: '',
      releaseUrl: '',
      // 热更新弹窗
      updateOpen: false,
      updateState: {
        status: 'idle',
        currentVersion: pkg.version,
        latestVersion: '',
        notes: {},
        publishedAt: '',
        releaseUrl: '',
        mode: 'manual',
        mandatory: false,
        size: 0,
        progress: 0,
        received: 0,
        total: 0,
        speed: 0,
        source: '',
        error: '',
        checkedAt: 0
      },
      view: 'screenshot',
      listening: false,
      isDark: true,
      accent: 'lime',
      uiScale: 1,
      accentOpen: false,
      fontOpen: false,
      langOpen: false,
      langToast: false,
      langToastTimer: null,
      languages: LANGUAGES,
      maximized: false,
      // 每套主题各有一套色值，切换深浅色时自动跟随
      accentColors: [
        { key: 'lime', dark: { accent: '#B4F461', hi: '#CBFF74', ink: '#0A0C08' }, light: { accent: '#5CA22F', hi: '#6FBF3A', ink: '#FFFFFF' } },
        { key: 'violet', dark: { accent: '#A996FF', hi: '#BFB2FF', ink: '#0A0A12' }, light: { accent: '#6A4BE0', hi: '#7F63EE', ink: '#FFFFFF' } },
        { key: 'cyan', dark: { accent: '#6EE3F0', hi: '#8DEDF7', ink: '#04161A' }, light: { accent: '#1E9FB8', hi: '#2CB7D2', ink: '#FFFFFF' } },
        { key: 'amber', dark: { accent: '#FFC15E', hi: '#FFD489', ink: '#1A1204' }, light: { accent: '#C97B14', hi: '#E08C1C', ink: '#FFFFFF' } },
        { key: 'rose', dark: { accent: '#FF8CA0', hi: '#FFA7B7', ink: '#1C0609' }, light: { accent: '#D94A5E', hi: '#E85B6F', ink: '#FFFFFF' } },
        { key: 'azure', dark: { accent: '#7CB8FF', hi: '#9DCAFF', ink: '#040C18' }, light: { accent: '#2F6FD0', hi: '#3D80E6', ink: '#FFFFFF' } }
      ],
      fontOptions: UI_SCALE_PRESETS.map((preset, index) => ({
        ...preset,
        label: ['ui.fontSmall', 'ui.fontNormal', 'ui.fontLarge', 'ui.fontXLarge'][index]
      })),
      traySyncTimer: null,
      currentTrayListening: false,
      navItems: [
        // label 用导航栏专用的短文案（导航宽度有限，长语言放不下），title 是完整页面名，悬停可见
        { key: 'screenshot', icon: 'camera', label: 'navScreenshot', title: 'screenshotSettings' },
        { key: 'tester', icon: 'gamepad', label: 'navTester', title: 'gamepadTester' },
        { key: 'settings', icon: 'settings', label: 'navSettings', title: 'systemSettings' }
      ]
    }
  },
  computed: {
    /** 当前语言直接取自 i18n，设置页或顶栏任一处切换都能保持一致 */
    currentLocale() {
      return this.$i18n.locale
    },
    currentLanguage() {
      return getLanguage(this.currentLocale)
    },
    currentAccent() {
      return this.accentColors.find((color) => color.key === this.accent) || this.accentColors[0]
    },
    currentAccentHex() {
      return this.isDark ? this.currentAccent.dark.accent : this.currentAccent.light.accent
    },
    /** 清单里的更新说明按语言取，缺省回落到英文 / 中文 */
    updateNotes() {
      const notes = this.updateState && this.updateState.notes
      if (!notes) return ''
      if (typeof notes === 'string') return notes
      const locale = String(this.currentLocale || 'zh')
      return notes[locale] || notes[locale.split('-')[0]] || notes.en || notes.zh || ''
    }
  },
  watch: {
    // 切回截图设置页时重新同步手柄连接状态（调试页会接管/释放同一个设备实例）
    view(nextView) {
      if (nextView !== 'screenshot') return
      this.$nextTick(() => {
        const mainPage = this.$refs.mainPageRef
        if (mainPage && typeof mainPage.onPageShown === 'function') {
          mainPage.onPageShown()
        }
      })
    }
  },
  async beforeMount() {
    const theme = await window.electronAPI.getStore(THEME_KEY, 'dark')
    this.isDark = theme !== 'light'
    this.applyTheme()

    this.accent = await window.electronAPI.getStore(ACCENT_KEY, 'lime')
    this.uiScale = snapUiScale(await window.electronAPI.getStore(UI_SCALE_KEY, UI_SCALE_DEFAULT))
    this.applyAccent()

    // 语言已由 main.js 读取并初始化，这里只做未知值的兜底校正
    this.$i18n.locale = normalizeLocale(this.$i18n.locale)

    if (window.electronAPI.onWindowMaximizedChanged) {
      window.electronAPI.onWindowMaximizedChanged((_, state) => {
        this.maximized = !!state
      })
    }
    if (window.electronAPI.isWindowMaximized) {
      this.maximized = await window.electronAPI.isWindowMaximized()
    }
  },
  async mounted() {
    this.startTraySync()
    document.addEventListener('click', this.closePopovers)

    // 主进程会把更新状态（检查中 / 有新版本 / 下载进度 / 待重启）实时推过来
    if (window.electronAPI.onUpdaterState) {
      window.electronAPI.onUpdaterState((state) => this.applyUpdateResult(state))
    }
    if (window.electronAPI.getUpdateState) {
      window.electronAPI.getUpdateState().then((state) => this.applyUpdateResult(state)).catch(() => {})
    }

    // 启动时静默检测更新：命中新版本就在标题上挂 NEW 标记
    const checkOnStartup = await window.electronAPI.getStore('checkUpdateOnStartup', 'enabled')
    if (checkOnStartup === 'enabled') {
      setTimeout(() => this.checkUpdateSilently(), 1500)
    }
  },
  unmounted() {
    if (this.traySyncTimer) {
      clearInterval(this.traySyncTimer)
      this.traySyncTimer = null
    }
    if (this.langToastTimer) {
      clearTimeout(this.langToastTimer)
      this.langToastTimer = null
    }
    if (window.electronAPI.offUpdaterState) window.electronAPI.offUpdaterState()
    document.removeEventListener('click', this.closePopovers)
  },
  methods: {
    startTraySync() {
      const sync = () => {
        const listening = this.$refs['mainPageRef'] ? !!this.$refs['mainPageRef'].listening : false
        if (listening !== this.listening) {
          this.listening = listening
        }
        if (listening !== this.currentTrayListening) {
          this.currentTrayListening = listening
          window.electronAPI.updateTrayIcon(listening)
          window.electronAPI.updateTrayListeningState(listening)
        }
      }
      sync()
      this.traySyncTimer = setInterval(sync, 300)
    },
    applyTheme() {
      const root = document.documentElement
      root.classList.toggle('theme-dark', this.isDark)
      root.classList.toggle('theme-light', !this.isDark)
    },
    /**
     * 把主题色写进 CSS 变量。
     * 深/浅色各有一套色值，同时派生 soft / line / 背景光晕等半透明色，
     * 这样所有组件（按钮、开关、滑块、进度条）都会自动跟随主题色。
     */
    applyAccent() {
      const palette = this.isDark ? this.currentAccent.dark : this.currentAccent.light
      const root = document.documentElement.style
      root.setProperty('--accent', palette.accent)
      root.setProperty('--accent-hi', palette.hi)
      root.setProperty('--accent-ink', palette.ink)
      root.setProperty('--accent-soft', hexToRgba(palette.accent, this.isDark ? 0.13 : 0.12))
      root.setProperty('--accent-line', hexToRgba(palette.accent, this.isDark ? 0.32 : 0.32))
      root.setProperty('--bg-glow-a', hexToRgba(palette.accent, this.isDark ? 0.10 : 0.12))
    },
    toggleTheme() {
      this.isDark = !this.isDark
      this.applyTheme()
      this.applyAccent()
      window.electronAPI.setStore(THEME_KEY, this.isDark ? 'dark' : 'light')
    },
    swatchColor(color) {
      return this.isDark ? color.dark.accent : color.light.accent
    },
    setAccent(key) {
      this.accent = key
      this.applyAccent()
      this.accentOpen = false
      window.electronAPI.setStore(ACCENT_KEY, key)
    },
    async setUiScale(scale) {
      this.uiScale = scale
      this.fontOpen = false
      await window.electronAPI.setStore(UI_SCALE_KEY, scale)
      if (window.electronAPI.setUiScale) {
        await window.electronAPI.setUiScale(scale)
      }
    },
    togglePopover(name) {
      const next = {
        accent: name === 'accent' ? !this.accentOpen : false,
        font: name === 'font' ? !this.fontOpen : false,
        lang: name === 'lang' ? !this.langOpen : false
      }
      this.accentOpen = next.accent
      this.fontOpen = next.font
      this.langOpen = next.lang
    },
    closePopovers() {
      this.accentOpen = false
      this.fontOpen = false
      this.langOpen = false
    },
    minimizeWindow() {
      if (window.electronAPI.minimizeWindow) window.electronAPI.minimizeWindow()
    },
    async checkUpdateSilently() {
      try {
        // quiet：失败不弹错，只影响标题上的 NEW 标记
        const result = await window.electronAPI.checkUpdate({ quiet: true })
        this.applyUpdateResult(result)
        if (this.updateAvailable) {
          this.windowsNotify(`${this.$t('SystemSettingsPage.updateAvailable')}: ${this.latestVersion}`)
        }
      } catch (error) {
        // 启动检测失败保持静默，不打扰用户
        console.warn('Startup update check failed:', error)
      }
    },
    /** state 来自主进程 updater：{ status, currentVersion, latestVersion, notes, ... } */
    applyUpdateResult(state) {
      if (!state) return
      // 兼容旧接口返回的 { hasUpdate } 结构
      if (typeof state.hasUpdate === 'boolean' && !state.status) {
        this.updateAvailable = state.hasUpdate
        this.latestVersion = state.latestVersion || ''
        this.releaseUrl = state.releaseUrl || ''
        return
      }
      this.updateState = state
      this.updateAvailable = state.status === 'available' || state.status === 'manual'
      this.latestVersion = state.latestVersion || ''
      this.releaseUrl = state.releaseUrl || ''
    },
    /** 点版本号 / 设置页「检测更新」：打开弹窗，必要时先拉一次清单 */
    openVersionInfo() {
      this.updateOpen = true
      const state = this.updateState
      const busy = ['checking', 'downloading', 'applying'].includes(state.status)
      // 已经有结果（含「已下载待安装」）时不要重新检测，否则会把下载好的包作废
      const hasResult = ['available', 'manual', 'ready'].includes(state.status)
      const fresh = state.checkedAt && Date.now() - state.checkedAt < 30 * 1000
      if (!busy && !hasResult && !(state.status === 'uptodate' && fresh)) {
        this.runUpdateCheck()
      }
    },
    async runUpdateCheck() {
      if (!window.electronAPI.checkUpdate) return
      try {
        this.applyUpdateResult(await window.electronAPI.checkUpdate({ quiet: false }))
      } catch (error) {
        console.error('Check update failed:', error)
      }
    },
    async startUpdateDownload() {
      if (!window.electronAPI.downloadUpdate) return
      this.applyUpdateResult(await window.electronAPI.downloadUpdate())
    },
    async cancelUpdateDownload() {
      if (!window.electronAPI.cancelUpdate) return
      this.applyUpdateResult(await window.electronAPI.cancelUpdate())
    },
    async installUpdate() {
      if (!window.electronAPI.applyUpdate) return
      const result = await window.electronAPI.applyUpdate()
      if (!result || !result.ok) {
        this.windowsNotify(this.$t('Update.applyFailed'))
      }
      // 成功后主进程会在 700ms 内退出，助手替换文件并自动重启，这里不用做别的
    },
    openUpdateRelease() {
      const url = this.releaseUrl
      if (!url) return
      if (window.electronAPI.openUpdateReleasePage) window.electronAPI.openUpdateReleasePage(url)
      else window.electronAPI.openReleasePage(url)
    },
    async toggleMaximize() {
      if (!window.electronAPI.toggleMaximizeWindow) return
      const state = await window.electronAPI.toggleMaximizeWindow()
      if (typeof state === 'boolean') this.maximized = state
    },
    closeWindow() {
      if (window.electronAPI.closeWindow) window.electronAPI.closeWindow()
    },
    /**
     * 切换语言：界面立即热更新，同时通知主进程重建托盘菜单 / 刷新窗口标题，
     * 全程不需要重启应用。
     */
    async setLanguage(code) {
      this.langOpen = false
      if (code === this.currentLocale) return
      this.$i18n.locale = code
      await window.electronAPI.setStore(LOCALE_KEY, code)
      if (window.electronAPI.applyLocale) {
        await window.electronAPI.applyLocale(code)
      }
      this.showLanguageToast()
    },
    /** 切换成功后给一个轻量提示，避免用户以为没反应 */
    showLanguageToast() {
      this.langToast = true
      if (this.langToastTimer) clearTimeout(this.langToastTimer)
      this.langToastTimer = setTimeout(() => {
        this.langToast = false
        this.langToastTimer = null
      }, 1900)
    },
    /** 打开项目 GitHub 主页（等同系统设置里原来的「关于 - 项目主页」） */
    openProjectHomepage() {
      const url = 'https://github.com/AmagiSakuya/GamePad-ScreenShot-Windows'
      if (window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url)
      } else {
        window.electronAPI.openReleasePage(url)
      }
    },
    windowsNotify(message) {
      new Notification('', { body: message })
    }
  }
}
</script>

<style>
/* =========================================================
   设计令牌
   ========================================================= */
:root,
html.theme-dark {
  --bg: #08090C;
  --bg-glow-a: rgba(180, 244, 97, 0.10);
  --bg-glow-b: rgba(124, 92, 255, 0.16);
  --bar: rgba(10, 11, 15, 0.72);
  --surface: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
  --surface-flat: #0F1116;
  --surface-2: rgba(255, 255, 255, 0.06);
  --field: rgba(8, 9, 12, 0.7);
  --field-focus: rgba(8, 9, 12, 0.95);
  --line: rgba(255, 255, 255, 0.075);
  --line-strong: rgba(255, 255, 255, 0.14);
  --ink: #F2F4F8;
  --ink-2: #98A1B0;
  --ink-3: #6A7280;
  --accent: #B4F461;
  --accent-hi: #CBFF74;
  --accent-soft: rgba(180, 244, 97, 0.13);
  --accent-line: rgba(180, 244, 97, 0.30);
  --accent-ink: #0A0C08;
  --violet: #A996FF;
  --violet-soft: rgba(124, 92, 255, 0.14);
  --cyan: #6EE3F0;
  --cyan-soft: rgba(79, 216, 232, 0.12);
  --ok: #3CD39E;
  --warn: #FFB240;
  --danger: #FB5F76;
  --shadow: 0 18px 40px -32px #000;
  --radius: 14px;
  --radius-s: 9px;
  --scroll-thumb: rgba(255, 255, 255, 0.14);
}

html.theme-light {
  --bg: #F4F6F1;
  --bg-glow-a: rgba(126, 190, 60, 0.10);
  --bg-glow-b: rgba(124, 92, 255, 0.07);
  --bar: rgba(255, 255, 255, 0.86);
  --surface: #FFFFFF;
  --surface-flat: #FFFFFF;
  --surface-2: #F1F3ED;
  --field: #F4F6F1;
  --field-focus: #FFFFFF;
  --line: rgba(22, 32, 22, 0.10);
  --line-strong: rgba(22, 32, 22, 0.18);
  --ink: #161C17;
  --ink-2: #5E6B60;
  --ink-3: #8D9A90;
  --accent: #5CA22F;
  --accent-hi: #6FBF3A;
  --accent-soft: rgba(92, 162, 47, 0.12);
  --accent-line: rgba(92, 162, 47, 0.30);
  --accent-ink: #FFFFFF;
  --violet: #6A4BE0;
  --violet-soft: rgba(106, 75, 224, 0.10);
  --cyan: #1E9FB8;
  --cyan-soft: rgba(30, 159, 184, 0.10);
  --ok: #2F8C63;
  --warn: #C97B14;
  --danger: #D94A5E;
  --shadow: 0 14px 30px -26px rgba(0, 0, 0, 0.45);
  --scroll-thumb: rgba(22, 32, 22, 0.18);
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  transition: background-color 0.25s ease, color 0.25s ease;
}

/* 背景光晕 */
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
}

/* 窗口最大化时不需要外框描边，避免和屏幕边缘出现双重线条 */
.app-shell.is-max {
  border-color: transparent;
}

.app-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(820px 460px at 82% -10%, var(--bg-glow-a), transparent 62%),
    radial-gradient(720px 420px at 4% 112%, var(--bg-glow-b), transparent 62%);
}

/* =========================================================
   顶部栏
   ========================================================= */
.app-bar {
  height: 46px;
  flex: 0 0 46px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 0 0 16px;
  border-bottom: 1px solid var(--line);
  background: var(--bar);
  position: relative;
  z-index: 3;
  /* 自绘标题栏：整条顶栏可拖动窗口，交互元素单独设 no-drag */
  -webkit-app-region: drag;
  user-select: none;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  /* 长语言的产品名不能挤到中间的监听状态胶囊，超出用省略号 */
  max-width: min(380px, 44vw);
  overflow: hidden;
}

.brand-logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45));
  -webkit-user-drag: none;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}

.brand-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.brand-name {
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* 版本号（发现新版本时变成可点击的 NEW 标记） */
.ver-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  flex: 0 0 auto;
  cursor: default;
  transition: all 0.16s ease;
  -webkit-app-region: no-drag;
}

.ver-chip.has-new {
  cursor: pointer;
  color: var(--accent);
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.ver-chip.has-new:hover {
  filter: brightness(1.1);
}

.new-tag {
  padding: 1.5px 3px;
  border-radius: 3px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.06em;
  animation: newPulse 1.6s ease-in-out infinite;
}

@keyframes newPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.brand-sub {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-3);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-mid {
  /* 相对整条标题栏绝对居中，避免被左侧品牌区/右侧按钮区的宽度差挤偏 */
  position: absolute;
  left: 50%;
  top: 0;
  height: 100%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 让这块保持可拖动（点击穿透到标题栏） */
  pointer-events: none;
}

.state-pill {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 11px;
  border-radius: 99px;
  font-size: 11px;
  border: 1px solid var(--line-strong);
  color: var(--ink-2);
  background: var(--surface-2);
  white-space: nowrap;
  flex: 0 0 auto;
}

.state-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-3);
  display: block;
}

.state-pill.on {
  border-color: var(--accent-line);
  color: var(--accent);
  background: var(--accent-soft);
}

.state-pill.on i {
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
  animation: pulse 1.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.bar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  -webkit-app-region: no-drag;
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;
  transition: all 0.16s ease;
  font-family: inherit;
  padding: 0;
  -webkit-app-region: no-drag;
}

.icon-btn:hover {
  color: var(--ink);
  border-color: var(--line-strong);
  background: var(--surface-2);
}

.icon-btn.on {
  color: var(--accent);
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.lang-btn {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* ---------- 主题色 / 字体大小 浮层 ---------- */
.pop-wrap {
  position: relative;
  display: flex;
  -webkit-app-region: no-drag;
}

.accent-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  display: block;
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.popover {
  position: absolute;
  top: calc(100% + 8px);
  right: -6px;
  min-width: 168px;
  padding: 10px;
  border-radius: 12px;
  background: var(--surface-flat);
  border: 1px solid var(--line-strong);
  box-shadow: 0 22px 44px -22px rgba(0, 0, 0, 0.65);
  z-index: 20;
  animation: popIn 0.14s ease;
}

html.theme-light .popover {
  box-shadow: 0 18px 36px -20px rgba(22, 32, 22, 0.35);
}

.pop-accent {
  min-width: 178px;
}

.pop-font {
  min-width: 164px;
}

.pop-lang {
  min-width: 172px;
  max-height: 340px;
  overflow-y: auto;
}

.lang-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lang-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 30px;
  padding: 0 8px;
  border-radius: 7px;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.14s ease;
  white-space: nowrap;
  text-align: left;
}

.lang-opt:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.lang-opt.on {
  background: var(--accent-soft);
  color: var(--accent);
}

.lang-native {
  font-size: 12px;
}

/* 语言切换成功的轻提示 */
.lang-toast {
  position: fixed;
  top: 54px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 99px;
  font-size: 11.5px;
  color: var(--accent);
  background: var(--surface-flat);
  border: 1px solid var(--accent-line);
  box-shadow: 0 16px 34px -20px rgba(0, 0, 0, 0.7);
  z-index: 60;
  pointer-events: none;
}

.lang-toast-enter-active,
.lang-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.lang-toast-enter-from,
.lang-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-7px);
}

@keyframes popIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.pop-title {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-3);
  font-weight: 600;
  margin-bottom: 9px;
  white-space: nowrap;
}

.accent-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 7px;
}

.accent-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 0;
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  color: #0A0C08;
  transition: transform 0.14s ease, box-shadow 0.14s ease;
  box-shadow: 0 0 0 1px var(--line-strong);
}

html.theme-light .accent-swatch {
  color: #FFFFFF;
}

.accent-swatch:hover {
  transform: scale(1.12);
}

.accent-swatch.on {
  box-shadow: 0 0 0 2px var(--surface-flat), 0 0 0 4px var(--accent);
}

.font-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.font-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.14s ease;
  white-space: nowrap;
}

.font-opt:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.font-opt.on {
  background: var(--accent-soft);
  color: var(--accent);
}

.font-pct {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--ink-3);
}

.font-opt.on .font-pct {
  color: var(--accent);
}

/* ---------- 窗口控制按钮 ---------- */
.win-ctrls {
  display: flex;
  align-items: stretch;
  align-self: stretch;
  flex: 0 0 auto;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 44px;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--ink-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
  -webkit-app-region: no-drag;
  padding: 0;
}

.win-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.win-btn.close:hover {
  background: #E81123;
  color: #FFFFFF;
}

/* =========================================================
   主体：左导航 + 内容
   ========================================================= */
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  z-index: 1;
}

.rail {
  width: 84px;
  flex: 0 0 84px;
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  background: var(--bar);
}

.rail-btn {
  width: 58px;
  min-height: 54px;
  height: auto;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
  position: relative;
  transition: all 0.16s ease;
  font-family: inherit;
  padding: 8px 3px 7px;
  flex: 0 0 auto;
}

/*
 * 多语言下导航文案长度差异很大（德语 Screenshot-Einstellungen、日语 スクリーンショット設定…），
 * 这里固定两行并裁切，避免文字撑出按钮/导航栏压到内容区。
 */
.rail-btn span {
  width: 100%;
  min-width: 0;
  font-size: 9px;
  line-height: 1.2;
  letter-spacing: 0.01em;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.rail-btn:hover {
  color: var(--ink-2);
  background: var(--surface-2);
}

.rail-btn.on {
  background: var(--accent-soft);
  color: var(--accent);
}

.rail-btn.on::before {
  content: "";
  position: absolute;
  left: -13px;
  top: 16px;
  width: 3px;
  height: 22px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent-line);
}

/* 底部固定区（GitHub 入口） */
.rail-foot {
  margin-top: auto;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.rail-github {
  border-radius: 12px;
}

.rail-github:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.stage::-webkit-scrollbar {
  width: 10px;
}

.stage::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: 99px;
  border: 3px solid transparent;
  background-clip: content-box;
}

.stage::-webkit-scrollbar-track {
  background: transparent;
}

/* =========================================================
   通用控件
   ========================================================= */
.page {
  padding: 13px 18px 14px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.page-title {
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.01em;
  margin: 0;
}

.page-sub {
  font-size: 11.5px;
  color: var(--ink-3);
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 7px;
}

.page-sub .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
}

/* 未连接：灰点，且不要残留绿色光晕 */
.page-sub .dot.off {
  background: var(--ink-3);
  box-shadow: none;
}

.ui-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 15px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-shadow: var(--shadow);
}

html.theme-light .ui-card {
  box-shadow: 0 1px 2px rgba(22, 32, 22, 0.04);
}

.ui-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  flex: 0 0 auto;
}

.ui-card-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ui-card-ico {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  flex: 0 0 auto;
}

.ui-card-ico.violet {
  background: var(--violet-soft);
  color: var(--violet);
}

.ui-card-ico.cyan {
  background: var(--cyan-soft);
  color: var(--cyan);
}

.ui-card-ico.warn {
  background: rgba(255, 178, 64, 0.12);
  color: var(--warn);
}

.ui-card-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.ui-card-hint {
  font-size: 10px;
  color: var(--ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ui-badge {
  font-size: 10px;
  color: var(--ink-3);
  border: 1px solid var(--line);
  padding: 2.5px 7px;
  border-radius: 5px;
  white-space: nowrap;
  flex: 0 0 auto;
  font-family: "Cascadia Mono", Consolas, monospace;
}

.ui-badge.on {
  color: var(--accent);
  border-color: var(--accent-line);
  background: var(--accent-soft);
}

.ui-rows {
  display: flex;
  flex-direction: column;
  /* 行间距固定，不随卡片高度拉伸（space-between 会在行少时撑出很大空隙） */
  justify-content: flex-start;
  gap: 9px;
  flex: 1;
  min-height: 0;
}

.ui-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 0;
}

.ui-label {
  font-size: 12px;
  color: var(--ink-2);
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.ui-label .app-icon {
  color: var(--ink-3);
}

.ui-ctl {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.ui-select {
  height: 32px;
  min-width: 120px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 0 10px;
  background: var(--field);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-s);
  color: var(--ink);
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.ui-select:hover {
  border-color: var(--accent-line);
}

.ui-select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--field-focus);
}

.ui-input {
  height: 32px;
  flex: 1;
  min-width: 0;
  padding: 0 10px;
  background: var(--field);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-s);
  color: var(--ink);
  font-size: 11.5px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
  text-overflow: ellipsis;
}

.ui-input:hover {
  border-color: var(--accent-line);
}

.ui-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--field-focus);
}

.ui-input::placeholder {
  color: var(--ink-3);
}

.ui-input.mono {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10.5px;
}

.ui-seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  background: var(--field);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-s);
  height: 32px;
}

.ui-seg button {
  border: 0;
  background: transparent;
  color: var(--ink-3);
  font-size: 11px;
  font-family: inherit;
  padding: 0 11px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.16s ease;
}

.ui-seg button:hover {
  color: var(--ink-2);
}

.ui-seg button.on {
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent-line);
}

.ui-switch {
  width: 36px;
  height: 20px;
  border-radius: 99px;
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  position: relative;
  cursor: pointer;
  flex: 0 0 auto;
  transition: background 0.18s ease, border-color 0.18s ease;
  padding: 0;
}

.ui-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--ink-3);
  transition: transform 0.18s ease, background 0.18s ease;
}

.ui-switch.on {
  background: var(--accent);
  border-color: var(--accent);
}

.ui-switch.on::after {
  transform: translateX(16px);
  background: var(--accent-ink);
}

.ui-btn {
  height: 32px;
  padding: 0 13px;
  border-radius: var(--radius-s);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 11.5px;
  font-family: inherit;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.16s ease;
}

.ui-btn:hover {
  border-color: var(--accent-line);
  color: var(--accent);
}

.ui-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ui-btn:disabled:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}

.ui-btn.primary {
  background: linear-gradient(180deg, var(--accent-hi), var(--accent));
  border-color: transparent;
  color: var(--accent-ink);
  font-weight: 650;
  box-shadow: 0 10px 24px -14px var(--accent);
}

.ui-btn.primary:hover {
  filter: brightness(1.06);
  color: var(--accent-ink);
}

.ui-btn.danger {
  background: rgba(251, 95, 118, 0.12);
  border-color: rgba(251, 95, 118, 0.35);
  color: var(--danger);
}

.ui-btn.danger:hover {
  background: rgba(251, 95, 118, 0.18);
  color: var(--danger);
}

.ui-btn.ghost {
  background: transparent;
}

.ui-btn.sm {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
}

.ui-btn.icon-only {
  width: 32px;
  padding: 0;
}

.ui-chip {
  height: 26px;
  min-width: 34px;
  padding: 0 9px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  white-space: nowrap;
}

.ui-chip.muted {
  color: var(--ink-2);
  background: var(--surface-2);
  border-color: var(--line-strong);
}

.ui-hint {
  font-size: 9.5px;
  color: var(--ink-3);
  line-height: 1.5;
}

.ui-hint.mono {
  font-family: "Cascadia Mono", Consolas, monospace;
}

.ui-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 11.5px;
  background: rgba(251, 95, 118, 0.10);
  border: 1px solid rgba(251, 95, 118, 0.28);
  color: var(--danger);
  margin-bottom: 12px;
}

.ui-divider {
  height: 1px;
  background: var(--line);
  margin: 8px 0;
}

/* 监听中锁定 */
.is-locked {
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
}

button,
select,
input {
  font-family: inherit;
}
</style>
