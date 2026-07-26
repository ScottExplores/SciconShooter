import type {
  PreviewBossAssembledMotionProfile,
  PreviewBossModularActionPresentation,
  TransformingOrbiterPartId
} from './PreviewBossRigContracts';

export interface AssembledBossAccentPoseInput {
  readonly profile: PreviewBossAssembledMotionProfile;
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly charging: boolean;
  readonly healthRatio: number;
  readonly revivalStage?: 'armed' | 'shutdown' | 'rebooting' | 'complete';
  readonly revivalProgress?: number;
  readonly action?: PreviewBossModularActionPresentation | null;
}

export interface AssembledBossAccentPose {
  readonly orbitAngle: number;
  readonly orbitRadiusX: number;
  readonly orbitRadiusY: number;
  readonly nodeScale: number;
  readonly nodeAlpha: number;
  /** 0-1 stepped by the renderer into fully opaque authored node reveals. */
  readonly nodeDeployment: number;
  readonly haloFrame: 0 | 1 | 2 | 3;
  readonly haloAlpha: number;
  readonly haloScale: number;
  readonly pulseFrame: 0 | 1 | 2;
  readonly pulseAlpha: number;
  readonly pulseScale: number;
  readonly laserHubAlpha: number;
  readonly laserHubRotation: number;
  readonly laserHubScale: number;
  readonly corePart: Extract<TransformingOrbiterPartId, 'coreClosed' | 'coreOpen'>;
  readonly coreAlpha: number;
  readonly coreScale: number;
  readonly perimeterAlpha: number;
  readonly perimeterRotation: number;
  readonly perimeterScale: number;
  readonly emitterAlpha: number;
  readonly emitterRecoil: number;
  readonly leftEmitterAlpha: number;
  readonly rightEmitterAlpha: number;
  readonly leftEmitterRecoil: number;
  readonly rightEmitterRecoil: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Mechanical accent animation for generated bosses whose complete silhouette
 * must stay intact. The accents reuse opaque parts from the authored sheet:
 * orbiting weapon nodes, stepped energy halos, charge pulses, and alternate
 * cores. This creates readable motion without tearing a generated boss apart
 * with a generic attachment map.
 */
export const sampleAssembledBossAccentPose = (
  input: AssembledBossAccentPoseInput
): AssembledBossAccentPose => {
  const motionScale = input.reducedMotion ? 0.34 : 1;
  const healthPressure = 1 - clamp01(input.healthRatio);
  const charge = input.charging ? 1 : 0;
  const revivalProgress = clamp01(input.revivalProgress ?? 0);
  const revivalStage = input.revivalStage ?? 'armed';
  const action = input.action;
  const actionProgress = clamp01(action?.progress ?? 0);
  const actionActive = action?.stage === 'warning' || action?.stage === 'fire';
  const warningEnergy = action?.stage === 'warning' ? actionProgress : 0;
  const fireEnergy = action?.stage === 'fire'
    ? Math.sin(actionProgress * Math.PI)
    : 0;
  const actionEnergy = Math.max(warningEnergy, fireEnergy);
  const coreAction = actionActive && (
    action?.primitiveId === 'gap-ring'
    || action?.primitiveId === 'inward-collapse'
    || action?.primitiveId === 'rotating-cross'
    || action?.primitiveId === 'cross-beam'
  );
  const beamAction = actionActive && (
    action?.primitiveId === 'cross-beam'
    || action?.primitiveId === 'rotating-cross'
    || action?.primitiveId === 'helix-volley'
  );
  const ringAction = actionActive && (
    action?.primitiveId === 'gap-ring'
    || action?.primitiveId === 'inward-collapse'
  );
  const sideBarrage = actionActive && action?.primitiveId === 'side-barrage';
  const cadence = input.profile === 'paired-resonance'
    ? 0.052
    : input.profile === 'wingbeat-hover'
      ? 0.043
      : 0.034;
  const beat = (Math.sin(input.frameCount * cadence) + 1) * 0.5;
  const fastBeat = (Math.sin(input.frameCount * (cadence * 2.7)) + 1) * 0.5;
  const activeRevival = revivalStage === 'rebooting' || revivalStage === 'complete';
  const energy = clamp01(
    0.2
      + healthPressure * 0.42
      + charge * 0.52
      + (activeRevival ? 0.38 + revivalProgress * 0.24 : 0)
  );

  const profileRadius = input.profile === 'paired-resonance'
    ? { x: 138, y: 72 }
    : input.profile === 'wingbeat-hover'
      ? { x: 174, y: 88 }
      : { x: 178, y: 102 };
  const shutdown = revivalStage === 'shutdown';
  const nodeDeployment = input.profile !== 'revival-shell'
    ? 1
    : revivalStage === 'complete'
      ? 1
      : revivalStage === 'rebooting'
        ? clamp01((revivalProgress - 0.1) / 0.58)
        : 0;
  const genericEmitterCharge = charge > 0 && !actionActive;
  const leftEmitterActive = !shutdown && (
    genericEmitterCharge
    || (sideBarrage && action?.side === 'port')
  );
  const rightEmitterActive = !shutdown && (
    genericEmitterCharge
    || (sideBarrage && action?.side === 'starboard')
  );
  const emitterRecoil = (genericEmitterCharge ? fastBeat : actionEnergy) * 9;
  const coreVisible = !shutdown && (
    coreAction
    || revivalStage === 'rebooting'
    || (charge > 0 && !sideBarrage)
  );

  return {
    orbitAngle: input.frameCount * cadence * motionScale,
    orbitRadiusX: profileRadius.x * (0.92 + energy * 0.08),
    orbitRadiusY: profileRadius.y * (0.92 + energy * 0.08),
    nodeScale: input.profile === 'paired-resonance'
      ? 0.27
      : input.profile === 'revival-shell'
        ? 0.3
        : 0.25,
    nodeAlpha: shutdown || nodeDeployment < 0.25 ? 0 : 1,
    nodeDeployment,
    haloFrame: Math.min(3, Math.floor(beat * 4)) as 0 | 1 | 2 | 3,
    haloAlpha: shutdown ? 0 : coreAction || beamAction || revivalStage === 'rebooting' ? 1 : 0,
    haloScale: 0.68 + energy * 0.26,
    pulseFrame: Math.min(2, Math.floor(fastBeat * 3)) as 0 | 1 | 2,
    pulseAlpha: shutdown ? 0 : coreAction || revivalStage === 'rebooting' ? 1 : 0,
    pulseScale: 0.56 + energy * 0.36,
    laserHubAlpha: shutdown ? 0 : beamAction ? 1 : 0,
    laserHubRotation: input.frameCount * 0.045 * motionScale,
    laserHubScale: 0.48 + energy * 0.2,
    corePart: coreVisible ? 'coreOpen' : 'coreClosed',
    coreAlpha: coreVisible ? 1 : 0,
    coreScale: input.profile === 'wingbeat-hover'
      ? 0.68
      : input.profile === 'revival-shell'
        ? 0.82
        : 0.58,
    perimeterAlpha: ringAction ? 1 : 0,
    perimeterRotation: input.frameCount * 0.028 * motionScale,
    perimeterScale: 0.78 + actionEnergy * 0.2,
    emitterAlpha: leftEmitterActive || rightEmitterActive ? 1 : 0,
    emitterRecoil,
    leftEmitterAlpha: leftEmitterActive ? 1 : 0,
    rightEmitterAlpha: rightEmitterActive ? 1 : 0,
    leftEmitterRecoil: leftEmitterActive ? emitterRecoil : 0,
    rightEmitterRecoil: rightEmitterActive ? emitterRecoil : 0
  };
};
