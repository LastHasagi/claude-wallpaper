export interface LoopCallbacks {
  /** Fixed-step simulation, `dt` in (scaled) seconds. */
  update(dt: number): void;
  render(): void;
}

export const STEP = 1 / 60;
/** Never simulate more than this much real time per frame (avoids the spiral of death). */
export const MAX_FRAME = 0.25;

/**
 * Fixed-timestep loop: simulation always advances in STEP increments, rendering is capped at
 * `fps`. `advance()` is pure bookkeeping so it can be unit-tested; `start()` wires it to rAF.
 */
export class GameLoop {
  timeScale = 1;
  fps = 30;
  private acc = 0;
  private sinceRender = Infinity;
  private last: number | null = null;
  private rafId = 0;
  private running = false;

  constructor(private readonly cb: LoopCallbacks) {}

  /** Feeds `elapsed` real seconds; returns true when a frame was rendered. */
  advance(elapsed: number): boolean {
    const real = Math.min(Math.max(elapsed, 0), MAX_FRAME);
    const scale = Math.max(0, this.timeScale);
    this.acc = Math.min(this.acc + real * scale, MAX_FRAME * Math.max(1, scale));
    while (this.acc >= STEP) {
      this.cb.update(STEP);
      this.acc -= STEP;
    }
    this.sinceRender += real;
    // Half a 60 Hz frame of tolerance so 30 fps lands on every other vsync.
    if (this.sinceRender >= 1 / this.fps - 0.008) {
      this.sinceRender = 0;
      this.cb.render();
      return true;
    }
    return false;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = null;
    const frame = (now: number) => {
      if (!this.running) return;
      const elapsed = this.last === null ? 0 : (now - this.last) / 1000;
      this.last = now;
      this.advance(elapsed);
      this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  /** Stops the loop; the next start() resumes without a time jump. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get isRunning(): boolean {
    return this.running;
  }
}
