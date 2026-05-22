<template>
    <div class="settings-container">
        <div class="settings-content-scroll">
            <div class="settings-content">
                <div class="setting-group" v-for="(group, index) in groups" :key="index">
                    <div class="group-title" @click="toggleGroup(index)">
                        <i :class="group.icon"></i>
                        <span>{{ $t(`SystemSettingsPage.${group.key}`) }}</span>
                        <span :class="group.collapsed ? 'collapse-icon-right' : 'collapse-icon-down'">{{ group.collapsed
                            ? '▶' : '▼' }}</span>
                    </div>
                    <div class="group-content" v-show="!group.collapsed">
                        <div class="setting-row" v-for="(setting, settingIndex) in group.settings" :key="settingIndex">
                            <div class="setting-label">
                                <i :class="setting.icon"></i>
                                <span>{{ $t(`SystemSettingsPage.${setting.key}`) }}</span>
                            </div>
                            <div class="setting-controls" :class="{ 'setting-controls-inline': setting.inline }">
                                <select v-if="setting.type === 'select'" class="form-select"
                                    :value="config[setting.configKey]" @change="e => { config[setting.configKey] = setting.configKey === 'autoStart' ? (e.target.value === 'true') : e.target.value; setting.handler.call(this, e); }">
                                    <option v-for="(option, optionIndex) in setting.options" :key="optionIndex"
                                        :value="option.value">{{ $t(option.label) }}</option>
                                </select>
                                <input v-if="setting.type === 'input'" type="text" class="form-input"
                                    :placeholder="setting.placeholder" :value="config[setting.configKey]"
                                    @input="e => { config[setting.configKey] = e.target.value; setting.handler.call(this, e); }">
                                <button v-if="setting.type === 'button'" class="btn btn-primary compact"
                                    @click="setting.handler">
                                    <span>{{ $t(`SystemSettingsPage.${setting.key}`) }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
                <div class="setting-group">
                    <div class="group-content">
                        <div class="setting-row">
                            <div class="setting-controls">
                                <button class="btn compact" @click="openLogFolder">{{ $t('SystemSettingsPage.openLogFolder') }}</button>
                            </div>
                        </div>
                    </div>
                </div>
        </div>

    </div>
</template>

<script>
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
    components: {

    },
    props: {
        windowsNotify: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
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
                overlayNotifyDuration: 3,
                listenNotifyPolicy: 'all'
                },
                groups: [
                {
                    key: 'groupBasic',
                    icon: 'fas fa-cog',
                    collapsed: false,
                    settings: [
                        {
                            key: 'language',
                            icon: 'fas fa-language',
                            type: 'select',
                            configKey: 'language',
                            handler: this.onLanguageChanged,
                            options: [
                                { value: 'zh', label: 'SystemSettingsPage.languageChinese' },
                                { value: 'en', label: 'SystemSettingsPage.languageEnglish' }
                            ]
                        },
                        {
                            key: 'autoStart',
                            icon: 'fas fa-play-circle',
                            type: 'select',
                            configKey: 'autoStart',
                            handler: this.onAutoStartChanged,
                            options: [
                                { value: true, label: 'SystemSettingsPage.enabled' },
                                { value: false, label: 'SystemSettingsPage.disabled' }
                            ]
                        },
                        {
                            key: 'closeType',
                            icon: 'fas fa-power-off',
                            type: 'select',
                            configKey: 'closeType',
                            handler: this.onCloseTypeChanged,
                            options: [
                                { value: 'exit', label: 'SystemSettingsPage.closeTypeEnum.exit' },
                                { value: 'tray', label: 'SystemSettingsPage.closeTypeEnum.tray' }
                            ]
                        }
                    ]
                },
                {
                    key: 'groupNotify',
                    icon: 'fas fa-bell',
                    collapsed: true,
                    settings: [
                        {
                            key: 'overlayNotify',
                            icon: 'fas fa-bell',
                            type: 'select',
                            configKey: 'overlayNotify',
                            handler: async function() { await window.electronAPI.setStore('overlayNotify', this.config.overlayNotify) },
                            options: [
                                { value: 'show', label: 'SystemSettingsPage.overlayNotifyEnum.show' },
                                { value: 'hide', label: 'SystemSettingsPage.overlayNotifyEnum.hide' }
                            ]
                        },
                        {
                            key: 'overlayNotifyDuration',
                            icon: 'fas fa-clock',
                            type: 'select',
                            configKey: 'overlayNotifyDuration',
                            handler: async function() { await window.electronAPI.setStore('overlayNotifyDuration', this.config.overlayNotifyDuration) },
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
                            icon: 'fas fa-bullhorn',
                            type: 'select',
                            configKey: 'listenNotifyPolicy',
                            handler: async function() { await window.electronAPI.setStore('listenNotifyPolicy', this.config.listenNotifyPolicy) },
                            options: [
                                { value: 'all', label: 'SystemSettingsPage.listenNotifyPolicyEnum.all' },
                                { value: 'start', label: 'SystemSettingsPage.listenNotifyPolicyEnum.start' },
                                { value: 'stop', label: 'SystemSettingsPage.listenNotifyPolicyEnum.stop' },
                                { value: 'none', label: 'SystemSettingsPage.listenNotifyPolicyEnum.none' }
                            ]
                        }
                    ]
                },
                {
                    key: 'groupPolicy',
                    icon: 'fas fa-shield-alt',
                    collapsed: true,
                    settings: [
                        {
                            key: 'filenameConflictResolution',
                            icon: 'fas fa-file-contract',
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
                            key: 'minimizeOnStartup',
                            icon: 'fas fa-window-minimize',
                            type: 'select',
                            configKey: 'minimizeOnStartup',
                            handler: this.onMinimizeOnStartupChanged,
                            options: [
                                { value: true, label: 'SystemSettingsPage.enabled' },
                                { value: false, label: 'SystemSettingsPage.disabled' }
                            ]
                        },
                        {
                            key: 'autoListenResolution',
                            icon: 'fas fa-play-circle',
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
                    icon: 'fas fa-cloud-download-alt',
                    collapsed: true,
                    settings: [
                        {
                            key: 'checkUpdateOnStartup',
                            icon: 'fas fa-sync',
                            type: 'select',
                            configKey: 'checkUpdateOnStartup',
                            handler: this.onCheckUpdateOnStartupChanged,
                            inline: true,
                            options: [
                                { value: 'enabled', label: 'SystemSettingsPage.enabled' },
                                { value: 'disabled', label: 'SystemSettingsPage.disabled' }
                            ]
                        },
                        {
                            key: 'checkUpdate',
                            icon: 'fas fa-search',
                            type: 'button',
                            handler: this.checkForUpdates
                        },
                        {
                            key: 'proxy',
                            icon: 'fas fa-globe',
                            type: 'input',
                            configKey: 'proxy',
                            handler: this.onProxyChanged,
                            placeholder: '127.0.0.1:8080'
                        }
                    ]
                }
            ],
            CloseTypeEnum: [
                'exit',
                'tray'
            ],
            FilenameConflictResolution: [
                'overwrite',
                'appendTimestamp',
                'notSave',
                'askEveryTime'
            ],
            AutoListenResolution: [
                'whenDeviceAvailable',
                'never'
            ]
        }
    },
    async beforeMount() {

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
        const overlayNotifyDuration = await window.electronAPI.getStore('overlayNotifyDuration', 2);

        this.config.language = locale;
        this.config.closeType = closeType;
        this.config.filenameConflictResolution = filenameConflictResolution;
        this.config.autoListenResolution = AutoListenResolution;
        this.config.checkUpdateOnStartup = checkUpdateOnStartup;
        this.config.proxy = proxy;
        this.config.autoStart = autoStart === 'true' || autoStart === true;
        const minimizeOnStartup = await window.electronAPI.getStore(minimizeOnStartupKey, false);
        this.config.minimizeOnStartup = minimizeOnStartup === 'true' || minimizeOnStartup === true;
        this.config.overlayNotify = overlayNotify;
        this.config.overlayNotifyDuration = Number(overlayNotifyDuration) || 2;
    },
    unmounted() {

    },
    methods: {
        async onLanguageChanged() {
            this.$i18n.locale = this.config.language;
            await window.electronAPI.setStore(localeKey, this.config.language);
            // 重启应用以应用语言更改
            await window.electronAPI.restartApp();
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
        async checkForUpdates() {
            try {
                const result = await window.electronAPI.checkForUpdates();
                if (result.hasUpdate) {
                    // 自动打开浏览器进入发布页面
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
        async openLogFolder() {

            const logPath = await window.electronAPI.getLogFolder();
            if (!logPath) {
                return;
            }
            // 确保文件夹存在（如果不存在则创建），再打开
            const ensured = await window.electronAPI.ensureFolder(logPath);
            if (!ensured) {
                return;
            }
            await window.electronAPI.openFolder(logPath);
        }
    }
}

</script>

<style>
.settings-container {
    padding: 12px 14px;
}

.settings-content {
    padding: 0;
}

.setting-group {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px 16px;
    margin-bottom: 16px;
    background: #ffffff;
}

.group-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #2d3748;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    padding: 8px 0;
    border-radius: 6px;
    transition: background-color 0.2s;
    user-select: none;
}

.group-title:hover {
    background-color: #f7fafc;
}

.group-title i:first-child {
    margin-right: 8px;
}

.collapse-icon-right,
.collapse-icon-down {
    font-size: 0.8rem;
    color: #718096;
    transition: transform 0.2s;
    user-select: none;
    font-weight: bold;
    margin-right: 10px;
}

.group-content {
    transition: all 0.3s ease;
}

/* .setting-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    margin: 0;
    border-bottom: 1px solid #edf2f7;
} */

.setting-row:last-child {
    border-bottom: none;
}

.setting-label {
    min-width: 140px;
    color: #4a5568;
    display: flex;
    align-items: center;
    /* gap: 10px; */
}

.setting-controls {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
}

.setting-controls.setting-controls-inline {
    align-items: center;
}

.form-select,
.form-input {
    min-height: 36px;
    padding: 8px 12px;
    border-radius: 8px;
}

.btn.compact {
    padding: 8px 16px;
    font-size: 0.92rem;
    min-width: 100px;
    white-space: nowrap;
}
</style>