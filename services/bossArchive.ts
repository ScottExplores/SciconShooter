import type {
  BackgroundId,
  BossEvent,
  GameCampaignConfig
} from '../game-config/types';
import {
  cloneGameCampaign,
  DEFAULT_GAME_CAMPAIGN,
  getAssetPaths,
  getPrimaryAssetPath
} from './levelConfig';

export type BossArchiveDifficultyTier = 1 | 2 | 3 | 4 | 5;
export type BossArchiveMasteryObjectiveKind =
  | 'challenge-clear'
  | 'no-hit-clear'
  | 'timed-clear';

export interface BossArchiveDifficultyPresentation {
  readonly tier: BossArchiveDifficultyTier;
  readonly label: 'RISING' | 'DANGEROUS' | 'ELITE' | 'APEX' | 'TERMINUS';
}

export interface BossArchiveTheme {
  readonly backgroundId: BackgroundId;
  readonly accentColor: string;
  readonly panelTint: string;
  readonly glowColor: string;
}

export interface BossArchivePreview {
  /** Static card/portrait art. Unselected cards should use this path. */
  readonly portraitUrl: string;
  /** Existing authored frames used only by the selected boss preview. */
  readonly idleFrameUrls: readonly string[];
  readonly idleFramesPerSecond: number;
}

export interface BossArchiveVariant {
  readonly id: 'standard';
  readonly label: string;
  readonly description: string;
  readonly difficultyMultiplier: 1;
  readonly rewardMultiplier: 1;
}

export interface BossArchiveChallengeReward {
  readonly resource: 'coins';
  readonly amount: number;
  readonly label: string;
}

export interface BossArchiveChallengePresentation {
  readonly dailyChargeCost: 1;
  readonly practiceLabel: string;
  readonly practiceDescription: string;
  readonly challengeLabel: string;
  readonly challengeDescription: string;
  readonly reward: BossArchiveChallengeReward;
}

export interface BossArchiveMasteryObjectiveConfig {
  readonly id: 'challenge-clear' | 'no-hit-clear' | 'timed-clear';
  readonly kind: BossArchiveMasteryObjectiveKind;
  readonly label: string;
  readonly description: string;
  readonly target: number;
  readonly rewardCoins: number;
  /** Cosmetic hooks are profile-only and deliberately provide no combat advantage. */
  readonly cosmeticRewardId: string;
  readonly cosmeticRewardLabel: string;
}

export interface BossArchiveLockedPresentation {
  readonly label: 'Unknown Signal';
  readonly subtitle: string;
  readonly description: string;
  readonly campaignHint: string;
  readonly mechanicTags: readonly [];
  readonly portraitUrl: null;
}

export const BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS = 100;
export const BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS = 25;
export const BOSS_ARCHIVE_BASE_SPEED_TARGET_SECONDS = 75;
export const BOSS_ARCHIVE_SPEED_TARGET_STEP_SECONDS = 2.5;
export const BOSS_ARCHIVE_MASTERY_REWARD_MULTIPLIERS = Object.freeze([
  0.75,
  1,
  1.25
] as const);

export const getBossArchiveChallengeRewardCoins = (missionNumber: number) => (
  BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS
  + BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS
    * Math.max(0, Math.floor(Number(missionNumber) || 1) - 1)
);

export const getBossArchiveSpeedTargetSeconds = (missionNumber: number) => (
  BOSS_ARCHIVE_BASE_SPEED_TARGET_SECONDS
  + BOSS_ARCHIVE_SPEED_TARGET_STEP_SECONDS
    * Math.max(0, Math.floor(Number(missionNumber) || 1) - 1)
);

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
  readonly subtitle: string;
  readonly description: string;
  readonly mechanicTags: readonly string[];
  readonly difficulty: BossArchiveDifficultyPresentation;
  readonly theme: BossArchiveTheme;
  readonly preview: BossArchivePreview;
  readonly variants: readonly BossArchiveVariant[];
  readonly challenge: BossArchiveChallengePresentation;
  readonly masteryObjectives: readonly BossArchiveMasteryObjectiveConfig[];
  /** Spoiler-safe copy for optional locked-card previews. */
  readonly lockedPresentation: BossArchiveLockedPresentation;
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

