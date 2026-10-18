const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

let imageConstructionCount = 0;
class TestImage {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = '';
  src = '';

  constructor() {
    imageConstructionCount++;
  }
}

global.Image = TestImage;

const loadModule = (entryPoint) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entryPoint)],
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

const { GameEngine } = loadModule(path.join('services', 'gameLogic.ts'));

const createStats = () => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: 100,
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 960,
  lives: 10,
  repairsCount: 0,
  upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const createEngine = () => {
  const engine = new GameEngine(createStats(), {
    campaign,
    audioEnabled: false,
    preloadCanvasAssets: false,
    randomSeed: 'advanced-special-runtime'
  });
  engine.init(390, 700);
  const laterCampaignIndex = engine.campaignWaves.findIndex((entry) => entry.levelIndex >= 5);
  engine.currentCampaignIndex = Math.max(0, laterCampaignIndex);
  engine.frameCount = 180;
  engine.entities = [];
  return engine;
};

const createSpecialist = (engine, specialAttack) => {
  const source = engine.createEntity('ENEMY_DRONE', 165, 120);
  source.width = 54;
  source.height = 54;
  source.hp = 8;
  source.maxHp = 8;
  source.campaignRoleId = `test-${specialAttack}`;
  source.campaignGameplayRole = 'elite';
  source.campaignSpecialAttack = specialAttack;
  source.campaignFireBehavior = 'post-formation';
  source.campaignFireDelaySeconds = 0.5;
  source.campaignSpawnFrame = 0;
  source.campaignFormationFiringBehavior = 'post-formation';
  source.formationState = 'hold';
  source.formationGroupReady = true;
  source.isElite = false;
  source.attackIntervalFrames = 18;
  source.attackTimer = 17;
  source.projectileDamage = 1;
  source.projectileSpeed = 3.6;
  source.configuredBurstCount = 3;
  engine.entities.push(source);
  // REVAMP_NOTES_B: all regular sources must first be visible for 42 active
  // frames. Prove the new grace boundary before exercising the old special.
  engine.revampEnemies.tick(engine);
  engine.updateEliteEnemyFire();
  assert.equal(engine.pendingEnemyLasers.length, 0);
  assert.equal(engine.entities.some(entity => entity.type === 'PROJECTILE'), false);
  for (let frame = 0; frame < 42; frame++) {
    engine.frameCount++;
    engine.revampEnemies.tick(engine);
  }
  source.attackTimer = source.attackIntervalFrames - 1;
  return source;
};

test('authored ring and mine specialists execute without redundant elite spawn flags', () => {
  for (const [specialAttack, minimumProjectiles] of [['ring-burst', 6], ['mine-fan', 3]]) {
    const engine = createEngine();
    const source = createSpecialist(engine, specialAttack);

    engine.updateEliteEnemyFire();

    const projectiles = engine.entities.filter((entity) => entity.type === 'PROJECTILE');
    assert.ok(projectiles.length >= minimumProjectiles, `${specialAttack} should emit its signature projectiles`);
    assert.ok(projectiles.every((projectile) => projectile.damage === 1));
    assert.equal(source.campaignLastFireFrame, engine.frameCount);
  }
});

test('authored lane laser owns a readable charge and synchronized fire frame', () => {
  const engine = createEngine();
  const source = createSpecialist(engine, 'lane-laser');
  source.eliteAttackSequence = 4;

  engine.updateEliteEnemyFire();

  assert.equal(engine.pendingEnemyLasers.length, 1);
  assert.equal(engine.pendingEnemyLasers[0].requireEliteSource, false);
  assert.equal(source.isCharging, true);

  engine.pendingEnemyLasers[0].frames = 1;
  engine.frameCount++;
  engine.updatePendingEnemyLasers();

  assert.equal(source.isCharging, false);
  assert.equal(source.campaignLastFireFrame, engine.frameCount);
  assert.ok(engine.entities.some((entity) => entity.isDetachedBeam && !entity.isTelegraph));
});

test('Pixi-owned gameplay does not decode configured Canvas images again at spawn', () => {
  const baseline = imageConstructionCount;
  const engine = createEngine();
  engine.resolveSpriteUrl('SCICON_ENEMY_QUASAR_LANCER_FRAMES', 'ENEMY_JOURNAL');
  engine.resolveSpriteFrames('SCICON_ENEMY_QUASAR_LANCER_FRAMES');
  engine.createEnemy('ENEMY_JOURNAL', 100, 100, {
    spriteUrl: '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-01-neutral.png',
    spriteFrames: [
      '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-01-neutral.png',
      '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-02-charge.png',
      '/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-03-fire.png'
    ]
  });

  assert.equal(imageConstructionCount, baseline);
});
