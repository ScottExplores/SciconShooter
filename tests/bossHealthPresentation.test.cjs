const assert = require('node:assert/strict');
const test = require('node:test');
const esbuild = require('esbuild');

const compiled = esbuild.buildSync({
  entryPoints: ['services/pixi/BossHealthPresentation.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent'
});
const helperModule = { exports: {} };
Function('module', 'exports', compiled.outputFiles[0].text)(helperModule, helperModule.exports);
const { BossHealthPresentation } = helperModule.exports;

test('boss health updates immediately while the damage chip holds briefly and settles by 450ms', () => {
  const health = new BossHealthPresentation();
  assert.equal(health.update('boss', 1000, 1000, 100), health, 'update reuses its state without allocating snapshots');
  health.update('boss', 600, 1000, 110);
  assert.equal(health.actualRatio, 0.6);
  assert.equal(health.trailRatio, 1);
  health.update('boss', 600, 1000, 117);
  assert.equal(health.trailRatio, 1, 'hold lasts seven simulation frames');
  health.update('boss', 600, 1000, 127);
  assert.equal(health.trailRatio, 0.8);
  health.update('boss', 600, 1000, 137);
  assert.equal(health.trailRatio, health.actualRatio);
});

test('continuous hits cannot extend the original chip deadline indefinitely', () => {
  const health = new BossHealthPresentation();
  health.update('boss', 1000, 1000, 0);
  for (let frame = 1; frame <= 28; frame++) {
    health.update('boss', 1000 - frame * 10, 1000, frame);
    assert.equal(health.actualRatio, (1000 - frame * 10) / 1000);
    assert.ok(health.trailRatio >= health.actualRatio && health.trailRatio <= 1);
  }
  assert.equal(health.trailRatio, health.actualRatio,
    'the chip catches up on frame 28 despite a hit on every frame');
  health.update('boss', 600, 1000, 29);
  assert.equal(health.trailRatio, 0.72, 'a fresh damage window may begin after the old one settles');
});

test('pause freezes chip presentation because repeated simulation frames do not advance it', () => {
  const health = new BossHealthPresentation();
  health.update('boss', 100, 100, 0);
  health.update('boss', 50, 100, 1);
  health.update('boss', 50, 100, 18);
  const pausedTrail = health.trailRatio;
  for (let render = 0; render < 100; render++) health.update('boss', 50, 100, 18);
  assert.equal(health.trailRatio, pausedTrail);
  health.update('boss', 50, 100, 28);
  assert.equal(health.trailRatio, 0.5);
});

test('identity, health capacity, healing, and run-frame rollback clear old damage', () => {
  for (const reset of [
    ['next-boss', 400, 1000, 104],
    ['boss', 400, 2000, 104],
    ['boss', 700, 1000, 104],
    ['boss', 400, 1000, 0]
  ]) {
    const health = new BossHealthPresentation();
    health.update('boss', 1000, 1000, 100);
    health.update('boss', 400, 1000, 101);
    health.update(...reset);
    assert.equal(health.trailRatio, health.actualRatio, JSON.stringify(reset));
  }
  const health = new BossHealthPresentation();
  health.update('boss', 100, 100, 10);
  health.update('boss', 40, 100, 11);
  health.reset();
  assert.equal(health.actualRatio, 0);
  assert.equal(health.trailRatio, 0);
  health.update('boss', 20, 100, 12);
  assert.equal(health.trailRatio, 0.2, 'same ID after a no-boss interval is still a new encounter');
});

test('reduced motion snaps the chip and malformed values cannot render outside the meter', () => {
  const health = new BossHealthPresentation();
  health.update('boss', 100, 100, 0);
  health.update('boss', 50, 100, 1);
  health.update('boss', 40, 100, 2, true);
  assert.equal(health.trailRatio, 0.4);
  health.update('boss', 40, 100, 3, false);
  assert.equal(health.trailRatio, 0.4, 'turning motion back on does not resurrect old damage');
  for (const [hp, maxHp] of [[200, 100], [-5, 100], [NaN, 100], [Infinity, 100], [10, 0], [0, NaN]]) {
    health.update('next', hp, maxHp, 4, true);
    assert.ok(Number.isFinite(health.actualRatio) && health.actualRatio >= 0 && health.actualRatio <= 1);
    assert.equal(health.trailRatio, health.actualRatio);
  }
});
