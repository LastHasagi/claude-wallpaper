import type { CursorArt } from '../shared/cursor';
import type { Rect } from '../shared/geometry';
import { spriteRgba } from '../shared/render/sprite';
import type { BellyPort, CursorEvent, CursorSource, DisplayMode, EatReport, FileDrag, HostAdapter, SystemCursorPort } from './host';
import { LocalStorage } from './local-storage';
import { parseSegments } from './segments';

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

/** Preview of the pointer swap: only this page's pointer changes (CSS), never the system's. */
class CssCursor implements SystemCursorPort {
  constructor(private readonly doc: Document) {}

  async hide(): Promise<void> {
    this.set('none');
  }

  async apply(art: readonly CursorArt[]): Promise<void> {
    const arrow = art.find((a) => a.kind === 'arrow');
    this.set(arrow ? `url(${this.png(arrow)}) ${arrow.hotspot.x * 2} ${arrow.hotspot.y * 2}, auto` : '');
  }

  async restore(): Promise<void> {
    this.set('');
  }

  async visible(): Promise<boolean> {
    return true;
  }

  private set(css: string): void {
    this.doc.documentElement.style.cursor = css;
  }

  private png(art: CursorArt): string {
    const frame = art.frames[0]!;
    const canvas = this.doc.createElement('canvas');
    canvas.width = frame.w * 2;
    canvas.height = frame.h * 2;
    const img = new ImageData(spriteRgba(frame, 2), canvas.width, canvas.height);
    canvas.getContext('2d')?.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }
}

/** Preview of the belly: remembers names only, never touches a file. */
class PretendBelly implements BellyPort {
  private items: string[] = [];

  async eat(paths: readonly string[]): Promise<EatReport> {
    const report: EatReport = { eaten: [], refused: [], total: 0 };
    for (const p of paths) {
      // Reports names, like the native side.
      const name = p.split(/[\\/]/).filter(Boolean).pop() ?? p;
      if (this.items.length >= 20) report.refused.push([name, 'full']);
      else {
        this.items.push(name);
        report.eaten.push(name);
      }
    }
    report.total = this.items.length;
    return report;
  }

  async spit(): Promise<number> {
    const n = this.items.length;
    this.items = [];
    return n;
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
  readonly systemCursor: SystemCursorPort;
  readonly belly: BellyPort = new PretendBelly();
  private readonly segmentRects: Rect[];
  /** Preview: ?music=1 pretends something is playing (Clawd dances). */
  private readonly music: boolean;

  constructor(params: URLSearchParams, private readonly win: Window = window) {
    this.music = params.get('music') === '1';
    this.mode = params.get('mode') === 'overlay' ? 'overlay' : 'full';
    this.fakeDesktop = this.mode === 'overlay' && !params.has('transparent');
    this.cursor = new DomCursor(win);
    this.systemCursor = new CssCursor(win.document);
    // Simulates several monitors in a browser tab, e.g. ?segments=0,0,640,450;640,90,640,360
    this.segmentRects = parseSegments(params.get('segments'));
  }

  segments(): Rect[] {
    return this.segmentRects;
  }

  onMusic(cb: (playing: boolean) => void): void {
    cb(this.music);
  }

  /** Files dragged from the system onto the page (names only: browsers hide paths). */
  onFileDrag(cb: (e: FileDrag) => void): void {
    const at = (type: FileDrag['type'], e: DragEvent, paths: string[] = []) => cb({ type, x: e.clientX, y: e.clientY, paths });
    this.win.addEventListener('dragover', (e) => {
      e.preventDefault(); // lets the page accept the drop
      at('over', e);
    });
    this.win.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget) at('leave', e);
    });
    this.win.addEventListener('drop', (e) => {
      e.preventDefault();
      at('drop', e, [...(e.dataTransfer?.files ?? [])].map((f) => f.name));
    });
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
