const crypto = require('crypto');
const campaign = require('../../game-config/campaign.json');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const {
  getWalletProfileAuthSecret,
  normalizeWalletAddress
} = require('./walletProfileAuth');
const {
  PROFILES_TABLE,
  fetchWalletProfile,
  rowToProfile,
  sanitizeWalletSnapshot
} = require('./walletProfiles');

const CAMPAIGN_BRANCH_ATTEMPT_TOKEN_TYPE = 'scicon-campaign-branch-attempt-v1';
const CAMPAIGN_BRANCH_ATTEMPT_GRACE_MS = 60 * 60 * 1000;
const CAMPAIGN_BRANCH_SETTLEMENT_MAX_RETRIES = 4;
const PRESENT_KINDS = Object.freeze(['standard', 'armored', 'fast', 'golden']);
const BRANCH_BY_ID = new Map(
  (Array.isArray(campaign.campaignBranches) ? campaign.campaignBranches : [])
    .map((branch) => [branch.branchId, branch])
);

const apiError = (message, statusCode, code = '') => Object.assign(
  new Error(message),
  { statusCode, code }
);

const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const isoNow = (now) => new Date(now).toISOString();
const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const signEncodedPayload = (encoded) => crypto
  .createHmac('sha256', getWalletProfileAuthSecret())
  .update(`${CAMPAIGN_BRANCH_ATTEMPT_TOKEN_TYPE}.${encoded}`)
  .digest('base64url');

const getBranch = (branchId) => BRANCH_BY_ID.get(String(branchId || '').trim()) || null;
const getBranchKind = (branch) => branch?.missionType === 'present-drop'
  ? 'present-drop'
  : 'combat';

const emptyDestroyedCounts = () => ({
  standard: 0,
  armored: 0,
  fast: 0,
  golden: 0
});

const hasBranchId = (profile, field, branchId) => (
  Array.isArray(profile?.snapshot?.permanentState?.campaignProgress?.branchProgress?.[field])
  && profile.snapshot.permanentState.campaignProgress.branchProgress[field].includes(branchId)
);

const getAttemptReceipt = (profile, attemptId) => {
  const receipts = profile?.snapshot?.permanentState?.campaignProgress?.branchProgress?.attemptReceipts;
  return Array.isArray(receipts)
    ? receipts.find((receipt) => receipt?.attemptId === attemptId) || null
    : null;
};

const authoredDurationMs = (branch) => Math.max(
  1_000,
  integer(branch?.missionDefinition?.durationSeconds, 1, 60 * 60) * 1_000
);

const authoredCounts = (branch) => {
  const typeById = new Map(
    (branch?.missionDefinition?.presentTypes || []).map((present) => [present.id, present.kind])
  );
  const counts = { standard: 0, armored: 0, fast: 0, golden: 0 };
  (branch?.missionDefinition?.spawnGroups || []).forEach((group) => {
    const kind = typeById.get(group.presentTypeId);
    if (PRESENT_KINDS.includes(kind)) counts[kind] += integer(group.count, 0, 10_000);
  });
  return counts;
};

const verifyDestroyedCounts = (branch, input) => {
  const maximums = authoredCounts(branch);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw apiError('Campaign bonus route target counts are invalid.', 422, 'branch_result_invalid');
  }
  return Object.fromEntries(PRESENT_KINDS.map((kind) => {
    const numeric = Number(input[kind] ?? 0);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > maximums[kind]) {
      throw apiError('Campaign bonus route target counts exceed the authored mission.', 422, 'branch_result_invalid');
    }
    return [kind, numeric];
  }));
};

