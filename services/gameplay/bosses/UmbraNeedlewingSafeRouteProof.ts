import {
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
  CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER,
  MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
  type BossSafeRoutePlayerProfile,
  type BossSafeRoutePoint,
  type BossSafeRouteViewport
} from './BossSafeRouteProof';
import {
  resolveBossGapRoute,
  resolveBossGapRouteDirection
} from './BossPatternRuntime';
import {
  resolveCornerAmbushBeamLock,
  type CornerAmbushBeamLock
} from './CornerAmbushBeamRuntime';
import {
  resolveCornerAmbushRamLock,
  sampleCornerAmbushRamProgress,
  type CornerAmbushRamLock
} from './CornerAmbushRamRuntime';

/**
 * Umbra's proof stays boss-owned because two of its four sentences combine
 * target-locked corner beams, a moving body ram, and radial projectiles. The
 * geometry below shares the same pure locks and path samplers as GameEngine.
 */

export const UMBRA_NEEDLEWING_SAFE_ROUTE_FPS = 60;
export const UMBRA_NEEDLEWING_SAFE_ROUTE_SEED = 0x0b1ac0de;
export const UMBRA_NEEDLEWING_GEOMETRY_UNCERTAINTY_PIXELS = 3;
export const UMBRA_NEEDLEWING_REQUIRED_RAW_CLEARANCE_PIXELS = 9;
export const UMBRA_NEEDLEWING_PHONE_VIEWPORT = (
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS.mobile
);

export const UMBRA_NEEDLEWING_PHASE_IDS = Object.freeze({
  survey: 'sandbox-umbra-wing-survey',
  hunt: 'sandbox-umbra-blackout-hunt',
  broken: 'sandbox-umbra-broken-compass'
} as const);

export type UmbraNeedlewingPhaseId = (
  typeof UMBRA_NEEDLEWING_PHASE_IDS[keyof typeof UMBRA_NEEDLEWING_PHASE_IDS]
);

export const UMBRA_NEEDLEWING_ATTACK_IDS = Object.freeze({
  wingShear: 'wing-shear-crossfire',
  orbitGap: 'orbit-gap-thread',
  cornerNeedle: 'corner-needle-lock',
  blackoutAmbush: 'blackout-ambush'
} as const);

export type UmbraNeedlewingAttackId = (
  typeof UMBRA_NEEDLEWING_ATTACK_IDS[keyof typeof UMBRA_NEEDLEWING_ATTACK_IDS]
);

type UmbraBeatKind = 'side-barrage' | 'gap-ring' | 'corner-beam' | 'corner-ram';

interface UmbraBeat {
  readonly id: string;
  readonly kind: UmbraBeatKind;
  readonly warningFrame: number;
  readonly fireFrame: number;
  readonly activeFrames: number;
  readonly sequence: number;
  readonly projectileCount?: number;
  readonly side?: 'port' | 'starboard';
}

interface UmbraAttackPlan {
  readonly attackId: UmbraNeedlewingAttackId;
  readonly phaseId: UmbraNeedlewingPhaseId;
  readonly beats: readonly UmbraBeat[];
  readonly durationFrames: number;
}

interface UmbraProjectileHazard {
  readonly id: string;
  readonly kind: 'needle' | 'wing-shard';
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  readonly radius: number;
}

interface UmbraBeamHazard {
  readonly id: string;
  readonly kind: 'corner-beam';
  readonly lock: CornerAmbushBeamLock;
  readonly expiresFrame: number;
  readonly halfThickness: number;
}

interface UmbraRamHazard {
  readonly id: string;
  readonly kind: 'corner-ram';
  readonly lock: CornerAmbushRamLock;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly radius: number;
  readonly bossHalfWidth: number;
  readonly bossHalfHeight: number;
}

type UmbraHazard = UmbraProjectileHazard | UmbraBeamHazard | UmbraRamHazard;

type UmbraBeatLock = Readonly<{
  target?: BossSafeRoutePoint;
  beam?: CornerAmbushBeamLock;
  ram?: CornerAmbushRamLock;
}>;

export interface UmbraNeedlewingSafeRouteWitnessPoint extends BossSafeRoutePoint {
  readonly frame: number;
  readonly vx: number;
  readonly vy: number;
  readonly routeTargetX: number;
  readonly routeTargetY: number;
}

export type UmbraNeedlewingSafeRouteFailureReason =
  | 'proven'
  | 'invalid-viewport'
  | 'unsupported-attack'
  | 'unsupported-phase'
  | 'route-collision'
  | 'insufficient-clearance';

