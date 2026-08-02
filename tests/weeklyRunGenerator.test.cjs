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

const generator = loadGenerator();

test('the Weekly Run is endless and never stops escalating', () => {
  const run = generator.buildWeeklyRunCampaign('2026-W31', campaign);

  // The old run was a fixed 27-mission tour of authored Campaign content. This
  // one keeps going: depth is limited only by how long the player survives.
  assert.equal(run.levels.length, generator.WEEKLY_RUN_STAGE_COUNT);
  assert.ok(run.levels.length >= 40, 'the ladder must be deeper than any survivable run');

  const difficulties = run.levels.map((level) => level.startingDifficulty);
  for (let index = 1; index < difficulties.length; index += 1) {
    assert.ok(
      difficulties[index] > difficulties[index - 1],
      `depth ${index + 1} must be harder than depth ${index}`
    );
  }
  assert.ok(difficulties.at(-1) > difficulties[0] * 5, 'the deep end must be dramatically harder');
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

  // The first boss a player meets is an elite, not a major boss.
  const firstBossStage = stages.find((stage) => stage.kind !== 'combat');
  assert.equal(firstBossStage.kind, 'elite');

  const eliteIds = new Set(campaign.miniBosses.map((entry) => entry.bossId));
  const majorIds = new Set(campaign.sectors.map((sector) => sector.majorBossId));
  for (const stage of stages) {
    if (stage.kind === 'elite') assert.equal(eliteIds.has(stage.bossId), true, stage.bossId);
    if (stage.kind === 'major') assert.equal(majorIds.has(stage.bossId), true, stage.bossId);
    if (stage.kind === 'combat') assert.equal(stage.bossId, null);
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
  assert.ok(spawnEvents > 100, 'the run should author a lot of combat');
  assert.ok(bossEvents >= 10, 'the run should author a lot of bosses');
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
  assert.match(app, /runMode === 'weekly-streak'\s*\?\s*WEEKLY_RUN_STARTING_LIVES/);
  // Starting Hearts is a Campaign-only track; it must not reach the Weekly Run.
  assert.match(squad, /CAMPAIGN_MAX_STARTING_LIVES = 5/);
});
