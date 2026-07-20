import { getWeeklyBoundaryMeta } from '../shared/weeklyCompetitionBoundary.browser';

export const SQUAD_PROFILE_VERSION = 1;
export const MAIN_SHIP_UPGRADE_MAX_LEVEL = 7;
export const MINI_SHIP_MAX_LEVEL = 5;
export const RIGHT_SQUAD_SLOT_UNLOCK_COST = 120;
export const WEEKLY_STARTING_COINS = 120;

export type SquadSlotId = 'left' | 'right';
export type MainShipUpgradeId = 'fireRate' | 'speed' | 'startingHearts';
export type MiniShipId =
  | 'citation-dart'
  | 'helix-wasp'
  | 'photon-manta'
  | 'quorum-crab'
  | 'axiom-orbiter'
  | 'archive-beetle'
  | 'beacon-kite'
  | 'prism-skimmer'
  | 'ledger-hammer'
  | 'nebula-tern';

export type SquadDomainEventName =
  | 'wallet_profile_loaded'
  | 'weekly_state_reset'
  | 'coin_earned'
  | 'slot_unlocked'
  | 'mini_ship_purchased'
  | 'mini_ship_upgraded'
  | 'squad_updated'
  | 'ship_upgraded'
  | 'run_started'
  | 'powerup_collected'
  | 'run_completed'
  | 'score_submitted'
  | 'mint_started'
  | 'mint_confirmed';

export interface MiniShipCatalogEntry {
  id: MiniShipId;
  name: string;
  role: string;
  description: string;
  purchaseCost: number;
  maxLevel: number;
  fireIntervalFrames: number;
  projectileDamage: number;
  projectileColor: string;
  frames: [string, string, string];
}

export interface WeeklySquadStats {
  runs: number;
  score: number;
  enemiesDefeated: number;
  coinsEarned: number;
}

export interface WeeklySquadState {
  version: number;
  profileId: string;
  weekKey: string;
  coins: number;
  unlockedSlots: Record<SquadSlotId, boolean>;
  ownedMiniShips: Partial<Record<MiniShipId, number>>;
  equipped: Record<SquadSlotId, MiniShipId | null>;
  upgrades: Record<MainShipUpgradeId, number>;
  weeklyStats: WeeklySquadStats;
  updatedAt: string;
}

export interface PermanentSquadState {
  version: number;
  profileId: string;
  mintedMiniShips: MiniShipId[];
  cosmetics: string[];
  weeklyArchive: string[];
  updatedAt: string;
}

export interface RuntimeSquadCompanion {
  slot: SquadSlotId;
  id: MiniShipId;
  level: number;
  frames: [string, string, string];
  fireIntervalFrames: number;
  projectileDamage: number;
  projectileColor: string;
}

export interface RuntimeSquadLoadout {
  profileId: string;
  weekKey: string;
  upgrades: Record<MainShipUpgradeId, number>;
  companions: RuntimeSquadCompanion[];
}

export interface SquadRunResult {
  score: number;
  enemiesDefeated: number;
  coinsCollected: number;
}

const MINI_ROOT = '/game-art/generated/ships/scicon-mini-squadron-pack-v1';

const miniFrames = (id: MiniShipId): [string, string, string] => [
  `${MINI_ROOT}/${id}/frames/${id}-01-neutral.png`,
  `${MINI_ROOT}/${id}/frames/${id}-02-flex-in.png`,
  `${MINI_ROOT}/${id}/frames/${id}-03-flex-out.png`
];

