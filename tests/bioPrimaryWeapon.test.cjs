const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileModule = (relativePath, dependencies = {}) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const moduleBox = { exports: {} };
  const localRequire = (request) => dependencies[request] ?? require(request);
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, exports: moduleBox.exports, require: localRequire }
  );
  return moduleBox.exports;
};

const progression = compileModule('services/weaponTierProgression.ts');
const playerShotSpread = compileModule('services/playerShotSpread.ts');
const bioPrimary = compileModule('services/bioPrimaryWeapon.ts', {
  './weaponTierProgression': progression,
  './playerShotSpread': playerShotSpread
});

const {
  BIO_PRIMARY_DAMAGE_PER_ROUND,
  BIO_PRIMARY_PATTERN_RADIUS_PX,
  getBioPrimaryShotPlan
} = bioPrimary;

test('BIO starts as two half-damage straight rails staggered by one frame', () => {
  const plan = getBioPrimaryShotPlan(0, false, false);

  assert.equal(BIO_PRIMARY_DAMAGE_PER_ROUND, 0.5);
  assert.equal(plan.volleySize, 1);
  assert.equal(plan.logicalRoundCount, 2);
  assert.equal(plan.simulationEntityCount, 1);
  assert.equal(plan.queuedEntityCount, 0);
  assert.equal(plan.totalDamage, 1);
  assert.deepEqual(Array.from(plan.shots, (shot) => shot.fireDelayFrames), [0]);
  assert.deepEqual(Array.from(plan.shots, (shot) => shot.offsetX), [0]);
  plan.shots.forEach((shot) => {
    assert.equal(shot.angleBias, 0);
    assert.equal(shot.damagePerRound, 0.5);
    assert.equal(shot.representedRoundCount, 2);
    assert.deepEqual(Array.from(shot.visualPattern, (round) => round.launchDelayFrames), [0, 1]);
    assert.deepEqual(Array.from(shot.visualPattern, (round) => round.offsetX), [-10, 10]);
  });
});

test('BIO tiers preserve exact Research damage with bounded rail entities', () => {
  const expectedTotals = [1, 2, 3, 3.45, 3.85, 4.2, 4.5];
  for (const [index, expectedTier] of [1, 2, 3, 4, 5, 6, 7].entries()) {
    const level = index * 7;
    const plan = getBioPrimaryShotPlan(level, false, false);
    assert.equal(plan.volleySize, expectedTier);
    assert.equal(plan.logicalRoundCount, expectedTier * 2);
    assert.ok(Math.abs(plan.totalDamage - expectedTotals[index]) < 1e-10, `level ${level} matches Research damage`);
    assert.equal(plan.simulationEntityCount, 1, 'both rails and tier copies stay in one lane bundle');
    assert.equal(plan.queuedEntityCount, 0);
    plan.shots.forEach((shot) => assert.equal(shot.representedRoundCount, expectedTier * 2));
  }
});

test('BIO triple shot creates three angled lanes while retaining two rails per lane', () => {
  const plan = getBioPrimaryShotPlan(14, true, false, 0, 1);

  assert.equal(plan.repeatCount, 3);
  assert.equal(plan.logicalRoundCount, 18);
  assert.equal(plan.totalDamage, 9, 'Tier 3 BIO spread matches nine full-strength Research rounds');
  assert.equal(plan.simulationEntityCount, 3, 'three collision lanes each retain the paired BIO rails');
  assert.equal(plan.queuedEntityCount, 2);
  assert.deepEqual(Array.from(plan.shots, (shot) => shot.fireDelayFrames), [0, 1, 2]);
  assert.equal(plan.shots[0].angleBias, 0);
  assert.ok(plan.shots[1].angleBias < 0);
  assert.ok(plan.shots[2].angleBias > 0);
  assert.ok(Math.abs(plan.shots[1].angleBias * (180 / Math.PI) + 15) < 0.00001);
  assert.ok(Math.abs(plan.shots[2].angleBias * (180 / Math.PI) - 20) < 0.00001);
  assert.ok(plan.shots.every((shot) => shot.visualPattern.every((round) => round.angleOffset === 0)));
  assert.deepEqual(
    Array.from(plan.shots[0].visualPattern, (round) => round.launchDelayFrames),
    [0, 2, 4, 1, 3, 5],
    'both rails and tier rounds remain visibly staggered inside each angled lane'
  );
});

test('BIO Max Shot doubles represented rounds without increasing simulation entities', () => {
  for (const spreadActive of [false, true]) {
    const regular = getBioPrimaryShotPlan(14, spreadActive, false);
    const maxShot = getBioPrimaryShotPlan(14, spreadActive, true);
    assert.equal(maxShot.logicalRoundCount, regular.logicalRoundCount * 2);
    assert.equal(maxShot.totalDamage, regular.totalDamage * 2);
    assert.equal(maxShot.simulationEntityCount, regular.simulationEntityCount);
    assert.equal(maxShot.queuedEntityCount, regular.queuedEntityCount);
  }
});

test('every BIO tier, spread, and Max Shot copy stays inside the ship radius', () => {
  for (const level of [0, 7, 14, 21, 28, 35, 42, 49]) {
    for (const spreadActive of [false, true]) {
      for (const maxShotActive of [false, true]) {
        const plan = getBioPrimaryShotPlan(level, spreadActive, maxShotActive);
        plan.shots.forEach((shot) => {
          shot.visualPattern.forEach((round) => {
            assert.ok(
              Math.abs(shot.offsetX + round.offsetX) <= BIO_PRIMARY_PATTERN_RADIUS_PX,
              `level ${level} round remains inside BIO radius`
            );
          });
        });
      }
    }
  }
});

test('GameEngine owns BIO selection, atomic admission, and the green primary without touching its special', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(engine, /this\.playerShipId === 'bio'[\s\S]*getBioPrimaryShotPlan/);
  assert.match(engine, /getMaxShotSustainedEntityFloor\([\s\S]*bioPrimaryPlan\.simulationEntityCount/);
  assert.match(engine, /bioPrimaryPlan\.queuedEntityCount \+ companionAllowance/);
  assert.match(engine, /hasPlayerShotCapacity\(bioPrimaryPlan\.simulationEntityCount\)/);
  assert.match(engine, /pendingPlayerShots\.length \+ bioPrimaryPlan\.queuedEntityCount > PENDING_PLAYER_SHOT_CAP/);
  assert.match(engine, /weaponKind: 'bio-primary'/);
  assert.match(engine, /damageOverride: shot\.damagePerRound/);
  assert.match(engine, /maxShotVisualPattern: shot\.visualPattern/);
  assert.match(engine, /kind: 'bio-genome-lance'[\s\S]*weaponKind: 'bio-laser'/);
});
