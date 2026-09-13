import { Assets, Texture } from 'pixi.js';
import {
  runRequiredGameplayAssetPreloadQueue,
  runGameplayAssetPreloadQueue,
  waitForGameplayAssetPreload
} from '../gameplayAssetPreloadBudget';

/** Shared, nearest-neighbor texture loading for the live game and Director. */
export class PixiTextureBank {
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Map<string, Promise<Texture>>();
  private manifestSealed = false;
  private readonly unexpectedUrls = new Set<string>();

  sealManifest() {
    this.assertManifest();
    this.manifestSealed = true;
  }

  assertManifest() {
    if (this.unexpectedUrls.size > 0) {
      throw new Error(`Texture requested outside the preloaded manifest: ${[...this.unexpectedUrls].sort().join(', ')}`);
    }
    if (this.pending.size > 0) throw new Error('Texture preload barrier has not completed.');
  }

  async load(url: string) {
    const cached = this.textures.get(url);
    if (cached) return cached;

    if (this.manifestSealed) {
      this.unexpectedUrls.add(url);
      throw new Error(`Texture is absent from the sealed manifest: ${url}`);
    }
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

  destroy() {
    // Pixi Assets owns the texture lifetime. Clearing references here lets a
    // restarted mission release this renderer without invalidating shared UI art.
    this.pending.clear();
    this.textures.clear();
  }
}
