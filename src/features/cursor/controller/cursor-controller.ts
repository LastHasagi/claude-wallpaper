import { contains, dist, expand, type Point } from '../../../shared/geometry';
import type { Lang } from '../../../shared/i18n';
import type { Rng } from '../../../shared/rng';
import type { CursorCommand, CursorEvent, SystemCursorPort } from '../../../host/host';
import { isAbort, type ClawdApi } from '../../clawd/index';
import { CursorModel, heistAllowed, RULES, type CursorSetting, type Flyer } from '../model/cursor-model';
import { CLAWD_CURSOR_LIST } from '../sprites/cursors';

const SAY = {
  pt: { chomp: 'nhac!', gulp: 'glup', spit: 'ptui!' },
  en: { chomp: 'chomp!', gulp: 'gulp', spit: 'ptoo!' },
} as const;

export interface CursorDeps {
  clawd: ClawdApi;
  /** Absent where the system pointer can't be swapped: the feature stays dormant. */
  port?: SystemCursorPort;
  rng: Rng;
  setting(): CursorSetting;
  lang(): Lang;
}

/** Clawd eats the user's pointer and spits out his own; clicking him gets the old one back. */
export class CursorController {
  readonly model = new CursorModel();
  /** Asked from the tray / command line, carried out as soon as Clawd is free. */
  private pending: CursorCommand | null = null;

  constructor(private readonly d: CursorDeps) {}

  update(dt: number): void {
    const m = this.model, { clawd, port } = this.d;
    m.tick(dt);
    if (!port || clawd.busy()) return;
    if (this.pending === 'steal' && m.phase === 'normal') {
      this.pending = null;
      void this.steal();
      return;
    }
    if (m.phase === 'clawd' && (this.pending === 'return' || m.clawdFor >= RULES.keepFor)) {
      this.pending = null;
      void this.giveBack();
      return;
    }
    if (m.phase !== 'normal') return;
    const setting = this.d.setting();
    const b = clawd.bounds();
    const bodies = m.pointer ? dist(m.pointer, { x: b.x + b.w / 2, y: b.y + b.h / 2 }) / clawd.bodyWidth() : Infinity;
    if (!heistAllowed({ setting, elapsed: m.elapsed, lastHeistAt: m.lastHeistAt, restingFor: m.restingFor, rolled: m.rolled, bodies })) return;
    m.rolled = true;
    if (setting !== 'off' && clawd.pose() !== 'sleep' && this.d.rng.chance(RULES.chance[setting])) void this.steal();
  }

  /** Returns true when the event was consumed (he is eating, or a click on him asks for the pointer back). */
  onCursor(e: CursorEvent): boolean {
    const m = this.model;
    m.movePointer(e.type === 'leave' ? null : { x: e.x, y: e.y });
    if (m.phase === 'stealing' || m.phase === 'returning') return true;
    if (e.type === 'down' && m.phase === 'clawd' && contains(expand(this.d.clawd.bounds(), 4), e)) {
      void this.giveBack();
      return true;
    }
    return false;
  }

  command(cmd: CursorCommand): void {
    if (!this.d.port) return;
    const phase = this.model.phase;
    if (cmd === 'steal' && phase === 'normal') this.pending = 'steal';
    if (cmd !== 'return' || phase === 'normal') return;
    // Asked for it back while he is busy (on a mission): no waiting for the scene.
    if (phase === 'clawd' && this.d.clawd.busy()) void this.restoreNow();
    else this.pending = 'return';
  }

  /** The setting was switched off: his pointers go away at once. */
  settingChanged(setting: CursorSetting): void {
    if (setting === 'off') void this.restoreNow();
  }

  /** Puts the user's pointer back right away, without the scene (window hidden, app leaving). */
  async restoreNow(): Promise<void> {
    if (this.model.phase !== 'clawd') return; // mid-scene: the scene itself cleans up
    this.model.phase = 'normal';
    this.pending = null;
    await this.d.port?.restore().catch((err) => console.error('[cursor] restore failed', err));
  }

  private fly(f: Omit<Flyer, 't' | 'done'>): Promise<void> {
    return new Promise((resolve) => (this.model.flyer = { ...f, t: 0, done: resolve }));
  }

  /** Where he aims when the pointer is outside his window: up and to the side of his head. */
  private target(): Point {
    const { clawd } = this.d, b = clawd.bounds();
    return this.model.pointer ?? { x: clawd.x() + clawd.bodyWidth() * 2, y: b.y - clawd.bodyWidth() };
  }

