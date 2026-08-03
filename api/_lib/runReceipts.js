const crypto = require('crypto');
const {
  fetchSupabaseJson,
  hasSupabaseConfig,
  supabaseHeaders
} = require('./supabase');
const {
  createWeeklyCampaignStreakRunBinding,
  validateFinalizedWeeklyCampaignStreakProof
} = require('./walletProfiles');
const { readOptionalWalletProfileSession } = require('./walletProfileAuth');
const {
  WEEKLY_RUN_FREE_ATTEMPT_LIMIT,
  attemptKeyFor,
  reserveWeeklyRunAttempt,
  settleWeeklyRunAttempt
} = require('./weeklyRunAttempts');

const RUN_RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const MAX_RUN_DURATION_MS = 3 * 60 * 60 * 1000;
const RECEIPT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PLAYER_SHIP_IDS = new Set(['researchhub', 'bio', 'eth', 'btc']);
const CAMPAIGN_CONFIG = require('../../game-config/campaign.json');
const AUTHORED_MISSION_COUNT = Math.max(1, CAMPAIGN_CONFIG.levels?.length || 1);
const FASTEST_PLAUSIBLE_MISSION_SECONDS = 8;
const WEEKLY_DURATION_TOLERANCE_MS = 15_000;
const AUTHORED_MISSION_SCORE_PROFILES = (CAMPAIGN_CONFIG.levels || [])
  .map((level, levelIndex) => {
    const waves = level.waves || [];
    const ordinaryDefeatScores = waves.flatMap((wave) => {
      const fallbackScore = 30 * Math.max(1, Number(wave.scoreMultiplier) || 1);
      return [
        fallbackScore,
        ...(wave.events || []).flatMap((event) => (
          (event.enemies || []).map((enemy) => (
            Number.isFinite(Number(enemy.scoreValue))
              ? Math.max(0, Number(enemy.scoreValue))
              : fallbackScore
          ))
        ))
      ];
    });
    const bossRewardBudget = waves.reduce((missionTotal, wave) => (
      missionTotal + (wave.events || []).reduce((waveTotal, event) => (
        waveTotal + Math.max(0, Number(event.scoreReward) || 0)
      ), 0)
    ), 0);
    return {
      missionNumber: Math.max(1, Number(level.order) || levelIndex + 1),
      ordinaryDefeatCeiling: Math.max(30, ...ordinaryDefeatScores),
      bossRewardBudget
    };
  })
  .sort((left, right) => left.missionNumber - right.missionNumber);

const getReceiptSecret = () => (
  process.env.RUN_RECEIPT_SECRET
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.CRON_SECRET
  || ''
);

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const signPayload = (payload) => {
  const secret = getReceiptSecret();
  if (!secret) throw new Error('RUN_RECEIPT_SECRET is not configured.');
  const encoded = encode(payload);
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const verifyPayload = (token, expectedType) => {
  const secret = getReceiptSecret();
  if (!secret || typeof token !== 'string') throw new Error('Run receipt token is unavailable.');
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) throw new Error('Run receipt token is malformed.');

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(signatureBytes, expectedBytes)) {
    throw new Error('Run receipt signature is invalid.');
  }

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (payload.type !== expectedType) throw new Error('Run receipt token type is invalid.');
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
    throw new Error('Run receipt token has expired.');
  }
  return payload;
};

const normalizeMetric = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
};

