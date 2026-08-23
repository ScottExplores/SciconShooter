const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'services', 'fetchWithDeadline.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
}).outputFiles[0].text;
const holder = { exports: {} };
new Function('module', 'exports', bundle)(holder, holder.exports);
const { fetchJsonWithDeadline, fetchWithDeadline, RequestDeadlineError } = holder.exports;

test('a never-resolving profile transport is aborted at its deadline', async () => {
  const previousFetch = global.fetch;
  let observedAbort = false;
  global.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      observedAbort = true;
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
  });

  try {
    await assert.rejects(
      fetchWithDeadline('/api/wallet-profile', {}, 5),
      (error) => error instanceof RequestDeadlineError
    );
    assert.equal(observedAbort, true);
  } finally {
    global.fetch = previousFetch;
  }
});

test('caller cancellation remains distinct from a request deadline', async () => {
  const previousFetch = global.fetch;
  global.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('caller aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
  const controller = new AbortController();

  try {
    const request = fetchWithDeadline('/api/wallet-profile', {
      signal: controller.signal
    }, 1_000);
    controller.abort();
    await assert.rejects(request, (error) => (
      error?.name === 'AbortError' && !(error instanceof RequestDeadlineError)
    ));
  } finally {
    global.fetch = previousFetch;
  }
});

test('the deadline remains active while a response body is still loading', async () => {
  const previousFetch = global.fetch;
  let bodyAbortObserved = false;
  global.fetch = async (_input, init) => ({
    ok: true,
    status: 200,
    json: async () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        bodyAbortObserved = true;
        reject(Object.assign(new Error('body aborted'), { name: 'AbortError' }));
      }, { once: true });
    })
  });
  try {
    await assert.rejects(
      fetchJsonWithDeadline('/api/player-runs', {}, 5),
      (error) => error instanceof RequestDeadlineError
    );
    assert.equal(bodyAbortObserved, true);
  } finally {
    global.fetch = previousFetch;
  }
});

test('caller abort after headers cancels response body consumption', async () => {
  const previousFetch = global.fetch;
  let bodyStartedResolve;
  const bodyStarted = new Promise((resolve) => { bodyStartedResolve = resolve; });
  global.fetch = async (_input, init) => ({
    ok: true,
    status: 200,
    json: async () => new Promise((_resolve, reject) => {
      bodyStartedResolve();
      init.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('caller aborted body'), { name: 'AbortError' }));
      }, { once: true });
    })
  });
  const controller = new AbortController();
  try {
    const request = fetchJsonWithDeadline('/api/player-runs', {
      signal: controller.signal
    }, 1_000);
    await bodyStarted;
    controller.abort();
    await assert.rejects(request, (error) => error?.name === 'AbortError');
  } finally {
    global.fetch = previousFetch;
  }
});
