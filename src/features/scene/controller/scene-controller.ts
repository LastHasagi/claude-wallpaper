import type { PropArt } from '../../../shared/render/prop-art';
import type { AsciiGrid } from '../../../shared/render/ascii-grid';
import { timeOfDay, type Clock, type TimeOfDay } from '../../../shared/time';
import type { DisplayMode } from '../../../host/host';
import { BIOMES, type BiomeId } from '../biomes';
import { SceneModel, type EffectKind } from '../model/scene-model';
import { SceneView, type SceneGeometry } from '../view/scene-view';

export interface SceneLayout extends SceneGeometry {
  cellW: number;
  cellH: number;
  /** CSS px of the ground line's bottom edge: where Clawd's feet rest. */
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
  birds(dir: 1 | -1, row?: number): Promise<void>;
  startEffect(id: string, kind: Exclude<EffectKind, 'birds'>, col: number, row: number): void;
  stopEffect(id: string): void;
  setLabel(text: string | null): void;
  /** Column of a named spot of the current biome (e.g. 'bench'). */
  spot(name: string): number;
  layout(): SceneLayout;
  colToX(col: number): number;
  xToCol(x: number): number;
  rowToY(row: number): number;
}

export class SceneController implements SceneApi {
  readonly model = new SceneModel();
  private readonly view = new SceneView();
  private geo: SceneLayout = { cols: 1, rows: 1, groundRow: 0, cellW: 1, cellH: 1, groundY: 0 };
  private tod: TimeOfDay;
  private todCheck = 0;
  private effectSeq = 0;

  constructor(private readonly clock: Clock, private readonly mode: DisplayMode, private readonly seedSource: () => number) {
    this.tod = timeOfDay(clock.hour());
    this.model.current = { biome: 'mountains', seed: seedSource() };
  }

  /** Sets the grid size. In overlay mode the ground sits just above `insetPx` (e.g. the taskbar). */
  resize(cols: number, rows: number, cellW: number, cellH: number, cssH: number, insetPx: number): SceneLayout {
    const groundRow = this.mode === 'full' ? rows - 4 : Math.floor((cssH - insetPx) / cellH) - 1;
    this.geo = { cols, rows, groundRow, cellW, cellH, groundY: (groundRow + 1) * cellH };
    this.model.cols = cols;
    return this.geo;
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
    return this.view.compose(this.model, this.geo, this.tod, this.mode);
  }

  // --- SceneApi -------------------------------------------------------------------------------

  setBiome(biome: BiomeId, seed = this.seedSource()): Promise<void> {
    if (this.mode === 'overlay') {
      this.model.current = { biome, seed };
      return Promise.resolve();
    }
    return new Promise((resolve) => this.model.startTransition({ biome, seed }, resolve));
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
        row: opts.row ?? this.geo.groundRow - art.h + 1,
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

  birds(dir: 1 | -1, row = Math.max(2, Math.round(this.geo.groundRow * 0.22))): Promise<void> {
    return new Promise((resolve) => {
      const id = `birds-${this.effectSeq++}`;
      this.model.effects.set(id, { id, kind: 'birds', t: 0, col: 0, row, dir, resolve });
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
    const spots = BIOMES[this.model.current.biome].spots({ ...this.geo, tod: this.tod, seed: this.model.current.seed });
    return spots[name] ?? Math.round(this.geo.cols / 2);
  }

  layout(): SceneLayout {
    return { ...this.geo };
  }

  colToX(col: number): number {
    return col * this.geo.cellW;
  }

  xToCol(x: number): number {
    return Math.floor(x / this.geo.cellW);
  }

  rowToY(row: number): number {
    return row * this.geo.cellH;
  }
}
