import 'pixi.js/unsafe-eval';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture
} from 'pixi.js';
import { ASSETS, GAME_CONFIG } from '../../constants';
import { EntityType, PowerupType } from '../../types';
import { BOSS_CANNON_SCALE, CROWNCLAW_ARM_SCALE, Entity, GameEngine, VisualEffect } from '../gameLogic';
import type { BossComponentState, BossPartId, GameRuntimeState, StageTakeoffPresentation } from '../gameLogic';
import type { BossRigId } from '../../game-config/types';
import {
  PLAYER_SHIP_HARD_BANK_SWEEP_RATIO,
  PLAYER_SHIP_STEERING_FRAME_URLS,
  PLAYER_SHIP_TOUCH_SPEED_SCALE,
  applyPlayerSteeringDeadzone,
  getPlayerSteeringBlendMs,
  getPlayerShipMotionByAssetUrl,
  selectPlayerSteeringState,
  type PlayerSteeringState
} from '../playerShipMotion';
import {
  PLAYER_WEAPON_FRAME_URLS,
  getPlayerWeaponFrames,
  getPlayerWeaponLaunchFrameIndex
} from '../playerWeaponVisuals';
import { RESEARCH_IMPACT_FRAME_URLS, SHIP_ABILITY_FRAME_URLS } from '../shipAbilityService';
import { MINI_SHIP_CATALOG } from '../squadProgression';
import { ArcadeEffectPool } from './ArcadeEffectPool';
import {
  PIXI_ENVIRONMENT_TEXTURE_URLS,
  PixiEnvironment,
  type PixiEnvironmentWindow
} from './PixiEnvironment';
import { PixiTextureBank } from './PixiTextureBank';
import {
  createSoftRadialLight,
  hideSoftRadialLight,
  showSoftRadialLight
} from './SoftRadialLight';
import {
  sampleSegmentedCrescentPose,
  type SegmentedCrescentActionPresentation
} from './boss-rigs/SegmentedCrescentPose';
import {
  sampleArticulatedPincerPose,
  type ArticulatedPincerActionPresentation
} from './boss-rigs/ArticulatedPincerPose';
import {
  sampleTransformingOrbiterPose,
  type TransformingOrbiterActionPresentation
} from './boss-rigs/TransformingOrbiterPose';
import {
  sampleRotatingEmitterCorePose,
  type RotatingEmitterCoreActionPresentation
} from './boss-rigs/RotatingEmitterCorePose';
import { sampleAssembledBossMotion } from './boss-rigs/AssembledBossMotion';
import { sampleAssembledBossAccentPose } from './boss-rigs/AssembledBossAccentPose';
import { sampleWingbeatHoverPose } from './boss-rigs/WingbeatHoverPose';
import {
  ROTATING_EMITTER_CORE_DESIGN_SIZE as ROTATING_EMITTER_CORE_AUTHORED_SIZE,
  sampleRotatingEmitterRelayPositions,
  sampleRotatingEmitterSocketPositionsForBounds
} from '../gameplay/bosses/RotatingEmitterCoreRuntime';
import {
  BOSS_SIGNIFICANT_REACTION_FRAMES,
  sampleBossWeaponSockets
} from '../gameplay/bosses/BossWeaponSocketRuntime';
import {
  ARTICULATED_PINCER_PART_IDS,
  ROTATING_EMITTER_CORE_PART_IDS,
  SEGMENTED_CRESCENT_PART_IDS,
  TRANSFORMING_ORBITER_PART_IDS,
  getPreviewBossProjectilePartIds,
  getPreviewBossRigPartIds,
  type ArticulatedPincerPartId,
  type PreviewBossAssembledMotionProfile,
  type PreviewBossArtwork,
  type PreviewBossProjectileAnimation,
  type PreviewBossProjectileAnimationProfile,
  type PreviewBossRigKind,
  type PreviewBossRigPartId,
  type RotatingEmitterCorePartId,
  type SegmentedCrescentPartId,
  type TransformingOrbiterPartId
} from './boss-rigs/PreviewBossRigContracts';
import {
  PREVIEW_BOSS_VFX_FRAME_IDS,
  type PreviewBossVfxFrameId
} from './boss-rigs/PreviewBossVfxContracts';
import {
  resolveModularBossRigHierarchy,
  type ModularBossRigAtlas,
  type ModularBossDestructionFragment,
  type ModularBossDestructionSequence,
  type ModularBossRigRegistration,
  type ResolvedModularBossRigHierarchy
} from './boss-rigs/ModularHierarchyRig';
import { sampleModularBossDestructionFragment } from './boss-rigs/ModularBossDestructionRuntime';
import {
  resolvePreviewBossReferenceComparisonLayout
} from './boss-rigs/PreviewBossReferenceComparison';
import {
  DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON,
  DEFAULT_PREVIEW_DEBUG_OVERLAYS,
  normalizePreviewBossReferenceComparison,
  normalizePreviewDebugOverlays,
  resolvePreviewSafeRegionGuide,
  type PreviewBossReferenceComparisonState,
  type PreviewDebugOverlayState
} from '../gameplay/previewSession';
import {
  resolveBossGapRoute,
  resolveBossGapRouteDirection,
  resolveBossWeaveWallLayout
} from '../gameplay/bosses/BossPatternRuntime';

export type {
  ArticulatedPincerPartId,
  PreviewBossArtwork,
  PreviewBossAtlasPartId,
  PreviewBossProjectileAnimation,
  PreviewBossProjectileAnimationProfile,
  PreviewBossRigKind,
  PreviewBossRigPartId,
  RotatingEmitterCorePartId,
  SegmentedCrescentPartId,
  TransformingOrbiterPartId
} from './boss-rigs/PreviewBossRigContracts';
export type {
  PreviewBossVfxAtlas,
  PreviewBossVfxFrame,
  PreviewBossVfxFrameId
} from './boss-rigs/PreviewBossVfxContracts';

type SceneLayerName =
  | 'background'
  | 'environment'
  | 'enemy'
  | 'player'
  | 'projectile'
  | 'pickup'
  | 'effects'
  | 'foreground'
  | 'overlay';

type EntityView = {
  id: string;
  type: EntityType;
  root: Container;
  trail: Graphics;
  aura: Graphics;
  sprite: Sprite;
  projectileCopies?: Sprite[];
  body: Graphics;
  flash: Graphics;
  health: Graphics;
  label: Text;
  textureKey: string | null;
  textureRequest: number;
  lastHp: number;
  lastFlashFrames: number;
  lastDamageFlashFrame: number;
  lastComponentDamageFrames: Record<BossPartId, number>;
  damageRecoilFrame: number;
  damageRecoilDirection: number;
  damageRecoilStrength: number;
  lastMarkedForDeletion: boolean;
  hasFallbackBody: boolean;
  bossRig?: BossRigView;
  seenFrame: number;
};

type BossRigView = {
  parts: Container;
  partSprites: Record<BossPartId, Sprite>;
  thrust: Container;
  thrusterSprites: readonly [Sprite, Sprite];
  componentHealth: Graphics;
  crownClaw: CrownClawRigView;
  articulated: ArticulatedBossRigView;
  previewAtlas?: PreviewBossAtlasRigView;
  modularPreview?: ModularPreviewBossRigView;
};

type CrownClawLegId = keyof typeof ASSETS.PIXI_BOSS_CROWNCLAW_LEGS;

type CrownClawRigView = {
  root: Container;
  body: Sprite;
  legs: Record<CrownClawLegId, Sprite>;
  guns: Record<'left' | 'right', Sprite>;
  claws: Record<'left' | 'right', Sprite>;
};

const RAIL_SERPENT_RIG_PART_IDS = [
  'tail',
  'bodyLower',
  'bodyUpper',
  'leftCannon',
  'rightCannon',
  'leftRib',
  'rightRib',
  'leftShoulder',
  'rightShoulder',
  'energyCore',
  'head'
] as const;
type RailSerpentRigPartId = (typeof RAIL_SERPENT_RIG_PART_IDS)[number];

const PRISM_MOTH_RIG_PART_IDS = [
  'leftUpperWing',
  'rightUpperWing',
  'leftMidWing',
  'rightMidWing',
  'leftLowerInnerWing',
  'rightLowerInnerWing',
  'leftLowerOuterWing',
  'rightLowerOuterWing',
  'tail',
  'leftWeaponPod',
  'rightWeaponPod',
  'core',
  'prismCore',
  'crest'
] as const;
type PrismMothRigPartId = (typeof PRISM_MOTH_RIG_PART_IDS)[number];
const PRISM_MOTH_WING_PART_IDS = [
  'leftUpperWing',
  'rightUpperWing',
  'leftMidWing',
  'rightMidWing',
  'leftLowerInnerWing',
  'rightLowerInnerWing',
  'leftLowerOuterWing',
  'rightLowerOuterWing'
] as const satisfies readonly PrismMothRigPartId[];

type ArticulatedPartRigView<PartId extends string> = {
  root: Container;
  parts: Record<PartId, Sprite>;
};

type ArticulatedBossRigView = {
  railSerpent: ArticulatedPartRigView<RailSerpentRigPartId>;
  prismMoth: ArticulatedPartRigView<PrismMothRigPartId>;
};

type PreviewBossAtlasRigView =
  | ({
      kind: 'segmented-crescent-v1';
    } & ArticulatedPartRigView<SegmentedCrescentPartId>)
  | ({
      kind: 'articulated-pincer-v1';
    } & ArticulatedPartRigView<ArticulatedPincerPartId>)
  | ({
      kind: 'transforming-orbiter-v1';
    } & ArticulatedPartRigView<TransformingOrbiterPartId>)
  | ({
      kind: 'rotating-emitter-core-v1';
    } & ArticulatedPartRigView<RotatingEmitterCorePartId>);

type ModularPreviewBossRigView = {
  root: Container;
  partSprites: Readonly<Record<string, Sprite>>;
  referenceComparison?: {
    sprite: Sprite;
    landmarks: Graphics;
  };
};

type BossSnapshot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textureKey: string;
  rotation: number;
  modularDestruction?: ModularBossDestructionSnapshot;
};

type ModularBossDestructionFragmentSnapshot = {
  authored: ModularBossDestructionFragment;
  frameId: string;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

type ModularBossDestructionSnapshot = {
  entityId: string;
  sequence: ModularBossDestructionSequence;
  designScaleX: number;
  designScaleY: number;
  fragments: readonly ModularBossDestructionFragmentSnapshot[];
};

type ModularBossDebugSnapshot = {
  entityId: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotation: number;
  designScaleX: number;
  designScaleY: number;
  hierarchy: ResolvedModularBossRigHierarchy;
};

type ModularBossDeathFragmentView = {
  sprite: Sprite;
  snapshot: ModularBossDestructionFragmentSnapshot;
};

const PLAYER_THRUSTER_COLORS = [
  ['#67e8f9', '#22d3ee'],
  ['#a7f3d0', '#34d399'],
  ['#fef08a', '#f59e0b'],
  ['#f0abfc', '#a855f7'],
  ['#fca5a5', '#ef4444'],
  ['#ffffff', '#38bdf8'],
  ['#ffffff', '#facc15']
] as const;
const STAGE_TAKEOFF_THRUSTER_VISUAL_CAP = 6.4;

const CROWNCLAW_LEG_LAYOUT: Record<CrownClawLegId, {
  x: number;
  y: number;
  pivotX: number;
  pivotY: number;
  direction: number;
  phase: number;
}> = {
  frontLeft: { x: -148, y: -174, pivotX: 231, pivotY: 128, direction: -1, phase: 0 },
  frontRight: { x: 148, y: -174, pivotX: 25, pivotY: 128, direction: 1, phase: Math.PI },
  middleLeft: { x: -161, y: -113, pivotX: 216, pivotY: 105, direction: -1, phase: Math.PI },
  middleRight: { x: 161, y: -113, pivotX: 40, pivotY: 105, direction: 1, phase: 0 },
  rearLeft: { x: -246, y: -59, pivotX: 207, pivotY: 64, direction: -1, phase: Math.PI * 0.5 },
  rearRight: { x: 246, y: -59, pivotX: 49, pivotY: 64, direction: 1, phase: Math.PI * 1.5 }
};

const CROWNCLAW_WEAPON_LAYOUT = {
  left: { x: -226, y: 34, pivotX: 164, pivotY: 67 },
  right: { x: 226, y: 34, pivotX: 92, pivotY: 67 }
} as const;

const RAIL_SERPENT_DESIGN_SIZE = Object.freeze({ width: 384, height: 512 });
const RAIL_SERPENT_RIG_LAYOUT = Object.freeze({
  head: { x: 0, y: -116, anchorX: 0.5, anchorY: 0.5 },
  bodyUpper: { x: 0, y: -34, anchorX: 0.5, anchorY: 0.5 },
  bodyLower: { x: 0, y: 76, anchorX: 0.5, anchorY: 0.5 },
  tail: { x: 0, y: 132, anchorX: 0.5, anchorY: 0.5 },
  energyCore: { x: 0, y: -8, anchorX: 0.5, anchorY: 0.5 },
  leftShoulder: { x: -76, y: -82, anchorX: 0.72, anchorY: 0.48 },
  rightShoulder: { x: 76, y: -82, anchorX: 0.28, anchorY: 0.48 },
  leftRib: { x: -63, y: 10, anchorX: 0.76, anchorY: 0.42 },
  rightRib: { x: 63, y: 10, anchorX: 0.24, anchorY: 0.42 },
  leftCannon: { x: -119, y: -82, anchorX: 0.5, anchorY: 0.22 },
  rightCannon: { x: 119, y: -82, anchorX: 0.5, anchorY: 0.22 }
} as const satisfies Record<RailSerpentRigPartId, {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}>);

const PRISM_MOTH_DESIGN_SIZE = Object.freeze({ width: 512, height: 512 });
const PRISM_MOTH_RIG_LAYOUT = Object.freeze({
  leftUpperWing: { x: -43, y: -70, anchorX: 0.84, anchorY: 0.72, side: -1, phase: 0 },
  rightUpperWing: { x: 43, y: -70, anchorX: 0.16, anchorY: 0.72, side: 1, phase: Math.PI },
  leftMidWing: { x: -58, y: -8, anchorX: 0.82, anchorY: 0.24, side: -1, phase: Math.PI * 0.32 },
  rightMidWing: { x: 58, y: -8, anchorX: 0.18, anchorY: 0.24, side: 1, phase: Math.PI * 1.32 },
  leftLowerInnerWing: { x: -45, y: 5, anchorX: 0.8, anchorY: 0.18, side: -1, phase: Math.PI * 0.58 },
  rightLowerInnerWing: { x: 45, y: 5, anchorX: 0.2, anchorY: 0.18, side: 1, phase: Math.PI * 1.58 },
  leftLowerOuterWing: { x: -70, y: 48, anchorX: 0.84, anchorY: 0.13, side: -1, phase: Math.PI * 1.08 },
  rightLowerOuterWing: { x: 70, y: 48, anchorX: 0.16, anchorY: 0.13, side: 1, phase: Math.PI * 0.08 }
} as const);

const COMBAT_LIGHT_POOL_SIZE = 8;
const COMBAT_LIGHT_PLAYER_COLOR = 0x67e8f9;
const COMBAT_LIGHT_SPECIAL_COLOR = 0xa7f3d0;
const COMBAT_LIGHT_COIN_COLOR = 0xfacc15;
const COMBAT_LIGHT_BOSS_COLOR = 0xfb7185;
const COMBAT_LIGHT_BEAM_COLOR = 0xf97316;
const RESEARCH_CHARGE_TRAIL_SEGMENTS_DESKTOP = 5;
const RESEARCH_CHARGE_TRAIL_SEGMENTS_MOBILE = 3;
const RESEARCH_CHARGE_TRAIL_SEGMENTS_REDUCED = 2;
const MINI_BOSS_RECOIL_PX = 3.5;
const BOSS_HULL_RECOIL_PX = 5;
const BOSS_COMPONENT_RECOIL_PX = 6;
const DAMAGE_RECOIL_DURATION_FRAMES = BOSS_SIGNIFICANT_REACTION_FRAMES;
const CORNER_AMBUSH_BEAM_PRIMITIVE_ID = 'corner-ambush-beam';
const CORNER_AMBUSH_RAM_PRIMITIVE_ID = 'corner-ambush-ram';
const CORNER_AMBUSH_DIM_ALPHA = 0.9;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothstep = (value: number) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const createLayer = () => {
  const layer = new Container();
  layer.eventMode = 'none';
  return layer;
};

const createText = (size: number, color = '#ffffff', weight: 'normal' | 'bold' = 'bold') => new Text({
  text: '',
  style: {
    fill: color,
    fontFamily: 'Orbitron, ui-monospace, monospace',
    fontSize: size,
    fontWeight: weight,
    align: 'center',
    letterSpacing: 1
  }
});

const createRailSerpentRigView = (): ArticulatedPartRigView<RailSerpentRigPartId> => {
  const root = new Container();
  const parts = {} as Record<RailSerpentRigPartId, Sprite>;
  root.eventMode = 'none';
  root.visible = false;
  for (const partId of RAIL_SERPENT_RIG_PART_IDS) {
    const sprite = new Sprite(Texture.WHITE);
    const layout = RAIL_SERPENT_RIG_LAYOUT[partId];
    sprite.anchor.set(layout.anchorX, layout.anchorY);
    sprite.eventMode = 'none';
    sprite.visible = false;
    parts[partId] = sprite;
    root.addChild(sprite);
  }
  return { root, parts };
};

const createPrismMothRigView = (): ArticulatedPartRigView<PrismMothRigPartId> => {
  const root = new Container();
  const parts = {} as Record<PrismMothRigPartId, Sprite>;
  root.eventMode = 'none';
  root.visible = false;
  for (const partId of PRISM_MOTH_RIG_PART_IDS) {
    const sprite = new Sprite(Texture.WHITE);
    const wingLayout = PRISM_MOTH_RIG_LAYOUT[partId as keyof typeof PRISM_MOTH_RIG_LAYOUT];
    sprite.anchor.set(wingLayout?.anchorX ?? 0.5, wingLayout?.anchorY ?? 0.5);
    sprite.eventMode = 'none';
    sprite.visible = false;
    parts[partId] = sprite;
    root.addChild(sprite);
  }
  return { root, parts };
};

const SEGMENTED_CRESCENT_DESIGN_SIZE = Object.freeze({ width: 606, height: 606 });
const SEGMENTED_CRESCENT_LAYOUT = Object.freeze({
  coreBody: { x: 0, y: -24, anchorX: 0.5, anchorY: 0.5 },
  coreClosed: { x: 0, y: -18, anchorX: 0.5, anchorY: 0.5 },
  coreOpen: { x: 0, y: -18, anchorX: 0.5, anchorY: 0.5 },
  leftBase: { x: -93, y: -41, anchorX: 0.72, anchorY: 0.66 },
  rightBase: { x: 93, y: -41, anchorX: 0.28, anchorY: 0.66 },
  leftMidB: { x: -143, y: -116, anchorX: 0.78, anchorY: 0.73 },
  rightMidB: { x: 143, y: -116, anchorX: 0.22, anchorY: 0.73 },
  leftMidA: { x: -180, y: -174, anchorX: 0.8, anchorY: 0.76 },
  rightMidA: { x: 180, y: -174, anchorX: 0.2, anchorY: 0.76 },
  leftOuter: { x: -219, y: -224, anchorX: 0.8, anchorY: 0.78 },
  rightOuter: { x: 219, y: -224, anchorX: 0.2, anchorY: 0.78 },
  leftPod: { x: -157, y: 74, anchorX: 0.5, anchorY: 0.5 },
  rightPod: { x: 157, y: 74, anchorX: 0.5, anchorY: 0.5 },
  ring: { x: 0, y: -10, anchorX: 0.5, anchorY: 0.5 },
  tailA: { x: 0, y: 81, anchorX: 0.5, anchorY: 0.08 },
  tailB: { x: 0, y: 81, anchorX: 0.5, anchorY: 0.08 },
  tailC: { x: 0, y: 81, anchorX: 0.5, anchorY: 0.08 }
} as const satisfies Record<SegmentedCrescentPartId, {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}>);

const SEGMENTED_CRESCENT_LAYER_ORDER = [
  'ring',
  'tailA',
  'tailB',
  'tailC',
  'leftOuter',
  'rightOuter',
  'leftMidA',
  'rightMidA',
  'leftMidB',
  'rightMidB',
  'leftBase',
  'rightBase',
  'coreBody',
  'coreClosed',
  'coreOpen',
  'leftPod',
  'rightPod'
] as const satisfies readonly SegmentedCrescentPartId[];

const ARTICULATED_PINCER_DESIGN_SIZE = Object.freeze({ width: 720, height: 620 });
const ARTICULATED_PINCER_LAYOUT = Object.freeze({
  bodyClosed: { x: 0, y: -36, anchorX: 0.5, anchorY: 0.5 },
  bodyOpen: { x: 0, y: -36, anchorX: 0.5, anchorY: 0.5 },
  leftClaw: { x: -194, y: -4, anchorX: 0.68, anchorY: 0.46 },
  rightClaw: { x: 194, y: -4, anchorX: 0.32, anchorY: 0.46 },
  leftMandible: { x: -104, y: 36, anchorX: 0.68, anchorY: 0.36 },
  rightMandible: { x: 104, y: 36, anchorX: 0.32, anchorY: 0.36 },
  legOuterLeft: { x: -160, y: 88, anchorX: 0.58, anchorY: 0.18 },
  legInnerLeft: { x: -82, y: 102, anchorX: 0.58, anchorY: 0.18 },
  legInnerRight: { x: 82, y: 102, anchorX: 0.42, anchorY: 0.18 },
  legOuterRight: { x: 160, y: 88, anchorX: 0.42, anchorY: 0.18 },
  gatlingLeft: { x: -66, y: 112, anchorX: 0.5, anchorY: 0.18 },
  gatlingRight: { x: 66, y: 112, anchorX: 0.5, anchorY: 0.18 },
  mineLeft: { x: -117, y: 122, anchorX: 0.5, anchorY: 0.5 },
  mineRight: { x: 117, y: 122, anchorX: 0.5, anchorY: 0.5 },
  shieldLeft: { x: -149, y: -74, anchorX: 0.65, anchorY: 0.5 },
  shieldRight: { x: 149, y: -74, anchorX: 0.35, anchorY: 0.5 },
  shockBlade: { x: 0, y: 130, anchorX: 0.5, anchorY: 0.2 },
  flameSmall: { x: 0, y: -168, anchorX: 0.5, anchorY: 0.82 },
  flameMedium: { x: 0, y: -168, anchorX: 0.5, anchorY: 0.82 },
  flameLarge: { x: 0, y: -168, anchorX: 0.5, anchorY: 0.82 }
} as const satisfies Record<ArticulatedPincerPartId, {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}>);

const ARTICULATED_PINCER_LAYER_ORDER = [
  'flameSmall',
  'flameMedium',
  'flameLarge',
  'legOuterLeft',
  'legInnerLeft',
  'legInnerRight',
  'legOuterRight',
  'shieldLeft',
  'shieldRight',
  'bodyClosed',
  'bodyOpen',
  'leftMandible',
  'rightMandible',
  'gatlingLeft',
  'gatlingRight',
  'mineLeft',
  'mineRight',
  'leftClaw',
  'rightClaw',
  'shockBlade'
] as const satisfies readonly ArticulatedPincerPartId[];

const TRANSFORMING_ORBITER_DESIGN_SIZE = Object.freeze({ width: 560, height: 560 });
const TRANSFORMING_ORBITER_LAYOUT = Object.freeze({
  coreClosed: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  coreOpen: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  leftWing: { x: -114, y: 0, anchorX: 0.78, anchorY: 0.5 },
  rightWing: { x: 114, y: 0, anchorX: 0.22, anchorY: 0.5 },
  leftEmitter: { x: -151, y: 4, anchorX: 0.72, anchorY: 0.5 },
  rightEmitter: { x: 151, y: 4, anchorX: 0.28, anchorY: 0.5 },
  finTop: { x: 0, y: -124, anchorX: 0.5, anchorY: 0.8 },
  finRight: { x: 124, y: 0, anchorX: 0.2, anchorY: 0.5 },
  finBottom: { x: 0, y: 124, anchorX: 0.5, anchorY: 0.2 },
  finLeft: { x: -124, y: 0, anchorX: 0.8, anchorY: 0.5 },
  nodeA: { x: 0, y: -132, anchorX: 0.5, anchorY: 0.5 },
  nodeB: { x: 132, y: 0, anchorX: 0.5, anchorY: 0.5 },
  nodeC: { x: 0, y: 132, anchorX: 0.5, anchorY: 0.5 },
  nodeD: { x: -132, y: 0, anchorX: 0.5, anchorY: 0.5 },
  haloSmall: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  haloMedium: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  haloLarge: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  haloXL: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  perimeterRing: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  laserHub: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  pulseSmall: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  pulseMedium: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  pulseLarge: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 }
} as const satisfies Record<TransformingOrbiterPartId, {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}>);

const TRANSFORMING_ORBITER_LAYER_ORDER = [
  'perimeterRing',
  'haloSmall',
  'haloMedium',
  'haloLarge',
  'haloXL',
  'leftWing',
  'rightWing',
  'finTop',
  'finRight',
  'finBottom',
  'finLeft',
  'leftEmitter',
  'rightEmitter',
  'coreClosed',
  'coreOpen',
  'nodeA',
  'nodeB',
  'nodeC',
  'nodeD',
  'laserHub',
  'pulseSmall',
  'pulseMedium',
  'pulseLarge'
] as const satisfies readonly TransformingOrbiterPartId[];

const TRANSFORMING_ORBITER_FIN_IDS = [
  'finTop',
  'finRight',
  'finBottom',
  'finLeft'
] as const satisfies readonly TransformingOrbiterPartId[];
const TRANSFORMING_ORBITER_NODE_IDS = [
  'nodeA',
  'nodeB',
  'nodeC',
  'nodeD'
] as const satisfies readonly TransformingOrbiterPartId[];
const TRANSFORMING_ORBITER_HALO_IDS = [
  'haloSmall',
  'haloMedium',
  'haloLarge',
  'haloXL'
] as const satisfies readonly TransformingOrbiterPartId[];
const TRANSFORMING_ORBITER_PULSE_IDS = [
  'pulseSmall',
  'pulseMedium',
  'pulseLarge'
] as const satisfies readonly TransformingOrbiterPartId[];

const ASSEMBLED_BOSS_ACCENT_LAYOUTS = Object.freeze({
  'wingbeat-hover': Object.freeze({
    designWidth: 363,
    designHeight: 257,
    coreY: 2,
    emitterX: 78,
    emitterY: 12,
    emitterScale: 0.34
  }),
  'paired-resonance': Object.freeze({
    designWidth: 322,
    designHeight: 219,
    coreY: 0,
    emitterX: 80,
    emitterY: 0,
    emitterScale: 0.3
  }),
  'revival-shell': Object.freeze({
    designWidth: 370,
    designHeight: 311,
    coreY: 0,
    emitterX: 94,
    emitterY: 22,
    emitterScale: 0.34
  })
} as const satisfies Record<PreviewBossAssembledMotionProfile, {
  designWidth: number;
  designHeight: number;
  coreY: number;
  emitterX: number;
  emitterY: number;
  emitterScale: number;
}>);

// The source sheet contains generous isolation padding. This tighter authored
// canvas lets the mechanical silhouette own the encounter without changing
// gameplay collision geometry or stretching individual atlas parts.
const ROTATING_EMITTER_CORE_DESIGN_SIZE = Object.freeze({
  width: ROTATING_EMITTER_CORE_AUTHORED_SIZE,
  height: ROTATING_EMITTER_CORE_AUTHORED_SIZE
});
const ROTATING_EMITTER_CORE_LAYOUT = Object.freeze({
  chassisClosed: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  chassisOpen: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  perimeterRing: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  rotorHub: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  arm0: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm1: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm2: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm3: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm4: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm5: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm6: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  arm7: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.82 },
  muzzle0: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle1: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle2: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle3: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle4: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle5: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle6: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  muzzle7: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  relayNorthWest: { x: -132, y: -132, anchorX: 0.5, anchorY: 0.5 },
  relayNorthEast: { x: 132, y: -132, anchorX: 0.5, anchorY: 0.5 },
  relaySouthEast: { x: 132, y: 132, anchorX: 0.5, anchorY: 0.5 },
  relaySouthWest: { x: -132, y: 132, anchorX: 0.5, anchorY: 0.5 },
  portal0: { x: -116, y: -154, anchorX: 0.5, anchorY: 0.5 },
  portal1: { x: -38, y: -180, anchorX: 0.5, anchorY: 0.5 },
  portal2: { x: 38, y: -180, anchorX: 0.5, anchorY: 0.5 },
  portal3: { x: 116, y: -154, anchorX: 0.5, anchorY: 0.5 },
  pulseSmall: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  pulseMedium: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  pulseLarge: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  eyeCometLeft: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 },
  eyeCometRight: { x: 0, y: 0, anchorX: 0.5, anchorY: 0.5 }
} as const satisfies Record<RotatingEmitterCorePartId, {
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}>);

const ROTATING_EMITTER_CORE_LAYER_ORDER = [
  'perimeterRing',
  'portal0',
  'portal1',
  'portal2',
  'portal3',
  'chassisClosed',
  'chassisOpen',
  'rotorHub',
  'arm0',
  'arm1',
  'arm2',
  'arm3',
  'arm4',
  'arm5',
  'arm6',
  'arm7',
  'muzzle0',
  'muzzle1',
  'muzzle2',
  'muzzle3',
  'muzzle4',
  'muzzle5',
  'muzzle6',
  'muzzle7',
  'relayNorthWest',
  'relayNorthEast',
  'relaySouthEast',
  'relaySouthWest',
  'pulseSmall',
  'pulseMedium',
  'pulseLarge',
  'eyeCometLeft',
  'eyeCometRight'
] as const satisfies readonly RotatingEmitterCorePartId[];

type PreviewBossPartLayout = Readonly<{
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
}>;

const createTypedPreviewBossAtlasRigView = <
  Kind extends PreviewBossRigKind,
  PartId extends PreviewBossRigPartId
>(
  kind: Kind,
  partIds: readonly PartId[],
  layout: Readonly<Record<PartId, PreviewBossPartLayout>>,
  layerOrder: readonly PartId[]
) => {
  const root = new Container();
  const parts = {} as Record<PartId, Sprite>;
  root.eventMode = 'none';
  root.visible = false;
  for (const partId of partIds) {
    const sprite = new Sprite(Texture.WHITE);
    const partLayout = layout[partId];
    sprite.anchor.set(partLayout.anchorX, partLayout.anchorY);
    sprite.eventMode = 'none';
    sprite.visible = false;
    parts[partId] = sprite;
  }
  for (const partId of layerOrder) root.addChild(parts[partId]);
  return { kind, root, parts };
};

const createPreviewBossAtlasRigView = (
  kind: PreviewBossRigKind
): PreviewBossAtlasRigView => {
  switch (kind) {
    case 'segmented-crescent-v1':
      return createTypedPreviewBossAtlasRigView(
        kind,
        SEGMENTED_CRESCENT_PART_IDS,
        SEGMENTED_CRESCENT_LAYOUT,
        SEGMENTED_CRESCENT_LAYER_ORDER
      );
    case 'articulated-pincer-v1':
      return createTypedPreviewBossAtlasRigView(
        kind,
        ARTICULATED_PINCER_PART_IDS,
        ARTICULATED_PINCER_LAYOUT,
        ARTICULATED_PINCER_LAYER_ORDER
      );
    case 'transforming-orbiter-v1':
      return createTypedPreviewBossAtlasRigView(
        kind,
        TRANSFORMING_ORBITER_PART_IDS,
        TRANSFORMING_ORBITER_LAYOUT,
        TRANSFORMING_ORBITER_LAYER_ORDER
      );
    case 'rotating-emitter-core-v1':
      return createTypedPreviewBossAtlasRigView(
        kind,
        ROTATING_EMITTER_CORE_PART_IDS,
        ROTATING_EMITTER_CORE_LAYOUT,
        ROTATING_EMITTER_CORE_LAYER_ORDER
      );
  }
};

const getPreviewBossRigParts = (
  rig: PreviewBossAtlasRigView
): Partial<Record<PreviewBossRigPartId, Sprite>> => (
  rig.parts as Partial<Record<PreviewBossRigPartId, Sprite>>
);

const createModularPreviewBossRigView = (
  registration: ModularBossRigRegistration,
  referenceComparisonEnabled: boolean
): ModularPreviewBossRigView => {
  const root = new Container();
  const partSprites: Record<string, Sprite> = Object.create(null) as Record<string, Sprite>;
  const referenceComparison = referenceComparisonEnabled
    ? {
        sprite: new Sprite(Texture.WHITE),
        landmarks: new Graphics()
      }
    : undefined;
  root.eventMode = 'none';
  root.visible = false;
  if (referenceComparison) {
    referenceComparison.sprite.anchor.set(0.5);
    referenceComparison.sprite.eventMode = 'none';
    referenceComparison.sprite.visible = false;
    referenceComparison.landmarks.eventMode = 'none';
    referenceComparison.landmarks.visible = false;
    root.addChild(referenceComparison.sprite);
  }
  for (const partId of registration.renderPartIds) {
    const part = registration.partById[partId];
    if (part.frameId === null) continue;
    const sprite = new Sprite(Texture.WHITE);
    sprite.eventMode = 'none';
    sprite.visible = false;
    if (part.anchor) sprite.anchor.set(part.anchor.x, part.anchor.y);
    partSprites[partId] = sprite;
    root.addChild(sprite);
  }
  if (referenceComparison) root.addChild(referenceComparison.landmarks);
  return { root, partSprites, referenceComparison };
};

const RAIL_SERPENT_RIG_TEXTURE_URLS = Object.freeze(
  RAIL_SERPENT_RIG_PART_IDS.map((partId) => ASSETS.PIXI_BOSS_RAIL_SERPENT_RIG[partId])
);
const PRISM_MOTH_RIG_TEXTURE_URLS = Object.freeze(
  PRISM_MOTH_RIG_PART_IDS.map((partId) => ASSETS.PIXI_BOSS_PRISM_MOTH_RIG[partId])
);
type ArticulatedBossArchetype = 'rail-serpent' | 'prism-moth';

const WAVE_GLYPH_ROOT = '/game-art/generated/ui/scicon-simple-arcade-kit-v1/wave-glyphs/cyan';
const WAVE_TITLE_TEXTURE_URL = `${WAVE_GLYPH_ROOT}/wave-title-cyan.png`;
const WAVE_GLYPH_TEXTURE_URLS = Object.freeze({
  '0': `${WAVE_GLYPH_ROOT}/wave-glyph-0-cyan.png`,
  '1': `${WAVE_GLYPH_ROOT}/wave-glyph-1-cyan.png`,
  '2': `${WAVE_GLYPH_ROOT}/wave-glyph-2-cyan.png`,
  '3': `${WAVE_GLYPH_ROOT}/wave-glyph-3-cyan.png`,
  '4': `${WAVE_GLYPH_ROOT}/wave-glyph-4-cyan.png`,
  '5': `${WAVE_GLYPH_ROOT}/wave-glyph-5-cyan.png`,
  '6': `${WAVE_GLYPH_ROOT}/wave-glyph-6-cyan.png`,
  '7': `${WAVE_GLYPH_ROOT}/wave-glyph-7-cyan.png`,
  '8': `${WAVE_GLYPH_ROOT}/wave-glyph-8-cyan.png`,
  '9': `${WAVE_GLYPH_ROOT}/wave-glyph-9-cyan.png`,
  '/': `${WAVE_GLYPH_ROOT}/wave-glyph-slash-cyan.png`
});

const WAVE_INTRO_FRAGMENT_COUNT_COMPACT = 42;
const WAVE_INTRO_FRAGMENT_COUNT_FULL = 60;
const WAVE_INTRO_ENTER_MS = 760;
const WAVE_INTRO_HOLD_UNTIL_MS = 1900;
const WAVE_INTRO_EXIT_MS = 680;
const WAVE_INTRO_DURATION_MS = WAVE_INTRO_HOLD_UNTIL_MS + WAVE_INTRO_EXIT_MS;
const WAVE_INTRO_REDUCED_DURATION_MS = 1400;

