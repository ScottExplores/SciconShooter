import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Real Pixi Graphics/contexts need no GPU. Lights alone use a canvas-free facade.
globalThis.navigator ??= { userAgent: 'node-test' };
const output = await build({
  stdin: { contents: `
    export { ArcadeEffectPool } from './services/pixi/ArcadeEffectPool';
    export { EffectGeometryCache, effectGeometryFrame, EFFECT_GEOMETRY_FRAME_COUNT } from './services/revamp/performance/EffectGeometryCache';
    export { Container, Graphics, Texture } from 'pixi.js';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'canvas-free-lights', setup(builder) {
    builder.onResolve({ filter: /SoftRadialLight$/ }, () => ({ path: 'lights', namespace: 'test' }));
    builder.onLoad({ filter: /^lights$/, namespace: 'test' }, () => ({ contents: `
      import { Container } from 'pixi.js';
      export const createSoftRadialLight=()=>({root:new Container()});
      export const hideSoftRadialLight=l=>{l.root.visible=false};
      export const showSoftRadialLight=l=>{l.root.visible=true};
    `, resolveDir: process.cwd() }));
  } }]
});
const { ArcadeEffectPool, EffectGeometryCache, effectGeometryFrame, EFFECT_GEOMETRY_FRAME_COUNT, Container, Graphics, Texture } =
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);

test('animated effects share immutable Pixi geometry and retain continuous lifetime/motion', () => {
  const layer = new Container();
  const pool = new ArcadeEffectPool(layer);
  const first = pool.spawn('shockwave', 20, 30, 80, '#67e8f9', 360);
  const second = pool.spawn('shockwave', 60, 70, 80, '#67e8f9', 360);
  assert.equal(first.graphic.context, second.graphic.context);
  assert.equal(first.graphic.context.instructions.length, 2);
  const originalClear = Graphics.prototype.clear;
  let clears = 0;
  Graphics.prototype.clear = function () { clears++; return originalClear.call(this); };
  try {
    first.velocityX = 2;
    for (let i = 0; i < 10; i++) {
      pool.update(16);
      assert.equal(first.graphic.context, second.graphic.context);
    }
    assert.equal(clears, 0, 'animation never clears or mutates shared geometry');
    assert.equal(first.age, 160);
    assert.ok(Math.abs(first.root.x - (20 + 2 * 160 / 16.667)) < 0.001);
    assert.ok(Math.abs(first.root.alpha - (1 - 160 / 360)) < 0.001);
    assert.ok(pool.getStats().geometry.hits >= 11);
    pool.update(100); pool.update(100);
    assert.equal(pool.getStats().active, 0);
    assert.equal(first.geometryKey, null);
  } finally {
    Graphics.prototype.clear = originalClear;
    pool.destroy();
  }
  assert.equal(layer.children.length, 0);
});

test('puff/muzzle animation and sprite frames avoid per-frame Graphics clear calls', () => {
  const pool = new ArcadeEffectPool(new Container());
  for (const kind of ['ring', 'smoke', 'muzzle', 'sprite-debris']) pool.spawn(kind, 0, 0, 12, '#ff8833', 300);
  pool.setExplosionTextures([Texture.WHITE]);
  pool.spawn('sprite-explosion', 0, 0, 12, '#ffffff', 300);
  const originalClear = Graphics.prototype.clear;
  let clears = 0;
  Graphics.prototype.clear = function () { clears++; return originalClear.call(this); };
  try {
    for (let i = 0; i < 12; i++) pool.update(16);
    assert.equal(clears, 0);
  } finally {
    Graphics.prototype.clear = originalClear;
    pool.destroy();
  }
});

test('geometry cache evicts only unused contexts and releases each resource once', () => {
  const destroyed = [];
  const cache = new EffectGeometryCache(2);
  const create = id => () => ({ id, destroy() { destroyed.push(id); } });
  const pinned = cache.acquire('pinned', create('pinned'));
  cache.acquire('old', create('old')); cache.release('old');
  cache.acquire('new', create('new')); cache.release('new');
  assert.deepEqual(destroyed, ['old']);
  assert.equal(cache.acquire('pinned', create('wrong')), pinned);
  cache.release('pinned'); cache.release('pinned');
  for (let i = 0; i < 1000; i++) {
    cache.acquire(`item-${i}`, create(`item-${i}`)); cache.release(`item-${i}`);
    assert.ok(cache.getStats().retained <= 2);
  }
  cache.destroy();
  assert.equal(new Set(destroyed).size, destroyed.length);
  assert.ok(destroyed.includes('pinned'));
  assert.equal(cache.getStats().retained, 0);
});

test('geometry subframes preserve endpoints and bound largest shockwave radius error below one pixel', () => {
  assert.equal(effectGeometryFrame(-1), 0);
  assert.equal(effectGeometryFrame(2), EFFECT_GEOMETRY_FRAME_COUNT);
  assert.equal(effectGeometryFrame(NaN), 0);
  for (let i = 0; i <= 1000; i++) {
    const time = i / 1000;
    const sampled = effectGeometryFrame(time) / EFFECT_GEOMETRY_FRAME_COUNT;
    assert.ok(Math.abs(170 * 0.84 * (sampled - time)) < 0.75);
  }
});

test('recycling, downshifting and destruction detach cached contexts safely', () => {
  const pool = new ArcadeEffectPool(new Container());
  pool.setQuality(false, false);
  for (let i = 0; i < 170; i++) pool.spawn('ring', i, 0, 10 + i, '#67e8f9', 300);
  pool.setQuality(true, true, 0.4);
  assert.equal(pool.getStats().active, pool.getStats().cap);
  for (let i = 0; i < 1000; i++) {
    pool.spawn(i % 2 ? 'shockwave' : 'spark', 0, 0, 10 + i, '#67e8f9', 300);
    pool.update(1);
  }
  assert.ok(pool.getStats().geometry.retained <= pool.getStats().geometry.capacity);
  pool.destroy();
  assert.equal(pool.getStats().geometry.retained, 0);
});
