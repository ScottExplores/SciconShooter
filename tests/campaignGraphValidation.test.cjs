const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const compileBrowserValidator = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'game-config', 'validate.ts')],
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

const { validateGameCampaign } = compileBrowserValidator();
const readCampaign = () => JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const cloneCampaign = () => structuredClone(readCampaign());
const graphNode = (campaign, nodeId) => campaign.campaignGraph.nodes.find((node) => node.nodeId === nodeId);
const issueMatches = (result, code, pathFragment = '') => result.issues.some((issue) => (
  issue.code === code && issue.path.includes(pathFragment)
));

test('tracked Campaign passes browser graph validation', () => {
  const result = validateGameCampaign(readCampaign());
  assert.deepEqual(result, { valid: true, issues: [] });
});

test('enemy fire policy requires readable delays and compatible elite-only roles', () => {
  const missingDelay = cloneCampaign();
  delete missingDelay.enemyRoles[0].fireDelaySeconds;
  assert.equal(
    issueMatches(validateGameCampaign(missingDelay), 'required_number', '/enemyRoles/0/fireDelaySeconds'),
    true
  );

  const tooFast = cloneCampaign();
  const firingRoleIndex = tooFast.enemyRoles.findIndex((role) => role.fireBehavior !== 'none');
  tooFast.enemyRoles[firingRoleIndex].fireDelaySeconds = 0.25;
  assert.equal(
    issueMatches(validateGameCampaign(tooFast), 'invalid_value', `/enemyRoles/${firingRoleIndex}/fireDelaySeconds`),
    true
  );

  const neverFires = cloneCampaign();
  const passiveRoleIndex = neverFires.enemyRoles.findIndex((role) => role.fireBehavior === 'none');
  neverFires.enemyRoles[passiveRoleIndex].fireDelaySeconds = 1;
  assert.equal(
    issueMatches(validateGameCampaign(neverFires), 'invalid_value', `/enemyRoles/${passiveRoleIndex}/fireDelaySeconds`),
    true
  );

  const incompatibleElite = cloneCampaign();
  const standardRoleIndex = incompatibleElite.enemyRoles.findIndex((role) => role.durabilityClass === 'standard');
  incompatibleElite.enemyRoles[standardRoleIndex].fireBehavior = 'elite-only';
  assert.equal(
    issueMatches(validateGameCampaign(incompatibleElite), 'incompatible_reference', `/enemyRoles/${standardRoleIndex}/fireBehavior`),
    true
  );
});

test('legacy Campaign packages may omit graph and sector graph-node fields', () => {
  const campaign = cloneCampaign();
  delete campaign.campaignGraph;
  delete campaign.campaignBranches;
  const mainMissionIds = new Set(campaign.sectors.flatMap((sector) => sector.missionIds));
  campaign.levels = campaign.levels.filter((mission) => mainMissionIds.has(mission.id));
  campaign.sectors.forEach((sector) => {
    delete sector.mainNodeIds;
    delete sector.routeNodeIds;
    sector.branchIds = [];
    const bossMission = campaign.levels.find((mission) => mission.id === sector.missionIds[4]);
    bossMission.waves = [bossMission.waves.at(-1)];
    bossMission.waves[0].order = 1;
  });

  assert.deepEqual(validateGameCampaign(campaign), { valid: true, issues: [] });
});

test('graph schema rejects unknown properties and duplicate stable node or edge IDs', () => {
  const campaign = cloneCampaign();
  campaign.campaignGraph.unknownGraphField = true;
  campaign.campaignGraph.nodes[1].nodeId = campaign.campaignGraph.nodes[0].nodeId;
  campaign.campaignGraph.nodes[1].outgoingEdges[0].edgeId = campaign.campaignGraph.nodes[0].outgoingEdges[0].edgeId;

  const result = validateGameCampaign(campaign);
  assert.equal(result.valid, false);
  assert.equal(issueMatches(result, 'unknown_property', '/campaignGraph/unknownGraphField'), true);
  assert.equal(issueMatches(result, 'duplicate_id', '/campaignGraph/nodes/1/nodeId'), true);
  assert.equal(issueMatches(result, 'duplicate_id', '/campaignGraph/nodes/1/outgoingEdges/0/edgeId'), true);
});

test('graph references require known entry, Missions, sectors, bosses, prerequisites, and targets', () => {
  const campaign = cloneCampaign();
  campaign.campaignGraph.entryNodeId = 'missing-entry';
  campaign.campaignGraph.nodes[0].missionDefinitionId = 'missing-mission';
  campaign.campaignGraph.nodes[0].sectorId = 'missing-sector';
  campaign.campaignGraph.nodes[0].bossId = 'missing-boss';
  campaign.campaignGraph.nodes[0].prerequisiteNodeIds = ['missing-prerequisite'];
  campaign.campaignGraph.nodes[0].outgoingEdges[0].toNodeId = 'missing-target';

  const result = validateGameCampaign(campaign);
  assert.equal(issueMatches(result, 'unknown_reference', '/campaignGraph/entryNodeId'), true);
  assert.equal(issueMatches(result, 'unknown_reference', '/missionDefinitionId'), true);
  assert.equal(issueMatches(result, 'unknown_reference', '/sectorId'), true);
  assert.equal(issueMatches(result, 'unknown_reference', '/bossId'), true);
  assert.equal(issueMatches(result, 'unknown_reference', '/prerequisiteNodeIds'), true);
  assert.equal(issueMatches(result, 'unknown_reference', '/toNodeId'), true);
});

