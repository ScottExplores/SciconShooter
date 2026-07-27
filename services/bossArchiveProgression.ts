import {
  BOSS_ARCHIVE_CATALOG,
  getBossArchiveEntry,
  getBossArchiveChallengeRewardCoins,
  getBossArchiveSpeedTargetSeconds,
  normalizeBossArchiveEventId,
  normalizeBossArchiveEventIds
} from './bossArchive';

export const BOSS_ARCHIVE_PROGRESS_VERSION = 1;
export const DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT = 3;

export const BOSS_ARCHIVE_MASTERY_OBJECTIVE_IDS = [
  'challenge-clear',
  'no-hit-clear',
  'timed-clear'
] as const;

export type BossArchiveMasteryObjectiveId = (
  typeof BOSS_ARCHIVE_MASTERY_OBJECTIVE_IDS[number]
);
export type BossArchiveRunMode = 'practice' | 'challenge';

export interface BossArchiveMasteryObjectiveConfig {
  readonly id: BossArchiveMasteryObjectiveId;
  readonly label: string;
  readonly description: string;
  readonly rewardCoins: number;
  readonly rewardCosmeticId: string;
  readonly targetTimeMs?: number;
}

export interface BossArchiveProgressionConfig {
  readonly eventId: string;
  readonly challengeRewardCoins: number;
  readonly masteryObjectives: readonly [
    BossArchiveMasteryObjectiveConfig,
    BossArchiveMasteryObjectiveConfig,
    BossArchiveMasteryObjectiveConfig
  ];
}

export interface BossArchiveMasteryObjectiveProgress {
  completedAt: string | null;
  claimedAt: string | null;
}

export interface BossArchiveLastResult {
  mode: BossArchiveRunMode;
  victory: boolean;
  clearTimeMs: number | null;
  damageTaken: number;
  playedAt: string;
}

export interface BossArchiveBossRecord {
  attempts: number;
  practiceAttempts: number;
  challengeAttempts: number;
  totalClears: number;
  practiceClears: number;
  challengeClears: number;
  noHitClears: number;
  bestClearTimeMs: number | null;
  bestChallengeTimeMs: number | null;
  bestNoHitTimeMs: number | null;
  mastery: Record<BossArchiveMasteryObjectiveId, BossArchiveMasteryObjectiveProgress>;
  processedResultIds: string[];
  lastResult: BossArchiveLastResult | null;
}

export interface BossArchiveDailyChallengeProgress {
  utcDateKey: string;
  successfulClearsUsed: number;
  processedClearIds: string[];
}

export interface BossArchiveProgress {
  version: number;
  unlockedEventIds: string[];
  seenEventIds: string[];
  lastSelectedEventId: string | null;
  records: Record<string, BossArchiveBossRecord>;
  dailyChallenge: BossArchiveDailyChallengeProgress;
}

export interface BossArchiveDailyChargeStatus {
  state: BossArchiveProgress;
  limit: number;
  used: number;
  remaining: number;
  utcDateKey: string;
  resetsAt: string;
}

export interface BossArchiveFightResultInput {
  eventId: string;
  mode: BossArchiveRunMode;
  victory: boolean;
  clearTimeMs?: number | null;
  damageTaken?: number;
  resultId?: string | null;
}

export interface BossArchiveFightResolution {
  state: BossArchiveProgress;
  accepted: boolean;
  duplicate: boolean;
  reason: 'ok' | 'locked-boss' | 'invalid-boss' | 'duplicate-result' | 'no-charges';
  challengeChargeConsumed: boolean;
  challengeRewardCoins: number;
  newlyCompletedObjectiveIds: BossArchiveMasteryObjectiveId[];
  newBestClearTime: boolean;
  newBestChallengeTime: boolean;
  noHit: boolean;
}

