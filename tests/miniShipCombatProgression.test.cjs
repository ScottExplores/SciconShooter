const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'miniShipCombatProgression.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require
});

const {
  getMiniShipDamageMultiplier,
  getMiniShipFireIntervalFrames,
  getMiniShipVolleySize
} = moduleBox.exports;

test('every mini-ship level improves cadence and damage with a visible max-level capstone', () => {
  let previousDamage = getMiniShipDamageMultiplier(1);
  let previousInterval = getMiniShipFireIntervalFrames(52, 1);
  assert.equal(previousDamage, 1);
  assert.equal(previousInterval, 52);
  for (let level = 2; level <= 5; level += 1) {
    const damage = getMiniShipDamageMultiplier(level);
    const interval = getMiniShipFireIntervalFrames(52, level);
    assert.ok(damage > previousDamage, `level ${level} damage should increase`);
    assert.ok(interval < previousInterval, `level ${level} cadence should improve`);
    previousDamage = damage;
    previousInterval = interval;
  }
  assert.equal(getMiniShipDamageMultiplier(5), 2);
  assert.equal(getMiniShipFireIntervalFrames(20, 5), 18, 'cadence retains a safe floor');
});

test('role milestones add meaningful projectiles without erasing role identity', () => {
  assert.deepEqual([1, 3, 5].map((level) => getMiniShipVolleySize('pulse-cannon', level)), [1, 2, 3]);
  assert.deepEqual([1, 3, 5].map((level) => getMiniShipVolleySize('piercing-laser', level)), [1, 2, 3]);
  assert.deepEqual([1, 3, 5].map((level) => getMiniShipVolleySize('prism-fan', level)), [3, 5, 7]);
  assert.deepEqual([1, 3, 5].map((level) => getMiniShipVolleySize('nova-volley', level)), [5, 7, 9]);
  assert.deepEqual([1, 4, 5].map((level) => getMiniShipVolleySize('homing-missile', level)), [1, 2, 2]);
  assert.deepEqual([1, 4, 5].map((level) => getMiniShipVolleySize('heavy-cannon', level)), [1, 1, 2]);
});
