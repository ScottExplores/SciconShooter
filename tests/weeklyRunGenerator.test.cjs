const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const loadBundledModule = (entryPoint) => {
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

const generator = loadBundledModule(path.join('services', 'weeklyRunGenerator.ts'));
const browserPlan = loadBundledModule(path.join('shared', 'weeklyRunPlan.browser.ts'));
const serverPlan = require(path.join(root, 'shared', 'weeklyRunPlan.js'));
const validator = loadBundledModule(path.join('game-config', 'validate.ts'));

test('Weekly runway grows only in full generation chunks', () => {
  const materialize = generator.getWeeklyRunMaterializedStageCount;
  assert.equal(materialize(0), 24);
  assert.equal(materialize(24), 24);
  assert.equal(materialize(25), 40);
  assert.equal(materialize(39), 40);
  assert.equal(materialize(40), 40);
  assert.equal(materialize(41), 56);
  assert.equal(materialize(999999), 2048);
});

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

const orderedEliteBossIds = [...campaign.miniBosses]
  .map((entry, authoredIndex) => ({ entry, authoredIndex }))
  .sort((left, right) => (
    left.entry.recommendedPower - right.entry.recommendedPower
    || left.entry.threatCost - right.entry.threatCost
    || left.authoredIndex - right.authoredIndex
  ))
  .map(({ entry }) => entry.bossId);

const orderedMajorBossIds = [...campaign.sectors]
  .sort((left, right) => left.order - right.order)
  .map((sector) => sector.majorBossId)
  .filter((bossId, index, list) => list.indexOf(bossId) === index);

const resolveDeclaredFormationPack = (event, declaredPacks) => {
  const roleIds = [...new Set(event.enemies.map((enemy) => enemy.roleId).filter(Boolean))];
  const roleCompatible = declaredPacks.filter((pack) => (
    roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId))
  ));
  if (roleCompatible.length === 1) return roleCompatible[0];
  const shapeMatches = roleCompatible.filter((pack) => pack.formationShape === event.patternId);
  return shapeMatches.length === 1 ? shapeMatches[0] : null;
};

const assertBossSequenceStaysInStrengthBands = (actualIds, authoredIds, label) => {
  const bandSize = serverPlan.WEEKLY_RUN_BOSS_STRENGTH_BAND_SIZE;
  const firstCycle = actualIds.slice(0, authoredIds.length);
  assert.equal(firstCycle.length, authoredIds.length, `${label} covers one complete boss cycle`);
  assert.equal(new Set(firstCycle).size, authoredIds.length, `${label} does not repeat within a cycle`);
  const strengthBands = firstCycle.map((bossId) => (
    Math.floor(authoredIds.indexOf(bossId) / bandSize)
  ));
  for (let index = 1; index < strengthBands.length; index += 1) {
    assert.ok(
      strengthBands[index] >= strengthBands[index - 1],
      `${label} boss ${firstCycle[index]} cannot jump ahead of its strength band`
    );
  }
};

test('browser and server Weekly formulas stay identical and clamp proof runway length', () => {
  const options = {
    eliteBossIds: orderedEliteBossIds,
    majorBossIds: orderedMajorBossIds,
    stageCount: serverPlan.WEEKLY_RUN_MAX_PROOF_STAGE_COUNT + 73
  };
  const browserStages = browserPlan.buildWeeklyRunStagePlans('2026-W31', options);
  const serverStages = serverPlan.buildWeeklyRunStagePlans('2026-W31', options);

  assert.equal(browserStages.length, serverPlan.WEEKLY_RUN_MAX_PROOF_STAGE_COUNT);
  assert.equal(serverStages.length, serverPlan.WEEKLY_RUN_MAX_PROOF_STAGE_COUNT);
  assert.deepEqual(serverStages, browserStages);
  assert.deepEqual(
    serverPlan.buildWeeklyRunStagePlans('2026-W31', { ...options, stageCount: -4 }),
    browserPlan.buildWeeklyRunStagePlans('2026-W31', { ...options, stageCount: -4 })
  );
  for (const stageIndex of [0, 1, 12, 100, 2047]) {
    assert.equal(serverPlan.getWeeklyRunIntensity(stageIndex), browserPlan.getWeeklyRunIntensity(stageIndex));
    assert.equal(
      serverPlan.getWeeklyRunFormationEventCount(stageIndex),
      browserPlan.getWeeklyRunFormationEventCount(stageIndex)
    );
  }
});

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
  for (const level of run.levels) {
    for (const wave of level.waves) {
      assert.equal(wave.difficultyMultiplier, 1, `${wave.id} must not apply intensity a second time`);
    }
  }
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

