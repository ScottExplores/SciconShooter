const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const campaign = require('../game-config/campaign.json');

const load = (entry) => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};
const { validateGameCampaign } = load('game-config/validate.ts');
const { resolveCampaignFormationPackForSpawn } = load('services/campaignFormationBudget.ts');
const { canCampaignEnemyFire } = load('services/campaignEnemyFiring.ts');
const sector = campaign.sectors[0];
const missions = sector.missionIds.map(id => campaign.levels.find(level => level.id === id));
const roles = new Map(campaign.enemyRoles.map(role => [role.id, role]));
const packs = new Map(campaign.formationPacks.map(pack => [pack.id, pack]));
const spawns = wave => wave.events.filter(event => event.kind === 'spawn');

test('Breakwater is the ordinary first sector, not a lab campaign or a new progression path', () => {
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, issues: [] });
  assert.equal(sector.id, 'sector-open-orbit');
  assert.equal(sector.name, 'BREAKWATER');
  assert.deepEqual(sector.missionIds, ['operation-open-galaxy', 'stage-citation-storm', 'stage-paywall-siege', 'stage-open-galaxy', 'stage-bastion-protocol']);
  assert.deepEqual(missions.map(level => level.waves.length), [6, 7, 4, 4, 2]);
  assert.deepEqual(missions.map(level => level.campaignProgression.missionRole), ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss']);
  assert.equal(campaign.campaignGraph.entryNodeId, 'node-s01-d01');
  assert.equal(campaign.campaignGraph.nodes.length, 60);
  assert.deepEqual(sector.routeNodeIds, ['node-s01-d02b']);
  assert.equal(missions[0].campaignProgression.nextMissionId, 'stage-citation-storm');
  assert.deepEqual(missions[0].campaignProgression.reward, { waveClearCoins: 13, missionClearCoins: 29, firstClearCoins: 57, bossFirstClearCoins: 0, replayMultiplier: .2 });
  assert.equal(missions.every(level => level.loopWaves === false), true);
});

test('original opening environments retain the updated Breakwater encounters', () => {
  assert.deepEqual(missions.map(level => level.backgroundId), ['open-orbit', 'citation-storm', 'paywall-siege', 'open-galaxy', 'bastion-protocol']);
  for (const level of missions) {
    assert.ok(level.waves.every(wave => wave.backgroundId === level.backgroundId));
    const authoredSeconds = level.waves.reduce((total, wave) => total + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds, 0);
    assert.ok(Math.abs(level.durationSeconds - authoredSeconds) < .001, 'Mission estimate includes every authored surge');
  }
  assert.match(missions[0].waves[0].name, /RIBBON/);
  assert.match(missions[1].waves[1].name, /CROSSFIRE/);
  assert.match(missions[3].waves[1].name, /PHALANX/);
});

test('streamed and overlapping cohorts stay under actual role, formation and wave limits', () => {
  const entryPaths = new Set();
  const attackVerbs = new Set();
  let overlappingWaves = 0;
  for (const level of missions) for (const wave of level.waves) {
    const events = spawns(wave);
    const roleCounts = new Map();
    let threat = 0;
    const declaredPacks = wave.formationPackIds.map(id => packs.get(id));
    const packThreat = declaredPacks.reduce((sum, pack) => sum + pack.totalThreatCost, 0);
    assert.ok(packThreat <= wave.combatBudget);
    for (const event of events) {
      assert.equal(event.enemies.length, 1, 'each arriving cohort has a readable, deterministic role');
      const enemy = event.enemies[0];
      const role = roles.get(enemy.roleId);
      roleCounts.set(role.id, (roleCounts.get(role.id) ?? 0) + event.count);
      threat += event.count * role.threatCost;
      assert.ok((event.count - 1) * event.spawnIntervalSeconds <= event.durationSeconds);
      assert.ok(event.startSeconds + event.durationSeconds <= wave.durationSeconds + .001);
      assert.ok(role.introductionMission <= missions.indexOf(level) + 1, 'new roles are still taught in their authored Mission');
      if (!event.formationBehavior) continue;
      const pack = resolveCampaignFormationPackForSpawn(event, declaredPacks);
      assert.ok(pack?.id.startsWith('pack-breakwater-'));
      assert.deepEqual(pack.compatibleSectorIds, ['sector-open-orbit']);
      entryPaths.add(event.formationBehavior.entryPathId);
      attackVerbs.add(event.formationBehavior.attackId);
      assert.ok(event.formationBehavior.telegraphSeconds >= .7);
      assert.ok(event.formationBehavior.holdSeconds <= 1.3);
    }
    for (const [id, count] of roleCounts) assert.ok(count <= roles.get(id).maximumSimultaneousCount, `${wave.id} does not strand ${id} offscreen`);
    assert.ok(events.reduce((sum, event) => sum + event.count, 0) <= wave.threatCap);
    assert.ok(threat <= wave.combatBudget);
    if (events.length > 1) {
      assert.ok(events[1].startSeconds < events[0].startSeconds + events[0].durationSeconds);
      overlappingWaves++;
    }
  }
  assert.ok(overlappingWaves >= 14);
  assert.ok(entryPaths.size >= 6);
  assert.ok(attackVerbs.size >= 5);
});

