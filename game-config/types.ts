/**
 * Stable asset identifiers backed by `ASSETS` in `constants.ts`.
 * Campaign JSON stores only these identifiers; it never accepts file paths.
 */
export type AssetKey =
  | 'PLAYER_SHIP'
  | 'RSC_TOKEN'
  | 'REAL_RSC_ICON'
  | 'GAME_BG_BACK'
  | 'GAME_BG_STARS'
  | 'GAME_BG_PLANET'
  | 'GAME_PARALLAX_BACK'
  | 'GAME_PARALLAX_STARS'
  | 'GAME_PARALLAX_FAR_PLANETS'
  | 'GAME_PARALLAX_BIG_PLANET'
  | 'GAME_PARALLAX_RING_PLANET'
  | 'ENEMY_DRONE_FRAMES'
  | 'ENEMY_SWARM_FRAMES'
  | 'ENEMY_BRICK_FRAMES'
  | 'ENEMY_JOURNAL'
  | 'MINI_BOSS'
  | 'WALL_BOSS_SEGMENT'
  | 'FINAL_BOSS';

export type EnemyId = 'drone' | 'swarm' | 'brick' | 'journal';
export type BossId = 'bottleneck-drone' | 'paywall-wall' | 'gatekeeper';
export type PowerupId = 'double-shot' | 'triple-shot' | 'magnet' | 'shield' | 'research-beam' | 'extra-life';
export type BackgroundId = 'open-orbit' | 'citation-storm' | 'paywall-siege' | 'open-galaxy';
export type MusicId = 'procedural-main';
export type SpawnPatternId = 'single-random' | 'row' | 'v' | 'sine' | 'pincer' | 'asteroid-lanes';
export type SpawnPositionId = 'random-top' | 'formation-top' | 'center-top' | 'lane-top';
export type MovementPatternId = 'drift-down' | 'sine-drift' | 'track-player' | 'wall-march' | 'asteroid-drift' | 'gatekeeper-cycle';
export type WeaponId = 'aimed-shot' | 'wall-bolt' | 'burst-volley' | 'lane-beam';
export type ScorecardMetricId = 'wave' | 'targets' | 'coins' | 'flight';

export interface GameCampaignConfig {
  /** Increment only for a breaking JSON shape change. Current default: 1. */
  schemaVersion: 1;
  /** Monotonic local content revision. Initial tracked default: 1. */
  revision: number;
  id: string;
  name: string;
  /** ISO-8601 timestamp describing the tracked revision, not a runtime save time. */
  updatedAt: string;
  /** The real game simulation rate. Current and required default: 60. */
  fps: 60;
  /** Shared by the in-game record, local Director, and NFT/share SVG renderer. */
  recordCard: RecordCardConfig;
  /** At least one level is required. */
  levels: LevelDefinition[];
}

/** Compatibility-friendly short name for engine/editor consumers. */
export type GameCampaign = GameCampaignConfig;

export interface RecordCardCopy {
  title: string;
  subtitle: string;
  callsignLabel: string;
  scoreLabel: string;
  verifiedLabel: string;
  reviewLabel: string;
  metricLabels: {
    wave: string;
    targets: string;
    coins: string;
    flight: string;
  };
}

export interface RecordCardColors {
  background: string;
  panel: string;
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  text: string;
  muted: string;
}

export interface RecordCardArtRegion {
  /** 1200 x 1200 card design-space coordinates. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface RecordCardConfig {
  copy: RecordCardCopy;
  colors: RecordCardColors;
  showGrid: boolean;
  shipAssetKey: AssetKey;
  /** AUTO keeps the encounter art selected by the real run/wave. */
  encounterAssetKey: AssetKey | 'AUTO';
  art: {
    ship: RecordCardArtRegion;
    encounter: RecordCardArtRegion;
  };
}

