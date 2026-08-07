export interface PreviewBossAtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SEGMENTED_CRESCENT_PART_IDS = [
  'coreBody',
  'coreClosed',
  'coreOpen',
  'leftOuter',
  'rightOuter',
  'leftMidA',
  'rightMidA',
  'leftMidB',
  'rightMidB',
  'leftBase',
  'rightBase',
  'leftPod',
  'rightPod',
  'ring',
  'tailA',
  'tailB',
  'tailC'
] as const;

export type SegmentedCrescentPartId = (typeof SEGMENTED_CRESCENT_PART_IDS)[number];

export const ARTICULATED_PINCER_PART_IDS = [
  'bodyClosed',
  'bodyOpen',
  'leftClaw',
  'rightClaw',
  'leftMandible',
  'rightMandible',
  'legOuterLeft',
  'legInnerLeft',
  'legInnerRight',
  'legOuterRight',
  'gatlingLeft',
  'gatlingRight',
  'mineLeft',
  'mineRight',
  'shieldLeft',
  'shieldRight',
  'shockBlade',
  'flameSmall',
  'flameMedium',
  'flameLarge'
] as const;

export type ArticulatedPincerPartId = (typeof ARTICULATED_PINCER_PART_IDS)[number];

export const TRANSFORMING_ORBITER_PART_IDS = [
  'coreClosed',
  'coreOpen',
  'leftWing',
  'rightWing',
  'leftEmitter',
  'rightEmitter',
  'finTop',
  'finRight',
  'finBottom',
  'finLeft',
  'nodeA',
  'nodeB',
  'nodeC',
  'nodeD',
  'haloSmall',
  'haloMedium',
  'haloLarge',
  'haloXL',
  'perimeterRing',
  'laserHub',
  'pulseSmall',
  'pulseMedium',
  'pulseLarge'
] as const;

export type TransformingOrbiterPartId = (typeof TRANSFORMING_ORBITER_PART_IDS)[number];

export const ROTATING_EMITTER_CORE_PART_IDS = [
  'chassisClosed',
  'chassisOpen',
  'perimeterRing',
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
  'portal0',
  'portal1',
  'portal2',
  'portal3',
  'pulseSmall',
  'pulseMedium',
  'pulseLarge',
  'eyeCometLeft',
  'eyeCometRight'
] as const;

export type RotatingEmitterCorePartId = (typeof ROTATING_EMITTER_CORE_PART_IDS)[number];

export type PreviewBossAtlasPartId = SegmentedCrescentPartId;
export type PreviewBossRigPartId =
  | SegmentedCrescentPartId
  | ArticulatedPincerPartId
  | TransformingOrbiterPartId
  | RotatingEmitterCorePartId;

export type SegmentedCrescentAtlas = Readonly<{
  kind: 'segmented-crescent-v1';
  url: string;
  contentHash: string;
  width: number;
  height: number;
  frames: Record<SegmentedCrescentPartId, PreviewBossAtlasFrame>;
}>;

export type ArticulatedPincerAtlas = Readonly<{
  kind: 'articulated-pincer-v1';
  url: string;
  contentHash: string;
  width: number;
  height: number;
  frames: Record<ArticulatedPincerPartId, PreviewBossAtlasFrame>;
}>;

export type TransformingOrbiterAtlas = Readonly<{
  kind: 'transforming-orbiter-v1';
  url: string;
  contentHash: string;
  width: number;
  height: number;
  frames: Record<TransformingOrbiterPartId, PreviewBossAtlasFrame>;
}>;

export type RotatingEmitterCoreAtlas = Readonly<{
  kind: 'rotating-emitter-core-v1';
  url: string;
  contentHash: string;
  width: number;
  height: number;
  frames: Record<RotatingEmitterCorePartId, PreviewBossAtlasFrame>;
}>;

export type PreviewBossAtlas =
  | SegmentedCrescentAtlas
  | ArticulatedPincerAtlas
  | TransformingOrbiterAtlas
  | RotatingEmitterCoreAtlas;

export const PREVIEW_BOSS_ASSEMBLED_MOTION_PROFILES = [
  'wingbeat-hover',
  'paired-resonance',
  'revival-shell'
] as const;

export type PreviewBossAssembledMotionProfile =
  (typeof PREVIEW_BOSS_ASSEMBLED_MOTION_PROFILES)[number];

export interface PreviewBossModularActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
  readonly motionCue?: string | null;
}

export type PreviewBossVanishReentryStage =
  | 'fade-out'
  | 'hidden'
  | 'reentry-warning'
  | 'reappear'
  | 'recovery';

/** Presentation-only snapshot of the generic vanish/re-entry lifecycle. */
export interface PreviewBossVanishReentryPresentation {
  readonly stage: PreviewBossVanishReentryStage;
  readonly progress: number;
  readonly opacity: number;
}

export type PreviewBossEscapeStage =
  | 'damaged-stagger'
  | 'false-finish'
  | 'escape-charge'
  | 'escaping'
  | 'complete';

/** Presentation-only snapshot of the terminal non-explosive escape lifecycle. */
export interface PreviewBossEscapePresentation {
  readonly stage: PreviewBossEscapeStage;
  readonly progress: number;
  readonly opacity: number;
  readonly trailIntensity: number;
}

