const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const types = read('types.ts');
const constants = read('constants.ts');
const engine = read('services', 'gameLogic.ts');
const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
const campaign = JSON.parse(read('game-config', 'campaign.json'));

test('Max Shot is a rare configured double-pattern shield power-up with real generated art', () => {
  assert.match(types, /MAX_SHOT\s*=\s*'MAX_SHOT'/);
  assert.match(constants, /POWERUP_MAX_SHOT:\s*"\/game-art\/generated\/powerups\/scicon-max-shot-v1\/max-shot-pickup\.png"/);
  assert.match(constants, /POWERUP_MAX_SHOT_AURA:\s*"\/game-art\/generated\/powerups\/scicon-max-shot-v1\/max-shot-aura\.png"/);
  assert.match(constants, /POWERUP_MAX_SHOT_AURA_FRAMES:\s*Array\.from/);
  assert.ok(fs.existsSync(path.join(root, 'public', 'game-art', 'generated', 'powerups', 'scicon-max-shot-v1', 'max-shot-pickup.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'game-art', 'generated', 'powerups', 'scicon-max-shot-v1', 'max-shot-aura.png')));
  for (let frame = 1; frame <= 8; frame++) {
    assert.ok(fs.existsSync(path.join(
      root,
      'public',
      'game-art',
      'generated',
      'scicon-stage20-expansion-v1',
      'powerups',
      'max-shot-aura',
      'frames',
      `max-shot-aura-${String(frame).padStart(2, '0')}.png`
    )));
  }
  assert.match(engine, /MAX_SHOT_PROJECTILE_COUNT\s*=\s*MAX_SHOT_PROJECTILE_CAP/);
  assert.match(engine, /getMaxShotProjectileCount\(basePatternProjectileCount\)/);
  assert.match(engine, /buildMaxShotBundleVisualPattern\(/);
  assert.match(engine, /hasMaxShotShield\(\)/);
  assert.match(engine, /'max-shot':\s*PowerupType\.MAX_SHOT/);
  assert.match(engine, /\[PowerupType\.MAX_SHOT,\s*0\.055\]/);
  assert.ok(campaign.levels.every((level) => level.availablePowerupIds.includes('max-shot')));
});

test('Max Shot reserves room for the doubled tier-and-spread pattern before emitting atomically', () => {
  assert.match(
    engine,
    /hasPlayerShotCapacity\(projectileCount: number = 1\)[\s\S]*?\+ projectileCount <= this\.getPlayerShotCap\(\)/
  );

  const fireBulletStart = engine.indexOf('\n  fireBullet() {');
  const fireBullet = engine.slice(fireBulletStart, engine.indexOf('\n  fireMissile()', fireBulletStart));
  assert.match(fireBullet, /basePatternProjectileCount = volleySize \* \(spreadLanes \? 3 : 1\)/);
  assert.match(fireBullet, /getPrimaryVolleySimulationEntityCount\(spreadLanes\)/);
  assert.match(fireBullet, /\(maxShotVisualPattern\?\.length \?\? 0\) \* simulationEntityCount !== visualProjectileCount/);
  const capacityGate = fireBullet.indexOf('!canAdmitMaxShotVolley(');
  const firstEmission = fireBullet.indexOf('this.spawnPlayerBullet(');
  assert.ok(capacityGate >= 0, 'the complete tier-scaled capacity gate is required');
  assert.ok(firstEmission > capacityGate, 'capacity must be reserved before the first projectile is emitted');
  assert.doesNotMatch(
    fireBullet.slice(0, capacityGate),
    /spawnPlayerBullet\(/,
    'no Max Shot projectile may emit before the complete-volley capacity check'
  );
  assert.match(
    fireBullet,
    /if \(maxShotActive && maxShotVisualPattern\)[\s\S]*?this\.spawnPlayerBullet\([\s\S]*?maxShotVisualPattern,[\s\S]*?volleyProjectileDamage[\s\S]*?\);/
  );
  assert.match(
    fireBullet,
    /this\.queuePlayerBullet\(\{[\s\S]*?maxShotVisualPattern,[\s\S]*?damageOverride: volleyProjectileDamage[\s\S]*?\}\);/
  );
});

test('Max Shot presentation reuses one aura sprite and one bounded screen-edge graphic', () => {
  assert.match(renderer, /private readonly maxShotAura = new Sprite\(Texture\.WHITE\)/);
  assert.match(renderer, /private readonly maxShotScreenGlow = new Graphics\(\)/);
  assert.match(renderer, /syncMaxShotPresentation\(engine: GameEngine\)/);
  assert.match(renderer, /ASSETS\.POWERUP_MAX_SHOT_AURA/);
  assert.match(renderer, /ASSETS\.POWERUP_MAX_SHOT_AURA_FRAMES\[auraFrameIndex\]/);
  assert.match(renderer, /const active = engine\.hasMaxShotShield\(\)/);
  assert.match(renderer, /this\.maxShotScreenGlow\.clear\(\)/);
  assert.match(renderer, /ensureProjectileCopySprites\(view, visualPattern\.length\)/);
  assert.match(engine, /MOBILE_MAX_PLAYER_SHOT_CAP/);
  assert.match(engine, /companionBurstSize/);
  assert.match(engine, /completeBurstFloor/);
});

test('the conditional mission preload warms only the critical production Pixi texture list', () => {
  const canvas = read('components', 'GameCanvas.tsx');
  assert.match(renderer, /export const PIXI_GAMEPLAY_TEXTURE_URLS = Object\.freeze\(\[/);
  assert.match(renderer, /export const preloadPixiGameplayTextures/);
  assert.match(renderer, /Assets\.load<Texture>\(url\)/);
  assert.doesNotMatch(canvas, /preloadEngineGameplayAssets\(\)/);
  assert.match(canvas, /preloadPixiGameplayTextures\(\)/);
  assert.match(canvas, /preloadCanvasAssets:\s*false/);
});