export interface UmbraNeedlewingSafeRouteProof {
  readonly status: 'proven' | 'unproven';
  readonly reason: UmbraNeedlewingSafeRouteFailureReason;
  readonly attackId: UmbraNeedlewingAttackId;
  readonly phaseId: UmbraNeedlewingPhaseId;
  readonly viewportId: string;
  readonly seed: number;
  readonly checkedFrames: number;
  readonly durationFrames: number;
  readonly geometryUncertaintyPixels: number;
  readonly requiredRawClearancePixels: number;
  readonly requiredClearanceAfterUncertaintyPixels: number;
  readonly minimumRawClearancePixels: number;
  readonly minimumClearanceAfterUncertaintyPixels: number;
  readonly configurationHash: string;
  readonly routeHash?: string;
  readonly witness?: readonly UmbraNeedlewingSafeRouteWitnessPoint[];
  readonly detail: string;
}

export interface UmbraNeedlewingSafeRouteProofRequest {
  readonly attackId: UmbraNeedlewingAttackId;
  readonly phaseId: UmbraNeedlewingPhaseId;
  readonly viewport?: Readonly<BossSafeRouteViewport>;
  readonly seed?: number;
  readonly player?: Readonly<BossSafeRoutePlayerProfile>;
  readonly geometryUncertaintyPixels?: number;
}

const frame = (seconds: number) => Math.round(seconds * UMBRA_NEEDLEWING_SAFE_ROUTE_FPS);
const point = (x: number, y: number): BossSafeRoutePoint => ({ x, y });
const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);
const approach = (value: number, target: number, amount: number) => (
  value < target
    ? Math.min(value + amount, target)
    : Math.max(value - amount, target)
);
const magnitude = (x: number, y: number) => Math.hypot(x, y);

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const beat = ({
  id,
  kind,
  offsetSeconds,
  leadSeconds,
  actionSeconds,
  sequence,
  projectileCount,
  side
}: Readonly<{
  id: string;
  kind: UmbraBeatKind;
  offsetSeconds: number;
  leadSeconds: number;
  actionSeconds: number;
  sequence: number;
  projectileCount?: number;
  side?: 'port' | 'starboard';
}>): UmbraBeat => ({
  id,
  kind,
  warningFrame: frame(offsetSeconds),
  fireFrame: frame(offsetSeconds + leadSeconds),
  activeFrames: Math.max(1, frame(actionSeconds)),
  sequence,
  projectileCount,
  side
});

const wingPlan = (
  phaseId: UmbraNeedlewingPhaseId,
  offset: number,
  count: number,
  action: number
): UmbraAttackPlan => ({
  attackId: UMBRA_NEEDLEWING_ATTACK_IDS.wingShear,
  phaseId,
  beats: [
    beat({ id: `${phaseId}-port`, kind: 'side-barrage', offsetSeconds: 0, leadSeconds: 0.8, actionSeconds: action, sequence: 0, projectileCount: count, side: 'port' }),
    beat({ id: `${phaseId}-starboard`, kind: 'side-barrage', offsetSeconds: offset, leadSeconds: 0.8, actionSeconds: action, sequence: 1, projectileCount: count, side: 'starboard' })
  ],
  durationFrames: frame(offset + 0.8 + action + 2.8)
});

const ringPlan = (
  phaseId: UmbraNeedlewingPhaseId,
  offset: number,
  counts: readonly [number, number],
  sequences: readonly [number, number],
  action: number
): UmbraAttackPlan => ({
  attackId: UMBRA_NEEDLEWING_ATTACK_IDS.orbitGap,
  phaseId,
  beats: [
    beat({ id: `${phaseId}-ring-a`, kind: 'gap-ring', offsetSeconds: 0, leadSeconds: 0.8, actionSeconds: action, sequence: sequences[0], projectileCount: counts[0] }),
    beat({ id: `${phaseId}-ring-b`, kind: 'gap-ring', offsetSeconds: offset, leadSeconds: 0.8, actionSeconds: action, sequence: sequences[1], projectileCount: counts[1] })
  ],
  durationFrames: frame(offset + 0.8 + action + 4.2)
});

const cornerPlan = (
  phaseId: UmbraNeedlewingPhaseId,
  offset: number,
  sequences: readonly [number, number],
  lead: number,
  action: number
): UmbraAttackPlan => ({
  attackId: UMBRA_NEEDLEWING_ATTACK_IDS.cornerNeedle,
  phaseId,
  beats: [
    beat({ id: `${phaseId}-corner-a`, kind: 'corner-beam', offsetSeconds: 0, leadSeconds: lead, actionSeconds: action, sequence: sequences[0] }),
    beat({ id: `${phaseId}-corner-b`, kind: 'corner-beam', offsetSeconds: offset, leadSeconds: lead, actionSeconds: action, sequence: sequences[1] })
  ],
  durationFrames: frame(offset + lead + action + 1.1)
});