export interface PreviewBossModularPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly phaseIndex: number;
  readonly entranceProgress?: number | null;
  readonly damageStage?: number | null;
  readonly phaseProgress?: number | null;
  /** Optional two-life presentation state for modular revival rigs. */
  readonly revivalStage?: 'none' | 'armed' | 'shutdown' | 'rebooting' | 'complete' | null;
  readonly revivalProgress?: number | null;
  readonly revived?: boolean;
  readonly vanishReentry?: PreviewBossVanishReentryPresentation | null;
  readonly escape?: PreviewBossEscapePresentation | null;
  readonly reaction?: {
    readonly kind: 'impact' | 'stagger';
    readonly progress: number;
    readonly direction: -1 | 1;
    readonly strength: number;
  } | null;
  readonly action?: PreviewBossModularActionPresentation | null;
}

/**
 * Sandbox-owned pose behavior injected into the generic modular renderer.
 * Keeping this callback on the artwork registration prevents individual test
 * boss implementations from becoming production GameStage dependencies.
 */
export type PreviewBossModularPoseSampler = (
  input: PreviewBossModularPoseInput
) => ModularBossRigPoseOverrides;

/**
 * Presentation-only animation for one semantic boss projectile. Frame IDs
 * resolve through the boss's validated modular-atlas registration, so local
 * bosses can carry cohesive ordnance art without adding global asset paths.
 */
export interface PreviewBossProjectileAnimation {
  readonly frameIds: readonly string[];
  readonly frameHoldFrames: number;
  readonly minimumVisualHeight: number;
  readonly entityHeightScale: number;
  readonly orientationOffsetRadians: number;
}

export type PreviewBossProjectileAnimationProfile = Readonly<Partial<
  Record<BossModularProjectileVisualKind, PreviewBossProjectileAnimation>
>>;

export interface PreviewBossArtwork {
  readonly eventId: string;
  readonly url: string;
  readonly contentHash: string;
  /**
   * Simulation-owned alpha silhouette generated from the exact assembled PNG.
   * Pixi never supplies collision pixels at runtime.
   */
  readonly collisionMask?: BossCollisionMask;
  /** Preview-only anatomy points shared by simulation muzzle origins and Pixi cues. */
  readonly weaponSockets?: BossWeaponSocketProfile;
  /**
   * Some generated sheets contain useful projectile/effect parts but do not
   * share the same attachment geometry as their rig family. Keep their solid
   * assembled silhouette instead of forcing those pieces into a wrong layout.
   */
  readonly renderMode?: 'articulated' | 'assembled';
  readonly assembledMotionProfile?: PreviewBossAssembledMotionProfile;
  readonly articulatedAtlas?: PreviewBossAtlas;
  /**
   * A validated, named-part hierarchy for bosses authored from reusable
   * component art. This remains presentation-only and never changes the
   * campaign event or gameplay collision model.
  */
  readonly modularRig?: ModularBossRigRegistration;
  readonly sampleModularPose?: PreviewBossModularPoseSampler;
  /** Optional review overlay; never a gameplay sprite or collision source. */
  readonly modularReferenceComparison?: PreviewBossReferenceComparisonDescriptor;
  /** Optional boss-specific projectile frames stored in the modular atlas. */
  readonly projectileAnimations?: PreviewBossProjectileAnimationProfile;
  readonly vfxAtlas?: PreviewBossVfxAtlas;
}

export type PreviewBossRigKind = PreviewBossAtlas['kind'];

export const getPreviewBossRigPartIds = (
  kind: PreviewBossRigKind
): readonly PreviewBossRigPartId[] => {
  switch (kind) {
    case 'segmented-crescent-v1':
      return SEGMENTED_CRESCENT_PART_IDS;
    case 'articulated-pincer-v1':
      return ARTICULATED_PINCER_PART_IDS;
    case 'transforming-orbiter-v1':
      return TRANSFORMING_ORBITER_PART_IDS;
    case 'rotating-emitter-core-v1':
      return ROTATING_EMITTER_CORE_PART_IDS;
  }
};

export const getPreviewBossProjectilePartIds = (
  kind: PreviewBossRigKind
): readonly [PreviewBossRigPartId, PreviewBossRigPartId] => {
  switch (kind) {
    case 'segmented-crescent-v1':
      return ['leftPod', 'rightPod'];
    case 'articulated-pincer-v1':
      return ['mineLeft', 'mineRight'];
    case 'transforming-orbiter-v1':
      return ['nodeA', 'nodeB'];
    case 'rotating-emitter-core-v1':
      return ['eyeCometLeft', 'eyeCometRight'];
  }
};
import type {
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';
import type { PreviewBossVfxAtlas } from './PreviewBossVfxContracts';
import type { PreviewBossReferenceComparisonDescriptor } from './PreviewBossReferenceComparison';
import type { BossCollisionMask } from '../../gameplay/bosses/BossCollisionMask';
import type { BossWeaponSocketProfile } from '../../gameplay/bosses/BossWeaponSocketRuntime';
import type { BossModularProjectileVisualKind } from '../../gameplay/bosses/BossProjectilePresentationRuntime';