const DIFFICULTY_LABELS: Record<BossArchiveDifficultyTier, BossArchiveDifficultyPresentation['label']> = {
  1: 'RISING',
  2: 'DANGEROUS',
  3: 'ELITE',
  4: 'APEX',
  5: 'TERMINUS'
};

const RIG_CLASSIFICATIONS: Readonly<Record<string, string>> = Object.freeze({
  'open-orbit': 'ORBITAL GATEKEEPER',
  'paywall-siege': 'SIEGE-CLASS GATEKEEPER',
  'crown-claw': 'ARMORED CLAW-CLASS',
  'citation-storm': 'HELIX ARBITER'
});

const MOVEMENT_TAGS: Readonly<Record<string, string>> = Object.freeze({
  'arena-roam': 'Arena Roam',
  'gatekeeper-cycle': 'Pattern Shift'
});

const WEAPON_TAGS: Readonly<Record<string, string>> = Object.freeze({
  'aimed-shot': 'Tracking Fire',
  'burst-volley': 'Burst Volleys',
  'lane-beam': 'Lane Beams',
  'wall-bolt': 'Siege Bolts'
});

/** Optional authored flavor. Missing encounters use the safe campaign-derived copy below. */
const BOSS_ARCHIVE_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'open-orbit-gatekeeper': 'An orbital sentry that alternates compact volleys with sweeping lane pressure.',
  'paywall-siege-gatekeeper': 'A reinforced siege core built to close safe lanes with sustained crossfire.',
  'bastion-protocol-gatekeeper': 'A plated crownclaw that protects the frontier with escalating beam patterns.',
  'helix-convergence-final-boss': 'A violet arbiter whose three-phase attack cycle tightens as its hull weakens.',
  'redline-corridor-final-boss': 'A roaming rail serpent that turns open space into a shifting firing corridor.',
  'mirror-array-final-boss': 'A prismatic wing commander that combines arena movement with dense volleys.',
  'null-sector-final-boss': 'A hardened overseer that advances through three increasingly dangerous phases.',
  'quantum-cage-final-boss': 'A rotating lattice threat that layers beam lanes over expanding burst patterns.',
  'gravity-well-final-boss': 'A singularity marshal that roams the arena while compressing escape routes.',
  'ion-citadel-final-boss': 'An ion-crowned arbiter tuned for long volleys and rapid phase transitions.',
  'crimson-vector-final-boss': 'A siege monarch that projects converging vectors across the combat space.',
  'fracture-engine-final-boss': 'A massive engine guardian whose late phases leave little room between attacks.',
  'terminus-ascendant-final-boss': 'The final sovereign combines the campaign\'s heaviest volleys and lane pressure.'
});

const buildDifficulty = (missionNumber: number): BossArchiveDifficultyPresentation => {
  const tier = Math.min(5, Math.max(1, Math.ceil(missionNumber / 4))) as BossArchiveDifficultyTier;
  return Object.freeze({ tier, label: DIFFICULTY_LABELS[tier] });
};

const buildMechanicTags = (event: BossEvent): readonly string[] => {
  const tags = event.weapons
    .map((weapon) => WEAPON_TAGS[weapon.weaponId] ?? null)
    .filter((tag): tag is string => Boolean(tag));
  const movementTag = MOVEMENT_TAGS[event.movementPatternId];
  if (movementTag) tags.push(movementTag);
  if (event.phases.length >= 3) tags.push(`${event.phases.length} Phases`);
  if (event.shieldCount > 0) tags.push('Orbit Shields');
  if (tags.length === 0) tags.push('Combat Pattern');
  return Object.freeze(Array.from(new Set(tags)).slice(0, 4));
};

