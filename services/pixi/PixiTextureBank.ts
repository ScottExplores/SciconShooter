import { Assets, Texture, type Renderer } from 'pixi.js';
import { RuntimeTextureAtlas } from '../revamp/performance/RuntimeTextureAtlas';
import {
  runRequiredGameplayAssetPreloadQueue,
  runGameplayAssetPreloadQueue,
  waitForGameplayAssetPreload
} from '../gameplayAssetPreloadBudget';

/** Shared, nearest-neighbor texture loading for the live game and Director. */
export class PixiTextureBank {
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Map<string, Promise<Texture>>();
  private atlas?: RuntimeTextureAtlas;

  // REVAMP(J): Optional per-renderer page; preload still keeps source ownership.
  enableAtlas(renderer: Renderer) { this.atlas ??= new RuntimeTextureAtlas(renderer); }
  getAtlasStats() { return this.atlas?.getStats() ?? null; }

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
    const source = this.textures.get(url);
    return source ? this.atlas?.get(source) ?? source : null;
  }

  destroy() {
    this.atlas?.destroy();
    this.atlas = undefined;
    // Pixi Assets owns the texture lifetime. Clearing references here lets a
    // restarted mission release this renderer without invalidating shared UI art.
    this.pending.clear();
    this.textures.clear();
  }
}
