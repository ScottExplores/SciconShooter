export type HeliosClawSide = 'port' | 'starboard';

export type HeliosMineStage =
  | 'deploying'
  | 'armed'
  | 'exploding'
  | 'expired';

export interface HeliosCrossfirePulse {
  readonly shotIndex: number;
  readonly side: HeliosClawSide;
  readonly sideShotIndex: number;
  readonly firing: boolean;
  readonly flashEnergy: number;
  readonly recoilEnergy: number;
}

export interface HeliosReactorFanShot {
  readonly shotIndex: number;
  readonly angleRadians: number;
  readonly firing: boolean;
}

export interface HeliosMineFormationSlot {
  readonly index: number;
  readonly delayFrames: number;
  readonly angleRadians: number;
  readonly speedScale: number;
}

export interface HeliosMineLifecycleSample {
  readonly stage: HeliosMineStage;
  readonly frameIndex: number;
  readonly damageActive: boolean;
  readonly shouldTrigger: boolean;
  readonly shouldCleanup: boolean;
}

export const HELIOS_MINE_DEPLOY_FRAMES = 42;
export const HELIOS_MINE_EXPLOSION_FRAMES = 42;

export interface HeliosClampPlan {
  readonly activeSide?: HeliosClawSide;
  readonly fallbackToCrossfire: boolean;
  readonly skipped: boolean;
}

export interface HeliosCornerClampSample extends HeliosMeleeSample {
  readonly movementProgress: number;
  readonly trackingActive: boolean;
  readonly lockActive: boolean;
  readonly returnProgress: number;
}

export interface HeliosCornerClampPlacement {
  /** Empty screen gutter reserved for the articulated claw outside the hull AABB. */
  readonly visualPadding: number;
  /** Boss entity top-left at the authored lower-corner hold. */
  readonly cornerX: number;
  readonly cornerY: number;
  /** Side-specific top-left tracking lane that keeps the complete rig on screen. */
  readonly trackingMinX: number;
  readonly trackingMaxX: number;
}

export type HeliosPincerStage =
  | 'rise-open'
  | 'track-lock'
  | 'dive-close'
  | 'hold-release-return';

export interface HeliosMeleeSample {
  readonly progress: number;
  readonly portEnergy: number;
  readonly starboardEnergy: number;
  readonly closeEnergy: number;
  readonly damageActive: boolean;
}

export interface HeliosPincerSample extends HeliosMeleeSample {
  readonly stage: HeliosPincerStage;
  readonly diveProgress: number;
  readonly returnProgress: number;
  readonly trackingActive: boolean;
  readonly lockActive: boolean;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number(value) || 0));

const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const pulse = (progress: number, start: number, peak: number, end: number) => {
  const t = clamp01(progress);
  if (t <= start || t >= end) return 0;
  if (t < peak) return smoothstep((t - start) / Math.max(0.0001, peak - start));
  return 1 - smoothstep((t - peak) / Math.max(0.0001, end - peak));
};

const normalizeCount = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || minimum)))
);

/**
 * Resolves one real rotary shot for one simulation frame. A two-cannon burst
 * alternates its live mounts instead of materializing every round at once.
 */
export const sampleHeliosCrossfirePulse = ({
  elapsedFrames,
  roundsPerSide,
  sides,
  intervalFrames = 4
}: {
  elapsedFrames: number;
  roundsPerSide: number;
  sides: readonly HeliosClawSide[];
  intervalFrames?: number;
}): HeliosCrossfirePulse | undefined => {
  const orderedSides = sides.length > 0 ? sides : ['port', 'starboard'] as const;
  const cadence = normalizeCount(intervalFrames, 2, 12);
  const firstShotFrame = 2;
  const elapsed = Math.max(0, Math.floor(Number(elapsedFrames) || 0));
  const relativeFrame = elapsed - firstShotFrame;
  if (relativeFrame < 0) return undefined;
  const slot = Math.floor(relativeFrame / cadence);
  const withinSlot = relativeFrame % cadence;
  const totalShots = normalizeCount(roundsPerSide, 1, 12) * orderedSides.length;
  if (slot >= totalShots) return undefined;
  const side = orderedSides[slot % orderedSides.length];
  const energy = withinSlot === 0 ? 1 : withinSlot === 1 ? 0.42 : 0;
  return Object.freeze({
    shotIndex: slot,
    side,
    sideShotIndex: Math.floor(slot / orderedSides.length),
    firing: withinSlot === 0,
    flashEnergy: energy,
    recoilEnergy: energy
  });
};

/**
 * Down-screen fan bounded to the visible 8-through-4-o'clock envelope. The
 * target angle biases the center but can never rotate the fan above the boss.
 */
