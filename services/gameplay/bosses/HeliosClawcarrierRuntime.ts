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

export const HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE = 'machinegun-channel' as const;
export const HELIOS_MACHINE_GUN_CHANNEL_FIRST_SHOT_FRAME = 2;
export const HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_INTERVAL_FRAMES = 2;
export const HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_SWEEP_RANGE_RATIO = 0.34;
export const HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_SWEEP_PASSES = 1;
export const HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_UPPER_LANE_RATIO = 0.16;
export const HELIOS_MACHINE_GUN_CHANNEL_MOBILE_HORIZONTAL_PADDING = 4;
export const HELIOS_MACHINE_GUN_CHANNEL_DESKTOP_HORIZONTAL_PADDING = 24;
export const HELIOS_MACHINE_GUN_CHANNEL_MOBILE_TARGET_PADDING = 4;
export const HELIOS_MACHINE_GUN_CHANNEL_DESKTOP_TARGET_PADDING = 12;
export const HELIOS_MACHINE_GUN_CHANNEL_DESKTOP_TARGET_PADDING_RATIO = 0.31;
export const HELIOS_MACHINE_GUN_CHANNEL_FIRING_SIDES = Object.freeze([
  'port',
  'starboard'
] as const);

export type HeliosMachineGunChannelStage = 'warning' | 'fire' | 'recovery';

export interface HeliosMachineGunChannelMovementSample {
  readonly stage: HeliosMachineGunChannelStage;
  readonly progress: number;
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly endX: number;
  readonly upperLaneY: number;
  readonly passIndex: number;
  readonly direction: -1 | 1;
  readonly sweepProgress: number;
  readonly returnProgress: number;
  readonly firing: boolean;
}

export interface HeliosMachineGunChannelPulse extends HeliosCrossfirePulse {
  /** Both anatomy-owned rotaries fire together to maintain unbroken channel rails. */
  readonly firingSides: readonly HeliosClawSide[];
  readonly elapsedFrames: number;
  readonly durationFrames: number;
  readonly progress: number;
}

export interface HeliosMachineGunChannelTargets {
  readonly progress: number;
  readonly centerX: number;
  readonly portX: number;
  readonly starboardX: number;
  readonly channelWidthPixels: number;
}

export interface HeliosReactorFanShot {
  readonly shotIndex: number;
  readonly angleRadians: number;
  readonly firing: boolean;
}

export interface HeliosMineFormationSlot {
  readonly index: number;
  readonly templateId: HeliosMineFormationTemplateId;
  /** Normalized arena destination; the live core remains the launch origin. */
  readonly targetXRatio: number;
  readonly targetYRatio: number;
  readonly delayFrames: number;
  /** Per-slot cubic travel duration. Shorter durations deploy faster. */
  readonly deployFrames: number;
  /** Compatibility hint for older callers; arm-point geometry is authoritative. */
  readonly angleRadians: number;
  /** Compatibility ratio equal to the default deploy duration / deployFrames. */
  readonly speedScale: number;
}

export interface HeliosMineArmPoint {
  readonly x: number;
  readonly y: number;
  readonly angleRadians: number;
  readonly distance: number;
  readonly deployFrames: number;
}

export interface HeliosMineDeploymentSample {
  readonly progress: number;
  readonly easedProgress: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly complete: boolean;
}

