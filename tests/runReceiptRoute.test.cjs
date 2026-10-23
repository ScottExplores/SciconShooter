const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'run-receipt-route-test-secret';
process.env.WALLET_PROFILE_AUTH_SECRET = 'run-receipt-route-wallet-secret';

const { GUEST_COOKIE_NAME } = require('../api/_lib/guestIdentity');
const {
  SESSION_COOKIE_NAME,
  createWalletProfileSession
} = require('../api/_lib/walletProfileAuth');
const handler = require('../api/run-receipts');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
const { clearWeeklyRunAttemptMemoryForTests } = require('../api/_lib/weeklyRunAttempts');

const root = path.resolve(__dirname, '..');
const browserBundle = esbuild.buildSync({
  stdin: {
    contents: [
      "export * as graph from './services/campaignGraph.ts';",
      "export * as streak from './services/weeklyCampaignStreak.ts';",
      "export * as generator from './services/weeklyRunGenerator.ts';"
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'run-receipt-route-entry.ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent'
}).outputFiles[0].text;
const browserHolder = { exports: {} };
new Function('require', 'module', 'exports', browserBundle)(require, browserHolder, browserHolder.exports);
const browser = browserHolder.exports;

const freshWeeklyProof = (now) => {
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 1);
  const graph = browser.graph.createCampaignGraphIndex(run);
  return browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: graph.definition.entryNodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: now - 1_000
  });
};

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  getHeader(name) { return this.headers[name]; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const makeRequest = (body, address, headers = {}) => ({
  method: 'POST',
  body,
  headers,
  socket: { remoteAddress: address }
});

const responseCookie = (response, name) => {
  const values = Array.isArray(response.headers['Set-Cookie'])
    ? response.headers['Set-Cookie']
    : [response.headers['Set-Cookie']];
  return values.find((value) => String(value).startsWith(`${name}=`))?.split(';')[0] || '';
};

test('run receipt route bounds malformed and primitive JSON bodies', async () => {
  const bodies = ['null', '42', 'true', '[]', '{bad json'];
  for (const [index, body] of bodies.entries()) {
    const response = makeResponse();
    await handler(makeRequest(body, `198.51.100.${index + 1}`), response);
    assert.equal(response.statusCode, 400, body);
    assert.equal(response.body.error, 'Unknown run receipt action', body);
  }
});

test('a foreign browser origin cannot rotate identity or consume a run admission', async () => {
  const response = makeResponse();
  await handler(makeRequest(
    { action: 'start' },
    '203.0.113.119',
    {
      origin: 'https://evil.sciconshooter.xyz',
      host: 'www.sciconshooter.xyz'
    }
  ), response);
  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /origin is not allowed/i);
  assert.equal(response.headers['Set-Cookie'], undefined);
  assert.equal(response.body.runId, undefined);
});

test('run receipt route rate-limits repeated invalid starts with a JSON response', async () => {
  const address = '203.0.113.222';
  let response;
  for (let index = 0; index < 31; index += 1) {
    response = makeResponse();
    await handler(makeRequest({}, address), response);
  }
  assert.equal(response.statusCode, 429);
  assert.match(response.body.error, /too many run requests/i);
});

test('guest start uses a two-phase signed cookie and ignores rotating body profile ids', async () => {
  const address = '203.0.113.120';
  const first = makeResponse();
  await handler(makeRequest({
    action: 'start',
    gameVersion: 'guest-handshake-test',
    profileId: 'pilot:first-client-id'
  }, address, { 'x-forwarded-proto': 'https' }), first);

  assert.equal(first.statusCode, 428);
  assert.equal(first.body.code, 'GUEST_SESSION_REQUIRED');
  assert.equal(first.body.runId, undefined);
  assert.equal(first.body.startToken, undefined);
  const guestCookie = responseCookie(first, GUEST_COOKIE_NAME);
  assert.ok(guestCookie);
  assert.match(first.headers['Set-Cookie'][0], /HttpOnly/);
  assert.match(first.headers['Set-Cookie'][0], /Secure/);
  assert.match(first.headers['Set-Cookie'][0], /SameSite=Lax/);

  const second = makeResponse();
  await handler(makeRequest({
    action: 'start',
    gameVersion: 'guest-handshake-test',
    profileId: 'pilot:second-client-id'
  }, address, { cookie: guestCookie }), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.identity.kind, 'guest');

  const third = makeResponse();
  await handler(makeRequest({
    action: 'start',
    gameVersion: 'guest-handshake-test',
    profileId: 'pilot:third-client-id'
  }, address, { cookie: guestCookie }), third);
  assert.equal(third.statusCode, 200);
  assert.equal(third.body.identity.profileIdHash, second.body.identity.profileIdHash);
});

