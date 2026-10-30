import type { Bus } from '../../../shared/events';
import type { Lang } from '../../../shared/i18n';
import type { ColorRole } from '../../../shared/render/roles';
import type { Rng } from '../../../shared/rng';
import type { Clock } from '../../../shared/time';
import type { DisplayMode } from '../../../host/host';
import { AbortError, isAbort, type ClawdApi } from '../../clawd/index';
import type { SceneApi } from '../../scene/index';
import { MISSIONS } from '../catalog';
import { DirectorModel, missionLabel, nextIdleDelay, pickMission } from '../model/director-model';
import type { Frequency, MissionContext, MissionDef, MissionId } from '../model/mission-types';
import { TerminalModel } from '../model/terminal-model';

export interface MissionEvents {
  'mission:started': { id: MissionId };
  'mission:finished': { id: MissionId; ok: boolean };
}

export interface DirectorDeps {
  clawd: ClawdApi;
  scene: SceneApi;
  bus: Bus<MissionEvents>;
  rng: Rng;
  clock: Clock;
  mode: DisplayMode;
  lang(): Lang;
  frequency(): Frequency;
  /** Runs after each mission (e.g. delivering a curiosity note). */
  afterMission?(topic: string, signal: AbortSignal): Promise<void>;
  missions?: readonly MissionDef[];
}

interface Timer {
  left: number;
  resolve: () => void;
  reject: (e: Error) => void;
}

/**
 * Schedules missions: free time → walk off → scene change → walk in → mission script →
 * optional note → free time. A failing script is blacklisted for the session; the pet goes on.
 */
export class Director {
  readonly model = new DirectorModel();
  readonly terminal = new TerminalModel();
  private timers: Timer[] = [];
  private abort: AbortController | null = null;
  private readonly missions: readonly MissionDef[];

  constructor(private readonly d: DirectorDeps) {
    this.missions = d.missions ?? MISSIONS;
    this.model.idleLeft = nextIdleDelay(d.frequency(), d.rng) * 0.35;
  }

