import type {
  PermanentLifetimeStats,
  PermanentSquadState
} from './squadProgression';
import type { PlayerShipId } from './playerShipService';

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
  | 'ace-score';

type LifetimeStatKey = keyof PermanentLifetimeStats;

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
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
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
  210, 220, 230, 240, 250, 260, 270, 280, 290, 300
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
    description: 'Reach wave {target}',
    metric: 'highestWave',
    targets: [2, 4, 6, 10, 15],
    rewards: [150, 300, 500, 800, 1400]
  },
  {
    id: 'boss-breaker',
    title: 'Boss Breaker',
    description: 'Defeat {target} bosses',
    metric: 'bossesDefeated',
    targets: [2, 5, 10, 25, 50],
    rewards: [200, 400, 700, 1200, 2000]
  },
  {
    id: 'research-hunter',
    title: 'Research Hunter',
    description: 'Defeat {target} enemies',
    metric: 'enemiesDefeated',
    targets: [100, 500, 1500, 5000, 10000],
    rewards: [150, 350, 600, 1100, 1800]
  },
  {
    id: 'coin-collector',
    title: 'Grant Collector',
    description: 'Collect {target} research coins',
    metric: 'coinsCollected',
    targets: [100, 500, 1500, 5000, 10000],
    rewards: [100, 300, 600, 1000, 1700]
  },
  {
    id: 'mission-veteran',
    title: 'Mission Veteran',
    description: 'Complete {target} runs',
    metric: 'runs',
    targets: [3, 10, 25, 50, 100],
    rewards: [150, 350, 650, 1100, 1800]
  },
  {
    id: 'ace-score',
    title: 'Arcade Ace',
    description: 'Score {target} points in one run',
    metric: 'bestScore',
    targets: [1000, 5000, 10000, 25000, 50000],
    rewards: [200, 450, 800, 1400, 2400]
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
  }
): PermanentSquadState => ({
  ...state,
  lifetimeStats: {
    ...state.lifetimeStats,
    runs: state.lifetimeStats.runs + 1,
    highestWave: Math.max(state.lifetimeStats.highestWave, Math.max(0, Math.floor(result.wave))),
    enemiesDefeated: state.lifetimeStats.enemiesDefeated + Math.max(0, Math.floor(result.enemiesDefeated)),
    coinsCollected: state.lifetimeStats.coinsCollected + Math.max(0, Math.floor(result.coinsCollected)),
    bestScore: Math.max(state.lifetimeStats.bestScore, Math.max(0, Math.floor(result.score)))
  },
  updatedAt: new Date().toISOString()
});

export const recordBossVictory = (state: PermanentSquadState): PermanentSquadState => ({
  ...state,
  lifetimeStats: {
    ...state.lifetimeStats,
    bossesDefeated: state.lifetimeStats.bossesDefeated + 1
  },
  updatedAt: new Date().toISOString()
});

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

export const formatAchievementDescription = (status: AchievementStatus) => (
  status.definition.description.replace('{target}', status.target.toLocaleString())
);
