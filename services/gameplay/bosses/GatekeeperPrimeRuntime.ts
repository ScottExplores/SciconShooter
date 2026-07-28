export const GATEKEEPER_PRIME_BOSS_ID = 'gatekeeper-prime' as const;

export type GatekeeperPrimeAttackId =
  | 'rail-fan'
  | 'core-lane'
  | 'twin-gate';

export type GatekeeperPrimeAttackStage =
  | 'settle'
  | 'telegraph'
  | 'fire'
  | 'recovery'
  | 'return';

export type GatekeeperPrimePhaseId =
  | 'prime-sentinel'
  | 'prime-pressure'
  | 'prime-overdrive';

export interface GatekeeperPrimePhase {
  readonly id: GatekeeperPrimePhaseId;
  readonly index: 0 | 1 | 2;
  readonly verticalExcursionPixels: number;
  readonly maximumPatrolSpeedPixelsPerFrame: number;
  readonly railPulseFrames: readonly number[];
}

export interface GatekeeperPrimeAttackSample {
  readonly attackId: GatekeeperPrimeAttackId;
  readonly attackIndex: 0 | 1 | 2;
  readonly localFrame: number;
  readonly stage: GatekeeperPrimeAttackStage;
  readonly telegraphStartFrame: number;
  readonly fireStartFrame: number;
  readonly fireEndFrame: number;
  readonly recoveryEndFrame: number;
}

export interface GatekeeperPrimePatrolSample {
  readonly x: number;
  readonly y: number;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly horizontalPeriodFrames: number;
  readonly phase: GatekeeperPrimePhase;
  readonly attack: GatekeeperPrimeAttackSample;
}

export interface GatekeeperPrimeRouteProof {
  readonly attackId: GatekeeperPrimeAttackId;
  readonly viewportId: string;
  readonly fixedSeed: string;
  readonly routeHash: string;
  readonly minimumClearancePixelsAfterUncertainty: number;
  readonly geometryUncertaintyPixels: 3;
  readonly playerCollisionWidth: number;
  readonly playerCollisionHeight: number;
  readonly checkedFrames: number;
  readonly passes: boolean;
  readonly routeKind: 'locked-aim-dodge' | 'edge-lane' | 'moving-center-corridor';
}

export const GATEKEEPER_PRIME_FIXED_SEED = 'gatekeeper-prime-mission-05-v1';
export const GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES = 252;
export const GATEKEEPER_PRIME_TELEGRAPH_START_FRAME = 24;
export const GATEKEEPER_PRIME_FIRE_START_FRAME = 72;
export const GATEKEEPER_PRIME_FIRE_END_FRAME = 116;
export const GATEKEEPER_PRIME_RECOVERY_END_FRAME = 180;
export const GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS = 3 as const;
export const GATEKEEPER_PRIME_MINIMUM_ROUTE_CLEARANCE_PIXELS = 6;
export const GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP = 18;
export const GATEKEEPER_PRIME_DESKTOP_PROJECTILE_CAP = 24;

const ATTACK_ORDER = Object.freeze([
  'rail-fan',
  'core-lane',
  'twin-gate'
] as const);

const PLAYER_COLLISION = Object.freeze({
  width: 51.24,
  height: 63.44,
  maximumSpeedPerFrame: 2.5,
  accelerationPerFrame: 0.38
});

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const smoothstep = (value: number) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

export const resolveGatekeeperPrimePhase = (
  healthRatio: number
): GatekeeperPrimePhase => {
  const health = clamp(Number(healthRatio) || 0, 0, 1);
  if (health <= 0.32) {
    return Object.freeze({
      id: 'prime-overdrive',
      index: 2,
      verticalExcursionPixels: 38,
      maximumPatrolSpeedPixelsPerFrame: 1.72,
      railPulseFrames: Object.freeze([72, 82, 92, 102])
    });
  }
  if (health <= 0.64) {
    return Object.freeze({
      id: 'prime-pressure',
      index: 1,
      verticalExcursionPixels: 26,
      maximumPatrolSpeedPixelsPerFrame: 1.58,
      railPulseFrames: Object.freeze([72, 84, 96])
    });
  }
  return Object.freeze({
    id: 'prime-sentinel',
    index: 0,
    verticalExcursionPixels: 14,
    maximumPatrolSpeedPixelsPerFrame: 1.42,
    railPulseFrames: Object.freeze([72, 86, 100])
  });
};

