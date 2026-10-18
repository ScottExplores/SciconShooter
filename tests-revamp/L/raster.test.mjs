import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../../services/revamp/performance/AdaptiveRasterResolution.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
});
const { AdaptiveRasterResolution, applyRasterResolution } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const frames = (governor, count, delta, mode = 'auto', tier = 'low', active = true) => {
  for (let index = 0; index < count; index++) governor.observe(delta, mode, tier, active);
  return governor.desiredResolution;
};

test('Auto waits two additional averaged slow seconds after optional detail reaches Low', () => {
  const governor = new AdaptiveRasterResolution(2);
  assert.equal(frames(governor, 200, 40, 'auto', 'high'), 2);
  assert.equal(frames(governor, 200, 40, 'auto', 'medium'), 2);
  assert.equal(frames(governor, 49, 40), 2, '1960ms of Low pressure is insufficient');
  assert.equal(frames(governor, 1, 40), 1, '2000ms of Low pressure selects native output');
  assert.equal(frames(governor, 200, 40), 1);
});

test('averaged windows detect alternating pressure without reacting to isolated hitches', () => {
  const governor = new AdaptiveRasterResolution(2);
  for (let second = 0; second < 12; second++) {
    frames(governor, 59, 16);
    governor.observe(80, 'auto', 'low');
  }
  assert.equal(governor.desiredResolution, 2);
  governor.resetMeasurement();
  for (let pair = 0; pair < 40; pair++) {
    governor.observe(40, 'auto', 'low');
    governor.observe(16, 'auto', 'low');
  }
  assert.equal(governor.desiredResolution, 1, 'averaged 35.7FPS remains sustained pressure');
});

test('unplayable sub-20FPS Low output takes one extra full window, with unchanged recovery', () => {
  const governor = new AdaptiveRasterResolution(2);
  assert.equal(frames(governor, 30, 100, 'auto', 'medium'), 2, 'decorative cuts still come first');
  assert.equal(frames(governor, 9, 100), 2);
  assert.equal(frames(governor, 1, 100), 1);
  assert.equal(frames(governor, 503, 16, 'auto', 'high'), 1);
  assert.equal(frames(governor, 1, 16, 'auto', 'high'), 2);
});

test('40FPS and neutral windows cannot trigger native output or accumulate stale pressure', () => {
  const governor = new AdaptiveRasterResolution(2);
  assert.equal(frames(governor, 1000, 25), 2, 'exactly 40FPS is outside the downgrade band');
  frames(governor, 25, 40);
  frames(governor, 50, 20);
  assert.equal(frames(governor, 25, 40), 2, 'the neutral window reset the first slow second');
  assert.equal(frames(governor, 25, 40), 1);
});

test('recovery requires High optional detail and eight additional seconds at at least 57FPS', () => {
  const governor = new AdaptiveRasterResolution(2);
  frames(governor, 50, 40);
  assert.equal(frames(governor, 1000, 16, 'auto', 'low'), 1);
  assert.equal(frames(governor, 1000, 16, 'auto', 'medium'), 1);
  assert.equal(frames(governor, 503, 16, 'auto', 'high'), 1);
  assert.equal(frames(governor, 1, 16, 'auto', 'high'), 2);
  assert.equal(frames(governor, 100, 40, 'auto', 'medium'), 2, 'only Low can train another downgrade');
});

test('exact 57FPS recovers while slower High windows reset recovery evidence', () => {
  const governor = new AdaptiveRasterResolution(2);
  frames(governor, 50, 40);
  frames(governor, 441, 16, 'auto', 'high');
  frames(governor, 50, 20, 'auto', 'high');
  assert.equal(frames(governor, 63, 16, 'auto', 'high'), 1);
  governor.resetMeasurement();
  assert.equal(frames(governor, 455, 1000 / 57, 'auto', 'high'), 1);
  // Floating-point accumulation may finish a 1s window on its next frame.
  assert.equal(frames(governor, 9, 1000 / 57, 'auto', 'high'), 2);
});

test('invalid gaps, pause and hidden samples discard windows but retain learned fallback', () => {
  for (const interruption of [NaN, Infinity, 0, -1, 1000, 10000]) {
    const governor = new AdaptiveRasterResolution(2);
    frames(governor, 49, 40);
    governor.observe(interruption, 'auto', 'low');
    assert.equal(frames(governor, 25, 40), 2, String(interruption));
    assert.equal(frames(governor, 25, 40), 1);
    governor.observe(interruption, 'auto', 'high');
    assert.equal(governor.desiredResolution, 1, 'invalid timing does not discard learned output');
  }
  const governor = new AdaptiveRasterResolution(2);
  frames(governor, 49, 40);
  frames(governor, 100, 40, 'auto', 'low', false);
  assert.equal(frames(governor, 25, 40), 2);
  frames(governor, 25, 40);
  frames(governor, 503, 16, 'auto', 'high');
  governor.observe(16, 'auto', 'high', false);
  assert.equal(frames(governor, 63, 16, 'auto', 'high'), 1);
});