test('prepare-guest establishes the guest cookie with a handled 200', async () => {
  const address = '203.0.113.131';
  const prepared = makeResponse();
  await handler(makeRequest({
    action: 'prepare-guest',
    gameVersion: 'guest-handshake-test',
    profileId: 'pilot:prepare'
  }, address, { 'x-forwarded-proto': 'https' }), prepared);
  assert.equal(prepared.statusCode, 200);
  assert.equal(prepared.body.ready, false);
  assert.equal(prepared.body.code, 'GUEST_SESSION_REQUIRED');
  assert.equal(prepared.body.runId, undefined);
  const guestCookie = responseCookie(prepared, GUEST_COOKIE_NAME);
  assert.ok(guestCookie);

  const started = makeResponse();
  await handler(makeRequest({
    action: 'start',
    gameVersion: 'guest-handshake-test'
  }, address, { cookie: guestCookie }), started);
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.identity.kind, 'guest');
});

test('lost or tampered guest handshakes never create a run before cookie acknowledgement', async () => {
  const address = '203.0.113.121';
  const lost = makeResponse();
  await handler(makeRequest({ action: 'start' }, address), lost);
  assert.equal(lost.statusCode, 428);
  assert.equal(lost.body.runId, undefined);

  const retriedWithoutLostCookie = makeResponse();
  await handler(makeRequest({ action: 'start' }, address), retriedWithoutLostCookie);
  assert.equal(retriedWithoutLostCookie.statusCode, 428);
  assert.equal(retriedWithoutLostCookie.body.runId, undefined);

  const tampered = makeResponse();
  await handler(makeRequest(
    { action: 'start' },
    address,
    { cookie: `${GUEST_COOKIE_NAME}=tampered` }
  ), tampered);
  assert.equal(tampered.statusCode, 428);
  assert.equal(tampered.body.runId, undefined);
  assert.notEqual(responseCookie(tampered, GUEST_COOKIE_NAME), `${GUEST_COOKIE_NAME}=tampered`);
});

test('the guest handshake consumes zero weekly attempts before acknowledgement', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const address = '203.0.113.123';
  const now = Date.now();
  const handshake = makeResponse();
  await handler(makeRequest({
    action: 'start',
    runMode: 'weekly-streak',
    profileId: 'pilot:untrusted-first',
    weeklyCampaignProof: freshWeeklyProof(now)
  }, address), handshake);
  assert.equal(handshake.statusCode, 428);
  assert.equal(handshake.body.runId, undefined);

  const acknowledged = makeResponse();
  await handler(makeRequest({
    action: 'start',
    runMode: 'weekly-streak',
    profileId: 'pilot:untrusted-second',
    weeklyCampaignProof: freshWeeklyProof(now + 2_000)
  }, address, { cookie: responseCookie(handshake, GUEST_COOKIE_NAME) }), acknowledged);
  assert.equal(acknowledged.statusCode, 200);
  assert.equal(acknowledged.body.weeklyAttempt.attemptNumber, 1);
  assert.equal(acknowledged.body.weeklyAttempt.attemptsRemaining, 4);
});

test('an exact wallet intent and authenticated session bind the run to that wallet', async () => {
  const address = '203.0.113.122';
  const handshake = makeResponse();
  await handler(makeRequest({ action: 'start' }, address), handshake);
  const guestCookie = responseCookie(handshake, GUEST_COOKIE_NAME);
  const wallet = '0x3333333333333333333333333333333333333333';
  const walletCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(wallet))}`;

  const response = makeResponse();
  await handler(makeRequest(
    { action: 'start', profileId: 'pilot:ignored-client-id', walletAddress: wallet },
    address,
    { cookie: `${guestCookie}; ${walletCookie}` }
  ), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.identity.kind, 'wallet');
  assert.equal(response.body.identity.walletAddress, wallet);
});

test('explicit guest intent ignores a retained authenticated wallet cookie', async () => {
  const address = '203.0.113.125';
  const wallet = '0x4444444444444444444444444444444444444444';
  const walletCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(wallet))}`;
  const handshake = makeResponse();
  await handler(makeRequest(
    { action: 'start', walletAddress: null },
    address,
    { cookie: walletCookie }
  ), handshake);
  assert.equal(handshake.statusCode, 428);
  const guestCookie = responseCookie(handshake, GUEST_COOKIE_NAME);
  assert.ok(guestCookie);

  const response = makeResponse();
  await handler(makeRequest(
    { action: 'start', walletAddress: null },
    address,
    { cookie: `${guestCookie}; ${walletCookie}` }
  ), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.identity.kind, 'guest');
  assert.equal(response.body.identity.walletAddress, undefined);
});

