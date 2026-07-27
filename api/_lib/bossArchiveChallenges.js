const crypto = require('crypto');
const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const {
  getWalletProfileAuthSecret,
  normalizeWalletAddress
} = require('./walletProfileAuth');
const {
  fetchBossArchiveDailyLedger,
  fetchWalletProfile,
  getBossArchiveChallengeConfig
} = require('./walletProfiles');
const { getWeeklyBoundaryMeta } = require('../../shared/weeklyCompetitionBoundary');

const BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE = 'scicon-boss-archive-challenge-v1';
const BOSS_ARCHIVE_CHALLENGE_LIFETIME_MS = 60 * 60 * 1000;
const BOSS_ARCHIVE_DAILY_LIMIT = 3;
const BOSS_ARCHIVE_SETTLEMENT_RPC = 'scicon_settle_boss_archive_challenge';
const BOSS_ARCHIVE_RESULTS_TABLE = process.env.SUPABASE_BOSS_ARCHIVE_RESULTS_TABLE
  || 'scicon_boss_archive_challenge_results';
const MAX_CLEAR_TIME_MS = 60 * 60 * 1000;

const apiError = (message, statusCode, code = '') => Object.assign(
  new Error(message),
  { statusCode, code }
);

const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');

const signEncodedPayload = (encoded) => crypto
  .createHmac('sha256', getWalletProfileAuthSecret())
  .update(`${BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE}.${encoded}`)
  .digest('base64url');

const normalizeVariantId = (value) => (
  String(value || '').trim().toLowerCase() === 'standard' ? 'standard' : null
);

const normalizeInteger = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const hasUnlockedBoss = (profile, eventId) => (
  Array.isArray(profile?.snapshot?.permanentState?.bossArchive?.unlockedEventIds)
  && profile.snapshot.permanentState.bossArchive.unlockedEventIds.includes(eventId)
);

const createBossArchiveChallengeRun = async ({
  address,
  eventId,
  variantId = 'standard',
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const challengeConfig = getBossArchiveChallengeConfig(eventId);
  const normalizedVariantId = normalizeVariantId(variantId);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400, 'invalid_wallet');
  if (!challengeConfig || !normalizedVariantId) {
    throw apiError('This Boss Archive Challenge is unavailable.', 400, 'invalid_challenge');
  }

  const profile = await fetchWalletProfile(walletAddress, now);
  if (!profile) throw apiError('Create this wallet profile before starting a Challenge.', 409, 'profile_missing');
  if (!hasUnlockedBoss(profile, challengeConfig.eventId)) {
    throw apiError('Defeat this boss in the campaign before starting its Challenge.', 403, 'boss_locked');
  }
  const dailyLedger = await fetchBossArchiveDailyLedger(walletAddress, now);
  const successfulClearsUsed = Array.isArray(dailyLedger)
    ? dailyLedger.length
    : normalizeInteger(
        profile.snapshot?.permanentState?.bossArchive?.dailyChallenge?.successfulClearsUsed,
        0,
        BOSS_ARCHIVE_DAILY_LIMIT
      );
  if (successfulClearsUsed >= BOSS_ARCHIVE_DAILY_LIMIT) {
    throw apiError('No Boss Archive Challenge charges remain until 00:00 UTC.', 409, 'no_charges');
  }

  const issuedAt = Math.floor(Number(now));
  const expiresAt = issuedAt + BOSS_ARCHIVE_CHALLENGE_LIFETIME_MS;
  const runId = crypto.randomUUID();
  const encoded = encodePayload({
    type: BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE,
    runId,
    walletAddress,
    eventId: challengeConfig.eventId,
    variantId: normalizedVariantId,
    issuedAt,
    expiresAt
  });
  return {
    runId,
    runToken: `${encoded}.${signEncodedPayload(encoded)}`,
    eventId: challengeConfig.eventId,
    variantId: normalizedVariantId,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString()
  };
};

