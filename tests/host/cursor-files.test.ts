import { describe, expect, it } from 'vitest';
import { cursorFile, encodeAni, encodeCur } from '../../src/host/cursor-files';
import type { CursorArt } from '../../src/shared/cursor';
import { parseSprite } from '../../src/shared/render/sprite';

const PAL = { K: '#141414', O: '#d77757' };
const dot = parseSprite(['K.', '.O'], PAL);
const text = (b: Uint8Array, at: number, n = 4) => String.fromCharCode(...b.subarray(at, at + n));
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Walks RIFF chunks: id -> list of [offset of data, size]. */
function chunks(b: Uint8Array, from: number, to: number): [string, number, number][] {
  const out: [string, number, number][] = [];
  for (let o = from; o < to; ) {
    const size = view(b).getUint32(o + 4, true);
    out.push([text(b, o), o + 8, size]);
    o += 8 + size + (size & 1);
  }
  return out;
}

describe('.cur files', () => {
  it('hold one image per scale with the hotspot scaled too', () => {
    const cur = encodeCur(dot, { x: 1, y: 1 }, [2, 64]);
    const v = view(cur);
    expect(v.getUint16(2, true)).toBe(2); // cursor, not icon
    expect(v.getUint16(4, true)).toBe(2);
    expect([cur[6], cur[22]]).toEqual([4, 128]); // 2×2 sprite at 2× and 64×
    expect([v.getUint16(10, true), v.getUint16(12, true)]).toEqual([2, 2]);
    expect([v.getUint16(26, true), v.getUint16(28, true)]).toEqual([64, 64]);
    // Entries point at back-to-back images that end exactly at the end of the file.
    const [size1, off1, size2, off2] = [v.getUint32(14, true), v.getUint32(18, true), v.getUint32(30, true), v.getUint32(34, true)];
    expect(off1).toBe(6 + 32);
    expect(off2).toBe(off1 + size1);
    expect(off2 + size2).toBe(cur.length);
  });

  it('store bottom-up BGRA with a mask that marks transparent pixels', () => {
    const cur = encodeCur(dot, { x: 0, y: 0 }, [1]);
    const img = cur.subarray(view(cur).getUint32(18, true));
    const v = view(img);
    expect([v.getInt32(4, true), v.getInt32(8, true), v.getUint16(14, true)]).toEqual([2, 4, 32]);
    // Bottom row first: (0,1) transparent, (1,1) orange #d77757 as B,G,R,A.
    expect([...img.subarray(40, 48)]).toEqual([0, 0, 0, 0, 0x57, 0x77, 0xd7, 255]);
    // Top row: (0,0) dark, (1,0) transparent.
    expect([...img.subarray(48, 56)]).toEqual([0x14, 0x14, 0x14, 255, 0, 0, 0, 0]);
    // AND mask rows are 4 bytes; bit set = transparent. Bottom row: x=0 → 0x80; top row: x=1 → 0x40.
    expect([img[56], img[60]]).toEqual([0x80, 0x40]);
  });
});

describe('.ani files', () => {
  const art: CursorArt = { kind: 'busy', frames: [dot, dot], fps: 8, hotspot: { x: 1, y: 0 }, sequence: [0, 1, 1] };

  it('are a RIFF ACON with header, sequence and one icon per frame', () => {
    const ani = encodeAni(art, [2]);
    expect(text(ani, 0)).toBe('RIFF');
    expect(view(ani).getUint32(4, true)).toBe(ani.length - 8);
    expect(text(ani, 8)).toBe('ACON');
    const top = chunks(ani, 12, ani.length);
    expect(top.map(([id]) => id)).toEqual(['anih', 'seq ', 'LIST']);
    const [, anih] = top[0]!;
    const h = (i: number) => view(ani).getUint32(anih + i * 4, true);
    expect([h(0), h(1), h(2), h(7), h(8)]).toEqual([36, 2, 3, 8, 3]); // 60/8 ≈ 8 jiffies; icon + sequence
    const [, seq] = top[1]!;
    expect([0, 1, 2].map((i) => view(ani).getUint32(seq + i * 4, true))).toEqual([0, 1, 1]);
    const [, list, listSize] = top[2]!;
    expect(text(ani, list)).toBe('fram');
    const icons = chunks(ani, list + 4, list + listSize);
    expect(icons.map(([id]) => id)).toEqual(['icon', 'icon']);
    expect(view(ani).getUint16(icons[0]![1] + 2, true)).toBe(2); // each frame is a .cur
  });

  it('a still pointer is a plain .cur, an animated one an .ani', () => {
    expect(cursorFile({ ...art, frames: [dot], sequence: undefined }).ext).toBe('cur');
    expect(cursorFile(art).ext).toBe('ani');
  });
});
