import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const validationIncludes = (candidate, fragment) => (
  validateGameCampaign(candidate).errors.some((error) => error.includes(fragment))
);

test('Director requires the same readable Campaign enemy fire policy as the game', () => {
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });

  const missingDelay = structuredClone(campaign);
  delete missingDelay.enemyRoles[0].fireDelaySeconds;
  assert.equal(validationIncludes(missingDelay, '/enemyRoles/0/fireDelaySeconds'), true);

  const tooFast = structuredClone(campaign);
  const firingRoleIndex = tooFast.enemyRoles.findIndex((role) => role.fireBehavior !== 'none');
  tooFast.enemyRoles[firingRoleIndex].fireDelaySeconds = 0.25;
  assert.equal(validationIncludes(tooFast, 'must be at least 0.5 seconds'), true);

  const incompatibleElite = structuredClone(campaign);
  const standardRoleIndex = incompatibleElite.enemyRoles.findIndex((role) => role.durabilityClass === 'standard');
  incompatibleElite.enemyRoles[standardRoleIndex].fireBehavior = 'elite-only';
  assert.equal(validationIncludes(incompatibleElite, 'elite-only requires elite durability'), true);
});
