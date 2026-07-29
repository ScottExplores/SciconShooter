import {
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
  CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER,
  MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
  type BossSafeRoutePlayerProfile,
  type BossSafeRoutePoint,
  type BossSafeRouteViewport
} from './BossSafeRouteProof';
import {
  FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS,
  FRONTIER_CROWNCLAW_CRITICAL_BEAM_SWEEP_HALF_ANGLE_RADIANS,
  resolveFrontierReactorBeamAngles,
  resolveFrontierReactorBeamPlan,
  sampleFrontierCrownReactorBeam
} from './FrontierCrownclawRuntime';

export {
  FRONTIER_CROWNCLAW_CRITICAL_BEAM_CORRIDOR_HALF_ANGLE_RADIANS,
  FRONTIER_CROWNCLAW_CRITICAL_BEAM_SWEEP_HALF_ANGLE_RADIANS
};

/**
 * Frontier Crownclaw's proof geometry is intentionally boss-owned. It is a
 * conservative deterministic geometry model that shares the runtime's pure
 * choreography samplers while approximating registered-rig sockets. Exact
 * GameEngine timing, live sockets, and collision are verified separately by
 * the canonical preview integration tests.
 */

export const FRONTIER_CROWNCLAW_SAFE_ROUTE_FPS = 60;
export const FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS = 3;
export const FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED = 0x43c0a11;
export const FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS = Object.freeze([
  FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED,
  FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED + 1
]);
export const FRONTIER_CROWNCLAW_DEFAULT_SANDBOX_ROUTE_PLAYER = Object.freeze({
  ...CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER,
  maximumSpeedPerFrame: 4,
  accelerationPerFrame: 0.425
});

export const FRONTIER_CROWNCLAW_PHASE_IDS = Object.freeze({
  bastion: 'bastion-cross-link',
  critical: 'critical-cross-link'
} as const);

export type FrontierCrownclawPhaseId = (
  typeof FRONTIER_CROWNCLAW_PHASE_IDS[keyof typeof FRONTIER_CROWNCLAW_PHASE_IDS]
);

export const FRONTIER_CROWNCLAW_ATTACK_IDS = Object.freeze({
  harpoon: 'chainclaw-harpoon',
  reactorBeam: 'crown-reactor-beam',
  crabwalkBarrage: 'bastion-crabwalk-barrage',
  crossLink: 'crown-cross-link'
} as const);

export type FrontierCrownclawAttackId = (
  typeof FRONTIER_CROWNCLAW_ATTACK_IDS[keyof typeof FRONTIER_CROWNCLAW_ATTACK_IDS]
);

export type FrontierCrownclawOperationalClawSide = 'port' | 'starboard';

const FRONTIER_CROWNCLAW_OPERATIONAL_CLAW_SIDES = Object.freeze([
  'port',
  'starboard'
] as const);

export interface FrontierCrownclawComponentFallbackResolution {
  readonly requestedAttackId: FrontierCrownclawAttackId;
  readonly resolvedAttackId: FrontierCrownclawAttackId;
  readonly operationalClawSides: readonly FrontierCrownclawOperationalClawSide[];
  readonly sequence: number;
}

export const resolveFrontierCrownclawSafeRouteFallback = ({
  attackId,
  operationalClawSides,
  sequence
}: Readonly<{
  attackId: FrontierCrownclawAttackId;
  operationalClawSides?: readonly FrontierCrownclawOperationalClawSide[];
  sequence?: number;
}>): FrontierCrownclawComponentFallbackResolution => {
  const normalizedSides = Object.freeze(
    FRONTIER_CROWNCLAW_OPERATIONAL_CLAW_SIDES.filter((side) => (
      operationalClawSides === undefined || operationalClawSides.includes(side)
    ))
  );
  const normalizedSequence = Math.max(0, Math.floor(Number(sequence) || 0));
  const clawOwnedAttack = attackId === FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon
    || attackId === FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink;
  const resolvedAttackId = clawOwnedAttack && normalizedSides.length === 0
    ? normalizedSequence % 2 === 0
      ? FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam
      : FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage
    : attackId;
  return Object.freeze({
    requestedAttackId: attackId,
    resolvedAttackId,
    operationalClawSides: clawOwnedAttack
      ? normalizedSides
      : Object.freeze([]),
    sequence: normalizedSequence
  });
};

export const FRONTIER_CROWNCLAW_BENCHMARK_VIEWPORTS = (
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS
);

export type FrontierCrownclawHazardKind =
  | 'boss-hull'
  | 'claw-head'
  | 'tensioned-chain'
  | 'reactor-beam'
  | 'barrage-bolt';

interface FrontierCrownclawHazardBase {
  readonly id: string;
  readonly kind: FrontierCrownclawHazardKind;
  /** Visible source mechanism used by the runtime and evidence tooling. */
  readonly sourceSocket: string;
  readonly geometryUncertaintyPixels: number;
}

export interface FrontierCrownclawCircleHazard extends FrontierCrownclawHazardBase {
  readonly shape: 'circle';
  readonly center: BossSafeRoutePoint;
  readonly radius: number;
}

export interface FrontierCrownclawCapsuleHazard extends FrontierCrownclawHazardBase {
  readonly shape: 'capsule';
  readonly start: BossSafeRoutePoint;
  readonly end: BossSafeRoutePoint;
  readonly radius: number;
}

export interface FrontierCrownclawOrientedBoxHazard extends FrontierCrownclawHazardBase {
  readonly shape: 'oriented-box';
  readonly center: BossSafeRoutePoint;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly angleRadians: number;
}

export type FrontierCrownclawHazard =
  | FrontierCrownclawCircleHazard
  | FrontierCrownclawCapsuleHazard
  | FrontierCrownclawOrientedBoxHazard;

export interface FrontierCrownclawAttackGeometryFrame {
  readonly attackId: FrontierCrownclawAttackId;
  readonly requestedAttackId: FrontierCrownclawAttackId;
  readonly resolvedAttackId: FrontierCrownclawAttackId;
  readonly phaseId: FrontierCrownclawPhaseId;
  readonly seed: number;
  readonly operationalClawSides: readonly FrontierCrownclawOperationalClawSide[];
  readonly sequence: number;
  readonly frame: number;
  readonly durationFrames: number;
  readonly bossCenter: BossSafeRoutePoint;
  readonly coreSocket: BossSafeRoutePoint;
  readonly chainSockets: Readonly<{
    port: BossSafeRoutePoint;
    starboard: BossSafeRoutePoint;
  }>;
  readonly rearSockets: Readonly<{
    port: BossSafeRoutePoint;
    starboard: BossSafeRoutePoint;
  }>;
  readonly hazards: readonly FrontierCrownclawHazard[];
  /** Authored center of the readable opening, used to construct a witness. */
  readonly routeTarget: BossSafeRoutePoint;
}

export interface FrontierCrownclawRouteWitnessPoint extends BossSafeRoutePoint {
  readonly frame: number;
  readonly vx: number;
  readonly vy: number;
  readonly routeTargetX: number;
  readonly routeTargetY: number;
}

export type FrontierCrownclawSafeRouteFailureReason =
  | 'proven'
  | 'invalid-viewport'
  | 'unsupported-phase'
  | 'route-collision'
  | 'insufficient-clearance';

export interface FrontierCrownclawSafeRouteProof {
  readonly status: 'proven' | 'unproven';
  readonly reason: FrontierCrownclawSafeRouteFailureReason;
  readonly attackId: FrontierCrownclawAttackId;
  readonly requestedAttackId: FrontierCrownclawAttackId;
  readonly resolvedAttackId: FrontierCrownclawAttackId;
  readonly phaseId: FrontierCrownclawPhaseId;
  readonly viewportId: string;
  readonly seed: number;
  readonly operationalClawSides: readonly FrontierCrownclawOperationalClawSide[];
  readonly sequence: number;
  readonly checkedFrames: number;
  readonly geometryUncertaintyPixels: number;
  readonly requiredClearancePixels: number;
  readonly minimumClearancePixels: number;
  readonly configurationHash: string;
  readonly routeHash?: string;
  readonly witness?: readonly FrontierCrownclawRouteWitnessPoint[];
  readonly detail: string;
}

