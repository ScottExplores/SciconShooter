export interface SegmentedCrescentActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly intensity?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
}

export interface SegmentedCrescentPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly bankRadians: number;
  readonly charging: boolean;
  readonly action?: SegmentedCrescentActionPresentation | null;
}

export interface SegmentedCrescentPose {
  readonly bodyBob: number;
  readonly bodyScaleX: number;
  readonly bodyScaleY: number;
  readonly leftArmSpread: number;
  readonly rightArmSpread: number;
  readonly leftArmCurl: number;
  readonly rightArmCurl: number;
  readonly leftPodRecoil: number;
  readonly rightPodRecoil: number;
  readonly podAim: number;
  readonly tailSway: number;
  readonly tailFrame: 0 | 1 | 2;
  readonly coreScale: number;
  readonly ringAlpha: number;
  readonly ringRotation: number;
  readonly ringScale: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const resolveActionIntensity = (
  action: SegmentedCrescentActionPresentation | null | undefined
): number => {
  if (!action) return 0;
  if (Number.isFinite(action.intensity)) return clamp(Number(action.intensity), 0, 1);
  const progress = clamp(finiteOr(action.progress, 0.5), 0, 1);
  const stage = String(action.stage ?? '').toLowerCase();
  if (stage.includes('telegraph') || stage.includes('warning') || stage.includes('wind')) {
    return Math.sin(progress * Math.PI * 0.5);
  }
  if (stage.includes('recover')) return 1 - progress;
  if (stage.includes('fire') || stage.includes('active')) {
    return 1 - progress * 0.35;
  }
  return Math.sin(progress * Math.PI);
};

/**
 * Samples presentation-only pose values from the deterministic simulation
 * clock. It never reads wall time and cannot influence boss collision or rules.
 */
export const sampleSegmentedCrescentPose = (
  input: SegmentedCrescentPoseInput
): SegmentedCrescentPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const pressure = 1 - healthRatio;
  const idleMotionScale = input.reducedMotion ? 0.3 : 1;
  const authoredMotionScale = input.reducedMotion ? 0.62 : 1;
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '');
  const actionIntensity = resolveActionIntensity(action) * authoredMotionScale;
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const side = action?.side;
  const leftSelected = side === 'port' || side === 'left';
  const rightSelected = side === 'starboard' || side === 'right';
  const bothSelected = !leftSelected && !rightSelected;
  const bank = clamp(finiteOr(input.bankRadians, 0) / 0.38, -1, 1);
  const breath = Math.sin(frame * (0.045 + pressure * 0.01)) * idleMotionScale;
  const armPulse = Math.sin(frame * 0.055) * idleMotionScale;
  const chargingIntensity = input.charging ? 0.55 * authoredMotionScale : 0;
  const aperturePhase = healthRatio <= 0.35;
  const apertureHeartbeat = aperturePhase
    ? (Math.sin(frame * 0.145) + 1) * 0.5 * idleMotionScale
    : 0;
  const apertureAsymmetry = aperturePhase
    ? Math.sin(frame * 0.071) * 0.022 * idleMotionScale
    : 0;

  const opensArms = primitiveId === 'gap-ring'
    || primitiveId === 'rotating-cross'
    || primitiveId === 'pod-volley'
    || primitiveId === 'weave-wall'
    || primitiveId === 'summon-formation';
  const aimsPods = primitiveId === 'aimed-burst'
    || primitiveId === 'cross-beam'
    || primitiveId === 'rail-sweep'
    || primitiveId === 'side-barrage'
    || primitiveId === 'pod-volley';
  const tailAttack = primitiveId === 'tail-fan' || primitiveId === 'helix-volley';
  const collapseAttack = primitiveId === 'inward-collapse';
  const ringAttack = primitiveId === 'gap-ring'
    || primitiveId === 'rotating-cross'
    || primitiveId === 'cross-beam'
    || collapseAttack;
  const baseSpread = (
    0.035
    + armPulse * 0.018
    + (opensArms ? actionIntensity * 0.24 : 0)
    - (collapseAttack ? actionIntensity * 0.18 : 0)
  );
  const collapseCurl = collapseAttack ? -actionIntensity * 0.28 : 0;
  const aimCurl = (aimsPods ? actionIntensity * 0.2 : chargingIntensity * 0.08)
    + collapseCurl;
  const selectedKick = primitiveId === 'side-barrage' ? actionIntensity : 0;
  const leftKick = (leftSelected || bothSelected) ? selectedKick : 0;
  const rightKick = (rightSelected || bothSelected) ? selectedKick : 0;
  const tailEnergy = tailAttack ? actionIntensity : 0;
  const tailStep = aperturePhase
    ? input.reducedMotion ? 10 : 5
    : input.reducedMotion ? 14 : 8;
  const tailPhase = Math.floor(frame / tailStep) % 4;
  const tailFrame = (tailPhase === 3 ? 1 : tailPhase) as 0 | 1 | 2;
  const ringStrength = ringAttack
    ? actionIntensity
    : apertureHeartbeat * 0.16;
  const podVolley = primitiveId === 'pod-volley';
  const leftPodRecoil = podVolley
    ? actionIntensity * (sequence % 2 === 0 ? 1 : 0.46)
    : (leftSelected || bothSelected) ? actionIntensity : chargingIntensity;
  const rightPodRecoil = podVolley
    ? actionIntensity * (sequence % 2 === 1 ? 1 : 0.46)
    : (rightSelected || bothSelected) ? actionIntensity : chargingIntensity;

  return {
    bodyBob: breath * (2.6 + pressure * 1.2)
      + Math.sin(frame * 0.083) * apertureHeartbeat * 1.8,
    bodyScaleX: 1 + breath * 0.006,
    bodyScaleY: 1 - breath * 0.008,
    leftArmSpread: baseSpread - bank * 0.08 + leftKick * 0.07 + apertureAsymmetry,
    rightArmSpread: baseSpread + bank * 0.08 + rightKick * 0.07 - apertureAsymmetry,
    leftArmCurl: aimCurl + bank * 0.035,
    rightArmCurl: aimCurl - bank * 0.035,
    leftPodRecoil,
    rightPodRecoil,
    podAim: aimsPods ? actionIntensity : chargingIntensity,
    tailSway: (
      Math.sin(frame * (0.06 + pressure * 0.016)) * 0.08 * idleMotionScale
      + Math.sin(frame * 0.21) * 0.14 * tailEnergy
    ),
    tailFrame,
    coreScale: 1 + (Math.sin(frame * 0.11) + 1) * 0.025 * idleMotionScale
      + chargingIntensity * 0.045
      + apertureHeartbeat * 0.07,
    ringAlpha: clamp(ringStrength * 0.92, 0, 0.92),
    ringRotation: frame * (0.012 + pressure * 0.005) * idleMotionScale
      + actionIntensity * (collapseAttack ? -0.22 : 0.16),
    ringScale: 0.82 + ringStrength * 0.28
  };
};
