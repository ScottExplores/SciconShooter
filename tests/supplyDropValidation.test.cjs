const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const directorValidatorUrl = pathToFileURL(
  path.join(root, 'director', 'server', 'gameCampaignValidation.mjs')
).href;

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

const browserValidator = compileBrowserValidator();
const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const addSupplyDropFixture = (campaign) => {
  const present = campaign.campaignBranches
    .find((branch) => branch.branchId === 'branch-bastion-research-supply')
    .missionDefinition.presentTypes
    .find((candidate) => candidate.kind === 'standard');
  campaign.levels[0].waves[0].events.unshift({
    id: 'supply-drop-validator-fixture',
    label: 'STANDARD RESEARCH SUPPLY',
    kind: 'supply-drop',
    startSeconds: 0,
    durationSeconds: 1,
    delayAfterSeconds: 0,
    blocksWaveClock: false,
    spawnAnchor: { x: 0.5, y: 0.035 },
    spriteKey: present.spriteKey,
    presentKind: present.kind,
    positionId: 'formation-top',
    health: present.health,
    speed: 1.5 * present.speedMultiplier,
    scoreValue: 0,
    coinDropValue: present.coinValue
  });
  return campaign;
};

test('browser and Director validators accept the dedicated Supply Drop event', async () => {
  const { validateGameCampaign: validateDirectorCampaign } = await import(directorValidatorUrl);
  const campaign = addSupplyDropFixture(readCampaign());

  assert.deepEqual(browserValidator.validateGameCampaign(campaign), { valid: true, issues: [] });
  assert.deepEqual(validateDirectorCampaign(campaign), { valid: true, errors: [] });
});

test('browser and Director validators reject Supply Drop fields on ordinary asteroids', async () => {
  const { validateGameCampaign: validateDirectorCampaign } = await import(directorValidatorUrl);
  const campaign = addSupplyDropFixture(readCampaign());
  const supply = campaign.levels[0].waves[0].events[0];
  const asteroid = campaign.campaignBranches
    .flatMap((branch) => branch.missionDefinition.events ?? [])
    .find((event) => event.kind === 'asteroid-belt');
  campaign.levels[0].waves[0].events[0] = {
    ...structuredClone(asteroid),
    id: supply.id,
    startSeconds: supply.startSeconds,
    durationSeconds: supply.durationSeconds,
    coinDropValue: supply.coinDropValue,
    bonusTargetKind: supply.presentKind
  };

  const browserResult = browserValidator.validateGameCampaign(campaign);
  const directorResult = validateDirectorCampaign(campaign);
  assert.equal(browserResult.valid, false);
  assert.equal(directorResult.valid, false);
  assert.ok(browserResult.issues.some((issue) => issue.path.includes('/coinDropValue')));
  assert.ok(browserResult.issues.some((issue) => issue.path.includes('/bonusTargetKind')));
  assert.ok(directorResult.errors.some((error) => error.includes('coinDropValue')));
  assert.ok(directorResult.errors.some((error) => error.includes('bonusTargetKind')));
});
