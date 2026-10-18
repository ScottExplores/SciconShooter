import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/performance/SelectedSpriteBatcher';
      export { BatchableSprite, BatchableGraphics, DefaultBatcher, DOMAdapter, Graphics, Sprite, Texture, TextureSource,
        Rectangle, Matrix, RendererType, BatcherPipe, InstructionSet } from 'pixi.js';`,
    resolveDir: process.cwd(), loader: 'ts'
  },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20'
});
const pixi = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
// Shader construction only asks for the supported precision; no GPU is needed
// to compare real Pixi geometry, packing, batch construction or shader source.
pixi.DOMAdapter.set({ ...pixi.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) });
const {
  BatchableSprite, BatchableGraphics, DefaultBatcher, SelectedSpriteBatcher, Graphics, Sprite, Texture, TextureSource,
  Rectangle, Matrix, RendererType, BatcherPipe, InstructionSet,
  SELECTED_SPRITE_BATCHER_NAME, tagLargeSprite, installSelectedSpriteBatcher
} = pixi;

const batchable = (sprite) => {
  const element = new BatchableSprite();
  element.renderable = sprite;
  element.texture = sprite.texture;
  element.bounds = sprite.visualBounds;
  element.transform = new Matrix(1.2, 0.3, -0.2, 0.8, 17, 49);
  element.roundPixels = 1;
  return element;
};
const spriteFor = (trimmed) => {
  const texture = new Texture({
    source: new TextureSource({ width: 256, height: 256 }),
    frame: new Rectangle(32, 64, 48, 32),
    orig: new Rectangle(0, 0, 80, 60),
    ...(trimmed ? { trim: new Rectangle(11, 7, 32, 48), rotate: 2 } : {})
  });
  const sprite = new Sprite({ texture, anchor: { x: 0.35, y: 0.8 } });
  sprite.tint = 0x42b8e1;
  sprite.alpha = 0.6;
  // groupColorAlpha is what the real SpritePipe supplies after parent updates.
  // Use a non-white, non-opaque packed value to verify no data gets dropped.
  sprite.groupColorAlpha = 0x9942b8e1;
  sprite.groupBlendMode = 'add';
  return sprite;
};

test('selected batches pack real Sprite anchors, trim, rotated UVs, color and rounding identically', () => {
  const stock = new DefaultBatcher({ maxTextures: 8 });
  const selected = new SelectedSpriteBatcher({ maxTextures: 8 });
  for (const trimmed of [false, true]) {
    const sprite = spriteFor(trimmed);
    const element = batchable(sprite);
    const expected = new ArrayBuffer(24 * 4);
    const actual = new ArrayBuffer(24 * 4);
    stock.packQuadAttributes(element, new Float32Array(expected), new Uint32Array(expected), 0, 0);
    selected.packQuadAttributes(element, new Float32Array(actual), new Uint32Array(actual), 0, 0);
    assert.deepEqual(new Uint8Array(actual), new Uint8Array(expected));
    assert.equal(new Uint32Array(actual)[4], sprite.groupColorAlpha);
    assert.equal(new Uint32Array(actual)[5], 1);
    assert.equal(element.blendMode, 'add');
    if (trimmed) assert.equal(element.bounds.minX, 11 - 0.35 * 80);
    assert.equal(new Float32Array(actual)[2], Math.fround(sprite.texture.uvs.x0));
    sprite.destroy({ texture: true, textureSource: true });
  }
  stock.destroy();
  selected.destroy();
});

test('one-sampler shader stays separate from the stock shader cache and splits texture sources', () => {
  const stockBefore = new DefaultBatcher({ maxTextures: 8 });
  const selected = new SelectedSpriteBatcher({ maxTextures: 8 });
  const stockAfter = new DefaultBatcher({ maxTextures: 8 });
  assert.equal(selected.maxTextures, 1);
  assert.equal(selected.shader.maxTextures, 1);
  assert.match(selected.shader.glProgram.fragment, /uTextures\[1\]/);
  assert.doesNotMatch(selected.shader.glProgram.fragment, /if\(vTextureId/);
  assert.equal(stockAfter.shader, stockBefore.shader);
  assert.equal(stockAfter.shader.maxTextures, 8);
  const first = spriteFor(false);
  const second = spriteFor(false);
  const instructions = new InstructionSet();
  selected.begin();
  selected.add(batchable(first));
  selected.add(batchable(second));
  selected.break(instructions);
  assert.equal(selected.batchIndex, 2);
  assert.ok(selected.batches.slice(0, selected.batchIndex).every(batch => batch.textures.count === 1));
  stockBefore.destroy(); stockAfter.destroy(); selected.destroy();
  first.destroy({ texture: true, textureSource: true });
  second.destroy({ texture: true, textureSource: true });
});

test('renderer-local routing preserves stock sprites, draw order and reference-counted cleanup', () => {
  const renderer = { type: RendererType.WEBGL, limits: { maxBatchableTextures: 8 }, renderPipes: {} };
  const pipe = renderer.renderPipes.batch = new BatcherPipe(renderer, {});
  const original = pipe.addToBatch;
  const releaseFirst = installSelectedSpriteBatcher(renderer);
  const installed = pipe.addToBatch;
  const releaseSecond = installSelectedSpriteBatcher(renderer);
  assert.equal(pipe.addToBatch, installed);
  const stockSprite = spriteFor(false);
  const selectedSprite = tagLargeSprite(spriteFor(true));
  const selectedElement = batchable(selectedSprite);
  const instructions = new InstructionSet();
  pipe.buildStart(instructions);
  pipe.addToBatch(batchable(stockSprite), instructions);
  pipe.addToBatch(selectedElement, instructions);
  pipe.addToBatch(batchable(stockSprite), instructions);
  pipe.buildEnd(instructions);
  assert.deepEqual(instructions.instructions.slice(0, instructions.instructionSize).map(batch => batch.batcher.name),
    ['default', SELECTED_SPRITE_BATCHER_NAME, 'default']);
  assert.equal(selectedElement.batcherName, 'default', 'temporary routing does not mutate persistent GPU selection');
  releaseFirst(); releaseFirst();
  assert.equal(pipe.addToBatch, installed);
  releaseSecond();
  assert.equal(pipe.addToBatch, original);
  pipe.destroy();
  stockSprite.destroy({ texture: true, textureSource: true });
  selectedSprite.destroy({ texture: true, textureSource: true });
});

test('cleanup leaves later wrappers intact and non-WebGL renderers are untouched', () => {
  const calls = [];
  const pipe = { addToBatch(element) { calls.push(element.batcherName); } };
  const renderer = { type: RendererType.WEBGL, renderPipes: { batch: pipe } };
  const release = installSelectedSpriteBatcher(renderer);
  const installed = pipe.addToBatch;
  const laterWrapper = function (...args) { return installed.apply(this, args); };
  pipe.addToBatch = laterWrapper;
  release();
  assert.equal(pipe.addToBatch, laterWrapper);
  const sprite = tagLargeSprite(spriteFor(false));
  pipe.addToBatch(batchable(sprite), {});
  assert.deepEqual(calls, ['default']);
  for (const type of [RendererType.WEBGPU, RendererType.CANVAS]) {
    const untouched = { type, renderPipes: { batch: pipe } };
    installSelectedSpriteBatcher(untouched)();
    assert.equal(pipe.addToBatch, laterWrapper);
  }
  sprite.destroy({ texture: true, textureSource: true });
});

test('white Graphics geometry uses identical mesh packing and respects the routing option', () => {
  const graphics = new Graphics().rect(0, 0, 30, 40).fill({ color: 0x55cc99, alpha: 0.7 });
  graphics.groupColor = 0xddeeff;
  graphics.groupAlpha = 0.75;
  graphics.groupTransform.set(1.1, 0.2, -0.3, 0.9, 25, 40);
  const element = new BatchableGraphics();
  element.renderable = graphics;
  element.texture = Texture.WHITE;
  element.baseColor = 0x55cc99;
  element.alpha = 0.7;
  element.attributeOffset = 0;
  element.attributeSize = 3;
  element.indexOffset = 0;
  element.indexSize = 3;
  element.geometryData = { vertices: [0, 0, 30, 0, 0, 40], uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2] };
  const stock = new DefaultBatcher({ maxTextures: 8 });
  const selected = new SelectedSpriteBatcher({ maxTextures: 8 });
  const expected = new ArrayBuffer(18 * 4);
  const actual = new ArrayBuffer(18 * 4);
  stock.packAttributes(element, new Float32Array(expected), new Uint32Array(expected), 0, 0);
  selected.packAttributes(element, new Float32Array(actual), new Uint32Array(actual), 0, 0);
  assert.deepEqual(new Uint8Array(actual), new Uint8Array(expected));
  const routed = [];
  const pipe = { addToBatch(item) { routed.push(item.batcherName); } };
  const renderer = { type: RendererType.WEBGL, renderPipes: { batch: pipe } };
  const withoutWhite = installSelectedSpriteBatcher(renderer, { routeWhiteGeometry: false });
  pipe.addToBatch(element, {});
  const withWhite = installSelectedSpriteBatcher(renderer);
  pipe.addToBatch(element, {});
  withWhite();
  pipe.addToBatch(element, {});
  withoutWhite();
  assert.deepEqual(routed, ['default', SELECTED_SPRITE_BATCHER_NAME, 'default']);
  assert.equal(element.batcherName, 'default');
  stock.destroy(); selected.destroy(); graphics.destroy();
});

test('routing never overrides a third-party batcher and restores names after enqueue failure', () => {
  const sprite = tagLargeSprite(spriteFor(false));
  const element = batchable(sprite);
  const seen = [];
  const pipe = { addToBatch(item) { seen.push(item.batcherName); throw new Error('enqueue failed'); } };
  const renderer = { type: RendererType.WEBGL, renderPipes: { batch: pipe } };
  const release = installSelectedSpriteBatcher(renderer);
  assert.throws(() => pipe.addToBatch(element, {}), /enqueue failed/);
  assert.equal(element.batcherName, 'default');
  element.batcherName = 'another-custom-batcher';
  assert.throws(() => pipe.addToBatch(element, {}), /enqueue failed/);
  assert.deepEqual(seen, [SELECTED_SPRITE_BATCHER_NAME, 'another-custom-batcher']);
  assert.equal(element.batcherName, 'another-custom-batcher');
  release(); sprite.destroy({ texture: true, textureSource: true });
});
