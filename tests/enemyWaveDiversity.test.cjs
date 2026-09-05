const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const RETIRED_KEYS = new Set([
  'PIXI_JET_SCOUT_FRAMES',
  'PIXI_JET_INTERCEPTOR_FRAMES',
  'PIXI_JET_HEAVY_FRAMES',
  'SCICON_ENEMY_QUASAR_LANCER_FRAMES',
  'SCICON_ENEMY_VECTOR_REAVER_FRAMES'
]);

const RETRACTION_ROLE_KEYS = Object.freeze({
  'role-jet-scout': 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES',
  'role-jet-interceptor': 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES',
  'role-jet-heavy': 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES',
  'role-quasar-lancer': 'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES',
  'role-vector-reaver': 'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES'
});

const DEBUT_PACKS_BY_SECTOR = Object.freeze({
  6: 'pack-quasar-lance',
  7: 'pack-null-bastion-phalanx',
  8: 'pack-vector-reaver-scissors',
  9: 'pack-rift-weaver-helix',
  10: 'pack-pulse-herald-orbit'
});

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

const spawnEvents = (sourceCampaign) => sourceCampaign.levels.flatMap((level) => (
  level.waves.flatMap((wave) => wave.events.filter((event) => event.kind === 'spawn'))
));

const waveSignature = (wave) => wave.events
  .filter((event) => event.kind === 'spawn')
  .map((event) => `${event.patternId}:${event.enemies.map((enemy) => enemy.spriteKey).sort().join(',')}`)
  .join('|');

test('active Campaign roster contains only the Retraction Fleet replacements', () => {
  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  for (const [roleId, spriteKey] of Object.entries(RETRACTION_ROLE_KEYS)) {
    const role = roleById.get(roleId);
    assert.ok(role, roleId);
    assert.equal(role.spriteKey, spriteKey);
    assert.ok(role.synergyTags.includes('retraction-fleet'), roleId);
  }

  const activeKeys = new Set([
    ...campaign.enemyRoles.map((role) => role.spriteKey),
    ...spawnEvents(campaign).flatMap((event) => event.enemies.map((enemy) => enemy.spriteKey))
  ]);
  for (const retiredKey of RETIRED_KEYS) {
    assert.equal(activeKeys.has(retiredKey), false, `${retiredKey} must stay retired`);
  }
});

test('Campaign waves keep mixed cohorts and avoid repeated copy-paste signatures', () => {
  const breakwaterMissionIds = new Set(campaign.sectors[0].missionIds);
  const breakwater = campaign.levels.filter(level => breakwaterMissionIds.has(level.id));
  // Breakwater gives each entering wing a consistent silhouette and mixes
  // tactical roles between wings. Preserve the mixed-pool contract elsewhere.
  const events = spawnEvents({ levels: campaign.levels.filter(level => !breakwaterMissionIds.has(level.id)) });
  const homogeneousEvents = events.filter((event) => (
    new Set(event.enemies.map((enemy) => enemy.spriteKey)).size === 1
  ));
  assert.ok(homogeneousEvents.length / events.length <= 0.2, 'homogeneous event ratio regressed');
  assert.ok(spawnEvents({ levels: breakwater }).every(event => event.enemies.length === 1));
  const mixedWingWaves = breakwater.flatMap(level => level.waves).filter(wave => new Set(
    wave.events.filter(event => event.kind === 'spawn').flatMap(event => event.enemies.map(enemy => enemy.roleId))
  ).size >= 2);
  assert.ok(mixedWingWaves.length >= 10, 'single-role wings combine into distinct tactical encounters');

  const authoredCohorts = events.filter((event) => event.id.includes('-advanced-enemy-v1-'));
  assert.equal(authoredCohorts.length, 29);
  assert.ok(authoredCohorts.every((event) => event.count <= 12));
  assert.ok(authoredCohorts.every((event) => new Set(
    event.enemies.map((enemy) => enemy.spriteKey)
  ).size === 3));

  const diversifiedWaveIds = new Set(campaign.levels.flatMap((level) => level.waves
    .filter((wave) => wave.events.some((event) => event.label?.endsWith(' · Retraction mix')))
    .map((wave) => wave.id)));
  // Eight first-sector mix labels were replaced by the authored Breakwater
  // wings above; the remaining eighteen mixed-pool remixes stay intact.
  assert.equal(diversifiedWaveIds.size, 18);

  let repeatedAdjacentSignatures = 0;
  let repeatedRetractionSignatures = 0;
  let previous = '';
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const signature = waveSignature(wave);
      if (signature && signature === previous) {
        repeatedAdjacentSignatures += 1;
        if (Object.values(RETRACTION_ROLE_KEYS).some((key) => signature.includes(key))) {
          repeatedRetractionSignatures += 1;
        }
      }
      previous = signature;
    }
  }
  assert.ok(repeatedAdjacentSignatures <= 4, `found ${repeatedAdjacentSignatures} repeated wave signatures`);
  assert.equal(repeatedRetractionSignatures, 0, 'Retraction Fleet waves may not repeat back-to-back');
});

