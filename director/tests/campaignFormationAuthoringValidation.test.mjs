import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..');
const trackedCampaign = JSON.parse(await readFile(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const errorsFor = (campaign) => validateGameCampaign(campaign).errors.join('\n');

test('Director accepts the fully bound formation schedule', () => {
  assert.deepEqual(validateGameCampaign(structuredClone(trackedCampaign)), { valid: true, errors: [] });
});

test('Director rejects grouped spawns without a matching declaration and unused declarations', () => {
  const missing = structuredClone(trackedCampaign);
  const groupedWave = missing.levels.flatMap((level) => level.waves).find((wave) => wave.formationPackIds.length > 0);
  groupedWave.formationPackIds = [];
  assert.match(errorsFor(missing), /grouped Campaign spawn must resolve/);

  const unused = structuredClone(trackedCampaign);
  unused.levels[0].waves[0].formationPackIds.push('pack-prism-ring');
  assert.match(errorsFor(unused), /is not used by any grouped spawn event/);
});

test('Director rejects a role cooldown contradicted by adjacent authored Waves', () => {
  const campaign = structuredClone(trackedCampaign);
  campaign.enemyRoles.find((role) => role.id === 'role-research-drone').reuseCooldownWaves = 1;
  assert.match(errorsFor(campaign), /requires 1 intervening Wave\(s\); found 0/);
});
