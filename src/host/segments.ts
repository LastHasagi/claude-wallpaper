import type { Rect } from '../shared/geometry';

/**
 * Parses "x,y,w,h;x,y,w,h" (the `segments` URL parameter) into rects, dividing by `scale`
 * (the desktop app passes physical pixels; the browser preview passes CSS pixels with scale 1).
 * Invalid input yields an empty list (= single screen).
 */
export function parseSegments(raw: string | null, scale = 1): Rect[] {
  if (!raw) return [];
  const rects: Rect[] = [];
  for (const part of raw.split(';')) {
    const n = part.split(',').map(Number);
    if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return [];
    const [x, y, w, h] = n as [number, number, number, number];
    if (w <= 0 || h <= 0) return [];
    rects.push({ x: x / scale, y: y / scale, w: w / scale, h: h / scale });
  }
  return rects.sort((a, b) => a.x - b.x);
}
