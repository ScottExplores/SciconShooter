const test = require('node:test');
const assert = require('node:assert/strict');

const sessionFor = (method, provider, name) => ({ method, name, provider });

test('A starts, B succeeds, then A late reject and late authorize stay inert', async () => {
  const ledger = await import('../services/evmConnectLedger.ts');
  const providerA = { id: 'wc-a' };
  const providerB = { id: 'injected-b' };
  const addressA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const addressB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  let state = ledger.createConnectLedger();
  const startedA = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedA.state, startedA.generation, providerA);
  const startedB = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedB.state, startedB.generation, providerB);
  const successB = ledger.settleConnectAttempt(state, {
    generation: startedB.generation,
    outcome: 'authorized',
    session: sessionFor('injected', providerB, 'MetaMask'),
    address: addressB
  });
  state = successB.state;
  assert.equal(successB.applied, true);
  assert.equal(state.address, addressB);
  assert.equal(state.committed.provider, providerB);
  assert.equal(successB.disconnect.includes(providerB), false);

  const lateReject = ledger.settleConnectAttempt(state, {
    generation: startedA.generation,
    outcome: 'rejected',
    session: sessionFor('walletconnect', providerA, 'WalletConnect'),
    address: addressA
  });
  state = lateReject.state;
  assert.equal(lateReject.applied, false);
  assert.deepEqual(lateReject.disconnect, [providerA]);
  assert.equal(state.address, addressB);
  assert.equal(state.committed.provider, providerB);

  const lateAuthorize = ledger.settleConnectAttempt(state, {
    generation: startedA.generation,
    outcome: 'authorized',
    session: sessionFor('walletconnect', providerA, 'WalletConnect'),
    address: addressA
  });
  assert.equal(lateAuthorize.applied, false);
  assert.equal(lateAuthorize.state.address, addressB);
  assert.equal(lateAuthorize.state.committed.provider, providerB);
  assert.equal(lateAuthorize.disconnect.includes(providerB), false);
  assert.equal(lateAuthorize.disconnect.includes(providerA), false);
});

test('A is cancelled, B succeeds, and A finally cleanup does not touch B', async () => {
  const ledger = await import('../services/evmConnectLedger.ts');
  const providerA = { id: 'wc-a' };
  const providerB = { id: 'injected-b' };
  const addressA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const addressB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  let state = ledger.createConnectLedger();
  const startedA = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedA.state, startedA.generation, providerA);
  const cancelled = ledger.supersedeConnectAttempts(state);
  state = cancelled.state;
  assert.deepEqual(cancelled.disconnect, [providerA]);
  assert.equal(state.committed, null);

  const startedB = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedB.state, startedB.generation, providerB);
  const successB = ledger.settleConnectAttempt(state, {
    generation: startedB.generation,
    outcome: 'authorized',
    session: sessionFor('injected', providerB, 'Rabby'),
    address: addressB
  });
  state = successB.state;

  const cleanupA = ledger.settleConnectAttempt(state, {
    generation: startedA.generation,
    outcome: 'rejected',
    session: sessionFor('walletconnect', providerA, 'WalletConnect'),
    address: addressA
  });
  assert.equal(cleanupA.applied, false);
  assert.deepEqual(cleanupA.disconnect, []);
  assert.equal(cleanupA.state.address, addressB);
  assert.equal(cleanupA.state.committed.provider, providerB);
  assert.equal(cleanupA.state.committed.method, 'injected');
});

