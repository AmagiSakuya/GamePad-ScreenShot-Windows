import { createApp } from 'vue'

import App from './App.vue'
import { createI18n } from 'vue-i18n'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'
import ja from './locales/ja.json'
import ko from './locales/ko.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import ru from './locales/ru.json'
import { DEFAULT_LOCALE, normalizeLocale } from './locales/languages'

const app = createApp(App)

app.config.errorHandler = (err, instance, info) => {
    // 让 preload 帮你通知主进程闪退
    window.electronAPI.sendFatalError(err);
};

let localeKey = 'locale';

// 主题需要在挂载前落到 <html> 上，避免首帧闪白
const theme = await window.electronAPI.getStore('theme', 'dark');
document.documentElement.classList.toggle('theme-dark', theme !== 'light');
document.documentElement.classList.toggle('theme-light', theme === 'light');

const locale = normalizeLocale(await window.electronAPI.getStore(localeKey, DEFAULT_LOCALE));

const i18n = createI18n({
    legacy: false, // 如果使用 Composition API，记得设为 false
    locale: locale,
    fallbackLocale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: {
        zh,
        'zh-TW': zhTW,
        en,
        ja,
        ko,
        de,
        fr,
        es,
        ru
    }
})


app.use(i18n)
app.mount('#app')
