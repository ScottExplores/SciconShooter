import {
  BatchableSprite,
  BatchGeometry,
  Batcher,
  DefaultBatcher,
  DefaultShader,
  ExtensionType,
  extensions,
  RendererType,
  Texture,
  type BatcherOptions,
  type Container,
  type Renderer,
  type Sprite
} from 'pixi.js';

export const SELECTED_SPRITE_BATCHER_NAME = 'scicon-single-texture';
const selectedSprites = new WeakSet<Container>();
let singleTextureShader: DefaultShader | undefined;
let registered = false;

/**
 * Stock Pixi vertex packing, with a separate one-sampler shader. Extending
 * DefaultBatcher itself would inherit its module-wide defaultShader cache.
 */
export class SelectedSpriteBatcher extends Batcher {
  static extension = { type: ExtensionType.Batcher, name: SELECTED_SPRITE_BATCHER_NAME };
  name = SELECTED_SPRITE_BATCHER_NAME;
  geometry = new BatchGeometry();
  vertexSize = 6;
  shader: DefaultShader;

  constructor(options: BatcherOptions) {
    super({ ...options, maxTextures: 1 });
    this.shader = singleTextureShader ??= new DefaultShader(1);
  }

  packAttributes(...args: Parameters<DefaultBatcher['packAttributes']>) {
    DefaultBatcher.prototype.packAttributes.apply(this, args);
  }

  packQuadAttributes(...args: Parameters<DefaultBatcher['packQuadAttributes']>) {
    DefaultBatcher.prototype.packQuadAttributes.apply(this, args);
  }

  destroy() {
    // Shared for the module lifetime, like Pixi's default shader. Geometry and
    // buffers remain owned and destroyed by each individual batcher.
    this.shader = null;
    super.destroy();
  }
}

/** Tag before the Sprite's first render; eligibility stays fixed for its life. */
export function tagLargeSprite<T extends Sprite>(sprite: T): T {
  selectedSprites.add(sprite);
  return sprite;
}

type Installation = { users: number; whiteGeometryUsers: number; release: () => void };
const installations = new WeakMap<Renderer, Installation>();

/**
 * REVAMP(J): Pixi 8.19 has no per-Sprite batcher option. This renderer-local
 * enqueue hook changes only batch selection: SpritePipe still owns anchors,
 * trimmed/rotated UVs, transforms, tint, rounding, texture updates and filters.
 *
 * The extension and packing APIs are exported; the one coupling to Pixi's
 * render pipeline is BatcherPipe.addToBatch receiving stock batchable objects.
 * Solid Graphics fills and white-texture particles can share the same cheap
 * path without rebuilding their geometry or altering their display objects.
 * Keep this behavior covered when upgrading Pixi. WebGPU is deliberately left
 * alone: its stock adaptor sizes bind groups from the renderer-wide limit.
 */
export function installSelectedSpriteBatcher(
  renderer: Renderer,
  { routeWhiteGeometry = true }: { routeWhiteGeometry?: boolean } = {}
): () => void {
  if (renderer.type !== RendererType.WEBGL) return () => {};
  let installation = installations.get(renderer);
  if (!installation) {
    if (!registered) {
      extensions.add(SelectedSpriteBatcher);
      registered = true;
    }
    const pipe = renderer.renderPipes.batch;
    const original = pipe.addToBatch;
    let active = true;
    const wrapped: typeof original = function (element, instructionSet) {
      if (
        !active
        || element.batcherName !== 'default'
        || !(
          (installation.whiteGeometryUsers > 0 && element.texture === Texture.WHITE)
          || (element instanceof BatchableSprite && selectedSprites.has(element.renderable))
        )
      ) return original.call(this, element, instructionSet);

      // BatcherPipe chooses the batch synchronously. Restore the field after
      // enqueueing so cleanup never leaves a modified GPU object behind.
      element.batcherName = SELECTED_SPRITE_BATCHER_NAME;
      try { return original.call(this, element, instructionSet); }
      finally { element.batcherName = 'default'; }
    };
    pipe.addToBatch = wrapped;
    installation = {
      users: 0,
      whiteGeometryUsers: 0,
      release() {
        active = false;
        // Preserve any later instrumentation wrapper; our closure becomes an
        // inert delegate until that owner also removes its wrapper.
        if (pipe.addToBatch === wrapped) pipe.addToBatch = original;
        installations.delete(renderer);
      }
    };
    installations.set(renderer, installation);
  }
  installation.users++;
  if (routeWhiteGeometry) installation.whiteGeometryUsers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (routeWhiteGeometry) installation.whiteGeometryUsers--;
    if (--installation.users === 0) installation.release();
  };
}
