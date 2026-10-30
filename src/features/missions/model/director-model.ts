import type { Lang } from '../../../shared/i18n';
import type { Rng } from '../../../shared/rng';
import { timeOfDay } from '../../../shared/time';
import type { Frequency, MissionDef, MissionId } from './mission-types';

export type DirectorPhase = 'idle' | 'exiting' | 'transitioning' | 'entering' | 'running' | 'noting';

/** Seconds of free time between missions. */
export const IDLE_RANGE: Record<Frequency, [number, number]> = {
  often: [20, 40],
  normal: [60, 180],
  rare: [300, 600],
};

export const AVOID_RECENT = 2;

export function nextIdleDelay(freq: Frequency, rng: Rng): number {
  const [min, max] = IDLE_RANGE[freq];
  return rng.range(min, max);
}

export function missionWeight(def: MissionDef, hour: number): number {
  const tod = timeOfDay(hour);
  if (def.prefers === 'day' && tod === 'night') return 0.25;
  if (def.prefers === 'night' && tod === 'day') return 0.25;
  return 1;
}

/** Weighted pick that skips the last missions played and any blacklisted one. */
export function pickMission(
  defs: readonly MissionDef[],
  recent: readonly MissionId[],
  blacklist: ReadonlySet<MissionId>,
  hour: number,
  rng: Rng,
): MissionDef | null {
  const usable = defs.filter((d) => !blacklist.has(d.id));
  if (!usable.length) return null;
  const avoid = new Set(recent.slice(-AVOID_RECENT));
  let pool = usable.filter((d) => !avoid.has(d.id));
  if (!pool.length) pool = usable;
  return rng.weighted(pool.map((d) => ({ value: d, weight: missionWeight(d, hour) })));
}

export function missionLabel(def: MissionDef, lang: Lang): string {
  const word = lang === 'pt' ? 'missão' : 'mission';
  return `[ ${word} ${String(def.number).padStart(2, '0')}: ${def.title[lang]} ]`;
}

export class DirectorModel {
  phase: DirectorPhase = 'idle';
  current: MissionId | null = null;
  idleLeft = 0;
  recent: MissionId[] = [];
  blacklist = new Set<MissionId>();
  completed = 0;

  begin(id: MissionId): void {
    this.current = id;
    this.phase = 'exiting';
    this.recent.push(id);
    if (this.recent.length > 10) this.recent.shift();
  }

  finish(nextIdle: number): void {
    this.current = null;
    this.phase = 'idle';
    this.idleLeft = nextIdle;
    this.completed++;
  }
}
