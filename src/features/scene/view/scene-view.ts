import { hash2 } from '../../../shared/rng';
import { AsciiGrid } from '../../../shared/render/ascii-grid';
import type { TimeOfDay } from '../../../shared/time';
import type { DisplayMode } from '../../../host/host';
import { BIOMES, type BiomeCtx } from '../biomes';
import { PROP_FADE_TIME, type BiomeKey, type EffectState, type PropState, type SceneModel } from '../model/scene-model';
import type { Panel } from '../model/panels';

const SCRAMBLE = '01#$%&*+=?<>/\\';
const SWEEP = 10;
const BIRD_FORMATION: [dx: number, dy: number][] = [[0, 0], [-3, -1], [-3, 1], [-6, -2], [-6, 2]];

export interface SceneGeometry {
  cols: number;
  rows: number;
  /** One per monitor; a single screen is one panel covering the whole grid. */
  panels: Panel[];
}

/** Biome context of one panel: coordinates relative to the panel, seed varied per panel. */
export function panelCtx(key: BiomeKey, panel: Panel, index: number, tod: TimeOfDay): BiomeCtx {
  return { cols: panel.cols, rows: panel.rows, groundRow: panel.groundRow - panel.row0, tod, seed: key.seed + index * 7919 };
}

/** Composes the ASCII grid for a frame: backdrop (cached) + animation + props + effects + label. */
export class SceneView {
  private cache = new Map<string, AsciiGrid>();
  private work = new AsciiGrid(1, 1);
  private panelWork: AsciiGrid[] = [];

  private panelBackdrop(key: BiomeKey, panel: Panel, index: number, tod: TimeOfDay): AsciiGrid {
    const id = `p|${key.biome}|${key.seed}|${index}|${panel.cols}x${panel.rows}|${panel.groundRow - panel.row0}|${tod}`;
    let g = this.cache.get(id);
    if (!g) {
      g = new AsciiGrid(panel.cols, panel.rows);
      BIOMES[key.biome].paint(g, panelCtx(key, panel, index, tod));
      this.remember(id, g);
    }
    return g;
  }

  /** Static backdrop of every panel, pasted into one full-size grid. */
  backdrop(key: BiomeKey, geo: SceneGeometry, tod: TimeOfDay): AsciiGrid {
    const sig = geo.panels.map((p) => `${p.col0},${p.row0},${p.cols},${p.rows},${p.groundRow}`).join(';');
    const id = `all|${key.biome}|${key.seed}|${geo.cols}x${geo.rows}|${sig}|${tod}`;
    let g = this.cache.get(id);
    if (!g) {
      g = new AsciiGrid(geo.cols, geo.rows);
      geo.panels.forEach((p, i) => g!.paste(this.panelBackdrop(key, p, i, tod), p.col0, p.row0));
      this.remember(id, g);
    }
    return g;
  }

  private remember(id: string, g: AsciiGrid): void {
    if (this.cache.size >= 12) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(id, g);
  }

  compose(m: SceneModel, geo: SceneGeometry, tod: TimeOfDay, mode: DisplayMode): AsciiGrid {
    if (this.work.cols !== geo.cols || this.work.rows !== geo.rows) this.work = new AsciiGrid(geo.cols, geo.rows);
    const g = this.work;
    if (mode === 'full') {
      if (m.transition) this.sweep(g, m, geo, tod);
      else {
        g.copyFrom(this.backdrop(m.current, geo, tod));
        geo.panels.forEach((p, i) => {
          let sub = this.panelWork[i];
          if (!sub || sub.cols !== p.cols || sub.rows !== p.rows) sub = this.panelWork[i] = new AsciiGrid(p.cols, p.rows);
          sub.copyFrom(this.panelBackdrop(m.current, p, i, tod));
          BIOMES[m.current.biome].animate(sub, panelCtx(m.current, p, i, tod), m.time);
          g.paste(sub, p.col0, p.row0);
        });
      }
    } else {
      g.clear();
    }
    for (const p of m.props.values()) this.drawProp(g, p, m.time);
    for (const e of m.effects.values()) this.drawEffect(g, e, m);
    // Overlay: no opaque cells at all; the renderer gives each glyph its own halo instead.
    if (mode === 'overlay') g.clearRole('bg');
    else if (m.label && !m.transition) {
      const focus = geo.panels[m.current.focus ?? 0] ?? geo.panels[0]!;
      g.text(focus.col0 + 2, focus.row0 + 1, m.label, 'accent');
    }
    return g;
  }

  private sweep(g: AsciiGrid, m: SceneModel, geo: SceneGeometry, tod: TimeOfDay): void {
    const tr = m.transition!;
    const from = this.backdrop(tr.from, geo, tod);
    const to = this.backdrop(tr.to, geo, tod);
    const head = (tr.t / tr.duration) * (geo.cols + SWEEP * 2) - SWEEP;
    const bucket = Math.floor(m.time * 20);
    for (let c = 0; c < geo.cols; c++) {
      const phase = (head - c) / SWEEP;
      for (let r = 0; r < geo.rows; r++) {
        const src = phase < 0 ? from : to;
        const cell = src.get(c, r)!;
        if (phase >= 0 && phase <= 1 && (!from.isEmpty(c, r) || !to.isEmpty(c, r))) {
          const k = Math.floor(hash2(c * 13 + bucket, r * 7) * SCRAMBLE.length);
          g.set(c, r, SCRAMBLE[k]!, 'dim');
        } else {
          g.set(c, r, cell.ch, cell.role);
        }
      }
    }
  }

  private drawProp(g: AsciiGrid, p: PropState, time: number): void {
    if (p.phase === 'shown') {
      g.blit(p.art, p.col, p.row, p.frame);
      return;
    }
    // Scramble in/out: each cell settles at its own moment.
    const k = Math.min(p.t / PROP_FADE_TIME, 1);
    const shown = p.phase === 'in' ? k : 1 - k;
    const tmp = new AsciiGrid(p.art.w, p.art.h);
    tmp.blit(p.art, 0, 0, p.frame);
    const bucket = Math.floor(time * 20);
    for (let r = 0; r < p.art.h; r++) {
      for (let c = 0; c < p.art.w; c++) {
        const cell = tmp.get(c, r)!;
        if (cell.role === null) continue;
        const v = hash2(c * 31 + p.col, r * 17 + p.row);
        if (v < shown) g.set(p.col + c, p.row + r, cell.ch, cell.role);
        else if (v < shown + 0.3 && cell.ch !== ' ') {
          g.set(p.col + c, p.row + r, SCRAMBLE[Math.floor(hash2(c + bucket, r) * SCRAMBLE.length)]!, 'dim');
        }
      }
    }
  }

  private drawEffect(g: AsciiGrid, e: EffectState, m: SceneModel): void {
    if (e.kind === 'birds') {
      const lead = Math.round(m.birdLead(e));
      const flap = Math.floor(e.t * 5) % 2 ? 'v' : '^';
      for (const [dx, dy] of BIRD_FORMATION) g.set(lead + dx * e.dir, e.row + dy, flap, 'strong');
    } else if (e.kind === 'steam') {
      for (let i = 0; i < 3; i++) {
        const x = e.col + Math.round(Math.sin(e.t * 2.5 + i * 1.7) * 0.7);
        const ch = ['(', ')', '~'][(Math.floor(e.t * 3) + i) % 3]!;
        g.set(x, e.row - i, ch, i === 2 ? 'faint' : 'dim');
      }
    }
  }
}
