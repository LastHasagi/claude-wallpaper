import type { CursorArt } from '../shared/cursor';
import { spriteRgba, type Sprite } from '../shared/render/sprite';

/**
 * Windows cursor files built from pixel art. Each image holds the common pointer sizes as whole
 * multiples of the 16-px grid (32 = 100%, 48 = 150%, 64 = 200%, 96 = 300%), so Windows picks a crisp
 * one per monitor. Animated pointers become `.ani` files: Windows plays them by itself.
 * No 128 px: Windows refuses an `.ani` whose frames pass ~100 KB (measured on Windows 11).
 */
export const CURSOR_SCALES = [2, 3, 4, 6] as const;

const AF_ICON = 1;
const AF_SEQUENCE = 2;

/** `.cur`: an ICO directory of type 2 whose entries carry the hotspot. */
export function encodeCur(sprite: Sprite, hotspot: { x: number; y: number }, scales: readonly number[] = CURSOR_SCALES): Uint8Array {
  const images = scales.map((s) => bitmap(sprite, s));
  const header = 6 + 16 * images.length;
  const out = new Uint8Array(header + images.reduce((n, img) => n + img.length, 0));
  const v = new DataView(out.buffer);
  v.setUint16(0, 0, true);
  v.setUint16(2, 2, true); // 2 = cursor
  v.setUint16(4, images.length, true);
  let offset = header;
  images.forEach((img, i) => {
    const s = scales[i]!, size = sprite.w * s, e = 6 + 16 * i;
    out[e] = size >= 256 ? 0 : size;
    out[e + 1] = sprite.h * s >= 256 ? 0 : sprite.h * s;
    v.setUint16(e + 4, hotspot.x * s, true);
    v.setUint16(e + 6, hotspot.y * s, true);
    v.setUint32(e + 8, img.length, true);
    v.setUint32(e + 12, offset, true);
    out.set(img, offset);
    offset += img.length;
  });
  return out;
}

/** 32-bit BGRA DIB (bottom-up, height doubled for the mask) followed by the 1-bit AND mask. */
function bitmap(sprite: Sprite, scale: number): Uint8Array {
  const w = sprite.w * scale, h = sprite.h * scale;
  const rgba = spriteRgba(sprite, scale);
  const maskRow = Math.ceil(w / 32) * 4;
  const out = new Uint8Array(40 + w * h * 4 + maskRow * h);
  const v = new DataView(out.buffer);
  v.setUint32(0, 40, true);
  v.setInt32(4, w, true);
  v.setInt32(8, h * 2, true);
  v.setUint16(12, 1, true);
  v.setUint16(14, 32, true);
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = 40 + (row * w + x) * 4;
      out[o] = rgba[i + 2]!;
      out[o + 1] = rgba[i + 1]!;
      out[o + 2] = rgba[i]!;
      out[o + 3] = rgba[i + 3]!;
      if (rgba[i + 3] === 0) out[40 + w * h * 4 + row * maskRow + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/** `.ani`: a RIFF "ACON" with one `.cur` per frame, played at `fps` in `sequence` order. */
export function encodeAni(art: CursorArt, scales: readonly number[] = CURSOR_SCALES): Uint8Array {
  const frames = art.frames.map((f) => encodeCur(f, art.hotspot, scales));
  const steps = art.sequence ?? art.frames.map((_, i) => i);
  const jiffies = Math.max(1, Math.round(60 / art.fps));
  const chunk = (id: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + data.length + (data.length & 1));
    out.set(ascii(id), 0);
    new DataView(out.buffer).setUint32(4, data.length, true);
    out.set(data, 8);
    return out;
  };
  const u32s = (values: number[]) => {
    const out = new Uint8Array(values.length * 4);
    values.forEach((n, i) => new DataView(out.buffer).setUint32(i * 4, n, true));
    return out;
  };
  const anih = u32s([36, frames.length, steps.length, 0, 0, 0, 0, jiffies, AF_ICON | (art.sequence ? AF_SEQUENCE : 0)]);
  const parts = [chunk('anih', anih)];
  if (art.sequence) parts.push(chunk('seq ', u32s([...art.sequence])));
  parts.push(chunk('LIST', concat([ascii('fram'), ...frames.map((f) => chunk('icon', f))])));
  const body = concat([ascii('ACON'), ...parts]);
  return concat([ascii('RIFF'), u32s([body.length]), body]);
}

/** The file Windows loads for this pointer: `.cur` when still, `.ani` when animated. */
export function cursorFile(art: CursorArt): { ext: 'cur' | 'ani'; bytes: Uint8Array } {
  if (art.frames.length === 1 && !art.sequence) return { ext: 'cur', bytes: encodeCur(art.frames[0]!, art.hotspot) };
  return { ext: 'ani', bytes: encodeAni(art) };
}

function ascii(s: string): Uint8Array {
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
