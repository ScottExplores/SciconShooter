const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const loadGauntlet = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'weeklyRunGauntlet.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.includes('levelConfig')) {
      return {
        DEFAULT_GAME_CAMPAIGN: campaign,
        cloneGameCampaign: (value) => JSON.parse(JSON.stringify(value || campaign))
      };
    }
    return require(request);
  };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, localRequire, module);`,
    { module, localRequire, Math, Object, Array, Number, String, JSON, Map, Set, Boolean }
  );
  return module.exports;
};

const bossEventsIn = (level) => level.waves.flatMap((wave) => (
  (wave.events || []).filter((event) => event.kind === 'boss').map((event) => event.bossId)
));

test('the Weekly Run visits every production-ready major boss exactly once', () => {
  const { buildWeeklyRunRoute } = loadGauntlet();
  const route = buildWeeklyRunRoute(campaign);

  // Every sector's major boss is reachable in one continuous run.
  const sectorBosses = new Set(campaign.sectors.map((sector) => sector.majorBossId));
  assert.equal(new Set(route.bossIds).size, route.bossIds.length, 'no boss is fought twice');
  for (const bossId of route.bossIds) {
    assert.ok(sectorBosses.has(bossId), `${bossId} is an authored major boss`);
  }
  assert.equal(route.bossIds.length, sectorBosses.size, 'every unique major boss is in the run');
  assert.ok(route.sectors.length >= 9, 'the run is a long-form gauntlet');
});

test('each Weekly Run sector escalates through elites into its boss', () => {
  const { buildWeeklyRunRoute } = loadGauntlet();
  const route = buildWeeklyRunRoute(campaign);
  const levelsById = new Map(campaign.levels.map((level) => [level.id, level]));

  route.sectors.forEach((sector) => {
    const levels = sector.missionIds.map((missionId) => levelsById.get(missionId));
    assert.ok(levels.every(Boolean), `${sector.sectorId} resolves every mission`);

    // Roles arrive in escalating order and the sector ends on its major boss.
    const roles = levels.map((level) => level.campaignProgression.missionRole);
    assert.equal(roles.at(-1), 'major-boss', `${sector.sectorId} ends on its boss`);
    assert.ok(
      roles.filter((role) => role === 'major-boss').length === 1,
      `${sector.sectorId} has exactly one boss finale`
    );

    // Elite encounters carry the ramp between the formations and the boss, so
    // the run is not just a boss rush with nothing in between.
    const encounters = levels.flatMap(bossEventsIn);
    const elites = encounters.filter((bossId) => bossId !== sector.majorBossId);
    assert.ok(elites.length >= 2, `${sector.sectorId} runs elites before its boss`);
    assert.ok(encounters.includes(sector.majorBossId), `${sector.sectorId} fights its own boss`);

    // Formation waves connect the encounters rather than the sector being a
    // bare chain of boss fights.
    const spawnWaves = levels.flatMap((level) => level.waves).filter((wave) => (
      (wave.events || []).some((event) => event.kind === 'spawn')
    ));
    assert.ok(spawnWaves.length >= 3, `${sector.sectorId} keeps connective combat waves`);
  });
});

test('the Weekly Run campaign is a reordering of authored content, not a copy', () => {
  const { buildWeeklyRunCampaign, buildWeeklyRunRoute, getWeeklyRunEntryPoint } = loadGauntlet();
  const route = buildWeeklyRunRoute(campaign);
  const runCampaign = buildWeeklyRunCampaign(campaign);

  assert.equal(runCampaign.levels.length, route.levelIds.length);
  // Sequential order is what makes the engine treat the whole run as one
  // continuous mission instead of returning home between sectors.
  runCampaign.levels.forEach((level, index) => {
    assert.equal(level.order, index, 'run levels are ordered contiguously');
    assert.equal(level.id, route.levelIds[index], 'run follows the authored route order');
  });

  // Levels are the authored ones: same ids, same wave counts. No boss or enemy
  // controller is duplicated to make the run work.
  const authoredById = new Map(campaign.levels.map((level) => [level.id, level]));
  runCampaign.levels.forEach((level) => {
    const authored = authoredById.get(level.id);
    assert.ok(authored, `${level.id} exists in the authored campaign`);
    assert.equal(level.waves.length, authored.waves.length);
  });

  const entry = getWeeklyRunEntryPoint(campaign);
  assert.equal(entry.levelId, runCampaign.levels[0].id);
  assert.equal(entry.waveId, runCampaign.levels[0].waves[0].id);
});

test('Weekly Run starting lives are fixed and independent of Campaign upgrades', () => {
  const { WEEKLY_RUN_STARTING_LIVES } = loadGauntlet();
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.equal(WEEKLY_RUN_STARTING_LIVES, 10);
  // Campaign Starting Hearts must not buy a longer competitive attempt, and
  // Campaign itself now tops out well below the Weekly Run's flat ten.
  assert.match(
    appSource,
    /runMode === 'weekly-streak'\s*\?\s*WEEKLY_RUN_STARTING_LIVES\s*:\s*Math\.min\(\s*CAMPAIGN_MAX_STARTING_LIVES,\s*CAMPAIGN_BASE_STARTING_LIVES \+ squadLoadout\.upgrades\.startingHearts\s*\)/
  );
});
