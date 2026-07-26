import { STORAGE_KEYS } from '../constants';
import { migrateLegacySquadProfile } from './squadProgression';

export interface PilotStatsSnapshot {
  highScore: number;
  totalCoins: number;
  playerName: string;
}

export interface LocalPilotProfile {
  id: string;
  storageMode: 'device';
  migratedFromWallet: string | null;
}

interface PilotMigrationRecord {
  pilotId: string;
  migratedFromWallet: string;
  migratedAt: string;
}

export interface PilotMigrationAttempt {
  completed: boolean;
  migrated: boolean;
  sourceFound: boolean;
  migratedFromWallet: string | null;
}

const DEFAULT_PILOT_STATS: PilotStatsSnapshot = {
  highScore: 0,
  totalCoins: 0,
  playerName: ''
};

const normalizeProfileId = (value: string) => value.trim().toLowerCase();
const isPilotProfileId = (value: string | null) => Boolean(
  value && /^pilot:[a-z0-9-]{8,}$/.test(normalizeProfileId(value))
);

const createPilotProfileId = () => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `pilot:${uuid.toLowerCase()}`;
  return `pilot:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
};

const safeGet = (key: string) => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string) => {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const sanitizePilotStats = (value: unknown): PilotStatsSnapshot => {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PILOT_STATS };
  const candidate = value as Partial<PilotStatsSnapshot>;
  return {
    highScore: Math.max(0, Math.floor(Number(candidate.highScore) || 0)),
    totalCoins: Math.max(0, Math.floor(Number(candidate.totalCoins) || 0)),
    playerName: typeof candidate.playerName === 'string'
      ? candidate.playerName.trim().slice(0, 15)
      : ''
  };
};

const parsePilotStats = (value: string | null) => {
  if (!value) return null;
  try {
    return sanitizePilotStats(JSON.parse(value));
  } catch {
    return null;
  }
};

export const getPilotStatsStorageKey = (pilotProfileId: string) => (
  `${STORAGE_KEYS.PLAYER_STATS}:${normalizeProfileId(pilotProfileId)}`
);

export const readPilotStats = (pilotProfileId: string): PilotStatsSnapshot => (
  parsePilotStats(safeGet(getPilotStatsStorageKey(pilotProfileId)))
  ?? { ...DEFAULT_PILOT_STATS }
);

export const savePilotStats = (
  pilotProfileId: string,
  stats: PilotStatsSnapshot
) => {
  const sanitized = sanitizePilotStats(stats);
  const statsKey = getPilotStatsStorageKey(pilotProfileId);
  const saved = safeSet(statsKey, JSON.stringify(sanitized));
  safeSet(STORAGE_KEYS.HIGH_SCORE, sanitized.highScore.toString());
  return saved && safeGet(statsKey) !== null;
};

const readMigrationRecord = (pilotId: string): PilotMigrationRecord | null => {
  const raw = safeGet(STORAGE_KEYS.PILOT_PROFILE_MIGRATION);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PilotMigrationRecord>;
    if (
      parsed.pilotId !== pilotId
      || typeof parsed.migratedAt !== 'string'
      || typeof parsed.migratedFromWallet !== 'string'
      || !parsed.migratedFromWallet.trim()
    ) return null;
    return {
      pilotId,
      migratedFromWallet: parsed.migratedFromWallet.toLowerCase(),
      migratedAt: parsed.migratedAt
    };
  } catch {
    return null;
  }
};

const ensurePilotStats = (pilotId: string) => {
  const targetKey = getPilotStatsStorageKey(pilotId);
  if (safeGet(targetKey)) return true;

  const legacyDeviceStats = parsePilotStats(safeGet(STORAGE_KEYS.PLAYER_STATS));
  const legacyHighScore = Math.max(
    0,
    Math.floor(Number(safeGet(STORAGE_KEYS.HIGH_SCORE)) || 0)
  );
  const source = legacyDeviceStats ?? { ...DEFAULT_PILOT_STATS };

  return savePilotStats(pilotId, {
    ...source,
    highScore: Math.max(source.highScore, legacyHighScore)
  });
};

const migrateLegacyWalletStats = (
  pilotId: string,
  legacyWalletAddress: string
) => {
  const sourceKey = `${STORAGE_KEYS.PLAYER_STATS}:${legacyWalletAddress}`;
  const sourceRaw = safeGet(sourceKey);
  if (!sourceRaw) {
    return { sourceFound: false, success: true, migrated: false };
  }

  const source = parsePilotStats(sourceRaw);
  if (!source) {
    return { sourceFound: true, success: false, migrated: false };
  }

  const target = readPilotStats(pilotId);
  const merged = {
    highScore: Math.max(target.highScore, source.highScore),
    totalCoins: Math.max(target.totalCoins, source.totalCoins),
    playerName: target.playerName || source.playerName
  };
  const success = savePilotStats(pilotId, merged);
  return { sourceFound: true, success, migrated: success };
};

export const migrateLegacyWalletIntoPilot = (
  pilotId: string,
  walletAddress: string
): PilotMigrationAttempt => {
  const normalizedPilotId = normalizeProfileId(pilotId);
  const normalizedWalletAddress = walletAddress.trim().toLowerCase();
  const completedMigration = readMigrationRecord(normalizedPilotId);
  if (completedMigration) {
    return {
      completed: true,
      migrated: false,
      sourceFound: true,
      migratedFromWallet: completedMigration.migratedFromWallet
    };
  }

  if (!normalizedWalletAddress) {
    return {
      completed: false,
      migrated: false,
      sourceFound: false,
      migratedFromWallet: null
    };
  }

  const squadMigration = migrateLegacySquadProfile(
    normalizedWalletAddress,
    normalizedPilotId
  );
  const statsMigration = migrateLegacyWalletStats(
    normalizedPilotId,
    normalizedWalletAddress
  );
  const sourceFound = squadMigration.sourceFound || statsMigration.sourceFound;
  const success = squadMigration.success && statsMigration.success;
  const migrated = squadMigration.weekly
    || squadMigration.permanent
    || statsMigration.migrated;

  if (!sourceFound || !success) {
    return {
      completed: false,
      migrated,
      sourceFound,
      migratedFromWallet: null
    };
  }

  const migrationRecord: PilotMigrationRecord = {
    pilotId: normalizedPilotId,
    migratedFromWallet: normalizedWalletAddress,
    migratedAt: new Date().toISOString()
  };
  const completionSaved = safeSet(
    STORAGE_KEYS.PILOT_PROFILE_MIGRATION,
    JSON.stringify(migrationRecord)
  );
  const verifiedRecord = completionSaved
    ? readMigrationRecord(normalizedPilotId)
    : null;

  return {
    completed: verifiedRecord?.migratedFromWallet === normalizedWalletAddress,
    migrated,
    sourceFound,
    migratedFromWallet: verifiedRecord?.migratedFromWallet ?? null
  };
};

export const initializeLocalPilotProfile = (): LocalPilotProfile => {
  const storedId = safeGet(STORAGE_KEYS.PILOT_PROFILE_ID);
  const id = isPilotProfileId(storedId)
    ? normalizeProfileId(storedId as string)
    : createPilotProfileId();
  safeSet(STORAGE_KEYS.PILOT_PROFILE_ID, id);
  ensurePilotStats(id);

  const completedMigration = readMigrationRecord(id);
  if (completedMigration) {
    return {
      id,
      storageMode: 'device',
      migratedFromWallet: completedMigration.migratedFromWallet
    };
  }

  return {
    id,
    storageMode: 'device',
    migratedFromWallet: null
  };
};
