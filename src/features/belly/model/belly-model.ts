import { flightFrame, type Flight, type FlightFrame } from '../../../shared/flight';

/** idle → eating (icons flying in, chewing) / spitting (icons flying out) → idle. */
export type BellyPhase = 'idle' | 'eating' | 'spitting';

export type SnackKind = 'file' | 'folder';

export const BELLY = {
  /** He gives everything back on his own after digesting this long (seconds). */
  digestFor: 5 * 60,
  /** At most this many icons fly per scene (a big drop still shows a handful). */
  maxSnacks: 6,
} as const;

export interface Snack extends Flight {
  kind: SnackKind;
}

export interface SnackFrame extends FlightFrame {
  kind: SnackKind;
}

/** Last part of a path (Windows or POSIX separators). */
export const baseName = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

/** Folder icon for names without an extension, file icon otherwise (only for the animation). */
export const snackKind = (path: string): SnackKind => (/\.[^.\s]{1,8}$/.test(baseName(path)) ? 'file' : 'folder');

export class BellyModel {
  phase: BellyPhase = 'idle';
  /** Items in his belly (the native side keeps the real list). */
  count = 0;
  /** What they looked like, to fly the same icons back out. */
  kinds: SnackKind[] = [];
  /** Files are being dragged over him: mouth open, eyes wide. */
  hungry = false;
  /** Seconds since the last meal. */
  fullFor = 0;
  snacks: Snack[] = [];
  private landed: (() => void) | null = null;

  /** Launches icons; resolves once every one of them has arrived. */
  launch(snacks: Snack[]): Promise<void> {
    if (!snacks.length) return Promise.resolve();
    this.snacks.push(...snacks);
    return new Promise((resolve) => (this.landed = resolve));
  }

  tick(dt: number): void {
    if (this.count > 0 && this.phase === 'idle') this.fullFor += dt;
    if (!this.snacks.length) return;
    for (const s of this.snacks) s.t += dt;
    this.snacks = this.snacks.filter((s) => s.t < s.duration);
    if (!this.snacks.length) {
      const done = this.landed;
      this.landed = null;
      done?.();
    }
  }

  snackFrames(): SnackFrame[] {
    return this.snacks.flatMap((s) => {
      const f = flightFrame(s);
      return f ? [{ ...f, kind: s.kind }] : [];
    });
  }
}