export interface BossArchiveMasteryClaimResolution {
  state: BossArchiveProgress;
  claimed: boolean;
  rewardCoins: number;
  rewardCosmeticId: string | null;
  reason: 'ok' | 'invalid-boss' | 'incomplete' | 'already-claimed';
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const clampInteger = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const normalizeIso = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const normalizeDuration = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(60 * 60 * 1000, Math.round(parsed))
    : null;
};

const normalizeResultId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 120 ? normalized : null;
};

const boundedUniqueStrings = (value: unknown, limit = 64): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeResultId).filter((id): id is string => Boolean(id))))
    .slice(-limit);
};

const validDate = (value: Date) => Number.isFinite(value.getTime()) ? value : new Date(0);

export const getBossArchiveUtcDateKey = (now = new Date()) => (
  validDate(now).toISOString().slice(0, 10)
);

export const getBossArchiveNextUtcResetAt = (now = new Date()) => {
  const current = validDate(now);
  return new Date(Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + 1
  )).toISOString();
};

export const normalizeBossArchiveDailyChargeLimit = (value: unknown) => (
  clampInteger(value, 0, 99)
);

export const BOSS_ARCHIVE_PROGRESSION_CATALOG: readonly BossArchiveProgressionConfig[] = (
  Object.freeze(BOSS_ARCHIVE_CATALOG.map((entry) => {
    const challengeRewardCoins = entry.challenge?.reward.amount
      ?? getBossArchiveChallengeRewardCoins(entry.missionNumber);
    const fallbackTargetTimeMs = getBossArchiveSpeedTargetSeconds(entry.missionNumber) * 1000;
    const authoredObjectives = entry.masteryObjectives ?? [];
    const objectiveById = new Map(authoredObjectives.map((objective) => [objective.id, objective]));
    const challengeClear = objectiveById.get('challenge-clear');
    const noHitClear = objectiveById.get('no-hit-clear');
    const timedClear = objectiveById.get('timed-clear');
    const targetTimeMs = timedClear
      ? timedClear.target * 1000
      : fallbackTargetTimeMs;
    return Object.freeze({
      eventId: entry.eventId,
      challengeRewardCoins,
      masteryObjectives: Object.freeze([
        Object.freeze({
          id: 'challenge-clear' as const,
          label: challengeClear?.label ?? 'Rechallenge Victory',
          description: challengeClear?.description ?? `Defeat ${entry.label} in Challenge mode.`,
          rewardCoins: challengeClear?.rewardCoins ?? Math.round(challengeRewardCoins * 0.75),
          rewardCosmeticId: challengeClear?.cosmeticRewardId
            ?? `boss-archive:${entry.eventId}:badge`
        }),
        Object.freeze({
          id: 'no-hit-clear' as const,
          label: noHitClear?.label ?? 'Untouchable',
          description: noHitClear?.description ?? 'Clear the Challenge without taking damage.',
          rewardCoins: noHitClear?.rewardCoins ?? challengeRewardCoins,
          rewardCosmeticId: noHitClear?.cosmeticRewardId
            ?? `boss-archive:${entry.eventId}:frame`
        }),
        Object.freeze({
          id: 'timed-clear' as const,
          label: timedClear?.label ?? 'Rapid Response',
          description: timedClear?.description
            ?? `Clear the Challenge in under ${Math.round(targetTimeMs / 1000)} seconds.`,
          rewardCoins: timedClear?.rewardCoins ?? Math.round(challengeRewardCoins * 1.25),
          rewardCosmeticId: timedClear?.cosmeticRewardId
            ?? `boss-archive:${entry.eventId}:emblem`,
          targetTimeMs
        })
      ]) as BossArchiveProgressionConfig['masteryObjectives']
    });
  }))
);

const BOSS_ARCHIVE_PROGRESSION_BY_ID = new Map(
  BOSS_ARCHIVE_PROGRESSION_CATALOG.map((config) => [config.eventId, config])
);

