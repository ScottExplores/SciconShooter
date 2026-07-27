import {
  createBossArchiveProgress,
  sanitizeBossArchiveProgress,
  type BossArchiveProgress
} from './bossArchiveProgression';

const BOSS_ARCHIVE_STORAGE_VERSION = 1;
const BOSS_ARCHIVE_STORAGE_PREFIX = `scicon_boss_archive_v${BOSS_ARCHIVE_STORAGE_VERSION}:`;

export interface BossArchiveStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BossArchivePrimaryPersistence {
  load(profileId: string): Promise<{
    state: unknown;
    /** Trusted server time, when the provider has it. */
    serverNow?: string | null;
  } | null>;
  save(profileId: string, state: BossArchiveProgress): Promise<void>;
  reset?(profileId: string): Promise<void>;
}

export interface BossArchivePersistenceLoadResult {
  state: BossArchiveProgress;
  source: 'primary' | 'local' | 'default';
  now: Date;
  primaryError: Error | null;
}

export interface BossArchivePersistenceSaveResult {
  localSaved: boolean;
  primarySaved: boolean;
  primaryError: Error | null;
}

export interface BossArchivePersistenceAdapter {
  readonly profileId: string;
  load(options?: { now?: Date }): Promise<BossArchivePersistenceLoadResult>;
  save(state: BossArchiveProgress): Promise<BossArchivePersistenceSaveResult>;
  reset(options?: { now?: Date }): Promise<BossArchiveProgress>;
}

const normalizeProfileId = (value: string) => value.trim().toLowerCase() || 'guest';

export const getBossArchiveProgressStorageKey = (profileId: string) => (
  `${BOSS_ARCHIVE_STORAGE_PREFIX}${normalizeProfileId(profileId)}`
);

const defaultStorage = (): BossArchiveStorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const usableDate = (value: unknown, fallback: Date) => {
  if (typeof value !== 'string') return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
};

const asError = (value: unknown) => value instanceof Error
  ? value
  : new Error('Boss Archive persistence provider failed.');

/**
 * Persistence is provider-first when an account/server implementation exists.
 * Every successful load/save is mirrored locally so guests and temporary
 * network failures remain playable without making the device clock authoritative
 * when a trusted server timestamp is available.
 */
export const createBossArchivePersistenceAdapter = ({
  profileId: requestedProfileId,
  primary = null,
  storage = defaultStorage()
}: {
  profileId: string;
  primary?: BossArchivePrimaryPersistence | null;
  storage?: BossArchiveStorageLike | null;
}): BossArchivePersistenceAdapter => {
  const profileId = normalizeProfileId(requestedProfileId);
  const storageKey = getBossArchiveProgressStorageKey(profileId);

  const writeLocal = (state: BossArchiveProgress) => {
    if (!storage) return false;
    try {
      storage.setItem(storageKey, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  };

  const readLocal = (now: Date): BossArchiveProgress | null => {
    if (!storage) return null;
    try {
      const raw = storage.getItem(storageKey);
      return raw ? sanitizeBossArchiveProgress(JSON.parse(raw), { now }) : null;
    } catch {
      return null;
    }
  };

  return {
    profileId,
    async load({ now = new Date() } = {}) {
      let primaryError: Error | null = null;
      if (primary) {
        try {
          const loaded = await primary.load(profileId);
          if (loaded) {
            const trustedNow = usableDate(loaded.serverNow, now);
            const state = sanitizeBossArchiveProgress(loaded.state, { now: trustedNow });
            writeLocal(state);
            return {
              state,
              source: 'primary' as const,
              now: trustedNow,
              primaryError: null
            };
          }
        } catch (error) {
          primaryError = asError(error);
        }
      }

      const local = readLocal(now);
      if (local) {
        return { state: local, source: 'local', now, primaryError };
      }
      return {
        state: createBossArchiveProgress([], [], now),
        source: 'default',
        now,
        primaryError
      };
    },
    async save(value) {
      const state = sanitizeBossArchiveProgress(value);
      const localSaved = writeLocal(state);
      if (!primary) {
        return { localSaved, primarySaved: false, primaryError: null };
      }
      try {
        await primary.save(profileId, state);
        return { localSaved, primarySaved: true, primaryError: null };
      } catch (error) {
        return {
          localSaved,
          primarySaved: false,
          primaryError: asError(error)
        };
      }
    },
    async reset({ now = new Date() } = {}) {
      try {
        storage?.removeItem(storageKey);
      } catch {
        // A blocked storage provider must never prevent a safe in-memory reset.
      }
      if (primary?.reset) {
        try {
          await primary.reset(profileId);
        } catch {
          // Local reset remains valid while an unavailable primary can retry later.
        }
      }
      return createBossArchiveProgress([], [], now);
    }
  };
};
