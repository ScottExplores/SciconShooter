const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'weekly-guest-quota-rotation-test-secret';
process.env.WALLET_PROFILE_AUTH_SECRET = 'weekly-guest-quota-wallet-test-secret';

const root = path.resolve(__dirname, '..');
const {
  GUEST_COOKIE_NAME,
  createGuestIdentityToken
} = require('../api/_lib/guestIdentity');
const {
  clearWeeklyRunAttemptMemoryForTests
} = require('../api/_lib/weeklyRunAttempts');
const handler = require('../api/run-receipts');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');

const browserBundle = esbuild.buildSync({
  stdin: {
    contents: [
      "export * as graph from './services/campaignGraph.ts';",
      "export * as streak from './services/weeklyCampaignStreak.ts';",
      "export * as generator from './services/weeklyRunGenerator.ts';"
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'weekly-guest-quota-rotation-entry.ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent'
}).outputFiles[0].text;
const browserHolder = { exports: {} };
new Function('require', 'module', 'exports', browserBundle)(
  require,
  browserHolder,
  browserHolder.exports
);
const browser = browserHolder.exports;

const freshWeeklyProof = (createdAtMs) => {
  const boundary = getWeeklyBoundaryMeta(new Date(createdAtMs));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 1);
  const graph = browser.graph.createCampaignGraphIndex(run);
  return browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: graph.definition.entryNodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: createdAtMs
  });
};

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  getHeader(name) { return this.headers[name]; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const deviceHeaders = {
  host: 'www.sciconshooter.xyz',
  origin: 'https://www.sciconshooter.xyz',
  'x-vercel-forwarded-for': '203.0.113.240',
  'user-agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"'
};

const request = async ({ body, guestToken }) => {
  const response = makeResponse();
  await handler({
    method: 'POST',
    body,
    headers: {
      ...deviceHeaders,
      cookie: `${GUEST_COOKIE_NAME}=${encodeURIComponent(guestToken)}`
    },
    socket: { remoteAddress: '127.0.0.1' }
  }, response);
  return response;
};

test('deleting the guest cookie cannot grant a sixth claimable ranked Weekly Run start', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const originalGuest = createGuestIdentityToken();
  const rotatedGuest = createGuestIdentityToken();
  const testNow = Date.now();
  const currentBoundary = getWeeklyBoundaryMeta(new Date(testNow));
  const baseCreatedAt = Math.max(currentBoundary.startsAt.getTime(), testNow - 60_000);
  let firstProof = null;
  let firstRunId = null;

  try {
    for (let index = 0; index < 5; index += 1) {
      const weeklyCampaignProof = freshWeeklyProof(baseCreatedAt + index);
      const response = await request({
        guestToken: originalGuest,
        body: {
          action: 'start',
          walletAddress: null,
          runMode: 'weekly-streak',
          weeklyCampaignProof
        }
      });
      assert.equal(response.statusCode, 200, JSON.stringify(response.body));
      assert.equal(response.body.weeklyAttempt.attemptNumber, index + 1);
      assert.equal(response.body.weeklyAttempt.attemptsRemaining, 4 - index);
      if (index === 0) {
        firstProof = weeklyCampaignProof;
        firstRunId = response.body.runId;
      }
    }

    const lostResponseRetry = await request({
      guestToken: originalGuest,
      body: {
        action: 'start',
        walletAddress: null,
        runMode: 'weekly-streak',
        weeklyCampaignProof: firstProof
      }
    });
    assert.equal(lostResponseRetry.statusCode, 200);
    assert.equal(lostResponseRetry.body.runId, firstRunId);
    assert.equal(lostResponseRetry.body.weeklyAttempt.attemptNumber, 1);
    assert.equal(lostResponseRetry.body.weeklyAttempt.attemptsRemaining, 0);

    const bypassAttempt = await request({
      guestToken: rotatedGuest,
      body: {
        action: 'start',
        walletAddress: null,
        runMode: 'weekly-streak',
        weeklyCampaignProof: freshWeeklyProof(baseCreatedAt + 10)
      }
    });

    assert.equal(bypassAttempt.statusCode, 409);
    assert.deepEqual(bypassAttempt.body.details, ['weekly_run_attempts_exhausted']);
    assert.equal(bypassAttempt.body.runId, undefined);
    assert.equal(bypassAttempt.body.startToken, undefined);

    const ordinaryGuestPlay = await request({
      guestToken: rotatedGuest,
      body: {
        action: 'start',
        walletAddress: null,
        runMode: 'standard'
      }
    });
    assert.equal(ordinaryGuestPlay.statusCode, 200);
    assert.equal(ordinaryGuestPlay.body.identity.kind, 'guest');
  } finally {
    clearWeeklyRunAttemptMemoryForTests();
  }
});

test('the production migration separates quota scope from exact guest ownership', () => {
  const sql = fs.readFileSync(path.join(
    root,
    'supabase',
    'migrations',
    '20260823090000_bind_weekly_guest_admission_scope.sql'
  ), 'utf8');

  assert.match(sql, /owner_identity_hash text/);
  assert.match(sql, /set owner_identity_hash = identity_hash/);
  assert.match(sql, /p_owner_identity_hash text default null/);
  assert.match(sql, /where identity_hash = p_identity_hash[\s\S]*v_existing\.owner_identity_hash <> v_owner_identity_hash/);
  assert.match(sql, /v_attempt\.owner_identity_hash <> p_identity_hash/);
  assert.match(sql, /notify pgrst, 'reload schema'/);
});
