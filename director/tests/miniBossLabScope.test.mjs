import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaignSource = await readFile(
  path.join(repositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
);
const registrySource = await readFile(
  path.join(repositoryRoot, 'services', 'gameplay', 'mini-bosses', 'MiniBossEncounterRegistry.ts'),
  'utf8'
);

const miniBossEncounterIds = Object.freeze([
  'fracture-engine-elite',
  'aegis-brood-core',
  'railspine-wallcrawler',
  'maw-carrier',
  'twin-meridian-sentinels',
  'prism-bloom',
  'aegis-convoy-captain',
  'gridline-sentries'
]);

test('Campaign uses registry IDs while isolated Sandbox event aliases stay out of shipped content', () => {
  assert.doesNotMatch(campaignSource, /sandbox-mini-boss-lab:/);
  for (const encounterId of miniBossEncounterIds) {
    assert.equal(
      campaignSource.includes(`\"bossId\": \"${encounterId}\"`),
      true,
      `${encounterId} must remain assigned to at least one Campaign checkpoint`
    );
    assert.equal(
      campaignSource.includes(`sandbox-${encounterId}`),
      false,
      `${encounterId} must not leak its Sandbox event ID into Campaign content`
    );
  }
  assert.equal(
    [...registrySource.matchAll(/campaignAssigned:\s*true/g)].length,
    miniBossEncounterIds.length,
    'every registered mini-boss encounter remains Campaign-assigned'
  );
});
