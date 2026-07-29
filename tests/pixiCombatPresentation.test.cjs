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

test('Pixi combat presentation uses checked-in sprite effects and escort ships', () => {
  const constants = read('constants.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const effects = read('services/pixi/ArcadeEffectPool.ts');

  for (const assetPath of [
    '/game-art/pixi/effects/thruster/frame-1.png',
    '/game-art/pixi/effects/explosion/frame-1.png'
  ]) {
    assert.match(constants, new RegExp(assetPath.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  }

  assert.match(renderer, /syncPlayerThrusters\(engine: GameEngine\)/);
  assert.match(renderer, /syncGunPods\(engine: GameEngine\)/);
  assert.match(renderer, /syncBioPrimaryBeam\(engine: GameEngine\)/);
  assert.match(renderer, /ASSETS\.PIXI_THRUSTER_FRAMES/);
  assert.match(renderer, /engine\.getSquadCompanionVisuals\(\)/);
  assert.match(renderer, /companion\?\.frames\[companion\.frameIndex\]/);
  assert.match(renderer, /MINI_SHIP_CATALOG\.flatMap/);
  assert.match(effects, /'sprite-explosion'/);
  assert.match(effects, /setExplosionTextures/);
});

test('BIO uses bounded green primary projectiles while its old continuous beam stays dormant', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');

  assert.match(engine, /isBioBeamFiring\(\) \{\s*return false;\s*\}/);
  assert.match(engine, /const weaponKind: PlayerWeaponKind = 'pulse'/);
  assert.match(engine, /this\.playerShipId === 'bio'[\s\S]*getBioPrimaryShotPlan/);
  assert.match(engine, /weaponKind: 'bio-primary'/);
  assert.doesNotMatch(engine, /if \(bioLaserEquipped\)/);
  assert.match(renderer, /getPlayerWeaponFrames\(entity\.weaponKind, entity\.weaponVisualLevel\)/);
  assert.match(renderer, /engine\.isBioBeamFiring\(\)/);
});

test('paywall formations share one integrity bar and later waves use terrain-pack sectors', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const environment = read('services/pixi/PixiEnvironment.ts');
  const campaign = JSON.parse(read('game-config/campaign.json'));

  assert.match(renderer, /syncWallHealth\(engine: GameEngine\)/);
  assert.match(renderer, /filter\(\(entity\) => entity\.type === EntityType\.ENEMY_INVADER/);
  assert.match(renderer, /PAYWALL INTEGRITY/);
  assert.match(environment, /PIXI_TERRAIN_RIVER_MASTER/);
  assert.match(environment, /PIXI_TERRAIN_DESERT_MASTER/);
  assert.match(environment, /prop\.propSet === profile\.propSet/);

  const laterAssetKeys = campaign.levels
    .flatMap((level) => level.waves)
    .filter((wave) => wave.order >= 3)
    .flatMap((wave) => wave.events)
    .flatMap((event) => event.enemies || [])
    .map((enemy) => enemy.spriteKey);

  assert.ok(laterAssetKeys.includes('PIXI_JET_SCOUT_FRAMES'));
  assert.ok(laterAssetKeys.includes('PIXI_JET_INTERCEPTOR_FRAMES'));
  assert.ok(laterAssetKeys.includes('PIXI_JET_HEAVY_FRAMES'));
});

test('Paywall Bastions use attack and real health decay frames across authored checkpoints', () => {
  const constants = read('constants.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const engine = read('services/gameLogic.ts');
  const campaign = JSON.parse(read('game-config/campaign.json'));

  assert.match(constants, /PAYWALL_BASTION_FRAMES/);
  assert.match(constants, /paywall-bastion-03-attack\.png/);
  assert.match(constants, /paywall-bastion-04-damage-50\.png/);
  assert.match(constants, /paywall-bastion-05-critical-15\.png/);
  assert.match(renderer, /getPaywallBastionFrameIndex/);
  assert.match(renderer, /healthRatio <= 0\.15/);
  assert.match(renderer, /healthRatio <= 0\.5/);
  assert.match(renderer, /entity\.attackTimer > 0/);
  assert.match(engine, /Number\(configured\.count \?\? 2\)/);
  assert.match(engine, /e\.spriteFrames = this\.resolveSpriteFrames\(configured\.spriteKey\)/);

  const checkpointBosses = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .filter((event) => event.kind === 'boss');
  const walls = checkpointBosses.filter((event) => event.bossId === 'paywall-wall');
  assert.equal(walls.length, 1);
  assert.ok(walls.every((event) => event.spriteKey === 'PAYWALL_BASTION_FRAMES'));
  assert.ok(walls.every((event) => event.count === 1));
  assert.equal(
    checkpointBosses.some((event) => (
      event.bossId !== 'paywall-wall' && event.spriteKey === 'PAYWALL_BASTION_FRAMES'
    )),
    false
  );
});
