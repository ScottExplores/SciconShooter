import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'scicon-feel-integration-'));
after(() => rm(temp, { recursive: true, force: true }));
await build({
  stdin: {
    contents: `export { GameEngine } from './services/gameLogic';
      export { FeelRuntime } from './services/revamp/feel/FeelRuntime';
      export * from './services/revamp/feel/FeelGameplay';
      export { setFeelSetting } from './services/revamp/feel/FeelSettings';
      export { EntityType } from './types';`,
    resolveDir: root, loader: 'ts'
  },
  outfile: join(temp, 'integration.mjs'), bundle: true, platform: 'node', format: 'esm',
  define: { 'import.meta.env': '{}' }, logLevel: 'silent'
});
const { GameEngine, FeelRuntime, EntityType, recordFeelKill, cancelPhaseBullets, recordPerfectWave, kickCredit, markAimedShot, isAimedShot, setFeelSetting } = await import(pathToFileURL(join(temp, 'integration.mjs')).href);

const position = { frame: 10, x: 80, y: 100 };
const entity = (type, extra = {}) => ({ type, x: 50, y: 100, width: 20, height: 30, markedForDeletion: false, ...extra });
const engineStub = () => ({
  feel: new FeelRuntime(), frameCount: 100, width: 400, height: 700,
  entities: [], stats: { score: 321, totalCoins: 12 }, hitStopFrames: 0,
  tacticalWaveDamageTaken: 0, sounds: [],
  addHitStop: GameEngine.prototype.addHitStop,
  playSound(sound) { this.sounds.push(sound); }
});

test('kill classification requests precise stop tiers without changing score or currency', () => {
  const engine = engineStub();
  for (const [type, tier] of [
    [EntityType.ENEMY_DRONE, 'small'], [EntityType.ENEMY_BRICK, 'elite'],
    [EntityType.MINI_BOSS, 'elite'], [EntityType.BOSS, 'boss']
  ]) {
    engine.hitStopFrames = 0;
    recordFeelKill(engine, entity(type), 50);
    assert.equal(engine.feel.events.at(-1).tier, tier);
    assert.equal(engine.feel.events.at(-1).x, 60);
    assert.equal(engine.feel.events.at(-1).y, 115);
    assert.equal(engine.hitStopFrames, tier === 'elite' ? 3 : 0);
  }
  recordFeelKill(engine, entity(EntityType.ENEMY_DRONE, { isElite: true }), 12);
  assert.equal(engine.feel.events.at(-1).tier, 'elite');
  assert.deepEqual(engine.stats, { score: 321, totalCoins: 12 });
  assert.equal(engine.feel.slowMotionRemaining, 24);
});

test('phase cancel removes all hostile rounds while keeping player shots, brood and entities; visuals cap at 32', () => {
  const engine = engineStub();
  const hostile = Array.from({ length: 80 }, () => entity(EntityType.PROJECTILE));
  const player = entity(EntityType.PROJECTILE, { isPlayerShot: true });
  const brood = entity(EntityType.PROJECTILE, { prismMothArtifactState: { kind: 'brood' } });
  const enemy = entity(EntityType.ENEMY_DRONE);
  const coin = entity(EntityType.COIN);
  const retired = entity(EntityType.PROJECTILE, { markedForDeletion: true });
  engine.entities = [...hostile, player, brood, enemy, coin, retired];
  cancelPhaseBullets(engine, entity(EntityType.BOSS));
  assert.ok(hostile.every(shot => shot.markedForDeletion));
  assert.ok([player, brood, enemy, coin].every(value => !value.markedForDeletion));
  assert.equal(engine.feel.events.filter(event => event.type === 'bullet-cancel').length, 32);
  assert.equal(engine.feel.events.at(-1).cancelledBullets, 80);
  assert.deepEqual(engine.sounds, ['phase_change']);
  assert.deepEqual(engine.stats, { score: 321, totalCoins: 12 });
});

test('phase simulation is independent of mobile profile and effect quality', () => {
  const run = (mobileProfile, performanceMode) => {
    const engine = engineStub();
    engine.mobileProfile = mobileProfile;
    engine.performanceMode = performanceMode;
    engine.entities = Array.from({ length: 70 }, (_, index) => entity(EntityType.PROJECTILE, { x: index }));
    cancelPhaseBullets(engine, entity(EntityType.BOSS));
    return { entities: engine.entities, receipts: engine.feel.events };
  };
  assert.deepEqual(run(true, true), run(false, false));
});

test('perfect-wave hook reads accepted tactical damage before the next wave', () => {
  const engine = engineStub();
  engine.tacticalWaveDamageTaken = 1;
  recordPerfectWave(engine);
  assert.equal(engine.feel.events.length, 0);
  engine.tacticalWaveDamageTaken = 0;
  recordPerfectWave(engine);
  engine.feel.beginWave();
  assert.equal(engine.feel.events.at(-1).type, 'perfect-wave');
});

