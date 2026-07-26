import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';

export const NULLWAKE_MODULAR_PART_IDS = [
  'root',
  'arm.upper-port.mount',
  'arm.upper-port',
  'arm.upper-starboard.mount',
  'arm.upper-starboard',
  'arm.lower-port.mount',
  'arm.lower-port',
  'arm.lower-starboard.mount',
  'arm.lower-starboard',
  'body',
  'effect.core-muzzle',
  'destruction.fragment.0',
  'destruction.fragment.1',
  'destruction.fragment.2',
  'destruction.fragment.3',
  'destruction.fragment.4'
] as const;

export type NullwakeModularPartId = (typeof NULLWAKE_MODULAR_PART_IDS)[number];

export const NULLWAKE_MODULAR_FRAME_IDS = [
  'body.shell',
  'arm.upper-port',
  'arm.upper-starboard',
  'arm.lower-port',
  'arm.lower-starboard',
  'body.core.0',
  'body.core.1',
  'body.core.2',
  'body.core.3',
  'body.damage.0',
  'body.damage.1',
  'body.damage.2',
  'effect.core-muzzle.0',
  'effect.core-muzzle.1',
  'effect.core-muzzle.2',
  'destruction.fragment.0',
  'destruction.fragment.1',
  'destruction.fragment.2',
  'destruction.fragment.3',
  'destruction.fragment.4'
] as const;

export type NullwakeModularFrameId = (typeof NULLWAKE_MODULAR_FRAME_IDS)[number];

export const NULLWAKE_CORE_BODY_FRAME_IDS = [
  'body.core.0',
  'body.core.1',
  'body.core.2',
  'body.core.3'
] as const;

export const NULLWAKE_DAMAGE_BODY_FRAME_IDS = [
  'body.damage.0',
  'body.damage.1',
  'body.damage.2'
] as const;

export const NULLWAKE_CORE_MUZZLE_FRAME_IDS = [
  'effect.core-muzzle.0',
  'effect.core-muzzle.1',
  'effect.core-muzzle.2'
] as const;

export type NullwakeBodyFrameId =
  | 'body.shell'
  | (typeof NULLWAKE_CORE_BODY_FRAME_IDS)[number]
  | (typeof NULLWAKE_DAMAGE_BODY_FRAME_IDS)[number];

export type NullwakeCoreMuzzleFrameId = (typeof NULLWAKE_CORE_MUZZLE_FRAME_IDS)[number];

export const NULLWAKE_MODULAR_SOCKET_IDS = [
  'muzzle-upper-port',
  'muzzle-lower-port',
  'muzzle-upper-starboard',
  'muzzle-lower-starboard',
  'revenant-core'
] as const;

export type NullwakeModularSocketId = (typeof NULLWAKE_MODULAR_SOCKET_IDS)[number];

export type NullwakeRevivalStage =
  | 'none'
  | 'armed'
  | 'shutdown'
  | 'rebooting'
  | 'complete';

export interface NullwakeActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
  readonly motionCue?: string | null;
}

export interface NullwakeModularPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly phaseIndex: number;
  readonly entranceProgress?: number | null;
  readonly damageStage?: number | null;
  readonly revivalStage?: NullwakeRevivalStage | null;
  readonly revivalProgress?: number | null;
  readonly revived?: boolean;
  readonly reaction?: {
    readonly kind: 'impact' | 'stagger';
    readonly progress: number;
    readonly direction: -1 | 1;
    readonly strength: number;
  } | null;
  readonly action?: NullwakeActionPresentation | null;
}

export interface NullwakeModularPose {
  readonly bodyFrameId: NullwakeBodyFrameId;
  readonly coreMuzzleFrameId: NullwakeCoreMuzzleFrameId;
  readonly coreMuzzleVisible: boolean;
  readonly breathingAmount: number;
  readonly limpAmount: number;
  readonly reactivationAmount: number;
  readonly portAttackEnergy: number;
  readonly starboardAttackEnergy: number;
  readonly partOverrides: ModularBossRigPoseOverrides;
}

