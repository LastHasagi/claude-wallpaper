import type { Point } from './geometry';

/** Something sucked into (or spat out of) Clawd's mouth, flying between two moving points. */
export interface Flight {
  from: Point;
  /** Re-read every frame: his mouth and the real pointer move. */
  to: () => Point;
  /** Seconds since launch; negative while waiting to be launched. */
  t: number;
  duration: number;
  /** Height of the arc, CSS px (0 = straight line). */
  arc: number;
  /** 'in': slow start, fast end (sucked in). 'out': fast start, slow landing (spat out). */
  ease: 'in' | 'out';
  /** Size at the start and at the end (1 = natural size). */
  scale: readonly [number, number];
}

export interface FlightFrame {
  x: number;
  y: number;
  scale: number;
}

/** Where the flight is now; null before launch. */
export function flightFrame(f: Flight): FlightFrame | null {
  if (f.t < 0) return null;
  const k = Math.min(1, f.t / f.duration);
  const e = f.ease === 'in' ? k * k : 1 - (1 - k) * (1 - k);
  const to = f.to();
  return {
    x: f.from.x + (to.x - f.from.x) * e,
    y: f.from.y + (to.y - f.from.y) * e - 4 * f.arc * k * (1 - k),
    scale: f.scale[0] + (f.scale[1] - f.scale[0]) * e,
  };
}
