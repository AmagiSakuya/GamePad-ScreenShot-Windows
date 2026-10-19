<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ $t('systemSettings') }}</h1>
        <p class="page-sub">{{ $t('ui.settingsHint') }}</p>
      </div>

    </div>

    <div class="set-grid">
      <div class="ui-card set-card" v-for="(group, index) in groups" :key="group.key">
        <div class="ui-card-head set-head" @click="toggleGroup(index)">
          <div class="ui-card-head-left">
            <div class="ui-card-ico" :class="group.tone"><AppIcon :name="group.icon" :size="13" /></div>
            <span class="ui-card-title">{{ $t('SystemSettingsPage.' + group.key) }}</span>
          </div>
          <AppIcon name="chevronDown" :size="14" class="chev"
            :style="{ transform: group.collapsed ? 'rotate(-90deg)' : 'none' }" />
        </div>

        <div class="set-rows" v-show="!group.collapsed">
          <div class="set-row" v-for="setting in group.settings" :key="setting.key">
            <div class="set-label">
              <AppIcon :name="setting.icon" :size="13" />
              <span>{{ $t('SystemSettingsPage.' + setting.key) }}</span>
            </div>
            <div class="set-ctl">
              <!-- 布尔开关 -->
              <div v-if="setting.type === 'seg'" class="ui-seg">
                <button v-for="option in setting.options" :key="String(option.value)"
                  :class="{ on: config[setting.configKey] === option.value }"
                  @click="setValue(setting, option.value)">
                  {{ $t(option.label) }}
                </button>
              </div>

              <!-- 下拉 -->
              <select v-else-if="setting.type === 'select'" class="ui-select" :value="config[setting.configKey]"
                @change="onSelectChange(setting, $event)">
                <option v-for="(option, optionIndex) in setting.options" :key="optionIndex" :value="option.value">
                  {{ option.text || $t(option.label) }}
                </option>
              </select>

              <!-- 输入框 -->
              <input v-else-if="setting.type === 'input'" class="ui-input" type="text" :placeholder="setting.placeholder"
                :value="config[setting.configKey]"
                @input="e => { config[setting.configKey] = e.target.value; setting.handler.call(this, e); }">

              <!-- 滑条 -->
              <div v-else-if="setting.type === 'range'" class="range-wrap">
                <span class="range-bound">{{ setting.min }}x</span>
                <input class="ui-range" type="range" :min="setting.min" :max="setting.max" :step="setting.step"
                  :value="config[setting.configKey]"
                  @input="e => { config[setting.configKey] = parseFloat(e.target.value); setting.handler.call(this, e); }">
                <span class="range-bound">{{ setting.max }}x</span>
                <span class="range-badge">{{ formatScaleValue(config[setting.configKey]) }}</span>
              </div>

              <!-- 按钮 -->
              <button v-else-if="setting.type === 'button'" class="ui-btn" @click="setting.handler.call(this)">
                <AppIcon name="download" :size="13" v-if="setting.key === 'checkUpdate'" />
                <AppIcon name="bell" :size="13" v-else-if="setting.key === 'testOverlayNotify'" />
                {{ $t('SystemSettingsPage.' + setting.key) }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="ui-card set-card data-card">
        <div class="ui-card-head">
          <div class="ui-card-head-left">
            <div class="ui-card-ico warn"><AppIcon name="database" :size="13" /></div>
            <span class="ui-card-title">{{ $t('ui.data') }}</span>
          </div>
          <span class="ui-badge">v{{ version }}</span>
        </div>
        <div class="set-rows">
          <div class="set-row with-desc" v-for="action in dataActions" :key="action.key">
            <div class="set-label data-label">
              <AppIcon :name="action.icon" :size="13" class="data-ico" />
              <div class="data-label-text">
                <span class="data-title">{{ $t('SystemSettingsPage.' + action.key) }}</span>
                <span class="data-desc">{{ $t('SystemSettingsPage.' + action.key + 'Desc') }}</span>
                <span v-if="pathHint(action.key)" class="data-path">{{ pathHint(action.key) }}</span>
              </div>
            </div>
            <div class="set-ctl">
              <button class="ui-btn" :class="{ danger: action.danger }" @click="action.handler.call(this)">
                {{ $t(action.danger ? 'SystemSettingsPage.clearButton' : 'ui.open') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import pkg from '../../package.json';
import AppIcon from '@/components/AppIcon.vue';
import { LANGUAGES, normalizeLocale } from '@/locales/languages';

let localeKey = 'locale';
let closeTypeKey = 'closeType';
let filenameConflictResolutionKey = 'filenameConflictResolution';
let autoListenResolutionKey = 'autoListenResolution';
let checkUpdateOnStartupKey = 'checkUpdateOnStartup';
let proxyKey = 'proxy';
let autoStartKey = 'autoStart';
let minimizeOnStartupKey = 'minimizeOnStartup';

export default {
  name: 'SystemSettingsPage',
  components: { AppIcon },
  emits: ['update-status'],
  props: {
    windowsNotify: {
      type: Function,
      default: null
    }
  },
  data() {
    return {
      version: pkg.version,
      config: {
        language: 'zh',
        closeType: 'exit',
        filenameConflictResolution: 'overwrite',
        autoListenResolution: 'never',
        checkUpdateOnStartup: 'enabled',
        proxy: '',
        autoStart: false,
        minimizeOnStartup: false,
        overlayNotify: 'show',
        overlayNotifySize: 1,
        overlayNotifyDuration: 3,
        overlayNotifyPosition: 'left',
        listenNotifyPolicy: 'all'
      },
      // 数据管理相关路径（来自主进程，用于在界面上说明操作范围）
      dataPaths: {
        logFolder: ''
      },
      // 「数据」卡片中的操作项（每一项都有描述 + 二次确认）
      dataActions: [
        { key: 'openLogFolder', icon: 'folder', handler: this.openLogFolder },
        { key: 'clearLogs', icon: 'trash', danger: true, handler: this.clearLogs }
      ],
      groups: [
        {
          key: 'groupBasic',
          icon: 'settings',
          tone: '',
          collapsed: false,
          settings: [
            {
              key: 'language',
              icon: 'languages',
              type: 'select',
              configKey: 'language',
              handler: this.onLanguageChanged,
              // 语言名统一显示母语写法，切换后不会找不到自己熟悉的语言
              options: LANGUAGES.map((lang) => ({ value: lang.code, text: lang.native }))
            },
            {
              key: 'autoStart',
              icon: 'power',
              type: 'seg',
              configKey: 'autoStart',
              handler: this.onAutoStartChanged,
              options: [
                { value: true, label: 'SystemSettingsPage.enabled' },
                { value: false, label: 'SystemSettingsPage.disabled' }
              ]
            },
            {
              key: 'closeType',
              icon: 'close',
              type: 'select',
              configKey: 'closeType',
              handler: this.onCloseTypeChanged,
              options: [
                { value: 'exit', label: 'SystemSettingsPage.closeTypeEnum.exit' },
                { value: 'tray', label: 'SystemSettingsPage.closeTypeEnum.tray' }
              ]
            },
            {
              key: 'minimizeOnStartup',
              icon: 'appWindow',
              type: 'seg',
              configKey: 'minimizeOnStartup',
              handler: this.onMinimizeOnStartupChanged,
              options: [
                { value: true, label: 'SystemSettingsPage.enabled' },
                { value: false, label: 'SystemSettingsPage.disabled' }
              ]
            }
          ]
        },
        {
          key: 'groupNotify',
          icon: 'bell',
          tone: 'warn',
          collapsed: false,
          settings: [
            {
              key: 'overlayNotify',
              icon: 'bell',
              type: 'select',
              configKey: 'overlayNotify',
              handler: async function () { await window.electronAPI.setStore('overlayNotify', this.config.overlayNotify) },
              options: [
                { value: 'show', label: 'SystemSettingsPage.overlayNotifyEnum.show' },
                { value: 'hide', label: 'SystemSettingsPage.overlayNotifyEnum.hide' }
              ]
            },
            {
              key: 'overlayNotifyPosition',
              icon: 'target',
              type: 'select',
              configKey: 'overlayNotifyPosition',
              handler: async function () { await window.electronAPI.setStore('overlayNotifyPosition', this.config.overlayNotifyPosition) },
              options: [
                { value: 'left', label: 'SystemSettingsPage.overlayNotifyPositionEnum.topLeft' },
                { value: 'right', label: 'SystemSettingsPage.overlayNotifyPositionEnum.topRight' }
              ]
            },
            {
              key: 'overlayNotifySize',
              icon: 'image',
              type: 'range',
              configKey: 'overlayNotifySize',
              min: 0.8,
              max: 2,
              step: 0.05,
              handler: async function () { await window.electronAPI.setStore('overlayNotifySize', this.config.overlayNotifySize) }
            },
            {
              key: 'overlayNotifyDuration',
              icon: 'clock',
              type: 'select',
              configKey: 'overlayNotifyDuration',
              handler: async function () { await window.electronAPI.setStore('overlayNotifyDuration', this.config.overlayNotifyDuration) },
              options: [
                { value: 1, label: 'SystemSettingsPage.overlayNotifyDurationEnum.1' },
                { value: 2, label: 'SystemSettingsPage.overlayNotifyDurationEnum.2' },
                { value: 3, label: 'SystemSettingsPage.overlayNotifyDurationEnum.3' },
                { value: 4, label: 'SystemSettingsPage.overlayNotifyDurationEnum.4' },
                { value: 5, label: 'SystemSettingsPage.overlayNotifyDurationEnum.5' }
              ]
            },
            {
              key: 'listenNotifyPolicy',
              icon: 'list',
              type: 'select',
              configKey: 'listenNotifyPolicy',
              handler: async function () { await window.electronAPI.setStore('listenNotifyPolicy', this.config.listenNotifyPolicy) },
              options: [
                { value: 'all', label: 'SystemSettingsPage.listenNotifyPolicyEnum.all' },
                { value: 'start', label: 'SystemSettingsPage.listenNotifyPolicyEnum.start' },
                { value: 'stop', label: 'SystemSettingsPage.listenNotifyPolicyEnum.stop' },
                { value: 'none', label: 'SystemSettingsPage.listenNotifyPolicyEnum.none' }
              ]
            },
            {
              key: 'testOverlayNotify',
              icon: 'bell',
              type: 'button',
              handler: this.testOverlayNotify
            }
          ]
        },
        {
          key: 'groupPolicy',
          icon: 'shield',
          tone: 'cyan',
          collapsed: false,
          settings: [
            {
              key: 'filenameConflictResolution',
              icon: 'fileText',
              type: 'select',
              configKey: 'filenameConflictResolution',
              handler: this.onFilenameConflictResolutionChanged,
              options: [
                { value: 'overwrite', label: 'SystemSettingsPage.filenameConflictResolutionEnum.overwrite' },
                { value: 'appendTimestamp', label: 'SystemSettingsPage.filenameConflictResolutionEnum.appendTimestamp' },
                { value: 'notSave', label: 'SystemSettingsPage.filenameConflictResolutionEnum.notSave' },
                { value: 'askEveryTime', label: 'SystemSettingsPage.filenameConflictResolutionEnum.askEveryTime' }
              ]
            },
            {
              key: 'autoListenResolution',
              icon: 'play',
              type: 'select',
              configKey: 'autoListenResolution',
              handler: this.onAutoListenResolutionChanged,
              options: [
                { value: 'never', label: 'SystemSettingsPage.autoListenResolutionEnum.never' },
                { value: 'whenDeviceAvailable', label: 'SystemSettingsPage.autoListenResolutionEnum.whenDeviceAvailable' },
                { value: 'onAppStart', label: 'SystemSettingsPage.autoListenResolutionEnum.onAppStart' }
              ]
            }
          ]
        },
        {
          key: 'groupUpdate',
          icon: 'download',
          tone: 'violet',
          collapsed: false,
          settings: [
            {
              key: 'checkUpdateOnStartup',
              icon: 'refresh',
              type: 'seg',
              configKey: 'checkUpdateOnStartup',
              handler: this.onCheckUpdateOnStartupChanged,
              options: [
                { value: 'enabled', label: 'SystemSettingsPage.enabled' },
                { value: 'disabled', label: 'SystemSettingsPage.disabled' }
              ]
            },
            {
              key: 'proxy',
              icon: 'globe',
              type: 'input',
              configKey: 'proxy',
              handler: this.onProxyChanged,
              placeholder: '127.0.0.1:8080'
            },
            {
              key: 'checkUpdate',
              icon: 'download',
              type: 'button',
              handler: this.checkForUpdates
            }
          ]
        }
      ]
    }
  },
  async mounted() {
    const locale = await window.electronAPI.getStore(localeKey, 'zh');
    const closeType = await window.electronAPI.getStore(closeTypeKey, 'exit');
    const filenameConflictResolution = await window.electronAPI.getStore(filenameConflictResolutionKey, 'overwrite');
    const AutoListenResolution = await window.electronAPI.getStore(autoListenResolutionKey, 'never');
    const checkUpdateOnStartup = await window.electronAPI.getStore(checkUpdateOnStartupKey, 'enabled');
    const proxy = await window.electronAPI.getStore(proxyKey, '');
    const autoStart = await window.electronAPI.getStore(autoStartKey, false);
    const overlayNotify = await window.electronAPI.getStore('overlayNotify', 'show');
    const overlayNotifySize = await window.electronAPI.getStore('overlayNotifySize', 1);
    const overlayNotifyDuration = await window.electronAPI.getStore('overlayNotifyDuration', 2);
    const overlayNotifyPosition = await window.electronAPI.getStore('overlayNotifyPosition', 'left');
    const listenNotifyPolicy = await window.electronAPI.getStore('listenNotifyPolicy', 'all');

    this.config.language = normalizeLocale(locale);
    this.config.closeType = closeType;
    this.config.filenameConflictResolution = filenameConflictResolution;
    this.config.autoListenResolution = AutoListenResolution;
    this.config.checkUpdateOnStartup = checkUpdateOnStartup;
    this.config.proxy = proxy;
    this.config.autoStart = autoStart === 'true' || autoStart === true;
    const minimizeOnStartup = await window.electronAPI.getStore(minimizeOnStartupKey, false);
    this.config.minimizeOnStartup = minimizeOnStartup === 'true' || minimizeOnStartup === true;
    this.config.overlayNotify = overlayNotify;
    this.config.overlayNotifySize = this.normalizeScaleValue(overlayNotifySize);
    this.config.overlayNotifyDuration = Number(overlayNotifyDuration) || 2;
    this.config.overlayNotifyPosition = overlayNotifyPosition;
    this.config.listenNotifyPolicy = listenNotifyPolicy;

    await this.loadDataPaths();
  },
  methods: {
    setValue(setting, value) {
      this.config[setting.configKey] = value
      if (typeof setting.handler === 'function') {
        setting.handler.call(this)
      }
    },
    onSelectChange(setting, event) {
      const raw = event.target.value
      const matched = setting.options.find(option => String(option.value) === raw)
      this.config[setting.configKey] = matched ? matched.value : raw
      if (typeof setting.handler === 'function') {
        setting.handler.call(this, event)
      }
    },
    normalizeScaleValue(v) {
      let n = Number.parseFloat(v);
      if (!Number.isFinite(n)) {
        const legacyScales = { small: 0.8, medium: 1, large: 1.25 };
        n = legacyScales[String(v).toLowerCase()] || 1;
      }
      return Math.min(2, Math.max(0.8, n));
    },
    formatScaleValue(v) {
      const n = Number.parseFloat(v);
      if (!Number.isFinite(n)) return '-';
      return (Math.round(n * 100) / 100).toString() + 'x';
    },
    async onLanguageChanged() {
      // 语言热切换：界面立即更新，主进程同步重建托盘菜单，不重启应用
      const code = normalizeLocale(this.config.language)
      this.config.language = code
      this.$i18n.locale = code
      await window.electronAPI.setStore(localeKey, code)
      if (window.electronAPI.applyLocale) {
        await window.electronAPI.applyLocale(code)
      }
    },
    async onCloseTypeChanged() {
      await window.electronAPI.setStore(closeTypeKey, this.config.closeType);
    },
    async onAutoStartChanged() {
      this.config.autoStart = this.config.autoStart === 'true' || this.config.autoStart === true;
      await window.electronAPI.setStore(autoStartKey, this.config.autoStart);
      await window.electronAPI.setAutoStart(this.config.autoStart);
    },
    async onMinimizeOnStartupChanged() {
      this.config.minimizeOnStartup = this.config.minimizeOnStartup === 'true' || this.config.minimizeOnStartup === true;
      await window.electronAPI.setStore(minimizeOnStartupKey, this.config.minimizeOnStartup);
    },
    async onFilenameConflictResolutionChanged() {
      await window.electronAPI.setStore(filenameConflictResolutionKey, this.config.filenameConflictResolution);
    },
    async onAutoListenResolutionChanged() {
      await window.electronAPI.setStore(autoListenResolutionKey, this.config.autoListenResolution);
    },
    async onCheckUpdateOnStartupChanged() {
      await window.electronAPI.setStore(checkUpdateOnStartupKey, this.config.checkUpdateOnStartup);
    },
    async onProxyChanged() {
      await window.electronAPI.setStore(proxyKey, this.config.proxy);
    },
    async testOverlayNotify() {
      await window.electronAPI.showScreenshotNotification({
        img: undefined,
        title: this.$t('SystemSettingsPage.testOverlayNotifyTitle'),
        desc: this.$t('SystemSettingsPage.testOverlayNotifyDesc'),
        type: 'text',
        duration: 3000
      });
    },
    async checkForUpdates() {
      try {
        const result = await window.electronAPI.checkForUpdates();
        // 同步给标题栏版本号，命中新版本会显示 NEW 标记
        this.$emit('update-status', result);
        if (result && result.hasUpdate) {
          await window.electronAPI.openReleasePage(result.releaseUrl);
          if (this.windowsNotify) {
            this.windowsNotify(`${this.$t('SystemSettingsPage.updateAvailable')}: ${result.latestVersion}`);
          }
        } else {
          if (this.windowsNotify) {
            this.windowsNotify(this.$t('SystemSettingsPage.updateNotAvailable'));
          }
        }
      } catch (error) {
        console.error('Check for updates failed:', error);
        if (this.windowsNotify) {
          this.windowsNotify(this.$t('SystemSettingsPage.updateCheckFailed'));
        }
      }
    },
    toggleGroup(index) {
      this.groups[index].collapsed = !this.groups[index].collapsed;
    },
    /** 读取日志文件夹路径，用于在界面和确认框里说明操作范围 */
    async loadDataPaths() {
      try {
        const logFolder = await window.electronAPI.getLogFolder();
        this.dataPaths = { logFolder: logFolder || '' };
      } catch (error) {
        console.error('Failed to load log folder:', error);
      }
    },
    /** 每个数据操作影响的路径提示 */
    pathHint(key) {
      if (key === 'clearLogs') return this.dataPaths.logFolder;
      return '';
    },
    async openLogFolder() {
      const logPath = await window.electronAPI.getLogFolder();
      if (!logPath) return;
      const ensured = await window.electronAPI.ensureFolder(logPath);
      if (!ensured) return;
      await window.electronAPI.openFolder(logPath);
    },
    /** 清空日志：先确认，再删除日志文件夹内的所有日志文件 */
    async clearLogs() {
      const confirmed = await window.electronAPI.showConfirmMessageBox(
        this.$t('SystemSettingsPage.clearLogsConfirmTitle'),
        this.$t('SystemSettingsPage.clearLogsConfirmMessage'),
        this.$t('SystemSettingsPage.clearLogsConfirmDetail', { path: this.dataPaths.logFolder || '-' }),
        [this.$t('SystemSettingsPage.confirmButton'), this.$t('SystemSettingsPage.cancelButton')]
      );
      if (!confirmed) return;

      const result = await window.electronAPI.clearLogFiles();
      if (this.windowsNotify) {
        this.windowsNotify(result && result.ok
          ? this.$t('SystemSettingsPage.clearLogsDone')
          : this.$t('SystemSettingsPage.clearLogsFailed'));
      }
      await this.loadDataPaths();
    }
  }
}
</script>

<style scoped>
.set-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.set-card {
  padding: 12px 16px 8px;
}

.about-card,
.data-card {
  grid-column: span 2;
  align-self: start;
}

/* ---------- 「数据」卡片 ---------- */
.set-row.with-desc {
  align-items: flex-start;
  padding: 12px 0;
  min-height: 62px;
}

.data-label {
  align-items: flex-start;
  gap: 9px;
}

.data-label .data-ico {
  margin-top: 1px;
}

.data-label-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.data-title {
  font-size: 12px;
  color: var(--ink-2);
}

.data-desc {
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.45;
}

.data-path {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9.5px;
  color: var(--ink-3);
  opacity: 0.75;
  word-break: break-all;
  line-height: 1.4;
}

.set-row.with-desc .set-ctl {
  padding-top: 2px;
}

.set-head {
  cursor: pointer;
  user-select: none;
  margin-bottom: 4px;
}

.set-head .chev {
  color: var(--ink-3);
  transition: transform 0.18s ease;
}

.set-rows {
  display: flex;
  flex-direction: column;
}

.set-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 9px 0;
  border-top: 1px solid var(--line);
  min-height: 46px;
}

.set-row:first-child {
  border-top: 0;
}

.set-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-2);
  min-width: 0;
}

.set-label .app-icon {
  color: var(--ink-3);
}

.set-ctl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.set-ctl .ui-select {
  min-width: 132px;
}

.set-ctl .ui-input {
  width: 160px;
  flex: 0 0 auto;
}

.range-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-bound {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9.5px;
  color: var(--ink-3);
}

.range-badge {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: 5px;
  padding: 2px 6px;
  min-width: 42px;
  text-align: center;
}

.ui-range {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 4px;
  border-radius: 99px;
  background: var(--line-strong);
  outline: none;
  cursor: pointer;
}

.ui-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--bg);
  box-shadow: 0 0 0 2px var(--accent-soft);
  cursor: pointer;
}

@media (max-width: 1080px) {
  .set-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
