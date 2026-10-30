/** Sprite palette letters. Clawd's colours never change with the theme. */
export const PALETTE: Readonly<Record<string, string>> = {
  O: '#d77757', // body
  H: '#eda085', // top highlight
  h: '#e89377', // left edge light
  S: '#b25c3f', // shadow
  L: '#c2664a', // legs
  K: '#141414', // eyes
  W: '#ffffff', // eye glint
  P: '#f2a3a0', // blush
  D: '#2c2c34', // binocular body
  B: '#4d6b8a', // lens
  G: '#d6ecff', // lens glint
  N: '#7a4b35', // book cover
  Q: '#f3efe4', // paper
  T: '#a49d8f', // printed lines
  M: '#a3a8b2', // laptop lid
  V: '#6b707a', // laptop base
  Y: '#f6e7a1', // notepad paper
  R: '#8c8f99', // notepad rings
};

/** Mutable pixel canvas used to assemble sprites from parts; emits palette-letter rows. */
export class PixelCanvas {
  private readonly px: string[][];

  constructor(readonly w: number, readonly h: number) {
    this.px = Array.from({ length: h }, () => new Array<string>(w).fill('.'));
  }

  rect(x: number, y: number, w: number, h: number, letter: string): this {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (yy >= 0 && yy < this.h && xx >= 0 && xx < this.w) this.px[yy]![xx] = letter;
      }
    }
    return this;
  }

  dot(x: number, y: number, letter: string): this {
    return this.rect(x, y, 1, 1, letter);
  }

  rows(): string[] {
    return this.px.map((r) => r.join(''));
  }
}