export const sampleGatekeeperPrimeAttack = (
  combatFrame: number
): GatekeeperPrimeAttackSample => {
  const frame = Math.max(0, Math.floor(Number(combatFrame) || 0));
  const localFrame = frame % GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES;
  const attackIndex = (Math.floor(frame / GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES) % 3) as 0 | 1 | 2;
  const stage: GatekeeperPrimeAttackStage = localFrame < GATEKEEPER_PRIME_TELEGRAPH_START_FRAME
    ? 'settle'
    : localFrame < GATEKEEPER_PRIME_FIRE_START_FRAME
      ? 'telegraph'
      : localFrame < GATEKEEPER_PRIME_FIRE_END_FRAME
        ? 'fire'
        : localFrame < GATEKEEPER_PRIME_RECOVERY_END_FRAME
          ? 'recovery'
          : 'return';
  return Object.freeze({
    attackId: ATTACK_ORDER[attackIndex],
    attackIndex,
    localFrame,
    stage,
    telegraphStartFrame: GATEKEEPER_PRIME_TELEGRAPH_START_FRAME,
    fireStartFrame: GATEKEEPER_PRIME_FIRE_START_FRAME,
    fireEndFrame: GATEKEEPER_PRIME_FIRE_END_FRAME,
    recoveryEndFrame: GATEKEEPER_PRIME_RECOVERY_END_FRAME
  });
};

/**
 * A bounded, upper-arena patrol. The period scales with the available width,
 * so desktop never turns into a high-speed traverse while mobile still reads
 * like a classic left/right arcade boss. Vertical motion deliberately follows
 * descend -> hold -> rise -> reset and never targets the player.
 */
export const sampleGatekeeperPrimePatrol = ({
  combatFrame,
  healthRatio,
  viewportWidth,
  viewportHeight,
  bossWidth,
  bossHeight
}: {
  readonly combatFrame: number;
  readonly healthRatio: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
}): GatekeeperPrimePatrolSample => {
  const frame = Math.max(0, Math.floor(Number(combatFrame) || 0));
  const phase = resolveGatekeeperPrimePhase(healthRatio);
  const attack = sampleGatekeeperPrimeAttack(frame);
  const edgeInset = viewportWidth < 520 ? 12 : 18;
  const minimumX = edgeInset;
  const maximumX = Math.max(minimumX, viewportWidth - bossWidth - edgeInset);
  const span = Math.max(0, maximumX - minimumX);
  const minimumPeriod = phase.index === 0 ? 360 : phase.index === 1 ? 336 : 312;
  const speedBoundPeriod = Math.ceil(
    (Math.PI * span) / Math.max(0.1, phase.maximumPatrolSpeedPixelsPerFrame)
  );
  const horizontalPeriodFrames = Math.max(minimumPeriod, speedBoundPeriod);
  const horizontalPhase = (frame % horizontalPeriodFrames) / horizontalPeriodFrames;
  const x = minimumX + span * (0.5 - Math.cos(horizontalPhase * Math.PI * 2) * 0.5);

  const minimumY = clamp(
    viewportHeight * (viewportWidth < 520 ? 0.092 : 0.105),
    viewportWidth < 520 ? 70 : 74,
    Math.max(74, viewportHeight * 0.15)
  );
  const maximumAllowedY = Math.max(
    minimumY,
    Math.min(viewportHeight * 0.26, viewportHeight * 0.43 - bossHeight)
  );
  const attackDepthScale = attack.attackId === 'rail-fan'
    ? 0.68
    : attack.attackId === 'core-lane'
      ? 0.84
      : 1;
  const excursion = Math.min(
    phase.verticalExcursionPixels * attackDepthScale,
    Math.max(0, maximumAllowedY - minimumY)
  );
  const normalizedFrame = attack.localFrame / GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES;
  const verticalProgress = normalizedFrame < 0.44
    ? smoothstep(normalizedFrame / 0.44)
    : normalizedFrame < 0.58
      ? 1
      : normalizedFrame < 0.82
        ? 1 - smoothstep((normalizedFrame - 0.58) / 0.24)
        : 0;
  const y = minimumY + excursion * verticalProgress;

  return Object.freeze({
    x,
    y,
    minimumX,
    maximumX,
    minimumY,
    maximumY: minimumY + excursion,
    horizontalPeriodFrames,
    phase,
    attack
  });
};

export const isGatekeeperPrimeRailPulseFrame = (
  combatFrame: number,
  healthRatio: number
) => {
  const attack = sampleGatekeeperPrimeAttack(combatFrame);
  return attack.attackId === 'rail-fan'
    && resolveGatekeeperPrimePhase(healthRatio).railPulseFrames.includes(attack.localFrame);
};

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const rectangleClearance = ({
  leftX,
  leftY,
  leftHalfWidth,
  leftHalfHeight,
  rightX,
  rightY,
  rightHalfWidth,
  rightHalfHeight
}: {
  readonly leftX: number;
  readonly leftY: number;
  readonly leftHalfWidth: number;
  readonly leftHalfHeight: number;
  readonly rightX: number;
  readonly rightY: number;
  readonly rightHalfWidth: number;
  readonly rightHalfHeight: number;
}) => {
  const separationX = Math.abs(leftX - rightX) - leftHalfWidth - rightHalfWidth;
  const separationY = Math.abs(leftY - rightY) - leftHalfHeight - rightHalfHeight;
  if (separationX <= 0 && separationY <= 0) return Math.max(separationX, separationY);
  return Math.hypot(Math.max(0, separationX), Math.max(0, separationY));
};

