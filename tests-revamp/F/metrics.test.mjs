import test from 'node:test';
import assert from 'node:assert/strict';
import { options, summarize } from '../../tools-revamp/qa/playthrough.mjs';

const sample = (seconds, lives, fps, extra = {}) => ({
  seconds, fps, browserFps: 60, counts: { enemies: 2, enemyBullets: 4 },
  state: { lives, gameActive: true, worldWidth: 390, worldHeight: 844, bossHp: 100 },
  ...extra,
});

test('reports distinguish damage from defeat and exclude death animation FPS', () => {
  const result = summarize({ actualSeconds: 5, samples: [sample(0, 3, 32), sample(1, 1, 34), sample(2, 0, 100), sample(3, 0, 100)] });
  assert.equal(result.fpsMedian, 32);
  assert.equal(result.fpsSource, 'game-render-loop');
  assert.equal(result.livesLost, 3);
  assert.equal(result.deaths, 1);
  assert.equal(result.firstGameOverSeconds, 2);
  assert.equal(result.activeSamples, 2);
  assert.equal(result.maxEnemyBullets, 4);
  assert.deepEqual(result.worldSizes, ['390x844']);
});

test('coverage includes stalls before first sample and after last sample', () => {
  assert.equal(summarize({ actualSeconds: 60, samples: [sample(1, 3, 50), sample(5, 3, 50)] }).maxSampleGapSeconds, 55);
  const stalled = summarize({ actualSeconds: 50, samples: [sample(40, 3, 50, { sampleDurationSeconds: 39 })] });
  assert.equal(stalled.maxSampleGapSeconds, 40);
  assert.equal(stalled.maxSampleDurationSeconds, 39);
  assert.equal(summarize({ actualSeconds: 60, samples: [] }).maxSampleGapSeconds, 60);
  assert.equal(summarize({ samples: [], screenshots: [{ capturedAt: '2026-10-17T00:00:00Z' }, { capturedAt: '2026-10-17T00:00:30Z' }] }).maxScreenshotGapSeconds, 30);
});

test('baseline browser rAF remains explicitly labeled and lacks invented entity/death metrics', () => {
  const result = summarize({ actualSeconds: 2, samples: [{ seconds: 0, state: null, counts: null, fps: null, browserFps: 60 }] });
  assert.match(result.fpsSource, /browser-rAF/);
  assert.equal(result.maxEnemyBullets, null);
  assert.equal(result.deaths, null);
});

test('targeted scenarios are explicit and defaults retain both devices and all stages', () => {
  assert.deepEqual(options([]).devices, ['mobile', 'desktop']);
  assert.equal(options([]).stages, undefined);
  assert.deepEqual(options(['--stages', 'boss', '--god']).stages, ['boss']);
  assert.throws(() => options(['--stages', 'missing']), /Unknown/);
  assert.throws(() => options(['--baseline', '--stages', 'boss']), /Baseline/);
});