export interface HeliosMineRuntimeSample {
  readonly armPoint: HeliosMineArmPoint;
  readonly deployment: HeliosMineDeploymentSample;
  readonly lifecycle: HeliosMineLifecycleSample;
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

export const HELIOS_MINE_FORMATION_TEMPLATE_IDS = Object.freeze([
  'staggered-diagonal',
  'reverse-diagonal',
  'zigzag',
  'shallow-arc',
  'offset-triangle',
  'asymmetric-cluster'
] as const);

export type HeliosMineFormationTemplateId = (
  typeof HELIOS_MINE_FORMATION_TEMPLATE_IDS
)[number];

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

const finiteOr = (value: number | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const clampFinite = (
  value: number,
  minimum: number,
  maximum: number,
  fallback: number
) => Math.max(minimum, Math.min(maximum, finiteOr(value, fallback)));

const lerp = (start: number, end: number, progress: number) => (
  start + (end - start) * progress
);

const hashStableSeedKey = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * Chooses a stable first sweep direction from the gameplay seed, then
 * alternates it on each later use. This keeps replays exact while preventing
 * every channel sentence from entering from the same side.
 */
export const resolveHeliosMachineGunChannelSequence = ({
  sequence = 0,
  useIndex = 0,
  seedKey
}: {
  sequence?: number;
  useIndex?: number;
  seedKey: string;
}) => {
  const normalizedSequence = Math.abs(Math.floor(finiteOr(sequence, 0)));
  const normalizedUseIndex = Math.max(0, Math.floor(finiteOr(useIndex, 0)));
  const desiredParity = (
    hashStableSeedKey(String(seedKey ?? 'helios-machinegun-channel'))
    + normalizedUseIndex
  ) % 2;
  return normalizedSequence + (
    (desiredParity - normalizedSequence % 2 + 2) % 2
  );
};

/**
 * Samples the complete signature movement without reading entity or wall-clock
 * state. The warning approaches one bounded edge, fire traverses one or more
 * smooth passes, and recovery returns to the captured combat anchor.
 */
export const sampleHeliosMachineGunChannelMovement = ({
  stage,
  progress,
  sequence,
  anchorX,
  anchorY,
  arenaWidth,
  arenaHeight,
  bossWidth,
  bossHeight,
  horizontalPadding = 24,
  sweepRangeRatio = HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_SWEEP_RANGE_RATIO,
  sweepPasses = HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_SWEEP_PASSES,
  upperLaneRatio = HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_UPPER_LANE_RATIO
}: {
  stage: HeliosMachineGunChannelStage;
  progress: number;
  sequence: number;
  anchorX: number;
  anchorY: number;
  arenaWidth: number;
  arenaHeight: number;
  bossWidth: number;
  bossHeight: number;
  horizontalPadding?: number;
  sweepRangeRatio?: number;
  sweepPasses?: number;
  upperLaneRatio?: number;
}): HeliosMachineGunChannelMovementSample => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const height = Math.max(1, finiteOr(arenaHeight, 1));
  const resolvedBossWidth = Math.max(1, Math.min(width, finiteOr(bossWidth, 1)));
  const resolvedBossHeight = Math.max(1, Math.min(height, finiteOr(bossHeight, 1)));
  const maximumHorizontalPadding = Math.max(0, (width - resolvedBossWidth) / 2);
  const padding = clampFinite(
    horizontalPadding,
    0,
    maximumHorizontalPadding,
    Math.min(24, maximumHorizontalPadding)
  );
  const safeMinX = padding;
  const safeMaxX = Math.max(safeMinX, width - resolvedBossWidth - padding);
  const availableRange = Math.max(0, safeMaxX - safeMinX);
  const rangeRatio = clampFinite(
    sweepRangeRatio,
    0.1,
    0.8,
    HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_SWEEP_RANGE_RATIO
  );
  const sweepRange = Math.min(availableRange, width * rangeRatio);
  const centeredX = Math.max(
    safeMinX,
    Math.min(safeMaxX, width / 2 - resolvedBossWidth / 2)
  );
  const leftX = Math.max(safeMinX, centeredX - sweepRange / 2);
  const rightX = Math.min(safeMaxX, centeredX + sweepRange / 2);
  const normalizedSequence = Math.abs(Math.floor(finiteOr(sequence, 0)));
  const initialDirection: -1 | 1 = normalizedSequence % 2 === 0 ? 1 : -1;
  const startX = initialDirection === 1 ? leftX : rightX;
  const endX = initialDirection === 1 ? rightX : leftX;
  const safeAnchorX = Math.max(safeMinX, Math.min(safeMaxX, finiteOr(anchorX, centeredX)));
  const maximumY = Math.max(0, height - resolvedBossHeight);
  const safeAnchorY = Math.max(0, Math.min(maximumY, finiteOr(anchorY, 0)));
  const laneRatio = clampFinite(
    upperLaneRatio,
    0.08,
    0.32,
    HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_UPPER_LANE_RATIO
  );
  const upperLaneY = Math.max(0, Math.min(maximumY, height * laneRatio));
  const passes = normalizeCount(sweepPasses, 1, 3);
  const t = clamp01(progress);
  const scaledSweep = t * passes;
  const passIndex = Math.min(
    passes - 1,
    Math.max(0, Math.floor(t >= 1 ? passes - 1 : scaledSweep))
  );
  const passProgress = t >= 1 ? 1 : scaledSweep - passIndex;
  const easedPassProgress = smoothstep(passProgress);
  const forwardPass = passIndex % 2 === 0;
  const passStartX = forwardPass ? startX : endX;
  const passEndX = forwardPass ? endX : startX;
  const direction = (initialDirection * (forwardPass ? 1 : -1)) as -1 | 1;
  const finalX = passes % 2 === 1 ? endX : startX;

  let x = safeAnchorX;
  let y = safeAnchorY;
  let returnProgress = 0;
  if (stage === 'warning') {
    const movementProgress = smoothstep(t);
    x = lerp(safeAnchorX, startX, movementProgress);
    y = lerp(safeAnchorY, upperLaneY, movementProgress);
  } else if (stage === 'fire') {
    x = lerp(passStartX, passEndX, easedPassProgress);
    y = upperLaneY;
  } else {
    returnProgress = smoothstep(t);
    x = lerp(finalX, safeAnchorX, returnProgress);
    y = lerp(upperLaneY, safeAnchorY, returnProgress);
  }

  return Object.freeze({
    stage,
    progress: t,
    x,
    y,
    startX,
    endX,
    upperLaneY,
    passIndex,
    direction,
    sweepProgress: stage === 'warning' ? 0 : stage === 'fire' ? t : 1,
    returnProgress,
    firing: stage === 'fire'
  });
};

export const resolveHeliosMachineGunChannelHorizontalPadding = (
  mobileProfile: boolean
) => mobileProfile
  ? HELIOS_MACHINE_GUN_CHANNEL_MOBILE_HORIZONTAL_PADDING
  : HELIOS_MACHINE_GUN_CHANNEL_DESKTOP_HORIZONTAL_PADDING;

export const resolveHeliosMachineGunChannelTargetPadding = (
  mobileProfile: boolean,
  arenaWidth = mobileProfile ? 390 : 1_280
) => mobileProfile
  ? HELIOS_MACHINE_GUN_CHANNEL_MOBILE_TARGET_PADDING
  : Math.max(
      HELIOS_MACHINE_GUN_CHANNEL_DESKTOP_TARGET_PADDING,
      finiteOr(arenaWidth, 1_280)
        * HELIOS_MACHINE_GUN_CHANNEL_DESKTOP_TARGET_PADDING_RATIO
    );

/**
 * Maps the boss's bounded horizontal sweep onto the playable target span.
 * Portrait mobile uses both exterior gutters; the wider desktop profile keeps
 * a centered span that a base-speed ship can follow without weakening mobile.
 */
export const resolveHeliosMachineGunChannelTargets = ({
  bossX,
  startX,
  endX,
  arenaWidth,
  channelWidthPixels,
  edgePadding = HELIOS_MACHINE_GUN_CHANNEL_MOBILE_TARGET_PADDING
}: {
  bossX: number;
  startX: number;
  endX: number;
  arenaWidth: number;
  channelWidthPixels: number;
  edgePadding?: number;
}): HeliosMachineGunChannelTargets => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const resolvedChannelWidth = clampFinite(
    channelWidthPixels,
    Math.min(1, width),
    width,
    Math.min(116, width)
  );
  const maximumPadding = Math.max(0, (width - resolvedChannelWidth) / 2);
  const padding = clampFinite(
    edgePadding,
    0,
    maximumPadding,
    Math.min(HELIOS_MACHINE_GUN_CHANNEL_MOBILE_TARGET_PADDING, maximumPadding)
  );
  const leftX = Math.min(finiteOr(startX, 0), finiteOr(endX, width));
  const rightX = Math.max(finiteOr(startX, 0), finiteOr(endX, width));
  const travel = rightX - leftX;
  const progress = travel <= 0.0001
    ? 0.5
    : clamp01((finiteOr(bossX, (leftX + rightX) / 2) - leftX) / travel);
  const minimumCenterX = padding + resolvedChannelWidth / 2;
  const maximumCenterX = width - padding - resolvedChannelWidth / 2;
  const centerX = lerp(minimumCenterX, maximumCenterX, progress);