export interface FrontierCrownclawSafeRouteProofRequest {
  readonly attackId: FrontierCrownclawAttackId;
  readonly phaseId: FrontierCrownclawPhaseId;
  readonly viewport: Readonly<BossSafeRouteViewport>;
  readonly seed?: number;
  readonly operationalClawSides?: readonly FrontierCrownclawOperationalClawSide[];
  readonly sequence?: number;
  readonly player?: Readonly<BossSafeRoutePlayerProfile>;
  readonly geometryUncertaintyPixels?: number;
}

export interface FrontierCrownclawGeometryRequest {
  readonly attackId: FrontierCrownclawAttackId;
  readonly phaseId: FrontierCrownclawPhaseId;
  readonly viewport: Readonly<BossSafeRouteViewport>;
  readonly seed: number;
  readonly operationalClawSides?: readonly FrontierCrownclawOperationalClawSide[];
  readonly sequence?: number;
  readonly frame: number;
  readonly geometryUncertaintyPixels: number;
}

interface FrontierCrownclawMetrics {
  readonly bodyRadius: number;
  readonly bossY: number;
  readonly chainSocketOffsetX: number;
  readonly chainSocketOffsetY: number;
  readonly rearSocketOffsetX: number;
  readonly rearSocketOffsetY: number;
  readonly clawHalfWidth: number;
  readonly clawHalfHeight: number;
  readonly chainRadius: number;
  readonly projectileRadius: number;
}

interface HarpoonStroke {
  readonly side: 'port' | 'starboard';
  readonly startFrame: number;
  readonly shallow: boolean;
}

