import type { Renderer } from 'pixi.js';

// Keep the fragment shader small on mobile/low-end GPUs. Pixi otherwise uses
// every advertised sampler (32 on SwiftShader) for every pixel, even when a
// batch contains only one background. More textures simply start another batch.
export const MAX_BATCH_TEXTURES = 8;
export const renderResolution = (dpr: number) => Math.min(2, Math.max(1, Number.isFinite(dpr) ? dpr : 1));

export function configureRenderBudget(renderer: Renderer) {
  renderer.limits.maxBatchableTextures = Math.min(MAX_BATCH_TEXTURES, renderer.limits.maxBatchableTextures);
}
