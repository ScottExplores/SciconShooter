const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSignature, verifyMessageWithClient } = require('../api/_lib/baseSignatures');

test('normalizes provider signature response shapes', () => {
  assert.equal(normalizeSignature('0x1234'), '0x1234');
  assert.equal(normalizeSignature({ signature: '0xabcd' }), '0xabcd');
  assert.equal(normalizeSignature({ result: '0xbeef' }), '0xbeef');
  assert.equal(normalizeSignature(null), '');
});

test('delegates hex signatures to the Base public client verifier', async () => {
  let received;
  const client = {
    verifyMessage: async (payload) => {
      received = payload;
      return true;
    }
  };
  const payload = {
    address: '0x0123456789abcdef0123456789abcdef01234567',
    message: 'Scicon Shooter Base Account verification test',
    signature: { signature: '0x1234' }
  };

  assert.equal(await verifyMessageWithClient(client, payload), true);
  assert.deepEqual(received, { ...payload, signature: '0x1234' });
  assert.equal(await verifyMessageWithClient(client, { ...payload, signature: 'not-hex' }), false);
});
