import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: "export * from './services/revamp/wings/wingTuning'; export * from './services/revamp/wings/wingRuntime'; export * from './services/revamp/wings/wingCosmetics';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { WingSupportRuntime, getWingPassiveDamage, getMainWeaponDps, getWingCooldownFrames, getWingSpecial, stepWingSpring } = mod;
const abilities = ['pulse-cannon', 'spread-cycle', 'piercing-laser', 'coin-magnet', 'twin-burst', 'homing-missile', 'targeting-laser', 'prism-fan', 'heavy-cannon', 'nova-volley'];
const companion = (slot = 'left', ability = 'pulse-cannon', level = 1) => ({
  slot, id: `${slot}-${ability}`, ability, level, x: 160, y: 500,
  frameIndex: 0, entryProgress: 1, fireTimer: 0, fireIntervalFrames: 40,
  projectileDamage: 99, frames: ['a', 'b', 'c']
});
function fixture() {
  const shots = [], rings = [], shields = [], magnets = [];
  const frame = { centerX: 200, centerY: 500, width: 400, height: 700, frame: 0, canFire: true,
    mainDps: 10, entities: [], spawn: (wing, options) => shots.push({ damage: wing.projectileDamage, ...options }),
    ring: (...args) => rings.push(args), shield: frames => shields.push(frames), magnet: frames => magnets.push(frames) };
  return { frame, shots, rings, shields, magnets };
}
const bullet = (extra = {}) => ({ type: 'PROJECTILE', x: 200, y: 460, width: 4, height: 4, markedForDeletion: false, damage: 1, ...extra });

test('passive output is 15–20% per wing across hull tiers and every existing ship ability', () => {
  for (const hull of ['researchhub', 'bio', 'eth', 'btc']) for (const fireRate of [0, 7, 21, 49]) {
    const dps = getMainWeaponDps(hull, fireRate);
    assert.ok(dps > 0 && Number.isFinite(dps));
    for (let level = 1; level <= 5; level++) for (const ability of abilities) for (const slot of ['left', 'right']) {
      const runtime = new WingSupportRuntime(true, false, false), wing = companion(slot, ability, level), { frame, shots } = fixture();
      frame.mainDps = dps;
      for (let tick = 0; tick < 600; tick++) runtime.update([wing], { ...frame, frame: tick });
      const damage = shots.reduce((sum, shot) => sum + shot.damage, 0);
      assert.ok(Math.abs(damage / (dps * 10) - (0.15 + (level - 1) * 0.0125)) < 1e-9, `${hull} ${fireRate} ${ability} ${level}`);
    }
  }
});

test('higher levels strictly improve passive damage and cooldown; capstone evolves', () => {
  for (const ability of abilities) for (const slot of ['left', 'right']) {
    let damage = 0, cooldown = Infinity;
    for (let level = 1; level <= 5; level++) {
      const nextDamage = getWingPassiveDamage(10, level, 40);
      const nextCooldown = getWingCooldownFrames(getWingSpecial(slot, ability), level);
      assert.ok(nextDamage > damage);
      assert.ok(nextCooldown < cooldown && nextCooldown >= 480 && nextCooldown <= 1200);
      damage = nextDamage; cooldown = nextCooldown;
    }
    const runtime = new WingSupportRuntime(true), snapshot = runtime.snapshot([companion(slot, ability, 5)]);
    assert.equal(snapshot.wings[0].evolved, true);
    assert.notEqual(snapshot.wings[0].label, mod.WING_SPECIAL_LABELS[getWingSpecial(slot, ability)]);
  }
});

test('manual specials have one cooldown, pause cannot spend or advance it', () => {
  const runtime = new WingSupportRuntime(true, false, false), wing = companion(), { frame, shots } = fixture();
  runtime.update([wing], frame); shots.length = 0;
  assert.equal(runtime.activate('left', [wing], true), true);
  assert.equal(shots.length, 1);
  assert.equal(runtime.activate('left', [wing], true), false);
  const remaining = runtime.snapshot([wing]).wings[0].cooldownFrames;
  runtime.reset([wing]);
  assert.equal(runtime.snapshot([wing]).wings[0].cooldownFrames, remaining, 'formation reset cannot bypass cooldown');
  for (let i = 0; i < 60; i++) runtime.update([wing], { ...frame, canFire: false });
  assert.equal(runtime.snapshot([wing]).wings[0].cooldownFrames, remaining);
  assert.equal(runtime.activate('left', [wing], true), false);
  for (let i = 0; i < remaining; i++) runtime.update([wing], frame);
  assert.equal(runtime.activate('left', [wing], false), false);
  assert.equal(runtime.activate('left', [wing], true), true);
});

test('cosmetics use bounded existing graphics; unknown IDs draw nothing and reduced motion is static', () => {
  const calls = [];
  const graphics = Object.fromEntries(['moveTo', 'lineTo', 'stroke', 'circle', 'fill'].map(method => [method, (...args) => { calls.push([method, ...args]); return graphics; }]));
  mod.drawRevampShipCosmetic(graphics, graphics, 'unknown', 100, 100, 0, false);
  assert.equal(calls.length, 0);
  for (const id of ['revamp-trail-ion', 'revamp-trail-aurora', 'revamp-skin-frontier']) {
    calls.length = 0; mod.drawRevampShipCosmetic(graphics, graphics, id, 100, 100, 0, true);
    const first = structuredClone(calls);
    assert.ok(first.length > 0 && first.length <= 24);
    calls.length = 0; mod.drawRevampShipCosmetic(graphics, graphics, id, 100, 100, 999, true);
    assert.deepEqual(calls, first);
    for (const [method, style] of calls) if (method === 'stroke' || method === 'fill') assert.ok(style.alpha <= 0.75);
  }
});

