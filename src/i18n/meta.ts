import en, { type MessageKey, type Messages } from './en';

// Native names, shown in the language menu.
export const LOCALES = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ru: 'Русский',
  uk: 'Українська',
  tr: 'Türkçe',
  ar: 'العربية',
  hi: 'हिन्दी',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  th: 'ไทย',
} as const;
export type Locale = keyof typeof LOCALES;
export const isLocale = (v: string | undefined): v is Locale => !!v && v in LOCALES;
export const RTL = new Set<Locale>(['ar']);

export type Vars = Record<string, string | number>;
export const format = (msgs: Partial<Messages>, key: MessageKey, vars?: Vars) =>
  (msgs[key] ?? en[key]).replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`));

/** Best supported locale for a list of BCP 47 tags, e.g. navigator.languages. */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const t = tag.toLowerCase();
    if (t.startsWith('zh')) return /tw|hk|mo|hant/.test(t) ? 'zh-TW' : 'zh-CN';
    const base = t.split('-')[0];
    if (isLocale(base)) return base;
  }
  return null;
}

// Main language per country, for the "switch language?" suggestion.
const COUNTRY_LOCALE: Record<string, Locale> = {};
const add = (l: Locale, codes: string) => codes.split(' ').forEach((c) => (COUNTRY_LOCALE[c] = l));
add('es', 'ES MX AR CO PE VE CL EC GT CU BO DO HN PY SV NI CR PA UY PR GQ');
add('fr', 'FR BE LU MC SN CI CM ML BF NE TD GN BJ TG CD CG GA MG HT');
add('de', 'DE AT CH LI');
add('it', 'IT SM VA');
add('pt', 'PT BR AO MZ CV GW ST TL');
add('nl', 'NL SR');
add('pl', 'PL');
add('ru', 'RU BY KZ KG');
add('uk', 'UA');
add('tr', 'TR');
add('ar', 'SA AE EG IQ JO KW LB LY MA OM QA SY TN YE BH DZ SD PS MR');
add('hi', 'IN');
add('zh-CN', 'CN SG');
add('zh-TW', 'TW HK MO');
add('ja', 'JP');
add('ko', 'KR');
add('vi', 'VN');
add('id', 'ID');
add('th', 'TH');
export const localeForCountry = (cc: string): Locale | undefined => COUNTRY_LOCALE[cc];

