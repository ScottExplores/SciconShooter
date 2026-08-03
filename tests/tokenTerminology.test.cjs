const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const loadTokenTerminology = () => {
  const compiled = ts.transpileModule(read('services/tokenTerminology.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  });
  const module = { exports: {} };
  new Function('module', 'exports', compiled.outputText)(module, module.exports);
  return module.exports;
};

test('golden off-chain currency copy uses singular and plural Token terminology', () => {
  const { formatTokenAmount, toTokenTerminology } = loadTokenTerminology();

  assert.equal(formatTokenAmount(1), '1 Token');
  assert.equal(formatTokenAmount(2), '2 Tokens');
  assert.equal(toTokenTerminology('Collect 1 coin'), 'Collect 1 Token');
  assert.equal(toTokenTerminology('50 RESEARCH COINS'), '50 Tokens');
});

test('safe reward, Campaign, HUD, and Boss Archive surfaces avoid legacy coin wording', () => {
  const sources = [
    read('components/RewardCenter.tsx'),
    read('components/CampaignBranchResultOverlay.tsx'),
    read('components/CampaignMap.tsx'),
    read('components/UIOverlay.tsx'),
    read('components/WaveVictoryOverlay.tsx'),
    read('services/bossArchive.ts'),
    read('services/campaignBranchRuntime.ts'),
    read('services/rewardProgression.ts')
  ].join('\n');

  assert.doesNotMatch(sources, /Research coins added|research coins|>Coins<| coins collected this match|Total coins earned|No duplicate coins/i);
  assert.match(sources, /Tokens added/);
  assert.match(sources, /Tokens collected this match|formatTokenAmount\(stats\.coins\)/);
  assert.match(sources, /Total Tokens earned/);
});