export const MINI_SHIP_CATALOG: readonly MiniShipCatalogEntry[] = [
  {
    id: 'citation-dart',
    name: 'Citation Dart',
    role: 'Starter scout',
    description: 'A nimble citation runner with a steady pulse cannon.',
    purchaseCost: 0,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 38,
    projectileDamage: 0.7,
    projectileColor: '#67e8f9',
    frames: miniFrames('citation-dart')
  },
  {
    id: 'helix-wasp',
    name: 'Helix Wasp',
    role: 'Rapid support',
    description: 'Short firing cycles make it strong against light formations.',
    purchaseCost: 80,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 32,
    projectileDamage: 0.62,
    projectileColor: '#a7f3d0',
    frames: miniFrames('helix-wasp')
  },
  {
    id: 'photon-manta',
    name: 'Photon Manta',
    role: 'Energy support',
    description: 'Slower photon bolts land with a heavier impact.',
    purchaseCost: 120,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 44,
    projectileDamage: 0.96,
    projectileColor: '#c4b5fd',
    frames: miniFrames('photon-manta')
  },
  {
    id: 'quorum-crab',
    name: 'Quorum Crab',
    role: 'Armored wing',
    description: 'A dependable heavy escort for sustained encounters.',
    purchaseCost: 160,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 48,
    projectileDamage: 1.08,
    projectileColor: '#fb7185',
    frames: miniFrames('quorum-crab')
  },
  {
    id: 'axiom-orbiter',
    name: 'Axiom Orbiter',
    role: 'Precision wing',
    description: 'Measured shots reward pilots who hold a clean line.',
    purchaseCost: 200,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 40,
    projectileDamage: 1,
    projectileColor: '#fde68a',
    frames: miniFrames('axiom-orbiter')
  },
  {
    id: 'archive-beetle',
    name: 'Archive Beetle',
    role: 'Heavy archive',
    description: 'A compact archival gunship with deliberate heavy pulses.',
    purchaseCost: 250,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 52,
    projectileDamage: 1.28,
    projectileColor: '#fbbf24',
    frames: miniFrames('archive-beetle')
  },
  {
    id: 'beacon-kite',
    name: 'Beacon Kite',
    role: 'Signal support',
    description: 'Fast signal bursts keep pressure on moving targets.',
    purchaseCost: 300,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 30,
    projectileDamage: 0.78,
    projectileColor: '#5eead4',
    frames: miniFrames('beacon-kite')
  },
  {
    id: 'prism-skimmer',
    name: 'Prism Skimmer',
    role: 'Prismatic wing',
    description: 'A balanced late-week escort with bright prism fire.',
    purchaseCost: 360,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 36,
    projectileDamage: 1.05,
    projectileColor: '#f0abfc',
    frames: miniFrames('prism-skimmer')
  },
  {
    id: 'ledger-hammer',
    name: 'Ledger Hammer',
    role: 'Siege support',
    description: 'Powerful ledger rounds trade speed for impact.',
    purchaseCost: 430,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 56,
    projectileDamage: 1.5,
    projectileColor: '#fca5a5',
    frames: miniFrames('ledger-hammer')
  },
  {
    id: 'nebula-tern',
    name: 'Nebula Tern',
    role: 'Elite support',
    description: 'An elite research escort tuned for high-wave runs.',
    purchaseCost: 520,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 34,
    projectileDamage: 1.32,
    projectileColor: '#93c5fd',
    frames: miniFrames('nebula-tern')
  }
] as const;

export const MINI_SHIP_BY_ID = Object.fromEntries(
  MINI_SHIP_CATALOG.map((entry) => [entry.id, entry])
) as Record<MiniShipId, MiniShipCatalogEntry>;

export const MAIN_SHIP_UPGRADES: ReadonlyArray<{
  id: MainShipUpgradeId;
  name: string;
  description: string;
  costs: readonly number[];
}> = [
  {
    id: 'fireRate',
    name: 'Fire Rate',
    description: 'Shortens the main weapon firing cycle.',
    costs: [40, 60, 90, 130, 180, 240, 320]
  },
  {
    id: 'speed',
    name: 'Movement Speed',
    description: 'Improves horizontal response and maximum movement.',
    costs: [35, 55, 80, 120, 170, 230, 300]
  },
  {
    id: 'startingHearts',
    name: 'Starting Hearts',
    description: 'Adds one starting heart for every weekly level.',
    costs: [60, 90, 130, 180, 240, 310, 390]
  }
];

