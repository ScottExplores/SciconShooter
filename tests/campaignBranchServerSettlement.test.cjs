const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.WALLET_PROFILE_AUTH_SECRET = 'campaign-branch-server-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const campaign = require('../game-config/campaign.json');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
const {
  preserveCampaignBranchServerState,
  sanitizeWalletSnapshot
} = require('../api/_lib/walletProfiles');
const {
  authoredCounts,
  createCampaignBranchAttempt,
  settleCampaignBranchAttempt,
  verifyCampaignBranchAttempt
} = require('../api/_lib/campaignBranchRuns');

const WALLET = '0x7777777777777777777777777777777777777777';
const OTHER_WALLET = '0x8888888888888888888888888888888888888888';
const NOW = Date.parse('2026-07-27T12:00:00.000Z');
const BRANCH = campaign.campaignBranches.find((branch) => branch.missionType === 'present-drop');
const COMBAT_BRANCH = campaign.campaignBranches.find((branch) => branch.missionType !== 'present-drop');

assert.ok(BRANCH, 'the canonical Campaign must include Present Drop');
assert.ok(COMBAT_BRANCH, 'the canonical Campaign must include a combat branch');

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data == null ? '' : JSON.stringify(data); }
});

const createProfileRow = ({
  unlocked = true,
  claimed = false,
  founderLocked = false,
  branch = BRANCH
} = {}) => ({
  wallet_address: WALLET,
  revision: 1,
  snapshot: sanitizeWalletSnapshot({
    permanentState: {
      campaignProgress: {
        missionRecords: unlocked ? {
          [branch.sourceMissionId]: { completed: true, stars: 3 }
        } : {},
        branchProgress: {
          founderLockedBranchIds: founderLocked ? [branch.branchId] : [],
          claimedBranchIds: claimed ? [branch.branchId] : []
        }
      }
    },
    weeklyState: {
      weekKey: getWeeklyBoundaryMeta(new Date(NOW)).weekKey,
      coins: 25,
      durableCampaignCoins: 0
    },
    stats: { totalCoins: 25 },
    selectedShipId: 'researchhub'
  }, WALLET, NOW),
  updated_at: new Date(NOW).toISOString()
});

const installProfileFetch = (t, profileRow) => {
  const originalFetch = global.fetch;
  let patchCount = 0;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const resource = parsed.pathname.split('/').pop();
    if (resource !== 'scicon_wallet_profiles') {
      throw new Error(`Unexpected Supabase request: ${url}`);
    }
    if (options.method === 'PATCH') {
      const expectedRevision = Number(
        String(parsed.searchParams.get('revision') || '').replace(/^eq\./, '')
      );
      if (expectedRevision !== profileRow.revision) return jsonResponse([]);
      Object.assign(profileRow, JSON.parse(options.body));
      patchCount += 1;
      return jsonResponse([profileRow]);
    }
    return jsonResponse([profileRow]);
  };
  t.after(() => { global.fetch = originalFetch; });
  return { get patchCount() { return patchCount; } };
};

test('Present Drop attempt tokens are signed, wallet-bound, and bound to authored duration', async (t) => {
  const profileRow = createProfileRow();
  installProfileFetch(t, profileRow);
  const attempt = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: BRANCH.branchId,
    now: NOW
  });
  assert.equal(attempt.branchId, BRANCH.branchId);
  assert.equal(attempt.durationMs, BRANCH.missionDefinition.durationSeconds * 1000);
  const verified = verifyCampaignBranchAttempt(attempt.attemptToken, WALLET, NOW + 1);
  assert.equal(verified.attemptId, attempt.attemptId);
  assert.equal(verified.durationMs, attempt.durationMs);
  assert.throws(
    () => verifyCampaignBranchAttempt(attempt.attemptToken, OTHER_WALLET, NOW + 1),
    /invalid or expired/
  );
  const [encoded, signature] = attempt.attemptToken.split('.');
  const tampered = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  assert.throws(
    () => verifyCampaignBranchAttempt(`${encoded}.${tampered}`, WALLET, NOW + 1),
    /authorization is invalid/
  );
});

