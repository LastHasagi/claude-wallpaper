import type { PropArt } from '../../../shared/render/prop-art';
import type { BiomeId } from '../biomes';

export interface BiomeKey {
  biome: BiomeId;
  seed: number;
}

export interface Transition {
  from: BiomeKey;
  to: BiomeKey;
  t: number;
  duration: number;
  resolve: () => void;
}

export type PropPhase = 'in' | 'shown' | 'out';

export interface PropState {
  id: string;
  art: PropArt;
  col: number;
  row: number;
  frame: number;
  phase: PropPhase;
  t: number;
  resolve: (() => void) | null;
}

export type EffectKind = 'birds' | 'steam';

export interface EffectState {
  id: string;
  kind: EffectKind;
  t: number;
  col: number;
  row: number;
  dir: 1 | -1;
  /** Finite effects (birds) resolve when done; continuous ones (steam) run until stopped. */
  resolve: (() => void) | null;
}

export const TRANSITION_TIME = 1.2;
export const PROP_FADE_TIME = 0.45;
export const BIRD_SPEED = 18;

export class SceneModel {
  current: BiomeKey = { biome: 'mountains', seed: 1 };
  transition: Transition | null = null;
  props = new Map<string, PropState>();
  effects = new Map<string, EffectState>();
  label: string | null = null;
  time = 0;
  cols = 1;

  startTransition(to: BiomeKey, resolve: () => void): void {
    this.transition?.resolve();
    this.transition = { from: this.current, to, t: 0, duration: TRANSITION_TIME, resolve };
    this.current = to;
  }

  tick(dt: number): void {
    this.time += dt;
    const tr = this.transition;
    if (tr) {
      tr.t += dt;
      if (tr.t >= tr.duration) {
        this.transition = null;
        tr.resolve();
      }
    }
    for (const p of [...this.props.values()]) {
      if (p.phase === 'shown') continue;
      p.t += dt;
      if (p.t < PROP_FADE_TIME) continue;
      if (p.phase === 'in') p.phase = 'shown';
      else this.props.delete(p.id);
      p.resolve?.();
      p.resolve = null;
    }
    for (const e of [...this.effects.values()]) {
      e.t += dt;
      if (e.kind === 'birds' && this.birdsGone(e)) {
        this.effects.delete(e.id);
        e.resolve?.();
      }
    }
  }

  birdLead(e: EffectState): number {
    const start = e.dir === 1 ? -2 : this.cols + 2;
    return start + e.dir * BIRD_SPEED * e.t;
  }

  private birdsGone(e: EffectState): boolean {
    const lead = this.birdLead(e);
    return e.dir === 1 ? lead - 8 > this.cols : lead + 8 < 0;
  }
}
