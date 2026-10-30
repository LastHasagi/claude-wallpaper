import type { Bus } from '../../../shared/events';
import type { Point, Rect } from '../../../shared/geometry';
import type { Rng } from '../../../shared/rng';
import type { Clock } from '../../../shared/time';
import type { CursorEvent } from '../../../host/host';
import { ActionQueue, play, wait, walkTo, type PlayOptions } from '../model/actions';
import { ClawdModel, type Stage } from '../model/clawd-model';
import type { PoseName } from '../sprites/body';
import type { EyeState } from '../sprites/eyes';
import type { HeldItem } from '../sprites/props';
import { Brain, type ReactionKind } from './brain';

export interface ClawdEvents {
  'clawd:clicked': Point;
  'clawd:reaction': ReactionKind;
}

export interface MoveOptions {
  /** Multiplier over the normal walking speed. */
  speed?: number;
  signal?: AbortSignal;
}

/** What other features (missions, notes) may ask Clawd to do. */
export interface ClawdApi {
  walkTo(x: number, opts?: MoveOptions): Promise<void>;
  runTo(x: number, opts?: MoveOptions): Promise<void>;
  play(pose: PoseName, opts?: PlayOptions & { signal?: AbortSignal }): Promise<void>;
  wait(seconds: number, signal?: AbortSignal): Promise<void>;
  hold(item: HeldItem | null): void;
  setHeldFrame(frame: number): void;
  setEyes(eyes: EyeState): void;
  lookAt(p: Point | null): void;
  emote(text: string | null, seconds?: number): void;
  face(dir: 1 | -1): void;
  placeAt(x: number): void;
  x(): number;
  bounds(): Rect;
  bodyWidth(): number;
  /** Missions switch autonomy off while they drive Clawd. */
  setAutonomy(on: boolean): void;
  /** Stops whatever the main queue is doing (pending promises reject with AbortError). */
  cancel(): void;
}

export class ClawdController implements ClawdApi {
  readonly model = new ClawdModel();
  readonly queue = new ActionQueue();
  readonly brain: Brain;

  constructor(bus: Bus<ClawdEvents>, private readonly rng: Rng, clock: Clock) {
    this.brain = new Brain(this.model, this.queue, rng, clock, {
      onClicked: (p) => bus.emit('clawd:clicked', p),
      onReaction: (k) => bus.emit('clawd:reaction', k),
    });
  }

  setStage(stage: Stage, recenter = false): void {
    const first = this.model.stage.maxX === 800 && this.model.x === 0;
    this.model.stage = stage;
    if (first || recenter) this.model.x = (stage.minX + stage.maxX) / 2;
  }

  update(dt: number): void {
    this.queue.update(this.model, dt);
    this.brain.update(dt);
    this.model.tick(dt, () => this.rng.next());
  }

  onCursor(e: CursorEvent): void {
    this.brain.onCursor(e);
  }

  // --- ClawdApi -------------------------------------------------------------------------------

  walkTo(x: number, opts: MoveOptions = {}): Promise<void> {
    return this.queue.enqueue(walkTo(x, this.model.bodyWidth() * (opts.speed ?? 1)), opts.signal);
  }

  runTo(x: number, opts: MoveOptions = {}): Promise<void> {
    return this.queue.enqueue(walkTo(x, this.model.bodyWidth() * 2.6 * (opts.speed ?? 1), 'run'), opts.signal);
  }

  play(pose: PoseName, opts: PlayOptions & { signal?: AbortSignal } = {}): Promise<void> {
    return this.queue.enqueue(play(pose, opts), opts.signal);
  }

  wait(seconds: number, signal?: AbortSignal): Promise<void> {
    return this.queue.enqueue(wait(seconds), signal);
  }

  hold(item: HeldItem | null): void {
    this.model.held = item;
    this.model.heldFrame = 0;
  }

  setHeldFrame(frame: number): void {
    this.model.heldFrame = frame;
  }

  setEyes(eyes: EyeState): void {
    this.model.eyes = eyes;
  }

  lookAt(p: Point | null): void {
    this.model.look = p;
  }

  emote(text: string | null, seconds = 2): void {
    this.model.setEmote(text, seconds);
  }

  face(dir: 1 | -1): void {
    this.model.facing = dir;
  }

  placeAt(x: number): void {
    this.model.x = x;
  }

  x(): number {
    return this.model.x;
  }

  bounds(): Rect {
    return this.model.bounds();
  }

  bodyWidth(): number {
    return this.model.bodyWidth();
  }

  setAutonomy(on: boolean): void {
    if (this.brain.autonomous === on) return;
    this.brain.autonomous = on;
    if (!on) this.queue.cancelMain('autonomy off');
  }

  cancel(): void {
    this.queue.cancelMain();
    this.model.jumpY = 0;
    this.model.eyes = 'open';
    this.model.setPose('idle');
  }
}
