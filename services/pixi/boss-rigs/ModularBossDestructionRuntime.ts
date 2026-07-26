import type {
  ModularBossDestructionFragment,
  ModularBossDestructionSequence
} from './ModularHierarchyRig';

export interface ModularBossDestructionFragmentPose {
  readonly visible: boolean;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly rotationOffset: number;
  readonly alpha: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Deterministic, fixed-step breakup pose. Rendering may sample at any cadence;
 * identical authored frames always produce the same fragment transform.
 */
export const sampleModularBossDestructionFragment = (
  sequence: ModularBossDestructionSequence,
  fragment: ModularBossDestructionFragment,
  elapsedFrames: number
): ModularBossDestructionFragmentPose => {
  const localDuration = Math.max(1, sequence.durationFrames - fragment.delayFrames);
  const localFrame = elapsedFrames - fragment.delayFrames;
  if (localFrame < 0) {
    return Object.freeze({
      visible: false,
      xOffset: 0,
      yOffset: 0,
      rotationOffset: 0,
      alpha: 1
    });
  }
  const progress = clamp01(localFrame / localDuration);
  const fade = clamp01((progress - 0.62) / 0.38);
  return Object.freeze({
    visible: progress < 1,
    xOffset: fragment.travelX * progress,
    // A small authored-space gravity arc gives separated pieces weight while
    // preserving the exact configured destination at progress 1.
    yOffset: fragment.travelY * progress + Math.abs(fragment.travelX) * 0.08 * progress * progress,
    rotationOffset: fragment.rotationRadians * progress,
    alpha: 1 - fade
  });
};

