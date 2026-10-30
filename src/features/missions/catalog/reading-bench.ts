import type { MissionDef } from '../model/mission-types';
import { BENCH, BENCH_SEAT_ROW } from './props';

const MOODS = ['…', '!', '♥', '?'];

export const readingBench: MissionDef = {
  id: 'reading-bench',
  number: 11,
  title: { pt: 'leitura no banco', en: 'reading on the bench' },
  biome: 'park',
  prefers: 'any',
  noteTopic: 'books',
  async run({ clawd, scene, rng, surface }) {
    const col = scene.spot('bench');
    await scene.showProp('bench', BENCH, col - Math.floor(BENCH.w / 2));
    await clawd.walkTo(scene.colToX(col));
    await clawd.hopTo(surface('bench', BENCH_SEAT_ROW));
    clawd.hold('book');

    const pages = rng.int(4, 7);
    const dozeAt = scene.timeOfDay() === 'night' && rng.chance(0.7) ? rng.int(1, pages - 1) : -1;
    for (let p = 0; p < pages; p++) {
      await clawd.play('read', { duration: rng.range(2.5, 4.5) });
      clawd.setHeldFrame(1);
      await clawd.play('read', { duration: 0.35 });
      clawd.setHeldFrame(0);
      if (rng.chance(0.4)) clawd.emote(rng.pick(MOODS), 1.6);
      if (p === dozeAt) {
        for (let z = 0; z < 3; z++) await clawd.play('read', { duration: 2.4, eyes: 'closed', emote: 'zZ' });
        await clawd.play('startle', { duration: 0.6, eyes: 'wide', emote: '!' });
      }
    }

    clawd.hold(null);
    await clawd.play('sit', { duration: 1.6, eyes: 'happy', emote: '♥' });
    await clawd.hopTo(0);
  },
};