const normalizePlayerShipId = (value) => (
  PLAYER_SHIP_IDS.has(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'researchhub'
);

const normalizeGuestProfileId = (value) => {
  const profileId = String(value || '').trim().toLowerCase();
  return /^pilot:[a-z0-9-]{8,}$/.test(profileId) ? profileId : 'guest';
};

const profileBindingHash = (profileId) => crypto
  .createHmac('sha256', getReceiptSecret())
  .update(`run-profile:${profileId}`)
  .digest('hex');

const createRunIdentityBinding = ({ profileId, walletSession } = {}) => {
  if (walletSession?.walletAddress && walletSession?.profileId) {
    return {
      kind: 'wallet',
      profileIdHash: profileBindingHash(walletSession.profileId),
      walletAddress: walletSession.walletAddress
    };
  }
  const guestProfileId = normalizeGuestProfileId(profileId);
  return {
    kind: 'guest',
    profileIdHash: profileBindingHash(guestProfileId)
  };
};

const normalizeRunMetrics = (metrics = {}) => ({
  score: normalizeMetric(metrics.score, 0, 100000000),
  wave: normalizeMetric(metrics.wave, 1, 1000),
  durationMs: normalizeMetric(metrics.durationMs, 0, MAX_RUN_DURATION_MS + 1),
  enemiesDefeated: normalizeMetric(metrics.enemiesDefeated, 0, 1000000),
  coinsCollected: normalizeMetric(metrics.coinsCollected, 0, 1000000),
  playerShipId: normalizePlayerShipId(metrics.playerShipId)
});

const maximumPlausibleScoreForRun = (metrics, durationSeconds) => {
  const finalMissionIndex = AUTHORED_MISSION_SCORE_PROFILES.findIndex((profile) => (
    profile.missionNumber === metrics.wave
  ));
  const safeFinalIndex = finalMissionIndex >= 0
    ? finalMissionIndex
    : AUTHORED_MISSION_SCORE_PROFILES.length - 1;
  const maximumMissionSpan = Math.max(
    1,
    Math.ceil(durationSeconds / FASTEST_PLAUSIBLE_MISSION_SECONDS) + 1
  );
  const scoreProfiles = AUTHORED_MISSION_SCORE_PROFILES.slice(
    Math.max(0, safeFinalIndex - maximumMissionSpan + 1),
    safeFinalIndex + 1
  );
  const ordinaryDefeatCeiling = Math.max(
    30,
    ...scoreProfiles.map((profile) => profile.ordinaryDefeatCeiling)
  );
  const bossRewardBudget = scoreProfiles.reduce((total, profile) => (
    total + profile.bossRewardBudget
  ), 0);

  return 5000
    + metrics.enemiesDefeated * ordinaryDefeatCeiling
    + bossRewardBudget
    + metrics.coinsCollected * 3
    + Math.ceil(durationSeconds * 180);
};

const inspectRunMetrics = (metrics, { weeklyRun = false } = {}) => {
  const anomalies = [];
  const durationSeconds = Math.max(1, metrics.durationMs / 1000);
  if (metrics.durationMs < 1500) anomalies.push('run_too_short');
  if (metrics.durationMs > MAX_RUN_DURATION_MS) anomalies.push('run_too_long');
  // Weekly Run totals are reconstructed from its deterministic proof one
  // segment at a time. Authored Campaign mission-count and score-profile caps
  // do not apply to an endless generated route.
  if (weeklyRun) return anomalies;

  const maximumPlausibleEnemies = Math.ceil(durationSeconds * 15) + 150;
  const maximumPlausibleCoins = metrics.enemiesDefeated * 6 + Math.ceil(durationSeconds * 3) + 150;
  const maximumPlausibleScore = maximumPlausibleScoreForRun(metrics, durationSeconds);

  if (metrics.wave > AUTHORED_MISSION_COUNT) anomalies.push('mission_number_impossible');
  if (metrics.enemiesDefeated > maximumPlausibleEnemies) anomalies.push('enemy_rate_impossible');
  if (metrics.coinsCollected > maximumPlausibleCoins) anomalies.push('coin_rate_impossible');
  if (metrics.score > maximumPlausibleScore) anomalies.push('score_rate_impossible');

  return anomalies;
};

const canonicalWeeklyCampaignReceipt = (rawProof, now, expectedBinding) => {
  const streak = validateFinalizedWeeklyCampaignStreakProof(rawProof, {
    now,
    expectedBinding
  });
  const enemiesDefeated = streak.scoreEvents.reduce((total, event) => (
    total
      + event.outcome.regularEnemyKills
      + event.outcome.eliteKills
      + event.outcome.miniBossKills
      + event.outcome.majorBossKills
  ), 0);
  const proofJson = JSON.stringify(streak);
  return {
    streak,
    metrics: {
      score: streak.score.totalPoints,
      wave: Math.max(1, streak.score.completedNodeCount),
      enemiesDefeated,
      coinsCollected: 0
    },
    summary: {
      weeklyId: streak.weeklyId,
      startNodeId: streak.startNodeId,
      finalNodeId: streak.currentNodeId,
      completedNodeCount: streak.score.completedNodeCount,
      eventCount: streak.score.eventCount,
      startRevision: expectedBinding.revision,
      finalRevision: streak.revision,
      finalizationReason: streak.finalization.reason,
      proofHash: crypto.createHash('sha256').update(proofJson).digest('hex')
    }
  };
};

const hashIp = (req) => {
  const rawIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return crypto.createHmac('sha256', getReceiptSecret()).update(rawIp).digest('hex').slice(0, 32);
};

const createRunStart = (
  gameVersion = 'unknown',
  {
    testRun = false,
    playerShipId = 'researchhub',
    runMode = 'standard',
    profileId = 'guest',
    walletSession = null,
    weeklyCampaignProof = null,
    weeklyAttemptReservation = null,
    nowMs = Date.now()
  } = {}
) => {
  const issuedAt = Math.floor(Number(nowMs));
  const normalizedRunMode = runMode === 'weekly-streak' ? 'weekly-streak' : 'standard';
  if (normalizedRunMode === 'weekly-streak' && !weeklyCampaignProof) {
    const error = new Error('An active Weekly Streak proof is required when the run starts.');
    error.statusCode = 422;
    error.details = ['weekly_start_proof_required'];
    throw error;
  }
  if (normalizedRunMode !== 'weekly-streak' && weeklyCampaignProof) {
    const error = new Error('Weekly Streak proof does not match this run session.');
    error.statusCode = 422;
    error.details = ['weekly_run_mode_mismatch'];
    throw error;
  }
  const weeklyCampaignBinding = normalizedRunMode === 'weekly-streak'
    ? createWeeklyCampaignStreakRunBinding(weeklyCampaignProof, { now: issuedAt })
    : null;
  const identity = createRunIdentityBinding({ profileId, walletSession });
  const generatedWeeklyRun = weeklyCampaignBinding?.startNodeId?.startsWith('weekly-run-');
  if (generatedWeeklyRun && !weeklyAttemptReservation) {
    const error = new Error('Weekly Run starts require a server attempt reservation.');
    error.statusCode = 503;
    error.details = ['weekly_attempt_reservation_required'];
    throw error;
  }
  if (weeklyAttemptReservation) {
    const expectedAttemptKey = attemptKeyFor(weeklyCampaignBinding);
    const purchasedAttempts = Math.floor(Number(weeklyAttemptReservation.purchasedAttempts));
    const attemptsUsed = Math.floor(Number(weeklyAttemptReservation.attemptsUsed));
    const attemptsRemaining = Math.floor(Number(weeklyAttemptReservation.attemptsRemaining));
    const dynamicCapacity = WEEKLY_RUN_FREE_ATTEMPT_LIMIT + purchasedAttempts;
    if (
      !generatedWeeklyRun
      || weeklyAttemptReservation.weeklyId !== weeklyCampaignBinding.weeklyId
      || weeklyAttemptReservation.attemptKey !== expectedAttemptKey
      || !/^[0-9a-f-]{36}$/i.test(String(weeklyAttemptReservation.reservationId || ''))
      || !/^[0-9a-f-]{36}$/i.test(String(weeklyAttemptReservation.runId || ''))
      || !Number.isInteger(weeklyAttemptReservation.attemptNumber)
      || weeklyAttemptReservation.attemptNumber < 1
      || Number(weeklyAttemptReservation.freeAttempts) !== WEEKLY_RUN_FREE_ATTEMPT_LIMIT
      || !Number.isInteger(purchasedAttempts)
      || purchasedAttempts < 0
      || !Number.isInteger(attemptsUsed)
      || attemptsUsed < weeklyAttemptReservation.attemptNumber
      || attemptsUsed > dynamicCapacity
      || !Number.isInteger(attemptsRemaining)
      || attemptsRemaining !== dynamicCapacity - attemptsUsed
    ) {
      const error = new Error('Weekly Run attempt reservation does not match this run.');
      error.statusCode = 422;
      error.details = ['weekly_attempt_reservation_invalid'];
      throw error;
    }
  }
  const payload = {
    type: 'run-start',
    runId: weeklyAttemptReservation?.runId || crypto.randomUUID(),
    gameVersion: String(gameVersion || 'unknown').slice(0, 32),
    playerShipId: normalizePlayerShipId(playerShipId),
    runMode: normalizedRunMode,
    identity,
    ...(weeklyCampaignBinding ? { weeklyCampaignBinding } : {}),
    ...(weeklyAttemptReservation ? {
      weeklyAttemptReservation: {
        reservationId: weeklyAttemptReservation.reservationId,
        runId: weeklyAttemptReservation.runId,
        weeklyId: weeklyAttemptReservation.weeklyId,
        attemptKey: weeklyAttemptReservation.attemptKey,
        attemptNumber: weeklyAttemptReservation.attemptNumber
      }
    } : {}),
    testRun: Boolean(testRun),
    issuedAt,
    expiresAt: issuedAt + MAX_RUN_DURATION_MS
  };

  return {
    runId: payload.runId,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(payload.expiresAt).toISOString(),
    playerShipId: payload.playerShipId,
    runMode: payload.runMode,
    identity: payload.identity,
    ...(payload.weeklyCampaignBinding ? { weeklyCampaignBinding: payload.weeklyCampaignBinding } : {}),
    ...(weeklyAttemptReservation ? {
      weeklyAttempt: {
        attemptNumber: weeklyAttemptReservation.attemptNumber,
        weeklyId: weeklyAttemptReservation.weeklyId,
        freeAttempts: weeklyAttemptReservation.freeAttempts,
        purchasedAttempts: weeklyAttemptReservation.purchasedAttempts,
        attemptsUsed: weeklyAttemptReservation.attemptsUsed,
        attemptsRemaining: weeklyAttemptReservation.attemptsRemaining,
        resetAt: weeklyAttemptReservation.resetAt,
        resetAtMs: weeklyAttemptReservation.resetAtMs
      }
    } : {}),
    testRun: payload.testRun,
    startToken: signPayload(payload)
  };
};

const saveReceipt = async (receipt, req) => {
  if (!hasSupabaseConfig()) return false;
  const receiptHash = crypto.createHash('sha256').update(receipt.receiptToken).digest('hex');
  const row = {
    run_id: receipt.runId,
    started_at: receipt.startedAt,
    finished_at: receipt.finishedAt,
    duration_ms: receipt.metrics.durationMs,
    score: receipt.metrics.score,
    wave: receipt.metrics.wave,
    enemies_defeated: receipt.metrics.enemiesDefeated,
    coins_collected: receipt.metrics.coinsCollected,
    player_ship_id: receipt.metrics.playerShipId,
    game_version: receipt.gameVersion,
    integrity_status: receipt.integrity,
    anomaly_flags: receipt.anomalies,
    ip_hash: hashIp(req),
    receipt_hash: receiptHash
  };

  const persistRow = (value) => fetchSupabaseJson(`${RUN_RECEIPTS_TABLE}?on_conflict=run_id`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(value)
  });

  try {
    await persistRow(row);
    return true;
  } catch (error) {
    if (/PGRST205|schema cache|Could not find the table/i.test(error.message || '')) return false;
    throw error;
  }
};

