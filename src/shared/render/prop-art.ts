import type { ColorRole } from './roles';

export interface Anchor {
  x: number;
  y: number;
}

/** Multi-line ASCII art with optional per-character colour masks and animation frames. */
export interface PropArt {
  w: number;
  h: number;
  frames: string[][];
  masks: (string[] | null)[];
  roles: Record<string, ColorRole>;
  role: ColorRole;
  anchors: Record<string, Anchor>;
  /** Spaces between the first and last visible char of a line hide what is behind them. */
  solidInterior: boolean;
}

export interface PropArtDef {
  frames: string[][];
  /** One mask per frame (or a single mask for all frames). Mask chars index `roles`; others use `role`. */
  mask?: string[][];
  roles?: Record<string, ColorRole>;
  role?: ColorRole;
  anchors?: Record<string, Anchor>;
  solidInterior?: boolean;
}

export function parsePropArt(def: PropArtDef): PropArt {
  const first = def.frames[0];
  if (!first) throw new Error('prop art needs at least one frame');
  const h = first.length;
  for (const f of def.frames) {
    if (f.length !== h) throw new Error(`prop art frames must share the same height (${h} vs ${f.length})`);
  }
  const w = Math.max(...def.frames.flat().map((l) => l.length));
  const pad = (lines: string[]) => lines.map((l) => l.padEnd(w, ' '));
  const masks = def.frames.map((_, i) => {
    const m = def.mask?.[i] ?? def.mask?.[0];
    if (!m) return null;
    if (m.length !== h) throw new Error(`prop mask must have ${h} lines, got ${m.length}`);
    if (m.some((l) => l.length > w)) throw new Error('prop mask line wider than the art');
    return pad(m);
  });
  return {
    w,
    h,
    frames: def.frames.map(pad),
    masks,
    roles: def.roles ?? {},
    role: def.role ?? 'strong',
    anchors: def.anchors ?? {},
    solidInterior: def.solidInterior ?? true,
  };
}