test('every canonical configured Campaign branch can issue a wallet-bound attempt', async (t) => {
  const profileRow = createProfileRow();
  profileRow.snapshot.permanentState.campaignProgress.branchProgress.unlockedBranchIds = (
    campaign.campaignBranches.map((branch) => branch.branchId)
  );
  installProfileFetch(t, profileRow);

  for (const branch of campaign.campaignBranches) {
    const attempt = await createCampaignBranchAttempt({
      address: WALLET,
      branchId: branch.branchId,
      now: NOW
    });
    assert.equal(attempt.branchId, branch.branchId);
    assert.equal(attempt.missionType, branch.missionType);
    assert.equal(
      attempt.branchKind,
      branch.missionType === 'present-drop' ? 'present-drop' : 'combat'
    );
    assert.equal(
      verifyCampaignBranchAttempt(attempt.attemptToken, WALLET, NOW + 1).branch.branchId,
      branch.branchId
    );
  }
});

test('successful Present Drop settlement rejects forged totals and credits one stable receipt exactly once', async (t) => {
  const profileRow = createProfileRow();
  const fetchState = installProfileFetch(t, profileRow);
  const attempt = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: BRANCH.branchId,
    now: NOW
  });
  await assert.rejects(
    settleCampaignBranchAttempt({
      address: WALLET,
      attemptToken: attempt.attemptToken,
      outcome: 'success',
      destroyedByType: { standard: 999, armored: 999, fast: 999, golden: 999 },
      collectedPresentCoins: 999_999,
      now: NOW + attempt.durationMs - 1
    }),
    (error) => error?.code === 'branch_timing_invalid'
  );

  await assert.rejects(
    settleCampaignBranchAttempt({
      address: WALLET,
      attemptToken: attempt.attemptToken,
      outcome: 'success',
      destroyedByType: { standard: 999, armored: 999, fast: 999, golden: 999 },
      collectedPresentCoins: 999_999,
      now: NOW + attempt.durationMs
    }),
    (error) => error?.code === 'branch_result_invalid'
  );

  await assert.rejects(
    settleCampaignBranchAttempt({
      address: WALLET,
      attemptToken: attempt.attemptToken,
      outcome: 'success',
      destroyedByType: { standard: 1, armored: 0, fast: 0, golden: 0 },
      collectedPresentCoins: 5,
      now: NOW + attempt.durationMs
    }),
    (error) => error?.code === 'branch_result_invalid'
  );

  const first = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'success',
    destroyedByType: authoredCounts(BRANCH),
    collectedPresentCoins: 257,
    now: NOW + attempt.durationMs
  });
  assert.equal(first.settlement.duplicate, false);
  assert.deepEqual(first.settlement.destroyedByType, authoredCounts(BRANCH));
  assert.equal(first.settlement.performanceCoins, 257);
  assert.equal(first.settlement.coinsAwarded, 377);
  assert.equal(first.settlement.claimed, true);
  assert.equal(first.profile.snapshot.weeklyState.coins, 402);
  assert.equal(first.profile.snapshot.weeklyState.durableCampaignCoins, 377);
  assert.equal(first.profile.snapshot.stats.totalCoins, 402);
  assert.deepEqual(
    first.profile.snapshot.permanentState.campaignProgress.branchProgress.claimedBranchIds,
    [BRANCH.branchId]
  );
  assert.equal(fetchState.patchCount, 1);

  const replay = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'success',
    destroyedByType: { standard: 1 },
    collectedPresentCoins: 1,
    now: NOW + attempt.durationMs + 1
  });
  assert.equal(replay.settlement.duplicate, true);
  assert.equal(replay.settlement.coinsAwarded, 377);
  assert.equal(replay.settlement.rewardReceiptId, first.settlement.rewardReceiptId);
  assert.equal(replay.profile.snapshot.weeklyState.coins, 402);
  assert.equal(fetchState.patchCount, 1);
});

