import type { Lang, LangSetting } from '../../../shared/i18n';
import { resolveLang } from '../../../shared/i18n';
import type { ThemeName } from '../../../shared/render/roles';

/** Accessories Clawd can wear: one on his head, one on his face. */
export const HEAD_ITEMS = ['witch', 'santa', 'crown', 'cap', 'bow'] as const;
export const FACE_ITEMS = ['shades', 'mask', 'mustache'] as const;
export type HeadItem = (typeof HEAD_ITEMS)[number];
export type FaceItem = (typeof FACE_ITEMS)[number];

export interface Settings {
  theme: 'system' | ThemeName;
  language: LangSetting;
  size: 'S' | 'M' | 'L';
  fps: 15 | 30 | 60;
  missionFrequency: 'often' | 'normal' | 'rare';
  notes: 'off' | 'sometimes' | 'always';
  /** How often Clawd steals the mouse pointer (Windows only). */
  cursor: 'off' | 'sometimes' | 'often';
  /** Dancing while media plays (Windows only). */
  dance: 'off' | 'sometimes' | 'always';
  /** 'auto' follows the season; 'none' wears nothing. */
  head: 'auto' | 'none' | HeadItem;
  face: 'auto' | 'none' | FaceItem;
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
  cursor: 'sometimes',
  dance: 'sometimes',
  head: 'auto',
  face: 'auto',
};

const ALLOWED: { [K in keyof Settings]: readonly Settings[K][] } = {
  theme: ['system', 'dark', 'light'],
  language: ['system', 'pt', 'en'],
  size: ['S', 'M', 'L'],
  fps: [15, 30, 60],
  missionFrequency: ['often', 'normal', 'rare'],
  notes: ['off', 'sometimes', 'always'],
  cursor: ['off', 'sometimes', 'often'],
  dance: ['off', 'sometimes', 'always'],
  head: ['auto', 'none', ...HEAD_ITEMS],
  face: ['auto', 'none', ...FACE_ITEMS],
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
    cursor: 'cursor',
    dance: 'dance',
    head: 'head',
    face: 'face',
  };
  const out: Partial<Record<keyof Settings, unknown>> = {};
  for (const [param, key] of Object.entries(map)) {
    const v = params.get(param);
    if (v !== null) out[key] = key === 'fps' ? Number(v) : v;
  }
  return out;
}
