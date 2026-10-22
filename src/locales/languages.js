/**
 * 支持的界面语言清单。
 * code   —— 与 src/locales/<code>.json 同名，也是存储在配置里的值
 * native —— 语言自身写法，下拉框里始终显示母语，避免用户切错后找不到自己熟悉的语言
 * short  —— 顶栏按钮上的缩写
 * intl   —— 交给 toLocaleString / Intl 的 BCP-47 标签。
 *           日期时间必须显式传它：不传就跟随操作系统区域，
 *           中文 Windows 上跑日文界面会显示成「下午3:28」。
 */
export const LANGUAGES = [
  { code: 'zh', native: '简体中文', short: '中', intl: 'zh-CN' },
  { code: 'zh-TW', native: '繁體中文', short: '繁', intl: 'zh-TW' },
  { code: 'en', native: 'English', short: 'EN', intl: 'en-US' },
  { code: 'ja', native: '日本語', short: '日', intl: 'ja-JP' },
  { code: 'ko', native: '한국어', short: '한', intl: 'ko-KR' },
  { code: 'de', native: 'Deutsch', short: 'DE', intl: 'de-DE' },
  { code: 'fr', native: 'Français', short: 'FR', intl: 'fr-FR' },
  { code: 'es', native: 'Español', short: 'ES', intl: 'es-ES' },
  { code: 'ru', native: 'Русский', short: 'RU', intl: 'ru-RU' }
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

/** 配置里的语言 code → 日期时间格式化用的 BCP-47 标签 */
export function getIntlLocale(code) {
  return getLanguage(normalizeLocale(code)).intl;
}
