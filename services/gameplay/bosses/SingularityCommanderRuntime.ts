import type {
  BossTimelineConfig,
  BossTimelineMotionCue,
  BossTimelinePrimitiveId
} from '../../../game-config/types';
import {
  getBossTimelineAttackWindow,
  getBossTimelineDurationFrames,
  resolveBossTimelineAttackVariant
} from './BossTimelineRuntime';

export const SINGULARITY_REACH_BOSS_ID = 'singularity-crab' as const;

export const SINGULARITY_ACTION_IDS = Object.freeze([
  'gravity-well-genesis',
  'event-horizon-gaze',
  'tidal-claw-pincer',
  'orbital-pylon-barrage',
  'singularity-pulse',
  'gravity-collapse'
] as const);

export type SingularityActionId = (typeof SINGULARITY_ACTION_IDS)[number];

export const SINGULARITY_PRIMITIVE_IDS = Object.freeze({
  'gravity-well-genesis': 'singularity-gravity-well-genesis',
  'event-horizon-gaze': 'singularity-event-horizon-gaze',
  'tidal-claw-pincer': 'singularity-tidal-claw-pincer',
  'orbital-pylon-barrage': 'singularity-orbital-pylon-barrage',
  'singularity-pulse': 'singularity-pulse',
  'gravity-collapse': 'singularity-gravity-collapse'
} as const);

export type SingularityPrimitiveId = (
  typeof SINGULARITY_PRIMITIVE_IDS
)[SingularityActionId];

export const SINGULARITY_MOTION_CUES = Object.freeze({
  'gravity-well-genesis': 'singularity-well-genesis',
  'event-horizon-gaze': 'singularity-event-horizon-gaze',
  'tidal-claw-pincer': 'singularity-tidal-pincer',
  'orbital-pylon-barrage': 'singularity-pylon-barrage',
  'singularity-pulse': 'singularity-pulse',
  'gravity-collapse': 'singularity-gravity-collapse'
} as const);

export type SingularityMotionCue = (
  typeof SINGULARITY_MOTION_CUES
)[SingularityActionId];

export const SINGULARITY_PHASES = Object.freeze([
  Object.freeze({
    id: 'gravitational-calibration',
    label: 'Gravitational Calibration',
    index: 1 as const,
    triggerHealthRatio: 1,
    warningFrames: 48,
    recoveryFrames: 72
  }),
  Object.freeze({
    id: 'spatial-compression',
    label: 'Spatial Compression',
    index: 2 as const,
    triggerHealthRatio: 0.7,
    warningFrames: 42,
    recoveryFrames: 60
  }),
  Object.freeze({
    id: 'event-horizon-instability',
    label: 'Event Horizon Instability',
    index: 3 as const,
    triggerHealthRatio: 0.35,
    warningFrames: 36,
    recoveryFrames: 48
  })
] as const);

export type SingularityPhase = (typeof SINGULARITY_PHASES)[number];
export type SingularityPhaseId = SingularityPhase['id'];
export type SingularityPhaseIndex = SingularityPhase['index'];

/**
 * The authored warnings and recoveries remain untouched. These values replace
 * only the otherwise-empty wait between one completed sentence and the next
 * warning, keeping later phases progressively more urgent.
 */
export const SINGULARITY_PHASE_TRANSITION_FRAMES = Object.freeze({
  'gravitational-calibration': 48,
  'spatial-compression': 36,
  'event-horizon-instability': 24
} satisfies Readonly<Record<SingularityPhaseId, number>>);

export interface SingularityQueuedAttackTransition {
  readonly phaseId: SingularityPhaseId;
  readonly attackId: string;
  readonly attackLabel: string;
  readonly attackRole: 'core' | 'signature';
  readonly sourceClipId: string;
  readonly primitiveId: BossTimelinePrimitiveId;
  readonly motionCue?: BossTimelineMotionCue;
  readonly transitionStartFrame: number;
  readonly nextAttackStartFrame: number;
  readonly transitionFrames: number;
}

/**
 * Resolves the next authored attack only while the phase clock is in a true
 * post-recovery gap. The first entrance is intentionally excluded. Returned
 * frames are absolute attackTimer frames, including a transition that crosses
 * a looping timeline boundary.
 */
