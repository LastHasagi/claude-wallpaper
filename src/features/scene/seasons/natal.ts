import { parsePropArt } from '../../../shared/render/prop-art';
import type { SeasonDecor } from './decor';
import { falling, FESTIVE, groundSlots } from './decor';

const TREE = parsePropArt({
  frames: [['   *   ', '  /_\\  ', ' /_ _\\ ', '  /_\\  ', ' /___\\ ', '/_____\\', '  |_|  ']],
  mask: [['   s   ', '       ', '       ', '       ', '       ', '       ', '  ttt  ']],
  roles: { s: 'gold', t: 'dim' },
  role: 'green',
});

/** Spacing of the string of lights along the ground line. */
const LIGHT_EVERY = 4;

/** Christmas trees, a string of blinking lights along the ground and (outdoors) falling snow. */
export const natal: SeasonDecor = {
  paint(g, ctx, keepClear) {
    const count = Math.max(1, Math.round(ctx.cols / 90));
    for (const x of groundSlots(ctx, keepClear, TREE.w, count, 202)) g.blit(TREE, x, ctx.groundRow - TREE.h);
  },
  animate(g, ctx, t, indoor) {
    const tick = Math.floor(t);
    for (let c = 1; c < ctx.cols; c += LIGHT_EVERY) {
      g.set(c, ctx.groundRow, 'o', FESTIVE[(c / LIGHT_EVERY + tick) % FESTIVE.length | 0]!);
    }
    if (indoor) return;
    falling(ctx, t, 140, 2.2, (c, r, v) => {
      if (g.isEmpty(c, r)) g.set(c, r, v < 0.3 ? '*' : '.', v < 0.5 ? 'strong' : 'mid');
    });
  },
};
