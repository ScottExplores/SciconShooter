const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadSpecialAttacks = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'campaignEnemySpecialAttacks.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
    module,
    require,
    Object
  });
  return module.exports;
};

test('authored enemy role special attacks override legacy sprite archetypes', () => {
  const { resolveCampaignEnemySpecialAttack } = loadSpecialAttacks();

  assert.equal(resolveCampaignEnemySpecialAttack('ring-burst', 'laser-hunter'), 'ring-burst');
  assert.equal(resolveCampaignEnemySpecialAttack('mine-fan', 'ring-sentinel'), 'mine-fan');
  assert.equal(resolveCampaignEnemySpecialAttack('lane-laser', ''), 'lane-laser');
});

test('legacy enemy sprite archetypes retain their established specialist attacks', () => {
  const { resolveCampaignEnemySpecialAttack } = loadSpecialAttacks();

  assert.equal(resolveCampaignEnemySpecialAttack(undefined, 'laser-hunter'), 'lane-laser');
  assert.equal(resolveCampaignEnemySpecialAttack(undefined, 'wall-sniper-right'), 'lane-laser');
  assert.equal(resolveCampaignEnemySpecialAttack(undefined, 'crescent-minelayer'), 'mine-fan');
  assert.equal(resolveCampaignEnemySpecialAttack(undefined, 'dna-conductor'), 'ring-burst');
  assert.equal(resolveCampaignEnemySpecialAttack(undefined, 'unmapped-hull'), undefined);
});

test('authored specials own their fire scheduler and synchronize charge/fire art', () => {
  const gameLogicSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

  assert.match(
    gameLogicSource,
    /candidate\.campaignSpecialAttack !== undefined/,
    'authored specialists must be excluded from the standard fire scheduler'
  );
  assert.match(
    gameLogicSource,
    /source\.campaignSpecialAttack === undefined[\s\S]*source\.isElite/,
    'authored specials must not depend on a redundant elite flag to execute'
  );
  assert.match(gameLogicSource, /source\.isCharging = true;/);
  assert.match(gameLogicSource, /source\.campaignLastFireFrame = this\.frameCount;/);
  assert.match(rendererSource, /scicon-advanced-enemy-pack-v1/);
  assert.match(rendererSource, /entity\.isCharging/);
  assert.match(rendererSource, /entity\.campaignLastFireFrame/);
});