const signaturePlan = (
  phaseId: UmbraNeedlewingPhaseId,
  specifications: readonly Readonly<{
    id: string;
    kind: UmbraBeatKind;
    offset: number;
    lead: number;
    action: number;
    sequence: number;
    projectileCount?: number;
    repeatOffset?: number;
  }>[]
): UmbraAttackPlan => {
  const beats = specifications.flatMap((specification) => {
    const primary = beat({
      id: `${phaseId}-${specification.id}`,
      kind: specification.kind,
      offsetSeconds: specification.offset,
      leadSeconds: specification.lead,
      actionSeconds: specification.action,
      sequence: specification.sequence,
      projectileCount: specification.projectileCount
    });
    return specification.repeatOffset === undefined
      ? [primary]
      : [primary, beat({
          id: `${phaseId}-${specification.id}-repeat`,
          kind: specification.kind,
          offsetSeconds: specification.offset + specification.repeatOffset,
          leadSeconds: specification.lead,
          actionSeconds: specification.action,
          sequence: specification.sequence + 1,
          projectileCount: specification.projectileCount
        })];
  });
  const last = beats.reduce((latest, candidate) => (
    candidate.fireFrame + candidate.activeFrames > latest.fireFrame + latest.activeFrames
      ? candidate
      : latest
  ));
  return {
    attackId: UMBRA_NEEDLEWING_ATTACK_IDS.blackoutAmbush,
    phaseId,
    beats,
    durationFrames: last.fireFrame + last.activeFrames + frame(4.2)
  };
};

const PLANS: Readonly<Record<UmbraNeedlewingPhaseId, Readonly<Record<UmbraNeedlewingAttackId, UmbraAttackPlan>>>> = Object.freeze({
  [UMBRA_NEEDLEWING_PHASE_IDS.survey]: Object.freeze({
    [UMBRA_NEEDLEWING_ATTACK_IDS.wingShear]: wingPlan(UMBRA_NEEDLEWING_PHASE_IDS.survey, 1.3, 5, 0.35),
    [UMBRA_NEEDLEWING_ATTACK_IDS.orbitGap]: ringPlan(UMBRA_NEEDLEWING_PHASE_IDS.survey, 1.3, [14, 16], [0, 1], 0.35),
    [UMBRA_NEEDLEWING_ATTACK_IDS.cornerNeedle]: cornerPlan(UMBRA_NEEDLEWING_PHASE_IDS.survey, 1.55, [0, 1], 0.9, 0.45),
    [UMBRA_NEEDLEWING_ATTACK_IDS.blackoutAmbush]: signaturePlan(UMBRA_NEEDLEWING_PHASE_IDS.survey, [
      { id: 'ram', kind: 'corner-ram', offset: 0, lead: 1, action: 0.65, sequence: 1 },
      { id: 'beam-left', kind: 'corner-beam', offset: 1.85, lead: 0.9, action: 0.45, sequence: 0 },
      { id: 'beam-right', kind: 'corner-beam', offset: 3.4, lead: 0.9, action: 0.45, sequence: 1 },
      { id: 'exit-ring', kind: 'gap-ring', offset: 4.95, lead: 0.8, action: 0.4, sequence: 2, projectileCount: 14 }
    ])
  }),
  [UMBRA_NEEDLEWING_PHASE_IDS.hunt]: Object.freeze({
    [UMBRA_NEEDLEWING_ATTACK_IDS.wingShear]: wingPlan(UMBRA_NEEDLEWING_PHASE_IDS.hunt, 1.15, 6, 0.3),
    [UMBRA_NEEDLEWING_ATTACK_IDS.orbitGap]: ringPlan(UMBRA_NEEDLEWING_PHASE_IDS.hunt, 1.15, [16, 16], [2, 3], 0.3),
    [UMBRA_NEEDLEWING_ATTACK_IDS.cornerNeedle]: cornerPlan(UMBRA_NEEDLEWING_PHASE_IDS.hunt, 1.4, [0, 1], 0.85, 0.42),
    [UMBRA_NEEDLEWING_ATTACK_IDS.blackoutAmbush]: signaturePlan(UMBRA_NEEDLEWING_PHASE_IDS.hunt, [
      { id: 'ram', kind: 'corner-ram', offset: 0, lead: 0.95, action: 0.58, sequence: 1 },
      { id: 'beam-left', kind: 'corner-beam', offset: 1.75, lead: 0.85, action: 0.42, sequence: 2 },
      { id: 'beam-right', kind: 'corner-beam', offset: 3.25, lead: 0.85, action: 0.42, sequence: 3 },
      { id: 'exit-ring', kind: 'gap-ring', offset: 4.75, lead: 0.8, action: 0.38, sequence: 4, projectileCount: 18, repeatOffset: 1.15 },
      { id: 'final-beam', kind: 'corner-beam', offset: 7.25, lead: 0.85, action: 0.42, sequence: 5 }
    ])
  }),
  [UMBRA_NEEDLEWING_PHASE_IDS.broken]: Object.freeze({
    [UMBRA_NEEDLEWING_ATTACK_IDS.wingShear]: wingPlan(UMBRA_NEEDLEWING_PHASE_IDS.broken, 0.95, 7, 0.28),
    [UMBRA_NEEDLEWING_ATTACK_IDS.orbitGap]: ringPlan(UMBRA_NEEDLEWING_PHASE_IDS.broken, 0.95, [16, 18], [5, 6], 0.28),
    [UMBRA_NEEDLEWING_ATTACK_IDS.cornerNeedle]: cornerPlan(UMBRA_NEEDLEWING_PHASE_IDS.broken, 1.15, [1, 0], 0.82, 0.38),
    [UMBRA_NEEDLEWING_ATTACK_IDS.blackoutAmbush]: signaturePlan(UMBRA_NEEDLEWING_PHASE_IDS.broken, [
      { id: 'beam-right', kind: 'corner-beam', offset: 0, lead: 0.82, action: 0.38, sequence: 3 },
      { id: 'ram-left', kind: 'corner-ram', offset: 1.4, lead: 0.85, action: 0.5, sequence: 2 },
      { id: 'beam-left', kind: 'corner-beam', offset: 2.95, lead: 0.82, action: 0.38, sequence: 4 },
      { id: 'ram-right', kind: 'corner-ram', offset: 4.35, lead: 0.85, action: 0.5, sequence: 3 },
      { id: 'exit-ring', kind: 'gap-ring', offset: 5.9, lead: 0.8, action: 0.35, sequence: 7, projectileCount: 18, repeatOffset: 1 },
      { id: 'final-beam', kind: 'corner-beam', offset: 8.2, lead: 0.82, action: 0.38, sequence: 5 },
      { id: 'collapse-ring', kind: 'gap-ring', offset: 9.55, lead: 0.8, action: 0.35, sequence: 8, projectileCount: 18 }
    ])
  })
});

