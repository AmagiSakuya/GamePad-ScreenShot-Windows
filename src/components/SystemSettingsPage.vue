<template>
    <div class="settings-container">
        <div class="settings-content-scroll">
            <div class="settings-content">

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

            </div>
        </div>

    </div>
</template>

<script>
let localeKey = 'locale';
let closeTypeKey = 'closeType';

export default {
    name: 'SystemSettingsPage',
    components: {

    },
    data() {
        return {
            config: {
                language: 'zh',
                closeType: 'exit'
            },
            CloseTypeEnum: [
                'exit',
                'tray'
            ]
        }
    },
    async beforeMount() {

    },
    async mounted() {
        const locale = await window.electronAPI.getStore(localeKey, 'zh');
        this.config.language = locale;
    },
    unmounted() {

    },

    methods: {
        async onLanguageChanged() {
            this.$i18n.locale = this.config.language;
            await window.electronAPI.setStore(localeKey, this.config.language);
        },
        async onCloseTypeChanged() {
            await window.electronAPI.setStore(closeTypeKey, this.config.closeType);
        }
    }
}
</script>

<style></style>