export const resolveSingularityQueuedAttackTransition = ({
  timeline,
  phaseId,
  attackFrame,
  framesPerSecond = 60
}: {
  timeline: BossTimelineConfig;
  phaseId: SingularityPhaseId;
  attackFrame: number;
  framesPerSecond?: number;
}): SingularityQueuedAttackTransition | null => {
  const durationFrames = Math.max(
    1,
    getBossTimelineDurationFrames(timeline, framesPerSecond)
  );
  const safeFrame = Math.max(0, Math.floor(Number(attackFrame) || 0));
  const cycleIndex = Math.floor(safeFrame / durationFrames);
  const timelineFrame = safeFrame % durationFrames;
  const windows = (timeline.attacks ?? []).flatMap((attack) => {
    const resolved = resolveBossTimelineAttackVariant(timeline, attack.id, phaseId);
    const window = getBossTimelineAttackWindow(
      timeline,
      attack.id,
      phaseId,
      framesPerSecond
    );
    if (!resolved || !window) return [];
    const sourceClip = resolved.variant.beatClipIds
      .map((clipId) => timeline.clips.find((clip) => clip.id === clipId))
      .find((clip) => Boolean(clip));
    if (!sourceClip) return [];
    return [{ attack, window, sourceClip }];
  }).sort((left, right) => left.window.startFrame - right.window.startFrame);
  if (windows.length === 0) return null;
  if (windows.some(({ window }) => (
    timelineFrame >= window.startFrame && timelineFrame < window.endFrame
  ))) {
    return null;
  }

  let previous = [...windows].reverse().find(({ window }) => (
    window.endFrame <= timelineFrame
  ));
  let previousCycleIndex = cycleIndex;
  let next = windows.find(({ window }) => window.startFrame > timelineFrame);
  let nextCycleIndex = cycleIndex;

  if (!previous) {
    // Preserve the intentional opening read on the very first cycle.
    if (cycleIndex === 0) return null;
    previous = windows[windows.length - 1];
    previousCycleIndex -= 1;
  }
  if (!next) {
    next = windows[0];
    nextCycleIndex += 1;
  }

  const previousEndFrame = previousCycleIndex * durationFrames + previous.window.endFrame;
  const nextAttackStartFrame = nextCycleIndex * durationFrames + next.window.startFrame;
  if (safeFrame < previousEndFrame || safeFrame >= nextAttackStartFrame) return null;
  const configuredTransitionFrames = SINGULARITY_PHASE_TRANSITION_FRAMES[phaseId];
  const transitionStartFrame = Math.max(
    previousEndFrame,
    nextAttackStartFrame - configuredTransitionFrames
  );
  return Object.freeze({
    phaseId,
    attackId: next.attack.id,
    attackLabel: next.attack.label,
    attackRole: next.attack.role,
    sourceClipId: next.sourceClip.id,
    primitiveId: next.sourceClip.primitiveId,
    motionCue: next.sourceClip.parameters?.motionCue,
    transitionStartFrame,
    nextAttackStartFrame,
    transitionFrames: Math.max(0, nextAttackStartFrame - transitionStartFrame)
  });
};

export const SINGULARITY_PHASE_ACTIONS: Readonly<Record<
  SingularityPhaseId,
  readonly SingularityActionId[]
>> = Object.freeze({
  'gravitational-calibration': Object.freeze([
    'gravity-well-genesis',
    'event-horizon-gaze',
    'orbital-pylon-barrage',
    'singularity-pulse'
  ] as const),
  'spatial-compression': Object.freeze([
    'gravity-well-genesis',
    'event-horizon-gaze',
    'tidal-claw-pincer',
    'orbital-pylon-barrage',
    'singularity-pulse'
  ] as const),
  'event-horizon-instability': SINGULARITY_ACTION_IDS
});

export const SINGULARITY_RUNTIME_LIMITS = Object.freeze({
  maximumActiveWells: 3,
  maximumOwnedProjectiles: 24,
  maximumPulseProjectiles: 112,
  maximumActiveBeams: 2,
  minimumBeamLockFrames: 24,
  minimumWellPlayerDistancePixels: 72,
  playerProtectionTopRatio: 0.72,
  minimumPincerRoutePixels: 78,
  minimumBeamSafeLanePixels: 72,
  minimumPulseGapPixels: 56,
  geometryUncertaintyPixels: 3,
  cleanupOnOwnerLoss: true,
  cleanupOnActionCancel: true,
  damageRequiresVisibleActiveState: true
} as const);

export type SingularityActionStage =
  | 'preparation'
  | 'telegraph'
  | 'fire'
  | 'recovery'
  | 'complete';

export interface SingularityStageDurations {
  readonly preparationFrames: number;
  readonly telegraphFrames: number;
  readonly fireFrames: number;
  readonly recoveryFrames: number;
}

export interface SingularityActionStageSample {
  readonly actionId: SingularityActionId;
  readonly phase: SingularityPhase;
  readonly stage: SingularityActionStage;
  readonly actionFrame: number;
  readonly stageFrame: number;
  readonly stageDurationFrames: number;
  readonly stageProgress: number;
  readonly totalFrames: number;
  readonly damageWindowActive: boolean;
  readonly complete: boolean;
  readonly shouldCleanupOwnedArtifacts: boolean;
}

export interface SingularityPoint {
  readonly x: number;
  readonly y: number;
}

export interface SingularityAnchorMovementSample extends SingularityPoint {
  readonly bankRadians: number;
  readonly breathingEnergy: number;
  readonly instabilityEnergy: number;
}

export type SingularityWellStage =
  | 'seed-travel'
  | 'forming'
  | 'mature-inactive'
  | 'active'
  | 'collapse-warning'
  | 'imploding'
  | 'expired';

export interface SingularityWellPlan extends SingularityPoint {
  readonly id: string;
  readonly index: number;
  readonly seedDelayFrames: number;
  readonly seedTravelFrames: number;
  readonly formingFrames: number;
  readonly inactiveFrames: number;
  readonly activeFrames: number;
  readonly collapseWarningFrames: number;
  readonly implosionFrames: number;
  readonly projectileCount: number;
  readonly radiusPixels: number;
}

export interface SingularityWellLifecycleSample {
  readonly stage: SingularityWellStage;
  readonly progress: number;
  readonly visible: boolean;
  readonly collisionActive: boolean;
  readonly damageActive: boolean;
  readonly emitsProjectiles: boolean;
  readonly shouldCleanup: boolean;
}

