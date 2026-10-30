import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { createRng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import { parsePropArt } from '../../src/shared/render/prop-art';
import { parseSegments } from '../../src/host/segments';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { ClawdModel } from '../../src/features/clawd/model/clawd-model';
import { SceneController } from '../../src/features/scene';
import { buildPanels } from '../../src/features/scene/model/panels';
import { Director, MISSIONS, type MissionEvents } from '../../src/features/missions';
import { simulate } from '../helpers';

// Two monitors side by side: a 1920×1080 primary and a 1280×720 one, aligned at the top.
const CELL_W = 10, CELL_H = 20;
const SEGMENTS = [
  { x: 0, y: 0, w: 1920, h: 1080 },
  { x: 1920, y: 0, w: 1280, h: 720 },
];
const COLS = 320, ROWS = 54;

describe('parseSegments', () => {
  it('parses, scales and sorts left to right', () => {
    expect(parseSegments('1920,0,1280,720;0,0,1920,1080', 2)).toEqual([
      { x: 0, y: 0, w: 960, h: 540 },
      { x: 960, y: 0, w: 640, h: 360 },
    ]);
  });

  it('rejects malformed input as "single screen"', () => {
    expect(parseSegments(null)).toEqual([]);
    expect(parseSegments('1,2,3')).toEqual([]);
    expect(parseSegments('0,0,0,100')).toEqual([]);
    expect(parseSegments('a,b,c,d')).toEqual([]);
  });
});

describe('buildPanels', () => {
  it('gives each monitor its own ground row', () => {
    const panels = buildPanels(COLS, ROWS, CELL_W, CELL_H, SEGMENTS, ROWS - 4);
    expect(panels).toHaveLength(2);
    expect(panels[0]).toMatchObject({ col0: 0, cols: 192, row0: 0, rows: 54, groundRow: 50 });
    expect(panels[1]).toMatchObject({ col0: 192, cols: 128, row0: 0, rows: 36, groundRow: 32 });
  });

  it('treats no segments or a single one as one full-grid panel', () => {
    expect(buildPanels(COLS, ROWS, CELL_W, CELL_H, [], 50)).toEqual([{ col0: 0, row0: 0, cols: COLS, rows: ROWS, groundRow: 50 }]);
    expect(buildPanels(COLS, ROWS, CELL_W, CELL_H, [SEGMENTS[0]!], 50)).toEqual([{ col0: 0, row0: 0, cols: COLS, rows: ROWS, groundRow: 50 }]);
  });
});

function twoMonitorScene(seed = 1) {
  let s = seed;
  const scene = new SceneController(fixedClock(12), 'full', () => s++);
  scene.resize(COLS, ROWS, CELL_W, CELL_H, 1080, 0, SEGMENTS);
  return scene;
}

describe('scene on two monitors', () => {
  it('paints a ground line on each monitor at its own height', () => {
    const g = twoMonitorScene().compose();
    expect(g.get(50, 50)?.ch).toBe('_'); // primary ground
    expect(g.get(250, 32)?.ch).toBe('_'); // second monitor ground, higher up
    expect(g.get(250, 50)?.role ?? null).toBeNull(); // below the 720px monitor: nothing to draw
  });

  it('exposes one floor per monitor for Clawd', () => {
    expect(twoMonitorScene().floors()).toEqual([
      { x0: 0, x1: 1920, groundY: 1020 },
      { x0: 1920, x1: 3200, groundY: 660 },
    ]);
  });

  it('places mission spots inside the focus monitor and props on its ground', async () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const scene = twoMonitorScene(seed);
      void scene.setBiome('park');
      simulate(2, (dt) => scene.update(dt));
      const focus = scene.model.current.focus!;
      seen.add(focus);
      const panel = scene.layout().panels[focus]!;
      const col = scene.spot('bench');
      expect(col).toBeGreaterThanOrEqual(panel.col0);
      expect(col).toBeLessThan(panel.col0 + panel.cols);

      const art = parsePropArt({ frames: [['[__]', '|  |']] });
      void scene.showProp('box', art, col);
      expect(scene.propTopRow('box')).toBe(panel.groundRow - 1);
      expect(scene.propSurface('box', 0)).toBe(1 * CELL_H); // row 0 bottom edge: one cell above the ground line
      expect(scene.panelAt(scene.colToX(col)).groundY).toBe((panel.groundRow + 1) * CELL_H);
    }
    expect(seen).toEqual(new Set([0, 1])); // missions happen on both monitors
  });
});

describe('Clawd across monitors', () => {
  it('stands on the floor of the monitor he is over', () => {
    const m = new ClawdModel();
    m.stage = { minX: 0, maxX: 3200, groundY: 1020, scale: 3, floors: twoMonitorScene().floors() };
    m.x = 900;
    expect(m.feetY()).toBe(1020);
    m.x = 2500;
    expect(m.feetY()).toBe(660);
    m.x = 5000; // beyond every floor: the nearest one
    expect(m.feetY()).toBe(660);
  });

  it('runs a mission end to end on two monitors', async () => {
    const tick = () => new Promise<void>((r) => setImmediate(r));
    const clock = fixedClock(14);
    const bus = new EventBus<ClawdEvents & MissionEvents>();
    const scene = twoMonitorScene(3);
    const clawd = new ClawdController(bus, createRng(5), clock);
    clawd.setStage({ minX: 60, maxX: 3140, groundY: 1020, scale: 3, floors: scene.floors() }, true);
    const director = new Director({ clawd, scene, bus, rng: createRng(9), clock, mode: 'full', lang: () => 'pt', frequency: () => 'normal' });
    const finished: boolean[] = [];
    bus.on('mission:finished', (e) => finished.push(e.ok));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    void director.start(MISSIONS.find((d) => d.id === 'reading-bench')!.id);
    let sat = false;
    for (let t = 0; t < 200 && !finished.length; t += 1 / 30) {
      director.update(1 / 30);
      clawd.update(1 / 30);
      scene.update(1 / 30);
      await tick();
      // While sitting on the bench, his feet are on the bench seat of the focus monitor.
      if (clawd.model.pose === 'read') {
        const panel = scene.panelAt(clawd.x());
        expect(clawd.model.feetY()).toBeLessThan(panel.groundY);
        sat = true;
      }
    }
    expect(finished).toEqual([true]);
    expect(sat).toBe(true);
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