  return Object.freeze({
    progress,
    centerX,
    portX: centerX - resolvedChannelWidth / 2,
    starboardX: centerX + resolvedChannelWidth / 2,
    channelWidthPixels: resolvedChannelWidth
  });
};

/**
 * Samples a sustained two-gun stream for one simulation frame. It has no
 * round-count ceiling: the authored fire window owns the bounded duration.
 * The lead side alternates for deterministic presentation timing, while both
 * anatomy-owned rotaries fire together on each cadence slot so the player
 * cannot thread through timing holes outside the intended channel.
 */
export const sampleHeliosMachineGunChannelPulse = ({
  elapsedFrames,
  durationFrames,
  sequence = 0,
  intervalFrames = HELIOS_MACHINE_GUN_CHANNEL_DEFAULT_INTERVAL_FRAMES
}: {
  elapsedFrames: number;
  durationFrames: number;
  sequence?: number;
  intervalFrames?: number;
}): HeliosMachineGunChannelPulse | undefined => {
  const elapsed = Math.floor(finiteOr(elapsedFrames, -1));
  const duration = normalizeCount(durationFrames, 1, 3_600);
  if (elapsed < 0 || elapsed >= duration) return undefined;
  const relativeFrame = elapsed - HELIOS_MACHINE_GUN_CHANNEL_FIRST_SHOT_FRAME;
  if (relativeFrame < 0) return undefined;
  const cadence = normalizeCount(intervalFrames, 2, 12);
  const shotIndex = Math.floor(relativeFrame / cadence);
  const withinSlot = relativeFrame % cadence;
  const firstSide: HeliosClawSide = (
    Math.abs(Math.floor(finiteOr(sequence, 0))) % 2 === 0 ? 'port' : 'starboard'
  );
  const side = shotIndex % 2 === 0
    ? firstSide
    : firstSide === 'port' ? 'starboard' : 'port';
  const energy = withinSlot === 0 ? 1 : withinSlot === 1 ? 0.42 : 0;
  return Object.freeze({
    shotIndex,
    side,
    sideShotIndex: Math.floor(shotIndex / 2),
    firingSides: HELIOS_MACHINE_GUN_CHANNEL_FIRING_SIDES,
    firing: withinSlot === 0,
    flashEnergy: energy,
    recoilEnergy: energy,
    elapsedFrames: elapsed,
    durationFrames: duration,
    progress: clamp01((elapsed + 1) / duration)
  });
};

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

