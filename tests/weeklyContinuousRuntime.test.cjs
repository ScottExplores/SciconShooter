const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const authoredCampaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);

class TestImage {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = '';
  src = '';
}

global.Image = TestImage;

const loadModule = (entryPoint) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const { GameEngine } = loadModule(path.join('services', 'gameLogic.ts'));
const weeklyGenerator = loadModule(path.join('services', 'weeklyRunGenerator.ts'));

const createStats = () => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: 100,
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 960,
  lives: 10,
  repairsCount: 0,
  upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

test('Weekly Paywall Wall awards one mini-boss credit when its final mobile segment is destroyed', () => {
  const weekly = weeklyGenerator.buildWeeklyRunCampaign('2026-08-16', authoredCampaign, 4);
  const wallLevel = weekly.levels[1];
  const wallWave = wallLevel.waves.at(-1);
  const wallEvent = wallWave.events.find((event) => (
    event.kind === 'boss' && event.bossId === 'paywall-wall'
  ));
  assert.ok(wallEvent, 'the fixed-week second depth must contain Paywall Wall');

  const engine = new GameEngine(createStats(), {
    campaign: weekly,
    initialLevelId: wallLevel.id,
    initialWaveId: wallWave.id,
    refillLivesAtMissionBoundary: false,
    continuousStageBoundaries: true,
    audioEnabled: false,
    randomSeed: 'weekly-paywall-counter-test'
  });
  engine.init(390, 700);
  engine.entities = [];
  engine.spawnWallBoss(wallEvent);

  const segments = engine.entities.filter((entity) => (
    entity.type === 'ENEMY_INVADER'
    && entity.sourceEventId === wallEvent.id
    && entity.sourceItemId === 'paywall-wall'
  ));
  assert.equal(segments.length, 6, 'the mobile depth-two wall has six destructible segments');

  segments.forEach((segment, index) => {
    segment.hp = 0;
    engine.handleEnemyDestroyed(segment);
    assert.equal(
      engine.waveVictoryKillCounts.miniBossKills,
      index === segments.length - 1 ? 1 : 0,
      'only the final destroyed segment may complete the boss encounter'
    );
  });

  assert.equal(engine.waveVictoryKillCounts.regularEnemyKills, 6);
  assert.equal(engine.waveVictoryKillCounts.majorBossKills, 0);
  engine.handleEnemyDestroyed(segments.at(-1));
  assert.equal(engine.waveVictoryKillCounts.miniBossKills, 1, 'duplicate destruction cannot add credit');
});

