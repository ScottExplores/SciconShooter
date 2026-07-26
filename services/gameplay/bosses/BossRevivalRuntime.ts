import type {
  BossHealthPhase,
  BossRevivalConfig
} from '../../../game-config/types';

export const BOSS_REVIVAL_VIEWPORT_WIDTH_RATIO = 0.82;
export const BOSS_REVIVAL_MIN_DURATION_SECONDS = 0.1;
export const BOSS_REVIVAL_MAX_DURATION_SECONDS = 10;
export const BOSS_REVIVAL_MIN_SIZE_MULTIPLIER = 1;
export const BOSS_REVIVAL_MAX_SIZE_MULTIPLIER = 1.5;

export type BossRevivalStage = 'armed' | 'shutdown' | 'rebooting' | 'complete';

export interface BossRevivalRuntimeState {
  stage: Exclude<BossRevivalStage, 'armed'>;
  stageFrame: number;
  targetPhaseIndex: number;
  baseWidth: number;
  baseHeight: number;
  targetWidth: number;
  targetHeight: number;
}

export interface BossRevivalFrame {
  state: BossRevivalRuntimeState;
  progress: number;
  health: number;
  width: number;
  height: number;
  completedNow: boolean;
}

export interface BossPhaseIndexBounds {
  minimumPhaseIndex?: number;
  maximumPhaseIndex?: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const normalizeDurationFrames = (seconds: number, fps: number) => (
  Math.max(
    1,
    Math.round(
      clamp(
        Number.isFinite(seconds) ? seconds : BOSS_REVIVAL_MIN_DURATION_SECONDS,
        BOSS_REVIVAL_MIN_DURATION_SECONDS,
        BOSS_REVIVAL_MAX_DURATION_SECONDS
      ) * Math.max(1, Math.round(fps))
    )
  )
);

const normalizePositiveDimension = (value: number) => (
  Number.isFinite(value) && value > 0 ? value : 1
);

export const getBossRevivalTargetPhaseIndex = (
  config: BossRevivalConfig | undefined,
  phases: readonly BossHealthPhase[]
) => {
  if (!config) return -1;
  return phases.findIndex((phase) => phase.id === config.phaseId);
};

export const getBossRevivalPhaseBounds = (
  config: BossRevivalConfig | undefined,
  phases: readonly BossHealthPhase[],
  consumed: boolean
): BossPhaseIndexBounds | undefined => {
  const targetPhaseIndex = getBossRevivalTargetPhaseIndex(config, phases);
  if (targetPhaseIndex <= 0) return undefined;
  return consumed
    ? { minimumPhaseIndex: targetPhaseIndex }
    : { maximumPhaseIndex: targetPhaseIndex - 1 };
};

export const getBossRevivalTargetDimensions = (
  baseWidth: number,
  baseHeight: number,
  awakenedSizeMultiplier: number,
  viewportWidth: number
) => {
  const safeWidth = normalizePositiveDimension(baseWidth);
  const safeHeight = normalizePositiveDimension(baseHeight);
  const multiplier = clamp(
    Number.isFinite(awakenedSizeMultiplier) ? awakenedSizeMultiplier : 1,
    BOSS_REVIVAL_MIN_SIZE_MULTIPLIER,
    BOSS_REVIVAL_MAX_SIZE_MULTIPLIER
  );
  const viewportCap = Math.max(
    safeWidth,
    normalizePositiveDimension(viewportWidth) * BOSS_REVIVAL_VIEWPORT_WIDTH_RATIO
  );
  const width = Math.min(safeWidth * multiplier, viewportCap);
  const appliedScale = width / safeWidth;
  return {
    width,
    height: safeHeight * appliedScale
  };
};

export const createBossRevivalRuntimeState = (
  config: BossRevivalConfig,
  phases: readonly BossHealthPhase[],
  baseWidth: number,
  baseHeight: number,
  viewportWidth: number
): BossRevivalRuntimeState | null => {
  const targetPhaseIndex = getBossRevivalTargetPhaseIndex(config, phases);
  if (targetPhaseIndex <= 0) return null;
  const safeWidth = normalizePositiveDimension(baseWidth);
  const safeHeight = normalizePositiveDimension(baseHeight);
  const target = getBossRevivalTargetDimensions(
    safeWidth,
    safeHeight,
    config.awakenedSizeMultiplier,
    viewportWidth
  );
  return {
    stage: 'shutdown',
    stageFrame: 0,
    targetPhaseIndex,
    baseWidth: safeWidth,
    baseHeight: safeHeight,
    targetWidth: target.width,
    targetHeight: target.height
  };
};

export const createCompletedBossRevivalRuntimeState = (
  config: BossRevivalConfig,
  phases: readonly BossHealthPhase[],
  baseWidth: number,
  baseHeight: number,
  viewportWidth: number,
  fps: number
): BossRevivalRuntimeState | null => {
  const state = createBossRevivalRuntimeState(
    config,
    phases,
    baseWidth,
    baseHeight,
    viewportWidth
  );
  if (!state) return null;
  return {
    ...state,
    stage: 'complete',
    stageFrame: normalizeDurationFrames(config.rebootSeconds, fps)
  };
};

export const advanceBossRevivalRuntime = (
  state: BossRevivalRuntimeState,
  config: BossRevivalConfig,
  maxHealth: number,
  fps: number
): BossRevivalFrame => {
  const safeMaxHealth = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : 1;
  const restoreHealthRatio = Number.isFinite(config.restoreHealthRatio)
    ? config.restoreHealthRatio
    : 1;
  const restoredHealth = safeMaxHealth * clamp(restoreHealthRatio, Number.EPSILON, 1);

  if (state.stage === 'complete') {
    return {
      state,
      progress: 1,
      health: restoredHealth,
      width: state.targetWidth,
      height: state.targetHeight,
      completedNow: false
    };
  }

  if (state.stage === 'shutdown') {
    const shutdownFrames = normalizeDurationFrames(config.shutdownSeconds, fps);
    const nextFrame = state.stageFrame + 1;
    const nextState = nextFrame >= shutdownFrames
      ? { ...state, stage: 'rebooting' as const, stageFrame: 0 }
      : { ...state, stageFrame: nextFrame };
    return {
      state: nextState,
      progress: Math.min(1, nextFrame / shutdownFrames),
      health: 0,
      width: state.baseWidth,
      height: state.baseHeight,
      completedNow: false
    };
  }

  const rebootFrames = normalizeDurationFrames(config.rebootSeconds, fps);
  const nextFrame = Math.min(rebootFrames, state.stageFrame + 1);
  const progress = nextFrame / rebootFrames;
  const completedNow = nextFrame >= rebootFrames;
  return {
    state: completedNow
      ? { ...state, stage: 'complete', stageFrame: rebootFrames }
      : { ...state, stageFrame: nextFrame },
    progress,
    health: restoredHealth * progress,
    width: state.baseWidth + (state.targetWidth - state.baseWidth) * progress,
    height: state.baseHeight + (state.targetHeight - state.baseHeight) * progress,
    completedNow
  };
};
