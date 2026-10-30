import { describe, expect, it } from 'vitest';
import { AsciiGrid } from '../../src/shared/render/ascii-grid';
import { PALETTES, COLOR_ROLES } from '../../src/shared/render/roles';
import { parsePropArt } from '../../src/shared/render/prop-art';
import { parseSprite } from '../../src/shared/render/sprite';

describe('AsciiGrid', () => {
  it('ignores out-of-bounds writes and reads', () => {
    const g = new AsciiGrid(4, 2);
    g.set(-1, 0, 'x', 'mid');
    g.set(4, 0, 'x', 'mid');
    g.set(0, 2, 'x', 'mid');
    expect(g.get(-1, 0)).toBeNull();
    expect(g.toString()).toBe('    \n    ');
  });

  it('floors fractional coordinates instead of silently dropping writes', () => {
    const g = new AsciiGrid(4, 3);
    g.set(1.7, 1.2, 'x', 'mid');
    expect(g.get(1, 1)).toEqual({ ch: 'x', role: 'mid' });
    expect(g.get(1.9, 1.9)?.ch).toBe('x');
  });

  it('writes text with a role and clips at the edge', () => {
    const g = new AsciiGrid(5, 1);
    g.text(2, 0, 'abcd', 'accent');
    expect(g.toString()).toBe('  abc');
    expect(g.get(2, 0)).toEqual({ ch: 'a', role: 'accent' });
  });

  it('fills rects', () => {
    const g = new AsciiGrid(4, 3);
    g.fillRect(1, 1, 2, 2, '#', 'dim');
    expect(g.toString()).toBe('    \n ## \n ## ');
  });

  it('blits props: outer spaces are transparent, inner spaces are opaque', () => {
    const g = new AsciiGrid(7, 2);
    g.fillRect(0, 0, 7, 2, '.', 'faint');
    const art = parsePropArt({ frames: [[' a b ', '  c']], role: 'strong' });
    g.blit(art, 1, 0);
    expect(g.toString()).toBe('..a b..\n...c...');
    expect(g.get(3, 0)).toEqual({ ch: ' ', role: 'bg' });
    expect(g.get(2, 0)).toEqual({ ch: 'a', role: 'strong' });
    expect(g.get(1, 0)).toEqual({ ch: '.', role: 'faint' });
  });

  it('applies masks through the role map', () => {
    const g = new AsciiGrid(3, 1);
    const art = parsePropArt({ frames: [['(*)']], mask: [['.a.']], roles: { a: 'accent' }, role: 'mid' });
    g.blit(art, 0, 0);
    expect(g.get(0, 0)?.role).toBe('mid');
    expect(g.get(1, 0)?.role).toBe('accent');
  });

  it('outlines filled cells with bg', () => {
    const g = new AsciiGrid(3, 3);
    g.set(1, 1, 'x', 'strong');
    g.outline('bg');
    expect(g.get(0, 0)).toEqual({ ch: ' ', role: 'bg' });
    expect(g.get(1, 1)).toEqual({ ch: 'x', role: 'strong' });
    expect(g.get(2, 2)).toEqual({ ch: ' ', role: 'bg' });
  });

  it('diffs and clones', () => {
    const a = new AsciiGrid(3, 1);
    const b = a.clone();
    b.set(1, 0, 'x', 'mid');
    expect(a.diff(b)).toEqual([1]);
    expect(a.diff(a.clone())).toEqual([]);
  });
});

describe('palettes', () => {
  it('define every role as hex for both themes', () => {
    for (const theme of Object.values(PALETTES)) {
      for (const role of COLOR_ROLES) {
        expect(theme.colors[role], `${theme.name}.${role}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('parsePropArt', () => {
  it('pads ragged lines and keeps anchors', () => {
    const art = parsePropArt({ frames: [['ab', 'abcd']], anchors: { seat: { x: 1, y: 0 } } });
    expect(art.w).toBe(4);
    expect(art.h).toBe(2);
    expect(art.frames[0]).toEqual(['ab  ', 'abcd']);
    expect(art.anchors.seat).toEqual({ x: 1, y: 0 });
  });

  it('rejects masks with a different line count', () => {
    expect(() => parsePropArt({ frames: [['ab', 'cd']], mask: [['..']] })).toThrow(/mask/);
  });

  it('rejects frames with different heights', () => {
    expect(() => parsePropArt({ frames: [['ab'], ['ab', 'cd']] })).toThrow(/height/);
  });
});

describe('parseSprite', () => {
  const pal = { O: '#d77757', K: '#141414' };

  it('parses pixels with transparency', () => {
    const s = parseSprite(['.O', 'KO'], pal);
    expect(s.w).toBe(2);
    expect(s.h).toBe(2);
    expect(s.pixels).toEqual([null, '#d77757', '#141414', '#d77757']);
  });

  it('rejects unknown letters and ragged rows', () => {
    expect(() => parseSprite(['OX'], pal)).toThrow(/unknown/);
    expect(() => parseSprite(['OO', 'O'], pal)).toThrow(/width/);
  });
});
