import campaignJson from '../game-config/campaign.json' with { type: 'json' };
import {
  ASSET_CATALOG,
  BACKGROUND_CATALOG,
  BOSS_CATALOG,
  ENEMY_CATALOG,
  MOVEMENT_PATTERN_CATALOG,
  MUSIC_CATALOG,
  POWERUP_CATALOG,
  SPAWN_PATTERN_CATALOG,
  SPAWN_POSITION_CATALOG,
  WEAPON_CATALOG
} from '../game-config/catalog';
import { parseGameCampaign } from '../game-config/validate';
import { normalizeGameCampaignRecordCard } from '../game-config/recordCard';
import { getSandboxBossKit } from './gameplay/sandboxBossRoster';
import { resolveAuthoredDifficulty } from './gameplay/difficulty';
import type {
  AssetKey,
  BackgroundId,
  BossId,
  EnemyId,
  GameCampaignConfig,
  LevelDefinition,
  MovementPatternId,
  MusicId,
  PowerupId,
  SpawnPatternId,
  SpawnPositionId,
  WaveDefinition,
  WaveEvent,
  WeaponId
} from '../game-config/types';

const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
};

const PROMOTED_BOSS_TUNING = {
  'meridian-harrower': { health: 3300, scoreReward: 25010, sizeMultiplier: 1.45 },
  'cinderjaw-siege-beetle': { health: 5800, scoreReward: 42010, sizeMultiplier: 1.65 },
  'vesperglass-mothmother': { health: 6600, scoreReward: 47010, sizeMultiplier: 1.25 }
} as const;

/**
 * Sandbox sentences already carry the cadence. Meridian studies the sweep,
 * Cinderjaw keeps the widest serial beat, and Vesperglass steps in tighter
 * inside the kit. Scaling those timelines again would crush the telegraphs.
 */
const PROMOTED_TIMELINE_SCALE = {
  'meridian-harrower': 1,
  'cinderjaw-siege-beetle': 1,
  'vesperglass-mothmother': 1
} as const;

const scalePromotedTimeline = <T extends { durationSeconds: number; clips: Array<{ startSeconds: number; durationSeconds: number; parameters?: { warningSeconds?: number }; repeat?: { intervalSeconds: number } }> }>(
  timeline: T,
  scale: number
): T => {
  if (scale === 1) return timeline;
  const clips = timeline.clips.map((clip) => {
    const parameters = clip.parameters && typeof clip.parameters.warningSeconds === 'number'
      ? { ...clip.parameters, warningSeconds: clip.parameters.warningSeconds * scale }
      : clip.parameters;
    return {
      ...clip,
      startSeconds: clip.startSeconds * scale,
      durationSeconds: clip.durationSeconds * scale,
      ...(parameters ? { parameters } : {}),
      ...(clip.repeat ? {
        repeat: {
          ...clip.repeat,
          intervalSeconds: clip.repeat.intervalSeconds * scale
        }
      } : {})
    };
  });
  const lastClipEnd = clips.reduce(
    (end, clip) => Math.max(end, clip.startSeconds + clip.durationSeconds),
    0
  );
  return {
    ...timeline,
    durationSeconds: Math.max(12, lastClipEnd + 0.4),
    clips
  };
};

/**
 * The campaign file stays schema-valid on its own. These three bosses then
 * take the sandbox weapons, phases, timeline, and rig while keeping the
 * campaign identity, sprite, health, and score.
 */
const applyPromotedBossKits = (campaign: GameCampaignConfig): GameCampaignConfig => {
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      for (const event of wave.events) {
        if (event.kind !== 'boss') continue;
        const tuning = PROMOTED_BOSS_TUNING[event.bossId as keyof typeof PROMOTED_BOSS_TUNING];
        if (!tuning) continue;
        const kit = getSandboxBossKit(event.bossId as keyof typeof PROMOTED_BOSS_TUNING);
        event.weapons = kit.weapons;
        event.phases = kit.phases;
        event.timeline = scalePromotedTimeline(
          kit.timeline,
          PROMOTED_TIMELINE_SCALE[event.bossId as keyof typeof PROMOTED_TIMELINE_SCALE]
        );
        event.rigId = kit.rigId;
        event.speed = kit.speed;
        // Scott's intact sprite is the whole boss. Borrowed paywall and
        // open-orbit parts stay off, the same way Crownclaw and Helios do
        // not wear another rig's pods.
        event.componentMode = 'hull-only';
        delete event.componentHealth;
        event.health = tuning.health;
        event.scoreReward = tuning.scoreReward;
        event.sizeMultiplier = tuning.sizeMultiplier;
      }
    }
  }
  return campaign;
};

