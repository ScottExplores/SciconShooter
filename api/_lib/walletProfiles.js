const crypto = require('crypto');
const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const {
  makeWalletProfileMessage,
  normalizeWalletAddress,
  walletProfileId
} = require('./walletProfileAuth');
const { getWeeklyBoundaryMeta } = require('../../shared/weeklyCompetitionBoundary');
const campaign = require('../../game-config/campaign.json');

const PROFILES_TABLE = process.env.SUPABASE_WALLET_PROFILES_TABLE || 'scicon_wallet_profiles';
const CHALLENGES_TABLE = process.env.SUPABASE_WALLET_PROFILE_CHALLENGES_TABLE || 'scicon_wallet_profile_challenges';
const BOSS_ARCHIVE_RESULTS_TABLE = process.env.SUPABASE_BOSS_ARCHIVE_RESULTS_TABLE
  || 'scicon_boss_archive_challenge_results';
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 256 * 1024;

const PLAYER_SHIP_IDS = ['researchhub', 'bio', 'eth', 'btc'];
const PLAYER_SHIP_ID_SET = new Set(PLAYER_SHIP_IDS);
const MINI_SHIP_IDS = [
  'citation-dart',
  'helix-wasp',
  'photon-manta',
  'quorum-crab',
  'axiom-orbiter',
  'archive-beetle',
  'beacon-kite',
  'prism-skimmer',
  'ledger-hammer',
  'nebula-tern'
];
const MINI_SHIP_ID_SET = new Set(MINI_SHIP_IDS);
const ACHIEVEMENT_IDS = new Set([
  'sector-pioneer',
  'boss-breaker',
  'research-hunter',
  'coin-collector',
  'mission-veteran',
  'ace-score'
]);
const BOSS_ARCHIVE_ENTRIES = Object.freeze(
  campaign.levels
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((level) => level.waves.flatMap((wave) => wave.events
      .filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper')
      .map((event) => Object.freeze({
        eventId: event.id,
        missionNumber: level.order
      }))))
);
const BOSS_ARCHIVE_EVENT_IDS = Object.freeze(
  BOSS_ARCHIVE_ENTRIES.map((entry) => entry.eventId)
);
const BOSS_ARCHIVE_EVENT_ID_SET = new Set(BOSS_ARCHIVE_EVENT_IDS);
const BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS = 100;
const BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS = 25;
const BOSS_ARCHIVE_BASE_SPEED_TARGET_MS = 75_000;
const BOSS_ARCHIVE_SPEED_TARGET_STEP_MS = 2_500;
const BOSS_ARCHIVE_CONFIG_BY_EVENT_ID = new Map(
  BOSS_ARCHIVE_ENTRIES.map((entry) => [entry.eventId, Object.freeze({
    ...entry,
    rewardCoins: BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS
      + BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS * Math.max(0, entry.missionNumber - 1),
    timedTargetMs: BOSS_ARCHIVE_BASE_SPEED_TARGET_MS
      + BOSS_ARCHIVE_SPEED_TARGET_STEP_MS * Math.max(0, entry.missionNumber - 1)
  })])
);
const FINAL_CAMPAIGN_MISSION = campaign.levels.reduce(
  (highest, level) => Math.max(highest, Math.max(0, Math.floor(Number(level.order) || 0))),
  0
);
const CAMPAIGN_LEVELS = Object.freeze(
  campaign.levels.slice().sort((left, right) => left.order - right.order)
);
const CAMPAIGN_LEVEL_IDS = Object.freeze(CAMPAIGN_LEVELS.map((level) => level.id));
const CAMPAIGN_LEVEL_ID_SET = new Set(CAMPAIGN_LEVEL_IDS);
const CAMPAIGN_WAVE_IDS_BY_LEVEL = new Map(CAMPAIGN_LEVELS.map((level) => [
  level.id,
  Object.freeze(level.waves.slice().sort((left, right) => left.order - right.order).map((wave) => wave.id))
]));

const campaignStarIds = (level) => {
  const boss = level.waves.some((wave) => wave.events.some((event) => (
    event.kind === 'boss' && event.bossId === 'gatekeeper'
  )));
  return boss
    ? [`${level.id}:complete`, `${level.id}:damage`, `${level.id}:time`]
    : [`${level.id}:complete`, `${level.id}:coins`, `${level.id}:score`];
};

