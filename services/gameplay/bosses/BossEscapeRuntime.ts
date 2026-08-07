export const BOSS_ESCAPE_MIN_STAGE_FRAMES = 1;
export const BOSS_ESCAPE_MAX_STAGE_FRAMES = 60 * 30;
export const BOSS_ESCAPE_MAX_ARENA_DIMENSION = 16_384;
export const BOSS_ESCAPE_MAX_OVERSCAN_RATIO = 0.5;

export const BOSS_ESCAPE_DEFAULT_DURATIONS = Object.freeze({
  damagedStaggerFrames: 30,
  falseFinishFrames: 54,
  escapeChargeFrames: 42,
  escapingFrames: 90
});

export type BossEscapeStage =
  | 'damaged-stagger'
  | 'false-finish'
  | 'escape-charge'
  | 'escaping'
  | 'complete';

export interface BossEscapePoint {
  readonly x: number;
  readonly y: number;
}

export interface BossEscapeGeometryInput {
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  /** Boss-center position where the terminal sequence begins. */
  readonly startX: number;
  readonly startY: number;
  /** Boss-center destination, including a bounded offscreen overscan region. */
  readonly exitX: number;
  readonly exitY: number;
}

export interface BossEscapeLockRatios {
  /** Ratios within the boss-center travel range, preserving edge placement. */
  readonly startX: number;
  readonly startY: number;
  /** Arena ratios may extend into the bounded -0.5..1.5 overscan range. */
  readonly exitX: number;
  readonly exitY: number;
}

export interface BossEscapeLock {
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  readonly start: Readonly<BossEscapePoint>;
  readonly exit: Readonly<BossEscapePoint>;
  readonly directionX: number;
  readonly directionY: number;
  readonly angleRadians: number;
  readonly distance: number;
  readonly ratios: Readonly<BossEscapeLockRatios>;
}

export interface BossEscapeDurationInput {
  readonly damagedStaggerFrames?: number;
  readonly falseFinishFrames?: number;
  readonly escapeChargeFrames?: number;
  readonly escapingFrames?: number;
}

export interface BossEscapeDurations {
  readonly damagedStaggerFrames: number;
  readonly falseFinishFrames: number;
  readonly escapeChargeFrames: number;
  readonly escapingFrames: number;
  /** Complete is a stable terminal stage after these active frames. */
  readonly totalFrames: number;
}

export interface BossEscapeRuntimeState {
  readonly startFrame: number;
  readonly lock: Readonly<BossEscapeLock>;
  readonly durations: Readonly<BossEscapeDurations>;
  readonly cancelled: boolean;
}

