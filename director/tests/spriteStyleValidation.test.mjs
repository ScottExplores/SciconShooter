import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const campaignPath = path.resolve(testDirectory, '..', '..', 'game-config', 'campaign.json');

const readCampaign = async () => JSON.parse(await readFile(campaignPath, 'utf8'));

const findEvents = (campaign) => {
  const levelEvents = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => wave.events)
  ));
  const branchEvents = (campaign.campaignBranches ?? []).flatMap((branch) => (
    branch.missionDefinition?.events ?? []
  ));
  const events = [...levelEvents, ...branchEvents];
  return {
    spawn: events.find((event) => event.kind === 'spawn'),
    boss: events.find((event) => event.kind === 'boss'),
    asteroid: events.find((event) => event.kind === 'asteroid-belt')
  };
};

test('game campaign validation accepts bounded sprite styles on every supported gameplay target', async () => {
  const campaign = await readCampaign();
  const { spawn, boss, asteroid } = findEvents(campaign);
  assert.ok(spawn && boss && asteroid);

  const style = {
    scale: 1.25,
    rotationDegrees: -30,
    flipX: true,
    opacity: 0.7,
    hueRotateDegrees: 90,
    saturation: 1.4,
    brightness: 0.9,
    glowColor: '#22D3EE',
    glowBlur: 18
  };
  spawn.enemies[0].spriteStyle = { ...style };
  boss.spriteStyle = { ...style };
  asteroid.spriteStyle = { ...style };

  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
});

test('game campaign validation rejects unsafe or out-of-range sprite style fields', async () => {
  const campaign = await readCampaign();
  const { spawn, boss, asteroid } = findEvents(campaign);
  assert.ok(spawn && boss && asteroid);

  spawn.enemies[0].spriteStyle = { scale: 0.24, script: 'alert(1)' };
  boss.spriteStyle = { opacity: 1.01, flipX: 'yes', glowColor: 'red' };
  asteroid.spriteStyle = {
    rotationDegrees: 181,
    hueRotateDegrees: -181,
    saturation: 2.01,
    brightness: 0.24,
    glowBlur: 41
  };

  const result = validateGameCampaign(campaign);
  assert.equal(result.valid, false);
  const expectedLocations = [
    '/spriteStyle contains unsupported fields: script',
    '/spriteStyle/scale',
    '/spriteStyle/opacity',
    '/spriteStyle/flipX',
    '/spriteStyle/glowColor',
    '/spriteStyle/rotationDegrees',
    '/spriteStyle/hueRotateDegrees',
    '/spriteStyle/saturation',
    '/spriteStyle/brightness',
    '/spriteStyle/glowBlur'
  ];
  expectedLocations.forEach((location) => {
    assert.ok(result.errors.some((error) => error.includes(location)), `missing validation error for ${location}`);
  });
});
