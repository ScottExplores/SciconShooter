const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadClient = () => {
  const bundle = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'runReceiptService.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  }).outputFiles[0].text;
  const holder = { exports: {} };
  new Function('module', 'exports', bundle)(holder, holder.exports);
  return holder.exports;
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; }
});

test('the client acknowledges a first guest cookie and retries start exactly once', async () => {
  const client = loadClient();
  const previousFetch = global.fetch;
  let calls = 0;
  const payloads = [];
  global.fetch = async (_url, options) => {
    payloads.push(JSON.parse(options.body));
    calls += 1;
    if (calls === 1) {
      return jsonResponse(428, {
        error: 'Guest play is ready.',
        code: 'GUEST_SESSION_REQUIRED'
      });
    }
    return jsonResponse(200, {
      runId: 'guest-run',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      startToken: 'signed-start',
      playerShipId: 'researchhub',
      runMode: 'standard',
      identity: { kind: 'guest', profileIdHash: 'server-owned-hash' }
    });
  };
  try {
    const session = await client.startRunSession({ profileId: 'pilot:untrusted-id' });
    assert.equal(calls, 2);
    assert.equal(session.runId, 'guest-run');
    assert.equal(session.localOnly, undefined);
    assert.equal(session.identity.kind, 'guest');
    assert.deepEqual(payloads.map((payload) => payload.walletAddress), [null, null]);
  } finally {
    global.fetch = previousFetch;
  }
});

test('the client sends wallet intent and never hides a session mismatch behind a local run', async () => {
  const client = loadClient();
  const previousFetch = global.fetch;
  const wallet = '0x8888888888888888888888888888888888888888';
  let payload = null;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return jsonResponse(409, {
      error: 'The active Base Account changed.',
      code: 'RUN_WALLET_SESSION_MISMATCH'
    });
  };
  try {
    await assert.rejects(
      () => client.startRunSession({ walletAddress: wallet }),
      (error) => error?.code === 'RUN_WALLET_SESSION_MISMATCH'
    );
    assert.equal(payload.walletAddress, wallet);
  } finally {
    global.fetch = previousFetch;
  }
});

test('a missing receipt API starts a local weekly practice session', async () => {
  const client = loadClient();
  const previousFetch = global.fetch;
  global.fetch = async () => jsonResponse(404, { error: 'not found' });
  try {
    const session = await client.startRunSession({
      runMode: 'weekly-streak',
      weeklyCampaignProof: { schemaVersion: 1 }
    });
    assert.equal(session.localOnly, true);
    assert.equal(session.runMode, 'weekly-streak');
    assert.equal(session.startToken, '');
  } finally {
    global.fetch = previousFetch;
  }
});

test('a live weekly admission rejection is not turned into practice', async () => {
  const client = loadClient();
  const previousFetch = global.fetch;
  global.fetch = async () => jsonResponse(422, {
    error: 'No attempts remain.',
    code: 'WEEKLY_ATTEMPTS',
    details: ['weekly_run_attempts_exhausted']
  });
  try {
    await assert.rejects(
      () => client.startRunSession({
        runMode: 'weekly-streak',
        weeklyCampaignProof: { schemaVersion: 1 }
      }),
      (error) => error?.statusCode === 422
    );
  } finally {
    global.fetch = previousFetch;
  }
});

test('a repeated guest handshake response does not create an unbounded retry loop', async () => {
  const client = loadClient();
  const previousFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return jsonResponse(428, {
      error: 'Guest play is ready.',
      code: 'GUEST_SESSION_REQUIRED'
    });
  };
  try {
    await assert.rejects(
      () => client.startRunSession({
        runMode: 'weekly-streak',
        weeklyCampaignProof: { schemaVersion: 1 }
      }),
      (error) => error?.code === 'GUEST_SESSION_REQUIRED'
    );
    assert.equal(calls, 2);
  } finally {
    global.fetch = previousFetch;
  }
});
