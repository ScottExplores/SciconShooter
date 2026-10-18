import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scratch = await mkdtemp(join(tmpdir(), 'scicon-P-enemy-size-'));
let runtime;
try {
  const outfile = join(scratch, 'runtime.mjs');
  await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export { GameEngine } from './services/gameLogic';
    export { resolveFairArenaFrame } from './services/gameplay/fairArena';
  ` }, outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
  define: { 'import.meta.env.PROD': 'false', 'import.meta.env.DEV': 'false', 'import.meta.env.MODE': '"test"' } });
  globalThis.Image ??= class { set src(_value) {} };
  runtime = await import(pathToFileURL(outfile).href);
} finally { await rm(scratch, { recursive: true, force: true }); }

function makeEngine(mobile = true, reduced = false) {
  const engine = new runtime.GameEngine({ score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0,
    enemiesDefeated: 0, bombs: 2, bombCharge: 0, bombChargeMax: 100, shipAbilityCooldown: 0,
    shipAbilityCooldownMax: 960, lives: 3, repairsCount: 0, upgrades: { fireRate: 0, speed: 0, ability: 0 },
    powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 },
  { audioEnabled: false, preloadCanvasAssets: false, testMode: true, randomSeed: 'P-readable-enemies' });
  engine.init(390, 844);
  engine.mobileProfile = mobile;
  engine.setPerformanceMode(reduced);
  return engine;
}

test('regular bodies and collision bounds grow together, equally on every render profile', () => {
  const snapshots = [[true, false], [false, false], [true, true]].map(([mobile, reduced]) => {
    const engine = makeEngine(mobile, reduced);
    return [
      ['ENEMY_DRONE', 0.68, 44, 44, 0.68],
      ['ENEMY_DRONE', 0.72, 47, 47, 0.68],
      ['ENEMY_DRONE', 1, 65, 65, 0.68],
      ['ENEMY_JOURNAL', 1, 76, 89, 0.68],
      ['ENEMY_BRICK', 1, 73, 73, 0.8],
      ['ENEMY_SWARM', 1, 61, 50, 0.52],
    ].map(([type, sizeMultiplier, width, height, collisionRatio]) => {
      const enemy = engine.createEnemy(type, 80, 120, { sizeMultiplier });
      const box = engine.getCollisionBox(enemy);
      assert.equal(enemy.width, width);
      assert.equal(enemy.height, height);
      assert.ok(Math.abs(box.width - width * collisionRatio) < 0.0001);
      assert.ok(Math.abs(box.height - height * collisionRatio) < 0.0001);
      assert.equal(box.x + box.width / 2, enemy.x + enemy.width / 2);
      assert.equal(box.y + box.height / 2, enemy.y + enemy.height / 2);
      return { type, width: enemy.width, height: enemy.height, box };
    });
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[0], snapshots[2]);
});

test('phone displays retain readable grid hulls inside the same 390×844 arena', () => {
  const engine = makeEngine();
  const enemy = engine.createEnemy('ENEMY_DRONE', 80, 120, { sizeMultiplier: 0.68 });
  for (const [width, height] of [[360, 640], [390, 844], [430, 932], [1440, 900]]) {
    const frame = runtime.resolveFairArenaFrame(width, height);
    assert.equal(frame.worldWidth, 390);
    assert.equal(frame.worldHeight, 844);
    assert.ok(enemy.width * frame.scale >= 33, `${width}×${height} grid silhouette stays readable`);
    assert.ok(frame.displayWidth <= width && frame.displayHeight <= height);
  }
});

function packedGrid(count, mobile) {
  const engine = makeEngine(mobile);
  const authored = engine.getConfiguredSpawnEvents();
  const grid = authored.find(event => event.id.includes('-grid'));
  const divers = authored.find(event => event.id.includes('-divers'));
  assert.ok(grid && divers);
  const gridCount = count - 2;
  const event = { ...grid, count: gridCount, formationSlots: Array.from({ length: gridCount }, (_, index) => ({
    x: 0.16 + index % 6 * 0.136,
    y: 0.145 + Math.floor(index / 6) * 0.054,
  })) };
  for (const waveEvent of [event, divers]) {
    for (let index = 0; index < waveEvent.count; index++) {
      // Isolate real spawn/slot/collision geometry from threat-admission timing.
      assert.ok(engine.spawnConfiguredEnemyFromEvent(waveEvent, index, waveEvent.count, 1, false));
    }
    engine.configuredSpawnCounts.set(waveEvent.id, waveEvent.count);
  }
  engine.separateAssembledFormationMembers();
  const members = engine.entities.filter(entity => entity.campaignRoleId).map(entity => ({
    x: entity.formationTargetX, y: entity.formationTargetY,
    width: entity.width, height: entity.height, locked: entity.formationSlotLocked,
  }));
  assert.equal(members.length, count);
  for (const member of members) {
    assert.ok(member.locked);
    assert.ok(member.x >= 4 && member.x + member.width <= 386.001);
    assert.ok(member.y >= 48 && member.y + member.height <= 844 * 0.58 + 0.001);
  }
  for (let index = 0; index < members.length; index++) {
    const a = members[index];
    for (const b of members.slice(index + 1)) {
      const overlap = a.x < b.x + b.width + 4.99 && a.x + a.width + 4.99 > b.x
        && a.y < b.y + b.height + 4.99 && a.y + a.height + 4.99 > b.y;
      assert.equal(overlap, false, `${count} hulls preserve five-pixel clearance`);
    }
  }
  return members;
}

test('30–40 enlarged hulls and their support pair fit without overlap on both profiles', () => {
  for (const count of [30, 32, 40]) assert.deepEqual(packedGrid(count, true), packedGrid(count, false));
});

test('regular readability scaling leaves authored boss presence unchanged', () => {
  const engine = makeEngine();
  engine.spawnBoss();
  const boss = engine.entities.find(entity => entity.type === 'BOSS');
  assert.equal(boss.width, 220);
  assert.equal(boss.height, 200);
  engine.spawnMiniBoss(1);
  const mini = engine.entities.find(entity => entity.type === 'MINI_BOSS');
  assert.equal(mini.width, 140);
  assert.equal(mini.height, 160);
});
