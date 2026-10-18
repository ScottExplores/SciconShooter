export type RenderQualityMode = 'auto' | 'high' | 'low';
export type RenderQualityTier = 'high' | 'medium' | 'low';

export interface RenderQualityBudget {
  readonly tier: RenderQualityTier;
  readonly particleScale: number;
  readonly trailScale: number;
  readonly backgroundLayerScale: number;
}

export const RENDER_QUALITY_TUNING = Object.freeze({
  sampleWindowMs: 1000,
  slowFrameMs: 1000 / 50,
  downgradeAfterMs: 2000,
  recoverFrameMs: 1000 / 57,
  recoverAfterMs: 8000,
  // Paused/hidden frames are excluded explicitly; severe visible jank still
  // needs to lower detail. Only a full-second resume/stall discards the window.
  backgroundGapMs: 1000
});

const BUDGETS: readonly RenderQualityBudget[] = Object.freeze([
  Object.freeze({ tier: 'low', particleScale: 0.4, trailScale: 0.4, backgroundLayerScale: 0.5 }),
  Object.freeze({ tier: 'medium', particleScale: 0.65, trailScale: 0.7, backgroundLayerScale: 0.75 }),
  Object.freeze({ tier: 'high', particleScale: 1, trailScale: 1, backgroundLayerScale: 1 })
]);
const REDUCED_MOTION_BUDGETS: readonly RenderQualityBudget[] = Object.freeze(BUDGETS.map((budget) => Object.freeze({
  ...budget,
  particleScale: Math.min(budget.particleScale, 0.65),
  trailScale: Math.min(budget.trailScale, 0.4)
})));

/**
 * Renderer-owned cosmetic budgets. No gameplay state, random source, collision,
 * projectile visibility, telegraph, world size, or simulation clock belongs here.
 * Averaged windows also detect alternating long/short frames; single hitches do
 * not immediately reduce detail. Recovery is deliberately slower than reduction.
 */
export class AdaptiveRenderQuality {
  private autoLevel = 2;
  private mode: RenderQualityMode = 'auto';
  private windowTime = 0;
  private windowFrames = 0;
  private slowTime = 0;
  private fastTime = 0;
  private currentBudget = BUDGETS[2];

  get budget(): RenderQualityBudget { return this.currentBudget; }

  observe(deltaMs: number, mode: RenderQualityMode = 'auto', reducedMotion = false, active = true): RenderQualityBudget {
    if (this.mode !== mode) {
      this.mode = mode;
      this.resetMeasurement();
    }
    if (mode === 'auto' && active) this.sample(deltaMs);
    else this.resetMeasurement();
    const level = mode === 'high' ? 2 : mode === 'low' ? 0 : this.autoLevel;
    this.currentBudget = (reducedMotion ? REDUCED_MOTION_BUDGETS : BUDGETS)[level];
    return this.currentBudget;
  }

  /** Keep the last useful automatic tier across pauses and hidden-tab resumes. */
  resetMeasurement() {
    this.windowTime = this.windowFrames = this.slowTime = this.fastTime = 0;
  }

  private sample(deltaMs: number) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs >= RENDER_QUALITY_TUNING.backgroundGapMs) {
      this.resetMeasurement();
      return;
    }
    this.windowTime += deltaMs;
    this.windowFrames++;
    if (this.windowTime < RENDER_QUALITY_TUNING.sampleWindowMs) return;

    const averageFrameMs = this.windowTime / this.windowFrames;
    if (averageFrameMs > RENDER_QUALITY_TUNING.slowFrameMs) {
      this.fastTime = 0;
      this.slowTime += this.windowTime;
      if (this.slowTime >= RENDER_QUALITY_TUNING.downgradeAfterMs) {
        this.autoLevel = Math.max(0, this.autoLevel - 1);
        this.slowTime = 0;
      }
    } else if (averageFrameMs < RENDER_QUALITY_TUNING.recoverFrameMs) {
      this.slowTime = 0;
      this.fastTime += this.windowTime;
      if (this.fastTime >= RENDER_QUALITY_TUNING.recoverAfterMs) {
        this.autoLevel = Math.min(2, this.autoLevel + 1);
        this.fastTime = 0;
      }
    } else {
      this.slowTime = this.fastTime = 0;
    }
    this.windowTime = this.windowFrames = 0;
  }
}
