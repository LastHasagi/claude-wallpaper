import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { createRng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import type { Lang } from '../../src/shared/i18n';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { SceneController } from '../../src/features/scene';
import { Director, MISSIONS, missionLabel, type MissionDef, type MissionEvents, type MissionId } from '../../src/features/missions';
import { IDLE_RANGE, nextIdleDelay, pickMission } from '../../src/features/missions/model/director-model';

const tick = () => new Promise<void>((r) => setImmediate(r));

function world(opts: { mode?: 'full' | 'overlay'; lang?: Lang; hour?: number; missions?: MissionDef[]; afterMission?: () => Promise<void>; seed?: number } = {}) {
  const mode = opts.mode ?? 'full';
  const clock = fixedClock(opts.hour ?? 14);
  const bus = new EventBus<ClawdEvents & MissionEvents>();
  let seed = 1;
  const scene = new SceneController(clock, mode, () => seed++);
  const l = scene.resize(150, 40, 10, 20, 800, mode === 'overlay' ? 48 : 0);
  const clawd = new ClawdController(bus, createRng(5), clock);
  clawd.setStage({ minX: 60, maxX: 1440, groundY: l.groundY, scale: 3 }, true);
  const director = new Director({
    clawd,
    scene,
    bus,
    rng: createRng(opts.seed ?? 9),
    clock,
    mode,
    lang: () => opts.lang ?? 'pt',
    frequency: () => 'normal',
    missions: opts.missions,
    afterMission: opts.afterMission,
  });
  const finished: { id: MissionId; ok: boolean }[] = [];
  bus.on('mission:finished', (e) => finished.push(e));
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

  /** Advances the whole world, yielding to promise callbacks between frames. */
  async function run(seconds: number, until?: () => boolean) {
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) {
      director.update(dt);
      clawd.update(dt);
      scene.update(dt);
      await tick();
      if (until?.()) return t;
    }
    return seconds;
  }
  return { scene, clawd, director, finished, errors, run };
}

describe('director rules', () => {
  const rng = createRng(3);

  it('never repeats one of the last two missions when it has a choice', () => {
    for (let i = 0; i < 50; i++) {
      const next = pickMission(MISSIONS, ['birdwatching', 'coding'], new Set(), 12, rng);
      expect(next?.id).toBe('reading-bench');
    }
  });

  it('skips blacklisted missions and returns null when all are out', () => {
    const all = new Set<MissionId>(MISSIONS.map((m) => m.id));
    expect(pickMission(MISSIONS, [], all, 12, rng)).toBeNull();
    const onlyCoding = new Set<MissionId>(['birdwatching', 'reading-bench']);
    expect(pickMission(MISSIONS, ['coding'], onlyCoding, 12, rng)?.id).toBe('coding');
  });

  it('day missions are rarer at night but still possible', () => {
    const count = (hour: number) => {
      const r = createRng(11);
      let n = 0;
      for (let i = 0; i < 3000; i++) if (pickMission(MISSIONS, [], new Set(), hour, r)?.id === 'birdwatching') n++;
      return n;
    };
    const night = count(2), day = count(12);
    expect(night).toBeGreaterThan(0);
    expect(night).toBeLessThan(day * 0.6);
  });

  it('idle delays stay within the configured ranges', () => {
    for (const freq of ['often', 'normal', 'rare'] as const) {
      for (let i = 0; i < 200; i++) {
        const v = nextIdleDelay(freq, rng);
        expect(v).toBeGreaterThanOrEqual(IDLE_RANGE[freq][0]);
        expect(v).toBeLessThanOrEqual(IDLE_RANGE[freq][1]);
      }
    }
  });

  it('formats labels in both languages', () => {
    const coding = MISSIONS.find((m) => m.id === 'coding')!;
    expect(missionLabel(coding, 'pt')).toBe('[ missão 08: programando ]');
    expect(missionLabel(coding, 'en')).toBe('[ mission 08: coding ]');
  });

  it('every mission has a title in both languages and a unique number', () => {
    const numbers = new Set(MISSIONS.map((m) => m.number));
    expect(numbers.size).toBe(MISSIONS.length);
    for (const m of MISSIONS) {
      expect(m.title.pt.trim()).not.toBe('');
      expect(m.title.en.trim()).not.toBe('');
    }
  });
});

