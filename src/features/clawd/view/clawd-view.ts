import { clamp } from '../../../shared/geometry';
import type { CanvasBackend } from '../../../shared/render/canvas-backend';
import type { ClawdModel } from '../model/clawd-model';
import { BODY_H, BODY_W, POSES, type PoseName } from '../sprites/body';
import { EYES, EYES_W } from '../sprites/eyes';
import { HELD_ITEMS } from '../sprites/props';

/** Poses where both hands are free to show the held item. */
const ITEM_POSES: ReadonlySet<PoseName> = new Set(['hold', 'read', 'type', 'carry']);

export class ClawdView {
  draw(b: CanvasBackend, m: ClawdModel): void {
    const s = m.stage.scale;
    const dev = Math.max(1, Math.round(s * b.metrics.dpr));
    const left = m.x - (BODY_W * s) / 2;
    const top = m.stage.groundY - m.jumpY - BODY_H * s;
    const frame = POSES[m.pose].frames[m.frameIndex()]!;
    const flip = m.facing === -1;
    const mirror = (lx: number, w: number) => (flip ? BODY_W - lx - w : lx);

    b.drawSprite(frame.sprite, left, top, dev, flip);

    const item = m.held && ITEM_POSES.has(m.pose) ? HELD_ITEMS[m.held] : null;
    if (!item?.coversEyes) {
      const shown = m.shownEyes();
      let dx = 0, dy = 0;
      if (m.look && shown === 'open') {
        const cx = left + (frame.eyes.x + EYES_W / 2) * s;
        const cy = top + (frame.eyes.y + 3) * s;
        const bw = BODY_W * s;
        dx = clamp(Math.round((m.look.x - cx) / (bw * 0.8)), -1, 1);
        dy = clamp(Math.round((m.look.y - cy) / (bw * 0.8)), -1, 1);
      }
      const ex = mirror(frame.eyes.x, EYES_W) + dx;
      b.drawSprite(EYES[shown], left + ex * s, top + (frame.eyes.y + dy) * s, dev, flip);
    }

    if (item && m.held) {
      const sprite = item.frames[m.heldFrame % item.frames.length]!;
      const anchor = item.anchor === 'eyes' ? frame.eyes : frame.hand;
      const lx = mirror(anchor.x + item.ox, sprite.w);
      b.drawSprite(sprite, left + lx * s, top + (anchor.y + item.oy) * s, dev, flip);
    }

    if (m.emote) this.drawEmote(b, m.emote.text, m.x, top);
  }

  private drawEmote(b: CanvasBackend, text: string, cx: number, top: number): void {
    const { cellW, cellH, fontPx } = b.metrics;
    const chars = [...text].length;
    const w = (chars + 1) * cellW * 1.15;
    const h = cellH * 1.3;
    const x = cx - w / 2;
    const y = top - h - cellH * 0.4;
    b.fillRect(x, y, w, h, b.color('bg'));
    b.strokeRect(x, y, w, h, b.color('dim'));
    b.text(text, x + cellW * 0.55, y + h * 0.16, b.color('accent'), fontPx * 1.15, true);
  }
}
