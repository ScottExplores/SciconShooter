const crypto = require('crypto');
const {
  fetchSupabaseJson,
  hasSupabaseConfig,
  supabaseHeaders
} = require('./supabase');
const { getWeeklyBoundaryMeta } = require('../../shared/weeklyCompetitionBoundary');

const WEEKLY_RUN_FREE_ATTEMPT_LIMIT = 5;
// Backward-compatible name for callers that only need the free weekly grant.
// Purchased capacity is dynamic and must never be validated against this value.
const WEEKLY_RUN_ATTEMPT_LIMIT = WEEKLY_RUN_FREE_ATTEMPT_LIMIT;
const RESERVATION_RPC = process.env.SUPABASE_WEEKLY_RUN_RESERVATION_RPC
  || 'scicon_reserve_weekly_run_attempt';
const SETTLEMENT_RPC = process.env.SUPABASE_WEEKLY_RUN_SETTLEMENT_RPC
  || 'scicon_settle_weekly_run_attempt';
const QUOTA_RPC = process.env.SUPABASE_WEEKLY_RUN_QUOTA_RPC
  || 'scicon_get_weekly_run_quota';
const addressPattern = /^0x[0-9a-f]{40}$/;

// Local development has no durable Supabase service role. Keeping the same
// admission semantics in memory makes the local API useful without pretending
// that those reservations survive a process restart. Production, where
// Supabase is configured, always uses the atomic database functions below.
const memoryAttempts = new Map();

const attemptError = (message, statusCode, detail) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = [detail];
  return error;
};

const normalizeWalletAddress = (value) => {
  const walletAddress = String(value || '').trim().toLowerCase();
  return addressPattern.test(walletAddress) ? walletAddress : null;
};

const normalizeQuota = ({
  weeklyId,
  freeAttempts = WEEKLY_RUN_FREE_ATTEMPT_LIMIT,
  purchasedAttempts = 0,
  attemptsUsed = 0,
  resetAt
}) => {
  const normalizedFree = Math.max(0, Math.floor(Number(freeAttempts) || 0));
  const normalizedPurchased = Math.max(0, Math.floor(Number(purchasedAttempts) || 0));
  const normalizedUsed = Math.max(0, Math.floor(Number(attemptsUsed) || 0));
  const resetDate = resetAt instanceof Date ? resetAt : new Date(resetAt);
  if (!weeklyId || !Number.isFinite(resetDate.getTime())) {
    throw attemptError(
      'Weekly Run quota persistence returned an invalid response.',
      503,
      'weekly_attempt_persistence_unavailable'
    );
  }
  return {
    weeklyId: String(weeklyId),
    freeAttempts: normalizedFree,
    purchasedAttempts: normalizedPurchased,
    attemptsUsed: normalizedUsed,
    attemptsRemaining: Math.max(0, normalizedFree + normalizedPurchased - normalizedUsed),
    resetAt: resetDate.toISOString(),
    resetAtMs: resetDate.getTime()
  };
};

const identityHashFor = (identity) => {
  const kind = identity?.kind === 'wallet' ? 'wallet' : 'guest';
  const profileIdHash = String(identity?.profileIdHash || '');
  if (!/^[a-f0-9]{64}$/.test(profileIdHash)) {
    throw attemptError('Weekly Run identity binding is invalid.', 422, 'weekly_attempt_identity_invalid');
  }
  return crypto.createHash('sha256')
    .update(`scicon-weekly-run-identity-v1:${kind}:${profileIdHash}`)
    .digest('hex');
};

const attemptKeyFor = (binding) => {
  const weeklyId = String(binding?.weeklyId || '');
  const startNodeId = String(binding?.startNodeId || '');
  const createdAtMs = Math.floor(Number(binding?.createdAtMs));
  if (
    !weeklyId
    || !startNodeId.startsWith('weekly-run-')
    || !Number.isFinite(createdAtMs)
    || createdAtMs <= 0
  ) {
    throw attemptError('Weekly Run attempt binding is invalid.', 422, 'weekly_attempt_binding_invalid');
  }
  return crypto.createHash('sha256')
    .update(`scicon-weekly-run-attempt-v1:${weeklyId}:${startNodeId}:${createdAtMs}`)
    .digest('hex');
};

const normalizeRpcResult = (value) => {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result || typeof result !== 'object') {
    throw attemptError(
      'Weekly Run attempt persistence returned an invalid response.',
      503,
      'weekly_attempt_persistence_unavailable'
    );
  }
  return result;
};

