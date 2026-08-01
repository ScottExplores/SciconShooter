const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const enemyFiring = fs.readFileSync(path.join(root, 'services', 'campaignEnemyFiring.ts'), 'utf8');
const formationBudget = fs.readFileSync(path.join(root, 'services', 'campaignFormationBudget.ts'), 'utf8');
const environment = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiEnvironment.ts'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

const loadProgression = () => {
  const weaponSource = fs.readFileSync(path.join(root, 'services', 'weaponTierProgression.ts'), 'utf8');
  const weaponCompiled = ts.transpileModule(weaponSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const weaponModule = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${weaponCompiled} })(module.exports, require, module);`, {
    module: weaponModule,
    require,
    Math,
    Number,
    Array
  });
  const source = fs.readFileSync(path.join(root, 'services', 'campaignCombatProgression.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
    module,
    require: (request) => request === './weaponTierProgression'
      ? weaponModule.exports
      : require(request),
    Math,
    Number,
    Array
  });
  return module.exports;
};

test('campaign length is data-driven while legacy difficulty tiers remain bounded', () => {
  const {
    MAX_AUTHORED_CAMPAIGN_STAGES,
    getAuthoredCampaignStageCount,
    getCampaignProgressionTier,
    getNextAuthoredCampaignIndex
  } = loadProgression();

  assert.equal(MAX_AUTHORED_CAMPAIGN_STAGES, 20, 'legacy presentation count stays compatible');
  assert.equal(getAuthoredCampaignStageCount(5), 5);
  assert.equal(getAuthoredCampaignStageCount(20), 20);
  assert.equal(getAuthoredCampaignStageCount(21), 21);
  assert.equal(getAuthoredCampaignStageCount(999), 999);
  assert.deepEqual(
    [1, 5, 6, 10, 11, 15, 16, 20, 21, 999].map(getCampaignProgressionTier),
    [0, 0, 1, 1, 2, 2, 3, 3, 3, 3]
  );
  assert.equal(getNextAuthoredCampaignIndex(0, 20), 1);
  assert.equal(getNextAuthoredCampaignIndex(18, 20), 19);
  assert.equal(getNextAuthoredCampaignIndex(19, 20), null);
  assert.doesNotMatch(engine, /\.slice\(0, MAX_AUTHORED_CAMPAIGN_STAGES\)/);
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

test('Max Shot doubles the complete current weapon pattern without changing cadence', () => {
  const {
    MAX_SHOT_PROJECTILE_CAP,
    MAX_SHOT_VOLLEY_MULTIPLIER,
    getMaxShotCopyPattern,
    getMaxShotProjectileCount
  } = loadProgression();

  assert.equal(MAX_SHOT_VOLLEY_MULTIPLIER, 2);
  assert.equal(MAX_SHOT_PROJECTILE_CAP, 42);
  assert.deepEqual([1, 2, 3, 7, 21, 99].map(getMaxShotProjectileCount), [2, 4, 6, 14, 42, 42]);
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7].map((tierVolley) => getMaxShotProjectileCount(tierVolley * 3)),
    [6, 12, 18, 24, 30, 36, 42]
  );

  const copies = getMaxShotCopyPattern();
  assert.equal(copies.length, 2);
  assert.equal(copies[0].offsetX, -copies[1].offsetX);
  assert.equal(copies[0].angleOffset, -copies[1].angleOffset);
  // The pair diverges into a visible cone instead of hugging its original
  // lane, which is what makes Max Shot read as a super state. It stays well
  // inside a lane-swapping spread so aiming is unchanged.
  const copyAngleDegrees = Math.abs(copies[1].angleOffset * 180 / Math.PI);
  assert.ok(copyAngleDegrees >= 3, 'the pair fans wide enough to read as a cone');
  assert.ok(copyAngleDegrees <= 8, 'the fan never widens into a different lane');
  assert.ok(Math.abs(copies[1].offsetX) >= 4, 'copies separate at the muzzle too');
  assert.match(engine, /const fireInterval = getFireRateIntervalFrames\(level\)/);
  assert.doesNotMatch(engine, /fireInterval\s*[*/]=?\s*.*MAX_SHOT/);
});

test('stage-clear projectiles finish during rewards, then takeoff owns bounded hyperspeed', () => {
  const departureStart = engine.indexOf('updateWaveDeparture()');
  const departureEnd = engine.indexOf('startDeathSequence()', departureStart);
  const departureSource = engine.slice(departureStart, departureEnd);
  assert.match(engine, /updateStageCompletionProjectiles\(\)/);
  assert.match(engine, /entity\.x \+= entity\.vx;\s*entity\.y \+= entity\.vy/);
  assert.match(engine, /updateStageRewardCollection\(\)[\s\S]*?this\.updateStageCompletionProjectiles\(\)/);
  assert.doesNotMatch(departureSource, /updateStageCompletionProjectiles\(\)/);
  assert.match(departureSource, /this\.updateHyperspeedBackground\(1 \+ takeoff\.travel \* 8\)/);
  assert.match(departureSource, /this\.clearStageBoundaryDebris\(false\)/);
  assert.match(engine, /stageHyperspeedActive/);
  assert.match(engine, /stageHyperspeedStrength/);
  assert.match(environment, /const departureSpeedBoost = runtime\.stageHyperspeedActive/);
  assert.match(environment, /this\.environmentMotionFrame \+= frameDelta \* departureSpeedBoost/);
  assert.match(renderer, /const takeoff = engine\.getStageTakeoffPresentation\(\)/);
  assert.match(renderer, /const departureStrength = takeoffActive \? clamp\(takeoff\.thrustStrength, 0, 1\) : 0/);
  assert.match(renderer, /STAGE_TAKEOFF_THRUSTER_VISUAL_CAP = 6\.4/);
});

test('later authored tiers add deterministic telegraphs, lane lasers, roaming, and safe-gap rings', () => {
  assert.match(engine, /spawnEnemyLaneLaser\(/);
  assert.match(engine, /beam\.isDetachedBeam = true/);
  assert.match(engine, /beam\.isTelegraph = telegraph/);
  assert.match(engine, /telegraph \? '#ef4444'/);
  assert.match(engine, /source\.eliteAttackSequence % laserCadence === 0/);
  assert.match(engine, /spawnBossGapRing\(boss: Entity\)/);
  assert.match(engine, /distanceFromGap < gapHalfWidth/);
  assert.match(engine, /queueBossTargetStrike\(boss: Entity, warningFrames = 54\)/);
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
  assert.match(engine, /resolveFormationEntryPlan\(/);
});

test('authored role and formation-pack firing policy is enforced by the runtime scheduler', () => {
  assert.match(engine, /canCampaignEnemyFire\(\{/);
  assert.match(engine, /campaignFireDelaySeconds = countTowardCombatBudget/);
  assert.match(engine, /getCampaignFormationFiringBehavior\(role\?\.id\)/);
  assert.match(engine, /campaignFormationFiringBehavior === 'priority'/);
  assert.match(engine, /isCampaignPriorityFireRole\(candidate\.campaignGameplayRole\)/);
  assert.match(enemyFiring, /behavior === 'formation-command'.*formationState === 'dive'/s);
  assert.match(enemyFiring, /behavior === 'elite-only'.*isElite/s);
  assert.match(enemyFiring, /formationFiringBehavior === 'none'/);
  assert.match(enemyFiring, /formationFiringBehavior === 'post-formation'/);
});

test('formation-pack instance, recovery, and shooter ceilings are enforced without suppressing loose spawns', () => {
  assert.match(engine, /campaignFormationPackInstances: Map<string, CampaignFormationPackInstanceState>/);
  assert.match(engine, /reconcileCampaignFormationPackInstances\(\)/);
  assert.match(engine, /canStartCampaignFormationPackInstance\(\{/);
  assert.match(engine, /campaignFormationPackLastRetiredFrames\.get\(formationPack\.id\)/);
  assert.match(engine, /countTowardCombatBudget\s*\? this\.getCampaignFormationPackForSpawn\(event\)/);
  assert.match(engine, /getAllowedCampaignShooterIds\(\)/);
  assert.match(engine, /!allowedCampaignShooterIds\.has\(source\.id\)/);
  assert.match(engine, /!allowedCampaignShooterIds\.has\(candidate\.id\)/);
  assert.match(formationBudget, /if \(alreadyStarted\) return true/);
  assert.match(formationBudget, /Math\.ceil\(/);
  assert.match(formationBudget, /authoredRoleLimit === undefined/);
});

test('campaign mini-boss IDs resolve to encounter choreography and reward one completed encounter', () => {
  assert.match(engine, /getMiniBossEncounterDefinition\(configured\.bossId\)/);
  assert.match(engine, /getMiniBossEncounterDefinition\(state\.encounterId\)/);
  assert.match(engine, /private awardMiniBossLabVictory\(state: MiniBossLabEngineState\)/);
  assert.match(engine, /if \(state\.victoryRewarded\) return/);
  assert.match(engine, /this\.creditedMiniBossEncounterIds\.add\(state\.eventId\)/);
  assert.match(engine, /this\.waveVictoryKillCounts\.miniBossKills\+\+/);
  assert.match(engine, /this\.spawnBossCoinBurst\(anchor\)/);
  assert.match(engine, /this\.awardMiniBossLabVictory\(state\)/);
});
