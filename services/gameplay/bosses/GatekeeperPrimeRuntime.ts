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
export const GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES = 410;
export const GATEKEEPER_PRIME_SEQUENCE_FRAMES =
  GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES + GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES * 2;
export const GATEKEEPER_PRIME_TELEGRAPH_START_FRAME = 24;
export const GATEKEEPER_PRIME_FIRE_START_FRAME = 72;
export const GATEKEEPER_PRIME_FIRE_END_FRAME = 116;
export const GATEKEEPER_PRIME_RECOVERY_END_FRAME = 180;
export const GATEKEEPER_PRIME_SIGNATURE_VOLLEY_FRAMES = Object.freeze([77, 154, 231]);
export const GATEKEEPER_PRIME_SIGNATURE_TELEGRAPH_START_FRAME = 250;
export const GATEKEEPER_PRIME_SIGNATURE_FIRE_START_FRAME = 320;
export const GATEKEEPER_PRIME_SIGNATURE_FIRE_END_FRAME = 388;
export const GATEKEEPER_PRIME_SIGNATURE_RECOVERY_END_FRAME = 400;
export const GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS = 3 as const;
export const GATEKEEPER_PRIME_MINIMUM_ROUTE_CLEARANCE_PIXELS = 6;
export const GATEKEEPER_PRIME_MOBILE_PROJECTILE_CAP = 18;
export const GATEKEEPER_PRIME_DESKTOP_PROJECTILE_CAP = 24;

export interface GatekeeperPrimeAttackSchedule {
  readonly attackTempoMultiplier: number;
  readonly attackCycleFrames: number;
  readonly signatureCycleFrames: number;
  readonly sequenceFrames: number;
  readonly telegraphStartFrame: number;
  readonly fireStartFrame: number;
  readonly fireEndFrame: number;
  readonly recoveryEndFrame: number;
  readonly signatureVolleyFrames: readonly number[];
  readonly signatureTelegraphStartFrame: number;
  readonly signatureFireStartFrame: number;
  readonly signatureFireEndFrame: number;
  readonly signatureRecoveryEndFrame: number;
}

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

const normalizeAttackTempoMultiplier = (value: number) => (
  clamp(Number.isFinite(value) ? value : 1, 1, 1.35)
);

const scaleAttackFrames = (frames: number, tempoMultiplier: number, minimum = 1) => (
  Math.max(minimum, Math.round(frames / normalizeAttackTempoMultiplier(tempoMultiplier)))
);

/**
 * Compresses deterministic settle/return cadence without shortening either
 * lane warning below its authored 48-frame readability contract. Integer
 * boundaries ensure warning/fire equality triggers cannot be skipped.
 */