const calculateSettlementReward = (branch, destroyedByType, collectedPresentCoins) => {
  const valueByKind = new Map(
    (branch?.missionDefinition?.presentTypes || []).map((present) => [
      present.kind,
      integer(present.coinValue, 0, 1_000_000)
    ])
  );
  const destroyedValueCeiling = PRESENT_KINDS.reduce(
    (total, kind) => total + destroyedByType[kind] * integer(valueByKind.get(kind), 0, 1_000_000),
    0
  );
  const performanceCeiling = integer(
    branch?.completionReward?.maximumPerformanceCoins,
    0,
    destroyedValueCeiling
  );
  const performanceCoins = Number(collectedPresentCoins);
  if (
    !Number.isInteger(performanceCoins)
    || performanceCoins < 0
    || performanceCoins > Math.min(destroyedValueCeiling, performanceCeiling)
  ) {
    throw apiError('Campaign bonus route Token totals do not match the authored targets.', 422, 'branch_result_invalid');
  }
  const baseCoins = integer(branch?.completionReward?.baseCoins, 0, 1_000_000);
  const oneTimeBonusCoins = integer(branch?.completionReward?.oneTimeBonusCoins, 0, 1_000_000);
  return {
    performanceCoins,
    baseCoins,
    oneTimeBonusCoins,
    totalCoins: baseCoins + oneTimeBonusCoins + performanceCoins
  };
};

const authoredObjectiveUnitMaximum = (branch) => (
  Array.isArray(branch?.missionDefinition?.events)
    ? branch.missionDefinition.events.length
    : 0
);

const verifyCombatCompletion = (branch, {
  stageComplete,
  objectiveUnitsCompleted
}) => {
  if (stageComplete !== true) {
    throw apiError(
      'Campaign combat route completion was not proven by the authored mission.',
      422,
      'branch_result_invalid'
    );
  }
  const objectiveMaximum = authoredObjectiveUnitMaximum(branch);
  const objectiveCount = Number(objectiveUnitsCompleted);
  if (
    !Number.isInteger(objectiveCount)
    || objectiveCount < 0
    || objectiveCount > objectiveMaximum
  ) {
    throw apiError(
      'Campaign combat route objective progress exceeds the authored mission.',
      422,
      'branch_result_invalid'
    );
  }
  return {
    stageComplete: true,
    objectiveUnitsCompleted: objectiveCount
  };
};

const calculateCombatSettlementReward = (branch) => {
  const baseCoins = integer(branch?.completionReward?.baseCoins, 0, 1_000_000);
  const oneTimeBonusCoins = integer(branch?.completionReward?.oneTimeBonusCoins, 0, 1_000_000);
  return {
    performanceCoins: 0,
    baseCoins,
    oneTimeBonusCoins,
    totalCoins: baseCoins + oneTimeBonusCoins
  };
};

const createCampaignBranchAttempt = async ({
  address,
  branchId,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const branch = getBranch(branchId);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400, 'invalid_wallet');
  if (!branch) {
    throw apiError('This Campaign bonus route is unavailable.', 400, 'branch_invalid');
  }
  const profile = await fetchWalletProfile(walletAddress, now);
  if (!profile) throw apiError('Create this wallet profile before starting the bonus route.', 409, 'profile_missing');
  if (!hasBranchId(profile, 'unlockedBranchIds', branch.branchId)) {
    throw apiError('Earn the required Campaign stars before starting this bonus route.', 403, 'branch_locked');
  }
  if (hasBranchId(profile, 'founderLockedBranchIds', branch.branchId)) {
    throw apiError('This Campaign bonus route is locked by the founder controls.', 403, 'branch_locked');
  }
  if (hasBranchId(profile, 'claimedBranchIds', branch.branchId)) {
    throw apiError('This one-time Campaign bonus route was already claimed.', 409, 'branch_already_claimed');
  }

  const issuedAt = Math.floor(Number(now));
  const durationMs = authoredDurationMs(branch);
  const notBefore = issuedAt + durationMs;
  const expiresAt = notBefore + CAMPAIGN_BRANCH_ATTEMPT_GRACE_MS;
  const attemptId = crypto.randomUUID();
  const nonce = crypto.randomBytes(18).toString('base64url');
  const encoded = encodePayload({
    type: CAMPAIGN_BRANCH_ATTEMPT_TOKEN_TYPE,
    attemptId,
    nonce,
    walletAddress,
    branchId: branch.branchId,
    missionDefinitionId: branch.missionDefinitionId,
    durationMs,
    issuedAt,
    notBefore,
    expiresAt
  });
  return {
    attemptId,
    attemptToken: `${encoded}.${signEncodedPayload(encoded)}`,
    branchId: branch.branchId,
    branchKind: getBranchKind(branch),
    missionType: branch.missionType,
    durationMs,
    issuedAt: isoNow(issuedAt),
    notBefore: isoNow(notBefore),
    expiresAt: isoNow(expiresAt)
  };
};