const getProfileId = (walletAddress?: string | null) => walletAddress?.trim().toLowerCase() || 'guest';
const weeklyStorageKey = (profileId: string) => `scicon_weekly_squad_v${SQUAD_PROFILE_VERSION}:${profileId}`;
const permanentStorageKey = (profileId: string) => `scicon_permanent_squad_v${SQUAD_PROFILE_VERSION}:${profileId}`;
const nowIso = () => new Date().toISOString();
const clampLevel = (value: unknown, max = MAIN_SHIP_UPGRADE_MAX_LEVEL) => (
  Math.max(0, Math.min(max, Math.floor(Number(value) || 0)))
);

export const emitSquadDomainEvent = (
  type: SquadDomainEventName,
  payload: Record<string, unknown> = {}
) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('scicon:domain-event', {
    detail: { type, at: nowIso(), ...payload }
  }));
};

export const createWeeklySquadState = (
  walletAddress?: string | null,
  weekKey = getWeeklyBoundaryMeta(new Date()).weekKey
): WeeklySquadState => ({
  version: SQUAD_PROFILE_VERSION,
  profileId: getProfileId(walletAddress),
  weekKey,
  coins: WEEKLY_STARTING_COINS,
  unlockedSlots: { left: true, right: false },
  ownedMiniShips: {},
  equipped: { left: null, right: null },
  upgrades: { fireRate: 0, speed: 0, startingHearts: 0 },
  weeklyStats: { runs: 0, score: 0, enemiesDefeated: 0, coinsEarned: 0 },
  updatedAt: nowIso()
});

export const createPermanentSquadState = (walletAddress?: string | null): PermanentSquadState => ({
  version: SQUAD_PROFILE_VERSION,
  profileId: getProfileId(walletAddress),
  mintedMiniShips: [],
  cosmetics: [],
  weeklyArchive: [],
  updatedAt: nowIso()
});

const sanitizeWeeklyState = (
  value: Partial<WeeklySquadState>,
  walletAddress?: string | null
): WeeklySquadState => {
  const fallback = createWeeklySquadState(walletAddress);
  const owned = { ...fallback.ownedMiniShips };
  Object.entries(value.ownedMiniShips || {}).forEach(([id, level]) => {
    if (id in MINI_SHIP_BY_ID) owned[id as MiniShipId] = Math.max(1, clampLevel(level, MINI_SHIP_MAX_LEVEL));
  });
  const equipped = { ...fallback.equipped };
  (['left', 'right'] as SquadSlotId[]).forEach((slot) => {
    const id = value.equipped?.[slot];
    equipped[slot] = id && id in MINI_SHIP_BY_ID && owned[id] ? id : null;
  });
  return {
    ...fallback,
    ...value,
    version: SQUAD_PROFILE_VERSION,
    profileId: getProfileId(walletAddress),
    coins: Math.max(0, Math.floor(Number(value.coins) || 0)),
    unlockedSlots: {
      left: true,
      right: Boolean(value.unlockedSlots?.right)
    },
    ownedMiniShips: owned,
    equipped,
    upgrades: {
      fireRate: clampLevel(value.upgrades?.fireRate),
      speed: clampLevel(value.upgrades?.speed),
      startingHearts: clampLevel(value.upgrades?.startingHearts)
    },
    weeklyStats: {
      runs: Math.max(0, Math.floor(Number(value.weeklyStats?.runs) || 0)),
      score: Math.max(0, Math.floor(Number(value.weeklyStats?.score) || 0)),
      enemiesDefeated: Math.max(0, Math.floor(Number(value.weeklyStats?.enemiesDefeated) || 0)),
      coinsEarned: Math.max(0, Math.floor(Number(value.weeklyStats?.coinsEarned) || 0))
    },
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : nowIso()
  };
};

export const loadWeeklySquadState = (walletAddress?: string | null): WeeklySquadState => {
  const profileId = getProfileId(walletAddress);
  const currentWeek = getWeeklyBoundaryMeta(new Date()).weekKey;
  let state = createWeeklySquadState(walletAddress, currentWeek);

  // Guests receive a clean runtime squad. Hangar inventory belongs to a
  // connected wallet and must not leak in from an old shared-browser save.
  if (!walletAddress?.trim()) {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(weeklyStorageKey(profileId));
    }
    return state;
  }

  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(weeklyStorageKey(profileId)) : null;
    if (saved) state = sanitizeWeeklyState(JSON.parse(saved) as Partial<WeeklySquadState>, walletAddress);
  } catch {
    state = createWeeklySquadState(walletAddress, currentWeek);
  }

  if (state.weekKey !== currentWeek) {
    state = createWeeklySquadState(walletAddress, currentWeek);
    emitSquadDomainEvent('weekly_state_reset', { profileId, weekKey: currentWeek });
  }

  saveWeeklySquadState(state);
  emitSquadDomainEvent('wallet_profile_loaded', { profileId, weekKey: state.weekKey });
  return state;
};

