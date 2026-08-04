const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HELIOS_ASSET_KEY = 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER';
const HELIOS_ASSET_URL = '/game-art/generated/bosses/campaign-packages/helios-clawcarrier/assembled.png';
const HELIOS_ASSET_PATH = path.join(root, 'public', HELIOS_ASSET_URL.replace(/^\//, ''));

test('M25 Helios art stays aligned across Campaign, constants, catalog, and record cards', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const constants = read('constants.ts');
  const catalog = read('game-config/catalog.ts');
  const recordCard = read('api/record-card.js');
  const mission = campaign.levels.find((level) => level.order === 25);
  const bossEvents = mission.waves
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss');

  assert.equal(bossEvents.length, 1);
  assert.equal(bossEvents[0].bossId, 'helios-clawcarrier');
  assert.equal(bossEvents[0].rigId, 'crown-claw');
  assert.equal(bossEvents[0].spriteKey, HELIOS_ASSET_KEY);
  assert.equal(mission.scorecard.encounterAssetKey, HELIOS_ASSET_KEY);

  assert.match(
    constants,
    new RegExp(`${HELIOS_ASSET_KEY}:\\s*"${escapeRegExp(HELIOS_ASSET_URL)}"`)
  );
  assert.match(
    catalog,
    new RegExp(`${HELIOS_ASSET_KEY}: asset\\('${HELIOS_ASSET_KEY}'[^\\n]+ASSETS\\.${HELIOS_ASSET_KEY}`)
  );
  assert.match(
    catalog,
    /'helios-clawcarrier':\s*\{[\s\S]*?defaultSpriteKey:\s*'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER'/
  );
  assert.match(
    recordCard,
    new RegExp(`${HELIOS_ASSET_KEY}:\\s*'${escapeRegExp(HELIOS_ASSET_URL)}'`)
  );
});

test('the promoted Helios asset is a non-empty PNG in the production public tree', () => {
  assert.equal(fs.existsSync(HELIOS_ASSET_PATH), true);
  const image = fs.readFileSync(HELIOS_ASSET_PATH);

  assert.ok(image.length > 1024, 'Helios art must not be an empty placeholder');
  assert.deepEqual(
    Array.from(image.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
});

test('Helios promoted package carries its fresh non-rectangular alpha collision mask', () => {
  const registry = JSON.parse(
    read('game-config/generated/campaign-boss-artwork.json')
  );
  const mask = registry.packages['helios-clawcarrier'].artwork.collisionMask;

  assert.ok(mask, 'the exact promoted Helios package must include a collision mask');
  assert.equal(mask.width, 64);
  assert.equal(mask.height, 64);
  assert.equal(mask.rowWords.length, 128);
  assert.ok(mask.rowWords.some((word) => word !== 0), 'the mask must contain opaque art');
  assert.ok(mask.rowWords.some((word) => word === 0), 'the mask must retain transparent sprite space');
});

test('campaign Helios resolves the promoted modular artwork package instead of static-only art', () => {
  const registrySource = read(
    'services/pixi/boss-rigs/CampaignBossArtworkRegistry.ts'
  );
  const canvas = read('components/GameCanvas.tsx');
  const registry = JSON.parse(
    read('game-config/generated/campaign-boss-artwork.json')
  );
  const heliosPackage = registry.packages['helios-clawcarrier'];

  assert.ok(heliosPackage);
  assert.equal(heliosPackage.poseKey, 'helios-clawcarrier');
  assert.equal(
    heliosPackage.artwork.modularRigManifest.id,
    'helios-clawcarrier-v2'
  );
  assert.equal(
    heliosPackage.artwork.url,
    '/game-art/generated/bosses/campaign-packages/helios-clawcarrier/assembled.png'
  );
  assert.match(registrySource, /sampleHeliosModularPose/);
  assert.match(canvas, /resolveCampaignBossArtwork/);
  assert.match(canvas, /previewBossArtwork: setupBossArtwork/);
});