interface CrabwalkVolley {
  readonly frame: number;
  readonly gapX: number;
  readonly index: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const lerp = (start: number, end: number, amount: number) => (
  start + (end - start) * clamp(amount, 0, 1)
);

const smoothstep = (amount: number) => {
  const clamped = clamp(amount, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
};

const approach = (value: number, target: number, maximumDelta: number) => {
  if (value < target) return Math.min(value + maximumDelta, target);
  if (value > target) return Math.max(value - maximumDelta, target);
  return value;
};

const point = (x: number, y: number): BossSafeRoutePoint => ({ x, y });

const addPoint = (
  left: Readonly<BossSafeRoutePoint>,
  right: Readonly<BossSafeRoutePoint>
): BossSafeRoutePoint => point(left.x + right.x, left.y + right.y);

const interpolatePoint = (
  start: Readonly<BossSafeRoutePoint>,
  end: Readonly<BossSafeRoutePoint>,
  amount: number
): BossSafeRoutePoint => point(
  lerp(start.x, end.x, amount),
  lerp(start.y, end.y, amount)
);

const magnitude = (x: number, y: number) => Math.hypot(x, y);

const normalizeSeed = (seed: number) => (Math.floor(seed) >>> 0);

const fnv1a = (source: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const metricsFor = (
  viewport: Readonly<BossSafeRouteViewport>
): FrontierCrownclawMetrics => {
  const mobile = viewport.mobileProfile;
  return {
    bodyRadius: mobile ? 62 : 76,
    bossY: viewport.height * (mobile ? 0.23 : 0.22),
    chainSocketOffsetX: mobile ? 64 : 98,
    chainSocketOffsetY: mobile ? 13 : 16,
    rearSocketOffsetX: mobile ? 49 : 78,
    rearSocketOffsetY: mobile ? 29 : 34,
    clawHalfWidth: 54,
    clawHalfHeight: 35,
    chainRadius: 6.5,
    projectileRadius: mobile ? 6.5 : 7.5
  };
};

const durationFor = (
  attackId: FrontierCrownclawAttackId,
  phaseId: FrontierCrownclawPhaseId
) => {
  const critical = phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical;
  switch (attackId) {
    case FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon:
      return critical ? 450 : 480;
    case FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam:
      return 360;
    case FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage:
      return critical ? 430 : 360;
    case FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink:
      return 420;
  }
};

const sampleKeyframedOffset = (
  frame: number,
  keyframes: readonly Readonly<{ frame: number; x: number }>[]
) => {
  if (frame <= keyframes[0].frame) return keyframes[0].x;
  for (let index = 1; index < keyframes.length; index += 1) {
    const previous = keyframes[index - 1];
    const next = keyframes[index];
    if (frame <= next.frame) {
      return lerp(
        previous.x,
        next.x,
        smoothstep((frame - previous.frame) / Math.max(1, next.frame - previous.frame))
      );
    }
  }
  return keyframes[keyframes.length - 1].x;
};

const sampleCrabwalkOffset = (
  viewport: Readonly<BossSafeRouteViewport>,
  phaseId: FrontierCrownclawPhaseId,
  seed: number,
  frame: number
) => {
  const critical = phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical;
  const direction = (normalizeSeed(seed) & 1) === 0 ? -1 : 1;
  const amplitude = viewport.mobileProfile
    ? (critical ? 92 : 78)
    : (critical ? 230 : 190);
  const authored = critical
    ? [
        { frame: 0, x: 0 },
        { frame: 62, x: direction * amplitude },
        { frame: 148, x: -direction * amplitude },
        { frame: 236, x: direction * amplitude * 0.82 },
        { frame: 326, x: -direction * amplitude * 0.76 },
        { frame: 410, x: 0 }
      ]
    : [
        { frame: 0, x: 0 },
        { frame: 72, x: direction * amplitude },
        { frame: 170, x: -direction * amplitude },
        { frame: 270, x: direction * amplitude * 0.75 },
        { frame: 345, x: 0 }
      ];
  return sampleKeyframedOffset(frame, authored);
};

const sampleBossCenter = (
  request: Readonly<FrontierCrownclawGeometryRequest>,
  metrics: Readonly<FrontierCrownclawMetrics>
) => {
  const horizontalOffset = request.attackId === FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage
    ? sampleCrabwalkOffset(request.viewport, request.phaseId, request.seed, request.frame)
    : 0;
  const braceAmount = request.attackId === FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink
    ? smoothstep(Math.min(request.frame, 50) / 50)
    : 0;
  return point(
    request.viewport.width / 2 + horizontalOffset,
    metrics.bossY + braceAmount * 4
  );
};

const sampleSockets = (
  center: Readonly<BossSafeRoutePoint>,
  metrics: Readonly<FrontierCrownclawMetrics>
) => ({
  coreSocket: point(center.x, center.y + 4),
  chainSockets: {
    port: point(
      center.x - metrics.chainSocketOffsetX,
      center.y + metrics.chainSocketOffsetY
    ),
    starboard: point(
      center.x + metrics.chainSocketOffsetX,
      center.y + metrics.chainSocketOffsetY
    )
  },
  rearSockets: {
    port: point(
      center.x - metrics.rearSocketOffsetX,
      center.y + metrics.rearSocketOffsetY
    ),
    starboard: point(
      center.x + metrics.rearSocketOffsetX,
      center.y + metrics.rearSocketOffsetY
    )
  }
});

const circleHazard = ({
  id,
  kind,
  sourceSocket,
  center,
  radius,
  geometryUncertaintyPixels
}: Omit<FrontierCrownclawCircleHazard, 'shape'>): FrontierCrownclawCircleHazard => ({
  id,
  kind,
  sourceSocket,
  shape: 'circle',
  center,
  radius,
  geometryUncertaintyPixels
});

const capsuleHazard = ({
  id,
  kind,
  sourceSocket,
  start,
  end,
  radius,
  geometryUncertaintyPixels
}: Omit<FrontierCrownclawCapsuleHazard, 'shape'>): FrontierCrownclawCapsuleHazard => ({
  id,
  kind,
  sourceSocket,
  shape: 'capsule',
  start,
  end,
  radius,
  geometryUncertaintyPixels
});

const orientedBoxHazard = ({
  id,
  kind,
  sourceSocket,
  center,
  halfWidth,
  halfHeight,
  angleRadians,
  geometryUncertaintyPixels
}: Omit<FrontierCrownclawOrientedBoxHazard, 'shape'>): FrontierCrownclawOrientedBoxHazard => ({
  id,
  kind,
  sourceSocket,
  shape: 'oriented-box',
  center,
  halfWidth,
  halfHeight,
  angleRadians,
  geometryUncertaintyPixels
});

const harpoonStrokes = (
  phaseId: FrontierCrownclawPhaseId,
  seed: number
): readonly HarpoonStroke[] => {
  const portFirst = (normalizeSeed(seed) & 1) === 0;
  const first: HarpoonStroke['side'] = portFirst ? 'port' : 'starboard';
  const second: HarpoonStroke['side'] = portFirst ? 'starboard' : 'port';
  return phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical
    ? [
        { side: first, startFrame: 55, shallow: true },
        { side: second, startFrame: 240, shallow: false }
      ]
    : [
        { side: first, startFrame: 60, shallow: true },
        { side: second, startFrame: 280, shallow: false }
      ];
};

const sampleHarpoonHead = ({
  stroke,
  frame,
  socket,
  viewport,
  critical
}: {
  readonly stroke: Readonly<HarpoonStroke>;
  readonly frame: number;
  readonly socket: Readonly<BossSafeRoutePoint>;
  readonly viewport: Readonly<BossSafeRouteViewport>;
  readonly critical: boolean;
}): { readonly point: BossSafeRoutePoint; readonly damagingClaw: boolean; readonly damagingChain: boolean } | undefined => {
  const local = frame - stroke.startFrame;
  if (local < 0 || local > 150) return undefined;
  const sideDirection = stroke.side === 'port' ? -1 : 1;
  const target = point(
    viewport.width * (
      stroke.side === 'port'
        ? (stroke.shallow ? 0.29 : critical ? 0.17 : 0.2)
        : (stroke.shallow ? 0.71 : critical ? 0.83 : 0.8)
    ),
    viewport.height * (stroke.shallow ? 0.82 : critical ? 0.87 : 0.85)
  );
  const sweepDistance = viewport.width * (critical ? 0.055 : 0.04) * sideDirection;
  let head: BossSafeRoutePoint;
  if (local <= 42) {
    head = interpolatePoint(socket, target, smoothstep(local / 42));
  } else if (local <= 82) {
    const tension = smoothstep((local - 42) / 40);
    head = point(
      target.x + sweepDistance * Math.sin(tension * Math.PI),
      target.y + Math.sin(tension * Math.PI) * viewport.height * 0.012
    );
  } else {
    const sweptTarget = point(target.x, target.y);
    head = interpolatePoint(sweptTarget, socket, smoothstep((local - 82) / 68));
  }
  return {
    point: head,
    damagingClaw: local >= 22 && local <= 104,
    damagingChain: local >= 42 && local <= 104
  };
};

const safeSideFor = (
  side: HarpoonStroke['side'],
  viewport: Readonly<BossSafeRouteViewport>
) => (side === 'port' ? viewport.width * 0.78 : viewport.width * 0.22);

const sampleHarpoonGeometry = (
  request: Readonly<FrontierCrownclawGeometryRequest>,
  metrics: Readonly<FrontierCrownclawMetrics>,
  chainSockets: Readonly<{ port: BossSafeRoutePoint; starboard: BossSafeRoutePoint }>
) => {
  const critical = request.phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical;
  const authoredStrokes = harpoonStrokes(request.phaseId, request.seed);
  const operationalSides = request.operationalClawSides
    ?? FRONTIER_CROWNCLAW_OPERATIONAL_CLAW_SIDES;
  // GameEngine redirects every authored claw beat to the only surviving side.
  // Preserve both beats here instead of merely deleting the destroyed side's
  // stroke, otherwise the fallback proof would under-model the live sentence.
  const strokes = operationalSides.length === 1
    ? authoredStrokes.map((stroke) => ({
        ...stroke,
        side: operationalSides[0]
      }))
    : authoredStrokes.filter((stroke) => operationalSides.includes(stroke.side));
  const hazards: FrontierCrownclawHazard[] = [];
  for (const [index, stroke] of strokes.entries()) {
    const socket = chainSockets[stroke.side];
    const sampled = sampleHarpoonHead({
      stroke,
      frame: request.frame,
      socket,
      viewport: request.viewport,
      critical
    });
    if (!sampled) continue;
    if (sampled.damagingClaw) {
      hazards.push(orientedBoxHazard({
        id: `harpoon-${index}-${stroke.side}-claw`,
        kind: 'claw-head',
        sourceSocket: `${stroke.side}-primary-claw`,
        center: sampled.point,
        halfWidth: metrics.clawHalfWidth,
        halfHeight: metrics.clawHalfHeight,
        angleRadians: Math.atan2(
          sampled.point.y - socket.y,
          sampled.point.x - socket.x
        ),
        geometryUncertaintyPixels: request.geometryUncertaintyPixels
      }));
    }
    if (sampled.damagingChain) {
      hazards.push(capsuleHazard({
        id: `harpoon-${index}-${stroke.side}-chain`,
        kind: 'tensioned-chain',
        sourceSocket: `${stroke.side}-chain-spool`,
        start: socket,
        end: sampled.point,
        radius: metrics.chainRadius,
        geometryUncertaintyPixels: request.geometryUncertaintyPixels
      }));
    }
  }

  const firstStroke = strokes[0] ?? authoredStrokes[0];
  const secondStroke = strokes[1] ?? firstStroke;
  const secondPreparationFrame = secondStroke.startFrame - 90;
  const selectedStroke = request.frame < secondPreparationFrame ? firstStroke : secondStroke;
  return {
    hazards,
    routeTarget: point(
      safeSideFor(selectedStroke.side, request.viewport),
      request.viewport.height * 0.84
    )
  };
};

const beamCapsule = ({
  request,
  origin,
  angle,
  lengthScale,
  radius,
  id
}: {
  readonly request: Readonly<FrontierCrownclawGeometryRequest>;
  readonly origin: Readonly<BossSafeRoutePoint>;
  readonly angle: number;
  readonly lengthScale: number;
  readonly radius: number;
  readonly id: string;
}): FrontierCrownclawCapsuleHazard => {
  const length = request.viewport.height * lengthScale;
  return capsuleHazard({
    id,
    kind: 'reactor-beam',
    sourceSocket: 'crown-reactor-aperture',
    start: origin,
    end: point(
      origin.x + Math.sin(angle) * length,
      origin.y + Math.cos(angle) * length
    ),
    radius,
    geometryUncertaintyPixels: request.geometryUncertaintyPixels
  });
};

const sampleCriticalReactorBeamGeometry = (
  request: Readonly<FrontierCrownclawGeometryRequest>,
  coreSocket: Readonly<BossSafeRoutePoint>
) => {
  const sequenceOffset = Math.max(0, Math.floor(Number(request.sequence) || 0)) * 2;
  const windows = [
    {
      id: 'reactor-primary-sweep',
      fireStartFrame: 72,
      durationFrames: 108,
      sequence: 22 + sequenceOffset
    },
    {
      id: 'reactor-controlled-reversal',
      fireStartFrame: 249,
      durationFrames: 93,
      sequence: 23 + sequenceOffset
    }
  ].map((window) => {
    const plan = resolveFrontierReactorBeamPlan({
      seedKey: 'frontier-crownclaw',
      sequence: window.sequence,
      phaseIndex: 2,
      lockedTargetAngleRadians: Math.PI / 2
    });
    const progress = clamp(
      (request.frame - window.fireStartFrame) / window.durationFrames,
      0,
      1
    );
    return {
      ...window,
      plan,
      sample: sampleFrontierCrownReactorBeam({
        stage: 'fire',
        progress,
        plan
      })
    };
  });
  const firstWindow = windows[0];
  const secondWindow = windows[1];
  const firstEndFrame = firstWindow.fireStartFrame + firstWindow.durationFrames;
  const secondEndFrame = secondWindow.fireStartFrame + secondWindow.durationFrames;
  const activeWindow = windows.find((window) => (
    request.frame >= window.fireStartFrame
      && request.frame <= window.fireStartFrame + window.durationFrames
  ));
  const activeCorridorAngle = request.frame < firstWindow.fireStartFrame
    ? firstWindow.plan.startAngleRadians
    : request.frame <= firstEndFrame
      ? firstWindow.sample.primaryAngleRadians
      : request.frame < secondWindow.fireStartFrame
        ? lerp(
            firstWindow.plan.endAngleRadians,
            secondWindow.plan.startAngleRadians,
            smoothstep(
              (request.frame - firstEndFrame)
                / (secondWindow.fireStartFrame - firstEndFrame)
            )
          )
        : request.frame <= secondEndFrame
          ? secondWindow.sample.primaryAngleRadians
          : secondWindow.plan.endAngleRadians;
  const routeCorridorAngle = activeWindow?.sample.damaging
    ? sampleFrontierCrownReactorBeam({
        stage: 'fire',
        progress: clamp(
          (
            request.frame
              + 40
              - activeWindow.fireStartFrame
          ) / activeWindow.durationFrames,
          0,
          1
        ),
        plan: activeWindow.plan
      }).primaryAngleRadians
    : activeCorridorAngle;
  const hazards: FrontierCrownclawHazard[] = [];
  if (activeWindow?.sample.damaging) {
    activeWindow.sample.beamAnglesRadians.forEach((beamAngle, index) => {
      hazards.push(beamCapsule({
        request,
        origin: coreSocket,
        angle: Math.PI / 2 - beamAngle,
        lengthScale: Math.hypot(request.viewport.width, request.viewport.height)
          / request.viewport.height * 1.15,
        radius: request.viewport.mobileProfile ? 10.5 : 12,
        id: `${activeWindow.id}-${index === 0 ? 'port' : 'starboard'}`
      }));
    });
  }

  const routeY = request.viewport.height * (request.viewport.mobileProfile ? 0.48 : 0.58);
  const activePlan = activeWindow?.plan
    ?? (request.frame < secondWindow.fireStartFrame
      ? firstWindow.plan
      : secondWindow.plan);
  const routeIntersections = resolveFrontierReactorBeamAngles(
    routeCorridorAngle,
    activePlan
  )
    .map((beamAngle) => {
      const proofAngle = Math.PI / 2 - beamAngle;
      return coreSocket.x
        + Math.tan(proofAngle) * (routeY - coreSocket.y);
    })
    .sort((left, right) => left - right);
  const corridorCenterX = (
    routeIntersections[0] + routeIntersections[routeIntersections.length - 1]
  ) / 2;
  const leftRouteX = request.viewport.width * 0.08;
  const rightRouteX = request.viewport.width * 0.92;
  const corridorEntryMinimumX = request.viewport.width * 0.12;
  const corridorEntryMaximumX = request.viewport.width * 0.88;
  const routeTargetX = corridorCenterX > corridorEntryMaximumX
    ? rightRouteX
    : corridorCenterX < corridorEntryMinimumX
      ? leftRouteX
      : corridorCenterX;
  return {
    hazards,
    routeTarget: point(
      routeTargetX,
      routeY
    )
  };
};

const sampleReactorBeamGeometry = (
  request: Readonly<FrontierCrownclawGeometryRequest>,
  coreSocket: Readonly<BossSafeRoutePoint>
) => {
  const critical = request.phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical;
  if (critical) {
    return sampleCriticalReactorBeamGeometry(request, coreSocket);
  }
  const direction = (normalizeSeed(request.seed) & 1) === 0 ? 1 : -1;
  const hazards: FrontierCrownclawHazard[] = [];
  const firstStart = 130;
  const firstEnd = 245;
  if (request.frame >= 80 && request.frame < 98) {
    hazards.push(beamCapsule({
      request,
      origin: coreSocket,
      angle: 0,
      lengthScale: 0.5,
      radius: request.viewport.mobileProfile ? 7 : 8,
      id: 'reactor-rule-pulse'
    }));
  }

  if (request.frame >= firstStart && request.frame <= firstEnd) {
    const progress = smoothstep((request.frame - firstStart) / (firstEnd - firstStart));
    const halfSweep = 0.5;
    const angle = direction * lerp(-halfSweep, halfSweep, progress);
    [angle].forEach((beamAngle) => {
      hazards.push(beamCapsule({
        request,
        origin: coreSocket,
        angle: beamAngle,
        lengthScale: 0.58,
        radius: request.viewport.mobileProfile ? 10.5 : 12,
        id: 'reactor-primary-sweep'
      }));
    });
  }

  const routeY = request.viewport.height * 0.9;
  return {
    hazards,
    routeTarget: point(
      request.viewport.width / 2,
      routeY
    )
  };
};

const crabwalkVolleys = (
  request: Readonly<FrontierCrownclawGeometryRequest>
): readonly CrabwalkVolley[] => {
  const critical = request.phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical;
  const mirrored = (normalizeSeed(request.seed) & 1) === 1;
  const normalizedGaps = critical
    ? [0.5, 0.36, 0.62, 0.42, 0.58]
    : [0.5, 0.38, 0.62, 0.46];
  const frames = critical ? [62, 134, 206, 278, 350] : [72, 148, 224, 296];
  return frames.map((frame, index) => {
    const authored = normalizedGaps[index];
    const normalized = mirrored ? 1 - authored : authored;
    return {
      frame,
      gapX: request.viewport.width * normalized,
      index
    };
  });
};

const sampleBarrageProjectiles = ({
  request,
  metrics,
  volley
}: {
  readonly request: Readonly<FrontierCrownclawGeometryRequest>;
  readonly metrics: Readonly<FrontierCrownclawMetrics>;
  readonly volley: Readonly<CrabwalkVolley>;
}) => {
  const age = request.frame - volley.frame;
  if (age < 0 || age > 190) return [];
  const spawnBossCenter = point(
    request.viewport.width / 2 + sampleCrabwalkOffset(
      request.viewport,
      request.phaseId,
      request.seed,
      volley.frame
    ),
    metrics.bossY
  );
  const spawnSockets = sampleSockets(spawnBossCenter, metrics).rearSockets;
  const targetCount = request.viewport.mobileProfile ? 9 : 13;
  const margin = request.viewport.mobileProfile ? 26 : 64;
  // Includes the 31.72 px conservative player radius, bolt radius, the
  // standard 3 px uncertainty, and the six-pixel acceptance reserve even
  // while the fan is still converging from its live rear-shell socket.
  const gapHalfWidth = request.viewport.mobileProfile ? 82 : 170;
  const projectileSpeed = request.viewport.mobileProfile ? 5.25 : 5.7;
  const targetY = request.viewport.height + 54;
  const hazards: FrontierCrownclawCircleHazard[] = [];
  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const targetX = lerp(margin, request.viewport.width - margin, targetIndex / (targetCount - 1));
    if (Math.abs(targetX - volley.gapX) < gapHalfWidth) continue;
    // The rear appendages author two outside fans around one promised opening.
    // Crossing emitters here would silently close that opening halfway down the
    // arena, so each side owns the targets on its side of the telegraphed gap.
    const side = targetX < volley.gapX ? 'port' : 'starboard';
    const origin = spawnSockets[side];
    const deltaX = targetX - origin.x;
    const deltaY = targetY - origin.y;
    const distance = Math.max(1, magnitude(deltaX, deltaY));
    const center = point(
      origin.x + (deltaX / distance) * projectileSpeed * age,
      origin.y + (deltaY / distance) * projectileSpeed * age
    );
    if (
      center.x < -metrics.projectileRadius * 2
      || center.x > request.viewport.width + metrics.projectileRadius * 2
      || center.y > request.viewport.height + metrics.projectileRadius * 2
    ) {
      continue;
    }
    hazards.push(circleHazard({
      id: `barrage-${volley.index}-${targetIndex}`,
      kind: 'barrage-bolt',
      sourceSocket: `${side}-rear-shell-emitter`,
      center,
      radius: metrics.projectileRadius,
      geometryUncertaintyPixels: request.geometryUncertaintyPixels
    }));
  }
  return hazards;
};

const sampleCrabwalkBarrageGeometry = (
  request: Readonly<FrontierCrownclawGeometryRequest>,
  metrics: Readonly<FrontierCrownclawMetrics>
) => {
  const volleys = crabwalkVolleys(request);
  const hazards = volleys.flatMap((volley) => sampleBarrageProjectiles({
    request,
    metrics,
    volley
  }));
  // Follow the opening in the volley that will reach the lower player band
  // next, not simply the newest emitted volley. This preserves the readable
  // authored lane while later shell bolts are still high in the arena.
  const lowerBandTravelFrames = request.viewport.mobileProfile ? 96 : 74;
  const nextVolley = volleys.find((volley) => (
    volley.frame + lowerBandTravelFrames >= request.frame - 10
  ))
    ?? volleys[volleys.length - 1];
  return {
    hazards,
    routeTarget: point(nextVolley.gapX, request.viewport.height * 0.84)
  };
};

const segmentXAtY = (
  start: Readonly<BossSafeRoutePoint>,
  end: Readonly<BossSafeRoutePoint>,
  y: number
) => {
  if (Math.abs(end.y - start.y) < 0.0001) return (start.x + end.x) / 2;
  return lerp(start.x, end.x, (y - start.y) / (end.y - start.y));
};

const sampleCrossLinkGeometry = (
  request: Readonly<FrontierCrownclawGeometryRequest>,
  metrics: Readonly<FrontierCrownclawMetrics>,
  chainSockets: Readonly<{ port: BossSafeRoutePoint; starboard: BossSafeRoutePoint }>
) => {
  const hazards: FrontierCrownclawHazard[] = [];
  const operationalSides = request.operationalClawSides
    ?? FRONTIER_CROWNCLAW_OPERATIONAL_CLAW_SIDES;
  const direction = (normalizeSeed(request.seed) & 1) === 0 ? 1 : -1;
  const shiftAmplitude = request.viewport.mobileProfile ? 44 : 118;
  const shift = sampleKeyframedOffset(request.frame, [
    { frame: 0, x: 0 },
    { frame: 120, x: 0 },
    { frame: 190, x: direction * shiftAmplitude },
    { frame: 255, x: -direction * shiftAmplitude },
    { frame: 310, x: 0 },
    { frame: 420, x: 0 }
  ]);
  const anchorY = request.viewport.height * 0.87;
  const anchors = {
    port: point(request.viewport.width * 0.25 + shift, anchorY),
    starboard: point(request.viewport.width * 0.75 + shift, anchorY)
  };
  const launchStart = 62;
  const launchEnd = 120;
  const portRetractStart = direction > 0 ? 300 : 326;
  const starboardRetractStart = direction > 0 ? 326 : 300;
  const retractDuration = 54;
  const heads: Partial<Record<'port' | 'starboard', BossSafeRoutePoint>> = {};
  for (const side of operationalSides) {
    if (request.frame < launchStart) continue;
    const socket = chainSockets[side];
    const anchor = anchors[side];
    const retractStart = side === 'port' ? portRetractStart : starboardRetractStart;
    if (request.frame <= launchEnd) {
      heads[side] = interpolatePoint(
        socket,
        anchor,
        smoothstep((request.frame - launchStart) / (launchEnd - launchStart))
      );
    } else if (request.frame < retractStart) {
      heads[side] = anchor;
    } else if (request.frame <= retractStart + retractDuration) {
      heads[side] = interpolatePoint(
        anchor,
        socket,
        smoothstep((request.frame - retractStart) / retractDuration)
      );
    }
  }

  for (const side of operationalSides) {
    const head = heads[side];
    if (!head) continue;
    const socket = chainSockets[side];
    if (request.frame >= 82 && request.frame <= (side === 'port' ? portRetractStart : starboardRetractStart)) {
      hazards.push(capsuleHazard({
        id: `cross-link-${side}-chain`,
        kind: 'tensioned-chain',
        sourceSocket: `${side}-chain-spool`,
        start: socket,
        end: head,
        radius: metrics.chainRadius + 1.5,
        geometryUncertaintyPixels: request.geometryUncertaintyPixels
      }));
    }
    if (request.frame >= 75 && request.frame <= (side === 'port' ? portRetractStart + 14 : starboardRetractStart + 14)) {
      hazards.push(orientedBoxHazard({
        id: `cross-link-${side}-claw`,
        kind: 'claw-head',
        sourceSocket: `${side}-primary-claw`,
        center: head,
        halfWidth: metrics.clawHalfWidth,
        halfHeight: metrics.clawHalfHeight,
        angleRadians: Math.atan2(head.y - socket.y, head.x - socket.x),
        geometryUncertaintyPixels: request.geometryUncertaintyPixels
      }));
    }
  }

  const routeY = request.viewport.height * 0.81;
  const soleSide = operationalSides.length === 1 ? operationalSides[0] : undefined;
  const portHead = heads.port ?? chainSockets.port;
  const starboardHead = heads.starboard ?? chainSockets.starboard;
  const leftBoundary = segmentXAtY(chainSockets.port, portHead, routeY);
  const rightBoundary = segmentXAtY(chainSockets.starboard, starboardHead, routeY);
  return {
    hazards,
    routeTarget: point(
      soleSide
        ? safeSideFor(soleSide, request.viewport)
        : (leftBoundary + rightBoundary) / 2,
      routeY
    )
  };
};

export const sampleFrontierCrownclawAttackGeometry = (
  request: Readonly<FrontierCrownclawGeometryRequest>
): FrontierCrownclawAttackGeometryFrame => {
  const fallback = resolveFrontierCrownclawSafeRouteFallback(request);
  const metrics = metricsFor(request.viewport);
  const durationFrames = durationFor(fallback.resolvedAttackId, request.phaseId);
  const frame = clamp(Math.floor(request.frame), 0, durationFrames - 1);
  const normalizedRequest: FrontierCrownclawGeometryRequest = {
    ...request,
    attackId: fallback.resolvedAttackId,
    operationalClawSides: fallback.operationalClawSides,
    sequence: fallback.sequence,
    frame
  };
  const bossCenter = sampleBossCenter(normalizedRequest, metrics);
  const sockets = sampleSockets(bossCenter, metrics);
  let authored: {
    readonly hazards: readonly FrontierCrownclawHazard[];
    readonly routeTarget: BossSafeRoutePoint;
  };
  switch (fallback.resolvedAttackId) {
    case FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon:
      authored = sampleHarpoonGeometry(
        normalizedRequest,
        metrics,
        sockets.chainSockets
      );
      break;
    case FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam:
      authored = sampleReactorBeamGeometry(normalizedRequest, sockets.coreSocket);
      break;
    case FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage:
      authored = sampleCrabwalkBarrageGeometry(normalizedRequest, metrics);
      break;
    case FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink:
      authored = sampleCrossLinkGeometry(
        normalizedRequest,
        metrics,
        sockets.chainSockets
      );
      break;
  }

  return {
    attackId: request.attackId,
    requestedAttackId: request.attackId,
    resolvedAttackId: fallback.resolvedAttackId,
    phaseId: request.phaseId,
    seed: normalizeSeed(request.seed),
    operationalClawSides: fallback.operationalClawSides,
    sequence: fallback.sequence,
    frame,
    durationFrames,
    bossCenter,
    ...sockets,
    hazards: [
      circleHazard({
        id: 'frontier-crownclaw-hull',
        kind: 'boss-hull',
        sourceSocket: 'root-hull',
        center: bossCenter,
        radius: metrics.bodyRadius,
        geometryUncertaintyPixels: request.geometryUncertaintyPixels
      }),
      ...authored.hazards
    ],
    routeTarget: authored.routeTarget
  };
};

const pointToSegmentDistance = (
  subject: Readonly<BossSafeRoutePoint>,
  start: Readonly<BossSafeRoutePoint>,
  end: Readonly<BossSafeRoutePoint>
) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared <= 0.000001) {
    return magnitude(subject.x - start.x, subject.y - start.y);
  }
  const projection = clamp(
    ((subject.x - start.x) * segmentX + (subject.y - start.y) * segmentY) / lengthSquared,
    0,
    1
  );
  return magnitude(
    subject.x - (start.x + segmentX * projection),
    subject.y - (start.y + segmentY * projection)
  );
};