export type SingularityBeamVariant = 'fixed-lance' | 'slow-sweep' | 'split-lane';

export interface SingularityBeamPlan {
  readonly variant: SingularityBeamVariant;
  readonly beamCount: 1 | 2;
  readonly warningFrames: number;
  readonly lockFrame: number;
  readonly fireFrames: number;
  readonly recoveryFrames: number;
  readonly sweepRadians: number;
  readonly splitHalfAngleRadians: number;
  readonly safeLanePixels: number;
}

export interface SingularityBeamSample {
  readonly stage: 'tracking' | 'locked' | 'firing' | 'recovery' | 'complete';
  readonly progress: number;
  readonly aimAngleRadians: number;
  readonly beamAnglesRadians: readonly number[];
  readonly damageActive: boolean;
  readonly visibleWarning: boolean;
  readonly shouldCleanup: boolean;
}

export type SingularityPincerVariant = 'center-opening' | 'sequential' | 'seeded-feint';

export interface SingularityPincerPlan {
  readonly variant: SingularityPincerVariant;
  readonly firstSide: 'port' | 'starboard';
  readonly centerRoutePixels: number;
  readonly warningFrames: number;
  readonly activeFrames: number;
  readonly recoveryFrames: number;
}

export interface SingularityPincerSample {
  readonly stage: 'brace' | 'warning' | 'sweep' | 'hold' | 'return' | 'complete';
  readonly portEnergy: number;
  readonly starboardEnergy: number;
  readonly closeEnergy: number;
  readonly damageActive: boolean;
  readonly shouldCleanup: boolean;
}

export const SINGULARITY_PYLON_SOCKET_IDS = Object.freeze([
  'pylon-muzzle-upper-port',
  'pylon-muzzle-lower-port',
  'pylon-muzzle-lower-starboard',
  'pylon-muzzle-upper-starboard'
] as const);

export type SingularityPylonSocketId = (typeof SINGULARITY_PYLON_SOCKET_IDS)[number];

export interface SingularityPylonShot {
  readonly shotIndex: number;
  readonly socketId: SingularityPylonSocketId;
  readonly fireFrame: number;
  readonly aimed: boolean;
  readonly angleOffsetRadians: number;
}

export interface SingularityPulsePlan {
  readonly burstCount: number;
  readonly burstIntervalFrames: number;
  readonly projectileCountPerBurst: number;
  readonly gapAnglesByBurst: readonly (readonly [number, number])[];
  readonly gapHalfWidthRadians: number;
  readonly minimumGapPixels: number;
  readonly expansionFrames: number;
  readonly pullStrength: number;
}

export interface SingularityCollapseBeat {
  readonly wellIndex: number;
  readonly activationFrame: number;
  readonly implosionFrame: number;
  readonly endFrame: number;
}

export interface SingularityCollapsePlan {
  readonly wells: readonly SingularityWellPlan[];
  readonly beats: readonly SingularityCollapseBeat[];
  readonly recoveryFrames: number;
  readonly totalFrames: number;
}

export type SingularityDefeatStage =
  | 'pylons-failing'
  | 'claws-limp'
  | 'core-compression'
  | 'final-collapse'
  | 'complete';

