import type {
  PreviewBossAssembledMotionProfile,
  PreviewBossModularActionPresentation
} from './PreviewBossRigContracts';

export type AssembledBossRevivalStage =
  | 'armed'
  | 'shutdown'
  | 'rebooting'
  | 'complete'
  | undefined;

export interface AssembledBossMotionInput {
  readonly profile: PreviewBossAssembledMotionProfile;
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly charging: boolean;
  readonly revivalStage?: AssembledBossRevivalStage;
  readonly revivalProgress?: number;
  readonly action?: PreviewBossModularActionPresentation | null;
}

export interface AssembledBossMotion {
  readonly offsetY: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Presentation-only motion for bosses whose generated sheet is not safe to
 * reassemble with a shared attachment map. The output never changes gameplay
 * position, collision size, health, or simulation timing.
 */
export const sampleAssembledBossMotion = (
  input: AssembledBossMotionInput
): AssembledBossMotion => {
  const motionScale = input.reducedMotion ? 0.32 : 1;
  const charge = input.charging ? 1 : 0;

  if (input.profile === 'wingbeat-hover') {
    const wingbeat = Math.sin(input.frameCount * 0.115);
    const breathing = Math.sin(input.frameCount * 0.047);
    return {
      offsetY: breathing * 3.2 * motionScale,
      rotation: Math.sin(input.frameCount * 0.029) * 0.022 * motionScale,
      scaleX: 1 + wingbeat * 0.018 * motionScale + charge * 0.012,
      scaleY: 1 - Math.abs(wingbeat) * 0.012 * motionScale + charge * 0.008
    };
  }

  if (input.profile === 'paired-resonance') {
    const resonance = Math.sin(input.frameCount * 0.082);
    return {
      offsetY: Math.sin(input.frameCount * 0.041) * 2.8 * motionScale,
      rotation: resonance * 0.018 * motionScale,
      scaleX: 1 + resonance * 0.012 * motionScale + charge * 0.01,
      scaleY: 1 - resonance * 0.008 * motionScale + charge * 0.01
    };
  }

  const stage = input.revivalStage ?? 'armed';
  const progress = clamp01(input.revivalProgress ?? 0);
  if (stage === 'shutdown') {
    return {
      offsetY: 22 * progress,
      rotation: 0.15 * progress,
      scaleX: 1 - progress * 0.035,
      scaleY: 1 - progress * 0.075
    };
  }
  if (stage === 'rebooting') {
    const remaining = 1 - progress;
    const ignition = (
      Math.sin(input.frameCount * 0.46)
      * remaining
      * Math.min(1, progress * 5)
      * motionScale
    );
    return {
      offsetY: remaining * 22,
      rotation: remaining * 0.15 + ignition * 0.035,
      scaleX: 0.965 + progress * 0.035 + Math.abs(ignition) * 0.018,
      scaleY: 0.925 + progress * 0.075 + Math.abs(ignition) * 0.024
    };
  }

  const restoredEnergy = stage === 'complete' ? 1 : 0.42;
  const pulse = Math.sin(input.frameCount * (stage === 'complete' ? 0.09 : 0.052));
  const actionProgress = clamp01(input.action?.progress ?? 0);
  const actionEnvelope = input.action?.stage === 'fire'
    ? Math.sin(actionProgress * Math.PI)
    : input.action?.stage === 'warning'
      ? actionProgress * 0.72
      : 0;
  const sideSign = input.action?.side === 'port'
    ? -1
    : input.action?.side === 'starboard'
      ? 1
      : 0;
  const coreKick = (
    input.action?.primitiveId === 'gap-ring'
    || input.action?.primitiveId === 'inward-collapse'
    || input.action?.primitiveId === 'cross-beam'
  ) ? actionEnvelope : 0;
  return {
    offsetY: Math.sin(input.frameCount * 0.037) * 3.4 * motionScale + coreKick * 2.4,
    rotation: (
      Math.sin(input.frameCount * 0.021) * 0.016
      + sideSign * actionEnvelope * 0.034
    ) * motionScale,
    scaleX: 1 + pulse * 0.012 * restoredEnergy * motionScale + charge * 0.012 + coreKick * 0.012,
    scaleY: 1 - pulse * 0.008 * restoredEnergy * motionScale + charge * 0.008 - coreKick * 0.01
  };
};