export const PIXI_WAVE_PRESENTATION_TEXTURE_URLS = Object.freeze([
  WAVE_TITLE_TEXTURE_URL,
  ...Object.values(WAVE_GLYPH_TEXTURE_URLS)
]);

const getPowerupFrames = (powerup: PowerupType): readonly string[] => {
  switch (powerup) {
    case PowerupType.TRIPLE_SHOT:
    case PowerupType.DOUBLE_SHOT:
      return ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES;
    case PowerupType.MAX_SHOT:
      return [ASSETS.POWERUP_MAX_SHOT];
    case PowerupType.MAGNET:
      return ASSETS.POWERUP_MAGNET_FRAMES;
    case PowerupType.SHIELD:
      return ASSETS.POWERUP_SHIELD_FRAMES;
    case PowerupType.EXTRA_LIFE:
      return ['/game-art/powerups/extra-life.png'];
    case PowerupType.RESEARCH_BEAM:
      return ASSETS.POWERUP_RESEARCH_BEAM_FRAMES;
    default:
      return ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES;
  }
};

/** Startup texture set; later campaign environments and authored entities warm on demand. */
export const PIXI_GAMEPLAY_TEXTURE_URLS = Object.freeze([
  ...PIXI_WAVE_PRESENTATION_TEXTURE_URLS,
  ASSETS.PIXI_BOSS_HEALTH_FRAME,
  ASSETS.PIXI_BOSS_ALERT_FRAME,
  ASSETS.PIXI_MINI_BOSS_ALERT_FRAME,
  ASSETS.PIXI_BOSS_ALERT_RING,
  ASSETS.PIXI_BOSS_ALERT_SCAN,
  ASSETS.PIXI_BOSS_ALERT_CRYSTAL,
  ...PIXI_ENVIRONMENT_TEXTURE_URLS,
  ...ASSETS.ENEMY_DRONE_FRAMES,
  ...ASSETS.ENEMY_SWARM_FRAMES,
  ...ASSETS.ENEMY_BRICK_FRAMES,
  ...ASSETS.ASTEROID_BELT_FRAMES,
  ...ASSETS.ENEMY_JOURNAL_FRAMES,
  ...ASSETS.PAYWALL_BASTION_FRAMES,
  ...ASSETS.PIXI_JET_SCOUT_FRAMES,
  ...ASSETS.PIXI_JET_INTERCEPTOR_FRAMES,
  ...ASSETS.PIXI_JET_HEAVY_FRAMES,
  ...ASSETS.PIXI_BOSS_OPEN_ORBIT_FRAMES,
  ...ASSETS.PIXI_BOSS_CITATION_FRAMES,
  ...ASSETS.PIXI_BOSS_PAYWALL_FRAMES,
  ...ASSETS.PIXI_BOSS_OPEN_GALAXY_FRAMES,
  ...ASSETS.PIXI_BOSS_CROWNCLAW_FRAMES,
  ...Object.values(ASSETS.PIXI_BOSS_CROWNCLAW_LEGS),
  ...ASSETS.PIXI_BOSS_PAYWALL_RAY_FRAMES,
  ...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES,
  ...ASSETS.PIXI_BOSS_THRUSTER_FRAMES,
  ...ASSETS.PIXI_THRUSTER_FRAMES,
  ...ASSETS.PIXI_EXPLOSION_FRAMES,
  ...ASSETS.PIXI_BOSS_DAMAGE_EXPLOSION_FRAMES,
  ...PLAYER_SHIP_STEERING_FRAME_URLS,
  ...PLAYER_WEAPON_FRAME_URLS,
  ...SHIP_ABILITY_FRAME_URLS,
  ...RESEARCH_IMPACT_FRAME_URLS,
  ...ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES,
  ASSETS.POWERUP_MAX_SHOT,
  ASSETS.POWERUP_MAX_SHOT_AURA,
  ...ASSETS.POWERUP_MAX_SHOT_AURA_FRAMES,
  ...ASSETS.POWERUP_MAGNET_FRAMES,
  ...ASSETS.POWERUP_SHIELD_FRAMES,
  ...ASSETS.POWERUP_RESEARCH_BEAM_FRAMES,
  ...MINI_SHIP_CATALOG.flatMap((miniShip) => miniShip.frames),
  ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_LEFT,
  ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT,
  ASSETS.PIXI_BOSS_CITATION_CLAW_LEFT,
  ASSETS.PIXI_BOSS_CITATION_CLAW_RIGHT,
  ASSETS.PIXI_BOSS_PAYWALL_CANNON_LEFT,
  ASSETS.PIXI_BOSS_PAYWALL_CANNON_RIGHT,
  ASSETS.PIXI_BOSS_PAYWALL_HELMET,
  ASSETS.PIXI_BOSS_CROWNCLAW_CORE,
  ASSETS.PIXI_BOSS_CROWNCLAW_GUN_LEFT,
  ASSETS.PIXI_BOSS_CROWNCLAW_GUN_RIGHT,
  ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_LEFT,
  ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_RIGHT,
  ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_LEFT,
  ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_RIGHT,
  ASSETS.MINI_BOSS,
  ASSETS.FINAL_BOSS,
  ASSETS.WALL_BOSS_SEGMENT,
  ASSETS.RSC_TOKEN,
  ...ASSETS.RSC_TOKEN_FLIP_FRAMES
]);

let pixiGameplayTexturePreload: Promise<void> | null = null;

/** Warms Pixi's shared GPU texture cache; unused gallery art is never requested. */
export const preloadPixiGameplayTextures = () => {
  if (!pixiGameplayTexturePreload) {
    const urls = [...new Set(PIXI_GAMEPLAY_TEXTURE_URLS.filter(Boolean))];
    pixiGameplayTexturePreload = Promise.allSettled(urls.map(async (url) => {
      const texture = await Assets.load<Texture>(url);
      texture.source.scaleMode = 'nearest';
    })).then(() => undefined);
  }
  return pixiGameplayTexturePreload;
};

const isEnemyType = (type: EntityType) => (
  type === EntityType.ENEMY_DRONE
  || type === EntityType.ENEMY_SWARM
  || type === EntityType.ENEMY_BRICK
  || type === EntityType.ENEMY_JOURNAL
  || type === EntityType.ENEMY_INVADER
  || type === EntityType.MINI_BOSS
  || type === EntityType.BOSS
);

const isPickupType = (type: EntityType) => (
  type === EntityType.COIN
  || type === EntityType.POWERUP
  || type === EntityType.BOMB
);

const getEntityLayer = (type: EntityType): SceneLayerName => {
  if (type === EntityType.PLAYER) return 'player';
  if (type === EntityType.PROJECTILE || type === EntityType.MISSILE) return 'projectile';
  if (isPickupType(type)) return 'pickup';
  if (type === EntityType.PARTICLE || type === EntityType.EFFECT) return 'effects';
  return 'enemy';
};

const isFormationMotionEnemy = (entity: Entity) => (
  entity.type === EntityType.ENEMY_DRONE
  || entity.type === EntityType.ENEMY_SWARM
  || entity.type === EntityType.ENEMY_BRICK
  || entity.type === EntityType.ENEMY_JOURNAL
);

const getFormationMotionFrameIndex = (engine: GameEngine, entity: Entity) => {
  const stateAge = Math.max(0, engine.frameCount - entity.formationStateFrame);
  const pingPong = [0, 1, 2, 1] as const;
  const phaseOffset = Math.abs(entity.variant * 13 + entity.formationIndex * 7);

  if (entity.formationState === 'hold') {
    const framesUntilDive = entity.formationDiveFrame - engine.frameCount;
    if (entity.formationDiveFrame > 0 && framesUntilDive > 0 && framesUntilDive <= 36) {
      return clamp(Math.floor((36 - framesUntilDive) / 12), 0, 2);
    }

    const idlePulseFrame = (stateAge + phaseOffset) % 210;
    if (idlePulseFrame < 28) {
      return pingPong[Math.floor(idlePulseFrame / 7) % pingPong.length];
    }
    return 1;
  }

  if (entity.formationState === 'dive') {
    if (stateAge < 20) return 2;
    return pingPong[Math.floor((stateAge + phaseOffset) / 8) % pingPong.length];
  }

  if (entity.formationState === 'entry' || entity.formationState === 'return') {
    return pingPong[Math.floor((stateAge + phaseOffset) / 8) % pingPong.length];
  }

  const ambientFrame = (engine.frameCount + phaseOffset) % 240;
  return ambientFrame < 28
    ? pingPong[Math.floor(ambientFrame / 7) % pingPong.length]
    : 1;
};

const getPaywallBastionFrameIndex = (engine: GameEngine, entity: Entity) => {
  const healthRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 1;
  if (healthRatio <= 0.15) return 4;
  if (healthRatio <= 0.5) return 3;
  if (entity.attackTimer > 0) return 2;
  return Math.floor((engine.frameCount + entity.variant * 5) / 24) % 2;
};

const getStaticAsteroidTexture = (engine: GameEngine, entity: Entity) => {
  const frames = entity.spriteFrames?.length
    ? entity.spriteFrames
    : ASSETS.ASTEROID_BELT_FRAMES;
  const stageNumber = Math.max(1, Math.floor(Number(engine.stats.wave) || 1));
  const darkerWindowStart = stageNumber >= 4
    ? Math.max(0, frames.length - 2)
    : stageNumber >= 3
      ? Math.max(0, frames.length - 3)
      : 0;
  const stableVariant = Math.max(0, Math.floor(entity.variant) - 900);
  const availableFrameCount = Math.max(1, frames.length - darkerWindowStart);
  return frames[darkerWindowStart + (stableVariant % availableFrameCount)]
    ?? frames[0]
    ?? ASSETS.ASTEROID_BELT_FRAMES[0];
};

const getDefaultEntityTexture = (engine: GameEngine, entity: Entity) => {
  // Asteroid sheets are a style library, not animation frames. Lock every
  // rock to one texture so it reads as solid terrain instead of flickering.
  if (entity.type === EntityType.ENEMY_BRICK && entity.variant >= 900) {
    return getStaticAsteroidTexture(engine, entity);
  }
  if (entity.spriteFrames?.length) {
    if (entity.type === EntityType.BOSS) {
      return entity.spriteFrames[clamp(entity.bossDecayStage, 0, entity.spriteFrames.length - 1)];
    }
    if (entity.type === EntityType.ENEMY_INVADER && entity.spriteFrames.length >= 5) {
      return entity.spriteFrames[getPaywallBastionFrameIndex(engine, entity)];
    }
    if (isFormationMotionEnemy(entity) && entity.spriteFrames.length === 3) {
      return entity.spriteFrames[getFormationMotionFrameIndex(engine, entity)];
    }
    const speed = entity.type === EntityType.ENEMY_SWARM ? 5 : 6;
    return entity.spriteFrames[(Math.floor(engine.frameCount / speed) + entity.variant) % entity.spriteFrames.length];
  }
  if (entity.spriteUrl) return entity.spriteUrl;

  switch (entity.type) {
    case EntityType.PLAYER:
      return engine.playerShipUrl;
    case EntityType.ENEMY_DRONE:
      return ASSETS.ENEMY_DRONE_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    case EntityType.ENEMY_SWARM:
      return ASSETS.ENEMY_SWARM_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    case EntityType.ENEMY_BRICK: {
      return ASSETS.ENEMY_BRICK_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    }
    case EntityType.ENEMY_JOURNAL:
      return ASSETS.ENEMY_JOURNAL_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    case EntityType.ENEMY_INVADER:
      return ASSETS.PAYWALL_BASTION_FRAMES[getPaywallBastionFrameIndex(engine, entity)];
    case EntityType.MINI_BOSS:
      return ASSETS.MINI_BOSS;
    case EntityType.BOSS:
      return ASSETS.FINAL_BOSS;
    case EntityType.COIN: {
      const frameIndex = Math.floor((engine.frameCount + entity.variant) / 5)
        % ASSETS.RSC_TOKEN_FLIP_FRAMES.length;
      return ASSETS.RSC_TOKEN_FLIP_FRAMES[frameIndex];
    }
    case EntityType.BOMB:
      return engine.bombSpriteUrl;
    case EntityType.POWERUP: {
      const frames = getPowerupFrames(entity.text as PowerupType);
      const frameIndex = Math.floor((engine.frameCount + entity.variant) / 8) % frames.length;
      return frames[frameIndex];
    }
    default:
      return null;
  }
};

const usesStandaloneBossArt = (entity: Entity, previewArtwork = false) => (
  entity.type === EntityType.BOSS
  && Boolean(
    previewArtwork
    ||
    entity.spriteUrl?.includes('/scicon-stage20-expansion-v1/bosses/')
  )
);

export interface PixiGameRendererOptions {
  readonly previewBossArtwork?: PreviewBossArtwork;
}

export class PixiGameRenderer {
  readonly app = new Application();