export interface SingularityDefeatSample {
  readonly stage: SingularityDefeatStage;
  readonly progress: number;
  readonly rewardReady: boolean;
  readonly collisionActive: false;
  readonly attacksActive: false;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const clamp01 = (value: number) => clamp(Number(value) || 0, 0, 1);

const finiteOr = (value: number | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const smoothstep = (value: number) => {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
};

const lerp = (start: number, end: number, progress: number) => (
  start + (end - start) * clamp01(progress)
);

const positiveModulo = (value: number, divisor: number) => (
  ((Math.floor(value) % divisor) + divisor) % divisor
);

const hashSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const resolveSingularitySeedBranch = ({
  seedKey,
  executionIndex = 0,
  salt = '',
  branchCount
}: {
  seedKey: string;
  executionIndex?: number;
  salt?: string;
  branchCount: number;
}) => {
  const count = Math.max(1, Math.min(4_096, Math.floor(branchCount)));
  return positiveModulo(
    hashSeed(`${seedKey}:${salt}`) + Math.floor(executionIndex) * 31,
    count
  );
};

export const resolveSingularityPhase = (healthRatio: number): SingularityPhase => {
  const health = clamp01(healthRatio);
  if (health <= 0.35) return SINGULARITY_PHASES[2];
  if (health <= 0.7) return SINGULARITY_PHASES[1];
  return SINGULARITY_PHASES[0];
};

export const getSingularityAvailableActions = (
  phase: SingularityPhase | SingularityPhaseId | SingularityPhaseIndex
) => {
  const resolved = typeof phase === 'object'
    ? phase
    : typeof phase === 'number'
      ? SINGULARITY_PHASES[Math.max(0, Math.min(2, Math.floor(phase) - 1))]
      : SINGULARITY_PHASES.find((candidate) => candidate.id === phase)
        ?? SINGULARITY_PHASES[0];
  return SINGULARITY_PHASE_ACTIONS[resolved.id];
};

/**
 * Deterministic attack order with a bounded rotation and no immediate major
 * repeat. The campaign timeline may author this order explicitly; Sandbox and
 * reconstruction use the same helper when selecting the next sentence.
 */
export const buildSingularityAttackOrder = ({
  phase,
  seedKey,
  cycleIndex = 0,
  previousActionId
}: {
  phase: SingularityPhase | SingularityPhaseId | SingularityPhaseIndex;
  seedKey: string;
  cycleIndex?: number;
  previousActionId?: SingularityActionId;
}): readonly SingularityActionId[] => {
  const available = [...getSingularityAvailableActions(phase)];
  const offset = resolveSingularitySeedBranch({
    seedKey,
    executionIndex: cycleIndex,
    salt: 'attack-order',
    branchCount: available.length
  });
  const rotated = available.map((_, index) => available[(index + offset) % available.length]);
  if (previousActionId && rotated[0] === previousActionId && rotated.length > 1) {
    [rotated[0], rotated[1]] = [rotated[1], rotated[0]];
  }
  return Object.freeze(rotated);
};

const FIRE_FRAMES: Readonly<Record<SingularityActionId, number>> = Object.freeze({
  'gravity-well-genesis': 240,
  'event-horizon-gaze': 108,
  'tidal-claw-pincer': 132,
  'orbital-pylon-barrage': 156,
  'singularity-pulse': 204,
  'gravity-collapse': 330
});

const SINGULARITY_PULSE_BURSTS_BY_PHASE = Object.freeze({
  1: 3,
  2: 6,
  3: 9
} satisfies Readonly<Record<SingularityPhaseIndex, number>>);
const SINGULARITY_PULSE_BURST_INTERVAL_FRAMES = 45;
const SINGULARITY_PULSE_TAIL_FRAMES = 18;

const getSingularityPulseFireFrames = (phaseIndex: SingularityPhaseIndex) => (
  (SINGULARITY_PULSE_BURSTS_BY_PHASE[phaseIndex] - 1)
  * SINGULARITY_PULSE_BURST_INTERVAL_FRAMES
  + SINGULARITY_PULSE_TAIL_FRAMES
);

export const resolveSingularityStageDurations = (
  actionId: SingularityActionId,
  phaseIndex: SingularityPhaseIndex
): SingularityStageDurations => {
  const phase = SINGULARITY_PHASES[phaseIndex - 1];
  return Object.freeze({
    preparationFrames: actionId === 'gravity-collapse' ? 54 : 30,
    telegraphFrames: phase.warningFrames,
    fireFrames: actionId === 'singularity-pulse'
      ? getSingularityPulseFireFrames(phaseIndex)
      : FIRE_FRAMES[actionId],
    recoveryFrames: actionId === 'gravity-collapse'
      ? Math.max(90, phase.recoveryFrames)
      : phase.recoveryFrames
  });
};

export const sampleSingularityActionStage = ({
  actionId,
  phaseIndex,
  elapsedFrames
}: {
  actionId: SingularityActionId;
  phaseIndex: SingularityPhaseIndex;
  elapsedFrames: number;
}): SingularityActionStageSample => {
  const phase = SINGULARITY_PHASES[phaseIndex - 1];
  const durations = resolveSingularityStageDurations(actionId, phaseIndex);
  const actionFrame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const preparationEnd = durations.preparationFrames;
  const telegraphEnd = preparationEnd + durations.telegraphFrames;
  const fireEnd = telegraphEnd + durations.fireFrames;
  const recoveryEnd = fireEnd + durations.recoveryFrames;
  const stage: SingularityActionStage = actionFrame < preparationEnd
    ? 'preparation'
    : actionFrame < telegraphEnd
      ? 'telegraph'
      : actionFrame < fireEnd
        ? 'fire'
        : actionFrame < recoveryEnd
          ? 'recovery'
          : 'complete';
  const [stageStart, stageDuration] = stage === 'preparation'
    ? [0, durations.preparationFrames]
    : stage === 'telegraph'
      ? [preparationEnd, durations.telegraphFrames]
      : stage === 'fire'
        ? [telegraphEnd, durations.fireFrames]
        : stage === 'recovery'
          ? [fireEnd, durations.recoveryFrames]
          : [recoveryEnd, 1];
  return Object.freeze({
    actionId,
    phase,
    stage,
    actionFrame,
    stageFrame: Math.max(0, actionFrame - stageStart),
    stageDurationFrames: stageDuration,
    stageProgress: stage === 'complete'
      ? 1
      : clamp01((actionFrame - stageStart) / Math.max(1, stageDuration)),
    totalFrames: recoveryEnd,
    damageWindowActive: stage === 'fire',
    complete: stage === 'complete',
    shouldCleanupOwnedArtifacts: stage === 'complete'
  });
};

export const sampleSingularityAnchorMovement = ({
  frameCount,
  arenaWidth,
  arenaHeight,
  bossWidth,
  bossHeight,
  phaseIndex,
  actionId,
  actionStage
}: {
  frameCount: number;
  arenaWidth: number;
  arenaHeight: number;
  bossWidth: number;
  bossHeight: number;
  phaseIndex: SingularityPhaseIndex;
  actionId?: SingularityActionId;
  actionStage?: SingularityActionStage;
}): SingularityAnchorMovementSample => {
  const frame = Math.max(0, Math.floor(finiteOr(frameCount, 0)));
  const width = Math.max(1, finiteOr(arenaWidth, 390));
  const height = Math.max(1, finiteOr(arenaHeight, 844));
  const phasePressure = (phaseIndex - 1) / 2;
  const horizontalRange = Math.min(width * (0.12 + phasePressure * 0.035), 68);
  const verticalRange = Math.min(height * (0.018 + phasePressure * 0.006), 26);
  const brace = actionId === 'event-horizon-gaze' || actionId === 'gravity-collapse';
  const pincer = actionId === 'tidal-claw-pincer' && actionStage === 'fire';
  const horizontal = brace
    ? 0
    : Math.sin(frame * 0.0097 + phaseIndex * 0.61) * horizontalRange;
  const vertical = Math.sin(frame * 0.013 + 0.8) * verticalRange;
  const pincerDrop = pincer ? Math.min(height * 0.08, 58) : 0;
  return Object.freeze({
    x: clamp(width * 0.5 - bossWidth * 0.5 + horizontal, 8, width - bossWidth - 8),
    y: clamp(height * 0.14 - bossHeight * 0.35 + vertical + pincerDrop, 66, height * 0.38),
    bankRadians: brace ? 0 : clamp(horizontal / Math.max(1, horizontalRange), -1, 1) * 0.075,
    breathingEnergy: 0.5 + Math.sin(frame * 0.047) * 0.5,
    instabilityEnergy: phaseIndex === 3
      ? 0.45 + Math.sin(frame * 0.119 + 1.3) * 0.35
      : 0
  });
};

const WELL_LAYOUTS = Object.freeze([
  Object.freeze([[0.22, 0.08], [0.72, 0.68], [0.43, 0.36]]),
  Object.freeze([[0.76, 0.16], [0.25, 0.78], [0.57, 0.48]]),
  Object.freeze([[0.3, 0.28], [0.68, 0.12], [0.5, 0.86]]),
  Object.freeze([[0.2, 0.7], [0.78, 0.64], [0.5, 0.2]])
] as const);

export interface SingularityBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const distance = (left: SingularityPoint, right: SingularityPoint) => Math.hypot(
  left.x - right.x,
  left.y - right.y
);

export const buildSingularityGravityWellPlan = ({
  seedKey,
  phaseIndex,
  executionIndex = 0,
  arenaWidth,
  arenaHeight,
  playerCenter,
  bossBounds
}: {
  seedKey: string;
  phaseIndex: SingularityPhaseIndex;
  executionIndex?: number;
  arenaWidth: number;
  arenaHeight: number;
  playerCenter?: SingularityPoint;
  bossBounds?: SingularityBounds;
}): readonly SingularityWellPlan[] => {
  const width = Math.max(160, finiteOr(arenaWidth, 390));
  const height = Math.max(320, finiteOr(arenaHeight, 844));
  const branch = resolveSingularitySeedBranch({
    seedKey,
    executionIndex,
    salt: 'gravity-wells',
    branchCount: WELL_LAYOUTS.length
  });
  const count = phaseIndex === 1 ? 2 : 3;
  const layout = WELL_LAYOUTS[branch];
  const protectedY = height * SINGULARITY_RUNTIME_LIMITS.playerProtectionTopRatio;
  const minimumDistance = SINGULARITY_RUNTIME_LIMITS.minimumWellPlayerDistancePixels;
  const radiusPixels = phaseIndex === 1 ? 34 : phaseIndex === 2 ? 39 : 44;
  const maximumVisualRadius = radiusPixels * 1.35;
  const bossClearanceY = bossBounds
    ? bossBounds.y + bossBounds.height + maximumVisualRadius + 12
    : 132;
  const minimumCenterY = Math.max(132, bossClearanceY);
  const maximumCenterY = Math.max(
    minimumCenterY,
    protectedY - maximumVisualRadius
  );
  const plans = layout.slice(0, count).map(([ratioX, ratioY], index) => {
    let x = clamp(width * ratioX, 36, width - 36);
    const y = minimumCenterY + (maximumCenterY - minimumCenterY) * ratioY;
    if (playerCenter && distance({ x, y }, playerCenter) < minimumDistance) {
      const moveRight = x <= playerCenter.x;
      x = clamp(
        playerCenter.x + (moveRight ? -minimumDistance : minimumDistance),
        36,
        width - 36
      );
    }
    return Object.freeze({
      id: `singularity-well-${executionIndex}-${index}`,
      index,
      x,
      y,
      seedDelayFrames: index * 18,
      seedTravelFrames: 36,
      formingFrames: 30,
      inactiveFrames: 24,
      activeFrames: phaseIndex === 1 ? 102 : phaseIndex === 2 ? 120 : 138,
      collapseWarningFrames: 30,
      implosionFrames: 24,
      projectileCount: phaseIndex === 1 ? 5 : phaseIndex === 2 ? 6 : 7,
      radiusPixels
    });
  });
  return Object.freeze(plans);
};

export const sampleSingularityWellLifecycle = (
  plan: SingularityWellPlan,
  elapsedFrames: number
): SingularityWellLifecycleSample => {
  const frame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0))) - plan.seedDelayFrames;
  const formingStart = plan.seedTravelFrames;
  const matureStart = formingStart + plan.formingFrames;
  const activeStart = matureStart + plan.inactiveFrames;
  const warningStart = activeStart + plan.activeFrames;
  const implosionStart = warningStart + plan.collapseWarningFrames;
  const end = implosionStart + plan.implosionFrames;
  const stage: SingularityWellStage = frame < formingStart
    ? 'seed-travel'
    : frame < matureStart
      ? 'forming'
      : frame < activeStart
        ? 'mature-inactive'
        : frame < warningStart
          ? 'active'
          : frame < implosionStart
            ? 'collapse-warning'
            : frame < end
              ? 'imploding'
              : 'expired';
  const [start, duration] = stage === 'seed-travel'
    ? [0, plan.seedTravelFrames]
    : stage === 'forming'
      ? [formingStart, plan.formingFrames]
      : stage === 'mature-inactive'
        ? [matureStart, plan.inactiveFrames]
        : stage === 'active'
          ? [activeStart, plan.activeFrames]
          : stage === 'collapse-warning'
            ? [warningStart, plan.collapseWarningFrames]
            : stage === 'imploding'
              ? [implosionStart, plan.implosionFrames]
              : [end, 1];
  const visible = frame >= 0 && stage !== 'expired';
  const damageActive = visible && (stage === 'active' || stage === 'imploding');
  return Object.freeze({
    stage,
    progress: stage === 'expired' ? 1 : clamp01((frame - start) / Math.max(1, duration)),
    visible,
    collisionActive: damageActive,
    damageActive,
    emitsProjectiles: stage === 'active',
    shouldCleanup: stage === 'expired'
  });
};

