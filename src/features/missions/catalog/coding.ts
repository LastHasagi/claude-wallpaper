import type { MissionDef } from '../model/mission-types';
import { DESK, MUG_COL } from './props';

const TEXT = {
  pt: { failed: '✗ build falhou', passed: (n: number) => `✓ ${n} testes passando` },
  en: { failed: '✗ build failed', passed: (n: number) => `✓ ${n} tests passed` },
};

export const coding: MissionDef = {
  id: 'coding',
  number: 8,
  title: { pt: 'programando', en: 'coding' },
  biome: 'room',
  prefers: 'any',
  noteTopic: 'computing',
  async run({ clawd, scene, terminal, rng, lang, wait }) {
    const col = scene.spot('desk');
    const left = col - Math.floor(DESK.w / 2);
    await scene.showProp('desk', DESK, left);
    scene.startEffect('steam', 'steam', left + MUG_COL, (scene.propTopRow('desk') ?? 0) - 1);
    await clawd.walkTo(scene.colToX(col));

    clawd.hold('laptop');
    await clawd.play('type', { duration: 2 });
    await terminal.type('> npm run build');
    await clawd.play('type', { duration: rng.range(2, 3) });
    await terminal.type(TEXT[lang].failed, 'accent');
    await clawd.play('angry', { duration: 1.6, eyes: 'angry', emote: '@#!' });

    await clawd.play('sit', { duration: 1.8, emote: 'c[_]' });
    await clawd.play('type', { duration: rng.range(3, 4.5) });
    await terminal.type('> npm test');
    await clawd.play('type', { duration: 1.5 });
    await terminal.type(TEXT[lang].passed(rng.int(12, 99)), 'strong');

    clawd.hold(null);
    await clawd.play('laugh', { duration: 1.6, eyes: 'happy', emote: '♪' });
    await wait(1.5);
    terminal.clear();
    scene.stopEffect('steam');
  },
};
