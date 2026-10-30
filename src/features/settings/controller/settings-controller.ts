import type { EventBus } from '../../../shared/events';
import type { HostStorage } from '../../../host/host';
import {
  changedKeys,
  resolve,
  validate,
  type ResolvedSettings,
  type Settings,
  type SettingsEnv,
} from '../model/settings-model';

export const STORAGE_KEY = 'clawd.settings';

export interface SettingsEvents {
  'settings:changed': { settings: Settings; resolved: ResolvedSettings; changed: (keyof Settings)[] };
}

/**
 * Owns user preferences: loads them from host storage, applies session-only overrides
 * (URL params in the browser), persists changes and announces them on the bus.
 */
export class SettingsController {
  private stored: Settings;
  private current: Settings;

  constructor(
    private readonly storage: HostStorage,
    private readonly bus: EventBus<SettingsEvents>,
    private readonly env: SettingsEnv,
    private readonly overrides: Partial<Record<keyof Settings, unknown>> = {},
  ) {
    this.stored = validate(this.read());
    this.current = this.withOverrides(this.stored);
  }

  get(): Settings {
    return { ...this.current };
  }

  resolved(): ResolvedSettings {
    return resolve(this.current, this.env);
  }

  set(patch: Partial<Settings>): void {
    const before = this.current;
    this.stored = validate({ ...this.stored, ...patch });
    // An explicit change wins over a session override for the same field.
    for (const key of Object.keys(patch) as (keyof Settings)[]) delete this.overrides[key];
    this.current = this.withOverrides(this.stored);
    this.storage.set(STORAGE_KEY, JSON.stringify(this.stored));
    const changed = changedKeys(before, this.current);
    if (changed.length) this.bus.emit('settings:changed', { settings: this.get(), resolved: this.resolved(), changed });
  }

  private withOverrides(base: Settings): Settings {
    return validate({ ...base, ...this.overrides });
  }

  private read(): unknown {
    const raw = this.storage.get(STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
