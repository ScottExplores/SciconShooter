import {
  ABYSSAL_OCTARCH_ACTION_IDS,
  ABYSSAL_OCTARCH_MOTION_CUES,
  ABYSSAL_OCTARCH_TENTACLES,
  getAbyssalOctarchActionId,
  type AbyssalOctarchActionId,
  type AbyssalOctarchTentacleId
} from '../../gameplay/bosses/AbyssalOctarchRuntime';
import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';
import type { PreviewBossModularPoseInput } from './PreviewBossRigContracts';
import { ABYSSAL_OCTARCH_NEUTRAL_TENTACLE_MOUNTS } from './AbyssalOctarchRigLayout';

export const ABYSSAL_OCTARCH_TENTACLE_PART_IDS = Object.freeze(
  ([0, 1, 2, 3] as const).flatMap((index) => (
    (['port', 'starboard'] as const).map((side) => `tentacle.${index}.${side}`)
  ))
);

export const ABYSSAL_OCTARCH_PART_IDS = Object.freeze([
  'root',
  'tentacle.0.port.mount',
  'tentacle.0.port',
  'tentacle.0.starboard.mount',
  'tentacle.0.starboard',
  'tentacle.1.port.mount',
  'tentacle.1.port',
  'tentacle.1.starboard.mount',
  'tentacle.1.starboard',
  'tentacle.2.port.mount',
  'tentacle.2.port',
  'tentacle.2.starboard.mount',
  'tentacle.2.starboard',
  'tentacle.3.port.mount',
  'tentacle.3.port',
  'tentacle.3.starboard.mount',
  'tentacle.3.starboard',
  'body',
  'effect.void-cloud',
  'effect.core',
  'effect.mouth',
  'effect.attack.port',
  'effect.attack.starboard',
  'effect.damage',
  'effect.implosion'
] as const);

export type AbyssalOctarchPartId = (typeof ABYSSAL_OCTARCH_PART_IDS)[number];

export const ABYSSAL_OCTARCH_SOCKET_IDS = Object.freeze([
  'core.emitter',
  'mouth.suction',
  'core.beam',
  'core.projectile.port',
  'core.projectile.starboard',
  'tentacle-0-port-tip',
  'tentacle-0-starboard-tip',
  'tentacle-1-port-tip',
  'tentacle-1-starboard-tip',
  'tentacle-2-port-tip',
  'tentacle-2-starboard-tip',
  'tentacle-3-port-tip',
  'tentacle-3-starboard-tip'
] as const);

export type AbyssalOctarchSocketId = (typeof ABYSSAL_OCTARCH_SOCKET_IDS)[number];

export const ABYSSAL_OCTARCH_COMPONENT_TO_RIG_PART = Object.freeze(
  Object.fromEntries(ABYSSAL_OCTARCH_TENTACLES.map((tentacle) => [
    tentacle.id,
    tentacle.partId
  ])) as Record<AbyssalOctarchTentacleId, string>
);

export const ABYSSAL_OCTARCH_RIG_PART_TO_COMPONENT = Object.freeze(
  Object.fromEntries(ABYSSAL_OCTARCH_TENTACLES.map((tentacle) => [
    tentacle.partId,
    tentacle.id
  ])) as Record<string, AbyssalOctarchTentacleId>
);

export const ABYSSAL_OCTARCH_TENTACLE_SEVER_REACTION_FRAMES = 18;

export interface AbyssalOctarchTentacleSeverPresentation {
  readonly visible: boolean;
  readonly progress: number;
  readonly alpha: number;
  readonly scale: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly rotationOffset: number;
}

export interface AbyssalOctarchRigCompatibilityIssue {
  readonly path: string;
  readonly message: string;
}

const ABYSSAL_OCTARCH_CANONICAL_ROOT_Y = -8;

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const smoothstep = (value: number) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

/**
 * Presentation-only sever beat. A newly destroyed arm snaps inward toward its
 * still-present mount, settles, and fades. Components that were already gone
 * when the view was created never flash back into existence.
 */