const finishRun = async (startToken, rawMetrics, req) => {
  const start = verifyPayload(startToken, 'run-start');
  const now = Date.now();
  const startRunMode = start.runMode === 'weekly-streak' ? 'weekly-streak' : 'standard';
  const hasWeeklyProof = Boolean(rawMetrics?.weeklyCampaignProof);
  if (startRunMode === 'weekly-streak' && !hasWeeklyProof) {
    const error = new Error('Weekly Streak proof is required for this run session.');
    error.statusCode = 422;
    error.details = ['weekly_proof_required'];
    throw error;
  }
  if (startRunMode !== 'weekly-streak' && hasWeeklyProof) {
    const error = new Error('Weekly Streak proof does not match this run session.');
    error.statusCode = 422;
    error.details = ['weekly_run_mode_mismatch'];
    throw error;
  }
  if (startRunMode === 'weekly-streak' && !start.weeklyCampaignBinding) {
    const error = new Error('Weekly Streak run binding is missing from this run session.');
    error.statusCode = 422;
    error.details = ['weekly_start_binding_missing'];
    throw error;
  }
  const finishWalletSession = readOptionalWalletProfileSession(req, now);
  if (
    start.identity?.kind === 'wallet'
    && (
      !finishWalletSession
      || finishWalletSession.walletAddress !== start.identity.walletAddress
      || profileBindingHash(finishWalletSession.profileId) !== start.identity.profileIdHash
    )
  ) {
    const error = new Error('This run was started by a different wallet profile.');
    error.statusCode = 403;
    error.details = ['run_identity_mismatch'];
    throw error;
  }
  const weeklyCampaign = rawMetrics?.weeklyCampaignProof
    ? canonicalWeeklyCampaignReceipt(
        rawMetrics.weeklyCampaignProof,
        now,
        start.weeklyCampaignBinding
      )
    : null;
  const generatedWeeklyRun = weeklyCampaign?.streak?.startNodeId?.startsWith('weekly-run-');
  if (generatedWeeklyRun && weeklyCampaign.summary.finalizationReason !== 'loss') {
    const error = new Error('A forfeited Weekly Run cannot create a verified score receipt.');
    error.statusCode = 422;
    error.details = ['weekly_run_forfeit_not_submittable'];
    throw error;
  }
  if (generatedWeeklyRun && !start.weeklyAttemptReservation) {
    const error = new Error('Weekly Run attempt reservation is missing from this run session.');
    error.statusCode = 422;
    error.details = ['weekly_attempt_reservation_missing'];
    throw error;
  }
  const normalizedClientMetrics = normalizeRunMetrics(rawMetrics);
  const measuredDuration = Math.max(0, now - start.issuedAt);
  const metrics = {
    ...normalizedClientMetrics,
    ...(weeklyCampaign?.metrics ?? {}),
    ...(weeklyCampaign ? { durationMs: measuredDuration } : {}),
    playerShipId: normalizePlayerShipId(start.playerShipId)
  };
  const durationDelta = Math.abs(measuredDuration - metrics.durationMs);
  const testRun = Boolean(start.testRun);
  const anomalies = testRun ? [] : inspectRunMetrics(metrics, {
    weeklyRun: Boolean(weeklyCampaign)
  });
  if (weeklyCampaign) {
    const reportedMissionDuration = weeklyCampaign.streak.scoreEvents.reduce((total, event) => (
      total + (event.outcome.elapsedMs ?? 0)
    ), 0);
    const newlyReportedMissionDuration = reportedMissionDuration
      - Math.max(0, Number(start.weeklyCampaignBinding.scoreElapsedMs) || 0);
    if (
      newlyReportedMissionDuration < 0
      || newlyReportedMissionDuration > measuredDuration + WEEKLY_DURATION_TOLERANCE_MS
    ) {
      anomalies.push('weekly_duration_impossible');
    }
  }
  if (!testRun && durationDelta > Math.max(30000, measuredDuration * 0.35)) anomalies.push('duration_mismatch');

  const hardFailure = anomalies.some((flag) => flag.endsWith('_impossible') || flag === 'run_too_long');
  if (hardFailure) {
    const error = new Error('Run metrics failed integrity checks.');
    error.statusCode = 422;
    error.details = anomalies;
    throw error;
  }

  let receiptFinishedAt = now;
  if (generatedWeeklyRun) {
    const settlement = await settleWeeklyRunAttempt({
      reservation: start.weeklyAttemptReservation,
      identity: start.identity,
      proofHash: weeklyCampaign.summary.proofHash
    });
    receiptFinishedAt = settlement.finishedAtMs;
    metrics.durationMs = Math.max(0, receiptFinishedAt - start.issuedAt);
  }

  const receiptPayload = {
    type: 'run-receipt',
    runId: start.runId,
    gameVersion: start.gameVersion,
    runMode: startRunMode,
    startedAt: start.issuedAt,
    finishedAt: receiptFinishedAt,
    expiresAt: receiptFinishedAt + RECEIPT_LIFETIME_MS,
    metrics,
    weeklyCampaign: weeklyCampaign?.summary,
    identity: start.identity,
    testRun,
    integrity: anomalies.length > 0 ? 'review' : 'server-verified'
  };
  const receiptToken = signPayload(receiptPayload);
  const receipt = {
    runId: start.runId,
    gameVersion: start.gameVersion,
    runMode: receiptPayload.runMode,
    startedAt: new Date(start.issuedAt).toISOString(),
    finishedAt: new Date(receiptFinishedAt).toISOString(),
    expiresAt: new Date(receiptPayload.expiresAt).toISOString(),
    metrics,
    weeklyCampaign: receiptPayload.weeklyCampaign,
    identity: receiptPayload.identity,
    testRun,
    integrity: receiptPayload.integrity,
    anomalies,
    receiptToken
  };
  receipt.persisted = await saveReceipt(receipt, req);
  return receipt;
};