test('hold-shooting roles are never silenced by a dive-only formation fire policy', () => {
  let armedCohorts = 0;
  for (const level of missions) for (const wave of level.waves) for (const event of spawns(wave)) {
    const role = roles.get(event.enemies[0].roleId);
    if (role.fireBehavior === 'none' || !event.formationBehavior) continue;
    armedCohorts++;
    const context = { behavior: role.fireBehavior, fireDelaySeconds: role.fireDelaySeconds,
      formationFiringBehavior: event.formationBehavior.firingBehavior, formationGroupReady: true,
      formationAttackSelected: true, formationAttackActive: true, isElite: false,
      spawnFrame: 0, currentFrame: 600, framesPerSecond: 60 };
    assert.ok(['hold', 'dive'].some(formationState => canCampaignEnemyFire({ ...context, formationState })), `${event.id} has a reachable armed state`);
    assert.equal(canCampaignEnemyFire({ ...context, formationState: 'entry' }), false);
    assert.equal(canCampaignEnemyFire({ ...context, formationState: 'return' }), false);
  }
  assert.ok(armedCohorts >= 15);
});

test('salvage lightens pressure before existing checkpoint bosses without changing their identities or rewards', () => {
  for (const level of missions.slice(0, 4)) {
    const salvage = level.waves.find(wave => wave.events.some(event => event.kind === 'recovery'));
    assert.ok(salvage);
    assert.ok(spawns(salvage).some(event => event.patternId === 'single-random' && event.count === 3));
    assert.ok(spawns(salvage).reduce((sum, event) => sum + event.count, 0) <= 9);
  }
  const encounters = missions.flatMap(level => level.waves.flatMap(wave => wave.events.filter(event => event.kind === 'boss').map(event => ({ level, wave, event }))));
  assert.deepEqual(encounters.map(({ event }) => event.bossId), ['bottleneck-drone', 'paywall-wall', 'gatekeeper-prime']);
  assert.deepEqual(encounters.map(({ event }) => event.health), [111, 128, 500]);
  assert.deepEqual(encounters.map(({ event }) => event.scoreReward), [2040, 2600, 1010]);
  assert.deepEqual(encounters.at(-1).event.componentHealth, { 'left-cannon': 165, 'right-cannon': 165 });
  assert.equal(encounters.at(-1).wave.completionRule, 'boss-defeat');
  for (const { wave, event } of encounters.slice(0, 2)) {
    assert.equal(event.blocksWaveClock, true);
    assert.ok(spawns(wave).every(spawn => spawn.startSeconds + (spawn.count - 1) * spawn.spawnIntervalSeconds < event.startSeconds), 'boss enters after the escort dispatch, not amid another unexplained spawn');
  }
});

global.Image ??= class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const { GameEngine } = load('services/gameLogic.ts');
const stats = () => ({ score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
  bombs: 0, bombCharge: 0, bombChargeMax: 100, lives: 3, repairsCount: 0,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960, upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 });