test('forced High restores immediately; forced Low and High never train automatic history', () => {
  const governor = new AdaptiveRasterResolution(2);
  assert.equal(frames(governor, 1000, 40, 'high', 'high'), 2);
  assert.equal(governor.observe(16, 'low', 'low'), 1);
  assert.equal(governor.observe(16, 'auto', 'low'), 2, 'explicit Low did not train Auto');
  frames(governor, 50, 40);
  assert.equal(governor.observe(16, 'high', 'high', false), 2, 'High restores even during pause');
  assert.equal(frames(governor, 1000, 16, 'high', 'high'), 2);
  assert.equal(governor.observe(16, 'auto', 'high'), 1, 'Auto retains its learned fallback across a forced mode');
});

test('mode and tier changes reset measurement before another decision', () => {
  const governor = new AdaptiveRasterResolution(2);
  frames(governor, 49, 40);
  governor.observe(40, 'auto', 'medium');
  assert.equal(frames(governor, 25, 40), 2);
  governor.observe(40, 'high', 'high');
  assert.equal(frames(governor, 25, 40), 2);
  assert.equal(frames(governor, 25, 40), 1);
});

test('resolution remains bounded by native 1 and the existing DPR cap', () => {
  for (const [dpr, expected] of [[0, 1], [-2, 1], [NaN, 1], [Infinity, 1], [1, 1], [1.5, 1.5], [2, 2], [4, 2]]) {
    const governor = new AdaptiveRasterResolution(dpr);
    assert.equal(governor.fullResolution, expected);
    assert.equal(governor.desiredResolution, expected);
    assert.equal(governor.observe(16, 'low', 'low'), 1);
    assert.equal(governor.observe(16, 'high', 'high'), expected);
  }
  const governor = new AdaptiveRasterResolution(2);
  frames(governor, 50, 40);
  governor.setDevicePixelRatio(1.5);
  assert.equal(governor.desiredResolution, 1);
  assert.equal(governor.observe(16, 'high', 'high'), 1.5);
});

function rendererFixture(resolution = 2, imageRendering = 'auto') {
  return {
    resolution, screen: { width: 390, height: 844 },
    canvas: { style: { width: '361.25px', height: '781.5px', imageRendering } }, calls: [],
    resize(width, height, nextResolution) {
      this.calls.push([width, height, nextResolution]);
      this.resolution = nextResolution;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  };
}

test('resize changes only output pixels and preserves letterbox CSS and original sampling', () => {
  const renderer = rendererFixture(2, 'crisp-edges');
  assert.equal(applyRasterResolution(renderer, 1, 2), true);
  assert.deepEqual(renderer.calls, [[390, 844, 1]]);
  assert.deepEqual(renderer.screen, { width: 390, height: 844 });
  assert.deepEqual(renderer.canvas.style, { width: '361.25px', height: '781.5px', imageRendering: 'pixelated' });
  for (let frame = 0; frame < 100; frame++) assert.equal(applyRasterResolution(renderer, 1, 2), false);
  assert.equal(renderer.calls.length, 1, 'no per-frame resize or allocation');
  assert.equal(applyRasterResolution(renderer, 2, 2), true);
  assert.deepEqual(renderer.calls, [[390, 844, 1], [390, 844, 2]]);
  assert.equal(renderer.canvas.style.imageRendering, 'crisp-edges');
  assert.equal(renderer.canvas.style.width, '361.25px');
  assert.equal(renderer.canvas.style.height, '781.5px');
});

test('native-DPR screens retain full-resolution CSS and resize inputs stay bounded', () => {
  const renderer = rendererFixture(1);
  assert.equal(applyRasterResolution(renderer, 1, 1), false);
  assert.equal(renderer.canvas.style.imageRendering, 'auto');
  applyRasterResolution(renderer, 4, 1.5);
  assert.equal(renderer.resolution, 1.5);
  applyRasterResolution(renderer, 0, 2);
  assert.equal(renderer.resolution, 1);
  assert.equal(renderer.canvas.style.imageRendering, 'pixelated');
  applyRasterResolution(renderer, NaN, 1);
  assert.equal(renderer.canvas.style.imageRendering, 'auto');
});

test('CSS letterboxing is restored even if renderer resize throws', () => {
  const renderer = rendererFixture();
  renderer.resize = function () {
    this.canvas.style.width = '390px';
    this.canvas.style.height = '844px';
    throw new Error('context unavailable');
  };
  assert.throws(() => applyRasterResolution(renderer, 1, 2), /context unavailable/);
  assert.equal(renderer.canvas.style.width, '361.25px');
  assert.equal(renderer.canvas.style.height, '781.5px');
  assert.equal(renderer.canvas.style.imageRendering, 'auto');
});
