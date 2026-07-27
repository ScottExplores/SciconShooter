const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'test-only-secret-with-enough-entropy';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

const {
  createRunStart,
  finishRun,
  signPayload,
  verifyRunReceipt
} = require('../api/_lib/runReceipts');

const requestStub = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };

const startToken = (overrides = {}) => {
  const now = Date.now();
  return signPayload({
    type: 'run-start',
    runId: crypto.randomUUID(),
    gameVersion: 'test',
    issuedAt: now - 30_000,
    expiresAt: now + 60_000,
    ...overrides
  });
};

test('creates a server-verified receipt for plausible metrics', async () => {
  const receipt = await finishRun(startToken(), {
    score: 5000,
    wave: 2,
    durationMs: 30_000,
    enemiesDefeated: 10,
    coinsCollected: 5,
    playerShipId: 'bio'
  }, requestStub);
  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(receipt.persisted, false);
  assert.equal(verifyRunReceipt(receipt.receiptToken).metrics.score, 5000);
  assert.equal(receipt.metrics.playerShipId, 'researchhub');
});

test('binds the selected ship from the signed run start to the finished receipt', async () => {
  const start = createRunStart('test', { playerShipId: 'eth' });
  const receipt = await finishRun(start.startToken, {
    score: 1200,
    wave: 1,
    durationMs: 1_500,
    enemiesDefeated: 3,
    coinsCollected: 2,
    playerShipId: 'bio'
  }, requestStub);

  assert.equal(start.playerShipId, 'eth');
  assert.equal(receipt.metrics.playerShipId, 'eth');
  assert.equal(verifyRunReceipt(receipt.receiptToken).metrics.playerShipId, 'eth');

  const btcStart = createRunStart('test', { playerShipId: 'btc' });
  assert.equal(btcStart.playerShipId, 'btc');
});

test('rejects a tampered receipt signature', async () => {
  const receipt = await finishRun(startToken(), {
    score: 100,
    wave: 1,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub);
  const tampered = `${receipt.receiptToken.slice(0, -1)}${receipt.receiptToken.endsWith('a') ? 'b' : 'a'}`;
  assert.throws(() => verifyRunReceipt(tampered), /signature is invalid/i);
});

test('rejects impossible run metrics', async () => {
  await assert.rejects(() => finishRun(startToken(), {
    score: 99_999_999,
    wave: 999,
    durationMs: 30_000,
    enemiesDefeated: 1,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);
});

test('accepts any authored Mission without trusting a client-selected starting Mission', async () => {
  const start = createRunStart('test', { startingWave: 999 });
  assert.equal(start.startingWave, undefined);
  assert.equal(JSON.parse(Buffer.from(start.startToken.split('.')[0], 'base64url').toString('utf8')).startingWave, undefined);

  const receipt = await finishRun(startToken(), {
    score: 500,
    wave: 20,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub);

  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(receipt.anomalies.includes('mission_number_impossible'), false);

  const lateMissionBossReceipt = await finishRun(startToken(), {
    score: 35_000,
    wave: 20,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub);
  assert.equal(lateMissionBossReceipt.integrity, 'server-verified');

  await assert.rejects(() => finishRun(startToken(), {
    score: 500,
    wave: 21,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);

  await assert.rejects(() => finishRun(startToken(), {
    score: 2_900_000,
    wave: 1,
    durationMs: 30_000,
    enemiesDefeated: 100,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);

  await assert.rejects(() => finishRun(startToken(), {
    score: 99_999_999,
    wave: 20,
    durationMs: 30_000,
    enemiesDefeated: 1,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);
});

test('marks owner test receipts and permits wave-jump metrics without ranking integrity failures', async () => {
  const start = createRunStart('test', { testRun: true });
  assert.equal(start.testRun, true);

  const receipt = await finishRun(start.startToken, {
    score: 123,
    wave: 4,
    durationMs: 500,
    enemiesDefeated: 0,
    coinsCollected: 0
  }, requestStub);

  assert.equal(receipt.testRun, true);
  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(verifyRunReceipt(receipt.receiptToken).testRun, true);
});
