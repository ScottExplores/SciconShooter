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

test('gameplay keeps boss coins collectible during the scripted departure', () => {
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
  const preserveStart = engine.indexOf('keepEntitiesForNextWave()');
  const preserveEnd = engine.indexOf('getPlayerHomePosition()', preserveStart);
  const preserveSource = engine.slice(preserveStart, preserveEnd);

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
  assert.match(engine, /if \(this\.waveDepartureFrames <= 0\) \{\s*this\.bankDepartingBossCoins\(\);/);
  assert.match(engine, /creditCoinValue\(coin: Entity\)[\s\S]*?if \(coin\.coinValueCredited\) return false;[\s\S]*?this\.stats\.totalCoins\+\+/);
  assert.match(engine, /collectCoinIfReachedPlayer\(coin: Entity\)[\s\S]*?const credited = this\.creditCoinValue\(coin\)/);
  assert.match(engine, /waveTransitionPending && this\.waveVictorySummary[\s\S]{0,220}buildWaveVictorySummary\(\)/);
  assert.match(preserveSource, /entity\.type === EntityType\.COIN/, 'uncollected shower coins should carry into the next wave');
  assert.match(renderer, /EntityType\.COIN[\s\S]{0,500}coinBurstFrames[\s\S]{0,300}#facc15/);
  assert.match(renderer, /RSC_TOKEN_FLIP_FRAMES/);
});