const reissueStoredRunReceipt = (row) => {
  const startedAt = new Date(row?.started_at);
  const finishedAt = new Date(row?.finished_at);
  if (!row?.run_id || Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime())) {
    throw new Error('Stored run receipt data is incomplete.');
  }

  const expiresAt = Date.now() + RECEIPT_LIFETIME_MS;
  const metrics = normalizeRunMetrics({
    score: row.score,
    wave: row.wave,
    durationMs: row.duration_ms,
    enemiesDefeated: row.enemies_defeated,
    coinsCollected: row.coins_collected,
    playerShipId: row.player_ship_id
  });
  const integrity = row.integrity_status === 'review' ? 'review' : 'server-verified';
  const receiptPayload = {
    type: 'run-receipt',
    runId: String(row.run_id),
    gameVersion: String(row.game_version || 'unknown').slice(0, 32),
    runMode: row.run_mode === 'weekly-streak' ? 'weekly-streak' : 'standard',
    startedAt: startedAt.getTime(),
    finishedAt: finishedAt.getTime(),
    expiresAt,
    metrics,
    testRun: false,
    integrity
  };

  return {
    runId: receiptPayload.runId,
    gameVersion: receiptPayload.gameVersion,
    runMode: receiptPayload.runMode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    metrics,
    testRun: false,
    integrity,
    anomalies: Array.isArray(row.anomaly_flags) ? row.anomaly_flags : [],
    receiptToken: signPayload(receiptPayload),
    persisted: true
  };
};

