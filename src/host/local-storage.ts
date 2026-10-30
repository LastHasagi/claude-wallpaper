import type { HostStorage } from './host';

/** localStorage with an in-memory fallback when storage is blocked. */
export class LocalStorage implements HostStorage {
  private memory = new Map<string, string>();

  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  set(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode / blocked storage: keep the in-memory copy */
    }
  }
}
