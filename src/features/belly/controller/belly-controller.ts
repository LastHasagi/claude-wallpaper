import { contains, expand, type Point } from '../../../shared/geometry';
import type { Lang } from '../../../shared/i18n';
import type { Rng } from '../../../shared/rng';
import type { BellyPort, CursorEvent, FileDrag, Refusal } from '../../../host/host';
import { isAbort, type ClawdApi } from '../../clawd/index';
import { baseName, BELLY, BellyModel, snackKind, type Snack, type SnackKind } from '../model/belly-model';

const SAY = {
  pt: { chomp: 'nhac!', spit: 'ptui!', burp: 'arrot!', full: 'cheio!', desktopOnly: 'só do desktop!', yuck: 'eca!' },
  en: { chomp: 'chomp!', spit: 'ptoo!', burp: 'burp!', full: "I'm full!", desktopOnly: 'desktop only!', yuck: 'yuck!' },
} as const;

export interface BellyDeps {
  clawd: ClawdApi;
  /** Absent where dropped items can't be eaten: dropping on him does nothing. */
  port?: BellyPort;
  rng: Rng;
  lang(): Lang;
}

/**
 * Desktop icons dragged onto Clawd: he eats them (the native side only hides them) and spits
 * them back when clicked, from the tray, or once digested.
 */
export class BellyController {
  readonly model = new BellyModel();

  constructor(private readonly d: BellyDeps) {}

  update(dt: number): void {
    const m = this.model;
    m.tick(dt);
    if (m.count > 0 && m.phase === 'idle' && m.fullFor >= BELLY.digestFor && !this.d.clawd.busy()) void this.spit(true);
  }

  onDrag(e: FileDrag): void {
    const { clawd, port } = this.d, m = this.model;
    if (!port || m.phase !== 'idle') return;
    if (e.type === 'drop') {
      this.calmDown();
      void this.eat(e.paths, { x: e.x, y: e.y });
    } else if (e.type === 'leave') {
      this.calmDown();
    } else if (!m.hungry && !clawd.busy()) {
      // Something tasty is coming: mouth open, eyes wide.
      m.hungry = true;
      clawd.face(e.x >= clawd.x() ? 1 : -1);
      clawd.setEyes('wide');
      clawd.setMouth('wide');
    }
  }

  private calmDown(): void {
    if (!this.model.hungry) return;
    this.model.hungry = false;
    this.d.clawd.setEyes('open');
    this.d.clawd.setMouth(null);
  }

  /** Returns true when the event was consumed: a click on a full Clawd, or a scene going on. */
  onCursor(e: CursorEvent): boolean {
    const m = this.model;
    if (m.phase !== 'idle') return true;
    if (e.type === 'down' && m.count > 0 && contains(expand(this.d.clawd.bounds(), 4), e)) {
      void this.spit();
      return true;
    }
    return false;
  }

  /** The tray gave everything back: he just remarks on it. */
  spatElsewhere(count: number): void {
    const m = this.model;
    m.count = 0;
    m.kinds = [];
    m.fullFor = 0;
    if (count > 0) this.d.clawd.emote(SAY[this.d.lang()].spit, 1.2);
  }

  private snacks(kinds: readonly SnackKind[], from: () => Point, to: (i: number) => () => Point, inward: boolean): Snack[] {
    return kinds.slice(0, BELLY.maxSnacks).map((kind, i) => ({
      kind,
      from: from(),
      to: to(i),
      t: -i * 0.12,
      duration: inward ? 0.6 : 0.75,
      arc: inward ? 0 : this.d.clawd.bodyWidth() * 1.2,
      ease: inward ? 'in' : 'out',
      scale: inward ? [1, 0.3] : [0.3, 1],
    }));
  }

  async eat(paths: readonly string[], at: Point): Promise<void> {
    const { clawd, port } = this.d, m = this.model;
    if (!port || m.phase !== 'idle' || !paths.length) return;
    const say = SAY[this.d.lang()];
    m.phase = 'eating';
    // On a mission he eats without the show (taking over would derail it).
    const scene = !clawd.busy();
    if (scene) {
      clawd.setAutonomy(false);
      clawd.forgetPointer();
    }
    try {
      const report = await port.eat(paths);
      const eaten = paths.filter((p) => report.eaten.includes(baseName(p)));
      m.count = report.total;
      m.kinds.push(...eaten.map(snackKind));
      if (eaten.length) m.fullFor = 0;
      const refusal = report.refused[0]?.[1];
      const complaint = refusal && this.complaint(refusal);
      if (!scene) {
        clawd.emote(eaten.length ? `+${eaten.length}` : complaint ?? say.yuck, 1.5);
        return;
      }
      if (eaten.length) {
        const n = Math.min(eaten.length, BELLY.maxSnacks);
        const flying = this.snacks(eaten.map(snackKind), () => ({ x: at.x + this.d.rng.range(-12, 12), y: at.y + this.d.rng.range(-12, 12) }), () => () => clawd.mouth(), true);
        await Promise.all([clawd.play('inhale', { duration: 0.6 + 0.12 * n, mouth: 'wide', eyes: 'closed' }), m.launch(flying)]);
        await clawd.play('chew', { duration: 1.2, eyes: 'happy', emote: say.chomp });
        await clawd.play('idle', { duration: 0.9, eyes: 'happy', emote: `+${eaten.length}` });
      }
      if (complaint) await clawd.play('angry', { duration: 0.9, eyes: 'closed', emote: complaint });
    } catch (err) {
      if (!isAbort(err)) console.error('[belly] eating failed', err);
    } finally {
      m.phase = 'idle';
      m.snacks = [];
      clawd.setMouth(null);
      if (scene) clawd.setAutonomy(true);
    }
  }

  private complaint(why: Refusal): string {
    const say = SAY[this.d.lang()];
    return why === 'full' ? say.full : why === 'notOnDesktop' ? say.desktopOnly : say.yuck;
  }

  /** Spits everything back (the native side un-hides it). `digested`: he burps first. */
  async spit(digested = false): Promise<void> {
    const { clawd, port, rng } = this.d, m = this.model;
    if (!port || m.phase !== 'idle' || m.count === 0) return;
    const say = SAY[this.d.lang()];
    m.phase = 'spitting';
    const scene = !clawd.busy();
    if (scene) {
      clawd.setAutonomy(false);
      clawd.forgetPointer();
    }
    const kinds: SnackKind[] = m.kinds.length ? m.kinds : ['file'];
    try {
      if (scene && digested) await clawd.play('gulp', { duration: 0.5, emote: say.burp });
      await port.spit();
      m.count = 0;
      m.kinds = [];
      m.fullFor = 0;
      if (!scene) {
        clawd.emote(say.spit, 1.2);
        return;
      }
      // Back where desktop icons live: up and away from him.
      const bw = clawd.bodyWidth(), b = clawd.bounds();
      const flying = this.snacks(kinds, () => clawd.mouth(), () => {
        const dest = { x: b.x + b.w / 2 + rng.range(-5, 5) * bw, y: b.y - rng.range(1.5, 4) * bw };
        return () => dest;
      }, false);
      await Promise.all([clawd.play('spit', { duration: 0.5 + 0.12 * flying.length, mouth: 'o', emote: say.spit }), m.launch(flying)]);
      await clawd.play('laugh', { duration: 0.8, eyes: 'happy' });
    } catch (err) {
      if (!isAbort(err)) console.error('[belly] spitting failed', err);
    } finally {
      m.phase = 'idle';
      m.snacks = [];
      if (scene) clawd.setAutonomy(true);
    }
  }
}
