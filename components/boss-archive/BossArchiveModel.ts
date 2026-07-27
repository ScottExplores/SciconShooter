import type { BossArchiveEntry } from '../../services/bossArchive';

export type BossArchiveMode = 'practice' | 'challenge';

export interface BossArchiveRewardPreview {
  readonly id: string;
  readonly label: string;
  readonly amount?: string | number;
  readonly iconUrl?: string;
  readonly tone?: 'coin' | 'material' | 'cosmetic' | 'record';
}

export interface BossArchiveMasteryObjective {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly completed: boolean;
  readonly claimed?: boolean;
  readonly progress?: number;
  readonly target?: number;
  readonly reward?: BossArchiveRewardPreview;
}

export interface BossArchiveBossRecord {
  readonly timesDefeated?: number;
  readonly totalClears?: number;
  readonly challengeAttempts?: number;
  readonly challengeClears?: number;
  readonly bestClearTimeMs?: number | null;
  readonly bestChallengeTimeMs?: number | null;
  readonly bestNoHitTimeMs?: number | null;
  readonly noHitClears?: number;
  readonly masteryObjectives?: readonly BossArchiveMasteryObjective[];
}

export interface BossArchiveVariant {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface BossArchivePresentation {
  readonly subtitle?: string;
  readonly description?: string;
  readonly difficultyLabel?: string;
  readonly threatLevel?: number;
  readonly mechanicTags?: readonly string[];
  readonly portraitUrl?: string;
  /** Optional lightweight animation. Only the selected carousel entry advances frames. */
  readonly idleFrameUrls?: readonly string[];
  readonly idleFps?: number;
  readonly backdropUrl?: string;
  readonly accentColor?: string;
  readonly challengeReward?: readonly BossArchiveRewardPreview[];
  readonly masteryObjectives?: readonly BossArchiveMasteryObjective[];
  readonly variants?: readonly BossArchiveVariant[];
  readonly bestTimeTargetMs?: number;
}

export interface BossArchiveDailyChallengeState {
  readonly limit: number;
  readonly remaining: number;
  readonly resetLabel: string;
  readonly available?: boolean;
  readonly pending?: boolean;
}

export interface BossArchiveFightRequest {
  readonly mode: BossArchiveMode;
  readonly variantId: string;
}

export interface BossArchiveResult {
  readonly eventId: string;
  readonly outcome: 'victory' | 'defeat';
  readonly mode?: BossArchiveMode;
  readonly variantId?: string;
  readonly clearTimeMs?: number | null;
  readonly damageTaken?: number;
  readonly noHit?: boolean;
  readonly newPersonalRecord?: boolean;
  readonly reward?: readonly BossArchiveRewardPreview[];
  readonly chargesRemaining?: number;
  readonly masteryCompletedIds?: readonly string[];
  readonly notice?: string;
}

export interface BossArchiveDeveloperControls {
  readonly enabled: boolean;
  readonly dailyLimit?: number;
  readonly onDailyLimitChange?: (limit: number) => void;
  readonly showLockedEntries?: boolean;
  readonly onShowLockedEntriesChange?: (show: boolean) => void;
  readonly onUnlockAll?: () => void;
  readonly onResetProgress?: () => void;
  readonly onResetDailyCharges?: () => void;
  readonly onSimulateNewUnlock?: (eventId: string) => void;
  readonly onSimulateMastery?: (eventId: string) => void;
  readonly onPreviewResult?: (outcome: BossArchiveResult['outcome']) => void;
}

export interface BossArchiveViewEntry {
  readonly entry: BossArchiveEntry;
  readonly unlocked: boolean;
  readonly isNew: boolean;
  readonly presentation: BossArchivePresentation;
  readonly record: BossArchiveBossRecord;
}

export const sortBossArchiveEntries = (
  entries: readonly BossArchiveEntry[]
): BossArchiveEntry[] => [...entries].sort((left, right) => (
  left.missionNumber - right.missionNumber
  || left.waveNumber - right.waveNumber
  || left.label.localeCompare(right.label)
));

const clampThreatLevel = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(5, Math.round(parsed)))
    : fallback;
};

export const createDefaultBossArchivePresentation = (
  entry: BossArchiveEntry
): BossArchivePresentation => {
  const threatLevel = Math.max(1, Math.min(5, Math.ceil(entry.missionNumber / 4)));
  return Object.freeze({
    subtitle: `${entry.missionName} // ${entry.waveName}`,
    description: 'Recovered combat telemetry is ready for a controlled rechallenge simulation.',
    difficultyLabel: `Threat ${String(threatLevel).padStart(2, '0')}`,
    threatLevel,
    mechanicTags: ['Pattern analysis', 'Boss simulation'],
    portraitUrl: entry.artUrl,
    idleFrameUrls: [entry.artUrl],
    idleFps: 6,
    accentColor: '#22d3ee',
    variants: [{ id: 'standard', label: 'Standard' }],
    challengeReward: []
  });
};

