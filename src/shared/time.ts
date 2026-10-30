export type TimeOfDay = 'day' | 'dusk' | 'night';

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

/** 23:00–05:59: Clawd gets drowsy. */
export function isSleepyHour(hour: number): boolean {
  return hour >= 23 || hour < 6;
}

/** Source of the local hour; overridable for debugging (?hour=H) and tests. */
export interface Clock {
  hour(): number;
}

export const systemClock: Clock = { hour: () => new Date().getHours() };

export function fixedClock(hour: number): Clock {
  return { hour: () => hour };
}
