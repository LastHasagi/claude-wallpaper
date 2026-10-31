import type { Point, Rect } from '../../../shared/geometry';
import { BODY_H, BODY_W, POSES, type PoseName } from '../sprites/body';
import { EYES_W, type EyeState } from '../sprites/eyes';
import { MOUTH_DY, type MouthState } from '../sprites/mouth';
import type { HeldItem } from '../sprites/props';

export interface Emote {
  text: string;
  ttl: number;
}

/** A stretch of ground: one per monitor when the scene spans several. */
export interface Floor {
  x0: number;
  x1: number;
  groundY: number;
}

/** Where Clawd lives on screen; set by the controller from the viewport. */
export interface Stage {
  minX: number;
  maxX: number;
  /** Ground used where no floor applies (and the only one on a single screen). */
  groundY: number;
  /** CSS px per sprite pixel. */
  scale: number;
  /** Per-monitor ground lines; walking across a seam lands him on the next monitor's floor. */
  floors?: Floor[];
}

const BLINK_TIME = 0.12;

export class ClawdModel {
  /** Horizontal centre, CSS px. */
  x = 0;
  /** Height of the surface he stands on (bench, rock), CSS px above the ground. */
  elevation = 0;
  /** Extra height while jumping, CSS px above `elevation`. */
  jumpY = 0;
  facing: 1 | -1 = 1;
  pose: PoseName = 'idle';
  poseTime = 0;
  eyes: EyeState = 'open';
  mouth: MouthState | null = null;
  look: Point | null = null;
  held: HeldItem | null = null;
  heldFrame = 0;
  emote: Emote | null = null;
  stage: Stage = { minX: 0, maxX: 800, groundY: 600, scale: 3 };
  private blinkIn = 3;
  private blinkLeft = 0;

  setPose(pose: PoseName): void {
    if (pose !== this.pose) {
      this.pose = pose;
      this.poseTime = 0;
    }
  }

  frameIndex(): number {
    const p = POSES[this.pose];
    return Math.floor(this.poseTime * p.fps) % p.frames.length;
  }

  /** Eye state actually shown this frame (includes spontaneous blinking). */
  shownEyes(): EyeState {
    return this.eyes === 'open' && this.blinkLeft > 0 ? 'blink' : this.eyes;
  }

  setEmote(text: string | null, ttl = 2): void {
    this.emote = text ? { text, ttl } : null;
  }

  faceTowards(x: number): void {
    if (Math.abs(x - this.x) > 0.5) this.facing = x > this.x ? 1 : -1;
  }

  bodyWidth(): number {
    return BODY_W * this.stage.scale;
  }

  bounds(): Rect {
    const w = BODY_W * this.stage.scale, h = BODY_H * this.stage.scale;
    return { x: this.x - w / 2, y: this.feetY() - h, w, h };
  }

  /** Screen y of the soles of his feet, CSS px. */
  feetY(): number {
    return this.groundAt(this.x) - this.elevation - this.jumpY;
  }

  /** Ground line under `x`: the floor containing it, else the nearest one, else the stage ground. */
  groundAt(x: number): number {
    const floors = this.stage.floors;
    if (!floors?.length) return this.stage.groundY;
    let best = floors[0]!;
    let bestDist = Infinity;
    for (const f of floors) {
      if (x >= f.x0 && x < f.x1) return f.groundY;
      const d = x < f.x0 ? f.x0 - x : x - f.x1;
      if (d < bestDist) {
        bestDist = d;
        best = f;
      }
    }
    return best.groundY;
  }

  center(): Point {
    const b = this.bounds();
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }

  /** Where his mouth is (or would be) this frame, CSS px. */
  mouthPoint(): Point {
    const frame = POSES[this.pose].frames[this.frameIndex()]!;
    const b = this.bounds(), s = this.stage.scale;
    const x = frame.eyes.x + EYES_W / 2;
    return { x: b.x + (this.facing === -1 ? BODY_W - x : x) * s, y: b.y + (frame.eyes.y + MOUTH_DY + 1) * s };
  }

  /** Advances animation clocks. `rand` drives the blink interval (3–6 s). */
  tick(dt: number, rand: () => number): void {
    this.poseTime += dt;
    if (this.emote) {
      this.emote.ttl -= dt;
      if (this.emote.ttl <= 0) this.emote = null;
    }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = BLINK_TIME;
      this.blinkIn = 3 + rand() * 3;
    }
  }
}
