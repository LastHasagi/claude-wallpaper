// Renders every Clawd cursor frame on light and dark tiles into a PNG (docs/media/clawd-cursors.png
// by default), to check the pixel art without installing the cursors. With a third argument, also
// writes the .cur/.ani files Windows would load into that folder.
//
//   node scripts/cursor-sheet.mjs [out.png] [scale] [files-dir]
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { encodePng } from './png.mjs';

const out = process.argv[2] ?? 'docs/media/clawd-cursors.png';
const scale = Number(process.argv[3] ?? 4);
const filesDir = process.argv[4];

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { CLAWD_CURSOR_LIST, SYSTEM_ARROW } = await vite.ssrLoadModule('/src/features/cursor/sprites/cursors.ts');
const { spriteRgba } = await vite.ssrLoadModule('/src/shared/render/sprite.ts');
const { CURSOR_GRID } = await vite.ssrLoadModule('/src/shared/cursor.ts');
const { cursorFile } = await vite.ssrLoadModule('/src/host/cursor-files.ts');
await vite.close();

if (filesDir) {
  for (const art of CLAWD_CURSOR_LIST) {
    const f = cursorFile(art);
    writeFileSync(join(filesDir, `${art.kind}.${f.ext}`), f.bytes);
    console.log(`${art.kind}.${f.ext} ${f.bytes.length} bytes`);
  }
}

const rows = [{ frames: [SYSTEM_ARROW] }, ...CLAWD_CURSOR_LIST];
const tile = CURSOR_GRID * scale, pad = 6;
const cols = Math.max(...rows.map((r) => r.frames.length));
const W = pad + cols * 2 * (tile + pad) + pad;
const H = pad + rows.length * (tile + pad);
const img = new Uint8ClampedArray(W * H * 4);
const fill = (x, y, w, h, [r, g, b]) => {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) img.set([r, g, b, 255], (yy * W + xx) * 4);
};
fill(0, 0, W, H, [90, 90, 96]);

rows.forEach((row, ri) => {
  row.frames.forEach((frame, fi) => {
    const px = spriteRgba(frame, scale);
    [[240, 238, 230], [20, 20, 19]].forEach((bg, side) => {
      const ox = pad + (side * cols + fi) * (tile + pad), oy = pad + ri * (tile + pad);
      fill(ox, oy, tile, tile, bg);
      for (let i = 0; i < tile * tile; i++) {
        if (px[i * 4 + 3] === 0) continue;
        const x = ox + (i % tile), y = oy + Math.floor(i / tile);
        img.set(px.subarray(i * 4, i * 4 + 4), (y * W + x) * 4);
      }
    });
  });
});

writeFileSync(out, encodePng(img, W, H));
console.log(`${out} (${W}x${H})`);