interface HeliosMineTemplateSlot {
  readonly targetXRatio: number;
  readonly targetYRatio: number;
  readonly delayFrames: number;
  readonly deployFrames: number;
}

const freezeMineTemplateSlots = (
  slots: readonly HeliosMineTemplateSlot[]
) => Object.freeze(slots.map((slot) => Object.freeze({ ...slot })));

const HELIOS_MINE_FORMATION_TEMPLATES: Readonly<Record<
  HeliosMineFormationTemplateId,
  readonly HeliosMineTemplateSlot[]
>> = Object.freeze({
  'staggered-diagonal': freezeMineTemplateSlots([
    { targetXRatio: 0.22, targetYRatio: 0.48, delayFrames: 0, deployFrames: 38 },
    { targetXRatio: 0.41, targetYRatio: 0.58, delayFrames: 10, deployFrames: 44 },
    { targetXRatio: 0.62, targetYRatio: 0.68, delayFrames: 23, deployFrames: 48 },
    { targetXRatio: 0.81, targetYRatio: 0.76, delayFrames: 35, deployFrames: 41 }
  ]),
  'reverse-diagonal': freezeMineTemplateSlots([
    { targetXRatio: 0.78, targetYRatio: 0.48, delayFrames: 0, deployFrames: 40 },
    { targetXRatio: 0.59, targetYRatio: 0.59, delayFrames: 13, deployFrames: 46 },
    { targetXRatio: 0.38, targetYRatio: 0.69, delayFrames: 24, deployFrames: 42 },
    { targetXRatio: 0.19, targetYRatio: 0.77, delayFrames: 38, deployFrames: 48 }
  ]),
  zigzag: freezeMineTemplateSlots([
    { targetXRatio: 0.20, targetYRatio: 0.62, delayFrames: 0, deployFrames: 36 },
    { targetXRatio: 0.43, targetYRatio: 0.48, delayFrames: 9, deployFrames: 45 },
    { targetXRatio: 0.64, targetYRatio: 0.71, delayFrames: 21, deployFrames: 40 },
    { targetXRatio: 0.82, targetYRatio: 0.55, delayFrames: 33, deployFrames: 47 }
  ]),
  'shallow-arc': freezeMineTemplateSlots([
    { targetXRatio: 0.18, targetYRatio: 0.66, delayFrames: 0, deployFrames: 43 },
    { targetXRatio: 0.39, targetYRatio: 0.55, delayFrames: 12, deployFrames: 38 },
    { targetXRatio: 0.62, targetYRatio: 0.53, delayFrames: 25, deployFrames: 46 },
    { targetXRatio: 0.82, targetYRatio: 0.65, delayFrames: 36, deployFrames: 41 }
  ]),
  'offset-triangle': freezeMineTemplateSlots([
    { targetXRatio: 0.49, targetYRatio: 0.47, delayFrames: 0, deployFrames: 37 },
    { targetXRatio: 0.24, targetYRatio: 0.66, delayFrames: 11, deployFrames: 46 },
    { targetXRatio: 0.76, targetYRatio: 0.70, delayFrames: 23, deployFrames: 40 },
    { targetXRatio: 0.57, targetYRatio: 0.79, delayFrames: 34, deployFrames: 48 }
  ]),
  'asymmetric-cluster': freezeMineTemplateSlots([
    { targetXRatio: 0.19, targetYRatio: 0.52, delayFrames: 0, deployFrames: 45 },
    { targetXRatio: 0.48, targetYRatio: 0.74, delayFrames: 14, deployFrames: 39 },
    { targetXRatio: 0.81, targetYRatio: 0.49, delayFrames: 25, deployFrames: 47 },
    { targetXRatio: 0.64, targetYRatio: 0.61, delayFrames: 37, deployFrames: 42 }
  ])
});

