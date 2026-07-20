const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'services', 'playerShotSpread.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require
});

const {
  TRIPLE_SHOT_SIDE_ANGLE_MIN_DEGREES,
  TRIPLE_SHOT_SIDE_ANGLE_MAX_DEGREES,
  sampleTripleShotSideAngleRadians
} = moduleBox.exports;
const radiansToDegrees = (radians) => radians * (180 / Math.PI);

test('triple-shot side projectiles independently vary from fifteen to twenty degrees', () => {
  assert.equal(TRIPLE_SHOT_SIDE_ANGLE_MIN_DEGREES, 15);
  assert.equal(TRIPLE_SHOT_SIDE_ANGLE_MAX_DEGREES, 20);
  assert.ok(Math.abs(radiansToDegrees(sampleTripleShotSideAngleRadians(-1, 0)) + 15) < 1e-10);
  assert.ok(Math.abs(radiansToDegrees(sampleTripleShotSideAngleRadians(1, 0.5)) - 17.5) < 1e-10);
  assert.ok(Math.abs(radiansToDegrees(sampleTripleShotSideAngleRadians(1, 1)) - 20) < 1e-10);
});

test('triple-shot angle sampling clamps malformed random inputs safely', () => {
  assert.ok(Math.abs(radiansToDegrees(sampleTripleShotSideAngleRadians(1, -2)) - 15) < 1e-10);
  assert.ok(Math.abs(radiansToDegrees(sampleTripleShotSideAngleRadians(-1, 4)) + 20) < 1e-10);
  assert.ok(Math.abs(radiansToDegrees(sampleTripleShotSideAngleRadians(1, Number.NaN)) - 15) < 1e-10);
});