export const buildHeliosReactorFanAngles = ({
  sequence,
  projectileCount,
  targetAngleRadians = Math.PI / 2
}: {
  sequence: number;
  projectileCount: number;
  targetAngleRadians?: number;
}) => {
  const count = normalizeCount(projectileCount, 5, 11);
  const minimumAngle = Math.PI / 6;
  const maximumAngle = Math.PI * 5 / 6;
  const normalizedSequence = Math.abs(Math.floor(Number(sequence) || 0));
  const orderMode = normalizedSequence % 3;
  const widthMode = Math.floor(normalizedSequence / 3) % 3;
  const halfSpan = widthMode === 0
    ? Math.PI / 3
    : widthMode === 1
      ? Math.PI * 0.28
      : Math.PI * 0.24;
  const center = Math.max(
    minimumAngle + halfSpan,
    Math.min(maximumAngle - halfSpan, Number(targetAngleRadians) || Math.PI / 2)
  );
  const ascending = Array.from({ length: count }, (_, index) => {
    const ratio = count <= 1 ? 0.5 : index / (count - 1);
    return center - halfSpan + ratio * halfSpan * 2;
  });
  if (orderMode === 1) return Object.freeze([...ascending].reverse());
  if (orderMode === 2) {
    const middle = Math.floor(ascending.length / 2);
    const ordered: number[] = [];
    for (let offset = 0; offset <= middle; offset += 1) {
      const right = middle + offset;
      const left = middle - offset;
      if (right < ascending.length) ordered.push(ascending[right]);
      if (offset > 0 && left >= 0) ordered.push(ascending[left]);
    }
    return Object.freeze(ordered);
  }
  return Object.freeze(ascending);
};

export const sampleHeliosReactorFanShot = ({
  elapsedFrames,
  sequence,
  projectileCount,
  targetAngleRadians,
  intervalFrames = 5
}: {
  elapsedFrames: number;
  sequence: number;
  projectileCount: number;
  targetAngleRadians?: number;
  intervalFrames?: number;
}): HeliosReactorFanShot | undefined => {
  const cadence = normalizeCount(intervalFrames, 3, 10);
  const relativeFrame = Math.max(0, Math.floor(Number(elapsedFrames) || 0)) - 2;
  if (relativeFrame < 0) return undefined;
  const angles = buildHeliosReactorFanAngles({
    sequence,
    projectileCount,
    targetAngleRadians
  });
  const shotIndex = Math.floor(relativeFrame / cadence);
  if (shotIndex >= angles.length) return undefined;
  return Object.freeze({
    shotIndex,
    angleRadians: angles[shotIndex],
    firing: relativeFrame % cadence === 0
  });
};

/** Bounded, deterministic mine lanes authored as a formation rather than RNG. */
export const resolveHeliosMineFormation = ({
  sequence,
  count
}: {
  sequence: number;
  count: number;
}): readonly HeliosMineFormationSlot[] => {
  const slotCount = normalizeCount(count, 2, 4);
  const route = Math.abs(Math.floor(Number(sequence) || 0)) % 2;
  const spread = slotCount === 2
    ? [-0.34, 0.34]
    : slotCount === 3
      ? [-0.42, 0, 0.42]
      : [-0.48, -0.16, 0.16, 0.48];
  const ordered = route === 0 ? spread : [...spread].reverse();
  return Object.freeze(ordered.map((offset, index) => Object.freeze({
    index,
    delayFrames: index * 12,
    angleRadians: Math.PI / 2 + offset,
    speedScale: 0.9 + ((index + route) % 3) * 0.08
  })));
};

export const sampleHeliosMineLifecycle = ({
  ageFrames,
  triggerFrame,
  distanceToPlayer,
  deployFrames = HELIOS_MINE_DEPLOY_FRAMES,
  autoTriggerFrames = 168
}: {
  ageFrames: number;
  triggerFrame: number;
  distanceToPlayer: number;
  deployFrames?: number;
  autoTriggerFrames?: number;
}): HeliosMineLifecycleSample => {
  const age = Math.max(0, Math.floor(Number(ageFrames) || 0));
  const triggeredAt = Math.floor(Number(triggerFrame));
  if (Number.isFinite(triggeredAt) && triggeredAt >= 0) {
    const explosionAge = Math.max(0, age - triggeredAt);
    const shouldCleanup = explosionAge >= HELIOS_MINE_EXPLOSION_FRAMES;
    return Object.freeze({
      stage: shouldCleanup ? 'expired' : 'exploding',
      frameIndex: Math.min(6, Math.floor(explosionAge / 3)),
      damageActive: explosionAge >= 6 && explosionAge <= 15,
      shouldTrigger: false,
      shouldCleanup
    });
  }
  if (age < deployFrames) {
    return Object.freeze({
      stage: 'deploying',
      frameIndex: Math.min(2, Math.floor(age / Math.max(1, deployFrames / 3))),
      damageActive: false,
      shouldTrigger: false,
      shouldCleanup: false
    });
  }
  const proximityTrigger = Number.isFinite(distanceToPlayer) && distanceToPlayer <= 72;
  return Object.freeze({
    stage: 'armed',
    frameIndex: 3,
    damageActive: false,
    shouldTrigger: proximityTrigger || age >= autoTriggerFrames,
    shouldCleanup: false
  });
};

