import type {
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelinePrimitiveId
} from '../../../game-config/types';
import {
  buildBossWeaveWallSlots,
  resolveBossGapRoute,
  resolveBossGapRouteDirection,
  resolveBossPatternSequence,
  resolveBossWeaveWallLayout
} from './BossPatternRuntime';
import {
  resolveHeliosMineFormation,
  resolveHeliosCrossfireAngle,
  resolveHeliosCrossfireSides,
  sampleHeliosCrossfirePulse,
  sampleHeliosMineLifecycle,
  sampleHeliosReactorFanShot,
  sampleHeliosTrackingPincer
} from './HeliosClawcarrierRuntime';
import { resolveBossTimelineAttackVariant } from './BossTimelineRuntime';

export interface BossSafeRoutePoint {
  readonly x: number;
  readonly y: number;
}

export interface BossSafeRouteViewport {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly mobileProfile: boolean;
}

export const BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS = Object.freeze({
  mobile: Object.freeze({
    id: 'mobile-390x844',
    width: 390,
    height: 844,
    mobileProfile: true
  }),
  desktop: Object.freeze({
    id: 'desktop-1280x720',
    width: 1280,
    height: 720,
    mobileProfile: false
  })
}) satisfies Readonly<Record<'mobile' | 'desktop', BossSafeRouteViewport>>;

export interface BossSafeRoutePose {
  /** Locked core origin used by routed rings and the cross-beam pair. */
  readonly core: BossSafeRoutePoint;
  /** Downward weave rows originate here; normally the hull's 62% Y socket. */
  readonly weaveOriginY: number;
  readonly sockets: Readonly<{
    port: readonly BossSafeRoutePoint[];
    starboard: readonly BossSafeRoutePoint[];
  }>;
  /** Configured boss projectile speed before each primitive's bounded modifier. */
  readonly projectileSpeed: number;
  /** Inflates every hostile shape to cover bounded pose/socket drift. */
  readonly geometryUncertaintyPixels: number;
  /**
   * Optional exact warning/fire snapshots keyed by `${clipId}:${executionIndex}`.
   * These take precedence over the fallback pose so a moving articulated boss
   * can be proven against the same origins committed by the runtime warning.
   */
  readonly beatOrigins?: Readonly<Record<string, BossSafeRouteBeatOrigin>>;
}

export interface BossSafeRouteBeatOrigin {
  readonly core?: BossSafeRoutePoint;
  /** Live reactor origins, ordered by the sequential fan/mine emission index. */
  readonly coreSamples?: readonly BossSafeRoutePoint[];
  readonly weaveOriginY?: number;
  readonly sockets?: Readonly<Partial<Record<
    'port' | 'starboard',
    readonly BossSafeRoutePoint[]
  >>>;
  /** Exact runtime claw radius for sweep/pincer samples in this beat. */
  readonly meleeRadiusPixels?: number;
  /** Captured player-center lock used to translate pincer samples during search. */
  readonly targetLock?: BossSafeRoutePoint;
  /** Exact live claw locations, present only during visible damage-active frames. */
  readonly meleeSamples?: readonly BossSafeRouteMeleeSample[];
}

export interface BossSafeRouteMeleeSample {
  readonly frameOffset: number;
  readonly side: 'port' | 'starboard';
  readonly point: BossSafeRoutePoint;
}

export interface BossSafeRoutePlayerProfile {
  readonly collisionWidth: number;
  readonly collisionHeight: number;
  readonly maximumSpeedPerFrame: number;
  readonly accelerationPerFrame: number;
}

/**
 * Matches the current 122px player entity after its 29% X and 24% Y collision
 * insets. Base keyboard speed is deliberately used: a proof must not depend on
 * a ship upgrade or touch's faster 1.34x target velocity.
 */
export const CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER = Object.freeze({
  collisionWidth: 51.24,
  collisionHeight: 63.44,
  maximumSpeedPerFrame: 2.5,
  accelerationPerFrame: 0.38
}) satisfies BossSafeRoutePlayerProfile;

export type BossSafeRouteProofReason =
  | 'proven'
  | 'missing-attack'
  | 'missing-phase-variant'
  | 'invalid-viewport'
  | 'missing-pose-geometry'
  | 'missing-telegraph'
  | 'unsupported-primitive'
  | 'invalid-attack-geometry'
  | 'insufficient-clearance'
  | 'search-exhausted'
  | 'replay-failed';

export interface BossSafeRouteWitnessPoint extends BossSafeRoutePoint {
  readonly frame: number;
  readonly controlX: number;
  readonly controlY: number;
}

export interface BossSafeRouteProof {
  readonly status: 'proven' | 'unproven';
  readonly reason: BossSafeRouteProofReason;
  readonly attackId: string;
  readonly phaseId: string;
  readonly viewportId: string;
  readonly checkedFrames: number;
  readonly modeledPrimitives: readonly BossTimelinePrimitiveId[];
  readonly assumptions: readonly string[];
  readonly detail: string;
  readonly minimumClearancePixels?: number;
  readonly witnessHash?: string;
  readonly witness?: readonly BossSafeRouteWitnessPoint[];
}

export interface BossSafeRouteProofRequest {
  readonly timeline: Readonly<BossTimelineConfig>;
  readonly attackId: string;
  readonly phaseId: string;
  readonly viewport: Readonly<BossSafeRouteViewport>;
  readonly pose: Readonly<BossSafeRoutePose>;
  readonly player?: Readonly<BossSafeRoutePlayerProfile>;
  readonly fps?: number;
  /** Search breadth changes discovery only; every success is replayed exactly. */
  readonly searchBreadth?: number;
  readonly controlFrames?: number;
}

export interface BossSafeRouteBenchmarkProof {
  readonly status: 'proven' | 'unproven';
  readonly results: Readonly<{
    mobile: BossSafeRouteProof;
    desktop: BossSafeRouteProof;
  }>;
}

interface ScheduledAttackBeat {
  readonly key: string;
  readonly clip: Readonly<BossTimelineClip>;
  readonly executionIndex: number;
  readonly warningFrame: number;
  readonly fireFrame: number;
}

