const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);

const expectedBossSlots = [
  {
    order: 5,
    bossId: 'gatekeeper-prime',
    eventId: 'stage-bastion-protocol-major-boss',
    encounterAssetKey: 'PIXI_BOSS_OPEN_ORBIT_FRAMES'
  },
  {
    order: 10,
    bossId: 'paywall-decimator',
    eventId: 'stage-null-sector-major-boss',
    encounterAssetKey: 'PIXI_BOSS_PAYWALL_FRAMES'
  },
  {
    order: 15,
    bossId: 'prism-moth',
    eventId: 'stage-ion-citadel-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_PRISM_MOTH'
  },
  {
    order: 20,
    bossId: 'frontier-crownclaw',
    eventId: 'stage-terminus-ascendant-major-boss',
    encounterAssetKey: 'PIXI_BOSS_CROWNCLAW_FRAMES'
  },
  {
    order: 25,
    bossId: 'helios-clawcarrier',
    eventId: 'stage-prism-expanse-commander-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER'
  }
];

const getBossSlot = (order) => {
  const mission = campaign.levels.find((candidate) => candidate.order === order);
  assert.ok(mission, `M${String(order).padStart(2, '0')} exists`);

  const sector = campaign.sectors.find((candidate) => candidate.missionIds.includes(mission.id));
  assert.ok(sector, `${mission.id} belongs to a sector`);
  assert.equal(sector.missionIds.at(-1), mission.id, `${mission.id} is its sector finale`);

  const graphNode = campaign.campaignGraph.nodes.find(
    (candidate) => candidate.missionDefinitionId === mission.id
  );
  assert.ok(graphNode, `${mission.id} has a campaign graph node`);

  const bossEvents = mission.waves
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss');
  assert.equal(bossEvents.length, 1, `${mission.id} has exactly one boss encounter`);

  return { mission, sector, graphNode, event: bossEvents[0] };
};

test('M05 through M25 use the approved Campaign boss roster consistently', () => {
  for (const expected of expectedBossSlots) {
    const { mission, sector, graphNode, event } = getBossSlot(expected.order);
    const missionLabel = `M${String(expected.order).padStart(2, '0')}`;

    assert.equal(event.id, expected.eventId, `${missionLabel} preserves its stable event ID`);
    assert.equal(event.bossId, expected.bossId, `${missionLabel} runtime event uses the approved boss`);
    assert.equal(sector.majorBossId, expected.bossId, `${missionLabel} sector uses the approved boss`);
    assert.equal(graphNode.bossId, expected.bossId, `${missionLabel} graph node uses the approved boss`);
    assert.equal(
      mission.scorecard.encounterAssetKey,
      expected.encounterAssetKey,
      `${missionLabel} scorecard uses the approved boss artwork`
    );
  }
});

test('M05 Gatekeeper Prime starts at 500 hull health with two 33-percent cannons', () => {
  const { event } = getBossSlot(5);

  assert.equal(event.bossId, 'gatekeeper-prime');
  assert.equal(event.health, 500);
  assert.deepEqual(event.componentHealth, {
    'left-cannon': 165,
    'right-cannon': 165
  });
  assert.equal(event.componentHealth['left-cannon'] / event.health, 0.33);
  assert.equal(event.componentHealth['right-cannon'] / event.health, 0.33);
});
