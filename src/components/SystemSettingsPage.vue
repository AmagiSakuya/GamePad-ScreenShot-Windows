<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">{{ $t('systemSettings') }}</h1>
        <p class="page-sub">{{ $t('ui.settingsHint') }}</p>
      </div>

    </div>

    <div class="set-layout">
      <!-- 左列：基础设置 + 数据 -->
      <div class="set-col">
        <SettingsCard v-for="group in groupsLeft" :key="group.key" :group="group" :config="config"
          @change="applySetting" @action="runAction" @toggle="group.collapsed = !group.collapsed" />

        <div class="ui-card data-card">
          <div class="ui-card-head">
            <div class="ui-card-head-left">
              <div class="ui-card-ico warn"><AppIcon name="database" :size="13" /></div>
              <span class="ui-card-title">{{ $t('ui.data') }}</span>
            </div>
            <span class="ui-badge">v{{ version }}</span>
          </div>
          <div class="data-list">
            <div class="data-item" v-for="action in dataActions" :key="action.key">
              <div class="data-main">
                <div class="data-title-row">
                  <AppIcon :name="action.icon" :size="12" class="data-ico" />
                  <span class="data-title">{{ $t('SystemSettingsPage.' + action.key) }}</span>
                </div>
                <span class="data-desc">{{ $t('SystemSettingsPage.' + action.key + 'Desc') }}</span>
                <span v-if="pathHint(action.key)" class="data-path" :title="pathHint(action.key)">{{ pathHint(action.key) }}</span>
              </div>
              <div class="data-ctl">
                <button class="ui-btn sm" :class="{ danger: action.danger }" @click="action.handler.call(this)">
                  {{ $t(action.danger ? 'SystemSettingsPage.clearButton' : 'ui.open') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右列：覆层通知 + 更新设置 -->
      <div class="set-col">
        <SettingsCard v-for="group in groupsRight" :key="group.key" :group="group" :config="config"
          @change="applySetting" @action="runAction" @toggle="group.collapsed = !group.collapsed" />
      </div>
    </div>
  </div>
</template>

<script>
import pkg from '../../package.json';
import AppIcon from '@/components/AppIcon.vue';
import SettingsCard from '@/components/SettingsCard.vue';

const { OVERLAY_SCALE_MIN, OVERLAY_SCALE_MAX, OVERLAY_SCALE_STEP, normalizeOverlayScale } = require('@/lib/overlayScale');

let closeTypeKey = 'closeType';
let filenameConflictResolutionKey = 'filenameConflictResolution';
let autoListenResolutionKey = 'autoListenResolution';
let checkUpdateOnStartupKey = 'checkUpdateOnStartup';
let proxyKey = 'proxy';
let autoStartKey = 'autoStart';
let minimizeOnStartupKey = 'minimizeOnStartup';

export default {
  name: 'SystemSettingsPage',
  components: { AppIcon, SettingsCard },
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
      groupsLeft: [
        {
          key: 'groupBasic',
          icon: 'settings',
          tone: '',
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
              key: 'listenNotifyPolicy',
              icon: 'bell',
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
        }
      ],
      groupsRight: [
        {
          key: 'groupOverlayNotify',
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
              min: OVERLAY_SCALE_MIN,
              max: OVERLAY_SCALE_MAX,
              step: OVERLAY_SCALE_STEP,
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
              key: 'testOverlayNotify',
              icon: 'bell',
              type: 'button',
              buttonIcon: 'bell',
              handler: this.testOverlayNotify
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
              buttonIcon: 'download',
              handler: this.checkForUpdates
            }
          ]
        }
      ]
    }
  },
  async mounted() {
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

    this.config.closeType = closeType;
    this.config.filenameConflictResolution = filenameConflictResolution;
    this.config.autoListenResolution = AutoListenResolution;
    this.config.checkUpdateOnStartup = checkUpdateOnStartup;
    this.config.proxy = proxy;
    this.config.autoStart = autoStart === 'true' || autoStart === true;
    const minimizeOnStartup = await window.electronAPI.getStore(minimizeOnStartupKey, false);
    this.config.minimizeOnStartup = minimizeOnStartup === 'true' || minimizeOnStartup === true;
    this.config.overlayNotify = overlayNotify;
    this.config.overlayNotifySize = normalizeOverlayScale(overlayNotifySize);
    this.config.overlayNotifyDuration = Number(overlayNotifyDuration) || 2;
    this.config.overlayNotifyPosition = overlayNotifyPosition;
    this.config.listenNotifyPolicy = listenNotifyPolicy;

    await this.loadDataPaths();
  },
  methods: {
    /** 子卡片回传的改动：先写回本地配置，再执行该项的持久化 / 副作用 */
    applySetting(setting, value) {
      this.config[setting.configKey] = value
      if (typeof setting.handler === 'function') {
        setting.handler.call(this)
      }
    },
    /** 子卡片里的按钮类设置项 */
    runAction(setting) {
      if (typeof setting.handler === 'function') {
        setting.handler.call(this)
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
/* 两列瀑布流：用 flex 列容器而不是 grid 行，避免同一行卡片高度不同时留出空洞 */
.set-layout {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.set-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ---------- 「数据」卡片 ---------- */
.data-card {
  padding: 11px 14px 4px;
}

.data-list {
  display: flex;
  flex-direction: column;
}

.data-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
  min-height: 44px;
}

.data-item:first-child {
  border-top: 0;
}

.data-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.data-title-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.data-title-row .data-ico {
  color: var(--ink-3);
  flex: 0 0 auto;
}

.data-title {
  font-size: 12px;
  color: var(--ink-2);
}

.data-desc {
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.4;
}

.data-path {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 9.5px;
  color: var(--ink-3);
  opacity: 0.7;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-ctl {
  flex: 0 0 auto;
}

@media (max-width: 1080px) {
  .set-layout {
    flex-direction: column;
  }

  .set-col {
    width: 100%;
  }
}
</style>