const buildRouteHash = (points: readonly Readonly<{ x: number; y: number }>[]) => fnv1a(
  points.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join('|')
);

const proveRailFanRoute = ({
  viewportId,
  width,
  height,
  bossWidth,
  bossHeight
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
}): GatekeeperPrimeRouteProof => {
  const points: Array<{ x: number; y: number }> = [];
  const projectiles: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  const playerY = height - PLAYER_COLLISION.height / 2 - (width < 520 ? 24 : 34);
  let playerX = width / 2;
  let playerVx = 0;
  let minimumClearance = Number.POSITIVE_INFINITY;
  const targetX = playerX;
  const targetY = playerY;
  const phase = resolveGatekeeperPrimePhase(0.2);

  for (let frame = 0; frame <= 190; frame += 1) {
    if (frame >= GATEKEEPER_PRIME_TELEGRAPH_START_FRAME) {
      playerVx = clamp(
        playerVx + PLAYER_COLLISION.accelerationPerFrame,
        0,
        PLAYER_COLLISION.maximumSpeedPerFrame
      );
    }
    const playerMaximumX = width - PLAYER_COLLISION.width / 2 - 9;
    playerX = Math.min(playerMaximumX, playerX + playerVx);
    points.push({ x: playerX, y: playerY });

    if (phase.railPulseFrames.includes(frame)) {
      const patrol = sampleGatekeeperPrimePatrol({
        combatFrame: frame,
        healthRatio: 0.2,
        viewportWidth: width,
        viewportHeight: height,
        bossWidth,
        bossHeight
      });
      const origins = [0.22, 0.78].map((xRatio) => ({
        x: patrol.x + bossWidth * xRatio,
        y: patrol.y + bossHeight * 0.64
      }));
      origins.forEach((origin, originIndex) => {
        const baseAngle = Math.atan2(targetY - origin.y, targetX - origin.x);
        const angle = baseAngle + (originIndex === 0 ? -0.1 : 0.1);
        projectiles.push({
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * 6.55,
          vy: Math.sin(angle) * 6.55
        });
      });
    }

    for (const projectile of projectiles) {
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      const clearance = rectangleClearance({
        leftX: playerX,
        leftY: playerY,
        leftHalfWidth: PLAYER_COLLISION.width / 2,
        leftHalfHeight: PLAYER_COLLISION.height / 2,
        rightX: projectile.x,
        rightY: projectile.y,
        rightHalfWidth: 8 + GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS,
        rightHalfHeight: 8 + GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS
      });
      minimumClearance = Math.min(minimumClearance, clearance);
    }
  }

  const clearance = Number.isFinite(minimumClearance) ? minimumClearance : 0;
  return Object.freeze({
    attackId: 'rail-fan',
    viewportId,
    fixedSeed: GATEKEEPER_PRIME_FIXED_SEED,
    routeHash: buildRouteHash(points),
    minimumClearancePixelsAfterUncertainty: clearance,
    geometryUncertaintyPixels: GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS,
    playerCollisionWidth: PLAYER_COLLISION.width,
    playerCollisionHeight: PLAYER_COLLISION.height,
    checkedFrames: points.length,
    passes: clearance >= GATEKEEPER_PRIME_MINIMUM_ROUTE_CLEARANCE_PIXELS,
    routeKind: 'locked-aim-dodge'
  });
};

