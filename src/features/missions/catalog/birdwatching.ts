import type { MissionDef } from '../model/mission-types';
import { ROCK, ROCK_TOP_ROW } from './props';

export const birdwatching: MissionDef = {
  id: 'birdwatching',
  number: 1,
  title: { pt: 'observar pássaros', en: 'birdwatching' },
  biome: 'mountains',
  prefers: 'day',
  noteTopic: 'birds',
  async run({ clawd, scene, rng, wait, surface }) {
    const col = scene.spot('lookout');
    await scene.showProp('rock', ROCK, col - Math.floor(ROCK.w / 2));
    await clawd.walkTo(scene.colToX(col + 0.5));
    await clawd.hopTo(surface('rock', ROCK_TOP_ROW));

    const dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    clawd.hold('binoculars');
    clawd.face(dir === 1 ? -1 : 1);
    await clawd.play('hold', { duration: 1.4 });
    const flock = scene.birds(dir);
    await wait(1.6);
    clawd.emote('!', 1.5);
    await wait(0.9);
    clawd.face(dir);
    await flock;

    clawd.hold(null);
    await clawd.play('laugh', { duration: 1.4, eyes: 'happy', emote: '♪' });

    if (rng.chance(0.5)) {
      // One more sweep of the horizon, looking the other way.
      clawd.hold('binoculars');
      clawd.face(dir === 1 ? -1 : 1);
      await clawd.play('hold', { duration: 2.2 });
      clawd.hold(null);
      await clawd.play('idle', { duration: 0.8, emote: '…' });
    }
    await clawd.hopTo(0);
  },
};