test('utility eraser is bounded and preserves beams, friendly shots, telegraphs and bodies', () => {
  const runtime = new WingSupportRuntime(true, false, false), wing = companion('right', 'twin-burst'), { frame } = fixture();
  const protectedEntities = [bullet({ isPlayerShot: true }), bullet({ isBeam: true }), bullet({ damage: 0 }), bullet({ type: 'BOSS' }), bullet({ x: 390 })];
  const hostiles = Array.from({ length: 50 }, () => bullet());
  frame.entities = [...protectedEntities, ...hostiles]; runtime.update([wing], frame);
  assert.equal(runtime.activate('right', [wing], true), true);
  assert.equal(hostiles.filter(entity => entity.markedForDeletion).length, 24);
  assert.ok(protectedEntities.every(entity => !entity.markedForDeletion));
});

test('auto utility waits for useful conditions, all right slots are utility', () => {
  for (const ability of abilities) assert.match(getWingSpecial('right', ability), /^(shield-pulse|bullet-eraser|magnet-field)$/);
  const runtime = new WingSupportRuntime(true), wing = companion('right'), { frame, shields } = fixture();
  runtime.update([wing], frame); assert.equal(shields.length, 0);
  frame.entities = [bullet()]; runtime.update([wing], frame); assert.deepEqual(shields, [90]);
  runtime.update([wing], frame); assert.equal(shields.length, 1);
});

test('offense auto-cast recognizes authored enemy entity kinds and ignores supplies', () => {
  const runtime = new WingSupportRuntime(true), wing = companion(), { frame, rings } = fixture();
  frame.entities = [bullet({ type: 'SUPPLY_DROP' })]; runtime.update([wing], frame);
  assert.equal(rings.length, 0);
  frame.entities = [bullet({ type: 'ENEMY_DRONE' })]; runtime.update([wing], frame);
  assert.equal(rings.length, 1);
});

test('L5 evolution changes specials: twin lance and a longer gravity well', () => {
  const offense = new WingSupportRuntime(true, false, false), left = companion('left', 'pulse-cannon', 5), one = fixture();
  offense.update([left], one.frame); one.shots.length = 0; offense.activate('left', [left], true);
  assert.equal(one.shots.length, 2); assert.ok(one.shots.every(shot => shot.pierceCount === 5));
  const utility = new WingSupportRuntime(true, false, false), right = companion('right', 'coin-magnet', 5), two = fixture();
  utility.update([right], two.frame); utility.activate('right', [right], true); assert.deepEqual(two.magnets, [360]);
});

test('spring settles at ±76 and enlarged wings stay clear of the hitbox, including arena edges', () => {
  const spring = { x: 0, y: 0, vx: 0, vy: 0, tilt: 0 };
  stepWingSpring(spring, 100, 100); assert.ok(spring.x > 0 && spring.x < 100 && spring.tilt > 0);
  for (let i = 0; i < 400; i++) stepWingSpring(spring, 100, 100);
  assert.ok(Math.abs(spring.x - 100) < 0.001 && Math.abs(spring.tilt) < 0.001);
  const runtime = new WingSupportRuntime(true, false, false), wings = [companion(), companion('right')], { frame } = fixture();
  for (let i = 0; i < 400; i++) runtime.update(wings, frame);
  assert.ok(Math.abs(wings[0].x - 124) < 0.001 && Math.abs(wings[1].x - 276) < 0.001);
  for (const x of [250, 100, 300, 60, 340]) for (const y of [500, 650]) {
    runtime.update(wings, { ...frame, centerX: x, centerY: y });
    for (const wing of wings) {
      assert.ok(wing.x >= 40 && wing.x <= frame.width - 40);
      assert.ok(wing.y >= 40 && wing.y <= frame.height - 40);
      assert.ok(Math.hypot(wing.x - x, wing.y - y) >= 58, 'larger art never covers player center');
    }
  }
});

test('first flight wing joins at ten simulation seconds and disabled weekly controller is inert', () => {
  const runtime = new WingSupportRuntime(true, true), wing = companion(), { frame, shots } = fixture();
  for (let i = 0; i < 599; i++) runtime.update([wing], frame);
  assert.equal(runtime.isDeployed(), false); assert.equal(shots.length, 0);
  runtime.update([wing], frame); assert.equal(runtime.isDeployed(), true); assert.ok(wing.entryProgress < 0.1);
  const weekly = new WingSupportRuntime(false), unchanged = companion(), before = { ...unchanged };
  weekly.update([unchanged], frame); assert.deepEqual(unchanged, before);
  assert.equal(weekly.activate('left', [unchanged], true), false); assert.equal(weekly.snapshot([unchanged]).enabled, false);
});
