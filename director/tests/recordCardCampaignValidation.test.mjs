import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));

test('shared record-card presentation is versioned inside the real campaign', () => {
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
  assert.equal(campaign.recordCard.art.ship.x, 290);
  assert.equal(campaign.recordCard.encounterAssetKey, 'AUTO');
});

test('record-card copy, colors, assets, and design regions are strictly bounded', () => {
  const invalid = clone(campaign);
  invalid.recordCard.art.encounter.x = 1100;
  invalid.recordCard.art.encounter.width = 300;
  invalid.recordCard.colors.primary = 'javascript:red';
  invalid.recordCard.art.ship.url = 'https://example.com/unsafe.png';
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /1200px card width/);
  assert.match(result.errors.join('\n'), /six-digit hex color/);
  assert.match(result.errors.join('\n'), /unsupported fields: url/);
});
