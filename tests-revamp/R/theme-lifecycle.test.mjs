import test from 'node:test';
import assert from 'node:assert/strict';
import { lifecycleOptions, motionFailures } from '../../tools-revamp/qa/theme-lifecycle.mjs';

test('lifecycle diagnostics reject malformed input and keep output separate from theme gallery', () => {
  assert.match(lifecycleOptions([]).output, /R-themes\/lifecycle-/);
  assert.equal(lifecycleOptions(['--no-result']).result, false);
  assert.equal(lifecycleOptions(['--output', '/tmp/R-lifecycle']).output, '/tmp/R-lifecycle');
  for (const args of [['--seed', 'NaN'], ['--mission', '../invalid'], ['--dist'], ['--unknown']]) assert.throws(() => lifecycleOptions(args));
});

test('live settings alone cannot pass if optional sprite effects or displacement remain active', () => {
  const sample = { prefersReducedMotion: false, sprites: { quality: 'low', reducedMotion: false, optionalVisible: { glow: 0, outline: 0, shimmer: 0 } }, background: { reducedMotion: false }, shockwave: { active: false } };
  assert.deepEqual(motionFailures(sample, 'low', false), []);
  for (const field of ['glow', 'outline', 'shimmer']) {
    assert.ok(motionFailures({ ...sample, sprites: { ...sample.sprites, optionalVisible: { ...sample.sprites.optionalVisible, [field]: 1 } } }, 'low', false).some(message => message.includes(field)));
  }
  assert.ok(motionFailures({ ...sample, shockwave: { active: true } }, 'low', false).some(message => message.includes('shockwave')));
  assert.ok(motionFailures({ ...sample, sprites: { quality: 'low', reducedMotion: false } }, 'low', false).some(message => message.includes('telemetry missing')));
});

test('reduced motion keeps static glow but disallows shimmer and stale preference snapshots', () => {
  const sample = { prefersReducedMotion: true, sprites: { quality: 'high', reducedMotion: true, optionalVisible: { glow: 2, outline: 3, shimmer: 0 } }, background: { reducedMotion: true }, shockwave: { active: false } };
  assert.deepEqual(motionFailures(sample, 'high', true), []);
  assert.ok(motionFailures({ ...sample, sprites: { ...sample.sprites, reducedMotion: false } }, 'high', true).some(message => message.includes('preference mismatch')));
  assert.ok(motionFailures({ ...sample, sprites: { ...sample.sprites, optionalVisible: { ...sample.sprites.optionalVisible, shimmer: 1 } } }, 'high', true).some(message => message.includes('shimmer')));
});
