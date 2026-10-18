import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

// One bundle retains the same WeakMap and event bus across adapter/runtime exports.
const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/bosses/engineAdapter.ts';
      export * from './services/revamp/bosses/runtime.ts';
      export * from './services/revamp/bosses/catalog.ts';
      export * from './services/revamp/bosses/patterns.ts';
      export * from './services/revamp/events.ts';
      export * from './services/bossCoinBurst.ts';`,
    resolveDir: process.cwd(), loader: 'ts'
  },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022'
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {
  REVAMP_BOSSES, attachRevampBoss, updateRevampBoss, getBossEncounter,
  bossCanTakeDamage, bossDamageMultiplier, revampHullDamage, afterRevampHullDamage,
  damageRevampPart, beginBossPhaseTransition, defeatRevampBoss,
  createBossAttackPlan, revampEvents, getBossCoinBurstCount
} = api;

function fixture(profile = REVAMP_BOSSES[0]) {
  const boss = { id: 11, sourceItemId: profile.sourceBossId, sourceEventId: `revamp:${profile.id}`,
    x: 10, y: -200, width: 320, height: 220, hp: 1000, maxHp: 1000,
    bossComponents: [], attackTimer: 0, color: '#44bbcc' };
  const shots = [];
  const sounds = [];
  const engine = {
    width: 390, height: 844, frameCount: 0, entities: [], stats: { wave: 6, coins: 0 },
    player: { x: 180, y: 710, width: 30, height: 30 },
    playSound: (...args) => sounds.push(args), pulseDamageFlash: () => {}, pulseBossComponentFlash: () => {},
    spawnGeneratedBossProjectile: (owner, x, y, angle, speed, color, size) => {
      shots.push({ x, y, angle, speed, color, size });
      engine.entities.push({ bossOwnerId: owner.id, x, y, width: size, height: size, isPlayerShot: false });
    },
    spawnEnemyLaneLaser: (owner, axis, center, warning, follows, duration) => {
      const beam = { bossOwnerId: owner, x: center, y: 0, width: 1, height: 1, duration };
      engine.entities.push(beam);
      return beam;
    }
  };
  attachRevampBoss(engine, boss);
  const state = getBossEncounter(boss);
  const tick = (frames = 1) => {
    for (let i = 0; i < frames; i++) { engine.frameCount++; updateRevampBoss(engine, boss); }
  };
  return { boss, engine, state, tick, shots, sounds };
}

test('intro lasts 72 simulation frames, then a complete warning precedes damage', () => {
  const f = fixture();
  assert.equal(f.state.stage, 'intro');
  assert.equal(revampHullDamage(f.boss, 100), 0);
  f.tick(71);
  assert.equal(f.state.stage, 'intro');
  assert.equal(f.shots.length, 0);
  f.tick();
  assert.equal(f.state.stage, 'warning');
  const warningFrames = f.state.remainingFrames;
  assert.ok(warningFrames >= 36);
  f.tick(warningFrames - 1);
  assert.equal(f.state.stage, 'warning');
  assert.equal(f.shots.length, 0);
  f.tick();
  assert.equal(f.state.stage, 'fire');
  assert.ok(f.shots.length > 0);
  assert.equal(f.sounds.filter(([sound]) => sound === 'boss_alert').length, 1);
});

test('a same-frame burst cannot skip 66/33 phase gates or their 60-frame immunity', () => {
  const f = fixture();
  f.tick(72);
  for (const [phase, expectedHp] of [[2, 660], [3, 330]]) {
    f.boss.hp -= revampHullDamage(f.boss, 100_000);
    afterRevampHullDamage(f.engine, f.boss);
    assert.equal(f.boss.hp, expectedHp);
    assert.equal(f.state.phase, phase);
    assert.equal(f.state.stage, 'transition');
    assert.equal(f.state.remainingFrames, 60);
    for (let i = 0; i < 40; i++) assert.equal(revampHullDamage(f.boss, 100_000), 0);
    f.tick(59);
    assert.equal(bossCanTakeDamage(f.state), false);
    assert.equal(f.state.stage, 'transition');
    f.tick();
    assert.equal(f.state.stage, 'warning');
    assert.equal(bossCanTakeDamage(f.state), true);
  }
  assert.equal(revampHullDamage(f.boss, 100_000), 330);
});

test('warning geometry stays committed when the player moves before the attack fires', () => {
  const f = fixture();
  f.tick(72);
  const plan = f.state.plan;
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.projectiles[0]));
  const expected = plan.projectiles.map(shot => ({
    x: shot.x, y: shot.y, angle: Math.atan2(shot.vy, shot.vx), speed: Math.hypot(shot.vx, shot.vy),
    color: '#ffcc66', size: shot.size
  }));
  f.engine.player.x = 4;
  f.tick(f.state.remainingFrames);
  assert.equal(f.state.plan, plan);
  assert.deepEqual(f.shots, expected);
});

test('recovery clears owned hazards and opens a genuine extra-damage interval', () => {
  const f = fixture();
  f.tick(72);
  f.tick(f.state.remainingFrames);
  const foreign = { bossOwnerId: 99, x: 1, y: 1, width: 2, height: 2 };
  const player = { bossOwnerId: f.boss.id, isPlayerShot: true, x: 1, y: 1, width: 2, height: 2 };
  f.engine.entities.push(foreign, player);
  f.tick(f.state.plan.liveFrames);
  assert.equal(f.state.stage, 'recovery');
  assert.equal(bossDamageMultiplier(f.state), 1.45);
  assert.equal(revampHullDamage(f.boss, 100), 145);
  assert.ok(f.engine.entities.filter(entity => entity !== foreign && entity !== player).every(entity => entity.markedForDeletion));
  assert.equal(foreign.markedForDeletion, undefined);
  assert.equal(player.markedForDeletion, undefined);
  f.tick(f.state.remainingFrames - 1);
  assert.equal(f.state.stage, 'recovery');
  f.tick();
  assert.equal(f.state.stage, 'warning');
});

test('a destroyed part interrupts a committed attack and stays disabled in every phase', () => {
  for (const profile of REVAMP_BOSSES) {
    const f = fixture(profile);
    f.tick(72);
    assert.equal(f.state.attack.id, profile.part.disablesAttackId);
    damageRevampPart(f.engine, f.boss, f.boss.bossComponents[0], 100_000);
    assert.equal(f.state.stage, 'stagger');
    assert.equal(f.state.part.broken, true);
    assert.equal(f.state.plan, null);
    assert.equal(f.state.attack, null);
    assert.equal(bossDamageMultiplier(f.state), 1.75);
    assert.equal(revampHullDamage(f.boss, 100), 175);
    f.tick(71);
    assert.equal(f.state.stage, 'stagger');
    for (let phase = 1; phase <= 3; phase++) {
      if (phase > 1) beginBossPhaseTransition(f.state);
      for (let frame = 0; frame < 1800; frame++) {
        f.tick();
        assert.notEqual(f.state.attack?.id, profile.part.disablesAttackId, `${profile.id} phase ${phase}`);
      }
    }
  }
});

test('rage triggers once at 15% and never shortens the minimum warning', () => {
  const events = [];
  const unsubscribe = revampEvents.on('boss:rage', event => events.push(event));
  try {
    const f = fixture();
    f.tick(72);
    f.state.phase = 3;
    f.boss.hp = 150;
    f.tick(1200);
    assert.equal(events.length, 1);
    assert.equal(f.state.rage, true);
    for (const profile of REVAMP_BOSSES) for (const attack of profile.attacks) {
      const plan = createBossAttackPlan({ attack: { ...attack, telegraphFrames: 1 }, phase: 3, sequence: 8,
        origin: { x: 195, y: 190 }, player: { x: 195, y: 730 }, rage: true });
      assert.equal(plan.warningFrames, 36);
      assert.ok(plan.lines.length + plan.zones.length > 0);
      assert.ok(['amber', 'magenta'].includes(plan.color));
    }
  } finally { unsubscribe(); }
});

test('all plans produce identical geometry for default and explicit phone worlds', () => {
  for (const profile of REVAMP_BOSSES) for (const attack of profile.attacks) for (const phase of [1, 2, 3]) {
    const input = { attack, phase, sequence: profile.patternOffset, rage: phase === 3,
      origin: { x: 195, y: 190 }, player: { x: 75, y: 730 } };
    assert.deepEqual(createBossAttackPlan(input), createBossAttackPlan({ ...input, worldWidth: 390, worldHeight: 844 }));
  }
});

test('defeat emits one bounded chain and visual-only coin burst without awarding currency', () => {
  const f = fixture();
  const events = [];
  const unsubscribe = revampEvents.on('*', event => events.push(event));
  try {
    defeatRevampBoss(f.engine, f.boss);
    defeatRevampBoss(f.engine, f.boss);
    const ofType = type => events.filter(event => event.type === type);
    assert.equal(ofType('boss:defeat').length, 1);
    assert.equal(ofType('boss:explosion').length, 6);
    assert.deepEqual(ofType('boss:explosion').map(event => event.offsetFrames), [0, 5, 10, 15, 20, 25]);
    assert.equal(ofType('boss:debris').length, 1);
    assert.equal(ofType('boss:slow-mo')[0].durationMs, 400);
    assert.equal(ofType('boss:coin-burst').length, 1);
    assert.equal(ofType('boss:coin-burst')[0].count, getBossCoinBurstCount('main-boss', f.engine.stats.wave));
    assert.equal(ofType('boss:coin-burst')[0].visualOnly, true);
    assert.equal(f.engine.stats.coins, 0);
    assert.equal(revampHullDamage(f.boss, 100), 0);
    const count = events.length;
    f.tick(100);
    assert.equal(events.length, count);
  } finally { unsubscribe(); }
});

test('effect listeners can unsubscribe or throw without blocking combat event delivery', () => {
  const seen = [];
  const unsubscribeThrowing = revampEvents.on('test:boss', () => { throw new Error('optional effect failed'); });
  const unsubscribeHealthy = revampEvents.on('test:boss', event => seen.push(event));
  try {
    revampEvents.emit('test:boss', { type: 'cannot-override', x: 4 });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'test:boss');
    unsubscribeHealthy();
    revampEvents.emit('test:boss');
    assert.equal(seen.length, 1);
  } finally { unsubscribeThrowing(); unsubscribeHealthy(); }
});
