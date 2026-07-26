import type { BossEvent, GameCampaignConfig } from '../game-config/types';
import {
  cloneGameCampaign,
  DEFAULT_GAME_CAMPAIGN,
  getPrimaryAssetPath
} from './levelConfig';

export interface BossArchiveEntry {
  readonly eventId: string;
  readonly bossId: BossEvent['bossId'];
  readonly label: string;
  readonly missionId: string;
  readonly missionName: string;
  readonly missionNumber: number;
  readonly waveId: string;
  readonly waveName: string;
  readonly waveNumber: number;
  readonly spriteKey: BossEvent['spriteKey'];
  readonly artUrl: string;
}

export interface LegacyBossArchiveProgress {
  /** Current player-facing name for the furthest mission reached. */
  readonly highestMission?: unknown;
  /** Compatibility name used by PermanentLifetimeStats. */
  readonly highestWave?: unknown;
  readonly bossesDefeated?: unknown;
  readonly campaignCompleted?: unknown;
}

const toNonNegativeInteger = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};

const buildBossArchiveCatalog = (): readonly BossArchiveEntry[] => {
  const entries = DEFAULT_GAME_CAMPAIGN.levels
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((level) => level.waves
      .slice()
      .sort((left, right) => left.order - right.order)
      .flatMap((wave) => wave.events
        .filter((event): event is BossEvent => (
          event.kind === 'boss' && event.bossId === 'gatekeeper'
        ))
        .map((event) => Object.freeze({
          eventId: event.id,
          bossId: event.bossId,
          label: event.label,
          missionId: level.id,
          missionName: level.name,
          missionNumber: level.order,
          waveId: wave.id,
          waveName: wave.name,
          waveNumber: wave.order,
          spriteKey: event.spriteKey,
          artUrl: getPrimaryAssetPath(event.spriteKey)
        }))));

  return Object.freeze(entries);
};

/**
 * Stable, player-facing bosses only. Generic boss IDs repeat throughout the
 * campaign, so archive identity always uses the exact authored event ID.
 */
export const BOSS_ARCHIVE_CATALOG = buildBossArchiveCatalog();

const BOSS_ARCHIVE_BY_NORMALIZED_ID = new Map(
  BOSS_ARCHIVE_CATALOG.map((entry) => [entry.eventId.trim().toLowerCase(), entry])
);

export const normalizeBossArchiveEventId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return BOSS_ARCHIVE_BY_NORMALIZED_ID.get(value.trim().toLowerCase())?.eventId ?? null;
};

/** Filters unknown values, removes duplicates, and restores campaign order. */
export const normalizeBossArchiveEventIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized = new Set(
    value.map(normalizeBossArchiveEventId).filter((id): id is string => Boolean(id))
  );
  return BOSS_ARCHIVE_CATALOG
    .filter((entry) => normalized.has(entry.eventId))
    .map((entry) => entry.eventId);
};

export const getBossArchiveEntry = (eventId: unknown): BossArchiveEntry | null => {
  const normalized = normalizeBossArchiveEventId(eventId);
  return normalized
    ? BOSS_ARCHIVE_BY_NORMALIZED_ID.get(normalized.toLowerCase()) ?? null
    : null;
};

export const getUnlockedBossArchiveEntries = (unlockedEventIds: unknown) => {
  const unlocked = new Set(normalizeBossArchiveEventIds(unlockedEventIds));
  return BOSS_ARCHIVE_CATALOG.filter((entry) => unlocked.has(entry.eventId));
};

export const isBossArchiveEntryUnlocked = (
  eventId: unknown,
  unlockedEventIds: unknown
) => {
  const normalized = normalizeBossArchiveEventId(eventId);
  return normalized !== null
    && normalizeBossArchiveEventIds(unlockedEventIds).includes(normalized);
};

export const getNewBossArchiveCount = (
  unlockedEventIds: unknown,
  seenEventIds: unknown
) => {
  const seen = new Set(normalizeBossArchiveEventIds(seenEventIds));
  return normalizeBossArchiveEventIds(unlockedEventIds)
    .filter((eventId) => !seen.has(eventId))
    .length;
};

/**
 * Conservatively reconstructs archive access for profiles saved before exact
 * boss IDs were persisted. Reaching mission N proves missions below N were
 * cleared. The final mission is inferred only from an explicit completion or
 * the historical one-victory-per-mission counter.
 */
export const inferLegacyBossArchiveEventIds = (
  progress: LegacyBossArchiveProgress | null | undefined
): string[] => {
  if (!progress) return [];
  const highestMission = toNonNegativeInteger(
    progress.highestMission ?? progress.highestWave
  );
  const bossesDefeated = toNonNegativeInteger(progress.bossesDefeated);
  const finalMission = DEFAULT_GAME_CAMPAIGN.levels.reduce(
    (highest, level) => Math.max(highest, level.order),
    0
  );
  const completedCampaign = progress.campaignCompleted === true
    || (highestMission >= finalMission && bossesDefeated >= finalMission);
  const completedThrough = completedCampaign
    ? finalMission
    : Math.max(0, Math.min(finalMission, highestMission - 1));

  if (completedThrough > 0) {
    return BOSS_ARCHIVE_CATALOG
      .filter((entry) => entry.missionNumber <= completedThrough)
      .map((entry) => entry.eventId);
  }

  // Very old profiles may have only a boss counter and no mission field.
  if (highestMission === 0 && bossesDefeated > 0) {
    return BOSS_ARCHIVE_CATALOG
      .slice(0, Math.min(bossesDefeated, BOSS_ARCHIVE_CATALOG.length))
      .map((entry) => entry.eventId);
  }

  return [];
};

/**
 * Produces an isolated campaign for one unlocked replay target. Every mission
 * and wave remains in its authored position; only the selected wave's event
 * list is replaced with the selected boss starting immediately.
 */
export const buildBossReplayCampaign = (
  eventId: unknown
): GameCampaignConfig | null => {
  const entry = getBossArchiveEntry(eventId);
  if (!entry) return null;

  const campaign = cloneGameCampaign(DEFAULT_GAME_CAMPAIGN);
  const mission = campaign.levels.find((level) => level.id === entry.missionId);
  const wave = mission?.waves.find((candidate) => candidate.id === entry.waveId);
  const boss = wave?.events.find((event): event is BossEvent => (
    event.kind === 'boss' && event.id === entry.eventId
  ));
  if (!wave || !boss) return null;

  wave.events = [{ ...boss, startSeconds: 0 }];
  return campaign;
};