const verifyBossArchiveChallengeRun = (
  token,
  expectedWalletAddress,
  now = Date.now(),
  { allowExpired = false } = {}
) => {
  const walletAddress = normalizeWalletAddress(expectedWalletAddress);
  if (!walletAddress || typeof token !== 'string') {
    throw apiError('Boss Archive Challenge authorization is required.', 401, 'challenge_authorization_required');
  }
  const [encoded, signature, ...extra] = token.split('.');
  if (!encoded || !signature || extra.length > 0) {
    throw apiError('Boss Archive Challenge authorization is invalid.', 401, 'challenge_authorization_invalid');
  }
  const expected = signEncodedPayload(encoded);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    signatureBytes.length !== expectedBytes.length
    || !crypto.timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    throw apiError('Boss Archive Challenge authorization is invalid.', 401, 'challenge_authorization_invalid');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw apiError('Boss Archive Challenge authorization is invalid.', 401, 'challenge_authorization_invalid');
  }
  const challengeConfig = getBossArchiveChallengeConfig(payload.eventId);
  if (
    payload.type !== BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE
    || payload.walletAddress !== walletAddress
    || !/^[0-9a-f-]{36}$/i.test(String(payload.runId || ''))
    || !challengeConfig
    || normalizeVariantId(payload.variantId) !== payload.variantId
    || !Number.isFinite(payload.issuedAt)
    || !Number.isFinite(payload.expiresAt)
    || (!allowExpired && payload.expiresAt <= Number(now))
  ) {
    throw apiError('Boss Archive Challenge authorization is invalid or expired.', 401, 'challenge_authorization_expired');
  }
  return {
    ...payload,
    challengeConfig
  };
};

const settlementFromLedgerRow = (row, chargesRemaining) => normalizeSettlementPayload({
  accepted: true,
  duplicate: true,
  resultId: row.result_id,
  eventId: row.event_id,
  variantId: row.variant_id,
  rewardCoins: row.reward_coins,
  chargesRemaining,
  clearTimeMs: row.clear_time_ms,
  damageTaken: row.damage_taken,
  noHit: row.no_hit,
  newBestClearTime: row.new_best_clear_time,
  newBestChallengeTime: row.new_best_challenge_time,
  newlyCompletedObjectiveIds: row.newly_completed_objective_ids,
  utcDateKey: row.utc_date
});

const fetchExistingBossArchiveSettlement = async (walletAddress, run, now) => {
  const utcDateKey = new Date(now).toISOString().slice(0, 10);
  const [existingRows, dailyRows] = await Promise.all([
    fetchSupabaseJson(
      `${BOSS_ARCHIVE_RESULTS_TABLE}?select=*&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + `&result_id=eq.${encodeURIComponent(run.runId)}&limit=1`,
      { headers: supabaseHeaders() }
    ),
    fetchSupabaseJson(
      `${BOSS_ARCHIVE_RESULTS_TABLE}?select=result_id&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + `&utc_date=eq.${encodeURIComponent(utcDateKey)}&limit=${BOSS_ARCHIVE_DAILY_LIMIT}`,
      { headers: supabaseHeaders() }
    )
  ]);
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (!existing) return null;
  const usedToday = Array.isArray(dailyRows) ? dailyRows.length : 0;
  return settlementFromLedgerRow(
    existing,
    Math.max(0, BOSS_ARCHIVE_DAILY_LIMIT - usedToday)
  );
};

const normalizeSettlementPayload = (value) => {
  const result = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  return {
    accepted: result.accepted === true,
    duplicate: result.duplicate === true,
    resultId: String(result.resultId || ''),
    eventId: String(result.eventId || ''),
    variantId: normalizeVariantId(result.variantId) || 'standard',
    rewardCoins: normalizeInteger(result.rewardCoins, 0, 1_000_000),
    chargesRemaining: normalizeInteger(result.chargesRemaining, 0, BOSS_ARCHIVE_DAILY_LIMIT),
    clearTimeMs: normalizeInteger(result.clearTimeMs, 1, MAX_CLEAR_TIME_MS),
    damageTaken: normalizeInteger(result.damageTaken, 0, 1_000_000),
    noHit: result.noHit === true,
    newBestClearTime: result.newBestClearTime === true,
    newBestChallengeTime: result.newBestChallengeTime === true,
    newlyCompletedObjectiveIds: Array.isArray(result.newlyCompletedObjectiveIds)
      ? result.newlyCompletedObjectiveIds.filter((id) => [
          'challenge-clear',
          'no-hit-clear',
          'timed-clear'
        ].includes(id))
      : [],
    utcDateKey: /^\d{4}-\d{2}-\d{2}$/.test(String(result.utcDateKey || ''))
      ? String(result.utcDateKey)
      : new Date().toISOString().slice(0, 10)
  };
};

