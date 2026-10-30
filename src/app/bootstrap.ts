import { EventBus } from '../shared/events';
import { createRng, randomSeed } from '../shared/rng';
import { fixedClock, systemClock } from '../shared/time';
import { CanvasBackend } from '../shared/render/canvas-backend';
import { PALETTES } from '../shared/render/roles';
import type { HostAdapter } from '../host/host';
import { ClawdController, ClawdView, type ClawdEvents } from '../features/clawd';
import { Director, MISSIONS, TerminalView, missionLabel, type MissionEvents, type MissionId } from '../features/missions';
import { FACTS, NotePicker, NotesController, NoteView, type NotesEvents } from '../features/notes';
import { SceneController } from '../features/scene';
import { SettingsController, overridesFromParams, type Settings, type SettingsEvents } from '../features/settings';
import { FrameStats } from './debug';
import { GameLoop } from './game-loop';

type AppEvents = SettingsEvents & ClawdEvents & MissionEvents & NotesEvents;

/** Sprite width in grid cells for each size setting. */
const SIZE_CELLS = { S: 8, M: 12, L: 16 } as const;

export function bootstrap(host: HostAdapter, params: URLSearchParams, doc: Document) {
  const win = doc.defaultView!;
  const bus = new EventBus<AppEvents>();
  const env = { systemLanguage: host.systemLanguage(), prefersDark: host.systemPrefersDark() };
  const settings = new SettingsController(host.storage, bus, env, overridesFromParams(params));
  const seed = params.has('seed') ? Number(params.get('seed')) : randomSeed();
  const rng = createRng(seed);
  const clock = params.has('hour') ? fixedClock(Number(params.get('hour'))) : systemClock;
  const debug = params.has('debug');

  const backend = new CanvasBackend(
    doc.getElementById('bg') as HTMLCanvasElement,
    doc.getElementById('fg') as HTMLCanvasElement,
    PALETTES[settings.resolved().theme],
  );
  backend.setOpaque(host.mode === 'full');

  const seeds = rng.fork(2);
  const scene = new SceneController(clock, host.mode, () => seeds.int(1, 2 ** 30));
  const clawd = new ClawdController(bus, rng.fork(1), clock);
  const lang = () => settings.resolved().lang;
  const notes = new NotesController({
    clawd,
    scene,
    bus,
    mode: host.mode,
    picker: new NotePicker(FACTS, host.storage, rng.fork(3)),
    rng: rng.fork(4),
    lang,
    setting: () => settings.get().notes,
    metrics: () => backend.metrics,
  });
  const director = new Director({
    clawd,
    scene,
    bus,
    rng: rng.fork(5),
    clock,
    mode: host.mode,
    lang,
    frequency: () => settings.get().missionFrequency,
    afterMission: (topic, signal) => notes.maybeDeliver(topic, signal),
  });
  const views = { clawd: new ClawdView(), note: new NoteView(), terminal: new TerminalView() };

  function applyTheme(): void {
    const theme = settings.resolved().theme;
    backend.setTheme(PALETTES[theme]);
    doc.body.classList.toggle('full', host.mode === 'full');
    doc.body.classList.toggle('light', theme === 'light');
    doc.body.classList.toggle('overlay-preview', host.fakeDesktop === true);
  }

  function layout(): void {
    const m = backend.resize(win.innerWidth, win.innerHeight, win.devicePixelRatio || 1);
    const l = scene.resize(m.cols, m.rows, m.cellW, m.cellH, m.cssH, host.groundInset(), host.segments?.() ?? []);
    const dev = Math.max(1, Math.round(((m.cellW * SIZE_CELLS[settings.get().size]) / 36) * m.dpr));
    const scale = dev / m.dpr;
    const margin = 18 * scale;
    clawd.setStage({ minX: margin, maxX: m.cssW - margin, groundY: l.groundY, scale, floors: scene.floors() });
  }

  applyTheme();
  layout();
  win.addEventListener('resize', layout);

  host.languageChanged?.(lang());
  host.onExternalSettings?.((patch) => settings.set(patch as Partial<Settings>));

  bus.on('settings:changed', ({ changed, resolved }) => {
    if (changed.includes('language')) host.languageChanged?.(resolved.lang);
    if (changed.includes('theme')) applyTheme();
    if (changed.includes('size')) layout();
    if (changed.includes('fps')) loop.fps = resolved.fps;
    if (changed.includes('language') && director.model.current) {
      const def = MISSIONS.find((d) => d.id === director.model.current)!;
      scene.setLabel(missionLabel(def, resolved.lang));
    }
  });

  host.cursor.subscribe((e) => {
    if (notes.onCursor(e)) return;
    clawd.onCursor(e);
  });

  const stats = new FrameStats();
  const debugEl = doc.getElementById('debug');
  let debugRefresh = 0;

  const loop = new GameLoop({
    update: (dt) => {
      const t0 = performance.now();
      director.update(dt);
      clawd.update(dt);
      scene.update(dt);
      notes.update(dt);
      stats.addUpdate(performance.now() - t0);
    },
    render: () => {
      const t0 = performance.now();
      const cells = backend.presentGrid(scene.compose());
      backend.beginFg();
      views.note.draw(backend, notes.model, lang());
      views.clawd.draw(backend, clawd.model);
      views.terminal.draw(backend, director.terminal, clawd.bounds());
      const rects = [clawd.bounds(), ...notes.interactiveRects()];
      host.setInteractiveRects(rects);
      if (debug) for (const r of rects) backend.strokeRect(r.x, r.y, r.w, r.h, '#ff3b6b');
      stats.addRender(performance.now() - t0, cells);
      if (debug && debugEl && performance.now() > debugRefresh) {
        debugRefresh = performance.now() + 250;
        const s = stats.snapshot, m = backend.metrics, d = director.model;
        debugEl.hidden = false;
        debugEl.textContent = [
          `fps ${s.fps.toFixed(1)}  update ${s.updateMs.toFixed(2)}ms  render ${s.renderMs.toFixed(2)}ms`,
          `cells/frame ${s.cells.toFixed(0)}  grid ${m.cols}x${m.rows}  cell ${m.cellW.toFixed(1)}x${m.cellH.toFixed(1)}`,
          `mode ${host.mode}  theme ${settings.resolved().theme}  lang ${lang()}  seed ${seed}`,
          `director ${d.phase}${d.current ? ` (${d.current})` : ''}  next in ${Math.max(0, d.idleLeft).toFixed(0)}s  done ${d.completed}`,
          `clawd ${clawd.model.pose}  action ${clawd.queue.current()?.name ?? '-'}  auto ${clawd.brain.autonomous}`,
          `biome ${scene.biome()}  tod ${scene.timeOfDay()}  note ${notes.model.note?.fact.id ?? '-'}`,
          `keys: M missão · N bilhete · T tema · L idioma`,
        ].join('\n');
      }
    },
  });
  loop.timeScale = params.has('speed') ? Number(params.get('speed')) : 1;
  loop.fps = settings.get().fps;
  loop.start();
  doc.addEventListener('visibilitychange', () => (doc.hidden ? loop.stop() : loop.start()));

  if (debug) {
    win.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'm') {
        if (director.model.phase === 'idle') void director.start();
        else director.stop();
      } else if (key === 'n') {
        if (!clawd.busy()) void notes.deliver('general').catch(() => {});
      } else if (key === 't') {
        settings.set({ theme: settings.resolved().theme === 'dark' ? 'light' : 'dark' });
      } else if (key === 'l') {
        settings.set({ language: lang() === 'pt' ? 'en' : 'pt' });
      }
    });
  }

  const forced = params.get('mission') as MissionId | null;
  if (forced && MISSIONS.some((m) => m.id === forced)) void director.start(forced);

  return { bus, settings, clawd, scene, director, notes, loop, backend, seed };
}
