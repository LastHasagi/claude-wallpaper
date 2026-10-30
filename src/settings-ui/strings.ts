import type { Lang } from '../shared/i18n';

export type NativeMode = 'overlay' | 'terrarium' | 'wallpaper';

const pt = {
  welcome: 'Oi! Eu sou o Clawd.',
  welcomeSub: 'Como você quer que eu more no seu PC? Dá pra mudar depois.',
  settings: 'Configurações',
  settingsSub: 'As mudanças valem na hora.',
  mode: 'Modo',
  prefs: 'Preferências',
  start: 'Começar',
  credit: 'Feito por Rodrigo Graça',
  modes: {
    overlay: ['Pet solto', 'Anda por cima de tudo, acima da barra de tarefas. Os cliques atravessam.'],
    terrarium: ['Terrário', 'Uma janelinha com o cenário completo. Arraste pelo topo.'],
    wallpaper: ['Papel de parede', 'O cenário vira o fundo da área de trabalho.'],
  },
  rows: {
    theme: 'Tema', language: 'Idioma', size: 'Tamanho', missionFrequency: 'Missões', notes: 'Curiosidades', fps: 'Animação (fps)',
    autostart: 'Iniciar com o sistema', onTop: 'Terrário sempre por cima',
  },
  values: {
    system: 'sistema', dark: 'escuro', light: 'claro', pt: 'PT', en: 'EN', S: 'P', M: 'M', L: 'G',
    often: 'frequentes', normal: 'normal', rare: 'raras', off: 'nunca', sometimes: 'às vezes', always: 'sempre',
  },
};

const en: typeof pt = {
  welcome: "Hi! I'm Clawd.",
  welcomeSub: 'How would you like me to live on your computer? You can change it later.',
  settings: 'Settings',
  settingsSub: 'Changes apply right away.',
  mode: 'Mode',
  prefs: 'Preferences',
  start: 'Start',
  credit: 'Made by Rodrigo Graça',
  modes: {
    overlay: ['Free-roaming pet', 'Walks on top of everything, above the taskbar. Clicks go through.'],
    terrarium: ['Terrarium', 'A small window with the full scene. Drag it by the top edge.'],
    wallpaper: ['Wallpaper', 'The scene becomes your desktop background.'],
  },
  rows: {
    theme: 'Theme', language: 'Language', size: 'Size', missionFrequency: 'Missions', notes: 'Curiosities', fps: 'Animation (fps)',
    autostart: 'Start with the system', onTop: 'Terrarium always on top',
  },
  values: {
    system: 'system', dark: 'dark', light: 'light', pt: 'PT', en: 'EN', S: 'S', M: 'M', L: 'L',
    often: 'often', normal: 'normal', rare: 'rare', off: 'never', sometimes: 'sometimes', always: 'always',
  },
};

export const STRINGS: Record<Lang, typeof pt> = { pt, en };

/** Author links shown in the settings footer (also allow-listed in the Tauri capabilities). */
export const AUTHOR_LINKS = [
  { label: 'GitHub', url: 'https://github.com/LastHasagi' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/in/rodrigo-de-souza-graca/' },
] as const;

/** Tiny ASCII pictograms for the mode cards. */
export const MODE_ART: Record<NativeMode, string> = {
  overlay: '  ▄▄  \n ▀██▀ \n▔▔▔▔▔▔',
  terrarium: '┌────┐\n│ ▄▄ │\n└────┘',
  wallpaper: '/\\ /\\\n ▄▄  \n▁▁▁▁▁',
};
