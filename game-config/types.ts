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
  | 'CAMPAIGN_BOSS_FRONTIER_CROWNCLAW'
  | 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE'
  | 'CAMPAIGN_BOSS_HELIOS_CLAWCARRIER'
  | 'CAMPAIGN_BOSS_HELIX_LEVIATHAN'
  | 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE'
  | 'CAMPAIGN_BOSS_NULLWAKE_REVENANT'
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
  | 'CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES'
  | 'CAMPAIGN_ENEMY_PRISM_ARTILLERY'
  | 'CAMPAIGN_ENEMY_RING_SENTINEL'
  | 'CAMPAIGN_ENEMY_SHIELD_RAMMER'
  | 'CAMPAIGN_ENEMY_WALL_SNIPER_LEFT'
  | 'CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT'
  | 'SCICON_ENEMY_ORBIT_SCOUT_FRAMES'
  | 'SCICON_ENEMY_CITATION_DART_FRAMES'
  | 'SCICON_ENEMY_RESEARCH_SENTRY_FRAMES'
  | 'SCICON_ENEMY_PEER_BULWARK_FRAMES'
  | 'SCICON_ENEMY_JOURNAL_RAIDER_FRAMES'
  | 'SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES'
  | 'SCICON_ENEMY_PRISM_ARTILLERY_FRAMES'
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
  | 'supply-drop'
  | 'hud'
  | 'player'
  | 'background'
  | 'scorecard';

export type EnemyId = 'drone' | 'swarm' | 'brick' | 'journal';
export type BossId =
  | 'bottleneck-drone'
  | 'paywall-wall'
  | 'fracture-engine-elite'
  | 'aegis-brood-core'
  | 'railspine-wallcrawler'
  | 'maw-carrier'
  | 'twin-meridian-sentinels'
  | 'prism-bloom'
  | 'aegis-convoy-captain'
  | 'gridline-sentries'
  | 'gatekeeper'
  | 'gatekeeper-prime'
  | 'paywall-decimator'
  | 'helios-clawcarrier'
  | 'helix-leviathan'
  | 'eclipse-engine'
  | 'research-tribunal'
  | 'prism-moth'
  | 'rail-serpent'
  | 'singularity-crab'
  | 'orbit-gyroscope'
  | 'hammerhead-siege'
  | 'frontier-crownclaw'
  | 'nullwake-revenant';

export type CampaignMiniBossId = Extract<
  BossId,
  | 'bottleneck-drone'
  | 'paywall-wall'
  | 'fracture-engine-elite'
  | 'aegis-brood-core'
  | 'railspine-wallcrawler'
  | 'maw-carrier'
  | 'twin-meridian-sentinels'
  | 'prism-bloom'
  | 'aegis-convoy-captain'
  | 'gridline-sentries'
>;
export type BossRigId = 'open-orbit' | 'citation-storm' | 'paywall-siege' | 'crown-claw';
export type PowerupId = 'projectile-upgrade' | 'max-shot' | 'magnet' | 'shield' | 'research-beam' | 'extra-life';
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
  | 'staggered-row'
  | 'v'
  | 'double-v'
  | 'sine'
  | 'pincer'
  | 'grid'
  | 'diamond'
  | 'crescent'
  | 'arc'
  | 'ring'
  | 'pods'
  | 'wheel'
  | 'snake'
  | 'escort'
  | 'shield-wall'
  | 'lanes'
  | 'spiral'
  | 'asteroid-lanes';
export type SpawnPositionId =
  | 'random-top'
  | 'random-top-fast'
  | 'formation-top'
  | 'center-top'
  | 'lane-top';
export type MovementPatternId =
  | 'drift-down'
  | 'sine-drift'
  | 'track-player'
  | 'wall-march'
  | 'asteroid-drift'
  | 'gatekeeper-cycle'
  | 'arena-roam';
export type MovementPathId = 'sweep-bank-reentry';
export type WeaponId = 'aimed-shot' | 'wall-bolt' | 'burst-volley' | 'lane-beam';
export type ScorecardMetricId = 'wave' | 'targets' | 'coins' | 'flight';
export type EnemyRank = 'standard' | 'elite';
export type EnemyAttackPatternId = 'aimed-burst';

