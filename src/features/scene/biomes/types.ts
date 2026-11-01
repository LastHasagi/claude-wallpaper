import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import type { BiomeCtx } from './layers';

export type BiomeId = 'mountains' | 'park' | 'room';

export interface BiomeDef {
  id: BiomeId;
  /** Indoors: seasonal decorations skip the sky and the falling snow/confetti. */
  indoor?: boolean;
  /** Named columns where missions place their props (a bench, a desk…). Kept clear by `paint`. */
  spots(ctx: BiomeCtx): Record<string, number>;
  /** Static backdrop. Pure: same ctx → same grid. */
  paint(g: AsciiGrid, ctx: BiomeCtx): void;
  /** Animated details drawn every frame over a copy of the static backdrop. */
  animate(g: AsciiGrid, ctx: BiomeCtx, t: number): void;
}