test('weekly boss randomization stays inside Campaign strength bands', () => {
  const stages = generator.planWeeklyRunStages('2026-W31', campaign, 48);
  const eliteOrder = stages
    .filter((stage) => stage.kind === 'elite')
    .map((stage) => stage.bossId);
  const majorOrder = stages
    .filter((stage) => stage.kind === 'major')
    .map((stage) => stage.bossId);

  assertBossSequenceStaysInStrengthBands(eliteOrder, orderedEliteBossIds, 'elite');
  assertBossSequenceStaysInStrengthBands(majorOrder, orderedMajorBossIds, 'major');

  const weeks = Array.from({ length: 16 }, (_, index) => `2026-W${String(index + 20).padStart(2, '0')}`);
  const firstEliteBands = new Set(weeks.map((weekKey) => (
    generator.planWeeklyRunStages(weekKey, campaign, 8)
      .filter((stage) => stage.kind === 'elite')
      .slice(0, 2)
      .map((stage) => stage.bossId)
      .join(',')
  )));
  const firstMajorBands = new Set(weeks.map((weekKey) => (
    generator.planWeeklyRunStages(weekKey, campaign, 8)
      .filter((stage) => stage.kind === 'major')
      .slice(0, 2)
      .map((stage) => stage.bossId)
      .join(',')
  )));
  assert.ok(firstEliteBands.size > 1, 'weeks remix bosses inside the opening elite band');
  assert.ok(firstMajorBands.size > 1, 'weeks remix bosses inside the opening major band');
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
        // Tactical roles stay distinct even when two variants intentionally
        // share one base chassis and use different sprite/behavior contracts.
        const eventRoleIds = event.enemies.map((enemy) => enemy.roleId);
        assert.equal(new Set(eventRoleIds).size, eventRoleIds.length, `${event.id} has duplicate roleIds`);
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

test('regular waves use eligible authored packs as readable formation trains', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign, 40);
  const packById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const usedPackIds = new Set();

  run.levels.forEach((level, stageIndex) => {
    const formationSector = generator.getWeeklyRunFormationSector(stageIndex);
    const threatCeiling = generator.getWeeklyRunRoleThreatCeiling(stageIndex);
    level.waves.filter((wave) => wave.events[0]?.kind === 'spawn').forEach((wave) => {
      assert.ok(wave.formationPackIds.length > 0, `${wave.id} declares its authored packs`);
      assert.equal(
        new Set(wave.formationPackIds).size,
        wave.formationPackIds.length,
        `${wave.id} declares each pack once`
      );
      const declaredPacks = wave.formationPackIds.map((packId) => {
        const pack = packById.get(packId);
        assert.ok(pack, `${wave.id} references real pack ${packId}`);
        usedPackIds.add(packId);
        assert.ok(pack.minimumSector <= formationSector, `${packId} is unlocked for depth ${stageIndex + 1}`);
        return pack;
      });

      let previousStart = -1;
      const resolvedIds = new Set();
      for (const event of wave.events) {
        const pack = resolveDeclaredFormationPack(event, declaredPacks);
        assert.ok(pack, `${event.id} resolves to exactly one declared formation pack`);
        resolvedIds.add(pack.id);
        assert.equal(event.patternId, pack.formationShape, `${event.id} keeps its authored shape`);
        assert.equal(event.positionId, 'formation-top', `${event.id} uses a stable formation outlet`);
        assert.ok(event.startSeconds > previousStart, `${event.id} enters after the previous group`);
        previousStart = event.startSeconds;
        assert.ok(event.count <= pack.enemyCount, `${event.id} stays within the authored pack size`);
        assert.ok(
          event.startSeconds + event.count * event.spawnIntervalSeconds + 5 <= wave.durationSeconds + 0.01,
          `${event.id} finishes entering before ${wave.id} can close`
        );
        assert.deepEqual(event.formationBehavior, {
          entryPathId: pack.entryPath,
          movementId: pack.movementBehavior,
          attackId: pack.attackBehavior,
          firingBehavior: pack.firingBehavior,
          returnId: pack.returnBehavior,
          holdSeconds: pack.holdSeconds,
          telegraphSeconds: pack.telegraphSeconds,
          attackDurationSeconds: pack.attackDurationSeconds,
          recoverySeconds: pack.attackRecoverySeconds,
          attackGroupSize: Math.min(event.count, pack.attackGroupSize),
          attackCycles: pack.attackCycles
        }, `${event.id} carries its authored entry and behavior`);
        for (const enemy of event.enemies) {
          const role = roleById.get(enemy.roleId);
          assert.ok(role, `${event.id} uses real role ${enemy.roleId}`);
          assert.ok(pack.enemyRoleIds.includes(role.id), `${role.id} belongs to ${pack.id}`);
          assert.ok(role.threatCost <= threatCeiling, `${role.id} respects the depth threat ceiling`);
          assert.ok(role.introductionSector <= formationSector, `${role.id} respects Campaign introduction order`);
        }
      }
      assert.deepEqual(
        [...resolvedIds].sort(),
        [...wave.formationPackIds].sort(),
        `${wave.id} uses every pack it declares`
      );
    });
  });

  assert.equal(usedPackIds.size, campaign.formationPacks.length, 'the deep runway unlocks the full formation catalog');
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
  assert.equal(elite.health, 120, 'every elite starts from the Weekly elite baseline');
  assert.equal(major.health, 500, 'every major starts from the Weekly major baseline');
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

test('boss health follows Weekly depth while modular component ratios stay authored', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign, 40);
  const effectiveByKind = { elite: [], major: [] };
  let componentBossCount = 0;

  for (const level of run.levels) {
    const wave = level.waves.at(-1);
    const generated = wave.events[0];
    const kind = wave.completionRule === 'boss-defeat' ? 'major' : 'elite';
    const expectedBaseHealth = kind === 'major' ? 500 : 120;
    assert.equal(generated.health, expectedBaseHealth, `${generated.bossId} uses normalized ${kind} health`);
    effectiveByKind[kind].push(
      generated.health * level.startingDifficulty * wave.difficultyMultiplier
    );

    const authored = findAuthoredBossEvent(generated.bossId);
    assert.ok(authored, `authored ${generated.bossId} exists`);
    if (!authored.componentHealth) continue;
    componentBossCount += 1;
    assert.ok(generated.componentHealth, `${generated.bossId} keeps its modular components`);
    for (const [componentId, authoredHealth] of Object.entries(authored.componentHealth)) {
      const authoredRatio = authoredHealth / authored.health;
      const generatedRatio = generated.componentHealth[componentId] / generated.health;
      assert.ok(
        Math.abs(authoredRatio - generatedRatio) < 0.00001,
        `${generated.bossId}/${componentId} preserves its body-health ratio`
      );
    }
  }

  for (const [kind, healthValues] of Object.entries(effectiveByKind)) {
    for (let index = 1; index < healthValues.length; index += 1) {
      assert.ok(
        healthValues[index] > healthValues[index - 1],
        `${kind} effective health must rise with Weekly depth`
      );
    }
  }
  assert.ok(componentBossCount > 0, 'the runway exercises modular boss health scaling');
  assert.ok(effectiveByKind.elite[0] < 200, 'the opening elite cannot inherit late-Campaign HP');
  assert.ok(effectiveByKind.major[0] < 1_000, 'the opening major cannot inherit late-Campaign HP');
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
  assert.match(startingLivesBlock, /resolveRunStartingLives\(\{/);
  assert.match(startingLivesBlock, /weeklyRun: runMode === 'weekly-streak'/);
  assert.match(startingLivesBlock, /startingHeartLevel: squadLoadout\.upgrades\.startingHearts/);
  assert.doesNotMatch(startingLivesBlock, /carriedWeeklyLives/);
  // Starting Hearts is a Campaign-only track; it must not reach the Weekly Run.
  assert.match(squad, /CAMPAIGN_MAX_STARTING_LIVES = 10/);
});

test('role-authored Weekly squadrons may share a chassis without becoming duplicates', async () => {
  const run = generator.buildWeeklyRunCampaign('2026-W32', campaign, 48);
  const sharedChassisEvent = run.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => (
      event.kind === 'spawn'
      && event.enemies.length > 1
      && new Set(event.enemies.map((enemy) => enemy.enemyId)).size < event.enemies.length
      && new Set(event.enemies.map((enemy) => enemy.roleId)).size === event.enemies.length
    ));
  assert.ok(sharedChassisEvent, 'the generated runway exercises distinct roles on one chassis');

  const browserIssues = validator.validateGameCampaign(run).issues.filter((issue) => (
    issue.code === 'duplicate_id'
    && (issue.path.includes('/enemies/enemyId') || issue.path.includes('/enemies/roleId'))
  ));
  assert.deepEqual(browserIssues, []);

  const { pathToFileURL } = require('node:url');
  const directorValidator = await import(pathToFileURL(
    path.join(root, 'director', 'server', 'gameCampaignValidation.mjs')
  ).href);
  const directorDuplicateErrors = directorValidator.validateGameCampaign(run).errors.filter((error) => (
    error.includes('/enemies contains duplicate enemyId')
    || error.includes('/enemies contains duplicate roleId')
  ));
  assert.deepEqual(directorDuplicateErrors, []);
});
