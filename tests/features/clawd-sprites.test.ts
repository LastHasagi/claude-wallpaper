import { describe, expect, it } from 'vitest';
import { BODY_H, BODY_W, POSES } from '../../src/features/clawd/sprites/body';
import { EYES, EYES_H, EYES_W } from '../../src/features/clawd/sprites/eyes';
import { HELD_ITEMS } from '../../src/features/clawd/sprites/props';

describe('clawd sprites', () => {
  it('every pose frame uses the shared canvas and keeps anchors inside it', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      expect(pose.frames.length, name).toBeGreaterThan(0);
      expect(pose.fps, name).toBeGreaterThan(0);
      for (const f of pose.frames) {
        expect([f.sprite.w, f.sprite.h], name).toEqual([BODY_W, BODY_H]);
        expect(f.eyes.x).toBeGreaterThanOrEqual(0);
        expect(f.eyes.x + EYES_W).toBeLessThanOrEqual(BODY_W);
        expect(f.eyes.y + EYES_H).toBeLessThanOrEqual(BODY_H);
        expect(f.hand.x).toBeGreaterThan(0);
        expect(f.hand.y).toBeLessThan(BODY_H);
      }
    }
  });

  it('standing poses touch the ground (bottom row has leg pixels)', () => {
    for (const name of ['idle', 'walk', 'wave', 'sit', 'sleep', 'type'] as const) {
      const sp = POSES[name].frames[0]!.sprite;
      const bottom = sp.pixels.slice((sp.h - 1) * sp.w);
      expect(bottom.some(Boolean), name).toBe(true);
    }
  });

  it('eye blocks share a size', () => {
    for (const [name, sp] of Object.entries(EYES)) expect([sp.w, sp.h], name).toEqual([EYES_W, EYES_H]);
  });

  it('held items have consistent frames', () => {
    for (const [name, item] of Object.entries(HELD_ITEMS)) {
      const [first, ...rest] = item.frames;
      for (const f of rest) expect([f.w, f.h], name).toEqual([first!.w, first!.h]);
    }
  });
});
