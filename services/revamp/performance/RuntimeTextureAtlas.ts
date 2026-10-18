import { Rectangle, RenderTexture, Sprite, Texture, type Renderer, type TextureSource } from 'pixi.js';

export interface RuntimeTextureAtlasOptions {
  /** One page only; the production default is 16 MiB RGBA at resolution 1. */
  size?: number;
  maxTextureSize?: number;
  maxEntries?: number;
}

type Entry = { original: Texture; view: Texture; detach: () => void };

/**
 * REVAMP(J): Renderer-owned atlas for already loaded, immutable pixel art.
 * Call get during loading/sync, before the scene render, never from onRender.
 * Copies go directly into one existing RenderTexture; no canvas readback,
 * source-file changes, page growth, or full-page upload on subsequent inserts.
 *
 * Conservative eligibility preserves filtering and layout: rotated, trimmed,
 * high-resolution, repeating, mipmapped, linear-filtered and dynamic textures
 * retain their originals. Mutation of a copied source also falls back safely.
 */
export class RuntimeTextureAtlas {
  private readonly size: number;
  private readonly maxTextureSize: number;
  private readonly maxEntries: number;
  private readonly cache = new WeakMap<Texture, Texture>();
  private readonly entries: Entry[] = [];
  private readonly blit = new Sprite({ anchor: 0 });
  private atlas: RenderTexture | undefined;
  private cursorX = 0;
  private cursorY = 0;
  private shelfHeight = 0;
  private initialized = false;
  private disabled = false;
  private disposed = false;
  private copyCount = 0;
  private readonly contextListener = { contextChange: () => this.invalidate() };

  constructor(private readonly renderer: Renderer, options: RuntimeTextureAtlasOptions = {}) {
    this.size = Math.max(4, Math.min(2048, Math.floor(options.size ?? 2048)));
    this.maxTextureSize = Math.max(1, Math.min(256, Math.floor(options.maxTextureSize ?? 256)));
    this.maxEntries = Math.max(1, Math.min(2048, Math.floor(options.maxEntries ?? 2048)));
    // A restored GL context has lost render-target pixels. Keeping the original
    // textures available provides a safe fallback without rendering recursively
    // inside Pixi's context-restoration runner.
    renderer.runners?.contextChange?.add(this.contextListener);
  }

  get(original: Texture): Texture {
    if (this.disposed || this.disabled) return original;
    const cached = this.cache.get(original);
    if (cached) return cached;
    if (!this.eligible(original) || this.entries.length >= this.maxEntries) return original;
    const width = original.frame.width;
    const height = original.frame.height;
    // A transparent texel on every side protects neighboring artwork. Nearest
    // sampling needs no extrusion or additional edge-copy draw calls.
    const packedWidth = width + 2;
    const packedHeight = height + 2;
    let x = this.cursorX;
    let y = this.cursorY;
    let shelfHeight = this.shelfHeight;
    if (x + packedWidth > this.size) {
      x = 0;
      y += shelfHeight;
      shelfHeight = 0;
    }
    if (packedWidth > this.size || y + packedHeight > this.size) return original;

    this.atlas ??= RenderTexture.create({
      label: 'revamp-runtime-atlas', width: this.size, height: this.size,
      resolution: 1, scaleMode: 'nearest', antialias: false,
      autoGenerateMipmaps: false, autoGarbageCollect: false,
      alphaMode: 'premultiplied-alpha', format: 'rgba8unorm'
    });
    this.blit.texture = original;
    this.blit.position.set(x + 1, y + 1);
    try {
      this.renderer.render({
        container: this.blit, target: this.atlas,
        clear: !this.initialized, clearColor: [0, 0, 0, 0]
      });
    } catch {
      // A failed copy must not replace a valid source with incomplete pixels.
      // Permanently stop new copies rather than retrying a failing GPU path.
      this.disabled = true;
      return original;
    } finally {
      this.blit.texture = Texture.EMPTY;
    }
    this.initialized = true;
    this.copyCount++;
    this.cursorX = x + packedWidth;
    this.cursorY = y;
    this.shelfHeight = Math.max(shelfHeight, packedHeight);
    const view = new Texture({
      source: this.atlas.source,
      frame: new Rectangle(x + 1, y + 1, width, height),
      orig: original.orig.clone(), trim: original.trim?.clone(), rotate: original.rotate,
      defaultAnchor: original.defaultAnchor && { ...original.defaultAnchor },
      defaultBorders: original.defaultBorders && { ...original.defaultBorders },
      // Normally immutable; this lets existing Sprites observe a fallback if a
      // supposedly static input changes, or the GL context is restored.
      dynamic: true, label: `atlas:${original.label ?? original.uid}`
    });
    const source = original.source;
    const fallback = () => {
      this.cache.set(original, original);
      this.restoreOriginal(view, original);
    };
    const destroyView = () => { this.cache.set(original, original); view.destroy(false); };
    original.on('update', fallback);
    original.on('destroy', destroyView);
    source.on('update', fallback);
    source.on('styleChange', fallback);
    source.on('destroy', destroyView);
    this.entries.push({ original, view, detach: () => {
      original.off('update', fallback);
      original.off('destroy', destroyView);
      source.off('update', fallback);
      source.off('styleChange', fallback);
      source.off('destroy', destroyView);
    } });
    this.cache.set(original, view);
    return view;
  }

