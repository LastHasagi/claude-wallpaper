import { POSES, type PoseName } from '../sprites/body';
import type { EyeState } from '../sprites/eyes';
import type { ClawdModel } from './clawd-model';

/** A unit of behaviour. `update` returns true once finished. */
export interface Action {
  readonly name: string;
  start?(m: ClawdModel): void;
  update(m: ClawdModel, dt: number): boolean;
  /** Called when the action resumes after an interruption. */
  resume?(m: ClawdModel): void;
  end?(m: ClawdModel): void;
}

export class AbortError extends Error {
  constructor(reason = 'aborted') {
    super(reason);
    this.name = 'AbortError';
  }
}

export const isAbort = (e: unknown): boolean => e instanceof Error && e.name === 'AbortError';

interface Entry {
  action: Action;
  resolve: () => void;
  reject: (e: Error) => void;
  started: boolean;
  cleanup?: () => void;
}

/**
 * Main queue (missions / idle life) plus an interrupt stack (reactions). While an interrupt
 * runs, the main action is frozen; afterwards it resumes where it was.
 */
export class ActionQueue {
  private main: Entry[] = [];
  private interrupts: Entry[] = [];
  private pausedHead = false;

  enqueue(action: Action, signal?: AbortSignal): Promise<void> {
    return this.push(this.main, action, signal);
  }

  interrupt(action: Action): Promise<void> {
    if (this.main[0]?.started) this.pausedHead = true;
    return this.push(this.interrupts, action);
  }

  private push(list: Entry[], action: Action, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new AbortError());
    return new Promise<void>((resolve, reject) => {
      const entry: Entry = { action, resolve, reject, started: false };
      if (signal) {
        const onAbort = () => this.remove(list, entry, new AbortError());
        signal.addEventListener('abort', onAbort, { once: true });
        entry.cleanup = () => signal.removeEventListener('abort', onAbort);
      }
      list.push(entry);
    });
  }

  private remove(list: Entry[], entry: Entry, err: Error): void {
    const i = list.indexOf(entry);
    if (i < 0) return;
    list.splice(i, 1);
    entry.cleanup?.();
    entry.reject(err);
  }

  /** Rejects every pending main action with AbortError (reactions keep running). */
  cancelMain(reason = 'cancelled'): void {
    const pending = this.main.splice(0);
    this.pausedHead = false;
    for (const e of pending) {
      e.cleanup?.();
      e.reject(new AbortError(reason));
    }
  }

  get busy(): boolean {
    return this.main.length > 0;
  }

  get reacting(): boolean {
    return this.interrupts.length > 0;
  }

  current(): Action | null {
    return (this.interrupts[0] ?? this.main[0])?.action ?? null;
  }

  update(m: ClawdModel, dt: number): void {
    const list = this.interrupts.length ? this.interrupts : this.main;
    const head = list[0];
    if (!head) return;
    if (list === this.main && this.pausedHead) {
      this.pausedHead = false;
      head.action.resume?.(m);
    }
    if (!head.started) {
      head.started = true;
      head.action.start?.(m);
    }
    let done = false;
    try {
      done = head.action.update(m, dt);
    } catch (err) {
      list.shift();
      head.cleanup?.();
      head.reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (done) {
      list.shift();
      head.action.end?.(m);
      head.cleanup?.();
      head.resolve();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Action factories

export function walkTo(x: number, speed: number, pose: PoseName = 'walk'): Action {
  return {
    name: `walkTo(${Math.round(x)})`,
    start: (m) => {
      m.faceTowards(x);
      m.setPose(pose);
    },
    resume: (m) => {
      m.faceTowards(x);
      m.setPose(pose);
    },
    update: (m, dt) => {
      const d = x - m.x;
      const step = speed * dt;
      if (Math.abs(d) <= step) {
        m.x = x;
        return true;
      }
      m.x += Math.sign(d) * step;
      return false;
    },
    end: (m) => m.setPose('idle'),
  };
}

export interface PlayOptions {
  duration?: number;
  loops?: number;
  eyes?: EyeState;
  emote?: string;
}

/** Holds a pose for `duration` seconds (or `loops` full animation cycles). */
export function play(pose: PoseName, opts: PlayOptions = {}): Action {
  const p = POSES[pose];
  const duration = opts.duration ?? (opts.loops ?? 1) * (p.frames.length / p.fps);
  let elapsed = 0;
  let prevEyes: EyeState = 'open';
  return {
    name: `play(${pose})`,
    start: (m) => {
      m.setPose(pose);
      prevEyes = m.eyes;
      if (opts.eyes) m.eyes = opts.eyes;
      if (opts.emote) m.setEmote(opts.emote, Math.min(duration, 2.5));
    },
    resume: (m) => {
      m.setPose(pose);
      if (opts.eyes) m.eyes = opts.eyes;
    },
    update: (_m, dt) => (elapsed += dt) >= duration,
    end: (m) => {
      if (opts.eyes) m.eyes = prevEyes;
    },
  };
}

/** A hop of `height` px lasting `duration` seconds. */
export function jump(height: number, duration = 0.45): Action {
  let t = 0;
  return {
    name: 'jump',
    start: (m) => m.setPose('jump'),
    update: (m, dt) => {
      t += dt;
      const k = Math.min(t / duration, 1);
      m.jumpY = 4 * height * k * (1 - k);
      return k >= 1;
    },
    end: (m) => {
      m.jumpY = 0;
      m.setPose('idle');
    },
  };
}

/** Runs `fn` once, immediately. */
export function instant(name: string, fn: (m: ClawdModel) => void): Action {
  return { name, update: (m) => (fn(m), true) };
}

/** Keeps whatever pose is active for `duration` seconds. */
export function wait(duration: number): Action {
  let t = 0;
  return { name: `wait(${duration})`, update: (_m, dt) => (t += dt) >= duration };
}
