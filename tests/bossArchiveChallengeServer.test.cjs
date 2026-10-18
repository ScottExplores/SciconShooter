const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.WALLET_PROFILE_AUTH_SECRET = 'boss-archive-server-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const campaign = require('../game-config/campaign.json');
const {
  preserveBossArchiveServerState,
  sanitizeWalletSnapshot
} = require('../api/_lib/walletProfiles');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
const {
  BOSS_ARCHIVE_DAILY_LIMIT,
  createBossArchiveChallengeRun,
  settleBossArchiveChallengeRun,
  verifyBossArchiveChallengeRun
} = require('../api/_lib/bossArchiveChallenges');

const WALLET = '0x5555555555555555555555555555555555555555';
const NOW = Date.parse('2026-07-26T12:00:00.000Z');
const EVENT_ID = campaign.levels
  .flatMap((level) => level.waves.flatMap((wave) => wave.events))
  .find((event) => event.kind === 'boss' && event.bossId === 'gatekeeper-prime')?.id;

assert.ok(EVENT_ID, 'the canonical Gatekeeper Prime encounter must remain authored');

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data == null ? '' : JSON.stringify(data); }
});

const createProfileRow = () => ({
  wallet_address: WALLET,
  revision: 1,
  snapshot: sanitizeWalletSnapshot({
    permanentState: {
      bossArchive: {
        unlockedEventIds: [EVENT_ID],
        seenEventIds: [EVENT_ID]
      }
    },
    weeklyState: {
      weekKey: getWeeklyBoundaryMeta(new Date(NOW)).weekKey,
      coins: 25
    },
    selectedShipId: 'researchhub'
  }, WALLET, NOW),
  updated_at: new Date(NOW).toISOString()
});