const mapPersistenceError = (error) => {
  const message = String(error?.message || '');
  if (/weekly_run_attempts_exhausted/i.test(message)) {
    return attemptError(
      'All Weekly Run attempts have been used. Connect a Base Account to purchase another attempt, or wait for the weekly reset.',
      409,
      'weekly_run_attempts_exhausted'
    );
  }
  if (/weekly_run_attempt_already_finalized/i.test(message)) {
    return attemptError(
      'This Weekly Run attempt has already been finalized.',
      409,
      'weekly_run_attempt_already_finalized'
    );
  }
  if (/weekly_run_attempt_(?:binding|reservation)_invalid/i.test(message)) {
    return attemptError('Weekly Run attempt binding is invalid.', 422, 'weekly_attempt_binding_invalid');
  }
  return attemptError(
    'Weekly Run attempt verification is temporarily unavailable.',
    503,
    'weekly_attempt_persistence_unavailable'
  );
};

const memoryBucketKey = (identityHash, weeklyId) => `${identityHash}:${weeklyId}`;

const reserveInMemory = ({ identityHash, walletAddress, weeklyId, attemptKey, resetAtMs }) => {
  const bucketKey = memoryBucketKey(identityHash, weeklyId);
  const attempts = memoryAttempts.get(bucketKey) || [];
  const quota = normalizeQuota({
    weeklyId,
    attemptsUsed: attempts.length,
    resetAt: resetAtMs
  });
  const existing = attempts.find((row) => row.attemptKey === attemptKey);
  if (existing) {
    if (existing.status === 'finalized') {
      throw attemptError(
        'This Weekly Run attempt has already been finalized.',
        409,
        'weekly_run_attempt_already_finalized'
      );
    }
    return {
      ...existing,
      ...quota
    };
  }
  if (quota.attemptsRemaining <= 0) {
    throw attemptError(
      'All Weekly Run attempts have been used. Connect a Base Account to purchase another attempt, or wait for the weekly reset.',
      409,
      'weekly_run_attempts_exhausted'
    );
  }
  const row = {
    reservationId: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    attemptNumber: attempts.length + 1,
    identityHash,
    walletAddress,
    weeklyId,
    attemptKey,
    status: 'active',
    proofHash: null,
    finishedAtMs: null
  };
  attempts.push(row);
  memoryAttempts.set(bucketKey, attempts);
  return {
    ...row,
    ...normalizeQuota({
      weeklyId,
      attemptsUsed: attempts.length,
      resetAt: resetAtMs
    })
  };
};

const reserveWeeklyRunAttempt = async ({ identity, binding }) => {
  const identityHash = identityHashFor(identity);
  const walletAddress = identity?.kind === 'wallet'
    ? normalizeWalletAddress(identity.walletAddress)
    : null;
  if (identity?.kind === 'wallet' && !walletAddress) {
    throw attemptError('Weekly Run wallet binding is invalid.', 422, 'weekly_attempt_identity_invalid');
  }
  const attemptKey = attemptKeyFor(binding);
  const weeklyId = String(binding.weeklyId);
  const resetAtMs = Math.floor(Number(binding.resetAtMs));
  if (!hasSupabaseConfig()) {
    return reserveInMemory({ identityHash, walletAddress, weeklyId, attemptKey, resetAtMs });
  }

  const proposedReservationId = crypto.randomUUID();
  const proposedRunId = crypto.randomUUID();
  try {
    const value = normalizeRpcResult(await fetchSupabaseJson(`rpc/${RESERVATION_RPC}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_identity_hash: identityHash,
        p_wallet_address: walletAddress,
        p_weekly_id: weeklyId,
        p_attempt_key: attemptKey,
        p_reservation_id: proposedReservationId,
        p_run_id: proposedRunId
      })
    }));
    const quota = normalizeQuota({
      weeklyId: value.weeklyId || value.weekly_id || weeklyId,
      freeAttempts: value.freeAttempts ?? value.free_attempts,
      purchasedAttempts: value.purchasedAttempts ?? value.purchased_attempts,
      attemptsUsed: value.attemptsUsed ?? value.attempts_used,
      resetAt: resetAtMs
    });
    return {
      reservationId: String(value.reservationId || value.reservation_id || ''),
      runId: String(value.runId || value.run_id || ''),
      attemptNumber: Number(value.attemptNumber || value.attempt_number),
      identityHash,
      attemptKey,
      ...quota
    };
  } catch (error) {
    throw mapPersistenceError(error);
  }
};

const getWeeklyRunQuota = async ({ address, now = Date.now() }) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) {
    throw attemptError('A valid Base wallet address is required.', 400, 'weekly_attempt_identity_invalid');
  }
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  if (!hasSupabaseConfig()) {
    let attemptsUsed = 0;
    for (const attempts of memoryAttempts.values()) {
      attemptsUsed += attempts.filter((row) => (
        row.walletAddress === walletAddress && row.weeklyId === boundary.weekKey
      )).length;
    }
    return normalizeQuota({
      weeklyId: boundary.weekKey,
      attemptsUsed,
      resetAt: boundary.endsAt
    });
  }
  try {
    const value = normalizeRpcResult(await fetchSupabaseJson(`rpc/${QUOTA_RPC}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_wallet_address: walletAddress,
        p_weekly_id: boundary.weekKey
      })
    }));
    return normalizeQuota({
      weeklyId: value.weeklyId || value.weekly_id || boundary.weekKey,
      freeAttempts: value.freeAttempts ?? value.free_attempts,
      purchasedAttempts: value.purchasedAttempts ?? value.purchased_attempts,
      attemptsUsed: value.attemptsUsed ?? value.attempts_used,
      resetAt: boundary.endsAt
    });
  } catch (error) {
    throw mapPersistenceError(error);
  }
};

