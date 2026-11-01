import { describe, expect, it } from 'vitest';
import { SceneController, type BiomeId } from '../../src/features/scene';
import type { AsciiGrid } from '../../src/shared/render/ascii-grid';
import type { Season } from '../../src/shared/season';
import { fixedClock } from '../../src/shared/time';
import { simulate } from '../helpers';

async function sceneIn(season: Season | null, biome: BiomeId = 'park', mode: 'full' | 'overlay' = 'full') {
  let s = 1;
  const scene = new SceneController(fixedClock(21), mode, () => s++, () => season);
  scene.resize(220, 50, 10, 20, 1000, 0);
  const switched = scene.setBiome(biome, 5);
  simulate(3, (dt) => scene.update(dt)); // the biome sweep is animated
  await switched;
  return scene;
}

const text = (g: AsciiGrid) => {
  let out = '';
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) out += g.get(c, r)?.ch ?? ' ';
  return out;
};

describe('seasonal decoration', () => {
  it('shows only in its season', async () => {
    expect(text((await sceneIn(null)).compose())).not.toContain('(o^o)');
    expect(text((await sceneIn('halloween')).compose())).toContain('(o^o)');
    expect(text((await sceneIn('natal')).compose())).toContain('/___\\');
    expect(text((await sceneIn('carnaval')).compose())).toContain('\\/');
  });

  it('keeps mission spots clear', async () => {
    for (const [biome, spot] of [['park', 'bench'], ['room', 'desk'], ['mountains', 'lookout']] as const) {
      for (const season of ['halloween', 'natal'] as const) {
        const scene = await sceneIn(season, biome);
        const g = scene.compose();
        const col = scene.spot(spot), ground = scene.layout().groundRow;
        for (let r = ground - 8; r < ground; r++) {
          for (let c = col - 8; c <= col + 8; c++) expect(['gold', 'green']).not.toContain(g.get(c, r)?.role);
        }
      }
    }
  });

  it('leaves the transparent overlay alone', async () => {
    expect(text((await sceneIn('natal', 'park', 'overlay')).compose()).trim()).toBe('');
  });

  it('follows the season source as time passes', async () => {
    let season: Season | null = null;
    const scene = new SceneController(fixedClock(12), 'full', () => 1, () => season);
    expect(scene.season()).toBeNull();
    season = 'carnaval';
    scene.update(31);
    expect(scene.season()).toBe('carnaval');
  });
});
