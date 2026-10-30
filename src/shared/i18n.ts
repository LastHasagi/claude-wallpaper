export type Lang = 'pt' | 'en';
export type LangSetting = 'system' | Lang;
export type Localized = Record<Lang, string>;

export function resolveLang(setting: LangSetting, systemLanguage: string): Lang {
  if (setting !== 'system') return setting;
  return systemLanguage.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function t(text: Localized, lang: Lang): string {
  return text[lang] || text.en || text.pt;
}
