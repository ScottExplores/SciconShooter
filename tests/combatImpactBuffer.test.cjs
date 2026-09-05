const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const campaign = require('../game-config/campaign.json');
const load = entry => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};
const { CombatImpactBuffer, getProjectileCombatContact } = load('services/gameplay/CombatImpactBuffer.ts');
const input = (frame = 1) => ({ frame, x: 12, y: 30, color: '#67e8f9', size: 12, vx: 0, vy: -14,
  targetId: 'target', projectileId: 'pulse', boss: false });

test('impact receipts have deterministic monotonic order and a strict 64-entry memory bound', () => {
  const buffer = new CombatImpactBuffer(10000);
  const second = new CombatImpactBuffer();
  for (let frame = 0; frame < 1000; frame++) {
    buffer.record(input(frame));
    second.record(input(frame));
  }
  assert.equal(buffer.capacity, 64);
  assert.equal(buffer.events.length, 64);
  assert.equal(buffer.latestSequence, 1000);
  assert.equal(buffer.events[0].sequence, 937);
  assert.equal(buffer.events.at(-1).sequence, 1000);
  assert.deepEqual(buffer.events, second.events);
  assert.ok(Object.isFrozen(buffer.events));
  assert.ok(buffer.events.every(Object.isFrozen));
  assert.equal(buffer.events, buffer.events, 'reading does not allocate until another hit arrives');
});

test('clearing a world drops old receipts without reusing a renderer sequence', () => {
  const buffer = new CombatImpactBuffer(2);
  buffer.record(input(10));
  const previous = buffer.events;
  buffer.clear();
  assert.deepEqual(buffer.events, []);
  assert.equal(buffer.latestSequence, 1);
  assert.equal(buffer.record(input(0)).sequence, 2);
  assert.equal(previous.length, 1, 'existing read snapshots are immutable');
  assert.equal(previous[0].frame, 10);
});

test('invalid visual coordinates are rejected and large visual sizes are bounded without RNG', () => {
  const buffer = new CombatImpactBuffer();
  for (const field of ['frame', 'x', 'y', 'size', 'vx', 'vy']) {
    assert.equal(buffer.record({ ...input(), [field]: NaN }), undefined);
  }
  assert.equal(buffer.latestSequence, 0);
  const original = Math.random;
  try {
    Math.random = () => { throw new Error('impact presentation must not draw random values'); };
    const event = buffer.record({ ...input(), size: 1000, color: 'invalid', frame: 4.9 });
    assert.equal(event.size, 32);
    assert.equal(event.color, '#67e8f9');
    assert.equal(event.frame, 4);
  } finally { Math.random = original; }
});

test('contact is at the approaching projectile tip, clamped to the already-struck body or component', () => {
  const target = { x: 100, y: 200, width: 40, height: 40 };
  const upward = { x: 112, y: 230, width: 6, height: 16 };
  assert.deepEqual(getProjectileCombatContact(upward, target, 0, -14), { x: 115, y: 230 });
  assert.deepEqual(getProjectileCombatContact(upward, target, 0, 0), { x: 115, y: 230 });
  assert.deepEqual(getProjectileCombatContact({ x: 130, y: 210, width: 20, height: 6 }, target, 14, 0), { x: 140, y: 213 });
  const component = { x: 116, y: 220, width: 8, height: 8 };
  assert.deepEqual(getProjectileCombatContact(upward, component, 0, -14), { x: 116, y: 228 });
  assert.deepEqual(upward, { x: 112, y: 230, width: 6, height: 16 }, 'sampling does not mutate shot geometry');
});

global.Image ??= class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const { GameEngine, Entity } = load('services/gameLogic.ts');
const stats = () => ({ score: 0, highScore: 0, wave: 1, coins: 0, totalCoins: 0, enemiesDefeated: 0,
  bombs: 0, bombCharge: 0, bombChargeMax: 100, lives: 3, repairsCount: 0,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960, upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: {}, bossProgress: 0, isBossActive: false, bossHp: 0, bossMaxHp: 100 });
const fixture = (previewMode = false) => {
  const engine = new GameEngine(stats(), { campaign, previewMode, audioEnabled: false,
    preloadCanvasAssets: false, randomSeed: 'combat-impact-buffer' });
  engine.init(390, 844);
  engine.entities = [];
  engine.frameCount = 300;
  engine.player.y = 720;
  return engine;
};
const enemy = engine => {
  const target = new Entity('ENEMY_DRONE', 100, 250, .5);
  target.width = 36; target.height = 40; target.hp = 30; target.maxHp = 30;
  engine.entities.push(target);
  return target;
};
const shot = (engine, target, type = 'PROJECTILE') => {
  const pulse = new Entity(type, target.x + target.width / 2 - 3, target.y + target.height / 2, .5);
  pulse.width = 6; pulse.height = 16; pulse.vx = 0; pulse.vy = -14;
  pulse.isPlayerShot = true; pulse.damage = 4; pulse.weaponKind = 'pulse'; pulse.color = '#67e8f9';
  engine.entities.push(pulse);
  return pulse;
};
const boss = (engine, withComponents = false) => {
  const original = campaign.levels.flatMap(level => level.waves.flatMap(wave => wave.events))
    .find(event => event.kind === 'boss' && event.bossId === 'gatekeeper-prime');
  engine.spawnBoss({ ...structuredClone(original), id: 'impact-fixture-boss', bossId: 'impact-fixture-boss',
    health: 1000, ...(withComponents ? {} : { componentMode: 'hull-only' }) });
  const target = engine.entities.find(entity => entity.type === 'BOSS');
  target.x = 90; target.y = 110; target.vx = 0; target.vy = 0;
  target.spriteUrl = undefined; target.spriteFrames = undefined;
  return target;
};