test('Weekly Run extends its runway in place and crosses a depth without resetting live combat state', () => {
  const initial = weeklyGenerator.buildWeeklyRunCampaign(
    '2026-W31',
    authoredCampaign,
    weeklyGenerator.WEEKLY_RUN_INITIAL_STAGE_COUNT
  );
  const extended = weeklyGenerator.buildWeeklyRunCampaign(
    '2026-W31',
    authoredCampaign,
    weeklyGenerator.WEEKLY_RUN_INITIAL_STAGE_COUNT + weeklyGenerator.WEEKLY_RUN_STAGE_CHUNK
  );
  const clearedLevel = initial.levels.at(-1);
  const clearedWave = clearedLevel.waves.at(-1);
  const nextLevel = extended.levels[initial.levels.length];
  const nextWave = nextLevel.waves[0];
  const stats = createStats();
  const engine = new GameEngine(stats, {
    campaign: initial,
    initialLevelId: clearedLevel.id,
    initialWaveId: clearedWave.id,
    refillLivesAtMissionBoundary: false,
    continuousStageBoundaries: true,
    audioEnabled: false,
    randomSeed: 'weekly-continuity-test'
  });
  engine.init(390, 700);

  engine.stats.score = 3456;
  engine.stats.coins = 7;
  engine.stats.totalCoins = 19;
  engine.stats.shipAbilityCooldown = 212;
  engine.stats.lives = 6;
  engine.lives = 6;
  engine.missionOverdriveLevel = 3;
  engine.player.x = 123;
  engine.player.y = 456;

  const playerShot = engine.createEntity('PROJECTILE', 44, 210);
  playerShot.isPlayerShot = true;
  const powerup = engine.createEntity('POWERUP', 170, 240);
  engine.entities.push(playerShot, powerup);
  engine.pendingPlayerShots.push({ x: 80, y: 260, vx: 0, vy: -10, damage: 2 });

  engine.beginStageCompletion('MISSION COMPLETE!', '#67e8f9');

  assert.equal(engine.waveVictoryReady, false, 'an endless depth never enters a victory state');
  assert.equal(engine.gameActive, true, 'the live simulation remains active at the runway edge');
  const completion = engine.takeCampaignCompletionSummary();
  assert.equal(completion.stageComplete, true, 'the boundary still publishes for persistence');
  assert.equal(completion.campaignComplete, false, 'a materialized runway edge is not an ending');
  assert.equal(engine.takeCampaignCompletionSummary(), null, 'the persistence result is one-shot');
  assert.equal(engine.stageRewardCollectionFrames, 0, 'no reward collection pause');
  assert.equal(engine.waveDepartureFrames, 0, 'no takeoff cinematic');
  assert.equal(playerShot.markedForDeletion, false, 'shots stay live');
  assert.equal(powerup.markedForDeletion, false, 'pickups stay live');
  assert.equal(engine.pendingPlayerShots.length, 1, 'queued shots stay live');

  assert.equal(engine.replaceCampaignRunway(extended), true, 'the deterministic suffix is accepted');
  assert.equal(engine.getRuntimeState().levelId, nextLevel.id, 'the appended runway advances automatically');
  assert.equal(engine.getRuntimeState().waveId, nextWave.id);
  assert.equal(engine.continueToCampaignMission(nextLevel.id, nextWave.id), false, 'no React continue handshake is required');

  assert.equal(engine.gameActive, true);
  assert.equal(engine.introFlightFrames, 0, 'the next depth starts without an entry pause');
  assert.equal(engine.wavePresentationKind, 'internal-wave', 'the pixel Wave cue still announces the next depth');
  assert.equal(engine.stats.score, 3456);
  assert.equal(engine.stats.coins, 7);
  assert.equal(engine.stats.totalCoins, 19);
  assert.equal(engine.stats.shipAbilityCooldown, 212);
  assert.equal(engine.stats.lives, 6);
  assert.equal(engine.lives, 6);
  assert.equal(engine.missionOverdriveLevel, 3);
  assert.equal(engine.player.x, 123);
  assert.equal(engine.player.y, 456);
  assert.equal(engine.entities.includes(playerShot), true);
  assert.equal(engine.entities.includes(powerup), true);
  assert.equal(engine.pendingPlayerShots.length, 1);
  assert.equal(engine.getRuntimeState().absoluteWaveNumber, initial.levels.flatMap((level) => level.waves).length + 1);
  assert.equal(engine.getRuntimeState().continuousRun, true);
});

test('Weekly Run caps every collision to one heart and records only damage actually applied', () => {
  const initial = weeklyGenerator.buildWeeklyRunCampaign('2026-W31', authoredCampaign);
  const stats = createStats();
  stats.lives = 2;
  const engine = new GameEngine(stats, {
    campaign: initial,
    continuousStageBoundaries: true,
    maxPlayerDamagePerHit: 1,
    audioEnabled: false
  });
  engine.init(390, 700);

  const first = engine.applyPlayerLifeDamage(9);
  assert.equal(first.damageApplied, 1);
  assert.equal(engine.lives, 1);
  assert.equal(engine.waveDamageTaken, 1);

  engine.frameCount += 1;
  const lethal = engine.applyPlayerLifeDamage(9);
  assert.equal(lethal.damageApplied, 1);
  assert.equal(engine.lives, 0);
  assert.equal(engine.waveDamageTaken, 2);

  engine.frameCount += 1;
  const overkill = engine.applyPlayerLifeDamage(9);
  assert.equal(overkill.damageApplied, 0);
  assert.equal(engine.waveDamageTaken, 2, 'overkill is not reported as extra damage');
});