const createReservedRunStart = async (gameVersion = 'unknown', options = {}) => {
  const issuedAt = Math.floor(Number(options.nowMs ?? Date.now()));
  const normalizedRunMode = options.runMode === 'weekly-streak' ? 'weekly-streak' : 'standard';
  if (normalizedRunMode !== 'weekly-streak') {
    return createRunStart(gameVersion, { ...options, nowMs: issuedAt });
  }
  const binding = createWeeklyCampaignStreakRunBinding(options.weeklyCampaignProof, { now: issuedAt });
  if (!binding.startNodeId.startsWith('weekly-run-')) {
    return createRunStart(gameVersion, { ...options, nowMs: issuedAt });
  }
  const identity = createRunIdentityBinding({
    profileId: options.profileId,
    walletSession: options.walletSession
  });
  const weeklyAttemptReservation = await reserveWeeklyRunAttempt({ identity, binding });
  return createRunStart(gameVersion, {
    ...options,
    nowMs: issuedAt,
    weeklyAttemptReservation
  });
};

const verifyRunReceipt = (receiptToken) => verifyPayload(receiptToken, 'run-receipt');

module.exports = {
  createReservedRunStart,
  createRunStart,
  finishRun,
  getReceiptSecret,
  reissueStoredRunReceipt,
  signPayload,
  verifyRunReceipt
};
