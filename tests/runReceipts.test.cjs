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
    coinsCollected: 5
  }, requestStub);
  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(receipt.persisted, false);
  assert.equal(verifyRunReceipt(receipt.receiptToken).metrics.score, 5000);
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
