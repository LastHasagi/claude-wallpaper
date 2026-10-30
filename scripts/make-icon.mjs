// Renders Clawd's idle sprite (straight from the engine's sprite data) into a 1024×1024 PNG.
//   node scripts/make-icon.mjs [out=artifacts/icon.png]
// Then: npx tauri icon artifacts/icon.png
import { createServer } from 'vite';
import { encodePng } from './png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const out = process.argv[2] ?? 'artifacts/icon.png';
const SIZE = 1024;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { POSES } = await vite.ssrLoadModule('/src/features/clawd/sprites/body.ts');
const { EYES } = await vite.ssrLoadModule('/src/features/clawd/sprites/eyes.ts');
await vite.close();

const frame = POSES.idle.frames[0];
const body = frame.sprite;
// Compose body + eyes into one 36×22 colour grid.
const grid = body.pixels.slice();
const eyes = EYES.open;
for (let y = 0; y < eyes.h; y++) {
  for (let x = 0; x < eyes.w; x++) {
    const c = eyes.pixels[y * eyes.w + x];
    if (c) grid[(frame.eyes.y + y) * body.w + frame.eyes.x + x] = c;
  }
}

// Fit the sprite into the square with a margin, nearest-neighbour scaling.
const scale = Math.floor((SIZE * 0.9) / body.w);
const ox = Math.floor((SIZE - body.w * scale) / 2);
const oy = Math.floor((SIZE - body.h * scale) / 2);
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < body.h; y++) {
  for (let x = 0; x < body.w; x++) {
    const c = grid[y * body.w + x];
    if (!c) continue;
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    for (let yy = 0; yy < scale; yy++) {
      for (let xx = 0; xx < scale; xx++) {
        const i = ((oy + y * scale + yy) * SIZE + ox + x * scale + xx) * 4;
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
      }
    }
  }
}

const png = encodePng(rgba, SIZE, SIZE);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
