import { hash2 } from '../../../shared/rng';
import { parsePropArt } from '../../../shared/render/prop-art';
import type { SeasonDecor } from './decor';
import { groundSlots } from './decor';

const PUMPKIN = parsePropArt({
  frames: [['  )  ', '(o^o)']],
  mask: [['  s  ', '     ']],
  roles: { s: 'green' },
  role: 'gold',
});

const BAT = ['^v^', '-v-'];

/** Pumpkins on the ground; bats crossing the sky. */
export const halloween: SeasonDecor = {
  paint(g, ctx, keepClear) {
    const count = Math.max(2, Math.round(ctx.cols / 45));
    for (const x of groundSlots(ctx, keepClear, PUMPKIN.w, count, 101)) g.blit(PUMPKIN, x, ctx.groundRow - PUMPKIN.h);
  },
  animate(g, ctx, t, indoor) {
    if (indoor) return;
    const sky = Math.max(3, Math.round(ctx.groundRow * 0.35));
    const span = ctx.cols + 20;
    const bats = Math.max(2, Math.round(ctx.cols / 70));
    for (let i = 0; i < bats; i++) {
      const speed = 3 + hash2(i, ctx.seed + 7) * 4;
      const x = Math.floor((hash2(i, ctx.seed + 8) * span + t * speed) % span) - 10;
      const y = 1 + Math.floor(hash2(i, ctx.seed + 9) * (sky - 2) + Math.sin(t * 1.3 + i) * 1.2);
      const wing = BAT[Math.floor(t * 4 + i) % 2]!;
      for (let k = 0; k < wing.length; k++) if (g.isEmpty(x + k, y)) g.set(x + k, y, wing[k]!, 'ink');
    }
  },
};
