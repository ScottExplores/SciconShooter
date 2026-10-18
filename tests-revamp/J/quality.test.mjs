import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const load = async (name) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../../services/revamp/performance/${name}.ts`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [{ AdaptiveRenderQuality }, { RenderQualitySettingsStore, RENDER_QUALITY_SETTINGS_KEY }] = await Promise.all([
  load('AdaptiveRenderQuality'), load('RenderQualitySettings')
]);

const frames = (governor, count, delta, ...options) => {
  for (let i = 0; i < count; i++) governor.observe(delta, ...options);
  return governor.budget;
};

test('Auto reduces decorative detail after sustained sub-50 FPS windows, without removing any category', () => {
  const governor = new AdaptiveRenderQuality();
  assert.equal(frames(governor, 79, 25).tier, 'high');
  const medium = frames(governor, 1, 25);
  assert.equal(medium.tier, 'medium');
  const low = frames(governor, 80, 25);
  assert.equal(low.tier, 'low');
  assert.equal(frames(governor, 500, 25), low, 'budget identity is stable between changes');
  for (const field of ['particleScale', 'trailScale', 'backgroundLayerScale']) {
    assert.ok(medium[field] < 1 && low[field] < medium[field] && low[field] > 0);
  }
  assert.deepEqual(Object.keys(low).sort(), ['backgroundLayerScale', 'particleScale', 'tier', 'trailScale']);
  assert.ok(Object.isFrozen(low));
});

test('average windows recognize sustained alternating long and short frames', () => {
  const governor = new AdaptiveRenderQuality();
  for (let i = 0; i < 50; i++) {
    governor.observe(30);
    governor.observe(16);
  }
  assert.equal(governor.budget.tier, 'medium', '43 FPS is load even if every second frame is fast');
});

test('severe sustained visible jank still steps Auto down to Low', () => {
  const governor = new AdaptiveRenderQuality();
  assert.equal(frames(governor, 7, 300).tier, 'high');
  assert.equal(frames(governor, 1, 300).tier, 'medium');
  assert.equal(frames(governor, 8, 300).tier, 'low');
  frames(governor, 20, 300, 'auto', false, false);
  assert.equal(governor.budget.tier, 'low', 'inactive frames preserve the learned tier');
});

test('isolated frame hitches and a 50–57 FPS neutral band do not reduce or oscillate detail', () => {
  const governor = new AdaptiveRenderQuality();
  for (let i = 0; i < 12; i++) {
    frames(governor, 59, 16);
    governor.observe(80);
  }
  assert.equal(governor.budget.tier, 'high');
  frames(governor, 200, 25);
  assert.equal(governor.budget.tier, 'low');
  governor.resetMeasurement();
  assert.equal(frames(governor, 1000, 19).tier, 'low');
});

test('recovery requires eight fast seconds per tier and cannot jump directly to High', () => {
  const governor = new AdaptiveRenderQuality();
  frames(governor, 160, 25);
  assert.equal(frames(governor, 503, 16).tier, 'low');
  assert.equal(frames(governor, 1, 16).tier, 'medium');
  assert.equal(frames(governor, 503, 16).tier, 'medium');
  assert.equal(frames(governor, 1, 16).tier, 'high');
});

test('hidden, paused, invalid and resumed frames do not count as sustained pressure', () => {
  for (const interruption of [NaN, Infinity, 0, -10, 1000, 10000]) {
    const governor = new AdaptiveRenderQuality();
    frames(governor, 79, 25);
    governor.observe(interruption);
    assert.equal(frames(governor, 40, 25).tier, 'high', String(interruption));
  }
  const governor = new AdaptiveRenderQuality();
  frames(governor, 79, 25);
  frames(governor, 100, 25, 'auto', false, false);
  assert.equal(frames(governor, 40, 25).tier, 'high');
  frames(governor, 40, 25);
  assert.equal(governor.budget.tier, 'medium');
  governor.observe(10000);
  assert.equal(governor.budget.tier, 'medium', 'resume retains learned detail');
});

test('forced High and Low stay selected; returning to Auto keeps its last measured tier', () => {
  const governor = new AdaptiveRenderQuality();
  frames(governor, 80, 25);
  assert.equal(governor.budget.tier, 'medium');
  assert.equal(frames(governor, 1000, 30, 'high').tier, 'high');
  assert.equal(frames(governor, 1000, 16, 'low').tier, 'low');
  assert.equal(governor.observe(16, 'auto').tier, 'medium');
  assert.equal(frames(governor, 40, 25).tier, 'medium', 'override samples cannot accumulate auto pressure');
});

test('system reduced motion remains authoritative even with forced High', () => {
  const governor = new AdaptiveRenderQuality();
  const high = governor.observe(16, 'high');
  const reducedHigh = governor.observe(16, 'high', true);
  assert.ok(reducedHigh.particleScale < high.particleScale);
  assert.ok(reducedHigh.trailScale < high.trailScale);
  assert.equal(governor.observe(16, 'high', true), reducedHigh);
  assert.ok(Object.isFrozen(reducedHigh));
  assert.equal(governor.observe(16, 'high', false), high);
  const reducedLow = governor.observe(16, 'low', true);
  assert.ok(reducedLow.particleScale <= reducedHigh.particleScale);
  assert.ok(reducedLow.trailScale <= reducedHigh.trailScale);
});

test('quality mode persists independently, notifies only on actual changes, and reloads storage clears', () => {
  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const store = new RenderQualitySettingsStore(storage);
  assert.equal(store.getSnapshot(), 'auto');
  let notices = 0;
  const unsubscribe = store.subscribe(() => notices++);
  store.set('high');
  store.set('high');
  assert.equal(notices, 1);
  assert.deepEqual(JSON.parse(saved.get(RENDER_QUALITY_SETTINGS_KEY)), { version: 1, mode: 'high' });
  assert.equal(new RenderQualitySettingsStore(storage).getSnapshot(), 'high');
  store.set('low');
  assert.equal(store.getSnapshot(), 'low');
  saved.clear();
  store.reload();
  assert.equal(store.getSnapshot(), 'auto');
  assert.equal(notices, 3);
  unsubscribe();
  store.set('high');
  assert.equal(notices, 3);
});

test('invalid preferences cannot change mode, and blocked storage stays functional', () => {
  for (const value of [null, 0, {}, { version: 2, mode: 'low' }, { version: 1, mode: true }, { version: 1, mode: 'medium' }]) {
    const store = new RenderQualitySettingsStore({ getItem: () => JSON.stringify(value), setItem() {} });
    assert.equal(store.getSnapshot(), 'auto');
    store.set('surprise');
    assert.equal(store.getSnapshot(), 'auto');
  }
  const blocked = new RenderQualitySettingsStore({ getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } });
  assert.doesNotThrow(() => blocked.set('low'));
  assert.equal(blocked.getSnapshot(), 'low');
  const malformed = new RenderQualitySettingsStore({ getItem: () => '{broken', setItem() {} });
  malformed.set('high');
  malformed.reload();
  assert.equal(malformed.getSnapshot(), 'high');
});