export const getBossArchiveProgressionConfig = (eventId: unknown) => {
  const normalized = normalizeBossArchiveEventId(eventId);
  return normalized ? BOSS_ARCHIVE_PROGRESSION_BY_ID.get(normalized) ?? null : null;
};

export const createBossArchiveBossRecord = (): BossArchiveBossRecord => ({
  attempts: 0,
  practiceAttempts: 0,
  challengeAttempts: 0,
  totalClears: 0,
  practiceClears: 0,
  challengeClears: 0,
  noHitClears: 0,
  bestClearTimeMs: null,
  bestChallengeTimeMs: null,
  bestNoHitTimeMs: null,
  mastery: {
    'challenge-clear': { completedAt: null, claimedAt: null },
    'no-hit-clear': { completedAt: null, claimedAt: null },
    'timed-clear': { completedAt: null, claimedAt: null }
  },
  processedResultIds: [],
  lastResult: null
});

const sanitizeMastery = (value: unknown): BossArchiveBossRecord['mastery'] => {
  const record = isRecord(value) ? value : {};
  return Object.fromEntries(BOSS_ARCHIVE_MASTERY_OBJECTIVE_IDS.map((id) => {
    const progress = isRecord(record[id]) ? record[id] : {};
    const completedAt = normalizeIso(progress.completedAt);
    return [id, {
      completedAt,
      claimedAt: completedAt ? normalizeIso(progress.claimedAt) : null
    }];
  })) as BossArchiveBossRecord['mastery'];
};

const sanitizeLastResult = (value: unknown): BossArchiveLastResult | null => {
  if (!isRecord(value) || (value.mode !== 'practice' && value.mode !== 'challenge')) return null;
  const playedAt = normalizeIso(value.playedAt);
  if (!playedAt) return null;
  return {
    mode: value.mode,
    victory: value.victory === true,
    clearTimeMs: normalizeDuration(value.clearTimeMs),
    damageTaken: clampInteger(value.damageTaken, 0, 1_000_000),
    playedAt
  };
};

export const sanitizeBossArchiveBossRecord = (value: unknown): BossArchiveBossRecord => {
  const fallback = createBossArchiveBossRecord();
  if (!isRecord(value)) return fallback;
  const practiceAttempts = clampInteger(value.practiceAttempts, 0, 1_000_000_000);
  const challengeAttempts = clampInteger(value.challengeAttempts, 0, 1_000_000_000);
  const practiceClears = clampInteger(value.practiceClears, 0, practiceAttempts);
  const challengeClears = clampInteger(value.challengeClears, 0, challengeAttempts);
  return {
    attempts: Math.max(
      practiceAttempts + challengeAttempts,
      clampInteger(value.attempts, 0, 1_000_000_000)
    ),
    practiceAttempts,
    challengeAttempts,
    totalClears: Math.max(
      practiceClears + challengeClears,
      clampInteger(value.totalClears, 0, 1_000_000_000)
    ),
    practiceClears,
    challengeClears,
    noHitClears: clampInteger(value.noHitClears, 0, practiceClears + challengeClears),
    bestClearTimeMs: normalizeDuration(value.bestClearTimeMs),
    bestChallengeTimeMs: normalizeDuration(value.bestChallengeTimeMs),
    bestNoHitTimeMs: normalizeDuration(value.bestNoHitTimeMs),
    mastery: sanitizeMastery(value.mastery),
    processedResultIds: boundedUniqueStrings(value.processedResultIds),
    lastResult: sanitizeLastResult(value.lastResult)
  };
};

const createDailyChallengeProgress = (now = new Date()): BossArchiveDailyChallengeProgress => ({
  utcDateKey: getBossArchiveUtcDateKey(now),
  successfulClearsUsed: 0,
  processedClearIds: []
});

