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
    health: 500,
    eventId: 'stage-bastion-protocol-major-boss',
    encounterAssetKey: 'PIXI_BOSS_OPEN_ORBIT_FRAMES'
  },
  {
    order: 10,
    bossId: 'paywall-decimator',
    health: 800,
    eventId: 'stage-null-sector-major-boss',
    encounterAssetKey: 'PIXI_BOSS_PAYWALL_FRAMES'
  },
  {
    order: 15,
    bossId: 'prism-moth',
    health: 1300,
    eventId: 'stage-ion-citadel-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_PRISM_MOTH'
  },
  {
    order: 20,
    bossId: 'frontier-crownclaw',
    health: 1600,
    eventId: 'stage-terminus-ascendant-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_FRONTIER_CROWNCLAW'
  },
  {
    order: 25,
    bossId: 'helios-clawcarrier',
    health: 2350,
    eventId: 'stage-prism-expanse-commander-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER'
  },
  {
    order: 30,
    bossId: 'nullwake-revenant',
    health: 2500,
    eventId: 'stage-rail-meridian-commander-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_NULLWAKE_REVENANT'
  },
  {
    order: 40,
    bossId: 'orbit-gyroscope',
    health: 2900,
    eventId: 'stage-gyroscope-array-commander-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE'
  },
  {
    order: 45,
    bossId: 'hammerhead-siege',
    health: 3150,
    eventId: 'stage-hammerhead-line-commander-major-boss',
    encounterAssetKey: 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE'
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

test('approved Campaign boss slots use one canonical roster consistently', () => {
  for (const expected of expectedBossSlots) {
    const { mission, sector, graphNode, event } = getBossSlot(expected.order);
    const missionLabel = `M${String(expected.order).padStart(2, '0')}`;

    assert.equal(event.id, expected.eventId, `${missionLabel} preserves its stable event ID`);
    assert.equal(event.bossId, expected.bossId, `${missionLabel} runtime event uses the approved boss`);
    assert.equal(event.health, expected.health, `${missionLabel} uses its approved authored hull`);
    assert.equal(sector.majorBossId, expected.bossId, `${missionLabel} sector uses the approved boss`);
    assert.equal(graphNode.bossId, expected.bossId, `${missionLabel} graph node uses the approved boss`);
    assert.equal(
      mission.scorecard.encounterAssetKey,
      expected.encounterAssetKey,
      `${missionLabel} scorecard uses the approved boss artwork`
    );
  }
});

test('promoted Test Bosses keep their exact authored timelines and Mission-scaled components', () => {
  const prism = getBossSlot(15).event;
  const frontier = getBossSlot(20).event;
  const helios = getBossSlot(25).event;
  const nullwake = getBossSlot(30).event;
  const aurora = getBossSlot(40).event;
  const gloamforge = getBossSlot(45).event;

  assert.equal(prism.componentMode, 'hull-only');
  assert.equal(prism.timeline.clips.length, 41);
  assert.deepEqual(frontier.componentHealth, {
    'left-cannon': 400,
    'right-cannon': 400
  });
  assert.equal(frontier.timeline.clips.length, 52);
  assert.deepEqual(helios.componentHealth, {
    'left-cannon': 600,
    'right-cannon': 600
  });
  assert.equal(helios.timeline.clips.length, 78);
  assert.equal(nullwake.componentMode, 'hull-only');
  assert.equal(nullwake.timeline.clips.length, 108);
  assert.deepEqual(nullwake.revival, {
    phaseId: 'sandbox-nullwake-backplane-crown',
    shutdownSeconds: 2.2,
    rebootSeconds: 2.6,
    restoreHealthRatio: 1,
    awakenedSizeMultiplier: 1.22
  });
  assert.equal(aurora.label, 'Aurora Oculus');
  assert.equal(aurora.rigId, 'paywall-siege');
  assert.equal(aurora.componentMode, 'hull-only');
  assert.equal(aurora.timeline.clips.length, 27);
  assert.equal(gloamforge.label, 'Gloamforge Mantis');
  assert.equal(gloamforge.rigId, 'paywall-siege');
  assert.equal(gloamforge.componentMode, 'hull-only');
  assert.equal(gloamforge.componentHealth, undefined);
  assert.equal(gloamforge.timeline.clips.length, 46);
});

test('authored Campaign hull health remains monotonic after the Revenant promotion', () => {
  const expectedHullByOrder = new Map([
    [5, 500],
    [10, 800],
    [15, 1300],
    [20, 1600],
    [25, 2350],
    [30, 2500],
    [35, 2700],
    [40, 2900],
    [45, 3150],
    [50, 3400]
  ]);
  let previousHull = 0;
  for (const [order, expectedHull] of expectedHullByOrder) {
    const { event } = getBossSlot(order);
    assert.equal(event.health, expectedHull, `M${order} approved authored hull`);
    assert.ok(event.health > previousHull, `M${order} exceeds the previous boss hull`);
    previousHull = event.health;
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
