import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the real engine, including admission, firing, collision and wave clocks.
const temporary = await mkdtemp(join(tmpdir(), 'scicon-B-engine-'));
await build({ entryPoints: ['services/gameLogic.ts'], bundle: true, platform: 'node', format: 'esm',
  outfile: join(temporary, 'engine.mjs'), logLevel: 'silent', define: {
    'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false', 'import.meta.env.MODE': '"test"'
  } });
globalThis.Image ??= class { set src(_value) {} };
const { GameEngine, Entity } = await import(pathToFileURL(join(temporary, 'engine.mjs')).href);
await rm(temporary, { recursive: true, force: true });
const makeEngine = (options = {}) => {
  const engine = new GameEngine({ score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0,
    enemiesDefeated: 0, bombs: 2, bombCharge: 0, bombChargeMax: 100, shipAbilityCooldown: 0,
    shipAbilityCooldownMax: 960, lives: 3, repairsCount: 0, upgrades: { fireRate: 0, speed: 0, ability: 0 },
    powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 },
  { audioEnabled: false, preloadCanvasAssets: false, testMode: true, randomSeed: 'revamp-B-integration', ...options });
  engine.init(390, 844);
  engine.invincibleTimer = 100000;
  return engine;
};

test('opening engine schedule delivers combat, six-second pickup and thirty-second mini-boss', () => {
  const engine = makeEngine();
  const observed = {};
  const arrivals = new Map();
  for (let frame = 1; frame <= 3600; frame++) {
    engine.update();
    for (const e of engine.entities) {
      if (e.markedForDeletion) continue;
      if (e.campaignRoleId && e.y >= 0) {
        observed.action ??= frame / 60;
        arrivals.set(e.id, arrivals.get(e.id) ?? frame);
        // Fixed kill timing isolates event scheduling from player skill/DPS.
        if (frame - arrivals.get(e.id) >= 180) { e.hp = 0; engine.handleEnemyDestroyed(e); engine.hitStopFrames = 0; }
      }
      if (e.sourceEventId?.includes('power-six-seconds')) observed.power ??= frame / 60;
      if (e.sourceEventId?.includes('magnet-eighteen')) observed.magnet ??= frame / 60;
      if (e.type === 'MINI_BOSS') {
        observed.mini ??= frame / 60;
        if (frame / 60 > 50) { e.hp = 0; engine.handleEnemyDestroyed(e); }
      }
    }
    if (engine.waveTransitionPending || !engine.gameActive) { observed.result = frame / 60; break; }
  }
  assert.ok(observed.action < 5, JSON.stringify(observed));
  assert.ok(Math.abs(observed.power - 6) < 0.05, JSON.stringify(observed));
  assert.ok(Math.abs(observed.magnet - 18) < 0.05, JSON.stringify(observed));
  assert.ok(Math.abs(observed.mini - 30) < 0.1, JSON.stringify(observed));
  assert.ok(observed.result >= 50 && observed.result <= 60, JSON.stringify(observed));
});

test('engine Galaga dive emits exactly one shot and returns to its slot', () => {
  const engine = makeEngine();
  const event = engine.getConfiguredSpawnEvents().find(e => e.id.includes('divers'));
  engine.spawnConfiguredEnemyFromEvent(event, 0, event.count);
  const enemy = engine.entities.find(e => e.campaignRoleId === 'role-revamp-diver');
  assert.ok(enemy);
  enemy.x = enemy.formationTargetX; enemy.y = enemy.formationTargetY;
  enemy.formationState = 'hold'; enemy.formationGroupReady = true;
  for (let i = 0; i < 43; i++) engine.revampEnemies.tick(engine);
  engine.beginConfiguredFormationAttack(enemy, 0);
  assert.equal(enemy.formationFlight.revampReturnsToSlot, true);
  const duration = enemy.formationFlight.duration;
  // Avoid the pack controller advancing a separate formation during this isolated pass.
  enemy.campaignFormationPackInstanceId = undefined;
  for (let i = 0; i <= Math.ceil(duration); i++) {
    engine.frameCount++;
    engine.revampEnemies.tick(engine);
    engine.stepConfiguredEnemyFormation(enemy);
  }
  assert.equal(engine.entities.filter(e => e.type === 'PROJECTILE' && !e.isPlayerShot).length, 1);
  assert.equal(enemy.formationState, 'hold');
  assert.ok(Math.abs(enemy.x - enemy.formationTargetX) < 12);
  assert.ok(Math.abs(enemy.y - enemy.formationTargetY) < 5);
});

test('edge warning stalls entry for 48 active ticks and consumes no pause time', () => {
  const engine = makeEngine();
  const enemy = engine.createEnemy('ENEMY_DRONE', 30, 916);
  enemy.formationEntryPath = 'revamp-bottom-flank';
  engine.revampEnemies.register(engine, enemy);
  for (let i = 0; i < 48; i++) {
    assert.equal(engine.revampEnemies.holdForWarning(engine, enemy), true);
    engine.revampEnemies.tick(engine);
    engine.frameCount += 10; // Presentation time cannot shorten the combat warning.
  }
  assert.equal(engine.revampEnemies.holdForWarning(engine, enemy), false);
  assert.equal(engine.revampEnemies.warnings.size, 0);
});

test('mixed hostile sources share one total bullet cap', () => {
  const engine = makeEngine();
  for (let i = 0; i < 40; i++) {
    const shot = new Entity('PROJECTILE', 30 + i, 100);
    shot.isPlayerShot = false;
    engine.entities.push(shot);
  }
  engine.revampEnemies.enforceBulletCap(engine);
  assert.equal(engine.entities.filter(e => !e.markedForDeletion).length, engine.revampEnemies.cap(engine));
});

test('new module simulation stays identical when only the render profile differs', () => {
  const engines = [makeEngine(), makeEngine()];
  engines[0].mobileProfile = true;
  engines[1].mobileProfile = false;
  const snapshots = engines.map(engine => {
    for (let frame = 0; frame < 240; frame++) engine.update();
    return engine.entities.filter(e => e.campaignRoleId).map(e => ({ role: e.campaignRoleId,
      x: Number(e.x.toFixed(4)), y: Number(e.y.toFixed(4)), hp: e.hp, state: e.formationState }));
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
});
