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
  fetchWalletProfile,
  getBossArchiveChallengeConfig,
  recordBossArchiveDifficultyResult,
  reserveBossArchiveDailyAttempt
} = require('./walletProfiles');
const { getWeeklyBoundaryMeta } = require('../../shared/weeklyCompetitionBoundary');

const BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE = 'scicon-boss-archive-challenge-v1';
const BOSS_ARCHIVE_CHALLENGE_LIFETIME_MS = 60 * 60 * 1000;
const BOSS_ARCHIVE_DAILY_LIMIT = 3;
const BOSS_ARCHIVE_DIFFICULTY_IDS = Object.freeze(['easy', 'medium', 'heroic']);
// The database RPC still owns legacy aggregate rewards/records. Attempt
// charges are now reserved before launch in profile JSON, so settlement must
// not impose a second three-clear limit (notably for runs spanning midnight).
const BOSS_ARCHIVE_SETTLEMENT_LEDGER_LIMIT = 99;
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

const normalizeDifficultyId = (value, fallback = null) => {
  const normalized = String(value || '').trim().toLowerCase();
  return BOSS_ARCHIVE_DIFFICULTY_IDS.includes(normalized) ? normalized : fallback;
};

const normalizeAttemptId = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(normalized) ? normalized : null;
};

const derivedRunId = ({ walletAddress, attemptId, eventId, difficultyId }) => {
  const bytes = crypto.createHash('sha256')
    .update(`${walletAddress}:${attemptId}:${eventId}:${difficultyId}`)
    .digest()
    .subarray(0, 16);
  // Format the deterministic digest as a standards-shaped UUID. Binding the
  // caller's retry id to the encounter prevents reuse against another boss or
  // difficulty from becoming a free attempt.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

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
  difficultyId = 'medium',
  attemptId = null,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const challengeConfig = getBossArchiveChallengeConfig(eventId);
  const normalizedVariantId = normalizeVariantId(variantId);
  const normalizedDifficultyId = normalizeDifficultyId(difficultyId);
  const requestAttemptId = attemptId === null || attemptId === undefined || attemptId === ''
    ? crypto.randomUUID()
    : normalizeAttemptId(attemptId);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400, 'invalid_wallet');
  if (!challengeConfig || !normalizedVariantId || !normalizedDifficultyId) {
    throw apiError('This Boss Archive Challenge is unavailable.', 400, 'invalid_challenge');
  }
  if (!requestAttemptId) {
    throw apiError('A valid Boss Archive attempt id is required.', 400, 'invalid_attempt');
  }

  const profile = await fetchWalletProfile(walletAddress, now);
  if (!profile) throw apiError('Create this wallet profile before starting a Challenge.', 409, 'profile_missing');
  if (!hasUnlockedBoss(profile, challengeConfig.eventId)) {
    throw apiError('Defeat this boss in the campaign before starting its Challenge.', 403, 'boss_locked');
  }
  const issuedAt = Math.floor(Number(now));
  const expiresAt = issuedAt + BOSS_ARCHIVE_CHALLENGE_LIFETIME_MS;
  const runId = derivedRunId({
    walletAddress,
    attemptId: requestAttemptId,
    eventId: challengeConfig.eventId,
    difficultyId: normalizedDifficultyId
  });
  // Validate signing configuration before committing the server-owned charge.
  getWalletProfileAuthSecret();
  const reservation = await reserveBossArchiveDailyAttempt({
    address: walletAddress,
    eventId: challengeConfig.eventId,
    difficultyId: normalizedDifficultyId,
    attemptId: runId,
    // Launch receipts, not successful-clear rows, own the three daily charges.
    // Legacy clear counters are migrated into dailyAttempts while sanitizing
    // the profile, so using the settlement ledger here would charge an
    // overnight clear against the following UTC day.
    minimumAttemptsUsed: 0,
    dailyLimit: BOSS_ARCHIVE_DAILY_LIMIT,
    now
  });
  const encoded = encodePayload({
    type: BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE,
    runId,
    walletAddress,
    eventId: challengeConfig.eventId,
    variantId: normalizedVariantId,
    difficultyId: normalizedDifficultyId,
    attemptsUsed: reservation.attemptsUsed,
    issuedAt,
    expiresAt
  });
  const run = {
    runId,
    runToken: `${encoded}.${signEncodedPayload(encoded)}`,
    eventId: challengeConfig.eventId,
    variantId: normalizedVariantId,
    difficultyId: normalizedDifficultyId,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    chargesRemaining: Math.max(0, BOSS_ARCHIVE_DAILY_LIMIT - reservation.attemptsUsed)
  };
  // Retain top-level run fields for direct internal callers while exposing the
  // conventional { profile, run } pair used by the HTTP transport.
  return Object.assign({}, run, {
    profile: reservation.profile,
    run
  });
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
  const difficultyId = normalizeDifficultyId(payload.difficultyId, 'medium');
  const attemptsUsed = payload.attemptsUsed === undefined
    ? 0
    : normalizeInteger(payload.attemptsUsed, 0, BOSS_ARCHIVE_DAILY_LIMIT);
  if (
    payload.type !== BOSS_ARCHIVE_CHALLENGE_TOKEN_TYPE
    || payload.walletAddress !== walletAddress
    || !/^[0-9a-f-]{36}$/i.test(String(payload.runId || ''))
    || !challengeConfig
    || normalizeVariantId(payload.variantId) !== payload.variantId
    || (payload.difficultyId !== undefined && difficultyId !== payload.difficultyId)
    || (payload.attemptsUsed !== undefined && attemptsUsed !== payload.attemptsUsed)
    || !Number.isFinite(payload.issuedAt)
    || !Number.isFinite(payload.expiresAt)
    || (!allowExpired && payload.expiresAt <= Number(now))
  ) {
    throw apiError('Boss Archive Challenge authorization is invalid or expired.', 401, 'challenge_authorization_expired');
  }
  return {
    ...payload,
    difficultyId,
    attemptsUsed,
    challengeConfig
  };
};