export const resolveHeliosMineFormationTemplateId = (
  sequence: number
): HeliosMineFormationTemplateId => {
  const normalizedSequence = Math.abs(Math.floor(finiteOr(sequence, 0)));
  return HELIOS_MINE_FORMATION_TEMPLATE_IDS[
    normalizedSequence % HELIOS_MINE_FORMATION_TEMPLATE_IDS.length
  ];
};

export const resolveHeliosMineFormationSequence = ({
  sequence,
  seedKey
}: {
  sequence: number;
  seedKey: string;
}) => (
  Math.max(0, Math.floor(finiteOr(sequence, 0)))
  + hashStableSeedKey(String(seedKey ?? ''))
    % HELIOS_MINE_FORMATION_TEMPLATE_IDS.length
);

/**
 * Bounded deterministic templates vary both arena axes, launch delay, and
 * cubic deployment duration. `sequence` is the caller's stable seeded branch.
 */
export const resolveHeliosMineFormation = ({
  sequence,
  count
}: {
  sequence: number;
  count: number;
}): readonly HeliosMineFormationSlot[] => {
  const slotCount = normalizeCount(count, 2, 4);
  const templateId = resolveHeliosMineFormationTemplateId(sequence);
  const slots = HELIOS_MINE_FORMATION_TEMPLATES[templateId].slice(0, slotCount);
  return Object.freeze(slots.map((slot, index) => {
    const rawAngle = Math.atan2(
      slot.targetYRatio - 0.18,
      slot.targetXRatio - 0.5
    );
    const angleRadians = Math.max(
      Math.PI / 2 - 0.48,
      Math.min(Math.PI / 2 + 0.48, rawAngle)
    );
    return Object.freeze({
      index,
      templateId,
      targetXRatio: slot.targetXRatio,
      targetYRatio: slot.targetYRatio,
      delayFrames: slot.delayFrames,
      deployFrames: slot.deployFrames,
      angleRadians,
      speedScale: HELIOS_MINE_DEPLOY_FRAMES / slot.deployFrames
    });
  }));
};

