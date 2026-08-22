import type {
  BossTimelineClip,
  BossTimelineConfig
} from '../../../game-config/types';
import {
  ABYSSAL_OCTARCH_ACTION_IDS,
  ABYSSAL_OCTARCH_CAMERA_PROFILE,
  ABYSSAL_OCTARCH_EVENT_ID,
  ABYSSAL_OCTARCH_LIMITS,
  ABYSSAL_OCTARCH_PHASES,
  ABYSSAL_OCTARCH_PHASE_ACTIONS,
  ABYSSAL_OCTARCH_TENTACLE_IDS,
  ABYSSAL_OCTARCH_TENTACLES,
  createAbyssalOctarchActionPlan,
  getAbyssalOctarchActionId,
  type AbyssalOctarchActionId,
  type AbyssalOctarchActionPlan,
  type AbyssalOctarchPhaseId,
  type AbyssalOctarchPoint,
  type AbyssalOctarchTentacleId
} from './AbyssalOctarchRuntime';
import {
  getBossTimelineAttackWindow,
  resolveBossTimelineAttackVariant
} from './BossTimelineRuntime';
import {
  resolveBossGapRoute,
  resolveBossGapRouteDirection
} from './BossPatternRuntime';
import {
  CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER,
  MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
  type BossSafeRoutePlayerProfile
} from './BossSafeRouteProof';
import { resolveEncounterWorldSize } from '../EncounterCameraRuntime';

export const ABYSSAL_OCTARCH_SAFE_ROUTE_FPS = 60;
export const ABYSSAL_OCTARCH_SAFE_ROUTE_SEED = 0x0c7a4c11;
export const ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS = 3;
export const ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS = (
  MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS
);
export const ABYSSAL_OCTARCH_REQUIRED_RAW_CLEARANCE_PIXELS = (
  ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS
  + ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
);

export interface AbyssalOctarchProofPresentation {
  readonly id: string;
  readonly hostWidth: number;
  readonly hostHeight: number;
  readonly displayWidth: 390;
  readonly displayHeight: 844;
  readonly stageOffsetX: number;
  readonly stageOffsetY: number;
}

const portraitPresentation = Object.freeze({
  id: 'portrait-390x844',
  hostWidth: 390,
  hostHeight: 844,
  displayWidth: 390,
  displayHeight: 844,
  stageOffsetX: 0,
  stageOffsetY: 0
}) satisfies AbyssalOctarchProofPresentation;

const wideHostPresentation = Object.freeze({
  id: 'wide-host-1440x900-portrait-390x844',
  hostWidth: 1440,
  hostHeight: 900,
  displayWidth: 390,
  displayHeight: 844,
  stageOffsetX: (1440 - 390) / 2,
  stageOffsetY: (900 - 844) / 2
}) satisfies AbyssalOctarchProofPresentation;

/**
 * Both benchmark hosts own the same portrait game surface. The second case
 * proves that a wide browser shell never turns Octarch into wide gameplay.
 */
export const ABYSSAL_OCTARCH_SAFE_ROUTE_PRESENTATIONS = Object.freeze({
  portrait: portraitPresentation,
  wideHost: wideHostPresentation
});

export interface AbyssalOctarchRouteWitnessPoint extends AbyssalOctarchPoint {
  readonly frame: number;
  readonly vx: number;
  readonly vy: number;
  readonly controlX: number;
  readonly controlY: number;
  readonly rawClearancePixels: number;
  readonly clearanceAfterUncertaintyPixels: number;
}

export type AbyssalOctarchSafeRouteFailureReason =
  | 'proven'
  | 'invalid-presentation'
  | 'missing-attack-variant'
  | 'unsupported-action'
  | 'invalid-timeline-geometry'
  | 'search-exhausted'
  | 'insufficient-clearance'
  | 'replay-failed';

export interface AbyssalOctarchSafeRouteProof {
  readonly status: 'proven' | 'unproven';
  readonly reason: AbyssalOctarchSafeRouteFailureReason;
  readonly attackId: string;
  readonly phaseId: string;
  readonly presentationId: string;
  readonly seed: number;
  readonly sequence: number;
  readonly actionClipId?: string;
  readonly checkedFrames: number;
  readonly durationFrames: number;
  readonly geometryUncertaintyPixels: number;
  readonly requiredRawClearancePixels: number;
  readonly requiredClearanceAfterUncertaintyPixels: number;
  readonly minimumRawClearancePixels: number;
  readonly minimumClearanceAfterUncertaintyPixels: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly activeTentacleIds: readonly AbyssalOctarchTentacleId[];
  readonly selectedTentacleIds: readonly AbyssalOctarchTentacleId[];
  readonly configurationHash: string;
  readonly routeHash?: string;
  readonly witness?: readonly AbyssalOctarchRouteWitnessPoint[];
  readonly detail: string;
}

export interface AbyssalOctarchSafeRouteProofRequest {
  readonly timeline: Readonly<BossTimelineConfig>;
  readonly attackId: string;
  readonly phaseId: string;
  readonly presentation?: Readonly<AbyssalOctarchProofPresentation>;
  readonly seed?: number;
  readonly player?: Readonly<BossSafeRoutePlayerProfile>;
  readonly geometryUncertaintyPixels?: number;
  readonly searchBreadth?: number;
}

export interface AbyssalOctarchSafeRouteMatrixEntry {
  readonly attackId: string;
  readonly phaseId: string;
  readonly presentationId: string;
  readonly proof: AbyssalOctarchSafeRouteProof;
}

interface OctarchSchedule {
  readonly attackId: AbyssalOctarchActionId;
  readonly phaseId: AbyssalOctarchPhaseId;
  readonly actionClip: Readonly<BossTimelineClip>;
  readonly warningClip: Readonly<BossTimelineClip>;
  readonly windowStartFrame: number;
  readonly warningStartFrame: number;
  readonly fireStartFrame: number;
  readonly fireEndFrame: number;
  readonly recoveryEndFrame: number;
  readonly requestedProjectileCount: number | undefined;
}