test('Weekly Run debuts late packs once per band and cools down recent formations', () => {
  const generator = loadBundledModule('services/weeklyRunGenerator.ts');
  const weekKeys = Array.from({ length: 12 }, (_, index) => `2026-W${21 + index}`);

  for (const weekKey of weekKeys) {
    const run = generator.buildWeeklyRunCampaign(weekKey, campaign, 48);
    if (weekKey === weekKeys[0]) {
      assert.deepEqual(run, generator.buildWeeklyRunCampaign(weekKey, campaign, 48));
    }
    const packsById = new Map(campaign.formationPacks.map((pack) => [pack.id, pack]));
    run.levels.forEach((level, stageIndex) => {
      const sectorOrder = generator.getWeeklyRunFormationSector(stageIndex);
      const sectorId = campaign.sectors.find((sector) => sector.order === Math.min(sectorOrder, 10)).id;
      for (const wave of level.waves) {
        for (const packId of wave.formationPackIds) {
          assert.ok(packsById.get(packId).compatibleSectorIds.includes(sectorId),
            `${weekKey} ${packId} cannot crowd a later sector with an opening-only variant`);
        }
      }
    });

    const events = spawnEvents(run);
    const homogeneousEvents = events.filter((event) => (
      new Set(event.enemies.map((enemy) => enemy.spriteKey)).size === 1
    ));
    assert.ok(
      homogeneousEvents.length / events.length <= 0.2,
      `${weekKey} homogeneous event ratio regressed`
    );
    assert.equal(events.some((event) => event.enemies.some((enemy) => (
      RETIRED_KEYS.has(enemy.spriteKey)
    ))), false, `${weekKey} reused a retired sprite`);

    for (const [sectorText, packId] of Object.entries(DEBUT_PACKS_BY_SECTOR)) {
      const sector = Number(sectorText);
      const bandLevels = run.levels.filter((_, stageIndex) => (
        generator.getWeeklyRunFormationSector(stageIndex) === sector
      ));
      const combatWaves = bandLevels.flatMap((level) => level.waves.filter((wave) => (
        wave.events.some((event) => event.kind === 'spawn')
      )));
      const showcaseWaves = combatWaves.filter((wave) => wave.formationPackIds.includes(packId));
      assert.equal(showcaseWaves.length, 1, `${weekKey} ${packId} should have one debut showcase`);
    }

    const combatWaves = run.levels.flatMap((level) => level.waves.filter((wave) => (
      wave.events.some((event) => event.kind === 'spawn')
    )));
    let repeatedAdjacentTrains = 0;
    for (let index = 1; index < combatWaves.length; index += 1) {
      const previous = `${combatWaves[index - 1].formationPackIds.join(',')}|${waveSignature(combatWaves[index - 1])}`;
      const current = `${combatWaves[index].formationPackIds.join(',')}|${waveSignature(combatWaves[index])}`;
      if (current === previous) repeatedAdjacentTrains += 1;
    }
    assert.equal(repeatedAdjacentTrains, 0, `${weekKey} repeated an adjacent formation train`);
  }
});
