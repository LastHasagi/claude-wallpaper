import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { createRng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { SceneController } from '../../src/features/scene';
import { MISSIONS } from '../../src/features/missions';
import { FACTS, NotePicker, NotesController, SEEN_KEY, wrap, type Fact, type NotesEvents, type NotesSetting } from '../../src/features/notes';
import { MemoryStorage } from '../helpers';

const TOPICS = new Set(['birds', 'books', 'computing', 'general']);

describe('facts content', () => {
  it('has unique ids, known topics and both languages within 180 chars', () => {
    const ids = new Set<string>();
    for (const f of FACTS) {
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      expect(TOPICS.has(f.topic), f.id).toBe(true);
      for (const lang of ['pt', 'en'] as const) {
        expect(f[lang].trim().length, `${f.id}.${lang}`).toBeGreaterThan(10);
        expect(f[lang].length, `${f.id}.${lang}`).toBeLessThanOrEqual(180);
      }
    }
  });

  it('covers every mission topic with at least 8 facts', () => {
    for (const m of MISSIONS) expect(FACTS.filter((f) => f.topic === m.noteTopic).length, m.noteTopic).toBeGreaterThanOrEqual(8);
  });
});

describe('wrap', () => {
  it('wraps on word boundaries within the width', () => {
    const lines = wrap('the quick brown fox jumps over the lazy dog', 10);
    expect(lines).toEqual(['the quick', 'brown fox', 'jumps over', 'the lazy', 'dog']);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(10);
  });

  it('hard-splits words longer than a line', () => {
    expect(wrap('abcdefghijkl xy', 5)).toEqual(['abcde', 'fghij', 'kl xy']);
  });

  it('keeps every word of real facts', () => {
    for (const f of FACTS) {
      expect(wrap(f.pt, 38).join(' ')).toBe(f.pt.split(/\s+/).join(' '));
    }
  });
});

const facts: Fact[] = [
  { id: 'b1', topic: 'birds', pt: 'b1', en: 'b1' },
  { id: 'b2', topic: 'birds', pt: 'b2', en: 'b2' },
  { id: 'g1', topic: 'general', pt: 'g1', en: 'g1' },
  { id: 'c1', topic: 'computing', pt: 'c1', en: 'c1' },
];

describe('NotePicker', () => {
  it('prefers the topic, then general, then anything, without repeats', () => {
    const p = new NotePicker(facts, new MemoryStorage(), createRng(1));
    const got = [p.pick('birds'), p.pick('birds'), p.pick('birds'), p.pick('birds')].map((f) => f.id);
    expect(got.slice(0, 2).sort()).toEqual(['b1', 'b2']);
    expect(got[2]).toBe('g1');
    expect(got[3]).toBe('c1');
  });

  it('starts a new cycle when exhausted, never repeating the last fact immediately', () => {
    const p = new NotePicker(facts, new MemoryStorage(), createRng(2));
    let last = '';
    for (let i = 0; i < 40; i++) {
      const f = p.pick('birds');
      expect(f.id).not.toBe(last);
      last = f.id;
    }
  });

  it('remembers what was shown across restarts and ignores corrupt history', () => {
    const storage = new MemoryStorage();
    new NotePicker(facts, storage, createRng(3)).pick('computing');
    expect(JSON.parse(storage.get(SEEN_KEY)!)).toEqual(['c1']);
    expect(new NotePicker(facts, storage, createRng(4)).seenCount).toBe(1);
    storage.set(SEEN_KEY, '{oops');
    expect(new NotePicker(facts, storage, createRng(5)).seenCount).toBe(0);
  });
});

const tick = () => new Promise<void>((r) => setImmediate(r));

function notesWorld(setting: NotesSetting = 'always', mode: 'full' | 'overlay' = 'full') {
  const bus = new EventBus<ClawdEvents & NotesEvents>();
  const scene = new SceneController(fixedClock(12), mode, () => 1);
  const l = scene.resize(150, 40, 10, 20, 800, mode === 'overlay' ? 48 : 0);
  const clawd = new ClawdController(bus, createRng(5), fixedClock(12));
  clawd.setStage({ minX: 60, maxX: 1440, groundY: l.groundY, scale: 3 }, true);
  clawd.setAutonomy(false);
  const notes = new NotesController({
    clawd, scene, bus, mode,
    picker: new NotePicker(FACTS, new MemoryStorage(), createRng(6)),
    rng: createRng(7),
    lang: () => 'pt',
    setting: () => setting,
    metrics: () => ({ cellW: 10, cellH: 20, cssW: 1500 }),
  });
  const events: string[] = [];
  bus.on('note:shown', () => events.push('shown'));
  bus.on('note:dismissed', () => events.push('dismissed'));
  async function run(seconds: number, until?: () => boolean) {
    for (let t = 0; t < seconds; t += 1 / 30) {
      clawd.update(1 / 30);
      notes.update(1 / 30);
      await tick();
      if (until?.()) return;
    }
  }
  return { clawd, notes, events, run };
}

describe('NotesController', () => {
  it('delivers a note: walks with the notepad, sticks it up, then it can be clicked away', async () => {
    const w = notesWorld('always');
    let carried = false;
    const done = w.notes.maybeDeliver('birds');
    let finished = false;
    void done.then(() => (finished = true));
    await w.run(30, () => {
      if (w.clawd.model.held === 'notepad' && w.clawd.model.pose === 'carry') carried = true;
      return finished;
    });
    expect(carried).toBe(true);
    expect(w.events).toEqual(['shown']);
    expect(w.clawd.model.held).toBeNull();
    const note = w.notes.model.note!;
    expect(note.fact.topic).toBe('birds');

    await w.run(1);
    const rect = w.notes.interactiveRects()[0]!;
    expect(rect.w).toBeGreaterThan(0);
    const consumed = w.notes.onCursor({ type: 'down', x: rect.x + 5, y: rect.y + 5, t: 0 });
    expect(consumed).toBe(true);
    expect(w.events).toEqual(['shown', 'dismissed']);
    await w.run(1);
    expect(w.notes.model.note).toBeNull();
  });

  it('ignores clicks outside the card', async () => {
    const w = notesWorld('always');
    const p = w.notes.maybeDeliver('books');
    let finished = false;
    void p.then(() => (finished = true));
    await w.run(30, () => finished);
    expect(w.notes.onCursor({ type: 'down', x: 1, y: 1, t: 0 })).toBe(false);
    expect(w.notes.model.note).not.toBeNull();
  });

  it('announcements show their own title and run their action when clicked', async () => {
    const w = notesWorld('off'); // announcements ignore the curiosities setting
    w.clawd.setAutonomy(true); // free time: an announcement waits while a mission runs
    const opened: string[] = [];
    w.notes.announce(
      { id: 'update-9.9.9', topic: 'app', pt: 'Saiu a versão 9.9.9!', en: 'Version 9.9.9 is out!', title: { pt: 'Novidade!', en: 'New!' } },
      () => opened.push('release page'),
    );
    await w.run(30, () => w.notes.model.note?.phase === 'shown');
    expect(w.notes.model.note?.fact.title?.pt).toBe('Novidade!');
    const rect = w.notes.interactiveRects()[0]!;
    w.notes.onCursor({ type: 'down', x: rect.x + 4, y: rect.y + 4, t: 0 });
    expect(opened).toEqual(['release page']);
    // A regular curiosity afterwards has no action attached.
    await w.run(1);
    void w.notes.deliver('general');
    await w.run(30, () => w.notes.model.note?.phase === 'shown');
    const r2 = w.notes.interactiveRects()[0]!;
    w.notes.onCursor({ type: 'down', x: r2.x + 4, y: r2.y + 4, t: 0 });
    expect(opened).toEqual(['release page']);
  });

  it('respects the "off" setting', async () => {
    const w = notesWorld('off');
    await w.notes.maybeDeliver('birds');
    expect(w.notes.model.note).toBeNull();
    expect(w.events).toEqual([]);
  });

  it('"sometimes" delivers roughly half of the time', () => {
    const w = notesWorld('sometimes');
    let yes = 0;
    for (let i = 0; i < 400; i++) if (w.notes.shouldDeliver()) yes++;
    expect(yes).toBeGreaterThan(140);
    expect(yes).toBeLessThan(260);
  });

  it('places the overlay card entirely above Clawd, close to his head', async () => {
    const w = notesWorld('always', 'overlay');
    let finished = false;
    void w.notes.maybeDeliver('general').then(() => (finished = true));
    await w.run(30, () => finished);
    const card = w.notes.cardRect()!;
    const head = w.clawd.bounds().y;
    expect(card.y + card.h).toBeLessThanOrEqual(head);
    expect(card.y + card.h).toBeGreaterThan(head - w.clawd.bodyWidth());
  });
});