test('the regular mobile Mission launches a separated ribbon through the left gate', () => {
  const level = missions[0];
  const engine = new GameEngine(stats(), { campaign, previewMode: false, audioEnabled: false,
    preloadCanvasAssets: false, initialLevelId: level.id, initialWaveId: level.waves[0].id, randomSeed: 'breakwater-arrival' });
  engine.init(390, 844);
  const births = new Map();
  const source = level.waves[0].events.find(event => event.kind === 'spawn');
  let visible = false;
  for (let frame = 0; frame < 480; frame++) {
    engine.update();
    for (const enemy of engine.entities.filter(entity => entity.sourceEventId === source.id)) {
      if (!births.has(enemy.id)) births.set(enemy.id, { frame, x: enemy.x });
      if (enemy.x > 0 && enemy.x < 390 && enemy.y > 0 && enemy.y < 844) visible = true;
    }
  }
  assert.equal(engine.previewMode, false);
  assert.equal(births.size, 8);
  assert.equal(new Set([...births.values()].map(item => item.frame)).size, 8);
  assert.ok([...births.values()].every(item => item.x < 0));
  assert.ok(visible);
});

test('regular Mission 2 produces real enemy projectiles after assembly, without lab roles or overrides', () => {
  const level = missions[1];
  const engine = new GameEngine(stats(), { campaign, previewMode: false, audioEnabled: false,
    preloadCanvasAssets: false, initialLevelId: level.id, initialWaveId: level.waves[1].id, randomSeed: 'breakwater-crossfire' });
  engine.init(390, 844);
  let fired = false;
  for (let frame = 0; frame < 1000 && engine.gameActive; frame++) {
    engine.update();
    if (engine.entities.some(entity => entity.type === 'PROJECTILE' && !entity.isPlayerShot && !entity.isTelegraph)) { fired = true; break; }
  }
  assert.equal(engine.previewMode, false);
  assert.ok(fired, 'crossfire must be dangerous in the actual campaign, not just have an armed label');
});

test('the complete ordinary gate Mission advances from its lead-in to boss destruction and a real Mission summary', () => {
  const level = missions[4];
  const runStats = stats();
  runStats.lives = 4;
  runStats.upgrades = { fireRate: 2, speed: 1, ability: 0 };
  const engine = new GameEngine(runStats, { campaign, previewMode: false, audioEnabled: false,
    preloadCanvasAssets: false, initialLevelId: level.id, initialWaveId: level.waves[0].id,
    randomSeed: 'breakwater-gate-complete', squadLoadout: { profileId: 'sector-test', weekKey: 'test',
      mainShipId: 'researchhub', upgrades: { fireRate: 2, speed: 1, startingHearts: 1, ability: 0 }, companions: [] } });
  engine.init(390, 844);
  const visitedWaves = new Set();
  let bossSeen = false;
  for (let frame = 0; frame < 60 * 240 && engine.gameActive; frame++) {
    // Explicit lifecycle isolation: real primary projectiles/collisions defeat
    // the escorts, cannon components, and hull. This is NOT a survival proof.
    engine.invincibleTimer = 180;
    if (frame % 8 === 0) {
      const target = engine.entities.filter(entity => !entity.markedForDeletion && entity.hp > 0 && engine.isEnemyTarget(entity))
        .sort((left, right) => right.y - left.y)[0];
      let x = target ? target.x + target.width / 2 : 195;
      if (target?.type === 'BOSS') {
        bossSeen = true;
        x = target.x + target.width * (.25 + .5 * ((Math.sin(frame * .012) + 1) / 2));
      }
      engine.handleInput({}, { x: Math.max(5, Math.min(385, x)), y: 815 });
    }
    engine.update();
    visitedWaves.add(engine.getRuntimeState().waveId);
    if (engine.waveVictoryReady) break;
  }
  assert.equal(engine.previewMode, false);
  assert.deepEqual([...visitedWaves], level.waves.map(wave => wave.id));
  assert.ok(bossSeen);
  assert.equal(engine.waveVictoryReady, true, 'a completed fight must leave gameplay and produce the normal result screen');
  assert.equal(engine.gameActive, false);
  const summary = engine.waveVictorySummary;
  assert.equal(summary.levelId, level.id);
  assert.equal(summary.waveId, level.waves[1].id);
  assert.equal(summary.stageComplete, true);
  assert.equal(summary.waveNumber, 2);
  assert.equal(summary.waveTotal, 2);
  assert.equal(summary.regularEnemyKills, 9);
  assert.equal(summary.majorBossKills, 1);
  assert.equal(summary.bossEncounterId, 'stage-bastion-protocol-major-boss');
  assert.equal(summary.bossTerminalOutcome, 'destroyed');
  assert.equal(summary.nextLevelId, 'stage-helix-convergence');
  assert.equal(summary.campaignComplete, false);
  assert.equal(summary.damageTaken, 0, 'invincibility is intentionally limited to this lifecycle proof');
});
