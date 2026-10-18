import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Mock only browser image decoding. Combat, collision, scheduling and rewards use
// the real GameEngine; audio is disabled and no persistence providers are mounted.
const previousImage = globalThis.Image;
globalThis.Image = class { complete = false; naturalWidth = 0; };
const temporary = await mkdtemp(join(tmpdir(), 'scicon-C-engine-'));
after(async () => {
  if (previousImage === undefined) delete globalThis.Image;
  else globalThis.Image = previousImage;
  await rm(temporary, { recursive: true, force: true });
});
const bundle = await build({
  stdin: {
    contents: `export * from './services/gameLogic.ts';
      export * from './services/combatLab.ts';
      export * from './services/levelConfig.ts';
      export * from './services/revamp/bosses/bossLab.ts';
      export * from './services/revamp/bosses/runtime.ts';
      export * from './services/revamp/bosses/catalog.ts';
      export * from './services/revamp/events.ts';
      export * from './services/bossCoinBurst.ts';
      export * from './types.ts';`,
    resolveDir: process.cwd(), loader: 'ts'
  },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
  define: { 'import.meta.env': '{}' }
});
const modulePath = join(temporary, 'engine.mjs');
await writeFile(modulePath, bundle.outputFiles[0].text);
const {
  GameEngine, createCombatLabStats, DEFAULT_GAME_CAMPAIGN, createBossLabEncounter,
  REVAMP_BOSSES, getBossEncounter, revampEvents, EntityType, getBossCoinBurstCount
} = await import(pathToFileURL(modulePath).href);

function createFight(profile) {
  const encounter = createBossLabEncounter(DEFAULT_GAME_CAMPAIGN, profile);
  const engine = new GameEngine(createCombatLabStats(), {
    campaign: encounter.campaign, previewMode: true, previewInvincible: true,
    initialLevelId: encounter.levelId, initialWaveId: encounter.waveId,
    randomSeed: `integration:${profile.id}`, audioEnabled: false, preloadCanvasAssets: false
  });
  engine.init(390, 844);
  const until = (condition, limit = 1200) => {
    for (let frame = 0; frame < limit && !condition(); frame++) engine.update();
    assert.ok(condition(), `${profile.id} did not reach the expected state within ${limit} ticks`);
  };
  until(() => engine.bossRef !== null);
  const boss = engine.bossRef;
  const state = getBossEncounter(boss);
  return { engine, encounter, boss, state, until };
}

test('the real engine spawns every requested profile and routes hull and part damage through polish hooks', () => {
  for (const profile of REVAMP_BOSSES) {
    const f = createFight(profile);
    assert.equal(f.state.definition.id, profile.id);
    assert.equal(f.boss.sourceItemId, profile.sourceBossId);
    assert.equal(f.state.stage, 'intro');
    const startingHp = f.boss.hp;
    f.engine.damageBossHull(f.boss, 100_000);
    assert.equal(f.boss.hp, startingHp);
    f.until(() => f.state.stage === 'warning');
    const hitBox = { x: f.state.part.x - 2, y: f.state.part.y - 2, width: 4, height: 4 };
    const component = f.engine.getBossComponentHit(f.boss, hitBox);
    assert.ok(component, `${profile.id} visible part must be targetable`);
    f.engine.damageBossComponent(f.boss, component, 100_000);
    assert.equal(f.state.part.broken, true);
    assert.equal(f.state.stage, 'stagger');
    f.engine.damageBossHull(f.boss, 100_000);
    assert.equal(f.boss.hp, startingHp * 0.66);
    assert.equal(f.state.phase, 2);
    assert.equal(f.state.stage, 'transition');
    f.engine.damageBossHull(f.boss, 100_000);
    assert.equal(f.boss.hp, startingHp * 0.66);
  }
});

test('a normally travelling shot reaches every marked part before the hull intercepts it', () => {
  for (const profile of REVAMP_BOSSES) {
    const f = createFight(profile);
    f.until(() => f.state.stage === 'warning');
    const initialHull = f.boss.hp;
    const shot = f.engine.createEntity(EntityType.PROJECTILE,
      f.state.part.x - 4, f.boss.y + f.boss.height + 64);
    shot.width = shot.height = 8;
    shot.vx = 0;
    shot.vy = -6;
    shot.isPlayerShot = true;
    shot.damage = f.state.part.maxHp + 1;
    f.engine.entities.push(shot);
    f.until(() => f.state.part.broken, 40);
    assert.equal(f.boss.hp, initialHull, `${profile.id}: the targeted emitter must absorb the shot`);
    assert.equal(f.state.stage, 'stagger');
  }
});

