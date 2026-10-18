import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const loadTs = async (file) => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL(`../../services/revamp/feel/${file}.ts`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
  });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
};
const [{ FeelRuntime, FEEL_TUNING }, { AdaptiveFeelQuality }, { FeelSettingsStore, FEEL_SETTINGS_KEY }] = await Promise.all([
  loadTs('FeelRuntime'), loadTs('AdaptiveFeelQuality'), loadTs('FeelSettings')
]);
const position = { frame: 10, x: 100, y: 200 };
const kill = { ...position, tier: 'small', score: 25 };
const tick = (runtime, count) => { for (let i = 0; i < count; i++) runtime.advanceFrame(); };

test('presentation receipts are bounded, immutable and never replay after a new run', () => {
  const runtime = new FeelRuntime(3);
  runtime.recordKill(kill);
  const initial = runtime.events;
  assert.equal(runtime.events, initial);
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial[0]));
  for (let i = 0; i < 20; i++) runtime.recordBulletCancel({ ...position, x: i });
  assert.equal(runtime.events.length, 3);
  assert.deepEqual(runtime.events.map(event => event.x), [17, 18, 19]);
  assert.equal(initial.length, 1, 'earlier renderer snapshot remains stable');
  const cursor = runtime.latestSequence;
  const generation = runtime.resetGeneration;
  runtime.reset();
  assert.equal(runtime.resetGeneration, generation + 1);
  assert.equal(runtime.events.length, 0);
  runtime.recordKill(kill);
  assert.equal(runtime.events[0].sequence, cursor + 1);
  assert.equal(new FeelRuntime(Number.NaN).capacity, FEEL_TUNING.eventCapacity);
});

test('invalid input cannot inject NaN or mutate combo, trauma and event cursors', () => {
  const runtime = new FeelRuntime();
  runtime.recordKill({ ...kill, x: Number.NaN });
  runtime.recordPickup({ ...position, y: Infinity, pickupType: 'coin' });
  runtime.recordPhaseChange({ ...position, frame: -Infinity });
  runtime.addTrauma(Number.NaN);
  assert.equal(runtime.latestSequence, 0);
  assert.equal(runtime.comboMultiplier, 1);
  assert.equal(runtime.traumaLevel, 0);
  runtime.recordKill({ ...kill, score: -5 });
  assert.equal(runtime.events[0].score, 0);
});

test('kill chain reaches x10, expires in fixed steps and breaks on damage without multiplying score', () => {
  const runtime = new FeelRuntime();
  for (let i = 0; i < 16; i++) runtime.recordKill(kill);
  assert.equal(runtime.comboMultiplier, 10);
  assert.equal(runtime.comboRemaining, 1);
  assert.ok(runtime.events.every(event => event.score === 25));
  tick(runtime, 149);
  assert.equal(runtime.comboMultiplier, 10);
  tick(runtime, 1);
  assert.equal(runtime.comboMultiplier, 1);
  assert.equal(runtime.comboRemaining, 0);
  runtime.recordKill(kill);
  runtime.recordKill(kill);
  runtime.recordDamage(0);
  assert.equal(runtime.comboMultiplier, 2);
  runtime.recordDamage(1);
  assert.equal(runtime.comboMultiplier, 1);
  assert.equal(runtime.comboRemaining, 0);
});

test('elite and boss part requests fit 40–80ms and boss slow motion lasts exactly 0.4s at 60Hz', () => {
  const runtime = new FeelRuntime();
  assert.equal(runtime.recordKill(kill), 0);
  for (const frames of [runtime.recordKill({ ...kill, tier: 'elite' }), runtime.recordPartBreak(position)]) {
    assert.ok(frames * 1000 / 60 >= 40 && frames * 1000 / 60 <= 80);
  }
  assert.equal(runtime.recordKill({ ...kill, tier: 'boss' }), 0);
  const skips = [];
  for (let frame = 0; frame < 24; frame++) {
    runtime.advanceFrame();
    skips.push(runtime.shouldSkipSlowMotionStep());
  }
  assert.equal(skips.filter(Boolean).length, 12);
  assert.ok(skips.every((value, index) => value === (index % 2 === 0)));
  assert.equal(runtime.slowMotionRemaining, 0);
  assert.equal(runtime.shouldSkipSlowMotionStep(), false);
});

test('trauma is squared, capped and deterministic; accessibility never changes simulation timing', () => {
  const runtime = new FeelRuntime();
  runtime.addTrauma(0.5);
  assert.equal(runtime.getShake(30).strength, 1.25);
  assert.deepEqual(runtime.getShake(30), runtime.getShake(30));
  runtime.addTrauma(50);
  assert.equal(runtime.traumaLevel, 1);
  for (let frame = 0; frame < 200; frame++) {
    const shake = runtime.getShake(frame);
    assert.ok(Math.abs(shake.x) <= 5 && Math.abs(shake.y) <= 5);
    const reduced = runtime.getShake(frame, true, true);
    assert.ok(Math.abs(reduced.x) <= 0.75 && Math.abs(reduced.y) <= 0.75);
    assert.equal(runtime.getShake(frame, false).strength, 0);
    assert.equal(runtime.getShake(frame, true, false, true).strength, 0);
  }
  runtime.recordKill({ ...kill, tier: 'boss' });
  runtime.getShake(30, true, true, true);
  assert.equal(runtime.slowMotionRemaining, 24);
  tick(runtime, 56);
  assert.equal(runtime.getShake().strength, 0);
});