test('accepted nonfatal and killing shots both retain a contact receipt before entity removal', () => {
  for (const lethal of [false, true]) {
    const engine = fixture();
    const target = enemy(engine);
    if (lethal) target.hp = 1;
    const pulse = shot(engine, target);
    const expected = getProjectileCombatContact(engine.getCollisionBox(pulse), engine.getCollisionBox(target), pulse.vx, pulse.vy);
    engine.checkCollisions();
    assert.equal(engine.combatImpacts.events.length, 1);
    const event = engine.combatImpacts.events[0];
    assert.equal(event.targetId, target.id);
    assert.equal(event.projectileId, pulse.id);
    assert.equal(event.frame, 300);
    assert.deepEqual({ x: event.x, y: event.y }, expected);
    assert.equal(event.boss, false);
    assert.equal(target.hp, lethal ? -3 : 26);
    assert.equal(target.markedForDeletion, lethal);
    engine.checkCollisions();
    assert.equal(engine.combatImpacts.events.length, 1, 'a consumed pulse cannot replay its hit');
  }
});

test('misses, zero-damage hits, and beam collision ticks cannot create projectile impact receipts', () => {
  for (const kind of ['miss', 'zero', 'beam']) {
    const engine = fixture(); const target = enemy(engine); const pulse = shot(engine, target);
    if (kind === 'miss') pulse.x = 300;
    if (kind === 'zero') pulse.damage = 0;
    if (kind === 'beam') pulse.isBeam = true;
    engine.checkCollisions();
    assert.equal(engine.combatImpacts.events.length, 0, kind);
    assert.equal(target.hp, kind === 'beam' ? 26 : 30, 'visual filtering cannot change accepted damage');
  }
});

test('real missiles record a larger contact without changing their established damage', () => {
  const engine = fixture(); const target = enemy(engine); const pulse = shot(engine, target, 'MISSILE');
  engine.checkCollisions();
  assert.equal(target.hp, 25);
  assert.equal(pulse.markedForDeletion, true);
  assert.equal(engine.combatImpacts.events.length, 1);
  assert.equal(engine.combatImpacts.events[0].size, 20);
});

test('boss hull hits and destructible-component hits retain distinct already-accepted contacts', () => {
  for (const withComponents of [false, true]) {
    const engine = fixture(); const target = boss(engine, withComponents);
    const component = withComponents ? target.bossComponents.find(part => part.id === 'left-cannon') : undefined;
    const bounds = component ? engine.getBossComponentBox(target, component) : engine.getCollisionBox(target);
    const pulse = shot(engine, target);
    pulse.x = bounds.x + bounds.width / 2 - pulse.width / 2;
    pulse.y = bounds.y + bounds.height / 2;
    const before = component?.hp ?? target.hp;
    engine.checkCollisions();
    assert.ok((component?.hp ?? target.hp) < before);
    const event = engine.combatImpacts.events[0];
    assert.ok(event, 'accepted boss or component damage produces one receipt');
    assert.equal(event.componentId, component?.id);
    assert.equal(event.boss, true);
    assert.ok(event.x >= bounds.x && event.x <= bounds.x + bounds.width);
    assert.ok(event.y >= bounds.y && event.y <= bounds.y + bounds.height);
  }
});

test('invulnerable hulls and protected components do not pretend blocked shots did damage', () => {
  for (const withComponents of [false, true]) {
    const engine = fixture(true); const target = boss(engine, withComponents);
    const component = withComponents ? target.bossComponents.find(part => part.id === 'left-cannon') : undefined;
    const bounds = component ? engine.getBossComponentBox(target, component) : engine.getCollisionBox(target);
    if (component) assert.equal(engine.setPreviewBossComponentInvincibility(component.id, true, target.sourceEventId), true);
    else assert.equal(engine.setPreviewBossHullInvincibility(true, target.sourceEventId), true);
    const pulse = shot(engine, target);
    pulse.x = bounds.x + bounds.width / 2 - pulse.width / 2;
    pulse.y = bounds.y + bounds.height / 2;
    const before = component?.hp ?? target.hp;
    engine.checkCollisions();
    assert.equal(component?.hp ?? target.hp, before);
    assert.equal(engine.combatImpacts.events.length, 0);
  }
});