interface OctarchBossPose {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface CircleHazard {
  readonly id: string;
  readonly kind: 'circle';
  readonly center: AbyssalOctarchPoint;
  readonly radius: number;
}

interface CapsuleHazard {
  readonly id: string;
  readonly kind: 'capsule';
  readonly start: AbyssalOctarchPoint;
  readonly end: AbyssalOctarchPoint;
  readonly radius: number;
}

type OctarchHazard = CircleHazard | CapsuleHazard;

interface ProofContext {
  readonly schedule: OctarchSchedule;
  readonly plan: AbyssalOctarchActionPlan;
  readonly phaseIndex: 1 | 2 | 3 | 4;
  readonly sequence: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly bossPoses: readonly OctarchBossPose[];
  readonly durationFrames: number;
  readonly geometryUncertaintyPixels: number;
  readonly player: Readonly<BossSafeRoutePlayerProfile>;
  readonly idealRouteTarget: AbyssalOctarchPoint;
}

interface TraceNode {
  readonly point: AbyssalOctarchRouteWitnessPoint;
  readonly parent?: TraceNode;
}

interface SearchState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly minimumRawClearancePixels: number;
  readonly minimumClearanceAfterUncertaintyPixels: number;
  readonly trace?: TraceNode;
}

interface SearchResult {
  readonly witness: readonly AbyssalOctarchRouteWitnessPoint[];
  readonly minimumRawClearancePixels: number;
  readonly minimumClearanceAfterUncertaintyPixels: number;
}

const ACTION_SET = new Set<string>(ABYSSAL_OCTARCH_ACTION_IDS);
const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);
const clamp01 = (value: number) => clamp(Number(value) || 0, 0, 1);
const toFrame = (seconds: number) => Math.max(
  0,
  Math.round((Number(seconds) || 0) * ABYSSAL_OCTARCH_SAFE_ROUTE_FPS)
);
const magnitude = (x: number, y: number) => Math.hypot(x, y);
const approach = (value: number, target: number, amount: number) => (
  value < target
    ? Math.min(target, value + amount)
    : Math.max(target, value - amount)
);
const easeInOutCubic = (value: number) => {
  const progress = clamp01(value);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const normalizeSeed = (value: number) => {
  const normalized = Math.floor(Number(value) || 0) >>> 0;
  return normalized === 0 ? ABYSSAL_OCTARCH_SAFE_ROUTE_SEED : normalized;
};

const derivedSequence = (
  seed: number,
  attackId: string,
  phaseId: string,
  actionClipId: string
) => parseInt(fnv1a(`${seed}:${phaseId}:${attackId}:${actionClipId}`), 16) % 64;

const resolveWorldSize = (presentation: AbyssalOctarchProofPresentation) => (
  resolveEncounterWorldSize(
    presentation.displayWidth,
    presentation.displayHeight,
    {
      eventId: ABYSSAL_OCTARCH_EVENT_ID,
      normalScale: ABYSSAL_OCTARCH_CAMERA_PROFILE.normalScale,
      expandedScale: ABYSSAL_OCTARCH_CAMERA_PROFILE.expandedScale,
      zoomDelayFrames: ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDelayFrames,
      zoomDurationFrames: ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDurationFrames,
      restoreDurationFrames: ABYSSAL_OCTARCH_CAMERA_PROFILE.restoreDurationFrames,
      verticalAnchor: 'top'
    }
  )
);

const phaseFor = (phaseId: string) => ABYSSAL_OCTARCH_PHASES.find((phase) => (
  phase.id === phaseId
));

const activeTentaclesForPhase = (
  phaseId: AbyssalOctarchPhaseId
): readonly AbyssalOctarchTentacleId[] => {
  const phase = phaseFor(phaseId);
  if (!phase || phase.index === 4) return Object.freeze([]);
  if (phase.index === 1) return ABYSSAL_OCTARCH_TENTACLE_IDS;
  if (phase.index === 2) {
    return Object.freeze([
      'tentacle-upper-port',
      'tentacle-mid-port',
      'tentacle-lower-port',
      'tentacle-ventral-port',
      'tentacle-upper-starboard'
    ]);
  }
  return Object.freeze([
    'tentacle-upper-port',
    'tentacle-upper-starboard'
  ]);
};

const buildSchedule = (
  timeline: Readonly<BossTimelineConfig>,
  attackId: string,
  phaseId: string
): OctarchSchedule | null => {
  const resolved = resolveBossTimelineAttackVariant(
    timeline as BossTimelineConfig,
    attackId,
    phaseId
  );
  const window = getBossTimelineAttackWindow(
    timeline as BossTimelineConfig,
    attackId,
    phaseId,
    ABYSSAL_OCTARCH_SAFE_ROUTE_FPS
  );
  if (!resolved || !window || !ACTION_SET.has(attackId) || !phaseFor(phaseId)) {
    return null;
  }
  const actionClip = resolved.variant.beatClipIds
    .map((clipId) => timeline.clips.find((clip) => clip.id === clipId))
    .find((clip) => (
      clip !== undefined
      && getAbyssalOctarchActionId(clip.parameters?.motionCue) === attackId
      && clip.primitiveId !== 'effect-cue'
    ));
  if (!actionClip?.telegraphClipId) return null;
  const warningClip = timeline.clips.find((clip) => (
    clip.id === actionClip.telegraphClipId
    && clip.phaseId === phaseId
  ));
  if (!warningClip) return null;
  const typedAttackId = attackId as AbyssalOctarchActionId;
  const typedPhaseId = phaseId as AbyssalOctarchPhaseId;
  if (!ABYSSAL_OCTARCH_PHASE_ACTIONS[typedPhaseId].includes(typedAttackId)) return null;
  const windowStartFrame = window.startFrame;
  const warningStartFrame = toFrame(warningClip.startSeconds) - windowStartFrame;
  const fireStartFrame = toFrame(actionClip.startSeconds) - windowStartFrame;
  const fireEndFrame = fireStartFrame + Math.max(1, toFrame(actionClip.durationSeconds));
  const recoveryEndFrame = Math.max(1, window.endFrame - windowStartFrame);
  if (
    warningStartFrame < 0
    || fireStartFrame <= warningStartFrame
    || fireEndFrame <= fireStartFrame
    || recoveryEndFrame < fireEndFrame
  ) return null;
  return Object.freeze({
    attackId: typedAttackId,
    phaseId: typedPhaseId,
    actionClip,
    warningClip,
    windowStartFrame,
    warningStartFrame,
    fireStartFrame,
    fireEndFrame,
    recoveryEndFrame,
    requestedProjectileCount: actionClip.parameters?.projectileCount
  });
};

const bossDimensions = (worldWidth: number) => {
  const configuredWidth = 220 * 2.5;
  const width = Math.min(configuredWidth, Math.round(worldWidth * 0.82));
  return Object.freeze({ width, height: width * (480 / 720) });
};

/** Mirrors the settled Octarch branch in GameEngine.updateTimelineBossMovement. */
const buildBossPoseSamples = ({
  schedule,
  sequence,
  phaseIndex,
  worldWidth,
  worldHeight,
  durationFrames
}: {
  readonly schedule: OctarchSchedule;
  readonly sequence: number;
  readonly phaseIndex: 1 | 2 | 3 | 4;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly durationFrames: number;
}) => {
  const dimensions = bossDimensions(worldWidth);
  const anchorX = (worldWidth - dimensions.width) / 2;
  const anchorY = Math.max(24, worldHeight * 0.035);
  const huntIntensity = 1 + Math.max(0, phaseIndex - 1) * 0.32;
  let x = anchorX;
  let y = anchorY;
  const poses: OctarchBossPose[] = [];
  const lastAbsoluteFrame = schedule.windowStartFrame + durationFrames;
  for (let attackFrame = 0; attackFrame <= lastAbsoluteFrame; attackFrame += 1) {
    // GameEngine increments the structural sequence when the linked warning
    // locks its plan, before the settled movement branch samples this frame.
    const localFrame = attackFrame - schedule.windowStartFrame;
    const movementSequence = localFrame >= schedule.warningStartFrame
      ? sequence + 1
      : sequence;
    const targetX = anchorX
      + Math.sin((attackFrame + movementSequence * 19) * 0.012)
        * Math.min(worldWidth * 0.12, 64) * huntIntensity;
    const targetY = anchorY
      + Math.cos(attackFrame * 0.009) * Math.min(worldHeight * 0.018, 18);
    const follow = 0.018 + huntIntensity * 0.004;
    x += (targetX - x) * follow;
    y += (targetY - y) * follow;
    x = clamp(x, 8, Math.max(8, worldWidth - dimensions.width - 8));
    y = clamp(y, 16, Math.max(16, worldHeight * 0.2));
    if (attackFrame >= schedule.windowStartFrame) {
      poses.push(Object.freeze({ x, y, ...dimensions }));
    }
  }
  return Object.freeze(poses);
};

const primaryTentacleOrigin = (
  context: ProofContext,
  frame: number
): AbyssalOctarchPoint => {
  const pose = context.bossPoses[Math.min(frame, context.bossPoses.length - 1)];
  const selectedId = context.plan.tentacleIds[0];
  const descriptor = ABYSSAL_OCTARCH_TENTACLES.find((tentacle) => (
    tentacle.id === selectedId
  ));
  return Object.freeze({
    x: pose.x + pose.width * (descriptor?.centerXRatio ?? 0.5),
    y: pose.y + pose.height * (descriptor?.centerYRatio ?? 0.45)
  });
};

const pointToSegmentDistance = (
  point: AbyssalOctarchPoint,
  start: AbyssalOctarchPoint,
  end: AbyssalOctarchPoint
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared <= 0.0001
    ? 0
    : clamp(
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        0,
        1
      );
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.y - (start.y + dy * progress)
  );
};