export type FormationEntryPathId =
  | 'sweep-bank-reentry'
  | 'formation-drop'
  | 'spiral-entry'
  | 'paired-flank'
  | 'diamond-lock'
  | 'double-helix'
  | 'side-wall-entry'
  | 'lane-stagger'
  | 'ring-assemble'
  | 'armored-grid'
  | 'mirrored-swoop'
  | 'pod-converge'
  | 'loop-the-loop'
  | 'serpentine-weave'
  | 'convoy-column';

export type FormationMovementId =
  | 'gentle-drift'
  | 'lateral-sweep'
  | 'expand-collapse'
  | 'rotating-wheel'
  | 'snake-weave'
  | 'split-pods'
  | 'lane-shift';

export type FormationAttackBehaviorId =
  | 'single-dive'
  | 'paired-dive'
  | 'alternating-wings'
  | 'leader-escorts'
  | 'row-sequence'
  | 'diagonal-groups'
  | 'sweep-strafe'
  | 'pincer-pass'
  | 'ring-collapse'
  | 'aimed-volley'
  | 'spread-volley'
  | 'lane-pass'
  | 'split-hunt';

export type FormationReturnBehaviorId = 'reform' | 'transform' | 'retreat' | 'exit';
export type FormationFiringBehaviorId = 'none' | 'post-formation' | 'staggered' | 'priority';

/**
 * Optional per-encounter choreography overrides. The reusable formation pack
 * remains the default; an authored Wave can remix one part without cloning
 * the shape, enemy composition, or the rest of the behavior definition.
 */
export interface FormationBehaviorOverride {
  entryPathId?: FormationEntryPathId;
  movementId?: FormationMovementId;
  attackId?: FormationAttackBehaviorId;
  firingBehavior?: FormationFiringBehaviorId;
  returnId?: FormationReturnBehaviorId;
  holdSeconds?: number;
  telegraphSeconds?: number;
  attackDurationSeconds?: number;
  recoverySeconds?: number;
  attackGroupSize?: number;
  attackCycles?: number;
}

export type CampaignMissionRole =
  | 'introduction'
  | 'formation-remix'
  | 'elite-checkpoint'
  | 'boss-preparation'
  | 'major-boss';

export type CampaignWaveRhythm =
  | 'warm-up'
  | 'introduce'
  | 'variation'
  | 'support'
  | 'recovery'
  | 'peak'
  | 'clear'
  | 'boss';

export type EnemyDurabilityClass = 'light' | 'standard' | 'armored' | 'elite';

export type EnemyGameplayRole =
  | 'formation-unit'
  | 'diver'
  | 'flanker'
  | 'shooter'
  | 'burst-shooter'
  | 'suppressor'
  | 'armored-unit'
  | 'support-unit'
  | 'priority-target'
  | 'formation-leader'
  | 'elite';

export type SupportRecommendationTag =
  | 'anti-swarm'
  | 'anti-armor'
  | 'lane-control'
  | 'boss-damage'
  | 'survival'
  | 'anti-summon';

export type CampaignRouteEdgeKind =
  | 'progression'
  | 'route-choice'
  | 'rejoin'
  | 'optional'
  | 'crossing';

export type CampaignRouteRisk = 'low' | 'moderate' | 'high';

export type CampaignRewardProfileId =
  | 'standard'
  | 'combat-premium'
  | 'support-safe'
  | 'boss'
  | 'mastery'
  | 'one-time';

/**
 * One explicit traversal option in the persistent Campaign graph. Edges are
 * authoritative for progression; array order and display order are never used
 * to infer the next Mission.
 */
export interface CampaignRouteEdgeDefinition {
  edgeId: string;
  toNodeId: string;
  routeId: string;
  label: string;
  kind: CampaignRouteEdgeKind;
  risk: CampaignRouteRisk;
  /** Weekly score tuning only. Campaign coin settlement remains separate. */
  weeklyScoreMultiplier: number;
}

export interface CampaignRouteSummaryDefinition {
  combatIntensity: CampaignRouteRisk;
  miniBossPresence: 'none' | 'optional' | 'required';
  rewardType: string;
  recommendedSupportTags: SupportRecommendationTag[];
  estimatedWaveCount: number;
}