test('connected combat branch success requires authored timing and explicit completion proof, then awards only its fixed reward once', async (t) => {
  const profileRow = createProfileRow({ branch: COMBAT_BRANCH });
  const fetchState = installProfileFetch(t, profileRow);
  const attempt = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: COMBAT_BRANCH.branchId,
    now: NOW
  });
  const objectiveMaximum = COMBAT_BRANCH.missionDefinition.events.length;
  const fixedReward = COMBAT_BRANCH.completionReward.baseCoins
    + COMBAT_BRANCH.completionReward.oneTimeBonusCoins;

  assert.equal(attempt.branchKind, 'combat');
  assert.equal(attempt.missionType, COMBAT_BRANCH.missionType);
  assert.equal(attempt.durationMs, COMBAT_BRANCH.missionDefinition.durationSeconds * 1000);
  assert.equal(
    verifyCampaignBranchAttempt(attempt.attemptToken, WALLET, NOW + 1).branch.branchId,
    COMBAT_BRANCH.branchId
  );

  await assert.rejects(
    settleCampaignBranchAttempt({
      address: WALLET,
      attemptToken: attempt.attemptToken,
      outcome: 'success',
      stageComplete: true,
      objectiveUnitsCompleted: objectiveMaximum,
      now: NOW + attempt.durationMs - 1
    }),
    (error) => error?.code === 'branch_timing_invalid'
  );
  await assert.rejects(
    settleCampaignBranchAttempt({
      address: WALLET,
      attemptToken: attempt.attemptToken,
      outcome: 'success',
      stageComplete: false,
      objectiveUnitsCompleted: objectiveMaximum,
      now: NOW + attempt.durationMs
    }),
    (error) => error?.code === 'branch_result_invalid'
  );
  await assert.rejects(
    settleCampaignBranchAttempt({
      address: WALLET,
      attemptToken: attempt.attemptToken,
      outcome: 'success',
      stageComplete: true,
      objectiveUnitsCompleted: objectiveMaximum + 1,
      now: NOW + attempt.durationMs
    }),
    (error) => error?.code === 'branch_result_invalid'
  );

  const first = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'success',
    stageComplete: true,
    objectiveUnitsCompleted: objectiveMaximum,
    // These client-controlled Present Drop fields are irrelevant to combat rewards.
    destroyedByType: { standard: 9999, armored: 9999, fast: 9999, golden: 9999 },
    collectedPresentCoins: 999_999,
    now: NOW + attempt.durationMs
  });
  assert.equal(first.settlement.duplicate, false);
  assert.equal(first.settlement.branchKind, 'combat');
  assert.equal(first.settlement.stageComplete, true);
  assert.equal(first.settlement.objectiveUnitsCompleted, objectiveMaximum);
  assert.deepEqual(first.settlement.destroyedByType, {
    standard: 0,
    armored: 0,
    fast: 0,
    golden: 0
  });
  assert.equal(first.settlement.performanceCoins, 0);
  assert.equal(first.settlement.coinsAwarded, fixedReward);
  assert.equal(first.profile.snapshot.weeklyState.coins, 25 + fixedReward);
  assert.equal(first.profile.snapshot.weeklyState.durableCampaignCoins, fixedReward);
  assert.equal(first.profile.snapshot.stats.totalCoins, 25 + fixedReward);
  assert.equal(fetchState.patchCount, 1);

  const duplicate = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'success',
    stageComplete: false,
    objectiveUnitsCompleted: 0,
    now: NOW + attempt.durationMs + 1
  });
  assert.equal(duplicate.settlement.duplicate, true);
  assert.equal(duplicate.settlement.objectiveUnitsCompleted, objectiveMaximum);
  assert.equal(duplicate.settlement.coinsAwarded, fixedReward);
  assert.equal(duplicate.settlement.rewardReceiptId, first.settlement.rewardReceiptId);
  assert.equal(duplicate.profile.snapshot.weeklyState.coins, 25 + fixedReward);
  assert.equal(fetchState.patchCount, 1);
});

