const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const source = read('services', 'bossCoinBurst.ts');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require
});

const {
  BOSS_COIN_BURST_FRAMES,
  MAX_ACTIVE_BOSS_REWARD_COINS,
  getBossCoinBurstCount,
  getBossCoinBurstKinematics
} = moduleBox.exports;

const gameLogicSource = read('services', 'gameLogic.ts');
const refreshHelperStart = gameLogicSource.indexOf('export const refreshWaveVictoryRewardMetrics =');
const refreshHelperEnd = gameLogicSource.indexOf('const createPresentDropDestroyedCounts', refreshHelperStart);
assert.ok(refreshHelperStart >= 0 && refreshHelperEnd > refreshHelperStart);
const refreshHelperCompiled = ts.transpileModule(
  gameLogicSource.slice(refreshHelperStart, refreshHelperEnd),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }
).outputText;
const refreshHelperModule = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${refreshHelperCompiled} })(module.exports, require, module);`,
  { module: refreshHelperModule, require }
);
const { refreshWaveVictoryRewardMetrics } = refreshHelperModule.exports;

test('boss coin rewards follow one bounded progression curve', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 9].map((wave) => getBossCoinBurstCount('mini-boss', wave)),
    [12, 14, 16, 18, 20, 20]
  );
  assert.deepEqual(
    [1, 2, 3, 4, 5, 7, 12].map((wave) => getBossCoinBurstCount('main-boss', wave)),
    [50, 55, 60, 65, 70, 80, 80]
  );
  assert.equal(MAX_ACTIVE_BOSS_REWARD_COINS, 128);
  assert.ok(BOSS_COIN_BURST_FRAMES >= 150, 'the ballistic shower should remain visible through a boss departure');
});

test('boss coin burst trajectories are deterministic upward fans with gravity', () => {
  const first = Array.from({ length: 50 }, (_, index) => (
    getBossCoinBurstKinematics(index, 50, 1, 23)
  ));
  const second = Array.from({ length: 50 }, (_, index) => (
    getBossCoinBurstKinematics(index, 50, 1, 23)
  ));

  assert.deepEqual(first, second);
  assert.ok(first.every((coin) => coin.vy < 0), 'every boss coin should initially erupt upward');
  assert.ok(first.every((coin) => coin.gravity > 0), 'every boss coin should arc back down under gravity');
  assert.ok(first.every((coin) => coin.bounces === 1), 'boss coins should get one readable bounce');
  assert.ok(first.some((coin) => coin.vx < -4));
  assert.ok(first.some((coin) => coin.vx > 4));
  assert.ok(new Set(first.map((coin) => coin.offsetX.toFixed(3))).size > 40, 'the shower should not stack into one line');
});

test('manual reward-window collection refreshes final totals without changing attempt identity', () => {
  const capturedSummary = {
    id: 'mission-05-attempt-1',
    campaignId: 'campaign-main',
    campaignRevision: 7,
    levelId: 'mission-05',
    waveId: 'mission-05-wave-03',
    waveNumber: 3,
    waveTotal: 3,
    stageComplete: true,
    bossEncounterId: 'mission-05-boss',
    stage: 5,
    stageName: 'Bastion Protocol',
    finalWaveName: 'Supply Lock',
    scoreEarned: 20,
    totalScore: 120,
    enemiesDefeated: 9,
    coinsCollected: 0,
    waveCoinsCollected: 0,
    damageTaken: 2,
    elapsedSeconds: 41.25,
    remainingLives: 8,
    nextLevelId: 'mission-06',
    nextWaveId: 'mission-06-wave-01',
    nextWaveNumber: 1,
    nextStage: 6,
    hasNextStage: true,
    campaignComplete: false,
    presentDrop: {
      destroyed: { standard: 18, armored: 4, fast: 11, golden: 1 },
      destroyedTotal: 34,
      coinValueSpawned: 257
    }
  };

  // Every post-boss coin was picked up by the player, so takeoff has no
  // leftover coin entity to auto-bank. Current totals are the authority.
  const refreshed = refreshWaveVictoryRewardMetrics(
    capturedSummary,
    { score: 127, totalCoins: 14 },
    100,
    10,
    12
  );

  assert.equal(refreshed.scoreEarned, 27);
  assert.equal(refreshed.totalScore, 127);
  assert.equal(refreshed.coinsCollected, 4);
  assert.equal(refreshed.waveCoinsCollected, 2);

  const mutableMetrics = new Set([
    'scoreEarned',
    'totalScore',
    'coinsCollected',
    'waveCoinsCollected'
  ]);
  for (const [key, value] of Object.entries(capturedSummary)) {
    if (!mutableMetrics.has(key)) assert.deepEqual(refreshed[key], value, `${key} must remain immutable`);
  }

  assert.deepEqual(
    refreshWaveVictoryRewardMetrics(refreshed, { score: 127, totalCoins: 14 }, 100, 10, 12),
    refreshed,
    'repeating completion refresh must not duplicate score or coin rewards'
  );
});

test('gameplay keeps boss coins collectible through rewards, then banks and clears them for takeoff', () => {
  const engine = read('services', 'gameLogic.ts');
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const passiveStart = engine.indexOf('updatePassiveEntities()');
  const passiveEnd = engine.indexOf('updateIntroFlight()', passiveStart);
  const passiveSource = engine.slice(passiveStart, passiveEnd);
  const activeStart = engine.indexOf('update(cinematicPause: boolean = false)');
  const activeEnd = engine.indexOf('getGunPodOffsets()', activeStart);
  const activeSource = engine.slice(activeStart, activeEnd);
  const coinUpdateStart = engine.indexOf('private updateCoinEntity(coin: Entity)');
  const coinUpdateEnd = engine.indexOf('private collectCoinIfReachedPlayer', coinUpdateStart);
  const coinUpdateSource = engine.slice(coinUpdateStart, coinUpdateEnd);
  const cleanupStart = engine.indexOf('private clearStageBoundaryDebris(');
  const cleanupEnd = engine.indexOf('getPlayerHomePosition()', cleanupStart);
  const cleanupSource = engine.slice(cleanupStart, cleanupEnd);
  const takeoffStart = engine.indexOf('beginStageTakeoff()');
  const takeoffEnd = engine.indexOf('getPlayerMovementBounds()', takeoffStart);
  const takeoffSource = engine.slice(takeoffStart, takeoffEnd);

  assert.match(engine, /spawnBossCoinBurst\(target: Entity\)/);
  assert.match(engine, /target\.type === EntityType\.BOSS \|\| target\.type === EntityType\.MINI_BOSS[\s\S]{0,100}spawnBossCoinBurst\(target\)/);
  assert.match(activeSource, /if \(this\.waveDepartureFrames > 0\)[\s\S]{0,180}this\.updatePassiveEntities\(\)/);
  assert.match(passiveSource, /entity\.type === EntityType\.COIN[\s\S]{0,100}updateCoinEntity\(entity\)/);
  assert.match(activeSource, /e\.type === EntityType\.COIN[\s\S]{0,100}updateCoinEntity\(e\);[\s\S]{0,40}return;/);
  assert.equal(
    [...engine.matchAll(/this\.updateCoinEntity\((?:entity|e)\)/g)].length,
    2,
    'coins should have one passive path and one mutually exclusive active path'
  );
  assert.equal(
    [...coinUpdateSource.matchAll(/coin\.x \+= coin\.vx/g)].length,
    1,
    'the shared coin path must advance horizontal motion once per fixed step'
  );
  assert.match(coinUpdateSource, /coin\.vy \+= coin\.coinGravity/);
  assert.match(engine, /coin\.bossRewardWave = this\.wave/);
  assert.match(engine, /bankDepartingBossCoins\(\)[\s\S]*?coin\.bossRewardWave !== this\.wave[\s\S]*?this\.creditCoinValue\(coin\)/);
  assert.match(cleanupSource, /if \(autoBankBossCoins\) this\.bankDepartingBossCoins\(\)/);
  assert.match(engine, /STAGE_BOUNDARY_CLEAR_ENTITY_TYPES = Object\.freeze\([\s\S]*?'COIN'/);
  assert.match(cleanupSource, /shouldClearStageBoundaryEntityType\(entity\.type, preserveRewardWindow\)[\s\S]*?entity\.markedForDeletion = true/);
  assert.match(engine, /beginStageCompletion\(label: string, color: string\) \{[\s\S]*?this\.clearStageBoundaryDebris\(false, true, false\)/);
  assert.match(takeoffSource, /this\.clearStageBoundaryDebris\(true\)/);
  assert.match(engine, /if \(this\.waveDepartureFrames <= 0\) \{\s*this\.clearStageBoundaryDebris\(false\)/);
  assert.match(engine, /creditCoinValue\(coin: Entity\)[\s\S]*?if \(coin\.coinValueCredited\) return false;[\s\S]*?this\.stats\.totalCoins \+= creditedValue/);
  assert.match(engine, /coin\.coinValueCredited = true;[\s\S]*?const creditedValue = this\.revampFlight\?\.credit\(\) \?\? 1/);
  assert.match(engine, /collectCoinIfReachedPlayer\(coin: Entity\)[\s\S]*?const credited = this\.creditCoinValue\(coin\)/);
  assert.match(engine, /if \(credited && this\.waveTransitionPending\) this\.refreshWaveVictorySummaryMetrics\(\)/);
  assert.match(engine, /refreshWaveVictorySummaryMetrics\(\)[\s\S]{0,420}refreshWaveVictoryRewardMetrics\(/);
  assert.match(takeoffSource, /this\.refreshWaveVictorySummaryMetrics\(\)/);
  assert.match(cleanupSource, /this\.compactEntities\(\)/, 'takeoff must not leave reward coins frozen offscreen');
  assert.match(renderer, /EntityType\.COIN[\s\S]{0,500}coinBurstFrames/);
  assert.match(renderer, /COMBAT_LIGHT_COIN_COLOR = 0xfacc15/);
  assert.match(renderer, /entity\.type !== EntityType\.COIN[\s\S]{0,900}COMBAT_LIGHT_COIN_COLOR/);
  assert.match(renderer, /RSC_TOKEN_FLIP_FRAMES/);
});
