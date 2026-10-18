import type { Renderer } from 'pixi.js';

// Keep the fragment shader small on mobile/low-end GPUs. Pixi otherwise uses
// every advertised sampler (32 on SwiftShader) for every pixel, even when a
// batch contains only one background. More textures simply start another batch.
export const MAX_BATCH_TEXTURES = 8;
export const renderResolution = (dpr: number) => Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));
// REVAMP(L): Derived art keeps full quality even while Auto lowers the backbuffer.
const fullResolutions = new WeakMap<Renderer, number>();
export const fullRenderResolution = (renderer: Renderer) => fullResolutions.get(renderer) ?? renderResolution(renderer.resolution);

export function configureRenderBudget(renderer: Renderer) {
  fullResolutions.set(renderer, renderResolution(renderer.resolution));
  renderer.limits.maxBatchableTextures = Math.min(MAX_BATCH_TEXTURES, renderer.limits.maxBatchableTextures);
}