export const createBossArchiveProgress = (
  unlockedEventIds: unknown = [],
  seenEventIds: unknown = [],
  now = new Date()
): BossArchiveProgress => {
  const unlocked = normalizeBossArchiveEventIds(unlockedEventIds);
  const unlockedSet = new Set(unlocked);
  return {
    version: BOSS_ARCHIVE_PROGRESS_VERSION,
    unlockedEventIds: unlocked,
    seenEventIds: normalizeBossArchiveEventIds(seenEventIds)
      .filter((eventId) => unlockedSet.has(eventId)),
    lastSelectedEventId: null,
    records: {},
    dailyChallenge: createDailyChallengeProgress(now)
  };
};

export const sanitizeBossArchiveProgress = (
  value: unknown,
  {
    unlockedEventIds,
    seenEventIds,
    now = new Date()
  }: {
    unlockedEventIds?: unknown;
    seenEventIds?: unknown;
    now?: Date;
  } = {}
): BossArchiveProgress => {
  const raw = isRecord(value) ? value : {};
  const unlocked = normalizeBossArchiveEventIds(unlockedEventIds ?? raw.unlockedEventIds);
  const unlockedSet = new Set(unlocked);
  const seen = normalizeBossArchiveEventIds(seenEventIds ?? raw.seenEventIds)
    .filter((eventId) => unlockedSet.has(eventId));
  const rawRecords = isRecord(raw.records) ? raw.records : {};
  const records = Object.fromEntries(BOSS_ARCHIVE_CATALOG.flatMap((entry) => (
    rawRecords[entry.eventId] === undefined
      ? []
      : [[entry.eventId, sanitizeBossArchiveBossRecord(rawRecords[entry.eventId])]]
  )));
  const rawDaily = isRecord(raw.dailyChallenge) ? raw.dailyChallenge : {};
  const currentDateKey = getBossArchiveUtcDateKey(now);
  const storedDateKey = typeof rawDaily.utcDateKey === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(rawDaily.utcDateKey)
    ? rawDaily.utcDateKey
    : currentDateKey;
  const dailyChallenge = storedDateKey === currentDateKey
    ? {
        utcDateKey: currentDateKey,
        successfulClearsUsed: clampInteger(rawDaily.successfulClearsUsed, 0, 99),
        processedClearIds: boundedUniqueStrings(rawDaily.processedClearIds)
      }
    : createDailyChallengeProgress(now);
  const normalizedLastSelected = normalizeBossArchiveEventId(raw.lastSelectedEventId);
  return {
    version: BOSS_ARCHIVE_PROGRESS_VERSION,
    unlockedEventIds: unlocked,
    seenEventIds: seen,
    lastSelectedEventId: normalizedLastSelected && unlockedSet.has(normalizedLastSelected)
      ? normalizedLastSelected
      : null,
    records,
    dailyChallenge
  };
};

export const refreshBossArchiveDailyChallenge = (
  state: BossArchiveProgress,
  now = new Date()
) => sanitizeBossArchiveProgress(state, { now });

export const getBossArchiveDailyChargeStatus = (
  state: BossArchiveProgress,
  now = new Date(),
  dailyLimit: number = DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT
): BossArchiveDailyChargeStatus => {
  const refreshed = refreshBossArchiveDailyChallenge(state, now);
  const limit = normalizeBossArchiveDailyChargeLimit(dailyLimit);
  const used = Math.min(limit, refreshed.dailyChallenge.successfulClearsUsed);
  return {
    state: refreshed,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    utcDateKey: refreshed.dailyChallenge.utcDateKey,
    resetsAt: getBossArchiveNextUtcResetAt(now)
  };
};

const minDuration = (left: number | null, right: number | null) => {
  if (left === null) return right;
  if (right === null) return left;
  return Math.min(left, right);
};

const completeMastery = (
  record: BossArchiveBossRecord,
  id: BossArchiveMasteryObjectiveId,
  completedAt: string,
  completed: boolean,
  newlyCompleted: BossArchiveMasteryObjectiveId[]
) => {
  if (!completed || record.mastery[id].completedAt) return;
  record.mastery[id] = { ...record.mastery[id], completedAt };
  newlyCompleted.push(id);
};

