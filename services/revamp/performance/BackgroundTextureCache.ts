import { BlurFilter, Color, ColorMatrixFilter, Container, Rectangle, Sprite, Texture, type Filter, type Renderer } from 'pixi.js';
import { fullRenderResolution } from './RendererBudget';

/** The same affine RGB operation as an authored solid color overlay. Pixi's
 * matrix filter unpremultiplies then premultiplies; this row preserves alpha. */
export const backgroundGradeMatrix = (tint: number, grade: number): ColorMatrixFilter['matrix'] => {
  const keep = 1 - grade;
  return [
    keep, 0, 0, 0, ((tint >> 16) & 255) / 255 * grade,
    0, keep, 0, 0, ((tint >> 8) & 255) / 255 * grade,
    0, 0, keep, 0, (tint & 255) / 255 * grade,
    0, 0, 0, 1, 0,
  ];
};

/** Grading each plane commutes with source-over only over a covered opaque base.
 * That base is baked over the renderer's clear color, even if its art has holes. */
export const canBakeBackgroundGrade = (base: { alpha: number; coverViewport?: boolean } | undefined): boolean => (
  base?.alpha === 1 && base.coverViewport === true
);

/** Bake authored softness and eligible sector grades once per profile/viewport. */
export class BackgroundTextureCache {
  private readonly entries = new Map<string, Texture>();
  private contextRenderer?: Renderer;
  private contextDirty = false;
  private disposed = false;
  // Context runners must not trigger nested rendering while Pixi restores GL.
  private readonly contextListener = { contextChange: () => { this.contextDirty = true; } };
  constructor(private readonly renderer: () => Renderer) {}

  get(source: Texture, width: number, height: number, softness: number, tint: string | number = 0xffffff, grade = 0, opaqueBackground?: number) {
    if (this.disposed) return source;
    if (softness <= 0 && grade <= 0 && opaqueBackground === undefined) return source;
    const renderer = this.renderer();
    if (!this.contextRenderer) {
      this.contextRenderer = renderer;
      renderer.runners?.contextChange?.add(this.contextListener);
    }
    this.refreshAfterContextRestore();
    const tintColor = grade > 0 ? new Color(tint).toNumber() : 0;
    const key = `${source.uid}:${width}:${height}:${softness}:${tintColor}:${grade}:${opaqueBackground ?? ''}`;
    const cached = this.entries.get(key);
    if (cached) return cached;
    const root = new Container();
    let tiles = root;
    if (opaqueBackground !== undefined) {
      const clear = new Sprite(Texture.WHITE);
      clear.tint = opaqueBackground;
      clear.width = width; clear.height = height; root.addChild(clear);
      tiles = new Container();
      root.addChild(tiles);
    }
    // Adjacent copies preserve the original continuous blur across tile seams.
    for (let i = -1; i <= 1; i++) {
      const tile = new Sprite(source);
      tile.width = width; tile.height = height; tile.y = i * height;
      tiles.addChild(tile);
    }
    const filters: Filter[] = [];
    if (softness > 0) {
      const blur = new BlurFilter({ strength: softness, quality: 1, kernelSize: 5 });
      filters.push(blur);
      tiles.filters = [blur];
      tiles.filterArea = new Rectangle(0, 0, width, height);
    }
    if (grade > 0) {
      // Preserve the bake's capped DPR; Pixi otherwise defaults filters to 1x.
      const color = new ColorMatrixFilter({ resolution: 'inherit' });
      color.matrix = backgroundGradeMatrix(tintColor, grade);
      filters.push(color);
      // Blur the source first, then composite its clear underlay, then grade.
      root.filters = tiles === root ? filters : [color];
      root.filterArea = new Rectangle(0, 0, width, height);
    }
    try {
      // REVAMP(L): A scene first visited in Low must still have sharp art on return to High.
      const texture = renderer.generateTexture({ target: root, frame: new Rectangle(0, 0, width, height), resolution: fullRenderResolution(renderer), textureSourceOptions: { scaleMode: 'nearest' } });
      this.entries.set(key, texture);
      return texture;
    } finally {
      root.destroy({ children: true });
      for (const filter of filters) filter.destroy();
    }
  }

  clear() {
    // Pixi 8.19's shared GlMeshAdaptor keeps its last texture/sampler binding.
    // Destroying that source destroys the whole BindGroup, so the next mesh
    // cannot set uTexture. Detach only our owned resources before disposal;
    // unrelated bindings and all other shader resources stay untouched.
    const meshPipe = this.contextRenderer?.renderPipes?.mesh as unknown as {
      _adaptor?: { _shader?: { resources?: Record<string, unknown> } };
    } | undefined;
    const resources = meshPipe?._adaptor?._shader?.resources;
    for (const texture of this.entries.values()) {
      const source = texture.source;
      if (resources && source) {
        if (resources.uTexture === source) resources.uTexture = Texture.EMPTY.source;
        if (resources.uSampler === source.style) resources.uSampler = Texture.EMPTY.source.style;
      }
      texture.destroy(true);
    }
    this.entries.clear();
    this.contextDirty = false;
  }

  /** Called before the next scene render; true requires rebinding every plane. */
  refreshAfterContextRestore(): boolean {
    if (!this.contextDirty || this.disposed) return false;
    this.clear();
    return true;
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.contextRenderer?.runners?.contextChange?.remove(this.contextListener);
    this.clear();
    this.contextRenderer = undefined;
  }
}

/** Keep the base and nearest stars. Two-plane authored landmarks are mandatory;
 * the separate large terrain props are never governed by this layer budget. */
export const visibleBackgroundDetail = (index: number, scale: number, layerCount = 5) => (
  layerCount <= 2 || scale >= 1 || (scale >= 0.75 ? index !== 3 : index === 0 || index === layerCount - 1)
);
