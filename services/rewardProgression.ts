import {
  awardWeeklySquadCoins,
  type WeeklySquadState,
  type PermanentLifetimeStats,
  type PermanentSquadState
} from './squadProgression';
import type { PlayerShipId } from './playerShipService';
import { normalizeBossArchiveEventIds } from './bossArchive';
import {
  beginBossArchiveFight,
  claimBossArchiveMasteryReward,
  recordBossArchiveFightResult,
  sanitizeBossArchiveBossRecord,
  type BossArchiveFightLaunchInput,
  type BossArchiveFightLaunchResolution,
  type BossArchiveFightResultInput,
  type BossArchiveFightResolution,
  type BossArchiveMasteryObjectiveId
} from './bossArchiveProgression';

export interface BossArchiveEconomyResolution {
  permanentState: PermanentSquadState;
  weeklyState: WeeklySquadState;
  result: BossArchiveFightResolution;
}

export interface BossArchiveEconomyLaunchResolution {
  permanentState: PermanentSquadState;
  weeklyState: WeeklySquadState;
  result: BossArchiveFightLaunchResolution;
}

export interface DailyGiftReward {
  day: number;
  coins: number;
  shipId?: PlayerShipId;
}

export interface DailyGiftStatus {
  claimableDay: number;
  claimedToday: boolean;
  isAvailable: boolean;
  streakReset: boolean;
}

export type AchievementId =
  | 'sector-pioneer'
  | 'boss-breaker'
  | 'research-hunter'
  | 'coin-collector'
  | 'mission-veteran'
  | 'ace-score'
  | 'campaign-cartographer'
  | 'mission-perfectionist'
  | 'elite-hunter'
  | 'gauntlet-runner'
  | 'deep-sector'
  | 'hangar-engineer';

type LifetimeStatKey = keyof PermanentLifetimeStats;

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  /** Copy used when a tier target is exactly 1, where the plural reads wrong. */
  descriptionOne?: string;
  metric: LifetimeStatKey;
  targets: readonly number[];
  rewards: readonly number[];
}

export interface AchievementStatus {
  definition: AchievementDefinition;
  claimedTiers: number;
  tier: number;
  target: number;
  progress: number;
  rewardCoins: number;
  complete: boolean;
  allClaimed: boolean;
}

const DAILY_COIN_REWARDS = [
  50, 100, 200, 400, 800,
  250, 250, 250, 250, 250,
  250, 250, 250, 500, 250,
  250, 250, 250, 250, 250,
  500, 300, 300, 300, 300,
  300, 300, 300, 300, 1000
] as const;

