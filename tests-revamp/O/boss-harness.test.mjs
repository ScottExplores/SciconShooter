import test from 'node:test';
import assert from 'node:assert/strict';
import { options, summarize, observePhaseEvidence, forcedDamageReady, MAJOR_BOSSES, CLIP_BOSSES } from '../../tools-revamp/qa/bosses.mjs';

test('boss harness separates forced lifecycle from normal-damage observations', () => {
  assert.throws(() => options(['--forced']), /requires --modes god/);
  assert.throws(() => options(['--forced', '--modes', 'god', '--baseline']), /cannot be baseline/);
  assert.equal(options(['--forced', '--modes', 'god']).forced, true);
  assert.deepEqual(options([]).modes, ['normal', 'god']);
  assert.equal(new Set(MAJOR_BOSSES).size, 15);
  assert.equal(CLIP_BOSSES.length, 4);
});

test('boss harness never substitutes browser RAF for missing game-render telemetry', () => {
  const result = summarize({ samples: [{ seconds: 1, browserFps: 60, state: { ready: true, gameActive: true, lives: 3, frame: 60, worldWidth: 390, worldHeight: 844 } }], actualSeconds: 2 });
  assert.equal(result.fpsMedian, null);
  assert.equal(result.activeSamples, 0);
  assert.deepEqual(result.worldSizes, ['390x844']);
});

test('boss evidence records observed states, phase progression and death separately from completion', () => {
  const frame = (seconds, phase, hp, state, status = 'active') => ({ seconds, fps: 50, counts: { enemyBullets: 4 }, state: { ready: true, gameActive: true, lives: seconds < 2 ? 3 : 2, frame: seconds * 60, bossHp: 100, worldWidth: 390, worldHeight: 844, interactiveBoss: { phase, status, parts: [{ id: 'port', hp, state }] } } });
  const result = summarize({ samples: [frame(1, 0, 10, 'intact'), frame(2, 0, 4, 'smoking'), frame(3, 1, 0, 'destroyed'), frame(4, 2, 0, 'destroyed', 'dying')], actualSeconds: 5 });
  assert.deepEqual(result.phases, [0, 1, 2]);
  assert.deepEqual(result.destroyedParts, ['port']);
  assert.equal(result.livesLost, 1);
  assert.equal(result.deathSequenceObserved, true);
  assert.equal(result.complete, false);
  assert.equal(result.fpsMedian, 50);
});

test('boss performance excludes fast post-defeat frames', () => {
  const state = { ready: true, gameActive: true, lives: 3, frame: 100, worldWidth: 390, worldHeight: 844 };
  const result = summarize({ samples: [{ seconds: 1, fps: 24, state: { ...state, bossHp: 100 } },
    ...Array.from({ length: 8 }, (_, index) => ({ seconds: index + 2, fps: 60, state: { ...state, bossHp: null, complete: true } }))], actualSeconds: 11 });
  assert.equal(result.fpsMedian, 24);
  assert.equal(result.activeSamples, 1);
});

test('forced major phase holds require completed arena and escort actions, not elapsed wall time', () => {
  const history = {};
  const boss = { scale: 'major', phase: 2, arena: { activeFrames: 0 }, escorts: [] };
  observePhaseEvidence(history, boss, 0);
  assert.equal(forcedDamageReady(boss, history), false);
  observePhaseEvidence(history, { ...boss, arena: { activeFrames: 60 }, escorts: [{ stage: 'deploying' }] }, 10);
  assert.equal(forcedDamageReady(boss, history), false);
  observePhaseEvidence(history, { ...boss, escorts: [{ stage: 'active' }] }, 20);
  assert.equal(history[2].arenaFinishedAt, 20);
  assert.equal(forcedDamageReady(boss, history), false);
  observePhaseEvidence(history, { ...boss, escorts: [{ stage: 'exiting' }] }, 30);
  assert.equal(forcedDamageReady(boss, history), false);
  observePhaseEvidence(history, boss, 40);
  assert.equal(forcedDamageReady(boss, history), true);
  assert.equal(history[2].escortActiveAt, 20);
  assert.equal(history[2].escortsRetiredAt, 40);
  assert.equal(forcedDamageReady({ ...boss, scale: 'mini' }, {}), true);
});

test('core opening is independent of hangar opening and phase3 retains its full sweep', () => {
  const history = {};
  const boss = { scale: 'major', phase: 3, arena: { activeFrames: 60 }, escorts: [], hatchOpen: 1, hatchStage: 'open', coreOpen: 0 };
  observePhaseEvidence(history, boss, 1);
  assert.equal(forcedDamageReady(boss, history), false);
  observePhaseEvidence(history, { ...boss, coreOpen: 1 }, 2);
  assert.equal(forcedDamageReady(boss, history), false);
  observePhaseEvidence(history, { ...boss, arena: { activeFrames: 0 } }, 3);
  assert.equal(forcedDamageReady(boss, history), true);
  assert.equal(forcedDamageReady({ ...boss, phase: 2 }, history), false);
  const result = summarize({ samples: [{ seconds: 1, state: { interactiveBoss: boss } }], actualSeconds: 2 });
  assert.equal(result.hatchObservedOpen, true);
  assert.equal(result.coreObservedOpen, false);
});
