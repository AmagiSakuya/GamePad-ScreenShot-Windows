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
            </div>
        </div>

    </div>
</template>

<script>

export default {
    name: 'OBSConnectPage',
    components: {

    },
    data() {
        return {
            config: {
                language: 'zh',
                bootAtWindowsStartup: false,
                startListeningAtStartup: false,
                silentStartup: false
            }
        }
    },
    async beforeMount() {

    },
    async mounted() {

    },
    unmounted() {

    },
    methods: {
        onLanguageChanged() {
            this.$i18n.locale = this.config.language;
        }
    }
}
</script>

<style></style>