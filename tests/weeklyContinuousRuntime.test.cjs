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

  assert.equal(engine.waveVictoryReady, true, 'the boundary publishes once for persistence');
  assert.equal(engine.gameActive, false, 'the command handshake owns only this short boundary');
  assert.equal(engine.stageRewardCollectionFrames, 0, 'no reward collection pause');
  assert.equal(engine.waveDepartureFrames, 0, 'no takeoff cinematic');
  assert.equal(playerShot.markedForDeletion, false, 'shots stay live');
  assert.equal(powerup.markedForDeletion, false, 'pickups stay live');
  assert.equal(engine.pendingPlayerShots.length, 1, 'queued shots stay live');

  assert.equal(engine.replaceCampaignRunway(extended), true, 'the deterministic suffix is accepted');
  assert.equal(engine.continueToCampaignMission(nextLevel.id, nextWave.id), true);

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

  assert.match(canvasSource, /continuousStageBoundaries\?: boolean/);
  assert.match(canvasSource, /engine\.replaceCampaignRunway\(campaign\)/);
  assert.match(canvasSource, /setupCampaignDependency = continuousStageBoundaries[\s\S]{0,100}campaign\?\.id/);
  assert.match(canvasSource, /new GameEngine\(initialStats, \{[\s\S]{0,500}continuousStageBoundaries/);
  assert.doesNotMatch(
    canvasSource,
    /\}, \[activeBossArtwork, audioEnabled, campaign,/,
    'runway object identity must not reconstruct the Pixi simulation'
  );
});
