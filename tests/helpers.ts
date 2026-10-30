import type { HostStorage } from '../src/host/host';

export class MemoryStorage implements HostStorage {
  private data = new Map<string, string>();
  get(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** Advances `update(dt)` callbacks in fixed steps for `seconds` of simulated time. */
export function simulate(seconds: number, update: (dt: number) => void, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) update(dt);
}
