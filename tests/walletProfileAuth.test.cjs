const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.WALLET_PROFILE_AUTH_SECRET = 'wallet-profile-auth-test-secret';

const {
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
  clearWalletProfileSessionCookie,
  createWalletProfileSession,
  getWalletProfileAuthSecret,
  makeWalletProfileMessage,
  normalizeWalletAddress,
  setWalletProfileSessionCookie,
  verifyWalletProfileSession
} = require('../api/_lib/walletProfileAuth');

const WALLET = '0x1111111111111111111111111111111111111111';

test('production profile sessions require a dedicated strong secret', () => {
  const originalSecret = process.env.WALLET_PROFILE_AUTH_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.WALLET_PROFILE_AUTH_SECRET;
    assert.throws(() => getWalletProfileAuthSecret(), /not configured/);
    process.env.WALLET_PROFILE_AUTH_SECRET = 'too-short';
    assert.throws(() => getWalletProfileAuthSecret(), /at least 32 characters/);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.WALLET_PROFILE_AUTH_SECRET = originalSecret;
  }
});

test('wallet profile sessions are signed, wallet-bound, expiring tokens', () => {
  const now = Date.UTC(2026, 6, 23, 12);
  const token = createWalletProfileSession(WALLET.toUpperCase(), now, 60_000);
  const session = verifyWalletProfileSession(token, now + 30_000);

  assert.equal(session.walletAddress, WALLET);
  assert.equal(session.profileId, `wallet:${WALLET}`);
  assert.throws(
    () => verifyWalletProfileSession(`${token.slice(0, -1)}x`, now + 30_000),
    /invalid/
  );
  assert.throws(
    () => verifyWalletProfileSession(token, now + 60_001),
    /expired/
  );
});

test('wallet profile session cookies use the required browser protections', () => {
  const headers = {};
  const res = { setHeader(name, value) { headers[name] = value; } };
  setWalletProfileSessionCookie(res, 'signed-token');

  assert.equal(Array.isArray(headers['Set-Cookie']), true);
  const [legacyCleanup, activeCookie] = headers['Set-Cookie'];
  assert.match(activeCookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(activeCookie, /HttpOnly/);
  assert.match(activeCookie, /Secure/);
  assert.match(activeCookie, /SameSite=Lax/);
  assert.match(activeCookie, /Path=\/api(?:;|$)/);
  assert.match(activeCookie, /Max-Age=2592000/);
  assert.match(legacyCleanup, /Path=\/api\/wallet-profile/);
  assert.match(legacyCleanup, /Max-Age=0/);

  clearWalletProfileSessionCookie(res);
  assert.equal(headers['Set-Cookie'].length, 2);
  headers['Set-Cookie'].forEach((cookie) => assert.match(cookie, /Max-Age=0/));
});

test('the default session remains valid for its advertised Max-Age and expires at the boundary', () => {
  const now = Date.UTC(2026, 6, 23, 12);
  const token = createWalletProfileSession(WALLET, now);

  assert.doesNotThrow(() => (
    verifyWalletProfileSession(token, now + SESSION_LIFETIME_MS - 1)
  ));
  assert.throws(
    () => verifyWalletProfileSession(token, now + SESSION_LIFETIME_MS),
    /expired/
  );

  const headers = {};
  setWalletProfileSessionCookie({
    setHeader(name, value) {
      headers[name] = value;
    }
  }, token);
  const activeCookie = headers['Set-Cookie'].find((cookie) => (
    !/Max-Age=0(?:;|$)/.test(cookie)
  ));
  assert.match(
    activeCookie,
    new RegExp(`Max-Age=${SESSION_LIFETIME_MS / 1000}(?:;|$)`)
  );
});

test('the gas-free profile message binds wallet, domain, chain, challenge, and expiry', () => {
  const message = makeWalletProfileMessage({
    address: WALLET,
    challengeId: '11111111-1111-4111-8111-111111111111',
    expiresAt: '2026-07-23T20:00:00.000Z',
    origin: 'https://www.sciconshooter.xyz'
  });

  assert.equal(normalizeWalletAddress(WALLET.toUpperCase()), WALLET);
  assert.match(message, /Domain: www\.sciconshooter\.xyz/);
  assert.match(message, /Wallet: 0x1111111111111111111111111111111111111111/);
  assert.match(message, /Chain ID: 8453/);
  assert.match(message, /Challenge: 11111111-1111-4111-8111-111111111111/);
  assert.match(message, /gas-free signature does not spend funds/i);
});
