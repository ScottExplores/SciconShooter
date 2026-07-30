

import { EntityType, GamePolishSettings, PowerupType, Stats } from '../types';
import { ASSETS, GAME_CONFIG, COLORS } from '../constants';
import type {
  AssetKey,
  AsteroidEvent,
  BossComponentHealth,
  BossEvent,
  BossHealthPhase,
  BossRevivalConfig,
  BossRigId,
  BossTimelineConfig,
  BossTimelineMotionCue,
  BossWeaponSetting,
  CampaignGraphNodeDefinition,
  EnemyDurabilityClass,
  EnemyGameplayRole,
  EnemyRoleDefinition,
  EnemyAttackPatternId,
  EnemyRank,
  FormationPackDefinition,
  GameCampaign,
  LevelDefinition,
  MovementPathId,
  PresentDropPresentKind,
  PowerupEvent,
  RecoveryEvent,
  SpriteStyle,
  SpawnEvent,
  SupplyDropEvent,
  WaveEvent,
  WaveDefinition
} from '../game-config/types';
import { isMajorBossId } from '../game-config/catalog';
import {
  DEFAULT_GAME_CAMPAIGN,
  cloneGameCampaign,
  getAssetPaths,
  getEnemy,
  getPowerup,
  getPrimaryAssetPath
} from './levelConfig';
import { audioService } from './audioService';
import { BASE_FLASK_CHARGE_MAX, FLASK_CHARGE_PER_COIN, getChargeForStoredFlasks, getFlaskProgress } from './flaskProgress';
import {
  PLAYER_WEAPON_FRAME_URLS,
  getPlayerWeaponFrames,
  getPlayerWeaponLaunchFrameIndex
} from './playerWeaponVisuals';
import {
  BIO_GENOME_LANCE_FRAME_URLS,
  BTC_HASH_BURST_FRAME_URLS,
  BTC_HASH_BURST_RADIUS,
  ETH_PRISM_VOLLEY_FRAME_URLS,
  RESEARCH_CHARGE_BLAST_RADIUS,
  RESEARCH_CHARGE_FRAME_URLS,
  RESEARCH_IMPACT_FRAME_URLS,
  SHIP_ABILITY_FRAME_URLS,
  getShipAbilityDefinition,
  type ShipAbilityKind
} from './shipAbilityService';
import type { PlayerShipId } from './playerShipService';
import { sampleTripleShotSideAngleRadians } from './playerShotSpread';
import { BIO_PRIMARY_DAMAGE_PER_ROUND, getBioPrimaryShotPlan } from './bioPrimaryWeapon';
import {
  FIRE_RATE_LEVELS_PER_TIER,
  FIRE_RATE_MAX_LEVEL,
  FIRE_RATE_MAX_VOLLEY_SIZE,
  getFireRateIntervalFrames,
  getFireRateProjectileDamageMultiplier,
  getFireRateTier,
  getFireRateTierProgress,
  getFireRateVolleySize,
  getTightVolleyAngleOffsets,
  getTightVolleyOffsets
} from './weaponTierProgression';
import {
  canCampaignEnemyFire,
  isCampaignPriorityFireRole,
  resolveCampaignFormationFiringBehavior
} from './campaignEnemyFiring';
import {
  canStartCampaignFormationPackInstance,
  getCampaignBaseSimultaneousShooterLimit,
  getCampaignSimultaneousShooterLimit,
  getCampaignWaveSimultaneousShooterLimit as deriveCampaignWaveSimultaneousShooterLimit,
  resolveCampaignFormationPackForSpawn,
  selectCampaignShooterSlotIds
} from './campaignFormationBudget';
import {
  emitSquadDomainEvent,
  type MiniShipAbilityKind,
  type RuntimeSquadCompanion,
  type RuntimeSquadLoadout,
  type SquadSlotId
} from './squadProgression';
import { resolveBossPhaseConfig } from './bossPhaseConfig';
import {
  advanceBossRevivalRuntime,
  createBossRevivalRuntimeState,
  createCompletedBossRevivalRuntimeState,
  getBossRevivalPhaseBounds,
  getBossRevivalTargetPhaseIndex,
  type BossRevivalRuntimeState,
  type BossRevivalStage
} from './gameplay/bosses/BossRevivalRuntime';
import {
  GATEKEEPER_PRIME_BOSS_ID,
  GATEKEEPER_PRIME_DESKTOP_PROJECTILE_CAP,
  GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP,
  isGatekeeperPrimeRailPulseFrame,
  resolveGatekeeperPrimeAttackSchedule,
  sampleGatekeeperPrimePatrol,
  type GatekeeperPrimeAttackId,
  type GatekeeperPrimeAttackStage,
  type GatekeeperPrimePhaseId
} from './gameplay/bosses/GatekeeperPrimeRuntime';
import {
  resolvePaywallBossCadence
} from './gameplay/bosses/PaywallBossRuntime';
import {
  resolveBossPreviewArtworkDimensions,
  type BossPreviewArtworkDesignSize
} from './gameplay/bosses/BossPreviewArtworkGeometry';
import {
  getCampaignSpawnTargetCount,
  shouldCompleteClearWave,
  shouldUseLegacyMilestoneEncounters
} from './waveCompletion';
import {
  BOSS_COIN_BURST_FRAMES,
  MAX_ACTIVE_BOSS_REWARD_COINS,
  getBossCoinBurstCount,
  getBossCoinBurstKinematics
} from './bossCoinBurst';
import {
  MAX_SHOT_BUNDLE_LIFETIME_FRAMES,
  MAX_SHOT_PROJECTILE_CAP,
  buildMaxShotBundleVisualPattern,
  canAdmitMaxShotVolley,
  getAuthoredCampaignStageCount,
  getCampaignProgressionTier,
  getMaxShotProjectileCount,
  getMaxShotRoundsForTarget,
  getMaxShotSustainedEntityFloor,
  getNextAuthoredCampaignIndex,
  getPrimaryVolleySimulationEntityCount,
  type MaxShotVisualRound
} from './campaignCombatProgression';
import {
  isMaxShotShieldActive,
  isTimedPowerupActive,
  tickTimedPowerups
} from './powerupRuntime';
import {
  clampPlayerLives,
  resolvePlayerLifeDamage,
  resolvePlayerRevivalLives
} from './gameplay/playerLifeRuntime';
import {
  createGameplayRandom,
  type GameplayRandom,
  type GameplayRandomSeed
} from './gameplay/random';
import {
  getMiniBossEncounterByEventId,
  getMiniBossEncounterDefinition
} from './gameplay/mini-bosses/MiniBossEncounterRegistry';
import {
  createMiniBossMemberInstances,
  resolveMiniBossMemberAssetUrl,
  sampleMiniBossEncounter
} from './gameplay/mini-bosses/MiniBossEncounterRuntime';
import type {
  MiniBossEncounterDefinition,
  MiniBossEncounterId,
  MiniBossEncounterStage,
  MiniBossHazardCommand,
  MiniBossMemberFrameState,
  MiniBossMemberInstance
} from './gameplay/mini-bosses/types';
import type {
  GameplayTelemetrySessionEndReason,
  GameplayTelemetrySink
} from './gameplay/telemetry';
import { resolveCampaignDifficulty } from './gameplay/difficulty';
import {
  getFormationGroupSeed as calculateFormationGroupSeed,
  resolveConfiguredFormationMode as resolveFormationMode,
  resolveConfiguredFormationSpawnPoint,
  resolveConfiguredFormationTarget,
  resolveFormationEntryPlan,
  type ConfiguredFormationMode
} from './gameplay/formations';
import {
  MAX_GENERATED_BOSS_PROJECTILES_PER_CUE,
  getGeneratedBossTechniqueCue,
  getGeneratedBossPreviewAttackStart,
  getGeneratedBossPreviewAttackWindow,
  resolveGeneratedBossArchetype,
  type GeneratedBossArchetype,
  type GeneratedBossTechniqueCue
} from './generatedBossArchetypes';
import {
  getBossTimelineAttackWindow,
  getBossTimelineActiveAttackAtFrame,
  getBossTimelineDurationFrames,
  getBossTimelineCuesAtFrame,
  getBossTimelineTriggeredCues,
  resolveBossTimelineAttackVariant,
  type BossTimelineCue
} from './gameplay/bosses/BossTimelineRuntime';
import {
  buildBossWeaveWallSlots,
  resolveBossGapRoute,
  resolveBossGapRouteDirection,
  resolveBossPatternSequence,
  resolveBossPodSide,
  resolveBossWeaveWallLayout,
  type BossGapRouteDirectionPolicy
} from './gameplay/bosses/BossPatternRuntime';
import {
  HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
  resolveHeliosClampPlan,
  resolveHeliosCornerClampPlacement,
  resolveHeliosCrossfireShotPlan,
  resolveHeliosCrossfireSides,
  resolveHeliosMachineGunChannelGutterTargets,
  resolveHeliosMachineGunChannelHorizontalPadding,
  resolveHeliosMachineGunChannelSequence,
  resolveHeliosMachineGunChannelTargetPadding,
  resolveHeliosMachineGunChannelTargets,
  resolveHeliosMineArmPoint,
  resolveHeliosMineFormation,
  resolveHeliosMineFormationSequence,
  resolveHeliosTrackingPincerCoreRadius,
  sampleHeliosCornerClamp,
  sampleHeliosCrossfirePulse,
  sampleHeliosMachineGunChannelMovement,
  sampleHeliosMachineGunChannelPulse,
  sampleHeliosMineDeployment,
  sampleHeliosMineLifecycle,
  sampleHeliosReactorFanShot,
  sampleHeliosTrackingPincer,
  shouldFireHeliosMachineGunChannelGutter,
  type HeliosClawSide,
  type HeliosMineStage
} from './gameplay/bosses/HeliosClawcarrierRuntime';
import {
  FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT,
  FRONTIER_CROWNCLAW_MOTION_CUES,
  resolveFrontierChainclawPlan,
  resolveFrontierCrabwalkPlan,
  resolveFrontierReactorBeamAngles,
  resolveFrontierReactorBeamPlan,
  sampleFrontierBarragePulse,
  sampleFrontierBastionCrabwalk,
  sampleFrontierChainclawHarpoon,
  sampleFrontierCrownReactorBeam,
  type FrontierChainclawPlan,
  type FrontierCrabwalkPlan,
  type FrontierCrownclawSide,
  type FrontierReactorBeamPlan
} from './gameplay/bosses/FrontierCrownclawRuntime';
import {
  resolvePrismBroodProcessionParameters,
  resolvePrismKaleidoscopeBroodParameters,
  resolvePrismLunarSwoopParameters,
  resolvePrismMothActionForWings,
  resolvePrismMothBroodFormation,
  resolvePrismMothEmitterSockets,
  resolvePrismMothFormationSequence,
  resolvePrismMothOwnedArtifactState,
  resolvePrismMothPhaseRemixRules,
  resolvePrismMothSeedBranch,
  resolvePrismMothSignatureSequence,
  resolvePrismMothSwoopPasses,
  resolvePrismMothWingbeatSequence,
  resolvePrismWingbeatWeaveParameters,
  samplePrismMothBroodLifecycle,
  samplePrismMothBroodPath,
  samplePrismMothSignatureCorridor,
  samplePrismMothSwoopPass,
  type PrismMothActionId,
  type PrismMothBroodFormation,
  type PrismMothBroodFormationSlot,
  type PrismMothRuntimeSocketId,
  type PrismMothSignatureBeat,
  type PrismMothSwoopPass,
  type PrismMothWingBeatSource,
  type PrismMothWingSide
} from './gameplay/bosses/PrismMothRuntime';
import {
  createBossActionPresentationState,
  type BossActionPresentationStage,
  type BossActionPresentationState
} from './gameplay/bosses/BossActionPresentationRuntime';
import {
  captureBossAttackOriginLock,
  clearBossAttackOriginLocks,
  consumeBossAttackOriginLock,
  type BossAttackOriginLock,
  type BossAttackOriginPoint
} from './gameplay/bosses/BossAttackOriginLockRuntime';
import {
  ROTATING_EMITTER_FRAME_STEP_RADIANS,
  ROTATING_EMITTER_FULL_TURN_RADIANS,
  resolveRotatingEmitterDirection,
  resolveRotatingEmitterRadialBeamGeometry,
  sampleRotatingEmitterRelayPositions,
  sampleRotatingEmitterPulseState,
  sampleRotatingEmitterSocketPositionsForBounds
} from './gameplay/bosses/RotatingEmitterCoreRuntime';
import {
  CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS,
  CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS,
  resolveCornerAmbushBeamLock,
  rotatedBeamRectangleIntersectsBox,
  type CornerAmbushBeamLock
} from './gameplay/bosses/CornerAmbushBeamRuntime';
import {
  CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS,
  CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS,
  resolveCornerAmbushRamLock,
  sampleCornerAmbushRamProgress,
  type CornerAmbushRamLock
} from './gameplay/bosses/CornerAmbushRamRuntime';
import { resolveBossRotationSequence } from './gameplay/bosses/BossRotationDirectionRuntime';
import {
  getBossHullImpactStrength,
  isBossHullImpactSignificant
} from './gameplay/bosses/BossImpactFeedbackRuntime';
import {
  resolveBossPixelProjectileVisualKind,
  type BossModularProjectileVisualKind
} from './gameplay/bosses/BossProjectilePresentationRuntime';
import { isDamagingBossTimelinePrimitive } from '../game-config/bossTimeline';
import {
  isMovementPathId,
  sampleNormalizedMovementPath
} from '../game-config/movementPaths';
import {
  applyBossComponentDamage,
  isBossComponentTargetable,
  isBossHullProtectedByComponents,
  setBossComponentExposure,
  syncHullLinkedHelmetToHullHealth
} from './gameplay/bosses/BossComponentRuntime';
import {
  intersectsBossCollisionMask,
  type BossCollisionMask
} from './gameplay/bosses/BossCollisionMask';
import {
  BOSS_SIGNIFICANT_REACTION_FRAMES,
  sampleBossWeaponSockets,
  type BossWeaponSocketPoseInput,
  type BossWeaponSocketPoseSampler,
  type BossWeaponSocketProfile,
  type BossWeaponSocketRole
} from './gameplay/bosses/BossWeaponSocketRuntime';
import {
  getBossComponentCollisionMask,
  getCampaignBossCollisionMask
} from './gameplay/bosses/generatedBossCollisionMasks';
import {
  clampPreviewBossHealthRatio,
  clampPreviewFastForwardFrames,
  clampPreviewSeekFrame,
  rescalePreviewHealthBudget,
  resolvePreviewAttackLoopFrame,
  resolvePreviewSafeRegionGuide,
  type PreviewPlaybackSnapshot,
  type PreviewSnapshot
} from './gameplay/previewSession';

export type {
  BossActionPresentationStage,
  BossActionPresentationState
} from './gameplay/bosses/BossActionPresentationRuntime';

// --- Helper Classes ---

type EnemyFormationMode = ConfiguredFormationMode | 'orbit';
type ConfiguredEnemyFormationMode = ConfiguredFormationMode;
type EnemyFormationState = 'entry' | 'hold' | 'dive' | 'return';
type PlayerWeaponKind = 'pulse' | 'bio-primary' | 'plasma' | 'ion' | 'nova' | 'singularity' | 'bio-laser' | 'eth-shard' | 'btc-hash';
export type BossPartId = 'left-cannon' | 'right-cannon' | 'helmet';
export type BossComponentState = {
  id: BossPartId;
  label: string;
  hp: number;
  maxHp: number;
  centerXRatio: number;
  centerYRatio: number;
  widthRatio: number;
  heightRatio: number;
  destroyed: boolean;
  exposed: boolean;
  flashFrames: number;
  lastDamageFlashFrame: number;
};
export type BossCornerAmbushBeamState = {
  actionClipId: string;
  holdUntilFrame: number;
  lock: CornerAmbushBeamLock;
};
export type BossCornerAmbushRamState = {
  actionClipId: string;
  stage: 'warning' | 'charge';
  startFrame: number;
  endFrame: number;
  lock: CornerAmbushRamLock;
};
export type BossTrackingPincerState = {
  actionClipId: string;
  anchorX: number;
  anchorY: number;
  riseX: number;
  riseY: number;
  targetX: number;
  targetY: number;
};
export type BossHeliosCornerClampState = {
  actionClipId: string;
  executionIndex: number;
  activeSide?: HeliosClawSide;
  fallbackToCrossfire: boolean;
  anchorX: number;
  anchorY: number;
  cornerX: number;
  cornerY: number;
  lockedX: number;
};
export type BossHeliosMachineGunChannelState = {
  actionClipId: string;
  sequence: number;
  directionSequence: number;
  anchorX: number;
  anchorY: number;
  warningStartFrame: number;
  fireStartFrame: number;
  fireEndFrame: number;
  channelWidthPixels: number;
  sweepRangeRatio: number;
  sweepPasses: number;
  shotIntervalFrames: number;
  projectileSpeedScale: number;
};
export type HeliosMineRuntimeState = {
  spawnFrame: number;
  triggerAgeFrame: number;
  hitPlayer: boolean;
  deployStartX: number;
  deployStartY: number;
  armX: number;
  armY: number;
  deployFrames: number;
};
export type BossHeliosMineFormationState = {
  actionClipId: string;
  executionIndex: number;
  sequence: number;
};
type PrismMothTimelinePrimitiveId =
  | 'prism-wingbeat-weave'
  | 'prism-brood-procession'
  | 'prism-lunar-swoop'
  | 'prism-kaleidoscope-brood';
type PrismMothActionRuntimeState = {
  key: string;
  actionClipId: string;
  executionIndex: number;
  loopIndex: number;
  phaseId: string;
  phaseIndex: 1 | 2;
  requestedActionId: PrismMothActionId;
  resolvedActionId: PrismMothActionId;
  sourceActionId: string;
  sourceActionEndFrame: number;
  warningStartFrame: number;
  scheduledFireFrame: number;
  fireStartFrame?: number;
  fireEndFrame?: number;
  anchorX: number;
  anchorY: number;
  preparationStartX?: number;
  preparationStartY?: number;
  preparationActivatedFrame?: number;
  returnStartFrame?: number;
  returnEndFrame?: number;
  returnStartX?: number;
  returnStartY?: number;
  emittedIndexes: number[];
  spawnedNodeIndexes: number[];
  wingbeatSource?: PrismMothWingBeatSource;
  delayedBroodEcho?: boolean;
  formation?: PrismMothBroodFormation;
  swoopPass?: PrismMothSwoopPass;
  signatureBeat?: PrismMothSignatureBeat;
  signatureBeatIndex?: number;
  signatureNodesActivated?: boolean;
  featherCount: number;
  featherIntervalFrames: number;
  featherSpeedScale: number;
  fanAngleRadians: number;
  trailIntervalFrames: number;
  broodHatchDelayFrames: number;
  broodFlightFrames: number;
};
type PrismMothArtifactKind = 'feather' | 'swoop-trail' | 'brood';
type PrismMothOwnedArtifactRuntimeState = {
  kind: PrismMothArtifactKind;
  sourceActionId: string;
  sourceActionEndFrame: number;
  sourcePhaseId: string;
  destructible?: boolean;
  targetable?: boolean;
  collisionActive: boolean;
  damageActive: boolean;
  spawnFrame: number;
  formation?: PrismMothBroodFormation;
  formationSlot?: PrismMothBroodFormationSlot;
  deployOriginX?: number;
  deployOriginY?: number;
  cocoonX?: number;
  cocoonY?: number;
  hatchDelayFrames?: number;
  flightFrames?: number;
  activationFrame?: number;
  signatureNodeIndex?: number;
};
type BossGatlingAttackLock = {
  actionClipId: string;
  executionIndex: number;
  targetX: number;
  targetY: number;
  portOrigins: readonly BossAttackOriginPoint[];
  starboardOrigins: readonly BossAttackOriginPoint[];
};
type BossFrontierCrownclawRuntimeState = {
  kind: 'harpoon' | 'reactor-beam' | 'crabwalk';
  actionClipId: string;
  executionIndex: number;
  phaseIndex: number;
  sequence: number;
  anchorX: number;
  anchorY: number;
  warningStartFrame: number;
  fireStartFrame: number;
  fireEndFrame: number;
  lockedTargetX: number;
  lockedTargetY: number;
  signature: boolean;
  sides: readonly FrontierCrownclawSide[];
  harpoonPlan?: FrontierChainclawPlan;
  reactorPlan?: FrontierReactorBeamPlan;
  crabwalkPlan?: FrontierCrabwalkPlan;
  lastBarrageShotIndex: number;
};
type FrontierCrownclawArtifactKind =
  | 'harpoon-claw'
  | 'harpoon-link'
  | 'harpoon-guide'
  | 'reactor-guide'
  | 'reactor-beam';
export type BossProjectileVisualKind =
  | 'boss-ray'
  | 'boss-bolt'
  | 'boss-pod'
  | 'boss-eye-comet'
  | 'boss-pixel-pink'
  | 'boss-pixel-gold'
  | 'boss-pixel-prism'
  | 'crown-claw-left'
  | 'crown-claw-right'
  | 'boss-helios-explosion'
  | BossModularProjectileVisualKind
  | ShipAbilityKind;
type PendingPlayerShot = {
  fireFrame: number;
  speed: number;
  offsetX: number;
  yOffset: number;
  angleBias: number;
  pitchOffset: number;
  weaponKind: PlayerWeaponKind;
  damageOverride?: number;
  playSound?: boolean;
  maxShotVisualPattern?: readonly MaxShotVisualRound[];
};

export class Entity {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  markedForDeletion: boolean = false;
  color: string;

  // Specific props
  hp: number = 1;
  maxHp: number = 1;
  text?: string;
  angle: number = 0;

  // Lifecycle props
  life: number = 0;
  maxLife: number = 0;

  // Boss Props
  attackTimer: number = 0;
  lastBurstAttackTimer: number = 0;
  isCharging: boolean = false;
  isBeam: boolean = false;
  beamAxis: 'vertical' | 'horizontal' = 'vertical';
  /** Optional screen-space angle for authored rotating ray beams. */
  beamAngleRadians: number | null = null;
  beamRadialRay: boolean = false;
  beamRadialOutwardLength: number = 0;
  beamRotorAxisIndex: number = -1;
  beamRotorSequence: number = 0;
  beamSweepStartFrame: number = -1;
  beamSweepDurationFrames: number = 0;
  isCornerAmbushBeam: boolean = false;
  beamFromCenter: boolean = false;
  isDetachedBeam: boolean = false;
  isTelegraph: boolean = false;
  isBossGapGuide: boolean = false;
  isBossSideBarrageGuide: boolean = false;
  beamAnchorOffsetX: number | null = null;
  beamOriginX: number | null = null;
  beamOriginY: number | null = null;
  beamTargetX: number | null = null;
  beamTargetY: number | null = null;
  beamLaneSign: number = 0;
  bossAttackArchetype?: GeneratedBossArchetype;
  bossTimeline?: BossTimelineConfig;
  bossTimelinePhaseId?: string;
  bossTimelineLastPhaseId?: string;
  bossActionPresentation?: BossActionPresentationState;
  bossRevival?: BossRevivalConfig;
  bossRevivalRuntime?: BossRevivalRuntimeState;
  bossRevivalStage?: BossRevivalStage;
  bossRevivalProgress: number = 0;
  bossRevivalConsumed: boolean = false;
  bossRevivalBaseWidth: number = 0;
  bossRevivalBaseHeight: number = 0;
  bossMovementPathId?: MovementPathId;
  bossMovementPathStartFrame: number = -1;
  bossMovementPathDurationFrames: number = 0;
  bossCornerAmbushBeamState?: BossCornerAmbushBeamState;
  bossCornerAmbushRamState?: BossCornerAmbushRamState;
  bossTrackingPincerState?: BossTrackingPincerState;
  bossHeliosCornerClampState?: BossHeliosCornerClampState;
  bossHeliosMachineGunChannelState?: BossHeliosMachineGunChannelState;
  bossHeliosMachineGunChannelUseCount: number = 0;
  bossHeliosMineFormationState?: BossHeliosMineFormationState;
  bossHeliosMineFormationUseCount: number = 0;
  bossFrontierCrownclawState?: BossFrontierCrownclawRuntimeState;
  bossPrismMothActionStates: PrismMothActionRuntimeState[] = [];
  bossPrismMothBodyDamageActive: boolean = false;
  /** Pixi presentation only. Collision remains the entity's axis-aligned box. */
  bossPresentationBankRadians: number = 0;
  /** Continuous simulation-owned rotor pose shared by art, warnings, and hits. */
  bossRotorAngleRadians: number = 0;
  bossRotorDirection: -1 | 1 = -1;
  bossRotorInitialized: boolean = false;
  /** Whole-rig recoil is reserved for large hull impacts and part breaks. */
  bossSignificantImpactFrame: number = -999;
  bossSignificantImpactXRatio: number = 0.5;
  bossSignificantImpactYRatio: number = 0.5;
  bossSignificantImpactStrength: number = 0;
  bossSignificantImpactIsComponent: boolean = false;
  /** Gatekeeper Prime owns one bounded Mission-5 patrol/attack controller. */
  gatekeeperPrimeCombatStartFrame: number = -1;
  gatekeeperPrimeAttackId?: GatekeeperPrimeAttackId;
  gatekeeperPrimeAttackStage?: GatekeeperPrimeAttackStage;
  gatekeeperPrimePhaseId?: GatekeeperPrimePhaseId;
  gatekeeperPrimeLockedTargetX: number | null = null;
  gatekeeperPrimeLockedTargetY: number | null = null;
  gatekeeperPrimeMinimumPatrolX: number = 0;
  gatekeeperPrimeMaximumPatrolX: number = 0;
  gatekeeperPrimeMinimumPatrolY: number = 0;
  gatekeeperPrimeMaximumPatrolY: number = 0;
  generatedBossChargeUntilTimer: number = -1;
  /**
   * Last authored generated-boss cue timer evaluated by the runtime. Campaign
   * bosses can intentionally stretch the archetype schedule; this guard keeps
   * one logical cue frame from firing repeatedly while several simulation
   * frames map to it.
   */
  generatedBossTechniqueTimer: number = -1;
  generatedBossTargetX: number | null = null;
  generatedBossTargetY: number | null = null;
  generatedBossTargetSequence: number = -1;
  bossTimelineTargetClipId?: string;
  bossTimelineTargetExecutionIndex: number = -1;
  bossTimelineTargetX: number | null = null;
  bossTimelineTargetY: number | null = null;
  /** Warning-owned socket snapshots keyed by action clip and repeat execution. */
  bossAttackOriginLocks: readonly BossAttackOriginLock[] = [];
  /** Exact warning-owned rotary muzzle geometry used for every gatling pulse. */
  bossGatlingAttackLock?: BossGatlingAttackLock;
  bossCrossBeamOriginX: number | null = null;
  bossCrossBeamOriginY: number | null = null;
  bossRigId?: BossRigId;
  bossComponents?: BossComponentState[];
  bossDecayStage: number = 0;
  projectileVisualKind?: BossProjectileVisualKind;
  /** Generic modular-projectile playback hint consumed by the renderer. */
  projectileAnimationMode: 'cycle' | 'play-once-before-last' | 'hold-last' = 'cycle';
  /** Generic sprite-sheet playback controls; gameplay owns the lifecycle. */
  spriteFramePlaybackMode: 'loop' | 'once' = 'loop';
  spriteFrameHoldFrames?: number;
  spriteFrameFixedRotationRadians?: number;
  bossPodSide?: 'left' | 'right';
  shipAbilityKind?: ShipAbilityKind;
  bossOwnerId?: string;
  bossComponentId?: BossPartId;
  clawOutboundFrames: number = 0;
  clawReturning: boolean = false;
  clawHasHitPlayer: boolean = false;
  heliosMineState?: HeliosMineRuntimeState;
  heliosMineStage?: HeliosMineStage;
  frontierCrownclawArtifactKind?: FrontierCrownclawArtifactKind;
  frontierCrownclawActionClipId?: string;
  frontierCrownclawSide?: FrontierCrownclawSide;
  frontierCrownclawLinkIndex: number = -1;
  frontierCrownclawBeamIndex: number = -1;
  frontierCrownclawDamageActive: boolean = false;
  prismMothArtifactState?: PrismMothOwnedArtifactRuntimeState;

  // Missile Props
  isMissile: boolean = false;
  homingSpeed?: number;
  homingTurnRate?: number;

  // Projectile Ownership
  isPlayerShot: boolean = false;
  squadAbilityKind?: MiniShipAbilityKind;
  variant: number = 0;
  formation?: EnemyFormationMode;
  formationIndex: number = 0;
  formationSeed: number = 0;
  formationGroupSeed: number = 0;
  formationState?: EnemyFormationState;
  formationTargetX?: number;
  formationTargetY?: number;
  formationStartX?: number;
  formationStartY?: number;
  formationStateFrame: number = 0;
  formationEntryFrames: number = 0;
  formationDiveFrame: number = 0;
  formationBaseSpeed: number = 0;
  formationCycle: number = 0;
  encounterGroupSize: number = 1;
  /** Shared Mini-Boss encounter identity used by Campaign fights and isolated Sandbox previews. */
  miniBossLabEncounterId?: string;
  miniBossLabMemberId?: string;
  miniBossLabAssetId?: string;
  /** Stable linked-unit role used by choreography, compact bars, and cleanup. */
  miniBossLabRole?: string;
  /** Simulation-owned presentation state; the renderer never invents attacks. */
  miniBossLabVisualState: 'entrance' | 'idle' | 'charge' | 'signature' | 'support' | 'hit' | 'low-health' | 'death' = 'idle';
  miniBossLabSpawnFrame: number = -1;
  miniBossLabSequence: number = 0;
  miniBossLabShielded: boolean = false;
  miniBossLabDamageable: boolean = true;
  miniBossLabShowHealthBar: boolean = true;
  miniBossLabHealthBarWidth?: number;
  miniBossLabPresentationScale: number = 1;
  miniBossLabDeathStartedFrame: number = -1;
  miniBossLabWallSide?: 'left' | 'right';
  miniBossLabTargetX: number | null = null;
  miniBossLabTargetY: number | null = null;
  /** Owned Maw Carrier summons become targetable and damaging only after this visible lifecycle. */
  miniBossLabReinforcementStage?: 'deploy' | 'activation' | 'active';
  miniBossLabReinforcementSpawnFrame: number = -1;
  miniBossLabReinforcementTargetVx: number = 0;
  miniBossLabReinforcementTargetVy: number = 0;
  miniBossLabReinforcementContactDamage: number = 0;
  flashFrames: number = 0;
  lastDamageFlashFrame: number = -999;
  shieldHostId?: string;
  damage: number = 1;
  pierceRemaining: number = 0;
  weaponKind: PlayerWeaponKind = 'pulse';
  /** Presentation-only gun level used to select projectile art; never changes the collision box. */
  weaponVisualLevel: number = 0;
  /** Simulation-frame timestamp used only to play the launch art once. */
  weaponVisualStartFrame: number = 0;
  /** One bounded simulation entity that renders and spends several Max Shot rounds. */
  maxShotVisualPattern?: readonly MaxShotVisualRound[];
  projectileUnitWidth?: number;
  projectileUnitHeight?: number;
  representedRoundsRemaining: number = 0;
  hitTargetIds?: Set<string>;
  spriteUrl?: string;
  spriteFrames?: string[];
  spriteStyle?: SpriteStyle;
  scoreValue?: number;
  scoreReward?: number;
  powerupDropChance?: number;
  /** Number of collectible coin entities released by an authored Supply Drop package. */
  coinDropValue?: number;
  /** Authored Supply Drop package role; absent for enemies and asteroids. */
  supplyDropKind?: PresentDropPresentKind;
  contactDamage: number = 1;
  projectileDamage: number = 1;
  projectileSpeed?: number;
  configuredBaseSpeed?: number;
  configuredSpeed?: number;
  configuredDifficultyMultiplier: number = 1;
  configuredAttackTempoMultiplier: number = 1;
  attackIntervalFrames?: number;
  movementPattern?: string;
  phaseThresholds: number[] = [];
  weaponKinds: string[] = [];
  configuredBurstCount?: number;
  bossPhaseSettings: BossHealthPhase[] = [];
  bossWeaponSettings: BossWeaponSetting[] = [];
  activeBossPhaseIndex: number = -1;
  activeBossPhaseId?: string;
  activeBossPhaseSpeedMultiplier: number = 1;
  isElite: boolean = false;
  eliteRank?: EnemyRank;
  eliteAttackPattern?: EnemyAttackPatternId;
  eliteAttackSequence: number = 0;
  completesWave: boolean = false;
  /** Configuration provenance used by the local visual editor. */
  sourceEventId?: string;
  sourceItemId?: string;
  campaignRoleId?: string;
  campaignGameplayRole?: EnemyGameplayRole;
  campaignDurabilityClass?: EnemyDurabilityClass;
  campaignThreatCost: number = 1;
  campaignPerformanceCost: number = 1;
  campaignFireBehavior?: EnemyRoleDefinition['fireBehavior'];
  campaignFireDelaySeconds: number = 0;
  campaignFormationFiringBehavior?: FormationPackDefinition['firingBehavior'];
  campaignFormationPackId?: string;
  campaignFormationPackInstanceId?: string;
  campaignSpawnFrame: number = 0;
  wallLaneX?: number;
  wallRowOffset?: number;
  wallPass?: number;
  wallSwayPhase?: number;
  coinBurstFrames: number = 0;
  coinGravity: number = 0;
  coinBounceFloorY?: number;
  coinBouncesRemaining: number = 0;
  bossRewardWave?: number;
  coinValueCredited: boolean = false;

  constructor(type: EntityType, x: number, y: number, idSample: number = Math.random()) {
    this.id = Math.floor(
      Math.max(0, Math.min(0.999999999999, idSample)) * 0x1_0000_0000
    ).toString(36).padStart(9, '0');
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.color = '#FFF';
    this.width = 30;
    this.height = 30;
  }
}

export class Particle extends Entity {
  constructor(x: number, y: number, color: string, speed: number, size: number = 4, life: number = 40 + Math.random() * 20) {
    super(EntityType.PARTICLE, x, y);
    this.width = size;
    this.height = size;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = life;
    this.maxLife = this.life;
  }
}

export class VisualEffect extends Entity {
  effectType: 'text' | 'ring' | 'sprite';
  fontSize: number = 32;
  constructor(x: number, y: number, type: 'text' | 'ring' | 'sprite', content: string = '', color: string = '#FFF', fontSize: number = 32) {
    super(EntityType.EFFECT, x, y);
    this.effectType = type;
    this.text = content;
    this.color = color;
    this.fontSize = fontSize;
    this.life = 60;
    this.maxLife = 60;

    if (type === 'text') {
        this.vy = -0.5;
        this.life = 120;
        this.maxLife = 120;
    }
  }
}

class Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinkleDir: number;
  drift: number;

  constructor(width: number, height: number) {
    const depth = Math.random();
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.size = 0.6 + (depth * 2.4);
    this.speed = 0.08 + (depth * 1.35);
    this.alpha = 0.2 + (depth * 0.7);
    this.twinkleDir = (Math.random() > 0.5 ? 1 : -1) * (0.003 + (depth * 0.01));
    this.drift = -0.02 - (depth * 0.12);
  }

  update(width: number, height: number) {
    this.y += this.speed;
    this.x += this.drift;

    // Twinkle effect
    this.alpha += this.twinkleDir;
    if (this.alpha > 1) {
       this.alpha = 1;
       this.twinkleDir *= -1;
    } else if (this.alpha < 0.2) {
       this.alpha = 0.2;
       this.twinkleDir *= -1;
    }

    if (this.y > height) {
      this.y = 0;
      this.x = Math.random() * width;
    }
    if (this.x < 0) {
      this.x = width;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = `rgba(226, 244, 255, ${this.alpha})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

class BackgroundEntity {
  x: number;
  y: number;
  size: number;
  color: string;
  speed: number;
  type: 'planet' | 'nebula';

  constructor(width: number, height: number) {
    this.type = Math.random() > 0.3 ? 'planet' : 'nebula';
    this.x = Math.random() * width;
    this.y = Math.random() * height;

    if (this.type === 'planet') {
      this.size = 50 + Math.random() * 100;
      this.speed = 0.2 + Math.random() * 0.3;
      const hues = [240, 260, 280, 200];
      const hue = hues[Math.floor(Math.random() * hues.length)];
      this.color = `hsl(${hue}, 40%, 20%)`;
    } else {
      this.size = 200 + Math.random() * 300;
      this.speed = 0.1;
      this.color = `rgba(${Math.floor(Math.random()*50)}, ${Math.floor(Math.random()*20)}, ${Math.floor(Math.random()*80) + 50}, 0.1)`;
    }
  }

  update(height: number) {
    this.y += this.speed;
    if (this.y > height + this.size) {
      this.y = -this.size * 2;
      this.x = Math.random() * 1000;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = 0.2;

    if (this.type === 'planet') {
      const gradient = ctx.createRadialGradient(this.x, this.y, this.size * 0.2, this.x, this.y, this.size);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(this.x - this.size*0.3, this.y - this.size*0.3, this.size, 0, Math.PI * 2);
      ctx.fill();

    } else {
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x - this.size, this.y - this.size, this.size*2, this.size*2);
    }
    ctx.restore();
  }
}

const imageCache: Record<string, HTMLImageElement> = {};
const DEFAULT_BOMB_SPRITE_URL = getPrimaryAssetPath(DEFAULT_GAME_CAMPAIGN.hudAssets.bombIconAssetKey);
const loadImage = (url: string) => {
  if (imageCache[url]) return imageCache[url];
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  imageCache[url] = img;
  return img;
};

const getReadyImage = (url: string) => {
  const img = imageCache[url];
  if (!img || !img.complete || img.naturalWidth <= 0) {
    return null;
  }
  return img;
};

const GAMEPLAY_ASSET_URLS = [
  ASSETS.PLAYER_SHIP,
  ASSETS.BIO_SHIP,
  ASSETS.ETH_SHIP,
  ASSETS.BTC_SHIP,
  ASSETS.RSC_TOKEN,
  ...ASSETS.RSC_TOKEN_FLIP_FRAMES,
  ...PLAYER_WEAPON_FRAME_URLS,
  ...SHIP_ABILITY_FRAME_URLS,
  ...RESEARCH_IMPACT_FRAME_URLS,
  ...ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES,
  ASSETS.POWERUP_MAX_SHOT,
  ...ASSETS.POWERUP_MAGNET_FRAMES,
  ...ASSETS.POWERUP_SHIELD_FRAMES,
  ...ASSETS.POWERUP_RESEARCH_BEAM_FRAMES,
  ASSETS.REAL_RSC_ICON,
  ASSETS.GAME_BG_BACK,
  ASSETS.GAME_BG_STARS,
  ASSETS.GAME_BG_PLANET,
  ASSETS.GAME_PARALLAX_BACK,
  ASSETS.GAME_PARALLAX_STARS,
  ASSETS.GAME_PARALLAX_FAR_PLANETS,
  ASSETS.GAME_PARALLAX_BIG_PLANET,
  ASSETS.GAME_PARALLAX_RING_PLANET,
  ASSETS.ENEMY_JOURNAL,
  ASSETS.MINI_BOSS,
  ASSETS.WALL_BOSS_SEGMENT,
  ...ASSETS.PAYWALL_BASTION_FRAMES,
  ASSETS.FINAL_BOSS,
  DEFAULT_BOMB_SPRITE_URL,
  ...ASSETS.ENEMY_DRONE_FRAMES,
  ...ASSETS.ENEMY_SWARM_FRAMES,
  ...ASSETS.ENEMY_BRICK_FRAMES,
  ...ASSETS.ASTEROID_BELT_FRAMES,
  ...ASSETS.ENEMY_JOURNAL_FRAMES
];

export const preloadGameplayAssets = async () => {
  await Promise.all(GAMEPLAY_ASSET_URLS.map(async (url) => {
    const image = loadImage(url);
    if (image.complete && image.naturalWidth > 0) return;

    if (typeof image.decode === 'function') {
      try {
        await image.decode();
        return;
      } catch {
        // Fall through to the load event for browsers with partial decode support.
      }
    }

    if (image.complete) return;

    await new Promise<void>((resolve) => {
      const finish = () => resolve();
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    });
  }));
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getBossInwardCollapseTarget = (
  playerCenterX: number,
  playerCenterY: number,
  sequence: number,
  width: number,
  height: number
) => ({
  x: clamp(playerCenterX + Math.sin(sequence * 1.7) * width * 0.04, 42, width - 42),
  y: clamp(playerCenterY, height * 0.38, height - 72)
});

const moveToward = (current: number, target: number, maxDelta: number) => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

const lerp = (current: number, target: number, amount: number) => current + ((target - current) * amount);

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
export const PLAYER_PRIMARY_SHOT_SPREAD_DEGREES = 5;
const PLAYER_PRIMARY_SHOT_SPREAD_RADIANS = PLAYER_PRIMARY_SHOT_SPREAD_DEGREES * (Math.PI / 180);
export const MAX_SHOT_PROJECTILE_COUNT = MAX_SHOT_PROJECTILE_CAP;
const TIGHT_VOLLEY_VISUAL_PATTERNS: readonly (readonly MaxShotVisualRound[])[] = Object.freeze(
  Array.from({ length: FIRE_RATE_MAX_VOLLEY_SIZE }, (_, tierIndex) => {
    const volleySize = tierIndex + 1;
    const angleOffsets = getTightVolleyAngleOffsets(volleySize);
    return Object.freeze(getTightVolleyOffsets(volleySize).map((offsetX, index) => Object.freeze({
      offsetX,
      angleOffset: angleOffsets[index] || 0
    })));
  })
);
const MAX_SHOT_BUNDLE_VISUAL_PATTERNS: readonly (readonly MaxShotVisualRound[])[] = Object.freeze(
  TIGHT_VOLLEY_VISUAL_PATTERNS.map((pattern) => buildMaxShotBundleVisualPattern(
    pattern.map((round) => round.offsetX),
    pattern.map((round) => round.angleOffset)
  ))
);
const getTightVolleyVisualPattern = (volleySize: number) => (
  TIGHT_VOLLEY_VISUAL_PATTERNS[Math.max(
    0,
    Math.min(FIRE_RATE_MAX_VOLLEY_SIZE - 1, Math.floor(Number(volleySize) || 1) - 1)
  )]
);
const getMaxShotBundleVisualPattern = (volleySize: number) => (
  MAX_SHOT_BUNDLE_VISUAL_PATTERNS[Math.max(
    0,
    Math.min(FIRE_RATE_MAX_VOLLEY_SIZE - 1, Math.floor(Number(volleySize) || 1) - 1)
  )]
);
const COMPANION_SHOT_STEPS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  1: Object.freeze([0]),
  2: Object.freeze([-0.5, 0.5]),
  3: Object.freeze([-1, 0, 1]),
  4: Object.freeze([-1.5, -0.5, 0.5, 1.5]),
  5: Object.freeze([-2, -1, 0, 1, 2]),
  7: Object.freeze([-3, -2, -1, 0, 1, 2, 3]),
  9: Object.freeze([-4, -3, -2, -1, 0, 1, 2, 3, 4])
});
const getCompanionShotSteps = (volleySize: number) => COMPANION_SHOT_STEPS[volleySize] ?? COMPANION_SHOT_STEPS[1];
const getRandomPrimaryShotAngle = (sample: number) => (
  (Math.floor(sample * 3) - 1) * PLAYER_PRIMARY_SHOT_SPREAD_RADIANS
);

const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

const easeInOutCubic = (value: number) => {
  const t = clamp(value, 0, 1);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const GAME_FEEL = {
  acceleration: 0.38,
  friction: 0.3,
  touchAcceleration: 0.46,
  touchResponse: 0.12,
  tiltEase: 0.18,
  tiltPerSpeed: 0.045,
  maxTilt: 0.36,
  afterimageSpeed: 2.8,
  comboWindowFrames: 90,
  shakeDecay: 0.34,
  flashDecay: 0.045,
  squashSpring: 0.2,
  squashDamping: 0.72
};

export const getPrimaryImpactShakeCooldownFrames = (mobileProfile: boolean) => (
  mobileProfile ? 6 : 4
);

export const getPrimaryImpactShakeStrength = (leanEffects: boolean, mainBoss: boolean) => (
  leanEffects ? 0.12 : mainBoss ? 0.28 : 0.2
);

const BASE_COIN_MAGNET_RADIUS = 100;
const POWERUP_COIN_MAGNET_RADIUS = 420;
const BOMB_DROP_CHANCE = 0.012;
const ELITE_BOMB_DROP_CHANCE = 0.05;
const EXTRA_LIFE_DROP_CHANCE = 0.004;
const ELITE_EXTRA_LIFE_DROP_CHANCE = 0.014;
const MINI_BOSS_BOMB_REWARD_CHANCE = 0.28;
const BOMB_DAMAGE_BOSS = 14;
const BOMB_DAMAGE_MINI_BOSS = 18;
const BOMB_DAMAGE_INVADER = 3;
const WAVE_ONE_GATEKEEPER_START_INTERVAL_MULTIPLIER = 1.45;
const WAVE_ONE_GATEKEEPER_MAX_SPEED_HEALTH_RATIO = 0.35;
const WAVE_TWO_GATEKEEPER_START_INTERVAL_MULTIPLIER = 1.55;
const WAVE_TWO_GATEKEEPER_MAX_SPEED_HEALTH_RATIO = 0.3;
type GatekeeperCadenceConfig = {
  startIntervalMultiplier: number;
  maxSpeedHealthRatio: number;
};
const GATEKEEPER_CADENCE_BY_WAVE: Partial<Record<number, GatekeeperCadenceConfig>> = {
  1: {
    startIntervalMultiplier: WAVE_ONE_GATEKEEPER_START_INTERVAL_MULTIPLIER,
    maxSpeedHealthRatio: WAVE_ONE_GATEKEEPER_MAX_SPEED_HEALTH_RATIO
  },
  2: {
    startIntervalMultiplier: WAVE_TWO_GATEKEEPER_START_INTERVAL_MULTIPLIER,
    maxSpeedHealthRatio: WAVE_TWO_GATEKEEPER_MAX_SPEED_HEALTH_RATIO
  }
};
const PLAYER_THRUSTER_PALETTES = [
  { core: 'rgba(255,255,255,0.95)', mid: 'rgba(103,232,249,0.9)', edge: 'rgba(37,99,235,0.62)', fade: 'rgba(34,211,238,0)', glow: '#22d3ee', streak: 'rgba(103,232,249,0.34)' },
  { core: 'rgba(255,255,255,0.98)', mid: 'rgba(167,139,250,0.98)', edge: 'rgba(109,40,217,0.84)', fade: 'rgba(124,58,237,0)', glow: '#a78bfa', streak: 'rgba(196,181,253,0.5)' },
  { core: 'rgba(255,255,255,0.98)', mid: 'rgba(232,121,249,0.98)', edge: 'rgba(147,51,234,0.84)', fade: 'rgba(217,70,239,0)', glow: '#e879f9', streak: 'rgba(240,171,252,0.52)' },
  { core: 'rgba(255,255,255,0.99)', mid: 'rgba(244,114,182,0.98)', edge: 'rgba(190,24,93,0.84)', fade: 'rgba(236,72,153,0)', glow: '#f472b6', streak: 'rgba(251,207,232,0.54)' },
  { core: 'rgba(255,255,255,0.99)', mid: 'rgba(251,146,60,0.98)', edge: 'rgba(194,65,12,0.84)', fade: 'rgba(249,115,22,0)', glow: '#fb923c', streak: 'rgba(254,215,170,0.54)' },
  { core: 'rgba(255,255,255,1)', mid: 'rgba(250,204,21,0.97)', edge: 'rgba(249,115,22,0.78)', fade: 'rgba(234,179,8,0)', glow: '#facc15', streak: 'rgba(254,240,138,0.52)' },
  { core: 'rgba(255,255,255,1)', mid: 'rgba(254,240,138,0.99)', edge: 'rgba(251,146,60,0.86)', fade: 'rgba(250,204,21,0)', glow: '#fef08a', streak: 'rgba(255,255,255,0.58)' },
  { core: 'rgba(255,255,255,1)', mid: 'rgba(165,243,252,1)', edge: 'rgba(14,165,233,0.9)', fade: 'rgba(34,211,238,0)', glow: '#ecfeff', streak: 'rgba(186,230,253,0.68)' }
] as const;
const MOBILE_DETAIL_BREAKPOINT = 560;
const MOBILE_PARTICLE_CAP = 120;
const DESKTOP_PARTICLE_CAP = 240;
const MOBILE_EFFECT_CAP = 24;
const DESKTOP_EFFECT_CAP = 44;
const MOBILE_THREAT_CAP = 34;
const DESKTOP_THREAT_CAP = 46;
const MOBILE_PLAYER_SHOT_CAP = 28;
const MOBILE_LEAN_PLAYER_SHOT_CAP = 20;
const DESKTOP_PLAYER_SHOT_CAP = 28;
const MOBILE_MAX_PLAYER_SHOT_CAP = 96;
const DESKTOP_MAX_PLAYER_SHOT_CAP = 148;
const PENDING_PLAYER_SHOT_CAP = 24;
const COLLISION_COLUMN_WIDTH = 96;
const EMPTY_GUN_POD_OFFSETS: number[] = [];
const BOSS_RIG_BY_EVENT_ID: Readonly<Record<string, BossRigId>> = Object.freeze({
  'open-orbit-gatekeeper': 'open-orbit',
  'citation-storm-gatekeeper': 'citation-storm',
  'paywall-siege-gatekeeper': 'paywall-siege',
  'open-galaxy-gatekeeper': 'crown-claw',
  'bastion-protocol-gatekeeper': 'citation-storm'
});
const BOSS_COMPONENT_DURABILITY: Readonly<Record<BossRigId, Readonly<Partial<Record<BossPartId, number>>>>> = Object.freeze({
  'open-orbit': Object.freeze({ 'left-cannon': 5, 'right-cannon': 5 }),
  'citation-storm': Object.freeze({ 'left-cannon': 6, 'right-cannon': 6 }),
  'paywall-siege': Object.freeze({ 'left-cannon': 7, 'right-cannon': 7, helmet: 7 }),
  'crown-claw': Object.freeze({ 'left-cannon': 8, 'right-cannon': 8 })
});
const BOSS_CANNON_HEALTH_RATIO = 0.07;
const BOSS_HELMET_HEALTH_RATIO = 0.18;
export const BOSS_CANNON_SCALE = 1.6;
export const CROWNCLAW_ARM_SCALE = 1.42;
export const BOSS_CANNON_HITBOX_SCALE = 1.12;
export const CROWNCLAW_ARM_HITBOX_SCALE = 1.12;
const BOSS_COMPONENT_WEAK_POINT_MULTIPLIER = 1;
const BOSS_DAMAGE_FLASH_FRAMES = 2;
const BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES = 5;
export const REGULAR_ENEMY_SIZE_SCALE = 1.1;
type PendingBossStrike = {
  bossId: string;
  x: number;
  y: number;
  frames: number;
  warningFrames: number;
};
const CROWNCLAW_STRIKE_MAX_LIFE = 132;
const PAYWALL_BOSS_COMPONENT_LAYOUT: ReadonlyArray<Omit<BossComponentState, 'hp' | 'maxHp' | 'destroyed' | 'exposed' | 'flashFrames' | 'lastDamageFlashFrame'>> = Object.freeze([
  {
    id: 'left-cannon',
    label: 'LEFT CANNON',
    centerXRatio: 0.22,
    centerYRatio: 0.47,
    widthRatio: 0.24,
    heightRatio: 0.34
  },
  {
    id: 'right-cannon',
    label: 'RIGHT CANNON',
    centerXRatio: 0.78,
    centerYRatio: 0.47,
    widthRatio: 0.24,
    heightRatio: 0.34
  },
  {
    id: 'helmet',
    label: 'CORE HELMET',
    centerXRatio: 0.5,
    centerYRatio: 0.32,
    widthRatio: 0.3,
    heightRatio: 0.3
  }
]);
const DEFAULT_POLISH_SETTINGS: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
};

const getGatekeeperBurstInterval = (
  baseInterval: number,
  healthRatio: number,
  cadence: GatekeeperCadenceConfig
) => {
  const normalizedHealth = clamp(healthRatio, 0, 1);
  const slowCadenceRatio = clamp(
    (normalizedHealth - cadence.maxSpeedHealthRatio)
      / (1 - cadence.maxSpeedHealthRatio),
    0,
    1
  );
  const intervalMultiplier = 1
    + ((cadence.startIntervalMultiplier - 1) * slowCadenceRatio);

  return Math.max(baseInterval, Math.round(baseInterval * intervalMultiplier));
};

type CollisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PlayerAfterimage = {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  rotation: number;
  squash: number;
};

type BossWarningType = 'mini1' | 'wall' | 'asteroid' | 'gatekeeper';

type RuntimeSpawnEnemy = {
  enemyId: string;
  spriteKey?: string;
  spriteStyle?: SpriteStyle;
  weight: number;
  health: number;
  speed: number;
  damage: number;
  scoreValue: number;
  powerupDropChance: number;
  rank?: EnemyRank;
  sizeMultiplier?: number;
  attackPatternId?: EnemyAttackPatternId;
  attackIntervalSeconds?: number;
  projectileSpeed?: number;
  burstCount?: number;
  roleId?: string;
};

type RuntimeSpawnEvent = SpawnEvent & {
  id: string;
  startSeconds: number;
  durationSeconds?: number;
  count: number;
  spawnIntervalSeconds: number;
  patternId?: string;
  positionId?: string;
  enemies: RuntimeSpawnEnemy[];
};

type CampaignFormationPackInstanceState = {
  packId: string;
  eventId: string;
  campaignIndex: number;
  targetCount: number;
  spawnedCount: number;
  retired: boolean;
};

type RuntimeBossWeapon = {
  id?: string;
  weaponId?: string;
  attackIntervalSeconds?: number;
  attackFrequencySeconds?: number;
  frequencySeconds?: number;
  damage?: number;
  projectileSpeed?: number;
  burstCount?: number;
};

type RuntimeBossPhase = {
  healthThreshold?: number;
  threshold?: number;
};

type RuntimeBossEvent = BossEvent & {
  id: string;
  startSeconds: number;
  bossId: string;
  spriteKey?: string;
  speed?: number;
  health: number;
  movementPattern?: string;
  contactDamage?: number;
  attackTempoMultiplier?: number;
  scoreReward?: number;
  warningSeconds?: number;
  weapons?: RuntimeBossWeapon[];
  phases?: RuntimeBossPhase[];
};

type RuntimeAsteroidEvent = AsteroidEvent & {
  id: string;
  startSeconds: number;
  count?: number;
  spriteKey?: string;
  speed?: number;
  health?: number;
  contactDamage?: number;
  damage?: number;
  scoreValue?: number;
  powerupDropChance?: number;
  warningSeconds?: number;
};

type RuntimeSupplyDropEvent = SupplyDropEvent & {
  id: string;
  startSeconds: number;
  spriteKey: string;
  presentKind: PresentDropPresentKind;
  health: number;
  speed: number;
  scoreValue: number;
  coinDropValue: number;
};

type RuntimeEncounterEvent = RuntimeBossEvent | RuntimeAsteroidEvent | RuntimeSupplyDropEvent;

type CampaignWaveEntry = {
  level: LevelDefinition;
  wave: WaveDefinition;
  levelIndex: number;
  waveIndex: number;
};

type EnemyRuntimeOverrides = {
  speed?: number;
  health?: number;
  contactDamage?: number;
  projectileDamage?: number;
  scoreValue?: number;
  powerupDropChance?: number;
  spriteUrl?: string;
  spriteFrames?: string[];
  spriteStyle?: SpriteStyle;
  rank?: EnemyRank;
  sizeMultiplier?: number;
  attackPatternId?: EnemyAttackPatternId;
  attackIntervalSeconds?: number;
  projectileSpeed?: number;
  burstCount?: number;
};

export interface GameEngineOptions {
  campaign?: GameCampaign;
  previewMode?: boolean;
  /** Preview ships are invulnerable by default; disable for damage/death testing. */
  previewInvincible?: boolean;
  /** Preview-only resource override. Production bombs always use their real inventory. */
  previewUnlimitedBombs?: boolean;
  /** Preview-only resource override. Production ship abilities keep their real cooldown. */
  previewShipAbilityNoCooldown?: boolean;
  audioEnabled?: boolean;
  playerShipUrl?: string;
  playerShipId?: PlayerShipId;
  initialLevelId?: string;
  initialWaveId?: string;
  testMode?: boolean;
  squadLoadout?: RuntimeSquadLoadout;
  /** Fixed seed used by preview and deterministic tests. Production omits this. */
  randomSeed?: GameplayRandomSeed;
  /** Optional injectable source for focused simulation tests. */
  gameplayRandom?: GameplayRandom;
  /** Optional bounded local sink. No product or network analytics are emitted. */
  telemetrySink?: GameplayTelemetrySink;
  /** Preview-only alpha silhouette bound to the exact selected boss event. */
  previewBossCollisionMask?: BossCollisionMask;
  previewBossCollisionEventId?: string;
  /** Registered modular-art bounds used to prevent preview-only sprite distortion. */
  previewBossArtworkDesignSize?: BossPreviewArtworkDesignSize;
  /** Preview-only normalized anatomy points bound to the selected boss event. */
  previewBossWeaponSockets?: BossWeaponSocketProfile;
  /** Preview-only posed anatomy sampler shared with the modular Pixi rig. */
  previewBossWeaponSocketPoseSampler?: BossWeaponSocketPoseSampler;
  /** Keeps simulation socket poses aligned with the renderer accessibility pose. */
  previewBossReducedMotion?: boolean;
  previewBossWeaponSocketEventId?: string;
  /** Preview-only semantic projectile roles supplied by the selected artwork. */
  previewBossProjectileVisualKinds?: readonly BossModularProjectileVisualKind[];
}

export interface PreviewPlayerLoadoutUpdate {
  playerShipId: PlayerShipId;
  playerShipUrl?: string;
  squadLoadout?: RuntimeSquadLoadout;
}

export interface SquadCompanionVisual {
  slot: SquadSlotId;
  id: string;
  frames: [string, string, string];
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  scale: number;
}

type ActiveSquadCompanion = RuntimeSquadCompanion & {
  x: number;
  y: number;
  frameIndex: number;
  fireTimer: number;
  shotSequence: number;
  entryProgress: number;
};
type PendingEnemyLaser = {
  sourceId: string;
  telegraphId: string;
  axis: 'vertical' | 'horizontal';
  coordinate: number;
  damage: number;
  frames: number;
  warningFrames: number;
  /** Preview-triggered boss lanes remain valid without marking the boss elite. */
  requireEliteSource: boolean;
};

export type StageTakeoffPhase = 'idle' | 'hold' | 'lift' | 'launch';

export interface StageTakeoffPresentation {
  phase: StageTakeoffPhase;
  progress: number;
  phaseProgress: number;
  travel: number;
  thrustStrength: number;
  scale: number;
}

export interface StageTakeoffPose {
  x: number;
  y: number;
  scale: number;
}

type SquadCompanionFormationState = {
  slot: 'left' | 'right';
  x: number;
  y: number;
  frameIndex: number;
  entryProgress: number;
};

export interface GameRuntimeState {
  levelId: string;
  levelName: string;
  levelNumber: number;
  levelTotal: number;
  waveId: string;
  waveName: string;
  waveAccent: string;
  waveNumber: number;
  waveTotal: number;
  wavePresentationRevision: number;
  wavePresentationKind: 'mission' | 'internal-wave';
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  bossActive: boolean;
  damageTaken: number;
  complete: boolean;
  campaignComplete: boolean;
  stageDepartureProgress: number;
  stageDepartureSpeedBoost: number;
  stageHyperspeedActive: boolean;
  stageHyperspeedStrength: number;
}

export interface PresentDropDestroyedCounts {
  standard: number;
  armored: number;
  fast: number;
  golden: number;
}

export interface PresentDropVictoryStats {
  destroyed: PresentDropDestroyedCounts;
  destroyedTotal: number;
  /** Provisional coin entities released by destroyed presents, not coins collected. */
  coinValueSpawned: number;
}

export interface WaveVictorySummary {
  id: string;
  campaignId: string;
  campaignRevision: number;
  levelId: string;
  waveId: string;
  waveNumber: number;
  waveTotal: number;
  stageComplete: boolean;
  bossEncounterId: string | null;
  stage: number;
  stageName: string;
  finalWaveName: string;
  scoreEarned: number;
  totalScore: number;
  enemiesDefeated: number;
  /** Runtime-observed standard enemy deaths; never reconstructed from authored node metadata. */
  regularEnemyKills: number;
  /** Runtime-observed deaths for Campaign spawns authored with rank `elite`. */
  eliteKills: number;
  /** Runtime-observed mini-boss encounters cleared during this result window. */
  miniBossKills: number;
  /** Runtime-observed major-boss encounters cleared during this result window. */
  majorBossKills: number;
  coinsCollected: number;
  /** Coins picked up during only the tactical Wave represented by this result. */
  waveCoinsCollected: number;
  damageTaken: number;
  elapsedSeconds: number;
  remainingLives: number;
  nextLevelId: string | null;
  nextWaveId: string | null;
  nextWaveNumber: number | null;
  nextStage: number;
  hasNextStage: boolean;
  campaignComplete: boolean;
  /** Present only for authored Present Drop bonus waves. */
  presentDrop?: PresentDropVictoryStats;
}

export interface WaveVictoryRewardTotals {
  score: number;
  totalCoins: number;
}

/**
 * Refreshes only the reward-window metrics that can change after the logical
 * clear boundary. Attempt identity and authored outcome fields intentionally
 * come from the captured summary so a late coin pickup cannot create a second
 * completion or mutate which Mission/Wave was cleared.
 */
export const refreshWaveVictoryRewardMetrics = (
  summary: WaveVictorySummary,
  totals: WaveVictoryRewardTotals,
  stageScoreStart: number,
  stageCoinStart: number,
  tacticalCoinStart: number
): WaveVictorySummary => ({
  ...summary,
  scoreEarned: Math.max(0, totals.score - stageScoreStart),
  totalScore: Math.max(0, totals.score),
  coinsCollected: Math.max(0, totals.totalCoins - stageCoinStart),
  waveCoinsCollected: Math.max(0, totals.totalCoins - tacticalCoinStart)
});

const createPresentDropDestroyedCounts = (): PresentDropDestroyedCounts => ({
  standard: 0,
  armored: 0,
  fast: 0,
  golden: 0
});

const subtractPresentDropDestroyedCounts = (
  total: PresentDropDestroyedCounts,
  baseline: PresentDropDestroyedCounts
): PresentDropDestroyedCounts => ({
  standard: Math.max(0, total.standard - baseline.standard),
  armored: Math.max(0, total.armored - baseline.armored),
  fast: Math.max(0, total.fast - baseline.fast),
  golden: Math.max(0, total.golden - baseline.golden)
});

const getPresentDropDestroyedTotal = (counts: PresentDropDestroyedCounts) => (
  counts.standard + counts.armored + counts.fast + counts.golden
);

interface WaveVictoryKillCounts {
  regularEnemyKills: number;
  eliteKills: number;
  miniBossKills: number;
  majorBossKills: number;
}

const createWaveVictoryKillCounts = (): WaveVictoryKillCounts => ({
  regularEnemyKills: 0,
  eliteKills: 0,
  miniBossKills: 0,
  majorBossKills: 0
});

const subtractWaveVictoryKillCounts = (
  total: WaveVictoryKillCounts,
  baseline: WaveVictoryKillCounts
): WaveVictoryKillCounts => ({
  regularEnemyKills: Math.max(0, total.regularEnemyKills - baseline.regularEnemyKills),
  eliteKills: Math.max(0, total.eliteKills - baseline.eliteKills),
  miniBossKills: Math.max(0, total.miniBossKills - baseline.miniBossKills),
  majorBossKills: Math.max(0, total.majorBossKills - baseline.majorBossKills)
});

export interface GameEditorEntitySnapshot {
  readonly id: string;
  readonly sourceEventId: string;
  readonly sourceItemId: string | null;
  readonly type: EntityType;
  /** Normalized canvas bounds. Values may extend slightly outside 0..1 while entering. */
  readonly bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Normalized simulation hitbox, independent from the visual sprite bounds. */
  readonly collisionBounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface GameEditorSnapshot {
  readonly viewport: Readonly<{
    width: number;
    height: number;
  }>;
  readonly entities: ReadonlyArray<Readonly<GameEditorEntitySnapshot>>;
}

export interface GameEngineDebugSnapshot {
  readonly runtime: Readonly<GameRuntimeState>;
  readonly difficultyMultiplier: number;
  readonly waveProgressFrames: number;
  readonly configuredSpawnCounts: Readonly<Record<string, number>>;
  readonly campaignLab: Readonly<{
    combatBudget: number;
    threatCap: number;
    authoredThreatSpent: number;
    activeThreatCost: number;
    activePerformanceCost: number;
    mobilePerformanceBudget: number;
    formationPackIds: readonly string[];
    formationPackCost: number;
    enemyRoleIds: readonly string[];
    activeFormationIds: readonly string[];
    projectileCount: number;
    peakProjectileCount: number;
    activeFiringEnemies: number;
    clearTimeSeconds: number;
    damageReceived: number;
    coinsEarned: number;
    playerDps: number;
    averageEnemyTimeToKillSeconds: number;
    performanceMode: boolean;
    heavySceneLoad: boolean;
    mobileProfile: boolean;
  }>;
  readonly entities: ReadonlyArray<Readonly<{
    id: string;
    type: EntityType;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    formation: EnemyFormationMode | null;
    formationState: EnemyFormationState | null;
    formationIndex: number;
    formationGroupSize: number;
    damage: number;
    contactDamage: number;
    projectileDamage: number;
    projectileSpeed: number | null;
    scoreValue: number | null;
    powerupDropChance: number | null;
    attackIntervalFrames: number | null;
    spriteUrl: string | null;
    spriteStyle: Readonly<SpriteStyle> | null;
    bossId: string | null;
    roleId: string | null;
    gameplayRole: EnemyGameplayRole | null;
    durabilityClass: EnemyDurabilityClass | null;
    fireBehavior: EnemyRoleDefinition['fireBehavior'] | null;
    fireDelaySeconds: number;
    formationFiringBehavior: FormationPackDefinition['firingBehavior'] | null;
    threatCost: number;
    performanceCost: number;
    gatekeeperPrime: Readonly<{
      combatFrame: number;
      phaseId: GatekeeperPrimePhaseId | null;
      attackId: GatekeeperPrimeAttackId | null;
      attackStage: GatekeeperPrimeAttackStage | null;
      patrolBounds: Readonly<{
        minimumX: number;
        maximumX: number;
        minimumY: number;
        maximumY: number;
      }>;
    }> | null;
  }>>;
}

const WAVE_SECTORS = [
  { name: 'OPEN ORBIT', accent: '#67e8f9' },
  { name: 'CITATION STORM', accent: '#c4b5fd' },
  { name: 'PAYWALL SIEGE', accent: '#fde68a' },
  { name: 'OPEN GALAXY', accent: '#6ee7b7' },
  { name: 'BASTION PROTOCOL', accent: '#f9a8d4' }
];

const PLAYER_SHIP_SCALE = 0.95;
const PAYWALL_INTERCEPTOR_SCALE = 1.1;
const SPIRAL_PAYWALL_INTERCEPTOR_SCALE = 1.05;
const CITATION_WRAITH_SCALE = 1.32;
const BOSS_SHIELD_ESCORT_MOBILE_SIZE = Object.freeze({ width: 48, height: 42 });
const BOSS_SHIELD_ESCORT_DESKTOP_SIZE = Object.freeze({ width: 54, height: 48 });
const getBossShieldEscortHp = (wave: number) => Math.min(8, Math.max(2, Math.round(wave)));
const MAIN_BOSS_ALERT_FRAMES = 120;
export const STAGE_TAKEOFF_FRAMES = 180;
export const STAGE_TAKEOFF_HOLD_FRAMES = 24;
export const STAGE_TAKEOFF_LIFT_FRAMES = 30;
export const STAGE_TAKEOFF_LAUNCH_FRAMES = 126;
export const STAGE_TAKEOFF_TRAVEL_EXPONENT = 1.75;
export const STAGE_TAKEOFF_EXIT_START = 0.42;
const STAGE_TAKEOFF_PARTICLE_CUTOFF_FRAMES = 10;
const MOBILE_TAKEOFF_PARTICLE_CAP = 48;
const DESKTOP_TAKEOFF_PARTICLE_CAP = 80;
const MOBILE_TAKEOFF_PARTICLES_PER_FRAME = 2;
const DESKTOP_TAKEOFF_PARTICLES_PER_FRAME = 4;
export const INTERNAL_WAVE_LOOSE_ENTRY_COUNT = 2;
export const INTERNAL_WAVE_LOOSE_ENTRY_INTERVAL_FRAMES = 18;
export const INTERNAL_WAVE_LOOSE_ENTRY_WINDOW_FRAMES = 72;
export const WAVE_CONTINUITY_LOOSE_ENEMY_INTERVAL_FRAMES = 90;
export const WAVE_CONTINUITY_END_BUFFER_FRAMES = 75;
export const WAVE_CONTINUITY_MAX_LOOSE_ENEMIES = 16;
export const getWaveContinuityLooseEnemyCap = (durationFrames: number) => Math.min(
  WAVE_CONTINUITY_MAX_LOOSE_ENEMIES,
  Math.max(
    0,
    Math.ceil(
      (Math.max(0, durationFrames) - WAVE_CONTINUITY_END_BUFFER_FRAMES)
      / WAVE_CONTINUITY_LOOSE_ENEMY_INTERVAL_FRAMES
    )
  )
);
export const STAGE_BOUNDARY_CLEAR_ENTITY_TYPES = Object.freeze([
  'ENEMY_DRONE',
  'ENEMY_JOURNAL',
  'ENEMY_BRICK',
  'ENEMY_SWARM',
  'ENEMY_INVADER',
  'SUPPLY_DROP',
  'BOSS',
  'MINI_BOSS',
  'PROJECTILE',
  'MISSILE',
  'PARTICLE',
  'EFFECT',
  'POWERUP',
  'COIN',
  'BOMB'
] as const);

export const shouldClearStageBoundaryEntityType = (
  entityType: EntityType,
  preserveRewardWindow: boolean = false
) => (
  !(
    preserveRewardWindow
    && (
      entityType === 'COIN'
      || entityType === 'PARTICLE'
      || entityType === 'EFFECT'
      || entityType === 'PROJECTILE'
      || entityType === 'MISSILE'
    )
  )
  && (STAGE_BOUNDARY_CLEAR_ENTITY_TYPES as readonly string[]).includes(entityType)
);

export const shouldKeepInternalWaveEntity = (
  entityType: EntityType,
  isPlayerShot: boolean = false
) => (
  entityType === EntityType.PLAYER
  || entityType === EntityType.PARTICLE
  || entityType === EntityType.EFFECT
  || entityType === EntityType.POWERUP
  || entityType === EntityType.COIN
  || entityType === EntityType.BOMB
  || (
    isPlayerShot
    && (entityType === EntityType.PROJECTILE || entityType === EntityType.MISSILE)
  )
);

type StageCompletionProjectileMotion = {
  markedForDeletion: boolean;
  isBeam?: boolean;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
};

/**
 * Advances already-fired shots during the non-combat reward window. Collision
 * resolution and fresh attacks stay disabled by the reward-phase update path;
 * this helper only lets existing visuals finish and leave the viewport.
 */
export const advanceStageCompletionProjectile = (
  entity: StageCompletionProjectileMotion,
  viewportWidth: number,
  viewportHeight: number
) => {
  if (entity.markedForDeletion) return;

  if (entity.isBeam) {
    entity.life--;
    if (entity.life <= 0) entity.markedForDeletion = true;
    return;
  }

  entity.x += entity.vx;
  entity.y += entity.vy;
  if (
    entity.x < -entity.width - 80
    || entity.x > viewportWidth + 80
    || entity.y < -entity.height - 80
    || entity.y > viewportHeight + 80
  ) {
    entity.markedForDeletion = true;
  }
};

const getTakeoffPhaseProgress = (ageFrames: number, phaseStart: number, phaseFrames: number) => {
  const denominator = Math.max(1, phaseFrames - 1);
  return Math.max(0, Math.min(1, (ageFrames - phaseStart) / denominator));
};

export const getStageTakeoffPresentation = (
  remainingFrames: number,
  durationFrames: number = STAGE_TAKEOFF_FRAMES
): StageTakeoffPresentation => {
  const duration = Math.max(1, Math.floor(Number(durationFrames) || STAGE_TAKEOFF_FRAMES));
  const remaining = Math.max(0, Math.min(duration, Math.floor(Number(remainingFrames) || 0)));
  if (remaining <= 0) {
    return {
      phase: 'idle',
      progress: 0,
      phaseProgress: 0,
      travel: 0,
      thrustStrength: 0,
      scale: 1
    };
  }

  const age = duration - remaining;
  const progress = Math.max(0, Math.min(1, age / Math.max(1, duration - 1)));
  if (age < STAGE_TAKEOFF_HOLD_FRAMES) {
    const phaseProgress = getTakeoffPhaseProgress(age, 0, STAGE_TAKEOFF_HOLD_FRAMES);
    return {
      phase: 'hold',
      progress,
      phaseProgress,
      travel: 0,
      thrustStrength: 0.28 + phaseProgress * 0.3,
      scale: 1 - phaseProgress * 0.02
    };
  }

  const liftStart = STAGE_TAKEOFF_HOLD_FRAMES;
  if (age < liftStart + STAGE_TAKEOFF_LIFT_FRAMES) {
    const phaseProgress = getTakeoffPhaseProgress(age, liftStart, STAGE_TAKEOFF_LIFT_FRAMES);
    return {
      phase: 'lift',
      progress,
      phaseProgress,
      travel: 0,
      thrustStrength: 0.58 + phaseProgress * 0.2,
      scale: 0.98 + phaseProgress * 0.04
    };
  }

  const launchStart = liftStart + STAGE_TAKEOFF_LIFT_FRAMES;
  const phaseProgress = getTakeoffPhaseProgress(age, launchStart, STAGE_TAKEOFF_LAUNCH_FRAMES);
  const travel = Math.pow(phaseProgress, STAGE_TAKEOFF_TRAVEL_EXPONENT);
  return {
    phase: 'launch',
    progress,
    phaseProgress,
    travel,
    thrustStrength: 0.78 + phaseProgress * 0.22,
    scale: 1.02 - travel * 0.1
  };
};

export const getStageTakeoffPose = (
  presentation: StageTakeoffPresentation,
  startX: number,
  startY: number,
  homeX: number,
  homeY: number,
  viewportHeight: number
): StageTakeoffPose => {
  const liftDistance = Math.max(1, viewportHeight * 0.04);
  if (presentation.phase === 'hold') {
    const inverse = 1 - Math.max(0, Math.min(1, presentation.phaseProgress));
    const homeProgress = 1 - inverse * inverse * inverse;
    return {
      x: startX + (homeX - startX) * homeProgress,
      y: startY + (homeY - startY) * homeProgress,
      scale: presentation.scale
    };
  }

  if (presentation.phase === 'lift') {
    const phaseProgress = Math.max(0, Math.min(1, presentation.phaseProgress));
    const liftProgress = phaseProgress < 0.5
      ? 4 * phaseProgress * phaseProgress * phaseProgress
      : 1 - Math.pow(-2 * phaseProgress + 2, 3) / 2;
    return {
      x: homeX,
      y: homeY - liftDistance * liftProgress,
      scale: presentation.scale
    };
  }

  if (presentation.phase === 'launch') {
    const exitProgress = Math.max(
      0,
      Math.min(1, (presentation.phaseProgress - STAGE_TAKEOFF_EXIT_START) / (1 - STAGE_TAKEOFF_EXIT_START))
    );
    const exitDistance = viewportHeight * 1.16;
    return {
      x: homeX,
      y: homeY - liftDistance - exitDistance * exitProgress * exitProgress,
      scale: presentation.scale
    };
  }

  return { x: homeX, y: homeY, scale: 1 };
};

export const getSquadCompanionFormationTarget = (
  playerX: number,
  playerY: number,
  playerWidth: number,
  playerHeight: number,
  slot: 'left' | 'right',
  index: number,
  distanceScale: number = 1
) => {
  const centerX = playerX + playerWidth / 2;
  const centerY = playerY + playerHeight / 2;
  const formationDistance = Math.max(58, Math.min(82, playerWidth * 0.62));
  const safeDistanceScale = Math.max(0, Math.min(1, distanceScale));
  return {
    x: centerX + (slot === 'left' ? -1 : 1) * formationDistance * safeDistanceScale,
    y: centerY + playerHeight * (0.14 + index * 0.02)
  };
};

export const resetSquadCompanionFormation = <T extends SquadCompanionFormationState>(
  companions: T[],
  playerX: number,
  playerY: number,
  playerWidth: number,
  playerHeight: number
) => {
  companions.forEach((companion, index) => {
    const target = getSquadCompanionFormationTarget(
      playerX,
      playerY,
      playerWidth,
      playerHeight,
      companion.slot,
      index
    );
    companion.x = target.x;
    companion.y = target.y;
    companion.frameIndex = 0;
    companion.entryProgress = 0;
  });
};
const PLAYER_RAM_COOLDOWN_FRAMES = 14;
const PREVIEW_PLAYER_HIT_FEEDBACK_COOLDOWN_FRAMES = 18;
const MINI_BOSS_LAB_REINFORCEMENT_DEPLOY_FRAMES = 18;
const MINI_BOSS_LAB_REINFORCEMENT_ACTIVATION_FRAMES = 12;

interface PreviewBossAttackLoopState {
  readonly eventId: string;
  readonly attackId: string;
  readonly phaseId: string;
  readonly startFrame: number;
  readonly endFrame: number;
}

interface MiniBossLabPendingProjectile {
  readonly fireFrame: number;
  readonly ownerEntityId: string;
  readonly eventId: string;
  readonly originX: number;
  readonly originY: number;
  readonly angleRadians: number;
  readonly speed: number;
  readonly size: number;
  readonly damage: number;
  readonly color: string;
  readonly frames: readonly string[];
  readonly variant: number;
}

interface MiniBossLabEngineState {
  readonly encounterId: MiniBossEncounterId;
  readonly eventId: string;
  startFrame: number;
  lastUpdateFrame: number;
  lastSampleFrame: number;
  readonly memberEntityIds: Map<string, string>;
  readonly destroyedMemberIds: Set<string>;
  readonly emittedHazardIds: Set<string>;
  readonly hitUntilFrameByMemberId: Map<string, number>;
  readonly pendingProjectiles: MiniBossLabPendingProjectile[];
  reinforcementsSpawned: number;
  signatureLoop: boolean;
  supportStartFrame: number | null;
  shieldOverride: boolean | null;
  wallSide: 'left' | 'right' | null;
  defeatStartFrame: number | null;
  completionTriggered: boolean;
  completionFrame: number | null;
  rewardScore: number;
  powerupDropChance: number;
  victoryRewarded: boolean;
  activeStage: MiniBossEncounterStage;
}

export class GameEngine {
  width: number = 0;
  height: number = 0;
  player: Entity;
  entities: Entity[] = [];
  bgEntities: BackgroundEntity[] = [];
  stars: Star[] = [];
  stats: Stats;
  keys: Record<string, boolean> = {};
  touchPos: { x: number, y: number } | null = null;
  wave: number = 1;
  frameCount: number = 0;
  bgY: number = 0;
  gameActive: boolean = false;
  cinematicPaused: boolean = false;
  lives: number = GAME_CONFIG.PLAYER_LIVES;
  invincibleTimer: number = 0;
  activePowerups: Map<PowerupType, number> = new Map();
  bossRef: Entity | null = null;
  miniBossRef: Entity | null = null;
  spawnedMiniBoss1: boolean = false;
  spawnedWallBoss: boolean = false;
  mainBossDefeated: boolean = false;
  asteroidBeltMaxCount: number = 0;
  invaderDirection: number = 1;
  invaderMoveTimer: number = 0;
  waveProgressFrames: number = 0;
  inBossWarningSequence: boolean = false;
  bossWarningFrame: number = 0;
  bossWarningDuration: number = 0;
  pendingBossType: BossWarningType | null = null;
  waveTransitionPending: boolean = false;
  internalWaveLooseEntriesRemaining: number = 0;
  missileTimer: number = 0;
  playerVel = { x: 0, y: 0 };
  playerTilt: number = 0;
  playerSquash: number = 0;
  playerSquashVelocity: number = 0;
  playerAfterimages: PlayerAfterimage[] = [];
  shakeStrength: number = 0;
  shakeX: number = 0;
  shakeY: number = 0;
  flashAlpha: number = 0;
  hitStopFrames: number = 0;
  coinCombo: number = 0;
  coinComboTimer: number = 0;
  lastShotFrame: number = -999;
  lastPrimaryImpactShakeFrame: number = -999;
  bioBeamCanvasVisualStartFrame: number = -1;
  lastBombFrame: number = -999;
  lastPlayerRamFrame: number = -999;
  lastPreviewPlayerHitFeedbackFrame: number = -999;
  introFlightFrames: number = 0;
  introFlightDuration: number = 150;
  waveDepartureFrames: number = 0;
  waveDepartureDuration: number = STAGE_TAKEOFF_FRAMES;
  stageRewardCollectionFrames: number = 0;
  stageRewardCollectionDuration: number = 0;
  stageTakeoffStartX: number = 0;
  stageTakeoffStartY: number = 0;
  stageTakeoffBoostCuePlayed: boolean = false;
  wavePresentationRevision: number = 0;
  wavePresentationKind: GameRuntimeState['wavePresentationKind'] = 'mission';
  waveVictoryReady: boolean = false;
  waveVictorySummary: WaveVictorySummary | null = null;
  waveStartScore: number = 0;
  waveStartEnemiesDefeated: number = 0;
  waveVictoryKillCounts: WaveVictoryKillCounts = createWaveVictoryKillCounts();
  waveStartVictoryKillCounts: WaveVictoryKillCounts = createWaveVictoryKillCounts();
  tacticalWaveStartVictoryKillCounts: WaveVictoryKillCounts = createWaveVictoryKillCounts();
  creditedMiniBossEncounterIds: Set<string> = new Set();
  creditedMajorBossEncounterIds: Set<string> = new Set();
  waveStartTotalCoins: number = 0;
  waveDamageTaken: number = 0;
  waveFlightFrames: number = 0;
  presentDropDestroyed: PresentDropDestroyedCounts = createPresentDropDestroyedCounts();
  presentDropCoinValueSpawned: number = 0;
  presentDropStageActive: boolean = false;
  presentDropCueShown: boolean = false;
  tacticalWaveStartScore: number = 0;
  tacticalWaveStartEnemiesDefeated: number = 0;
  tacticalWaveStartTotalCoins: number = 0;
  tacticalWaveDamageTaken: number = 0;
  tacticalWaveFlightFrames: number = 0;
  tacticalPresentDropDestroyedStart: PresentDropDestroyedCounts = createPresentDropDestroyedCounts();
  tacticalPresentDropCoinValueSpawnedStart: number = 0;
  presentDropWaveActive: boolean = false;
  deathSequenceFrames: number = 0;
  deathSequenceDuration: number = 88;
  deathSequenceStartedAtMs: number = 0;
  deathSequenceMaxDurationMs: number = 2200;
  playerDrawScale: number = 1;
  playerDrawAlpha: number = 1;
  sectorTint: number = 0;
  isBombResolving: boolean = false;
  collisionBoxes: Map<Entity, CollisionBox> = new Map();
  enemyTargetsBuffer: Entity[] = [];
  playerShotsBuffer: Entity[] = [];
  homingTargetsBuffer: Entity[] = [];
  enemyCollisionColumns: Entity[][] = [];
  invaderDrawBuffer: Entity[] = [];
  pendingPlayerShots: PendingPlayerShot[] = [];
  livePlayerShotCount: number = 0;
  liveParticleCount: number = 0;
  liveEffectCount: number = 0;
  liveThreatCount: number = 0;
  authoredWaveThreatSpent: number = 0;
  wavePlayerDamageDealt: number = 0;
  waveEnemyTimeToKillFrames: number = 0;
  waveEnemyKillsMeasured: number = 0;
  peakProjectileCount: number = 0;
  weaponVolley: number = 0;
  announcedFireRateLevel: number = 0;
  playerFireCooldownFrames: number = 0;
  mobileProfile: boolean = false;
  polishSettings: GamePolishSettings = { ...DEFAULT_POLISH_SETTINGS };
  performanceMode: boolean = false;
  heavySceneLoad: boolean = false;
  campaign: GameCampaign;
  bombSpriteUrl: string = DEFAULT_BOMB_SPRITE_URL;
  playerShipUrl: string = ASSETS.PLAYER_SHIP;
  playerShipId: PlayerShipId = 'researchhub';
  campaignWaves: CampaignWaveEntry[] = [];
  currentCampaignIndex: number = 0;
  previewMode: boolean = false;
  previewInvincible: boolean = true;
  previewUnlimitedBombs: boolean = false;
  previewShipAbilityNoCooldown: boolean = false;
  /** Authoring-only visibility toggle consumed by Pixi compact entity bars. */
  compactMiniBossHealthBarsVisible: boolean = true;
  audioEnabled: boolean = true;
  previewComplete: boolean = false;
  configuredEncounterIds: Set<string> = new Set();
  configuredSpawnCounts: Map<string, number> = new Map();
  configuredSpawnFrames: Map<string, number> = new Map();
  campaignFormationPackInstances: Map<string, CampaignFormationPackInstanceState> = new Map();
  campaignFormationPackLastRetiredFrames: Map<string, number> = new Map();
  escalationWarningsShown: Set<string> = new Set();
  pendingBossStrikes: PendingBossStrike[] = [];
  pendingEnemyLasers: PendingEnemyLaser[] = [];
  pendingConfiguredEncounter: RuntimeEncounterEvent | null = null;
  initialLevelId?: string;
  initialWaveId?: string;
  testMode: boolean = false;
  campaignComplete: boolean = false;
  private gameplayRandom: GameplayRandom;
  private gameplayRandomSeed: number;
  private readonly telemetrySink?: GameplayTelemetrySink;
  private telemetrySessionActive: boolean = false;
  private telemetryWaveKey: string | null = null;
  private readonly telemetryCompletedWaveKeys: Set<string> = new Set();
  private readonly telemetryBossPhaseByEntityId: Map<string, number> = new Map();
  private squadLoadout: RuntimeSquadLoadout | null;
  private readonly squadCompanions: ActiveSquadCompanion[];
  private readonly startingLives: number;
  private readonly previewBossCollisionMask?: BossCollisionMask;
  private readonly previewBossCollisionEventId?: string;
  private readonly previewBossArtworkDesignSize?: BossPreviewArtworkDesignSize;
  private readonly previewBossWeaponSockets?: BossWeaponSocketProfile;
  private readonly previewBossWeaponSocketPoseSampler?: BossWeaponSocketPoseSampler;
  private readonly previewBossReducedMotion: boolean;
  private readonly previewBossWeaponSocketEventId?: string;
  private readonly previewBossProjectileVisualKinds: ReadonlySet<BossModularProjectileVisualKind>;
  private previewBossAttackLoop: PreviewBossAttackLoopState | null = null;
  private readonly miniBossLabEncounters = new Map<string, MiniBossLabEngineState>();
  /**
   * Fight-local Boss Sandbox health locks. Object identity deliberately makes
   * every restart/new spawn begin unlocked without touching authored content.
   */
  private readonly previewInvincibleBossHulls = new WeakSet<Entity>();
  private readonly previewInvincibleBossComponents = new WeakSet<BossComponentState>();

  constructor(stats: Stats, options: GameEngineOptions = {}) {
    this.stats = stats;
    this.gameplayRandom = options.gameplayRandom ?? createGameplayRandom(options.randomSeed);
    this.gameplayRandomSeed = this.gameplayRandom.seed;
    this.telemetrySink = options.telemetrySink;
    this.stats.shipAbilityCooldown = Math.max(0, Number(this.stats.shipAbilityCooldown) || 0);
    this.playerShipId = options.playerShipId ?? 'researchhub';
    this.stats.shipAbilityCooldownMax = getShipAbilityDefinition(this.playerShipId).cooldownFrames;
    this.campaign = cloneGameCampaign(options.campaign ?? DEFAULT_GAME_CAMPAIGN);
    this.bombSpriteUrl = getPrimaryAssetPath(this.campaign.hudAssets.bombIconAssetKey);
    this.playerShipUrl = options.playerShipUrl || ASSETS.PLAYER_SHIP;
    loadImage(this.bombSpriteUrl);
    loadImage(this.playerShipUrl);
    this.campaignWaves = this.buildCampaignWaveEntries(this.campaign);
    this.previewMode = options.previewMode ?? false;
    this.previewBossCollisionMask = options.previewBossCollisionMask;
    this.previewBossCollisionEventId = options.previewBossCollisionEventId;
    this.previewBossArtworkDesignSize = options.previewBossArtworkDesignSize
      ? Object.freeze({
          width: options.previewBossArtworkDesignSize.width,
          height: options.previewBossArtworkDesignSize.height
        })
      : undefined;
    this.previewBossWeaponSockets = options.previewBossWeaponSockets;
    this.previewBossWeaponSocketPoseSampler =
      options.previewBossWeaponSocketPoseSampler;
    this.previewBossReducedMotion = Boolean(options.previewBossReducedMotion);
    this.previewBossWeaponSocketEventId = options.previewBossWeaponSocketEventId;
    this.previewBossProjectileVisualKinds = new Set(
      options.previewBossProjectileVisualKinds ?? []
    );
    this.previewUnlimitedBombs = this.previewMode && Boolean(options.previewUnlimitedBombs);
    this.previewShipAbilityNoCooldown =
      this.previewMode && Boolean(options.previewShipAbilityNoCooldown);
    this.audioEnabled = options.audioEnabled ?? !this.previewMode;
    this.initialLevelId = options.initialLevelId;
    this.initialWaveId = options.initialWaveId;
    this.testMode = Boolean(options.testMode);
    this.squadLoadout = options.squadLoadout ?? null;
    this.squadCompanions = (options.squadLoadout?.companions ?? []).map((companion, index) => ({
      ...companion,
      x: 0,
      y: 0,
      frameIndex: 0,
      fireTimer: Math.max(8, Math.floor(companion.fireIntervalFrames * (0.42 + index * 0.18))),
      shotSequence: 0,
      entryProgress: 0
    }));
    this.startingLives = clamp(
      Math.floor(Number(stats.lives) || GAME_CONFIG.PLAYER_LIVES),
      1,
      GAME_CONFIG.MAX_LIVES
    );
    const initialIndex = this.findCampaignWaveIndex(options.initialLevelId, options.initialWaveId);
    this.currentCampaignIndex = initialIndex >= 0 ? initialIndex : 0;
    this.previewInvincible = options.previewInvincible ?? true;
    this.player = new Entity(EntityType.PLAYER, 0, 0, 0.5);
    this.player.width = Math.round(128 * PLAYER_SHIP_SCALE);
    this.player.height = Math.round(128 * PLAYER_SHIP_SCALE);

    GAMEPLAY_ASSET_URLS.forEach(loadImage);
  }

  private createEntity(type: EntityType, x: number, y: number) {
    return new Entity(type, x, y, this.gameplayRandom.next());
  }

  private nextGameplayRandom() {
    return this.gameplayRandom.next();
  }

  private gameplayRandomRange(min: number, max: number) {
    return this.gameplayRandom.range(min, max);
  }

  getGameplayRandomSeed() {
    return this.gameplayRandom.seed;
  }

  setGameplayRandomSeed(seed: GameplayRandomSeed) {
    this.gameplayRandom = createGameplayRandom(seed);
    this.gameplayRandomSeed = this.gameplayRandom.seed;
    return this.gameplayRandom.seed;
  }

  private getTelemetryContext() {
    const entry = this.getCurrentCampaignEntry();
    return {
      frame: this.frameCount,
      elapsedSeconds: this.getWaveElapsedSeconds(),
      levelId: entry?.level.id ?? `level-${Math.max(1, this.wave)}`,
      waveId: entry?.wave.id ?? `wave-${Math.max(1, this.wave)}`
    };
  }

  private startTelemetrySession() {
    if (!this.telemetrySink) return;
    if (this.telemetrySessionActive) this.stopTelemetrySession('restart');
    this.telemetrySessionActive = true;
    this.telemetryWaveKey = null;
    this.telemetryCompletedWaveKeys.clear();
    this.telemetryBossPhaseByEntityId.clear();
    this.telemetrySink.record({
      ...this.getTelemetryContext(),
      type: 'session-start',
      seed: this.gameplayRandom.seed,
      viewportWidth: Math.max(1, this.width),
      viewportHeight: Math.max(1, this.height)
    });
  }

  stopTelemetrySession(reason: GameplayTelemetrySessionEndReason = 'disposed') {
    if (!this.telemetrySink || !this.telemetrySessionActive) return;
    this.telemetrySink.record({
      ...this.getTelemetryContext(),
      type: 'session-end',
      reason
    });
    this.telemetrySessionActive = false;
  }

  private recordWaveStart() {
    if (!this.telemetrySink || !this.telemetrySessionActive) return;
    const entry = this.getCurrentCampaignEntry();
    const context = this.getTelemetryContext();
    const waveKey = `${context.levelId}:${context.waveId}`;
    if (this.telemetryWaveKey === waveKey) return;
    this.telemetryWaveKey = waveKey;
    this.telemetrySink.record({
      ...context,
      type: 'wave-start',
      levelNumber: Math.max(1, (entry?.levelIndex ?? 0) + 1),
      waveNumber: Math.max(1, (entry?.waveIndex ?? 0) + 1)
    });
  }

  private recordWaveCompletion() {
    if (!this.telemetrySink || !this.telemetrySessionActive) return;
    const context = this.getTelemetryContext();
    const waveKey = `${context.levelId}:${context.waveId}`;
    if (this.telemetryCompletedWaveKeys.has(waveKey)) return;
    this.telemetryCompletedWaveKeys.add(waveKey);
    this.telemetrySink.record({
      ...context,
      type: 'completion',
      scope: 'wave',
      score: Math.max(0, this.stats.score)
    });
  }

  private recordCompletion(scope: 'mission' | 'campaign' | 'preview') {
    if (!this.telemetrySink || !this.telemetrySessionActive) return;
    this.telemetrySink.record({
      ...this.getTelemetryContext(),
      type: 'completion',
      scope,
      score: Math.max(0, this.stats.score)
    });
  }

  private recordEntityDamage(
    target: Entity,
    previousHealth: number,
    sourceKind: 'player' | 'enemy' | 'environment' = 'player',
    targetKind: string = target.type,
    fatalOverride?: boolean
  ) {
    const remainingHealth = Math.max(0, Number(target.hp) || 0);
    const amount = Math.max(0, (Number(previousHealth) || 0) - remainingHealth);
    if (amount <= 0) return;
    if (sourceKind === 'player' && target !== this.player) {
      this.wavePlayerDamageDealt += amount;
    }
    if (!this.telemetrySink || !this.telemetrySessionActive) return;
    this.telemetrySink.record({
      ...this.getTelemetryContext(),
      type: 'entity-damage',
      targetId: target.id,
      targetKind,
      sourceKind,
      amount,
      remainingHealth,
      fatal: fatalOverride ?? (remainingHealth <= 0)
    });
  }

  private recordPlayerDamage(amount: number) {
    if (amount <= 0) return;
    this.waveDamageTaken += Math.max(0, amount);
    this.tacticalWaveDamageTaken += Math.max(0, amount);
    if (!this.telemetrySink || !this.telemetrySessionActive) return;
    this.telemetrySink.record({
      ...this.getTelemetryContext(),
      type: 'entity-damage',
      targetId: this.player.id,
      targetKind: 'player',
      sourceKind: 'enemy',
      amount,
      remainingHealth: Math.max(0, this.lives),
      fatal: this.lives <= 0
    });
  }

  buildCampaignWaveEntries(campaign: GameCampaign): CampaignWaveEntry[] {
    const entries: CampaignWaveEntry[] = [];
    const levels = Array.isArray(campaign.levels)
      ? campaign.levels
        .map((level, sourceIndex) => ({ level, sourceIndex }))
        .sort((a, b) => a.level.order - b.level.order)
      : [];
    levels.forEach(({ level }, levelIndex) => {
      const waves = Array.isArray(level.waves)
        ? level.waves.map((wave, sourceIndex) => ({ wave, sourceIndex })).sort((a, b) => a.wave.order - b.wave.order)
        : [];
      waves.forEach(({ wave }, waveIndex) => entries.push({ level, wave, levelIndex, waveIndex }));
    });
    return entries;
  }

  findCampaignWaveIndex(levelId?: string, waveId?: string) {
    if (!levelId && !waveId) return -1;
    return this.campaignWaves.findIndex((entry) => (
      (!levelId || entry.level.id === levelId)
      && (!waveId || entry.wave.id === waveId)
    ));
  }

  getCurrentCampaignEntry() {
    if (this.campaignWaves.length === 0) return null;
    const index = Math.floor(this.currentCampaignIndex);
    if (index < 0 || index >= this.campaignWaves.length) return null;
    return this.campaignWaves[index] ?? null;
  }

  getCampaignGraphNodeForLevelId(levelId?: string): CampaignGraphNodeDefinition | null {
    if (!levelId || !this.campaign.campaignGraph) return null;
    return this.campaign.campaignGraph.nodes.find((node) => (
      node.missionDefinitionId === levelId
    )) ?? null;
  }

  getCurrentLevelDefinition() {
    return this.getCurrentCampaignEntry()?.level ?? null;
  }

  getCurrentWaveDefinition() {
    return this.getCurrentCampaignEntry()?.wave ?? null;
  }

  isCurrentWaveStageFinal() {
    const entry = this.getCurrentCampaignEntry();
    return Boolean(entry && entry.waveIndex >= entry.level.waves.length - 1);
  }

  getStageNumberForCampaignIndex(campaignIndex: number = this.currentCampaignIndex) {
    if (this.campaignWaves.length === 0) return Math.max(1, Math.floor(campaignIndex) + 1);
    const safeIndex = clamp(Math.floor(campaignIndex), 0, this.campaignWaves.length - 1);
    const entry = this.campaignWaves[safeIndex];
    const graphNode = this.getCampaignGraphNodeForLevelId(entry?.level.id);
    if (graphNode) return Math.max(1, Math.floor(graphNode.depth));
    return clamp(
      (entry?.levelIndex ?? 0) + 1,
      1,
      Math.max(1, getAuthoredCampaignStageCount(this.campaign.levels.length))
    );
  }

  getFirstCampaignWaveIndexForStage(stageNumber: number) {
    if (this.campaignWaves.length === 0 || this.campaign.levels.length === 0) return -1;
    const levelCount = getAuthoredCampaignStageCount(this.campaign.levels.length);
    const requestedStage = Math.floor(Number(stageNumber) || 0);
    if (requestedStage < 1 || requestedStage > levelCount) return -1;
    const levelIndex = requestedStage - 1;
    const flatIndex = this.campaignWaves.findIndex((entry) => entry.levelIndex === levelIndex && entry.waveIndex === 0);
    return flatIndex;
  }

  getLastCampaignWaveIndexForCurrentStage() {
    const current = this.getCurrentCampaignEntry();
    if (!current || this.campaignWaves.length === 0) return -1;
    let flatIndex = -1;
    this.campaignWaves.forEach((entry, index) => {
      if (entry.level.id === current.level.id) flatIndex = index;
    });
    return flatIndex;
  }

  /** @deprecated Historical name retained for compatibility; this is a bounded five-Mission difficulty band, never a content loop. */
  getCampaignCycle() {
    return getCampaignProgressionTier(this.getStageNumberForCampaignIndex());
  }

  getCurrentDifficultyMultiplier() {
    const entry = this.getCurrentCampaignEntry();
    return resolveCampaignDifficulty({
      startingDifficulty: entry?.level.startingDifficulty ?? 1,
      waveDifficultyMultiplier: entry?.wave.difficultyMultiplier ?? 1,
      progressionTier: this.getCampaignCycle()
    });
  }

  getConfiguredWaveDurationSeconds() {
    const configured = Number(this.getCurrentWaveDefinition()?.durationSeconds);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : GAME_CONFIG.WAVE_DURATION_FRAMES / GAME_CONFIG.FPS;
  }

  getConfiguredWaveDurationFrames() {
    return Math.max(1, Math.round(this.getConfiguredWaveDurationSeconds() * GAME_CONFIG.FPS));
  }

  getCurrentWaveCompletionRule(): WaveDefinition['completionRule'] {
    return this.getCurrentWaveDefinition()?.completionRule === 'clear-after-duration'
      ? 'clear-after-duration'
      : 'boss-defeat';
  }

  beginWavePresentation(kind: GameRuntimeState['wavePresentationKind'] = 'mission') {
    this.wavePresentationKind = kind;
    this.wavePresentationRevision++;
    this.recordWaveStart();
  }

  getWaveElapsedSeconds() {
    return this.waveProgressFrames / GAME_CONFIG.FPS;
  }

  getConfiguredSpawnEvents() {
    const events = this.getCurrentWaveDefinition()?.events;
    if (!Array.isArray(events)) return [];
    return events.filter((event): event is SpawnEvent => event.kind === 'spawn') as RuntimeSpawnEvent[];
  }

  getConfiguredEncounterEvents() {
    const events = this.getCurrentWaveDefinition()?.events;
    if (!Array.isArray(events)) return [];
    return events
      .filter((event): event is BossEvent | AsteroidEvent | SupplyDropEvent => (
        event.kind === 'boss' || event.kind === 'asteroid-belt' || event.kind === 'supply-drop'
      ))
      .slice()
      .sort((a, b) => Number(a.startSeconds) - Number(b.startSeconds)) as RuntimeEncounterEvent[];
  }

  playSound(...args: Parameters<typeof audioService.playSound>) {
    if (!this.audioEnabled) return;
    audioService.playSound(...args);
  }

  getStageTakeoffPresentation() {
    return getStageTakeoffPresentation(this.waveDepartureFrames, this.waveDepartureDuration);
  }

  getRuntimeState(): GameRuntimeState {
    const entry = this.getCurrentCampaignEntry();
    const durationSeconds = this.getConfiguredWaveDurationSeconds();
    const levelTotal = Math.max(1, getAuthoredCampaignStageCount(this.campaign.levels.length));
    const waveTotal = Math.max(1, entry?.level.waves.length ?? 1);
    const takeoff = this.getStageTakeoffPresentation();
    const hyperspeedStrength = takeoff.phase === 'launch' ? takeoff.travel : 0;
    return {
      levelId: entry?.level.id ?? `level-${Math.max(1, this.wave)}`,
      levelName: entry?.level.name ?? this.getWaveSector().name,
      levelNumber: Math.max(1, (entry?.levelIndex ?? 0) + 1),
      levelTotal,
      waveId: entry?.wave.id ?? `wave-${Math.max(1, this.wave)}`,
      waveName: entry?.wave.name ?? `Wave ${Math.max(1, this.wave)}`,
      waveAccent: entry?.wave.accent ?? this.getWaveSector().accent,
      waveNumber: Math.max(1, (entry?.waveIndex ?? 0) + 1),
      waveTotal,
      wavePresentationRevision: this.wavePresentationRevision,
      wavePresentationKind: this.wavePresentationKind,
      elapsedSeconds: Math.min(durationSeconds, this.getWaveElapsedSeconds()),
      durationSeconds,
      progress: Math.min(1, Math.max(0, this.stats.bossProgress || 0)),
      bossActive: Boolean(this.stats.isBossActive),
      damageTaken: Math.max(0, this.waveDamageTaken),
      complete: this.previewComplete || this.campaignComplete,
      campaignComplete: this.campaignComplete,
      stageDepartureProgress: takeoff.progress,
      stageDepartureSpeedBoost: 1 + hyperspeedStrength * 8,
      stageHyperspeedActive: hyperspeedStrength > 0,
      stageHyperspeedStrength: hyperspeedStrength
    };
  }

  getDebugSnapshot(): Readonly<GameEngineDebugSnapshot> {
    const runtime = Object.freeze({ ...this.getRuntimeState() });
    const configuredSpawnCounts = Object.freeze(Object.fromEntries(this.configuredSpawnCounts));
    const currentWave = this.getCurrentWaveDefinition();
    const formationPacks = this.getCurrentFormationPacks();
    const enemyRoleIds = Array.from(new Set(
      this.getConfiguredSpawnEvents().flatMap((event) => (
        event.enemies.map((enemy) => enemy.roleId).filter((roleId): roleId is string => Boolean(roleId))
      ))
    ));
    const activeFormationIds = Array.from(new Set(
      this.entities
        .filter((entity) => !entity.markedForDeletion && Boolean(entity.formation))
        .map((entity) => entity.formation as string)
    ));
    const projectileCount = this.entities.reduce((count, entity) => (
      !entity.markedForDeletion
      && (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE)
        ? count + 1
        : count
    ), 0);
    this.peakProjectileCount = Math.max(this.peakProjectileCount, projectileCount);
    const activeFiringEnemies = this.getActiveCampaignShooterCount();
    const elapsedSeconds = Math.max(1 / GAME_CONFIG.FPS, this.tacticalWaveFlightFrames / GAME_CONFIG.FPS);
    const campaignLab = Object.freeze({
      combatBudget: Math.max(0, Number(currentWave?.combatBudget) || 0),
      threatCap: this.getThreatCap(),
      authoredThreatSpent: this.authoredWaveThreatSpent,
      activeThreatCost: this.getActiveCampaignThreatCost(),
      activePerformanceCost: this.getActiveCampaignPerformanceCost(),
      mobilePerformanceBudget: this.getCurrentMobilePerformanceBudget(),
      formationPackIds: Object.freeze(formationPacks.map((pack) => pack.id)),
      formationPackCost: formationPacks.reduce((total, pack) => total + Math.max(0, pack.totalThreatCost), 0),
      enemyRoleIds: Object.freeze(enemyRoleIds),
      activeFormationIds: Object.freeze(activeFormationIds),
      projectileCount,
      peakProjectileCount: this.peakProjectileCount,
      activeFiringEnemies,
      clearTimeSeconds: this.tacticalWaveFlightFrames / GAME_CONFIG.FPS,
      damageReceived: this.tacticalWaveDamageTaken,
      coinsEarned: Math.max(0, this.stats.totalCoins - this.tacticalWaveStartTotalCoins),
      playerDps: this.wavePlayerDamageDealt / elapsedSeconds,
      averageEnemyTimeToKillSeconds: this.waveEnemyKillsMeasured > 0
        ? (this.waveEnemyTimeToKillFrames / this.waveEnemyKillsMeasured) / GAME_CONFIG.FPS
        : 0,
      performanceMode: this.performanceMode,
      heavySceneLoad: this.heavySceneLoad,
      mobileProfile: this.mobileProfile
    });
    const entities = Object.freeze(this.entities
      .filter((entity) => !entity.markedForDeletion)
      .map((entity) => Object.freeze({
        id: entity.id,
        type: entity.type,
        hp: entity.hp,
        maxHp: entity.maxHp,
        x: entity.x,
        y: entity.y,
        vx: entity.vx,
        vy: entity.vy,
        formation: entity.formation ?? null,
        formationState: entity.formationState ?? null,
        formationIndex: entity.formationIndex,
        formationGroupSize: entity.encounterGroupSize,
        damage: entity.damage,
        contactDamage: entity.contactDamage,
        projectileDamage: entity.projectileDamage,
        projectileSpeed: Number.isFinite(entity.projectileSpeed) ? entity.projectileSpeed as number : null,
        scoreValue: Number.isFinite(entity.scoreValue) ? entity.scoreValue as number : null,
        powerupDropChance: Number.isFinite(entity.powerupDropChance) ? entity.powerupDropChance as number : null,
        attackIntervalFrames: Number.isFinite(entity.attackIntervalFrames) ? entity.attackIntervalFrames as number : null,
        spriteUrl: entity.spriteUrl ?? null,
        spriteStyle: entity.spriteStyle ? Object.freeze({ ...entity.spriteStyle }) : null,
        bossId: entity.sourceItemId ?? null,
        roleId: entity.campaignRoleId ?? null,
        gameplayRole: entity.campaignGameplayRole ?? null,
        durabilityClass: entity.campaignDurabilityClass ?? null,
        fireBehavior: entity.campaignFireBehavior ?? null,
        fireDelaySeconds: entity.campaignFireDelaySeconds,
        formationFiringBehavior: entity.campaignFormationFiringBehavior ?? null,
        threatCost: entity.campaignThreatCost,
        performanceCost: entity.campaignPerformanceCost,
        gatekeeperPrime: entity.sourceItemId === GATEKEEPER_PRIME_BOSS_ID
          ? Object.freeze({
              combatFrame: entity.gatekeeperPrimeCombatStartFrame < 0
                ? -1
                : Math.max(0, entity.attackTimer - entity.gatekeeperPrimeCombatStartFrame),
              phaseId: entity.gatekeeperPrimePhaseId ?? null,
              attackId: entity.gatekeeperPrimeAttackId ?? null,
              attackStage: entity.gatekeeperPrimeAttackStage ?? null,
              patrolBounds: Object.freeze({
                minimumX: entity.gatekeeperPrimeMinimumPatrolX,
                maximumX: entity.gatekeeperPrimeMaximumPatrolX,
                minimumY: entity.gatekeeperPrimeMinimumPatrolY,
                maximumY: entity.gatekeeperPrimeMaximumPatrolY
              })
            })
          : null
      })));
    return Object.freeze({
      runtime,
      difficultyMultiplier: this.getCurrentDifficultyMultiplier(),
      waveProgressFrames: this.waveProgressFrames,
      configuredSpawnCounts,
      campaignLab,
      entities
    });
  }

  getPreviewSnapshot(
    playback: PreviewPlaybackSnapshot = {
      playing: this.gameActive,
      timeScale: 1,
      invincible: this.previewInvincible
    }
  ): Readonly<PreviewSnapshot> {
    const runtime = this.getRuntimeState();
    const activeBoss = [this.bossRef, this.miniBossRef]
      .find((candidate): candidate is Entity => Boolean(
        candidate && !candidate.markedForDeletion && candidate.hp > 0
      ))
      ?? this.entities.find((entity) => (
        !entity.markedForDeletion
        && entity.hp > 0
        && (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS)
      ))
      ?? null;
    const activeEventIds = Object.freeze(Array.from(new Set(
      this.entities
        .filter((entity) => !entity.markedForDeletion && Boolean(entity.sourceEventId))
        .map((entity) => entity.sourceEventId as string)
    )).sort());
    const activeBossAttack = activeBoss?.bossTimeline
      ? getBossTimelineActiveAttackAtFrame(
          activeBoss.bossTimeline,
          activeBoss.attackTimer,
          activeBoss.bossTimelinePhaseId ?? activeBoss.activeBossPhaseId,
          GAME_CONFIG.FPS
        )
      : null;
    const activePrimitiveId = activeBoss?.bossActionPresentation?.primitiveId ?? null;
    const boss = activeBoss
      ? Object.freeze({
        eventId: activeBoss.sourceEventId ?? null,
        bossId: activeBoss.sourceItemId ?? null,
        phaseId: activeBoss.bossTimelinePhaseId ?? activeBoss.activeBossPhaseId ?? null,
        phaseIndex: Math.max(0, activeBoss.activeBossPhaseIndex),
        health: Math.max(0, activeBoss.hp),
        maxHealth: Math.max(1, activeBoss.maxHp),
        healthRatio: clamp(activeBoss.hp / Math.max(1, activeBoss.maxHp), 0, 1),
        invincible: this.previewInvincibleBossHulls.has(activeBoss),
        components: Object.freeze((activeBoss.bossComponents ?? []).map((component) => (
          Object.freeze({
            id: component.id,
            label: component.label,
            health: Math.max(0, component.hp),
            maxHealth: Math.max(1, component.maxHp),
            healthRatio: clamp(component.hp / Math.max(1, component.maxHp), 0, 1),
            invincible: this.previewInvincibleBossComponents.has(component),
            destroyed: component.destroyed,
            exposed: component.exposed
          })
        ))),
        activeAttack: activeBossAttack
          ? Object.freeze({
              id: activeBossAttack.attack.id,
              label: activeBossAttack.attack.label,
              role: activeBossAttack.attack.role,
              stage: activeBossAttack.stage,
              beatIndex: activeBossAttack.beatIndex,
              beatCount: activeBossAttack.beatCount,
              clipId: activeBossAttack.activeClip.id
            })
          : null,
        activePrimitiveId,
        safeRegionGuide: resolvePreviewSafeRegionGuide(activePrimitiveId)
      })
      : null;
    // The encounter remains inspectable while every member is in its staged
    // death animation, including the short gap after the sprites retire and
    // before the encounter-owned cleanup command completes.
    const activeMiniBossState = Array.from(this.miniBossLabEncounters.values()).find((state) => (
      !state.completionTriggered || state.completionFrame === this.frameCount
    ));
    const activeMiniBossDefinition = activeMiniBossState
      ? this.getMiniBossLabDefinition(activeMiniBossState)
      : undefined;
    const miniBossEncounter = activeMiniBossState && activeMiniBossDefinition
      ? Object.freeze({
          eventId: activeMiniBossState.eventId,
          encounterId: activeMiniBossState.encounterId,
          stage: activeMiniBossState.activeStage,
          signatureLoop: activeMiniBossState.signatureLoop,
          shieldEnabled: activeMiniBossState.shieldOverride ?? Array.from(
            activeMiniBossState.memberEntityIds.values()
          ).some((entityId) => this.entities.some((entity) => (
            entity.id === entityId
            && !entity.markedForDeletion
            && entity.hp > 0
            && entity.miniBossLabShielded
          ))),
          wallSide: activeMiniBossState.wallSide,
          compactHealthBars: this.compactMiniBossHealthBarsVisible,
          members: Object.freeze(createMiniBossMemberInstances(activeMiniBossDefinition).map((instance) => {
            const entityId = activeMiniBossState.memberEntityIds.get(instance.id);
            const entity = entityId
              ? this.entities.find((candidate) => candidate.id === entityId)
              : undefined;
            const maxHealth = Math.max(1, entity?.maxHp ?? instance.maxHealth);
            const health = entity && !entity.markedForDeletion ? Math.max(0, entity.hp) : 0;
            const deathStartedFrame = entity?.miniBossLabDeathStartedFrame ?? -1;
            const deathState = entity?.markedForDeletion
              ? 'removed'
              : deathStartedFrame >= 0
                ? 'staged'
                : activeMiniBossState.destroyedMemberIds.has(instance.id)
                  ? 'removed'
                  : 'alive';
            return Object.freeze({
              id: instance.id,
              label: instance.label,
              role: instance.role,
              health,
              maxHealth,
              healthRatio: clamp(health / maxHealth, 0, 1),
              shielded: Boolean(entity?.miniBossLabShielded),
              damageable: Boolean(
                entity
                && !entity.markedForDeletion
                && entity.miniBossLabDamageable
                && deathStartedFrame < 0
              ),
              visualState: entity?.miniBossLabVisualState ?? 'death',
              deathState,
              deathStartedFrame: deathStartedFrame >= 0 ? deathStartedFrame : null,
              alive: Boolean(
                entity
                && !entity.markedForDeletion
                && entity.hp > 0
                && entity.miniBossLabDeathStartedFrame < 0
              )
            });
          }))
        })
      : null;

    return Object.freeze({
      playing: Boolean(playback.playing),
      timeScale: clamp(Number(playback.timeScale) || 1, 0.25, 2),
      invincible: Boolean(playback.invincible),
      seed: this.gameplayRandomSeed,
      frame: this.frameCount,
      levelId: runtime.levelId,
      waveId: runtime.waveId,
      waveProgressFrames: this.waveProgressFrames,
      elapsedSeconds: runtime.elapsedSeconds,
      durationSeconds: runtime.durationSeconds,
      entityCount: this.entities.reduce(
        (count, entity) => count + Number(!entity.markedForDeletion),
        0
      ),
      activeEventIds,
      boss,
      miniBossEncounter
    });
  }

  getEditorSnapshot(): Readonly<GameEditorSnapshot> {
    const width = Math.max(1, this.width);
    const height = Math.max(1, this.height);
    const viewport = Object.freeze({ width, height });
    const entities = Object.freeze(this.entities
      .filter((entity) => (
        !entity.markedForDeletion
        && Boolean(entity.sourceEventId)
        && entity.x + entity.width >= 0
        && entity.x <= width
        && entity.y + entity.height >= 0
        && entity.y <= height
      ))
      .map((entity) => {
        const collisionBox = this.getCollisionBox(entity);
        return Object.freeze({
          id: entity.id,
          sourceEventId: entity.sourceEventId as string,
          sourceItemId: entity.sourceItemId ?? null,
          type: entity.type,
          bounds: Object.freeze({
            x: entity.x / width,
            y: entity.y / height,
            width: entity.width / width,
            height: entity.height / height
          }),
          collisionBounds: Object.freeze({
            x: collisionBox.x / width,
            y: collisionBox.y / height,
            width: collisionBox.width / width,
            height: collisionBox.height / height
          })
        });
      }));

    return Object.freeze({ viewport, entities });
  }

  loadPreviewWave(levelId: string, waveId: string) {
    const index = this.findCampaignWaveIndex(levelId, waveId);
    if (index < 0) return false;
    this.currentCampaignIndex = index;
    this.wave = this.getStageNumberForCampaignIndex(index);
    this.stats.wave = this.wave;
    this.restartPreview();
    return true;
  }

  private canUsePreviewControl() {
    return this.previewMode || this.testMode;
  }

  private getCurrentWaveEvent(eventId: string): WaveEvent | null {
    if (!eventId || eventId.length > 160) return null;
    return this.getCurrentWaveDefinition()?.events.find((event) => event.id === eventId) ?? null;
  }

  private clearPreviewEventRuntime(eventId: string) {
    this.miniBossLabEncounters.delete(eventId);
    const removedEntityIds = new Set<string>();
    for (const entity of this.entities) {
      if (entity.sourceEventId !== eventId) continue;
      removedEntityIds.add(entity.id);
      entity.markedForDeletion = true;
    }
    for (const entity of this.entities) {
      if (entity.bossOwnerId && removedEntityIds.has(entity.bossOwnerId)) {
        entity.markedForDeletion = true;
      }
    }
    if (this.bossRef?.sourceEventId === eventId) this.bossRef = null;
    if (this.miniBossRef?.sourceEventId === eventId) this.miniBossRef = null;
    if (this.pendingConfiguredEncounter?.id === eventId) {
      this.pendingConfiguredEncounter = null;
      this.pendingBossType = null;
      this.inBossWarningSequence = false;
      this.bossWarningFrame = 0;
      this.bossWarningDuration = 0;
    }
    this.pendingBossStrikes = this.pendingBossStrikes.filter(
      (strike) => !removedEntityIds.has(strike.bossId)
    );
    this.pendingEnemyLasers = this.pendingEnemyLasers.filter(
      (laser) => !removedEntityIds.has(laser.sourceId)
    );
    this.configuredEncounterIds.delete(eventId);
    this.configuredSpawnCounts.delete(eventId);
    this.configuredSpawnFrames.delete(eventId);
    const formationInstanceId = this.getCampaignFormationPackInstanceId(eventId);
    const removedFormationInstance = this.campaignFormationPackInstances.get(formationInstanceId);
    this.campaignFormationPackInstances.delete(formationInstanceId);
    if (
      removedFormationInstance
      && ![...this.campaignFormationPackInstances.values()].some(
        (instance) => instance.packId === removedFormationInstance.packId
      )
    ) {
      // Explicit preview restarts are author controls, not a second live pack.
      this.campaignFormationPackLastRetiredFrames.delete(removedFormationInstance.packId);
    }
    this.compactEntities();
  }

  private pickPreviewPowerupId(event: PowerupEvent | RecoveryEvent) {
    const powerupIds = Array.isArray(event.powerupIds) ? event.powerupIds : [];
    if (powerupIds.length === 0) return null;
    const totalWeight = powerupIds.reduce(
      (sum, id) => sum + Math.max(0, getPowerup(id).defaultWeight),
      0
    );
    if (totalWeight <= 0) return powerupIds[0] ?? null;
    let roll = this.nextGameplayRandom() * totalWeight;
    for (const id of powerupIds) {
      roll -= Math.max(0, getPowerup(id).defaultWeight);
      if (roll <= 0) return id;
    }
    return powerupIds.at(-1) ?? null;
  }

  /**
   * Spawns one complete named event from the active authored wave. The
   * operation is deliberately unavailable to production gameplay.
   */
  spawnPreviewEventNow(eventId: string) {
    if (!this.canUsePreviewControl()) return false;
    const event = this.getCurrentWaveEvent(eventId);
    if (!event) return false;
    if (this.previewBossAttackLoop?.eventId === event.id) {
      this.previewBossAttackLoop = null;
    }

    this.clearPreviewEventRuntime(event.id);
    this.gameActive = true;
    this.previewComplete = false;
    this.campaignComplete = false;

    if (event.kind === 'spawn') {
      const targetCount = this.getConfiguredSpawnTargetCount(event);
      const threatCap = Math.max(
        1,
        Number(this.getCurrentWaveDefinition()?.threatCap) || this.getThreatCap()
      );
      const available = Math.max(0, threatCap - this.getActiveThreatCount());
      const spawnCount = Math.min(targetCount, available);
      const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
      let spawned = 0;
      for (let index = 0; index < spawnCount; index += 1) {
        if (this.spawnConfiguredEnemyFromEvent(event, index, targetCount, difficultyMultiplier)) {
          spawned++;
        }
      }
      this.refreshLoadState();
      return spawned > 0;
    }

    if (event.kind === 'boss' || event.kind === 'asteroid-belt' || event.kind === 'supply-drop') {
      this.configuredEncounterIds.add(event.id);
      this.spawnConfiguredEncounter(event);
      this.refreshLoadState();
      return this.entities.some((entity) => (
        !entity.markedForDeletion && entity.sourceEventId === event.id
      ));
    }

    if (event.kind === 'powerup') {
      const powerupId = this.pickPreviewPowerupId(event);
      if (!powerupId) return false;
      const anchor = this.getConfiguredSpawnAnchor(event);
      const powerup = this.spawnPowerup(
        anchor ? (anchor.x * this.width) - 18 : this.nextGameplayRandom() * Math.max(1, this.width - 40),
        anchor ? (anchor.y * this.height) - 18 : -40,
        powerupId
      );
      powerup.sourceEventId = event.id;
      powerup.sourceItemId = powerupId;
      this.configuredSpawnCounts.set(event.id, 1);
      this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
      this.refreshLoadState();
      return true;
    }

    if (event.kind === 'recovery') {
      const anchor = this.getConfiguredSpawnAnchor(event);
      const coinCount = Math.max(0, Math.min(48, Math.floor(Number(event.coinCount) || 0)));
      for (let index = 0; index < coinCount; index += 1) {
        const coin = this.spawnCoin(
          this.width * ((index + 1) / Math.max(2, coinCount + 1))
            + (anchor ? (anchor.x * this.width) - (this.width / 2) : 0),
          -30 - index * 22 + (anchor ? (anchor.y * this.height) + 30 : 0)
        );
        coin.sourceEventId = event.id;
        coin.sourceItemId = 'coin';
      }
      for (const [index, powerupId] of event.powerupIds.entries()) {
        const powerup = this.spawnPowerup(
          anchor
            ? (anchor.x * this.width) - 18 + ((index - ((event.powerupIds.length - 1) / 2)) * 44)
            : this.nextGameplayRandom() * Math.max(1, this.width - 40),
          anchor ? (anchor.y * this.height) - 18 : -50,
          powerupId
        );
        powerup.sourceEventId = event.id;
        powerup.sourceItemId = powerupId;
      }
      this.configuredEncounterIds.add(event.id);
      this.refreshLoadState();
      return coinCount > 0 || event.powerupIds.length > 0;
    }

    return false;
  }

  /**
   * Reconstructs or repositions an authored boss directly at one of its
   * configured health phases for deterministic local iteration.
   */
  jumpToAuthoredBossPhase(phaseId: string, eventId?: string) {
    if (!this.canUsePreviewControl() || !phaseId || phaseId.length > 160) return false;
    const bossEvents = (this.getCurrentWaveDefinition()?.events ?? [])
      .filter((event): event is BossEvent => event.kind === 'boss');
    const event = bossEvents.find((candidate) => (
      (!eventId || candidate.id === eventId)
      && candidate.phases.some((phase) => phase.id === phaseId)
    ));
    if (!event) return false;
    this.previewBossAttackLoop = null;

    let bosses = this.entities.filter((entity) => (
      !entity.markedForDeletion
      && entity.sourceEventId === event.id
      && (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS)
    ));
    if (bosses.length === 0) {
      if (!this.spawnPreviewEventNow(event.id)) return false;
      bosses = this.entities.filter((entity) => (
        !entity.markedForDeletion
        && entity.sourceEventId === event.id
        && (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS)
      ));
    }
    const authoredPhaseIndex = event.phases.findIndex((phase) => phase.id === phaseId);
    const authoredPhase = event.phases[authoredPhaseIndex];
    if (!authoredPhase || bosses.length === 0) return false;
    const revivalPhaseIndex = getBossRevivalTargetPhaseIndex(event.revival, event.phases);

    this.pendingBossStrikes = [];
    this.pendingEnemyLasers = [];
    for (const entity of this.entities) {
      if (entity.type === EntityType.PROJECTILE && !entity.isPlayerShot) {
        entity.markedForDeletion = true;
      }
    }
    this.clearBossShieldRing();
    this.compactEntities();

    for (const boss of bosses) {
      this.clearPrismMothRuntime(boss);
      let targetHealthRatio = clamp(authoredPhase.triggerHealthRatio, 0.0001, 1);
      if (boss.type === EntityType.BOSS && event.revival && revivalPhaseIndex > 0) {
        boss.bossRevival = { ...event.revival };
        boss.bossRevivalBaseWidth ||= boss.width;
        boss.bossRevivalBaseHeight ||= boss.height;
        const centerX = boss.x + boss.width / 2;
        const centerY = boss.y + boss.height / 2;
        if (authoredPhaseIndex >= revivalPhaseIndex) {
          const completedState = createCompletedBossRevivalRuntimeState(
            event.revival,
            event.phases,
            boss.bossRevivalBaseWidth,
            boss.bossRevivalBaseHeight,
            this.width,
            GAME_CONFIG.FPS
          );
          if (completedState) {
            boss.bossRevivalRuntime = completedState;
            boss.bossRevivalStage = 'complete';
            boss.bossRevivalProgress = 1;
            boss.bossRevivalConsumed = true;
            boss.width = completedState.targetWidth;
            boss.height = completedState.targetHeight;
            if (authoredPhaseIndex === revivalPhaseIndex) {
              targetHealthRatio = clamp(event.revival.restoreHealthRatio, 0.0001, 1);
            }
          }
        } else {
          boss.bossRevivalRuntime = undefined;
          boss.bossRevivalStage = 'armed';
          boss.bossRevivalProgress = 0;
          boss.bossRevivalConsumed = false;
          boss.width = boss.bossRevivalBaseWidth;
          boss.height = boss.bossRevivalBaseHeight;
        }
        boss.x = centerX - boss.width / 2;
        boss.y = centerY - boss.height / 2;
      }
      boss.hp = Math.max(0.01, boss.maxHp * targetHealthRatio);
      boss.activeBossPhaseIndex = -1;
      boss.activeBossPhaseId = undefined;
      boss.bossTimelinePhaseId = undefined;
      boss.bossTimelineLastPhaseId = undefined;
      boss.attackTimer = 0;
      boss.lastBurstAttackTimer = 0;
      boss.generatedBossChargeUntilTimer = -1;
      boss.generatedBossTechniqueTimer = -1;
      boss.isCharging = false;
      this.clearBossTimelineActionLocks(boss);
      if (boss.type === EntityType.BOSS) {
        boss.x = clamp((this.width - boss.width) / 2, 10, Math.max(10, this.width - boss.width - 10));
        boss.y = Math.max(72, Math.min(this.height * 0.13, 116));
      } else {
        boss.y = Math.max(64, Math.min(this.height * 0.12, 104));
      }
      this.applyConfiguredBossPhase(boss);
    }
    this.refreshLoadState();
    return bosses.every((boss) => boss.activeBossPhaseId === phaseId);
  }

  private applyPreviewBossAttackLoop(boss: Entity) {
    const loop = this.previewBossAttackLoop;
    if (
      !loop
      || boss.sourceEventId !== loop.eventId
      || boss.activeBossPhaseId !== loop.phaseId
    ) return;
    const loopFrame = resolvePreviewAttackLoopFrame(
      boss.attackTimer,
      loop.startFrame,
      loop.endFrame
    );
    if (loopFrame === boss.attackTimer) return;

    this.clearPrismMothRuntime(boss);

    this.pendingBossStrikes = this.pendingBossStrikes.filter(
      (strike) => strike.bossId !== boss.id
    );
    this.pendingEnemyLasers = this.pendingEnemyLasers.filter(
      (laser) => laser.sourceId !== boss.id
    );
    for (const entity of this.entities) {
      if (entity === boss || entity.isPlayerShot) continue;
      if (
        entity.bossOwnerId === boss.id
        || (
          entity.sourceEventId === loop.eventId
          && entity.type !== EntityType.BOSS
          && entity.type !== EntityType.MINI_BOSS
        )
      ) {
        entity.markedForDeletion = true;
      }
    }
    this.removeBossCornerAmbushBeams(boss);
    boss.bossMovementPathId = undefined;
    boss.bossMovementPathStartFrame = -1;
    boss.bossMovementPathDurationFrames = 0;
    boss.bossPresentationBankRadians = 0;
    boss.generatedBossChargeUntilTimer = -1;
    boss.generatedBossTechniqueTimer = -1;
    boss.generatedBossTargetX = null;
    boss.generatedBossTargetY = null;
    boss.generatedBossTargetSequence = -1;
    this.clearBossTimelineActionLocks(boss);
    boss.bossCornerAmbushBeamState = undefined;
    boss.bossCornerAmbushRamState = undefined;
    boss.bossTrackingPincerState = undefined;
    boss.bossHeliosCornerClampState = undefined;
    boss.bossHeliosMachineGunChannelState = undefined;
    boss.bossActionPresentation = undefined;
    boss.isCharging = false;
    boss.attackTimer = loopFrame;
  }

  /**
   * Starts one exact Boss Sandbox attack through its production scheduler.
   * Timeline bosses begin at the linked warning frame; compatibility bosses
   * use their registered deterministic technique or configured weapon.
   */
  triggerAuthoredBossAttack(
    attackId: string,
    eventId?: string,
    requestedPhaseId?: string,
    loop = false
  ) {
    if (!this.canUsePreviewControl() || !attackId || attackId.length > 200) return false;
    const bossEvents = (this.getCurrentWaveDefinition()?.events ?? [])
      .filter((event): event is BossEvent => event.kind === 'boss');
    const event = bossEvents.find((candidate) => (
      !eventId || candidate.id === eventId
    ));
    if (!event) return false;

    const authoredAttack = event.timeline
      ? resolveBossTimelineAttackVariant(
          event.timeline,
          attackId,
          requestedPhaseId ?? event.phases[0]?.id
        )
      : null;
    const timelineClip = event.timeline?.clips.find((clip) => (
      clip.id === attackId
      && clip.trigger === 'time'
      && isDamagingBossTimelinePrimitive(clip.primitiveId)
    ));
    if (event.timeline && (authoredAttack || timelineClip)) {
      const phaseId = authoredAttack?.variant.phaseId
        ?? timelineClip?.phaseId
        ?? event.phases[0]?.id;
      if (
        !phaseId
        || !this.jumpToAuthoredBossPhase(phaseId, event.id)
      ) return false;
      const attackWindow = getBossTimelineAttackWindow(
        event.timeline,
        authoredAttack?.attack.id ?? timelineClip?.id ?? attackId,
        phaseId,
        GAME_CONFIG.FPS
      );
      if (!attackWindow) return false;
      const bosses = this.entities.filter((entity) => (
        !entity.markedForDeletion
        && entity.sourceEventId === event.id
        && (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS)
      ));
      const targetEntranceY = Math.max(72, Math.min(this.height * 0.13, 116));
      for (const boss of bosses) {
        // A manual Sandbox attack start is an explicit request to begin at
        // the linked warning now. If the boss is still entering, the normal
        // entrance guard would reset attackTimer to zero on the next frame
        // and silently fall back to Attack 1. Settle the preview boss at its
        // combat anchor before advancing to the requested attack window.
        if (boss.y < targetEntranceY) {
          boss.y = targetEntranceY;
          boss.vy = 0;
        }
        // updateBoss increments before cue lookup, hence the deliberate -1.
        boss.attackTimer = Math.max(0, attackWindow.startFrame - 1);
        boss.bossTimelineLastPhaseId = undefined;
      }
      if (bosses.length === 0) return false;
      this.previewBossAttackLoop = loop ? {
        eventId: event.id,
        attackId: authoredAttack?.attack.id ?? timelineClip?.id ?? attackId,
        phaseId,
        startFrame: attackWindow.startFrame,
        endFrame: attackWindow.endFrame
      } : null;
      return true;
    }

    const archetype = resolveGeneratedBossArchetype(event.spriteKey);
    const generatedStart = archetype
      ? getGeneratedBossPreviewAttackStart(archetype, attackId)
      : null;
    const generatedWindow = archetype
      ? getGeneratedBossPreviewAttackWindow(archetype, attackId)
      : null;
    if (archetype && generatedStart && generatedWindow) {
      const phaseId = event.phases[generatedStart.phase - 1]?.id;
      if (
        !phaseId
        || !this.jumpToAuthoredBossPhase(phaseId, event.id)
      ) return false;
      const bosses = this.entities.filter((entity) => (
        !entity.markedForDeletion
        && entity.sourceEventId === event.id
        && entity.type === EntityType.BOSS
        && entity.bossAttackArchetype === archetype
      ));
      for (const boss of bosses) {
        boss.attackTimer = Math.max(0, generatedStart.startFrame - 1);
      }
      if (bosses.length === 0) return false;
      this.previewBossAttackLoop = loop ? {
        eventId: event.id,
        attackId,
        phaseId,
        startFrame: generatedWindow.startFrame,
        endFrame: generatedWindow.endFrame
      } : null;
      return true;
    }

    const weapon = event.weapons.find((setting) => setting.id === attackId);
    if (!weapon) return false;
    if (loop) return false;
    const authoredPhaseIndex = Math.max(
      0,
      event.phases.findIndex((phase) => phase.weaponSettingIds.includes(weapon.id))
    );
    const phaseId = event.phases[authoredPhaseIndex]?.id;
    const phaseReady = Boolean(
      phaseId && this.jumpToAuthoredBossPhase(phaseId, event.id)
    );
    if (!phaseReady && !this.spawnPreviewEventNow(event.id)) return false;

    this.pendingBossStrikes = [];
    this.pendingEnemyLasers = [];
    for (const entity of this.entities) {
      if (entity.type === EntityType.PROJECTILE && !entity.isPlayerShot) {
        entity.markedForDeletion = true;
      }
    }
    this.compactEntities();

    const sources = this.entities.filter((entity) => (
      !entity.markedForDeletion
      && entity.sourceEventId === event.id
      && (
        entity.type === EntityType.BOSS
        || entity.type === EntityType.MINI_BOSS
        || entity.type === EntityType.ENEMY_INVADER
      )
    ));
    if (sources.length === 0) return false;

    for (const source of sources) {
      source.weaponKinds = [String(weapon.weaponId)];
      source.projectileDamage = Math.max(0, Number(weapon.damage) || 0);
      source.projectileSpeed = Math.max(0.1, Number(weapon.projectileSpeed) || 1);
      source.configuredBurstCount = Math.max(
        1,
        Math.floor(Number(weapon.burstCount) || 1)
      );
    }
    this.previewBossAttackLoop = null;

    if (String(weapon.weaponId).includes('beam')) {
      return this.queuePreviewBossLaneLaser(sources[0]);
    }
    for (const source of sources) {
      this.spawnBossBurst(
        source,
        authoredPhaseIndex + 1,
        Math.max(1, Math.floor(Number(weapon.burstCount) || 1))
      );
    }
    return true;
  }

  fastForwardPreviewFrames(frameCount: number) {
    if (!this.canUsePreviewControl()) return false;
    const frames = clampPreviewFastForwardFrames(frameCount);
    if (frames <= 0) return false;
    for (let index = 0; index < frames && this.gameActive; index += 1) {
      this.update(false);
    }
    return true;
  }

  stepPreviewFrame() {
    if (!this.canUsePreviewControl() || !this.gameActive) return false;
    this.update(false);
    return true;
  }

  private getPreviewBossTarget(eventId?: string) {
    return [this.bossRef, this.miniBossRef]
      .find((candidate): candidate is Entity => Boolean(
        candidate
        && !candidate.markedForDeletion
        && candidate.hp > 0
        && (!eventId || candidate.sourceEventId === eventId)
      ))
      ?? this.entities.find((entity) => (
        !entity.markedForDeletion
        && entity.hp > 0
        && (!eventId || entity.sourceEventId === eventId)
        && (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS)
      ));
  }

  setPreviewBossHealthRatio(healthRatio: number, eventId?: string) {
    if (
      !this.canUsePreviewControl()
      || (eventId !== undefined && (!eventId || eventId.length > 160))
    ) return false;
    const miniBossLabState = eventId
      ? this.miniBossLabEncounters.get(eventId)
      : Array.from(this.miniBossLabEncounters.values()).find((state) => !state.completionTriggered);
    if (miniBossLabState) {
      let changed = false;
      for (const entityId of miniBossLabState.memberEntityIds.values()) {
        const member = this.entities.find((candidate) => candidate.id === entityId);
        if (!member || member.markedForDeletion || member.hp <= 0) continue;
        member.hp = Math.max(
          1,
          Math.round(Math.max(1, member.maxHp) * clampPreviewBossHealthRatio(healthRatio))
        );
        changed = true;
      }
      return changed;
    }
    const boss = this.getPreviewBossTarget(eventId);
    if (!boss) return false;

    boss.hp = Math.max(
      1,
      Math.round(Math.max(1, boss.maxHp) * clampPreviewBossHealthRatio(healthRatio))
    );
    if (boss === this.bossRef || boss === this.miniBossRef) {
      this.stats.bossHp = boss.hp;
      this.stats.bossMaxHp = Math.max(1, boss.maxHp);
    }
    return true;
  }

  private getPreviewMiniBossLabState(eventId: string) {
    if (!this.canUsePreviewControl() || !eventId || eventId.length > 160) return undefined;
    return this.miniBossLabEncounters.get(eventId);
  }

  setPreviewMiniBossSignatureLoop(eventId: string, enabled: boolean) {
    const state = this.getPreviewMiniBossLabState(eventId);
    const definition = state ? this.getMiniBossLabDefinition(state) : undefined;
    if (!state || !definition) return false;
    state.signatureLoop = Boolean(enabled);
    state.supportStartFrame = null;
    state.startFrame = this.frameCount - Math.round(definition.entranceSeconds * GAME_CONFIG.FPS);
    state.lastSampleFrame = -1;
    state.emittedHazardIds.clear();
    state.pendingProjectiles.length = 0;
    this.cleanupMiniBossLabOwnedArtifacts(state, true);
    return true;
  }

  triggerPreviewMiniBossSupport(eventId: string) {
    const state = this.getPreviewMiniBossLabState(eventId);
    if (!state || !this.getMiniBossLabDefinition(state)) return false;
    state.supportStartFrame = this.frameCount;
    state.lastSampleFrame = -1;
    state.emittedHazardIds.clear();
    state.pendingProjectiles.length = 0;
    this.cleanupMiniBossLabOwnedArtifacts(state, true);
    return true;
  }

  setPreviewMiniBossLowHealth(eventId: string) {
    const state = this.getPreviewMiniBossLabState(eventId);
    if (!state) return false;
    let changed = false;
    for (const entityId of state.memberEntityIds.values()) {
      const entity = this.entities.find((candidate) => candidate.id === entityId);
      if (!entity || entity.markedForDeletion || entity.hp <= 0) continue;
      entity.hp = Math.max(1, Math.round(entity.maxHp * 0.35));
      entity.miniBossLabVisualState = 'low-health';
      changed = true;
    }
    return changed;
  }

  triggerPreviewMiniBossHit(eventId: string) {
    const state = this.getPreviewMiniBossLabState(eventId);
    if (!state) return false;
    const target = Array.from(state.memberEntityIds.entries())
      .map(([memberId, entityId]) => ({
        memberId,
        entity: this.entities.find((candidate) => candidate.id === entityId)
      }))
      .find(({ entity }) => Boolean(entity && !entity.markedForDeletion && entity.hp > 0));
    if (!target?.entity) return false;
    state.hitUntilFrameByMemberId.set(target.memberId, this.frameCount + 10);
    target.entity.miniBossLabVisualState = 'hit';
    this.flashEntity(target.entity, 4);
    this.queueBossSignificantImpact(target.entity, 0.5, 0.5, 0.55, false);
    this.spawnBurst(
      target.entity.x + target.entity.width / 2,
      target.entity.y + target.entity.height / 2,
      '#e0f2fe',
      5,
      2.4,
      2.5
    );
    return true;
  }

  triggerPreviewMiniBossDeath(eventId: string) {
    const state = this.getPreviewMiniBossLabState(eventId);
    if (!state) return false;
    let changed = false;
    for (const entityId of state.memberEntityIds.values()) {
      const entity = this.entities.find((candidate) => candidate.id === entityId);
      if (!entity || entity.markedForDeletion || entity.miniBossLabDeathStartedFrame >= 0) continue;
      changed = this.beginMiniBossLabMemberDeath(entity) || changed;
    }
    return changed;
  }

  destroyPreviewMiniBossUnit(eventId: string) {
    const state = this.getPreviewMiniBossLabState(eventId);
    const definition = state ? this.getMiniBossLabDefinition(state) : undefined;
    if (!state || !definition) return false;
    const pairArchetypeId = definition.choreography.kind === 'paired-crossfire'
      ? definition.choreography.coreArchetypeId
      : definition.choreography.kind === 'mirror-exchange'
        ? definition.choreography.sentinelArchetypeId
        : definition.choreography.kind === 'quadrant-grid'
          ? definition.choreography.sentryArchetypeId
          : undefined;
    if (!pairArchetypeId) return false;
    const instance = createMiniBossMemberInstances(definition).find((candidate) => (
      candidate.archetypeId === pairArchetypeId
      && !state.destroyedMemberIds.has(candidate.id)
    ));
    const entity = instance ? this.getMiniBossLabMemberEntity(state, instance.id) : undefined;
    return entity ? this.beginMiniBossLabMemberDeath(entity) : false;
  }

  destroyPreviewMiniBossGuardians(eventId: string) {
    const state = this.getPreviewMiniBossLabState(eventId);
    if (!state) return false;
    let changed = false;
    for (const entityId of state.memberEntityIds.values()) {
      const entity = this.entities.find((candidate) => candidate.id === entityId);
      if (
        !entity
        || entity.markedForDeletion
        || (entity.miniBossLabRole !== 'guardian' && entity.miniBossLabRole !== 'escort')
      ) continue;
      changed = this.beginMiniBossLabMemberDeath(entity) || changed;
    }
    return changed;
  }

  setPreviewMiniBossShield(eventId: string, enabled: boolean) {
    const state = this.getPreviewMiniBossLabState(eventId);
    if (!state) return false;
    state.shieldOverride = Boolean(enabled);
    return true;
  }

  setPreviewMiniBossWallSide(eventId: string, side: 'left' | 'right') {
    const state = this.getPreviewMiniBossLabState(eventId);
    const definition = state ? this.getMiniBossLabDefinition(state) : undefined;
    if (
      !state
      || (
        definition?.choreography.kind !== 'edge-rail'
        && definition?.choreography.kind !== 'quadrant-grid'
      )
    ) return false;
    state.wallSide = side;
    return true;
  }

  setPreviewCompactHealthBars(enabled: boolean) {
    if (!this.canUsePreviewControl()) return false;
    this.compactMiniBossHealthBarsVisible = Boolean(enabled);
    return true;
  }

  /**
   * Rebudget the active sandbox boss without restarting, changing phase, or
   * mutating its authored event. Components retain their relative durability.
   */
  setPreviewBossMaxHealth(maxHealth: number, eventId?: string) {
    if (
      !this.canUsePreviewControl()
      || !Number.isFinite(maxHealth)
      || (eventId !== undefined && (!eventId || eventId.length > 160))
    ) return false;
    const miniBossLabState = eventId
      ? this.miniBossLabEncounters.get(eventId)
      : Array.from(this.miniBossLabEncounters.values()).find((state) => !state.completionTriggered);
    const miniBossLabDefinition = miniBossLabState
      ? this.getMiniBossLabDefinition(miniBossLabState)
      : undefined;
    if (miniBossLabState && miniBossLabDefinition) {
      const intendedMembers = createMiniBossMemberInstances(miniBossLabDefinition)
        .map((instance) => this.getMiniBossLabMemberEntity(miniBossLabState, instance.id))
        .filter((entity): entity is Entity => Boolean(entity));
      const referenceMember = intendedMembers.find((entity) => entity.miniBossLabShowHealthBar)
        ?? intendedMembers[0];
      if (!referenceMember) return false;
      const previousReferenceMax = Math.max(1, referenceMember.maxHp);
      const nextReference = rescalePreviewHealthBudget(
        referenceMember.hp,
        previousReferenceMax,
        maxHealth,
        referenceMember.hp > 0 && referenceMember.miniBossLabDeathStartedFrame < 0
      );
      const budgetScale = nextReference.maxHealth / previousReferenceMax;
      for (const member of intendedMembers) {
        const nextMaximum = member === referenceMember
          ? nextReference.maxHealth
          : Math.max(1, Math.round(Math.max(1, member.maxHp) * budgetScale));
        const nextMember = member === referenceMember
          ? nextReference
          : rescalePreviewHealthBudget(
              member.hp,
              member.maxHp,
              nextMaximum,
              member.hp > 0 && member.miniBossLabDeathStartedFrame < 0
            );
        member.hp = nextMember.health;
        member.maxHp = nextMember.maxHealth;
      }
      return true;
    }

    const boss = this.getPreviewBossTarget(eventId);
    if (!boss) return false;

    const previousMaxHealth = Math.max(1, boss.maxHp);
    const nextBossHealth = rescalePreviewHealthBudget(
      boss.hp,
      previousMaxHealth,
      maxHealth
    );
    boss.hp = nextBossHealth.health;
    boss.maxHp = nextBossHealth.maxHealth;

    for (const component of boss.bossComponents ?? []) {
      const scaledComponentMax = Math.max(
        1,
        Math.round(component.maxHp * (boss.maxHp / previousMaxHealth))
      );
      const nextComponentHealth = rescalePreviewHealthBudget(
        component.hp,
        component.maxHp,
        scaledComponentMax,
        !component.destroyed
      );
      component.hp = nextComponentHealth.health;
      component.maxHp = nextComponentHealth.maxHealth;
    }

    if (boss === this.bossRef || boss === this.miniBossRef) {
      this.stats.bossHp = boss.hp;
      this.stats.bossMaxHp = boss.maxHp;
    }
    return true;
  }

  /** Adjust one destructible part for this preview session only. */
  setPreviewBossComponentMaxHealth(
    componentId: string,
    maxHealth: number,
    eventId?: string
  ) {
    if (
      !this.canUsePreviewControl()
      || !componentId
      || componentId.length > 80
      || !Number.isFinite(maxHealth)
      || (eventId !== undefined && (!eventId || eventId.length > 160))
    ) return false;
    const boss = this.getPreviewBossTarget(eventId);
    const component = boss?.bossComponents?.find((candidate) => candidate.id === componentId);
    if (!component) return false;

    const nextComponentHealth = rescalePreviewHealthBudget(
      component.hp,
      component.maxHp,
      maxHealth,
      !component.destroyed
    );
    component.hp = nextComponentHealth.health;
    component.maxHp = nextComponentHealth.maxHealth;
    return true;
  }

  /** Lock or unlock incoming combat damage for the live preview boss hull. */
  setPreviewBossHullInvincibility(enabled: boolean, eventId?: string) {
    if (
      !this.previewMode
      || (eventId !== undefined && (!eventId || eventId.length > 160))
    ) return false;
    const boss = this.getPreviewBossTarget(eventId);
    if (!boss) return false;

    if (enabled) this.previewInvincibleBossHulls.add(boss);
    else this.previewInvincibleBossHulls.delete(boss);
    return true;
  }

  /** Lock or unlock one live destructible component without restarting. */
  setPreviewBossComponentInvincibility(
    componentId: string,
    enabled: boolean,
    eventId?: string
  ) {
    if (
      !this.previewMode
      || !componentId
      || componentId.length > 80
      || (eventId !== undefined && (!eventId || eventId.length > 160))
    ) return false;
    const boss = this.getPreviewBossTarget(eventId);
    const component = boss?.bossComponents?.find((candidate) => candidate.id === componentId);
    if (!component || component.destroyed) return false;

    if (enabled) this.previewInvincibleBossComponents.add(component);
    else this.previewInvincibleBossComponents.delete(component);
    return true;
  }

  private isPreviewBossHullInvincible(boss: Entity) {
    return this.previewMode && this.previewInvincibleBossHulls.has(boss);
  }

  private isPreviewBossComponentInvincible(component: BossComponentState) {
    return this.previewMode && this.previewInvincibleBossComponents.has(component);
  }

  seekPreviewToFrame(targetFrame: number) {
    if (!this.canUsePreviewControl()) return false;
    const frame = clampPreviewSeekFrame(targetFrame);
    this.restartPreview();
    for (let index = 0; index < frame && this.gameActive; index += 1) {
      this.update(false);
    }
    return true;
  }

  setTestMode(enabled: boolean) {
    this.testMode = Boolean(enabled);
    if (this.testMode && this.lives <= 0) {
      this.lives = Math.max(1, GAME_CONFIG.PLAYER_LIVES);
      this.stats.lives = this.lives;
      this.deathSequenceFrames = 0;
      this.deathSequenceStartedAtMs = 0;
      this.gameActive = true;
      this.playerDrawAlpha = 1;
      this.playerDrawScale = 1;
      this.setPlayerHomePosition();
    }
  }

  getConfiguredSpawnTargetCount(event: RuntimeSpawnEvent) {
    return getCampaignSpawnTargetCount({
      count: event.count,
      patternId: event.patternId,
      campaignCycle: this.getCampaignCycle()
    });
  }

  setPreviewInvincible(enabled: boolean) {
    this.previewInvincible = Boolean(enabled);
  }

  /**
   * Hot-swaps preview-only player equipment without reconstructing the fight.
   * Boss state, active entities/projectiles, RNG, score, player position, and
   * the current simulation frame deliberately remain untouched.
   */
  applyPreviewLoadout(update: PreviewPlayerLoadoutUpdate) {
    if (!this.canUsePreviewControl()) return false;

    this.playerShipId = update.playerShipId;
    this.playerShipUrl = update.playerShipUrl || ASSETS.PLAYER_SHIP;
    loadImage(this.playerShipUrl);
    this.stats.shipAbilityCooldownMax =
      getShipAbilityDefinition(this.playerShipId).cooldownFrames;
    this.stats.shipAbilityCooldown = this.previewShipAbilityNoCooldown
      ? 0
      : Math.min(
        Math.max(0, this.stats.shipAbilityCooldown),
        this.stats.shipAbilityCooldownMax
      );

    const nextLoadout = update.squadLoadout ?? null;
    const previousCompanions = new Map(
      this.squadCompanions.map((companion) => [
        `${companion.slot}:${companion.id}`,
        companion
      ])
    );
    const nextCompanions = (nextLoadout?.companions ?? []).map((companion, index) => {
      companion.frames.forEach(loadImage);
      const previous = previousCompanions.get(`${companion.slot}:${companion.id}`);
      const target = getSquadCompanionFormationTarget(
        this.player.x,
        this.player.y,
        this.player.width,
        this.player.height,
        companion.slot,
        index
      );
      return {
        ...companion,
        x: previous?.x ?? target.x,
        y: previous?.y ?? target.y,
        frameIndex: previous?.frameIndex ?? 0,
        fireTimer: previous
          ? Math.min(previous.fireTimer, companion.fireIntervalFrames)
          : Math.max(8, Math.floor(companion.fireIntervalFrames * (0.42 + index * 0.18))),
        shotSequence: previous?.shotSequence ?? 0,
        entryProgress: previous?.entryProgress ?? 0
      };
    });

    this.squadLoadout = nextLoadout;
    this.squadCompanions.splice(
      0,
      this.squadCompanions.length,
      ...nextCompanions
    );
    return true;
  }

  jumpToCampaignWave(stageNumber: number) {
    if (this.campaignWaves.length === 0) return false;

    const targetIndex = this.getFirstCampaignWaveIndexForStage(stageNumber);
    if (targetIndex < 0) return false;
    if (this.previewMode) this.gameplayRandom = createGameplayRandom(this.gameplayRandomSeed);
    this.currentCampaignIndex = targetIndex;
    this.wave = this.getStageNumberForCampaignIndex(targetIndex);
    this.stats.wave = this.wave;
    this.entities = [];
    this.pendingPlayerShots = [];
    this.pendingBossStrikes = [];
    this.pendingEnemyLasers = [];
    this.activePowerups.clear();
    this.gameActive = true;
    this.previewComplete = false;
    this.campaignComplete = false;
    this.resetWaveProgress();
    this.introFlightFrames = 0;
    this.waveDepartureFrames = 0;
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.invincibleTimer = 180;
    this.playerDrawScale = 1;
    this.playerDrawAlpha = 1;
    this.playerTilt = 0;
    this.playerVel = { x: 0, y: 0 };
    this.setPlayerHomePosition();
    this.refreshLoadState();
    this.beginWavePresentation();
    this.playSound('wave');
    return true;
  }

  getWaveVictorySummary() {
    return this.waveVictoryReady && this.waveVictorySummary
      ? { ...this.waveVictorySummary }
      : null;
  }

  /** Available at the logical clear boundary, before the Mission takeoff cinematic finishes. */
  getCampaignCompletionSummary() {
    return this.waveVictorySummary ? { ...this.waveVictorySummary } : null;
  }

  buildWaveVictorySummary(): WaveVictorySummary {
    const entry = this.getCurrentCampaignEntry();
    const defeatedMainBoss = entry?.wave.events.find((event) => (
      event.kind === 'boss' && isMajorBossId(event.bossId)
    ));
    const authoredNextCampaignIndex = getNextAuthoredCampaignIndex(
      this.currentCampaignIndex,
      this.campaignWaves.length
    );
    const stageComplete = this.isCurrentWaveStageFinal();
    const graphNode = stageComplete
      ? this.getCampaignGraphNodeForLevelId(entry?.level.id)
      : null;
    const graphOutgoingEdges = graphNode?.outgoingEdges ?? [];
    const graphNextNode = graphOutgoingEdges.length === 1
      ? this.campaign.campaignGraph?.nodes.find((node) => node.nodeId === graphOutgoingEdges[0].toNodeId) ?? null
      : null;
    const graphNextIndex = graphNextNode
      ? this.findCampaignWaveIndex(graphNextNode.missionDefinitionId)
      : -1;
    const nextCampaignIndex = graphNode
      ? graphNextIndex >= 0 ? graphNextIndex : null
      : authoredNextCampaignIndex;
    const nextEntry = nextCampaignIndex === null ? null : this.campaignWaves[nextCampaignIndex] ?? null;
    const hasNextStage = graphNode ? graphOutgoingEdges.length > 0 : nextCampaignIndex !== null;
    const finalStage = this.campaign.campaignGraph
      ? Math.max(1, ...this.campaign.campaignGraph.nodes.map((node) => Math.floor(node.depth)))
      : Math.max(1, getAuthoredCampaignStageCount(this.campaign.levels.length));
    const scoreStart = stageComplete ? this.waveStartScore : this.tacticalWaveStartScore;
    const enemyStart = stageComplete ? this.waveStartEnemiesDefeated : this.tacticalWaveStartEnemiesDefeated;
    const killCountStart = stageComplete
      ? this.waveStartVictoryKillCounts
      : this.tacticalWaveStartVictoryKillCounts;
    const observedKills = subtractWaveVictoryKillCounts(
      this.waveVictoryKillCounts,
      killCountStart
    );
    const coinStart = stageComplete ? this.waveStartTotalCoins : this.tacticalWaveStartTotalCoins;
    const damageTaken = stageComplete ? this.waveDamageTaken : this.tacticalWaveDamageTaken;
    const flightFrames = stageComplete ? this.waveFlightFrames : this.tacticalWaveFlightFrames;
    const presentDropDestroyed = stageComplete
      ? { ...this.presentDropDestroyed }
      : subtractPresentDropDestroyedCounts(
          this.presentDropDestroyed,
          this.tacticalPresentDropDestroyedStart
        );
    const presentDropCoinValueSpawned = stageComplete
      ? this.presentDropCoinValueSpawned
      : Math.max(
          0,
          this.presentDropCoinValueSpawned - this.tacticalPresentDropCoinValueSpawnedStart
        );
    const includePresentDrop = stageComplete
      ? this.presentDropStageActive
      : this.presentDropWaveActive;
    return {
      id: `${this.wave}-${this.frameCount}-${this.stats.score}`,
      campaignId: this.campaign.id,
      campaignRevision: this.campaign.revision,
      levelId: entry?.level.id ?? '',
      waveId: entry?.wave.id ?? '',
      waveNumber: (entry?.waveIndex ?? 0) + 1,
      waveTotal: entry?.level.waves.length ?? 1,
      stageComplete,
      bossEncounterId: defeatedMainBoss?.id ?? null,
      stage: this.wave,
      stageName: entry?.level.name ?? this.getWaveSector().name,
      finalWaveName: entry?.wave.name ?? 'FINAL WAVE',
      scoreEarned: Math.max(0, this.stats.score - scoreStart),
      totalScore: Math.max(0, this.stats.score),
      enemiesDefeated: Math.max(0, this.stats.enemiesDefeated - enemyStart),
      ...observedKills,
      coinsCollected: Math.max(0, this.stats.totalCoins - coinStart),
      waveCoinsCollected: Math.max(0, this.stats.totalCoins - this.tacticalWaveStartTotalCoins),
      damageTaken: Math.max(0, damageTaken),
      elapsedSeconds: Math.max(
        0,
        Math.round((flightFrames / GAME_CONFIG.FPS) * 1000) / 1000
      ),
      remainingLives: Math.max(0, this.lives),
      nextLevelId: nextEntry?.level.id ?? null,
      nextWaveId: nextEntry?.wave.id ?? null,
      nextWaveNumber: nextEntry ? nextEntry.waveIndex + 1 : null,
      nextStage: hasNextStage
        ? graphNextNode?.depth
          ?? graphNode?.depth
          ?? (nextCampaignIndex === null ? finalStage : this.getStageNumberForCampaignIndex(nextCampaignIndex))
        : finalStage,
      hasNextStage,
      campaignComplete: !hasNextStage,
      ...(includePresentDrop
        ? {
            presentDrop: {
              destroyed: presentDropDestroyed,
              destroyedTotal: getPresentDropDestroyedTotal(presentDropDestroyed),
              coinValueSpawned: Math.max(0, presentDropCoinValueSpawned)
            }
          }
        : {})
    };
  }

  jumpToCampaignBoss(stageNumber: number) {
    if ((!this.testMode && !this.previewMode) || !this.jumpToCampaignWave(stageNumber)) return false;

    const finalWaveIndex = this.getLastCampaignWaveIndexForCurrentStage();
    if (finalWaveIndex < 0) return false;
    this.currentCampaignIndex = finalWaveIndex;
    this.wave = this.getStageNumberForCampaignIndex(finalWaveIndex);
    this.stats.wave = this.wave;
    this.resetWaveProgress();
    this.beginWavePresentation();

    const bossEvents = this.getConfiguredEncounterEvents()
      .filter((event): event is RuntimeBossEvent => event.kind === 'boss');
    const mainBoss = bossEvents
      .slice()
      .reverse()
      .find((event) => this.getEncounterWarningType(event) === 'gatekeeper')
      ?? bossEvents[bossEvents.length - 1];

    const configuredEvents = this.getCurrentWaveDefinition()?.events ?? [];
    const climax = mainBoss
      ?? this.getConfiguredEncounterEvents().at(-1)
      ?? configuredEvents.slice().reverse().find((event) => (
        event.kind === 'spawn' && event.enemies.some((enemy) => enemy.rank === 'elite')
      ))
      ?? configuredEvents.at(-1);
    if (!climax) return false;

    const climaxStartSeconds = Math.max(0, Number(climax.startSeconds) || 0);
    this.waveProgressFrames = Math.round(climaxStartSeconds * GAME_CONFIG.FPS);
    this.stats.bossProgress = Math.min(1, this.waveProgressFrames / this.getConfiguredWaveDurationFrames());

    for (const event of configuredEvents) {
      if (Math.max(0, Number(event.startSeconds) || 0) > climaxStartSeconds) continue;

      if (event.kind === 'spawn' && event.id !== climax.id) {
        this.configuredSpawnCounts.set(event.id, Math.max(0, Math.floor(Number(event.count) || 0)));
        this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
      } else if (event.kind === 'powerup') {
        this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
      } else if (
        event.id !== climax.id
        && (event.kind === 'boss' || event.kind === 'asteroid-belt' || event.kind === 'supply-drop')
      ) {
        this.configuredEncounterIds.add(event.id);
      }
    }

    if (climax.kind === 'boss' || climax.kind === 'asteroid-belt' || climax.kind === 'supply-drop') {
      this.queueConfiguredEncounter(climax as RuntimeEncounterEvent);
    }
    return true;
  }

  restartPreview() {
    this.previewBossAttackLoop = null;
    this.gameplayRandom = createGameplayRandom(this.gameplayRandomSeed);
    this.entities
      .filter((entity) => entity.type === EntityType.BOSS)
      .forEach((boss) => this.clearBossTimelineActionLocks(boss));
    this.entities = [];
    this.pendingPlayerShots = [];
    this.activePowerups.clear();
    this.frameCount = 0;
    this.lastPlayerRamFrame = -999;
    this.lastPreviewPlayerHitFeedbackFrame = -999;
    this.gameActive = true;
    this.previewComplete = false;
    this.campaignComplete = false;
    this.lives = this.startingLives;
    this.stats.lives = this.lives;
    this.stats.score = 0;
    this.stats.coins = 0;
    this.stats.enemiesDefeated = 0;
    this.stats.shipAbilityCooldown = 0;
    this.waveVictoryKillCounts = createWaveVictoryKillCounts();
    this.creditedMiniBossEncounterIds.clear();
    this.creditedMajorBossEncounterIds.clear();
    this.resetWaveProgress();
    this.startTelemetrySession();
    this.introFlightFrames = 0;
    this.waveDepartureFrames = 0;
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.invincibleTimer = 180;
    this.lastPlayerRamFrame = -999;
    this.lastPreviewPlayerHitFeedbackFrame = -999;
    this.playerDrawScale = 1;
    this.playerDrawAlpha = 1;
    this.playerTilt = 0;
    this.playerVel = { x: 0, y: 0 };
    this.setPlayerHomePosition();
    this.refreshLoadState();
    this.beginWavePresentation();
  }

  getAnimatedFrame(frames: string[], entity: Entity, speed: number) {
    const index = (Math.floor(this.frameCount / speed) + entity.variant) % frames.length;
    return frames[index];
  }

  drawSprite(
    ctx: CanvasRenderingContext2D,
    url: string,
    width: number,
    height: number,
    options: {
      shadowColor?: string;
      shadowBlur?: number;
      rotation?: number;
      alpha?: number;
      yOffset?: number;
      filter?: string;
      compositeOperation?: GlobalCompositeOperation;
      spriteStyle?: SpriteStyle;
    } = {}
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return false;
    }

    const spriteStyle = options.spriteStyle;
    const styleFilters: string[] = [];
    if (spriteStyle?.hueRotateDegrees !== undefined) {
      styleFilters.push(`hue-rotate(${spriteStyle.hueRotateDegrees}deg)`);
    }
    if (spriteStyle?.saturation !== undefined) {
      styleFilters.push(`saturate(${spriteStyle.saturation})`);
    }
    if (spriteStyle?.brightness !== undefined) {
      styleFilters.push(`brightness(${spriteStyle.brightness})`);
    }
    const filter = [options.filter, ...styleFilters].filter(Boolean).join(' ');
    const rotation = (options.rotation ?? 0) + (((spriteStyle?.rotationDegrees ?? 0) * Math.PI) / 180);
    const scale = spriteStyle?.scale ?? 1;

    ctx.save();
    ctx.globalAlpha = (options.alpha ?? 1) * (spriteStyle?.opacity ?? 1);
    if (options.shadowColor) ctx.shadowColor = options.shadowColor;
    if (options.shadowBlur) ctx.shadowBlur = this.getGlowBlur(options.shadowBlur);
    if (spriteStyle?.glowColor !== undefined) ctx.shadowColor = spriteStyle.glowColor;
    if (spriteStyle?.glowBlur !== undefined) ctx.shadowBlur = this.getGlowBlur(spriteStyle.glowBlur);
    if (options.compositeOperation) ctx.globalCompositeOperation = options.compositeOperation;
    if (filter) ctx.filter = filter;
    if (rotation) ctx.rotate(rotation);
    if (spriteStyle && (scale !== 1 || spriteStyle.flipX)) {
      ctx.scale(spriteStyle.flipX ? -scale : scale, scale);
    }
    const yOffset = options.yOffset ?? 0;
    ctx.drawImage(img, -width / 2, -height / 2 + yOffset, width, height);
    ctx.restore();
    return true;
  }

  drawTiledLayer(
    ctx: CanvasRenderingContext2D,
    url: string,
    scale: number,
    speedY: number,
    speedX: number,
    alpha: number
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return;
    }

    const tileW = img.width * scale;
    const tileH = img.height * scale;
    const offsetY = -((this.frameCount * speedY) % tileH);
    const offsetX = -((this.frameCount * speedX) % tileW);

    ctx.save();
    ctx.globalAlpha = alpha;
    for (let x = offsetX - tileW; x < this.width + tileW; x += tileW) {
      for (let y = offsetY - tileH; y < this.height + tileH; y += tileH) {
        ctx.drawImage(img, x, y, tileW, tileH);
      }
    }
    ctx.restore();
  }

  drawBackgroundLayers(ctx: CanvasRenderingContext2D) {
    const lowDetail = this.isMobileProfile();
    const adaptiveLow = this.performanceMode;

    this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_BACK, 5, 0.06, 0.015, adaptiveLow ? 0.48 : 0.6);
    if (!adaptiveLow) {
      this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_STARS, 5, 0.1, 0.02, 0.45);
    }
    this.drawTiledLayer(ctx, ASSETS.GAME_BG_BACK, 5, 0.16, 0.03, adaptiveLow ? 0.18 : lowDetail ? 0.24 : 0.35);
    this.drawTiledLayer(ctx, ASSETS.GAME_BG_STARS, 5, 0.22, 0.035, adaptiveLow ? 0.34 : 0.5);
    if (!lowDetail) {
      this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_FAR_PLANETS, 5, 0.12, 0.02, 0.35);
    }

    ctx.save();
    ctx.globalAlpha = adaptiveLow ? 0.58 : 0.9;
    const horizon = getReadyImage(ASSETS.GAME_BG_PLANET);
    if (horizon) {
      const planetHeight = Math.max(220, this.height * 0.3);
      const planetYOffset = Math.max(180, this.height * 0.2);
      ctx.drawImage(horizon, 0, this.height - planetHeight + planetYOffset, this.width, planetHeight);
    }
    ctx.restore();

    const planetDrift = (this.frameCount * 0.2) % (this.width + 200);
    ctx.save();
    ctx.translate(this.width - 130, 110 + Math.sin(this.frameCount * 0.01) * 10);
    this.drawSprite(ctx, ASSETS.GAME_PARALLAX_BIG_PLANET, lowDetail ? 135 : 170, lowDetail ? 135 : 170, {
      alpha: adaptiveLow ? (lowDetail ? 0.28 : 0.4) : lowDetail ? 0.38 : 0.55
    });
    ctx.restore();

    ctx.save();
    ctx.translate((this.width + 100) - planetDrift, 180 + Math.sin(this.frameCount * 0.015) * 12);
    this.drawSprite(ctx, ASSETS.GAME_PARALLAX_RING_PLANET, lowDetail ? 70 : 90, lowDetail ? 140 : 180, {
      alpha: adaptiveLow ? (lowDetail ? 0.36 : 0.5) : lowDetail ? 0.52 : 0.75
    });
    ctx.restore();

    const configuredBackgroundId = this.getCurrentWaveDefinition()?.backgroundId ?? this.getCurrentLevelDefinition()?.backgroundId;
    const configuredTints: Record<string, string> = {
      'open-orbit': 'rgba(34, 211, 238, 0)',
      'citation-storm': 'rgba(79, 70, 229, 0.12)',
      'paywall-siege': 'rgba(245, 158, 11, 0.08)',
      'open-galaxy': 'rgba(16, 185, 129, 0.11)',
      'bastion-protocol': 'rgba(219, 39, 119, 0.08)'
    };
    const tintIndex = (this.wave - 1 + this.sectorTint) % 3;
    const tint = configuredBackgroundId
      ? configuredTints[configuredBackgroundId] ?? 'rgba(34, 211, 238, 0)'
      : [
          'rgba(34, 211, 238, 0)',
          'rgba(79, 70, 229, 0.12)',
          'rgba(16, 185, 129, 0.11)'
        ][tintIndex];
    if (tint !== 'rgba(34, 211, 238, 0)') {
      ctx.save();
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  refreshRenderProfile() {
    this.mobileProfile = this.width < MOBILE_DETAIL_BREAKPOINT || (this.height > this.width * 1.35 && this.width < 760);
  }

  setPerformanceMode(enabled: boolean) {
    this.performanceMode = enabled;
  }

  getGlowBlur(blur: number) {
    if (this.performanceMode) return this.mobileProfile ? Math.min(blur * 0.22, 5) : Math.min(blur * 0.55, 10);
    return this.mobileProfile ? Math.min(blur * 0.38, 8) : blur;
  }

  getParticleDensity() {
    if (this.heavySceneLoad && this.mobileProfile) return this.polishSettings.highDensityParticles ? 0.28 : 0.18;
    if (this.performanceMode) return this.mobileProfile
      ? (this.polishSettings.highDensityParticles ? 0.34 : 0.22)
      : (this.polishSettings.highDensityParticles ? 0.6 : 0.34);
    if (!this.polishSettings.highDensityParticles) return 0.42;
    return this.mobileProfile ? 0.62 : 1;
  }

  compactEntities() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (!entity.markedForDeletion) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
  }

  prepareEntitiesForContinue() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (entity.type !== EntityType.PROJECTILE && entity.type !== EntityType.MISSILE) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
    this.pendingPlayerShots.length = 0;
    this.refreshLoadState();
  }

  keepEntitiesForNextWave() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (!entity.markedForDeletion && shouldKeepInternalWaveEntity(entity.type, entity.isPlayerShot)) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
    this.refreshLoadState();
  }

  private clearStageBoundaryDebris(
    autoBankBossCoins: boolean,
    preserveRewardWindow: boolean = false,
    compactImmediately: boolean = true,
    preserveInternalWaveState: boolean = false
  ) {
    if (autoBankBossCoins) this.bankDepartingBossCoins();

    for (const entity of this.entities) {
      const preserveEntity = preserveInternalWaveState
        && shouldKeepInternalWaveEntity(entity.type, entity.isPlayerShot);
      if (!preserveEntity && shouldClearStageBoundaryEntityType(entity.type, preserveRewardWindow)) {
        for (const component of entity.bossComponents ?? []) {
          component.hp = 0;
          component.destroyed = true;
          component.exposed = false;
          component.flashFrames = 0;
        }
        entity.markedForDeletion = true;
      }
    }

    this.bossRef = null;
    this.miniBossRef = null;
    this.stats.isBossActive = false;
    this.stats.bossHp = 0;
    if (!preserveInternalWaveState) this.pendingPlayerShots.length = 0;
    this.pendingBossStrikes = [];
    this.pendingEnemyLasers = [];
    this.pendingConfiguredEncounter = null;
    this.pendingBossType = null;
    this.inBossWarningSequence = false;
    this.enemyTargetsBuffer.length = 0;
    this.playerShotsBuffer.length = 0;
    this.homingTargetsBuffer.length = 0;
    this.collisionBoxes.clear();
    if (!preserveInternalWaveState) this.playerAfterimages.length = 0;
    if (compactImmediately) this.compactEntities();
    this.refreshLoadState();
  }

  getPlayerHomePosition() {
    return {
      x: this.width / 2 - this.player.width / 2,
      y: this.height - this.player.height - (this.width < 520 ? 20 : 32)
    };
  }

  setPlayerHomePosition() {
    const home = this.getPlayerHomePosition();
    this.player.x = home.x;
    this.player.y = home.y;
  }

  spawnThrusterParticles(strength: number = 1) {
    const baseX = this.player.x + this.player.width / 2;
    const baseY = this.player.y + this.player.height * 0.82;
    const spread = this.player.width * 0.14;
    const takeoffActive = this.waveDepartureFrames > 0;
    const particleCap = takeoffActive
      ? Math.min(
        this.getParticleCap(),
        this.mobileProfile ? MOBILE_TAKEOFF_PARTICLE_CAP : DESKTOP_TAKEOFF_PARTICLE_CAP
      )
      : this.getParticleCap();
    const available = Math.max(0, particleCap - this.liveParticleCount);
    const requested = Math.max(1, Math.round(2 * strength * this.getParticleDensity()));
    const perFrameCap = takeoffActive
      ? (this.mobileProfile ? MOBILE_TAKEOFF_PARTICLES_PER_FRAME : DESKTOP_TAKEOFF_PARTICLES_PER_FRAME)
      : requested;
    const count = Math.min(requested, perFrameCap, available);

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const particle = new Particle(
        baseX + (side * spread) + randomRange(-4, 4),
        baseY + randomRange(4, 14),
        i % 3 === 0 ? '#ffffff' : '#22d3ee',
        randomRange(0.7, 2.4) * strength,
        randomRange(2.5, 5.8),
        randomRange(16, 32)
      );
      particle.vx *= 0.22;
      particle.vy = Math.abs(particle.vy) + randomRange(2.4, 5.8) * strength;
      this.entities.push(particle);
    }
    this.liveParticleCount += count;
  }

  updatePassiveEntities() {
    this.entities.forEach((entity) => {
      if (entity.type === EntityType.COIN) {
        this.updateCoinEntity(entity);
        return;
      }

      if (entity.type === EntityType.PARTICLE) {
        entity.x += entity.vx;
        entity.y += entity.vy;
        (entity as Particle).life--;
        if ((entity as Particle).life <= 0) entity.markedForDeletion = true;
      }

      if (entity.type === EntityType.EFFECT) {
        entity.x += entity.vx;
        entity.y += entity.vy;
        (entity as VisualEffect).life--;
        if ((entity as VisualEffect).life <= 0) entity.markedForDeletion = true;
      }
    });

    this.compactEntities();
  }

  /**
   * Stage-clear time is non-combat, but it is still live simulation time. Let
   * every already-fired shot finish its travel (and beams finish their life)
   * without applying collision damage or spawning fresh attacks.
   */
  updateStageCompletionProjectiles() {
    for (const entity of this.entities) {
      if (
        entity.markedForDeletion
        || (entity.type !== EntityType.PROJECTILE && entity.type !== EntityType.MISSILE)
      ) continue;

      if (this.isCrownClawProjectile(entity)) {
        // Returning claws have no valid owner once the boss is gone.
        entity.markedForDeletion = true;
        continue;
      }

      advanceStageCompletionProjectile(entity, this.width, this.height);
    }
  }

  updateHyperspeedBackground(speedBoost: number) {
    const extraSteps = Math.max(0, Math.floor(clamp(speedBoost, 1, 6)) - 1);
    for (let step = 0; step < extraSteps; step++) {
      this.stars.forEach((star) => star.update(this.width, this.height));
      this.bgEntities.forEach((background) => background.update(this.height));
    }
  }

  updateIntroFlight() {
    if (this.introFlightFrames <= 0) return;

    const age = this.introFlightDuration - this.introFlightFrames;
    const progress = clamp(age / this.introFlightDuration, 0, 1);
    const home = this.getPlayerHomePosition();
    const centerX = this.width / 2;
    const launchY = this.height + this.player.height * 0.75;
    const hoverY = Math.max(this.height * 0.45, home.y - this.player.height * 1.15);
    const stageOne = progress < 0.56;

    if (stageOne) {
      const t = easeOutCubic(progress / 0.56);
      this.player.x = centerX - this.player.width / 2;
      this.player.y = launchY + ((hoverY - launchY) * t);
      this.playerDrawScale = 1.62 - (0.18 * t);
      this.playerTilt = Math.sin(this.frameCount * 0.08) * 0.06;
      this.spawnThrusterParticles(1.9);
    } else {
      const t = easeInOutCubic((progress - 0.56) / 0.44);
      this.player.x = centerX - this.player.width / 2;
      this.player.y = hoverY + ((home.y - hoverY) * t);
      this.playerDrawScale = 1.44 + ((1 - 1.44) * t);
      this.playerTilt = lerp(this.playerTilt, 0, 0.08);
      this.spawnThrusterParticles(1.25);
    }

    this.playerDrawAlpha = clamp(progress / 0.08, 0, 1);
    this.updateIntroSquadCompanions();
    this.introFlightFrames--;

    if (this.introFlightFrames <= 0) {
      this.setPlayerHomePosition();
      this.playerDrawScale = 1;
      this.playerDrawAlpha = 1;
      this.playerTilt = 0;
      this.playerVel = { x: 0, y: 0 };
    }
  }

  updateWaveDeparture() {
    if (this.waveDepartureFrames <= 0) return;

    const takeoff = this.getStageTakeoffPresentation();
    const home = this.getPlayerHomePosition();
    const pose = getStageTakeoffPose(
      takeoff,
      this.stageTakeoffStartX,
      this.stageTakeoffStartY,
      home.x,
      home.y,
      this.height
    );
    this.player.x = pose.x;
    this.player.y = pose.y;
    this.playerDrawScale = pose.scale;
    this.playerDrawAlpha = 1;
    this.playerTilt = 0;
    this.playerVel = { x: 0, y: 0 };
    this.updateDepartureSquadCompanions(takeoff);

    if (takeoff.phase === 'launch' && !this.stageTakeoffBoostCuePlayed) {
      this.stageTakeoffBoostCuePlayed = true;
      this.playSound('launch');
    }

    if (this.waveDepartureFrames > STAGE_TAKEOFF_PARTICLE_CUTOFF_FRAMES) {
      this.spawnThrusterParticles(1.15 + takeoff.thrustStrength * 2.85);
    }
    this.updateHyperspeedBackground(1 + takeoff.travel * 8);

    this.waveDepartureFrames--;

    if (this.waveDepartureFrames <= 0) {
      this.clearStageBoundaryDebris(false);
      if (this.previewMode) {
        this.startNextWave();
        return;
      }

      this.playerDrawAlpha = 0;
      this.playerVel = { x: 0, y: 0 };
      this.waveVictoryReady = true;
      this.gameActive = false;
      this.campaignComplete = Boolean(this.waveVictorySummary?.campaignComplete);
    }
  }

  private syncPlayerLives(nextLives: number = this.lives) {
    const lives = clampPlayerLives(nextLives, GAME_CONFIG.MAX_LIVES);
    this.lives = lives;
    this.stats.lives = lives;
    return lives;
  }

  private applyPlayerLifeDamage(incomingDamage: number) {
    const transition = resolvePlayerLifeDamage(
      this.lives,
      incomingDamage,
      GAME_CONFIG.MAX_LIVES
    );
    this.syncPlayerLives(transition.lives);
    return transition;
  }

  startDeathSequence() {
    this.syncPlayerLives();
    if (this.deathSequenceFrames > 0 || !this.gameActive) return;

    if (this.telemetrySink && this.telemetrySessionActive) {
      this.telemetrySink.record({
        ...this.getTelemetryContext(),
        type: 'player-death',
        livesRemaining: Math.max(0, this.lives)
      });
    }
    this.deathSequenceFrames = this.deathSequenceDuration;
    this.deathSequenceStartedAtMs = Date.now();
    this.invincibleTimer = 999;
    this.flashAlpha = Math.max(this.flashAlpha, 0.72);
    this.addShake(14);
    this.addHitStop(14);
    this.playSound('gameover');
    this.spawnFloatingText(this.width / 2, this.height * 0.42, 'MISSION LOST', '#fb7185', 24);
  }

  updateDeathSequence() {
    if (this.deathSequenceFrames <= 0) return;

    if (
      this.deathSequenceStartedAtMs > 0
      && Date.now() - this.deathSequenceStartedAtMs >= this.deathSequenceMaxDurationMs
    ) {
      this.finishDeathSequence();
      return;
    }

    const progress = 1 - (this.deathSequenceFrames / this.deathSequenceDuration);
    this.playerDrawAlpha = Math.max(0, 1 - progress * 1.4);
    this.playerDrawScale = 1 + (progress * 0.42);
    this.addShake(0.55 + progress * 0.85);
    if (this.frameCount % 5 === 0) {
      this.spawnBurst(
        this.player.x + this.player.width / 2 + randomRange(-18, 18),
        this.player.y + this.player.height / 2 + randomRange(-18, 18),
        progress < 0.5 ? '#67e8f9' : '#fb7185',
        4,
        3.4,
        4
      );
    }

    this.deathSequenceFrames--;

    if (this.deathSequenceFrames <= 0) {
      this.finishDeathSequence();
    }
  }

  finishDeathSequence() {
    this.syncPlayerLives();
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.hitStopFrames = 0;
    this.gameActive = false;
    if (this.audioEnabled) audioService.stopMusic();
  }

  continueRun(lives: number = GAME_CONFIG.PLAYER_LIVES) {
    this.gameActive = true;
    this.campaignComplete = false;
    if (this.audioEnabled) audioService.startMusic();
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.waveDepartureFrames = 0;
    this.introFlightFrames = 0;
    this.syncPlayerLives(resolvePlayerRevivalLives(lives, GAME_CONFIG.MAX_LIVES));
    this.invincibleTimer = 180;
    this.lastPlayerRamFrame = -999;
    this.lastPreviewPlayerHitFeedbackFrame = -999;
    this.setPlayerHomePosition();
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
    this.playerSquash = -0.12;
    this.playerSquashVelocity = 0;
    this.playerDrawAlpha = 1;
    this.playerDrawScale = 1;
    this.prepareEntitiesForContinue();
    this.flashAlpha = Math.max(this.flashAlpha, 0.35);
    this.addShake(2.6);
    this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#67e8f9');
    this.spawnFloatingText(this.width / 2, this.height * 0.42, 'CONTINUE', '#67e8f9', 24);
    this.playSound('launch');
  }

  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.refreshRenderProfile();
    this.setPlayerHomePosition();
    this.entities = [];
    this.bgEntities = [];
    this.stars = [];
    const lowDetail = this.mobileProfile;

    for (let i = 0; i < (lowDetail ? 2 : 4); i++) {
        this.bgEntities.push(new BackgroundEntity(width, height));
    }
    for (let i = 0; i < (lowDetail ? 92 : 160); i++) {
      this.stars.push(new Star(width, height));
    }

    this.gameActive = true;
    this.lives = this.startingLives;
    this.stats.lives = this.lives;
    const requestedInitialCampaignIndex = this.findCampaignWaveIndex(
      this.initialLevelId,
      this.initialWaveId
    );
    this.currentCampaignIndex = requestedInitialCampaignIndex >= 0
      ? requestedInitialCampaignIndex
      : 0;
    this.wave = this.getStageNumberForCampaignIndex();
    this.stats.score = 0;
    this.stats.coins = 0;
    this.stats.totalCoins = 0;
    this.stats.bombs = 2;
    this.stats.bombCharge = this.testMode ? getChargeForStoredFlasks(40) : 0;
    this.stats.bombChargeMax = BASE_FLASK_CHARGE_MAX;
    this.stats.shipAbilityCooldown = 0;
    this.stats.shipAbilityCooldownMax = getShipAbilityDefinition(this.playerShipId).cooldownFrames;
    this.stats.wave = this.wave;
    this.frameCount = 0;
    this.waveVictoryKillCounts = createWaveVictoryKillCounts();
    this.creditedMiniBossEncounterIds.clear();
    this.creditedMajorBossEncounterIds.clear();
    this.resetWaveProgress();
    this.startTelemetrySession();
    this.beginWavePresentation();
    this.bossRef = null;
    this.miniBossRef = null;
    this.activePowerups.clear();
    this.lastPlayerRamFrame = -999;
    this.lastPreviewPlayerHitFeedbackFrame = -999;
    this.missileTimer = 0;
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
    this.resetSquadCompanionPositions();
    this.playerSquash = -0.18;
    this.playerSquashVelocity = 0;
    this.playerAfterimages = [];
    this.shakeStrength = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.hitStopFrames = 0;
    this.coinCombo = 0;
    this.coinComboTimer = 0;
    this.lastShotFrame = -999;
    this.lastPrimaryImpactShakeFrame = -999;
    this.bioBeamCanvasVisualStartFrame = -1;
    this.lastBombFrame = -999;
    this.weaponVolley = 0;
    this.playerFireCooldownFrames = 0;
    this.announcedFireRateLevel = Math.min(this.stats.upgrades.fireRate || 0, FIRE_RATE_MAX_LEVEL);
    const configuredIntroSeconds = Number(this.getCurrentWaveDefinition()?.introSeconds);
    this.introFlightDuration = Number.isFinite(configuredIntroSeconds) && configuredIntroSeconds >= 0
      ? Math.max(0, Math.round(configuredIntroSeconds * GAME_CONFIG.FPS))
      : 150;
    this.introFlightFrames = this.previewMode ? 0 : this.introFlightDuration;
    this.waveDepartureFrames = 0;
    this.stageRewardCollectionFrames = 0;
    this.stageRewardCollectionDuration = 0;
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.playerDrawScale = this.previewMode || this.introFlightFrames <= 0 ? 1 : 1.55;
    this.playerDrawAlpha = this.previewMode || this.introFlightFrames <= 0 ? 1 : 0;
    if (this.introFlightFrames > 0) {
      this.player.x = this.width / 2 - this.player.width / 2;
      this.player.y = this.height + this.player.height * 0.75;
      this.resetSquadCompanionPositions();
    }
    this.sectorTint = 0;

    // START MUSIC
    if (this.audioEnabled) audioService.startMusic();
    this.playSound('launch');
  }

  resetWaveProgress(resetStageSummary: boolean = true) {
    this.previewBossAttackLoop = null;
    this.miniBossLabEncounters.clear();
    this.compactMiniBossHealthBarsVisible = true;
    this.stats.bossProgress = 0;
    this.stats.isBossActive = false;
    this.stats.bossHp = 0;
    this.stats.bossMaxHp = 100;
    this.waveProgressFrames = 0;
    this.bossRef = null;
    this.miniBossRef = null;
    this.spawnedMiniBoss1 = false;
    this.spawnedWallBoss = false;
    this.mainBossDefeated = false;
    this.asteroidBeltMaxCount = 0;
    this.inBossWarningSequence = false;
    this.bossWarningDuration = 0;
    this.pendingBossType = null;
    this.waveTransitionPending = false;
    this.internalWaveLooseEntriesRemaining = 0;
    this.previewComplete = false;
    this.configuredEncounterIds.clear();
    if (resetStageSummary) {
      this.campaignFormationPackInstances.clear();
      this.campaignFormationPackLastRetiredFrames.clear();
    } else {
      // Internal Waves preserve living formation members. Close only the
      // previous Wave's fully retired event instances so the next authored
      // pack observes both max-instance and recovery limits.
      this.reconcileCampaignFormationPackInstances();
    }
    this.configuredSpawnCounts.clear();
    this.configuredSpawnFrames.clear();
    this.authoredWaveThreatSpent = 0;
    this.wavePlayerDamageDealt = 0;
    this.waveEnemyTimeToKillFrames = 0;
    this.waveEnemyKillsMeasured = 0;
    this.peakProjectileCount = 0;
    this.escalationWarningsShown.clear();
    this.pendingBossStrikes = [];
    this.pendingEnemyLasers = [];
    this.pendingConfiguredEncounter = null;
    this.stageRewardCollectionFrames = 0;
    this.stageRewardCollectionDuration = 0;
    this.stageTakeoffBoostCuePlayed = false;
    this.waveVictoryReady = false;
    this.waveVictorySummary = null;
    this.tacticalWaveStartScore = this.stats.score;
    this.tacticalWaveStartEnemiesDefeated = this.stats.enemiesDefeated;
    this.tacticalWaveStartVictoryKillCounts = { ...this.waveVictoryKillCounts };
    this.tacticalWaveStartTotalCoins = this.stats.totalCoins;
    this.tacticalWaveDamageTaken = 0;
    this.tacticalWaveFlightFrames = 0;
    const currentWaveHasPresentDrop = this.getConfiguredEncounterEvents().some((event) => (
      event.kind === 'supply-drop'
    ));
    this.presentDropWaveActive = currentWaveHasPresentDrop;
    this.presentDropCueShown = false;
    if (resetStageSummary) {
      this.waveStartScore = this.stats.score;
      this.waveStartEnemiesDefeated = this.stats.enemiesDefeated;
      this.waveStartVictoryKillCounts = { ...this.waveVictoryKillCounts };
      this.creditedMiniBossEncounterIds.clear();
      this.creditedMajorBossEncounterIds.clear();
      this.waveStartTotalCoins = this.stats.totalCoins;
      this.waveDamageTaken = 0;
      this.waveFlightFrames = 0;
      this.presentDropDestroyed = createPresentDropDestroyedCounts();
      this.presentDropCoinValueSpawned = 0;
      this.presentDropStageActive = currentWaveHasPresentDrop;
    } else {
      this.presentDropStageActive ||= currentWaveHasPresentDrop;
    }
    this.tacticalPresentDropDestroyedStart = { ...this.presentDropDestroyed };
    this.tacticalPresentDropCoinValueSpawnedStart = this.presentDropCoinValueSpawned;
  }

  getPlayerMovementSpeed() {
    const speedLevel = Math.min(this.stats.upgrades.speed || 0, 7);
    return GAME_CONFIG.BASE_PLAYER_SPEED
      + (Math.min(speedLevel, 5) * 1.5)
      + (speedLevel >= 6 ? 3 : 0)
      + (speedLevel >= 7 ? 2 : 0);
  }

  updateStageRewardCollection() {
    if (this.stageRewardCollectionFrames <= 0) return;
    this.updatePlayerMovement(this.getPlayerMovementSpeed());
    this.updateSquadCompanions();
    this.updateStageCompletionProjectiles();
    this.spawnThrusterParticles(0.65);
    this.stageRewardCollectionFrames--;
    if (this.stageRewardCollectionFrames <= 0) this.beginStageTakeoff();
  }

  continueToNextWave() {
    if (!this.waveVictoryReady || !this.waveTransitionPending) return false;
    if (this.campaign.campaignGraph && this.isCurrentWaveStageFinal()) return false;
    if (
      this.waveVictorySummary?.campaignComplete
      || getNextAuthoredCampaignIndex(this.currentCampaignIndex, this.campaignWaves.length) === null
    ) {
      this.campaignComplete = true;
      return false;
    }

    this.waveVictoryReady = false;
    this.startNextWave();
    return true;
  }

  /**
   * Continues a completed graph Mission through one explicit authored edge.
   * Route choice and persistence stay outside the simulation; this boundary
   * only accepts a direct target so sibling routes cannot be inferred by order.
   */
  continueToCampaignMission(levelId: string, waveId?: string) {
    if (!this.waveVictoryReady || !this.waveTransitionPending) return false;
    const currentEntry = this.getCurrentCampaignEntry();
    const currentNode = this.getCampaignGraphNodeForLevelId(currentEntry?.level.id);
    const targetNode = this.getCampaignGraphNodeForLevelId(levelId);
    if (!currentNode || !targetNode) return false;
    if (!currentNode.outgoingEdges.some((edge) => edge.toNodeId === targetNode.nodeId)) return false;
    const requestedIndex = this.findCampaignWaveIndex(levelId, waveId);
    const targetIndex = requestedIndex >= 0 ? requestedIndex : this.findCampaignWaveIndex(levelId);
    if (targetIndex < 0) return false;

    this.waveVictoryReady = false;
    this.startNextWave(targetIndex);
    return true;
  }

  getConfiguredSpawnsComplete() {
    return this.getConfiguredSpawnEvents().every((event) => (
      (this.configuredSpawnCounts.get(event.id) || 0) >= this.getConfiguredSpawnTargetCount(event)
    ));
  }

  getConfiguredEncountersComplete() {
    return this.getConfiguredEncounterEvents().every((event) => this.configuredEncounterIds.has(event.id))
      && this.pendingConfiguredEncounter === null;
  }

  completeClearWaveIfReady() {
    const completionRule = this.getCurrentWaveCompletionRule();
    if (!shouldCompleteClearWave({
      completionRule,
      elapsedFrames: this.waveProgressFrames,
      durationFrames: this.getConfiguredWaveDurationFrames(),
      scheduledSpawnsComplete: this.getConfiguredSpawnsComplete(),
      scheduledEncountersComplete: this.getConfiguredEncountersComplete(),
      activeThreatCount: this.getActiveThreatCount(),
      warningActive: this.inBossWarningSequence,
      transitionPending: this.waveTransitionPending
    })) return false;

    this.stats.bossProgress = 1;
    this.stats.isBossActive = false;
    this.waveTransitionPending = true;
    if (!this.isCurrentWaveStageFinal()) {
      this.beginTacticalWaveCompletion();
      return true;
    }

    this.beginStageCompletion('MISSION COMPLETE!', '#67e8f9');
    this.playSound('wave');
    return true;
  }

  beginTacticalWaveCompletion() {
    this.waveTransitionPending = true;
    this.clearStageBoundaryDebris(false, true, false, true);
    this.pendingBossStrikes = [];
    for (const pendingLaser of this.pendingEnemyLasers) {
      const telegraph = this.entities.find((entity) => entity.id === pendingLaser.telegraphId);
      if (telegraph) telegraph.markedForDeletion = true;
    }
    this.pendingEnemyLasers = [];
    this.startNextWave();
  }

  beginStageCompletion(label: string, color: string) {
    this.waveTransitionPending = true;
    this.clearStageBoundaryDebris(false, true, false);
    this.pendingBossStrikes = [];
    for (const pendingLaser of this.pendingEnemyLasers) {
      const telegraph = this.entities.find((entity) => entity.id === pendingLaser.telegraphId);
      if (telegraph) telegraph.markedForDeletion = true;
    }
    this.pendingEnemyLasers = [];
    this.waveVictorySummary = this.buildWaveVictorySummary();
    this.recordWaveCompletion();
    this.recordCompletion('mission');
    if (this.waveVictorySummary.campaignComplete) this.recordCompletion('campaign');
    this.spawnFloatingText(this.width / 2, this.height / 2, label, color);
    const configuredDelaySeconds = Number(this.getCurrentWaveDefinition()?.delayAfterSeconds);
    const collectionSeconds = Number.isFinite(configuredDelaySeconds) && configuredDelaySeconds >= 0
      ? configuredDelaySeconds
      : 0;
    this.stageRewardCollectionDuration = Math.max(0, Math.round(collectionSeconds * GAME_CONFIG.FPS));
    this.stageRewardCollectionFrames = this.stageRewardCollectionDuration;
    if (this.stageRewardCollectionFrames <= 0) this.beginStageTakeoff();
  }

  beginStageTakeoff() {
    this.stageRewardCollectionFrames = 0;
    this.clearStageBoundaryDebris(true);
    // Capture the final post-collection totals even when every reward coin was
    // picked up manually before takeoff (and therefore there was nothing left
    // for bankDepartingBossCoins to credit). Keep the immutable attempt fields
    // stable so persistence still recognizes this as the same completion.
    this.refreshWaveVictorySummaryMetrics();
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
    this.playerDrawScale = 1;
    this.playerDrawAlpha = 1;
    this.stageTakeoffBoostCuePlayed = false;
    this.stageTakeoffStartX = this.player.x;
    this.stageTakeoffStartY = this.player.y;
    this.waveDepartureDuration = STAGE_TAKEOFF_FRAMES;
    this.waveDepartureFrames = this.waveDepartureDuration;
  }

  getPlayerMovementBounds() {
    return {
      minX: -this.player.width / 2,
      maxX: this.width - (this.player.width / 2),
      minY: -this.player.height / 2,
      maxY: this.height - (this.player.height / 2)
    };
  }

  startNextWave(explicitCampaignIndex?: number) {
    if (this.waveTransitionPending === false && this.mainBossDefeated === false) {
      return;
    }

    this.recordWaveCompletion();
    if (this.previewMode) {
      this.waveDepartureFrames = 0;
      this.stageRewardCollectionFrames = 0;
      this.previewComplete = true;
      this.gameActive = false;
      this.recordCompletion('preview');
      this.stopTelemetrySession('complete');
      return;
    }

    const previousEntry = this.getCurrentCampaignEntry();
    const nextCampaignIndex = explicitCampaignIndex === undefined
      ? getNextAuthoredCampaignIndex(this.currentCampaignIndex, this.campaignWaves.length)
      : Number.isInteger(explicitCampaignIndex)
        && explicitCampaignIndex >= 0
        && explicitCampaignIndex < this.campaignWaves.length
          ? explicitCampaignIndex
          : null;
    if (nextCampaignIndex === null) {
      this.campaignComplete = true;
      this.waveVictoryReady = true;
      this.gameActive = false;
      this.recordCompletion('campaign');
      this.stopTelemetrySession('complete');
      return;
    }
    this.currentCampaignIndex = nextCampaignIndex;
    const nextEntry = this.getCurrentCampaignEntry();
    const stageBoundary = !previousEntry || !nextEntry || previousEntry.level.id !== nextEntry.level.id;
    this.wave = this.getStageNumberForCampaignIndex();
    this.stats.wave = this.wave;
    this.resetWaveProgress(stageBoundary);
    this.campaignComplete = false;
    this.gameActive = true;
    this.campaignComplete = false;
    this.keepEntitiesForNextWave();
    const firstSpawnPattern = String(this.getConfiguredSpawnEvents()[0]?.patternId || '').toLowerCase();
    const firstSpawnUsesFormation = Boolean(firstSpawnPattern)
      && !firstSpawnPattern.includes('single')
      && !firstSpawnPattern.includes('random');
    this.internalWaveLooseEntriesRemaining = !stageBoundary && firstSpawnUsesFormation
      ? INTERNAL_WAVE_LOOSE_ENTRY_COUNT
      : 0;
    if (stageBoundary) {
      this.beginWavePresentation('mission');
      this.playSound('wave');
    } else {
      // The presentation is visual only: simulation, steering, firing, and
      // enemy scheduling continue on the very next fixed step.
      this.beginWavePresentation('internal-wave');
    }
    const configuredIntroSeconds = Number(this.getCurrentWaveDefinition()?.introSeconds);
    this.introFlightDuration = stageBoundary
      ? Number.isFinite(configuredIntroSeconds) && configuredIntroSeconds >= 0
        ? Math.max(0, Math.round(configuredIntroSeconds * GAME_CONFIG.FPS))
        : 118
      : 0;
    this.introFlightFrames = this.introFlightDuration;
    this.playerDrawScale = this.introFlightFrames > 0 ? 1.46 : 1;
    this.playerDrawAlpha = this.introFlightFrames > 0 ? 0 : 1;
    if (stageBoundary) {
      this.playerVel = { x: 0, y: 0 };
      this.playerTilt = 0;
      if (this.introFlightFrames > 0) {
        this.player.x = this.width / 2 - this.player.width / 2;
        this.player.y = this.height + this.player.height * 0.75;
      } else {
        this.setPlayerHomePosition();
      }
      this.resetSquadCompanionPositions();
    }
    this.sectorTint = (this.sectorTint + 1) % 3;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.refreshRenderProfile();
    for (const boss of this.entities) {
      if (
        !boss.bossCornerAmbushBeamState
        && !boss.bossCornerAmbushRamState
        && !boss.bossTrackingPincerState
        && !boss.bossHeliosCornerClampState
        && !boss.bossHeliosMachineGunChannelState
      ) continue;
      boss.bossCornerAmbushBeamState = undefined;
      boss.bossCornerAmbushRamState = undefined;
      boss.bossTrackingPincerState = undefined;
      boss.bossHeliosCornerClampState = undefined;
      boss.bossHeliosMachineGunChannelState = undefined;
      boss.isCharging = false;
      this.removeBossCornerAmbushBeams(boss);
    }
    this.entities.forEach(e => {
        if (e.type === EntityType.PLAYER) {
            const bounds = this.getPlayerMovementBounds();
            e.x = Math.max(bounds.minX, Math.min(bounds.maxX, e.x));
            e.y = Math.max(bounds.minY, Math.min(bounds.maxY, e.y));
        }
    });
  }

  handleInput(keys: Record<string, boolean>, touchPos: { x: number, y: number } | null) {
    this.keys = keys;
    if (touchPos !== undefined) {
        this.touchPos = touchPos;
    }
  }

  isMobileProfile() {
    return this.mobileProfile;
  }

  getWaveSector() {
    const entry = this.getCurrentCampaignEntry();
    if (entry) {
      return {
        name: entry.level.name,
        accent: entry.wave.accent || WAVE_SECTORS[(Math.max(1, this.wave) - 1) % WAVE_SECTORS.length].accent
      };
    }
    return WAVE_SECTORS[(Math.max(1, this.wave) - 1) % WAVE_SECTORS.length];
  }

  getParticleCap() {
    if (this.heavySceneLoad && this.mobileProfile) return Math.floor(MOBILE_PARTICLE_CAP * 0.46);
    if (this.performanceMode) return this.mobileProfile ? Math.floor(MOBILE_PARTICLE_CAP * 0.58) : Math.floor(DESKTOP_PARTICLE_CAP * 0.68);
    return this.isMobileProfile() ? MOBILE_PARTICLE_CAP : DESKTOP_PARTICLE_CAP;
  }

  getEffectCap() {
    if (this.heavySceneLoad && this.mobileProfile) return Math.floor(MOBILE_EFFECT_CAP * 0.5);
    if (this.performanceMode) return this.mobileProfile ? Math.floor(MOBILE_EFFECT_CAP * 0.62) : Math.floor(DESKTOP_EFFECT_CAP * 0.72);
    return this.isMobileProfile() ? MOBILE_EFFECT_CAP : DESKTOP_EFFECT_CAP;
  }

  getThreatCap() {
    const configuredCap = Number(this.getCurrentWaveDefinition()?.threatCap);
    const progressionCap = Number.isFinite(configuredCap) && configuredCap > 0
      ? Math.min(DESKTOP_THREAT_CAP, Math.floor(configuredCap))
      : Math.min(DESKTOP_THREAT_CAP, MOBILE_THREAT_CAP + ((Math.max(1, this.wave) - 1) * 3));
    if (this.performanceMode && this.mobileProfile) return Math.max(MOBILE_THREAT_CAP - 4, Math.floor(progressionCap * 0.9));
    return progressionCap;
  }

  getCampaignEnemyRole(roleId?: string) {
    if (!roleId) return null;
    return this.campaign.enemyRoles.find((role) => role.id === roleId) ?? null;
  }

  getCurrentFormationPacks() {
    const ids = this.getCurrentWaveDefinition()?.formationPackIds ?? [];
    const idSet = new Set(ids);
    return this.campaign.formationPacks.filter((pack) => idSet.has(pack.id));
  }

  getCampaignFormationPackForSpawn(event: RuntimeSpawnEvent) {
    return resolveCampaignFormationPackForSpawn(event, this.getCurrentFormationPacks());
  }

  getCampaignFormationPackInstanceId(eventId: string, campaignIndex: number = this.currentCampaignIndex) {
    return `${campaignIndex}:${eventId}`;
  }

  reconcileCampaignFormationPackInstances() {
    for (const [instanceId, instance] of this.campaignFormationPackInstances) {
      if (instance.retired) continue;
      const eventCanStillSpawn = instance.campaignIndex === this.currentCampaignIndex
        && instance.spawnedCount < instance.targetCount;
      if (eventCanStillSpawn) continue;
      const hasLivingMember = this.entities.some((entity) => (
        !entity.markedForDeletion
        && entity.campaignFormationPackInstanceId === instanceId
      ));
      if (hasLivingMember) continue;

      instance.retired = true;
      const previousRetiredFrame = this.campaignFormationPackLastRetiredFrames.get(instance.packId);
      this.campaignFormationPackLastRetiredFrames.set(
        instance.packId,
        Math.max(previousRetiredFrame ?? 0, this.frameCount)
      );
    }
  }

  getActiveCampaignFormationPackInstanceCount(packId: string) {
    let count = 0;
    for (const instance of this.campaignFormationPackInstances.values()) {
      if (!instance.retired && instance.packId === packId) count++;
    }
    return count;
  }

  getCurrentWaveSimultaneousShooterLimit() {
    const authoredRoleLimit = deriveCampaignWaveSimultaneousShooterLimit(
      this.getConfiguredSpawnEvents(),
      this.campaign.enemyRoles
    );
    return getCampaignSimultaneousShooterLimit(this.wave, authoredRoleLimit);
  }

  getAllowedCampaignShooterIds() {
    const limit = this.getCurrentWaveSimultaneousShooterLimit();
    if (limit === undefined) return undefined;
    const candidates = this.entities
      .filter((entity) => (
        !entity.markedForDeletion
        && entity.campaignRoleId !== undefined
        && entity.campaignFireBehavior !== undefined
        && entity.campaignFireBehavior !== 'none'
      ))
      .map((entity) => ({
        id: entity.id,
        priority: entity.isElite || (
          entity.campaignFormationFiringBehavior === 'priority'
          && isCampaignPriorityFireRole(entity.campaignGameplayRole)
        ),
        spawnFrame: entity.campaignSpawnFrame,
        sourceEventId: entity.sourceEventId,
        formationIndex: entity.formationIndex
      }));
    return new Set(selectCampaignShooterSlotIds(candidates, limit));
  }

  getActiveCampaignShooterCount() {
    const allowedShooterIds = this.getAllowedCampaignShooterIds();
    if (allowedShooterIds) return allowedShooterIds.size;
    return this.entities.reduce((count, entity) => (
      !entity.markedForDeletion
      && this.isEnemyTarget(entity)
      && (
        entity.isElite
        || (entity.campaignFireBehavior !== undefined && entity.campaignFireBehavior !== 'none')
      )
        ? count + 1
        : count
    ), 0);
  }

  getCampaignFormationFiringBehavior(roleId?: string) {
    return resolveCampaignFormationFiringBehavior(roleId, this.getCurrentFormationPacks());
  }

  getCurrentWaveCombatBudget() {
    const configured = Number(this.getCurrentWaveDefinition()?.combatBudget);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : this.getThreatCap();
  }

  getCurrentMobilePerformanceBudget() {
    const packs = this.getCurrentFormationPacks();
    const authoredCost = packs.reduce((total, pack) => total + Math.max(0, pack.mobilePerformanceCost), 0);
    if (authoredCost > 0) return Math.max(12, Math.min(40, authoredCost + 6));
    return Math.max(12, Math.min(36, this.getThreatCap()));
  }

  getActiveCampaignThreatCost() {
    return this.entities.reduce((total, entity) => {
      if (entity.markedForDeletion || !this.isEnemyTarget(entity)) return total;
      if (entity.type === EntityType.BOSS) return total + 12;
      if (entity.type === EntityType.MINI_BOSS) return total + 6;
      return total + Math.max(0.25, entity.campaignThreatCost || 1);
    }, 0);
  }

  getActiveCampaignPerformanceCost() {
    return this.entities.reduce((total, entity) => (
      entity.markedForDeletion || !this.isEnemyTarget(entity)
        ? total
        : total + Math.max(0.25, entity.campaignPerformanceCost || 1)
    ), 0);
  }

  getActiveCampaignRoleCount(roleId: string) {
    return this.entities.reduce((count, entity) => (
      !entity.markedForDeletion && entity.campaignRoleId === roleId ? count + 1 : count
    ), 0);
  }

  countEntities(type: EntityType) {
    let count = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (!entity.markedForDeletion && entity.type === type) count++;
    }
    return count;
  }

  getActiveThreatCount() {
    let count = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (!entity.markedForDeletion && this.isEnemyTarget(entity)) count++;
    }
    return count;
  }

  updateJuiceSystems() {
    if (!this.polishSettings.screenShake) {
      this.shakeStrength = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    } else {
      this.shakeStrength = moveToward(this.shakeStrength, 0, GAME_FEEL.shakeDecay);
      if (this.shakeStrength > 0.01) {
        this.shakeX = randomRange(-1, 1) * this.shakeStrength;
        this.shakeY = randomRange(-1, 1) * this.shakeStrength;
      } else {
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }

    this.flashAlpha = moveToward(this.flashAlpha, 0, GAME_FEEL.flashDecay);

    if (this.coinComboTimer > 0) {
      this.coinComboTimer--;
    } else {
      this.coinCombo = 0;
    }

    this.playerSquashVelocity += -this.playerSquash * GAME_FEEL.squashSpring;
    this.playerSquashVelocity *= GAME_FEEL.squashDamping;
    this.playerSquash += this.playerSquashVelocity;
    if (Math.abs(this.playerSquash) < 0.001 && Math.abs(this.playerSquashVelocity) < 0.001) {
      this.playerSquash = 0;
      this.playerSquashVelocity = 0;
    }

    for (let index = this.playerAfterimages.length - 1; index >= 0; index--) {
      const image = this.playerAfterimages[index];
      image.alpha -= 0.045;
      if (image.alpha <= 0) {
        this.playerAfterimages.splice(index, 1);
      }
    }
  }

  addShake(amount: number) {
    if (!this.polishSettings.screenShake) return;
    this.shakeStrength = Math.max(this.shakeStrength, amount);
  }

  registerPrimaryWeaponImpact(target: Entity, shot: Entity) {
    if (
      !this.polishSettings.screenShake
      || !shot.isPlayerShot
      || shot.type !== EntityType.PROJECTILE
      || (shot.weaponKind !== 'pulse' && shot.weaponKind !== 'bio-primary')
      || shot.isBeam
      || shot.shipAbilityKind
      || shot.squadAbilityKind
      || (target.type !== EntityType.BOSS && target.type !== EntityType.MINI_BOSS && !target.isElite)
    ) {
      return;
    }

    const cooldownFrames = getPrimaryImpactShakeCooldownFrames(this.mobileProfile);
    if (this.frameCount - this.lastPrimaryImpactShakeFrame < cooldownFrames) return;
    this.lastPrimaryImpactShakeFrame = this.frameCount;
    this.addShake(getPrimaryImpactShakeStrength(this.shouldUseLeanEffects(), target.type === EntityType.BOSS));
  }

  addHitStop(frames: number) {
    this.hitStopFrames = Math.max(this.hitStopFrames, frames);
  }

  kickPlayerSquash(amount: number) {
    this.playerSquash = clamp(this.playerSquash + amount, -0.28, 0.28);
    this.playerSquashVelocity = 0;
  }

  spawnBurst(x: number, y: number, color: string, amount: number = 10, speed: number = 4, size: number = 4) {
    const cap = this.getParticleCap();
    const available = Math.max(0, cap - this.liveParticleCount);
    const leanAmount = this.shouldUseLeanEffects() && speed <= 2 ? Math.min(amount, 2) : amount;
    const scaledAmount = Math.max(1, Math.ceil(leanAmount * this.getParticleDensity()));
    const particleAmount = Math.min(scaledAmount, available);

    for (let i = 0; i < particleAmount; i++) {
      this.entities.push(new Particle(
        x,
        y,
        color,
        randomRange(speed * 0.45, speed),
        randomRange(size * 0.65, size * 1.35),
        randomRange(22, 48)
      ));
    }
    this.liveParticleCount += particleAmount;
  }

  addPlayerAfterimage() {
    this.playerAfterimages.push({
      x: this.player.x,
      y: this.player.y,
      width: this.player.width,
      height: this.player.height,
      alpha: 0.24,
      rotation: this.playerTilt,
      squash: this.playerSquash
    });

    if (this.playerAfterimages.length > 8) {
      this.playerAfterimages.shift();
    }
  }

  updatePlayerMovement(maxSpeed: number) {
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    let targetVx = 0;
    let targetVy = 0;
    let acceleration = GAME_FEEL.acceleration + (this.stats.upgrades.speed * 0.045);

    if (this.touchPos) {
      const touchLeadY = this.width < 520 ? 82 : 64;
      targetVx = clamp((this.touchPos.x - centerX) * GAME_FEEL.touchResponse, -maxSpeed * 1.34, maxSpeed * 1.34);
      targetVy = clamp((this.touchPos.y - touchLeadY - centerY) * GAME_FEEL.touchResponse, -maxSpeed * 1.34, maxSpeed * 1.34);
      acceleration = GAME_FEEL.touchAcceleration + (this.stats.upgrades.speed * 0.055);
    } else {
      const horizontal = (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D'] ? 1 : 0)
        - (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A'] ? 1 : 0);
      const vertical = (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S'] ? 1 : 0)
        - (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W'] ? 1 : 0);
      const length = Math.hypot(horizontal, vertical) || 1;

      targetVx = (horizontal / length) * maxSpeed;
      targetVy = (vertical / length) * maxSpeed;
      if (horizontal === 0 && vertical === 0) {
        acceleration = GAME_FEEL.friction + (this.stats.upgrades.speed * 0.025);
      }
    }

    this.playerVel.x = moveToward(this.playerVel.x, targetVx, acceleration);
    this.playerVel.y = moveToward(this.playerVel.y, targetVy, acceleration);

    this.player.x += this.playerVel.x;
    this.player.y += this.playerVel.y;

    const bounds = this.getPlayerMovementBounds();
    const clampedX = clamp(this.player.x, bounds.minX, bounds.maxX);
    const clampedY = clamp(this.player.y, bounds.minY, bounds.maxY);

    if (clampedX !== this.player.x) {
      this.playerVel.x *= -0.18;
      this.kickPlayerSquash(0.035);
    }
    if (clampedY !== this.player.y) {
      this.playerVel.y *= -0.18;
      this.kickPlayerSquash(0.035);
    }

    this.player.x = clampedX;
    this.player.y = clampedY;

    const moveSpeed = Math.hypot(this.playerVel.x, this.playerVel.y);
    this.playerTilt = lerp(this.playerTilt, clamp(this.playerVel.x * GAME_FEEL.tiltPerSpeed, -GAME_FEEL.maxTilt, GAME_FEEL.maxTilt), GAME_FEEL.tiltEase);

    if (moveSpeed > GAME_FEEL.afterimageSpeed && this.frameCount % (this.shouldUseLeanEffects() ? 8 : 5) === 0) {
      this.addPlayerAfterimage();
    }

    if (
      moveSpeed > 1.3
      && this.frameCount % (this.shouldUseLeanEffects() ? 12 : 6) === 0
      && this.liveParticleCount < this.getParticleCap()
    ) {
      this.entities.push(new Particle(
        this.player.x + this.player.width / 2 - this.playerVel.x * 3,
        this.player.y + this.player.height * 0.78,
        moveSpeed > maxSpeed ? '#67e8f9' : '#22d3ee',
        randomRange(0.7, 1.8),
        randomRange(3, 7),
        randomRange(18, 34)
      ));
      this.liveParticleCount++;
    }
  }

  startBossWarning(type: BossWarningType, durationSeconds?: number) {
    this.inBossWarningSequence = true;
    const configuredFrames = Number.isFinite(durationSeconds)
      ? Math.max(1, Math.round((durationSeconds as number) * GAME_CONFIG.FPS))
      : 0;
    this.bossWarningDuration = configuredFrames || (type === 'gatekeeper' ? 300 : 90);
    this.bossWarningFrame = this.bossWarningDuration;
    this.pendingBossType = type;
    if (type === 'gatekeeper') {
      this.clearThreatsForMainBoss();
    }
    this.playSound('siren');
  }

  clearThreatsForMainBoss() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (
        entity.type === EntityType.COIN
        || entity.type === EntityType.POWERUP
        || entity.type === EntityType.PARTICLE
        || entity.type === EntityType.EFFECT
      ) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
  }

  getSecondSubBossType(): BossWarningType {
    return this.wave % 2 === 0 ? 'asteroid' : 'wall';
  }

  isSubBossWarning(type: BossWarningType | null = this.pendingBossType) {
    return type === 'mini1' || type === 'wall' || type === 'asteroid';
  }

  getAsteroidBeltCount() {
    let count = 0;
    for (const entity of this.entities) {
      if (
        !entity.markedForDeletion
        && entity.type === EntityType.ENEMY_BRICK
        && entity.variant >= 900
      ) {
        count++;
      }
    }
    return count;
  }

  getActiveMiniBosses() {
    return this.entities.filter((entity) => (
      !entity.markedForDeletion && entity.hp > 0 && entity.type === EntityType.MINI_BOSS
    ));
  }

  getEncounterWarningType(event: RuntimeEncounterEvent): BossWarningType {
    if (event.kind === 'asteroid-belt') return 'asteroid';
    if (event.kind === 'supply-drop') return 'mini1';
    if (
      event.kind === 'boss'
      && (
        getMiniBossEncounterDefinition(event.bossId)
        || getMiniBossEncounterByEventId(event.id)
      )
    ) return 'mini1';
    if (isMajorBossId(event.bossId)) return 'gatekeeper';
    const bossId = String(event.bossId || '').toLowerCase();
    if (bossId.includes('wall') || bossId.includes('paywall')) return 'wall';
    return 'mini1';
  }

  queueConfiguredEncounter(event: RuntimeEncounterEvent) {
    if (this.configuredEncounterIds.has(event.id) || this.inBossWarningSequence) return;
    this.configuredEncounterIds.add(event.id);
    if (event.kind === 'supply-drop') {
      this.spawnSupplyDrop(event);
      return;
    }
    this.pendingConfiguredEncounter = event;
    const warningSeconds = Number(event.warningSeconds);
    this.startBossWarning(
      this.getEncounterWarningType(event),
      Number.isFinite(warningSeconds) && warningSeconds >= 0 ? warningSeconds : undefined
    );
  }

  spawnConfiguredEncounter(event: RuntimeEncounterEvent) {
    if (event.kind === 'asteroid-belt') {
      this.spawnAsteroidBelt(event);
      return;
    }
    if (event.kind === 'supply-drop') {
      this.spawnSupplyDrop(event);
      return;
    }

    const warningType = this.getEncounterWarningType(event);
    if (warningType === 'wall') {
      this.spawnWallBoss(event);
    } else if (warningType === 'gatekeeper') {
      this.spawnBoss(event);
    } else {
      this.spawnMiniBoss(1, event);
    }
  }

  getDueConfiguredEncounter() {
    const elapsedSeconds = this.getWaveElapsedSeconds();
    return this.getConfiguredEncounterEvents().find((event) => (
      !this.configuredEncounterIds.has(event.id)
      && elapsedSeconds >= Math.max(0, Number(event.startSeconds) || 0)
    ));
  }

  update(cinematicPause: boolean = false) {
    if (!this.gameActive) return;
    this.cinematicPaused = cinematicPause;
    this.frameCount++;
    if ((this.stats.shipAbilityCooldown || 0) > 0) {
      this.stats.shipAbilityCooldown = Math.max(0, this.stats.shipAbilityCooldown - 1);
    }
    this.stats.shipAbilityCooldownMax = getShipAbilityDefinition(this.playerShipId).cooldownFrames;
    this.flushPendingPlayerShots();
    this.refreshLoadState();
    this.stats.lives = this.lives;
    this.updateJuiceSystems();
    this.stars.forEach(star => star.update(this.width, this.height));
    this.bgEntities.forEach(bg => bg.update(this.height));

    if (this.hitStopFrames > 0) {
      this.hitStopFrames--;
      this.updatePassiveEntities();
      return;
    }

    if (this.deathSequenceFrames > 0) {
      this.updateDeathSequence();
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    if (this.stageRewardCollectionFrames > 0) {
      this.updateStageRewardCollection();
      this.updatePassiveEntities();
      this.compactEntities();
      this.refreshLoadState();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    if (this.waveDepartureFrames > 0) {
      this.updateWaveDeparture();
      this.updatePassiveEntities();
      this.compactEntities();
      this.refreshLoadState();
      const takeoff = this.getStageTakeoffPresentation();
      this.bgY = (this.bgY + Math.max(1, Math.round(1 + takeoff.travel * 8))) % this.height;
      return;
    }

    if (cinematicPause) {
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    if (this.introFlightFrames > 0) {
      this.updateIntroFlight();
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    this.waveFlightFrames++;
    this.tacticalWaveFlightFrames++;
    this.updatePendingBossStrikes();
    this.updatePendingEnemyLasers();
    this.updateMiniBossLabEncounters();

    let invaderCount = 0;
    let asteroidBeltCount = 0;
    for (const entity of this.entities) {
      if (entity.markedForDeletion) continue;
      if (entity.type === EntityType.ENEMY_INVADER) {
        invaderCount++;
      } else if (
        entity.type === EntityType.ENEMY_BRICK
        && entity.variant >= 900
      ) {
        asteroidBeltCount++;
      }
    }
    const activeMiniBosses = this.getActiveMiniBosses();
    const activeMiniBossLabState = Array.from(this.miniBossLabEncounters.values()).find((state) => (
      !state.completionTriggered || state.completionFrame === this.frameCount
    ));
    this.miniBossRef = activeMiniBosses[0] ?? null;
    const isBossAlive = Boolean(
      this.bossRef
      || activeMiniBosses.length > 0
      || activeMiniBossLabState
      || invaderCount > 0
      || asteroidBeltCount > 0
    );

    if (isBossAlive) {
        this.stats.isBossActive = true;
        let hp = 0;
        let maxHp = 100;

        if (this.bossRef) {
            hp = this.bossRef.hp;
            maxHp = this.bossRef.maxHp;
        } else if (activeMiniBosses.length > 0) {
            hp = activeMiniBosses.reduce((total, boss) => total + Math.max(0, boss.hp), 0);
            maxHp = activeMiniBosses.reduce((total, boss) => total + Math.max(0, boss.maxHp), 0);
        } else if (activeMiniBossLabState) {
            const definition = this.getMiniBossLabDefinition(activeMiniBossLabState);
            hp = 0;
            maxHp = definition
              ? createMiniBossMemberInstances(definition).reduce((total, member) => total + member.maxHealth, 0)
              : 1;
        } else if (invaderCount > 0) {
            hp = 0;
            maxHp = 0;
            for (const invader of this.entities) {
              if (!invader.markedForDeletion && invader.type === EntityType.ENEMY_INVADER) {
                hp += Math.max(0, invader.hp);
                maxHp += Math.max(0, invader.maxHp);
              }
            }
        } else if (asteroidBeltCount > 0) {
            hp = asteroidBeltCount;
            maxHp = this.asteroidBeltMaxCount || asteroidBeltCount;
        }

        this.stats.bossHp = hp;
        this.stats.bossMaxHp = maxHp;
        if (invaderCount > 0) this.updateWallBoss();

    } else {
        this.stats.isBossActive = false;

        // Progress bar logic
        if (!this.inBossWarningSequence) {
             this.waveProgressFrames++;
             const totalDuration = this.getConfiguredWaveDurationFrames();
             this.stats.bossProgress = Math.min(1, this.waveProgressFrames / totalDuration);
        }

        const configuredEncounters = this.getConfiguredEncounterEvents();
        const configuredEvents = this.getCurrentWaveDefinition()?.events;
        const useLegacyMilestones = shouldUseLegacyMilestoneEncounters({
          completionRule: this.getCurrentWaveCompletionRule(),
          configuredEventCount: Array.isArray(configuredEvents) ? configuredEvents.length : 0,
          configuredEncounterCount: configuredEncounters.length
        });
        if (configuredEncounters.length > 0) {
          const dueEncounter = this.getDueConfiguredEncounter();
          if (dueEncounter && !this.inBossWarningSequence) {
            this.queueConfiguredEncounter(dueEncounter);
          }
        } else if (useLegacyMilestones) {
          // Legacy milestone fallback for campaigns without event configuration.
          if (this.stats.bossProgress >= 0.33 && !this.spawnedMiniBoss1) {
               if (!this.inBossWarningSequence) {
                   this.startBossWarning('mini1');
               }
          }
          else if (this.stats.bossProgress >= 0.66 && !this.spawnedWallBoss) {
               if (!this.inBossWarningSequence) {
                   this.startBossWarning(this.getSecondSubBossType());
               }
          }
          else if (this.stats.bossProgress >= 1 && !this.bossRef && !this.mainBossDefeated) {
               if (!this.inBossWarningSequence) {
                   this.startBossWarning('gatekeeper');
               }
          }
        }
    }

    if (this.inBossWarningSequence) {
        const warningAge = this.bossWarningDuration - this.bossWarningFrame;
        const mainBossAlertFrames = Math.min(MAIN_BOSS_ALERT_FRAMES, Math.max(1, this.bossWarningDuration - 60));
        const mainBossAlertActive = this.pendingBossType === 'gatekeeper' && warningAge < mainBossAlertFrames;
        if ((this.isSubBossWarning() || mainBossAlertActive) && this.bossWarningFrame > 0 && this.bossWarningFrame % 36 === 0) {
            this.playSound('siren');
        }
        if (this.pendingBossType === 'gatekeeper' && warningAge === mainBossAlertFrames) {
            this.playSound('boss_roar');
        }
        this.bossWarningFrame--;
        if (this.bossWarningFrame <= 0) {
            this.inBossWarningSequence = false;

            if (this.pendingConfiguredEncounter) {
                const encounter = this.pendingConfiguredEncounter;
                this.pendingConfiguredEncounter = null;
                this.spawnConfiguredEncounter(encounter);
            } else if (this.pendingBossType === 'mini1') {
                this.spawnMiniBoss(1);
                this.spawnedMiniBoss1 = true;
            } else if (this.pendingBossType === 'wall') {
                this.spawnWallBoss();
                this.spawnedWallBoss = true;
            } else if (this.pendingBossType === 'asteroid') {
                this.spawnAsteroidBelt();
                this.spawnedWallBoss = true;
            } else if (this.pendingBossType === 'gatekeeper') {
                this.spawnBoss();
            }
            this.pendingBossType = null;
        }
    }

    // Count the pickup frame as the first active frame, then advance timers
    // before this frame's fire/collision work so weapons, immunity, and the
    // rendered aura all expire on the same fixed-step boundary.
    tickTimedPowerups(this.activePowerups);

    this.updatePlayerMovement(this.getPlayerMovementSpeed());
    this.updateSquadCompanions();

    // Fire Rate has seven seven-upgrade tiers. Cadence improves smoothly at
    // every level and each tier adds one tightly grouped visible round.
    const level = Math.min(this.stats.upgrades.fireRate, FIRE_RATE_MAX_LEVEL);
    const fireInterval = getFireRateIntervalFrames(level);

    if (level > this.announcedFireRateLevel) {
      const weaponTier = getFireRateTier(level);
      const tierProgress = getFireRateTierProgress(level);
      const weaponLabel = tierProgress === 0
        ? `RAPID FIRE TIER ${weaponTier}`
        : `RAPID T${weaponTier} - ${tierProgress}/${FIRE_RATE_LEVELS_PER_TIER}`;
      const weaponColor = '#67e8f9';
      this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 18, weaponLabel, weaponColor, this.mobileProfile ? 16 : 19);
      this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, weaponColor);
      this.playSound('powerup', 1, { pitchOffset: level * 0.04 });
      this.announcedFireRateLevel = level;
    }

    const primaryFireHeld = Boolean(this.keys[' '] || this.touchPos || this.keys['Enter']);
    if (primaryFireHeld) {
      if (this.playerFireCooldownFrames <= 0) {
        this.fireBullet();
        this.playerFireCooldownFrames += fireInterval;
      }
      this.playerFireCooldownFrames -= 1;
    } else {
      this.playerFireCooldownFrames = 0;
    }

    // Missile Logic
    if (this.stats.upgrades.missile > 0) {
        this.missileTimer--;
        const cooldown = 180 - (this.stats.upgrades.missile * 20); // 3s down to ~1.3s
        if (this.missileTimer <= 0) {
            this.fireMissile();
            this.missileTimer = cooldown;
        }
    }

    if (this.invincibleTimer > 0) this.invincibleTimer--;

    this.spawnConfiguredSupportEvents();
    this.spawnEnemies();
    this.updateEnemyFire();

    this.entities.forEach(e => {
      if (e.isBeam) {
          e.life--;
          if (e.life <= 0) e.markedForDeletion = true;
          if (e.isDetachedBeam) return;
          const beamOwner = e.bossOwnerId
            ? this.entities.find((candidate) => candidate.id === e.bossOwnerId && !candidate.markedForDeletion)
            : this.bossRef;
          if (beamOwner) {
              if (e.beamRadialRay) {
                this.positionBossRadialBeam(e, beamOwner);
                return;
              }
              if (e.beamAxis === 'horizontal') {
                e.x = 0;
                e.y = clamp(beamOwner.y + beamOwner.height / 2 - e.height / 2, 0, this.height - e.height);
                e.width = this.width;
                return;
              }
              if (e.beamFromCenter) {
                e.x = clamp(beamOwner.x + beamOwner.width / 2 - e.width / 2, 0, this.width - e.width);
                e.y = 0;
                e.height = this.height;
                return;
              }
              const anchorX = e.beamAnchorOffsetX ?? (beamOwner.width / 2 - e.width / 2);
              const waveOneDrift = this.stats.wave === 1
                ? Math.sin((this.frameCount + (e.variant * 37)) * 0.075) * 16
                : 0;
              e.x = Math.max(0, Math.min(this.width - e.width, beamOwner.x + anchorX + waveOneDrift));
              e.y = beamOwner.y + beamOwner.height - 20;
          } else {
              e.markedForDeletion = true;
          }
          return;
      }

      if (e.flashFrames > 0) e.flashFrames--;
      for (const component of e.bossComponents ?? []) {
        if (component.flashFrames > 0) component.flashFrames--;
      }
      if (e.miniBossLabReinforcementStage) {
        this.updateMiniBossLabReinforcement(e);
      }
      if (this.isCrownClawProjectile(e)) {
        this.updateCrownClawProjectile(e);
        if (e.markedForDeletion) return;
      }
      if (e.type === EntityType.COIN) {
        this.updateCoinEntity(e);
        return;
      }
      const prismMothMovementHandled = e.prismMothArtifactState
        ? this.updatePrismMothOwnedArtifact(e)
        : false;
      if (e.markedForDeletion) return;
      if (
        !e.heliosMineState
        && !prismMothMovementHandled
        && !e.miniBossLabEncounterId
      ) {
        e.x += e.vx;
        e.y += e.vy;
      }

      if (e.type === EntityType.MISSILE) {
          // Homing Logic
          // Find nearest enemy
          let nearest: Entity | null = null;
          let minDistSq = 1000 * 1000;

          for (let targetIndex = 0; targetIndex < this.homingTargetsBuffer.length; targetIndex++) {
              const target = this.homingTargetsBuffer[targetIndex];
              if (!target.markedForDeletion && this.isEnemyTarget(target)) {
                  const dx = target.x - e.x;
                  const dy = target.y - e.y;
                  const distSq = dx * dx + dy * dy;
                  if (distSq < minDistSq && target.y > 0) {
                      minDistSq = distSq;
                      nearest = target;
                  }
              }
          }

          if (nearest) {
              const target = nearest as Entity;
              const dx = (target.x + target.width/2) - (e.x + e.width/2);
              const dy = (target.y + target.height/2) - (e.y + e.height/2);
              const angle = Math.atan2(dy, dx);

              // Homing steering
              const isMaxLevel = e.color === '#ff0055';
              const speed = e.homingSpeed ?? (isMaxLevel ? 14 : 9);
              const turnRate = e.homingTurnRate ?? (isMaxLevel ? 3.5 : 1.5);

              e.vx += Math.cos(angle) * turnRate;
              e.vy += Math.sin(angle) * turnRate;

              // Normalize velocity
              const vel = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
              if (vel > speed) {
                  e.vx = (e.vx/vel) * speed;
                  e.vy = (e.vy/vel) * speed;
              }
          }

          // Spawn trail - Use missile color
          if (this.frameCount % (this.shouldUseLeanEffects() ? 8 : 4) === 0 && this.liveParticleCount < this.getParticleCap()) {
              this.entities.push(new Particle(e.x + e.width/2, e.y + e.height, e.color, 1));
              this.liveParticleCount++;
          }

          if (e.y < -50 || e.y > this.height + 50 || e.x < -50 || e.x > this.width + 50) e.markedForDeletion = true;
      }

      if (e.type === EntityType.ENEMY_DRONE || e.type === EntityType.ENEMY_JOURNAL || e.type === EntityType.ENEMY_SWARM || e.type === EntityType.ENEMY_BRICK) {
        const formationHandled = this.updateConfiguredEnemyFormation(e);
        if (e.type === EntityType.ENEMY_SWARM && !formationHandled) {
          if (e.formation === 'orbit') {
            const boss = this.bossRef;
            if (!boss || boss.markedForDeletion) {
              e.markedForDeletion = true;
              return;
            }

            const orbitSpeed = 0.026 + Math.min(0.018, this.wave * 0.0025);
            const orbitRadius = Math.min(this.width * 0.34, boss.width * 0.62 + (this.mobileProfile ? 34 : 48));
            const angle = e.formationSeed + (this.frameCount * orbitSpeed);
            const bossCenterX = boss.x + boss.width / 2;
            const bossCenterY = boss.y + boss.height / 2;
            e.x = bossCenterX + Math.cos(angle) * orbitRadius - e.width / 2;
            e.y = bossCenterY + Math.sin(angle) * orbitRadius - e.height / 2;
            e.vx = 0;
            e.vy = 0;
            return;
          }

          const playerCenterX = this.player.x + this.player.width / 2;
          const enemyCenterX = e.x + e.width / 2;
          const dx = playerCenterX - enemyCenterX;
          const waveMotion = Math.sin((this.frameCount * 0.055) + e.formationSeed) * (e.formation === 'sine' ? 2.4 : 1.1);

          if (e.formation === 'pincer') {
            e.vx += dx * 0.0009;
            e.x += waveMotion * 0.55;
          } else if (e.formation === 'v') {
            e.vx += dx * 0.0012;
            e.x += Math.sin((this.frameCount * 0.045) + e.formationIndex) * 0.8;
          } else if (e.formation === 'row') {
            e.x += Math.sin((this.frameCount * 0.05) + e.formationSeed) * 1.1;
          } else {
            e.vx += dx * 0.0015;
            e.x += waveMotion;
          }

          e.vx *= 0.94;
        }
        if (!formationHandled && e.type === EntityType.ENEMY_BRICK && e.variant >= 900) {
          e.x += Math.sin((this.frameCount + e.variant) * 0.025) * (0.55 + (this.wave * 0.12));
        }
        if (!formationHandled && e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.SUPPLY_DROP) {
        e.x += Math.sin((this.frameCount + e.variant) * 0.035) * 0.42;
        if (e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.PROJECTILE) {
        if (e.heliosMineState) {
          this.updateHeliosMineEntity(e);
          if (e.markedForDeletion) return;
        }
        if (e.maxShotVisualPattern?.length) {
          e.life--;
          if (e.life <= 0) {
            e.markedForDeletion = true;
            return;
          }
        }
        if (this.isCrownClawProjectile(e)) {
          if (e.y < -80 || e.y > this.height + 80 || e.x < -80 || e.x > this.width + 80) {
            e.clawReturning = true;
          }
        } else if (e.shipAbilityKind === 'research-charge' && e.y < -e.height * 0.45) {
          this.detonateResearchCharge(e, e.x + e.width / 2, Math.max(54, e.height * 0.35));
        } else if (e.shipAbilityKind === 'btc-hash-burst' && e.y < -e.height * 0.45) {
          this.detonateBitcoinHashBurst(e, e.x + e.width / 2, Math.max(54, e.height * 0.35));
        } else if (
          !e.heliosMineState
          && (
            e.y < -50
            || e.y > this.height + 50
            || e.x < -80
            || e.x > this.width + 80
          )
        ) {
          e.markedForDeletion = true;
        }
      }

      if (e.type === EntityType.PARTICLE) {
        (e as Particle).life--;
        if ((e as Particle).life <= 0) e.markedForDeletion = true;
      }

      if (e.type === EntityType.EFFECT) {
          (e as VisualEffect).life--;
          if ((e as VisualEffect).life <= 0) e.markedForDeletion = true;
      }

      if (e.type === EntityType.POWERUP) {
          e.y += Math.sin(this.frameCount * 0.05) * 0.5;
          if (e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.BOMB) {
          e.x += Math.sin((this.frameCount + e.variant) * 0.06) * 0.35;
          e.y += Math.sin(this.frameCount * 0.05) * 0.25;
          if (e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.BOSS) {
        this.updateBoss(e);
      }
      if (e.type === EntityType.MINI_BOSS) {
        this.updateMiniBoss(e);
      }
    });

    this.checkCollisions();
    this.applyResearchBeamDamage();
    this.compactEntities();
    this.completeClearWaveIfReady();
    this.refreshLoadState();
    this.bgY = (this.bgY + 1) % this.height;
  }

  getGunPodOffsets() {
    return EMPTY_GUN_POD_OFFSETS;
  }

  getSquadCompanionVisuals(): SquadCompanionVisual[] {
    const size = this.mobileProfile ? 42 : 50;
    return this.squadCompanions.map((companion) => ({
      slot: companion.slot,
      id: companion.id,
      frames: companion.frames,
      frameIndex: companion.frameIndex,
      x: companion.x,
      y: companion.y,
      width: size,
      height: size,
      alpha: this.playerDrawAlpha * companion.entryProgress,
      scale: this.waveDepartureFrames > 0 ? this.playerDrawScale : 1
    }));
  }

  private isCoinCollectedBySquadMagnet(coin: Entity) {
    const coinCenterX = coin.x + coin.width / 2;
    const coinCenterY = coin.y + coin.height / 2;
    return this.squadCompanions.some((companion) => {
      if (companion.ability !== 'coin-magnet' || companion.entryProgress < 0.5) return false;
      const pickupRadius = 24 + companion.level * 2;
      return Math.hypot(companion.x - coinCenterX, companion.y - coinCenterY) <= pickupRadius;
    });
  }

  private resetSquadCompanionPositions() {
    resetSquadCompanionFormation(
      this.squadCompanions,
      this.player.x,
      this.player.y,
      this.player.width,
      this.player.height
    );
  }

  private updateIntroSquadCompanions() {
    if (this.squadCompanions.length === 0) return;

    this.squadCompanions.forEach((companion, index) => {
      const target = getSquadCompanionFormationTarget(
        this.player.x,
        this.player.y,
        this.player.width,
        this.player.height,
        companion.slot,
        index
      );
      companion.entryProgress = Math.min(1, companion.entryProgress + 0.045);
      companion.x += (target.x - companion.x) * 0.46;
      companion.y += (target.y - companion.y) * 0.46;
      companion.frameIndex = Math.floor(this.frameCount / 10 + index) % companion.frames.length;
    });
  }

  private updateSquadCompanions() {
    if (this.squadCompanions.length === 0) return;

    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    const distance = clamp(this.player.width * 0.62, 58, 82);
    const edgePadding = this.mobileProfile ? 24 : 30;
    const canFire = this.gameActive
      && this.lives > 0
      && this.introFlightFrames <= 0
      && this.deathSequenceFrames <= 0
      && this.stageRewardCollectionFrames <= 0
      && this.waveDepartureFrames <= 0
      && !this.inBossWarningSequence;

    this.squadCompanions.forEach((companion, index) => {
      const side = companion.slot === 'left' ? -1 : 1;
      const targetX = clamp(centerX + side * distance, edgePadding, this.width - edgePadding);
      const targetY = clamp(
        centerY + 14 + Math.sin(this.frameCount * 0.055 + index * Math.PI) * 4,
        34,
        this.height - 34
      );
      companion.entryProgress = Math.min(1, companion.entryProgress + 0.045);
      companion.x += (targetX - companion.x) * 0.14;
      companion.y += (targetY - companion.y) * 0.14;
      companion.frameIndex = Math.floor(this.frameCount / 10 + index) % companion.frames.length;

      if (!canFire) return;
      companion.fireTimer--;
      if (companion.fireTimer > 0) return;
      this.spawnSquadCompanionBullet(companion);
      companion.fireTimer = companion.fireIntervalFrames;
    });
  }

  private updateDepartureSquadCompanions(takeoff: StageTakeoffPresentation) {
    if (this.squadCompanions.length === 0) return;

    const distanceScale = 1 - takeoff.progress * 0.42;
    const followStrength = 0.18 + takeoff.travel * 0.62;

    this.squadCompanions.forEach((companion, index) => {
      const target = getSquadCompanionFormationTarget(
        this.player.x,
        this.player.y,
        this.player.width,
        this.player.height,
        companion.slot,
        index,
        distanceScale
      );
      companion.entryProgress = Math.min(1, companion.entryProgress + 0.045);
      companion.x += (target.x - companion.x) * followStrength;
      companion.y += (target.y - companion.y) * followStrength;
      companion.frameIndex = Math.floor(this.frameCount / 8 + index) % companion.frames.length;
    });
  }

  private spawnSquadCompanionBullet(companion: ActiveSquadCompanion) {
    if (this.livePlayerShotCount + this.pendingPlayerShots.length >= this.getPlayerShotCap()) return;

    const shotSteps = getCompanionShotSteps(companion.volleySize);
    switch (companion.ability) {
      case 'spread-cycle': {
        const angleSteps = [-1, 0, 1] as const;
        const sideAngle = 25 * Math.PI / 180;
        const cycleAngle = angleSteps[companion.shotSequence % angleSteps.length] * sideAngle;
        companion.shotSequence++;
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: cycleAngle + step * 0.018,
          offsetX: step * 5,
          damageScale: companion.volleySize > 1 ? 0.78 : 1
        }));
        break;
      }
      case 'piercing-laser':
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: step * 0.012,
          offsetX: step * 8,
          damageScale: companion.volleySize > 1 ? 0.7 : 0.9,
          heightScale: 1.55,
          pierceCount: 1 + Math.floor(companion.level / 2)
        }));
        break;
      case 'coin-magnet':
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: step * 0.016,
          offsetX: step * 7,
          damageScale: companion.volleySize > 1 ? 0.58 : 0.72,
          widthScale: 1.15
        }));
        break;
      case 'twin-burst':
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: step * 0.026,
          offsetX: step * 12,
          damageScale: companion.volleySize > 2 ? 0.58 : 0.72
        }));
        break;
      case 'homing-missile':
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: step * 0.035,
          offsetX: step * 15,
          missile: true,
          damageScale: companion.volleySize > 1 ? 1.18 : 1.75,
          widthScale: 1.25,
          heightScale: 1.12,
          pierceCount: companion.level >= 5 ? 1 : 0
        }));
        break;
      case 'targeting-laser': {
        const targetAngle = this.getSquadTargetAngle(companion);
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: targetAngle + step * 0.018,
          offsetX: step * 6,
          damageScale: companion.volleySize > 1 ? 0.76 : 1.08,
          heightScale: 1.25
        }));
        break;
      }
      case 'prism-fan': {
        const degreesPerStep = companion.volleySize >= 7 ? 6 : companion.volleySize >= 5 ? 8 : 12;
        const damageScale = companion.volleySize >= 7 ? 0.44 : companion.volleySize >= 5 ? 0.52 : 0.64;
        shotSteps.forEach((step) => {
          this.spawnSquadProjectile(companion, {
            angle: step * degreesPerStep * (Math.PI / 180),
            damageScale
          });
        });
        break;
      }
      case 'heavy-cannon':
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: step * 0.018,
          offsetX: step * 14,
          damageScale: companion.volleySize > 1 ? 1.4 : 2,
          widthScale: 1.85,
          heightScale: 1.35,
          speedScale: 0.78,
          pierceCount: companion.level >= 3 ? 1 : 0
        }));
        break;
      case 'nova-volley': {
        const degreesPerStep = companion.volleySize >= 9 ? 5.5 : companion.volleySize >= 7 ? 7.25 : 11;
        const damageScale = companion.volleySize >= 9 ? 0.34 : companion.volleySize >= 7 ? 0.39 : 0.46;
        shotSteps.forEach((step) => {
          this.spawnSquadProjectile(companion, {
            angle: step * degreesPerStep * (Math.PI / 180),
            damageScale,
            speedScale: 1.08
          });
        });
        break;
      }
      case 'pulse-cannon':
      default:
        shotSteps.forEach((step) => this.spawnSquadProjectile(companion, {
          angle: step * 0.018,
          offsetX: step * 6,
          damageScale: companion.volleySize >= 3 ? 0.62 : companion.volleySize === 2 ? 0.78 : 1
        }));
        break;
    }

    if (!this.shouldUseLeanEffects()) {
      this.spawnBurst(companion.x, companion.y - 14, companion.projectileColor, 1, 0.8, 2);
    }
  }

  private getSquadTargetAngle(companion: ActiveSquadCompanion) {
    let nearest: Entity | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    for (const target of this.homingTargetsBuffer) {
      if (target.markedForDeletion || !this.isEnemyTarget(target)) continue;
      const targetX = target.x + target.width / 2;
      const targetY = target.y + target.height / 2;
      if (targetY > companion.y + 26) continue;
      const dx = targetX - companion.x;
      const dy = targetY - companion.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearest = target;
        nearestDistanceSq = distanceSq;
      }
    }
    if (!nearest) return 0;
    const dx = nearest.x + nearest.width / 2 - companion.x;
    const upwardDistance = Math.max(36, companion.y - (nearest.y + nearest.height / 2));
    return clamp(Math.atan2(dx, upwardDistance), -0.62, 0.62);
  }

  private spawnSquadProjectile(companion: ActiveSquadCompanion, options: {
    angle?: number;
    offsetX?: number;
    damageScale?: number;
    widthScale?: number;
    heightScale?: number;
    speedScale?: number;
    pierceCount?: number;
    missile?: boolean;
  } = {}) {
    if (this.livePlayerShotCount + this.pendingPlayerShots.length >= this.getPlayerShotCap()) return false;

    const baseWidth = 7 + Math.min(3, companion.level - 1);
    const baseHeight = 20 + Math.min(8, companion.level * 2);
    const width = baseWidth * (options.widthScale ?? 1);
    const height = baseHeight * (options.heightScale ?? 1);
    const angle = options.angle ?? 0;
    const speed = (9.2 + companion.level * 0.22) * (options.speedScale ?? 1);
    const projectile = this.createEntity(
      options.missile ? EntityType.MISSILE : EntityType.PROJECTILE,
      companion.x - width / 2 + (options.offsetX ?? 0),
      companion.y - (this.mobileProfile ? 24 : 28)
    );
    projectile.width = width;
    projectile.height = height;
    projectile.vx = Math.sin(angle) * speed;
    projectile.vy = -Math.cos(angle) * speed;
    projectile.color = companion.projectileColor;
    projectile.isPlayerShot = true;
    projectile.isMissile = Boolean(options.missile);
    projectile.squadAbilityKind = companion.ability;
    projectile.weaponKind = options.pierceCount ? 'ion' : 'pulse';
    projectile.weaponVisualLevel = 0;
    projectile.weaponVisualStartFrame = this.frameCount;
    projectile.damage = companion.projectileDamage * (options.damageScale ?? 1);
    projectile.pierceRemaining = Math.max(0, Math.floor(options.pierceCount ?? 0));
    if (projectile.pierceRemaining > 0) projectile.hitTargetIds = new Set<string>();
    if (options.missile) {
      projectile.homingSpeed = 8.5 + companion.level * 0.8;
      projectile.homingTurnRate = 0.9 + companion.level * 0.28;
    }
    this.entities.push(projectile);
    this.livePlayerShotCount++;
    return true;
  }

  isBioBeamFiring() {
    return false;
  }

  private applyBioLaserPulse(level: number) {
    const beamWidth = 12 + Math.min(level, 7) * 2.4;
    const beamBox = {
      x: this.player.x + (this.player.width / 2) - (beamWidth / 2),
      y: 0,
      width: beamWidth,
      height: Math.max(0, this.player.y + this.player.height * 0.18)
    };
    let nearestTarget: Entity | null = null;

    for (let index = 0; index < this.entities.length; index++) {
      const target = this.entities[index];
      if (target.markedForDeletion || !this.isEnemyTarget(target)) continue;
      const box = this.getCollisionBox(target);
      const componentHit = target.type === EntityType.BOSS
        ? this.getBossComponentHit(target, beamBox)
        : undefined;
      const bossLikeTarget =
        target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS;
      const intersects = Boolean(componentHit) || (
        bossLikeTarget
          ? this.bossSilhouetteIntersectsBox(target, beamBox)
          : !(box.x > beamBox.x + beamBox.width
            || box.x + box.width < beamBox.x
            || box.y > beamBox.y + beamBox.height
            || box.y + box.height < beamBox.y)
      );
      if (!intersects) continue;
      if (!nearestTarget || target.y + target.height > nearestTarget.y + nearestTarget.height) {
        nearestTarget = target;
      }
    }

    if (!nearestTarget) return;
    if (nearestTarget.type === EntityType.BOSS && this.isBossShielded()) {
      this.pulseDamageFlash(nearestTarget);
      if (this.frameCount % 10 === 0) {
        this.spawnRingEffect(nearestTarget.x + nearestTarget.width / 2, nearestTarget.y + nearestTarget.height / 2, '#a7f3d0');
      }
      return;
    }

    const damageByLevel = [1, 1, 1, 1.3, 1.3, 2.4, 4.2, 7.5];
    const isBossTarget = nearestTarget.type === EntityType.BOSS || nearestTarget.type === EntityType.MINI_BOSS;
    const laserDamage = damageByLevel[Math.min(level, damageByLevel.length - 1)] * (isBossTarget ? 1.35 : 1);
    const componentHit = nearestTarget.type === EntityType.BOSS
      ? this.getBossComponentHit(nearestTarget, beamBox)
      : undefined;
    if (componentHit) this.damageBossComponent(nearestTarget, componentHit, laserDamage);
    else if (isBossTarget) this.damageBossHull(nearestTarget, laserDamage);
    else {
      const previousHealth = nearestTarget.hp;
      nearestTarget.hp -= laserDamage;
      this.recordEntityDamage(nearestTarget, previousHealth);
      this.flashDamageTarget(nearestTarget);
    }
    const beamColor = level > 0 ? '#38bdf8' : '#65f59a';
    this.spawnBurst(
      nearestTarget.x + nearestTarget.width / 2,
      nearestTarget.y + nearestTarget.height / 2,
      beamColor,
      isBossTarget ? 4 : 2,
      1.8,
      2.6
    );
    if (nearestTarget.hp <= 0) this.handleEnemyDestroyed(nearestTarget);
  }

  countPlayerShots(includeQueued: boolean = false) {
    let count = includeQueued ? this.pendingPlayerShots.length : 0;
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (
        !entity.markedForDeletion
        && ((entity.type === EntityType.PROJECTILE && entity.isPlayerShot) || entity.type === EntityType.MISSILE)
      ) {
        count++;
      }
    }
    return count;
  }

  isPowerupActive(type: PowerupType) {
    return isTimedPowerupActive(this.activePowerups, type);
  }

  hasMaxShotShield() {
    return isMaxShotShieldActive(this.activePowerups, PowerupType.MAX_SHOT);
  }

  getPlayerShotCap() {
    const hasSpread = this.isPowerupActive(PowerupType.DOUBLE_SHOT)
      || this.isPowerupActive(PowerupType.TRIPLE_SHOT);
    const hasMaxShot = this.hasMaxShotShield();
    const fireRateLevel = this.stats.upgrades.fireRate || 0;
    const bioPrimaryPlan = this.playerShipId === 'bio'
      ? getBioPrimaryShotPlan(fireRateLevel, hasSpread, hasMaxShot)
      : null;
    const primarySimulationEntityCount = getPrimaryVolleySimulationEntityCount(hasSpread);
    const simultaneousShots = bioPrimaryPlan?.simulationEntityCount
      ?? primarySimulationEntityCount;
    const companionBurstSize = this.squadCompanions.reduce(
      (sum, companion) => sum + Math.max(1, companion.volleySize),
      0
    );
    const baseCap = this.performanceMode || (this.mobileProfile && this.heavySceneLoad)
      ? MOBILE_LEAN_PLAYER_SHOT_CAP
      : this.mobileProfile
        ? MOBILE_PLAYER_SHOT_CAP
        : DESKTOP_PLAYER_SHOT_CAP;
    const extraShotAllowance = this.mobileProfile ? (this.heavySceneLoad ? 9 : 10) : 12;
    const companionAllowance = Math.min(
      this.mobileProfile ? 24 : 36,
      companionBurstSize * (this.mobileProfile ? 3 : 4)
    );
    const calculatedCap = baseCap
      + (simultaneousShots - 1) * extraShotAllowance
      + companionAllowance;
    const completeBurstFloor = simultaneousShots + companionBurstSize + 6;
    const sustainedBundledShotFloor = bioPrimaryPlan
      ? getMaxShotSustainedEntityFloor(
          hasSpread,
          bioPrimaryPlan.simulationEntityCount
        ) + bioPrimaryPlan.queuedEntityCount + companionAllowance
      : getMaxShotSustainedEntityFloor(
          hasSpread,
          primarySimulationEntityCount
        ) + companionAllowance;
    return Math.min(
      this.mobileProfile ? MOBILE_MAX_PLAYER_SHOT_CAP : DESKTOP_MAX_PLAYER_SHOT_CAP,
      Math.max(calculatedCap, completeBurstFloor, sustainedBundledShotFloor)
    );
  }

  hasPlayerShotCapacity(projectileCount: number = 1) {
    if (!Number.isInteger(projectileCount) || projectileCount <= 0) return false;
    return this.livePlayerShotCount
      + this.pendingPlayerShots.length
      + projectileCount <= this.getPlayerShotCap();
  }

  refreshLoadState() {
    let activePlayerShots = 0;
    let particles = 0;
    let effects = 0;
    let threats = 0;
    const homingTargets = this.homingTargetsBuffer;
    homingTargets.length = 0;

    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (entity.markedForDeletion) continue;

      if ((entity.type === EntityType.PROJECTILE && entity.isPlayerShot) || entity.type === EntityType.MISSILE) activePlayerShots++;
      else if (entity.type === EntityType.PARTICLE) particles++;
      else if (entity.type === EntityType.EFFECT) effects++;

      if (this.isEnemyTarget(entity)) {
        threats++;
        homingTargets.push(entity);
      }
    }

    const playerShots = activePlayerShots + this.pendingPlayerShots.length;
    this.livePlayerShotCount = activePlayerShots;
    this.liveParticleCount = particles;
    this.liveEffectCount = effects;
    this.liveThreatCount = threats;

    this.heavySceneLoad = this.mobileProfile && (
      this.performanceMode
      || playerShots >= MOBILE_LEAN_PLAYER_SHOT_CAP
      || particles >= MOBILE_PARTICLE_CAP * 0.7
      || effects >= MOBILE_EFFECT_CAP * 0.75
      || threats >= MOBILE_THREAT_CAP * 0.82
      || this.entities.length >= 132
    );
  }

  shouldUseLeanEffects() {
    return this.performanceMode || (this.mobileProfile && this.heavySceneLoad);
  }

  spawnPlayerBullet(
    speed: number,
    offsetX: number = 0,
    yOffset: number = 0,
    angleBias: number = 0,
    pitchOffset: number = 0,
    playSound: boolean = true,
    weaponKind: PlayerWeaponKind = 'pulse',
    maxShotVisualPattern?: readonly MaxShotVisualRound[],
    damageOverride?: number
  ) {
    if (!this.hasPlayerShotCapacity()) {
      return false;
    }

    const isBioPrimary = weaponKind === 'bio-primary';
    const isBioLaser = weaponKind === 'bio-laser';
    const isEthShard = weaponKind === 'eth-shard';
    const isBtcHash = weaponKind === 'btc-hash';
    const isNova = weaponKind === 'nova';
    const isSingularity = weaponKind === 'singularity';
    const bioLaserLevel = isBioLaser ? Math.min(this.stats.upgrades.fireRate || 0, 7) : 0;
    const ethShardLevel = isEthShard ? Math.min(this.stats.upgrades.fireRate || 0, 7) : 0;
    const btcHashLevel = isBtcHash ? Math.min(this.stats.upgrades.fireRate || 0, 7) : 0;
    const bulletColor = isBioPrimary
      ? '#b7ff68'
      : isBioLaser
      ? '#b7ff68'
      : isEthShard
        ? '#a78bfa'
      : isBtcHash
        ? '#fbbf24'
      : isSingularity
        ? '#a78bfa'
        : isNova
          ? '#facc15'
          : weaponKind === 'ion'
            ? '#f0abfc'
            : weaponKind === 'plasma'
              ? '#22d3ee'
              : '#6c63ff';
    const bulletWidth = isBioPrimary
      ? 9
      : isBioLaser
      ? Math.round(5 + bioLaserLevel * 2.3)
      : isEthShard
        ? Math.round(13 + ethShardLevel * 2.1)
      : isBtcHash
        ? Math.round(12 + btcHashLevel * 1.9)
      : isSingularity
        ? 40
        : isNova
          ? 32
          : weaponKind === 'ion'
            ? 24
            : weaponKind === 'plasma'
              ? 14
              : 10;
    const visualRoundCount = Math.max(1, maxShotVisualPattern?.length || 1);
    const maxVisualOffset = maxShotVisualPattern?.reduce(
      (largest, round) => Math.max(
        largest,
        Math.abs(round.offsetX) + Math.abs(Math.sin(round.angleOffset)) * 100
      ),
      0
    ) || 0;
    const bundleWidth = bulletWidth + maxVisualOffset * 2;
    const b = this.createEntity(
      EntityType.PROJECTILE,
      this.player.x + this.player.width / 2 - bundleWidth / 2 + offsetX,
      this.player.y + this.player.height * 0.12 + yOffset
    );
    const angle = angleBias;
    b.width = bundleWidth;
    b.height = isBioPrimary
      ? 28
      : isBioLaser
      ? Math.round(34 + bioLaserLevel * 6)
      : isEthShard
        ? Math.round(30 + ethShardLevel * 4.5)
      : isBtcHash
        ? Math.round(32 + btcHashLevel * 4.8)
      : isSingularity
        ? 82
        : isNova
          ? 68
          : weaponKind === 'ion'
            ? 54
            : weaponKind === 'plasma'
              ? 34
              : 28;
    b.vx = Math.sin(angle) * speed;
    b.vy = -Math.cos(angle) * speed;
    b.color = bulletColor;
    b.isPlayerShot = true;
    b.weaponKind = weaponKind;
    b.weaponVisualLevel = 0;
    b.weaponVisualStartFrame = this.frameCount;
    b.maxShotVisualPattern = maxShotVisualPattern;
    b.projectileUnitWidth = bulletWidth;
    b.projectileUnitHeight = b.height;
    const baseDamage = isBioPrimary
      ? BIO_PRIMARY_DAMAGE_PER_ROUND
      : isBioLaser
      ? 0.9 + bioLaserLevel * 0.55
      : isEthShard
        ? 1.15 + ethShardLevel * 0.48
      : isBtcHash
        ? 1.3 + btcHashLevel * 0.54
      : isSingularity
        ? 7.5
        : isNova
          ? 4.2
          : weaponKind === 'ion'
            ? 2.4
            : weaponKind === 'plasma'
              ? 1.3
              : 1;
    b.damage = Number.isFinite(damageOverride) ? Math.max(0, Number(damageOverride)) : baseDamage;
    if (maxShotVisualPattern?.length) {
      b.life = MAX_SHOT_BUNDLE_LIFETIME_FRAMES;
      b.maxLife = MAX_SHOT_BUNDLE_LIFETIME_FRAMES;
      b.representedRoundsRemaining = visualRoundCount;
      b.hitTargetIds = new Set<string>();
    }
    if (weaponKind === 'ion' || isNova || isSingularity || (isBioLaser && bioLaserLevel >= 3) || (isEthShard && ethShardLevel >= 4) || (isBtcHash && btcHashLevel >= 3)) {
      b.pierceRemaining = isBioLaser
        ? Math.min(5, 1 + Math.floor((bioLaserLevel - 3) / 2))
        : isEthShard
          ? Math.min(4, 1 + Math.floor((ethShardLevel - 4) / 2))
        : isBtcHash
          ? Math.min(5, 1 + Math.floor((btcHashLevel - 3) / 2))
        : isSingularity
          ? 10
          : isNova
            ? 6
            : 3;
      b.hitTargetIds = new Set<string>();
    }
    this.entities.push(b);
    this.livePlayerShotCount++;
    if (playSound) {
      this.playSound('shoot', 1, {
        pitchJitter: isBioLaser ? 0.055 : isEthShard ? 0.07 : isBtcHash ? 0.045 : isSingularity ? 0.035 : isNova ? 0.05 : weaponKind === 'ion' ? 0.08 : 0.06,
        pitchOffset: pitchOffset + (isBioLaser ? -0.22 - bioLaserLevel * 0.018 : isEthShard ? 0.16 + ethShardLevel * 0.012 : isBtcHash ? -0.12 - btcHashLevel * 0.01 : isSingularity ? -0.36 : isNova ? -0.28 : weaponKind === 'ion' ? -0.18 : weaponKind === 'plasma' ? -0.04 : -0.12)
      });
    }
    return true;
  }

  queuePlayerBullet(shot: PendingPlayerShot) {
    if (this.pendingPlayerShots.length >= PENDING_PLAYER_SHOT_CAP) return;
    if (!this.hasPlayerShotCapacity()) return;
    this.pendingPlayerShots.push(shot);
  }

  flushPendingPlayerShots() {
    if (this.pendingPlayerShots.length === 0) return;

    for (let index = 0; index < this.pendingPlayerShots.length; index++) {
      const shot = this.pendingPlayerShots[index];
      if (shot.fireFrame > this.frameCount) continue;

      this.pendingPlayerShots.splice(index, 1);
      this.spawnPlayerBullet(
        shot.speed,
        shot.offsetX,
        shot.yOffset,
        shot.angleBias,
        shot.pitchOffset,
        shot.playSound ?? true,
        shot.weaponKind,
        shot.maxShotVisualPattern,
        shot.damageOverride
      );
      index--;
    }
  }

  fireBullet() {
    const weaponKind: PlayerWeaponKind = 'pulse';
    const weaponSpeed = 10;
    const volleySize = getFireRateVolleySize(this.stats.upgrades.fireRate || 0);
    const volleyProjectileDamage = getFireRateProjectileDamageMultiplier(volleySize);
    const overdriveSpread = this.isPowerupActive(PowerupType.DOUBLE_SHOT)
      || this.isPowerupActive(PowerupType.TRIPLE_SHOT);
    const maxShotActive = this.hasMaxShotShield();
    const bioPrimaryPlan = this.playerShipId === 'bio'
      ? getBioPrimaryShotPlan(
          this.stats.upgrades.fireRate || 0,
          overdriveSpread,
          maxShotActive,
          this.nextGameplayRandom(),
          this.nextGameplayRandom()
        )
      : null;
    const basePatternProjectileCount = volleySize * (overdriveSpread ? 3 : 1);
    const visualProjectileCount = maxShotActive
      ? getMaxShotProjectileCount(basePatternProjectileCount)
      : basePatternProjectileCount;
    const simulationEntityCount = getPrimaryVolleySimulationEntityCount(overdriveSpread);
    const queuedEntityCount = overdriveSpread ? 2 : 0;
    const tightVolleyVisualPattern = getTightVolleyVisualPattern(volleySize);
    const maxShotVisualPattern = maxShotActive
      ? getMaxShotBundleVisualPattern(volleySize)
      : undefined;

    // Max Shot is an all-or-nothing doubling of the weapon pattern already in
    // use. Each center/spread lane is one authoritative collision bundle whose
    // pooled Pixi view presents all of its rounds, keeping sustained fire smooth.
    if (!bioPrimaryPlan && (
      this.pendingPlayerShots.length + queuedEntityCount > PENDING_PLAYER_SHOT_CAP
      || !this.hasPlayerShotCapacity(simulationEntityCount)
      || (maxShotActive && (
        (maxShotVisualPattern?.length ?? 0) * simulationEntityCount !== visualProjectileCount
        || !canAdmitMaxShotVolley(
          this.livePlayerShotCount,
          this.pendingPlayerShots.length,
          overdriveSpread,
          this.getPlayerShotCap()
        )
      ))
    )) return;
    if (bioPrimaryPlan && (
      this.pendingPlayerShots.length + bioPrimaryPlan.queuedEntityCount > PENDING_PLAYER_SHOT_CAP
      || !this.hasPlayerShotCapacity(bioPrimaryPlan.simulationEntityCount)
    )) return;

    if (this.frameCount - this.lastShotFrame > 3) {
      this.kickPlayerSquash(-0.035);
      this.spawnBurst(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height * 0.18,
        bioPrimaryPlan ? '#b7ff68' : '#67e8f9',
        2,
        1.3,
        3
      );
      this.addShake(0.08);
    }
    this.lastShotFrame = this.frameCount;
    this.weaponVolley++;

    this.playerVel.y += 0.2;
    this.playerVel.x += this.gameplayRandomRange(-0.05, 0.05);

    if (bioPrimaryPlan) {
      bioPrimaryPlan.shots.forEach((shot, index) => {
        if (shot.fireDelayFrames === 0) {
          this.spawnPlayerBullet(
            weaponSpeed,
            shot.offsetX,
            0,
            shot.angleBias,
            -0.12,
            index === 0,
            'bio-primary',
            shot.visualPattern,
            shot.damagePerRound
          );
          return;
        }

        this.queuePlayerBullet({
          fireFrame: this.frameCount + shot.fireDelayFrames,
          speed: weaponSpeed,
          offsetX: shot.offsetX,
          yOffset: 0,
          angleBias: shot.angleBias,
          pitchOffset: -0.12,
          weaponKind: 'bio-primary',
          damageOverride: shot.damagePerRound,
          playSound: false,
          maxShotVisualPattern: shot.visualPattern
        });
      });
      return;
    }

    const primaryAngle = getRandomPrimaryShotAngle(this.nextGameplayRandom());

    if (maxShotActive && maxShotVisualPattern) {
      this.spawnPlayerBullet(
        weaponSpeed,
        0,
        0,
        primaryAngle,
        -0.04,
        true,
        weaponKind,
        maxShotVisualPattern,
        volleyProjectileDamage
      );

      if (overdriveSpread) {
        ([-1, 1] as const).forEach((side, index) => {
          this.queuePlayerBullet({
            fireFrame: this.frameCount + index + 1,
            speed: weaponSpeed,
            offsetX: side * 4,
            yOffset: 4,
            angleBias: sampleTripleShotSideAngleRadians(side, this.nextGameplayRandom()),
            pitchOffset: side < 0 ? -0.01 : 0.03,
            weaponKind,
            playSound: false,
            maxShotVisualPattern,
            damageOverride: volleyProjectileDamage
          });
        });
      }
      return;
    }

    this.spawnPlayerBullet(
      weaponSpeed,
      0,
      0,
      primaryAngle,
      -0.04,
      true,
      weaponKind,
      tightVolleyVisualPattern,
      volleyProjectileDamage
    );

    if (overdriveSpread) {
      ([-1, 1] as const).forEach((side, index) => {
        const sideAngle = sampleTripleShotSideAngleRadians(side, this.nextGameplayRandom());
        this.queuePlayerBullet({
          fireFrame: this.frameCount + index + 1,
          speed: weaponSpeed,
          offsetX: side * 4,
          yOffset: 4,
          angleBias: sideAngle,
          pitchOffset: side < 0 ? -0.01 : 0.03,
          weaponKind,
          playSound: false,
          maxShotVisualPattern: tightVolleyVisualPattern,
          damageOverride: volleyProjectileDamage
        });
      });
    }
  }

  fireMissile() {
      // Check if max level (5)
      const isMaxLevel = this.stats.upgrades.missile >= 5;
      this.kickPlayerSquash(-0.075);
      this.addShake(isMaxLevel ? 0.7 : 0.38);

      const m = this.createEntity(EntityType.MISSILE, this.player.x + this.player.width/2 - 5, this.player.y);
      m.width = 10;
      m.height = 20;
      m.isMissile = true;
      m.vy = -4; // Initial velocity up

      // Max level is Neon Pink/Red, Standard is Cyan
      m.color = isMaxLevel ? '#ff0055' : '#00ffff';

      m.isPlayerShot = true; // Mark as player shot
      this.entities.push(m);
      this.livePlayerShotCount++;
      this.playSound('missile');
  }

  addFlaskChargeFromCoin() {
    if (FLASK_CHARGE_PER_COIN <= 0) return;

    const currentMax = this.stats.bombChargeMax || BASE_FLASK_CHARGE_MAX;
    const previousCharge = this.stats.bombCharge || 0;
    const previousFlasks = getFlaskProgress(previousCharge, currentMax).storedFlasks;
    const nextCharge = previousCharge + FLASK_CHARGE_PER_COIN;
    const nextFlasks = getFlaskProgress(nextCharge, currentMax).storedFlasks;

    if (nextFlasks > previousFlasks) {
      this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 10, `FLASK +${nextFlasks}`, '#34d399', 18);
      this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#facc15');
      this.playSound('powerup');
    }

    this.stats.bombCharge = nextCharge;
  }

  triggerBomb() {
    if (
      (!this.previewUnlimitedBombs && (this.stats.bombs || 0) <= 0)
      || !this.gameActive
      || this.introFlightFrames > 0
      || this.deathSequenceFrames > 0
      || this.waveDepartureFrames > 0
    ) {
      return false;
    }

    this.lastBombFrame = this.frameCount;
    if (!this.previewUnlimitedBombs) {
      this.stats.bombs = Math.max(0, (this.stats.bombs || 0) - 1);
    }
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;
    this.flashAlpha = Math.max(this.flashAlpha, 0.36);
    this.addShake(11);
    this.addHitStop(8);
    this.spawnRingEffect(cx, cy, '#facc15');
    this.spawnFloatingText(cx, cy - 48, 'RSC BLAST', '#facc15', 22);
    this.spawnBurst(cx, cy, '#facc15', 30, 8, 6);
    this.playSound('bomb');

    const targets = this.enemyTargetsBuffer;
    targets.length = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && this.isEnemyTarget(entity)) {
        targets.push(entity);
      }
    }

    this.isBombResolving = true;
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS || target.type === EntityType.ENEMY_INVADER;
      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.pulseDamageFlash(target);
        this.spawnRingEffect(target.x + target.width / 2, target.y + target.height / 2, '#a7f3d0');
        this.spawnFloatingText(target.x + target.width / 2, target.y + target.height * 0.22, 'SHIELDS UP', '#a7f3d0', 16);
        continue;
      }
      const bombDamage = target.type === EntityType.BOSS
        ? BOMB_DAMAGE_BOSS
        : target.type === EntityType.MINI_BOSS
          ? BOMB_DAMAGE_MINI_BOSS
          : target.type === EntityType.ENEMY_INVADER
            ? BOMB_DAMAGE_INVADER
            : 999;
      if (target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS) {
        this.damageBossHull(target, bombDamage);
      }
      else {
        const previousHealth = target.hp;
        target.hp -= bombDamage;
        this.recordEntityDamage(target, previousHealth);
        this.flashDamageTarget(target, 6);
      }
      this.spawnBurst(target.x + target.width / 2, target.y + target.height / 2, '#fef08a', isBossTarget ? 8 : 5, 4.5, 4);

      if (target.hp <= 0) {
        this.handleEnemyDestroyed(target);
      }
    }
    this.isBombResolving = false;

    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (entity.type === EntityType.PROJECTILE && !entity.isPlayerShot) {
        entity.markedForDeletion = true;
      }
    }

    return true;
  }

  triggerShipAbility() {
    const ability = getShipAbilityDefinition(this.playerShipId);
    if (
      (this.stats.shipAbilityCooldown || 0) > 0
      || !this.gameActive
      || this.introFlightFrames > 0
      || this.deathSequenceFrames > 0
      || this.waveDepartureFrames > 0
    ) {
      return false;
    }

    if (this.playerShipId === 'bio') {
      this.spawnShipAbilityProjectile({
        kind: 'bio-genome-lance',
        frames: BIO_GENOME_LANCE_FRAME_URLS,
        width: 34,
        height: 126,
        speed: 10.5,
        damage: 5.5,
        color: '#86efac',
        yOffset: -102,
        weaponKind: 'bio-laser',
        pierceRemaining: 12
      });
    } else if (this.playerShipId === 'eth') {
      [-0.16, 0, 0.16].forEach((angleBias, index) => {
        this.spawnShipAbilityProjectile({
          kind: 'eth-prism-volley',
          frames: ETH_PRISM_VOLLEY_FRAME_URLS,
          width: 42,
          height: 66,
          speed: 9.2,
          damage: 4.5,
          color: '#c4b5fd',
          offsetX: (index - 1) * 11,
          yOffset: -54,
          angleBias,
          weaponKind: 'eth-shard',
          pierceRemaining: 3,
          variant: index
        });
      });
    } else if (this.playerShipId === 'btc') {
      this.spawnShipAbilityProjectile({
        kind: 'btc-hash-burst',
        frames: BTC_HASH_BURST_FRAME_URLS,
        width: 72,
        height: 96,
        speed: 6.5,
        damage: 0,
        color: '#facc15',
        yOffset: -78,
        weaponKind: 'btc-hash'
      });
    } else {
      this.spawnShipAbilityProjectile({
        kind: 'research-charge',
        frames: RESEARCH_CHARGE_FRAME_URLS,
        width: 76,
        height: 92,
        speed: 7.2,
        damage: 0,
        color: '#67e8f9',
        yOffset: -82,
        weaponKind: 'pulse'
      });
    }

    this.stats.shipAbilityCooldown = this.previewShipAbilityNoCooldown
      ? 0
      : ability.cooldownFrames;
    this.stats.shipAbilityCooldownMax = ability.cooldownFrames;
    // Research Charge already receives a soft pooled light in the Pixi
    // renderer. Keep its launch feedback particle-based so it never reads as
    // a hard-edged lighting bubble; the other ability rings remain intentional
    // gameplay silhouettes.
    if (ability.id !== 'research-charge') {
      this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + 8, ability.color);
    }
    this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 24, ability.name.toUpperCase(), ability.color, 17);
    this.spawnBurst(this.player.x + this.player.width / 2, this.player.y, ability.color, this.playerShipId === 'eth' ? 14 : 10, 4.2, 4);
    this.addShake(this.playerShipId === 'btc' ? 4 : 2.5);
    this.playSound('powerup');
    return true;
  }

  spawnShipAbilityProjectile(config: {
    kind: ShipAbilityKind;
    frames: readonly string[];
    width: number;
    height: number;
    speed: number;
    damage: number;
    color: string;
    offsetX?: number;
    yOffset?: number;
    angleBias?: number;
    weaponKind: PlayerWeaponKind;
    pierceRemaining?: number;
    variant?: number;
  }) {
    const projectile = this.createEntity(
      EntityType.PROJECTILE,
      this.player.x + this.player.width / 2 - config.width / 2 + (config.offsetX ?? 0),
      this.player.y + (config.yOffset ?? 0)
    );
    const angle = config.angleBias ?? 0;
    projectile.width = config.width;
    projectile.height = config.height;
    projectile.vx = Math.sin(angle) * config.speed;
    projectile.vy = -Math.cos(angle) * config.speed;
    projectile.color = config.color;
    projectile.isPlayerShot = true;
    projectile.damage = config.damage;
    projectile.weaponKind = config.weaponKind;
    projectile.shipAbilityKind = config.kind;
    projectile.projectileVisualKind = config.kind;
    projectile.spriteFrames = [...config.frames];
    projectile.weaponVisualStartFrame = this.frameCount;
    projectile.variant = config.variant ?? 0;
    projectile.pierceRemaining = config.pierceRemaining ?? 0;
    if (projectile.pierceRemaining > 0) projectile.hitTargetIds = new Set<string>();
    this.entities.push(projectile);
  }

  detonateResearchCharge(projectile: Entity, centerX: number, centerY: number) {
    if (projectile.markedForDeletion) return;
    projectile.markedForDeletion = true;

    const impact = new VisualEffect(centerX - 86, centerY - 86, 'sprite', '', '#ffffff');
    impact.width = 172;
    impact.height = 172;
    // The legacy middle frames contain opaque circular outlines. Retain the
    // spark and dissipating particle frames while the renderer supplies the
    // edge-free radial light and the projectile supplies its beam trail.
    impact.spriteFrames = [
      RESEARCH_IMPACT_FRAME_URLS[0],
      RESEARCH_IMPACT_FRAME_URLS[1]
    ];
    impact.life = 42;
    impact.maxLife = 42;
    this.entities.push(impact);

    this.flashAlpha = Math.max(this.flashAlpha, 0.28);
    this.addShake(7);
    this.addHitStop(5);
    this.spawnBurst(centerX, centerY, '#67e8f9', 24, 7, 5);
    this.playSound('bomb', 0.72, { pitchJitter: 0.04, pitchOffset: 0.12 });

    const radiusSq = RESEARCH_CHARGE_BLAST_RADIUS * RESEARCH_CHARGE_BLAST_RADIUS;
    const targets = this.entities.filter((entity) => !entity.markedForDeletion && this.isEnemyTarget(entity));
    for (const target of targets) {
      const dx = target.x + target.width / 2 - centerX;
      const dy = target.y + target.height / 2 - centerY;
      const targetAllowance = Math.min(46, Math.max(target.width, target.height) * 0.25);
      const effectiveRadius = RESEARCH_CHARGE_BLAST_RADIUS + targetAllowance;
      if ((dx * dx + dy * dy) > Math.max(radiusSq, effectiveRadius * effectiveRadius)) continue;

      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.pulseDamageFlash(target);
        continue;
      }

      const damage = target.type === EntityType.BOSS
        ? 10
        : target.type === EntityType.MINI_BOSS
          ? 18
          : target.type === EntityType.ENEMY_INVADER
            ? 22
            : 999;
      if (target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS) {
        this.damageBossHull(target, damage);
      }
      else {
        const previousHealth = target.hp;
        target.hp -= damage;
        this.recordEntityDamage(target, previousHealth);
        this.flashDamageTarget(target);
      }
      this.spawnBurst(target.x + target.width / 2, target.y + target.height / 2, '#a7f3d0', 5, 3.6, 3);
      if (target.hp <= 0) this.handleEnemyDestroyed(target);
    }
  }

  isBossCombatInteractive(entity: Entity) {
    return entity.type !== EntityType.BOSS
      || (entity.bossRevivalStage !== 'shutdown' && entity.bossRevivalStage !== 'rebooting');
  }

  canBeginBossRevival(boss: Entity) {
    return boss.type === EntityType.BOSS
      && Boolean(boss.bossRevival)
      && !boss.bossRevivalConsumed
      && getBossRevivalTargetPhaseIndex(
        boss.bossRevival,
        boss.bossPhaseSettings
      ) > 0;
  }

  private clearBossRevivalHazards(boss: Entity) {
    this.clearPrismMothRuntime(boss);
    this.pendingBossStrikes = this.pendingBossStrikes.filter((strike) => strike.bossId !== boss.id);
    const removedTelegraphIds = new Set<string>();
    this.pendingEnemyLasers = this.pendingEnemyLasers.filter((laser) => {
      if (laser.sourceId !== boss.id) return true;
      removedTelegraphIds.add(laser.telegraphId);
      return false;
    });
    for (const entity of this.entities) {
      if (
        entity.bossOwnerId === boss.id
        || removedTelegraphIds.has(entity.id)
        || entity.shieldHostId === boss.id
      ) {
        entity.markedForDeletion = true;
      }
    }
    boss.bossCornerAmbushBeamState = undefined;
    boss.bossCornerAmbushRamState = undefined;
    boss.bossTrackingPincerState = undefined;
    boss.bossHeliosCornerClampState = undefined;
    boss.bossHeliosMachineGunChannelState = undefined;
    this.clearBossTimelineActionLocks(boss);
    this.removeBossCornerAmbushBeams(boss);
    this.clearBossShieldRing();
  }

  private beginBossRevival(boss: Entity) {
    const config = boss.bossRevival;
    if (!config || !this.canBeginBossRevival(boss)) return false;
    const state = createBossRevivalRuntimeState(
      config,
      boss.bossPhaseSettings,
      boss.bossRevivalBaseWidth || boss.width,
      boss.bossRevivalBaseHeight || boss.height,
      this.width
    );
    if (!state) return false;

    boss.hp = 0;
    boss.vx = 0;
    boss.vy = 0;
    boss.bossRevivalRuntime = state;
    boss.bossRevivalStage = state.stage;
    boss.bossRevivalProgress = 0;
    boss.bossRevivalConsumed = true;
    boss.attackTimer = 0;
    boss.lastBurstAttackTimer = 0;
    boss.bossActionPresentation = undefined;
    boss.bossMovementPathId = undefined;
    boss.bossMovementPathStartFrame = -1;
    boss.bossMovementPathDurationFrames = 0;
    boss.generatedBossChargeUntilTimer = -1;
    boss.generatedBossTechniqueTimer = -1;
    boss.isCharging = false;
    boss.isBeam = false;
    this.clearBossRevivalHazards(boss);
    this.updateBossDecayStage(boss);
    return true;
  }

  private updateBossRevival(boss: Entity) {
    const config = boss.bossRevival;
    const state = boss.bossRevivalRuntime;
    if (!config || !state || state.stage === 'complete') return false;

    const centerX = boss.x + boss.width / 2;
    const centerY = boss.y + boss.height / 2;
    const frame = advanceBossRevivalRuntime(state, config, boss.maxHp, GAME_CONFIG.FPS);
    boss.bossRevivalRuntime = frame.state;
    // The final shutdown simulation frame promotes the internal state so the
    // next tick can begin rebooting, but its rendered pose must still reach a
    // fully limp shutdown before the ignition animation starts.
    boss.bossRevivalStage = state.stage === 'shutdown'
      ? 'shutdown'
      : frame.state.stage;
    boss.bossRevivalProgress = frame.progress;
    boss.hp = frame.health;
    boss.width = frame.width;
    boss.height = frame.height;
    boss.x = clamp(
      centerX - boss.width / 2,
      0,
      Math.max(0, this.width - boss.width)
    );
    boss.y = clamp(
      centerY - boss.height / 2,
      0,
      Math.max(0, this.height - boss.height)
    );
    boss.vx = 0;
    boss.vy = 0;
    boss.attackTimer = 0;
    boss.lastBurstAttackTimer = 0;
    boss.isCharging = false;
    boss.bossActionPresentation = undefined;
    this.updateBossDecayStage(boss);

    if (frame.completedNow) {
      boss.activeBossPhaseIndex = -1;
      boss.activeBossPhaseId = undefined;
      boss.bossTimelinePhaseId = undefined;
      boss.bossTimelineLastPhaseId = undefined;
      this.applyConfiguredBossPhase(boss);
    }
    return true;
  }

  isEnemyTarget(entity: Entity) {
    if (!this.isBossCombatInteractive(entity)) return false;
    if (entity.miniBossLabEncounterId && entity.hp <= 0) return false;
    if (
      entity.miniBossLabReinforcementStage
      && entity.miniBossLabReinforcementStage !== 'active'
    ) return false;
    return this.isDestructiblePrismMothBrood(entity)
      || entity.type === EntityType.ENEMY_DRONE
      || entity.type === EntityType.ENEMY_BRICK
      || entity.type === EntityType.ENEMY_JOURNAL
      || entity.type === EntityType.ENEMY_SWARM
      || entity.type === EntityType.SUPPLY_DROP
      || entity.type === EntityType.BOSS
      || entity.type === EntityType.MINI_BOSS
      || entity.type === EntityType.ENEMY_INVADER;
  }

  private isDestructiblePrismMothBrood(entity: Entity) {
    const artifact = entity.prismMothArtifactState;
    return entity.type === EntityType.PROJECTILE
      && artifact?.kind === 'brood'
      && artifact.destructible === true
      && artifact.targetable === true
      && entity.hp > 0;
  }

  flashEntity(entity: Entity, frames: number = 8) {
    entity.flashFrames = Math.max(entity.flashFrames, frames);
  }

  pulseDamageFlash(entity: Entity, frames: number = BOSS_DAMAGE_FLASH_FRAMES) {
    if (this.frameCount - entity.lastDamageFlashFrame < BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES) return;
    entity.lastDamageFlashFrame = this.frameCount;
    this.flashEntity(entity, frames);
  }

  flashDamageTarget(entity: Entity, regularFrames: number = 5) {
    if (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS) {
      this.pulseDamageFlash(entity);
      return;
    }
    this.flashEntity(entity, regularFrames);
  }

  pulseBossComponentFlash(component: BossComponentState, frames: number = BOSS_DAMAGE_FLASH_FRAMES) {
    if (this.frameCount - component.lastDamageFlashFrame < BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES) return;
    component.lastDamageFlashFrame = this.frameCount;
    component.flashFrames = Math.max(component.flashFrames, frames);
  }

  queueBossSignificantImpact(
    boss: Entity,
    xRatio: number,
    yRatio: number,
    strength: number,
    componentImpact: boolean
  ) {
    boss.bossSignificantImpactFrame = this.frameCount;
    boss.bossSignificantImpactXRatio = clamp(xRatio, 0, 1);
    boss.bossSignificantImpactYRatio = clamp(yRatio, 0, 1);
    boss.bossSignificantImpactStrength = clamp(strength, 0.2, 2);
    boss.bossSignificantImpactIsComponent = componentImpact;
  }

  getBossShieldCount() {
    let count = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && entity.type === EntityType.ENEMY_SWARM && entity.formation === 'orbit') {
        count++;
      }
    }
    return count;
  }

  isBossShielded() {
    return this.getBossShieldCount() > 0;
  }

  clearBossShieldRing() {
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (entity.type === EntityType.ENEMY_SWARM && entity.formation === 'orbit') {
        entity.markedForDeletion = true;
      }
    }
  }

  spawnBossShieldRing(boss: Entity, phase: number, configuredCount?: number) {
    const count = Number.isFinite(configuredCount)
      ? Math.max(0, Math.floor(configuredCount as number))
      : Math.min(this.mobileProfile ? 5 : 8, 3 + phase);
    const hp = getBossShieldEscortHp(phase);
    const escortSize = this.mobileProfile
      ? BOSS_SHIELD_ESCORT_MOBILE_SIZE
      : BOSS_SHIELD_ESCORT_DESKTOP_SIZE;

    for (let i = 0; i < count; i++) {
      const shield = this.createEntity(EntityType.ENEMY_SWARM, boss.x + boss.width / 2, boss.y + boss.height / 2);
      shield.width = escortSize.width;
      shield.height = escortSize.height;
      shield.hp = hp;
      shield.maxHp = hp;
      shield.color = '#a7f3d0';
      shield.formation = 'orbit';
      shield.formationIndex = i;
      shield.formationSeed = (Math.PI * 2 * i) / count;
      shield.shieldHostId = boss.id;
      shield.variant = 300 + i;
      shield.sourceEventId = boss.sourceEventId;
      shield.sourceItemId = boss.sourceItemId;
      this.entities.push(shield);
    }

    this.spawnFloatingText(this.width / 2, Math.max(92, this.height * 0.16), 'SHIELD RING!', '#a7f3d0', this.mobileProfile ? 17 : 22);
  }

  private recordWaveVictoryKill(target: Entity) {
    const encounterId = target.sourceEventId || target.id;
    if (target.type === EntityType.BOSS) {
      if (!this.creditedMajorBossEncounterIds.has(encounterId)) {
        this.creditedMajorBossEncounterIds.add(encounterId);
        this.waveVictoryKillCounts.majorBossKills++;
      }
      return;
    }
    if (target.type === EntityType.MINI_BOSS) {
      const hasLivingEncounterMember = Boolean(target.sourceEventId) && this.entities.some((entity) => (
        entity !== target
        && entity.type === EntityType.MINI_BOSS
        && entity.sourceEventId === target.sourceEventId
        && !entity.markedForDeletion
        && entity.hp > 0
      ));
      if (
        !hasLivingEncounterMember
        && !this.creditedMiniBossEncounterIds.has(encounterId)
      ) {
        this.creditedMiniBossEncounterIds.add(encounterId);
        this.waveVictoryKillCounts.miniBossKills++;
      }
      return;
    }
    if (target.isElite) {
      this.waveVictoryKillCounts.eliteKills++;
      return;
    }
    this.waveVictoryKillCounts.regularEnemyKills++;
  }

  handleEnemyDestroyed(target: Entity) {
    if (target.markedForDeletion) return;
    if (
      target.type === EntityType.PROJECTILE
      && target.prismMothArtifactState?.kind === 'brood'
      && target.prismMothArtifactState.destructible
    ) {
      target.prismMothArtifactState.targetable = false;
      target.prismMothArtifactState.collisionActive = false;
      target.prismMothArtifactState.damageActive = false;
      target.markedForDeletion = true;
      const centerX = target.x + target.width / 2;
      const centerY = target.y + target.height / 2;
      this.spawnExplosion(target.x, target.y, '#c084fc', 0.66);
      this.spawnRingEffect(centerX, centerY, '#67e8f9');
      this.spawnBurst(centerX, centerY, '#f0abfc', 9, 3.4, 3);
      this.addHitStop(2);
      this.addShake(0.8);
      this.playSound('impact', 0.54, {
        pitchJitter: 0.08,
        pitchOffset: 0.16
      });
      return;
    }
    if (target.type === EntityType.MINI_BOSS && target.miniBossLabEncounterId) {
      this.beginMiniBossLabMemberDeath(target);
      return;
    }
    if (target.type === EntityType.BOSS) {
      if (!this.isBossCombatInteractive(target)) return;
      if (this.beginBossRevival(target)) return;
    }

    if (target.type === EntityType.BOSS && target.bossTimeline) {
      const phase = Math.max(1, target.activeBossPhaseIndex + 1);
      getBossTimelineTriggeredCues(
        target.bossTimeline,
        'death',
        target.bossTimelinePhaseId ?? target.activeBossPhaseId
      ).forEach((cue) => this.dispatchBossTimelineCue(target, cue, phase, 'death'));
    }
    if (target.type === EntityType.BOSS) {
      this.clearPrismMothRuntime(target);
      target.bossCornerAmbushBeamState = undefined;
      target.bossCornerAmbushRamState = undefined;
      target.bossTrackingPincerState = undefined;
      target.bossHeliosCornerClampState = undefined;
      target.bossHeliosMachineGunChannelState = undefined;
      this.removeBossCornerAmbushBeams(target);
    }
    if (target.campaignSpawnFrame > 0 && this.isEnemyTarget(target)) {
      this.waveEnemyTimeToKillFrames += Math.max(1, this.frameCount - target.campaignSpawnFrame);
      this.waveEnemyKillsMeasured += 1;
    }
    if (target.type !== EntityType.SUPPLY_DROP) this.recordWaveVictoryKill(target);
    target.markedForDeletion = true;
    const destructionIntensity = target.type === EntityType.BOSS
      ? 2.2
      : target.type === EntityType.MINI_BOSS
        ? 1.45
        : target.type === EntityType.SUPPLY_DROP
          ? 0.76
        : target.type === EntityType.ENEMY_INVADER || target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_JOURNAL
          ? 0.9
          : 0.58;
    this.spawnExplosion(target.x, target.y, target.color, destructionIntensity);
    if (target.type !== EntityType.SUPPLY_DROP) this.stats.enemiesDefeated++;
    const configuredScoreMultiplier = Number(this.getCurrentWaveDefinition()?.scoreMultiplier);
    const waveMult = Number.isFinite(configuredScoreMultiplier) && configuredScoreMultiplier > 0
      ? configuredScoreMultiplier
      : Math.pow(2, this.stats.wave - 1);
    let basePoints = 10;
    if (target.type === EntityType.ENEMY_DRONE) basePoints = 10;
    if (target.type === EntityType.ENEMY_SWARM) basePoints = 12;
    if (target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_INVADER) basePoints = 20;
    if (target.type === EntityType.ENEMY_JOURNAL) basePoints = 30;

    const hasConfiguredBossReward = (target.type === EntityType.MINI_BOSS || target.type === EntityType.BOSS)
      && Number.isFinite(target.scoreReward);
    const points = hasConfiguredBossReward
      ? 0
      : Number.isFinite(target.scoreValue)
        ? Math.max(0, target.scoreValue as number)
        : basePoints * waveMult;
    this.stats.score += points;
    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    const supplyDropKind = target.supplyDropKind;
    const isSupplyDrop = Boolean(supplyDropKind);
    if (points > 0) this.spawnFloatingText(centerX, centerY - 10, `+${points}`, '#67e8f9', 16);
    if (target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS) {
      this.spawnBossCoinBurst(target);
    } else if (supplyDropKind) {
      this.presentDropDestroyed[supplyDropKind]++;
      this.presentDropCoinValueSpawned += this.spawnPresentDropCoinBurst(target);
    } else {
      this.spawnCoin(target.x + target.width / 2, target.y + target.height / 2);
    }
    if (target.type === EntityType.ENEMY_SWARM && target.formation === 'orbit') {
      this.spawnFloatingText(centerX, centerY - 26, 'SHIELD -1', '#a7f3d0', 14);
      this.spawnRingEffect(centerX, centerY, '#a7f3d0');
    }
    const isElite = target.type === EntityType.ENEMY_JOURNAL
      || target.type === EntityType.ENEMY_BRICK
      || target.type === EntityType.MINI_BOSS
      || target.type === EntityType.ENEMY_INVADER;
    this.addHitStop(isElite ? 4 : 2);
    this.addShake(isElite ? 1.8 : 0.7);
    this.spawnBurst(centerX, centerY, isElite ? '#facc15' : target.color, isElite ? 12 : 6, isElite ? 5.2 : 3.2, isElite ? 5 : 3);
    const configuredPowerupDropChance = Number(target.powerupDropChance);
    const powerupDropChance = Number.isFinite(configuredPowerupDropChance)
      ? clamp(configuredPowerupDropChance, 0, 1)
      : isElite ? 0.08 : 0;
    if (!isSupplyDrop && target.type !== EntityType.BOSS && powerupDropChance > 0 && this.gameplayRandom.chance(powerupDropChance)) {
      this.spawnPowerup(target.x, target.y);
    }
    if (!isSupplyDrop && target.type !== EntityType.BOSS && this.lives < GAME_CONFIG.MAX_LIVES) {
      const extraLifeDropChance = isElite ? ELITE_EXTRA_LIFE_DROP_CHANCE : EXTRA_LIFE_DROP_CHANCE;
      if (this.gameplayRandom.chance(extraLifeDropChance)) {
        this.spawnPowerup(centerX - 18, centerY - 18, 'extra-life');
      }
    }
    if (!isSupplyDrop && target.type !== EntityType.BOSS && !this.isBombResolving) {
      const dropChance = isElite ? ELITE_BOMB_DROP_CHANCE : BOMB_DROP_CHANCE;
      if (this.gameplayRandom.chance(dropChance)) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
    }

    if (target.type === EntityType.MINI_BOSS) {
      const reward = Number.isFinite(target.scoreReward) ? Math.max(0, target.scoreReward as number) : 500 * waveMult;
      this.stats.score += reward;
      this.spawnFloatingText(centerX, centerY - 42, `+${reward}`, '#fef08a', 22);
      this.addHitStop(8);
      this.addShake(4.2);
      if (!Number.isFinite(target.powerupDropChance)) {
        const miniBossPowerupDrops = this.stats.wave >= 2 ? 2 : 1;
        for (let i = 0; i < miniBossPowerupDrops; i++) {
          this.spawnPowerup(
            target.x + (target.width * ((i + 1) / (miniBossPowerupDrops + 1))),
            target.y + this.nextGameplayRandom() * target.height
          );
        }
      }
      if (this.gameplayRandom.chance(MINI_BOSS_BOMB_REWARD_CHANCE)) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
      const remainingMiniBosses = this.getActiveMiniBosses();
      this.miniBossRef = remainingMiniBosses[0] ?? null;
      if (remainingMiniBosses.length === 0) this.waveProgressFrames += 120;
    }

    if (target.type === EntityType.BOSS) {
      if (this.waveTransitionPending) return;

      const reward = Number.isFinite(target.scoreReward) ? Math.max(0, target.scoreReward as number) : 1000 * waveMult;
      this.stats.score += reward;
      this.spawnFloatingText(centerX, centerY - 52, `+${reward}`, '#fef08a', 24);
      this.flashAlpha = Math.max(this.flashAlpha, 0.26);
      this.addHitStop(12);
      this.addShake(6.5);
      this.clearBossShieldRing();
      this.bossRef = null;
      this.mainBossDefeated = true;
      this.waveTransitionPending = true;
      this.inBossWarningSequence = false;
      this.pendingBossType = null;
      this.bossWarningFrame = 0;
      this.playSound('electricity');

      if (this.isCurrentWaveStageFinal()) {
        this.beginStageCompletion('MISSION COMPLETE!', '#00FF00');
      } else {
        // Gatekeepers inside a Mission are spawn-group boundaries, not results.
        this.beginTacticalWaveCompletion();
      }
    }
  }

  applyResearchBeamDamage() {
    if (!this.activePowerups.has(PowerupType.RESEARCH_BEAM) || this.frameCount % 2 !== 0) return;

    const beamWidth = this.width < 520 ? 46 : 56;
    const beamBox = {
      x: this.player.x + (this.player.width / 2) - (beamWidth / 2),
      y: 0,
      width: beamWidth,
      height: Math.max(0, this.player.y + this.player.height * 0.18)
    };

    const intersectsBeam = (target: Entity) => {
      const box = this.getCollisionBox(target);
      const componentHit = target.type === EntityType.BOSS
        ? this.getBossComponentHit(target, beamBox)
        : undefined;
      const bossLikeTarget =
        target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS;
      return Boolean(componentHit) || (
        bossLikeTarget
          ? this.bossSilhouetteIntersectsBox(target, beamBox)
          : !(box.x > beamBox.x + beamBox.width
            || box.x + box.width < beamBox.x
            || box.y > beamBox.y + beamBox.height
            || box.y + box.height < beamBox.y)
      );
    };

    this.entities.forEach((target) => {
      if (target.markedForDeletion || !this.isEnemyTarget(target) || !intersectsBeam(target)) return;

      const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS || target.type === EntityType.ENEMY_INVADER;
      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.pulseDamageFlash(target);
        if (this.frameCount % 10 === 0) {
          this.spawnRingEffect(target.x + target.width / 2, target.y + target.height / 2, '#a7f3d0');
        }
        return;
      }

      const beamDamage = isBossTarget ? 0.9 : 1.45;
      const componentHit = target.type === EntityType.BOSS
        ? this.getBossComponentHit(target, beamBox)
        : undefined;
      if (componentHit) this.damageBossComponent(target, componentHit, beamDamage);
      else if (target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS) {
        this.damageBossHull(target, beamDamage);
      }
      else {
        const previousHealth = target.hp;
        target.hp -= beamDamage;
        this.recordEntityDamage(target, previousHealth);
        this.flashDamageTarget(target, 4);
      }

      if (this.frameCount % 8 === 0) {
        this.entities.push(new Particle(target.x + target.width / 2, target.y + target.height / 2, '#a855f7', 1.8));
      }

      if (target.hp <= 0) {
        this.handleEnemyDestroyed(target);
      }
    });
  }

  updateEnemyFire() {
    if (this.stats.isBossActive || this.inBossWarningSequence || this.deathSequenceFrames > 0) return;
    this.updateEliteEnemyFire();
    if (this.wave < 2) return;

    // Internal Campaign waves should escalate through authored formations,
    // not collapse into a near-continuous global firing clock. Elite enemies
    // retain their own per-entity cadence below; this scheduler is only for
    // standard authored shooters.
    const baseFireInterval = Math.max(66, 118 - ((this.wave - 2) * 10));
    const difficultyMultiplier = this.getConfiguredSpawnEvents().length > 0
      ? this.getCurrentDifficultyMultiplier()
      : 1;
    const fireInterval = Math.max(1, Math.round(baseFireInterval / difficultyMultiplier));
    if (this.frameCount % fireInterval !== 0) return;

    let activeEnemyShots = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && entity.type === EntityType.PROJECTILE && !entity.isPlayerShot) activeEnemyShots++;
    }
    const standardShotCap = getCampaignBaseSimultaneousShooterLimit(this.wave);
    if (activeEnemyShots >= standardShotCap) return;

    const candidates = this.homingTargetsBuffer;
    if (candidates.length === 0) return;
    const allowedCampaignShooterIds = this.getAllowedCampaignShooterIds();

    const startIndex = Math.floor(this.frameCount / fireInterval) % candidates.length;
    let source: Entity | null = null;
    // Priority packs still use the global one-source scheduler, but authored
    // priority roles get the first deterministic opportunity on each tick.
    for (let priorityPass = 0; priorityPass < 2 && !source; priorityPass++) {
      for (let offset = 0; offset < candidates.length; offset++) {
        const candidate = candidates[(startIndex + offset) % candidates.length];
        const isPriorityCandidate = candidate.campaignFormationFiringBehavior === 'priority'
          && isCampaignPriorityFireRole(candidate.campaignGameplayRole);
        if (priorityPass === 0 && !isPriorityCandidate) continue;
        if (
          candidate.markedForDeletion
          || candidate.isElite
          || candidate.formation === 'orbit'
          || (
            allowedCampaignShooterIds !== undefined
            && candidate.campaignFireBehavior !== undefined
            && !allowedCampaignShooterIds.has(candidate.id)
          )
          || !canCampaignEnemyFire({
            behavior: candidate.campaignFireBehavior,
            fireDelaySeconds: candidate.campaignFireDelaySeconds,
            formationFiringBehavior: candidate.campaignFormationFiringBehavior,
            formationState: candidate.formationState,
            isElite: candidate.isElite,
            spawnFrame: candidate.campaignSpawnFrame,
            currentFrame: this.frameCount,
            framesPerSecond: GAME_CONFIG.FPS
          })
          || candidate.y < 38
          || candidate.y > this.height * 0.58
          || (candidate.type !== EntityType.ENEMY_DRONE && candidate.type !== EntityType.ENEMY_JOURNAL && candidate.type !== EntityType.ENEMY_SWARM)
        ) continue;
        source = candidate;
        break;
      }
    }
    if (!source) return;

    const sourceX = source.x + source.width / 2;
    const sourceY = source.y + source.height * 0.72;
    const targetX = this.player.x + this.player.width / 2 + this.playerVel.x * 7;
    const targetY = this.player.y + this.player.height / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const speed = Math.min(7.2, source.projectileSpeed ?? (4.5 + this.wave * 0.42));
    const authoredBurst = source.campaignFireBehavior === 'aimed-burst'
      || source.campaignGameplayRole === 'burst-shooter';
    const burstCount = authoredBurst
      ? Math.min(source.configuredBurstCount ?? 3, Math.max(1, standardShotCap - activeEnemyShots))
      : 1;
    const baseAngle = Math.atan2(dy, dx);
    for (let index = 0; index < burstCount; index++) {
      const centered = index - ((burstCount - 1) / 2);
      const angle = baseAngle + centered * 0.13;
      const shot = this.createEntity(EntityType.PROJECTILE, sourceX - 5, sourceY);
      shot.width = this.wave >= 4 ? 12 : 10;
      shot.height = this.wave >= 4 ? 12 : 10;
      shot.vx = Math.cos(angle) * speed;
      shot.vy = Math.sin(angle) * speed;
      shot.color = source.type === EntityType.ENEMY_JOURNAL ? '#f472b6' : this.wave >= 4 ? '#fbbf24' : '#fb7185';
      shot.isPlayerShot = false;
      shot.damage = Math.max(1, Number(source.projectileDamage) || 1);
      shot.sourceEventId = source.sourceEventId;
      this.entities.push(shot);
    }
  }

  spawnEnemyLaneLaser(
    sourceId: string,
    axis: 'vertical' | 'horizontal',
    coordinate: number,
    damage: number,
    telegraph: boolean,
    lifetimeFrames: number
  ) {
    const thickness = telegraph ? 6 : (this.mobileProfile ? 15 : 18);
    const beam = this.createEntity(
      EntityType.PROJECTILE,
      axis === 'vertical' ? coordinate - thickness / 2 : 0,
      axis === 'horizontal' ? coordinate - thickness / 2 : 0
    );
    beam.isBeam = true;
    beam.isDetachedBeam = true;
    beam.isTelegraph = telegraph;
    beam.beamAxis = axis;
    beam.bossOwnerId = sourceId;
    beam.width = axis === 'vertical' ? thickness : this.width;
    beam.height = axis === 'horizontal' ? thickness : this.height;
    beam.life = lifetimeFrames;
    beam.maxLife = lifetimeFrames;
    beam.color = telegraph ? '#ef4444' : '#fb7185';
    beam.damage = telegraph ? 0 : Math.max(1, Math.round(damage));
    this.entities.push(beam);
    return beam;
  }

  queueEliteLaneLaser(source: Entity) {
    if (this.pendingEnemyLasers.some((laser) => laser.sourceId === source.id)) return false;
    const activeLaneBeams = this.entities.reduce((count, entity) => (
      count + Number(!entity.markedForDeletion && entity.isDetachedBeam)
    ), 0);
    if (this.pendingEnemyLasers.length + activeLaneBeams >= 3) return false;

    const sourceCenterX = source.x + source.width / 2;
    const sourceNearSide = sourceCenterX < this.width * 0.28 || sourceCenterX > this.width * 0.72;
    const axis = sourceNearSide ? 'horizontal' : 'vertical';
    const coordinate = axis === 'horizontal'
      ? clamp(this.player.y + this.player.height / 2, 38, this.height - 38)
      : clamp(this.player.x + this.player.width / 2, 28, this.width - 28);
    const warningFrames = 48;
    const telegraph = this.spawnEnemyLaneLaser(
      source.id,
      axis,
      coordinate,
      0,
      true,
      warningFrames + 4
    );
    this.pendingEnemyLasers.push({
      sourceId: source.id,
      telegraphId: telegraph.id,
      axis,
      coordinate,
      damage: Math.max(1, Number(source.projectileDamage) || 1),
      frames: warningFrames,
      warningFrames,
      requireEliteSource: true
    });
    this.spawnFloatingText(
      axis === 'vertical' ? coordinate : sourceCenterX,
      axis === 'horizontal' ? coordinate - 20 : Math.max(72, source.y + source.height),
      'LASER LOCK',
      '#f87171',
      14
    );
    this.playSound('siren', 0.64);
    return true;
  }

  queuePreviewBossLaneLaser(source: Entity) {
    const coordinate = clamp(
      this.player.x + this.player.width / 2,
      28,
      this.width - 28
    );
    const warningFrames = 48;
    const telegraph = this.spawnEnemyLaneLaser(
      source.id,
      'vertical',
      coordinate,
      0,
      true,
      warningFrames + 4
    );
    this.pendingEnemyLasers.push({
      sourceId: source.id,
      telegraphId: telegraph.id,
      axis: 'vertical',
      coordinate,
      damage: Math.max(1, Number(source.projectileDamage) || 1),
      frames: warningFrames,
      warningFrames,
      requireEliteSource: false
    });
    source.isCharging = true;
    this.spawnFloatingText(
      coordinate,
      Math.max(72, source.y + source.height),
      'LASER LOCK',
      '#f87171',
      14
    );
    this.playSound('siren', 0.64);
    return true;
  }

  updatePendingEnemyLasers() {
    if (this.pendingEnemyLasers.length === 0) return;
    const activeSources = new Map(this.entities
      .filter((entity) => !entity.markedForDeletion)
      .map((entity) => [entity.id, entity] as const));

    for (const pending of this.pendingEnemyLasers) {
      const telegraph = this.entities.find((entity) => entity.id === pending.telegraphId);
      const source = activeSources.get(pending.sourceId);
      if (!source || (pending.requireEliteSource && !source.isElite)) {
        if (telegraph) telegraph.markedForDeletion = true;
        pending.frames = 0;
        continue;
      }

      pending.frames--;
      if (pending.frames > 0 && pending.frames % 12 === 0) {
        const x = pending.axis === 'vertical' ? pending.coordinate : this.width / 2;
        const y = pending.axis === 'horizontal' ? pending.coordinate : this.height * 0.56;
        this.spawnRingEffect(x, y, '#ef4444');
      }
      if (pending.frames !== 0) continue;

      if (telegraph) telegraph.markedForDeletion = true;
      source.isCharging = false;
      this.spawnEnemyLaneLaser(
        pending.sourceId,
        pending.axis,
        pending.coordinate,
        pending.damage,
        false,
        24
      );
      this.playSound('electricity');
      this.playSound('boss_shoot', 1.06, { pitchJitter: 0.04, pitchOffset: -0.12 });
      this.addShake(1.6);
    }

    this.pendingEnemyLasers = this.pendingEnemyLasers.filter((pending) => pending.frames > 0);
  }

  getCampaignEnemyArchetype(source: Entity) {
    const sprite = source.spriteUrl ?? '';
    if (!sprite.includes('/scicon-stage20-expansion-v1/enemies/')) return '';
    return sprite.split('/').at(-1)?.replace(/\.png$/i, '') ?? '';
  }

  spawnEliteRingBurst(source: Entity, availableShots: number) {
    const projectileCount = Math.min(12, Math.max(0, availableShots));
    if (projectileCount < 6) return 0;
    const sourceX = source.x + source.width / 2;
    const sourceY = source.y + source.height / 2;
    const playerAngle = Math.atan2(
      this.player.y + this.player.height / 2 - sourceY,
      this.player.x + this.player.width / 2 - sourceX
    );
    const speed = source.projectileSpeed ?? 3.7;
    let emitted = 0;
    for (let index = 0; index < projectileCount; index++) {
      const angle = -Math.PI / 2 + (index / projectileCount) * Math.PI * 2;
      const gapDistance = Math.abs(Math.atan2(
        Math.sin(angle - playerAngle),
        Math.cos(angle - playerAngle)
      ));
      // Always leave a readable safe opening in the ring facing the player.
      if (gapDistance < 0.42) continue;
      const shot = this.createEntity(EntityType.PROJECTILE, sourceX - 6, sourceY - 6);
      shot.width = 12;
      shot.height = 12;
      shot.vx = Math.cos(angle) * speed;
      shot.vy = Math.sin(angle) * speed;
      shot.color = '#fb7185';
      shot.isPlayerShot = false;
      shot.damage = Math.max(1, Number(source.projectileDamage) || 1);
      shot.sourceEventId = source.sourceEventId;
      this.entities.push(shot);
      emitted++;
    }
    this.spawnFloatingText(sourceX, sourceY + source.height * 0.7, 'RING BURST', '#fda4af', 13);
    return emitted;
  }

  spawnEliteMineFan(source: Entity, availableShots: number) {
    const count = Math.min(3, Math.max(0, availableShots));
    if (count <= 0) return 0;
    const sourceX = source.x + source.width / 2;
    const sourceY = source.y + source.height * 0.68;
    for (let index = 0; index < count; index++) {
      const offset = index - ((count - 1) / 2);
      const mine = this.createEntity(EntityType.PROJECTILE, sourceX - 10, sourceY);
      mine.width = 20;
      mine.height = 20;
      mine.vx = offset * 1.05;
      mine.vy = 2.15 + Math.abs(offset) * 0.2;
      mine.color = '#f59e0b';
      mine.isPlayerShot = false;
      mine.damage = Math.max(1, Number(source.projectileDamage) || 1);
      mine.sourceEventId = source.sourceEventId;
      this.entities.push(mine);
    }
    this.spawnFloatingText(sourceX, sourceY + 28, 'MINE FAN', '#fde68a', 13);
    return count;
  }

  updateEliteEnemyFire() {
    let activeEnemyShots = this.entities.reduce((count, entity) => (
      count + (!entity.markedForDeletion && entity.type === EntityType.PROJECTILE && !entity.isPlayerShot ? 1 : 0)
    ), 0);
    const shotCap = Math.min(18, 7 + this.wave * 2);
    const allowedCampaignShooterIds = this.getAllowedCampaignShooterIds();

    for (const source of this.entities) {
      if (
        source.markedForDeletion
        || !source.isElite
        || source.eliteAttackPattern !== 'aimed-burst'
        || (
          allowedCampaignShooterIds !== undefined
          && source.campaignFireBehavior !== undefined
          && !allowedCampaignShooterIds.has(source.id)
        )
        || !canCampaignEnemyFire({
          behavior: source.campaignFireBehavior,
          fireDelaySeconds: source.campaignFireDelaySeconds,
          formationFiringBehavior: source.campaignFormationFiringBehavior,
          formationState: source.formationState,
          isElite: source.isElite,
          spawnFrame: source.campaignSpawnFrame,
          currentFrame: this.frameCount,
          framesPerSecond: GAME_CONFIG.FPS
        })
        || source.y < 24
        || source.y > this.height * 0.68
      ) continue;

      source.attackTimer++;
      const interval = Math.max(18, source.attackIntervalFrames ?? 92);
      if (source.attackTimer < interval || activeEnemyShots >= shotCap) continue;
      source.attackTimer = 0;
      source.eliteAttackSequence++;

      const progressionTier = this.getCampaignCycle();
      const archetype = this.getCampaignEnemyArchetype(source);
      if (
        (archetype === 'ring-sentinel' || archetype === 'bullet-ring-emitter' || archetype === 'dna-conductor')
        && source.eliteAttackSequence % 2 === 1
      ) {
        const emitted = this.spawnEliteRingBurst(source, shotCap - activeEnemyShots);
        if (emitted > 0) {
          activeEnemyShots += emitted;
          this.playSound('boss_shoot', 1.02, { pitchJitter: 0.04, pitchOffset: -0.08 });
          this.flashEntity(source, 3);
          continue;
        }
      }
      if (archetype === 'crescent-minelayer' && source.eliteAttackSequence % 2 === 1) {
        const emitted = this.spawnEliteMineFan(source, shotCap - activeEnemyShots);
        if (emitted > 0) {
          activeEnemyShots += emitted;
          this.playSound('boss_shoot', 0.92, { pitchJitter: 0.05, pitchOffset: -0.18 });
          this.flashEntity(source, 3);
          continue;
        }
      }
      // Lane beams remain a signature elite move, with enough separation for
      // their telegraph to describe a real escape lane even in late Campaign.
      const laserCadence = Math.max(3, 6 - progressionTier);
      if (
        progressionTier >= 1
        && (archetype === 'laser-hunter' || archetype === 'laser-stalker' || archetype.includes('wall-sniper') || source.eliteAttackSequence % 2 === 0)
        && source.eliteAttackSequence % laserCadence === 0
        && this.queueEliteLaneLaser(source)
      ) {
        continue;
      }

      const sourceX = source.x + source.width / 2;
      const sourceY = source.y + source.height * 0.72;
      const targetX = this.player.x + this.player.width / 2 + this.playerVel.x * 5;
      const targetY = this.player.y + this.player.height / 2;
      const baseAngle = Math.atan2(targetY - sourceY, targetX - sourceX);
      const burstCount = Math.max(1, source.configuredBurstCount ?? 3);
      const speed = source.projectileSpeed ?? 4.8;
      const spread = burstCount <= 1 ? 0 : 0.14;

      for (let index = 0; index < burstCount && activeEnemyShots < shotCap; index++) {
        const centeredIndex = index - ((burstCount - 1) / 2);
        const angle = baseAngle + centeredIndex * spread;
        const shot = this.createEntity(EntityType.PROJECTILE, sourceX - 7, sourceY);
        shot.width = 14;
        shot.height = 20;
        shot.vx = Math.cos(angle) * speed;
        shot.vy = Math.sin(angle) * speed;
        shot.color = '#a78bfa';
        shot.isPlayerShot = false;
        shot.damage = Math.max(1, Number(source.projectileDamage) || 1);
        shot.projectileVisualKind = 'boss-bolt';
        shot.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
        shot.sourceEventId = source.sourceEventId;
        this.entities.push(shot);
        activeEnemyShots++;
      }

      this.playSound('boss_shoot', 1.08, { pitchJitter: 0.08, pitchOffset: 0.14 });
      this.flashEntity(source, 3);
    }
  }

  resolveSpriteUrl(spriteKey: AssetKey | string | undefined, entityType: EntityType) {
    if (spriteKey?.startsWith('/')) return spriteKey;
    if (spriteKey) {
      try {
        const catalogPath = getPrimaryAssetPath(spriteKey as AssetKey);
        if (catalogPath) {
          // Catalog images created by the local Director are loaded only when a
          // configured entity first resolves them, never in the eager preload.
          loadImage(catalogPath);
          return catalogPath;
        }
      } catch {
        // The validated campaign only supplies catalog keys; legacy callers may not.
      }
    }
    const normalized = String(spriteKey || '').toLowerCase();
    if (normalized.includes('journal')) return ASSETS.ENEMY_JOURNAL;
    if (normalized.includes('swarm')) return ASSETS.ENEMY_SWARM_FRAMES[0];
    if (normalized.includes('asteroid')) return ASSETS.ASTEROID_BELT_FRAMES[0];
    if (normalized.includes('supply')) return ASSETS.SUPPLY_DROP_STANDARD;
    if (normalized.includes('brick') || normalized.includes('bulwark')) return ASSETS.ENEMY_BRICK_FRAMES[0];
    if (normalized.includes('mini') || normalized.includes('bottleneck')) return ASSETS.MINI_BOSS;
    if (normalized.includes('wall') || normalized.includes('paywall')) return ASSETS.PAYWALL_BASTION_FRAMES[1];
    if (normalized.includes('gate') || normalized.includes('sentinel') || normalized.includes('final')) return ASSETS.FINAL_BOSS;
    if (normalized.includes('drone')) return ASSETS.ENEMY_DRONE_FRAMES[0];

    if (entityType === EntityType.ENEMY_JOURNAL) return ASSETS.ENEMY_JOURNAL;
    if (entityType === EntityType.ENEMY_SWARM) return ASSETS.ENEMY_SWARM_FRAMES[0];
    if (entityType === EntityType.ENEMY_BRICK) return ASSETS.ENEMY_BRICK_FRAMES[0];
    if (entityType === EntityType.SUPPLY_DROP) return ASSETS.SUPPLY_DROP_STANDARD;
    if (entityType === EntityType.MINI_BOSS) return ASSETS.MINI_BOSS;
    if (entityType === EntityType.ENEMY_INVADER) return ASSETS.PAYWALL_BASTION_FRAMES[1];
    if (entityType === EntityType.BOSS) return ASSETS.FINAL_BOSS;
    return ASSETS.ENEMY_DRONE_FRAMES[0];
  }

  resolveSpriteFrames(spriteKey: AssetKey | string | undefined) {
    if (!spriteKey || spriteKey.startsWith('/')) return undefined;
    try {
      const paths = getAssetPaths(spriteKey as AssetKey);
      if (paths.length > 1) {
        paths.forEach(loadImage);
        return [...paths];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  resolveConfiguredEnemyType(enemyId: string) {
    const normalized = String(enemyId || '').toLowerCase();
    if (normalized.includes('journal')) return EntityType.ENEMY_JOURNAL;
    if (normalized.includes('swarm')) return EntityType.ENEMY_SWARM;
    if (normalized.includes('brick') || normalized.includes('asteroid')) return EntityType.ENEMY_BRICK;
    return EntityType.ENEMY_DRONE;
  }

  pickConfiguredEnemy(event: RuntimeSpawnEvent) {
    const enemies = Array.isArray(event.enemies) ? event.enemies : [];
    if (enemies.length === 0) return null;
    const totalWeight = enemies.reduce((sum, enemy) => sum + Math.max(0, Number(enemy.weight) || 0), 0);
    if (totalWeight <= 0) return enemies[0];
    let roll = this.nextGameplayRandom() * totalWeight;
    for (const enemy of enemies) {
      roll -= Math.max(0, Number(enemy.weight) || 0);
      if (roll <= 0) return enemy;
    }
    return enemies[enemies.length - 1];
  }

  getConfiguredSpawnAnchor(event?: { spawnAnchor?: { x: number; y: number } }) {
    const x = Number(event?.spawnAnchor?.x);
    const y = Number(event?.spawnAnchor?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1)
    };
  }

  getAnchoredTopLeft(
    event: { spawnAnchor?: { x: number; y: number } } | undefined,
    entityWidth: number,
    entityHeight: number
  ) {
    const anchor = this.getConfiguredSpawnAnchor(event);
    if (!anchor) return null;
    return {
      x: (anchor.x * this.width) - (entityWidth / 2),
      y: (anchor.y * this.height) - (entityHeight / 2)
    };
  }

  getFormationGroupSeed(eventId: string) {
    return calculateFormationGroupSeed(eventId);
  }

  resolveConfiguredFormationMode(patternId?: string): ConfiguredEnemyFormationMode {
    return resolveFormationMode(patternId);
  }

  getConfiguredFormationTarget(
    event: RuntimeSpawnEvent,
    index: number,
    count: number,
    entityWidth: number,
    entityHeight: number
  ) {
    return resolveConfiguredFormationTarget({
      event: {
        id: event.id,
        patternId: event.patternId,
        positionId: event.positionId,
        spawnAnchor: event.spawnAnchor,
        formationSlots: event.formationSlots,
        enemySpriteKeys: event.enemies.map((enemy) => String(enemy.spriteKey || ''))
      },
      index,
      count,
      entityWidth,
      entityHeight,
      viewport: { width: this.width, height: this.height }
    });
  }

  getConfiguredSpawnPoint(event: RuntimeSpawnEvent, index: number, count: number) {
    return resolveConfiguredFormationSpawnPoint({
      event: {
        id: event.id,
        patternId: event.patternId,
        positionId: event.positionId,
        spawnAnchor: event.spawnAnchor,
        formationSlots: event.formationSlots
      },
      index,
      count,
      viewport: { width: this.width, height: this.height },
      randomSample: this.nextGameplayRandom()
    });
  }

  configureEnemyFormation(enemy: Entity, event: RuntimeSpawnEvent, index: number, count: number) {
    const patternId = String(event.patternId || '').toLowerCase();
    if (patternId.includes('single') || patternId.includes('random')) return;

    const formation = this.resolveConfiguredFormationMode(patternId);
    if (formation === 'spiral' && enemy.type === EntityType.ENEMY_DRONE) {
      enemy.width = Math.round(44 * SPIRAL_PAYWALL_INTERCEPTOR_SCALE * REGULAR_ENEMY_SIZE_SCALE);
      enemy.height = Math.round(44 * SPIRAL_PAYWALL_INTERCEPTOR_SCALE * REGULAR_ENEMY_SIZE_SCALE);
    }
    const target = this.getConfiguredFormationTarget(event, index, count, enemy.width, enemy.height);
    const sideSentry = Boolean(enemy.spriteUrl?.includes('/wall-sniper-'));
    const plan = resolveFormationEntryPlan({
      eventId: event.id,
      patternId,
      index,
      count,
      currentFrame: this.frameCount,
      waveProgressFrames: this.waveProgressFrames,
      baseVerticalSpeed: enemy.vy,
      sideSentry,
      framesPerSecond: GAME_CONFIG.FPS,
      target
    });

    enemy.formation = plan.mode;
    enemy.formationIndex = plan.index;
    enemy.formationSeed = plan.seed;
    enemy.formationGroupSeed = plan.groupSeed;
    enemy.formationState = 'entry';
    enemy.formationTargetX = plan.target.x;
    enemy.formationTargetY = plan.target.y;
    enemy.formationStartX = enemy.x;
    enemy.formationStartY = enemy.y;
    enemy.formationStateFrame = this.frameCount;
    enemy.formationEntryFrames = plan.entryFrames;
    enemy.formationDiveFrame = plan.diveFrame;
    enemy.formationBaseSpeed = plan.baseSpeed;
    enemy.formationCycle = 0;
    enemy.encounterGroupSize = plan.groupSize;
    enemy.vx = 0;
    enemy.vy = 0;
  }

  updateConfiguredEnemyFormation(enemy: Entity) {
    const state = enemy.formationState;
    const formation = enemy.formation;
    const targetX = enemy.formationTargetX;
    const targetY = enemy.formationTargetY;
    if (!state || !formation || formation === 'orbit' || targetX === undefined || targetY === undefined) return false;

    if (state === 'entry' || state === 'return') {
      const duration = Math.max(1, enemy.formationEntryFrames || 54);
      const progress = clamp((this.frameCount - enemy.formationStateFrame) / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const startX = enemy.formationStartX ?? enemy.x;
      const startY = enemy.formationStartY ?? enemy.y;
      const direction = enemy.formationIndex % 2 === 0 ? 1 : -1;
      const arcStrength = formation === 'spiral'
        ? Math.min(this.width * 0.2, 92)
        : formation === 'pincer'
          ? Math.min(this.width * 0.14, 66)
          : Math.min(this.width * 0.11, 52);
      const spiralOffset = formation === 'spiral'
        ? Math.sin(progress * Math.PI * 2 + enemy.formationIndex * 0.55) * (1 - progress) * 38
        : 0;
      enemy.x = lerp(startX, targetX, eased) + Math.sin(progress * Math.PI) * arcStrength * direction + spiralOffset;
      enemy.y = lerp(startY, targetY, eased) - Math.sin(progress * Math.PI) * (formation === 'spiral' ? 42 : 26);
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = Math.sin(progress * Math.PI) * direction * (formation === 'spiral' ? 0.5 : 0.32);

      if (progress >= 1) {
        enemy.x = targetX;
        enemy.y = targetY;
        enemy.angle = 0;
        enemy.formationState = 'hold';
        enemy.formationStateFrame = this.frameCount;
      }
      return true;
    }

    if (state === 'hold') {
      const swayByMode: Record<Exclude<EnemyFormationMode, 'orbit'>, number> = {
        row: 12,
        v: 16,
        sine: 22,
        pincer: 18,
        grid: 10,
        diamond: 20,
        spiral: 28
      };
      const groupSway = Math.sin((this.frameCount + enemy.formationGroupSeed) * 0.018) * swayByMode[formation];
      const formationPulse = formation === 'diamond' || formation === 'spiral'
        ? Math.sin((this.frameCount + enemy.formationIndex * 11) * 0.035) * 4
        : 0;
      enemy.x = targetX + groupSway;
      enemy.y = targetY + formationPulse + Math.sin((this.frameCount + enemy.formationIndex * 17) * 0.045) * 2.5;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = Math.sin((this.frameCount + enemy.formationGroupSeed) * 0.018) * 0.05;

      if (this.frameCount >= enemy.formationDiveFrame) {
        const enemyCenterX = enemy.x + enemy.width / 2;
        const enemyCenterY = enemy.y + enemy.height / 2;
        const laneOffset = ((enemy.formationIndex % 3) - 1) * (this.mobileProfile ? 18 : 28);
        const aimX = this.player.x + this.player.width / 2 + laneOffset + this.playerVel.x * 6;
        const aimY = Math.min(this.height + 80, this.player.y + this.player.height * 0.7);
        const dx = aimX - enemyCenterX;
        const dy = Math.max(90, aimY - enemyCenterY);
        const length = Math.max(1, Math.hypot(dx, dy));
        const diveSpeed = enemy.formationBaseSpeed * (1.28 + Math.min(0.38, this.wave * 0.055));
        enemy.vx = (dx / length) * diveSpeed;
        enemy.vy = Math.max(diveSpeed * 0.72, (dy / length) * diveSpeed);
        enemy.formationState = 'dive';
        enemy.formationStateFrame = this.frameCount;
      }
      return true;
    }

    const diveAge = this.frameCount - enemy.formationStateFrame;
    const curveStrength = formation === 'diamond' || formation === 'pincer' ? 1.2 : formation === 'spiral' ? 1.6 : 0.75;
    enemy.x += Math.sin(diveAge * 0.09 + enemy.formationSeed) * curveStrength;
    enemy.angle = clamp(enemy.vx * 0.065, -0.46, 0.46);

    if (enemy.y > this.height + 72 || enemy.x < -140 || enemy.x > this.width + 140) {
      const returnDirection = (enemy.formationIndex + enemy.formationCycle) % 2 === 0 ? -1 : 1;
      enemy.formationStartX = clamp(targetX + returnDirection * Math.min(this.width * 0.18, 78), -60, this.width + 60);
      enemy.formationStartY = -72 - (enemy.formationIndex % 3) * 18;
      enemy.x = enemy.formationStartX;
      enemy.y = enemy.formationStartY;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = 0;
      enemy.formationState = 'return';
      enemy.formationStateFrame = this.frameCount;
      enemy.formationEntryFrames = 46 + (enemy.formationIndex % 4) * 4;
      enemy.formationCycle++;
      enemy.formationDiveFrame = this.frameCount
        + enemy.formationEntryFrames
        + Math.max(76, 148 - this.wave * 10)
        + (enemy.formationIndex % 5) * 14;
    }
    return true;
  }

  getLooseConfiguredSpawnEvent(
    event: RuntimeSpawnEvent,
    id: string = event.id,
    nonScoring: boolean = false
  ): RuntimeSpawnEvent {
    const { spawnAnchor: _spawnAnchor, formationSlots: _formationSlots, ...looseEvent } = event;
    return {
      ...looseEvent,
      id,
      label: `${event.label} drifter`,
      patternId: 'single-random',
      positionId: 'random-top',
      enemies: nonScoring
        ? event.enemies.map((enemy) => ({
            ...enemy,
            health: Math.min(4, Math.max(1, Number(enemy.health) || 1)),
            damage: Math.min(1, Math.max(0, Number(enemy.damage) || 0)),
            scoreValue: 0,
            powerupDropChance: 0,
            rank: 'standard',
            sizeMultiplier: Math.min(1, Math.max(0.5, Number(enemy.sizeMultiplier) || 1)),
            attackPatternId: undefined,
            attackIntervalSeconds: undefined,
            projectileSpeed: undefined,
            burstCount: undefined
          }))
        : event.enemies
    };
  }

  spawnConfiguredEnemyFromEvent(
    event: RuntimeSpawnEvent,
    spawnIndex: number,
    targetCount: number,
    difficultyMultiplier: number = this.getCurrentDifficultyMultiplier(),
    countTowardCombatBudget: boolean = true
  ) {
    const formationPack = countTowardCombatBudget
      ? this.getCampaignFormationPackForSpawn(event)
      : undefined;
    const formationInstanceId = formationPack
      ? this.getCampaignFormationPackInstanceId(event.id)
      : undefined;
    let formationInstance = formationInstanceId
      ? this.campaignFormationPackInstances.get(formationInstanceId)
      : undefined;
    if (formationPack) {
      this.reconcileCampaignFormationPackInstances();
      formationInstance = formationInstanceId
        ? this.campaignFormationPackInstances.get(formationInstanceId)
        : undefined;
      if (!canStartCampaignFormationPackInstance({
        pack: formationPack,
        alreadyStarted: Boolean(formationInstance && !formationInstance.retired),
        activeInstanceCount: this.getActiveCampaignFormationPackInstanceCount(formationPack.id),
        lastRetiredFrame: this.campaignFormationPackLastRetiredFrames.get(formationPack.id),
        currentFrame: this.frameCount,
        framesPerSecond: GAME_CONFIG.FPS
      })) return false;
    }

    const enemySetting = this.pickConfiguredEnemy(event);
    if (!enemySetting) return false;
    const role = this.getCampaignEnemyRole(enemySetting.roleId);
    const threatCost = Math.max(0.25, Number(role?.threatCost) || 1);
    const performanceCost = Math.max(0.25, Number(role?.performanceCost) || 1);
    if (
      countTowardCombatBudget
      && this.authoredWaveThreatSpent + threatCost > this.getCurrentWaveCombatBudget() + 0.001
    ) {
      // The authored validator prevents this in tracked content. Marking the
      // event exhausted keeps a malformed hot-edited preview from deadlocking.
      this.configuredSpawnCounts.set(event.id, targetCount);
      return false;
    }
    if (
      role
      && this.getActiveCampaignRoleCount(role.id) >= role.maximumSimultaneousCount
    ) return false;
    if (
      this.mobileProfile
      && this.getActiveCampaignPerformanceCost() + performanceCost > this.getCurrentMobilePerformanceBudget()
    ) return false;
    const enemyType = this.resolveConfiguredEnemyType(enemySetting.enemyId);
    const point = this.getConfiguredSpawnPoint(event, spawnIndex, targetCount);
    const enemy = this.createEnemy(enemyType, point.x, point.y, {
      speed: Number(enemySetting.speed) * difficultyMultiplier,
      health: Number(enemySetting.health) * difficultyMultiplier,
      contactDamage: Number(enemySetting.damage) * difficultyMultiplier,
      projectileDamage: Number(enemySetting.damage) * difficultyMultiplier,
      scoreValue: Number(enemySetting.scoreValue),
      powerupDropChance: Number(enemySetting.powerupDropChance),
      spriteUrl: this.resolveSpriteUrl(enemySetting.spriteKey, enemyType),
      spriteFrames: this.resolveSpriteFrames(enemySetting.spriteKey),
      spriteStyle: enemySetting.spriteStyle,
      rank: enemySetting.rank,
      sizeMultiplier: enemySetting.sizeMultiplier,
      attackPatternId: enemySetting.attackPatternId,
      attackIntervalSeconds: enemySetting.attackIntervalSeconds,
      projectileSpeed: enemySetting.projectileSpeed,
      burstCount: enemySetting.burstCount
    });
    const patternId = String(event.patternId || '').toLowerCase();
    if (this.getConfiguredSpawnAnchor(event) && (patternId.includes('single') || patternId.includes('random'))) {
      enemy.x -= enemy.width / 2;
      enemy.y -= enemy.height / 2;
    }
    enemy.sourceEventId = event.id;
    enemy.sourceItemId = enemySetting.enemyId;
    enemy.campaignRoleId = role?.id;
    enemy.campaignGameplayRole = role?.role;
    enemy.campaignDurabilityClass = role?.durabilityClass;
    enemy.campaignThreatCost = countTowardCombatBudget ? threatCost : 0;
    enemy.campaignPerformanceCost = performanceCost;
    enemy.campaignFireBehavior = countTowardCombatBudget ? role?.fireBehavior : 'none';
    enemy.campaignFireDelaySeconds = countTowardCombatBudget
      ? Math.max(0, Number(role?.fireDelaySeconds) || 0)
      : 0;
    enemy.campaignFormationFiringBehavior = countTowardCombatBudget
      ? formationPack?.firingBehavior ?? this.getCampaignFormationFiringBehavior(role?.id)
      : 'none';
    enemy.campaignFormationPackId = formationPack?.id;
    enemy.campaignFormationPackInstanceId = formationInstanceId;
    enemy.campaignSpawnFrame = this.frameCount;
    if (
      countTowardCombatBudget
      && role?.fireBehavior
      && role.fireBehavior !== 'none'
      && !Number.isFinite(enemy.attackIntervalFrames)
    ) {
      enemy.attackIntervalFrames = role.fireBehavior === 'aimed-burst' ? 82 : 104;
    }
    this.configureEnemyFormation(enemy, event, spawnIndex, targetCount);
    if (formationPack && formationInstanceId) {
      const nextInstance = formationInstance && !formationInstance.retired
        ? formationInstance
        : {
            packId: formationPack.id,
            eventId: event.id,
            campaignIndex: this.currentCampaignIndex,
            targetCount,
            spawnedCount: 0,
            retired: false
          };
      nextInstance.targetCount = Math.max(nextInstance.targetCount, targetCount);
      nextInstance.spawnedCount = Math.max(nextInstance.spawnedCount, spawnIndex + 1);
      nextInstance.retired = false;
      this.campaignFormationPackInstances.set(formationInstanceId, nextInstance);
    }
    if (countTowardCombatBudget) this.authoredWaveThreatSpent += threatCost;
    this.configuredSpawnCounts.set(event.id, spawnIndex + 1);
    this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
    return true;
  }

  spawnConfiguredEnemies() {
    this.reconcileCampaignFormationPackInstances();
    const events = this.getConfiguredSpawnEvents();
    if (events.length === 0) return false;
    const elapsedSeconds = this.getWaveElapsedSeconds();
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const threatCap = Math.max(1, Number(this.getCurrentWaveDefinition()?.threatCap) || this.getThreatCap());
    const looseEntryActive = this.internalWaveLooseEntriesRemaining > 0
      && this.waveProgressFrames <= INTERNAL_WAVE_LOOSE_ENTRY_WINDOW_FRAMES;
    if (!looseEntryActive) this.internalWaveLooseEntriesRemaining = 0;
    const looseEntrySource = looseEntryActive
      ? events.find((event) => elapsedSeconds >= Math.max(0, Number(event.startSeconds) || 0))
      : null;
    if (looseEntrySource && this.getActiveThreatCount() < threatCap) {
      const looseEntryEventId = `${looseEntrySource.id}:lead-in`;
      const spawned = this.configuredSpawnCounts.get(looseEntryEventId) || 0;
      const previousFrame = this.configuredSpawnFrames.get(looseEntryEventId);
      if (
        spawned < INTERNAL_WAVE_LOOSE_ENTRY_COUNT
        && (previousFrame === undefined
          || this.waveProgressFrames - previousFrame >= INTERNAL_WAVE_LOOSE_ENTRY_INTERVAL_FRAMES)
        && this.spawnConfiguredEnemyFromEvent(
          this.getLooseConfiguredSpawnEvent(looseEntrySource, looseEntryEventId, true),
          spawned,
          INTERNAL_WAVE_LOOSE_ENTRY_COUNT,
          difficultyMultiplier,
          false
        )
      ) {
        this.internalWaveLooseEntriesRemaining--;
      }
    }

    for (const event of events) {
      const startSeconds = Math.max(0, Number(event.startSeconds) || 0);
      const durationSeconds = Math.max(0, Number(event.durationSeconds) || 0);
      const endSeconds = durationSeconds > 0 ? startSeconds + durationSeconds : Number.POSITIVE_INFINITY;
      const count = this.getConfiguredSpawnTargetCount(event);
      const spawned = this.configuredSpawnCounts.get(event.id) || 0;
      const finishingClearWave = this.getCurrentWaveCompletionRule() === 'clear-after-duration'
        && elapsedSeconds >= this.getConfiguredWaveDurationSeconds();
      if (elapsedSeconds < startSeconds || (!finishingClearWave && elapsedSeconds > endSeconds) || spawned >= count) continue;
      if (this.getActiveThreatCount() >= threatCap) break;

      const intervalFrames = Math.max(1, Math.round(
        ((Number(event.spawnIntervalSeconds) || 0.8) * GAME_CONFIG.FPS) / difficultyMultiplier
      ));
      const previousFrame = this.configuredSpawnFrames.get(event.id);
      if (previousFrame !== undefined && this.waveProgressFrames - previousFrame < intervalFrames) continue;

      const cycle = this.getCampaignCycle();
      const formationEvent = !String(event.patternId || '').toLowerCase().includes('single')
        && !String(event.patternId || '').toLowerCase().includes('random');
      if (cycle > 0 && formationEvent && spawned === 0 && !this.escalationWarningsShown.has(event.id)) {
        this.escalationWarningsShown.add(event.id);
        const entersFromLeft = (event.id.length + cycle) % 2 === 0;
        const warningX = entersFromLeft ? 36 : this.width - 36;
        this.spawnFloatingText(warningX, this.height * 0.22, 'SIDE ENTRY', '#fb7185', 15);
        this.spawnRingEffect(warningX, this.height * 0.22, '#fb7185');
      }
      this.spawnConfiguredEnemyFromEvent(event, spawned, count, difficultyMultiplier);
    }

    const wave = this.getCurrentWaveDefinition();
    const continuityEndFrame = this.getConfiguredWaveDurationFrames() - WAVE_CONTINUITY_END_BUFFER_FRAMES;
    const continuityTargetCount = getWaveContinuityLooseEnemyCap(this.getConfiguredWaveDurationFrames());
    const continuitySource = [...events]
      .reverse()
      .find((event) => elapsedSeconds >= Math.max(0, Number(event.startSeconds) || 0));
    if (
      wave?.rhythm !== 'recovery'
      && continuitySource
      && this.getConfiguredSpawnsComplete()
      && this.waveProgressFrames < continuityEndFrame
      && this.getActiveThreatCount() <= 2
      && this.getActiveThreatCount() < threatCap
    ) {
      const continuityEventId = `${continuitySource.id}:continuity`;
      const spawned = this.configuredSpawnCounts.get(continuityEventId) || 0;
      const previousFrame = this.configuredSpawnFrames.get(continuityEventId);
      if (
        spawned < continuityTargetCount
        && (previousFrame === undefined
          || this.waveProgressFrames - previousFrame >= WAVE_CONTINUITY_LOOSE_ENEMY_INTERVAL_FRAMES)
      ) {
        this.spawnConfiguredEnemyFromEvent(
          this.getLooseConfiguredSpawnEvent(continuitySource, continuityEventId, true),
          spawned,
          continuityTargetCount,
          difficultyMultiplier,
          false
        );
      }
    }

    return true;
  }

  spawnConfiguredSupportEvents() {
    const events = this.getCurrentWaveDefinition()?.events;
    if (!Array.isArray(events) || events.length === 0) return;
    const elapsedSeconds = this.getWaveElapsedSeconds();

    for (const event of events) {
      if (event.kind === 'powerup') {
        const startSeconds = Math.max(0, Number(event.startSeconds) || 0);
        const endSeconds = startSeconds + Math.max(0, Number(event.durationSeconds) || 0);
        if (elapsedSeconds < startSeconds || elapsedSeconds > endSeconds) continue;
        const intervalFrames = Math.max(1, Math.round((Number(event.spawnIntervalSeconds) || 40) * GAME_CONFIG.FPS));
        const startFrame = Math.round(startSeconds * GAME_CONFIG.FPS);
        const previousFrame = this.configuredSpawnFrames.get(event.id) ?? startFrame;
        if (this.waveProgressFrames - previousFrame < intervalFrames) continue;
        const powerupIds = Array.isArray(event.powerupIds) ? event.powerupIds : [];
        const totalWeight = powerupIds.reduce((sum, id) => sum + Math.max(0, getPowerup(id).defaultWeight), 0);
        let powerupId = powerupIds[0];
        if (totalWeight > 0) {
          let roll = this.nextGameplayRandom() * totalWeight;
          for (const id of powerupIds) {
            roll -= Math.max(0, getPowerup(id).defaultWeight);
            if (roll <= 0) {
              powerupId = id;
              break;
            }
          }
        }
        const anchor = this.getConfiguredSpawnAnchor(event);
        const powerup = this.spawnPowerup(
          anchor ? (anchor.x * this.width) - 18 : this.nextGameplayRandom() * Math.max(1, this.width - 40),
          anchor ? (anchor.y * this.height) - 18 : -40,
          powerupId
        );
        powerup.sourceEventId = event.id;
        powerup.sourceItemId = powerupId;
        this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
        this.configuredSpawnCounts.set(event.id, (this.configuredSpawnCounts.get(event.id) || 0) + 1);
      } else if (event.kind === 'recovery' && !this.configuredEncounterIds.has(event.id)) {
        if (elapsedSeconds < Math.max(0, Number(event.startSeconds) || 0)) continue;
        this.configuredEncounterIds.add(event.id);
        const coinCount = Math.max(0, Math.floor(Number(event.coinCount) || 0));
        const anchor = this.getConfiguredSpawnAnchor(event);
        for (let index = 0; index < coinCount; index++) {
          const coin = this.spawnCoin(
            this.width * ((index + 1) / Math.max(2, coinCount + 1)) + (anchor ? (anchor.x * this.width) - (this.width / 2) : 0),
            -30 - index * 22 + (anchor ? (anchor.y * this.height) - (-30) : 0)
          );
          coin.sourceEventId = event.id;
          coin.sourceItemId = 'coin';
        }
        const powerupIds = event.powerupIds || [];
        for (const [index, powerupId] of powerupIds.entries()) {
          const powerup = this.spawnPowerup(
            anchor
              ? (anchor.x * this.width) - 18 + ((index - ((powerupIds.length - 1) / 2)) * 44)
              : this.nextGameplayRandom() * Math.max(1, this.width - 40),
            anchor ? (anchor.y * this.height) - 18 : -50,
            powerupId
          );
          powerup.sourceEventId = event.id;
          powerup.sourceItemId = powerupId;
        }
      }
    }
  }

  spawnEnemies() {
    const invaderCount = this.countEntities(EntityType.ENEMY_INVADER);
    const asteroidBeltCount = this.getAsteroidBeltCount();
    if (this.bossRef || this.getActiveMiniBosses().length > 0 || invaderCount > 0 || asteroidBeltCount > 0 || this.inBossWarningSequence) return;
    if (this.spawnConfiguredEnemies()) return;
    if (this.getConfiguredEncounterEvents().some((event) => (
      event.kind === 'supply-drop'
    ))) return;
    const activeThreatCount = this.getActiveThreatCount();
    const threatCap = this.getThreatCap();
    if (activeThreatCount >= threatCap) return;

    // Make rarer: 1800 -> 2400
    if (this.frameCount % 2400 === 0) {
        this.spawnPowerup(this.nextGameplayRandom() * (this.width - 40), -40);
    }

    const formationRate = Math.max(132, 330 - this.wave * 34);
    if (this.waveProgressFrames > 120 && this.frameCount % formationRate === 0 && activeThreatCount < threatCap - 3) {
      this.spawnSwarmFormation();
    }

    const currentRate = Math.max(30, GAME_CONFIG.BASE_SPAWN_RATE + 12 - ((this.wave - 1) * 10));

    if (this.frameCount % currentRate === 0) {
      const typeRoll = this.nextGameplayRandom();
      const x = this.nextGameplayRandom() * (this.width - 40);
      let enemyType = EntityType.ENEMY_DRONE;

      if (this.wave === 1) {
        if (this.stats.bossProgress < 0.3) {
          if (typeRoll > 0.88) enemyType = EntityType.ENEMY_SWARM;
        } else if (this.stats.bossProgress < 0.7) {
          if (typeRoll > 0.9) enemyType = EntityType.ENEMY_SWARM;
          else if (typeRoll > 0.64) enemyType = EntityType.ENEMY_BRICK;
        } else {
          if (typeRoll > 0.9) enemyType = EntityType.ENEMY_SWARM;
          else if (typeRoll > 0.7) enemyType = EntityType.ENEMY_BRICK;
          else if (typeRoll > 0.44) enemyType = EntityType.ENEMY_JOURNAL;
        }
      } else if (this.stats.bossProgress < 0.3) {
        if (typeRoll > 0.7) enemyType = EntityType.ENEMY_SWARM;
      } else if (this.stats.bossProgress < 0.7) {
        if (typeRoll > 0.8) enemyType = EntityType.ENEMY_SWARM;
        else if (typeRoll > 0.5) enemyType = EntityType.ENEMY_BRICK;
      } else {
        if (typeRoll > 0.85) enemyType = EntityType.ENEMY_SWARM;
        else if (typeRoll > 0.6) enemyType = EntityType.ENEMY_BRICK;
        else if (typeRoll > 0.3) enemyType = EntityType.ENEMY_JOURNAL;
      }

      this.createEnemy(enemyType, x, -50);
    }
  }

  spawnSwarmFormation() {
    const modes: Array<'row' | 'v' | 'sine' | 'pincer'> = this.wave <= 1
      ? ['row', 'v']
      : this.wave === 2
        ? ['row', 'v', 'sine']
        : ['row', 'v', 'sine', 'pincer'];
    const mode = modes[(this.wave + Math.floor(this.frameCount / 120)) % modes.length];
    const isMobile = this.width < 520;
    const threatBudget = Math.max(0, this.getThreatCap() - this.getActiveThreatCount());
    const count = Math.min(11, 6 + this.wave + Math.floor(this.stats.bossProgress * 4), threatBudget);
    if (count < 3) return;
    const gap = isMobile ? 42 : 54;
    const centerX = this.width / 2;
    const startX = centerX - ((count - 1) * gap) / 2;
    const seed = this.nextGameplayRandom() * 1000;
    const eliteAllowed = this.wave > 1 || this.stats.bossProgress > 0.42;
    const centerIndex = Math.floor(count / 2);

    for (let i = 0; i < count; i++) {
      const offset = i - ((count - 1) / 2);
      const x = mode === 'pincer'
        ? (i % 2 === 0 ? -40 : this.width + 40)
        : clamp(startX + i * gap, 12, this.width - 46);
      const y = -70 - Math.abs(offset) * (mode === 'v' ? 24 : 7) - (i % 2) * 10;
      let enemyType = EntityType.ENEMY_SWARM;

      if (mode === 'row') {
        enemyType = i % 3 === 1 ? EntityType.ENEMY_DRONE : EntityType.ENEMY_SWARM;
      } else if (mode === 'v') {
        enemyType = eliteAllowed && i === centerIndex
          ? EntityType.ENEMY_BRICK
          : (i % 2 === 0 ? EntityType.ENEMY_SWARM : EntityType.ENEMY_DRONE);
      } else if (mode === 'sine') {
        enemyType = eliteAllowed && i % 4 === 0 ? EntityType.ENEMY_JOURNAL : EntityType.ENEMY_SWARM;
      } else if (mode === 'pincer') {
        enemyType = eliteAllowed && i % 5 === 0
          ? EntityType.ENEMY_BRICK
          : (i % 3 === 0 ? EntityType.ENEMY_DRONE : EntityType.ENEMY_SWARM);
      }

      const enemy = this.createEnemy(enemyType, x, y);
      enemy.formation = mode;
      enemy.formationIndex = i;
      enemy.formationSeed = seed + i * 19;
      const isHeavy = enemy.type === EntityType.ENEMY_BRICK || enemy.type === EntityType.ENEMY_JOURNAL;
      enemy.vy = (mode === 'row' ? 2.8 + this.wave * 0.18 : 3.1 + this.wave * 0.2) * (isHeavy ? 0.76 : 1);
      enemy.vx = mode === 'pincer'
        ? (i % 2 === 0 ? 2.1 : -2.1)
        : Math.sin(i * 0.9) * 0.55;
    }

  }

  createEnemy(type: EntityType, x: number, y: number, overrides: EnemyRuntimeOverrides = {}) {
    const e = this.createEntity(type, x, y);
    const hpMult = this.wave === 1 ? 1 : 1 + (this.wave * 0.34);
    const speedBoost = this.wave === 1 ? 1 : 1 + (this.wave * 0.11);
    e.variant = this.gameplayRandom.integer(0, 100);

    if (type === EntityType.ENEMY_DRONE) {
      e.vy = 2.5 * speedBoost;
      e.hp = 2 * hpMult;
      e.width = Math.round(44 * PAYWALL_INTERCEPTOR_SCALE);
      e.height = Math.round(44 * PAYWALL_INTERCEPTOR_SCALE);
      e.color = '#7dd3fc';
      e.spriteFrames = [...ASSETS.ENEMY_DRONE_FRAMES];
      e.text = "🔒";
    } else if (type === EntityType.ENEMY_JOURNAL) {
      e.vy = 4.4 * speedBoost;
      e.vx = Math.sin((this.frameCount + e.variant) * 0.2) * 4;
      e.hp = 3 * hpMult;
      e.color = '#fb7185';
      e.text = "📕";
      e.width = 56;
      e.height = 66;
      e.spriteFrames = [...ASSETS.ENEMY_JOURNAL_FRAMES];
    } else if (type === EntityType.ENEMY_BRICK) {
      e.vy = 1.5 * speedBoost;
      e.hp = 8 * hpMult;
      e.width = 54;
      e.height = 54;
      e.color = '#f59e0b';
      e.spriteFrames = [...ASSETS.ENEMY_BRICK_FRAMES];
      e.text = "📰";
    } else if (type === EntityType.ENEMY_SWARM) {
      e.vy = 3.5 * speedBoost;
      e.hp = 1 * hpMult;
      e.width = Math.round(34 * CITATION_WRAITH_SCALE);
      e.height = Math.round(28 * CITATION_WRAITH_SCALE);
      e.color = '#34d399';
      e.spriteFrames = [...ASSETS.ENEMY_SWARM_FRAMES];
      e.text = "🪰";
    }

    if (Number.isFinite(overrides.speed)) e.vy = overrides.speed as number;
    if (Number.isFinite(overrides.health)) e.hp = Math.max(0.1, overrides.health as number);
    if (Number.isFinite(overrides.contactDamage)) e.contactDamage = Math.max(0, overrides.contactDamage as number);
    if (Number.isFinite(overrides.projectileDamage)) e.projectileDamage = Math.max(0, overrides.projectileDamage as number);
    if (Number.isFinite(overrides.scoreValue)) e.scoreValue = Math.max(0, overrides.scoreValue as number);
    if (Number.isFinite(overrides.powerupDropChance)) {
      e.powerupDropChance = clamp(overrides.powerupDropChance as number, 0, 1);
    }
    const configuredSizeMultiplier = clamp(Number(overrides.sizeMultiplier) || 1, 0.5, 2.5);
    const effectiveSizeMultiplier = configuredSizeMultiplier * REGULAR_ENEMY_SIZE_SCALE;
    e.width = Math.round(e.width * effectiveSizeMultiplier);
    e.height = Math.round(e.height * effectiveSizeMultiplier);
    e.eliteRank = overrides.rank;
    e.isElite = overrides.rank === 'elite';
    e.eliteAttackPattern = overrides.attackPatternId;
    if (Number.isFinite(overrides.attackIntervalSeconds)) {
      e.attackIntervalFrames = Math.max(18, Math.round(
        (Number(overrides.attackIntervalSeconds) * GAME_CONFIG.FPS) / this.getCurrentDifficultyMultiplier()
      ));
    }
    if (Number.isFinite(overrides.projectileSpeed)) {
      e.projectileSpeed = Math.max(0.5, Number(overrides.projectileSpeed));
    }
    if (Number.isFinite(overrides.burstCount)) {
      e.configuredBurstCount = Math.max(1, Math.min(7, Math.floor(Number(overrides.burstCount))));
    }
    if (overrides.spriteUrl) {
      e.spriteUrl = overrides.spriteUrl;
      loadImage(e.spriteUrl);
    }
    if (overrides.spriteFrames?.length) {
      e.spriteFrames = [...overrides.spriteFrames];
      e.spriteFrames.forEach(loadImage);
    }
    if (overrides.spriteStyle) e.spriteStyle = { ...overrides.spriteStyle };
    e.maxHp = e.hp;
    this.entities.push(e);
    return e;
  }

  applyConfiguredBossPhase(boss: Entity) {
    const resolved = resolveBossPhaseConfig(
      boss.hp,
      boss.maxHp,
      boss.bossPhaseSettings,
      boss.bossWeaponSettings,
      getBossRevivalPhaseBounds(
        boss.bossRevival,
        boss.bossPhaseSettings,
        boss.bossRevivalConsumed
      )
    );
    if (!resolved) return 0;
    if (boss.activeBossPhaseIndex === resolved.phaseIndex) return resolved.phaseIndex + 1;

    const transitionedBetweenActivePhases = boss.activeBossPhaseIndex >= 0;
    boss.activeBossPhaseIndex = resolved.phaseIndex;
    boss.activeBossPhaseId = resolved.phaseId;
    boss.bossTimelinePhaseId = resolved.phaseId;
    boss.activeBossPhaseSpeedMultiplier = Math.max(0.01, Number(resolved.speedMultiplier) || 1);
    if (
      this.telemetrySink
      && this.telemetrySessionActive
      && this.telemetryBossPhaseByEntityId.get(boss.id) !== resolved.phaseIndex
    ) {
      this.telemetryBossPhaseByEntityId.set(boss.id, resolved.phaseIndex);
      this.telemetrySink.record({
        ...this.getTelemetryContext(),
        type: 'boss-phase',
        bossId: boss.sourceItemId ?? boss.id,
        phaseId: resolved.phaseId,
        phaseIndex: resolved.phaseIndex,
        healthRatio: clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1)
      });
    }
    boss.movementPattern = resolved.movementPatternId;
    const baseSpeed = boss.configuredBaseSpeed ?? boss.configuredSpeed ?? 2;
    boss.configuredSpeed = baseSpeed * boss.activeBossPhaseSpeedMultiplier;
    if ((boss.bossAttackArchetype || boss.bossTimeline) && transitionedBetweenActivePhases) {
      // A new authored boss phase starts at the beginning of its cue cycle so
      // a damaging technique can never skip its warning.
      this.clearPrismMothRuntime(boss);
      boss.attackTimer = 0;
      boss.bossMovementPathId = undefined;
      boss.bossMovementPathStartFrame = -1;
      boss.bossMovementPathDurationFrames = 0;
      boss.bossPresentationBankRadians = 0;
      boss.generatedBossChargeUntilTimer = -1;
      boss.generatedBossTechniqueTimer = -1;
      boss.generatedBossTargetX = null;
      boss.generatedBossTargetY = null;
      boss.generatedBossTargetSequence = -1;
      this.clearBossTimelineActionLocks(boss);
      boss.bossCornerAmbushBeamState = undefined;
      boss.bossCornerAmbushRamState = undefined;
      boss.bossTrackingPincerState = undefined;
      boss.bossHeliosCornerClampState = undefined;
      boss.bossHeliosMachineGunChannelState = undefined;
      this.removeBossCornerAmbushBeams(boss);
      boss.isCharging = false;
      boss.bossActionPresentation = undefined;
    }

    const activeWeapons = resolved.weaponSettings;
    boss.weaponKinds = activeWeapons.map((setting) => String(setting.weaponId));
    const primaryWeapon = activeWeapons[0];
    if (primaryWeapon) {
      const difficultyMultiplier = Math.max(0.01, boss.configuredDifficultyMultiplier || 1);
      // A graph-authored Campaign commander already carries its complete
      // projectile budget in campaign.json. Applying the ambient Mission
      // multiplier again turned late authored values such as M50's 1 damage,
      // 7.6 speed and 5.4-second cadence into ~2.1 damage, ~15.9 speed and a
      // ~2.6-second cadence. Preserve the explicit Campaign contract while
      // retaining legacy/sandbox difficulty scaling everywhere else.
      const weaponDifficultyMultiplier = String(boss.sourceEventId ?? '').endsWith('-major-boss')
        ? 1
        : difficultyMultiplier;
      boss.projectileDamage = Math.max(0, Number(primaryWeapon.damage) * weaponDifficultyMultiplier);
      boss.projectileSpeed = Math.max(0.1, Number(primaryWeapon.projectileSpeed) * weaponDifficultyMultiplier);
      boss.attackIntervalFrames = Math.max(1, Math.round(
        (Number(primaryWeapon.attackIntervalSeconds) * GAME_CONFIG.FPS) / weaponDifficultyMultiplier
      ));
      boss.configuredBurstCount = Math.max(1, Math.floor(Number(primaryWeapon.burstCount) || 1));
    }

    return resolved.phaseIndex + 1;
  }

  private getMiniBossLabMemberEntity(
    state: MiniBossLabEngineState,
    memberId: string
  ) {
    const entityId = state.memberEntityIds.get(memberId);
    if (!entityId) return undefined;
    return this.entities.find((entity) => entity.id === entityId);
  }

  private getMiniBossLabDefinition(state: MiniBossLabEngineState) {
    return getMiniBossEncounterDefinition(state.encounterId);
  }

  private getConfiguredMiniBossLabDefinition(configured: RuntimeBossEvent) {
    return getMiniBossEncounterDefinition(configured.bossId)
      ?? getMiniBossEncounterByEventId(configured.id);
  }

  private shouldShowMiniBossLabHealthBar(
    definition: MiniBossEncounterDefinition,
    member: MiniBossMemberInstance
  ) {
    if (!member.damageable) return false;
    if (definition.compactHealth.mode === 'per-member') {
      return member.role !== 'guardian' && member.role !== 'satellite' && member.role !== 'escort';
    }
    return member.role === 'primary' || member.role === 'leader' || member.role === 'partner';
  }

  private resolveMiniBossLabMemberColor(member: MiniBossMemberInstance) {
    if (member.role === 'partner' || member.role === 'sentry-east') return '#fb7185';
    if (member.role === 'guardian' || member.role === 'escort') return '#a7f3d0';
    if (member.role === 'satellite') return '#c4b5fd';
    return '#67e8f9';
  }

  private spawnMiniBossLabEncounter(
    configured: RuntimeBossEvent,
    definition: MiniBossEncounterDefinition
  ) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const instances = createMiniBossMemberInstances(definition);
    const damageableInstances = instances.filter((instance) => instance.damageable);
    const baseEncounterHealth = damageableInstances.reduce(
      (total, instance) => total + Math.max(1, instance.maxHealth),
      0
    );
    const configuredEncounterHealth = Number(configured.health);
    const encounterHealthMultiplier = Math.min(
      2.2,
      Math.max(1, Math.sqrt(Math.max(1, damageableInstances.length)))
    );
    const targetEncounterHealth = Number.isFinite(configuredEncounterHealth) && configuredEncounterHealth > 0
      ? configuredEncounterHealth * encounterHealthMultiplier * difficultyMultiplier
      : baseEncounterHealth * difficultyMultiplier;
    const campaignHealthScale = targetEncounterHealth / Math.max(1, baseEncounterHealth);
    const initialFrame = sampleMiniBossEncounter(definition, {
      frame: 0,
      fps: GAME_CONFIG.FPS,
      viewportWidth: this.width,
      viewportHeight: this.height,
      seed: this.gameplayRandomSeed
    });
    const initialFrameById = new Map(initialFrame.members.map((member) => [member.id, member]));
    const state: MiniBossLabEngineState = {
      encounterId: definition.id,
      eventId: configured.id,
      startFrame: this.frameCount,
      lastUpdateFrame: -1,
      lastSampleFrame: -1,
      memberEntityIds: new Map(),
      destroyedMemberIds: new Set(),
      emittedHazardIds: new Set(),
      hitUntilFrameByMemberId: new Map(),
      pendingProjectiles: [],
      reinforcementsSpawned: 0,
      signatureLoop: false,
      supportStartFrame: null,
      shieldOverride: null,
      wallSide: null,
      defeatStartFrame: null,
      completionTriggered: false,
      completionFrame: null,
      rewardScore: Math.max(0, Number(configured.scoreReward) || 0),
      powerupDropChance: clamp(Number(configured.powerupDropChance) || 0, 0, 1),
      victoryRewarded: false,
      activeStage: 'entrance'
    };

    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index];
      const sampled = initialFrameById.get(instance.id);
      const binding = definition.assets.find((candidate) => candidate.id === instance.assetId);
      const entity = this.createEntity(
        EntityType.MINI_BOSS,
        (sampled?.x ?? this.width / 2) - instance.widthPixels / 2,
        (sampled?.y ?? -instance.heightPixels) - instance.heightPixels / 2
      );
      entity.width = instance.widthPixels;
      entity.height = instance.heightPixels;
      entity.hp = Math.max(1, Math.round(
        instance.maxHealth * (instance.damageable ? campaignHealthScale : difficultyMultiplier)
      ));
      entity.maxHp = entity.hp;
      entity.color = this.resolveMiniBossLabMemberColor(instance);
      entity.text = instance.label.toUpperCase();
      entity.variant = index * 37;
      entity.formationIndex = index;
      entity.encounterGroupSize = instances.length;
      entity.attackTimer = 0;
      entity.configuredDifficultyMultiplier = difficultyMultiplier;
      entity.configuredBaseSpeed = Math.max(0.1, Number(configured.speed) || 1);
      entity.configuredSpeed = entity.configuredBaseSpeed;
      entity.contactDamage = Math.max(0, Number(configured.damage) || 1);
      entity.scoreReward = 0;
      entity.powerupDropChance = 0;
      entity.sourceEventId = configured.id;
      entity.sourceItemId = definition.id;
      entity.miniBossLabEncounterId = definition.id;
      entity.miniBossLabMemberId = instance.id;
      entity.miniBossLabAssetId = instance.assetId;
      entity.miniBossLabRole = instance.role;
      entity.miniBossLabSpawnFrame = this.frameCount;
      entity.miniBossLabDamageable = instance.damageable;
      entity.miniBossLabShowHealthBar = this.shouldShowMiniBossLabHealthBar(definition, instance);
      entity.miniBossLabHealthBarWidth = definition.compactHealth.widthPixels;
      entity.miniBossLabVisualState = 'entrance';
      entity.spriteUrl = resolveMiniBossMemberAssetUrl(definition, {
        assetId: instance.assetId,
        animationState: 'entrance',
        healthRatio: 1
      }, 0) ?? binding?.url;
      if (binding?.frames?.length) entity.spriteFrames = [...binding.frames];
      if (entity.spriteUrl) loadImage(entity.spriteUrl);
      entity.spriteFrames?.forEach(loadImage);
      state.memberEntityIds.set(instance.id, entity.id);
      this.entities.push(entity);
    }

    this.miniBossLabEncounters.set(configured.id, state);
    this.miniBossRef = this.entities.find((entity) => (
      entity.sourceEventId === configured.id
      && entity.type === EntityType.MINI_BOSS
      && entity.miniBossLabShowHealthBar
    )) ?? this.entities.find((entity) => (
      entity.sourceEventId === configured.id && entity.type === EntityType.MINI_BOSS
    )) ?? null;
  }

  spawnMiniBoss(_num: number, configured?: RuntimeBossEvent) {
    const miniBossLabDefinition = configured
      ? this.getConfiguredMiniBossLabDefinition(configured)
      : undefined;
    if (configured && miniBossLabDefinition) {
      this.spawnMiniBossLabEncounter(configured, miniBossLabDefinition);
      return;
    }
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const requestedCount = configured ? Number(configured.count ?? 1) : _num;
    const count = Math.max(1, Math.min(4, Math.floor(requestedCount) || 1));
    const gap = count > 1 ? (this.mobileProfile ? 10 : 20) : 0;
    const availableWidth = Math.max(160, this.width - 24);
    const bossWidth = count > 1
      ? Math.min(140, Math.floor((availableWidth - gap * (count - 1)) / count))
      : 140;
    const bossHeight = Math.round(bossWidth * (160 / 140));
    const groupWidth = bossWidth * count + gap * (count - 1);
    const anchoredPosition = this.getAnchoredTopLeft(configured, groupWidth, bossHeight);
    const startX = anchoredPosition?.x ?? (this.width - groupWidth) / 2;
    const startY = anchoredPosition?.y ?? -100;
    const spawned: Entity[] = [];

    for (let index = 0; index < count; index++) {
      const mb = this.createEntity(
        EntityType.MINI_BOSS,
        startX + index * (bossWidth + gap),
        startY
      );
      mb.width = bossWidth;
      mb.height = bossHeight;
      mb.hp = configured
        ? Math.max(1, (Number(configured.health) || 1) * difficultyMultiplier)
        : this.wave === 1 ? 44 : 45 + (this.wave * 22);
      mb.maxHp = mb.hp;
      mb.configuredBaseSpeed = configured ? Math.max(0.1, (Number(configured.speed) || 2) * difficultyMultiplier) : 2;
      mb.configuredSpeed = mb.configuredBaseSpeed;
      mb.configuredDifficultyMultiplier = difficultyMultiplier;
      mb.vy = mb.configuredSpeed;
      mb.color = '#fb7185';
      mb.variant = index * 31;
      mb.formationIndex = index;
      mb.encounterGroupSize = count;
      mb.attackTimer = index * 18;
      if (configured) {
        mb.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.MINI_BOSS);
        if (configured.spriteStyle) mb.spriteStyle = { ...configured.spriteStyle };
        mb.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
        mb.scoreReward = Math.max(0, Number(configured.scoreReward) || 0);
        mb.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
        mb.phaseThresholds = configured.phases.map((phase) => Number(phase.triggerHealthRatio)).filter(Number.isFinite);
        mb.bossWeaponSettings = configured.weapons.map((setting) => ({ ...setting }));
        mb.bossPhaseSettings = configured.phases.map((phase) => ({
          ...phase,
          weaponSettingIds: [...phase.weaponSettingIds]
        }));
        this.applyConfiguredBossPhase(mb);
        mb.sourceEventId = configured.id;
        mb.sourceItemId = configured.bossId;
        if (mb.spriteUrl) loadImage(mb.spriteUrl);
      }
      spawned.push(mb);
      this.entities.push(mb);
    }

    this.miniBossRef = spawned[0] ?? null;
    if (count > 1) {
      this.spawnFloatingText(this.width / 2, Math.max(92, this.height * 0.16), 'TWIN BOTTLENECKS!', '#fef08a', this.mobileProfile ? 18 : 22);
    }
  }

  spawnWallBoss(configured?: RuntimeBossEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const isMobile = this.width < 600;
    const rows = configured
      ? Math.max(1, Math.min(4, Math.floor(Number(configured.count ?? 2)) || 2))
      : 2;
    const cols = Math.min(isMobile ? 8 : 10, 4 + Math.max(1, this.wave));
    const blockW = isMobile ? 42 : 52;
    const blockH = isMobile ? 50 : 60;
    const gap = 4;
    const anchoredPosition = this.getAnchoredTopLeft(
      configured,
      (blockW * cols) + (gap * Math.max(0, cols - 1)),
      (blockH * rows) + (gap * Math.max(0, rows - 1))
    );
    const startX = anchoredPosition?.x ?? (this.width - ((blockW+gap)*cols))/2;
    const startY = anchoredPosition?.y ?? -200;

    const segmentCount = rows * cols;
    for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
            const e = this.createEntity(EntityType.ENEMY_INVADER, startX + c*(blockW+gap), startY + r*(blockH+gap));
            e.width = blockW;
            e.height = blockH;
            e.hp = configured
              ? Math.max(1, Math.ceil(((Number(configured.health) || segmentCount) * difficultyMultiplier) / segmentCount))
              : this.wave === 1 ? 5 : Math.round(5 + (this.wave * 3.1));
            e.maxHp = e.hp;
            e.color = '#fb7185';
            e.text = "🧱"; // UPDATED to Brick Emoji
            e.variant = (r * cols) + c;
            e.vx = 0;
            e.wallLaneX = e.x;
            e.wallRowOffset = r * (blockH + gap);
            e.wallPass = 0;
            e.wallSwayPhase = ((r * cols + c) / Math.max(1, segmentCount)) * Math.PI * 2;
            if (configured) {
              const weapon = configured.weapons?.[0];
              e.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.ENEMY_INVADER);
              e.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
              if (configured.spriteStyle) e.spriteStyle = { ...configured.spriteStyle };
              e.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
              e.projectileDamage = Math.max(0, (Number(weapon?.damage ?? configured.damage) || 1) * difficultyMultiplier);
              e.projectileSpeed = Math.max(0.1, (Number(weapon?.projectileSpeed) || 5.4) * difficultyMultiplier);
              e.attackIntervalFrames = Math.max(1, Math.round(
                ((Number(weapon?.attackIntervalSeconds) || 0.7) * GAME_CONFIG.FPS) / difficultyMultiplier
              ));
              e.weaponKinds = configured.weapons.map((setting) => String(setting.weaponId));
              e.configuredBurstCount = Math.max(1, Math.floor(Number(weapon?.burstCount) || 1));
              e.scoreValue = Math.max(0, Math.round((Number(configured.scoreReward) || 0) / segmentCount));
              e.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
              e.configuredSpeed = Math.max(0.1, (Number(configured.speed) || 1.15) * difficultyMultiplier);
              e.sourceEventId = configured.id;
              e.sourceItemId = configured.bossId;
              if (e.spriteUrl) loadImage(e.spriteUrl);
              e.spriteFrames?.forEach(loadImage);
            } else {
              e.spriteUrl = ASSETS.PAYWALL_BASTION_FRAMES[1];
              e.spriteFrames = [...ASSETS.PAYWALL_BASTION_FRAMES];
            }
            this.entities.push(e);
        }
    }
    this.invaderDirection = 1;
  }

  spawnAsteroidBelt(configured?: RuntimeAsteroidEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const count = configured
      ? Math.max(1, Math.floor(Number(configured.count) || 1))
      : Math.min(24, 12 + (this.wave * 3));
    const lanes = Math.max(4, Math.min(7, Math.floor(this.width / 88)));
    const laneWidth = this.width / lanes;
    const anchor = this.getConfiguredSpawnAnchor(configured);
    const rowCount = Math.max(1, Math.ceil(count / lanes));
    const defaultCenterY = -140 - (((rowCount - 1) * 72) / 2) - 22.5;
    const anchorOffsetX = anchor ? (anchor.x * this.width) - (this.width / 2) : 0;
    const anchorOffsetY = anchor ? (anchor.y * this.height) - defaultCenterY : 0;
    this.asteroidBeltMaxCount = count;

    for (let i = 0; i < count; i++) {
      const lane = i % lanes;
      const jitter = (this.nextGameplayRandom() - 0.5) * laneWidth * 0.5;
      const size = 42 + this.nextGameplayRandom() * 28 + (this.wave * 2);
      const defaultX = Math.max(8, Math.min(this.width - size - 8, (lane * laneWidth) + (laneWidth / 2) - (size / 2) + jitter));
      const defaultY = -140 - (Math.floor(i / lanes) * 72) - (this.nextGameplayRandom() * 45);
      const asteroid = this.createEntity(
        EntityType.ENEMY_BRICK,
        defaultX + anchorOffsetX,
        defaultY + anchorOffsetY
      );

      asteroid.width = size;
      asteroid.height = size;
      asteroid.vy = configured
        ? Math.max(0.1, (Number(configured.speed) || 1.8) * difficultyMultiplier) + (this.nextGameplayRandom() * 0.18)
        : 1.8 + (this.wave * 0.32) + (this.nextGameplayRandom() * 0.45);
      asteroid.vx = (this.nextGameplayRandom() - 0.5) * (0.45 + (this.wave * 0.08));
      asteroid.hp = configured
        ? Math.max(1, (Number(configured.health) || 1) * difficultyMultiplier)
        : Math.round(4 + (this.wave * 1.9));
      asteroid.maxHp = asteroid.hp;
      asteroid.variant = 900 + i;
      asteroid.color = '#f59e0b';
      if (configured) {
        asteroid.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.ENEMY_BRICK);
        asteroid.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
        if (configured.spriteStyle) asteroid.spriteStyle = { ...configured.spriteStyle };
        asteroid.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
        asteroid.scoreValue = Math.max(0, Number(configured.scoreValue) || 0);
        asteroid.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
        asteroid.sourceEventId = configured.id;
        asteroid.sourceItemId = 'asteroid-belt';
        if (asteroid.spriteUrl) loadImage(asteroid.spriteUrl);
        asteroid.spriteFrames?.forEach(loadImage);
      } else {
        asteroid.spriteFrames = [...ASSETS.ASTEROID_BELT_FRAMES];
      }
      this.entities.push(asteroid);
    }

    this.spawnFloatingText(
      this.width / 2,
      this.height * 0.24,
      'ASTEROID BELT',
      '#fbbf24'
    );
  }

  spawnSupplyDrop(configured: RuntimeSupplyDropEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const packageSize = this.mobileProfile ? 58 : 64;
    const anchored = this.getAnchoredTopLeft(configured, packageSize, packageSize);
    const packageEntity = this.createEntity(
      EntityType.SUPPLY_DROP,
      anchored?.x ?? ((this.width - packageSize) / 2),
      anchored?.y ?? -packageSize
    );
    packageEntity.width = packageSize;
    packageEntity.height = packageSize;
    packageEntity.vx = this.gameplayRandomRange(-0.18, 0.18);
    packageEntity.vy = Math.max(0.15, Number(configured.speed) || 1.5) * difficultyMultiplier;
    packageEntity.hp = Math.max(1, Number(configured.health) || 1) * difficultyMultiplier;
    packageEntity.maxHp = packageEntity.hp;
    packageEntity.variant = 1_000 + this.gameplayRandom.integer(0, 899);
    packageEntity.color = configured.presentKind === 'golden' ? '#fde047' : '#22d3ee';
    packageEntity.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.SUPPLY_DROP);
    packageEntity.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
    if (configured.spriteStyle) packageEntity.spriteStyle = { ...configured.spriteStyle };
    packageEntity.contactDamage = 0;
    packageEntity.scoreValue = Math.max(0, Number(configured.scoreValue) || 0);
    packageEntity.powerupDropChance = 0;
    packageEntity.coinDropValue = Math.max(
      1,
      Math.min(MAX_ACTIVE_BOSS_REWARD_COINS, Math.floor(Number(configured.coinDropValue) || 1))
    );
    packageEntity.supplyDropKind = configured.presentKind;
    packageEntity.sourceEventId = configured.id;
    packageEntity.sourceItemId = `supply-drop:${configured.presentKind}`;
    if (packageEntity.spriteUrl) loadImage(packageEntity.spriteUrl);
    packageEntity.spriteFrames?.forEach(loadImage);
    this.entities.push(packageEntity);
    this.presentDropWaveActive = true;
    this.presentDropStageActive = true;

    if (!this.presentDropCueShown) {
      this.presentDropCueShown = true;
      this.spawnFloatingText(this.width / 2, this.height * 0.24, 'SUPPLY DROP', '#67e8f9');
    }
  }

  updateWallBoss() {
      const invaders = this.entities.filter(e => e.type === EntityType.ENEMY_INVADER && !e.markedForDeletion);
      if (invaders.length === 0) return;

      const configuredVerticalSpeed = invaders.find((invader) => Number.isFinite(invader.configuredSpeed))?.configuredSpeed;
      const descentSpeed = configuredVerticalSpeed ?? (this.wave === 1 ? 1.15 : 1.5 + (this.wave - 1));
      const swayAmplitude = Math.min(10, Math.max(4, this.width * 0.012));

      invaders.forEach(inv => {
          const laneX = inv.wallLaneX ?? inv.x;
          const phase = inv.wallSwayPhase ?? inv.variant * 0.37;
          inv.x = clamp(
            laneX + Math.sin((this.frameCount * 0.018) + phase) * swayAmplitude,
            8,
            this.width - inv.width - 8
          );
          inv.y += descentSpeed;
          if (inv.y > this.height + inv.height + 12) {
            inv.wallPass = (inv.wallPass ?? 0) + 1;
            inv.y = -inv.height - (inv.wallRowOffset ?? 0) - ((inv.wallPass % 2) * 18);
          }
          if (inv.attackTimer > 0) inv.attackTimer--;
      });

      const configuredAttackInterval = invaders.find((invader) => Number.isFinite(invader.attackIntervalFrames))?.attackIntervalFrames;
      const shootRate = configuredAttackInterval ?? (this.wave === 1 ? 42 : Math.max(8, 20 - this.wave));
      if (this.frameCount % shootRate === 0) {
          const shooter = invaders[this.gameplayRandom.integer(0, invaders.length)];
          const b = this.createEntity(EntityType.PROJECTILE, shooter.x + shooter.width/2, shooter.y + shooter.height);
          b.vx = 0;
          b.vy = shooter.projectileSpeed ?? (this.wave === 1 ? 5.4 : 7 + (this.wave * 0.5));
          b.width = this.wave === 1 ? 12 : 14;
          b.height = this.wave === 1 ? 12 : 14;
          b.color = '#ff4444';
          b.damage = Math.max(1, Number(shooter.projectileDamage) || 1);
          shooter.attackTimer = 12;
          // Solid projectile
          this.entities.push(b);
          this.playSound('boss_shoot', 0.72, { pitchJitter: 0.12, pitchOffset: 0.06 });
      }
  }

  private getMiniBossLabAttackDurationFrames(
    attack: MiniBossEncounterDefinition['signature']
  ) {
    return Math.max(1, Math.round((
      attack.telegraphSeconds
      + attack.activeSeconds
      + attack.recoverySeconds
    ) * GAME_CONFIG.FPS));
  }

  private resolveMiniBossLabSampleFrame(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition
  ) {
    const entranceFrames = Math.max(1, Math.round(definition.entranceSeconds * GAME_CONFIG.FPS));
    const signatureFrames = this.getMiniBossLabAttackDurationFrames(definition.signature);
    const supportFrames = this.getMiniBossLabAttackDurationFrames(definition.support);
    if (state.supportStartFrame !== null) {
      const supportAge = Math.max(0, this.frameCount - state.supportStartFrame);
      if (supportAge < supportFrames) return entranceFrames + signatureFrames + supportAge;
      state.supportStartFrame = null;
      state.startFrame = this.frameCount - entranceFrames;
      state.emittedHazardIds.clear();
    }
    const naturalFrame = Math.max(0, this.frameCount - state.startFrame);
    if (!state.signatureLoop || naturalFrame < entranceFrames) return naturalFrame;
    return entranceFrames + ((naturalFrame - entranceFrames) % signatureFrames);
  }

  private flushMiniBossLabPendingProjectiles(state: MiniBossLabEngineState) {
    for (let index = state.pendingProjectiles.length - 1; index >= 0; index -= 1) {
      const pending = state.pendingProjectiles[index];
      if (pending.fireFrame > this.frameCount) continue;
      state.pendingProjectiles.splice(index, 1);
      const owner = this.entities.find((entity) => (
        entity.id === pending.ownerEntityId && !entity.markedForDeletion && entity.hp > 0
      ));
      if (!owner) continue;
      const projectile = this.createEntity(
        EntityType.PROJECTILE,
        pending.originX - pending.size / 2,
        pending.originY - pending.size / 2
      );
      projectile.width = pending.size;
      projectile.height = pending.size;
      projectile.vx = Math.cos(pending.angleRadians) * pending.speed;
      projectile.vy = Math.sin(pending.angleRadians) * pending.speed;
      projectile.damage = pending.damage;
      projectile.color = pending.color;
      projectile.bossOwnerId = pending.ownerEntityId;
      projectile.sourceEventId = pending.eventId;
      projectile.sourceItemId = state.encounterId;
      projectile.projectileVisualKind = 'boss-ray';
      projectile.spriteFrames = [...pending.frames];
      projectile.spriteFrameHoldFrames = 4;
      projectile.spriteFrameFixedRotationRadians = pending.angleRadians + Math.PI / 2;
      projectile.weaponVisualStartFrame = this.frameCount;
      projectile.variant = pending.variant;
      pending.frames.forEach(loadImage);
      this.entities.push(projectile);
    }
  }

  private getMiniBossLabHazardColor(command: MiniBossHazardCommand) {
    const assetId = command.projectileAssetId ?? '';
    if (assetId.includes('fracture') || assetId.includes('prism')) return '#c084fc';
    if (assetId.includes('aegis') || assetId.includes('convoy')) return '#facc15';
    if (assetId.includes('maw')) return '#86efac';
    if (assetId.includes('rail')) return '#fb7185';
    return '#67e8f9';
  }

  private spawnMiniBossLabBeam(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition,
    command: MiniBossHazardCommand,
    owner: Entity
  ) {
    const continuouslyUpdated = command.kind === 'rail-sweep' || command.kind === 'grid-boundary';
    const beamSlotId = `${state.encounterId}:beam:${command.attackId}:${command.kind}:${command.sourceMemberId ?? owner.id}:${command.warning ? 'warning' : 'live'}`;
    const existingBeam = continuouslyUpdated
      ? this.entities.find((entity) => (
          !entity.markedForDeletion
          && entity.sourceEventId === state.eventId
          && entity.sourceItemId === beamSlotId
          && entity.isBeam
        ))
      : undefined;
    const activeBeamCount = this.entities.reduce((count, entity) => count + Number(
      !entity.markedForDeletion
      && entity.sourceEventId === state.eventId
      && entity.isBeam
      && !entity.isTelegraph
    ), 0);
    if (!command.warning && !existingBeam && activeBeamCount >= definition.budgets.maximumBeams) return;
    const dx = command.target.x - command.origin.x;
    const dy = command.target.y - command.origin.y;
    const length = Math.max(24, Math.hypot(dx, dy));
    const thickness = command.warning ? 5 : command.kind === 'grid-boundary' ? 12 : 15;
    const beam = existingBeam ?? this.createEntity(EntityType.PROJECTILE, 0, 0);
    beam.x = (command.origin.x + command.target.x) / 2 - thickness / 2;
    beam.y = (command.origin.y + command.target.y) / 2 - length / 2;
    beam.width = thickness;
    beam.height = length;
    beam.isBeam = true;
    beam.isDetachedBeam = true;
    beam.isTelegraph = command.warning;
    beam.beamAngleRadians = Math.atan2(dy, dx) - Math.PI / 2;
    beam.color = this.getMiniBossLabHazardColor(command);
    beam.damage = command.warning ? 0 : Math.max(1, Number(owner.projectileDamage) || 1);
    const attack = command.attackId === definition.signature.id
      ? definition.signature
      : definition.support;
    const liveBeamFrames = command.kind === 'rail-sweep' || command.kind === 'grid-boundary'
      ? attack.emissionIntervalFrames + 3
      : Math.round(attack.activeSeconds * GAME_CONFIG.FPS);
    beam.life = continuouslyUpdated
      ? 2
      : Math.max(
          6,
          command.warning
            ? Math.round(attack.telegraphSeconds * GAME_CONFIG.FPS)
            : liveBeamFrames
        );
    beam.maxLife = beam.life;
    beam.bossOwnerId = owner.id;
    beam.sourceEventId = state.eventId;
    beam.sourceItemId = continuouslyUpdated ? beamSlotId : `${state.encounterId}:${command.id}`;
    beam.projectileVisualKind = 'boss-ray';
    if (!existingBeam) this.entities.push(beam);
  }

  private queueMiniBossLabProjectilePattern(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition,
    command: MiniBossHazardCommand,
    owner: Entity
  ) {
    const activeProjectileCount = state.pendingProjectiles.length + this.entities.reduce(
      (count, entity) => count + Number(
        !entity.markedForDeletion
        && entity.sourceEventId === state.eventId
        && entity.type === EntityType.PROJECTILE
        && !entity.isPlayerShot
        && !entity.isBeam
      ),
      0
    );
    const allowedCount = Math.max(
      0,
      Math.min(
        command.projectileCount,
        definition.budgets.maximumProjectiles - activeProjectileCount
      )
    );
    if (allowedCount <= 0) return;
    const binding = command.projectileAssetId
      ? definition.assets.find((candidate) => candidate.id === command.projectileAssetId)
      : undefined;
    const frames = binding?.frames ?? [];
    const color = this.getMiniBossLabHazardColor(command);
    const targetAngle = command.angleRadians
      ?? Math.atan2(command.target.y - command.origin.y, command.target.x - command.origin.x);
    const radial = command.kind === 'ring-with-gap';
    const gapArc = clamp(command.gapArcRadians ?? Math.PI * 0.38, 0.2, Math.PI * 1.5);
    const availableArc = Math.PI * 2 - gapArc;
    const radialStart = (command.gapCenterRadians ?? -Math.PI / 2) + gapArc / 2;
    const choreographyKind = definition.choreography.kind;
    const spread = command.kind === 'diagonal-crossfire'
      ? 0.28
      : choreographyKind === 'mirror-exchange' || choreographyKind === 'convoy-command'
        // Four readable needles still sell the twin crossfire / convoy
        // broadside. Their slightly wider fan commits the outside needles to
        // the arena gutters and leaves a stable lane between inner needles.
        ? 0.50
        : 0.42;
    const staggerFrames = command.kind === 'diagonal-crossfire' ? 4 : radial ? 0 : 2;
    const speed = command.kind === 'ring-with-gap' ? 3.35 : command.kind === 'diagonal-crossfire' ? 4.7 : 4.15;
    for (let index = 0; index < allowedCount; index += 1) {
      const normalized = allowedCount <= 1 ? 0.5 : index / (allowedCount - 1);
      const angle = radial
        ? radialStart + availableArc * ((index + 0.5) / allowedCount)
        : targetAngle + (normalized - 0.5) * spread;
      state.pendingProjectiles.push({
        fireFrame: this.frameCount + index * staggerFrames,
        ownerEntityId: owner.id,
        eventId: state.eventId,
        originX: command.origin.x,
        originY: command.origin.y,
        angleRadians: angle,
        speed,
        size: radial ? 18 : 19,
        damage: Math.max(1, Number(owner.projectileDamage) || 1),
        color,
        frames,
        variant: command.emissionIndex * 17 + index
      });
    }
  }

  private dispatchMiniBossLabHazard(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition,
    command: MiniBossHazardCommand
  ) {
    if (!command.emitNow) return;
    const continuouslyUpdatedBeam = command.kind === 'rail-sweep' || command.kind === 'grid-boundary';
    const commandKey = `${command.id}:${command.warning ? 'warning' : 'live'}`;
    const firstEmission = !state.emittedHazardIds.has(commandKey);
    if (!firstEmission && !continuouslyUpdatedBeam) return;
    if (firstEmission) state.emittedHazardIds.add(commandKey);
    const owner = command.sourceMemberId
      ? this.getMiniBossLabMemberEntity(state, command.sourceMemberId)
      : undefined;
    if (!owner || owner.markedForDeletion || owner.hp <= 0) return;
    if (command.warning) {
      const attack = command.attackId === definition.signature.id
        ? definition.signature
        : definition.support;
      const telegraphAsset = attack.telegraphAssetId
        ? definition.assets.find((asset) => asset.id === attack.telegraphAssetId)
        : undefined;
      const railWarningSlotId = `${state.encounterId}:rail-warning-brace:${command.sourceMemberId ?? owner.id}`;
      const existingRailWarning = command.kind === 'rail-sweep'
        ? this.entities.find((entity) => (
            !entity.markedForDeletion
            && entity.sourceEventId === state.eventId
            && entity.sourceItemId === railWarningSlotId
          )) as VisualEffect | undefined
        : undefined;
      if (
        (firstEmission || existingRailWarning)
        && (existingRailWarning || this.liveEffectCount < this.getEffectCap())
      ) {
        const warningLife = command.kind === 'rail-sweep'
          ? 2
          : Math.max(18, Math.round(attack.telegraphSeconds * GAME_CONFIG.FPS));
        const warningSize = command.kind === 'rail-sweep'
          ? Math.max(46, Math.max(owner.width, owner.height) * 0.82)
          : Math.max(64, Math.max(owner.width, owner.height) * 1.18);
        const warningCenterX = owner.x + owner.width / 2;
        const warningCenterY = owner.y + owner.height / 2;
        const warning = existingRailWarning ?? new VisualEffect(
          warningCenterX - warningSize / 2,
          warningCenterY - warningSize / 2,
          telegraphAsset?.url ? 'sprite' : 'ring',
          '',
          this.getMiniBossLabHazardColor(command)
        );
        warning.x = warningCenterX - warningSize / 2;
        warning.y = warningCenterY - warningSize / 2;
        warning.width = warningSize;
        warning.height = warningSize;
        warning.isTelegraph = true;
        if (telegraphAsset?.url) {
          warning.spriteFrames = [telegraphAsset.url];
          loadImage(telegraphAsset.url);
        }
        warning.life = warningLife;
        warning.maxLife = warning.life;
        warning.bossOwnerId = owner.id;
        warning.sourceEventId = state.eventId;
        if (command.kind === 'rail-sweep') warning.sourceItemId = railWarningSlotId;
        if (!existingRailWarning) {
          this.entities.push(warning);
          this.liveEffectCount++;
        }
      }
      if (command.kind === 'beam' || command.kind === 'grid-boundary') {
        this.spawnMiniBossLabBeam(state, definition, command, owner);
      }
      owner.isCharging = true;
      return;
    }
    if (command.kind === 'beam' || command.kind === 'rail-sweep' || command.kind === 'grid-boundary') {
      this.spawnMiniBossLabBeam(state, definition, command, owner);
    } else {
      this.queueMiniBossLabProjectilePattern(state, definition, command, owner);
    }
    this.playSound('boss_shoot', 0.72, { pitchJitter: 0.08, pitchOffset: 0.04 });
  }

  private updateMiniBossLabReinforcement(entity: Entity) {
    const age = Math.max(0, this.frameCount - entity.miniBossLabReinforcementSpawnFrame);
    if (age < MINI_BOSS_LAB_REINFORCEMENT_DEPLOY_FRAMES) {
      const progress = age / Math.max(1, MINI_BOSS_LAB_REINFORCEMENT_DEPLOY_FRAMES);
      entity.miniBossLabReinforcementStage = 'deploy';
      entity.contactDamage = 0;
      entity.vx = entity.miniBossLabReinforcementTargetVx * (0.18 + progress * 0.22);
      entity.vy = Math.max(0.35, entity.miniBossLabReinforcementTargetVy * (0.12 + progress * 0.18));
      entity.spriteStyle = {
        ...(entity.spriteStyle ?? {}),
        opacity: 0.46 + progress * 0.34
      };
      return;
    }
    const activationAge = age - MINI_BOSS_LAB_REINFORCEMENT_DEPLOY_FRAMES;
    if (activationAge < MINI_BOSS_LAB_REINFORCEMENT_ACTIVATION_FRAMES) {
      entity.miniBossLabReinforcementStage = 'activation';
      entity.contactDamage = 0;
      entity.vx = 0;
      entity.vy = 0;
      entity.spriteStyle = {
        ...(entity.spriteStyle ?? {}),
        opacity: 0.82 + Math.sin(activationAge * Math.PI / 3) * 0.12
      };
      return;
    }
    entity.miniBossLabReinforcementStage = 'active';
    entity.contactDamage = Math.max(1, entity.miniBossLabReinforcementContactDamage);
    entity.vx = entity.miniBossLabReinforcementTargetVx;
    entity.vy = entity.miniBossLabReinforcementTargetVy;
    entity.spriteStyle = {
      ...(entity.spriteStyle ?? {}),
      opacity: 1
    };
  }

  private spawnMiniBossLabReinforcements(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition,
    count: number,
    assetId: string,
    target: Readonly<{ x: number; y: number }>,
    speedPixelsPerSecond: number
  ) {
    const remaining = Math.max(
      0,
      definition.budgets.maximumReinforcements - state.reinforcementsSpawned
    );
    const spawnCount = Math.min(Math.max(0, Math.floor(count)), remaining);
    if (spawnCount <= 0) return;
    const owner = this.entities.find((entity) => (
      entity.sourceEventId === state.eventId
      && entity.type === EntityType.MINI_BOSS
      && !entity.markedForDeletion
      && entity.hp > 0
      && entity.miniBossLabRole === 'primary'
    ));
    if (!owner) return;
    const binding = definition.assets.find((candidate) => candidate.id === assetId);
    for (let index = 0; index < spawnCount; index += 1) {
      const sourceX = owner.x + owner.width / 2 + (index - (spawnCount - 1) / 2) * 18;
      const sourceY = owner.y + owner.height * 0.72;
      const dx = target.x + (index - (spawnCount - 1) / 2) * 26 - sourceX;
      const dy = target.y - sourceY;
      const length = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.max(1.4, speedPixelsPerSecond / GAME_CONFIG.FPS);
      const reinforcement = this.createEntity(EntityType.ENEMY_DRONE, sourceX - 17, sourceY - 17);
      reinforcement.width = 34;
      reinforcement.height = 34;
      reinforcement.vx = 0;
      reinforcement.vy = 0;
      reinforcement.hp = 28;
      reinforcement.maxHp = 28;
      reinforcement.contactDamage = 0;
      reinforcement.color = '#86efac';
      reinforcement.spriteUrl = binding?.url;
      if (binding?.frames?.length) reinforcement.spriteFrames = [...binding.frames];
      reinforcement.bossOwnerId = owner.id;
      reinforcement.sourceEventId = state.eventId;
      reinforcement.sourceItemId = `${state.encounterId}:reinforcement`;
      reinforcement.scoreValue = 0;
      reinforcement.powerupDropChance = 0;
      reinforcement.miniBossLabReinforcementStage = 'deploy';
      reinforcement.miniBossLabReinforcementSpawnFrame = this.frameCount;
      reinforcement.miniBossLabReinforcementTargetVx = dx / length * speed;
      reinforcement.miniBossLabReinforcementTargetVy = dy / length * speed;
      reinforcement.miniBossLabReinforcementContactDamage = 1;
      reinforcement.spriteStyle = {
        ...(reinforcement.spriteStyle ?? {}),
        opacity: 0.46
      };
      if (reinforcement.spriteUrl) loadImage(reinforcement.spriteUrl);
      reinforcement.spriteFrames?.forEach(loadImage);
      this.entities.push(reinforcement);
    }
    state.reinforcementsSpawned += spawnCount;
  }

  private getMiniBossLabVisualState(
    sample: MiniBossMemberFrameState,
    stage: MiniBossEncounterStage,
    attackBeat: 'none' | 'warning' | 'action' | 'recovery'
  ): Entity['miniBossLabVisualState'] {
    if (!sample.alive || sample.animationState === 'death') return 'death';
    if (sample.animationState === 'hit') return 'hit';
    if (sample.animationState === 'damage' || sample.animationState === 'critical') return 'low-health';
    if (sample.animationState === 'entrance') return 'entrance';
    if (attackBeat === 'warning') return 'charge';
    if (attackBeat === 'action') return stage === 'support' ? 'support' : 'signature';
    return 'idle';
  }

  private cleanupMiniBossLabOwnedArtifacts(
    state: MiniBossLabEngineState,
    preserveMembers = true
  ) {
    const memberEntityIds = new Set(state.memberEntityIds.values());
    for (const entity of this.entities) {
      if (entity.sourceEventId !== state.eventId) continue;
      if (preserveMembers && memberEntityIds.has(entity.id)) continue;
      entity.markedForDeletion = true;
    }
    state.pendingProjectiles.length = 0;
    this.pendingEnemyLasers = this.pendingEnemyLasers.filter((laser) => (
      !memberEntityIds.has(laser.sourceId)
    ));
  }

  private spawnMiniBossLabDeathSprite(
    definition: MiniBossEncounterDefinition,
    entity: Entity
  ) {
    const frames = definition.assets.find((asset) => asset.usage === 'death-vfx')?.frames;
    if (!frames?.length || this.liveEffectCount >= this.getEffectCap()) return;
    const size = Math.max(70, Math.max(entity.width, entity.height) * 1.35);
    const effect = new VisualEffect(
      entity.x + entity.width / 2 - size / 2,
      entity.y + entity.height / 2 - size / 2,
      'sprite',
      '',
      '#ffffff'
    );
    effect.width = size;
    effect.height = size;
    effect.spriteFrames = [...frames];
    effect.life = frames.length * 6;
    effect.maxLife = effect.life;
    effect.sourceEventId = entity.sourceEventId;
    frames.forEach(loadImage);
    this.entities.push(effect);
    this.liveEffectCount++;
  }

  private spawnMiniBossLabDamageSpark(
    definition: MiniBossEncounterDefinition,
    entity: Entity
  ) {
    if (
      entity.hp <= 0
      || entity.hp / Math.max(1, entity.maxHp) > 0.35
      || (this.frameCount + entity.variant) % 72 !== 0
      || this.liveEffectCount >= this.getEffectCap()
    ) return;
    const frames = definition.assets.find((asset) => asset.usage === 'death-vfx')?.frames;
    if (!frames?.length) return;
    const sequence = Math.floor((this.frameCount + entity.variant) / 72);
    const socketRatio = 0.2 + ((sequence + entity.variant) % 4) * 0.2;
    const size = clamp(Math.min(entity.width, entity.height) * 0.28, 16, 28);
    const spark = new VisualEffect(
      entity.x + entity.width * socketRatio - size / 2,
      entity.y + entity.height * (0.38 + ((sequence % 2) * 0.24)) - size / 2,
      'sprite',
      '',
      '#ffffff'
    );
    spark.width = size;
    spark.height = size;
    spark.spriteFrames = [...frames.slice(0, Math.min(3, frames.length))];
    spark.life = spark.spriteFrames.length * 5;
    spark.maxLife = spark.life;
    spark.bossOwnerId = entity.id;
    spark.sourceEventId = entity.sourceEventId;
    spark.spriteFrames.forEach(loadImage);
    this.entities.push(spark);
    this.liveEffectCount++;
  }

  private beginMiniBossLabMemberDeath(entity: Entity) {
    const eventId = entity.sourceEventId;
    const memberId = entity.miniBossLabMemberId;
    if (!eventId || !memberId || entity.miniBossLabDeathStartedFrame >= 0) return false;
    const state = this.miniBossLabEncounters.get(eventId);
    const definition = state ? this.getMiniBossLabDefinition(state) : undefined;
    if (!state || !definition) return false;
    entity.hp = 0;
    entity.vx = 0;
    entity.vy = 0;
    entity.miniBossLabDamageable = false;
    entity.miniBossLabVisualState = 'death';
    entity.miniBossLabDeathStartedFrame = this.frameCount;
    entity.isCharging = false;
    state.destroyedMemberIds.add(memberId);
    state.hitUntilFrameByMemberId.delete(memberId);
    state.pendingProjectiles.splice(0, state.pendingProjectiles.length, ...state.pendingProjectiles.filter(
      (pending) => pending.ownerEntityId !== entity.id
    ));
    for (const owned of this.entities) {
      if (owned.bossOwnerId === entity.id) owned.markedForDeletion = true;
    }
    const choreography = definition.choreography;
    if (choreography.kind === 'paired-crossfire') {
      const instances = createMiniBossMemberInstances(definition);
      const cores = instances.filter((instance) => (
        instance.archetypeId === choreography.coreArchetypeId
      ));
      const satellites = instances.filter((instance) => (
        instance.archetypeId === choreography.satelliteArchetypeId
      ));
      const ownerCoreIndex = cores.findIndex((instance) => instance.id === memberId);
      if (ownerCoreIndex >= 0) {
        for (let index = 0; index < satellites.length; index += 1) {
          if (index % Math.max(1, cores.length) !== ownerCoreIndex) continue;
          const satellite = this.getMiniBossLabMemberEntity(state, satellites[index].id);
          if (
            satellite
            && !satellite.markedForDeletion
            && satellite.miniBossLabDeathStartedFrame < 0
          ) {
            this.beginMiniBossLabMemberDeath(satellite);
          }
        }
      }
    }
    const centerX = entity.x + entity.width / 2;
    const centerY = entity.y + entity.height / 2;
    this.spawnBurst(centerX, centerY, entity.color, 8, 3.8, 3.5);
    this.spawnRingEffect(centerX, centerY, entity.color);
    this.addHitStop(3);
    this.addShake(1.6);
    if (definition.choreography.kind === 'convoy-command' && entity.miniBossLabRole === 'primary') {
      for (const escort of this.entities) {
        if (
          escort.sourceEventId === eventId
          && escort.miniBossLabRole === 'escort'
          && escort.hp > 0
          && !escort.markedForDeletion
        ) {
          escort.miniBossLabVisualState = 'support';
          escort.miniBossLabShielded = false;
        }
      }
    }
    return true;
  }

  private getMiniBossLabMirroredMemberIds(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition,
    members: readonly MiniBossMemberFrameState[]
  ) {
    const mirrored = new Set<string>();
    if (!state.wallSide) return mirrored;
    const choreography = definition.choreography;
    if (choreography.kind === 'edge-rail') {
      const wall = members.find((member) => (
        member.archetypeId === choreography.wallArchetypeId
      ));
      if (wall) {
        const sampledSide = wall.x < this.width / 2 ? 'left' : 'right';
        if (sampledSide !== state.wallSide) mirrored.add(wall.id);
      }
    } else if (choreography.kind === 'quadrant-grid' && state.wallSide === 'right') {
      const horizontalSentry = members.find((member) => member.role === 'sentry-west');
      if (horizontalSentry) mirrored.add(horizontalSentry.id);
    }
    return mirrored;
  }

  private mirrorMiniBossLabHazardX(command: MiniBossHazardCommand): MiniBossHazardCommand {
    const origin = { x: this.width - command.origin.x, y: command.origin.y };
    const target = { x: this.width - command.target.x, y: command.target.y };
    return {
      ...command,
      origin,
      target,
      angleRadians: Math.atan2(target.y - origin.y, target.x - origin.x),
      gapCenterRadians: command.gapCenterRadians === undefined
        ? undefined
        : Math.PI - command.gapCenterRadians
    };
  }

  private awardMiniBossLabVictory(state: MiniBossLabEngineState) {
    if (state.victoryRewarded) return;
    state.victoryRewarded = true;

    const encounterEntities = Array.from(state.memberEntityIds.values())
      .map((entityId) => this.entities.find((entity) => entity.id === entityId))
      .filter((entity): entity is Entity => Boolean(entity));
    const anchor = encounterEntities.find((entity) => entity.miniBossLabShowHealthBar)
      ?? encounterEntities[0];

    if (!this.creditedMiniBossEncounterIds.has(state.eventId)) {
      this.creditedMiniBossEncounterIds.add(state.eventId);
      this.waveVictoryKillCounts.miniBossKills++;
    }
    this.stats.enemiesDefeated++;
    this.waveEnemyTimeToKillFrames += Math.max(1, this.frameCount - state.startFrame);
    this.waveEnemyKillsMeasured++;

    const configuredScoreMultiplier = Number(this.getCurrentWaveDefinition()?.scoreMultiplier);
    const waveMultiplier = Number.isFinite(configuredScoreMultiplier) && configuredScoreMultiplier > 0
      ? configuredScoreMultiplier
      : Math.pow(2, this.stats.wave - 1);
    const reward = state.rewardScore > 0 ? state.rewardScore : 500 * waveMultiplier;
    this.stats.score += reward;

    if (anchor) {
      const centerX = anchor.x + anchor.width / 2;
      const centerY = anchor.y + anchor.height / 2;
      this.spawnFloatingText(centerX, centerY - 42, `+${reward}`, '#fef08a', 22);
      this.spawnBossCoinBurst(anchor);
      this.spawnBurst(centerX, centerY, '#facc15', 16, 5.8, 5);

      if (state.powerupDropChance > 0 && this.gameplayRandom.chance(state.powerupDropChance)) {
        this.spawnPowerup(anchor.x, anchor.y);
      }
      if (this.lives < GAME_CONFIG.MAX_LIVES && this.gameplayRandom.chance(ELITE_EXTRA_LIFE_DROP_CHANCE)) {
        this.spawnPowerup(centerX - 18, centerY - 18, 'extra-life');
      }
      if (!this.isBombResolving && this.gameplayRandom.chance(MINI_BOSS_BOMB_REWARD_CHANCE)) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
    }

    this.addHitStop(8);
    this.addShake(4.2);
  }

  private updateMiniBossLabEncounter(
    state: MiniBossLabEngineState,
    definition: MiniBossEncounterDefinition
  ) {
    if (state.lastUpdateFrame === this.frameCount) return;
    state.lastUpdateFrame = this.frameCount;
    this.flushMiniBossLabPendingProjectiles(state);
    const instances = createMiniBossMemberInstances(definition);
    const members = instances.map((instance) => {
      const entity = this.getMiniBossLabMemberEntity(state, instance.id);
      const alive = Boolean(
        entity
        && !entity.markedForDeletion
        && entity.hp > 0
        && entity.miniBossLabDeathStartedFrame < 0
      );
      return {
        id: instance.id,
        health: alive ? Math.max(0, entity?.hp ?? 0) : 0,
        alive
      };
    });
    const allDamageableDefeated = instances
      .filter((instance) => instance.damageable)
      .every((instance) => !members.find((member) => member.id === instance.id)?.alive);
    if (allDamageableDefeated) {
      if (state.defeatStartFrame === null) {
        state.defeatStartFrame = this.frameCount;
        this.awardMiniBossLabVictory(state);
      }
    } else {
      state.defeatStartFrame = null;
    }
    const sampleFrame = this.resolveMiniBossLabSampleFrame(state, definition);
    if (sampleFrame < state.lastSampleFrame) state.emittedHazardIds.clear();
    state.lastSampleFrame = sampleFrame;
    const hitMemberIds = Array.from(state.hitUntilFrameByMemberId.entries())
      .filter(([, untilFrame]) => untilFrame >= this.frameCount)
      .map(([memberId]) => memberId);
    const sample = sampleMiniBossEncounter(definition, {
      frame: sampleFrame,
      fps: GAME_CONFIG.FPS,
      viewportWidth: this.width,
      viewportHeight: this.height,
      seed: this.gameplayRandomSeed,
      members,
      hitMemberIds,
      reinforcementsSpawned: state.reinforcementsSpawned,
      defeatElapsedFrames: state.defeatStartFrame === null
        ? 0
        : this.frameCount - state.defeatStartFrame
    });
    state.activeStage = sample.stage;
    const mirroredMemberIds = this.getMiniBossLabMirroredMemberIds(
      state,
      definition,
      sample.members
    );
    const sampledMembers = sample.members.map((member) => (
      mirroredMemberIds.has(member.id)
        ? { ...member, x: this.width - member.x }
        : member
    ));
    const sampledHazards = sample.hazards.map((command) => (
      command.sourceMemberId && mirroredMemberIds.has(command.sourceMemberId)
        ? this.mirrorMiniBossLabHazardX(command)
        : command
    ));
    const sampledById = new Map(sampledMembers.map((member) => [member.id, member]));
    const convoyCaptainArchetypeId = definition.choreography.kind === 'convoy-command'
      ? definition.choreography.captainArchetypeId
      : null;
    const convoyCaptainAlive = convoyCaptainArchetypeId === null
      || instances.some((instance) => (
        instance.archetypeId === convoyCaptainArchetypeId
        && members.find((member) => member.id === instance.id)?.alive
      ));
    for (const instance of instances) {
      const entity = this.getMiniBossLabMemberEntity(state, instance.id);
      const sampled = sampledById.get(instance.id);
      if (!entity || !sampled || entity.markedForDeletion) continue;
      const deathAge = entity.miniBossLabDeathStartedFrame < 0
        ? -1
        : this.frameCount - entity.miniBossLabDeathStartedFrame;
      if (deathAge >= 0) {
        entity.miniBossLabPresentationScale = Math.max(0.2, 1 - deathAge / 54);
        entity.spriteStyle = {
          ...(entity.spriteStyle ?? {}),
          opacity: Math.max(0, 1 - deathAge / 42)
        };
        entity.bossPresentationBankRadians += 0.07;
        if (deathAge >= 42) {
          this.spawnMiniBossLabDeathSprite(definition, entity);
          this.spawnExplosion(entity.x, entity.y, entity.color, 1.1);
          entity.markedForDeletion = true;
        }
        continue;
      }
      const centerX = sampled.x;
      if (definition.choreography.kind === 'edge-rail') {
        const resolvedWallSide = state.wallSide ?? (centerX < this.width / 2 ? 'left' : 'right');
        entity.miniBossLabWallSide = resolvedWallSide;
        const sideBinding = definition.assets.find((asset) => (
          asset.id === (resolvedWallSide === 'left' ? 'railspine-body-left' : 'railspine-body-right')
        ));
        if (sideBinding?.url) entity.spriteUrl = sideBinding.url;
      } else if (definition.choreography.kind === 'quadrant-grid') {
        const isHorizontalSentry = sampled.role === 'sentry-west';
        const horizontalWallSide = state.wallSide ?? 'left';
        if (isHorizontalSentry && horizontalWallSide === 'right') {
          entity.miniBossLabWallSide = 'right';
          const mirror = definition.assets.find((asset) => asset.id === 'gridline-sentry-mirror');
          if (mirror?.url) entity.spriteUrl = mirror.url;
        } else if (isHorizontalSentry) {
          entity.miniBossLabWallSide = 'left';
          const base = definition.assets.find((asset) => asset.id === 'gridline-sentry-body');
          if (base?.url) entity.spriteUrl = base.url;
        } else {
          entity.miniBossLabWallSide = undefined;
        }
      } else {
        entity.miniBossLabWallSide = undefined;
      }
      const nextX = clamp(centerX - entity.width / 2, 0, Math.max(0, this.width - entity.width));
      const nextY = clamp(sampled.y - entity.height / 2, -entity.height, Math.max(0, this.height - entity.height));
      entity.vx = nextX - entity.x;
      entity.vy = nextY - entity.y;
      entity.x = nextX;
      entity.y = nextY;
      entity.bossPresentationBankRadians = sampled.rotationRadians;
      entity.miniBossLabPresentationScale = sampled.scale;
      entity.miniBossLabSequence = sample.frame;
      const activeSpriteUrl = resolveMiniBossMemberAssetUrl(definition, sampled, sample.frame);
      if (activeSpriteUrl && activeSpriteUrl !== entity.spriteUrl) {
        entity.spriteUrl = activeSpriteUrl;
        loadImage(activeSpriteUrl);
      }
      const guardedBySample = !sampled.damageable;
      const forcedGuard = state.shieldOverride === true
        && (sampled.role === 'primary' || sampled.role === 'leader');
      const forcedExpose = state.shieldOverride === false;
      entity.miniBossLabShielded = forcedExpose ? false : guardedBySample || forcedGuard;
      entity.miniBossLabDamageable = instance.damageable && !entity.miniBossLabShielded;
      entity.isCharging = sample.attackBeat === 'warning';
      entity.miniBossLabVisualState = this.getMiniBossLabVisualState(
        sampled,
        sample.stage,
        sample.attackBeat
      );
      this.spawnMiniBossLabDamageSpark(definition, entity);
      if (!convoyCaptainAlive && sampled.role === 'escort') {
        entity.miniBossLabVisualState = 'support';
        entity.miniBossLabShielded = false;
        entity.miniBossLabDamageable = true;
      }
    }
    for (const command of sampledHazards) {
      this.dispatchMiniBossLabHazard(state, definition, command);
    }
    for (const reinforcement of sample.reinforcements) {
      const reinforcementKey = `reinforcement:${reinforcement.id}`;
      if (state.emittedHazardIds.has(reinforcementKey)) continue;
      state.emittedHazardIds.add(reinforcementKey);
      this.spawnMiniBossLabReinforcements(
        state,
        definition,
        reinforcement.count,
        reinforcement.assetId,
        reinforcement.target,
        reinforcement.speedPixelsPerSecond
      );
    }
    if (sample.cleanup.requested && !state.completionTriggered) {
      state.completionTriggered = true;
      state.completionFrame = this.frameCount;
      this.cleanupMiniBossLabOwnedArtifacts(state, false);
      this.miniBossRef = null;
      this.waveProgressFrames += 120;
    } else {
      this.miniBossRef = this.entities.find((entity) => (
        entity.sourceEventId === state.eventId
        && entity.type === EntityType.MINI_BOSS
        && !entity.markedForDeletion
        && entity.hp > 0
        && entity.miniBossLabShowHealthBar
      )) ?? this.entities.find((entity) => (
        entity.sourceEventId === state.eventId
        && entity.type === EntityType.MINI_BOSS
        && !entity.markedForDeletion
        && entity.hp > 0
      )) ?? null;
    }
  }

  private updateMiniBossLabEncounters() {
    for (const [eventId, state] of this.miniBossLabEncounters) {
      if (state.completionTriggered) {
        // Keep one final cleanup-frame snapshot, then retire the bounded state
        // on the following fixed step so repeated preview spawns cannot leak.
        if (state.completionFrame !== null && this.frameCount > state.completionFrame) {
          this.miniBossLabEncounters.delete(eventId);
        }
        continue;
      }
      const definition = this.getMiniBossLabDefinition(state);
      if (!definition) continue;
      this.updateMiniBossLabEncounter(state, definition);
    }
  }

  updateMiniBoss(boss: Entity) {
     if (boss.miniBossLabEncounterId && boss.sourceEventId) {
       return;
     }
     boss.attackTimer++;
     const configuredPhase = this.applyConfiguredBossPhase(boss);
     const movementSpeedMultiplier = boss.activeBossPhaseSpeedMultiplier;
     const groupOffset = (boss.formationIndex - ((boss.encounterGroupSize - 1) / 2))
       * Math.min(boss.width * 0.72, Math.max(48, this.width * 0.18));
     const targetX = this.player.x + this.player.width/2 - boss.width/2 + groupOffset;
     const dx = targetX - boss.x;
     const movementPattern = boss.movementPattern ?? 'track-player';
     if (boss.y > 0 && (movementPattern === 'track-player' || movementPattern === 'gatekeeper-cycle')) {
       boss.x += dx * (0.03 + (this.wave * 0.005)) * movementSpeedMultiplier;
     }

     if (boss.y < 100) boss.vy = boss.configuredSpeed ?? 2;
     else {
        boss.vy = 0;
        if (movementPattern === 'arena-roam') {
          const roamTargetX = (this.width - boss.width) * (0.5 + Math.sin(boss.attackTimer * 0.017) * 0.38);
          const roamTargetY = Math.max(92, this.height * (0.16 + Math.cos(boss.attackTimer * 0.013) * 0.055));
          boss.x += (roamTargetX - boss.x) * 0.035 * movementSpeedMultiplier;
          boss.y += (roamTargetY - boss.y) * 0.03 * movementSpeedMultiplier;
        } else if (movementPattern === 'sine-drift') {
          boss.x += Math.sin((boss.attackTimer * 0.05) + boss.formationIndex * Math.PI) * 3 * movementSpeedMultiplier;
        } else if (movementPattern === 'wall-march') {
          const marchTargetX = (this.width - boss.width) * (0.5 + Math.sin(boss.attackTimer * 0.012) * 0.46);
          boss.x += (marchTargetX - boss.x) * 0.025 * movementSpeedMultiplier;
        } else if (movementPattern === 'drift-down' || movementPattern === 'asteroid-drift') {
          const holdY = Math.max(108, Math.min(this.height * 0.38, 260));
          boss.y += (holdY - boss.y) * 0.018 * movementSpeedMultiplier;
          if (movementPattern === 'asteroid-drift') {
            boss.x += Math.sin((boss.attackTimer * 0.031) + boss.formationIndex) * 1.4 * movementSpeedMultiplier;
          }
        } else {
          boss.x += Math.sin((boss.attackTimer * 0.05) + boss.formationIndex * Math.PI) * 3 * movementSpeedMultiplier;
        }
     }

     boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));

     const healthRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
     const activePhaseCount = configuredPhase
       || boss.phaseThresholds.filter((threshold) => healthRatio <= threshold).length;
     const phaseCadenceMultiplier = Math.max(0.45, 1 - Math.max(0, activePhaseCount - 1) * 0.16);
     const baseShootRate = boss.attackIntervalFrames ?? (this.wave === 1 ? 72 : Math.max(30, 60 - (this.wave * 5)));
     const hullPressureMultiplier = 0.58 + clamp(healthRatio, 0, 1) * 0.42;
     const shootRate = Math.max(8, Math.round(baseShootRate * phaseCadenceMultiplier * hullPressureMultiplier));
     if (boss.attackTimer % shootRate === 0) {
        const burstCount = Math.max(1, boss.configuredBurstCount ?? 1);
        for (let index = 0; index < burstCount; index++) {
          const offset = index - ((burstCount - 1) / 2);
          const b = this.createEntity(EntityType.PROJECTILE, boss.x + boss.width/2, boss.y + boss.height);
          b.vx = offset * 0.85;
          b.vy = boss.projectileSpeed ?? (5 + (this.wave * 0.5));
          b.width = 16;
          b.height = 16;
          b.color = '#ff0000';
          b.damage = Math.max(1, Number(boss.projectileDamage) || 1);
          this.entities.push(b);
        }
        this.playSound('boss_shoot', 0.9, { pitchJitter: 0.1, pitchOffset: -0.02 });
     }
  }

  getBossComponentDurability(
    boss: Entity,
    componentId: BossPartId,
    componentHealth?: BossComponentHealth
  ) {
    const authoredHealth = Number(componentHealth?.[componentId]);
    if (Number.isFinite(authoredHealth) && authoredHealth > 0) {
      return Math.max(
        1,
        authoredHealth * Math.max(0.01, boss.configuredDifficultyMultiplier || 1)
      );
    }
    const rigId = boss.bossRigId ?? 'open-orbit';
    const minimumDurability = BOSS_COMPONENT_DURABILITY[rigId][componentId] ?? 5;
    const healthRatio = this.isSandboxPrismMoth(boss)
      && (componentId === 'left-cannon' || componentId === 'right-cannon')
      ? 0.22
      : componentId === 'helmet'
        ? BOSS_HELMET_HEALTH_RATIO
        : BOSS_CANNON_HEALTH_RATIO;
    const durability = Math.max(
      minimumDurability,
      Math.round(Math.max(1, boss.maxHp) * healthRatio)
    );
    return durability;
  }

  createBossComponents(boss: Entity, componentHealth?: BossComponentHealth) {
    if (boss.bossRigId === 'open-orbit' || boss.bossRigId === 'citation-storm') {
      const isCitationStorm = boss.bossRigId === 'citation-storm';
      const isPrismMoth = this.isSandboxPrismMoth(boss);
      return ([
        {
          id: 'left-cannon',
          label: isPrismMoth
            ? 'LEFT WING'
            : isCitationStorm ? 'LEFT PLASMA CLAW' : 'LEFT RAILGUN',
          centerXRatio: isPrismMoth ? 0.22 : 0.17,
          centerYRatio: isPrismMoth ? 0.48 : isCitationStorm ? 0.51 : 0.45,
          widthRatio: isPrismMoth ? 0.44 : 0.38,
          heightRatio: isPrismMoth ? 0.7 : isCitationStorm ? 0.62 : 0.58
        },
        {
          id: 'right-cannon',
          label: isPrismMoth
            ? 'RIGHT WING'
            : isCitationStorm ? 'RIGHT PLASMA CLAW' : 'RIGHT RAILGUN',
          centerXRatio: isPrismMoth ? 0.78 : 0.83,
          centerYRatio: isPrismMoth ? 0.48 : isCitationStorm ? 0.51 : 0.45,
          widthRatio: isPrismMoth ? 0.44 : 0.38,
          heightRatio: isPrismMoth ? 0.7 : isCitationStorm ? 0.62 : 0.58
        }
      ] as const).map((layout) => {
        const maxHp = this.getBossComponentDurability(boss, layout.id, componentHealth);
        return {
          ...layout,
          hp: maxHp,
          maxHp,
          destroyed: false,
          exposed: true,
          flashFrames: 0,
          lastDamageFlashFrame: -999
        } satisfies BossComponentState;
      });
    }

    if (boss.bossRigId === 'paywall-siege') {
      return PAYWALL_BOSS_COMPONENT_LAYOUT.map((layout) => {
        const paywallLayout = layout.id === 'left-cannon'
          ? { centerXRatio: 0.27, centerYRatio: 0.7, widthRatio: 0.3, heightRatio: 0.36 }
          : layout.id === 'right-cannon'
            ? { centerXRatio: 0.73, centerYRatio: 0.7, widthRatio: 0.3, heightRatio: 0.36 }
            : { centerXRatio: 0.5, centerYRatio: 0.45, widthRatio: 0.32, heightRatio: 0.3 };
        const maxHp = this.getBossComponentDurability(boss, layout.id, componentHealth);
        return {
          ...layout,
          ...paywallLayout,
          hp: maxHp,
          maxHp,
          destroyed: false,
          exposed: true,
          flashFrames: 0,
          lastDamageFlashFrame: -999
        } satisfies BossComponentState;
      });
    }

    if (boss.bossRigId === 'crown-claw') {
      return ([
        {
          id: 'left-cannon',
          label: 'LEFT CLAW',
          centerXRatio: 0.2,
          centerYRatio: 0.58,
          widthRatio: 0.34,
          heightRatio: 0.58
        },
        {
          id: 'right-cannon',
          label: 'RIGHT CLAW',
          centerXRatio: 0.8,
          centerYRatio: 0.58,
          widthRatio: 0.34,
          heightRatio: 0.58
        }
      ] as const).map((layout) => {
        const maxHp = this.getBossComponentDurability(boss, layout.id, componentHealth);
        return {
          ...layout,
          hp: maxHp,
          maxHp,
          destroyed: false,
          exposed: true,
          flashFrames: 0,
          lastDamageFlashFrame: -999
        } satisfies BossComponentState;
      });
    }

    return [];
  }

  getBossComponentBox(boss: Entity, component: BossComponentState): CollisionBox {
    const isCannon = component.id === 'left-cannon' || component.id === 'right-cannon';
    const targetScale = isCannon
      ? boss.bossRigId === 'crown-claw' ? CROWNCLAW_ARM_HITBOX_SCALE : BOSS_CANNON_HITBOX_SCALE
      : 1;
    const width = Math.max(18, boss.width * component.widthRatio * targetScale);
    const height = Math.max(18, boss.height * component.heightRatio * targetScale);
    return {
      x: boss.x + boss.width * component.centerXRatio - width / 2,
      y: boss.y + boss.height * component.centerYRatio - height / 2,
      width,
      height
    };
  }

  getBossComponentVisualBox(
    boss: Entity,
    component: BossComponentState
  ): CollisionBox {
    const isCannon =
      component.id === 'left-cannon' || component.id === 'right-cannon';
    const visualScale = isCannon
      ? boss.bossRigId === 'crown-claw'
        ? CROWNCLAW_ARM_SCALE
        : BOSS_CANNON_SCALE
      : 1;
    const width = Math.max(18, boss.width * component.widthRatio * visualScale);
    const height = Math.max(18, boss.height * component.heightRatio * visualScale);
    return {
      x: boss.x + boss.width * component.centerXRatio - width / 2,
      y: boss.y + boss.height * component.centerYRatio - height / 2,
      width,
      height
    };
  }

  getBossCollisionMask(boss: Entity): BossCollisionMask | undefined {
    if (
      this.previewBossCollisionMask
      && boss.sourceEventId === this.previewBossCollisionEventId
    ) {
      return this.previewBossCollisionMask;
    }
    return getCampaignBossCollisionMask(boss.spriteUrl);
  }

  bossSilhouetteIntersectsBoxAt(
    boss: Entity,
    box: CollisionBox,
    x: number,
    y: number
  ) {
    const mask = this.getBossCollisionMask(boss);
    if (!mask) {
      const collisionBox = this.getCollisionBox(boss);
      return this.boxesIntersect(box, {
        ...collisionBox,
        x: collisionBox.x + x - boss.x,
        y: collisionBox.y + y - boss.y
      });
    }
    return intersectsBossCollisionMask(
      mask,
      {
        x,
        y,
        width: boss.width,
        height: boss.height
      },
      box,
      boss.bossPresentationBankRadians
    );
  }

  bossSilhouetteIntersectsBox(boss: Entity, box: CollisionBox) {
    return this.bossSilhouetteIntersectsBoxAt(boss, box, boss.x, boss.y);
  }

  private bossSweptOpaqueCoreIntersectsBox(boss: Entity, box: CollisionBox) {
    const previousX = boss.x - boss.vx;
    const previousY = boss.y - boss.vy;
    const travel = Math.hypot(boss.vx, boss.vy);
    const sampleSpacing = Math.max(4, Math.min(box.width, box.height) * 0.3);
    const sampleCount = Math.max(1, Math.min(32, Math.ceil(travel / sampleSpacing)));
    const coreRadius = resolveHeliosTrackingPincerCoreRadius(boss.width, boss.height);
    for (let index = 0; index <= sampleCount; index += 1) {
      const progress = index / sampleCount;
      const sampleX = previousX + boss.vx * progress;
      const sampleY = previousY + boss.vy * progress;
      const coreBox = {
        x: sampleX + boss.width / 2 - coreRadius,
        y: sampleY + boss.height / 2 - coreRadius,
        width: coreRadius * 2,
        height: coreRadius * 2
      };
      if (!this.boxesIntersect(box, coreBox)) continue;
      if (this.bossSilhouetteIntersectsBoxAt(
        boss,
        box,
        sampleX,
        sampleY
      )) {
        return true;
      }
    }
    return false;
  }

  private isHeliosClawOperational(boss: Entity, side: HeliosClawSide) {
    const componentId: BossPartId = side === 'port' ? 'left-cannon' : 'right-cannon';
    const component = boss.bossComponents?.find((item) => item.id === componentId);
    return !component || !component.destroyed;
  }

  private isHeliosMeleeDamageActive(boss: Entity) {
    const action = boss.bossActionPresentation;
    if (!action || action.stage !== 'fire') return false;
    const durationFrames = Math.max(1, action.endFrame - action.startFrame);
    const progress = clamp(
      (boss.attackTimer - action.startFrame) / durationFrames,
      0,
      1
    );
    if (action.primitiveId === 'articulated-melee-sweep') {
      const clampState = boss.bossHeliosCornerClampState;
      if (!clampState?.activeSide || clampState.fallbackToCrossfire) return false;
      return sampleHeliosCornerClamp({
        stage: 'fire',
        progress,
        side: clampState.activeSide
      }).damageActive;
    }
    if (action.primitiveId === 'tracking-pincer-dive') {
      return sampleHeliosTrackingPincer({
        sequence: action.sequence,
        progress
      }).damageActive;
    }
    return false;
  }

  private bossMeleeClawsIntersectBox(boss: Entity, box: CollisionBox) {
    if (!this.isHeliosMeleeDamageActive(boss)) return false;
    const action = boss.bossActionPresentation;
    const requestedSides: readonly HeliosClawSide[] = action?.primitiveId === 'articulated-melee-sweep'
      ? boss.bossHeliosCornerClampState?.activeSide
        ? [boss.bossHeliosCornerClampState.activeSide]
        : []
      : ['port', 'starboard'];
    const operationalSides = requestedSides.filter((side) => (
      this.isHeliosClawOperational(boss, side)
    ));
    const tips = this.getPreviewBossWeaponOrigins(boss, operationalSides);
    const radius = Math.max(9, Math.min(boss.width, boss.height) * 0.095);
    const clawTipHit = tips.some((tip) => this.boxesIntersect(box, {
      x: tip.x - radius,
      y: tip.y - radius,
      width: radius * 2,
      height: radius * 2
    }));
    return clawTipHit || (
      action?.primitiveId === 'tracking-pincer-dive'
      && this.bossSweptOpaqueCoreIntersectsBox(boss, box)
    );
  }

  bossComponentSilhouetteIntersectsBox(
    boss: Entity,
    component: BossComponentState,
    box: CollisionBox
  ) {
    const componentBox = this.getBossComponentVisualBox(boss, component);
    if (!this.boxesIntersect(box, componentBox)) return false;

    const isPreviewArtwork = Boolean(
      this.previewBossCollisionMask
      && boss.sourceEventId === this.previewBossCollisionEventId
    );
    const componentMask = isPreviewArtwork
      ? undefined
      : getBossComponentCollisionMask(boss.bossRigId, component.id);
    if (componentMask) {
      return intersectsBossCollisionMask(
        componentMask,
        componentBox,
        box,
        boss.bossPresentationBankRadians
      );
    }

    // Sandbox atlases share one content-hash-bound assembled mask. Clip that
    // real silhouette by the typed component region instead of accepting the
    // old transparent component rectangle.
    return this.bossSilhouetteIntersectsBox(boss, box);
  }

  getBossDamageBounds(boss: Entity): CollisionBox {
    let minimumX = boss.x;
    let minimumY = boss.y;
    let maximumX = boss.x + boss.width;
    let maximumY = boss.y + boss.height;
    for (const component of boss.bossComponents ?? []) {
      if (!isBossComponentTargetable(component)) continue;
      const box = this.getBossComponentVisualBox(boss, component);
      minimumX = Math.min(minimumX, box.x);
      minimumY = Math.min(minimumY, box.y);
      maximumX = Math.max(maximumX, box.x + box.width);
      maximumY = Math.max(maximumY, box.y + box.height);
    }
    return {
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX,
      height: maximumY - minimumY
    };
  }

  getBossComponentHit(boss: Entity, shotBox: CollisionBox) {
    const shotCenterX = shotBox.x + shotBox.width / 2;
    const shotCenterY = shotBox.y + shotBox.height / 2;
    const candidates = (boss.bossComponents ?? [])
      .filter(isBossComponentTargetable)
      .map((component) => {
        const box = this.getBossComponentVisualBox(boss, component);
        const overlapWidth = Math.max(0, Math.min(shotBox.x + shotBox.width, box.x + box.width) - Math.max(shotBox.x, box.x));
        const overlapHeight = Math.max(0, Math.min(shotBox.y + shotBox.height, box.y + box.height) - Math.max(shotBox.y, box.y));
        const containsShotCenter = shotCenterX >= box.x
          && shotCenterX <= box.x + box.width
          && shotCenterY >= box.y
          && shotCenterY <= box.y + box.height;
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const normalizedDistance = Math.hypot(
          (shotCenterX - centerX) / Math.max(1, box.width),
          (shotCenterY - centerY) / Math.max(1, box.height)
        );
        return {
          component,
          overlapArea: overlapWidth * overlapHeight,
          containsShotCenter,
          normalizedDistance,
          visibleHit: this.bossComponentSilhouetteIntersectsBox(
            boss,
            component,
            shotBox
          )
        };
      })
      .filter((candidate) => candidate.visibleHit)
      .sort((left, right) => (
        Number(right.containsShotCenter) - Number(left.containsShotCenter)
        || left.normalizedDistance - right.normalizedDistance
        || right.overlapArea - left.overlapArea
      ));
    return candidates[0]?.component;
  }

  detonateBitcoinHashBurst(projectile: Entity, centerX: number, centerY: number) {
    if (projectile.markedForDeletion) return;
    projectile.markedForDeletion = true;
    this.flashAlpha = Math.max(this.flashAlpha, 0.2);
    this.addShake(5);
    this.addHitStop(4);
    this.spawnRingEffect(centerX, centerY, '#facc15');
    this.spawnRingEffect(centerX, centerY, '#22d3ee');
    this.spawnBurst(centerX, centerY, '#facc15', 20, 6, 5);
    this.playSound('bomb', 0.62, { pitchJitter: 0.03, pitchOffset: -0.18 });

    const targets = this.entities.filter((entity) => !entity.markedForDeletion && this.isEnemyTarget(entity));
    for (const target of targets) {
      const dx = target.x + target.width / 2 - centerX;
      const dy = target.y + target.height / 2 - centerY;
      const effectiveRadius = BTC_HASH_BURST_RADIUS + Math.min(42, Math.max(target.width, target.height) * 0.22);
      if ((dx * dx + dy * dy) > effectiveRadius * effectiveRadius) continue;
      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.pulseDamageFlash(target);
        continue;
      }

      const damage = target.type === EntityType.BOSS
        ? 12
        : target.type === EntityType.MINI_BOSS
          ? 22
          : target.type === EntityType.ENEMY_INVADER
            ? 28
            : 999;
      if (target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS) {
        this.damageBossHull(target, damage);
      }
      else {
        const previousHealth = target.hp;
        target.hp -= damage;
        this.recordEntityDamage(target, previousHealth);
        this.flashDamageTarget(target);
      }
      this.spawnBurst(target.x + target.width / 2, target.y + target.height / 2, '#fde047', 5, 3.4, 3);
      if (target.hp <= 0) this.handleEnemyDestroyed(target);
    }
  }

  updateBossDecayStage(boss: Entity) {
    if (boss.type !== EntityType.BOSS) return;
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const destroyedCount = (boss.bossComponents ?? []).filter((component) => component.destroyed).length;
    if (this.isSandboxPrismMoth(boss)) {
      const hullStage = healthRatio <= 0.18
        ? 4
        : healthRatio <= 0.4
          ? 3
          : healthRatio <= 0.64
            ? 2
            : healthRatio <= 0.82
              ? 1
              : 0;
      boss.bossDecayStage = Math.max(hullStage, Math.min(4, destroyedCount * 2));
      return;
    }
    if (boss.bossRigId === 'open-orbit' || boss.bossRigId === 'citation-storm') {
      boss.bossDecayStage = destroyedCount < 2
        ? destroyedCount
        : healthRatio <= 0.3 ? 4 : healthRatio <= 0.62 ? 3 : 2;
      return;
    }
    if (boss.bossRigId === 'paywall-siege') {
      const helmetDestroyed = (boss.bossComponents ?? []).some(
        (component) => component.id === 'helmet' && component.destroyed
      );
      boss.bossDecayStage = helmetDestroyed
        ? healthRatio <= 0.2 ? 4 : healthRatio <= 0.45 ? 3 : 2
        : destroyedCount > 0 ? 1 : 0;
      return;
    }
    if (boss.bossRigId === 'crown-claw') {
      const armorStage = destroyedCount >= 2 ? 1 : 0;
      boss.bossDecayStage = destroyedCount >= 2
        ? healthRatio <= 0.12 ? 5 : healthRatio <= 0.28 ? 4 : healthRatio <= 0.48 ? 3 : healthRatio <= 0.7 ? 2 : 1
        : armorStage;
      return;
    }
    boss.bossDecayStage = healthRatio <= 0.18 ? 4 : healthRatio <= 0.4 ? 3 : healthRatio <= 0.64 ? 2 : healthRatio <= 0.82 ? 1 : 0;
  }

  damageBossComponent(boss: Entity, component: BossComponentState, damage: number) {
    if (boss.bossRigId === 'paywall-siege' && component.id === 'helmet') {
      // Paywall's helmet is hull-linked presentation armor, not a separate
      // health pool. Shots that visibly land on it must always damage the hull.
      this.damageBossHull(boss, damage);
      return;
    }
    if (this.isPreviewBossComponentInvincible(component)) {
      this.pulseBossComponentFlash(component);
      return;
    }
    const damageResult = applyBossComponentDamage(
      component,
      damage,
      BOSS_COMPONENT_WEAK_POINT_MULTIPLIER
    );
    if (!damageResult.applied) return;
    this.pulseBossComponentFlash(component);
    if (this.telemetrySink && this.telemetrySessionActive) {
      this.telemetrySink.record({
        ...this.getTelemetryContext(),
        type: 'entity-damage',
        targetId: `${boss.id}:${component.id}`,
        targetKind: `boss-component:${component.id}`,
        sourceKind: 'player',
        amount: Math.max(0, damageResult.previousHealth - damageResult.remainingHealth),
        remainingHealth: damageResult.remainingHealth,
        fatal: damageResult.destroyedNow
      });
    }
    const box = this.getBossComponentBox(boss, component);
    const impactX = box.x + box.width / 2;
    const impactY = box.y + box.height / 2;
    if (damageResult.destroyedNow) {
      if (
        this.isSandboxFrontierCrownclaw(boss)
        && (component.id === 'left-cannon' || component.id === 'right-cannon')
      ) {
        this.removeFrontierCrownclawSideFromActiveAction(
          boss,
          component.id === 'left-cannon' ? 'port' : 'starboard'
        );
      }
      this.queueBossSignificantImpact(
        boss,
        component.centerXRatio,
        component.centerYRatio,
        component.id === 'helmet' ? 1.35 : 1.1,
        true
      );
      const label = component.id === 'helmet'
        ? 'CORE EXPOSED'
        : boss.bossRigId === 'crown-claw'
          ? `${component.label} SEVERED`
          : `${component.label} DISABLED`;
      if (!this.isSandboxPrismMoth(boss)) {
        this.spawnFloatingText(
          impactX,
          impactY,
          label,
          component.id === 'helmet' ? '#fef08a' : '#fb7185',
          17
        );
      }
      this.spawnBurst(impactX, impactY, '#ffffff', 18, 5.2, 5);
      this.addShake(component.id === 'helmet' ? 5 : 3.5);
      this.addHitStop(component.id === 'helmet' ? 9 : 6);
      this.playSound('explode', component.id === 'helmet' ? 1.55 : 1.3, {
        pitchJitter: 0.08,
        pitchOffset: component.id === 'helmet' ? -0.14 : -0.06
      });
      if (component.id === 'helmet') {
        this.entities.forEach((entity) => {
          if (entity.projectileVisualKind === 'boss-ray') entity.markedForDeletion = true;
        });
      }
    }
    this.updateBossDecayStage(boss);
  }

  detachPaywallHelmetForHullHealth(boss: Entity) {
    if (boss.bossRigId !== 'paywall-siege') return false;
    const helmet = syncHullLinkedHelmetToHullHealth(
      boss.bossComponents ?? [],
      boss.hp,
      boss.maxHp
    );
    if (!helmet) return false;

    const box = this.getBossComponentBox(boss, helmet);
    const impactX = box.x + box.width / 2;
    const impactY = box.y + box.height / 2;
    this.queueBossSignificantImpact(
      boss,
      helmet.centerXRatio,
      helmet.centerYRatio,
      1.2,
      true
    );
    this.spawnBurst(impactX, impactY, '#fef08a', 14, 4.6, 4);
    this.addShake(4);
    this.addHitStop(7);
    this.playSound('explode', 1.35, {
      pitchJitter: 0.06,
      pitchOffset: -0.08
    });
    return true;
  }

  isBossHullProtected(boss: Entity) {
    return isBossHullProtectedByComponents(
      boss.bossComponents ?? [],
      boss.bossRigId === 'paywall-siege'
    );
  }

  damageBossHull(boss: Entity, damage: number) {
    if (boss.type !== EntityType.BOSS && boss.type !== EntityType.MINI_BOSS) return;
    if (!this.isBossCombatInteractive(boss)) return;
    if (boss.miniBossLabEncounterId && !boss.miniBossLabDamageable) {
      this.pulseDamageFlash(boss);
      if (this.frameCount % 8 === 0) {
        this.spawnRingEffect(
          boss.x + boss.width / 2,
          boss.y + boss.height / 2,
          '#67e8f9'
        );
      }
      return;
    }
    if (boss.type === EntityType.BOSS && this.isBossHullProtected(boss)) {
      this.pulseDamageFlash(boss);
      return;
    }
    if (this.isPreviewBossHullInvincible(boss)) {
      this.pulseDamageFlash(boss);
      return;
    }
    const previousHealth = boss.hp;
    boss.hp -= damage;
    this.detachPaywallHelmetForHullHealth(boss);
    const firstDepletionWillRevive = boss.hp <= 0 && this.canBeginBossRevival(boss);
    this.recordEntityDamage(
      boss,
      previousHealth,
      'player',
      boss.type,
      firstDepletionWillRevive ? false : undefined
    );
    this.pulseDamageFlash(boss);
    const appliedDamage = Math.max(0, previousHealth - boss.hp);
    if (
      (boss.type === EntityType.BOSS || Boolean(boss.miniBossLabEncounterId))
      && isBossHullImpactSignificant(appliedDamage, boss.maxHp)
    ) {
      this.queueBossSignificantImpact(
        boss,
        0.5,
        0.56,
        getBossHullImpactStrength(appliedDamage, boss.maxHp),
        false
      );
    }
    this.updateBossDecayStage(boss);
  }

  spawnBoss(configured?: RuntimeBossEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const sizeMultiplier = clamp(Number(configured?.sizeMultiplier) || 1, 0.5, 2.5);
    const configuredBossWidth = Math.round(220 * sizeMultiplier);
    const previewArtworkDimensions = resolveBossPreviewArtworkDimensions({
      configuredWidth: configuredBossWidth,
      configuredHeight: Math.round(200 * sizeMultiplier),
      sourceEventId: configured?.id,
      selectedEventId: this.previewBossCollisionEventId,
      designSize: this.previewBossArtworkDesignSize
    });
    const configuredBossHeight = previewArtworkDimensions.height;
    const usesOversizedEncounterFraming = sizeMultiplier > 1.5;
    const bossWidth = usesOversizedEncounterFraming
      ? Math.min(configuredBossWidth, Math.round(this.width * 0.82))
      : configuredBossWidth;
    const bossHeight = usesOversizedEncounterFraming
      ? Math.round(bossWidth * (configuredBossHeight / configuredBossWidth))
      : configuredBossHeight;
    const anchoredPosition = this.getAnchoredTopLeft(configured, bossWidth, bossHeight);
    const boss = this.createEntity(
      EntityType.BOSS,
      anchoredPosition?.x ?? this.width / 2 - bossWidth / 2,
      anchoredPosition?.y ?? -bossHeight
    );
    const phase = Math.max(1, this.stats.wave);
    boss.width = bossWidth;
    boss.height = bossHeight;
    boss.hp = configured
      ? Math.max(1, (Number(configured.health) || 1) * difficultyMultiplier)
      : phase === 1 ? 235 : 220 + (phase * 105);
    boss.maxHp = boss.hp;
    boss.variant = (this.stats.wave - 1) % 3;
    boss.color = '#990000';
    boss.text = "GATEKEEPER";
    boss.configuredBaseSpeed = configured ? Math.max(0.1, (Number(configured.speed) || 2) * difficultyMultiplier) : 2;
    boss.configuredSpeed = boss.configuredBaseSpeed;
    boss.configuredDifficultyMultiplier = difficultyMultiplier;
    boss.vy = boss.configuredSpeed;
    if (configured) {
      boss.bossAttackArchetype = resolveGeneratedBossArchetype(configured.spriteKey) ?? undefined;
      boss.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.BOSS);
      boss.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
      if (configured.spriteStyle) boss.spriteStyle = { ...configured.spriteStyle };
      boss.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
      boss.configuredAttackTempoMultiplier = clamp(
        Number(configured.attackTempoMultiplier) || 1,
        1,
        1.35
      );
      boss.scoreReward = Math.max(0, Number(configured.scoreReward) || 0);
      boss.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
      boss.phaseThresholds = configured.phases.map((healthPhase) => Number(healthPhase.triggerHealthRatio)).filter(Number.isFinite);
      boss.bossWeaponSettings = configured.weapons.map((setting) => ({ ...setting }));
      boss.bossPhaseSettings = configured.phases.map((healthPhase) => ({
        ...healthPhase,
        weaponSettingIds: [...healthPhase.weaponSettingIds]
      }));
      boss.bossRevival = configured.revival ? { ...configured.revival } : undefined;
      boss.bossRevivalStage = boss.bossRevival ? 'armed' : undefined;
      boss.bossRevivalProgress = 0;
      boss.bossRevivalConsumed = false;
      // Phase resolution needs provenance in order to distinguish explicitly
      // authored Campaign commanders from legacy/sandbox bosses.
      boss.sourceEventId = configured.id;
      boss.sourceItemId = configured.bossId;
      boss.text = configured.label?.trim().toUpperCase() || boss.text;
      boss.bossTimeline = configured.timeline ? {
        ...configured.timeline,
        clips: configured.timeline.clips.map((clip) => ({
          ...clip,
          ...(clip.repeat ? { repeat: { ...clip.repeat } } : {}),
          ...(clip.parameters ? { parameters: { ...clip.parameters } } : {})
        }))
      } : undefined;
      this.applyConfiguredBossPhase(boss);
      boss.completesWave = true;
      boss.bossRigId = configured.rigId ?? BOSS_RIG_BY_EVENT_ID[configured.id] ?? 'open-orbit';
      const usesGeneratedCampaignBossArt = boss.spriteUrl?.includes('/scicon-stage20-expansion-v1/bosses/');
      if (
        boss.bossRigId === 'crown-claw'
        && !usesGeneratedCampaignBossArt
        && !this.previewBossArtworkDesignSize
      ) {
        const previousWidth = boss.width;
        boss.width = Math.min(this.width * 0.78, 280);
        boss.height = boss.width * (704 / 1024);
        boss.x -= (boss.width - previousWidth) / 2;
      }
      boss.bossComponents = configured.componentMode === 'hull-only'
        ? []
        : this.createBossComponents(boss, configured.componentHealth);
      boss.bossRevivalBaseWidth = boss.width;
      boss.bossRevivalBaseHeight = boss.height;
      if (boss.spriteUrl) loadImage(boss.spriteUrl);
      boss.spriteFrames?.forEach(loadImage);
    }
    boss.bossRigId ??= 'open-orbit';
    boss.bossComponents ??= this.createBossComponents(boss, configured?.componentHealth);
    this.bossRef = boss;
    this.entities.push(boss);
    const shieldCount = configured ? Math.max(0, Math.floor(Number(configured.shieldCount) || 0)) : undefined;
    if ((configured && (shieldCount || 0) > 0) || (!configured && phase >= 2)) {
      this.spawnBossShieldRing(boss, phase, shieldCount);
    }
  }

  getBossPulseCount(phase: number) {
    if (phase <= 1) return 1;
    if (phase === 2) return 2;
    if (phase === 3) return 3;
    return 4;
  }

  spawnBossBurst(boss: Entity, phase: number, projectileCount?: number) {
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const configuredShotCount = projectileCount
      ?? boss.configuredBurstCount
      ?? (phase <= 1 ? 3 : phase === 2 ? 5 : 7);
    const cannonComponents = (boss.bossComponents ?? []).filter((component) => (
      component.id === 'left-cannon' || component.id === 'right-cannon'
    ));
    const activeCannons = cannonComponents.filter((component) => !component.destroyed);
    if (cannonComponents.length > 0 && activeCannons.length === 0) {
      this.spawnBossCoreVolley(boss, phase);
      return;
    }
    const activeCannonCount = activeCannons.length;
    const cannonStrength = cannonComponents.length > 0 ? activeCannonCount / cannonComponents.length : 1;
    const minimumShotCount = projectileCount === undefined ? 3 : 1;
    const shotCount = Math.min(
      24,
      Math.max(minimumShotCount, Math.round(configuredShotCount * (0.35 + cannonStrength * 0.65)))
    );
    const spread = phase <= 1 ? 0.2 : phase === 2 ? 0.18 : 0.16;
    const speed = boss.projectileSpeed ?? Math.min(10.5, 6 + phase * 0.55);
    const origins = activeCannons.length > 0
      ? activeCannons.map((component) => {
        const box = this.getBossComponentBox(boss, component);
        return { x: box.x + box.width / 2, y: box.y + box.height * 0.72 };
      })
      : [{ x: boss.x + boss.width / 2, y: boss.y + boss.height - 20 }];

    for (let i = 0; i < shotCount; i++) {
      const origin = origins[i % origins.length];
      const angle = Math.atan2(py - origin.y, px - origin.x);
      const offset = i - ((shotCount - 1) / 2);
      const b = this.createEntity(EntityType.PROJECTILE, origin.x, origin.y);
      b.vx = Math.cos(angle + (offset * spread)) * speed;
      b.vy = Math.sin(angle + (offset * spread)) * speed;
      b.width = 15;
      b.height = 15;
      b.color = phase >= 3 ? '#ff7a18' : '#ff0000';
      b.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      b.text = "";
      b.bossOwnerId = boss.id;
      this.entities.push(b);
    }

    if (phase >= 4) {
      [-0.32, 0.32].forEach(offset => {
        const cx = boss.x + boss.width / 2;
        const cy = boss.y + boss.height - 20;
        const b = this.createEntity(EntityType.PROJECTILE, cx + boss.width * offset, cy - 8);
        b.vx = offset * 2.2;
        b.vy = speed * 0.95;
        b.width = 13;
        b.height = 18;
        b.color = '#f97316';
        b.damage = Math.max(1, Number(boss.projectileDamage) || 1);
        b.bossOwnerId = boss.id;
        this.entities.push(b);
      });
    }
    this.playSound('boss_shoot', phase >= 3 ? 1.25 : 1, {
      pitchJitter: 0.09,
      pitchOffset: phase >= 3 ? -0.12 : -0.04
    });
  }

  spawnBossCoreVolley(boss: Entity, phase: number) {
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const pressure = 1 - healthRatio;
    const rigId = boss.bossRigId ?? 'open-orbit';
    const originX = boss.x + boss.width / 2;
    const originY = boss.y + boss.height * (rigId === 'crown-claw' ? 0.58 : 0.66);
    const playerX = this.player.x + this.player.width / 2;
    const playerY = this.player.y + this.player.height / 2;
    const baseAngle = Math.atan2(playerY - originY, playerX - originX);
    const tier = pressure >= 0.68 ? 2 : pressure >= 0.34 ? 1 : 0;
    const profiles: Record<BossRigId, {
      shotCounts: readonly [number, number, number];
      spread: number;
      speedScale: number;
      color: string;
      angleDrift: number;
    }> = {
      'open-orbit': {
        shotCounts: [1, 3, 5],
        spread: 0.17,
        speedScale: 0.92,
        color: '#fb7185',
        angleDrift: 0
      },
      'citation-storm': {
        shotCounts: [3, 5, 7],
        spread: 0.13,
        speedScale: 0.88,
        color: '#c084fc',
        angleDrift: Math.sin(boss.attackTimer * 0.19) * 0.11
      },
      'paywall-siege': {
        shotCounts: [3, 5, 7],
        spread: 0.11,
        speedScale: 0.84,
        color: '#facc15',
        angleDrift: 0
      },
      'crown-claw': {
        shotCounts: [3, 5, 7],
        spread: 0.2,
        speedScale: 0.96,
        color: '#2dd4bf',
        angleDrift: Math.sin(boss.attackTimer * 0.13) * 0.06
      }
    };
    const profile = profiles[rigId];
    const shotCount = profile.shotCounts[tier];
    const speed = (boss.projectileSpeed ?? Math.min(10.5, 6 + phase * 0.55))
      * (profile.speedScale + pressure * 0.18);

    for (let index = 0; index < shotCount; index++) {
      const offset = index - ((shotCount - 1) / 2);
      const angle = baseAngle + profile.angleDrift + offset * profile.spread;
      const projectile = this.createEntity(EntityType.PROJECTILE, originX - 8, originY - 8);
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
      projectile.width = tier >= 2 ? 17 : 15;
      projectile.height = tier >= 2 ? 17 : 15;
      projectile.color = profile.color;
      projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      projectile.variant = index + tier * 10;
      projectile.bossOwnerId = boss.id;
      if (rigId === 'paywall-siege') {
        projectile.projectileVisualKind = 'boss-bolt';
        projectile.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
      }
      this.entities.push(projectile);
    }

    this.playSound('boss_shoot', 0.95 + pressure * 0.28, {
      pitchJitter: rigId === 'citation-storm' ? 0.12 : 0.06,
      pitchOffset: rigId === 'crown-claw' ? -0.16 : rigId === 'citation-storm' ? 0.06 : -0.08
    });
  }

  spawnBossBeam(boss: Entity, phase: number, pulseIndex: number) {
    const beamWidth = Math.min(112, 76 + (phase * 7));
    const bossCenterX = boss.x + boss.width / 2;
    const beamCenterX = Math.max(beamWidth / 2, Math.min(this.width - beamWidth / 2, bossCenterX));
    const beam = this.createEntity(EntityType.PROJECTILE, beamCenterX - beamWidth / 2, boss.y + boss.height - 20);
    beam.isBeam = true;
    beam.width = beamWidth;
    beam.height = this.height;
    beam.life = phase <= 1 ? 68 : Math.max(18, 32 - phase * 3);
    beam.maxLife = beam.life;
    beam.color = phase >= 3 ? '#ff7a18' : '#ff0000';
    beam.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    beam.beamAnchorOffsetX = boss.width / 2 - beamWidth / 2;
    beam.bossOwnerId = boss.id;
    beam.variant = pulseIndex;
    this.entities.push(beam);

    this.playSound('boss_shoot', 1.35, { pitchJitter: 0.04, pitchOffset: -0.18 });
    this.playSound(pulseIndex === 0 ? 'boss_roar' : 'electricity');
  }

  private getGatekeeperPrimeActiveCannonOrigins(boss: Entity) {
    const activeCannons = (boss.bossComponents ?? []).filter((component) => (
      !component.destroyed
      && (component.id === 'left-cannon' || component.id === 'right-cannon')
    ));
    if (activeCannons.length === 0) {
      return [{
        id: 'core' as const,
        xRatio: 0.5,
        x: boss.x + boss.width / 2,
        y: boss.y + boss.height * 0.62
      }];
    }
    return activeCannons.map((component) => {
      const box = this.getBossComponentBox(boss, component);
      return {
        id: component.id,
        xRatio: component.centerXRatio,
        x: box.x + box.width / 2,
        y: box.y + box.height * 0.72
      };
    });
  }

  private spawnGatekeeperPrimeChargeCue(boss: Entity) {
    for (const origin of this.getGatekeeperPrimeActiveCannonOrigins(boss)) {
      const cue = new VisualEffect(origin.x, origin.y, 'ring', '', '#67e8f9');
      cue.life = 48;
      cue.maxLife = cue.life;
      cue.bossOwnerId = boss.id;
      this.entities.push(cue);
    }
    this.playSound('electricity', 0.62, { pitchJitter: 0.03, pitchOffset: 0.08 });
  }

  private getGatekeeperPrimeProjectileCap() {
    return this.mobileProfile
      ? GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP
      : GATEKEEPER_PRIME_DESKTOP_PROJECTILE_CAP;
  }

  private getGatekeeperPrimeActiveProjectileCount(boss: Entity) {
    return this.entities.reduce((count, entity) => count + Number(
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.type === EntityType.PROJECTILE
    ), 0);
  }

  private spawnGatekeeperPrimeRailPulse(boss: Entity, pulseFrame: number) {
    const cap = this.getGatekeeperPrimeProjectileCap();
    const origins = this.getGatekeeperPrimeActiveCannonOrigins(boss);
    const targetX = boss.gatekeeperPrimeLockedTargetX
      ?? this.player.x + this.player.width / 2;
    const targetY = boss.gatekeeperPrimeLockedTargetY
      ?? this.player.y + this.player.height / 2;
    const phaseIndex = boss.gatekeeperPrimePhaseId === 'prime-overdrive'
      ? 2
      : boss.gatekeeperPrimePhaseId === 'prime-pressure'
        ? 1
        : 0;
    const speed = boss.projectileSpeed ?? 6.55;
    let activeCount = this.getGatekeeperPrimeActiveProjectileCount(boss);
    const shotCount = 3;
    for (let shotIndex = 0; shotIndex < shotCount; shotIndex++) {
      if (activeCount >= cap) return;
      const originIndex = shotIndex % origins.length;
      const origin = origins[originIndex];
      const baseAngle = Math.atan2(targetY - origin.y, targetX - origin.x);
      const spread = (shotIndex - (shotCount - 1) / 2) * 0.2;
      const projectile = this.createEntity(
        EntityType.PROJECTILE,
        origin.x - 7,
        origin.y - 8
      );
      projectile.vx = Math.cos(baseAngle + spread) * speed;
      projectile.vy = Math.sin(baseAngle + spread) * speed;
      projectile.width = 14;
      projectile.height = 17;
      projectile.color = phaseIndex >= 2 ? '#fef08a' : '#67e8f9';
      projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      projectile.bossOwnerId = boss.id;
      projectile.variant = pulseFrame + shotIndex * 17;
      this.entities.push(projectile);
      activeCount++;
    }
    this.playSound('boss_shoot', 0.88 + phaseIndex * 0.08, {
      pitchJitter: 0.035,
      pitchOffset: -0.08 + phaseIndex * 0.04
    });
  }

  private spawnGatekeeperPrimeLaneBeam(
    boss: Entity,
    anchorXRatio: number,
    telegraph: boolean,
    lifetimeFrames: number,
    sequence: number,
    narrow: boolean = false
  ) {
    if (this.getGatekeeperPrimeActiveProjectileCount(boss) >= this.getGatekeeperPrimeProjectileCap()) {
      return;
    }
    const width = telegraph
      ? this.mobileProfile ? 5 : 6
      : narrow
        ? this.mobileProfile ? 18 : 22
        : this.mobileProfile ? 38 : 48;
    const beam = this.createEntity(
      EntityType.PROJECTILE,
      boss.x + boss.width * anchorXRatio - width / 2,
      boss.y + boss.height - 20
    );
    beam.isBeam = true;
    beam.isTelegraph = telegraph;
    beam.width = width;
    beam.height = this.height;
    beam.life = Math.max(1, lifetimeFrames);
    beam.maxLife = beam.life;
    beam.color = telegraph ? '#67e8f9' : '#22d3ee';
    beam.damage = telegraph ? 0 : Math.max(1, Number(boss.projectileDamage) || 1);
    beam.beamAnchorOffsetX = boss.width * anchorXRatio - width / 2;
    beam.bossOwnerId = boss.id;
    beam.variant = sequence;
    this.entities.push(beam);
  }

  /**
   * Mission 5's canonical Gatekeeper Prime never dives at the player. It keeps
   * one predictable upper-arena patrol while its live cannon/core anatomy owns
   * all warnings and damaging emissions.
   */
  private updateGatekeeperPrime(boss: Entity, healthRatio: number) {
    const attackTempoMultiplier = boss.configuredAttackTempoMultiplier;
    const attackSchedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
    const previewSample = sampleGatekeeperPrimePatrol({
      combatFrame: 0,
      healthRatio,
      viewportWidth: this.width,
      viewportHeight: this.height,
      bossWidth: boss.width,
      bossHeight: boss.height,
      attackTempoMultiplier
    });
    if (boss.gatekeeperPrimeCombatStartFrame < 0) {
      const previousX = boss.x;
      const previousY = boss.y;
      const entranceSpeed = Math.min(3.2, Math.max(1.25, boss.configuredSpeed ?? 2));
      boss.x += ((this.width - boss.width) / 2 - boss.x) * 0.08;
      boss.y = Math.min(previewSample.minimumY, boss.y + entranceSpeed);
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.isCharging = false;
      if (boss.y >= previewSample.minimumY - 0.01) {
        boss.gatekeeperPrimeCombatStartFrame = boss.attackTimer;
        boss.gatekeeperPrimeLockedTargetX = null;
        boss.gatekeeperPrimeLockedTargetY = null;
      }
      return;
    }

    const combatFrame = Math.max(0, boss.attackTimer - boss.gatekeeperPrimeCombatStartFrame);
    const sample = sampleGatekeeperPrimePatrol({
      combatFrame,
      healthRatio,
      viewportWidth: this.width,
      viewportHeight: this.height,
      bossWidth: boss.width,
      bossHeight: boss.height,
      attackTempoMultiplier
    });
    if (
      sample.attack.attackId === 'rail-fan'
      && sample.attack.localFrame === sample.attack.telegraphStartFrame
      && boss.beamLaneSign === 0
    ) {
      boss.beamLaneSign = this.gameplayRandom.chance(0.5) ? -1 : 1;
    }
    const previousX = boss.x;
    const previousY = boss.y;
    let resolvedX = sample.x;
    if (
      sample.attack.attackId === 'rail-fan'
      && boss.beamLaneSign !== 0
      && sample.attack.localFrame >= sample.attack.telegraphStartFrame
      && sample.attack.localFrame < sample.attack.recoveryEndFrame
    ) {
      const laneCenterX = boss.beamLaneSign < 0 ? this.width * 0.3 : this.width * 0.7;
      const laneX = clamp(
        laneCenterX - boss.width / 2,
        sample.minimumX,
        sample.maximumX
      );
      const entering = clamp(
        (sample.attack.localFrame - sample.attack.telegraphStartFrame)
          / Math.max(1, sample.attack.fireStartFrame - sample.attack.telegraphStartFrame),
        0,
        1
      );
      const leaving = sample.attack.localFrame < sample.attack.fireEndFrame
        ? 1
        : 1 - clamp(
          (sample.attack.localFrame - sample.attack.fireEndFrame)
            / Math.max(1, sample.attack.recoveryEndFrame - sample.attack.fireEndFrame),
          0,
          1
        );
      const blend = Math.min(entering, leaving);
      const easedBlend = blend * blend * (3 - 2 * blend);
      resolvedX += (laneX - resolvedX) * easedBlend;
    }
    boss.x = resolvedX;
    boss.y = sample.y;
    boss.vx = boss.x - previousX;
    boss.vy = boss.y - previousY;
    boss.gatekeeperPrimeMinimumPatrolX = sample.minimumX;
    boss.gatekeeperPrimeMaximumPatrolX = sample.maximumX;
    boss.gatekeeperPrimeMinimumPatrolY = sample.minimumY;
    boss.gatekeeperPrimeMaximumPatrolY = sample.maximumY;
    boss.gatekeeperPrimeAttackId = sample.attack.attackId;
    boss.gatekeeperPrimeAttackStage = sample.attack.stage;
    boss.isCharging = sample.attack.stage === 'telegraph';

    if (boss.gatekeeperPrimePhaseId !== sample.phase.id) {
      const previousPhase = boss.gatekeeperPrimePhaseId;
      boss.gatekeeperPrimePhaseId = sample.phase.id;
      if (previousPhase) {
        const transition = new VisualEffect(
          boss.x + boss.width / 2,
          boss.y + boss.height * 0.5,
          'ring',
          '',
          sample.phase.index >= 2 ? '#fef08a' : '#67e8f9'
        );
        transition.life = 56;
        transition.maxLife = transition.life;
        transition.bossOwnerId = boss.id;
        this.entities.push(transition);
      }
    }

    if (sample.attack.localFrame === sample.attack.telegraphStartFrame) {
      boss.gatekeeperPrimeLockedTargetX = this.player.x + this.player.width / 2;
      boss.gatekeeperPrimeLockedTargetY = this.player.y + this.player.height / 2;
      this.spawnGatekeeperPrimeChargeCue(boss);
      if (sample.attack.attackId === 'rail-fan' || sample.attack.attackId === 'core-lane') {
        this.spawnGatekeeperPrimeLaneBeam(
          boss,
          0.5,
          true,
          sample.attack.fireStartFrame - sample.attack.telegraphStartFrame,
          31
        );
      } else if (sample.attack.attackId === 'twin-gate') {
        const cannonOrigins = this.getGatekeeperPrimeActiveCannonOrigins(boss);
        cannonOrigins.forEach((origin, index) => this.spawnGatekeeperPrimeLaneBeam(
          boss,
          origin.xRatio,
          true,
          sample.attack.fireStartFrame - sample.attack.telegraphStartFrame,
          61 + index,
          true
        ));
      }
    }

    if (isGatekeeperPrimeRailPulseFrame(combatFrame, healthRatio, attackTempoMultiplier)) {
      this.spawnGatekeeperPrimeRailPulse(boss, sample.attack.localFrame);
    }

    if (sample.attack.localFrame === sample.attack.fireStartFrame) {
      if (sample.attack.attackId === 'rail-fan' || sample.attack.attackId === 'core-lane') {
        this.spawnGatekeeperPrimeLaneBeam(
          boss,
          0.5,
          false,
          sample.attack.attackId === 'rail-fan'
            ? sample.attack.fireEndFrame - sample.attack.fireStartFrame
            : attackTempoMultiplier === 1
              ? 40
              : Math.max(24, Math.round(40 / attackSchedule.attackTempoMultiplier)),
          31
        );
      } else if (sample.attack.attackId === 'twin-gate') {
        const cannonOrigins = this.getGatekeeperPrimeActiveCannonOrigins(boss);
          cannonOrigins.forEach((origin, index) => this.spawnGatekeeperPrimeLaneBeam(
            boss,
            origin.xRatio,
            false,
            sample.attack.fireEndFrame - sample.attack.fireStartFrame,
            61 + index,
            true
        ));
        this.playSound('boss_roar', 0.85, { pitchJitter: 0.02, pitchOffset: -0.1 });
      }
    }

    if (sample.attack.stage === 'return') {
      boss.gatekeeperPrimeLockedTargetX = null;
      boss.gatekeeperPrimeLockedTargetY = null;
      if (sample.attack.attackId === 'rail-fan') boss.beamLaneSign = 0;
    }
  }

  spawnPaywallBossRay(boss: Entity, enraged: boolean, lifetimeFrames?: number) {
    const beamWidth = Math.max(42, Math.min(enraged ? 68 : 58, boss.width * (enraged ? 0.26 : 0.22)));
    const anchorOffsetX = boss.width * 0.5 - beamWidth / 2;
    const beam = this.createEntity(EntityType.PROJECTILE, boss.x + anchorOffsetX, boss.y + boss.height * 0.68);
    beam.isBeam = true;
    beam.projectileVisualKind = 'boss-ray';
    beam.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_RAY_FRAMES];
    beam.width = beamWidth;
    beam.height = this.height;
    beam.life = Math.max(1, Math.round(lifetimeFrames ?? (enraged ? 70 : 62)));
    beam.maxLife = beam.life;
    beam.color = '#ff9d2e';
    beam.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    beam.beamAnchorOffsetX = anchorOffsetX;
    beam.bossOwnerId = boss.id;
    beam.variant = enraged ? 1 : 0;
    this.entities.push(beam);
    this.playSound('boss_shoot', enraged ? 1.45 : 1.2, { pitchJitter: 0.04, pitchOffset: -0.2 });
    this.playSound('electricity');
  }

  spawnPaywallBossBoltVolley(boss: Entity, component: BossComponentState, enraged: boolean) {
    const componentBox = this.getBossComponentBox(boss, component);
    const cx = componentBox.x + componentBox.width / 2;
    const cy = componentBox.y + componentBox.height * 0.7;
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const centerAngle = Math.atan2(py - cy, px - cx);
    const shotCount = enraged ? 5 : 3;
    const spread = enraged ? 0.12 : 0.15;
    const speed = (boss.projectileSpeed ?? 7.65) * (enraged ? 1.08 : 0.96);
    for (let index = 0; index < shotCount; index++) {
      const offset = index - ((shotCount - 1) / 2);
      const bolt = this.createEntity(EntityType.PROJECTILE, cx - 9, cy - 9);
      bolt.projectileVisualKind = 'boss-bolt';
      bolt.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
      bolt.vx = Math.cos(centerAngle + offset * spread) * speed;
      bolt.vy = Math.sin(centerAngle + offset * spread) * speed;
      bolt.width = enraged ? 19 : 17;
      bolt.height = enraged ? 19 : 17;
      bolt.color = enraged ? '#fef08a' : '#ff9d2e';
      bolt.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      bolt.bossOwnerId = boss.id;
      bolt.variant = index + (component.id === 'right-cannon' ? 10 : 0);
      this.entities.push(bolt);
    }
    this.playSound('boss_shoot', enraged ? 1.2 : 1, {
      pitchJitter: 0.08,
      pitchOffset: component.id === 'right-cannon' ? 0.04 : -0.04
    });
  }

  spawnCrownClawStrike(boss: Entity, component: BossComponentState, enraged: boolean) {
    const componentBox = this.getBossComponentBox(boss, component);
    const cx = componentBox.x + componentBox.width / 2;
    const cy = componentBox.y + componentBox.height * 0.72;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    const angle = Math.atan2(playerCenterY - cy, playerCenterX - cx);
    const speed = (boss.projectileSpeed ?? 8.2) * (enraged ? 1.08 : 0.9);
    const claw = this.createEntity(EntityType.PROJECTILE, cx - 34, cy - 40);
    const isLeft = component.id === 'left-cannon';
    claw.projectileVisualKind = isLeft ? 'crown-claw-left' : 'crown-claw-right';
    claw.spriteFrames = [isLeft ? ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_LEFT : ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_RIGHT];
    claw.vx = Math.cos(angle) * speed;
    claw.vy = Math.sin(angle) * speed;
    claw.width = enraged ? 76 : 68;
    claw.height = enraged ? 90 : 80;
    claw.color = '#2dd4bf';
    claw.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    claw.variant = isLeft ? 0 : 1;
    claw.life = CROWNCLAW_STRIKE_MAX_LIFE;
    claw.maxLife = CROWNCLAW_STRIKE_MAX_LIFE;
    claw.clawOutboundFrames = enraged ? 28 : 34;
    claw.bossOwnerId = boss.id;
    claw.bossComponentId = component.id;
    this.entities.push(claw);
    this.playSound('boss_shoot', enraged ? 1.2 : 0.95, {
      pitchJitter: 0.05,
      pitchOffset: isLeft ? -0.08 : -0.02
    });
  }

  isCrownClawProjectile(entity: Entity) {
    return entity.projectileVisualKind === 'crown-claw-left'
      || entity.projectileVisualKind === 'crown-claw-right';
  }

  updateCrownClawProjectile(claw: Entity) {
    claw.life--;
    if (claw.life <= 0) {
      claw.markedForDeletion = true;
      return;
    }

    const owner = this.bossRef?.id === claw.bossOwnerId ? this.bossRef : null;
    const component = owner?.bossComponents?.find((part) => part.id === claw.bossComponentId);
    if (!owner || owner.markedForDeletion || !component || component.destroyed) {
      claw.markedForDeletion = true;
      return;
    }

    const age = claw.maxLife - claw.life;
    if (!claw.clawReturning && age >= claw.clawOutboundFrames) {
      claw.clawReturning = true;
    }
    if (!claw.clawReturning) return;

    const componentBox = this.getBossComponentBox(owner, component);
    const targetX = componentBox.x + componentBox.width / 2;
    const targetY = componentBox.y + componentBox.height * 0.72;
    const centerX = claw.x + claw.width / 2;
    const centerY = claw.y + claw.height / 2;
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const returnSpeed = (owner.projectileSpeed ?? 8.2) * 1.28;
    if (distance <= Math.max(18, returnSpeed * 1.35)) {
      claw.markedForDeletion = true;
      return;
    }
    claw.vx = (dx / distance) * returnSpeed;
    claw.vy = (dy / distance) * returnSpeed;
  }

  updatePaywallLayeredBoss(boss: Entity) {
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const playerCenterX = this.player.x + this.player.width / 2;
    const activeRays = this.entities.some((entity) => (
      entity.projectileVisualKind === 'boss-ray' && !entity.markedForDeletion
    ));
    if (boss.y < 78) {
      boss.vy = boss.configuredSpeed ?? 2;
    } else {
      boss.vy = 0;
      if (!boss.isCharging && !activeRays) {
        const targetX = playerCenterX - boss.width / 2;
        boss.x += (targetX - boss.x) * 0.012 * boss.activeBossPhaseSpeedMultiplier;
        boss.x += Math.sin(boss.attackTimer * 0.028) * 2.4 * boss.activeBossPhaseSpeedMultiplier;
      }
    }
    boss.x = clamp(boss.x, 0, this.width - boss.width);

    const cannons = (boss.bossComponents ?? []).filter((component) => (
      !component.destroyed && (component.id === 'left-cannon' || component.id === 'right-cannon')
    ));
    const helmet = boss.bossComponents?.find((component) => component.id === 'helmet');
    const coreEmitterOperational = boss.hp > 0;
    const coreExposed = Boolean(helmet?.destroyed);
    const allArmorDestroyed = (boss.bossComponents ?? []).every((component) => component.destroyed);
    const attackTempoMultiplier = boss.configuredAttackTempoMultiplier;
    const cadence = resolvePaywallBossCadence({
      healthRatio,
      allArmorDestroyed,
      coreExposed,
      attackTempoMultiplier
    });
    const hasConfiguredWeapons = boss.weaponKinds.length > 0;
    const allowsBeam = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => kind.includes('beam'));
    const allowsBurst = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => !kind.includes('beam'));
    const rayCycle = boss.attackTimer % cadence.rayCycleLength;
    boss.isCharging = allowsBeam && coreEmitterOperational
      ? (rayCycle >= cadence.rayChargeStart && rayCycle < cadence.rayFireFrame) || activeRays
      : activeRays;
    if (allowsBeam && coreEmitterOperational && rayCycle === cadence.rayChargeStart) {
      this.spawnFloatingText(boss.x + boss.width / 2, boss.y + boss.height * 0.82, 'CORE RAY CHARGING', '#fef08a', 16);
      this.playSound('boss_roar');
    }
    if (allowsBeam && coreEmitterOperational && rayCycle === cadence.rayFireFrame) {
      this.spawnPaywallBossRay(
        boss,
        healthRatio <= 0.35 || coreExposed,
        cadence.rayLifetimeFrames
      );
      boss.isCharging = true;
    }

    if (allowsBurst && !boss.isCharging && cannons.length > 0 && boss.attackTimer - boss.lastBurstAttackTimer >= cadence.boltInterval) {
      const enraged = healthRatio <= 0.38;
      cannons.forEach((component) => this.spawnPaywallBossBoltVolley(boss, component, enraged));
      boss.lastBurstAttackTimer = boss.attackTimer;
    }
    if (allowsBurst && !boss.isCharging && cannons.length === 0) {
      if (boss.attackTimer - boss.lastBurstAttackTimer >= cadence.coreInterval) {
        this.spawnBossCoreVolley(boss, 3);
        boss.lastBurstAttackTimer = boss.attackTimer;
      }
    }
  }

  updateCrownClawBoss(boss: Entity) {
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const playerCenterX = this.player.x + this.player.width / 2;
    if (boss.y < 64) {
      boss.vy = boss.configuredSpeed ?? 2;
    } else {
      boss.vy = 0;
      const targetX = playerCenterX - boss.width / 2;
      boss.x += (targetX - boss.x) * 0.009 * boss.activeBossPhaseSpeedMultiplier;
      boss.x += Math.sin(boss.attackTimer * 0.026) * 1.8 * boss.activeBossPhaseSpeedMultiplier;
    }
    boss.x = clamp(boss.x, 0, this.width - boss.width);

    const hasConfiguredWeapons = boss.weaponKinds.length > 0;
    const allowsBurst = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => !kind.includes('beam'));
    if (!allowsBurst) {
      boss.isCharging = false;
      return;
    }

    const activeClaws = (boss.bossComponents ?? []).filter((component) => !component.destroyed);
    const authoredCampaignInterval = String(boss.sourceEventId ?? '').endsWith('-major-boss')
      ? Math.max(66, Number(boss.attackIntervalFrames) || 126)
      : 126;
    const attackInterval = Math.max(
      66,
      Math.round(authoredCampaignInterval * (0.52 + healthRatio * 0.48))
    );
    const framesSinceAttack = boss.attackTimer - boss.lastBurstAttackTimer;
    boss.isCharging = activeClaws.length > 0 && framesSinceAttack >= attackInterval - 18;
    if (framesSinceAttack < attackInterval) return;

    if (activeClaws.length > 0) {
      const attackIndex = Math.floor(boss.attackTimer / attackInterval) % activeClaws.length;
      const component = activeClaws[attackIndex];
      boss.beamLaneSign = component.id === 'left-cannon' ? -1 : 1;
      this.spawnCrownClawStrike(boss, component, healthRatio <= 0.35);
    } else {
      boss.beamLaneSign = 0;
      this.spawnBossBurst(boss, 4);
    }
    boss.lastBurstAttackTimer = boss.attackTimer;
    boss.isCharging = false;
  }

  private getPreviewBossWeaponOrigins(
    boss: Entity,
    roles?: readonly BossWeaponSocketRole[]
  ) {
    if (
      (!this.previewBossWeaponSockets && !this.previewBossWeaponSocketPoseSampler)
      || boss.sourceEventId !== this.previewBossWeaponSocketEventId
    ) {
      return [];
    }
    const profile = this.previewBossWeaponSocketPoseSampler
      ? this.previewBossWeaponSocketPoseSampler(
          this.getPreviewBossWeaponSocketPoseInput(boss)
        )
      : this.previewBossWeaponSockets;
    const allowedRoles = roles ? new Set(roles) : undefined;
    return sampleBossWeaponSockets({
      profile,
      x: boss.x,
      y: boss.y,
      width: boss.width,
      height: boss.height
    })
      .filter((socket) => !allowedRoles || allowedRoles.has(socket.role))
      .map((socket) => ({
        id: socket.id,
        role: socket.role,
        x: socket.x,
        y: socket.y,
        strength: 1
      }));
  }

  private getPreviewBossWeaponOriginById(
    boss: Entity,
    socketId: string,
    fallback: Readonly<{ x: number; y: number }>
  ) {
    return this.getPreviewBossWeaponOrigins(boss)
      .find((socket) => socket.id === socketId)
      ?? fallback;
  }

  private getPreviewBossWeaponSocketPoseInput(
    boss: Entity
  ): BossWeaponSocketPoseInput {
    const actionSource = boss.bossActionPresentation;
    const actionDuration = actionSource
      ? Math.max(1, actionSource.endFrame - actionSource.startFrame)
      : 1;
    const actionProgress = actionSource
      ? Math.max(
          0,
          Math.min(
            1,
            (boss.attackTimer - actionSource.startFrame) / actionDuration
          )
        )
      : undefined;
    const action = actionSource
      ? {
          primitiveId: actionSource.primitiveId,
          stage: actionSource.stage,
          progress: actionProgress,
          side: actionSource.side ?? actionSource.handedness,
          sequence: actionSource.sequence,
          motionCue: actionSource.motionCue,
          elapsedFrames: Math.max(0, boss.attackTimer - actionSource.startFrame),
          framesPerSecond: GAME_CONFIG.FPS,
          projectileCount: actionSource.projectileCount
        }
      : undefined;
    const targetEntranceY = Math.max(72, Math.min(this.height * 0.13, 116));
    const entranceProgress = clamp(
      (boss.y + boss.height) / Math.max(1, targetEntranceY + boss.height),
      0,
      1
    );
    const reactionAge = this.frameCount - boss.bossSignificantImpactFrame;
    const reaction = reactionAge >= 0 && reactionAge < BOSS_SIGNIFICANT_REACTION_FRAMES
      ? {
          kind: boss.bossSignificantImpactIsComponent ? 'stagger' as const : 'impact' as const,
          progress: reactionAge / Math.max(1, BOSS_SIGNIFICANT_REACTION_FRAMES - 1),
          direction: boss.bossSignificantImpactXRatio < 0.5 ? 1 as const : -1 as const,
          strength: boss.bossSignificantImpactStrength
        }
      : undefined;
    return {
      frameCount: this.frameCount,
      reducedMotion: this.previewBossReducedMotion,
      healthRatio: boss.hp / Math.max(1, boss.maxHp),
      phaseIndex: Math.max(1, boss.activeBossPhaseIndex + 1),
      entranceProgress,
      damageStage: boss.bossDecayStage,
      phaseProgress: action?.stage === 'phase-enter' ? action.progress : undefined,
      revivalStage: boss.bossRevivalStage,
      revivalProgress: boss.bossRevivalProgress,
      revived: boss.bossRevivalConsumed,
      reaction,
      action
    };
  }

  private getBossActionDisplayLabel(boss: Entity, fallback: string) {
    const authoredLabel = boss.bossActionPresentation?.label?.trim();
    return (authoredLabel || fallback).toUpperCase();
  }

  private clearBossTimelineActionLocks(boss: Entity) {
    if (this.isSandboxFrontierCrownclaw(boss)) {
      this.clearFrontierCrownclawRuntime(boss);
    }
    boss.bossAttackOriginLocks = clearBossAttackOriginLocks();
    boss.bossGatlingAttackLock = undefined;
    boss.bossTimelineTargetClipId = undefined;
    boss.bossTimelineTargetExecutionIndex = -1;
    boss.bossTimelineTargetX = null;
    boss.bossTimelineTargetY = null;
    boss.bossCrossBeamOriginX = null;
    boss.bossCrossBeamOriginY = null;
    boss.bossHeliosMineFormationState = undefined;
  }

  private captureBossTimelineActionOrigins(
    boss: Entity,
    clipId: string,
    executionIndex: number,
    origins: readonly BossAttackOriginPoint[]
  ) {
    boss.bossAttackOriginLocks = captureBossAttackOriginLock(
      boss.bossAttackOriginLocks,
      clipId,
      executionIndex,
      origins
    );
  }

  private consumeBossTimelineActionOrigins(
    boss: Entity,
    clipId: string,
    executionIndex: number
  ) {
    const consumed = consumeBossAttackOriginLock(
      boss.bossAttackOriginLocks,
      clipId,
      executionIndex
    );
    boss.bossAttackOriginLocks = consumed.remaining;
    return consumed.lock?.origins;
  }

  spawnBossCrossBeamPair(
    boss: Entity,
    telegraph: boolean,
    authoredLifetimeFrames?: number
  ) {
    if (!telegraph) {
      for (const entity of this.entities) {
        if (entity.isBeam && entity.isTelegraph && entity.bossOwnerId === boss.id) {
          entity.markedForDeletion = true;
        }
      }
    }

    const thickness = telegraph ? 9 : 20;
    // The warning must last through the exact authored lead. A fixed 46-frame
    // guide left a blind interval on longer benchmark attacks.
    const lifetime = telegraph
      ? Math.max(1, Math.floor(authoredLifetimeFrames ?? 46))
      : 26;
    const color = telegraph ? '#ef4444' : '#22d3ee';
    const coreOrigin = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
    const currentOriginX = coreOrigin?.x ?? boss.x + boss.width / 2;
    const currentOriginY = coreOrigin?.y ?? boss.y + boss.height / 2;
    if (telegraph) {
      boss.bossCrossBeamOriginX = currentOriginX;
      boss.bossCrossBeamOriginY = currentOriginY;
    }
    const originX = !telegraph && Number.isFinite(boss.bossCrossBeamOriginX)
      ? Number(boss.bossCrossBeamOriginX)
      : currentOriginX;
    const originY = !telegraph && Number.isFinite(boss.bossCrossBeamOriginY)
      ? Number(boss.bossCrossBeamOriginY)
      : currentOriginY;
    const createBeam = (axis: 'vertical' | 'horizontal') => {
      const beam = this.createEntity(
        EntityType.PROJECTILE,
        axis === 'vertical' ? originX - thickness / 2 : 0,
        axis === 'horizontal' ? originY - thickness / 2 : 0
      );
      beam.isBeam = true;
      beam.isDetachedBeam = true;
      beam.beamAxis = axis;
      beam.beamFromCenter = false;
      beam.isTelegraph = telegraph;
      beam.bossOwnerId = boss.id;
      beam.width = axis === 'vertical' ? thickness : this.width;
      beam.height = axis === 'horizontal' ? thickness : this.height;
      beam.life = lifetime;
      beam.maxLife = lifetime;
      beam.color = color;
      beam.damage = telegraph ? 0 : Math.max(1, Number(boss.projectileDamage) || 1);
      this.entities.push(beam);
    };

    createBeam('vertical');
    createBeam('horizontal');
    if (!telegraph) {
      boss.bossCrossBeamOriginX = null;
      boss.bossCrossBeamOriginY = null;
    }
    if (telegraph) {
      this.spawnFloatingText(
        originX,
        boss.y + boss.height + 8,
        `${this.getBossActionDisplayLabel(boss, 'Cross-link')} CHARGING`,
        '#fca5a5',
        15
      );
    } else {
      this.playSound('electricity');
      this.playSound('boss_shoot', 1.18, { pitchJitter: 0.03, pitchOffset: 0.08 });
      this.addShake(2.6);
      this.addHitStop(3);
    }
  }

  getGeneratedBossWeaponOrigins(boss: Entity) {
    const cannonComponents = (boss.bossComponents ?? []).filter((component) => (
      component.id === 'left-cannon' || component.id === 'right-cannon'
    ));
    const activeCannons = cannonComponents.filter((component) => !component.destroyed);
    if (activeCannons.length > 0) {
      return activeCannons.map((component) => {
        const box = this.getBossComponentBox(boss, component);
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height * 0.72,
          strength: 1
        };
      });
    }
    const authoredOrigins = this.getPreviewBossWeaponOrigins(boss, ['port', 'starboard']);
    if (authoredOrigins.length > 0) return authoredOrigins;
    return [{
      x: boss.x + boss.width / 2,
      y: boss.y + boss.height * 0.64,
      strength: cannonComponents.length > 0 ? 0.46 : 1
    }];
  }

  spawnGeneratedBossProjectile(
    boss: Entity,
    x: number,
    y: number,
    angle: number,
    speed: number,
    color: string,
    size: number,
    variant: number
  ) {
    const projectile = this.createEntity(EntityType.PROJECTILE, x - size / 2, y - size / 2);
    projectile.vx = Math.cos(angle) * speed;
    projectile.vy = Math.sin(angle) * speed;
    projectile.width = size;
    projectile.height = size;
    projectile.color = color;
    projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    projectile.variant = variant;
    projectile.bossOwnerId = boss.id;
    projectile.projectileVisualKind = resolveBossPixelProjectileVisualKind(color);
    projectile.weaponVisualStartFrame = this.frameCount;
    this.entities.push(projectile);
    return projectile;
  }

  /**
   * Campaign major bosses author `burstCount` as their per-technique density
   * budget. Compatibility archetypes previously ignored it and always emitted
   * their hard-coded maximum patterns, which let Prism Moth accumulate nearly
   * 200 hostile projectiles on a phone. Sandbox/preview encounters keep their
   * bespoke defaults; only authored Campaign `*-major-boss` events are capped.
   */
  getCampaignGeneratedBossProjectileBudget(boss: Entity, fallbackCount: number) {
    if (!String(boss.sourceEventId ?? '').endsWith('-major-boss')) return undefined;
    const authoredBurstCount = Number(boss.configuredBurstCount);
    if (!Number.isFinite(authoredBurstCount) || authoredBurstCount <= 0) return undefined;
    const authoredBudget = Math.max(
      4,
      Math.min(
        MAX_GENERATED_BOSS_PROJECTILES_PER_CUE,
        Math.floor(authoredBurstCount) * 3
      )
    );
    return Math.max(1, Math.min(Math.round(fallbackCount), authoredBudget));
  }

  showBossWeaveWallSafeChannel(boss: Entity, sequence: number, warningFrames: number) {
    const layout = resolveBossWeaveWallLayout(this.width, this.mobileProfile, sequence);
    const coreOrigin = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
    const projectorX = coreOrigin?.x ?? boss.x + boss.width / 2;
    const projectorY = coreOrigin?.y ?? boss.y + boss.height * 0.62;
    this.spawnRingEffect(projectorX, projectorY, '#67e8f9');
    for (const coordinate of [layout.safeGapLeftX, layout.safeGapRightX]) {
      const boundary = this.spawnEnemyLaneLaser(
        boss.id,
        'vertical',
        coordinate,
        0,
        true,
        warningFrames
      );
      boundary.color = '#67e8f9';
    }
    this.spawnFloatingText(
      layout.safeGapCenterX,
      Math.max(78, boss.y + boss.height),
      'SAFE CHANNEL',
      '#67e8f9',
      this.mobileProfile ? 13 : 17
    );
    this.playSound('siren', 0.62);
  }

  spawnBossPodVolley(boss: Entity, sequence: number, projectileCount?: number) {
    const requestedCount = Number(projectileCount);
    const count = Math.max(
      1,
      Math.min(
        MAX_GENERATED_BOSS_PROJECTILES_PER_CUE,
        Math.round(
          Number.isFinite(requestedCount)
            ? requestedCount
            : (this.mobileProfile ? 4 : 6)
        )
      )
    );
    const origins = this.getGeneratedBossWeaponOrigins(boss);
    const playerX = this.player.x + this.player.width / 2;
    const playerY = this.player.y + this.player.height / 2;
    const size = this.mobileProfile ? 28 : 36;
    const speed = Math.min(
      this.mobileProfile ? 4.8 : 5.4,
      Math.max(3.5, (Number(boss.projectileSpeed) || 6.6) * 0.68)
    );
    const sequenceBias = ((sequence % 5) - 2) * 0.035;

    for (let index = 0; index < count; index += 1) {
      const origin = origins[index % origins.length];
      const baseAngle = Math.atan2(playerY - origin.y, playerX - origin.x);
      const spreadRatio = count <= 1 ? 0 : (index / (count - 1)) - 0.5;
      const projectile = this.spawnGeneratedBossProjectile(
        boss,
        origin.x,
        origin.y,
        baseAngle + sequenceBias + spreadRatio * 0.86,
        speed,
        index % 2 === 0 ? '#ff9d2e' : '#67e8f9',
        size,
        sequence * 100 + index
      );
      projectile.projectileVisualKind = 'boss-pod';
      projectile.bossPodSide = resolveBossPodSide(sequence, index);
      projectile.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
    }
    this.playSound('boss_shoot', 0.82, { pitchJitter: 0.03, pitchOffset: -0.18 });
  }

  spawnBossWeaveWall(boss: Entity, sequence: number, projectileCount?: number) {
    for (const entity of this.entities) {
      if (entity.isTelegraph && entity.bossOwnerId === boss.id) {
        entity.markedForDeletion = true;
      }
    }
    const layout = resolveBossWeaveWallLayout(this.width, this.mobileProfile, sequence);
    const defaultCount = (layout.laneCount - 2) * (this.mobileProfile ? 2 : 3);
    const slots = buildBossWeaveWallSlots(
      layout,
      projectileCount ?? defaultCount,
      sequence
    );
    const rowSpacing = this.mobileProfile ? 38 : 52;
    const originY = Math.max(18, boss.y + boss.height * 0.62);
    const coreOrigin = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
    this.spawnRingEffect(
      coreOrigin?.x ?? boss.x + boss.width / 2,
      coreOrigin?.y ?? originY,
      '#67e8f9'
    );
    const size = Math.max(12, Math.min(this.mobileProfile ? 20 : 24, layout.laneWidth * 0.46));
    const speed = Math.min(
      this.mobileProfile ? 5.1 : 5.8,
      Math.max(3.8, (Number(boss.projectileSpeed) || 6.8) * 0.72)
    );

    for (const slot of slots) {
      this.spawnGeneratedBossProjectile(
        boss,
        slot.x,
        originY - slot.rowIndex * rowSpacing,
        Math.PI / 2,
        speed,
        (slot.rowIndex + slot.laneIndex) % 2 === 0 ? '#fb7185' : '#fbbf24',
        size,
        slot.variant
      );
    }
    this.playSound('boss_shoot', 0.94, { pitchJitter: 0.02, pitchOffset: -0.08 });
  }

  getSweepingRailCoordinate(sequence: number) {
    const laneCount = this.mobileProfile ? 4 : 5;
    const sweepLength = Math.max(1, (laneCount - 1) * 2);
    const sweepIndex = ((sequence % sweepLength) + sweepLength) % sweepLength;
    const laneIndex = sweepIndex < laneCount
      ? sweepIndex
      : sweepLength - sweepIndex;
    const margin = this.mobileProfile ? 22 : 34;
    return margin + ((this.width - margin * 2) * laneIndex) / Math.max(1, laneCount - 1);
  }

  spawnBossRailSweep(boss: Entity, sequence: number, telegraph: boolean) {
    if (!telegraph) {
      for (const entity of this.entities) {
        if (entity.isTelegraph && entity.bossOwnerId === boss.id) entity.markedForDeletion = true;
      }
    }
    const coordinate = this.getSweepingRailCoordinate(sequence);
    const beam = this.spawnEnemyLaneLaser(
      boss.id,
      'vertical',
      coordinate,
      Math.max(1, Number(boss.projectileDamage) || 1),
      telegraph,
      telegraph ? 38 : 30
    );
    beam.color = telegraph ? '#ff3b30' : '#ff1744';
    if (telegraph) {
      this.spawnFloatingText(coordinate, Math.max(88, boss.y + boss.height), 'RAIL SWEEP', '#fca5a5', 15);
      this.playSound('siren', 0.62);
      return;
    }
    this.playSound('electricity');
    this.playSound('boss_shoot', 1.28, { pitchJitter: 0.02, pitchOffset: -0.16 });
    this.addShake(2.8);
    this.addHitStop(3);
  }

  spawnGeneratedBossTechniqueWarning(boss: Entity, cue: GeneratedBossTechniqueCue) {
    const bossCenterX = boss.x + boss.width / 2;
    const bossCenterY = boss.y + boss.height * 0.56;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    const singularityTarget = cue.technique === 'singularity-telegraph'
      ? getBossInwardCollapseTarget(playerCenterX, playerCenterY, cue.sequence, this.width, this.height)
      : null;
    if (singularityTarget) {
      boss.generatedBossTargetX = singularityTarget.x;
      boss.generatedBossTargetY = singularityTarget.y;
      boss.generatedBossTargetSequence = cue.sequence;
    }
    const warning = (() => {
      switch (cue.technique) {
        case 'rail-tail-telegraph':
          return { x: bossCenterX, y: boss.y + boss.height * 0.84, color: '#fb7185', label: 'TAIL FAN CHARGING' };
        case 'prism-telegraph':
          return { x: bossCenterX, y: bossCenterY, color: '#67e8f9', label: 'PRISM GAP FORMING' };
        case 'singularity-telegraph':
          return {
            x: singularityTarget?.x ?? playerCenterX,
            y: singularityTarget?.y ?? playerCenterY,
            color: '#c084fc',
            label: 'GRAVITY WELL MARKED'
          };
        case 'orbit-telegraph':
          return { x: bossCenterX, y: bossCenterY, color: '#38bdf8', label: 'ORBIT CROSS CHARGING' };
        case 'helix-left-telegraph':
          return { x: boss.x + boss.width * 0.28, y: bossCenterY, color: '#f0abfc', label: 'LEFT HELIX COILING' };
        case 'helix-right-telegraph':
          return { x: boss.x + boss.width * 0.72, y: bossCenterY, color: '#f0abfc', label: 'RIGHT HELIX COILING' };
        case 'hammerhead-port-telegraph':
          return { x: boss.x + boss.width * 0.2, y: bossCenterY, color: '#fb7185', label: 'PORT BATTERY CHARGING' };
        case 'hammerhead-starboard-telegraph':
          return { x: boss.x + boss.width * 0.8, y: bossCenterY, color: '#fdba74', label: 'STARBOARD BATTERY CHARGING' };
        case 'eclipse-telegraph':
          return { x: bossCenterX, y: bossCenterY, color: '#a855f7', label: 'ECLIPSE APERTURE OPENING' };
        default:
          return null;
      }
    })();
    if (!warning) return;

    boss.generatedBossChargeUntilTimer = Math.max(
      boss.generatedBossChargeUntilTimer,
      boss.attackTimer + Math.max(1, cue.warningFrames)
    );
    boss.isCharging = true;
    this.spawnRingEffect(warning.x, warning.y, warning.color);
    this.spawnFloatingText(warning.x, warning.y + 28, warning.label, warning.color, 14);
    this.playSound('siren', 0.42, { pitchJitter: 0.02, pitchOffset: -0.08 });
  }

  spawnBossTailFan(boss: Entity, sequence: number, projectileCount?: number) {
    const originX = boss.x + boss.width / 2;
    const originY = boss.y + boss.height * 0.84;
    const playerX = this.player.x + this.player.width / 2;
    const playerY = this.player.y + this.player.height / 2;
    const baseAngle = Math.atan2(playerY - originY, playerX - originX) + Math.sin(sequence * 1.37) * 0.035;
    const shotCount = Math.max(1, Math.min(24, Math.round(projectileCount ?? 5)));
    const speed = Math.min(6.1, Math.max(3.8, Number(boss.projectileSpeed) || 5.2) * 0.68);
    for (let index = 0; index < shotCount; index++) {
      const offset = index - (shotCount - 1) / 2;
      this.spawnGeneratedBossProjectile(
        boss,
        originX,
        originY,
        baseAngle + offset * 0.15,
        speed * (1 - Math.abs(offset) * 0.025),
        index % 2 === 0 ? '#fb7185' : '#f97316',
        12,
        index
      );
    }
    this.spawnRingEffect(originX, originY, '#fb7185');
    this.spawnFloatingText(originX, originY + 24, 'TAIL FAN', '#fda4af', 14);
    this.playSound('boss_shoot', 0.9, { pitchJitter: 0.04, pitchOffset: -0.12 });
  }

  spawnBossSafeGapRing(
    boss: Entity,
    sequence: number,
    phase: number,
    darkPulse: boolean,
    projectileCount?: number,
    directionPolicy?: BossGapRouteDirectionPolicy,
    lockedOrigin?: BossAttackOriginPoint
  ) {
    const coreOrigin = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
    const originX = lockedOrigin?.x ?? coreOrigin?.x ?? boss.x + boss.width / 2;
    const originY = lockedOrigin?.y ?? coreOrigin?.y ?? boss.y + boss.height * 0.62;
    const requestedCount = projectileCount ?? ((this.mobileProfile ? 14 : 18) + phase * 2);
    const shotCount = Math.min(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, requestedCount);
    const direction = resolveBossGapRouteDirection(directionPolicy, sequence);
    const route = resolveBossGapRoute({
      arenaWidth: this.width,
      arenaHeight: this.height,
      originX,
      originY,
      sequence,
      direction
    });
    const gapAngle = darkPulse
      ? sequence * 0.47 + phase * 0.11
      : route.angleRadians;
    const gapHalfWidth = darkPulse ? 0.29 : this.mobileProfile ? 0.5 : 0.42;
    const speed = Math.min(7.2, Math.max(3.8, Number(boss.projectileSpeed) || 5.2) * 0.72);

    for (let index = 0; index < shotCount; index++) {
      const angle = (Math.PI * 2 * index) / shotCount;
      const firstGapDistance = Math.abs(Math.atan2(
        Math.sin(angle - gapAngle),
        Math.cos(angle - gapAngle)
      ));
      const oppositeGapDistance = Math.abs(Math.atan2(
        Math.sin(angle - gapAngle - Math.PI),
        Math.cos(angle - gapAngle - Math.PI)
      ));
      if (firstGapDistance < gapHalfWidth || (darkPulse && oppositeGapDistance < gapHalfWidth)) continue;
      const color = darkPulse
        ? (index % 2 === 0 ? '#7c3aed' : '#c026d3')
        : (index % 2 === 0 ? '#22d3ee' : '#c084fc');
      const projectile = this.spawnGeneratedBossProjectile(
        boss,
        originX,
        originY,
        angle,
        speed,
        color,
        darkPulse ? 14 : 12,
        index
      );
      if (
        !darkPulse
        && this.supportsPreviewBossProjectileVisualKind(boss, 'boss-reactor-pellet')
      ) {
        projectile.projectileVisualKind = 'boss-reactor-pellet';
      }
    }

    if (!darkPulse) {
      for (const entity of this.entities) {
        if (entity.isBossGapGuide && entity.bossOwnerId === boss.id) {
          entity.markedForDeletion = true;
        }
      }
    }

    this.spawnRingEffect(originX, originY, darkPulse ? '#7c3aed' : '#67e8f9');
    const suppressAuthoredHeliosLabel = this.isSelectedPreviewBoss(boss)
      && boss.bossActionPresentation?.primitiveId === 'reactor-aperture-pattern';
    if (!suppressAuthoredHeliosLabel) {
      this.spawnFloatingText(
        originX,
        boss.y + boss.height + 8,
        this.getBossActionDisplayLabel(
          boss,
          darkPulse ? 'Eclipse pulse' : 'Prism safe gap'
        ),
        darkPulse ? '#d8b4fe' : '#a5f3fc',
        15
      );
    }
    this.playSound('boss_shoot', darkPulse ? 0.84 : 1.16, {
      pitchJitter: 0.03,
      pitchOffset: darkPulse ? -0.22 : 0.08
    });
  }

  spawnBossInwardCollapse(boss: Entity, sequence: number, phase: number, projectileCount?: number) {
    const fallbackTarget = getBossInwardCollapseTarget(
      this.player.x + this.player.width / 2,
      this.player.y + this.player.height / 2,
      sequence,
      this.width,
      this.height
    );
    const hasLockedTarget = boss.generatedBossTargetSequence === sequence
      && Number.isFinite(boss.generatedBossTargetX)
      && Number.isFinite(boss.generatedBossTargetY);
    const targetX = hasLockedTarget ? Number(boss.generatedBossTargetX) : fallbackTarget.x;
    const targetY = hasLockedTarget ? Number(boss.generatedBossTargetY) : fallbackTarget.y;
    boss.generatedBossTargetX = null;
    boss.generatedBossTargetY = null;
    boss.generatedBossTargetSequence = -1;
    const requestedCount = projectileCount ?? ((this.mobileProfile ? 10 : 14) + phase * 2);
    const shotCount = Math.min(20, requestedCount);
    const radiusX = Math.max(90, this.width * 0.43);
    const radiusY = Math.max(150, Math.min(this.height * 0.36, 310));
    const speed = Math.min(7.4, Math.max(4.2, Number(boss.projectileSpeed) || 5.8) * 0.76);

    for (let index = 0; index < shotCount; index++) {
      const angle = (Math.PI * 2 * index) / shotCount + sequence * 0.19;
      const originX = clamp(targetX + Math.cos(angle) * radiusX, 10, this.width - 10);
      const originY = clamp(targetY + Math.sin(angle) * radiusY, 12, this.height - 12);
      const inwardAngle = Math.atan2(targetY - originY, targetX - originX);
      this.spawnGeneratedBossProjectile(
        boss,
        originX,
        originY,
        inwardAngle,
        speed,
        index % 2 === 0 ? '#8b5cf6' : '#4338ca',
        13,
        index
      );
    }

    this.spawnRingEffect(targetX, targetY, '#8b5cf6');
    this.spawnFloatingText(
      targetX,
      targetY - 28,
      this.getBossActionDisplayLabel(boss, 'Gravity collapse'),
      '#c4b5fd',
      15
    );
    this.playSound('boss_roar', 0.82);
  }

  spawnBossRotatingCross(boss: Entity, sequence: number, phase: number, projectileCount?: number) {
    const coreOrigin = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
    const originX = coreOrigin?.x ?? boss.x + boss.width / 2;
    const originY = coreOrigin?.y ?? boss.y + boss.height * 0.62;
    const baseAngle = sequence * (Math.PI / 10);
    const layers = projectileCount === undefined
      ? (phase >= 2 ? 2 : 1)
      : Math.max(1, Math.min(6, Math.ceil(projectileCount / 4)));
    const maximumProjectiles = projectileCount === undefined
      ? layers * 4
      : Math.max(1, Math.min(24, Math.round(projectileCount)));
    const baseSpeed = Math.min(8, Math.max(4.8, Number(boss.projectileSpeed) || 6.2) * 0.82);
    let variant = 0;
    for (let layer = 0; layer < layers; layer++) {
      for (let arm = 0; arm < 4; arm++) {
        if (variant >= maximumProjectiles) break;
        const angle = baseAngle + arm * (Math.PI / 2);
        this.spawnGeneratedBossProjectile(
          boss,
          originX,
          originY,
          angle,
          baseSpeed * (1 + layer * 0.22),
          layer === 0 ? '#22d3ee' : '#f0abfc',
          layer === 0 ? 14 : 11,
          variant++
        );
      }
    }
    this.spawnRingEffect(originX, originY, '#22d3ee');
    this.spawnFloatingText(
      originX,
      boss.y + boss.height + 8,
      this.getBossActionDisplayLabel(boss, 'Orbit cross'),
      '#a5f3fc',
      15
    );
    this.playSound('electricity', 0.92);
  }

  spawnBossHelixVolley(
    boss: Entity,
    sequence: number,
    phase: number,
    leftHanded: boolean,
    projectileCount?: number
  ) {
    const origins = this.getGeneratedBossWeaponOrigins(boss);
    const strength = Math.max(...origins.map((origin) => origin.strength));
    const defaultProjectileCount = Math.max(
      4,
      Math.min(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, Math.round((4 + phase * 2) * strength))
    );
    const maximumProjectiles = projectileCount === undefined
      ? defaultProjectileCount
      : Math.max(
        1,
        Math.min(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, Math.round(projectileCount))
      );
    const pairCount = Math.max(1, Math.ceil(maximumProjectiles / 2));
    const speed = Math.min(9, Math.max(5.2, Number(boss.projectileSpeed) || 6.8) * 0.86);
    const hand = leftHanded ? -1 : 1;
    const phaseDrift = ((sequence % 5) - 2) * 0.045 * hand;
    let variant = 0;

    for (let pair = 0; pair < pairCount; pair++) {
      const spread = 0.08 + pair * 0.075;
      for (const direction of [-1, 1]) {
        if (variant >= maximumProjectiles) break;
        const origin = origins[variant % origins.length];
        const angle = Math.PI / 2 + phaseDrift + direction * spread * hand;
        this.spawnGeneratedBossProjectile(
          boss,
          origin.x,
          origin.y,
          angle,
          speed * (1 + pair * 0.035),
          direction === hand ? '#22d3ee' : '#ec4899',
          pair === 0 ? 14 : 11,
          variant++
        );
      }
    }
    this.spawnFloatingText(
      boss.x + boss.width / 2,
      boss.y + boss.height + 8,
      this.getBossActionDisplayLabel(
        boss,
        leftHanded ? 'Helix left' : 'Helix right'
      ),
      '#f0abfc',
      15
    );
    this.playSound('boss_shoot', leftHanded ? 0.96 : 1.08, { pitchJitter: 0.02 });
  }

  private getBossSideBarrageOrigins(
    boss: Entity,
    side: 'port' | 'starboard'
  ) {
    const componentId: BossPartId = side === 'port' ? 'left-cannon' : 'right-cannon';
    const cannonComponents = (boss.bossComponents ?? []).filter((component) => (
      component.id === 'left-cannon' || component.id === 'right-cannon'
    ));
    const allCannonsDestroyed = cannonComponents.length > 0
      && cannonComponents.every((component) => component.destroyed);
    const requestedComponent = cannonComponents.find((candidate) => candidate.id === componentId);
    const independentRotary = boss.bossActionPresentation?.motionCue === 'gatling-barrage';
    const component = independentRotary
      ? undefined
      : requestedComponent?.destroyed
        ? cannonComponents.find((candidate) => !candidate.destroyed)
        : requestedComponent;
    const resolvedSide = independentRotary
      ? side
      : component?.id === 'left-cannon'
        ? 'port'
        : component?.id === 'right-cannon'
          ? 'starboard'
          : side;
    const authoredOrigins = this.getPreviewBossWeaponOrigins(boss, [resolvedSide]);
    const box = component ? this.getBossComponentBox(boss, component) : null;
    const origins = authoredOrigins.length > 0
      ? authoredOrigins
      : box
      ? [{ x: box.x + box.width / 2, y: box.y + box.height * 0.72, strength: 1 }]
      : [{
          x: boss.x + boss.width * (resolvedSide === 'port' ? 0.2 : 0.8),
          y: boss.y + boss.height * 0.64,
          strength: 1
        }];
    return { allCannonsDestroyed, resolvedSide, origins };
  }

  private supportsPreviewBossProjectileVisualKind(
    boss: Entity,
    kind: BossModularProjectileVisualKind
  ) {
    return (
      this.previewMode
      && boss.sourceEventId === this.previewBossWeaponSocketEventId
      && this.previewBossProjectileVisualKinds.has(kind)
    );
  }

  spawnBossSideBarrage(
    boss: Entity,
    phase: number,
    side: 'port' | 'starboard',
    projectileCount?: number,
    motionCue?: BossTimelineMotionCue,
    lockedTarget?: { x: number; y: number },
    lockedOrigins?: readonly BossAttackOriginPoint[]
  ) {
    const liveOriginState = this.getBossSideBarrageOrigins(boss, side);
    const {
      allCannonsDestroyed,
      resolvedSide,
      origins
    } = lockedOrigins && lockedOrigins.length > 0
      ? {
          allCannonsDestroyed: false,
          resolvedSide: side,
          origins: lockedOrigins
        }
      : liveOriginState;
    if (allCannonsDestroyed || motionCue === 'gatling-barrage') {
      if (boss.bossActionPresentation) {
        boss.bossActionPresentation.motionCue = 'gatling-barrage';
      }
      return;
    }
    const playerX = lockedTarget?.x ?? this.player.x + this.player.width / 2;
    const playerY = lockedTarget?.y ?? this.player.y + this.player.height / 2;
    for (const entity of this.entities) {
      if (entity.isBossSideBarrageGuide && entity.bossOwnerId === boss.id) {
        entity.markedForDeletion = true;
      }
    }
    const requestedShots = projectileCount ?? Math.min(8, 4 + phase);
    const heavyCannon = motionCue === 'heavy-cannon';
    const shotCount = heavyCannon
      ? Math.max(2, Math.min(5, Math.ceil(requestedShots / 2)))
      : Math.max(1, Math.min(24, Math.round(requestedShots)));
    const speed = heavyCannon
      ? Math.min(6.4, Math.max(4.2, Number(boss.projectileSpeed) || 5.2) * 0.68)
      : Math.min(9.4, Math.max(5.4, Number(boss.projectileSpeed) || 7) * 0.9);
    for (let index = 0; index < shotCount; index++) {
      const origin = origins[index % origins.length];
      const offset = index - (shotCount - 1) / 2;
      const baseAngle = Math.atan2(playerY - origin.y, playerX - origin.x);
      const projectile = this.spawnGeneratedBossProjectile(
        boss,
        origin.x,
        origin.y,
        baseAngle + offset * (heavyCannon ? 0.16 : 0.115),
        speed * (1 + Math.abs(offset) * 0.018),
        resolvedSide === 'port' ? '#fb7185' : '#facc15',
        heavyCannon ? 24 : 14,
        index
      );
      if (
        heavyCannon
        && this.supportsPreviewBossProjectileVisualKind(boss, 'boss-heavy-shell')
      ) {
        projectile.projectileVisualKind = 'boss-heavy-shell';
      }
    }

    const labelOrigin = origins[Math.floor((origins.length - 1) / 2)];
    this.spawnFloatingText(
      labelOrigin.x,
      labelOrigin.y + 24,
      this.getBossActionDisplayLabel(
        boss,
        heavyCannon
          ? `${resolvedSide} heavy cannon`
          : `${resolvedSide} barrage`
      ),
      resolvedSide === 'port' ? '#fda4af' : '#fde68a',
      15
    );
    this.playSound(
      heavyCannon ? 'boss_cannon' : 'boss_shoot',
      heavyCannon ? 1.15 : resolvedSide === 'port' ? 0.92 : 1.06,
      { pitchJitter: heavyCannon ? 0.025 : 0.05, pitchOffset: heavyCannon ? -0.12 : 0 }
    );
  }

  private spawnBossGatlingPulse(
    boss: Entity,
    action: BossActionPresentationState
  ) {
    const lock = boss.bossGatlingAttackLock;
    if (
      !lock
      || lock.actionClipId !== action.actionClipId
      || lock.executionIndex !== action.executionIndex
    ) {
      return;
    }
    const elapsedFrames = boss.attackTimer - action.startFrame;
    const intervalFrames = this.mobileProfile ? 7 : 5;
    if (elapsedFrames < 0 || elapsedFrames % intervalFrames !== 0) return;
    const pulseIndex = Math.floor(elapsedFrames / intervalFrames);
    const pulseCount = Math.max(4, Math.min(10, Math.floor(action.projectileCount ?? 7)));
    if (pulseIndex >= pulseCount) return;

    const leftSide = pulseIndex % 2 === 0;
    const sideOrigins = leftSide ? lock.portOrigins : lock.starboardOrigins;
    if (sideOrigins.length === 0) return;
    const origin = sideOrigins[pulseIndex % sideOrigins.length];
    const originX = origin.x;
    const originY = origin.y;
    const targetX = lock.targetX;
    const targetY = lock.targetY;
    const baseAngle = Math.atan2(targetY - originY, targetX - originX);
    const deterministicKick = ((pulseIndex % 5) - 2) * 0.018;
    const projectile = this.spawnGeneratedBossProjectile(
      boss,
      originX,
      originY,
      baseAngle + deterministicKick,
      Math.min(10.2, Math.max(7.4, Number(boss.projectileSpeed) || 8.4)),
      pulseIndex % 3 === 0 ? '#fb7185' : '#facc15',
      9,
      pulseIndex
    );
    if (this.supportsPreviewBossProjectileVisualKind(boss, 'boss-gatling-tracer')) {
      projectile.projectileVisualKind = 'boss-gatling-tracer';
    }
    if (pulseIndex === 0) {
      this.spawnFloatingText(
        boss.x + boss.width / 2,
        boss.y + boss.height + 8,
        'INNER GATLINGS',
        '#fde68a',
        15
      );
    }
    this.playSound('boss_machinegun', 0.52, {
      pitchJitter: 0.035,
      pitchOffset: leftSide ? -0.04 : 0.04
    });
  }

  updateGeneratedBossMovement(
    boss: Entity,
    archetype: GeneratedBossArchetype,
    healthRatio: number
  ) {
    const targetEntranceY = Math.max(64, Math.min(this.height * 0.12, 106));
    if (boss.y < targetEntranceY) {
      boss.y += Math.max(1.4, boss.configuredSpeed ?? 2);
      boss.x += ((this.width - boss.width) / 2 - boss.x) * 0.06;
      return false;
    }

    boss.vx = 0;
    boss.vy = 0;
    const pressure = 1 - clamp(healthRatio, 0, 1);
    const centerX = (this.width - boss.width) / 2;
    const horizontalRadius = Math.max(22, Math.min(this.width * 0.31, (this.width - boss.width - 24) / 2));
    const verticalRadius = Math.max(18, Math.min(58, this.height * 0.07));
    const t = boss.attackTimer;
    let targetX = centerX;
    let targetY = targetEntranceY + verticalRadius * 0.42;

    if (archetype === 'rail-serpent') {
      targetX += Math.sin(t * 0.014) * horizontalRadius;
      targetY += Math.sin(t * 0.028) * verticalRadius * 0.28;
    } else if (archetype === 'prism-moth') {
      targetX += Math.sin(t * 0.018) * horizontalRadius * 0.86;
      targetY += Math.sin(t * 0.036) * verticalRadius * 0.72;
    } else if (archetype === 'singularity-crab') {
      targetX += Math.sin(t * 0.009) * horizontalRadius * 0.38;
      targetY += Math.cos(t * 0.012) * verticalRadius * 0.34;
    } else if (archetype === 'orbit-gyroscope') {
      targetX += Math.cos(t * 0.021) * horizontalRadius * 0.82;
      targetY += Math.sin(t * 0.021) * verticalRadius;
    } else if (archetype === 'helix-leviathan') {
      targetX += Math.sin(t * 0.017) * horizontalRadius * 0.68;
      targetY += Math.sin(t * 0.034) * verticalRadius * 0.88;
    } else if (archetype === 'hammerhead-siege') {
      targetX += Math.sin(t * 0.012) * horizontalRadius;
      targetY += Math.cos(t * 0.018) * verticalRadius * 0.22;
    } else if (archetype === 'eclipse-engine') {
      targetX += Math.sin(t * 0.008) * horizontalRadius * 0.52;
      targetY += Math.cos(t * 0.015) * verticalRadius * 0.55;
    } else {
      targetX += Math.sin(t * 0.014) * horizontalRadius * 0.9;
      targetY += Math.sin(t * 0.023) * verticalRadius * 0.76;
    }

    const followRate = (0.028 + pressure * 0.012) * boss.activeBossPhaseSpeedMultiplier;
    boss.x += (targetX - boss.x) * followRate;
    boss.y += (targetY - boss.y) * followRate;
    boss.x = clamp(boss.x, 10, Math.max(10, this.width - boss.width - 10));
    boss.y = clamp(
      boss.y,
      targetEntranceY,
      Math.max(targetEntranceY, Math.min(this.height * 0.43 - boss.height, targetEntranceY + verticalRadius * 2))
    );
    return true;
  }

  updateGeneratedBossArchetype(
    boss: Entity,
    archetype: GeneratedBossArchetype,
    healthRatio: number,
    phase: number
  ) {
    if (!this.updateGeneratedBossMovement(boss, archetype, healthRatio)) {
      boss.isCharging = false;
      return;
    }

    const isAuthoredCampaignBoss = String(boss.sourceEventId ?? '').endsWith('-major-boss');
    const authoredCadenceScale = isAuthoredCampaignBoss
      ? Math.max(1, Number(boss.attackIntervalFrames ?? 60) / 60)
      : 1;
    const techniqueTimer = Math.floor(boss.attackTimer / authoredCadenceScale);
    const baseCue = getGeneratedBossTechniqueCue(archetype, techniqueTimer, phase);
    const cue = baseCue && authoredCadenceScale > 1
      ? {
          ...baseCue,
          warningFrames: Math.max(1, Math.round(baseCue.warningFrames * authoredCadenceScale)),
          recoveryFrames: Math.max(1, Math.round(baseCue.recoveryFrames * authoredCadenceScale))
        }
      : baseCue;
    const hasActiveBeam = this.entities.some((entity) => (
      entity.isBeam && entity.bossOwnerId === boss.id && !entity.markedForDeletion
    ));
    boss.isCharging = hasActiveBeam || boss.attackTimer < boss.generatedBossChargeUntilTimer;
    if (!cue || techniqueTimer === boss.generatedBossTechniqueTimer) return;
    boss.generatedBossTechniqueTimer = techniqueTimer;

    if (cue.technique === 'rail-telegraph') {
      boss.generatedBossChargeUntilTimer = boss.attackTimer + Math.max(1, cue.warningFrames);
      boss.isCharging = true;
      this.spawnBossRailSweep(boss, cue.sequence, true);
      return;
    }
    if (cue.stage === 'warning') {
      this.spawnGeneratedBossTechniqueWarning(boss, cue);
      return;
    }
    boss.generatedBossChargeUntilTimer = -1;
    if (cue.technique === 'rail-fire') {
      boss.isCharging = true;
      this.spawnBossRailSweep(boss, cue.sequence, false);
      return;
    }
    if (cue.technique === 'rail-tail-volley') {
      this.spawnBossTailFan(boss, cue.sequence);
      return;
    }
    if (cue.technique === 'prism-gap-ring') {
      const fallbackCount = (this.mobileProfile ? 14 : 18) + phase * 2;
      this.spawnBossSafeGapRing(
        boss,
        cue.sequence,
        phase,
        false,
        this.getCampaignGeneratedBossProjectileBudget(boss, fallbackCount)
      );
      return;
    }
    if (cue.technique === 'singularity-collapse') {
      const fallbackCount = (this.mobileProfile ? 10 : 14) + phase * 2;
      this.spawnBossInwardCollapse(
        boss,
        cue.sequence,
        phase,
        this.getCampaignGeneratedBossProjectileBudget(boss, fallbackCount)
      );
      return;
    }
    if (cue.technique === 'orbit-cross') {
      const fallbackCount = phase >= 2 ? 8 : 4;
      this.spawnBossRotatingCross(
        boss,
        cue.sequence,
        phase,
        this.getCampaignGeneratedBossProjectileBudget(boss, fallbackCount)
      );
      return;
    }
    if (cue.technique === 'helix-left' || cue.technique === 'helix-right') {
      const fallbackCount = 4 + phase * 2;
      this.spawnBossHelixVolley(
        boss,
        cue.sequence,
        phase,
        cue.technique === 'helix-left',
        this.getCampaignGeneratedBossProjectileBudget(boss, fallbackCount)
      );
      return;
    }
    if (cue.technique === 'hammerhead-port' || cue.technique === 'hammerhead-starboard') {
      const fallbackCount = Math.min(8, 4 + phase);
      this.spawnBossSideBarrage(
        boss,
        phase,
        cue.technique === 'hammerhead-port' ? 'port' : 'starboard',
        this.getCampaignGeneratedBossProjectileBudget(boss, fallbackCount)
      );
      return;
    }
    if (cue.technique === 'eclipse-dark-pulse') {
      const fallbackCount = (this.mobileProfile ? 14 : 18) + phase * 2;
      this.spawnBossSafeGapRing(
        boss,
        cue.sequence,
        phase,
        true,
        this.getCampaignGeneratedBossProjectileBudget(boss, fallbackCount)
      );
    }
  }

  updateArenaRoamingBoss(boss: Entity, healthRatio: number, phase: number) {
    const targetEntranceY = Math.max(72, Math.min(this.height * 0.13, 116));
    if (boss.y < targetEntranceY) {
      boss.y += Math.max(1.4, boss.configuredSpeed ?? 2);
      boss.x += ((this.width - boss.width) / 2 - boss.x) * 0.06;
      return;
    }

    boss.vx = 0;
    boss.vy = 0;
    const progressionTier = this.getCampaignCycle();
    const roamWidth = Math.max(24, this.width - boss.width - 24);
    const roamHeight = Math.max(
      42,
      Math.min(this.height * (0.34 + progressionTier * 0.055), 420) - targetEntranceY
    );
    const targetX = 12
      + roamWidth * (0.5 + Math.sin(boss.attackTimer * 0.017) * 0.37)
      + Math.sin(boss.attackTimer * 0.006) * Math.min(26, this.width * 0.05);
    const targetY = targetEntranceY
      + roamHeight * (0.43 + Math.cos(boss.attackTimer * 0.013) * 0.34);
    const pressure = 1 - clamp(healthRatio, 0, 1);
    boss.x += (targetX - boss.x)
      * (0.035 + pressure * 0.018)
      * boss.activeBossPhaseSpeedMultiplier;
    boss.y += (targetY - boss.y)
      * (0.028 + pressure * 0.012)
      * boss.activeBossPhaseSpeedMultiplier;
    boss.x = clamp(boss.x, 10, this.width - boss.width - 10);
    boss.y = clamp(
      boss.y,
      targetEntranceY,
      Math.max(targetEntranceY, this.height * (0.48 + progressionTier * 0.045) - boss.height)
    );

    const isVioletArbiter = boss.sourceEventId === 'helix-convergence-final-boss';
    const cycleLength = isVioletArbiter
      ? Math.max(330, 354 - Math.round(pressure * 24))
      : Math.max(250, 318 - Math.round(pressure * 44));
    const attackCycle = boss.attackTimer % cycleLength;
    const telegraphFrame = cycleLength - (isVioletArbiter ? 76 : 70);
    const fireFrame = cycleLength - 34;
    const crossActive = this.entities.some((entity) => (
      entity.isBeam && entity.bossOwnerId === boss.id && !entity.markedForDeletion
    ));
    const hasConfiguredWeapons = boss.weaponKinds.length > 0;
    const allowsBeam = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => kind.includes('beam'));
    const allowsBurst = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => !kind.includes('beam'));
    if (allowsBeam && attackCycle === telegraphFrame) {
      boss.isCharging = true;
      this.spawnBossCrossBeamPair(boss, true);
      return;
    }
    if (allowsBeam && attackCycle === fireFrame) {
      boss.isCharging = true;
      this.spawnBossCrossBeamPair(boss, false);
      return;
    }

    boss.isCharging = crossActive || (allowsBeam && attackCycle >= telegraphFrame && attackCycle <= fireFrame + 30);
    if (boss.isCharging) return;

    const baseInterval = boss.attackIntervalFrames ?? 58;
    const fireInterval = Math.max(20, Math.round(baseInterval * (1 - pressure * 0.34)));
    if (allowsBurst && boss.attackTimer - boss.lastBurstAttackTimer >= fireInterval) {
      this.spawnBossBurst(boss, Math.max(2, phase));
      boss.lastBurstAttackTimer = boss.attackTimer;
    }
  }

  spawnBossGapRing(boss: Entity) {
    const cycle = this.getCampaignCycle();
    const originX = boss.x + boss.width / 2;
    const originY = boss.y + boss.height * 0.62;
    const playerAngle = Math.atan2(
      this.player.y + this.player.height / 2 - originY,
      this.player.x + this.player.width / 2 - originX
    );
    const shotCount = Math.min(28, 16 + cycle * 2);
    const gapHalfWidth = Math.max(0.22, 0.38 - cycle * 0.04);
    const speed = Math.min(6.2, 3.3 + cycle * 0.3);

    for (let index = 0; index < shotCount; index++) {
      const angle = (Math.PI * 2 * index) / shotCount;
      const distanceFromGap = Math.abs(Math.atan2(
        Math.sin(angle - playerAngle),
        Math.cos(angle - playerAngle)
      ));
      if (distanceFromGap < gapHalfWidth) continue;

      const projectile = this.createEntity(EntityType.PROJECTILE, originX - 6, originY - 6);
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
      projectile.width = 12;
      projectile.height = 12;
      projectile.color = '#fb7185';
      projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      projectile.bossOwnerId = boss.id;
      this.entities.push(projectile);
    }

    this.spawnRingEffect(originX, originY, '#fb7185');
    this.playSound('boss_shoot', 1.08, { pitchJitter: 0.05, pitchOffset: -0.08 });
  }

  queueBossTargetStrike(boss: Entity, warningFrames = 54) {
    const targetX = clamp(this.player.x + this.player.width / 2, 34, this.width - 34);
    const targetY = clamp(this.player.y + this.player.height / 2, 90, this.height - 54);
    this.pendingBossStrikes.push({
      bossId: boss.id,
      x: targetX,
      y: targetY,
      frames: warningFrames,
      warningFrames
    });
    this.spawnFloatingText(targetX, targetY - 24, 'MISSILE LOCK', '#f87171', 15);
    this.spawnRingEffect(targetX, targetY, '#ef4444');
    this.playSound('siren', 0.74);
  }

  updatePendingBossStrikes() {
    if (this.pendingBossStrikes.length === 0) return;
    const activeBosses = new Map(this.entities
      .filter((entity) => entity.type === EntityType.BOSS && !entity.markedForDeletion)
      .map((entity) => [entity.id, entity] as const));

    for (const strike of this.pendingBossStrikes) {
      const owner = activeBosses.get(strike.bossId);
      if (!owner) {
        strike.frames = 0;
        continue;
      }
      strike.frames--;
      if (strike.frames > 0 && strike.frames % 10 === 0) {
        this.spawnRingEffect(strike.x, strike.y, '#ef4444');
      }
      if (strike.frames !== 0) continue;

      const ownerHasActiveBeam = this.entities.some((entity) => (
        entity.isBeam && entity.bossOwnerId === owner.id && !entity.markedForDeletion
      ));
      if (owner.isCharging || ownerHasActiveBeam) {
        // Resolve on the first quiet frame instead of stacking a missile impact
        // on top of an already-telegraphed beam pattern.
        strike.frames = 1;
        continue;
      }

      const cycle = this.getCampaignCycle();
      const missileCount = Math.min(3, 1 + Math.floor(cycle / 2));
      for (let index = 0; index < missileCount; index++) {
        const offset = (index - (missileCount - 1) / 2) * 22;
        const missile = this.createEntity(EntityType.PROJECTILE, strike.x + offset - 8, -34 - index * 18);
        missile.vx = 0;
        missile.vy = Math.min(10, 6.4 + cycle * 0.35);
        missile.width = 16;
        missile.height = 30;
        missile.color = '#f97316';
        missile.damage = 1;
        missile.bossOwnerId = owner.id;
        this.entities.push(missile);
      }
      this.spawnRingEffect(strike.x, strike.y, '#facc15');
      this.playSound('boss_shoot', 1.18, { pitchJitter: 0.03, pitchOffset: -0.16 });
    }

    this.pendingBossStrikes = this.pendingBossStrikes.filter((strike) => strike.frames > 0);
  }

  private resolveBossTimelineActionSequence(
    boss: Entity,
    cue: BossTimelineCue,
    sourceClip: BossTimelineCue['clip']
  ) {
    const baseSequence = Math.max(
      0,
      Math.floor(sourceClip.parameters?.sequence ?? cue.executionIndex)
    );
    if (sourceClip.primitiveId !== 'radial-beam-array') return baseSequence;
    const durationFrames = boss.bossTimeline
      ? getBossTimelineDurationFrames(boss.bossTimeline, GAME_CONFIG.FPS)
      : 1;
    const loopIndex = Math.floor(Math.max(0, boss.attackTimer) / Math.max(1, durationFrames));
    return resolveBossRotationSequence({
      sequence: baseSequence,
      rotationDirection: sourceClip.parameters?.rotationDirection,
      seedKey: [
        this.gameplayRandomSeed,
        boss.sourceEventId ?? boss.id,
        boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? 'unphased',
        loopIndex,
        sourceClip.id
      ].join(':')
    });
  }

  private updateBossLiveRotor(boss: Entity) {
    const usesLiveRotor = boss.bossTimeline?.clips.some((clip) => (
      clip.parameters?.motionCue === 'rotor-volley'
      || clip.parameters?.motionCue === 'radial-beam'
    ));
    if (!usesLiveRotor) return;
    if (!boss.bossRotorInitialized) {
      boss.bossRotorInitialized = true;
      boss.bossRotorAngleRadians = 0;
      boss.bossRotorDirection = resolveRotatingEmitterDirection(
        Math.max(0, boss.activeBossPhaseIndex)
      );
    }
    const nextAngle = boss.bossRotorAngleRadians
      + ROTATING_EMITTER_FRAME_STEP_RADIANS * boss.bossRotorDirection;
    boss.bossRotorAngleRadians = (
      nextAngle % ROTATING_EMITTER_FULL_TURN_RADIANS
      + ROTATING_EMITTER_FULL_TURN_RADIANS
    ) % ROTATING_EMITTER_FULL_TURN_RADIANS;
  }

  setBossActionPresentation(
    boss: Entity,
    cue: BossTimelineCue,
    stage: BossActionPresentationStage,
    sourceClip: BossTimelineCue['clip'] = cue.clip
  ) {
    const isHeliosMachineGunChannel = (
      sourceClip.primitiveId === 'paired-cannon-burst'
      && sourceClip.parameters?.motionCue === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE
    );
    const activeChannel = boss.bossHeliosMachineGunChannelState;
    const isHeliosPincerContinuation = (
      sourceClip.primitiveId === 'tracking-pincer-dive'
      && stage === 'warning'
      && cue.executionIndex > 0
      && boss.bossTrackingPincerState?.actionClipId === sourceClip.id
    );
    if (
      isHeliosPincerContinuation
      || (
        isHeliosMachineGunChannel
        && stage === 'warning'
        && cue.executionIndex > 0
        && activeChannel?.actionClipId === sourceClip.id
        && boss.attackTimer < activeChannel.fireEndFrame
      )
    ) {
      // These signatures are one continuous sentence. Repeated authored
      // segments keep deterministic scheduling, but continuation warnings
      // must never replace the active gun or pincer pose.
      return;
    }
    const presentation = createBossActionPresentationState({
      cueClip: cue.clip,
      sourceClip,
      stage,
      attackFrame: boss.attackTimer,
      executionIndex: cue.executionIndex,
      framesPerSecond: GAME_CONFIG.FPS
    });
    if (sourceClip.primitiveId === 'radial-beam-array') {
      presentation.sequence = this.resolveBossTimelineActionSequence(boss, cue, sourceClip);
    }
    if (
      sourceClip.primitiveId === 'radial-beam-array'
      || sourceClip.primitiveId === 'rotor-hazard-sentence'
    ) {
      boss.bossRotorDirection = resolveRotatingEmitterDirection(presentation.sequence);
    }
    if (
      isHeliosMachineGunChannel
      && stage === 'fire'
      && activeChannel?.actionClipId === sourceClip.id
    ) {
      presentation.startFrame = activeChannel.fireStartFrame;
      presentation.endFrame = activeChannel.fireEndFrame;
      presentation.sequence = activeChannel.sequence;
      presentation.executionIndex = 0;
    }
    boss.bossActionPresentation = presentation;
  }

  private removeBossCornerAmbushBeams(boss: Entity, telegraphsOnly: boolean = false) {
    for (const entity of this.entities) {
      if (
        entity.isCornerAmbushBeam
        && entity.bossOwnerId === boss.id
        && (!telegraphsOnly || entity.isTelegraph)
      ) {
        entity.markedForDeletion = true;
      }
    }
  }

  private spawnBossCornerAmbushBeamEntity(
    boss: Entity,
    lock: CornerAmbushBeamLock,
    telegraph: boolean,
    lifetimeFrames: number
  ) {
    const thickness = telegraph
      ? this.mobileProfile ? 4 : 5
      : this.mobileProfile ? 18 : 24;
    const beam = this.createEntity(
      EntityType.PROJECTILE,
      lock.beamCenterX - lock.beamLength / 2,
      lock.beamCenterY - thickness / 2
    );
    beam.isBeam = true;
    beam.isDetachedBeam = true;
    beam.isTelegraph = telegraph;
    beam.isCornerAmbushBeam = true;
    beam.bossOwnerId = boss.id;
    beam.beamAngleRadians = lock.angleRadians;
    beam.beamOriginX = lock.originX;
    beam.beamOriginY = lock.originY;
    beam.beamTargetX = lock.targetX;
    beam.beamTargetY = lock.targetY;
    beam.width = lock.beamLength;
    beam.height = thickness;
    beam.life = Math.max(1, Math.floor(lifetimeFrames));
    beam.maxLife = beam.life;
    beam.color = telegraph ? '#ef4444' : '#dc2626';
    beam.damage = telegraph ? 0 : Math.max(1, Number(boss.projectileDamage) || 1);
    this.entities.push(beam);
    return beam;
  }

  private beginBossCornerAmbushBeamWarning(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    const sequence = Math.max(
      0,
      Math.floor(linkedAction.parameters?.sequence ?? cue.executionIndex)
    );
    const lock = resolveCornerAmbushBeamLock({
      sequence,
      arenaWidth: this.width,
      arenaHeight: this.height,
      bossWidth: boss.width,
      bossHeight: boss.height,
      playerCenterX: this.player.x + this.player.width / 2,
      playerCenterY: this.player.y + this.player.height / 2,
      mobileProfile: this.mobileProfile
    });
    const warningLeadSeconds = Math.max(
      0,
      linkedAction.startSeconds - cue.clip.startSeconds
    );
    const warningFrames = Math.max(
      1,
      Math.round(warningLeadSeconds * GAME_CONFIG.FPS)
    );
    const liveSeconds = clamp(
      linkedAction.durationSeconds,
      CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS,
      CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS
    );
    const liveFrames = Math.max(1, Math.round(liveSeconds * GAME_CONFIG.FPS));

    this.removeBossCornerAmbushBeams(boss);
    boss.bossCornerAmbushBeamState = {
      actionClipId: linkedAction.id,
      holdUntilFrame: boss.attackTimer + warningFrames + liveFrames,
      lock
    };
    boss.x = lock.bossX;
    boss.y = lock.bossY;
    boss.vx = 0;
    boss.vy = 0;
    boss.isCharging = true;
    this.spawnBossCornerAmbushBeamEntity(boss, lock, true, warningFrames);
    this.playSound('siren', 0.72);
  }

  private fireBossCornerAmbushBeam(boss: Entity, cue: BossTimelineCue) {
    const state = boss.bossCornerAmbushBeamState;
    if (!state || state.actionClipId !== cue.clip.id) {
      // A damaging lane is never reconstructed from the player's current
      // position. If its exact warning lock is unavailable, fail safely.
      return;
    }

    const liveSeconds = clamp(
      cue.clip.durationSeconds,
      CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS,
      CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS
    );
    const liveFrames = Math.max(1, Math.round(liveSeconds * GAME_CONFIG.FPS));
    state.holdUntilFrame = Math.max(state.holdUntilFrame, boss.attackTimer + liveFrames);
    boss.x = state.lock.bossX;
    boss.y = state.lock.bossY;
    boss.vx = 0;
    boss.vy = 0;
    boss.isCharging = false;
    this.removeBossCornerAmbushBeams(boss, true);
    this.spawnBossCornerAmbushBeamEntity(boss, state.lock, false, liveFrames);
    this.playSound('electricity');
    this.playSound('boss_shoot', 1.2, { pitchJitter: 0.02, pitchOffset: -0.08 });
    this.addShake(this.mobileProfile ? 2.4 : 3.2);
    this.addHitStop(4);
  }

  private beginBossCornerAmbushRamWarning(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    const sequence = Math.max(
      0,
      Math.floor(linkedAction.parameters?.sequence ?? cue.executionIndex)
    );
    const lock = resolveCornerAmbushRamLock({
      sequence,
      arenaWidth: this.width,
      arenaHeight: this.height,
      bossWidth: boss.width,
      bossHeight: boss.height,
      playerCenterX: this.player.x + this.player.width / 2,
      playerCenterY: this.player.y + this.player.height / 2,
      mobileProfile: this.mobileProfile
    });
    const warningFrames = Math.max(
      1,
      Math.round(
        Math.max(0, linkedAction.startSeconds - cue.clip.startSeconds)
        * GAME_CONFIG.FPS
      )
    );
    boss.bossCornerAmbushBeamState = undefined;
    this.removeBossCornerAmbushBeams(boss);
    boss.bossCornerAmbushRamState = {
      actionClipId: linkedAction.id,
      stage: 'warning',
      startFrame: boss.attackTimer,
      endFrame: boss.attackTimer + warningFrames,
      lock
    };
    boss.x = lock.startX;
    boss.y = lock.startY;
    boss.vx = 0;
    boss.vy = 0;
    boss.isCharging = true;
    boss.bossPresentationBankRadians = lock.angleRadians - Math.PI / 2;
    this.spawnRingEffect(lock.targetX, lock.targetY, '#ef4444');
    this.playSound('siren', 0.78);
  }

  private fireBossCornerAmbushRam(boss: Entity, cue: BossTimelineCue) {
    const state = boss.bossCornerAmbushRamState;
    if (!state || state.actionClipId !== cue.clip.id) {
      // Never reconstruct a damaging body lane from the player's new position.
      return;
    }
    const liveSeconds = clamp(
      cue.clip.durationSeconds,
      CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS,
      CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS
    );
    state.stage = 'charge';
    state.startFrame = boss.attackTimer;
    state.endFrame = boss.attackTimer + Math.max(
      1,
      Math.round(liveSeconds * GAME_CONFIG.FPS)
    );
    boss.isCharging = false;
    this.playSound('boss_shoot', 1.24, { pitchJitter: 0.02, pitchOffset: -0.18 });
    this.addShake(this.mobileProfile ? 2.8 : 3.8);
    this.addHitStop(3);
  }

  private showBossGapRingSafeRoute(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    const sequence = resolveBossPatternSequence(
      linkedAction.parameters?.sequence,
      cue.executionIndex
    );
    const coreOrigin = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
    const originX = coreOrigin?.x ?? boss.x + boss.width / 2;
    const originY = coreOrigin?.y ?? boss.y + boss.height * 0.62;
    this.captureBossTimelineActionOrigins(
      boss,
      linkedAction.id,
      cue.executionIndex,
      [{ x: originX, y: originY }]
    );
    const direction = resolveBossGapRouteDirection(
      linkedAction.parameters?.rotationDirection,
      sequence
    );
    const route = resolveBossGapRoute({
      arenaWidth: this.width,
      arenaHeight: this.height,
      originX,
      originY,
      sequence,
      direction
    });
    const warningLeadSeconds = Math.max(
      cue.clip.durationSeconds,
      Number(cue.clip.parameters?.warningSeconds) || 0,
      linkedAction.startSeconds - cue.clip.startSeconds
    );
    const lifetimeFrames = Math.max(
      1,
      Math.round(warningLeadSeconds * GAME_CONFIG.FPS)
    );
    const beamLength = Math.max(1, Math.hypot(route.x - originX, route.y - originY));
    const beamThickness = this.mobileProfile ? 4 : 5;
    const centerX = (originX + route.x) / 2;
    const centerY = (originY + route.y) / 2;
    const guide = this.createEntity(
      EntityType.PROJECTILE,
      centerX - beamLength / 2,
      centerY - beamThickness / 2
    );
    guide.isBeam = true;
    guide.isDetachedBeam = true;
    guide.isTelegraph = true;
    guide.isBossGapGuide = true;
    guide.bossOwnerId = boss.id;
    guide.beamAngleRadians = route.angleRadians;
    guide.beamOriginX = originX;
    guide.beamOriginY = originY;
    guide.beamTargetX = route.x;
    guide.beamTargetY = route.y;
    guide.width = beamLength;
    guide.height = beamThickness;
    guide.life = lifetimeFrames;
    guide.maxLife = lifetimeFrames;
    guide.color = cue.clip.parameters?.color ?? '#67e8f9';
    guide.damage = 0;
    this.entities.push(guide);
    this.spawnRingEffect(route.x, route.y, guide.color);
    this.spawnFloatingText(
      route.x,
      route.y - 24,
      'SAFE GAP',
      guide.color,
      this.mobileProfile ? 13 : 16
    );
    boss.isCharging = true;
    this.playSound('siren', 0.62);
  }

  private beginBossSideBarrageWarning(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    const side = linkedAction.parameters?.side ?? 'port';
    const initialState = this.getBossSideBarrageOrigins(boss, side);
    const gatlingBarrage = (
      initialState.allCannonsDestroyed
      || linkedAction.parameters?.motionCue === 'gatling-barrage'
      || boss.bossActionPresentation?.motionCue === 'gatling-barrage'
    );
    if (gatlingBarrage && boss.bossActionPresentation) {
      boss.bossActionPresentation.motionCue = 'gatling-barrage';
    }
    const portState = gatlingBarrage
      ? this.getBossSideBarrageOrigins(boss, 'port')
      : undefined;
    const starboardState = gatlingBarrage
      ? this.getBossSideBarrageOrigins(boss, 'starboard')
      : undefined;
    const resolvedSide = initialState.resolvedSide;
    const origins = gatlingBarrage
      ? [
          ...(portState?.origins ?? []),
          ...(starboardState?.origins ?? [])
        ]
      : initialState.origins;
    const targetX = this.player.x + this.player.width / 2;
    const targetY = this.player.y + this.player.height / 2;
    if (gatlingBarrage) {
      boss.bossGatlingAttackLock = {
        actionClipId: linkedAction.id,
        executionIndex: cue.executionIndex,
        targetX,
        targetY,
        portOrigins: portState?.origins ?? [],
        starboardOrigins: starboardState?.origins ?? []
      };
    } else {
      boss.bossGatlingAttackLock = undefined;
      this.captureBossTimelineActionOrigins(
        boss,
        linkedAction.id,
        cue.executionIndex,
        origins
      );
    }
    boss.bossTimelineTargetClipId = linkedAction.id;
    boss.bossTimelineTargetExecutionIndex = cue.executionIndex;
    boss.bossTimelineTargetX = targetX;
    boss.bossTimelineTargetY = targetY;
    const warningLeadSeconds = Math.max(
      cue.clip.durationSeconds,
      Number(cue.clip.parameters?.warningSeconds) || 0,
      linkedAction.startSeconds - cue.clip.startSeconds
    );
    const warningFrames = Math.max(
      1,
      Math.round(warningLeadSeconds * GAME_CONFIG.FPS)
    );
    origins.forEach((origin, originIndex) => {
      const color = gatlingBarrage
        ? originIndex < (portState?.origins.length ?? 0) ? '#fb7185' : '#facc15'
        : resolvedSide === 'port' ? '#fb7185' : '#facc15';
      const length = Math.max(1, Math.hypot(targetX - origin.x, targetY - origin.y));
      const thickness = this.mobileProfile ? 3 : 4;
      const guide = this.createEntity(
        EntityType.PROJECTILE,
        (origin.x + targetX) / 2 - length / 2,
        (origin.y + targetY) / 2 - thickness / 2
      );
      guide.isBeam = true;
      guide.isDetachedBeam = true;
      guide.isTelegraph = true;
      guide.isBossSideBarrageGuide = true;
      guide.bossOwnerId = boss.id;
      guide.beamAngleRadians = Math.atan2(targetY - origin.y, targetX - origin.x);
      guide.beamOriginX = origin.x;
      guide.beamOriginY = origin.y;
      guide.beamTargetX = targetX;
      guide.beamTargetY = targetY;
      guide.width = length;
      guide.height = thickness;
      guide.life = warningFrames;
      guide.maxLife = warningFrames;
      guide.color = color;
      guide.damage = 0;
      this.entities.push(guide);
    });
    this.spawnRingEffect(targetX, targetY, gatlingBarrage ? '#fde68a' : (
      resolvedSide === 'port' ? '#fb7185' : '#facc15'
    ));
    boss.isCharging = true;
    this.playSound('siren', 0.58);
  }

  private isSelectedPreviewBoss(boss: Entity) {
    return this.previewMode && boss.sourceEventId === this.previewBossWeaponSocketEventId;
  }

  private isSandboxPrismMoth(boss: Entity) {
    return boss.sourceItemId === 'prism-moth';
  }

  private isSandboxFrontierCrownclaw(boss: Entity) {
    return boss.sourceItemId === 'frontier-crownclaw';
  }

  private isFrontierCrownclawSideOperational(
    boss: Entity,
    side: FrontierCrownclawSide
  ) {
    const componentId: BossPartId = side === 'port' ? 'left-cannon' : 'right-cannon';
    const component = boss.bossComponents?.find((item) => item.id === componentId);
    return !component || !component.destroyed;
  }

  private getFrontierCrownclawOperationalSides(
    boss: Entity
  ): readonly FrontierCrownclawSide[] {
    return Object.freeze((['port', 'starboard'] as const).filter((side) => (
      this.isFrontierCrownclawSideOperational(boss, side)
    )));
  }

  private clearFrontierCrownclawSideArtifacts(
    boss: Entity,
    side: FrontierCrownclawSide
  ) {
    for (const entity of this.entities) {
      if (
        entity.bossOwnerId === boss.id
        && entity.frontierCrownclawArtifactKind
        && entity.frontierCrownclawSide === side
      ) {
        // Component loss must disable collision in the same simulation step,
        // even though normal entity compaction happens later in the frame.
        entity.frontierCrownclawDamageActive = false;
        entity.damage = 0;
        entity.life = 0;
        entity.markedForDeletion = true;
      }
    }
  }

  private removeFrontierCrownclawSideFromActiveAction(
    boss: Entity,
    side: FrontierCrownclawSide
  ) {
    this.clearFrontierCrownclawSideArtifacts(boss, side);
    const state = boss.bossFrontierCrownclawState;
    if (!state || state.kind !== 'harpoon' || !state.sides.includes(side)) return;
    state.sides = Object.freeze(state.sides.filter((candidate) => candidate !== side));
  }

  private reconcileFrontierCrownclawActiveSides(
    boss: Entity,
    state: BossFrontierCrownclawRuntimeState
  ) {
    if (state.kind !== 'harpoon') return state.sides;
    for (const side of state.sides) {
      if (!this.isFrontierCrownclawSideOperational(boss, side)) {
        this.removeFrontierCrownclawSideFromActiveAction(boss, side);
      }
    }
    return state.sides;
  }

  private getFrontierCrownclawDestroyedClawFallbackKind(sequence: number) {
    // Sequence parity is stable across reconstruction, seed replay, and both
    // viewports. It also alternates the two anatomy-independent core tools.
    return Math.max(0, Math.floor(sequence)) % 2 === 0
      ? 'reactor-beam' as const
      : 'crabwalk' as const;
  }

  private applyFrontierCrownclawPresentationKind(
    action: BossActionPresentationState,
    kind: BossFrontierCrownclawRuntimeState['kind']
  ) {
    if (kind === 'reactor-beam') {
      action.primitiveId = 'crown-reactor-beam';
      action.motionCue = FRONTIER_CROWNCLAW_MOTION_CUES.reactorFire;
      action.side = undefined;
      return;
    }
    if (kind === 'crabwalk') {
      action.primitiveId = 'bastion-crabwalk-barrage';
      action.motionCue = FRONTIER_CROWNCLAW_MOTION_CUES.crabwalk;
      action.side = undefined;
    }
  }

  private getFrontierCrownclawPhaseIndex(boss: Entity) {
    return Math.max(1, Math.min(2, boss.activeBossPhaseIndex + 1));
  }

  private getFrontierCrownclawSocketOrigin(
    boss: Entity,
    socketId: string
  ): Readonly<{ x: number; y: number }> {
    const fallbackRatios: Readonly<Record<string, readonly [number, number]>> = {
      'claw-tip-port': [0.18, 0.72],
      'claw-tip-starboard': [0.82, 0.72],
      'chain-spool-port': [0.31, 0.56],
      'chain-spool-starboard': [0.69, 0.56],
      'crown-reactor': [0.5, 0.45],
      'bastion-port-port': [0.38, 0.73],
      'bastion-port-starboard': [0.62, 0.73],
      'rear-bastion-port': [0.22, 0.57],
      'rear-bastion-starboard': [0.78, 0.57]
    };
    const ratio = fallbackRatios[socketId] ?? [0.5, 0.62];
    const fallback = {
      x: boss.x + boss.width * ratio[0],
      y: boss.y + boss.height * ratio[1]
    };
    return this.getPreviewBossWeaponOriginById(boss, socketId, fallback);
  }

  private getFrontierCrownclawHarpoonTarget(
    state: BossFrontierCrownclawRuntimeState,
    side: FrontierCrownclawSide
  ) {
    const ratio = side === 'port'
      ? state.harpoonPlan?.portTargetRatio
      : state.harpoonPlan?.starboardTargetRatio;
    const plannedX = (ratio?.x ?? 0.5) * this.width;
    return {
      x: clamp(plannedX, 24, Math.max(24, this.width - 24)),
      y: clamp(
        Math.max((ratio?.y ?? 0.68) * this.height, state.lockedTargetY),
        this.height * 0.68,
        Math.max(this.height * 0.68, this.height - 42)
      )
    };
  }

  private clearFrontierCrownclawArtifacts(
    boss: Entity,
    kinds?: readonly FrontierCrownclawArtifactKind[]
  ) {
    const allowedKinds = kinds ? new Set(kinds) : undefined;
    for (const entity of this.entities) {
      if (
        entity.bossOwnerId === boss.id
        && entity.frontierCrownclawArtifactKind
        && (!allowedKinds || allowedKinds.has(entity.frontierCrownclawArtifactKind))
      ) {
        entity.markedForDeletion = true;
      }
    }
  }

  private clearFrontierCrownclawRuntime(boss: Entity) {
    this.clearFrontierCrownclawArtifacts(boss);
    boss.bossFrontierCrownclawState = undefined;
    boss.isCharging = false;
    boss.bossPresentationBankRadians = 0;
  }

  private positionFrontierCrownclawLine(
    entity: Entity,
    origin: Readonly<{ x: number; y: number }>,
    target: Readonly<{ x: number; y: number }>,
    thickness: number
  ) {
    const length = Math.max(1, Math.hypot(target.x - origin.x, target.y - origin.y));
    entity.beamAngleRadians = Math.atan2(target.y - origin.y, target.x - origin.x);
    entity.beamOriginX = origin.x;
    entity.beamOriginY = origin.y;
    entity.beamTargetX = target.x;
    entity.beamTargetY = target.y;
    entity.width = length;
    entity.height = Math.max(1, thickness);
    entity.x = (origin.x + target.x) / 2 - length / 2;
    entity.y = (origin.y + target.y) / 2 - entity.height / 2;
  }

  private createFrontierCrownclawLine(
    boss: Entity,
    kind: FrontierCrownclawArtifactKind,
    origin: Readonly<{ x: number; y: number }>,
    target: Readonly<{ x: number; y: number }>,
    thickness: number,
    color: string,
    lifetimeFrames: number,
    telegraph: boolean
  ) {
    const line = this.createEntity(EntityType.PROJECTILE, origin.x, origin.y);
    line.isBeam = true;
    line.isDetachedBeam = true;
    line.isTelegraph = telegraph;
    line.frontierCrownclawArtifactKind = kind;
    line.frontierCrownclawDamageActive = !telegraph;
    line.bossOwnerId = boss.id;
    line.color = color;
    line.damage = telegraph ? 0 : Math.max(1, Number(boss.projectileDamage) || 1);
    line.life = Math.max(1, lifetimeFrames);
    line.maxLife = line.life;
    this.positionFrontierCrownclawLine(line, origin, target, thickness);
    this.entities.push(line);
    return line;
  }

  private showFrontierCrownclawTelegraph(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    if (!this.isSandboxFrontierCrownclaw(boss)) return false;
    const action = boss.bossActionPresentation;
    if (!action) return false;
    const primitiveId = linkedAction.primitiveId;
    if (
      primitiveId !== 'chainclaw-harpoon'
      && primitiveId !== 'crown-reactor-beam'
      && primitiveId !== 'bastion-crabwalk-barrage'
    ) {
      return false;
    }

    this.clearFrontierCrownclawRuntime(boss);
    const phaseIndex = this.getFrontierCrownclawPhaseIndex(boss);
    const sequence = action.sequence;
    const targetX = this.player.x + this.player.width / 2;
    const targetY = this.player.y + this.player.height / 2;
    const warningFrames = Math.max(1, action.endFrame - action.startFrame);
    const signature = linkedAction.parameters?.motionCue
      === FRONTIER_CROWNCLAW_MOTION_CUES.crossLink;
    const configuredSide = linkedAction.parameters?.side;
    const harpoonPlan = primitiveId === 'chainclaw-harpoon'
      ? resolveFrontierChainclawPlan({
          seedKey: 'frontier-crownclaw',
          sequence,
          phaseIndex,
          signature
        })
      : undefined;
    const requestedSide: FrontierCrownclawSide | undefined = configuredSide === 'port'
      || configuredSide === 'starboard'
      ? configuredSide
      : undefined;
    const operationalSides = this.getFrontierCrownclawOperationalSides(boss);
    const plannedSides: readonly FrontierCrownclawSide[] = signature
      ? Object.freeze(['port', 'starboard'])
      : requestedSide
        ? Object.freeze([requestedSide])
        : harpoonPlan?.sides ?? Object.freeze([]);
    const sides: readonly FrontierCrownclawSide[] = primitiveId !== 'chainclaw-harpoon'
      ? Object.freeze([])
      : operationalSides.length === 1
        ? Object.freeze([operationalSides[0]])
        : Object.freeze(plannedSides.filter((side) => operationalSides.includes(side)));
    const kind: BossFrontierCrownclawRuntimeState['kind'] =
      primitiveId === 'chainclaw-harpoon'
        ? sides.length > 0
          ? 'harpoon'
          : this.getFrontierCrownclawDestroyedClawFallbackKind(sequence)
        : primitiveId === 'crown-reactor-beam'
          ? 'reactor-beam'
          : 'crabwalk';
    const lockedAngle = Math.atan2(
      targetY - (boss.y + boss.height * 0.45),
      targetX - (boss.x + boss.width / 2)
    );
    const reactorPlan = kind === 'reactor-beam'
      ? resolveFrontierReactorBeamPlan({
          seedKey: 'frontier-crownclaw',
          sequence,
          phaseIndex,
          lockedTargetAngleRadians: lockedAngle
        })
      : undefined;
    const crabwalkPlan = kind === 'crabwalk'
      ? resolveFrontierCrabwalkPlan({
          seedKey: 'frontier-crownclaw',
          sequence,
          phaseIndex
        })
      : undefined;
    const state: BossFrontierCrownclawRuntimeState = {
      kind,
      actionClipId: linkedAction.id,
      executionIndex: cue.executionIndex,
      phaseIndex,
      sequence,
      anchorX: boss.x,
      anchorY: boss.y,
      warningStartFrame: boss.attackTimer,
      fireStartFrame: -1,
      fireEndFrame: -1,
      lockedTargetX: targetX,
      lockedTargetY: targetY,
      signature: signature && kind === 'harpoon',
      sides,
      harpoonPlan,
      reactorPlan,
      crabwalkPlan,
      lastBarrageShotIndex: -1
    };
    boss.bossFrontierCrownclawState = state;
    this.applyFrontierCrownclawPresentationKind(action, kind);
    boss.isCharging = true;

    if (kind === 'harpoon') {
      state.sides.forEach((side) => {
        const origin = this.getFrontierCrownclawSocketOrigin(
          boss,
          `claw-tip-${side}`
        );
        const target = this.getFrontierCrownclawHarpoonTarget(state, side);
        const guide = this.createFrontierCrownclawLine(
          boss,
          'harpoon-guide',
          origin,
          target,
          this.mobileProfile ? 3 : 4,
          '#67e8f9',
          warningFrames,
          true
        );
        guide.frontierCrownclawSide = side;
        guide.frontierCrownclawActionClipId = linkedAction.id;
        this.spawnRingEffect(target.x, target.y, '#67e8f9');
      });
      this.playSound('siren', 0.62);
      return true;
    }

    if (kind === 'reactor-beam' && reactorPlan) {
      const origin = this.getFrontierCrownclawSocketOrigin(boss, 'crown-reactor');
      const length = Math.hypot(this.width, this.height) * 1.15;
      // Each warning rail maps one-to-one to a beam at the start of firing.
      // The sweep endpoint is movement, not a second set of incoming lasers.
      resolveFrontierReactorBeamAngles(
        reactorPlan.startAngleRadians,
        reactorPlan
      ).forEach((angle) => {
        const target = {
          x: origin.x + Math.cos(angle) * length,
          y: origin.y + Math.sin(angle) * length
        };
        this.createFrontierCrownclawLine(
          boss,
          'reactor-guide',
          origin,
          target,
          this.mobileProfile ? 3 : 4,
          '#67e8f9',
          warningFrames,
          true
        ).frontierCrownclawActionClipId = linkedAction.id;
      });
      this.spawnRingEffect(origin.x, origin.y, '#22d3ee');
      this.playSound('electricity', 0.72, { pitchJitter: 0.02, pitchOffset: 0.08 });
      return true;
    }

    const port = this.getFrontierCrownclawSocketOrigin(boss, 'bastion-port-port');
    const starboard = this.getFrontierCrownclawSocketOrigin(
      boss,
      'bastion-port-starboard'
    );
    this.spawnRingEffect(port.x, port.y, '#fbbf24');
    this.spawnRingEffect(starboard.x, starboard.y, '#fbbf24');
    this.playSound('siren', 0.56);
    return true;
  }

  private beginFrontierCrownclawAction(
    boss: Entity,
    cue: BossTimelineCue
  ) {
    if (!this.isSandboxFrontierCrownclaw(boss)) return false;
    const state = boss.bossFrontierCrownclawState;
    const action = boss.bossActionPresentation;
    if (
      !state
      || !action
      || state.actionClipId !== cue.clip.id
      || state.executionIndex !== cue.executionIndex
    ) {
      // Damaging Frontier geometry is warning-owned. If its exact deterministic
      // lock is missing, fail safely instead of retargeting the current player.
      return true;
    }
    state.fireStartFrame = boss.attackTimer;
    state.fireEndFrame = action.endFrame;
    state.lastBarrageShotIndex = -1;
    this.applyFrontierCrownclawPresentationKind(action, state.kind);
    boss.isCharging = false;
    this.clearFrontierCrownclawArtifacts(
      boss,
      ['harpoon-guide', 'reactor-guide']
    );

    if (state.kind === 'harpoon') {
      state.sides.forEach((side) => {
        const origin = this.getFrontierCrownclawSocketOrigin(
          boss,
          `claw-tip-${side}`
        );
        const claw = this.createEntity(
          EntityType.PROJECTILE,
          origin.x - 54,
          origin.y - 35
        );
        claw.frontierCrownclawArtifactKind = 'harpoon-claw';
        claw.frontierCrownclawActionClipId = cue.clip.id;
        claw.frontierCrownclawSide = side;
        claw.frontierCrownclawDamageActive = false;
        claw.projectileVisualKind = 'boss-frontier-chainclaw';
        claw.projectileAnimationMode = 'hold-last';
        claw.width = 108;
        claw.height = 70;
        claw.color = '#fbbf24';
        claw.damage = 0;
        claw.bossOwnerId = boss.id;
        claw.weaponVisualStartFrame = this.frameCount;
        this.entities.push(claw);

        for (let index = 0; index < FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT; index += 1) {
          const link = this.createEntity(
            EntityType.PROJECTILE,
            origin.x - 26,
            origin.y - 6.5
          );
          link.frontierCrownclawArtifactKind = 'harpoon-link';
          link.frontierCrownclawActionClipId = cue.clip.id;
          link.frontierCrownclawSide = side;
          link.frontierCrownclawLinkIndex = index;
          link.frontierCrownclawDamageActive = false;
          link.projectileVisualKind = 'boss-frontier-chain-link';
          link.projectileAnimationMode = 'hold-last';
          link.width = 52;
          link.height = 13;
          link.color = '#fbbf24';
          link.damage = 0;
          link.bossOwnerId = boss.id;
          link.weaponVisualStartFrame = this.frameCount;
          this.entities.push(link);
        }
      });
      this.playSound('boss_shoot', 1.04, {
        pitchJitter: 0.025,
        pitchOffset: -0.14
      });
      return true;
    }

    if (state.kind === 'reactor-beam') {
      this.addShake(this.mobileProfile ? 1.8 : 2.4);
      this.playSound('electricity', 0.92, { pitchJitter: 0.02, pitchOffset: -0.04 });
      return true;
    }

    this.playSound('boss_shoot', 0.82, {
      pitchJitter: 0.04,
      pitchOffset: -0.1
    });
    return true;
  }

  private updateFrontierCrownclawHarpoonArtifacts(
    boss: Entity,
    state: BossFrontierCrownclawRuntimeState,
    action: BossActionPresentationState
  ) {
    const durationFrames = Math.max(1, action.endFrame - action.startFrame);
    const progress = clamp(
      (boss.attackTimer - action.startFrame) / durationFrames,
      0,
      1
    );
    state.sides.forEach((side) => {
      const spool = this.getFrontierCrownclawSocketOrigin(
        boss,
        `chain-spool-${side}`
      );
      // The rendered claw-tip socket is already following the pose sampler.
      // Mechanics instead start from the neutral seated tip so the same pure
      // harpoon sample is not accidentally applied twice.
      const rest = {
        x: boss.x + boss.width * (side === 'port' ? 0.18 : 0.82),
        y: boss.y + boss.height * 0.72
      };
      const target = this.getFrontierCrownclawHarpoonTarget(state, side);
      const sample = sampleFrontierChainclawHarpoon({
        side,
        stage: 'fire',
        progress,
        sequence: state.sequence,
        spool,
        rest,
        target,
        signature: state.signature
      });
      for (const entity of this.entities) {
        if (
          entity.markedForDeletion
          || entity.bossOwnerId !== boss.id
          || entity.frontierCrownclawActionClipId !== state.actionClipId
          || entity.frontierCrownclawSide !== side
        ) {
          continue;
        }
        if (entity.frontierCrownclawArtifactKind === 'harpoon-claw') {
          entity.x = sample.claw.x - entity.width / 2;
          entity.y = sample.claw.y - entity.height / 2;
          entity.vx = 0;
          entity.vy = 0;
          entity.beamAngleRadians = sample.clawRotationRadians;
          entity.spriteFrameFixedRotationRadians = sample.clawRotationRadians;
          entity.frontierCrownclawDamageActive = sample.clawDamaging;
          entity.damage = sample.clawDamaging
            ? Math.max(1, Number(boss.projectileDamage) || 1)
            : 0;
          continue;
        }
        if (entity.frontierCrownclawArtifactKind !== 'harpoon-link') continue;
        const link = sample.links[entity.frontierCrownclawLinkIndex];
        if (!link) {
          entity.markedForDeletion = true;
          continue;
        }
        entity.x = link.x - entity.width / 2;
        entity.y = link.y - entity.height / 2;
        entity.vx = 0;
        entity.vy = 0;
        entity.beamAngleRadians = link.rotationRadians;
        entity.spriteFrameFixedRotationRadians = link.rotationRadians;
        entity.frontierCrownclawDamageActive = sample.chainDamaging;
        entity.damage = sample.chainDamaging
          ? Math.max(1, Number(boss.projectileDamage) || 1)
          : 0;
      }
    });
  }

  private updateFrontierCrownclawBeamArtifacts(
    boss: Entity,
    state: BossFrontierCrownclawRuntimeState,
    action: BossActionPresentationState
  ) {
    if (!state.reactorPlan) return;
    const durationFrames = Math.max(1, action.endFrame - action.startFrame);
    const progress = clamp(
      (boss.attackTimer - action.startFrame) / durationFrames,
      0,
      1
    );
    const sample = sampleFrontierCrownReactorBeam({
      stage: 'fire',
      progress,
      plan: state.reactorPlan
    });
    const origin = this.getFrontierCrownclawSocketOrigin(boss, 'crown-reactor');
    const length = Math.hypot(this.width, this.height) * 1.15;
    const thickness = this.mobileProfile ? 21 : 24;
    sample.beamAnglesRadians.forEach((angle, beamIndex) => {
      let beam = this.entities.find((entity) => (
        !entity.markedForDeletion
        && entity.bossOwnerId === boss.id
        && entity.frontierCrownclawArtifactKind === 'reactor-beam'
        && entity.frontierCrownclawActionClipId === state.actionClipId
        && entity.frontierCrownclawBeamIndex === beamIndex
      ));
      const target = {
        x: origin.x + Math.cos(angle) * length,
        y: origin.y + Math.sin(angle) * length
      };
      if (!beam) {
        beam = this.createFrontierCrownclawLine(
          boss,
          'reactor-beam',
          origin,
          target,
          thickness,
          '#22d3ee',
          3,
          true
        );
        beam.frontierCrownclawActionClipId = state.actionClipId;
        beam.frontierCrownclawBeamIndex = beamIndex;
        beam.projectileVisualKind = 'boss-frontier-reactor-beam';
        beam.weaponVisualStartFrame = this.frameCount;
      }
      if (beam.isTelegraph && sample.damaging) {
        beam.weaponVisualStartFrame = this.frameCount;
      }
      beam.life = 3;
      beam.maxLife = 3;
      beam.isTelegraph = !sample.damaging;
      beam.frontierCrownclawDamageActive = sample.damaging;
      beam.damage = sample.damaging
        ? Math.max(1, Number(boss.projectileDamage) || 1)
        : 0;
      beam.color = sample.damaging ? '#22d3ee' : '#67e8f9';
      this.positionFrontierCrownclawLine(beam, origin, target, thickness);
    });
    for (const entity of this.entities) {
      if (
        entity.bossOwnerId === boss.id
        && entity.frontierCrownclawArtifactKind === 'reactor-beam'
        && entity.frontierCrownclawActionClipId === state.actionClipId
        && entity.frontierCrownclawBeamIndex >= sample.beamAnglesRadians.length
      ) {
        entity.markedForDeletion = true;
      }
    }
  }

  private spawnFrontierCrownclawBarragePulse(
    boss: Entity,
    state: BossFrontierCrownclawRuntimeState,
    action: BossActionPresentationState
  ) {
    if (!state.crabwalkPlan) return;
    const elapsedFrames = Math.max(0, boss.attackTimer - action.startFrame);
    const durationFrames = Math.max(1, action.endFrame - action.startFrame);
    const lockedAngle = Math.atan2(
      state.lockedTargetY - (boss.y + boss.height * 0.68),
      state.lockedTargetX - (boss.x + boss.width / 2)
    );
    const pulse = sampleFrontierBarragePulse({
      elapsedFrames,
      durationFrames,
      sequence: state.sequence,
      phaseIndex: state.phaseIndex,
      intervalFrames: action.shotIntervalFrames,
      lockedTargetAngleRadians: lockedAngle
    });
    if (
      !pulse?.firing
      || pulse.shotIndex <= state.lastBarrageShotIndex
    ) {
      return;
    }
    const activeOwnedShots = this.entities.reduce((count, entity) => (
      count + Number(
        !entity.markedForDeletion
        && entity.bossOwnerId === boss.id
        && entity.type === EntityType.PROJECTILE
        && !entity.isBeam
        && !entity.frontierCrownclawArtifactKind
      )
    ), 0);
    const projectileCap = this.mobileProfile ? 48 : 72;
    if (activeOwnedShots >= projectileCap) return;
    state.lastBarrageShotIndex = pulse.shotIndex;
    const origin = this.getFrontierCrownclawSocketOrigin(boss, pulse.socketId);
    const speed = (boss.projectileSpeed ?? 6.4)
      * clamp(action.projectileSpeedScale ?? 1, 0.5, 1.7);
    const projectile = this.createEntity(
      EntityType.PROJECTILE,
      origin.x - (pulse.rearSocket ? 10 : 9),
      origin.y - (pulse.rearSocket ? 10 : 9)
    );
    projectile.vx = Math.cos(pulse.angleRadians) * speed;
    projectile.vy = Math.sin(pulse.angleRadians) * speed;
    projectile.width = pulse.rearSocket ? 20 : 18;
    projectile.height = pulse.rearSocket ? 20 : 18;
    projectile.color = pulse.rearSocket ? '#67e8f9' : '#fbbf24';
    projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    projectile.bossOwnerId = boss.id;
    projectile.variant = pulse.shotIndex;
    projectile.projectileVisualKind = pulse.rearSocket
      ? 'boss-frontier-shell-shard'
      : 'boss-frontier-crown-bolt';
    projectile.weaponVisualStartFrame = this.frameCount;
    this.entities.push(projectile);
    this.playSound('boss_shoot', pulse.rearSocket ? 0.9 : 0.72, {
      pitchJitter: 0.035,
      pitchOffset: pulse.side === 'port' ? -0.08 : 0.04
    });
  }

  private updateFrontierCrownclawActionRuntime(boss: Entity) {
    if (!this.isSandboxFrontierCrownclaw(boss)) return;
    const state = boss.bossFrontierCrownclawState;
    const action = boss.bossActionPresentation;
    if (!state || !action || action.actionClipId !== state.actionClipId) {
      if (state && boss.attackTimer > Math.max(state.fireEndFrame, state.warningStartFrame + 1)) {
        this.clearFrontierCrownclawRuntime(boss);
      }
      return;
    }
    this.reconcileFrontierCrownclawActiveSides(boss, state);
    if (action.stage !== 'fire') {
      if (action.stage === 'recovery') {
        this.clearFrontierCrownclawArtifacts(
          boss,
          ['harpoon-claw', 'harpoon-link', 'reactor-beam']
        );
      }
      return;
    }
    if (state.kind === 'harpoon') {
      this.updateFrontierCrownclawHarpoonArtifacts(boss, state, action);
      return;
    }
    if (state.kind === 'reactor-beam') {
      this.updateFrontierCrownclawBeamArtifacts(boss, state, action);
      return;
    }
    this.spawnFrontierCrownclawBarragePulse(boss, state, action);
  }

  private updateFrontierCrownclawTimelineMovement(boss: Entity) {
    if (!this.isSandboxFrontierCrownclaw(boss)) return false;
    const state = boss.bossFrontierCrownclawState;
    const action = boss.bossActionPresentation;
    if (!state || !action || action.actionClipId !== state.actionClipId) {
      return false;
    }
    const previousX = boss.x;
    const previousY = boss.y;
    if (state.kind === 'crabwalk' && state.crabwalkPlan) {
      const durationFrames = Math.max(1, action.endFrame - action.startFrame);
      const progress = clamp(
        (boss.attackTimer - action.startFrame) / durationFrames,
        0,
        1
      );
      const stage = action.stage === 'warning'
        ? 'warning'
        : action.stage === 'recovery'
          ? 'recovery'
          : 'fire';
      const sample = sampleFrontierBastionCrabwalk({
        stage,
        progress,
        plan: state.crabwalkPlan,
        anchorX: state.anchorX,
        anchorY: state.anchorY,
        arenaWidth: this.width,
        bossWidth: boss.width,
        horizontalPadding: this.mobileProfile ? 8 : 14
      });
      boss.x = sample.x;
      boss.y = sample.y;
    } else {
      // Harpoon and reactor sentences defend a fixed anchor so the warning,
      // live named socket, and damaging path never slide apart.
      boss.x = state.anchorX;
      boss.y = state.anchorY;
    }
    boss.x = clamp(boss.x, 6, Math.max(6, this.width - boss.width - 6));
    boss.vx = boss.x - previousX;
    boss.vy = boss.y - previousY;
    boss.bossPresentationBankRadians = 0;
    return true;
  }

  private getPrismMothActionId(
    primitiveId: string | undefined
  ): PrismMothActionId | null {
    switch (primitiveId as PrismMothTimelinePrimitiveId) {
      case 'prism-wingbeat-weave':
        return 'wingbeat-weave';
      case 'prism-brood-procession':
        return 'brood-procession';
      case 'prism-lunar-swoop':
        return 'lunar-prism-swoop';
      case 'prism-kaleidoscope-brood':
        return 'kaleidoscope-brood';
      default:
        return null;
    }
  }

  private getPrismMothWingAvailability(boss: Entity) {
    const isOperational = (id: BossPartId) => {
      const component = boss.bossComponents?.find((item) => item.id === id);
      return !component || !component.destroyed;
    };
    return {
      port: isOperational('left-cannon'),
      starboard: isOperational('right-cannon')
    } as const;
  }

  private getPrismMothLoopIndex(boss: Entity) {
    const durationFrames = boss.bossTimeline
      ? getBossTimelineDurationFrames(boss.bossTimeline, GAME_CONFIG.FPS)
      : 1;
    return Math.floor(Math.max(0, boss.attackTimer) / Math.max(1, durationFrames));
  }

  private getPrismMothSeedKey(
    boss: Entity,
    sourceActionId: string,
    loopIndex: number
  ) {
    return [
      this.gameplayRandomSeed,
      boss.sourceEventId ?? boss.id,
      boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? 'unphased',
      sourceActionId,
      loopIndex
    ].join(':');
  }

  private getPrismMothActionScope(
    boss: Entity,
    actionClipId: string,
    loopIndex: number
  ) {
    const timeline = boss.bossTimeline;
    const phaseId = boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? '';
    if (!timeline) {
      return {
        sourceActionId: actionClipId,
        sourceActionEndFrame: boss.attackTimer + GAME_CONFIG.FPS * 4
      };
    }
    const owningAttack = timeline.attacks?.find((attack) => (
      attack.variants.some((variant) => (
        variant.phaseId === phaseId && variant.beatClipIds.includes(actionClipId)
      ))
    ));
    const sourceActionId = owningAttack?.id ?? actionClipId;
    const window = getBossTimelineAttackWindow(
      timeline,
      sourceActionId,
      phaseId,
      GAME_CONFIG.FPS
    );
    const durationFrames = getBossTimelineDurationFrames(timeline, GAME_CONFIG.FPS);
    return {
      sourceActionId,
      sourceActionEndFrame: loopIndex * durationFrames
        + (window?.endFrame ?? Math.min(durationFrames, boss.attackTimer + GAME_CONFIG.FPS * 4))
    };
  }

  private getPrismMothSignatureBeatIndex(actionClipId: string) {
    if (actionClipId.includes('cocoon-charge')) return 0;
    if (actionClipId.includes('first-wing-command')) return 1;
    if (actionClipId.includes('second-wing-command')) return 2;
    if (actionClipId.includes('core-escape')) return 3;
    return 0;
  }

  private getPrismMothSocketOrigin(
    boss: Entity,
    socketId: PrismMothRuntimeSocketId
  ): BossAttackOriginPoint {
    if (socketId === 'prism-core') {
      return this.getPreviewBossWeaponOrigins(boss, ['core'])[0] ?? {
        x: boss.x + boss.width * 0.5,
        y: boss.y + boss.height * 0.57
      };
    }

    const port = socketId.endsWith('-left');
    const role: BossWeaponSocketRole = port ? 'port' : 'starboard';
    const origins = [...this.getPreviewBossWeaponOrigins(boss, [role])]
      .sort((left, right) => left.y - right.y);
    if (origins.length > 0) {
      if (socketId.startsWith('wing-tip-')) return origins[0];
      if (socketId.startsWith('brood-release-')) return origins[origins.length - 1];
      return origins[Math.floor((origins.length - 1) / 2)];
    }

    const xRatio = port ? 0.2 : 0.8;
    const yRatio = socketId.startsWith('wing-tip-')
      ? 0.24
      : socketId.startsWith('brood-release-')
        ? 0.69
        : 0.45;
    return {
      x: boss.x + boss.width * xRatio,
      y: boss.y + boss.height * yRatio
    };
  }

  private resolvePrismMothFormationWithSpacing(
    formation: PrismMothBroodFormation,
    spacingRatio: number
  ): PrismMothBroodFormation {
    const spacingScale = clamp(spacingRatio / 0.22, 0.72, 1.42);
    const slots = formation.slots.map((slot) => {
      const startOffsetRatio = slot.startOffsetRatio * spacingScale;
      const middleOffsetRatio = slot.middleOffsetRatio * spacingScale;
      const endOffsetRatio = slot.endOffsetRatio * spacingScale;
      return Object.freeze({
        ...slot,
        startOffsetRatio,
        middleOffsetRatio,
        endOffsetRatio,
        cocoonXRatio: clamp(
          formation.corridorStartRatio + startOffsetRatio,
          0.06,
          0.94
        )
      });
    });
    return Object.freeze({ ...formation, slots: Object.freeze(slots) });
  }

  private createPrismMothActionState(
    boss: Entity,
    cue: BossTimelineCue,
    sourceClip: BossTimelineCue['clip']
  ): PrismMothActionRuntimeState | null {
    const requestedActionId = this.getPrismMothActionId(sourceClip.primitiveId);
    if (!requestedActionId) return null;
    const loopIndex = this.getPrismMothLoopIndex(boss);
    const phaseId = boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? '';
    const phaseIndex = (boss.activeBossPhaseIndex + 1 >= 2 ? 2 : 1) as 1 | 2;
    const key = `${loopIndex}:${sourceClip.id}:${cue.executionIndex}`;
    const existing = boss.bossPrismMothActionStates.find((state) => state.key === key);
    if (existing) return existing;

    const wings = this.getPrismMothWingAvailability(boss);
    const resolution = resolvePrismMothActionForWings({
      actionId: requestedActionId,
      wings
    });
    const scope = this.getPrismMothActionScope(boss, sourceClip.id, loopIndex);
    const warningFrames = Math.max(
      1,
      Math.round(Math.max(
        cue.clip.durationSeconds,
        sourceClip.startSeconds - cue.clip.startSeconds
      ) * GAME_CONFIG.FPS)
    );
    const sourceDurationFrames = Math.max(
      1,
      Math.round(sourceClip.durationSeconds * GAME_CONFIG.FPS)
    );
    const projectileCount = Math.max(1, Math.floor(sourceClip.parameters?.projectileCount ?? 4));
    const requestedFeatherInterval = Math.max(
      1,
      Math.floor(sourceClip.parameters?.shotIntervalFrames ?? 4)
    );
    const maximumVisibleFeatherInterval = Math.max(
      1,
      Math.floor((sourceDurationFrames - 1) / Math.max(1, projectileCount - 1))
    );
    const state: PrismMothActionRuntimeState = {
      key,
      actionClipId: sourceClip.id,
      executionIndex: cue.executionIndex,
      loopIndex,
      phaseId,
      phaseIndex,
      requestedActionId,
      resolvedActionId: resolution.resolvedActionId,
      sourceActionId: scope.sourceActionId,
      sourceActionEndFrame: scope.sourceActionEndFrame,
      warningStartFrame: boss.attackTimer,
      scheduledFireFrame: boss.attackTimer + warningFrames,
      anchorX: boss.x,
      anchorY: boss.y,
      emittedIndexes: [],
      spawnedNodeIndexes: [],
      featherCount: projectileCount,
      featherIntervalFrames: Math.min(
        requestedFeatherInterval,
        maximumVisibleFeatherInterval
      ),
      featherSpeedScale: clamp(
        Number(sourceClip.parameters?.projectileSpeedScale) || 1,
        0.55,
        1.65
      ),
      fanAngleRadians: clamp(
        Number(sourceClip.parameters?.sweepRangeRatio) || 0.56,
        0.28,
        0.9
      ),
      trailIntervalFrames: Math.max(5, Math.min(18, requestedFeatherInterval)),
      broodHatchDelayFrames: Math.max(
        10,
        Math.min(48, Math.floor(sourceClip.parameters?.shotIntervalFrames ?? 22))
      ),
      broodFlightFrames: Math.max(
        96,
        Math.min(
          300,
          Math.round(180 / Math.max(0.55, Number(sourceClip.parameters?.projectileSpeedScale) || 1))
        )
      )
    };

    const seedKey = this.getPrismMothSeedKey(boss, scope.sourceActionId, loopIndex);
    if (requestedActionId === 'wingbeat-weave') {
      const repeatCount = Math.max(3, Math.min(5, sourceClip.repeat?.count ?? 5));
      const repeatCadence = Math.max(
        8,
        Math.round((sourceClip.repeat?.intervalSeconds ?? 0.72) * GAME_CONFIG.FPS)
      );
      const parameters = resolvePrismWingbeatWeaveParameters({
        cadenceFrames: repeatCadence,
        featherCount: projectileCount,
        fanAngleRadians: state.fanAngleRadians,
        safeLaneWidthRatio: Number(sourceClip.parameters?.channelWidthPixels)
          / Math.max(1, this.width),
        driftSpeedRatio: Number(sourceClip.parameters?.projectileSpeedScale) * 0.06,
        sequenceLength: repeatCount
      });
      const baseSequence = Math.max(0, Math.floor(sourceClip.parameters?.sequence ?? 0));
      const sequence = resolvePrismMothWingbeatSequence({
        seedKey,
        sequence: baseSequence,
        useIndex: loopIndex,
        phaseIndex,
        sequenceLength: parameters.sequenceLength,
        cadenceFrames: parameters.cadenceFrames,
        wings
      });
      const beat = sequence[cue.executionIndex % Math.max(1, sequence.length)];
      if (beat) {
        const remix = resolvePrismMothPhaseRemixRules({
          seedKey,
          sequence: baseSequence,
          useIndex: loopIndex,
          phaseIndex
        });
        state.wingbeatSource = remix.wingbeatWeave.reverseSequence
          && beat.source !== 'both'
          ? beat.source === 'port' ? 'starboard' : 'port'
          : beat.source;
        state.delayedBroodEcho = beat.delayedBroodEcho;
      }
      state.featherCount = parameters.featherCount;
      state.fanAngleRadians = parameters.fanAngleRadians;
    } else if (resolution.resolvedActionId === 'brood-procession') {
      const parameters = resolvePrismBroodProcessionParameters({
        broodNodeCount: projectileCount,
        hatchDelayFrames: state.broodHatchDelayFrames,
        formationSequence: Math.max(0, Math.floor(sourceClip.parameters?.sequence ?? 0)),
        broodSpeedRatio: 0.01 * state.featherSpeedScale,
        formationSpacingRatio: Number(sourceClip.parameters?.sweepRangeRatio) || 0.22,
        routeWidthRatio: Number(sourceClip.parameters?.channelWidthPixels)
          / Math.max(1, this.width),
        formationWaves: sourceClip.parameters?.sweepPasses
      });
      const waveIndex = cue.executionIndex % Math.max(1, parameters.formationWaves);
      const sequence = resolvePrismMothFormationSequence({
        seedKey,
        sequence: parameters.formationSequence,
        waveIndex,
        phaseIndex
      });
      state.formation = this.resolvePrismMothFormationWithSpacing(
        resolvePrismMothBroodFormation({
          sequence,
          nodeCount: parameters.broodNodeCount,
          hatchDelayFrames: parameters.hatchDelayFrames,
          routeWidthRatio: parameters.routeWidthRatio,
          waveIndex,
          phaseIndex,
          pursuitTargetRatio: requestedActionId === 'brood-procession'
            ? clamp(
                (this.player.x + this.player.width / 2) / Math.max(1, this.width),
                0.2,
                0.8
              )
            : undefined
        }),
        parameters.formationSpacingRatio
      );
      state.broodHatchDelayFrames = parameters.hatchDelayFrames;
      state.broodFlightFrames = Math.max(
        96,
        Math.min(300, Math.round(1.8 / parameters.broodSpeedRatio))
      );
    } else if (requestedActionId === 'lunar-prism-swoop') {
      const requestedPassCount = Math.max(
        2,
        Math.min(
          3,
          sourceClip.repeat?.count
            ?? sourceClip.parameters?.sweepPasses
            ?? projectileCount
        )
      );
      const parameters = resolvePrismLunarSwoopParameters({
        passCount: requestedPassCount as 2 | 3,
        swoopFrames: sourceDurationFrames,
        curveDepthRatio: Number(sourceClip.parameters?.sweepRangeRatio) || 0.26,
        edgeTelegraphFrames: warningFrames,
        featherTrailFrames: Math.round(sourceDurationFrames * 0.62)
      });
      const passes = resolvePrismMothSwoopPasses({
        seedKey,
        sequence: Math.max(0, Math.floor(sourceClip.parameters?.sequence ?? 0)),
        useIndex: loopIndex,
        phaseIndex,
        requestedPassCount: parameters.passCount,
        curveDepthRatio: parameters.curveDepthRatio,
        wings
      });
      state.swoopPass = passes[cue.executionIndex % Math.max(1, passes.length)];
      state.trailIntervalFrames = Math.max(
        3,
        Math.min(18, requestedFeatherInterval)
      );
    } else if (requestedActionId === 'kaleidoscope-brood') {
      const beatIndex = this.getPrismMothSignatureBeatIndex(sourceClip.id);
      const baseSequence = Math.max(
        0,
        Math.floor(sourceClip.parameters?.sequence ?? beatIndex) - beatIndex
      );
      const configuredRotation = sourceClip.parameters?.rotationDirection;
      const rotationDirection = configuredRotation === 'clockwise'
        || configuredRotation === 'counterclockwise'
        ? configuredRotation
        : resolvePrismMothSeedBranch({
            seedKey,
            sequence: baseSequence,
            useIndex: loopIndex,
            branchCount: 2
          }) === 0 ? 'clockwise' : 'counterclockwise';
      const parameters = resolvePrismKaleidoscopeBroodParameters({
        broodNodeCount: projectileCount,
        activationSequence: baseSequence,
        rotationDirection,
        corridorWidthRatio: Number(sourceClip.parameters?.channelWidthPixels)
          / Math.max(1, this.width),
        patternBeats: Math.max(4, sourceClip.parameters?.sweepPasses ?? 4),
        coreChargeFrames: Math.round(
          (Number(sourceClip.parameters?.pulseIntervalSeconds) || 1.6) * GAME_CONFIG.FPS
        )
      });
      const signature = resolvePrismMothSignatureSequence({
        seedKey,
        sequence: baseSequence,
        useIndex: loopIndex,
        phaseIndex,
        parameters,
        wings
      });
      state.signatureBeatIndex = beatIndex;
      state.signatureBeat = signature[Math.min(beatIndex, signature.length - 1)];
      const formationSequence = resolvePrismMothFormationSequence({
        seedKey,
        sequence: baseSequence,
        waveIndex: 0,
        phaseIndex
      });
      state.formation = resolvePrismMothBroodFormation({
        sequence: formationSequence,
        nodeCount: parameters.broodNodeCount,
        hatchDelayFrames: state.broodHatchDelayFrames,
        routeWidthRatio: parameters.corridorWidthRatio,
        waveIndex: 0,
        phaseIndex
      });
      state.featherCount = parameters.broodNodeCount;
    }

    boss.bossPrismMothActionStates.push(state);
    return state;
  }

  private applyPrismMothPresentationState(
    boss: Entity,
    state: PrismMothActionRuntimeState
  ) {
    const presentation = boss.bossActionPresentation;
    if (
      !presentation
      || presentation.actionClipId !== state.actionClipId
      || presentation.executionIndex !== state.executionIndex
    ) return;

    if (state.resolvedActionId === 'wingbeat-weave') {
      presentation.motionCue = 'prism-wingbeat';
      presentation.side = state.wingbeatSource === 'both'
        ? undefined
        : state.wingbeatSource;
    } else if (state.resolvedActionId === 'brood-procession') {
      presentation.motionCue = 'prism-brood-deploy';
      presentation.side = undefined;
    } else if (state.resolvedActionId === 'lunar-prism-swoop') {
      presentation.motionCue = 'prism-swoop';
      presentation.side = state.swoopPass?.entrySide;
    } else {
      presentation.motionCue = 'prism-kaleidoscope';
      presentation.side = state.signatureBeat?.source === 'core'
        ? undefined
        : state.signatureBeat?.source;
    }
  }

  private getPrismMothActionSocketIds(
    boss: Entity,
    state: PrismMothActionRuntimeState
  ) {
    const wings = this.getPrismMothWingAvailability(boss);
    if (state.resolvedActionId === 'wingbeat-weave') {
      return resolvePrismMothEmitterSockets({
        role: 'feather',
        source: state.wingbeatSource ?? 'both',
        wings
      });
    }
    if (state.resolvedActionId === 'brood-procession') {
      const requested = wings.port || wings.starboard ? 'both' : 'core';
      return resolvePrismMothEmitterSockets({ role: 'brood', source: requested, wings });
    }
    if (state.resolvedActionId === 'lunar-prism-swoop') {
      return resolvePrismMothEmitterSockets({
        role: 'trail',
        source: state.swoopPass?.trailSourceWing ?? 'both',
        wings
      });
    }
    const source = state.signatureBeat?.source ?? 'core';
    return resolvePrismMothEmitterSockets({
      role: source === 'core' ? 'core' : 'feather',
      source,
      wings
    });
  }

  private showPrismMothAnatomyTelegraph(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    const currentPresentation = boss.bossActionPresentation;
    const currentPrismAction = this.getPrismMothActionId(
      currentPresentation?.primitiveId
    );
    if (
      !currentPrismAction
      || currentPresentation?.stage !== 'fire'
      || boss.attackTimer >= currentPresentation.endFrame
    ) {
      this.setBossActionPresentation(boss, cue, 'warning', linkedAction);
    }
    const state = this.createPrismMothActionState(boss, cue, linkedAction);
    if (!state) return;
    this.applyPrismMothPresentationState(boss, state);
    boss.isCharging = true;

    const color = linkedAction.parameters?.color
      ?? (state.phaseIndex >= 2 ? '#c084fc' : '#67e8f9');
    const sockets = this.getPrismMothActionSocketIds(boss, state);
    for (const socketId of sockets) {
      const origin = this.getPrismMothSocketOrigin(boss, socketId);
      this.spawnBurst(origin.x, origin.y, color, 8, 2.1, 2);
    }
    if (state.resolvedActionId === 'lunar-prism-swoop' && state.swoopPass) {
      const edgeX = state.swoopPass.entrySide === 'port' ? 12 : this.width - 12;
      const edgeY = Math.max(96, this.height * 0.24);
      this.spawnBurst(edgeX, edgeY, color, 12, 2.5, 2);
    }
    if (sockets.length === 0) {
      const core = this.getPrismMothSocketOrigin(boss, 'prism-core');
      this.spawnBurst(core.x, core.y, color, 10, 2.2, 2);
    }
    this.playSound('electricity', 0.46, {
      pitchJitter: 0.015,
      pitchOffset: state.phaseIndex >= 2 ? 0.12 : 0.04
    });
  }

  private beginPrismMothTimelineAction(
    boss: Entity,
    cue: BossTimelineCue
  ) {
    const state = this.createPrismMothActionState(boss, cue, cue.clip);
    if (!state) return;
    const presentation = boss.bossActionPresentation;
    state.fireStartFrame = boss.attackTimer;
    state.fireEndFrame = presentation?.actionClipId === cue.clip.id
      && presentation.executionIndex === cue.executionIndex
      ? presentation.endFrame
      : boss.attackTimer + Math.max(
          1,
          Math.round(cue.clip.durationSeconds * GAME_CONFIG.FPS)
        );
    state.scheduledFireFrame = state.fireStartFrame;

    const wings = this.getPrismMothWingAvailability(boss);
    const resolution = resolvePrismMothActionForWings({
      actionId: state.requestedActionId,
      wings
    });
    state.resolvedActionId = resolution.resolvedActionId;
    if (resolution.resolvedActionId === 'brood-procession' && !state.formation) {
      const parameters = resolvePrismBroodProcessionParameters({
        broodNodeCount: state.featherCount,
        hatchDelayFrames: state.broodHatchDelayFrames,
        formationSequence: Math.max(0, Math.floor(cue.clip.parameters?.sequence ?? 0)),
        broodSpeedRatio: 0.01 * state.featherSpeedScale,
        formationSpacingRatio: Number(cue.clip.parameters?.sweepRangeRatio) || 0.22,
        routeWidthRatio: Number(cue.clip.parameters?.channelWidthPixels)
          / Math.max(1, this.width),
        formationWaves: 1
      });
      const sequence = resolvePrismMothFormationSequence({
        seedKey: this.getPrismMothSeedKey(boss, state.sourceActionId, state.loopIndex),
        sequence: parameters.formationSequence,
        waveIndex: cue.executionIndex % 2,
        phaseIndex: state.phaseIndex
      });
      state.formation = this.resolvePrismMothFormationWithSpacing(
        resolvePrismMothBroodFormation({
          sequence,
          nodeCount: parameters.broodNodeCount,
          hatchDelayFrames: parameters.hatchDelayFrames,
          routeWidthRatio: parameters.routeWidthRatio,
          waveIndex: cue.executionIndex % 2,
          phaseIndex: state.phaseIndex,
          pursuitTargetRatio: state.requestedActionId === 'brood-procession'
            ? clamp(
                (this.player.x + this.player.width / 2) / Math.max(1, this.width),
                0.2,
                0.8
              )
            : undefined
        }),
        parameters.formationSpacingRatio
      );
    }
    this.applyPrismMothPresentationState(boss, state);
    boss.isCharging = false;
  }

  private spawnPrismMothFeather(
    boss: Entity,
    state: PrismMothActionRuntimeState,
    socketId: PrismMothRuntimeSocketId,
    angleRadians: number,
    speed: number,
    variant: number,
    kind: 'feather' | 'swoop-trail' = 'feather'
  ) {
    const origin = this.getPrismMothSocketOrigin(boss, socketId);
    const width = this.mobileProfile ? 13 : 16;
    const height = this.mobileProfile ? 21 : 25;
    const feather = this.createEntity(
      EntityType.PROJECTILE,
      origin.x - width / 2,
      origin.y - height / 2
    );
    feather.vx = Math.cos(angleRadians) * speed;
    feather.vy = Math.sin(angleRadians) * speed;
    feather.width = width;
    feather.height = height;
    feather.color = variant % 3 === 0
      ? '#67e8f9'
      : variant % 3 === 1 ? '#c084fc' : '#f0abfc';
    feather.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    feather.bossOwnerId = boss.id;
    feather.sourceEventId = boss.sourceEventId;
    feather.sourceItemId = boss.sourceItemId;
    feather.projectileVisualKind = 'boss-prism-feather';
    feather.weaponVisualStartFrame = this.frameCount;
    feather.variant = variant;
    feather.prismMothArtifactState = {
      kind,
      sourceActionId: state.sourceActionId,
      sourceActionEndFrame: state.sourceActionEndFrame,
      sourcePhaseId: state.phaseId,
      collisionActive: true,
      damageActive: true,
      spawnFrame: this.frameCount
    };
    this.entities.push(feather);
    return feather;
  }

  private spawnPrismMothBroodNode(
    boss: Entity,
    state: PrismMothActionRuntimeState,
    formation: PrismMothBroodFormation,
    slot: PrismMothBroodFormationSlot,
    options: {
      activationFrame?: number;
      signatureNodeIndex?: number;
      forceCore?: boolean;
    } = {}
  ) {
    const ownedBroodCount = this.entities.filter((entity) => (
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.prismMothArtifactState?.kind === 'brood'
    )).length;
    if (ownedBroodCount >= 10) return null;

    const wings = this.getPrismMothWingAvailability(boss);
    const source: PrismMothWingSide | 'core' = options.forceCore
      || (!wings.port && !wings.starboard)
      ? 'core'
      : slot.side;
    const socketIds = resolvePrismMothEmitterSockets({
      role: source === 'core' ? 'core' : 'brood',
      source,
      wings
    });
    const socketId = socketIds[0] ?? 'prism-core';
    const origin = this.getPrismMothSocketOrigin(boss, socketId);
    const size = this.mobileProfile ? 20 : 24;
    const node = this.createEntity(
      EntityType.PROJECTILE,
      origin.x - size / 2,
      origin.y - size / 2
    );
    node.width = size;
    node.height = size;
    node.vx = 0;
    node.vy = 0;
    node.color = '#a5f3fc';
    node.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    node.bossOwnerId = boss.id;
    node.sourceEventId = boss.sourceEventId;
    node.sourceItemId = boss.sourceItemId;
    node.projectileVisualKind = 'boss-prism-cocoon';
    node.projectileAnimationMode = 'play-once-before-last';
    node.weaponVisualStartFrame = this.frameCount;
    node.variant = state.loopIndex * 1000 + state.executionIndex * 100 + slot.index;
    const destructible = state.requestedActionId === 'brood-procession';
    if (destructible) {
      node.hp = 2;
      node.maxHp = 2;
      node.scoreValue = 0;
      node.powerupDropChance = 0;
    }
    node.prismMothArtifactState = {
      kind: 'brood',
      sourceActionId: state.sourceActionId,
      sourceActionEndFrame: state.sourceActionEndFrame,
      sourcePhaseId: state.phaseId,
      destructible,
      targetable: false,
      collisionActive: false,
      damageActive: false,
      spawnFrame: this.frameCount,
      formation,
      formationSlot: slot,
      deployOriginX: origin.x,
      deployOriginY: origin.y,
      cocoonX: slot.cocoonXRatio * this.width,
      cocoonY: slot.cocoonYRatio * this.height,
      hatchDelayFrames: state.broodHatchDelayFrames,
      flightFrames: state.broodFlightFrames,
      activationFrame: options.activationFrame,
      signatureNodeIndex: options.signatureNodeIndex
    };
    this.entities.push(node);
    return node;
  }

  private updatePrismMothWingbeatState(
    boss: Entity,
    state: PrismMothActionRuntimeState
  ) {
    const fireStartFrame = state.fireStartFrame;
    const fireEndFrame = state.fireEndFrame;
    if (fireStartFrame === undefined || fireEndFrame === undefined) return;
    const elapsedFrames = boss.attackTimer - fireStartFrame;
    if (elapsedFrames < 0 || boss.attackTimer >= fireEndFrame) return;
    const latestDueIndex = Math.min(
      state.featherCount - 1,
      Math.floor(elapsedFrames / Math.max(1, state.featherIntervalFrames))
    );
    const wings = this.getPrismMothWingAvailability(boss);
    for (let index = 0; index <= latestDueIndex; index += 1) {
      if (state.emittedIndexes.includes(index)) continue;
      const source = state.wingbeatSource === 'both'
        ? index % 2 === 0 ? 'port' : 'starboard'
        : state.wingbeatSource ?? (index % 2 === 0 ? 'port' : 'starboard');
      const socketId = resolvePrismMothEmitterSockets({
        role: 'feather',
        source,
        wings
      })[0];
      if (!socketId) continue;
      const spreadProgress = state.featherCount <= 1
        ? 0.5
        : index / (state.featherCount - 1);
      const outwardSign = source === 'port' ? 1 : -1;
      const outwardAngle = state.fanAngleRadians * (0.28 + spreadProgress * 0.72);
      const angle = Math.PI / 2 + outwardSign * outwardAngle;
      const speed = Math.max(
        2.6,
        (Number(boss.projectileSpeed) || 5.6) * 0.68 * state.featherSpeedScale
      );
      this.spawnPrismMothFeather(
        boss,
        state,
        socketId,
        angle,
        speed,
        state.loopIndex * 10000 + state.executionIndex * 100 + index
      );
      state.emittedIndexes.push(index);
      this.spawnBurst(
        this.getPrismMothSocketOrigin(boss, socketId).x,
        this.getPrismMothSocketOrigin(boss, socketId).y,
        index % 2 === 0 ? '#67e8f9' : '#c084fc',
        3,
        1.6,
        2
      );
      this.playSound('boss_shoot', 0.42, {
        pitchJitter: 0.025,
        pitchOffset: source === 'port' ? 0.06 : 0.12
      });
    }

    if (
      state.delayedBroodEcho
      && !state.spawnedNodeIndexes.includes(900)
      && elapsedFrames >= Math.max(1, Math.floor((fireEndFrame - fireStartFrame) * 0.62))
    ) {
      const source = state.wingbeatSource === 'starboard' ? 'starboard' : 'port';
      const sequence = resolvePrismMothFormationSequence({
        seedKey: this.getPrismMothSeedKey(boss, state.sourceActionId, state.loopIndex),
        sequence: state.executionIndex + 17,
        waveIndex: 0,
        phaseIndex: state.phaseIndex
      });
      const formation = resolvePrismMothBroodFormation({
        sequence,
        nodeCount: 3,
        hatchDelayFrames: 10,
        routeWidthRatio: 0.34,
        waveIndex: 0,
        phaseIndex: state.phaseIndex
      });
      const slot = formation.slots.find((candidate) => candidate.side === source)
        ?? formation.slots[0];
      if (slot) {
        this.spawnPrismMothBroodNode(boss, state, formation, slot, {
          activationFrame: this.frameCount
        });
      }
      state.spawnedNodeIndexes.push(900);
    }
  }

  private updatePrismMothBroodState(
    boss: Entity,
    state: PrismMothActionRuntimeState
  ) {
    const fireStartFrame = state.fireStartFrame;
    const fireEndFrame = state.fireEndFrame;
    const formation = state.formation;
    if (
      fireStartFrame === undefined
      || fireEndFrame === undefined
      || !formation
      || boss.attackTimer < fireStartFrame
      || boss.attackTimer >= fireEndFrame
    ) return;
    const elapsedFrames = boss.attackTimer - fireStartFrame;
    const releaseIntervalFrames = Math.max(
      4,
      Math.min(10, Math.floor(state.broodHatchDelayFrames / 2))
    );
    for (const slot of formation.slots) {
      if (elapsedFrames < slot.index * releaseIntervalFrames) break;
      if (state.spawnedNodeIndexes.includes(slot.index)) continue;
      this.spawnPrismMothBroodNode(boss, state, formation, slot, {
        activationFrame: this.frameCount,
        forceCore: state.resolvedActionId === 'brood-procession'
          && !this.getPrismMothWingAvailability(boss).port
          && !this.getPrismMothWingAvailability(boss).starboard
      });
      state.spawnedNodeIndexes.push(slot.index);
      this.playSound('boss_shoot', 0.34, {
        pitchJitter: 0.02,
        pitchOffset: 0.18 + slot.index * 0.025
      });
    }
  }

  private activatePrismMothSignatureNodes(
    boss: Entity,
    state: PrismMothActionRuntimeState
  ) {
    if (state.signatureNodesActivated || !state.signatureBeat) return;
    const beat = state.signatureBeat;
    const nodeIndexes = beat.finalEscapeBeat
      ? null
      : new Set(beat.activatedNodeIndexes);
    for (const entity of this.entities) {
      const artifact = entity.prismMothArtifactState;
      if (
        entity.markedForDeletion
        || entity.bossOwnerId !== boss.id
        || artifact?.kind !== 'brood'
        || artifact.sourceActionId !== state.sourceActionId
        || artifact.signatureNodeIndex === undefined
        || artifact.activationFrame !== undefined
        || (nodeIndexes && !nodeIndexes.has(artifact.signatureNodeIndex))
      ) continue;
      artifact.activationFrame = this.frameCount;
      entity.weaponVisualStartFrame = this.frameCount;
      entity.projectileAnimationMode = 'cycle';
    }
    state.signatureNodesActivated = true;
  }

  private updatePrismMothSignatureState(
    boss: Entity,
    state: PrismMothActionRuntimeState
  ) {
    const fireStartFrame = state.fireStartFrame;
    const fireEndFrame = state.fireEndFrame;
    const beat = state.signatureBeat;
    if (
      fireStartFrame === undefined
      || fireEndFrame === undefined
      || !beat
      || boss.attackTimer < fireStartFrame
      || boss.attackTimer >= fireEndFrame
    ) return;
    const elapsedFrames = boss.attackTimer - fireStartFrame;
    const durationFrames = Math.max(1, fireEndFrame - fireStartFrame);
    const progress = clamp(elapsedFrames / durationFrames, 0, 1);

    if ((state.signatureBeatIndex ?? 0) === 0) {
      const formation = state.formation;
      if (!formation) return;
      const releaseIntervalFrames = Math.max(
        5,
        Math.floor(durationFrames / Math.max(1, formation.slots.length + 1))
      );
      for (const slot of formation.slots) {
        if (elapsedFrames < slot.index * releaseIntervalFrames) break;
        if (state.spawnedNodeIndexes.includes(slot.index)) continue;
        this.spawnPrismMothBroodNode(boss, state, formation, slot, {
          signatureNodeIndex: slot.index
        });
        state.spawnedNodeIndexes.push(slot.index);
      }
      return;
    }

    this.activatePrismMothSignatureNodes(boss, state);
    const cadence = Math.max(6, Math.min(16, state.trailIntervalFrames));
    const pulseIndex = Math.floor(elapsedFrames / cadence);
    if (state.emittedIndexes.includes(pulseIndex)) return;
    const corridor = samplePrismMothSignatureCorridor({
      beat,
      progress,
      arenaWidth: this.width,
      playerRadiusPx: Math.max(8, this.player.width * 0.18)
    });
    const laneCount = this.mobileProfile ? 7 : 9;
    const candidates = Array.from({ length: laneCount }, (_, index) => (
      this.width * ((index + 0.5) / laneCount)
    )).filter((x) => x < corridor.minimumX || x > corridor.maximumX);
    if (candidates.length === 0) return;
    const ordered = beat.rotationDirection === 'clockwise'
      ? candidates
      : [...candidates].reverse();
    const targetX = ordered[pulseIndex % ordered.length];
    const targetY = this.height + 36;
    const wings = this.getPrismMothWingAvailability(boss);
    const source = beat.source;
    const socketId = resolvePrismMothEmitterSockets({
      role: source === 'core' ? 'core' : 'feather',
      source,
      wings
    })[0] ?? 'prism-core';
    const origin = this.getPrismMothSocketOrigin(boss, socketId);
    const angle = Math.atan2(targetY - origin.y, targetX - origin.x);
    this.spawnPrismMothFeather(
      boss,
      state,
      socketId,
      angle,
      Math.max(2.9, (Number(boss.projectileSpeed) || 5.6) * 0.62 * state.featherSpeedScale),
      5000 + (state.signatureBeatIndex ?? 0) * 100 + pulseIndex
    );
    state.emittedIndexes.push(pulseIndex);
    this.playSound('boss_shoot', 0.4, {
      pitchJitter: 0.015,
      pitchOffset: beat.finalEscapeBeat ? 0.2 : 0.1
    });
  }

  private updatePrismMothActionRuntime(boss: Entity) {
    if (!this.isSandboxPrismMoth(boss)) return;
    for (const state of boss.bossPrismMothActionStates) {
      if (state.phaseId !== (boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? '')) {
        continue;
      }
      if (state.resolvedActionId === 'wingbeat-weave') {
        this.updatePrismMothWingbeatState(boss, state);
      } else if (state.resolvedActionId === 'brood-procession') {
        this.updatePrismMothBroodState(boss, state);
      } else if (state.resolvedActionId === 'kaleidoscope-brood') {
        this.updatePrismMothSignatureState(boss, state);
      }
    }
    boss.bossPrismMothActionStates = boss.bossPrismMothActionStates.filter((state) => {
      const terminalFrame = state.fireEndFrame === undefined
        ? state.scheduledFireFrame + GAME_CONFIG.FPS
        : state.fireEndFrame + 36;
      return boss.attackTimer <= terminalFrame;
    });
  }

  private updatePrismMothOwnedArtifact(entity: Entity) {
    const state = entity.prismMothArtifactState;
    if (!state) return false;
    const owner = this.entities.find((candidate) => candidate.id === entity.bossOwnerId);
    const ownerAlive = Boolean(owner && !owner.markedForDeletion && owner.hp > 0);
    const sourceActionActive = Boolean(
      owner
      && (owner.bossTimelinePhaseId ?? owner.activeBossPhaseId ?? '') === state.sourcePhaseId
      && owner.attackTimer < state.sourceActionEndFrame
    );

    if (state.kind !== 'brood') {
      const authority = resolvePrismMothOwnedArtifactState({
        ownerAlive,
        sourceActionActive,
        lifecycleComplete: false,
        visibleCollisionActive: true,
        visibleDamageActive: true
      });
      state.collisionActive = authority.collisionActive;
      state.damageActive = authority.damageActive;
      if (authority.shouldCleanup) entity.markedForDeletion = true;
      return false;
    }

    const formation = state.formation;
    const slot = state.formationSlot;
    if (!formation || !slot) {
      entity.markedForDeletion = true;
      return true;
    }
    const deployFrames = 30;
    const hatchDelayFrames = Math.max(10, state.hatchDelayFrames ?? 22);
    const flightFrames = Math.max(60, state.flightFrames ?? 180);
    const chronologicalAge = Math.max(0, this.frameCount - state.spawnFrame);
    const lifecycleAge = state.activationFrame === undefined
      ? Math.min(chronologicalAge, deployFrames + hatchDelayFrames - 1)
      : state.activationFrame <= state.spawnFrame
        ? chronologicalAge
        : this.frameCount < state.activationFrame
          ? Math.min(chronologicalAge, deployFrames + hatchDelayFrames - 1)
          : deployFrames + hatchDelayFrames + (this.frameCount - state.activationFrame);
    const lifecycle = samplePrismMothBroodLifecycle({
      ageFrames: lifecycleAge,
      deployFrames,
      hatchDelayFrames,
      hatchFrames: 18,
      flightFrames,
      exitFrames: 30
    });
    const authority = resolvePrismMothOwnedArtifactState({
      ownerAlive,
      sourceActionActive,
      lifecycleComplete: lifecycle.shouldCleanup,
      visibleCollisionActive: lifecycle.collisionActive,
      visibleDamageActive: lifecycle.damageActive
    });
    state.collisionActive = authority.collisionActive;
    state.damageActive = authority.damageActive;
    state.targetable = Boolean(
      state.destructible
      && lifecycle.targetable
      && ownerAlive
      && sourceActionActive
    );
    if (authority.shouldCleanup) {
      entity.markedForDeletion = true;
      return true;
    }

    const cocoonX = state.cocoonX ?? slot.cocoonXRatio * this.width;
    const cocoonY = state.cocoonY ?? slot.cocoonYRatio * this.height;
    if (
      lifecycle.stage === 'cocoon-deploying'
      || lifecycle.stage === 'cocoon-armed'
      || lifecycle.stage === 'hatching'
    ) {
      const deployProgress = clamp(chronologicalAge / deployFrames, 0, 1);
      const eased = deployProgress * deployProgress * (3 - 2 * deployProgress);
      const originX = state.deployOriginX ?? cocoonX;
      const originY = state.deployOriginY ?? cocoonY;
      const centerX = originX + (cocoonX - originX) * eased;
      const centerY = originY + (cocoonY - originY) * eased;
      entity.width = this.mobileProfile ? 20 : 24;
      entity.height = this.mobileProfile ? 22 : 27;
      entity.x = centerX - entity.width / 2;
      entity.y = centerY - entity.height / 2;
      entity.vx = 0;
      entity.vy = 0;
      if (entity.projectileVisualKind !== 'boss-prism-cocoon') {
        entity.projectileVisualKind = 'boss-prism-cocoon';
        entity.weaponVisualStartFrame = this.frameCount;
      }
      entity.projectileAnimationMode = lifecycle.stage === 'cocoon-armed'
        ? 'hold-last'
        : lifecycle.stage === 'cocoon-deploying'
          ? 'play-once-before-last'
          : 'cycle';
      return true;
    }

    const flyingAt = deployFrames + hatchDelayFrames + 18;
    const flightProgress = clamp((lifecycleAge - flyingAt) / flightFrames, 0, 1);
    const path = samplePrismMothBroodPath({
      formation,
      slot,
      progress: flightProgress,
      arenaWidth: this.width,
      arenaHeight: this.height,
      broodRadiusPx: this.mobileProfile ? 9 : 11,
      edgePaddingPx: this.mobileProfile ? 6 : 8
    });
    entity.width = this.mobileProfile ? 18 : 22;
    entity.height = this.mobileProfile ? 16 : 19;
    entity.x = path.centerX - entity.width / 2;
    entity.y = path.centerY - entity.height / 2;
    entity.vx = path.velocityX;
    entity.vy = path.velocityY;
    if (entity.projectileVisualKind !== 'boss-prism-broodling') {
      entity.projectileVisualKind = 'boss-prism-broodling';
      entity.weaponVisualStartFrame = this.frameCount;
    }
    entity.projectileAnimationMode = 'cycle';
    return true;
  }

  private updatePrismMothTimelineMovement(
    boss: Entity,
    targetEntranceY: number,
    healthRatio: number
  ) {
    if (!this.isSandboxPrismMoth(boss)) return false;
    const hasSwoopState = boss.bossPrismMothActionStates.some((state) => (
      state.resolvedActionId === 'lunar-prism-swoop' && state.swoopPass
    ));
    if (boss.y < targetEntranceY && !hasSwoopState) return false;
    boss.bossPrismMothBodyDamageActive = false;
    const now = boss.attackTimer;
    const activeSwoop = [...boss.bossPrismMothActionStates].reverse().find((state) => (
      state.resolvedActionId === 'lunar-prism-swoop'
      && state.swoopPass
      && state.fireStartFrame !== undefined
      && state.fireEndFrame !== undefined
      && now >= state.fireStartFrame
      && now < state.fireEndFrame
    ));
    if (activeSwoop?.swoopPass && activeSwoop.fireStartFrame !== undefined && activeSwoop.fireEndFrame !== undefined) {
      const previousX = boss.x;
      const previousY = boss.y;
      const progress = clamp(
        (now - activeSwoop.fireStartFrame)
          / Math.max(1, activeSwoop.fireEndFrame - activeSwoop.fireStartFrame),
        0,
        1
      );
      const sample = samplePrismMothSwoopPass({
        pass: activeSwoop.swoopPass,
        progress,
        arenaWidth: this.width,
        arenaHeight: this.height,
        bossWidth: boss.width,
        bossHeight: boss.height,
        edgePaddingPx: this.mobileProfile ? 6 : 10
      });
      boss.x = sample.x;
      boss.y = sample.y;
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians = sample.bankRadians;
      boss.bossPrismMothBodyDamageActive = sample.visible && sample.damageActive;

      const elapsedFrames = now - activeSwoop.fireStartFrame;
      const trailIndex = Math.floor(elapsedFrames / activeSwoop.trailIntervalFrames);
      const trailMarker = 1000 + trailIndex;
      if (
        sample.featherTrailActive
        && !activeSwoop.emittedIndexes.includes(trailMarker)
      ) {
        const socketId = resolvePrismMothEmitterSockets({
          role: 'trail',
          source: activeSwoop.swoopPass.trailSourceWing,
          wings: this.getPrismMothWingAvailability(boss)
        })[0];
        if (socketId) {
          const outward = activeSwoop.swoopPass.trailSourceWing === 'port' ? 0.24 : -0.24;
          this.spawnPrismMothFeather(
            boss,
            activeSwoop,
            socketId,
            Math.PI / 2 + outward,
            Math.max(2.3, (Number(boss.projectileSpeed) || 5.6) * 0.5),
            7000 + activeSwoop.executionIndex * 100 + trailIndex,
            'swoop-trail'
          );
        }
        activeSwoop.emittedIndexes.push(trailMarker);
      }
      if (
        activeSwoop.swoopPass.leavesCocoon
        && progress >= 0.72
        && !activeSwoop.spawnedNodeIndexes.includes(901)
      ) {
        const sequence = resolvePrismMothFormationSequence({
          seedKey: this.getPrismMothSeedKey(
            boss,
            activeSwoop.sourceActionId,
            activeSwoop.loopIndex
          ),
          sequence: activeSwoop.executionIndex + 29,
          waveIndex: 0,
          phaseIndex: activeSwoop.phaseIndex
        });
        const formation = resolvePrismMothBroodFormation({
          sequence,
          nodeCount: 3,
          hatchDelayFrames: 12,
          routeWidthRatio: 0.34,
          phaseIndex: activeSwoop.phaseIndex
        });
        const slot = formation.slots[activeSwoop.executionIndex % formation.slots.length];
        if (slot) {
          this.spawnPrismMothBroodNode(boss, activeSwoop, formation, slot, {
            activationFrame: this.frameCount
          });
        }
        activeSwoop.spawnedNodeIndexes.push(901);
      }
      return true;
    }

    const preparingSwoop = [...boss.bossPrismMothActionStates].reverse().find((state) => (
      state.resolvedActionId === 'lunar-prism-swoop'
      && state.swoopPass
      && state.fireStartFrame === undefined
      && now >= state.warningStartFrame
      && now < state.scheduledFireFrame
    ));
    if (preparingSwoop?.swoopPass) {
      if (preparingSwoop.preparationActivatedFrame === undefined) {
        preparingSwoop.preparationActivatedFrame = now;
        preparingSwoop.preparationStartX = boss.x;
        preparingSwoop.preparationStartY = boss.y;
      }
      const destination = samplePrismMothSwoopPass({
        pass: preparingSwoop.swoopPass,
        progress: 0,
        arenaWidth: this.width,
        arenaHeight: this.height,
        bossWidth: boss.width,
        bossHeight: boss.height,
        edgePaddingPx: this.mobileProfile ? 6 : 10
      });
      const progress = clamp(
        (now - preparingSwoop.preparationActivatedFrame)
          / Math.max(1, preparingSwoop.scheduledFireFrame - preparingSwoop.preparationActivatedFrame),
        0,
        1
      );
      const eased = progress * progress * (3 - 2 * progress);
      const previousX = boss.x;
      const previousY = boss.y;
      boss.x = Number(preparingSwoop.preparationStartX)
        + (destination.x - Number(preparingSwoop.preparationStartX)) * eased;
      boss.y = Number(preparingSwoop.preparationStartY)
        + (destination.y - Number(preparingSwoop.preparationStartY)) * eased;
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians = destination.bankRadians * eased;
      return true;
    }

    const returningSwoop = [...boss.bossPrismMothActionStates].reverse().find((state) => (
      state.resolvedActionId === 'lunar-prism-swoop'
      && state.fireEndFrame !== undefined
      && now >= state.fireEndFrame
      && now <= state.fireEndFrame + 24
    ));
    if (returningSwoop?.fireEndFrame !== undefined) {
      if (returningSwoop.returnStartFrame === undefined) {
        returningSwoop.returnStartFrame = now;
        returningSwoop.returnEndFrame = now + 24;
        returningSwoop.returnStartX = boss.x;
        returningSwoop.returnStartY = boss.y;
      }
      const progress = clamp(
        (now - returningSwoop.returnStartFrame)
          / Math.max(1, Number(returningSwoop.returnEndFrame) - returningSwoop.returnStartFrame),
        0,
        1
      );
      const eased = progress * progress * (3 - 2 * progress);
      const previousX = boss.x;
      const previousY = boss.y;
      boss.x = Number(returningSwoop.returnStartX)
        + (returningSwoop.anchorX - Number(returningSwoop.returnStartX)) * eased;
      boss.y = Number(returningSwoop.returnStartY)
        + (returningSwoop.anchorY - Number(returningSwoop.returnStartY)) * eased;
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians += (0 - boss.bossPresentationBankRadians) * 0.24;
      return true;
    }

    const phaseIndex = boss.activeBossPhaseIndex + 1 >= 2 ? 2 : 1;
    const pressure = 1 - clamp(healthRatio, 0, 1);
    const horizontalAmplitude = Math.max(16, this.width - boss.width - 24)
      * (phaseIndex >= 2 ? 0.32 : 0.2);
    const centerX = (this.width - boss.width) / 2;
    const targetX = centerX + Math.sin(now * (phaseIndex >= 2 ? 0.012 : 0.009)) * horizontalAmplitude;
    const targetY = targetEntranceY
      + (0.5 + Math.sin(now * 0.014 + Math.PI * 0.3) * 0.5)
      * Math.min(this.height * 0.075, phaseIndex >= 2 ? 72 : 48);
    const follow = (phaseIndex >= 2 ? 0.025 : 0.018) + pressure * 0.006;
    boss.x += (targetX - boss.x) * follow;
    boss.y += (targetY - boss.y) * follow;
    boss.x = clamp(boss.x, 8, Math.max(8, this.width - boss.width - 8));
    boss.y = clamp(boss.y, targetEntranceY, Math.max(targetEntranceY, this.height * 0.42));
    boss.vx = 0;
    boss.vy = 0;
    boss.bossPresentationBankRadians += (0 - boss.bossPresentationBankRadians) * 0.18;
    return true;
  }

  private clearPrismMothRuntime(boss: Entity) {
    if (!this.isSandboxPrismMoth(boss)) return;
    for (const entity of this.entities) {
      if (entity.bossOwnerId === boss.id && entity.prismMothArtifactState) {
        entity.markedForDeletion = true;
      }
    }
    boss.bossPrismMothActionStates = [];
    boss.bossPrismMothBodyDamageActive = false;
    boss.bossPresentationBankRadians = 0;
  }

  private showHeliosAnatomyTelegraph(
    boss: Entity,
    cue: BossTimelineCue,
    linkedAction: BossTimelineCue['clip']
  ) {
    const sequence = resolveBossPatternSequence(
      linkedAction.parameters?.sequence,
      cue.executionIndex
    );
    boss.isCharging = true;
    if (linkedAction.primitiveId === 'tracking-pincer-dive' && sequence % 4 === 0) {
      const riseY = Math.max(10, boss.y - boss.height * 0.24);
      boss.bossTrackingPincerState = {
        actionClipId: linkedAction.id,
        anchorX: boss.x,
        anchorY: boss.y,
        riseX: boss.x,
        riseY,
        targetX: boss.x,
        targetY: boss.y
      };
      this.playSound('boss_roar', 0.68, { pitchJitter: 0.015, pitchOffset: -0.12 });
      return;
    }
    if (linkedAction.primitiveId === 'articulated-melee-sweep') {
      const requestedSide = linkedAction.parameters?.side
        ?? (sequence % 2 === 0 ? 'port' : 'starboard');
      const plan = resolveHeliosClampPlan({
        requestedSide,
        portOperational: this.isHeliosClawOperational(boss, 'port'),
        starboardOperational: this.isHeliosClawOperational(boss, 'starboard')
      });
      if (plan.skipped) {
        boss.bossHeliosCornerClampState = undefined;
        boss.isCharging = false;
        return;
      }
      const activeSide = plan.activeSide;
      const placement = resolveHeliosCornerClampPlacement({
        side: activeSide ?? 'port',
        viewportWidth: this.width,
        viewportHeight: this.height,
        bossWidth: boss.width,
        bossHeight: boss.height,
        mobileProfile: this.mobileProfile
      });
      boss.bossHeliosCornerClampState = {
        actionClipId: linkedAction.id,
        executionIndex: cue.executionIndex,
        activeSide,
        fallbackToCrossfire: plan.fallbackToCrossfire,
        anchorX: boss.x,
        anchorY: boss.y,
        cornerX: placement.cornerX,
        cornerY: placement.cornerY,
        lockedX: placement.cornerX
      };
      if (plan.fallbackToCrossfire && boss.bossActionPresentation) {
        boss.bossActionPresentation.motionCue = 'paired-crossfire';
        boss.bossActionPresentation.projectileCount = 4;
      }
      this.playSound(
        plan.fallbackToCrossfire ? 'boss_machinegun' : 'boss_roar',
        plan.fallbackToCrossfire ? 0.42 : 0.58,
        { pitchJitter: 0.01, pitchOffset: plan.fallbackToCrossfire ? -0.18 : -0.1 }
      );
      return;
    }
    if (linkedAction.primitiveId === 'paired-cannon-burst') {
      if (linkedAction.parameters?.motionCue === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE) {
        const existingChannel = boss.bossHeliosMachineGunChannelState;
        if (
          cue.executionIndex > 0
          && existingChannel?.actionClipId === linkedAction.id
          && boss.attackTimer < existingChannel.fireEndFrame
        ) {
          boss.isCharging = false;
          return;
        }
        const warningFrames = Math.max(
          1,
          Math.round(Math.max(
            cue.clip.durationSeconds,
            Number(cue.clip.parameters?.warningSeconds) || 0,
            linkedAction.startSeconds - cue.clip.startSeconds
          ) * GAME_CONFIG.FPS)
        );
        const actionFrames = Math.max(
          1,
          Math.round(linkedAction.durationSeconds * GAME_CONFIG.FPS)
        );
        const repeatCount = Math.max(1, Math.min(
          8,
          Math.floor(linkedAction.repeat?.count ?? 1)
        ));
        const repeatIntervalFrames = linkedAction.repeat
          ? Math.max(1, Math.round(linkedAction.repeat.intervalSeconds * GAME_CONFIG.FPS))
          : 0;
        const fireStartFrame = boss.attackTimer + warningFrames;
        const channelUseIndex = boss.bossHeliosMachineGunChannelUseCount;
        const channelSequence = resolveHeliosMachineGunChannelSequence({
          sequence,
          useIndex: channelUseIndex,
          seedKey: [
            this.gameplayRandomSeed,
            boss.sourceEventId ?? boss.id,
            boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? 'unphased',
            linkedAction.id
          ].join(':')
        });
        boss.bossHeliosMachineGunChannelUseCount = channelUseIndex + 1;
        boss.bossHeliosMachineGunChannelState = {
          actionClipId: linkedAction.id,
          sequence,
          directionSequence: channelSequence,
          anchorX: boss.x,
          anchorY: boss.y,
          warningStartFrame: boss.attackTimer,
          fireStartFrame,
          fireEndFrame: fireStartFrame
            + Math.max(0, repeatCount - 1) * repeatIntervalFrames
            + actionFrames,
          channelWidthPixels: clamp(
            Number(linkedAction.parameters?.channelWidthPixels) || 116,
            72,
            320
          ),
          sweepRangeRatio: clamp(
            Number(linkedAction.parameters?.sweepRangeRatio) || 0.34,
            0.1,
            0.8
          ),
          sweepPasses: Math.max(1, Math.min(
            3,
            Math.floor(linkedAction.parameters?.sweepPasses ?? 1)
          )),
          shotIntervalFrames: Math.max(2, Math.min(
            12,
            Math.floor(linkedAction.parameters?.shotIntervalFrames ?? 3)
          )),
          projectileSpeedScale: clamp(
            Number(linkedAction.parameters?.projectileSpeedScale) || 1,
            0.5,
            2
          )
        };
        boss.bossTimelineTargetClipId = linkedAction.id;
        boss.bossTimelineTargetExecutionIndex = 0;
        boss.bossTimelineTargetX = this.width / 2;
        boss.bossTimelineTargetY = this.height + 24;
        for (const origin of this.getPreviewBossWeaponOrigins(
          boss,
          ['port', 'starboard']
        )) {
          this.spawnBurst(origin.x, origin.y, '#f59e0b', 3, 1.25, 2);
        }
        this.playSound('boss_machinegun', 0.42, {
          pitchJitter: 0.008,
          pitchOffset: -0.3
        });
        return;
      }
      boss.bossTimelineTargetClipId = linkedAction.id;
      boss.bossTimelineTargetExecutionIndex = cue.executionIndex;
      const sides = resolveHeliosCrossfireSides(linkedAction.parameters?.side);
      // One-sided bursts mix a few deterministic shots toward this warning-
      // locked point. The coordinated finisher keeps its fixed safe corridor.
      boss.bossTimelineTargetX = sides.length === 1
        ? this.player.x + this.player.width / 2
        : this.width / 2;
      boss.bossTimelineTargetY = sides.length === 1
        ? this.player.y + this.player.height / 2
        : this.height * 0.82;
      this.playSound('boss_machinegun', 0.38, { pitchJitter: 0.01, pitchOffset: -0.24 });
      return;
    }
    if (linkedAction.primitiveId === 'reactor-aperture-pattern') {
      const core = this.getPreviewBossWeaponOrigins(boss, ['core'])[0];
      if (core) {
        this.spawnBurst(core.x, core.y, '#f59e0b', 7, 2.2, 3);
      }
      boss.bossTimelineTargetClipId = linkedAction.id;
      boss.bossTimelineTargetExecutionIndex = cue.executionIndex;
      boss.bossTimelineTargetX = this.player.x + this.player.width / 2;
      boss.bossTimelineTargetY = this.player.y + this.player.height / 2;
      if (linkedAction.parameters?.motionCue === 'reactor-mines') {
        const mineUseIndex = boss.bossHeliosMineFormationUseCount;
        boss.bossHeliosMineFormationState = {
          actionClipId: linkedAction.id,
          executionIndex: cue.executionIndex,
          sequence: resolveHeliosMineFormationSequence({
            sequence,
            useIndex: mineUseIndex,
            seedKey: [
              this.gameplayRandomSeed,
              boss.sourceEventId ?? boss.id,
              boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? 'unphased',
              linkedAction.id
            ].join(':')
          })
        };
        boss.bossHeliosMineFormationUseCount = mineUseIndex + 1;
      }
      this.playSound('electricity', 0.44, { pitchJitter: 0.015, pitchOffset: -0.2 });
      return;
    }
    this.playSound('siren', 0.42, { pitchJitter: 0.015, pitchOffset: -0.18 });
  }

  private spawnHeliosCrossfirePulse(
    boss: Entity,
    phase: number,
    action: BossActionPresentationState
  ) {
    if (action.motionCue === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE) {
      const channel = boss.bossHeliosMachineGunChannelState;
      if (!channel || channel.actionClipId !== action.actionClipId) return;
      const durationFrames = Math.max(1, channel.fireEndFrame - channel.fireStartFrame);
      const pulse = sampleHeliosMachineGunChannelPulse({
        elapsedFrames: boss.attackTimer - channel.fireStartFrame,
        durationFrames,
        sequence: channel.sequence,
        intervalFrames: channel.shotIntervalFrames
      });
      if (!pulse) return;
      const gutterFiring = shouldFireHeliosMachineGunChannelGutter({
        elapsedFrames: pulse.elapsedFrames,
        durationFrames
      });
      if (!pulse.firing && !gutterFiring) return;
      const horizontalPadding = resolveHeliosMachineGunChannelHorizontalPadding(
        this.mobileProfile
      );
      const movementBounds = sampleHeliosMachineGunChannelMovement({
        stage: 'fire',
        progress: 0,
        sequence: channel.directionSequence,
        anchorX: channel.anchorX,
        anchorY: channel.anchorY,
        arenaWidth: this.width,
        arenaHeight: this.height,
        bossWidth: boss.width,
        bossHeight: boss.height,
        horizontalPadding,
        sweepRangeRatio: channel.sweepRangeRatio,
        sweepPasses: channel.sweepPasses,
        upperLaneRatio: this.mobileProfile ? 0.13 : 0.12
      });
      const channelTargets = resolveHeliosMachineGunChannelTargets({
        bossX: boss.x,
        startX: movementBounds.startX,
        endX: movementBounds.endX,
        arenaWidth: this.width,
        channelWidthPixels: channel.channelWidthPixels,
        edgePadding: resolveHeliosMachineGunChannelTargetPadding(
          this.mobileProfile,
          this.width
        )
      });
      const gutterTargets = resolveHeliosMachineGunChannelGutterTargets({
        arenaWidth: this.width,
        edgePadding: horizontalPadding
      });
      const targetY = this.height + (this.mobileProfile ? 44 : 64);
      const baseSpeed = Math.min(
        this.mobileProfile ? 6.1 : 6.8,
        Math.max(4.6, (Number(boss.projectileSpeed) || 6.2) * 0.78)
      );
      const origins = new Map<HeliosClawSide, { x: number; y: number; strength: number }>();
      const getOrigin = (side: HeliosClawSide) => {
        const existing = origins.get(side);
        if (existing) return existing;
        const resolved = this.getPreviewBossWeaponOrigins(boss, [side])[0] ?? {
          x: boss.x + boss.width * (side === 'port' ? 0.4 : 0.6),
          y: boss.y + boss.height * 0.78,
          strength: 1
        };
        origins.set(side, resolved);
        return resolved;
      };
      const spawnChannelTracer = (
        side: HeliosClawSide,
        targetX: number,
        sequenceOffset: number
      ) => {
        const origin = getOrigin(side);
        const angle = Math.atan2(targetY - origin.y, targetX - origin.x);
        const projectile = this.spawnGeneratedBossProjectile(
          boss,
          origin.x,
          origin.y,
          angle,
          baseSpeed * channel.projectileSpeedScale,
          side === 'port' ? '#f97316' : '#fbbf24',
          this.mobileProfile ? 9 : 11,
          channel.sequence * 100_000 + sequenceOffset
        );
        if (this.supportsPreviewBossProjectileVisualKind(boss, 'boss-gatling-tracer')) {
          projectile.projectileVisualKind = 'boss-gatling-tracer';
        }
      };
      if (pulse.firing) {
        for (let sideIndex = 0; sideIndex < pulse.firingSides.length; sideIndex += 1) {
          const side = pulse.firingSides[sideIndex];
          spawnChannelTracer(
            side,
            side === 'port' ? channelTargets.portX : channelTargets.starboardX,
            pulse.shotIndex * 4 + sideIndex
          );
        }
      }
      if (gutterFiring) {
        for (let sideIndex = 0; sideIndex < pulse.firingSides.length; sideIndex += 1) {
          const side = pulse.firingSides[sideIndex];
          spawnChannelTracer(
            side,
            side === 'port' ? gutterTargets.portX : gutterTargets.starboardX,
            50_000 + pulse.elapsedFrames * 2 + sideIndex
          );
        }
      }
      for (const side of pulse.firingSides) {
        if (!pulse.firing && !gutterFiring) continue;
        const origin = getOrigin(side);
        this.spawnBurst(origin.x, origin.y, '#f59e0b', 2, 1.55, 2);
      }
      this.playSound('boss_machinegun', 0.42, {
        pitchJitter: 0.012,
        pitchOffset: 0.02 + (pulse.shotIndex % 3) * 0.015
      });
      this.addShake(0.26);
      return;
    }
    const fallbackToCrossfire = Boolean(
      boss.bossHeliosCornerClampState?.fallbackToCrossfire
      && action.primitiveId === 'articulated-melee-sweep'
    );
    const sides = resolveHeliosCrossfireSides(
      fallbackToCrossfire ? undefined : action.side
    );
    const requested = Math.max(3, Math.min(9, Math.round(action.projectileCount ?? 4)));
    const elapsedFrames = Math.max(0, boss.attackTimer - action.startFrame);
    const pulse = sampleHeliosCrossfirePulse({
      elapsedFrames,
      roundsPerSide: requested,
      sides,
      intervalFrames: action.shotIntervalFrames ?? (phase >= 3 ? 2 : 3)
    });
    if (!pulse?.firing) return;
    const speed = Math.min(
      this.mobileProfile ? 6 : 6.7,
      Math.max(4.5, (Number(boss.projectileSpeed) || 6.2) * 0.76)
    );
    const origin = this.getPreviewBossWeaponOrigins(boss, [pulse.side])[0] ?? {
      x: boss.x + boss.width * (pulse.side === 'port' ? 0.4 : 0.6),
      y: boss.y + boss.height * 0.78,
      strength: 1
    };
    const centeredIndex = pulse.sideShotIndex - (requested - 1) / 2;
    const hasLockedTarget = boss.bossTimelineTargetClipId === action.actionClipId
      && boss.bossTimelineTargetExecutionIndex === action.executionIndex
      && Number.isFinite(boss.bossTimelineTargetX)
      && Number.isFinite(boss.bossTimelineTargetY);
    const lockedTargetAngle = hasLockedTarget
      ? Math.atan2(
          Number(boss.bossTimelineTargetY) - origin.y,
          Number(boss.bossTimelineTargetX) - origin.x
        )
      : Math.PI / 2;
    const shotPlan = resolveHeliosCrossfireShotPlan({
      side: pulse.side,
      coordinated: sides.length > 1,
      sideShotIndex: pulse.sideShotIndex,
      roundsPerSide: requested,
      phaseIndex: phase,
      sequence: action.sequence,
      lockedTargetAngleRadians: lockedTargetAngle
    });
    const projectile = this.spawnGeneratedBossProjectile(
      boss,
      origin.x,
      origin.y,
      shotPlan.angleRadians,
      speed
        * (action.projectileSpeedScale ?? 1)
        * (1 + Math.abs(centeredIndex) * 0.012),
      pulse.side === 'port' ? '#f97316' : '#fbbf24',
      this.mobileProfile ? 10 : 12,
      action.sequence * 100 + pulse.shotIndex
    );
    if (this.supportsPreviewBossProjectileVisualKind(boss, 'boss-gatling-tracer')) {
      projectile.projectileVisualKind = 'boss-gatling-tracer';
    }
    this.spawnBurst(origin.x, origin.y, '#f59e0b', 3, 1.8, 2);
    this.playSound('boss_machinegun', sides.length > 1 ? 0.58 : 0.5, {
      pitchJitter: 0.018,
      pitchOffset: (phase >= 3 ? 0.08 : -0.02) + pulse.shotIndex * 0.004
    });
    this.addShake(sides.length > 1 ? 0.75 : 0.5);
  }

  private spawnHeliosReactorPulse(
    boss: Entity,
    phase: number,
    action: BossActionPresentationState
  ) {
    const core = this.getPreviewBossWeaponOrigins(boss, ['core'])[0] ?? {
      x: boss.x + boss.width / 2,
      y: boss.y + boss.height * 0.58,
      strength: 1
    };
    const elapsedFrames = Math.max(0, boss.attackTimer - action.startFrame);
    if (action.motionCue === 'reactor-mines') {
      const timelineDurationFrames = boss.bossTimeline
        ? getBossTimelineDurationFrames(boss.bossTimeline, GAME_CONFIG.FPS)
        : 1;
      const loopIndex = Math.floor(
        Math.max(0, boss.attackTimer) / Math.max(1, timelineDurationFrames)
      );
      const cachedFormation = boss.bossHeliosMineFormationState;
      const formationSequence = cachedFormation?.actionClipId === action.actionClipId
        && cachedFormation.executionIndex === action.executionIndex
        ? cachedFormation.sequence
        : resolveHeliosMineFormationSequence({
            sequence: action.sequence,
            seedKey: [
              this.gameplayRandomSeed,
              boss.sourceEventId ?? boss.id,
              boss.bossTimelinePhaseId ?? boss.activeBossPhaseId ?? 'unphased',
              loopIndex,
              action.actionClipId,
              action.executionIndex
            ].join(':')
          });
      const formation = resolveHeliosMineFormation({
        sequence: formationSequence,
        count: action.projectileCount ?? 3
      });
      const slot = formation.find((candidate) => elapsedFrames === 2 + candidate.delayFrames);
      if (!slot) return;
      const mineSize = this.mobileProfile ? 24 : 30;
      const armPoint = resolveHeliosMineArmPoint({
        slot,
        arenaWidth: this.width,
        arenaHeight: this.height,
        originX: core.x,
        originY: core.y,
        mineSize,
        edgePadding: 12,
        topPadding: this.mobileProfile ? 54 : 48,
        bottomPadding: this.mobileProfile ? 34 : 22,
        minimumForwardTravel: Math.max(
          this.mobileProfile ? 104 : 112,
          boss.y + boss.height + (this.mobileProfile ? 64 : 76) - core.y
        )
      });
      const mine = this.spawnGeneratedBossProjectile(
        boss,
        core.x,
        core.y,
        armPoint.angleRadians,
        0,
        '#f59e0b',
        mineSize,
        action.sequence * 10 + slot.index
      );
      mine.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      mine.heliosMineState = {
        spawnFrame: this.frameCount,
        triggerAgeFrame: -1,
        hitPlayer: false,
        deployStartX: core.x,
        deployStartY: core.y,
        armX: armPoint.x,
        armY: armPoint.y,
        deployFrames: armPoint.deployFrames
      };
      mine.heliosMineStage = 'deploying';
      mine.projectileAnimationMode = 'play-once-before-last';
      if (this.supportsPreviewBossProjectileVisualKind(boss, 'boss-helios-mine')) {
        mine.projectileVisualKind = 'boss-helios-mine';
      }
      this.playSound('boss_shoot', 0.38, {
        pitchJitter: 0.012,
        pitchOffset: -0.22 + slot.index * 0.04
      });
      return;
    }
    const hasLockedTarget = boss.bossTimelineTargetClipId === action.actionClipId
      && boss.bossTimelineTargetExecutionIndex === action.executionIndex
      && Number.isFinite(boss.bossTimelineTargetX)
      && Number.isFinite(boss.bossTimelineTargetY);
    const targetAngle = hasLockedTarget
      ? Math.atan2(
          Number(boss.bossTimelineTargetY) - core.y,
          Number(boss.bossTimelineTargetX) - core.x
        )
      : Math.PI / 2;
    const fanShot = sampleHeliosReactorFanShot({
      elapsedFrames,
      sequence: action.sequence,
      projectileCount: action.projectileCount ?? 7,
      targetAngleRadians: targetAngle,
      intervalFrames: phase >= 3 ? 4 : 5
    });
    if (!fanShot?.firing) return;
    const projectile = this.spawnGeneratedBossProjectile(
      boss,
      core.x,
      core.y,
      fanShot.angleRadians,
      Math.min(this.mobileProfile ? 5.4 : 6.1, 4.5 + phase * 0.28),
      '#f59e0b',
      this.mobileProfile ? 11 : 13,
      action.sequence * 100 + fanShot.shotIndex
    );
    if (this.supportsPreviewBossProjectileVisualKind(boss, 'boss-reactor-pellet')) {
      projectile.projectileVisualKind = 'boss-reactor-pellet';
    }
    this.spawnBurst(core.x, core.y, '#f59e0b', 2, 1.3, 2);
    this.playSound('boss_shoot', 0.44, {
      pitchJitter: 0.015,
      pitchOffset: -0.12 + fanShot.shotIndex * 0.012
    });
  }

  private sampleHeliosMineEntity(mine: Entity) {
    const state = mine.heliosMineState;
    if (!state) return undefined;
    const mineCenterX = mine.x + mine.width / 2;
    const mineCenterY = mine.y + mine.height / 2;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    return sampleHeliosMineLifecycle({
      ageFrames: Math.max(0, this.frameCount - state.spawnFrame),
      triggerFrame: state.triggerAgeFrame,
      distanceToPlayer: Math.hypot(
        playerCenterX - mineCenterX,
        playerCenterY - mineCenterY
      ),
      deployFrames: state.deployFrames
    });
  }

  private updateHeliosMineEntity(mine: Entity) {
    const state = mine.heliosMineState;
    if (!state) return;
    const ageFrames = Math.max(0, this.frameCount - state.spawnFrame);
    if (state.triggerAgeFrame < 0) {
      const deployment = sampleHeliosMineDeployment({
        ageFrames,
        deployFrames: state.deployFrames,
        startX: state.deployStartX,
        startY: state.deployStartY,
        armX: state.armX,
        armY: state.armY
      });
      mine.x = deployment.centerX - mine.width / 2;
      mine.y = deployment.centerY - mine.height / 2;
      mine.vx = deployment.velocityX;
      mine.vy = deployment.velocityY;
    }
    let sample = this.sampleHeliosMineEntity(mine);
    if (!sample) return;
    if (sample.shouldTrigger && state.triggerAgeFrame < 0) {
      state.triggerAgeFrame = ageFrames;
      sample = this.sampleHeliosMineEntity(mine) ?? sample;
      const centerX = mine.x + mine.width / 2;
      const centerY = mine.y + mine.height / 2;
      const explosionSize = this.mobileProfile ? 74 : 92;
      mine.x = centerX - explosionSize / 2;
      mine.y = centerY - explosionSize / 2;
      mine.width = explosionSize;
      mine.height = explosionSize;
      mine.vx = 0;
      mine.vy = 0;
      mine.projectileVisualKind = 'boss-helios-explosion';
      mine.spriteFrames = [...ASSETS.PIXI_EXPLOSION_FRAMES];
      mine.weaponVisualStartFrame = this.frameCount;
      mine.variant = 0;
      mine.spriteFramePlaybackMode = 'once';
      mine.spriteFrameHoldFrames = 6;
      mine.spriteFrameFixedRotationRadians = 0;
      mine.heliosMineStage = 'exploding';
      this.playSound('explode', 0.56, { pitchJitter: 0.03, pitchOffset: -0.14 });
      this.addShake(0.8);
    } else {
      mine.heliosMineStage = sample.stage;
      mine.projectileAnimationMode = sample.stage === 'armed'
        ? 'hold-last'
        : sample.stage === 'deploying'
          ? 'play-once-before-last'
          : 'cycle';
    }
    if (sample.stage === 'deploying') {
      // Position is simulation-owned above so deployment always clears the
      // carrier silhouette before arming, independent of boss scale.
    } else if (sample.stage === 'armed') {
      mine.vx = 0;
      mine.vy = 0;
    }
    mine.x = clamp(mine.x, 4, Math.max(4, this.width - mine.width - 4));
    mine.y = clamp(mine.y, 48, Math.max(48, this.height - mine.height - 18));
    if (sample.shouldCleanup) mine.markedForDeletion = true;
  }

  private isHeliosMineDamageActive(mine: Entity) {
    const sample = this.sampleHeliosMineEntity(mine);
    return Boolean(sample?.damageActive && !mine.heliosMineState?.hitPlayer);
  }

  showBossTimelineTelegraph(boss: Entity, cue: BossTimelineCue) {
    const parameters = cue.clip.parameters;
    const style = parameters?.telegraphStyle ?? 'warning';
    const linkedAction = boss.bossTimeline?.clips.find((clip) => (
      clip.telegraphClipId === cue.clip.id
    ));
    if (
      linkedAction?.primitiveId === 'tracking-pincer-dive'
      && cue.executionIndex > 0
      && boss.bossTrackingPincerState?.actionClipId === linkedAction.id
    ) {
      // Attack 4 telegraphs only once before the four contiguous motion
      // stages. Repeated warning cues are compiler bookkeeping, not pauses.
      return;
    }
    if (
      linkedAction
      && this.isSandboxPrismMoth(boss)
      && this.getPrismMothActionId(linkedAction.primitiveId)
    ) {
      this.showPrismMothAnatomyTelegraph(boss, cue, linkedAction);
      return;
    }
    this.setBossActionPresentation(
      boss,
      cue,
      'warning',
      linkedAction ?? cue.clip
    );
    if (
      linkedAction
      && this.showFrontierCrownclawTelegraph(boss, cue, linkedAction)
    ) {
      return;
    }
    if (
      linkedAction
      && (
        this.isSelectedPreviewBoss(boss)
        // Helios' registered anatomy primitives identify their own warning
        // through the moving rig. Keep that presentation clean even while a
        // preview session is being rebuilt and its artwork event binding has
        // not settled yet (for example, immediately after Vite HMR).
        || boss.bossRigId === 'crown-claw'
      )
      && (
        linkedAction.primitiveId === 'paired-cannon-burst'
        || linkedAction.primitiveId === 'articulated-melee-sweep'
        || linkedAction.primitiveId === 'reactor-aperture-pattern'
        || linkedAction.primitiveId === 'tracking-pincer-dive'
      )
    ) {
      this.showHeliosAnatomyTelegraph(boss, cue, linkedAction);
      return;
    }
    if (linkedAction?.primitiveId === 'gap-ring') {
      this.showBossGapRingSafeRoute(boss, cue, linkedAction);
      return;
    }
    if (linkedAction?.primitiveId === 'side-barrage') {
      const cannons = (boss.bossComponents ?? []).filter((component) => (
        component.id === 'left-cannon' || component.id === 'right-cannon'
      ));
      if (
        cannons.length > 0
        && cannons.every((component) => component.destroyed)
        && boss.bossActionPresentation
      ) {
        boss.bossActionPresentation.motionCue = 'gatling-barrage';
      }
      this.beginBossSideBarrageWarning(boss, cue, linkedAction);
      return;
    }
    if (style === 'lane' && linkedAction?.primitiveId === 'cross-beam') {
      boss.isCharging = true;
      const warningFrames = Math.max(
        1,
        Math.round(Math.max(
          cue.clip.durationSeconds,
          Number(cue.clip.parameters?.warningSeconds) || 0,
          linkedAction.startSeconds - cue.clip.startSeconds
        ) * GAME_CONFIG.FPS)
      );
      this.spawnBossCrossBeamPair(boss, true, warningFrames);
      this.playSound('siren', 0.68);
      return;
    }
    if (style === 'lane' && linkedAction?.primitiveId === 'rail-sweep') {
      boss.isCharging = true;
      this.spawnBossRailSweep(
        boss,
        Math.max(0, Math.floor(linkedAction.parameters?.sequence ?? cue.executionIndex)),
        true
      );
      return;
    }
    if (style === 'lane' && linkedAction?.primitiveId === 'weave-wall') {
      boss.isCharging = true;
      const sequence = resolveBossPatternSequence(
        linkedAction.parameters?.sequence,
        cue.executionIndex
      );
      const warningFrames = Math.max(
        1,
        Math.round(
          Math.max(
            cue.clip.durationSeconds,
            Number(parameters?.warningSeconds) || 0
          ) * GAME_CONFIG.FPS
        )
      );
      this.showBossWeaveWallSafeChannel(boss, sequence, warningFrames);
      return;
    }
    if (style === 'spokes' && linkedAction?.primitiveId === 'radial-beam-array') {
      const sequence = boss.bossActionPresentation?.sequence
        ?? this.resolveBossTimelineActionSequence(boss, cue, linkedAction);
      this.spawnBossRadialBeamArray(
        boss,
        true,
        sequence,
        cue.clip.durationSeconds
      );
      return;
    }
    if (style === 'target') {
      if (linkedAction?.primitiveId === 'corner-ambush-beam') {
        this.beginBossCornerAmbushBeamWarning(boss, cue, linkedAction);
        return;
      }
      if (linkedAction?.primitiveId === 'corner-ambush-ram') {
        this.beginBossCornerAmbushRamWarning(boss, cue, linkedAction);
        return;
      }
    }
    const color = parameters?.color ?? (
      style === 'lane' ? '#fb7185'
        : style === 'target' ? '#facc15'
          : style === 'ring' ? '#c4b5fd'
            : '#f87171'
    );
    const targetX = style === 'target'
      ? this.player.x + this.player.width / 2
      : boss.x + boss.width / 2;
    const targetY = style === 'target'
      ? this.player.y + this.player.height / 2
      : boss.y + boss.height * 0.62;
    this.spawnRingEffect(targetX, targetY, color);
    this.spawnFloatingText(
      targetX,
      targetY - 28,
      cue.clip.label.trim().toUpperCase() || 'WARNING',
      color,
      this.mobileProfile ? 14 : 18
    );
    this.playSound('siren', 0.68);
  }

  spawnBossTimelineSummons(boss: Entity, cue: BossTimelineCue) {
    const parameters = cue.clip.parameters;
    const requestedCount = Math.max(1, Math.min(12, Math.floor(parameters?.summonCount ?? 4)));
    const available = Math.max(0, this.getThreatCap() - this.getActiveThreatCount());
    const count = Math.min(requestedCount, available);
    if (count <= 0) return;
    const enemyDefinition = getEnemy(parameters?.enemyId ?? 'drone');
    const patternId = parameters?.formationPatternId ?? 'v';
    const difficulty = this.getCurrentDifficultyMultiplier();
    const event: RuntimeSpawnEvent = {
      id: `${boss.sourceEventId ?? boss.id}-${cue.clip.id}`,
      label: cue.clip.label,
      kind: 'spawn',
      startSeconds: 0,
      durationSeconds: 1,
      delayAfterSeconds: 0,
      blocksWaveClock: false,
      count,
      patternId,
      positionId: 'formation-top',
      spawnIntervalSeconds: 0.08,
      enemies: [{
        enemyId: enemyDefinition.id,
        spriteKey: enemyDefinition.defaultSpriteKey,
        weight: 1,
        health: enemyDefinition.baseHealth,
        speed: enemyDefinition.baseSpeed,
        damage: enemyDefinition.baseDamage,
        scoreValue: enemyDefinition.baseScoreValue,
        powerupDropChance: enemyDefinition.basePowerupDropChance
      }]
    };
    const enemyType = this.resolveConfiguredEnemyType(enemyDefinition.id);
    for (let index = 0; index < count; index += 1) {
      const point = this.getConfiguredSpawnPoint(event, index, count);
      const enemy = this.createEnemy(enemyType, point.x, point.y, {
        speed: enemyDefinition.baseSpeed * difficulty,
        health: enemyDefinition.baseHealth * difficulty,
        contactDamage: enemyDefinition.baseDamage * difficulty,
        scoreValue: enemyDefinition.baseScoreValue,
        powerupDropChance: enemyDefinition.basePowerupDropChance,
        spriteUrl: this.resolveSpriteUrl(enemyDefinition.defaultSpriteKey, enemyType),
        spriteFrames: this.resolveSpriteFrames(enemyDefinition.defaultSpriteKey)
      });
      enemy.sourceEventId = boss.sourceEventId;
      enemy.sourceItemId = enemyDefinition.id;
      this.configureEnemyFormation(enemy, event, index, count);
    }
    this.spawnFloatingText(
      boss.x + boss.width / 2,
      boss.y + boss.height,
      'REINFORCEMENTS',
      '#fbbf24',
      this.mobileProfile ? 14 : 18
    );
  }

  dispatchBossTimelineCue(
    boss: Entity,
    cue: BossTimelineCue,
    phase: number,
    triggeredStage?: 'phase-enter' | 'death'
  ) {
    const parameters = cue.clip.parameters;
    const sequence = resolveBossPatternSequence(
      parameters?.sequence,
      cue.executionIndex
    );
    if (triggeredStage) {
      this.setBossActionPresentation(boss, cue, triggeredStage);
    } else if (
      cue.clip.primitiveId !== 'telegraph'
      && isDamagingBossTimelinePrimitive(cue.clip.primitiveId)
    ) {
      this.setBossActionPresentation(boss, cue, 'fire');
    }
    switch (cue.clip.primitiveId) {
      case 'telegraph':
        this.showBossTimelineTelegraph(boss, cue);
        return;
      case 'aimed-burst':
        this.spawnBossBurst(boss, phase, parameters?.projectileCount);
        boss.lastBurstAttackTimer = boss.attackTimer;
        return;
      case 'gap-ring': {
        boss.isCharging = false;
        const lockedOrigins = this.consumeBossTimelineActionOrigins(
          boss,
          cue.clip.id,
          cue.executionIndex
        );
        this.spawnBossSafeGapRing(
          boss,
          sequence,
          phase,
          false,
          parameters?.projectileCount,
          parameters?.rotationDirection,
          lockedOrigins?.[0]
        );
        return;
      }
      case 'rotor-hazard-sentence':
        boss.isCharging = false;
        return;
      case 'radial-beam-array':
        this.spawnBossRadialBeamArray(
          boss,
          false,
          boss.bossActionPresentation?.sequence ?? sequence,
          cue.clip.durationSeconds
        );
        return;
      case 'corner-ambush-beam':
        this.fireBossCornerAmbushBeam(boss, cue);
        return;
      case 'corner-ambush-ram':
        this.fireBossCornerAmbushRam(boss, cue);
        return;
      case 'paired-cannon-burst':
        boss.isCharging = false;
        return;
      case 'articulated-melee-sweep':
        boss.isCharging = false;
        if (
          boss.bossHeliosCornerClampState?.actionClipId === cue.clip.id
          && boss.bossActionPresentation
        ) {
          if (boss.bossHeliosCornerClampState.activeSide) {
            boss.bossActionPresentation.side = boss.bossHeliosCornerClampState.activeSide;
          }
          if (boss.bossHeliosCornerClampState.fallbackToCrossfire) {
            boss.bossActionPresentation.motionCue = 'paired-crossfire';
            boss.bossActionPresentation.projectileCount = 4;
          }
        }
        return;
      case 'reactor-aperture-pattern':
        boss.isCharging = false;
        return;
      case 'tracking-pincer-dive':
        boss.isCharging = false;
        return;
      case 'chainclaw-harpoon':
      case 'crown-reactor-beam':
      case 'bastion-crabwalk-barrage':
        this.beginFrontierCrownclawAction(boss, cue);
        return;
      case 'prism-wingbeat-weave':
      case 'prism-brood-procession':
      case 'prism-lunar-swoop':
      case 'prism-kaleidoscope-brood':
        if (this.isSandboxPrismMoth(boss)) {
          this.beginPrismMothTimelineAction(boss, cue);
        }
        return;
      case 'cross-beam':
        this.spawnBossCrossBeamPair(boss, false);
        return;
      case 'rail-sweep':
        this.spawnBossRailSweep(boss, sequence, false);
        return;
      case 'tail-fan':
        this.spawnBossTailFan(boss, sequence, parameters?.projectileCount);
        return;
      case 'inward-collapse':
        this.spawnBossInwardCollapse(boss, sequence, phase, parameters?.projectileCount);
        return;
      case 'rotating-cross':
        this.spawnBossRotatingCross(boss, sequence, phase, parameters?.projectileCount);
        return;
      case 'helix-volley':
        this.spawnBossHelixVolley(
          boss,
          sequence,
          phase,
          parameters?.handedness !== 'right',
          parameters?.projectileCount
        );
        return;
      case 'side-barrage':
        {
          const lockedTarget = boss.bossTimelineTargetClipId === cue.clip.id
            && boss.bossTimelineTargetExecutionIndex === cue.executionIndex
            && Number.isFinite(boss.bossTimelineTargetX)
            && Number.isFinite(boss.bossTimelineTargetY)
            ? {
                x: Number(boss.bossTimelineTargetX),
                y: Number(boss.bossTimelineTargetY)
              }
            : undefined;
          const gatlingBarrage = (
            parameters?.motionCue === 'gatling-barrage'
            || boss.bossActionPresentation?.motionCue === 'gatling-barrage'
            || boss.bossGatlingAttackLock?.actionClipId === cue.clip.id
          );
          const lockedOrigins = gatlingBarrage
            ? undefined
            : this.consumeBossTimelineActionOrigins(
                boss,
                cue.clip.id,
                cue.executionIndex
              );
          this.spawnBossSideBarrage(
            boss,
            phase,
            parameters?.side ?? 'port',
            parameters?.projectileCount,
            gatlingBarrage ? 'gatling-barrage' : parameters?.motionCue,
            lockedTarget,
            lockedOrigins
          );
          boss.bossTimelineTargetClipId = undefined;
          boss.bossTimelineTargetExecutionIndex = -1;
          boss.bossTimelineTargetX = null;
          boss.bossTimelineTargetY = null;
        }
        return;
      case 'pod-volley':
        boss.isCharging = false;
        this.spawnBossPodVolley(
          boss,
          resolveBossPatternSequence(parameters?.sequence, cue.executionIndex),
          parameters?.projectileCount
        );
        return;
      case 'weave-wall':
        boss.isCharging = false;
        this.spawnBossWeaveWall(
          boss,
          resolveBossPatternSequence(parameters?.sequence, cue.executionIndex),
          parameters?.projectileCount
        );
        return;
      case 'summon-formation':
        this.spawnBossTimelineSummons(boss, cue);
        return;
      case 'set-shield': {
        this.clearBossShieldRing();
        if (parameters?.enabled !== false && (parameters?.shieldCount ?? 0) > 0) {
          this.spawnBossShieldRing(boss, phase, parameters?.shieldCount);
        }
        return;
      }
      case 'set-weak-point': {
        const component = boss.bossComponents?.find((item) => item.id === parameters?.componentId);
        if (!component) return;
        const enabled = parameters?.enabled !== false;
        const exposed = setBossComponentExposure(component, enabled);
        if (component.destroyed) return;
        this.spawnFloatingText(
          boss.x + boss.width * component.centerXRatio,
          boss.y + boss.height * component.centerYRatio,
          `${component.label} ${exposed ? 'EXPOSED' : 'SEALED'}`,
          exposed ? '#facc15' : '#94a3b8',
          this.mobileProfile ? 12 : 15
        );
        return;
      }
      case 'set-movement':
        if (parameters?.movementPatternId) boss.movementPattern = parameters.movementPatternId;
        if (Number.isFinite(parameters?.speedMultiplier)) {
          boss.activeBossPhaseSpeedMultiplier = clamp(Number(parameters?.speedMultiplier), 0.1, 8);
        }
        return;
      case 'follow-path':
        if (!isMovementPathId(parameters?.movementPathId)) return;
        boss.bossMovementPathId = parameters.movementPathId;
        boss.bossMovementPathStartFrame = boss.attackTimer;
        boss.bossMovementPathDurationFrames = Math.max(
          1,
          Math.round(cue.clip.durationSeconds * GAME_CONFIG.FPS)
        );
        return;
      case 'effect-cue':
        {
          const activePhaseId = boss.bossTimelinePhaseId ?? boss.activeBossPhaseId;
          const recoveryVariant = boss.bossTimeline?.attacks
            ?.flatMap((attack) => attack.variants.map((variant) => ({ attack, variant })))
            .find(({ variant }) => (
              variant.phaseId === activePhaseId
              && variant.recoveryClipId === cue.clip.id
            ));
          const sourceClipId = recoveryVariant?.variant.beatClipIds.at(-1);
          const sourceClip = sourceClipId
            ? boss.bossTimeline?.clips.find((clip) => clip.id === sourceClipId)
            : undefined;
          if (sourceClip) {
            this.setBossActionPresentation(boss, cue, 'recovery', sourceClip);
          }
          boss.isCharging = false;
        }
        if (this.isSandboxPrismMoth(boss)) {
          const core = this.getPrismMothSocketOrigin(boss, 'prism-core');
          this.spawnBurst(
            core.x,
            core.y,
            parameters?.color ?? '#67e8f9',
            12,
            2.4,
            2
          );
        } else {
          this.spawnRingEffect(
            boss.x + boss.width / 2,
            boss.y + boss.height / 2,
            parameters?.color ?? '#67e8f9'
          );
        }
        return;
      case 'camera-cue':
        this.addShake(clamp(Number(parameters?.strength) || 2.5, 0, 10));
        return;
      default:
        return;
    }
  }

  private positionBossRadialBeam(beam: Entity, boss: Entity) {
    if (!beam.beamRadialRay || beam.beamRotorAxisIndex < 0) return;
    const centerX = boss.x + boss.width / 2;
    const centerY = boss.y + boss.height / 2;
    const rotorAngle = boss.bossRotorInitialized
      ? boss.bossRotorAngleRadians
      : 0;
    const relays = sampleRotatingEmitterRelayPositions({
      centerX,
      centerY,
      radiusX: boss.width * (186.68 / 420),
      radiusY: boss.height * (186.68 / 420),
      rotorAngleRadians: rotorAngle
    });
    const relay = relays[beam.beamRotorAxisIndex % relays.length];
    const geometry = resolveRotatingEmitterRadialBeamGeometry({
      centerX,
      centerY,
      relay,
      outwardLength: beam.beamRadialOutwardLength
    });
    beam.beamAngleRadians = geometry.angleRadians;
    beam.beamOriginX = geometry.relayX;
    beam.beamOriginY = geometry.relayY;
    beam.beamTargetX = geometry.endX;
    beam.beamTargetY = geometry.endY;
    beam.width = geometry.length;
    beam.x = geometry.centerX - geometry.length / 2;
    beam.y = geometry.centerY - beam.height / 2;
  }

  spawnBossRadialBeamArray(
    boss: Entity,
    telegraph: boolean,
    sequence: number,
    durationSeconds: number
  ) {
    if (!telegraph) {
      for (const entity of this.entities) {
        if (
          entity.isBeam
          && entity.isTelegraph
          && entity.beamRadialRay
          && entity.bossOwnerId === boss.id
        ) {
          entity.markedForDeletion = true;
        }
      }
    }

    const length = Math.hypot(this.width, this.height) * 1.18;
    const thickness = telegraph
      ? this.mobileProfile ? 4 : 5
      : this.mobileProfile ? 18 : 24;
    const lifetime = Math.max(1, Math.round(durationSeconds * GAME_CONFIG.FPS));
    for (let axisIndex = 0; axisIndex < 4; axisIndex += 1) {
      const beam = this.createEntity(EntityType.PROJECTILE, 0, 0);
      beam.isBeam = true;
      beam.isDetachedBeam = false;
      beam.isTelegraph = telegraph;
      beam.beamRadialRay = true;
      beam.beamRotorAxisIndex = axisIndex;
      beam.beamRotorSequence = Math.max(0, Math.floor(sequence));
      beam.beamSweepStartFrame = boss.attackTimer;
      beam.beamSweepDurationFrames = lifetime;
      beam.bossOwnerId = boss.id;
      beam.beamRadialOutwardLength = length;
      beam.width = length;
      beam.height = thickness;
      beam.life = lifetime;
      beam.maxLife = lifetime;
      beam.color = telegraph ? '#fb7185' : '#f43f5e';
      beam.damage = telegraph ? 0 : Math.max(1, Number(boss.projectileDamage) || 1);
      this.positionBossRadialBeam(beam, boss);
      this.entities.push(beam);
    }

    if (telegraph) {
      boss.isCharging = true;
      this.playSound('siren', 0.7);
    } else {
      boss.isCharging = false;
      this.playSound('electricity');
      this.playSound('boss_shoot', 1.22, { pitchJitter: 0.02, pitchOffset: 0.12 });
      this.addShake(3.2);
      this.addHitStop(4);
    }
  }

  private spawnBossRotorHazardPulse(
    boss: Entity,
    action: BossActionPresentationState
  ) {
    const elapsedFrames = boss.attackTimer - action.startFrame;
    const pulse = sampleRotatingEmitterPulseState({
      elapsedFrames,
      pulseIntervalSeconds: action.pulseIntervalSeconds,
      projectileCount: action.projectileCount,
      framesPerSecond: GAME_CONFIG.FPS
    });
    if (!pulse.shouldEmit) return;

    const sockets = sampleRotatingEmitterSocketPositionsForBounds({
      centerX: boss.x + boss.width / 2,
      centerY: boss.y + boss.height / 2,
      width: boss.width,
      height: boss.height,
      rotorAngleRadians: boss.bossRotorAngleRadians
    });
    for (const socketIndex of pulse.activeSocketIndices) {
      const socket = sockets[socketIndex];
      const pellet = this.createEntity(
        EntityType.PROJECTILE,
        socket.x - 6,
        socket.y - 6
      );
      const speed = this.mobileProfile ? 2.75 : 3.15;
      pellet.vx = Math.cos(socket.angleRadians) * speed;
      pellet.vy = Math.sin(socket.angleRadians) * speed;
      pellet.width = 12;
      pellet.height = 12;
      pellet.color = '#ff3bd4';
      pellet.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      pellet.bossOwnerId = boss.id;
      pellet.projectileVisualKind = 'boss-pixel-pink';
      pellet.weaponVisualStartFrame = this.frameCount;
      pellet.variant = pulse.pulseIndex * 8 + socket.index;
      this.entities.push(pellet);
    }

    // The heavier eye sprites arrive on an authored four-pulse cadence and
    // fall through fixed lane pairs. They are slower than the rotor pellets,
    // creating a layered dodge puzzle without increasing the global speed.
    if (pulse.pulseIndex % 2 === 1) {
      const lanePairs = [
        [0.28, 0.62],
        [0.42, 0.74],
        [0.22, 0.53],
        [0.36, 0.68]
      ] as const;
      const lanes = lanePairs[Math.floor(pulse.pulseIndex / 2) % lanePairs.length];
      lanes.forEach((laneRatio, laneIndex) => {
        const comet = this.createEntity(
          EntityType.PROJECTILE,
          boss.x + boss.width * laneRatio - 18,
          boss.y + boss.height * 0.28 - laneIndex * 16
        );
        comet.vx = (laneRatio - 0.5) * 0.7;
        comet.vy = this.mobileProfile ? 2.35 : 2.65;
        comet.width = 36;
        comet.height = 44;
        const dropKinds = [
          'boss-pixel-pink',
          'boss-pixel-gold',
          'boss-pixel-prism'
        ] as const;
        const dropKind = dropKinds[(pulse.pulseIndex + laneIndex) % dropKinds.length];
        comet.color = dropKind === 'boss-pixel-pink'
          ? '#ff3bd4'
          : dropKind === 'boss-pixel-gold'
            ? '#facc15'
            : '#67e8f9';
        comet.damage = Math.max(1, Number(boss.projectileDamage) || 1);
        comet.projectileVisualKind = dropKind;
        comet.bossPodSide = laneIndex === 0 ? 'left' : 'right';
        comet.bossOwnerId = boss.id;
        comet.weaponVisualStartFrame = this.frameCount;
        comet.variant = pulse.pulseIndex + laneIndex;
        this.entities.push(comet);
      });
    }

    this.playSound('boss_shoot', 0.62, {
      pitchJitter: 0.025,
      pitchOffset: pulse.pulseIndex % 2 === 0 ? -0.16 : -0.08
    });
  }

  updateConfiguredBossTimeline(boss: Entity, phase: number) {
    const timeline = boss.bossTimeline;
    if (!timeline) return false;
    const targetEntranceY = Math.max(72, Math.min(this.height * 0.13, 116));
    const isPerformingSettledTimelineMovement = Boolean(
      (
        boss.bossTrackingPincerState
        && boss.bossActionPresentation?.primitiveId === 'tracking-pincer-dive'
      )
      || (
        boss.bossHeliosCornerClampState
        && boss.bossActionPresentation?.primitiveId === 'articulated-melee-sweep'
      )
      || (
        boss.bossHeliosMachineGunChannelState
        && boss.bossActionPresentation?.primitiveId === 'paired-cannon-burst'
      )
      || (
        boss.bossActionPresentation?.primitiveId === 'reactor-aperture-pattern'
        && boss.bossActionPresentation.stage === 'fire'
        && boss.bossActionPresentation.motionCue === 'reactor-fan'
      )
      || (
        this.isSandboxPrismMoth(boss)
        && boss.bossPrismMothActionStates.some((state) => (
          state.resolvedActionId === 'lunar-prism-swoop' && state.swoopPass
        ))
      )
      || (
        this.isSandboxFrontierCrownclaw(boss)
        && boss.bossFrontierCrownclawState
        && boss.bossActionPresentation?.actionClipId
          === boss.bossFrontierCrownclawState.actionClipId
      )
    );
    if (boss.y < targetEntranceY && !isPerformingSettledTimelineMovement) {
      // The authored phase clock begins only after the silhouette has settled
      // into its combat anchor. This preserves a real read window and prevents
      // off-screen attacks when a deliberately slow boss enters. Authored
      // Helios and Prism movement sentences may rise above that anchor after a
      // visible preparation without accidentally restarting the whole timeline.
      boss.attackTimer = 0;
      boss.bossActionPresentation = undefined;
      return true;
    }
    if (
      boss.bossActionPresentation
      && boss.attackTimer >= boss.bossActionPresentation.endFrame
    ) {
      boss.bossActionPresentation = undefined;
    }
    const timelineDurationFrames = getBossTimelineDurationFrames(timeline, GAME_CONFIG.FPS);
    if (
      timeline.loop
      && boss.attackTimer > 0
      && boss.attackTimer % timelineDurationFrames === 0
    ) {
      this.clearPrismMothRuntime(boss);
      this.clearFrontierCrownclawRuntime(boss);
      this.clearBossTimelineActionLocks(boss);
    }
    const phaseId = boss.bossTimelinePhaseId ?? boss.activeBossPhaseId;
    if (phaseId !== boss.bossTimelineLastPhaseId) {
      if (boss.bossTimelineLastPhaseId !== undefined) {
        this.clearPrismMothRuntime(boss);
        this.clearFrontierCrownclawRuntime(boss);
      }
      boss.bossTimelineLastPhaseId = phaseId;
      getBossTimelineTriggeredCues(timeline, 'phase-enter', phaseId)
        .forEach((cue) => this.dispatchBossTimelineCue(boss, cue, phase, 'phase-enter'));
    }
    getBossTimelineCuesAtFrame(timeline, boss.attackTimer, phaseId, GAME_CONFIG.FPS)
      .forEach((cue) => this.dispatchBossTimelineCue(boss, cue, phase));
    if (
      boss.bossActionPresentation?.primitiveId === 'rotor-hazard-sentence'
      && boss.bossActionPresentation.stage === 'fire'
    ) {
      this.spawnBossRotorHazardPulse(boss, boss.bossActionPresentation);
    }
    if (
      boss.bossActionPresentation?.motionCue === 'gatling-barrage'
      && boss.bossActionPresentation.stage === 'fire'
    ) {
      this.spawnBossGatlingPulse(boss, boss.bossActionPresentation);
    }
    const heliosAction = boss.bossActionPresentation;
    if (
      heliosAction?.stage === 'fire'
      && heliosAction.motionCue !== HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE
      && (
        heliosAction.primitiveId === 'paired-cannon-burst'
        || (
          heliosAction.primitiveId === 'articulated-melee-sweep'
          && boss.bossHeliosCornerClampState?.fallbackToCrossfire
        )
      )
    ) {
      this.spawnHeliosCrossfirePulse(boss, phase, heliosAction);
    }
    if (
      heliosAction?.stage === 'fire'
      && heliosAction.primitiveId === 'reactor-aperture-pattern'
    ) {
      this.spawnHeliosReactorPulse(boss, phase, heliosAction);
    }
    this.updateFrontierCrownclawActionRuntime(boss);
    this.updatePrismMothActionRuntime(boss);
    return true;
  }

  updateTimelineBossMovement(boss: Entity, healthRatio: number) {
    const targetEntranceY = Math.max(72, Math.min(this.height * 0.13, 116));
    if (this.updatePrismMothTimelineMovement(boss, targetEntranceY, healthRatio)) {
      return;
    }
    if (this.updateFrontierCrownclawTimelineMovement(boss)) {
      return;
    }
    const speed = Math.max(0.1, boss.configuredSpeed ?? 2) * boss.activeBossPhaseSpeedMultiplier;
    const entranceSpeed = Math.max(2.2, speed);
    const channelState = boss.bossHeliosMachineGunChannelState;
    if (channelState) {
      const previousX = boss.x;
      const previousY = boss.y;
      const action = boss.bossActionPresentation?.actionClipId === channelState.actionClipId
        ? boss.bossActionPresentation
        : undefined;
      if (!action) {
        boss.x = channelState.anchorX;
        boss.y = channelState.anchorY;
        boss.vx = boss.x - previousX;
        boss.vy = boss.y - previousY;
        boss.bossPresentationBankRadians = 0;
        boss.bossHeliosMachineGunChannelState = undefined;
        return;
      }
      const stage = action.stage === 'warning'
        ? 'warning'
        : action.stage === 'recovery'
          ? 'recovery'
          : 'fire';
      const stageStartFrame = stage === 'warning'
        ? channelState.warningStartFrame
        : stage === 'fire'
          ? channelState.fireStartFrame
          : action.startFrame;
      const stageEndFrame = stage === 'warning'
        ? channelState.fireStartFrame
        : stage === 'fire'
          ? channelState.fireEndFrame
          : action.endFrame;
      const stageProgress = clamp(
        (boss.attackTimer - stageStartFrame)
          / Math.max(1, stageEndFrame - stageStartFrame),
        0,
        1
      );
      const sample = sampleHeliosMachineGunChannelMovement({
        stage,
        progress: stageProgress,
        sequence: channelState.directionSequence,
        anchorX: channelState.anchorX,
        anchorY: channelState.anchorY,
        arenaWidth: this.width,
        arenaHeight: this.height,
        bossWidth: boss.width,
        bossHeight: boss.height,
        horizontalPadding: resolveHeliosMachineGunChannelHorizontalPadding(
          this.mobileProfile
        ),
        sweepRangeRatio: channelState.sweepRangeRatio,
        sweepPasses: channelState.sweepPasses,
        upperLaneRatio: this.mobileProfile ? 0.13 : 0.12
      });
      boss.x = sample.x;
      boss.y = sample.y;
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians = 0;
      boss.isCharging = stage === 'warning';
      if (stage === 'recovery' && stageProgress >= 0.999) {
        boss.x = channelState.anchorX;
        boss.y = channelState.anchorY;
        boss.vx = boss.x - previousX;
        boss.vy = boss.y - previousY;
        boss.bossHeliosMachineGunChannelState = undefined;
      }
      return;
    }
    const clampAction = boss.bossActionPresentation?.primitiveId === 'articulated-melee-sweep'
      ? boss.bossActionPresentation
      : undefined;
    const clampState = boss.bossHeliosCornerClampState;
    if (clampState) {
      const previousX = boss.x;
      const previousY = boss.y;
      if (!clampAction || clampAction.actionClipId !== clampState.actionClipId) {
        boss.x = clampState.anchorX;
        boss.y = clampState.anchorY;
        boss.vx = boss.x - previousX;
        boss.vy = boss.y - previousY;
        boss.bossHeliosCornerClampState = undefined;
        return;
      }
      if (clampState.fallbackToCrossfire) {
        boss.x += (clampState.anchorX - boss.x) * 0.24;
        boss.y += (clampState.anchorY - boss.y) * 0.24;
        boss.vx = boss.x - previousX;
        boss.vy = boss.y - previousY;
        boss.bossPresentationBankRadians = 0;
        return;
      }
      const durationFrames = Math.max(1, clampAction.endFrame - clampAction.startFrame);
      const actionProgress = clamp(
        (boss.attackTimer - clampAction.startFrame) / durationFrames,
        0,
        1
      );
      const activeSide = clampState.activeSide ?? 'port';
      const sample = sampleHeliosCornerClamp({
        stage: clampAction.stage === 'warning' ? 'warning' : 'fire',
        progress: actionProgress,
        side: activeSide
      });
      if (clampAction.stage === 'warning') {
        if (sample.trackingActive) {
          const playerCenterX = this.player.x + this.player.width / 2;
          const placement = resolveHeliosCornerClampPlacement({
            side: activeSide,
            viewportWidth: this.width,
            viewportHeight: this.height,
            bossWidth: boss.width,
            bossHeight: boss.height,
            mobileProfile: this.mobileProfile
          });
          clampState.lockedX = clamp(
            clampState.cornerX + (playerCenterX - this.width / 2) * 0.18,
            placement.trackingMinX,
            placement.trackingMaxX
          );
        }
        boss.x = clampState.anchorX
          + (clampState.lockedX - clampState.anchorX) * sample.movementProgress;
        boss.y = clampState.anchorY
          + (clampState.cornerY - clampState.anchorY) * sample.movementProgress;
      } else {
        boss.x = clampState.lockedX
          + (clampState.anchorX - clampState.lockedX) * sample.returnProgress;
        boss.y = clampState.cornerY
          + (clampState.anchorY - clampState.cornerY) * sample.returnProgress;
      }
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians = 0;
      return;
    }
    const pincerAction = boss.bossActionPresentation?.primitiveId === 'tracking-pincer-dive'
      ? boss.bossActionPresentation
      : undefined;
    const pincerState = boss.bossTrackingPincerState;
    if (pincerAction && pincerState) {
      const durationFrames = Math.max(1, pincerAction.endFrame - pincerAction.startFrame);
      const actionProgress = clamp(
        (boss.attackTimer - pincerAction.startFrame) / durationFrames,
        0,
        1
      );
      if (pincerAction.stage !== 'fire') {
        boss.vx = 0;
        boss.vy = 0;
        return;
      }
      const sample = sampleHeliosTrackingPincer({
        sequence: pincerAction.sequence,
        progress: actionProgress
      });
      const previousX = boss.x;
      const previousY = boss.y;
      if (sample.stage === 'rise-open') {
        boss.x = pincerState.anchorX
          + (pincerState.riseX - pincerState.anchorX) * sample.progress;
        boss.y = pincerState.anchorY
          + (pincerState.riseY - pincerState.anchorY) * sample.progress;
      } else if (sample.stage === 'track-lock') {
        if (sample.trackingActive) {
          const playerCenterX = this.player.x + this.player.width / 2;
          const playerCenterY = this.player.y + this.player.height / 2;
          pincerState.targetX = clamp(
            playerCenterX - boss.width / 2,
            6,
            Math.max(6, this.width - boss.width - 6)
          );
          pincerState.targetY = clamp(
            playerCenterY - boss.height * 0.44,
            this.height * 0.3,
            Math.max(this.height * 0.3, this.height - boss.height * 0.72)
          );
          boss.x += (pincerState.targetX - boss.x) * 0.16;
          boss.y += (pincerState.riseY - boss.y) * 0.24;
          pincerState.riseX = boss.x;
          pincerState.riseY = boss.y;
        } else {
          // Keep the committed chassis moving into the locked line. Previously
          // the final lock frames held the exact same pose, which read as a
          // one-beat pause between the swoop and the damaging dive.
          boss.x += (pincerState.targetX - boss.x) * 0.18;
          boss.y += (pincerState.targetY - boss.y) * 0.035;
          pincerState.riseX = boss.x;
          pincerState.riseY = boss.y;
        }
      } else if (sample.stage === 'dive-close') {
        boss.x = pincerState.riseX
          + (pincerState.targetX - pincerState.riseX) * sample.diveProgress;
        boss.y = pincerState.riseY
          + (pincerState.targetY - pincerState.riseY) * sample.diveProgress;
      } else {
        boss.x = pincerState.targetX
          + (pincerState.anchorX - pincerState.targetX) * sample.returnProgress;
        boss.y = pincerState.targetY
          + (pincerState.anchorY - pincerState.targetY) * sample.returnProgress;
        if (actionProgress >= 0.99) boss.bossTrackingPincerState = undefined;
      }
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians = 0;
      return;
    }
    if (
      boss.bossActionPresentation?.primitiveId === 'reactor-aperture-pattern'
      && boss.bossActionPresentation.stage === 'fire'
      && boss.bossActionPresentation.motionCue === 'reactor-fan'
    ) {
      // The reactor aperture is a readable firing sentence: Helios braces while
      // the fan is emitted so its authored gap does not slide across the player.
      // He resumes his normal hover between beats and during recovery.
      boss.vx = 0;
      boss.vy = 0;
      boss.bossPresentationBankRadians += (0 - boss.bossPresentationBankRadians) * 0.24;
      return;
    }
    const cornerRam = boss.bossCornerAmbushRamState;
    if (cornerRam) {
      const lock = cornerRam.lock;
      if (cornerRam.stage === 'warning') {
        boss.x = lock.startX;
        boss.y = lock.startY;
        boss.vx = 0;
        boss.vy = 0;
        boss.bossPresentationBankRadians = lock.angleRadians - Math.PI / 2;
        return;
      }
      const durationFrames = Math.max(1, cornerRam.endFrame - cornerRam.startFrame);
      const rawProgress = clamp(
        (boss.attackTimer - cornerRam.startFrame) / durationFrames,
        0,
        1
      );
      const progress = sampleCornerAmbushRamProgress(rawProgress);
      const previousX = boss.x;
      const previousY = boss.y;
      boss.x = lock.startX + (lock.exitX - lock.startX) * progress;
      boss.y = lock.startY + (lock.exitY - lock.startY) * progress;
      boss.vx = boss.x - previousX;
      boss.vy = boss.y - previousY;
      boss.bossPresentationBankRadians = lock.angleRadians - Math.PI / 2;
      if (rawProgress < 1) return;
      boss.bossCornerAmbushRamState = undefined;
      boss.bossPresentationBankRadians = 0;
    }
    const cornerAmbush = boss.bossCornerAmbushBeamState;
    if (cornerAmbush && boss.attackTimer <= cornerAmbush.holdUntilFrame) {
      boss.x = cornerAmbush.lock.bossX;
      boss.y = cornerAmbush.lock.bossY;
      boss.vx = 0;
      boss.vy = 0;
      boss.bossPresentationBankRadians += (0 - boss.bossPresentationBankRadians) * 0.24;
      return;
    }
    if (cornerAmbush) boss.bossCornerAmbushBeamState = undefined;
    if (boss.bossMovementPathId) {
      const elapsedFrames = boss.attackTimer - boss.bossMovementPathStartFrame;
      const durationFrames = Math.max(1, boss.bossMovementPathDurationFrames);
      if (elapsedFrames >= 0 && elapsedFrames <= durationFrames) {
        const sample = sampleNormalizedMovementPath(
          boss.bossMovementPathId,
          elapsedFrames / durationFrames
        );
        boss.x = sample.centerXRatio * this.width - boss.width / 2;
        boss.y = sample.centerYRatio * this.height - boss.height / 2;
        boss.vx = 0;
        boss.vy = 0;
        boss.bossPresentationBankRadians = sample.bankRadians;
        return;
      }
      boss.bossMovementPathId = undefined;
      boss.bossMovementPathStartFrame = -1;
      boss.bossMovementPathDurationFrames = 0;
    }
    boss.bossPresentationBankRadians += (0 - boss.bossPresentationBankRadians) * 0.18;
    if (boss.y < targetEntranceY) {
      boss.y = Math.min(targetEntranceY, boss.y + entranceSpeed);
      boss.x += ((this.width - boss.width) / 2 - boss.x) * 0.06;
      return;
    }
    boss.vx = 0;
    boss.vy = 0;
    const pattern = boss.movementPattern ?? 'track-player';
    if (pattern === 'arena-roam' || pattern === 'gatekeeper-cycle') {
      const pressure = 1 - clamp(healthRatio, 0, 1);
      const roamWidth = Math.max(24, this.width - boss.width - 24);
      const targetX = 12 + roamWidth * (0.5 + Math.sin(boss.attackTimer * 0.017) * 0.37);
      const targetY = targetEntranceY + Math.min(this.height * 0.3, 280)
        * (0.43 + Math.cos(boss.attackTimer * 0.013) * 0.34);
      boss.x += (targetX - boss.x) * (0.03 + pressure * 0.016) * boss.activeBossPhaseSpeedMultiplier;
      boss.y += (targetY - boss.y) * (0.026 + pressure * 0.01) * boss.activeBossPhaseSpeedMultiplier;
    } else if (pattern === 'sine-drift') {
      const driftWidth = Math.max(20, this.width - boss.width - 24);
      const targetX = 12 + driftWidth * (
        0.5 + Math.sin(boss.attackTimer * 0.018) * 0.38
      );
      const targetY = targetEntranceY
        + Math.min(70, this.height * 0.09)
        * (0.5 + Math.sin(boss.attackTimer * 0.012 + Math.PI * 0.25) * 0.5);
      const followRate = 0.022 + Math.min(0.018, speed * 0.004);
      boss.x += (targetX - boss.x) * followRate;
      boss.y += (targetY - boss.y) * followRate;
    } else if (pattern === 'wall-march') {
      boss.x += Math.cos(boss.attackTimer * 0.018) * speed;
    } else {
      const targetX = this.player.x + this.player.width / 2 - boss.width / 2;
      boss.x += (targetX - boss.x) * 0.018 * boss.activeBossPhaseSpeedMultiplier;
    }
    boss.x = clamp(boss.x, 10, Math.max(10, this.width - boss.width - 10));
    boss.y = clamp(boss.y, targetEntranceY, Math.max(targetEntranceY, this.height * 0.48 - boss.height));
  }

  updateEscalationBossAttacks(boss: Entity) {
    // Graph-authored Campaign bosses already own a bounded attack identity.
    // The legacy cycle escalation used to stack an unrelated gap ring/target
    // strike on top of those patterns (most visibly the M50 Crown Claw), which
    // erased their intended counterplay and caused unbounded hostile peaks.
    if (String(boss.sourceEventId ?? '').endsWith('-major-boss')) return;
    const cycle = this.getCampaignCycle();
    if (cycle < 1 || boss.y < 48 || boss.isCharging) return;
    const isVioletArbiter = boss.sourceEventId === 'helix-convergence-final-boss';
    const ringInterval = isVioletArbiter ? 420 : Math.max(250, 390 - cycle * 22);
    const strikeInterval = isVioletArbiter ? 510 : Math.max(300, 470 - cycle * 24);
    if (boss.attackTimer > 90 && boss.attackTimer % ringInterval === 0) {
      this.spawnBossGapRing(boss);
      return;
    }
    if (boss.attackTimer > 120 && boss.attackTimer % strikeInterval === Math.floor(strikeInterval * 0.48)) {
      this.queueBossTargetStrike(boss, isVioletArbiter ? 60 : 54);
    }
  }

  updateBoss(boss: Entity) {
    if (this.updateBossRevival(boss)) return;
    boss.attackTimer++;
    this.applyPreviewBossAttackLoop(boss);
    const healthRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
    const resolvedPhase = this.applyConfiguredBossPhase(boss);
    this.updateBossLiveRotor(boss);
    const legacyConfiguredPhase = boss.phaseThresholds.length > 0
      ? Math.max(1, boss.phaseThresholds.filter((threshold) => healthRatio <= threshold).length)
      : 0;
    const phase = resolvedPhase || legacyConfiguredPhase || Math.max(1, this.stats.wave);
    if (boss.sourceItemId === GATEKEEPER_PRIME_BOSS_ID) {
      this.updateGatekeeperPrime(boss, healthRatio);
      return;
    }
    if (this.updateConfiguredBossTimeline(boss, phase)) {
      this.updateTimelineBossMovement(boss, healthRatio);
      if (
        boss.bossActionPresentation?.stage === 'fire'
        && boss.bossActionPresentation.motionCue
          === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE
      ) {
        this.spawnHeliosCrossfirePulse(boss, phase, boss.bossActionPresentation);
      }
      return;
    }
    if (boss.bossAttackArchetype) {
      this.updateGeneratedBossArchetype(boss, boss.bossAttackArchetype, healthRatio, phase);
      return;
    }
    this.updateEscalationBossAttacks(boss);
    if (boss.movementPattern === 'arena-roam') {
      this.updateArenaRoamingBoss(boss, healthRatio, phase);
      return;
    }
    if (boss.bossRigId === 'paywall-siege') {
      this.updatePaywallLayeredBoss(boss);
      return;
    }
    if (boss.bossRigId === 'crown-claw') {
      this.updateCrownClawBoss(boss);
      return;
    }
    const speedMult = (1 + (phase * 0.1)) * boss.activeBossPhaseSpeedMultiplier;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerNearEdge = playerCenterX < this.width * 0.18 || playerCenterX > this.width * 0.82;
    const hasActiveBeam = this.entities.some(e => e.isBeam && !e.markedForDeletion);
    if (boss.y < 80) boss.vy = boss.configuredSpeed ?? 2;
    else {
      boss.vy = 0;
      if (!boss.isCharging && !hasActiveBeam) {
          const hoverOffset = Math.sin(boss.attackTimer * 0.03) * (playerNearEdge ? 1.4 : 3);
          const edgeLead = playerNearEdge
            ? (playerCenterX < this.width / 2 ? -boss.width * 0.24 : boss.width * 0.24)
            : 0;
          const targetX = playerCenterX - boss.width / 2 + edgeLead;
          const dx = targetX - boss.x;
          const followRate = (playerNearEdge ? 0.026 : 0.015) + Math.min(0.014, (phase - 1) * 0.003);
          if (Math.abs(dx) > 6) boss.x += (dx * followRate) * speedMult;
          boss.x += hoverOffset;
      }
    }

    boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));
    const hullPressure = 1 - clamp(healthRatio, 0, 1);
    const pressureCadence = 1 - hullPressure * 0.34;
    const cycleLength = Math.max(250, Math.round((410 - Math.min(4, phase - 1) * 18) * pressureCadence));
    const burstEnd = Math.max(170, Math.round((250 - Math.min(4, phase - 1) * 8) * pressureCadence));
    const chargeEnd = burstEnd + 70;
    const attackCycle = boss.attackTimer % cycleLength;
    const hasConfiguredWeapons = boss.weaponKinds.length > 0;
    const bossComponents = boss.bossComponents ?? [];
    const hasOperationalCannon = bossComponents.length === 0 || bossComponents.some((component) => (
      !component.destroyed && (component.id === 'left-cannon' || component.id === 'right-cannon')
    ));
    const allowsBeam = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => kind.includes('beam'));
    const allowsBurst = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => !kind.includes('beam'));

    if (attackCycle < burstEnd || !allowsBeam) {
        boss.isCharging = false;
        const baseFireRate = boss.attackIntervalFrames ?? Math.max(20, 60 - (phase * 7));
        const isGatekeeper = isMajorBossId(boss.sourceItemId) || boss.text === 'GATEKEEPER';
        const cadenceConfig = isGatekeeper ? GATEKEEPER_CADENCE_BY_WAVE[this.wave] : undefined;
        const healthScaledBaseFireRate = cadenceConfig
          ? baseFireRate
          : Math.max(14, Math.round(baseFireRate * (0.62 + clamp(healthRatio, 0, 1) * 0.38)));
        const fireRate = cadenceConfig
          ? getGatekeeperBurstInterval(baseFireRate, healthRatio, cadenceConfig)
          : healthScaledBaseFireRate;
        const activeFireRate = hasOperationalCannon
          ? fireRate
          : Math.max(16, Math.round(fireRate * (boss.bossRigId === 'citation-storm' ? 1.02 : 1.12)));
        const pressuredFireRate = Math.max(8, Math.round(activeFireRate * (1 - hullPressure * 0.28)));
        const isBurstReady = boss.attackTimer - boss.lastBurstAttackTimer >= pressuredFireRate;
        if (allowsBurst && isBurstReady) {
          this.spawnBossBurst(boss, phase);
          boss.lastBurstAttackTimer = boss.attackTimer;
        }
    } else if (attackCycle >= burstEnd && attackCycle < chargeEnd) {
        if (attackCycle === burstEnd || boss.beamLaneSign === 0) {
          boss.beamLaneSign = this.gameplayRandom.chance(0.5) ? -1 : 1;
        }

        boss.isCharging = true;
        const laneCenterX = boss.beamLaneSign < 0 ? this.width * 0.3 : this.width * 0.7;
        const laneTargetX = laneCenterX - boss.width / 2;
        boss.x += (laneTargetX - boss.x)
          * (0.038 + Math.min(0.02, phase * 0.003))
          * boss.activeBossPhaseSpeedMultiplier;
        boss.x += Math.sin(boss.attackTimer * 0.24) * 1.2 * boss.activeBossPhaseSpeedMultiplier;
        if (boss.attackTimer % 15 === 0) {
             const laneLabel = boss.beamLaneSign < 0 ? "LEFT" : "RIGHT";
             this.spawnFloatingText(boss.x + boss.width/2, boss.y, `${laneLabel} BEAM!`, "#ff0000");
        }
    } else {
        const pulseIndex = Math.floor((attackCycle - chargeEnd) / Math.max(18, 26 - phase * 2));
        const pulseFrame = (attackCycle - chargeEnd) % Math.max(18, 26 - phase * 2);
        const pulseCount = this.getBossPulseCount(phase);
        if (pulseIndex >= 0 && pulseIndex < pulseCount && pulseFrame === 0) {
          this.spawnBossBeam(boss, phase, pulseIndex);
        }
        boss.isCharging = (pulseIndex >= 0 && pulseIndex < pulseCount) || hasActiveBeam;
        if (!boss.isCharging) boss.beamLaneSign = 0;
    }
  }

  spawnPowerup(x: number, y: number, forcedPowerupId?: string) {
    const powerupIdToType: Record<string, PowerupType> = {
      'double-shot': PowerupType.DOUBLE_SHOT,
      'triple-shot': PowerupType.TRIPLE_SHOT,
      'max-shot': PowerupType.MAX_SHOT,
      magnet: PowerupType.MAGNET,
      shield: PowerupType.SHIELD,
      'research-beam': PowerupType.RESEARCH_BEAM,
      'extra-life': PowerupType.EXTRA_LIFE
    };
    const weights = new Map<PowerupType, number>([
      [PowerupType.RESEARCH_BEAM, 0.08],
      [PowerupType.DOUBLE_SHOT, 0.36],
      [PowerupType.TRIPLE_SHOT, 0.34],
      [PowerupType.MAX_SHOT, 0.055],
      [PowerupType.MAGNET, 0.12],
      [PowerupType.SHIELD, 0.1],
      [PowerupType.EXTRA_LIFE, 0.02]
    ]);
    const configuredIds = this.getCurrentLevelDefinition()?.availablePowerupIds;
    const allowed = Array.isArray(configuredIds) && configuredIds.length > 0
      ? configuredIds.map((id) => powerupIdToType[id]).filter((type): type is PowerupType => Boolean(type))
      : Array.from(weights.keys()).filter((type) => type !== PowerupType.EXTRA_LIFE);
    const candidates = allowed.length > 0 ? allowed : [PowerupType.DOUBLE_SHOT];
    const totalWeight = candidates.reduce((sum, candidate) => sum + (weights.get(candidate) || 0.01), 0);
    let roll = this.nextGameplayRandom() * totalWeight;
    let type = forcedPowerupId && powerupIdToType[forcedPowerupId]
      ? powerupIdToType[forcedPowerupId]
      : candidates[0];
    if (!forcedPowerupId || !powerupIdToType[forcedPowerupId]) {
      for (const candidate of candidates) {
        roll -= weights.get(candidate) || 0.01;
        if (roll <= 0) {
          type = candidate;
          break;
        }
      }
    }

    const p = this.createEntity(EntityType.POWERUP, x, y);
    p.text = type;
    p.width = 36;
    p.height = 36;
    p.vy = 2.0;
    p.variant = this.gameplayRandom.integer(0, 1000);
    this.entities.push(p);
    return p;
  }

  spawnBombDrop(x: number, y: number) {
    const b = this.createEntity(EntityType.BOMB, x, y);
    b.width = 38;
    b.height = 38;
    b.vy = 1.7;
    b.vx = this.gameplayRandomRange(-0.35, 0.35);
    b.variant = this.gameplayRandom.integer(0, 1000);
    this.entities.push(b);
  }

  spawnCoin(x: number, y: number) {
    const c = this.createEntity(EntityType.COIN, x, y);
    c.width = 24;
    c.height = 24;
    c.vy = 2.0;
    c.vx = this.gameplayRandomRange(-0.25, 0.25);
    c.variant = this.gameplayRandom.integer(0, 1000);
    this.entities.push(c);
    return c;
  }

  private spawnPresentDropCoinBurst(target: Entity) {
    const configuredCoinValue = Number(target.coinDropValue);
    const requestedSpawnCount = Number.isFinite(configuredCoinValue)
      ? Math.max(
          0,
          Math.min(MAX_ACTIVE_BOSS_REWARD_COINS, Math.floor(configuredCoinValue))
        )
      : 1;
    let activeCoinCount = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && entity.type === EntityType.COIN) activeCoinCount++;
    }
    const spawnCount = Math.min(
      requestedSpawnCount,
      Math.max(0, MAX_ACTIVE_BOSS_REWARD_COINS - activeCoinCount)
    );
    if (spawnCount <= 0) return 0;

    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    const seed = Math.floor(Number(target.variant) || 0) + this.stats.wave * 29;
    for (let index = 0; index < spawnCount; index++) {
      const motion = getBossCoinBurstKinematics(index, spawnCount, this.stats.wave, seed);
      const coin = this.spawnCoin(
        centerX - 12 + motion.offsetX,
        centerY - 12 + motion.offsetY
      );
      coin.vx = motion.vx;
      coin.vy = motion.vy;
      coin.variant = motion.variant;
      coin.coinBurstFrames = BOSS_COIN_BURST_FRAMES + (index % 7);
      coin.coinGravity = motion.gravity;
      coin.coinBounceFloorY = Math.max(
        centerY + 30,
        Math.min(this.height - coin.height - 24, centerY + motion.floorOffset)
      );
      coin.coinBouncesRemaining = motion.bounces;
      coin.sourceEventId = target.sourceEventId;
      coin.sourceItemId = target.sourceItemId;
    }
    return spawnCount;
  }

  spawnBossCoinBurst(target: Entity) {
    const rewardKind = target.type === EntityType.BOSS
      ? 'main-boss'
      : target.type === EntityType.MINI_BOSS
        ? 'mini-boss'
        : null;
    if (!rewardKind) return 0;

    const rewardCount = getBossCoinBurstCount(rewardKind, this.stats.wave);
    let activeCoinCount = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && entity.type === EntityType.COIN) activeCoinCount++;
    }
    const spawnCount = Math.min(rewardCount, Math.max(0, MAX_ACTIVE_BOSS_REWARD_COINS - activeCoinCount));
    if (spawnCount <= 0) return 0;

    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    const seed = Math.floor(Number(target.variant) || 0) + this.stats.wave * 17;
    for (let index = 0; index < spawnCount; index++) {
      const motion = getBossCoinBurstKinematics(index, spawnCount, this.stats.wave, seed);
      const coin = this.spawnCoin(
        centerX - 12 + motion.offsetX,
        centerY - 12 + motion.offsetY
      );
      coin.vx = motion.vx;
      coin.vy = motion.vy;
      coin.variant = motion.variant;
      coin.coinBurstFrames = BOSS_COIN_BURST_FRAMES + (index % 9);
      coin.coinGravity = motion.gravity;
      coin.coinBounceFloorY = Math.max(
        centerY + 38,
        Math.min(this.height - coin.height - 28, centerY + motion.floorOffset)
      );
      coin.coinBouncesRemaining = motion.bounces;
      coin.bossRewardWave = this.wave;
    }

    return spawnCount;
  }

  private creditCoinValue(coin: Entity) {
    if (coin.coinValueCredited) return false;

    coin.coinValueCredited = true;
    this.stats.coins++;
    this.stats.totalCoins++;
    this.stats.score += this.activePowerups.has(PowerupType.MAGNET) ? 2 : 1;
    this.addFlaskChargeFromCoin();
    return true;
  }

  private bankDepartingBossCoins() {
    let credited = 0;
    for (const coin of this.entities) {
      if (
        coin.markedForDeletion
        || coin.type !== EntityType.COIN
        || coin.bossRewardWave !== this.wave
      ) continue;

      if (this.creditCoinValue(coin)) credited++;
    }

    if (credited > 0) this.refreshWaveVictorySummaryMetrics();
    return credited;
  }

  private refreshWaveVictorySummaryMetrics() {
    if (!this.waveVictorySummary) return;
    this.waveVictorySummary = refreshWaveVictoryRewardMetrics(
      this.waveVictorySummary,
      this.stats,
      this.waveStartScore,
      this.waveStartTotalCoins,
      this.tacticalWaveStartTotalCoins
    );
  }

  private settleBossCoinMotion(coin: Entity) {
    coin.coinBurstFrames = 0;
    coin.coinGravity = 0;
    coin.coinBounceFloorY = undefined;
    coin.coinBouncesRemaining = 0;
    coin.vx = clamp(coin.vx * 0.16, -0.35, 0.35);
    coin.vy = 1.72 + (Math.abs(coin.variant) % 5) * 0.08;
  }

  private updateCoinEntity(coin: Entity) {
    if (coin.markedForDeletion) return;

    coin.x += coin.vx;
    coin.y += coin.vy;

    if (coin.coinBurstFrames > 0) {
      coin.coinBurstFrames--;
      coin.vy += coin.coinGravity;
      coin.vx *= 0.994;

      const leftEdge = 6;
      const rightEdge = Math.max(leftEdge, this.width - coin.width - 6);
      if (coin.x < leftEdge) {
        coin.x = leftEdge;
        coin.vx = Math.abs(coin.vx) * 0.72;
      } else if (coin.x > rightEdge) {
        coin.x = rightEdge;
        coin.vx = -Math.abs(coin.vx) * 0.72;
      }

      const floorY = coin.coinBounceFloorY;
      if (Number.isFinite(floorY) && coin.y + coin.height >= (floorY as number) && coin.vy > 0) {
        coin.y = (floorY as number) - coin.height;
        if (coin.coinBouncesRemaining > 0) {
          coin.vy = -Math.max(1.45, Math.abs(coin.vy) * 0.34);
          coin.vx *= 0.76;
          coin.coinBouncesRemaining--;
          coin.coinBounceFloorY = Math.min(this.height - 28, (floorY as number) + 22);
        } else {
          this.settleBossCoinMotion(coin);
        }
      } else if (coin.coinBurstFrames <= 0) {
        this.settleBossCoinMotion(coin);
      }
    }

    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    const coinCenterX = coin.x + coin.width / 2;
    const coinCenterY = coin.y + coin.height / 2;
    const magnetCompanion = this.squadCompanions.find((companion) => (
      companion.ability === 'coin-magnet' && companion.entryProgress >= 0.5
    ));
    const hasPowerupMagnet = this.activePowerups.has(PowerupType.MAGNET);
    const companionRadius = magnetCompanion ? 150 + magnetCompanion.level * 38 : 0;
    const companionDx = magnetCompanion ? magnetCompanion.x - coinCenterX : 0;
    const companionDy = magnetCompanion ? magnetCompanion.y - coinCenterY : 0;
    const companionDistance = Math.max(1, Math.hypot(companionDx, companionDy));
    const useCompanionMagnet = !hasPowerupMagnet
      && Boolean(magnetCompanion)
      && companionDistance < companionRadius;
    const dx = useCompanionMagnet ? companionDx : playerCenterX - coinCenterX;
    const dy = useCompanionMagnet ? companionDy : playerCenterY - coinCenterY;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const radius = hasPowerupMagnet
      ? POWERUP_COIN_MAGNET_RADIUS
      : useCompanionMagnet
        ? companionRadius
        : BASE_COIN_MAGNET_RADIUS;

    if (dist < radius) {
      const closeness = 1 - (dist / radius);
      const pull = hasPowerupMagnet
        ? 0.14 + closeness * 0.11
        : useCompanionMagnet
          ? 0.075 + closeness * (0.07 + (magnetCompanion?.level ?? 1) * 0.008)
          : 0.035 + closeness * 0.05;
      coin.x += dx * pull;
      coin.y += dy * pull;
    }

    this.collectCoinIfReachedPlayer(coin);
    if (!coin.markedForDeletion && coin.y > this.height) coin.markedForDeletion = true;
  }

  private collectCoinIfReachedPlayer(coin: Entity) {
    const playerBox = this.getCollisionBox(this.player);
    const coinBox = this.getCollisionBox(coin);
    if (!this.boxesIntersect(playerBox, coinBox) && !this.isCoinCollectedBySquadMagnet(coin)) return false;

    coin.markedForDeletion = true;
    const credited = this.creditCoinValue(coin);
    this.registerCoinPickup(coin.x + coin.width / 2, coin.y + coin.height / 2);

    if (credited && this.waveTransitionPending) this.refreshWaveVictorySummaryMetrics();
    return true;
  }

  spawnExplosion(x: number, y: number, color: string, intensity: number = 1) {
    if (intensity >= 1.2) {
      this.playSound('explode', intensity, {
        pitchJitter: 0.08,
        pitchOffset: -0.14
      });
    } else {
      this.playSound('impact', Math.max(0.18, intensity * 0.32), {
        pitchJitter: 0.08,
        pitchOffset: -0.1
      });
    }
    this.spawnBurst(x, y, color, this.shouldUseLeanEffects() ? 7 : 12, 5, 5);
    this.addShake(this.shouldUseLeanEffects() ? 0.55 : 0.9);
  }

  spawnFloatingText(x: number, y: number, text: string, color: string, fontSize: number = 32) {
    if (this.liveEffectCount >= this.getEffectCap()) return;
    this.entities.push(new VisualEffect(x, y, 'text', text, color, fontSize));
    this.liveEffectCount++;
  }

  spawnRingEffect(x: number, y: number, color: string) {
    if (this.liveEffectCount >= this.getEffectCap()) return;
    this.entities.push(new VisualEffect(x, y, 'ring', '', color));
    this.liveEffectCount++;
  }

  registerCoinPickup(x: number, y: number) {
    this.coinCombo = this.coinComboTimer > 0 ? this.coinCombo + 1 : 1;
    this.coinComboTimer = GAME_FEEL.comboWindowFrames;
    const label = this.coinCombo > 1 ? `+1 x${Math.min(this.coinCombo, 99)}` : '+1';
    const lean = this.shouldUseLeanEffects();
    this.playSound('coin', Math.min(this.coinCombo, 10));
    if (!lean || this.coinCombo % 3 === 0) {
      this.spawnFloatingText(x, y - 12, label, this.coinCombo > 1 ? '#facc15' : '#67e8f9', this.coinCombo > 1 ? 18 : 16);
    }
    this.spawnBurst(x, y, '#facc15', lean ? 2 : this.coinCombo > 1 ? 8 : 5, 2.4, 3.5);
    this.kickPlayerSquash(0.026);
    this.addShake(lean ? 0.12 : this.coinCombo > 4 ? 0.48 : 0.22);
  }

  activatePowerup(type: PowerupType, countUse: boolean = true) {
    if (countUse) {
      this.stats.powerupUses = {
        ...this.stats.powerupUses,
        [type]: (this.stats.powerupUses?.[type] || 0) + 1
      };
    }

    if (type !== PowerupType.EXTRA_LIFE) {
      const currentDuration = this.activePowerups.get(type) || 0;
      const isFounderShot = type === PowerupType.DOUBLE_SHOT || type === PowerupType.TRIPLE_SHOT;
      const duration = type === PowerupType.MAX_SHOT
        ? GAME_CONFIG.MAX_SHOT_DURATION
        : type === PowerupType.RESEARCH_BEAM
        ? GAME_CONFIG.RESEARCH_BEAM_DURATION
        : isFounderShot
          ? GAME_CONFIG.FOUNDER_SHOT_DURATION
          : GAME_CONFIG.POWERUP_DURATION;
      this.activePowerups.set(type, currentDuration + duration);
    }

    this.playSound('powerup');
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;

    if (type === PowerupType.SHIELD) {
      this.invincibleTimer += GAME_CONFIG.SHIELD_DURATION;
      this.spawnFloatingText(cx, cy - 20, "SHIELD!", "#00C851");
      this.spawnRingEffect(cx, cy, "#00C851");
    } else if (type === PowerupType.MAGNET) {
      this.spawnFloatingText(cx, cy - 20, "MAGNET!", "#FFD700");
      this.spawnRingEffect(cx, cy, "#FFD700");
    } else if (type === PowerupType.TRIPLE_SHOT || type === PowerupType.DOUBLE_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "OVERDRIVE SPREAD!", "#67e8f9");
      this.spawnRingEffect(cx, cy, "#67e8f9");
    } else if (type === PowerupType.MAX_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "MAX SHOT!", "#22d3ee");
      this.spawnRingEffect(cx, cy, "#67e8f9");
      this.flashAlpha = Math.max(this.flashAlpha, 0.22);
      this.addShake(1.4);
    } else if (type === PowerupType.RESEARCH_BEAM) {
      this.spawnFloatingText(cx, cy - 20, "RESEARCH BEAM!", "#a855f7");
      this.spawnRingEffect(cx, cy, "#a855f7");
    } else if (type === PowerupType.EXTRA_LIFE) {
      this.lives = Math.min(this.lives + 1, GAME_CONFIG.MAX_LIVES);
      this.stats.lives = this.lives;
      this.spawnFloatingText(cx, cy - 20, "+1 LIFE!", "#ff4444");
      this.spawnRingEffect(cx, cy, "#ff4444");
    }
    emitSquadDomainEvent('powerup_collected', {
      profileId: this.squadLoadout?.profileId ?? 'guest',
      powerup: type
    });
  }

  getCollisionBox(entity: Entity) {
    let insetX = 0;
    let insetY = 0;

    switch (entity.type) {
      case EntityType.PLAYER:
        insetX = entity.width * 0.29;
        insetY = entity.height * 0.24;
        break;
      case EntityType.PROJECTILE:
      case EntityType.MISSILE:
        insetX = entity.width * 0.2;
        insetY = entity.isBeam ? entity.height * 0.04 : entity.height * 0.2;
        break;
      case EntityType.ENEMY_SWARM:
        insetX = entity.width * 0.24;
        insetY = entity.height * 0.24;
        break;
      case EntityType.ENEMY_DRONE:
      case EntityType.ENEMY_JOURNAL:
        insetX = entity.width * 0.16;
        insetY = entity.height * 0.16;
        break;
      case EntityType.ENEMY_BRICK:
      case EntityType.SUPPLY_DROP:
      case EntityType.ENEMY_INVADER:
        insetX = entity.width * 0.1;
        insetY = entity.height * 0.1;
        break;
      case EntityType.MINI_BOSS:
      case EntityType.BOSS:
        insetX = entity.width * 0.08;
        insetY = entity.height * 0.08;
        break;
      default:
        insetX = entity.width * 0.08;
        insetY = entity.height * 0.08;
    }

    return {
      x: entity.x + insetX,
      y: entity.y + insetY,
      width: Math.max(4, entity.width - insetX * 2),
      height: Math.max(4, entity.height - insetY * 2)
    };
  }

  boxesIntersect(a: CollisionBox, b: CollisionBox) {
    return !(b.x > a.x + a.width || b.x + b.width < a.x || b.y > a.y + a.height || b.y + b.height < a.y);
  }

  resolvePlayerRamCollision(enemy: Entity, protectedFromDamage: boolean) {
    if (this.frameCount - this.lastPlayerRamFrame < PLAYER_RAM_COOLDOWN_FRAMES) return;
    this.lastPlayerRamFrame = this.frameCount;

    const bossContact = enemy.type === EntityType.BOSS || enemy.type === EntityType.MINI_BOSS;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;
    const deltaX = playerCenterX - enemyCenterX;
    const deltaY = playerCenterY - enemyCenterY;
    const distance = Math.hypot(deltaX, deltaY);
    const normalX = distance > 0.001 ? deltaX / distance : 0;
    const normalY = distance > 0.001 ? deltaY / distance : 1;
    const recoilForce = bossContact ? 11.5 : 8.5;
    const separation = bossContact ? 14 : 9;

    this.playerVel.x += normalX * recoilForce;
    this.playerVel.y += normalY * recoilForce;
    this.player.x = clamp(
      this.player.x + normalX * separation,
      0,
      Math.max(0, this.width - this.player.width)
    );
    this.player.y = clamp(
      this.player.y + normalY * separation,
      0,
      Math.max(0, this.height - this.player.height)
    );

    if (!bossContact) {
      enemy.vx -= normalX * 1.8;
      enemy.vy -= normalY * 1.2;
    }

    let appliedDamage = 0;
    if (!protectedFromDamage) {
      const incomingDamage = Math.max(1, Math.round(Number(enemy.contactDamage) || 1));
      if (!this.testMode) {
        this.applyPlayerLifeDamage(incomingDamage);
        appliedDamage = incomingDamage;
      }
      this.invincibleTimer = 60;
    } else if (this.activePowerups.has(PowerupType.SHIELD)) {
      const shieldPenalty = bossContact ? 150 : 30;
      const currentShieldTime = this.activePowerups.get(PowerupType.SHIELD) || 0;
      this.activePowerups.set(PowerupType.SHIELD, Math.max(0, currentShieldTime - shieldPenalty));
    }

    this.stats.lives = this.lives;
    this.recordPlayerDamage(appliedDamage);
    const contactX = (playerCenterX + enemyCenterX) / 2;
    const contactY = (playerCenterY + enemyCenterY) / 2;
    const contactColor = protectedFromDamage ? '#67e8f9' : '#fb7185';
    this.playSound('hit');
    this.spawnRingEffect(contactX, contactY, contactColor);
    this.spawnBurst(contactX, contactY, contactColor, bossContact ? 12 : 8, bossContact ? 4.8 : 3.6, 4);
    this.flashAlpha = Math.max(this.flashAlpha, protectedFromDamage ? 0.3 : 0.5);
    this.addShake(bossContact ? 9.5 : 6.5);
    this.addHitStop(bossContact ? 10 : 7);
    this.kickPlayerSquash(bossContact ? 0.28 : 0.2);

    if (!bossContact && !enemy.markedForDeletion) {
      this.handleEnemyDestroyed(enemy);
    }

    if (!this.testMode && this.lives <= 0) this.startDeathSequence();
  }

  private registerPlayerProjectileHitFeedback(source: Entity, previewSafeHit: boolean) {
    if (previewSafeHit) {
      if (
        this.frameCount - this.lastPreviewPlayerHitFeedbackFrame
        < PREVIEW_PLAYER_HIT_FEEDBACK_COOLDOWN_FRAMES
      ) {
        return;
      }
      this.lastPreviewPlayerHitFeedbackFrame = this.frameCount;
    }

    this.playSound('hit');
    this.spawnExplosion(this.player.x, this.player.y, '#ffffff');
    this.spawnFloatingText(
      this.player.x + this.player.width / 2,
      this.player.y + 8,
      'HIT!',
      '#fb7185',
      22
    );
    this.flashAlpha = Math.max(this.flashAlpha, 0.48);
    this.addShake(7);
    this.addHitStop(10);
    this.kickPlayerSquash(0.22);
    const shove = this.player.x + this.player.width / 2 < source.x + source.width / 2
      ? -4.5
      : 4.5;
    this.playerVel.x += shove;
    this.playerVel.y += 2.4;
  }

  private rotatedBeamIntersectsBox(beam: Entity, box: CollisionBox) {
    if (beam.beamAngleRadians === null) return false;
    return rotatedBeamRectangleIntersectsBox({
      x: beam.x,
      y: beam.y,
      width: beam.width,
      height: beam.height,
      angleRadians: beam.beamAngleRadians
    }, box);
  }

  checkCollisions() {
    const collisionBoxes = this.collisionBoxes;
    collisionBoxes.clear();
    const getBox = (entity: Entity) => {
      let box = collisionBoxes.get(entity);
      if (!box) {
        box = this.getCollisionBox(entity);
        collisionBoxes.set(entity, box);
      }
      return box;
    };
    const intersectsPlayer = (entity: Entity) => {
      const playerBox = getBox(this.player);
      const isBossLike = entity.type === EntityType.BOSS
        || entity.type === EntityType.MINI_BOSS;
      if (
        isBossLike
        && this.isSelectedPreviewBoss(entity)
        && (
          entity.bossActionPresentation?.primitiveId === 'articulated-melee-sweep'
          || entity.bossActionPresentation?.primitiveId === 'tracking-pincer-dive'
        )
      ) {
        return this.bossMeleeClawsIntersectBox(entity, playerBox);
      }
      if (isBossLike && this.getBossCollisionMask(entity)) {
        return this.bossSilhouetteIntersectsBox(entity, playerBox);
      }
      if (
        (
          entity.frontierCrownclawArtifactKind === 'harpoon-link'
          || entity.frontierCrownclawArtifactKind === 'harpoon-claw'
        )
        && entity.beamAngleRadians !== null
      ) {
        return this.rotatedBeamIntersectsBox(entity, playerBox);
      }
      if (entity.isBeam && entity.beamAngleRadians !== null) {
        return this.rotatedBeamIntersectsBox(entity, playerBox);
      }
      return this.boxesIntersect(playerBox, getBox(entity));
    };
    const enemyTargets = this.enemyTargetsBuffer;
    const playerShots = this.playerShotsBuffer;
    enemyTargets.length = 0;
    playerShots.length = 0;

    for (const e of this.entities) {
      if (e.markedForDeletion) continue;
      const isEnemy = this.isEnemyTarget(e);

      if (isEnemy) {
        enemyTargets.push(e);
      }

      if ((e.type === EntityType.PROJECTILE && e.isPlayerShot) || e.type === EntityType.MISSILE) {
        playerShots.push(e);
      }

      if (e.type === EntityType.POWERUP && intersectsPlayer(e)) {
        e.markedForDeletion = true;
        const type = e.text as PowerupType;
        this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#ffffff', 9, 3.2, 4);
        this.kickPlayerSquash(0.06);
        this.addShake(0.65);
        this.activatePowerup(type);
      }

      if (e.type === EntityType.BOMB && intersectsPlayer(e)) {
        e.markedForDeletion = true;
        this.stats.bombs = Math.max(0, Math.floor(this.stats.bombs || 0)) + 1;
        this.spawnFloatingText(e.x + e.width / 2, e.y - 10, 'BOMB +1', '#facc15', 18);
        this.spawnRingEffect(e.x + e.width / 2, e.y + e.height / 2, '#facc15');
        this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#facc15', 9, 3.2, 4);
        this.kickPlayerSquash(0.045);
        this.addShake(0.5);
        this.playSound('powerup');
      }

      // Determine if this entity hurts the player
      let hurtsPlayer = false;

      // 1. Enemies always hurt
      if (isEnemy) {
          hurtsPlayer = e.type === EntityType.SUPPLY_DROP
            ? false
            : this.isDestructiblePrismMothBrood(e)
            ? Boolean(e.prismMothArtifactState?.damageActive)
            : e.type === EntityType.BOSS && this.isSandboxPrismMoth(e)
            ? e.bossPrismMothBodyDamageActive
            : e.type !== EntityType.BOSS
              || !e.bossCornerAmbushRamState
              || e.bossCornerAmbushRamState.stage === 'charge';
      }

      // 2. Projectiles hurt ONLY if they are NOT player shots
      if (e.type === EntityType.PROJECTILE) {
          // If it's a beam, it hurts (Boss weapon)
          if (e.isBeam) {
              hurtsPlayer = !e.isTelegraph;
          }
          // If it's NOT a player shot, it hurts
          else if (
            !e.isPlayerShot
            && !e.clawReturning
            && !e.clawHasHitPlayer
            && (
              !e.frontierCrownclawArtifactKind
              || e.frontierCrownclawDamageActive
            )
            && (!e.heliosMineState || this.isHeliosMineDamageActive(e))
            && (!e.prismMothArtifactState || e.prismMothArtifactState.damageActive)
          ) {
               // EXTRA FAILSAFE: If it's Cyan or Purple, assume it's player ammo (glitch protection)
               if (e.color !== '#00FFFF' && e.color !== '#00ffff' && e.color !== '#6c63ff') {
                   hurtsPlayer = true;
               }
          }
      }

      // The Director is an inspection surface, so its preview ship must survive long
      // enough to observe a complete wave without changing production combat rules.
      const isPreviewInvincible = this.previewMode && this.previewInvincible;
      const isInvincible = (this.previewMode && this.previewInvincible)
        || this.invincibleTimer > 0
        || this.isPowerupActive(PowerupType.SHIELD)
        || this.hasMaxShotShield();

      if (hurtsPlayer && intersectsPlayer(e)) {
        if (isEnemy) {
          this.resolvePlayerRamCollision(e, isInvincible);
          continue;
        }

        if (isInvincible) {
           if (e.type === EntityType.PROJECTILE && !e.isBeam) {
             if (this.isCrownClawProjectile(e)) {
               e.clawReturning = true;
               e.clawHasHitPlayer = true;
              } else if (e.heliosMineState) {
                e.heliosMineState.hitPlayer = true;
              } else if (!e.frontierCrownclawArtifactKind) {
                e.markedForDeletion = true;
              }
            }
            if (isPreviewInvincible) {
              // Safe preview keeps the full production hit reaction while suppressing
              // only damage/death. The cooldown prevents sustained beams from shaking
              // the camera every simulation frame.
              this.registerPlayerProjectileHitFeedback(e, true);
            } else {
              this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#00C851', 7, 4, 4);
              this.addShake(1.1);
              this.kickPlayerSquash(0.055);
            }

           // Blocking hostile fire still consumes shield duration.
           if (this.isPowerupActive(PowerupType.SHIELD)) {
               const currentShieldTime = this.activePowerups.get(PowerupType.SHIELD) || 0;
               const penalty = 30;
               this.activePowerups.set(PowerupType.SHIELD, Math.max(0, currentShieldTime - penalty));

               // Also reduce base Invincible timer if active (e.g. from pickup)
               if (this.invincibleTimer > 0) {
                   this.invincibleTimer = Math.max(0, this.invincibleTimer - penalty);
               }
           }

        } else {
          const incomingDamage = e.type === EntityType.PROJECTILE
            ? Math.max(1, Math.round(Number(e.damage) || 1))
            : Math.max(1, Math.round(Number(e.contactDamage) || 1));
          if (!this.testMode) {
            this.applyPlayerLifeDamage(incomingDamage);
            this.recordPlayerDamage(incomingDamage);
           }
           this.stats.lives = this.lives;
           this.invincibleTimer = 60;
           this.registerPlayerProjectileHitFeedback(e, false);
           // Only delete bullet if it isn't a beam
           if (e.type === EntityType.PROJECTILE && !e.isBeam) {
             if (this.isCrownClawProjectile(e)) {
               e.clawReturning = true;
               e.clawHasHitPlayer = true;
             } else if (e.heliosMineState) {
               e.heliosMineState.hitPlayer = true;
             } else if (!e.frontierCrownclawArtifactKind) {
               e.markedForDeletion = true;
             }
           }
          if (!this.testMode && this.lives <= 0) this.startDeathSequence();
        }
      }

    }

    const collisionColumns = this.enemyCollisionColumns;
    const collisionColumnCount = Math.max(1, Math.ceil(this.width / COLLISION_COLUMN_WIDTH));
    while (collisionColumns.length < collisionColumnCount) collisionColumns.push([]);
    collisionColumns.length = collisionColumnCount;
    for (let index = 0; index < collisionColumns.length; index++) collisionColumns[index].length = 0;

    for (let index = 0; index < enemyTargets.length; index++) {
      const target = enemyTargets[index];
      const targetBox = target.type === EntityType.BOSS
        ? this.getBossDamageBounds(target)
        : getBox(target);
      const projectilePadding = target.type === EntityType.BOSS ? 64 : 28;
      const startColumn = clamp(Math.floor((targetBox.x - projectilePadding) / COLLISION_COLUMN_WIDTH), 0, collisionColumnCount - 1);
      const endColumn = clamp(Math.floor((targetBox.x + targetBox.width + projectilePadding) / COLLISION_COLUMN_WIDTH), 0, collisionColumnCount - 1);
      for (let column = startColumn; column <= endColumn; column++) collisionColumns[column].push(target);
    }

    const bossShieldedNow = this.isBossShielded();

    for (const shot of playerShots) {
      if (shot.markedForDeletion) continue;
      const shotBox = getBox(shot);
      const shotColumn = clamp(Math.floor((shotBox.x + shotBox.width / 2) / COLLISION_COLUMN_WIDTH), 0, collisionColumnCount - 1);
      const nearbyTargets = collisionColumns[shotColumn];

      for (let index = 0; index < nearbyTargets.length; index++) {
        const target = nearbyTargets[index];
        if (target.markedForDeletion) continue;
        if (shot.hitTargetIds?.has(target.id)) continue;
        const bossComponent = target.type === EntityType.BOSS
          ? this.getBossComponentHit(target, shotBox)
          : undefined;
        const padding = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS ? 42 : 18;
        if (!bossComponent && (
          shotBox.x > target.x + target.width + padding
          || shotBox.x + shotBox.width < target.x - padding
          || shotBox.y > target.y + target.height + padding
          || shotBox.y + shotBox.height < target.y - padding
        )) {
          continue;
        }
        const bossLikeTarget =
          target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS;
        if (
          !bossComponent
          && (
            bossLikeTarget
              ? !this.bossSilhouetteIntersectsBox(target, shotBox)
              : !this.boxesIntersect(shotBox, getBox(target))
          )
        ) {
          continue;
        }

        if (shot.shipAbilityKind === 'research-charge') {
          this.detonateResearchCharge(shot, shot.x + shot.width / 2, shot.y + shot.height * 0.35);
          break;
        }
        if (shot.shipAbilityKind === 'btc-hash-burst') {
          this.detonateBitcoinHashBurst(shot, shot.x + shot.width / 2, shot.y + shot.height * 0.35);
          break;
        }

        // Boss-type enemies get shaved down a bit faster so fights don't drag.
        const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS;
        const bossShielded = target.type === EntityType.BOSS && bossShieldedNow;
        if (bossShielded) {
          if (!shot.isBeam) shot.markedForDeletion = true;
          this.pulseDamageFlash(target);
          this.registerPrimaryWeaponImpact(target, shot);
          if (this.frameCount % 5 === 0) {
            this.spawnRingEffect(shot.x + shot.width / 2, shot.y + shot.height / 2, '#a7f3d0');
            this.spawnBurst(shot.x + shot.width / 2, shot.y + shot.height / 2, '#a7f3d0', shot.type === EntityType.MISSILE ? 6 : 3, 2.2, 3);
          }
          if (shot.type === EntityType.MISSILE) {
            this.addHitStop(3);
            this.addShake(0.9);
          }
          if (!shot.isBeam) break;
          continue;
        }

        const representedRounds = shot.representedRoundsRemaining > 0
          ? getMaxShotRoundsForTarget(
            shot.representedRoundsRemaining,
            target.hp,
            shot.damage,
            isBossTarget
          )
          : 1;
        const dmg = (shot.type === EntityType.MISSILE
          ? shot.squadAbilityKind
            ? shot.damage * (isBossTarget ? 1.35 : 1)
            : (isBossTarget ? 8 : 5)
          : shot.damage * (isBossTarget ? 1.35 : 1)) * representedRounds;
        if (!shot.isBeam) {
          if (shot.representedRoundsRemaining > 0) {
            shot.hitTargetIds?.add(target.id);
            shot.representedRoundsRemaining = Math.max(
              0,
              shot.representedRoundsRemaining - representedRounds
            );
            if (shot.representedRoundsRemaining <= 0) shot.markedForDeletion = true;
          } else if (shot.pierceRemaining > 0) {
            shot.hitTargetIds?.add(target.id);
            shot.pierceRemaining--;
          } else {
            shot.markedForDeletion = true;
          }
        }
        const previousTargetHealth = target.hp;
        if (bossComponent) {
          this.damageBossComponent(target, bossComponent, dmg);
        } else if (isBossTarget) {
          this.damageBossHull(target, dmg);
        } else {
          target.hp -= dmg;
          this.recordEntityDamage(target, previousTargetHealth);
          this.flashDamageTarget(target);
        }
        this.registerPrimaryWeaponImpact(target, shot);
        this.spawnBurst(shot.x + shot.width / 2, shot.y + shot.height / 2, shot.color || '#67e8f9', shot.type === EntityType.MISSILE ? 8 : 3, shot.type === EntityType.MISSILE ? 3.8 : 1.6, shot.type === EntityType.MISSILE ? 4 : 2.5);
        this.playSound('impact', isBossTarget ? 0.78 : 0.46, {
          pitchJitter: 0.18,
          pitchOffset: isBossTarget ? -0.08 : 0.08
        });
        if (shot.type === EntityType.MISSILE) {
          this.addHitStop(3);
          this.addShake(isBossTarget ? 1.2 : 0.7);
        }

        if (target.hp <= 0) {
          this.handleEnemyDestroyed(target);
        }

        if (!shot.isBeam && shot.markedForDeletion) break;
      }
    }
  }

  getBossWarningComms(_type: BossWarningType) {
    const phase = this.stats.wave;
    const phaseComms = [
      {
        speaker: 'Brian Armstrong',
        role: 'Clarity Relay',
        image: ASSETS.FOUNDER_BRIAN,
        color: '#67e8f9',
        text: 'Instability ahead. The main bottleneck is forming. Clear runway, charge the lab, and get ready.'
      },
      {
        speaker: 'Jeffrey',
        role: 'Peer Review Scout',
        image: ASSETS.FOUNDER_JEFFREY,
        color: '#a7f3d0',
        text: 'Heavy signal ahead. This core moves differently. Watch the lanes before you commit.'
      },
      {
        speaker: 'Patrick',
        role: 'Funding Signal',
        image: ASSETS.FOUNDER_PATRICK,
        color: '#fde68a',
        text: 'Main boss incoming. Dock at the lab now if you want one more ship tune-up before the gate closes.'
      },
      {
        speaker: 'Arshia',
        role: 'Life Support',
        image: ASSETS.FOUNDER_ARSHIA,
        color: '#fda4af',
        text: 'Unstable field ahead. Save your shield, keep your last life clean, and fly through the opening.'
      },
      {
        speaker: 'ResearchHub',
        role: 'Open Science Relay',
        image: ASSETS.FOUNDER_4,
        color: '#c4b5fd',
        text: 'Final bottleneck ahead. No noise in the lane now. Break the core and open the Galaxy.'
      }
    ];

    return phaseComms[Math.min(phaseComms.length - 1, Math.max(0, phase - 1))];
  }

  getBossSkin(e: Entity) {
    const skins = [
      {
        sprite: ASSETS.FINAL_BOSS,
        label: 'GATEKEEPER PRIME',
        accent: '#fb7185',
        shadow: '#ef4444'
      },
      {
        sprite: ASSETS.MINI_BOSS,
        label: 'REVIEW SENTINEL',
        accent: '#67e8f9',
        shadow: '#38bdf8'
      },
      {
        sprite: ASSETS.WALL_BOSS_SEGMENT,
        label: 'PAYWALL CORE',
        accent: '#fde047',
        shadow: '#facc15'
      }
    ];

    return skins[Math.abs(e.variant || 0) % skins.length];
  }

  wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number = 2) {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        return;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = word;
    });

    if (currentLine) lines.push(currentLine);

    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/\.+$/, '')}...`;
      return clipped;
    }

    return lines;
  }

  drawBossWarningComms(ctx: CanvasRenderingContext2D) {
    if (!this.pendingBossType) return;

    const comms = this.getBossWarningComms(this.pendingBossType);
    const duration = this.bossWarningDuration || 150;
    const age = duration - this.bossWarningFrame;
    const alpha = Math.max(0, Math.min(1, age / 18, this.bossWarningFrame / 24));
    const panelWidth = Math.min(this.width - 24, 520);
    const panelHeight = this.width < 520 ? 104 : 92;
    const x = Math.max(12, (this.width - panelWidth) / 2);
    const y = Math.max(118, Math.min(this.height - panelHeight - 150, this.height * 0.18));
    const portraitSize = this.width < 520 ? 48 : 56;
    const portraitX = x + 14;
    const portraitY = y + (panelHeight - portraitSize) / 2;
    const textX = portraitX + portraitSize + 14;
    const textWidth = panelWidth - (textX - x) - 16;
    const pulse = 0.75 + Math.sin(this.frameCount * 0.22) * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(3, 7, 18, 0.86)';
    ctx.strokeStyle = comms.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = comms.color;
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 22);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = comms.color;
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillRect(x + 1, y + 1, 5, panelHeight - 2);
    ctx.globalAlpha = alpha;

    loadImage(comms.image);
    const portrait = getReadyImage(comms.image);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(portraitX, portraitY, portraitSize, portraitSize, 14);
    ctx.clip();
    if (portrait) {
      ctx.drawImage(portrait, portraitX, portraitY, portraitSize, portraitSize);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
    }
    ctx.restore();

    ctx.strokeStyle = comms.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(portraitX + 0.5, portraitY + 0.5, portraitSize - 1, portraitSize - 1);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Orbitron';
    ctx.fillText(comms.speaker.toUpperCase(), textX, y + 24);

    ctx.fillStyle = comms.color;
    ctx.font = 'bold 9px Orbitron';
    ctx.fillText(comms.role.toUpperCase(), textX, y + 39);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.96)';
    ctx.font = `${this.width < 520 ? 11 : 12}px monospace`;
    this.wrapCanvasText(ctx, comms.text, textWidth, this.width < 520 ? 3 : 2).forEach((line, index) => {
      ctx.fillText(line, textX, y + 59 + (index * 15));
    });

    ctx.fillStyle = comms.color;
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'right';
    ctx.fillText('BOSS SIGNAL', x + panelWidth - 14, y + panelHeight - 14);
    ctx.restore();
  }

  drawMainBossAlert(ctx: CanvasRenderingContext2D) {
    const duration = this.bossWarningDuration || 300;
    const age = duration - this.bossWarningFrame;
    const alertFrames = Math.min(MAIN_BOSS_ALERT_FRAMES, Math.max(1, duration - 60));
    const alpha = Math.max(0, Math.min(1, age / 10, (alertFrames - age) / 16));
    const flash = Math.sin(this.frameCount * 0.62) > 0 ? 1 : 0.32;
    const panelWidth = Math.min(this.width - 34, 560);
    const panelHeight = this.width < 520 ? 118 : 132;
    const x = (this.width - panelWidth) / 2;
    const y = Math.max(104, (this.height - panelHeight) * 0.3);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgba(127, 0, 0, ${0.14 + flash * 0.24})`;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = `rgba(239, 68, 68, ${0.12 + flash * 0.18})`;
    const stripeHeight = 18;
    for (let stripeY = 0; stripeY < this.height; stripeY += stripeHeight * 3) {
      ctx.fillRect(0, stripeY, this.width, stripeHeight);
    }

    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 34 * flash;
    ctx.fillStyle = `rgba(28, 3, 8, ${0.9 + flash * 0.06})`;
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.72 + flash * 0.28})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.font = `bold ${this.width < 520 ? 34 : 46}px Orbitron`;
    ctx.fillText('WARNING', this.width / 2, y + (this.width < 520 ? 50 : 60));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${this.width < 520 ? 13 : 17}px Orbitron`;
    ctx.fillText('GATEKEEPER SIGNAL DETECTED', this.width / 2, y + (this.width < 520 ? 82 : 96));
    ctx.fillStyle = `rgba(248, 113, 113, ${0.72 + flash * 0.28})`;
    ctx.font = `bold ${this.width < 520 ? 9 : 11}px Orbitron`;
    ctx.fillText('BOSS INBOUND', this.width / 2, y + panelHeight - 16);
    ctx.restore();
  }

  drawSubBossWarning(ctx: CanvasRenderingContext2D) {
    if (!this.pendingBossType || !this.isSubBossWarning()) return;

    const duration = this.bossWarningDuration || 90;
    const age = duration - this.bossWarningFrame;
    const alpha = Math.max(0, Math.min(1, age / 10, this.bossWarningFrame / 18));
    const flash = Math.sin(this.frameCount * 0.65) > 0 ? 1 : 0.38;
    const labels: Record<Exclude<BossWarningType, 'gatekeeper'>, string> = {
      mini1: 'BOTTLENECK SURGE',
      wall: 'PAYWALL FORMATION',
      asteroid: 'ASTEROID BELT'
    };
    const label = labels[this.pendingBossType as Exclude<BossWarningType, 'gatekeeper'>];
    const panelWidth = Math.min(this.width - 42, 360);
    const panelHeight = 74;
    const x = (this.width - panelWidth) / 2;
    const y = Math.max(118, this.height * 0.26);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#fb7185';
    ctx.shadowBlur = 24 * flash;
    ctx.fillStyle = `rgba(127, 29, 29, ${0.72 + (flash * 0.18)})`;
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.62 + (flash * 0.3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(254, 240, 138, ${0.16 + (flash * 0.2)})`;
    ctx.fillRect(x + 10, y + 11, panelWidth - 20, 6);
    ctx.fillRect(x + 10, y + panelHeight - 17, panelWidth - 20, 6);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 12px Orbitron';
    ctx.fillText('WARNING', this.width / 2, y + 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Orbitron';
    ctx.fillText(label, this.width / 2, y + 52);
    ctx.restore();
  }

  // ... draw methods remain the same ...
  // (Included to prevent file truncation issues, though only collision logic changed significantly)
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    this.drawBackgroundLayers(ctx);
    const starStride = this.performanceMode ? 2 : 1;
    for (let index = 0; index < this.stars.length; index += starStride) {
      this.stars[index].draw(ctx);
    }
    const backgroundSpriteLimit = this.bgEntities.length;
    for (let index = 0; index < backgroundSpriteLimit; index++) {
      this.bgEntities[index].draw(ctx);
    }

    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    this.entities.forEach(e => this.drawEntity(ctx, e));
    this.drawPlayerAfterimages(ctx);
    this.drawResearchBeam(ctx);
    this.drawGunPods(ctx);
    if (this.lives > 0 || this.deathSequenceFrames > 0) this.drawEntity(ctx, this.player);

    const invaders = this.invaderDrawBuffer;
    invaders.length = 0;
    for (const entity of this.entities) {
      if (!entity.markedForDeletion && entity.type === EntityType.ENEMY_INVADER) {
        invaders.push(entity);
      }
    }
    if (invaders.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        for (const inv of invaders) {
            if (inv.x < minX) minX = inv.x;
            if (inv.x + inv.width > maxX) maxX = inv.x + inv.width;
            if (inv.y < minY) minY = inv.y;
        }

        if (minY < Infinity) {
            const centerX = (minX + maxX) / 2;
            const topY = minY;

            ctx.save();
            ctx.font = 'bold 16px Orbitron';
            ctx.fillStyle = '#ff4444';
            ctx.textAlign = 'center';
            ctx.fillText("PAYWALL", centerX, topY - 35);

            const barWidth = 100;
            const barHeight = 8;
            const barY = topY - 20;

            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            ctx.fillRect(centerX - barWidth/2, barY, barWidth, barHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(centerX - barWidth/2, barY, barWidth, barHeight);

            const pct = Math.max(0, this.stats.bossHp / this.stats.bossMaxHp);

            ctx.fillStyle = pct > 0.5 ? '#00FF00' : '#FF0000';
            ctx.fillRect(centerX - barWidth/2 + 1, barY + 1, (barWidth-2) * pct, barHeight - 2);
            ctx.restore();
        }
    }

    ctx.restore();
    ctx.restore();

    if (this.inBossWarningSequence && this.pendingBossType === 'gatekeeper') {
      const warningAge = this.bossWarningDuration - this.bossWarningFrame;
      const alertFrames = Math.min(MAIN_BOSS_ALERT_FRAMES, Math.max(1, this.bossWarningDuration - 60));
      if (warningAge < alertFrames) {
        this.drawMainBossAlert(ctx);
      } else {
        this.drawBossWarningComms(ctx);
      }
    } else if (this.inBossWarningSequence) {
      this.drawSubBossWarning(ctx);
    }

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(248, 113, 113, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  drawPlayerAfterimages(ctx: CanvasRenderingContext2D) {
    const img = getReadyImage(this.playerShipUrl);
    if ((this.mobileProfile || this.performanceMode) && this.playerAfterimages.length > 3) {
      this.playerAfterimages.length = 3;
    }

    this.playerAfterimages.forEach((image) => {
      ctx.save();
      ctx.globalAlpha = image.alpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(image.x + image.width / 2, image.y + image.height / 2);
      ctx.rotate(image.rotation * 0.8);
      ctx.scale(1 + image.squash * 0.65, 1 - image.squash * 0.5);
      ctx.shadowBlur = this.getGlowBlur(18);
      ctx.shadowColor = '#67e8f9';
      if (img) {
        ctx.drawImage(img, -image.width / 2, -image.height / 2, image.width, image.height);
      } else {
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(-image.width / 2, -image.height / 2, image.width, image.height);
      }
      ctx.restore();
    });
  }

  drawHitFlash(ctx: CanvasRenderingContext2D, e: Entity) {
    if (e.type === EntityType.BOSS || e.type === EntityType.MINI_BOSS) return;
    if (e.flashFrames <= 0) return;

      const alpha = Math.min(0.52, e.flashFrames / 12);
      const flashSprite = this.getHitFlashSprite(e);
      const lean = this.shouldUseLeanEffects();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lean ? Math.min(0.36, alpha) : alpha;
      ctx.shadowBlur = lean ? 0 : this.getGlowBlur(16);
      ctx.shadowColor = e.formation === 'orbit' ? '#a7f3d0' : '#ffffff';

      if (flashSprite && !lean) {
        const drewSprite = this.drawSprite(ctx, flashSprite, e.width, e.height, {
          alpha: 0.92,
          filter: 'brightness(0) saturate(0) invert(1)',
          compositeOperation: 'lighter',
          spriteStyle: e.spriteStyle
        });

        if (drewSprite) {
          ctx.restore();
          return;
        }
      }

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (e.type === EntityType.ENEMY_SWARM) {
        ctx.ellipse(0, 0, e.width * 0.48, e.height * 0.42, 0, 0, Math.PI * 2);
      } else if (e.type === EntityType.ENEMY_BRICK || e.type === EntityType.SUPPLY_DROP) {
        ctx.roundRect(-e.width * 0.34, -e.height * 0.34, e.width * 0.68, e.height * 0.68, 8);
      } else {
        ctx.ellipse(0, 0, e.width * 0.42, e.height * 0.38, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
  }

  getPaywallBastionSprite(e: Entity) {
    const frames = e.spriteFrames?.length && e.spriteFrames.length >= 5
      ? e.spriteFrames
      : ASSETS.PAYWALL_BASTION_FRAMES;
    const healthRatio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    if (healthRatio <= 0.15) return frames[4];
    if (healthRatio <= 0.5) return frames[3];
    if (e.attackTimer > 0) return frames[2];
    return frames[Math.floor((this.frameCount + e.variant * 5) / 24) % 2];
  }

  getHitFlashSprite(e: Entity) {
    if (e.type === EntityType.ENEMY_INVADER) return this.getPaywallBastionSprite(e);
    if (e.spriteFrames?.length) return this.getAnimatedFrame(e.spriteFrames, e, 6);
    if (e.spriteUrl) return e.spriteUrl;
    if (e.type === EntityType.ENEMY_DRONE) {
      return this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
    }
    if (e.type === EntityType.ENEMY_SWARM) {
      return this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
    }
    if (e.type === EntityType.ENEMY_BRICK) {
      const frames = e.variant >= 900 ? ASSETS.ASTEROID_BELT_FRAMES : ASSETS.ENEMY_BRICK_FRAMES;
      return frames[e.variant % frames.length];
    }
    if (e.type === EntityType.SUPPLY_DROP) return ASSETS.SUPPLY_DROP_STANDARD;
    if (e.type === EntityType.ENEMY_JOURNAL) {
      return this.getAnimatedFrame(ASSETS.ENEMY_JOURNAL_FRAMES, e, 6);
    }
    if (e.type === EntityType.MINI_BOSS) {
      return ASSETS.MINI_BOSS;
    }
    if (e.type === EntityType.BOSS) {
      return ASSETS.FINAL_BOSS;
    }

    return null;
  }

  drawMiniBoss(ctx: CanvasRenderingContext2D, e: Entity) {
      this.drawHealthBar(ctx, e, 12);
      ctx.globalAlpha = 1.0;
      const bob = Math.sin(this.frameCount * 0.08) * 4;
      const drewSprite = this.drawSprite(ctx, e.spriteUrl || ASSETS.MINI_BOSS, e.width, e.height, {
        shadowColor: '#fb7185',
        shadowBlur: 22,
        yOffset: bob,
        spriteStyle: e.spriteStyle
      });

      if (!drewSprite) {
        ctx.save();
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.roundRect(-e.width / 2, -e.height / 2, e.width, e.height, 18);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.font = 'bold 12px Orbitron';
      ctx.fillStyle = '#fb7185';
      ctx.textAlign = 'center';
      ctx.fillText("BOTTLENECK DRONE", 0, -e.height/2 - 35);
      ctx.restore();
  }

  drawBoss(ctx: CanvasRenderingContext2D, e: Entity) {
      this.drawHealthBar(ctx, e, 12);
      ctx.globalAlpha = 1.0;
      const skin = this.getBossSkin(e);
      const pulse = e.isCharging ? 42 : 24;
      const bob = Math.sin(this.frameCount * 0.04) * 5;
      const drewSprite = this.drawSprite(ctx, e.spriteUrl || skin.sprite, e.width, e.height, {
        shadowColor: e.isCharging ? '#ffffff' : skin.shadow,
        shadowBlur: pulse,
        yOffset: bob,
        spriteStyle: e.spriteStyle
      });

      if (!drewSprite) {
        ctx.save();
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        ctx.restore();
      }

      const shieldCount = this.getBossShieldCount();
      if (shieldCount > 0) {
        const shieldPulse = 0.72 + Math.sin(this.frameCount * 0.11) * 0.18;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(167, 243, 208, ${shieldPulse})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = this.getGlowBlur(22);
        ctx.shadowColor = '#a7f3d0';
        ctx.beginPath();
        ctx.ellipse(0, 18, e.width * 0.62, e.height * 0.34, this.frameCount * 0.014, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 18, e.width * 0.74, e.height * 0.42, -this.frameCount * 0.01, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 11px Orbitron';
        ctx.fillStyle = '#a7f3d0';
        ctx.textAlign = 'center';
        ctx.fillText(`SHIELD x${shieldCount}`, 0, e.height / 2 + 18);
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = e.isCharging ? '#f8fafc' : skin.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 20, e.width * 0.34, 16, this.frameCount * 0.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 20, e.width * 0.24, 8, -this.frameCount * 0.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = 'bold 16px Orbitron';
      ctx.fillStyle = skin.accent;
      ctx.textAlign = 'center';
      ctx.fillText(skin.label, 0, -e.height/2 - 35);
      ctx.restore();
  }

  drawHealthBar(ctx: CanvasRenderingContext2D, e: Entity, height: number = 8) {
      ctx.save();
      const barWidth = e.width;
      const barHeight = height;
      const yOffset = -e.height/2 - 20;
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(-barWidth/2, yOffset, barWidth, barHeight);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-barWidth/2, yOffset, barWidth, barHeight);
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#00FF00' : '#FF0000';
      ctx.fillRect(-barWidth/2 + 1, yOffset + 1, (barWidth-2) * pct, barHeight - 2);
      ctx.restore();
  }

  drawLaser(ctx: CanvasRenderingContext2D, e: Entity) {
      const flicker = Math.random() * 10;
      const glowColor = e.color || '#ff0000';
      ctx.save();
      ctx.fillStyle = '#FFF';
      ctx.fillRect(e.x + 10, e.y, e.width - 20, e.height);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = glowColor;
      ctx.fillRect(e.x - flicker, e.y, e.width + flicker*2, e.height);
      ctx.globalAlpha = 1;
      for(let i=0; i<5; i++) {
         ctx.fillStyle = '#FFDD00';
         const px = e.x + Math.random() * e.width;
         const py = e.y + Math.random() * e.height;
         ctx.fillRect(px, py, 4, 20);
      }
      ctx.restore();
  }

  drawResearchBeam(ctx: CanvasRenderingContext2D) {
      const remaining = this.activePowerups.get(PowerupType.RESEARCH_BEAM) || 0;
      if (remaining <= 0) return;

      const centerX = this.player.x + this.player.width / 2;
      const startY = this.player.y + this.player.height * 0.16;
      const width = this.width < 520 ? 46 : 56;
      const pulse = 0.75 + Math.sin(this.frameCount * 0.28) * 0.25;
      const endFade = Math.min(1, remaining / 45);
      const gradient = ctx.createLinearGradient(centerX, 0, centerX, startY);
      gradient.addColorStop(0, 'rgba(34,211,238,0.03)');
      gradient.addColorStop(0.2, 'rgba(125,211,252,0.62)');
      gradient.addColorStop(0.5, 'rgba(168,85,247,0.72)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.96)');

      ctx.save();
      ctx.globalAlpha = endFade;
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 28 + pulse * 18;
      ctx.shadowColor = '#a855f7';

      ctx.fillStyle = `rgba(168,85,247,${0.18 + pulse * 0.12})`;
      ctx.fillRect(centerX - width * 0.82, 0, width * 1.64, startY);
      ctx.fillStyle = `rgba(34,211,238,${0.18 + pulse * 0.1})`;
      ctx.fillRect(centerX - width * 0.5, 0, width, startY);
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX - width * 0.22, 0, width * 0.44, startY);

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 + pulse * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - width * 0.34, 0);
      ctx.lineTo(centerX - width * 0.08, startY);
      ctx.moveTo(centerX + width * 0.34, 0);
      ctx.lineTo(centerX + width * 0.08, startY);
      ctx.stroke();

      for (let i = 0; i < 9; i++) {
        const y = (this.frameCount * (2.4 + i * 0.2) + i * 47) % Math.max(1, startY);
        const wobble = Math.sin((this.frameCount * 0.08) + i) * width * 0.35;
        ctx.fillStyle = i % 2 === 0 ? '#f0abfc' : '#67e8f9';
        ctx.fillRect(centerX + wobble, y, 3, 18);
      }

      ctx.restore();
  }

  drawGunPod(ctx: CanvasRenderingContext2D, size: number, isTriple: boolean, index: number) {
      const half = Math.round(size / 2);
      const accent = isTriple ? '#a78bfa' : '#facc15';
      const accentDark = isTriple ? '#6d28d9' : '#b45309';
      const isFiring = this.frameCount - this.lastShotFrame <= 4 && (this.frameCount + index) % 3 === 0;
      const hoverLength = Math.round(size * (0.16 + Math.sin((this.frameCount + index * 5) * 0.45) * 0.035));

      ctx.save();
      ctx.imageSmoothingEnabled = false;

      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = this.getGlowBlur(10);
      ctx.shadowColor = '#22d3ee';
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(-2, Math.round(size * 0.3), 4, hoverLength);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(-1, Math.round(size * 0.3) + hoverLength, 2, Math.max(2, Math.round(size * 0.08)));

      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = this.getGlowBlur(8);
      ctx.shadowColor = accent;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-half + 3, -4);
      ctx.lineTo(-half + 7, -9);
      ctx.lineTo(half - 7, -9);
      ctx.lineTo(half - 3, -4);
      ctx.lineTo(half - 3, 8);
      ctx.lineTo(half - 8, 12);
      ctx.lineTo(-half + 8, 12);
      ctx.lineTo(-half + 3, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#475569';
      ctx.fillRect(-half, -2, 5, 10);
      ctx.fillRect(half - 5, -2, 5, 10);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-half + 1, 0, 3, 5);
      ctx.fillRect(half - 4, 0, 3, 5);

      const barrelWidth = Math.max(6, Math.round(size * 0.22));
      ctx.fillStyle = '#111827';
      ctx.fillRect(-Math.floor(barrelWidth / 2), -half + 1, barrelWidth, half - 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-Math.floor(barrelWidth / 2) + 1, -half + 2, 2, half - 6);
      ctx.fillStyle = accentDark;
      ctx.fillRect(Math.ceil(barrelWidth / 2) - 2, -half + 3, 2, half - 7);

      ctx.fillStyle = accentDark;
      ctx.fillRect(-half + 7, -6, size - 14, 4);
      ctx.fillStyle = accent;
      ctx.fillRect(-half + 8, -5, size - 16, 2);
      ctx.fillRect(-5, 1, 10, 8);
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(-2, 3, 4, 4);

      if (isFiring) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = this.getGlowBlur(14);
        ctx.shadowColor = accent;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3, -half - 7, 6, 6);
        ctx.fillStyle = accent;
        ctx.fillRect(-1, -half - 12, 2, 5);
      }

      ctx.restore();
  }

  drawGunPods(ctx: CanvasRenderingContext2D) {
      const offsets = this.getGunPodOffsets();
      if (offsets.length === 0 || this.lives <= 0) return;

      const isTriple = this.activePowerups.has(PowerupType.TRIPLE_SHOT);
      const remaining = isTriple
        ? this.activePowerups.get(PowerupType.TRIPLE_SHOT) || 0
        : this.activePowerups.get(PowerupType.DOUBLE_SHOT) || 0;
      const entryAge = GAME_CONFIG.FOUNDER_SHOT_DURATION
        - Math.min(GAME_CONFIG.FOUNDER_SHOT_DURATION, remaining);
      const entry = easeOutCubic(clamp(entryAge / 42, 0, 1));
      const fade = Math.min(1, remaining / 36);
      const centerX = this.player.x + this.player.width / 2;
      const centerY = this.player.y + this.player.height / 2;
      const size = this.width < 520 ? 30 : 34;

      offsets.forEach((offset, index) => {
        const side = offset < 0 ? -1 : 1;
        const targetY = centerY + (this.width < 520 ? 10 : 6) + Math.sin((this.frameCount * 0.08) + index) * 4;
        const flyInY = targetY + (1 - entry) * 96;
        const flyInX = centerX + (offset * entry) + side * Math.sin(entry * Math.PI) * 14;

        ctx.save();
        ctx.globalAlpha = this.playerDrawAlpha * fade;
        ctx.translate(flyInX, flyInY);
        ctx.rotate(this.playerTilt * 0.55 + side * 0.08);
        this.drawGunPod(ctx, size, isTriple, index);
        ctx.restore();
      });
  }

  drawPlayerThrusters(ctx: CanvasRenderingContext2D, e: Entity) {
      const speed = Math.hypot(this.playerVel.x, this.playerVel.y);
      const speedLevel = Math.min(7, Math.max(0, Math.floor(this.stats.upgrades.speed || 0)));
      const palette = PLAYER_THRUSTER_PALETTES[speedLevel] ?? PLAYER_THRUSTER_PALETTES[0];
      const cinematicBoost = this.introFlightFrames > 0 || this.waveDepartureFrames > 0 ? 1.8 : 1;
      const deathFade = this.deathSequenceFrames > 0 ? 1 - (this.deathSequenceFrames / this.deathSequenceDuration) : 0;
      const upgradeBoost = 1 + speedLevel * 0.055;
      const boost = Math.max(cinematicBoost, 0.72 + Math.min(0.9, speed / 6)) * upgradeBoost * (1 - deathFade * 0.7);
      const flameLength = e.height * (0.24 + boost * 0.16) * (0.78 + Math.sin(this.frameCount * 0.55) * 0.18);
      const flameWidth = e.width * 0.075;
      const nozzleY = e.height * 0.28;
      const nozzleSpread = e.width * 0.16;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      [-1, 1].forEach((side) => {
        const x = side * nozzleSpread;
        const gradient = ctx.createLinearGradient(x, nozzleY, x, nozzleY + flameLength);
        gradient.addColorStop(0, palette.core);
        gradient.addColorStop(0.24, palette.mid);
        gradient.addColorStop(0.62, palette.edge);
        gradient.addColorStop(1, palette.fade);

        ctx.shadowBlur = this.getGlowBlur(24 * boost);
        ctx.shadowColor = palette.glow;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth * 0.35, nozzleY + flameLength);
        ctx.lineTo(x - flameWidth * 0.35, nozzleY + flameLength);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        ctx.beginPath();
        ctx.arc(x, nozzleY + flameLength * 0.72, Math.max(2, flameWidth * 0.33), 0, Math.PI * 2);
        ctx.fill();
      });

      if (cinematicBoost > 1.1) {
        ctx.strokeStyle = palette.streak;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * e.width * 0.12;
          ctx.beginPath();
          ctx.moveTo(x, nozzleY + 4);
          ctx.lineTo(x * 0.36, nozzleY + flameLength + 44 + (i % 2) * 22);
          ctx.stroke();
        }
      }

      ctx.restore();
  }

  drawPlayerThrusterUpgradeOverlay(ctx: CanvasRenderingContext2D, e: Entity) {
      const speedLevel = Math.min(7, Math.max(0, Math.floor(this.stats.upgrades.speed || 0)));
      if (speedLevel <= 0) return;

      const palette = PLAYER_THRUSTER_PALETTES[speedLevel] ?? PLAYER_THRUSTER_PALETTES[0];
      const nozzleY = e.height * 0.26;
      const nozzleSpread = e.width * 0.16;
      const flameLength = e.height * (0.32 + speedLevel * 0.018)
        * (0.88 + Math.sin(this.frameCount * 0.58) * 0.12);
      const flameWidth = e.width * (0.072 + speedLevel * 0.003);

      ctx.save();
      [-1, 1].forEach((side) => {
        const x = side * nozzleSpread;
        const gradient = ctx.createLinearGradient(x, nozzleY, x, nozzleY + flameLength);
        gradient.addColorStop(0, palette.core);
        gradient.addColorStop(0.22, palette.mid);
        gradient.addColorStop(0.72, palette.edge);
        gradient.addColorStop(1, palette.fade);

        ctx.shadowBlur = this.getGlowBlur(12 + speedLevel * 2.5);
        ctx.shadowColor = palette.glow;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth * 0.32, nozzleY + flameLength);
        ctx.lineTo(x - flameWidth * 0.32, nozzleY + flameLength);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
  }

  drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
    if (e.isBeam) {
        this.drawLaser(ctx, e);
        return;
    }
    ctx.save();
    ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
    ctx.globalAlpha = 1.0;

    if (e.type === EntityType.PLAYER) {
       const img = imageCache[this.playerShipUrl];
       const squash = clamp(this.playerSquash, -0.24, 0.24);
       ctx.globalAlpha = this.playerDrawAlpha;
       ctx.scale(this.playerDrawScale, this.playerDrawScale);
       ctx.rotate(this.playerTilt);
       ctx.scale(1 + squash * 0.78, 1 - squash * 0.58);
       this.drawPlayerThrusters(ctx, e);
       const bioBeamActive = this.isBioBeamFiring();
       const bioBeamLevel = Math.min(this.stats.upgrades.fireRate || 0, 7);
       const bioBeamFrames = getPlayerWeaponFrames('bio-laser', bioBeamLevel);
       if (bioBeamActive && this.bioBeamCanvasVisualStartFrame < 0) {
         this.bioBeamCanvasVisualStartFrame = this.frameCount;
       } else if (!bioBeamActive) {
         this.bioBeamCanvasVisualStartFrame = -1;
       }
       const bioBeamLaunchFrame = getPlayerWeaponLaunchFrameIndex(
         this.frameCount - Math.max(0, this.bioBeamCanvasVisualStartFrame),
         bioBeamFrames.length
       );
       const bioBeamLaunchProgress = (bioBeamLaunchFrame + 1) / bioBeamFrames.length;
       if (bioBeamActive) {
         const beamWidth = (5 + bioBeamLevel * 1.55) * bioBeamLaunchProgress;
         const beamTop = -(e.y + e.height / 2);
         const beamEnd = -e.height * 0.3;
         ctx.save();
         ctx.globalCompositeOperation = 'lighter';
         ctx.fillStyle = bioBeamLevel > 0 ? 'rgba(56,189,248,.18)' : 'rgba(101,245,154,.18)';
         ctx.fillRect(-beamWidth * 1.8, beamTop, beamWidth * 3.6, beamEnd - beamTop);
         ctx.fillStyle = bioBeamLevel > 0 ? '#38bdf8' : '#65f59a';
         ctx.fillRect(-beamWidth * 0.7, beamTop, beamWidth * 1.4, beamEnd - beamTop);
         ctx.fillStyle = '#ffffff';
         ctx.fillRect(-Math.max(1.5, beamWidth * 0.2), beamTop, Math.max(3, beamWidth * 0.4), beamEnd - beamTop);
         ctx.restore();
       }

       if (this.activePowerups.has(PowerupType.MAGNET)) {
           const pulse = Math.sin(this.frameCount * 0.1) * 5;
           ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.arc(0, 0, e.width/2 + 10 + pulse, 0, Math.PI * 2);
           ctx.stroke();
           ctx.beginPath();
           ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
           ctx.arc(0, 0, e.width/2 + pulse, 0, Math.PI * 2);
           ctx.stroke();
       }
       if (this.activePowerups.has(PowerupType.SHIELD) || this.invincibleTimer > 60) {
         ctx.save();
         ctx.rotate(this.frameCount * 0.05);
         ctx.strokeStyle = '#00C851';
         ctx.lineWidth = 3;
         ctx.setLineDash([15, 10]);
         ctx.beginPath();
         ctx.arc(0, 0, e.width/2 + 15, 0, Math.PI * 2);
         ctx.stroke();
         ctx.restore();
       }
       if (this.activePowerups.has(PowerupType.RESEARCH_BEAM)) {
         const pulse = Math.sin(this.frameCount * 0.24) * 4;
         ctx.save();
         ctx.strokeStyle = 'rgba(168, 85, 247, 0.75)';
         ctx.lineWidth = 3;
         ctx.shadowBlur = this.getGlowBlur(18);
         ctx.shadowColor = '#a855f7';
         ctx.beginPath();
         ctx.arc(0, 0, e.width / 2 + 18 + pulse, 0, Math.PI * 2);
         ctx.stroke();
         ctx.strokeStyle = 'rgba(34, 211, 238, 0.48)';
         ctx.beginPath();
         ctx.arc(0, 0, e.width / 2 + 8 - pulse * 0.4, 0, Math.PI * 2);
         ctx.stroke();
         ctx.restore();
       }
       if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.drawImage(img, -e.width / 2, -e.height / 2, e.width, e.height);
          ctx.restore();
       } else {
         ctx.fillStyle = '#6c63ff';
         ctx.fillRect(-20, -20, 40, 40);
       }
       if (bioBeamActive) {
         const emitter = getReadyImage(bioBeamFrames[bioBeamLaunchFrame]);
         if (emitter) {
           const emitterWidth = 18 + bioBeamLevel * 3.4;
           const emitterHeight = 42 + bioBeamLevel * 6.2;
           ctx.save();
           ctx.imageSmoothingEnabled = false;
           ctx.drawImage(emitter, -emitterWidth / 2, -e.height * 0.36 - emitterHeight, emitterWidth, emitterHeight);
           ctx.restore();
         }
       }
       this.drawPlayerThrusterUpgradeOverlay(ctx, e);

    } else if (e.type === EntityType.ENEMY_DRONE) {
        const frame = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 6)
          : e.spriteUrl || this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
        const rotation = e.formation === 'spiral' ? Math.PI / 2 + e.angle : 0;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#38bdf8',
            shadowBlur: 10,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_SWARM) {
        const frame = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 5)
          : e.spriteUrl || this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
        const rotation = Math.sin((this.frameCount + e.variant) * 0.08) * 0.12;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: e.formation === 'orbit' ? '#a7f3d0' : '#34d399',
            shadowBlur: e.formation === 'orbit' ? 14 : 8,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.SUPPLY_DROP) {
        const frame = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 8)
          : e.spriteUrl || ASSETS.SUPPLY_DROP_STANDARD;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation: Math.sin((this.frameCount + e.variant) * 0.025) * 0.035,
            shadowColor: e.supplyDropKind === 'golden' ? '#fde047' : '#22d3ee',
            shadowBlur: 12,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_BRICK) {
        const isAsteroid = e.variant >= 900;
        const fallbackFrames = isAsteroid ? ASSETS.ASTEROID_BELT_FRAMES : ASSETS.ENEMY_BRICK_FRAMES;
        const frame = e.spriteFrames?.length
          ? e.spriteFrames[e.variant % e.spriteFrames.length]
          : e.spriteUrl || fallbackFrames[e.variant % fallbackFrames.length];
        const rotation = isAsteroid ? 0 : Math.sin((this.frameCount + e.variant) * 0.03) * 0.2;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#f59e0b',
            shadowBlur: 6,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_JOURNAL) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.04) * 0.12;
        const journalSprite = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 6)
          : e.spriteUrl || this.getAnimatedFrame(ASSETS.ENEMY_JOURNAL_FRAMES, e, 6);
        const drewSprite = this.drawSprite(ctx, journalSprite, e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 14,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.POWERUP) {
        const type = e.text as PowerupType;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#67e8f9';

        let frames: readonly string[] = ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES;
        if (type === PowerupType.MAGNET) frames = ASSETS.POWERUP_MAGNET_FRAMES;
        if (type === PowerupType.SHIELD) frames = ASSETS.POWERUP_SHIELD_FRAMES;
        if (type === PowerupType.EXTRA_LIFE) frames = ['/game-art/powerups/extra-life.png'];
        if (type === PowerupType.RESEARCH_BEAM) frames = ASSETS.POWERUP_RESEARCH_BEAM_FRAMES;
        if (type === PowerupType.MAX_SHOT) frames = [ASSETS.POWERUP_MAX_SHOT];
        const frameIndex = Math.floor((this.frameCount + e.variant) / 8) % frames.length;
        const imgUrl = frames[frameIndex];

        const img = loadImage(imgUrl);
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, -23, -23, 46, 46);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(-23, -23, 46, 46);
        }
        ctx.shadowBlur = 0;

    } else if (e.type === EntityType.MINI_BOSS) {
        this.drawMiniBoss(ctx, e);
    } else if (e.type === EntityType.BOSS) {
        this.drawBoss(ctx, e);
    } else if (e.type === EntityType.ENEMY_INVADER) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.05) * 0.08;
        const drewSprite = this.drawSprite(ctx, this.getPaywallBastionSprite(e), e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 8,
            spriteStyle: e.spriteStyle
        });
        if (drewSprite) {
            this.drawHitFlash(ctx, e);
            ctx.restore();
            return;
        }
        // DRAW AS BRICK EMOJI
        // INCREASE FONT SIZE FOR BIGGER BRICKS
        ctx.font = `${e.height}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#B22222'; // fallback color if text fails
        ctx.fillText("🧱", 0, 2);

    } else if (e.type === EntityType.COIN) {
        const frameIndex = Math.floor((this.frameCount + e.variant) / 5) % ASSETS.RSC_TOKEN_FLIP_FRAMES.length;
        const img = imageCache[ASSETS.RSC_TOKEN_FLIP_FRAMES[frameIndex]];
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.shadowBlur = this.getGlowBlur(10);
            ctx.shadowColor = '#FFD700';
            ctx.drawImage(img, -e.width/2, -e.height/2, e.width, e.height);
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("RSC", 0, 0);
            ctx.restore();
        }

    } else if (e.type === EntityType.BOMB) {
        const pulse = 0.75 + Math.sin((this.frameCount + e.variant) * 0.18) * 0.25;
        const drewBombSprite = this.drawSprite(ctx, this.bombSpriteUrl, e.width * 1.18, e.height * 1.18, {
          rotation: Math.sin((this.frameCount + e.variant) * 0.045) * 0.12,
          shadowColor: '#a3e635',
          shadowBlur: 16 + pulse * 8
        });

        if (!drewBombSprite) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowBlur = this.getGlowBlur(18 + pulse * 10);
          ctx.shadowColor = '#facc15';

          const body = ctx.createRadialGradient(-5, -8, 3, 0, 0, 22);
          body.addColorStop(0, '#fff7ad');
          body.addColorStop(0.26, '#facc15');
          body.addColorStop(0.64, '#f97316');
          body.addColorStop(1, '#7c2d12');

          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.arc(0, 4, 17, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fde68a';
          ctx.fillRect(-8, -18, 16, 7);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(-2, -24, 8, 8);
          ctx.strokeStyle = '#67e8f9';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(4, -21);
          ctx.quadraticCurveTo(20, -28, 25, -12);
          ctx.stroke();

          if (this.frameCount % 12 < 6) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(24, -15, 5, 5);
            ctx.fillRect(29, -9, 3, 3);
          }

          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 4, 18, 0.18, Math.PI * 1.28);
          ctx.stroke();
          ctx.restore();
        }

    } else if (e.type === EntityType.PARTICLE) {
        ctx.globalAlpha = Math.max(0, Math.min(1, e.life / Math.max(1, e.maxLife)));
        ctx.shadowBlur = this.getGlowBlur(Math.max(0, e.width * 1.6));
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.color;
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
    } else if (e.type === EntityType.EFFECT) {
        const eff = e as VisualEffect;
        if (eff.effectType === 'sprite' && eff.spriteFrames?.length) {
            const age = Math.max(0, eff.maxLife - eff.life);
            const frameIndex = Math.min(eff.spriteFrames.length - 1, Math.floor(age / 6));
            const image = loadImage(eff.spriteFrames[frameIndex]);
            if (image.complete && image.naturalWidth > 0) {
              ctx.globalAlpha = Math.min(1, eff.life / 8);
              ctx.drawImage(image, -eff.width / 2, -eff.height / 2, eff.width, eff.height);
            }
        } else if (eff.effectType === 'text') {
            ctx.font = `bold ${eff.fontSize}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.globalAlpha = eff.life / eff.maxLife;

            if (eff.text?.startsWith("WAVE")) {
                const jitterX = (Math.random() - 0.5) * 4;
                const jitterY = (Math.random() - 0.5) * 4;
                ctx.shadowBlur = this.getGlowBlur(20);
                ctx.shadowColor = '#00FFFF';
                ctx.fillStyle = this.frameCount % 10 < 5 ? '#FFF' : '#00FFFF';
                ctx.fillText(eff.text || "", jitterX, jitterY);
                if (Math.random() > 0.7) {
                    ctx.strokeStyle = '#FFF';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-50, 0);
                    ctx.lineTo(50, (Math.random()-0.5)*20);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            } else if (eff.text?.startsWith("WARNING")) {
                 const pulse = Math.abs(Math.sin(this.frameCount * 0.2)) * 0.5 + 0.5;
                 ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
                 ctx.shadowBlur = this.getGlowBlur(10);
                 ctx.shadowColor = '#ff0000';
                 ctx.fillText(eff.text || "", 0, 0);
                 ctx.shadowBlur = 0;
            } else if (eff.text?.startsWith("GATEKEEPER")) {
                 ctx.fillStyle = '#ff4444';
                 ctx.font = 'bold 20px Orbitron';
                 ctx.fillText(eff.text || "", 0, 0);
            } else {
                ctx.fillStyle = eff.color;
                ctx.fillText(eff.text || "", 0, 0);
            }
            ctx.globalAlpha = 1;
        } else if (eff.effectType === 'ring') {
            const progress = 1 - (eff.life / eff.maxLife);
            ctx.strokeStyle = eff.color;
            ctx.lineWidth = 3 * (1-progress);
            ctx.globalAlpha = 1 - progress;
            ctx.beginPath();
            ctx.arc(0, 0, 10 + (progress * 80), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    } else if (e.type === EntityType.MISSILE) {
        // Draw Missile
        const isMaxLevel = e.color === '#ff0055';

        ctx.save();
        if (isMaxLevel) {
             // COOL EFFECT: Pulsing aura
             const pulse = 10 + Math.sin(this.frameCount * 0.5) * 5;
             ctx.shadowBlur = this.getGlowBlur(pulse);
             ctx.shadowColor = '#ff0055';
             ctx.fillStyle = '#ff0055';
        } else {
             ctx.fillStyle = '#00ffff';
             ctx.shadowBlur = this.getGlowBlur(10);
             ctx.shadowColor = '#00ffff';
        }

        ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI/2);

        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();

        // Engine glow
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 5, isMaxLevel ? 4 : 2, 0, Math.PI*2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();

    } else if (e.type === EntityType.PROJECTILE) {
        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.filter = "none";
        ctx.globalCompositeOperation = e.isPlayerShot ? 'source-over' : 'lighter';
        const leanShot = e.isPlayerShot && this.shouldUseLeanEffects();
        const isIonShot = e.isPlayerShot && e.weaponKind === 'ion';
        const isNovaShot = e.isPlayerShot && e.weaponKind === 'nova';
        const isSingularityShot = e.isPlayerShot && e.weaponKind === 'singularity';
        const isBioLaserShot = e.isPlayerShot && e.weaponKind === 'bio-laser';
        const isEthShardShot = e.isPlayerShot && e.weaponKind === 'eth-shard';
        const isBtcHashShot = e.isPlayerShot && e.weaponKind === 'btc-hash';
        ctx.shadowBlur = e.isPlayerShot
          ? 0
          : this.getGlowBlur(leanShot ? 5 : 12);
        ctx.shadowColor = e.color || (e.isPlayerShot ? '#67e8f9' : '#fb7185');

        if (e.text) {
           ctx.font = '24px serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText(e.text, 0, 0);
        } else if (e.isPlayerShot) {
          const weaponFrames = getPlayerWeaponFrames(e.weaponKind, e.weaponVisualLevel);
          const launchFrame = getPlayerWeaponLaunchFrameIndex(
            this.frameCount - e.weaponVisualStartFrame,
            weaponFrames.length
          );
          const weaponFrame = getReadyImage(weaponFrames[launchFrame]);
          if (weaponFrame) {
            const visualWidth = Math.max(34, (e.projectileUnitWidth || e.width) * 2.05);
            const visualHeight = Math.max(48, (e.projectileUnitHeight || e.height) * 1.2);
            ctx.imageSmoothingEnabled = false;
            ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI / 2);
            if (e.maxShotVisualPattern?.length) {
              const bundleAge = Math.max(0, this.frameCount - e.weaponVisualStartFrame);
              const projectileSpeed = Math.max(1, Math.hypot(e.vx, e.vy));
              const remainingVisualRounds = Math.min(
                e.maxShotVisualPattern.length,
                Math.max(0, e.representedRoundsRemaining)
              );
              for (let roundIndex = 0; roundIndex < remainingVisualRounds; roundIndex++) {
                const round = e.maxShotVisualPattern[roundIndex];
                const launchDelayFrames = Math.max(0, round.launchDelayFrames || 0);
                if (bundleAge < launchDelayFrames) continue;
                const roundAge = Math.max(0, bundleAge - launchDelayFrames);
                const visualTravel = Math.min(100, roundAge * projectileSpeed);
                ctx.save();
                ctx.translate(
                  round.offsetX + Math.sin(round.angleOffset) * visualTravel,
                  launchDelayFrames * projectileSpeed
                );
                ctx.rotate(round.angleOffset);
                ctx.drawImage(weaponFrame, -visualWidth / 2, -visualHeight / 2, visualWidth, visualHeight);
                ctx.restore();
              }
            } else {
              ctx.drawImage(weaponFrame, -visualWidth / 2, -visualHeight / 2, visualWidth, visualHeight);
            }
          } else if (isBtcHashShot) {
            const pulse = 0.84 + Math.sin((this.frameCount + e.variant) * 0.42) * 0.16;
            ctx.fillStyle = `rgba(245,158,11,${0.3 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.9, e.height * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#fff7d6';
            ctx.lineWidth = leanShot ? 1.2 : 1.8;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.58);
            ctx.lineTo(e.width * 0.62, -e.height * 0.12);
            ctx.lineTo(e.width * 0.48, e.height * 0.5);
            ctx.lineTo(0, e.height * 0.66);
            ctx.lineTo(-e.width * 0.48, e.height * 0.5);
            ctx.lineTo(-e.width * 0.62, -e.height * 0.12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#78350f';
            ctx.fillRect(-e.width * 0.18, -e.height * 0.34, e.width * 0.12, e.height * 0.68);
            ctx.fillRect(e.width * 0.08, -e.height * 0.34, e.width * 0.12, e.height * 0.68);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-e.width * 0.28, -e.height * 0.12, e.width * 0.56, e.height * 0.1);
            ctx.fillRect(-e.width * 0.28, e.height * 0.14, e.width * 0.56, e.height * 0.1);
          } else if (isEthShardShot) {
            const pulse = 0.82 + Math.sin((this.frameCount + e.variant) * 0.5) * 0.18;
            ctx.fillStyle = `rgba(139,92,246,${0.28 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.86, e.height * 0.54, 0, 0, Math.PI * 2);
            ctx.fill();

            const shard = ctx.createLinearGradient(0, -e.height * 0.64, 0, e.height * 0.62);
            shard.addColorStop(0, 'rgba(255,255,255,0)');
            shard.addColorStop(0.14, '#ffffff');
            shard.addColorStop(0.38, '#c4b5fd');
            shard.addColorStop(0.7, '#7c3aed');
            shard.addColorStop(1, 'rgba(76,29,149,0)');
            ctx.fillStyle = shard;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.68);
            ctx.lineTo(e.width * 0.62, 0);
            ctx.lineTo(0, e.height * 0.64);
            ctx.lineTo(-e.width * 0.62, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = leanShot ? 1.2 : 1.8;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.48);
            ctx.lineTo(e.width * 0.14, 0);
            ctx.lineTo(0, e.height * 0.38);
            ctx.lineTo(-e.width * 0.14, 0);
            ctx.closePath();
            ctx.fill();
          } else if (isBioLaserShot) {
            const pulse = 0.78 + Math.sin((this.frameCount + e.variant) * 0.46) * 0.22;
            const outerGlow = ctx.createLinearGradient(0, -e.height * 0.65, 0, e.height * 0.6);
            outerGlow.addColorStop(0, 'rgba(255,255,255,0)');
            outerGlow.addColorStop(0.16, `rgba(214,255,177,${0.78 * pulse})`);
            outerGlow.addColorStop(0.5, '#b7ff68');
            outerGlow.addColorStop(0.84, `rgba(34,197,94,${0.72 * pulse})`);
            outerGlow.addColorStop(1, 'rgba(22,163,74,0)');
            ctx.fillStyle = outerGlow;
            ctx.beginPath();
            ctx.roundRect(-e.width * 0.48, -e.height * 0.64, e.width * 0.96, e.height * 1.24, Math.max(2, e.width * 0.38));
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(-Math.max(1, e.width * 0.12), -e.height * 0.55, Math.max(2, e.width * 0.24), e.height, Math.max(1, e.width * 0.12));
            ctx.fill();
            ctx.strokeStyle = 'rgba(190,242,100,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
          } else if (isSingularityShot) {
            const pulse = 0.82 + Math.sin((this.frameCount + e.variant) * 0.5) * 0.18;
            ctx.fillStyle = `rgba(167,139,250,${0.3 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.88, e.height * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = leanShot ? 1.4 : 2.2;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.7, e.height * 0.28, 0, 0, Math.PI * 2);
            ctx.stroke();

            const singularityCore = ctx.createLinearGradient(0, -e.height * 0.7, 0, e.height * 0.64);
            singularityCore.addColorStop(0, 'rgba(255,255,255,0)');
            singularityCore.addColorStop(0.16, '#ffffff');
            singularityCore.addColorStop(0.42, '#67e8f9');
            singularityCore.addColorStop(0.68, '#a78bfa');
            singularityCore.addColorStop(1, 'rgba(217,70,239,0)');
            ctx.fillStyle = singularityCore;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.72);
            ctx.lineTo(e.width * 0.7, -e.height * 0.04);
            ctx.lineTo(0, e.height * 0.66);
            ctx.lineTo(-e.width * 0.7, -e.height * 0.04);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(3, e.width * 0.13), 0, Math.PI * 2);
            ctx.fill();
          } else if (isNovaShot) {
            const pulse = 0.84 + Math.sin((this.frameCount + e.variant) * 0.44) * 0.16;
            ctx.fillStyle = `rgba(250,204,21,${0.24 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.82, e.height * 0.54, 0, 0, Math.PI * 2);
            ctx.fill();

            const novaCore = ctx.createLinearGradient(0, -e.height * 0.68, 0, e.height * 0.62);
            novaCore.addColorStop(0, 'rgba(255,255,255,0)');
            novaCore.addColorStop(0.18, '#ffffff');
            novaCore.addColorStop(0.46, '#67e8f9');
            novaCore.addColorStop(0.72, '#f0abfc');
            novaCore.addColorStop(1, 'rgba(250,204,21,0)');
            ctx.fillStyle = novaCore;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.7);
            ctx.lineTo(e.width * 0.62, -e.height * 0.08);
            ctx.lineTo(e.width * 0.24, e.height * 0.62);
            ctx.lineTo(-e.width * 0.24, e.height * 0.62);
            ctx.lineTo(-e.width * 0.62, -e.height * 0.08);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = leanShot ? 1.5 : 2.4;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-2, -e.height * 0.48, 4, e.height * 0.88);
          } else if (isIonShot) {
            const pulse = 0.82 + Math.sin((this.frameCount + e.variant) * 0.38) * 0.18;
            ctx.fillStyle = `rgba(240,171,252,${0.32 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.7, e.height * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(-e.width * 0.15, -e.height * 0.58, e.width * 0.3, e.height * 1.08, 5);
            ctx.fill();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = leanShot ? 1.5 : 2;
            ctx.beginPath();
            ctx.moveTo(-e.width * 0.45, e.height * 0.38);
            ctx.lineTo(0, -e.height * 0.62);
            ctx.lineTo(e.width * 0.45, e.height * 0.38);
            ctx.stroke();
          } else if (leanShot) {
            ctx.fillStyle = e.color || '#67e8f9';
            ctx.beginPath();
            ctx.roundRect(-e.width * 0.32, -e.height * 0.58, e.width * 0.64, e.height * 1.08, 4);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.fillRect(-1, -e.height * 0.48, 2, e.height * 0.72);
          } else {
            const bolt = ctx.createLinearGradient(0, -e.height / 2, 0, e.height / 2);
            bolt.addColorStop(0, 'rgba(255,255,255,0)');
            bolt.addColorStop(0.18, '#ffffff');
            bolt.addColorStop(0.45, e.color);
            bolt.addColorStop(1, 'rgba(34,211,238,0)');
            ctx.fillStyle = bolt;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.62);
            ctx.lineTo(e.width * 0.54, -e.height * 0.06);
            ctx.lineTo(e.width * 0.2, e.height * 0.58);
            ctx.lineTo(-e.width * 0.2, e.height * 0.58);
            ctx.lineTo(-e.width * 0.54, -e.height * 0.06);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.72)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.58);
            ctx.lineTo(0, e.height * 0.42);
            ctx.stroke();
          }
        } else {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(0, 0, e.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.72)';
            ctx.beginPath();
            ctx.arc(-e.width * 0.12, -e.height * 0.12, Math.max(1.5, e.width * 0.16), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    } else {
        ctx.fillStyle = e.color;
        if (e.text) {
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.text, 0, 0);
        } else {
          ctx.fillRect(-e.width/2, -e.height/2, e.width, e.height);
        }
    }

    if (this.isEnemyTarget(e)) {
      this.drawHitFlash(ctx, e);
    }

    ctx.restore();
  }
}