export const recordBossArchiveFightResult = (
  state: BossArchiveProgress,
  input: BossArchiveFightResultInput,
  {
    now = new Date(),
    dailyLimit = DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT
  }: { now?: Date; dailyLimit?: number } = {}
): BossArchiveFightResolution => {
  const status = getBossArchiveDailyChargeStatus(state, now, dailyLimit);
  const current = status.state;
  const eventId = normalizeBossArchiveEventId(input.eventId);
  const emptyResult = (
    reason: BossArchiveFightResolution['reason'],
    duplicate = false
  ): BossArchiveFightResolution => ({
    state: current,
    accepted: false,
    duplicate,
    reason,
    challengeChargeConsumed: false,
    challengeRewardCoins: 0,
    newlyCompletedObjectiveIds: [],
    newBestClearTime: false,
    newBestChallengeTime: false,
    noHit: false
  });
  if (!eventId || !getBossArchiveEntry(eventId)) return emptyResult('invalid-boss');
  if (!current.unlockedEventIds.includes(eventId)) return emptyResult('locked-boss');

  const resultId = normalizeResultId(input.resultId);
  const existing = sanitizeBossArchiveBossRecord(current.records[eventId]);
  if (resultId && (
    existing.processedResultIds.includes(resultId)
    || current.dailyChallenge.processedClearIds.includes(resultId)
  )) {
    return emptyResult('duplicate-result', true);
  }
  if (input.mode === 'challenge' && input.victory && status.remaining <= 0) {
    return emptyResult('no-charges');
  }

  const playedAt = validDate(now).toISOString();
  const clearTimeMs = input.victory ? normalizeDuration(input.clearTimeMs) : null;
  const damageTaken = clampInteger(input.damageTaken, 0, 1_000_000);
  const noHit = input.victory && damageTaken === 0;
  const newBestClearTime = Boolean(
    input.victory
    && clearTimeMs !== null
    && (existing.bestClearTimeMs === null || clearTimeMs < existing.bestClearTimeMs)
  );
  const newBestChallengeTime = Boolean(
    input.mode === 'challenge'
    && input.victory
    && clearTimeMs !== null
    && (existing.bestChallengeTimeMs === null || clearTimeMs < existing.bestChallengeTimeMs)
  );
  const record: BossArchiveBossRecord = {
    ...existing,
    mastery: {
      'challenge-clear': { ...existing.mastery['challenge-clear'] },
      'no-hit-clear': { ...existing.mastery['no-hit-clear'] },
      'timed-clear': { ...existing.mastery['timed-clear'] }
    },
    attempts: existing.attempts + 1,
    practiceAttempts: existing.practiceAttempts + (input.mode === 'practice' ? 1 : 0),
    challengeAttempts: existing.challengeAttempts + (input.mode === 'challenge' ? 1 : 0),
    totalClears: existing.totalClears + (input.victory ? 1 : 0),
    practiceClears: existing.practiceClears + (input.mode === 'practice' && input.victory ? 1 : 0),
    challengeClears: existing.challengeClears + (input.mode === 'challenge' && input.victory ? 1 : 0),
    noHitClears: existing.noHitClears + (noHit ? 1 : 0),
    bestClearTimeMs: input.victory ? minDuration(existing.bestClearTimeMs, clearTimeMs) : existing.bestClearTimeMs,
    bestChallengeTimeMs: input.mode === 'challenge' && input.victory
      ? minDuration(existing.bestChallengeTimeMs, clearTimeMs)
      : existing.bestChallengeTimeMs,
    bestNoHitTimeMs: noHit
      ? minDuration(existing.bestNoHitTimeMs, clearTimeMs)
      : existing.bestNoHitTimeMs,
    processedResultIds: resultId
      ? [...existing.processedResultIds, resultId].slice(-64)
      : existing.processedResultIds,
    lastResult: {
      mode: input.mode,
      victory: input.victory,
      clearTimeMs,
      damageTaken,
      playedAt
    }
  };

  let chargeConsumed = false;
  let challengeRewardCoins = 0;
  const reason: BossArchiveFightResolution['reason'] = 'ok';
  let dailyChallenge = current.dailyChallenge;
  const progressionConfig = getBossArchiveProgressionConfig(eventId);
  if (input.mode === 'challenge' && input.victory) {
    chargeConsumed = true;
    challengeRewardCoins = progressionConfig?.challengeRewardCoins ?? 0;
    dailyChallenge = {
      ...current.dailyChallenge,
      successfulClearsUsed: current.dailyChallenge.successfulClearsUsed + 1,
      processedClearIds: resultId
        ? [...current.dailyChallenge.processedClearIds, resultId].slice(-64)
        : current.dailyChallenge.processedClearIds
    };
  }

  const newlyCompletedObjectiveIds: BossArchiveMasteryObjectiveId[] = [];
  const qualifiesForMastery = input.mode === 'challenge' && input.victory && chargeConsumed;
  completeMastery(record, 'challenge-clear', playedAt, qualifiesForMastery, newlyCompletedObjectiveIds);
  completeMastery(record, 'no-hit-clear', playedAt, qualifiesForMastery && noHit, newlyCompletedObjectiveIds);
  completeMastery(
    record,
    'timed-clear',
    playedAt,
    qualifiesForMastery
      && clearTimeMs !== null
      && clearTimeMs <= (progressionConfig?.masteryObjectives[2].targetTimeMs ?? 0),
    newlyCompletedObjectiveIds
  );

  return {
    state: {
      ...current,
      records: { ...current.records, [eventId]: record },
      dailyChallenge
    },
    accepted: true,
    duplicate: false,
    reason,
    challengeChargeConsumed: chargeConsumed,
    challengeRewardCoins,
    newlyCompletedObjectiveIds,
    newBestClearTime,
    newBestChallengeTime,
    noHit
  };
};