const hazardClearance = (
  playerCenter: Readonly<BossSafeRoutePoint>,
  player: Readonly<BossSafeRoutePlayerProfile>,
  hazard: Readonly<FrontierCrownclawHazard>
) => {
  const conservativePlayerRadius = Math.max(
    player.collisionWidth / 2,
    player.collisionHeight / 2
  );
  const centerDistance = hazard.shape === 'circle'
    ? magnitude(
        playerCenter.x - hazard.center.x,
        playerCenter.y - hazard.center.y
      )
    : hazard.shape === 'capsule'
      ? pointToSegmentDistance(playerCenter, hazard.start, hazard.end)
      : (() => {
          const deltaX = playerCenter.x - hazard.center.x;
          const deltaY = playerCenter.y - hazard.center.y;
          const cosine = Math.cos(-hazard.angleRadians);
          const sine = Math.sin(-hazard.angleRadians);
          const localX = deltaX * cosine - deltaY * sine;
          const localY = deltaX * sine + deltaY * cosine;
          const outsideX = Math.max(Math.abs(localX) - hazard.halfWidth, 0);
          const outsideY = Math.max(Math.abs(localY) - hazard.halfHeight, 0);
          if (outsideX > 0 || outsideY > 0) {
            return magnitude(outsideX, outsideY);
          }
          return -Math.min(
            hazard.halfWidth - Math.abs(localX),
            hazard.halfHeight - Math.abs(localY)
          );
        })();
  return centerDistance
    - conservativePlayerRadius
    - (hazard.shape === 'oriented-box' ? 0 : hazard.radius)
    - hazard.geometryUncertaintyPixels;
};

