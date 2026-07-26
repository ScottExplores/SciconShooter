export interface WingbeatHoverPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly charging: boolean;
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
}

export interface WingbeatHoverPose {
  readonly bodyBob: number;
  readonly bodyRotation: number;
  readonly bodyScaleX: number;
  readonly bodyScaleY: number;
  readonly leftWingX: number;
  readonly rightWingX: number;
  readonly leftWingY: number;
  readonly rightWingY: number;
  readonly leftWingRotation: number;
  readonly rightWingRotation: number;
  readonly leftWingScaleY: number;
  readonly rightWingScaleY: number;
  readonly coreOpen: boolean;
  readonly corePulse: number;
  readonly ramFold: number;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/**
 * Purpose-built articulated pose for Umbra's authored body and two wing
 * sprites. Motion is mechanical and action-aware rather than random drift.
 */
export const sampleWingbeatHoverPose = (
  input: WingbeatHoverPoseInput
): WingbeatHoverPose => {
  const motionScale = input.reducedMotion ? 0.32 : 1;
  const healthPressure = 1 - clamp01(input.healthRatio);
  const actionProgress = clamp01(input.progress ?? 0);
  const primitiveId = String(input.primitiveId ?? '');
  const stage = String(input.stage ?? '');
  const warningEnvelope = stage === 'warning'
    ? smoothstep(actionProgress)
    : 0;
  const fireEnvelope = stage === 'fire'
    ? Math.sin(actionProgress * Math.PI)
    : 0;
  const ramAction = primitiveId === 'corner-ambush-ram';
  const blackoutAction = ramAction || primitiveId === 'corner-ambush-beam';
  const ramFold = ramAction
    ? stage === 'warning'
      ? warningEnvelope
      : stage === 'fire'
        ? 1 - smoothstep((actionProgress - 0.72) / 0.28)
        : 0
    : 0;
  const cadence = 0.092 + healthPressure * 0.018;
  const flap = Math.sin(input.frameCount * cadence);
  const secondaryFlap = Math.sin(input.frameCount * cadence + Math.PI * 0.18);
  const ambientSpread = (0.07 + flap * 0.055) * motionScale;
  const selectedLeft = input.side === 'port' || input.side === 'left';
  const selectedRight = input.side === 'starboard' || input.side === 'right';
  const recoil = fireEnvelope * 0.12;
  const foldAngle = ramFold * 0.58;
  const blackoutBrace = blackoutAction ? warningEnvelope * 0.05 : 0;
  const hover = Math.sin(input.frameCount * 0.041) * 3.4 * motionScale;
  const pulse = (Math.sin(input.frameCount * 0.16) + 1) * 0.5;

  return {
    bodyBob: hover,
    bodyRotation: Math.sin(input.frameCount * 0.026) * 0.018 * motionScale,
    bodyScaleX: 1 + pulse * 0.012 + (input.charging ? 0.014 : 0),
    bodyScaleY: 1 - pulse * 0.008 + (input.charging ? 0.008 : 0),
    leftWingX: -36 + ramFold * 18 + (selectedLeft ? recoil * 34 : 0),
    rightWingX: 36 - ramFold * 18 - (selectedRight ? recoil * 34 : 0),
    leftWingY: -13 + secondaryFlap * 2.8 * motionScale + ramFold * 13,
    rightWingY: -13 - secondaryFlap * 2.8 * motionScale + ramFold * 13,
    leftWingRotation: -ambientSpread + foldAngle + blackoutBrace
      + (selectedLeft ? recoil : 0),
    rightWingRotation: ambientSpread - foldAngle - blackoutBrace
      - (selectedRight ? recoil : 0),
    leftWingScaleY: 1 - Math.abs(flap) * 0.035 * motionScale,
    rightWingScaleY: 1 - Math.abs(secondaryFlap) * 0.035 * motionScale,
    coreOpen: input.charging || blackoutAction || healthPressure > 0.68,
    corePulse: 0.96 + pulse * 0.06 + (input.charging ? 0.05 : 0),
    ramFold
  };
};
