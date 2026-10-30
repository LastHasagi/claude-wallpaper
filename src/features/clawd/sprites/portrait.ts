import type { Sprite } from '../../../shared/render/sprite';
import { POSES } from './body';
import { EYES } from './eyes';

/** Clawd standing with open eyes, as a single sprite (for icons and UI). */
export function portrait(): Sprite {
  const frame = POSES.idle.frames[0]!;
  const body = frame.sprite;
  const pixels = body.pixels.slice();
  const eyes = EYES.open;
  for (let y = 0; y < eyes.h; y++) {
    for (let x = 0; x < eyes.w; x++) {
      const c = eyes.pixels[y * eyes.w + x];
      if (c) pixels[(frame.eyes.y + y) * body.w + frame.eyes.x + x] = c;
    }
  }
  return { w: body.w, h: body.h, pixels };
}
