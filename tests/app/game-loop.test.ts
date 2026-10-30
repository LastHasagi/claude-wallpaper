import { describe, expect, it } from 'vitest';
import { GameLoop, STEP } from '../../src/app/game-loop';

function counter() {
  const c = { updates: 0, renders: 0, simulated: 0 };
  const loop = new GameLoop({
    update: (dt) => { c.updates++; c.simulated += dt; },
    render: () => { c.renders++; },
  });
  return { c, loop };
}

describe('GameLoop', () => {
  it('updates in fixed steps', () => {
    const { c, loop } = counter();
    for (let i = 0; i < 60; i++) loop.advance(1 / 60);
    expect(c.updates).toBe(60);
    expect(c.simulated).toBeCloseTo(1, 5);
  });

  it('carries leftover time between frames', () => {
    const { c, loop } = counter();
    loop.advance(STEP * 0.6);
    expect(c.updates).toBe(0);
    loop.advance(STEP * 0.6);
    expect(c.updates).toBe(1);
  });

  it('clamps huge frames', () => {
    const { c, loop } = counter();
    loop.advance(10);
    expect(c.simulated).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('applies timeScale', () => {
    const { c, loop } = counter();
    loop.timeScale = 4;
    for (let i = 0; i < 60; i++) loop.advance(1 / 60);
    expect(c.simulated).toBeCloseTo(4, 3);
  });

  it('caps rendering at the configured fps', () => {
    const { c, loop } = counter();
    loop.fps = 30;
    for (let i = 0; i < 120; i++) loop.advance(1 / 60);
    expect(c.renders).toBeGreaterThanOrEqual(59);
    expect(c.renders).toBeLessThanOrEqual(61);
  });

  it('timeScale 0 freezes the simulation but keeps rendering', () => {
    const { c, loop } = counter();
    loop.timeScale = 0;
    for (let i = 0; i < 30; i++) loop.advance(1 / 30);
    expect(c.updates).toBe(0);
    expect(c.renders).toBeGreaterThan(0);
  });
});
