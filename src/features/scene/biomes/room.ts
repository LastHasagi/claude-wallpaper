import { clamp } from '../../../shared/geometry';
import { hash2 } from '../../../shared/rng';
import { parsePropArt } from '../../../shared/render/prop-art';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import { drawClouds, paintSky, twinkle, type BiomeCtx } from './layers';
import type { BiomeDef } from './types';

const POSTER = parsePropArt({
  frames: [[".---------.", '| > _     |', '|         |', "'---------'"]],
  mask: [['           ', '  aaa      ', '           ', '           ']],
  roles: { a: 'accent' },
  role: 'mid',
});
const PLANT = parsePropArt({ frames: [[' \\|/ ', '  |  ', ' (_) ']], role: 'mid', solidInterior: false });

function layout(ctx: BiomeCtx) {
  const { cols, groundRow } = ctx;
  const win = {
    x: Math.round(cols * 0.08),
    y: 2,
    w: clamp(Math.round(cols * 0.3), 22, 64),
    h: clamp(Math.round(groundRow * 0.5), 7, 18),
  };
  const shelfW = clamp(Math.round(cols * 0.2), 16, 36);
  const shelf = { x: Math.min(cols - shelfW - 2, Math.round(cols * 0.68)), y: Math.max(win.y + 4, Math.round(groundRow * 0.42)), w: shelfW };
  return { win, shelf, desk: Math.round(cols * 0.44) };
}

function paintWindow(g: AsciiGrid, ctx: BiomeCtx, win: { x: number; y: number; w: number; h: number }): void {
  const { x, y, w, h } = win;
  const inner = { x0: x + 1, x1: x + w - 1, y0: y + 1, y1: y + h - 1 };
  g.fillRect(inner.x0, inner.y0, inner.x1 - inner.x0, inner.y1 - inner.y0, ' ', 'bg');
  paintSky(g, { ...ctx, seed: ctx.seed + 99 }, inner);
  // Skyline along the bottom of the window.
  let bx = inner.x0;
  let i = 0;
  while (bx < inner.x1 - 1) {
    const bw = 3 + Math.floor(hash2(ctx.seed, 200 + i) * 5);
    const bh = 2 + Math.floor(hash2(ctx.seed, 300 + i) * Math.max(1, (inner.y1 - inner.y0) * 0.55));
    const top = inner.y1 - bh;
    for (let c = bx; c < Math.min(bx + bw, inner.x1); c++) {
      for (let r = top; r < inner.y1; r++) {
        const edge = c === bx || c === bx + bw - 1;
        if (r === top) g.set(c, r, '_', 'dim');
        else if (edge) g.set(c, r, '|', 'dim');
        else {
          const lit = hash2(c * 31 + ctx.seed, r * 7) < (ctx.tod === 'day' ? 0 : 0.35);
          const win = (c - bx) % 2 === 1 && (r - top) % 2 === 1;
          g.set(c, r, win ? (lit ? 'o' : '.') : ' ', win ? (lit ? 'accent' : 'faint') : 'bg');
        }
      }
    }
    bx += bw + (hash2(ctx.seed, 400 + i) < 0.3 ? 1 : 0);
    i++;
  }
  // Frame with a cross bar.
  const midX = x + Math.floor(w / 2), midY = y + Math.floor(h / 2);
  for (let c = x; c < x + w; c++) {
    g.set(c, y, '-', 'strong');
    g.set(c, y + h - 1, '-', 'strong');
    g.set(c, midY, '-', 'strong');
  }
  for (let r = y; r < y + h; r++) {
    g.set(x, r, '|', 'strong');
    g.set(x + w - 1, r, '|', 'strong');
    g.set(midX, r, '|', 'strong');
  }
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1], [midX, midY], [midX, y], [midX, y + h - 1], [x, midY], [x + w - 1, midY]] as const) {
    g.set(cx, cy, '+', 'strong');
  }
  for (let c = x - 1; c <= x + w; c++) g.set(c, y + h, '=', 'mid'); // sill
}

function paintShelf(g: AsciiGrid, ctx: BiomeCtx, shelf: { x: number; y: number; w: number }): void {
  for (let c = shelf.x; c < shelf.x + shelf.w; c++) g.set(c, shelf.y, '=', 'mid');
  g.set(shelf.x + 1, shelf.y + 1, '|', 'dim');
  g.set(shelf.x + shelf.w - 2, shelf.y + 1, '|', 'dim');
  let c = shelf.x + 1;
  let i = 0;
  const stop = shelf.x + shelf.w - 6;
  while (c < stop) {
    const h = 2 + (hash2(ctx.seed, 500 + i) < 0.5 ? 1 : 0);
    const kind = Math.floor(hash2(ctx.seed, 600 + i) * 4);
    const ch = ['|', 'I', '#', 'H'][kind]!;
    for (let r = 1; r <= h; r++) g.set(c, shelf.y - r, ch, i % 2 ? 'mid' : 'dim');
    c += 1 + (hash2(ctx.seed, 700 + i) < 0.25 ? 1 : 0);
    i++;
  }
  g.blit(PLANT, shelf.x + shelf.w - 6, shelf.y - PLANT.h);
}

export const room: BiomeDef = {
  id: 'room',
  indoor: true,
  spots: (ctx) => ({ desk: layout(ctx).desk }),
  paint(g, ctx) {
    const { cols, groundRow } = ctx;
    for (let r = 0; r < groundRow; r++) {
      for (let c = 0; c < cols; c++) if (c % 12 === 6 && r % 2 === 0) g.set(c, r, ':', 'faint');
    }
    const { win, shelf } = layout(ctx);
    paintWindow(g, ctx, win);
    paintShelf(g, ctx, shelf);
    const posterX = Math.round((win.x + win.w + shelf.x) / 2) - Math.floor(POSTER.w / 2);
    if (posterX > win.x + win.w + 2 && posterX + POSTER.w < shelf.x - 2) g.blit(POSTER, posterX, win.y + 2);
    for (let c = 0; c < cols; c++) g.set(c, groundRow, '_', 'mid');
    for (let r = groundRow + 1; r < g.rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((c + (r - groundRow) * 7) % 16 === 0) g.set(c, r, '|', 'faint');
        else if ((r - groundRow) % 2 === 0 && hash2(c, r + ctx.seed) < 0.05) g.set(c, r, '.', 'faint');
      }
    }
  },
  animate(g, ctx, t) {
    const { win } = layout(ctx);
    const inner = { x0: win.x + 1, x1: win.x + win.w - 1, y0: win.y + 1, y1: win.y + Math.floor(win.h / 2) };
    twinkle(g, { ...ctx, seed: ctx.seed + 99 }, inner, t);
    if (ctx.tod !== 'night') drawCloudsClipped(g, ctx, inner, win, t);
  },
};

/** Clouds inside the window panes only (cells outside are restored afterwards). */
function drawCloudsClipped(g: AsciiGrid, ctx: BiomeCtx, inner: { x0: number; x1: number; y0: number; y1: number }, win: { x: number; y: number; w: number; h: number }, t: number): void {
  const before = g.clone();
  drawClouds(g, ctx, inner, t * 0.6);
  const midX = win.x + Math.floor(win.w / 2);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const inside = c >= inner.x0 && c < inner.x1 && r >= inner.y0 && r < inner.y1 && c !== midX;
      if (!inside) {
        const cell = before.get(c, r)!;
        g.set(c, r, cell.ch, cell.role);
      }
    }
  }
}