const verifyCampaignBranchAttempt = (
  token,
  expectedWalletAddress,
  now = Date.now(),
  { allowExpired = false } = {}
) => {
  const walletAddress = normalizeWalletAddress(expectedWalletAddress);
  if (!walletAddress || typeof token !== 'string') {
    throw apiError('Campaign bonus route authorization is required.', 401, 'branch_authorization_required');
  }
  const [encoded, signature, ...extra] = token.split('.');
  if (!encoded || !signature || extra.length > 0) {
    throw apiError('Campaign bonus route authorization is invalid.', 401, 'branch_authorization_invalid');
  }
  const expected = signEncodedPayload(encoded);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length
    || !crypto.timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw apiError('Campaign bonus route authorization is invalid.', 401, 'branch_authorization_invalid');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw apiError('Campaign bonus route authorization is invalid.', 401, 'branch_authorization_invalid');
  }
  const branch = getBranch(payload.branchId);
  const expectedDuration = branch ? authoredDurationMs(branch) : 0;
  if (
    payload.type !== CAMPAIGN_BRANCH_ATTEMPT_TOKEN_TYPE
    || payload.walletAddress !== walletAddress
    || !/^[0-9a-f-]{36}$/i.test(String(payload.attemptId || ''))
    || !/^[A-Za-z0-9_-]{16,}$/.test(String(payload.nonce || ''))
    || !branch
    || payload.missionDefinitionId !== branch.missionDefinitionId
    || payload.durationMs !== expectedDuration
    || !Number.isFinite(payload.issuedAt)
    || payload.notBefore !== payload.issuedAt + payload.durationMs
    || !Number.isFinite(payload.expiresAt)
    || payload.expiresAt <= payload.notBefore
    || (!allowExpired && payload.expiresAt <= Number(now))
  ) {
    throw apiError('Campaign bonus route authorization is invalid or expired.', 401, 'branch_authorization_expired');
  }
  return { ...payload, branch };
};

const normalizeOutcome = (value) => (
  value === 'success' || value === 'failed' || value === 'interrupted' ? value : null
);

const responseFromReceipt = (receipt, duplicate) => {
  const branch = getBranch(receipt.branchId);
  const branchKind = getBranchKind(branch);
  const presentsDestroyed = integer(receipt.presentsDestroyed, 0, 1_000_000);
  const objectiveUnitsCompleted = branchKind === 'combat'
    ? integer(
        receipt.objectiveUnitsCompleted ?? presentsDestroyed,
        0,
        authoredObjectiveUnitMaximum(branch)
      )
    : presentsDestroyed;
  return {
    accepted: true,
    duplicate,
    attemptId: receipt.attemptId,
    branchId: receipt.branchId,
    branchKind,
    missionType: branch?.missionType || null,
    outcome: receipt.outcome,
    stageComplete: receipt.outcome === 'success',
    objectiveUnitsCompleted,
    destroyedByType: receipt.destroyedByType,
    presentsDestroyed,
    performanceCoins: integer(receipt.performanceCoins, 0, 1_000_000),
    coinsAwarded: receipt.coinsAwarded,
    rewardReceiptId: receipt.rewardReceiptId,
    claimed: receipt.claimed === true,
    retryAllowed: receipt.outcome !== 'success'
  };
};

