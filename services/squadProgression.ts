import { getWeeklyBoundaryMeta } from '../shared/weeklyCompetitionBoundary.browser';
import { PLAYABLE_PLAYER_SHIP_IDS, type PlayerShipId } from './playerShipService';

export const SQUAD_PROFILE_VERSION = 3;
const RETIRED_WEEKLY_SQUAD_PROFILE_VERSIONS = [1, 2] as const;
const PERMANENT_SQUAD_PROFILE_VERSION = 1;
export const MAIN_SHIP_UPGRADE_MAX_LEVEL = 7;
export const MINI_SHIP_MAX_LEVEL = 5;
export const LEFT_SQUAD_SLOT_UNLOCK_COST = 50;
export const RIGHT_SQUAD_SLOT_UNLOCK_COST = 500;
export const SQUAD_SLOT_UNLOCK_COST: Readonly<Record<SquadSlotId, number>> = Object.freeze({
  left: LEFT_SQUAD_SLOT_UNLOCK_COST,
  right: RIGHT_SQUAD_SLOT_UNLOCK_COST
});
export const WEEKLY_STARTING_COINS = 0;

export type SquadSlotId = 'left' | 'right';
export type MainShipUpgradeId = 'fireRate' | 'speed' | 'startingHearts';
export type MainShipUpgradeLevels = Record<MainShipUpgradeId, number>;
export type MainShipUpgradesByShip = Record<PlayerShipId, MainShipUpgradeLevels>;
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

export type MiniShipAbilityKind =
  | 'pulse-cannon'
  | 'spread-cycle'
  | 'piercing-laser'
  | 'coin-magnet'
  | 'twin-burst'
  | 'homing-missile'
  | 'targeting-laser'
  | 'prism-fan'
  | 'heavy-cannon'
  | 'nova-volley';

export const FIRST_LEFT_WING_MINI_SHIP_ID: MiniShipId = 'citation-dart';

export type SquadDomainEventName =
  | 'wallet_profile_loaded'
  | 'weekly_state_reset'
  | 'coin_earned'
  | 'slot_unlocked'
  | 'mini_ship_awarded'
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
  ability: MiniShipAbilityKind;
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
  shipUpgrades: MainShipUpgradesByShip;
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
  ability: MiniShipAbilityKind;
  frames: [string, string, string];
  fireIntervalFrames: number;
  projectileDamage: number;
  projectileColor: string;
}

