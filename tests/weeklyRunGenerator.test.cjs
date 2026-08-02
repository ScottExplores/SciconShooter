const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const loadGenerator = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'weeklyRunGenerator.ts')],
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

const loadValidator = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'game-config', 'validate.ts')],
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

const generator = loadGenerator();
const validator = loadValidator();

const findAuthoredBossEvent = (bossId) => {
  for (const level of [...campaign.levels].sort((left, right) => left.order - right.order)) {
    for (const wave of [...level.waves].sort((left, right) => left.order - right.order)) {
      const event = wave.events.find((candidate) => candidate.kind === 'boss' && candidate.bossId === bossId);
      if (event) return event;
    }
  }
  return null;
};

const assertSpawnSafeBossSchema = (event, label) => {
  assert.equal(event.kind, 'boss', `${label} is a boss event`);
  for (const field of ['bossId', 'spriteKey', 'positionId', 'movementPatternId']) {
    assert.equal(typeof event[field], 'string', `${label} has ${field}`);
    assert.ok(event[field].length > 0, `${label} has a non-empty ${field}`);
  }
  for (const field of [
    'warningSeconds',
    'health',
    'speed',
    'damage',
    'scoreReward',
    'powerupDropChance',
    'shieldCount'
  ]) {
    assert.equal(typeof event[field], 'number', `${label} has numeric ${field}`);
    assert.equal(Number.isFinite(event[field]), true, `${label} has finite ${field}`);
  }
  assert.ok(event.health > 0, `${label} has positive health`);
  assert.ok(event.speed >= 0, `${label} has legal speed`);
  assert.ok(event.damage > 0, `${label} has positive contact damage`);
  assert.ok(Array.isArray(event.weapons) && event.weapons.length > 0, `${label} has authored weapons`);
  assert.ok(Array.isArray(event.phases) && event.phases.length > 0, `${label} has authored phases`);
  assert.equal(event.phases[0].triggerHealthRatio, 1, `${label} starts at the full-health phase`);
  assert.equal(Object.hasOwn(event, 'healthMultiplier'), false, `${label} has no runtime-only healthMultiplier`);
  assert.equal(Object.hasOwn(event, 'attackTempoMultiplier'), false, `${label} has no runtime-only tempo field`);
};

test('the Weekly Run materializes stable runway and never stops escalating', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign);
  const extended = generator.buildWeeklyRunCampaign(
    '2026-W31',
    campaign,
    generator.WEEKLY_RUN_INITIAL_STAGE_COUNT + generator.WEEKLY_RUN_STAGE_CHUNK
  );

  // A finite deterministic window is generated at once, but extending it must
  // preserve the exact prefix so App can keep adding runway without a cap.
  assert.equal(run.levels.length, generator.WEEKLY_RUN_INITIAL_STAGE_COUNT);
  assert.equal(
    extended.levels.length,
    generator.WEEKLY_RUN_INITIAL_STAGE_COUNT + generator.WEEKLY_RUN_STAGE_CHUNK
  );
  assert.deepEqual(
    extended.levels.slice(0, run.levels.length),
    run.levels,
    'extending the ladder must not reshuffle anything already played'
  );

  const difficulties = run.levels.map((level) => level.startingDifficulty);
  for (let index = 1; index < difficulties.length; index += 1) {
    assert.ok(
      difficulties[index] > difficulties[index - 1],
      `depth ${index + 1} must be harder than depth ${index}`
    );
  }
  assert.ok(difficulties.at(-1) > difficulties[0] * 3, 'the deep end must be dramatically harder');
});

test('nothing in the generated run references Campaign missions or progress', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign);
  const campaignMissionIds = new Set(campaign.levels.map((level) => level.id));

  for (const level of run.levels) {
    assert.equal(campaignMissionIds.has(level.id), false, `${level.id} is a Campaign mission`);
    assert.match(level.id, /^weekly-run-stage-\d+$/);
  }
  for (const node of run.campaignGraph.nodes) {
    assert.match(node.missionDefinitionId, /^weekly-run-stage-\d+$/);
    assert.equal(node.sectorId, 'weekly-run');
  }

  const source = fs.readFileSync(path.join(root, 'services', 'weeklyRunGenerator.ts'), 'utf8');
  assert.doesNotMatch(source, /campaignProgress|unlockedGraphNodeIds/);
});