export const resolveSingularityBeamPlan = ({
  phaseIndex,
  seedKey,
  executionIndex = 0,
  arenaWidth
}: {
  phaseIndex: SingularityPhaseIndex;
  seedKey: string;
  executionIndex?: number;
  arenaWidth: number;
}): SingularityBeamPlan => {
  const branch = resolveSingularitySeedBranch({
    seedKey,
    executionIndex,
    salt: 'event-horizon-gaze',
    branchCount: phaseIndex === 1 ? 1 : phaseIndex === 2 ? 2 : 3
  });
  const variant: SingularityBeamVariant = phaseIndex === 1
    ? 'fixed-lance'
    : phaseIndex === 2
      ? (branch === 0 ? 'fixed-lance' : 'slow-sweep')
      : (branch === 2 ? 'split-lane' : branch === 1 ? 'slow-sweep' : 'fixed-lance');
  const warningFrames = SINGULARITY_PHASES[phaseIndex - 1].warningFrames;
  const beamCount = variant === 'split-lane' ? 2 : 1;
  return Object.freeze({
    variant,
    beamCount,
    warningFrames,
    lockFrame: Math.max(0, warningFrames - SINGULARITY_RUNTIME_LIMITS.minimumBeamLockFrames),
    fireFrames: variant === 'slow-sweep' ? 84 : 66,
    recoveryFrames: SINGULARITY_PHASES[phaseIndex - 1].recoveryFrames,
    sweepRadians: variant === 'slow-sweep' ? 0.34 : 0,
    splitHalfAngleRadians: variant === 'split-lane'
      ? clamp(92 / Math.max(180, arenaWidth), 0.18, 0.34)
      : 0,
    safeLanePixels: Math.max(
      SINGULARITY_RUNTIME_LIMITS.minimumBeamSafeLanePixels,
      Math.min(104, Math.max(180, arenaWidth) * 0.24)
    )
  });
};

