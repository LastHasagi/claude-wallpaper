import { EventBus } from '../shared/events';
import { createRng, randomSeed } from '../shared/rng';
import { fixedClock, systemClock } from '../shared/time';
import { AsciiGrid } from '../shared/render/ascii-grid';
import { CanvasBackend } from '../shared/render/canvas-backend';
import { PALETTES } from '../shared/render/roles';
import type { HostAdapter } from '../host/host';
import { ClawdController, ClawdView, type ClawdEvents } from '../features/clawd';
import { SettingsController, overridesFromParams, type SettingsEvents } from '../features/settings';
import { GameLoop } from './game-loop';

type AppEvents = SettingsEvents & ClawdEvents;

const SIZE_CELLS = { S: 8, M: 12, L: 16 } as const;

export function bootstrap(host: HostAdapter, params: URLSearchParams, doc: Document) {
  const bus = new EventBus<AppEvents>();
  const env = { systemLanguage: host.systemLanguage(), prefersDark: host.systemPrefersDark() };
  const settings = new SettingsController(host.storage, bus, env, overridesFromParams(params));
  const seed = params.has('seed') ? Number(params.get('seed')) : randomSeed();
  const rng = createRng(seed);
  const clock = params.has('hour') ? fixedClock(Number(params.get('hour'))) : systemClock;

  const bg = doc.getElementById('bg') as HTMLCanvasElement;
  const fg = doc.getElementById('fg') as HTMLCanvasElement;
  const backend = new CanvasBackend(bg, fg, PALETTES[settings.resolved().theme]);
  backend.setOpaque(host.mode === 'full');
  doc.body.classList.toggle('full', host.mode === 'full');
  doc.body.classList.toggle('overlay-preview', host.mode === 'overlay' && !params.has('transparent'));

  const clawd = new ClawdController(bus, rng.fork(1), clock);
  const clawdView = new ClawdView();
  let grid = new AsciiGrid(1, 1);

  function layout(): void {
    const view = doc.defaultView!;
    const m = backend.resize(view.innerWidth, view.innerHeight, view.devicePixelRatio || 1);
    grid = new AsciiGrid(m.cols, m.rows);
    const groundRow = m.rows - 4;
    const groundY = host.mode === 'full' ? (groundRow + 1) * m.cellH : m.cssH - host.groundInset();
    if (host.mode === 'full') grid.fillRect(0, groundRow, m.cols, 1, '_', 'mid');
    const dev = Math.max(1, Math.round((m.cellW * SIZE_CELLS[settings.get().size] / 36) * m.dpr));
    const scale = dev / m.dpr;
    const margin = 18 * scale;
    clawd.setStage({ minX: margin, maxX: m.cssW - margin, groundY, scale });
  }

  layout();
  doc.defaultView!.addEventListener('resize', layout);
  host.cursor.subscribe((e) => clawd.onCursor(e));

  const loop = new GameLoop({
    update: (dt) => clawd.update(dt),
    render: () => {
      backend.presentGrid(grid);
      backend.beginFg();
      clawdView.draw(backend, clawd.model);
    },
  });
  loop.timeScale = params.has('speed') ? Number(params.get('speed')) : 1;
  loop.fps = settings.get().fps;
  loop.start();
  doc.addEventListener('visibilitychange', () => (doc.hidden ? loop.stop() : loop.start()));

  return { bus, settings, clawd, loop, backend, seed };
}