export const resolveHeliosClampPlan = ({
  requestedSide,
  portOperational,
  starboardOperational
}: {
  requestedSide: HeliosClawSide;
  portOperational: boolean;
  starboardOperational: boolean;
}): HeliosClampPlan => {
  if (!portOperational && !starboardOperational) {
    return Object.freeze({ fallbackToCrossfire: true, skipped: false });
  }
  if (requestedSide === 'port' && portOperational) {
    return Object.freeze({ activeSide: 'port', fallbackToCrossfire: false, skipped: false });
  }
  if (requestedSide === 'starboard' && starboardOperational) {
    return Object.freeze({ activeSide: 'starboard', fallbackToCrossfire: false, skipped: false });
  }
  // An anatomy-dependent beat cannot be silently reassigned to the other
  // limb. Doing so would make the surviving claw perform both corner clamps.
  // The matching surviving-side beat remains in the authored sequence.
  return Object.freeze({ fallbackToCrossfire: false, skipped: true });
};

/**
 * Resolves Attack 2 in entity top-left coordinates. The side split is based on
 * the boss center, not the boss's top-left: using the viewport midpoint as a
 * starboard top-left minimum pushes a wide mobile boss outside the canvas.
 */
export const resolveHeliosCornerClampPlacement = ({
  side,
  viewportWidth,
  viewportHeight,
  bossWidth,
  bossHeight,
  mobileProfile
}: {
  side: HeliosClawSide;
  viewportWidth: number;
  viewportHeight: number;
  bossWidth: number;
  bossHeight: number;
  mobileProfile: boolean;
}): HeliosCornerClampPlacement => {
  const width = Math.max(1, Number(viewportWidth) || 1);
  const height = Math.max(1, Number(viewportHeight) || 1);
  const resolvedBossWidth = Math.max(1, Math.min(width, Number(bossWidth) || 1));
  const resolvedBossHeight = Math.max(1, Math.min(height, Number(bossHeight) || 1));
  const requestedPadding = mobileProfile ? 44 : 56;
  const visualPadding = Math.min(
    requestedPadding,
    Math.max(0, (width - resolvedBossWidth) / 2)
  );
  const safeMinX = visualPadding;
  const safeMaxX = Math.max(safeMinX, width - resolvedBossWidth - visualPadding);
  const centeredTopLeftX = Math.max(
    safeMinX,
    Math.min(safeMaxX, width / 2 - resolvedBossWidth / 2)
  );
  const desiredY = height * (mobileProfile ? 0.48 : 0.46);
  const safeMaxY = Math.max(0, height - resolvedBossHeight);
  const lowerLaneMinY = Math.min(safeMaxY, Math.max(56, height * 0.38));
  const lowerLaneMaxY = Math.max(
    lowerLaneMinY,
    Math.min(safeMaxY, height - resolvedBossHeight - height * 0.18)
  );

  return Object.freeze({
    visualPadding,
    cornerX: side === 'port' ? safeMinX : safeMaxX,
    cornerY: Math.max(lowerLaneMinY, Math.min(lowerLaneMaxY, desiredY)),
    trackingMinX: side === 'port' ? safeMinX : centeredTopLeftX,
    trackingMaxX: side === 'port' ? centeredTopLeftX : safeMaxX
  });
};

export const sampleHeliosCornerClamp = ({
  stage,
  progress,
  side
}: {
  stage: 'warning' | 'fire';
  progress: number;
  side: HeliosClawSide;
}): HeliosCornerClampSample => {
  const t = clamp01(progress);
  if (stage === 'warning') {
    const open = smoothstep(t / 0.55);
    return Object.freeze({
      progress: t,
      portEnergy: side === 'port' ? open : 0,
      starboardEnergy: side === 'starboard' ? open : 0,
      closeEnergy: 0,
      movementProgress: smoothstep(t / 0.62),
      trackingActive: t >= 0.42 && t < 0.76,
      lockActive: t >= 0.76,
      returnProgress: 0,
      damageActive: false
    });
  }
  const close = pulse(t, 0.08, 0.4, 0.72);
  return Object.freeze({
    progress: t,
    portEnergy: side === 'port' ? Math.max(0.18, close) : 0,
    starboardEnergy: side === 'starboard' ? Math.max(0.18, close) : 0,
    closeEnergy: close,
    movementProgress: 1,
    trackingActive: false,
    lockActive: t < 0.68,
    returnProgress: smoothstep((t - 0.66) / 0.34),
    damageActive: t >= 0.28 && t <= 0.56
  });
};

