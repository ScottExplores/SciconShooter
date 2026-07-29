const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require.resolve('../constants.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const progressionSource = fs.readFileSync(require.resolve('../services/weaponTierProgression.ts'), 'utf8');
const progressionCompiled = ts.transpileModule(progressionSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const progressionModule = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${progressionCompiled} })(module.exports, require, module);`, {
  module: progressionModule,
  require
});
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require: (specifier) => specifier === './services/weaponTierProgression'
    ? progressionModule.exports
    : require(specifier)
});

const { FIELD_UPGRADE_CONFIG, GAME_CONFIG, getFieldUpgradeFlaskCost } = moduleBox.exports;
const stats = (fireRate, speed, repairsCount = 0) => ({
  lives: 3,
  repairsCount,
  upgrades: { fireRate, speed, missile: 0 }
});

test('caps every life-upgrade path at ten total hearts', () => {
  assert.equal(GAME_CONFIG.PLAYER_LIVES, 3);
  assert.equal(GAME_CONFIG.MAX_LIVES, 10);
  assert.equal(FIELD_UPGRADE_CONFIG.extraLife.maxLevel, 10);
});

test('prices weapon tiers normally and makes every single-track upgrade premium', () => {
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 4), 'fireRate'), 1);
  assert.equal(getFieldUpgradeFlaskCost(stats(5, 4), 'fireRate'), 5);
  assert.equal(getFieldUpgradeFlaskCost(stats(6, 4), 'fireRate'), 10);
  assert.equal(getFieldUpgradeFlaskCost(stats(14, 4), 'fireRate'), 15);
  assert.equal(getFieldUpgradeFlaskCost(stats(21, 4), 'fireRate'), 20);
  assert.equal(getFieldUpgradeFlaskCost(stats(28, 4), 'fireRate'), 25);
  assert.equal(getFieldUpgradeFlaskCost(stats(35, 4), 'fireRate'), 30);
  assert.equal(getFieldUpgradeFlaskCost(stats(42, 4), 'fireRate'), 35);
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 0), 'speed'), 5);
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 4), 'speed'), 5);
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 5), 'speed'), 5);
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 0, 0), 'extraLife'), 5);
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 0, 12), 'extraLife'), 5);
  assert.equal(FIELD_UPGRADE_CONFIG.fireRate.maxLevel, 49);
  assert.equal(FIELD_UPGRADE_CONFIG.speed.maxLevel, 6);
});
