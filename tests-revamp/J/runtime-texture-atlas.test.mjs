import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/performance/RuntimeTextureAtlas';
      export { BufferImageSource, Rectangle, RenderTexture, Sprite, Texture } from 'pixi.js';`,
    resolveDir: process.cwd(), loader: 'ts'
  },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20'
});
const { RuntimeTextureAtlas, BufferImageSource, Rectangle, RenderTexture, Sprite, Texture } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const texture = (width, height = width, options = {}) => new Texture({
  source: new BufferImageSource({
    resource: new Uint8Array(width * height * 4), width, height,
    format: 'rgba8unorm', scaleMode: 'nearest', ...options
  })
});

function recorder() {
  const calls = [];
  const contexts = new Set();
  return {
    calls, contexts,
    renderer: {
      runners: { contextChange: { add(value) { contexts.add(value); }, remove(value) { contexts.delete(value); } } },
      render(options) {
        const sprite = options.container;
        calls.push({
          target: options.target, clear: options.clear, clearColor: options.clearColor,
          original: sprite.texture, x: sprite.x, y: sprite.y, anchor: { ...sprite.anchor },
          scaleX: sprite.scale.x, scaleY: sprite.scale.y, tint: sprite.tint, alpha: sprite.alpha
        });
      }
    }
  };
}

test('copies each source once into the same bounded nearest RenderTexture with gutters', () => {
  const { calls, renderer } = recorder();
  const atlas = new RuntimeTextureAtlas(renderer, { size: 16 });
  const sources = [texture(4), texture(4), texture(6, 3)];
  const views = sources.map(source => atlas.get(source));
  assert.equal(atlas.get(sources[0]), views[0]);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => [call.x, call.y]), [[1, 1], [7, 1], [1, 7]]);
  assert.deepEqual(calls.map(call => call.clear), [true, false, false]);
  assert.ok(calls.every(call => call.target === calls[0].target));
  assert.deepEqual(calls[0].clearColor, [0, 0, 0, 0]);
  assert.ok(views.every(view => view.source === views[0].source));
  assert.equal(views[0].source.width, 16);
  assert.equal(views[0].source.resolution, 1);
  assert.equal(views[0].source.scaleMode, 'nearest');
  assert.equal(views[0].source.autoGenerateMipmaps, false);
  assert.equal(views[0].source.alphaMode, 'premultiplied-alpha');
  assert.deepEqual(atlas.getStats(), { entries: 3, copies: 3, allocatedBytes: 1024, size: 16, disabled: false, disposed: false });
  for (const call of calls) {
    assert.equal(call.scaleX, 1); assert.equal(call.scaleY, 1);
    assert.equal(call.anchor._x, 0); assert.equal(call.anchor._y, 0);
    assert.equal(call.tint, 0xffffff); assert.equal(call.alpha, 1);
  }
  atlas.destroy();
  sources.forEach(source => source.destroy(true));
});

test('derived textures preserve Sprite size, anchor, layout metadata and normalized atlas UVs', () => {
  const { renderer } = recorder();
  const atlas = new RuntimeTextureAtlas(renderer);
  const original = texture(24, 40);
  original.defaultAnchor = { x: 0.35, y: 0.8 };
  original.defaultBorders = { left: 2, right: 3, top: 4, bottom: 5 };
  const view = atlas.get(original);
  const before = new Sprite(original);
  const after = new Sprite(view);
  assert.deepEqual(after.visualBounds, before.visualBounds);
  assert.equal(after.width, before.width);
  assert.equal(after.height, before.height);
  assert.deepEqual(view.orig, original.orig);
  assert.notEqual(view.orig, original.orig);
  assert.equal(view.trim, original.trim);
  assert.deepEqual(view.defaultAnchor, original.defaultAnchor);
  assert.deepEqual(view.defaultBorders, original.defaultBorders);
  assert.equal(view.uvs.x0, 1 / 2048);
  assert.equal(view.uvs.y0, 1 / 2048);
  assert.equal(view.uvs.x2, 25 / 2048);
  assert.equal(view.uvs.y2, 41 / 2048);
  assert.equal(atlas.getStats().allocatedBytes, 16 * 1024 * 1024);
  before.destroy(); after.destroy(); atlas.destroy(); original.destroy(true);
});

test('unsupported layouts, sampling, mutable resources and oversize textures retain originals', () => {
  const { calls, renderer } = recorder();
  const atlas = new RuntimeTextureAtlas(renderer);
  const sources = [
    texture(257), texture(16, 16, { scaleMode: 'linear' }),
    texture(16, 16, { resolution: 2 }), texture(16, 16, { addressMode: 'repeat' }),
    texture(16, 16, { autoGenerateMipmaps: true }),
    RenderTexture.create({ width: 16, height: 16, scaleMode: 'nearest' }),
    texture(16), texture(16), texture(16), texture(16), texture(16)
  ];
  sources[6].trim = new Rectangle(1, 1, 14, 14);
  sources[7].rotate = 2;
  sources[8].frame.x = 1;
  sources[9].dynamic = true;
  sources[10].source.uploadMethodId = 'video';
  for (const source of sources) assert.equal(atlas.get(source), source);
  assert.equal(atlas.get(Texture.EMPTY), Texture.EMPTY);
  assert.equal(calls.length, 0);
  assert.equal(atlas.getStats().allocatedBytes, 0);
  atlas.destroy(); sources.forEach(source => source.destroy(true));
});

test('overflow and entry bounds never grow the page or discard originals', () => {
  const { calls, renderer } = recorder();
  const atlas = new RuntimeTextureAtlas(renderer, { size: 8 });
  const first = texture(6);
  const overflow = texture(1);
  assert.notEqual(atlas.get(first), first);
  assert.equal(atlas.get(overflow), overflow);
  assert.equal(atlas.get(overflow), overflow);
  assert.equal(calls.length, 1);
  assert.equal(atlas.getStats().allocatedBytes, 8 * 8 * 4);
  const limited = new RuntimeTextureAtlas(renderer, { maxEntries: 1 });
  assert.notEqual(limited.get(first), first);
  assert.equal(limited.get(overflow), overflow);
  limited.destroy(); atlas.destroy();
  assert.equal(first.destroyed, false); assert.equal(first.source.destroyed, false);
  assert.equal(overflow.destroyed, false); assert.equal(overflow.source.destroyed, false);
  first.destroy(true); overflow.destroy(true);
});

test('source mutations and context restoration switch already assigned Sprites back to originals', () => {
  const { calls, contexts, renderer } = recorder();
  const atlas = new RuntimeTextureAtlas(renderer);
  const first = texture(10);
  const second = texture(12);
  const view = atlas.get(first);
  const sprite = new Sprite(view);
  sprite.didViewUpdate = false;
  first.source.update();
  assert.equal(atlas.get(first), first);
  assert.equal(sprite.texture.source, first.source);
  assert.deepEqual(sprite.texture.frame, first.frame);
  assert.equal(sprite.didViewUpdate, true);
  const secondView = atlas.get(second);
  assert.notEqual(secondView.source, second.source);
  for (const listener of contexts) listener.contextChange();
  assert.equal(secondView.source, second.source);
  assert.equal(atlas.get(second), second);
  assert.equal(atlas.getStats().disabled, true);
  assert.equal(calls.length, 2);
  sprite.destroy(); atlas.destroy();
  assert.equal(contexts.size, 0);
  first.destroy(true); second.destroy(true);
});

test('copy failure falls back and disposal destroys only owned objects and listeners', () => {
  const { contexts, renderer } = recorder();
  const atlas = new RuntimeTextureAtlas(renderer);
  const original = texture(10);
  const source = original.source;
  const listeners = source.listenerCount('update');
  const view = atlas.get(original);
  const atlasSource = view.source;
  assert.equal(source.listenerCount('update'), listeners + 1);
  atlas.destroy(); atlas.destroy();
  assert.equal(view.destroyed, true);
  assert.equal(atlasSource.destroyed, true);
  assert.equal(original.destroyed, false);
  assert.equal(source.destroyed, false);
  assert.equal(source.listenerCount('update'), listeners);
  assert.equal(contexts.size, 0);
  assert.equal(atlas.get(original), original);
  const failing = new RuntimeTextureAtlas({ render() { throw new Error('test GPU failure'); } });
  assert.equal(failing.get(original), original);
  assert.equal(failing.getStats().copies, 0);
  assert.equal(failing.getStats().disabled, true);
  failing.destroy();
  assert.equal(original.destroyed, false);
  assert.equal(source.destroyed, false);
  original.destroy(true);
});
