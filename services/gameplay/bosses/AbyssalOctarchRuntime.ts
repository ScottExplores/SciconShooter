import type {
  BossTimelineConfig,
  BossTimelineMotionCue
} from '../../../game-config/types';
import {
  getBossTimelineAttackWindow,
  getBossTimelineDurationFrames,
  resolveBossTimelineAttackVariant
} from './BossTimelineRuntime';

export const ABYSSAL_OCTARCH_EVENT_ID = 'sandbox-abyssal-octarch' as const;

export const ABYSSAL_OCTARCH_TENTACLE_IDS = Object.freeze([
  'tentacle-upper-port',
  'tentacle-mid-port',
  'tentacle-lower-port',
  'tentacle-ventral-port',
  'tentacle-upper-starboard',
  'tentacle-mid-starboard',
  'tentacle-lower-starboard',
  'tentacle-ventral-starboard'
] as const);

export type AbyssalOctarchTentacleId = (
  typeof ABYSSAL_OCTARCH_TENTACLE_IDS
)[number];

export const ABYSSAL_OCTARCH_ACTION_IDS = Object.freeze([
  'grasp-and-hurl',
  'tentacle-slam',
  'sweeping-arm',
  'needle-tip-stab',
  'constricting-ring',
  'suction-current',
  'asteroid-hurl',
  'abyssal-gaze'
] as const);

export type AbyssalOctarchActionId = (
  typeof ABYSSAL_OCTARCH_ACTION_IDS
)[number];

export const ABYSSAL_OCTARCH_MOTION_CUES = Object.freeze({
  'grasp-and-hurl': 'octarch-grasp-hurl',
  'tentacle-slam': 'octarch-tentacle-slam',
  'sweeping-arm': 'octarch-sweeping-arm',
  'needle-tip-stab': 'octarch-needle-stab',
  'constricting-ring': 'octarch-constricting-ring',
  'suction-current': 'octarch-suction-current',
  'asteroid-hurl': 'octarch-asteroid-hurl',
  'abyssal-gaze': 'octarch-abyssal-gaze'
} as const satisfies Readonly<Record<AbyssalOctarchActionId, BossTimelineMotionCue>>);

export type AbyssalOctarchMotionCue = (
  typeof ABYSSAL_OCTARCH_MOTION_CUES
)[AbyssalOctarchActionId];

export const ABYSSAL_OCTARCH_PHASES = Object.freeze([
  Object.freeze({
    id: 'octarch-first-contact',
    label: 'First Contact',
    index: 1 as const,
    minimumTentacles: 6,
    transitionFrames: 54,
    reactionFrames: 42
  }),
  Object.freeze({
    id: 'octarch-hunts',
    label: 'The Octarch Hunts',
    index: 2 as const,
    minimumTentacles: 3,
    transitionFrames: 39,
    reactionFrames: 54
  }),
  Object.freeze({
    id: 'octarch-severed-fury',
    label: 'Severed Fury',
    index: 3 as const,
    minimumTentacles: 1,
    transitionFrames: 27,
    reactionFrames: 60
  }),
  Object.freeze({
    id: 'octarch-final-core',
    label: 'Final Core',
    index: 4 as const,
    minimumTentacles: 0,
    transitionFrames: 18,
    reactionFrames: 72
  })
] as const);

export type AbyssalOctarchPhase = (typeof ABYSSAL_OCTARCH_PHASES)[number];
export type AbyssalOctarchPhaseId = AbyssalOctarchPhase['id'];

export const ABYSSAL_OCTARCH_PHASE_ACTIONS: Readonly<Record<
  AbyssalOctarchPhaseId,
  readonly AbyssalOctarchActionId[]
>> = Object.freeze({
  'octarch-first-contact': Object.freeze([
    'grasp-and-hurl',
    'tentacle-slam',
    'sweeping-arm',
    'needle-tip-stab'
  ] as const),
  'octarch-hunts': Object.freeze([
    'grasp-and-hurl',
    'tentacle-slam',
    'sweeping-arm',
    'needle-tip-stab',
    'constricting-ring',
    'suction-current',
    'asteroid-hurl'
  ] as const),
  'octarch-severed-fury': ABYSSAL_OCTARCH_ACTION_IDS,
  'octarch-final-core': Object.freeze([
    'constricting-ring',
    'suction-current',
    'abyssal-gaze'
  ] as const)
});

