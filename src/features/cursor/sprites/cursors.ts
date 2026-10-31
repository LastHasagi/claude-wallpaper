import { CURSOR_GRID as N, type CursorArt, type CursorKind } from '../../../shared/cursor';
import { parseSprite, type Sprite } from '../../../shared/render/sprite';
import { PALETTE } from '../../clawd/index';

/** 16×16 drawing grid of palette letters. */
class Grid {
  private readonly px = Array.from({ length: N }, () => new Array<string>(N).fill('.'));

  set(x: number, y: number, c: string): this {
    if (x >= 0 && x < N && y >= 0 && y < N) this.px[y]![x] = c;
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

  /** Dark 1-px outline around everything drawn, so the pointer shows on any background. */
  outline(): this {
    const filled = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N && this.px[y]![x] !== '.';
    const ring: [number, number][] = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) ring.push([x, y]);
      }
    }
    for (const [x, y] of ring) this.set(x, y, 'K');
    return this;
  }

  sprite(): Sprite {
    return parseSprite(this.px.map((r) => r.join('')), PALETTE);
  }
}

/** Classic pointer mask (16-px arrow), tip at the top-left. */
const ARROW = [
  '#......',
  '##.....',
  '###....',
  '####...',
  '#####..',
  '######.',
  '#######',
  '####...',
  '##.##..',
  '#...##.',
  '....##.',
  '.....##',
  '.....##',
];
/** Just the arrow head: Clawd himself is the tail of his pointers. */
const ARROW_HEAD = ARROW.slice(0, 6);

type Eyes = 'open' | 'blink' | 'left' | 'up';
type Legs = 'stand' | 'a' | 'b';

/** Clawd in miniature, proportioned like the big sprite: body `w`×6, legs 1×2, eyes 1×2. */
function clawd(g: Grid, x: number, y: number, o: { w?: number; eyes?: Eyes; legs?: Legs; arms?: 'side' | 'swingA' | 'swingB' } = {}): Grid {
  const w = o.w ?? 10;
  const eyes = o.eyes ?? 'open', legs = o.legs ?? 'stand';
  [1, 3, w - 4, w - 2].forEach((lx, i) => {
    const up = (legs === 'a' && i % 2 === 1) || (legs === 'b' && i % 2 === 0);
    g.rect(x + lx, y + 6, 1, up ? 1 : 2, 'L');
  });
  g.rect(x, y, w, 1, 'H');
  g.rect(x, y + 1, 1, 4, 'h');
  g.rect(x + 1, y + 1, w - 2, 4, 'O');
  g.rect(x + w - 1, y + 1, 1, 4, 'S');
  g.rect(x, y + 5, w, 1, 'S');
  if (o.arms) {
    const [l, r] = o.arms === 'swingA' ? [2, 3] : o.arms === 'swingB' ? [3, 2] : [3, 3];
    g.rect(x - 1, y + l, 1, 2, 'O');
    g.rect(x + w, y + r, 1, 2, 'O');
  }
  const shift = eyes === 'left' ? -1 : 0;
  for (const ex of [x + 2, x + w - 3]) {
    if (eyes === 'blink') g.set(ex, y + 3, 'K');
    else if (eyes === 'up') g.rect(ex - 1, y + 1, 1, 2, 'K');
    else g.rect(ex + shift, y + 2, 1, 2, 'K');
  }
  return g;
}

const done = (g: Grid) => g.outline().sprite();

// --- The user's own pointer, as Clawd sees it (drawn while it flies into his mouth) ------------

export const SYSTEM_ARROW: Sprite = done(new Grid().shape(ARROW, 1, 2, 'W'));
export const SYSTEM_HOTSPOT = { x: 1, y: 1 };

// --- Clawd's pointers ---------------------------------------------------------------------------

/** Arrow head with Clawd as its tail. Blinks and glances around. */
const arrowFrames = (['open', 'blink', 'left'] as const).map((eyes) =>
  done(clawd(new Grid().shape(ARROW_HEAD, 1, 1, 'O', 'H'), 4, 7, { eyes, arms: 'side' })),
);

/** Clawd pointing up with his claw: the claw tip clicks. */
const handFrames = (['up', 'blink'] as const).map((eyes) => {
  const g = new Grid().rect(2, 2, 2, 7, 'O').rect(2, 2, 1, 7, 'H').set(2, 1, 'H');
  return done(clawd(g, 4, 6, { eyes, arms: undefined }).rect(14, 9, 1, 2, 'O'));
});

/** Orange I-beam that blinks like a text caret. */
const textFrames = (['O', 'S'] as const).map((c) =>
  done(new Grid().shape(['##.##'], 5, 1, c).rect(7, 2, 1, 12, c).shape(['##.##'], 5, 14, c)),
);

/** Clawd running in place, with speed lines. */
const busyFrames = (['a', 'b'] as const).map((legs, i) => {
  const g = new Grid().rect(0, 6 + i * 2, 2, 1, 'S').rect(0, 9 - i * 2, 1, 1, 'S');
  return done(clawd(g, 3, 4 + i, { legs, arms: i ? 'swingB' : 'swingA' }));
});

/** Arrow head with a tiny Clawd running as its tail. */
const workingFrames = (['a', 'b'] as const).map((legs, i) =>
  done(clawd(new Grid().shape(ARROW_HEAD, 1, 1, 'O', 'H'), 4, 7 + i, { legs, arms: i ? 'swingB' : 'swingA' })),
);

/** "Not allowed" sign that shakes its head. */
const noFrames = [-1, 0, 1].map((dx) => {
  const g = new Grid();
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - 7.5 - dx, y - 7.5);
      const slash = d < 5 && Math.abs(x - dx - y) <= 1;
      if ((d >= 4.8 && d <= 6.6) || slash) g.set(x, y, 'O');
    }
  }
  return done(g);
});

export const CLAWD_CURSORS: Readonly<Record<CursorKind, CursorArt>> = {
  arrow: { kind: 'arrow', frames: arrowFrames, fps: 4, hotspot: { x: 1, y: 1 }, sequence: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 2, 2, 2] },
  hand: { kind: 'hand', frames: handFrames, fps: 3, hotspot: { x: 2, y: 1 }, sequence: [0, 0, 0, 0, 0, 0, 0, 1] },
  text: { kind: 'text', frames: textFrames, fps: 2, hotspot: { x: 7, y: 8 }, sequence: [0, 0, 0, 1] },
  busy: { kind: 'busy', frames: busyFrames, fps: 8, hotspot: { x: 8, y: 8 } },
  working: { kind: 'working', frames: workingFrames, fps: 8, hotspot: { x: 1, y: 1 } },
  no: { kind: 'no', frames: noFrames, fps: 10, hotspot: { x: 8, y: 8 }, sequence: [0, 1, 2, 1, 0, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
};

export const CLAWD_CURSOR_LIST: readonly CursorArt[] = Object.values(CLAWD_CURSORS);
