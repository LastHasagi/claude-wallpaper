import { describe, expect, it } from 'vitest';
import { portrait, resolveWear } from '../../src/features/clawd';

describe('resolveWear', () => {
  it('auto follows the season', () => {
    expect(resolveWear('auto', 'auto', 'halloween')).toEqual({ head: 'witch', face: null });
    expect(resolveWear('auto', 'auto', 'natal')).toEqual({ head: 'santa', face: null });
    expect(resolveWear('auto', 'auto', 'carnaval')).toEqual({ head: null, face: 'mask' });
    expect(resolveWear('auto', 'auto', null)).toEqual({ head: null, face: null });
  });

  it("the user's pick wins over the season, all year", () => {
    expect(resolveWear('crown', 'shades', 'natal')).toEqual({ head: 'crown', face: 'shades' });
    expect(resolveWear('cap', 'auto', null)).toEqual({ head: 'cap', face: null });
  });

  it('none wears nothing, even in season', () => {
    expect(resolveWear('none', 'none', 'carnaval')).toEqual({ head: null, face: null });
  });
});

describe('portrait with accessories', () => {
  const opaque = (s: { pixels: (string | null)[] }) => s.pixels.filter(Boolean).length;

  it('is unchanged without accessories (app icon)', () => {
    expect(portrait()).toEqual(portrait({ head: null, face: null }));
  });

  it('grows upwards to fit a hat and draws it', () => {
    const plain = portrait(), crowned = portrait({ head: 'crown', face: null });
    expect(crowned.w).toBe(plain.w);
    expect(crowned.h).toBeGreaterThan(plain.h);
    expect(opaque(crowned)).toBeGreaterThan(opaque(plain));
  });

  it('draws face pieces over the eyes', () => {
    expect(portrait({ head: null, face: 'shades' }).pixels).not.toEqual(portrait().pixels);
  });
});
