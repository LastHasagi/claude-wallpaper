import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/shared/events';
import { createRng } from '../../src/shared/rng';
import { fixedClock } from '../../src/shared/time';
import { ClawdController, type ClawdEvents } from '../../src/features/clawd';
import { BELLY, BellyController, baseName, snackKind } from '../../src/features/belly';
import type { BellyPort, EatReport, Refusal } from '../../src/host/host';

const tick = () => new Promise<void>((r) => setImmediate(r));

/** Accepts names in `desktop`, refuses the rest; records calls. */
class FakeBelly implements BellyPort {
  calls: string[] = [];
  items: string[] = [];
  constructor(private readonly desktop = new Set(['notas.txt', 'Projeto', 'foto.png'])) {}
  async eat(paths: readonly string[]): Promise<EatReport> {
    this.calls.push(`eat:${paths.length}`);
    const r: EatReport = { eaten: [], refused: [], total: 0 };
    for (const p of paths) {
      const name = baseName(p);
      const why: Refusal | null = !this.desktop.has(name) ? 'notOnDesktop' : this.items.length >= 20 ? 'full' : null;
      if (why) r.refused.push([name, why]);
      else {
        this.items.push(name);
        r.eaten.push(name);
      }
    }
    r.total = this.items.length;
    return r;
  }
  async spit(): Promise<number> {
    this.calls.push('spit');
    const n = this.items.length;
    this.items = [];
    return n;
  }
}

const DESK = 'C:\\Users\\ana\\Desktop\\';

function world(port: FakeBelly | null = new FakeBelly()) {
  const bus = new EventBus<ClawdEvents>();
  const clawd = new ClawdController(bus, createRng(5), fixedClock(12));
  clawd.setStage({ minX: 60, maxX: 1440, groundY: 700, scale: 3 }, true);
  const belly = new BellyController({ clawd, port: port ?? undefined, rng: createRng(2), lang: () => 'pt' });
  let snacksSeen = 0;
  async function run(seconds: number, until?: () => boolean) {
    for (let t = 0; t < seconds; t += 1 / 30) {
      clawd.update(1 / 30);
      belly.update(1 / 30);
      snacksSeen = Math.max(snacksSeen, belly.model.snackFrames().length);
      await tick();
      if (until?.()) return;
    }
  }
  const on = () => {
    const b = clawd.bounds();
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  };
  const emotes: string[] = [];
  const watchEmotes = async (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      clawd.update(1 / 30);
      belly.update(1 / 30);
      const e = clawd.model.emote?.text;
      if (e && emotes.at(-1) !== e) emotes.push(e);
      await tick();
    }
  };
  return { clawd, belly, port: port as FakeBelly, run, on, emotes, watchEmotes, snacks: () => snacksSeen };
}

describe('belly helpers', () => {
  it('names and icon kinds from paths', () => {
    expect(baseName(`${DESK}notas.txt`)).toBe('notas.txt');
    expect(baseName('/home/ana/Desktop/Projeto/')).toBe('Projeto');
    expect(snackKind(`${DESK}notas.txt`)).toBe('file');
    expect(snackKind(`${DESK}Projeto`)).toBe('folder');
    expect(snackKind(`${DESK}Meu Projeto v2`)).toBe('folder');
  });
});

describe('BellyController', () => {
  it('opens his mouth while files are dragged over him, and closes it if they go away', () => {
    const w = world();
    w.belly.onDrag({ type: 'over', ...w.on(), paths: [] });
    expect(w.clawd.model.mouth).toBe('wide');
    expect(w.clawd.model.eyes).toBe('wide');
    w.belly.onDrag({ type: 'leave', x: -1, y: -1, paths: [] });
    expect(w.clawd.model.mouth).toBeNull();
    expect(w.clawd.model.eyes).toBe('open');
  });

  it('eats what is dropped on him: icons fly into his mouth, he chews and counts', async () => {
    const w = world();
    w.belly.onDrag({ type: 'drop', ...w.on(), paths: [`${DESK}notas.txt`, `${DESK}Projeto`] });
    await w.watchEmotes(5);
    expect(w.port.calls).toEqual(['eat:2']);
    expect(w.belly.model.count).toBe(2);
    expect(w.belly.model.kinds).toEqual(['file', 'folder']);
    expect(w.emotes).toEqual(['nhac!', '+2']);
    expect(w.belly.model.phase).toBe('idle');
    expect(w.clawd.busy()).toBe(false);
    expect(w.clawd.model.mouth).toBeNull();
  });

  it('shows the icons flying', async () => {
    const w = world();
    void w.belly.eat([`${DESK}notas.txt`, `${DESK}Projeto`, `${DESK}foto.png`], w.on());
    await w.run(5, () => w.belly.model.phase === 'idle' && w.belly.model.count > 0);
    expect(w.snacks()).toBe(3);
  });

  it('refuses what is not on the desktop, with a shake of the head', async () => {
    const w = world();
    void w.belly.eat(['D:\\Trabalho\\relatorio.docx'], w.on());
    await w.watchEmotes(3);
    expect(w.belly.model.count).toBe(0);
    expect(w.emotes).toEqual(['só do desktop!']);
  });

  it('a click on him gives everything back; a click when empty is not his business', async () => {
    const w = world();
    void w.belly.eat([`${DESK}notas.txt`], w.on());
    await w.run(5, () => w.belly.model.phase === 'idle' && w.belly.model.count === 1);
    expect(w.belly.onCursor({ type: 'down', ...w.on(), t: 0 })).toBe(true);
    await w.run(5, () => w.belly.model.phase === 'idle' && w.belly.model.count === 0);
    expect(w.port.calls).toEqual(['eat:1', 'spit']);
    expect(w.port.items).toEqual([]);
    expect(w.belly.onCursor({ type: 'down', ...w.on(), t: 0 })).toBe(false);
  });

  it('gives everything back on his own once digested', async () => {
    const w = world();
    void w.belly.eat([`${DESK}notas.txt`], w.on());
    await w.run(5, () => w.belly.model.phase === 'idle' && w.belly.model.count === 1);
    w.belly.model.fullFor = BELLY.digestFor;
    await w.run(5, () => w.belly.model.count === 0 && w.belly.model.phase === 'idle');
    expect(w.port.calls.at(-1)).toBe('spit');
  });

  it('on a mission he eats without the show, and the mission keeps control', async () => {
    const w = world();
    w.clawd.setAutonomy(false); // a mission is driving him
    await w.belly.eat([`${DESK}notas.txt`], w.on());
    expect(w.belly.model.count).toBe(1);
    expect(w.clawd.busy()).toBe(true); // autonomy still off: not handed back mid-mission
    expect(w.clawd.model.emote?.text).toBe('+1');
  });

  it('the tray gave the items back: the count resets', async () => {
    const w = world();
    void w.belly.eat([`${DESK}notas.txt`], w.on());
    await w.run(5, () => w.belly.model.phase === 'idle' && w.belly.model.count === 1);
    w.belly.spatElsewhere(1);
    expect(w.belly.model.count).toBe(0);
  });

  it('without a native belly (other systems, wallpaper mode) dropping does nothing', async () => {
    const w = world(null);
    w.belly.onDrag({ type: 'over', ...w.on(), paths: [] });
    w.belly.onDrag({ type: 'drop', ...w.on(), paths: [`${DESK}notas.txt`] });
    await w.run(1);
    expect(w.clawd.model.mouth).toBeNull();
    expect(w.belly.model.count).toBe(0);
  });
});