describe('mission scripts (real clawd + scene, simulated time)', () => {
  const cases: { mode: 'full' | 'overlay'; lang: Lang; hour: number }[] = [
    { mode: 'full', lang: 'pt', hour: 14 },
    { mode: 'full', lang: 'en', hour: 2 },
    { mode: 'overlay', lang: 'pt', hour: 21 },
  ];
  for (const m of MISSIONS) {
    for (const c of cases) {
      it(`${m.id} completes cleanly (${c.mode}, ${c.lang}, ${c.hour}h)`, async () => {
        const w = world(c);
        void w.director.start(m.id);
        const took = await w.run(180, () => w.finished.length > 0);
        expect(w.finished).toEqual([{ id: m.id, ok: true }]);
        expect(took).toBeLessThan(120);
        expect(w.errors).not.toHaveBeenCalled();
        expect(w.clawd.model.held).toBeNull();
        expect(w.clawd.model.elevation).toBe(0);
        expect(w.clawd.brain.autonomous).toBe(true);
        expect(w.director.terminal.visible).toBe(false);
        expect(w.scene.biome()).toBe(m.biome);
        expect(w.director.model.phase).toBe('idle');
      });
    }
  }

  it('reading at night can doze off over the book and wake up startled', async () => {
    let dozed = false;
    for (let seed = 1; seed <= 8 && !dozed; seed++) {
      const w = world({ hour: 2, seed });
      void w.director.start('reading-bench');
      await w.run(150, () => {
        const m = w.clawd.model;
        if (m.emote?.text === 'zZ' && m.held === 'book' && m.pose === 'read' && m.eyes === 'closed') dozed = true;
        return w.finished.length > 0;
      });
      expect(w.finished[0]?.ok).toBe(true);
    }
    expect(dozed).toBe(true);
  });

  it('shows the mission label in full mode', async () => {
    const w = world({ lang: 'en' });
    void w.director.start('coding');
    await w.run(60, () => w.director.model.phase === 'running');
    expect(w.scene.compose().toString()).toContain('[ mission 08: coding ]');
  });
});

describe('director resilience', () => {
  it('blacklists a mission that throws and keeps the pet alive', async () => {
    const broken: MissionDef = {
      ...MISSIONS[0]!,
      id: 'coding',
      async run() {
        throw new Error('boom');
      },
    };
    const w = world({ missions: [broken] });
    void w.director.start();
    await w.run(40, () => w.finished.length > 0);
    expect(w.finished).toEqual([{ id: 'coding', ok: false }]);
    expect(w.director.model.blacklist.has('coding')).toBe(true);
    expect(w.clawd.brain.autonomous).toBe(true);
    expect(w.director.model.phase).toBe('idle');
  });

  it('stop() aborts a running mission and resets Clawd', async () => {
    const w = world();
    void w.director.start('reading-bench');
    await w.run(90, () => w.clawd.model.elevation > 0);
    expect(w.clawd.model.elevation).toBeGreaterThan(0);
    w.director.stop();
    await w.run(1, () => w.finished.length > 0);
    expect(w.finished).toEqual([{ id: 'reading-bench', ok: false }]);
    expect(w.director.model.blacklist.size).toBe(0);
    expect(w.clawd.model.elevation).toBe(0);
    expect(w.clawd.model.held).toBeNull();
    expect(w.clawd.brain.autonomous).toBe(true);
  });

  it('runs the after-mission hook with the mission topic', async () => {
    const after = vi.fn(async () => {});
    const w = world({ afterMission: after });
    void w.director.start('birdwatching');
    await w.run(150, () => w.finished.length > 0);
    expect(after).toHaveBeenCalledWith('birds', expect.any(AbortSignal));
  });

  it('starts missions on its own after free time', async () => {
    const w = world();
    await w.run(400, () => w.finished.length > 0);
    expect(w.finished.length).toBe(1);
  });
});