const resolvePlan = (
  attackId: UmbraNeedlewingAttackId,
  phaseId: UmbraNeedlewingPhaseId
) => PLANS[phaseId]?.[attackId];

const bossMetrics = (viewport: Readonly<BossSafeRouteViewport>) => {
  const width = Math.min(Math.round(220 * 1.75), Math.round(viewport.width * 0.82));
  const height = Math.round(width * (320 / 512));
  return { width, height, core: point(viewport.width / 2, 282) };
};

const initialPosition = (
  attackId: UmbraNeedlewingAttackId,
  viewport: Readonly<BossSafeRouteViewport>
) => attackId === UMBRA_NEEDLEWING_ATTACK_IDS.orbitGap
  ? point(viewport.width * 0.4, viewport.height * 0.78)
  : attackId === UMBRA_NEEDLEWING_ATTACK_IDS.wingShear
    ? point(viewport.width * 0.795, viewport.height * 0.658)
  : attackId === UMBRA_NEEDLEWING_ATTACK_IDS.blackoutAmbush
    ? point(viewport.width * 0.5, viewport.height * 0.7)
    : point(viewport.width * 0.5, viewport.height * 0.82);

const sideOrigin = (
  side: 'port' | 'starboard',
  viewport: Readonly<BossSafeRouteViewport>
) => point(viewport.width * (side === 'port' ? 0.25 : 0.75), 305);

const lockBeat = (
  beat: Readonly<UmbraBeat>,
  playerCenter: Readonly<BossSafeRoutePoint>,
  viewport: Readonly<BossSafeRouteViewport>
): UmbraBeatLock => {
  const metrics = bossMetrics(viewport);
  if (beat.kind === 'side-barrage') return { target: point(playerCenter.x, playerCenter.y) };
  if (beat.kind === 'corner-beam') {
    return {
      beam: resolveCornerAmbushBeamLock({
        sequence: beat.sequence,
        arenaWidth: viewport.width,
        arenaHeight: viewport.height,
        bossWidth: metrics.width,
        bossHeight: metrics.height,
        playerCenterX: playerCenter.x,
        playerCenterY: playerCenter.y,
        mobileProfile: true
      })
    };
  }
  if (beat.kind === 'corner-ram') {
    return {
      ram: resolveCornerAmbushRamLock({
        sequence: beat.sequence,
        arenaWidth: viewport.width,
        arenaHeight: viewport.height,
        bossWidth: metrics.width,
        bossHeight: metrics.height,
        playerCenterX: playerCenter.x,
        playerCenterY: playerCenter.y,
        mobileProfile: true
      })
    };
  }
  return {};
};

