const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const authoringUrl = pathToFileURL(
  path.join(root, 'tools', 'author-scicon-advanced-enemies-v1.mjs')
).href;

const EXPECTED = Object.freeze([
  { roleId: 'role-quasar-lancer', packId: 'pack-quasar-lance', key: 'SCICON_ENEMY_QUASAR_LANCER_FRAMES', enemyId: 'journal', sector: 6, specialAttack: 'lane-laser', path: 'side-wall-entry' },
  { roleId: 'role-null-bastion', packId: 'pack-null-bastion-phalanx', key: 'SCICON_ENEMY_NULL_BASTION_FRAMES', enemyId: 'brick', sector: 7, specialAttack: undefined, path: 'loop-the-loop' },
  { roleId: 'role-vector-reaver', packId: 'pack-vector-reaver-scissors', key: 'SCICON_ENEMY_VECTOR_REAVER_FRAMES', enemyId: 'swarm', sector: 8, specialAttack: undefined, path: 'paired-flank' },
  { roleId: 'role-rift-weaver', packId: 'pack-rift-weaver-helix', key: 'SCICON_ENEMY_RIFT_WEAVER_FRAMES', enemyId: 'drone', sector: 9, specialAttack: 'mine-fan', path: 'serpentine-weave' },
  { roleId: 'role-pulse-herald', packId: 'pack-pulse-herald-orbit', key: 'SCICON_ENEMY_PULSE_HERALD_FRAMES', enemyId: 'journal', sector: 10, specialAttack: 'ring-burst', path: 'ring-assemble' }
]);
const ADVANCED_ROLE_IDS = new Set(EXPECTED.map((entry) => entry.roleId));

const loadBundledModule = (relativePath) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, relativePath)],
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

const advancedSpawns = (sourceCampaign) => sourceCampaign.levels.flatMap((level) => (
  level.waves.flatMap((wave) => wave.events
    .filter((event) => event.kind === 'spawn')
    .flatMap((event) => event.enemies
      .filter((enemy) => ADVANCED_ROLE_IDS.has(enemy.roleId))
      .map((enemy) => ({ level, wave, event, enemy }))))
));

test('advanced roster authoring is idempotent and keeps a valid Campaign contract', async () => {
  const { authorSciconAdvancedEnemies } = await import(authoringUrl);
  const authored = structuredClone(campaign);
  const first = authorSciconAdvancedEnemies(authored);
  const once = JSON.stringify(authored);
  const second = authorSciconAdvancedEnemies(authored);
  assert.deepEqual(first, { roleCount: 5, packCount: 5, authoredEventCount: 29 });
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(authored), once);
  assert.deepEqual(authored, campaign, 'checked-in Campaign is the deterministic authoring result');

  const { validateGameCampaign } = loadBundledModule('game-config/validate.ts');
  const validation = validateGameCampaign(campaign);
  assert.equal(validation.valid, true, JSON.stringify(validation.issues.slice(0, 20), null, 2));
});

test('five generated hulls have unique sector-gated roles and formation packs', () => {
  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const packById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
  assert.equal(campaign.enemyRoles.length, 25);
  assert.equal(campaign.formationPacks.length, 16);

  for (const expected of EXPECTED) {
    const role = roleById.get(expected.roleId);
    const pack = packById.get(expected.packId);
    assert.ok(role, expected.roleId);
    assert.ok(pack, expected.packId);
    assert.equal(role.enemyId, expected.enemyId);
    assert.equal(role.spriteKey, expected.key);
    assert.equal(role.introductionSector, expected.sector);
    assert.equal(role.introductionMission, 1);
    assert.equal(role.specialAttack, expected.specialAttack);
    assert.deepEqual(role.compatibleFormationPackIds, [expected.packId]);
    assert.deepEqual(pack.enemyRoleIds, [expected.roleId]);
    assert.equal(pack.minimumSector, expected.sector);
    assert.equal(pack.entryDirection, 'split');
    assert.equal(pack.entryPath, expected.path);
    assert.equal(pack.enemyCount, 28);
    assert.equal(pack.maximumSimultaneousInstances, 3);
    assert.equal(pack.recoveryRequiredSeconds, 0.4);
  }
});