const playerRadius = (player: Readonly<BossSafeRoutePlayerProfile>) => (
  Math.hypot(player.collisionWidth, player.collisionHeight) / 2
);

const hazardClearance = (
  point: AbyssalOctarchPoint,
  hazard: OctarchHazard,
  player: Readonly<BossSafeRoutePlayerProfile>
) => {
  const radius = playerRadius(player) + hazard.radius;
  if (hazard.kind === 'circle') {
    return Math.hypot(
      point.x - hazard.center.x,
      point.y - hazard.center.y
    ) - radius;
  }
  return pointToSegmentDistance(point, hazard.start, hazard.end) - radius;
};

const projectileLifetimeFrames = (
  context: Pick<ProofContext, 'worldWidth' | 'worldHeight'>,
  speed: number
) => Math.ceil(
  Math.hypot(context.worldWidth, context.worldHeight) * 1.45 / Math.max(1, speed)
) + 24;

const meleeHazards = (
  frame: number,
  context: ProofContext,
  activeProgress: number
): readonly OctarchHazard[] => {
  const actionId = context.schedule.attackId;
  const damageActive = actionId === 'grasp-and-hurl'
    ? activeProgress >= 0.22 && activeProgress < 1
    : activeProgress >= 0.28 && activeProgress <= 0.86;
  if (!damageActive || context.plan.tentacleIds.length === 0) return [];
  const origin = primaryTentacleOrigin(context, frame);
  let targetX = context.plan.target.x;
  if (actionId === 'sweeping-arm') {
    const pose = context.bossPoses[Math.min(frame, context.bossPoses.length - 1)];
    const fromLeft = (context.plan.sequence & 1) === 0;
    targetX = fromLeft
      ? -pose.width * 0.15 + (context.worldWidth + pose.width * 0.3) * activeProgress
      : context.worldWidth + pose.width * 0.15
        - (context.worldWidth + pose.width * 0.3) * activeProgress;
  }
  const reachProgress = actionId === 'tentacle-slam'
    ? Math.sin(activeProgress * Math.PI)
    : actionId === 'needle-tip-stab'
      ? Math.min(1, activeProgress * 2.5)
      : activeProgress;
  const eased = easeInOutCubic(reachProgress);
  const tip = Object.freeze({
    x: origin.x + (targetX - origin.x) * eased,
    y: origin.y + (context.plan.target.y - origin.y) * eased
  });
  return [Object.freeze({
    id: `${actionId}-tentacle`,
    kind: 'capsule' as const,
    start: origin,
    end: tip,
    radius: actionId === 'sweeping-arm' ? 24 : 20
  })];
};