export const saveWeeklySquadState = (state: WeeklySquadState) => {
  if (typeof window === 'undefined' || state.profileId === 'guest') return;
  window.localStorage.setItem(weeklyStorageKey(state.profileId), JSON.stringify({
    ...state,
    updatedAt: nowIso()
  }));
};

export const loadPermanentSquadState = (walletAddress?: string | null): PermanentSquadState => {
  const fallback = createPermanentSquadState(walletAddress);
  if (typeof window === 'undefined') return fallback;
  if (!walletAddress?.trim()) {
    window.localStorage.removeItem(permanentStorageKey(fallback.profileId));
    return fallback;
  }
  try {
    const saved = window.localStorage.getItem(permanentStorageKey(fallback.profileId));
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<PermanentSquadState>;
    return {
      ...fallback,
      ...parsed,
      version: SQUAD_PROFILE_VERSION,
      profileId: fallback.profileId,
      mintedMiniShips: (parsed.mintedMiniShips || []).filter((id): id is MiniShipId => id in MINI_SHIP_BY_ID),
      cosmetics: Array.isArray(parsed.cosmetics) ? parsed.cosmetics.filter((item): item is string => typeof item === 'string') : [],
      weeklyArchive: Array.isArray(parsed.weeklyArchive) ? parsed.weeklyArchive.filter((item): item is string => typeof item === 'string') : []
    };
  } catch {
    return fallback;
  }
};

export const savePermanentSquadState = (state: PermanentSquadState) => {
  if (typeof window === 'undefined' || state.profileId === 'guest') return;
  window.localStorage.setItem(permanentStorageKey(state.profileId), JSON.stringify({
    ...state,
    updatedAt: nowIso()
  }));
};

const spendCoins = (state: WeeklySquadState, cost: number) => ({
  ...state,
  coins: state.coins - cost,
  updatedAt: nowIso()
});

export const unlockSquadSlot = (state: WeeklySquadState, slot: SquadSlotId): WeeklySquadState => {
  if (state.unlockedSlots[slot]) return state;
  if (slot !== 'right' || state.coins < RIGHT_SQUAD_SLOT_UNLOCK_COST) return state;
  const next = spendCoins(state, RIGHT_SQUAD_SLOT_UNLOCK_COST);
  next.unlockedSlots = { ...next.unlockedSlots, right: true };
  emitSquadDomainEvent('slot_unlocked', { profileId: state.profileId, slot, cost: RIGHT_SQUAD_SLOT_UNLOCK_COST });
  return next;
};

export const purchaseMiniShip = (state: WeeklySquadState, id: MiniShipId): WeeklySquadState => {
  const entry = MINI_SHIP_BY_ID[id];
  if (!entry || state.ownedMiniShips[id] || state.coins < entry.purchaseCost) return state;
  const next = spendCoins(state, entry.purchaseCost);
  next.ownedMiniShips = { ...next.ownedMiniShips, [id]: 1 };
  emitSquadDomainEvent('mini_ship_purchased', { profileId: state.profileId, miniShipId: id, cost: entry.purchaseCost });
  return next;
};

export const getMiniShipUpgradeCost = (id: MiniShipId, level: number) => {
  const entry = MINI_SHIP_BY_ID[id];
  return Math.round(entry.purchaseCost * 0.45 + Math.max(1, level) * 55);
};