export const DAILY_GIFT_REWARDS: readonly DailyGiftReward[] = DAILY_COIN_REWARDS.map((coins, index) => {
  const day = index + 1;
  return {
    day,
    coins,
    ...(day === 14 ? { shipId: 'eth' as const } : {}),
    ...(day === 30 ? { shipId: 'btc' as const } : {})
  };
});

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'sector-pioneer',
    title: 'Sector Pioneer',
    description: 'Reach Mission {target}',
    metric: 'highestWave',
    targets: [2, 4, 6, 10, 15],
    rewards: [65, 100, 135, 180, 220]
  },
  {
    id: 'boss-breaker',
    title: 'Boss Breaker',
    description: 'Defeat {target} bosses',
    metric: 'bossesDefeated',
    targets: [2, 5, 10, 25, 50],
    rewards: [80, 125, 170, 235, 290]
  },
  {
    id: 'research-hunter',
    title: 'Research Hunter',
    description: 'Defeat {target} enemies',
    metric: 'enemiesDefeated',
    targets: [100, 500, 1500, 5000, 10000],
    rewards: [80, 125, 170, 235, 290]
  },
  {
    id: 'coin-collector',
    title: 'Grant Collector',
    description: 'Collect {target} Tokens',
    metric: 'coinsCollected',
    targets: [100, 500, 1500, 5000, 10000],
    rewards: [65, 100, 135, 180, 220]
  },
  {
    id: 'mission-veteran',
    title: 'Mission Veteran',
    description: 'Complete {target} runs',
    metric: 'runs',
    targets: [3, 10, 25, 50, 100],
    rewards: [70, 110, 150, 210, 260]
  },
  {
    id: 'ace-score',
    title: 'Arcade Ace',
    description: 'Score {target} points in one run',
    metric: 'bestScore',
    targets: [1000, 5000, 10000, 25000, 50000],
    rewards: [85, 135, 180, 245, 305]
  },
  // Every achievement above scores the arcade loop. These cover the systems the
  // game actually grew into: a 50-Mission Campaign graph, the Weekly Run
  // gauntlet, the ten Elite Bosses, and the Hangar.
  {
    id: 'campaign-cartographer',
    title: 'Campaign Cartographer',
    description: 'Clear {target} Campaign Missions',
    metric: 'campaignMissionsCleared',
    targets: [5, 15, 30, 50, 60],
    rewards: [95, 145, 200, 275, 335]
  },
  {
    id: 'mission-perfectionist',
    title: 'Mission Perfectionist',
    description: 'Master {target} Missions with every objective',
    metric: 'campaignMissionsMastered',
    targets: [3, 10, 20, 35, 50],
    rewards: [105, 160, 220, 300, 365]
  },
  {
    id: 'elite-hunter',
    title: 'Elite Hunter',
    description: 'Defeat {target} Elite Bosses',
    metric: 'eliteBossesDefeated',
    targets: [5, 15, 40, 80, 150],
    rewards: [85, 135, 180, 245, 305]
  },
  {
    id: 'gauntlet-runner',
    title: 'Gauntlet Runner',
    description: 'Finish {target} Weekly Runs',
    descriptionOne: 'Finish a full Weekly Run',
    metric: 'weeklyRunsCompleted',
    targets: [1, 5, 15, 30, 60],
    rewards: [100, 155, 210, 285, 350]
  },
  {
    id: 'deep-sector',
    title: 'Deep Sector',
    description: 'Reach Weekly Run Sector {target}',
    metric: 'weeklyBestSector',
    targets: [2, 4, 6, 8, 9],
    rewards: [80, 125, 170, 235, 290]
  },
  {
    id: 'hangar-engineer',
    title: 'Hangar Engineer',
    description: 'Purchase {target} Hangar upgrades',
    metric: 'hangarUpgradesPurchased',
    targets: [5, 15, 35, 70, 120],
    rewards: [70, 110, 150, 210, 260]
  }
];

const ACHIEVEMENT_BY_ID = new Map(
  ACHIEVEMENT_DEFINITIONS.map((definition) => [definition.id, definition])
);

const localDateKey = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0')
].join('-');

const dateKeyOrdinal = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

export const getDailyGiftStatus = (
  state: PermanentSquadState,
  now = new Date()
): DailyGiftStatus => {
  const today = localDateKey(now);
  const lastClaimDate = state.dailyGifts.lastClaimDate;
  if (!lastClaimDate) {
    return { claimableDay: 1, claimedToday: false, isAvailable: true, streakReset: false };
  }
  if (lastClaimDate === today) {
    return {
      claimableDay: Math.max(1, state.dailyGifts.currentDay),
      claimedToday: true,
      isAvailable: false,
      streakReset: false
    };
  }

  const todayOrdinal = dateKeyOrdinal(today);
  const lastOrdinal = dateKeyOrdinal(lastClaimDate);
  const daysSinceClaim = todayOrdinal !== null && lastOrdinal !== null
    ? todayOrdinal - lastOrdinal
    : 2;
  if (daysSinceClaim <= 0) {
    return {
      claimableDay: Math.max(1, state.dailyGifts.currentDay),
      claimedToday: true,
      isAvailable: false,
      streakReset: false
    };
  }
  if (daysSinceClaim === 1) {
    return {
      claimableDay: state.dailyGifts.currentDay >= 30 ? 1 : state.dailyGifts.currentDay + 1,
      claimedToday: false,
      isAvailable: true,
      streakReset: false
    };
  }
  return { claimableDay: 1, claimedToday: false, isAvailable: true, streakReset: true };
};

export const claimDailyGift = (
  state: PermanentSquadState,
  now = new Date()
): { state: PermanentSquadState; reward: DailyGiftReward } | null => {
  const status = getDailyGiftStatus(state, now);
  if (!status.isAvailable) return null;
  const reward = DAILY_GIFT_REWARDS[status.claimableDay - 1];
  if (!reward) return null;
  const unlockedPlayerShips = reward.shipId && !state.unlockedPlayerShips.includes(reward.shipId)
    ? [...state.unlockedPlayerShips, reward.shipId]
    : state.unlockedPlayerShips;
  return {
    reward,
    state: {
      ...state,
      dailyGifts: {
        currentDay: status.claimableDay,
        lastClaimDate: localDateKey(now)
      },
      unlockedPlayerShips,
      updatedAt: now.toISOString()
    }
  };
};

