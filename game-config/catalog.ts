import { ASSETS } from '../constants';
import type {
  AssetCatalogEntry,
  AssetKey,
  BackgroundCatalogEntry,
  BackgroundId,
  BossCatalogEntry,
  BossId,
  EnemyCatalogEntry,
  EnemyId,
  MovementPatternId,
  MusicCatalogEntry,
  MusicId,
  NamedCatalogEntry,
  PowerupCatalogEntry,
  PowerupId,
  SpawnPatternId,
  SpawnPositionId,
  WeaponId
} from './types';

const asset = (id: AssetKey, label: string, value: string | readonly string[]): AssetCatalogEntry => ({
  id,
  label,
  paths: Array.isArray(value) ? [...value] : [value as string]
});

/** The only asset keys accepted by campaign JSON. Every path resolves through real game ASSETS. */
export const ASSET_CATALOG: Record<AssetKey, AssetCatalogEntry> = {
  PLAYER_SHIP: asset('PLAYER_SHIP', 'ResearchHub ship', ASSETS.PLAYER_SHIP),
  RSC_TOKEN: asset('RSC_TOKEN', 'RSC token', ASSETS.RSC_TOKEN),
  REAL_RSC_ICON: asset('REAL_RSC_ICON', 'RSC flask', ASSETS.REAL_RSC_ICON),
  GAME_BG_BACK: asset('GAME_BG_BACK', 'Deep space', ASSETS.GAME_BG_BACK),
  GAME_BG_STARS: asset('GAME_BG_STARS', 'Star field', ASSETS.GAME_BG_STARS),
  GAME_BG_PLANET: asset('GAME_BG_PLANET', 'Planet horizon', ASSETS.GAME_BG_PLANET),
  GAME_PARALLAX_BACK: asset('GAME_PARALLAX_BACK', 'Parallax space', ASSETS.GAME_PARALLAX_BACK),
  GAME_PARALLAX_STARS: asset('GAME_PARALLAX_STARS', 'Parallax stars', ASSETS.GAME_PARALLAX_STARS),
  GAME_PARALLAX_FAR_PLANETS: asset('GAME_PARALLAX_FAR_PLANETS', 'Far planets', ASSETS.GAME_PARALLAX_FAR_PLANETS),
  GAME_PARALLAX_BIG_PLANET: asset('GAME_PARALLAX_BIG_PLANET', 'Big planet', ASSETS.GAME_PARALLAX_BIG_PLANET),
  GAME_PARALLAX_RING_PLANET: asset('GAME_PARALLAX_RING_PLANET', 'Ring planet', ASSETS.GAME_PARALLAX_RING_PLANET),
  ENEMY_DRONE_FRAMES: asset('ENEMY_DRONE_FRAMES', 'Paywall drone', ASSETS.ENEMY_DRONE_FRAMES),
  ENEMY_SWARM_FRAMES: asset('ENEMY_SWARM_FRAMES', 'Misinformation swarm', ASSETS.ENEMY_SWARM_FRAMES),
  ENEMY_BRICK_FRAMES: asset('ENEMY_BRICK_FRAMES', 'Bureaucracy asteroid', ASSETS.ENEMY_BRICK_FRAMES),
  ENEMY_JOURNAL: asset('ENEMY_JOURNAL', 'Predatory journal', ASSETS.ENEMY_JOURNAL),
  MINI_BOSS: asset('MINI_BOSS', 'Bottleneck drone', ASSETS.MINI_BOSS),
  WALL_BOSS_SEGMENT: asset('WALL_BOSS_SEGMENT', 'Paywall segment', ASSETS.WALL_BOSS_SEGMENT),
  FINAL_BOSS: asset('FINAL_BOSS', 'Gatekeeper sentinel', ASSETS.FINAL_BOSS)
};

export const ENEMY_CATALOG: Record<EnemyId, EnemyCatalogEntry> = {
  drone: {
    id: 'drone',
    label: 'Paywall Drone',
    entityType: 'ENEMY_DRONE',
    defaultSpriteKey: 'ENEMY_DRONE_FRAMES',
    defaultMovementPatternId: 'drift-down',
    baseHealth: 2,
    baseSpeed: 2.5,
    baseDamage: 1,
    baseScoreValue: 10,
    basePowerupDropChance: 0
  },
  swarm: {
    id: 'swarm',
    label: 'Misinformation Swarm',
    entityType: 'ENEMY_SWARM',
    defaultSpriteKey: 'ENEMY_SWARM_FRAMES',
    defaultMovementPatternId: 'track-player',
    baseHealth: 1,
    baseSpeed: 3.5,
    baseDamage: 1,
    baseScoreValue: 12,
    basePowerupDropChance: 0
  },
  brick: {
    id: 'brick',
    label: 'Bureaucracy Brick',
    entityType: 'ENEMY_BRICK',
    defaultSpriteKey: 'ENEMY_BRICK_FRAMES',
    defaultMovementPatternId: 'asteroid-drift',
    baseHealth: 8,
    baseSpeed: 1.5,
    baseDamage: 1,
    baseScoreValue: 20,
    basePowerupDropChance: 0.08
  },
  journal: {
    id: 'journal',
    label: 'Predatory Journal',
    entityType: 'ENEMY_JOURNAL',
    defaultSpriteKey: 'ENEMY_JOURNAL',
    defaultMovementPatternId: 'sine-drift',
    baseHealth: 3,
    baseSpeed: 4.4,
    baseDamage: 1,
    baseScoreValue: 30,
    basePowerupDropChance: 0.08
  }
};

