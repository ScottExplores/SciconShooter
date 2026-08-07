export const BOSS_VANISH_REENTRY_MIN_STAGE_FRAMES = 1;
export const BOSS_VANISH_REENTRY_MAX_STAGE_FRAMES = 60 * 30;
export const BOSS_VANISH_REENTRY_MAX_ARENA_DIMENSION = 16_384;

export const BOSS_VANISH_REENTRY_DEFAULT_DURATIONS = Object.freeze({
  fadeOutFrames: 24,
  hiddenFrames: 30,
  reentryWarningFrames: 45,
  reappearFrames: 18,
  recoveryFrames: 60
});

export type BossVanishReentryStage =
  | 'fade-out'
  | 'hidden'
  | 'reentry-warning'
  | 'reappear'
  | 'recovery';

export interface BossVanishReentryPoint {
  readonly x: number;
  readonly y: number;
}

export interface BossVanishReentryGeometryInput {
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  /** Boss-center position at the start of fade-out. */
  readonly startX: number;
  readonly startY: number;
  /** Warning-time target point. It never follows the target after locking. */
  readonly targetX: number;
  readonly targetY: number;
  /** Boss-center position used from the re-entry warning onward. */
  readonly reentryX: number;
  readonly reentryY: number;
}

export interface BossVanishReentryLockRatios {
  /** Ratios within the boss-center travel range, preserving edge placement. */
  readonly startX: number;
  readonly startY: number;
  readonly reentryX: number;
  readonly reentryY: number;
  /** Ratios within the complete arena, preserving the warned target. */
  readonly targetX: number;
  readonly targetY: number;
}

export interface BossVanishReentryLock {
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly bossWidth: number;
  readonly bossHeight: number;
  readonly start: Readonly<BossVanishReentryPoint>;
  readonly target: Readonly<BossVanishReentryPoint>;
  readonly reentry: Readonly<BossVanishReentryPoint>;
  readonly reentryAngleRadians: number;
  readonly reentryDirectionX: number;
  readonly reentryDirectionY: number;
  readonly ratios: Readonly<BossVanishReentryLockRatios>;
}

export interface BossVanishReentryDurationInput {
  readonly fadeOutFrames?: number;
  readonly hiddenFrames?: number;
  readonly reentryWarningFrames?: number;
  readonly reappearFrames?: number;
  readonly recoveryFrames?: number;
}

export interface BossVanishReentryDurations {
  readonly fadeOutFrames: number;
  readonly hiddenFrames: number;
  readonly reentryWarningFrames: number;
  readonly reappearFrames: number;
  readonly recoveryFrames: number;
  readonly totalFrames: number;
}

export interface BossVanishReentryRuntimeState {
  readonly startFrame: number;
  readonly lock: Readonly<BossVanishReentryLock>;
  readonly durations: Readonly<BossVanishReentryDurations>;
  readonly cancelled: boolean;
}

export interface BossVanishReentrySample {
  readonly stage: BossVanishReentryStage;
  readonly stageFrame: number;
  readonly stageDurationFrames: number;
  readonly stageProgress: number;
  readonly totalProgress: number;
  readonly position: Readonly<BossVanishReentryPoint>;
  readonly target: Readonly<BossVanishReentryPoint>;
  readonly reentryAngleRadians: number;
  /** Presentation alpha; structural visibility remains the `visible` flag. */
  readonly opacity: number;
  readonly warningActive: boolean;
  readonly visible: boolean;
  readonly targetable: boolean;
  readonly collisionActive: boolean;
  readonly damageActive: boolean;
  readonly complete: boolean;
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
    BOSS_VANISH_REENTRY_MIN_STAGE_FRAMES,
    BOSS_VANISH_REENTRY_MAX_STAGE_FRAMES
  ))
);

const normalizeArenaDimension = (value: number) => clamp(
  finiteOr(value, 1),
  1,
  BOSS_VANISH_REENTRY_MAX_ARENA_DIMENSION
);

