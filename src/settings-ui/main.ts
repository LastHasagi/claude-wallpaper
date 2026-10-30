import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { EventBus } from '../shared/events';
import { PALETTES } from '../shared/render/roles';
import { LocalStorage } from '../host/local-storage';
import { portrait } from '../features/clawd';
import { SettingsController, type Settings, type SettingsEvents } from '../features/settings';
import { MODE_ART, STRINGS, type NativeMode } from './strings';

interface AppConfig {
  mode: NativeMode;
  onboarded: boolean;
  terrariumOnTop: boolean;
}

const inTauri = '__TAURI_INTERNALS__' in window;
const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const bus = new EventBus<SettingsEvents>();
const settings = new SettingsController(new LocalStorage(), bus, {
  systemLanguage: navigator.language,
  prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
});

// In a plain browser (development preview) the native calls are skipped.
const config: AppConfig = inTauri
  ? await invoke<AppConfig>('get_config')
  : { mode: 'overlay', onboarded: !params.has('welcome'), terrariumOnTop: true };
let chosenMode: NativeMode = config.mode;
let autostart = inTauri ? await isEnabled().catch(() => false) : false;

type RowKey = Exclude<keyof Settings, never>;
const ROWS: { key: RowKey; options: readonly (string | number)[] }[] = [
  { key: 'theme', options: ['system', 'dark', 'light'] },
  { key: 'language', options: ['system', 'pt', 'en'] },
  { key: 'size', options: ['S', 'M', 'L'] },
  { key: 'missionFrequency', options: ['often', 'normal', 'rare'] },
  { key: 'notes', options: ['off', 'sometimes', 'always'] },
  { key: 'fps', options: [15, 30, 60] },
];

function applyTheme(): void {
  const c = PALETTES[settings.resolved().theme].colors;
  const root = document.documentElement.style;
  for (const role of ['bg', 'paper', 'ink', 'mid', 'dim', 'faint', 'accent'] as const) root.setProperty(`--${role}`, c[role]);
  document.documentElement.lang = settings.resolved().lang === 'pt' ? 'pt-BR' : 'en';
}

function drawMascot(): void {
  const sprite = portrait();
  const scale = 3;
  const canvas = $<HTMLCanvasElement>('mascot');
  canvas.width = sprite.w * scale;
  canvas.height = sprite.h * scale;
  const ctx = canvas.getContext('2d')!;
  sprite.pixels.forEach((color, i) => {
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect((i % sprite.w) * scale, Math.floor(i / sprite.w) * scale, scale, scale);
  });
}

function changeSetting(key: RowKey, value: string | number): void {
  const patch = { [key]: value } as Partial<Settings>;
  settings.set(patch);
  // Broadcast: the pet window's label changes every time it is recreated.
  if (inTauri) void emit('settings-changed', patch).catch(() => {});
}

async function changeMode(mode: NativeMode): Promise<void> {
  chosenMode = mode;
  if (config.onboarded && inTauri) await invoke('set_mode', { mode }).catch(console.error);
  config.mode = mode;
  render();
}

function segmented(key: RowKey, options: readonly (string | number)[], current: string | number, label: (v: string | number) => string): HTMLElement {
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'group');
  for (const opt of options) {
    const b = document.createElement('button');
    b.textContent = label(opt);
    b.setAttribute('aria-pressed', String(opt === current));
    b.addEventListener('click', () => changeSetting(key, opt));
    seg.append(b);
  }
  return seg;
}

function toggleRow(text: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  const id = `t-${text.length}-${Math.random().toString(36).slice(2, 6)}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = text;
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'switch';
  box.id = id;
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  row.append(label, box);
  return row;
}

function render(): void {
  applyTheme();
  const s = STRINGS[settings.resolved().lang];
  const welcome = !config.onboarded;
  $('title').textContent = welcome ? s.welcome : s.settings;
  $('subtitle').textContent = welcome ? s.welcomeSub : s.settingsSub;
  $('mode-heading').textContent = s.mode;
  $('prefs-heading').textContent = s.prefs;
  $('fan').textContent = s.fan;
  const start = $<HTMLButtonElement>('start');
  start.hidden = !welcome;
  start.textContent = s.start;

  const modes = $('modes');
  modes.replaceChildren(
    ...(Object.keys(MODE_ART) as NativeMode[]).map((mode) => {
      const card = document.createElement('button');
      card.className = 'mode';
      card.setAttribute('aria-pressed', String(mode === chosenMode));
      const art = document.createElement('pre');
      art.textContent = MODE_ART[mode];
      const [title = '', desc = ''] = s.modes[mode];
      const b = document.createElement('b');
      b.textContent = title;
      const span = document.createElement('span');
      span.textContent = desc;
      card.append(art, b, span);
      card.addEventListener('click', () => void changeMode(mode));
      return card;
    }),
  );

  const current = settings.get();
  const prefs = $('prefs');
  prefs.replaceChildren(
    ...ROWS.map(({ key, options }) => {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = s.rows[key as keyof typeof s.rows];
      row.append(label, segmented(key, options, current[key], (v) => s.values[v as keyof typeof s.values] ?? String(v)));
      return row;
    }),
    toggleRow(s.rows.autostart, autostart, (on) => {
      autostart = on;
      if (inTauri) void (on ? enable() : disable()).catch(console.error);
    }),
    toggleRow(s.rows.onTop, config.terrariumOnTop, (on) => {
      config.terrariumOnTop = on;
      if (inTauri) void invoke('set_terrarium_on_top', { on }).catch(console.error);
    }),
  );
}

$('start').addEventListener('click', () => {
  if (inTauri) void invoke('finish_onboarding', { mode: chosenMode }).catch(console.error);
  else {
    config.onboarded = true;
    render();
  }
});
bus.on('settings:changed', render);
drawMascot();
render();
