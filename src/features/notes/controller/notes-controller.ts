import type { Bus } from '../../../shared/events';
import { contains, type Rect } from '../../../shared/geometry';
import type { Lang } from '../../../shared/i18n';
import type { Rng } from '../../../shared/rng';
import type { CursorEvent, DisplayMode } from '../../../host/host';
import { isAbort, type ClawdApi } from '../../clawd/index';
import type { SceneApi } from '../../scene/index';
import { cardLayout, NoteModel, type CardMetrics } from '../model/note-model';
import type { Fact, NotePicker } from '../model/note-picker';

export type NotesSetting = 'off' | 'sometimes' | 'always';

export interface NotesEvents {
  'note:shown': { id: string };
  'note:dismissed': { id: string };
}

export interface NotesDeps {
  clawd: ClawdApi;
  scene: SceneApi;
  picker: NotePicker;
  rng: Rng;
  bus: Bus<NotesEvents>;
  mode: DisplayMode;
  lang(): Lang;
  setting(): NotesSetting;
  metrics(): CardMetrics;
}

/** Clawd brings a curiosity on a notepad, sticks it on screen and fetches it back when clicked. */
export class NotesController {
  readonly model = new NoteModel();
  /** What clicking the current note does besides folding it (announcements). */
  private action: (() => void) | null = null;

  constructor(private readonly d: NotesDeps) {}

  update(dt: number): void {
    this.model.tick(dt);
  }

  lang(): Lang {
    return this.d.lang();
  }

  shouldDeliver(): boolean {
    const s = this.d.setting();
    return s === 'always' || (s === 'sometimes' && this.d.rng.chance(0.5));
  }

  /** Called after a mission. Resolves once the note is up (or immediately if skipped). */
  async maybeDeliver(topic: string, signal?: AbortSignal): Promise<void> {
    if (!this.shouldDeliver()) return;
    await this.deliver(topic, signal);
  }

  async deliver(topic: string, signal?: AbortSignal): Promise<void> {
    await this.deliverFact(this.d.picker.pick(topic), signal);
  }

  /**
   * Brings a specific note (e.g. an app announcement) as soon as Clawd is free. Clicking it runs
   * `action` instead of just folding it away.
   */
  announce(fact: Fact, action?: () => void, retryMs = 30_000): void {
    const attempt = () => {
      if (this.d.clawd.busy()) {
        setTimeout(attempt, retryMs);
        return;
      }
      this.deliverFact(fact, undefined, action).catch((err) => {
        if (!isAbort(err)) console.error('[notes] announcement failed', err);
      });
    };
    attempt();
  }

  async deliverFact(fact: Fact, signal?: AbortSignal, action?: () => void): Promise<void> {
    const { clawd, scene, rng, bus } = this.d;
    const l = scene.layout();
    // Stay on the monitor he is on: a few bodies away, comfortably inside it.
    const p = scene.panelAt(clawd.x());
    const width = p.x1 - p.x0;
    const bw = clawd.bodyWidth();
    let target = p.x0 + rng.range(width * 0.25, width * 0.75);
    if (Math.abs(target - clawd.x()) < bw * 2) target = clawd.x() < p.x0 + width / 2 ? target + bw * 3 : target - bw * 3;
    target = Math.min(Math.max(target, p.x0 + bw * 2), p.x1 - bw * 2);

    if (this.model.note) this.model.fold();
    clawd.hold('notepad');
    try {
      await clawd.walkTo(target, { pose: 'carry', signal });
      clawd.hold(null);
      await clawd.jump(signal);
    } finally {
      clawd.hold(null);
    }
    let y = p.top + Math.max(l.cellH * 3, (p.groundY - p.top) * 0.18);
    if (this.d.mode === 'overlay') {
      // Overlay: the card floats right above his head (its bottom edge, not its top).
      const card = cardLayout({ fact, x: target, y: 0, phase: 'shown', t: 0 }, this.d.lang(), this.d.metrics());
      y = Math.max(l.cellH, clawd.bounds().y - card.h - bw * 0.25);
    }
    this.model.show(fact, target, y);
    this.action = action ?? null;
    clawd.emote('♪', 1.4);
    bus.emit('note:shown', { id: fact.id });
  }

  /** Returns true when the click was consumed by the note. */
  onCursor(e: CursorEvent): boolean {
    const rect = this.cardRect();
    if (e.type !== 'down' || !rect || this.model.note?.phase === 'folding') return false;
    if (!contains(rect, e)) return false;
    this.dismiss();
    return true;
  }

  dismiss(): void {
    const n = this.model.note;
    if (!n) return;
    const { clawd, bus } = this.d;
    bus.emit('note:dismissed', { id: n.fact.id });
    this.model.fold();
    const action = this.action;
    this.action = null;
    action?.();
    if (clawd.busy()) {
      clawd.emote('♥', 1.5);
      return;
    }
    // Free time: he walks over to collect it.
    clawd
      .walkTo(n.x)
      .then(() => clawd.play('laugh', { duration: 0.9, eyes: 'happy', emote: '♥' }))
      .catch((err) => {
        if (!isAbort(err)) console.error('[notes] fetch failed', err);
      });
  }

  cardRect(): Rect | null {
    const n = this.model.note;
    if (!n) return null;
    const { x, y, w, h } = cardLayout(n, this.d.lang(), this.d.metrics());
    return { x, y, w, h };
  }

  interactiveRects(): Rect[] {
    const r = this.cardRect();
    return r ? [r] : [];
  }
}