export const sampleAbyssalOctarchTentacleSeverPresentation = ({
  destroyed,
  lastDamageFrame,
  currentFrame,
  side
}: {
  destroyed: boolean;
  lastDamageFrame: number;
  currentFrame: number;
  side: 'port' | 'starboard';
}): AbyssalOctarchTentacleSeverPresentation => {
  if (!destroyed) {
    return Object.freeze({
      visible: true,
      progress: 0,
      alpha: 1,
      scale: 1,
      xOffset: 0,
      yOffset: 0,
      rotationOffset: 0
    });
  }
  if (!Number.isFinite(lastDamageFrame) || lastDamageFrame < 0) {
    return Object.freeze({
      visible: false,
      progress: 1,
      alpha: 0,
      scale: 0.42,
      xOffset: 0,
      yOffset: 0,
      rotationOffset: 0
    });
  }
  const elapsedFrames = Math.max(
    0,
    Math.floor(finiteOr(currentFrame, 0) - finiteOr(lastDamageFrame, 0))
  );
  const progress = clamp(
    elapsedFrames / ABYSSAL_OCTARCH_TENTACLE_SEVER_REACTION_FRAMES,
    0,
    1
  );
  if (progress >= 1) {
    return Object.freeze({
      visible: false,
      progress: 1,
      alpha: 0,
      scale: 0.42,
      xOffset: 0,
      yOffset: 0,
      rotationOffset: 0
    });
  }
  const settled = smoothstep(progress);
  const recoil = Math.sin(progress * Math.PI);
  const sideSign = side === 'port' ? -1 : 1;
  return Object.freeze({
    visible: true,
    progress,
    alpha: 1 - smoothstep(clamp((progress - 0.12) / 0.88, 0, 1)),
    scale: 1 - settled * 0.58,
    xOffset: -sideSign * (settled * 18 + recoil * 7),
    yOffset: -settled * 7 + recoil * 3,
    rotationOffset: sideSign * (recoil * 0.18 + settled * 0.08)
  });
};

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const sampleActionEnergy = (stage: string, progress: number) => {
  if (stage === 'preparation' || stage === 'transition') {
    return 0.12 + smoothstep(progress) * 0.48;
  }
  if (stage === 'telegraph' || stage === 'warning') {
    return 0.6 + smoothstep(progress) * 0.4;
  }
  if (
    stage === 'active'
    || stage === 'fire'
    || stage === 'held'
    || stage === 'throwing'
  ) return 1;
  if (stage === 'recovery' || stage === 'cooldown') return 1 - smoothstep(progress);
  return 0;
};

const resolveActionId = (
  input: PreviewBossModularPoseInput
): AbyssalOctarchActionId | null => {
  const motionCue = String(input.action?.motionCue ?? '').toLowerCase();
  const fromCue = getAbyssalOctarchActionId(motionCue);
  if (fromCue) return fromCue;
  const primitiveId = String(input.action?.primitiveId ?? '').toLowerCase();
  return ABYSSAL_OCTARCH_ACTION_IDS.find((actionId) => (
    primitiveId === actionId
    || primitiveId.endsWith(`-${actionId}`)
    || primitiveId.includes(actionId)
  )) ?? null;
};

const selectedSides = (side: string | null | undefined) => {
  if (side === 'port' || side === 'left') {
    return Object.freeze({ port: true, starboard: false });
  }
  if (side === 'starboard' || side === 'right') {
    return Object.freeze({ port: false, starboard: true });
  }
  return Object.freeze({ port: true, starboard: true });
};

/**
 * The simulation owns which physical arm performs a targeted Octarch move.
 * Authored timeline sides are only a fallback for preview-only poses that do
 * not have a live component selection yet.
 */
export const resolveAbyssalOctarchPresentationSide = (
  selectedTentacleId: string | null | undefined,
  authoredSide: string | null | undefined
): 'port' | 'starboard' | undefined => {
  if (selectedTentacleId?.endsWith('-port')) return 'port';
  if (selectedTentacleId?.endsWith('-starboard')) return 'starboard';
  if (authoredSide === 'port' || authoredSide === 'left') return 'port';
  if (authoredSide === 'starboard' || authoredSide === 'right') return 'starboard';
  return undefined;
};

/**
 * Mirrors the simulation's existing selected-component projectile origin for
 * Asteroid Hurl. Keeping this as a presentation helper lets the warning pose
 * return the held asteroid to the exact launch point without moving gameplay
 * collision, timing, or trajectory ownership into the renderer.
 */
export const resolveAbyssalOctarchAsteroidReleasePresentationTarget = ({
  selectedTentacleId,
  bossX,
  bossY,
  bossWidth,
  bossHeight
}: {
  selectedTentacleId: string | null | undefined;
  bossX: number;
  bossY: number;
  bossWidth: number;
  bossHeight: number;
}): Readonly<{ x: number; y: number }> | null => {
  const descriptor = resolveSelectedTentacle(selectedTentacleId);
  if (!descriptor) return null;
  return Object.freeze({
    x: finiteOr(bossX, 0) + finiteOr(bossWidth, 0) * descriptor.centerXRatio,
    y: finiteOr(bossY, 0) + finiteOr(bossHeight, 0) * descriptor.centerYRatio
  });
};

/**
 * Presentation counterpart of the authored horizontal sweep lane. Warning
 * frames hold at the entry edge, active frames cross the lane, and recovery
 * holds the exit edge while the arm retracts. The inset keeps the complete
 * equal-canvas sprite inside the expanded portrait without changing damage.
 */
