<template>
    <div class="settings-container">
        <div class="settings-content-scroll">
            <div class="settings-content">
                <!-- 语言 -->
                <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-gamepad"></i>
                        <span> {{ $t('SystemSettingsPage.language') }} </span>
                    </div>
                    <div class="setting-controls">
                        <select class="form-select" v-model="config.language" @change="onLanguageChanged">
                            <option value="zh">中文</option>
                            <option value="en">English</option>
                        </select>
                    </div>

                </div>
                <!-- 关闭方案 -->
                <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-gamepad"></i>
                        <span> {{ $t('SystemSettingsPage.closeType') }} </span>
                    </div>
                    <div class="setting-controls">
                        <select class="form-select" v-model="config.closeType" @change="onCloseTypeChanged">
                             <option v-for="(value, index) in CloseTypeEnum" :key="index" :value="value">{{ $t(`SystemSettingsPage.closeTypeEnum.${value}`) }}</option>
                        </select>
                    </div>
                </div>

                 <!-- 文件名冲突方案 -->
                 <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-gamepad"></i>
                        <span> {{ $t('SystemSettingsPage.filenameConflictResolution') }} </span>
                    </div>
                    <div class="setting-controls">
                        <select class="form-select" v-model="config.filenameConflictResolution" @change="onFilenameConflictResolutionChanged">
                             <option v-for="(value, index) in FilenameConflictResolution" :key="index" :value="value">{{ $t(`SystemSettingsPage.filenameConflictResolutionEnum.${value}`) }}</option>
                        </select>
                    </div>
                </div>

                 <!-- 自动开始方案 -->
                 <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-gamepad"></i>
                        <span> {{ $t('SystemSettingsPage.autoListenResolution') }} </span>
                    </div>
                    <div class="setting-controls">
                        <select class="form-select" v-model="config.autoListenResolution" @change="onAutoListenResolutionChanged">
                             <option v-for="(value, index) in AutoListenResolution" :key="index" :value="value">{{ $t(`SystemSettingsPage.autoListenResolutionEnum.${value}`) }}</option>
                        </select>
                    </div>
                </div>

                <!-- 启动时检测更新 -->
                <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-sync"></i>
                        <span> {{ $t('SystemSettingsPage.checkUpdateOnStartup') }} </span>
                    </div>
                    <div class="setting-controls" style="display: flex; align-items: center;">
                        <select class="form-select" v-model="config.checkUpdateOnStartup" @change="onCheckUpdateOnStartupChanged" style="flex: 1; margin-right: 10px;">
                            <option value="enabled">{{ $t('SystemSettingsPage.enabled') }}</option>
                            <option value="disabled">{{ $t('SystemSettingsPage.disabled') }}</option>
                        </select>
                        <button class="btn btn-primary" @click="checkForUpdates">
                            <span>{{ $t('SystemSettingsPage.checkUpdate') }}</span>
                        </button>
                    </div>
                </div>

                <!-- 网络代理 -->
                <div class="setting-row">
                    <div class="setting-label">
                        <i class="fas fa-globe"></i>
                        <span> {{ $t('SystemSettingsPage.proxy') }} </span>
                    </div>
                    <div class="setting-controls">
                        <div class="input-wrapper">
                            <input type="text" class="form-input" placeholder="192.168.1.1:8080" v-model="config.proxy" @change="onProxyChanged">
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
                proxy: ''
            },
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

        this.config.language = locale;
        this.config.closeType = closeType;
        this.config.filenameConflictResolution = filenameConflictResolution;
        this.config.autoListenResolution = AutoListenResolution;
        this.config.checkUpdateOnStartup = checkUpdateOnStartup;
        this.config.proxy = proxy;
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
        }
    }
}

</script>

<style></style>