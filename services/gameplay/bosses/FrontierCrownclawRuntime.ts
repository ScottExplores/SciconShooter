/**
 * Deterministic, renderer-agnostic choreography for Frontier Crownclaw.
 *
 * This module owns only the boss-specific mechanical vocabulary. The canonical
 * Boss Timeline runtime remains responsible for scheduling clips, while the
 * simulation supplies live socket coordinates to these pure samplers.
 */

export const FRONTIER_CROWNCLAW_ACTION_IDS = Object.freeze([
  'chainclaw-harpoon',
  'crown-reactor-beam',
  'bastion-crabwalk-barrage'
] as const);

export type FrontierCrownclawActionId =
  (typeof FRONTIER_CROWNCLAW_ACTION_IDS)[number];

export const FRONTIER_CROWNCLAW_SIGNATURE_ID = 'crown-cross-link' as const;

export const FRONTIER_CROWNCLAW_MOTION_CUES = Object.freeze({
  harpoon: 'frontier-chainclaw-harpoon',
  crossLink: 'frontier-crown-cross-link',
  reactorCharge: 'frontier-reactor-charge',
  reactorFire: 'frontier-reactor-fire',
  crabwalk: 'frontier-bastion-crabwalk',
  phaseTwo: 'frontier-critical-cross-link',
  stagger: 'frontier-stagger',
  death: 'frontier-death'
} as const);

export const FRONTIER_CROWNCLAW_RUNTIME_SOCKET_IDS = Object.freeze([
  'claw-socket-port',
  'claw-socket-starboard',
  'claw-tip-port',
  'claw-tip-starboard',
  'chain-spool-port',
  'chain-spool-starboard',
  'crown-reactor',
  'bastion-port-port',
  'bastion-port-starboard',
  'rear-bastion-port',
  'rear-bastion-starboard'
] as const);

export type FrontierCrownclawRuntimeSocketId =
  (typeof FRONTIER_CROWNCLAW_RUNTIME_SOCKET_IDS)[number];

export type FrontierCrownclawSide = 'port' | 'starboard';
export type FrontierCrownclawTimelineStage =
  | 'idle'
  | 'warning'
  | 'fire'
  | 'recovery';

export const FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT = 10;
export const FRONTIER_CROWNCLAW_FIRST_BARRAGE_FRAME = 6;
export const FRONTIER_CROWNCLAW_BARRAGE_INTERVAL_FRAMES = 5;

export const FRONTIER_CROWNCLAW_RUNTIME_LIMITS = Object.freeze({
  maximumChainLinksPerClaw: FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT,
  maximumHarpoonReachRatio: 0.78,
  maximumBeamSweepRadians: Math.PI * 0.62,
  maximumBarrageShots: 14,
  minimumWarningFrames: 30,
  minimumRecoveryFrames: 24
});

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

const smootherstep = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * normalized
    * (normalized * (normalized * 6 - 15) + 10);
};

const lerp = (from: number, to: number, progress: number) => (
  from + (to - from) * progress
);

const positiveModulo = (value: number, divisor: number) => (
  ((value % divisor) + divisor) % divisor
);

