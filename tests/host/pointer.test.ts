import { describe, expect, it } from 'vitest';
import { insideViewport, shouldCapture, toLocal } from '../../src/host/pointer';

describe('pointer helpers', () => {
  it('converts global physical px into window CSS px', () => {
    expect(toLocal({ x: 1100, y: 900 }, { x: 100, y: 100 }, 2)).toEqual({ x: 500, y: 400 });
    expect(toLocal({ x: 50, y: 50 }, { x: 0, y: 0 }, 1)).toEqual({ x: 50, y: 50 });
  });

  it('knows when the cursor is inside the viewport', () => {
    expect(insideViewport({ x: 0, y: 0 }, 100, 100)).toBe(true);
    expect(insideViewport({ x: 100, y: 10 }, 100, 100)).toBe(false);
    expect(insideViewport({ x: -1, y: 10 }, 100, 100)).toBe(false);
  });

  it('captures the mouse only over interactive rects (with padding)', () => {
    const rects = [{ x: 100, y: 100, w: 50, h: 40 }];
    expect(shouldCapture({ x: 120, y: 120 }, rects)).toBe(true);
    expect(shouldCapture({ x: 97, y: 120 }, rects)).toBe(true);
    expect(shouldCapture({ x: 80, y: 120 }, rects)).toBe(false);
    expect(shouldCapture(null, rects)).toBe(false);
    expect(shouldCapture({ x: 120, y: 120 }, [])).toBe(false);
  });
});
