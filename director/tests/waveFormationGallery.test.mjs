import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const directorRoot = path.join(repositoryRoot, 'director');
const campaign = JSON.parse(await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8'));
const server = await createServer({
  root: repositoryRoot,
  configFile: false,
  appType: 'custom',
  resolve: {
    alias: {
      '@director': path.join(directorRoot, 'src'),
      '@game': repositoryRoot
    }
  },
  server: { middlewareMode: true, hmr: false }
});
const model = await server.ssrLoadModule('/director/src/tools/wave-gallery/waveGalleryModel.ts');

after(async () => {
  await server.close();
});

test('Wave Gallery groups every Campaign mission once under its authored sector', () => {
  const sectors = model.buildWaveGallerySectors(campaign);
  const missionIds = sectors.flatMap((sector) => sector.missions.map((mission) => mission.id));

  assert.equal(sectors.length, campaign.sectors.length);
  assert.equal(missionIds.length, campaign.levels.length);
  assert.equal(new Set(missionIds).size, campaign.levels.length);
  assert.equal(sectors[0].id, campaign.sectors[0].id);
  assert.ok(sectors.every((sector) => sector.missions.length > 0));
  assert.deepEqual([...sectors[0].primaryMissionIds], campaign.sectors[0].missionIds);
});

test('weighted enemy previews preserve the exact authored event count', () => {
  const event = {
    id: 'gallery-allocation',
    kind: 'spawn',
    label: 'Gallery allocation',
    startSeconds: 0,
    durationSeconds: 4,
    delayAfterSeconds: 0,
    blocksWaveClock: false,
    count: 7,
    patternId: 'v',
    positionId: 'formation-top',
    spawnIntervalSeconds: 0.2,
    enemies: [
      {
        enemyId: 'drone',
        roleId: 'role-a',
        spriteKey: 'ENEMY_DRONE_FRAMES',
        weight: 0.6,
        health: 2,
        speed: 2,
        damage: 1,
        scoreValue: 10,
        powerupDropChance: 0
      },
      {
        enemyId: 'swarm',
        roleId: 'role-b',
        spriteKey: 'ENEMY_SWARM_FRAMES',
        weight: 0.4,
        health: 1,
        speed: 3,
        damage: 1,
        scoreValue: 10,
        powerupDropChance: 0
      }
    ]
  };
  const allocations = model.allocateSpawnEnemyCounts(event);

  assert.deepEqual(allocations.map((allocation) => allocation.count), [4, 3]);
  assert.ok(Math.abs(allocations[0].expectedCount - 4.2) < 0.000_001);
  assert.ok(Math.abs(allocations[1].expectedCount - 2.8) < 0.000_001);
  assert.equal(allocations.reduce((sum, allocation) => sum + allocation.count, 0), event.count);
  assert.ok(allocations.every((allocation) => allocation.assetPath.startsWith('/game-art/')));
});

test('every tracked wave builds a bounded visual roster without missing enemy art', () => {
  let waveCount = 0;
  for (const mission of campaign.levels) {
    for (const wave of mission.waves) {
      const summary = model.buildWaveGallerySummary(wave, campaign);
      waveCount += 1;
      for (const formation of summary.spawnEvents) {
        assert.equal(formation.members.length, formation.event.count, formation.event.id);
        assert.ok(formation.allocations.every((allocation) => allocation.assetPath.startsWith('/game-art/')));
        assert.ok(formation.members.every((member) => (
          member.leftPercent >= 0 && member.leftPercent <= 100
            && member.topPercent >= 0 && member.topPercent <= 100
        )), formation.event.id);
      }
    }
  }
  assert.equal(waveCount, campaign.levels.reduce((sum, mission) => sum + mission.waves.length, 0));
});

test('Wave Gallery summary uses the live formation geometry and campaign role metadata', () => {
  const mission = campaign.levels.find((candidate) => candidate.id === 'stage-citation-storm');
  const wave = mission.waves.find((candidate) => candidate.id === 'stage-citation-storm-wave-2');
  const summary = model.buildWaveGallerySummary(wave, campaign);

  assert.equal(summary.enemyCount, 12);
  assert.equal(summary.formationCount, 2);
  assert.equal(summary.enemyTypeCount, 2);
  assert.equal(summary.spawnEvents[0].formationLabel, 'Double V');
  assert.equal(summary.spawnEvents[0].members.length, 8);
  assert.equal(summary.spawnEvents[1].members.length, 4);
  assert.deepEqual(summary.spawnEvents.map(entry => entry.event.patternId), ['double-v', 'arc']);
  assert.ok(summary.spawnEvents[0].allocations.every((allocation) => allocation.role?.label));
  assert.ok(summary.spawnEvents[0].members.every((member) => (
    member.leftPercent >= 0 && member.leftPercent <= 100
      && member.topPercent >= 0 && member.topPercent <= 100
  )));
});

test('Wave Gallery labels boss, elite-enemy, and elite-unit encounters distinctly', () => {
  const bossEvent = campaign.levels
    .flatMap((mission) => mission.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss' && event.bossId === 'gatekeeper-prime');
  const eliteMission = campaign.levels.find((mission) => mission.order === 8);
  const eliteEvent = eliteMission?.waves
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss');

  assert.ok(bossEvent);
  assert.ok(eliteEvent);
  assert.equal(model.describeSupportEvent(bossEvent).kindLabel, 'BOSS');
  assert.equal(model.describeSupportEvent(bossEvent).encounterClass, 'boss');
  assert.equal(model.describeSupportEvent(eliteEvent).kindLabel, 'ELITE ENEMY');
  assert.equal(model.describeSupportEvent(eliteEvent).encounterClass, 'elite-enemy');
  assert.equal(model.getMissionEncounterSummary(eliteMission).kindLabel, 'ELITE ENEMY');
});

test('Wave Gallery surface is explicitly read-only and loads the disk campaign', async () => {
  const source = await readFile(
    path.join(directorRoot, 'src', 'tools', 'wave-gallery', 'WaveFormationGallery.tsx'),
    'utf8'
  );

  assert.match(source, /fetchGameCampaign<GameCampaignConfig>/);
  assert.match(source, /ELITE UNIT/);
  assert.match(source, /description\.kindLabel/);
  assert.match(source, /Read only · no save or publish controls/);
  assert.doesNotMatch(source, /applyGameCampaign|updateWorkspaceResource|saveDraft|publishConfig/);
});
