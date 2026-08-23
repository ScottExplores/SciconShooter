const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadService = () => {
  const bundle = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'runReceiptService.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  }).outputFiles[0].text;
  const holder = { exports: {} };
  new Function('module', 'exports', bundle)(holder, holder.exports);
  return holder.exports;
};

test('a lost standard finish response retries the identical request and keeps the canonical receipt', async () => {
  const service = loadService();
  const previousFetch = global.fetch;
  const requests = [];
  const metrics = {
    score: 1_234,
    wave: 2,
    durationMs: 30_000,
    enemiesDefeated: 12,
    coinsCollected: 8,
    playerShipId: 'researchhub'
  };
  const session = {
    runId: '11111111-2222-4333-8444-555555555555',
    issuedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2026-08-22T15:00:00.000Z',
    startToken: 'signed-start-token',
    playerShipId: 'researchhub',
    runMode: 'standard'
  };
  const canonicalReceipt = {
    runId: session.runId,
    gameVersion: service.GAME_VERSION,
    runMode: 'standard',
    startedAt: session.issuedAt,
    finishedAt: '2026-08-22T12:00:30.000Z',
    expiresAt: '2026-09-24T12:00:30.000Z',
    metrics,
    identity: { kind: 'guest', profileIdHash: 'a'.repeat(64), guestSessionBound: true },
    integrity: 'server-verified',
    anomalies: [],
    receiptToken: 'canonical-signed-receipt',
    persisted: true
  };

  global.fetch = async (_url, init) => {
    requests.push(String(init.body));
    if (requests.length === 1) {
      // The server committed, but the browser never received its response.
      throw new TypeError('network response was lost');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ receipt: canonicalReceipt })
    };
  };

  try {
    const receipt = await service.finishRunSession(session, metrics);
    assert.equal(requests.length, 2);
    assert.equal(requests[1], requests[0]);
    assert.deepEqual(receipt, canonicalReceipt);
    assert.equal(receipt.integrity, 'server-verified');
    assert.equal(receipt.persisted, true);
  } finally {
    global.fetch = previousFetch;
  }
});