test('Weekly enemy trains are fixed by week, event, and spawn slot', () => {
  const campaign = weeklyGenerator.buildWeeklyRunCampaign('2026-W31', authoredCampaign, 12);
  let selected = null;
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const event = wave.events.find((candidate) => (
        candidate.kind === 'spawn' && candidate.enemies.length > 1
      ));
      if (event) {
        selected = { level, wave, event };
        break;
      }
    }
    if (selected) break;
  }
  assert.ok(selected, 'the authored formation catalog must expose a mixed-role train');

  const createEngine = (randomSeed) => new GameEngine(createStats(), {
    campaign,
    initialLevelId: selected.level.id,
    initialWaveId: selected.wave.id,
    continuousStageBoundaries: true,
    randomSeed,
    audioEnabled: false
  });
  const first = createEngine('unrelated-seed-a');
  const second = createEngine('unrelated-seed-b');

  // Perturb the general gameplay stream differently. Weekly composition must
  // still resolve from its own event/slot key rather than call order.
  for (let index = 0; index < 37; index++) first.createEntity('PARTICLE', index, index);
  for (let index = 0; index < 5; index++) second.createEntity('PARTICLE', index, index);
  const targetCount = Math.max(8, selected.event.count);
  const firstTrain = Array.from({ length: targetCount }, (_, index) => (
    first.pickConfiguredEnemy(selected.event, index)?.enemyId
  ));
  const secondTrain = Array.from({ length: targetCount }, (_, index) => (
    second.pickConfiguredEnemy(selected.event, index)?.enemyId
  ));
  assert.deepEqual(firstTrain, secondTrain);
});

test('a materialized Weekly depth advances in the same engine tick without a victory pause', () => {
  const initial = weeklyGenerator.buildWeeklyRunCampaign('2026-W31', authoredCampaign);
  const clearedLevel = initial.levels[0];
  const clearedWave = clearedLevel.waves.at(-1);
  const nextLevel = initial.levels[1];
  const engine = new GameEngine(createStats(), {
    campaign: initial,
    initialLevelId: clearedLevel.id,
    initialWaveId: clearedWave.id,
    continuousStageBoundaries: true,
    audioEnabled: false
  });
  engine.init(390, 700);

  engine.beginStageCompletion('MISSION COMPLETE!', '#67e8f9');

  assert.equal(engine.gameActive, true);
  assert.equal(engine.waveVictoryReady, false);
  assert.equal(engine.waveTransitionPending, false);
  assert.equal(engine.getRuntimeState().levelId, nextLevel.id);
  assert.equal(engine.getRuntimeState().waveId, nextLevel.waves[0].id);
  assert.equal(engine.getRuntimeState().wavePresentationKind, 'internal-wave');
  assert.equal(engine.takeCampaignCompletionSummary().stageComplete, true);
});

