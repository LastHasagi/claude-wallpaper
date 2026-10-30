import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { createRng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { ActionQueue, play, wait, walkTo } from '../../src/features/clawd/model/actions';
import { ClawdModel } from '../../src/features/clawd/model/clawd-model';
import { simulate } from '../helpers';

const STAGE = { minX: 100, maxX: 1800, groundY: 1000, scale: 3 };

function makeClawd(hour = 14, seed = 1) {
  const bus = new EventBus<ClawdEvents>();
  const c = new ClawdController(bus, createRng(seed), fixedClock(hour));
  c.setStage(STAGE, true);
  const events: string[] = [];
  bus.on('clawd:reaction', (k) => events.push(k));
  bus.on('clawd:clicked', () => events.push('clicked'));
  return { c, events, step: (s: number) => simulate(s, (dt) => c.update(dt)) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ActionQueue', () => {
  it('runs actions in order', async () => {
    const m = new ClawdModel();
    const q = new ActionQueue();
    const order: string[] = [];
    q.enqueue(wait(0.1)).then(() => order.push('a'));
    q.enqueue(wait(0.1)).then(() => order.push('b'));
    simulate(0.5, (dt) => q.update(m, dt));
    await flush();
    expect(order).toEqual(['a', 'b']);
  });

  it('pauses the main action during an interrupt and resumes it', async () => {
    const m = new ClawdModel();
    m.stage = { ...STAGE };
    m.x = 0;
    const q = new ActionQueue();
    const done = vi.fn();
    q.enqueue(walkTo(300, 100)).then(done);
    simulate(1, (dt) => q.update(m, dt));
    const xBefore = m.x;
    q.interrupt(play('laugh', { duration: 1 }));
    simulate(0.9, (dt) => q.update(m, dt));
    expect(m.x).toBe(xBefore);
    expect(m.pose).toBe('laugh');
    simulate(3, (dt) => q.update(m, dt));
    await flush();
    expect(m.x).toBe(300);
    expect(done).toHaveBeenCalled();
  });

  it('cancelMain rejects pending actions with AbortError', async () => {
    const m = new ClawdModel();
    const q = new ActionQueue();
    const p1 = q.enqueue(wait(5));
    const p2 = q.enqueue(wait(5));
    q.update(m, 0.1);
    q.cancelMain();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });
    expect(q.busy).toBe(false);
  });

  it('honours AbortSignal', async () => {
    const q = new ActionQueue();
    const ctl = new AbortController();
    const p = q.enqueue(wait(5), ctl.signal);
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('play() ends after its duration and restores eyes', async () => {
    const m = new ClawdModel();
    const q = new ActionQueue();
    const done = vi.fn();
    q.enqueue(play('laugh', { duration: 1, eyes: 'happy' })).then(done);
    simulate(0.5, (dt) => q.update(m, dt));
    expect(m.eyes).toBe('happy');
    simulate(0.6, (dt) => q.update(m, dt));
    await flush();
    expect(done).toHaveBeenCalled();
    expect(m.eyes).toBe('open');
  });
});

describe('ClawdController', () => {
  it('walkTo arrives, faces the right way and walks', async () => {
    const { c, step } = makeClawd();
    c.setAutonomy(false);
    c.placeAt(500);
    const p = c.walkTo(200);
    step(0.1);
    expect(c.model.facing).toBe(-1);
    expect(c.model.pose).toBe('walk');
    step(5);
    await p;
    expect(c.x()).toBe(200);
    expect(c.model.pose).toBe('idle');
  });

  it('a click on Clawd makes him jump and laugh', () => {
    const { c, events, step } = makeClawd();
    c.setAutonomy(false);
    const b = c.bounds();
    c.onCursor({ type: 'down', x: b.x + b.w / 2, y: b.y + b.h / 2, t: 0 });
    step(0.1);
    expect(events).toEqual(['clicked', 'laugh']);
    expect(c.model.pose).toBe('jump');
    expect(c.model.jumpY).toBeGreaterThan(0);
  });

  it('a click elsewhere is ignored', () => {
    const { c, events } = makeClawd();
    c.onCursor({ type: 'down', x: 5, y: 5, t: 0 });
    expect(events).toEqual([]);
  });

  it('three quick clicks make him dizzy', () => {
    const { c, events, step } = makeClawd();
    c.setAutonomy(false);
    const b = c.bounds();
    // Aim at the body centre: he is mid-jump during the second click.
    const at = (t: number) => c.onCursor({ type: 'down', x: b.x + b.w / 2, y: b.y + b.h / 2, t });
    at(0); step(0.3); at(300); step(0.3); at(600);
    expect(events).toContain('dizzy');
  });

  it('a fast cursor close by startles him (with cooldown)', () => {
    const { c, events } = makeClawd();
    const ctr = c.model.center();
    c.onCursor({ type: 'move', x: ctr.x - 300, y: ctr.y, t: 0 });
    c.onCursor({ type: 'move', x: ctr.x - 10, y: ctr.y, t: 50 }); // 5800 px/s
    c.onCursor({ type: 'move', x: ctr.x + 280, y: ctr.y, t: 100 });
    expect(events.filter((e) => e === 'startle')).toHaveLength(1);
  });

  it('a slow cursor does not startle him', () => {
    const { c, events } = makeClawd();
    const ctr = c.model.center();
    c.onCursor({ type: 'move', x: ctr.x - 50, y: ctr.y, t: 0 });
    c.onCursor({ type: 'move', x: ctr.x - 10, y: ctr.y, t: 500 });
    expect(events).not.toContain('startle');
  });

  it('waves at a cursor resting nearby, then waits 20 s before waving again', () => {
    const { c, events, step } = makeClawd();
    c.setAutonomy(false);
    const ctr = c.model.center();
    c.onCursor({ type: 'move', x: ctr.x + c.bodyWidth() * 2, y: ctr.y, t: 0 });
    step(1.2);
    expect(events).toContain('wave');
    step(10);
    expect(events.filter((e) => e === 'wave')).toHaveLength(1);
    step(15);
    expect(events.filter((e) => e === 'wave')).toHaveLength(2);
  });

  it('eyes follow a nearby cursor but not a far one', () => {
    const { c, step } = makeClawd();
    c.setAutonomy(false);
    const ctr = c.model.center();
    c.onCursor({ type: 'move', x: ctr.x + 100, y: ctr.y, t: 0 });
    step(0.05);
    expect(c.model.look).toEqual({ x: ctr.x + 100, y: ctr.y });
    c.onCursor({ type: 'move', x: ctr.x + c.bodyWidth() * 20, y: ctr.y, t: 5000 });
    step(0.05);
    expect(c.model.look).toBeNull();
  });

  it('lives on his own when autonomous', () => {
    const { c, step } = makeClawd();
    const poses = new Set<string>();
    const xs = new Set<number>();
    for (let i = 0; i < 600; i++) {
      step(0.5);
      poses.add(c.model.pose);
      xs.add(Math.round(c.x()));
    }
    expect(poses.size).toBeGreaterThanOrEqual(3);
    expect(xs.size).toBeGreaterThan(10);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(STAGE.minX - 1);
      expect(x).toBeLessThanOrEqual(STAGE.maxX + 1);
    }
  });

  it('naps far more at night than in the afternoon', () => {
    const count = (hour: number) => {
      const { c } = makeClawd(hour, 99);
      let naps = 0;
      for (let i = 0; i < 2000; i++) if (c.brain.pickIdle() === 'nap') naps++;
      return naps;
    };
    expect(count(2)).toBeGreaterThan(count(14) * 4);
  });

  it('turning autonomy off cancels idle activities', async () => {
    const { c, step } = makeClawd();
    step(3);
    c.setAutonomy(false);
    expect(c.queue.busy).toBe(false);
    step(5);
    expect(c.queue.busy).toBe(false);
  });
});
