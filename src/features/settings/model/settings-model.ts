import type { Lang, LangSetting } from '../../../shared/i18n';
import { resolveLang } from '../../../shared/i18n';
import type { ThemeName } from '../../../shared/render/roles';

export interface Settings {
  theme: 'system' | ThemeName;
  language: LangSetting;
  size: 'S' | 'M' | 'L';
  fps: 15 | 30 | 60;
  missionFrequency: 'often' | 'normal' | 'rare';
  notes: 'off' | 'sometimes' | 'always';
}

export interface ResolvedSettings extends Omit<Settings, 'theme' | 'language'> {
  theme: ThemeName;
  lang: Lang;
}

export interface SettingsEnv {
  systemLanguage: string;
  prefersDark: boolean;
}

export const DEFAULTS: Readonly<Settings> = {
  theme: 'system',
  language: 'system',
  size: 'M',
  fps: 30,
  missionFrequency: 'normal',
  notes: 'sometimes',
};

const ALLOWED: { [K in keyof Settings]: readonly Settings[K][] } = {
  theme: ['system', 'dark', 'light'],
  language: ['system', 'pt', 'en'],
  size: ['S', 'M', 'L'],
  fps: [15, 30, 60],
  missionFrequency: ['often', 'normal', 'rare'],
  notes: ['off', 'sometimes', 'always'],
};

export const SETTING_KEYS = Object.keys(ALLOWED) as (keyof Settings)[];

/** Field-by-field validation: unknown or invalid values fall back to the default. */
export function validate(raw: unknown): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<keyof Settings, unknown>;
  for (const key of SETTING_KEYS) {
    let v = src[key];
    if (key === 'fps' && typeof v === 'string') v = Number(v);
    if ((ALLOWED[key] as readonly unknown[]).includes(v)) out[key] = v;
  }
  return out as Settings;
}

export function changedKeys(a: Settings, b: Settings): (keyof Settings)[] {
  return SETTING_KEYS.filter((k) => a[k] !== b[k]);
}

export function resolve(s: Settings, env: SettingsEnv): ResolvedSettings {
  const { theme, language, ...rest } = s;
  return {
    ...rest,
    theme: theme === 'system' ? (env.prefersDark ? 'dark' : 'light') : theme,
    lang: resolveLang(language, env.systemLanguage),
  };
}

/** Maps URL query parameters (short names) onto settings fields. */
export function overridesFromParams(params: URLSearchParams): Partial<Record<keyof Settings, unknown>> {
  const map: Record<string, keyof Settings> = {
    theme: 'theme',
    lang: 'language',
    size: 'size',
    fps: 'fps',
    freq: 'missionFrequency',
    notes: 'notes',
  };
  const out: Partial<Record<keyof Settings, unknown>> = {};
  for (const [param, key] of Object.entries(map)) {
    const v = params.get(param);
    if (v !== null) out[key] = key === 'fps' ? Number(v) : v;
  }
  return out;
}
