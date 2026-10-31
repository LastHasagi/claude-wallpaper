import type { AsciiGrid } from './ascii-grid';
import { COLOR_ROLES, type ColorRole, type Theme } from './roles';
import type { Sprite } from './sprite';
import { clamp } from '../geometry';

export const MONO_FONT = '"Cascadia Mono", Consolas, "DejaVu Sans Mono", Menlo, "Liberation Mono", monospace';

export interface GridMetrics {
  cols: number;
  rows: number;
  /** CSS pixels. */
  cellW: number;
  cellH: number;
  fontPx: number;
  cssW: number;
  cssH: number;
  dpr: number;
}

/** Number of grid columns for a viewport width: ~9px cells, between 48 and 200 columns. */
export function columnsFor(cssW: number): number {
  return Math.round(clamp(cssW / 9, 48, 200));
}

/**
 * Cell width for a viewport. A window spanning several monitors must size cells per monitor:
 * capping the *whole* span at 200 columns made every glyph 2–3× too big (4K + Full HD case).
 * With monitors of different widths the finest monitor wins, so none of them looks blown up.
 */
export function cellWidthFor(cssW: number, segmentWidths: readonly number[] = []): number {
  const widths = segmentWidths.length > 1 ? segmentWidths : [cssW];
  return Math.min(...widths.map((w) => w / columnsFor(w)));
}

/**
 * Two stacked canvases: `bg` holds the ASCII grid and is redrawn incrementally (only changed
 * cells), `fg` holds sprites/UI and is cleared every frame. All drawing snaps to device pixels.
 */
export class CanvasBackend {
  private readonly bgCtx: CanvasRenderingContext2D;
  private readonly fgCtx: CanvasRenderingContext2D;
  private prev: AsciiGrid | null = null;
  private colors: string[] = [];
  private spriteCache = new WeakMap<Sprite, HTMLCanvasElement>();
  private charRatio: number;
  theme!: Theme;
  opaque = true;
  metrics!: GridMetrics;

  constructor(private readonly bg: HTMLCanvasElement, private readonly fg: HTMLCanvasElement, theme: Theme) {
    this.bgCtx = bg.getContext('2d', { alpha: true })!;
    this.fgCtx = fg.getContext('2d', { alpha: true })!;
    this.bgCtx.font = `100px ${MONO_FONT}`;
    this.charRatio = this.bgCtx.measureText('M').width / 100 || 0.55;
    this.setTheme(theme);
    // The GPU can be taken away (a game resetting the device): the canvases come back blank, and
    // `bg` only redraws changed cells, so the scene would vanish for good without a full repaint.
    for (const c of [bg, fg]) c.addEventListener('contextrestored', () => this.repaintAll());
  }

  repaintAll(): void {
    this.prev = null;
    this.spriteCache = new WeakMap();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.colors = COLOR_ROLES.map((r) => theme.colors[r]);
    this.prev = null;
  }

  setOpaque(opaque: boolean): void {
    this.opaque = opaque;
    this.prev = null;
  }

  color(role: ColorRole): string {
    return this.theme.colors[role];
  }

