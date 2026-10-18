import { BufferImageSource, Texture, type Renderer } from 'pixi.js';
import { RuntimeTextureAtlas } from '../performance/RuntimeTextureAtlas';
import type { PixelSurface } from './pixelArt';

/** One bounded 4 MiB page per active mission; originals survive context loss. */
export class BackdropTextures {
  private readonly atlas: RuntimeTextureAtlas;
  private readonly originals: Texture[] = [];
  private readonly views: Texture[] = [];
  constructor(private readonly renderer: Renderer) {
    this.atlas = new RuntimeTextureAtlas(renderer, { size: 1024, maxEntries: 32 });
  }
  add(label: string, pixels: PixelSurface): Texture {
    const texture = new Texture({ label: `backdrop:${label}`, source: new BufferImageSource({
      resource: pixels.pixels, width: pixels.width, height: pixels.height,
      format: 'rgba8unorm', scaleMode: 'nearest', resolution: 1,
      autoGenerateMipmaps: false, alphaMode: 'no-premultiply-alpha',
      addressMode: 'clamp-to-edge',
    }) });
    this.originals.push(texture);
    const view = this.atlas.get(texture);
    this.views.push(view);
    return view;
  }
  stats() { return { ...this.atlas.getStats(), sourceBytes: this.originals.reduce((sum, texture) => sum + texture.width * texture.height * 4, 0) }; }
  destroy() {
    // Pixi's shared mesh shader retains its last binding after the Mesh dies.
    // Detach only our sources before deleting them, including the atlas page.
    const pipe = this.renderer.renderPipes?.mesh as unknown as {
      _adaptor?: { _shader?: { resources?: Record<string, unknown> } };
    } | undefined;
    const resources = pipe?._adaptor?._shader?.resources;
    for (const texture of [...this.views, ...this.originals]) {
      const source = texture.source;
      if (resources && source) {
        if (resources.uTexture === source) resources.uTexture = Texture.EMPTY.source;
        if (resources.uSampler === source.style) resources.uSampler = Texture.EMPTY.source.style;
      }
    }
    this.atlas.destroy(); this.originals.forEach(texture => texture.destroy(true));
    this.originals.length = this.views.length = 0;
  }
}