export const recordLifetimeRun = (
  state: PermanentSquadState,
  result: {
    score: number;
    wave: number;
    enemiesDefeated: number;
    coinsCollected: number;
    /** Set only for a Weekly Run, so the gauntlet achievements stay mode-specific. */
    weeklyRun?: { completed: boolean; sectorReached: number };
  }
): PermanentSquadState => ({
  ...state,
  lifetimeStats: {
    ...state.lifetimeStats,
    runs: state.lifetimeStats.runs + 1,
    highestWave: Math.max(state.lifetimeStats.highestWave, Math.max(0, Math.floor(result.wave))),
    enemiesDefeated: state.lifetimeStats.enemiesDefeated + Math.max(0, Math.floor(result.enemiesDefeated)),
    coinsCollected: state.lifetimeStats.coinsCollected + Math.max(0, Math.floor(result.coinsCollected)),
    bestScore: Math.max(state.lifetimeStats.bestScore, Math.max(0, Math.floor(result.score))),
    weeklyRunsCompleted: state.lifetimeStats.weeklyRunsCompleted
      + (result.weeklyRun?.completed ? 1 : 0),
    // Depth counts even on a run that ended in defeat -- reaching Sector 8 and
    // dying is still the achievement the player earned.
    weeklyBestSector: Math.max(
      state.lifetimeStats.weeklyBestSector,
      Math.max(0, Math.floor(result.weeklyRun?.sectorReached ?? 0))
    )
  },
  updatedAt: new Date().toISOString()
});

export const recordBossVictory = (
  state: PermanentSquadState,
  encounterId: string
): PermanentSquadState => {
  const [normalizedEncounterId] = normalizeBossArchiveEventIds([encounterId]);
  if (!normalizedEncounterId) return state;
  const newlyUnlocked = !state.bossArchive.unlockedEventIds.includes(normalizedEncounterId);
  const previousRecord = sanitizeBossArchiveBossRecord(
    state.bossArchive.records[normalizedEncounterId]
  );
  return {
    ...state,
    bossArchive: {
      ...state.bossArchive,
      unlockedEventIds: normalizeBossArchiveEventIds([
        ...state.bossArchive.unlockedEventIds,
        normalizedEncounterId
      ]),
      lastSelectedEventId: newlyUnlocked
        ? normalizedEncounterId
        : state.bossArchive.lastSelectedEventId,
      records: {
        ...state.bossArchive.records,
        [normalizedEncounterId]: {
          ...previousRecord,
          totalClears: previousRecord.totalClears + 1
        }
      }
    },
    lifetimeStats: {
      ...state.lifetimeStats,
      bossesDefeated: state.lifetimeStats.bossesDefeated + 1
    },
    updatedAt: new Date().toISOString()
  };
};

export const markBossArchiveViewed = (
  state: PermanentSquadState,
  encounterId?: string
): PermanentSquadState => {
  const unlockedEventIds = normalizeBossArchiveEventIds(
    state.bossArchive.unlockedEventIds
  );
  const unlockedEventIdSet = new Set(unlockedEventIds);
  const seenEventIds = normalizeBossArchiveEventIds(
    state.bossArchive.seenEventIds
  ).filter((eventId) => unlockedEventIdSet.has(eventId));
  const [viewedEventId] = normalizeBossArchiveEventIds([encounterId]);
  const nextSeenEventIds = viewedEventId && unlockedEventIdSet.has(viewedEventId)
    ? normalizeBossArchiveEventIds([...seenEventIds, viewedEventId])
    : seenEventIds;
  const archiveAlreadyNormalized = unlockedEventIds.length === state.bossArchive.unlockedEventIds.length
    && unlockedEventIds.every((eventId, index) => (
      eventId === state.bossArchive.unlockedEventIds[index]
    ))
    && nextSeenEventIds.length === state.bossArchive.seenEventIds.length
    && nextSeenEventIds.every((eventId, index) => (
      eventId === state.bossArchive.seenEventIds[index]
    ));
  if (archiveAlreadyNormalized) {
    return state;
  }
  return {
    ...state,
    bossArchive: {
      ...state.bossArchive,
      unlockedEventIds,
      seenEventIds: nextSeenEventIds
    },
    updatedAt: new Date().toISOString()
  };
};

