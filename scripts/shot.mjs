// Quick screenshot helper: node scripts/shot.mjs "<query>" <out.png> [waitMs] [width] [height]
// Expects a server on BASE (default http://localhost:5173). Uses the system Edge/Chrome.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [query = '', out = 'artifacts/shot.png', wait = '1500', width = '1280', height = '720'] = process.argv.slice(2);
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
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?${query}`);
await page.waitForTimeout(Number(wait));
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log(JSON.stringify({ out, errors }));
await browser.close();
