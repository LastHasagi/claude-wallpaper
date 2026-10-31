import type { CanvasBackend } from '../../../shared/render/canvas-backend';
import type { BellyModel } from '../model/belly-model';
import { SNACKS } from '../sprites/snacks';

/** CSS px per sprite pixel at natural size (about a desktop icon's glyph). */
const ICON_SCALE = 2;

/** Draws the desktop icons flying into (or out of) Clawd's mouth. */
export class BellyView {
  draw(b: CanvasBackend, m: BellyModel): void {
    const dpr = b.metrics.dpr;
    for (const f of m.snackFrames()) {
      const sprite = SNACKS[f.kind];
      const dev = Math.max(1, Math.round(ICON_SCALE * f.scale * dpr));
      const css = dev / dpr;
      b.drawSprite(sprite, f.x - (sprite.w * css) / 2, f.y - (sprite.h * css) / 2, dev);
    }
  }
}