export const claimBossArchiveMasteryReward = (
  state: BossArchiveProgress,
  eventIdValue: unknown,
  objectiveId: BossArchiveMasteryObjectiveId,
  now = new Date()
): BossArchiveMasteryClaimResolution => {
  const eventId = normalizeBossArchiveEventId(eventIdValue);
  const config = eventId ? getBossArchiveProgressionConfig(eventId) : null;
  if (!eventId || !config) {
    return {
      state,
      claimed: false,
      rewardCoins: 0,
      rewardCosmeticId: null,
      reason: 'invalid-boss'
    };
  }
  const record = sanitizeBossArchiveBossRecord(state.records[eventId]);
  const progress = record.mastery[objectiveId];
  if (!progress.completedAt) {
    return {
      state,
      claimed: false,
      rewardCoins: 0,
      rewardCosmeticId: null,
      reason: 'incomplete'
    };
  }
  if (progress.claimedAt) {
    return {
      state,
      claimed: false,
      rewardCoins: 0,
      rewardCosmeticId: null,
      reason: 'already-claimed'
    };
  }
  const reward = config.masteryObjectives.find((objective) => objective.id === objectiveId);
  const nextRecord: BossArchiveBossRecord = {
    ...record,
    mastery: {
      ...record.mastery,
      [objectiveId]: { ...progress, claimedAt: validDate(now).toISOString() }
    }
  };
  return {
    state: { ...state, records: { ...state.records, [eventId]: nextRecord } },
    claimed: true,
    rewardCoins: reward?.rewardCoins ?? 0,
    rewardCosmeticId: reward?.rewardCosmeticId ?? null,
    reason: 'ok'
  };
};

