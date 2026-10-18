import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Bundle only these small pure modules; the GameEngine import is type-only.
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/qa/config';
      export * from './services/revamp/qa/autoplayBot';
      export * from './services/revamp/qa/runtime';
      export { createSeededGameplayRandom } from './services/gameplay/random';`,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20'
});
const qa = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const entity = (overrides = {}) => ({
  type: 'PROJECTILE', x: 200, y: 500, width: 10, height: 10,
  vx: 0, vy: 5, hp: 1, markedForDeletion: false, isPlayerShot: false,
  ...overrides
});
const world = (overrides = {}) => ({
  width: 480, height: 800, frameCount: 0,
  player: { x: 220, y: 612, width: 40, height: 40 },
  entities: [], getPlayerMovementSpeed: () => 3,
  ...overrides
});
const engine = (overrides = {}) => ({
  ...world(), stats: { score: 75 }, lives: 3, wave: 2,
  gameActive: true, invincibleTimer: 0, bossRef: null, miniBossRef: null,
  handleInput(keys, touch) { this.lastInput = { keys, touch }; },
  getRuntimeState() { return { levelId: 'mission-2', waveId: 'wave-2a', damageTaken: 1, complete: false }; },
  ...overrides
});

test('QA flags are inert unless explicitly opted in; parsing is bounded and numeric', () => {
  assert.deepEqual(qa.readQAConfig('?seed=3&autoplay=1&god=1&mission=level-1&skipIntro=1&bosslab=gatekeeper'), {
    enabled: false, seed: 1701, autoplay: false, mission: null, bosslab: null, skipIntro: false, god: false
  });
  assert.equal(qa.readQAConfig('?qa=true&god=1').god, false);
  assert.deepEqual(qa.readQAConfig('?qa=1&seed=-1&autoplay=1&god=1&mission=level-1&skipIntro=1&bosslab=gatekeeper'), {
    enabled: true, seed: 4294967295, autoplay: true, mission: 'level-1', bosslab: 'gatekeeper', skipIntro: true, god: true
  });
  for (const seed of ['NaN', 'Infinity', '', 'hello']) assert.equal(qa.readQAConfig(`?qa=1&seed=${seed}`).seed, 1701);
  assert.equal(qa.readQAConfig('?qa=1&seed=0').seed, 0);
  assert.equal(qa.readQAConfig('?qa=1&mission=../../secret').mission, null);
  assert.equal(qa.readQAConfig(`?qa=1&mission=${'x'.repeat(121)}`).mission, null);
});

test('seed uses the existing gameplay RNG without replacing global randomness', () => {
  const originalRandom = Math.random;
  const first = qa.createSeededGameplayRandom(qa.readQAConfig('?qa=1&seed=42').seed);
  const second = qa.createSeededGameplayRandom(42);
  assert.deepEqual(Array.from({ length: 20 }, () => first.next()), Array.from({ length: 20 }, () => second.next()));
  assert.equal(Math.random, originalRandom);
});

test('autoplay repeats the same simulation input path and always fires', () => {
  const replay = () => {
    const scene = world({ entities: [entity({ type: 'ENEMY_DRONE', x: 330, y: 120 })] });
    const inputs = [];
    for (let frame = 0; frame < 720; frame++) {
      scene.frameCount = frame;
      const input = qa.getAutoplayInput(scene, 42);
      assert.equal(input[' '], true);
      assert.ok(!(input.ArrowLeft && input.ArrowRight));
      assert.ok(!(input.ArrowUp && input.ArrowDown));
      const dx = Number(input.ArrowRight) - Number(input.ArrowLeft);
      const dy = Number(input.ArrowDown) - Number(input.ArrowUp);
      const length = Math.hypot(dx, dy) || 1;
      scene.player.x += dx / length * 3;
      scene.player.y += dy / length * 3;
      assert.ok(scene.player.x >= 0 && scene.player.x + scene.player.width <= scene.width);
      assert.ok(scene.player.y >= 0 && scene.player.y + scene.player.height <= scene.height);
      inputs.push(input);
    }
    return inputs;
  };
  assert.deepEqual(replay(), replay());
});

test('autoplay dodges a projectile approaching the ship and ignores friendly shots', () => {
  const scene = world({ entities: [entity({ x: 235, y: 560, vy: 6 })] });
  const input = qa.getAutoplayInput(scene, 42);
  assert.ok(input.ArrowLeft || input.ArrowRight, 'incoming bullet requires lateral dodge');
  assert.deepEqual(
    qa.getAutoplayInput(world({ entities: [entity({ isPlayerShot: true })] }), 42),
    qa.getAutoplayInput(world(), 42)
  );
  assert.deepEqual(
    qa.getAutoplayInput(world({ entities: [entity({ markedForDeletion: true })] }), 42),
    qa.getAutoplayInput(world(), 42)
  );
});

test('bridge counts only visible live enemies/hostile projectiles and returns detached snapshots', () => {
  const host = new EventTarget();
  const active = engine({
    entities: [
      entity({ type: 'ENEMY_DRONE' }), entity({ type: 'BOSS' }), entity(),
      entity({ x: -20 }), entity({ y: 900 }), entity({ isPlayerShot: true }),
      entity({ isTelegraph: true }), entity({ markedForDeletion: true }),
      entity({ type: 'SUPPLY_DROP' }), entity({ type: 'ENEMY_DRONE', hp: 0 })
    ],
    bossRef: entity({ type: 'BOSS', hp: 120, activeBossPhaseId: 'phase-2' })
  });
  assert.equal(qa.attachQARuntime(qa.readQAConfig(''), () => active, host), null);
  assert.equal(host.__sciconQA, undefined);
  const controller = qa.attachQARuntime(qa.readQAConfig('?qa=1&seed=42'), () => active, host);
  assert.equal(host.__sciconQA.state().ready, false);
  assert.deepEqual(host.__sciconQA.counts(), { enemies: 2, enemyBullets: 1 });
  controller.rendered(1000);
  controller.rendered(1020);
  controller.rendered(1040);
  assert.equal(host.__sciconQA.fps(), 50);
  const state = host.__sciconQA.state();
  assert.equal(state.ready, true);
  assert.equal(state.bossHp, 120);
  assert.equal(state.bossPhase, 'phase-2');
  assert.equal(state.worldWidth, 480);
  assert.equal(state.worldHeight, 800);
  assert.equal(state.seed, 42);
  active.bossRef.gatekeeperPrimePhaseId = 'prime-overdrive';
  assert.equal(host.__sciconQA.state().bossPhase, 'prime-overdrive');
  state.errors.push('local mutation');
  assert.deepEqual(host.__sciconQA.state().errors, []);
  controller.dispose();
  assert.equal(host.__sciconQA, undefined);
});

test('bridge uses normal input and god invulnerability only when their flags are present', () => {
  const host = new EventTarget();
  const active = engine();
  const plain = qa.attachQARuntime(qa.readQAConfig('?qa=1'), () => active, host);
  plain.beforeStep(active);
  assert.equal(active.invincibleTimer, 0);
  assert.equal(active.lastInput, undefined);
  const automated = qa.attachQARuntime(qa.readQAConfig('?qa=1&autoplay=1&god=1'), () => active, host);
  plain.dispose();
  assert.ok(host.__sciconQA, 'older cleanup must not remove the current bridge');
  automated.beforeStep(active);
  assert.ok(active.invincibleTimer >= 3600);
  assert.equal(active.lastInput.touch, null);
  assert.equal(active.lastInput.keys[' '], true);
  assert.equal(host.__sciconQA.state().simulationSteps, 1);
  automated.dispose();
});

test('bridge records bounded runtime errors and removes listeners on disposal', () => {
  const host = new EventTarget();
  const controller = qa.attachQARuntime(qa.readQAConfig('?qa=1'), () => null, host);
  const bridge = host.__sciconQA;
  for (let index = 0; index < 40; index++) {
    const event = new Event('error');
    event.message = `failure-${index}`;
    host.dispatchEvent(event);
  }
  const rejection = new Event('unhandledrejection');
  rejection.reason = new Error('rejected promise');
  host.dispatchEvent(rejection);
  assert.equal(bridge.state().errors.length, 30);
  assert.equal(bridge.state().errors.at(-1), 'rejected promise');
  assert.equal(bridge.state().ready, false);
  controller.dispose();
  host.dispatchEvent(rejection);
  assert.equal(bridge.state().errors.length, 30);
});
