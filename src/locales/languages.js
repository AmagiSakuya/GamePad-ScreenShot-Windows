/**
 * 支持的界面语言清单。
 * code   —— 与 src/locales/<code>.json 同名，也是存储在配置里的值
 * native —— 语言自身写法，下拉框里始终显示母语，避免用户切错后找不到自己熟悉的语言
 * short  —— 顶栏按钮上的缩写
 */
export const LANGUAGES = [
  { code: 'zh', native: '简体中文', short: '中' },
  { code: 'zh-TW', native: '繁體中文', short: '繁' },
  { code: 'en', native: 'English', short: 'EN' },
  { code: 'ja', native: '日本語', short: '日' },
  { code: 'ko', native: '한국어', short: '한' },
  { code: 'de', native: 'Deutsch', short: 'DE' },
  { code: 'fr', native: 'Français', short: 'FR' },
  { code: 'es', native: 'Español', short: 'ES' },
  { code: 'ru', native: 'Русский', short: 'RU' }
];

export const DEFAULT_LOCALE = 'zh';

/** 兼容旧配置 / 未知语言的兜底 */
export function normalizeLocale(code) {
  const hit = LANGUAGES.find((item) => item.code === code);
  return hit ? hit.code : DEFAULT_LOCALE;
}

export function getLanguage(code) {
  return LANGUAGES.find((item) => item.code === code) || LANGUAGES[0];
}