const ringHazards = (
  frame: number,
  context: ProofContext
): readonly OctarchHazard[] => {
  const age = frame - context.schedule.fireStartFrame;
  const speed = 3.8;
  if (age < 0 || age > projectileLifetimeFrames(context, speed)) return [];
  const pose = context.bossPoses[context.schedule.fireStartFrame];
  const origin = Object.freeze({
    x: pose.x + pose.width * 0.5,
    y: pose.y + pose.height * 0.579
  });
  const count = Math.max(1, Math.min(
    ABYSSAL_OCTARCH_LIMITS.maximumOwnedHazards,
    Math.round(context.schedule.requestedProjectileCount ?? 18)
  ));
  const direction = resolveBossGapRouteDirection(
    context.schedule.actionClip.parameters?.rotationDirection,
    context.sequence
  );
  const route = resolveBossGapRoute({
    arenaWidth: context.worldWidth,
    arenaHeight: context.worldHeight,
    originX: origin.x,
    originY: origin.y,
    sequence: context.sequence,
    direction
  });
  const hazards: CircleHazard[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * index / count;
    const gapDistance = Math.abs(Math.atan2(
      Math.sin(angle - route.angleRadians),
      Math.cos(angle - route.angleRadians)
    ));
    if (gapDistance < 0.5) continue;
    hazards.push(Object.freeze({
      id: `ring-projectile-${index}`,
      kind: 'circle',
      center: Object.freeze({
        x: origin.x + Math.cos(angle) * speed * age,
        y: origin.y + Math.sin(angle) * speed * age
      }),
      radius: 6
    }));
  }
  return hazards;
};

const asteroidHazards = (
  frame: number,
  context: ProofContext
): readonly OctarchHazard[] => {
  const age = frame - context.schedule.fireStartFrame;
  const speed = 3.2 + context.phaseIndex * 0.22;
  if (age < 0 || age > projectileLifetimeFrames(context, speed)) return [];
  const origin = primaryTentacleOrigin(context, context.schedule.fireStartFrame);
  const angle = Math.atan2(
    context.plan.target.y - origin.y,
    context.plan.target.x - origin.x
  );
  return [Object.freeze({
    id: 'asteroid',
    kind: 'circle' as const,
    center: Object.freeze({
      x: origin.x + Math.cos(angle) * speed * age,
      y: origin.y + Math.sin(angle) * speed * age
    }),
    radius: 22
  })];
};

const sampleHazards = (
  frame: number,
  context: ProofContext
): readonly OctarchHazard[] => {
  const pose = context.bossPoses[Math.min(frame, context.bossPoses.length - 1)];
  const hazards: OctarchHazard[] = [Object.freeze({
    id: 'octarch-core-body',
    kind: 'circle' as const,
    center: Object.freeze({
      x: pose.x + pose.width * 0.5,
      y: pose.y + pose.height * 0.33
    }),
    radius: Math.max(pose.width * 0.2, pose.height * 0.25)
  })];
  const activeFrame = frame - context.schedule.fireStartFrame;
  const activeFrames = Math.max(
    1,
    context.schedule.fireEndFrame - context.schedule.fireStartFrame
  );
  const activeProgress = activeFrame / activeFrames;
  if (activeFrame >= 0 && activeFrame < activeFrames) {
    if (
      context.schedule.attackId === 'grasp-and-hurl'
      || context.schedule.attackId === 'tentacle-slam'
      || context.schedule.attackId === 'sweeping-arm'
      || context.schedule.attackId === 'needle-tip-stab'
    ) hazards.push(...meleeHazards(frame, context, activeProgress));
    if (context.schedule.attackId === 'abyssal-gaze') {
      const firePose = context.bossPoses[context.schedule.fireStartFrame];
      const origin = Object.freeze({
        x: firePose.x + firePose.width * 0.5,
        y: firePose.y + firePose.height * 0.35
      });
      const angle = Math.atan2(
        context.plan.target.y - origin.y,
        context.plan.target.x - origin.x
      );
      const length = Math.hypot(context.worldWidth, context.worldHeight) * 1.25;
      hazards.push(Object.freeze({
        id: 'abyssal-gaze-beam',
        kind: 'capsule',
        start: origin,
        end: Object.freeze({
          x: origin.x + Math.cos(angle) * length,
          y: origin.y + Math.sin(angle) * length
        }),
        radius: 9
      }));
    }
  }
  if (context.schedule.attackId === 'constricting-ring') {
    hazards.push(...ringHazards(frame, context));
  }
  if (context.schedule.attackId === 'asteroid-hurl') {
    hazards.push(...asteroidHazards(frame, context));
  }
  return hazards;
};

const routeTargetFor = (
  schedule: OctarchSchedule,
  plan: AbyssalOctarchActionPlan,
  sequence: number,
  worldWidth: number,
  worldHeight: number,
  bossPoses: readonly OctarchBossPose[]
): AbyssalOctarchPoint => {
  if (schedule.attackId === 'constricting-ring') {
    const pose = bossPoses[schedule.fireStartFrame];
    const originX = pose.x + pose.width * 0.5;
    const originY = pose.y + pose.height * 0.579;
    return resolveBossGapRoute({
      arenaWidth: worldWidth,
      arenaHeight: worldHeight,
      originX,
      originY,
      sequence,
      direction: resolveBossGapRouteDirection(
        schedule.actionClip.parameters?.rotationDirection,
        sequence
      )
    });
  }
  const oppositeX = plan.target.x <= worldWidth / 2
    ? worldWidth * 0.78
    : worldWidth * 0.22;
  if (schedule.attackId === 'sweeping-arm') {
    return Object.freeze({
      x: oppositeX,
      y: plan.target.y >= worldHeight * 0.66
        ? worldHeight * 0.58
        : worldHeight * 0.82
    });
  }
  if (schedule.attackId === 'suction-current') {
    return Object.freeze({ x: oppositeX, y: worldHeight * 0.86 });
  }
  return Object.freeze({ x: oppositeX, y: plan.target.y });
};

