import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.navigator ??= { userAgent: 'node-test' };
globalThis.document = { createElement: () => ({ getContext: () => ({ isContextLost: () => false, getShaderPrecisionFormat: () => ({ precision: 23 }) }) }) };
const output = await build({
  stdin: { contents: `
    export { BackgroundTextureCache } from './services/revamp/performance/BackgroundTextureCache';
    export { HitFlashTextureCache } from './services/revamp/performance/HitFlashTextureCache';
    export { PixiEnvironment } from './services/pixi/PixiEnvironment';
    export { FeelPresentation } from './services/revamp/feel/FeelPresentation';
    export { Container, Graphics, Sprite, Texture, TextureSource, RenderTexture, Shader } from 'pixi.js';
    export { EntityType } from './types';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const directory = await mkdtemp(join(tmpdir(), 'scicon-J-context-'));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(join(directory, 'bundle.mjs'), output.outputFiles[0].text);
const { BackgroundTextureCache, HitFlashTextureCache, PixiEnvironment, FeelPresentation, Container, Graphics, Sprite, Texture, TextureSource, RenderTexture, Shader, EntityType } = await import(pathToFileURL(join(directory, 'bundle.mjs')));

const rendererFixture = () => {
  const listeners = new Set(), generated = [];
  return {
    listeners, generated,
    restore() { for (const listener of [...listeners]) listener.contextChange(); },
    renderer: {
      resolution: 2,
      runners: { contextChange: { add(listener) { listeners.add(listener); }, remove(listener) { listeners.delete(listener); } } },
      generateTexture({ frame, resolution }) {
        const texture = RenderTexture.create({ width: frame.width, height: frame.height, resolution });
        generated.push(texture);
        return texture;
      },
    },
  };
};

test('background restore waits for a frame, invalidates once, and detaches its listener on disposal', () => {
  const f = rendererFixture();
  const cache = new BackgroundTextureCache(() => f.renderer);
  const before = cache.get(Texture.WHITE, 390, 844, 0.55, '#123456', 0.12);
  assert.equal(f.listeners.size, 1);
  f.restore(); f.restore();
  assert.equal(f.generated.length, 1, 'context runner never renders recursively');
  assert.equal(before.destroyed, false, 'bound texture remains valid until frame preparation');
  assert.equal(cache.refreshAfterContextRestore(), true);
  assert.equal(before.destroyed, true);
  assert.equal(cache.refreshAfterContextRestore(), false);
  const after = cache.get(Texture.WHITE, 390, 844, 0.55, '#123456', 0.12);
  assert.notEqual(after, before); assert.equal(f.generated.length, 2);
  cache.destroy(); cache.destroy();
  assert.equal(f.listeners.size, 0); assert.equal(after.destroyed, true);
  assert.equal(cache.get(Texture.WHITE, 390, 844, 0.55), Texture.WHITE);
  assert.equal(Texture.WHITE.destroyed, false);
});

test('same-profile environment update rebinds every cached plane after restoration', async () => {
  const f = rendererFixture();
  const original = new Texture({ source: new TextureSource({ width: 1024, height: 1024 }) });
  const bank = { get: () => original, preload: async () => {}, preloadRequired: async () => {} };
  const background = new Container(), foreground = new Container();
  const environment = new PixiEnvironment(background, foreground, bank, () => f.renderer);
  try {
    await environment.init(390, 844);
    const planes = environment.parallaxLayers;
    const before = planes.map(layer => layer.sprites[0].texture);
    const generatedBefore = f.generated.length;
    f.restore();
    assert.equal(f.generated.length, generatedBefore);
    environment.update({
      frameCount: 60, campaign: { levels: [] }, performanceMode: true,
      player: { y: 700, height: 40 },
      getCurrentLevelDefinition: () => undefined,
      getCurrentWaveDefinition: () => undefined,
      getRuntimeState: () => ({ stageHyperspeedActive: false }),
    });
    assert.equal(environment.activeBackgroundId, 'open-orbit');
    assert.equal(environment.sectorTint.visible, false, 'same baked grade remains effective after restore');
    for (let i = 0; i < planes.length; i++) {
      assert.equal(before[i].destroyed, true);
      for (const sprite of planes[i].sprites) {
        assert.notEqual(sprite.texture, before[i]);
        assert.equal(sprite.texture.destroyed, false);
      }
    }
    assert.equal(f.generated.length, generatedBefore + new Set(before).size, 'only currently bound planes rebake; initial warmup intermediates stay discarded');
  } finally {
    environment.destroy(); background.destroy({ children: true }); foreground.destroy({ children: true });
    assert.equal(f.listeners.size, 0); assert.equal(original.destroyed, false);
    original.destroy(true);
  }
});

test('an active flash replaces its already-bound mask on the first post-restore frame', () => {
  const f = rendererFixture();
  const cache = new HitFlashTextureCache(() => f.renderer);
  const original = new Texture({ source: new TextureSource({ width: 32, height: 40 }) });
  const overlay = new Container();
  const feel = new FeelPresentation({}, overlay, texture => cache.get(texture));
  const view = { root: new Container(), sprite: new Sprite(original), body: new Graphics(), aura: new Graphics(), trail: new Graphics(), flash: new Graphics(), hasFallbackBody: false };
  const entity = { id: 'boss', type: EntityType.BOSS };
  feel.impact({ targetId: entity.id, vx: 0, vy: 1 });
  feel.entity(view, entity);
  const before = view.hitFlash.texture;
  f.restore();
  assert.equal(view.hitFlash.texture, before); assert.equal(f.generated.length, 1);
  feel.entity(view, entity);
  assert.equal(view.hitFlash.visible, true);
  assert.notEqual(view.hitFlash.texture, before);
  assert.equal(view.hitFlash.texture.destroyed, false); assert.equal(before.destroyed, true);
  assert.equal(f.generated.length, 2);
  // Exercise real FeelPresentation cleanup without invoking unrelated particles.
  feel.effects.reset = () => {};
  feel.destroy(); cache.destroy(); cache.destroy();
  assert.equal(f.listeners.size, 0); assert.equal(cache.get(original), null);
  assert.equal(original.destroyed, false);
  view.root.destroy({ children: true }); view.sprite.destroy();
  for (const graphic of [view.body, view.aura, view.trail, view.flash]) graphic.destroy();
  overlay.destroy(); original.destroy(true);
});

test('disposing a bound background preserves Pixi shared mesh BindGroups across replacement and teardown', () => {
  for (const disposal of ['clear', 'restore', 'destroy']) {
    const f = rendererFixture();
    const cache = new BackgroundTextureCache(() => f.renderer);
    const texture = cache.get(Texture.WHITE, 390, 844, 0.55);
    // Real Shader accessors and BindGroup change listeners reproduce the crash:
    // source.destroy() otherwise sets group.resources=null before the next draw.
    const shader = new Shader({ resources: { uTexture: texture.source, uSampler: texture.source.style } });
    const group = shader.groups[99];
    f.renderer.renderPipes = { mesh: { _adaptor: { _shader: shader } } };
    if (disposal === 'restore') { f.restore(); cache.refreshAfterContextRestore(); }
    else cache[disposal]();
    assert.equal(texture.destroyed, true);
    assert.notEqual(group.resources, null, disposal);
    assert.equal(shader.resources.uTexture, Texture.EMPTY.source);
    assert.equal(shader.resources.uSampler, Texture.EMPTY.source.style);
    assert.doesNotThrow(() => {
      shader.resources.uTexture = Texture.WHITE.source;
      shader.resources.uSampler = Texture.WHITE.source.style;
    }, 'the next mesh can bind valid source pixels');
    cache.destroy(); shader.destroy();
  }
});

test('background disposal leaves unrelated mesh resources intact and detaches an owned sampler independently', () => {
  const f = rendererFixture();
  const cache = new BackgroundTextureCache(() => f.renderer);
  const texture = cache.get(Texture.WHITE, 390, 844, 0.55);
  const shader = new Shader({ resources: { uTexture: Texture.WHITE.source, uSampler: texture.source.style } });
  f.renderer.renderPipes = { mesh: { _adaptor: { _shader: shader } } };
  cache.clear();
  assert.equal(shader.resources.uTexture, Texture.WHITE.source);
  assert.equal(shader.resources.uSampler, Texture.EMPTY.source.style);
  shader.resources.uSampler = Texture.WHITE.source.style;
  cache.get(Texture.WHITE, 390, 844, 0.55);
  cache.clear();
  assert.equal(shader.resources.uTexture, Texture.WHITE.source);
  assert.equal(shader.resources.uSampler, Texture.WHITE.source.style);
  cache.destroy(); shader.destroy();
});