test('bosses escalate from elites into major bosses', () => {
  const stages = generator.planWeeklyRunStages('2026-W31', campaign);
  const kinds = stages.map((stage) => stage.kind);

  // Elites are the frequent beat, major bosses the milestone.
  const elites = kinds.filter((kind) => kind === 'elite').length;
  const majors = kinds.filter((kind) => kind === 'major').length;
  assert.ok(elites > 0 && majors > 0);
  assert.ok(elites > majors, 'elite bosses must be the more frequent encounter');

  // The first boss a player meets is an elite, not a major boss, and every
  // segment reaches a boss after two or three total waves.
  assert.equal(stages[0].kind, 'elite');
  for (const stage of stages) {
    assert.ok(stage.waveCount >= 2 && stage.waveCount <= 3);
    assert.ok(stage.bossId, `depth ${stage.index + 1} must end in a boss`);
  }

  const eliteIds = new Set(campaign.miniBosses.map((entry) => entry.bossId));
  const majorIds = new Set(campaign.sectors.map((sector) => sector.majorBossId));
  for (const stage of stages) {
    if (stage.kind === 'elite') assert.equal(eliteIds.has(stage.bossId), true, stage.bossId);
    if (stage.kind === 'major') assert.equal(majorIds.has(stage.bossId), true, stage.bossId);
    if (stage.kind === 'combat') assert.fail('a Weekly Run segment may not omit its boss');
  }
});

test('each week draws a different boss order, and every player gets the same one', () => {
  const orderFor = (weekKey) => generator.planWeeklyRunStages(weekKey, campaign)
    .filter((stage) => stage.bossId)
    .map((stage) => stage.bossId)
    .join(',');

  // Same week, same run: the leaderboard is only fair if everyone fights the
  // same sequence.
  assert.equal(orderFor('2026-W31'), orderFor('2026-W31'));

  // Different weeks mix it up.
  const weeks = ['2026-W31', '2026-W32', '2026-W33', '2026-W34'];
  const orders = new Set(weeks.map(orderFor));
  assert.ok(orders.size >= 3, 'boss order must vary week to week');
});

test('generated waves are fully formed and reference real enemy roles', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign);
  const roleIds = new Set(campaign.enemyRoles.map((role) => role.id));
  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));

  let spawnEvents = 0;
  let bossEvents = 0;
  for (const level of run.levels) {
    assert.ok(level.waves.length > 0, `${level.id} has waves`);
    assert.ok(level.waves.length >= 2 && level.waves.length <= 3, `${level.id} has a 2-3 wave boss cadence`);
    assert.equal(level.waves.at(-1).events[0].kind, 'boss', `${level.id} ends with a boss`);
    for (const wave of level.waves) {
      assert.ok(wave.events.length > 0, `${wave.id} has events`);
      for (const event of wave.events) {
        if (event.kind === 'boss') {
          bossEvents += 1;
          assert.ok(event.bossId, 'boss events name a boss');
          continue;
        }
        spawnEvents += 1;
        assert.ok(event.count > 0);
        assert.ok(event.enemies.length > 0);
        // Enemies must stay distinct by base enemy, exactly as authored waves do.
        const enemyIds = event.enemies.map((enemy) => enemy.enemyId);
        assert.equal(new Set(enemyIds).size, enemyIds.length, `${event.id} has duplicate enemyIds`);
        const weightSum = event.enemies.reduce((sum, enemy) => sum + enemy.weight, 0);
        assert.ok(Math.abs(weightSum - 1) < 0.02, `${event.id} weights sum to ${weightSum}`);
        for (const enemy of event.enemies) {
          assert.equal(roleIds.has(enemy.roleId), true, enemy.roleId);
          assert.equal(roleById.get(enemy.roleId).enemyId, enemy.enemyId);
          assert.equal(roleById.get(enemy.roleId).spriteKey, enemy.spriteKey);
        }
      }
    }
  }
  assert.ok(spawnEvents > 40, 'the run should author a lot of combat');
  assert.equal(bossEvents, run.levels.length, 'every generated segment ends with a boss');
});