const campaignMissionRecord = (value, level) => {
  const record = asObject(value);
  const waveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) || [];
  const waveIdSet = new Set(waveIds);
  const starIds = campaignStarIds(level);
  const starIdSet = new Set(starIds);
  const completedWaveIds = stringList(record.completedWaveIds, {
    maxItems: waveIds.length,
    maxLength: 120
  }).filter((id) => waveIdSet.has(id));
  const completed = Boolean(record.completed) || completedWaveIds.length === waveIds.length;
  const earnedStarIds = stringList(record.earnedStarIds, {
    maxItems: 3,
    maxLength: 160
  }).filter((id) => starIdSet.has(id));
  if (completed && !earnedStarIds.includes(starIds[0])) earnedStarIds.unshift(starIds[0]);
  const nullableInteger = (entry, min = 0) => (
    entry === null || entry === undefined ? null : integer(entry, min, 1_000_000_000)
  );
  const optionalDate = (entry) => (
    typeof entry === 'string' && Number.isFinite(Date.parse(entry)) ? new Date(entry).toISOString() : null
  );
  return {
    completedWaveIds: completed ? [...waveIds] : completedWaveIds,
    completed,
    stars: Math.max(integer(record.stars, 0, 3), Math.min(3, earnedStarIds.length), completed ? 1 : 0),
    earnedStarIds,
    bestScore: integer(record.bestScore, 0, 1_000_000_000),
    bestClearTimeMs: nullableInteger(record.bestClearTimeMs, 1),
    bestDamageTaken: nullableInteger(record.bestDamageTaken),
    bestCoinsCollected: integer(record.bestCoinsCollected, 0, 1_000_000_000),
    firstCompletedAt: optionalDate(record.firstCompletedAt),
    lastCompletedAt: optionalDate(record.lastCompletedAt),
    completionCount: integer(record.completionCount, 0, 1_000_000)
  };
};

const sanitizeCampaignProgress = (rawValue, lifetimeStats, now) => {
  const value = asObject(rawValue);
  const hasStoredProgress = Boolean(
    rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
  );
  const reachedMission = hasStoredProgress
    ? 1
    : Math.max(1, Math.min(CAMPAIGN_LEVELS.length, integer(lifetimeStats.highestWave, 1, CAMPAIGN_LEVELS.length)));
  const missionRecords = {};
  CAMPAIGN_LEVELS.forEach((level, index) => {
    const stored = campaignMissionRecord(asObject(value.missionRecords)[level.id], level);
    const legacyCompleted = !hasStoredProgress && index < reachedMission - 1;
    missionRecords[level.id] = legacyCompleted
      ? {
          ...stored,
          completed: true,
          completedWaveIds: [...(CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) || [])],
          stars: Math.max(1, stored.stars),
          earnedStarIds: Array.from(new Set([campaignStarIds(level)[0], ...stored.earnedStarIds]))
        }
      : stored;
  });
  const completedMissionIds = CAMPAIGN_LEVELS
    .filter((level) => missionRecords[level.id].completed || asObject(value).completedMissionIds?.includes?.(level.id))
    .map((level) => level.id);
  const unlocked = new Set(
    hasStoredProgress
      ? stringList(value.unlockedMissionIds, { maxItems: CAMPAIGN_LEVELS.length, maxLength: 120 })
        .filter((id) => CAMPAIGN_LEVEL_ID_SET.has(id))
      : CAMPAIGN_LEVEL_IDS.slice(0, reachedMission)
  );
  unlocked.add(CAMPAIGN_LEVEL_IDS[0]);
  completedMissionIds.forEach((id) => {
    unlocked.add(id);
    const index = CAMPAIGN_LEVEL_IDS.indexOf(id);
    if (CAMPAIGN_LEVEL_IDS[index + 1]) unlocked.add(CAMPAIGN_LEVEL_IDS[index + 1]);
  });
  const rawUnlockedWaves = asObject(value.unlockedWaveIdsByMission);
  const unlockedWaveIdsByMission = {};
  CAMPAIGN_LEVELS.forEach((level, index) => {
    const waveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(level.id) || [];
    const allowed = new Set(waveIds);
    let ids = hasStoredProgress
      ? stringList(rawUnlockedWaves[level.id], { maxItems: waveIds.length, maxLength: 120 })
        .filter((id) => allowed.has(id))
      : index < reachedMission - 1
        ? [...waveIds]
        : index === reachedMission - 1
          ? waveIds.slice(0, 1)
          : [];
    if (completedMissionIds.includes(level.id)) ids = [...waveIds];
    if (unlocked.has(level.id) && ids.length === 0 && waveIds[0]) ids = [waveIds[0]];
    unlockedWaveIdsByMission[level.id] = ids;
  });
  let recommendedMissionId = typeof value.recommendedMissionId === 'string'
    && unlocked.has(value.recommendedMissionId)
    ? value.recommendedMissionId
    : CAMPAIGN_LEVEL_IDS[reachedMission - 1] || CAMPAIGN_LEVEL_IDS[0];
  let recommendedWaveId = typeof value.recommendedWaveId === 'string'
    && unlockedWaveIdsByMission[recommendedMissionId]?.includes(value.recommendedWaveId)
    ? value.recommendedWaveId
    : unlockedWaveIdsByMission[recommendedMissionId]?.[0];
  if (!recommendedWaveId) {
    recommendedMissionId = CAMPAIGN_LEVEL_IDS[0];
    recommendedWaveId = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(recommendedMissionId)?.[0] || '';
  }
  const completionRecords = (Array.isArray(value.completionRecords) ? value.completionRecords : [])
    .flatMap((entry) => {
      const record = asObject(entry);
      const resultId = text(record.resultId, 180);
      const missionWaveIds = CAMPAIGN_WAVE_IDS_BY_LEVEL.get(record.missionId);
      if (
        !resultId
        || !missionWaveIds
        || !missionWaveIds.includes(record.waveId)
      ) return [];
      return [{
        resultId,
        playerId: text(record.playerId, 180) || 'unknown',
        campaignId: campaign.id,
        campaignRevision: integer(record.campaignRevision, 0, 1_000_000),
        missionId: record.missionId,
        waveId: record.waveId,
        completedAt: typeof record.completedAt === 'string' && Number.isFinite(Date.parse(record.completedAt))
          ? new Date(record.completedAt).toISOString()
          : isoNow(now),
        stageComplete: Boolean(record.stageComplete),
        firstClearGranted: Boolean(record.firstClearGranted),
        coinsAwarded: integer(record.coinsAwarded, 0, 1_000_000),
        starsEarned: integer(record.starsEarned, 0, 3)
      }];
    })
    .slice(-96);
  return {
    version: 1,
    campaignId: campaign.id,
    campaignRevision: integer(value.campaignRevision, campaign.revision, 1_000_000),
    recommendedMissionId,
    recommendedWaveId,
    unlockedMissionIds: CAMPAIGN_LEVEL_IDS.filter((id) => unlocked.has(id)),
    unlockedWaveIdsByMission,
    completedMissionIds,
    missionRecords,
    claimedRewardIds: stringList(value.claimedRewardIds, { maxItems: 768, maxLength: 180 })
      .filter((id) => id.startsWith('campaign:')),
    processedResultIds: stringList(value.processedResultIds, { maxItems: 384, maxLength: 180 }),
    completionRecords,
    unviewedMissionIds: stringList(value.unviewedMissionIds, { maxItems: CAMPAIGN_LEVELS.length, maxLength: 120 })
      .filter((id) => CAMPAIGN_LEVEL_ID_SET.has(id)),
    unviewedStarMissionIds: stringList(value.unviewedStarMissionIds, { maxItems: CAMPAIGN_LEVELS.length, maxLength: 120 })
      .filter((id) => CAMPAIGN_LEVEL_ID_SET.has(id)),
    unviewedRewardIds: stringList(value.unviewedRewardIds, { maxItems: 120, maxLength: 180 })
      .filter((id) => id.startsWith('campaign:')),
    campaignCompleted: completedMissionIds.length === CAMPAIGN_LEVELS.length,
    updatedAt: isoNow(now)
  };
};

