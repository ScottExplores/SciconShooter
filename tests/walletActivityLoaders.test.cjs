const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const wallet = '0x1111111111111111111111111111111111111111';

const loadModule = (entry) => {
  const bundle = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  }).outputFiles[0].text;
  const holder = { exports: {} };
  new Function('module', 'exports', bundle)(holder, holder.exports);
  return holder.exports;
};

const records = loadModule('recordService.ts');
const runs = loadModule('playerRunService.ts');

const malformedOkResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({})
});

test('strict wallet activity loaders reject malformed successful payloads', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => malformedOkResponse();
  try {
    await assert.rejects(
      records.getWalletRecordsStrict(wallet),
      /invalid response/
    );
    await assert.rejects(
      runs.getWalletRunsStrict(wallet),
      /invalid response/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('strict wallet activity loaders reject malformed rows inside valid envelopes', async () => {
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ records: [{}] })
    });
    await assert.rejects(
      records.getWalletRecordsStrict(wallet),
      /invalid response/
    );

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ runs: [{}] })
    });
    await assert.rejects(
      runs.getWalletRunsStrict(wallet),
      /invalid response/
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('wallet run history preserves an exact wallet-bound receipt identity', async () => {
  const previousFetch = global.fetch;
  const receipt = {
    runId: '11111111-2222-4333-8444-555555555555',
    runMode: 'standard',
    gameVersion: 'test',
    startedAt: '2026-08-22T12:00:00.000Z',
    finishedAt: '2026-08-22T12:01:00.000Z',
    expiresAt: '2026-09-09T12:01:00.000Z',
    metrics: {
      score: 1234,
      wave: 2,
      durationMs: 60_000,
      enemiesDefeated: 10,
      coinsCollected: 2,
      playerShipId: 'researchhub'
    },
    identity: {
      kind: 'wallet',
      walletAddress: wallet,
      profileIdHash: 'a'.repeat(64)
    },
    integrity: 'server-verified',
    anomalies: [],
    receiptToken: 'signed-reissued-receipt',
    persisted: true
  };
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ runs: [{ pilotName: 'SCOTT', receipt }] })
  });
  try {
    const loaded = await runs.getWalletRunsStrict(wallet);
    assert.equal(loaded.length, 1);
    assert.deepEqual(loaded[0].receipt.identity, receipt.identity);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        runs: [{
          pilotName: 'SCOTT',
          receipt: {
            ...receipt,
            identity: { ...receipt.identity, walletAddress: '0x2222222222222222222222222222222222222222' }
          }
        }]
      })
    });
    await assert.rejects(runs.getWalletRunsStrict(wallet), /invalid response/);

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        runs: [{
          pilotName: 'SCOTT',
          receipt: { ...receipt, identity: { ...receipt.identity, profileIdHash: 'not-a-hash' } }
        }]
      })
    });
    await assert.rejects(runs.getWalletRunsStrict(wallet), /invalid response/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('legacy wallet activity loaders still degrade malformed responses to empty lists', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => malformedOkResponse();
  try {
    assert.deepEqual(await records.getWalletRecords(wallet), []);
    assert.deepEqual(await runs.getWalletRuns(wallet), []);
  } finally {
    global.fetch = previousFetch;
  }
});

test('wallet activity loaders abort never-settling requests at a deadline', async () => {
  const previousFetch = global.fetch;
  let observedAbort = false;
  global.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      observedAbort = true;
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
  try {
    await assert.rejects(
      records.getWalletRecordsStrict(wallet, { timeoutMs: 5 }),
      (error) => error?.name === 'RequestDeadlineError'
    );
    assert.equal(observedAbort, true);
  } finally {
    global.fetch = previousFetch;
  }
});

test('wallet activity loaders relay caller cancellation without reporting a timeout', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('caller aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
  const controller = new AbortController();
  try {
    const request = runs.getWalletRunsStrict(wallet, {
      signal: controller.signal,
      timeoutMs: 1_000
    });
    controller.abort();
    await assert.rejects(request, (error) => error?.name === 'AbortError');
  } finally {
    global.fetch = previousFetch;
  }
});
