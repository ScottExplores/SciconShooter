import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'scicon-S-mini-death-'));
after(() => rm(directory, { recursive: true, force: true }));
await build({ stdin: { contents: `
  export { GameEngine } from './services/gameLogic';
  export { FeelRuntime } from './services/revamp/feel/FeelRuntime';
  export * from './services/revamp/vfx/BossDeathSequence';
  export { EntityType } from './types';
`, loader: 'ts', resolveDir: process.cwd() },
  outfile: join(directory, 'engine.mjs'), bundle: true, format: 'esm', platform: 'node',
  define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
globalThis.Image ??= class { set src(_value) {} };
const { GameEngine, FeelRuntime, EntityType, playBossDeathSequence, consumeBossDeathSequences,
  hasBossDeathSequence } = await import(pathToFileURL(join(directory, 'engine.mjs')));

const definition = { choreography: { kind: 'convoy-command' }, assets: [{ usage: 'death-vfx', frames: [
  '/game-art/pixi/effects/explosion/frame-1.png', '/game-art/pixi/effects/explosion/frame-2.png'
] }] };
const fixture = () => {
  const state = { destroyedMemberIds: new Set(), hitUntilFrameByMemberId: new Map(), pendingProjectiles: [] };
  const engine = { frameCount: 100, feel: new FeelRuntime(), entities: [], liveEffectCount: 0,
    stats: { score: 321, totalCoins: 12 }, hitStopFrames: 0,
    miniBossLabEncounters: new Map([['mini-event', state]]),
    getMiniBossLabDefinition: () => definition, getEffectCap: () => 24,
    addHitStop: GameEngine.prototype.addHitStop, spawnBurst() {}, spawnRingEffect() {}, addShake() {} };
  const hull = { id: 'mini-member', type: EntityType.MINI_BOSS, x: 50, y: 100, width: 100, height: 80,
    sourceEventId: 'mini-event', miniBossLabMemberId: 'member', miniBossLabDeathStartedFrame: -1,
    hp: 0, color: '#67e8f9' };
  return { engine, hull };
};

test('actual mini terminal hook owns the sequence and prevents its delayed legacy fireball', () => {
  const { engine, hull } = fixture();
  assert.equal(GameEngine.prototype.beginMiniBossLabMemberDeath.call(engine, hull), true);
  assert.equal(hasBossDeathSequence(engine, hull), true);
  assert.equal(consumeBossDeathSequences(engine).length, 1);
  engine.frameCount += 42;
  GameEngine.prototype.spawnMiniBossLabDeathSprite.call(engine, definition, hull);
  assert.equal(engine.entities.length, 0);
  assert.equal(engine.liveEffectCount, 0);
  assert.deepEqual(engine.stats, { score: 321, totalCoins: 12 });
  assert.equal(engine.feel.events.filter(event => event.type === 'kill').length, 1);
});

test('legacy mini sprite remains a working fallback without S ownership and after reset', () => {
  const { engine, hull } = fixture();
  GameEngine.prototype.spawnMiniBossLabDeathSprite.call(engine, definition, hull);
  assert.equal(engine.liveEffectCount, 1);
  assert.equal(engine.entities[0].type, EntityType.EFFECT);
  assert.equal(engine.entities[0].effectType, 'sprite');
  assert.equal(engine.entities[0].width, 135);
  assert.deepEqual(engine.entities[0].spriteFrames, definition.assets[0].frames);
  playBossDeathSequence(engine, hull, true); consumeBossDeathSequences(engine);
  GameEngine.prototype.spawnMiniBossLabDeathSprite.call(engine, definition, hull);
  assert.equal(engine.liveEffectCount, 1);
  engine.feel.reset();
  GameEngine.prototype.spawnMiniBossLabDeathSprite.call(engine, definition, hull);
  assert.equal(engine.liveEffectCount, 2);
  assert.deepEqual(engine.stats, { score: 321, totalCoins: 12 });
});
