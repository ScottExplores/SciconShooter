const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileRunStartingLives = () => {
  const filename = path.join(root, 'services', 'runStartingLives.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const moduleBox = { exports: {} };
  const localRequire = (request) => {
    if (request === './squadProgression') {
      return { CAMPAIGN_BASE_STARTING_LIVES: 3, CAMPAIGN_MAX_STARTING_LIVES: 10 };
    }
    if (request === './weeklyRunGenerator') return { WEEKLY_RUN_STARTING_LIVES: 10 };
    return require(request);
  };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, exports: moduleBox.exports, require: localRequire },
    { filename }
  );
  return moduleBox.exports;
};

test('Campaign heart upgrades reach ten while Weekly Run keeps its independent capacity', () => {
  const { resolveRunStartingLives } = compileRunStartingLives();

  assert.equal(resolveRunStartingLives({
    weeklyRun: false,
    startingHeartLevel: 0
  }), 3);
  assert.equal(resolveRunStartingLives({
    weeklyRun: false,
    startingHeartLevel: 7
  }), 10);
  assert.equal(resolveRunStartingLives({
    weeklyRun: false,
    startingHeartLevel: 99
  }), 10);
  assert.equal(resolveRunStartingLives({
    weeklyRun: true,
    startingHeartLevel: 0
  }), 10);
  assert.equal(resolveRunStartingLives({
    weeklyRun: true,
    startingHeartLevel: 7,
    carriedWeeklyLives: 4
  }), 4);
});