export const sampleSingularityBeam = ({
  plan,
  elapsedFrames,
  trackedAngleRadians,
  lockedAngleRadians
}: {
  plan: SingularityBeamPlan;
  elapsedFrames: number;
  trackedAngleRadians: number;
  lockedAngleRadians: number;
}): SingularityBeamSample => {
  const frame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const fireStart = plan.warningFrames;
  const recoveryStart = fireStart + plan.fireFrames;
  const end = recoveryStart + plan.recoveryFrames;
  const stage = frame < plan.lockFrame
    ? 'tracking'
    : frame < fireStart
      ? 'locked'
      : frame < recoveryStart
        ? 'firing'
        : frame < end
          ? 'recovery'
          : 'complete';
  const fireProgress = clamp01((frame - fireStart) / Math.max(1, plan.fireFrames));
  const baseAngle = stage === 'tracking'
    ? finiteOr(trackedAngleRadians, Math.PI / 2)
    : finiteOr(lockedAngleRadians, Math.PI / 2);
  const aimAngleRadians = plan.variant === 'slow-sweep' && stage === 'firing'
    ? baseAngle + lerp(-plan.sweepRadians, plan.sweepRadians, smoothstep(fireProgress))
    : baseAngle;
  const beamAnglesRadians = plan.beamCount === 2
    ? Object.freeze([
        aimAngleRadians - plan.splitHalfAngleRadians,
        aimAngleRadians + plan.splitHalfAngleRadians
      ])
    : Object.freeze([aimAngleRadians]);
  const [stageStart, duration] = stage === 'tracking'
    ? [0, plan.lockFrame]
    : stage === 'locked'
      ? [plan.lockFrame, fireStart - plan.lockFrame]
      : stage === 'firing'
        ? [fireStart, plan.fireFrames]
        : stage === 'recovery'
          ? [recoveryStart, plan.recoveryFrames]
          : [end, 1];
  return Object.freeze({
    stage,
    progress: stage === 'complete' ? 1 : clamp01((frame - stageStart) / Math.max(1, duration)),
    aimAngleRadians,
    beamAnglesRadians,
    damageActive: stage === 'firing',
    visibleWarning: stage === 'tracking' || stage === 'locked',
    shouldCleanup: stage === 'complete'
  });
};