/**
 * A selectable Campaign Mission node. `missionDefinitionId` references the
 * real LevelDefinition consumed by GameEngine. Sibling nodes may share a depth
 * but must always have different stable node IDs and explicit outgoing edges.
 */
export interface CampaignGraphNodeDefinition {
  nodeId: string;
  sectorId: string;
  /** Global main-progression depth. Route siblings intentionally share it. */
  depth: number;
  routeId: string;
  displayLabel: string;
  missionDefinitionId: string;
  prerequisiteNodeIds: string[];
  prerequisiteMode: 'any' | 'all';
  outgoingEdges: CampaignRouteEdgeDefinition[];
  rejoinNodeId: string | null;
  optional: boolean;
  mainPath: boolean;
  masteryBranch: boolean;
  oneTime: boolean;
  bossId: BossId | null;
  miniBossIds: BossId[];
  weeklyStreakEligible: boolean;
  weeklyScoreMultiplier: number;
  recommendedPower: {
    minimum: number;
    expected: number;
    comfortable: number;
  };
  rewardProfile: CampaignRewardProfileId;
  mapPosition: CampaignMapPositionDefinition;
  routeControlPoints: CampaignMapPositionDefinition[];
  routeSummary: CampaignRouteSummaryDefinition;
}

export interface CampaignGraphDefinition {
  entryNodeId: string;
  nodes: CampaignGraphNodeDefinition[];
}

export interface CampaignSectorDefinition {
  id: string;
  order: number;
  name: string;
  themeId: string;
  missionIds: [string, string, string, string, string];
  /** Stable graph nodes for the five required progression depths. */
  mainNodeIds?: [string, string, string, string, string];
  /** Same-depth route alternatives and other ordinary route nodes. */
  routeNodeIds?: string[];
  majorBossId: BossId;
  branchIds: string[];
}

export interface CampaignVisualThemeDefinition {
  id: string;
  label: string;
  backgroundId: BackgroundId;
  accent: string;
  description: string;
}

export interface EnemyRoleDefinition {
  id: string;
  label: string;
  enemyId: EnemyId;
  spriteKey: AssetKey;
  role: EnemyGameplayRole;
  threatCost: number;
  introductionSector: number;
  introductionMission: number;
  durabilityClass: EnemyDurabilityClass;
  fireBehavior: 'none' | 'post-formation' | 'aimed-burst' | 'formation-command' | 'elite-only';
  /** Quiet window after spawn before this role may fire. Never-fire roles use zero. */
  fireDelaySeconds: number;
  entryBehavior: 'formation' | 'dive' | 'flank' | 'lane';
  /**
   * What this hull does once it is on the field. `entryBehavior` says where it
   * comes from; this says whether it ever leaves the block, whether it commits
   * or loops back, and how it moves while holding.
   */
  characteristic: 'holder' | 'diver' | 'kamikaze' | 'flanker' | 'artillery' | 'commander';
  compatibleFormationPackIds: string[];
  synergyTags: string[];
  reuseCooldownWaves: number;
  maximumSimultaneousCount: number;
  performanceCost: number;
}

export interface FormationPackDefinition {
  id: string;
  label: string;
  enemyRoleIds: string[];
  enemyCount: number;
  totalThreatCost: number;
  entryDirection: 'top' | 'left' | 'right' | 'split';
  entryPath: FormationEntryPathId;
  formationShape: SpawnPatternId;
  movementBehavior: FormationMovementId;
  attackBehavior: FormationAttackBehaviorId;
  firingBehavior: FormationFiringBehaviorId;
  returnBehavior: FormationReturnBehaviorId;
  /** Quiet assembled hold before the first attack warning. */
  holdSeconds: number;
  /** Readable preparation window before the selected subgroup attacks. */
  telegraphSeconds: number;
  /** Duration for in-formation volleys; dive attacks end when the subgroup reforms. */
  attackDurationSeconds: number;
  /** Quiet time after every attack group reforms. */
  attackRecoverySeconds: number;
  /** Maximum members selected for one authored attack cycle. */
  attackGroupSize: number;
  /** Zero repeats until defeated; positive values end with the authored return behavior. */
  attackCycles: number;
  synergyAdjustment: number;
  minimumSector: number;
  maximumSimultaneousInstances: number;
  recoveryRequiredSeconds: number;
  compatibleMissionRoles: CampaignMissionRole[];
  compatibleSectorIds: string[];
  mobilePerformanceCost: number;
}