export const BOSS_CATALOG: Record<BossId, BossCatalogEntry> = {
  'bottleneck-drone': {
    id: 'bottleneck-drone',
    label: 'Bottleneck Drone',
    entityType: 'MINI_BOSS',
    defaultSpriteKey: 'MINI_BOSS',
    defaultMovementPatternId: 'track-player',
    allowedWeaponIds: ['aimed-shot']
  },
  'paywall-wall': {
    id: 'paywall-wall',
    label: 'Paywall Wall',
    entityType: 'ENEMY_INVADER',
    defaultSpriteKey: 'WALL_BOSS_SEGMENT',
    defaultMovementPatternId: 'wall-march',
    allowedWeaponIds: ['wall-bolt']
  },
  gatekeeper: {
    id: 'gatekeeper',
    label: 'Gatekeeper',
    entityType: 'BOSS',
    defaultSpriteKey: 'FINAL_BOSS',
    defaultMovementPatternId: 'gatekeeper-cycle',
    allowedWeaponIds: ['burst-volley', 'lane-beam']
  }
};

export const POWERUP_CATALOG: Record<PowerupId, PowerupCatalogEntry> = {
  'double-shot': { id: 'double-shot', label: 'Double Shot', runtimeType: 'DOUBLE_SHOT', defaultWeight: 0.36 },
  'triple-shot': { id: 'triple-shot', label: 'Triple Shot', runtimeType: 'TRIPLE_SHOT', defaultWeight: 0.34 },
  magnet: { id: 'magnet', label: 'Magnet', runtimeType: 'MAGNET', defaultWeight: 0.12 },
  shield: { id: 'shield', label: 'Shield', runtimeType: 'SHIELD', defaultWeight: 0.1 },
  'research-beam': { id: 'research-beam', label: 'Research Beam', runtimeType: 'RESEARCH_BEAM', defaultWeight: 0.08 },
  'extra-life': { id: 'extra-life', label: 'Extra Life', runtimeType: 'EXTRA_LIFE', defaultWeight: 0 }
};

const commonBackgroundLayers: AssetKey[] = [
  'GAME_PARALLAX_BACK',
  'GAME_PARALLAX_STARS',
  'GAME_BG_BACK',
  'GAME_BG_STARS',
  'GAME_PARALLAX_FAR_PLANETS',
  'GAME_BG_PLANET',
  'GAME_PARALLAX_BIG_PLANET',
  'GAME_PARALLAX_RING_PLANET'
];

export const BACKGROUND_CATALOG: Record<BackgroundId, BackgroundCatalogEntry> = {
  'open-orbit': { id: 'open-orbit', label: 'Open Orbit', layerAssetKeys: [...commonBackgroundLayers], tint: '#0f4c81' },
  'citation-storm': { id: 'citation-storm', label: 'Citation Storm', layerAssetKeys: [...commonBackgroundLayers], tint: '#4f46e5' },
  'paywall-siege': { id: 'paywall-siege', label: 'Paywall Siege', layerAssetKeys: [...commonBackgroundLayers], tint: '#d97706' },
  'open-galaxy': { id: 'open-galaxy', label: 'Open Galaxy', layerAssetKeys: [...commonBackgroundLayers], tint: '#10b981' }
};

export const MUSIC_CATALOG: Record<MusicId, MusicCatalogEntry> = {
  'procedural-main': { id: 'procedural-main', label: 'Scicon procedural pulse', runtimeCue: 'procedural-main' }
};

export const SPAWN_PATTERN_CATALOG: Record<SpawnPatternId, NamedCatalogEntry<SpawnPatternId>> = {
  'single-random': { id: 'single-random', label: 'Random singles' },
  row: { id: 'row', label: 'Row' },
  v: { id: 'v', label: 'V formation' },
  sine: { id: 'sine', label: 'Sine wave' },
  pincer: { id: 'pincer', label: 'Pincer' },
  'asteroid-lanes': { id: 'asteroid-lanes', label: 'Asteroid lanes' }
};

export const SPAWN_POSITION_CATALOG: Record<SpawnPositionId, NamedCatalogEntry<SpawnPositionId>> = {
  'random-top': { id: 'random-top', label: 'Random top edge' },
  'formation-top': { id: 'formation-top', label: 'Centered formation' },
  'center-top': { id: 'center-top', label: 'Top center' },
  'lane-top': { id: 'lane-top', label: 'Top lanes' }
};

export const MOVEMENT_PATTERN_CATALOG: Record<MovementPatternId, NamedCatalogEntry<MovementPatternId>> = {
  'drift-down': { id: 'drift-down', label: 'Downward drift' },
  'sine-drift': { id: 'sine-drift', label: 'Sine drift' },
  'track-player': { id: 'track-player', label: 'Track player' },
  'wall-march': { id: 'wall-march', label: 'Wall march' },
  'asteroid-drift': { id: 'asteroid-drift', label: 'Asteroid drift' },
  'gatekeeper-cycle': { id: 'gatekeeper-cycle', label: 'Gatekeeper attack cycle' }
};

export const WEAPON_CATALOG: Record<WeaponId, NamedCatalogEntry<WeaponId>> = {
  'aimed-shot': { id: 'aimed-shot', label: 'Aimed shot' },
  'wall-bolt': { id: 'wall-bolt', label: 'Wall bolt' },
  'burst-volley': { id: 'burst-volley', label: 'Burst volley' },
  'lane-beam': { id: 'lane-beam', label: 'Lane beam' }
};
