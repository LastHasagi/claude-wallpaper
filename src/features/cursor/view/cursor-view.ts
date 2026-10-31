import type { CanvasBackend } from '../../../shared/render/canvas-backend';
import type { CursorModel } from '../model/cursor-model';
import { CLAWD_CURSORS, SYSTEM_ARROW, SYSTEM_HOTSPOT } from '../sprites/cursors';

/** CSS px per grid pixel for a pointer at its real size (16-px grid → 32-px pointer). */
const POINTER_SCALE = 2;

/** Draws the pointer while it flies into (or out of) Clawd's mouth. */
export class CursorView {
  draw(b: CanvasBackend, m: CursorModel): void {
    const f = m.flyerFrame();
    if (!f) return;
    const sprite = f.art === 'system' ? SYSTEM_ARROW : CLAWD_CURSORS.arrow.frames[0]!;
    const hot = f.art === 'system' ? SYSTEM_HOTSPOT : CLAWD_CURSORS.arrow.hotspot;
    const dpr = b.metrics.dpr;
    const dev = Math.max(1, Math.round(POINTER_SCALE * f.scale * dpr));
    const css = dev / dpr;
    b.drawSprite(sprite, f.x - hot.x * css, f.y - hot.y * css, dev);
  }
}
