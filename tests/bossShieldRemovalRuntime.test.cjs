const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);

class TestImage {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = '';
  src = '';
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
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    module,
    module.exports
  );
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
    randomSeed: 'boss-shield-removal'
  });
  engine.init(390, 844);
  engine.entities = [];
  engine.frameCount = 300;
  return engine;
};

const findBossEvent = () => {
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const event = wave.events.find((candidate) => candidate.kind === 'boss');
      if (event) return structuredClone(event);
    }
  }
  throw new Error('Campaign must contain a boss fixture');
};

const spawnHullOnlyBoss = (engine, shieldCount = 0) => {
  const event = {
    ...findBossEvent(),
    id: `shield-removal-boss-${shieldCount}`,
    bossId: `shield-removal-boss-${shieldCount}`,
    label: 'Shield Removal Boss',
    componentMode: 'hull-only',
    shieldCount
  };
  engine.spawnBoss(event);
  const boss = engine.entities.find((entity) => entity.type === 'BOSS');
  assert.ok(boss, 'the authored full boss should spawn');
  boss.x = 100;
  boss.y = 100;
  boss.vx = 0;
  boss.vy = 0;
  boss.spriteUrl = undefined;
  boss.spriteFrames = undefined;
  return boss;
};

test('authored shieldCount is compatibility-only and never auto-spawns escorts', () => {
  const engine = createEngine();
  const boss = spawnHullOnlyBoss(engine, 7);
  const startingHealth = boss.hp;

  assert.equal(
    engine.entities.some((entity) => entity.type === 'ENEMY_SWARM'),
    false,
    'no generic escort entities are created from the legacy field'
  );

  engine.damageBossHull(boss, 13);
  assert.equal(
    boss.hp,
    startingHealth - 13,
    'the entered boss remains directly damageable despite legacy shieldCount data'
  );
});

test('an unrelated orbit formation cannot shield a full boss from player fire', () => {
  const engine = createEngine();
  const boss = spawnHullOnlyBoss(engine, 0);
  const orbitEnemy = engine.createEntity('ENEMY_SWARM', 20, 200);
  orbitEnemy.formation = 'orbit';
  orbitEnemy.hp = 4;
  orbitEnemy.maxHp = 4;
  engine.entities.push(orbitEnemy);

  const shot = engine.createEntity('PROJECTILE', boss.x + 60, boss.y + 60);
  shot.width = 28;
  shot.height = 28;
  shot.isPlayerShot = true;
  shot.damage = 10;
  engine.entities.push(shot);
  const startingHealth = boss.hp;

  engine.checkCollisions();

  assert.ok(boss.hp < startingHealth, 'the player shot damages the boss');
  assert.equal(orbitEnemy.markedForDeletion, false, 'the unrelated orbit enemy is untouched');
});

test('legacy shield cleanup cannot own an orbit formation or stall boss completion', () => {
  const engine = createEngine();
  const boss = spawnHullOnlyBoss(engine, 0);
  const orbitEnemy = engine.createEntity('ENEMY_SWARM', 30, 220);
  orbitEnemy.formation = 'orbit';
  orbitEnemy.hp = 4;
  orbitEnemy.maxHp = 4;
  engine.entities.push(orbitEnemy);

  engine.dispatchBossTimelineCue(boss, {
    clip: {
      id: 'legacy-shields-down',
      label: 'Legacy shields down',
      primitiveId: 'set-shield',
      parameters: { enabled: false, shieldCount: 0 }
    },
    executionIndex: 0,
    timelineFrame: 0
  }, 1);
  assert.equal(
    orbitEnemy.markedForDeletion,
    false,
    'the retired cleanup marker cannot claim an unrelated orbit formation'
  );

  boss.hp = 0;
  engine.handleEnemyDestroyed(boss);

  assert.equal(boss.markedForDeletion, true);
  assert.equal(engine.bossRef, null, 'boss lifecycle reaches its normal completed state');
});

test('legacy set-shield cues are harmless while typed boss summons still spawn', () => {
  const engine = createEngine();
  const boss = spawnHullOnlyBoss(engine, 0);
  boss.sourceEventId = 'typed-summon-owner';
  const setShieldCue = {
    clip: {
      id: 'legacy-shield',
      label: 'Legacy shield',
      primitiveId: 'set-shield',
      parameters: { enabled: true, shieldCount: 6 }
    },
    executionIndex: 0,
    timelineFrame: 0
  };
  const summonCue = {
    clip: {
      id: 'meaningful-reinforcements',
      label: 'Meaningful reinforcements',
      primitiveId: 'summon-formation',
      parameters: {
        enemyId: 'drone',
        formationPatternId: 'v',
        summonCount: 3
      }
    },
    executionIndex: 0,
    timelineFrame: 0
  };

  engine.dispatchBossTimelineCue(boss, setShieldCue, 2);
  assert.equal(
    engine.entities.filter((entity) => entity !== boss).length,
    0,
    'the retired primitive creates no invisible gate or escort'
  );

  engine.dispatchBossTimelineCue(boss, summonCue, 2);
  const summons = engine.entities.filter((entity) => (
    entity !== boss && entity.sourceEventId === boss.sourceEventId
  ));
  assert.equal(summons.length, 3);
  assert.ok(summons.every((entity) => entity.formation !== 'orbit'));
});
