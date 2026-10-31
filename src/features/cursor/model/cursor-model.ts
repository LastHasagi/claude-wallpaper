import { dist, type Point } from '../../../shared/geometry';

export type CursorSetting = 'off' | 'sometimes' | 'often';

/** normal → stealing (pointer in his mouth) → clawd (his pointers on) → returning → normal. */
export type CursorPhase = 'normal' | 'stealing' | 'clawd' | 'returning';

export const RULES = {
  /** The pointer must rest within this many body widths of Clawd… */
  nearBodies: 3,
  /** …for this long (seconds) before he considers stealing it. */
  stillFor: 1.5,
  /** Movement below this (CSS px) still counts as resting. */
  jitter: 4,
  /** No heist in the first seconds after opening. */
  firstAfter: 90,
  /** Minimum time between heists (seconds) and the chance per resting pause. */
  cooldown: { sometimes: 15 * 60, often: 120 },
  chance: { sometimes: 0.35, often: 0.8 },
  /** He gives his pointer back on his own after this long (seconds). */
  keepFor: 10 * 60,
} as const;

/** A pointer drawn on screen while it flies between the real pointer and Clawd's mouth. */
export interface Flyer {
  art: 'system' | 'clawd';
  from: Point;
  /** Re-read every frame: the mouth and the real pointer move. */
  to: () => Point;
  t: number;
  duration: number;
  /** Height of the arc, CSS px (0 = straight line). */
  arc: number;
  /** 'in': slow start, fast end (sucked in). 'out': fast start, slow landing (spat out). */
  ease: 'in' | 'out';
  /** Size at the start and at the end (1 = real pointer size). */
  scale: readonly [number, number];
  done: () => void;
}

export interface FlyerFrame {
  art: Flyer['art'];
  x: number;
  y: number;
  scale: number;
}

export class CursorModel {
  phase: CursorPhase = 'normal';
  flyer: Flyer | null = null;
  /** Last known pointer position (CSS px), null when it is outside the engine's viewport. */
  pointer: Point | null = null;
  /** Seconds the pointer has been resting where it is. */
  restingFor = 0;
  /** The current resting pause already had its chance. */
  rolled = false;
  /** Seconds since the engine started. */
  elapsed = 0;
  lastHeistAt = -Infinity;
  /** Seconds his pointers have been on. */
  clawdFor = 0;
  private anchor: Point | null = null;

  /** Tracks the pointer; a real move restarts the resting pause. */
  movePointer(p: Point | null): void {
    this.pointer = p;
    if (!p || !this.anchor || dist(p, this.anchor) > RULES.jitter) {
      this.anchor = p;
      this.restingFor = 0;
      this.rolled = false;
    }
  }

  tick(dt: number): void {
    this.elapsed += dt;
    if (this.pointer) this.restingFor += dt;
    if (this.phase === 'clawd') this.clawdFor += dt;
    const f = this.flyer;
    if (f) {
      f.t += dt;
      if (f.t >= f.duration) {
        this.flyer = null;
        f.done();
      }
    }
  }

  /** Where the flying pointer is this frame. */
  flyerFrame(): FlyerFrame | null {
    const f = this.flyer;
    if (!f) return null;
    const k = Math.min(1, f.t / f.duration);
    const e = f.ease === 'in' ? k * k : 1 - (1 - k) * (1 - k);
    const to = f.to();
    return {
      art: f.art,
      x: f.from.x + (to.x - f.from.x) * e,
      y: f.from.y + (to.y - f.from.y) * e - 4 * f.arc * k * (1 - k),
      scale: f.scale[0] + (f.scale[1] - f.scale[0]) * e,
    };
  }
}

export interface HeistCheck {
  setting: CursorSetting;
  elapsed: number;
  lastHeistAt: number;
  restingFor: number;
  rolled: boolean;
  /** Distance from the pointer to Clawd, in body widths (Infinity when unknown). */
  bodies: number;
}

/** Whether Clawd may try to steal the resting pointer now (before rolling the dice). */
export function heistAllowed(c: HeistCheck): boolean {
  if (c.setting === 'off' || c.rolled) return false;
  if (c.elapsed < RULES.firstAfter || c.elapsed - c.lastHeistAt < RULES.cooldown[c.setting]) return false;
  return c.bodies <= RULES.nearBodies && c.restingFor >= RULES.stillFor;
}