/** Stable FNV-1a branch selection; never depends on presentation randomness. */
export const resolveFrontierCrownclawSeedBranch = ({
  seedKey,
  sequence = 0,
  branchCount
}: {
  readonly seedKey: string;
  readonly sequence?: number;
  readonly branchCount: number;
}): number => {
  const boundedCount = Math.max(1, Math.floor(finiteOr(branchCount, 1)));
  const text = `${seedKey}:${Math.floor(finiteOr(sequence, 0))}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % boundedCount;
};

export interface FrontierCrownclawPhaseState {
  readonly phaseIndex: 1 | 2;
  readonly critical: boolean;
  readonly transitionProgress: number;
  readonly shellOpening: number;
  readonly crownLift: number;
  readonly reactorExposure: number;
  readonly rearAppendageDeployment: number;
  readonly chainOvercharge: number;
  readonly dualHarpoonsEnabled: boolean;
  readonly rearBarrageSocketsEnabled: boolean;
  readonly beamRelayMode: 'direct' | 'cross-linked';
}

/**
 * Phase two is an authored anatomy change: shell shutters open, the crown and
 * reactor rise, rear bastion ports deploy, and both chain circuits energize.
 */
export const resolveFrontierCrownclawPhaseState = ({
  phaseIndex,
  phaseProgress = phaseIndex >= 2 ? 1 : 0,
  healthRatio = 1
}: {
  readonly phaseIndex: number;
  readonly phaseProgress?: number;
  readonly healthRatio?: number;
}): FrontierCrownclawPhaseState => {
  const critical = Math.max(1, Math.floor(finiteOr(phaseIndex, 1))) >= 2;
  const transitionProgress = critical
    ? smootherstep(finiteOr(phaseProgress, 1))
    : 0;
  const damagePressure = 1 - clamp(finiteOr(healthRatio, 1), 0, 1);
  return Object.freeze({
    phaseIndex: critical ? 2 : 1,
    critical,
    transitionProgress,
    shellOpening: transitionProgress,
    crownLift: transitionProgress,
    reactorExposure: critical
      ? clamp(0.42 + transitionProgress * 0.58, 0, 1)
      : 0,
    rearAppendageDeployment: transitionProgress,
    chainOvercharge: critical
      ? clamp(0.55 + transitionProgress * 0.35 + damagePressure * 0.1, 0, 1)
      : 0,
    dualHarpoonsEnabled: critical && transitionProgress >= 0.72,
    rearBarrageSocketsEnabled: critical && transitionProgress >= 0.82,
    beamRelayMode: critical && transitionProgress >= 0.88
      ? 'cross-linked'
      : 'direct'
  });
};

export interface FrontierCrownclawPoint {
  readonly x: number;
  readonly y: number;
}

const freezePoint = (x: number, y: number): FrontierCrownclawPoint => (
  Object.freeze({ x, y })
);

export type FrontierChainLifecycleStage =
  | 'seated'
  | 'unspooling'
  | 'launching'
  | 'latched'
  | 'tensioned'
  | 'retracting'
  | 'reseating';

export interface FrontierChainclawPlan {
  readonly signature: boolean;
  readonly sides: readonly FrontierCrownclawSide[];
  readonly primarySide: FrontierCrownclawSide;
  readonly portTargetRatio: FrontierCrownclawPoint;
  readonly starboardTargetRatio: FrontierCrownclawPoint;
  readonly crossLink: boolean;
  readonly templateIndex: number;
}

const HARPOON_TARGET_TEMPLATES = Object.freeze([
  Object.freeze({ port: Object.freeze({ x: 0.2, y: 0.68 }), starboard: Object.freeze({ x: 0.8, y: 0.68 }) }),
  Object.freeze({ port: Object.freeze({ x: 0.34, y: 0.74 }), starboard: Object.freeze({ x: 0.66, y: 0.74 }) }),
  Object.freeze({ port: Object.freeze({ x: 0.14, y: 0.58 }), starboard: Object.freeze({ x: 0.86, y: 0.58 }) }),
  Object.freeze({ port: Object.freeze({ x: 0.42, y: 0.64 }), starboard: Object.freeze({ x: 0.58, y: 0.64 }) })
] as const);

/** Resolves bounded harpoon targets once, at warning time. */
export const resolveFrontierChainclawPlan = ({
  seedKey = 'frontier-crownclaw',
  sequence = 0,
  phaseIndex = 1,
  signature = false
}: {
  readonly seedKey?: string;
  readonly sequence?: number;
  readonly phaseIndex?: number;
  readonly signature?: boolean;
}): FrontierChainclawPlan => {
  const templateIndex = resolveFrontierCrownclawSeedBranch({
    seedKey: `${seedKey}:harpoon`,
    sequence,
    branchCount: HARPOON_TARGET_TEMPLATES.length
  });
  const template = HARPOON_TARGET_TEMPLATES[templateIndex];
  const primarySide: FrontierCrownclawSide = resolveFrontierCrownclawSeedBranch({
    seedKey: `${seedKey}:side`,
    sequence,
    branchCount: 2
  }) === 0 ? 'port' : 'starboard';
  const crossLink = Boolean(signature);
  const phaseState = resolveFrontierCrownclawPhaseState({
    phaseIndex,
    phaseProgress: phaseIndex >= 2 ? 1 : 0
  });
  const sides: readonly FrontierCrownclawSide[] = crossLink
    || phaseState.dualHarpoonsEnabled
    ? Object.freeze(['port', 'starboard'] as const)
    : Object.freeze([primarySide]);
  const portTarget = crossLink
    ? Object.freeze({ x: template.starboard.x, y: template.starboard.y })
    : template.port;
  const starboardTarget = crossLink
    ? Object.freeze({ x: template.port.x, y: template.port.y })
    : template.starboard;
  return Object.freeze({
    signature: crossLink,
    sides,
    primarySide,
    portTargetRatio: freezePoint(portTarget.x, portTarget.y),
    starboardTargetRatio: freezePoint(starboardTarget.x, starboardTarget.y),
    crossLink,
    templateIndex
  });
};

export interface FrontierChainLinkSample {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly rotationRadians: number;
  readonly visible: boolean;
  readonly tension: number;
}

export interface FrontierChainclawSample {
  readonly side: FrontierCrownclawSide;
  readonly lifecycle: FrontierChainLifecycleStage;
  readonly spool: FrontierCrownclawPoint;
  readonly claw: FrontierCrownclawPoint;
  readonly extensionRatio: number;
  readonly slackPixels: number;
  readonly tension: number;
  readonly spoolRotationRadians: number;
  readonly clawRotationRadians: number;
  readonly clawOpenAmount: number;
  readonly latched: boolean;
  readonly clawDamaging: boolean;
  readonly chainDamaging: boolean;
  readonly reseated: boolean;
  readonly links: readonly FrontierChainLinkSample[];
}

const resolveChainLifecycle = (
  stage: FrontierCrownclawTimelineStage,
  progress: number
): FrontierChainLifecycleStage => {
  if (stage === 'idle') return 'seated';
  if (stage === 'warning') return 'unspooling';
  if (stage === 'recovery') {
    return progress >= 0.72 ? 'seated' : 'reseating';
  }
  if (progress < 0.25) return 'launching';
  if (progress < 0.39) return 'latched';
  if (progress < 0.66) return 'tensioned';
  if (progress < 0.93) return 'retracting';
  return 'reseating';
};

const sampleQuadraticChain = ({
  start,
  end,
  slackPixels,
  tension,
  linkCount
}: {
  readonly start: FrontierCrownclawPoint;
  readonly end: FrontierCrownclawPoint;
  readonly slackPixels: number;
  readonly tension: number;
  readonly linkCount: number;
}): readonly FrontierChainLinkSample[] => {
  const count = clamp(
    Math.floor(finiteOr(linkCount, FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT)),
    2,
    FRONTIER_CROWNCLAW_RUNTIME_LIMITS.maximumChainLinksPerClaw
  );
  const links = Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 0 : index / (count - 1);
    const oneMinusT = 1 - t;
    const centerX = (start.x + end.x) * 0.5;
    const centerY = (start.y + end.y) * 0.5 + slackPixels;
    const x = oneMinusT * oneMinusT * start.x
      + 2 * oneMinusT * t * centerX
      + t * t * end.x;
    const y = oneMinusT * oneMinusT * start.y
      + 2 * oneMinusT * t * centerY
      + t * t * end.y;
    const derivativeX = 2 * oneMinusT * (centerX - start.x)
      + 2 * t * (end.x - centerX);
    const derivativeY = 2 * oneMinusT * (centerY - start.y)
      + 2 * t * (end.y - centerY);
    return Object.freeze({
      index,
      x,
      y,
      rotationRadians: Math.atan2(derivativeY, derivativeX),
      visible: true,
      tension
    });
  });
  return Object.freeze(links);
};

/**
 * Samples one visible chain assembly. `target` must be locked during warning;
 * callers should not continuously retarget the player after the throw begins.
 */
export const sampleFrontierChainclawHarpoon = ({
  side,
  stage,
  progress,
  sequence = 0,
  spool,
  rest,
  target,
  signature = false,
  linkCount = FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT
}: {
  readonly side: FrontierCrownclawSide;
  readonly stage: FrontierCrownclawTimelineStage;
  readonly progress: number;
  readonly sequence?: number;
  readonly spool: FrontierCrownclawPoint;
  readonly rest: FrontierCrownclawPoint;
  readonly target: FrontierCrownclawPoint;
  readonly signature?: boolean;
  readonly linkCount?: number;
}): FrontierChainclawSample => {
  const normalizedProgress = clamp(finiteOr(progress, 0), 0, 1);
  const lifecycle = resolveChainLifecycle(stage, normalizedProgress);
  let extensionRatio = 0;
  let tension = 0;
  let clawOpenAmount = 0;

  if (stage === 'warning') {
    clawOpenAmount = smoothstep(normalizedProgress) * 0.72;
  } else if (stage === 'fire') {
    if (normalizedProgress < 0.25) {
      extensionRatio = smootherstep(normalizedProgress / 0.25);
      clawOpenAmount = 0.72 + extensionRatio * 0.28;
    } else if (normalizedProgress < 0.39) {
      extensionRatio = 1;
      tension = smoothstep((normalizedProgress - 0.25) / 0.14) * 0.72;
      clawOpenAmount = 1 - tension * 0.55;
    } else if (normalizedProgress < 0.66) {
      extensionRatio = 1;
      tension = 0.72 + Math.sin(
        ((normalizedProgress - 0.39) / 0.27) * Math.PI
      ) * 0.28;
      clawOpenAmount = 0.45;
    } else if (normalizedProgress < 0.93) {
      const retractProgress = smoothstep((normalizedProgress - 0.66) / 0.27);
      extensionRatio = 1 - retractProgress;
      tension = 0.72 * (1 - retractProgress);
      clawOpenAmount = 0.45 + retractProgress * 0.35;
    } else {
      extensionRatio = 0;
      tension = 0;
      clawOpenAmount = (1 - smoothstep((normalizedProgress - 0.93) / 0.07)) * 0.8;
    }
  } else if (stage === 'recovery') {
    clawOpenAmount = (1 - smoothstep(normalizedProgress)) * 0.28;
  }

  const sideSign = side === 'port' ? -1 : 1;
  const lateralLatchWobble = lifecycle === 'tensioned'
    ? Math.sin((sequence + 1) * 1.91 + normalizedProgress * Math.PI * 4)
      * (signature ? 2.4 : 1.5)
    : 0;
  const clawX = lerp(rest.x, target.x, extensionRatio) + lateralLatchWobble;
  const clawY = lerp(rest.y, target.y, extensionRatio);
  const claw = freezePoint(clawX, clawY);
  const distance = Math.hypot(claw.x - spool.x, claw.y - spool.y);
  const slackPixels = lifecycle === 'seated'
    ? Math.min(8, distance * 0.16)
    : lifecycle === 'unspooling'
      ? lerp(Math.min(8, distance * 0.16), 15, smoothstep(normalizedProgress))
      : lifecycle === 'launching'
        ? lerp(14, 8, extensionRatio)
        : lifecycle === 'latched'
          ? lerp(8, 2.5, tension)
          : lifecycle === 'tensioned'
            ? lerp(3, 0.8, tension)
            : lifecycle === 'retracting'
              ? lerp(2, 10, 1 - extensionRatio)
              : 6;
  const baseAngle = Math.atan2(claw.y - spool.y, claw.x - spool.x);
  const spoolTurns = stage === 'warning'
    ? smoothstep(normalizedProgress) * 1.25
    : stage === 'fire'
      ? extensionRatio * 2.5 + tension * 0.35
      : (1 - smoothstep(normalizedProgress)) * 0.35;
  const latched = lifecycle === 'latched' || lifecycle === 'tensioned';
  const clawDamaging = stage === 'fire' && (
    lifecycle === 'launching'
    || lifecycle === 'latched'
    || lifecycle === 'tensioned'
  );
  const chainDamaging = stage === 'fire'
    && (lifecycle === 'latched' || lifecycle === 'tensioned');
  const links = sampleQuadraticChain({
    start: spool,
    end: claw,
    slackPixels,
    tension,
    linkCount
  });

  return Object.freeze({
    side,
    lifecycle,
    spool: freezePoint(spool.x, spool.y),
    claw,
    extensionRatio,
    slackPixels,
    tension,
    spoolRotationRadians: sideSign * spoolTurns * Math.PI * 2,
    clawRotationRadians: baseAngle + sideSign * Math.PI * 0.08,
    clawOpenAmount,
    latched,
    clawDamaging,
    chainDamaging,
    reseated: lifecycle === 'seated' || (
      lifecycle === 'reseating' && extensionRatio === 0
    ),
    links
  });
};

export interface FrontierReactorBeamPlan {
  readonly sweepDirection: -1 | 1;
  readonly startAngleRadians: number;
  readonly endAngleRadians: number;
  readonly relayMode: 'direct' | 'cross-linked';
  readonly beamCount: 1 | 3;
  readonly relayOffsetRadians: number;
}

export const resolveFrontierReactorBeamPlan = ({
  seedKey = 'frontier-crownclaw',
  sequence = 0,
  phaseIndex = 1,
  lockedTargetAngleRadians = Math.PI / 2
}: {
  readonly seedKey?: string;
  readonly sequence?: number;
  readonly phaseIndex?: number;
  readonly lockedTargetAngleRadians?: number;
}): FrontierReactorBeamPlan => {
  const sweepDirection: -1 | 1 = resolveFrontierCrownclawSeedBranch({
    seedKey: `${seedKey}:reactor-direction`,
    sequence,
    branchCount: 2
  }) === 0 ? -1 : 1;
  const phaseState = resolveFrontierCrownclawPhaseState({
    phaseIndex,
    phaseProgress: phaseIndex >= 2 ? 1 : 0
  });
  const center = clamp(
    finiteOr(lockedTargetAngleRadians, Math.PI / 2),
    Math.PI * 0.27,
    Math.PI * 0.73
  );
  const halfSweep = phaseState.critical ? Math.PI * 0.21 : Math.PI * 0.16;
  const startAngleRadians = clamp(
    center - sweepDirection * halfSweep,
    Math.PI * 0.18,
    Math.PI * 0.82
  );
  const endAngleRadians = clamp(
    center + sweepDirection * halfSweep,
    Math.PI * 0.18,
    Math.PI * 0.82
  );
  return Object.freeze({
    sweepDirection,
    startAngleRadians,
    endAngleRadians,
    relayMode: phaseState.beamRelayMode,
    beamCount: phaseState.beamRelayMode === 'cross-linked' ? 3 : 1,
    relayOffsetRadians: phaseState.beamRelayMode === 'cross-linked'
      ? Math.PI * 0.11
      : 0
  });
};

export type FrontierReactorBeamLifecycle =
  | 'sealed'
  | 'charging'
  | 'tracking'
  | 'firing'
  | 'venting';

export interface FrontierReactorBeamSample {
  readonly lifecycle: FrontierReactorBeamLifecycle;
  readonly chargeEnergy: number;
  readonly crownLift: number;
  readonly shutterOpening: number;
  readonly warningVisible: boolean;
  readonly damaging: boolean;
  readonly beamEnergy: number;
  readonly primaryAngleRadians: number;
  readonly beamAnglesRadians: readonly number[];
  readonly recoilEnergy: number;
  readonly relayMode: 'direct' | 'cross-linked';
}

export const sampleFrontierCrownReactorBeam = ({
  stage,
  progress,
  plan
}: {
  readonly stage: FrontierCrownclawTimelineStage;
  readonly progress: number;
  readonly plan: FrontierReactorBeamPlan;
}): FrontierReactorBeamSample => {
  const normalizedProgress = clamp(finiteOr(progress, 0), 0, 1);
  let lifecycle: FrontierReactorBeamLifecycle = 'sealed';
  let chargeEnergy = 0;
  let beamEnergy = 0;
  let warningVisible = false;
  let damaging = false;
  let recoilEnergy = 0;
  let sweepProgress = 0;

  if (stage === 'warning') {
    lifecycle = normalizedProgress < 0.62 ? 'charging' : 'tracking';
    chargeEnergy = smoothstep(normalizedProgress);
    warningVisible = normalizedProgress >= 0.32;
    sweepProgress = 0;
  } else if (stage === 'fire') {
    lifecycle = 'firing';
    chargeEnergy = 1;
    warningVisible = normalizedProgress < 0.08;
    damaging = normalizedProgress >= 0.08 && normalizedProgress <= 0.86;
    beamEnergy = damaging
      ? smoothstep(clamp((normalizedProgress - 0.08) / 0.08, 0, 1))
        * (1 - smoothstep(clamp((normalizedProgress - 0.8) / 0.06, 0, 1)))
      : 0;
    recoilEnergy = beamEnergy * (0.78 + Math.sin(normalizedProgress * Math.PI * 16) * 0.08);
    sweepProgress = smootherstep(normalizedProgress);
  } else if (stage === 'recovery') {
    lifecycle = 'venting';
    chargeEnergy = 1 - smoothstep(normalizedProgress);
    sweepProgress = 1;
  }

  const primaryAngleRadians = lerp(
    plan.startAngleRadians,
    plan.endAngleRadians,
    sweepProgress
  );
  const beamAnglesRadians = plan.relayMode === 'cross-linked'
    ? Object.freeze([
      primaryAngleRadians - plan.relayOffsetRadians,
      primaryAngleRadians,
      primaryAngleRadians + plan.relayOffsetRadians
    ])
    : Object.freeze([primaryAngleRadians]);

  return Object.freeze({
    lifecycle,
    chargeEnergy,
    crownLift: chargeEnergy,
    shutterOpening: chargeEnergy,
    warningVisible,
    damaging,
    beamEnergy,
    primaryAngleRadians,
    beamAnglesRadians,
    recoilEnergy,
    relayMode: plan.relayMode
  });
};

export const FRONTIER_CRABWALK_ROUTE_TEMPLATE_IDS = Object.freeze([
  'port-feint-starboard-anchor',
  'starboard-feint-port-anchor',
  'double-back-bastion'
] as const);

export type FrontierCrabwalkRouteTemplateId =
  (typeof FRONTIER_CRABWALK_ROUTE_TEMPLATE_IDS)[number];

export interface FrontierCrabwalkPlan {
  readonly templateId: FrontierCrabwalkRouteTemplateId;
  readonly waypointRatios: readonly number[];
  readonly initialDirection: -1 | 1;
  readonly barrageSideOrder: readonly FrontierCrownclawSide[];
}

const CRABWALK_WAYPOINT_TEMPLATES = Object.freeze([
  Object.freeze([0.24, 0.72, 0.42]),
  Object.freeze([0.76, 0.28, 0.58]),
  Object.freeze([0.32, 0.68, 0.22, 0.54])
] as const);

export const resolveFrontierCrabwalkPlan = ({
  seedKey = 'frontier-crownclaw',
  sequence = 0,
  phaseIndex = 1
}: {
  readonly seedKey?: string;
  readonly sequence?: number;
  readonly phaseIndex?: number;
}): FrontierCrabwalkPlan => {
  const branch = resolveFrontierCrownclawSeedBranch({
    seedKey: `${seedKey}:crabwalk`,
    sequence,
    branchCount: FRONTIER_CRABWALK_ROUTE_TEMPLATE_IDS.length
  });
  const baseWaypoints = CRABWALK_WAYPOINT_TEMPLATES[branch];
  const critical = phaseIndex >= 2;
  const waypointRatios = critical && baseWaypoints.length === 3
    ? Object.freeze([...baseWaypoints, branch === 0 ? 0.64 : 0.36])
    : Object.freeze([...baseWaypoints]);
  const initialDirection: -1 | 1 = waypointRatios[0] < 0.5 ? -1 : 1;
  const barrageSideOrder = Object.freeze(waypointRatios.map((_, index) => {
    const parity = positiveModulo(index + branch + (critical ? 1 : 0), 2);
    return parity === 0 ? 'port' : 'starboard';
  })) as readonly FrontierCrownclawSide[];
  return Object.freeze({
    templateId: FRONTIER_CRABWALK_ROUTE_TEMPLATE_IDS[branch],
    waypointRatios,
    initialDirection,
    barrageSideOrder
  });
};

export interface FrontierCrabwalkMovementSample {
  readonly x: number;
  readonly y: number;
  readonly xRatio: number;
  readonly direction: -1 | 0 | 1;
  readonly segmentIndex: number;
  readonly stepCycle: number;
  readonly braceEnergy: number;
  readonly firingWindow: boolean;
  readonly atWaypoint: boolean;
}

const sampleWaypointPath = (
  startRatio: number,
  waypointRatios: readonly number[],
  progress: number
) => {
  const path = [startRatio, ...waypointRatios];
  const segmentCount = Math.max(1, path.length - 1);
  const scaled = clamp(progress, 0, 1) * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaled));
  const localProgress = scaled >= segmentCount ? 1 : scaled - segmentIndex;
  const eased = smootherstep(localProgress);
  const from = path[segmentIndex];
  const to = path[segmentIndex + 1];
  return Object.freeze({
    ratio: lerp(from, to, eased),
    segmentIndex,
    localProgress,
    direction: Math.sign(to - from) as -1 | 0 | 1
  });
};

/**
 * Sideways locomotion with deliberate brace windows at route anchors. This is
 * not a moving bullet corridor: the player reads legs, shell, and alternating
 * anatomy-owned volleys while the boss repositions.
 */
export const sampleFrontierBastionCrabwalk = ({
  stage,
  progress,
  plan,
  anchorX,
  anchorY,
  arenaWidth,
  bossWidth,
  horizontalPadding = 12
}: {
  readonly stage: FrontierCrownclawTimelineStage;
  readonly progress: number;
  readonly plan: FrontierCrabwalkPlan;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly arenaWidth: number;
  readonly bossWidth: number;
  readonly horizontalPadding?: number;
}): FrontierCrabwalkMovementSample => {
  const normalizedProgress = clamp(finiteOr(progress, 0), 0, 1);
  const safeWidth = Math.max(1, finiteOr(arenaWidth, 390));
  const safeBossWidth = clamp(finiteOr(bossWidth, 160), 1, safeWidth);
  const padding = clamp(finiteOr(horizontalPadding, 12), 0, safeWidth * 0.2);
  const minimumX = padding;
  const maximumX = Math.max(minimumX, safeWidth - safeBossWidth - padding);
  const travelWidth = Math.max(0, maximumX - minimumX);
  const anchorRatio = travelWidth > 0
    ? clamp((finiteOr(anchorX, minimumX) - minimumX) / travelWidth, 0, 1)
    : 0.5;
  const firstRatio = plan.waypointRatios[0] ?? anchorRatio;
  const finalRatio = plan.waypointRatios[plan.waypointRatios.length - 1];
  const firingWaypoints = plan.waypointRatios.slice(1);
  const pathSample = stage === 'fire'
    ? sampleWaypointPath(firstRatio, firingWaypoints, normalizedProgress)
    : stage === 'warning'
      ? Object.freeze({
        ratio: lerp(anchorRatio, firstRatio, smoothstep(normalizedProgress)),
        segmentIndex: 0,
        localProgress: normalizedProgress,
        direction: Math.sign(firstRatio - anchorRatio) as -1 | 0 | 1
      })
      : stage === 'recovery'
        ? Object.freeze({
          ratio: lerp(finalRatio, anchorRatio, smoothstep(normalizedProgress)),
          segmentIndex: Math.max(0, plan.waypointRatios.length - 1),
          localProgress: normalizedProgress,
          direction: Math.sign(anchorRatio - finalRatio) as -1 | 0 | 1
        })
        : Object.freeze({
          ratio: anchorRatio,
          segmentIndex: 0,
          localProgress: 0,
          direction: 0 as const
        });
  const xRatio = pathSample.ratio;
  const waypointPulse = stage === 'fire'
    ? smoothstep(clamp((pathSample.localProgress - 0.72) / 0.16, 0, 1))
      * (1 - smoothstep(clamp((pathSample.localProgress - 0.92) / 0.08, 0, 1)))
    : 0;
  const direction = pathSample.direction;
  const stepCycle = positiveModulo(
    pathSample.segmentIndex * 0.5 + pathSample.localProgress * 2,
    1
  );

  return Object.freeze({
    x: minimumX + xRatio * travelWidth,
    y: finiteOr(anchorY, 96) + Math.sin(stepCycle * Math.PI * 2) * 1.5,
    xRatio,
    direction,
    segmentIndex: pathSample.segmentIndex,
    stepCycle,
    braceEnergy: waypointPulse,
    firingWindow: waypointPulse >= 0.52,
    atWaypoint: pathSample.localProgress >= 0.86
  });
};

export interface FrontierBarrageShotPlan {
  readonly shotIndex: number;
  readonly side: FrontierCrownclawSide;
  readonly socketId: FrontierCrownclawRuntimeSocketId;
  readonly rearSocket: boolean;
  readonly angleRadians: number;
  readonly aimedAtLockedPlayer: boolean;
}

export interface FrontierBarragePulse extends FrontierBarrageShotPlan {
  readonly elapsedFrames: number;
  readonly firing: boolean;
  readonly flashEnergy: number;
  readonly recoilEnergy: number;
}

export const resolveFrontierBarrageShotPlan = ({
  shotIndex,
  sequence = 0,
  phaseIndex = 1,
  lockedTargetAngleRadians = Math.PI / 2
}: {
  readonly shotIndex: number;
  readonly sequence?: number;
  readonly phaseIndex?: number;
  readonly lockedTargetAngleRadians?: number;
}): FrontierBarrageShotPlan => {
  const normalizedShotIndex = Math.max(0, Math.floor(finiteOr(shotIndex, 0)));
  const side: FrontierCrownclawSide = positiveModulo(
    normalizedShotIndex + Math.floor(finiteOr(sequence, 0)),
    2
  ) === 0 ? 'port' : 'starboard';
  const critical = phaseIndex >= 2;
  const rearSocket = critical && positiveModulo(normalizedShotIndex, 4) === 3;
  const socketId: FrontierCrownclawRuntimeSocketId = rearSocket
    ? side === 'port' ? 'rear-bastion-port' : 'rear-bastion-starboard'
    : side === 'port' ? 'bastion-port-port' : 'bastion-port-starboard';
  const aimedAtLockedPlayer = positiveModulo(
    normalizedShotIndex + Math.floor(finiteOr(sequence, 0)),
    critical ? 3 : 4
  ) === 0;
  const fanOffsets = critical
    ? [-0.24, 0.16, -0.08, 0.28, 0, -0.3]
    : [-0.2, 0.14, -0.06, 0.24, 0.02];
  const offset = aimedAtLockedPlayer
    ? 0
    : fanOffsets[positiveModulo(normalizedShotIndex + sequence, fanOffsets.length)];
  const angleRadians = clamp(
    finiteOr(lockedTargetAngleRadians, Math.PI / 2) + offset,
    Math.PI * 0.2,
    Math.PI * 0.8
  );
  return Object.freeze({
    shotIndex: normalizedShotIndex,
    side,
    socketId,
    rearSocket,
    angleRadians,
    aimedAtLockedPlayer
  });
};

/** One sequential barrage round per simulation cadence slot. */
export const sampleFrontierBarragePulse = ({
  elapsedFrames,
  durationFrames,
  sequence = 0,
  phaseIndex = 1,
  intervalFrames = FRONTIER_CROWNCLAW_BARRAGE_INTERVAL_FRAMES,
  lockedTargetAngleRadians = Math.PI / 2
}: {
  readonly elapsedFrames: number;
  readonly durationFrames: number;
  readonly sequence?: number;
  readonly phaseIndex?: number;
  readonly intervalFrames?: number;
  readonly lockedTargetAngleRadians?: number;
}): FrontierBarragePulse | undefined => {
  const elapsed = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const duration = Math.max(1, Math.floor(finiteOr(durationFrames, 1)));
  const interval = clamp(Math.floor(finiteOr(intervalFrames, 5)), 3, 12);
  if (elapsed < FRONTIER_CROWNCLAW_FIRST_BARRAGE_FRAME || elapsed >= duration) {
    return undefined;
  }
  const relativeFrame = elapsed - FRONTIER_CROWNCLAW_FIRST_BARRAGE_FRAME;
  const shotIndex = Math.floor(relativeFrame / interval);
  if (shotIndex >= FRONTIER_CROWNCLAW_RUNTIME_LIMITS.maximumBarrageShots) {
    return undefined;
  }
  const frameInShot = positiveModulo(relativeFrame, interval);
  if (frameInShot > 1) return undefined;
  const plan = resolveFrontierBarrageShotPlan({
    shotIndex,
    sequence,
    phaseIndex,
    lockedTargetAngleRadians
  });
  const firing = frameInShot === 0;
  return Object.freeze({
    ...plan,
    elapsedFrames: elapsed,
    firing,
    flashEnergy: firing ? 1 : 0.38,
    recoilEnergy: firing ? 1 : 0.3
  });
};

export interface FrontierCrownclawOwnedArtifactState {
  readonly chainsVisible: boolean;
  readonly portClawConnected: boolean;
  readonly starboardClawConnected: boolean;
  readonly beamActive: boolean;
  readonly barrageActive: boolean;
  readonly rearSocketsActive: boolean;
  readonly clearOnOwnerLoss: boolean;
}

/** Lifecycle cleanup contract used during action reconstruction and death. */
export const resolveFrontierCrownclawOwnedArtifactState = ({
  ownerAlive,
  actionId,
  stage,
  portChain,
  starboardChain,
  phaseState
}: {
  readonly ownerAlive: boolean;
  readonly actionId: FrontierCrownclawActionId | null;
  readonly stage: FrontierCrownclawTimelineStage;
  readonly portChain?: FrontierChainclawSample | null;
  readonly starboardChain?: FrontierChainclawSample | null;
  readonly phaseState: FrontierCrownclawPhaseState;
}): FrontierCrownclawOwnedArtifactState => {
  if (!ownerAlive) {
    return Object.freeze({
      chainsVisible: false,
      portClawConnected: false,
      starboardClawConnected: false,
      beamActive: false,
      barrageActive: false,
      rearSocketsActive: false,
      clearOnOwnerLoss: true
    });
  }
  const harpoonActive = actionId === 'chainclaw-harpoon';
  return Object.freeze({
    chainsVisible: harpoonActive,
    portClawConnected: portChain?.reseated ?? true,
    starboardClawConnected: starboardChain?.reseated ?? true,
    beamActive: actionId === 'crown-reactor-beam' && stage === 'fire',
    barrageActive: actionId === 'bastion-crabwalk-barrage' && stage === 'fire',
    rearSocketsActive: phaseState.rearBarrageSocketsEnabled,
    clearOnOwnerLoss: false
  });
};
