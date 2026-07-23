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
const bioPrimary = compileModule('services/bioPrimaryWeapon.ts', {
  './weaponTierProgression': progression
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
  assert.equal(plan.simulationEntityCount, 2);
  assert.equal(plan.queuedEntityCount, 1);
  assert.equal(plan.totalDamage, 1);
  assert.deepEqual(Array.from(plan.shots, (shot) => shot.fireDelayFrames), [0, 1]);
  assert.deepEqual(Array.from(plan.shots, (shot) => shot.offsetX), [-10, 10]);
  plan.shots.forEach((shot) => {
    assert.equal(shot.angleBias, 0);
    assert.equal(shot.damagePerRound, 0.5);
    assert.equal(shot.representedRoundCount, 1);
    assert.equal(shot.visualPattern[0].launchDelayFrames, 0);
  });
});

test('BIO tiers preserve exact Research damage with bounded rail entities', () => {
  for (const [level, expectedTier] of [[0, 1], [7, 2], [14, 3]]) {
    const plan = getBioPrimaryShotPlan(level, false, false);
    assert.equal(plan.volleySize, expectedTier);
    assert.equal(plan.logicalRoundCount, expectedTier * 2);
    assert.equal(plan.totalDamage, expectedTier, `level ${level} matches Research damage`);
    assert.equal(plan.simulationEntityCount, 2, 'tier copies stay bundled per rail');
    assert.equal(plan.queuedEntityCount, 1);
    plan.shots.forEach((shot) => assert.equal(shot.representedRoundCount, expectedTier));
  }
});

test('BIO spread repeats straight rail pairs over time instead of adding angled lanes', () => {
  const plan = getBioPrimaryShotPlan(14, true, false);

  assert.equal(plan.repeatCount, 3);
  assert.equal(plan.logicalRoundCount, 18);
  assert.equal(plan.totalDamage, 9, 'Tier 3 BIO spread matches nine full-strength Research rounds');
  assert.equal(plan.simulationEntityCount, 2, 'repeated rounds stay bundled in two rail entities');
  assert.equal(plan.queuedEntityCount, 1);
  assert.deepEqual(Array.from(plan.shots, (shot) => shot.fireDelayFrames), [0, 1]);
  assert.ok(plan.shots.every((shot) => shot.angleBias === 0));
  assert.ok(plan.shots.every((shot) => shot.visualPattern.every((round) => round.angleOffset === 0)));
  assert.deepEqual(
    Array.from(plan.shots[0].visualPattern, (round) => round.launchDelayFrames),
    [0, 0, 0, 2, 2, 2, 4, 4, 4],
    'spread repeats remain visibly staggered inside each straight rail'
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
  for (const level of [0, 7, 14, 21]) {
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