const durationFor = (
  schedule: OctarchSchedule,
  worldWidth: number,
  worldHeight: number,
  phaseIndex: number
) => {
  if (schedule.attackId === 'constricting-ring') {
    return Math.max(
      schedule.recoveryEndFrame,
      schedule.fireStartFrame + projectileLifetimeFrames({ worldWidth, worldHeight }, 3.8)
    );
  }
  if (schedule.attackId === 'asteroid-hurl') {
    const speed = 3.2 + phaseIndex * 0.22;
    return Math.max(
      schedule.recoveryEndFrame,
      schedule.fireStartFrame + projectileLifetimeFrames({ worldWidth, worldHeight }, speed)
    );
  }
  return schedule.recoveryEndFrame;
};

const clearanceAt = (
  point: AbyssalOctarchPoint,
  frame: number,
  context: ProofContext
) => {
  const halfWidth = context.player.collisionWidth / 2;
  const halfHeight = context.player.collisionHeight / 2;
  let raw = Math.min(
    point.x - halfWidth,
    context.worldWidth - halfWidth - point.x,
    point.y - halfHeight,
    context.worldHeight - halfHeight - point.y
  );
  for (const hazard of sampleHazards(frame, context)) {
    raw = Math.min(raw, hazardClearance(point, hazard, context.player));
  }
  return Object.freeze({
    raw,
    afterUncertainty: raw - context.geometryUncertaintyPixels
  });
};

const applySuction = (
  frame: number,
  point: AbyssalOctarchPoint,
  context: ProofContext
) => {
  if (
    context.schedule.attackId !== 'suction-current'
    || frame < context.schedule.fireStartFrame
    || frame >= context.schedule.fireEndFrame
  ) return point;
  const pose = context.bossPoses[Math.min(frame, context.bossPoses.length - 1)];
  const mouthX = pose.x + pose.width / 2;
  const mouthY = pose.y + pose.height * 0.48;
  const dx = mouthX - point.x;
  const dy = mouthY - point.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const pull = Math.min(
    ABYSSAL_OCTARCH_LIMITS.maximumPullPerFrame,
    0.72 + context.phaseIndex * 0.22
  );
  return Object.freeze({
    x: point.x + dx / distance * pull,
    y: point.y + dy / distance * pull
  });
};

const CONTROLS = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: -1, y: 0 }),
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -Math.SQRT1_2, y: -Math.SQRT1_2 }),
  Object.freeze({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }),
  Object.freeze({ x: -Math.SQRT1_2, y: Math.SQRT1_2 }),
  Object.freeze({ x: Math.SQRT1_2, y: Math.SQRT1_2 })
]);

const advanceState = (
  state: SearchState,
  control: Readonly<AbyssalOctarchPoint>,
  frame: number,
  context: ProofContext
): SearchState | null => {
  let vx = approach(
    state.vx,
    control.x * context.player.maximumSpeedPerFrame,
    context.player.accelerationPerFrame
  );
  let vy = approach(
    state.vy,
    control.y * context.player.maximumSpeedPerFrame,
    context.player.accelerationPerFrame
  );
  const speed = magnitude(vx, vy);
  if (speed > context.player.maximumSpeedPerFrame) {
    vx = vx / speed * context.player.maximumSpeedPerFrame;
    vy = vy / speed * context.player.maximumSpeedPerFrame;
  }
  const halfWidth = context.player.collisionWidth / 2;
  const halfHeight = context.player.collisionHeight / 2;
  let point = applySuction(frame, {
    x: state.x + vx,
    y: state.y + vy
  }, context);
  point = Object.freeze({
    x: clamp(point.x, halfWidth, context.worldWidth - halfWidth),
    y: clamp(point.y, halfHeight, context.worldHeight - halfHeight)
  });
  const clearance = clearanceAt(point, frame, context);
  if (
    !Number.isFinite(clearance.afterUncertainty)
    || clearance.afterUncertainty
      < ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
  ) return null;
  const witnessPoint = Object.freeze({
    frame,
    x: point.x,
    y: point.y,
    vx,
    vy,
    controlX: control.x,
    controlY: control.y,
    rawClearancePixels: clearance.raw,
    clearanceAfterUncertaintyPixels: clearance.afterUncertainty
  });
  return Object.freeze({
    x: point.x,
    y: point.y,
    vx,
    vy,
    minimumRawClearancePixels: Math.min(
      state.minimumRawClearancePixels,
      clearance.raw
    ),
    minimumClearanceAfterUncertaintyPixels: Math.min(
      state.minimumClearanceAfterUncertaintyPixels,
      clearance.afterUncertainty
    ),
    trace: Object.freeze({ point: witnessPoint, parent: state.trace })
  });
};

const traceToWitness = (trace: TraceNode | undefined) => {
  const reversed: AbyssalOctarchRouteWitnessPoint[] = [];
  for (let cursor = trace; cursor; cursor = cursor.parent) reversed.push(cursor.point);
  return Object.freeze(reversed.reverse());
};

const stateKey = (state: SearchState) => [
  Math.round(state.x / 7),
  Math.round(state.y / 7),
  Math.round(state.vx * 2),
  Math.round(state.vy * 2)
].join(':');

const stateScore = (state: SearchState, context: ProofContext) => (
  state.minimumClearanceAfterUncertaintyPixels * 15
  + Math.min(80, state.trace?.point.clearanceAfterUncertaintyPixels ?? 0) * 2
  - Math.hypot(
    state.x - context.idealRouteTarget.x,
    state.y - context.idealRouteTarget.y
  ) * 0.025
  - magnitude(state.vx, state.vy) * 0.05
);