export interface RuntimeSquadLoadout {
  profileId: string;
  weekKey: string;
  mainShipId: PlayerShipId;
  upgrades: MainShipUpgradeLevels;
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
    role: 'Pulse gunner',
    description: 'A steady pulse cannon whose fire rate climbs every level.',
    ability: 'pulse-cannon',
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
    role: 'Angle repeater',
    description: 'Repeats left 25°, center, then right 25° and cycles faster as it levels.',
    ability: 'spread-cycle',
    purchaseCost: 90,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 32,
    projectileDamage: 0.62,
    projectileColor: '#a7f3d0',
    frames: miniFrames('helix-wasp')
  },
  {
    id: 'photon-manta',
    name: 'Photon Manta',
    role: 'Piercing laser',
    description: 'Fires a piercing photon lance that passes through more targets as it levels.',
    ability: 'piercing-laser',
    purchaseCost: 140,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 44,
    projectileDamage: 0.96,
    projectileColor: '#c4b5fd',
    frames: miniFrames('photon-manta')
  },
  {
    id: 'quorum-crab',
    name: 'Quorum Crab',
    role: 'Coin magnet',
    description: 'Pulls nearby coins toward the squad while adding dependable cover fire.',
    ability: 'coin-magnet',
    purchaseCost: 200,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 48,
    projectileDamage: 1.08,
    projectileColor: '#fb7185',
    frames: miniFrames('quorum-crab')
  },
  {
    id: 'axiom-orbiter',
    name: 'Axiom Orbiter',
    role: 'Twin burst',
    description: 'Fires paired precision bolts with a widening damage advantage at higher levels.',
    ability: 'twin-burst',
    purchaseCost: 260,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 40,
    projectileDamage: 1,
    projectileColor: '#fde68a',
    frames: miniFrames('axiom-orbiter')
  },
  {
    id: 'archive-beetle',
    name: 'Archive Beetle',
    role: 'Homing missile',
    description: 'Launches heat-seeking missiles that steer harder and hit faster as it levels.',
    ability: 'homing-missile',
    purchaseCost: 330,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 52,
    projectileDamage: 1.28,
    projectileColor: '#fbbf24',
    frames: miniFrames('archive-beetle')
  },
  {
    id: 'beacon-kite',
    name: 'Beacon Kite',
    role: 'Targeting laser',
    description: 'Tracks the nearest threat and leads it with accurate signal fire.',
    ability: 'targeting-laser',
    purchaseCost: 410,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 30,
    projectileDamage: 0.78,
    projectileColor: '#5eead4',
    frames: miniFrames('beacon-kite')
  },
  {
    id: 'prism-skimmer',
    name: 'Prism Skimmer',
    role: 'Prism fan',
    description: 'Projects a simultaneous three-ray fan for reliable formation control.',
    ability: 'prism-fan',
    purchaseCost: 500,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 36,
    projectileDamage: 1.05,
    projectileColor: '#f0abfc',
    frames: miniFrames('prism-skimmer')
  },
  {
    id: 'ledger-hammer',
    name: 'Ledger Hammer',
    role: 'Siege cannon',
    description: 'Powerful oversized rounds pierce armor and trade speed for impact.',
    ability: 'heavy-cannon',
    purchaseCost: 620,
    maxLevel: MINI_SHIP_MAX_LEVEL,
    fireIntervalFrames: 56,
    projectileDamage: 1.5,
    projectileColor: '#fca5a5',
    frames: miniFrames('ledger-hammer')
  },
  {
    id: 'nebula-tern',
    name: 'Nebula Tern',
    role: 'Nova volley',
    description: 'An elite five-lane volley platform tuned for the hardest waves.',
    ability: 'nova-volley',
    purchaseCost: 760,
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

export const MINI_SHIP_UPGRADE_COST_CURVE = [0, 100, 225, 400, 650] as const;

const getProfileId = (walletAddress?: string | null) => walletAddress?.trim().toLowerCase() || 'guest';
const weeklyStorageKey = (profileId: string) => `scicon_weekly_squad_v${SQUAD_PROFILE_VERSION}:${profileId}`;
const retiredWeeklyStorageKeys = (profileId: string) => (
  RETIRED_WEEKLY_SQUAD_PROFILE_VERSIONS.map((version) => `scicon_weekly_squad_v${version}:${profileId}`)
);
const permanentStorageKey = (profileId: string) => `scicon_permanent_squad_v${PERMANENT_SQUAD_PROFILE_VERSION}:${profileId}`;
const nowIso = () => new Date().toISOString();
const clampLevel = (value: unknown, max = MAIN_SHIP_UPGRADE_MAX_LEVEL) => (
  Math.max(0, Math.min(max, Math.floor(Number(value) || 0)))
);
const createMainShipUpgradeLevels = (): MainShipUpgradeLevels => ({
  fireRate: 0,
  speed: 0,
  startingHearts: 0
});
export const createMainShipUpgradesByShip = (): MainShipUpgradesByShip => (
  Object.fromEntries(PLAYABLE_PLAYER_SHIP_IDS.map((shipId) => [shipId, createMainShipUpgradeLevels()])) as MainShipUpgradesByShip
);
const sanitizeMainShipUpgradeLevels = (
  value?: Partial<Record<MainShipUpgradeId, number>> | null
): MainShipUpgradeLevels => ({
  fireRate: clampLevel(value?.fireRate),
  speed: clampLevel(value?.speed),
  startingHearts: clampLevel(value?.startingHearts)
});

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
  unlockedSlots: { left: false, right: false },
  ownedMiniShips: {},
  equipped: { left: null, right: null },
  shipUpgrades: createMainShipUpgradesByShip(),
  weeklyStats: { runs: 0, score: 0, enemiesDefeated: 0, coinsEarned: 0 },
  updatedAt: nowIso()
});

