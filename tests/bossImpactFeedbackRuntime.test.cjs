const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const source = fs.readFileSync(
    path.join(
      root,
      'services',
      'gameplay',
      'bosses',
      'BossImpactFeedbackRuntime.ts'
    ),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, exports: moduleBox.exports, Math, Number }
  );
  return { source, ...moduleBox.exports };
};

test('routine fire never triggers whole-boss recoil but a large hit does', () => {
  const runtime = loadRuntime();

  assert.equal(runtime.getBossSignificantDamageThreshold(6_800), 13.6);
  assert.equal(runtime.isBossHullImpactSignificant(1, 6_800), false);
  assert.equal(runtime.isBossHullImpactSignificant(13, 6_800), false);
  assert.equal(runtime.isBossHullImpactSignificant(14, 6_800), true);
  assert.equal(runtime.isBossHullImpactSignificant(12, 3_200), true);
  assert.equal(runtime.getBossHullImpactStrength(100, 6_800), 1.5);
  assert.doesNotMatch(runtime.source, /Math\.random|Date\.|performance\./);
});