const findRouteFrom = (
  initial: AbyssalOctarchPoint,
  context: ProofContext,
  breadth: number
): SearchResult | null => {
  const initialClearance = clearanceAt(initial, 0, context);
  if (
    initialClearance.afterUncertainty
      < ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
  ) return null;
  let states: SearchState[] = [Object.freeze({
    x: initial.x,
    y: initial.y,
    vx: 0,
    vy: 0,
    minimumRawClearancePixels: Number.POSITIVE_INFINITY,
    minimumClearanceAfterUncertaintyPixels: Number.POSITIVE_INFINITY
  })];
  for (let frame = 0; frame < context.durationFrames; frame += 1) {
    const controls = frame < context.schedule.warningStartFrame
      ? CONTROLS.slice(0, 1)
      : CONTROLS;
    const candidates: SearchState[] = [];
    for (const state of states) {
      for (const control of controls) {
        const candidate = advanceState(state, control, frame, context);
        if (candidate) candidates.push(candidate);
      }
    }
    if (candidates.length === 0) return null;
    const unique = new Map<string, SearchState>();
    for (const candidate of candidates) {
      const key = stateKey(candidate);
      const previous = unique.get(key);
      if (!previous || stateScore(candidate, context) > stateScore(previous, context)) {
        unique.set(key, candidate);
      }
    }
    const ranked = [...unique.values()].sort((left, right) => (
      stateScore(right, context) - stateScore(left, context)
    ));
    const spatial: SearchState[] = [];
    const occupied = new Set<string>();
    const spatialLimit = Math.max(8, Math.floor(breadth / 2));
    for (const candidate of ranked) {
      const cell = `${Math.floor(candidate.x / 36)}:${Math.floor(candidate.y / 44)}`;
      if (occupied.has(cell)) continue;
      occupied.add(cell);
      spatial.push(candidate);
      if (spatial.length >= spatialLimit) break;
    }
    const spatialSet = new Set(spatial);
    states = [
      ...spatial,
      ...ranked.filter((candidate) => !spatialSet.has(candidate))
    ].slice(0, breadth);
  }
  const winner = [...states].sort((left, right) => (
    right.minimumClearanceAfterUncertaintyPixels
      - left.minimumClearanceAfterUncertaintyPixels
  ))[0];
  const witness = traceToWitness(winner?.trace);
  if (!winner || witness.length !== context.durationFrames) return null;
  return Object.freeze({
    witness,
    minimumRawClearancePixels: winner.minimumRawClearancePixels,
    minimumClearanceAfterUncertaintyPixels:
      winner.minimumClearanceAfterUncertaintyPixels
  });
};

const replayRoute = (
  witness: readonly AbyssalOctarchRouteWitnessPoint[],
  context: ProofContext
) => {
  if (witness.length === 0) return null;
  let state: SearchState = Object.freeze({
    x: witness[0].x - witness[0].vx,
    y: witness[0].y - witness[0].vy,
    vx: 0,
    vy: 0,
    minimumRawClearancePixels: Number.POSITIVE_INFINITY,
    minimumClearanceAfterUncertaintyPixels: Number.POSITIVE_INFINITY
  });
  let minimumRaw = Number.POSITIVE_INFINITY;
  let minimumAfter = Number.POSITIVE_INFINITY;
  for (let frame = 0; frame < witness.length; frame += 1) {
    const point = witness[frame];
    if (
      point.frame !== frame
      || !Number.isFinite(point.x)
      || !Number.isFinite(point.y)
      || !Number.isFinite(point.controlX)
      || !Number.isFinite(point.controlY)
    ) {
      return null;
    }
    const replayed = advanceState(
      state,
      { x: point.controlX, y: point.controlY },
      frame,
      context
    );
    if (
      !replayed
      || Math.abs(point.x - replayed.x) > 0.001
      || Math.abs(point.y - replayed.y) > 0.001
      || Math.abs(point.vx - replayed.vx) > 0.001
      || Math.abs(point.vy - replayed.vy) > 0.001
    ) return null;
    state = replayed;
    minimumRaw = Math.min(minimumRaw, replayed.minimumRawClearancePixels);
    minimumAfter = Math.min(
      minimumAfter,
      replayed.minimumClearanceAfterUncertaintyPixels
    );
  }
  return Object.freeze({ minimumRaw, minimumAfter });
};

const configurationHashFor = ({
  request,
  schedule,
  presentation,
  seed,
  sequence,
  worldWidth,
  worldHeight,
  activeTentacleIds,
  player,
  geometryUncertaintyPixels
}: {
  readonly request: AbyssalOctarchSafeRouteProofRequest;
  readonly schedule: OctarchSchedule;
  readonly presentation: AbyssalOctarchProofPresentation;
  readonly seed: number;
  readonly sequence: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly activeTentacleIds: readonly AbyssalOctarchTentacleId[];
  readonly player: Readonly<BossSafeRoutePlayerProfile>;
  readonly geometryUncertaintyPixels: number;
}) => {
  const resolved = resolveBossTimelineAttackVariant(
    request.timeline as BossTimelineConfig,
    request.attackId,
    request.phaseId
  );
  const relevantClipIds = new Set([
    ...(resolved?.variant.beatClipIds ?? []),
    resolved?.variant.recoveryClipId,
    ...request.timeline.clips
      .filter((clip) => resolved?.variant.beatClipIds.includes(clip.id))
      .map((clip) => clip.telegraphClipId)
  ].filter((value): value is string => Boolean(value)));
  return fnv1a(JSON.stringify({
    proofRevision: 'abyssal-octarch-safe-route-v1',
    attackId: request.attackId,
    phaseId: request.phaseId,
    actionClipId: schedule.actionClip.id,
    presentation,
    worldWidth,
    worldHeight,
    seed,
    sequence,
    fps: ABYSSAL_OCTARCH_SAFE_ROUTE_FPS,
    geometryUncertaintyPixels,
    requiredClearanceAfterUncertaintyPixels:
      ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
    player,
    activeTentacleIds,
    clips: request.timeline.clips
      .filter((clip) => relevantClipIds.has(clip.id))
      .map((clip) => clip),
    variant: resolved?.variant
  }));
};

