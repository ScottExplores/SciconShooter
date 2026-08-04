const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, exports: moduleBox.exports, require }
  );
  return moduleBox.exports;
};

const {
  clampPlayerLives,
  resolvePlayerLifeDamage,
  resolvePlayerRevivalLives
} = compileModule('services/gameplay/playerLifeRuntime.ts');

test('overkill and repeated terminal damage never reduce player lives below zero', () => {
  const lethal = resolvePlayerLifeDamage(1, 2, 10);
  assert.equal(lethal.previousLives, 1);
  assert.equal(lethal.lives, 0);
  assert.equal(lethal.damageApplied, 1);
  assert.equal(lethal.defeated, true);

  const repeated = resolvePlayerLifeDamage(lethal.lives, 5, 10);
  assert.equal(repeated.previousLives, 0);
  assert.equal(repeated.lives, 0);
  assert.equal(repeated.damageApplied, 0);
  assert.equal(repeated.defeated, true);
  assert.equal(clampPlayerLives(-1, 10), 0);
});

test('revival restores a bounded playable life count before damage resumes', () => {
  const restored = resolvePlayerRevivalLives(-3, 10);
  assert.equal(restored, 1);

  const hitAfterRevival = resolvePlayerLifeDamage(restored, 4, 10);
  assert.equal(hitAfterRevival.lives, 0);
  assert.equal(hitAfterRevival.defeated, true);
  assert.equal(resolvePlayerRevivalLives(99, 10), 10);
});

test('GameEngine routes ram and projectile damage through the clamped transition', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const damageCalls = engine.match(/this\.applyPlayerLifeDamage\(incomingDamage\)/g) || [];

  assert.equal(damageCalls.length, 2);
  assert.match(engine, /startDeathSequence\(\) \{\s*this\.syncPlayerLives\(\)/);
  assert.match(engine, /finishDeathSequence\(\) \{\s*this\.syncPlayerLives\(\)/);
  assert.match(engine, /this\.syncPlayerLives\(resolvePlayerRevivalLives\(lives, GAME_CONFIG\.MAX_LIVES\)\)/);
  assert.doesNotMatch(engine, /this\.lives\s*-=/);
});

test('Campaign Mission boundaries refill permanent hearts while internal and Weekly waves carry damage', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const canvas = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const hud = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');

  const boundaryStart = engine.indexOf('const stageBoundary =');
  const boundaryEnd = engine.indexOf('this.sectorTint =', boundaryStart);
  const boundaryBlock = engine.slice(boundaryStart, boundaryEnd);
  assert.match(boundaryBlock, /if \(stageBoundary && !seamlessStageBoundary\)/);
  assert.match(boundaryBlock, /if \(this\.refillLivesAtMissionBoundary\)[\s\S]*?this\.syncPlayerLives\(this\.startingLives\)/);
  assert.match(canvas, /refillLivesAtMissionBoundary\?: boolean/);
  assert.match(app, /refillLivesAtMissionBoundary: !isWeeklyCampaignRun/);
  assert.match(hud, /lifeCapacityMissionRef\.current !== stats\.wave[\s\S]*?lifeCapacityRef\.current = Math\.max\(1, lifeCapacity \?\? stats\.lives\)/);
  assert.match(app, /lifeCapacity: activeRunLifeCapacity/);
});