  resize(cssW: number, cssH: number, dpr: number, segmentWidths: readonly number[] = []): GridMetrics {
    const cols = Math.max(1, Math.round(cssW / cellWidthFor(cssW, segmentWidths)));
    const cellW = cssW / cols;
    const fontPx = cellW / this.charRatio;
    const cellH = fontPx * 1.18;
    const rows = Math.ceil(cssH / cellH);
    for (const c of [this.bg, this.fg]) {
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    this.metrics = { cols, rows, cellW, cellH, fontPx, cssW, cssH, dpr };
    this.prev = null;
    return this.metrics;
  }

  /** Draws the grid onto `bg`, touching only the cells that changed since the last call. */
  presentGrid(grid: AsciiGrid): number {
    const ctx = this.bgCtx;
    const m = this.metrics;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${m.fontPx * m.dpr}px ${MONO_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (!this.opaque) return this.presentOutlined(ctx, grid);
    let indices: number[];
    if (!this.prev || this.prev.cols !== grid.cols || this.prev.rows !== grid.rows) {
      ctx.clearRect(0, 0, this.bg.width, this.bg.height);
      if (this.opaque) {
        ctx.fillStyle = this.colors[0]!;
        ctx.fillRect(0, 0, this.bg.width, this.bg.height);
      }
      indices = [];
      for (let i = 0; i < grid.chars.length; i++) if (grid.roles[i] !== -1) indices.push(i);
      this.prev = grid.clone();
    } else {
      indices = this.prev.diff(grid);
      this.prev.copyFrom(grid);
    }
    for (const i of indices) this.drawCell(ctx, i % grid.cols, Math.floor(i / grid.cols), grid.chars[i]!, grid.roles[i]!);
    return indices.length;
  }

  /**
   * Transparent mode (pet over the desktop): every glyph gets a halo in the background colour so
   * it reads over any wallpaper. Halos overlap neighbouring cells, so the (sparse) grid is redrawn
   * in full each frame instead of diffed.
   */
  private presentOutlined(ctx: CanvasRenderingContext2D, grid: AsciiGrid): number {
    const m = this.metrics;
    ctx.clearRect(0, 0, this.bg.width, this.bg.height);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, m.cellW * 0.4) * m.dpr;
    ctx.strokeStyle = this.colors[0]!;
    const cells: number[] = [];
    for (let i = 0; i < grid.chars.length; i++) if (grid.roles[i]! > 0 && grid.chars[i] !== ' ') cells.push(i);
    const pos = (i: number): [number, number] => {
      const x = i % grid.cols, y = Math.floor(i / grid.cols);
      return [Math.floor(x * m.cellW * m.dpr), Math.floor((y + 0.5) * m.cellH * m.dpr)];
    };
    for (const i of cells) ctx.strokeText(grid.chars[i]!, ...pos(i));
    for (const i of cells) {
      ctx.fillStyle = this.colors[grid.roles[i]!]!;
      ctx.fillText(grid.chars[i]!, ...pos(i));
    }
    this.prev = null;
    return cells.length;
  }

  private drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, ch: string, role: number): void {
    const m = this.metrics;
    const x0 = Math.floor(x * m.cellW * m.dpr), x1 = Math.floor((x + 1) * m.cellW * m.dpr);
    const y0 = Math.floor(y * m.cellH * m.dpr), y1 = Math.floor((y + 1) * m.cellH * m.dpr);
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    if (this.opaque || role === 0) {
      ctx.fillStyle = this.colors[0]!;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (role > 0 && ch !== ' ') {
      ctx.fillStyle = this.colors[role]!;
      ctx.fillText(ch, x0, (y0 + y1) / 2);
    }
  }

  beginFg(): void {
    this.fgCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.fgCtx.clearRect(0, 0, this.fg.width, this.fg.height);
  }

  /** Draws a sprite with its top-left at CSS (x, y); `scale` is in device pixels per sprite pixel. */
  drawSprite(sprite: Sprite, x: number, y: number, scale: number, flip = false): void {
    const ctx = this.fgCtx;
    const dpr = this.metrics.dpr;
    const img = this.spriteCanvas(sprite);
    ctx.imageSmoothingEnabled = false;
    const dx = Math.round(x * dpr), dy = Math.round(y * dpr);
    const w = sprite.w * scale, h = sprite.h * scale;
    if (flip) {
      ctx.setTransform(-1, 0, 0, 1, dx + w, dy);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      ctx.drawImage(img, dx, dy, w, h);
    }
  }

  private spriteCanvas(sprite: Sprite): HTMLCanvasElement {
    let c = this.spriteCache.get(sprite);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = sprite.w;
    c.height = sprite.h;
    const ctx = c.getContext('2d')!;
    sprite.pixels.forEach((color, i) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(i % sprite.w, Math.floor(i / sprite.w), 1, 1);
    });
    this.spriteCache.set(sprite, c);
    return c;
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    const dpr = this.metrics.dpr;
    this.fgCtx.fillStyle = color;
    this.fgCtx.fillRect(Math.round(x * dpr), Math.round(y * dpr), Math.round(w * dpr), Math.round(h * dpr));
  }

  strokeRect(x: number, y: number, w: number, h: number, color: string, width = 1): void {
    const dpr = this.metrics.dpr;
    this.fgCtx.strokeStyle = color;
    this.fgCtx.lineWidth = width * dpr;
    this.fgCtx.strokeRect(Math.round(x * dpr) + 0.5, Math.round(y * dpr) + 0.5, Math.round(w * dpr), Math.round(h * dpr));
  }

  /** Text on the fg layer at CSS coordinates (top-left). Defaults to the grid's font size. */
  text(str: string, x: number, y: number, color: string, fontPx = this.metrics.fontPx, bold = false): void {
    const dpr = this.metrics.dpr;
    const ctx = this.fgCtx;
    ctx.font = `${bold ? 'bold ' : ''}${fontPx * dpr}px ${MONO_FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x * dpr), Math.round(y * dpr));
  }

  /** Text on the fg layer aligned to grid cells, with an optional opaque box behind it. */
  cellText(str: string, col: number, row: number, role: ColorRole, boxRole: ColorRole | null = null): void {
    const m = this.metrics;
    if (boxRole) this.fillRect(col * m.cellW, row * m.cellH, [...str].length * m.cellW, m.cellH, this.color(boxRole));
    const ctx = this.fgCtx;
    ctx.font = `${m.fontPx * m.dpr}px ${MONO_FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.color(role);
    let c = col;
    for (const ch of str) {
      ctx.fillText(ch, Math.floor(c * m.cellW * m.dpr), Math.floor((row + 0.5) * m.cellH * m.dpr));
      c++;
    }
  }
}
