/** Rolling frame statistics for the `?debug=1` overlay. */
export class FrameStats {
  private frames = 0;
  private updateMs = 0;
  private renderMs = 0;
  private cellsDrawn = 0;
  private windowStart = performance.now();
  snapshot = { fps: 0, updateMs: 0, renderMs: 0, cells: 0 };

  addUpdate(ms: number): void {
    this.updateMs += ms;
  }

  addRender(ms: number, cells: number): void {
    this.frames++;
    this.renderMs += ms;
    this.cellsDrawn += cells;
    const now = performance.now();
    const span = now - this.windowStart;
    if (span >= 1000) {
      this.snapshot = {
        fps: (this.frames * 1000) / span,
        updateMs: this.updateMs / Math.max(1, this.frames),
        renderMs: this.renderMs / Math.max(1, this.frames),
        cells: this.cellsDrawn / Math.max(1, this.frames),
      };
      this.frames = 0;
      this.updateMs = 0;
      this.renderMs = 0;
      this.cellsDrawn = 0;
      this.windowStart = now;
    }
  }
}