export const resolveAbyssalOctarchSweepPresentationTarget = ({
  sequence,
  stage,
  progress,
  arenaWidth,
  bossWidth,
  laneY
}: {
  sequence: number;
  stage: string | null | undefined;
  progress: number;
  arenaWidth: number;
  bossWidth: number;
  laneY: number;
}): Readonly<{ x: number; y: number }> => {
  const safeWidth = Math.max(1, finiteOr(arenaWidth, 1));
  const safeBossWidth = Math.max(1, finiteOr(bossWidth, 1));
  const normalizedStage = String(stage ?? '').toLowerCase();
  const activeProgress = normalizedStage === 'active' || normalizedStage === 'fire'
    ? clamp(finiteOr(progress, 0), 0, 1)
    : normalizedStage === 'recovery' || normalizedStage === 'cooldown'
      ? 1
      : 0;
  const fromLeft = (Math.max(0, Math.floor(finiteOr(sequence, 0))) & 1) === 0;
  const rawX = fromLeft
    ? -safeBossWidth * 0.15
      + (safeWidth + safeBossWidth * 0.3) * activeProgress
    : safeWidth + safeBossWidth * 0.15
      - (safeWidth + safeBossWidth * 0.3) * activeProgress;
  const inset = clamp(Math.max(36, safeBossWidth * 0.08), 2, safeWidth / 2);
  return Object.freeze({
    x: clamp(rawX, inset, safeWidth - inset),
    y: finiteOr(laneY, 0)
  });
};

const normalizeRadians = (value: number) => {
  let normalized = value;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
};

const DIRECT_TENTACLE_ACTION_IDS = Object.freeze([
  'grasp-and-hurl',
  'tentacle-slam',
  'sweeping-arm',
  'needle-tip-stab',
  'asteroid-hurl'
] as const satisfies readonly AbyssalOctarchActionId[]);

const isDirectTentacleAction = (
  actionId: AbyssalOctarchActionId | null
): actionId is (typeof DIRECT_TENTACLE_ACTION_IDS)[number] => Boolean(
  actionId && DIRECT_TENTACLE_ACTION_IDS.includes(
    actionId as (typeof DIRECT_TENTACLE_ACTION_IDS)[number]
  )
);

const preferredTentacleIndex = (
  actionId: (typeof DIRECT_TENTACLE_ACTION_IDS)[number]
) => actionId === 'sweeping-arm' || actionId === 'asteroid-hurl'
  ? 0
  : actionId === 'tentacle-slam'
    ? 1
    : actionId === 'needle-tip-stab'
      ? 2
      : 3;

const resolveSelectedTentacle = (
  selectedComponentId: string | null | undefined
) => ABYSSAL_OCTARCH_TENTACLES.find((tentacle) => (
  tentacle.id === selectedComponentId
));

interface TargetedTentacleReach {
  readonly rotationOffset: number;
  readonly scaleXMultiplier: number;
  readonly tipX: number;
  readonly tipY: number;
}

