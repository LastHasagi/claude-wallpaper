import type { Rng } from '../../../shared/rng';
import { isAbort, type ClawdApi } from '../../clawd/index';
import { DANCE, DanceModel, type DanceSetting } from '../model/dance-model';

const NOTES = ['♪', '♫', '♪ ♫'];

export interface DanceDeps {
  clawd: ClawdApi;
  rng: Rng;
  setting(): DanceSetting;
}

/**
 * Clawd dances while media plays: in rounds with rests ("sometimes") or for as long as it plays
 * ("always"). He only starts when free; while he dances he is busy, so missions wait.
 */
export class DanceController {
  readonly model = new DanceModel();
  private abort: AbortController | null = null;

  constructor(private readonly d: DanceDeps) {}

  /** From the host: media started or stopped playing. */
  music(on: boolean): void {
    this.model.music = on;
    if (!on) this.abort?.abort();
  }

  update(dt: number): void {
    const m = this.model, setting = this.d.setting();
    m.restLeft = Math.max(0, m.restLeft - dt);
    if (setting === 'off') {
      this.abort?.abort();
      return;
    }
    if (!m.music || m.dancing || m.restLeft > 0 || this.d.clawd.busy()) return;
    const always = setting === 'always';
    void this.bout(always ? Infinity : this.d.rng.range(DANCE.boutMin, DANCE.boutMax), always);
  }

  private async bout(seconds: number, always: boolean): Promise<void> {
    const { clawd } = this.d, m = this.model;
    const abort = (this.abort = new AbortController());
    m.dancing = true;
    clawd.setAutonomy(false);
    clawd.forgetPointer();
    try {
      for (let t = 0, i = 0; t < seconds; t += DANCE.chunk, i++) {
        await clawd.play('dance', { duration: DANCE.chunk, emote: NOTES[i % NOTES.length], signal: abort.signal });
      }
    } catch (err) {
      if (!isAbort(err)) console.error('[dance] failed', err);
    } finally {
      m.dancing = false;
      this.abort = null;
      if (!always) m.restLeft = this.d.rng.range(DANCE.restMin, DANCE.restMax);
      clawd.setAutonomy(true);
    }
  }
}
