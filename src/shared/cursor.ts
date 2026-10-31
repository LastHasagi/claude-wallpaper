import type { Point } from './geometry';
import type { Sprite } from './render/sprite';

/** System pointers Clawd can replace: normal, link, text, busy, busy-in-background, not allowed. */
export type CursorKind = 'arrow' | 'hand' | 'text' | 'busy' | 'working' | 'no';

/** Cursor art is drawn on a 16×16 grid and enlarged by whole numbers (32, 48, 64… px). */
export const CURSOR_GRID = 16;

/** One animated pointer. */
export interface CursorArt {
  kind: CursorKind;
  /** Unique frames, all CURSOR_GRID×CURSOR_GRID. */
  frames: readonly Sprite[];
  /** Order the frames play in (indices into `frames`); defaults to each frame once. */
  sequence?: readonly number[];
  /** Steps per second. */
  fps: number;
  /** The pixel that clicks, in grid pixels. */
  hotspot: Point;
}