const sampleTargetedTentacleReach = ({
  target,
  side,
  mountX,
  mountY,
  authoredRotation,
  baseRotationOffset,
  rootXOffset,
  rootYOffset,
  rootRotationOffset,
  stage,
  progress
}: {
  target: Readonly<{ x: number; y: number }>;
  side: 'port' | 'starboard';
  mountX: number;
  mountY: number;
  authoredRotation: number;
  baseRotationOffset: number;
  rootXOffset: number;
  rootYOffset: number;
  rootRotationOffset: number;
  stage: string;
  progress: number;
}): TargetedTentacleReach => {
  const rootDx = target.x - rootXOffset;
  const rootDy = target.y
    - (ABYSSAL_OCTARCH_CANONICAL_ROOT_Y + rootYOffset);
  const rootCos = Math.cos(rootRotationOffset);
  const rootSin = Math.sin(rootRotationOffset);
  const localTargetX = rootDx * rootCos + rootDy * rootSin;
  const localTargetY = -rootDx * rootSin + rootDy * rootCos;
  const dx = localTargetX - mountX;
  const dy = localTargetY - mountY;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const targetAngle = Math.atan2(dy, dx);
  const desiredRotation = side === 'port' ? targetAngle - Math.PI : targetAngle;
  const targetRotationOffset = normalizeRadians(desiredRotation - authoredRotation);
  const warningStage = stage === 'preparation'
    || stage === 'transition'
    || stage === 'telegraph'
    || stage === 'warning';
  const activeStage = stage === 'active'
    || stage === 'fire'
    || stage === 'held'
    || stage === 'throwing';
  const recoveryStage = stage === 'recovery' || stage === 'cooldown';
  const retractProgress = warningStage
    ? smoothstep(clamp(progress / 0.24, 0, 1))
    : 0;
  const turnProgress = warningStage
    ? smoothstep(clamp((progress - 0.2) / 0.45, 0, 1))
    : 0;
  const extendProgress = warningStage
    ? smoothstep(clamp((progress - 0.6) / 0.4, 0, 1))
    : 0;
  const recoveryRetract = recoveryStage
    ? smoothstep(clamp(progress / 0.32, 0, 1))
    : 0;
  const recoveryTurn = recoveryStage
    ? smoothstep(clamp((progress - 0.28) / 0.44, 0, 1))
    : 0;
  const recoveryExtend = recoveryStage
    ? smoothstep(clamp((progress - 0.7) / 0.3, 0, 1))
    : 0;
  const rotationBlend = activeStage
    ? 1
    : warningStage
      ? turnProgress
      : recoveryStage
        ? 1 - recoveryTurn
        : 0;
  const rotationOffset = baseRotationOffset + normalizeRadians(
    targetRotationOffset - baseRotationOffset
  ) * rotationBlend;
  const authoredReach = 224 * 0.94;
  const contactScale = clamp(distance / authoredReach, 0.32, 8);
  let scaleXMultiplier = 1;
  if (activeStage) {
    scaleXMultiplier = contactScale;
  } else if (warningStage) {
    const retractedScale = 1 + (0.4 - 1) * retractProgress;
    scaleXMultiplier = retractedScale
      + (contactScale - retractedScale) * extendProgress;
  } else if (recoveryStage) {
    const retractedScale = contactScale
      + (0.4 - contactScale) * recoveryRetract;
    scaleXMultiplier = retractedScale
      + (1 - retractedScale) * recoveryExtend;
  }
  const finalRotation = authoredRotation + rotationOffset;
  const sideSign = side === 'port' ? -1 : 1;
  const tipDistance = sideSign * authoredReach * scaleXMultiplier;
  return Object.freeze({
    rotationOffset,
    scaleXMultiplier,
    tipX: mountX + Math.cos(finalRotation) * tipDistance,
    tipY: mountY + Math.sin(finalRotation) * tipDistance
  });
};

const frameForTentacle = ({
  index,
  selected,
  actionId,
  stage,
  progress
}: {
  index: number;
  selected: boolean;
  actionId: AbyssalOctarchActionId | null;
  stage: string;
  progress: number;
}) => {
  const active = stage === 'active' || stage === 'fire';
  const held = stage === 'held' || stage === 'throwing';
  const warning = stage === 'preparation'
    || stage === 'transition'
    || stage === 'telegraph'
    || stage === 'warning';
  const recovery = stage === 'recovery' || stage === 'cooldown';
  const canonicalFrame = index === 0
    ? 'tentacle.sweep.neutral'
    : index === 1
      ? 'tentacle.slam.hanging'
      : index === 2
        ? 'tentacle.constrict.loose'
        : 'tentacle.grasp.open';
  if (recovery && progress >= 0.999) return canonicalFrame;
  if (selected && actionId === 'sweeping-arm') {
    if (active) return 'tentacle.sweep.extended';
    if (warning) return 'tentacle.sweep.windup';
    return 'tentacle.sweep.neutral';
  }
  if (selected && actionId === 'tentacle-slam') {
    if (active || held) return 'tentacle.slam.needle';
    if (warning) return 'tentacle.slam.windup';
    return 'tentacle.slam.hanging';
  }
  if (selected && actionId === 'needle-tip-stab') {
    if (active || held) return 'tentacle.constrict.extended';
    if (warning) return progress > 0.45
      ? 'tentacle.constrict.tight'
      : 'tentacle.constrict.loose';
    return 'tentacle.constrict.loose';
  }
  if (selected && (actionId === 'constricting-ring' || actionId === 'suction-current')) {
    if (active || held) return 'tentacle.constrict.tight';
    if (warning) return progress > 0.48
      ? 'tentacle.constrict.tight'
      : 'tentacle.constrict.loose';
    return recovery ? 'tentacle.constrict.extended' : 'tentacle.constrict.loose';
  }
  if (selected && actionId === 'asteroid-hurl') {
    if (active) return progress > 0.68
      ? 'tentacle.grasp.closed'
      : 'tentacle.grasp.reach';
    if (warning) return progress > 0.16
      ? 'tentacle.grasp.closed'
      : 'tentacle.grasp.reach';
  }
  if (selected && actionId === 'grasp-and-hurl') {
    if (held || stage === 'throwing') return 'tentacle.grasp.closed';
    if (active) return progress > 0.68
      ? 'tentacle.grasp.closed'
      : 'tentacle.grasp.reach';
    if (warning) return progress > 0.55
      ? 'tentacle.grasp.reach'
      : 'tentacle.grasp.open';
  }
  return canonicalFrame;
};

