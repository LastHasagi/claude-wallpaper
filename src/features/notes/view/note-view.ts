import type { Lang } from '../../../shared/i18n';
import type { CanvasBackend } from '../../../shared/render/canvas-backend';
import { cardLayout, type NoteModel } from '../model/note-model';

const TITLE: Record<Lang, string> = { pt: 'Você sabia?', en: 'Did you know?' };
const HINT: Record<Lang, string> = { pt: 'clique para fechar', en: 'click to dismiss' };

/** A paper card with a pin: title, wrapped fact, signature. Grows open / folds shut vertically. */
export class NoteView {
  draw(b: CanvasBackend, m: NoteModel, lang: Lang): void {
    const n = m.note;
    if (!n) return;
    const { cellW, cellH, fontPx } = b.metrics;
    const { x, y, w, h: fullH, lines } = cardLayout(n, lang, b.metrics);
    const open = m.openness();
    const h = Math.max(cellH * 0.6, fullH * open);

    b.fillRect(x + cellW * 0.4, y + cellH * 0.4, w, h, 'rgba(0,0,0,0.18)');
    b.fillRect(x, y, w, h, b.color('paper'));
    b.strokeRect(x, y, w, h, b.color('dim'));
    b.fillRect(x + w / 2 - cellW * 0.45, y - cellH * 0.35, cellW * 0.9, cellW * 0.9, b.color('accent'));
    if (open < 0.95) return;

    const left = x + cellW * 2;
    b.text(TITLE[lang], left, y + cellH * 0.9, b.color('accent'), fontPx, true);
    lines.forEach((line, i) => b.text(line, left, y + cellH * (2.3 + i), b.color('ink')));
    const sign = '— Clawd';
    b.text(sign, x + w - cellW * (sign.length + 2), y + cellH * (lines.length + 2.7), b.color('mid'));
    b.text(HINT[lang], left, y + cellH * (lines.length + 3.7), b.color('dim'), fontPx * 0.8);
  }
}
