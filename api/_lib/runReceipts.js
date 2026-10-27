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
const { readGuestIdentity } = require('./guestIdentity');
const { isFounderWalletAddress } = require('./founderWallet');
const {
  CURRENT_RECEIPT_PROVENANCE_VERSION,
  requireTrustedReceiptProvenance
} = require('./runReceiptProvenance');

const RUN_RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const MAX_RUN_DURATION_MS = 3 * 60 * 60 * 1000;
// Cover the oldest possible run in the fixed three-week recovery horizon,
// delayed finalization, the advertised 72-hour champion claim window, and a
// small clock/queue margin. Guest authorization still requires the matching
// signed HttpOnly guest identity, so this capability is not bearer-only.
const RECEIPT_LIFETIME_MS = 33 * 24 * 60 * 60 * 1000;
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

const normalizeGuestIdentityId = (value) => {
  const guestId = String(value || '').trim().toLowerCase();
  return /^[0-9a-f-]{36}$/i.test(guestId) ? guestId : null;
};

const profileBindingHash = (profileId) => crypto
  .createHmac('sha256', getReceiptSecret())
  .update(`run-profile:${profileId}`)
  .digest('hex');

const createRunIdentityBinding = ({ profileId, guestIdentityId, walletSession } = {}) => {
  if (walletSession?.walletAddress && walletSession?.profileId) {
    return {
      kind: 'wallet',
      profileIdHash: profileBindingHash(walletSession.profileId),
      walletAddress: walletSession.walletAddress
    };
  }
  // HTTP callers receive guestIdentityId from a signed HttpOnly cookie. The
  // profile fallback remains for trusted/internal callers and legacy tests;
  // the public route never forwards its body-controlled profileId.
  const verifiedGuestId = normalizeGuestIdentityId(guestIdentityId);
  const guestProfileId = verifiedGuestId
    ? `guest-session:${verifiedGuestId}`
    : normalizeGuestProfileId(profileId);
  return {
    kind: 'guest',
    profileIdHash: profileBindingHash(guestProfileId),
    ...(verifiedGuestId ? { guestSessionBound: true } : {})
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
  // Submission retries update revision/status timestamps after gameplay has
  // already ended. Hash only the immutable route, score events, and final loss
  // so a lost HTTP response can be retried against the same reservation.
  const immutableGameplayProof = {
    schemaVersion: streak.schemaVersion,
    weeklyId: streak.weeklyId,
    resetAtMs: streak.resetAtMs,
    startNodeId: streak.startNodeId,
    currentNodeId: streak.currentNodeId,
    committedRoutes: streak.committedRoutes,
    visitedNodeIds: streak.visitedNodeIds,
    scoredNodeIds: streak.scoredNodeIds,
    scoreEvents: streak.scoreEvents,
    score: streak.score,
    createdAtMs: streak.createdAtMs,
    finalization: {
      status: streak.finalization.status,
      reason: streak.finalization.reason,
      finalizedAtMs: streak.finalization.finalizedAtMs,
      triggerNodeId: streak.finalization.triggerNodeId
    }
  };
  const proofJson = JSON.stringify(immutableGameplayProof);
  const gameplayRevision = expectedBinding.revision
    + (streak.scoreEvents.length - expectedBinding.scoreEventCount)
    + (streak.committedRoutes.length - expectedBinding.committedRouteCount)
    + 1;
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
      finalRevision: gameplayRevision,
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
    guestIdentityId = null,
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
  const identity = createRunIdentityBinding({ profileId, guestIdentityId, walletSession });
  // A connected founder wallet is a sandbox even when the client omits testRun.
  // The signed receipt then fails leaderboard admission and prize finalization.
  const founderRun = isFounderWalletAddress(walletSession?.walletAddress);
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
    // This signed marker proves that the run was admitted by the hardened
    // start path as well as finalized by the current receipt writer. Without
    // it, a still-live token from the prior deployment could be finished
    // after cutover and incorrectly persisted as provenance version 1.
    startProvenanceVersion: CURRENT_RECEIPT_PROVENANCE_VERSION,
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
    testRun: Boolean(testRun) || founderRun,
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
  const receiptWalletAddress = receipt.identity?.kind === 'wallet'
    ? String(receipt.identity.walletAddress || '').trim().toLowerCase()
    : null;
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
    run_mode: receipt.runMode,
    test_run: Boolean(receipt.testRun),
    receipt_provenance_version: CURRENT_RECEIPT_PROVENANCE_VERSION,
    integrity_status: receipt.integrity,
    anomaly_flags: receipt.anomalies,
    ip_hash: hashIp(req),
    receipt_hash: receiptHash,
    wallet_address: /^0x[a-f0-9]{40}$/.test(receiptWalletAddress || '')
      ? receiptWalletAddress
      : null,
    wallet_claimed_at: /^0x[a-f0-9]{40}$/.test(receiptWalletAddress || '')
      ? receipt.finishedAt
      : null
  };

  const persistRow = (value) => fetchSupabaseJson(`${RUN_RECEIPTS_TABLE}?on_conflict=run_id`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(value)
  });

  try {
    await persistRow(row);
    const storedRows = await fetchSupabaseJson(
      `${RUN_RECEIPTS_TABLE}?select=run_id,started_at,finished_at,duration_ms,score,wave,enemies_defeated,coins_collected,player_ship_id,game_version,run_mode,test_run,receipt_provenance_version,integrity_status,anomaly_flags,receipt_hash,wallet_address,wallet_claimed_at&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`,
      { headers: supabaseHeaders() }
    );
    const stored = Array.isArray(storedRows) ? storedRows[0] : null;
    if (!stored) return false;
    return {
      exact: String(stored.receipt_hash || '').toLowerCase() === receiptHash,
      stored
    };
  } catch (error) {
    if (/PGRST205|schema cache|Could not find the table/i.test(error.message || '')) return false;
    throw error;
  }
};

