export const FEEL_QUALITY_TUNING = Object.freeze({
  slowFrameMs: 20,
  downgradeAfterMs: 2000,
  recoverFrameMs: 17.5,
  recoverAfterMs: 6000,
  backgroundGapMs: 250
});

/** Measured render budget controls cosmetics only, never the world or simulation. */
export class AdaptiveFeelQuality {
  private level = 2;
  private slowTime = 0;
  private fastTime = 0;

  get tier(): 'low' | 'medium' | 'high' { return this.level === 2 ? 'high' : this.level === 1 ? 'medium' : 'low'; }
  get scale() { return this.level === 2 ? 1 : this.level === 1 ? 0.65 : 0.4; }
  get particleCap() { return this.level === 2 ? 160 : this.level === 1 ? 104 : 64; }

  observe(deltaMs: number) {
    // Visibility gaps and debugger pauses are not evidence of sustained GPU load.
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs >= FEEL_QUALITY_TUNING.backgroundGapMs) {
      this.slowTime = this.fastTime = 0;
      return this.scale;
    }
    if (deltaMs > FEEL_QUALITY_TUNING.slowFrameMs) {
      this.fastTime = 0;
      this.slowTime += deltaMs;
      if (this.slowTime >= FEEL_QUALITY_TUNING.downgradeAfterMs) {
        this.level = Math.max(0, this.level - 1);
        this.slowTime = 0;
      }
    } else if (deltaMs < FEEL_QUALITY_TUNING.recoverFrameMs) {
      this.slowTime = 0;
      this.fastTime += deltaMs;
      if (this.fastTime >= FEEL_QUALITY_TUNING.recoverAfterMs) {
        this.level = Math.min(2, this.level + 1);
        this.fastTime = 0;
      }
    } else {
      this.slowTime = this.fastTime = 0;
    }
    return this.scale;
  }

  reset() {
    this.level = 2;
    this.slowTime = this.fastTime = 0;
  }
}