export const isAbyssalOctarchActionAvailable = (
  phaseId: AbyssalOctarchPhaseId,
  actionId: AbyssalOctarchActionId
) => ABYSSAL_OCTARCH_PHASE_ACTIONS[phaseId].includes(actionId);

export interface AbyssalOctarchQueuedAttackTransition {
  readonly phaseId: AbyssalOctarchPhaseId;
  readonly attackId: AbyssalOctarchActionId;
  readonly attackLabel: string;
  readonly attackRole: 'core' | 'signature';
  readonly sourceClipId: string;
  readonly primitiveId: BossTimelineConfig['clips'][number]['primitiveId'];
  readonly motionCue: BossTimelineMotionCue | undefined;
  readonly transitionStartFrame: number;
  readonly nextAttackStartFrame: number;
  readonly transitionFrames: number;
}

/**
 * Compresses only authored empty slots between the attacks available in one
 * structural phase. Attack windows already include their warning, active, and
 * recovery frames, so none of those authored timings can be shortened here.
 */
export const resolveAbyssalOctarchQueuedAttackTransition = ({
  timeline,
  phaseId,
  attackFrame,
  framesPerSecond = 60,
  selectedAttackLoopActive = false
}: {
  timeline: BossTimelineConfig;
  phaseId: AbyssalOctarchPhaseId;
  attackFrame: number;
  framesPerSecond?: number;
  selectedAttackLoopActive?: boolean;
}): AbyssalOctarchQueuedAttackTransition | null => {
  if (selectedAttackLoopActive) return null;
  const phase = ABYSSAL_OCTARCH_PHASES.find((candidate) => (
    candidate.id === phaseId
  ));
  if (!phase) return null;
  const durationFrames = Math.max(
    1,
    getBossTimelineDurationFrames(timeline, framesPerSecond)
  );
  const safeFrame = Math.max(0, Math.floor(Number(attackFrame) || 0));
  const cycleIndex = Math.floor(safeFrame / durationFrames);
  const timelineFrame = safeFrame % durationFrames;
  const availableActionIds = ABYSSAL_OCTARCH_PHASE_ACTIONS[phaseId];
  const windows = (timeline.attacks ?? []).flatMap((attack) => {
    const actionId = availableActionIds.find((candidate) => candidate === attack.id);
    if (!actionId) return [];
    const resolved = resolveBossTimelineAttackVariant(
      timeline,
      actionId,
      phaseId
    );
    const window = getBossTimelineAttackWindow(
      timeline,
      actionId,
      phaseId,
      framesPerSecond
    );
    if (!resolved || !window) return [];
    const sourceClip = resolved.variant.beatClipIds
      .map((clipId) => timeline.clips.find((clip) => clip.id === clipId))
      .find((clip) => clip !== undefined);
    if (!sourceClip) return [];
    return [{ actionId, attack, window, sourceClip }];
  }).sort((left, right) => left.window.startFrame - right.window.startFrame);
  if (windows.length === 0) return null;
  if (windows.some(({ window }) => (
    timelineFrame >= window.startFrame && timelineFrame < window.endFrame
  ))) return null;

  let previous = [...windows].reverse().find(({ window }) => (
    window.endFrame <= timelineFrame
  ));
  let previousCycleIndex = cycleIndex;
  let next = windows.find(({ window }) => window.startFrame > timelineFrame);
  let nextCycleIndex = cycleIndex;
  if (!previous) {
    // The first authored attack begins almost immediately, preserving the
    // short phase-entry read without skipping its warning.
    if (cycleIndex === 0) return null;
    previous = windows[windows.length - 1];
    previousCycleIndex -= 1;
  }
  if (!next) {
    next = windows[0];
    nextCycleIndex += 1;
  }
  if (!previous || !next) return null;

  const previousEndFrame = previousCycleIndex * durationFrames
    + previous.window.endFrame;
  const nextAttackStartFrame = nextCycleIndex * durationFrames
    + next.window.startFrame;
  if (safeFrame < previousEndFrame || safeFrame >= nextAttackStartFrame) {
    return null;
  }
  const transitionStartFrame = Math.max(
    previousEndFrame,
    nextAttackStartFrame - phase.transitionFrames
  );
  return Object.freeze({
    phaseId,
    attackId: next.actionId,
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

export interface AbyssalOctarchTentacleDescriptor {
  readonly id: AbyssalOctarchTentacleId;
  readonly label: string;
  readonly side: 'port' | 'starboard';
  readonly role: 'sweep' | 'grasp' | 'slam' | 'stab';
  readonly partId: string;
  readonly socketId: string;
  readonly centerXRatio: number;
  readonly centerYRatio: number;
  readonly widthRatio: number;
  readonly heightRatio: number;
  readonly baseHealth: number;
}

const portDescriptors = [
  ['tentacle-upper-port', 'UPPER PORT ARM', 'sweep', 0, 0.2, 0.33, 0.34, 0.24],
  ['tentacle-mid-port', 'MID PORT ARM', 'slam', 1, 0.16, 0.49, 0.36, 0.25],
  ['tentacle-lower-port', 'LOWER PORT ARM', 'stab', 2, 0.18, 0.66, 0.35, 0.28],
  ['tentacle-ventral-port', 'VENTRAL PORT ARM', 'grasp', 3, 0.28, 0.82, 0.3, 0.3]
] as const;

export const ABYSSAL_OCTARCH_TENTACLES: readonly AbyssalOctarchTentacleDescriptor[] =
  Object.freeze([
    ...portDescriptors.map((entry, index) => Object.freeze({
      id: entry[0],
      label: entry[1],
      side: 'port' as const,
      role: entry[2],
      partId: `tentacle.${entry[3]}.port`,
      socketId: `tentacle-${entry[3]}-port-tip`,
      centerXRatio: entry[4],
      centerYRatio: entry[5],
      widthRatio: entry[6],
      heightRatio: entry[7],
      baseHealth: 360
    })),
    ...portDescriptors.map((entry, index) => Object.freeze({
      id: entry[0].replace('-port', '-starboard') as AbyssalOctarchTentacleId,
      label: entry[1].replace('PORT', 'STARBOARD'),
      side: 'starboard' as const,
      role: entry[2],
      partId: `tentacle.${entry[3]}.starboard`,
      socketId: `tentacle-${entry[3]}-starboard-tip`,
      centerXRatio: 1 - entry[4],
      centerYRatio: entry[5],
      widthRatio: entry[6],
      heightRatio: entry[7],
      baseHealth: 360
    }))
  ]);

export const ABYSSAL_OCTARCH_CAMERA_PROFILE = Object.freeze({
  expandedScale: 0.72,
  zoomDelayFrames: 54,
  zoomDurationFrames: 132,
  restoreDurationFrames: 90,
  normalScale: 1,
  boundaryPadding: 18
});

export const ABYSSAL_OCTARCH_LIMITS = Object.freeze({
  maximumActiveTentacles: 2,
  maximumOwnedHazards: 42,
  minimumRoutePixels: 72,
  grabTelegraphFrames: 54,
  grabStrikeFrames: 26,
  grabHoldFrames: 30,
  grabThrowFrames: 38,
  minimumThrowArcPixels: 64,
  maximumThrowArcHeightRatio: 0.2,
  releaseImmunityFrames: 48,
  maximumPullPerFrame: 2.2,
  maximumThrowSpeed: 11.5,
  geometryUncertaintyPixels: 3
});

export interface AbyssalOctarchCameraSample {
  readonly scale: number;
  readonly progress: number;
  readonly expanded: boolean;
}

export interface AbyssalOctarchPoint {
  readonly x: number;
  readonly y: number;
}

export interface AbyssalOctarchActionPlan {
  readonly actionId: AbyssalOctarchActionId;
  readonly sequence: number;
  readonly phaseIndex: 1 | 2 | 3 | 4;
  readonly tentacleIds: readonly AbyssalOctarchTentacleId[];
  readonly target: AbyssalOctarchPoint;
  readonly secondaryTarget: AbyssalOctarchPoint;
  readonly safeGapAngleRadians: number;
  readonly safeGapWidthRadians: number;
  readonly throwLanding: AbyssalOctarchPoint;
}

export type AbyssalOctarchActionStage =
  | 'preparation'
  | 'telegraph'
  | 'active'
  | 'held'
  | 'throwing'
  | 'recovery'
  | 'complete';

export interface AbyssalOctarchActionSample {
  readonly stage: AbyssalOctarchActionStage;
  readonly progress: number;
  readonly damageActive: boolean;
  readonly captureActive: boolean;
  readonly complete: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const clamp01 = (value: number) => clamp(Number(value) || 0, 0, 1);

const smoothstep = (value: number) => {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
};

const easeInOutCubic = (value: number) => {
  const progress = clamp01(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

export const ABYSSAL_OCTARCH_DIRECT_TENTACLE_ACTION_IDS: readonly AbyssalOctarchActionId[] = Object.freeze([
  'grasp-and-hurl',
  'tentacle-slam',
  'sweeping-arm',
  'needle-tip-stab',
  'asteroid-hurl'
]);

export interface AbyssalOctarchAttackTipSample {
  readonly start: AbyssalOctarchPoint;
  readonly target: AbyssalOctarchPoint;
  readonly tip: AbyssalOctarchPoint;
  readonly activeProgress: number;
  readonly reachProgress: number;
}

/**
 * Coordinate-system-independent source of truth for an attacking tentacle.
 * Callers provide the live root point and locked final target in the same
 * coordinate system. Sweeping Arm's sequence-owned moving target is resolved
 * here so gameplay collision and modular presentation can sample one tip.
 */
export const sampleAbyssalOctarchAttackTip = ({
  actionId,
  start,
  finalTarget,
  sequence,
  activeProgress,
  arenaWidth,
  bossWidth
}: {
  actionId: AbyssalOctarchActionId;
  start: AbyssalOctarchPoint;
  finalTarget: AbyssalOctarchPoint;
  sequence: number;
  activeProgress: number;
  arenaWidth: number;
  bossWidth: number;
}): AbyssalOctarchAttackTipSample => {
  const progress = clamp01(activeProgress);
  const safeArenaWidth = Math.max(1, Number(arenaWidth) || 1);
  const safeBossWidth = Math.max(1, Number(bossWidth) || 1);
  const fromLeft = (Math.max(0, Math.floor(Number(sequence) || 0)) & 1) === 0;
  const targetX = actionId === 'sweeping-arm'
    ? fromLeft
      ? -safeBossWidth * 0.15
        + (safeArenaWidth + safeBossWidth * 0.3) * progress
      : safeArenaWidth + safeBossWidth * 0.15
        - (safeArenaWidth + safeBossWidth * 0.3) * progress
    : Number(finalTarget.x) || 0;
  const targetY = Number(finalTarget.y) || 0;
  const reachProgress = actionId === 'tentacle-slam'
    ? Math.sin(progress * Math.PI)
    : actionId === 'needle-tip-stab'
      ? Math.min(1, progress * 2.5)
      : progress;
  const easedReach = easeInOutCubic(reachProgress);
  const startX = Number(start.x) || 0;
  const startY = Number(start.y) || 0;
  return Object.freeze({
    start: Object.freeze({ x: startX, y: startY }),
    target: Object.freeze({ x: targetX, y: targetY }),
    tip: Object.freeze({
      x: startX + (targetX - startX) * easedReach,
      y: startY + (targetY - startY) * easedReach
    }),
    activeProgress: progress,
    reachProgress
  });
};

export interface AbyssalOctarchThrowPathSample {
  readonly x: number;
  readonly y: number;
  readonly controlX: number;
  readonly controlY: number;
  readonly progress: number;
}

/**
 * Samples a visible quadratic Bezier throw while keeping the complete player
 * body inside the expanded world. The clamped endpoints and control point make
 * every intermediate sample bounded by the curve's convex hull.
 */
export const sampleAbyssalOctarchThrowPath = ({
  from,
  landing,
  progress,
  arenaWidth,
  arenaHeight,
  playerWidth = 0,
  playerHeight = 0,
  padding = ABYSSAL_OCTARCH_CAMERA_PROFILE.boundaryPadding
}: {
  from: AbyssalOctarchPoint;
  landing: AbyssalOctarchPoint;
  progress: number;
  arenaWidth: number;
  arenaHeight: number;
  playerWidth?: number;
  playerHeight?: number;
  padding?: number;
}): AbyssalOctarchThrowPathSample => {
  const safeWidth = Math.max(1, Number(arenaWidth) || 1);
  const safeHeight = Math.max(1, Number(arenaHeight) || 1);
  const halfWidth = Math.max(0, Number(playerWidth) || 0) / 2;
  const halfHeight = Math.max(0, Number(playerHeight) || 0) / 2;
  const safePadding = Math.max(0, Number(padding) || 0);
  const minimumX = Math.min(safeWidth / 2, safePadding + halfWidth);
  const maximumX = Math.max(minimumX, safeWidth - safePadding - halfWidth);
  const minimumY = Math.min(safeHeight / 2, safePadding + halfHeight);
  const maximumY = Math.max(minimumY, safeHeight - safePadding - halfHeight);
  const fromX = clamp(Number(from.x) || 0, minimumX, maximumX);
  const fromY = clamp(Number(from.y) || 0, minimumY, maximumY);
  const landingX = clamp(Number(landing.x) || 0, minimumX, maximumX);
  const landingY = clamp(Number(landing.y) || 0, minimumY, maximumY);
  const distance = Math.hypot(landingX - fromX, landingY - fromY);
  const desiredArcHeight = clamp(
    distance * 0.32,
    ABYSSAL_OCTARCH_LIMITS.minimumThrowArcPixels,
    safeHeight * ABYSSAL_OCTARCH_LIMITS.maximumThrowArcHeightRatio
  );
  const lateralDirection = landingX >= fromX ? -1 : 1;
  const lateralArc = Math.min(safeWidth * 0.1, distance * 0.16);
  const controlX = clamp(
    (fromX + landingX) / 2 + lateralDirection * lateralArc,
    minimumX,
    maximumX
  );
  const controlY = clamp(
    Math.min(fromY, landingY) - desiredArcHeight,
    minimumY,
    maximumY
  );
  const normalizedProgress = smoothstep(progress);
  const inverse = 1 - normalizedProgress;
  return Object.freeze({
    x: inverse * inverse * fromX
      + 2 * inverse * normalizedProgress * controlX
      + normalizedProgress * normalizedProgress * landingX,
    y: inverse * inverse * fromY
      + 2 * inverse * normalizedProgress * controlY
      + normalizedProgress * normalizedProgress * landingY,
    controlX,
    controlY,
    progress: normalizedProgress
  });
};

export type AbyssalOctarchPhaseReactionStage =
  | 'recoil'
  | 'rage'
  | 'core-exposure'
  | 'complete';

export interface AbyssalOctarchPhaseReactionSample {
  readonly phaseId: AbyssalOctarchPhaseId;
  readonly stage: AbyssalOctarchPhaseReactionStage;
  readonly progress: number;
  readonly stageProgress: number;
  readonly reactionFrames: number;
  readonly coreExposed: boolean;
  readonly complete: boolean;
}

export const sampleAbyssalOctarchPhaseReaction = ({
  phaseId,
  elapsedFrames
}: {
  phaseId: AbyssalOctarchPhaseId;
  elapsedFrames: number;
}): AbyssalOctarchPhaseReactionSample => {
  const phase = ABYSSAL_OCTARCH_PHASES.find((candidate) => candidate.id === phaseId)
    ?? ABYSSAL_OCTARCH_PHASES[0];
  const elapsed = Math.max(0, Math.floor(Number(elapsedFrames) || 0));
  const reactionFrames = Math.max(1, phase.reactionFrames);
  const progress = clamp01(elapsed / reactionFrames);
  const complete = elapsed >= reactionFrames;
  const recoilEnd = 0.28;
  const rageEnd = phase.index === 4 ? 0.62 : 0.72;
  const stage = complete
    ? 'complete'
    : progress < recoilEnd
      ? 'recoil'
      : progress < rageEnd
        ? 'rage'
        : 'core-exposure';
  const stageProgress = stage === 'recoil'
    ? progress / recoilEnd
    : stage === 'rage'
      ? (progress - recoilEnd) / Math.max(0.001, rageEnd - recoilEnd)
      : stage === 'core-exposure'
        ? (progress - rageEnd) / Math.max(0.001, 1 - rageEnd)
        : 1;
  return Object.freeze({
    phaseId: phase.id,
    stage,
    progress,
    stageProgress: clamp01(stageProgress),
    reactionFrames,
    coreExposed: phase.index === 4 && progress >= rageEnd,
    complete
  });
};

const hashSequence = (sequence: number, salt: number) => {
  let value = (Math.floor(Number(sequence) || 0) ^ (salt * 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
};

export const isAbyssalOctarchMotionCue = (
  value: string | null | undefined
): value is AbyssalOctarchMotionCue => (
  typeof value === 'string'
  && (Object.values(ABYSSAL_OCTARCH_MOTION_CUES) as readonly string[]).includes(value)
);

export const getAbyssalOctarchActionId = (
  cue: string | null | undefined
): AbyssalOctarchActionId | null => {
  if (!isAbyssalOctarchMotionCue(cue)) return null;
  return (Object.entries(ABYSSAL_OCTARCH_MOTION_CUES) as readonly (
    readonly [AbyssalOctarchActionId, AbyssalOctarchMotionCue]
  )[]).find(([, motionCue]) => motionCue === cue)?.[0] ?? null;
};

export const resolveAbyssalOctarchPhase = (
  survivingTentacles: number
): AbyssalOctarchPhase => {
  const count = clamp(Math.floor(Number(survivingTentacles) || 0), 0, 8);
  return ABYSSAL_OCTARCH_PHASES.find((phase) => count >= phase.minimumTentacles)
    ?? ABYSSAL_OCTARCH_PHASES[ABYSSAL_OCTARCH_PHASES.length - 1];
};

export const sampleAbyssalOctarchCamera = (
  encounterFrame: number,
  forcedMode: 'normal' | 'expanded' | null = null
): AbyssalOctarchCameraSample => {
  if (forcedMode === 'normal') return { scale: 1, progress: 0, expanded: false };
  if (forcedMode === 'expanded') {
    return {
      scale: ABYSSAL_OCTARCH_CAMERA_PROFILE.expandedScale,
      progress: 1,
      expanded: true
    };
  }
  const frame = Math.max(0, Math.floor(Number(encounterFrame) || 0));
  const rawProgress = (
    frame - ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDelayFrames
  ) / ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDurationFrames;
  const progress = smoothstep(rawProgress);
  return {
    scale: 1 + (
      ABYSSAL_OCTARCH_CAMERA_PROFILE.expandedScale - 1
    ) * progress,
    progress,
    expanded: progress >= 0.999
  };
};

export const selectAbyssalOctarchTentacles = ({
  actionId,
  activeTentacleIds,
  sequence,
  phaseIndex
}: {
  actionId: AbyssalOctarchActionId;
  activeTentacleIds: readonly AbyssalOctarchTentacleId[];
  sequence: number;
  phaseIndex: 1 | 2 | 3 | 4;
}): readonly AbyssalOctarchTentacleId[] => {
  if (
    activeTentacleIds.length === 0
    || phaseIndex === 4
    || actionId === 'abyssal-gaze'
  ) return [];
  const preferredRole: AbyssalOctarchTentacleDescriptor['role'] | null =
    actionId === 'grasp-and-hurl' ? 'grasp'
      : actionId === 'tentacle-slam' ? 'slam'
        : actionId === 'sweeping-arm' ? 'sweep'
          : actionId === 'needle-tip-stab' ? 'stab'
            : actionId === 'constricting-ring' ? 'grasp'
              : actionId === 'suction-current' ? 'stab'
                : actionId === 'asteroid-hurl' ? 'sweep'
                  : null;
  const activeSet = new Set(activeTentacleIds);
  const activePool = ABYSSAL_OCTARCH_TENTACLES.filter((tentacle) => (
    activeSet.has(tentacle.id)
  ));
  const candidates = activePool.filter((tentacle) => (
    activeSet.has(tentacle.id)
    && (!preferredRole || tentacle.role === preferredRole)
  ));
  const pool = candidates.length > 0
    ? candidates
    : activePool;
  const firstIndex = hashSequence(sequence, 17) % pool.length;
  const first = pool[firstIndex];
  const wantsPair = phaseIndex >= 2
    && (
      actionId === 'constricting-ring'
      || actionId === 'suction-current'
      || (phaseIndex >= 3 && actionId === 'tentacle-slam')
    );
  if (!wantsPair || activePool.length < 2) return [first.id];
  const secondPool = activePool.filter((candidate) => (
    candidate.id !== first.id
    && candidate.side !== first.side
  ));
  const fallback = activePool.filter((candidate) => candidate.id !== first.id);
  const resolvedSecondPool = secondPool.length > 0 ? secondPool : fallback;
  const second = resolvedSecondPool[
    hashSequence(sequence, 29) % resolvedSecondPool.length
  ];
  return [first.id, second.id];
};

export const createAbyssalOctarchActionPlan = ({
  actionId,
  activeTentacleIds,
  sequence,
  phaseIndex,
  arenaWidth,
  arenaHeight,
  playerCenterX,
  playerCenterY
}: {
  actionId: AbyssalOctarchActionId;
  activeTentacleIds: readonly AbyssalOctarchTentacleId[];
  sequence: number;
  phaseIndex: 1 | 2 | 3 | 4;
  arenaWidth: number;
  arenaHeight: number;
  playerCenterX: number;
  playerCenterY: number;
}): AbyssalOctarchActionPlan => {
  const safeWidth = Math.max(320, Number(arenaWidth) || 390);
  const safeHeight = Math.max(640, Number(arenaHeight) || 844);
  const padding = ABYSSAL_OCTARCH_CAMERA_PROFILE.boundaryPadding;
  const lane = hashSequence(sequence, 41) % 5;
  const targetX = clamp(
    actionId === 'needle-tip-stab'
      ? playerCenterX
      : playerCenterX + (lane - 2) * safeWidth * 0.035,
    padding,
    safeWidth - padding
  );
  const targetY = clamp(
    playerCenterY,
    safeHeight * 0.34,
    safeHeight - padding
  );
  const secondaryX = clamp(
    safeWidth - targetX + (hashSequence(sequence, 43) % 3 - 1) * 22,
    padding,
    safeWidth - padding
  );
  const secondaryY = clamp(
    targetY + ((hashSequence(sequence, 47) % 2) * 2 - 1) * safeHeight * 0.12,
    safeHeight * 0.32,
    safeHeight - padding
  );
  const throwToLeft = (hashSequence(sequence, 53) & 1) === 0;
  const landingX = throwToLeft ? safeWidth * 0.22 : safeWidth * 0.78;
  const landingY = clamp(
    safeHeight * (0.64 + (hashSequence(sequence, 59) % 3) * 0.08),
    safeHeight * 0.58,
    safeHeight - padding
  );
  const safeGapAngleRadians = (
    (hashSequence(sequence, 61) % 12) / 12
  ) * Math.PI * 2;
  return Object.freeze({
    actionId,
    sequence: Math.max(0, Math.floor(Number(sequence) || 0)),
    phaseIndex,
    tentacleIds: Object.freeze([...selectAbyssalOctarchTentacles({
      actionId,
      activeTentacleIds,
      sequence,
      phaseIndex
    })]),
    target: Object.freeze({ x: targetX, y: targetY }),
    secondaryTarget: Object.freeze({ x: secondaryX, y: secondaryY }),
    safeGapAngleRadians,
    safeGapWidthRadians: phaseIndex >= 3 ? 0.48 : 0.62,
    throwLanding: Object.freeze({ x: landingX, y: landingY })
  });
};

export const sampleAbyssalOctarchAction = ({
  actionId,
  elapsedFrames,
  warningFrames,
  activeFrames,
  recoveryFrames
}: {
  actionId: AbyssalOctarchActionId;
  elapsedFrames: number;
  warningFrames: number;
  activeFrames: number;
  recoveryFrames: number;
}): AbyssalOctarchActionSample => {
  const elapsed = Math.max(0, Math.floor(Number(elapsedFrames) || 0));
  const preparationFrames = Math.max(10, Math.round(warningFrames * 0.34));
  const telegraphFrames = Math.max(1, warningFrames - preparationFrames);
  const active = Math.max(1, Math.floor(activeFrames));
  const recovery = Math.max(1, Math.floor(recoveryFrames));
  const grab = actionId === 'grasp-and-hurl';
  const holdFrames = grab ? ABYSSAL_OCTARCH_LIMITS.grabHoldFrames : 0;
  const throwFrames = grab ? ABYSSAL_OCTARCH_LIMITS.grabThrowFrames : 0;
  const preparationEnd = preparationFrames;
  const telegraphEnd = preparationEnd + telegraphFrames;
  const activeEnd = telegraphEnd + active;
  const holdEnd = activeEnd + holdFrames;
  const throwEnd = holdEnd + throwFrames;
  const recoveryEnd = throwEnd + recovery;
  if (elapsed < preparationEnd) {
    return {
      stage: 'preparation',
      progress: elapsed / Math.max(1, preparationFrames),
      damageActive: false,
      captureActive: false,
      complete: false
    };
  }
  if (elapsed < telegraphEnd) {
    return {
      stage: 'telegraph',
      progress: (elapsed - preparationEnd) / Math.max(1, telegraphFrames),
      damageActive: false,
      captureActive: false,
      complete: false
    };
  }
  if (elapsed < activeEnd) {
    return {
      stage: 'active',
      progress: (elapsed - telegraphEnd) / Math.max(1, active),
      damageActive: !grab,
      captureActive: grab,
      complete: false
    };
  }
  if (grab && elapsed < holdEnd) {
    return {
      stage: 'held',
      progress: (elapsed - activeEnd) / Math.max(1, holdFrames),
      damageActive: false,
      captureActive: false,
      complete: false
    };
  }
  if (grab && elapsed < throwEnd) {
    return {
      stage: 'throwing',
      progress: (elapsed - holdEnd) / Math.max(1, throwFrames),
      damageActive: false,
      captureActive: false,
      complete: false
    };
  }
  if (elapsed < recoveryEnd) {
    return {
      stage: 'recovery',
      progress: (elapsed - throwEnd) / Math.max(1, recovery),
      damageActive: false,
      captureActive: false,
      complete: false
    };
  }
  return {
    stage: 'complete',
    progress: 1,
    damageActive: false,
    captureActive: false,
    complete: true
  };
};

export const resolveAbyssalOctarchThrowVelocity = ({
  from,
  landing,
  frames = ABYSSAL_OCTARCH_LIMITS.grabThrowFrames
}: {
  from: AbyssalOctarchPoint;
  landing: AbyssalOctarchPoint;
  frames?: number;
}) => {
  const duration = Math.max(1, Math.floor(Number(frames) || 1));
  const maximum = ABYSSAL_OCTARCH_LIMITS.maximumThrowSpeed;
  const vx = clamp((landing.x - from.x) / duration * 1.65, -maximum, maximum);
  const vy = clamp((landing.y - from.y) / duration * 1.65, -maximum, maximum);
  return Object.freeze({ vx, vy });
};

export const clampAbyssalOctarchPoint = (
  point: AbyssalOctarchPoint,
  arenaWidth: number,
  arenaHeight: number,
  padding: number = ABYSSAL_OCTARCH_CAMERA_PROFILE.boundaryPadding
) => Object.freeze({
  x: clamp(point.x, padding, Math.max(padding, arenaWidth - padding)),
  y: clamp(point.y, padding, Math.max(padding, arenaHeight - padding))
});
