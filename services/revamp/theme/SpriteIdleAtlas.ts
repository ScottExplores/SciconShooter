import { BufferImageSource, Texture, type Renderer } from 'pixi.js';
import { RuntimeTextureAtlas } from '../performance/RuntimeTextureAtlas';
import { bakeIdleFrames, bakeInnerOutline, bakeMetalShimmer, bakePixelGlow, type PixelRaster, type SpritePalette, type SpriteRole } from './spritePixels';

export interface IdleAtlasEntry { frames: Texture[]; outline: Texture | null; shimmer: Texture[] }
type Request = { key: string; original: Texture; role: SpriteRole; outline: boolean };
type PixelReader = (texture: Texture) => PixelRaster | null;

/** Read loaded source art, never the GPU atlas. Integer nearest decimation keeps
 * the generated cosmetic raster bounded; geometry retains the original size. */
export function readSpritePixels(texture: Texture): PixelRaster | null {
  if (texture.destroyed || texture.rotate || texture.trim || typeof document === 'undefined') return null;
  const { frame } = texture;
  if (!frame.width || !frame.height || frame.width > 2048 || frame.height > 2048) return null;
  const divisor = Math.max(1, Math.ceil(Math.max(frame.width, frame.height) / 128));
  const width = Math.ceil(frame.width / divisor), height = Math.ceil(frame.height / divisor);
  try {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = false;
    context.drawImage(texture.source.resource as CanvasImageSource, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
    return { width, height, pixels: new Uint8Array(context.getImageData(0, 0, width, height).data) };
  } catch { return null; }
}

/** One renderer-owned page and ≤48 loaded art poses. Frames are baked once,
 * copied once, then selected without draw-to-texture or canvas work per frame.
 * Original loaded art survives overflow, unsupported inputs and context loss. */
export class SpriteIdleAtlas {
  private readonly atlas: RuntimeTextureAtlas;
  private readonly originals: Texture[] = [];
  private readonly layoutViews: Texture[] = [];
  private readonly entries = new Map<string, IdleAtlasEntry | null>();
  private readonly pending = new Map<string, Request>();
  private readonly roleCounts = new Map<SpriteRole, number>();
  private readonly watched = new Map<Texture, () => void>();
  private readonly invalid = new Set<Texture>();
  private frameCount = 0;
  private unsupported = 0;
  private disposed = false;
  private readonly glow: Texture;
  constructor(private readonly renderer: Renderer, private readonly palette: SpritePalette,
    private readonly readPixels: PixelReader = readSpritePixels, private readonly maxSets = 48) {
    this.atlas = new RuntimeTextureAtlas(renderer, { size: 2048, maxTextureSize: 128, maxEntries: 288 });
    this.glow = this.add('glow', bakePixelGlow());
  }
  glowTexture() { return this.glow; }
  request(key: string, original: Texture, role: SpriteRole, outline: boolean): IdleAtlasEntry | null {
    if (this.disposed || this.invalid.has(original) || original.destroyed) return null;
    const cached = this.entries.get(key);
    if (cached !== undefined) return cached;
    if (this.pending.has(key)) return null;
    // Reserve enough source poses for every regular family even if a player
    // cycles many steering strips before the first wave arrives.
    const roleCap = role === 'enemy' ? 24 : role === 'pickup' ? 10 : role === 'boss' ? 6 : role === 'wing' ? 8 : 6;
    const roleCount = this.roleCounts.get(role) ?? 0;
    if (this.entries.size + this.pending.size < this.maxSets && roleCount < roleCap) {
      this.pending.set(key, { key, original, role, outline });
      this.roleCounts.set(role, roleCount + 1);
    }
    return null;
  }
  /** Called at frame start; at most one new pose is prepared per render. */
  prepareNext() {
    if (this.disposed) return;
    let request: Request | undefined;
    for (const next of this.pending.values()) {
      request ??= next;
      if (next.role === 'enemy') { request = next; break; }
    }
    if (!request) return;
    this.pending.delete(request.key);
    const pixels = request.original.destroyed ? null : this.readPixels(request.original);
    if (!pixels || pixels.width > 128 || pixels.height > 128) { this.unsupported++; this.entries.set(request.key, null); return; }
    const make = (label: string, raster: PixelRaster) => this.add(label, raster, request.original);
    const frames = request.role === 'boss' ? [] : bakeIdleFrames(pixels, request.role, this.palette).map((raster, i) => make(`${request.key}:${i}`, raster));
    const shimmer = request.role === 'player' || request.role === 'wing' || request.role === 'boss'
      ? bakeMetalShimmer(pixels).map((raster, i) => make(`${request.key}:metal:${i}`, raster)) : [];
    this.entries.set(request.key, { frames, shimmer, outline: request.outline ? make(`${request.key}:edge`, bakeInnerOutline(pixels)) : null });
    this.frameCount += frames.length;
    if (!this.watched.has(request.original)) {
      const invalidate = () => this.invalid.add(request.original);
      const source = request.original.source;
      request.original.on('update', invalidate); request.original.on('destroy', invalidate);
      source.on('update', invalidate);
      this.watched.set(request.original, () => {
        request.original.off('update', invalidate); request.original.off('destroy', invalidate);
        source.off('update', invalidate);
      });
    }
  }
  stats() { return { ...this.atlas.getStats(), sets: this.entries.size, frames: this.frameCount, pending: this.pending.size, unsupported: this.unsupported,
    sourceBytes: this.originals.reduce((sum, texture) => sum + texture.source.pixelWidth * texture.source.pixelHeight * 4, 0) }; }
  destroy() {
    if (this.disposed) return; this.disposed = true;
    this.watched.forEach(detach => detach()); this.watched.clear(); this.pending.clear(); this.entries.clear();
    this.layoutViews.forEach(texture => texture.destroy(false)); this.layoutViews.length = 0;
    this.atlas.destroy(); this.originals.forEach(texture => texture.destroy(true)); this.originals.length = 0;
  }
  private add(label: string, pixels: PixelRaster, layout?: Texture): Texture {
    const original = new Texture({ label: `sector-idle:${label}`, source: new BufferImageSource({
      resource: pixels.pixels, width: pixels.width, height: pixels.height,
      format: 'rgba8unorm', resolution: 1, scaleMode: 'nearest', addressMode: 'clamp-to-edge',
      autoGenerateMipmaps: false, alphaMode: 'no-premultiply-alpha',
    }) });
    this.originals.push(original);
    const packed = this.atlas.get(original);
    if (!layout) return packed;
    // Copy the atlas view's source on every fallback notification. The original
    // logical bounds preserve anchors, steering geometry and hit-flash placement.
    const view = new Texture({ source: packed.source, frame: packed.frame.clone(), orig: layout.orig.clone(),
      defaultAnchor: layout.defaultAnchor && { ...layout.defaultAnchor }, dynamic: true, label: `idle-layout:${label}` });
    const fallback = () => { if (!view.destroyed) { view.frame.copyFrom(packed.frame); view.source = packed.source; view.update(); } };
    packed.on('update', fallback);
    // A layout view owns no source; the packed frame/source stay atlas-owned.
    view.once('destroy', () => packed.off('update', fallback));
    this.layoutViews.push(view); return view;
  }
}