export interface MiniBossCatalogDefinition {
  id: string;
  bossId: CampaignMiniBossId;
  label: string;
  visualIdentity: string;
  combatRole: string;
  mainAttacks: string[];
  suitableSectorIds: string[];
  threatCost: number;
  recommendedPower: number;
  usage: 'solo' | 'paired' | 'solo-or-paired';
  campaignReady: boolean;
  validationStatus: 'validated' | 'provisional';
}

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
  /** Ordered player-facing Missions. `levels` remains the compatibility/config key; at least one Mission is required. */
  levels: LevelDefinition[];
  /** Four five-Mission route groups. Additional sectors use the same data shape. */
  sectors: CampaignSectorDefinition[];
  /** Shared visual themes referenced by sectors. */
  visualThemes: CampaignVisualThemeDefinition[];
  /** Canonical role variants consumed by authored spawn packs. */
  enemyRoles: EnemyRoleDefinition[];
  /** Reusable deterministic encounter packs and their bounded costs. */
  formationPacks: FormationPackDefinition[];
  /** Campaign-approved mini-boss inventory. */
  miniBosses: MiniBossCatalogDefinition[];
  /** Optional mastery routes. Omission preserves the original linear Campaign. */
  campaignBranches?: CampaignBranchDefinition[];
  /** Explicit directed route graph. Omission is supported only for legacy packages and tests. */
  campaignGraph?: CampaignGraphDefinition;
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

export type CampaignMasteryObjectiveKind =
  | 'complete'
  | 'damage-at-most'
  | 'coins-at-least'
  | 'score-at-least'
  | 'time-at-most';

/** A single, persistent one-time mastery star authored for one Mission. */
export interface CampaignMasteryObjectiveDefinition {
  /** Stable, Mission-scoped receipt ID such as `stage-open-galaxy:complete`. */
  id: string;
  label: string;
  kind: CampaignMasteryObjectiveKind;
  target: number;
  rewardCoins: number;
}

/** Coin values shared by runtime settlement and Campaign Map presentation. */
export interface CampaignMissionRewardDefinition {
  waveClearCoins: number;
  missionClearCoins: number;
  firstClearCoins: number;
  bossFirstClearCoins: number;
  replayMultiplier: number;
}

/** Normalized portrait-map coordinates; generated zigzag positions remain the compatibility fallback. */
export interface CampaignMapPositionDefinition {
  x: number;
  y: number;
}

export type CampaignBranchMissionType =
  | 'present-drop'
  | 'elite-remix'
  | 'mini-boss-signal'
  | 'formation-challenge'
  | 'support-trial'
  | 'mastery-mission'
  | 'hidden-research-signal'
  | 'research-cache';

export type CampaignBranchNodeIconId =
  | 'present-drop-cache'
  | 'encrypted-branch'
  | 'elite-warning'
  | 'mini-boss-signal'
  | 'formation-challenge'
  | 'support-trial'
  | 'mastery-prism'
  | 'research-signal';

export type CampaignBranchUnlockCondition =
  | { kind: 'all-stars-earned'; missionId: string }
  | { kind: 'sector-mastered'; missionIds: string[] }
  | { kind: 'branch-completed'; branchId: string }
  | { kind: 'boss-defeated'; bossEventId: string }
  | { kind: 'achievement-earned'; achievementId: string }
  | { kind: 'hidden-object-discovered'; discoveryId: string }
  | { kind: 'support-challenge-completed'; challengeId: string };

export interface CampaignBranchRewardPreview {
  category: 'upgrade-coins' | 'coins-and-trophy' | 'cosmetic' | 'support-preview';
  label: string;
  minimumCoins: number;
  maximumCoins: number;
  hiddenUntilUnlocked: boolean;
}

