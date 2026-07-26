export interface TransformingOrbiterActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
}

export type TransformingOrbiterRevivalStage =
  | 'none'
  | 'armed'
  | 'shutdown'
  | 'rebooting'
  | 'complete';

export interface TransformingOrbiterPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly bankRadians: number;
  readonly charging: boolean;
  readonly coreExposed: boolean;
  readonly finalPhase: boolean;
  readonly revivalStage?: TransformingOrbiterRevivalStage | null;
  readonly revivalProgress?: number | null;
  readonly revived?: boolean;
  readonly action?: TransformingOrbiterActionPresentation | null;
}

export interface TransformingOrbiterPose {
  /** True only for the opt-in two-form lifecycle; legacy orbiters retain their pose. */
  readonly revivalControlled: boolean;
  readonly bodyBob: number;
  readonly bodyRotation: number;
  readonly deployment: number;
  /** Drives sequential, opaque deployment of fins and orbit nodes. */
  readonly rearDeployment: number;
  readonly coreOpenAmount: number;
  readonly leftEmitterRecoil: number;
  readonly rightEmitterRecoil: number;
  readonly wingAngle: number;
  readonly finExtension: number;
  readonly nodeOrbitAngle: number;
  readonly nodeOrbitRadius: number;
  readonly haloFrame: 0 | 1 | 2 | 3;
  readonly haloAlpha: number;
  readonly haloScale: number;
  readonly perimeterAlpha: number;
  readonly perimeterRotation: number;
  readonly perimeterScale: number;
  readonly laserHubAlpha: number;
  readonly laserHubRotation: number;
  readonly pulseFrame: 0 | 1 | 2;
  readonly pulseAlpha: number;
  readonly pulseScale: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const smoothstep = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

const sampleActionEnvelope = (
  action: TransformingOrbiterActionPresentation | null | undefined
) => {
  if (!action) return 0;
  const progress = clamp(finiteOr(action.progress, 0.5), 0, 1);
  const stage = String(action.stage ?? '').toLowerCase();
  if (stage === 'warning') return Math.sin(progress * Math.PI * 0.5);
  if (stage === 'fire') return 1 - progress * 0.38;
  if (stage === 'death') return 1 - progress;
  return Math.sin(progress * Math.PI);
};

/**
 * Deterministic visual transform sampler for a transforming orbital rig.
 * Reduced motion only damps ambient drift; authored warnings remain readable.
 */
export const sampleTransformingOrbiterPose = (
  input: TransformingOrbiterPoseInput
): TransformingOrbiterPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const pressure = 1 - healthRatio;
  const idleScale = input.reducedMotion ? 0.2 : 1;
  const revivalStage = input.revivalStage ?? 'none';
  const revivalControlled = revivalStage !== 'none' || input.revived === true;
  const form2Complete = revivalStage === 'complete'
    || (revivalStage === 'none' && input.revived === true);
  const revivalProgress = clamp(finiteOr(input.revivalProgress, 0), 0, 1);
  const shutdownAmount = revivalStage === 'shutdown'
    ? 1
    : 0;
  const rebootAmount = revivalStage === 'rebooting'
    ? smoothstep(revivalProgress)
    : form2Complete
      ? 1
      : 0;
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '');
  const actionEnvelope = sampleActionEnvelope(action);
  const side = action?.side;
  const leftSelected = side === 'left' || side === 'port';
  const rightSelected = side === 'right' || side === 'starboard';
  const bothSelected = !leftSelected && !rightSelected;
  const isBeamAction = primitiveId === 'rotating-cross'
    || primitiveId === 'cross-beam'
    || primitiveId === 'rail-sweep';
  const isRingAction = primitiveId === 'gap-ring'
    || primitiveId === 'inward-collapse';
  const isEmitterAction = isBeamAction
    || primitiveId === 'aimed-burst'
    || primitiveId === 'side-barrage'
    || primitiveId === 'weave-wall';
  const emitterEnergy = isEmitterAction ? actionEnvelope : 0;
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const finalDeployment = input.finalPhase ? 0.22 : 0;
  const actionDeployment = Math.max(
    isBeamAction ? actionEnvelope * 0.62 : 0,
    isRingAction ? actionEnvelope * 0.48 : 0
  );
  const activeDeployment = clamp(
    0.24 + pressure * 0.25 + finalDeployment + actionDeployment,
    0,
    1
  );
  const armedDeployment = clamp(activeDeployment * 0.68, 0, 0.42);
  const awakenedDeployment = Math.max(0.76, activeDeployment);
  const deployment = revivalStage === 'armed'
    ? armedDeployment
    : revivalStage === 'shutdown'
      ? armedDeployment * (1 - shutdownAmount)
      : revivalStage === 'rebooting'
        ? awakenedDeployment * rebootAmount
        : form2Complete
          ? awakenedDeployment
          : activeDeployment;
  const rearDeployment = revivalControlled
    ? revivalStage === 'rebooting'
      ? smoothstep((revivalProgress - 0.16) / 0.78)
      : form2Complete
        ? 1
        : 0
    : 1;
  const coreOpenTarget = revivalControlled
    ? revivalStage === 'rebooting'
      ? revivalProgress >= 0.34 ? 1 : 0
      : form2Complete
        ? 1
        : 0
    : input.coreExposed || input.finalPhase
      ? 1
      : actionDeployment * 0.55;
  const firePulse = action?.stage === 'fire' ? actionEnvelope : 0;
  const actionHaloEnergy = input.charging
    ? 0.5 + (Math.sin(frame * 0.13) + 1) * 0.15 * idleScale
    : action?.stage === 'warning'
      ? actionEnvelope
      : 0;
  const rebootPulse = revivalStage === 'rebooting'
    ? Math.sin(revivalProgress * Math.PI)
    : 0;
  const transitionSuppressesWeapons = revivalStage === 'shutdown'
    || revivalStage === 'rebooting';
  const haloEnergy = transitionSuppressesWeapons
    ? rebootPulse
    : actionHaloEnergy;
  const bank = clamp(finiteOr(input.bankRadians, 0) / 0.4, -1, 1);
  const ambientBob = Math.sin(frame * 0.036) * (3 + pressure * 1.5) * idleScale;
  const ambientRotation = frame * 0.0025 * idleScale + bank * 0.045;
  const bodyBob = revivalStage === 'shutdown'
    ? ambientBob * (1 - shutdownAmount) + 24 * shutdownAmount
    : revivalStage === 'rebooting'
      ? 24 * (1 - rebootAmount) + ambientBob * rebootAmount
      : ambientBob;
  const bodyRotation = revivalStage === 'shutdown'
    ? ambientRotation * (1 - shutdownAmount) + 0.16 * shutdownAmount
    : revivalStage === 'rebooting'
      ? 0.16 * (1 - rebootAmount) + ambientRotation * rebootAmount
      : ambientRotation;
  const activeWingAngle = 0.06 + deployment * 0.32;
  const wingAngle = revivalStage === 'shutdown'
    ? activeWingAngle * (1 - shutdownAmount) + 0.72 * shutdownAmount
    : revivalStage === 'rebooting'
      ? 0.72 * (1 - rebootAmount) + activeWingAngle * rebootAmount
      : activeWingAngle;
  const nodeOrbitAngle = revivalStage === 'shutdown'
    ? sequence * Math.PI * 0.5
    : revivalStage === 'rebooting'
      ? sequence * Math.PI * 0.5 + rebootAmount * Math.PI * 0.22
      : frame * (0.018 + pressure * 0.006) * idleScale
        + sequence * Math.PI * 0.25;
  const rebootHaloFrame = Math.min(
    3,
    Math.floor(clamp(revivalProgress, 0, 0.999) * 4)
  ) as 0 | 1 | 2 | 3;
  const rebootPulseFrame = Math.min(
    2,
    Math.floor(clamp(revivalProgress, 0, 0.999) * 3)
  ) as 0 | 1 | 2;

  return {
    revivalControlled,
    bodyBob,
    bodyRotation,
    deployment,
    rearDeployment,
    coreOpenAmount: clamp(coreOpenTarget, 0, 1),
    leftEmitterRecoil: transitionSuppressesWeapons
      ? 0
      : (leftSelected || bothSelected) ? emitterEnergy : 0,
    rightEmitterRecoil: transitionSuppressesWeapons
      ? 0
      : (rightSelected || bothSelected) ? emitterEnergy : 0,
    wingAngle,
    finExtension: revivalControlled
      ? 8 + deployment * 42
      : 8 + deployment * 34,
    nodeOrbitAngle,
    nodeOrbitRadius: revivalControlled
      ? 82 + rearDeployment * 78
      : 116 + deployment * 44,
    haloFrame: revivalStage === 'rebooting'
      ? rebootHaloFrame
      : Math.min(3, Math.floor(clamp(haloEnergy, 0, 0.999) * 4)) as 0 | 1 | 2 | 3,
    haloAlpha: clamp(haloEnergy, 0, 0.9),
    haloScale: revivalStage === 'rebooting'
      ? 0.68 + revivalProgress * 0.5
      : 0.72 + haloEnergy * 0.38,
    perimeterAlpha: revivalStage === 'rebooting'
      ? clamp(rebootPulse * 0.76, 0, 0.76)
      : isRingAction
        ? clamp(actionEnvelope, 0, 0.92)
        : 0,
    perimeterRotation: revivalStage === 'rebooting'
      ? revivalProgress * Math.PI * 0.7
      : frame * 0.014 * idleScale + actionEnvelope * 0.3,
    perimeterScale: revivalStage === 'rebooting'
      ? 0.68 + revivalProgress * 0.38
      : 0.78 + actionEnvelope * 0.25,
    laserHubAlpha: transitionSuppressesWeapons
      ? 0
      : isBeamAction ? clamp(actionEnvelope, 0, 1) : 0,
    laserHubRotation: frame * (primitiveId === 'rotating-cross' ? 0.035 : 0.012)
      + sequence * Math.PI * 0.25,
    pulseFrame: revivalStage === 'rebooting'
      ? rebootPulseFrame
      : Math.min(2, Math.floor(clamp(firePulse, 0, 0.999) * 3)) as 0 | 1 | 2,
    pulseAlpha: revivalStage === 'rebooting'
      ? clamp(rebootPulse * 0.96, 0, 0.96)
      : transitionSuppressesWeapons
        ? 0
        : clamp(firePulse, 0, 0.96),
    pulseScale: revivalStage === 'rebooting'
      ? 0.62 + revivalProgress * 0.9
      : 0.7 + firePulse * 0.5
  };
};
