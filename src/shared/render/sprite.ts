/** Pixel sprite: row-major colours, `null` = transparent. */
export interface Sprite {
  w: number;
  h: number;
  pixels: (string | null)[];
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