const canonicalReceiptFromStoredRow = (stored, start, candidate) => {
  const storedRunMode = stored?.run_mode === 'weekly-streak' ? 'weekly-streak' : 'standard';
  if (
    !stored
    || Number(stored.receipt_provenance_version) !== CURRENT_RECEIPT_PROVENANCE_VERSION
    || storedRunMode !== start.runMode
    || storedRunMode !== candidate.runMode
    || String(stored.run_id || '') !== candidate.runId
    || String(stored.game_version || '') !== candidate.gameVersion
    || Date.parse(stored.started_at) !== Date.parse(candidate.startedAt)
    || Boolean(stored.test_run) !== Boolean(start.testRun)
    || (storedRunMode === 'weekly-streak' && !candidate.weeklyCampaign)
  ) return null;
  const metrics = normalizeRunMetrics({
    score: stored.score,
    wave: stored.wave,
    durationMs: stored.duration_ms,
    enemiesDefeated: stored.enemies_defeated,
    coinsCollected: stored.coins_collected,
    playerShipId: stored.player_ship_id
  });
  const submittedMetricsMatch = Object.entries(metrics).every(([key, value]) => (
    candidate.metrics?.[key] === value
  ));
  const finishedAt = Date.parse(stored.finished_at);
  const integrity = stored.integrity_status === 'review'
    ? 'review'
    : stored.integrity_status === 'server-verified'
      ? 'server-verified'
      : null;
  if (!submittedMetricsMatch || !Number.isFinite(finishedAt) || !integrity) return null;

  // Current and bounded historical lifetimes let rolling-deployment retries
  // reconstruct the exact originally stored token without extending it.
  const lifetimeCandidates = [
    RECEIPT_LIFETIME_MS,
    18 * 24 * 60 * 60 * 1000,
    11 * 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000
  ];
  for (const lifetimeMs of [...new Set(lifetimeCandidates)]) {
    const receiptPayload = {
      type: 'run-receipt',
      runId: candidate.runId,
      gameVersion: candidate.gameVersion,
      runMode: storedRunMode,
      startedAt: Date.parse(candidate.startedAt),
      finishedAt,
      expiresAt: finishedAt + lifetimeMs,
      metrics,
      ...(candidate.weeklyCampaign ? { weeklyCampaign: candidate.weeklyCampaign } : {}),
      identity: start.identity,
      testRun: Boolean(start.testRun),
      integrity
    };
    const receiptToken = signPayload(receiptPayload);
    const receiptHash = crypto.createHash('sha256').update(receiptToken).digest('hex');
    if (receiptHash !== String(stored.receipt_hash || '').toLowerCase()) continue;
    return {
      runId: candidate.runId,
      gameVersion: candidate.gameVersion,
      runMode: storedRunMode,
      startedAt: new Date(receiptPayload.startedAt).toISOString(),
      finishedAt: new Date(receiptPayload.finishedAt).toISOString(),
      expiresAt: new Date(receiptPayload.expiresAt).toISOString(),
      metrics,
      ...(candidate.weeklyCampaign ? { weeklyCampaign: candidate.weeklyCampaign } : {}),
      identity: start.identity,
      testRun: Boolean(start.testRun),
      integrity,
      anomalies: Array.isArray(stored.anomaly_flags) ? stored.anomaly_flags.map(String) : [],
      receiptToken,
      persisted: true
    };
  }
  return null;
};

