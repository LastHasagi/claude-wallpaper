// Records a demo GIF of the engine straight from its canvases (production build + system Edge/Chrome).
//   npm run build && node scripts/make-gif.mjs [out=docs/media/clawd-demo.gif]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import gifenc from 'gifenc';
import { encodePng } from './png.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const out = process.argv[2] ?? 'docs/media/clawd-demo.gif';
const W = 800, H = 450, FPS = 9;
const PORT = 4174;
const BASE = `http://localhost:${PORT}`;

// Each clip: which page to open and from which director phase to start/stop recording.
const CLIPS = [
  { query: 'mission=birdwatching&theme=dark&lang=pt&hour=14&notes=always&speed=2.2&seed=21', from: 'exiting', until: 'idle', tail: 2, max: 22 },
  { query: 'mission=coding&theme=dark&lang=pt&hour=22&notes=off&speed=2.2&seed=8', from: 'running', until: 'idle', tail: 0, max: 16 },
  { query: 'mission=reading-bench&theme=light&lang=pt&hour=23&notes=off&speed=3&seed=5', from: 'running', until: 'idle', tail: 0, max: 14 },
];

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      /* try next */
    }
  }
  throw new Error('No system Edge/Chrome found');
}

/** Composites the two engine canvases and returns RGBA bytes (base64). */
const grab = () =>
  new Promise((resolve) => {
    const [bg, fg] = [document.getElementById('bg'), document.getElementById('fg')];
    const c = document.createElement('canvas');
    c.width = innerWidth;
    c.height = innerHeight;
    const ctx = c.getContext('2d');
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bg, 0, 0, c.width, c.height);
    ctx.drawImage(fg, 0, 0, c.width, c.height);
    const bytes = ctx.getImageData(0, 0, c.width, c.height).data;
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    resolve(btoa(bin));
  });

try {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(BASE)).ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }
  const browser = await launch();
  const frames = [];
  const times = []; // real capture time of each frame, so playback runs at the true pace
  for (const clip of CLIPS) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?${clip.query}`);
    await page.waitForFunction(() => window.clawd?.loop?.isRunning);
    await page.waitForFunction((p) => window.clawd.director.model.phase === p, clip.from, { timeout: 60000 });
    const start = Date.now();
    let doneAt = null;
    while (Date.now() - start < clip.max * 1000) {
      const t0 = Date.now();
      frames.push(Buffer.from(await page.evaluate(grab), 'base64'));
      times.push(t0);
      const phase = await page.evaluate(() => window.clawd.director.model.phase);
      if (phase === clip.until && doneAt === null) doneAt = Date.now();
      if (doneAt !== null && Date.now() - doneAt >= clip.tail * 1000) break;
      await sleep(Math.max(0, 1000 / FPS - (Date.now() - t0)));
    }
    console.log(`clip ${clip.query.split('&')[0]}: ${frames.length} frames so far`);
    await page.close();
  }
  await browser.close();

  // One global palette from a sample of frames keeps colours stable across the whole GIF.
  const sampleEvery = Math.max(1, Math.floor(frames.length / 12));
  const sample = Buffer.concat(frames.filter((_, i) => i % sampleEvery === 0));
  const palette = quantize(new Uint8Array(sample), 256);
  const gif = GIFEncoder();
  frames.forEach((rgba, i) => {
    const index = applyPalette(new Uint8Array(rgba), palette);
    // Gaps between clips (page loads) are capped so cuts stay snappy.
    const gap = (times[i + 1] ?? times[i] + 1000 / FPS) - times[i];
    const delay = Math.min(Math.max(gap, 60), 250);
    gif.writeFrame(index, W, H, { palette: i === 0 ? palette : undefined, delay });
  });
  // A few stills for review.
  mkdirSync('artifacts/gif-frames', { recursive: true });
  for (const k of [0.05, 0.2, 0.3, 0.45, 0.6, 0.75, 0.9]) {
    const i = Math.floor(frames.length * k);
    writeFileSync(`artifacts/gif-frames/f${String(i).padStart(3, '0')}.png`, encodePng(new Uint8Array(frames[i]), W, H));
  }
  const span = (times.at(-1) - times[0]) / 1000;
  console.log(`capture: ${frames.length} frames over ${span.toFixed(1)}s (~${(frames.length / span).toFixed(1)} fps effective)`);
  gif.finish();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, gif.bytes());
  console.log(`wrote ${out}: ${frames.length} frames, ${(gif.bytes().length / 1e6).toFixed(2)} MB`);
} finally {
  server.kill();
}