test('overlapping WalletConnect, injected, and Base attempts cannot desync address and provider', async () => {
  const ledger = await import('../services/evmConnectLedger.ts');
  const providerA = { id: 'wc-a' };
  const providerB = { id: 'injected-b' };
  const providerC = { id: 'base' };
  const addressA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const addressB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  let state = ledger.createConnectLedger();
  const wc = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(wc.state, wc.generation, providerA);
  const injected = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(injected.state, injected.generation, providerB);
  const base = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(base.state, base.generation, providerC);

  const baseSuccess = ledger.settleConnectAttempt(state, {
    generation: base.generation,
    outcome: 'authorized',
    session: sessionFor('base-account', providerC, 'Base Account'),
    address: addressB
  });
  state = baseSuccess.state;
  assert.equal(baseSuccess.applied, true);
  assert.equal(state.committed.method, 'base-account');
  assert.equal(state.committed.provider, providerC);
  assert.equal(state.address, addressB);
  assert.equal(baseSuccess.disconnect.includes(providerC), false);

  const wcLate = ledger.settleConnectAttempt(state, {
    generation: wc.generation,
    outcome: 'authorized',
    session: sessionFor('walletconnect', providerA, 'WalletConnect'),
    address: addressA
  });
  const injectedLate = ledger.settleConnectAttempt(wcLate.state, {
    generation: injected.generation,
    outcome: 'cancelled',
    session: sessionFor('injected', providerB, 'MetaMask'),
    address: addressA
  });
  state = injectedLate.state;
  assert.equal(wcLate.applied, false);
  assert.equal(injectedLate.applied, false);
  assert.deepEqual(wcLate.disconnect, [providerA]);
  assert.deepEqual(injectedLate.disconnect, [providerB]);
  assert.equal(state.address, addressB);
  assert.equal(state.committed.provider, providerC);
});

test('a stale cleanup does not disconnect the provider that is now committed', async () => {
  const ledger = await import('../services/evmConnectLedger.ts');
  const shared = { id: 'same-injected' };
  const addressB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  let state = ledger.createConnectLedger();
  const startedA = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedA.state, startedA.generation, shared);
  const startedB = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedB.state, startedB.generation, shared);
  const successB = ledger.settleConnectAttempt(state, {
    generation: startedB.generation,
    outcome: 'authorized',
    session: sessionFor('injected', shared, 'MetaMask'),
    address: addressB
  });
  const lateA = ledger.settleConnectAttempt(successB.state, {
    generation: startedA.generation,
    outcome: 'rejected'
  });
  assert.deepEqual(lateA.disconnect, []);
  assert.equal(lateA.state.committed.provider, shared);
  assert.equal(lateA.state.address, addressB);
});

test('A cleanup while B is still awaiting a signature does not disconnect their shared provider', async () => {
  const ledger = await import('../services/evmConnectLedger.ts');
  const shared = { id: 'same-injected', disconnected: 0, disconnect() { this.disconnected += 1; } };
  const addressA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  let state = ledger.createConnectLedger();
  const startedA = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedA.state, startedA.generation, shared);
  const startedB = ledger.startConnectAttempt(state);
  state = ledger.trackPendingProvider(startedB.state, startedB.generation, shared);
  assert.equal(state.pending.length, 2);
  const cleanupA = ledger.settleConnectAttempt(state, {
    generation: startedA.generation,
    outcome: 'rejected',
    session: sessionFor('injected', shared, 'MetaMask'),
    address: addressA
  });
  const committed = cleanupA.state.committed?.provider ?? null;
  cleanupA.disconnect.forEach((provider) => {
    if (provider === committed) return;
    provider.disconnect?.();
  });
  assert.equal(cleanupA.applied, false);
  assert.deepEqual(cleanupA.disconnect, []);
  assert.equal(shared.disconnected, 0);
  assert.equal(cleanupA.state.pending.length, 1);
  assert.equal(cleanupA.state.pending[0].generation, startedB.generation);
  assert.equal(cleanupA.state.pending[0].provider, shared);
  assert.equal(cleanupA.state.address, null);
});

test('authentication is not posted after a newer attempt becomes current', async () => {
  const ledger = await import('../services/evmConnectLedger.ts');
  assert.equal(ledger.shouldCommitWalletAuthentication(1, 1), true);
  assert.equal(ledger.shouldCommitWalletAuthentication(1, 2), false);
});