const buildSettledSnapshot = ({
  profile,
  run,
  outcome,
  destroyedByType,
  objectiveUnitsCompleted,
  reward,
  now
}) => {
  const snapshot = structuredClone(profile.snapshot);
  const campaignProgress = snapshot.permanentState.campaignProgress;
  const progress = campaignProgress.branchProgress;
  const success = outcome === 'success';
  const rewardReceiptId = success
    ? `campaign-branch:${run.branchId}:${run.attemptId}:server-v1`
    : null;
  const branchKind = getBranchKind(run.branch);
  const presentsDestroyed = branchKind === 'present-drop'
    ? PRESENT_KINDS.reduce((total, kind) => total + destroyedByType[kind], 0)
    : integer(objectiveUnitsCompleted, 0, authoredObjectiveUnitMaximum(run.branch));
  const receipt = {
    attemptId: run.attemptId,
    branchId: run.branchId,
    playerId: profile.profileId,
    outcome,
    branchKind,
    stageComplete: success,
    objectiveUnitsCompleted: presentsDestroyed,
    destroyedByType,
    presentsDestroyed,
    performanceCoins: success ? reward.performanceCoins : 0,
    coinsCalculated: success ? reward.totalCoins : 0,
    coinsAwarded: success ? reward.totalCoins : 0,
    completedAt: isoNow(now),
    rewardReceiptId,
    claimed: success
  };
  progress.attemptReceipts = [...progress.attemptReceipts, receipt].slice(-256);
  progress.processedAttemptIds = Array.from(new Set([
    ...progress.processedAttemptIds,
    run.attemptId
  ])).slice(-512);
  progress.updatedAt = isoNow(now);
  if (success) {
    progress.completedBranchIds = Array.from(new Set([...progress.completedBranchIds, run.branchId]));
    progress.claimedBranchIds = Array.from(new Set([...progress.claimedBranchIds, run.branchId]));
    progress.claimedRewardReceiptIds = Array.from(new Set([
      ...progress.claimedRewardReceiptIds,
      rewardReceiptId
    ])).slice(-256);
    progress.newBranchIds = progress.newBranchIds.filter((id) => id !== run.branchId);
    snapshot.weeklyState.coins = integer(snapshot.weeklyState.coins, 0, 1_000_000_000 - reward.totalCoins)
      + reward.totalCoins;
    snapshot.weeklyState.durableCampaignCoins = integer(
      snapshot.weeklyState.durableCampaignCoins,
      0,
      1_000_000_000 - reward.totalCoins
    ) + reward.totalCoins;
    snapshot.weeklyState.creditedCampaignRewardIds = Array.from(new Set([
      ...(snapshot.weeklyState.creditedCampaignRewardIds || []),
      rewardReceiptId
    ])).slice(-1024);
    snapshot.stats.totalCoins = integer(snapshot.stats.totalCoins, 0, 1_000_000_000 - reward.totalCoins)
      + reward.totalCoins;
  }
  return {
    receipt,
    snapshot: sanitizeWalletSnapshot(snapshot, profile.walletAddress, now)
  };
};

