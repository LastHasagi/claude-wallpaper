import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { Point, Rect } from '../shared/geometry';
import type { Lang } from '../shared/i18n';
import type { CursorEvent, CursorSource, DisplayMode, HostAdapter } from './host';
import { LocalStorage } from './local-storage';
import { insideViewport, shouldCapture, toLocal } from './pointer';
import { parseSegments } from './segments';

export type NativeMode = 'overlay' | 'terrarium' | 'wallpaper';

const POLL_MS = 33;
const ORIGIN_REFRESH_MS = 2000;

/**
 * Host for the desktop app. The native window is created by Rust with `?mode=<native mode>`;
 * overlay and wallpaper windows don't get mouse events, so the cursor is polled globally.
 */
export class TauriHost implements HostAdapter {
  readonly mode: DisplayMode;
  readonly nativeMode: NativeMode;
  readonly storage = new LocalStorage();
  readonly cursor: CursorSource;
  private rects: Rect[] = [];
  private capturing = false;
  private lastLocal: Point | null = null;
  private lang: Lang | null = null;

  private readonly segmentRects: Rect[];

  constructor(params: URLSearchParams, private readonly win: Window = window) {
    const m = params.get('mode');
    this.nativeMode = m === 'terrarium' || m === 'wallpaper' ? m : 'overlay';
    // The native side passes the covered monitors in physical px relative to the window.
    this.segmentRects = parseSegments(params.get('segments'), win.devicePixelRatio || 1);
    this.mode = this.nativeMode === 'overlay' ? 'overlay' : 'full';
    this.cursor = { subscribe: (fn) => this.subscribe(fn) };
    if (this.nativeMode === 'terrarium') this.addTerrariumChrome();
  }

  groundInset(): number {
    return 0; // the native window already ends above the taskbar
  }

  segments(): Rect[] {
    return this.segmentRects;
  }

  setInteractiveRects(rects: Rect[]): void {
    this.rects = rects;
    if (this.nativeMode !== 'overlay') return;
    const capture = shouldCapture(this.lastLocal, rects);
    if (capture !== this.capturing) {
      this.capturing = capture;
      getCurrentWindow().setIgnoreCursorEvents(!capture).catch(() => (this.capturing = !capture));
    }
  }

  systemLanguage(): string {
    return this.win.navigator.language || 'en';
  }

  systemPrefersDark(): boolean {
    return this.win.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  }

  onExternalSettings(cb: (patch: Record<string, unknown>) => void): void {
    void listen<Record<string, unknown>>('settings-changed', (e) => cb(e.payload));
  }

  languageChanged(lang: Lang): void {
    if (lang === this.lang) return;
    this.lang = lang;
    void invoke('set_ui_lang', { lang }).catch(() => {});
  }

  private subscribe(fn: (e: CursorEvent) => void): () => void {
    const down = (e: PointerEvent) => fn({ type: 'down', x: e.clientX, y: e.clientY, t: performance.now() });
    this.win.addEventListener('pointerdown', down);
    const stops: (() => void)[] = [() => this.win.removeEventListener('pointerdown', down)];

    if (this.nativeMode === 'terrarium') {
      const move = (e: PointerEvent) => fn({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now() });
      const leave = () => fn({ type: 'leave', x: -1, y: -1, t: performance.now() });
      this.win.addEventListener('pointermove', move);
      this.win.document.documentElement.addEventListener('pointerleave', leave);
      stops.push(() => {
        this.win.removeEventListener('pointermove', move);
        this.win.document.documentElement.removeEventListener('pointerleave', leave);
      });
    } else {
      stops.push(this.pollCursor(fn));
    }
    return () => stops.forEach((s) => s());
  }

  private pollCursor(fn: (e: CursorEvent) => void): () => void {
    const appWin = getCurrentWindow();
    let origin: Point = { x: 0, y: 0 };
    let scale = this.win.devicePixelRatio || 1;
    let originAt = 0;
    let busy = false;
    let wasInside = false;
    const timer = this.win.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const now = performance.now();
        if (now - originAt > ORIGIN_REFRESH_MS) {
          const [pos, s] = await Promise.all([appWin.innerPosition(), appWin.scaleFactor()]);
          origin = { x: pos.x, y: pos.y };
          scale = s;
          originAt = now;
        }
        const p = toLocal(await cursorPosition(), origin, scale);
        const inside = insideViewport(p, this.win.innerWidth, this.win.innerHeight);
        this.lastLocal = inside ? p : null;
        if (inside) fn({ type: 'move', x: p.x, y: p.y, t: now });
        else if (wasInside) fn({ type: 'leave', x: -1, y: -1, t: now });
        wasInside = inside;
        this.setInteractiveRects(this.rects);
      } catch {
        /* window closing or API unavailable: try again next tick */
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => this.win.clearInterval(timer);
  }

  /** Borderless terrarium: a thin drag strip on top, with a settings button. */
  private addTerrariumChrome(): void {
    const doc = this.win.document;
    const style = doc.createElement('style');
    style.textContent = `
      #drag-strip { position: fixed; left: 0; right: 0; top: 0; height: 22px; z-index: 3; cursor: grab;
        display: flex; justify-content: flex-end; align-items: center; padding: 0 6px; box-sizing: border-box;
        opacity: 0; transition: opacity .2s; background: linear-gradient(rgba(0,0,0,.35), transparent); }
      #drag-strip:hover { opacity: 1; }
      #drag-strip button { all: unset; cursor: pointer; color: #e6e0d3; font: 13px system-ui; padding: 0 4px; }`;
    const strip = doc.createElement('div');
    strip.id = 'drag-strip';
    strip.setAttribute('data-tauri-drag-region', '');
    const gear = doc.createElement('button');
    gear.textContent = '⚙';
    gear.title = 'Settings';
    gear.addEventListener('click', () => void invoke('open_settings_window').catch(() => {}));
    strip.append(gear);
    doc.head.append(style);
    doc.body.append(strip);
  }
}