const apiError = (message, statusCode, details = {}) => Object.assign(
  new Error(message),
  { statusCode, ...details }
);

const asObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const text = (value, maxLength) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const stringList = (value, { maxItems = 100, maxLength = 80, pattern } = {}) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().slice(0, maxLength))
      .filter((item) => item && (!pattern || pattern.test(item)))
  )).slice(0, maxItems);
};

const bossArchiveEventIds = (value) => {
  const requested = new Set(
    stringList(value, { maxItems: BOSS_ARCHIVE_EVENT_IDS.length, maxLength: 120 })
      .filter((eventId) => BOSS_ARCHIVE_EVENT_ID_SET.has(eventId))
  );
  return BOSS_ARCHIVE_EVENT_IDS.filter((eventId) => requested.has(eventId));
};

const getBossArchiveChallengeConfig = (eventId) => (
  BOSS_ARCHIVE_CONFIG_BY_EVENT_ID.get(String(eventId || '').trim()) || null
);

const BOSS_ARCHIVE_MASTERY_IDS = [
  'challenge-clear',
  'no-hit-clear',
  'timed-clear'
];

const optionalIso = (value) => {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

const optionalDuration = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(60 * 60 * 1000, Math.round(parsed))
    : null;
};

const sanitizeBossArchiveMastery = (value) => {
  const mastery = asObject(value);
  return Object.fromEntries(BOSS_ARCHIVE_MASTERY_IDS.map((id) => {
    const objective = asObject(mastery[id]);
    const completedAt = optionalIso(objective.completedAt);
    return [id, {
      completedAt,
      claimedAt: completedAt ? optionalIso(objective.claimedAt) : null
    }];
  }));
};

