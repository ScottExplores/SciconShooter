const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'event-attempt-limit-test-secret-with-enough-entropy';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

const root = path.resolve(__dirname, '..');
const {
  getWeeklyBoundaryMeta,
  resolveRunAttemptPolicy,
  SCICON_EVENT_ATTEMPT_SCOPE_ID
} = require('../shared/weeklyCompetitionBoundary');
const { createReservedRunStart } = require('../api/_lib/runReceipts');
const { clearWeeklyRunAttemptMemoryForTests, getWeeklyRunQuota } = require('../api/_lib/weeklyRunAttempts');
const { DEFAULT_FOUNDER_WALLET } = require('../api/_lib/founderWallet');

const browserBundle = esbuild.buildSync({
  stdin: {
    contents: [
      "export * as graph from './services/campaignGraph.ts';",
      "export * as streak from './services/weeklyCampaignStreak.ts';",
      "export * as generator from './services/weeklyRunGenerator.ts';"
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'event-attempt-limit-entry.ts'
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

const freshProof = (now) => {
  const week = getWeeklyBoundaryMeta(new Date(now));
  const run = browser.generator.buildWeeklyRunCampaign(week.weekKey, undefined, 1);
  const graph = browser.graph.createCampaignGraphIndex(run);
  return browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: week.weekKey,
    resetAtMs: week.endsAt.getTime(),
    startNodeId: graph.definition.entryNodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: now - 1_000
  });
};

const startGuest = (proof, guestIdentityId) => createReservedRunStart('event-attempt-test', {
  runMode: 'weekly-streak',
  profileId: `pilot:event-${proof.createdAtMs}`,
  guestIdentityId,
  weeklyCampaignProof: proof,
  nowMs: proof.updatedAtMs + 1
});

test('the event server grants ten tries once, across weeks, without replay or parallel extras', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const weekOne = Date.parse('2026-10-27T18:00:00.000Z');
  const weekTwo = Date.parse('2026-11-03T18:00:00.000Z');
  const policy = resolveRunAttemptPolicy(weekOne);
  assert.equal(policy.eventWide, true);
  assert.equal(policy.freeAttempts, 10);
  assert.equal(policy.scopeId, SCICON_EVENT_ATTEMPT_SCOPE_ID);
  assert.equal(resolveRunAttemptPolicy(weekTwo).scopeId, policy.scopeId);

  const guestIdentityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const firstProof = freshProof(weekOne);
  const [first, replay] = await Promise.all([
    startGuest(firstProof, guestIdentityId),
    startGuest(firstProof, guestIdentityId)
  ]);
  assert.equal(first.runId, replay.runId);
  assert.equal(first.weeklyAttempt.weeklyId, policy.scopeId);
  assert.equal(first.weeklyAttempt.attemptsRemaining, 9);
  assert.equal(first.testRun, false);

  for (let index = 1; index < 6; index += 1) {
    const admitted = await startGuest(freshProof(weekOne + index * 2_000), guestIdentityId);
    assert.equal(admitted.weeklyAttempt.attemptNumber, index + 1);
  }

  for (let index = 0; index < 4; index += 1) {
    const admitted = await startGuest(freshProof(weekTwo + index * 2_000), guestIdentityId);
    assert.equal(admitted.weeklyAttempt.attemptsRemaining, 3 - index);
    assert.equal(admitted.weeklyAttempt.weeklyId, policy.scopeId);
  }

  const sameProofRetry = await startGuest(firstProof, guestIdentityId);
  assert.equal(sameProofRetry.runId, first.runId);
  assert.equal(sameProofRetry.weeklyAttempt.attemptsRemaining, 0);

  await assert.rejects(
    () => startGuest(freshProof(weekTwo + 20_000), guestIdentityId),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.deepEqual(error.details, ['weekly_run_attempts_exhausted']);
      return true;
    }
  );

  clearWeeklyRunAttemptMemoryForTests();
  const parallelProofs = Array.from({ length: 12 }, (_, index) => freshProof(weekOne + 30_000 + index * 2_000));
  const parallel = await Promise.allSettled(parallelProofs.map((proof) => startGuest(proof, guestIdentityId)));
  const admitted = parallel.filter((result) => result.status === 'fulfilled');
  const rejected = parallel.filter((result) => result.status === 'rejected');
  assert.equal(admitted.length, 10);
  assert.equal(rejected.length, 2);
  rejected.forEach((result) => {
    assert.equal(result.reason.statusCode, 409);
    assert.deepEqual(result.reason.details, ['weekly_run_attempts_exhausted']);
  });
});

test('the founder wallet is unlimited and does not spend a competitive try', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const now = Date.parse('2026-10-27T18:00:00.000Z');
  const guestIdentityId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const competitor = await startGuest(freshProof(now), guestIdentityId);
  assert.equal(competitor.weeklyAttempt.attemptsRemaining, 9);

  for (let index = 0; index < 12; index += 1) {
    const founderStart = await createReservedRunStart('event-attempt-test', {
      runMode: 'weekly-streak',
      profileId: `wallet:${DEFAULT_FOUNDER_WALLET}`,
      walletSession: {
        walletAddress: DEFAULT_FOUNDER_WALLET,
        profileId: `wallet:${DEFAULT_FOUNDER_WALLET}`
      },
      weeklyCampaignProof: freshProof(now + 40_000 + index * 2_000),
      nowMs: now + 40_000 + index * 2_000
    });
    assert.equal(founderStart.testRun, true);
    assert.equal(founderStart.weeklyAttempt, undefined);
  }

  const competitorAgain = await startGuest(freshProof(now + 80_000), guestIdentityId);
  assert.equal(competitorAgain.weeklyAttempt.attemptNumber, 2);
  assert.equal(competitorAgain.weeklyAttempt.attemptsRemaining, 8);
  const quota = await getWeeklyRunQuota({
    address: '0x5555555555555555555555555555555555555555',
    now
  });
  assert.equal(quota.freeAttempts, 10);
  assert.equal(quota.weeklyId, SCICON_EVENT_ATTEMPT_SCOPE_ID);
  assert.equal(quota.attemptsRemaining, 10);
});

test('the database reservation counts the whole event and still locks parallel starts', () => {
  const sql = fs.readFileSync(path.join(root, 'supabase', 'base-native-readiness.sql'), 'utf8');
  const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20261027160000_event_attempt_cap.sql'),
    'utf8'
  );
  const policy = resolveRunAttemptPolicy('2026-10-27T18:00:00.000Z');
  for (const source of [sql, migration]) {
    assert.match(source, /p_weekly_id = 'scicon-25k-high-score'/);
    assert.match(source, /v_free_attempts := 10/);
    assert.match(source, /v_attempt_capacity := 10/);
    assert.match(source, /weekly_id = any\(v_scope_ids\)/);
    assert.match(source, /pg_advisory_xact_lock/);
    policy.countedScopeIds.forEach((scopeId) => {
      assert.match(source, new RegExp(scopeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }
  assert.match(sql, /v_attempt_capacity := least\(32767, 5 \+ v_purchased_attempts\)/);
});
