import type { Lang } from '../../../shared/i18n';
import { factText, wrap, type Fact } from './note-picker';

export type NotePhase = 'opening' | 'shown' | 'folding';

export interface Note {
  fact: Fact;
  /** Card centre x and top y, CSS px. */
  x: number;
  y: number;
  phase: NotePhase;
  t: number;
}

export interface CardMetrics {
  cellW: number;
  cellH: number;
  cssW: number;
}

export interface CardLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

export const TEXT_COLS = 38;

/** Where the card goes and how its text wraps. Shared by the view (drawing) and controller (clicks). */
export function cardLayout(n: Note, lang: Lang, m: CardMetrics): CardLayout {
  const lines = wrap(factText(n.fact, lang), TEXT_COLS);
  const w = (Math.max(TEXT_COLS, ...lines.map((l) => [...l].length)) + 4) * m.cellW;
  const h = (lines.length + 5) * m.cellH;
  const x = Math.min(Math.max(n.x - w / 2, m.cellW), m.cssW - w - m.cellW);
  return { x, y: n.y, w, h, lines };
}

export const OPEN_TIME = 0.35;
export const FOLD_TIME = 0.4;

export class NoteModel {
  note: Note | null = null;
  private onFolded: (() => void) | null = null;

  show(fact: Fact, x: number, y: number): void {
    this.note = { fact, x, y, phase: 'opening', t: 0 };
  }

  fold(onFolded?: () => void): void {
    if (!this.note || this.note.phase === 'folding') return;
    this.note.phase = 'folding';
    this.note.t = 0;
    this.onFolded = onFolded ?? null;
  }

  /** 0 → collapsed, 1 → fully open. */
  openness(): number {
    const n = this.note;
    if (!n) return 0;
    if (n.phase === 'opening') return Math.min(n.t / OPEN_TIME, 1);
    if (n.phase === 'folding') return Math.max(1 - n.t / FOLD_TIME, 0);
    return 1;
  }

  tick(dt: number): void {
    const n = this.note;
    if (!n) return;
    n.t += dt;
    if (n.phase === 'opening' && n.t >= OPEN_TIME) n.phase = 'shown';
    if (n.phase === 'folding' && n.t >= FOLD_TIME) {
      this.note = null;
      const cb = this.onFolded;
      this.onFolded = null;
      cb?.();
    }
  }
}
