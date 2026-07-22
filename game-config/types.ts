/**
 * Stable asset identifiers backed by `ASSETS` in `constants.ts`.
 * Campaign JSON stores only these identifiers; it never accepts file paths.
 */
export type BuiltInAssetKey =
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
  | 'PIXI_SPACE_RUN_HELIX_REDLINE_PROPS'
  | 'PIXI_SPACE_RUN_SHATTERED_VOID_PROPS'
  | 'PIXI_SPACE_RUN_GRAVITY_RIFT_PROPS'
  | 'PIXI_SPACE_RUN_ION_ECLIPSE_PROPS'
  | 'PIXI_SPACE_RUN_TERMINUS_FRONTIER_PROPS'
  | 'PIXI_JET_SCOUT_FRAMES'
  | 'PIXI_JET_INTERCEPTOR_FRAMES'
  | 'PIXI_JET_HEAVY_FRAMES'
  | 'PIXI_BOSS_OPEN_ORBIT_FRAMES'
  | 'PIXI_BOSS_CITATION_FRAMES'
  | 'PIXI_BOSS_PAYWALL_FRAMES'
  | 'PIXI_BOSS_OPEN_GALAXY_FRAMES'
  | 'PIXI_BOSS_CROWNCLAW_FRAMES'
  | 'CAMPAIGN_BOSS_ECLIPSE_ENGINE'
  | 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE'
  | 'CAMPAIGN_BOSS_HELIX_LEVIATHAN'
  | 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE'
  | 'CAMPAIGN_BOSS_PRISM_MOTH'
  | 'CAMPAIGN_BOSS_RAIL_SERPENT'
  | 'CAMPAIGN_BOSS_SINGULARITY_CRAB'
  | 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT'
  | 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'
  | 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER'
  | 'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL'
  | 'CAMPAIGN_ENEMY_DNA_CONDUCTOR'
  | 'CAMPAIGN_ENEMY_LASER_HUNTER'
  | 'CAMPAIGN_ENEMY_LASER_STALKER'
  | 'CAMPAIGN_ENEMY_ORBIT_DISC'
  | 'CAMPAIGN_ENEMY_PRISM_ARTILLERY'
  | 'CAMPAIGN_ENEMY_RING_SENTINEL'
  | 'CAMPAIGN_ENEMY_SHIELD_RAMMER'
  | 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT'
  | 'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT'
  | 'POWERUP_MAX_SHOT_AURA_FRAMES'
  | 'ENEMY_DRONE_FRAMES'
  | 'LEGACY_ENEMY_DRONE_FRAMES'
  | 'ENEMY_SWARM_FRAMES'
  | 'LEGACY_ENEMY_SWARM_FRAMES'
  | 'ENEMY_BRICK_FRAMES'
  | 'ASTEROID_BELT_FRAMES'
  | 'ENEMY_JOURNAL'
  | 'ENEMY_JOURNAL_FRAMES'
  | 'MINI_BOSS'
  | 'WALL_BOSS_SEGMENT'
  | 'PAYWALL_BASTION_FRAMES'
  | 'FINAL_BOSS';

/**
 * Generated asset IDs are stable, content-addressed catalog identifiers. The
 * runtime validator still requires every ID to be present in generated-assets.json.
 */
export type GeneratedAssetKey = `GENERATED_${Uppercase<string>}`;
export type AssetKey = BuiltInAssetKey | GeneratedAssetKey;

/** Roles constrain which game surfaces may consume a generated image. */
export type GeneratedAssetRole =
  | 'enemy'
  | 'boss'
  | 'asteroid'
  | 'hud'
  | 'player'
  | 'background'
  | 'scorecard';

export type EnemyId = 'drone' | 'swarm' | 'brick' | 'journal';
export type BossId = 'bottleneck-drone' | 'paywall-wall' | 'gatekeeper';
export type BossRigId = 'open-orbit' | 'citation-storm' | 'paywall-siege' | 'crown-claw';
export type PowerupId = 'double-shot' | 'triple-shot' | 'max-shot' | 'magnet' | 'shield' | 'research-beam' | 'extra-life';
export type BackgroundId =
  | 'open-orbit'
  | 'citation-storm'
  | 'paywall-siege'
  | 'open-galaxy'
  | 'bastion-protocol'
  | 'helix-redline'
  | 'shattered-void'
  | 'gravity-rift'
  | 'ion-eclipse'
  | 'terminus-frontier';
