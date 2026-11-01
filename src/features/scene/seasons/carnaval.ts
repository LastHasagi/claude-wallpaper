import { hash2 } from '../../../shared/rng';
import type { SeasonDecor } from './decor';
import { falling, FESTIVE } from './decor';

const CONFETTI = "'.,*";
/** The flag string runs along the top row; streamers hang from it. */
const FLAG_ROW = 0;
const STREAMER = ['(', ')'];

/** A string of little flags across the top, streamers hanging from it and (outdoors) confetti. */
export const carnaval: SeasonDecor = {
  paint(g, ctx) {
    // Only on empty cells: the sun, moon and stars stay whole.
    for (let c = 0; c + 1 < ctx.cols; c += 3) {
      const role = FESTIVE[(c / 3) % FESTIVE.length]!;
      if (g.isEmpty(c, FLAG_ROW)) g.set(c, FLAG_ROW, '\\', role);
      if (g.isEmpty(c + 1, FLAG_ROW)) g.set(c + 1, FLAG_ROW, '/', role);
    }
  },
  animate(g, ctx, t, indoor) {
    const streamers = Math.max(3, Math.round(ctx.cols / 30));
    for (let i = 0; i < streamers; i++) {
      const c = Math.floor(hash2(i, ctx.seed + 61) * ctx.cols);
      const len = 3 + Math.floor(hash2(i, ctx.seed + 62) * 4);
      const role = FESTIVE[i % FESTIVE.length]!;
      for (let k = 0; k < len; k++) {
        const r = FLAG_ROW + 1 + k;
        if (g.isEmpty(c, r)) g.set(c, r, STREAMER[(k + Math.floor(t * 2)) % 2]!, role);
      }
    }
    if (indoor) return;
    falling(ctx, t, 110, 3, (c, r, v) => {
      if (r > FLAG_ROW && g.isEmpty(c, r)) g.set(c, r, CONFETTI[Math.floor(v * CONFETTI.length)]!, FESTIVE[Math.floor(v * 97) % FESTIVE.length]!);
    });
  },
};
