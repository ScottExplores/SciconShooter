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
const FINAL_CAMPAIGN_MISSION = campaign.levels.reduce(
  (highest, level) => Math.max(highest, Math.max(0, Math.floor(Number(level.order) || 0))),
  0
);

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
  const unlockedEventIdSet = new Set(unlockedEventIds);
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
    bossArchive: {
      unlockedEventIds,
      seenEventIds: bossArchiveEventIds(bossArchive.seenEventIds)
        .filter((eventId) => unlockedEventIdSet.has(eventId))
    },
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
  const sanitizedSnapshot = sanitizeWalletSnapshot(snapshot, walletAddress, now);
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
  getWalletProfileChallenge,
  rowToProfile,
  sanitizePermanentState,
  sanitizeStats,
  sanitizeWalletSnapshot,
  sanitizeWeeklyState,
  saveWalletProfile
};
