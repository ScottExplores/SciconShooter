const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'services', 'weeklyRunAdmissionRecovery.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
}).outputFiles[0].text;
const holder = { exports: {} };
new Function('module', 'exports', bundle)(holder, holder.exports);
const recovery = holder.exports;

const values = new Map();
global.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  }
};

const pristineStreak = () => ({
  schemaVersion: 1,
  revision: 1,
  weeklyId: '2026-08-16',
  resetAtMs: Date.parse('2026-08-23T00:00:00.000Z'),
  startNodeId: 'weekly-run-001',
  currentNodeId: 'weekly-run-001',
  committedRoutes: [],
  visitedNodeIds: ['weekly-run-001'],
  scoredNodeIds: [],
  scoreEvents: [],
  score: { totalPoints: 0, eventCount: 0 },
  finalization: { status: 'active', submissionStatus: 'not-ready' },
  createdAtMs: Date.parse('2026-08-17T12:00:00.000Z'),
  updatedAtMs: Date.parse('2026-08-17T12:00:00.000Z')
});

test('a lost start response preserves one exact pristine admission key across reload', () => {
  values.clear();
  const streak = pristineStreak();
  const sessionKey = recovery.getWeeklyRunAdmissionSessionKey(streak);
  assert.equal(recovery.writePendingWeeklyRunAdmission({
    schemaVersion: 1,
    profileId: 'pilot:one',
    weeklyId: streak.weeklyId,
    sessionKey,
    createdAtMs: streak.createdAtMs
  }), true);

  const reloadedMarker = recovery.readPendingWeeklyRunAdmission();
  assert.equal(recovery.canRetryPendingWeeklyRunAdmission({
    marker: reloadedMarker,
    streak,
    profileId: 'pilot:one',
    weeklyId: streak.weeklyId
  }), true);
  assert.equal(recovery.getWeeklyRunAdmissionSessionKey(streak), sessionKey);
});

test('played, scored, finalized, or different-profile flights cannot reuse pending admission', () => {
  const streak = pristineStreak();
  const marker = {
    schemaVersion: 1,
    profileId: 'pilot:one',
    weeklyId: streak.weeklyId,
    sessionKey: recovery.getWeeklyRunAdmissionSessionKey(streak),
    createdAtMs: streak.createdAtMs
  };
  const canRetry = (candidate, profileId = 'pilot:one') => (
    recovery.canRetryPendingWeeklyRunAdmission({
      marker,
      streak: candidate,
      profileId,
      weeklyId: streak.weeklyId
    })
  );

  assert.equal(canRetry({ ...streak, revision: 2, scoreEvents: [{}] }), false);
  assert.equal(canRetry({ ...streak, finalization: { status: 'finalized', submissionStatus: 'ready' } }), false);
  assert.equal(canRetry(streak, 'pilot:two'), false);
});

test('a dropped launch link becomes a retryable home message', () => {
  const copy = recovery.weeklyRunLaunchFailureCopy(new TypeError('Failed to fetch'));
  assert.equal(copy, 'The launch link dropped before the run could start. Try again.');
  assert.equal(recovery.weeklyRunLaunchFailureCopy(new Error('Failed to fetch')), copy);
  assert.match(recovery.weeklyRunLaunchFailureCopy(new Error('Load failed')), /Try again/);
  assert.equal(
    recovery.weeklyRunLaunchFailureCopy(new Error('Your Base Account is still loading.')),
    'Your Base Account is still loading.'
  );
  assert.doesNotMatch(copy, /Failed to fetch/);
});

test('only transport and temporary server failures retain the pending admission marker', () => {
  assert.equal(recovery.isRetryableWeeklyRunAdmissionError(new TypeError('network')), true);
  assert.equal(recovery.isRetryableWeeklyRunAdmissionError({ statusCode: 503 }), true);
  assert.equal(recovery.isRetryableWeeklyRunAdmissionError({ statusCode: 429 }), true);
  assert.equal(recovery.isRetryableWeeklyRunAdmissionError({ statusCode: 409 }), false);
  assert.equal(recovery.isRetryableWeeklyRunAdmissionError({ statusCode: 422 }), false);
});

test('server-admitted guest quota is never cached under a remembered wallet', () => {
  const wallet = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  assert.equal(recovery.getWeeklyRunSessionQuotaOwner({
    kind: 'guest',
    profileIdHash: 'guest-hash'
  }), null);
  assert.equal(recovery.getWeeklyRunSessionQuotaOwner({
    kind: 'wallet',
    walletAddress: wallet
  }), wallet.toLowerCase());
  assert.equal(recovery.getWeeklyRunSessionQuotaOwner({
    kind: 'wallet',
    walletAddress: 'invalid'
  }), null);
});