const spawnProjectiles = (
  beat: Readonly<UmbraBeat>,
  lock: Readonly<UmbraBeatLock>,
  viewport: Readonly<BossSafeRouteViewport>,
  uncertainty: number
): UmbraProjectileHazard[] => {
  if (beat.kind === 'side-barrage' && beat.side && lock.target) {
    const origin = sideOrigin(beat.side, viewport);
    const count = Math.max(1, Math.min(24, Math.round(beat.projectileCount ?? 5)));
    const baseAngle = Math.atan2(lock.target.y - origin.y, lock.target.x - origin.x);
    return Array.from({ length: count }, (_, index) => {
      const offset = index - (count - 1) / 2;
      const angle = baseAngle + offset * 0.115;
      const speed = 5.4 * (1 + Math.abs(offset) * 0.018);
      return {
        id: `${beat.id}-needle-${index}`,
        kind: 'needle' as const,
        x: origin.x,
        y: origin.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 7 + uncertainty
      };
    });
  }
  if (beat.kind === 'gap-ring') {
    const metrics = bossMetrics(viewport);
    const count = Math.max(1, Math.min(24, Math.round(beat.projectileCount ?? 14)));
    const route = resolveBossGapRoute({
      arenaWidth: viewport.width,
      arenaHeight: viewport.height,
      originX: metrics.core.x,
      originY: metrics.core.y,
      sequence: beat.sequence,
      direction: resolveBossGapRouteDirection(undefined, beat.sequence)
    });
    const gapHalfWidth = 0.5;
    return Array.from({ length: count }, (_, index): UmbraProjectileHazard[] => {
      const angle = Math.PI * 2 * index / count;
      const gapDistance = Math.abs(Math.atan2(
        Math.sin(angle - route.angleRadians),
        Math.cos(angle - route.angleRadians)
      ));
      if (gapDistance < gapHalfWidth) return [];
      return [{
        id: `${beat.id}-shard-${index}`,
        kind: 'wing-shard',
        x: metrics.core.x,
        y: metrics.core.y,
        vx: Math.cos(angle) * 4.176,
        vy: Math.sin(angle) * 4.176,
        radius: 6 + uncertainty
      }];
    }).flat();
  }
  return [];
};

const pointToAabbClearance = (
  center: Readonly<BossSafeRoutePoint>,
  radius: number,
  playerCenter: Readonly<BossSafeRoutePoint>,
  player: Readonly<BossSafeRoutePlayerProfile>
) => {
  const dx = Math.max(Math.abs(center.x - playerCenter.x) - player.collisionWidth / 2, 0);
  const dy = Math.max(Math.abs(center.y - playerCenter.y) - player.collisionHeight / 2, 0);
  return Math.hypot(dx, dy) - radius;
};

const beamClearance = (
  hazard: Readonly<UmbraBeamHazard>,
  playerCenter: Readonly<BossSafeRoutePoint>,
  player: Readonly<BossSafeRoutePlayerProfile>
) => {
  const lock = hazard.lock;
  const cosine = Math.cos(lock.angleRadians);
  const sine = Math.sin(lock.angleRadians);
  const deltaX = playerCenter.x - lock.beamCenterX;
  const deltaY = playerCenter.y - lock.beamCenterY;
  const localX = cosine * deltaX + sine * deltaY;
  const localY = -sine * deltaX + cosine * deltaY;
  const projectedHalfWidth = (
    Math.abs(cosine) * player.collisionWidth
    + Math.abs(sine) * player.collisionHeight
  ) / 2;
  const projectedHalfHeight = (
    Math.abs(sine) * player.collisionWidth
    + Math.abs(cosine) * player.collisionHeight
  ) / 2;
  const gapX = Math.abs(localX) - lock.beamLength / 2 - projectedHalfWidth;
  const gapY = Math.abs(localY) - hazard.halfThickness - projectedHalfHeight;
  return Math.max(gapX, gapY);
};

const ramCenter = (hazard: Readonly<UmbraRamHazard>, currentFrame: number) => {
  const rawProgress = clamp(
    (currentFrame - hazard.startFrame) / Math.max(1, hazard.endFrame - hazard.startFrame),
    0,
    1
  );
  const progress = sampleCornerAmbushRamProgress(rawProgress);
  return point(
    hazard.lock.startX + (hazard.lock.exitX - hazard.lock.startX) * progress
      + hazard.bossHalfWidth,
    hazard.lock.startY + (hazard.lock.exitY - hazard.lock.startY) * progress
      + hazard.bossHalfHeight
  );
};

const hazardClearance = (
  hazard: Readonly<UmbraHazard>,
  currentFrame: number,
  playerCenter: Readonly<BossSafeRoutePoint>,
  player: Readonly<BossSafeRoutePlayerProfile>
) => {
  if (hazard.kind === 'corner-beam') return beamClearance(hazard, playerCenter, player);
  if (hazard.kind === 'corner-ram') {
    return pointToAabbClearance(
      ramCenter(hazard, currentFrame),
      hazard.radius,
      playerCenter,
      player
    );
  }
  return pointToAabbClearance(hazard, hazard.radius, playerCenter, player);
};

