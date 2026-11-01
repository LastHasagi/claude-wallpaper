import type { Sprite } from '../../../shared/render/sprite';
import type { Wear } from '../model/wear';
import { POSES } from './body';
import { EYES } from './eyes';
import { FACE_WEAR, HEAD_WEAR, type WearDef } from './wear';

/**
 * Clawd standing with open eyes, as a single sprite (for icons and UI). With accessories the
 * sprite grows upwards to fit the hat; without them it is the plain body (the app icon).
 */
export function portrait(wear: Wear = { head: null, face: null }): Sprite {
  const frame = POSES.idle.frames[0]!;
  const body = frame.sprite;
  const layers: [Sprite, number, number][] = [[EYES.open, frame.eyes.x, frame.eyes.y]];
  const add = (d: WearDef) => layers.push([d.sprite, frame.eyes.x + d.ox, frame.eyes.y + d.oy]);
  if (wear.face) add(FACE_WEAR[wear.face]);
  if (wear.head) add(HEAD_WEAR[wear.head]);

  const pad = Math.max(0, ...layers.map(([, , y]) => -y));
  const w = body.w, h = body.h + pad;
  const pixels: (string | null)[] = new Array(w * h).fill(null);
  const paste = (s: Sprite, ox: number, oy: number) => {
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const c = s.pixels[y * s.w + x], px = ox + x, py = oy + y + pad;
        if (c && px >= 0 && px < w && py >= 0 && py < h) pixels[py * w + px] = c;
      }
    }
  };
  paste(body, 0, 0);
  for (const [s, x, y] of layers) paste(s, x, y);
  return { w, h, pixels };
}
