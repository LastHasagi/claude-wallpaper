import type { Rect } from '../../../shared/geometry';
import type { PropArt } from '../../../shared/render/prop-art';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import { timeOfDay, type Clock, type TimeOfDay } from '../../../shared/time';
import type { DisplayMode } from '../../../host/host';
import { BIOMES, type BiomeId } from '../biomes';
import { buildPanels, GROUND_DEPTH, panelAtCol, type Panel } from '../model/panels';
import { SceneModel, type EffectKind } from '../model/scene-model';
import { panelCtx, SceneView, type SceneGeometry } from '../view/scene-view';

export interface SceneLayout extends SceneGeometry {
  cellW: number;
  cellH: number;
  /** Ground row of the focus panel (where missions happen). */
  groundRow: number;
  /** CSS px of the focus panel's ground line bottom edge: where Clawd's feet rest. */
  groundY: number;
}

/** A panel (monitor) in CSS px: horizontal extent, top edge and ground line. */
export interface PanelArea {
  x0: number;
  x1: number;
  top: number;
  groundY: number;
}

export interface ShowPropOptions {
  frame?: number;
  /** Row of the prop's top line; default makes its bottom line sit on the ground row. */
  row?: number;
}

/** What missions and notes may do with the scenery. */
export interface SceneApi {
  setBiome(biome: BiomeId, seed?: number): Promise<void>;
  biome(): BiomeId;
  timeOfDay(): TimeOfDay;
  showProp(id: string, art: PropArt, col: number, opts?: ShowPropOptions): Promise<void>;
  hideProp(id: string): Promise<void>;
  hideAllProps(): Promise<void>;
  setPropFrame(id: string, frame: number): void;
  propTopRow(id: string): number | null;
  /** CSS px above its panel's ground of the bottom edge of row `artRow` of a shown prop. */
  propSurface(id: string, artRow: number): number | null;
  birds(dir: 1 | -1, row?: number): Promise<void>;
  startEffect(id: string, kind: Exclude<EffectKind, 'birds'>, col: number, row: number): void;
  stopEffect(id: string): void;
  setLabel(text: string | null): void;
  /** Column of a named spot of the current biome (e.g. 'bench'), inside the focus panel. */
  spot(name: string): number;
  /** The panel (monitor) under `x`, or the nearest one. */
  panelAt(x: number): PanelArea;
  layout(): SceneLayout;
  colToX(col: number): number;
  xToCol(x: number): number;
  rowToY(row: number): number;
}

export class SceneController implements SceneApi {
  readonly model = new SceneModel();
  private readonly view = new SceneView();
  private cols = 1;
  private rows = 1;
  private cellW = 1;
  private cellH = 1;
  private panels: Panel[] = [{ col0: 0, row0: 0, cols: 1, rows: 1, groundRow: 0 }];
  private tod: TimeOfDay;
  private todCheck = 0;
  private effectSeq = 0;

  constructor(private readonly clock: Clock, private readonly mode: DisplayMode, private readonly seedSource: () => number) {
    this.tod = timeOfDay(clock.hour());
    this.model.current = { biome: 'mountains', seed: seedSource(), focus: 0 };
  }

  /**
   * Sets the grid size. In overlay mode the ground sits just above `insetPx` (e.g. the taskbar).
   * `segments` (CSS px, one per monitor) split a full-mode scene into panels with their own ground.
   */
  resize(cols: number, rows: number, cellW: number, cellH: number, cssH: number, insetPx: number, segments: readonly Rect[] = []): SceneLayout {
    Object.assign(this, { cols, rows, cellW, cellH });
    const single = this.mode === 'full' ? rows - GROUND_DEPTH : Math.floor((cssH - insetPx) / cellH) - 1;
    this.panels = this.mode === 'full' ? buildPanels(cols, rows, cellW, cellH, segments, single) : buildPanels(cols, rows, cellW, cellH, [], single);
    const focus = this.model.current.focus ?? 0;
    if (focus >= this.panels.length) this.model.current = { ...this.model.current, focus: 0 };
    this.model.cols = cols;
    return this.layout();
  }

  /** Ground lines of every panel, for Clawd's stage. */
  floors(): { x0: number; x1: number; groundY: number }[] {
    return this.panels.map((p) => ({ x0: p.col0 * this.cellW, x1: (p.col0 + p.cols) * this.cellW, groundY: (p.groundRow + 1) * this.cellH }));
  }

