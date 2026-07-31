import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..');
const trackedCampaign = JSON.parse(await readFile(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const makeValidGraphCampaign = () => {
  const campaign = structuredClone(trackedCampaign);
  // Keep this contract suite focused on the explicit graph rather than older
  // optional mastery-map spacing or an in-flight authored introduction schedule.
  delete campaign.campaignBranches;
  campaign.sectors.forEach((sector) => {
    sector.branchIds = [];
  });
  campaign.enemyRoles.forEach((role) => {
    role.introductionSector = 1;
    role.introductionMission = 1;
  });
  campaign.formationPacks.forEach((pack) => {
    if (!pack.compatibleMissionRoles.includes('major-boss')) pack.compatibleMissionRoles.push('major-boss');
  });
  return campaign;
};

const makeLegacyCampaign = () => {
  const campaign = makeValidGraphCampaign();
  const mainMissionIds = new Set(campaign.sectors.flatMap((sector) => sector.missionIds));
  campaign.levels = campaign.levels.filter((level) => mainMissionIds.has(level.id));
  campaign.levels.filter((level) => level.campaignProgression.missionRole === 'major-boss').forEach((level) => {
    level.waves = [structuredClone(level.waves.at(-1))];
    level.waves[0].order = 1;
  });
  campaign.sectors.forEach((sector) => {
    delete sector.mainNodeIds;
    delete sector.routeNodeIds;
  });
  delete campaign.campaignGraph;
  return campaign;
};

const errorsFor = (campaign) => validateGameCampaign(campaign).errors.join('\n');

test('Director accepts a complete explicit Campaign graph and its alternate Mission ownership', () => {
  const campaign = makeValidGraphCampaign();
  assert.ok(campaign.sectors.every((sector) => sector.mainNodeIds.length === 5));
  assert.ok(campaign.sectors.every((sector) => sector.routeNodeIds.length > 0));
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
});

test('Director preserves legacy Campaign packages that omit graph fields', () => {
  const campaign = makeLegacyCampaign();
  assert.equal('campaignGraph' in campaign, false);
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
});

test('graph, node, edge, route-summary, and map objects reject unsupported fields', () => {
  const cases = [
    ['graph', (campaign) => { campaign.campaignGraph.unexpected = true; }, /campaignGraph contains unsupported fields/],
    ['node', (campaign) => { campaign.campaignGraph.nodes[0].unexpected = true; }, /campaignGraph\/nodes\/0 contains unsupported fields/],
    ['edge', (campaign) => { campaign.campaignGraph.nodes[0].outgoingEdges[0].unexpected = true; }, /outgoingEdges\/0 contains unsupported fields/],
    ['route summary', (campaign) => { campaign.campaignGraph.nodes[0].routeSummary.unexpected = true; }, /routeSummary contains unsupported fields/],
    ['map position', (campaign) => { campaign.campaignGraph.nodes[0].mapPosition.unexpected = true; }, /mapPosition contains unsupported fields/]
  ];
  cases.forEach(([label, mutate, pattern]) => {
    const campaign = makeValidGraphCampaign();
    mutate(campaign);
    assert.match(errorsFor(campaign), pattern, label);
  });
});

test('entry, Mission, edge, and sector node references are stable', () => {
  const unknownEntry = makeValidGraphCampaign();
  unknownEntry.campaignGraph.entryNodeId = 'node-missing';
  assert.match(errorsFor(unknownEntry), /entryNodeId references unknown/);

  const unknownMission = makeValidGraphCampaign();
  unknownMission.campaignGraph.nodes[0].missionDefinitionId = 'missing-mission';
  assert.match(errorsFor(unknownMission), /missionDefinitionId references unknown Campaign Mission/);

  const unknownEdgeTarget = makeValidGraphCampaign();
  unknownEdgeTarget.campaignGraph.nodes[0].outgoingEdges[0].toNodeId = 'node-missing';
  assert.match(errorsFor(unknownEdgeTarget), /toNodeId references unknown Campaign graph node/);

  const unknownSectorNode = makeValidGraphCampaign();
  unknownSectorNode.sectors[0].routeNodeIds[0] = 'node-missing';
  assert.match(errorsFor(unknownSectorNode), /routeNodeIds\/0 references unknown Campaign graph node/);
});

test('the directed graph must be reachable, acyclic, and strictly forward', () => {
  const disconnected = makeValidGraphCampaign();
  disconnected.campaignGraph.nodes[0].outgoingEdges = disconnected.campaignGraph.nodes[0].outgoingEdges.slice(0, 1);
  assert.match(errorsFor(disconnected), /disconnected|unreachable/);

  const cyclic = makeValidGraphCampaign();
  const finalNode = cyclic.campaignGraph.nodes.at(-1);
  finalNode.outgoingEdges.push({
    edgeId: 'edge-test-cycle',
    toNodeId: cyclic.campaignGraph.entryNodeId,
    routeId: 'test-cycle',
    label: 'Cycle',
    kind: 'crossing',
    risk: 'high',
    weeklyScoreMultiplier: 1
  });
  assert.match(errorsFor(cyclic), /higher-depth node|directed cycle/);
  assert.match(errorsFor(cyclic), /directed cycle/);
});

test('route siblings have distinct labels and one consistent reachable rejoin', () => {
  const duplicateLabel = makeValidGraphCampaign();
  const [routeA, routeB] = duplicateLabel.campaignGraph.nodes.filter((node) => (
    node.sectorId === duplicateLabel.sectors[0].id && node.depth === 2
  ));
  routeB.displayLabel = routeA.displayLabel;
  assert.match(errorsFor(duplicateLabel), /sibling nodes.*distinct displayLabel/);

  const mismatchedRejoin = makeValidGraphCampaign();
  const alternative = mismatchedRejoin.campaignGraph.nodes.find((node) => node.nodeId === routeB.nodeId);
  alternative.rejoinNodeId = mismatchedRejoin.sectors[0].mainNodeIds[3];
  assert.match(errorsFor(mismatchedRejoin), /must target the owning node's rejoinNodeId|must share one rejoinNodeId/);
});

test('each sector has one matching major-boss node in its fifth main slot', () => {
  const campaign = makeValidGraphCampaign();
  const bossNode = campaign.campaignGraph.nodes.find((node) => node.nodeId === campaign.sectors[0].mainNodeIds[4]);
  bossNode.bossId = null;
  assert.match(errorsFor(campaign), /must contain exactly one major boss Campaign graph node/);
});

test('graph boss Missions require one active intercept and one matching final boss Wave', () => {
  const tooShort = makeValidGraphCampaign();
  const bossMission = tooShort.levels.find((level) => level.id === tooShort.sectors[0].missionIds[4]);
  bossMission.waves = [bossMission.waves.at(-1)];
  bossMission.waves[0].order = 1;
  const shortErrors = errorsFor(tooShort);
  assert.match(shortErrors, /must contain 2 waves for major-boss/);

  const earlyBoss = makeValidGraphCampaign();
  const earlyBossMission = earlyBoss.levels.find((level) => level.id === earlyBoss.sectors[0].missionIds[4]);
  earlyBossMission.waves[0].events.push(structuredClone(earlyBossMission.waves.at(-1).events.find((event) => event.kind === 'boss')));
  assert.match(errorsFor(earlyBoss), /must be a non-major-boss lead-in or recovery Wave/);
});

test('enemy roles cannot appear before their configured sector Mission introduction', () => {
  const campaign = makeValidGraphCampaign();
  const firstSpawn = campaign.levels[0].waves.flatMap((wave) => wave.events).find((event) => event.kind === 'spawn');
  const role = campaign.enemyRoles.find((candidate) => candidate.id === firstSpawn.enemies[0].roleId);
  role.introductionSector = 10;
  role.introductionMission = 5;
  assert.match(errorsFor(campaign), /before its Sector 10 Mission 5 introduction/);
});