test('failed and interrupted combat attempts award zero and leave the one-time route retryable', async (t) => {
  const profileRow = createProfileRow({ branch: COMBAT_BRANCH });
  const fetchState = installProfileFetch(t, profileRow);
  const attempt = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: COMBAT_BRANCH.branchId,
    now: NOW
  });
  const failed = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'failed',
    stageComplete: false,
    objectiveUnitsCompleted: 999_999,
    destroyedByType: { standard: 9999 },
    collectedPresentCoins: 999_999,
    now: NOW + 2_000
  });
  assert.equal(failed.settlement.branchKind, 'combat');
  assert.equal(failed.settlement.stageComplete, false);
  assert.equal(failed.settlement.objectiveUnitsCompleted, 0);
  assert.equal(failed.settlement.performanceCoins, 0);
  assert.equal(failed.settlement.coinsAwarded, 0);
  assert.equal(failed.settlement.claimed, false);
  assert.equal(failed.settlement.retryAllowed, true);
  assert.equal(failed.profile.snapshot.weeklyState.coins, 25);
  assert.deepEqual(
    failed.profile.snapshot.permanentState.campaignProgress.branchProgress.claimedBranchIds,
    []
  );
  const retry = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: COMBAT_BRANCH.branchId,
    now: NOW + 2_001
  });
  assert.notEqual(retry.attemptId, attempt.attemptId);
  const interrupted = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: retry.attemptToken,
    outcome: 'interrupted',
    stageComplete: false,
    now: NOW + 4_000
  });
  assert.equal(interrupted.settlement.coinsAwarded, 0);
  assert.equal(interrupted.settlement.claimed, false);
  assert.equal(interrupted.settlement.retryAllowed, true);
  const secondRetry = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: COMBAT_BRANCH.branchId,
    now: NOW + 4_001
  });
  assert.notEqual(secondRetry.attemptId, retry.attemptId);
  assert.equal(fetchState.patchCount, 2);
});

test('simultaneous settlement of one attempt commits once and returns the stable receipt to both callers', async (t) => {
  const profileRow = createProfileRow();
  const fetchState = installProfileFetch(t, profileRow);
  const attempt = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: BRANCH.branchId,
    now: NOW
  });
  const input = {
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'success',
    destroyedByType: { standard: 5, armored: 1, fast: 3, golden: 0 },
    collectedPresentCoins: 53,
    now: NOW + attempt.durationMs
  };

  const [first, second] = await Promise.all([
    settleCampaignBranchAttempt(input),
    settleCampaignBranchAttempt(input)
  ]);

  assert.deepEqual(
    [first.settlement.duplicate, second.settlement.duplicate].sort(),
    [false, true]
  );
  assert.equal(first.settlement.rewardReceiptId, second.settlement.rewardReceiptId);
  assert.equal(profileRow.snapshot.weeklyState.coins, 198);
  assert.equal(profileRow.snapshot.weeklyState.durableCampaignCoins, 173);
  assert.equal(fetchState.patchCount, 1);
});

test('two sessions racing different attempts can claim a one-time branch only once', async (t) => {
  const profileRow = createProfileRow();
  const fetchState = installProfileFetch(t, profileRow);
  const [firstAttempt, secondAttempt] = await Promise.all([
    createCampaignBranchAttempt({ address: WALLET, branchId: BRANCH.branchId, now: NOW }),
    createCampaignBranchAttempt({ address: WALLET, branchId: BRANCH.branchId, now: NOW + 1 })
  ]);
  const settle = (attempt) => settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: attempt.attemptToken,
    outcome: 'success',
    destroyedByType: { standard: 1, armored: 0, fast: 0, golden: 0 },
    collectedPresentCoins: 4,
    now: NOW + secondAttempt.durationMs + 1
  });

  const results = await Promise.allSettled([settle(firstAttempt), settle(secondAttempt)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.equal(rejected?.reason?.code, 'branch_already_claimed');
  assert.equal(profileRow.snapshot.weeklyState.coins, 149);
  assert.equal(profileRow.snapshot.weeklyState.durableCampaignCoins, 124);
  assert.equal(fetchState.patchCount, 1);
});