const routeTargetForWarning = (
  beat: Readonly<UmbraBeat>,
  lock: Readonly<UmbraBeatLock>,
  current: Readonly<BossSafeRoutePoint>,
  viewport: Readonly<BossSafeRouteViewport>,
  player: Readonly<BossSafeRoutePlayerProfile>,
  uncertainty: number
) => {
  const minimumX = player.collisionWidth / 2 + uncertainty + 12;
  const maximumX = viewport.width - player.collisionWidth / 2 - uncertainty - 12;
  const minimumY = 430;
  const maximumY = viewport.height - player.collisionHeight / 2 - uncertainty - 12;
  if (beat.kind === 'gap-ring') {
    const metrics = bossMetrics(viewport);
    const route = resolveBossGapRoute({
      arenaWidth: viewport.width,
      arenaHeight: viewport.height,
      originX: metrics.core.x,
      originY: metrics.core.y,
      sequence: beat.sequence,
      direction: resolveBossGapRouteDirection(undefined, beat.sequence)
    });
    return point(
      clamp(route.x, minimumX, maximumX),
      clamp(route.y, minimumY, maximumY)
    );
  }
  if (beat.kind === 'corner-ram' && lock.ram) {
    const directionX = Math.cos(lock.ram.angleRadians);
    const directionY = Math.sin(lock.ram.angleRadians);
    const candidates = [1, -1].map((sign) => point(
      clamp(current.x + -directionY * 142 * sign, minimumX, maximumX),
      clamp(current.y + directionX * 142 * sign, minimumY, maximumY)
    ));
    return candidates.reduce((best, candidate) => {
      const normalX = -directionY;
      const normalY = directionX;
      const bestClearance = Math.abs(
        (best.x - current.x) * normalX + (best.y - current.y) * normalY
      );
      const candidateClearance = Math.abs(
        (candidate.x - current.x) * normalX + (candidate.y - current.y) * normalY
      );
      return candidateClearance > bestClearance ? candidate : best;
    });
  }
  if (beat.kind === 'corner-beam' && lock.beam) {
    const directionX = Math.cos(lock.beam.angleRadians);
    const directionY = Math.sin(lock.beam.angleRadians);
    const candidates = [1, -1].map((sign) => point(
      clamp(current.x + -directionY * 120 * sign, minimumX, maximumX),
      clamp(current.y + directionX * 120 * sign, minimumY, maximumY)
    ));
    return candidates.reduce((best, candidate) => {
      const bestClearance = Math.abs(
        -directionY * (best.x - lock.beam.originX)
        + directionX * (best.y - lock.beam.originY)
      );
      const candidateClearance = Math.abs(
        -directionY * (candidate.x - lock.beam.originX)
        + directionX * (candidate.y - lock.beam.originY)
      );
      return candidateClearance > bestClearance ? candidate : best;
    });
  }
  if (beat.kind === 'side-barrage' && beat.side === 'starboard') {
    return point(
      clamp(viewport.width * 0.231, minimumX, maximumX),
      clamp(viewport.height * 0.675, minimumY, maximumY)
    );
  }
  if (beat.kind === 'side-barrage') {
    return point(
      clamp(viewport.width * 0.385, minimumX, maximumX),
      clamp(viewport.height * 0.818, minimumY, maximumY)
    );
  }
  return point(
    current.x <= viewport.width / 2 ? maximumX : minimumX,
    clamp(current.y, minimumY, maximumY)
  );
};

const proofConfigurationHash = (
  plan: Readonly<UmbraAttackPlan>,
  viewport: Readonly<BossSafeRouteViewport>,
  seed: number,
  player: Readonly<BossSafeRoutePlayerProfile>,
  uncertainty: number
) => fnv1a(JSON.stringify({
  revision: 'umbra-needlewing-route-v1',
  plan,
  viewport,
  seed,
  player,
  uncertainty,
  fps: UMBRA_NEEDLEWING_SAFE_ROUTE_FPS,
  requiredRawClearancePixels: UMBRA_NEEDLEWING_REQUIRED_RAW_CLEARANCE_PIXELS
}));

