const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'services', 'addressResourceCoordinator.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
}).outputFiles[0].text;

const loadCoordinatorModule = () => {
  const holder = { exports: {} };
  new Function('module', 'exports', bundle)(holder, holder.exports);
  return holder.exports;
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const makeHarness = () => {
  const { createAddressResourceCoordinator } = loadCoordinatorModule();
  const reads = [];
  const coordinator = createAddressResourceCoordinator({
    load: (owner, context) => {
      const result = deferred();
      reads.push({ owner, ...context, ...result });
      return result.promise;
    }
  });
  return { coordinator, reads };
};

test('same-owner reads share one promise and expose explicit loading state', async () => {
  const { coordinator, reads } = makeHarness();
  coordinator.setOwner(' 0xAa ');

  const first = coordinator.refresh();
  const duplicate = coordinator.refresh();

  assert.strictEqual(duplicate, first);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].owner, '0xaa');
  assert.deepEqual(coordinator.getState(), {
    owner: '0xaa',
    status: 'loading',
    value: null,
    hasValue: false,
    error: null,
    busy: true,
    refreshing: false
  });

  reads[0].resolve('first-value');
  assert.equal(await first, 'first-value');
  assert.deepEqual(coordinator.getState(), {
    owner: '0xaa',
    status: 'ready',
    value: 'first-value',
    hasValue: true,
    error: null,
    busy: false,
    refreshing: false
  });
});

test('a failed refresh retains the last good value and reports refreshing separately', async () => {
  const { coordinator, reads } = makeHarness();
  coordinator.setOwner('0xA');
  coordinator.commitAuthoritative('0xa', 'cached-value');

  const refresh = coordinator.refresh();
  assert.deepEqual(coordinator.getState(), {
    owner: '0xa',
    status: 'refreshing',
    value: 'cached-value',
    hasValue: true,
    error: null,
    busy: true,
    refreshing: true
  });

  const failure = new Error('rpc unavailable');
  reads[0].reject(failure);
  assert.equal(await refresh, null);
  assert.deepEqual(coordinator.getState(), {
    owner: '0xa',
    status: 'ready',
    value: 'cached-value',
    hasValue: true,
    error: failure,
    busy: false,
    refreshing: false
  });
});

test('owner generations reject stale A responses across an A to B to A transition', async () => {
  const { coordinator, reads } = makeHarness();
  coordinator.setOwner('A');
  const firstA = coordinator.refresh();

  coordinator.setOwner('B');
  const requestB = coordinator.refresh();
  coordinator.setOwner('A');
  const secondA = coordinator.refresh();

  assert.equal(reads.length, 3);
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(reads[1].signal.aborted, true);
  assert.notEqual(reads[0].requestId, reads[2].requestId);

  reads[0].resolve('stale-a');
  reads[1].resolve('stale-b');
  assert.equal(await firstA, null);
  assert.equal(await requestB, null);
  assert.equal(coordinator.getState().owner, 'a');
  assert.equal(coordinator.getState().status, 'loading');
  assert.equal(coordinator.getState().hasValue, false);

  reads[2].resolve('fresh-a');
  assert.equal(await secondA, 'fresh-a');
  assert.equal(coordinator.getState().value, 'fresh-a');
});

test('wallet hydration follows the net rendered identity transition', () => {
  const {
    resolveWalletTransitionReloadSafety,
    shouldHydrateWalletIdentityTransition
  } = loadCoordinatorModule();
  const walletA = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const walletB = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

  // With A still rendered, a synchronous A -> B -> A callback sequence ends
  // released, while the genuine A -> B callback remains covered.
  assert.equal(shouldHydrateWalletIdentityTransition(walletB, walletA), true);
  assert.equal(shouldHydrateWalletIdentityTransition(walletA, walletA), false);
  assert.equal(shouldHydrateWalletIdentityTransition(null, walletA), true);
  assert.equal(shouldHydrateWalletIdentityTransition(walletA, null), true);
  assert.equal(shouldHydrateWalletIdentityTransition(null, null), false);
  assert.equal(resolveWalletTransitionReloadSafety(true, true), false);
  assert.equal(resolveWalletTransitionReloadSafety(false, true), true);
});

test('an authoritative mutation commit invalidates an older read', async () => {
  const { coordinator, reads } = makeHarness();
  coordinator.setOwner('A');
  const staleRead = coordinator.refresh();

  assert.equal(coordinator.commitAuthoritative('a', 'settlement-value'), true);
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(
    coordinator.commitAuthoritative('b', 'wrong-owner-value'),
    false
  );

  reads[0].resolve('pre-settlement-value');
  assert.equal(await staleRead, null);
  assert.deepEqual(coordinator.getState(), {
    owner: 'a',
    status: 'ready',
    value: 'settlement-value',
    hasValue: true,
    error: null,
    busy: false,
    refreshing: false
  });
});

test('a forced post-mutation read supersedes an older same-owner read immediately', async () => {
  const { coordinator, reads } = makeHarness();
  coordinator.setOwner('A');
  coordinator.commitAuthoritative('a', 'before-mutation');
  const oldRead = coordinator.refresh();

  const forcedRead = coordinator.refresh({ mode: 'force' });
  const forcedDuplicate = coordinator.refresh();
  assert.notStrictEqual(forcedRead, oldRead);
  assert.strictEqual(forcedDuplicate, forcedRead);
  assert.equal(reads.length, 2);
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(coordinator.getState().status, 'refreshing');
  assert.equal(coordinator.getState().value, 'before-mutation');

  reads[0].resolve('stale-before-mutation');
  assert.equal(await oldRead, null);
  assert.equal(coordinator.getState().value, 'before-mutation');

  reads[1].resolve('after-mutation');
  assert.equal(await forcedRead, 'after-mutation');
  assert.equal(coordinator.getState().value, 'after-mutation');
  assert.equal(coordinator.getState().busy, false);
});

test('a trailing refresh schedules exactly one non-overlapping replacement read', async () => {
  const { coordinator, reads } = makeHarness();
  coordinator.setOwner('A');
  const oldRead = coordinator.refresh();

  const trailing = coordinator.refresh({ mode: 'trailing' });
  const trailingDuplicate = coordinator.refresh({ mode: 'trailing' });
  assert.strictEqual(trailingDuplicate, trailing);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(coordinator.getState().busy, true);

  reads[0].resolve('superseded');
  assert.equal(await oldRead, null);
  await Promise.resolve();
  assert.equal(reads.length, 2);
  assert.equal(coordinator.getState().status, 'loading');

  reads[1].resolve('trailing-value');
  assert.equal(await trailing, 'trailing-value');
  assert.equal(coordinator.getState().value, 'trailing-value');
  assert.equal(coordinator.getState().busy, false);
});