  getStats() {
    return {
      entries: this.entries.length, copies: this.copyCount,
      allocatedBytes: this.atlas ? this.size * this.size * 4 : 0,
      size: this.size, disabled: this.disabled, disposed: this.disposed
    };
  }

  /** Stop using copied pixels after context loss; current Sprites stay valid. */
  invalidate() {
    if (this.disposed) return;
    this.disabled = true;
    for (const { original, view } of this.entries) this.restoreOriginal(view, original);
  }

  /** Destroy only this atlas and its views; the texture bank owns originals. */
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.runners?.contextChange?.remove(this.contextListener);
    for (const { view, detach } of this.entries) {
      detach();
      if (!view.destroyed) view.destroy(false);
    }
    this.entries.length = 0;
    this.blit.destroy({ texture: false, textureSource: false });
    this.atlas?.destroy(true);
    this.atlas = undefined;
  }

  private restoreOriginal(view: Texture, original: Texture) {
    if (view.destroyed || original.destroyed || original.source.destroyed) return;
    view.frame.copyFrom(original.frame);
    view.orig.copyFrom(original.orig);
    // Pixi's trim, rotate and default metadata are readonly. Eligible inputs
    // start untrimmed/unrotated, and these copies preserve that same contract.
    view.source = original.source;
    view.update();
  }

  private eligible(texture: Texture) {
    if (!texture || texture === Texture.EMPTY || texture.destroyed || texture.dynamic || texture instanceof RenderTexture) return false;
    const source: TextureSource = texture.source;
    if (!source || source.destroyed || !source.resource || source.resolution !== 1) return false;
    if (source.uploadMethodId !== 'image' && source.uploadMethodId !== 'buffer') return false;
    if (source.magFilter !== 'nearest' || source.minFilter !== 'nearest' || source.autoGenerateMipmaps || source.mipLevelCount !== 1) return false;
    if (source.style.addressModeU !== 'clamp-to-edge' || source.style.addressModeV !== 'clamp-to-edge') return false;
    if (source.format !== 'rgba8unorm' && source.format !== 'bgra8unorm') return false;
    const { frame, orig, trim, rotate } = texture;
    return !trim && rotate === 0 && frame.x === 0 && frame.y === 0
      && orig.x === 0 && orig.y === 0 && orig.width === frame.width && orig.height === frame.height
      && Number.isInteger(frame.width) && Number.isInteger(frame.height)
      && frame.width > 0 && frame.height > 0
      && frame.width <= this.maxTextureSize && frame.height <= this.maxTextureSize
      && frame.width === source.width && frame.height === source.height;
  }
}