test('sixty consecutive Weekly waves keep one global count and never refill the player', () => {
  const campaign = weeklyGenerator.buildWeeklyRunCampaign('2026-W31', authoredCampaign, 40);
  const materializedWaveCount = campaign.levels.reduce((total, level) => total + level.waves.length, 0);
  assert.ok(materializedWaveCount > 60, 'the stress runway must extend beyond the exercised waves');

  const stats = createStats();
  const engine = new GameEngine(stats, {
    campaign,
    initialLevelId: campaign.levels[0].id,
    initialWaveId: campaign.levels[0].waves[0].id,
    refillLivesAtMissionBoundary: false,
    continuousStageBoundaries: true,
    maxPlayerDamagePerHit: 1,
    audioEnabled: false,
    randomSeed: 'weekly-sixty-wave-continuity'
  });
  engine.init(390, 700);

  engine.stats.score = 7890;
  engine.stats.coins = 11;
  engine.stats.shipAbilityCooldown = 144;
  engine.stats.lives = 7;
  engine.lives = 7;
  engine.player.x = 137;
  engine.player.y = 431;
  const carriedShot = engine.createEntity('PROJECTILE', 48, 250);
  carriedShot.isPlayerShot = true;
  engine.entities.push(carriedShot);

  let completedDepths = 0;
  for (let transition = 0; transition < 60; transition++) {
    const before = engine.getRuntimeState();
    assert.equal(before.absoluteWaveNumber, transition + 1);

    if (before.waveNumber === before.waveTotal) {
      engine.beginStageCompletion('MISSION COMPLETE!', '#67e8f9');
      const completion = engine.takeCampaignCompletionSummary();
      assert.equal(completion?.stageComplete, true);
      assert.equal(completion?.campaignComplete, false);
      assert.equal(engine.takeCampaignCompletionSummary(), null, 'depth proof is emitted exactly once');
      completedDepths++;
    } else {
      engine.beginTacticalWaveCompletion();
      assert.equal(engine.takeCampaignCompletionSummary(), null, 'an internal wave emits no mission result');
    }

    const after = engine.getRuntimeState();
    assert.equal(after.absoluteWaveNumber, transition + 2, 'the endless counter never resets locally');
    assert.equal(after.continuousRun, true);
    assert.equal(after.wavePresentationKind, 'internal-wave');
    assert.equal(engine.gameActive, true);
    assert.equal(engine.waveVictoryReady, false);
    assert.equal(engine.introFlightFrames, 0);
    assert.equal(engine.stats.lives, 7, 'a depth boundary never refills or changes hearts');
    assert.equal(engine.lives, 7);
    assert.equal(engine.stats.score, 7890);
    assert.equal(engine.stats.coins, 11);
    assert.equal(engine.stats.shipAbilityCooldown, 144);
    assert.equal(engine.player.x, 137);
    assert.equal(engine.player.y, 431);
    assert.equal(carriedShot.markedForDeletion, false);
    assert.equal(engine.entities.includes(carriedShot), true, 'live player shots survive every transition');
  }

  assert.ok(completedDepths >= 20, 'the stress run crosses many depth boundaries');
  assert.equal(engine.getRuntimeState().absoluteWaveNumber, 61);
});

test('Weekly Run rejects a runway that rewrites an already materialized depth', () => {
  const initial = weeklyGenerator.buildWeeklyRunCampaign('2026-W31', authoredCampaign);
  const rewritten = structuredClone(initial);
  rewritten.levels[0].name = 'Rewritten depth';
  const stats = createStats();
  const engine = new GameEngine(stats, {
    campaign: initial,
    continuousStageBoundaries: true,
    audioEnabled: false
  });

  assert.equal(engine.replaceCampaignRunway(rewritten), false);
  assert.equal(engine.campaign.levels[0].name, initial.levels[0].name);
});

test('the Canvas keeps a continuous Weekly engine mounted while generated runway grows', () => {
  const canvasSource = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
  const rendererSource = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );

  assert.match(canvasSource, /continuousStageBoundaries\?: boolean/);
  assert.match(canvasSource, /maxPlayerDamagePerHit\?: number/);
  assert.match(canvasSource, /engine\.replaceCampaignRunway\(campaign\)/);
  assert.match(canvasSource, /engine\.takeCampaignCompletionSummary\(\)/);
  assert.match(canvasSource, /maxPlayerDamagePerHit,/);
  assert.match(rendererSource, /state\.continuousRun[\s\S]{0,80}'WEEKLY RUN'/);
  assert.match(rendererSource, /state\.continuousRun[\s\S]{0,100}state\.absoluteWaveNumber/);
  assert.match(canvasSource, /setupCampaignDependency = previewMode[\s\S]{0,160}: productionSessionDependency/);
  assert.match(canvasSource, /new GameEngine\(initialStats, \{[\s\S]{0,900}continuousStageBoundaries/);
  assert.doesNotMatch(
    canvasSource,
    /\}, \[activeBossArtwork, audioEnabled, campaign,/,
    'runway object identity must not reconstruct the Pixi simulation'
  );
});
