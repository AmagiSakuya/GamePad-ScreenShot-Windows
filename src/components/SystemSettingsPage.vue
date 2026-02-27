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
            </div>
        </div>

    </div>
</template>

<script>
let localeKey = 'locale';
let closeTypeKey = 'closeType';
let filenameConflictResolutionKey = 'filenameConflictResolution';

export default {
    name: 'SystemSettingsPage',
    components: {

    },
    data() {
        return {
            config: {
                language: 'zh',
                closeType: 'exit',
                filenameConflictResolution: 'overwrite'
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
            ]
        }
    },
    async beforeMount() {

    },
    async mounted() {
        const locale = await window.electronAPI.getStore(localeKey, 'zh');
        const closeType = await window.electronAPI.getStore(closeTypeKey, 'exit');
        const filenameConflictResolution = await window.electronAPI.getStore(filenameConflictResolutionKey, 'overwrite');
        
        this.config.language = locale;
        this.config.closeType = closeType;
        this.config.filenameConflictResolution = filenameConflictResolution;
  
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
        }
    }
}
</script>

<style></style>