const settleBossArchiveChallengeRun = async ({
  address,
  runToken,
  victory,
  clearTimeMs,
  damageTaken,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const run = verifyBossArchiveChallengeRun(runToken, walletAddress, now, { allowExpired: true });
  if (victory !== true) {
    throw apiError('Only a successful Challenge clear can be settled.', 400, 'victory_required');
  }
  const existingSettlement = await fetchExistingBossArchiveSettlement(walletAddress, run, now);
  if (existingSettlement) {
    const profile = await fetchWalletProfile(walletAddress, now);
    if (!profile) throw apiError('Boss Archive Challenge profile could not be reloaded.', 500, 'profile_missing');
    return { profile, settlement: existingSettlement };
  }
  if (run.expiresAt <= Number(now)) {
    throw apiError('Boss Archive Challenge authorization has expired.', 401, 'challenge_authorization_expired');
  }
  const normalizedClearTimeMs = normalizeInteger(clearTimeMs, 1, MAX_CLEAR_TIME_MS);
  const normalizedDamageTaken = normalizeInteger(damageTaken, 0, 1_000_000);
  const measuredDurationMs = Math.max(0, Number(now) - run.issuedAt);
  const durationDeltaMs = Math.abs(measuredDurationMs - normalizedClearTimeMs);
  if (measuredDurationMs < 1_500 || durationDeltaMs > Math.max(30_000, measuredDurationMs * 0.35)) {
    throw apiError('Boss Archive Challenge timing failed integrity checks.', 422, 'challenge_timing_invalid');
  }

  let rpcResult;
  try {
    rpcResult = await fetchSupabaseJson(`rpc/${BOSS_ARCHIVE_SETTLEMENT_RPC}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_wallet_address: walletAddress,
        p_result_id: run.runId,
        p_event_id: run.eventId,
        p_variant_id: run.variantId,
        p_clear_time_ms: normalizedClearTimeMs,
        p_damage_taken: normalizedDamageTaken,
        p_daily_limit: BOSS_ARCHIVE_DAILY_LIMIT,
        p_reward_coins: run.challengeConfig.rewardCoins,
        p_timed_target_ms: run.challengeConfig.timedTargetMs,
        p_week_key: getWeeklyBoundaryMeta(new Date(now)).weekKey
      })
    });
  } catch (error) {
    if (/boss_archive_no_charges/i.test(String(error?.message || ''))) {
      throw apiError('No Boss Archive Challenge charges remain until 00:00 UTC.', 409, 'no_charges');
    }
    if (/boss_archive_profile_missing/i.test(String(error?.message || ''))) {
      throw apiError('This wallet profile is unavailable.', 409, 'profile_missing');
    }
    if (/boss_archive_locked/i.test(String(error?.message || ''))) {
      throw apiError('Defeat this boss in the campaign before starting its Challenge.', 403, 'boss_locked');
    }
    throw error;
  }

  const settlement = normalizeSettlementPayload(rpcResult);
  if (!settlement.accepted || settlement.resultId !== run.runId || settlement.eventId !== run.eventId) {
    throw apiError('Boss Archive Challenge settlement returned invalid state.', 500, 'settlement_invalid');
  }
  const profile = await fetchWalletProfile(walletAddress, now);
  if (!profile) throw apiError('Boss Archive Challenge profile could not be reloaded.', 500, 'profile_missing');
  return { profile, settlement };
};

module.exports = {
  BOSS_ARCHIVE_CHALLENGE_LIFETIME_MS,
  BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE,
  BOSS_ARCHIVE_DAILY_LIMIT,
  BOSS_ARCHIVE_SETTLEMENT_RPC,
  BOSS_ARCHIVE_RESULTS_TABLE,
  createBossArchiveChallengeRun,
  normalizeSettlementPayload,
  settleBossArchiveChallengeRun,
  verifyBossArchiveChallengeRun
};
