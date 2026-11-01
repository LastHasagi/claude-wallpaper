// Festive colours (seasonal decorations) go last so the older roles keep their indices.
export const COLOR_ROLES = ['bg', 'faint', 'dim', 'mid', 'strong', 'accent', 'paper', 'ink', 'red', 'green', 'gold', 'blue'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export type ThemeName = 'dark' | 'light';

export interface Theme {
  name: ThemeName;
  colors: Record<ColorRole, string>;
}

export const PALETTES: Record<ThemeName, Theme> = {
  dark: {
    name: 'dark',
    colors: {
      bg: '#141413',
      faint: '#34322e',
      dim: '#55524b',
      mid: '#8a857b',
      strong: '#d9d3c6',
      accent: '#d77757',
      paper: '#26241f',
      ink: '#e6e0d3',
      red: '#e0605a',
      green: '#5fae6b',
      gold: '#e6b450',
      blue: '#5b9bd5',
    },
  },
  light: {
    name: 'light',
    colors: {
      bg: '#f0eee6',
      faint: '#dcd8cc',
      dim: '#b5af9f',
      mid: '#7d776b',
      strong: '#3d3929',
      accent: '#c15f3c',
      paper: '#fffdf7',
      ink: '#3d3929',
      red: '#c0392b',
      green: '#2e8b57',
      gold: '#b8860b',
      blue: '#2f6fb0',
    },
  },
};

export const ROLE_INDEX: Record<ColorRole, number> = Object.fromEntries(
  COLOR_ROLES.map((r, i) => [r, i]),
) as Record<ColorRole, number>;