export const resolveBossArchivePresentation = (
  entry: BossArchiveEntry,
  presentation?: BossArchivePresentation
): BossArchivePresentation => {
  const fallback = createDefaultBossArchivePresentation(entry);
  const idleFrameUrls = presentation?.idleFrameUrls?.filter(Boolean);
  const mechanicTags = presentation?.mechanicTags?.filter(Boolean).slice(0, 4);
  const variants = presentation?.variants?.filter((variant) => Boolean(variant.id && variant.label));
  return Object.freeze({
    ...fallback,
    ...presentation,
    threatLevel: clampThreatLevel(presentation?.threatLevel, fallback.threatLevel ?? 1),
    mechanicTags: mechanicTags?.length ? mechanicTags : fallback.mechanicTags,
    portraitUrl: presentation?.portraitUrl || entry.artUrl,
    idleFrameUrls: idleFrameUrls?.length ? idleFrameUrls : fallback.idleFrameUrls,
    idleFps: Math.max(1, Math.min(12, Math.round(presentation?.idleFps ?? fallback.idleFps ?? 6))),
    variants: variants?.length ? variants : fallback.variants,
    challengeReward: presentation?.challengeReward ?? fallback.challengeReward
  });
};

export const buildBossArchiveViewEntries = ({
  unlockedEntries,
  catalogEntries,
  newEncounterIds,
  presentations,
  records,
  revealLockedEntries
}: {
  unlockedEntries: readonly BossArchiveEntry[];
  catalogEntries?: readonly BossArchiveEntry[];
  newEncounterIds: ReadonlySet<string> | readonly string[];
  presentations?: Readonly<Record<string, BossArchivePresentation>>;
  records?: Readonly<Record<string, BossArchiveBossRecord>>;
  revealLockedEntries?: boolean;
}): BossArchiveViewEntry[] => {
  const unlockedById = new Map(unlockedEntries.map((entry) => [entry.eventId, entry]));
  const newIds = new Set(Array.from(newEncounterIds));
  const source = revealLockedEntries && catalogEntries?.length
    ? catalogEntries
    : unlockedEntries;

  return sortBossArchiveEntries(source).map((catalogEntry) => {
    const unlockedEntry = unlockedById.get(catalogEntry.eventId);
    const entry = unlockedEntry ?? catalogEntry;
    return Object.freeze({
      entry,
      unlocked: Boolean(unlockedEntry),
      isNew: Boolean(unlockedEntry && newIds.has(entry.eventId)),
      presentation: resolveBossArchivePresentation(entry, presentations?.[entry.eventId]),
      record: Object.freeze({ ...(records?.[entry.eventId] ?? {}) })
    });
  });
};

export const resolveBossArchiveInitialIndex = (
  entries: readonly BossArchiveViewEntry[],
  preferredEventId?: string | null,
  rememberedEventId?: string | null
) => {
  if (entries.length === 0) return 0;
  const newIndex = entries.findIndex((item) => item.unlocked && item.isNew);
  if (newIndex >= 0) return newIndex;
  const preferredIndex = preferredEventId
    ? entries.findIndex((item) => item.entry.eventId === preferredEventId)
    : -1;
  if (preferredIndex >= 0) return preferredIndex;
  const rememberedIndex = rememberedEventId
    ? entries.findIndex((item) => item.entry.eventId === rememberedEventId)
    : -1;
  if (rememberedIndex >= 0) return rememberedIndex;
  const firstUnlocked = entries.findIndex((item) => item.unlocked);
  return firstUnlocked >= 0 ? firstUnlocked : 0;
};

export const getLoopedBossArchiveIndex = (
  length: number,
  index: number
) => length > 0 ? ((index % length) + length) % length : 0;

export const getBossArchiveRelativePosition = (
  itemIndex: number,
  selectedIndex: number,
  length: number
) => {
  if (length <= 1) return 0;
  let distance = getLoopedBossArchiveIndex(length, itemIndex - selectedIndex);
  if (distance > length / 2) distance -= length;
  return distance;
};

export const formatBossArchiveClearTime = (milliseconds?: number | null) => {
  if (!Number.isFinite(milliseconds) || Number(milliseconds) <= 0) return '--:--.--';
  const totalCentiseconds = Math.max(0, Math.floor(Number(milliseconds) / 10));
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
};

export const getBossArchiveChallengeDisabledReason = (
  item: BossArchiveViewEntry | undefined,
  challenge: BossArchiveDailyChallengeState | undefined
) => {
  if (!item?.unlocked) return 'Defeat this threat in its campaign mission to unlock rechallenges.';
  if (!challenge) return 'Rewarded challenges are not connected for this profile yet.';
  if (challenge.pending) return 'Challenge status is syncing.';
  if (challenge.available === false) return 'Rewarded challenges are temporarily offline.';
  if (challenge.remaining <= 0) return `All rewarded clears used. ${challenge.resetLabel}`;
  return null;
};