test('lean presentation and receipt retention never change gameplay damage or hit consumption', () => {
  const outcomes = [];
  for (const lean of [false, true]) {
    const engine = fixture(); engine.performanceMode = lean;
    const target = enemy(engine); const pulse = shot(engine, target);
    engine.checkCollisions();
    outcomes.push({ hp: target.hp, score: engine.stats.score, consumed: pulse.markedForDeletion,
      point: [engine.combatImpacts.events[0].x, engine.combatImpacts.events[0].y] });
    assert.equal(engine.entities.some(entity => entity === engine.combatImpacts.events[0]), false);
    const sequence = engine.combatImpacts.latestSequence;
    engine.init(390, 844);
    assert.equal(engine.combatImpacts.events.length, 0);
    assert.equal(engine.combatImpacts.latestSequence, sequence);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test('one-hit ordinary kills retain exactly one death after their entity was compacted', () => {
  for (const type of ['ENEMY_DRONE', 'ENEMY_SWARM', 'ENEMY_BRICK', 'ENEMY_JOURNAL', 'ENEMY_INVADER', 'SUPPLY_DROP']) {
    const engine = fixture(); const target = enemy(engine);
    target.type = type; target.hp = 1; target.color = '#f97316';
    shot(engine, target);
    engine.checkCollisions();
    engine.compactEntities();
    assert.equal(engine.entities.includes(target), false, type);
    assert.equal(engine.combatDestructions.events.length, 1, type);
    const receipt = engine.combatDestructions.events[0];
    assert.deepEqual(receipt, { sequence: 1, frame: 300,
      x: target.x + target.width / 2, y: target.y + target.height / 2,
      color: '#f97316', size: 32, vx: 0, vy: 0, targetId: target.id, projectileId: '', boss: false });
    const score = engine.stats.score;
    engine.handleEnemyDestroyed(target);
    assert.equal(engine.combatDestructions.events.length, 1, 'duplicate destruction cannot replay its receipt');
    assert.equal(engine.stats.score, score, 'existing duplicate-reward guard is unchanged');
  }
});

test('research and Bitcoin special damage keep their own impact effects but reliably emit ordinary deaths', () => {
  for (const ability of ['research-charge', 'btc-hash-burst']) {
    const engine = fixture(); const target = enemy(engine); target.hp = 1;
    const pulse = shot(engine, target); pulse.shipAbilityKind = ability;
    engine.checkCollisions();
    assert.equal(target.markedForDeletion, true, ability);
    assert.equal(engine.combatImpacts.events.length, 0, 'special detonations are not ordinary projectile contacts');
    assert.equal(engine.combatDestructions.events.length, 1, ability);
    assert.equal(engine.combatDestructions.events[0].targetId, target.id);
    assert.ok(engine.entities.some(entity => entity.type === 'EFFECT'), 'existing signature effect is preserved');
  }
});

test('escaping ordinary hulls do not falsely report kills or explode after removal', () => {
  for (const type of ['ENEMY_DRONE', 'SUPPLY_DROP']) {
    const engine = fixture(); const target = enemy(engine); target.type = type;
    target.y = engine.height + 80; target.vy = 2;
    engine.gameActive = true; engine.introFlightFrames = 0;
    engine.update();
    assert.equal(target.markedForDeletion, true, type);
    assert.equal(engine.entities.includes(target), false, type);
    assert.equal(engine.combatDestructions.events.length, 0, type);
  }
});

test('boss and special projectile deaths remain in their established bespoke lifecycles', () => {
  for (const type of ['BOSS', 'MINI_BOSS', 'PROJECTILE']) {
    const engine = fixture();
    const target = type === 'BOSS' ? boss(engine) : enemy(engine);
    target.type = type; target.hp = 0;
    if (type === 'PROJECTILE') target.prismMothArtifactState = {
      kind: 'brood', destructible: true, targetable: true, collisionActive: true, damageActive: true
    };
    engine.handleEnemyDestroyed(target);
    assert.equal(target.markedForDeletion, true, type);
    assert.equal(engine.combatDestructions.events.length, 0, type);
  }
});

test('death receipts are presentation-only in lean mode and are cleared with new worlds', () => {
  const outcomes = [];
  for (const lean of [false, true]) {
    const engine = fixture(); engine.performanceMode = lean;
    const target = enemy(engine); target.hp = 1;
    shot(engine, target); engine.checkCollisions();
    outcomes.push({ hp: target.hp, score: engine.stats.score, defeated: engine.stats.enemiesDefeated,
      deaths: engine.combatDestructions.events.length });
    const sequence = engine.combatDestructions.latestSequence;
    engine.init(390, 844);
    assert.equal(engine.combatDestructions.events.length, 0);
    assert.equal(engine.combatDestructions.latestSequence, sequence);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});