test('Campaign introductions and both route trains materialize every late hull with growing density', () => {
  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const levelById = new Map(campaign.levels.map((level) => [level.id, level]));
  const graphNodeById = new Map(campaign.campaignGraph.nodes.map((node) => [node.nodeId, node]));
  const authored = advancedSpawns(campaign);
  assert.equal(authored.length, 29);

  for (const expected of EXPECTED) {
    const sector = campaign.sectors.find((candidate) => candidate.order === expected.sector);
    const introduction = levelById.get(sector.missionIds[0]);
    const debut = authored.find(({ level, enemy }) => (
      level.id === introduction.id && enemy.roleId === expected.roleId
    ));
    assert.ok(debut, `${expected.roleId} debuts in Sector ${expected.sector}`);
    assert.equal(debut.enemy.health >= roleById.get(expected.roleId).threatCost + 3, true);
  }

  const trainTotals = [];
  for (const sector of campaign.sectors.filter((candidate) => candidate.order >= 6)) {
    const main = levelById.get(sector.missionIds[1]);
    const routeNode = graphNodeById.get(sector.routeNodeIds[0]);
    const alternate = levelById.get(routeNode.missionDefinitionId);
    for (const level of [main, alternate]) {
      const wave = level.waves.at(-2);
      const train = wave.events.filter((event) => event.id.includes('-advanced-enemy-v1-'));
      assert.equal(train.length, Math.min(3, sector.order - 5), `${level.id} stages its unlocked train`);
      assert.ok(train.every((event) => event.count >= 10 + sector.order - 6));
      assert.ok(train.every((event) => event.patternId !== 'single-random'));
      assert.ok(train.every((event) => event.startSeconds > 2.2));
      trainTotals.push({ sector: sector.order, total: train.reduce((sum, event) => sum + event.count, 0) });
    }
  }
  const averageForSector = (sector) => trainTotals
    .filter((entry) => entry.sector === sector)
    .reduce((sum, entry) => sum + entry.total, 0) / 2;
  assert.ok(averageForSector(10) > averageForSector(8));
  assert.ok(averageForSector(8) > averageForSector(6));
});

test('all Campaign specialist spawns carry the elite aimed-burst activation contract', () => {
  const specialByRole = new Map(EXPECTED
    .filter((entry) => entry.specialAttack)
    .map((entry) => [entry.roleId, entry.specialAttack]));
  const specialistSpawns = advancedSpawns(campaign)
    .filter(({ enemy }) => specialByRole.has(enemy.roleId));
  assert.ok(specialistSpawns.length >= 3);
  for (const { enemy } of specialistSpawns) {
    assert.equal(enemy.rank, 'elite', enemy.roleId);
    assert.equal(enemy.attackPatternId, 'aimed-burst', enemy.roleId);
    assert.ok(enemy.attackIntervalSeconds >= 2.6, enemy.roleId);
    assert.ok(enemy.projectileSpeed >= 4, enemy.roleId);
    assert.ok(enemy.burstCount >= 1, enemy.roleId);
    assert.equal(enemy.damage, 1, enemy.roleId);
  }
});

test('Weekly Run deterministically introduces every late hull by depth 48 and keeps scaling bounded', () => {
  const generator = loadBundledModule('services/weeklyRunGenerator.ts');
  const run = generator.buildWeeklyRunCampaign('2026-W32', campaign, 48);
  const firstStageByRole = new Map();
  const weeklySettingsByRole = new Map();
  for (const [stageIndex, level] of run.levels.entries()) {
    for (const enemy of level.waves.flatMap((wave) => wave.events
      .filter((event) => event.kind === 'spawn')
      .flatMap((event) => event.enemies))) {
      if (!ADVANCED_ROLE_IDS.has(enemy.roleId)) continue;
      if (!firstStageByRole.has(enemy.roleId)) firstStageByRole.set(enemy.roleId, stageIndex);
      weeklySettingsByRole.set(enemy.roleId, enemy);
    }
  }

  for (const expected of EXPECTED) {
    assert.equal(
      firstStageByRole.get(expected.roleId),
      (expected.sector - 1) * generator.WEEKLY_RUN_MAJOR_BOSS_INTERVAL,
      `${expected.roleId} is guaranteed when its Weekly sector band opens`
    );
    const setting = weeklySettingsByRole.get(expected.roleId);
    assert.equal(setting.spriteKey, expected.key);
    assert.equal(setting.damage, 1);
    if (expected.specialAttack) {
      assert.equal(setting.rank, 'elite');
      assert.equal(setting.attackPatternId, 'aimed-burst');
      assert.ok(setting.attackIntervalSeconds >= 2.6);
    }
  }

  const firstCombat = run.levels[0].waves.find((wave) => wave.events[0]?.kind === 'spawn');
  const lastCombat = run.levels.at(-1).waves.find((wave) => wave.events[0]?.kind === 'spawn');
  assert.ok(lastCombat.events.length > firstCombat.events.length);
  assert.ok(lastCombat.events[0].count > firstCombat.events[0].count);
  assert.ok(lastCombat.events.every((event) => event.count <= 28));

  const source = fs.readFileSync(path.join(root, 'services', 'weeklyRunGenerator.ts'), 'utf8');
  assert.match(source, /seen\.has\(role\.id\)/);
});
