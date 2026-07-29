import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');

const loadCampaign = async () => JSON.parse(
  await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8')
);

const customSlots = [
  { x: 0.24, y: 0.14 },
  { x: 0.42, y: 0.22 },
  { x: 0.58, y: 0.22 },
  { x: 0.76, y: 0.14 }
];

const firstSpawn = (campaign) => campaign.levels
  .flatMap((level) => level.waves)
  .flatMap((wave) => wave.events)
  .find((event) => event.kind === 'spawn');

const bindSpawnToPack = (campaign, spawn, packId) => {
  const pack = campaign.formationPacks.find((candidate) => candidate.id === packId);
  const level = campaign.levels.find((candidate) => candidate.waves.some((wave) => (
    wave.events.includes(spawn)
  )));
  const wave = level?.waves.find((candidate) => candidate.events.includes(spawn));
  assert.ok(pack, `fixture should provide formation pack ${packId}`);
  assert.ok(level && wave, 'fixture spawn should belong to a Campaign Wave');
  wave.formationPackIds = [packId];
  wave.combatBudget = Math.max(wave.combatBudget, pack.totalThreatCost);
  level.campaignProgression.combatBudget = Math.max(
    level.campaignProgression.combatBudget,
    wave.combatBudget
  );
};

test('server campaign validation accepts a bounded custom formation whose slots match its spawn count', async () => {
  const campaign = await loadCampaign();
  const spawn = firstSpawn(campaign);

  assert.ok(spawn, 'tracked campaign should provide a spawn event for the authoring test');
  spawn.count = customSlots.length;
  spawn.patternId = 'v';
  spawn.formationSlots = structuredClone(customSlots);
  bindSpawnToPack(campaign, spawn, 'pack-orbit-v');

  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
});

test('server campaign validation rejects mismatched, unsafe, duplicate, and ungrouped custom slots', async (t) => {
  await t.test('slot count must match the spawn count', async () => {
    const campaign = await loadCampaign();
    const spawn = firstSpawn(campaign);
    spawn.count = customSlots.length + 1;
    spawn.formationSlots = structuredClone(customSlots);

    const result = validateGameCampaign(campaign);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('length must match the spawn count')));
  });

  await t.test('slots stay in the safe zone and reject extra fields', async () => {
    const campaign = await loadCampaign();
    const spawn = firstSpawn(campaign);
    spawn.count = 2;
    spawn.formationSlots = [
      { x: 0.05, y: 0.47, z: 1 },
      { x: 0.95, y: 0.07 }
    ];

    const result = validateGameCampaign(campaign);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('/formationSlots/0/x')));
    assert.ok(result.errors.some((error) => error.includes('/formationSlots/0/y')));
    assert.ok(result.errors.some((error) => error.includes('unsupported fields: z')));
    assert.ok(result.errors.some((error) => error.includes('/formationSlots/1/x')));
    assert.ok(result.errors.some((error) => error.includes('/formationSlots/1/y')));
  });

  await t.test('slot positions must be unique at authored precision', async () => {
    const campaign = await loadCampaign();
    const spawn = firstSpawn(campaign);
    spawn.count = 2;
    spawn.formationSlots = [
      { x: 0.4, y: 0.2 },
      { x: 0.40001, y: 0.20001 }
    ];

    const result = validateGameCampaign(campaign);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('duplicates another formation slot')));
  });

  await t.test('single-random cannot masquerade as grouped choreography', async () => {
    const campaign = await loadCampaign();
    const spawn = firstSpawn(campaign);
    spawn.count = customSlots.length;
    spawn.patternId = 'single-random';
    spawn.formationSlots = structuredClone(customSlots);

    const result = validateGameCampaign(campaign);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('requires a grouped formation choreography')));
  });
});

test('campaign validation has no five-wave ceiling', async () => {
  const campaign = await loadCampaign();
  const level = campaign.levels.find((candidate) => (
    candidate.campaignProgression?.missionRole === 'elite-checkpoint'
    && candidate.waves.length === 5
  ));
  const sourceWave = level.waves.find((wave) => (
    wave.formationPackIds.length === 1
    && wave.events.some((event) => event.kind === 'spawn' && !event.patternId.includes('single'))
  ));
  const sourceSpawn = sourceWave?.events.find((event) => event.kind === 'spawn');
  assert.ok(level, 'tracked campaign should provide an elite-checkpoint that permits a sixth wave');
  assert.ok(sourceWave && sourceSpawn, 'elite-checkpoint fixture should provide an explicitly bound grouped spawn');
  const nextOrder = level.waves.length + 1;

  level.waves.push({
    id: `authoring-proof-wave-${nextOrder}`,
    name: `Authoring Proof Wave ${nextOrder}`,
    order: nextOrder,
    accent: '#67e8f9',
    backgroundId: level.backgroundId,
    completionRule: 'clear-after-duration',
    difficultyMultiplier: 2,
    durationSeconds: 30,
    introSeconds: 1,
    delayAfterSeconds: 2,
    scoreMultiplier: 2 ** (nextOrder - 1),
    threatCap: 64,
    combatBudget: 64,
    rhythm: 'recovery',
    formationPackIds: structuredClone(sourceWave.formationPackIds),
    events: [{
      id: `authoring-proof-formation-${nextOrder}`,
      label: 'Custom formation beyond the starter campaign',
      kind: 'spawn',
      startSeconds: 0,
      durationSeconds: 12,
      delayAfterSeconds: 0,
      blocksWaveClock: false,
      count: customSlots.length,
      patternId: sourceSpawn.patternId,
      positionId: 'formation-top',
      spawnIntervalSeconds: 0.2,
      formationSlots: structuredClone(customSlots),
      enemies: structuredClone(sourceSpawn.enemies)
    }]
  });
  const graphNode = campaign.campaignGraph.nodes.find((node) => (
    node.missionDefinitionId === level.id
  ));
  assert.ok(graphNode, 'tracked campaign graph should reference the authored Mission');
  graphNode.routeSummary.estimatedWaveCount = level.waves.length;

  assert.ok(nextOrder > 5, 'tracked starter campaign should reach wave five before this proof');
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
});
