import { contains, expand, type Point, type Rect } from '../shared/geometry';

/** Converts a global (physical px) cursor position into the window's CSS px. */
export function toLocal(screen: Point, windowOrigin: Point, scale: number): Point {
  return { x: (screen.x - windowOrigin.x) / scale, y: (screen.y - windowOrigin.y) / scale };
}

export function insideViewport(p: Point, w: number, h: number): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
}

/**
 * Overlay mode: the window only takes the mouse while the cursor is over something
 * interactive (Clawd, a note); everywhere else clicks fall through to the desktop.
 */
export function shouldCapture(p: Point | null, rects: readonly Rect[], pad = 6): boolean {
  return p !== null && rects.some((r) => contains(expand(r, pad), p));
}