export const getBossArchiveUnclaimedMasteryCount = (state: BossArchiveProgress) => (
  Object.values(state.records).reduce((total, recordValue) => {
    const record = sanitizeBossArchiveBossRecord(recordValue);
    return total + BOSS_ARCHIVE_MASTERY_OBJECTIVE_IDS.filter((id) => (
      Boolean(record.mastery[id].completedAt) && !record.mastery[id].claimedAt
    )).length;
  }, 0)
);

export const selectBossArchiveEntry = (
  state: BossArchiveProgress,
  eventIdValue: unknown
): BossArchiveProgress => {
  const eventId = normalizeBossArchiveEventId(eventIdValue);
  if (
    !eventId
    || !state.unlockedEventIds.includes(eventId)
    || state.lastSelectedEventId === eventId
  ) {
    return state;
  }
  return { ...state, lastSelectedEventId: eventId };
};

const earliestIso = (left: string | null, right: string | null) => {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
};

const latestResult = (
  left: BossArchiveLastResult | null,
  right: BossArchiveLastResult | null
) => {
  if (!left) return right;
  if (!right) return left;
  return left.playedAt >= right.playedAt ? left : right;
};

const mergeBossRecords = (
  leftValue: unknown,
  rightValue: unknown
): BossArchiveBossRecord => {
  const left = sanitizeBossArchiveBossRecord(leftValue);
  const right = sanitizeBossArchiveBossRecord(rightValue);
  return {
    attempts: Math.max(left.attempts, right.attempts),
    practiceAttempts: Math.max(left.practiceAttempts, right.practiceAttempts),
    challengeAttempts: Math.max(left.challengeAttempts, right.challengeAttempts),
    totalClears: Math.max(left.totalClears, right.totalClears),
    practiceClears: Math.max(left.practiceClears, right.practiceClears),
    challengeClears: Math.max(left.challengeClears, right.challengeClears),
    noHitClears: Math.max(left.noHitClears, right.noHitClears),
    bestClearTimeMs: minDuration(left.bestClearTimeMs, right.bestClearTimeMs),
    bestChallengeTimeMs: minDuration(left.bestChallengeTimeMs, right.bestChallengeTimeMs),
    bestNoHitTimeMs: minDuration(left.bestNoHitTimeMs, right.bestNoHitTimeMs),
    mastery: Object.fromEntries(BOSS_ARCHIVE_MASTERY_OBJECTIVE_IDS.map((id) => [id, {
      completedAt: earliestIso(left.mastery[id].completedAt, right.mastery[id].completedAt),
      claimedAt: earliestIso(left.mastery[id].claimedAt, right.mastery[id].claimedAt)
    }])) as BossArchiveBossRecord['mastery'],
    processedResultIds: boundedUniqueStrings([
      ...left.processedResultIds,
      ...right.processedResultIds
    ]),
    lastResult: latestResult(left.lastResult, right.lastResult)
  };
};

export const mergeBossArchiveProgress = (
  targetValue: unknown,
  sourceValue: unknown,
  now = new Date()
): BossArchiveProgress => {
  const target = sanitizeBossArchiveProgress(targetValue, { now });
  const source = sanitizeBossArchiveProgress(sourceValue, { now });
  const unlockedEventIds = normalizeBossArchiveEventIds([
    ...target.unlockedEventIds,
    ...source.unlockedEventIds
  ]);
  const unlockedSet = new Set(unlockedEventIds);
  const seenEventIds = normalizeBossArchiveEventIds([
    ...target.seenEventIds,
    ...source.seenEventIds
  ]).filter((eventId) => unlockedSet.has(eventId));
  const records = Object.fromEntries(BOSS_ARCHIVE_CATALOG.flatMap((entry) => {
    const left = target.records[entry.eventId];
    const right = source.records[entry.eventId];
    return left || right ? [[entry.eventId, mergeBossRecords(left, right)]] : [];
  }));
  const targetDay = target.dailyChallenge.utcDateKey;
  const sourceDay = source.dailyChallenge.utcDateKey;
  const dailyChallenge = targetDay === sourceDay
    ? {
        utcDateKey: targetDay,
        successfulClearsUsed: Math.max(
          target.dailyChallenge.successfulClearsUsed,
          source.dailyChallenge.successfulClearsUsed
        ),
        processedClearIds: boundedUniqueStrings([
          ...target.dailyChallenge.processedClearIds,
          ...source.dailyChallenge.processedClearIds
        ])
      }
    : (targetDay > sourceDay ? target.dailyChallenge : source.dailyChallenge);
  const requestedSelection = target.lastSelectedEventId ?? source.lastSelectedEventId;
  return {
    version: BOSS_ARCHIVE_PROGRESS_VERSION,
    unlockedEventIds,
    seenEventIds,
    lastSelectedEventId: requestedSelection && unlockedSet.has(requestedSelection)
      ? requestedSelection
      : null,
    records,
    dailyChallenge
  };
};

