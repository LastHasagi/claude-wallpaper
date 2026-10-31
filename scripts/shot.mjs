// Screenshot sequence: node scripts/shot.mjs "<query>" <outPrefix> [times=1500] [width=1280] [height=720]
// `times` is a comma list of ms since page load, e.g. "1000,5000,9000" -> <outPrefix>-1000.png …
// Expects a server on BASE (default http://localhost:5173). Uses the system Edge/Chrome.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [query = '', prefix = 'artifacts/shot', times = '1500', width = '1280', height = '720'] = process.argv.slice(2);
const base = process.env.BASE ?? 'http://localhost:5173';

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      /* try next */
    }
  }
  throw new Error('No system Edge/Chrome found for playwright-core');
}

const browser = await launch();
// DPR env var emulates a scaled display (e.g. DPR=1.5 for a 4K monitor at 150%).
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const start = Date.now();
// A query starting with a page ("settings.html?x=1") opens that page instead of the engine.
await page.goto(/^[\w-]+\.html/.test(query) ? `${base}/${query}` : `${base}/?${query}`);
mkdirSync(dirname(prefix), { recursive: true });
const shots = [];
for (const t of times.split(',').map(Number)) {
  const left = t - (Date.now() - start);
  if (left > 0) await page.waitForTimeout(left);
  const out = `${prefix}-${t}.png`;
  await page.screenshot({ path: out });
  shots.push(out);
}
const debug = await page.evaluate(() => document.getElementById('debug')?.textContent ?? '');
console.log(JSON.stringify({ shots, errors, debug }, null, 1));
await browser.close();