export const resolveSingularityPincerPlan = ({
  phaseIndex,
  seedKey,
  executionIndex = 0,
  arenaWidth
}: {
  phaseIndex: SingularityPhaseIndex;
  seedKey: string;
  executionIndex?: number;
  arenaWidth: number;
}): SingularityPincerPlan => {
  const variants = phaseIndex === 2
    ? (['center-opening', 'sequential'] as const)
    : (['center-opening', 'sequential', 'seeded-feint'] as const);
  const branch = resolveSingularitySeedBranch({
    seedKey,
    executionIndex,
    salt: 'tidal-pincer',
    branchCount: variants.length
  });
  return Object.freeze({
    variant: variants[branch],
    firstSide: resolveSingularitySeedBranch({
      seedKey,
      executionIndex,
      salt: 'tidal-pincer-side',
      branchCount: 2
    }) === 0 ? 'port' : 'starboard',
    centerRoutePixels: Math.max(
      SINGULARITY_RUNTIME_LIMITS.minimumPincerRoutePixels,
      Math.min(116, Math.max(180, arenaWidth) * 0.27)
    ),
    warningFrames: SINGULARITY_PHASES[phaseIndex - 1].warningFrames,
    activeFrames: phaseIndex === 3 ? 84 : 96,
    recoveryFrames: SINGULARITY_PHASES[phaseIndex - 1].recoveryFrames
  });
};

export const sampleSingularityPincer = (
  plan: SingularityPincerPlan,
  elapsedFrames: number
): SingularityPincerSample => {
  const braceFrames = 24;
  const frame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const warningStart = braceFrames;
  const sweepStart = warningStart + plan.warningFrames;
  const holdStart = sweepStart + plan.activeFrames;
  const returnStart = holdStart + 18;
  const end = returnStart + plan.recoveryFrames;
  const stage = frame < warningStart
    ? 'brace'
    : frame < sweepStart
      ? 'warning'
      : frame < holdStart
        ? 'sweep'
        : frame < returnStart
          ? 'hold'
          : frame < end
            ? 'return'
            : 'complete';
  const sweepProgress = clamp01((frame - sweepStart) / Math.max(1, plan.activeFrames));
  const returnProgress = smoothstep((frame - returnStart) / Math.max(1, plan.recoveryFrames));
  const warningEnergy = stage === 'warning'
    ? smoothstep((frame - warningStart) / Math.max(1, plan.warningFrames))
    : stage === 'brace' ? smoothstep(frame / braceFrames) * 0.45 : 1;
  const activeEnergy = stage === 'sweep' || stage === 'hold'
    ? Math.sin(clamp01(sweepProgress) * Math.PI * 0.5)
    : stage === 'return' ? 1 - returnProgress : 0;
  const stagger = plan.variant === 'sequential' || plan.variant === 'seeded-feint' ? 0.22 : 0;
  const portProgress = clamp01((sweepProgress - (plan.firstSide === 'port' ? 0 : stagger)) / (1 - stagger));
  const starboardProgress = clamp01((sweepProgress - (plan.firstSide === 'starboard' ? 0 : stagger)) / (1 - stagger));
  const feintScale = plan.variant === 'seeded-feint' && sweepProgress < 0.34 ? 0.55 : 1;
  return Object.freeze({
    stage,
    portEnergy: stage === 'warning' || stage === 'brace'
      ? warningEnergy
      : Math.max(activeEnergy, smoothstep(portProgress)) * feintScale,
    starboardEnergy: stage === 'warning' || stage === 'brace'
      ? warningEnergy
      : Math.max(activeEnergy, smoothstep(starboardProgress)) * feintScale,
    closeEnergy: stage === 'sweep' || stage === 'hold'
      ? smoothstep(sweepProgress) * feintScale
      : stage === 'return' ? 1 - returnProgress : 0,
    damageActive: stage === 'sweep' || stage === 'hold',
    shouldCleanup: stage === 'complete'
  });
};

export const buildSingularityPylonShotPlan = ({
  phaseIndex,
  seedKey,
  executionIndex = 0
}: {
  phaseIndex: SingularityPhaseIndex;
  seedKey: string;
  executionIndex?: number;
}): readonly SingularityPylonShot[] => {
  const rotation = resolveSingularitySeedBranch({
    seedKey,
    executionIndex,
    salt: 'pylon-order',
    branchCount: 4
  });
  const reverse = resolveSingularitySeedBranch({
    seedKey,
    executionIndex,
    salt: 'pylon-direction',
    branchCount: 2
  }) === 1;
  const ordered = SINGULARITY_PYLON_SOCKET_IDS.map((_, index) => (
    SINGULARITY_PYLON_SOCKET_IDS[positiveModulo(
      rotation + (reverse ? -index : index),
      SINGULARITY_PYLON_SOCKET_IDS.length
    )]
  ));
  const rounds = phaseIndex === 1 ? 2 : phaseIndex === 2 ? 3 : 4;
  const interval = phaseIndex === 3 ? 7 : 9;
  return Object.freeze(Array.from({ length: rounds * ordered.length }, (_, shotIndex) => {
    const roundIndex = Math.floor(shotIndex / ordered.length);
    const socketIndex = shotIndex % ordered.length;
    return Object.freeze({
      shotIndex,
      socketId: ordered[socketIndex],
      fireFrame: 12 + shotIndex * interval,
      aimed: roundIndex % 2 === 1 || phaseIndex === 3,
      angleOffsetRadians: (socketIndex - 1.5) * (phaseIndex === 1 ? 0.08 : 0.11)
    });
  }));
};