  update(dt: number): void {
    this.model.tick(dt);
    this.todCheck -= dt;
    if (this.todCheck <= 0) {
      this.todCheck = 30;
      this.tod = timeOfDay(this.clock.hour());
    }
  }

  compose(): AsciiGrid {
    return this.view.compose(this.model, { cols: this.cols, rows: this.rows, panels: this.panels }, this.tod, this.mode);
  }

  private focusPanel(): Panel {
    return this.panels[this.model.current.focus ?? 0] ?? this.panels[0]!;
  }

  // --- SceneApi -------------------------------------------------------------------------------

  setBiome(biome: BiomeId, seed = this.seedSource()): Promise<void> {
    // On several monitors, each mission happens on one of them (Clawd walks over to it).
    const focus = this.panels.length > 1 ? this.seedSource() % this.panels.length : 0;
    const key = { biome, seed, focus };
    if (this.mode === 'overlay') {
      this.model.current = key;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.model.startTransition(key, resolve));
  }

  biome(): BiomeId {
    return this.model.current.biome;
  }

  timeOfDay(): TimeOfDay {
    return this.tod;
  }

  showProp(id: string, art: PropArt, col: number, opts: ShowPropOptions = {}): Promise<void> {
    return new Promise((resolve) => {
      this.model.props.get(id)?.resolve?.();
      this.model.props.set(id, {
        id,
        art,
        col,
        row: opts.row ?? panelAtCol(this.panels, col + Math.floor(art.w / 2)).groundRow - art.h + 1,
        frame: opts.frame ?? 0,
        phase: 'in',
        t: 0,
        resolve,
      });
    });
  }

  hideProp(id: string): Promise<void> {
    const p = this.model.props.get(id);
    if (!p || p.phase === 'out') return Promise.resolve();
    return new Promise((resolve) => {
      p.resolve?.();
      p.phase = 'out';
      p.t = 0;
      p.resolve = resolve;
    });
  }

  async hideAllProps(): Promise<void> {
    await Promise.all([...this.model.props.keys()].map((id) => this.hideProp(id)));
  }

  setPropFrame(id: string, frame: number): void {
    const p = this.model.props.get(id);
    if (p) p.frame = frame;
  }

  propTopRow(id: string): number | null {
    return this.model.props.get(id)?.row ?? null;
  }

  propSurface(id: string, artRow: number): number | null {
    const p = this.model.props.get(id);
    if (!p) return null;
    const panel = panelAtCol(this.panels, p.col + Math.floor(p.art.w / 2));
    return (panel.groundRow + 1 - (p.row + artRow + 1)) * this.cellH;
  }

  birds(dir: 1 | -1, row?: number): Promise<void> {
    const f = this.focusPanel();
    const r = row ?? Math.max(f.row0 + 2, f.row0 + Math.round((f.groundRow - f.row0) * 0.22));
    return new Promise((resolve) => {
      const id = `birds-${this.effectSeq++}`;
      this.model.effects.set(id, { id, kind: 'birds', t: 0, col: 0, row: r, dir, resolve });
    });
  }

  startEffect(id: string, kind: Exclude<EffectKind, 'birds'>, col: number, row: number): void {
    this.model.effects.set(id, { id, kind, t: 0, col, row, dir: 1, resolve: null });
  }

  stopEffect(id: string): void {
    this.model.effects.delete(id);
  }

  setLabel(text: string | null): void {
    this.model.label = text;
  }

  spot(name: string): number {
    const index = this.model.current.focus ?? 0;
    const panel = this.focusPanel();
    const spots = BIOMES[this.model.current.biome].spots(panelCtx(this.model.current, panel, index, this.tod));
    return panel.col0 + (spots[name] ?? Math.round(panel.cols / 2));
  }

  panelAt(x: number): PanelArea {
    const p = panelAtCol(this.panels, Math.floor(x / this.cellW));
    return { x0: p.col0 * this.cellW, x1: (p.col0 + p.cols) * this.cellW, top: p.row0 * this.cellH, groundY: (p.groundRow + 1) * this.cellH };
  }

  layout(): SceneLayout {
    const f = this.focusPanel();
    return {
      cols: this.cols,
      rows: this.rows,
      panels: this.panels.map((p) => ({ ...p })),
      cellW: this.cellW,
      cellH: this.cellH,
      groundRow: f.groundRow,
      groundY: (f.groundRow + 1) * this.cellH,
    };
  }

  colToX(col: number): number {
    return col * this.cellW;
  }

  xToCol(x: number): number {
    return Math.floor(x / this.cellW);
  }

  rowToY(row: number): number {
    return row * this.cellH;
  }
}
