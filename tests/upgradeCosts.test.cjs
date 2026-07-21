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
const stats = (fireRate, speed) => ({
  lives: 3,
  repairsCount: 0,
  upgrades: { fireRate, speed, missile: 0 }
});

test('allows flask life upgrades up to fifteen hearts', () => {
  assert.equal(GAME_CONFIG.MAX_LIVES, 15);
  assert.equal(FIELD_UPGRADE_CONFIG.extraLife.maxLevel, 15);
});

test('prices premium weapon and speed tiers in stored flasks', () => {
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 4), 'fireRate'), 1);
  assert.equal(getFieldUpgradeFlaskCost(stats(5, 4), 'fireRate'), 5);
  assert.equal(getFieldUpgradeFlaskCost(stats(6, 4), 'fireRate'), 10);
  assert.equal(getFieldUpgradeFlaskCost(stats(14, 4), 'fireRate'), 15);
  assert.equal(getFieldUpgradeFlaskCost(stats(4, 5), 'speed'), 5);
  assert.equal(FIELD_UPGRADE_CONFIG.fireRate.maxLevel, 21);
  assert.equal(FIELD_UPGRADE_CONFIG.speed.maxLevel, 6);
});