test('credit kick preserves rewards and is deterministic without consuming RNG', () => {
  const left = entity(EntityType.COIN, { variant: 77, coinValue: 12 });
  const right = { ...left };
  const random = Math.random;
  try {
    Math.random = () => { throw new Error('presentation consumed RNG'); };
    kickCredit(left);
    kickCredit(right);
  } finally { Math.random = random; }
  assert.deepEqual(left, right);
  assert.equal(left.coinValue, 12);
  assert.equal(left.coinBurstFrames, 18);
  assert.ok(left.vy < 0 && left.coinGravity > 0);
});

test('aimed-shot tag is presentation metadata and cannot modify projectile geometry', () => {
  const shot = entity(EntityType.PROJECTILE);
  const before = { ...shot };
  assert.equal(isAimedShot(shot), false);
  markAimedShot(shot);
  assert.equal(isAimedShot(shot), true);
  assert.equal(isAimedShot({ ...shot }), false);
  assert.deepEqual(shot, before);
});

test('actual engine update freezes simulation and queued shots before the first gameplay operation', () => {
  const engine = engineStub();
  Object.assign(engine, {
    gameActive: true, hitStopFrames: 3, pendingPlayerShots: [{ fireFrame: 100 }],
    stats: { score: 321, shipAbilityCooldown: 9 },
    updates: 0,
    updateJuiceSystems() { this.updates++; },
    updatePreviewEncounterCameraRestore() { throw new Error('simulation advanced during hit-stop'); },
    flushPendingPlayerShots() { throw new Error('shots flushed during hit-stop'); },
    clearQueuedPrimaryBursts() { throw new Error('input queue cleared during hit-stop'); }
  });
  for (let frame = 0; frame < 3; frame++) {
    // Pointer handlers can continue to write the target while simulation waits.
    engine.playerTarget = { x: frame, y: frame };
    GameEngine.prototype.update.call(engine, false);
  }
  assert.equal(engine.frameCount, 100);
  assert.equal(engine.stats.shipAbilityCooldown, 9);
  assert.deepEqual(engine.pendingPlayerShots, [{ fireFrame: 100 }]);
  assert.equal(engine.feel.presentationFrame, 3);
  assert.equal(engine.hitStopFrames, 0);
  assert.equal(engine.updates, 3);
  assert.deepEqual(engine.playerTarget, { x: 2, y: 2 });
});

test('actual engine update also returns before simulation on the first boss slow-motion tick', () => {
  const engine = engineStub();
  engine.feel.recordKill({ ...position, tier: 'boss', score: 0 });
  Object.assign(engine, {
    gameActive: true,
    updateJuiceSystems() {},
    updatePreviewEncounterCameraRestore() { throw new Error('simulation advanced on slow-motion skip'); }
  });
  GameEngine.prototype.update.call(engine, false);
  assert.equal(engine.frameCount, 100);
  assert.equal(engine.feel.slowMotionRemaining, 23);
});

test('scripted mini-boss death emits one elite receipt, including repeated lethal contacts', () => {
  const engine = engineStub();
  const boss = entity(EntityType.MINI_BOSS, {
    sourceEventId: 'test-event', miniBossLabMemberId: 'test-member', miniBossLabDeathStartedFrame: -1,
    hp: 0, color: '#67e8f9'
  });
  const state = { destroyedMemberIds: new Set(), hitUntilFrameByMemberId: new Map(), pendingProjectiles: [] };
  Object.assign(engine, {
    miniBossLabEncounters: new Map([['test-event', state]]),
    getMiniBossLabDefinition: () => ({ choreography: { kind: 'convoy-command' } }),
    spawnBurst() {}, spawnRingEffect() {}, addShake() {}
  });
  assert.equal(GameEngine.prototype.beginMiniBossLabMemberDeath.call(engine, boss), true);
  assert.equal(GameEngine.prototype.beginMiniBossLabMemberDeath.call(engine, boss), false);
  assert.equal(engine.feel.events.length, 1);
  assert.equal(engine.feel.events[0].type, 'kill');
  assert.equal(engine.feel.events[0].tier, 'elite');
  assert.equal(engine.hitStopFrames, 3);
});

test('optional score numbers retain important pickup messages such as extra life', () => {
  const engine = engineStub();
  Object.assign(engine, { liveEffectCount: 0, getEffectCap: () => 10 });
  setFeelSetting('showScoreNumbers', false);
  try {
    for (const copy of ['+250', '+1 x3', '+1 LIFE!', 'SHIELD!']) {
      GameEngine.prototype.spawnFloatingText.call(engine, 10, 10, copy, '#ffffff');
    }
    assert.deepEqual(engine.entities.map(effect => effect.text), ['+1 LIFE!', 'SHIELD!']);
  } finally { setFeelSetting('showScoreNumbers', true); }
});