export interface NullwakeRigCompatibilityIssue {
  readonly path: string;
  readonly message: string;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const smoothstep = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const sampleActionEnvelope = (stage: string, progress: number) => {
  if (stage === 'warning') return Math.sin(progress * Math.PI * 0.5);
  if (stage === 'fire') return 1 - progress * 0.42;
  if (stage === 'recovery' || stage === 'cooldown') return 1 - progress;
  return 0;
};

const sampleReactivation = (
  revivalStage: NullwakeRevivalStage,
  revivalProgress: number,
  revived: boolean
) => {
  if (revivalStage === 'rebooting') return smoothstep(revivalProgress);
  if (revivalStage === 'complete' || revived) return 1;
  return 0;
};

const selectedAttackSides = (
  action: NullwakeActionPresentation | null | undefined
) => {
  const side = action?.side;
  if (side === 'port' || side === 'left') {
    return Object.freeze({ port: true, starboard: false });
  }
  if (side === 'starboard' || side === 'right') {
    return Object.freeze({ port: false, starboard: true });
  }
  return Object.freeze({ port: true, starboard: true });
};

const CORE_ACTIONS = new Set([
  'gap-ring',
  'inward-collapse',
  'rotating-cross',
  'cross-beam',
  'rail-sweep'
]);

const sampleBodyFrameId = ({
  revivalStage,
  revivalProgress,
  reactivationAmount,
  damageStage,
  isCoreAction,
  stage,
  progress,
  actionEnergy
}: Readonly<{
  revivalStage: NullwakeRevivalStage;
  revivalProgress: number;
  reactivationAmount: number;
  damageStage: number;
  isCoreAction: boolean;
  stage: string;
  progress: number;
  actionEnergy: number;
}>): NullwakeBodyFrameId => {
  if (revivalStage === 'shutdown') {
    const index = Math.min(2, Math.floor(revivalProgress * 3));
    return NULLWAKE_DAMAGE_BODY_FRAME_IDS[index];
  }
  if (revivalStage === 'rebooting') {
    if (reactivationAmount <= 0) return NULLWAKE_DAMAGE_BODY_FRAME_IDS[2];
    const index = Math.min(3, Math.floor(reactivationAmount * 4));
    return NULLWAKE_CORE_BODY_FRAME_IDS[index];
  }
  if (isCoreAction && actionEnergy > 0) {
    if (stage === 'fire') return NULLWAKE_CORE_BODY_FRAME_IDS[3];
    const sequenceProgress = stage === 'warning' ? progress : actionEnergy;
    const index = Math.min(3, Math.floor(sequenceProgress * 4));
    return NULLWAKE_CORE_BODY_FRAME_IDS[index];
  }
  if (damageStage > 0) {
    const index = Math.min(2, Math.floor((damageStage - 1) / 2));
    return NULLWAKE_DAMAGE_BODY_FRAME_IDS[index];
  }
  return 'body.shell';
};

const sampleCoreMuzzleFrameId = (progress: number): NullwakeCoreMuzzleFrameId => {
  const pulseIndex = Math.min(4, Math.floor(clamp(progress, 0, 1) * 5));
  const frameIndex = [0, 1, 2, 1, 0][pulseIndex];
  return NULLWAKE_CORE_MUZZLE_FRAME_IDS[frameIndex];
};

/**
 * Confirms that the modular hierarchy preserves Nullwake's two body states,
 * four independently poseable appendages, and anatomy-owned effect sockets.
 */
export const validateNullwakeRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly NullwakeRigCompatibilityIssue[] => {
  const issues: NullwakeRigCompatibilityIssue[] = [];
  NULLWAKE_MODULAR_PART_IDS.forEach((partId) => {
    if (!registration.partById[partId]) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Nullwake part ${partId}.`
      }));
    }
  });
  NULLWAKE_MODULAR_FRAME_IDS.forEach((frameId) => {
    if (!registration.frameById[frameId]) {
      issues.push(Object.freeze({
        path: `/frames/${frameId}`,
        message: `Missing Nullwake frame ${frameId}.`
      }));
    }
  });
  const expectedSockets = Object.freeze({
    'muzzle-upper-port': Object.freeze({
      partId: 'arm.upper-port',
      role: 'projectile-muzzle'
    }),
    'muzzle-lower-port': Object.freeze({
      partId: 'arm.lower-port',
      role: 'projectile-muzzle'
    }),
    'muzzle-upper-starboard': Object.freeze({
      partId: 'arm.upper-starboard',
      role: 'projectile-muzzle'
    }),
    'muzzle-lower-starboard': Object.freeze({
      partId: 'arm.lower-starboard',
      role: 'projectile-muzzle'
    }),
    'revenant-core': Object.freeze({ partId: 'body', role: 'core-origin' })
  } as const);
  NULLWAKE_MODULAR_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    const expected = expectedSockets[socketId];
    if (!socket) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Nullwake socket ${socketId}.`
      }));
      return;
    }
    if (socket.partId !== expected.partId || socket.role !== expected.role) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `${socketId} must follow ${expected.partId} as ${expected.role}.`
      }));
    }
  });
  return Object.freeze(issues);
};

