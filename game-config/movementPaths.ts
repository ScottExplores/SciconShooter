import type { MovementPathId } from './types';

export interface NormalizedMovementPathKeyframe {
  /** Monotonic traversal progress in the inclusive range 0..1. */
  progress: number;
  /** Boss-center X as a viewport ratio. A small bounded overscan is allowed. */
  centerXRatio: number;
  /** Boss-center Y as a viewport ratio. Negative values are bounded overscan. */
  centerYRatio: number;
}

export interface MovementPathDescriptor {
  id: MovementPathId;
  label: string;
  description: string;
  /** Suggested editor duration. Individual clips retain authoritative timing. */
  defaultDurationSeconds: number;
  /** Presentation-only roll limit. Collision geometry is never rotated. */
  maxBankRadians: number;
  keyframes: readonly NormalizedMovementPathKeyframe[];
}

export interface NormalizedMovementPathSample {
  centerXRatio: number;
  centerYRatio: number;
  tangentX: number;
  tangentY: number;
  bankRadians: number;
}

const keyframe = (
  progress: number,
  centerXRatio: number,
  centerYRatio: number
): Readonly<NormalizedMovementPathKeyframe> => Object.freeze({
  progress,
  centerXRatio,
  centerYRatio
});

const SWEEP_BANK_REENTRY_KEYFRAMES = Object.freeze([
  keyframe(0, 0.5, 0.24),
  keyframe(0.12, 0.18, 0.27),
  keyframe(0.3, 0.82, 0.32),
  keyframe(0.44, 0.62, 0.2),
  keyframe(0.58, 1.12, -0.16),
  keyframe(0.72, -0.12, -0.16),
  keyframe(0.86, 0.2, 0.22),
  keyframe(1, 0.5, 0.24)
]);

/**
 * Movement paths are code-owned, reviewed primitives rather than campaign
 * data. Authored timelines may reference only IDs in this catalog.
 */
export const MOVEMENT_PATH_CATALOG: Readonly<Record<
  MovementPathId,
  MovementPathDescriptor
>> = Object.freeze({
  'sweep-bank-reentry': Object.freeze({
    id: 'sweep-bank-reentry',
    label: 'Sweep, bank, and re-entry',
    description: 'Cross the combat space, bank into bounded overscan, and re-enter from the opposite side.',
    defaultDurationSeconds: 8,
    maxBankRadians: Math.PI * (22 / 180),
    keyframes: SWEEP_BANK_REENTRY_KEYFRAMES
  })
});

export const isMovementPathId = (value: unknown): value is MovementPathId => (
  typeof value === 'string'
  && Object.prototype.hasOwnProperty.call(MOVEMENT_PATH_CATALOG, value)
);

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/**
 * Pure, deterministic piecewise-linear sampling. The path tangent controls
 * presentation bank while callers continue to use an axis-aligned body.
 */
export const sampleNormalizedMovementPath = (
  pathId: MovementPathId,
  traversalProgress: number
): NormalizedMovementPathSample => {
  const descriptor = MOVEMENT_PATH_CATALOG[pathId];
  const progress = clamp01(traversalProgress);
  const keyframes = descriptor.keyframes;
  let upperIndex = 1;
  while (
    upperIndex < keyframes.length - 1
    && progress > keyframes[upperIndex].progress
  ) {
    upperIndex += 1;
  }

  const lower = keyframes[upperIndex - 1];
  const upper = keyframes[upperIndex];
  const segmentDuration = Math.max(Number.EPSILON, upper.progress - lower.progress);
  const segmentProgress = clamp01((progress - lower.progress) / segmentDuration);
  const deltaX = upper.centerXRatio - lower.centerXRatio;
  const deltaY = upper.centerYRatio - lower.centerYRatio;
  const tangentLength = Math.max(Number.EPSILON, Math.hypot(deltaX, deltaY));
  const tangentX = deltaX / tangentLength;
  const tangentY = deltaY / tangentLength;
  const endpointEnvelope = Math.sin(Math.PI * progress);

  return {
    centerXRatio: lower.centerXRatio + deltaX * segmentProgress,
    centerYRatio: lower.centerYRatio + deltaY * segmentProgress,
    tangentX,
    tangentY,
    bankRadians: Math.max(
      -descriptor.maxBankRadians,
      Math.min(descriptor.maxBankRadians, tangentX * descriptor.maxBankRadians * endpointEnvelope)
    )
  };
};
