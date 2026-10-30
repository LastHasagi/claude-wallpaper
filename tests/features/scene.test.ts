import { describe, expect, it } from 'vitest';
import { AsciiGrid } from '../../src/shared/render/ascii-grid';
import { parsePropArt } from '../../src/shared/render/prop-art';
import { fixedClock, type TimeOfDay } from '../../src/shared/time';
import { BIOMES, SceneController, type BiomeId } from '../../src/features/scene';
import { simulate } from '../helpers';

const IDS = Object.keys(BIOMES) as BiomeId[];

function paint(id: BiomeId, seed: number, tod: TimeOfDay = 'day', cols = 120, rows = 34) {
  const g = new AsciiGrid(cols, rows);
  BIOMES[id].paint(g, { cols, rows, groundRow: rows - 4, tod, seed });
  return g;
}

describe('biomes', () => {
  for (const id of IDS) {
    describe(id, () => {
      it('is deterministic for a seed and varies across seeds', () => {
        expect(paint(id, 5).toString()).toBe(paint(id, 5).toString());
        expect(paint(id, 5).toString()).not.toBe(paint(id, 6).toString());
      });

      it('draws a continuous ground line', () => {
        const g = paint(id, 3);
        const line = g.toString().split('\n')[30]!;
        expect(line.replace(/[^_]/g, '').length).toBeGreaterThan(line.length * 0.8);
      });

      it('changes with the time of day', () => {
        expect(paint(id, 3, 'day').toString()).not.toBe(paint(id, 3, 'night').toString());
      });

      it('keeps spots inside the grid on small and large screens', () => {
        for (const [cols, rows] of [[48, 14], [120, 34], [200, 60]] as const) {
          const spots = BIOMES[id].spots({ cols, rows, groundRow: rows - 4, tod: 'day', seed: 1 });
          for (const col of Object.values(spots)) {
            expect(col).toBeGreaterThan(0);
            expect(col).toBeLessThan(cols);
          }
        }
      });

      it('animates without throwing and keeps the ground intact', () => {
        const g = paint(id, 9, 'dusk');
        for (let t = 0; t < 30; t += 0.7) BIOMES[id].animate(g, { cols: 120, rows: 34, groundRow: 30, tod: 'dusk', seed: 9 }, t);
        expect(g.get(10, 30)?.ch).toBe('_');
      });
    });
  }

  it('mountains snapshot (seed 1, day)', () => {
    expect(paint('mountains', 1, 'day', 80, 24).toString()).toMatchSnapshot();
  });
});

function makeScene(mode: 'full' | 'overlay' = 'full') {
  let seed = 100;
  const s = new SceneController(fixedClock(12), mode, () => seed++);
  s.resize(120, 34, 10, 20, 680, mode === 'overlay' ? 48 : 0);
  return { s, step: (sec: number) => simulate(sec, (dt) => s.update(dt)) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('SceneController', () => {
  it('puts the full-mode ground 4 rows above the bottom', () => {
    const { s } = makeScene();
    expect(s.layout().groundRow).toBe(30);
    expect(s.layout().groundY).toBe(31 * 20);
  });

  it('puts the overlay ground right above the taskbar', () => {
    const { s } = makeScene('overlay');
    const l = s.layout();
    expect(l.groundY).toBeLessThanOrEqual(680 - 48);
    expect(l.groundY).toBeGreaterThan(680 - 48 - 20);
  });

  it('finishes a biome transition and resolves', async () => {
    const { s, step } = makeScene();
    let done = false;
    s.setBiome('park').then(() => (done = true));
    step(0.5);
    await flush();
    expect(done).toBe(false);
    const mid = s.compose().toString();
    expect(mid).toMatch(/[#$%&*+=?<>]/);
    step(1);
    await flush();
    expect(done).toBe(true);
    expect(s.biome()).toBe('park');
  });

  it('switches biome instantly in overlay mode and never draws the backdrop', async () => {
    const { s } = makeScene('overlay');
    await s.setBiome('room');
    expect(s.compose().toString().trim()).toBe('');
  });

  it('shows props sitting on the ground, then hides them', async () => {
    const { s, step } = makeScene();
    const art = parsePropArt({ frames: [['[##]', '|  |']] });
    let shown = false;
    s.showProp('box', art, 10).then(() => (shown = true));
    step(0.6);
    await flush();
    expect(shown).toBe(true);
    const g = s.compose();
    expect(g.get(10, 30)?.ch).toBe('|');
    expect(g.get(10, 29)?.ch).toBe('[');
    const hidden = s.hideProp('box');
    step(0.6);
    await hidden;
    expect(s.compose().get(10, 29)?.ch).not.toBe('[');
  });

  it('overlay props get a background outline', async () => {
    const { s, step } = makeScene('overlay');
    const p = s.showProp('box', parsePropArt({ frames: [['XX']] }), 10);
    step(0.6);
    await p;
    const g = s.compose();
    const row = s.layout().groundRow;
    expect(g.get(9, row)).toEqual({ ch: ' ', role: 'bg' });
    expect(g.get(10, row)?.ch).toBe('X');
  });

  it('birds cross the sky and resolve', async () => {
    const { s, step } = makeScene();
    let done = false;
    s.birds(1).then(() => (done = true));
    step(2);
    expect(s.compose().toString()).toMatch(/[v^]/);
    step(10);
    await flush();
    expect(done).toBe(true);
    expect(s.model.effects.size).toBe(0);
  });

  it('draws the label in full mode', () => {
    const { s } = makeScene();
    s.setLabel('[ missão 01: teste ]');
    expect(s.compose().toString().split('\n')[1]).toContain('[ missão 01: teste ]');
  });
});
