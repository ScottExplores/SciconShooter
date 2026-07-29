const test = require('node:test');
const assert = require('node:assert/strict');

const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const profile = (walletAddress, revision = 1) => ({
  walletAddress,
  profileId: `wallet:${walletAddress}`,
  revision
});

const importSessionResolver = async () => (
  import('../services/walletProfileSession.ts')
);

test('routine disconnect and reconnect reuse the matching authenticated session', async () => {
  const { resolveWalletProfileSession } = await importSessionResolver();
  let signatureRequests = 0;
  const session = {
    walletAddress: WALLET_A,
    profile: profile(WALLET_A)
  };
  const resolve = () => resolveWalletProfileSession({
    walletAddress: WALLET_A,
    readSession: async () => session,
    authenticate: async () => {
      signatureRequests += 1;
      return session;
    },
    isUnauthenticatedError: () => false
  });

  const initialConnection = await resolve();
  // A routine UI disconnect deliberately does not clear the HttpOnly cookie.
  const reconnection = await resolve();

  assert.equal(initialConnection.authenticated, true);
  assert.equal(initialConnection.authorizationSource, 'existing-session');
  assert.equal(reconnection.authorizationSource, 'existing-session');
  assert.equal(reconnection.walletAddress, WALLET_A);
  assert.equal(signatureRequests, 0);
});

test('a matching wallet-bound session with profile null is authenticated without another signature', async () => {
  const { resolveWalletProfileSession } = await importSessionResolver();
  let signatureRequests = 0;

  const result = await resolveWalletProfileSession({
    walletAddress: WALLET_A,
    readSession: async () => ({
      walletAddress: WALLET_A,
      profile: null
    }),
    authenticate: async () => {
      signatureRequests += 1;
      return {
        walletAddress: WALLET_A,
        profile: null
      };
    },
    isUnauthenticatedError: () => false
  });

  assert.deepEqual(result, {
    authenticated: true,
    walletAddress: WALLET_A,
    profile: null,
    authorizationSource: 'existing-session'
  });
  assert.equal(signatureRequests, 0);
});

test('a session for another wallet is never reused and requires current-wallet authorization', async () => {
  const { resolveWalletProfileSession } = await importSessionResolver();
  let signatureRequests = 0;

  const result = await resolveWalletProfileSession({
    walletAddress: WALLET_B,
    readSession: async () => ({
      walletAddress: WALLET_A,
      profile: profile(WALLET_A)
    }),
    authenticate: async () => {
      signatureRequests += 1;
      return {
        walletAddress: WALLET_B,
        profile: profile(WALLET_B)
      };
    },
    isUnauthenticatedError: () => false
  });

  assert.equal(result.walletAddress, WALLET_B);
  assert.equal(result.profile.walletAddress, WALLET_B);
  assert.equal(result.authorizationSource, 'wallet-signature');
  assert.equal(signatureRequests, 1);
});

test('a mismatched authentication response is rejected rather than attached to the requested wallet', async () => {
  const {
    resolveWalletProfileSession,
    WalletProfileSessionResolutionError
  } = await importSessionResolver();

  await assert.rejects(
    resolveWalletProfileSession({
      walletAddress: WALLET_B,
      readSession: async () => ({
        walletAddress: WALLET_A,
        profile: profile(WALLET_A)
      }),
      authenticate: async () => ({
        walletAddress: WALLET_A,
        profile: profile(WALLET_A)
      }),
      isUnauthenticatedError: () => false
    }),
    (error) => (
      error instanceof WalletProfileSessionResolutionError
      && error.code === 'wallet_mismatch'
    )
  );
});

test('only an unauthenticated session probe falls back to wallet authorization', async () => {
  const { resolveWalletProfileSession } = await importSessionResolver();
  let signatureRequests = 0;
  const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 });

  const recovered = await resolveWalletProfileSession({
    walletAddress: WALLET_A,
    readSession: async () => {
      throw unauthorized;
    },
    authenticate: async () => {
      signatureRequests += 1;
      return {
        walletAddress: WALLET_A,
        profile: null
      };
    },
    isUnauthenticatedError: (error) => error?.status === 401
  });

  assert.equal(recovered.authorizationSource, 'wallet-signature');
  assert.equal(recovered.authenticated, true);
  assert.equal(signatureRequests, 1);

  await assert.rejects(
    resolveWalletProfileSession({
      walletAddress: WALLET_A,
      readSession: async () => {
        throw Object.assign(new Error('Server unavailable'), { status: 503 });
      },
      authenticate: async () => {
        signatureRequests += 1;
        return {
          walletAddress: WALLET_A,
          profile: null
        };
      },
      isUnauthenticatedError: (error) => error?.status === 401
    }),
    /Server unavailable/
  );
  assert.equal(signatureRequests, 1);
});