/** Validated, immutable source of truth used by both the real game and local editor. */
export const DEFAULT_GAME_CAMPAIGN: GameCampaignConfig = deepFreeze(
  normalizeGameCampaignRecordCard(
    applyPromotedBossKits(structuredClone(parseGameCampaign(campaignJson)))
  )
);

export const cloneGameCampaign = (
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): GameCampaignConfig => JSON.parse(JSON.stringify(campaign)) as GameCampaignConfig;

export const flattenLevels = (campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN): LevelDefinition[] => (
  [...campaign.levels].sort((left, right) => left.order - right.order)
);

export const flattenWaves = (campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN): WaveDefinition[] => (
  flattenLevels(campaign).flatMap((level) => [...level.waves].sort((left, right) => left.order - right.order))
);

export const flattenWaveEvents = (campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN): WaveEvent[] => (
  flattenWaves(campaign).flatMap((wave) => wave.events)
);

export const getLevelById = (
  campaign: GameCampaignConfig,
  levelId: string
): LevelDefinition | undefined => campaign.levels.find((level) => level.id === levelId);

export const getWaveById = (
  campaign: GameCampaignConfig,
  waveId: string,
  levelId?: string
): WaveDefinition | undefined => {
  const levels = levelId ? campaign.levels.filter((level) => level.id === levelId) : campaign.levels;
  return levels.flatMap((level) => level.waves).find((wave) => wave.id === waveId);
};

export const getWaveEventById = (
  campaign: GameCampaignConfig,
  eventId: string
): WaveEvent | undefined => flattenWaveEvents(campaign).find((event) => event.id === eventId);

export const findLevel = getLevelById;
export const findWave = getWaveById;
export const findWaveEvent = getWaveEventById;

export const getDifficultyMultiplier = (
  level: LevelDefinition,
  wave: WaveDefinition
): number => resolveAuthoredDifficulty({
  startingDifficulty: level.startingDifficulty,
  waveDifficultyMultiplier: wave.difficultyMultiplier
});

export const getAsset = (id: AssetKey) => ASSET_CATALOG[id];
export const getAssetPaths = (id: AssetKey): readonly string[] => getAsset(id).paths;
export const getPrimaryAssetPath = (id: AssetKey): string => getAsset(id).paths[0];
export const getEnemy = (id: EnemyId) => ENEMY_CATALOG[id];
export const getBoss = (id: BossId) => BOSS_CATALOG[id];
export const getPowerup = (id: PowerupId) => POWERUP_CATALOG[id];
export const getBackground = (id: BackgroundId) => BACKGROUND_CATALOG[id];
export const getMusic = (id: MusicId) => MUSIC_CATALOG[id];
export const getSpawnPattern = (id: SpawnPatternId) => SPAWN_PATTERN_CATALOG[id];
export const getSpawnPosition = (id: SpawnPositionId) => SPAWN_POSITION_CATALOG[id];
export const getMovementPattern = (id: MovementPatternId) => MOVEMENT_PATTERN_CATALOG[id];
export const getWeapon = (id: WeaponId) => WEAPON_CATALOG[id];

export {
  ASSET_CATALOG,
  BACKGROUND_CATALOG,
  BOSS_CATALOG,
  ENEMY_CATALOG,
  MOVEMENT_PATTERN_CATALOG,
  MUSIC_CATALOG,
  POWERUP_CATALOG,
  SPAWN_PATTERN_CATALOG,
  SPAWN_POSITION_CATALOG,
  WEAPON_CATALOG
};

export {
  CampaignValidationError,
  assertValidGameCampaign,
  isBlockingEvent,
  isBossEvent,
  parseGameCampaign,
  validateGameCampaign
} from '../game-config/validate';

export type * from '../game-config/types';