test('pickup pitch ladder is bounded and resets after its fixed combo window', () => {
  const runtime = new FeelRuntime();
  assert.equal(runtime.recordPickup({ ...position, pickupType: 'coin' }), 0);
  assert.equal(runtime.recordPickup({ ...position, pickupType: 'coin' }), 1);
  for (let i = 0; i < 30; i++) runtime.recordPickup({ ...position, pickupType: 'coin' });
  assert.equal(runtime.pickupLadder, 7);
  tick(runtime, 60);
  assert.equal(runtime.recordPickup({ ...position, pickupType: 'power', powerLevel: 4 }), 0);
  assert.equal(runtime.events.at(-1).powerLevel, 4);
});

test('perfect wave requires no damage; a new wave preserves victory receipts and slow motion', () => {
  const runtime = new FeelRuntime();
  runtime.recordDamage(1);
  assert.equal(runtime.recordWaveClear(position), false);
  runtime.beginWave();
  assert.equal(runtime.recordWaveClear({ ...position, damageTaken: 2 }), false);
  assert.equal(runtime.recordWaveClear({ ...position, damageTaken: 0 }), true);
  runtime.recordKill({ ...kill, tier: 'boss' });
  runtime.beginWave();
  assert.equal(runtime.events[0].type, 'perfect-wave');
  assert.equal(runtime.slowMotionRemaining, 24);
  runtime.reset();
  assert.equal(runtime.comboRemaining, 0);
  assert.equal(runtime.slowMotionRemaining, 0);
  assert.equal(runtime.traumaLevel, 0);
});

test('quality drops only after two sustained slow seconds and recovers with hysteresis', () => {
  const quality = new AdaptiveFeelQuality();
  for (let i = 0; i < 90; i++) quality.observe(22);
  assert.equal(quality.tier, 'high');
  quality.observe(22);
  assert.equal(quality.tier, 'medium');
  assert.equal(quality.particleCap, 104);
  for (let i = 0; i < 91; i++) quality.observe(22);
  assert.equal(quality.tier, 'low');
  assert.equal(quality.particleCap, 64);
  for (let i = 0; i < 374; i++) quality.observe(16);
  assert.equal(quality.tier, 'low');
  quality.observe(16);
  assert.equal(quality.tier, 'medium');
  for (let i = 0; i < 375; i++) quality.observe(16);
  assert.equal(quality.tier, 'high');
});

test('quality ignores background gaps and isolated stutters', () => {
  const quality = new AdaptiveFeelQuality();
  for (let i = 0; i < 500; i++) {
    quality.observe(30);
    quality.observe(16);
  }
  assert.equal(quality.scale, 1);
  for (let i = 0; i < 90; i++) quality.observe(22);
  quality.observe(10000);
  quality.observe(Number.NaN);
  quality.observe(22);
  assert.equal(quality.tier, 'high');
});

test('settings persist toggles, keep stable snapshots and follow system motion separately', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = new FeelSettingsStore(storage);
  const initial = store.getSnapshot();
  assert.equal(store.getSnapshot(), initial);
  let updates = 0;
  const unsubscribe = store.subscribe(() => updates++);
  store.set('reduceScreenShake', true);
  store.set('reduceScreenShake', true);
  store.set('showScoreNumbers', false);
  assert.equal(updates, 2);
  assert.ok(Object.isFrozen(store.getSnapshot()));
  const saved = JSON.parse(values.get(FEEL_SETTINGS_KEY));
  assert.equal(saved.version, 1);
  assert.equal(saved.reducedMotion, undefined);
  const restored = new FeelSettingsStore(storage, true);
  assert.deepEqual(restored.getSnapshot(), { reduceScreenShake: true, showScoreNumbers: false, reducedMotion: true });
  restored.setReducedMotion(false);
  assert.equal(restored.getSnapshot().reducedMotion, false);
  unsubscribe();
  store.set('showScoreNumbers', true);
  assert.equal(updates, 2);
});

test('malformed and denied storage stay usable without accepting arbitrary persisted types', () => {
  const invalid = new FeelSettingsStore({ getItem: () => '{broken', setItem() {} });
  assert.equal(invalid.getSnapshot().showScoreNumbers, true);
  const unsupported = new FeelSettingsStore({
    getItem: () => JSON.stringify({ reduceScreenShake: 'false', showScoreNumbers: 0, reducedMotion: false }), setItem() {}
  }, true);
  assert.deepEqual(unsupported.getSnapshot(), { reduceScreenShake: false, showScoreNumbers: true, reducedMotion: true });
  const denied = new FeelSettingsStore({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.doesNotThrow(() => denied.set('reduceScreenShake', true));
  assert.equal(denied.getSnapshot().reduceScreenShake, true);
});