/** Resolves the exact clamped arena point shared by gameplay and proof. */
export const resolveHeliosMineArmPoint = ({
  slot,
  arenaWidth,
  arenaHeight,
  originX,
  originY,
  mineSize = 30,
  edgePadding = 12,
  topPadding = 48,
  bottomPadding = 18,
  minimumForwardTravel = 96
}: {
  slot: Readonly<HeliosMineFormationSlot>;
  arenaWidth: number;
  arenaHeight: number;
  originX: number;
  originY: number;
  mineSize?: number;
  edgePadding?: number;
  topPadding?: number;
  bottomPadding?: number;
  minimumForwardTravel?: number;
}): HeliosMineArmPoint => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const height = Math.max(1, finiteOr(arenaHeight, 1));
  const startX = Math.max(0, Math.min(width, finiteOr(originX, width / 2)));
  const startY = Math.max(0, Math.min(height, finiteOr(originY, 0)));
  const halfSize = Math.max(0.5, finiteOr(mineSize, 30) / 2);
  const horizontalInset = Math.min(
    width / 2,
    halfSize + Math.max(0, finiteOr(edgePadding, 12))
  );
  const safeMinX = horizontalInset;
  const safeMaxX = Math.max(safeMinX, width - horizontalInset);
  const safeBottomY = Math.max(
    0,
    height - halfSize - Math.max(0, finiteOr(bottomPadding, 18))
  );
  const requestedMinY = Math.max(
    halfSize + Math.max(0, finiteOr(topPadding, 48)),
    startY + Math.max(0, finiteOr(minimumForwardTravel, 96))
  );
  const safeMinY = Math.min(safeBottomY, requestedMinY);
  const x = Math.max(safeMinX, Math.min(safeMaxX, width * slot.targetXRatio));
  const y = Math.max(safeMinY, Math.min(safeBottomY, height * slot.targetYRatio));
  const deltaX = x - startX;
  const deltaY = y - startY;
  return Object.freeze({
    x,
    y,
    angleRadians: Math.atan2(deltaY, deltaX),
    distance: Math.hypot(deltaX, deltaY),
    deployFrames: normalizeCount(slot.deployFrames, 1, 180)
  });
};

/**
 * Samples the exact ease-out cubic used by the live mine deployment. Velocity
 * is the current center minus the preceding frame's sampled center.
 */
export const sampleHeliosMineDeployment = ({
  ageFrames,
  deployFrames,
  startX,
  startY,
  armX,
  armY
}: {
  ageFrames: number;
  deployFrames?: number;
  startX: number;
  startY: number;
  armX: number;
  armY: number;
}): HeliosMineDeploymentSample => {
  const duration = normalizeCount(deployFrames ?? HELIOS_MINE_DEPLOY_FRAMES, 1, 180);
  const age = Math.max(0, Math.floor(finiteOr(ageFrames, 0)));
  const progress = clamp01(age / duration);
  const previousProgress = clamp01(Math.max(0, age - 1) / duration);
  const easedProgress = 1 - Math.pow(1 - progress, 3);
  const previousEasedProgress = 1 - Math.pow(1 - previousProgress, 3);
  const resolvedStartX = finiteOr(startX, 0);
  const resolvedStartY = finiteOr(startY, 0);
  const resolvedArmX = finiteOr(armX, resolvedStartX);
  const resolvedArmY = finiteOr(armY, resolvedStartY);
  const centerX = lerp(resolvedStartX, resolvedArmX, easedProgress);
  const centerY = lerp(resolvedStartY, resolvedArmY, easedProgress);
  const previousCenterX = lerp(resolvedStartX, resolvedArmX, previousEasedProgress);
  const previousCenterY = lerp(resolvedStartY, resolvedArmY, previousEasedProgress);
  return Object.freeze({
    progress,
    easedProgress,
    centerX,
    centerY,
    velocityX: centerX - previousCenterX,
    velocityY: centerY - previousCenterY,
    complete: age >= duration
  });
};

