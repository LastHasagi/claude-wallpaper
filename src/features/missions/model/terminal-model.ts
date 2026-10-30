import type { ColorRole } from '../../../shared/render/roles';

export interface TermLine {
  text: string;
  role: ColorRole;
  /** Characters revealed so far. */
  shown: number;
}

const CHARS_PER_SECOND = 18;
const MAX_LINES = 4;

/** The coding mission's little terminal bubble: lines typed out over time. */
export class TerminalModel {
  lines: TermLine[] = [];
  private pending: { line: TermLine; resolve: () => void }[] = [];

  type(text: string, role: ColorRole): Promise<void> {
    return new Promise((resolve) => {
      const line: TermLine = { text, role, shown: 0 };
      this.lines.push(line);
      if (this.lines.length > MAX_LINES) this.lines.shift();
      this.pending.push({ line, resolve });
    });
  }

  clear(): void {
    this.lines = [];
    for (const p of this.pending) p.resolve();
    this.pending = [];
  }

  get visible(): boolean {
    return this.lines.length > 0;
  }

  tick(dt: number): void {
    const head = this.pending[0];
    if (!head) return;
    head.line.shown = Math.min(head.line.text.length, head.line.shown + dt * CHARS_PER_SECOND);
    if (head.line.shown >= head.line.text.length) {
      this.pending.shift();
      head.resolve();
    }
  }
}
