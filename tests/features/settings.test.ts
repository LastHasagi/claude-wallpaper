import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { DEFAULTS, overridesFromParams, SettingsController, STORAGE_KEY, type SettingsEvents } from '../../src/features/settings';
import { MemoryStorage } from '../helpers';

const env = { systemLanguage: 'pt-BR', prefersDark: true };

function make(stored?: string, overrides = {}) {
  const storage = new MemoryStorage();
  if (stored !== undefined) storage.set(STORAGE_KEY, stored);
  const bus = new EventBus<SettingsEvents>();
  const events: SettingsEvents['settings:changed'][] = [];
  bus.on('settings:changed', (e) => events.push(e));
  return { storage, bus, events, ctl: new SettingsController(storage, bus, env, overrides) };
}

describe('SettingsController', () => {
  it('uses defaults with empty storage', () => {
    expect(make().ctl.get()).toEqual(DEFAULTS);
  });

  it('uses defaults with corrupt storage', () => {
    expect(make('{not json').ctl.get()).toEqual(DEFAULTS);
  });

  it('falls back field by field', () => {
    const { ctl } = make(JSON.stringify({ theme: 'light', size: 'XXL', fps: 60 }));
    expect(ctl.get()).toEqual({ ...DEFAULTS, theme: 'light', fps: 60 });
  });

  it('applies overrides without persisting them', () => {
    const { ctl, storage } = make(undefined, { theme: 'light' });
    expect(ctl.get().theme).toBe('light');
    expect(storage.get(STORAGE_KEY)).toBeNull();
  });

  it('persists set() and emits the changed keys', () => {
    const { ctl, storage, events } = make();
    ctl.set({ size: 'L', notes: 'always' });
    expect(JSON.parse(storage.get(STORAGE_KEY)!)).toMatchObject({ size: 'L', notes: 'always' });
    expect(events).toHaveLength(1);
    expect(events[0]!.changed.sort()).toEqual(['notes', 'size']);
  });

  it('does not emit when nothing changed', () => {
    const { ctl, events } = make();
    ctl.set({ size: 'M' });
    expect(events).toHaveLength(0);
  });

  it('resolves system theme and language', () => {
    const { ctl } = make();
    expect(ctl.resolved()).toMatchObject({ theme: 'dark', lang: 'pt' });
  });

  it('reads URL overrides', () => {
    const o = overridesFromParams(new URLSearchParams('theme=light&lang=en&fps=60&freq=often'));
    expect(o).toEqual({ theme: 'light', language: 'en', fps: 60, missionFrequency: 'often' });
  });
});