const settleInMemory = ({ reservation, identityHash, proofHash }) => {
  const attempts = memoryAttempts.get(memoryBucketKey(identityHash, reservation.weeklyId)) || [];
  const row = attempts.find((candidate) => candidate.reservationId === reservation.reservationId);
  if (
    !row
    || row.runId !== reservation.runId
    || row.attemptKey !== reservation.attemptKey
  ) {
    throw attemptError('Weekly Run reservation is invalid.', 422, 'weekly_attempt_reservation_invalid');
  }
  if (row.status === 'finalized') {
    if (row.proofHash !== proofHash) {
      throw attemptError(
        'This Weekly Run attempt has already been finalized.',
        409,
        'weekly_run_attempt_already_finalized'
      );
    }
    return { duplicate: true, finishedAtMs: row.finishedAtMs };
  }
  row.status = 'finalized';
  row.proofHash = proofHash;
  row.finishedAtMs = Date.now();
  return { duplicate: false, finishedAtMs: row.finishedAtMs };
};

const settleWeeklyRunAttempt = async ({ reservation, identity, proofHash }) => {
  const identityHash = identityHashFor(identity);
  if (!reservation || typeof reservation !== 'object') {
    throw attemptError('Weekly Run reservation is missing.', 422, 'weekly_attempt_reservation_missing');
  }
  const normalized = {
    reservationId: String(reservation.reservationId || ''),
    runId: String(reservation.runId || ''),
    weeklyId: String(reservation.weeklyId || ''),
    attemptKey: String(reservation.attemptKey || '')
  };
  if (
    !/^[0-9a-f-]{36}$/i.test(normalized.reservationId)
    || !/^[0-9a-f-]{36}$/i.test(normalized.runId)
    || !/^[a-f0-9]{64}$/.test(normalized.attemptKey)
    || !/^[a-f0-9]{64}$/.test(String(proofHash || ''))
  ) {
    throw attemptError('Weekly Run reservation is invalid.', 422, 'weekly_attempt_reservation_invalid');
  }
  if (!hasSupabaseConfig()) {
    return settleInMemory({ reservation: normalized, identityHash, proofHash });
  }
  try {
    const value = normalizeRpcResult(await fetchSupabaseJson(`rpc/${SETTLEMENT_RPC}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_reservation_id: normalized.reservationId,
        p_identity_hash: identityHash,
        p_weekly_id: normalized.weeklyId,
        p_attempt_key: normalized.attemptKey,
        p_run_id: normalized.runId,
        p_proof_hash: proofHash
      })
    }));
    const finishedAtMs = Date.parse(String(value.finishedAt || value.finished_at || ''));
    if (!Number.isFinite(finishedAtMs)) {
      throw new Error('weekly_run_attempt_settlement_invalid');
    }
    return {
      duplicate: Boolean(value.duplicate),
      finishedAtMs
    };
  } catch (error) {
    throw mapPersistenceError(error);
  }
};

const clearWeeklyRunAttemptMemoryForTests = () => memoryAttempts.clear();

module.exports = {
  QUOTA_RPC,
  WEEKLY_RUN_FREE_ATTEMPT_LIMIT,
  WEEKLY_RUN_ATTEMPT_LIMIT,
  attemptKeyFor,
  clearWeeklyRunAttemptMemoryForTests,
  identityHashFor,
  getWeeklyRunQuota,
  reserveWeeklyRunAttempt,
  settleWeeklyRunAttempt
};
