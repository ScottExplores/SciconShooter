const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '../..');
function load(relative) {
  const compiled = esbuild.buildSync({ entryPoints: [path.join(root, relative)], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const box = { exports: {} };
  Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, box, box.exports);
  return box.exports;
}
const { EpisodeRuntime, resolveEpisode, validateAction, actionKeys, MOVEMENTS } = load('fly-lab/environment/core.ts');
const { rgbaToGray } = load('fly-lab/environment/pixels.ts');
const action = (tick) => ({ movement: MOVEMENTS[Math.floor(tick / 90) % MOVEMENTS.length], fire: tick % 120 < 95 });

test('real engine replays actions without browser images, wall clocks, or global randomness', () => {
  const originalRandom = Math.random;
  const originalNow = Date.now;
  const originalImage = global.Image;
  Math.random = () => { throw new Error('Ambient randomness reached deterministic simulation'); };
  Date.now = () => { throw new Error('Wall clock reached deterministic simulation'); };
  global.Image = class { constructor() { throw new Error('An image request escaped the simulation host'); } };
  try {
    const first = new EpisodeRuntime({ seed: 'repeatable', episode: { timeLimitSeconds: 25 } });
    const second = new EpisodeRuntime({ seed: 'repeatable', episode: { timeLimitSeconds: 25 } });
    assert.deepEqual(first.getState(), second.getState());
    for (let tick = 0; tick < 1500; tick++) {
      first.advanceTick(action(tick));
      second.advanceTick(action(tick));
      if (tick % 60 === 0) assert.deepEqual(first.getState(), second.getState());
    }
    assert.deepEqual(first.getState(), second.getState());
    assert.deepEqual(first.takeEvents(), second.takeEvents());
    first.close(); second.close();
  } finally {
    Math.random = originalRandom; Date.now = originalNow; global.Image = originalImage;
  }
});

test('cosmetic randomness and observer frequency cannot alter fixed-budget gameplay', () => {
  const first = new EpisodeRuntime({ seed: 'cosmetics', episode: { presentationSeed: 17, timeLimitSeconds: 35 } });
  const second = new EpisodeRuntime({ seed: 'cosmetics', episode: { presentationSeed: 989, timeLimitSeconds: 35 } });
  const withoutVisualConfig = (state) => ({ ...state, config: { ...state.config, presentationSeed: null } });
  for (let tick = 0; tick < 2100; tick++) {
    first.advanceTick(action(tick));
    second.advanceTick(action(tick));
    first.getState(); first.getState();
    second.engine.setPerformanceMode(true);
    if (tick % 60 === 0) assert.deepEqual(withoutVisualConfig(first.getState()), withoutVisualConfig(second.getState()));
  }
  assert.deepEqual(withoutVisualConfig(first.getState()), withoutVisualConfig(second.getState()));
  assert.deepEqual(first.takeEvents(), second.takeEvents());
  first.close(); second.close();
});

test('fresh episodes reset resources, timers, queued shots and immutable observations', () => {
  const first = new EpisodeRuntime({ seed: 700 });
  const initial = first.getState();
  for (let tick = 0; tick < 800; tick++) first.advanceTick(action(tick));
  first.engine.activatePowerup('EXTRA_LIFE');
  const observed = first.getState();
  assert.ok(Object.isFrozen(observed.player));
  assert.ok(Object.isFrozen(observed.stats.upgrades));
  assert.ok(Object.isFrozen(observed.entities));
  first.close();
  assert.throws(() => first.advanceTick(action(0)), /closed/);
  const fresh = new EpisodeRuntime({ seed: 700 });
  assert.deepEqual(fresh.getState(), initial);
  fresh.close();
});

test('movement and fire are independent native keyboard controls and diagonals are normalized', () => {
  assert.equal(MOVEMENTS.length * 2, 18);
  assert.deepEqual(actionKeys({ movement: 'NE', fire: false }), { ArrowUp: true, ArrowDown: false, ArrowLeft: false, ArrowRight: true, ' ': false });
  const silent = new EpisodeRuntime({ seed: 99 });
  const firing = new EpisodeRuntime({ seed: 99 });
  for (let tick = 0; tick < 180; tick++) {
    silent.advanceTick({ movement: 'NE', fire: false });
    firing.advanceTick({ movement: 'NE', fire: true });
  }
  assert.equal(silent.engine.lastShotFrame, -999);
  assert.ok(firing.engine.lastShotFrame > 0);
  assert.equal(firing.engine.touchPos, null);
  assert.ok(Math.hypot(firing.engine.playerVel.x, firing.engine.playerVel.y) <= firing.engine.getPlayerMovementSpeed() + 1e-9);
  silent.close(); firing.close();
});

test('the time limit truncates exactly and natural death terminates without a new advance', () => {
  const runtime = new EpisodeRuntime({ seed: 5, episode: { timeLimitSeconds: 0.2 } });
  for (let tick = 0; tick < 100; tick++) runtime.advanceTick({ movement: 'idle', fire: false });
  assert.equal(runtime.tick, 12);
  assert.equal(runtime.truncated, true);
  assert.equal(runtime.terminated, false);
  const death = new EpisodeRuntime({ seed: 6 });
  death.engine.lives = 0;
  death.engine.startDeathSequence();
  assert.equal(death.terminated, true);
  assert.equal(death.advanceTick({ movement: 'idle', fire: false }), false);
  assert.equal(death.tick, 0);
  runtime.close(); death.close();
});

test('seed, mission, duration and action input reject invalid values', () => {
  assert.throws(() => resolveEpisode({ seed: NaN }), /Seed/);
  assert.throws(() => resolveEpisode({ seed: '', episode: {} }), /Seed/);
  assert.throws(() => resolveEpisode({ seed: 1, episode: { levelId: 'missing' } }), /Unknown/);
  assert.throws(() => resolveEpisode({ seed: 1, episode: { timeLimitSeconds: 0 } }), /timeLimit/);
  assert.throws(() => validateAction({ movement: 'north', fire: true }), /Action/);
  assert.throws(() => validateAction({ movement: 'N', fire: 'false' }), /Action/);
});

test('native opportunity, accepted spawn and firing cadence events retain exact simulation ticks', () => {
  const runtime = new EpisodeRuntime({ seed: 812 });
  for (let tick = 0; tick < 900; tick++) runtime.advanceTick({ movement: 'idle', fire: tick < 300 || tick >= 340 });
  const events = runtime.takeEvents();
  const ofType = (type) => events.filter(event => event.type === type);
  assert.deepEqual(ofType('primary-fire-input').map(event => [event.tick, event.held]), [[1, true], [301, false], [341, true]]);
  const cycles = ofType('primary-fire-cycle');
  const shots = ofType('player-projectile-spawn');
  assert.equal(cycles.length, 54);
  assert.equal(shots.length, 54);
  assert.deepEqual(cycles.slice(0, 5).map(event => [event.tick, event.intervalFrames, event.accepted]),
    [[61, 15, true], [76, 15, true], [91, 15, true], [106, 15, true], [121, 15, true]]);
  assert.ok(cycles.every(event => event.tick <= 300 || event.tick >= 341));
  assert.equal(new Set(shots.map(event => event.entityId)).size, shots.length);
  const offers = ofType('enemy-spawn-offer');
  const accepted = ofType('enemy-spawn');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].targetCount, 8);
  assert.equal(accepted.length, 8);
  assert.deepEqual(accepted.map(event => event.spawnIndex), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(accepted.every(event => event.sourceEventId === offers[0].sourceEventId && !event.filler));
  assert.ok(events.every(event => event.simTimeMs === event.tick * 1000 / 60));
  assert.ok(events.every(Object.isFrozen));
  assert.deepEqual(runtime.takeEvents(), []);
  runtime.close();
});

test('pixel encoder uses framebuffer luminance with deterministic shape and no hidden state', () => {
  const rgba = new Uint8Array(390 * 844 * 4);
  for (let index = 0; index < rgba.length; index += 4) { rgba[index] = 255; rgba[index + 3] = 255; }
  const red = rgbaToGray(rgba, 390, 844);
  assert.equal(red.length, 96 * 208);
  assert.ok(red.every(value => value === 77));
  assert.deepEqual(rgbaToGray(rgba, 390, 844), red);
  assert.throws(() => rgbaToGray(new Uint8Array(7), 390, 844), /RGBA/);
});