  update(dt: number): void {
    this.terminal.tick(dt);
    for (const t of [...this.timers]) {
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(this.timers.indexOf(t), 1);
        t.resolve();
      }
    }
    if (this.model.phase !== 'idle') return;
    this.model.idleLeft -= dt;
    if (this.model.idleLeft <= 0) void this.start();
  }

  /** Starts a mission now (a specific one, or a weighted pick). Ignored if one is running. */
  async start(id?: MissionId): Promise<void> {
    if (this.model.phase !== 'idle') return;
    const def = id
      ? this.missions.find((m) => m.id === id) ?? null
      : pickMission(this.missions, this.model.recent, this.model.blacklist, this.d.clock.hour(), this.d.rng);
    if (!def) {
      this.model.idleLeft = nextIdleDelay(this.d.frequency(), this.d.rng);
      return;
    }
    await this.run(def);
  }

  /** Aborts the running mission (if any); cleanup puts Clawd back to free time. */
  stop(): void {
    this.abort?.abort();
  }

  private wait(seconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new AbortError());
    return new Promise((resolve, reject) => {
      const timer: Timer = { left: seconds, resolve, reject };
      this.timers.push(timer);
      signal.addEventListener('abort', () => {
        const i = this.timers.indexOf(timer);
        if (i >= 0) this.timers.splice(i, 1);
        reject(new AbortError());
      }, { once: true });
    });
  }

  private context(signal: AbortSignal): MissionContext {
    const { clawd, scene, rng } = this.d;
    const guard = <T>(p: Promise<T>): Promise<T> => {
      if (signal.aborted) return Promise.reject(new AbortError());
      return new Promise<T>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new AbortError()), { once: true });
        p.then(resolve, reject);
      });
    };
    // Every awaited call is tied to the abort signal so a stopped mission unwinds promptly.
    const guardedClawd: ClawdApi = {
      walkTo: (x, o) => clawd.walkTo(x, { ...o, signal }),
      runTo: (x, o) => clawd.runTo(x, { ...o, signal }),
      play: (pose, o) => clawd.play(pose, { ...o, signal }),
      wait: (s) => clawd.wait(s, signal),
      hopTo: (e) => clawd.hopTo(e, signal),
      jump: () => clawd.jump(signal),
      hold: (i) => clawd.hold(i),
      setHeldFrame: (f) => clawd.setHeldFrame(f),
      setEyes: (e) => clawd.setEyes(e),
      lookAt: (p) => clawd.lookAt(p),
      emote: (t, s) => clawd.emote(t, s),
      face: (dir) => clawd.face(dir),
      placeAt: (x) => clawd.placeAt(x),
      x: () => clawd.x(),
      bounds: () => clawd.bounds(),
      bodyWidth: () => clawd.bodyWidth(),
      setAutonomy: (on) => clawd.setAutonomy(on),
      busy: () => clawd.busy(),
      cancel: () => clawd.cancel(),
    };
    const guardedScene: SceneApi = {
      setBiome: (b, s) => guard(scene.setBiome(b, s)),
      showProp: (id, art, col, o) => guard(scene.showProp(id, art, col, o)),
      hideProp: (id) => guard(scene.hideProp(id)),
      hideAllProps: () => guard(scene.hideAllProps()),
      birds: (dir, row) => guard(scene.birds(dir, row)),
      biome: () => scene.biome(),
      timeOfDay: () => scene.timeOfDay(),
      setPropFrame: (id, f) => scene.setPropFrame(id, f),
      propTopRow: (id) => scene.propTopRow(id),
      propSurface: (id, row) => scene.propSurface(id, row),
      startEffect: (id, k, c, r) => scene.startEffect(id, k, c, r),
      stopEffect: (id) => scene.stopEffect(id),
      setLabel: (t) => scene.setLabel(t),
      spot: (n) => scene.spot(n),
      panelAt: (x) => scene.panelAt(x),
      layout: () => scene.layout(),
      colToX: (c) => scene.colToX(c),
      xToCol: (x) => scene.xToCol(x),
      rowToY: (r) => scene.rowToY(r),
    };
    return {
      clawd: guardedClawd,
      scene: guardedScene,
      terminal: {
        type: (text: string, role: ColorRole = 'ink') => guard(this.terminal.type(text, role)),
        clear: () => this.terminal.clear(),
      },
      rng: rng.fork(this.model.completed + 1),
      lang: this.d.lang(),
      signal,
      wait: (s) => this.wait(s, signal),
      surface: (propId, artRow) => {
        const s = scene.propSurface(propId, artRow);
        if (s === null) throw new Error(`surface(): prop "${propId}" is not shown`);
        return s;
      },
    };
  }

  private async run(def: MissionDef): Promise<void> {
    const { clawd, scene, bus } = this.d;
    const abort = (this.abort = new AbortController());
    const signal = abort.signal;
    const ctx = this.context(signal);
    this.model.begin(def.id);
    bus.emit('mission:started', { id: def.id });
    clawd.setAutonomy(false);
    let ok = false;
    try {
      const bw = clawd.bodyWidth();
      const width = scene.layout().cols * scene.layout().cellW;
      if (this.d.mode === 'full') {
        await ctx.clawd.hopTo(0);
        await ctx.clawd.walkTo(width + bw, { speed: 1.4 });
        scene.setLabel(null);
        this.model.phase = 'transitioning';
        await ctx.scene.hideAllProps();
        await ctx.scene.setBiome(def.biome);
        scene.setLabel(missionLabel(def, this.d.lang()));
        this.model.phase = 'entering';
        clawd.placeAt(-bw);
        clawd.face(1);
      } else {
        await ctx.scene.hideAllProps();
        await ctx.scene.setBiome(def.biome);
      }
      this.model.phase = 'running';
      await def.run(ctx);
      this.model.phase = 'noting';
      if (this.d.afterMission) await this.d.afterMission(def.noteTopic, signal);
      ok = true;
    } catch (err) {
      if (!isAbort(err)) {
        console.error(`[missions] "${def.id}" failed; disabled for this session`, err);
        this.model.blacklist.add(def.id);
      }
    } finally {
      this.cleanup(ok);
      this.abort = null;
      this.model.finish(nextIdleDelay(this.d.frequency(), this.d.rng));
      bus.emit('mission:finished', { id: def.id, ok });
    }
  }

  private cleanup(ok: boolean): void {
    const { clawd } = this.d;
    this.terminal.clear();
    this.d.scene.stopEffect('steam');
    for (const t of this.timers.splice(0)) t.reject(new AbortError());
    if (!ok) {
      clawd.cancel();
      const l = this.d.scene.layout();
      const x = clawd.x();
      const maxX = l.cols * l.cellW;
      if (x < 0 || x > maxX) clawd.placeAt(Math.min(Math.max(x, clawd.bodyWidth()), maxX - clawd.bodyWidth()));
    }
    clawd.hold(null);
    clawd.setEyes('open');
    clawd.setAutonomy(true);
  }
}