const findCriticalReactorSpeedBoundedRoute = ({
  request,
  seed,
  fallback,
  player,
  geometryUncertaintyPixels,
  durationFrames,
  minimumX,
  maximumX,
  minimumY,
  maximumY
}: Readonly<{
  request: FrontierCrownclawSafeRouteProofRequest;
  seed: number;
  fallback: FrontierCrownclawComponentFallbackResolution;
  player: BossSafeRoutePlayerProfile;
  geometryUncertaintyPixels: number;
  durationFrames: number;
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
}>): Readonly<{
  witness: readonly FrontierCrownclawRouteWitnessPoint[];
  minimumClearancePixels: number;
}> | undefined => {
  const firstDamagingFrame = 81;
  const routeY = request.viewport.height * (
    request.viewport.mobileProfile ? 0.48 : 0.58
  );
  if (routeY < minimumY || routeY > maximumY) return undefined;

  const gridStep = 1;
  const routeSearchClearancePixels =
    MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS;
  const gridCount = Math.floor((maximumX - minimumX) / gridStep) + 1;
  const gridX = Array.from(
    { length: gridCount },
    (_, index) => minimumX + index * gridStep
  );
  const geometries = Array.from({ length: durationFrames }, (_, frame) => (
    sampleFrontierCrownclawAttackGeometry({
      attackId: request.attackId,
      phaseId: request.phaseId,
      viewport: request.viewport,
      seed,
      operationalClawSides: fallback.operationalClawSides,
      sequence: fallback.sequence,
      frame,
      geometryUncertaintyPixels
    })
  ));
  const clearanceAt = (
    frame: number,
    x: number,
    y: number
  ) => {
    let clearance = Math.min(
      x - minimumX,
      maximumX - x,
      y - minimumY,
      maximumY - y
    );
    for (const hazard of geometries[frame].hazards) {
      clearance = Math.min(
        clearance,
        hazardClearance(point(x, y), player, hazard)
      );
    }
    return clearance;
  };

  const predecessorFrames: Int32Array[] = [];
  let reachable = new Uint8Array(gridCount);
  const initialX = request.viewport.width / 2;
  const initialY = request.viewport.height * 0.84;
  const preparationDistance = player.maximumSpeedPerFrame
    * (firstDamagingFrame + 1);
  const firstPredecessors = new Int32Array(gridCount);
  firstPredecessors.fill(-2);
  for (let index = 0; index < gridCount; index += 1) {
    const x = gridX[index];
    if (
      magnitude(x - initialX, routeY - initialY) <= preparationDistance
      && clearanceAt(firstDamagingFrame, x, routeY)
        >= routeSearchClearancePixels
    ) {
      reachable[index] = 1;
      firstPredecessors[index] = -1;
    }
  }
  if (!reachable.some(Boolean)) return undefined;
  predecessorFrames[firstDamagingFrame] = firstPredecessors;

  const maximumGridDelta = Math.floor(
    player.maximumSpeedPerFrame / gridStep
  );
  for (
    let frame = firstDamagingFrame + 1;
    frame < durationFrames;
    frame += 1
  ) {
    const nextReachable = new Uint8Array(gridCount);
    const predecessors = new Int32Array(gridCount);
    predecessors.fill(-2);
    for (let index = 0; index < gridCount; index += 1) {
      if (
        clearanceAt(frame, gridX[index], routeY)
          < routeSearchClearancePixels
      ) {
        continue;
      }
      for (let delta = 0; delta <= maximumGridDelta; delta += 1) {
        const candidates = delta === 0
          ? [index]
          : [index - delta, index + delta];
        const predecessor = candidates.find((candidate) => (
          candidate >= 0
          && candidate < gridCount
          && reachable[candidate] === 1
          && Math.abs(gridX[index] - gridX[candidate])
            <= player.maximumSpeedPerFrame + 0.000001
        ));
        if (predecessor === undefined) continue;
        nextReachable[index] = 1;
        predecessors[index] = predecessor;
        break;
      }
    }
    if (!nextReachable.some(Boolean)) return undefined;
    predecessorFrames[frame] = predecessors;
    reachable = nextReachable;
  }

  let finalIndex = -1;
  let finalDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < gridCount; index += 1) {
    if (reachable[index] !== 1) continue;
    const distanceFromCenter = Math.abs(gridX[index] - request.viewport.width / 2);
    if (distanceFromCenter < finalDistance) {
      finalDistance = distanceFromCenter;
      finalIndex = index;
    }
  }
  if (finalIndex < 0) return undefined;

  const routeIndexes = new Int32Array(durationFrames - firstDamagingFrame);
  let routeIndex = finalIndex;
  for (
    let frame = durationFrames - 1;
    frame >= firstDamagingFrame;
    frame -= 1
  ) {
    routeIndexes[frame - firstDamagingFrame] = routeIndex;
    const predecessor = predecessorFrames[frame][routeIndex];
    if (frame > firstDamagingFrame && predecessor < 0) return undefined;
    routeIndex = predecessor;
  }

  const routeStartX = gridX[routeIndexes[0]];
  const witness: FrontierCrownclawRouteWitnessPoint[] = [];
  let minimumClearancePixels = Number.POSITIVE_INFINITY;
  let previous = point(initialX, initialY);
  for (let frame = 0; frame < durationFrames; frame += 1) {
    const current = frame < firstDamagingFrame
      ? point(
          lerp(
            initialX,
            routeStartX,
            (frame + 1) / (firstDamagingFrame + 1)
          ),
          lerp(
            initialY,
            routeY,
            (frame + 1) / (firstDamagingFrame + 1)
          )
        )
      : point(
          gridX[routeIndexes[frame - firstDamagingFrame]],
          routeY
        );
    const clearance = clearanceAt(frame, current.x, current.y);
    minimumClearancePixels = Math.min(minimumClearancePixels, clearance);
    witness.push({
      frame,
      x: current.x,
      y: current.y,
      vx: current.x - previous.x,
      vy: current.y - previous.y,
      routeTargetX: current.x,
      routeTargetY: current.y
    });
    previous = current;
  }
  if (
    minimumClearancePixels
      < MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS
  ) {
    return undefined;
  }
  return {
    witness,
    minimumClearancePixels
  };
};

