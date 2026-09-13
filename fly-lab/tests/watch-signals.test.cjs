const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');
const compiled = esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/watchSignals.ts')], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
const box = { exports: {} };
Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, box, box.exports);
const { validateInputTrace, recentReward, signalIllustration } = box.exports;
const frames = [
  { seq: 0, tick: 0, simTimeMs: 0, reward: 0, score: 0 },
  { seq: 1, tick: 3, simTimeMs: 50, reward: 0, score: 1 },
  { seq: 2, tick: 6, simTimeMs: 100, reward: -4, score: 11 },
  { seq: 3, tick: 57, simTimeMs: 950, reward: 0, score: 11 },
];
test('signal sidecar must align with exact recorded frame sequence and remain bounded', () => {
  const trace = { version: 1, source: 'recorded-grayscale', gain: 8, frames: frames.map(row => ({ seq: row.seq, tick: row.tick, inputChange: .2 })) };
  assert.equal(validateInputTrace(trace, frames), trace);
  for (const changed of [{ ...trace, gain: 100 }, { ...trace, frames: trace.frames.slice(1) }, { ...trace, frames: trace.frames.map((row, i) => i === 1 ? { ...row, tick: 4 } : row) }, { ...trace, frames: trace.frames.map(row => ({ ...row, inputChange: NaN })) }]) assert.throws(() => validateInputTrace(changed, frames));
});
test('score changes do not invent reward, signed outcomes expire and seeking is repeatable', () => {
  assert.deepEqual(recentReward(frames, 1), { amount: 0, strength: 0 });
  assert.deepEqual(recentReward(frames, 2), { amount: -4, strength: 1 });
  assert.deepEqual(recentReward(frames, 3), { amount: 0, strength: 0 });
  assert.deepEqual(recentReward(frames, 2), { amount: -4, strength: 1 });
});
test('invalid or missing cues cannot invent visual input, movement or neural firing', () => {
  const frame = { simTimeMs: 12500, movement: 'idle', fire: false };
  assert.deepEqual(signalIllustration(frame, null, 0, true), { timeSeconds: 12.5, inputChange: 0, movement: 0, fire: 0, reward: 0, valid: true });
  assert.equal(signalIllustration({ ...frame, movement: 'N', fire: true }, .9, 1, false).valid, false);
  assert.equal(signalIllustration({ ...frame, movement: 'N', fire: true }, .9, 1, false).movement, 0);
});