export const resolveGatekeeperPrimeAttackSchedule = (
  attackTempoMultiplier = 1
): GatekeeperPrimeAttackSchedule => {
  const tempo = normalizeAttackTempoMultiplier(attackTempoMultiplier);
  const telegraphStartFrame = scaleAttackFrames(
    GATEKEEPER_PRIME_TELEGRAPH_START_FRAME,
    tempo
  );
  const fireStartFrame = telegraphStartFrame + Math.max(
    48,
    scaleAttackFrames(
      GATEKEEPER_PRIME_FIRE_START_FRAME - GATEKEEPER_PRIME_TELEGRAPH_START_FRAME,
      tempo
    )
  );
  const fireEndFrame = fireStartFrame + scaleAttackFrames(
    GATEKEEPER_PRIME_FIRE_END_FRAME - GATEKEEPER_PRIME_FIRE_START_FRAME,
    tempo,
    24
  );
  const recoveryEndFrame = fireEndFrame + scaleAttackFrames(
    GATEKEEPER_PRIME_RECOVERY_END_FRAME - GATEKEEPER_PRIME_FIRE_END_FRAME,
    tempo,
    24
  );
  const attackCycleFrames = Math.max(
    recoveryEndFrame + 1,
    scaleAttackFrames(GATEKEEPER_PRIME_ATTACK_CYCLE_FRAMES, tempo)
  );

  // Keep the three aimed volleys and their acquisition runway intact. Their
  // constructive mobile dodge relies on the authored 77-frame spacing; the
  // hard-mode pressure comes from shorter beam/recovery and repeat cadence.
  const signatureTelegraphStartFrame = GATEKEEPER_PRIME_SIGNATURE_TELEGRAPH_START_FRAME;
  const signatureFireStartFrame = signatureTelegraphStartFrame + Math.max(
    48,
    scaleAttackFrames(
      GATEKEEPER_PRIME_SIGNATURE_FIRE_START_FRAME
        - GATEKEEPER_PRIME_SIGNATURE_TELEGRAPH_START_FRAME,
      tempo
    )
  );
  const signatureFireEndFrame = signatureFireStartFrame + scaleAttackFrames(
    GATEKEEPER_PRIME_SIGNATURE_FIRE_END_FRAME - GATEKEEPER_PRIME_SIGNATURE_FIRE_START_FRAME,
    tempo,
    30
  );
  const signatureRecoveryEndFrame = signatureFireEndFrame + scaleAttackFrames(
    GATEKEEPER_PRIME_SIGNATURE_RECOVERY_END_FRAME
      - GATEKEEPER_PRIME_SIGNATURE_FIRE_END_FRAME,
    tempo,
    8
  );
  const signatureCycleFrames = Math.max(
    signatureRecoveryEndFrame + 1,
    scaleAttackFrames(GATEKEEPER_PRIME_SIGNATURE_CYCLE_FRAMES, tempo)
  );
  const signatureVolleyFrames = GATEKEEPER_PRIME_SIGNATURE_VOLLEY_FRAMES;

  return Object.freeze({
    attackTempoMultiplier: tempo,
    attackCycleFrames,
    signatureCycleFrames,
    sequenceFrames: signatureCycleFrames + attackCycleFrames * 2,
    telegraphStartFrame,
    fireStartFrame,
    fireEndFrame,
    recoveryEndFrame,
    signatureVolleyFrames,
    signatureTelegraphStartFrame,
    signatureFireStartFrame,
    signatureFireEndFrame,
    signatureRecoveryEndFrame
  });
};

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
      railPulseFrames: GATEKEEPER_PRIME_SIGNATURE_VOLLEY_FRAMES
    });
  }
  if (health <= 0.64) {
    return Object.freeze({
      id: 'prime-pressure',
      index: 1,
      verticalExcursionPixels: 26,
      maximumPatrolSpeedPixelsPerFrame: 1.58,
      railPulseFrames: GATEKEEPER_PRIME_SIGNATURE_VOLLEY_FRAMES
    });
  }
  return Object.freeze({
    id: 'prime-sentinel',
    index: 0,
    verticalExcursionPixels: 14,
    maximumPatrolSpeedPixelsPerFrame: 1.42,
    railPulseFrames: GATEKEEPER_PRIME_SIGNATURE_VOLLEY_FRAMES
  });
};