const configurationHash = (
  request: Readonly<FrontierCrownclawSafeRouteProofRequest>,
  seed: number,
  geometryUncertaintyPixels: number,
  player: Readonly<BossSafeRoutePlayerProfile>,
  fallback: Readonly<FrontierCrownclawComponentFallbackResolution>
) => {
  const componentFallbackRequested = request.operationalClawSides !== undefined
    || request.sequence !== undefined;
  return fnv1a(JSON.stringify({
    attackId: request.attackId,
    phaseId: request.phaseId,
    viewport: {
      id: request.viewport.id,
      width: request.viewport.width,
      height: request.viewport.height,
      mobileProfile: request.viewport.mobileProfile
    },
    seed,
    geometryUncertaintyPixels,
    player,
    fps: FRONTIER_CROWNCLAW_SAFE_ROUTE_FPS,
    requiredClearancePixels: MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
    geometryRevision: componentFallbackRequested
      ? 'frontier-crownclaw-component-fallback-route-v3'
      : 'frontier-crownclaw-route-v3',
    ...(componentFallbackRequested ? {
      resolvedAttackId: fallback.resolvedAttackId,
      operationalClawSides: fallback.operationalClawSides,
      sequence: fallback.sequence
    } : {})
  }));
};

const unsupportedPhase = (
  attackId: FrontierCrownclawAttackId,
  phaseId: FrontierCrownclawPhaseId
) => (
  attackId === FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink
  && phaseId !== FRONTIER_CROWNCLAW_PHASE_IDS.critical
);

