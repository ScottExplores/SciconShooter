import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['services/revamp/theme/spritePixels.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { bakeIdleFrames, bakeMetalShimmer, bakeInnerOutline, bakePixelGlow, idleFrame, shimmerFrame } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const palette = [0x362747, 0x945bb5, 0xe9b8ff];
const raster = { width: 4, height: 2, pixels: Uint8Array.from([
  0,0,0,0, 12,16,20,255, 150,150,150,255, 255,255,255,255,
  190,35,48,255, 38,180,208,255, 65,120,155,96, 245,170,130,255,
]) };

test('four idle frames recolor red hull armor while preserving outline, metal, warning light and alpha', () => {
  const before = new Uint8Array(raster.pixels), frames = bakeIdleFrames(raster, 'enemy', palette);
  assert.equal(frames.length, 4); assert.deepEqual(raster.pixels, before);
  for (const frame of frames) {
    assert.deepEqual(frame.pixels.slice(0, 16), before.slice(0, 16));
    assert.deepEqual(frame.pixels.slice(28, 32), before.slice(28, 32));
    assert.notDeepEqual(frame.pixels.slice(16, 19), before.slice(16, 19));
    for (let p = 3; p < before.length; p += 4) assert.equal(frame.pixels[p], before[p]);
  }
  assert.equal(new Set(frames.map(frame => frame.pixels.slice(20, 23).join(','))).size, 4);
});

test('player and wing identity colors survive sector changes; pickup facets animate', () => {
  for (const role of ['player', 'wing']) {
    const a = bakeIdleFrames(raster, role, palette), b = bakeIdleFrames(raster, role, [0x448833, 0x77aa88, 0xeeffaa]);
    assert.deepEqual(a, b); assert.deepEqual(a[0].pixels.slice(16, 20), raster.pixels.slice(16, 20));
  }
  const coin = { width: 1, height: 1, pixels: Uint8Array.from([235,180,60,255]) };
  assert.equal(new Set(bakeIdleFrames(coin, 'pickup', palette).map(frame => frame.pixels.join(','))).size, 4);
});

test('opposing sector hues keep red armor vivid and preserve its ordered bright-to-dark shading', () => {
  const armor = { width: 3, height: 1, pixels: Uint8Array.from([100,20,25,255, 160,30,35,255, 220,40,45,255]) };
  const cool = bakeIdleFrames(armor, 'enemy', [0x254f56, 0x439dae, 0x8fdae8])[0];
  const warm = bakeIdleFrames(armor, 'enemy', [0x563925, 0xae7443, 0xe8c18f])[0];
  for (let i = 0; i < 3; i++) {
    const p = i * 4, value = armor.pixels[p];
    assert.equal(Math.max(...cool.pixels.slice(p, p + 3)), value);
    assert.equal(Math.max(...warm.pixels.slice(p, p + 3)), value);
    assert.ok(cool.pixels[p + 2] > cool.pixels[p] * 1.4, 'cool sector armor remains visibly blue/cyan');
    assert.ok(warm.pixels[p] > warm.pixels[p + 2] * 1.4, 'warm sector armor remains visibly orange');
  }
});

test('shimmer and inner outline cannot paint outside the authored alpha silhouette', () => {
  for (const mask of [...bakeMetalShimmer(raster), bakeInnerOutline(raster)]) {
    for (let p = 3; p < raster.pixels.length; p += 4) assert.ok(mask.pixels[p] <= raster.pixels[p]);
  }
  const glow = bakePixelGlow();
  assert.equal(glow.width, 24); assert.equal(glow.pixels[3], 0);
  assert.ok(glow.pixels[(11 * 24 + 11) * 4 + 3] > 100);
});

test('idle clocks freeze for reduced motion and shimmer stays infrequent and High-only', () => {
  assert.equal(idleFrame(0, 0, false), 0); assert.equal(idleFrame(7, 0, false), 1);
  assert.equal(idleFrame(7, 0, false, true), 0);
  assert.equal(idleFrame(10000, 99, true), 1);
  assert.equal(shimmerFrame(12, 0, false, true), 2);
  assert.equal(shimmerFrame(24, 0, false, true), -1);
  assert.equal(shimmerFrame(12, 0, true, true), -1);
  assert.equal(shimmerFrame(12, 0, false, false), -1);
  assert.equal(shimmerFrame(330, 0, false, true), 0);
});