const freezePoint = (x: number, y: number): Readonly<BossVanishReentryPoint> => (
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

const cloneLock = (
  lock: Readonly<BossVanishReentryLock>
): Readonly<BossVanishReentryLock> => Object.freeze({
  arenaWidth: lock.arenaWidth,
  arenaHeight: lock.arenaHeight,
  bossWidth: lock.bossWidth,
  bossHeight: lock.bossHeight,
  start: freezePoint(lock.start.x, lock.start.y),
  target: freezePoint(lock.target.x, lock.target.y),
  reentry: freezePoint(lock.reentry.x, lock.reentry.y),
  reentryAngleRadians: lock.reentryAngleRadians,
  reentryDirectionX: lock.reentryDirectionX,
  reentryDirectionY: lock.reentryDirectionY,
  ratios: Object.freeze({ ...lock.ratios })
});

/**
 * Locks every gameplay-relevant point once. Boss centers are clamped so the
 * complete structural body remains in the arena; the warned target is clamped
 * independently to the arena bounds.
 */
export const resolveBossVanishReentryLock = (
  input: BossVanishReentryGeometryInput
): Readonly<BossVanishReentryLock> => {
  const arenaWidth = normalizeArenaDimension(input.arenaWidth);
  const arenaHeight = normalizeArenaDimension(input.arenaHeight);
  const bossWidth = clamp(finiteOr(input.bossWidth, 1), 1, arenaWidth);
  const bossHeight = clamp(finiteOr(input.bossHeight, 1), 1, arenaHeight);
  const minimumCenterX = bossWidth / 2;
  const maximumCenterX = arenaWidth - bossWidth / 2;
  const minimumCenterY = bossHeight / 2;
  const maximumCenterY = arenaHeight - bossHeight / 2;
  const startX = clamp(finiteOr(input.startX, arenaWidth / 2), minimumCenterX, maximumCenterX);
  const startY = clamp(finiteOr(input.startY, arenaHeight / 2), minimumCenterY, maximumCenterY);
  const targetX = clamp(finiteOr(input.targetX, arenaWidth / 2), 0, arenaWidth);
  const targetY = clamp(finiteOr(input.targetY, arenaHeight / 2), 0, arenaHeight);
  const reentryX = clamp(
    finiteOr(input.reentryX, arenaWidth / 2),
    minimumCenterX,
    maximumCenterX
  );
  const reentryY = clamp(
    finiteOr(input.reentryY, arenaHeight / 2),
    minimumCenterY,
    maximumCenterY
  );
  const deltaX = targetX - reentryX;
  const deltaY = targetY - reentryY;
  const distance = Math.hypot(deltaX, deltaY);
  const directionX = distance > Number.EPSILON ? deltaX / distance : 0;
  const directionY = distance > Number.EPSILON ? deltaY / distance : 1;

  return Object.freeze({
    arenaWidth,
    arenaHeight,
    bossWidth,
    bossHeight,
    start: freezePoint(startX, startY),
    target: freezePoint(targetX, targetY),
    reentry: freezePoint(reentryX, reentryY),
    reentryAngleRadians: Math.atan2(directionY, directionX),
    reentryDirectionX: directionX,
    reentryDirectionY: directionY,
    ratios: Object.freeze({
      startX: bossCenterToRatio(startX, arenaWidth, bossWidth),
      startY: bossCenterToRatio(startY, arenaHeight, bossHeight),
      targetX: clamp01(targetX / arenaWidth),
      targetY: clamp01(targetY / arenaHeight),
      reentryX: bossCenterToRatio(reentryX, arenaWidth, bossWidth),
      reentryY: bossCenterToRatio(reentryY, arenaHeight, bossHeight)
    })
  });
};

/** Reprojects the immutable lock after a viewport or boss-size change. */
export const reprojectBossVanishReentryLock = (
  lock: Readonly<BossVanishReentryLock>,
  dimensions: Pick<
    BossVanishReentryGeometryInput,
    'arenaWidth' | 'arenaHeight' | 'bossWidth' | 'bossHeight'
  >
): Readonly<BossVanishReentryLock> => {
  const arenaWidth = normalizeArenaDimension(dimensions.arenaWidth);
  const arenaHeight = normalizeArenaDimension(dimensions.arenaHeight);
  const bossWidth = clamp(finiteOr(dimensions.bossWidth, 1), 1, arenaWidth);
  const bossHeight = clamp(finiteOr(dimensions.bossHeight, 1), 1, arenaHeight);
  return resolveBossVanishReentryLock({
    arenaWidth,
    arenaHeight,
    bossWidth,
    bossHeight,
    startX: bossCenterFromRatio(lock.ratios.startX, arenaWidth, bossWidth),
    startY: bossCenterFromRatio(lock.ratios.startY, arenaHeight, bossHeight),
    targetX: clamp01(lock.ratios.targetX) * arenaWidth,
    targetY: clamp01(lock.ratios.targetY) * arenaHeight,
    reentryX: bossCenterFromRatio(lock.ratios.reentryX, arenaWidth, bossWidth),
    reentryY: bossCenterFromRatio(lock.ratios.reentryY, arenaHeight, bossHeight)
  });
};

export const resolveBossVanishReentryDurations = (
  input: BossVanishReentryDurationInput = {}
): Readonly<BossVanishReentryDurations> => {
  const fadeOutFrames = normalizeStageFrames(
    input.fadeOutFrames,
    BOSS_VANISH_REENTRY_DEFAULT_DURATIONS.fadeOutFrames
  );
  const hiddenFrames = normalizeStageFrames(
    input.hiddenFrames,
    BOSS_VANISH_REENTRY_DEFAULT_DURATIONS.hiddenFrames
  );
  const reentryWarningFrames = normalizeStageFrames(
    input.reentryWarningFrames,
    BOSS_VANISH_REENTRY_DEFAULT_DURATIONS.reentryWarningFrames
  );
  const reappearFrames = normalizeStageFrames(
    input.reappearFrames,
    BOSS_VANISH_REENTRY_DEFAULT_DURATIONS.reappearFrames
  );
  const recoveryFrames = normalizeStageFrames(
    input.recoveryFrames,
    BOSS_VANISH_REENTRY_DEFAULT_DURATIONS.recoveryFrames
  );
  return Object.freeze({
    fadeOutFrames,
    hiddenFrames,
    reentryWarningFrames,
    reappearFrames,
    recoveryFrames,
    totalFrames: fadeOutFrames
      + hiddenFrames
      + reentryWarningFrames
      + reappearFrames
      + recoveryFrames
  });
};

export const createBossVanishReentryRuntimeState = ({
  startFrame,
  lock,
  durations = {}
}: {
  readonly startFrame: number;
  readonly lock: Readonly<BossVanishReentryLock>;
  readonly durations?: BossVanishReentryDurationInput;
}): Readonly<BossVanishReentryRuntimeState> => Object.freeze({
  startFrame: normalizeFrame(startFrame),
  lock: cloneLock(lock),
  durations: resolveBossVanishReentryDurations(durations),
  cancelled: false
});

/**
 * Cancellation is data-only and idempotent. Sampling a cancelled state restores
 * a harmless, visible boss at the exact locked re-entry point and requests
 * immediate state cleanup.
 */
export const cancelBossVanishReentryRuntime = (
  state: Readonly<BossVanishReentryRuntimeState>
): Readonly<BossVanishReentryRuntimeState> => state.cancelled
  ? state
  : Object.freeze({ ...state, cancelled: true });

export const reprojectBossVanishReentryRuntimeState = (
  state: Readonly<BossVanishReentryRuntimeState>,
  dimensions: Pick<
    BossVanishReentryGeometryInput,
    'arenaWidth' | 'arenaHeight' | 'bossWidth' | 'bossHeight'
  >
): Readonly<BossVanishReentryRuntimeState> => Object.freeze({
  ...state,
  lock: reprojectBossVanishReentryLock(state.lock, dimensions)
});

const interpolatePoint = (
  start: Readonly<BossVanishReentryPoint>,
  end: Readonly<BossVanishReentryPoint>,
  progress: number
) => {
  const eased = smoothstep(progress);
  return freezePoint(
    start.x + (end.x - start.x) * eased,
    start.y + (end.y - start.y) * eased
  );
};

/**
 * Samples the complete lifecycle from an absolute simulation frame. The
 * primitive itself never deals contact damage; callers may begin a separately
 * warned damaging action only after this state has completed and been cleared.
 */
export const sampleBossVanishReentryRuntime = (
  state: Readonly<BossVanishReentryRuntimeState>,
  frameCount: number
): Readonly<BossVanishReentrySample> => {
  const { durations, lock } = state;
  if (state.cancelled) {
    return Object.freeze({
      stage: 'recovery',
      stageFrame: durations.recoveryFrames,
      stageDurationFrames: durations.recoveryFrames,
      stageProgress: 1,
      totalProgress: 1,
      position: freezePoint(lock.reentry.x, lock.reentry.y),
      target: freezePoint(lock.target.x, lock.target.y),
      reentryAngleRadians: lock.reentryAngleRadians,
      opacity: 1,
      warningActive: false,
      visible: true,
      targetable: true,
      collisionActive: true,
      damageActive: false,
      complete: true,
      cancelled: true,
      shouldCleanup: true
    });
  }

  const frame = normalizeFrame(frameCount);
  const elapsed = Math.max(0, frame - state.startFrame);
  const hiddenStart = durations.fadeOutFrames;
  const warningStart = hiddenStart + durations.hiddenFrames;
  const reappearStart = warningStart + durations.reentryWarningFrames;
  const recoveryStart = reappearStart + durations.reappearFrames;
  const complete = elapsed >= durations.totalFrames;

  let stage: BossVanishReentryStage;
  let stageStart: number;
  let stageDurationFrames: number;
  if (elapsed < hiddenStart) {
    stage = 'fade-out';
    stageStart = 0;
    stageDurationFrames = durations.fadeOutFrames;
  } else if (elapsed < warningStart) {
    stage = 'hidden';
    stageStart = hiddenStart;
    stageDurationFrames = durations.hiddenFrames;
  } else if (elapsed < reappearStart) {
    stage = 'reentry-warning';
    stageStart = warningStart;
    stageDurationFrames = durations.reentryWarningFrames;
  } else if (elapsed < recoveryStart) {
    stage = 'reappear';
    stageStart = reappearStart;
    stageDurationFrames = durations.reappearFrames;
  } else {
    stage = 'recovery';
    stageStart = recoveryStart;
    stageDurationFrames = durations.recoveryFrames;
  }

  const stageFrame = complete
    ? stageDurationFrames
    : Math.max(0, elapsed - stageStart);
  const stageProgress = complete
    ? 1
    : clamp01(stageFrame / Math.max(1, stageDurationFrames));
  const position = stage === 'fade-out'
    ? freezePoint(lock.start.x, lock.start.y)
    : stage === 'hidden'
      ? interpolatePoint(lock.start, lock.reentry, stageProgress)
      : freezePoint(lock.reentry.x, lock.reentry.y);
  const opacity = stage === 'fade-out'
    ? 1 - smoothstep(stageProgress)
    : stage === 'hidden' || stage === 'reentry-warning'
      ? 0
      : stage === 'reappear'
        ? smoothstep(stageProgress)
        : 1;
  const recoveryActive = stage === 'recovery';

  return Object.freeze({
    stage,
    stageFrame,
    stageDurationFrames,
    stageProgress,
    totalProgress: clamp01(elapsed / Math.max(1, durations.totalFrames)),
    position,
    target: freezePoint(lock.target.x, lock.target.y),
    reentryAngleRadians: lock.reentryAngleRadians,
    opacity,
    warningActive: stage === 'reentry-warning',
    visible: stage === 'fade-out' || stage === 'reappear' || recoveryActive,
    targetable: recoveryActive,
    collisionActive: recoveryActive,
    damageActive: false,
    complete,
    cancelled: false,
    shouldCleanup: complete
  });
};