export const proveFrontierCrownclawSafeRoute = (
  request: Readonly<FrontierCrownclawSafeRouteProofRequest>
): FrontierCrownclawSafeRouteProof => {
  const seed = normalizeSeed(request.seed ?? FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED);
  const fallback = resolveFrontierCrownclawSafeRouteFallback(request);
  const criticalReactorRoute = (
    fallback.resolvedAttackId === FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam
    && request.phaseId === FRONTIER_CROWNCLAW_PHASE_IDS.critical
  );
  const player = request.player ?? (
    criticalReactorRoute
      ? FRONTIER_CROWNCLAW_DEFAULT_SANDBOX_ROUTE_PLAYER
      : CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER
  );
  const geometryUncertaintyPixels = Math.max(
    0,
    Number(request.geometryUncertaintyPixels)
      || FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS
  );
  const configHash = configurationHash(
    request,
    seed,
    geometryUncertaintyPixels,
    player,
    fallback
  );
  const base = {
    attackId: request.attackId,
    requestedAttackId: request.attackId,
    resolvedAttackId: fallback.resolvedAttackId,
    phaseId: request.phaseId,
    viewportId: request.viewport.id,
    seed,
    operationalClawSides: fallback.operationalClawSides,
    sequence: fallback.sequence,
    geometryUncertaintyPixels,
    requiredClearancePixels: MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
    configurationHash: configHash
  };
  if (
    request.viewport.width <= player.collisionWidth
    || request.viewport.height <= player.collisionHeight
  ) {
    return {
      ...base,
      status: 'unproven',
      reason: 'invalid-viewport',
      checkedFrames: 0,
      minimumClearancePixels: Number.NEGATIVE_INFINITY,
      detail: 'The viewport cannot contain the conservative player collision body.'
    };
  }
  if (unsupportedPhase(request.attackId, request.phaseId)) {
    return {
      ...base,
      status: 'unproven',
      reason: 'unsupported-phase',
      checkedFrames: 0,
      minimumClearancePixels: Number.NEGATIVE_INFINITY,
      detail: 'Crown Cross-Link is reserved for the Critical Cross-Link phase.'
    };
  }

  const durationFrames = durationFor(fallback.resolvedAttackId, request.phaseId);
  const halfWidth = player.collisionWidth / 2;
  const halfHeight = player.collisionHeight / 2;
  const minimumX = halfWidth + geometryUncertaintyPixels;
  const maximumX = request.viewport.width - halfWidth - geometryUncertaintyPixels;
  const metrics = metricsFor(request.viewport);
  const minimumY = metrics.bossY + metrics.bodyRadius + halfHeight + geometryUncertaintyPixels;
  const maximumY = request.viewport.height - halfHeight - geometryUncertaintyPixels;
  if (criticalReactorRoute) {
    const route = findCriticalReactorSpeedBoundedRoute({
      request,
      seed,
      fallback,
      player,
      geometryUncertaintyPixels,
      durationFrames,
      minimumX,
      maximumX,
      minimumY,
      maximumY
    });
    if (!route) {
      return {
        ...base,
        status: 'unproven',
        reason: 'route-collision',
        checkedFrames: 0,
        minimumClearancePixels: Number.NEGATIVE_INFINITY,
        detail: 'No continuous default-loadout route could follow both restored wide reactor sweeps.'
      };
    }
    const routeHash = fnv1a(route.witness.map((sample) => [
      sample.frame,
      sample.x.toFixed(3),
      sample.y.toFixed(3),
      sample.vx.toFixed(3),
      sample.vy.toFixed(3)
    ].join(':')).join('|'));
    return {
      ...base,
      status: 'proven',
      reason: 'proven',
      checkedFrames: route.witness.length,
      minimumClearancePixels: route.minimumClearancePixels,
      routeHash,
      witness: route.witness,
      detail: `A continuous default-loadout route followed the restored wide paired beams and retained ${route.minimumClearancePixels.toFixed(2)} px after ${geometryUncertaintyPixels} px geometry uncertainty.`
    };
  }
  let x = request.viewport.width / 2;
  let y = request.viewport.height * 0.84;
  let vx = 0;
  let vy = 0;
  let minimumClearance = Number.POSITIVE_INFINITY;
  let collisionFrame: number | undefined;
  let collisionHazard: string | undefined;
  const witness: FrontierCrownclawRouteWitnessPoint[] = [];

  for (let frame = 0; frame < durationFrames; frame += 1) {
    const geometry = sampleFrontierCrownclawAttackGeometry({
      attackId: request.attackId,
      phaseId: request.phaseId,
      viewport: request.viewport,
      seed,
      operationalClawSides: fallback.operationalClawSides,
      sequence: fallback.sequence,
      frame,
      geometryUncertaintyPixels
    });
    const desiredVx = clamp(
      (geometry.routeTarget.x - x) * 0.12,
      -player.maximumSpeedPerFrame,
      player.maximumSpeedPerFrame
    );
    const desiredVy = clamp(
      (geometry.routeTarget.y - y) * 0.12,
      -player.maximumSpeedPerFrame,
      player.maximumSpeedPerFrame
    );
    vx = approach(vx, desiredVx, player.accelerationPerFrame);
    vy = approach(vy, desiredVy, player.accelerationPerFrame);
    const speed = magnitude(vx, vy);
    if (speed > player.maximumSpeedPerFrame) {
      vx = (vx / speed) * player.maximumSpeedPerFrame;
      vy = (vy / speed) * player.maximumSpeedPerFrame;
    }
    x = clamp(x + vx, minimumX, maximumX);
    y = clamp(y + vy, minimumY, maximumY);

    const edgeClearance = Math.min(
      x - minimumX,
      maximumX - x,
      y - minimumY,
      maximumY - y
    );
    let frameClearance = edgeClearance;
    let closestHazard = 'arena-boundary';
    for (const hazard of geometry.hazards) {
      const clearance = hazardClearance(point(x, y), player, hazard);
      if (clearance < frameClearance) {
        frameClearance = clearance;
        closestHazard = hazard.id;
      }
    }
    if (frameClearance < minimumClearance) minimumClearance = frameClearance;
    witness.push({
      frame,
      x,
      y,
      vx,
      vy,
      routeTargetX: geometry.routeTarget.x,
      routeTargetY: geometry.routeTarget.y
    });
    if (frameClearance <= 0 && collisionFrame === undefined) {
      collisionFrame = frame;
      collisionHazard = closestHazard;
      break;
    }
  }

  const routeHash = fnv1a(witness.map((sample) => [
    sample.frame,
    sample.x.toFixed(3),
    sample.y.toFixed(3),
    sample.vx.toFixed(3),
    sample.vy.toFixed(3)
  ].join(':')).join('|'));
  if (collisionFrame !== undefined) {
    return {
      ...base,
      status: 'unproven',
      reason: 'route-collision',
      checkedFrames: witness.length,
      minimumClearancePixels: minimumClearance,
      routeHash,
      witness,
      detail: `The deterministic witness collided with ${collisionHazard} at frame ${collisionFrame}.`
    };
  }
  if (minimumClearance < MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS) {
    return {
      ...base,
      status: 'unproven',
      reason: 'insufficient-clearance',
      checkedFrames: witness.length,
      minimumClearancePixels: minimumClearance,
      routeHash,
      witness,
      detail: `The deterministic witness retained ${minimumClearance.toFixed(2)} px after uncertainty; ${MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS} px is required.`
    };
  }
  return {
    ...base,
    status: 'proven',
    reason: 'proven',
    checkedFrames: witness.length,
    minimumClearancePixels: minimumClearance,
    routeHash,
    witness,
    detail: `A continuous default-loadout route retained ${minimumClearance.toFixed(2)} px after ${geometryUncertaintyPixels} px geometry uncertainty${fallback.resolvedAttackId === request.attackId
      ? fallback.operationalClawSides.length === 1
        ? ` with ${fallback.operationalClawSides[0]} as the sole operational claw.`
        : '.'
      : ` after resolving ${request.attackId} to ${fallback.resolvedAttackId} at sequence ${fallback.sequence}.`}`
  };
};