/**
 * Verifies the eight independently parented tentacles and every attack origin
 * expected by the Octarch encounter runtime.
 */
export const validateAbyssalOctarchRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly AbyssalOctarchRigCompatibilityIssue[] => {
  const issues: AbyssalOctarchRigCompatibilityIssue[] = [];
  ABYSSAL_OCTARCH_PART_IDS.forEach((partId) => {
    if (!registration.partById[partId]) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Abyssal Octarch part ${partId}.`
      }));
    }
  });
  ABYSSAL_OCTARCH_TENTACLE_PART_IDS.forEach((partId) => {
    const expectedParent = `${partId}.mount`;
    const part = registration.partById[partId];
    if (part && part.parentId !== expectedParent) {
      issues.push(Object.freeze({
        path: `/parts/${partId}/parentId`,
        message: `${partId} must remain parented to ${expectedParent}.`
      }));
    }
  });
  const expectedParents = Object.freeze({
    body: 'root',
    'effect.void-cloud': 'root',
    'effect.core': 'body',
    'effect.mouth': 'body',
    'effect.attack.port': 'root',
    'effect.attack.starboard': 'root',
    'effect.damage': 'body',
    'effect.implosion': 'body'
  } as const);
  Object.entries(expectedParents).forEach(([partId, parentId]) => {
    const part = registration.partById[partId];
    if (part && part.parentId !== parentId) {
      issues.push(Object.freeze({
        path: `/parts/${partId}/parentId`,
        message: `${partId} must remain parented to ${parentId}.`
      }));
    }
  });
  ABYSSAL_OCTARCH_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    if (!socket) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Abyssal Octarch socket ${socketId}.`
      }));
      return;
    }
    if (socketId.startsWith('tentacle-')) {
      const match = /^tentacle-(\d)-(port|starboard)-tip$/.exec(socketId);
      const expectedPartId = match ? `tentacle.${match[1]}.${match[2]}` : '';
      if (socket.partId !== expectedPartId || socket.role !== 'melee-root') {
        issues.push(Object.freeze({
          path: `/sockets/${socketId}`,
          message: `${socketId} must follow ${expectedPartId} as melee-root.`
        }));
      }
    }
  });
  return Object.freeze(issues);
};

const selectedEffectFrame = (
  actionId: AbyssalOctarchActionId | null,
  stage: string,
  progress: number
) => {
  if (actionId === 'grasp-and-hurl' || actionId === 'constricting-ring') {
    return 'vfx.grab-ring';
  }
  if (actionId === 'tentacle-slam') return 'vfx.slam-shockwave';
  if (actionId === 'sweeping-arm') return 'vfx.socket-burst';
  if (actionId === 'needle-tip-stab') return 'vfx.bolt';
  if (actionId === 'asteroid-hurl') {
    if (stage === 'recovery' || stage === 'cooldown') return 'vfx.asteroid-fragments';
    if (stage === 'active' || stage === 'fire' || stage === 'throwing') {
      return progress > 0.72 ? 'vfx.asteroid-cracked' : 'vfx.asteroid';
    }
    return 'vfx.asteroid';
  }
  return 'vfx.impact';
};

/**
 * Fixed-step pose sampling for idle and all eight Octarch motion cues. Every
 * result is derived from the canonical neutral transforms, so repeatedly
 * entering and leaving attacks cannot accumulate drift.
 */