interface ProjectileHazard {
  readonly kind: 'projectile';
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

interface BeamHazard {
  readonly kind: 'beam';
  readonly axis: 'vertical' | 'horizontal';
  readonly coordinate: number;
  readonly halfThickness: number;
  life: number;
}

interface ZoneHazard {
  readonly kind: 'zone';
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  life: number;
}

interface MineHazard {
  readonly kind: 'helios-mine';
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly projectileHalfSize: number;
  readonly explosionHalfSize: number;
  ageFrames: number;
  triggerFrame: number;
}

type SafeRouteHazard = ProjectileHazard | BeamHazard | ZoneHazard | MineHazard;

interface TraceNode {
  readonly parent?: TraceNode;
  readonly controlIndex: number;
  readonly frameCount: number;
}

interface SearchState {
  frame: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hazards: SafeRouteHazard[];
  locks: Readonly<Record<string, BossSafeRoutePoint>>;
  minimumClearance: number;
  currentClearance: number;
  readonly initialX: number;
  readonly initialY: number;
  trace?: TraceNode;
}

interface SimulationContext {
  readonly viewport: Readonly<BossSafeRouteViewport>;
  readonly pose: Readonly<BossSafeRoutePose>;
  readonly player: Readonly<BossSafeRoutePlayerProfile>;
  readonly fps: number;
  readonly beats: readonly ScheduledAttackBeat[];
  readonly warningEvents: ReadonlyMap<number, readonly ScheduledAttackBeat[]>;
  readonly fireEvents: ReadonlyMap<number, readonly ScheduledAttackBeat[]>;
  readonly recoveryStartFrame?: number;
}

export interface BossSideBarrageProofModel {
  readonly variant: 'regular' | 'heavy-cannon' | 'gatling-barrage';
  readonly projectileCount: number;
  readonly projectileSpeed: number;
  readonly projectileSize: number;
  /** Fan spacing for regular/heavy fire; deterministic per-pulse kick for gatlings. */
  readonly spreadRadians: number;
  /** Zero for one-frame fans; otherwise the runtime's simulation-frame cadence. */
  readonly pulseIntervalFrames: number;
}

const SUPPORTED_PRIMITIVES = new Set<BossTimelinePrimitiveId>([
  'side-barrage',
  'gap-ring',
  'weave-wall',
  'cross-beam',
  'paired-cannon-burst',
  'articulated-melee-sweep',
  'reactor-aperture-pattern',
  'tracking-pincer-dive'
]);

/** Required after every modeled geometry uncertainty has already been applied. */
export const MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS = 6;

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

const finite = (value: number) => Number.isFinite(value);
const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

/**
 * Mirrors GameEngine's three side-barrage envelopes. Keeping this resolution
 * pure makes the constructive proof's projectile budget directly testable.
 */
export const resolveBossSideBarrageProofModel = ({
  projectileCount,
  projectileSpeed,
  motionCue,
  mobileProfile
}: {
  readonly projectileCount?: number;
  readonly projectileSpeed: number;
  readonly motionCue?: NonNullable<BossTimelineClip['parameters']>['motionCue'];
  readonly mobileProfile: boolean;
}): BossSideBarrageProofModel => {
  if (motionCue === 'gatling-barrage') {
    return {
      variant: 'gatling-barrage',
      projectileCount: Math.max(4, Math.min(10, Math.floor(projectileCount ?? 7))),
      projectileSpeed: Math.min(10.2, Math.max(7.4, Number(projectileSpeed) || 8.4)),
      projectileSize: 9,
      spreadRadians: 0.018,
      pulseIntervalFrames: mobileProfile ? 7 : 5
    };
  }
  if (motionCue === 'heavy-cannon') {
    const requestedShots = projectileCount ?? 4;
    return {
      variant: 'heavy-cannon',
      projectileCount: Math.max(2, Math.min(5, Math.ceil(requestedShots / 2))),
      projectileSpeed: Math.min(
        6.4,
        Math.max(4.2, Number(projectileSpeed) || 5.2) * 0.68
      ),
      projectileSize: 24,
      spreadRadians: 0.16,
      pulseIntervalFrames: 0
    };
  }
  return {
    variant: 'regular',
    projectileCount: Math.max(1, Math.min(24, Math.round(projectileCount ?? 4))),
    projectileSpeed: Math.min(
      9.4,
      Math.max(5.4, Number(projectileSpeed) || 7) * 0.9
    ),
    projectileSize: 14,
    spreadRadians: 0.115,
    pulseIntervalFrames: 0
  };
};
const toFrame = (seconds: number, fps: number) => Math.max(
  1,
  Math.round(Math.max(0, Number(seconds) || 0) * Math.max(1, fps))
);
const repeatCount = (clip: Readonly<BossTimelineClip>) => Math.max(
  1,
  Math.min(8, Math.floor(clip.repeat?.count ?? 1))
);
const repeatIntervalFrames = (clip: Readonly<BossTimelineClip>, fps: number) => (
  clip.repeat ? toFrame(clip.repeat.intervalSeconds, fps) : 0
);
const executionFrame = (
  clip: Readonly<BossTimelineClip>,
  executionIndex: number,
  fps: number
) => toFrame(clip.startSeconds, fps) + executionIndex * repeatIntervalFrames(clip, fps);

const failure = (
  request: BossSafeRouteProofRequest,
  reason: Exclude<BossSafeRouteProofReason, 'proven'>,
  detail: string,
  modeledPrimitives: readonly BossTimelinePrimitiveId[] = [],
  checkedFrames = 0
): BossSafeRouteProof => ({
  status: 'unproven',
  reason,
  attackId: request.attackId,
  phaseId: request.phaseId,
  viewportId: request.viewport.id,
  checkedFrames,
  modeledPrimitives,
  assumptions: [],
  detail
});

const buildSchedule = (
  timeline: Readonly<BossTimelineConfig>,
  attackId: string,
  phaseId: string,
  fps: number
): {
  readonly beats?: readonly ScheduledAttackBeat[];
  readonly recoveryStartFrame?: number;
  readonly recoveryEndFrame?: number;
  readonly reason?: 'missing-attack' | 'missing-phase-variant' | 'missing-telegraph';
  readonly detail?: string;
} => {
  const attackExists = timeline.attacks?.some((attack) => attack.id === attackId) ?? false;
  const resolved = resolveBossTimelineAttackVariant(timeline, attackId, phaseId);
  if (!resolved) {
    return attackExists
      ? { reason: 'missing-phase-variant', detail: `Attack ${attackId} has no ${phaseId} variant.` }
      : { reason: 'missing-attack', detail: `Attack ${attackId} is not authored on this timeline.` };
  }
  const beats: ScheduledAttackBeat[] = [];
  for (const clipId of resolved.variant.beatClipIds) {
    const clip = timeline.clips.find((candidate) => (
      candidate.id === clipId
      && candidate.trigger === 'time'
      && candidate.phaseId === phaseId
    ));
    if (!clip?.telegraphClipId) {
      return {
        reason: 'missing-telegraph',
        detail: `Beat ${clipId} has no phase-owned warning.`
      };
    }
    const warning = timeline.clips.find((candidate) => (
      candidate.id === clip.telegraphClipId
      && candidate.trigger === 'time'
      && candidate.phaseId === phaseId
    ));
    if (!warning) {
      return {
        reason: 'missing-telegraph',
        detail: `Beat ${clipId} references a missing phase-owned warning.`
      };
    }
    const clipRepeats = repeatCount(clip);
    const warningRepeats = repeatCount(warning);
    for (let executionIndex = 0; executionIndex < clipRepeats; executionIndex += 1) {
      if (executionIndex > 0 && (warning.repeat === undefined || executionIndex >= warningRepeats)) {
        return {
          reason: 'missing-telegraph',
          detail: `Repeated beat ${clipId} execution ${executionIndex + 1} has no matching warning.`
        };
      }
      const warningFrame = executionFrame(warning, executionIndex, fps);
      const fireFrame = executionFrame(clip, executionIndex, fps);
      if (warningFrame >= fireFrame) {
        return {
          reason: 'missing-telegraph',
          detail: `Beat ${clipId} warning does not precede its damaging frame.`
        };
      }
      beats.push({
        key: `${clip.id}:${executionIndex}`,
        clip,
        executionIndex,
        warningFrame,
        fireFrame
      });
    }
  }
  const recovery = timeline.clips.find((clip) => (
    clip.id === resolved.variant.recoveryClipId
    && clip.trigger === 'time'
    && clip.phaseId === phaseId
  ));
  const recoveryStartFrame = recovery
    ? toFrame(recovery.startSeconds, fps)
    : undefined;
  const recoveryEndFrame = recovery
    ? recoveryStartFrame! + toFrame(recovery.durationSeconds, fps)
    : Math.max(...beats.map((beat) => beat.fireFrame)) + fps;
  beats.sort((left, right) => (
    left.fireFrame - right.fireFrame
    || left.warningFrame - right.warningFrame
    || left.key.localeCompare(right.key)
  ));
  return { beats, recoveryStartFrame, recoveryEndFrame };
};

const groupEvents = (
  beats: readonly ScheduledAttackBeat[],
  field: 'warningFrame' | 'fireFrame'
) => {
  const grouped = new Map<number, ScheduledAttackBeat[]>();
  beats.forEach((beat) => {
    const frame = beat[field];
    const events = grouped.get(frame) ?? [];
    events.push(beat);
    grouped.set(frame, events);
  });
  return grouped;
};

const cloneHazard = (hazard: SafeRouteHazard): SafeRouteHazard => ({ ...hazard });

const moveToward = (current: number, target: number, maximumDelta: number) => (
  Math.abs(target - current) <= maximumDelta
    ? target
    : current + Math.sign(target - current) * maximumDelta
);

const spawnProjectile = (
  hazards: SafeRouteHazard[],
  origin: BossSafeRoutePoint,
  angle: number,
  speed: number,
  size: number,
  uncertainty: number
) => {
  hazards.push({
    kind: 'projectile',
    x: origin.x,
    y: origin.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    halfWidth: size * 0.3 + uncertainty,
    halfHeight: size * 0.3 + uncertainty
  });
};

const getBeatCore = (
  pose: Readonly<BossSafeRoutePose>,
  beat: ScheduledAttackBeat
) => pose.beatOrigins?.[beat.key]?.core ?? pose.core;

const getBeatSockets = (
  pose: Readonly<BossSafeRoutePose>,
  beat: ScheduledAttackBeat,
  side: 'port' | 'starboard'
) => pose.beatOrigins?.[beat.key]?.sockets?.[side] ?? pose.sockets[side];

const getBeatWeaveOriginY = (
  pose: Readonly<BossSafeRoutePose>,
  beat: ScheduledAttackBeat
) => pose.beatOrigins?.[beat.key]?.weaveOriginY ?? pose.weaveOriginY;

const getBeatMeleeRadius = (
  pose: Readonly<BossSafeRoutePose>,
  beat: ScheduledAttackBeat
) => pose.beatOrigins?.[beat.key]?.meleeRadiusPixels;

const spawnZone = (
  hazards: SafeRouteHazard[],
  point: Readonly<BossSafeRoutePoint>,
  radius: number,
  uncertainty: number,
  life: number
) => {
  hazards.push({
    kind: 'zone',
    x: point.x,
    y: point.y,
    halfWidth: radius + uncertainty,
    halfHeight: radius + uncertainty,
    life: Math.max(1, Math.floor(life))
  });
};

const spawnBeatHazards = (
  state: SearchState,
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => {
  const { pose, viewport } = context;
  const parameters = beat.clip.parameters;
  const sequence = resolveBossPatternSequence(parameters?.sequence, beat.executionIndex);
  if (beat.clip.primitiveId === 'side-barrage') {
    const model = resolveBossSideBarrageProofModel({
      projectileCount: parameters?.projectileCount,
      projectileSpeed: pose.projectileSpeed,
      motionCue: parameters?.motionCue,
      mobileProfile: viewport.mobileProfile
    });
    // Gatling fire is emitted over the authored action duration by
    // spawnActiveGatlingPulse. The fire event still validates its lock here.
    if (model.variant === 'gatling-barrage') {
      return state.locks[beat.key] !== undefined
        && getBeatSockets(pose, beat, 'port').length > 0
        && getBeatSockets(pose, beat, 'starboard').length > 0;
    }
    const side = parameters?.side ?? 'port';
    const origins = getBeatSockets(pose, beat, side);
    const lockedTarget = state.locks[beat.key];
    if (!lockedTarget || origins.length === 0) return false;
    for (let index = 0; index < model.projectileCount; index += 1) {
      const origin = origins[index % origins.length];
      const offset = index - (model.projectileCount - 1) / 2;
      const angle = Math.atan2(
        lockedTarget.y - origin.y,
        lockedTarget.x - origin.x
      ) + offset * model.spreadRadians;
      spawnProjectile(
        state.hazards,
        origin,
        angle,
        model.projectileSpeed * (1 + Math.abs(offset) * 0.018),
        model.projectileSize,
        pose.geometryUncertaintyPixels
      );
    }
    return true;
  }
  if (beat.clip.primitiveId === 'paired-cannon-burst') {
    const sides = resolveHeliosCrossfireSides(parameters?.side);
    // Runtime fire is intentionally distributed across simulation frames.
    // The fire cue validates the live-mount sample set; active pulses below
    // materialize the same one-round cadence as GameEngine.
    return sides.every((side) => getBeatSockets(pose, beat, side).length > 0);
  }
  if (
    beat.clip.primitiveId === 'articulated-melee-sweep'
    || beat.clip.primitiveId === 'tracking-pincer-dive'
  ) {
    const isPincer = beat.clip.primitiveId === 'tracking-pincer-dive';
    if (isPincer) {
      const pincer = sampleHeliosTrackingPincer({ sequence, progress: 0.7 });
      if (pincer.stage === 'rise-open' || pincer.stage === 'track-lock') return true;
    }
    const exact = pose.beatOrigins?.[beat.key];
    if ((exact?.meleeSamples?.length ?? 0) > 0) return true;
    const sides = parameters?.side ? [parameters.side] : ['port', 'starboard'] as const;
    const samples = sides.flatMap((side) => [...getBeatSockets(pose, beat, side)]);
    const radius = getBeatMeleeRadius(pose, beat);
    if (samples.length === 0 || !Number.isFinite(radius) || Number(radius) <= 0) return false;
    const pincerLock = isPincer
      ? state.locks[beat.key]
        ?? state.locks[`${beat.clip.id}:${Math.max(0, beat.executionIndex - 1)}`]
      : undefined;
    const translation = isPincer && pincerLock && exact?.targetLock
      ? {
          x: pincerLock.x - exact.targetLock.x,
          y: pincerLock.y - exact.targetLock.y
        }
      : { x: 0, y: 0 };
    const life = toFrame(beat.clip.durationSeconds, context.fps);
    samples.forEach((sample) => spawnZone(
      state.hazards,
      { x: sample.x + translation.x, y: sample.y + translation.y },
      Number(radius),
      pose.geometryUncertaintyPixels,
      life
    ));
    return true;
  }
  if (beat.clip.primitiveId === 'reactor-aperture-pattern') {
    // Helios owns a bounded sequential fan/mine runtime. It is intentionally
    // not routed through the shared full-circle gap-ring model.
    const exact = pose.beatOrigins?.[beat.key];
    return Boolean(exact?.core && exact?.targetLock);
  }
  if (beat.clip.primitiveId === 'gap-ring') {
    const core = getBeatCore(pose, beat);
    const gapSequence = sequence;
    const direction = resolveBossGapRouteDirection(
      parameters?.rotationDirection,
      gapSequence
    );
    const route = resolveBossGapRoute({
      arenaWidth: viewport.width,
      arenaHeight: viewport.height,
      originX: core.x,
      originY: core.y,
      sequence: gapSequence,
      direction
    });
    const requestedCount = parameters?.projectileCount
      ?? (viewport.mobileProfile ? 14 : 18);
    const shotCount = Math.max(1, Math.min(24, Math.round(requestedCount)));
    const gapHalfWidth = viewport.mobileProfile ? 0.5 : 0.42;
    const speed = Math.min(7.2, Math.max(3.8, pose.projectileSpeed) * 0.72);
    for (let index = 0; index < shotCount; index += 1) {
      const angle = Math.PI * 2 * index / shotCount;
      const gapDistance = Math.abs(Math.atan2(
        Math.sin(angle - route.angleRadians),
        Math.cos(angle - route.angleRadians)
      ));
      if (gapDistance < gapHalfWidth) continue;
      spawnProjectile(
        state.hazards,
        core,
        angle,
        speed,
        12,
        pose.geometryUncertaintyPixels
      );
    }
    return true;
  }
  if (beat.clip.primitiveId === 'weave-wall') {
    const layout = resolveBossWeaveWallLayout(
      viewport.width,
      viewport.mobileProfile,
      sequence
    );
    const defaultCount = (layout.laneCount - 2) * (viewport.mobileProfile ? 2 : 3);
    const slots = buildBossWeaveWallSlots(
      layout,
      parameters?.projectileCount ?? defaultCount,
      sequence
    );
    const rowSpacing = viewport.mobileProfile ? 38 : 52;
    const size = Math.max(
      12,
      Math.min(viewport.mobileProfile ? 20 : 24, layout.laneWidth * 0.46)
    );
    const speed = Math.min(
      viewport.mobileProfile ? 5.1 : 5.8,
      Math.max(3.8, pose.projectileSpeed * 0.72)
    );
    slots.forEach((slot) => {
      spawnProjectile(
        state.hazards,
        {
          x: slot.x,
          y: getBeatWeaveOriginY(pose, beat) - slot.rowIndex * rowSpacing
        },
        Math.PI / 2,
        speed,
        size,
        pose.geometryUncertaintyPixels
      );
    });
    return true;
  }
  if (beat.clip.primitiveId === 'cross-beam') {
    const core = getBeatCore(pose, beat);
    const halfThickness = 10 + pose.geometryUncertaintyPixels;
    state.hazards.push({
      kind: 'beam',
      axis: 'vertical',
      coordinate: core.x,
      halfThickness,
      // advanceHazards decrements before collision; 27 preserves at least the
      // engine's full 26 damaging frames under either entity-update order.
      life: 27
    }, {
      kind: 'beam',
      axis: 'horizontal',
      coordinate: core.y,
      halfThickness,
      life: 27
    });
    return true;
  }
  return false;
};

const getGatlingActiveEndFrame = (
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => {
  const authoredEndFrame = beat.fireFrame
    + toFrame(beat.clip.durationSeconds, context.fps);
  const nextPresentationFrame = context.beats.reduce((next, candidate) => (
    candidate.warningFrame > beat.fireFrame
      ? Math.min(next, candidate.warningFrame)
      : next
  ), context.recoveryStartFrame ?? Number.POSITIVE_INFINITY);
  return Math.min(authoredEndFrame, nextPresentationFrame);
};

const spawnActiveGatlingPulse = (
  state: SearchState,
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => {
  const model = resolveBossSideBarrageProofModel({
    projectileCount: beat.clip.parameters?.projectileCount,
    projectileSpeed: context.pose.projectileSpeed,
    motionCue: beat.clip.parameters?.motionCue,
    mobileProfile: context.viewport.mobileProfile
  });
  if (model.variant !== 'gatling-barrage') return true;
  const elapsedFrames = state.frame - beat.fireFrame;
  const activeEndFrame = getGatlingActiveEndFrame(beat, context);
  if (
    elapsedFrames < 0
    || state.frame >= activeEndFrame
    || elapsedFrames % model.pulseIntervalFrames !== 0
  ) return true;
  const pulseIndex = Math.floor(elapsedFrames / model.pulseIntervalFrames);
  if (pulseIndex >= model.projectileCount) return true;

  const side = pulseIndex % 2 === 0 ? 'port' : 'starboard';
  const origins = getBeatSockets(context.pose, beat, side);
  const lockedTarget = state.locks[beat.key];
  if (!lockedTarget || origins.length === 0) return false;
  const origin = origins[pulseIndex % origins.length];
  const baseAngle = Math.atan2(
    lockedTarget.y - origin.y,
    lockedTarget.x - origin.x
  );
  const deterministicKick = ((pulseIndex % 5) - 2) * model.spreadRadians;
  spawnProjectile(
    state.hazards,
    origin,
    baseAngle + deterministicKick,
    model.projectileSpeed,
    model.projectileSize,
    context.pose.geometryUncertaintyPixels
  );
  return true;
};

const resolveHeliosProofPhaseIndex = (phaseId: string) => (
  phaseId.includes('overdrive') ? 3 : phaseId.includes('armor-shear') ? 2 : 1
);

const isBeatActionActive = (
  frame: number,
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => frame >= beat.fireFrame
  && frame < beat.fireFrame + toFrame(beat.clip.durationSeconds, context.fps);

const spawnActiveHeliosCrossfirePulse = (
  state: SearchState,
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => {
  if (!isBeatActionActive(state.frame, beat, context)) return true;
  const parameters = beat.clip.parameters;
  const sides = resolveHeliosCrossfireSides(parameters?.side);
  const roundsPerSide = Math.max(3, Math.min(9, Math.round(parameters?.projectileCount ?? 4)));
  const phaseIndex = resolveHeliosProofPhaseIndex(beat.clip.phaseId ?? '');
  const pulse = sampleHeliosCrossfirePulse({
    elapsedFrames: state.frame - beat.fireFrame,
    roundsPerSide,
    sides,
    intervalFrames: phaseIndex >= 3 ? 3 : 4
  });
  if (!pulse?.firing) return true;
  const origins = getBeatSockets(context.pose, beat, pulse.side);
  if (origins.length === 0) return false;
  const origin = origins[Math.min(pulse.sideShotIndex, origins.length - 1)] ?? origins[0];
  const centeredIndex = pulse.sideShotIndex - (roundsPerSide - 1) / 2;
  const speed = Math.min(
    context.viewport.mobileProfile ? 6 : 6.7,
    Math.max(4.5, (Number(context.pose.projectileSpeed) || 6.2) * 0.76)
  );
  spawnProjectile(
    state.hazards,
    origin,
    resolveHeliosCrossfireAngle(pulse.side, sides.length > 1) + centeredIndex * 0.045,
    speed * (1 + Math.abs(centeredIndex) * 0.012),
    context.viewport.mobileProfile ? 10 : 12,
    context.pose.geometryUncertaintyPixels
  );
  return true;
};

const spawnActiveHeliosReactorPulse = (
  state: SearchState,
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => {
  if (!isBeatActionActive(state.frame, beat, context)) return true;
  const parameters = beat.clip.parameters;
  const elapsedFrames = state.frame - beat.fireFrame;
  const sequence = resolveBossPatternSequence(parameters?.sequence, beat.executionIndex);
  const exact = context.pose.beatOrigins?.[beat.key];
  const fallbackCore = getBeatCore(context.pose, beat);
  const phaseIndex = resolveHeliosProofPhaseIndex(beat.clip.phaseId ?? '');
  if (parameters?.motionCue === 'reactor-mines') {
    const formation = resolveHeliosMineFormation({
      sequence,
      count: parameters.projectileCount ?? 3
    });
    const slot = formation.find((candidate) => elapsedFrames === 2 + candidate.delayFrames);
    if (!slot) return true;
    const origin = exact?.coreSamples?.[slot.index] ?? fallbackCore;
    const speed = (context.viewport.mobileProfile ? 1.45 : 1.7) * slot.speedScale;
    const size = context.viewport.mobileProfile ? 24 : 30;
    state.hazards.push({
      kind: 'helios-mine',
      x: origin.x,
      y: origin.y,
      vx: Math.cos(slot.angleRadians) * speed,
      vy: Math.sin(slot.angleRadians) * speed,
      projectileHalfSize: size / 2 + context.pose.geometryUncertaintyPixels,
      explosionHalfSize: (context.viewport.mobileProfile ? 74 : 92) / 2
        + context.pose.geometryUncertaintyPixels,
      ageFrames: 0,
      triggerFrame: -1
    });
    return true;
  }
  const target = state.locks[beat.key];
  if (!target) return false;
  const provisionalCore = exact?.coreSamples?.[0] ?? fallbackCore;
  const targetAngle = Math.atan2(
    target.y - provisionalCore.y,
    target.x - provisionalCore.x
  );
  const fanShot = sampleHeliosReactorFanShot({
    elapsedFrames,
    sequence,
    projectileCount: parameters?.projectileCount ?? 7,
    targetAngleRadians: targetAngle,
    intervalFrames: phaseIndex >= 3 ? 4 : 5
  });
  if (!fanShot?.firing) return true;
  const origin = exact?.coreSamples?.[fanShot.shotIndex] ?? fallbackCore;
  spawnProjectile(
    state.hazards,
    origin,
    fanShot.angleRadians,
    Math.min(context.viewport.mobileProfile ? 5.4 : 6.1, 4.5 + phaseIndex * 0.28),
    context.viewport.mobileProfile ? 11 : 13,
    context.pose.geometryUncertaintyPixels
  );
  return true;
};

const spawnActiveHeliosMeleeSamples = (
  state: SearchState,
  beat: ScheduledAttackBeat,
  context: SimulationContext
) => {
  const exact = context.pose.beatOrigins?.[beat.key];
  if (!exact?.meleeSamples || exact.meleeSamples.length === 0) return true;
  const frameOffset = state.frame - beat.fireFrame;
  const samples = exact.meleeSamples.filter((sample) => sample.frameOffset === frameOffset);
  if (samples.length === 0) return true;
  const radius = getBeatMeleeRadius(context.pose, beat);
  if (!Number.isFinite(radius) || Number(radius) <= 0) return false;
  samples.forEach((sample) => spawnZone(
    state.hazards,
    sample.point,
    Number(radius),
    context.pose.geometryUncertaintyPixels,
    2
  ));
  return true;
};

const collisionClearance = (
  state: SearchState,
  hazard: SafeRouteHazard,
  player: Readonly<BossSafeRoutePlayerProfile>
) => {
  const playerHalfWidth = player.collisionWidth / 2;
  const playerHalfHeight = player.collisionHeight / 2;
  if (hazard.kind === 'beam') {
    return hazard.axis === 'vertical'
      ? Math.abs(state.x - hazard.coordinate) - playerHalfWidth - hazard.halfThickness
      : Math.abs(state.y - hazard.coordinate) - playerHalfHeight - hazard.halfThickness;
  }
  const halfWidth = hazard.kind === 'helios-mine'
    ? hazard.explosionHalfSize
    : hazard.halfWidth;
  const halfHeight = hazard.kind === 'helios-mine'
    ? hazard.explosionHalfSize
    : hazard.halfHeight;
  const gapX = Math.abs(state.x - hazard.x) - playerHalfWidth - halfWidth;
  const gapY = Math.abs(state.y - hazard.y) - playerHalfHeight - halfHeight;
  return Math.max(gapX, gapY);
};

const advanceHazards = (
  state: SearchState,
  context: SimulationContext
) => {
  const retained: SafeRouteHazard[] = [];
  let currentClearance = Number.POSITIVE_INFINITY;
  for (const hazard of state.hazards) {
    if (hazard.kind === 'beam') {
      hazard.life -= 1;
      if (hazard.life <= 0) continue;
    } else if (hazard.kind === 'zone') {
      hazard.life -= 1;
      if (hazard.life <= 0) continue;
    } else if (hazard.kind === 'helios-mine') {
      hazard.ageFrames += 1;
      hazard.x = clamp(
        hazard.x + hazard.vx,
        4 + hazard.projectileHalfSize,
        context.viewport.width - 4 - hazard.projectileHalfSize
      );
      hazard.y = clamp(
        hazard.y + hazard.vy,
        48 + hazard.projectileHalfSize,
        context.viewport.height - 18 - hazard.projectileHalfSize
      );
      let lifecycle = sampleHeliosMineLifecycle({
        ageFrames: hazard.ageFrames,
        triggerFrame: hazard.triggerFrame,
        distanceToPlayer: Math.hypot(state.x - hazard.x, state.y - hazard.y)
      });
      if (lifecycle.shouldTrigger && hazard.triggerFrame < 0) {
        hazard.triggerFrame = hazard.ageFrames;
        lifecycle = sampleHeliosMineLifecycle({
          ageFrames: hazard.ageFrames,
          triggerFrame: hazard.triggerFrame,
          distanceToPlayer: 0
        });
        hazard.vx = 0;
        hazard.vy = 0;
      } else if (lifecycle.stage === 'deploying') {
        hazard.vx *= 0.975;
        hazard.vy *= 0.975;
      } else if (lifecycle.stage === 'armed') {
        hazard.vx = 0;
        hazard.vy = 0;
      }
      if (lifecycle.shouldCleanup) continue;
      if (!lifecycle.damageActive) {
        retained.push(hazard);
        continue;
      }
    } else {
      hazard.x += hazard.vx;
      hazard.y += hazard.vy;
      if (
        hazard.x < -hazard.halfWidth * 2
        || hazard.x > context.viewport.width + hazard.halfWidth * 2
        || hazard.y < -hazard.halfHeight * 2
        || hazard.y > context.viewport.height + hazard.halfHeight * 2
      ) continue;
    }
    const clearance = collisionClearance(state, hazard, context.player);
    if (clearance <= 0) return false;
    currentClearance = Math.min(currentClearance, clearance);
    retained.push(hazard);
  }
  state.hazards = retained;
  state.currentClearance = currentClearance;
  state.minimumClearance = Math.min(state.minimumClearance, currentClearance);
  return true;
};

const simulateFrame = (
  source: SearchState,
  controlIndex: number,
  context: SimulationContext
): SearchState | null => {
  const state: SearchState = {
    ...source,
    frame: source.frame + 1,
    hazards: source.hazards.map(cloneHazard),
    locks: source.locks
  };
  const warningEvents = context.warningEvents.get(state.frame) ?? [];
  if (warningEvents.some((beat) => (
    beat.clip.primitiveId === 'side-barrage'
    || beat.clip.primitiveId === 'paired-cannon-burst'
    || beat.clip.primitiveId === 'reactor-aperture-pattern'
    || (
      beat.clip.primitiveId === 'tracking-pincer-dive'
      && resolveBossPatternSequence(
        beat.clip.parameters?.sequence,
        beat.executionIndex
      ) % 4 === 2
    )
  ))) {
    const locks = { ...state.locks };
    warningEvents.forEach((beat) => {
      if (
        beat.clip.primitiveId === 'side-barrage'
        || beat.clip.primitiveId === 'paired-cannon-burst'
        || beat.clip.primitiveId === 'reactor-aperture-pattern'
        || (
          beat.clip.primitiveId === 'tracking-pincer-dive'
          && resolveBossPatternSequence(
            beat.clip.parameters?.sequence,
            beat.executionIndex
          ) % 4 === 2
        )
      ) {
        locks[beat.key] = { x: state.x, y: state.y };
      }
    });
    state.locks = locks;
  }
  for (const beat of context.fireEvents.get(state.frame) ?? []) {
    if (!spawnBeatHazards(state, beat, context)) return null;
  }
  for (const beat of context.beats) {
    if (
      beat.clip.primitiveId === 'side-barrage'
      && beat.clip.parameters?.motionCue === 'gatling-barrage'
      && !spawnActiveGatlingPulse(state, beat, context)
    ) return null;
    if (
      beat.clip.primitiveId === 'paired-cannon-burst'
      && !spawnActiveHeliosCrossfirePulse(state, beat, context)
    ) return null;
    if (
      beat.clip.primitiveId === 'reactor-aperture-pattern'
      && !spawnActiveHeliosReactorPulse(state, beat, context)
    ) return null;
    if (
      (
        beat.clip.primitiveId === 'articulated-melee-sweep'
        || beat.clip.primitiveId === 'tracking-pincer-dive'
      )
      && !spawnActiveHeliosMeleeSamples(state, beat, context)
    ) return null;
  }

  const control = CONTROLS[controlIndex] ?? CONTROLS[0];
  state.vx = moveToward(
    state.vx,
    control.x * context.player.maximumSpeedPerFrame,
    context.player.accelerationPerFrame
  );
  state.vy = moveToward(
    state.vy,
    control.y * context.player.maximumSpeedPerFrame,
    context.player.accelerationPerFrame
  );
  const halfWidth = context.player.collisionWidth / 2;
  const halfHeight = context.player.collisionHeight / 2;
  state.x = clamp(state.x + state.vx, halfWidth, context.viewport.width - halfWidth);
  state.y = clamp(state.y + state.vy, halfHeight, context.viewport.height - halfHeight);
  return advanceHazards(state, context) ? state : null;
};

const targetForBeat = (
  state: SearchState,
  beat: ScheduledAttackBeat,
  context: SimulationContext
): BossSafeRoutePoint => {
  const sequence = resolveBossPatternSequence(
    beat.clip.parameters?.sequence,
    beat.executionIndex
  );
  if (beat.clip.primitiveId === 'reactor-aperture-pattern') {
    const halfWidth = context.player.collisionWidth / 2;
    const halfHeight = context.player.collisionHeight / 2;
    const routeRatio = sequence % 2 === 0 ? 0.18 : 0.82;
    return {
      x: clamp(context.viewport.width * routeRatio, halfWidth, context.viewport.width - halfWidth),
      y: clamp(context.viewport.height * 0.82, halfHeight, context.viewport.height - halfHeight)
    };
  }
  if (beat.clip.primitiveId === 'gap-ring') {
    const core = getBeatCore(context.pose, beat);
    const gapSequence = sequence;
    return resolveBossGapRoute({
      arenaWidth: context.viewport.width,
      arenaHeight: context.viewport.height,
      originX: core.x,
      originY: core.y,
      sequence: gapSequence,
      direction: resolveBossGapRouteDirection(
        beat.clip.parameters?.rotationDirection,
        gapSequence
      )
    });
  }
  if (beat.clip.primitiveId === 'weave-wall') {
    const layout = resolveBossWeaveWallLayout(
      context.viewport.width,
      context.viewport.mobileProfile,
      sequence
    );
    return { x: layout.safeGapCenterX, y: context.viewport.height * 0.82 };
  }
  if (beat.clip.primitiveId === 'cross-beam') {
    const core = getBeatCore(context.pose, beat);
    const clearance = context.player.collisionWidth / 2
      + 10
      + context.pose.geometryUncertaintyPixels
      + 24;
    const candidates = [
      clamp(core.x - clearance, context.player.collisionWidth / 2, context.viewport.width - context.player.collisionWidth / 2),
      clamp(core.x + clearance, context.player.collisionWidth / 2, context.viewport.width - context.player.collisionWidth / 2)
    ];
    const x = candidates.reduce((best, candidate) => (
      Math.abs(candidate - state.x) < Math.abs(best - state.x) ? candidate : best
    ), candidates[0]);
    return { x, y: context.viewport.height * 0.82 };
  }
  if (
    beat.clip.primitiveId === 'side-barrage'
    || beat.clip.primitiveId === 'paired-cannon-burst'
  ) {
    if (beat.clip.primitiveId === 'paired-cannon-burst') {
      const sides = resolveHeliosCrossfireSides(beat.clip.parameters?.side);
      const halfWidth = context.player.collisionWidth / 2;
      const halfHeight = context.player.collisionHeight / 2;
      const targetX = sides.length > 1
        ? context.viewport.width / 2
        : sides[0] === 'port'
          ? context.viewport.width * 0.82
          : context.viewport.width * 0.18;
      return {
        x: clamp(targetX, halfWidth, context.viewport.width - halfWidth),
        y: clamp(
          context.viewport.height * 0.82,
          halfHeight,
          context.viewport.height - halfHeight
        )
      };
    }
    const side = beat.clip.parameters?.side ?? 'port';
    const lock = state.locks[beat.key] ?? { x: context.viewport.width / 2, y: context.viewport.height * 0.82 };
    const origins = beat.clip.parameters?.motionCue === 'gatling-barrage'
      ? [
          ...getBeatSockets(context.pose, beat, 'port'),
          ...getBeatSockets(context.pose, beat, 'starboard')
        ]
      : getBeatSockets(context.pose, beat, side);
    const averageOrigin = origins.reduce((sum, origin) => ({
      x: sum.x + origin.x / origins.length,
      y: sum.y + origin.y / origins.length
    }), { x: 0, y: 0 });
    const aimX = lock.x - averageOrigin.x;
    const aimY = lock.y - averageOrigin.y;
    const aimLength = Math.max(1, Math.hypot(aimX, aimY));
    const perpendicularX = aimY / aimLength;
    const perpendicularY = -aimX / aimLength;
    const travel = Math.min(220, context.viewport.width * 0.3);
    const halfWidth = context.player.collisionWidth / 2;
    const halfHeight = context.player.collisionHeight / 2;
    const candidates = [-1, 1].map((direction) => ({
      x: clamp(
        lock.x + perpendicularX * travel * direction,
        halfWidth,
        context.viewport.width - halfWidth
      ),
      y: clamp(
        lock.y + perpendicularY * travel * direction,
        halfHeight,
        context.viewport.height - halfHeight
      )
    }));
    // Selecting the nearer perpendicular branch preserves both evasive sides
    // in the beam search instead of assuming a roaming "port" emitter is
    // always left of the player in world space.
    return candidates.reduce((best, candidate) => (
      Math.hypot(candidate.x - state.x, candidate.y - state.y)
        < Math.hypot(best.x - state.x, best.y - state.y)
        ? candidate
        : best
    ), candidates[0]);
  }
  if (
    beat.clip.primitiveId === 'articulated-melee-sweep'
    || beat.clip.primitiveId === 'tracking-pincer-dive'
  ) {
    const exact = context.pose.beatOrigins?.[beat.key];
    const points = [
      ...(exact?.sockets?.port ?? []),
      ...(exact?.sockets?.starboard ?? [])
    ];
    const average = points.length > 0
      ? points.reduce((sum, point) => ({
          x: sum.x + point.x / points.length,
          y: sum.y + point.y / points.length
        }), { x: 0, y: 0 })
      : { x: context.viewport.width / 2, y: context.viewport.height * 0.45 };
    const halfWidth = context.player.collisionWidth / 2;
    const halfHeight = context.player.collisionHeight / 2;
    const candidates = [
      { x: halfWidth + 8, y: clamp(average.y + 120, halfHeight, context.viewport.height - halfHeight) },
      { x: context.viewport.width - halfWidth - 8, y: clamp(average.y + 120, halfHeight, context.viewport.height - halfHeight) }
    ];
    return candidates.reduce((best, candidate) => (
      Math.hypot(candidate.x - state.x, candidate.y - state.y)
        < Math.hypot(best.x - state.x, best.y - state.y)
        ? candidate
        : best
    ), candidates[0]);
  }
  return { x: context.viewport.width / 2, y: context.viewport.height * 0.82 };
};

const heuristicScore = (state: SearchState, context: SimulationContext) => {
  const lockedUpcomingSidePressure = context.beats.find((beat) => (
    (
      beat.clip.primitiveId === 'side-barrage'
      || beat.clip.primitiveId === 'paired-cannon-burst'
      || beat.clip.primitiveId === 'reactor-aperture-pattern'
      || beat.clip.primitiveId === 'tracking-pincer-dive'
    )
    && beat.fireFrame >= state.frame
    && state.locks[beat.key] !== undefined
  ));
  const recentSidePressure = [...context.beats].reverse().find((beat) => (
    (
      beat.clip.primitiveId === 'side-barrage'
      || beat.clip.primitiveId === 'paired-cannon-burst'
      || beat.clip.primitiveId === 'reactor-aperture-pattern'
      || beat.clip.primitiveId === 'tracking-pincer-dive'
    )
    && beat.fireFrame <= state.frame
    && beat.fireFrame + 90 >= state.frame
    && state.locks[beat.key] !== undefined
  ));
  const upcoming = context.beats.find((beat) => beat.fireFrame >= state.frame);
  const mostRecent = [...context.beats].reverse().find((beat) => beat.fireFrame < state.frame);
  // A later warning commits a new aimed fan before the prior fan has fully
  // left the arena. Once that lock exists it must lead the constructive
  // search; following the older fan for its full lifetime prunes the newly
  // telegraphed perpendicular escape even though the player can reach it.
  const currentOrNext = lockedUpcomingSidePressure ?? recentSidePressure ?? upcoming ?? (
    state.hazards.length > 0 ? mostRecent : undefined
  );
  const target = currentOrNext
    ? targetForBeat(state, currentOrNext, context)
    : { x: context.viewport.width / 2, y: context.viewport.height * 0.82 };
  const distance = Math.hypot(target.x - state.x, target.y - state.y);
  const clearance = Number.isFinite(state.currentClearance)
    ? Math.min(160, state.currentClearance)
    : 160;
  const lowerArenaPenalty = Math.abs(state.y - context.viewport.height * 0.82) * 0.04;
  // Clearance leads the search once hazards are live. The authored waypoint
  // remains a guide, but cannot collapse the beam onto one attractive route
  // and discard a wider evasive branch before the projectile fan arrives.
  return -distance * 0.62 + clearance * 1.8 - lowerArenaPenalty;
};

const stateKey = (state: SearchState) => {
  const lockSignature = Object.entries(state.locks)
    .map(([key, point]) => `${key}:${Math.round(point.x / 16)}:${Math.round(point.y / 16)}`)
    .join('|');
  const mineSignature = state.hazards
    .filter((hazard): hazard is MineHazard => hazard.kind === 'helios-mine')
    .map((mine) => (
      `${Math.round(mine.x / 12)}:${Math.round(mine.y / 12)}:${mine.ageFrames}:${mine.triggerFrame}`
    ))
    .join('|');
  return [
    Math.round(state.x / 7),
    Math.round(state.y / 7),
    Math.round(state.vx / 0.45),
    Math.round(state.vy / 0.45),
    lockSignature,
    mineSignature
  ].join(':');
};

const recoverControls = (trace?: TraceNode) => {
  const reversed: Array<{ controlIndex: number; frameCount: number }> = [];
  let current = trace;
  while (current) {
    reversed.push({ controlIndex: current.controlIndex, frameCount: current.frameCount });
    current = current.parent;
  }
  return reversed.reverse();
};

const witnessHash = (points: readonly BossSafeRouteWitnessPoint[]) => {
  let hash = 2166136261;
  for (const point of points) {
    const text = `${point.frame}:${point.x.toFixed(2)}:${point.y.toFixed(2)}:${point.controlX}:${point.controlY};`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const replayWitness = (
  winner: SearchState,
  startFrame: number,
  context: SimulationContext
) => {
  let state: SearchState = {
    frame: startFrame - 1,
    x: winner.initialX,
    y: winner.initialY,
    vx: 0,
    vy: 0,
    hazards: [],
    locks: {},
    minimumClearance: Number.POSITIVE_INFINITY,
    currentClearance: Number.POSITIVE_INFINITY,
    initialX: winner.initialX,
    initialY: winner.initialY
  };
  const points: BossSafeRouteWitnessPoint[] = [{
    frame: state.frame,
    x: state.x,
    y: state.y,
    controlX: 0,
    controlY: 0
  }];
  for (const step of recoverControls(winner.trace)) {
    const control = CONTROLS[step.controlIndex] ?? CONTROLS[0];
    for (let frameIndex = 0; frameIndex < step.frameCount; frameIndex += 1) {
      const next = simulateFrame(state, step.controlIndex, context);
      if (!next) return null;
      state = next;
    }
    points.push({
      frame: state.frame,
      x: state.x,
      y: state.y,
      controlX: control.x,
      controlY: control.y
    });
  }
  return { state, points };
};

const validateGeometry = (
  request: BossSafeRouteProofRequest,
  beats: readonly ScheduledAttackBeat[]
) => {
  const { viewport, pose } = request;
  if (
    !finite(viewport.width)
    || !finite(viewport.height)
    || viewport.width < 160
    || viewport.height < 240
  ) return 'Viewport dimensions must be finite and at least 160x240.';
  if (
    !finite(pose.core.x)
    || !finite(pose.core.y)
    || !finite(pose.weaveOriginY)
    || !finite(pose.projectileSpeed)
    || pose.projectileSpeed <= 0
    || !finite(pose.geometryUncertaintyPixels)
    || pose.geometryUncertaintyPixels < 0
  ) return 'Boss core, weave origin, projectile speed, and uncertainty must be finite.';
  for (const beat of beats) {
    const exact = pose.beatOrigins?.[beat.key];
    if (exact?.core && (!finite(exact.core.x) || !finite(exact.core.y))) {
      return `${beat.key} has a non-finite exact core origin.`;
    }
    if (exact?.coreSamples?.some((sample) => !finite(sample.x) || !finite(sample.y))) {
      return `${beat.key} has a non-finite live reactor origin.`;
    }
    if (exact?.meleeSamples?.some((sample) => (
      !Number.isInteger(sample.frameOffset)
      || sample.frameOffset < 0
      || !finite(sample.point.x)
      || !finite(sample.point.y)
    ))) {
      return `${beat.key} has invalid live melee sample geometry.`;
    }
    if (exact?.weaveOriginY !== undefined && !finite(exact.weaveOriginY)) {
      return `${beat.key} has a non-finite exact weave origin.`;
    }
    if (
      exact?.targetLock
      && (!finite(exact.targetLock.x) || !finite(exact.targetLock.y))
    ) {
      return `${beat.key} has a non-finite target lock.`;
    }
    for (const side of ['port', 'starboard'] as const) {
      const sockets = exact?.sockets?.[side];
      if (sockets?.some((socket) => !finite(socket.x) || !finite(socket.y))) {
        return `${beat.key} has non-finite exact ${side} socket geometry.`;
      }
    }
    if (beat.clip.primitiveId === 'side-barrage') {
      const motionCue = beat.clip.parameters?.motionCue;
      if (
        motionCue !== undefined
        && motionCue !== 'heavy-cannon'
        && motionCue !== 'gatling-barrage'
      ) {
        return `${beat.key} uses unsupported side-barrage motion cue ${motionCue}.`;
      }
      if (motionCue === 'gatling-barrage') {
        const exactPort = exact?.sockets?.port ?? [];
        const exactStarboard = exact?.sockets?.starboard ?? [];
        if (exactPort.length === 0) {
          return `${beat.key} port gatling has no exact warning-owned socket geometry.`;
        }
        if (exactStarboard.length === 0) {
          return `${beat.key} starboard gatling has no exact warning-owned socket geometry.`;
        }
        continue;
      }
      const side = beat.clip.parameters?.side ?? 'port';
      if (getBeatSockets(pose, beat, side).length === 0) {
        return `${side} side-barrage has no anatomy-owned socket geometry.`;
      }
    }
    if (beat.clip.primitiveId === 'paired-cannon-burst') {
      const roundsPerSide = Math.max(
        3,
        Math.min(9, Math.round(beat.clip.parameters?.projectileCount ?? 4))
      );
      for (const side of resolveHeliosCrossfireSides(beat.clip.parameters?.side)) {
        if ((exact?.sockets?.[side] ?? []).length < roundsPerSide) {
          return `${beat.key} ${side} cannon has no exact live socket sample for every sequential round.`;
        }
      }
    }
    if (beat.clip.primitiveId === 'reactor-aperture-pattern') {
      const motionCue = beat.clip.parameters?.motionCue;
      if (motionCue !== 'reactor-fan' && motionCue !== 'reactor-mines') {
        return `${beat.key} uses unsupported Helios reactor motion cue ${motionCue}.`;
      }
      const count = motionCue === 'reactor-mines'
        ? resolveHeliosMineFormation({
            sequence: resolveBossPatternSequence(
              beat.clip.parameters?.sequence,
              beat.executionIndex
            ),
            count: beat.clip.parameters?.projectileCount ?? 3
          }).length
        : Math.max(5, Math.min(11, Math.floor(beat.clip.parameters?.projectileCount ?? 7)));
      if (!exact?.core || (exact.coreSamples?.length ?? 0) < count) {
        return `${beat.key} reactor has no exact live core sample for every sequential emission.`;
      }
      if (!exact.targetLock) {
        return `${beat.key} reactor has no captured player target lock.`;
      }
    }
    if (
      beat.clip.primitiveId === 'articulated-melee-sweep'
      || beat.clip.primitiveId === 'tracking-pincer-dive'
    ) {
      const sequence = resolveBossPatternSequence(
        beat.clip.parameters?.sequence,
        beat.executionIndex
      );
      const pincer = beat.clip.primitiveId === 'tracking-pincer-dive'
        ? sampleHeliosTrackingPincer({ sequence, progress: 0.7 })
        : undefined;
      if (pincer && (pincer.stage === 'rise-open' || pincer.stage === 'track-lock')) {
        continue;
      }
      if (!finite(Number(exact?.meleeRadiusPixels)) || Number(exact?.meleeRadiusPixels) <= 0) {
        return `${beat.key} has no exact positive melee radius.`;
      }
      if ((exact?.meleeSamples?.length ?? 0) > 0) {
        continue;
      }
      const sides = beat.clip.parameters?.side
        ? [beat.clip.parameters.side]
        : ['port', 'starboard'] as const;
      if (sides.some((side) => (exact?.sockets?.[side] ?? []).length === 0)) {
        return `${beat.key} has no exact sampled claw path for every active side.`;
      }
      if (pincer && !exact?.targetLock) {
        return `${beat.key} has no captured pincer target lock.`;
      }
    }
  }
  return null;
};

export const proveBossAttackSafeRoute = (
  request: BossSafeRouteProofRequest
): BossSafeRouteProof => {
  const fps = Math.max(1, Math.round(request.fps ?? 60));
  const schedule = buildSchedule(
    request.timeline,
    request.attackId,
    request.phaseId,
    fps
  );
  if (!schedule.beats || schedule.recoveryEndFrame === undefined) {
    return failure(
      request,
      schedule.reason ?? 'missing-attack',
      schedule.detail ?? 'Attack schedule could not be resolved.'
    );
  }
  const modeledPrimitives = [...new Set(schedule.beats.map((beat) => beat.clip.primitiveId))];
  const unsupported = modeledPrimitives.find((primitiveId) => !SUPPORTED_PRIMITIVES.has(primitiveId));
  if (unsupported) {
    return failure(
      request,
      'unsupported-primitive',
      `${unsupported} has no conservative hazard model; this attack remains unproven.`,
      modeledPrimitives
    );
  }
  const geometryIssue = validateGeometry(request, schedule.beats);
  if (geometryIssue) {
    const invalidViewport = geometryIssue.startsWith('Viewport');
    return failure(
      request,
      invalidViewport ? 'invalid-viewport' : 'missing-pose-geometry',
      geometryIssue,
      modeledPrimitives
    );
  }

  const player = request.player ?? CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER;
  if (
    !finite(player.collisionWidth)
    || !finite(player.collisionHeight)
    || !finite(player.maximumSpeedPerFrame)
    || !finite(player.accelerationPerFrame)
    || player.collisionWidth <= 0
    || player.collisionHeight <= 0
    || player.maximumSpeedPerFrame <= 0
    || player.accelerationPerFrame <= 0
    || player.collisionWidth >= request.viewport.width
    || player.collisionHeight >= request.viewport.height
  ) {
    return failure(
      request,
      'invalid-attack-geometry',
      'The conservative player profile does not fit this viewport.',
      modeledPrimitives
    );
  }

  const context: SimulationContext = {
    viewport: request.viewport,
    pose: request.pose,
    player,
    fps,
    beats: schedule.beats,
    warningEvents: groupEvents(schedule.beats, 'warningFrame'),
    fireEvents: groupEvents(schedule.beats, 'fireFrame'),
    recoveryStartFrame: schedule.recoveryStartFrame
  };
  const startFrame = Math.min(...schedule.beats.map((beat) => beat.warningFrame));
  const baselineClearanceSpeed = Math.max(3.8, request.pose.projectileSpeed * 0.72);
  const minimumHazardSpeed = schedule.beats.reduce((minimum, beat) => {
    if (beat.clip.primitiveId === 'side-barrage') {
      const model = resolveBossSideBarrageProofModel({
        projectileCount: beat.clip.parameters?.projectileCount,
        projectileSpeed: request.pose.projectileSpeed,
        motionCue: beat.clip.parameters?.motionCue,
        mobileProfile: request.viewport.mobileProfile
      });
      return Math.min(minimum, model.projectileSpeed);
    }
    if (beat.clip.primitiveId === 'paired-cannon-burst') {
      return Math.min(minimum, Math.min(
        request.viewport.mobileProfile ? 6 : 6.7,
        Math.max(4.5, (Number(request.pose.projectileSpeed) || 6.2) * 0.76)
      ));
    }
    if (beat.clip.primitiveId === 'reactor-aperture-pattern') {
      const phaseIndex = resolveHeliosProofPhaseIndex(beat.clip.phaseId ?? '');
      if (beat.clip.parameters?.motionCue === 'reactor-fan') {
        return Math.min(
          minimum,
          Math.min(request.viewport.mobileProfile ? 5.4 : 6.1, 4.5 + phaseIndex * 0.28)
        );
      }
    }
    return minimum;
  }, baselineClearanceSpeed);
  const lastDamageEmissionFrame = schedule.beats.reduce((latest, beat) => {
    if (
      beat.clip.primitiveId === 'side-barrage'
      && beat.clip.parameters?.motionCue === 'gatling-barrage'
    ) return Math.max(latest, getGatlingActiveEndFrame(beat, context) - 1);
    if (beat.clip.primitiveId === 'paired-cannon-burst') {
      const phaseIndex = resolveHeliosProofPhaseIndex(beat.clip.phaseId ?? '');
      const cadence = phaseIndex >= 3 ? 3 : 4;
      const sides = resolveHeliosCrossfireSides(beat.clip.parameters?.side);
      const rounds = Math.max(3, Math.min(9, Math.round(
        beat.clip.parameters?.projectileCount ?? 4
      )));
      return Math.max(latest, beat.fireFrame + 2 + (rounds * sides.length - 1) * cadence);
    }
    if (beat.clip.primitiveId === 'reactor-aperture-pattern') {
      const phaseIndex = resolveHeliosProofPhaseIndex(beat.clip.phaseId ?? '');
      if (beat.clip.parameters?.motionCue === 'reactor-mines') {
        const formation = resolveHeliosMineFormation({
          sequence: resolveBossPatternSequence(
            beat.clip.parameters?.sequence,
            beat.executionIndex
          ),
          count: beat.clip.parameters?.projectileCount ?? 3
        });
        const lastDelay = Math.max(...formation.map((slot) => slot.delayFrames));
        // Auto-trigger at age 168; visible damage ends 15 frames later.
        return Math.max(latest, beat.fireFrame + 2 + lastDelay + 168 + 15);
      }
      const count = Math.max(5, Math.min(11, Math.floor(
        beat.clip.parameters?.projectileCount ?? 7
      )));
      const cadence = phaseIndex >= 3 ? 4 : 5;
      return Math.max(latest, beat.fireFrame + 2 + (count - 1) * cadence);
    }
    return Math.max(latest, beat.fireFrame);
  }, 0);
  const proofEndFrame = Math.max(schedule.recoveryEndFrame, lastDamageEmissionFrame);
  const maximumEndFrame = proofEndFrame
    + Math.ceil(request.viewport.height / Math.max(1, minimumHazardSpeed))
    + 40;
  const halfWidth = player.collisionWidth / 2;
  const halfHeight = player.collisionHeight / 2;
  let states: SearchState[] = [0.2, 0.35, 0.5, 0.65, 0.8].flatMap((xRatio) => (
    [0.72, 0.82, 0.9].map((yRatio) => {
      const x = clamp(request.viewport.width * xRatio, halfWidth, request.viewport.width - halfWidth);
      const y = clamp(request.viewport.height * yRatio, halfHeight, request.viewport.height - halfHeight);
      return {
        frame: startFrame - 1,
        x,
        y,
        vx: 0,
        vy: 0,
        hazards: [],
        locks: {},
        minimumClearance: Number.POSITIVE_INFINITY,
        currentClearance: Number.POSITIVE_INFINITY,
        initialX: x,
        initialY: y
      };
    })
  ));
  const breadth = Math.max(16, Math.min(512, Math.floor(request.searchBreadth ?? 72)));
  const controlFrames = Math.max(1, Math.min(8, Math.floor(request.controlFrames ?? 4)));
  let checkedFrames = 0;

  while (states.length > 0 && states[0].frame < maximumEndFrame) {
    const remainingFrames = maximumEndFrame - states[0].frame;
    const stepFrames = Math.min(controlFrames, remainingFrames);
    const candidates: SearchState[] = [];
    for (const state of states) {
      for (let controlIndex = 0; controlIndex < CONTROLS.length; controlIndex += 1) {
        let candidate: SearchState | null = state;
        for (let frameIndex = 0; frameIndex < stepFrames && candidate; frameIndex += 1) {
          candidate = simulateFrame(candidate, controlIndex, context);
        }
        if (!candidate) continue;
        candidate.trace = {
          parent: state.trace,
          controlIndex,
          frameCount: stepFrames
        };
        candidates.push(candidate);
      }
    }
    checkedFrames += stepFrames;
    if (candidates.length === 0) {
      return failure(
        request,
        'search-exhausted',
        `No collision-free constructive route survived through frame ${states[0].frame + stepFrames}; failure is unproven, not proof of impossibility.`,
        modeledPrimitives,
        checkedFrames
      );
    }
    const unique = new Map<string, { state: SearchState; score: number }>();
    candidates.forEach((candidate) => {
      const key = stateKey(candidate);
      const score = heuristicScore(candidate, context);
      const existing = unique.get(key);
      if (!existing || score > existing.score) unique.set(key, { state: candidate, score });
    });
    const ranked = [...unique.values()]
      .sort((left, right) => right.score - left.score);
    const spatialRepresentatives: typeof ranked = [];
    const representedCells = new Set<string>();
    const spatialLimit = Math.max(8, Math.floor(breadth / 2));
    const cellWidth = context.viewport.width / 12;
    const cellHeight = context.viewport.height / 12;
    for (const entry of ranked) {
      const cell = `${Math.floor(entry.state.x / cellWidth)}:${Math.floor(entry.state.y / cellHeight)}`;
      if (representedCells.has(cell)) continue;
      representedCells.add(cell);
      spatialRepresentatives.push(entry);
      if (spatialRepresentatives.length >= spatialLimit) break;
    }
    const representedStates = new Set(spatialRepresentatives.map((entry) => entry.state));
    states = [
      ...spatialRepresentatives,
      ...ranked.filter((entry) => !representedStates.has(entry.state))
    ]
      .slice(0, breadth)
      .map((entry) => entry.state);
    if (
      states[0].frame >= proofEndFrame
      && states.some((state) => state.hazards.length === 0)
    ) {
      states = states.filter((state) => state.hazards.length === 0);
      break;
    }
  }

  const winner = states
    .filter((state) => state.hazards.length === 0)
    .sort((left, right) => right.minimumClearance - left.minimumClearance)[0];
  if (!winner) {
    return failure(
      request,
      'search-exhausted',
      'The bounded search ended before every modeled hazard cleared; this attack remains unproven.',
      modeledPrimitives,
      checkedFrames
    );
  }
  const replay = replayWitness(winner, startFrame, context);
  if (!replay || replay.state.frame !== winner.frame || replay.state.hazards.length !== 0) {
    return failure(
      request,
      'replay-failed',
      'The candidate route did not survive exact deterministic replay.',
      modeledPrimitives,
      checkedFrames
    );
  }
  if (
    !Number.isFinite(replay.state.minimumClearance)
    || replay.state.minimumClearance < MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS
  ) {
    return failure(
      request,
      'insufficient-clearance',
      `The widest deterministic witness retained ${Number.isFinite(replay.state.minimumClearance) ? replay.state.minimumClearance.toFixed(2) : 'no'} px after uncertainty; at least ${MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS} px is required.`,
      modeledPrimitives,
      checkedFrames
    );
  }

  const assumptions = Object.freeze([
    'The attack is tested in isolation; threats not owned by this authored sentence are excluded.',
    'Per-beat origin snapshots are used when supplied; fallback origins remain inside the pose uncertainty envelope.',
    'The player begins at the first witness point with zero velocity and uses baseline keyboard acceleration.',
    'Projectile and beam collision boxes are conservatively inflated; render-only glow is not damaging.',
    `Every proven witness retains at least ${MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS} px after geometry uncertainty.`,
    'A successful witness proves only this phase, viewport, pose, and current primitive geometry.'
  ]);
  const points = Object.freeze(replay.points.map((point) => Object.freeze({ ...point })));
  return {
    status: 'proven',
    reason: 'proven',
    attackId: request.attackId,
    phaseId: request.phaseId,
    viewportId: request.viewport.id,
    checkedFrames,
    modeledPrimitives,
    assumptions,
    detail: 'A concrete baseline-speed route survived an exact second simulation until every modeled hazard cleared.',
    minimumClearancePixels: Number.isFinite(replay.state.minimumClearance)
      ? replay.state.minimumClearance
      : undefined,
    witnessHash: witnessHash(points),
    witness: points
  };
};

export const proveBossAttackOnBenchmarkViewports = ({
  timeline,
  attackId,
  phaseId,
  mobilePose,
  desktopPose,
  player,
  searchBreadth,
  controlFrames
}: {
  readonly timeline: Readonly<BossTimelineConfig>;
  readonly attackId: string;
  readonly phaseId: string;
  readonly mobilePose: Readonly<BossSafeRoutePose>;
  readonly desktopPose: Readonly<BossSafeRoutePose>;
  readonly player?: Readonly<BossSafeRoutePlayerProfile>;
  readonly searchBreadth?: number;
  readonly controlFrames?: number;
}): BossSafeRouteBenchmarkProof => {
  const mobile = proveBossAttackSafeRoute({
    timeline,
    attackId,
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile,
    pose: mobilePose,
    player,
    searchBreadth,
    controlFrames
  });
  const desktop = proveBossAttackSafeRoute({
    timeline,
    attackId,
    phaseId,
    viewport: BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.desktop,
    pose: desktopPose,
    player,
    searchBreadth,
    controlFrames
  });
  return {
    status: mobile.status === 'proven' && desktop.status === 'proven'
      ? 'proven'
      : 'unproven',
    results: { mobile, desktop }
  };
};
