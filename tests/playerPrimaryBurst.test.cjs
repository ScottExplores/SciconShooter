const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const esbuild = require('esbuild');
const { PNG } = require('../director/node_modules/pngjs');
const load = entry => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const mod = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  return mod.exports;
};
global.Image = class { complete = true; naturalWidth = 1; naturalHeight = 1; src = ''; };
const { GameEngine, Entity } = load('services/gameLogic.ts');
const burst = load('services/playerPrimaryBurst.ts');
const tiers = load('services/weaponTierProgression.ts');
const visuals = load('services/playerWeaponVisuals.ts');
const weapons = load('services/playerShipWeapons.ts');
const { createCombatLabStats, createCombatLabLoadout, createCombatLabCampaign } = load('services/combatLab.ts');
const fixture = (ship = 'eth', level = 49) => {
  const engine = new GameEngine(createCombatLabStats(), { campaign: createCombatLabCampaign(), previewMode: true,
    playerShipId: ship,
    squadLoadout: createCombatLabLoadout(ship, level, 0, 7, [], 5), audioEnabled: false,
    preloadCanvasAssets: false, randomSeed: 'primary-pulse-test' });
  engine.init(390, 844);
  engine.introFlightFrames = 0; engine.entities = []; engine.pendingPlayerShots = [];
  engine.gameActive = true; engine.playerDrawScale = 1; engine.refreshLoadState();
  engine.stats.upgrades.fireRate = level;
  return engine;
};

test('RSC deliberately stays on its existing bundle/cadence/art behavior', () => {
  for (const level of [0, 7, 21, 49]) assert.equal(burst.getPlayerPrimaryBurst('researchhub', level, true), null);
  const engine = fixture('researchhub'); engine.fireBullet();
  const shots = engine.entities.filter(e => e.isPlayerShot);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].hullPrimaryPulse, false);
  assert.equal(shots[0].maxShotVisualPattern.length, 7);
  assert.deepEqual(visuals.getPlayerWeaponFrameAnchor('research', 3), { x: 0.5, y: 0.5 });
});

test('every non-RSC tier preserves sustained hull DPS with a bounded real pulse rhythm', () => {
  for (const ship of ['bio', 'eth', 'btc']) for (const level of [0, 7, 14, 21, 28, 35, 42, 49]) {
    for (const max of [false, true]) {
      const plan = burst.getPlayerPrimaryBurst(ship, level, max);
      const profile = weapons.getPlayerShipWeaponProfile(ship);
      const lanes = ship === 'bio' ? 2 : ship === 'eth' ? 3 : 1;
      const oldDps = tiers.getFireRateVolleyDamageMultiplier(tiers.getFireRateTier(level))
        * (ship === 'bio' ? 0.58 : profile.laneDamageScale) * lanes * (max ? 2 : 1)
        / (tiers.getFireRateIntervalFrames(level) * profile.cadenceScale);
      assert.ok(Math.abs(plan.totalDamage / plan.cycleFrames - oldDps) < 1e-10);
      assert.ok(plan.shots.length <= 9);
      assert.ok(Math.max(...plan.shots.map(s => s.fireDelayFrames)) < plan.cycleFrames);
      if (level >= 7) assert.ok(new Set(plan.shots.map(s => s.fireDelayFrames)).size >= 2);
      assert.ok(plan.shots.every(s => Math.abs(s.angle) < 0.35), 'controlled forward coverage, not random fire');
    }
  }
});

test('max BIO/ETH/BTC delayed pulses launch from the current nose while moving and rolling', () => {
  for (const ship of ['bio', 'eth', 'btc']) {
    const engine = fixture(ship);
    engine.fireBullet();
    assert.ok(engine.pendingPlayerShots.length > 0);
    let emitted = 1;
    for (let frame = 1; frame < 16; frame++) {
      engine.frameCount++;
      engine.player.x += frame % 2 ? 4 : -3; engine.player.y -= 3;
      engine.playerTilt = frame % 2 ? -0.35 : 0.35;
      engine.playerDrawScale = frame % 2 ? 0.95 : 1.05;
      const due = engine.pendingPlayerShots.filter(s => s.fireFrame <= engine.frameCount);
      const count = engine.entities.length;
      engine.flushPendingPlayerShots(true);
      const created = engine.entities.slice(count).filter(e => e.isPlayerShot);
      assert.equal(created.length, due.length);
      created.forEach((shot, i) => {
        const muzzle = burst.getPlayerPrimaryMuzzle({ shipId: ship, ...engine.player,
          drawScale: engine.playerDrawScale, barrel: due[i].hullPulse.barrel });
        const layout = burst.getPlayerPrimaryPulseLayout(shot.projectileUnitWidth, shot.projectileUnitHeight, shot.weaponVisualLevel);
        const clearance = Math.max(layout.height, shot.height) / 2 + 2;
        assert.ok(Math.abs(shot.x + shot.width / 2 - Math.sin(due[i].angleBias) * clearance - muzzle.x) < 1e-8);
        assert.ok(Math.abs(shot.y + shot.height / 2 + Math.cos(due[i].angleBias) * clearance - muzzle.y) < 1e-8);
        assert.equal(shot.maxShotVisualPattern, undefined, 'no old visual copies travel behind the collision body');
        assert.equal(shot.hullPrimaryPulse, true);
      });
      emitted += created.length;
    }
    assert.equal(emitted, burst.getPlayerPrimaryBurst(ship, 49, false).shots.length);
  }
});

