import { Assets, Texture } from 'pixi.js';
import { desaturateBackgroundPixels } from '../revamp/presentation/backgroundGrade';
import {
  runRequiredGameplayAssetPreloadQueue,
  runGameplayAssetPreloadQueue,
  waitForGameplayAssetPreload
} from '../gameplayAssetPreloadBudget';

/** Shared, nearest-neighbor texture loading for the live game and Director. */
export class PixiTextureBank {
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Map<string, Promise<Texture>>();
  // REVAMP(I): Derived presentation textures never change the shared original artwork.
  private readonly mutedBackgrounds = new Map<string, Texture>();

  async load(url: string) {
    const cached = this.textures.get(url);
    if (cached) return cached;

    const pending = this.pending.get(url);
    if (pending) return pending;

    const request = Assets.load<Texture>(url)
      .then((texture) => {
        texture.source.scaleMode = 'nearest';
        // Gameplay sprites are never tiling textures. Explicit clamping prevents
        // an out-of-range UV from sampling the opposite edge of a generated frame.
        texture.source.addressMode = 'clamp-to-edge';
        this.textures.set(url, texture);
        this.pending.delete(url);
        return texture;
      })
      .catch((error) => {
        this.pending.delete(url);
        throw error;
      });
    this.pending.set(url, request);
    return request;
  }

  preload(urls: readonly string[], concurrency?: number) {
    const warmup = runGameplayAssetPreloadQueue(
      [...new Set(urls.filter(Boolean))],
      (url) => this.load(url),
      concurrency
    );
    return waitForGameplayAssetPreload(warmup);
  }

  preloadRequired(urls: readonly string[]) {
    return runRequiredGameplayAssetPreloadQueue(
      [...new Set(urls.filter(Boolean))],
      (url) => this.load(url)
    );
  }

  get(url: string) {
    return this.textures.get(url) ?? null;
  }

  getMutedBackground(url: string) {
    const original = this.get(url);
    if (!original || typeof document === 'undefined') return original;
    const cached = this.mutedBackgrounds.get(url);
    if (cached) return cached;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = original.source.pixelWidth;
      canvas.height = original.source.pixelHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return original;
      context.imageSmoothingEnabled = false;
      context.drawImage(original.source.resource as CanvasImageSource, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      desaturateBackgroundPixels(pixels.data);
      context.putImageData(pixels, 0, 0);
      const muted = Texture.from(canvas);
      muted.source.scaleMode = 'nearest';
      muted.source.addressMode = 'clamp-to-edge';
      this.mutedBackgrounds.set(url, muted);
      return muted;
    } catch {
      // Browsers without readable canvas pixels still get the same dim exposure.
      this.mutedBackgrounds.set(url, original);
      return original;
    }
  }

  retainMutedBackgrounds(urls: readonly string[]) {
    for (const [url, texture] of this.mutedBackgrounds) {
      if (urls.includes(url)) continue;
      if (texture !== this.textures.get(url)) texture.destroy(true);
      this.mutedBackgrounds.delete(url);
    }
  }

  destroy() {
    // Pixi Assets owns the texture lifetime. Clearing references here lets a
    // restarted mission release this renderer without invalidating shared UI art.
    this.retainMutedBackgrounds([]);
    this.pending.clear();
    this.textures.clear();
  }
}
