import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the shared module instance used by the real engine and public death API.
globalThis.Image ??= class { complete = true; naturalWidth = 1; naturalHeight = 1; };
const bundle = await build({
  stdin: { contents: `export { GameEngine } from './services/gameLogic';
    export { createCombatLabStats } from './services/combatLab';
    export { DEFAULT_GAME_CAMPAIGN } from './services/levelConfig';
    export { EntityType } from './types';
    export * from './services/revamp/vfx/BossCompletionGate';
    export * from './services/revamp/vfx/BossDeathSequence';`,
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env': '{}' }
});
const { GameEngine, createCombatLabStats, DEFAULT_GAME_CAMPAIGN, EntityType,
  registerBossDeath, finishBossDeath, deferBossCompletion, takeBossCompletion,
  hasDeferredBossCompletion, playBossDeathSequence, consumeBossDeathSequences,
  BOSS_COMPLETION_BEAT_MS, BOSS_COMPLETION_CAP_MS } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const simpleEngine = () => ({ frameCount: 0, feel: { resetGeneration: 0 } });
const hull = id => ({ id, x: 80, y: 120, width: 160, height: 120 });
function withClock(run) {
  let now = 0;
  const previous = Object.getOwnPropertyDescriptor(performance, 'now');
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  try { return run(value => { now = value; }); }
  finally {
    if (previous) Object.defineProperty(performance, 'now', previous);
    else delete performance.now;
  }
}
function fixture({ boss = true, continuous = false } = {}) {
  const campaign = structuredClone(DEFAULT_GAME_CAMPAIGN);
  const level = campaign.levels.find(level => level.campaignProgression?.missionRole === 'major-boss');
  const finale = level.waves.at(-1);
  finale.delayAfterSeconds = 0;
  if (!boss) finale.events = [];
  const engine = new GameEngine(createCombatLabStats(), {
    campaign, initialLevelId: level.id, initialWaveId: finale.id,
    audioEnabled: false, preloadCanvasAssets: false, randomSeed: 'T-completion',
    continuousStageBoundaries: continuous
  });
  engine.init(390, 844);
  engine.entities = [];
  engine.introFlightFrames = 0;
  return engine;
}
const hasBanner = engine => engine.entities.some(entity => entity.text === 'MISSION COMPLETE!');

test('completion waits for the actual finish receipt and a 300 ms beat, then releases only once', () => {
  const engine = simpleEngine(), request = {};
  registerBossDeath(engine, request, 100);
  assert.equal(deferBossCompletion(engine, 'CLEAR', '#fff', 100), true);
  assert.equal(takeBossCompletion(engine, 2500), undefined, 'nominal hull duration alone cannot release an unfinished tail');
  finishBossDeath(engine, request, 2600);
  finishBossDeath(engine, request, 2700);
  assert.equal(takeBossCompletion(engine, 2600 + BOSS_COMPLETION_BEAT_MS - 1), undefined);
  assert.deepEqual(takeBossCompletion(engine, 2600 + BOSS_COMPLETION_BEAT_MS), { label: 'CLEAR', color: '#fff' });
  assert.equal(takeBossCompletion(engine, 4000), undefined);
  assert.equal(hasDeferredBossCompletion(engine), false);
});

test('paired mini-bosses wait for the final member, while an earlier finished sequence adds no delay', () => {
  const engine = simpleEngine(), first = {}, second = {};
  registerBossDeath(engine, first, 0);
  registerBossDeath(engine, second, 200);
  finishBossDeath(engine, first, 1800);
  deferBossCompletion(engine, 'CLEAR', '#fff', 1900);
  assert.equal(takeBossCompletion(engine, 2200), undefined);
  finishBossDeath(engine, second, 2300);
  assert.equal(takeBossCompletion(engine, 2599), undefined);
  assert.ok(takeBossCompletion(engine, 2600));
  assert.equal(deferBossCompletion(engine, 'LATER', '#fff', 2800), false);
});

test('missing or interrupted presenter is capped at four wall-clock seconds or 240 simulation ticks', () => {
  for (const useFrames of [false, true]) {
    const engine = simpleEngine(), request = {};
    registerBossDeath(engine, request, 50);
    deferBossCompletion(engine, 'CLEAR', '#fff', 50);
    if (useFrames) engine.frameCount = 239;
    assert.equal(takeBossCompletion(engine, useFrames ? 50 : 50 + BOSS_COMPLETION_CAP_MS - 1), undefined);
    if (useFrames) engine.frameCount++;
    assert.ok(takeBossCompletion(engine, useFrames ? 50 : 50 + BOSS_COMPLETION_CAP_MS));
  }
});

test('reset cancels previous completion ownership and a late old receipt cannot finish a new run', () => {
  const engine = simpleEngine(), old = {}, current = {};
  registerBossDeath(engine, old, 0);
  deferBossCompletion(engine, 'OLD', '#fff', 0);
  engine.feel.resetGeneration++;
  assert.equal(hasDeferredBossCompletion(engine), false);
  assert.equal(takeBossCompletion(engine, 500), undefined);
  registerBossDeath(engine, current, 500);
  deferBossCompletion(engine, 'NEW', '#fff', 500);
  finishBossDeath(engine, old, 500);
  assert.equal(takeBossCompletion(engine, 1000), undefined);
  finishBossDeath(engine, current, 1000);
  assert.deepEqual(takeBossCompletion(engine, 1300), { label: 'NEW', color: '#fff' });
});

test('real major-boss completion preserves reward collection and metrics while delaying both clear receipts', () => withClock(setNow => {
  const engine = fixture();
  playBossDeathSequence(engine, hull('major'));
  const [request] = consumeBossDeathSequences(engine);
  engine.beginStageCompletion('MISSION COMPLETE!', '#67e8f9');
  assert.equal(engine.stageRewardCollectionFrames, 300, 'existing boss reward window is unchanged');
  assert.ok(engine.waveVictorySummary, 'authoritative completion exists immediately');
  const summary = structuredClone(engine.waveVictorySummary);
  assert.equal(hasBanner(engine), false);
  assert.equal(engine.feel.events.some(event => event.type === 'perfect-wave'), false);
  setNow(2500);
  finishBossDeath(engine, request);
  setNow(2799);
  engine.updateStageRewardCollection();
  assert.equal(hasBanner(engine), false);
  assert.equal(engine.waveDepartureFrames, 0);
  setNow(2800);
  engine.updateStageRewardCollection();
  assert.equal(hasBanner(engine), true);
  assert.deepEqual(engine.waveVictorySummary, summary);
  assert.equal(engine.feel.events.filter(event => event.type === 'perfect-wave').length, 1);
  engine.updateStageRewardCollection();
  assert.equal(engine.entities.filter(entity => entity.text === 'MISSION COMPLETE!').length, 1);
}));

test('zero-window mini finale remains protected with frozen combat clocks and no extra kill scoring', () => withClock(setNow => {
  const engine = fixture({ boss: false });
  const hostile = engine.createEntity(EntityType.PROJECTILE, engine.player.x, engine.player.y);
  hostile.isPlayerShot = false;
  const enemy = engine.createEntity(EntityType.ENEMY_DRONE, engine.player.x, engine.player.y);
  const shot = engine.createEntity(EntityType.PROJECTILE, engine.player.x, engine.player.y);
  shot.isPlayerShot = true;
  engine.entities.push(hostile, enemy, shot);
  playBossDeathSequence(engine, hull('mini'), true);
  const [request] = consumeBossDeathSequences(engine);
  const before = { lives: engine.lives, score: engine.stats.score, kills: engine.stats.enemiesDefeated,
    missionFrames: engine.waveFlightFrames, waveFrames: engine.tacticalWaveFlightFrames,
    progressFrames: engine.waveProgressFrames };
  engine.beginStageCompletion('MISSION COMPLETE!', '#fff');
  assert.equal(engine.stageRewardCollectionDuration, 0);
  assert.equal(engine.stageRewardCollectionFrames, 1);
  assert.ok(hostile.markedForDeletion, 'hostile rounds are cleared as soon as the boss barrier begins');
  for (let frame = 1; frame <= 120; frame++) {
    setNow(frame * 1000 / 60);
    engine.update();
    assert.equal(engine.waveDepartureFrames, 0);
    assert.equal(engine.waveVictoryReady, false);
    assert.equal(hasBanner(engine), false);
    assert.ok(engine.invincibleTimer > 0, 'player remains explicitly invulnerable while the barrier is held');
    assert.equal(engine.entities.some(entity => !entity.markedForDeletion && !entity.isPlayerShot
      && [EntityType.PROJECTILE, EntityType.MISSILE].includes(entity.type)), false);
  }
  assert.deepEqual({ lives: engine.lives, score: engine.stats.score, kills: engine.stats.enemiesDefeated,
    missionFrames: engine.waveFlightFrames, waveFrames: engine.tacticalWaveFlightFrames,
    progressFrames: engine.waveProgressFrames }, before);
  assert.ok(hostile.markedForDeletion, 'enemy bullets are cleared at the boundary');
  setNow(2000); finishBossDeath(engine, request);
  setNow(2299); engine.update();
  assert.equal(engine.waveDepartureFrames, 0);
  setNow(2300); engine.update();
  assert.equal(hasBanner(engine), true);
  assert.ok(engine.waveDepartureFrames > 0);
}));

test('real zero-window finale cannot soft-lock if presentation never reports completion', () => withClock(() => {
  const engine = fixture({ boss: false });
  playBossDeathSequence(engine, hull('missing-presenter'), true);
  engine.beginStageCompletion('MISSION COMPLETE!', '#fff');
  for (let frame = 0; frame < 239; frame++) engine.update();
  assert.equal(hasBanner(engine), false);
  assert.equal(engine.waveDepartureFrames, 0);
  engine.update();
  assert.equal(hasBanner(engine), true);
  assert.ok(engine.waveDepartureFrames > 0);
}));

test('non-boss completion retains its immediate banner and zero-delay takeoff', () => {
  const engine = fixture({ boss: false });
  const labels = [];
  const spawn = engine.spawnFloatingText.bind(engine);
  engine.spawnFloatingText = (...args) => { labels.push(args[2]); return spawn(...args); };
  engine.beginStageCompletion('MISSION COMPLETE!', '#fff');
  assert.ok(labels.includes('MISSION COMPLETE!'), 'existing synchronous banner call is unchanged');
  assert.equal(hasDeferredBossCompletion(engine), false);
  assert.equal(engine.stageRewardCollectionFrames, 0);
  assert.ok(engine.waveDepartureFrames > 0);
});

test('Weekly continuous boundary never waits for a registered boss presentation', () => withClock(() => {
  const control = fixture({ continuous: true }), engine = fixture({ continuous: true });
  playBossDeathSequence(engine, hull('weekly'));
  for (const item of [control, engine]) item.beginStageCompletion('MISSION COMPLETE!', '#fff');
  const boundary = item => ({ wave: item.wave, index: item.currentCampaignIndex,
    pending: item.waveTransitionPending, rewards: item.stageRewardCollectionFrames,
    takeoff: item.waveDepartureFrames, victory: item.waveVictoryReady,
    flight: item.waveFlightFrames, progress: item.waveProgressFrames, score: item.stats.score });
  assert.deepEqual(boundary(engine), boundary(control));
  assert.equal(hasDeferredBossCompletion(engine), false);
  assert.equal(hasBanner(engine), false);
  assert.equal(engine.stageRewardCollectionFrames, 0);
  assert.equal(engine.waveDepartureFrames, 0);
}));

test('flask credit is immediate while its text waits for the death barrier', () => withClock(setNow => {
  const engine = fixture();
  playBossDeathSequence(engine, hull('flask-reward'));
  const [request] = consumeBossDeathSequences(engine);
  engine.beginStageCompletion('MISSION COMPLETE!', '#fff');
  engine.stats.bombCharge = engine.stats.bombChargeMax - 1;
  engine.addFlaskChargeFromCoin();
  const credited = engine.stats.bombCharge;
  assert.ok(credited >= engine.stats.bombChargeMax);
  assert.equal(engine.entities.some(entity => entity.text?.startsWith('FLASK +')), false);
  finishBossDeath(engine, request, 1800);
  setNow(2099); engine.updateStageRewardCollection();
  assert.equal(engine.entities.some(entity => entity.text?.startsWith('FLASK +')), false);
  setNow(2100); engine.updateStageRewardCollection();
  assert.equal(engine.entities.filter(entity => entity.text === 'FLASK +1').length, 1);
  assert.equal(engine.stats.bombCharge, credited, 'notification replay cannot grant a second reward');
}));
