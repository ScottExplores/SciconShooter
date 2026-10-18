import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Real engine and helpers; only browser image decoding is replaced.
globalThis.Image = class { complete = true; naturalWidth = 1; naturalHeight = 1; };
const bundle = await build({
  stdin: { contents: `export { GameEngine } from './services/gameLogic';
    export { createCombatLabStats } from './services/combatLab';
    export { DEFAULT_GAME_CAMPAIGN } from './services/levelConfig';
    export { getMissionRewardCollectionSeconds } from './services/gameplay/missionRewardWindow';`,
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' }
});
const { GameEngine, createCombatLabStats, DEFAULT_GAME_CAMPAIGN, getMissionRewardCollectionSeconds } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const fixture = () => {
  const campaign = structuredClone(DEFAULT_GAME_CAMPAIGN);
  const level = campaign.levels.find(level => level.campaignProgression?.missionRole === 'major-boss');
  const finale = level.waves.at(-1);
  finale.delayAfterSeconds = 0;
  const engine = new GameEngine(createCombatLabStats(), {
    campaign, initialLevelId: level.id, initialWaveId: finale.id,
    audioEnabled: false, preloadCanvasAssets: false, randomSeed: 'G-reward-window'
  });
  engine.init(390, 844);
  engine.entities = [];
  engine.introFlightFrames = 0;
  return engine;
};

test('zero authored delay still gives a major-boss finale 300 movable collection ticks', () => {
  const engine = fixture();
  engine.beginStageCompletion('CLEAR', '#ffffff');
  assert.equal(engine.stageRewardCollectionDuration, 300);
  assert.equal(engine.stageRewardCollectionFrames, 300);
  assert.equal(engine.waveDepartureFrames, 0);
  const previousX = engine.player.x;
  engine.keys.ArrowRight = true;
  engine.updateStageRewardCollection();
  assert.ok(engine.player.x > previousX, 'collection keeps ordinary steering');
  assert.equal(engine.stageRewardCollectionFrames, 299);
});

test('regular clear-sweep and longer authored reward windows keep their own durations', () => {
  for (const [authoredSeconds, liveCoins, majorBossFinale, expected] of [
    [0, false, false, 0], [1, true, false, 2.5], [4, true, false, 4],
    [0, false, true, 5], [8, true, true, 8], [NaN, true, false, 2.5]
  ]) assert.equal(getMissionRewardCollectionSeconds({ authoredSeconds, liveCoins, majorBossFinale }), expected);
});

test('manual collection and takeoff banking cannot credit the same boss coin twice', () => {
  const engine = fixture();
  const coin = engine.createEntity('COIN', engine.player.x, engine.player.y);
  coin.bossRewardWave = engine.wave;
  engine.entities.push(coin);
  const before = { coins: engine.stats.coins, totalCoins: engine.stats.totalCoins, score: engine.stats.score };
  assert.equal(engine.creditCoinValue(coin), true);
  assert.equal(engine.creditCoinValue(coin), false);
  engine.bankDepartingBossCoins();
  engine.bankDepartingBossCoins();
  assert.equal(engine.stats.coins, before.coins + 1);
  assert.equal(engine.stats.totalCoins, before.totalCoins + 1);
  assert.equal(engine.stats.score, before.score + 1);
});