export const sampleHeliosMineLifecycle = ({
  ageFrames,
  triggerFrame,
  distanceToPlayer,
  deployFrames = HELIOS_MINE_DEPLOY_FRAMES,
  autoTriggerFrames = 168,
  proximityRadius = 72
}: {
  ageFrames: number;
  triggerFrame: number;
  distanceToPlayer: number;
  deployFrames?: number;
  autoTriggerFrames?: number;
  proximityRadius?: number;
}): HeliosMineLifecycleSample => {
  const age = Math.max(0, Math.floor(finiteOr(ageFrames, 0)));
  const deploymentDuration = normalizeCount(deployFrames, 1, 180);
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
  if (age < deploymentDuration) {
    return Object.freeze({
      stage: 'deploying',
      frameIndex: Math.min(2, Math.floor(age / Math.max(1, deploymentDuration / 3))),
      damageActive: false,
      shouldTrigger: false,
      shouldCleanup: false
    });
  }
  const triggerRadius = Math.max(1, finiteOr(proximityRadius, 72));
  const automaticTriggerAge = Math.max(
    deploymentDuration,
    normalizeCount(autoTriggerFrames, 1, 3_600)
  );
  const proximityTrigger = Number.isFinite(distanceToPlayer)
    && distanceToPlayer <= triggerRadius;
  return Object.freeze({
    stage: 'armed',
    frameIndex: 3,
    damageActive: false,
    shouldTrigger: proximityTrigger || age >= automaticTriggerAge,
    shouldCleanup: false
  });
};

/** One shared mine sample for engine playback and constructive route proof. */
export const sampleHeliosMineRuntime = ({
  slot,
  ageFrames,
  triggerFrame,
  distanceToPlayer,
  arenaWidth,
  arenaHeight,
  originX,
  originY,
  mineSize,
  edgePadding,
  topPadding,
  bottomPadding,
  minimumForwardTravel,
  autoTriggerFrames,
  proximityRadius
}: {
  slot: Readonly<HeliosMineFormationSlot>;
  ageFrames: number;
  triggerFrame: number;
  distanceToPlayer: number;
  arenaWidth: number;
  arenaHeight: number;
  originX: number;
  originY: number;
  mineSize?: number;
  edgePadding?: number;
  topPadding?: number;
  bottomPadding?: number;
  minimumForwardTravel?: number;
  autoTriggerFrames?: number;
  proximityRadius?: number;
}): HeliosMineRuntimeSample => {
  const armPoint = resolveHeliosMineArmPoint({
    slot,
    arenaWidth,
    arenaHeight,
    originX,
    originY,
    mineSize,
    edgePadding,
    topPadding,
    bottomPadding,
    minimumForwardTravel
  });
  const deployment = sampleHeliosMineDeployment({
    ageFrames,
    deployFrames: armPoint.deployFrames,
    startX: originX,
    startY: originY,
    armX: armPoint.x,
    armY: armPoint.y
  });
  const lifecycle = sampleHeliosMineLifecycle({
    ageFrames,
    triggerFrame,
    distanceToPlayer,
    deployFrames: armPoint.deployFrames,
    autoTriggerFrames,
    proximityRadius
  });
  return Object.freeze({ armPoint, deployment, lifecycle });
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

/**
 * The moving channel keeps both streams near six o'clock and only permits an
 * outward bias, so the safe opening can widen gently but can never cross shut.
 */
export const resolveHeliosMachineGunChannelAngle = (
  side: HeliosClawSide,
  outwardOffsetRadians = 0.04
) => {
  const outwardOffset = clampFinite(outwardOffsetRadians, 0, 0.2, 0.04);
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
