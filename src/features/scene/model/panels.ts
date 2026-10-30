import type { Rect } from '../../../shared/geometry';

/** One monitor's slice of the scene grid, in cells. `groundRow` is absolute (whole grid). */
export interface Panel {
  col0: number;
  row0: number;
  cols: number;
  rows: number;
  groundRow: number;
}

/** Rows of ground below the ground line in full mode. */
export const GROUND_DEPTH = 4;
const MIN_COLS = 20;
const MIN_ROWS = 8;

/**
 * Splits the grid into one panel per monitor rect (CSS px). With no usable rects the whole grid is
 * a single panel whose ground row is `singleGroundRow`.
 */
export function buildPanels(cols: number, rows: number, cellW: number, cellH: number, segments: readonly Rect[], singleGroundRow: number): Panel[] {
  const panels: Panel[] = [];
  for (const s of segments) {
    const col0 = Math.max(0, Math.round(s.x / cellW));
    const colEnd = Math.min(cols, Math.round((s.x + s.w) / cellW));
    const row0 = Math.max(0, Math.round(s.y / cellH));
    const rowEnd = Math.min(rows, Math.floor((s.y + s.h) / cellH));
    if (colEnd - col0 < MIN_COLS || rowEnd - row0 < MIN_ROWS) continue;
    panels.push({ col0, row0, cols: colEnd - col0, rows: rowEnd - row0, groundRow: rowEnd - GROUND_DEPTH });
  }
  if (panels.length <= 1 && segments.length <= 1) return [{ col0: 0, row0: 0, cols, rows, groundRow: singleGroundRow }];
  return panels.length ? panels : [{ col0: 0, row0: 0, cols, rows, groundRow: singleGroundRow }];
}

/** The panel containing `col`, or the nearest one. */
export function panelAtCol(panels: readonly Panel[], col: number): Panel {
  let best = panels[0]!;
  let bestDist = Infinity;
  for (const p of panels) {
    if (col >= p.col0 && col < p.col0 + p.cols) return p;
    const d = col < p.col0 ? p.col0 - col : col - (p.col0 + p.cols - 1);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