  /** Sucks the real pointer in, chews, swallows and spits his own onto where the pointer is. */
  async steal(): Promise<void> {
    const { clawd, port } = this.d, m = this.model;
    if (!port || m.phase !== 'normal') return;
    m.phase = 'stealing';
    m.lastHeistAt = m.elapsed;
    clawd.setAutonomy(false); // no wandering off mid-meal; missions wait too
    clawd.forgetPointer(); // and no waving at a pointer that is about to be in his mouth
    const say = SAY[this.d.lang()], bw = clawd.bodyWidth();
    let hidden = false;
    try {
      if (!(await port.visible())) return;
      const p = this.target();
      clawd.face(p.x >= clawd.x() ? 1 : -1);
      clawd.lookAt(p);
      await clawd.play('idle', { duration: 0.6, eyes: 'wide', emote: '!' });
      const gap = p.x - clawd.x();
      if (Math.abs(gap) > bw * 1.6 && Math.abs(gap) < bw * 8) {
        await clawd.runTo(p.x - Math.sign(gap) * bw * 1.2);
        clawd.face(gap > 0 ? 1 : -1);
      }
      hidden = true;
      await port.hide();
      clawd.lookAt(null);
      const from = this.target();
      await Promise.all([
        clawd.play('inhale', { duration: 1, mouth: 'wide', eyes: 'closed' }),
        this.fly({ art: 'system', from, to: () => clawd.mouth(), duration: 0.85, arc: 0, ease: 'in', scale: [1, 0.3] }),
      ]);
      await clawd.play('chew', { duration: 1.2, eyes: 'happy', emote: say.chomp });
      await clawd.play('gulp', { duration: 0.45, emote: say.gulp });
      await Promise.all([
        clawd.play('spit', { duration: 0.6, mouth: 'o', emote: say.spit }),
        this.fly({ art: 'clawd', from: clawd.mouth(), to: () => this.target(), duration: 0.7, arc: bw * 1.2, ease: 'out', scale: [0.4, 1] }),
      ]);
      await port.apply(CLAWD_CURSOR_LIST);
      m.phase = 'clawd';
      m.clawdFor = 0;
      await clawd.play('laugh', { duration: 1, eyes: 'happy', emote: '♥' });
    } catch (err) {
      if (!isAbort(err)) console.error('[cursor] heist failed', err);
    } finally {
      m.flyer = null;
      if (m.phase === 'stealing') {
        m.phase = 'normal';
        if (hidden) await port.restore().catch((err) => console.error('[cursor] restore failed', err));
      }
      clawd.setAutonomy(true);
    }
  }

  /** The scene backwards: eats his own pointer and spits the user's arrow back. */
  async giveBack(): Promise<void> {
    const { clawd, port } = this.d, m = this.model;
    if (!port || m.phase !== 'clawd') return;
    m.phase = 'returning';
    clawd.setAutonomy(false);
    clawd.forgetPointer();
    const say = SAY[this.d.lang()], bw = clawd.bodyWidth();
    try {
      const p = this.target();
      clawd.face(p.x >= clawd.x() ? 1 : -1);
      await port.hide();
      await Promise.all([
        clawd.play('inhale', { duration: 0.8, mouth: 'wide', eyes: 'closed' }),
        this.fly({ art: 'clawd', from: p, to: () => clawd.mouth(), duration: 0.7, arc: 0, ease: 'in', scale: [1, 0.3] }),
      ]);
      await clawd.play('chew', { duration: 0.7, eyes: 'happy', emote: say.chomp });
      await Promise.all([
        clawd.play('spit', { duration: 0.6, mouth: 'o', emote: say.spit }),
        this.fly({ art: 'system', from: clawd.mouth(), to: () => this.target(), duration: 0.7, arc: bw * 1.2, ease: 'out', scale: [0.4, 1] }),
      ]);
    } catch (err) {
      if (!isAbort(err)) console.error('[cursor] give back failed', err);
    } finally {
      m.flyer = null;
      m.phase = 'normal';
      m.lastHeistAt = m.elapsed;
      await port.restore().catch((err) => console.error('[cursor] restore failed', err));
      clawd.setAutonomy(true);
    }
    await clawd.play('wave', { duration: 1.2, eyes: 'happy' }).catch(() => {});
  }
}
