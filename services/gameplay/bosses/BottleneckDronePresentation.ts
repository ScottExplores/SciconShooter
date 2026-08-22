export const BOTTLENECK_DRONE_BOSS_ID = 'bottleneck-drone';

export const BOTTLENECK_DRONE_FRAME_INDEX = Object.freeze({
  neutral: 0,
  idle: 1,
  charge: 2,
  fire: 3,
  recovery: 4
} as const);

export const BOTTLENECK_DRONE_CHARGE_FRAMES = 24;
export const BOTTLENECK_DRONE_FIRE_HOLD_FRAMES = 7;
export const BOTTLENECK_DRONE_RECOVERY_HOLD_FRAMES = 12;

export const isBottleneckDroneCharging = ({
  attackTimer,
  cadenceFrames
}: Readonly<{
  attackTimer: number;
  cadenceFrames: number;
}>) => {
  const cadence = Math.max(1, Math.floor(cadenceFrames));
  const timer = Math.max(0, Math.floor(attackTimer));
  const cycleFrame = timer % cadence;
  const chargeFrames = Math.min(BOTTLENECK_DRONE_CHARGE_FRAMES, Math.max(1, cadence - 1));
  return cycleFrame >= cadence - chargeFrames;
};

export const resolveBottleneckDroneFrameIndex = ({
  frameCount,
  lastFireFrame,
  isCharging,
  variant = 0
}: Readonly<{
  frameCount: number;
  lastFireFrame: number;
  isCharging: boolean;
  variant?: number;
}>) => {
  const framesSinceFire = Math.max(0, frameCount - lastFireFrame);
  if (lastFireFrame >= 0 && framesSinceFire < BOTTLENECK_DRONE_FIRE_HOLD_FRAMES) {
    return BOTTLENECK_DRONE_FRAME_INDEX.fire;
  }
  if (
    lastFireFrame >= 0
    && framesSinceFire < BOTTLENECK_DRONE_FIRE_HOLD_FRAMES + BOTTLENECK_DRONE_RECOVERY_HOLD_FRAMES
  ) {
    return BOTTLENECK_DRONE_FRAME_INDEX.recovery;
  }
  if (isCharging) return BOTTLENECK_DRONE_FRAME_INDEX.charge;

  const ambientFrame = Math.floor((Math.max(0, frameCount) + Math.max(0, variant) * 7) / 30) % 2;
  return ambientFrame === 0
    ? BOTTLENECK_DRONE_FRAME_INDEX.neutral
    : BOTTLENECK_DRONE_FRAME_INDEX.idle;
};
