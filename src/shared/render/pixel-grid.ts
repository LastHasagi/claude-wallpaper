import { parseSprite, type Sprite } from './sprite';

/** Small drawing grid of palette letters, for pixel art built in code (pointers, flying icons). */
export class PixelGrid {
  private readonly px: string[][];

  constructor(readonly w: number, readonly h: number) {
    this.px = Array.from({ length: h }, () => new Array<string>(w).fill('.'));
  }

  set(x: number, y: number, c: string): this {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.px[y]![x] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
    return this;
  }

  /** Stamps a mask: '#' becomes `fill`, the leftmost '#' of each row `edge` (a lit edge). */
  shape(rows: readonly string[], x: number, y: number, fill: string, edge = fill): this {
    rows.forEach((row, dy) => {
      const first = row.indexOf('#');
      [...row].forEach((ch, dx) => {
        if (ch === '#') this.set(x + dx, y + dy, dx === first ? edge : fill);
      });
    });
    return this;
  }

  /** 1-px outline around everything drawn, so it shows on any background. */
  outline(c = 'K'): this {
    const filled = (x: number, y: number) => x >= 0 && x < this.w && y >= 0 && y < this.h && this.px[y]![x] !== '.';
    const ring: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) ring.push([x, y]);
      }
    }
    for (const [x, y] of ring) this.set(x, y, c);
    return this;
  }

  sprite(palette: Readonly<Record<string, string>>): Sprite {
    return parseSprite(this.px.map((r) => r.join('')), palette);
  }
}