export const resolveSingularityPulsePlan = ({
  phaseIndex,
  seedKey,
  executionIndex = 0,
  arenaWidth
}: {
  phaseIndex: SingularityPhaseIndex;
  seedKey: string;
  executionIndex?: number;
  arenaWidth: number;
}): SingularityPulsePlan => {
  const branch = resolveSingularitySeedBranch({
    seedKey,
    executionIndex,
    salt: 'pulse-gap',
    branchCount: 12
  });
  const primary = branch * (Math.PI * 2 / 12) + (phaseIndex - 2) * 0.07;
  const minimumGapPixels = Math.max(
    SINGULARITY_RUNTIME_LIMITS.minimumPulseGapPixels,
    Math.min(88, Math.max(180, arenaWidth) * 0.18)
  );
  const referenceRadius = Math.max(120, Math.max(180, arenaWidth) * 0.42);
  const burstCount = SINGULARITY_PULSE_BURSTS_BY_PHASE[phaseIndex];
  const direction = branch % 2 === 0 ? 1 : -1;
  const driftPerBurst = phaseIndex === 1 ? 0.04 : phaseIndex === 2 ? 0.075 : 0.07;
  const zigzagAmplitude = 0.05;
  const gapAnglesByBurst = Array.from({ length: burstCount }, (_, burstIndex) => {
    if (burstIndex === 0) {
      return Object.freeze([primary, primary + Math.PI] as const);
    }
    const zigzag = burstIndex % 2 === 1 ? zigzagAmplitude : -zigzagAmplitude;
    const angle = primary + direction * (burstIndex * driftPerBurst + zigzag);
    return Object.freeze([angle, angle + Math.PI] as const);
  });
  return Object.freeze({
    burstCount,
    burstIntervalFrames: SINGULARITY_PULSE_BURST_INTERVAL_FRAMES,
    projectileCountPerBurst: 14,
    gapAnglesByBurst: Object.freeze(gapAnglesByBurst),
    gapHalfWidthRadians: clamp(minimumGapPixels / referenceRadius / 2, 0.24, 0.42),
    minimumGapPixels,
    expansionFrames: getSingularityPulseFireFrames(phaseIndex),
    pullStrength: phaseIndex === 3 ? 0.11 : 0.075
  });
};

export const buildSingularityCollapsePlan = ({
  seedKey,
  executionIndex = 0,
  arenaWidth,
  arenaHeight,
  playerCenter,
  bossBounds
}: {
  seedKey: string;
  executionIndex?: number;
  arenaWidth: number;
  arenaHeight: number;
  playerCenter?: SingularityPoint;
  bossBounds?: SingularityBounds;
}): SingularityCollapsePlan => {
  const wells = buildSingularityGravityWellPlan({
    seedKey,
    phaseIndex: 3,
    executionIndex,
    arenaWidth,
    arenaHeight,
    playerCenter,
    bossBounds
  }).map((well) => Object.freeze({
    ...well,
    activeFrames: 54,
    collapseWarningFrames: 36,
    implosionFrames: 26
  }));
  const firstActivationFrame = 78;
  const beatSpacing = 78;
  const beats = wells.map((_, index) => Object.freeze({
    wellIndex: index,
    activationFrame: firstActivationFrame + index * beatSpacing,
    implosionFrame: firstActivationFrame + index * beatSpacing + 42,
    endFrame: firstActivationFrame + index * beatSpacing + 68
  }));
  const recoveryFrames = 96;
  const totalFrames = beats[beats.length - 1].endFrame + recoveryFrames;
  return Object.freeze({
    wells: Object.freeze(wells),
    beats: Object.freeze(beats),
    recoveryFrames,
    totalFrames
  });
};

export const getSingularityCollapseDamagingWellIndex = (
  plan: SingularityCollapsePlan,
  elapsedFrames: number
): number | null => {
  const frame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const beat = plan.beats.find((candidate) => (
    frame >= candidate.implosionFrame && frame < candidate.endFrame
  ));
  return beat?.wellIndex ?? null;
};

export const sampleSingularityDefeat = (
  elapsedFrames: number
): SingularityDefeatSample => {
  const frame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const pylonEnd = 42;
  const clawEnd = 84;
  const compressionEnd = 138;
  const collapseEnd = 186;
  const stage: SingularityDefeatStage = frame < pylonEnd
    ? 'pylons-failing'
    : frame < clawEnd
      ? 'claws-limp'
      : frame < compressionEnd
        ? 'core-compression'
        : frame < collapseEnd
          ? 'final-collapse'
          : 'complete';
  const [start, duration] = stage === 'pylons-failing'
    ? [0, pylonEnd]
    : stage === 'claws-limp'
      ? [pylonEnd, clawEnd - pylonEnd]
      : stage === 'core-compression'
        ? [clawEnd, compressionEnd - clawEnd]
        : stage === 'final-collapse'
          ? [compressionEnd, collapseEnd - compressionEnd]
          : [collapseEnd, 1];
  return Object.freeze({
    stage,
    progress: stage === 'complete' ? 1 : clamp01((frame - start) / duration),
    rewardReady: stage === 'complete',
    collisionActive: false,
    attacksActive: false
  });
};