const patchSettledProfile = async (profile, snapshot, now) => {
  const rows = await fetchSupabaseJson(
    `${PROFILES_TABLE}?wallet_address=eq.${encodeURIComponent(profile.walletAddress)}`
    + `&revision=eq.${profile.revision}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        revision: profile.revision + 1,
        snapshot,
        updated_at: isoNow(now)
      })
    }
  );
  return rowToProfile(Array.isArray(rows) ? rows[0] : null, now);
};

const settleCampaignBranchAttempt = async ({
  address,
  attemptToken,
  outcome,
  destroyedByType,
  collectedPresentCoins,
  stageComplete,
  objectiveUnitsCompleted,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const run = verifyCampaignBranchAttempt(attemptToken, walletAddress, now, { allowExpired: true });
  const normalizedOutcome = normalizeOutcome(outcome);
  if (!normalizedOutcome) throw apiError('A valid Campaign bonus route outcome is required.', 400, 'branch_outcome_invalid');
  if (normalizedOutcome === 'success' && Number(now) < run.notBefore) {
    throw apiError('The authored Campaign bonus route duration has not elapsed.', 422, 'branch_timing_invalid');
  }

  for (let attempt = 0; attempt < CAMPAIGN_BRANCH_SETTLEMENT_MAX_RETRIES; attempt += 1) {
    const profile = await fetchWalletProfile(walletAddress, now);
    if (!profile) throw apiError('This wallet profile is unavailable.', 409, 'profile_missing');
    const existingReceipt = getAttemptReceipt(profile, run.attemptId);
    if (existingReceipt) {
      return {
        profile,
        settlement: responseFromReceipt(existingReceipt, true)
      };
    }
    if (run.expiresAt <= Number(now)) {
      throw apiError('Campaign bonus route authorization has expired.', 401, 'branch_authorization_expired');
    }
    if (!hasBranchId(profile, 'unlockedBranchIds', run.branchId)) {
      throw apiError('Earn the required Campaign stars before settling this bonus route.', 403, 'branch_locked');
    }
    if (hasBranchId(profile, 'founderLockedBranchIds', run.branchId)) {
      throw apiError('This Campaign bonus route is locked by the founder controls.', 403, 'branch_locked');
    }
    if (hasBranchId(profile, 'claimedBranchIds', run.branchId)) {
      throw apiError('This one-time Campaign bonus route was already claimed.', 409, 'branch_already_claimed');
    }

    const branchKind = getBranchKind(run.branch);
    let verifiedCounts = emptyDestroyedCounts();
    let verifiedObjectiveUnits = 0;
    let reward;
    if (branchKind === 'present-drop') {
      // Preserve the original Present Drop count/value verification exactly.
      verifiedCounts = verifyDestroyedCounts(run.branch, destroyedByType);
      reward = calculateSettlementReward(run.branch, verifiedCounts, collectedPresentCoins);
      verifiedObjectiveUnits = PRESENT_KINDS.reduce(
        (total, kind) => total + verifiedCounts[kind],
        0
      );
    } else {
      if (normalizedOutcome === 'success') {
        const proof = verifyCombatCompletion(run.branch, {
          stageComplete,
          objectiveUnitsCompleted
        });
        verifiedObjectiveUnits = proof.objectiveUnitsCompleted;
      }
      // Combat branches never use client score, drops, or collected coins.
      reward = calculateCombatSettlementReward(run.branch);
    }
    const settled = buildSettledSnapshot({
      profile,
      run,
      outcome: normalizedOutcome,
      destroyedByType: verifiedCounts,
      objectiveUnitsCompleted: verifiedObjectiveUnits,
      reward,
      now
    });
    const savedProfile = await patchSettledProfile(profile, settled.snapshot, now);
    if (savedProfile) {
      return {
        profile: savedProfile,
        settlement: responseFromReceipt(settled.receipt, false)
      };
    }
  }
  throw apiError('Campaign bonus route settlement conflicted repeatedly. Retry safely.', 409, 'branch_settlement_conflict');
};

module.exports = {
  CAMPAIGN_BRANCH_ATTEMPT_GRACE_MS,
  CAMPAIGN_BRANCH_ATTEMPT_TOKEN_TYPE,
  authoredCounts,
  authoredObjectiveUnitMaximum,
  calculateCombatSettlementReward,
  calculateSettlementReward,
  createCampaignBranchAttempt,
  settleCampaignBranchAttempt,
  verifyCampaignBranchAttempt,
  verifyCombatCompletion,
  verifyDestroyedCounts
};
