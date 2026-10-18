import type { RenderQualityMode, RenderQualityTier } from './AdaptiveRenderQuality';
import { renderResolution } from './RendererBudget';

export const RASTER_RESOLUTION_TUNING = Object.freeze({
  sampleWindowMs: 1000,
  downgradeBelowFps: 40,
  downgradeAfterMs: 2000,
  severeBelowFps: 20,
  severeAfterMs: 1000,
  recoverAtFps: 57,
  recoverAfterMs: 8000,
  backgroundGapMs: 1000
});

/**
 * REVAMP(L): Output-only last resort after the optional detail governor reaches
 * Low. The world, camera, simulation, art sources and baked textures stay fixed.
 * High always keeps full output; Low explicitly selects native world pixels.
 */
export class AdaptiveRasterResolution {
  private dpr: number;
  private autoNative = false;
  private mode: RenderQualityMode = 'auto';
  private tier: RenderQualityTier = 'high';
  private windowTime = 0;
  private windowFrames = 0;
  private qualifyingTime = 0;

  constructor(dpr = 1) { this.dpr = dpr; }

  get fullResolution() { return renderResolution(this.dpr); }
  get desiredResolution() {
    return this.mode === 'low' || (this.mode === 'auto' && this.autoNative) ? 1 : this.fullResolution;
  }

  setDevicePixelRatio(dpr: number) { this.dpr = dpr; }

  observe(deltaMs: number, mode: RenderQualityMode, tier: RenderQualityTier, active = true) {
    if (this.mode !== mode || this.tier !== tier) {
      this.mode = mode;
      this.tier = tier;
      this.resetMeasurement();
    }
    if (mode === 'auto' && active) this.sample(deltaMs, tier);
    else this.resetMeasurement();
    return this.desiredResolution;
  }

  /** Pause/resume discards timing evidence, never the learned automatic output. */
  resetMeasurement() {
    this.windowTime = this.windowFrames = this.qualifyingTime = 0;
  }

  private sample(deltaMs: number, tier: RenderQualityTier) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs >= RASTER_RESOLUTION_TUNING.backgroundGapMs
      || tier !== (this.autoNative ? 'high' : 'low')) {
      this.resetMeasurement();
      return;
    }
    this.windowTime += deltaMs;
    this.windowFrames++;
    if (this.windowTime < RASTER_RESOLUTION_TUNING.sampleWindowMs) return;

    const fps = this.windowFrames * 1000 / this.windowTime;
    const qualifies = this.autoNative
      ? fps + 1e-9 >= RASTER_RESOLUTION_TUNING.recoverAtFps
      : fps < RASTER_RESOLUTION_TUNING.downgradeBelowFps - 1e-9;
    this.qualifyingTime = qualifies ? this.qualifyingTime + this.windowTime : 0;
    const deadline = this.autoNative ? RASTER_RESOLUTION_TUNING.recoverAfterMs
      : fps < RASTER_RESOLUTION_TUNING.severeBelowFps
        ? RASTER_RESOLUTION_TUNING.severeAfterMs : RASTER_RESOLUTION_TUNING.downgradeAfterMs;
    if (this.qualifyingTime >= deadline) {
      this.autoNative = !this.autoNative;
      this.qualifyingTime = 0;
    }
    this.windowTime = this.windowFrames = 0;
  }
}

/** Minimal structural type keeps raster application independent of game state. */
export interface RasterResizeTarget {
  readonly resolution: number;
  readonly screen: { width: number; height: number };
  readonly canvas: { style: Pick<CSSStyleDeclaration, 'width' | 'height' | 'imageRendering'> };
  resize(width: number, height: number, resolution: number): void;
}

const previousImageRendering = new WeakMap<RasterResizeTarget['canvas'], string>();

/** Preserve fair-arena CSS sizing when Pixi autoDensity changes backing pixels. */
export function applyRasterResolution(renderer: RasterResizeTarget, desiredResolution: number, fullResolution: number) {
  const full = renderResolution(fullResolution);
  const desired = Math.min(full, renderResolution(desiredResolution));
  const { canvas } = renderer;
  const changed = renderer.resolution !== desired;
  if (changed) {
    const { width, height } = canvas.style;
    try {
      renderer.resize(renderer.screen.width, renderer.screen.height, desired);
    } finally {
      canvas.style.width = width;
      canvas.style.height = height;
    }
  }
  if (desired < full) {
    if (!previousImageRendering.has(canvas)) previousImageRendering.set(canvas, canvas.style.imageRendering);
    if (canvas.style.imageRendering !== 'pixelated') canvas.style.imageRendering = 'pixelated';
  } else if (previousImageRendering.has(canvas)) {
    canvas.style.imageRendering = previousImageRendering.get(canvas)!;
    previousImageRendering.delete(canvas);
  }
  return changed;
}
