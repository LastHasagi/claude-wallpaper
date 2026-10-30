import type { Rect } from '../shared/geometry';
import type { CursorEvent, CursorSource, DisplayMode, HostAdapter } from './host';
import { LocalStorage } from './local-storage';

/** Simulated taskbar height used when previewing overlay mode in a browser. */
const FAKE_TASKBAR = 48;

class DomCursor implements CursorSource {
  constructor(private readonly target: Window) {}

  subscribe(fn: (e: CursorEvent) => void): () => void {
    const move = (e: PointerEvent) => fn({ type: 'move', x: e.clientX, y: e.clientY, t: performance.now() });
    const down = (e: PointerEvent) => fn({ type: 'down', x: e.clientX, y: e.clientY, t: performance.now() });
    const leave = () => fn({ type: 'leave', x: -1, y: -1, t: performance.now() });
    this.target.addEventListener('pointermove', move);
    this.target.addEventListener('pointerdown', down);
    this.target.document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      this.target.removeEventListener('pointermove', move);
      this.target.removeEventListener('pointerdown', down);
      this.target.document.documentElement.removeEventListener('pointerleave', leave);
    };
  }
}

/** Host for running the engine in a plain browser tab (development, E2E). */
export class BrowserHost implements HostAdapter {
  readonly mode: DisplayMode;
  readonly storage = new LocalStorage();
  readonly cursor: CursorSource;
  /** Last rects reported by the engine; drawn by the debug overlay. */
  interactiveRects: Rect[] = [];

  readonly fakeDesktop: boolean;

  constructor(params: URLSearchParams, private readonly win: Window = window) {
    this.mode = params.get('mode') === 'overlay' ? 'overlay' : 'full';
    this.fakeDesktop = this.mode === 'overlay' && !params.has('transparent');
    this.cursor = new DomCursor(win);
  }

  groundInset(): number {
    return this.mode === 'overlay' ? FAKE_TASKBAR : 0;
  }

  setInteractiveRects(rects: Rect[]): void {
    this.interactiveRects = rects;
  }

  systemLanguage(): string {
    return this.win.navigator.language || 'en';
  }

  systemPrefersDark(): boolean {
    return this.win.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  }
}
