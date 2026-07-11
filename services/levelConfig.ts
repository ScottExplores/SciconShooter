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

/** Validated, immutable source of truth used by both the real game and local editor. */
export const DEFAULT_GAME_CAMPAIGN: GameCampaignConfig = deepFreeze(
  normalizeGameCampaignRecordCard(parseGameCampaign(campaignJson))
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
): number => Math.max(0.01, level.startingDifficulty * wave.difficultyMultiplier);

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