export interface FrontierCrownclawBenchmarkRouteResult {
  readonly attackId: FrontierCrownclawAttackId;
  readonly phaseId: FrontierCrownclawPhaseId;
  readonly seed: number;
  readonly viewportId: string;
  readonly proof: FrontierCrownclawSafeRouteProof;
}

export const buildFrontierCrownclawSafeRouteMatrix = (
  seeds: readonly number[] = FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS
): readonly FrontierCrownclawBenchmarkRouteResult[] => {
  const cases: readonly Readonly<{
    attackId: FrontierCrownclawAttackId;
    phaseId: FrontierCrownclawPhaseId;
  }>[] = [
    ...Object.values(FRONTIER_CROWNCLAW_ATTACK_IDS)
      .filter((attackId) => attackId !== FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink)
      .flatMap((attackId) => [
        { attackId, phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.bastion },
        { attackId, phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical }
      ]),
    {
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
      phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical
    }
  ];
  const viewports = Object.values(FRONTIER_CROWNCLAW_BENCHMARK_VIEWPORTS);
  return seeds.flatMap((seed) => cases.flatMap(({ attackId, phaseId }) => (
    viewports.map((viewport) => ({
      attackId,
      phaseId,
      seed: normalizeSeed(seed),
      viewportId: viewport.id,
      proof: proveFrontierCrownclawSafeRoute({
        attackId,
        phaseId,
        viewport,
        seed
      })
    }))
  )));
};

export const FRONTIER_CROWNCLAW_COMPONENT_FALLBACK_SCENARIOS = Object.freeze([
  ...Object.values(FRONTIER_CROWNCLAW_PHASE_IDS).flatMap((phaseId) => ([
    {
      id: `${phaseId}-harpoon-port-only`,
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
      phaseId,
      operationalClawSides: Object.freeze(['port'] as const),
      sequence: 0
    },
    {
      id: `${phaseId}-harpoon-starboard-only`,
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
      phaseId,
      operationalClawSides: Object.freeze(['starboard'] as const),
      sequence: 0
    },
    {
      id: `${phaseId}-harpoon-no-claws-reactor`,
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
      phaseId,
      operationalClawSides: Object.freeze([]),
      sequence: 0
    },
    {
      id: `${phaseId}-harpoon-no-claws-barrage`,
      attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
      phaseId,
      operationalClawSides: Object.freeze([]),
      sequence: 1
    }
  ])),
  {
    id: 'critical-cross-link-port-only',
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
    operationalClawSides: Object.freeze(['port'] as const),
    sequence: 0
  },
  {
    id: 'critical-cross-link-starboard-only',
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
    operationalClawSides: Object.freeze(['starboard'] as const),
    sequence: 0
  },
  {
    id: 'critical-cross-link-no-claws-reactor',
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
    operationalClawSides: Object.freeze([]),
    sequence: 0
  },
  {
    id: 'critical-cross-link-no-claws-barrage',
    attackId: FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink,
    phaseId: FRONTIER_CROWNCLAW_PHASE_IDS.critical,
    operationalClawSides: Object.freeze([]),
    sequence: 1
  }
] as const);

export interface FrontierCrownclawComponentFallbackRouteResult {
  readonly scenarioId: string;
  readonly attackId: FrontierCrownclawAttackId;
  readonly resolvedAttackId: FrontierCrownclawAttackId;
  readonly phaseId: FrontierCrownclawPhaseId;
  readonly operationalClawSides: readonly FrontierCrownclawOperationalClawSide[];
  readonly sequence: number;
  readonly seed: number;
  readonly viewportId: string;
  readonly proof: FrontierCrownclawSafeRouteProof;
}

export const buildFrontierCrownclawComponentFallbackSafeRouteMatrix = (
  seeds: readonly number[] = FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS
): readonly FrontierCrownclawComponentFallbackRouteResult[] => {
  const viewports = Object.values(FRONTIER_CROWNCLAW_BENCHMARK_VIEWPORTS);
  return seeds.flatMap((seed) => (
    FRONTIER_CROWNCLAW_COMPONENT_FALLBACK_SCENARIOS.flatMap((scenario) => (
      viewports.map((viewport) => {
        const proof = proveFrontierCrownclawSafeRoute({
          attackId: scenario.attackId,
          phaseId: scenario.phaseId,
          viewport,
          seed,
          operationalClawSides: scenario.operationalClawSides,
          sequence: scenario.sequence
        });
        return {
          scenarioId: scenario.id,
          attackId: scenario.attackId,
          resolvedAttackId: proof.resolvedAttackId,
          phaseId: scenario.phaseId,
          operationalClawSides: scenario.operationalClawSides,
          sequence: scenario.sequence,
          seed: normalizeSeed(seed),
          viewportId: viewport.id,
          proof
        };
      })
    ))
  ));
};