export const sampleGatekeeperPrimeAttack = (
  combatFrame: number,
  attackTempoMultiplier = 1
): GatekeeperPrimeAttackSample => {
  const frame = Math.max(0, Math.floor(Number(combatFrame) || 0));
  const schedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
  const sequenceFrame = frame % schedule.sequenceFrames;
  const attackIndex = (
    sequenceFrame < schedule.signatureCycleFrames
      ? 0
      : sequenceFrame < schedule.signatureCycleFrames
        + schedule.attackCycleFrames
        ? 1
        : 2
  ) as 0 | 1 | 2;
  const localFrame = attackIndex === 0
    ? sequenceFrame
    : attackIndex === 1
      ? sequenceFrame - schedule.signatureCycleFrames
      : sequenceFrame
        - schedule.signatureCycleFrames
        - schedule.attackCycleFrames;
  const signatureAttack = attackIndex === 0;
  const telegraphStartFrame = signatureAttack
    ? schedule.signatureTelegraphStartFrame
    : schedule.telegraphStartFrame;
  const fireStartFrame = signatureAttack
    ? schedule.signatureFireStartFrame
    : schedule.fireStartFrame;
  const fireEndFrame = signatureAttack
    ? schedule.signatureFireEndFrame
    : schedule.fireEndFrame;
  const recoveryEndFrame = signatureAttack
    ? schedule.signatureRecoveryEndFrame
    : schedule.recoveryEndFrame;
  const stage: GatekeeperPrimeAttackStage = localFrame < telegraphStartFrame
    ? 'settle'
    : localFrame < fireStartFrame
      ? 'telegraph'
      : localFrame < fireEndFrame
        ? 'fire'
        : localFrame < recoveryEndFrame
          ? 'recovery'
          : 'return';
  return Object.freeze({
    attackId: ATTACK_ORDER[attackIndex],
    attackIndex,
    localFrame,
    stage,
    telegraphStartFrame,
    fireStartFrame,
    fireEndFrame,
    recoveryEndFrame
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
  bossHeight,
  attackTempoMultiplier = 1
}: {
  readonly combatFrame: number;
  readonly healthRatio: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  readonly attackTempoMultiplier?: number;
}): GatekeeperPrimePatrolSample => {
  const frame = Math.max(0, Math.floor(Number(combatFrame) || 0));
  const schedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
  const phase = resolveGatekeeperPrimePhase(healthRatio);
  const attack = sampleGatekeeperPrimeAttack(frame, schedule.attackTempoMultiplier);
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
  const normalizedFrame = attack.localFrame / (
    attack.attackId === 'rail-fan'
      ? schedule.signatureCycleFrames
      : schedule.attackCycleFrames
  );
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
  healthRatio: number,
  attackTempoMultiplier = 1
) => {
  const schedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
  const attack = sampleGatekeeperPrimeAttack(combatFrame, schedule.attackTempoMultiplier);
  return attack.attackId === 'rail-fan'
    && resolveGatekeeperPrimePhase(healthRatio).railPulseFrames.length > 0
    && schedule.signatureVolleyFrames.includes(attack.localFrame);
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
  bossHeight,
  attackTempoMultiplier
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  readonly attackTempoMultiplier: number;
}): GatekeeperPrimeRouteProof => {
  const schedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
  const points: Array<{ x: number; y: number }> = [];
  const projectiles: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  const playerY = height - PLAYER_COLLISION.height / 2 - (width < 520 ? 24 : 34);
  let playerX = width / 2;
  let playerVx = 0;
  let minimumClearance = Number.POSITIVE_INFINITY;
  const phase = resolveGatekeeperPrimePhase(0.2);

  for (let frame = 0; frame <= schedule.signatureFireEndFrame; frame += 1) {
    if (frame >= 24) {
      const beamCenterX = width * 0.7;
      const beamHalfWidth = (width < 520 ? 19 : 24)
        + GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS;
      const dodgeTargetX = Math.min(
        width - PLAYER_COLLISION.width / 2 - 9,
        width / 2 + Math.min(140, width * 0.26)
      );
      const dodgeAmplitude = dodgeTargetX - width / 2;
      const leftDodgeTargetX = width / 2 - dodgeAmplitude;
      const warnedSafeTargetX = beamCenterX
        - beamHalfWidth
        - PLAYER_COLLISION.width / 2
        - GATEKEEPER_PRIME_MINIMUM_ROUTE_CLEARANCE_PIXELS
        - 8;
      const targetX = frame <= schedule.signatureVolleyFrames[0]
        ? dodgeTargetX
        : frame <= schedule.signatureVolleyFrames[1]
          ? leftDodgeTargetX
          : frame <= schedule.signatureVolleyFrames[2]
            ? dodgeTargetX
            : warnedSafeTargetX;
      const desiredVelocity = clamp(
        targetX - playerX,
        -PLAYER_COLLISION.maximumSpeedPerFrame,
        PLAYER_COLLISION.maximumSpeedPerFrame
      );
      playerVx = clamp(
        playerVx + clamp(
          desiredVelocity - playerVx,
          -PLAYER_COLLISION.accelerationPerFrame,
          PLAYER_COLLISION.accelerationPerFrame
        ),
        -PLAYER_COLLISION.maximumSpeedPerFrame,
        PLAYER_COLLISION.maximumSpeedPerFrame
      );
    }
    const playerMinimumX = PLAYER_COLLISION.width / 2 + 9;
    const playerMaximumX = width - PLAYER_COLLISION.width / 2 - 9;
    const nextPlayerX = clamp(playerX + playerVx, playerMinimumX, playerMaximumX);
    if (
      (nextPlayerX === playerMinimumX && playerVx < 0)
      || (nextPlayerX === playerMaximumX && playerVx > 0)
    ) playerVx = 0;
    playerX = nextPlayerX;
    points.push({ x: playerX, y: playerY });

    if (phase.railPulseFrames.length > 0 && schedule.signatureVolleyFrames.includes(frame)) {
      const patrol = sampleGatekeeperPrimePatrol({
        combatFrame: frame,
        healthRatio: 0.2,
        viewportWidth: width,
        viewportHeight: height,
        bossWidth,
        bossHeight,
        attackTempoMultiplier: schedule.attackTempoMultiplier
      });
      const origins = [0.22, 0.78].map((xRatio) => ({
        x: patrol.x + bossWidth * xRatio,
        y: patrol.y + bossHeight * 0.64
      }));
      for (let shotIndex = 0; shotIndex < 3; shotIndex += 1) {
        const originIndex = shotIndex % origins.length;
        const origin = origins[originIndex];
        const baseAngle = Math.atan2(playerY - origin.y, playerX - origin.x);
        const spread = (shotIndex - 1) * 0.2;
        const angle = baseAngle + spread;
        const speed = 6.55;
        projectiles.push({
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed
        });
      }
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

    if (
      frame >= schedule.signatureFireStartFrame
      && frame < schedule.signatureFireEndFrame
    ) {
      // Prove the harder branch: the warned core beam shifts into the same
      // right-hand lane used by the opening dodge, so the witness must reverse
      // during the complete 70-frame telegraph instead of hiding at the edge.
      const beamCenterX = width * 0.7;
      const beamHalfWidth = (width < 520 ? 19 : 24)
        + GATEKEEPER_PRIME_ROUTE_UNCERTAINTY_PIXELS;
      const beamClearance = Math.abs(playerX - beamCenterX)
        - PLAYER_COLLISION.width / 2
        - beamHalfWidth;
      minimumClearance = Math.min(minimumClearance, beamClearance);
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
  bossHeight,
  attackTempoMultiplier
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  readonly attackTempoMultiplier: number;
}): GatekeeperPrimeRouteProof => {
  const schedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
  const points: Array<{ x: number; y: number }> = [];
  const playerX = PLAYER_COLLISION.width / 2 + 9;
  const playerY = height - PLAYER_COLLISION.height / 2 - (width < 520 ? 24 : 34);
  let minimumClearance = Number.POSITIVE_INFINITY;
  for (let frame = schedule.fireStartFrame; frame < schedule.fireEndFrame; frame += 1) {
    const patrol = sampleGatekeeperPrimePatrol({
      combatFrame: schedule.signatureCycleFrames + frame,
      healthRatio: 0.2,
      viewportWidth: width,
      viewportHeight: height,
      bossWidth,
      bossHeight,
      attackTempoMultiplier: schedule.attackTempoMultiplier
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
  bossHeight,
  attackTempoMultiplier
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  readonly attackTempoMultiplier: number;
}): GatekeeperPrimeRouteProof => {
  const schedule = resolveGatekeeperPrimeAttackSchedule(attackTempoMultiplier);
  const points: Array<{ x: number; y: number }> = [];
  const playerY = height - PLAYER_COLLISION.height / 2 - (width < 520 ? 24 : 34);
  let minimumClearance = Number.POSITIVE_INFINITY;
  let previousX: number | undefined;
  let previousVelocity: number | undefined;
  let motionFeasible = true;
  // The corridor is visible for the complete telegraph, so the witness enters
  // it from rest before the damaging beams begin. Motion feasibility is still
  // checked frame-to-frame across the complete acquisition and live interval.
  for (let frame = 0; frame < schedule.fireEndFrame; frame += 1) {
    const patrol = sampleGatekeeperPrimePatrol({
      combatFrame:
        schedule.signatureCycleFrames
        + schedule.attackCycleFrames
        + frame,
      healthRatio: 0.2,
      viewportWidth: width,
      viewportHeight: height,
      bossWidth,
      bossHeight,
      attackTempoMultiplier: schedule.attackTempoMultiplier
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
    if (frame < schedule.telegraphStartFrame) continue;
    points.push({ x: playerX, y: playerY });
    if (frame < schedule.fireStartFrame) continue;
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
  bossHeight = 200,
  attackTempoMultiplier = 1
}: {
  readonly viewportId: string;
  readonly width: number;
  readonly height: number;
  readonly bossWidth?: number;
  readonly bossHeight?: number;
  readonly attackTempoMultiplier?: number;
}): readonly GatekeeperPrimeRouteProof[] => Object.freeze([
  proveRailFanRoute({ viewportId, width, height, bossWidth, bossHeight, attackTempoMultiplier }),
  proveCoreLaneRoute({ viewportId, width, height, bossWidth, bossHeight, attackTempoMultiplier }),
  proveTwinGateRoute({ viewportId, width, height, bossWidth, bossHeight, attackTempoMultiplier })
]);
