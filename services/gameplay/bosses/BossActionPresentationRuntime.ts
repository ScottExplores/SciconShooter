import type {
  BossTimelineClip,
  BossTimelineMotionCue,
  BossTimelinePrimitiveId
} from '../../../game-config/types';
import type { BossGapRouteDirectionPolicy } from './BossPatternRuntime';

export type BossActionPresentationStage =
  | 'warning'
  | 'fire'
  | 'transition'
  | 'recovery'
  | 'phase-enter'
  | 'death';

export interface BossActionPresentationState {
  /** Exact authored clip and repeat execution currently being presented. */
  actionClipId: string;
  executionIndex: number;
  label: string;
  primitiveId: BossTimelinePrimitiveId;
  stage: BossActionPresentationStage;
  /** Inclusive simulation attack frame. */
  startFrame: number;
  /** Exclusive simulation attack frame. */
  endFrame: number;
  sequence: number;
  projectileCount?: number;
  pulseIntervalSeconds?: number;
  shotIntervalFrames?: number;
  projectileSpeedScale?: number;
  channelWidthPixels?: number;
  sweepRangeRatio?: number;
  sweepPasses?: number;
  motionCue?: BossTimelineMotionCue;
  side?: 'port' | 'starboard';
  handedness?: 'left' | 'right';
  rotationDirection?: BossGapRouteDirectionPolicy;
}

const normalizeInteger = (value: number | undefined) => (
  Math.max(0, Math.floor(Number.isFinite(value) ? Number(value) : 0))
);

export const createBossActionPresentationState = ({
  cueClip,
  sourceClip,
  stage,
  attackFrame,
  executionIndex,
  framesPerSecond
}: {
  cueClip: BossTimelineClip;
  sourceClip: BossTimelineClip;
  stage: BossActionPresentationStage;
  attackFrame: number;
  executionIndex: number;
  framesPerSecond: number;
}): BossActionPresentationState => {
  const startFrame = normalizeInteger(attackFrame);
  const durationSeconds = Math.max(
    cueClip.durationSeconds,
    Number(cueClip.parameters?.warningSeconds) || 0
  );
  const durationFrames = Math.max(
    1,
    Math.round(Math.max(0, durationSeconds) * Math.max(1, framesPerSecond))
  );
  const executionSequence = normalizeInteger(executionIndex);
  const configuredSequence = normalizeInteger(sourceClip.parameters?.sequence);
  // Repeated authored beats always advance their deterministic sequence. This
  // keeps the boss pose, warning guide, projectile route, and replay in lockstep
  // for every primitive, not only the original pod and weave-wall patterns.
  const sequence = configuredSequence + executionSequence;
  return {
    actionClipId: sourceClip.id,
    executionIndex: executionSequence,
    label: sourceClip.label,
    primitiveId: sourceClip.primitiveId,
    stage,
    startFrame,
    endFrame: startFrame + durationFrames,
    sequence,
    ...(sourceClip.parameters?.projectileCount === undefined
      ? {}
      : { projectileCount: sourceClip.parameters.projectileCount }),
    ...(sourceClip.parameters?.shotIntervalFrames === undefined
      ? {}
      : { shotIntervalFrames: sourceClip.parameters.shotIntervalFrames }),
    ...(sourceClip.parameters?.projectileSpeedScale === undefined
      ? {}
      : { projectileSpeedScale: sourceClip.parameters.projectileSpeedScale }),
    ...(sourceClip.primitiveId === 'rotor-hazard-sentence'
      || sourceClip.primitiveId === 'prism-kaleidoscope-brood'
      ? {
          pulseIntervalSeconds: sourceClip.parameters?.pulseIntervalSeconds
        }
      : {}),
    ...(sourceClip.primitiveId === 'paired-cannon-burst'
      || sourceClip.primitiveId === 'prism-wingbeat-weave'
      || sourceClip.primitiveId === 'prism-brood-procession'
      || sourceClip.primitiveId === 'prism-lunar-swoop'
      || sourceClip.primitiveId === 'prism-kaleidoscope-brood'
      ? {
          channelWidthPixels: sourceClip.parameters?.channelWidthPixels,
          sweepRangeRatio: sourceClip.parameters?.sweepRangeRatio,
          sweepPasses: sourceClip.parameters?.sweepPasses
        }
      : {}),
    motionCue: sourceClip.parameters?.motionCue,
    side: sourceClip.parameters?.side,
    handedness: sourceClip.parameters?.handedness,
    rotationDirection: sourceClip.parameters?.rotationDirection
  };
};