const sanitizeBossArchiveLastResult = (value) => {
  const result = asObject(value);
  const playedAt = optionalIso(result.playedAt);
  if (!playedAt || !['practice', 'challenge'].includes(result.mode)) return null;
  return {
    mode: result.mode,
    victory: result.victory === true,
    clearTimeMs: optionalDuration(result.clearTimeMs),
    damageTaken: integer(result.damageTaken, 0, 1_000_000),
    playedAt
  };
};

const sanitizeBossArchiveRecord = (value) => {
  const record = asObject(value);
  const practiceAttempts = integer(record.practiceAttempts, 0, 1_000_000_000);
  const challengeAttempts = integer(record.challengeAttempts, 0, 1_000_000_000);
  const practiceClears = integer(record.practiceClears, 0, practiceAttempts);
  const challengeClears = integer(record.challengeClears, 0, challengeAttempts);
  return {
    attempts: Math.max(
      practiceAttempts + challengeAttempts,
      integer(record.attempts, 0, 1_000_000_000)
    ),
    practiceAttempts,
    challengeAttempts,
    totalClears: Math.max(
      practiceClears + challengeClears,
      integer(record.totalClears, 0, 1_000_000_000)
    ),
    practiceClears,
    challengeClears,
    noHitClears: integer(record.noHitClears, 0, practiceClears + challengeClears),
    bestClearTimeMs: optionalDuration(record.bestClearTimeMs),
    bestChallengeTimeMs: optionalDuration(record.bestChallengeTimeMs),
    bestNoHitTimeMs: optionalDuration(record.bestNoHitTimeMs),
    mastery: sanitizeBossArchiveMastery(record.mastery),
    processedResultIds: stringList(record.processedResultIds, {
      maxItems: 64,
      maxLength: 120
    }),
    lastResult: sanitizeBossArchiveLastResult(record.lastResult)
  };
};

const sanitizeBossArchiveProgress = (value, unlockedEventIds, now) => {
  const archive = asObject(value);
  const unlockedSet = new Set(unlockedEventIds);
  const records = asObject(archive.records);
  const dailyChallenge = asObject(archive.dailyChallenge);
  const utcDateKey = isoNow(now).slice(0, 10);
  const storedDateKey = typeof dailyChallenge.utcDateKey === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dailyChallenge.utcDateKey)
    ? dailyChallenge.utcDateKey
    : utcDateKey;
  const lastSelectedEventId = typeof archive.lastSelectedEventId === 'string'
    && unlockedSet.has(archive.lastSelectedEventId)
    ? archive.lastSelectedEventId
    : null;
  return {
    version: 1,
    unlockedEventIds,
    seenEventIds: bossArchiveEventIds(archive.seenEventIds)
      .filter((eventId) => unlockedSet.has(eventId)),
    lastSelectedEventId,
    records: Object.fromEntries(BOSS_ARCHIVE_EVENT_IDS.flatMap((eventId) => (
      records[eventId] === undefined
        ? []
        : [[eventId, sanitizeBossArchiveRecord(records[eventId])]]
    ))),
    dailyChallenge: storedDateKey === utcDateKey
      ? {
          utcDateKey,
          successfulClearsUsed: integer(dailyChallenge.successfulClearsUsed, 0, 99),
          processedClearIds: stringList(dailyChallenge.processedClearIds, {
            maxItems: 64,
            maxLength: 120
          })
        }
      : {
          utcDateKey,
          successfulClearsUsed: 0,
          processedClearIds: []
        }
  };
};

const earliestIso = (left, right) => {
  const normalizedLeft = optionalIso(left);
  const normalizedRight = optionalIso(right);
  if (!normalizedLeft) return normalizedRight;
  if (!normalizedRight) return normalizedLeft;
  return normalizedLeft < normalizedRight ? normalizedLeft : normalizedRight;
};

const minimumDuration = (left, right) => {
  const normalizedLeft = optionalDuration(left);
  const normalizedRight = optionalDuration(right);
  if (normalizedLeft === null) return normalizedRight;
  if (normalizedRight === null) return normalizedLeft;
  return Math.min(normalizedLeft, normalizedRight);
};

