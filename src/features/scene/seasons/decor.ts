import { hash2 } from '../../../shared/rng';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import type { ColorRole } from '../../../shared/render/roles';
import type { BiomeCtx } from '../biomes/layers';

/** A season's layer over any biome. */
export interface SeasonDecor {
  /** Static pieces, painted into the cached backdrop; never near a mission spot (`keepClear`). */
  paint(g: AsciiGrid, ctx: BiomeCtx, keepClear: readonly number[], indoor: boolean): void;
  /** Moving pieces, every frame. Falling things and the sky only outdoors. */
  animate(g: AsciiGrid, ctx: BiomeCtx, t: number, indoor: boolean): void;
}

export const FESTIVE: readonly ColorRole[] = ['red', 'green', 'gold', 'blue'];

/** Columns a mission prop may need, plus room for Clawd to stand next to it. */
const SPOT_MARGIN = 14;

/**
 * Up to `count` left columns for pieces `w` wide resting on the ground, spread over the panel,
 * away from the edges and from mission spots. Same ctx → same columns.
 */
export function groundSlots(ctx: BiomeCtx, keepClear: readonly number[], w: number, count: number, salt: number): number[] {
  const out: number[] = [];
  const free = (x: number) =>
    x >= 2 && x + w <= ctx.cols - 2 && keepClear.every((s) => x + w <= s - SPOT_MARGIN || x >= s + SPOT_MARGIN) && out.every((o) => Math.abs(o - x) > w + 6);
  for (let k = 0; out.length < count && k < count * 8; k++) {
    const x = Math.floor(hash2(ctx.seed + salt, k) * (ctx.cols - w));
    if (free(x)) out.push(x);
  }
  return out;
}

/** Things drifting down (snow, confetti): column, row and a per-particle number in [0, 1). */
export function falling(ctx: BiomeCtx, t: number, density: number, speed: number, draw: (c: number, r: number, v: number) => void): void {
  const bottom = ctx.groundRow;
  const n = Math.floor((ctx.cols * bottom) / density);
  for (let k = 0; k < n; k++) {
    const v = hash2(k, ctx.seed + 31);
    const fall = (hash2(k, ctx.seed + 37) * bottom + t * speed * (0.6 + v * 0.8)) % bottom;
    const c = Math.floor(hash2(k, ctx.seed + 41) * ctx.cols + Math.sin(t * 0.7 + k) * 1.5);
    draw(c, Math.floor(fall), v);
  }
}