export const createPermanentSquadState = (walletAddress?: string | null): PermanentSquadState => ({
  version: PERMANENT_SQUAD_PROFILE_VERSION,
  profileId: getProfileId(walletAddress),
  mintedMiniShips: [],
  cosmetics: [],
  weeklyArchive: [],
  updatedAt: nowIso()
});

type StoredWeeklySquadState = Omit<Partial<WeeklySquadState>, 'shipUpgrades'> & {
  shipUpgrades?: Partial<Record<PlayerShipId, Partial<Record<MainShipUpgradeId, number>>>>;
  upgrades?: Partial<Record<MainShipUpgradeId, number>>;
};

const sanitizeWeeklyState = (
  value: StoredWeeklySquadState,
  walletAddress?: string | null
): WeeklySquadState => {
  const fallback = createWeeklySquadState(walletAddress);
  const { upgrades: legacyUpgrades, ...currentValue } = value;
  const owned = { ...fallback.ownedMiniShips };
  Object.entries(value.ownedMiniShips || {}).forEach(([id, level]) => {
    if (id in MINI_SHIP_BY_ID) owned[id as MiniShipId] = Math.max(1, clampLevel(level, MINI_SHIP_MAX_LEVEL));
  });
  const equipped = { ...fallback.equipped };
  (['left', 'right'] as SquadSlotId[]).forEach((slot) => {
    const id = value.equipped?.[slot];
    equipped[slot] = id && id in MINI_SHIP_BY_ID && owned[id] ? id : null;
  });
  const shipUpgrades = createMainShipUpgradesByShip();
  PLAYABLE_PLAYER_SHIP_IDS.forEach((shipId) => {
    shipUpgrades[shipId] = sanitizeMainShipUpgradeLevels(value.shipUpgrades?.[shipId]);
  });
  if (!value.shipUpgrades && legacyUpgrades) {
    shipUpgrades.researchhub = sanitizeMainShipUpgradeLevels(legacyUpgrades);
  }
  return {
    ...fallback,
    ...currentValue,
    version: SQUAD_PROFILE_VERSION,
    profileId: getProfileId(walletAddress),
    coins: Math.max(0, Math.floor(Number(value.coins) || 0)),
    unlockedSlots: {
      left: Boolean(value.unlockedSlots?.left),
      right: Boolean(value.unlockedSlots?.right)
    },
    ownedMiniShips: owned,
    equipped,
    shipUpgrades,
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
      retiredWeeklyStorageKeys(profileId).forEach((key) => window.localStorage.removeItem(key));
    }
    return state;
  }

  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(weeklyStorageKey(profileId)) : null;
    if (saved) state = sanitizeWeeklyState(JSON.parse(saved) as StoredWeeklySquadState, walletAddress);
  } catch {
    state = createWeeklySquadState(walletAddress, currentWeek);
  }

  if (state.weekKey !== currentWeek) {
    state = createWeeklySquadState(walletAddress, currentWeek);
    emitSquadDomainEvent('weekly_state_reset', { profileId, weekKey: currentWeek });
  }

  if (typeof window !== 'undefined') {
    retiredWeeklyStorageKeys(profileId).forEach((key) => window.localStorage.removeItem(key));
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

export const createFounderSquadSandboxState = (state: WeeklySquadState): WeeklySquadState => ({
  ...state,
  unlockedSlots: { left: true, right: true },
  ownedMiniShips: Object.fromEntries(
    MINI_SHIP_CATALOG.map((entry) => [entry.id, MINI_SHIP_MAX_LEVEL])
  ) as Record<MiniShipId, number>,
  shipUpgrades: Object.fromEntries(
    PLAYABLE_PLAYER_SHIP_IDS.map((shipId) => [shipId, {
      fireRate: MAIN_SHIP_UPGRADE_MAX_LEVEL,
      speed: MAIN_SHIP_UPGRADE_MAX_LEVEL,
      startingHearts: MAIN_SHIP_UPGRADE_MAX_LEVEL
    }])
  ) as MainShipUpgradesByShip,
  updatedAt: nowIso()
});

export const adjustFounderMiniShipLevel = (
  state: WeeklySquadState,
  id: MiniShipId,
  delta: number
): WeeklySquadState => {
  const currentLevel = Math.max(1, state.ownedMiniShips[id] || 1);
  const nextLevel = Math.max(1, Math.min(
    MINI_SHIP_MAX_LEVEL,
    currentLevel + Math.trunc(delta)
  ));
  if (nextLevel === currentLevel) return state;
  return {
    ...state,
    ownedMiniShips: { ...state.ownedMiniShips, [id]: nextLevel },
    updatedAt: nowIso()
  };
};

export const adjustFounderMainShipUpgrade = (
  state: WeeklySquadState,
  shipId: PlayerShipId,
  id: MainShipUpgradeId,
  delta: number
): WeeklySquadState => {
  const currentUpgrades = state.shipUpgrades[shipId] ?? createMainShipUpgradeLevels();
  const currentLevel = currentUpgrades[id];
  const nextLevel = Math.max(0, Math.min(
    MAIN_SHIP_UPGRADE_MAX_LEVEL,
    currentLevel + Math.trunc(delta)
  ));
  if (nextLevel === currentLevel) return state;
  return {
    ...state,
    shipUpgrades: {
      ...state.shipUpgrades,
      [shipId]: { ...currentUpgrades, [id]: nextLevel }
    },
    updatedAt: nowIso()
  };
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
      version: PERMANENT_SQUAD_PROFILE_VERSION,
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
  const cost = SQUAD_SLOT_UNLOCK_COST[slot];
  if (state.coins < cost) return state;
  const next = spendCoins(state, cost);
  next.unlockedSlots = { ...next.unlockedSlots, [slot]: true };
  if (slot === 'left') {
    next.ownedMiniShips = {
      ...next.ownedMiniShips,
      [FIRST_LEFT_WING_MINI_SHIP_ID]: next.ownedMiniShips[FIRST_LEFT_WING_MINI_SHIP_ID] || 1
    };
    next.equipped = { ...next.equipped, left: FIRST_LEFT_WING_MINI_SHIP_ID };
    emitSquadDomainEvent('mini_ship_awarded', {
      profileId: state.profileId,
      miniShipId: FIRST_LEFT_WING_MINI_SHIP_ID,
      source: 'left-wing-unlock'
    });
  }
  emitSquadDomainEvent('slot_unlocked', { profileId: state.profileId, slot, cost });
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
  const currentLevel = Math.max(1, Math.min(MINI_SHIP_MAX_LEVEL - 1, Math.floor(level) || 1));
  const curveCost = MINI_SHIP_UPGRADE_COST_CURVE[currentLevel];
  const shipPremium = entry.purchaseCost * (0.35 + currentLevel * 0.1);
  return Math.round(curveCost + shipPremium);
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

export const upgradeMainShip = (
  state: WeeklySquadState,
  shipId: PlayerShipId,
  id: MainShipUpgradeId
): WeeklySquadState => {
  const currentUpgrades = state.shipUpgrades[shipId] ?? createMainShipUpgradeLevels();
  const level = currentUpgrades[id];
  if (level >= MAIN_SHIP_UPGRADE_MAX_LEVEL) return state;
  const cost = getMainShipUpgradeCost(id, level);
  if (!Number.isFinite(cost) || state.coins < cost) return state;
  const next = spendCoins(state, cost);
  next.shipUpgrades = {
    ...next.shipUpgrades,
    [shipId]: { ...currentUpgrades, [id]: level + 1 }
  };
  emitSquadDomainEvent('ship_upgraded', { profileId: state.profileId, shipId, upgrade: id, level: level + 1, cost });
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

export const buildRuntimeSquadLoadout = (
  state: WeeklySquadState,
  mainShipId: PlayerShipId
): RuntimeSquadLoadout => ({
  profileId: state.profileId,
  weekKey: state.weekKey,
  mainShipId,
  upgrades: { ...(state.shipUpgrades[mainShipId] ?? createMainShipUpgradeLevels()) },
  companions: (['left', 'right'] as SquadSlotId[]).flatMap((slot) => {
    const id = state.equipped[slot];
    if (!id || !state.unlockedSlots[slot]) return [];
    const entry = MINI_SHIP_BY_ID[id];
    const level = state.ownedMiniShips[id] || 1;
    return [{
      slot,
      id,
      level,
      ability: entry.ability,
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