const buildMasteryObjectives = (
  eventId: string,
  label: string,
  missionNumber: number,
  challengeRewardCoins: number
): readonly BossArchiveMasteryObjectiveConfig[] => {
  const speedTargetSeconds = getBossArchiveSpeedTargetSeconds(missionNumber);
  const rewards = BOSS_ARCHIVE_MASTERY_REWARD_MULTIPLIERS.map((multiplier) => (
    Math.max(1, Math.round(challengeRewardCoins * multiplier))
  ));
  return Object.freeze([
    Object.freeze({
      id: 'challenge-clear' as const,
      kind: 'challenge-clear' as const,
      label: 'Rematch Victor',
      description: `Defeat ${label} in Challenge mode.`,
      target: 1,
      rewardCoins: rewards[0],
      cosmeticRewardId: `boss-archive:${eventId}:badge`,
      cosmeticRewardLabel: `${label} Badge`
    }),
    Object.freeze({
      id: 'no-hit-clear' as const,
      kind: 'no-hit-clear' as const,
      label: 'Untouchable',
      description: 'Complete a Challenge clear without taking damage.',
      target: 1,
      rewardCoins: rewards[1],
      cosmeticRewardId: `boss-archive:${eventId}:frame`,
      cosmeticRewardLabel: `${label} Portrait Frame`
    }),
    Object.freeze({
      id: 'timed-clear' as const,
      kind: 'timed-clear' as const,
      label: 'Rapid Response',
      description: `Complete a Challenge clear in ${speedTargetSeconds} seconds or less.`,
      target: speedTargetSeconds,
      rewardCoins: rewards[2],
      cosmeticRewardId: `boss-archive:${eventId}:emblem`,
      cosmeticRewardLabel: `${label} Archive Emblem`
    })
  ]);
};

const buildLockedPresentation = (missionNumber: number): BossArchiveLockedPresentation => Object.freeze({
  label: 'Unknown Signal',
  subtitle: 'ENCRYPTED THREAT',
  description: 'Defeat this campaign threat to decrypt its archive record.',
  campaignHint: `Mission ${missionNumber}`,
  mechanicTags: Object.freeze([]) as readonly [],
  portraitUrl: null
});

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
        .map((event) => {
          const artUrl = getPrimaryAssetPath(event.spriteKey);
          const challengeRewardCoins = getBossArchiveChallengeRewardCoins(level.order);
          const accentColor = wave.accent || '#67e8f9';
          const authoredPreviewFrames = getAssetPaths(event.spriteKey);
          // Some campaign sprite arrays are authored destruction/decay sequences.
          // They are valid in combat, but cycling them in the Archive makes an
          // intact boss appear to fall apart while idling. Keep those portraits
          // composed on their first frame; true idle arrays can still animate.
          const archivePreviewFrames = authoredPreviewFrames.some((url) => (
            /\/(?:decay|death|destroyed?)\//i.test(url)
          ))
            ? authoredPreviewFrames.slice(0, 1)
            : authoredPreviewFrames;
          const idleFrameUrls = Object.freeze(
            archivePreviewFrames.length > 0 ? [...archivePreviewFrames] : [artUrl]
          );
          return Object.freeze({
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
            artUrl,
            subtitle: RIG_CLASSIFICATIONS[event.rigId ?? ''] ?? 'ARCHIVE GATEKEEPER',
            description: BOSS_ARCHIVE_DESCRIPTIONS[event.id]
              ?? `${event.label} commands the final defense of ${level.name}.`,
            mechanicTags: buildMechanicTags(event),
            difficulty: buildDifficulty(level.order),
            theme: Object.freeze({
              backgroundId: wave.backgroundId,
              accentColor,
              panelTint: `${accentColor}24`,
              glowColor: event.spriteStyle?.glowColor ?? accentColor
            }),
            preview: Object.freeze({
              portraitUrl: artUrl,
              idleFrameUrls,
              idleFramesPerSecond: idleFrameUrls.length > 1 ? 8 : 0
            }),
            variants: Object.freeze([
              Object.freeze({
                id: 'standard' as const,
                label: 'Archive Standard',
                description: 'Original campaign tuning and attack sequence.',
                difficultyMultiplier: 1 as const,
                rewardMultiplier: 1 as const
              })
            ]),
            challenge: Object.freeze({
              dailyChargeCost: 1 as const,
              practiceLabel: 'Practice',
              practiceDescription: 'Unlimited attempts. Records only; no daily reward.',
              challengeLabel: 'Challenge Boss',
              challengeDescription: 'A successful clear uses one daily charge and grants the shown reward.',
              reward: Object.freeze({
                resource: 'coins' as const,
                amount: challengeRewardCoins,
                label: `+${challengeRewardCoins.toLocaleString()} research coins`
              })
            }),
            masteryObjectives: buildMasteryObjectives(
              event.id,
              event.label,
              level.order,
              challengeRewardCoins
            ),
            lockedPresentation: buildLockedPresentation(level.order)
          });
        })));

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