export interface LevelDefinition {
  id: string;
  name: string;
  description: string;
  order: number;
  backgroundId: BackgroundId;
  musicId: MusicId;
  /**
   * Optional runtime multiplier after explicit tuning. Apply to hostile health/speed/damage
   * and inversely to spawn intervals, but not score rewards. Current default: 1.
   */
  startingDifficulty: number;
  /** Zero preserves today's no-target behavior; a positive value enables a target. */
  scoreTarget: number;
  /** Null preserves today's completion-driven mission with no hard time limit. */
  durationSeconds: number | null;
  /** True preserves the current endless rotation through sector waves. */
  loopWaves: boolean;
  availablePowerupIds: PowerupId[];
  scorecard: LevelScorecardSettings;
  waves: WaveDefinition[];
}

export interface LevelScorecardSettings {
  /** Current default: show only when the mission/run ends. */
  trigger: 'mission-end' | 'level-complete';
  title: string;
  subtitle: string;
  scoreLabel: string;
  metrics: ScorecardMetricId[];
  showEncounterArt: boolean;
  encounterAssetKey: AssetKey;
}

export interface WaveDefinition {
  id: string;
  name: string;
  order: number;
  accent: string;
  backgroundId: BackgroundId;
  /**
   * Optional runtime multiplier after explicit tuning. Apply to hostile health/speed/damage
   * and inversely to spawn intervals, but not score rewards. Current default: 1.
   */
  difficultyMultiplier: number;
  /** Active-combat clock. Current default: 60 seconds (3600 frames). */
  durationSeconds: number;
  /** Launch cinematic before the active clock; wave 1 default: 2.5 seconds. */
  introSeconds: number;
  /** Departure delay after final-boss defeat; current default: 2.8 seconds. */
  delayAfterSeconds: number;
  /** Current score formula is 2^(wave order - 1). */
  scoreMultiplier: number;
  /** Maximum simultaneous hostile entities before adaptive device caps. */
  threatCap: number;
  /** Ordered by startSeconds, then array order for simultaneous events. */
  events: WaveEvent[];
}

export interface BaseWaveEvent {
  id: string;
  label: string;
  /** Seconds on the active wave clock; blocking encounters freeze that clock. */
  startSeconds: number;
  /** Timeline/preview estimate; completion may still depend on defeating threats. */
  durationSeconds: number;
  /** Additional quiet time after completion. Default: 0. */
  delayAfterSeconds: number;
  /** Boss-like encounters default true; normal spawns and pickups default false. */
  blocksWaveClock: boolean;
  /**
   * Optional normalized center point for this event's initial gameplay placement.
   * Omit it to preserve the positionId preset and the original game behavior.
   */
  spawnAnchor?: {
    x: number;
    y: number;
  };
}

/**
 * Optional, non-destructive presentation applied while drawing a configured
 * sprite. These values never change the entity's collision box.
 */
export interface SpriteStyle {
  /** Uniform visual scale. Omit to preserve the renderer default. */
  scale?: number;
  /** Additional clockwise rotation composed with renderer animation. */
  rotationDegrees?: number;
  /** Mirror the artwork horizontally without changing movement or collision. */
  flipX?: boolean;
  opacity?: number;
  hueRotateDegrees?: number;
  saturation?: number;
  brightness?: number;
  /** Six-digit hexadecimal shadow color. */
  glowColor?: string;
  /** Canvas shadow blur in CSS pixels. */
  glowBlur?: number;
}

export interface SpawnEnemySetting {
  enemyId: EnemyId;
  spriteKey: AssetKey;
  spriteStyle?: SpriteStyle;
  /** Relative selection probability within the event; all rows must sum to 1. */
  weight: number;
  health: number;
  /** Canvas units per 60 Hz simulation step. */
  speed: number;
  /** One means one player-life hit, matching current enemy contact/projectiles. */
  damage: number;
  scoreValue: number;
  /** Probability from 0 to 1 after this enemy is defeated. */
  powerupDropChance: number;
}

export interface SpawnEvent extends BaseWaveEvent {
  kind: 'spawn';
  count: number;
  patternId: SpawnPatternId;
  positionId: SpawnPositionId;
  spawnIntervalSeconds: number;
  enemies: SpawnEnemySetting[];
}