test('failed Present Drop attempts award zero, do not claim the branch, and allow a new retry', async (t) => {
  const profileRow = createProfileRow();
  const fetchState = installProfileFetch(t, profileRow);
  const firstAttempt = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: BRANCH.branchId,
    now: NOW
  });
  const failed = await settleCampaignBranchAttempt({
    address: WALLET,
    attemptToken: firstAttempt.attemptToken,
    outcome: 'failed',
    destroyedByType: { standard: 8, armored: 2, fast: 4, golden: 0 },
    collectedPresentCoins: 84,
    now: NOW + 2_000
  });
  assert.equal(failed.settlement.coinsAwarded, 0);
  assert.equal(failed.settlement.claimed, false);
  assert.equal(failed.settlement.retryAllowed, true);
  assert.equal(failed.profile.snapshot.weeklyState.coins, 25);
  assert.deepEqual(
    failed.profile.snapshot.permanentState.campaignProgress.branchProgress.claimedBranchIds,
    []
  );
  const retry = await createCampaignBranchAttempt({
    address: WALLET,
    branchId: BRANCH.branchId,
    now: NOW + 2_001
  });
  assert.notEqual(retry.attemptId, firstAttempt.attemptId);
  assert.equal(fetchState.patchCount, 1);
});

test('locked combat branches are rejected from canonical server profile state', async (t) => {
  const locked = createProfileRow({ unlocked: false, branch: COMBAT_BRANCH });
  installProfileFetch(t, locked);
  await assert.rejects(
    createCampaignBranchAttempt({ address: WALLET, branchId: COMBAT_BRANCH.branchId, now: NOW }),
    (error) => error?.code === 'branch_locked'
  );
});

test('founder-locked combat branches are rejected from canonical server profile state', async (t) => {
  const locked = createProfileRow({ founderLocked: true, branch: COMBAT_BRANCH });
  installProfileFetch(t, locked);
  await assert.rejects(
    createCampaignBranchAttempt({ address: WALLET, branchId: COMBAT_BRANCH.branchId, now: NOW }),
    (error) => error?.code === 'branch_locked'
  );
});

test('already-claimed combat branches are rejected from canonical server profile state', async (t) => {
  const claimed = createProfileRow({ claimed: true, branch: COMBAT_BRANCH });
  installProfileFetch(t, claimed);
  await assert.rejects(
    createCampaignBranchAttempt({ address: WALLET, branchId: COMBAT_BRANCH.branchId, now: NOW }),
    (error) => error?.code === 'branch_already_claimed'
  );
});

test('locked Present Drop branches remain rejected from canonical server profile state', async (t) => {
  const locked = createProfileRow({ unlocked: false });
  installProfileFetch(t, locked);
  await assert.rejects(
    createCampaignBranchAttempt({ address: WALLET, branchId: BRANCH.branchId, now: NOW }),
    (error) => error?.code === 'branch_locked'
  );
});

test('ordinary profile saves cannot fabricate branch settlement receipts or claims', () => {
  const current = createProfileRow().snapshot;
  const incoming = structuredClone(current);
  const forgedReceiptId = `campaign-branch:${BRANCH.branchId}:forged`;
  incoming.permanentState.campaignProgress.branchProgress = {
    ...incoming.permanentState.campaignProgress.branchProgress,
    completedBranchIds: [BRANCH.branchId],
    claimedBranchIds: [BRANCH.branchId],
    processedAttemptIds: ['forged-attempt'],
    claimedRewardReceiptIds: [forgedReceiptId],
    attemptReceipts: [{
      attemptId: 'forged-attempt',
      branchId: BRANCH.branchId,
      playerId: `wallet:${WALLET}`,
      outcome: 'success',
      destroyedByType: { standard: 18, armored: 4, fast: 11, golden: 1 },
      presentsDestroyed: 34,
      coinsCalculated: 377,
      coinsAwarded: 377,
      completedAt: new Date(NOW).toISOString(),
      rewardReceiptId: forgedReceiptId,
      claimed: true
    }]
  };
  const protectedSnapshot = preserveCampaignBranchServerState({
    currentSnapshot: current,
    incomingSnapshot: incoming,
    now: NOW
  });
  const progress = protectedSnapshot.permanentState.campaignProgress.branchProgress;
  assert.deepEqual(progress.completedBranchIds, []);
  assert.deepEqual(progress.claimedBranchIds, []);
  assert.deepEqual(progress.processedAttemptIds, []);
  assert.deepEqual(progress.claimedRewardReceiptIds, []);
  assert.deepEqual(progress.attemptReceipts, []);
});
