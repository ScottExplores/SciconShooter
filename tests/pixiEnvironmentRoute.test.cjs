const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const findCampaignLevel = (campaign, levelId) => {
  const level = campaign.levels.find((candidate) => candidate.id === levelId);
  assert.ok(level, `campaign stage ${levelId} exists`);
  return level;
};

const findCampaignEvent = (level, eventId) => {
  const event = level.waves
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.id === eventId);
  assert.ok(event, `campaign event ${eventId} exists in ${level.id}`);
  return event;
};

test('campaign follows a coherent space-to-planet-to-space environment route', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const environment = read('services/pixi/PixiEnvironment.ts');

  assert.deepEqual(
    campaign.levels.slice(0, 5).map((level) => level.backgroundId),
    ['open-orbit', 'citation-storm', 'paywall-siege', 'open-galaxy', 'bastion-protocol']
  );
  assert.deepEqual(
    campaign.levels.slice(5).map((level) => level.backgroundId),
    [
      'helix-redline',
      'helix-redline',
      'shattered-void',
      'shattered-void',
      'shattered-void',
      'shattered-void',
      'gravity-rift',
      'gravity-rift',
      'gravity-rift',
      'ion-eclipse',
      'ion-eclipse',
      'ion-eclipse',
      'terminus-frontier',
      'terminus-frontier',
      'terminus-frontier'
    ]
  );
  assert.match(environment, /orbital-departure/);
  assert.match(environment, /deep-nebula/);
  assert.match(environment, /planetary-descent/);
  assert.match(environment, /biosphere-expedition/);
  assert.match(environment, /orbital-return/);
  for (const backgroundId of [
    'helix-redline',
    'shattered-void',
    'gravity-rift',
    'ion-eclipse',
    'terminus-frontier'
  ]) {
    assert.match(environment, new RegExp(`'${backgroundId}'`));
  }
});

test('long round masters do not hard-wrap and props stay inside their terrain family', () => {
  const constants = read('constants.ts');
  const environment = read('services/pixi/PixiEnvironment.ts');

  for (const asset of [
    'space-round-master-512x4096.png',
    'desert-round-master-512x4096.png',
    'river-round-master-512x4096.png',
    'space-props-atlas-3x3.png',
    'desert-props-atlas-3x3.png',
    'river-props-atlas-3x3.png',
    'desert-ground-props-perspective-master-3x9.png',
    'river-ground-props-perspective-master-3x9.png'
  ]) {
    assert.match(constants, new RegExp(asset.replaceAll('.', '\\.')));
  }

  assert.match(environment, /loop: false/);
  assert.match(environment, /getNonLoopingParallaxOffset\(maxTravel, scrollDistance, layer\.scrollDirection\)/);
  assert.match(environment, /getLoopingParallaxTileY\(/);
  assert.match(environment, /PIXI_TERRAIN_DESERT_MASTER[^\n]+scrollDirection: 'down'/);
  assert.match(environment, /PIXI_TERRAIN_RIVER_MASTER[^\n]+scrollDirection: 'down'/);
  assert.match(environment, /prop\.propSet === profile\.propSet/);
  assert.match(environment, /TERRAIN_PROP_ATLASES/);
});

test('ground sectors use terrain aircraft and the river checkpoint is not an asteroid belt', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const desertStage = findCampaignLevel(campaign, 'stage-paywall-siege');
  const riverStage = findCampaignLevel(campaign, 'stage-open-galaxy');

  for (const [stage, openingEventId] of [
    [desertStage, 'paywall-siege-opening-drifters'],
    [riverStage, 'open-galaxy-opening-drifters']
  ]) {
    const opening = findCampaignEvent(stage, openingEventId);
    assert.ok(opening.enemies.every((enemy) => (
      enemy.spriteKey.startsWith('PIXI_JET_') || enemy.spriteKey === 'ENEMY_JOURNAL_FRAMES'
    )));
  }

  const riverEvents = riverStage.waves.flatMap((wave) => wave.events);
  assert.equal(riverEvents.some((event) => event.kind === 'asteroid-belt'), false);
  const ambush = findCampaignEvent(riverStage, 'open-galaxy-river-ambush');
  assert.equal(ambush.kind, 'spawn');
  assert.deepEqual(
    ambush.enemies.map((enemy) => enemy.spriteKey),
    ['PIXI_JET_SCOUT_FRAMES', 'ENEMY_JOURNAL_FRAMES']
  );
});

test('ground props remain registered to terrain while space landmarks use slow depth motion', () => {
  const environment = read('services/pixi/PixiEnvironment.ts');

  assert.match(environment, /const terrainTop = terrainLayer\?\.sprites\[0\]\.y \?\? 0/);
  assert.match(environment, /const groundY = terrainTop \+ prop\.baseY \* terrainLayer\.tileHeight/);
  assert.match(environment, /const perspectiveScale = 0\.76 \+ screenDepth \* 0\.48/);
  assert.match(environment, /const perspectiveSpread = 0\.82 \+ screenDepth \* 0\.24/);
  assert.match(environment, /const playerCenterY = engine\.player\.y \+ engine\.player\.height \/ 2/);
  assert.match(environment, /const relativeY = groundY - playerCenterY/);
  assert.match(environment, /getGroundPropPerspectiveState\(relativeY, overheadBand\)/);
  assert.match(environment, /prop\.sprite\.texture = prop\.perspectiveTextures\[perspectiveState\]/);
  assert.match(environment, /GROUND_PROP_PERSPECTIVE_SHEETS/);
  assert.match(environment, /if \(prop\.terrain === 'space'\)/);
  assert.match(environment, /widthRatio: 0\.78/);
  assert.match(environment, /widthRatio: 1,/);
  assert.match(environment, /rotationSpeed: 0/);
  assert.match(environment, /GAME_PARALLAX_FAR_PLANETS/);
  assert.match(environment, /softness: 0\.55/);
  assert.match(environment, /new BlurFilter\(\{ strength: definition\.softness \?\? 0, quality: 1/);
  assert.match(environment, /SPACE_PARALLAX_DEPTH_SPEEDS/);
  assert.match(environment, /scrollDirection: 'down'/);
  assert.match(environment, /runtime\.stageDepartureSpeedBoost/);
  assert.match(environment, /runtime\.stageHyperspeedStrength/);
  assert.match(environment, /hyperspeedStreaks/);
  assert.match(environment, /engine\.performanceMode \? 0 : layer\.softness/);
  assert.match(environment, /GROUND_PROP_CONTACT_ANCHOR_Y/);
  assert.match(environment, /prop\.root\.zIndex = Math\.round\(groundY \* 10\)/);
  assert.match(environment, /atlasFrameCache/);
  assert.doesNotMatch(environment, /prop\.sprite\.y = \(\(prop\.baseY \* propCycle\)/);
  assert.doesNotMatch(environment, /GAME_PARALLAX_BIG_PLANET/);
  assert.doesNotMatch(environment, /GAME_PARALLAX_RING_PLANET/);
});
