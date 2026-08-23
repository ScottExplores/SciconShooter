const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'services', 'walletActivityMerge.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
}).outputFiles[0].text;
const holder = { exports: {} };
new Function('module', 'exports', bundle)(holder, holder.exports);
const { advanceMintIndexRetry, getWalletActivityViewState, mergeWalletActivity } = holder.exports;

const run = (runId) => ({ pilotName: 'PILOT', receipt: { runId } });
const record = (runId, status = 'confirmed') => ({ runId, status });

test('confirmed optimistic score remains until the history endpoint observes it', () => {
  const expected = run('new-run');
  const pending = mergeWalletActivity({
    current: { records: [], runs: [expected] },
    records: [],
    runs: [run('older-run')],
    expectedRun: expected
  });
  assert.deepEqual(pending.runs.map((entry) => entry.receipt.runId), ['new-run', 'older-run']);
  assert.equal(pending.expectedRunObserved, false);

  const indexed = mergeWalletActivity({
    current: pending,
    records: [],
    runs: [expected, run('older-run')],
    expectedRun: expected
  });
  assert.equal(indexed.expectedRunObserved, true);
  assert.deepEqual(indexed.runs.map((entry) => entry.receipt.runId), ['new-run', 'older-run']);
});

test('mint indexing cannot blank last-good records and releases once confirmed', () => {
  const current = { records: [record('older-mint')], runs: [] };
  const pending = mergeWalletActivity({
    current,
    records: [],
    runs: [],
    expectedMintRunId: 'new-mint'
  });
  assert.deepEqual(pending.records, current.records);
  assert.equal(pending.expectedMintObserved, false);

  const indexed = mergeWalletActivity({
    current: pending,
    records: [record('new-mint'), record('older-mint')],
    runs: [],
    expectedMintRunId: 'new-mint'
  });
  assert.equal(indexed.expectedMintObserved, true);
  assert.deepEqual(indexed.records.map((entry) => entry.runId), ['new-mint', 'older-mint']);
});

test('mint indexing retry budget releases a stale optimistic snapshot', () => {
  let retries = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const step = advanceMintIndexRetry(retries);
    assert.equal(step.exhausted, false);
    assert.equal(step.retries, attempt);
    assert.equal(step.delayMs, attempt * 750);
    retries = step.retries;
  }

  const exhausted = advanceMintIndexRetry(retries);
  assert.deepEqual(exhausted, {
    exhausted: true,
    retries: 3,
    delayMs: null
  });

  const released = mergeWalletActivity({
    current: { records: [record('older-mint')], runs: [] },
    records: [],
    runs: []
  });
  assert.deepEqual(released.records, []);
});

test('wallet activity distinguishes first-load errors from retained stale data', () => {
  assert.equal(getWalletActivityViewState({
    connected: true,
    loading: false,
    hasError: true,
    runCount: 0
  }), 'initial-error');
  assert.equal(getWalletActivityViewState({
    connected: true,
    loading: false,
    hasError: true,
    runCount: 2
  }), 'stale');
  assert.equal(getWalletActivityViewState({
    connected: true,
    loading: false,
    hasError: false,
    runCount: 0
  }), 'empty');
  assert.equal(getWalletActivityViewState({
    connected: false,
    loading: true,
    hasError: true,
    runCount: 2
  }), 'disconnected');
});
