import { createApp } from 'vue'
import App from './App.vue'
import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import en from './locales/en.json'


const app = createApp(App)

const i18n = createI18n({
    legacy: false, // 如果使用 Composition API，记得设为 false
    locale: 'zh',
    messages: {
        zh,
        en
    }
})


app.use(i18n)
app.mount('#app')