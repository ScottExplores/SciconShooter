import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
globalThis.document = { createElement: () => ({ getContext: () => ({ isContextLost: () => false, getShaderPrecisionFormat: () => ({ precision: 23 }) }) }) };
const directory = await mkdtemp(join(tmpdir(), 'scicon-R-shockwave-'));
after(() => rm(directory, { recursive: true, force: true }));
const bundle = await build({
  stdin: { contents: `export * from './services/revamp/theme/BackgroundShockwave'; export { FeelRuntime } from './services/revamp/feel/FeelRuntime'; export { Container, AlphaFilter, Rectangle } from 'pixi.js';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
await writeFile(join(directory, 'bundle.mjs'), bundle.outputFiles[0].text);
const { BackgroundShockwave, bakeShockwaveMap, SHOCKWAVE_FRAMES, FeelRuntime, Container, AlphaFilter, Rectangle } = await import(pathToFileURL(join(directory, 'bundle.mjs')));
function fixture() {
  const target = new Container(), feel = new FeelRuntime();
  const runtime = { waveId: 'a', wavePresentationRevision: 1 };
  const engine = { feel, width: 390, height: 844, getRuntimeState: () => runtime };
  const effect = new BackgroundShockwave(target);
  const update = (tier = 'high', reduced = false) => effect.update(engine, { tier }, reduced);
  update();
  return { target, feel, runtime, engine, effect, update, destroy() { effect.destroy(); target.destroy({ children: true }); } };
}

test('displacement pixels have neutral borders and a bounded radial ring', () => {
  const pixels = bakeShockwaveMap();
  for (let i = 0; i < 64; i++) for (const index of [i * 4, (63 * 64 + i) * 4, i * 64 * 4, (i * 64 + 63) * 4]) {
    assert.equal(pixels[index], 128); assert.equal(pixels[index + 1], 128);
  }
  assert.ok(pixels.some((value, index) => index % 4 < 2 && Math.abs(value - 128) > 50));
  assert.ok(pixels.every((value, index) => index % 4 !== 3 || value === 255));
});

test('big receipts attach one bounded background filter, freeze at pause, expire and reuse the same texture', () => {
  const f = fixture();
  try {
    f.feel.recordKill({ frame: 0, x: 100, y: 120, tier: 'small', score: 1 }); f.update();
    assert.equal(f.effect.snapshot().allocated, false);
    f.feel.recordPartBreak({ frame: 0, x: 100, y: 120 }); f.update();
    assert.equal(f.target.filters.length, 1); assert.equal(f.target.children.length, 1);
    const map = f.target.children[0], filter = f.target.filters[0];
    for (let i = 0; i < 10; i++) { f.feel.advanceFrame(); f.update(); }
    const state = [map.width, map.x, filter.scale.x];
    for (let i = 0; i < 10; i++) f.update();
    assert.deepEqual([map.width, map.x, filter.scale.x], state, 'no wall-clock motion while paused');
    for (let i = 0; i < SHOCKWAVE_FRAMES; i++) { f.feel.advanceFrame(); f.update(); }
    assert.equal(f.effect.snapshot().active, false); assert.equal(f.target.filters?.length ?? 0, 0);
    f.runtime.wavePresentationRevision++; f.update();
    assert.equal(f.target.children[0], map); assert.equal(f.target.filters[0], filter);
    assert.equal(f.effect.snapshot().sourceBytes, 16384);
  } finally { f.destroy(); }
});

test('Low/reduced motion consumes receipts without allocating or replaying, and restores other filter ownership', () => {
  const f = fixture();
  try {
    f.feel.recordPartBreak({ frame: 0, x: 100, y: 120 }); f.update('low'); f.update();
    assert.equal(f.effect.snapshot().allocated, false);
    f.feel.recordPartBreak({ frame: 0, x: 100, y: 120 }); f.update('high', true); f.update();
    assert.equal(f.effect.snapshot().allocated, false);
    const other = new AlphaFilter(), area = new Rectangle(1, 2, 30, 40);
    f.target.filters = [other]; f.target.filterArea = area;
    f.feel.recordPartBreak({ frame: 0, x: 100, y: 120 }); f.update();
    assert.equal(f.target.filters.length, 2);
    f.update('medium');
    assert.deepEqual([...f.target.filters], [other]); assert.equal(f.target.filterArea, area);
    const map = f.target.children[0], texture = map.texture;
    f.effect.destroy(); f.effect.destroy();
    assert.ok(texture.destroyed); assert.equal(f.target.children.length, 0);
    other.alpha = .7; assert.equal(other.alpha, .7); other.destroy();
  } finally { f.destroy(); }
});
