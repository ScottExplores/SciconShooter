const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const weaponTierSource = fs.readFileSync(path.join(root, 'services', 'weaponTierProgression.ts'), 'utf8');
const weaponTierCompiled = ts.transpileModule(weaponTierSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const weaponTierBox = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${weaponTierCompiled} })(module.exports, require, module);`,
  { module: weaponTierBox, require }
);
const progressionSource = fs.readFileSync(path.join(root, 'services', 'campaignCombatProgression.ts'), 'utf8');
const compiled = ts.transpileModule(progressionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require: (request) => request === './weaponTierProgression'
    ? weaponTierBox.exports
    : require(request)
});

const progression = moduleBox.exports;
const playerShotSpreadSource = fs.readFileSync(path.join(root, 'services', 'playerShotSpread.ts'), 'utf8');
const playerShotSpreadCompiled = ts.transpileModule(playerShotSpreadSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const playerShotSpreadBox = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${playerShotSpreadCompiled} })(module.exports, require, module);`,
  { module: playerShotSpreadBox, require }
);
const bioPrimarySource = fs.readFileSync(path.join(root, 'services', 'bioPrimaryWeapon.ts'), 'utf8');
const bioPrimaryCompiled = ts.transpileModule(bioPrimarySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const bioPrimaryBox = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${bioPrimaryCompiled} })(module.exports, require, module);`,
  {
    module: bioPrimaryBox,
    require: (request) => {
      if (request === './weaponTierProgression') return weaponTierBox.exports;
      if (request === './playerShotSpread') return playerShotSpreadBox.exports;
      return require(request);
    }
  }
);
const bioPrimary = bioPrimaryBox.exports;
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

test('Tier-7 spread Max Shot sustains every cadence slot inside its bounded entity budget', () => {
  const cadenceFrames = 4;
  const simulationEntitiesPerVolley = progression.getMaxShotSimulationEntityCount(true);
  const entityCap = progression.getMaxShotSustainedEntityFloor(true);
  const lifetime = progression.MAX_SHOT_BUNDLE_LIFETIME_FRAMES;
  const activeExpiryFrames = [];
  let admittedVolleys = 0;
  let peakEntities = 0;

  for (let frame = 0; frame < 600; frame += 1) {
    for (let index = activeExpiryFrames.length - 1; index >= 0; index -= 1) {
      if (activeExpiryFrames[index] <= frame) activeExpiryFrames.splice(index, 1);
    }
    if (frame % cadenceFrames === 0) {
      assert.equal(
        progression.canAdmitMaxShotVolley(activeExpiryFrames.length, 0, true, entityCap),
        true,
        `volley at frame ${frame} should not be cap-throttled`
      );
      for (let index = 0; index < simulationEntitiesPerVolley; index += 1) {
        activeExpiryFrames.push(frame + lifetime);
      }
      admittedVolleys += 1;
    }
    peakEntities = Math.max(peakEntities, activeExpiryFrames.length);
  }

  assert.equal(admittedVolleys, 150);
  assert.equal(simulationEntitiesPerVolley, 3);
  assert.equal(entityCap, 72);
  assert.equal(peakEntities, 72);
  assert.equal(progression.canAdmitMaxShotVolley(69, 0, true, entityCap), true);
  assert.equal(progression.canAdmitMaxShotVolley(70, 0, true, entityCap), false);
});

test('BIO normal and spread+Max sustain Tier-7 cadence with complete paired-lane reservations', () => {
  const cadenceFrames = 4;
  const lifetime = progression.MAX_SHOT_BUNDLE_LIFETIME_FRAMES;
  const scenarios = [
    // BIO rails land 16% over the Research totals (0.58 per rail).
    { label: 'normal', spreadActive: false, maxShotActive: false, expectedDamage: 4.5 * 1.16 },
    { label: 'spread+Max', spreadActive: true, maxShotActive: true, expectedDamage: 27 * 1.16 }
  ];

  for (const scenario of scenarios) {
    const plan = bioPrimary.getBioPrimaryShotPlan(
      49,
      scenario.spreadActive,
      scenario.maxShotActive
    );
    const entityCap = progression.getMaxShotSustainedEntityFloor(
      scenario.spreadActive,
      plan.simulationEntityCount
    ) + plan.queuedEntityCount;
    const activeExpiryFrames = [];
    let admittedVolleys = 0;
    let peakReservations = 0;

    for (let frame = 0; frame < 600; frame += 1) {
      for (let index = activeExpiryFrames.length - 1; index >= 0; index -= 1) {
        if (activeExpiryFrames[index] <= frame) activeExpiryFrames.splice(index, 1);
      }
      if (frame % cadenceFrames === 0) {
        assert.ok(
          activeExpiryFrames.length + plan.simulationEntityCount <= entityCap,
          `${scenario.label} volley at frame ${frame} should not be cap-throttled`
        );
        plan.shots.forEach((shot) => {
          activeExpiryFrames.push(frame + shot.fireDelayFrames + lifetime);
        });
        admittedVolleys += 1;
      }
      peakReservations = Math.max(peakReservations, activeExpiryFrames.length);
    }

    assert.equal(plan.simulationEntityCount, scenario.spreadActive ? 3 : 1);
    assert.equal(plan.queuedEntityCount, scenario.spreadActive ? 2 : 0);
    assert.ok(Math.abs(plan.totalDamage - scenario.expectedDamage) < 1e-10);
    assert.ok(entityCap >= peakReservations);
    assert.equal(admittedVolleys, 150);
  }
});

test('one pooled lane bundle presents exactly twice every one-to-seven-round spread pattern', () => {
  const copies = progression.getMaxShotCopyPattern();
  const tierPatterns = Array.from({ length: 7 }, (_, index) => {
    const volleySize = index + 1;
    return progression.buildMaxShotBundleVisualPattern(
      weaponTierBox.exports.getTightVolleyOffsets(volleySize),
      weaponTierBox.exports.getTightVolleyAngleOffsets(volleySize)
    );
  });

  assert.equal(copies.length, 2);
  assert.deepEqual(tierPatterns.map((pattern) => pattern.length), [2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(
    tierPatterns.map((pattern) => pattern.length * progression.getMaxShotSimulationEntityCount(true)),
    [6, 12, 18, 24, 30, 36, 42]
  );
  assert.match(rendererSource, /projectileCopies\?: Sprite\[\]/);
  assert.match(rendererSource, /ensureProjectileCopySprites\(view, visualPattern\.length\)/);
  assert.match(engineSource, /roundIndex < remainingVisualRounds/);
});

test('represented Max Shot rounds preserve total boss damage and bounded multi-target utility', () => {
  const allocate = progression.getMaxShotRoundsForTarget;
  assert.equal(allocate(6, 100, 1, true), 6, 'a boss consumes the represented lane damage once');
  assert.equal(allocate(6, 1, 1, false), 1, 'a one-health swarm target consumes one round');
  assert.equal(allocate(5, 3, 1, false), 3, 'an elite consumes only the rounds needed to defeat it');
  assert.equal(allocate(2, 10, 1, false), 2, 'remaining rounds stay bounded');
  assert.match(engineSource, /shot\.hitTargetIds\?\.add\(target\.id\)/);
  assert.match(engineSource, /shot\.representedRoundsRemaining - representedRounds/);
});
