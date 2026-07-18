const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Pixi combat presentation uses checked-in sprite effects and escort ships', () => {
  const constants = read('constants.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const effects = read('services/pixi/ArcadeEffectPool.ts');

  for (const assetPath of [
    '/game-art/pixi/effects/thruster/frame-1.png',
    '/game-art/pixi/effects/explosion/frame-1.png',
    '/game-art/pixi/ships/escort-double.png',
    '/game-art/pixi/ships/escort-triple.png'
  ]) {
    assert.match(constants, new RegExp(assetPath.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  }

  assert.match(renderer, /syncPlayerThrusters\(engine: GameEngine\)/);
  assert.match(renderer, /syncGunPods\(engine: GameEngine\)/);
  assert.match(renderer, /syncBioPrimaryBeam\(engine: GameEngine\)/);
  assert.match(renderer, /ASSETS\.PIXI_THRUSTER_FRAMES/);
  assert.match(renderer, /ASSETS\.PIXI_ESCORT_DOUBLE/);
  assert.match(renderer, /ASSETS\.PIXI_ESCORT_TRIPLE/);
  assert.match(effects, /'sprite-explosion'/);
  assert.match(effects, /setExplosionTextures/);
});

test('the BIO ship uses a sustained primary beam while damage stays in the simulation', () => {
  const engine = read('services/gameLogic.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');

  assert.match(engine, /isBioBeamFiring\(\)/);
  assert.match(engine, /private applyBioLaserPulse\(level: number\)/);
  assert.match(engine, /if \(bioLaserEquipped\) \{\s*this\.applyBioLaserPulse\(fireRateLevel\)/);
  assert.match(renderer, /engine\.isBioBeamFiring\(\)/);
  assert.match(renderer, /const color = level > 0 \? '#38bdf8' : '#65f59a'/);
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
  assert.match(environment, /prop\.terrain === profile\.terrain/);

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

test('Paywall Bastions use attack and real health decay frames while Wave 5 increases wall rows', () => {
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

  const bastionWave = campaign.levels[0].waves.find((wave) => wave.id === 'bastion-protocol');
  const walls = bastionWave.events.filter((event) => event.kind === 'boss');
  assert.deepEqual(walls.map((event) => event.count), [1, 2, 3, 4]);
});
