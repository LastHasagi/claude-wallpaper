import { hash2 } from '../../../shared/rng';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import { parsePropArt } from '../../../shared/render/prop-art';
import type { ColorRole } from '../../../shared/render/roles';
import type { TimeOfDay } from '../../../shared/time';

export interface BiomeCtx {
  cols: number;
  rows: number;
  /** Row of the ground line; Clawd's feet rest on the bottom edge of this row. */
  groundRow: number;
  tod: TimeOfDay;
  seed: number;
}

/**
 * Smooth ridge height (fractional row) per column, indexed c+1 for c in [-1, cols] so
 * neighbours always exist. Each wave: amplitude in rows, cycles per screen width, phase.
 */
export function ridgeLine(cols: number, base: number, waves: [amp: number, perScreen: number, phase: number][]): number[] {
  const out: number[] = [];
  for (let c = -1; c <= cols; c++) {
    let v = base;
    for (const [amp, perScreen, phase] of waves) v += amp * Math.sin((c / cols) * perScreen * Math.PI * 2 + phase);
    out.push(v);
  }
  return out;
}

/** Triangular peaks with 45° slopes (one row per column), indexed like `ridgeLine`. */
export function peaksLine(cols: number, foot: number, seed: number, count: number, minH: number, maxH: number): number[] {
  const peaks = Array.from({ length: count }, (_, k) => ({
    x: (k + 0.2 + hash2(seed, 50 + k) * 0.6) * (cols / count),
    h: minH + hash2(seed, 80 + k) * (maxH - minH),
  }));
  const out: number[] = [];
  for (let c = -1; c <= cols; c++) {
    let best = 0;
    for (const p of peaks) best = Math.max(best, p.h - Math.abs(c - p.x));
    out.push(Math.round(foot - best));
  }
  return out;
}

const SUBROW = ["'", '-', '.', '_'];

/** Gentle hills: the edge char follows the fractional height inside the cell (_.-'), filled below. */
export function paintSmoothRidge(g: AsciiGrid, line: number[], bottomRow: number, st: RidgeStyle): void {
  for (let c = 0; c < g.cols; c++) {
    const y = line[c + 1]!;
    const top = Math.floor(y);
    const sub = SUBROW[Math.min(3, Math.floor((y - top) * 4))]!;
    for (let r = Math.max(0, top); r < bottomRow; r++) {
      if (r === top) {
        g.set(c, r, sub, st.edge);
        continue;
      }
      const v = hash2(c * 7 + st.salt, r * 13 + st.salt);
      if (v < st.density) g.set(c, r, st.fillChars[Math.floor((v / st.density) * st.fillChars.length)]!, st.fill);
      else g.set(c, r, ' ', null);
    }
  }
}

export function ridgeChar(prev: number, cur: number, next: number): string {
  const prevLower = prev > cur, nextLower = next > cur;
  if (prevLower && nextLower) return '^';
  if (prevLower) return '/';
  if (nextLower) return '\\';
  return '_';
}

export interface RidgeStyle {
  edge: ColorRole;
  fill: ColorRole;
  fillChars: string;
  density: number;
  salt: number;
}

/** Paints a /\ ridge outline and its (sparse) texture down to `bottomRow` (exclusive), hiding what's behind. */
export function paintRidge(g: AsciiGrid, line: number[], bottomRow: number, st: RidgeStyle): void {
  for (let c = 0; c < g.cols; c++) {
    const top = line[c + 1]!;
    if (top >= bottomRow) continue;
    for (let r = Math.max(0, top); r < bottomRow; r++) {
      if (r === top) {
        g.set(c, r, ridgeChar(line[c]!, top, line[c + 2]!), st.edge);
        continue;
      }
      const v = hash2(c * 7 + st.salt, r * 13 + st.salt);
      if (v < st.density) g.set(c, r, st.fillChars[Math.floor((v / st.density) * st.fillChars.length)]!, st.fill);
      else g.set(c, r, ' ', null);
    }
  }
}

export interface GroundStyle {
  line: string;
  lineRole: ColorRole;
  texture: string;
  density: number;
  role: ColorRole;
  salt: number;
}

export function paintGround(g: AsciiGrid, ctx: BiomeCtx, st: GroundStyle): void {
  for (let c = 0; c < g.cols; c++) g.set(c, ctx.groundRow, st.line, st.lineRole);
  for (let r = ctx.groundRow + 1; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const v = hash2(c * 3 + st.salt, r * 17 + st.salt);
      if (v < st.density) g.set(c, r, st.texture[Math.floor((v / st.density) * st.texture.length)]!, st.role);
      else g.set(c, r, ' ', null);
    }
  }
}

export interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Areas may come from fractional ridge heights; work on whole cells. */
const snap = (a: Area): Area => ({ x0: Math.floor(a.x0), x1: Math.floor(a.x1), y0: Math.floor(a.y0), y1: Math.floor(a.y1) });

const SUN = parsePropArt({ frames: [[' \\ | / ', '-- O --', ' / | \\ ']], solidInterior: false });
const SUN_LOW = parsePropArt({ frames: [['  \\ | /  ', ' _.-"-._ ']], solidInterior: false });
const MOON = parsePropArt({ frames: [['  .--. ', ' /  .\'', '|  (   ', ' \\  \'. ', "  '--' "]], solidInterior: false });

const starDensity: Record<TimeOfDay, number> = { day: 0, dusk: 0.004, night: 0.013 };

/** Stars and the sun or moon, inside columns [x0, x1) and rows [y0, y1). */
export function paintSky(g: AsciiGrid, ctx: BiomeCtx, area: { x0: number; x1: number; y0: number; y1: number }): void {
  area = snap(area);
  const density = starDensity[ctx.tod];
  for (let r = area.y0; r < area.y1; r++) {
    for (let c = area.x0; c < area.x1; c++) {
      const v = hash2(c + ctx.seed, r * 3 + ctx.seed);
      if (v < density) g.set(c, r, v < density * 0.2 ? '*' : '.', v < density * 0.5 ? 'mid' : 'dim');
    }
  }
  const w = area.x1 - area.x0;
  if (ctx.tod === 'day') g.blit(SUN, area.x1 - Math.min(18, Math.floor(w * 0.25)) - SUN.w, area.y0 + 1);
  else if (ctx.tod === 'dusk') {
    for (const [r, line] of SUN_LOW.frames[0]!.entries()) g.text(area.x1 - Math.floor(w * 0.22) - SUN_LOW.w, area.y1 - 2 + r, line.trim() ? line : '', 'accent');
  } else g.blit(MOON, area.x1 - Math.min(16, Math.floor(w * 0.22)) - MOON.w, area.y0 + 1);
}

/** Twinkling stars at night/dusk, only on empty sky cells. */
export function twinkle(g: AsciiGrid, ctx: BiomeCtx, area: { x0: number; x1: number; y0: number; y1: number }, t: number): void {
  area = snap(area);
  if (ctx.tod === 'day') return;
  const count = Math.floor(((area.x1 - area.x0) * (area.y1 - area.y0)) / 260);
  for (let k = 0; k < count; k++) {
    const c = area.x0 + Math.floor(hash2(k, ctx.seed + 11) * (area.x1 - area.x0));
    const r = area.y0 + Math.floor(hash2(k, ctx.seed + 23) * (area.y1 - area.y0));
    if (!g.isEmpty(c, r)) continue;
    const phase = Math.floor(t * 1.5 + hash2(k, 5) * 8) % 8;
    if (phase === 0) g.set(c, r, '+', 'mid');
    else if (phase < 3) g.set(c, r, '.', 'dim');
  }
}

const CLOUDS = [
  ['   .--.    ', '.-(    ).  ', '(___.__)__)'],
  ['  .-~~-.  ', ' (      )_', '(_________)'],
  [' .--. ', '(____)'],
].map((lines) => parsePropArt({ frames: [lines], role: 'dim', solidInterior: true }));

/** Clouds drifting slowly to the right, between rows y0 and y1. Fewer at night. */
export function drawClouds(g: AsciiGrid, ctx: BiomeCtx, area: { x0: number; x1: number; y0: number; y1: number }, t: number): void {
  area = snap(area);
  if (area.y1 - area.y0 < 3) return;
  const n = ctx.tod === 'night' ? 1 : Math.max(2, Math.round((area.x1 - area.x0) / 55));
  const span = area.x1 - area.x0 + 30;
  for (let i = 0; i < n; i++) {
    const art = CLOUDS[Math.floor(hash2(i, ctx.seed + 3) * CLOUDS.length)]!;
    const speed = 0.25 + hash2(i, ctx.seed + 4) * 0.5;
    const start = hash2(i, ctx.seed + 5) * span;
    const x = area.x0 - 15 + Math.floor((start + t * speed) % span);
    const y = area.y0 + Math.floor(hash2(i, ctx.seed + 6) * Math.max(1, area.y1 - area.y0 - art.h));
    g.blit(art, x, y);
  }
}