export const proveUmbraNeedlewingSafeRoute = (
  request: Readonly<UmbraNeedlewingSafeRouteProofRequest>
): UmbraNeedlewingSafeRouteProof => {
  const viewport = request.viewport ?? UMBRA_NEEDLEWING_PHONE_VIEWPORT;
  const seed = Math.max(0, Math.floor(Number(request.seed) || UMBRA_NEEDLEWING_SAFE_ROUTE_SEED));
  const player = request.player ?? CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER;
  const uncertainty = Math.max(
    0,
    Number(request.geometryUncertaintyPixels)
      || UMBRA_NEEDLEWING_GEOMETRY_UNCERTAINTY_PIXELS
  );
  const plan = resolvePlan(request.attackId, request.phaseId);
  const base = {
    attackId: request.attackId,
    phaseId: request.phaseId,
    viewportId: viewport.id,
    seed,
    checkedFrames: 0,
    durationFrames: plan?.durationFrames ?? 0,
    geometryUncertaintyPixels: uncertainty,
    requiredRawClearancePixels: UMBRA_NEEDLEWING_REQUIRED_RAW_CLEARANCE_PIXELS,
    requiredClearanceAfterUncertaintyPixels: MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS,
    minimumRawClearancePixels: Number.NEGATIVE_INFINITY,
    minimumClearanceAfterUncertaintyPixels: Number.NEGATIVE_INFINITY,
    configurationHash: plan
      ? proofConfigurationHash(plan, viewport, seed, player, uncertainty)
      : fnv1a(`${request.attackId}:${request.phaseId}`)
  };
  if (viewport.width !== 390 || viewport.height !== 844 || !viewport.mobileProfile) {
    return {
      ...base,
      status: 'unproven',
      reason: 'invalid-viewport',
      detail: 'Umbra must be proven in the canonical 390x844 mobile arena.'
    };
  }
  if (!plan) {
    return {
      ...base,
      status: 'unproven',
      reason: PLANS[request.phaseId] ? 'unsupported-attack' : 'unsupported-phase',
      detail: 'No authored Umbra attack plan matches this attack and phase.'
    };
  }

  const locks = new Map<string, UmbraBeatLock>();
  const hazards: UmbraHazard[] = [];
  const start = initialPosition(request.attackId, viewport);
  let x = start.x;
  let y = start.y;
  let vx = 0;
  let vy = 0;
  let routeTarget = point(x, y);
  let minimumClearanceAfterUncertainty = Number.POSITIVE_INFINITY;
  let collisionFrame: number | undefined;
  let collisionHazard: string | undefined;
  const witness: UmbraNeedlewingSafeRouteWitnessPoint[] = [];
  const minimumX = player.collisionWidth / 2 + uncertainty;
  const maximumX = viewport.width - player.collisionWidth / 2 - uncertainty;
  const minimumY = 410;
  const maximumY = viewport.height - player.collisionHeight / 2 - uncertainty;

  for (let currentFrame = 0; currentFrame < plan.durationFrames; currentFrame += 1) {
    for (const currentBeat of plan.beats) {
      if (currentBeat.warningFrame === currentFrame) {
        const lock = lockBeat(currentBeat, point(x, y), viewport);
        locks.set(currentBeat.id, lock);
        routeTarget = routeTargetForWarning(
          currentBeat,
          lock,
          point(x, y),
          viewport,
          player,
          uncertainty
        );
      }
      if (currentBeat.fireFrame === currentFrame) {
        const lock = locks.get(currentBeat.id) ?? {};
        hazards.push(...spawnProjectiles(currentBeat, lock, viewport, uncertainty));
        if (currentBeat.kind === 'side-barrage' && currentBeat.side === 'starboard') {
          routeTarget = point(
            clamp(viewport.width * 0.231, minimumX + 12, maximumX - 12),
            clamp(viewport.height * 0.545, minimumY, maximumY)
          );
        }
        if (currentBeat.kind === 'corner-beam' && lock.beam) {
          hazards.push({
            id: `${currentBeat.id}-beam`,
            kind: 'corner-beam',
            lock: lock.beam,
            expiresFrame: currentFrame + currentBeat.activeFrames,
            halfThickness: 9 + uncertainty
          });
        }
        if (currentBeat.kind === 'corner-ram' && lock.ram) {
          const metrics = bossMetrics(viewport);
          hazards.push({
            id: `${currentBeat.id}-ram`,
            kind: 'corner-ram',
            lock: lock.ram,
            startFrame: currentFrame,
            endFrame: currentFrame + currentBeat.activeFrames,
            // The opaque structural mask is substantially narrower than the
            // 320 px responsive sprite bounds. This 58 px core radius plus
            // uncertainty conservatively covers its damaging center mass.
            radius: 58 + uncertainty,
            bossHalfWidth: metrics.width / 2,
            bossHalfHeight: metrics.height / 2
          });
        }
      }
    }

    const desiredVx = clamp(
      (routeTarget.x - x) * 0.12,
      -player.maximumSpeedPerFrame,
      player.maximumSpeedPerFrame
    );
    const desiredVy = clamp(
      (routeTarget.y - y) * 0.12,
      -player.maximumSpeedPerFrame,
      player.maximumSpeedPerFrame
    );
    vx = approach(vx, desiredVx, player.accelerationPerFrame);
    vy = approach(vy, desiredVy, player.accelerationPerFrame);
    const speed = magnitude(vx, vy);
    if (speed > player.maximumSpeedPerFrame) {
      vx = vx / speed * player.maximumSpeedPerFrame;
      vy = vy / speed * player.maximumSpeedPerFrame;
    }
    x = clamp(x + vx, minimumX, maximumX);
    y = clamp(y + vy, minimumY, maximumY);

    for (const hazard of hazards) {
      if (hazard.kind === 'needle' || hazard.kind === 'wing-shard') {
        hazard.x += hazard.vx;
        hazard.y += hazard.vy;
      }
    }
    const activeHazards = hazards.filter((hazard) => {
      if (hazard.kind === 'corner-beam') return currentFrame < hazard.expiresFrame;
      if (hazard.kind === 'corner-ram') return currentFrame <= hazard.endFrame;
      return hazard.x >= -hazard.radius * 2
        && hazard.x <= viewport.width + hazard.radius * 2
        && hazard.y >= -hazard.radius * 2
        && hazard.y <= viewport.height + hazard.radius * 2;
    });
    hazards.splice(0, hazards.length, ...activeHazards);

    for (const hazard of hazards) {
      const clearance = hazardClearance(hazard, currentFrame, point(x, y), player);
      if (clearance < minimumClearanceAfterUncertainty) {
        minimumClearanceAfterUncertainty = clearance;
      }
      if (clearance <= 0 && collisionFrame === undefined) {
        collisionFrame = currentFrame;
        collisionHazard = hazard.id;
      }
    }
    witness.push({
      frame: currentFrame,
      x,
      y,
      vx,
      vy,
      routeTargetX: routeTarget.x,
      routeTargetY: routeTarget.y
    });
    if (collisionFrame !== undefined) break;
  }

  const routeHash = fnv1a(witness.map((sample) => [
    sample.frame,
    sample.x.toFixed(3),
    sample.y.toFixed(3),
    sample.vx.toFixed(3),
    sample.vy.toFixed(3)
  ].join(':')).join('|'));
  const minimumRawClearance = minimumClearanceAfterUncertainty + uncertainty;
  if (collisionFrame !== undefined) {
    return {
      ...base,
      status: 'unproven',
      reason: 'route-collision',
      checkedFrames: witness.length,
      minimumRawClearancePixels: minimumRawClearance,
      minimumClearanceAfterUncertaintyPixels: minimumClearanceAfterUncertainty,
      routeHash,
      witness,
      detail: `The deterministic route collided with ${collisionHazard} at frame ${collisionFrame}.`
    };
  }
  if (
    !Number.isFinite(minimumRawClearance)
    || minimumRawClearance < UMBRA_NEEDLEWING_REQUIRED_RAW_CLEARANCE_PIXELS
    || minimumClearanceAfterUncertainty < MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS
  ) {
    return {
      ...base,
      status: 'unproven',
      reason: 'insufficient-clearance',
      checkedFrames: witness.length,
      minimumRawClearancePixels: minimumRawClearance,
      minimumClearanceAfterUncertaintyPixels: minimumClearanceAfterUncertainty,
      routeHash,
      witness,
      detail: `The deterministic route retained ${minimumRawClearance.toFixed(2)} px raw and ${minimumClearanceAfterUncertainty.toFixed(2)} px after uncertainty.`
    };
  }
  return {
    ...base,
    status: 'proven',
    reason: 'proven',
    checkedFrames: witness.length,
    minimumRawClearancePixels: minimumRawClearance,
    minimumClearanceAfterUncertaintyPixels: minimumClearanceAfterUncertainty,
    routeHash,
    witness,
    detail: `A continuous baseline-speed route retained ${minimumRawClearance.toFixed(2)} px raw and ${minimumClearanceAfterUncertainty.toFixed(2)} px after ${uncertainty} px geometry uncertainty.`
  };
};

export interface UmbraNeedlewingSafeRouteMatrixEntry {
  readonly attackId: UmbraNeedlewingAttackId;
  readonly phaseId: UmbraNeedlewingPhaseId;
  readonly proof: UmbraNeedlewingSafeRouteProof;
}

export const buildUmbraNeedlewingSafeRouteMatrix = () => (
  Object.values(UMBRA_NEEDLEWING_PHASE_IDS).flatMap((phaseId) => (
    Object.values(UMBRA_NEEDLEWING_ATTACK_IDS).map((attackId) => ({
      attackId,
      phaseId,
      proof: proveUmbraNeedlewingSafeRoute({ attackId, phaseId })
    }))
  ))
);
