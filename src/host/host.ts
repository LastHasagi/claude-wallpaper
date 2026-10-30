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
}
