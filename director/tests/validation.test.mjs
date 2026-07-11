import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  validateConfig,
  validateReview
} from '../server/validation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDirectory, '..', '..', 'director-data', 'fixtures');
const readFixture = async (name) => JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8'));

test('the shipped scorecard and wave campaign pass schema and cross-field validation', async () => {
  const [scorecard, campaign] = await Promise.all([
    readFixture('default-scorecard.json'),
    readFixture('default-wave-campaign.json')
  ]);
  assert.deepEqual(validateConfig('scorecard', scorecard), { valid: true, errors: [] });
  assert.deepEqual(validateConfig('wave-campaign', campaign), { valid: true, errors: [] });
});

test('scorecard validation rejects duplicate metrics, reversed ranges, and unsafe assets', async () => {
  const scorecard = await readFixture('default-scorecard.json');
  scorecard.metrics[1].key = 'wave';
  scorecard.encounters[0].maxWave = 0;
  scorecard.encounters[1].assetPath = '/game-art/../secrets.png';
  const result = validateConfig('scorecard', scorecard);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate keys')));
  assert.ok(result.errors.some((error) => error.includes('maxWave')));
  assert.ok(result.errors.some((error) => error.includes('traversal-free')));
});

test('wave validation rejects unnormalized weights, duplicate IDs, and broken references', async () => {
  const campaign = await readFixture('default-wave-campaign.json');
  campaign.powerups[0].weight = 0.5;
  campaign.waves[1].id = campaign.waves[0].id;
  campaign.waves[0].backgroundId = 'missing-background';
  campaign.waves[0].segments[1].enemyWeights.drone = 0.01;
  const result = validateConfig('wave-campaign', campaign);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/powerups weights must sum to 1')));
  assert.ok(result.errors.some((error) => error.includes('duplicate ids')));
  assert.ok(result.errors.some((error) => error.includes('unknown background')));
  assert.ok(result.errors.some((error) => error.includes('/enemyWeights must sum to 1')));
});

test('phase and between-wave semantics are enforced', async () => {
  const campaign = await readFixture('default-wave-campaign.json');
  delete campaign.waves[0].segments[1].formation;
  campaign.waves[0].betweenWaves[0].type = 'boss';
  campaign.waves[0].betweenWaves[0].bossType = 'gatekeeper';
  const result = validateConfig('wave-campaign', campaign);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/formation is required for phase')));
  assert.ok(result.errors.some((error) => error.includes('not an inter-wave encounter type')));
});

test('review validation requires normalized anchors and resolution timestamps', () => {
  const review = {
    id: 'review-0001-abcdef',
    sequence: 1,
    surface: 'wave',
    configVersion: 'wave-campaign-000001-123456789abc',
    target: 'Asteroid belt',
    note: 'Increase the warning contrast.',
    status: 'resolved',
    anchor: { x: 1.2, y: 0.4 },
    createdAt: '2026-07-10T20:00:00.000Z'
  };
  const result = validateReview(review);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/anchor/x')));
  assert.ok(result.errors.some((error) => error.includes('/resolvedAt is required')));
});
