import { COLOR_ROLES, ROLE_INDEX, type ColorRole } from './roles';
import type { PropArt } from './prop-art';

export interface Cell {
  ch: string;
  role: ColorRole | null;
}

const NONE = -1;

/**
 * A grid of characters, each with a colour role. `role === null` means the cell is empty
 * (nothing drawn); a space with role 'bg' paints the background colour and hides what's behind.
 */
export class AsciiGrid {
  readonly chars: string[];
  readonly roles: Int8Array;

  constructor(readonly cols: number, readonly rows: number) {
    this.chars = new Array<string>(cols * rows).fill(' ');
    this.roles = new Int8Array(cols * rows).fill(NONE);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  get(x: number, y: number): Cell | null {
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return null;
    const i = y * this.cols + x;
    const r = this.roles[i]!;
    return { ch: this.chars[i]!, role: r === NONE ? null : COLOR_ROLES[r]! };
  }

  set(x: number, y: number, ch: string, role: ColorRole | null): void {
    // Callers sometimes derive coordinates from fractional geometry; never index with a float.
    x = Math.floor(x);
    y = Math.floor(y);
    if (!this.inBounds(x, y)) return;
    const i = y * this.cols + x;
    this.chars[i] = ch;
    this.roles[i] = role === null ? NONE : ROLE_INDEX[role];
  }

  isEmpty(x: number, y: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    return !this.inBounds(x, y) || this.roles[y * this.cols + x] === NONE;
  }

  clear(): void {
    this.chars.fill(' ');
    this.roles.fill(NONE);
  }

  text(x: number, y: number, str: string, role: ColorRole): void {
    let cx = x;
    for (const ch of str) this.set(cx++, y, ch, role);
  }

  fillRect(x: number, y: number, w: number, h: number, ch: string, role: ColorRole | null): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ch, role);
  }

  blit(art: PropArt, x: number, y: number, frame = 0): void {
    const lines = art.frames[frame % art.frames.length]!;
    const mask = art.masks[frame % art.masks.length] ?? null;
    for (let row = 0; row < art.h; row++) {
      const line = lines[row]!;
      const first = line.search(/\S/);
      const last = line.trimEnd().length - 1;
      for (let col = 0; col < art.w; col++) {
        const ch = line[col]!;
        if (ch === ' ') {
          if (art.solidInterior && first >= 0 && col > first && col < last) this.set(x + col, y + row, ' ', 'bg');
          continue;
        }
        const m = mask?.[row]?.[col];
        this.set(x + col, y + row, ch, (m && art.roles[m]) || art.role);
      }
    }
  }

  /** Paints `role` (as a space) on every empty cell touching a non-empty one: a sticker border. */
  outline(role: ColorRole): void {
    const marks: number[] = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.isEmpty(x, y)) continue;
        let touch = false;
        for (let dy = -1; dy <= 1 && !touch; dy++) {
          for (let dx = -1; dx <= 1 && !touch; dx++) {
            if ((dx || dy) && this.inBounds(x + dx, y + dy) && !this.isEmpty(x + dx, y + dy)) touch = true;
          }
        }
        if (touch) marks.push(y * this.cols + x);
      }
    }
    for (const i of marks) {
      this.chars[i] = ' ';
      this.roles[i] = ROLE_INDEX[role];
    }
  }

  copyFrom(other: AsciiGrid): void {
    if (other.cols !== this.cols || other.rows !== this.rows) throw new Error('grid size mismatch');
    for (let i = 0; i < this.chars.length; i++) this.chars[i] = other.chars[i]!;
    this.roles.set(other.roles);
  }

  clone(): AsciiGrid {
    const g = new AsciiGrid(this.cols, this.rows);
    g.copyFrom(this);
    return g;
  }

  /** Indices of cells that differ from `other` (same size required). */
  diff(other: AsciiGrid): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.chars.length; i++) {
      if (this.chars[i] !== other.chars[i] || this.roles[i] !== other.roles[i]) out.push(i);
    }
    return out;
  }

  toString(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.rows; y++) lines.push(this.chars.slice(y * this.cols, (y + 1) * this.cols).join(''));
    return lines.join('\n');
  }
}
