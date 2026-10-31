import { describe, expect, it } from 'vitest';
import { CURSOR_GRID, type CursorArt } from '../../src/shared/cursor';
import { contains } from '../../src/shared/geometry';
import { EventBus } from '../../src/shared/events';
import { createRng, type Rng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { CLAWD_CURSOR_LIST, CURSOR_RULES, CursorController, type CursorSetting } from '../../src/features/cursor';
import { heistAllowed } from '../../src/features/cursor/model/cursor-model';
import type { SystemCursorPort } from '../../src/host/host';

const tick = () => new Promise<void>((r) => setImmediate(r));

/** Records what the engine asks of the system pointer. */
class FakePort implements SystemCursorPort {
  calls: string[] = [];
  seeable = true;
  failApply = false;
  async hide() {
    this.calls.push('hide');
  }
  async apply(art: readonly CursorArt[]) {
    if (this.failApply) throw new Error('LoadCursorFromFile failed');
    this.calls.push(`apply:${art.length}`);
  }
  async restore() {
    this.calls.push('restore');
  }
  async visible() {
    return this.seeable;
  }
}

const lucky = { chance: () => true } as unknown as Rng;

function world(opts: { setting?: CursorSetting; port?: FakePort | null; rng?: Rng } = {}) {
  const bus = new EventBus<ClawdEvents>();
  const clawd = new ClawdController(bus, createRng(5), fixedClock(12));
  clawd.setStage({ minX: 60, maxX: 1440, groundY: 700, scale: 3 }, true);
  const port = opts.port === null ? undefined : opts.port ?? new FakePort();
  let setting = opts.setting ?? 'often';
  const cursor = new CursorController({ clawd, port, rng: opts.rng ?? lucky, setting: () => setting, lang: () => 'pt' });
  const flyers = new Set<string>();
  async function run(seconds: number, until?: () => boolean) {
    for (let t = 0; t < seconds; t += 1 / 30) {
      clawd.update(1 / 30);
      cursor.update(1 / 30);
      const f = cursor.model.flyerFrame();
      if (f) flyers.add(f.art);
      await tick();
      if (until?.()) return;
    }
  }
  const head = () => {
    const b = clawd.bounds();
    return { x: b.x + b.w / 2, y: b.y - 20 };
  };
  const point = (p: { x: number; y: number }) => cursor.onCursor({ type: 'move', x: p.x, y: p.y, t: 0 });
  const click = (p: { x: number; y: number }) => cursor.onCursor({ type: 'down', x: p.x, y: p.y, t: 0 });
  return { clawd, cursor, port: port as FakePort, run, head, point, click, flyers, set: (s: CursorSetting) => (setting = s) };
}

describe('Clawd cursor art', () => {
  it('has one animated pointer per kind, on the 16-px grid, with the hotspot on a drawn pixel', () => {
    const kinds = CLAWD_CURSOR_LIST.map((a) => a.kind);
    expect(new Set(kinds)).toEqual(new Set(['arrow', 'hand', 'text', 'busy', 'working', 'no']));
    for (const art of CLAWD_CURSOR_LIST) {
      expect(art.fps, art.kind).toBeGreaterThan(0);
      for (const i of art.sequence ?? []) expect(art.frames[i], `${art.kind} step ${i}`).toBeDefined();
      art.frames.forEach((f, i) => {
        expect([f.w, f.h], `${art.kind}#${i}`).toEqual([CURSOR_GRID, CURSOR_GRID]);
        expect(f.pixels[art.hotspot.y * f.w + art.hotspot.x], `${art.kind}#${i} hotspot`).not.toBeNull();
      });
    }
  });
});

describe('heist rules', () => {
  const ok = { setting: 'sometimes' as CursorSetting, elapsed: 1000, lastHeistAt: -Infinity, restingFor: 2, rolled: false, bodies: 1 };

  it('needs a resting pointer close to Clawd, once per pause', () => {
    expect(heistAllowed(ok)).toBe(true);
    expect(heistAllowed({ ...ok, bodies: CURSOR_RULES.nearBodies + 0.5 })).toBe(false);
    expect(heistAllowed({ ...ok, restingFor: 1 })).toBe(false);
    expect(heistAllowed({ ...ok, rolled: true })).toBe(false);
  });

  it('respects the setting, the warm-up after opening and the cooldown', () => {
    expect(heistAllowed({ ...ok, setting: 'off' })).toBe(false);
    expect(heistAllowed({ ...ok, elapsed: 30 })).toBe(false);
    expect(heistAllowed({ ...ok, lastHeistAt: 1000 - 60 })).toBe(false);
    expect(heistAllowed({ ...ok, setting: 'often', lastHeistAt: 1000 - 130 })).toBe(true);
  });
});

describe('CursorController', () => {
  it('eats the pointer and spits his own: hide, then swap, then free time again', async () => {
    const w = world();
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(12, () => w.cursor.model.phase === 'clawd' && !w.clawd.busy());
    expect(w.port.calls).toEqual(['hide', `apply:${CLAWD_CURSOR_LIST.length}`]);
    expect(w.cursor.model.phase).toBe('clawd');
    expect(w.flyers).toEqual(new Set(['system', 'clawd'])); // ours flew in, his flew out
    expect(w.cursor.model.flyer).toBeNull();
    expect(w.clawd.model.mouth).toBeNull();
    expect(w.clawd.busy()).toBe(false); // autonomy is back
  });

  it('swallows pointer events while eating, so he does not also wave or laugh', async () => {
    const w = world();
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(3, () => w.cursor.model.phase === 'stealing');
    expect(w.point(w.head())).toBe(true);
  });

  it('a click on Clawd gets the user pointer back, with the scene backwards', async () => {
    const w = world();
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(12, () => w.cursor.model.phase === 'clawd' && !w.clawd.busy());
    w.port.calls = [];
    w.flyers.clear();
    const b = w.clawd.bounds();
    expect(w.click({ x: b.x + b.w / 2, y: b.y + b.h / 2 })).toBe(true);
    await w.run(8, () => w.cursor.model.phase === 'normal');
    expect(w.port.calls).toEqual(['hide', 'restore']);
    expect(w.flyers).toEqual(new Set(['clawd', 'system']));
    // A click elsewhere is not his business.
    expect(w.click({ x: 10, y: 10 })).toBe(false);
  });

  it('steals on his own when the pointer rests near him', async () => {
    const w = world({ setting: 'often' });
    w.cursor.model.elapsed = CURSOR_RULES.firstAfter + 1;
    w.point(w.head());
    await w.run(12, () => w.cursor.model.phase === 'clawd');
    expect(w.cursor.model.phase).toBe('clawd');
  });

  it('never steals when the setting is off, the pointer is far, or the platform cannot swap pointers', async () => {
    const off = world({ setting: 'off' });
    off.cursor.model.elapsed = 1000;
    off.point(off.head());
    await off.run(4);
    expect(off.cursor.model.phase).toBe('normal');

    const far = world();
    far.cursor.model.elapsed = 1000;
    far.point({ x: far.head().x + far.clawd.bodyWidth() * 6, y: far.head().y });
    await far.run(4);
    expect(far.cursor.model.phase).toBe('normal');

    const mac = world({ port: null });
    mac.cursor.model.elapsed = 1000;
    mac.point(mac.head());
    mac.cursor.command('steal');
    await mac.run(4);
    expect(mac.cursor.model.phase).toBe('normal');
  });

  it('does not touch the pointer when it cannot see it (wallpaper, pointer over a window)', async () => {
    const w = world();
    w.port.seeable = false;
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(3);
    expect(w.port.calls).toEqual([]);
    expect(w.cursor.model.phase).toBe('normal');
    expect(w.clawd.busy()).toBe(false);
  });

  it('interrupted mid-meal (a mission takes over), the user gets the pointer back', async () => {
    const w = world();
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(6, () => w.port.calls.includes('hide'));
    w.clawd.cancel();
    await w.run(1);
    expect(w.port.calls).toEqual(['hide', 'restore']);
    expect(w.cursor.model.phase).toBe('normal');
  });

  it('if swapping fails, the user pointer comes back', async () => {
    const w = world();
    w.port.failApply = true;
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(12, () => w.port.calls.includes('restore'));
    expect(w.port.calls).toEqual(['hide', 'restore']);
    expect(w.cursor.model.phase).toBe('normal');
  });

  it('gives it back on his own after a while, and at once when the setting is switched off', async () => {
    const w = world();
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(12, () => w.cursor.model.phase === 'clawd' && !w.clawd.busy());
    w.cursor.model.clawdFor = CURSOR_RULES.keepFor;
    await w.run(8, () => w.cursor.model.phase === 'normal');
    expect(w.port.calls.at(-1)).toBe('restore');

    const v = world();
    v.point(v.head());
    v.cursor.command('steal');
    await v.run(12, () => v.cursor.model.phase === 'clawd');
    v.set('off');
    v.cursor.settingChanged('off');
    await v.run(0.1);
    expect(v.port.calls.at(-1)).toBe('restore');
    expect(v.cursor.model.phase).toBe('normal');
  });

  it('asked for it back from the tray mid-mission, the pointer returns at once', async () => {
    const w = world();
    w.point(w.head());
    w.cursor.command('steal');
    await w.run(12, () => w.cursor.model.phase === 'clawd' && !w.clawd.busy());
    w.clawd.setAutonomy(false); // a mission is driving him
    w.cursor.command('return');
    await w.run(0.1);
    expect(w.port.calls.at(-1)).toBe('restore');
    expect(w.cursor.model.phase).toBe('normal');
  });

  it("his mouth is on his face", () => {
    const w = world();
    expect(contains(w.clawd.bounds(), w.clawd.mouth())).toBe(true);
  });
});