const proveCoreLaneRoute = ({
  viewportId,
  width,
  height,
  bossWidth,
  bossHeight
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
}): GatekeeperPrimeRouteProof => {
  const points: Array<{ x: number; y: number }> = [];
  const playerX = PLAYER_COLLISION.width / 2 + 9;
  const playerY = height - PLAYER_COLLISION.height / 2 - (width < 520 ? 24 : 34);
  let minimumClearance = Number.POSITIVE_INFINITY;
  for (let frame = GATEKEEPER_PRIME_FIRE_START_FRAME; frame < GATEKEEPER_PRIME_FIRE_END_FRAME; frame += 1) {
    const patrol = sampleGatekeeperPrimePatrol({
      combatFrame: GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES + frame,
      healthRatio: 0.2,
      viewportWidth: width,
      viewportHeight: height,
      bossWidth,
      bossHeight
    });
    points.push({ x: playerX, y: playerY });
    const beamCenter = patrol.x + bossWidth / 2 - 16;
    const beamHalfWidth = (width < 520 ? 19 : 24) + GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS;
    const clearance = beamCenter - beamHalfWidth - (playerX + PLAYER_COLLISION.width / 2);
    minimumClearance = Math.min(minimumClearance, clearance);
  }
  return Object.freeze({
    attackId: 'core-lane',
    viewportId,
    fixedSeed: GATEKEEPER_PRIME_FIXED_SEED,
    routeHash: buildRouteHash(points),
    minimumClearancePixelsAfterUncertainty: minimumClearance,
    geometryUncertaintyPixels: GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS,
    playerCollisionWidth: PLAYER_COLLISION.width,
    playerCollisionHeight: PLAYER_COLLISION.height,
    checkedFrames: points.length,
    passes: minimumClearance >= GATEKEEPER_PRIME_MINIMUM_ROUTE_CLEARANCE_PIXELS,
    routeKind: 'edge-lane'
  });
};

const proveTwinGateRoute = ({
  viewportId,
  width,
  height,
  bossWidth,
  bossHeight
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
}): GatekeeperPrimeRouteProof => {
  const points: Array<{ x: number; y: number }> = [];
  const playerY = height - PLAYER_COLLISION.height / 2 - (width < 520 ? 24 : 34);
  let minimumClearance = Number.POSITIVE_INFINITY;
  let previousX: number | undefined;
  let previousVelocity: number | undefined;
  let motionFeasible = true;
  // The corridor is visible for the complete telegraph, so the witness enters
  // it from rest before the damaging beams begin. Motion feasibility is still
  // checked frame-to-frame across the complete acquisition and live interval.
  for (let frame = 0; frame < GATEKEEPER_PRIME_FIRE_END_FRAME; frame += 1) {
    const patrol = sampleGatekeeperPrimePatrol({
      combatFrame: GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES * 2 + frame,
      healthRatio: 0.2,
      viewportWidth: width,
      viewportHeight: height,
      bossWidth,
      bossHeight
    });
    const playerX = patrol.x + bossWidth / 2;
    if (previousX !== undefined) {
      const velocity = playerX - previousX;
      const acceleration = previousVelocity === undefined ? 0 : velocity - previousVelocity;
      if (
        Math.abs(velocity) > PLAYER_COLLISION.maximumSpeedPerFrame + 0.001
        || Math.abs(acceleration) > PLAYER_COLLISION.accelerationPerFrame + 0.001
      ) motionFeasible = false;
      previousVelocity = velocity;
    }
    previousX = playerX;
    if (frame < GATEKEEPER_PRIME_TELEGRAPH_START_FRAME) continue;
    points.push({ x: playerX, y: playerY });
    if (frame < GATEKEEPER_PRIME_FIRE_START_FRAME) continue;
    const leftBeamCenter = patrol.x + bossWidth * 0.24;
    const rightBeamCenter = patrol.x + bossWidth * 0.76;
    const beamHalfWidth = (width < 520 ? 9 : 11) + GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS;
    const leftClearance = playerX - PLAYER_COLLISION.width / 2 - (leftBeamCenter + beamHalfWidth);
    const rightClearance = rightBeamCenter - beamHalfWidth - (playerX + PLAYER_COLLISION.width / 2);
    minimumClearance = Math.min(minimumClearance, leftClearance, rightClearance);
  }
  return Object.freeze({
    attackId: 'twin-gate',
    viewportId,
    fixedSeed: GATEKEEPER_PRIME_FIXED_SEED,
    routeHash: buildRouteHash(points),
    minimumClearancePixelsAfterUncertainty: motionFeasible ? minimumClearance : -1,
    geometryUncertaintyPixels: GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS,
    playerCollisionWidth: PLAYER_COLLISION.width,
    playerCollisionHeight: PLAYER_COLLISION.height,
    checkedFrames: points.length,
    passes: motionFeasible && minimumClearance >= GATEKEEPER_PRIME_MINIMUM_ROUTE_CLEARANCE_PIXELS,
    routeKind: 'moving-center-corridor'
  });
};

export const proveGatekeeperPrimeRoutes = ({
  viewportId,
  width,
  height,
  bossWidth = 220,
  bossHeight = 200
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth?: number;
  readonly bossHeight?: number;
}): readonly GatekeeperPrimeRouteProof[] => Object.freeze([
  proveRailFanRoute({ viewportId, width, height, bossWidth, bossHeight }),
  proveCoreLaneRoute({ viewportId, width, height, bossWidth, bossHeight }),
  proveTwinGateRoute({ viewportId, width, height, bossWidth, bossHeight })
]);
