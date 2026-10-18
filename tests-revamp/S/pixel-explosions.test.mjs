import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
const output = await build({ stdin: { contents: `
  export * from './services/revamp/vfx/PixelExplosionAtlas';
  export * from './services/revamp/vfx/PixelExplosionRenderer';
  export { ArcadeEffectPool } from './services/pixi/ArcadeEffectPool';
  export { Container, Texture } from 'pixi.js';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
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
const { generatePixelExplosionAtlas, PIXEL_EXPLOSION_PALETTE, PIXEL_EXPLOSION_SPECS,
  pixelExplosionRecipes, pixelExplosionScale, PixelExplosionAtlas, ArcadeEffectPool, Container } =
  await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
const atlas = generatePixelExplosionAtlas();
const pixel = (frame, x, y) => atlas.pixels.subarray(((frame.y + y) * atlas.width + frame.x + x) * 4, ((frame.y + y) * atlas.width + frame.x + x) * 4 + 4);
const coverage = frame => {
  let count = 0;
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) if (pixel(frame, x, y)[3]) count++;
  return count;
};

test('all four deterministic explosion strips use a fixed palette and crisp alpha', () => {
  assert.deepEqual(generatePixelExplosionAtlas().pixels, atlas.pixels);
  assert.ok(atlas.width * atlas.height <= 1024 * 640, 'one bounded atlas, below 2.5 MiB RGBA');
  const palette = new Set(PIXEL_EXPLOSION_PALETTE);
  for (let i = 0; i < atlas.pixels.length; i += 4) {
    const [r, g, b, a] = atlas.pixels.subarray(i, i + 4);
    assert.ok(a === 0 || a === 255, 'no blurred/subpixel edge rasterization');
    if (a) assert.ok(palette.has((r << 16) | (g << 8) | b));
  }
  for (const [tier, spec] of Object.entries(PIXEL_EXPLOSION_SPECS)) {
    assert.equal(atlas.sequences[tier].length, spec.frames);
    assert.ok(spec.frames >= 8);
    const counts = atlas.sequences[tier].map(coverage);
    assert.ok(counts[2] > counts[0] * 4, `${tier}: clear expanding ignition`);
    assert.ok(counts.at(-1) < Math.max(...counts) * 0.3, `${tier}: dissolving embers`);
  }
});

test('fireball sheets have round separated lobes, transparent bounds and eroded final frames', () => {
  for (const tier of Object.keys(PIXEL_EXPLOSION_SPECS)) for (const frame of atlas.sequences[tier]) {
    assert.ok(coverage(frame) < frame.width * frame.height * 0.62, `${tier}: never an opaque rectangular fill`);
    for (let i = 0; i < frame.width; i++) {
      assert.equal(pixel(frame, i, 0)[3], 0);
      assert.equal(pixel(frame, i, frame.height - 1)[3], 0);
      assert.equal(pixel(frame, 0, i)[3], 0);
      assert.equal(pixel(frame, frame.width - 1, i)[3], 0);
    }
    for (const [x, y] of [[2, 2], [frame.width - 3, 2], [2, frame.height - 3], [frame.width - 3, frame.height - 3]]) assert.equal(pixel(frame, x, y)[3], 0);
  }
});

test('shock rings leave their centers transparent, and atlas frames never overlap gutters', () => {
  const occupied = new Set();
  for (const [key, frames] of Object.entries(atlas.sequences)) for (const frame of frames) {
    if (key.startsWith('ring-')) assert.equal(pixel(frame, Math.floor(frame.width / 2), Math.floor(frame.height / 2))[3], 0);
    assert.ok(frame.x > 0 && frame.y > 0 && frame.x + frame.width < atlas.width && frame.y + frame.height < atlas.height);
    for (let y = frame.y - 1; y <= frame.y + frame.height; y++) for (let x = frame.x - 1; x <= frame.x + frame.width; x++) {
      const key = y * atlas.width + x;
      assert.ok(!occupied.has(key), 'one transparent gutter surrounds every frame');
      occupied.add(key);
    }
  }
});

test('quality reduces optional particles while retaining every kill core and integer scale', () => {
  for (const tier of Object.keys(PIXEL_EXPLOSION_SPECS)) {
    const high = pixelExplosionRecipes(100, 90, 140, tier, 42, 1, false);
    const low = pixelExplosionRecipes(100, 90, 140, tier, 42, 0.3, false);
    const reduced = pixelExplosionRecipes(100, 90, 140, tier, 42, 1, true);
    assert.deepEqual(high, pixelExplosionRecipes(100, 90, 140, tier, 42, 1, false));
    assert.ok(low.length < high.length);
    assert.ok(reduced.length < high.length);
    assert.equal(reduced.filter(p => p.kind === 'ring').length, 0);
    for (const recipes of [high, low, reduced]) {
      assert.equal(recipes.filter(p => p.kind === 'fire').length, 1);
      assert.ok(recipes.some(p => p.kind === 'smoke'));
      assert.ok(recipes.some(p => p.kind === 'spark'));
      assert.ok(recipes.every(p => Number.isInteger(p.scale) && p.scale >= 1));
      const fire = recipes.find(p => p.kind === 'fire');
      assert.ok(recipes.find(p => p.kind === 'smoke').duration > fire.duration);
    }
  }
  assert.equal(pixelExplosionScale(NaN, 'small'), 1);
  assert.equal(pixelExplosionScale(10_000, 'mega'), 3);
});

test('all pixel particles obey the existing pool cap, recycle and release cleanly', () => {
  const layer = new Container();
  const pool = new ArcadeEffectPool(layer);
  pool.setQuality(false, true);
  for (let i = 0; i < 200; i++) pool.spawnPixelExplosion(100, 100, 190, 'mega', i);
  assert.equal(pool.getStats().allocated, 104);
  assert.equal(pool.getStats().active, 104);
  pool.setQuality(true, true, 0.4);
  assert.equal(pool.getStats().cap, 21);
  assert.ok(pool.getStats().active <= 21);
  pool.setReducedMotion(true);
  for (let i = 0; i < 300; i++) {
    pool.spawnPixelExplosion(100, 100, 40, 'small', i);
    pool.update(16);
    assert.ok(pool.getStats().active <= 21);
    assert.equal(pool.getStats().allocated, 104, 'no allocation growth after initial peak');
  }
  for (let i = 0; i < 20; i++) pool.update(100);
  assert.equal(pool.getStats().active, 0);
  pool.destroy();
  assert.equal(layer.children.length, 0);
});

test('DOM-free atlas has no solid-white fallback source', () => {
  const blank = new PixelExplosionAtlas();
  assert.deepEqual(blank.get('mega'), []);
  assert.equal(blank.getStats().sources, 0);
  blank.destroy();
});


test('cosmetic quality and seeded explosions never consume the combat random stream', () => {
  const pool = new ArcadeEffectPool(new Container());
  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return 0.5; };
  try {
    pool.spawnPixelExplosion(100, 100, 190, 'mega', 18);
    pool.setQuality(true, true, 0.4);
    pool.spawnPixelExplosion(100, 100, 190, 'mega', 18);
    pool.update(16);
    assert.equal(calls, 0);
  } finally { Math.random = originalRandom; pool.destroy(); }
});
