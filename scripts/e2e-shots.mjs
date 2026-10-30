// End-to-end validation against the production build.
//   node scripts/e2e-shots.mjs            -> matrix screenshots + click test + soak (SOAK_SECONDS, default 180)
// Writes screenshots and artifacts/e2e-report.json. Exit code 1 when any check fails.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SOAK_SECONDS = Number(process.env.SOAK_SECONDS ?? 180);
const OUT = 'artifacts/e2e';
mkdirSync(OUT, { recursive: true });

// Run Vite through node directly (no shell, no npx): safe arguments and a killable child on Windows.
const VITE = 'node_modules/vite/bin/vite.js';
execFileSync(process.execPath, [VITE, 'build', '--logLevel', 'warn'], { stdio: 'inherit' });
const server = spawn(process.execPath, [VITE, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start');
}

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      // expose-gc lets the soak test measure the heap after a real collection.
      return await chromium.launch({ channel, args: ['--js-flags=--expose-gc'] });
    } catch {
      /* try next */
    }
  }
  throw new Error('No system Edge/Chrome found');
}

const report = { matrix: [], click: null, soak: null, failures: [] };
const fail = (msg) => {
  report.failures.push(msg);
  console.error('FAIL', msg);
};

async function openPage(browser, query, viewport = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?${query}`);
  await page.waitForFunction(() => window.clawd?.loop?.isRunning);
  return { page, errors };
}

try {
  await waitForServer();
  const browser = await launch();

  // 1. Matrix: every mission in both themes and both modes, alternating languages.
  const missions = ['birdwatching', 'coding', 'reading-bench'];
  let n = 0;
  for (const mission of missions) {
    for (const theme of ['dark', 'light']) {
      for (const mode of ['full', 'overlay']) {
        const lang = n++ % 2 ? 'en' : 'pt';
        const name = `${mission}-${theme}-${mode}-${lang}`;
        const { page, errors } = await openPage(browser, `mission=${mission}&theme=${theme}&mode=${mode}&lang=${lang}&speed=4&seed=${n}&hour=${n % 2 ? 22 : 13}`);
        const result = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const e = window.clawd;
              const t0 = performance.now();
              const label = [];
              e.bus.on('mission:finished', (ev) => resolve({ ...ev, seconds: (performance.now() - t0) / 1000, label }));
              const poll = setInterval(() => {
                const text = e.scene.compose().toString();
                const m = text.match(/\[ (missão|mission) \d+: [^\]]+ \]/);
                if (m && !label.length) label.push(m[0]);
              }, 200);
              setTimeout(() => {
                clearInterval(poll);
                resolve({ ok: false, timeout: true, label });
              }, 60000);
            }),
        );
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${name}.png` });
        report.matrix.push({ name, ...result, errors });
        if (!result.ok) fail(`${name}: mission did not finish ok (${JSON.stringify(result)})`);
        if (errors.length) fail(`${name}: console errors ${JSON.stringify(errors)}`);
        if (mode === 'full' && !result.label?.[0]?.includes(lang === 'pt' ? 'missão' : 'mission')) fail(`${name}: label missing or wrong language`);
        await page.close();
      }
    }
  }

  // 2. A real mouse click on Clawd triggers a reaction.
  {
    const { page, errors } = await openPage(browser, 'theme=dark&seed=3&freq=rare');
    await page.waitForTimeout(800);
    const box = await page.evaluate(() => {
      window.__reactions = [];
      window.clawd.bus.on('clawd:reaction', (k) => window.__reactions.push(k));
      window.clawd.clawd.setAutonomy(false);
      return window.clawd.clawd.bounds();
    });
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
    await page.waitForTimeout(300);
    const reactions = await page.evaluate(() => window.__reactions);
    await page.screenshot({ path: `${OUT}/click-reaction.png` });
    report.click = { reactions, errors };
    if (!reactions.includes('laugh')) fail(`click: expected a laugh reaction, got ${JSON.stringify(reactions)}`);
    await page.close();
  }

  // 3. Soak: missions back to back with notes, 20x speed, 1080p.
  {
    const { page, errors } = await openPage(browser, 'theme=dark&freq=often&notes=always&speed=20&seed=42&debug=1', { width: 1920, height: 1080 });
    await page.evaluate(() => {
      window.__soak = { finished: 0, failed: 0, notes: 0 };
      window.clawd.bus.on('mission:finished', (e) => (e.ok ? window.__soak.finished++ : window.__soak.failed++));
      window.clawd.bus.on('note:shown', () => window.__soak.notes++);
    });
    const heap = () =>
      page.evaluate(() => {
        window.gc?.();
        return performance.memory?.usedJSHeapSize ?? 0;
      });
    await page.waitForTimeout(5000);
    const heapStart = await heap();
    const samples = [];
    for (let s = 0; s < SOAK_SECONDS; s += 10) {
      await page.waitForTimeout(10000);
      samples.push(await page.evaluate(() => document.getElementById('debug')?.textContent?.split('\n')[0] ?? ''));
    }
    const heapEnd = await heap();
    const soak = await page.evaluate(() => window.__soak);
    await page.screenshot({ path: `${OUT}/soak-end.png` });
    const renderMs = samples.map((s) => Number(s.match(/render ([\d.]+)ms/)?.[1] ?? NaN)).filter(Number.isFinite);
    report.soak = {
      realSeconds: SOAK_SECONDS,
      simulatedMinutes: (SOAK_SECONDS * 20) / 60,
      ...soak,
      errors,
      heapStartMB: +(heapStart / 1e6).toFixed(1),
      heapEndMB: +(heapEnd / 1e6).toFixed(1),
      renderMsAvg: +(renderMs.reduce((a, b) => a + b, 0) / Math.max(1, renderMs.length)).toFixed(2),
      renderMsMax: Math.max(...renderMs),
    };
    if (errors.length) fail(`soak: console errors ${JSON.stringify(errors.slice(0, 5))}`);
    if (soak.failed) fail(`soak: ${soak.failed} missions failed`);
    if (soak.finished < 5) fail(`soak: only ${soak.finished} missions finished`);
    if (heapStart && heapEnd > heapStart * 2 + 5e6) fail(`soak: heap grew from ${heapStart} to ${heapEnd}`);
    await page.close();
  }

  await browser.close();
} finally {
  writeFileSync('artifacts/e2e-report.json', JSON.stringify(report, null, 2));
  server.kill();
}

console.log(JSON.stringify({ failures: report.failures, click: report.click, soak: report.soak }, null, 2));
process.exit(report.failures.length ? 1 : 0);