export interface BossArchiveDeveloperControls {
  unlockAll(state: BossArchiveProgress): BossArchiveProgress;
  resetProgress(now?: Date): BossArchiveProgress;
  resetDailyCharges(state: BossArchiveProgress, now?: Date): BossArchiveProgress;
  simulateNewUnlock(state: BossArchiveProgress, eventId?: string): BossArchiveProgress;
  simulateMasteryComplete(state: BossArchiveProgress, eventId: string, now?: Date): BossArchiveProgress;
  previewResult(
    state: BossArchiveProgress,
    eventId: string,
    victory: boolean,
    now?: Date
  ): BossArchiveFightResolution;
}

/** Call with `import.meta.env.DEV`; production callers receive no controls. */
export const createBossArchiveDeveloperControls = (
  enabled: boolean
): BossArchiveDeveloperControls | null => enabled ? {
  unlockAll: (state) => ({
    ...state,
    unlockedEventIds: BOSS_ARCHIVE_CATALOG.map((entry) => entry.eventId)
  }),
  resetProgress: (now = new Date()) => createBossArchiveProgress([], [], now),
  resetDailyCharges: (state, now = new Date()) => ({
    ...state,
    dailyChallenge: createDailyChallengeProgress(now)
  }),
  simulateNewUnlock: (state, requestedEventId) => {
    const eventId = normalizeBossArchiveEventId(requestedEventId)
      ?? BOSS_ARCHIVE_CATALOG.find((entry) => !state.unlockedEventIds.includes(entry.eventId))?.eventId
      ?? null;
    if (!eventId) return state;
    return {
      ...state,
      unlockedEventIds: normalizeBossArchiveEventIds([...state.unlockedEventIds, eventId]),
      seenEventIds: state.seenEventIds.filter((seenId) => seenId !== eventId),
      lastSelectedEventId: eventId
    };
  },
  simulateMasteryComplete: (state, eventIdValue, now = new Date()) => {
    const eventId = normalizeBossArchiveEventId(eventIdValue);
    if (!eventId) return state;
    const record = sanitizeBossArchiveBossRecord(state.records[eventId]);
    const completedAt = validDate(now).toISOString();
    return {
      ...state,
      records: {
        ...state.records,
        [eventId]: {
          ...record,
          mastery: Object.fromEntries(BOSS_ARCHIVE_MASTERY_OBJECTIVE_IDS.map((id) => [id, {
            completedAt,
            claimedAt: null
          }])) as BossArchiveBossRecord['mastery']
        }
      }
    };
  },
  previewResult: (state, eventId, victory, now = new Date()) => recordBossArchiveFightResult(
    state,
    {
      eventId,
      mode: 'challenge',
      victory,
      clearTimeMs: victory ? 45_000 : null,
      damageTaken: victory ? 0 : 1,
      resultId: `dev-preview:${eventId}:${now.toISOString()}`
    },
    { now }
  )
} : null;