/**
 * One pure claw-sweep sampler shared by pose, moving hit regions, and tests.
 * The damaging window is deliberately narrower than the visible strike.
 */
export const sampleHeliosClawSweep = ({
  progress,
  side
}: {
  progress: number;
  side?: HeliosClawSide;
}): HeliosMeleeSample => {
  const t = clamp01(progress);
  const strikeEnergy = pulse(t, 0.08, 0.48, 0.94);
  const portEnergy = side === 'starboard' ? 0 : strikeEnergy;
  const starboardEnergy = side === 'port' ? 0 : strikeEnergy;
  return Object.freeze({
    progress: t,
    portEnergy,
    starboardEnergy,
    closeEnergy: strikeEnergy,
    damageActive: t >= 0.36 && t <= 0.68
  });
};

/**
 * The signature repeats one typed clip four times. Each execution is one
 * authored stage, which keeps the timeline bounded while preserving a single
 * rise → track → dive → hold/release/return mechanic.
 */
export const sampleHeliosTrackingPincer = ({
  sequence,
  progress
}: {
  sequence: number;
  progress: number;
}): HeliosPincerSample => {
  const stageIndex = Math.abs(Math.floor(Number(sequence) || 0)) % 4;
  const t = clamp01(progress);
  if (stageIndex === 0) {
    const open = smoothstep(t);
    return Object.freeze({
      stage: 'rise-open',
      progress: t,
      portEnergy: open,
      starboardEnergy: open,
      closeEnergy: 0,
      diveProgress: 0,
      returnProgress: 0,
      trackingActive: false,
      lockActive: false,
      damageActive: false
    });
  }
  if (stageIndex === 1) {
    return Object.freeze({
      stage: 'track-lock',
      progress: t,
      portEnergy: 1,
      starboardEnergy: 1,
      closeEnergy: 0,
      diveProgress: 0,
      returnProgress: 0,
      trackingActive: t < 0.72,
      lockActive: t >= 0.72,
      damageActive: false
    });
  }
  if (stageIndex === 2) {
    const close = smoothstep((t - 0.42) / 0.34);
    return Object.freeze({
      stage: 'dive-close',
      progress: t,
      portEnergy: 1,
      starboardEnergy: 1,
      closeEnergy: close,
      diveProgress: smoothstep(t),
      returnProgress: 0,
      trackingActive: false,
      lockActive: true,
      damageActive: t >= 0.58 && t <= 0.96
    });
  }
  const release = 1 - smoothstep((t - 0.28) / 0.32);
  return Object.freeze({
    stage: 'hold-release-return',
    progress: t,
    portEnergy: Math.max(0, release),
    starboardEnergy: Math.max(0, release),
    closeEnergy: Math.max(0, release),
    diveProgress: 1,
    returnProgress: smoothstep((t - 0.36) / 0.64),
    trackingActive: false,
    lockActive: true,
    damageActive: t <= 0.24
  });
};

/** Deterministic cannon rhythm used by the engine and the pose sampler. */
export const resolveHeliosCrossfireSides = (
  side: HeliosClawSide | undefined
): readonly HeliosClawSide[] => Object.freeze(
  side ? [side] : ['port', 'starboard']
);

/**
 * Each rotary owns a fixed diagonal firing lane. The coordinated volley widens
 * those diagonals to preserve a visible center corridor, so the sentence is a
 * learnable port/starboard puzzle rather than silent homing math.
 */
export const resolveHeliosCrossfireAngle = (
  side: HeliosClawSide,
  coordinated: boolean
) => {
  const outwardOffset = coordinated ? 0.3 : 0.08;
  return Math.PI / 2 + (side === 'port' ? outwardOffset : -outwardOffset);
};

/** Reactor pulses alternate their safe opening and introduce mines on the fourth beat. */
export const resolveHeliosReactorPulse = ({
  sequence,
  phaseIndex
}: {
  sequence: number;
  phaseIndex: number;
}) => {
  const normalizedSequence = Math.max(0, Math.floor(Number(sequence) || 0));
  const normalizedPhase = Math.max(1, Math.floor(Number(phaseIndex) || 1));
  return Object.freeze({
    gapStep: normalizedSequence % 6,
    deployMines: normalizedSequence % 4 === 3,
    damagedRemix: normalizedPhase >= 3,
    direction: (normalizedSequence + normalizedPhase) % 2 === 0
      ? 'clockwise' as const
      : 'counterclockwise' as const
  });
};