test('the first elite and major use complete authored spawn-safe boss schemas', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign);
  const firstEliteLevel = run.levels.find((level) => level.description.includes('elite'));
  const firstMajorLevel = run.levels.find((level) => level.description.includes('major'));
  assert.ok(firstEliteLevel, 'the run has an elite encounter');
  assert.ok(firstMajorLevel, 'the run has a major encounter');

  const eliteWave = firstEliteLevel.waves.at(-1);
  const majorWave = firstMajorLevel.waves.at(-1);
  const elite = eliteWave.events[0];
  const major = majorWave.events[0];
  assertSpawnSafeBossSchema(elite, 'first elite');
  assertSpawnSafeBossSchema(major, 'first major');
  assert.equal(eliteWave.completionRule, 'clear-after-duration');
  assert.equal(majorWave.completionRule, 'boss-defeat');

  const authoredElite = findAuthoredBossEvent(elite.bossId);
  const authoredMajor = findAuthoredBossEvent(major.bossId);
  assert.ok(authoredElite, `authored elite ${elite.bossId} exists`);
  assert.ok(authoredMajor, `authored major ${major.bossId} exists`);
  for (const [generated, authored, label] of [
    [elite, authoredElite, 'elite'],
    [major, authoredMajor, 'major']
  ]) {
    assert.equal(generated.spriteKey, authored.spriteKey, `${label} keeps its authored sprite`);
    assert.equal(generated.positionId, authored.positionId, `${label} keeps its authored spawn position`);
    assert.equal(generated.movementPatternId, authored.movementPatternId, `${label} keeps its authored movement`);
    assert.notEqual(generated.weapons, authored.weapons, `${label} weapon settings are cloned`);
    assert.notEqual(generated.phases, authored.phases, `${label} phases are cloned`);
  }

  const validation = validator.validateGameCampaign(run);
  const bossEventPaths = new Set([
    `/levels/${run.levels.indexOf(firstEliteLevel)}/waves/${firstEliteLevel.waves.length - 1}/events/0`,
    `/levels/${run.levels.indexOf(firstMajorLevel)}/waves/${firstMajorLevel.waves.length - 1}/events/0`
  ]);
  const relevantIssues = validation.issues.filter((issue) => (
    [...bossEventPaths].some((eventPath) => issue.path.startsWith(eventPath))
  ));
  assert.deepEqual(relevantIssues, [], 'first elite and major pass the campaign boss-event validator');
});

test('the run graph is a linear ladder where depth pays more', () => {
  const graph = generator.buildWeeklyRunGraph('2026-W31', campaign);

  assert.equal(graph.entryNodeId, graph.nodes[0].nodeId);
  graph.nodes.forEach((node, index) => {
    const isLast = index === graph.nodes.length - 1;
    assert.equal(node.outgoingEdges.length, isLast ? 0 : 1, `node ${index} fans out once`);
    assert.equal(node.depth, index + 1);
    if (index > 0) {
      assert.ok(
        node.weeklyScoreMultiplier > graph.nodes[index - 1].weeklyScoreMultiplier,
        'deeper nodes must be worth more'
      );
    }
  });
});

test('Weekly Run starting lives are fixed and independent of Hangar upgrades', () => {
  const squad = fs.readFileSync(path.join(root, 'services', 'squadProgression.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.equal(generator.WEEKLY_RUN_STARTING_LIVES, 10);
  const startingLivesStart = app.indexOf('const startingLives');
  const startingLivesEnd = app.indexOf('const weeklyRunKeyForLaunch', startingLivesStart);
  const startingLivesBlock = app.slice(startingLivesStart, startingLivesEnd);
  assert.match(startingLivesBlock, /runMode === 'weekly-streak'/);
  assert.match(startingLivesBlock, /carriedWeeklyLives \?\? WEEKLY_RUN_STARTING_LIVES/);
  assert.match(startingLivesBlock, /Math\.min\(WEEKLY_RUN_STARTING_LIVES/);
  assert.match(startingLivesBlock, /CAMPAIGN_MAX_STARTING_LIVES/);
  // Starting Hearts is a Campaign-only track; it must not reach the Weekly Run.
  assert.match(squad, /CAMPAIGN_MAX_STARTING_LIVES = 5/);
});
