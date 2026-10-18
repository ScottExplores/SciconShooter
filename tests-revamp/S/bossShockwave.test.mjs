import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
// Shader precision discovery only; lifecycle uses the real Pixi Filter/Container.
globalThis.document = { createElement: () => ({ getContext: () => ({
  isContextLost: () => false, getShaderPrecisionFormat: () => ({ precision: 23 })
}) }) };
const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/vfx/BossShockwave';
      export { Container, Filter, Rectangle } from 'pixi.js';`,
    loader: 'ts', resolveDir: process.cwd()
  }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
});
const { BossShockwave, BOSS_SHOCKWAVE_DURATION_MS, Container, Filter, Rectangle } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function fixture() {
  const listeners = new Set();
  let requests = 0;
  const renderer = { runners: { contextChange: {
    add(value) { listeners.add(value); }, remove(value) { listeners.delete(value); }
  } } };
  const background = new Container();
  const wave = new BossShockwave(background, () => { requests++; return renderer; });
  return { background, wave, listeners, requests: () => requests,
    restore() { for (const listener of [...listeners]) listener.contextChange(); }
  };
}

test('disabled and expired shockwaves allocate no shader or renderer work', () => {
  const f = fixture();
  for (const age of [-1, 0, 120, 359, 360, 900]) f.wave.update(195, 240, age, 390, 844, false);
  for (const age of [-1, 360, NaN, Infinity]) f.wave.update(195, 240, age, 390, 844, true);
  assert.equal(f.requests(), 0);
  assert.equal(f.background.filters?.length ?? 0, 0);
  assert.equal(f.listeners.size, 0);
  f.wave.destroy(); f.background.destroy();
});

test('one retained filter is attached only during the bounded pulse', () => {
  const f = fixture();
  f.wave.update(195, 240, 0, 390, 844, true);
  const filter = f.background.filters[0];
  assert.equal(f.requests(), 1);
  assert.equal(filter.resolution, 1);
  assert.equal(filter.padding, 0);
  assert.equal(filter.antialias, 'off');
  assert.equal(filter.blendRequired, false);
  for (let age = 15; age < BOSS_SHOCKWAVE_DURATION_MS; age += 15) {
    f.wave.update(195, 240, age, 390, 844, true);
    assert.equal(f.background.filters.length, 1);
    assert.equal(f.background.filters[0], filter);
    assert.ok(filter.resources.shockwaveUniforms.uniforms.uStrength <= 3);
  }
  f.wave.update(195, 240, BOSS_SHOCKWAVE_DURATION_MS, 390, 844, true);
  assert.equal(f.background.filters?.length ?? 0, 0);
  assert.equal(f.requests(), 1);
  f.wave.destroy(); f.background.destroy();
});

test('quality/motion change immediately removes the pass and restores unrelated filters and bounds', () => {
  const f = fixture();
  const existing = new Filter();
  const originalArea = new Rectangle(4, 8, 380, 820);
  f.background.filters = [existing]; f.background.filterArea = originalArea;
  f.wave.update(195, 240, 60, 390, 844, true);
  assert.equal(f.background.filters.length, 2);
  assert.deepEqual([f.background.filterArea.x, f.background.filterArea.y,
    f.background.filterArea.width, f.background.filterArea.height], [0, 0, 390, 844]);
  f.wave.update(195, 240, 90, 390, 844, false);
  assert.deepEqual(f.background.filters, [existing]);
  assert.equal(f.background.filterArea, originalArea);
  f.wave.destroy(); existing.destroy(); f.background.destroy();
});

test('context restoration detaches the pass without rendering; disposal unregisters once', () => {
  const f = fixture();
  f.wave.update(195, 240, 40, 390, 844, true);
  assert.equal(f.listeners.size, 1);
  f.restore();
  assert.equal(f.background.filters?.length ?? 0, 0);
  assert.equal(f.requests(), 1);
  f.wave.update(195, 240, 70, 390, 844, true);
  assert.equal(f.background.filters.length, 1);
  f.wave.destroy(); f.wave.destroy();
  assert.equal(f.listeners.size, 0);
  assert.equal(f.background.filters?.length ?? 0, 0);
  f.wave.update(195, 240, 0, 390, 844, true);
  assert.equal(f.background.filters?.length ?? 0, 0);
  f.background.destroy();
});

test('a concurrent background filter change is preserved when the pulse ends', () => {
  const f = fixture();
  const later = new Filter();
  const replacementArea = new Rectangle(0, 0, 100, 200);
  f.wave.update(195, 240, 40, 390, 844, true);
  f.background.filters = [...f.background.filters, later];
  f.background.filterArea = replacementArea;
  f.wave.disable();
  assert.deepEqual(f.background.filters, [later]);
  assert.equal(f.background.filterArea, replacementArea);
  f.wave.destroy(); later.destroy(); f.background.destroy();
});