const settlementFromLedgerRow = (row, chargesRemaining, difficultyId) => normalizeSettlementPayload({
  accepted: true,
  duplicate: true,
  resultId: row.result_id,
  eventId: row.event_id,
  variantId: row.variant_id,
  difficultyId,
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

const fetchExistingBossArchiveSettlement = async (walletAddress, run, _now) => {
  const existingRows = await fetchSupabaseJson(
    `${BOSS_ARCHIVE_RESULTS_TABLE}?select=*&wallet_address=eq.${encodeURIComponent(walletAddress)}`
    + `&result_id=eq.${encodeURIComponent(run.runId)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  if (!existing) return null;
  return settlementFromLedgerRow(existing, 0, run.difficultyId);
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
    difficultyId: normalizeDifficultyId(result.difficultyId, 'medium'),
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
  let settlement = await fetchExistingBossArchiveSettlement(walletAddress, run, now);
  let normalizedClearTimeMs;
  let normalizedDamageTaken;
  if (settlement) {
    normalizedClearTimeMs = settlement.clearTimeMs;
    normalizedDamageTaken = settlement.damageTaken;
  } else {
    if (run.expiresAt <= Number(now)) {
      throw apiError('Boss Archive Challenge authorization has expired.', 401, 'challenge_authorization_expired');
    }
    normalizedClearTimeMs = normalizeInteger(clearTimeMs, 1, MAX_CLEAR_TIME_MS);
    normalizedDamageTaken = normalizeInteger(damageTaken, 0, 1_000_000);
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
          // Keep the deployed SQL/table contract stable. Difficulty is carried
          // by the signed run and persisted alongside the aggregate JSON record.
          p_variant_id: 'standard',
          p_clear_time_ms: normalizedClearTimeMs,
          p_damage_taken: normalizedDamageTaken,
          p_daily_limit: BOSS_ARCHIVE_SETTLEMENT_LEDGER_LIMIT,
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

    settlement = normalizeSettlementPayload({
      ...rpcResult,
      difficultyId: run.difficultyId
    });
    if (!settlement.accepted || settlement.resultId !== run.runId || settlement.eventId !== run.eventId) {
      throw apiError('Boss Archive Challenge settlement returned invalid state.', 500, 'settlement_invalid');
    }
  }

  const profile = await recordBossArchiveDifficultyResult({
    address: walletAddress,
    eventId: run.eventId,
    difficultyId: run.difficultyId,
    resultId: run.runId,
    clearTimeMs: normalizedClearTimeMs,
    damageTaken: normalizedDamageTaken,
    now
  });
  const utcDateKey = new Date(now).toISOString().slice(0, 10);
  const dailyAttempts = profile.snapshot?.permanentState?.bossArchive?.dailyAttempts;
  const profileAttemptsUsed = dailyAttempts?.utcDateKey === utcDateKey
    ? normalizeInteger(dailyAttempts.attemptsUsed, 0, BOSS_ARCHIVE_DAILY_LIMIT)
    : 0;
  const runDateKey = new Date(run.issuedAt).toISOString().slice(0, 10);
  const attemptsUsed = Math.max(
    profileAttemptsUsed,
    runDateKey === utcDateKey
      ? normalizeInteger(run.attemptsUsed, 0, BOSS_ARCHIVE_DAILY_LIMIT)
      : 0
  );
  settlement = normalizeSettlementPayload({
    ...settlement,
    difficultyId: run.difficultyId,
    chargesRemaining: Math.max(0, BOSS_ARCHIVE_DAILY_LIMIT - attemptsUsed)
  });
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
