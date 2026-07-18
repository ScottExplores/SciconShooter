import { Assets, Texture } from 'pixi.js';

/** Shared, nearest-neighbor texture loading for the live game and Director. */
export class PixiTextureBank {
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Map<string, Promise<Texture>>();

  async load(url: string) {
    const cached = this.textures.get(url);
    if (cached) return cached;

    const pending = this.pending.get(url);
    if (pending) return pending;

    const request = Assets.load<Texture>(url)
      .then((texture) => {
        texture.source.scaleMode = 'nearest';
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

  preload(urls: string[]) {
    return Promise.allSettled([...new Set(urls.filter(Boolean))].map((url) => this.load(url)));
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
