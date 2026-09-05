const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const authoringUrl = pathToFileURL(path.join(root, 'tools', 'campaign-formation-authoring.mjs')).href;

const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

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
const issueMatches = (result, code) => result.issues.some((issue) => issue.code === code);

test('formation normalization is idempotent and never changes Campaign route topology', async () => {
  const { normalizeCampaignFormationAuthoring } = await import(authoringUrl);
  const campaign = readCampaign();
  const graphBefore = structuredClone(campaign.campaignGraph);
  const sectorsBefore = structuredClone(campaign.sectors);
  const levelsBefore = structuredClone(campaign.levels);

  const first = normalizeCampaignFormationAuthoring(campaign);
  const second = normalizeCampaignFormationAuthoring(campaign);

  // The authored first sector has 33 grouped entries. The remaining Missions
  // and route alternatives retain their 552 existing grouped entries.
  assert.equal(first.groupedSpawnCount, 33 + 552);
  assert.equal(second.groupedSpawnCount, first.groupedSpawnCount);
  assert.deepEqual(first.declarationChanges, []);
  assert.deepEqual(first.cooldownChanges, []);
  assert.deepEqual(second.declarationChanges, []);
  assert.deepEqual(second.cooldownChanges, []);
  assert.deepEqual(campaign.campaignGraph, graphBefore);
  assert.deepEqual(campaign.sectors, sectorsBefore);
  assert.deepEqual(campaign.levels, levelsBefore, 'normalization must preserve authored sector choreography and timing');
  assert.equal(campaign.formationPacks.filter((pack) => pack.id.startsWith('pack-breakwater-')).length, 25);
  assert.equal(campaign.formationPacks.filter((pack) => !pack.id.startsWith('pack-breakwater-')).length, 16);
});

test('adding a more specific catalog pack never overrides an existing Wave declaration', async () => {
  const { normalizeCampaignFormationAuthoring } = await import(authoringUrl);
  const campaign = readCampaign();
  const wave = campaign.levels.find((level) => level.id === 'stage-last-light-gauntlet').waves
    .find((candidate) => candidate.id === 'stage-last-light-gauntlet-wave-4');
  const declaredBefore = [...wave.formationPackIds];
  assert.ok(declaredBefore.includes('pack-orbit-grid'));
  const event = wave.events.find((candidate) => candidate.kind === 'spawn'
    && candidate.enemies.every((enemy) => enemy.roleId === 'role-research-drone'));
  assert.ok(event, 'fixture is an existing role-bound regular-enemy event');
  campaign.formationPacks.push({
    ...structuredClone(campaign.formationPacks.find((pack) => pack.id === 'pack-orbit-grid')),
    id: 'pack-regression-specific-drone',
    enemyRoleIds: ['role-research-drone'],
    formationShape: event.patternId
  });
  const result = normalizeCampaignFormationAuthoring(campaign);
  assert.deepEqual(wave.formationPackIds, declaredBefore);
  assert.deepEqual(result.declarationChanges, []);
});

test('authored role reuse satisfies every nonzero internal-Wave cooldown', () => {
  const campaign = readCampaign();
  const rolesById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  const violations = [];

  campaign.levels.forEach((level) => {
    const previousWaveByRole = new Map();
    [...level.waves].sort((left, right) => left.order - right.order).forEach((wave) => {
      const usedRoleIds = new Set(wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => event.enemies)
        .map((enemy) => enemy.roleId)
        .filter(Boolean));
      usedRoleIds.forEach((roleId) => {
        const previousOrder = previousWaveByRole.get(roleId);
        const cooldown = rolesById.get(roleId).reuseCooldownWaves;
        if (previousOrder !== undefined && wave.order - previousOrder - 1 < cooldown) {
          violations.push(`${level.id}/${wave.id}/${roleId}`);
        }
        previousWaveByRole.set(roleId, wave.order);
      });
    });
  });

  assert.deepEqual(violations, []);
  assert.equal(campaign.enemyRoles.filter((role) => role.reuseCooldownWaves > 0).length, 5);
});

test('browser validation rejects missing, unused, and cooldown-conflicting formation authoring', () => {
  const missing = readCampaign();
  const firstGroupedWave = missing.levels
    .flatMap((level) => level.waves)
    .find((wave) => wave.formationPackIds.length > 0);
  firstGroupedWave.formationPackIds = [];
  assert.equal(issueMatches(validateGameCampaign(missing), 'missing_formation_binding'), true);

  const unused = readCampaign();
  const firstWave = unused.levels[0].waves[0];
  firstWave.formationPackIds.push('pack-prism-ring');
  assert.equal(issueMatches(validateGameCampaign(unused), 'unused_formation_binding'), true);

  const cooldown = readCampaign();
  cooldown.enemyRoles.find((role) => role.id === 'role-research-drone').reuseCooldownWaves = 1;
  assert.equal(issueMatches(validateGameCampaign(cooldown), 'reuse_cooldown_violation'), true);
});