export interface BossEscapePoseSample {
  /** Presentation-only local offsets; gameplay center remains exact. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotationOffsetRadians: number;
  readonly scaleXMultiplier: number;
  readonly scaleYMultiplier: number;
  readonly chargeIntensity: number;
}

export interface BossEscapeSample {
  readonly stage: BossEscapeStage;
  readonly stageFrame: number;
  readonly stageDurationFrames: number;
  readonly stageProgress: number;
  readonly totalProgress: number;
  readonly center: Readonly<BossEscapePoint>;
  readonly directionX: number;
  readonly directionY: number;
  readonly angleRadians: number;
  readonly travelProgress: number;
  readonly pose: Readonly<BossEscapePoseSample>;
  readonly opacity: number;
  readonly visible: boolean;
  readonly targetable: boolean;
  readonly collisionActive: boolean;
  readonly damageActive: boolean;
  /** One-frame request on the exact sequence start frame. */
  readonly hazardCleanupRequested: boolean;
  /** True once this runtime no longer needs further sampling. */
  readonly complete: boolean;
  /** True only after a successful escape, never after cancellation. */
  readonly completionReady: boolean;
  readonly rewardReady: boolean;
  readonly escapeTrailIntensity: number;
  readonly cancelled: boolean;
  readonly shouldCleanup: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const clamp01 = (value: number) => clamp(Number(value) || 0, 0, 1);

const smoothstep = (value: number) => {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
};

const finiteOr = (value: number | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const normalizeFrame = (value: number, fallback = 0) => Math.floor(clamp(
  finiteOr(value, fallback),
  0,
  Number.MAX_SAFE_INTEGER
));

const normalizeStageFrames = (value: number | undefined, fallback: number) => (
  Math.floor(clamp(
    finiteOr(value, fallback),
    BOSS_ESCAPE_MIN_STAGE_FRAMES,
    BOSS_ESCAPE_MAX_STAGE_FRAMES
  ))
);

const normalizeArenaDimension = (value: number) => clamp(
  finiteOr(value, 1),
  1,
  BOSS_ESCAPE_MAX_ARENA_DIMENSION
);

const freezePoint = (x: number, y: number): Readonly<BossEscapePoint> => (
  Object.freeze({ x, y })
);

const bossCenterToRatio = (
  center: number,
  arenaDimension: number,
  bossDimension: number
) => {
  const travel = Math.max(0, arenaDimension - bossDimension);
  if (travel <= Number.EPSILON) return 0.5;
  return clamp01((center - bossDimension / 2) / travel);
};

const bossCenterFromRatio = (
  ratio: number,
  arenaDimension: number,
  bossDimension: number
) => bossDimension / 2 + clamp01(ratio) * Math.max(0, arenaDimension - bossDimension);

const cloneLock = (lock: Readonly<BossEscapeLock>): Readonly<BossEscapeLock> => (
  Object.freeze({
    arenaWidth: lock.arenaWidth,
    arenaHeight: lock.arenaHeight,
    bossWidth: lock.bossWidth,
    bossHeight: lock.bossHeight,
    start: freezePoint(lock.start.x, lock.start.y),
    exit: freezePoint(lock.exit.x, lock.exit.y),
    directionX: lock.directionX,
    directionY: lock.directionY,
    angleRadians: lock.angleRadians,
    distance: lock.distance,
    ratios: Object.freeze({ ...lock.ratios })
  })
);

/**
 * Locks a visible in-arena start and a bounded offscreen-capable exit. The
 * ratios make serialized state safe to reproject after a viewport resize.
 */
export const resolveBossEscapeLock = (
  input: BossEscapeGeometryInput
): Readonly<BossEscapeLock> => {
  const arenaWidth = normalizeArenaDimension(input.arenaWidth);
  const arenaHeight = normalizeArenaDimension(input.arenaHeight);
  const bossWidth = clamp(finiteOr(input.bossWidth, 1), 1, arenaWidth);
  const bossHeight = clamp(finiteOr(input.bossHeight, 1), 1, arenaHeight);
  const startX = clamp(
    finiteOr(input.startX, arenaWidth / 2),
    bossWidth / 2,
    arenaWidth - bossWidth / 2
  );
  const startY = clamp(
    finiteOr(input.startY, arenaHeight / 2),
    bossHeight / 2,
    arenaHeight - bossHeight / 2
  );
  const minimumExitX = -arenaWidth * BOSS_ESCAPE_MAX_OVERSCAN_RATIO;
  const maximumExitX = arenaWidth * (1 + BOSS_ESCAPE_MAX_OVERSCAN_RATIO);
  const minimumExitY = -arenaHeight * BOSS_ESCAPE_MAX_OVERSCAN_RATIO;
  const maximumExitY = arenaHeight * (1 + BOSS_ESCAPE_MAX_OVERSCAN_RATIO);
  const exitX = clamp(
    finiteOr(input.exitX, arenaWidth / 2),
    minimumExitX,
    maximumExitX
  );
  const exitY = clamp(
    finiteOr(input.exitY, -bossHeight / 2),
    minimumExitY,
    maximumExitY
  );
  const deltaX = exitX - startX;
  const deltaY = exitY - startY;
  const distance = Math.hypot(deltaX, deltaY);
  const directionX = distance > Number.EPSILON ? deltaX / distance : 0;
  const directionY = distance > Number.EPSILON ? deltaY / distance : -1;

  return Object.freeze({
    arenaWidth,
    arenaHeight,
    bossWidth,
    bossHeight,
    start: freezePoint(startX, startY),
    exit: freezePoint(exitX, exitY),
    directionX,
    directionY,
    angleRadians: Math.atan2(directionY, directionX),
    distance,
    ratios: Object.freeze({
      startX: bossCenterToRatio(startX, arenaWidth, bossWidth),
      startY: bossCenterToRatio(startY, arenaHeight, bossHeight),
      exitX: clamp(
        exitX / arenaWidth,
        -BOSS_ESCAPE_MAX_OVERSCAN_RATIO,
        1 + BOSS_ESCAPE_MAX_OVERSCAN_RATIO
      ),
      exitY: clamp(
        exitY / arenaHeight,
        -BOSS_ESCAPE_MAX_OVERSCAN_RATIO,
        1 + BOSS_ESCAPE_MAX_OVERSCAN_RATIO
      )
    })
  });
};

export const reprojectBossEscapeLock = (
  lock: Readonly<BossEscapeLock>,
  dimensions: Pick<
    BossEscapeGeometryInput,
    'arenaWidth' | 'arenaHeight' | 'bossWidth' | 'bossHeight'
  >
): Readonly<BossEscapeLock> => {
  const arenaWidth = normalizeArenaDimension(dimensions.arenaWidth);
  const arenaHeight = normalizeArenaDimension(dimensions.arenaHeight);
  const bossWidth = clamp(finiteOr(dimensions.bossWidth, 1), 1, arenaWidth);
  const bossHeight = clamp(finiteOr(dimensions.bossHeight, 1), 1, arenaHeight);
  return resolveBossEscapeLock({
    arenaWidth,
    arenaHeight,
    bossWidth,
    bossHeight,
    startX: bossCenterFromRatio(lock.ratios.startX, arenaWidth, bossWidth),
    startY: bossCenterFromRatio(lock.ratios.startY, arenaHeight, bossHeight),
    exitX: lock.ratios.exitX * arenaWidth,
    exitY: lock.ratios.exitY * arenaHeight
  });
};

export const resolveBossEscapeDurations = (
  input: BossEscapeDurationInput = {}
): Readonly<BossEscapeDurations> => {
  const damagedStaggerFrames = normalizeStageFrames(
    input.damagedStaggerFrames,
    BOSS_ESCAPE_DEFAULT_DURATIONS.damagedStaggerFrames
  );
  const falseFinishFrames = normalizeStageFrames(
    input.falseFinishFrames,
    BOSS_ESCAPE_DEFAULT_DURATIONS.falseFinishFrames
  );
  const escapeChargeFrames = normalizeStageFrames(
    input.escapeChargeFrames,
    BOSS_ESCAPE_DEFAULT_DURATIONS.escapeChargeFrames
  );
  const escapingFrames = normalizeStageFrames(
    input.escapingFrames,
    BOSS_ESCAPE_DEFAULT_DURATIONS.escapingFrames
  );
  return Object.freeze({
    damagedStaggerFrames,
    falseFinishFrames,
    escapeChargeFrames,
    escapingFrames,
    totalFrames: damagedStaggerFrames
      + falseFinishFrames
      + escapeChargeFrames
      + escapingFrames
  });
};

export const createBossEscapeRuntimeState = ({
  startFrame,
  lock,
  durations = {}
}: {
  readonly startFrame: number;
  readonly lock: Readonly<BossEscapeLock>;
  readonly durations?: BossEscapeDurationInput;
}): Readonly<BossEscapeRuntimeState> => Object.freeze({
  startFrame: normalizeFrame(startFrame),
  lock: cloneLock(lock),
  durations: resolveBossEscapeDurations(durations),
  cancelled: false
});

/** Cancellation ends the terminal runtime without granting escape completion. */
export const cancelBossEscapeRuntime = (
  state: Readonly<BossEscapeRuntimeState>
): Readonly<BossEscapeRuntimeState> => state.cancelled
  ? state
  : Object.freeze({ ...state, cancelled: true });

export const reprojectBossEscapeRuntimeState = (
  state: Readonly<BossEscapeRuntimeState>,
  dimensions: Pick<
    BossEscapeGeometryInput,
    'arenaWidth' | 'arenaHeight' | 'bossWidth' | 'bossHeight'
  >
): Readonly<BossEscapeRuntimeState> => Object.freeze({
  ...state,
  lock: reprojectBossEscapeLock(state.lock, dimensions)
});

const freezePose = (
  pose: BossEscapePoseSample
): Readonly<BossEscapePoseSample> => Object.freeze(pose);

const neutralPose = () => freezePose({
  offsetX: 0,
  offsetY: 0,
  rotationOffsetRadians: 0,
  scaleXMultiplier: 1,
  scaleYMultiplier: 1,
  chargeIntensity: 0
});

const samplePose = ({
  stage,
  stageFrame,
  stageProgress,
  directionX,
  directionY,
  bossWidth,
  bossHeight
}: {
  stage: BossEscapeStage;
  stageFrame: number;
  stageProgress: number;
  directionX: number;
  directionY: number;
  bossWidth: number;
  bossHeight: number;
}): Readonly<BossEscapePoseSample> => {
  if (stage === 'complete') return neutralPose();
  const localScale = clamp(Math.min(bossWidth, bossHeight) * 0.035, 2, 8);
  if (stage === 'damaged-stagger') {
    const energy = 1 - smoothstep(stageProgress);
    const pulse = Math.sin(stageFrame * 1.7);
    return freezePose({
      offsetX: pulse * localScale * energy,
      offsetY: Math.sin(stageFrame * 0.93) * localScale * 0.42 * energy,
      rotationOffsetRadians: pulse * 0.075 * energy,
      scaleXMultiplier: 1 + Math.abs(pulse) * 0.035 * energy,
      scaleYMultiplier: 1 - Math.abs(pulse) * 0.025 * energy,
      chargeIntensity: 0
    });
  }
  if (stage === 'false-finish') {
    const settle = smoothstep(stageProgress);
    return freezePose({
      offsetX: 0,
      offsetY: localScale * 0.9 * settle,
      rotationOffsetRadians: 0.065 * settle,
      scaleXMultiplier: 1 + 0.018 * settle,
      scaleYMultiplier: 1 - 0.055 * settle,
      chargeIntensity: 0
    });
  }
  if (stage === 'escape-charge') {
    const charge = smoothstep(stageProgress);
    return freezePose({
      offsetX: -directionX * localScale * 1.1 * charge,
      offsetY: -directionY * localScale * 1.1 * charge,
      rotationOffsetRadians: directionX * 0.11 * charge,
      scaleXMultiplier: 1 + 0.075 * charge,
      scaleYMultiplier: 1 - 0.075 * charge,
      chargeIntensity: charge
    });
  }
  const launchSettle = 1 - smoothstep(stageProgress);
  return freezePose({
    offsetX: 0,
    offsetY: 0,
    rotationOffsetRadians: directionX * 0.12 * launchSettle,
    scaleXMultiplier: 1 + 0.09 * launchSettle,
    scaleYMultiplier: 1 - 0.04 * launchSettle,
    chargeIntensity: launchSettle
  });
};

/**
 * Samples one non-explosive terminal sequence from an absolute simulation
 * frame. Combat is inactive immediately; only successful completion grants the
 * caller permission to award the authored escape result.
 */
export const sampleBossEscapeRuntime = (
  state: Readonly<BossEscapeRuntimeState>,
  frameCount: number
): Readonly<BossEscapeSample> => {
  const { durations, lock } = state;
  if (state.cancelled) {
    return Object.freeze({
      stage: 'complete',
      stageFrame: 0,
      stageDurationFrames: 1,
      stageProgress: 1,
      totalProgress: 1,
      center: freezePoint(lock.start.x, lock.start.y),
      directionX: lock.directionX,
      directionY: lock.directionY,
      angleRadians: lock.angleRadians,
      travelProgress: 0,
      pose: neutralPose(),
      opacity: 1,
      visible: true,
      targetable: true,
      collisionActive: true,
      damageActive: false,
      hazardCleanupRequested: false,
      complete: true,
      completionReady: false,
      rewardReady: false,
      escapeTrailIntensity: 0,
      cancelled: true,
      shouldCleanup: true
    });
  }

  const frame = normalizeFrame(frameCount);
  const elapsed = Math.max(0, frame - state.startFrame);
  const falseFinishStart = durations.damagedStaggerFrames;
  const chargeStart = falseFinishStart + durations.falseFinishFrames;
  const escapingStart = chargeStart + durations.escapeChargeFrames;
  const complete = elapsed >= durations.totalFrames;

  let stage: BossEscapeStage;
  let stageStart: number;
  let stageDurationFrames: number;
  if (elapsed < falseFinishStart) {
    stage = 'damaged-stagger';
    stageStart = 0;
    stageDurationFrames = durations.damagedStaggerFrames;
  } else if (elapsed < chargeStart) {
    stage = 'false-finish';
    stageStart = falseFinishStart;
    stageDurationFrames = durations.falseFinishFrames;
  } else if (elapsed < escapingStart) {
    stage = 'escape-charge';
    stageStart = chargeStart;
    stageDurationFrames = durations.escapeChargeFrames;
  } else if (!complete) {
    stage = 'escaping';
    stageStart = escapingStart;
    stageDurationFrames = durations.escapingFrames;
  } else {
    stage = 'complete';
    stageStart = durations.totalFrames;
    stageDurationFrames = 1;
  }

  const stageFrame = stage === 'complete' ? 0 : Math.max(0, elapsed - stageStart);
  const stageProgress = stage === 'complete'
    ? 1
    : clamp01(stageFrame / Math.max(1, stageDurationFrames));
  const inclusiveStageProgress = stage === 'complete'
    ? 1
    : clamp01((stageFrame + 1) / Math.max(1, stageDurationFrames));
  const travelProgress = stage === 'complete'
    ? 1
    : stage === 'escaping'
      ? inclusiveStageProgress * inclusiveStageProgress
      : 0;
  const center = freezePoint(
    lock.start.x + (lock.exit.x - lock.start.x) * travelProgress,
    lock.start.y + (lock.exit.y - lock.start.y) * travelProgress
  );
  const opacity = stage === 'complete'
    ? 0
    : stage === 'escaping'
      ? 1 - smoothstep((travelProgress - 0.58) / 0.42)
      : 1;
  const escapeTrailIntensity = stage === 'escape-charge'
    ? smoothstep(inclusiveStageProgress)
    : stage === 'escaping'
      ? 1 - smoothstep((travelProgress - 0.72) / 0.28)
      : 0;
  const terminalReady = stage === 'complete';

  return Object.freeze({
    stage,
    stageFrame,
    stageDurationFrames,
    stageProgress,
    totalProgress: clamp01(elapsed / Math.max(1, durations.totalFrames)),
    center,
    directionX: lock.directionX,
    directionY: lock.directionY,
    angleRadians: lock.angleRadians,
    travelProgress,
    pose: samplePose({
      stage,
      stageFrame,
      stageProgress,
      directionX: lock.directionX,
      directionY: lock.directionY,
      bossWidth: lock.bossWidth,
      bossHeight: lock.bossHeight
    }),
    opacity,
    visible: stage !== 'complete',
    targetable: false,
    collisionActive: false,
    damageActive: false,
    hazardCleanupRequested: frame === state.startFrame,
    complete: terminalReady,
    completionReady: terminalReady,
    rewardReady: terminalReady,
    escapeTrailIntensity,
    cancelled: false,
    shouldCleanup: terminalReady
  });
};
