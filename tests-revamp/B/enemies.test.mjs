import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['services/revamp/enemies/EnemyBehaviorRuntime.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { RevampEnemyDirector, findSafeSpawnPoint, getEnemyBulletCap, ENEMY_ENTRY_GRACE_FRAMES } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const enemy = (kind = 'sniper', extra = {}) => ({ id: 'test-hull', x: 80, y: 100, width: 32, height: 32,
  hp: 8, maxHp: 8, campaignRoleId: `role-revamp-${kind}`, formationState: 'hold', campaignSpawnFrame: 0, ...extra });
const setup = (enemies) => {
  const director = new RevampEnemyDirector();
  const shots = [], spawns = [], explosions = [], callouts = [], teleports = [];
  const context = { frame: 0, width: 390, height: 720, player: { x: 195, y: 620, radius: 12 }, enemies, enemyBulletCount: 0, difficultyTier: 'easy' };
  const callbacks = {
    fireAimed: (source, target, speed) => shots.push({ frame: context.frame, source, target: { ...target }, speed }),
    spawnChild: (source, child) => { spawns.push({ source, ...child }); },
    explodeMine: (mine) => explosions.push({ frame: context.frame, ...mine }),
    callout: (text) => callouts.push(text),
    teleport: (source, point) => { teleports.push({ frame: context.frame, ...point }); Object.assign(source, point); }
  };
  const tick = (frame) => { context.frame = frame; director.tick(context, callbacks); };
  const until = (end) => { for (let frame = context.frame + 1; frame <= end; frame++) tick(frame); };
  tick(0);
  return { director, shots, spawns, explosions, callouts, teleports, context, callbacks, tick, until };
};

test('all regular shots wait 0.7 s from visibility, including a fresh re-entry', () => {
  const hull = enemy('diver', { y: -100, campaignSpawnFrame: -500 });
  const h = setup([hull]);
  h.tick(200);
  assert.equal(h.director.canFire(hull, 200), false);
  hull.y = 10;
  h.tick(201);
  h.tick(242);
  assert.equal(h.director.canFire(hull, 242), false);
  h.tick(243);
  assert.equal(h.director.canFire(hull, 243), true);
  hull.x = -100; h.tick(244);
  hull.x = 80; h.tick(245);
  assert.equal(h.director.canFire(hull, 245), false);
  h.tick(245 + ENEMY_ENTRY_GRACE_FRAMES);
  assert.equal(h.director.canFire(hull, h.context.frame), true);
});

test('sniper exposes exactly 48 frames of a locked aiming line before one shot', () => {
  const h = setup([enemy()]);
  let start;
  for (let frame = 1; frame < 180; frame++) {
    h.tick(frame);
    const line = h.director.getTelegraphs().find((visual) => visual.kind === 'sniper');
    if (line && start === undefined) { start = frame; h.context.player.x = 340; }
    if (line) assert.equal(line.targetX, 195, 'charge does not track a dodging player');
    if (h.shots.length) break;
  }
  assert.ok(start >= 42);
  assert.equal(h.shots.length, 1);
  assert.equal(h.shots[0].frame - start, 48);
  assert.equal(h.shots[0].target.x, 195);
  h.until(300);
  assert.equal(h.shots.length, 1);
  assert.deepEqual(h.callouts, ['NEW ENEMY: SNIPER']);
});

test('special volleys reserve only available bullet slots and drop an over-budget charge', () => {
  const hulls = Array.from({ length: 5 }, (_, index) => enemy('sniper', { id: `hull-${index}` }));
  const h = setup(hulls);
  h.context.enemyBulletCount = getEnemyBulletCap('easy') - 2;
  h.until(170);
  assert.equal(h.shots.length, 2);
  assert.deepEqual(['easy', 'normal', 'hard', 'expert'].map(getEnemyBulletCap), [18, 28, 40, 52]);
});

test('teleporter previews its exact destination for 0.4 s and waits 0.7 s after blink', () => {
  const hull = enemy('teleporter');
  const h = setup([hull]);
  let firstGhost;
  for (let frame = 1; frame < 220; frame++) {
    h.tick(frame);
    const ghost = h.director.getTelegraphs().find((visual) => visual.kind === 'ghost');
    if (ghost && !firstGhost) firstGhost = { frame, ...ghost };
    if (h.teleports.length) break;
  }
  assert.ok(firstGhost);
  assert.equal(h.teleports.length, 1);
  const blink = h.teleports[0];
  assert.equal(blink.frame - firstGhost.frame, 24);
  assert.equal(blink.x + hull.width / 2, firstGhost.x);
  assert.equal(blink.y + hull.height / 2, firstGhost.y);
  h.until(blink.frame + 41);
  assert.equal(h.shots.length, 0);
  h.tick(blink.frame + 42);
  assert.equal(h.shots.length, 1);
});

test('teleport cancels when a moving player occupies the preview destination', () => {
  const hull = enemy('teleporter');
  const h = setup([hull]);
  for (let frame = 1; frame < 200; frame++) {
    h.tick(frame);
    const ghost = h.director.getTelegraphs().find((visual) => visual.kind === 'ghost');
    if (ghost) Object.assign(h.context.player, { x: ghost.x, y: ghost.y });
  }
  assert.equal(h.teleports.length, 0);
  assert.equal(h.shots.length, 0);
  assert.equal(hull.x, 80);
});

test('shield stops front shots but exposes both flanks and rear', () => {
  const hull = enemy('shield-bearer');
  const h = setup([hull]);
  assert.equal(h.director.blocksShieldHit(hull, 96, 150), true);
  assert.equal(h.director.blocksShieldHit(hull, 60, 116), false);
  assert.equal(h.director.blocksShieldHit(hull, 132, 116), false);
  assert.equal(h.director.blocksShieldHit(hull, 96, 85), false);
  assert.equal(h.director.ownsFiring(hull), true);
  assert.equal(h.director.getTelegraphs()[0].kind, 'shield');
});

