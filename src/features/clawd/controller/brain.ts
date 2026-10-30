import { contains, dist, expand, type Point } from '../../../shared/geometry';
import type { Rng } from '../../../shared/rng';
import { isSleepyHour, type Clock } from '../../../shared/time';
import type { CursorEvent } from '../../../host/host';
import { isAbort, jump, play, walkTo, wait, type Action, type ActionQueue } from '../model/actions';
import type { ClawdModel } from '../model/clawd-model';

export type ReactionKind = 'laugh' | 'dizzy' | 'startle' | 'wave';

export const REACTION = {
  dizzyClicks: 3,
  dizzyWindow: 2,
  startleSpeed: 1500,
  startleBodies: 2,
  startleCooldown: 8,
  waveBodies: 3,
  waveStill: 1,
  waveCooldown: 20,
  lookBodies: 6,
} as const;

export type IdleActivity = 'wander' | 'stand' | 'sit' | 'look' | 'yawn' | 'nap';

export interface BrainHooks {
  onClicked(p: Point): void;
  onReaction(kind: ReactionKind): void;
}

/** Long nap that keeps a "zZ" floating above Clawd. */
function nap(duration: number): Action {
  let t = 0, z = 0;
  return {
    name: 'nap',
    start: (m) => {
      m.setPose('sleep');
      m.eyes = 'closed';
    },
    resume: (m) => {
      m.setPose('sleep');
      m.eyes = 'closed';
    },
    update: (m, dt) => {
      t += dt;
      z -= dt;
      if (z <= 0) {
        m.setEmote('zZ', 2);
        z = 2.6;
      }
      return t >= duration;
    },
    end: (m) => {
      m.eyes = 'open';
      m.setEmote(null);
      m.setPose('idle');
    },
  };
}

/**
 * Decides what Clawd does on his own: reacts to the user (highest priority) and, when nobody
 * else is driving him, picks idle activities. Missions turn autonomy off while they run.
 */
export class Brain {
  autonomous = true;
  private now = 0;
  private cursor: Point | null = null;
  private lastMove: { x: number; y: number; t: number } | null = null;
  private stillSince = 0;
  private clicks: number[] = [];
  private startleUntil = -Infinity;
  private waveUntil = -Infinity;
  private idleLook: Point | null = null;
  private restLeft = 1;

  constructor(
    private readonly m: ClawdModel,
    private readonly queue: ActionQueue,
    private readonly rng: Rng,
    private readonly clock: Clock,
    private readonly hooks: BrainHooks,
  ) {}

  onCursor(e: CursorEvent): void {
    if (e.type === 'leave') {
      this.cursor = null;
      this.lastMove = null;
      return;
    }
    const p = { x: e.x, y: e.y };
    if (e.type === 'down') {
      this.cursor = p;
      if (contains(expand(this.m.bounds(), 4), p)) this.clicked(p);
      return;
    }
    if (this.lastMove) {
      const moved = dist(this.lastMove, p);
      const secs = (e.t - this.lastMove.t) / 1000;
      if (moved > 4) this.stillSince = this.now;
      if (secs > 0) this.maybeStartle(moved / secs, p);
    } else {
      this.stillSince = this.now;
    }
    this.lastMove = { x: e.x, y: e.y, t: e.t };
    this.cursor = p;
  }

  private bodies(p: Point): number {
    return dist(p, this.m.center()) / this.m.bodyWidth();
  }

  private clicked(p: Point): void {
    this.hooks.onClicked(p);
    this.clicks = this.clicks.filter((t) => this.now - t <= REACTION.dizzyWindow);
    this.clicks.push(this.now);
    if (this.autonomous) this.queue.cancelMain('reaction');
    if (this.clicks.length >= REACTION.dizzyClicks) {
      this.clicks = [];
      this.react('dizzy', play('dizzy', { duration: 2.2, eyes: 'dizzy', emote: '@#!' }));
    } else if (!this.queue.reacting) {
      this.react('laugh', jump(this.m.bodyWidth() * 0.35), play('laugh', { duration: 1.1, eyes: 'happy' }));
    }
  }