test('a wallet intent that differs from the authenticated session is rejected before admission', async () => {
  const address = '203.0.113.126';
  const walletA = '0x5555555555555555555555555555555555555555';
  const walletB = '0x6666666666666666666666666666666666666666';
  const walletCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(walletA))}`;
  const response = makeResponse();
  await handler(makeRequest(
    { action: 'start', walletAddress: walletB },
    address,
    { cookie: walletCookie }
  ), response);
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, 'RUN_WALLET_SESSION_MISMATCH');
  assert.equal(response.body.runId, undefined);
  assert.equal(response.body.startToken, undefined);
});

test('a wallet intent without a matching authenticated session never falls back to guest', async () => {
  const response = makeResponse();
  await handler(makeRequest(
    {
      action: 'start',
      walletAddress: '0x7777777777777777777777777777777777777777'
    },
    '203.0.113.127'
  ), response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'RUN_WALLET_SESSION_REQUIRED');
  assert.equal(response.headers['Set-Cookie'], undefined);
  assert.equal(response.body.runId, undefined);
});

test('Pilot Test mode is rejected for guests and non-project wallet sessions', async () => {
  const guestResponse = makeResponse();
  await handler(makeRequest({
    action: 'start',
    walletAddress: null,
    testRun: true
  }, '203.0.113.128'), guestResponse);
  assert.equal(guestResponse.statusCode, 403);
  assert.equal(guestResponse.body.code, 'PILOT_TEST_RUN_FORBIDDEN');

  const otherWallet = '0x8888888888888888888888888888888888888888';
  const walletCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(otherWallet))}`;
  const walletResponse = makeResponse();
  await handler(makeRequest({
    action: 'start',
    walletAddress: otherWallet,
    testRun: true
  }, '203.0.113.129', { cookie: walletCookie }), walletResponse);
  assert.equal(walletResponse.statusCode, 403);
  assert.equal(walletResponse.body.code, 'PILOT_TEST_RUN_FORBIDDEN');
});

test('the exact project wallet session can start a provenance-bound Pilot Test run', async () => {
  const pilotWallet = '0x3a8d692aabdd4981080a8f6af8375a21359464bf';
  const walletCookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(pilotWallet))}`;
  const response = makeResponse();
  await handler(makeRequest({
    action: 'start',
    walletAddress: pilotWallet,
    testRun: true
  }, '203.0.113.130', { cookie: walletCookie }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.testRun, true);
  assert.equal(response.body.identity.walletAddress, pilotWallet);
});

test('an invalid retained wallet cookie is ignored during explicit guest play', async () => {
  const address = '203.0.113.124';
  const staleWalletCookie = `${SESSION_COOKIE_NAME}=forged-wallet-session`;
  const handshake = makeResponse();
  await handler(makeRequest(
    { action: 'start' },
    address,
    { cookie: staleWalletCookie }
  ), handshake);
  assert.equal(handshake.statusCode, 428);
  assert.equal(handshake.body.code, 'GUEST_SESSION_REQUIRED');
  const setCookies = handshake.headers['Set-Cookie'];
  const guestCookie = responseCookie(handshake, GUEST_COOKIE_NAME);
  assert.ok(guestCookie);
  assert.equal(
    setCookies.some((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`) && /Max-Age=0/.test(value)),
    false
  );

  const started = makeResponse();
  await handler(makeRequest(
    { action: 'start', profileId: 'pilot:ignored-again' },
    address,
    { cookie: `${guestCookie}; ${staleWalletCookie}` }
  ), started);
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.identity.kind, 'guest');
});

test('guest finish requires the admitting guest cookie and ignores an unrelated stale wallet cookie', async () => {
  const address = '203.0.113.128';
  const handshake = makeResponse();
  await handler(makeRequest({ action: 'start', walletAddress: null }, address), handshake);
  const guestCookie = responseCookie(handshake, GUEST_COOKIE_NAME);
  const started = makeResponse();
  await handler(makeRequest(
    { action: 'start', walletAddress: null },
    address,
    { cookie: `${guestCookie}; ${SESSION_COOKIE_NAME}=expired-or-tampered` }
  ), started);
  assert.equal(started.statusCode, 200);
  assert.equal(started.body.identity.guestSessionBound, true);

  const metrics = {
    score: 100,
    wave: 1,
    durationMs: 2_000,
    enemiesDefeated: 1,
    coinsCollected: 0,
    playerShipId: 'researchhub'
  };
  const missing = makeResponse();
  await handler(makeRequest({
    action: 'finish',
    startToken: started.body.startToken,
    metrics
  }, address), missing);
  assert.equal(missing.statusCode, 403);
  assert.equal(missing.body.code, 'RUN_IDENTITY_MISMATCH');

  const otherHandshake = makeResponse();
  await handler(makeRequest({ action: 'start', walletAddress: null }, '203.0.113.129'), otherHandshake);
  const different = makeResponse();
  await handler(makeRequest({
    action: 'finish',
    startToken: started.body.startToken,
    metrics
  }, address, { cookie: responseCookie(otherHandshake, GUEST_COOKIE_NAME) }), different);
  assert.equal(different.statusCode, 403);
  assert.equal(different.body.code, 'RUN_IDENTITY_MISMATCH');

  const matching = makeResponse();
  await handler(makeRequest({
    action: 'finish',
    startToken: started.body.startToken,
    metrics
  }, address, {
    cookie: `${guestCookie}; ${SESSION_COOKIE_NAME}=expired-or-tampered`
  }), matching);
  assert.equal(matching.statusCode, 200);
  assert.equal(matching.body.receipt.identity.kind, 'guest');
  assert.equal(matching.body.receipt.identity.profileIdHash, started.body.identity.profileIdHash);
});
