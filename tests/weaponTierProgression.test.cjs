const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'services', 'weaponTierProgression.ts'), 'utf8');
const compiled = ts.transpileModule(progressionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require
});

const {
  FIRE_RATE_LEVELS_PER_TIER,
  FIRE_RATE_MAX_LEVEL,
  getFireRateIntervalFrames,
  getFireRateTier,
  getFireRateTierProgress,
  getFireRateVolleySize,
  getTightVolleyAngleOffsets,
  getTightVolleyOffsets
} = moduleBox.exports;

test('fire-rate levels cross three seven-upgrade tiers at levels seven and fourteen', () => {
  assert.equal(FIRE_RATE_LEVELS_PER_TIER, 7);
  assert.equal(FIRE_RATE_MAX_LEVEL, 21);
  assert.equal(getFireRateTier(0), 1);
  assert.equal(getFireRateTier(6), 1);
  assert.equal(getFireRateTier(7), 2);
  assert.equal(getFireRateTier(13), 2);
  assert.equal(getFireRateTier(14), 3);
  assert.equal(getFireRateTier(21), 3);
  assert.equal(getFireRateTierProgress(7), 0);
  assert.equal(getFireRateTierProgress(14), 0);
  assert.equal(getFireRateTierProgress(21), 7);
});

test('higher fire-rate tiers add tight parallel bullets and multiply every triple-shot lane', () => {
  assert.equal(getFireRateVolleySize(0), 1);
  assert.equal(getFireRateVolleySize(7), 2);
  assert.equal(getFireRateVolleySize(14), 3);
  assert.deepEqual(Array.from(getTightVolleyOffsets(1)), [0]);
  assert.deepEqual(Array.from(getTightVolleyOffsets(2)), [-3.5, 3.5]);
  assert.deepEqual(Array.from(getTightVolleyOffsets(3)), [-6, 0, 6]);
  assert.equal(getFireRateVolleySize(7) * 3, 6);
  assert.equal(getFireRateVolleySize(14) * 3, 9);
});

test('tier-two and tier-three bundles taper outward by only a few degrees', () => {
  const radiansToDegrees = (radians) => radians * (180 / Math.PI);
  assert.deepEqual(Array.from(getTightVolleyAngleOffsets(1)), [0]);
  assert.deepEqual(
    Array.from(getTightVolleyAngleOffsets(2)).map(radiansToDegrees),
    [-1.25, 1.25]
  );
  const tierThreeAngles = Array.from(getTightVolleyAngleOffsets(3)).map(radiansToDegrees);
  assert.ok(Math.abs(tierThreeAngles[0] + 1.6) < 1e-10);
  assert.equal(tierThreeAngles[1], 0);
  assert.ok(Math.abs(tierThreeAngles[2] - 1.6) < 1e-10);
});

test('all twenty-one upgrades improve cadence without exceeding the prior five-frame ceiling', () => {
  let previous = getFireRateIntervalFrames(0);
  assert.equal(previous, 15);
  for (let level = 1; level <= FIRE_RATE_MAX_LEVEL; level += 1) {
    const current = getFireRateIntervalFrames(level);
    assert.ok(current < previous, `level ${level} should be faster than level ${level - 1}`);
    previous = current;
  }
  assert.ok(Math.abs(previous - 5) < 1e-10);
});

test('the engine emits each tight bundle in the center and in both triple-shot side lanes', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(engine, /const volleySize = getFireRateVolleySize\(this\.stats\.upgrades\.fireRate \|\| 0\)/);
  assert.match(engine, /const volleyOffsets = getTightVolleyOffsets\(volleySize\)/);
  assert.match(engine, /const volleyAngleOffsets = getTightVolleyAngleOffsets\(volleySize\)/);
  assert.match(engine, /volleyOffsets\.forEach\(\(offsetX, index\) => \{[\s\S]*this\.spawnPlayerBullet/);
  assert.match(engine, /\(\[-1, 1\] as const\)\.forEach[\s\S]*volleyOffsets\.forEach\(\(bundleOffset, bundleIndex\)/);
  assert.match(engine, /offsetX: side \* 4 \+ bundleOffset/);
  assert.match(engine, /angleBias: sideAngle \+ volleyAngleOffsets\[bundleIndex\]/);
});

test('bomb drops and pickups have no inventory ceiling', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const overlay = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');

  assert.doesNotMatch(engine, /MAX_BOMBS/);
  assert.match(engine, /this\.stats\.bombs = Math\.max\(0, Math\.floor\(this\.stats\.bombs \|\| 0\)\) \+ 1/);
  assert.match(engine, /target\.type !== EntityType\.BOSS && !this\.isBombResolving/);
  assert.doesNotMatch(overlay, /bombs < 3/);
});