const failure = ({
  request,
  reason,
  detail,
  presentation,
  seed,
  sequence = 0,
  schedule,
  worldWidth,
  worldHeight,
  activeTentacleIds = [],
  selectedTentacleIds = [],
  configurationHash = fnv1a('invalid-octarch-proof-request'),
  checkedFrames = 0,
  durationFrames = 0,
  geometryUncertaintyPixels = ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS,
  minimumRawClearancePixels = Number.NEGATIVE_INFINITY,
  minimumClearanceAfterUncertaintyPixels = Number.NEGATIVE_INFINITY
}: {
  readonly request: AbyssalOctarchSafeRouteProofRequest;
  readonly reason: Exclude<AbyssalOctarchSafeRouteFailureReason, 'proven'>;
  readonly detail: string;
  readonly presentation: AbyssalOctarchProofPresentation;
  readonly seed: number;
  readonly sequence?: number;
  readonly schedule?: OctarchSchedule;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly activeTentacleIds?: readonly AbyssalOctarchTentacleId[];
  readonly selectedTentacleIds?: readonly AbyssalOctarchTentacleId[];
  readonly configurationHash?: string;
  readonly checkedFrames?: number;
  readonly durationFrames?: number;
  readonly geometryUncertaintyPixels?: number;
  readonly minimumRawClearancePixels?: number;
  readonly minimumClearanceAfterUncertaintyPixels?: number;
}): AbyssalOctarchSafeRouteProof => ({
  status: 'unproven',
  reason,
  attackId: request.attackId,
  phaseId: request.phaseId,
  presentationId: presentation.id,
  seed,
  sequence,
  actionClipId: schedule?.actionClip.id,
  checkedFrames,
  durationFrames,
  geometryUncertaintyPixels,
  requiredRawClearancePixels: geometryUncertaintyPixels
    + ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
  requiredClearanceAfterUncertaintyPixels:
    ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
  minimumRawClearancePixels,
  minimumClearanceAfterUncertaintyPixels,
  worldWidth,
  worldHeight,
  activeTentacleIds,
  selectedTentacleIds,
  configurationHash,
  detail
});