test('queued pulse energy clears on pause, death, inactive game, and loadout changes', () => {
  for (const action of [e => e.update(true), e => { e.gameActive = false; e.update(); },
    e => e.startDeathSequence(), e => e.clearQueuedPrimaryBursts(),
    e => { e.stats.upgrades.fireRate = 0; e.flushPendingPlayerShots(true); },
    e => { e.playerShipId = 'bio'; e.flushPendingPlayerShots(true); }]) {
    const engine = fixture(); engine.fireBullet(); assert.ok(engine.pendingPlayerShots.length);
    action(engine);
    assert.equal(engine.pendingPlayerShots.filter(s => s.hullPulse).length, 0);
  }
});

test('single collision bodies carry exactly the pulse damage (no hidden represented-round multiplier)', () => {
  for (const ship of ['bio', 'eth', 'btc']) {
    const engine = fixture(ship);
    engine.fireBullet();
    const shot = engine.entities.find(e => e.isPlayerShot);
    shot.y = 300;
    engine.pendingPlayerShots = [];
    const target = new Entity('ENEMY_DRONE', shot.x - 8, shot.y - 8, 0.5);
    target.width = 32; target.height = 48; target.hp = 1000; target.maxHp = 1000;
    engine.entities.push(target);
    const health = target.hp;
    engine.checkCollisions();
    assert.ok(Math.abs(health - target.hp - shot.damage) < 1e-8, ship);
    assert.equal(shot.representedRoundsRemaining, 0);
  }
});

test('hit-stop preserves pulse spacing and Max Shot expiry cannot leave charged rounds queued', () => {
  const engine = fixture('eth');
  engine.fireBullet();
  const delays = engine.pendingPlayerShots.map(s => s.fireFrame - engine.frameCount);
  engine.hitStopFrames = 6;
  for (let frame = 0; frame < 6; frame++) engine.update();
  assert.deepEqual(engine.pendingPlayerShots.map(s => s.fireFrame - engine.frameCount), delays);
  engine.clearQueuedPrimaryBursts();
  engine.activePowerups.set('MAX_SHOT', 60);
  engine.fireBullet();
  assert.ok(engine.pendingPlayerShots.length);
  engine.activePowerups.delete('MAX_SHOT');
  engine.flushPendingPlayerShots(true);
  assert.equal(engine.pendingPlayerShots.length, 0);
});

test('max tier sustained fire fits the existing mobile cap across 1000 frames', () => {
  for (const ship of ['bio', 'eth', 'btc']) {
    const engine = fixture(ship);
    engine.player.y = 780;
    const plan = burst.getPlayerPrimaryBurst(ship, 49, true);
    engine.activePowerups.set('MAX_SHOT', 2000);
    let next = 0, volleys = 0, peak = 0;
    for (let frame = 0; frame < 1000; frame++) {
      engine.frameCount = frame;
      for (const shot of engine.entities) { shot.x += shot.vx; shot.y += shot.vy; }
      engine.entities = engine.entities.filter(e => e.y >= -50 && e.x >= -80 && e.x <= 470);
      engine.refreshLoadState();
      engine.flushPendingPlayerShots(true);
      if (frame >= next) {
        const before = engine.weaponVolley;
        engine.fireBullet();
        assert.equal(engine.weaponVolley, before + 1, `${ship} cadence blocked at ${frame}`);
        next += plan.cycleFrames; volleys++;
      }
      peak = Math.max(peak, engine.entities.length + engine.pendingPlayerShots.length);
    }
    assert.equal(volleys, Math.ceil(1000 / plan.cycleFrames));
    assert.ok(peak <= 96, `${ship}: ${peak}`);
  }
});

test('frame-specific optical anchors track the actual checked-in energy silhouettes', () => {
  for (const family of ['bio', 'eth', 'btc']) for (let frame = 0; frame < 4; frame++) {
    const png = PNG.sync.read(fs.readFileSync(`public/game-art/generated/scicon-combat-evolution-v1/${family}-${frame + 1}.png`));
    let l = 128, r = 0, t = 128, b = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (png.data[(y * 128 + x) * 4 + 3] > 32) {
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    const anchor = visuals.getPlayerWeaponFrameAnchor(family, frame);
    assert.equal(anchor.x, (l + r + 1) / 256);
    assert.equal(anchor.y, (t + b + 1) / 256);
  }
});

test('actual fixed-step firing delivers the scheduled DPS without cadence rounding loss', () => {
  for (const ship of ['bio', 'eth', 'btc']) for (const level of [0, 14, 49]) {
    const engine = fixture(ship, level);
    // Keep the production update/fire/collision path, isolating only scripted
    // opponents and wave completion so this is a repeatable firing-range run.
    engine.spawnEnemies = () => {};
    engine.spawnConfiguredSupportEvents = () => {};
    engine.completeClearWaveIfReady = () => {};
    engine.getDueConfiguredEncounter = () => undefined;
    engine.announcedFireRateLevel = level;
    engine.keys[' '] = true;
    let damage = 0, count = 0;
    const original = engine.spawnPlayerBullet.bind(engine);
    engine.spawnPlayerBullet = (...args) => {
      const emitted = original(...args);
      if (emitted) { damage += engine.entities.at(-1).damage; count++; }
      return emitted;
    };
    for (let frame = 0; frame < 1200; frame++) engine.update(false);
    const plan = burst.getPlayerPrimaryBurst(ship, level, false);
    const expected = 1200 / plan.cycleFrames * plan.totalDamage;
    assert.ok(Math.abs(damage - expected) <= plan.totalDamage + 1e-8,
      `${ship} level ${level}: emitted ${damage} expected ${expected}`);
    assert.ok(count > 0);
  }
});
