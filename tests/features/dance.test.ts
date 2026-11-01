import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { createRng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { DANCE, DanceController, type DanceSetting } from '../../src/features/dance';

const tick = () => new Promise<void>((r) => setImmediate(r));

function world(setting: DanceSetting = 'sometimes') {
  const bus = new EventBus<ClawdEvents>();
  const clawd = new ClawdController(bus, createRng(5), fixedClock(12));
  clawd.setStage({ minX: 60, maxX: 1440, groundY: 700, scale: 3 }, true);
  let current = setting;
  const dance = new DanceController({ clawd, rng: createRng(3), setting: () => current });
  const poses = new Set<string>();
  async function run(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 30) {
      clawd.update(1 / 30);
      dance.update(1 / 30);
      poses.add(clawd.pose());
      await tick();
    }
  }
  return { clawd, dance, run, poses, set: (s: DanceSetting) => (current = s) };
}

describe('dance', () => {
  it('dances while media plays, with notes', async () => {
    const w = world();
    w.dance.music(true);
    await w.run(3);
    expect(w.dance.model.dancing).toBe(true);
    expect(w.poses.has('dance')).toBe(true);
    expect(['♪', '♫', '♪ ♫']).toContain(w.clawd.model.emote?.text);
  });

  it('stops as soon as the music stops, and he gets his life back', async () => {
    const w = world();
    w.dance.music(true);
    await w.run(2);
    w.dance.music(false);
    await w.run(0.5);
    expect(w.dance.model.dancing).toBe(false);
    expect(w.clawd.busy()).toBe(false);
  });

  it('never dances when turned off', async () => {
    const w = world('off');
    w.dance.music(true);
    await w.run(3);
    expect(w.poses.has('dance')).toBe(false);
  });

  it('turning it off mid-dance stops him', async () => {
    const w = world();
    w.dance.music(true);
    await w.run(2);
    w.set('off');
    await w.run(0.5);
    expect(w.dance.model.dancing).toBe(false);
  });

  it('does not start while something else drives him (a mission)', async () => {
    const w = world();
    w.clawd.setAutonomy(false);
    w.dance.music(true);
    await w.run(3);
    expect(w.poses.has('dance')).toBe(false);
  });

  it('"sometimes": dances in rounds and rests in between', async () => {
    const w = world('sometimes');
    w.dance.music(true);
    await w.run(DANCE.boutMax + 3);
    expect(w.dance.model.dancing).toBe(false);
    expect(w.dance.model.restLeft).toBeGreaterThan(0);
  });

  it('"always": keeps dancing (missions wait, since he is busy)', async () => {
    const w = world('always');
    w.dance.music(true);
    await w.run(DANCE.boutMax + 3);
    expect(w.dance.model.dancing).toBe(true);
    expect(w.clawd.busy()).toBe(true);
  });
});