export interface CampaignBranchCompletionReward {
  /** Granted only after a successful authoritative completion. */
  baseCoins: number;
  /** One-time mastery bonus granted with the first successful completion. */
  oneTimeBonusCoins: number;
  /** Maximum provisional value obtainable from mission targets. */
  maximumPerformanceCoins: number;
  totalMinimumCoins: number;
  totalMaximumCoins: number;
}

export type PresentDropPresentKind = 'standard' | 'armored' | 'fast' | 'golden';
export type PresentDropPatternId =
  | 'lane-rain'
  | 'staggered-columns'
  | 'sine-sweep'
  | 'final-center';

export interface PresentDropPresentDefinition {
  id: string;
  displayName: string;
  kind: PresentDropPresentKind;
  /** Safe catalog ID; campaign JSON never stores a raw asset path. */
  spriteKey: AssetKey;
  health: number;
  coinValue: number;
  speedMultiplier: number;
  sizeMultiplier: number;
}

export interface PresentDropSpawnGroupDefinition {
  id: string;
  startSeconds: number;
  count: number;
  presentTypeId: string;
  patternId: PresentDropPatternId;
  spawnIntervalSeconds: number;
}

export interface CampaignPresentDropMissionDefinition {
  id: string;
  kind: 'present-drop';
  backgroundId: BackgroundId;
  musicId: MusicId;
  introSeconds: number;
  durationSeconds: number;
  exitSeconds: number;
  successCondition: 'complete-timed-drop';
  presentTypes: PresentDropPresentDefinition[];
  spawnGroups: PresentDropSpawnGroupDefinition[];
}

/**
 * A combat-focused optional route that is compiled onto the canonical
 * GameEngine wave/event vocabulary. Branch content remains declarative: it
 * cannot embed scripts, raw asset paths, bosses, or a second gameplay loop.
 */
export type CampaignCombatBranchMissionKind =
  | 'elite-remix'
  | 'formation-challenge'
  | 'support-trial';

export interface CampaignCombatBranchMissionDefinition {
  id: string;
  kind: CampaignCombatBranchMissionKind;
  backgroundId: BackgroundId;
  musicId: MusicId;
  introSeconds: number;
  durationSeconds: number;
  exitSeconds: number;
  successCondition: 'clear-authored-encounters';
  /** Maximum simultaneous hostile entities before adaptive device caps. */
  threatCap: number;
  /** Ceiling for the sum of weighted authored enemy-role threat. */
  combatBudget: number;
  rhythm: CampaignWaveRhythm;
  /** Power-ups referenced by powerup/recovery events in this branch. */
  availablePowerupIds: PowerupId[];
  /** Existing safe GameEngine events; major and mini-boss events are forbidden. */
  events: WaveEvent[];
}

export type CampaignBranchMissionDefinition =
  | CampaignPresentDropMissionDefinition
  | CampaignCombatBranchMissionDefinition;

/**
 * Optional Campaign-map node. Route points include the source and destination
 * endpoints so any map renderer can draw the authored path without guessing.
 */
export interface CampaignBranchDefinition {
  branchId: string;
  sourceMissionId: string;
  unlockCondition: CampaignBranchUnlockCondition;
  /** Standard mastery routes use 3; chained or discovery routes may use 0. */
  requiredStars: number;
  missionType: CampaignBranchMissionType;
  displayName: string;
  hiddenName: string;
  mapPosition: CampaignMapPositionDefinition;
  routeControlPoints: CampaignMapPositionDefinition[];
  icon: CampaignBranchNodeIconId;
  lockedIcon: CampaignBranchNodeIconId;
  rewardPreview: CampaignBranchRewardPreview;
  oneTimeCompletion: boolean;
  replayPolicy: 'no-replay-after-claim' | 'repeatable-no-reward' | 'repeatable-rewarded';
  failurePolicy: 'retry-no-reward';
  rewardCommitPolicy: 'authoritative-idempotent-on-success';
  missionDefinitionId: string;
  missionDefinition: CampaignBranchMissionDefinition;
  completionReward: CampaignBranchCompletionReward;
  returnNodeId: string;
  nextBranchNodeId?: string | null;
  discoveryState: 'encrypted' | 'revealed';
}