test('real engine projectiles and beams exactly match each committed warning plan', () => {
  for (const profile of REVAMP_BOSSES) {
    const f = createFight(profile);
    const attacks = [];
    const unsubscribe = revampEvents.on('boss:attack', event => {
      if (event.entityId !== f.boss.id) return;
      attacks.push({
        kind: f.state.attack.kind,
        plan: f.state.plan,
        entities: f.engine.entities.filter(entity => entity.bossOwnerId === f.boss.id && !entity.markedForDeletion)
          .map(entity => ({ x: entity.x, y: entity.y, vx: entity.vx, vy: entity.vy,
            width: entity.width, height: entity.height, isBeam: entity.isBeam, life: entity.life }))
      });
    });
    try {
      f.until(() => attacks.some(attack => attack.kind === 'gap-ring'));
      f.engine.setPreviewBossHealthRatio(0.6, f.encounter.eventId);
      f.until(() => attacks.some(attack => attack.kind === 'weave-wall'));
      f.engine.setPreviewBossHealthRatio(0.3, f.encounter.eventId);
      f.until(() => attacks.some(attack => attack.kind === 'lane-salvo'));
      assert.deepEqual(new Set(attacks.map(attack => attack.kind)), new Set(['aimed-fan', 'gap-ring', 'weave-wall', 'lane-salvo']));
      for (const attack of attacks) {
        assert.equal(attack.entities.length, attack.plan.projectiles.length + attack.plan.zones.length, `${profile.id}/${attack.kind}`);
        for (const [index, projectile] of attack.plan.projectiles.entries()) {
          const actual = attack.entities[index];
          assert.equal(actual.x, projectile.x - projectile.size / 2);
          assert.equal(actual.y, projectile.y - projectile.size / 2);
          assert.equal(actual.width, projectile.size);
          assert.equal(actual.height, projectile.size);
          assert.ok(Math.abs(actual.vx - projectile.vx) < 1e-10);
          assert.ok(Math.abs(actual.vy - projectile.vy) < 1e-10);
        }
        for (const [index, zone] of attack.plan.zones.entries()) {
          const actual = attack.entities[attack.plan.projectiles.length + index];
          assert.equal(actual.isBeam, true);
          assert.deepEqual({ x: actual.x, y: actual.y, width: actual.width, height: actual.height },
            { x: zone.x, y: zone.y, width: zone.width, height: zone.height });
          assert.equal(actual.life, zone.durationFrames);
        }
      }
    } finally { unsubscribe(); }
  }
});

test('the real defeat path awards its existing physical coin burst once and emits only a visual request', () => {
  const f = createFight(REVAMP_BOSSES[0]);
  const events = [];
  const unsubscribe = revampEvents.on('*', event => {
    if (event.entityId === f.boss.id) events.push(event);
  });
  try {
    f.until(() => f.state.stage === 'warning');
    for (let phase = 1; phase <= 2; phase++) {
      f.engine.damageBossHull(f.boss, 100_000);
      f.until(() => f.state.stage === 'warning');
    }
    // Finish via the normal projectile collision path, including its destruction call.
    const shot = f.engine.createEntity(EntityType.PROJECTILE,
      f.boss.x + f.boss.width / 2 - 4, f.boss.y + f.boss.height / 2 - 4);
    shot.width = shot.height = 8;
    shot.vx = shot.vy = 0;
    shot.isPlayerShot = true;
    shot.damage = 100_000;
    f.engine.entities.push(shot);
    f.until(() => f.boss.markedForDeletion);
    assert.equal(f.boss.hp, 0);
    const coins = () => f.engine.entities.filter(entity => entity.type === EntityType.COIN);
    const expected = getBossCoinBurstCount('main-boss', f.engine.stats.wave);
    assert.equal(coins().length, expected);
    assert.ok(coins().every(coin => coin.bossRewardWave === f.engine.wave));
    f.engine.handleEnemyDestroyed(f.boss);
    assert.equal(coins().length, expected);
    assert.equal(events.filter(event => event.type === 'boss:defeat').length, 1);
    const coinEvents = events.filter(event => event.type === 'boss:coin-burst');
    assert.equal(coinEvents.length, 1);
    assert.equal(coinEvents[0].count, expected);
    assert.equal(coinEvents[0].visualOnly, true);
    assert.equal(f.engine.stats.enemiesDefeated, 1);
    // Existing wave banking credits every coin once; effects cannot duplicate it.
    f.engine.bankDepartingBossCoins();
    assert.equal(f.engine.stats.coins, expected);
    f.engine.bankDepartingBossCoins();
    assert.equal(f.engine.stats.coins, expected);
  } finally { unsubscribe(); }
});