const mergeProtectedBossArchiveRecord = (currentValue, incomingValue) => {
  const current = sanitizeBossArchiveRecord(currentValue);
  const incoming = sanitizeBossArchiveRecord(incomingValue);
  const currentPlayedAt = current.lastResult?.playedAt || '';
  const incomingPlayedAt = incoming.lastResult?.playedAt || '';
  const practiceAttempts = Math.max(current.practiceAttempts, incoming.practiceAttempts);
  const practiceClears = Math.max(current.practiceClears, incoming.practiceClears);
  const incomingPracticeResult = incoming.lastResult?.mode === 'practice'
    && incomingPlayedAt >= currentPlayedAt;
  return {
    // Practice remains local/offline-capable. Official Challenge fields are
    // copied only from the canonical row and change only through settlement.
    attempts: Math.max(current.attempts, current.challengeAttempts + practiceAttempts),
    practiceAttempts,
    challengeAttempts: current.challengeAttempts,
    totalClears: Math.max(current.totalClears, current.challengeClears + practiceClears),
    practiceClears,
    challengeClears: current.challengeClears,
    noHitClears: Math.max(current.noHitClears, incoming.noHitClears),
    bestClearTimeMs: minimumDuration(current.bestClearTimeMs, incoming.bestClearTimeMs),
    bestChallengeTimeMs: current.bestChallengeTimeMs,
    bestNoHitTimeMs: minimumDuration(current.bestNoHitTimeMs, incoming.bestNoHitTimeMs),
    mastery: Object.fromEntries(BOSS_ARCHIVE_MASTERY_IDS.map((id) => [id, {
      completedAt: current.mastery[id]?.completedAt ?? null,
      // Claiming a completed cosmetic node remains a normal profile action;
      // an ordinary save cannot invent the completion that makes it claimable.
      claimedAt: current.mastery[id]?.completedAt
        ? earliestIso(current.mastery[id]?.claimedAt, incoming.mastery[id]?.claimedAt)
        : null
    }])),
    processedResultIds: current.processedResultIds,
    lastResult: incomingPracticeResult
      ? incoming.lastResult
      : current.lastResult
  };
};

const preserveBossArchiveServerState = ({
  currentSnapshot,
  incomingSnapshot,
  dailyLedger = null,
  now
}) => {
  if (!currentSnapshot) return incomingSnapshot;
  const currentArchive = currentSnapshot.permanentState.bossArchive;
  const incomingArchive = incomingSnapshot.permanentState.bossArchive;
  const unlockedEventIds = bossArchiveEventIds([
    ...currentArchive.unlockedEventIds,
    ...incomingArchive.unlockedEventIds
  ]);
  const unlockedSet = new Set(unlockedEventIds);
  const seenEventIds = bossArchiveEventIds([
    ...currentArchive.seenEventIds,
    ...incomingArchive.seenEventIds
  ]).filter((eventId) => unlockedSet.has(eventId));
  const records = Object.fromEntries(BOSS_ARCHIVE_EVENT_IDS.flatMap((eventId) => {
    const currentRecord = currentArchive.records[eventId];
    const incomingRecord = incomingArchive.records[eventId];
    return currentRecord || incomingRecord
      ? [[eventId, mergeProtectedBossArchiveRecord(currentRecord, incomingRecord)]]
      : [];
  }));
  const utcDateKey = isoNow(now).slice(0, 10);
  const currentDaily = currentArchive.dailyChallenge.utcDateKey === utcDateKey
    ? currentArchive.dailyChallenge
    : { utcDateKey, successfulClearsUsed: 0, processedClearIds: [] };
  const incomingDaily = incomingArchive.dailyChallenge.utcDateKey === utcDateKey
    ? incomingArchive.dailyChallenge
    : { utcDateKey, successfulClearsUsed: 0, processedClearIds: [] };
  const ledgerIds = Array.isArray(dailyLedger)
    ? dailyLedger.map((row) => `boss-archive:${row.result_id}`)
    : [];
  const dailyChallenge = {
    utcDateKey,
    successfulClearsUsed: Array.isArray(dailyLedger)
      ? Math.min(99, dailyLedger.length)
      : Math.max(currentDaily.successfulClearsUsed, incomingDaily.successfulClearsUsed),
    processedClearIds: stringList([
      ...currentDaily.processedClearIds,
      ...incomingDaily.processedClearIds,
      ...ledgerIds
    ], { maxItems: 64, maxLength: 120 })
  };
  const requestedSelection = incomingArchive.lastSelectedEventId
    ?? currentArchive.lastSelectedEventId;
  return {
    ...incomingSnapshot,
    permanentState: {
      ...incomingSnapshot.permanentState,
      bossArchive: {
        ...incomingArchive,
        unlockedEventIds,
        seenEventIds,
        lastSelectedEventId: requestedSelection && unlockedSet.has(requestedSelection)
          ? requestedSelection
          : null,
        records,
        dailyChallenge
      }
    }
  };
};

