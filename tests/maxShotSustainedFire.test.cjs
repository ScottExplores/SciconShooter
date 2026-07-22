const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const progressionSource = fs.readFileSync(path.join(root, 'services', 'campaignCombatProgression.ts'), 'utf8');
const compiled = ts.transpileModule(progressionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require
});

const progression = moduleBox.exports;
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

test('Tier-3 spread Max Shot sustains every cadence slot inside its bounded entity budget', () => {
  const cadenceFrames = 5;
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

  assert.equal(admittedVolleys, 120);
  assert.equal(simulationEntitiesPerVolley, 3);
  assert.equal(entityCap, 72);
  assert.equal(peakEntities, 72);
  assert.equal(progression.canAdmitMaxShotVolley(69, 0, true, entityCap), true);
  assert.equal(progression.canAdmitMaxShotVolley(70, 0, true, entityCap), false);
});

test('one pooled lane bundle presents exactly twice every tiered spread pattern', () => {
  const copies = progression.getMaxShotCopyPattern();
  const tierPatterns = [
    progression.buildMaxShotBundleVisualPattern([0], [0]),
    progression.buildMaxShotBundleVisualPattern([-3.5, 3.5], [-0.02, 0.02]),
    progression.buildMaxShotBundleVisualPattern([-6, 0, 6], [-0.03, 0, 0.03])
  ];

  assert.equal(copies.length, 2);
  assert.deepEqual(tierPatterns.map((pattern) => pattern.length), [2, 4, 6]);
  assert.deepEqual(
    tierPatterns.map((pattern) => pattern.length * progression.getMaxShotSimulationEntityCount(true)),
    [6, 12, 18]
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