/**
 * Optional authored Campaign-map and reward metadata. Older campaign packages
 * may omit this block and retain the deterministic compatibility defaults.
 */
export interface CampaignMissionProgressionDefinition {
  reward: CampaignMissionRewardDefinition;
  /** Exactly three independently evaluated, persistent mastery stars. */
  masteryObjectives: [
    CampaignMasteryObjectiveDefinition,
    CampaignMasteryObjectiveDefinition,
    CampaignMasteryObjectiveDefinition
  ];
  /** Separate one-time reward granted when the final missing star is earned. */
  masterySetBonusCoins: number;
  /** Data-driven route identity used by the Map and Campaign Lab. */
  sectorId: string;
  missionRole: CampaignMissionRole;
  combatBudget: number;
  recommendedPower: {
    minimum: number;
    expected: number;
    comfortable: number;
  };
  testedLoadouts: {
    lowPower: string;
    expectedPower: string;
    upgraded: string;
  };
  recommendedSupportTags: SupportRecommendationTag[];
  mapPosition?: CampaignMapPositionDefinition;
  /** Null marks the authored end of the route; omission follows Mission order. */
  nextMissionId?: string | null;
}

export interface LevelDefinition {
  /** A player-facing Mission. `LevelDefinition`, `levels`, and historical `stage-*` IDs remain compatibility identifiers. */
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
  /** True repeats this Mission's internal waves before advancing the campaign. */
  loopWaves: boolean;
  availablePowerupIds: PowerupId[];
  scorecard: LevelScorecardSettings;
  /** Optional authored Campaign rewards, mastery objectives, and map route metadata. */
  campaignProgression?: CampaignMissionProgressionDefinition;
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
  /** A tactical wave inside its owning player-facing Mission. */
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
  /** Minimum active-combat clock; clear waves also wait for authored schedules and live threats. */
  durationSeconds: number;
  /** Launch cinematic before the active clock; normally used only at a Mission boundary. */
  introSeconds: number;
  /** Collectible-loot window after the Mission-final encounter; Gatekeepers use 5 seconds. */
  delayAfterSeconds: number;
  /** Current score formula is 2^(wave order - 1). */
  scoreMultiplier: number;
  /** Maximum simultaneous hostile entities before adaptive device caps. */
  threatCap: number;
  /** Authored encounter-budget ceiling for this internal wave. */
  combatBudget: number;
  /** Teaching/rhythm role displayed by founder tools, not normal HUD. */
  rhythm: CampaignWaveRhythm;
  /** Reusable deterministic packs represented by this wave. */
  formationPackIds: string[];
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
  /** Canonical role-variant ID from the campaign's enemyRoles manifest. */
  roleId?: string;
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
  formationBehavior?: FormationBehaviorOverride;
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

export interface BossRevivalConfig {
  /** References the first phase of the awakened health bar. */
  phaseId: string;
  /** Time spent visibly powerless at zero health. */
  shutdownSeconds: number;
  /** Time spent restoring health and growing into the awakened form. */
  rebootSeconds: number;
  /** Fraction of max health restored when the awakened form becomes active. */
  restoreHealthRatio: number;
  /** Uniform simulation and presentation scale applied to the awakened form. */
  awakenedSizeMultiplier: number;
}

export type BossTimelineTrackKind =
  | 'movement'
  | 'attack'
  | 'laser'
  | 'summon'
  | 'defense'
  | 'presentation';

export type BossTimelineTrigger = 'time' | 'phase-enter' | 'death';

export type BossTimelinePrimitiveId =
  | 'telegraph'
  | 'aimed-burst'
  | 'gap-ring'
  | 'rotor-hazard-sentence'
  | 'radial-beam-array'
  | 'corner-ambush-beam'
  | 'corner-ambush-ram'
  | 'paired-cannon-burst'
  | 'articulated-melee-sweep'
  | 'reactor-aperture-pattern'
  | 'tracking-pincer-dive'
  | 'prism-wingbeat-weave'
  | 'prism-brood-procession'
  | 'prism-lunar-swoop'
  | 'prism-kaleidoscope-brood'
  | 'chainclaw-harpoon'
  | 'crown-reactor-beam'
  | 'bastion-crabwalk-barrage'
  | 'cross-beam'
  | 'rail-sweep'
  | 'tail-fan'
  | 'inward-collapse'
  | 'rotating-cross'
  | 'helix-volley'
  | 'side-barrage'
  | 'pod-volley'
  | 'weave-wall'
  | 'summon-formation'
  | 'set-shield'
  | 'set-weak-point'
  | 'set-movement'
  | 'follow-path'
  | 'effect-cue'
  | 'camera-cue';

export type BossTimelineTelegraphStyle = 'warning' | 'lane' | 'target' | 'ring' | 'spokes';

/**
 * A small, allowlisted presentation vocabulary. Mechanics opt into a motion
 * explicitly so renderers never have to infer limb poses from primitive names.
 */
export type BossTimelineMotionCue =
  | 'rotor-volley'
  | 'radial-beam'
  | 'heavy-cannon'
  | 'gatling-barrage'
  | 'paired-crossfire'
  | 'machinegun-channel'
  | 'claw-sweep'
  | 'reactor-pattern'
  | 'reactor-fan'
  | 'reactor-mines'
  | 'pincer-dive'
  | 'prism-wingbeat-weave'
  | 'prism-brood-procession'
  | 'prism-lunar-swoop'
  | 'prism-kaleidoscope-brood'
  | 'prism-wingbeat'
  | 'prism-brood-deploy'
  | 'prism-swoop'
  | 'prism-kaleidoscope'
  | 'prism-metamorphosis'
  | 'frontier-chainclaw-harpoon'
  | 'frontier-crown-cross-link'
  | 'frontier-reactor-charge'
  | 'frontier-reactor-fire'
  | 'frontier-bastion-crabwalk'
  | 'frontier-critical-cross-link'
  | 'frontier-stagger'
  | 'frontier-death';

/**
 * Explicit rotation policy for authored radial beam arrays. Seeded random
 * choices are resolved by the deterministic gameplay runtime so a replay's
 * warning, boss pose, and damaging beams always agree.
 */
export type BossTimelineRotationDirection =
  | 'clockwise'
  | 'counterclockwise'
  | 'seeded-random';

/**
 * High-level attack vocabulary used by the Boss Factory. Timeline clips stay
 * the executable primitives; an attack sentence explains how several clips
 * form one learnable player-facing movement puzzle.
 */
export type BossAttackSentenceRole = 'core' | 'signature';

export type BossAttackSkillTest =
  | 'rhythm-dodge'
  | 'lane-routing'
  | 'gap-tracking'
  | 'route-combination';

export type BossAttackSafeRouteRule =
  | 'opposite-side-dodge'
  | 'shifting-channel'
  | 'rotating-gap'
  | 'channel-to-quadrant';

export type BossAttackSocketRole = 'port' | 'starboard' | 'core';

/**
 * One bounded, declarative action on a boss timeline. The runtime accepts only
 * the primitive IDs above; arbitrary code and untyped parameter bags are never
 * part of campaign content.
 */
export interface BossTimelineClip {
  id: string;
  label: string;
  track: BossTimelineTrackKind;
  primitiveId: BossTimelinePrimitiveId;
  trigger: BossTimelineTrigger;
  /** Used by time-based clips on the active phase clock. */
  startSeconds: number;
  /** Presentation window and editor width; damaging actions still fire once. */
  durationSeconds: number;
  /** Omit to run in every phase; otherwise references a phase on this boss. */
  phaseId?: string;
  /** Required for damaging attack, laser, and summon primitives. */
  telegraphClipId?: string;
  /** Bounded repetition inside one loop. Default: one execution. */
  repeat?: {
    count: number;
    intervalSeconds: number;
  };
  /** Safe primitive parameters. Unsupported fields are rejected by validation. */
  parameters?: {
    sequence?: number;
    projectileCount?: number;
    /** Cadence for sustained rotor hazards. Bounded to 0.5-2 seconds. */
    pulseIntervalSeconds?: number;
    /** Simulation-frame cadence for tightly synchronized projectile streams. */
    shotIntervalFrames?: number;
    /** Bounded multiplier applied to the primitive's registered projectile speed. */
    projectileSpeedScale?: number;
    /** Safe opening between a paired stream's inner projectile boundaries. */
    channelWidthPixels?: number;
    /** Horizontal sweep extent as a fraction of the playable viewport width. */
    sweepRangeRatio?: number;
    /** Number of predictable horizontal passes made during one firing window. */
    sweepPasses?: number;
    warningSeconds?: number;
    shieldCount?: number;
    summonCount?: number;
    enemyId?: EnemyId;
    formationPatternId?: SpawnPatternId;
    movementPatternId?: MovementPatternId;
    movementPathId?: MovementPathId;
    speedMultiplier?: number;
    componentId?: 'left-cannon' | 'right-cannon' | 'helmet';
    enabled?: boolean;
    side?: 'port' | 'starboard';
    handedness?: 'left' | 'right';
    telegraphStyle?: BossTimelineTelegraphStyle;
    motionCue?: BossTimelineMotionCue;
    rotationDirection?: BossTimelineRotationDirection;
    color?: string;
    strength?: number;
  };
}

/**
 * One complete boss attack composed from ordered damaging timeline clips.
 * Descriptive fields are bounded authoring metadata, never executable text.
 */
export interface BossAttackSentenceVariant {
  phaseId: string;
  /** Ordered damaging clip references for this phase's learned-rule remix. */
  beatClipIds: string[];
  /** Final presentation clip that visibly settles or staggers the boss. */
  recoveryClipId: string;
}

export interface BossAttackSentence {
  id: string;
  label: string;
  role: BossAttackSentenceRole;
  skillTest: BossAttackSkillTest;
  recognitionCue: string;
  solution: string;
  safeRouteRule: BossAttackSafeRouteRule;
  sourceSocketRoles: BossAttackSocketRole[];
  /** Exactly one variation per boss phase; later phases remix the same learned rule. */
  variants: BossAttackSentenceVariant[];
}

export interface BossTimelineConfig {
  /** Timeline duration for the active phase. */
  durationSeconds: number;
  /** When true, time-based clips repeat after durationSeconds. */
  loop: boolean;
  clips: BossTimelineClip[];
  /**
   * Optional Boss Factory contract. When present it contains exactly three
   * core attack identities and one signature identity across every boss phase.
   */
  attacks?: BossAttackSentence[];
}

export type BossComponentId = 'left-cannon' | 'right-cannon' | 'helmet';

export type BossComponentHealth = Partial<Record<BossComponentId, number>>;

export interface BossEvent extends BaseWaveEvent {
  kind: 'boss';
  bossId: BossId;
  /** Optional layered renderer rig. Currently consumed by gatekeeper encounters. */
  rigId?: BossRigId;
  /**
   * Existing bosses default to their legacy rig components. Authored bosses
   * may deliberately use one ordinary hull hit region without inventing
   * cannons, armor plates, or weak points that are not part of their design.
   */
  componentMode?: 'legacy-rig' | 'hull-only';
  /** Optional authored starting durability for individual rig components. */
  componentHealth?: BossComponentHealth;
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
  /** Optional one-use, deterministic transition into a later authored phase. */
  revival?: BossRevivalConfig;
  /**
   * Optional visual-authoring timeline. Existing bosses omit it and retain
   * their compatibility behavior until they are deliberately migrated.
   */
  timeline?: BossTimelineConfig;
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

/** A non-hostile, destructible package in the timed Present Drop branch. */
export interface SupplyDropEvent extends BaseWaveEvent {
  kind: 'supply-drop';
  spriteKey: AssetKey;
  spriteStyle?: SpriteStyle;
  presentKind: PresentDropPresentKind;
  positionId: SpawnPositionId;
  health: number;
  speed: number;
  scoreValue: number;
  coinDropValue: number;
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

export type WaveEvent = SpawnEvent | BossEvent | AsteroidEvent | SupplyDropEvent | PowerupEvent | RecoveryEvent;

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
  runtimeType: 'OVERDRIVE' | 'MAX_SHOT' | 'MAGNET' | 'SHIELD' | 'RESEARCH_BEAM' | 'EXTRA_LIFE';
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