/** Reserves one daily charge and records the Archive attempt before gameplay. */
export const beginBossArchiveFightEconomy = (
  permanentState: PermanentSquadState,
  weeklyState: WeeklySquadState,
  input: BossArchiveFightLaunchInput,
  options: { now?: Date; dailyLimit?: number } = {}
): BossArchiveEconomyLaunchResolution => {
  const result = beginBossArchiveFight(
    permanentState.bossArchive,
    input,
    options
  );
  const now = options.now ?? new Date();
  return {
    permanentState: result.state === permanentState.bossArchive
      ? permanentState
      : {
          ...permanentState,
          bossArchive: result.state,
          updatedAt: now.toISOString()
        },
    weeklyState,
    result
  };
};

/**
 * Settles an already-reserved Archive fight and applies its existing reward.
 * This transition never spends a daily charge; losing runs were charged when
 * they launched through beginBossArchiveFightEconomy.
 */
export const resolveBossArchiveFightEconomy = (
  permanentState: PermanentSquadState,
  weeklyState: WeeklySquadState,
  input: BossArchiveFightResultInput,
  options: { now?: Date; dailyLimit?: number } = {}
): BossArchiveEconomyResolution => {
  const result = recordBossArchiveFightResult(
    permanentState.bossArchive,
    input,
    options
  );
  const now = options.now ?? new Date();
  return {
    permanentState: result.state === permanentState.bossArchive
      ? permanentState
      : {
          ...permanentState,
          bossArchive: result.state,
          updatedAt: now.toISOString()
        },
    weeklyState: result.challengeRewardCoins > 0
      ? awardWeeklySquadCoins(
          weeklyState,
          result.challengeRewardCoins,
          `boss-archive:${input.eventId}`
        )
      : weeklyState,
    result
  };
};

export const claimBossArchiveMasteryEconomyReward = (
  permanentState: PermanentSquadState,
  weeklyState: WeeklySquadState,
  eventId: string,
  objectiveId: BossArchiveMasteryObjectiveId,
  now = new Date()
) => {
  const claim = claimBossArchiveMasteryReward(
    permanentState.bossArchive,
    eventId,
    objectiveId,
    now
  );
  return {
    permanentState: claim.claimed
      ? {
          ...permanentState,
          bossArchive: claim.state,
          cosmetics: claim.rewardCosmeticId
            ? Array.from(new Set([
                ...permanentState.cosmetics,
                claim.rewardCosmeticId
              ]))
            : permanentState.cosmetics,
          updatedAt: now.toISOString()
        }
      : permanentState,
    weeklyState: claim.rewardCoins > 0
      ? awardWeeklySquadCoins(
          weeklyState,
          claim.rewardCoins,
          `boss-mastery:${eventId}:${objectiveId}`
        )
      : weeklyState,
    claim
  };
};

export const getAchievementStatus = (
  state: PermanentSquadState,
  id: AchievementId
): AchievementStatus | null => {
  const definition = ACHIEVEMENT_BY_ID.get(id);
  if (!definition) return null;
  const claimedTiers = Math.max(0, Math.floor(state.achievementTiers[id] || 0));
  const allClaimed = claimedTiers >= definition.targets.length;
  const index = Math.min(claimedTiers, definition.targets.length - 1);
  const target = definition.targets[index];
  const progress = Math.max(0, Math.floor(state.lifetimeStats[definition.metric]));
  return {
    definition,
    claimedTiers,
    tier: Math.min(claimedTiers + 1, definition.targets.length),
    target,
    progress,
    rewardCoins: definition.rewards[index],
    complete: !allClaimed && progress >= target,
    allClaimed
  };
};

export const getClaimableAchievementCount = (state: PermanentSquadState) => (
  ACHIEVEMENT_DEFINITIONS.reduce((count, definition) => (
    count + (getAchievementStatus(state, definition.id)?.complete ? 1 : 0)
  ), 0)
);

export const claimAchievement = (
  state: PermanentSquadState,
  id: AchievementId
): { state: PermanentSquadState; rewardCoins: number } | null => {
  const status = getAchievementStatus(state, id);
  if (!status?.complete) return null;
  return {
    rewardCoins: status.rewardCoins,
    state: {
      ...state,
      achievementTiers: {
        ...state.achievementTiers,
        [id]: status.claimedTiers + 1
      },
      updatedAt: new Date().toISOString()
    }
  };
};

export const formatAchievementDescription = (status: AchievementStatus) => {
  // A tier target of 1 needs authored singular copy, not a depluralising
  // regex: the noun is not always the word after the number ("Finish 1 Weekly
  // Runs"), so guessing gets it wrong more often than it gets it right.
  const template = status.target === 1 && status.definition.descriptionOne
    ? status.definition.descriptionOne
    : status.definition.description;
  return template.replace('{target}', status.target.toLocaleString());
};
