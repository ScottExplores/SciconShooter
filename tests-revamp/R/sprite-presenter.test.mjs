import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';
globalThis.navigator ??= { userAgent: 'node-test' };
const bundle = await build({ stdin: { contents: `export * from './services/revamp/theme/SectorSpritePresentation';
export * from './services/revamp/theme/SpriteIdleAtlas';
export { Assets, BufferImageSource, Container, Sprite, Texture } from 'pixi.js';`, resolveDir: process.cwd(), loader: 'ts' },
bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20' });
const { SectorSpritePresentation, SpriteIdleAtlas, Assets, BufferImageSource, Container, Sprite, Texture } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const campaign = JSON.parse(fs.readFileSync('game-config/campaign.json', 'utf8'));
const high = { tier: 'high', trailScale: 1, particleScale: 1, backgroundLayerScale: 1 };
const pixels = { width: 8, height: 8, pixels: Uint8Array.from({ length: 256 }, (_, i) => i % 4 === 3 ? 255 : 150) };
function fixture() {
  const renderer = { runners: { contextChange: { add() {}, remove() {} } }, render() {} };
  const source = new Texture({ source: new BufferImageSource({ resource: pixels.pixels, width: 8, height: 8, scaleMode: 'nearest' }) });
  Assets.cache.set('R-presenter-source', source);
  const engine = { campaign, frameCount: 2, getCurrentLevelDefinition: () => campaign.levels[0] };
  const presenter = new SectorSpritePresentation(() => renderer);
  presenter.beginFrame(engine, high, false);
  presenter.atlas.destroy();
  presenter.atlas = new SpriteIdleAtlas(renderer, [0x334455, 0x6688aa, 0xaaddff], () => pixels);
  const root = new Container(), sprite = new Sprite(source); root.addChild(sprite);
  sprite.width = 44; sprite.height = 44;
  const view = { root, sprite, displayedTextureKey: 'R-presenter-source' };
  const entity = { type: 'ENEMY_DRONE', variant: 1, formationIndex: 0, isElite: true };
  const apply = () => presenter.entity(view, entity);
  apply(); presenter.atlas.prepareNext(); apply(); presenter.headers([], [], root);
  const dispose = () => { presenter.destroy(); root.destroy({ children: true }); Assets.cache.remove('R-presenter-source'); source.destroy(true); };
  return { presenter, engine, view, entity, apply, root, source, dispose };
}

test('elite-to-normal pooled view retires its outline and Low removes all optional quads', () => {
  const f = fixture();
  assert.equal(f.presenter.snapshot().optionalVisible.outline, 1);
  assert.equal(f.view.sprite.width, 44); assert.equal(f.view.sprite.height, 44);
  f.entity.isElite = false; f.apply();
  assert.deepEqual(f.presenter.snapshot().optionalVisible, { glow: 0, outline: 0, shimmer: 0 });
  f.entity.isElite = true;
  f.presenter.beginFrame(f.engine, { ...high, tier: 'low' }, false); f.apply();
  assert.deepEqual(f.presenter.snapshot().optionalVisible, { glow: 0, outline: 0, shimmer: 0 });
  f.dispose();
});

test('owners disappearing without an entity update retire only their sibling overlays', () => {
  const f = fixture();
  assert.equal(f.presenter.snapshot().optionalVisible.glow, 1);
  f.presenter.beginFrame(f.engine, high, false);
  f.presenter.headers([], [], f.root);
  assert.deepEqual(f.presenter.snapshot().optionalVisible, { glow: 0, outline: 0, shimmer: 0 });
  assert.equal(f.root.destroyed, false); f.dispose();
});

test('pause/reduced motion selects a stable texture; teardown restores live source before derived resources die', () => {
  const f = fixture();
  f.presenter.beginFrame(f.engine, high, true); f.apply();
  const reduced = f.view.sprite.texture;
  f.engine.frameCount = 90;
  f.presenter.beginFrame(f.engine, high, true); f.apply();
  assert.equal(f.view.sprite.texture, reduced);
  f.presenter.beginFrame(f.engine, high, false); f.apply();
  const paused = f.view.sprite.texture;
  f.presenter.beginFrame(f.engine, high, false); f.apply();
  assert.equal(f.view.sprite.texture, paused);
  f.presenter.destroy();
  assert.equal(f.view.sprite.texture, f.source); assert.equal(f.source.destroyed, false);
  assert.equal(reduced.destroyed, true); f.dispose();
});

test('changing mission restores source textures and discards old sector atlas', () => {
  const f = fixture(), old = f.view.sprite.texture;
  f.engine.getCurrentLevelDefinition = () => campaign.levels[1];
  f.presenter.beginFrame(f.engine, high, false);
  assert.equal(f.view.sprite.texture, f.source); assert.equal(old.destroyed, true);
  assert.equal(f.presenter.snapshot().atlas.sets, 0);
  f.dispose();
});
