const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const environment = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiEnvironment.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

const loadProgression = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'campaignCombatProgression.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
    module,
    require,
    Math,
    Number,
    Array
  });
  return module.exports;
};

test('the authored campaign has four finite combat tiers and a hard Stage 20 ceiling', () => {
  const {
    MAX_AUTHORED_CAMPAIGN_STAGES,
    getAuthoredCampaignStageCount,
    getCampaignProgressionTier,
    getNextAuthoredCampaignIndex
  } = loadProgression();

  assert.equal(MAX_AUTHORED_CAMPAIGN_STAGES, 20);
  assert.equal(getAuthoredCampaignStageCount(5), 5);
  assert.equal(getAuthoredCampaignStageCount(20), 20);
  assert.equal(getAuthoredCampaignStageCount(999), 20);
  assert.deepEqual(
    [1, 5, 6, 10, 11, 15, 16, 20, 21].map(getCampaignProgressionTier),
    [0, 0, 1, 1, 2, 2, 3, 3, 3]
  );
  assert.equal(getNextAuthoredCampaignIndex(0, 20), 1);
  assert.equal(getNextAuthoredCampaignIndex(18, 20), 19);
  assert.equal(getNextAuthoredCampaignIndex(19, 20), null);
});

test('campaign lookup and continuation never modulo Stage 20 back to Stage 1', () => {
  const lookup = engine.slice(
    engine.indexOf('getCurrentCampaignEntry()'),
    engine.indexOf('getConfiguredWaveDurationSeconds()')
  );
  const continuation = engine.slice(
    engine.indexOf('continueToNextWave()'),
    engine.indexOf('resize(width: number, height: number)')
  );

  assert.doesNotMatch(lookup, /% this\.campaignWaves\.length/);
  assert.match(lookup, /index >= this\.campaignWaves\.length\) return null/);
  assert.match(lookup, /requestedStage > levelCount\) return -1/);
  assert.match(continuation, /getNextAuthoredCampaignIndex/);
  assert.match(continuation, /this\.campaignComplete = true/);
  assert.doesNotMatch(continuation, /currentCampaignIndex = .*%/);
  assert.match(engine, /hasNextStage: boolean/);
  assert.match(engine, /campaignComplete: boolean/);
});

test('Max Shot emits five times the fire-rate volley inside one tight bounded cone', () => {
  const {
    MAX_SHOT_PROJECTILE_CAP,
    MAX_SHOT_VOLLEY_MULTIPLIER,
    getMaxShotAnglesRadians,
    getMaxShotProjectileCount
  } = loadProgression();

  assert.equal(MAX_SHOT_VOLLEY_MULTIPLIER, 5);
  assert.equal(MAX_SHOT_PROJECTILE_CAP, 15);
  assert.deepEqual([1, 2, 3, 99].map(getMaxShotProjectileCount), [5, 10, 15, 15]);

  const angles = getMaxShotAnglesRadians(15);
  assert.equal(angles.length, 15);
  assert.ok(Math.abs(angles[7]) < 1e-12, 'odd Max Shot volleys retain an exact center round');
  assert.ok(Math.abs(angles[0] + angles.at(-1)) < 1e-12, 'the cone stays symmetric');
  assert.ok(Math.abs(angles.at(-1) * 180 / Math.PI - 14) < 1e-9, 'the cone remains close together');
});

test('stage-clear projectiles keep moving safely and departure exposes bounded hyperspeed', () => {
  const { getStageDepartureSignal } = loadProgression();
  const neutralSignal = { progress: 0, speedBoost: 1, hyperspeed: false, hyperspeedStrength: 0 };
  assert.deepEqual(
    JSON.parse(JSON.stringify(getStageDepartureSignal(120, 120))),
    neutralSignal
  );
  const mid = getStageDepartureSignal(60, 120);
  assert.equal(mid.progress, 0.5);
  assert.equal(mid.hyperspeed, true);
  assert.ok(mid.speedBoost > 1 && mid.speedBoost <= 6);
  const finalActiveFrame = getStageDepartureSignal(1, 120);
  assert.equal(finalActiveFrame.hyperspeed, true);
  assert.ok(finalActiveFrame.progress > 0.99 && finalActiveFrame.progress < 1);
  assert.ok(finalActiveFrame.speedBoost > 5.9 && finalActiveFrame.speedBoost < 6);
  assert.deepEqual(JSON.parse(JSON.stringify(getStageDepartureSignal(0, 120))), neutralSignal);
  assert.deepEqual(JSON.parse(JSON.stringify(getStageDepartureSignal(-20, 120))), neutralSignal);

  assert.match(engine, /updateStageCompletionProjectiles\(\)/);
  assert.match(engine, /entity\.x \+= entity\.vx;\s*entity\.y \+= entity\.vy/);
  assert.match(engine, /updateStageRewardCollection\(\)[\s\S]*?this\.updateStageCompletionProjectiles\(\)/);
  assert.match(engine, /updateWaveDeparture\(\)[\s\S]*?this\.updateStageCompletionProjectiles\(\)/);
  assert.match(engine, /stageHyperspeedActive/);
  assert.match(engine, /stageHyperspeedStrength/);
  assert.match(environment, /const departureSpeedBoost = runtime\.stageHyperspeedActive/);
  assert.match(environment, /this\.environmentMotionFrame \+= frameDelta \* departureSpeedBoost/);
  assert.match(renderer, /const departureStrength = runtime\.stageHyperspeedActive/);
  assert.match(renderer, /const departureBoost = 1 \+ departureStrength \* 1\.8/);
});

test('later authored tiers add deterministic telegraphs, lane lasers, roaming, and safe-gap rings', () => {
  assert.match(engine, /spawnEnemyLaneLaser\(/);
  assert.match(engine, /beam\.isDetachedBeam = true/);
  assert.match(engine, /beam\.isTelegraph = telegraph/);
  assert.match(engine, /telegraph \? '#ef4444'/);
  assert.match(engine, /source\.eliteAttackSequence % laserCadence === 0/);
  assert.match(engine, /spawnBossGapRing\(boss: Entity\)/);
  assert.match(engine, /distanceFromGap < gapHalfWidth/);
  assert.match(engine, /queueBossTargetStrike\(boss: Entity\)/);
  assert.match(engine, /boss\.movementPattern === 'arena-roam'/);
  assert.match(engine, /spawnBossCrossBeamPair\(boss, true\)/);
});

test('generated campaign enemies have readable specialist attacks and side sentry holds', () => {
  assert.match(engine, /getCampaignEnemyArchetype\(source: Entity\)/);
  assert.match(engine, /spawnEliteRingBurst\(source: Entity, availableShots: number\)/);
  assert.match(engine, /gapDistance < 0\.42/);
  assert.match(engine, /spawnEliteMineFan\(source: Entity, availableShots: number\)/);
  assert.match(engine, /archetype === 'laser-hunter'/);
  assert.match(engine, /enemy\.spriteUrl\?\.includes\('\/wall-sniper-'\)/);
  assert.match(engine, /sideSentry \? GAME_CONFIG\.FPS \* 12/);
  assert.match(engine, /usesDnaFleet/);
  assert.match(engine, /const sCurve = event\.id\.includes\('null-sector'\)/);
  assert.match(engine, /const strand = index % 2 === 0 \? -1 : 1/);
  assert.match(engine, /usesRingFleet/);
  assert.match(engine, /const ringSize = Math\.min\(12, count\)/);
});
