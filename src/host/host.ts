import type { CursorArt } from '../shared/cursor';
import type { Rect } from '../shared/geometry';
import type { Lang } from '../shared/i18n';

/** full: the whole ASCII scene is drawn (terrarium / wallpaper). overlay: transparent pet over the desktop. */
export type DisplayMode = 'full' | 'overlay';

export interface CursorEvent {
  type: 'move' | 'down' | 'leave';
  /** CSS pixels relative to the engine viewport. */
  x: number;
  y: number;
  /** Milliseconds (performance.now clock). */
  t: number;
}

export interface CursorSource {
  subscribe(fn: (e: CursorEvent) => void): () => void;
}

export interface HostStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Asked from outside the engine (tray menu, command line). */
export type CursorCommand = 'steal' | 'return';

/** The system mouse pointer, where the platform lets an app swap it (Windows). */
export interface SystemCursorPort {
  /** Hides the pointer everywhere: Clawd has it in his mouth. */
  hide(): Promise<void>;
  /** Swaps the system pointers for these; any other pointer goes back to the user's own. */
  apply(art: readonly CursorArt[]): Promise<void>;
  /** Puts the user's own pointers back. */
  restore(): Promise<void>;
  /** Whether the pointer is where Clawd can see it (wallpaper mode: only over the desktop). */
  visible(): Promise<boolean>;
}

/** Files dragged over the engine window (CSS px, relative to it). */
export interface FileDrag {
  type: 'enter' | 'over' | 'drop' | 'leave';
  x: number;
  y: number;
  /** Full paths of the dragged items ('enter' and 'drop' only). */
  paths: readonly string[];
}

export type Refusal = 'notOnDesktop' | 'missing' | 'alreadyHidden' | 'untouchable' | 'full';

export interface EatReport {
  /** Names of the items now in his belly. */
  eaten: string[];
  refused: [name: string, why: Refusal][];
  /** Items in his belly after this meal. */
  total: number;
}

/**
 * Desktop items dropped on Clawd (Windows). Eating only hides them; nothing is moved or deleted,
 * and only items directly on the user's desktop are accepted.
 */
export interface BellyPort {
  eat(paths: readonly string[]): Promise<EatReport>;
  /** Gives everything back; resolves with how many items reappeared. */
  spit(): Promise<number>;
}

/** Everything the engine needs from whoever embeds it (browser page, Tauri window, …). */
export interface HostAdapter {
  readonly mode: DisplayMode;
  /** Browser preview only: paint a fake desktop behind the transparent overlay. Never in the app. */
  readonly fakeDesktop?: boolean;
  /** CSS px between the bottom of the viewport and the ground Clawd walks on (e.g. the taskbar). */
  groundInset(): number;
  readonly storage: HostStorage;
  readonly cursor: CursorSource;
  /** Overlay mode: regions that must receive clicks; the rest of the window lets them through. */
  setInteractiveRects(rects: Rect[]): void;
  systemLanguage(): string;
  systemPrefersDark(): boolean;
  /**
   * Monitors covered by the engine window, in CSS px relative to it. Absent (or one rect) means a
   * single screen; several rects get one scene panel each, with its own ground line.
   */
  segments?(): Rect[];
  /** Settings changed elsewhere (e.g. the app's settings window); the engine applies the patch. */
  onExternalSettings?(cb: (patch: Record<string, unknown>) => void): void;
  /** The engine's resolved language, so native UI (tray menu) can follow it. */
  languageChanged?(lang: Lang): void;
  /** Absent where the system pointer can't be swapped (macOS, Linux). */
  readonly systemCursor?: SystemCursorPort;
  onCursorCommand?(cb: (cmd: CursorCommand) => void): void;
  /** Absent where dropped desktop items can't be eaten (other systems, wallpaper mode). */
  readonly belly?: BellyPort;
  onFileDrag?(cb: (e: FileDrag) => void): void;
  /** Items were given back from outside the engine (tray menu). */
  onBellySpat?(cb: (count: number) => void): void;
  /** Media playing or not (Windows "now playing"); called with the current state, then on changes. */
  onMusic?(cb: (playing: boolean) => void): void;
}
