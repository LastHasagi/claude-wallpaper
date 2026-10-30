import { hash2 } from '../../../shared/rng';
import { drawClouds, paintGround, paintRidge, paintSky, paintSmoothRidge, peaksLine, ridgeLine, twinkle, type BiomeCtx } from './layers';
import type { BiomeDef } from './types';

function lines(ctx: BiomeCtx) {
  const { cols, rows, groundRow, seed } = ctx;
  const count = Math.max(3, Math.round(cols / 30));
  const far = peaksLine(cols, Math.round(groundRow * 0.66), seed, count, groundRow * 0.2, groundRow * 0.42);
  const p = (k: number) => hash2(seed, k) * Math.PI * 2;
  const near = ridgeLine(cols, groundRow * 0.78, [[rows * 0.05, 1.5, p(3)], [rows * 0.02, 4, p(4)]]).map((v) =>
    Math.min(v, groundRow - 2),
  );
  return { far, near };
}

export const mountains: BiomeDef = {
  id: 'mountains',
  spots: (ctx) => ({ lookout: Math.round(ctx.cols * 0.36) }),
  paint(g, ctx) {
    const { far, near } = lines(ctx);
    paintSky(g, ctx, { x0: 0, x1: ctx.cols, y0: 0, y1: Math.max(1, Math.min(...far)) });
    paintRidge(g, far, ctx.groundRow, { edge: 'mid', fill: 'faint', fillChars: '.:', density: 0.1, salt: 1 });
    // Snow on the higher peaks.
    const snowLine = Math.min(...far) + 2;
    for (let c = 0; c < ctx.cols; c++) {
      const top = far[c + 1]!;
      if (top <= snowLine && g.get(c, top + 1)?.role !== 'mid') g.set(c, top + 1, '*', 'dim');
    }
    paintSmoothRidge(g, near, ctx.groundRow, { edge: 'strong', fill: 'dim', fillChars: ";:.,'", density: 0.2, salt: 2 });
    paintGround(g, ctx, { line: '_', lineRole: 'mid', texture: ",'\"`.", density: 0.28, role: 'dim', salt: 3 });
  },
  animate(g, ctx, t) {
    const { far } = lines(ctx);
    const area = { x0: 0, x1: ctx.cols, y0: 0, y1: Math.min(...far) - 1 };
    twinkle(g, ctx, area, t);
    drawClouds(g, ctx, { ...area, y0: 1, y1: area.y1 - 1 }, t);
  },
};
