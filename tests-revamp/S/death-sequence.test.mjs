import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['services/revamp/vfx/BossDeathSequence.ts'], bundle: true, format: 'esm', platform: 'node', write: false });
const { playBossDeathSequence, consumeBossDeathSequences, hasBossDeathSequence, bossDeathTimeline, bossDeathPose, deathBurstDue, MAX_BOSS_DEATHS } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const engine = () => ({ frameCount: 120, feel: { resetGeneration: 0 } });
const hull = (id = 'boss') => ({ id, x: 55, y: 130, width: 280, height: 180, bossComponents: [
  { centerXRatio: 0.8, centerYRatio: 0.4 }, { centerXRatio: 0.2, centerYRatio: 0.7, destroyed: true }
] });

test('O hook, C adapter and common kill deduplicate the same entity without touching rewards or RNG', () => {
  const e = engine(), b = hull();
  const before = JSON.stringify([e, b]);
  const random = Math.random;
  try {
    Math.random = () => { throw Error('gameplay RNG consumed'); };
    assert.equal(playBossDeathSequence(e, b), true);
    assert.equal(playBossDeathSequence(e, b), false);
    const requests = consumeBossDeathSequences(e);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].x, 195);
    assert.ok(requests[0].parts[0].x < 0, 'destroyed socket leads the hull walk');
    assert.equal(consumeBossDeathSequences(e).length, 0);
    assert.equal(playBossDeathSequence(e, b), false, 'late final kill cannot replay bespoke death');
    assert.equal(JSON.stringify([e, b]), before);
  } finally { Math.random = random; }
});

test('queue bounds, simultaneous mini-bosses and replay reset have explicit lifecycle', () => {
  const e = engine();
  for (let i = 0; i < 20; i++) playBossDeathSequence(e, hull(String(i)), true);
  assert.equal(consumeBossDeathSequences(e).length, MAX_BOSS_DEATHS);
  const b = hull();
  playBossDeathSequence(e, b);
  e.feel.resetGeneration++;
  assert.equal(consumeBossDeathSequences(e).length, 0);
  assert.equal(playBossDeathSequence(e, b), true);
  assert.equal(playBossDeathSequence(e, { ...hull(), width: NaN }), false);
});

test('read-only sequence ownership survives consumption and releases on a run reset', () => {
  const e = engine(), b = hull();
  assert.equal(hasBossDeathSequence(e, b), false);
  assert.equal(playBossDeathSequence(e, b, true), true);
  assert.equal(hasBossDeathSequence(e, b), true);
  assert.equal(consumeBossDeathSequences(e).length, 1);
  assert.equal(hasBossDeathSequence(e, b), true, 'late legacy sprite must remain suppressed after renderer consumption');
  assert.equal(hasBossDeathSequence(e, { ...b }), false, 'ownership follows the terminal entity identity');
  e.feel.resetGeneration++;
  assert.equal(hasBossDeathSequence(e, b), false);
  assert.equal(consumeBossDeathSequences(e).length, 0);
  assert.equal(playBossDeathSequence(e, b, true), true);
});

test('major and mini sequences preserve hull until a single finale, finish within 1.5–3 seconds', () => {
  for (const mini of [false, true]) {
    const e = engine();
    playBossDeathSequence(e, hull(), mini);
    const request = consumeBossDeathSequences(e)[0];
    const timeline = bossDeathTimeline(request);
    assert.equal(timeline.filter(b => b.tier === 'mega').length, 1);
    const finale = timeline.at(-1).at;
    assert.ok(timeline.slice(0, -1).every(b => b.size <= 88 && Math.abs(b.x - request.x) < request.width / 2));
    assert.equal(bossDeathPose(finale - 1, mini, false, false).hullVisible, true);
    assert.equal(bossDeathPose(finale, mini, false, false).hullVisible, false);
    assert.ok(bossDeathPose(finale, mini, false, false).flash <= 0.11);
    assert.equal(bossDeathPose(finale + 56, mini, false, false).flash, 0);
    assert.equal(bossDeathPose(1499, mini, false, false).complete, false);
    assert.equal(bossDeathPose(3000, mini, false, false).complete, true);
  }
});

test('30/60/120Hz emit identical chains; Low thins accents and resume skips stale volleys', () => {
  const e = engine(); playBossDeathSequence(e, hull());
  const timeline = bossDeathTimeline(consumeBossDeathSequences(e)[0]);
  const emit = (hz, density) => {
    const seen = [];
    let previous = -0.001;
    for (let age = 0; age < 2500; age += 1000 / hz) {
      for (const b of timeline) if (deathBurstDue(b, previous, age, density)) seen.push(b.seed);
      previous = age;
    }
    return seen;
  };
  assert.deepEqual(emit(30, 1), emit(60, 1));
  assert.deepEqual(emit(60, 1), emit(120, 1));
  assert.equal(emit(60, 1).length, timeline.length);
  assert.ok(emit(60, 0.4).length < timeline.length);
  assert.ok(emit(60, 0.4).includes(timeline.at(-1).seed));
  assert.ok(timeline.every(b => !deathBurstDue(b, 0, 10000, 1)));
});

test('reduced motion removes flash, camera shake and effect remains finite at extreme clocks', () => {
  for (const age of [0, 500, 1440, 1460, 2400, 1e6]) {
    const pose = bossDeathPose(age, false, true, false);
    assert.equal(pose.flash, 0);
    assert.ok(pose.shakeX === 0);
    assert.ok(pose.shakeY === 0);
    assert.ok(Object.values(pose).every(v => typeof v === 'boolean' || Number.isFinite(v)));
  }
});
