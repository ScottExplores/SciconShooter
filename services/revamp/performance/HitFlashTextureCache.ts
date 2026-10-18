import { ColorMatrixFilter, Rectangle, Sprite, Texture, type Renderer } from 'pixi.js';

/** Derived alpha silhouettes, preserving Scott's source textures and crisp pixels. */
export class HitFlashTextureCache {
  private readonly textures = new Map<Texture, Texture>();
  private pixels = 0;
  private contextRenderer?: Renderer;
  private contextDirty = false;
  private disposed = false;
  private readonly contextListener = { contextChange: () => { this.contextDirty = true; } };
  constructor(private readonly renderer: () => Renderer) {}

  get(source: Texture): Texture | null {
    if (this.disposed) return null;
    const renderer = this.renderer();
    if (!this.contextRenderer) {
      this.contextRenderer = renderer;
      renderer.runners?.contextChange?.add(this.contextListener);
    }
    // Active flashes request their mask every frame, before assigning it to the
    // Sprite. Rebuild lazily after GL restoration, never inside its runner.
    if (this.contextDirty) this.clear();
    const cached = this.textures.get(source);
    if (cached) return cached;
    const pixels = source.width * source.height;
    // No eviction while live flash sprites can reference a texture. Overflow
    // keeps the existing filter path; renderer disposal frees the bounded cache.
    if (this.textures.size >= 64 || this.pixels + pixels > 8 * 1024 * 1024) return null;
    const sprite = new Sprite(source);
    const white = new ColorMatrixFilter();
    white.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    sprite.filters = [white];
    try {
      const texture = renderer.generateTexture({ target: sprite, frame: new Rectangle(0, 0, source.orig.width, source.orig.height), resolution: 1, textureSourceOptions: { scaleMode: 'nearest' } });
      this.textures.set(source, texture);
      this.pixels += pixels;
      return texture;
    } finally {
      sprite.destroy(); white.destroy();
    }
  }

  private clear() {
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear(); this.pixels = 0;
    this.contextDirty = false;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.contextRenderer?.runners?.contextChange?.remove(this.contextListener);
    this.contextRenderer = undefined;
    this.clear();
  }
}
