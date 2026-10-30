export interface Weighted<T> {
  value: T;
  weight: number;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  weighted<T>(items: readonly Weighted<T>[]): T;
  /** Independent generator derived from this one, stable for the same salt. */
  fork(salt: number): Rng;
}

/** mulberry32: tiny, fast, good enough for visuals and behaviour. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    chance: (p) => next() < p,
    weighted: (items) => {
      const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
      if (total <= 0) throw new Error('weighted() needs a positive total weight');
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, item.weight);
        if (roll < 0 && item.weight > 0) return item.value;
      }
      return items.filter((i) => i.weight > 0).at(-1)!.value;
    },
    fork: (salt) => createRng(Math.floor(hash2(s, salt) * 4294967296)),
  };
  return rng;
}

/** Stateless deterministic noise in [0, 1) for a pair of integers. */
export function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
