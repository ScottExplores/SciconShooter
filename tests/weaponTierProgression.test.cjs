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
  FIRE_RATE_TIER_COUNT,
  FIRE_RATE_VOLLEY_DAMAGE_MULTIPLIERS,
  getFireRateIntervalFrames,
  getFireRateProjectileDamageMultiplier,
  getFireRateTier,
  getFireRateTierProgress,
  getFireRateVolleyDamageMultiplier,
  getFireRateVolleySize,
  getTightVolleyAngleOffsets,
  getTightVolleyOffsets
} = moduleBox.exports;

test('fire-rate levels cross seven seven-upgrade tiers without rewriting legacy levels', () => {
  assert.equal(FIRE_RATE_LEVELS_PER_TIER, 7);
  assert.equal(FIRE_RATE_TIER_COUNT, 7);
  assert.equal(FIRE_RATE_MAX_LEVEL, 49);
  assert.equal(getFireRateTier(0), 1);
  assert.equal(getFireRateTier(6), 1);
  assert.equal(getFireRateTier(7), 2);
  assert.equal(getFireRateTier(13), 2);
  assert.equal(getFireRateTier(14), 3);
  assert.equal(getFireRateTier(20), 3);
  assert.equal(getFireRateTier(21), 4);
  assert.equal(getFireRateTier(28), 5);
  assert.equal(getFireRateTier(35), 6);
  assert.equal(getFireRateTier(42), 7);
  assert.equal(getFireRateTier(49), 7);
  assert.equal(getFireRateTierProgress(7), 0);
  assert.equal(getFireRateTierProgress(14), 0);
  assert.equal(getFireRateTierProgress(21), 0);
  assert.equal(getFireRateTierProgress(42), 0);
  assert.equal(getFireRateTierProgress(49), 7);
});

test('all seven tiers add symmetric visible rounds and multiply every triple-shot lane', () => {
  assert.deepEqual(
    [0, 7, 14, 21, 28, 35, 42].map(getFireRateVolleySize),
    [1, 2, 3, 4, 5, 6, 7]
  );
  assert.deepEqual(Array.from(getTightVolleyOffsets(1)), [0]);
  assert.deepEqual(Array.from(getTightVolleyOffsets(2)), [-3.5, 3.5]);
  assert.deepEqual(Array.from(getTightVolleyOffsets(3)), [-6, 0, 6]);
  for (let volleySize = 1; volleySize <= 7; volleySize += 1) {
    const offsets = Array.from(getTightVolleyOffsets(volleySize));
    assert.equal(offsets.length, volleySize);
    assert.ok(Math.max(...offsets.map(Math.abs)) <= 15, `tier ${volleySize} stays inside the ship silhouette`);
    offsets.forEach((offset, index) => {
      assert.ok(Math.abs(offset + offsets[offsets.length - 1 - index]) < 1e-10);
    });
    assert.equal(getFireRateVolleySize((volleySize - 1) * 7) * 3, volleySize * 3);
  }
});

test('all tier bundles taper outward symmetrically by at most 2.5 degrees', () => {
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
  for (let volleySize = 1; volleySize <= 7; volleySize += 1) {
    const angles = Array.from(getTightVolleyAngleOffsets(volleySize)).map(radiansToDegrees);
    assert.equal(angles.length, volleySize);
    assert.ok(Math.max(...angles.map(Math.abs)) <= 2.5 + 1e-10);
    angles.forEach((angle, index) => {
      assert.ok(Math.abs(angle + angles[angles.length - 1 - index]) < 1e-10);
    });
  }
});

test('all forty-nine upgrades improve cadence while preserving the shipped first 21 levels', () => {
  let previous = getFireRateIntervalFrames(0);
  assert.equal(previous, 15);
  for (let level = 1; level <= FIRE_RATE_MAX_LEVEL; level += 1) {
    const current = getFireRateIntervalFrames(level);
    assert.ok(current < previous, `level ${level} should be faster than level ${level - 1}`);
    previous = current;
  }
  assert.ok(Math.abs(getFireRateIntervalFrames(21) - 5) < 1e-10);
  assert.ok(Math.abs(previous - 4) < 1e-10);
});

test('later visible rounds use a balanced volley budget instead of raw seven-times damage', () => {
  assert.deepEqual(Array.from(FIRE_RATE_VOLLEY_DAMAGE_MULTIPLIERS), [1, 2, 3, 3.45, 3.85, 4.2, 4.5]);
  for (let volleySize = 1; volleySize <= 7; volleySize += 1) {
    const total = getFireRateVolleyDamageMultiplier(volleySize);
    const perRound = getFireRateProjectileDamageMultiplier(volleySize);
    assert.ok(Math.abs(perRound * volleySize - total) < 1e-10);
  }
  assert.equal(getFireRateVolleyDamageMultiplier(7), 4.5);
  assert.ok(getFireRateProjectileDamageMultiplier(7) < 1);
});

test('the engine emits one collision bundle per center or triple-shot lane', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(engine, /const volleySize = getFireRateVolleySize\(this\.stats\.upgrades\.fireRate \|\| 0\)/);
  assert.match(engine, /const tightVolleyVisualPattern = getTightVolleyVisualPattern\(volleySize\)/);
  assert.match(engine, /const maxShotVisualPattern = maxShotActive[\s\S]*getMaxShotBundleVisualPattern\(volleySize\)/);
  assert.match(engine, /getPrimaryVolleySimulationEntityCount\(spreadLanes\)/);
  assert.match(engine, /this\.spawnPlayerBullet\([\s\S]*tightVolleyVisualPattern,[\s\S]*volleyProjectileDamage/);
  assert.match(engine, /playSound: false,[\s\S]*maxShotVisualPattern: tightVolleyVisualPattern/);
  assert.match(engine, /Math\.abs\(Math\.sin\(round\.angleOffset\)\) \* 100/);
});

test('bomb drops and pickups have no inventory ceiling', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const overlay = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');

  assert.doesNotMatch(engine, /MAX_BOMBS/);
  assert.match(engine, /this\.stats\.bombs = Math\.max\(0, Math\.floor\(this\.stats\.bombs \|\| 0\)\) \+ 1/);
  assert.match(engine, /target\.type !== EntityType\.BOSS && !this\.isBombResolving/);
  assert.doesNotMatch(overlay, /bombs < 3/);
});