const finishRun = async (startToken, rawMetrics, req) => {
  const start = verifyPayload(startToken, 'run-start');
  if (Number(start.startProvenanceVersion) !== CURRENT_RECEIPT_PROVENANCE_VERSION) {
    throw Object.assign(
      new Error('This run began before the verification upgrade. Start a new run to submit a verified result.'),
      {
        statusCode: 409,
        code: 'RUN_START_PROVENANCE_UNTRUSTED',
        details: ['run_start_provenance_untrusted']
      }
    );
  }
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
  if (start.identity?.kind === 'wallet') {
    const finishWalletSession = readOptionalWalletProfileSession(req, now);
    if (
      !finishWalletSession
      || finishWalletSession.walletAddress !== start.identity.walletAddress
      || profileBindingHash(finishWalletSession.profileId) !== start.identity.profileIdHash
    ) {
      const error = new Error('This run was started by a different wallet profile.');
      error.statusCode = 403;
      error.code = 'RUN_IDENTITY_MISMATCH';
      error.details = ['run_identity_mismatch'];
      throw error;
    }
  } else if (start.identity?.kind === 'guest' && start.identity.guestSessionBound) {
    // Guest starts are also identity-bound. Ignore any unrelated retained
    // wallet cookie and require the same signed guest cookie that admitted the
    // run, preventing another browser from completing a copied start token.
    const finishGuestIdentity = readGuestIdentity(req, now);
    const finishIdentity = finishGuestIdentity
      ? createRunIdentityBinding({ guestIdentityId: finishGuestIdentity.guestId })
      : null;
    if (!finishIdentity || finishIdentity.profileIdHash !== start.identity.profileIdHash) {
      const error = new Error('This run was started by a different guest session.');
      error.statusCode = 403;
      error.code = 'RUN_IDENTITY_MISMATCH';
      error.details = ['run_identity_mismatch'];
      throw error;
    }
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
  let receiptFinishedAt = now;
  if (generatedWeeklyRun) {
    // Settlement owns the canonical finish time. Resolve it before computing
    // duration/anomalies so a retry after a lost response signs exactly the
    // same receipt instead of reclassifying the run against retry-time `now`.
    const settlement = await settleWeeklyRunAttempt({
      reservation: start.weeklyAttemptReservation,
      identity: start.identity,
      proofHash: weeklyCampaign.summary.proofHash
    });
    receiptFinishedAt = settlement.finishedAtMs;
  }
  const normalizedClientMetrics = normalizeRunMetrics(rawMetrics);
  const measuredDuration = Math.max(0, receiptFinishedAt - start.issuedAt);
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
  const persistence = await saveReceipt(receipt, req);
  if (persistence && !persistence.exact) {
    const canonicalReceipt = canonicalReceiptFromStoredRow(
      persistence.stored,
      start,
      receipt
    );
    if (canonicalReceipt) return canonicalReceipt;
    throw Object.assign(
      new Error('This run was already finalized with a different canonical result.'),
      { statusCode: 409, code: 'RUN_RECEIPT_ALREADY_FINALIZED' }
    );
  }
  receipt.persisted = Boolean(persistence);
  // Local/test runs can exercise the complete proof flow without a configured
  // database, but a production Weekly score must have a durable receipt before
  // it can reach the leaderboard, proposal, claim, or mint flows.
  if (generatedWeeklyRun && process.env.NODE_ENV === 'production' && !receipt.persisted) {
    const error = new Error('Weekly Run receipt persistence is temporarily unavailable. Retry score verification shortly.');
    error.statusCode = 503;
    error.details = ['weekly_receipt_persistence_unavailable'];
    throw error;
  }
  return receipt;
};

const reissueStoredRunReceipt = (row, { verifiedRunMode } = {}) => {
  requireTrustedReceiptProvenance(row);
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
  const runMode = verifiedRunMode === 'weekly-streak'
    ? 'weekly-streak'
    : row.run_mode === 'weekly-streak'
      ? 'weekly-streak'
      : 'standard';
  const storedWalletAddress = String(row.wallet_address || '').trim().toLowerCase();
  const identity = /^0x[a-f0-9]{40}$/.test(storedWalletAddress)
    ? {
        kind: 'wallet',
        walletAddress: storedWalletAddress,
        profileIdHash: profileBindingHash(`wallet:${storedWalletAddress}`)
      }
    : undefined;
  const testRun = row.test_run === true;
  const receiptPayload = {
    type: 'run-receipt',
    runId: String(row.run_id),
    gameVersion: String(row.game_version || 'unknown').slice(0, 32),
    runMode,
    startedAt: startedAt.getTime(),
    finishedAt: finishedAt.getTime(),
    expiresAt,
    metrics,
    ...(identity ? { identity } : {}),
    testRun,
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
    ...(identity ? { identity } : {}),
    testRun,
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
  if (
    binding.currentNodeId !== binding.startNodeId
    || binding.revision !== 1
    || binding.visitedNodeCount !== 1
    || binding.committedRouteCount !== 0
    || binding.scoreEventCount !== 0
    || binding.scoreElapsedMs !== 0
  ) {
    const error = new Error('A generated Weekly Run must start from a fresh Depth 1 proof.');
    error.statusCode = 422;
    error.details = ['weekly_generated_start_not_pristine'];
    throw error;
  }
  const identity = createRunIdentityBinding({
    profileId: options.profileId,
    guestIdentityId: options.guestIdentityId,
    walletSession: options.walletSession
  });
  const weeklyAttemptReservation = await reserveWeeklyRunAttempt({
    identity,
    binding,
    guestAdmissionScope: options.guestAdmissionScope
  });
  return createRunStart(gameVersion, {
    ...options,
    nowMs: issuedAt,
    weeklyAttemptReservation
  });
};

const verifyRunReceipt = (receiptToken) => verifyPayload(receiptToken, 'run-receipt');
const verifyRunStart = (startToken) => verifyPayload(startToken, 'run-start');

module.exports = {
  canonicalReceiptFromStoredRow,
  createRunIdentityBinding,
  createReservedRunStart,
  createRunStart,
  finishRun,
  getReceiptSecret,
  reissueStoredRunReceipt,
  signPayload,
  verifyRunStart,
  verifyRunReceipt
};
