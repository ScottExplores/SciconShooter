const { isRevampMission, assertMissionCadence, assertRevampMission, bosses } = require('./helpers/campaignRevampAssertions.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const authoringUrl = pathToFileURL(path.join(root, 'tools', 'author-campaign-formation-choreography-v24.mjs')).href;
const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));
const collectBossEvents = (campaign) => campaign.levels.flatMap((level) => (
  level.waves.flatMap((wave) => wave.events.filter((event) => event.kind === 'boss'))
));
const spawnEvents = (campaign) => campaign.levels.flatMap((level) => (
  level.waves.flatMap((wave) => wave.events.filter((event) => event.kind === 'spawn'))
));
const firstSectorLevels = (campaign) => campaign.levels.filter((level) => level.order <= 5);
const preservedLevels = (campaign) => campaign.levels.filter((level) => level.order > 5);

// The one-shot v24 recipe is still tested against its original signatures.
// It must not be reapplied to the independently authored Breakwater sector.
const legacyRecipeFixture = () => {
  const campaign = readCampaign();
  const signatures = [
    ['stage-citation-storm', 2, 'primary', 'spiral', 8, ['role-citation-swarm', 'role-research-drone']],
    ['stage-citation-storm', 6, 'primary', 'grid', 5, ['role-research-drone']],
    ['stage-paywall-siege', 2, 'primary', 'pincer', 8, ['role-jet-interceptor', 'role-jet-scout', 'role-research-drone']],
    ['stage-open-galaxy', 2, 'primary', 'diamond', 8, ['role-jet-interceptor', 'role-protocol-vanguard']],
    ['stage-open-orbit-route-b', 2, 'event-1', 'spiral', 8, ['role-citation-swarm', 'role-research-drone']],
    ['stage-open-orbit-route-b', 6, 'event-1', 'grid', 5, ['role-research-drone']]
  ];
  const levels = new Map();
  for (const [levelId, waveNumber, suffix, patternId, count, roleIds] of signatures) {
    if (!levels.has(levelId)) levels.set(levelId, { id: levelId, waves: [] });
    const waveId = `${levelId}-wave-${waveNumber}`;
    levels.get(levelId).waves.push({ id: waveId, events: [{
      id: `${waveId}-${suffix}`, kind: 'spawn', patternId, count,
      enemies: roleIds.map((roleId) => ({ roleId }))
    }] });
  }
  campaign.levels = [...levels.values()];
  return campaign;
};

const requiredPackKeys = [
  'movementBehavior', 'attackBehavior', 'returnBehavior', 'holdSeconds', 'telegraphSeconds',
  'attackDurationSeconds', 'attackRecoverySeconds', 'attackGroupSize', 'attackCycles'
];

test('current Campaign retains its newer topology and complete pack choreography defaults', () => {
  const campaign = readCampaign();
  assert.ok(campaign.revision >= 25);
  assert.equal(campaign.levels.length, 60);
  assert.equal(new Set(campaign.campaignGraph.nodes.map(node => node.missionDefinitionId)).size, 60);
  campaign.levels.forEach(assertMissionCadence);
  assert.ok(spawnEvents(campaign).length >= 500);
  assert.equal(campaign.formationPacks.filter(pack => pack.id.startsWith('pack-breakwater-')).length, 25);
  assert.ok(campaign.formationPacks.filter(pack => pack.id.startsWith('pack-revamp-')).length >= 9);
  campaign.formationPacks.forEach(pack => {
    requiredPackKeys.forEach(key => assert.notEqual(pack[key], undefined, `${pack.id}/${key}`));
    assert.ok(pack.holdSeconds >= .35);
    assert.ok(pack.telegraphSeconds >= .2);
    assert.ok(pack.attackGroupSize >= 1 && pack.attackGroupSize <= pack.enemyCount);
  });

});

test('the first sector authors every grouped flight while later Mission overrides remain surgical', () => {
  const campaign = readCampaign();
  const overrides = spawnEvents(campaign).filter(event => event.formationBehavior);
  // REVAMP(I): dense squadrons consolidate the early sectors into fewer,
  // larger cohorts. Require full authored coverage instead of a stale count.
  const generated = campaign.levels.filter(isRevampMission);
  const generatedSpawns = spawnEvents({ levels: generated });
  assert.ok(generatedSpawns.length >= 72 && generatedSpawns.length <= 144);
  assert.ok(generatedSpawns.every(event => event.formationBehavior), 'every generated cohort authors its choreography');
  overrides.forEach(event => {
    assert.ok(event.formationBehavior.telegraphSeconds >= .2, event.id);
    assert.ok(event.formationBehavior.attackGroupSize <= event.count, event.id);
  });
  assert.equal(generated.length, 18, 'three sectors and their alternate routes');
  generated.forEach(level => assertRevampMission(level, campaign));
  const preserved = campaign.levels.filter(level => !isRevampMission(level));
  assert.ok(spawnEvents({ levels: preserved }).every(event => !event.id.includes('-revamp-')));

});

test('legacy choreography authoring repairs its original signatures idempotently without rewriting topology', async () => {
  const { authorCampaignFormationChoreography } = await import(authoringUrl);
  const campaign = legacyRecipeFixture();
  authorCampaignFormationChoreography(campaign);
  const graphBefore = structuredClone(campaign.campaignGraph);
  const sectorsBefore = structuredClone(campaign.sectors);
  const bossesBefore = structuredClone(collectBossEvents(campaign));
  const levelCount = campaign.levels.length;
  const waveCount = campaign.levels.reduce((sum, level) => sum + level.waves.length, 0);
  const spawnCount = spawnEvents(campaign).length;

  delete campaign.formationPacks[0].movementBehavior;
  const event = spawnEvents(campaign).find((candidate) => candidate.id === 'stage-open-orbit-route-b-wave-2-event-1');
  delete event.formationBehavior;

  const first = authorCampaignFormationChoreography(campaign);
  const authored = JSON.stringify(campaign);
  const second = authorCampaignFormationChoreography(campaign);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(JSON.stringify(campaign), authored);
  assert.equal(campaign.levels.length, levelCount);
  assert.equal(campaign.levels.reduce((sum, level) => sum + level.waves.length, 0), waveCount);
  assert.equal(spawnEvents(campaign).length, spawnCount);
  assert.deepEqual(campaign.campaignGraph, graphBefore);
  assert.deepEqual(campaign.sectors, sectorsBefore);
  assert.deepEqual(collectBossEvents(campaign), bossesBefore);
});

test('the legacy one-shot recipe refuses changed first-sector authoring instead of overwriting its flights', async () => {
  const { authorCampaignFormationChoreography } = await import(authoringUrl);
  const campaign = readCampaign();
  const levelsBefore = structuredClone(campaign.levels);
  assert.throws(() => authorCampaignFormationChoreography(campaign), /Missing Wave|Missing spawn event|Refusing to author changed spawn event/);
  assert.deepEqual(campaign.levels, levelsBefore);
});
