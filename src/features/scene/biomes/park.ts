import { hash2 } from '../../../shared/rng';
import { parsePropArt } from '../../../shared/render/prop-art';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import { drawClouds, paintGround, paintSky, paintSmoothRidge, ridgeLine, twinkle, type BiomeCtx } from './layers';
import type { BiomeDef } from './types';

const TREES = [
  ['   .@@@.   ', ' .@@@@@@@. ', '@@@@@@@@@@@', " '@@@@@@@' ", '    |||    ', '    |||    '],
  ['  .@@.  ', '.@@@@@@.', "'@@@@@@'", '   ||   ', '   ||   '],
  ['    .@.    ', '  .@@@@@.  ', ' @@@@@@@@@ ', '@@@@@@@@@@@', "  '@@@@@'  ", '    | |    ', '    | |    '],
];
const LEAVES = '@%&8';

const LAMP_DAY = parsePropArt({ frames: [[' .-. ', ' |o| ', " '-' ", '  |  ', '  |  ', '  |  ', '  |  ', ' _|_ ']], role: 'mid' });
const LAMP_NIGHT = parsePropArt({
  frames: [[' .-. ', ' |*| ', " '-' ", '  |  ', '  |  ', '  |  ', '  |  ', ' _|_ ']],
  mask: [['     ', '  a  ', '     ', '     ', '     ', '     ', '     ', '     ']],
  roles: { a: 'accent' },
  role: 'mid',
});

function paintTree(g: AsciiGrid, kind: number, x: number, bottomRow: number, salt: number): void {
  const art = TREES[kind]!;
  const top = bottomRow - art.length + 1;
  art.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]!;
      if (ch === ' ') continue;
      if (ch === '@') g.set(x + c, top + r, LEAVES[Math.floor(hash2(x + c + salt, top + r) * LEAVES.length)]!, 'mid');
      else g.set(x + c, top + r, ch, ch === '|' ? 'dim' : 'mid');
    }
  });
}

function layout(ctx: BiomeCtx) {
  const bench = Math.round(ctx.cols * 0.5);
  return { bench, lamp: bench + 15 };
}

export const park: BiomeDef = {
  id: 'park',
  spots: (ctx) => layout(ctx),
  paint(g, ctx) {
    const { cols, rows, groundRow, seed } = ctx;
    const hills = ridgeLine(cols, groundRow * 0.66, [[rows * 0.03, 2.5, hash2(seed, 1) * 6], [rows * 0.015, 9, hash2(seed, 2) * 6]]);
    paintSky(g, ctx, { x0: 0, x1: cols, y0: 0, y1: Math.min(...hills) });
    paintSmoothRidge(g, hills, groundRow, { edge: 'dim', fill: 'faint', fillChars: '.:', density: 0.1, salt: 7 });

    const { bench, lamp } = layout(ctx);
    const blockedFrom = bench - 16, blockedTo = lamp + 8;
    let x = 2 + Math.floor(hash2(seed, 3) * 6);
    let i = 0;
    while (x < cols - 6) {
      const kind = Math.floor(hash2(seed, 10 + i) * TREES.length);
      const w = TREES[kind]![0]!.length;
      if (x + w < blockedFrom || x > blockedTo) paintTree(g, kind, x, groundRow - 1, seed + i);
      x += w + 6 + Math.floor(hash2(seed, 40 + i) * 14);
      i++;
    }

    paintGround(g, ctx, { line: '_', lineRole: 'mid', texture: ".,'", density: 0.16, role: 'dim', salt: 8 });
    const lampArt = ctx.tod === 'day' ? LAMP_DAY : LAMP_NIGHT;
    g.blit(lampArt, lamp - 2, groundRow - lampArt.h + 1);
    if (ctx.tod !== 'day') {
      const headRow = groundRow - lampArt.h + 2;
      for (const [dx, dy] of [[-3, 0], [3, 0], [-2, -1], [2, -1], [-2, 1], [2, 1], [0, -2]] as const) {
        if (g.isEmpty(lamp + dx, headRow + dy)) g.set(lamp + dx, headRow + dy, '.', 'accent');
      }
    }
  },
  animate(g, ctx, t) {
    const hillsTop = Math.round(ctx.groundRow * 0.66 - ctx.rows * 0.045);
    const area = { x0: 0, x1: ctx.cols, y0: 0, y1: hillsTop - 1 };
    twinkle(g, ctx, area, t);
    drawClouds(g, ctx, { ...area, y0: 1, y1: Math.min(area.y1, Math.round(ctx.groundRow * 0.4)) }, t);
  },
};