test('a signed Boss Archive run settles once and an expired retry restores the ledger result', async (t) => {
  const originalFetch = global.fetch;
  const profileRow = createProfileRow();
  const results = new Map();
  const rpcCalls = [];

  global.fetch = async (url, options = {}) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const parsed = new URL(String(url));
    const resource = parsed.pathname.split('/').pop();
    const body = options.body ? JSON.parse(options.body) : null;

    if (resource === 'scicon_wallet_profiles') {
      return jsonResponse([profileRow]);
    }
    if (resource === 'scicon_boss_archive_challenge_results') {
      const resultId = String(parsed.searchParams.get('result_id') || '').replace(/^eq\./, '');
      const utcDate = String(parsed.searchParams.get('utc_date') || '').replace(/^eq\./, '');
      const rows = [...results.values()].filter((row) => (
        (!resultId || row.result_id === resultId)
        && (!utcDate || row.utc_date === utcDate)
      ));
      return jsonResponse(rows);
    }
    if (resource === 'scicon_settle_boss_archive_challenge') {
      rpcCalls.push(body);
      const existing = results.get(body.p_result_id);
      if (existing) {
        return jsonResponse({
          accepted: true,
          duplicate: true,
          resultId: existing.result_id,
          eventId: existing.event_id,
          variantId: existing.variant_id,
          rewardCoins: existing.reward_coins,
          chargesRemaining: BOSS_ARCHIVE_DAILY_LIMIT - results.size,
          clearTimeMs: existing.clear_time_ms,
          damageTaken: existing.damage_taken,
          noHit: existing.no_hit,
          newBestClearTime: existing.new_best_clear_time,
          newBestChallengeTime: existing.new_best_challenge_time,
          newlyCompletedObjectiveIds: existing.newly_completed_objective_ids,
          utcDateKey: existing.utc_date
        });
      }
      const row = {
        result_id: body.p_result_id,
        event_id: body.p_event_id,
        variant_id: body.p_variant_id,
        utc_date: '2026-07-26',
        clear_time_ms: body.p_clear_time_ms,
        damage_taken: body.p_damage_taken,
        no_hit: body.p_damage_taken === 0,
        reward_coins: body.p_reward_coins,
        new_best_clear_time: true,
        new_best_challenge_time: true,
        newly_completed_objective_ids: ['challenge-clear', 'no-hit-clear', 'timed-clear']
      };
      results.set(row.result_id, row);
      profileRow.revision += 1;
      profileRow.snapshot.weeklyState.coins += row.reward_coins;
      profileRow.snapshot.permanentState.bossArchive.dailyChallenge = {
        utcDateKey: row.utc_date,
        successfulClearsUsed: 1,
        processedClearIds: [`boss-archive:${row.result_id}`]
      };
      return jsonResponse({
        accepted: true,
        duplicate: false,
        resultId: row.result_id,
        eventId: row.event_id,
        variantId: row.variant_id,
        rewardCoins: row.reward_coins,
        chargesRemaining: 2,
        clearTimeMs: row.clear_time_ms,
        damageTaken: row.damage_taken,
        noHit: row.no_hit,
        newBestClearTime: true,
        newBestChallengeTime: true,
        newlyCompletedObjectiveIds: row.newly_completed_objective_ids,
        utcDateKey: row.utc_date
      });
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const run = await createBossArchiveChallengeRun({
    address: WALLET,
    eventId: EVENT_ID,
    variantId: 'standard',
    now: NOW
  });
  const verified = verifyBossArchiveChallengeRun(run.runToken, WALLET, NOW + 1);
  assert.equal(verified.runId, run.runId);
  assert.equal(verified.eventId, EVENT_ID);

  const first = await settleBossArchiveChallengeRun({
    address: WALLET,
    runToken: run.runToken,
    victory: true,
    clearTimeMs: 10_000,
    damageTaken: 0,
    now: NOW + 10_000
  });
  assert.equal(first.settlement.duplicate, false);
  assert.equal(first.settlement.rewardCoins, 100);
  assert.equal(first.settlement.chargesRemaining, 2);
  assert.equal(first.profile.revision, 2);
  assert.equal(first.profile.snapshot.weeklyState.coins, 125);
  assert.deepEqual(first.settlement.newlyCompletedObjectiveIds, [
    'challenge-clear',
    'no-hit-clear',
    'timed-clear'
  ]);
  assert.equal(rpcCalls.length, 1);
  assert.deepEqual(Object.keys(rpcCalls[0]).sort(), [
    'p_clear_time_ms',
    'p_daily_limit',
    'p_damage_taken',
    'p_event_id',
    'p_result_id',
    'p_reward_coins',
    'p_timed_target_ms',
    'p_variant_id',
    'p_wallet_address',
    'p_week_key'
  ]);

  const replay = await settleBossArchiveChallengeRun({
    address: WALLET,
    runToken: run.runToken,
    victory: true,
    clearTimeMs: 10_000,
    damageTaken: 0,
    now: NOW + 2 * 60 * 60 * 1000
  });
  assert.equal(replay.settlement.duplicate, true);
  assert.equal(replay.settlement.rewardCoins, 100);
  assert.equal(replay.profile.revision, 2);
  assert.equal(replay.profile.snapshot.weeklyState.coins, 125);
  assert.deepEqual(
    replay.settlement.newlyCompletedObjectiveIds,
    [],
    'replaying a settled result must not announce old mastery completions again'
  );
  assert.equal(rpcCalls.length, 1);
});

test('Challenge tokens are wallet-bound and failed outcomes cannot reach settlement', async (t) => {
  const originalFetch = global.fetch;
  const profileRow = createProfileRow();
  let rpcCalls = 0;
  global.fetch = async (url) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const resource = new URL(String(url)).pathname.split('/').pop();
    if (resource === 'scicon_wallet_profiles') return jsonResponse([profileRow]);
    if (resource === 'scicon_boss_archive_challenge_results') return jsonResponse([]);
    if (resource === 'scicon_settle_boss_archive_challenge') {
      rpcCalls += 1;
      return jsonResponse({});
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const run = await createBossArchiveChallengeRun({ address: WALLET, eventId: EVENT_ID, now: NOW });
  const [encoded, signature] = run.runToken.split('.');
  const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  assert.throws(
    () => verifyBossArchiveChallengeRun(
      `${encoded}.${tamperedSignature}`,
      WALLET,
      NOW + 1
    ),
    /authorization is invalid/
  );
  assert.throws(
    () => verifyBossArchiveChallengeRun(
      run.runToken,
      '0x6666666666666666666666666666666666666666',
      NOW + 1
    ),
    /invalid or expired/
  );
  await assert.rejects(
    settleBossArchiveChallengeRun({
      address: WALLET,
      runToken: run.runToken,
      victory: false,
      clearTimeMs: 10_000,
      damageTaken: 1,
      now: NOW + 10_000
    }),
    /successful Challenge clear/
  );
  assert.equal(rpcCalls, 0);
});

test('the database remains authoritative when another clear consumes the last daily charge', async (t) => {
  const originalFetch = global.fetch;
  const profileRow = createProfileRow();
  global.fetch = async (url) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const resource = new URL(String(url)).pathname.split('/').pop();
    if (resource === 'scicon_wallet_profiles') return jsonResponse([profileRow]);
    if (resource === 'scicon_boss_archive_challenge_results') return jsonResponse([]);
    if (resource === 'scicon_settle_boss_archive_challenge') {
      return jsonResponse({ message: 'boss_archive_no_charges' }, 400);
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const run = await createBossArchiveChallengeRun({ address: WALLET, eventId: EVENT_ID, now: NOW });
  await assert.rejects(
    settleBossArchiveChallengeRun({
      address: WALLET,
      runToken: run.runToken,
      victory: true,
      clearTimeMs: 10_000,
      damageTaken: 1,
      now: NOW + 10_000
    }),
    (error) => error?.code === 'no_charges' && error?.statusCode === 409
  );
});

test('Challenge start rejects bosses not present in the canonical wallet profile', async (t) => {
  const originalFetch = global.fetch;
  const profileRow = createProfileRow();
  profileRow.snapshot.permanentState.bossArchive.unlockedEventIds = [];
  global.fetch = async (url) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const resource = new URL(String(url)).pathname.split('/').pop();
    if (resource === 'scicon_wallet_profiles') return jsonResponse([profileRow]);
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  await assert.rejects(
    createBossArchiveChallengeRun({ address: WALLET, eventId: EVENT_ID, now: NOW }),
    (error) => error?.code === 'boss_locked' && error?.statusCode === 403
  );
});

test('three starts consume all daily charges even when no fight is settled', async (t) => {
  const originalFetch = global.fetch;
  let profileRow = createProfileRow();
  global.fetch = async (url, options = {}) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const parsed = new URL(String(url));
    const resource = parsed.pathname.split('/').pop();
    if (resource === 'scicon_wallet_profiles') {
      if (String(options.method || 'GET').toUpperCase() === 'PATCH') {
        const body = JSON.parse(options.body || '{}');
        const requestedRevision = Number(
          String(parsed.searchParams.get('revision') || '').replace(/^eq\./, '')
        );
        if (requestedRevision !== profileRow.revision) return jsonResponse([]);
        profileRow = {
          ...profileRow,
          revision: body.revision,
          snapshot: body.snapshot,
          updated_at: body.updated_at
        };
      }
      return jsonResponse([profileRow]);
    }
    if (resource === 'scicon_boss_archive_challenge_results') return jsonResponse([]);
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const difficulties = ['easy', 'medium', 'heroic'];
  for (let index = 0; index < difficulties.length; index += 1) {
    const suffix = String(index + 1).padStart(12, '0');
    const started = await createBossArchiveChallengeRun({
      address: WALLET,
      eventId: EVENT_ID,
      difficultyId: difficulties[index],
      attemptId: `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`,
      now: NOW + index
    });
    assert.equal(started.chargesRemaining, 2 - index);
    assert.equal(started.profile.snapshot.permanentState.bossArchive.dailyAttempts.attemptsUsed, index + 1);
  }

  const archive = profileRow.snapshot.permanentState.bossArchive;
  assert.equal(archive.dailyAttempts.attemptsUsed, 3);
  assert.equal(archive.records[EVENT_ID].difficultyRecords.easy.attempts, 1);
  assert.equal(archive.records[EVENT_ID].difficultyRecords.medium.attempts, 1);
  assert.equal(archive.records[EVENT_ID].difficultyRecords.heroic.attempts, 1);
  await assert.rejects(
    createBossArchiveChallengeRun({
      address: WALLET,
      eventId: EVENT_ID,
      difficultyId: 'medium',
      attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000004',
      now: NOW + 4
    }),
    (error) => error?.code === 'no_charges' && error?.statusCode === 409
  );
});

test('settlement rows do not consume launch charges for the current UTC day', async (t) => {
  const originalFetch = global.fetch;
  let profileRow = createProfileRow();
  profileRow.snapshot.permanentState.bossArchive.dailyChallenge.successfulClearsUsed = 0;
  let resultLedgerReads = 0;
  global.fetch = async (url, options = {}) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const parsed = new URL(String(url));
    const resource = parsed.pathname.split('/').pop();
    if (resource === 'scicon_wallet_profiles') {
      if (String(options.method || 'GET').toUpperCase() === 'PATCH') {
        const body = JSON.parse(options.body || '{}');
        profileRow = {
          ...profileRow,
          revision: body.revision,
          snapshot: body.snapshot,
          updated_at: body.updated_at
        };
      }
      return jsonResponse([profileRow]);
    }
    if (resource === 'scicon_boss_archive_challenge_results') {
      resultLedgerReads += 1;
      return jsonResponse([
        { result_id: '11111111-1111-4111-8111-111111111111' },
        { result_id: '22222222-2222-4222-8222-222222222222' },
        { result_id: '33333333-3333-4333-8333-333333333333' }
      ]);
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  t.after(() => { global.fetch = originalFetch; });

  const started = await createBossArchiveChallengeRun({
    address: WALLET,
    eventId: EVENT_ID,
    attemptId: 'cccccccc-cccc-4ccc-8ccc-000000000001',
    now: NOW
  });
  assert.equal(started.chargesRemaining, 2);
  assert.equal(started.profile.snapshot.permanentState.bossArchive.dailyAttempts.attemptsUsed, 1);
  assert.equal(resultLedgerReads, 0);
});

test('ordinary profile saves preserve canonical Challenge records without deriving attempts from clears', () => {
  const current = createProfileRow().snapshot;
  current.permanentState.bossArchive.records[EVENT_ID] = {
    attempts: 1,
    practiceAttempts: 0,
    challengeAttempts: 1,
    totalClears: 1,
    practiceClears: 0,
    challengeClears: 1,
    noHitClears: 1,
    bestClearTimeMs: 10_000,
    bestChallengeTimeMs: 10_000,
    bestNoHitTimeMs: 10_000,
    mastery: {
      'challenge-clear': { completedAt: '2026-07-26T12:00:10.000Z', claimedAt: null },
      'no-hit-clear': { completedAt: null, claimedAt: null },
      'timed-clear': { completedAt: null, claimedAt: null }
    },
    processedResultIds: ['boss-archive:11111111-1111-4111-8111-111111111111'],
    lastResult: {
      mode: 'challenge',
      victory: true,
      clearTimeMs: 10_000,
      damageTaken: 0,
      playedAt: '2026-07-26T12:00:10.000Z'
    }
  };
  current.permanentState.bossArchive.dailyChallenge = {
    utcDateKey: '2026-07-26',
    successfulClearsUsed: 1,
    processedClearIds: ['boss-archive:11111111-1111-4111-8111-111111111111']
  };
  const incoming = structuredClone(current);
  incoming.permanentState.bossArchive.records = {};
  incoming.permanentState.bossArchive.dailyChallenge.successfulClearsUsed = 0;
  incoming.permanentState.bossArchive.dailyChallenge.processedClearIds = [];

  const protectedSnapshot = preserveBossArchiveServerState({
    currentSnapshot: current,
    incomingSnapshot: incoming,
    dailyLedger: [{ result_id: '11111111-1111-4111-8111-111111111111' }],
    now: NOW
  });
  assert.equal(
    protectedSnapshot.permanentState.bossArchive.records[EVENT_ID].challengeClears,
    1
  );
  assert.equal(
    protectedSnapshot.permanentState.bossArchive.dailyChallenge.successfulClearsUsed,
    1
  );
  assert.deepEqual(
    protectedSnapshot.permanentState.bossArchive.dailyChallenge.processedClearIds,
    ['boss-archive:11111111-1111-4111-8111-111111111111']
  );
  assert.equal(
    protectedSnapshot.permanentState.bossArchive.dailyAttempts.attemptsUsed,
    0
  );

  const forged = structuredClone(current);
  const forgedRecord = forged.permanentState.bossArchive.records[EVENT_ID];
  forgedRecord.attempts = 999;
  forgedRecord.practiceAttempts = 7;
  forgedRecord.challengeAttempts = 999;
  forgedRecord.totalClears = 999;
  forgedRecord.practiceClears = 6;
  forgedRecord.challengeClears = 999;
  forgedRecord.bestChallengeTimeMs = 1;
  forgedRecord.mastery['challenge-clear'].claimedAt = '2026-07-26T12:01:00.000Z';
  forgedRecord.mastery['no-hit-clear'].completedAt = '2026-07-26T12:01:00.000Z';
  forgedRecord.mastery['timed-clear'].completedAt = '2026-07-26T12:01:00.000Z';
  forgedRecord.processedResultIds.push('boss-archive:forged-client-result');
  forgedRecord.lastResult = {
    mode: 'challenge',
    victory: true,
    clearTimeMs: 1,
    damageTaken: 0,
    playedAt: '2026-07-26T12:01:00.000Z'
  };
  const serverProtected = preserveBossArchiveServerState({
    currentSnapshot: current,
    incomingSnapshot: forged,
    dailyLedger: [{ result_id: '11111111-1111-4111-8111-111111111111' }],
    now: NOW
  });
  const protectedRecord = serverProtected.permanentState.bossArchive.records[EVENT_ID];
  assert.equal(protectedRecord.practiceAttempts, 7);
  assert.equal(protectedRecord.practiceClears, 6);
  assert.equal(protectedRecord.attempts, 8);
  assert.equal(protectedRecord.totalClears, 7);
  assert.equal(protectedRecord.challengeAttempts, 1);
  assert.equal(protectedRecord.challengeClears, 1);
  assert.equal(protectedRecord.bestChallengeTimeMs, 10_000);
  assert.equal(protectedRecord.mastery['challenge-clear'].claimedAt, '2026-07-26T12:01:00.000Z');
  assert.equal(protectedRecord.mastery['no-hit-clear'].completedAt, null);
  assert.equal(protectedRecord.mastery['timed-clear'].completedAt, null);
  assert.deepEqual(
    protectedRecord.processedResultIds,
    ['boss-archive:11111111-1111-4111-8111-111111111111']
  );
  assert.equal(protectedRecord.lastResult.clearTimeMs, 10_000);
});

test('a launch retry across UTC reset keeps its receipt and spends no fresh charge', async (t) => {
  const originalFetch = global.fetch;
  let profileRow = createProfileRow();
  let patchCount = 0;
  global.fetch = async (url, options = {}) => {
    // REVAMP(G): D reads the authoritative paid reserve when hydrating a profile.
    if (String(url).includes('scicon_wallet_entitlements?')) return jsonResponse([{ purchased_tokens_available: 0 }]);
    const parsed = new URL(String(url));
    const resource = parsed.pathname.split('/').pop();
    if (resource !== 'scicon_wallet_profiles') {
      throw new Error(`Unexpected Supabase request: ${url}`);
    }
    if (String(options.method || 'GET').toUpperCase() === 'PATCH') {
      patchCount += 1;
      const body = JSON.parse(options.body || '{}');
      const requestedRevision = Number(
        String(parsed.searchParams.get('revision') || '').replace(/^eq\./, '')
      );
      if (requestedRevision !== profileRow.revision) return jsonResponse([]);
      profileRow = {
        ...profileRow,
        revision: body.revision,
        snapshot: body.snapshot,
        updated_at: body.updated_at
      };
    }
    return jsonResponse([profileRow]);
  };
  t.after(() => { global.fetch = originalFetch; });

  const attemptId = 'dddddddd-dddd-4ddd-8ddd-000000000001';
  const beforeReset = Date.parse('2026-07-26T23:59:50.000Z');
  const afterReset = Date.parse('2026-07-27T00:00:05.000Z');
  const first = await createBossArchiveChallengeRun({
    address: WALLET,
    eventId: EVENT_ID,
    difficultyId: 'heroic',
    attemptId,
    now: beforeReset
  });
  const retry = await createBossArchiveChallengeRun({
    address: WALLET,
    eventId: EVENT_ID,
    difficultyId: 'heroic',
    attemptId,
    now: afterReset
  });

  assert.equal(retry.runId, first.runId);
  assert.equal(retry.chargesRemaining, 3);
  assert.equal(retry.profile.snapshot.permanentState.bossArchive.dailyAttempts.attemptsUsed, 0);
  assert.equal(patchCount, 1);
});