const fetchBossArchiveDailyLedger = async (address, now = Date.now()) => {
  const walletAddress = normalizeWalletAddress(address);
  const utcDateKey = isoNow(now).slice(0, 10);
  if (!walletAddress) return null;
  try {
    const rows = await fetchSupabaseJson(
      `${BOSS_ARCHIVE_RESULTS_TABLE}?select=result_id&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + `&utc_date=eq.${encodeURIComponent(utcDateKey)}&order=settled_at.asc&limit=99`,
      { headers: supabaseHeaders() }
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (/PGRST205|schema cache|Could not find the table/i.test(String(error?.message || ''))) {
      return null;
    }
    throw error;
  }
};

const inferLegacyBossArchiveEventIds = (lifetimeStats) => {
  const highestMission = integer(lifetimeStats.highestWave, 0, FINAL_CAMPAIGN_MISSION);
  const bossesDefeated = integer(lifetimeStats.bossesDefeated, 0, 1_000_000_000);
  const campaignCompleted = highestMission >= FINAL_CAMPAIGN_MISSION
    && bossesDefeated >= FINAL_CAMPAIGN_MISSION;
  const completedThrough = campaignCompleted
    ? FINAL_CAMPAIGN_MISSION
    : Math.max(0, Math.min(FINAL_CAMPAIGN_MISSION, highestMission - 1));

  if (completedThrough > 0) {
    return BOSS_ARCHIVE_ENTRIES
      .filter((entry) => entry.missionNumber <= completedThrough)
      .map((entry) => entry.eventId);
  }
  if (highestMission === 0 && bossesDefeated > 0) {
    return BOSS_ARCHIVE_EVENT_IDS.slice(0, Math.min(bossesDefeated, BOSS_ARCHIVE_EVENT_IDS.length));
  }
  return [];
};

const isoNow = (now) => new Date(now).toISOString();

const createUpgradeLevels = () => ({
  fireRate: 0,
  speed: 0,
  startingHearts: 0
});

const createShipUpgrades = () => Object.fromEntries(
  PLAYER_SHIP_IDS.map((shipId) => [shipId, createUpgradeLevels()])
);

const createWeeklyState = (profileId, now) => ({
  version: 3,
  profileId,
  weekKey: getWeeklyBoundaryMeta(new Date(now)).weekKey,
  coins: 0,
  unlockedSlots: { left: false, right: false },
  ownedMiniShips: {},
  equipped: { left: null, right: null },
  shipUpgrades: createShipUpgrades(),
  creditedCampaignRewardIds: [],
  weeklyStats: {
    runs: 0,
    score: 0,
    enemiesDefeated: 0,
    coinsEarned: 0
  },
  updatedAt: isoNow(now)
});

const sanitizeWeeklyState = (rawValue, profileId, now) => {
  const value = asObject(rawValue);
  const fallback = createWeeklyState(profileId, now);
  const isCurrentWeek = value.weekKey === fallback.weekKey;

  const ownedMiniShips = {};
  Object.entries(asObject(value.ownedMiniShips)).forEach(([id, level]) => {
    if (MINI_SHIP_ID_SET.has(id)) ownedMiniShips[id] = integer(level, 1, 5);
  });
  const shipUpgrades = createShipUpgrades();
  const rawUpgrades = asObject(value.shipUpgrades);
  PLAYER_SHIP_IDS.forEach((shipId) => {
    const levels = asObject(rawUpgrades[shipId]);
    shipUpgrades[shipId] = {
      fireRate: integer(levels.fireRate, 0, 21),
      speed: integer(levels.speed, 0, 7),
      startingHearts: integer(levels.startingHearts, 0, 7)
    };
  });
  const equipped = {};
  ['left', 'right'].forEach((slot) => {
    const id = asObject(value.equipped)[slot];
    equipped[slot] = MINI_SHIP_ID_SET.has(id) && ownedMiniShips[id] ? id : null;
  });
  const weeklyStats = asObject(value.weeklyStats);
  return {
    ...fallback,
    // Competition currency and run totals restart each week. Hangar ownership,
    // equipment, and upgrade levels remain durable across that boundary.
    coins: isCurrentWeek ? integer(value.coins, 0, 1_000_000_000) : 0,
    unlockedSlots: {
      left: Boolean(asObject(value.unlockedSlots).left),
      right: Boolean(asObject(value.unlockedSlots).right)
    },
    ownedMiniShips,
    equipped,
    shipUpgrades,
    creditedCampaignRewardIds: stringList(value.creditedCampaignRewardIds, {
      maxItems: 1024,
      maxLength: 180
    }).filter((id) => id.startsWith('campaign:')),
    weeklyStats: isCurrentWeek
      ? {
          runs: integer(weeklyStats.runs, 0, 1_000_000),
          score: integer(weeklyStats.score, 0, 1_000_000_000),
          enemiesDefeated: integer(weeklyStats.enemiesDefeated, 0, 1_000_000_000),
          coinsEarned: integer(weeklyStats.coinsEarned, 0, 1_000_000_000)
        }
      : fallback.weeklyStats,
    updatedAt: isoNow(now)
  };
};

const sanitizePermanentState = (rawValue, profileId, now) => {
  const value = asObject(rawValue);
  const dailyGifts = asObject(value.dailyGifts);
  const lifetimeStats = asObject(value.lifetimeStats);
  const bossArchive = asObject(value.bossArchive);
  const hasStoredBossArchive = Boolean(
    value.bossArchive
    && typeof value.bossArchive === 'object'
    && !Array.isArray(value.bossArchive)
  );
  const unlockedEventIds = hasStoredBossArchive
    ? bossArchiveEventIds(bossArchive.unlockedEventIds)
    : inferLegacyBossArchiveEventIds(lifetimeStats);
  const lastClaimDate = typeof dailyGifts.lastClaimDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(dailyGifts.lastClaimDate)
    ? dailyGifts.lastClaimDate
    : null;
  const achievementTiers = {};
  Object.entries(asObject(value.achievementTiers)).forEach(([id, tier]) => {
    if (ACHIEVEMENT_IDS.has(id)) achievementTiers[id] = integer(tier, 0, 5);
  });

  // Minted ownership is derived from verified onchain mint records and must
  // never be accepted from an offchain wallet-profile snapshot.
  return {
    version: 1,
    profileId,
    cosmetics: stringList(value.cosmetics, { maxItems: 100, maxLength: 80 }),
    weeklyArchive: stringList(value.weeklyArchive, {
      maxItems: 260,
      maxLength: 10,
      pattern: /^\d{4}-\d{2}-\d{2}$/
    }),
    dailyGifts: {
      currentDay: integer(dailyGifts.currentDay, 0, 30),
      lastClaimDate
    },
    lifetimeStats: {
      runs: integer(lifetimeStats.runs, 0, 1_000_000_000),
      highestWave: integer(lifetimeStats.highestWave, 0, 1_000_000),
      enemiesDefeated: integer(lifetimeStats.enemiesDefeated, 0, 1_000_000_000),
      bossesDefeated: integer(lifetimeStats.bossesDefeated, 0, 1_000_000_000),
      coinsCollected: integer(lifetimeStats.coinsCollected, 0, 1_000_000_000),
      bestScore: integer(lifetimeStats.bestScore, 0, 1_000_000_000)
    },
    achievementTiers,
    unlockedPlayerShips: stringList(value.unlockedPlayerShips, {
      maxItems: PLAYER_SHIP_IDS.length,
      maxLength: 16
    }).filter((id) => PLAYER_SHIP_ID_SET.has(id)),
    bossArchive: sanitizeBossArchiveProgress(bossArchive, unlockedEventIds, now),
    campaignProgress: sanitizeCampaignProgress(value.campaignProgress, lifetimeStats, now),
    updatedAt: isoNow(now)
  };
};

const sanitizeStats = (rawValue) => {
  const value = asObject(rawValue);
  return {
    highScore: integer(value.highScore, 0, 1_000_000_000),
    totalCoins: integer(value.totalCoins, 0, 1_000_000_000),
    playerName: text(value.playerName, 15)
  };
};

const sanitizeWalletSnapshot = (rawSnapshot, address, now = Date.now()) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const profileId = walletProfileId(walletAddress);
  const snapshot = asObject(rawSnapshot);
  const sanitized = {
    weeklyState: sanitizeWeeklyState(snapshot.weeklyState, profileId, now),
    permanentState: sanitizePermanentState(snapshot.permanentState, profileId, now),
    stats: sanitizeStats(snapshot.stats),
    selectedShipId: PLAYER_SHIP_ID_SET.has(snapshot.selectedShipId)
      ? snapshot.selectedShipId
      : 'researchhub'
  };
  if (Buffer.byteLength(JSON.stringify(sanitized), 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw apiError('The wallet profile snapshot is too large.', 413);
  }
  return sanitized;
};

const rowToProfile = (row, now = Date.now()) => {
  if (!row) return null;
  const walletAddress = normalizeWalletAddress(row.wallet_address);
  if (!walletAddress) return null;
  return {
    walletAddress,
    profileId: walletProfileId(walletAddress),
    revision: integer(row.revision, 1, Number.MAX_SAFE_INTEGER),
    snapshot: sanitizeWalletSnapshot(row.snapshot, walletAddress, now),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null
  };
};

const fetchWalletProfile = async (address, now = Date.now()) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const rows = await fetchSupabaseJson(
    `${PROFILES_TABLE}?select=wallet_address,revision,snapshot,updated_at&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return rowToProfile(Array.isArray(rows) ? rows[0] : null, now);
};

const createWalletProfileChallenge = async ({ address, origin, now = Date.now() }) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Number(now) + CHALLENGE_LIFETIME_MS).toISOString();
  const message = makeWalletProfileMessage({
    address: walletAddress,
    challengeId,
    expiresAt,
    origin
  });
  await fetchSupabaseJson(CHALLENGES_TABLE, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      challenge_id: challengeId,
      wallet_address: walletAddress,
      message,
      expires_at: expiresAt
    })
  });
  return { challengeId, message, expiresAt };
};

