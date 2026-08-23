const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'run-identity-authorization-test-secret';

const {
  GUEST_COOKIE_NAME,
  createGuestIdentityToken,
  verifyGuestIdentityToken
} = require('../api/_lib/guestIdentity');
const { createRunIdentityBinding } = require('../api/_lib/runReceipts');
const { requireRunAssociationIdentity } = require('../api/_lib/runIdentityAuthorization');

const walletA = '0x1111111111111111111111111111111111111111';
const walletB = '0x2222222222222222222222222222222222222222';

const guestContext = () => {
  const token = createGuestIdentityToken();
  const session = verifyGuestIdentityToken(token);
  return {
    req: { headers: { cookie: `${GUEST_COOKIE_NAME}=${encodeURIComponent(token)}` } },
    identity: createRunIdentityBinding({ guestIdentityId: session.guestId })
  };
};

test('wallet-bound runs can only associate to their signed starting wallet', () => {
  const receipt = {
    identity: {
      kind: 'wallet',
      walletAddress: walletA,
      profileIdHash: 'wallet-profile-hash'
    }
  };
  assert.equal(requireRunAssociationIdentity({ receipt, requestedAddress: walletA, req: {} }).kind, 'wallet');
  assert.throws(
    () => requireRunAssociationIdentity({ receipt, requestedAddress: walletB, req: {} }),
    (error) => error?.statusCode === 403 && error?.code === 'RUN_IDENTITY_MISMATCH'
  );
});

test('guest runs require the exact signed browser cookie before wallet association', () => {
  const owner = guestContext();
  const other = guestContext();
  const receipt = { identity: owner.identity };
  assert.equal(requireRunAssociationIdentity({
    receipt,
    requestedAddress: walletA,
    req: owner.req
  }).kind, 'guest');
  assert.throws(
    () => requireRunAssociationIdentity({ receipt, requestedAddress: walletA, req: { headers: {} } }),
    /browser that started it/i
  );
  assert.throws(
    () => requireRunAssociationIdentity({ receipt, requestedAddress: walletA, req: other.req }),
    /different browser session/i
  );
});

test('identity-less legacy receipts are explicitly ineligible for wallet association', () => {
  assert.throws(
    () => requireRunAssociationIdentity({ receipt: {}, requestedAddress: walletA, req: {} }),
    /legacy run cannot be attached/i
  );
});