test('graph traversal rejects unreachable nodes, cycles, and non-forward edges', () => {
  const campaign = cloneCampaign();
  const firstSector = campaign.sectors[0];
  const routeNodeId = firstSector.routeNodeIds[0];
  const routeSource = graphNode(campaign, firstSector.mainNodeIds[0]);
  routeSource.outgoingEdges = routeSource.outgoingEdges.filter((edge) => edge.toNodeId !== routeNodeId);
  const terminal = campaign.campaignGraph.nodes.at(-1);
  terminal.outgoingEdges.push({
    edgeId: 'test-cycle-to-entry',
    toNodeId: campaign.campaignGraph.entryNodeId,
    routeId: terminal.routeId,
    label: 'Invalid cycle',
    kind: 'progression',
    risk: 'low',
    weeklyScoreMultiplier: 1
  });

  const result = validateGameCampaign(campaign);
  assert.equal(issueMatches(result, 'unreachable_node'), true);
  assert.equal(issueMatches(result, 'circular_reference', 'test-cycle-to-entry') || issueMatches(result, 'circular_reference', '/toNodeId'), true);
  assert.equal(issueMatches(result, 'non_forward_edge', '/toNodeId'), true);
});

test('route siblings need distinct labels and routes plus one consistent any-mode rejoin', () => {
  const campaign = cloneCampaign();
  const source = graphNode(campaign, campaign.sectors[0].mainNodeIds[0]);
  const left = graphNode(campaign, source.outgoingEdges[0].toNodeId);
  const right = graphNode(campaign, source.outgoingEdges[1].toNodeId);
  right.displayLabel = left.displayLabel;
  right.routeId = left.routeId;
  right.rejoinNodeId = null;
  const rejoin = graphNode(campaign, left.rejoinNodeId);
  rejoin.prerequisiteMode = 'all';

  const result = validateGameCampaign(campaign);
  assert.equal(issueMatches(result, 'duplicate_label', '/outgoingEdges'), true);
  assert.equal(issueMatches(result, 'duplicate_route', '/outgoingEdges'), true);
  assert.equal(issueMatches(result, 'invalid_rejoin', '/outgoingEdges'), true);
  assert.equal(issueMatches(result, 'invalid_rejoin', '/prerequisiteMode'), true);
});

test('sector graph lists own all graph Missions and exactly one fifth-slot major boss', () => {
  const campaign = cloneCampaign();
  const sector = campaign.sectors[0];
  const routeNode = graphNode(campaign, sector.routeNodeIds[0]);
  sector.routeNodeIds[0] = 'missing-route-node';
  graphNode(campaign, sector.mainNodeIds[1]).missionDefinitionId = routeNode.missionDefinitionId;
  graphNode(campaign, sector.mainNodeIds[0]).bossId = sector.majorBossId;

  const result = validateGameCampaign(campaign);
  assert.equal(issueMatches(result, 'unknown_reference', '/routeNodeIds/0'), true);
  assert.equal(issueMatches(result, 'unlisted_sector_node'), true);
  assert.equal(issueMatches(result, 'invalid_reference', '/mainNodeIds/1'), true);
  assert.equal(issueMatches(result, 'invalid_boss_count', '/majorBossId'), true);
});

test('graph boss Missions require lead-ins and a matching final boss Wave', () => {
  const campaign = cloneCampaign();
  const sector = campaign.sectors[0];
  const bossMission = campaign.levels.find((mission) => mission.id === sector.missionIds[4]);
  bossMission.waves = [bossMission.waves.at(-1)];
  bossMission.waves[0].order = 1;

  const result = validateGameCampaign(campaign);
  assert.equal(issueMatches(result, 'invalid_wave_count', `/levels/${campaign.levels.indexOf(bossMission)}/waves`), true);
});

test('enemy roles cannot be used before their authored graph Mission slot', () => {
  const campaign = cloneCampaign();
  const entryMission = campaign.levels.find((mission) => mission.id === campaign.sectors[0].missionIds[0]);
  const usedRoleId = entryMission.waves
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'spawn')
    .flatMap((event) => event.enemies)
    .map((enemy) => enemy.roleId)
    .find(Boolean);
  const usedRole = campaign.enemyRoles.find((role) => role.id === usedRoleId);
  usedRole.introductionSector = 1;
  usedRole.introductionMission = 2;

  const result = validateGameCampaign(campaign);
  assert.equal(issueMatches(result, 'role_used_before_introduction'), true);
});