export interface BossWeaponSetting {
  id: string;
  weaponId: WeaponId;
  /** Current attack cadence in seconds at 60 Hz. */
  attackIntervalSeconds: number;
  damage: number;
  projectileSpeed: number;
  burstCount: number;
}

export interface BossHealthPhase {
  id: string;
  label: string;
  /** 1 starts at full health; subsequent phases must strictly descend toward 0. */
  triggerHealthRatio: number;
  movementPatternId: MovementPatternId;
  /** Multiplies the boss event's base speed. Default: 1. */
  speedMultiplier: number;
  /** References BossWeaponSetting ids owned by the same BossEvent. */
  weaponSettingIds: string[];
}

export interface BossEvent extends BaseWaveEvent {
  kind: 'boss';
  bossId: BossId;
  spriteKey: AssetKey;
  spriteStyle?: SpriteStyle;
  positionId: SpawnPositionId;
  movementPatternId: MovementPatternId;
  warningSeconds: number;
  health: number;
  speed: number;
  damage: number;
  scoreReward: number;
  powerupDropChance: number;
  /** Number of orbiting shields; current wave 1 default: 0. */
  shieldCount: number;
  weapons: BossWeaponSetting[];
  phases: BossHealthPhase[];
}

export interface AsteroidEvent extends BaseWaveEvent {
  kind: 'asteroid-belt';
  spriteKey: AssetKey;
  spriteStyle?: SpriteStyle;
  count: number;
  /** Preview density from 0 to 1; count remains authoritative in gameplay. */
  density: number;
  patternId: SpawnPatternId;
  positionId: SpawnPositionId;
  spawnIntervalSeconds: number;
  warningSeconds: number;
  health: number;
  speed: number;
  damage: number;
  scoreValue: number;
  powerupDropChance: number;
}

export interface PowerupEvent extends BaseWaveEvent {
  kind: 'powerup';
  positionId: SpawnPositionId;
  spawnIntervalSeconds: number;
  /** References the owning level's availablePowerupIds. */
  powerupIds: PowerupId[];
}

export interface RecoveryEvent extends BaseWaveEvent {
  kind: 'recovery';
  positionId: SpawnPositionId;
  coinCount: number;
  powerupIds: PowerupId[];
}

export type WaveEvent = SpawnEvent | BossEvent | AsteroidEvent | PowerupEvent | RecoveryEvent;

export interface AssetCatalogEntry {
  id: AssetKey;
  label: string;
  /** Resolved from the real ASSETS catalog; arrays represent animation frames. */
  paths: readonly string[];
}

export interface EnemyCatalogEntry {
  id: EnemyId;
  label: string;
  entityType: 'ENEMY_DRONE' | 'ENEMY_SWARM' | 'ENEMY_BRICK' | 'ENEMY_JOURNAL';
  defaultSpriteKey: AssetKey;
  defaultMovementPatternId: MovementPatternId;
  baseHealth: number;
  baseSpeed: number;
  baseDamage: number;
  baseScoreValue: number;
  basePowerupDropChance: number;
}

export interface BossCatalogEntry {
  id: BossId;
  label: string;
  entityType: 'MINI_BOSS' | 'ENEMY_INVADER' | 'BOSS';
  defaultSpriteKey: AssetKey;
  defaultMovementPatternId: MovementPatternId;
  allowedWeaponIds: WeaponId[];
}

export interface PowerupCatalogEntry {
  id: PowerupId;
  label: string;
  runtimeType: 'DOUBLE_SHOT' | 'TRIPLE_SHOT' | 'MAGNET' | 'SHIELD' | 'RESEARCH_BEAM' | 'EXTRA_LIFE';
  /** Current random drop weight; zero means supported but not randomly selected. */
  defaultWeight: number;
}

export interface BackgroundCatalogEntry {
  id: BackgroundId;
  label: string;
  layerAssetKeys: AssetKey[];
  tint: string;
}

export interface MusicCatalogEntry {
  id: MusicId;
  label: string;
  runtimeCue: 'procedural-main';
}

export interface NamedCatalogEntry<Id extends string> {
  id: Id;
  label: string;
}