const getWalletProfileChallenge = async ({ address, challengeId, now = Date.now() }) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress || !/^[0-9a-f-]{36}$/i.test(String(challengeId || ''))) {
    throw apiError('Wallet and challenge are required.', 400);
  }
  const rows = await fetchSupabaseJson(
    `${CHALLENGES_TABLE}?select=challenge_id,wallet_address,message,expires_at,used_at&challenge_id=eq.${encodeURIComponent(challengeId)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const challenge = Array.isArray(rows) ? rows[0] : null;
  if (!challenge || new Date(challenge.expires_at).getTime() <= Number(now)) {
    throw apiError('This wallet profile challenge is missing or expired.', 410);
  }
  if (challenge.wallet_address !== walletAddress) {
    throw apiError('The wallet profile challenge does not match this account.', 403);
  }
  if (challenge.used_at) {
    throw apiError('This wallet profile challenge was already used.', 410);
  }
  return challenge;
};

const consumeWalletProfileChallenge = async (challengeId, now = Date.now()) => {
  const rows = await fetchSupabaseJson(
    `${CHALLENGES_TABLE}?challenge_id=eq.${encodeURIComponent(challengeId)}&used_at=is.null`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ used_at: isoNow(now) })
    }
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw apiError('This wallet profile challenge was already used.', 409);
  }
};

const saveWalletProfile = async ({
  address,
  expectedRevision,
  snapshot,
  now = Date.now()
}) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const revision = Number(expectedRevision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw apiError('A valid expectedRevision is required.', 400);
  }
  let sanitizedSnapshot = sanitizeWalletSnapshot(snapshot, walletAddress, now);
  if (revision > 0) {
    const current = await fetchWalletProfile(walletAddress, now);
    if (!current || current.revision !== revision) {
      throw apiError(
        'This wallet profile changed on another device. Reload it before saving again.',
        409,
        { currentRevision: current?.revision ?? 0, currentProfile: current }
      );
    }
    const dailyLedger = await fetchBossArchiveDailyLedger(walletAddress, now);
    sanitizedSnapshot = preserveBossArchiveServerState({
      currentSnapshot: current.snapshot,
      incomingSnapshot: sanitizedSnapshot,
      dailyLedger,
      now
    });
  }
  const updatedAt = isoNow(now);
  let rows;

  if (revision === 0) {
    rows = await fetchSupabaseJson(`${PROFILES_TABLE}?on_conflict=wallet_address`, {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=ignore-duplicates,return=representation'
      }),
      body: JSON.stringify({
        wallet_address: walletAddress,
        revision: 1,
        snapshot: sanitizedSnapshot,
        updated_at: updatedAt
      })
    });
  } else {
    rows = await fetchSupabaseJson(
      `${PROFILES_TABLE}?wallet_address=eq.${encodeURIComponent(walletAddress)}&revision=eq.${revision}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({
          revision: revision + 1,
          snapshot: sanitizedSnapshot,
          updated_at: updatedAt
        })
      }
    );
  }

  const saved = Array.isArray(rows) ? rows[0] : null;
  if (!saved) {
    const current = await fetchWalletProfile(walletAddress, now);
    throw apiError(
      'This wallet profile changed on another device. Reload it before saving again.',
      409,
      { currentRevision: current?.revision ?? 0, currentProfile: current }
    );
  }
  return rowToProfile(saved, now);
};

module.exports = {
  CHALLENGES_TABLE,
  CHALLENGE_LIFETIME_MS,
  MAX_SNAPSHOT_BYTES,
  PROFILES_TABLE,
  consumeWalletProfileChallenge,
  createWalletProfileChallenge,
  createWeeklyState,
  fetchWalletProfile,
  fetchBossArchiveDailyLedger,
  getBossArchiveChallengeConfig,
  getWalletProfileChallenge,
  rowToProfile,
  sanitizeCampaignProgress,
  sanitizePermanentState,
  sanitizeStats,
  sanitizeWalletSnapshot,
  sanitizeWeeklyState,
  preserveBossArchiveServerState,
  saveWalletProfile
};
