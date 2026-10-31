/** Pixel sprite: row-major colours, `null` = transparent. */
export interface Sprite {
  w: number;
  h: number;
  pixels: (string | null)[];
}

/** RGBA bytes of the sprite enlarged `scale` times (each pixel becomes a scale×scale block). */
export function spriteRgba(sprite: Sprite, scale: number): Uint8ClampedArray<ArrayBuffer> {
  const w = sprite.w * scale, h = sprite.h * scale;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = sprite.pixels[Math.floor(y / scale) * sprite.w + Math.floor(x / scale)];
      if (!color) continue;
      const i = (y * w + x) * 4;
      out[i] = parseInt(color.slice(1, 3), 16);
      out[i + 1] = parseInt(color.slice(3, 5), 16);
      out[i + 2] = parseInt(color.slice(5, 7), 16);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Parses rows of palette letters ('.' = transparent) into a sprite. */
export function parseSprite(rows: readonly string[], palette: Readonly<Record<string, string>>): Sprite {
  const w = rows[0]?.length ?? 0;
  const pixels: (string | null)[] = [];
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`sprite row ${y} has width ${row.length}, expected ${w}`);
    for (const ch of row) {
      if (ch === '.') pixels.push(null);
      else {
        const color = palette[ch];
        if (!color) throw new Error(`unknown sprite letter "${ch}" in row ${y}`);
        pixels.push(color);
      }
    }
  });
  return { w, h: rows.length, pixels };
}