export const upgradeMiniShip = (state: WeeklySquadState, id: MiniShipId): WeeklySquadState => {
  const level = state.ownedMiniShips[id] || 0;
  if (level <= 0 || level >= MINI_SHIP_MAX_LEVEL) return state;
  const cost = getMiniShipUpgradeCost(id, level);
  if (state.coins < cost) return state;
  const next = spendCoins(state, cost);
  next.ownedMiniShips = { ...next.ownedMiniShips, [id]: level + 1 };
  emitSquadDomainEvent('mini_ship_upgraded', { profileId: state.profileId, miniShipId: id, level: level + 1, cost });
  return next;
};

export const equipMiniShip = (
  state: WeeklySquadState,
  slot: SquadSlotId,
  id: MiniShipId | null
): WeeklySquadState => {
  if (!state.unlockedSlots[slot]) return state;
  if (id && !state.ownedMiniShips[id]) return state;
  const equipped = { ...state.equipped };
  if (id) {
    const otherSlot: SquadSlotId = slot === 'left' ? 'right' : 'left';
    if (equipped[otherSlot] === id) equipped[otherSlot] = null;
  }
  equipped[slot] = id;
  emitSquadDomainEvent('squad_updated', { profileId: state.profileId, slot, miniShipId: id });
  return { ...state, equipped, updatedAt: nowIso() };
};

export const getMainShipUpgradeCost = (id: MainShipUpgradeId, level: number) => (
  MAIN_SHIP_UPGRADES.find((upgrade) => upgrade.id === id)?.costs[level] ?? Number.POSITIVE_INFINITY
);

export const upgradeMainShip = (state: WeeklySquadState, id: MainShipUpgradeId): WeeklySquadState => {
  const level = state.upgrades[id];
  if (level >= MAIN_SHIP_UPGRADE_MAX_LEVEL) return state;
  const cost = getMainShipUpgradeCost(id, level);
  if (!Number.isFinite(cost) || state.coins < cost) return state;
  const next = spendCoins(state, cost);
  next.upgrades = { ...next.upgrades, [id]: level + 1 };
  emitSquadDomainEvent('ship_upgraded', { profileId: state.profileId, upgrade: id, level: level + 1, cost });
  return next;
};

export const applySquadRunResult = (
  state: WeeklySquadState,
  result: SquadRunResult
): WeeklySquadState => {
  const earned = Math.max(0, Math.floor(result.coinsCollected || 0));
  if (earned > 0) {
    emitSquadDomainEvent('coin_earned', { profileId: state.profileId, amount: earned, source: 'run' });
  }
  emitSquadDomainEvent('run_completed', {
    profileId: state.profileId,
    score: result.score,
    enemiesDefeated: result.enemiesDefeated,
    coinsCollected: earned
  });
  return {
    ...state,
    coins: state.coins + earned,
    weeklyStats: {
      runs: state.weeklyStats.runs + 1,
      score: Math.max(state.weeklyStats.score, Math.max(0, Math.floor(result.score || 0))),
      enemiesDefeated: state.weeklyStats.enemiesDefeated + Math.max(0, Math.floor(result.enemiesDefeated || 0)),
      coinsEarned: state.weeklyStats.coinsEarned + earned
    },
    updatedAt: nowIso()
  };
};

export const buildRuntimeSquadLoadout = (state: WeeklySquadState): RuntimeSquadLoadout => ({
  profileId: state.profileId,
  weekKey: state.weekKey,
  upgrades: { ...state.upgrades },
  companions: (['left', 'right'] as SquadSlotId[]).flatMap((slot) => {
    const id = state.equipped[slot];
    if (!id || !state.unlockedSlots[slot]) return [];
    const entry = MINI_SHIP_BY_ID[id];
    const level = state.ownedMiniShips[id] || 1;
    return [{
      slot,
      id,
      level,
      frames: entry.frames,
      fireIntervalFrames: Math.max(18, entry.fireIntervalFrames - (level - 1) * 3),
      projectileDamage: entry.projectileDamage + (level - 1) * 0.16,
      projectileColor: entry.projectileColor
    }];
  })
});

export const preloadMiniShipTextures = () => {
  if (typeof Image === 'undefined') return;
  MINI_SHIP_CATALOG.flatMap((entry) => entry.frames).forEach((source) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = source;
  });
};