  private maybeStartle(speed: number, p: Point): void {
    if (speed < REACTION.startleSpeed || this.queue.reacting || this.now < this.startleUntil) return;
    if (this.bodies(p) > REACTION.startleBodies || this.m.pose === 'sleep') return;
    this.startleUntil = this.now + REACTION.startleCooldown;
    this.react('startle', play('startle', { duration: 0.7, eyes: 'wide', emote: '!' }));
  }

  private react(kind: ReactionKind, ...actions: Action[]): void {
    for (const a of actions) this.queue.interrupt(a).catch(() => {});
    this.hooks.onReaction(kind);
  }

  update(dt: number): void {
    this.now += dt;
    const c = this.cursor;
    const near = c !== null && this.bodies(c) <= REACTION.lookBodies;
    this.m.look = near ? c : this.idleLook;

    if (
      c && !this.queue.reacting && this.now >= this.waveUntil && this.m.pose !== 'sleep' &&
      this.bodies(c) <= REACTION.waveBodies && this.now - this.stillSince >= REACTION.waveStill
    ) {
      this.waveUntil = this.now + REACTION.waveCooldown;
      this.react('wave', play('wave', { duration: 1.6, eyes: 'happy' }));
    }

    if (!this.autonomous || this.queue.busy || this.queue.reacting) return;
    this.restLeft -= dt;
    if (this.restLeft > 0) return;
    this.restLeft = this.rng.range(0.6, 2.5);
    this.startIdle(this.pickIdle());
  }

  pickIdle(): IdleActivity {
    const sleepy = isSleepyHour(this.clock.hour());
    return this.rng.weighted<IdleActivity>([
      { value: 'wander', weight: 40 },
      { value: 'stand', weight: 15 },
      { value: 'sit', weight: 15 },
      { value: 'look', weight: 12 },
      { value: 'yawn', weight: sleepy ? 15 : 6 },
      { value: 'nap', weight: sleepy ? 45 : 4 },
    ]);
  }

  private startIdle(kind: IdleActivity): void {
    const m = this.m, r = this.rng, bw = m.bodyWidth();
    const steps: Action[] = [];
    switch (kind) {
      case 'wander': {
        const { minX, maxX } = m.stage;
        let target = r.range(minX, maxX);
        if (Math.abs(target - m.x) < bw * 1.5) target = m.x < (minX + maxX) / 2 ? Math.min(maxX, m.x + bw * 3) : Math.max(minX, m.x - bw * 3);
        steps.push(walkTo(target, bw));
        break;
      }
      case 'stand':
        steps.push(play('idle', { duration: r.range(2, 5) }));
        break;
      case 'sit':
        steps.push(play('sit', { duration: r.range(4, 9) }));
        break;
      case 'look': {
        const y = m.center().y;
        steps.push(
          { name: 'lookL', update: () => ((this.idleLook = { x: m.x - bw * 5, y }), true) },
          wait(1.3),
          { name: 'lookR', update: () => ((this.idleLook = { x: m.x + bw * 5, y }), true) },
          wait(1.3),
          { name: 'lookDone', update: () => ((this.idleLook = null), true) },
        );
        break;
      }
      case 'yawn':
        steps.push(play('idle', { duration: 1.4, eyes: 'closed', emote: '…' }));
        break;
      case 'nap':
        steps.push(nap(r.range(8, 20) * (isSleepyHour(this.clock.hour()) ? 2 : 1)));
        break;
    }
    for (const s of steps) {
      this.queue.enqueue(s).catch((e) => {
        this.idleLook = null;
        if (!isAbort(e)) console.error('[clawd] idle action failed', e);
      });
    }
  }
}
