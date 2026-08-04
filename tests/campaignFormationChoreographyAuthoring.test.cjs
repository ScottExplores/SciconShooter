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

const requiredPackKeys = [
  'movementBehavior', 'attackBehavior', 'returnBehavior', 'holdSeconds', 'telegraphSeconds',
  'attackDurationSeconds', 'attackRecoverySeconds', 'attackGroupSize', 'attackCycles'
];

test('current Campaign retains its newer topology and complete pack choreography defaults', () => {
  const campaign = readCampaign();
  assert.equal(campaign.revision, 24);
  assert.equal(campaign.levels.length, 60);
  // 311 waves / 628 spawn events after the sector-aware surge pass
  // (introductions grow to 7 from sector 7, first remixes to 8 from sector 4).
  assert.equal(campaign.levels.reduce((sum, level) => sum + level.waves.length, 0), 311);
  assert.equal(spawnEvents(campaign).length, 628);
  assert.equal(campaign.formationPacks.length, 11);
  campaign.formationPacks.forEach((pack) => {
    requiredPackKeys.forEach((key) => assert.notEqual(pack[key], undefined, `${pack.id}/${key}`));
    assert.ok(pack.holdSeconds >= 0.35, pack.id);
    assert.ok(pack.telegraphSeconds >= 0.2, pack.id);
    assert.ok(pack.attackGroupSize >= 1 && pack.attackGroupSize <= pack.enemyCount, pack.id);
  });
});

test('surgical Wave overrides are authored only on matching current-main encounters', () => {
  const campaign = readCampaign();
  const overrides = spawnEvents(campaign).filter((event) => event.formationBehavior);
  assert.equal(overrides.length, 6);
  overrides.forEach((event) => {
    assert.ok(event.formationBehavior.telegraphSeconds >= 0.2, event.id);
    assert.ok(event.formationBehavior.attackGroupSize <= event.count, event.id);
  });
  assert.deepEqual(
    overrides.map((event) => event.id).sort(),
    [
      'stage-citation-storm-wave-2-primary',
      'stage-citation-storm-wave-6-primary',
      'stage-open-galaxy-wave-2-primary',
      'stage-open-orbit-route-b-wave-2-event-1',
      'stage-open-orbit-route-b-wave-6-event-1',
      'stage-paywall-siege-wave-2-primary'
    ]
  );
});

test('choreography authoring repairs safe drift without rewriting current-main topology', async () => {
  const { authorCampaignFormationChoreography } = await import(authoringUrl);
  const campaign = readCampaign();
  const graphBefore = structuredClone(campaign.campaignGraph);
  const sectorsBefore = structuredClone(campaign.sectors);
  const bossesBefore = structuredClone(collectBossEvents(campaign));
  const levelCount = campaign.levels.length;
  const waveCount = campaign.levels.reduce((sum, level) => sum + level.waves.length, 0);
  const spawnCount = spawnEvents(campaign).length;

  delete campaign.formationPacks[0].movementBehavior;
  const event = spawnEvents(campaign).find((candidate) => candidate.id === 'stage-citation-storm-wave-2-primary');
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
