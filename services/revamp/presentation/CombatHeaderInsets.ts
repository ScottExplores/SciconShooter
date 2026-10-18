/** Convert extra physical HUD height into cosmetic world coordinates. */
export function combatHeaderOffset(hudBottom: number, canvasTop: number, canvasHeight: number, worldHeight: number) {
  const scale = canvasHeight / worldHeight;
  if (!(scale > 0) || !Number.isFinite(hudBottom + canvasTop + scale)) return 0;
  return Math.max(0, Math.min(worldHeight * 0.2, (hudBottom - canvasTop - 48) / scale));
}

/** Cached DOM measurement: no layout read in ordinary render frames. */
export class CombatHeaderInsets {
  offset = 0;
  private dirty = true;
  private canvas: HTMLCanvasElement | null = null;
  private observer: ResizeObserver | null = null;
  private readonly invalidate = () => { this.dirty = true; };

  read(canvas: HTMLCanvasElement, worldHeight: number) {
    if (this.canvas !== canvas) {
      this.canvas = canvas;
      this.dirty = true;
      this.observer?.disconnect();
      if (typeof ResizeObserver !== 'undefined') {
        this.observer = new ResizeObserver(this.invalidate);
        this.observer.observe(canvas);
        const shell = canvas.closest('.scicon-game-stage');
        if (shell) this.observer.observe(shell);
      }
      window.addEventListener('resize', this.invalidate);
      window.visualViewport?.addEventListener('resize', this.invalidate);
    }
    if (this.dirty) {
      this.dirty = false;
      const row = canvas.closest('.scicon-game-stage')?.querySelector('.scicon-combat-toprow');
      const bounds = canvas.getBoundingClientRect();
      this.offset = row ? combatHeaderOffset(row.getBoundingClientRect().bottom, bounds.top, bounds.height, worldHeight) : 0;
      if (row) this.observer?.observe(row);
    }
    return this.offset;
  }

  destroy() {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.invalidate);
    window.visualViewport?.removeEventListener('resize', this.invalidate);
    this.canvas = null;
  }
}