  private readonly textureBank = new PixiTextureBank();
  private readonly articulatedBossRigLoads = new Map<ArticulatedBossArchetype, Promise<unknown>>();
  private readonly layers: Record<SceneLayerName, Container> = {
    background: createLayer(),
    environment: createLayer(),
    enemy: createLayer(),
    player: createLayer(),
    projectile: createLayer(),
    pickup: createLayer(),
    effects: createLayer(),
    foreground: createLayer(),
    overlay: createLayer()
  };
  private readonly camera = createLayer();
  private readonly world = createLayer();
  private readonly cornerAmbushShade = new Graphics();
  private readonly cornerAmbushGuide = new Graphics();
  private readonly previewDebugOverlay = new Graphics();
  private readonly views = new Map<string, EntityView>();
  private readonly recycledViews = new Map<EntityType, EntityView[]>();
  private readonly environment = new PixiEnvironment(this.layers.background, this.layers.environment, this.textureBank);
  private readonly warningShade = new Graphics();
  private readonly warningFrame = new Graphics();
  private readonly warningRoot = new Container();
  private readonly warningBanner = new Sprite(Texture.WHITE);
  private readonly warningRing = new Sprite(Texture.WHITE);
  private readonly warningScan = new Sprite(Texture.WHITE);
  private readonly warningCrystal = new Sprite(Texture.WHITE);
  private readonly warningText = createText(34, '#fffbeb');
  private readonly warningSubtext = createText(15, '#fda4af');
  private readonly phaseText = createText(18, '#fef08a');
  private readonly waveIntroRoot = new Container();
  private readonly waveIntroAura = new Graphics();
  private readonly waveIntroPixels = new Graphics();
  private readonly waveIntroSweep = new Graphics();
  private readonly waveLevelText = createText(13, '#a7f3d0');
  private readonly waveCounterRoot = new Container();
  private readonly waveTitle = new Sprite(Texture.WHITE);
  private readonly waveCounterGlyphs = Array.from({ length: 8 }, () => new Sprite(Texture.WHITE));
  private readonly waveNameText = createText(17, '#e0f2fe');
  private readonly flashOverlay = new Graphics();
  private readonly scanlines = new Graphics();
  private readonly maxShotScreenGlow = new Graphics();
  private readonly combatLightRoot = new Container();
  private readonly combatLightNodes = Array.from(
    { length: COMBAT_LIGHT_POOL_SIZE },
    () => createSoftRadialLight()
  );
  private readonly effectPool = new ArcadeEffectPool(this.layers.effects);
  private readonly maxShotAura = new Sprite(Texture.WHITE);
  private readonly stageLaunchStreak = new Graphics();
  private readonly playerThrusterRoot = new Container();
  private readonly playerThrusters = [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)] as const;
  private readonly gunPodRoot = new Container();
  private readonly gunPodThrusterSprites = [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)] as const;
  private readonly gunPodSprites = [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)] as const;
  private readonly bioBeamRoot = new Container();
  private readonly bioBeamAura = new Graphics();
  private readonly bioBeamCore = new Graphics();
  private readonly bioBeamEmitter = new Sprite(Texture.WHITE);
  private readonly wallHealthRoot = new Container();
  private readonly wallHealthBar = new Graphics();
  private readonly wallHealthLabel = createText(9, '#fef08a');
  private readonly bossHealthRoot = new Container();
  private readonly bossHealthFrame = new Sprite(Texture.WHITE);
  private readonly bossHealthBar = new Graphics();
  private readonly bossHealthName = createText(10, '#fef08a');
  private readonly bossHealthPercent = createText(9, '#a7f3d0');
  private readonly seenBossPhase = new Map<string, number>();
  private readonly seenBossComponents = new Map<string, Partial<Record<BossPartId, boolean>>>();
  private readonly bossDeathRoot = new Container();
  private readonly bossDeathSprite = new Sprite(Texture.WHITE);
  private readonly bossDeathFragments = new Container();
  private readonly bossDeathCore = new Graphics();
  private readonly bossDeathText = createText(24, '#a7f3d0');
  private modularBossDestructionSnapshot: ModularBossDestructionSnapshot | null = null;
  private modularBossDebugSnapshot: ModularBossDebugSnapshot | null = null;
  private bossDeathFragmentViews: ModularBossDeathFragmentView[] = [];
  private lastBossSnapshot: BossSnapshot | null = null;
  private bossDeathAge = -1;
  private bossDeathStage = -1;
  private bossDeathHandled = false;
  private bossDeathTextureRequest = 0;
  private phaseTextUntilFrame = -1;
  private appReady = false;
  private appDestroyed = false;
  private initialized = false;
  private renderFrame = 0;
  private width = 1;
  private height = 1;
  private lastTimestamp = 0;
  private playerSteeringVisual = 0;
  private playerSteeringState: PlayerSteeringState = 'neutral';
  private playerSteeringTextureKey: string | null = null;
  private playerSteeringSweepOriginX: number | null = null;
  private playerSteeringSweepDirection: -1 | 0 | 1 = 0;
  private playerSteeringShipUrl: string | null = null;
  private lastShotFrame = -999;
  private lastBombFrame = -999;
  private bioBeamVisualStartFrame = -1;
  private lastWavePresentationRevision = -1;
  private lastWavePresentationKey = '';
  private wavePresentationElapsedMs = 0;
  private currentWaveCounter = '1/1';
  private reducedMotion = false;
  private destroyed = false;
  private readonly previewBossArtwork?: PreviewBossArtwork;
  private previewBossArtworkReady = false;
  private readonly previewBossAtlasTextures = new Map<PreviewBossRigPartId, Texture>();
  private previewBossAtlasReady = false;
  private readonly modularPreviewBossTextures = new Map<string, Texture>();
  private modularPreviewBossReady = false;
  private readonly previewBossVfxTextures = new Map<PreviewBossVfxFrameId, Texture>();
  private previewBossVfxReady = false;
  private previewBossRuntimeEntityId: string | null = null;
  private cornerAmbushBossId: string | null = null;
  private previewDebugOverlays: PreviewDebugOverlayState = DEFAULT_PREVIEW_DEBUG_OVERLAYS;
  private previewBossReferenceComparison: PreviewBossReferenceComparisonState =
    DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON;

  constructor(options: PixiGameRendererOptions = {}) {
    this.previewBossArtwork = options.previewBossArtwork;
  }

  private isPreviewBossEntity(entity: Entity) {
    if (
      entity.type !== EntityType.BOSS
      || !entity.sourceEventId
      || entity.sourceEventId !== this.previewBossArtwork?.eventId
    ) {
      return false;
    }
    return true;
  }

  private getPreviewBossArtwork(entity: Entity): PreviewBossArtwork | undefined {
    if (
      (!this.previewBossArtworkReady && !this.modularPreviewBossReady)
      || !this.isPreviewBossEntity(entity)
    ) {
      return undefined;
    }
    return this.previewBossArtwork;
  }

  private getPreviewBossAtlas(entity: Entity) {
    if (!this.previewBossAtlasReady || !this.isPreviewBossEntity(entity)) return undefined;
    return this.previewBossArtwork?.articulatedAtlas;
  }

  private getPreviewBossAtlasTexture(partId: PreviewBossRigPartId) {
    return this.previewBossAtlasReady ? this.previewBossAtlasTextures.get(partId) : undefined;
  }

  private destroyPreviewBossAtlasTextures() {
    for (const texture of this.previewBossAtlasTextures.values()) texture.destroy(false);
    this.previewBossAtlasTextures.clear();
    this.previewBossAtlasReady = false;
  }

  private getModularPreviewBossTexture(frameId: string) {
    return this.modularPreviewBossReady
      ? this.modularPreviewBossTextures.get(frameId)
      : undefined;
  }

  private destroyModularPreviewBossTextures() {
    for (const texture of this.modularPreviewBossTextures.values()) texture.destroy(false);
    this.modularPreviewBossTextures.clear();
    this.modularPreviewBossReady = false;
  }

  private getPreviewBossVfxTexture(frameId: PreviewBossVfxFrameId) {
    return this.previewBossVfxReady ? this.previewBossVfxTextures.get(frameId) : undefined;
  }

  private destroyPreviewBossVfxTextures() {
    for (const texture of this.previewBossVfxTextures.values()) texture.destroy(false);
    this.previewBossVfxTextures.clear();
    this.previewBossVfxReady = false;
  }

  private createPreviewBossVfxTextures(sheet: Texture) {
    const atlas = this.previewBossArtwork?.vfxAtlas;
    if (!atlas) return false;
    if (
      !Number.isFinite(atlas.width)
      || !Number.isFinite(atlas.height)
      || atlas.width <= 0
      || atlas.height <= 0
      || sheet.width < atlas.width
      || sheet.height < atlas.height
    ) {
      return false;
    }
    const created = new Map<PreviewBossVfxFrameId, Texture>();
    try {
      for (const frameId of PREVIEW_BOSS_VFX_FRAME_IDS) {
        const frame = atlas.frames[frameId];
        if (
          !frame
          || !Number.isFinite(frame.x)
          || !Number.isFinite(frame.y)
          || !Number.isFinite(frame.width)
          || !Number.isFinite(frame.height)
          || frame.x < 0
          || frame.y < 0
          || frame.width <= 0
          || frame.height <= 0
          || frame.x + frame.width > atlas.width
          || frame.y + frame.height > atlas.height
        ) {
          throw new Error(`Invalid preview boss VFX frame: ${frameId}`);
        }
        created.set(frameId, new Texture({
          source: sheet.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
          label: `${atlas.contentHash}:${frameId}`
        }));
      }
    } catch {
      for (const texture of created.values()) texture.destroy(false);
      return false;
    }
    this.destroyPreviewBossVfxTextures();
    for (const [frameId, texture] of created) {
      this.previewBossVfxTextures.set(frameId, texture);
    }
    this.previewBossVfxReady = true;
    return true;
  }

  private createPreviewBossAtlasTextures(sheet: Texture) {
    const atlas = this.previewBossArtwork?.articulatedAtlas;
    if (!atlas) return false;
    if (
      !Number.isFinite(atlas.width)
      || !Number.isFinite(atlas.height)
      || atlas.width <= 0
      || atlas.height <= 0
      || sheet.width < atlas.width
      || sheet.height < atlas.height
    ) {
      return false;
    }
    const created = new Map<PreviewBossRigPartId, Texture>();
    try {
      for (const partId of getPreviewBossRigPartIds(atlas.kind)) {
        const frame = (atlas.frames as Partial<Record<PreviewBossRigPartId, {
          readonly x: number;
          readonly y: number;
          readonly width: number;
          readonly height: number;
        }>>)[partId];
        if (
          !frame
          || !Number.isFinite(frame.x)
          || !Number.isFinite(frame.y)
          || !Number.isFinite(frame.width)
          || !Number.isFinite(frame.height)
          || frame.x < 0
          || frame.y < 0
          || frame.width <= 0
          || frame.height <= 0
          || frame.x + frame.width > atlas.width
          || frame.y + frame.height > atlas.height
        ) {
          throw new Error(`Invalid preview boss atlas frame: ${partId}`);
        }
        created.set(partId, new Texture({
          source: sheet.source,
          frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
          label: `${atlas.contentHash}:${partId}`
        }));
      }
    } catch {
      for (const texture of created.values()) texture.destroy(false);
      return false;
    }
    this.destroyPreviewBossAtlasTextures();
    for (const [partId, texture] of created) {
      this.previewBossAtlasTextures.set(partId, texture);
    }
    this.previewBossAtlasReady = true;
    return true;
  }

  private createModularPreviewBossTextures(
    loadedAtlases: readonly Readonly<{
      atlas: ModularBossRigAtlas;
      sheet: Texture;
    }>[]
  ) {
    const registration = this.previewBossArtwork?.modularRig;
    if (!registration || loadedAtlases.length !== registration.atlases.length) return false;
    const created = new Map<string, Texture>();
    try {
      for (let atlasIndex = 0; atlasIndex < loadedAtlases.length; atlasIndex += 1) {
        const { atlas, sheet } = loadedAtlases[atlasIndex];
        if (
          atlas !== registration.atlases[atlasIndex]
          || !Number.isFinite(atlas.width)
          || !Number.isFinite(atlas.height)
          || atlas.width <= 0
          || atlas.height <= 0
          || sheet.width < atlas.width
          || sheet.height < atlas.height
        ) {
          throw new Error(`Invalid modular preview boss atlas: ${atlasIndex}`);
        }
        for (const [frameId, frame] of Object.entries(atlas.frames)) {
          if (
            created.has(frameId)
            || !Number.isFinite(frame.x)
            || !Number.isFinite(frame.y)
            || !Number.isFinite(frame.width)
            || !Number.isFinite(frame.height)
            || frame.x < 0
            || frame.y < 0
            || frame.width <= 0
            || frame.height <= 0
            || frame.x + frame.width > atlas.width
            || frame.y + frame.height > atlas.height
          ) {
            throw new Error(`Invalid modular preview boss atlas frame: ${frameId}`);
          }
          created.set(frameId, new Texture({
            source: sheet.source,
            frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
            label: `${atlas.contentHash}:${frameId}`
          }));
        }
      }
    } catch {
      for (const texture of created.values()) texture.destroy(false);
      return false;
    }
    this.destroyModularPreviewBossTextures();
    for (const [frameId, texture] of created) {
      this.modularPreviewBossTextures.set(frameId, texture);
    }
    this.modularPreviewBossReady = true;
    return true;
  }

  async init(
    host: HTMLElement,
    width: number,
    height: number,
    environmentWindow?: PixiEnvironmentWindow
  ) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const mobile = this.width < 620 || this.height > this.width * 1.25;
    const resolution = Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.75);

    await this.app.init({
      width: this.width,
      height: this.height,
      background: '#020617',
      antialias: false,
      autoDensity: true,
      resolution,
      autoStart: false,
      sharedTicker: false,
      powerPreference: 'high-performance',
      preference: 'webgl'
    });
    this.appReady = true;
    if (this.destroyed) {
      this.destroyApplication();
      return;
    }
    this.app.stop();
    if (this.previewBossArtwork) {
      void this.textureBank.load(this.previewBossArtwork.url)
        .then(() => {
          if (!this.destroyed) this.previewBossArtworkReady = true;
        })
        .catch(() => {
          this.previewBossArtworkReady = false;
        });
      const atlas = this.previewBossArtwork.articulatedAtlas;
      if (atlas) {
        void this.textureBank.load(atlas.url)
          .then((sheet) => {
            if (!this.destroyed) this.createPreviewBossAtlasTextures(sheet);
          })
          .catch(() => {
            this.destroyPreviewBossAtlasTextures();
          });
      }
      const modularRig = this.previewBossArtwork.modularRig;
      if (modularRig) {
        void Promise.all(modularRig.atlases.map(async (atlas) => ({
          atlas,
          sheet: await this.textureBank.load(atlas.url)
        })))
          .then((loadedAtlases) => {
            if (!this.destroyed) this.createModularPreviewBossTextures(loadedAtlases);
          })
          .catch(() => {
            this.destroyModularPreviewBossTextures();
          });
      }
      const referenceComparison = this.previewBossArtwork.modularReferenceComparison;
      if (referenceComparison) {
        // Review-only texture. It is never assigned to an entity sprite and
        // cannot participate in collision, sockets, or authored attacks.
        void this.textureBank.load(referenceComparison.url).catch(() => undefined);
      }
      const vfxAtlas = this.previewBossArtwork.vfxAtlas;
      if (vfxAtlas) {
        void this.textureBank.load(vfxAtlas.url)
          .then((sheet) => {
            if (!this.destroyed) this.createPreviewBossVfxTextures(sheet);
          })
          .catch(() => {
            this.destroyPreviewBossVfxTextures();
          });
      }
    }
    this.app.canvas.className = 'absolute left-0 top-0 z-0 block h-full w-full';
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.style.outline = 'none';
    this.app.canvas.setAttribute('aria-label', 'Scicon Shooter Pixi gameplay canvas');
    host.replaceChildren(this.app.canvas);

    this.app.stage.eventMode = 'none';
    // The cinematic layer lives above the entire camera/world but below the
    // Pixi HUD. GameStage's React HUD is a separate z-10 sibling, so hearts,
    // score, pause, bombs, and ship actions also remain bright and interactive.
    this.app.stage.addChild(
      this.layers.background,
      this.camera,
      this.cornerAmbushShade,
      this.cornerAmbushGuide,
      this.layers.overlay
    );
    this.camera.addChild(this.world);
    this.world.addChild(
      this.layers.environment,
      this.layers.enemy,
      this.layers.player,
      this.layers.projectile,
      this.layers.pickup,
      this.layers.effects,
      this.layers.foreground
    );

    this.cornerAmbushShade.eventMode = 'none';
    this.cornerAmbushShade.visible = false;
    this.cornerAmbushGuide.eventMode = 'none';
    this.cornerAmbushGuide.visible = false;
    this.cornerAmbushGuide.blendMode = 'add';
    this.previewDebugOverlay.eventMode = 'none';
    this.previewDebugOverlay.visible = false;

    this.combatLightRoot.eventMode = 'none';
    this.combatLightRoot.visible = false;
    for (const light of this.combatLightNodes) {
      this.combatLightRoot.addChild(light.root);
    }
    // Foreground placement lets each local gradient subtly illuminate every
    // world sprite beneath it while leaving HUD readability untouched.
    this.layers.foreground.addChild(this.combatLightRoot);

    this.stageLaunchStreak.eventMode = 'none';
    this.stageLaunchStreak.visible = false;
    this.layers.player.addChild(this.stageLaunchStreak);

    this.maxShotAura.eventMode = 'none';
    this.maxShotAura.visible = false;
    this.maxShotAura.anchor.set(0.5);
    this.layers.player.addChild(this.maxShotAura);

    this.playerThrusterRoot.eventMode = 'none';
    this.playerThrusterRoot.visible = false;
    for (const thruster of this.playerThrusters) {
      thruster.anchor.set(0.76, 0.5);
      thruster.rotation = -Math.PI / 2;
      this.playerThrusterRoot.addChild(thruster);
    }
    this.layers.player.addChild(this.playerThrusterRoot);

    this.gunPodRoot.eventMode = 'none';
    this.gunPodRoot.visible = false;
    for (const thruster of this.gunPodThrusterSprites) {
      thruster.anchor.set(0.76, 0.5);
      thruster.rotation = -Math.PI / 2;
      thruster.visible = false;
      this.gunPodRoot.addChild(thruster);
    }
    for (const pod of this.gunPodSprites) {
      pod.anchor.set(0.5);
      this.gunPodRoot.addChild(pod);
    }
    this.layers.player.addChild(this.gunPodRoot);

    this.bioBeamRoot.eventMode = 'none';
    this.bioBeamRoot.visible = false;
    this.bioBeamEmitter.anchor.set(0.5, 1);
    this.bioBeamRoot.addChild(this.bioBeamAura, this.bioBeamCore, this.bioBeamEmitter);
    this.layers.projectile.addChild(this.bioBeamRoot);

    this.wallHealthLabel.anchor.set(0.5);
    this.wallHealthRoot.eventMode = 'none';
    this.wallHealthRoot.visible = false;
    this.wallHealthRoot.addChild(this.wallHealthBar, this.wallHealthLabel);
    this.layers.foreground.addChild(this.wallHealthRoot);

    this.bossHealthFrame.anchor.set(0.5);
    this.bossHealthName.anchor.set(0.5);
    this.bossHealthPercent.anchor.set(0.5);
    this.bossHealthRoot.eventMode = 'none';
    this.bossHealthRoot.visible = false;
    this.bossHealthRoot.addChild(
      this.bossHealthFrame,
      this.bossHealthBar,
      this.bossHealthName,
      this.bossHealthPercent
    );

    this.bossDeathSprite.anchor.set(0.5);
    this.bossDeathText.anchor.set(0.5);
    this.bossDeathRoot.eventMode = 'none';
    this.bossDeathFragments.eventMode = 'none';
    this.bossDeathRoot.visible = false;
    this.bossDeathRoot.addChild(
      this.bossDeathSprite,
      this.bossDeathFragments,
      this.bossDeathCore,
      this.bossDeathText
    );
    this.layers.foreground.addChild(this.bossDeathRoot);

    this.warningRoot.eventMode = 'none';
    this.warningRoot.visible = false;
    this.warningBanner.anchor.set(0.5);
    this.warningRing.anchor.set(0.5);
    this.warningScan.anchor.set(0.5);
    this.warningCrystal.anchor.set(0.5);
    this.warningText.anchor.set(0.5);
    this.warningSubtext.anchor.set(0.5);
    this.warningRoot.addChild(
      this.warningBanner,
      this.warningScan,
      this.warningRing,
      this.warningCrystal,
      this.warningText,
      this.warningSubtext
    );

    this.waveIntroRoot.eventMode = 'none';
    this.waveIntroRoot.visible = false;
    this.waveTitle.anchor.set(0.5);
    this.waveCounterRoot.addChild(this.waveTitle);
    for (const glyph of this.waveCounterGlyphs) {
      glyph.anchor.set(0.5);
      glyph.visible = false;
      this.waveCounterRoot.addChild(glyph);
    }
    this.waveLevelText.anchor.set(0.5);
    this.waveNameText.anchor.set(0.5);
    this.waveIntroRoot.addChild(
      this.waveIntroAura,
      this.waveIntroPixels,
      this.waveIntroSweep,
      this.waveLevelText,
      this.waveCounterRoot,
      this.waveNameText
    );

    this.layers.overlay.addChild(
      this.maxShotScreenGlow,
      this.bossHealthRoot,
      this.waveIntroRoot,
      this.warningShade,
      this.warningFrame,
      this.warningRoot,
      this.phaseText,
      this.flashOverlay,
      this.scanlines,
      this.previewDebugOverlay
    );

    this.warningShade.visible = false;
    this.warningFrame.visible = false;
    this.phaseText.visible = false;
    this.flashOverlay.visible = false;
    this.maxShotScreenGlow.visible = false;

    await this.environment.init(this.width, this.height, environmentWindow);
    if (this.destroyed) return;
    this.resize(this.width, this.height);

    await this.textureBank.preload([...PIXI_GAMEPLAY_TEXTURE_URLS]);
    this.waveTitle.texture = this.textureBank.get(WAVE_TITLE_TEXTURE_URL) ?? Texture.WHITE;
    this.maxShotAura.texture = this.textureBank.get(ASSETS.POWERUP_MAX_SHOT_AURA_FRAMES[0])
      ?? this.textureBank.get(ASSETS.POWERUP_MAX_SHOT_AURA)
      ?? Texture.WHITE;
    this.bossHealthFrame.texture = this.textureBank.get(ASSETS.PIXI_BOSS_HEALTH_FRAME) ?? Texture.WHITE;
    this.warningBanner.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_FRAME) ?? Texture.WHITE;
    this.warningRing.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_RING) ?? Texture.WHITE;
    this.warningScan.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_SCAN) ?? Texture.WHITE;
    this.warningCrystal.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_CRYSTAL) ?? Texture.WHITE;
    this.effectPool.setExplosionTextures(
      ASSETS.PIXI_EXPLOSION_FRAMES
        .map((url) => this.textureBank.get(url))
        .filter((texture): texture is Texture => Boolean(texture))
    );
    this.effectPool.setBossExplosionTextures(
      ASSETS.PIXI_BOSS_DAMAGE_EXPLOSION_FRAMES
        .map((url) => this.textureBank.get(url))
        .filter((texture): texture is Texture => Boolean(texture))
    );
    if (this.destroyed) return;
    this.initialized = true;
  }

  get canvas() {
    return this.app.canvas;
  }

  resize(width: number, height: number) {
    if (this.destroyed) return;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    if (this.app.renderer) this.app.renderer.resize(this.width, this.height);

    this.flashOverlay.clear().rect(0, 0, this.width, this.height).fill({ color: '#f87171', alpha: 1 });
    this.environment.resize(this.width, this.height);
    this.drawScanlines();
    this.layoutWavePresentation();
  }

  setPreviewDebugOverlays(overlays: PreviewDebugOverlayState) {
    if (this.destroyed) return false;
    this.previewDebugOverlays = normalizePreviewDebugOverlays(overlays);
    if (!Object.values(this.previewDebugOverlays).some(Boolean)) {
      this.previewDebugOverlay.clear();
      this.previewDebugOverlay.visible = false;
    }
    return true;
  }

  setPreviewBossReferenceComparison(comparison: PreviewBossReferenceComparisonState) {
    if (this.destroyed || !this.previewBossArtwork?.modularReferenceComparison) return false;
    this.previewBossReferenceComparison = normalizePreviewBossReferenceComparison(comparison);
    return true;
  }

  async capturePngDataUrl(): Promise<string | null> {
    if (!this.initialized || this.destroyed || !this.app.renderer) return null;
    try {
      this.app.renderer.render(this.app.stage);
      const dataUrl = await this.app.renderer.extract.base64({
        target: this.app.stage,
        format: 'png'
      });
      return dataUrl.startsWith('data:image/png') ? dataUrl : null;
    } catch {
      return null;
    }
  }

  private transformModularDebugPoint(
    snapshot: ModularBossDebugSnapshot,
    x: number,
    y: number
  ) {
    const offsetX = x * snapshot.designScaleX;
    const offsetY = y * snapshot.designScaleY;
    const cosine = Math.cos(snapshot.rotation);
    const sine = Math.sin(snapshot.rotation);
    return {
      x: snapshot.centerX + offsetX * cosine - offsetY * sine,
      y: snapshot.centerY + offsetX * sine + offsetY * cosine
    };
  }

  private drawPreviewDebugPolygon(
    points: readonly { x: number; y: number }[],
    color: number,
    fillAlpha = 0
  ) {
    if (points.length < 3) return;
    this.previewDebugOverlay.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      this.previewDebugOverlay.lineTo(points[index].x, points[index].y);
    }
    this.previewDebugOverlay.closePath();
    if (fillAlpha > 0) {
      this.previewDebugOverlay.fill({ color, alpha: fillAlpha });
    }
    this.previewDebugOverlay.stroke({ color, width: 1.2, alpha: 0.9 });
  }

  private drawPreviewModularDiagnostics(snapshot: ModularBossDebugSnapshot) {
    const overlays = this.previewDebugOverlays;
    if (overlays.modularPartBounds) {
      for (const part of snapshot.hierarchy.parts) {
        if (!part.visible || !part.frame || !part.anchor) continue;
        const left = -part.anchor.x * part.frame.width;
        const top = -part.anchor.y * part.frame.height;
        const corners = [
          { x: left, y: top },
          { x: left + part.frame.width, y: top },
          { x: left + part.frame.width, y: top + part.frame.height },
          { x: left, y: top + part.frame.height }
        ].map((point) => this.transformModularDebugPoint(
          snapshot,
          part.worldTransform.a * point.x + part.worldTransform.c * point.y
            + part.worldTransform.tx,
          part.worldTransform.b * point.x + part.worldTransform.d * point.y
            + part.worldTransform.ty
        ));
        this.drawPreviewDebugPolygon(corners, 0xf472b6, 0.035);
      }
    }

    if (overlays.modularPivots) {
      for (const part of snapshot.hierarchy.parts) {
        const pivot = this.transformModularDebugPoint(
          snapshot,
          part.worldTransform.tx,
          part.worldTransform.ty
        );
        if (part.parentId) {
          const parent = snapshot.hierarchy.partById[part.parentId];
          if (parent) {
            const parentPivot = this.transformModularDebugPoint(
              snapshot,
              parent.worldTransform.tx,
              parent.worldTransform.ty
            );
            this.previewDebugOverlay
              .moveTo(parentPivot.x, parentPivot.y)
              .lineTo(pivot.x, pivot.y)
              .stroke({ color: 0x22d3ee, width: 1, alpha: 0.72 });
          }
        }
        this.previewDebugOverlay
          .circle(pivot.x, pivot.y, 3.5)
          .fill({ color: 0x22d3ee, alpha: 0.82 })
          .stroke({ color: 0xffffff, width: 1, alpha: 0.95 });
      }
    }

    if (overlays.weaponSockets) {
      for (const socket of snapshot.hierarchy.sockets) {
        const point = this.transformModularDebugPoint(
          snapshot,
          socket.worldX,
          socket.worldY
        );
        const color = socket.role === 'core-origin' ? 0xfacc15 : 0xa7f3d0;
        this.previewDebugOverlay
          .moveTo(point.x - 6, point.y)
          .lineTo(point.x + 6, point.y)
          .moveTo(point.x, point.y - 6)
          .lineTo(point.x, point.y + 6)
          .stroke({ color, width: 2, alpha: 0.95 });
        this.previewDebugOverlay
          .circle(point.x, point.y, 7)
          .stroke({ color, width: 1, alpha: 0.82 });
      }
    }
  }

  private drawPreviewBossCollision(engine: GameEngine, boss: Entity) {
    const mask = engine.getBossCollisionMask(boss);
    const centerX = boss.x + boss.width / 2;
    const centerY = boss.y + boss.height / 2;
    const rotation = boss.bossPresentationBankRadians;
    const transform = (localX: number, localY: number) => ({
      x: centerX + localX * Math.cos(rotation) - localY * Math.sin(rotation),
      y: centerY + localX * Math.sin(rotation) + localY * Math.cos(rotation)
    });
    this.drawPreviewDebugPolygon([
      transform(-boss.width / 2, -boss.height / 2),
      transform(boss.width / 2, -boss.height / 2),
      transform(boss.width / 2, boss.height / 2),
      transform(-boss.width / 2, boss.height / 2)
    ], 0xfbbf24, 0.025);

    if (mask) {
      const wordsPerRow = Math.ceil(mask.width / 32);
      const occupied = (column: number, row: number) => {
        const word = mask.rowWords[row * wordsPerRow + Math.floor(column / 32)] ?? 0;
        return (word & (1 << (column % 32))) !== 0;
      };
      const cellWidth = boss.width / Math.max(1, mask.width);
      const cellHeight = boss.height / Math.max(1, mask.height);
      for (let row = 0; row < mask.height; row += 1) {
        let runStart = -1;
        for (let column = 0; column <= mask.width; column += 1) {
          if (column < mask.width && occupied(column, row)) {
            if (runStart < 0) runStart = column;
            continue;
          }
          if (runStart < 0) continue;
          const left = runStart * cellWidth - boss.width / 2;
          const right = column * cellWidth - boss.width / 2;
          const top = row * cellHeight - boss.height / 2;
          const bottom = top + cellHeight;
          this.drawPreviewDebugPolygon([
            transform(left, top),
            transform(right, top),
            transform(right, bottom),
            transform(left, bottom)
          ], 0xfde047, 0.085);
          runStart = -1;
        }
      }
    }

    for (const component of boss.bossComponents ?? []) {
      if (component.destroyed) continue;
      const box = engine.getBossComponentBox(boss, component);
      this.previewDebugOverlay
        .rect(box.x, box.y, box.width, box.height)
        .fill({ color: 0xfb7185, alpha: 0.045 })
        .stroke({ color: 0xfb7185, width: 1.5, alpha: 0.92 });
    }
  }

  private getPreviewBossCoreOrigin(boss: Entity) {
    const snapshot = this.modularBossDebugSnapshot;
    const core = snapshot?.entityId === boss.id
      ? snapshot.hierarchy.sockets.find((socket) => socket.role === 'core-origin')
      : undefined;
    return core && snapshot
      ? this.transformModularDebugPoint(snapshot, core.worldX, core.worldY)
      : {
          x: boss.x + boss.width / 2,
          y: boss.y + boss.height * 0.62
        };
  }

  private drawPreviewSafeRegionGuide(engine: GameEngine, boss: Entity) {
    const action = boss.bossActionPresentation;
    const guide = resolvePreviewSafeRegionGuide(action?.primitiveId);
    if (!action || !guide) return;
    const color = 0x34d399;
    const origin = this.getPreviewBossCoreOrigin(boss);

    if (guide === 'gap') {
      const route = resolveBossGapRoute({
        arenaWidth: engine.width,
        arenaHeight: engine.height,
        originX: origin.x,
        originY: origin.y,
        sequence: action.sequence,
        direction: resolveBossGapRouteDirection(
          action.rotationDirection,
          action.sequence
        )
      });
      this.previewDebugOverlay
        .moveTo(origin.x, origin.y)
        .lineTo(route.x, route.y)
        .stroke({ color, width: 3, alpha: 0.82 });
      this.previewDebugOverlay
        .circle(route.x, route.y, Math.max(18, engine.width * 0.055))
        .fill({ color, alpha: 0.08 })
        .stroke({ color, width: 3, alpha: 0.95 });
      return;
    }

    if (guide === 'weave') {
      const layout = resolveBossWeaveWallLayout(
        engine.width,
        engine.mobileProfile,
        action.sequence
      );
      this.previewDebugOverlay
        .rect(
          layout.safeGapLeftX,
          Math.max(0, boss.y + boss.height * 0.55),
          layout.safeGapRightX - layout.safeGapLeftX,
          engine.height
        )
        .fill({ color, alpha: 0.08 })
        .stroke({ color, width: 2, alpha: 0.9 });
      return;
    }

    if (guide === 'side') {
      const safeOnLeft = action.side === 'starboard';
      const safeWidth = engine.width * 0.28;
      this.previewDebugOverlay
        .rect(
          safeOnLeft ? 0 : engine.width - safeWidth,
          Math.max(0, boss.y + boss.height * 0.45),
          safeWidth,
          engine.height
        )
        .fill({ color, alpha: 0.08 })
        .stroke({ color, width: 2, alpha: 0.9 });
      return;
    }

    const laneHalfWidth = Math.max(15, Math.min(engine.width, engine.height) * 0.035);
    const quadrants = [
      [0, 0, origin.x - laneHalfWidth, origin.y - laneHalfWidth],
      [origin.x + laneHalfWidth, 0, engine.width, origin.y - laneHalfWidth],
      [0, origin.y + laneHalfWidth, origin.x - laneHalfWidth, engine.height],
      [origin.x + laneHalfWidth, origin.y + laneHalfWidth, engine.width, engine.height]
    ] as const;
    for (const [left, top, right, bottom] of quadrants) {
      if (right <= left || bottom <= top) continue;
      this.previewDebugOverlay
        .rect(left, top, right - left, bottom - top)
        .fill({ color, alpha: 0.055 })
        .stroke({ color, width: 1.4, alpha: 0.65 });
    }
  }

  private syncPreviewDebugOverlay(engine: GameEngine) {
    const enabled = Object.values(this.previewDebugOverlays).some(Boolean);
    this.previewDebugOverlay.clear();
    this.previewDebugOverlay.visible = false;
    if (!enabled) return;
    const boss = [engine.bossRef, engine.miniBossRef]
      .find((candidate): candidate is Entity => Boolean(
        candidate && !candidate.markedForDeletion && candidate.hp > 0
      ))
      ?? engine.entities.find((entity) => (
        !entity.markedForDeletion
        && entity.hp > 0
        && (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS)
      ));
    if (!boss) return;

    this.previewDebugOverlay.position.set(engine.shakeX, engine.shakeY);
    const modular = this.modularBossDebugSnapshot;
    if (modular?.entityId === boss.id) this.drawPreviewModularDiagnostics(modular);
    if (this.previewDebugOverlays.bossCollision) {
      this.drawPreviewBossCollision(engine, boss);
    }
    if (this.previewDebugOverlays.safeRegions) {
      this.drawPreviewSafeRegionGuide(engine, boss);
    }
    this.previewDebugOverlay.visible = true;
  }

  private drawScanlines() {
    this.scanlines.clear();
    if (this.width < 340) return;
    for (let y = 0; y < this.height; y += 5) {
      this.scanlines.rect(0, y, this.width, 1).fill({ color: '#0ea5e9', alpha: 0.018 });
    }
  }

  private layoutWavePresentation() {
    const compact = this.width < 520;
    const introScale = clamp(this.width / 430, 0.78, 1.2);
    const titleWidth = compact ? 118 : 142;
    const titleHeight = compact ? 37 : 44;
    const glyphWidth = compact ? 28 : 33;
    const glyphHeight = compact ? 35 : 42;
    const gap = compact ? 7 : 10;
    const counterLength = Math.max(1, Math.min(this.currentWaveCounter.length, this.waveCounterGlyphs.length));
    const totalWidth = titleWidth + gap + counterLength * glyphWidth;

    this.waveIntroRoot.scale.set(introScale);
    this.waveIntroRoot.position.set(
      this.width / 2,
      this.height * (this.height > this.width * 1.25 ? 0.43 : 0.47)
    );
    this.waveLevelText.position.set(0, compact ? -55 : -64);
    this.waveNameText.position.set(0, compact ? 53 : 62);
    this.waveCounterRoot.position.set(0, 0);
    this.waveTitle.width = titleWidth;
    this.waveTitle.height = titleHeight;
    this.waveTitle.position.set(-totalWidth / 2 + titleWidth / 2, 0);

    for (let index = 0; index < this.waveCounterGlyphs.length; index++) {
      const glyph = this.waveCounterGlyphs[index];
      glyph.width = glyphWidth;
      glyph.height = glyphHeight;
      glyph.position.set(-totalWidth / 2 + titleWidth + gap + glyphWidth * (index + 0.5), 0);
    }

    this.waveLevelText.scale.set(1);
    this.waveNameText.scale.set(1);
    const localTextWidth = Math.min(330, this.width / introScale - 40);
    if (this.waveLevelText.width > localTextWidth) {
      this.waveLevelText.scale.set(localTextWidth / this.waveLevelText.width);
    }
    if (this.waveNameText.width > localTextWidth) {
      this.waveNameText.scale.set(localTextWidth / this.waveNameText.width);
    }
  }

  private setWaveCounterGlyphs(counter: string) {
    this.currentWaveCounter = counter.slice(0, this.waveCounterGlyphs.length);
    for (let index = 0; index < this.waveCounterGlyphs.length; index++) {
      const glyph = this.waveCounterGlyphs[index];
      const character = this.currentWaveCounter[index] as keyof typeof WAVE_GLYPH_TEXTURE_URLS | undefined;
      const textureUrl = character ? WAVE_GLYPH_TEXTURE_URLS[character] : undefined;
      glyph.visible = Boolean(textureUrl);
      if (textureUrl) glyph.texture = this.textureBank.get(textureUrl) ?? Texture.WHITE;
    }
    this.layoutWavePresentation();
  }

  private beginWavePresentation(state: GameRuntimeState) {
    this.lastWavePresentationRevision = state.wavePresentationRevision;
    this.lastWavePresentationKey = `${state.levelId}:${state.waveId}`;
    this.wavePresentationElapsedMs = 0;
    this.waveLevelText.text = `MISSION ${String(state.levelNumber).padStart(2, '0')} · ${state.levelName.toUpperCase()}`;
    this.waveNameText.text = state.waveName.toUpperCase();
    this.waveNameText.style.fill = state.waveAccent;
    this.setWaveCounterGlyphs(`${state.waveNumber}/${state.waveTotal}`);
    this.waveIntroRoot.visible = true;
  }

  private updateWavePresentation(engine: GameEngine, timestamp: number, deltaMs: number) {
    const state = engine.getRuntimeState();
    const presentationKey = `${state.levelId}:${state.waveId}`;
    if (
      state.wavePresentationRevision !== this.lastWavePresentationRevision
      || presentationKey !== this.lastWavePresentationKey
    ) {
      this.beginWavePresentation(state);
    }

    const duration = this.reducedMotion ? WAVE_INTRO_REDUCED_DURATION_MS : WAVE_INTRO_DURATION_MS;
    if (!engine.cinematicPaused) {
      this.wavePresentationElapsedMs = Math.min(duration, this.wavePresentationElapsedMs + deltaMs);
    }
    const age = this.wavePresentationElapsedMs;
    if (age >= duration) {
      this.waveIntroRoot.visible = false;
      this.waveIntroAura.clear();
      this.waveIntroPixels.clear();
      this.waveIntroSweep.clear();
      return;
    }

    const enterDuration = this.reducedMotion ? 160 : WAVE_INTRO_ENTER_MS;
    const exitStart = this.reducedMotion ? duration - 240 : WAVE_INTRO_HOLD_UNTIL_MS;
    const exitDuration = this.reducedMotion ? 240 : WAVE_INTRO_EXIT_MS;
    const enter = clamp(age / enterDuration, 0, 1);
    const dissolve = clamp((age - exitStart) / exitDuration, 0, 1);
    const finalFade = 1 - clamp((dissolve - 0.86) / 0.14, 0, 1);
    const visibility = this.reducedMotion
      ? Math.min(enter, 1 - dissolve)
      : Math.min(enter, finalFade);
    const easedEnter = 1 - Math.pow(1 - enter, 3);
    const baseY = this.height * (this.height > this.width * 1.25 ? 0.43 : 0.47);
    const jitterX = this.reducedMotion || enter >= 1
      ? 0
      : Math.round(Math.sin(age * 0.095) * (1 - enter) * 7);
    this.waveIntroRoot.visible = true;
    this.waveIntroRoot.alpha = visibility;
    this.waveIntroRoot.position.set(this.width / 2 + jitterX, baseY + Math.round((1 - easedEnter) * 18));

    this.waveIntroAura.clear();
    const auraPulse = this.reducedMotion ? 1 : 0.76 + Math.sin(timestamp * 0.006) * 0.24;
    const auraRetention = 1 - clamp(dissolve * 1.18, 0, 1);
    for (let band = 0; band < 5; band++) {
      const bandWidth = 150 + band * 54 + auraPulse * 12;
      const bandY = (band - 2) * 8;
      const color = band % 2 === 0 ? '#22d3ee' : '#4ade80';
      this.waveIntroAura.rect(-bandWidth / 2, bandY, bandWidth, 2).fill({
        color,
        alpha: visibility * auraRetention * (0.13 - band * 0.014)
      });
    }
    this.waveIntroAura
      .poly([-250, 0, -176, -26, -112, -26, -84, -42])
      .stroke({ color: '#22d3ee', width: 2, alpha: visibility * auraRetention * 0.38 });
    this.waveIntroAura
      .poly([250, 0, 176, 26, 112, 26, 84, 42])
      .stroke({ color: '#4ade80', width: 2, alpha: visibility * auraRetention * 0.34 });

    this.waveIntroPixels.clear();
    this.waveIntroPixels.visible = !this.reducedMotion;
    if (!this.reducedMotion) {
      const fragmentCount = this.width < 520
        ? WAVE_INTRO_FRAGMENT_COUNT_COMPACT
        : WAVE_INTRO_FRAGMENT_COUNT_FULL;
      for (let index = 0; index < fragmentCount; index++) {
        const column = (index * 7) % 17;
        const row = (index * 11) % 7;
        const normalizedX = column / 16;
        const targetX = -240 + normalizedX * 480 + ((index % 3) - 1) * 2;
        const targetY = -66 + (row / 6) * 132;
        const stagger = (index % 13) / 13;
        const localAssembly = clamp((enter - stagger * 0.32) / 0.46, 0, 1);
        const assembledEase = 1 - Math.pow(1 - localAssembly, 3);
        const assemblyTravel = 1 - assembledEase;
        const localDissolve = clamp((dissolve - normalizedX * 0.46) / 0.54, 0, 1);
        const entering = dissolve <= 0 && enter < 1;
        const x = entering
          ? targetX + Math.sin(index * 2.41) * (100 + (index % 7) * 21) * assemblyTravel
          : targetX + localDissolve * localDissolve * (92 + (index % 9) * 13);
        const y = entering
          ? targetY + Math.cos(index * 1.73) * (44 + (index % 5) * 12) * assemblyTravel
          : targetY + Math.sin(index * 1.37) * localDissolve * (24 + (index % 4) * 9);
        const size = 2 + (index % 3);
        const alpha = entering
          ? Math.sin(Math.PI * localAssembly) * 0.78
          : Math.sin(Math.PI * localDissolve) * 0.88;
        this.waveIntroPixels.rect(x - size / 2, y - size / 2, size, size).fill({
          color: index % 3 === 0 ? '#4ade80' : '#67e8f9',
          alpha: visibility * alpha
        });
      }
    }

    this.waveIntroSweep.clear();
    const sweepActive = !this.reducedMotion && (enter < 1 || dissolve > 0);
    this.waveIntroSweep.visible = sweepActive;
    if (sweepActive) {
      const sweepProgress = dissolve > 0 ? dissolve : enter;
      const sweepX = -270 + sweepProgress * 540;
      const sweepAlpha = Math.sin(Math.PI * sweepProgress) * visibility;
      const trailDirection = dissolve > 0 ? 1 : -1;
      this.waveIntroSweep.rect(sweepX, -72, 3, 144).fill({ color: '#ffffff', alpha: sweepAlpha * 0.52 });
      this.waveIntroSweep.rect(sweepX - trailDirection * 11, -58, 2, 116).fill({
        color: '#22d3ee',
        alpha: sweepAlpha * 0.42
      });
      for (let streak = 0; streak < 5; streak++) {
        const streakWidth = 34 + streak * 13;
        const streakY = -48 + streak * 24;
        this.waveIntroSweep.rect(
          sweepX - trailDirection * streakWidth,
          streakY,
          streakWidth,
          1 + (streak % 2)
        ).fill({ color: streak % 2 === 0 ? '#67e8f9' : '#4ade80', alpha: sweepAlpha * 0.28 });
      }
    }

    const assembly = this.reducedMotion ? enter : clamp(age / WAVE_INTRO_ENTER_MS, 0, 1);
    const centerRetention = 1 - clamp((dissolve - 0.24) / 0.5, 0, 1);
    const titleRetention = 1 - clamp((dissolve - 0.02) / 0.42, 0, 1);
    this.waveLevelText.alpha = clamp((assembly - 0.04) / 0.24, 0, 1) * centerRetention;
    this.waveTitle.alpha = clamp((assembly - 0.1) / 0.22, 0, 1) * titleRetention;
    this.waveNameText.alpha = clamp((assembly - 0.48) / 0.28, 0, 1) * centerRetention;
    for (let index = 0; index < this.waveCounterGlyphs.length; index++) {
      const glyph = this.waveCounterGlyphs[index];
      const glyphAssembly = clamp((assembly - 0.24 - index * 0.055) / 0.2, 0, 1);
      const glyphSweepPosition = clamp((glyph.x + 270) / 540, 0, 1);
      const glyphRetention = 1 - clamp((dissolve - glyphSweepPosition * 0.5) / 0.5, 0, 1);
      glyph.alpha = glyphAssembly * glyphRetention;
      glyph.y = (1 - glyphAssembly) * (index % 2 === 0 ? -9 : 9)
        + (1 - glyphRetention) * (index % 2 === 0 ? -5 : 5);
    }
  }

  private resetArticulatedBossRig(rig: ArticulatedBossRigView) {
    rig.railSerpent.root.visible = false;
    rig.railSerpent.root.position.set(0, 0);
    rig.railSerpent.root.rotation = 0;
    rig.railSerpent.root.scale.set(1);
    for (const partId of RAIL_SERPENT_RIG_PART_IDS) {
      const sprite = rig.railSerpent.parts[partId];
      sprite.visible = false;
      sprite.filters = null;
      sprite.position.set(0, 0);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
    }

    rig.prismMoth.root.visible = false;
    rig.prismMoth.root.position.set(0, 0);
    rig.prismMoth.root.rotation = 0;
    rig.prismMoth.root.scale.set(1);
    for (const partId of PRISM_MOTH_RIG_PART_IDS) {
      const sprite = rig.prismMoth.parts[partId];
      sprite.visible = false;
      sprite.filters = null;
      sprite.position.set(0, 0);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
    }
  }

  private resetPreviewBossAtlasRig(rig: PreviewBossAtlasRigView | undefined) {
    if (!rig) return;
    rig.root.visible = false;
    rig.root.position.set(0, 0);
    rig.root.rotation = 0;
    rig.root.scale.set(1);
    rig.root.filters = null;
    const parts = getPreviewBossRigParts(rig);
    for (const partId of getPreviewBossRigPartIds(rig.kind)) {
      const sprite = parts[partId];
      if (!sprite) continue;
      sprite.visible = false;
      sprite.filters = null;
      sprite.position.set(0, 0);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.texture = Texture.WHITE;
    }
  }

  private resetModularPreviewBossRig(rig: ModularPreviewBossRigView | undefined) {
    if (!rig) return;
    rig.root.visible = false;
    rig.root.position.set(0, 0);
    rig.root.pivot.set(0, 0);
    rig.root.rotation = 0;
    rig.root.scale.set(1);
    rig.root.filters = null;
    if (rig.referenceComparison) {
      rig.referenceComparison.sprite.visible = false;
      rig.referenceComparison.sprite.alpha = 1;
      rig.referenceComparison.sprite.position.set(0, 0);
      rig.referenceComparison.sprite.rotation = 0;
      rig.referenceComparison.sprite.scale.set(1);
      rig.referenceComparison.sprite.texture = Texture.WHITE;
      rig.referenceComparison.landmarks.clear();
      rig.referenceComparison.landmarks.visible = false;
    }
    for (const sprite of Object.values(rig.partSprites)) {
      sprite.visible = false;
      sprite.filters = null;
      sprite.position.set(0, 0);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.tint = '#ffffff';
      sprite.texture = Texture.WHITE;
    }
  }

  private resetDamagePresentationTracking(view: EntityView, entity: Entity) {
    view.lastDamageFlashFrame = entity.lastDamageFlashFrame;
    view.lastComponentDamageFrames['left-cannon'] = -999;
    view.lastComponentDamageFrames['right-cannon'] = -999;
    view.lastComponentDamageFrames.helmet = -999;
    for (const component of entity.bossComponents ?? []) {
      view.lastComponentDamageFrames[component.id] = component.lastDamageFlashFrame;
    }
    view.damageRecoilFrame = -999;
    view.damageRecoilDirection = 0;
    view.damageRecoilStrength = 0;
  }

  private createEntityView(entity: Entity) {
    const pool = this.recycledViews.get(entity.type);
    const reused = pool?.pop();
    if (reused) {
      reused.id = entity.id;
      reused.root.visible = true;
      reused.root.alpha = 1;
      reused.sprite.filters = null;
      reused.projectileCopies?.forEach((sprite) => {
        sprite.visible = false;
        sprite.filters = null;
      });
      reused.body.filters = null;
      reused.textureKey = null;
      reused.textureRequest++;
      reused.lastHp = entity.hp;
      reused.lastFlashFrames = 0;
      this.resetDamagePresentationTracking(reused, entity);
      reused.lastMarkedForDeletion = false;
      reused.hasFallbackBody = false;
      if (reused.bossRig) {
        reused.bossRig.parts.filters = null;
        reused.bossRig.parts.visible = false;
        reused.bossRig.thrust.visible = false;
        reused.bossRig.componentHealth.clear();
        reused.bossRig.crownClaw.root.filters = null;
        reused.bossRig.crownClaw.root.visible = false;
        this.resetArticulatedBossRig(reused.bossRig.articulated);
        this.resetPreviewBossAtlasRig(reused.bossRig.previewAtlas);
        this.resetModularPreviewBossRig(reused.bossRig.modularPreview);
        Object.values(reused.bossRig.partSprites).forEach((sprite) => {
          sprite.filters = null;
        });
        reused.bossRig.crownClaw.body.filters = null;
        Object.values(reused.bossRig.crownClaw.legs).forEach((sprite) => {
          sprite.filters = null;
        });
        Object.values(reused.bossRig.crownClaw.guns).forEach((sprite) => {
          sprite.filters = null;
        });
        Object.values(reused.bossRig.crownClaw.claws).forEach((sprite) => {
          sprite.filters = null;
        });
      }
      return reused;
    }

    const root = new Container();
    const trail = new Graphics();
    const aura = new Graphics();
    const sprite = new Sprite(Texture.WHITE);
    const body = new Graphics();
    const flash = new Graphics();
    const health = new Graphics();
    const label = createText(11, '#ffffff');
    const bossRig = entity.type === EntityType.BOSS ? (() => {
      const parts = new Container();
      const leftCannon = new Sprite(Texture.WHITE);
      const rightCannon = new Sprite(Texture.WHITE);
      const helmet = new Sprite(Texture.WHITE);
      const thrust = new Container();
      const leftThruster = new Sprite(Texture.WHITE);
      const rightThruster = new Sprite(Texture.WHITE);
      const componentHealth = new Graphics();
      const crownRoot = new Container();
      const crownBody = new Sprite(Texture.WHITE);
      const crownLegs = Object.fromEntries(
        Object.keys(ASSETS.PIXI_BOSS_CROWNCLAW_LEGS).map((key) => [key, new Sprite(Texture.WHITE)])
      ) as Record<CrownClawLegId, Sprite>;
      const crownGuns = {
        left: new Sprite(Texture.WHITE),
        right: new Sprite(Texture.WHITE)
      };
      const crownClaws = {
        left: new Sprite(Texture.WHITE),
        right: new Sprite(Texture.WHITE)
      };
      const articulated: ArticulatedBossRigView = {
        railSerpent: createRailSerpentRigView(),
        prismMoth: createPrismMothRigView()
      };
      const previewAtlasKind = this.previewBossArtwork?.articulatedAtlas?.kind;
      const previewAtlas = previewAtlasKind
        ? createPreviewBossAtlasRigView(previewAtlasKind)
        : undefined;
      const modularPreview = this.previewBossArtwork?.modularRig
        ? createModularPreviewBossRigView(
            this.previewBossArtwork.modularRig,
            Boolean(this.previewBossArtwork.modularReferenceComparison)
          )
        : undefined;
      leftCannon.anchor.set(0.5);
      rightCannon.anchor.set(0.5);
      helmet.anchor.set(0.5);
      leftThruster.anchor.set(0.5, 0);
      rightThruster.anchor.set(0.5, 0);
      thrust.addChild(leftThruster, rightThruster);
      parts.addChild(leftCannon, rightCannon, helmet);
      parts.visible = false;
      thrust.visible = false;
      crownRoot.eventMode = 'none';
      crownRoot.visible = false;
      for (const [key, leg] of Object.entries(crownLegs) as [CrownClawLegId, Sprite][]) {
        const layout = CROWNCLAW_LEG_LAYOUT[key];
        leg.anchor.set(0);
        leg.pivot.set(layout.pivotX, layout.pivotY);
        leg.position.set(layout.x, layout.y);
        crownRoot.addChild(leg);
      }
      for (const side of ['left', 'right'] as const) {
        const layout = CROWNCLAW_WEAPON_LAYOUT[side];
        crownGuns[side].anchor.set(0);
        crownGuns[side].pivot.set(layout.pivotX, layout.pivotY);
        crownGuns[side].position.set(layout.x, layout.y);
        crownClaws[side].anchor.set(0);
        crownClaws[side].pivot.set(layout.pivotX, layout.pivotY);
        crownClaws[side].position.set(layout.x, layout.y);
        crownRoot.addChild(crownGuns[side], crownClaws[side]);
      }
      crownBody.anchor.set(0);
      crownBody.position.set(-320, -320);
      crownRoot.addChild(crownBody);
      return {
        parts,
        partSprites: {
          'left-cannon': leftCannon,
          'right-cannon': rightCannon,
          helmet
        },
        thrust,
        thrusterSprites: [leftThruster, rightThruster],
        componentHealth,
        crownClaw: {
          root: crownRoot,
          body: crownBody,
          legs: crownLegs,
          guns: crownGuns,
          claws: crownClaws
        },
        articulated,
        previewAtlas,
        modularPreview
      } satisfies BossRigView;
    })() : undefined;
    sprite.anchor.set(0.5);
    label.anchor.set(0.5);
    root.addChild(trail, aura);
    if (bossRig) root.addChild(bossRig.thrust);
    if (bossRig) root.addChild(bossRig.crownClaw.root);
    if (bossRig) root.addChild(bossRig.articulated.railSerpent.root, bossRig.articulated.prismMoth.root);
    if (bossRig?.previewAtlas) root.addChild(bossRig.previewAtlas.root);
    if (bossRig?.modularPreview) root.addChild(bossRig.modularPreview.root);
    root.addChild(sprite);
    if (bossRig) root.addChild(bossRig.parts, bossRig.componentHealth);
    root.addChild(body, flash, health, label);
    root.eventMode = 'none';
    const view: EntityView = {
      id: entity.id,
      type: entity.type,
      root,
      trail,
      aura,
      sprite,
      body,
      flash,
      health,
      label,
      textureKey: null,
      textureRequest: 0,
      lastHp: entity.hp,
      lastFlashFrames: 0,
      lastDamageFlashFrame: entity.lastDamageFlashFrame,
      lastComponentDamageFrames: {
        'left-cannon': -999,
        'right-cannon': -999,
        helmet: -999
      },
      damageRecoilFrame: -999,
      damageRecoilDirection: 0,
      damageRecoilStrength: 0,
      lastMarkedForDeletion: false,
      hasFallbackBody: false,
      bossRig,
      seenFrame: this.renderFrame
    };
    this.resetDamagePresentationTracking(view, entity);
    this.layers[getEntityLayer(entity.type)].addChild(root);
    return view;
  }

  private releaseEntityView(view: EntityView) {
    view.root.visible = false;
    view.sprite.texture = Texture.WHITE;
    view.sprite.filters = null;
    view.body.filters = null;
    view.textureKey = null;
    view.textureRequest++;
    view.trail.clear();
    view.aura.clear();
    view.body.clear();
    view.flash.clear();
    view.health.clear();
    view.label.text = '';
    view.hasFallbackBody = false;
    if (view.bossRig) {
      view.bossRig.parts.filters = null;
      view.bossRig.parts.visible = false;
      view.bossRig.thrust.visible = false;
      view.bossRig.componentHealth.clear();
      view.bossRig.crownClaw.root.filters = null;
      view.bossRig.crownClaw.root.visible = false;
      this.resetArticulatedBossRig(view.bossRig.articulated);
      this.resetPreviewBossAtlasRig(view.bossRig.previewAtlas);
      this.resetModularPreviewBossRig(view.bossRig.modularPreview);
      Object.values(view.bossRig.partSprites).forEach((sprite) => {
        sprite.filters = null;
      });
      view.bossRig.crownClaw.body.filters = null;
      Object.values(view.bossRig.crownClaw.legs).forEach((sprite) => {
        sprite.filters = null;
      });
      Object.values(view.bossRig.crownClaw.guns).forEach((sprite) => {
        sprite.filters = null;
      });
      Object.values(view.bossRig.crownClaw.claws).forEach((sprite) => {
        sprite.filters = null;
      });
    }
    const pool = this.recycledViews.get(view.type) ?? [];
    pool.push(view);
    this.recycledViews.set(view.type, pool);
  }

  private setTexture(view: EntityView, key: string | null) {
    if (!key) {
      view.sprite.visible = false;
      if (view.textureKey !== null) {
        view.textureKey = null;
        view.textureRequest++;
      }
      return;
    }

    if (view.textureKey === key) {
      const cached = this.textureBank.get(key);
      if (cached) {
        view.sprite.texture = cached;
        view.sprite.visible = true;
      }
      return;
    }

    view.textureKey = key;
    const request = ++view.textureRequest;
    const ready = this.textureBank.get(key);
    if (ready) {
      view.sprite.texture = ready;
      view.sprite.visible = true;
      return;
    }
    view.sprite.visible = false;
    this.textureBank.load(key).then((texture) => {
      if (this.destroyed || view.textureRequest !== request || view.textureKey !== key) return;
      view.sprite.texture = texture;
      view.sprite.visible = true;
    }).catch(() => {
      if (view.textureRequest === request) view.sprite.visible = false;
    });
  }

  private ensureProjectileCopySprites(view: EntityView, visualRoundCount: number) {
    const requiredCopies = Math.max(0, visualRoundCount - 1);
    const copies = view.projectileCopies ?? [];
    view.projectileCopies = copies;
    while (copies.length < requiredCopies) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.eventMode = 'none';
      sprite.visible = false;
      view.root.addChildAt(sprite, view.root.getChildIndex(view.body));
      copies.push(sprite);
    }
    copies.forEach((sprite, index) => {
      sprite.visible = index < requiredCopies;
    });
    return copies;
  }

  private drawHealthBar(view: EntityView, entity: Entity) {
    view.health.clear();
    view.label.text = '';

    const width = entity.isElite ? clamp(entity.width * 0.86, 42, 92) : entity.width;
    const y = -entity.height * 0.5 - (entity.isElite ? 12 : 18);
    const progress = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    view.health.roundRect(-width / 2, y, width, 8, 4).fill({ color: '#020617', alpha: 0.94 });
    view.health.roundRect(-width / 2 + 1, y + 1, Math.max(0, (width - 2) * progress), 6, 3)
      .fill(progress > 0.55 ? '#34d399' : progress > 0.25 ? '#facc15' : '#fb7185');
    view.health.roundRect(-width / 2, y, width, 8, 4).stroke({ color: '#bae6fd', width: 1, alpha: 0.75 });

    if (entity.type === EntityType.MINI_BOSS) {
      view.label.text = 'BOTTLENECK DRONE';
      view.label.style.fill = '#fda4af';
      view.label.position.set(0, y - 13);
    }
  }

  private drawFallbackBody(view: EntityView, entity: Entity) {
    if (view.sprite.visible) {
      if (view.hasFallbackBody) {
        view.body.clear();
        view.hasFallbackBody = false;
      }
      return;
    }
    if (view.hasFallbackBody) return;
    view.body.clear();
    const w = entity.width;
    const h = entity.height;
    if (entity.type === EntityType.PARTICLE) {
      view.body.rect(-w / 2, -h / 2, w, h).fill(entity.color);
      return;
    }
    if (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE) {
      return;
    }
    view.body.moveTo(0, -h * 0.5).lineTo(w * 0.45, h * 0.32).lineTo(0, h * 0.18).lineTo(-w * 0.45, h * 0.32).closePath();
    view.body.fill(entity.color || '#67e8f9');
    view.body.stroke({ color: '#ffffff', width: 1.5, alpha: 0.7 });
    view.hasFallbackBody = true;
  }

  private getPreviewBossModularProjectileTexture(entity: Entity, engineFrame: number) {
    if (
      !this.modularPreviewBossReady
      || !entity.bossOwnerId
      || entity.bossOwnerId !== this.previewBossRuntimeEntityId
      || entity.isBeam
    ) {
      return undefined;
    }
    const projectileAnimations = this.previewBossArtwork?.projectileAnimations;
    const modularRig = this.previewBossArtwork?.modularRig;
    const visualKind = String(entity.projectileVisualKind ?? '');
    if (!projectileAnimations || !modularRig) return undefined;
    const animation = Object.prototype.hasOwnProperty.call(projectileAnimations, visualKind)
      ? projectileAnimations[visualKind as keyof typeof projectileAnimations]
      : undefined;
    if (
      !animation
      || !Array.isArray(animation.frameIds)
      || animation.frameIds.length === 0
      || !Number.isFinite(animation.frameHoldFrames)
      || animation.frameHoldFrames < 1
      || !Number.isFinite(animation.minimumVisualHeight)
      || animation.minimumVisualHeight < 1
      || !Number.isFinite(animation.entityHeightScale)
      || animation.entityHeightScale <= 0
      || !Number.isFinite(animation.orientationOffsetRadians)
      || !animation.frameIds.every((frameId) => (
        typeof frameId === 'string'
        && Boolean(modularRig.frameById[frameId])
        && Boolean(this.getModularPreviewBossTexture(frameId))
      ))
    ) {
      return undefined;
    }
    const age = Math.max(0, engineFrame - entity.weaponVisualStartFrame);
    const frameHold = Math.max(1, Math.floor(animation.frameHoldFrames));
    const frameIndex = entity.projectileAnimationMode === 'hold-last'
      ? animation.frameIds.length - 1
      : entity.projectileAnimationMode === 'play-once-before-last'
        ? Math.min(
            Math.max(0, animation.frameIds.length - 2),
            Math.floor(age / frameHold)
          )
      : (
          Math.floor(age / frameHold)
          + Math.abs(Math.floor(entity.variant))
        ) % animation.frameIds.length;
    const frameId = animation.frameIds[frameIndex];
    const frame = modularRig.frameById[frameId];
    const texture = this.getModularPreviewBossTexture(frameId);
    return texture && frame ? { texture, frame, animation } : undefined;
  }

  private getPreviewBossPodTexture(entity: Entity) {
    if (
      String(entity.projectileVisualKind ?? '') !== 'boss-pod'
      && String(entity.projectileVisualKind ?? '') !== 'boss-eye-comet'
    ) {
      return undefined;
    }
    if (
      !entity.bossOwnerId
      || entity.bossOwnerId !== this.previewBossRuntimeEntityId
    ) {
      return undefined;
    }
    const modularRig = this.previewBossArtwork?.modularRig;
    if (modularRig && this.modularPreviewBossReady) {
      const podSide = entity.bossPodSide;
      const partId = podSide === 'right'
        ? 'pod.starboard'
        : podSide === 'left'
          ? 'pod.port'
          : Math.abs(Math.floor(entity.variant)) % 2 === 0
            ? 'pod.port'
            : 'pod.starboard';
      const part = modularRig.partById[partId];
      const frameId = part?.frameId;
      const frame = frameId ? modularRig.frameById[frameId] : undefined;
      const texture = frameId ? this.getModularPreviewBossTexture(frameId) : undefined;
      if (texture && frame) return { texture, frame };
    }
    if (!this.previewBossAtlasReady) return undefined;
    const atlas = this.previewBossArtwork?.articulatedAtlas;
    if (!atlas) return undefined;
    const podSide = entity.bossPodSide;
    const [leftPartId, rightPartId] = getPreviewBossProjectilePartIds(atlas.kind);
    const partId = podSide === 'right'
      ? rightPartId
      : podSide === 'left'
        ? leftPartId
        : Math.abs(Math.floor(entity.variant)) % 2 === 0
          ? leftPartId
          : rightPartId;
    const texture = this.getPreviewBossAtlasTexture(partId);
    const frame = atlas.frames[partId as keyof typeof atlas.frames];
    return texture && frame ? { texture, frame } : undefined;
  }

  private getPreviewBossProjectileVfxTexture(entity: Entity, engineFrame: number) {
    if (
      !this.previewBossVfxReady
      || !entity.bossOwnerId
      || entity.bossOwnerId !== this.previewBossRuntimeEntityId
      || entity.isBeam
    ) {
      return undefined;
    }
    const prefix = entity.projectileVisualKind === 'boss-pixel-pink'
      ? 'pinkDrop'
      : entity.projectileVisualKind === 'boss-pixel-gold'
        ? 'goldDrop'
        : entity.projectileVisualKind === 'boss-pixel-prism'
          ? 'prismDrop'
          : null;
    if (!prefix) return undefined;
    const age = Math.max(0, engineFrame - entity.weaponVisualStartFrame);
    const frameIndex = (Math.floor(age / 4) + Math.abs(Math.floor(entity.variant))) % 4;
    const frameId = `${prefix}${frameIndex}` as PreviewBossVfxFrameId;
    const texture = this.getPreviewBossVfxTexture(frameId);
    return texture ? { texture, frameId } : undefined;
  }

  private drawProjectile(view: EntityView, entity: Entity, engine: GameEngine) {
    const engineFrame = engine.frameCount;
    view.body.clear();
    view.trail.clear();
    view.aura.clear();
    view.sprite.visible = false;
    view.sprite.position.set(0, 0);
    view.sprite.rotation = 0;
    view.projectileCopies?.forEach((sprite) => {
      sprite.visible = false;
      sprite.position.set(0, 0);
      sprite.rotation = 0;
    });
    view.root.rotation = 0;
    const playerShot = entity.isPlayerShot;
    const color = entity.color || (playerShot ? '#67e8f9' : '#fb7185');
    const modularProjectile = this.getPreviewBossModularProjectileTexture(entity, engineFrame);
    if (modularProjectile) {
      if (view.textureKey !== null) {
        view.textureKey = null;
        view.textureRequest++;
      }
      const visualHeight = Math.max(
        modularProjectile.animation.minimumVisualHeight,
        Math.max(entity.width, entity.height) * modularProjectile.animation.entityHeightScale
      );
      view.sprite.texture = modularProjectile.texture;
      view.sprite.visible = true;
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      view.sprite.height = visualHeight;
      view.sprite.width = visualHeight * (
        modularProjectile.frame.width / Math.max(1, modularProjectile.frame.height)
      );
      view.root.rotation = Math.atan2(entity.vy, entity.vx)
        + modularProjectile.animation.orientationOffsetRadians;
      return;
    }
    const previewBossProjectileVfx = this.getPreviewBossProjectileVfxTexture(entity, engineFrame);
    if (previewBossProjectileVfx) {
      if (view.textureKey !== null) {
        view.textureKey = null;
        view.textureRequest++;
      }
      const visualHeight = entity.projectileVisualKind === 'boss-pixel-pink'
        ? Math.max(26, entity.height * 2.25)
        : Math.max(30, entity.height * 1.55);
      view.sprite.texture = previewBossProjectileVfx.texture;
      view.sprite.visible = true;
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      view.sprite.height = visualHeight;
      view.sprite.width = visualHeight * (
        previewBossProjectileVfx.texture.width
        / Math.max(1, previewBossProjectileVfx.texture.height)
      );
      view.root.rotation = Math.atan2(entity.vy, entity.vx) - Math.PI / 2;
      return;
    }
    const previewBossPod = this.getPreviewBossPodTexture(entity);
    if (previewBossPod) {
      const aspectRatio = previewBossPod.frame.width
        / Math.max(1, previewBossPod.frame.height);
      const eyeComet = entity.projectileVisualKind === 'boss-eye-comet';
      const visualHeight = eyeComet
        ? Math.max(42, Math.max(entity.width, entity.height) * 1.55)
        : Math.max(34, Math.max(entity.width, entity.height) * 2.1);
      if (view.textureKey !== null) {
        view.textureKey = null;
        view.textureRequest++;
      }
      view.sprite.texture = previewBossPod.texture;
      view.sprite.visible = true;
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      view.sprite.height = visualHeight;
      view.sprite.width = visualHeight * aspectRatio;
      view.root.rotation = Math.atan2(entity.vy, entity.vx) - Math.PI / 2;
      if (eyeComet) {
        view.aura.ellipse(0, visualHeight * 0.12, view.sprite.width * 0.78, visualHeight * 0.64)
          .fill({ color: '#f43f5e', alpha: 0.18 });
        view.trail.moveTo(0, -visualHeight * 0.08).lineTo(0, -visualHeight * 0.72)
          .stroke({ color: '#c026d3', width: Math.max(3, view.sprite.width * 0.18), alpha: 0.44 });
      }
      return;
    }
    if (entity.projectileVisualKind && entity.spriteFrames?.length) {
      const isShipAbility = entity.projectileVisualKind === 'research-charge'
        || entity.projectileVisualKind === 'bio-genome-lance'
        || entity.projectileVisualKind === 'eth-prism-volley'
        || entity.projectileVisualKind === 'btc-hash-burst';
      const isOneShotAnimation = entity.spriteFramePlaybackMode === 'once';
      const age = isShipAbility || isOneShotAnimation
        ? Math.max(0, engineFrame - entity.weaponVisualStartFrame)
        : Math.max(0, entity.maxLife - entity.life);
      const frameDelay = Math.max(
        1,
        entity.spriteFrameHoldFrames
          ?? (entity.projectileVisualKind === 'boss-ray' || isShipAbility ? 4 : 3)
      );
      const textureIndex = isOneShotAnimation
        ? Math.min(entity.spriteFrames.length - 1, Math.floor(age / frameDelay))
        : (Math.floor(age / frameDelay) + entity.variant) % entity.spriteFrames.length;
      const textureKey = entity.spriteFrames[textureIndex];
      this.setTexture(view, textureKey);
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      view.sprite.width = entity.width;
      view.sprite.height = entity.height;
      if (entity.projectileVisualKind === 'research-charge') {
        // The soft pooled light supplies the aura. Keeping the projectile
        // graphics free of circles prevents a hard-edged "bubble" around the
        // blast while these short additive streaks sell its forward motion.
        const reducedTrail = this.reducedMotion
          || engine.performanceMode
          || !engine.polishSettings.highDensityParticles;
        const trailSegmentCount = reducedTrail
          ? RESEARCH_CHARGE_TRAIL_SEGMENTS_REDUCED
          : engine.mobileProfile
            ? RESEARCH_CHARGE_TRAIL_SEGMENTS_MOBILE
            : RESEARCH_CHARGE_TRAIL_SEGMENTS_DESKTOP;
        const trailFade = clamp(age / 7, 0, 1) * clamp(entity.life / 10, 0, 1);
        view.trail.blendMode = 'add';
        for (let segment = 0; segment < trailSegmentCount; segment++) {
          const depth = (segment + 1) / trailSegmentCount;
          const startX = -entity.width * (0.54 + segment * 0.3);
          const segmentLength = entity.width * (0.17 + depth * 0.15);
          const offsetY = Math.sin(engineFrame * 0.16 + entity.variant * 0.7 + segment * 1.9)
            * entity.height * 0.055;
          view.trail
            .moveTo(startX, offsetY)
            .lineTo(startX - segmentLength, offsetY)
            .stroke({
              color: segment % 2 === 0 ? '#a7f3d0' : '#67e8f9',
              width: Math.max(1, entity.height * (0.07 - depth * 0.025)),
              alpha: trailFade * (0.4 - depth * 0.24)
            });
        }
        view.root.rotation = -Math.PI / 2;
      } else if (entity.projectileVisualKind === 'bio-genome-lance') {
        view.aura.roundRect(-entity.width * 0.62, -entity.height * 0.52, entity.width * 1.24, entity.height * 1.04, entity.width * 0.4)
          .fill({ color: '#4ade80', alpha: 0.16 });
        view.aura.roundRect(-entity.width * 0.32, -entity.height * 0.5, entity.width * 0.64, entity.height, entity.width * 0.28)
          .stroke({ color: '#bbf7d0', width: 2, alpha: 0.78 });
      } else if (entity.projectileVisualKind === 'eth-prism-volley') {
        const pulse = 0.68 + Math.sin((engineFrame + entity.variant * 3) * 0.2) * 0.1;
        view.aura.circle(0, 0, entity.width * pulse).fill({ color: '#8b5cf6', alpha: 0.18 });
        view.aura.circle(0, 0, entity.width * 0.56).stroke({ color: '#ddd6fe', width: 1.5, alpha: 0.76 });
        view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      } else if (entity.projectileVisualKind === 'btc-hash-burst') {
        const pulse = 0.72 + Math.sin(engineFrame * 0.16) * 0.09;
        view.aura.circle(0, 0, entity.width * pulse).fill({ color: '#facc15', alpha: 0.16 });
        view.aura.circle(0, 0, entity.width * 0.58).stroke({ color: '#67e8f9', width: 2, alpha: 0.7 });
      } else if (entity.spriteFrameFixedRotationRadians !== undefined) {
        // Explosion pixels are the complete warning and damage surface. Do not
        // add a translucent circle or velocity rotation around the authored art.
        view.root.rotation = entity.spriteFrameFixedRotationRadians;
      } else if (entity.projectileVisualKind === 'boss-ray') {
        view.aura.roundRect(-entity.width * 0.7, -entity.height * 0.5, entity.width * 1.4, entity.height, entity.width * 0.38)
          .fill({ color: '#ff9d2e', alpha: 0.18 });
        view.aura.roundRect(-entity.width * 0.34, -entity.height * 0.5, entity.width * 0.68, entity.height, entity.width * 0.24)
          .stroke({ color: '#fef08a', width: 2, alpha: 0.72 });
      } else {
        const isCrownClaw = entity.projectileVisualKind === 'crown-claw-left'
          || entity.projectileVisualKind === 'crown-claw-right';
        if (!isCrownClaw) {
          view.aura.circle(0, 0, entity.width * 0.72).fill({ color: '#ff9d2e', alpha: 0.25 });
          view.aura.circle(0, 0, entity.width * 0.54).stroke({ color: '#fef08a', width: 1.5, alpha: 0.82 });
        }
        view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      }
      return;
    }
    if (entity.isBeam) {
      const width = entity.width;
      const height = entity.height;
      const cornerAmbushBeam = entity.isCornerAmbushBeam
        && entity.bossOwnerId === this.cornerAmbushBossId;
      if (entity.beamAngleRadians !== null) {
        view.root.rotation = entity.beamAngleRadians;
      }
      const radius = Math.min(10, Math.min(width, height) * 0.45);
      if (entity.isTelegraph) {
        view.aura.roundRect(-width / 2, -height / 2, width, height, radius)
          .fill({ color, alpha: 0.08 });
        view.body.roundRect(-width / 2, -height / 2, width, height, radius)
          .stroke({ color, width: Math.max(1.5, Math.min(width, height) * 0.22), alpha: 0.82 });
      } else {
        view.aura.roundRect(-width / 2, -height / 2, width, height, radius)
          .fill({ color, alpha: cornerAmbushBeam ? 0.44 : 0.28 });
        const beamTexture = entity.bossOwnerId === this.previewBossRuntimeEntityId
          ? this.getPreviewBossVfxTexture('beamLive')
          : undefined;
        const impactTexture = entity.bossOwnerId === this.previewBossRuntimeEntityId
          ? this.getPreviewBossVfxTexture('beamImpact')
          : undefined;
        if (beamTexture) {
          if (view.textureKey !== null) {
            view.textureKey = null;
            view.textureRequest++;
          }
          view.sprite.texture = beamTexture;
          view.sprite.visible = true;
          view.sprite.tint = '#ffffff';
          view.sprite.alpha = cornerAmbushBeam
            ? 0.96 + Math.sin(engineFrame * 0.42) * 0.04
            : 0.82 + Math.sin(engineFrame * 0.42) * 0.12;
          view.sprite.width = Math.max(8, height * 1.45);
          view.sprite.height = width;
          view.sprite.rotation = Math.PI / 2;
          if (impactTexture) {
            const impacts = this.ensureProjectileCopySprites(view, 3);
            impacts.forEach((impact, index) => {
              impact.texture = impactTexture;
              impact.visible = true;
              impact.tint = '#ffffff';
              impact.alpha = 0.72 + Math.sin(engineFrame * 0.36 + index) * 0.14;
              impact.width = Math.max(38, height * 2.6);
              impact.height = impact.width;
              impact.position.set(index === 0 ? -width / 2 : width / 2, 0);
              impact.rotation = -view.root.rotation;
            });
          }
        }
        const angled = entity.beamAngleRadians !== null;
        const coreWidth = angled || entity.beamAxis === 'horizontal'
          ? width
          : Math.max(3, width * 0.34);
        const coreHeight = angled || entity.beamAxis === 'horizontal'
          ? Math.max(3, height * 0.34)
          : height;
        view.body.roundRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight, Math.min(6, radius))
          .fill({ color: '#ffffff', alpha: cornerAmbushBeam ? 1 : 0.96 });
        view.body.roundRect(-width / 2, -height / 2, width, height, radius)
          .stroke({
            color,
            width: Math.max(1, Math.min(width, height) * 0.12),
            alpha: cornerAmbushBeam ? 0.96 : 0.78
          });
      }
      return;
    }
    if (playerShot && entity.squadAbilityKind) {
      const speed = Math.max(1, Math.hypot(entity.vx, entity.vy));
      const trailLength = clamp(speed * 3.8, 14, 42);
      view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      view.trail.moveTo(0, entity.height * 0.18).lineTo(0, entity.height * 0.18 + trailLength)
        .stroke({ color, width: Math.max(1.5, entity.width * 0.42), alpha: 0.34 });

      if (entity.squadAbilityKind === 'homing-missile') {
        view.body.moveTo(0, -entity.height * 0.56)
          .lineTo(entity.width * 0.48, entity.height * 0.28)
          .lineTo(0, entity.height * 0.12)
          .lineTo(-entity.width * 0.48, entity.height * 0.28)
          .closePath()
          .fill(color)
          .stroke({ color: '#ffffff', width: 1.2, alpha: 0.82 });
      } else if (entity.squadAbilityKind === 'piercing-laser') {
        view.aura.roundRect(-entity.width * 0.72, -entity.height * 0.58, entity.width * 1.44, entity.height * 1.16, entity.width)
          .fill({ color, alpha: 0.22 });
        view.body.roundRect(-Math.max(1.5, entity.width * 0.2), -entity.height * 0.54, Math.max(3, entity.width * 0.4), entity.height * 1.08, entity.width)
          .fill('#ffffff');
      } else if (entity.squadAbilityKind === 'coin-magnet') {
        view.aura.circle(0, 0, entity.width * 0.92).stroke({ color: '#facc15', width: 1.5, alpha: 0.72 });
        view.body.circle(0, 0, Math.max(2.5, entity.width * 0.38)).fill(color).stroke({ color: '#fef08a', width: 1, alpha: 0.9 });
      } else if (entity.squadAbilityKind === 'heavy-cannon') {
        view.aura.roundRect(-entity.width * 0.65, -entity.height * 0.58, entity.width * 1.3, entity.height * 1.16, entity.width * 0.45)
          .fill({ color, alpha: 0.28 });
        view.body.roundRect(-entity.width * 0.38, -entity.height * 0.5, entity.width * 0.76, entity.height, entity.width * 0.34)
          .fill('#ffffff')
          .stroke({ color, width: 1.4, alpha: 0.92 });
      } else if (entity.squadAbilityKind === 'prism-fan' || entity.squadAbilityKind === 'nova-volley') {
        view.body.moveTo(0, -entity.height * 0.54)
          .lineTo(entity.width * 0.54, 0)
          .lineTo(0, entity.height * 0.54)
          .lineTo(-entity.width * 0.54, 0)
          .closePath()
          .fill('#ffffff')
          .stroke({ color, width: 1.4, alpha: 0.96 });
      } else {
        view.aura.roundRect(-entity.width * 0.6, -entity.height * 0.56, entity.width * 1.2, entity.height * 1.12, entity.width)
          .fill({ color, alpha: 0.2 });
        view.body.roundRect(-Math.max(1.5, entity.width * 0.3), -entity.height * 0.5, Math.max(3, entity.width * 0.6), entity.height, entity.width)
          .fill('#ffffff')
          .stroke({ color, width: 1, alpha: 0.88 });
      }
      return;
    }
    if (playerShot) {
      const frames = getPlayerWeaponFrames(entity.weaponKind, entity.weaponVisualLevel);
      const launchFrame = getPlayerWeaponLaunchFrameIndex(
        engineFrame - entity.weaponVisualStartFrame,
        frames.length
      );
      const textureKey = frames[launchFrame];
      this.setTexture(view, textureKey);
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      const unitWidth = entity.projectileUnitWidth || entity.width;
      const unitHeight = entity.projectileUnitHeight || entity.height;
      const visualWidth = Math.max(34, unitWidth * 2.05);
      const visualHeight = Math.max(48, unitHeight * 1.2);
      view.sprite.width = visualWidth;
      view.sprite.height = visualHeight;
      view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      const visualPattern = entity.maxShotVisualPattern;
      if (visualPattern?.length) {
        const copies = this.ensureProjectileCopySprites(view, visualPattern.length);
        const bundleAge = Math.max(0, engineFrame - entity.weaponVisualStartFrame);
        const projectileSpeed = Math.max(1, Math.hypot(entity.vx, entity.vy));
        const remainingVisualRounds = Math.min(
          visualPattern.length,
          Math.max(0, entity.representedRoundsRemaining)
        );
        visualPattern.forEach((round, index) => {
          const sprite = index === 0 ? view.sprite : copies[index - 1];
          const launchDelayFrames = Math.max(0, round.launchDelayFrames || 0);
          const roundAge = Math.max(0, bundleAge - launchDelayFrames);
          const visualTravel = Math.min(100, roundAge * projectileSpeed);
          sprite.texture = view.sprite.texture;
          sprite.visible = index < remainingVisualRounds
            && bundleAge >= launchDelayFrames
            && view.sprite.visible;
          sprite.tint = '#ffffff';
          sprite.alpha = 1;
          sprite.width = visualWidth;
          sprite.height = visualHeight;
          sprite.position.set(
            round.offsetX + Math.sin(round.angleOffset) * visualTravel,
            launchDelayFrames * projectileSpeed
          );
          sprite.rotation = round.angleOffset;
        });
      }
      return;
    }
    const speed = Math.max(1, Math.hypot(entity.vx, entity.vy));
    const nx = -entity.vx / speed;
    const ny = -entity.vy / speed;
    const strong = entity.weaponKind === 'nova' || entity.weaponKind === 'singularity' || entity.weaponKind === 'btc-hash';
    const trailLength = clamp(speed * (strong ? 7 : 4.5), 12, strong ? 78 : 46);

    view.trail.moveTo(0, 0).lineTo(nx * trailLength, ny * trailLength)
      .stroke({ color, width: Math.max(2, entity.width * (strong ? 0.7 : 0.42)), alpha: playerShot ? 0.48 : 0.3 });
    view.trail.moveTo(0, 0).lineTo(nx * trailLength * 0.55, ny * trailLength * 0.55)
      .stroke({ color: '#ffffff', width: Math.max(1, entity.width * 0.18), alpha: 0.72 });

    if (entity.type === EntityType.MISSILE) {
      const angle = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      view.root.rotation = angle;
      view.body.moveTo(0, -entity.height * 0.56).lineTo(entity.width * 0.44, entity.height * 0.32)
        .lineTo(0, entity.height * 0.16).lineTo(-entity.width * 0.44, entity.height * 0.32).closePath();
      view.body.fill(color).stroke({ color: '#ffffff', width: 1.2, alpha: 0.75 });
      return;
    }

    if (entity.weaponKind === 'eth-shard') {
      view.body.moveTo(0, -entity.height * 0.58).lineTo(entity.width * 0.62, 0)
        .lineTo(0, entity.height * 0.58).lineTo(-entity.width * 0.62, 0).closePath();
      view.body.fill('#8b5cf6').stroke({ color: '#67e8f9', width: 1.2, alpha: 0.9 });
    } else if (entity.weaponKind === 'btc-hash') {
      view.body.moveTo(0, -entity.height * 0.56).lineTo(entity.width * 0.56, -entity.height * 0.12)
        .lineTo(entity.width * 0.42, entity.height * 0.5).lineTo(0, entity.height * 0.62)
        .lineTo(-entity.width * 0.42, entity.height * 0.5).lineTo(-entity.width * 0.56, -entity.height * 0.12).closePath();
      view.body.fill('#fbbf24').stroke({ color: '#fff7d6', width: 1.2, alpha: 0.9 });
    } else {
      const projectileWidth = Math.max(3, entity.width * (strong ? 0.75 : 0.58));
      view.aura.roundRect(-projectileWidth * 0.86, -entity.height * 0.56, projectileWidth * 1.72, entity.height * 1.12, projectileWidth)
        .fill({ color, alpha: strong ? 0.32 : 0.22 });
      view.body.roundRect(-projectileWidth * 0.42, -entity.height * 0.5, projectileWidth * 0.84, entity.height, projectileWidth * 0.42)
        .fill(playerShot ? '#ffffff' : color);
      if (playerShot) {
        view.body.roundRect(-projectileWidth * 0.18, -entity.height * 0.45, projectileWidth * 0.36, entity.height * 0.9, projectileWidth * 0.18)
          .fill(color);
      }
    }
  }

  private drawPlayerRig(view: EntityView, entity: Entity, engine: GameEngine) {
    view.trail.clear();
    view.aura.clear();

    const shielded = engine.activePowerups.has(PowerupType.SHIELD) || engine.invincibleTimer > 60;
    const beam = engine.activePowerups.has(PowerupType.RESEARCH_BEAM);
    if (shielded) {
      const pulse = 1 + Math.sin(engine.frameCount * 0.1) * 0.04;
      view.aura.circle(0, 0, entity.width * 0.62 * pulse).fill({ color: '#34d399', alpha: 0.075 });
      view.aura.circle(0, 0, entity.width * 0.62 * pulse).stroke({ color: '#a7f3d0', width: 2.5, alpha: 0.82 });
      view.aura.circle(0, 0, entity.width * 0.72 * pulse).stroke({ color: '#22d3ee', width: 1, alpha: 0.35 });
    }
    if (beam) {
      view.aura.circle(0, 0, entity.width * 0.68).stroke({ color: '#c084fc', width: 3, alpha: 0.72 });
    }

    // Banking is represented by complete redrawn frames. Keep the world rig
    // upright and uniformly scaled so presentation never moves the hitbox.
    view.root.rotation = 0;
    const visualScale = engine.playerDrawScale * 0.95;
    view.root.scale.set(visualScale);
    view.root.alpha = engine.playerDrawAlpha;
  }

  private syncMaxShotPresentation(engine: GameEngine) {
    const remaining = engine.activePowerups.get(PowerupType.MAX_SHOT) || 0;
    const auraFrameIndex = Math.floor(engine.frameCount / 4) % ASSETS.POWERUP_MAX_SHOT_AURA_FRAMES.length;
    const auraTexture = this.textureBank.get(ASSETS.POWERUP_MAX_SHOT_AURA_FRAMES[auraFrameIndex])
      ?? this.textureBank.get(ASSETS.POWERUP_MAX_SHOT_AURA);
    const active = engine.hasMaxShotShield()
      && engine.lives > 0
      && engine.playerDrawAlpha > 0.02
      && Boolean(auraTexture);
    this.maxShotAura.visible = active;
    this.maxShotScreenGlow.visible = active;
    if (!active || !auraTexture) {
      this.maxShotAura.alpha = 0;
      this.maxShotScreenGlow.clear();
      return;
    }

    const pulseWave = (Math.sin(engine.frameCount * 0.13) + 1) * 0.5;
    const fade = clamp(remaining / 36, 0, 1);
    const playerCenterX = engine.player.x + engine.player.width / 2;
    const playerCenterY = engine.player.y + engine.player.height / 2;
    const auraSize = engine.player.width * (engine.mobileProfile ? 2.42 : 2.58);
    const auraScale = (auraSize / Math.max(1, auraTexture.width)) * (0.96 + pulseWave * 0.07);
    this.maxShotAura.texture = auraTexture;
    this.maxShotAura.position.set(playerCenterX, playerCenterY + engine.player.height * 0.02);
    this.maxShotAura.scale.set(auraScale);
    this.maxShotAura.rotation = Math.sin(engine.frameCount * 0.035) * 0.025;
    this.maxShotAura.alpha = (0.68 + pulseWave * 0.2) * engine.playerDrawAlpha * fade;

    const glow = this.maxShotScreenGlow;
    const outerAlpha = (0.28 + pulseWave * 0.16) * fade;
    const cornerLength = Math.min(74, Math.max(38, this.width * 0.14));
    const inset = engine.mobileProfile ? 5 : 7;
    glow.clear();
    glow.rect(0, 0, this.width, this.height).fill({ color: '#0284c7', alpha: 0.018 * fade });
    glow.rect(2, 2, this.width - 4, this.height - 4)
      .stroke({ color: '#22d3ee', width: 3, alpha: outerAlpha });
    glow.rect(inset, inset, this.width - inset * 2, this.height - inset * 2)
      .stroke({ color: '#67e8f9', width: 1.25, alpha: (0.4 + pulseWave * 0.18) * fade });
    glow.rect(0, 0, this.width, 18).fill({ color: '#0ea5e9', alpha: (0.035 + pulseWave * 0.018) * fade });
    glow.rect(0, this.height - 20, this.width, 20).fill({ color: '#2563eb', alpha: (0.05 + pulseWave * 0.022) * fade });

    glow.moveTo(inset, inset + cornerLength).lineTo(inset, inset).lineTo(inset + cornerLength, inset)
      .stroke({ color: '#a5f3fc', width: 3.5, alpha: (0.58 + pulseWave * 0.25) * fade });
    glow.moveTo(this.width - inset - cornerLength, inset).lineTo(this.width - inset, inset).lineTo(this.width - inset, inset + cornerLength)
      .stroke({ color: '#a5f3fc', width: 3.5, alpha: (0.58 + pulseWave * 0.25) * fade });
    glow.moveTo(inset, this.height - inset - cornerLength).lineTo(inset, this.height - inset).lineTo(inset + cornerLength, this.height - inset)
      .stroke({ color: '#38bdf8', width: 3.5, alpha: (0.52 + pulseWave * 0.22) * fade });
    glow.moveTo(this.width - inset - cornerLength, this.height - inset).lineTo(this.width - inset, this.height - inset).lineTo(this.width - inset, this.height - inset - cornerLength)
      .stroke({ color: '#38bdf8', width: 3.5, alpha: (0.52 + pulseWave * 0.22) * fade });
  }

  private updatePlayerSteeringPresentation(engine: GameEngine, deltaMs: number) {
    const motion = getPlayerShipMotionByAssetUrl(engine.playerShipUrl);
    if (!motion) {
      this.playerSteeringVisual = 0;
      this.playerSteeringState = 'neutral';
      this.playerSteeringTextureKey = engine.playerShipUrl;
      this.playerSteeringSweepOriginX = null;
      this.playerSteeringSweepDirection = 0;
      this.playerSteeringShipUrl = null;
      return;
    }

    const playerCenterX = engine.player.x + engine.player.width / 2;
    if (this.playerSteeringShipUrl !== engine.playerShipUrl) {
      this.playerSteeringVisual = 0;
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = 0;
      this.playerSteeringShipUrl = engine.playerShipUrl;
    }

    if (engine.waveDepartureFrames > 0) {
      this.playerSteeringVisual = 0;
      this.playerSteeringState = 'neutral';
      this.playerSteeringTextureKey = motion.steeringFrames.neutral;
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = 0;
      return;
    }

    const speedLevel = Math.min(engine.stats.upgrades.speed || 0, 6);
    const maxHorizontalSpeed = GAME_CONFIG.BASE_PLAYER_SPEED
      + (Math.min(speedLevel, 5) * 1.5)
      + (speedLevel >= 6 ? 3 : 0);
    const presentationSpeed = maxHorizontalSpeed
      * (engine.touchPos ? PLAYER_SHIP_TOUCH_SPEED_SCALE : 1);
    const normalizedHorizontal = applyPlayerSteeringDeadzone(
      engine.playerVel.x / Math.max(1, presentationSpeed)
    );
    const steeringDirection: -1 | 0 | 1 = normalizedHorizontal < 0
      ? -1
      : normalizedHorizontal > 0
        ? 1
        : 0;
    if (steeringDirection !== 0 && steeringDirection !== this.playerSteeringSweepDirection) {
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = steeringDirection;
    } else if (steeringDirection === 0 && Math.abs(this.playerSteeringVisual) < 0.05) {
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = 0;
    }

    const playableWidth = Math.max(1, engine.width - engine.player.width);
    const signedSweep = this.playerSteeringSweepOriginX === null
      ? 0
      : (playerCenterX - this.playerSteeringSweepOriginX) * this.playerSteeringSweepDirection;
    const hardBankEligible = Math.max(0, signedSweep) / playableWidth
      >= PLAYER_SHIP_HARD_BANK_SWEEP_RATIO;
    const steeringBlendMs = getPlayerSteeringBlendMs(speedLevel);
    const blend = 1 - Math.exp(-Math.max(0, deltaMs) / steeringBlendMs);
    this.playerSteeringVisual += (normalizedHorizontal - this.playerSteeringVisual) * blend;
    if (normalizedHorizontal === 0 && Math.abs(this.playerSteeringVisual) < 0.01) {
      this.playerSteeringVisual = 0;
    }

    const state = selectPlayerSteeringState(this.playerSteeringVisual, hardBankEligible);
    this.playerSteeringState = state;
    this.playerSteeringTextureKey = motion.steeringFrames[state];
  }

  private ensureArticulatedBossRigLoad(archetype: ArticulatedBossArchetype) {
    if (this.articulatedBossRigLoads.has(archetype)) return;
    const urls = archetype === 'rail-serpent'
      ? RAIL_SERPENT_RIG_TEXTURE_URLS
      : PRISM_MOTH_RIG_TEXTURE_URLS;
    this.articulatedBossRigLoads.set(archetype, this.textureBank.preload(Array.from(urls)));
  }

  private bindRailSerpentRigTextures(rig: ArticulatedPartRigView<RailSerpentRigPartId>) {
    let ready = true;
    for (const partId of RAIL_SERPENT_RIG_PART_IDS) {
      const texture = this.textureBank.get(ASSETS.PIXI_BOSS_RAIL_SERPENT_RIG[partId]);
      if (!texture) {
        ready = false;
        continue;
      }
      rig.parts[partId].texture = texture;
    }
    return ready;
  }

  private bindPrismMothRigTextures(rig: ArticulatedPartRigView<PrismMothRigPartId>) {
    let ready = true;
    for (const partId of PRISM_MOTH_RIG_PART_IDS) {
      const texture = this.textureBank.get(ASSETS.PIXI_BOSS_PRISM_MOTH_RIG[partId]);
      if (!texture) {
        ready = false;
        continue;
      }
      rig.parts[partId].texture = texture;
    }
    return ready;
  }

  private drawRailSerpentRig(view: EntityView, entity: Entity, engine: GameEngine) {
    const bossRig = view.bossRig;
    if (!bossRig) return false;
    const rig = bossRig.articulated.railSerpent;
    this.ensureArticulatedBossRigLoad('rail-serpent');
    if (!this.bindRailSerpentRigTextures(rig)) {
      rig.root.visible = false;
      return false;
    }

    let leftCannon: BossComponentState | undefined;
    let rightCannon: BossComponentState | undefined;
    let helmet: BossComponentState | undefined;
    for (const component of entity.bossComponents ?? []) {
      if (component.id === 'left-cannon') leftCannon = component;
      else if (component.id === 'right-cannon') rightCannon = component;
      else if (component.id === 'helmet') helmet = component;
    }

    let liveBeam = false;
    let telegraphBeam = false;
    for (const candidate of engine.entities) {
      if (
        candidate.bossOwnerId !== entity.id
        || !candidate.isBeam
        || candidate.markedForDeletion
      ) continue;
      if (candidate.isTelegraph) telegraphBeam = true;
      else liveBeam = true;
    }

    const healthPressure = 1 - clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    const motionScale = this.reducedMotion ? 0.34 : 1;
    const chainTime = engine.frameCount * (0.036 + healthPressure * 0.012);
    const headWave = Math.sin(chainTime) * (4.5 + healthPressure * 2.4) * motionScale;
    const upperWave = Math.sin(chainTime - 0.62) * (6.2 + healthPressure * 2.8) * motionScale;
    const lowerWave = Math.sin(chainTime - 1.18) * (8.2 + healthPressure * 3.4) * motionScale;
    const tailWave = Math.sin(chainTime - 1.82) * (10.5 + healthPressure * 4) * motionScale;
    const chargePulse = telegraphBeam || entity.isCharging
      ? Math.sin(engine.frameCount * 0.31) * 2.6 * motionScale
      : Math.sin(engine.frameCount * 0.055) * 1.1 * motionScale;
    const recoil = liveBeam ? 7 * motionScale : 0;
    const hullFilters = null;
    const helmetFilters = null;
    const leftFilters = null;
    const rightFilters = null;

    rig.root.visible = true;
    rig.root.position.set(0, Math.sin(engine.frameCount * 0.04) * 5);
    rig.root.rotation = Math.sin(chainTime * 0.72) * 0.012 * motionScale;
    rig.root.scale.set(
      entity.width / RAIL_SERPENT_DESIGN_SIZE.width,
      entity.height / RAIL_SERPENT_DESIGN_SIZE.height
    );

    const head = rig.parts.head;
    head.visible = true;
    head.position.set(RAIL_SERPENT_RIG_LAYOUT.head.x + headWave, RAIL_SERPENT_RIG_LAYOUT.head.y);
    head.rotation = headWave * 0.0035;
    head.filters = helmetFilters;

    const bodyUpper = rig.parts.bodyUpper;
    bodyUpper.visible = true;
    bodyUpper.position.set(RAIL_SERPENT_RIG_LAYOUT.bodyUpper.x + upperWave, RAIL_SERPENT_RIG_LAYOUT.bodyUpper.y);
    bodyUpper.rotation = upperWave * 0.0038;
    bodyUpper.filters = hullFilters;

    const bodyLower = rig.parts.bodyLower;
    bodyLower.visible = true;
    bodyLower.position.set(RAIL_SERPENT_RIG_LAYOUT.bodyLower.x + lowerWave, RAIL_SERPENT_RIG_LAYOUT.bodyLower.y);
    bodyLower.rotation = lowerWave * 0.0041;
    bodyLower.filters = hullFilters;

    const tail = rig.parts.tail;
    tail.visible = true;
    tail.position.set(RAIL_SERPENT_RIG_LAYOUT.tail.x + tailWave, RAIL_SERPENT_RIG_LAYOUT.tail.y);
    tail.rotation = tailWave * 0.0048;
    tail.filters = hullFilters;

    const energyCore = rig.parts.energyCore;
    energyCore.visible = true;
    energyCore.position.set(RAIL_SERPENT_RIG_LAYOUT.energyCore.x + upperWave * 0.56, RAIL_SERPENT_RIG_LAYOUT.energyCore.y);
    energyCore.scale.set(0.96 + Math.sin(engine.frameCount * 0.12) * 0.035);
    energyCore.alpha = 0.9 + Math.sin(engine.frameCount * 0.12) * 0.08;
    energyCore.filters = helmetFilters;

    for (const side of ['left', 'right'] as const) {
      const direction = side === 'left' ? -1 : 1;
      const shoulder = rig.parts[side === 'left' ? 'leftShoulder' : 'rightShoulder'];
      const shoulderLayout = RAIL_SERPENT_RIG_LAYOUT[side === 'left' ? 'leftShoulder' : 'rightShoulder'];
      shoulder.visible = true;
      shoulder.position.set(shoulderLayout.x + upperWave * 0.72, shoulderLayout.y + chargePulse * 0.28);
      shoulder.rotation = direction * (0.018 + upperWave * 0.0022);
      shoulder.filters = hullFilters;

      const rib = rig.parts[side === 'left' ? 'leftRib' : 'rightRib'];
      const ribLayout = RAIL_SERPENT_RIG_LAYOUT[side === 'left' ? 'leftRib' : 'rightRib'];
      rib.visible = true;
      rib.position.set(ribLayout.x + lowerWave * 0.78, ribLayout.y);
      rib.rotation = direction * (0.014 + lowerWave * 0.0024);
      rib.filters = hullFilters;

      const component = side === 'left' ? leftCannon : rightCannon;
      const cannon = rig.parts[side === 'left' ? 'leftCannon' : 'rightCannon'];
      const cannonLayout = RAIL_SERPENT_RIG_LAYOUT[side === 'left' ? 'leftCannon' : 'rightCannon'];
      cannon.visible = !component?.destroyed;
      cannon.position.set(
        cannonLayout.x + headWave * 0.46,
        cannonLayout.y + chargePulse - recoil
      );
      cannon.rotation = direction * (0.022 + Math.sin(engine.frameCount * 0.065 + (side === 'left' ? 0 : Math.PI)) * 0.014)
        + direction * recoil * 0.0018;
      cannon.filters = side === 'left' ? leftFilters : rightFilters;
    }

    if (telegraphBeam || liveBeam) {
      const glowAlpha = liveBeam ? 0.3 : 0.16 + Math.sin(engine.frameCount * 0.31) * 0.06;
      const glowY = entity.height * 0.22;
      view.aura.circle(-entity.width * 0.31, glowY, entity.width * 0.075)
        .fill({ color: liveBeam ? '#ffffff' : '#fb7185', alpha: glowAlpha });
      view.aura.circle(entity.width * 0.31, glowY, entity.width * 0.075)
        .fill({ color: liveBeam ? '#ffffff' : '#fb7185', alpha: glowAlpha });
    }
    return true;
  }

  private drawPrismMothRig(view: EntityView, entity: Entity, engine: GameEngine) {
    const bossRig = view.bossRig;
    if (!bossRig) return false;
    const rig = bossRig.articulated.prismMoth;
    this.ensureArticulatedBossRigLoad('prism-moth');
    if (!this.bindPrismMothRigTextures(rig)) {
      rig.root.visible = false;
      return false;
    }

    let leftEmitter: BossComponentState | undefined;
    let rightEmitter: BossComponentState | undefined;
    for (const component of entity.bossComponents ?? []) {
      if (component.id === 'left-cannon') leftEmitter = component;
      else if (component.id === 'right-cannon') rightEmitter = component;
    }

    const healthPressure = 1 - clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    const chargeEnergy = entity.isCharging ? 1 : 0;
    const motionScale = this.reducedMotion ? 0.34 : 1;
    const flapTime = engine.frameCount * (0.075 + healthPressure * 0.025 + chargeEnergy * 0.018);
    const breath = Math.sin(engine.frameCount * (0.041 + healthPressure * 0.008)) * motionScale;
    const hullFilters = null;
    const leftFilters = null;
    const rightFilters = null;
    const baseScaleX = entity.width / PRISM_MOTH_DESIGN_SIZE.width;
    const baseScaleY = entity.height / PRISM_MOTH_DESIGN_SIZE.height;

    rig.root.visible = true;
    rig.root.position.set(0, Math.sin(engine.frameCount * 0.04) * 5 + breath * 1.8);
    rig.root.rotation = Math.sin(engine.frameCount * 0.018) * 0.018 * motionScale;
    rig.root.scale.set(baseScaleX * (1 + breath * 0.012), baseScaleY * (1 - breath * 0.008));

    for (const partId of PRISM_MOTH_WING_PART_IDS) {
      const wing = rig.parts[partId];
      const layout = PRISM_MOTH_RIG_LAYOUT[partId];
      const flap = Math.sin(flapTime + layout.phase);
      const sweep = (0.045 + healthPressure * 0.026 + chargeEnergy * 0.018) * motionScale;
      const fold = Math.abs(flap) * (0.1 + healthPressure * 0.035) * motionScale;
      wing.visible = true;
      wing.position.set(
        layout.x + layout.side * Math.abs(flap) * 3.2 * motionScale,
        layout.y + flap * (3.4 + healthPressure * 1.8) * motionScale
      );
      wing.rotation = layout.side * (0.026 + flap * sweep);
      wing.scale.set(1 + Math.abs(flap) * 0.018 * motionScale, 1 - fold);
      wing.filters = hullFilters;
    }

    const tail = rig.parts.tail;
    tail.visible = true;
    tail.position.set(0, 122 + breath * 2.4);
    tail.rotation = -breath * 0.012;
    tail.filters = hullFilters;

    for (const side of ['left', 'right'] as const) {
      const direction = side === 'left' ? -1 : 1;
      const pod = rig.parts[side === 'left' ? 'leftWeaponPod' : 'rightWeaponPod'];
      const component = side === 'left' ? leftEmitter : rightEmitter;
      const podCenterXRatio = component?.centerXRatio ?? (side === 'left' ? 0.17 : 0.83);
      const podCenterYRatio = component?.centerYRatio ?? 0.45;
      const podX = (podCenterXRatio - 0.5) * PRISM_MOTH_DESIGN_SIZE.width;
      const podY = (podCenterYRatio - 0.5) * PRISM_MOTH_DESIGN_SIZE.height;
      pod.visible = !component?.destroyed;
      pod.position.set(
        podX + direction * chargeEnergy * 3 * motionScale,
        podY + breath * 1.2
      );
      pod.rotation = direction * (0.018 + Math.sin(flapTime + (side === 'left' ? 0 : Math.PI)) * 0.02 * motionScale);
      pod.filters = side === 'left' ? leftFilters : rightFilters;
    }

    const core = rig.parts.core;
    core.visible = true;
    core.position.set(0, 4 + breath * 1.6);
    core.filters = hullFilters;

    const prismCore = rig.parts.prismCore;
    prismCore.visible = true;
    prismCore.position.set(0, 10 + breath * 1.2);
    prismCore.scale.set(0.88 + (Math.sin(engine.frameCount * 0.115) + 1) * 0.035 + chargeEnergy * 0.04);
    prismCore.alpha = 0.84 + (Math.sin(engine.frameCount * 0.115) + 1) * 0.07;
    prismCore.filters = hullFilters;

    const crest = rig.parts.crest;
    crest.visible = true;
    crest.position.set(0, -101 + breath * 1.3);
    crest.rotation = breath * 0.006;
    crest.filters = hullFilters;

    if (chargeEnergy > 0) {
      const pulse = 0.18 + (Math.sin(engine.frameCount * 0.22) + 1) * 0.055;
      view.aura.ellipse(0, -entity.height * 0.05, entity.width * 0.38, entity.height * 0.34)
        .fill({ color: '#67e8f9', alpha: pulse });
      view.aura.ellipse(0, -entity.height * 0.05, entity.width * 0.48, entity.height * 0.43)
        .stroke({ color: '#c4b5fd', width: 2, alpha: pulse * 1.8 });
    }
    return true;
  }

  private drawArticulatedGeneratedBoss(view: EntityView, entity: Entity, engine: GameEngine) {
    const bossRig = view.bossRig;
    if (!bossRig) return false;
    bossRig.articulated.railSerpent.root.visible = false;
    bossRig.articulated.prismMoth.root.visible = false;
    if (entity.bossAttackArchetype === 'rail-serpent') {
      return this.drawRailSerpentRig(view, entity, engine);
    }
    if (entity.bossAttackArchetype === 'prism-moth') {
      return this.drawPrismMothRig(view, entity, engine);
    }
    return false;
  }

  private bindPreviewBossAtlasRigTextures(rig: PreviewBossAtlasRigView) {
    const atlas = this.previewBossArtwork?.articulatedAtlas;
    if (!atlas || atlas.kind !== rig.kind) return false;
    const parts = getPreviewBossRigParts(rig);
    for (const partId of getPreviewBossRigPartIds(rig.kind)) {
      const texture = this.getPreviewBossAtlasTexture(partId);
      const sprite = parts[partId];
      if (!texture || !sprite) return false;
      sprite.texture = texture;
    }
    return true;
  }

  private getPreviewBossActionPresentation(entity: Entity) {
    const actionSource = entity.bossActionPresentation;
    const actionDuration = actionSource
      ? Math.max(1, actionSource.endFrame - actionSource.startFrame)
      : 1;
    const actionFrameProgress = actionSource
        ? clamp((entity.attackTimer - actionSource.startFrame) / actionDuration, 0, 1)
        : undefined;
    const action = actionSource ? {
      primitiveId: actionSource.primitiveId,
      stage: actionSource.stage,
      progress: actionFrameProgress,
      side: actionSource.side ?? actionSource.handedness,
      sequence: actionSource.sequence,
      motionCue: actionSource.motionCue,
      elapsedFrames: Math.max(0, entity.attackTimer - actionSource.startFrame),
      framesPerSecond: GAME_CONFIG.FPS,
      projectileCount: actionSource.projectileCount,
      pulseIntervalSeconds: actionSource.pulseIntervalSeconds
    } : undefined;
    return action;
  }

  private getPreviewBossPoseReaction(entity: Entity, engine: GameEngine) {
    const age = engine.frameCount - entity.bossSignificantImpactFrame;
    if (age < 0 || age >= DAMAGE_RECOIL_DURATION_FRAMES) return undefined;
    return {
      kind: entity.bossSignificantImpactIsComponent ? 'stagger' as const : 'impact' as const,
      progress: age / Math.max(1, DAMAGE_RECOIL_DURATION_FRAMES - 1),
      direction: entity.bossSignificantImpactXRatio < 0.5 ? 1 as const : -1 as const,
      strength: entity.bossSignificantImpactStrength
    };
  }

  private drawSegmentedCrescentPreviewBossAtlas(
    rig: Extract<PreviewBossAtlasRigView, { kind: 'segmented-crescent-v1' }>,
    entity: Entity,
    engine: GameEngine
  ) {
    const action: SegmentedCrescentActionPresentation | undefined =
      this.getPreviewBossActionPresentation(entity);
    const pose = sampleSegmentedCrescentPose({
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      healthRatio: entity.hp / Math.max(1, entity.maxHp),
      bankRadians: entity.bossPresentationBankRadians,
      charging: entity.isCharging,
      action
    });

    const parts = rig.parts;
    const components = entity.bossComponents ?? [];
    const leftComponent = components.find((component) => component.id === 'left-cannon');
    const rightComponent = components.find((component) => component.id === 'right-cannon');
    const helmet = components.find((component) => component.id === 'helmet');
    const leftAlive = !leftComponent?.destroyed;
    const rightAlive = !rightComponent?.destroyed;
    const coreExposed = Boolean(helmet?.exposed || helmet?.destroyed);
    // Sustained automatic fire otherwise bleaches this small, detailed atlas
    // almost continuously. Impact sparks and articulated recoil retain feedback
    // while the generated pixel art remains readable.
    const hullFilters = null;
    const leftFilters = null;
    const rightFilters = null;
    const coreFilters = null;

    rig.root.visible = true;
    rig.root.position.set(0, pose.bodyBob);
    rig.root.rotation = 0;
    rig.root.scale.set(
      entity.width / SEGMENTED_CRESCENT_DESIGN_SIZE.width,
      entity.height / SEGMENTED_CRESCENT_DESIGN_SIZE.height
    );

    for (const partId of SEGMENTED_CRESCENT_PART_IDS) {
      const sprite = parts[partId];
      const layout = SEGMENTED_CRESCENT_LAYOUT[partId];
      sprite.visible = true;
      sprite.position.set(layout.x, layout.y);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.filters = hullFilters;
    }

    const armExtension = 34;
    parts.leftBase.visible = leftAlive;
    parts.leftMidB.visible = leftAlive;
    parts.leftMidA.visible = leftAlive;
    parts.leftOuter.visible = leftAlive;
    parts.leftPod.visible = leftAlive;
    parts.leftBase.filters = leftFilters;
    parts.leftMidB.filters = leftFilters;
    parts.leftMidA.filters = leftFilters;
    parts.leftOuter.filters = leftFilters;
    parts.leftPod.filters = leftFilters;
    parts.leftBase.position.x -= pose.leftArmSpread * armExtension * 0.25;
    parts.leftMidB.position.x -= pose.leftArmSpread * armExtension * 0.5;
    parts.leftMidA.position.x -= pose.leftArmSpread * armExtension * 0.75;
    parts.leftOuter.position.x -= pose.leftArmSpread * armExtension;
    parts.leftBase.rotation = -0.07 - pose.leftArmSpread * 0.46;
    parts.leftMidB.rotation = -0.12 - pose.leftArmSpread * 0.7 - pose.leftArmCurl * 0.36;
    parts.leftMidA.rotation = -0.16 - pose.leftArmSpread * 0.92 - pose.leftArmCurl * 0.5;
    parts.leftOuter.rotation = -0.2 - pose.leftArmSpread * 1.16 - pose.leftArmCurl * 0.62;
    parts.leftPod.position.y += pose.leftPodRecoil * 13;
    parts.leftPod.position.x -= pose.leftPodRecoil * 4;
    parts.leftPod.rotation = -0.04 - pose.podAim * 0.22;

    parts.rightBase.visible = rightAlive;
    parts.rightMidB.visible = rightAlive;
    parts.rightMidA.visible = rightAlive;
    parts.rightOuter.visible = rightAlive;
    parts.rightPod.visible = rightAlive;
    parts.rightBase.filters = rightFilters;
    parts.rightMidB.filters = rightFilters;
    parts.rightMidA.filters = rightFilters;
    parts.rightOuter.filters = rightFilters;
    parts.rightPod.filters = rightFilters;
    parts.rightBase.position.x += pose.rightArmSpread * armExtension * 0.25;
    parts.rightMidB.position.x += pose.rightArmSpread * armExtension * 0.5;
    parts.rightMidA.position.x += pose.rightArmSpread * armExtension * 0.75;
    parts.rightOuter.position.x += pose.rightArmSpread * armExtension;
    parts.rightBase.rotation = 0.07 + pose.rightArmSpread * 0.46;
    parts.rightMidB.rotation = 0.12 + pose.rightArmSpread * 0.7 + pose.rightArmCurl * 0.36;
    parts.rightMidA.rotation = 0.16 + pose.rightArmSpread * 0.92 + pose.rightArmCurl * 0.5;
    parts.rightOuter.rotation = 0.2 + pose.rightArmSpread * 1.16 + pose.rightArmCurl * 0.62;
    parts.rightPod.position.y += pose.rightPodRecoil * 13;
    parts.rightPod.position.x += pose.rightPodRecoil * 4;
    parts.rightPod.rotation = 0.04 + pose.podAim * 0.22;

    const leftPodInFlight = engine.entities.some((candidate) => (
      !candidate.markedForDeletion
      && candidate.bossOwnerId === entity.id
      && candidate.projectileVisualKind === 'boss-pod'
      && candidate.bossPodSide === 'left'
    ));
    const rightPodInFlight = engine.entities.some((candidate) => (
      !candidate.markedForDeletion
      && candidate.bossOwnerId === entity.id
      && candidate.projectileVisualKind === 'boss-pod'
      && candidate.bossPodSide === 'right'
    ));
    parts.leftPod.visible = parts.leftPod.visible && !leftPodInFlight;
    parts.rightPod.visible = parts.rightPod.visible && !rightPodInFlight;

    parts.coreBody.scale.set(pose.bodyScaleX, pose.bodyScaleY);
    parts.coreBody.filters = hullFilters;
    parts.coreClosed.visible = !coreExposed;
    parts.coreOpen.visible = coreExposed;
    parts.coreClosed.scale.set(pose.coreScale);
    parts.coreOpen.scale.set(pose.coreScale);
    parts.coreClosed.filters = coreFilters;
    parts.coreOpen.filters = coreFilters;
    if (helmet?.destroyed) parts.coreOpen.alpha = 0.72;

    const tailIds = ['tailA', 'tailB', 'tailC'] as const;
    tailIds.forEach((partId, index) => {
      const sprite = parts[partId];
      sprite.visible = index === pose.tailFrame;
      sprite.position.x += Math.sin(pose.tailSway) * 12;
      sprite.rotation = pose.tailSway;
      sprite.filters = hullFilters;
    });

    parts.ring.visible = pose.ringAlpha > 0.01;
    parts.ring.alpha = pose.ringAlpha;
    parts.ring.rotation = pose.ringRotation;
    parts.ring.scale.set(pose.ringScale);
    parts.ring.filters = null;
    return true;
  }

  private drawArticulatedPincerPreviewBossAtlas(
    rig: Extract<PreviewBossAtlasRigView, { kind: 'articulated-pincer-v1' }>,
    entity: Entity,
    engine: GameEngine
  ) {
    const parts = rig.parts;
    const components = entity.bossComponents ?? [];
    const leftComponent = components.find((component) => component.id === 'left-cannon');
    const rightComponent = components.find((component) => component.id === 'right-cannon');
    const helmet = components.find((component) => component.id === 'helmet');
    const leftAlive = !leftComponent?.destroyed;
    const rightAlive = !rightComponent?.destroyed;
    const coreExposed = Boolean(helmet?.exposed || helmet?.destroyed);
    const healthRatio = entity.hp / Math.max(1, entity.maxHp);
    const shieldActive = engine.entities.some((candidate) => (
      !candidate.markedForDeletion && candidate.shieldHostId === entity.id
    ));
    const action: ArticulatedPincerActionPresentation | undefined =
      this.getPreviewBossActionPresentation(entity);
    const pose = sampleArticulatedPincerPose({
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      healthRatio,
      bankRadians: entity.bossPresentationBankRadians,
      charging: entity.isCharging,
      coreExposed,
      finalPhase: healthRatio <= 0.34,
      shieldActive,
      action
    });
    // Preserve the twenty-part pixel rig under sustained sandbox fire. The
    // recoil, core heartbeat, and local impact effects carry hit feedback.
    const hullFilters = null;
    const leftFilters = null;
    const rightFilters = null;
    const coreFilters = null;

    rig.root.visible = true;
    rig.root.position.set(pose.scuttleX, pose.bodyBob);
    rig.root.rotation = pose.bodyRoll;
    rig.root.scale.set(
      entity.width / ARTICULATED_PINCER_DESIGN_SIZE.width,
      entity.height / ARTICULATED_PINCER_DESIGN_SIZE.height
    );

    for (const partId of ARTICULATED_PINCER_PART_IDS) {
      const sprite = parts[partId];
      const layout = ARTICULATED_PINCER_LAYOUT[partId];
      sprite.visible = true;
      sprite.position.set(layout.x, layout.y);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.filters = hullFilters;
    }

    parts.bodyClosed.alpha = 1 - pose.bodyOpenAmount;
    parts.bodyClosed.visible = parts.bodyClosed.alpha > 0.01;
    parts.bodyOpen.alpha = pose.bodyOpenAmount;
    parts.bodyOpen.visible = parts.bodyOpen.alpha > 0.01;
    parts.bodyOpen.scale.set(pose.coreHeartbeatScale);
    parts.bodyClosed.filters = coreFilters;
    parts.bodyOpen.filters = coreFilters;
    if (helmet?.destroyed) parts.bodyOpen.alpha *= 0.76;

    parts.leftClaw.visible = leftAlive;
    parts.leftMandible.visible = leftAlive;
    // The protected inner gatlings become the fallback weapon after the
    // destructible outer cannon/claw assemblies break away.
    parts.gatlingLeft.visible = true;
    parts.mineLeft.visible = leftAlive;
    parts.shieldLeft.visible = leftAlive && shieldActive;
    parts.leftClaw.filters = leftFilters;
    parts.leftMandible.filters = leftFilters;
    parts.gatlingLeft.filters = leftFilters;
    parts.mineLeft.filters = leftFilters;
    parts.shieldLeft.filters = leftFilters;
    parts.leftClaw.rotation = -0.08 - pose.leftClawOpen * 0.34;
    parts.leftClaw.position.x -= pose.leftClawOpen * 22;
    parts.leftClaw.position.y -= pose.leftClawRaise * 16;
    parts.leftMandible.rotation = -0.04 - pose.leftClawOpen * 0.18;
    parts.leftMandible.position.y -= pose.leftClawRaise * 10;
    parts.gatlingLeft.position.y -= pose.leftWeaponRecoil * 15;
    parts.gatlingLeft.rotation = Math.sin(engine.frameCount * 0.7) * 0.018 * pose.leftWeaponRecoil;

    parts.rightClaw.visible = rightAlive;
    parts.rightMandible.visible = rightAlive;
    parts.gatlingRight.visible = true;
    parts.mineRight.visible = rightAlive;
    parts.shieldRight.visible = rightAlive && shieldActive;
    parts.rightClaw.filters = rightFilters;
    parts.rightMandible.filters = rightFilters;
    parts.gatlingRight.filters = rightFilters;
    parts.mineRight.filters = rightFilters;
    parts.shieldRight.filters = rightFilters;
    parts.rightClaw.rotation = 0.08 + pose.rightClawOpen * 0.34;
    parts.rightClaw.position.x += pose.rightClawOpen * 22;
    parts.rightClaw.position.y -= pose.rightClawRaise * 16;
    parts.rightMandible.rotation = 0.04 + pose.rightClawOpen * 0.18;
    parts.rightMandible.position.y -= pose.rightClawRaise * 10;
    parts.gatlingRight.position.y -= pose.rightWeaponRecoil * 15;
    parts.gatlingRight.rotation = -Math.sin(engine.frameCount * 0.7) * 0.018 * pose.rightWeaponRecoil;

    parts.legOuterLeft.rotation = pose.legOuterLeftRotation;
    parts.legInnerLeft.rotation = pose.legInnerLeftRotation;
    parts.legInnerRight.rotation = pose.legInnerRightRotation;
    parts.legOuterRight.rotation = pose.legOuterRightRotation;

    const leftMineInFlight = engine.entities.some((candidate) => (
      !candidate.markedForDeletion
      && candidate.bossOwnerId === entity.id
      && candidate.projectileVisualKind === 'boss-pod'
      && candidate.bossPodSide === 'left'
    ));
    const rightMineInFlight = engine.entities.some((candidate) => (
      !candidate.markedForDeletion
      && candidate.bossOwnerId === entity.id
      && candidate.projectileVisualKind === 'boss-pod'
      && candidate.bossPodSide === 'right'
    ));
    parts.mineLeft.visible = parts.mineLeft.visible && !leftMineInFlight;
    parts.mineRight.visible = parts.mineRight.visible && !rightMineInFlight;
    parts.mineLeft.position.y += pose.leftMineDetach * 30;
    parts.mineRight.position.y += pose.rightMineDetach * 30;
    parts.mineLeft.alpha = 1 - pose.leftMineDetach * 0.75;
    parts.mineRight.alpha = 1 - pose.rightMineDetach * 0.75;

    for (const [shield, direction] of [
      [parts.shieldLeft, -1],
      [parts.shieldRight, 1]
    ] as const) {
      shield.position.x += direction * (1 - pose.shieldDeploy) * 20;
      shield.rotation = direction * pose.shieldDeploy * 0.16;
      shield.scale.set(0.72 + pose.shieldDeploy * 0.28);
      shield.alpha = 0.45 + pose.shieldDeploy * 0.55;
    }

    parts.shockBlade.visible = pose.shockBladeAlpha > 0.01;
    parts.shockBlade.alpha = pose.shockBladeAlpha;
    parts.shockBlade.rotation = pose.shockBladeRotation;
    parts.shockBlade.scale.set(pose.shockBladeScale);
    parts.shockBlade.filters = null;

    const flameIds = ['flameSmall', 'flameMedium', 'flameLarge'] as const;
    flameIds.forEach((partId, index) => {
      const sprite = parts[partId];
      sprite.visible = index === pose.flameFrame;
      sprite.scale.set(pose.flameScale);
      sprite.filters = null;
    });
    return true;
  }

  private drawTransformingOrbiterPreviewBossAtlas(
    rig: Extract<PreviewBossAtlasRigView, { kind: 'transforming-orbiter-v1' }>,
    entity: Entity,
    engine: GameEngine
  ) {
    const parts = rig.parts;
    const components = entity.bossComponents ?? [];
    const leftComponent = components.find((component) => component.id === 'left-cannon');
    const rightComponent = components.find((component) => component.id === 'right-cannon');
    const helmet = components.find((component) => component.id === 'helmet');
    const leftAlive = !leftComponent?.destroyed;
    const rightAlive = !rightComponent?.destroyed;
    const coreExposed = Boolean(helmet?.exposed || helmet?.destroyed);
    const healthRatio = entity.hp / Math.max(1, entity.maxHp);
    const action: TransformingOrbiterActionPresentation | undefined =
      this.getPreviewBossActionPresentation(entity);
    const pose = sampleTransformingOrbiterPose({
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      healthRatio,
      bankRadians: entity.bossPresentationBankRadians,
      charging: entity.isCharging,
      coreExposed,
      finalPhase: healthRatio <= 0.34,
      revivalStage: entity.bossRevivalStage,
      revivalProgress: entity.bossRevivalProgress,
      revived: entity.bossRevivalConsumed,
      action
    });
    // Primary fire creates local impact sparks. Hull and component sprites
    // remain opaque and unfiltered; destruction and significant-hit recoil
    // provide the larger feedback moments.
    const hullFilters = null;
    const leftFilters = null;
    const rightFilters = null;
    const coreFilters = null;

    rig.root.visible = true;
    rig.root.position.set(0, pose.bodyBob);
    rig.root.rotation = pose.bodyRotation;
    rig.root.scale.set(
      entity.width / TRANSFORMING_ORBITER_DESIGN_SIZE.width,
      entity.height / TRANSFORMING_ORBITER_DESIGN_SIZE.height
    );
    for (const partId of TRANSFORMING_ORBITER_PART_IDS) {
      const sprite = parts[partId];
      const layout = TRANSFORMING_ORBITER_LAYOUT[partId];
      sprite.visible = true;
      sprite.anchor.set(layout.anchorX, layout.anchorY);
      sprite.position.set(layout.x, layout.y);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.filters = hullFilters;
    }

    if (pose.revivalControlled) {
      // The mechanical shells are physical pixel parts, so the restart swaps
      // them at full opacity instead of cross-fading translucent hulls.
      const revivalCoreOpen = pose.coreOpenAmount >= 0.5;
      parts.coreClosed.visible = !revivalCoreOpen;
      parts.coreClosed.alpha = 1;
      parts.coreOpen.visible = revivalCoreOpen;
      parts.coreOpen.alpha = 1;
    } else {
      parts.coreClosed.alpha = 1 - pose.coreOpenAmount;
      parts.coreClosed.visible = parts.coreClosed.alpha > 0.01;
      parts.coreOpen.alpha = pose.coreOpenAmount;
      parts.coreOpen.visible = parts.coreOpen.alpha > 0.01;
    }
    parts.coreClosed.filters = coreFilters;
    parts.coreOpen.filters = coreFilters;
    if (helmet?.destroyed && !pose.revivalControlled) parts.coreOpen.alpha *= 0.76;

    parts.leftWing.visible = leftAlive;
    parts.leftEmitter.visible = leftAlive;
    parts.leftWing.filters = leftFilters;
    parts.leftEmitter.filters = leftFilters;
    parts.leftWing.position.x -= pose.deployment * 30;
    parts.leftWing.rotation = -pose.wingAngle;
    parts.leftEmitter.position.x -= pose.deployment * 26;
    parts.leftEmitter.position.x += pose.leftEmitterRecoil * 16;

    parts.rightWing.visible = rightAlive;
    parts.rightEmitter.visible = rightAlive;
    parts.rightWing.filters = rightFilters;
    parts.rightEmitter.filters = rightFilters;
    parts.rightWing.position.x += pose.deployment * 30;
    parts.rightWing.rotation = pose.wingAngle;
    parts.rightEmitter.position.x += pose.deployment * 26;
    parts.rightEmitter.position.x -= pose.rightEmitterRecoil * 16;

    TRANSFORMING_ORBITER_FIN_IDS.forEach((partId, index) => {
      const sprite = parts[partId];
      const layout = TRANSFORMING_ORBITER_LAYOUT[partId];
      const segmentDeployment = pose.revivalControlled
        ? clamp(pose.rearDeployment * 4 - index * 0.72, 0, 1)
        : 1;
      sprite.visible = !pose.revivalControlled || segmentDeployment > 0.01;
      sprite.alpha = 1;
      sprite.scale.set(0.42 + segmentDeployment * 0.58);
      sprite.rotation = (index - 1.5) * 0.12 * (1 - segmentDeployment);
      if (partId === 'finTop') {
        sprite.position.set(0, (layout.y - pose.finExtension) * segmentDeployment);
      } else if (partId === 'finRight') {
        sprite.position.set((layout.x + pose.finExtension) * segmentDeployment, 0);
      } else if (partId === 'finBottom') {
        sprite.position.set(0, (layout.y + pose.finExtension) * segmentDeployment);
      } else {
        sprite.position.set((layout.x - pose.finExtension) * segmentDeployment, 0);
      }
      sprite.filters = null;
    });

    TRANSFORMING_ORBITER_NODE_IDS.forEach((partId, index) => {
      const angle = pose.nodeOrbitAngle + index * Math.PI * 0.5;
      const sprite = parts[partId];
      const segmentDeployment = pose.revivalControlled
        ? clamp(pose.rearDeployment * 4 - index * 0.72, 0, 1)
        : 1;
      sprite.visible = !pose.revivalControlled || segmentDeployment > 0.01;
      sprite.alpha = 1;
      sprite.position.set(
        Math.cos(angle) * pose.nodeOrbitRadius * segmentDeployment,
        Math.sin(angle) * pose.nodeOrbitRadius * segmentDeployment
      );
      sprite.rotation = -rig.root.rotation;
      sprite.scale.set(0.42 + segmentDeployment * 0.58);
      sprite.filters = null;
    });

    TRANSFORMING_ORBITER_HALO_IDS.forEach((partId, index) => {
      const sprite = parts[partId];
      sprite.visible = index === pose.haloFrame && pose.haloAlpha > 0.01;
      sprite.alpha = pose.haloAlpha;
      sprite.scale.set(pose.haloScale);
      sprite.rotation = -rig.root.rotation;
      sprite.filters = null;
    });

    parts.perimeterRing.visible = pose.perimeterAlpha > 0.01;
    parts.perimeterRing.alpha = pose.perimeterAlpha;
    parts.perimeterRing.rotation = pose.perimeterRotation;
    parts.perimeterRing.scale.set(pose.perimeterScale);
    parts.perimeterRing.filters = null;

    parts.laserHub.visible = pose.laserHubAlpha > 0.01;
    parts.laserHub.alpha = pose.laserHubAlpha;
    parts.laserHub.rotation = pose.laserHubRotation;
    parts.laserHub.filters = null;

    TRANSFORMING_ORBITER_PULSE_IDS.forEach((partId, index) => {
      const sprite = parts[partId];
      sprite.visible = index === pose.pulseFrame && pose.pulseAlpha > 0.01;
      sprite.alpha = pose.pulseAlpha;
      sprite.scale.set(pose.pulseScale);
      sprite.rotation = -rig.root.rotation;
      sprite.filters = null;
    });
    return true;
  }

  private drawRotatingEmitterCorePreviewBossAtlas(
    rig: Extract<PreviewBossAtlasRigView, { kind: 'rotating-emitter-core-v1' }>,
    entity: Entity
  ) {
    const action: RotatingEmitterCoreActionPresentation | undefined =
      this.getPreviewBossActionPresentation(entity);
    const pose = sampleRotatingEmitterCorePose({
      attackFrame: entity.attackTimer,
      reducedMotion: this.reducedMotion,
      rotorAngleRadians: entity.bossRotorInitialized
        ? entity.bossRotorAngleRadians
        : undefined,
      baseSequence: Math.max(0, entity.activeBossPhaseIndex),
      action
    });
    const parts = rig.parts;

    rig.root.visible = true;
    // Gameplay and artwork share a fixed core origin. The central chassis
    // settles inside that rig instead of offsetting every muzzle and relay
    // away from its simulation-owned projectile/beam origin.
    rig.root.position.set(0, 0);
    rig.root.rotation = 0;
    rig.root.scale.set(
      entity.width / ROTATING_EMITTER_CORE_DESIGN_SIZE.width,
      entity.height / ROTATING_EMITTER_CORE_DESIGN_SIZE.height
    );
    for (const partId of ROTATING_EMITTER_CORE_PART_IDS) {
      const sprite = parts[partId];
      const layout = ROTATING_EMITTER_CORE_LAYOUT[partId];
      sprite.visible = false;
      sprite.position.set(layout.x, layout.y);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      // This oversized study rig remains readable under sustained automatic
      // fire. Local impact sparks, recoil, and the authored core pulse provide
      // hit feedback without bleaching every moving limb at once.
      sprite.filters = null;
    }

    parts.perimeterRing.visible = true;
    parts.perimeterRing.scale.set(0.96 * pose.chassisScale);
    parts.perimeterRing.alpha = 1;
    parts.chassisClosed.visible = false;
    parts.chassisOpen.visible = true;
    parts.chassisOpen.position.y = pose.chassisOffsetY;
    parts.chassisOpen.scale.set(1.18 * pose.chassisScale);

    parts.rotorHub.visible = true;
    parts.rotorHub.rotation = pose.rotorAngle;
    parts.rotorHub.scale.set(0.62 * pose.rotorScale);
    parts.rotorHub.alpha = 1;
    parts.rotorHub.filters = null;

    const muzzleSockets = sampleRotatingEmitterSocketPositionsForBounds({
      centerX: 0,
      centerY: 0,
      width: ROTATING_EMITTER_CORE_DESIGN_SIZE.width,
      height: ROTATING_EMITTER_CORE_DESIGN_SIZE.height,
      rotorAngleRadians: pose.rotorAngle
    });
    for (let index = 0; index < muzzleSockets.length; index += 1) {
      const socket = muzzleSockets[index];
      const arm = parts[`arm${index}` as RotatingEmitterCorePartId];
      const muzzle = parts[`muzzle${index}` as RotatingEmitterCorePartId];
      const active = (pose.activeMuzzleMask & (1 << index)) !== 0;
      const muzzleEnergy = active ? pose.muzzleEnergy : 0;
      arm.visible = true;
      arm.position.set(
        Math.cos(socket.orbitAngleRadians) * 78,
        Math.sin(socket.orbitAngleRadians) * 78
      );
      arm.rotation = socket.angleRadians + Math.PI * 0.5;
      arm.scale.set(0.4 + muzzleEnergy * 0.08);
      arm.alpha = 1;
      muzzle.visible = true;
      muzzle.position.set(socket.localX, socket.localY);
      muzzle.rotation = socket.angleRadians + Math.PI * 0.5;
      muzzle.scale.set(0.52 + muzzleEnergy * 0.18);
      muzzle.alpha = 1;
      muzzle.tint = '#ffffff';
      const muzzleVfxFrameId = active && muzzleEnergy > 0.02
        ? action?.stage === 'warning'
          ? 'orbCharge'
          : 'orbMuzzle'
        : null;
      const muzzleVfxTexture = muzzleVfxFrameId
        ? this.getPreviewBossVfxTexture(muzzleVfxFrameId)
        : undefined;
      if (muzzleVfxTexture) muzzle.texture = muzzleVfxTexture;
      muzzle.filters = null;
    }

    const relayIds = [
      'relayNorthWest',
      'relayNorthEast',
      'relaySouthEast',
      'relaySouthWest'
    ] as const;
    const relayPositions = sampleRotatingEmitterRelayPositions({
      centerX: 0,
      centerY: 0,
      radiusX: 186.68,
      radiusY: 186.68,
      rotorAngleRadians: pose.rotorAngle
    });
    relayIds.forEach((partId, index) => {
      const relay = parts[partId];
      const relayPosition = relayPositions[index];
      relay.visible = true;
      relay.position.set(relayPosition.x, relayPosition.y);
      relay.scale.set(0.54 + pose.relayEnergy * 0.16);
      relay.alpha = 1;
      relay.rotation = relayPosition.angleRadians + Math.PI * 0.5;
      const vfxFrameId = pose.beamEnergy > 0.01
        ? 'orbMuzzle'
        : pose.guideAlpha > 0.01
          ? 'orbCharge'
          : null;
      const vfxTexture = vfxFrameId ? this.getPreviewBossVfxTexture(vfxFrameId) : undefined;
      if (vfxTexture) relay.texture = vfxTexture;
      relay.filters = null;
    });

    const portalIds = ['portal0', 'portal1', 'portal2', 'portal3'] as const;
    portalIds.forEach((partId, index) => {
      const portal = parts[partId];
      const layout = ROTATING_EMITTER_CORE_LAYOUT[partId];
      portal.visible = pose.portalAlpha > 0.01;
      portal.position.set(
        layout.x + pose.portalShift * (index % 2 === 0 ? -7 : 7),
        layout.y + Math.abs(pose.portalShift) * 3
      );
      portal.rotation = -pose.rotorAngle * 0.28 + index * 0.36;
      portal.scale.set(0.38 + pose.portalAlpha * 0.18);
      portal.alpha = pose.portalAlpha;
      portal.filters = null;
    });

    const pulseIds = ['pulseSmall', 'pulseMedium', 'pulseLarge'] as const;
    pulseIds.forEach((partId, index) => {
      const pulse = parts[partId];
      pulse.visible = index === pose.pulseFrame && pose.pulseAlpha > 0.01;
      pulse.scale.set(pose.pulseScale);
      pulse.alpha = pose.pulseAlpha;
      pulse.filters = null;
    });
    return true;
  }

  private drawPreviewBossAtlas(view: EntityView, entity: Entity, engine: GameEngine) {
    const rig = view.bossRig?.previewAtlas;
    if (!rig) return false;
    rig.root.visible = false;
    if (this.previewBossArtwork?.renderMode === 'assembled') {
      if (
        this.previewBossArtwork.assembledMotionProfile === 'wingbeat-hover'
        && rig.kind === 'transforming-orbiter-v1'
        && this.drawWingbeatHoverPreviewBossAtlas(view, rig, entity, engine)
      ) {
        return true;
      }
      this.drawAssembledPreviewBossAccents(view, rig, entity, engine);
      return false;
    }
    const atlas = this.getPreviewBossAtlas(entity);
    if (
      !atlas
      || atlas.kind !== rig.kind
      || !this.bindPreviewBossAtlasRigTextures(rig)
    ) {
      return false;
    }
    switch (rig.kind) {
      case 'segmented-crescent-v1':
        return this.drawSegmentedCrescentPreviewBossAtlas(rig, entity, engine);
      case 'articulated-pincer-v1':
        return this.drawArticulatedPincerPreviewBossAtlas(rig, entity, engine);
      case 'transforming-orbiter-v1':
        return this.drawTransformingOrbiterPreviewBossAtlas(rig, entity, engine);
      case 'rotating-emitter-core-v1':
        return this.drawRotatingEmitterCorePreviewBossAtlas(rig, entity);
    }
  }

  private drawModularReferenceComparison(
    rigView: ModularPreviewBossRigView,
    registration: ModularBossRigRegistration,
    hierarchy: ResolvedModularBossRigHierarchy
  ) {
    const referenceView = rigView.referenceComparison;
    const descriptor = this.previewBossArtwork?.modularReferenceComparison;
    const state = this.previewBossReferenceComparison;
    if (!referenceView || !descriptor || !state.enabled) {
      if (referenceView) {
        referenceView.sprite.visible = false;
        referenceView.landmarks.clear();
        referenceView.landmarks.visible = false;
      }
      return;
    }

    const texture = this.textureBank.get(descriptor.url);
    const layout = resolvePreviewBossReferenceComparisonLayout(
      descriptor,
      registration.manifest.designSize
    );
    if (!texture || !layout) {
      referenceView.sprite.visible = false;
      referenceView.landmarks.clear();
      referenceView.landmarks.visible = false;
      return;
    }

    referenceView.sprite.texture = texture;
    referenceView.sprite.visible = true;
    referenceView.sprite.position.set(layout.centerX, layout.centerY);
    referenceView.sprite.rotation = 0;
    referenceView.sprite.width = layout.width;
    referenceView.sprite.height = layout.height;
    referenceView.sprite.alpha = state.opacity;
    referenceView.sprite.tint = '#ffffff';
    const referenceIndex = state.layer === 'under'
      ? 0
      : Math.max(0, rigView.root.children.length - 2);
    rigView.root.setChildIndex(referenceView.sprite, referenceIndex);
    rigView.root.setChildIndex(
      referenceView.landmarks,
      rigView.root.children.length - 1
    );

    referenceView.landmarks.clear();
    referenceView.landmarks.visible = state.landmarks;
    if (!state.landmarks) return;
    for (const landmark of layout.landmarks) {
      const socket = landmark.rigSocketId
        ? hierarchy.socketById[landmark.rigSocketId]
        : undefined;
      const rigX = socket?.worldX ?? landmark.rigX;
      const rigY = socket?.worldY ?? landmark.rigY;
      if (!Number.isFinite(rigX) || !Number.isFinite(rigY)) continue;
      referenceView.landmarks
        .moveTo(landmark.referenceX, landmark.referenceY)
        .lineTo(rigX as number, rigY as number)
        .stroke({ color: '#f8fafc', width: 1.4, alpha: 0.68 });
      referenceView.landmarks
        .circle(landmark.referenceX, landmark.referenceY, 5)
        .stroke({ color: '#22d3ee', width: 2, alpha: 0.95 });
      referenceView.landmarks
        .rect((rigX as number) - 4, (rigY as number) - 4, 8, 8)
        .stroke({ color: '#f59e0b', width: 2, alpha: 0.95 });
    }
  }

  private drawModularPreviewBoss(view: EntityView, entity: Entity, engine: GameEngine) {
    const rigView = view.bossRig?.modularPreview;
    const artwork = this.previewBossArtwork;
    const registration = artwork?.modularRig;
    const samplePose = artwork?.sampleModularPose;
    if (!rigView) return false;
    rigView.root.visible = false;
    if (
      !this.modularPreviewBossReady
      || !this.isPreviewBossEntity(entity)
      || !registration
      || !samplePose
    ) {
      return false;
    }

    const action = this.getPreviewBossActionPresentation(entity);
    const targetEntranceY = Math.max(72, Math.min(engine.height * 0.13, 116));
    const entranceProgress = clamp(
      (entity.y + entity.height) / Math.max(1, targetEntranceY + entity.height),
      0,
      1
    );
    const partOverrides = samplePose({
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      healthRatio: entity.hp / Math.max(1, entity.maxHp),
      phaseIndex: Math.max(1, entity.activeBossPhaseIndex + 1),
      entranceProgress,
      damageStage: entity.bossDecayStage,
      phaseProgress: action?.stage === 'phase-enter' ? action.progress : undefined,
      revivalStage: entity.bossRevivalStage,
      revivalProgress: entity.bossRevivalProgress,
      revived: entity.bossRevivalConsumed,
      reaction: this.getPreviewBossPoseReaction(entity, engine),
      action
    });
    const hierarchy = resolveModularBossRigHierarchy(registration, partOverrides);
    const designSize = registration.manifest.designSize;
    this.modularBossDebugSnapshot = Object.freeze({
      entityId: entity.id,
      centerX: entity.x + entity.width / 2,
      centerY: entity.y + entity.height / 2,
      width: entity.width,
      height: entity.height,
      rotation: entity.bossPresentationBankRadians,
      designScaleX: entity.width / Math.max(1, designSize.width),
      designScaleY: entity.height / Math.max(1, designSize.height),
      hierarchy
    });
    const destruction = registration.manifest.destruction;
    if (destruction) {
      const fragments = destruction.fragments.flatMap((authored) => {
        const part = hierarchy.partById[authored.partId];
        if (!part?.frameId || !part.anchor) return [];
        const scaleX = Math.max(0.0001, Math.hypot(part.worldTransform.a, part.worldTransform.b));
        const determinant = (
          part.worldTransform.a * part.worldTransform.d
          - part.worldTransform.b * part.worldTransform.c
        );
        return [Object.freeze({
          authored,
          frameId: part.frameId,
          anchorX: part.anchor.x,
          anchorY: part.anchor.y,
          x: part.worldTransform.tx,
          y: part.worldTransform.ty,
          rotation: Math.atan2(part.worldTransform.b, part.worldTransform.a),
          scaleX,
          scaleY: determinant / scaleX
        })];
      });
      this.modularBossDestructionSnapshot = fragments.length > 0
        ? Object.freeze({
            entityId: entity.id,
            sequence: destruction,
            designScaleX: entity.width / Math.max(1, designSize.width),
            designScaleY: entity.height / Math.max(1, designSize.height),
            fragments: Object.freeze(fragments)
          })
        : null;
    } else if (this.modularBossDestructionSnapshot?.entityId === entity.id) {
      this.modularBossDestructionSnapshot = null;
    }
    const componentById = new Map(
      (entity.bossComponents ?? []).map((component) => [component.id, component])
    );
    const portCannon = componentById.get('left-cannon');
    const starboardCannon = componentById.get('right-cannon');

    rigView.root.visible = true;
    rigView.root.position.set(0, 0);
    rigView.root.pivot.set(0, 0);
    rigView.root.rotation = 0;
    rigView.root.scale.set(
      entity.width / Math.max(1, designSize.width),
      entity.height / Math.max(1, designSize.height)
    );
    rigView.root.alpha = 1;
    rigView.root.filters = null;
    this.drawModularReferenceComparison(rigView, registration, hierarchy);

    for (const part of hierarchy.parts) {
      const sprite = rigView.partSprites[part.id];
      if (!sprite) continue;
      const sideBreakableRole = (
        part.role === 'arm'
        || part.role === 'armor'
        || part.role === 'pod'
      );
      const portComponentPart = (
        part.id === 'cannon.port'
        || part.id === 'muzzle.port'
        || (sideBreakableRole && part.id.includes('.port'))
      );
      const starboardComponentPart = (
        part.id === 'cannon.starboard'
        || part.id === 'muzzle.starboard'
        || (sideBreakableRole && part.id.includes('.starboard'))
      );
      const destroyedByComponent = (
        portComponentPart
        && Boolean(portCannon?.destroyed)
      ) || (
        starboardComponentPart
        && Boolean(starboardCannon?.destroyed)
      );
      const texture = part.frameId
        ? this.getModularPreviewBossTexture(part.frameId)
        : undefined;
      sprite.visible = Boolean(
        part.visible
        && part.frame
        && part.anchor
        && texture
        && !destroyedByComponent
      );
      if (!sprite.visible || !part.anchor || !texture) {
        sprite.filters = null;
        continue;
      }
      sprite.texture = texture;
      sprite.anchor.set(part.anchor.x, part.anchor.y);
      sprite.position.set(part.worldTransform.tx, part.worldTransform.ty);
      const scaleX = Math.max(
        0.0001,
        Math.hypot(part.worldTransform.a, part.worldTransform.b)
      );
      const determinant = (
        part.worldTransform.a * part.worldTransform.d
        - part.worldTransform.b * part.worldTransform.c
      );
      sprite.rotation = Math.atan2(part.worldTransform.b, part.worldTransform.a);
      sprite.scale.set(scaleX, determinant / scaleX);
      sprite.alpha = part.alpha;
      sprite.tint = '#ffffff';
      sprite.filters = null;
    }
    return true;
  }

  private drawWingbeatHoverPreviewBossAtlas(
    view: EntityView,
    rig: Extract<PreviewBossAtlasRigView, { kind: 'transforming-orbiter-v1' }>,
    entity: Entity,
    engine: GameEngine
  ) {
    const atlas = this.getPreviewBossAtlas(entity);
    if (
      !atlas
      || atlas.kind !== rig.kind
      || !this.bindPreviewBossAtlasRigTextures(rig)
    ) {
      return false;
    }

    const action = this.getPreviewBossActionPresentation(entity);
    const pose = sampleWingbeatHoverPose({
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      healthRatio: entity.hp / Math.max(1, entity.maxHp),
      charging: entity.isCharging,
      primitiveId: action?.primitiveId,
      stage: action?.stage,
      progress: action?.progress,
      side: action?.side
    });
    const parts = rig.parts;
    const accentPose = sampleAssembledBossAccentPose({
      profile: 'wingbeat-hover',
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      charging: entity.isCharging,
      healthRatio: entity.hp / Math.max(1, entity.maxHp),
      revivalStage: entity.bossRevivalStage,
      revivalProgress: entity.bossRevivalProgress
    });

    rig.root.visible = true;
    rig.root.position.set(view.sprite.x, view.sprite.y);
    rig.root.rotation = view.sprite.rotation;
    rig.root.scale.set(entity.width / 363, entity.height / 257);
    for (const partId of TRANSFORMING_ORBITER_PART_IDS) {
      const sprite = parts[partId];
      sprite.visible = false;
      sprite.anchor.set(0.5);
      sprite.position.set(0);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.filters = null;
    }

    const leftWing = parts.leftWing;
    leftWing.visible = true;
    leftWing.anchor.set(0.84, 0.58);
    leftWing.position.set(pose.leftWingX, pose.leftWingY);
    leftWing.rotation = pose.leftWingRotation;
    leftWing.scale.set(0.92, 0.92 * pose.leftWingScaleY);

    const rightWing = parts.rightWing;
    rightWing.visible = true;
    rightWing.anchor.set(0.16, 0.58);
    rightWing.position.set(pose.rightWingX, pose.rightWingY);
    rightWing.rotation = pose.rightWingRotation;
    rightWing.scale.set(0.92, 0.92 * pose.rightWingScaleY);

    const core = pose.coreOpen ? parts.coreOpen : parts.coreClosed;
    core.visible = true;
    core.position.set(0, 3);
    core.scale.set(
      0.98 * pose.bodyScaleX,
      0.98 * pose.bodyScaleY
    );

    TRANSFORMING_ORBITER_NODE_IDS.forEach((partId, index) => {
      const angle = accentPose.orbitAngle + index * Math.PI * 0.5;
      const node = parts[partId];
      node.visible = accentPose.nodeAlpha > 0.01;
      node.position.set(
        Math.cos(angle) * accentPose.orbitRadiusX * 0.78,
        Math.sin(angle) * accentPose.orbitRadiusY * 0.68
      );
      node.rotation = -rig.root.rotation;
      node.scale.set(accentPose.nodeScale * 0.82);
      node.alpha = 1;
    });

    TRANSFORMING_ORBITER_HALO_IDS.forEach((partId, index) => {
      const halo = parts[partId];
      halo.visible = index === accentPose.haloFrame && accentPose.haloAlpha > 0.01;
      halo.rotation = -accentPose.orbitAngle * 0.38;
      halo.scale.set(accentPose.haloScale * 0.82);
      halo.alpha = accentPose.haloAlpha;
    });

    TRANSFORMING_ORBITER_PULSE_IDS.forEach((partId, index) => {
      const pulse = parts[partId];
      pulse.visible = index === accentPose.pulseFrame && accentPose.pulseAlpha > 0.01;
      pulse.scale.set(accentPose.pulseScale * 0.78);
      pulse.alpha = accentPose.pulseAlpha;
    });

    if (pose.ramFold > 0.01) {
      const streakAlpha = 0.16 + pose.ramFold * 0.22;
      view.aura
        .ellipse(0, entity.height * 0.18, entity.width * 0.22, entity.height * 0.38)
        .stroke({ color: '#ef4444', width: 3, alpha: streakAlpha });
    }
    return true;
  }

  private drawAssembledPreviewBossAccents(
    view: EntityView,
    rig: PreviewBossAtlasRigView,
    entity: Entity,
    engine: GameEngine
  ) {
    const artwork = this.getPreviewBossArtwork(entity);
    if (
      rig.kind !== 'transforming-orbiter-v1'
      || artwork?.renderMode !== 'assembled'
      || !artwork.assembledMotionProfile
    ) {
      return;
    }
    const atlas = this.getPreviewBossAtlas(entity);
    if (
      !atlas
      || atlas.kind !== rig.kind
      || !this.bindPreviewBossAtlasRigTextures(rig)
    ) {
      return;
    }

    const profile = artwork.assembledMotionProfile;
    const layout = ASSEMBLED_BOSS_ACCENT_LAYOUTS[profile];
    const healthRatio = entity.hp / Math.max(1, entity.maxHp);
    const action = this.getPreviewBossActionPresentation(entity);
    const pose = sampleAssembledBossAccentPose({
      profile,
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      charging: entity.isCharging,
      healthRatio,
      revivalStage: entity.bossRevivalStage,
      revivalProgress: entity.bossRevivalProgress,
      action
    });
    const motion = sampleAssembledBossMotion({
      profile,
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      charging: entity.isCharging,
      revivalStage: entity.bossRevivalStage,
      revivalProgress: entity.bossRevivalProgress,
      action
    });
    const authoredSockets = profile === 'revival-shell'
      ? sampleBossWeaponSockets({
          profile: artwork.weaponSockets,
          x: -layout.designWidth / 2,
          y: -layout.designHeight / 2,
          width: layout.designWidth,
          height: layout.designHeight
        })
      : [];
    const authoredLimbSockets = authoredSockets.filter((socket) => socket.role !== 'core');
    const authoredCoreSocket = authoredSockets.find((socket) => socket.role === 'core');
    const usesAuthoredSocketLayout = authoredLimbSockets.length >= TRANSFORMING_ORBITER_NODE_IDS.length;
    const coreX = authoredCoreSocket?.x ?? 0;
    const coreY = authoredCoreSocket?.y ?? layout.coreY;
    const actionOwnsAllNodes = action?.stage === 'warning' || action?.stage === 'fire'
      ? action.primitiveId === 'pod-volley' || action.primitiveId === 'helix-volley'
      : false;
    const parts = rig.parts;

    rig.root.visible = true;
    rig.root.position.set(view.sprite.x, view.sprite.y);
    rig.root.rotation = view.sprite.rotation;
    rig.root.scale.set(
      entity.width / layout.designWidth * motion.scaleX,
      entity.height / layout.designHeight * motion.scaleY
    );
    for (const partId of TRANSFORMING_ORBITER_PART_IDS) {
      const sprite = parts[partId];
      sprite.visible = false;
      sprite.anchor.set(0.5);
      sprite.position.set(0);
      sprite.rotation = 0;
      sprite.scale.set(1);
      sprite.alpha = 1;
      sprite.filters = null;
    }

    TRANSFORMING_ORBITER_NODE_IDS.forEach((partId, index) => {
      const node = parts[partId];
      const authoredSocket = usesAuthoredSocketLayout
        ? authoredLimbSockets[index]
        : undefined;
      const deploymentThreshold = (index + 1) / TRANSFORMING_ORBITER_NODE_IDS.length;
      node.visible = pose.nodeAlpha > 0.01 && (
        !authoredSocket || pose.nodeDeployment >= deploymentThreshold
      );
      if (authoredSocket) {
        const sideActive = action?.primitiveId === 'side-barrage'
          && action.side === authoredSocket.role
          && (action.stage === 'warning' || action.stage === 'fire');
        const weaponPulse = sideActive || actionOwnsAllNodes ? 0.22 : 0;
        node.position.set(authoredSocket.x, authoredSocket.y);
        node.rotation = (
          pose.orbitAngle * (index % 2 === 0 ? 1 : -1)
          + (authoredSocket.role === 'port' ? -0.18 : 0.18)
        );
        node.scale.set(pose.nodeScale * (1 + weaponPulse));
      } else {
        const angle = pose.orbitAngle + index * Math.PI * 0.5;
        node.position.set(
          Math.cos(angle) * pose.orbitRadiusX,
          Math.sin(angle) * pose.orbitRadiusY
        );
        node.rotation = -rig.root.rotation;
        node.scale.set(pose.nodeScale);
      }
      node.alpha = pose.nodeAlpha;
    });

    TRANSFORMING_ORBITER_HALO_IDS.forEach((partId, index) => {
      const halo = parts[partId];
      halo.visible = index === pose.haloFrame && pose.haloAlpha > 0.01;
      halo.position.set(coreX, coreY);
      halo.rotation = -pose.orbitAngle * 0.38;
      halo.scale.set(pose.haloScale);
      halo.alpha = pose.haloAlpha;
    });

    TRANSFORMING_ORBITER_PULSE_IDS.forEach((partId, index) => {
      const pulse = parts[partId];
      pulse.visible = index === pose.pulseFrame && pose.pulseAlpha > 0.01;
      pulse.position.set(coreX, coreY);
      pulse.scale.set(pose.pulseScale);
      pulse.alpha = pose.pulseAlpha;
    });

    const core = parts[pose.corePart];
    core.visible = pose.coreAlpha > 0.01;
    core.position.set(coreX, coreY);
    core.scale.set(pose.coreScale);
    core.alpha = pose.coreAlpha;

    parts.perimeterRing.visible = pose.perimeterAlpha > 0.01;
    parts.perimeterRing.position.set(coreX, coreY);
    parts.perimeterRing.rotation = pose.perimeterRotation;
    parts.perimeterRing.scale.set(pose.perimeterScale);
    parts.perimeterRing.alpha = pose.perimeterAlpha;

    parts.leftEmitter.visible = !usesAuthoredSocketLayout && pose.leftEmitterAlpha > 0.01;
    parts.leftEmitter.position.set(
      -layout.emitterX - pose.leftEmitterRecoil,
      layout.emitterY
    );
    parts.leftEmitter.rotation = -pose.leftEmitterRecoil * 0.008;
    parts.leftEmitter.scale.set(layout.emitterScale);
    parts.leftEmitter.alpha = pose.leftEmitterAlpha;

    parts.rightEmitter.visible = !usesAuthoredSocketLayout && pose.rightEmitterAlpha > 0.01;
    parts.rightEmitter.position.set(
      layout.emitterX + pose.rightEmitterRecoil,
      layout.emitterY
    );
    parts.rightEmitter.rotation = pose.rightEmitterRecoil * 0.008;
    parts.rightEmitter.scale.set(layout.emitterScale);
    parts.rightEmitter.alpha = pose.rightEmitterAlpha;

    parts.laserHub.visible = pose.laserHubAlpha > 0.01;
    parts.laserHub.position.set(coreX, coreY);
    parts.laserHub.rotation = pose.laserHubRotation;
    parts.laserHub.scale.set(pose.laserHubScale);
    parts.laserHub.alpha = pose.laserHubAlpha;
  }

  private drawAssembledPreviewBossMotion(
    view: EntityView,
    entity: Entity,
    engine: GameEngine
  ) {
    const artwork = this.getPreviewBossArtwork(entity);
    if (
      artwork?.renderMode !== 'assembled'
      || !artwork.assembledMotionProfile
      || !view.sprite.visible
    ) {
      return false;
    }
    const motion = sampleAssembledBossMotion({
      profile: artwork.assembledMotionProfile,
      frameCount: engine.frameCount,
      reducedMotion: this.reducedMotion,
      charging: entity.isCharging,
      revivalStage: entity.bossRevivalStage,
      revivalProgress: entity.bossRevivalProgress,
      action: this.getPreviewBossActionPresentation(entity)
    });
    view.sprite.y += motion.offsetY;
    view.sprite.rotation += motion.rotation;
    view.sprite.scale.x *= motion.scaleX;
    view.sprite.scale.y *= motion.scaleY;
    // Physical hull artwork stays fully opaque. Attack warnings and damage
    // feedback are rendered by dedicated pooled effects instead of fading the
    // boss into disconnected-looking translucent pieces.
    view.sprite.alpha = 1;
    view.sprite.filters = null;
    return true;
  }

  private getBossComponentVisualScale(entity: Entity, component: BossComponentState) {
    const isCannon = component.id === 'left-cannon' || component.id === 'right-cannon';
    if (!isCannon) return 1;
    return entity.bossRigId === 'crown-claw' ? CROWNCLAW_ARM_SCALE : BOSS_CANNON_SCALE;
  }

  private drawBossComponentHealthBar(
    graphics: Graphics,
    entity: Entity,
    component: BossComponentState,
    visualScale: number
  ) {
    if (component.destroyed) return;
    const visualWidth = entity.width * component.widthRatio * visualScale;
    const visualHeight = entity.height * component.heightRatio * visualScale;
    const width = clamp(visualWidth * 0.52, 28, 58);
    const x = (component.centerXRatio - 0.5) * entity.width - width / 2;
    const y = (component.centerYRatio - 0.5) * entity.height - visualHeight / 2 - 8;
    const progress = clamp(component.hp / Math.max(1, component.maxHp), 0, 1);
    const fill = component.id === 'helmet'
      ? progress > 0.45 ? '#fef08a' : '#fb7185'
      : progress > 0.55 ? '#67e8f9' : progress > 0.25 ? '#facc15' : '#fb7185';

    graphics.roundRect(x, y, width, 5, 2.5).fill({
      color: '#020617',
      alpha: component.exposed ? 0.94 : 0.58
    });
    graphics.roundRect(x + 1, y + 1, Math.max(0, (width - 2) * progress), 3, 1.5)
      .fill({ color: component.exposed ? fill : '#475569', alpha: component.exposed ? 0.96 : 0.62 });
    graphics.roundRect(x, y, width, 5, 2.5).stroke({
      color: component.exposed ? '#fef08a' : '#64748b',
      width: component.exposed ? 1 : 0.75,
      alpha: component.exposed ? 0.82 : 0.46
    });
  }

  private drawCrownClawComponents(view: EntityView, entity: Entity, engine: GameEngine) {
    const rig = view.bossRig;
    if (!rig) return;
    const crown = rig.crownClaw;
    const bob = Math.sin(engine.frameCount * 0.04) * 5;
    const bodyTexture = this.textureBank.get(ASSETS.PIXI_BOSS_CROWNCLAW_CORE);
    crown.root.visible = true;
    crown.root.position.set(0, bob);
    crown.root.scale.set(entity.width / 1024);
    crown.body.visible = Boolean(bodyTexture);
    if (bodyTexture) crown.body.texture = bodyTexture;
    view.sprite.visible = !bodyTexture;

    const gait = engine.frameCount * 0.075;
    for (const [key, leg] of Object.entries(crown.legs) as [CrownClawLegId, Sprite][]) {
      const layout = CROWNCLAW_LEG_LAYOUT[key];
      const texture = this.textureBank.get(ASSETS.PIXI_BOSS_CROWNCLAW_LEGS[key]);
      leg.visible = Boolean(texture);
      if (texture) leg.texture = texture;
      const stride = Math.sin(gait + layout.phase) * 0.085;
      const tier = key.startsWith('front') ? 1 : key.startsWith('middle') ? 0.78 : 0.58;
      leg.rotation = layout.direction * (0.02 + stride * tier);
    }

    const previousState = this.seenBossComponents.get(entity.id);
    const nextState: Partial<Record<BossPartId, boolean>> = {};
    const componentById = new Map((entity.bossComponents ?? []).map((component) => [component.id, component]));
    for (const side of ['left', 'right'] as const) {
      const componentId: BossPartId = side === 'left' ? 'left-cannon' : 'right-cannon';
      const component = componentById.get(componentId);
      const destroyed = component?.destroyed ?? true;
      nextState[componentId] = destroyed;
      const gunTexture = this.textureBank.get(
        side === 'left' ? ASSETS.PIXI_BOSS_CROWNCLAW_GUN_LEFT : ASSETS.PIXI_BOSS_CROWNCLAW_GUN_RIGHT
      );
      const clawTexture = this.textureBank.get(
        side === 'left' ? ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_LEFT : ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_RIGHT
      );
      const active = !destroyed;
      const strikeInFlight = engine.entities.some((candidate) => (
        !candidate.markedForDeletion
        && candidate.bossOwnerId === entity.id
        && candidate.bossComponentId === componentId
        && (candidate.projectileVisualKind === 'crown-claw-left' || candidate.projectileVisualKind === 'crown-claw-right')
      ));
      crown.guns[side].visible = Boolean(active && gunTexture);
      crown.claws[side].visible = Boolean(active && clawTexture && !strikeInFlight);
      crown.guns[side].filters = null;
      crown.claws[side].filters = null;
      if (gunTexture) crown.guns[side].texture = gunTexture;
      if (clawTexture) crown.claws[side].texture = clawTexture;

      const attacking = entity.isCharging && entity.beamLaneSign === (side === 'left' ? -1 : 1);
      const weaponSwing = Math.sin(engine.frameCount * 0.055 + (side === 'left' ? 0 : Math.PI)) * 0.035;
      crown.guns[side].rotation = weaponSwing;
      crown.claws[side].rotation = weaponSwing + (attacking ? Math.sin(engine.frameCount * 0.42) * 0.055 : 0);
      const layout = CROWNCLAW_WEAPON_LAYOUT[side];
      crown.guns[side].position.set(layout.x, layout.y);
      crown.claws[side].position.set(layout.x, layout.y + (attacking ? 15 + Math.sin(engine.frameCount * 0.32) * 9 : 0));
      crown.guns[side].scale.set(CROWNCLAW_ARM_SCALE);
      crown.claws[side].scale.set(CROWNCLAW_ARM_SCALE);

      if (component) {
        this.drawBossComponentHealthBar(
          rig.componentHealth,
          entity,
          component,
          CROWNCLAW_ARM_SCALE
        );
      }

      if (component && previousState && !previousState[componentId] && destroyed) {
        const explosionX = entity.x + entity.width * component.centerXRatio;
        const explosionY = entity.y + entity.height * component.centerYRatio + bob;
        this.effectPool.spawnBossExplosion(explosionX, explosionY, Math.max(70, entity.width * 0.32), 1.45);
        if (clawTexture) {
          this.effectPool.spawnDetachedSprite(
            clawTexture,
            explosionX,
            explosionY,
            entity.width * component.widthRatio * CROWNCLAW_ARM_SCALE,
            entity.height * component.heightRatio * CROWNCLAW_ARM_SCALE,
            side === 'left' ? -1 : 1
          );
        }
        this.phaseText.text = `${component.label} SEVERED`;
        this.phaseText.style.fill = '#fb923c';
        this.phaseTextUntilFrame = engine.frameCount + 88;
      }
    }
    this.seenBossComponents.set(entity.id, nextState);
  }

  private drawBossComponents(view: EntityView, entity: Entity, engine: GameEngine) {
    const rig = view.bossRig;
    if (!rig) return;
    const components = entity.bossComponents ?? [];
    const bob = Math.sin(engine.frameCount * 0.04) * 5;
    rig.parts.y = bob;
    rig.componentHealth.y = bob;
    rig.componentHealth.clear();
    rig.crownClaw.root.visible = false;
    if (usesStandaloneBossArt(
      entity,
      Boolean(this.getPreviewBossArtwork(entity) || this.getPreviewBossAtlas(entity))
    )) {
      rig.parts.visible = false;
      rig.thrust.visible = false;
      Object.values(rig.partSprites).forEach((sprite) => {
        sprite.visible = false;
        sprite.filters = null;
      });

      const previousState = this.seenBossComponents.get(entity.id);
      const nextState: Partial<Record<BossPartId, boolean>> = {};
      const showInlineComponentState = !this.isPreviewBossEntity(entity);
      for (const component of components) {
        nextState[component.id] = component.destroyed;
        const visualScale = this.getBossComponentVisualScale(entity, component);
        if (!component.destroyed && showInlineComponentState) {
          this.drawBossComponentHealthBar(
            rig.componentHealth,
            entity,
            component,
            visualScale
          );
        }
        if (previousState && !previousState[component.id] && component.destroyed) {
          const explosionX = entity.x + entity.width * component.centerXRatio;
          const explosionY = entity.y + entity.height * component.centerYRatio + bob;
          this.effectPool.spawnBossExplosion(
            explosionX,
            explosionY,
            Math.max(58, entity.width * component.widthRatio * visualScale * 1.35),
            1.35
          );
          if (showInlineComponentState) {
            this.phaseText.text = component.id === 'helmet'
              ? 'CORE EXPOSED'
              : `${component.label} DESTROYED`;
            this.phaseText.style.fill = component.id === 'helmet' ? '#fef08a' : '#fb923c';
            this.phaseTextUntilFrame = engine.frameCount + 88;
          }
        }
      }
      this.seenBossComponents.set(entity.id, nextState);
      return;
    }
    if (entity.bossRigId === 'crown-claw') {
      rig.parts.visible = false;
      rig.thrust.visible = false;
      this.drawCrownClawComponents(view, entity, engine);
      return;
    }
    rig.parts.visible = components.length > 0;
    rig.thrust.visible = entity.bossRigId === 'paywall-siege';
    if (components.length === 0) {
      Object.values(rig.partSprites).forEach((sprite) => {
        sprite.visible = false;
      });
      this.seenBossComponents.delete(entity.id);
      return;
    }

    const weaponTextures: Partial<Record<BossRigId, Partial<Record<BossPartId, string>>>> = {
      'open-orbit': {
        'left-cannon': ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_LEFT,
        'right-cannon': ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT
      },
      'citation-storm': {
        'left-cannon': ASSETS.PIXI_BOSS_CITATION_CLAW_LEFT,
        'right-cannon': ASSETS.PIXI_BOSS_CITATION_CLAW_RIGHT
      },
      'paywall-siege': {
        'left-cannon': ASSETS.PIXI_BOSS_PAYWALL_CANNON_LEFT,
        'right-cannon': ASSETS.PIXI_BOSS_PAYWALL_CANNON_RIGHT,
        helmet: ASSETS.PIXI_BOSS_PAYWALL_HELMET
      }
    };
    const partTextures = entity.bossRigId ? weaponTextures[entity.bossRigId] ?? {} : {};
    const previousState = this.seenBossComponents.get(entity.id);
    const nextState: Partial<Record<BossPartId, boolean>> = {};
    for (const component of components) {
      const sprite = rig.partSprites[component.id];
      sprite.filters = null;
      const textureKey = partTextures[component.id];
      const texture = textureKey ? this.textureBank.get(textureKey) : undefined;
      const visualScale = this.getBossComponentVisualScale(entity, component);
      nextState[component.id] = component.destroyed;
      if (previousState && !previousState[component.id] && component.destroyed) {
        const explosionX = entity.x + entity.width * component.centerXRatio;
        const explosionY = entity.y + entity.height * component.centerYRatio + bob;
        this.effectPool.spawnBossExplosion(
          explosionX,
          explosionY,
          Math.max(58, entity.width * component.widthRatio * visualScale * 1.35),
          1.3
        );
        if (texture) {
          const direction = component.id === 'left-cannon' ? -1 : component.id === 'right-cannon' ? 1 : 0.65;
          this.effectPool.spawnDetachedSprite(
            texture,
            explosionX,
            explosionY,
            entity.width * component.widthRatio * visualScale,
            entity.height * component.heightRatio * visualScale,
            direction
          );
        }
        this.phaseText.text = component.id === 'helmet' ? 'CORE EXPOSED' : `${component.label} DESTROYED`;
        this.phaseText.style.fill = component.id === 'helmet' ? '#fef08a' : '#fb923c';
        this.phaseTextUntilFrame = engine.frameCount + 88;
      }
      sprite.visible = Boolean(texture && !component.destroyed);
      if (!texture || component.destroyed) continue;
      sprite.texture = texture;
      sprite.position.set(
        (component.centerXRatio - 0.5) * entity.width,
        (component.centerYRatio - 0.5) * entity.height
      );
      sprite.width = entity.width * component.widthRatio * visualScale;
      sprite.height = entity.height * component.heightRatio * visualScale;
      this.drawBossComponentHealthBar(
        rig.componentHealth,
        entity,
        component,
        visualScale
      );
      const movementScale = entity.bossRigId === 'citation-storm' ? 1.45 : 1;
      sprite.rotation = component.id === 'left-cannon'
        ? -0.04 + Math.sin(engine.frameCount * 0.05) * 0.025 * movementScale
        : component.id === 'right-cannon'
          ? 0.04 - Math.sin(engine.frameCount * 0.05) * 0.025 * movementScale
          : 0;
      if (entity.isCharging && component.id !== 'helmet') {
        sprite.y += 3 + Math.sin(engine.frameCount * 0.3) * 2;
      }
    }
    this.seenBossComponents.set(entity.id, nextState);

    const thrustFrameOrder = [0, 1, 2, 1] as const;
    const thrustFrameIndex = thrustFrameOrder[Math.floor(engine.frameCount / 4) % thrustFrameOrder.length];
    const thrustFrame = ASSETS.PIXI_BOSS_THRUSTER_FRAMES[thrustFrameIndex];
    const thrustTexture = this.textureBank.get(thrustFrame);
    rig.thrust.visible = Boolean(thrustTexture);
    if (thrustTexture) {
      const engineSpread = entity.bossRigId === 'paywall-siege' ? 0.16 : 0.18;
      const flameWidth = entity.width * (entity.bossRigId === 'paywall-siege' ? 0.13 : 0.15);
      const flameHeight = entity.height * (0.2 + Math.sin(engine.frameCount * 0.22) * 0.012);
      rig.thrust.position.set(0, entity.height * 0.34 + bob);
      rig.thrust.alpha = 0.9;
      rig.thrusterSprites.forEach((thruster, index) => {
        thruster.texture = thrustTexture;
        thruster.position.set((index === 0 ? -1 : 1) * entity.width * engineSpread, 0);
        thruster.width = flameWidth;
        thruster.height = flameHeight;
      });
    }

  }

  private drawBossRig(view: EntityView, entity: Entity, engine: GameEngine) {
    view.body.clear();
    view.trail.clear();
    view.aura.clear();
    const progress = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    const phaseColor = progress > 0.66 ? '#67e8f9' : progress > 0.33 ? '#facc15' : '#fb7185';

    const decayStage = clamp(entity.bossDecayStage, 0, 5);
    const previousPhase = this.seenBossPhase.get(entity.id);
    if (previousPhase !== undefined && decayStage > previousPhase) {
      const stageNeedsExplosion = entity.bossRigId !== 'paywall-siege' || decayStage >= 3;
      if (stageNeedsExplosion) {
        const side = decayStage % 2 === 0 ? 0.22 : -0.22;
        this.effectPool.spawnBossExplosion(
          entity.x + entity.width * (0.5 + side),
          entity.y + entity.height * (0.38 + decayStage * 0.08),
          entity.width * (decayStage >= 4 ? 0.74 : 0.46),
          decayStage >= 4 ? 1.8 : 1.1
        );
      }
      if (!this.isPreviewBossEntity(entity)) {
        this.phaseText.text = decayStage >= 5
          ? 'CRITICAL CORE FAILURE'
          : decayStage >= 4
            ? 'CORE CASING RUPTURED'
          : decayStage >= 3
            ? 'HULL BREACH'
            : decayStage >= 2
              ? 'CORE ARMOR BREACHED'
              : 'ARMOR FRACTURE';
        this.phaseText.style.fill = phaseColor;
        this.phaseTextUntilFrame = engine.frameCount + 96;
      }
    }
    this.seenBossPhase.set(entity.id, decayStage);
    if (progress < 0.52 && engine.frameCount % (engine.performanceMode ? 48 : 30) === 0) {
      this.effectPool.spawn('smoke', entity.x + entity.width * (0.25 + Math.random() * 0.5), entity.y + entity.height * (0.35 + Math.random() * 0.4), entity.width * 0.18, '#475569', 800);
      this.effectPool.spawn('spark', entity.x + entity.width * Math.random(), entity.y + entity.height * Math.random(), Math.max(3, entity.width * 0.035), phaseColor, 380);
    }
  }

  private clearBossDeathFragments() {
    for (const view of this.bossDeathFragmentViews) {
      view.sprite.removeFromParent();
      view.sprite.destroy({ texture: false, textureSource: false });
    }
    this.bossDeathFragmentViews = [];
  }

  private configureBossDeathFragments(snapshot: BossSnapshot) {
    this.clearBossDeathFragments();
    const destruction = snapshot.modularDestruction;
    if (!destruction) return false;
    for (const fragment of destruction.fragments) {
      const texture = this.getModularPreviewBossTexture(fragment.frameId);
      if (!texture) continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(fragment.anchorX, fragment.anchorY);
      sprite.position.set(
        fragment.x * destruction.designScaleX,
        fragment.y * destruction.designScaleY
      );
      sprite.rotation = fragment.rotation;
      sprite.scale.set(
        fragment.scaleX * destruction.designScaleX,
        fragment.scaleY * destruction.designScaleY
      );
      sprite.alpha = 1;
      sprite.visible = fragment.authored.delayFrames === 0;
      sprite.tint = '#ffffff';
      this.bossDeathFragments.addChild(sprite);
      this.bossDeathFragmentViews.push({ sprite, snapshot: fragment });
    }
    return this.bossDeathFragmentViews.length > 0;
  }

  private startBossDeath(snapshot: BossSnapshot) {
    this.bossDeathHandled = true;
    this.bossDeathAge = 0;
    this.bossDeathStage = -1;
    this.bossDeathRoot.visible = true;
    this.bossDeathRoot.position.set(snapshot.x + snapshot.width / 2, snapshot.y + snapshot.height / 2);
    this.bossDeathRoot.rotation = snapshot.rotation;
    this.bossDeathRoot.scale.set(1);
    this.bossDeathSprite.width = snapshot.width;
    this.bossDeathSprite.height = snapshot.height;
    this.bossDeathSprite.alpha = 1;
    this.bossDeathSprite.tint = '#ffffff';
    const usesModularFragments = this.configureBossDeathFragments(snapshot);
    this.bossDeathSprite.visible = !usesModularFragments;
    this.bossDeathCore.clear();
    this.bossDeathText.visible = false;
    this.bossDeathText.text = 'SECTOR CLEARED';
    this.bossDeathText.position.set(0, snapshot.height * 0.7);

    const request = ++this.bossDeathTextureRequest;
    if (usesModularFragments) return;
    const cached = this.textureBank.get(snapshot.textureKey);
    if (cached) {
      this.bossDeathSprite.texture = cached;
    } else {
      this.textureBank.load(snapshot.textureKey).then((texture) => {
        if (this.destroyed || request !== this.bossDeathTextureRequest) return;
        this.bossDeathSprite.texture = texture;
      }).catch(() => undefined);
    }
  }

  private updateBossPresentation(engine: GameEngine, deltaMs: number) {
    const boss = engine.entities.find((entity) => entity.type === EntityType.BOSS && !entity.markedForDeletion);
    if (boss) {
      this.lastBossSnapshot = {
        id: boss.id,
        x: boss.x,
        y: boss.y,
        width: boss.width,
        height: boss.height,
        textureKey: getDefaultEntityTexture(engine, boss) || ASSETS.FINAL_BOSS,
        rotation: boss.bossPresentationBankRadians,
        modularDestruction: this.modularBossDestructionSnapshot?.entityId === boss.id
          ? this.modularBossDestructionSnapshot
          : undefined
      };
      this.bossDeathHandled = false;
      this.bossDeathAge = -1;
      this.bossDeathRoot.visible = false;
      this.clearBossDeathFragments();
    } else if (engine.mainBossDefeated && engine.waveTransitionPending && this.lastBossSnapshot && !this.bossDeathHandled) {
      this.startBossDeath(this.lastBossSnapshot);
    } else if (!engine.mainBossDefeated && this.bossDeathAge < 0) {
      this.lastBossSnapshot = null;
      this.bossDeathHandled = false;
    }

    this.phaseText.visible = engine.frameCount <= this.phaseTextUntilFrame && engine.stats.isBossActive;
    if (this.phaseText.visible) {
      const remaining = this.phaseTextUntilFrame - engine.frameCount;
      this.phaseText.position.set(this.width / 2, this.height * 0.27);
      this.phaseText.alpha = clamp(remaining / 22, 0, 1);
      this.phaseText.scale.set(1 + Math.sin(remaining * 0.2) * 0.04);
    }

    if (this.bossDeathAge < 0 || !this.lastBossSnapshot) return;
    const snapshot = this.lastBossSnapshot;
    const previousAge = this.bossDeathAge;
    this.bossDeathAge += deltaMs;
    const deathDurationMs = snapshot.modularDestruction
      ? snapshot.modularDestruction.sequence.durationFrames * (1000 / 60)
      : 1320;
    const progress = clamp(this.bossDeathAge / deathDurationMs, 0, 1);
    this.bossDeathRoot.x = snapshot.x + snapshot.width / 2 + Math.sin(this.bossDeathAge * 0.12) * (1 - progress) * 8;
    this.bossDeathRoot.rotation = snapshot.rotation + Math.sin(this.bossDeathAge * 0.045) * 0.08 * (1 - progress);
    this.bossDeathRoot.scale.set(snapshot.modularDestruction ? 1 : 1 + progress * 0.22);
    this.bossDeathSprite.alpha = clamp(1 - Math.max(0, progress - 0.62) / 0.38, 0, 1);
    this.bossDeathSprite.tint = Math.floor(this.bossDeathAge / 70) % 2 === 0 ? '#ffffff' : '#fb7185';

    if (snapshot.modularDestruction) {
      const elapsedFrames = this.bossDeathAge * 60 / 1000;
      this.bossDeathFragmentViews.forEach((view) => {
        const pose = sampleModularBossDestructionFragment(
          snapshot.modularDestruction!.sequence,
          view.snapshot.authored,
          elapsedFrames
        );
        view.sprite.visible = pose.visible;
        view.sprite.position.set(
          (view.snapshot.x + pose.xOffset) * snapshot.modularDestruction!.designScaleX,
          (view.snapshot.y + pose.yOffset) * snapshot.modularDestruction!.designScaleY
        );
        view.sprite.rotation = view.snapshot.rotation + pose.rotationOffset;
        view.sprite.alpha = pose.alpha;
      });
    }

    this.bossDeathCore.clear();
    const corePulse = 1 + Math.sin(this.bossDeathAge * 0.035) * 0.18;
    this.bossDeathCore.circle(0, snapshot.height * 0.06, snapshot.width * (0.09 + progress * 0.18) * corePulse)
      .fill({ color: progress > 0.66 ? '#ffffff' : '#fef08a', alpha: 0.28 + progress * 0.55 });
    this.bossDeathCore.circle(0, snapshot.height * 0.06, snapshot.width * (0.15 + progress * 0.34))
      .stroke({ color: progress > 0.66 ? '#fb7185' : '#67e8f9', width: Math.max(1, 4 * (1 - progress)), alpha: 0.82 });

    const stages = [120, 300, 490, 690, 900];
    for (let stage = this.bossDeathStage + 1; stage < stages.length; stage++) {
      if (previousAge < stages[stage] && this.bossDeathAge >= stages[stage]) {
        const side = stage % 2 === 0 ? -1 : 1;
        const x = snapshot.x + snapshot.width / 2 + side * snapshot.width * (0.18 + stage * 0.035);
        const y = snapshot.y + snapshot.height * (0.3 + (stage % 3) * 0.18);
        const finalStage = stage === stages.length - 1;
        this.effectPool.spawnBossExplosion(x, y, finalStage ? snapshot.width * 1.45 : snapshot.width * 0.42, finalStage ? 2.8 : 1.2);
        this.bossDeathStage = stage;
      }
    }

    this.bossDeathText.visible = this.bossDeathAge >= 880;
    this.bossDeathText.alpha = clamp((this.bossDeathAge - 880) / 180, 0, 1) * (1 - progress * 0.38);
    this.bossDeathText.scale.set(0.9 + clamp((this.bossDeathAge - 880) / 240, 0, 1) * 0.12);
    if (progress >= 1) {
      this.bossDeathRoot.visible = false;
      this.bossDeathAge = -1;
      this.clearBossDeathFragments();
      this.lastBossSnapshot = null;
    }
  }

  private configureCombatLight(
    index: number,
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    tint: number,
    alpha: number
  ) {
    if (index < 0 || index >= this.combatLightNodes.length) return index;
    const light = this.combatLightNodes[index];
    showSoftRadialLight(light, x, y, radiusX, radiusY, tint, alpha);
    return index + 1;
  }

  private syncCombatLighting(engine: GameEngine) {
    for (let index = 0; index < this.combatLightNodes.length; index++) {
      hideSoftRadialLight(this.combatLightNodes[index]);
    }

    const reducedEffects = this.reducedMotion
      || engine.performanceMode
      || !engine.polishSettings.highDensityParticles;
    const intensityScale = reducedEffects
      ? engine.mobileProfile ? 0.42 : 0.56
      : engine.mobileProfile ? 0.72 : 1;
    const lightLimit = reducedEffects
      ? engine.mobileProfile ? 2 : 3
      : engine.mobileProfile ? 4 : COMBAT_LIGHT_POOL_SIZE;
    let lightCount = 0;

    // Research Charge owns the first presentation slots so its slow-moving
    // projectile and impact stay legible even when the combat-light cap is
    // reduced. Ordinary primary-fire shots deliberately receive no light.
    for (let index = 0; index < engine.entities.length && lightCount < lightLimit; index++) {
      const entity = engine.entities[index];
      if (entity.markedForDeletion) continue;
      const researchProjectile = entity.isPlayerShot
        && entity.projectileVisualKind === 'research-charge';
      const researchImpact = entity.type === EntityType.EFFECT
        && entity.spriteFrames?.[0] === RESEARCH_IMPACT_FRAME_URLS[0];
      if (!researchProjectile && !researchImpact) continue;

      const slowPulse = 0.94 + Math.sin((engine.frameCount + entity.variant * 7) * 0.045) * 0.06;
      const impactProgress = researchImpact && entity.maxLife > 0
        ? clamp(1 - entity.life / entity.maxLife, 0, 1)
        : 0;
      lightCount = this.configureCombatLight(
        lightCount,
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
        researchImpact
          ? clamp(entity.width * (0.82 + impactProgress * 0.28), 64, 176)
          : clamp(entity.width * 1.85, 52, 148),
        researchImpact
          ? clamp(entity.height * (0.82 + impactProgress * 0.28), 64, 176)
          : clamp(entity.height * 1.5, 48, 156),
        COMBAT_LIGHT_SPECIAL_COLOR,
        (researchImpact ? 0.27 - impactProgress * 0.13 : 0.24 * slowPulse) * intensityScale
      );
    }

    const bioBeamActive = engine.isBioBeamFiring();
    const researchBeamActive = (engine.activePowerups.get(PowerupType.RESEARCH_BEAM) ?? 0) > 0;
    if ((bioBeamActive || researchBeamActive) && lightCount < lightLimit) {
      lightCount = this.configureCombatLight(
        lightCount,
        engine.player.x + engine.player.width / 2,
        engine.player.y + engine.player.height * 0.08,
        Math.max(24, engine.player.width * 0.72),
        Math.max(22, engine.player.height * 0.36),
        bioBeamActive ? COMBAT_LIGHT_SPECIAL_COLOR : COMBAT_LIGHT_PLAYER_COLOR,
        0.42 * intensityScale
      );
    }

    // Magnet feedback is illumination, not a collision boundary. A broad,
    // low-alpha pooled gradient keeps it readable without the former yellow
    // circle line around the ship.
    if (engine.activePowerups.has(PowerupType.MAGNET) && lightCount < lightLimit) {
      const magnetPulse = 0.94 + Math.sin(engine.frameCount * 0.045) * 0.06;
      lightCount = this.configureCombatLight(
        lightCount,
        engine.player.x + engine.player.width / 2,
        engine.player.y + engine.player.height / 2,
        Math.max(48, engine.player.width * 1.45),
        Math.max(42, engine.player.height * 1.05),
        COMBAT_LIGHT_COIN_COLOR,
        0.1 * magnetPulse * intensityScale
      );
    }

    // Boss lights are admitted before projectile accents so mobile caps retain
    // the attack telegraph that matters most for dodging.
    for (let index = 0; index < engine.entities.length && lightCount < lightLimit; index++) {
      const entity = engine.entities[index];
      if (entity.markedForDeletion) continue;
      if (entity.type === EntityType.BOSS && entity.isCharging) {
        lightCount = this.configureCombatLight(
          lightCount,
          entity.x + entity.width / 2,
          entity.y + entity.height * 0.42,
          Math.max(34, entity.width * 0.34),
          Math.max(30, entity.height * 0.22),
          COMBAT_LIGHT_BOSS_COLOR,
          0.28 * intensityScale
        );
      }
    }

    for (let index = 0; index < engine.entities.length && lightCount < lightLimit; index++) {
      const entity = engine.entities[index];
      if (entity.markedForDeletion || entity.isPlayerShot) continue;
      const bossWeapon = entity.isBeam || Boolean(entity.bossOwnerId) || entity.projectileVisualKind === 'boss-ray';
      if (!bossWeapon) continue;
      const liveBeam = entity.isBeam && !entity.isTelegraph;
      const radiusX = entity.isBeam
        ? clamp(entity.width * 0.54, 12, this.width * 0.55)
        : clamp(entity.width * 1.15, 16, 72);
      const radiusY = entity.isBeam
        ? clamp(entity.height * 0.54, 12, this.height * 0.55)
        : clamp(entity.height * 1.15, 16, 72);
      lightCount = this.configureCombatLight(
        lightCount,
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
        radiusX,
        radiusY,
        liveBeam ? COMBAT_LIGHT_BEAM_COLOR : COMBAT_LIGHT_BOSS_COLOR,
        (entity.isTelegraph ? 0.09 : liveBeam ? 0.3 : 0.19) * intensityScale
      );
    }

    // Coin light is a continuous, slow pulse instead of a pickup-frame flash.
    // Boss-reward coins are admitted first so a large shower still reads as a
    // warm luminous cluster without assigning one light to every coin.
    const coinLightBudget = reducedEffects ? 1 : engine.mobileProfile ? 2 : 3;
    let coinLights = 0;
    for (let pass = 0; pass < 2 && lightCount < lightLimit && coinLights < coinLightBudget; pass++) {
      for (
        let index = 0;
        index < engine.entities.length && lightCount < lightLimit && coinLights < coinLightBudget;
        index++
      ) {
        const entity = engine.entities[index];
        if (entity.markedForDeletion || entity.type !== EntityType.COIN) continue;
        const bossRewardCoin = entity.coinBurstFrames > 0;
        if ((pass === 0) !== bossRewardCoin) continue;
        if (
          entity.x + entity.width < 0
          || entity.x > this.width
          || entity.y + entity.height < 0
          || entity.y > this.height
        ) continue;

        const slowPulse = 0.94 + Math.sin((engine.frameCount + entity.variant * 11) * 0.035) * 0.06;
        const radius = clamp(Math.max(entity.width, entity.height) * (bossRewardCoin ? 2.4 : 2.1), 32, 68);
        lightCount = this.configureCombatLight(
          lightCount,
          entity.x + entity.width / 2,
          entity.y + entity.height / 2,
          radius,
          radius,
          COMBAT_LIGHT_COIN_COLOR,
          (bossRewardCoin ? 0.14 : 0.11) * slowPulse * intensityScale
        );
        coinLights += 1;
      }
    }

    for (let index = 0; index < engine.entities.length && lightCount < lightLimit; index++) {
      const entity = engine.entities[index];
      if (entity.markedForDeletion || !entity.isPlayerShot) continue;
      if (entity.projectileVisualKind === 'research-charge') continue;
      const specialShot = Boolean(entity.shipAbilityKind)
        || entity.isBeam
        || entity.projectileVisualKind === 'bio-genome-lance'
        || entity.projectileVisualKind === 'eth-prism-volley'
        || entity.projectileVisualKind === 'btc-hash-burst';
      if (!specialShot) continue;
      lightCount = this.configureCombatLight(
        lightCount,
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
        clamp(entity.width * 1.12, 16, 64),
        clamp(entity.height * 0.86, 16, 64),
        COMBAT_LIGHT_SPECIAL_COLOR,
        0.23 * intensityScale
      );
    }

    this.combatLightRoot.visible = lightCount > 0;
  }

  private syncDamageRecoil(view: EntityView, entity: Entity, engine: GameEngine) {
    if (entity.type !== EntityType.BOSS && entity.type !== EntityType.MINI_BOSS) return;

    // Ordinary bullets keep their local flash/impact feedback without
    // restarting a whole-silhouette flinch. Only a large hull hit or a
    // destroyed component advances this simulation-owned timestamp.
    view.lastDamageFlashFrame = entity.lastDamageFlashFrame;
    const bossComponents = entity.bossComponents;
    if (bossComponents) {
      for (let index = 0; index < bossComponents.length; index += 1) {
        const component = bossComponents[index];
        view.lastComponentDamageFrames[component.id] = component.lastDamageFlashFrame;
      }
    }

    const newestImpactFrame = entity.bossSignificantImpactFrame;
    if (newestImpactFrame > view.damageRecoilFrame) {
      const impactXRatio = entity.bossSignificantImpactXRatio;
      const impactYRatio = entity.bossSignificantImpactYRatio;
      const componentImpact = entity.bossSignificantImpactIsComponent;
      const reducedEffects = this.reducedMotion
        || engine.performanceMode
        || !engine.polishSettings.highDensityParticles;
      const recoilScale = reducedEffects ? engine.mobileProfile ? 0.5 : 0.68 : engine.mobileProfile ? 0.8 : 1;
      view.damageRecoilFrame = newestImpactFrame;
      view.damageRecoilDirection = impactXRatio < 0.46
        ? 1
        : impactXRatio > 0.54
          ? -1
          : newestImpactFrame % 2 === 0 ? 1 : -1;
      view.damageRecoilStrength = (
        entity.type === EntityType.MINI_BOSS
          ? MINI_BOSS_RECOIL_PX
          : componentImpact ? BOSS_COMPONENT_RECOIL_PX : BOSS_HULL_RECOIL_PX
      ) * recoilScale * entity.bossSignificantImpactStrength;

      const impactX = entity.x + entity.width * impactXRatio;
      const impactY = entity.y + entity.height * impactYRatio;
      const sparkSize = Math.max(2.5, Math.min(7, entity.width * (componentImpact ? 0.035 : 0.026)));
      this.effectPool.spawn(
        'spark',
        impactX,
        impactY,
        sparkSize,
        componentImpact ? '#fef08a' : '#67e8f9',
        reducedEffects ? 150 : 230
      );
      if (!reducedEffects) {
        this.effectPool.spawnImpact(
          impactX,
          impactY,
          Math.max(12, Math.min(28, entity.width * (componentImpact ? 0.18 : 0.14)))
        );
      }
    }

    const recoilAge = engine.frameCount - view.damageRecoilFrame;
    if (recoilAge < 0 || recoilAge >= DAMAGE_RECOIL_DURATION_FRAMES) return;
    const damping = Math.exp(-recoilAge * 0.24);
    const oscillation = Math.cos(recoilAge * 1.12);
    view.root.position.x += view.damageRecoilDirection * view.damageRecoilStrength * damping * oscillation;
    view.root.position.y += view.damageRecoilStrength * 0.24 * damping * Math.sin(recoilAge * 1.34);
  }

  private drawFlash(view: EntityView, entity: Entity) {
    view.flash.clear();
    if (entity.type === EntityType.BOSS) {
      view.sprite.filters = null;
      view.body.filters = null;
      if (view.bossRig) {
        view.bossRig.parts.filters = null;
        view.bossRig.crownClaw.root.filters = null;
        view.bossRig.crownClaw.body.filters = null;
        Object.values(view.bossRig.crownClaw.legs).forEach((leg) => {
          leg.filters = null;
        });
      }
      return;
    }
    if (entity.type === EntityType.MINI_BOSS) {
      view.sprite.filters = null;
      view.body.filters = null;
      return;
    }
    if (entity.flashFrames <= 0) return;
    const alpha = clamp(entity.flashFrames / 10, 0.15, 0.74);
    if (entity.type === EntityType.ENEMY_BRICK) {
      view.flash.roundRect(-entity.width * 0.34, -entity.height * 0.34, entity.width * 0.68, entity.height * 0.68, 7)
        .fill({ color: '#ffffff', alpha });
    } else {
      view.flash.ellipse(0, 0, entity.width * 0.42, entity.height * 0.38)
        .fill({ color: '#ffffff', alpha });
    }
  }

  private updateEntityView(view: EntityView, entity: Entity, engine: GameEngine) {
    view.seenFrame = this.renderFrame;
    view.lastMarkedForDeletion = entity.markedForDeletion;
    view.root.visible = !entity.markedForDeletion;
    view.root.position.set(entity.x + entity.width / 2, entity.y + entity.height / 2);
    view.root.alpha = clamp(entity.spriteStyle?.opacity ?? 1, 0, 1);
    view.root.scale.set(1);
    view.root.rotation = 0;
    view.sprite.visible = true;
    view.sprite.alpha = 1;
    view.sprite.tint = '#ffffff';

    if (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE) {
      this.drawProjectile(view, entity, engine);
    } else if (entity.type === EntityType.EFFECT) {
      view.sprite.visible = false;
      view.body.clear();
      view.label.text = '';
      const effect = entity as VisualEffect;
      if (effect.effectType === 'text') {
        view.label.text = effect.text ?? '';
        view.label.style.fontSize = effect.fontSize;
        view.label.style.fill = effect.color;
        view.label.alpha = clamp(effect.life / Math.max(1, effect.maxLife), 0, 1);
      } else if (effect.effectType === 'sprite' && effect.spriteFrames?.length) {
        const age = Math.max(0, effect.maxLife - effect.life);
        const frameIndex = Math.min(effect.spriteFrames.length - 1, Math.floor(age / 6));
        this.setTexture(view, effect.spriteFrames[frameIndex]);
        view.sprite.visible = true;
        view.sprite.width = effect.width;
        view.sprite.height = effect.height;
        view.sprite.alpha = clamp(effect.life / Math.min(12, Math.max(1, effect.maxLife)), 0, 1);
      } else {
        const progress = 1 - clamp(effect.life / Math.max(1, effect.maxLife), 0, 1);
        view.body.circle(0, 0, 10 + progress * 80).stroke({ color: effect.color, width: Math.max(1, 3 * (1 - progress)), alpha: 1 - progress });
      }
    } else if (entity.type === EntityType.PARTICLE) {
      view.sprite.visible = false;
      view.body.clear();
      view.body.rect(-entity.width / 2, -entity.height / 2, entity.width, entity.height).fill({
        color: entity.color,
        alpha: clamp(entity.life / Math.max(1, entity.maxLife), 0, 1)
      });
    } else {
      const textureKey = this.getPreviewBossArtwork(entity)?.url
        ?? (entity.type === EntityType.PLAYER
        ? this.playerSteeringTextureKey ?? engine.playerShipUrl
        : getDefaultEntityTexture(engine, entity));
      this.setTexture(view, textureKey);
      const styleScale = entity.spriteStyle?.scale ?? 1;
      view.sprite.width = entity.width * styleScale;
      view.sprite.height = entity.height * styleScale;
      view.sprite.scale.x = Math.abs(view.sprite.scale.x) * (entity.spriteStyle?.flipX ? -1 : 1);
      view.sprite.rotation = ((entity.spriteStyle?.rotationDegrees ?? 0) * Math.PI) / 180;
      this.drawFallbackBody(view, entity);
    }

    if (entity.type === EntityType.PLAYER) {
      this.drawPlayerRig(view, entity, engine);
    } else if (entity.type === EntityType.BOSS) {
      // Authored path banking is presentation-only. Debug bounds and gameplay
      // collision continue to use the unrotated entity x/y/width/height AABB.
      view.root.rotation = entity.bossPresentationBankRadians;
      const bossComponents = entity.bossComponents ?? [];
      const leftDestroyed = bossComponents.find((component) => component.id === 'left-cannon')?.destroyed ?? false;
      const rightDestroyed = bossComponents.find((component) => component.id === 'right-cannon')?.destroyed ?? false;
      if ((entity.bossRigId === 'open-orbit' || entity.bossRigId === 'citation-storm') && rightDestroyed && !leftDestroyed) {
        view.sprite.scale.x = -Math.abs(view.sprite.scale.x);
      }
      view.sprite.y = Math.sin(engine.frameCount * 0.04) * 5;
      this.drawBossComponents(view, entity, engine);
      this.drawBossRig(view, entity, engine);
      const articulatedBossReady = this.drawArticulatedGeneratedBoss(view, entity, engine);
      this.drawAssembledPreviewBossMotion(view, entity, engine);
      const previewAtlasReady = this.drawPreviewBossAtlas(view, entity, engine);
      const modularPreviewReady = this.drawModularPreviewBoss(view, entity, engine);
      if (entity.bossAttackArchetype === 'rail-serpent' || entity.bossAttackArchetype === 'prism-moth') {
        view.sprite.visible = !articulatedBossReady;
      }
      if (this.isPreviewBossEntity(entity) && this.previewBossArtwork?.articulatedAtlas) {
        view.sprite.visible = !previewAtlasReady;
      }
      if (this.isPreviewBossEntity(entity) && this.previewBossArtwork?.modularRig) {
        view.sprite.visible = !modularPreviewReady;
      }
    } else if (entity.type === EntityType.MINI_BOSS) {
      view.sprite.y = Math.sin(engine.frameCount * 0.08) * 4;
      view.root.rotation = Math.sin(engine.frameCount * 0.025) * 0.035;
    } else if (entity.type === EntityType.ENEMY_DRONE) {
      view.root.rotation = entity.formation === 'spiral'
        ? Math.PI / 2 + entity.angle
        : clamp(entity.vx * 0.045, -0.34, 0.34);
    } else if (entity.type === EntityType.ENEMY_SWARM) {
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.08) * 0.14;
      view.root.scale.set(1 + Math.sin((engine.frameCount + entity.variant) * 0.12) * 0.04);
    } else if (entity.type === EntityType.ENEMY_BRICK) {
      // Belt asteroids keep a stable silhouette; only the formation bulwark
      // enemies use the hovering rotation animation.
      if (entity.variant < 900) {
        view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.03) * 0.2;
      }
    } else if (entity.type === EntityType.ENEMY_JOURNAL || entity.type === EntityType.ENEMY_INVADER) {
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.05) * 0.09;
    } else if (entity.type === EntityType.COIN) {
      // The RSC frame art supplies the 3D yaw flip. A brief presentation-only
      // scale pulse makes boss showers readable without changing pickup
      // geometry. Its illumination comes only from the edge-free pooled light.
      view.root.rotation = 0;
      view.aura.clear();
      const burstPulse = entity.coinBurstFrames > 0
        ? 1.04 + Math.sin((engine.frameCount + entity.variant) * 0.2) * 0.08
        : 1;
      view.root.scale.set(burstPulse);
    } else if (entity.type === EntityType.BOMB) {
      const pulse = 1 + Math.sin((engine.frameCount + entity.variant) * 0.18) * 0.08;
      view.root.scale.set(pulse);
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.045) * 0.12;
    } else if (entity.type === EntityType.POWERUP) {
      const isMaxShot = entity.text === PowerupType.MAX_SHOT;
      const maxShotPulse = 1 + Math.sin((engine.frameCount + entity.variant) * 0.16) * 0.055;
      view.root.scale.set(1.22);
      if (isMaxShot) view.root.scale.set(1.4 * maxShotPulse);
      view.root.rotation = isMaxShot ? 0 : Math.sin((engine.frameCount + entity.variant) * 0.045) * 0.035;
      view.aura.clear();
    }

    this.syncDamageRecoil(view, entity, engine);

    if (entity.isElite && isEnemyType(entity.type)) {
      const pulse = 0.74 + Math.sin((engine.frameCount + entity.variant) * 0.09) * 0.16;
      view.aura.ellipse(0, 0, entity.width * 0.58, entity.height * 0.52)
        .stroke({ color: '#c4b5fd', width: 2, alpha: pulse });
    }

    if (entity.type === EntityType.MINI_BOSS || entity.isElite) {
      this.drawHealthBar(view, entity);
    } else if (entity.type === EntityType.BOSS) {
      view.health.clear();
      view.label.text = '';
    }
    if (entity.flashFrames > 0 || view.lastFlashFrames > 0) {
      this.drawFlash(view, entity);
    }

    if (
      entity.type !== EntityType.BOSS
      && entity.type !== EntityType.MINI_BOSS
      && entity.flashFrames > view.lastFlashFrames + 2
    ) {
      this.effectPool.spawnImpact(
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
        Math.max(14, Math.min(34, entity.width * 0.34))
      );
      this.effectPool.spawn('ring', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(18, entity.width * 0.6), '#ffffff', 180);
      this.effectPool.spawn('spark', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(2, entity.width * 0.04), entity.color || '#ffffff', 220);
    }
    view.lastFlashFrames = entity.flashFrames;
    view.lastHp = entity.hp;
  }

  private syncEntities(engine: GameEngine) {
    const entities = engine.entities;
    this.previewBossRuntimeEntityId = (
      this.previewBossArtworkReady
      || this.previewBossAtlasReady
      || this.modularPreviewBossReady
      || this.previewBossVfxReady
    )
      ? entities.find((entity) => this.isPreviewBossEntity(entity))?.id ?? null
      : null;
    for (const entity of entities) {
      if (entity.markedForDeletion) continue;
      let view = this.views.get(entity.id);
      if (!view) {
        view = this.createEntityView(entity);
        this.views.set(entity.id, view);
        if (isEnemyType(entity.type) && entity.y > -entity.height * 2) {
          this.effectPool.spawn('ring', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(22, entity.width * 0.55), entity.type === EntityType.BOSS ? '#fef08a' : '#67e8f9', 300);
        }
      }
      this.updateEntityView(view, entity, engine);
    }

    const playerView = this.views.get('__player__') ?? (() => {
      const view = this.createEntityView(engine.player);
      view.id = '__player__';
      this.views.set('__player__', view);
      return view;
    })();
    this.updateEntityView(playerView, engine.player, engine);
    playerView.root.visible = engine.lives > 0 || engine.deathSequenceFrames > 0;

    for (const [id, view] of this.views) {
      if (id.startsWith('__') || view.seenFrame === this.renderFrame) continue;
      if (isEnemyType(view.type) && view.lastHp <= 0 && view.root.y > -80 && view.root.y < this.height + 80) {
        const size = view.type === EntityType.BOSS ? 180 : view.type === EntityType.MINI_BOSS ? 110 : 46;
        if (view.type === EntityType.BOSS) this.effectPool.spawnBossExplosion(view.root.x, view.root.y, size, 2.2);
        else if (view.type === EntityType.MINI_BOSS) this.effectPool.spawnExplosion(view.root.x, view.root.y, size, '#67e8f9', 0.85);
        else this.effectPool.spawnEnemyExplosion(view.root.x, view.root.y, size, '#67e8f9');
      }
      this.views.delete(id);
      this.seenBossPhase.delete(id);
      this.seenBossComponents.delete(id);
      this.releaseEntityView(view);
    }
  }

  private syncGunPods(engine: GameEngine) {
    const companions = engine.getSquadCompanionVisuals();
    if (companions.length === 0 || engine.lives <= 0) {
      this.gunPodRoot.visible = false;
      return;
    }

    this.gunPodRoot.visible = true;
    this.gunPodRoot.alpha = 1;
    const takeoff = engine.getStageTakeoffPresentation();
    const takeoffActive = takeoff.phase !== 'idle';
    const thrusterFrameCount = ASSETS.PIXI_THRUSTER_FRAMES.length;
    const thrusterFrameDelay = Math.max(2, Math.round(6 - takeoff.thrustStrength * 4));
    const thrusterTexture = takeoffActive
      ? this.textureBank.get(
        ASSETS.PIXI_THRUSTER_FRAMES[Math.floor(engine.frameCount / thrusterFrameDelay) % thrusterFrameCount]
      )
      : null;
    const speedLevel = clamp(
      Math.floor(engine.stats.upgrades.speed || 0),
      0,
      PLAYER_THRUSTER_COLORS.length - 1
    );
    const [, thrusterTint] = PLAYER_THRUSTER_COLORS[speedLevel];
    for (let index = 0; index < this.gunPodSprites.length; index++) {
      const pod = this.gunPodSprites[index];
      const thruster = this.gunPodThrusterSprites[index];
      const companion = companions[index];
      const textureKey = companion?.frames[companion.frameIndex] ?? '';
      const texture = textureKey ? this.textureBank.get(textureKey) : null;
      pod.visible = Boolean(companion && texture);
      thruster.visible = Boolean(takeoffActive && companion && texture && thrusterTexture);
      if (!pod.visible || !texture || !companion) {
        thruster.visible = false;
        continue;
      }
      pod.texture = texture;
      pod.width = companion.width * companion.scale;
      pod.height = companion.height * companion.scale;
      pod.alpha = companion.alpha;
      pod.position.set(companion.x, companion.y);
      pod.rotation = Math.sin(engine.frameCount * 0.04 + index * Math.PI) * 0.028;

      if (thruster.visible && thrusterTexture) {
        const thrustScale = Math.min(3.4, 0.8 + takeoff.thrustStrength * 0.8 + takeoff.travel * 1.8);
        thruster.texture = thrusterTexture;
        thruster.tint = thrusterTint;
        thruster.alpha = companion.alpha * 0.9;
        thruster.rotation = -Math.PI / 2;
        thruster.position.set(
          companion.x,
          companion.y + companion.height * companion.scale * 0.28
        );
        thruster.width = companion.height * companion.scale * 0.28 * thrustScale;
        thruster.height = companion.width * companion.scale * 0.1;
      }
    }
  }

  private syncStageLaunchStreak(engine: GameEngine, takeoff: StageTakeoffPresentation) {
    this.stageLaunchStreak.clear();
    const streakStrength = takeoff.phase === 'launch'
      ? clamp((takeoff.travel - 0.18) / 0.82, 0, 1)
      : 0;
    this.stageLaunchStreak.visible = streakStrength > 0.01 && engine.lives > 0;
    if (!this.stageLaunchStreak.visible) return;

    const centerX = engine.player.x + engine.player.width / 2;
    const centerY = engine.player.y + engine.player.height / 2;
    const tailStartY = centerY + engine.player.height * 0.24;
    const tailLength = Math.min(
      this.height * 0.92,
      engine.player.height * (1.3 + streakStrength * 8.2)
    );
    const tailEndY = tailStartY + tailLength;
    const pulse = 0.92 + Math.sin(engine.frameCount * 0.48) * 0.08;
    this.stageLaunchStreak
      .moveTo(centerX, tailStartY)
      .lineTo(centerX, tailEndY)
      .stroke({ color: '#0ea5e9', width: 22 + streakStrength * 14, alpha: 0.08 * streakStrength * pulse })
      .moveTo(centerX, tailStartY)
      .lineTo(centerX, tailEndY)
      .stroke({ color: '#38bdf8', width: 7 + streakStrength * 5, alpha: 0.42 * streakStrength * pulse })
      .moveTo(centerX, tailStartY)
      .lineTo(centerX, tailEndY)
      .stroke({ color: '#e0f2fe', width: 1.5 + streakStrength * 1.8, alpha: 0.94 * streakStrength });
  }

  private syncPlayerThrusters(engine: GameEngine) {
    const frameCount = ASSETS.PIXI_THRUSTER_FRAMES.length;
    const speedLevel = clamp(Math.floor(engine.stats.upgrades.speed || 0), 0, PLAYER_THRUSTER_COLORS.length - 1);
    const takeoff = engine.getStageTakeoffPresentation();
    const takeoffActive = takeoff.phase !== 'idle';
    this.syncStageLaunchStreak(engine, takeoff);
    const frameDelay = takeoffActive
      ? Math.max(2, Math.round(6 - takeoff.thrustStrength * 4))
      : Math.max(2, 7 - speedLevel);
    const texture = this.textureBank.get(ASSETS.PIXI_THRUSTER_FRAMES[Math.floor(engine.frameCount / frameDelay) % frameCount]);
    const visible = Boolean(texture && engine.lives > 0 && engine.playerDrawAlpha > 0.02);
    this.playerThrusterRoot.visible = visible;
    if (!visible || !texture) return;

    const [, configuredEdge] = PLAYER_THRUSTER_COLORS[speedLevel];
    const edge = takeoff.phase === 'launch' ? '#38bdf8' : configuredEdge;
    const movement = Math.min(1, Math.hypot(engine.playerVel.x, engine.playerVel.y) / 7);
    const cinematic = engine.introFlightFrames > 0 || takeoffActive;
    const departureStrength = takeoffActive ? clamp(takeoff.thrustStrength, 0, 1) : 0;
    const departureBoost = takeoffActive
      ? 0.9 + departureStrength * 0.8 + takeoff.travel * 4.2
      : 1;
    const rawSizeBoost = (1 + speedLevel * 0.115 + movement * 0.2)
      * (cinematic ? 1.28 : 1)
      * departureBoost;
    const sizeBoost = takeoffActive
      ? Math.min(STAGE_TAKEOFF_THRUSTER_VISUAL_CAP, rawSizeBoost)
      : rawSizeBoost;
    const centerX = engine.player.x + engine.player.width / 2;
    const centerY = engine.player.y + engine.player.height / 2;
    this.playerThrusterRoot.position.set(centerX, centerY);
    this.playerThrusterRoot.rotation = 0;
    this.playerThrusterRoot.scale.set(engine.playerDrawScale * 0.95);
    this.playerThrusterRoot.alpha = engine.playerDrawAlpha;

    const hardBank = !takeoffActive
      && (this.playerSteeringState === 'hard-left' || this.playerSteeringState === 'hard-right');
    for (let index = 0; index < this.playerThrusters.length; index++) {
      const thruster = this.playerThrusters[index];
      thruster.visible = !hardBank || index === 0;
      if (!thruster.visible) continue;
      thruster.texture = texture;
      thruster.tint = edge;
      thruster.position.set(
        hardBank ? 0 : (index === 0 ? -1 : 1) * engine.player.width * 0.16,
        engine.player.height * (hardBank ? 0.34 : 0.3)
      );
      thruster.width = engine.player.height * 0.31 * sizeBoost;
      thruster.height = engine.player.width
        * (0.12 + speedLevel * 0.005)
        * (1 + departureStrength * 0.34);
    }
  }

  private syncBioPrimaryBeam(engine: GameEngine) {
    const active = engine.isBioBeamFiring();
    this.bioBeamRoot.visible = active;
    this.bioBeamAura.clear();
    this.bioBeamCore.clear();
    this.bioBeamEmitter.visible = active;
    if (!active) {
      this.bioBeamVisualStartFrame = -1;
      return;
    }

    if (this.bioBeamVisualStartFrame < 0) {
      this.bioBeamVisualStartFrame = engine.frameCount;
    }

    const level = Math.min(engine.stats.upgrades.fireRate || 0, 7);
    const frames = getPlayerWeaponFrames('bio-laser', level);
    const launchFrame = getPlayerWeaponLaunchFrameIndex(
      engine.frameCount - this.bioBeamVisualStartFrame,
      frames.length
    );
    const launchProgress = (launchFrame + 1) / frames.length;
    const color = level > 0 ? '#38bdf8' : '#65f59a';
    const centerX = engine.player.x + engine.player.width / 2;
    const endY = Math.max(0, engine.player.y + engine.player.height * 0.2);
    const width = (5 + level * 1.55) * launchProgress;
    const pulse = 0.94 + Math.sin(engine.frameCount * 0.42) * 0.06;
    this.bioBeamAura.rect(centerX - width * 1.8, 0, width * 3.6, endY)
      .fill({ color, alpha: 0.15 * pulse });
    this.bioBeamAura.rect(centerX - width * 0.72, 0, width * 1.44, endY)
      .fill({ color, alpha: 0.62 });
    this.bioBeamCore.rect(centerX - Math.max(1.5, width * 0.2), 0, Math.max(3, width * 0.4), endY)
      .fill({ color: '#ffffff', alpha: 0.96 });
    const textureKey = frames[launchFrame];
    this.bioBeamEmitter.texture = this.textureBank.get(textureKey) ?? Texture.WHITE;
    this.bioBeamEmitter.tint = '#ffffff';
    this.bioBeamEmitter.alpha = 0.98;
    this.bioBeamEmitter.position.set(centerX, endY + engine.player.height * 0.08);
    this.bioBeamEmitter.width = 18 + level * 3.4;
    this.bioBeamEmitter.height = 42 + level * 6.2;
  }

  private syncWallHealth(engine: GameEngine) {
    const segments = engine.entities.filter((entity) => entity.type === EntityType.ENEMY_INVADER && !entity.markedForDeletion);
    this.wallHealthRoot.visible = segments.length > 0;
    this.wallHealthBar.clear();
    this.wallHealthLabel.text = '';
    if (segments.length === 0) return;

    const totalHp = segments.reduce((sum, segment) => sum + Math.max(0, segment.hp), 0);
    const totalMaxHp = segments.reduce((sum, segment) => sum + Math.max(1, segment.maxHp), 0);
    const progress = clamp(totalHp / Math.max(1, totalMaxHp), 0, 1);
    const left = Math.min(...segments.map((segment) => segment.x));
    const right = Math.max(...segments.map((segment) => segment.x + segment.width));
    const top = Math.min(...segments.map((segment) => segment.y));
    const width = clamp(right - left, 150, this.width * 0.74);
    this.wallHealthRoot.position.set((left + right) / 2, Math.max(76, top - 14));
    this.wallHealthBar.roundRect(-width / 2, 0, width, 9, 4).fill({ color: '#020617', alpha: 0.94 });
    this.wallHealthBar.roundRect(-width / 2 + 1, 1, Math.max(0, (width - 2) * progress), 7, 3)
      .fill(progress > 0.5 ? '#34d399' : progress > 0.22 ? '#facc15' : '#fb7185');
    this.wallHealthBar.roundRect(-width / 2, 0, width, 9, 4).stroke({ color: '#bae6fd', width: 1, alpha: 0.8 });
    this.wallHealthLabel.text = `PAYWALL INTEGRITY ${Math.ceil(progress * 100)}%`;
    this.wallHealthLabel.position.set(0, -9);
  }

  private syncBossHealthHud(engine: GameEngine) {
    const boss = engine.entities.find((entity) => (
      entity.type === EntityType.BOSS && !entity.markedForDeletion
    ));
    this.bossHealthRoot.visible = Boolean(boss);
    this.bossHealthBar.clear();
    this.bossHealthName.text = '';
    this.bossHealthPercent.text = '';
    if (!boss) return;

    const frameWidth = Math.min(clamp(this.width * 0.76, 210, 342), Math.max(180, this.width - 20));
    const frameHeight = frameWidth * (143 / 737);
    const progress = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const eventId = boss.sourceEventId ?? '';
    const configuredName = boss.text?.trim();
    const name = configuredName && configuredName !== 'GATEKEEPER'
      ? configuredName
      : eventId.includes('citation')
      ? 'REVIEW SENTINEL'
      : boss.bossRigId === 'crown-claw'
        ? 'ASTRAL CROWNCLAW'
        : boss.bossRigId === 'paywall-siege'
          ? 'PEER REVIEW DECIMATOR'
          : 'GATEKEEPER SENTINEL';
    const barWidth = frameWidth * 0.68;
    const barY = frameHeight * 0.14;

    this.bossHealthRoot.position.set(this.width / 2, this.width < 520 ? 78 : 82);
    this.bossHealthFrame.width = frameWidth;
    this.bossHealthFrame.height = frameHeight;
    this.bossHealthFrame.alpha = 0.96;
    this.bossHealthBar.roundRect(-barWidth / 2, barY, barWidth, 9, 3)
      .fill({ color: '#170508', alpha: 0.98 });
    this.bossHealthBar.roundRect(-barWidth / 2 + 1, barY + 1, Math.max(0, (barWidth - 2) * progress), 7, 2)
      .fill('#ef233c');
    this.bossHealthBar.roundRect(-barWidth / 2, barY, barWidth, 9, 3)
      .stroke({ color: '#ff6b76', width: 1, alpha: 0.72 });
    this.bossHealthName.text = name;
    this.bossHealthName.position.set(-frameWidth * 0.08, -frameHeight * 0.13);
    this.bossHealthPercent.text = `${Math.ceil(progress * 100)}%`;
    this.bossHealthPercent.position.set(frameWidth * 0.29, -frameHeight * 0.13);
  }

  private syncPlayerAfterimages(engine: GameEngine) {
    const existing = this.layers.player.getChildByLabel('player-afterimages');
    let root: Container;
    if (existing instanceof Container) {
      root = existing;
    } else {
      root = new Container({ label: 'player-afterimages' });
      this.layers.player.addChildAt(root, 0);
    }
    const texture = this.textureBank.get(this.playerSteeringTextureKey ?? engine.playerShipUrl);
    const desired = engine.performanceMode ? Math.min(2, engine.playerAfterimages.length) : engine.playerAfterimages.length;
    while (root.children.length < desired) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      root.addChild(sprite);
    }
    for (let index = 0; index < root.children.length; index++) {
      const sprite = root.children[index] as Sprite;
      const afterimage = engine.playerAfterimages[index];
      sprite.visible = Boolean(afterimage && texture);
      if (!afterimage || !texture) continue;
      sprite.texture = texture;
      sprite.position.set(afterimage.x + afterimage.width / 2, afterimage.y + afterimage.height / 2);
      sprite.width = afterimage.width;
      sprite.height = afterimage.height;
      sprite.rotation = 0;
      sprite.alpha = afterimage.alpha * 0.65;
      sprite.tint = '#67e8f9';
    }
  }

  private syncResearchBeam(engine: GameEngine) {
    const key = '__research-beam__';
    let view = this.views.get(key);
    const remaining = engine.activePowerups.get(PowerupType.RESEARCH_BEAM) || 0;
    if (remaining <= 0) {
      if (view) view.root.visible = false;
      return;
    }
    if (!view) {
      const dummy = new Entity(EntityType.EFFECT, 0, 0);
      view = this.createEntityView(dummy);
      view.id = key;
      this.views.set(key, view);
    }
    view.seenFrame = this.renderFrame;
    view.root.visible = true;
    view.root.position.set(0, 0);
    view.root.scale.set(1);
    view.root.rotation = 0;
    view.root.alpha = clamp(remaining / 36, 0, 1);
    view.sprite.visible = false;
    view.body.clear();
    view.aura.clear();
    view.trail.clear();
    view.flash.clear();
    view.health.clear();
    view.label.text = '';
    const centerX = engine.player.x + engine.player.width / 2;
    const endY = engine.player.y + engine.player.height * 0.4;
    const width = this.width < 520 ? 48 : 60;
    const pulse = 0.8 + Math.sin(engine.frameCount * 0.28) * 0.2;
    view.aura.rect(centerX - width * 0.72, 0, width * 1.44, endY).fill({ color: '#a855f7', alpha: 0.13 * pulse });
    view.body.rect(centerX - width * 0.24, 0, width * 0.48, endY).fill({ color: '#22d3ee', alpha: 0.62 });
    view.body.rect(centerX - width * 0.08, 0, width * 0.16, endY).fill({ color: '#ffffff', alpha: 0.95 });
  }

  private syncCornerAmbushPresentation(engine: GameEngine) {
    let boss: Entity | null = null;
    for (const candidate of engine.entities) {
      const presentation = candidate.bossActionPresentation;
      if (
        candidate.type === EntityType.BOSS
        && !candidate.markedForDeletion
        && presentation
        && (
          String(presentation.primitiveId) === CORNER_AMBUSH_BEAM_PRIMITIVE_ID
          || String(presentation.primitiveId) === CORNER_AMBUSH_RAM_PRIMITIVE_ID
        )
        && (presentation.stage === 'warning' || presentation.stage === 'fire')
      ) {
        boss = candidate;
        break;
      }
    }

    this.cornerAmbushBossId = boss?.id ?? null;
    this.cornerAmbushShade.clear();
    this.cornerAmbushGuide.clear();
    this.cornerAmbushShade.visible = Boolean(boss);
    this.cornerAmbushGuide.visible = false;
    if (!boss) return;

    const presentation = boss.bossActionPresentation;
    if (!presentation) return;
    const isRam = String(presentation.primitiveId) === CORNER_AMBUSH_RAM_PRIMITIVE_ID;
    const warning = presentation.stage === 'warning';
    const actionDuration = Math.max(1, presentation.endFrame - presentation.startFrame);
    const actionProgress = clamp(
      (boss.attackTimer - presentation.startFrame) / actionDuration,
      0,
      1
    );
    const dimProgress = warning ? smoothstep(actionProgress / 0.22) : 1;
    const bossReveal = warning
      ? smoothstep((actionProgress - 0.22) / 0.18)
      : 1;
    const shakeX = engine.shakeX;
    const shakeY = engine.shakeY;
    const overscan = Math.max(this.width, this.height) * 2;

    // Overscanning keeps spotlight holes completely enclosed by the shade even
    // when a corner entrance or camera shake places their centers near an edge.
    this.cornerAmbushShade
      .rect(
        -overscan,
        -overscan,
        this.width + overscan * 2,
        this.height + overscan * 2
      )
      .fill({
        color: '#020205',
        alpha: (isRam ? 0.98 : CORNER_AMBUSH_DIM_ALPHA) * dimProgress
      });

    const playerCenterX = engine.player.x + engine.player.width / 2 + shakeX;
    const playerCenterY = engine.player.y + engine.player.height / 2 + shakeY;
    this.cornerAmbushShade
      .ellipse(
        playerCenterX,
        playerCenterY,
        Math.max(40, engine.player.width * 1.18),
        Math.max(46, engine.player.height * 1.12)
      )
      .cut();

    if (bossReveal > 0.01) {
      const revealScale = 0.18 + bossReveal * 0.82;
      this.cornerAmbushShade
        .ellipse(
          boss.x + boss.width / 2 + shakeX,
          boss.y + boss.height / 2 + shakeY,
          Math.max(54, boss.width * 0.64) * revealScale,
          Math.max(54, boss.height * 0.64) * revealScale
        )
        .cut();
    }

    if (isRam) {
      const ram = boss.bossCornerAmbushRamState;
      if (!ram) return;
      const lock = ram.lock;
      const startX = lock.startX + boss.width / 2 + shakeX;
      const startY = lock.startY + boss.height / 2 + shakeY;
      const targetX = lock.targetX + shakeX;
      const targetY = lock.targetY + shakeY;
      const guidePulse = 0.7 + Math.sin(engine.frameCount * 0.34) * 0.24;
      this.cornerAmbushGuide.visible = true;
      if (warning) {
        this.cornerAmbushGuide
          .moveTo(startX, startY)
          .lineTo(targetX, targetY)
          .stroke({ color: '#ef233c', width: 2.5, alpha: guidePulse });
        this.cornerAmbushGuide
          .circle(targetX, targetY, 22 + guidePulse * 5)
          .stroke({ color: '#ff4d5d', width: 2, alpha: guidePulse });
        this.cornerAmbushGuide
          .circle(targetX, targetY, 7)
          .fill({ color: '#ef233c', alpha: 0.3 + guidePulse * 0.25 });
      } else {
        const speed = Math.hypot(boss.vx, boss.vy);
        const tailLength = clamp(speed * 5, 38, 170);
        const directionX = Math.cos(lock.angleRadians);
        const directionY = Math.sin(lock.angleRadians);
        const centerX = boss.x + boss.width / 2 + shakeX;
        const centerY = boss.y + boss.height / 2 + shakeY;
        this.cornerAmbushGuide
          .moveTo(centerX, centerY)
          .lineTo(
            centerX - directionX * tailLength,
            centerY - directionY * tailLength
          )
          .stroke({ color: '#ff3348', width: 5, alpha: guidePulse * 0.7 });
      }
      return;
    }

    let beam: Entity | null = null;
    let fallbackBeam: Entity | null = null;
    for (const candidate of engine.entities) {
      if (
        candidate.markedForDeletion
        || !candidate.isBeam
        || !candidate.isCornerAmbushBeam
        || candidate.bossOwnerId !== boss.id
      ) {
        continue;
      }
      fallbackBeam ??= candidate;
      if (candidate.isTelegraph === warning) {
        beam = candidate;
        break;
      }
    }
    beam ??= fallbackBeam;
    if (!beam) return;

    const angled = beam.beamAngleRadians !== null;
    const horizontal = !angled && beam.beamAxis === 'horizontal';
    const beamAngle = angled
      ? Number(beam.beamAngleRadians)
      : horizontal
        ? 0
        : Math.PI / 2;
    const beamLength = angled || horizontal ? beam.width : beam.height;
    const beamThickness = angled || horizontal ? beam.height : beam.width;
    const beamCenterX = beam.x + beam.width / 2 + shakeX;
    const beamCenterY = beam.y + beam.height / 2 + shakeY;
    const tangentX = Math.cos(beamAngle);
    const tangentY = Math.sin(beamAngle);
    const normalX = -tangentY;
    const normalY = tangentX;
    const halfLength = beamLength / 2;
    const startX = beamCenterX - tangentX * halfLength;
    const startY = beamCenterY - tangentY * halfLength;
    const endX = beamCenterX + tangentX * halfLength;
    const endY = beamCenterY + tangentY * halfLength;

    if (!warning) {
      // Reveal the real pooled beam sprite and exact collision-aligned core
      // instead of painting a presentation-only replacement above the shade.
      const revealHalfWidth = Math.max(7, beamThickness * 0.92);
      this.cornerAmbushShade
        .moveTo(startX + normalX * revealHalfWidth, startY + normalY * revealHalfWidth)
        .lineTo(endX + normalX * revealHalfWidth, endY + normalY * revealHalfWidth)
        .lineTo(endX - normalX * revealHalfWidth, endY - normalY * revealHalfWidth)
        .lineTo(startX - normalX * revealHalfWidth, startY - normalY * revealHalfWidth)
        .closePath()
        .cut();
    }

    this.cornerAmbushGuide.visible = true;
    if (warning) {
      const telegraphProgress = Math.max(
        actionProgress,
        1 - clamp(beam.life / Math.max(1, beam.maxLife), 0, 1)
      );
      const converge = smoothstep(telegraphProgress);
      const guidePulse = 0.84 + Math.sin(engine.frameCount * 0.32) * 0.14;
      this.cornerAmbushGuide
        .moveTo(startX, startY)
        .lineTo(endX, endY)
        .stroke({
          color: '#ef233c',
          width: Math.max(1.5, beamThickness * 0.24),
          alpha: guidePulse
        });

      const railOffset = Math.max(4, beamThickness * 0.78);
      const dashHalfLength = clamp(beamLength * 0.018, 4, 13);
      for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
        const initialDistance = beamLength * (0.43 - pairIndex * 0.105);
        const distance = initialDistance * (1 - converge * 0.78);
        const railAlpha = 0.44 + converge * 0.42 - pairIndex * 0.06;
        for (let direction = -1; direction <= 1; direction += 2) {
          const railCenterX = beamCenterX + tangentX * distance * direction;
          const railCenterY = beamCenterY + tangentY * distance * direction;
          for (let side = -1; side <= 1; side += 2) {
            const laneX = railCenterX + normalX * railOffset * side;
            const laneY = railCenterY + normalY * railOffset * side;
            this.cornerAmbushGuide
              .moveTo(
                laneX - tangentX * dashHalfLength,
                laneY - tangentY * dashHalfLength
              )
              .lineTo(
                laneX + tangentX * dashHalfLength,
                laneY + tangentY * dashHalfLength
              )
              .stroke({
                color: '#ff4d5d',
                width: 2,
                alpha: railAlpha
              });
          }
          this.cornerAmbushGuide
            .moveTo(
              railCenterX - normalX * railOffset,
              railCenterY - normalY * railOffset
            )
            .lineTo(
              railCenterX + normalX * railOffset,
              railCenterY + normalY * railOffset
            )
            .stroke({
              color: '#ef233c',
              width: 1,
              alpha: railAlpha * 0.7
            });
        }
      }
    } else {
      const edgeOffset = Math.max(3, beamThickness * 0.54);
      const livePulse = 0.76 + Math.sin(engine.frameCount * 0.4) * 0.18;
      for (let side = -1; side <= 1; side += 2) {
        this.cornerAmbushGuide
          .moveTo(
            startX + normalX * edgeOffset * side,
            startY + normalY * edgeOffset * side
          )
          .lineTo(
            endX + normalX * edgeOffset * side,
            endY + normalY * edgeOffset * side
          )
          .stroke({
            color: '#ff3348',
            width: Math.max(1.5, beamThickness * 0.1),
            alpha: livePulse
          });
      }
    }
  }

  private updateWarnings(engine: GameEngine) {
    const active = engine.inBossWarningSequence;
    this.warningShade.visible = active;
    this.warningFrame.visible = active;
    this.warningRoot.visible = active;
    if (!active) return;

    const elapsed = engine.bossWarningDuration - engine.bossWarningFrame;
    const pulseWave = (Math.sin(elapsed * 0.24) + 1) * 0.5;
    const pulse = 0.58 + pulseWave * 0.42;
    const sirenWave = (Math.cos((elapsed % 36) / 36 * Math.PI * 2) + 1) * 0.5;
    const redFlashAlpha = 0.07 + sirenWave * 0.2;
    const mainBoss = engine.pendingBossType === 'gatekeeper';
    const title = mainBoss ? 'BOSS INCOMING' : 'THREAT INCOMING';
    const configuredBossLabel = engine.pendingConfiguredEncounter?.kind === 'boss'
      ? engine.pendingConfiguredEncounter.label.toUpperCase()
      : null;
    const subtitle = mainBoss
      ? configuredBossLabel ?? 'GATEKEEPER SENTINEL'
      : engine.pendingBossType === 'wall'
        ? 'PAYWALL BASTION'
        : 'BOTTLENECK HARVESTER';
    const entryProgress = clamp(elapsed / 24, 0, 1);
    const exitProgress = clamp(engine.bossWarningFrame / 16, 0, 1);
    const deployProgress = Math.min(entryProgress, exitProgress);
    const easedDeploy = 1 - Math.pow(1 - deployProgress, 3);
    const bannerBaseScale = Math.min((this.width * 0.98) / 1024, 0.78);
    const bannerScale = bannerBaseScale * (0.86 + easedDeploy * 0.14);
    const centerY = this.height * (this.height > this.width * 1.3 ? 0.39 : 0.43);

    this.warningShade.clear().rect(0, 0, this.width, this.height).fill({ color: '#dc2626', alpha: redFlashAlpha });
    this.warningFrame.clear();
    this.warningFrame.rect(0, 0, this.width, 5).fill({ color: '#fb3847', alpha: pulse * 0.9 });
    this.warningFrame.rect(0, this.height - 5, this.width, 5).fill({ color: '#fb3847', alpha: pulse * 0.9 });
    for (let x = -20; x < this.width + 20; x += 42) {
      this.warningFrame.poly([x, 0, x + 16, 0, x + 7, 12]).fill({ color: '#fef08a', alpha: pulse * 0.72 });
      this.warningFrame.poly([x, this.height, x + 16, this.height, x + 7, this.height - 12]).fill({ color: '#fef08a', alpha: pulse * 0.72 });
    }

    this.warningBanner.texture = this.textureBank.get(
      mainBoss ? ASSETS.PIXI_BOSS_ALERT_FRAME : ASSETS.PIXI_MINI_BOSS_ALERT_FRAME
    ) ?? Texture.WHITE;
    this.warningRoot.position.set(this.width / 2, centerY - (1 - easedDeploy) * 46);
    this.warningRoot.scale.set(bannerScale);
    this.warningRoot.alpha = clamp(deployProgress * 1.35, 0, 1);
    this.warningBanner.alpha = 0.96;

    this.warningScan.position.set(-280 + ((elapsed * 18) % 560), -2);
    this.warningScan.width = 420;
    this.warningScan.height = 24;
    this.warningScan.alpha = 0.25 + pulseWave * 0.35;

    this.warningRing.position.set(0, 100);
    this.warningRing.scale.set(1.18 + pulseWave * 0.14);
    this.warningRing.rotation = elapsed * 0.025;
    this.warningRing.alpha = 0.62 + pulseWave * 0.28;

    this.warningCrystal.position.set(0, 100);
    this.warningCrystal.scale.set(0.52 + pulseWave * 0.035);
    this.warningCrystal.alpha = 0.9;

    this.warningText.text = title;
    this.warningText.style.fontSize = this.width < 520 ? 70 : 58;
    this.warningText.position.set(0, -38);
    this.warningText.alpha = 0.9 + pulseWave * 0.1;
    this.warningSubtext.text = subtitle;
    this.warningSubtext.style.fontSize = this.width < 520 ? 30 : 25;
    this.warningSubtext.position.set(0, 34);
    this.warningSubtext.alpha = 0.82 + pulseWave * 0.18;
  }

  sync(engine: GameEngine, timestamp = performance.now()) {
    if (!this.initialized || this.destroyed) return;
    this.renderFrame++;
    const deltaMs = this.lastTimestamp ? clamp(timestamp - this.lastTimestamp, 0, 50) : 16.667;
    this.lastTimestamp = timestamp;
    this.updatePlayerSteeringPresentation(engine, deltaMs);
    this.camera.position.set(engine.shakeX, engine.shakeY);
    this.environment.update(engine);
    this.effectPool.setQuality(engine.performanceMode, engine.mobileProfile);
    this.syncCornerAmbushPresentation(engine);
    this.modularBossDebugSnapshot = null;
    this.syncEntities(engine);
    this.syncPreviewDebugOverlay(engine);
    this.syncMaxShotPresentation(engine);
    this.syncPlayerAfterimages(engine);
    this.syncPlayerThrusters(engine);
    this.syncGunPods(engine);
    this.syncBioPrimaryBeam(engine);
    this.syncResearchBeam(engine);
    this.syncCombatLighting(engine);
    this.syncWallHealth(engine);
    this.syncBossHealthHud(engine);
    this.updateWavePresentation(engine, timestamp, deltaMs);
    this.updateWarnings(engine);
    this.updateBossPresentation(engine, deltaMs);
    this.effectPool.update(deltaMs);

    if (engine.lastShotFrame !== this.lastShotFrame) this.lastShotFrame = engine.lastShotFrame;
    if (engine.lastBombFrame !== this.lastBombFrame) {
      if (this.lastBombFrame > -900) {
        this.effectPool.spawnExplosion(engine.player.x + engine.player.width / 2, engine.player.y + engine.player.height / 2, Math.min(this.width, this.height) * 0.42, '#facc15', 2);
      }
      this.lastBombFrame = engine.lastBombFrame;
    }

    this.flashOverlay.visible = engine.flashAlpha > 0.01;
    this.flashOverlay.alpha = clamp(engine.flashAlpha * 0.72, 0, 0.7);
    this.app.renderer.render(this.app.stage);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.initialized = false;
    this.effectPool.destroy();
    this.environment.destroy();
    this.destroyPreviewBossAtlasTextures();
    this.destroyModularPreviewBossTextures();
    this.destroyPreviewBossVfxTextures();
    this.clearBossDeathFragments();
    this.modularBossDestructionSnapshot = null;
    this.modularBossDebugSnapshot = null;
    this.previewDebugOverlay.clear();
    this.textureBank.destroy();
    this.articulatedBossRigLoads.clear();
    this.previewBossRuntimeEntityId = null;
    this.cornerAmbushBossId = null;
    this.views.clear();
    this.recycledViews.clear();
    this.seenBossPhase.clear();
    this.seenBossComponents.clear();
    this.destroyApplication();
  }

  private destroyApplication() {
    if (!this.appReady || this.appDestroyed) return;
    this.appDestroyed = true;
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