export type MusicId = 'procedural-main';
export type SpawnPatternId =
  | 'single-random'
  | 'row'
  | 'v'
  | 'sine'
  | 'pincer'
  | 'grid'
  | 'diamond'
  | 'spiral'
  | 'asteroid-lanes';
export type SpawnPositionId = 'random-top' | 'formation-top' | 'center-top' | 'lane-top';
export type MovementPatternId =
  | 'drift-down'
  | 'sine-drift'
  | 'track-player'
  | 'wall-march'
  | 'asteroid-drift'
  | 'gatekeeper-cycle'
  | 'arena-roam';
export type WeaponId = 'aimed-shot' | 'wall-bolt' | 'burst-volley' | 'lane-beam';
export type ScorecardMetricId = 'wave' | 'targets' | 'coins' | 'flight';
export type EnemyRank = 'standard' | 'elite';
export type EnemyAttackPatternId = 'aimed-burst';

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
  /** Shared HUD art selected by the Director and rendered by the real game. */
  hudAssets: HudAssetsConfig;
  /** Ordered player-facing stages. At least one stage is required. */
  levels: LevelDefinition[];
}

/** Compatibility-friendly short name for engine/editor consumers. */
export type GameCampaign = GameCampaignConfig;

export interface HudAssetsConfig {
  bombIconAssetKey: AssetKey;
}

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
  /** A player-facing Stage; `level` remains the compatibility/config key. */
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
  /** True repeats this stage's internal waves before advancing the campaign. */
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
  /** A tactical wave inside its owning player-facing Stage. */
  id: string;
  name: string;
  order: number;
  accent: string;
  backgroundId: BackgroundId;
  /**
   * Boss milestones finish when their Gatekeeper is defeated. Interstitial
   * combat waves finish only after their authored clock expires and every
   * scheduled threat has been cleared.
   */
  completionRule: 'boss-defeat' | 'clear-after-duration';
  /**
   * Optional runtime multiplier after explicit tuning. Apply to hostile health/speed/damage
   * and inversely to spawn intervals, but not score rewards. Current default: 1.
   */
  difficultyMultiplier: number;
  /** Active-combat clock. Current default: 60 seconds (3600 frames). */
  durationSeconds: number;
  /** Launch cinematic before the active clock; normally used only at a stage boundary. */
  introSeconds: number;
  /** Collectible-loot window after the stage-final encounter; Gatekeepers use 5 seconds. */
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
  /** Elites remain part of regular waves but receive an overhead health meter and their own fire cadence. */
  rank?: EnemyRank;
  /** Presentation and collision scale for this configured enemy. Default: 1. */
  sizeMultiplier?: number;
  attackPatternId?: EnemyAttackPatternId;
  attackIntervalSeconds?: number;
  projectileSpeed?: number;
  burstCount?: number;
}

/**
 * A normalized center point in the upper combat area. Array order is the
 * deterministic spawn and dive order used by the formation runtime.
 */
export interface FormationSlot {
  x: number;
  y: number;
}

export interface SpawnEvent extends BaseWaveEvent {
  kind: 'spawn';
  count: number;
  patternId: SpawnPatternId;
  positionId: SpawnPositionId;
  spawnIntervalSeconds: number;
  /**
   * Optional hand-authored formation geometry. When omitted, patternId keeps
   * using its built-in layout. When present, count must equal slot count while
   * patternId continues to control entry, hold, dive, and return choreography.
   */
  formationSlots?: FormationSlot[];
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
  /** Optional layered renderer rig. Currently consumed by gatekeeper encounters. */
  rigId?: BossRigId;
  /** Number of matching bosses spawned together, or rows for a configured paywall formation. */
  count?: number;
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
  /** Uniform encounter scale. Default: 1. */
  sizeMultiplier?: number;
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
  /** Surfaces on which this artwork may be selected. */
  roles: readonly GeneratedAssetRole[];
  /** Present only for content-addressed images created by the local Director. */
  generated?: {
    sha256: string;
    width: number;
    height: number;
    createdAt: string;
  };
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
  runtimeType: 'DOUBLE_SHOT' | 'TRIPLE_SHOT' | 'MAX_SHOT' | 'MAGNET' | 'SHIELD' | 'RESEARCH_BEAM' | 'EXTRA_LIFE';
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