export const sampleAbyssalOctarchModularPose = (
  input: PreviewBossModularPoseInput
): ModularBossRigPoseOverrides => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = clamp(Math.floor(finiteOr(input.phaseIndex, 1)), 1, 4);
  const damageStage = clamp(Math.floor(finiteOr(input.damageStage, 0)), 0, 5);
  const entrance = smoothstep(finiteOr(input.entranceProgress, 1));
  const entranceFold = 1 - entrance;
  const action = input.action;
  const actionId = resolveActionId(input);
  const stage = String(action?.stage ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const actionEnergy = sampleActionEnergy(stage, progress);
  const liveSelectedTentacle = resolveSelectedTentacle(action?.selectedComponentId);
  const sides = selectedSides(liveSelectedTentacle?.side ?? action?.side);
  const directAction = isDirectTentacleAction(actionId) ? actionId : null;
  const fallbackDirectIndex = directAction
    ? preferredTentacleIndex(directAction)
    : null;
  const reducedAmbient = input.reducedMotion ? 0.25 : 1;
  const reducedAction = input.reducedMotion ? 0.62 : 1;
  const pressure = 1 - healthRatio;
  const critical = phaseIndex >= 4 || healthRatio <= 0.2 || damageStage >= 4;
  const hover = Math.sin(frame * 0.031) * 3.4 * reducedAmbient;
  const drift = Math.sin(frame * 0.017 + 0.73) * 2.2 * reducedAmbient;
  const breath = Math.sin(frame * 0.044 + 0.2) * reducedAmbient;
  const reactionProgress = clamp(finiteOr(input.reaction?.progress, 1), 0, 1);
  const reactionEnergy = input.reaction
    ? Math.sin(reactionProgress * Math.PI)
      * clamp(finiteOr(input.reaction.strength, 0), 0, 2)
      * (input.reaction.kind === 'stagger' ? 1 : 0.42)
    : 0;
  const reactionDirection = input.reaction?.direction ?? 1;
  const phaseTransitionProgress = input.phaseProgress === undefined
    ? 0
    : clamp(finiteOr(input.phaseProgress, 0), 0, 1);
  const phaseTransitionEnergy = input.phaseProgress === undefined
    ? 0
    : Math.sin(phaseTransitionProgress * Math.PI);
  const finalCoreTransition = phaseIndex >= 4 && phaseTransitionEnergy > 0.001;
  const phaseSpread = (phaseIndex - 1) * 3.5;
  const instability = critical
    ? Math.sin(frame * 0.147 + 0.5) * (1.1 + pressure * 1.8) * reducedAmbient
    : 0;
  const isSuction = actionId === 'suction-current';
  const isGaze = actionId === 'abyssal-gaze';
  const isConstrict = actionId === 'constricting-ring';
  const isImploding = critical && isGaze && actionEnergy > 0.72;
  const showDamage = damageStage >= 2 || healthRatio <= 0.48;
  const asteroidProjectileReleased = actionId === 'asteroid-hurl'
    && (stage === 'active' || stage === 'fire');
  const rootXOffset = drift
    + instability
    + reactionDirection * reactionEnergy * 4
    + Math.sin(phaseTransitionProgress * Math.PI * 4) * phaseTransitionEnergy * 5;
  const rootYOffset = hover
    - entranceFold * 76
    + reactionEnergy * 1.5
    + phaseTransitionEnergy * 10;
  const rootRotationOffset = drift * 0.004
    + instability * 0.006
    + reactionDirection * reactionEnergy * 0.028
    + Math.sin(phaseTransitionProgress * Math.PI * 5) * phaseTransitionEnergy * 0.032;

  const overrides: Record<string, ModularBossPartPoseOverride> = {
    root: freezeOverride({
      xOffset: rootXOffset,
      yOffset: rootYOffset,
      rotationOffset: rootRotationOffset
    }),
    body: freezeOverride({
      frameId: finalCoreTransition
        ? 'body.core-exposed'
        : phaseTransitionEnergy > 0.001
          ? 'body.anger'
          : isGaze
        ? 'body.core-exposed'
        : phaseIndex >= 4 || healthRatio <= 0.12
          ? 'body.collapse'
          : phaseIndex >= 3 || healthRatio <= 0.45
            ? 'body.core-exposed'
            : phaseIndex >= 2 || isSuction || actionId === 'asteroid-hurl'
              ? 'body.anger'
              : 'body.neutral',
      yOffset: -breath * 0.8 - phaseTransitionEnergy * 4,
      rotationOffset: instability * 0.004,
      scaleXMultiplier: 1
        + breath * 0.004
        + (isGaze ? actionEnergy * 0.025 : 0)
        + phaseTransitionEnergy * 0.085,
      scaleYMultiplier: 1
        - breath * 0.004
        + (isGaze ? actionEnergy * 0.025 : 0)
        - phaseTransitionEnergy * 0.035
    }),
    'effect.void-cloud': freezeOverride({
      frameId: `vfx.void-cloud.${Math.floor(frame / 6) % 3}`,
      visible: isSuction || isConstrict || phaseIndex >= 4 || phaseTransitionEnergy > 0.001,
      alpha: isSuction || isConstrict
        ? 0.48 + actionEnergy * 0.3
        : phaseTransitionEnergy > 0.001
          ? 0.22 + phaseTransitionEnergy * 0.42
          : phaseIndex >= 4 ? 0.28 + Math.abs(Math.sin(frame * 0.08)) * 0.2 : 0,
      rotationOffset: frame * 0.011,
      scaleXMultiplier: 1 + actionEnergy * 0.48,
      scaleYMultiplier: 1 + actionEnergy * 0.48
    }),
    'effect.core': freezeOverride({
      frameId: isGaze && (stage === 'active' || stage === 'fire')
        ? 'vfx.beam-segment'
        : 'vfx.charged-orb',
      visible: (isGaze && actionEnergy > 0.04) || finalCoreTransition,
      alpha: finalCoreTransition
        ? 0.64 + phaseTransitionEnergy * 0.36
        : isGaze ? 0.74 + actionEnergy * 0.26 : 0,
      rotationOffset: isGaze && (stage === 'active' || stage === 'fire')
        ? Math.PI / 2
        : frame * 0.018,
      scaleXMultiplier: finalCoreTransition
        ? 0.82 + phaseTransitionEnergy * 1.15
        : 0.82 + actionEnergy * (stage === 'active' || stage === 'fire' ? 2.4 : 0.6),
      scaleYMultiplier: finalCoreTransition
        ? 0.82 + phaseTransitionEnergy * 1.15
        : 0.82 + actionEnergy * 0.58
    }),
    'effect.mouth': freezeOverride({
      visible: isSuction && actionEnergy > 0.04,
      alpha: isSuction ? 0.72 + actionEnergy * 0.28 : 0,
      rotationOffset: frame * 0.024,
      scaleXMultiplier: 0.86 + actionEnergy * 0.56,
      scaleYMultiplier: 0.86 + actionEnergy * 0.56
    }),
    'effect.attack.port': freezeOverride({
      frameId: selectedEffectFrame(actionId, stage, progress),
      visible: Boolean(actionId && actionId !== 'suction-current' && actionId !== 'abyssal-gaze' && sides.port && actionEnergy > 0.05 && !asteroidProjectileReleased),
      alpha: sides.port ? 0.68 + actionEnergy * 0.32 : 0,
      xOffset: actionId === 'asteroid-hurl' ? -38 + progress * 34 : -actionEnergy * 18,
      yOffset: actionId === 'tentacle-slam' || actionId === 'needle-tip-stab'
        ? 54 + actionEnergy * 34
        : actionId === 'grasp-and-hurl' || actionId === 'asteroid-hurl'
          ? 74 + actionEnergy * 28
          : actionEnergy * 16,
      rotationOffset: -0.18 - frame * 0.006,
      scaleXMultiplier: 0.8 + actionEnergy * 0.42,
      scaleYMultiplier: 0.8 + actionEnergy * 0.42
    }),
    'effect.attack.starboard': freezeOverride({
      frameId: selectedEffectFrame(actionId, stage, progress),
      visible: Boolean(actionId && actionId !== 'suction-current' && actionId !== 'abyssal-gaze' && sides.starboard && actionEnergy > 0.05 && !asteroidProjectileReleased),
      alpha: sides.starboard ? 0.68 + actionEnergy * 0.32 : 0,
      xOffset: actionId === 'asteroid-hurl' ? 38 - progress * 34 : actionEnergy * 18,
      yOffset: actionId === 'tentacle-slam' || actionId === 'needle-tip-stab'
        ? 54 + actionEnergy * 34
        : actionId === 'grasp-and-hurl' || actionId === 'asteroid-hurl'
          ? 74 + actionEnergy * 28
          : actionEnergy * 16,
      rotationOffset: 0.18 + frame * 0.006,
      scaleXMultiplier: 0.8 + actionEnergy * 0.42,
      scaleYMultiplier: 0.8 + actionEnergy * 0.42
    }),
    'effect.damage': freezeOverride({
      visible: showDamage || phaseTransitionEnergy > 0.001,
      alpha: phaseTransitionEnergy > 0.001
        ? 0.5 + phaseTransitionEnergy * 0.5
        : showDamage ? 0.46 + Math.abs(Math.sin(frame * 0.23)) * 0.5 : 0,
      rotationOffset: frame * 0.013,
      scaleXMultiplier: 0.82 + pressure * 0.34,
      scaleYMultiplier: 0.82 + pressure * 0.34
    }),
    'effect.implosion': freezeOverride({
      visible: isImploding,
      alpha: isImploding ? 0.64 + actionEnergy * 0.36 : 0,
      rotationOffset: -frame * 0.019,
      scaleXMultiplier: 0.7 + actionEnergy * 0.9,
      scaleYMultiplier: 0.7 + actionEnergy * 0.9
    })
  };

  const selectedActionTip: {
    value: Readonly<{
      side: 'port' | 'starboard';
      x: number;
      y: number;
    }> | null;
  } = { value: null };

  ([0, 1, 2, 3] as const).forEach((index) => {
    (['port', 'starboard'] as const).forEach((side) => {
      const sideSign = side === 'port' ? -1 : 1;
      const mountId = `tentacle.${index}.${side}.mount`;
      const partId = `tentacle.${index}.${side}`;
      const selected = directAction
        ? liveSelectedTentacle
          ? liveSelectedTentacle.partId === partId
          : index === fallbackDirectIndex && sides[side]
        : sides[side];
      const idleWave = Math.sin(frame * (0.027 + index * 0.0025) + index * 0.83)
        * (0.024 + index * 0.006)
        * reducedAmbient
        * sideSign;
      let xOffset = sideSign * phaseSpread - sideSign * entranceFold * 25;
      let yOffset = entranceFold * (18 + index * 3) + breath * (index % 2 === 0 ? 0.8 : -0.8);
      let rotationOffset = idleWave - sideSign * entranceFold * (0.26 + index * 0.05);
      let scaleXMultiplier = 1;

      if (phaseTransitionEnergy > 0.001) {
        xOffset += sideSign * phaseTransitionEnergy * (10 + index * 2.5);
        yOffset += phaseTransitionEnergy * (index < 2 ? -7 - index * 2 : 9 + index * 3);
        rotationOffset += sideSign * phaseTransitionEnergy * (0.13 + index * 0.035);
      }

      if (selected && actionId) {
        const energy = actionEnergy * reducedAction;
        if (directAction) {
          const target = action?.targetDesignPoint;
          if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
            const mount = ABYSSAL_OCTARCH_NEUTRAL_TENTACLE_MOUNTS[index];
            const mountX = sideSign * mount.x + xOffset;
            const mountY = mount.y + yOffset;
            const authoredRotation = (
              side === 'port' ? mount.portRotation : mount.starboardRotation
            ) * Math.PI / 180;
            const reach = sampleTargetedTentacleReach({
              target,
              side,
              mountX,
              mountY,
              authoredRotation,
              baseRotationOffset: rotationOffset,
              rootXOffset,
              rootYOffset,
              rootRotationOffset,
              stage,
              progress
            });
            rotationOffset = reach.rotationOffset;
            scaleXMultiplier = reach.scaleXMultiplier;
            selectedActionTip.value = Object.freeze({
              side,
              x: reach.tipX,
              y: reach.tipY
            });
          } else if (actionId === 'sweeping-arm') {
            xOffset += sideSign * energy * 20;
            yOffset += energy * 18;
            rotationOffset += sideSign * energy
              * (0.38 + Math.sin(progress * Math.PI) * 0.28);
          } else if (actionId === 'tentacle-slam') {
            xOffset -= sideSign * energy * 9;
            yOffset += energy * 42;
            rotationOffset -= sideSign * energy * 0.31;
          } else if (actionId === 'needle-tip-stab') {
            xOffset -= sideSign * energy * 18;
            yOffset += energy * 54;
            rotationOffset -= sideSign * energy * 0.45;
          } else if (actionId === 'grasp-and-hurl') {
            xOffset -= sideSign * energy * 30;
            yOffset += energy * 34;
            rotationOffset -= sideSign * energy * 0.34;
          } else if (actionId === 'asteroid-hurl') {
            xOffset -= sideSign * energy * 19;
            yOffset += energy * 25;
            rotationOffset -= sideSign * energy * 0.26;
          }
        } else if (actionId === 'constricting-ring' && index === 2) {
          xOffset -= sideSign * energy * 36;
          yOffset += energy * 22;
          rotationOffset -= sideSign * energy * 0.48;
        } else if (actionId === 'suction-current') {
          xOffset -= sideSign * energy * (8 + index * 3);
          yOffset += energy * (5 + index * 4);
          rotationOffset -= sideSign * energy * (0.11 + index * 0.045);
        } else if (actionId === 'abyssal-gaze') {
          xOffset += sideSign * energy * (8 + index * 2);
          yOffset -= energy * (index < 2 ? 5 : 1);
          rotationOffset += sideSign * energy * (0.13 + index * 0.025);
        }
      }

      overrides[mountId] = freezeOverride({ xOffset, yOffset, rotationOffset });
      overrides[partId] = freezeOverride({
        frameId: frameForTentacle({
          index,
          selected,
          actionId,
          stage,
          progress
        }),
        scaleXMultiplier
      });
    });
  });

  const resolvedActionTip = selectedActionTip.value;
  if (resolvedActionTip && directAction) {
    const effectId = `effect.attack.${resolvedActionTip.side}`;
    const effectBaseX = resolvedActionTip.side === 'port' ? -118 : 118;
    overrides[effectId] = freezeOverride({
      frameId: selectedEffectFrame(actionId, stage, progress),
      visible: actionEnergy > 0.05 && !asteroidProjectileReleased,
      alpha: 0.68 + actionEnergy * 0.32,
      xOffset: resolvedActionTip.x - effectBaseX,
      yOffset: resolvedActionTip.y - 24,
      rotationOffset: resolvedActionTip.side === 'port'
        ? -0.18 - frame * 0.006
        : 0.18 + frame * 0.006,
      scaleXMultiplier: 0.8 + actionEnergy * 0.42,
      scaleYMultiplier: 0.8 + actionEnergy * 0.42
    });
  }

  return Object.freeze(overrides);
};

/** Compile-time proof that the runtime cue registry still contains all eight. */
export const ABYSSAL_OCTARCH_POSE_MOTION_CUES = Object.freeze(
  Object.values(ABYSSAL_OCTARCH_MOTION_CUES)
);
