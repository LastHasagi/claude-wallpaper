import { describe, expect, it, vi } from 'vitest';
import { createRng, hash2 } from '../../src/shared/rng';
import { EventBus } from '../../src/shared/events';
import { timeOfDay, isSleepyHour } from '../../src/shared/time';
import { resolveLang, t } from '../../src/shared/i18n';
import { contains, clamp, dist, expand } from '../../src/shared/geometry';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42), b = createRng(42);
    const sa = Array.from({ length: 20 }, () => a.next());
    const sb = Array.from({ length: 20 }, () => b.next());
    expect(sa).toEqual(sb);
    expect(new Set(sa).size).toBeGreaterThan(15);
  });

  it('keeps range and int within bounds', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
      const n = r.int(1, 3);
      expect([1, 2, 3]).toContain(n);
    }
  });

  it('never picks zero-weight items', () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      expect(r.weighted([{ value: 'a', weight: 0 }, { value: 'b', weight: 1 }])).toBe('b');
    }
  });

  it('hash2 is deterministic and in [0,1)', () => {
    expect(hash2(3, 4)).toBe(hash2(3, 4));
    for (let i = 0; i < 100; i++) {
      const v = hash2(i, i * 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('EventBus', () => {
  type M = { ping: number; pong: string };

  it('delivers in subscription order and supports off', () => {
    const bus = new EventBus<M>();
    const calls: string[] = [];
    const off = bus.on('ping', (n) => calls.push(`a${n}`));
    bus.on('ping', (n) => calls.push(`b${n}`));
    bus.emit('ping', 1);
    off();
    bus.emit('ping', 2);
    expect(calls).toEqual(['a1', 'b1', 'b2']);
  });

  it('once fires a single time', () => {
    const bus = new EventBus<M>();
    const fn = vi.fn();
    bus.once('pong', fn);
    bus.emit('pong', 'x');
    bus.emit('pong', 'y');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('a throwing listener does not stop the others', () => {
    const bus = new EventBus<M>();
    const fn = vi.fn();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('ping', () => { throw new Error('boom'); });
    bus.on('ping', fn);
    bus.emit('ping', 1);
    expect(fn).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('time', () => {
  it('maps hours to time of day', () => {
    expect(timeOfDay(5)).toBe('night');
    expect(timeOfDay(6)).toBe('day');
    expect(timeOfDay(16)).toBe('day');
    expect(timeOfDay(17)).toBe('dusk');
    expect(timeOfDay(18)).toBe('dusk');
    expect(timeOfDay(19)).toBe('night');
    expect(timeOfDay(0)).toBe('night');
  });

  it('knows sleepy hours', () => {
    expect(isSleepyHour(23)).toBe(true);
    expect(isSleepyHour(2)).toBe(true);
    expect(isSleepyHour(6)).toBe(false);
    expect(isSleepyHour(14)).toBe(false);
  });
});

describe('i18n', () => {
  it('resolves system language', () => {
    expect(resolveLang('system', 'pt-BR')).toBe('pt');
    expect(resolveLang('system', 'pt')).toBe('pt');
    expect(resolveLang('system', 'de-DE')).toBe('en');
    expect(resolveLang('pt', 'en-US')).toBe('pt');
    expect(resolveLang('en', 'pt-BR')).toBe('en');
  });

  it('translates records', () => {
    expect(t({ pt: 'oi', en: 'hi' }, 'pt')).toBe('oi');
    expect(t({ pt: 'oi', en: 'hi' }, 'en')).toBe('hi');
  });
});

describe('geometry', () => {
  it('works', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5 })).toBe(true);
    expect(contains({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 5 })).toBe(false);
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(expand({ x: 5, y: 5, w: 2, h: 2 }, 1)).toEqual({ x: 4, y: 4, w: 4, h: 4 });
  });
});