test('splitter death emits two smaller children once, with safe spawn clearance', () => {
  const hull = enemy('splitter', { x: 180, y: 610 });
  const h = setup([hull]);
  hull.hp = 0;
  h.director.onEnemyDeath(hull, h.context, h.callbacks);
  h.director.onEnemyDeath(hull, h.context, h.callbacks);
  assert.equal(h.spawns.length, 2);
  for (const spawn of h.spawns) {
    assert.ok(spawn.scale < 1);
    assert.ok(Math.hypot(spawn.x + hull.width * spawn.scale / 2 - h.context.player.x,
      spawn.y + hull.height * spawn.scale / 2 - h.context.player.y) >= 56 + h.context.player.radius);
    assert.equal(spawn.mini, false);
  }
});

test('safe spawns fail closed in an arena too small for clearance', () => {
  assert.equal(findSafeSpawnPoint({ x: 20, y: 20 }, { width: 40, height: 40, player: { x: 20, y: 20, radius: 12 } }, 20), null);
  const result = findSafeSpawnPoint({ x: 195, y: 620 }, { width: 390, height: 720, player: { x: 195, y: 620, radius: 12 } }, 20);
  assert.ok(Math.hypot(result.x - 195, result.y - 620) >= 88);
});

test('mine has a full fuse ring and exchanges its reservation for one explosion', () => {
  const h = setup([enemy('mine-layer')]);
  let spawnedFrame;
  for (let frame = 1; frame < 150; frame++) {
    h.tick(frame);
    if (h.director.activeMineCount) { spawnedFrame = frame; break; }
  }
  assert.equal(h.director.getTelegraphs().find((visual) => visual.kind === 'mine').progress, 0);
  h.until(spawnedFrame + 155);
  assert.equal(h.explosions.length, 0);
  h.tick(spawnedFrame + 156);
  assert.equal(h.explosions.length, 1);
  assert.equal(h.explosions[0].radius, 34);
  assert.equal(h.director.activeMineCount, 0);
  assert.equal(h.director.getTelegraphs().some((visual) => visual.kind === 'blast'), true);
  h.until(spawnedFrame + 174);
  assert.equal(h.director.getTelegraphs().some((visual) => visual.kind === 'blast'), false);
});

test('mine deployment respects the bullet cap', () => {
  const h = setup([enemy('mine-layer')]);
  h.context.enemyBulletCount = getEnemyBulletCap('easy');
  h.until(200);
  assert.equal(h.director.activeMineCount, 0);
});

test('carrier releases three minis, respects live brood ownership, and stops after two broods', () => {
  const hull = enemy('carrier');
  const h = setup([hull]);
  h.callbacks.spawnChild = (source, child) => {
    h.spawns.push(child);
    h.context.enemies.push(enemy('none', { id: `mini-${h.spawns.length}`, revampCarrierId: source.id, campaignRoleId: undefined }));
  };
  h.until(160);
  assert.equal(h.spawns.length, 3);
  h.until(550);
  assert.equal(h.spawns.length, 3, 'no new brood while three existing minis survive');
  h.context.enemies = [hull];
  h.until(950);
  assert.equal(h.spawns.length, 6);
  h.context.enemies = [hull];
  h.until(1500);
  assert.equal(h.spawns.length, 6);
});

test('authored identity drives timing independently of random entity ids', () => {
  const a = setup([enemy('sniper', { id: 'random-one', formationIndex: 2, sourceEventId: 'squadron-a' })]);
  const b = setup([enemy('sniper', { id: 'random-two', formationIndex: 2, sourceEventId: 'squadron-a' })]);
  a.until(200); b.until(200);
  assert.equal(a.shots[0].frame, b.shots[0].frame);
});

test('authored attack intervals change sniper cadence without shortening its warning', () => {
  const h = setup([enemy('sniper', { attackIntervalFrames: 120 })]);
  h.until(400);
  assert.equal(h.shots.length, 3);
  assert.equal(h.shots[1].frame - h.shots[0].frame, 120);
  assert.equal(h.shots[2].frame - h.shots[1].frame, 120);
});

test('shield and splitter shooters honor their authored cadence outside the legacy scheduler', () => {
  for (const kind of ['shield-bearer', 'splitter']) {
    const hull = enemy(kind, { attackIntervalFrames: 90 });
    const h = setup([hull]);
    h.until(300);
    assert.equal(h.shots.length, 3);
    assert.equal(h.shots[1].frame - h.shots[0].frame, 90);
    assert.ok(h.shots[0].frame >= 42);
  }
});

test('cleanup clears transient mechanics and introduction announcements for a new run', () => {
  const hull = enemy('mine-layer');
  const h = setup([hull]);
  h.until(150);
  assert.ok(h.director.activeMineCount > 0);
  h.director.clear();
  assert.equal(h.director.activeMineCount, 0);
  assert.equal(h.director.canFire(hull, 150), false);
  assert.deepEqual(h.director.getTelegraphs(), []);
  h.tick(0);
  assert.equal(h.callouts.length, 2);
});

test('wave boundaries retire armed mines without repeating enemy introductions', () => {
  const hull = enemy('mine-layer');
  const h = setup([hull]);
  h.until(140);
  assert.ok(h.director.activeMineCount > 0);
  const callouts = h.callouts.length;
  h.director.clearEncounter();
  assert.equal(h.director.activeMineCount, 0);
  assert.deepEqual(h.director.getTelegraphs(), []);
  h.tick(141);
  assert.equal(h.callouts.length, callouts);
  assert.equal(h.director.canFire(hull, 141), false);
});