export const proveAbyssalOctarchSafeRoute = (
  request: Readonly<AbyssalOctarchSafeRouteProofRequest>
): AbyssalOctarchSafeRouteProof => {
  const presentation = request.presentation
    ?? ABYSSAL_OCTARCH_SAFE_ROUTE_PRESENTATIONS.portrait;
  const seed = normalizeSeed(request.seed ?? ABYSSAL_OCTARCH_SAFE_ROUTE_SEED);
  const world = resolveWorldSize(presentation);
  if (
    presentation.displayWidth !== 390
    || presentation.displayHeight !== 844
    || presentation.hostWidth < presentation.displayWidth
    || presentation.hostHeight < presentation.displayHeight
    || !Number.isFinite(presentation.stageOffsetX)
    || !Number.isFinite(presentation.stageOffsetY)
  ) {
    return failure({
      request,
      reason: 'invalid-presentation',
      detail: 'Octarch proofs require the canonical 390x844 portrait stage, either direct or letterboxed inside a wider host.',
      presentation,
      seed,
      worldWidth: world.width,
      worldHeight: world.height
    });
  }
  const schedule = buildSchedule(request.timeline, request.attackId, request.phaseId);
  if (!schedule) {
    return failure({
      request,
      reason: ACTION_SET.has(request.attackId)
        ? 'missing-attack-variant'
        : 'unsupported-action',
      detail: 'The compiled Sandbox timeline does not expose one supported Octarch action variant with a linked warning and recovery.',
      presentation,
      seed,
      worldWidth: world.width,
      worldHeight: world.height
    });
  }
  const phase = phaseFor(schedule.phaseId);
  if (!phase) {
    return failure({
      request,
      reason: 'invalid-timeline-geometry',
      detail: 'The retained attack variant references an unknown Octarch phase.',
      presentation,
      seed,
      schedule,
      worldWidth: world.width,
      worldHeight: world.height
    });
  }
  const player = request.player ?? CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER;
  const geometryUncertaintyPixels = Math.max(
    ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS,
    Number(request.geometryUncertaintyPixels)
      || ABYSSAL_OCTARCH_GEOMETRY_UNCERTAINTY_PIXELS
  );
  if (
    !Number.isFinite(player.collisionWidth)
    || !Number.isFinite(player.collisionHeight)
    || !Number.isFinite(player.maximumSpeedPerFrame)
    || !Number.isFinite(player.accelerationPerFrame)
    || player.collisionWidth <= 0
    || player.collisionHeight <= 0
    || player.maximumSpeedPerFrame <= 0
    || player.accelerationPerFrame <= 0
  ) {
    return failure({
      request,
      reason: 'invalid-timeline-geometry',
      detail: 'The baseline player profile contains invalid geometry or movement bounds.',
      presentation,
      seed,
      schedule,
      worldWidth: world.width,
      worldHeight: world.height,
      geometryUncertaintyPixels
    });
  }
  const sequence = derivedSequence(
    seed,
    schedule.attackId,
    schedule.phaseId,
    schedule.actionClip.id
  );
  const activeTentacleIds = activeTentaclesForPhase(schedule.phaseId);
  const durationFrames = durationFor(
    schedule,
    world.width,
    world.height,
    phase.index
  );
  const bossPoses = buildBossPoseSamples({
    schedule,
    sequence,
    phaseIndex: phase.index,
    worldWidth: world.width,
    worldHeight: world.height,
    durationFrames
  });
  const configurationHash = configurationHashFor({
    request,
    schedule,
    presentation,
    seed,
    sequence,
    worldWidth: world.width,
    worldHeight: world.height,
    activeTentacleIds,
    player,
    geometryUncertaintyPixels
  });
  const breadth = Math.max(48, Math.min(384, Math.floor(request.searchBreadth ?? 128)));
  const halfWidth = player.collisionWidth / 2;
  const halfHeight = player.collisionHeight / 2;
  const starts = [0.2, 0.35, 0.5, 0.65, 0.8].flatMap((xRatio) => (
    [0.72, 0.82, 0.9].map((yRatio) => Object.freeze({
      x: clamp(world.width * xRatio, halfWidth, world.width - halfWidth),
      y: clamp(world.height * yRatio, halfHeight, world.height - halfHeight)
    }))
  ));
  let winner: SearchResult | null = null;
  let winningPlan: AbyssalOctarchActionPlan | null = null;
  for (const start of starts) {
    const plan = createAbyssalOctarchActionPlan({
      actionId: schedule.attackId,
      activeTentacleIds,
      sequence,
      phaseIndex: phase.index,
      arenaWidth: world.width,
      arenaHeight: world.height,
      playerCenterX: start.x,
      playerCenterY: start.y
    });
    const context: ProofContext = {
      schedule,
      plan,
      phaseIndex: phase.index,
      sequence,
      worldWidth: world.width,
      worldHeight: world.height,
      bossPoses,
      durationFrames,
      geometryUncertaintyPixels,
      player,
      idealRouteTarget: routeTargetFor(
        schedule,
        plan,
        sequence,
        world.width,
        world.height,
        bossPoses
      )
    };
    const result = findRouteFrom(start, context, breadth);
    if (result) {
      winner = result;
      winningPlan = plan;
      // A proof needs one replayable witness, not the widest of fifteen. Stop
      // at the first deterministic success so the full compiled roster stays
      // cheap enough to run as a focused gate on every content change.
      break;
    }
  }
  if (!winner || !winningPlan) {
    return failure({
      request,
      reason: 'search-exhausted',
      detail: `No baseline-speed route retained ${ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS}px after ${geometryUncertaintyPixels}px uncertainty through the compiled action and its owned hazards.`,
      presentation,
      seed,
      sequence,
      schedule,
      worldWidth: world.width,
      worldHeight: world.height,
      activeTentacleIds,
      configurationHash,
      checkedFrames: durationFrames,
      durationFrames,
      geometryUncertaintyPixels
    });
  }
  const replayContext: ProofContext = {
    schedule,
    plan: winningPlan,
    phaseIndex: phase.index,
    sequence,
    worldWidth: world.width,
    worldHeight: world.height,
    bossPoses,
    durationFrames,
    geometryUncertaintyPixels,
    player,
    idealRouteTarget: routeTargetFor(
      schedule,
      winningPlan,
      sequence,
      world.width,
      world.height,
      bossPoses
    )
  };
  const replay = replayRoute(winner.witness, replayContext);
  if (!replay) {
    return failure({
      request,
      reason: 'replay-failed',
      detail: 'The constructive witness failed exact deterministic hazard replay.',
      presentation,
      seed,
      sequence,
      schedule,
      worldWidth: world.width,
      worldHeight: world.height,
      activeTentacleIds,
      selectedTentacleIds: winningPlan.tentacleIds,
      configurationHash,
      checkedFrames: durationFrames,
      durationFrames,
      geometryUncertaintyPixels,
      minimumRawClearancePixels: winner.minimumRawClearancePixels,
      minimumClearanceAfterUncertaintyPixels:
        winner.minimumClearanceAfterUncertaintyPixels
    });
  }
  if (
    replay.minimumAfter
      < ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS
  ) {
    return failure({
      request,
      reason: 'insufficient-clearance',
      detail: `The deterministic witness retained only ${replay.minimumAfter.toFixed(2)}px after uncertainty.`,
      presentation,
      seed,
      sequence,
      schedule,
      worldWidth: world.width,
      worldHeight: world.height,
      activeTentacleIds,
      selectedTentacleIds: winningPlan.tentacleIds,
      configurationHash,
      checkedFrames: durationFrames,
      durationFrames,
      geometryUncertaintyPixels,
      minimumRawClearancePixels: replay.minimumRaw,
      minimumClearanceAfterUncertaintyPixels: replay.minimumAfter
    });
  }
  const witness = Object.freeze(winner.witness.map((point) => Object.freeze({ ...point })));
  const routeHash = fnv1a(witness.map((point) => [
    point.frame,
    point.x.toFixed(4),
    point.y.toFixed(4),
    point.vx.toFixed(4),
    point.vy.toFixed(4),
    point.controlX.toFixed(4),
    point.controlY.toFixed(4)
  ].join(':')).join('|'));
  return Object.freeze({
    status: 'proven',
    reason: 'proven',
    attackId: request.attackId,
    phaseId: request.phaseId,
    presentationId: presentation.id,
    seed,
    sequence,
    actionClipId: schedule.actionClip.id,
    checkedFrames: durationFrames,
    durationFrames,
    geometryUncertaintyPixels,
    requiredRawClearancePixels: geometryUncertaintyPixels
      + ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
    requiredClearanceAfterUncertaintyPixels:
      ABYSSAL_OCTARCH_REQUIRED_CLEARANCE_AFTER_UNCERTAINTY_PIXELS,
    minimumRawClearancePixels: replay.minimumRaw,
    minimumClearanceAfterUncertaintyPixels: replay.minimumAfter,
    worldWidth: world.width,
    worldHeight: world.height,
    activeTentacleIds,
    selectedTentacleIds: winningPlan.tentacleIds,
    configurationHash,
    routeHash,
    witness,
    detail: `A fixed-seed baseline-speed route survived the compiled ${schedule.actionClip.primitiveId} sentence with ${replay.minimumAfter.toFixed(2)}px clearance after ${geometryUncertaintyPixels}px uncertainty.`
  });
};

/** Enumerates the current compiled variant roster instead of a hard-coded grid. */
export const buildAbyssalOctarchSafeRouteMatrix = (
  timeline: Readonly<BossTimelineConfig>,
  presentations: readonly Readonly<AbyssalOctarchProofPresentation>[] = (
    Object.values(ABYSSAL_OCTARCH_SAFE_ROUTE_PRESENTATIONS)
  )
): readonly AbyssalOctarchSafeRouteMatrixEntry[] => Object.freeze(
  (timeline.attacks ?? []).flatMap((attack) => (
    attack.variants.flatMap((variant) => (
      presentations.map((presentation) => Object.freeze({
        attackId: attack.id,
        phaseId: variant.phaseId,
        presentationId: presentation.id,
        proof: proveAbyssalOctarchSafeRoute({
          timeline,
          attackId: attack.id,
          phaseId: variant.phaseId,
          presentation
        })
      }))
    ))
  ))
);
