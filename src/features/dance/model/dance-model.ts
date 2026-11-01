export type DanceSetting = 'off' | 'sometimes' | 'always';

/** Seconds: a round of dancing, the rest between rounds ("sometimes"), one pose chunk. */
export const DANCE = { boutMin: 15, boutMax: 30, restMin: 40, restMax: 90, chunk: 2 } as const;

export class DanceModel {
  /** Media is playing (from the host). */
  music = false;
  dancing = false;
  /** "sometimes": seconds until he may dance again. */
  restLeft = 0;
}
