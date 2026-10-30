import type { Rect } from '../../../shared/geometry';
import type { CanvasBackend } from '../../../shared/render/canvas-backend';
import type { TerminalModel } from '../model/terminal-model';

/** Draws the terminal bubble next to `anchor` (Clawd's bounds), kept on screen. */
export class TerminalView {
  draw(b: CanvasBackend, term: TerminalModel, anchor: Rect): void {
    if (!term.visible) return;
    const { cellW, cellH, cssW } = b.metrics;
    const cols = Math.max(18, ...term.lines.map((l) => [...l.text].length)) + 2;
    const w = cols * cellW;
    const h = (term.lines.length + 1.2) * cellH;
    // Prefer his left: the mug (and its steam) sits at the right end of the desk.
    let x = anchor.x - w - anchor.w * 0.1;
    if (x < cellW) x = anchor.x + anchor.w * 0.85;
    x = Math.min(Math.max(cellW, x), cssW - w - cellW);
    const y = Math.max(cellH, anchor.y - h * 0.6);

    b.fillRect(x, y, w, h, b.color('paper'));
    b.strokeRect(x, y, w, h, b.color('dim'));
    b.fillRect(x, y, w, cellH * 0.35, b.color('dim'));
    term.lines.forEach((line, i) => {
      const text = [...line.text].slice(0, Math.floor(line.shown)).join('');
      const caret = line.shown < line.text.length ? '█' : '';
      b.text(text + caret, x + cellW, y + cellH * (0.65 + i), b.color(line.role));
    });
  }
}
