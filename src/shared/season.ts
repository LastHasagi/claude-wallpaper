export type Season = 'halloween' | 'natal' | 'carnaval';
export const SEASONS: readonly Season[] = ['halloween', 'natal', 'carnaval'];

/** Easter Sunday (Gregorian calendar, Meeus/Jones/Butcher) as [month, day]. */
function easter(year: number): [number, number] {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return [Math.floor(n / 31), (n % 31) + 1];
}

/** Ash Wednesday, the last day of Carnaval: 46 days before Easter, as [month, day]. */
export function ashWednesday(year: number): [number, number] {
  const [m, d] = easter(year);
  const ash = new Date(year, m - 1, d - 46);
  return [ash.getMonth() + 1, ash.getDate()];
}

/** Halloween 15/out–15/nov · Natal 16/nov–15/jan · Carnaval 16/jan–Quarta de Cinzas · otherwise none. */
export function seasonOn(date: Date): Season | null {
  const md = (date.getMonth() + 1) * 100 + date.getDate();
  if (md >= 1015 && md <= 1115) return 'halloween';
  if (md >= 1116 || md <= 115) return 'natal';
  const [am, ad] = ashWednesday(date.getFullYear());
  if (md <= am * 100 + ad) return 'carnaval';
  return null;
}

/** `?season=`: a season, 'none' (forces no season), or undefined (follow the date). */
export function seasonOverride(raw: string | null): Season | null | undefined {
  if (raw === 'none') return null;
  return SEASONS.includes(raw as Season) ? (raw as Season) : undefined;
}