/**
 * Pure simulation-frame-driven articulation for Nullwake's existing generated
 * body and appendage sprites. All transforms are presentation-only: collision
 * continues to use the validated assembled alpha silhouette.
 */
export const sampleNullwakeModularPose = (
  input: NullwakeModularPoseInput
): NullwakeModularPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const pressure = 1 - healthRatio;
  const phaseIndex = Math.max(1, Math.floor(finiteOr(input.phaseIndex, 1)));
  const entranceProgress = smoothstep(finiteOr(input.entranceProgress, 1));
  const damageStage = clamp(Math.floor(finiteOr(input.damageStage, 0)), 0, 5);
  const revivalStage = input.revivalStage ?? 'none';
  const revivalProgress = clamp(finiteOr(input.revivalProgress, 0), 0, 1);
  const revived = input.revived === true || revivalStage === 'complete' || phaseIndex >= 2;
  const reactivationAmount = sampleReactivation(
    revivalStage,
    revivalProgress,
    revived
  );
  const limpAmount = revivalStage === 'shutdown'
    ? smoothstep(revivalProgress)
    : revivalStage === 'rebooting'
      ? 1 - reactivationAmount
      : 0;
  const lifeAmount = 1 - limpAmount;
  const ambientScale = input.reducedMotion ? 0.24 : 1;
  const breathingPhase = frame * (0.034 + pressure * 0.004);
  const breathingAmount = Math.sin(breathingPhase) * ambientScale * lifeAmount;
  const secondaryBreath = Math.sin(breathingPhase * 0.52 + Math.PI * 0.35)
    * ambientScale
    * lifeAmount;
  const action = input.action;
  const reaction = input.reaction;
  const reactionProgress = clamp(finiteOr(reaction?.progress, 1), 0, 1);
  const reactionEnvelope = reaction
    ? Math.sin(reactionProgress * Math.PI) * (reaction.kind === 'stagger' ? 1 : 0.58)
    : 0;
  const reactionDirection = reaction?.direction ?? 1;
  const reactionStrength = clamp(finiteOr(reaction?.strength, 0), 0, 2);
  const reactionKick = reactionEnvelope * reactionStrength;
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const stage = String(action?.stage ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const selection = selectedAttackSides(action);
  const actionEnergy = sampleActionEnvelope(stage, progress) * lifeAmount;
  const isCoreAction = CORE_ACTIONS.has(primitiveId);
  const portAttackEnergy = selection.port ? actionEnergy : 0;
  const starboardAttackEnergy = selection.starboard ? actionEnergy : 0;
  const portWarningEnergy = stage === 'warning' ? portAttackEnergy : 0;
  const starboardWarningEnergy = stage === 'warning' ? starboardAttackEnergy : 0;
  const portFireEnergy = stage === 'fire' ? portAttackEnergy : 0;
  const starboardFireEnergy = stage === 'fire' ? starboardAttackEnergy : 0;
  const coreBloom = isCoreAction ? actionEnergy : 0;
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const sequenceDirection = sequence % 2 === 0 ? 1 : -1;
  const startupShake = revivalStage === 'rebooting'
    ? Math.sin(revivalProgress * Math.PI) * Math.sin(frame * 0.7) * 1.8
    : 0;
  const entranceFold = 1 - entranceProgress;
  const rootBob = Math.sin(frame * 0.031) * (2.6 + pressure * 1.2) * ambientScale * lifeAmount;
  const rootSway = Math.sin(frame * 0.015) * (2.2 + pressure) * ambientScale * lifeAmount;
  const rootRoll = Math.sin(frame * 0.017 + Math.PI * 0.5)
    * 0.018
    * ambientScale
    * lifeAmount;
  const upperAmbient = Math.sin(frame * 0.023) * 0.045 * ambientScale * lifeAmount;
  const lowerAmbient = Math.sin(frame * 0.021 + Math.PI * 0.62)
    * 0.038
    * ambientScale
    * lifeAmount;
  const breathSpread = breathingAmount * 0.022;
  const portBrace = -portWarningEnergy * 0.11 + portFireEnergy * 0.14;
  const starboardBrace = starboardWarningEnergy * 0.11 - starboardFireEnergy * 0.14;
  const portCoreBloom = -coreBloom * (0.08 + sequenceDirection * 0.012);
  const starboardCoreBloom = coreBloom * (0.08 + sequenceDirection * 0.012);
  const upperPortDroop = -0.46 * limpAmount;
  const upperStarboardDroop = 0.46 * limpAmount;
  const lowerPortDroop = -0.24 * limpAmount;
  const lowerStarboardDroop = 0.24 * limpAmount;
  const awakenedSpread = reactivationAmount * 0.035;
  const damageDroop = damageStage * 0.012;
  const bodyFrameId = sampleBodyFrameId({
    revivalStage,
    revivalProgress,
    reactivationAmount,
    damageStage,
    isCoreAction,
    stage,
    progress,
    actionEnergy
  });
  const coreMuzzleFrameId = sampleCoreMuzzleFrameId(progress);
  const coreMuzzleVisible = isCoreAction && stage === 'fire' && actionEnergy > 0.04;
  const usesCoreBodyFrame = bodyFrameId.startsWith('body.core.');
  const usesDamageBodyFrame = bodyFrameId.startsWith('body.damage.');
  const authoredBodyScaleX = usesCoreBodyFrame || usesDamageBodyFrame ? 162 / 160 : 1;
  const authoredBodyScaleY = usesCoreBodyFrame
    ? 258 / 224
    : usesDamageBodyFrame
      ? 258 / 240
      : 1;
  const inhaleScaleX = 1 + breathingAmount * 0.01;
  const inhaleScaleY = 1 + breathingAmount * 0.017;
  const limbFlex = 1 + secondaryBreath * 0.012;
  const shoulderExpansion = breathingAmount * 1.7 + awakenedSpread * 18;

  const partOverrides = Object.freeze({
    root: freezeOverride({
      xOffset: rootSway + startupShake + reactionDirection * reactionKick * 5.4,
      yOffset: rootBob + limpAmount * 19 - startupShake * 0.35 + reactionKick * 1.8,
      rotationOffset: rootRoll + limpAmount * 0.11 + reactionDirection * reactionKick * 0.045,
      scaleXMultiplier: 1 - limpAmount * 0.025,
      scaleYMultiplier: 1 - limpAmount * 0.045
    }),
    'arm.upper-port.mount': freezeOverride({
      xOffset: -shoulderExpansion - portAttackEnergy * 2.5,
      yOffset: -breathingAmount * 1.25 + limpAmount * 7,
      rotationOffset: upperAmbient - breathSpread + upperPortDroop
        + portBrace + portCoreBloom - awakenedSpread
        - entranceFold * 0.34 - damageDroop - reactionDirection * reactionKick * 0.035
    }),
    'arm.upper-port': freezeOverride({
      scaleXMultiplier: 1 + breathingAmount * 0.008,
      scaleYMultiplier: limbFlex,
      alpha: 1
    }),
    'arm.upper-starboard.mount': freezeOverride({
      xOffset: shoulderExpansion + starboardAttackEnergy * 2.5,
      yOffset: breathingAmount * 1.25 + limpAmount * 7,
      rotationOffset: -upperAmbient + breathSpread + upperStarboardDroop
        + starboardBrace + starboardCoreBloom + awakenedSpread
        + entranceFold * 0.34 + damageDroop - reactionDirection * reactionKick * 0.035
    }),
    'arm.upper-starboard': freezeOverride({
      scaleXMultiplier: 1 + breathingAmount * 0.008,
      scaleYMultiplier: limbFlex,
      alpha: 1
    }),
    'arm.lower-port.mount': freezeOverride({
      xOffset: -shoulderExpansion * 0.82 - portAttackEnergy * 2,
      yOffset: breathingAmount * 1.4 + limpAmount * 4,
      rotationOffset: lowerAmbient - breathSpread * 0.72 + lowerPortDroop
        + portBrace * 0.72 + portCoreBloom * 0.85 - awakenedSpread * 0.72
        - entranceFold * 0.26 - damageDroop * 0.72 - reactionDirection * reactionKick * 0.025
    }),
    'arm.lower-port': freezeOverride({
      scaleXMultiplier: 1 - breathingAmount * 0.006,
      scaleYMultiplier: 2 - limbFlex,
      alpha: 1
    }),
    'arm.lower-starboard.mount': freezeOverride({
      xOffset: shoulderExpansion * 0.82 + starboardAttackEnergy * 2,
      yOffset: -breathingAmount * 1.4 + limpAmount * 4,
      rotationOffset: -lowerAmbient + breathSpread * 0.72 + lowerStarboardDroop
        + starboardBrace * 0.72 + starboardCoreBloom * 0.85 + awakenedSpread * 0.72
        + entranceFold * 0.26 + damageDroop * 0.72 - reactionDirection * reactionKick * 0.025
    }),
    'arm.lower-starboard': freezeOverride({
      scaleXMultiplier: 1 - breathingAmount * 0.006,
      scaleYMultiplier: 2 - limbFlex,
      alpha: 1
    }),
    body: freezeOverride({
      frameId: bodyFrameId,
      yOffset: -breathingAmount * 1.2 + limpAmount * 5 + entranceFold * 8,
      rotationOffset: -rootRoll * 0.28,
      scaleXMultiplier: inhaleScaleX * authoredBodyScaleX,
      scaleYMultiplier: inhaleScaleY * authoredBodyScaleY,
      alpha: 1
    }),
    'effect.core-muzzle': freezeOverride({
      frameId: coreMuzzleFrameId,
      visible: coreMuzzleVisible,
      alpha: 1
    }),
    'destruction.fragment.0': freezeOverride({ visible: false, alpha: 1 }),
    'destruction.fragment.1': freezeOverride({ visible: false, alpha: 1 }),
    'destruction.fragment.2': freezeOverride({ visible: false, alpha: 1 }),
    'destruction.fragment.3': freezeOverride({ visible: false, alpha: 1 }),
    'destruction.fragment.4': freezeOverride({ visible: false, alpha: 1 })
  } satisfies Record<NullwakeModularPartId, ModularBossPartPoseOverride>);

  return Object.freeze({
    bodyFrameId,
    coreMuzzleFrameId,
    coreMuzzleVisible,
    breathingAmount,
    limpAmount,
    reactivationAmount,
    portAttackEnergy,
    starboardAttackEnergy,
    partOverrides
  });
};
