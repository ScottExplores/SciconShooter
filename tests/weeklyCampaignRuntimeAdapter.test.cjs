const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const compileRuntimeAdapter = () => {
  const source = read('services/weeklyCampaignRuntimeAdapter.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', compiled)(module.exports, require, module);
  return module.exports;
};

const { buildWeeklyCampaignRuntimeOutcome } = compileRuntimeAdapter();

test('Weekly score events preserve runtime-observed kill categories and withhold accuracy', () => {
  const outcome = buildWeeklyCampaignRuntimeOutcome({
    regularEnemyKills: 41,
    eliteKills: 7,
    waveTotal: 4,
    miniBossKills: 2,
    majorBossKills: 1,
    damageTaken: 3,
    remainingLives: 2,
    elapsedSeconds: 73.418,
    // Runtime accuracy is intentionally unsupported until real shots/hits exist.
    accuracy: 0.99
  }, {
    parTimeSeconds: 80,
    performanceStars: 3
  });

  assert.deepEqual(outcome, {
    regularEnemyKills: 41,
    eliteKills: 7,
    wavesCleared: 4,
    miniBossKills: 2,
    majorBossKills: 1,
    missionCompleted: true,
    damageTaken: 3,
    livesRemaining: 2,
    accuracy: null,
    elapsedMs: 73_418,
    parTimeMs: 80_000,
    performanceStars: 3
  });
});

test('Weekly score event normalization cannot mint negative or non-finite telemetry', () => {
  const outcome = buildWeeklyCampaignRuntimeOutcome({
    regularEnemyKills: -3,
    eliteKills: Number.NaN,
    waveTotal: 2.9,
    miniBossKills: -1,
    majorBossKills: Number.POSITIVE_INFINITY,
    damageTaken: -4,
    remainingLives: 1.8,
    elapsedSeconds: Number.NaN
  }, {
    parTimeSeconds: 0,
    performanceStars: 3
  });

  assert.equal(outcome.regularEnemyKills, 0);
  assert.equal(outcome.eliteKills, 0);
  assert.equal(outcome.wavesCleared, 2);
  assert.equal(outcome.miniBossKills, 0);
  assert.equal(outcome.majorBossKills, 0);
  assert.equal(outcome.damageTaken, 0);
  assert.equal(outcome.livesRemaining, 1);
  assert.equal(outcome.elapsedMs, 0);
  assert.equal(outcome.parTimeMs, null);
  assert.equal(outcome.accuracy, null);
});

test('engine, App, and balance simulator share the observed Weekly outcome boundary', () => {
  const engineSource = read('services/gameLogic.ts');
  const appSource = read('App.tsx');
  const simulatorSource = read('tools/simulate-campaign-nonboss-balance.mjs');

  assert.match(engineSource, /regularEnemyKills:\s*number/);
  assert.match(engineSource, /eliteKills:\s*number/);
  assert.match(engineSource, /miniBossKills:\s*number/);
  assert.match(engineSource, /majorBossKills:\s*number/);
  assert.match(engineSource, /if \(target\.isElite\) \{\s*this\.waveVictoryKillCounts\.eliteKills\+\+/);
  assert.match(engineSource, /creditedMiniBossEncounterIds/);
  assert.match(engineSource, /creditedMajorBossEncounterIds/);
  assert.match(engineSource, /\.\.\.observedKills/);

  const weeklyHandlerStart = appSource.indexOf("if (activeRunMode === 'weekly-streak') {");
  const weeklyHandlerEnd = appSource.indexOf(
    "if (activeRunMode !== 'campaign' && activeRunMode !== 'campaign-replay') return;",
    weeklyHandlerStart
  );
  const weeklyHandler = appSource.slice(weeklyHandlerStart, weeklyHandlerEnd);
  assert.match(weeklyHandler, /buildWeeklyCampaignRuntimeOutcome\(summary/);
  assert.doesNotMatch(weeklyHandler, /eliteKills:\s*0/);
  assert.doesNotMatch(weeklyHandler, /summary\.enemiesDefeated\s*-\s*node/);

  assert.match(simulatorSource, /'services\/weeklyCampaignRuntimeAdapter\.ts'/);
  assert.match(simulatorSource, /vite\.ssrLoadModule\('\/services\/weeklyCampaignRuntimeAdapter\.ts'\)/);
  assert.match(simulatorSource, /buildWeeklyCampaignRuntimeOutcome\(summary/);
  assert.doesNotMatch(simulatorSource, /eliteKills:\s*0/);
});
