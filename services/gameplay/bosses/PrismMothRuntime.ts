export const PRISM_MOTH_ACTION_IDS = Object.freeze([
  'wingbeat-weave',
  'brood-procession',
  'lunar-prism-swoop',
  'kaleidoscope-brood'
] as const);

export type PrismMothActionId = (typeof PRISM_MOTH_ACTION_IDS)[number];

/** One coarse renderer cue per action; detailed poses remain stage-driven. */
export const PRISM_MOTH_ACTION_MOTION_CUES = Object.freeze({
  'wingbeat-weave': 'prism-wingbeat',
  'brood-procession': 'prism-brood-deploy',
  'lunar-prism-swoop': 'prism-swoop',
  'kaleidoscope-brood': 'prism-kaleidoscope'
} as const);

export type PrismMothMotionCue = (
  typeof PRISM_MOTH_ACTION_MOTION_CUES
)[PrismMothActionId];

export const PRISM_MOTH_RUNTIME_SOCKET_IDS = Object.freeze([
  'wing-edge-left',
  'wing-edge-right',
  'wing-tip-left',
  'wing-tip-right',
  'brood-release-left',
  'brood-release-right',
  'prism-core'
] as const);

export type PrismMothRuntimeSocketId = (
  typeof PRISM_MOTH_RUNTIME_SOCKET_IDS
)[number];
export type PrismMothEmitterRole = 'feather' | 'trail' | 'brood' | 'core';

export const PRISM_MOTH_COCOON_FRAME_IDS = Object.freeze([
  'cocoon.lifecycle.0',
  'cocoon.lifecycle.1',
  'cocoon.lifecycle.2',
  'cocoon.lifecycle.3'
] as const);

export const PRISM_MOTH_BROODLING_FRAME_IDS = Object.freeze([
  'broodling.flutter.0',
  'broodling.flutter.1',
  'broodling.flutter.2',
  'broodling.flutter.3'
] as const);

export type PrismMothBroodVisualFrameId =
  | (typeof PRISM_MOTH_COCOON_FRAME_IDS)[number]
  | (typeof PRISM_MOTH_BROODLING_FRAME_IDS)[number];

export const PRISM_MOTH_PROJECTILE_KIND_IDS = Object.freeze([
  'prism-feather'
] as const);

export const PRISM_MOTH_ACTION_STAGES = Object.freeze([
  'preparation',
  'telegraph',
  'fire',
  'recovery'
] as const);

export type PrismMothActionStage = (typeof PRISM_MOTH_ACTION_STAGES)[number];
export type PrismMothWingSide = 'port' | 'starboard';
export type PrismMothWingBeatSource = PrismMothWingSide | 'both';
export type PrismMothRotationDirection = 'clockwise' | 'counterclockwise';

export const PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX = 6;
export const PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX = 3;
export const PRISM_MOTH_MIN_CORRIDOR_WIDTH_RATIO = 0.24;
export const PRISM_MOTH_PLAYER_SPAWN_PROTECTED_Y_RATIO = 0.74;

export const PRISM_MOTH_RUNTIME_LIMITS = Object.freeze({
  maximumBroodNodesPerWave: 6,
  maximumBroodWaves: 2,
  maximumOwnedBroodlings: 10,
  minimumSwoopPasses: 2,
  maximumSwoopPasses: 3,
  minimumRouteClearancePx: PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX,
  geometryUncertaintyPx: PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX,
  cleanupOnOwnerLoss: true,
  cleanupOnActionCancel: true,
  damageRequiresVisibleActiveState: true
} as const);

const finiteOr = (value: number | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const clamp01 = (value: number) => clamp(finiteOr(value, 0), 0, 1);

const clampInteger = (
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
) => Math.floor(clamp(finiteOr(value, fallback), minimum, maximum));

const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const lerp = (start: number, end: number, progress: number) => (
  start + (end - start) * progress
);

const quadratic = (
  start: number,
  middle: number,
  end: number,
  progress: number
) => {
  const t = clamp01(progress);
  const inverse = 1 - t;
  return inverse * inverse * start + 2 * inverse * t * middle + t * t * end;
};

const positiveModulo = (value: number, divisor: number) => (
  ((Math.floor(finiteOr(value, 0)) % divisor) + divisor) % divisor
);

const oppositeWing = (side: PrismMothWingSide): PrismMothWingSide => (
  side === 'port' ? 'starboard' : 'port'
);

const hashStableSeedKey = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const resolvePrismMothSeedBranch = ({
  seedKey,
  sequence = 0,
  useIndex = 0,
  branchCount
}: {
  seedKey: string;
  sequence?: number;
  useIndex?: number;
  branchCount: number;
}) => {
  const count = clampInteger(branchCount, 1, 4_096, 1);
  return positiveModulo(
    hashStableSeedKey(String(seedKey ?? 'prism-moth'))
      + Math.floor(finiteOr(sequence, 0))
      + Math.floor(finiteOr(useIndex, 0)) * 17,
    count
  );
};

export interface PrismMothStageDurations {
  readonly preparationFrames: number;
  readonly telegraphFrames: number;
  readonly fireFrames: number;
  readonly recoveryFrames: number;
}

export interface PrismMothActionStageSample {
  readonly stage: PrismMothActionStage;
  readonly actionFrame: number;
  readonly stageFrame: number;
  readonly stageDurationFrames: number;
  readonly stageProgress: number;
  readonly totalFrames: number;
  readonly damageWindowActive: boolean;
  readonly complete: boolean;
  readonly shouldCleanupOwnedArtifacts: boolean;
}

const DEFAULT_STAGE_DURATIONS: Readonly<Record<
  PrismMothActionId,
  PrismMothStageDurations
>> = Object.freeze({
  'wingbeat-weave': Object.freeze({
    preparationFrames: 30,
    telegraphFrames: 42,
    fireFrames: 210,
    recoveryFrames: 54
  }),
  'brood-procession': Object.freeze({
    preparationFrames: 42,
    telegraphFrames: 54,
    fireFrames: 360,
    recoveryFrames: 72
  }),
  'lunar-prism-swoop': Object.freeze({
    preparationFrames: 36,
    telegraphFrames: 54,
    fireFrames: 270,
    recoveryFrames: 78
  }),
  'kaleidoscope-brood': Object.freeze({
    preparationFrames: 54,
    telegraphFrames: 90,
    fireFrames: 480,
    recoveryFrames: 120
  })
});

export const resolvePrismMothStageDurations = (
  actionId: PrismMothActionId,
  overrides: Partial<PrismMothStageDurations> = {}
): PrismMothStageDurations => {
  const defaults = DEFAULT_STAGE_DURATIONS[actionId];
  return Object.freeze({
    preparationFrames: clampInteger(
      overrides.preparationFrames,
      12,
      180,
      defaults.preparationFrames
    ),
    telegraphFrames: clampInteger(
      overrides.telegraphFrames,
      18,
      240,
      defaults.telegraphFrames
    ),
    fireFrames: clampInteger(overrides.fireFrames, 12, 900, defaults.fireFrames),
    recoveryFrames: clampInteger(
      overrides.recoveryFrames,
      12,
      300,
      defaults.recoveryFrames
    )
  });
};

export const samplePrismMothActionStage = ({
  elapsedFrames,
  durations
}: {
  elapsedFrames: number;
  durations: Readonly<PrismMothStageDurations>;
}): PrismMothActionStageSample => {
  const resolved = resolvePrismMothStageDurations('wingbeat-weave', durations);
  const boundaries = [
    resolved.preparationFrames,
    resolved.preparationFrames + resolved.telegraphFrames,
    resolved.preparationFrames + resolved.telegraphFrames + resolved.fireFrames,
    resolved.preparationFrames
      + resolved.telegraphFrames
      + resolved.fireFrames
      + resolved.recoveryFrames
  ] as const;
  const totalFrames = boundaries[3];
  const frame = Math.max(0, Math.floor(finiteOr(elapsedFrames, 0)));
  const complete = frame >= totalFrames;

  let stage: PrismMothActionStage = 'recovery';
  let stageStart = boundaries[2];
  let stageDurationFrames = resolved.recoveryFrames;
  if (frame < boundaries[0]) {
    stage = 'preparation';
    stageStart = 0;
    stageDurationFrames = resolved.preparationFrames;
  } else if (frame < boundaries[1]) {
    stage = 'telegraph';
    stageStart = boundaries[0];
    stageDurationFrames = resolved.telegraphFrames;
  } else if (frame < boundaries[2]) {
    stage = 'fire';
    stageStart = boundaries[1];
    stageDurationFrames = resolved.fireFrames;
  }
  const stageFrame = complete
    ? stageDurationFrames
    : Math.max(0, frame - stageStart);

  return Object.freeze({
    stage,
    actionFrame: Math.min(frame, totalFrames),
    stageFrame,
    stageDurationFrames,
    stageProgress: complete ? 1 : clamp01(stageFrame / stageDurationFrames),
    totalFrames,
    damageWindowActive: !complete && stage === 'fire',
    complete,
    shouldCleanupOwnedArtifacts: complete
  });
};

export interface PrismWingbeatWeaveParameters {
  readonly cadenceFrames: number;
  readonly featherCount: number;
  readonly featherSpacingRadians: number;
  readonly fanAngleRadians: number;
  readonly safeLaneWidthRatio: number;
  readonly driftSpeedRatio: number;
  readonly sequenceLength: number;
}

export interface PrismBroodProcessionParameters {
  readonly broodNodeCount: number;
  readonly hatchDelayFrames: number;
  readonly formationSequence: number;
  readonly broodSpeedRatio: number;
  readonly formationSpacingRatio: number;
  readonly routeWidthRatio: number;
  readonly formationWaves: number;
}

export interface PrismLunarSwoopParameters {
  readonly passCount: 2 | 3;
  readonly swoopFrames: number;
  readonly curveDepthRatio: number;
  readonly edgeTelegraphFrames: number;
  readonly featherTrailFrames: number;
  readonly recoveryFrames: number;
}

export interface PrismKaleidoscopeBroodParameters {
  readonly broodNodeCount: number;
  readonly activationSequence: number;
  readonly rotationDirection: PrismMothRotationDirection;
  readonly corridorWidthRatio: number;
  readonly patternBeats: number;
  readonly coreChargeFrames: number;
  readonly recoveryFrames: number;
}

export const resolvePrismWingbeatWeaveParameters = (
  values: Partial<PrismWingbeatWeaveParameters> = {}
): PrismWingbeatWeaveParameters => Object.freeze({
  cadenceFrames: clampInteger(values.cadenceFrames, 8, 30, 18),
  featherCount: clampInteger(values.featherCount, 3, 9, 5),
  featherSpacingRadians: clamp(finiteOr(values.featherSpacingRadians, 0.11), 0.04, 0.22),
  fanAngleRadians: clamp(finiteOr(values.fanAngleRadians, 0.56), 0.28, 0.9),
  safeLaneWidthRatio: clamp(finiteOr(values.safeLaneWidthRatio, 0.3), 0.24, 0.46),
  driftSpeedRatio: clamp(finiteOr(values.driftSpeedRatio, 0.06), 0, 0.18),
  sequenceLength: clampInteger(values.sequenceLength, 3, 5, 5)
});

export const resolvePrismBroodProcessionParameters = (
  values: Partial<PrismBroodProcessionParameters> = {}
): PrismBroodProcessionParameters => Object.freeze({
  broodNodeCount: clampInteger(values.broodNodeCount, 3, 5, 4),
  hatchDelayFrames: clampInteger(values.hatchDelayFrames, 10, 48, 22),
  formationSequence: clampInteger(values.formationSequence, 0, 4_095, 0),
  broodSpeedRatio: clamp(finiteOr(values.broodSpeedRatio, 0.01), 0.004, 0.022),
  formationSpacingRatio: clamp(finiteOr(values.formationSpacingRatio, 0.22), 0.16, 0.32),
  routeWidthRatio: clamp(
    finiteOr(values.routeWidthRatio, 0.3),
    PRISM_MOTH_MIN_CORRIDOR_WIDTH_RATIO,
    0.44
  ),
  formationWaves: clampInteger(values.formationWaves, 1, 2, 2)
});

export const resolvePrismLunarSwoopParameters = (
  values: Partial<PrismLunarSwoopParameters> = {}
): PrismLunarSwoopParameters => Object.freeze({
  passCount: clampInteger(values.passCount, 2, 3, 2) as 2 | 3,
  swoopFrames: clampInteger(values.swoopFrames, 42, 120, 76),
  curveDepthRatio: clamp(finiteOr(values.curveDepthRatio, 0.26), 0.16, 0.34),
  edgeTelegraphFrames: clampInteger(values.edgeTelegraphFrames, 24, 90, 48),
  featherTrailFrames: clampInteger(values.featherTrailFrames, 18, 90, 48),
  recoveryFrames: clampInteger(values.recoveryFrames, 36, 180, 78)
});

export const resolvePrismKaleidoscopeBroodParameters = (
  values: Partial<PrismKaleidoscopeBroodParameters> = {}
): PrismKaleidoscopeBroodParameters => Object.freeze({
  broodNodeCount: clampInteger(values.broodNodeCount, 4, 6, 6),
  activationSequence: clampInteger(values.activationSequence, 0, 4_095, 0),
  rotationDirection: values.rotationDirection === 'counterclockwise'
    ? 'counterclockwise'
    : 'clockwise',
  corridorWidthRatio: clamp(
    finiteOr(values.corridorWidthRatio, 0.32),
    0.26,
    0.44
  ),
  patternBeats: clampInteger(values.patternBeats, 3, 5, 4),
  coreChargeFrames: clampInteger(values.coreChargeFrames, 48, 180, 96),
  recoveryFrames: clampInteger(values.recoveryFrames, 60, 240, 126)
});

export interface PrismMothWingAvailability {
  readonly port: boolean;
  readonly starboard: boolean;
}

export const resolvePrismMothEmitterSockets = ({
  role,
  source,
  wings
}: {
  role: PrismMothEmitterRole;
  source: PrismMothWingBeatSource | 'core';
  wings: Readonly<PrismMothWingAvailability>;
}): readonly PrismMothRuntimeSocketId[] => {
  if (role === 'core' || source === 'core') {
    return Object.freeze(['prism-core'] as const);
  }
  const requestedSides: readonly PrismMothWingSide[] = source === 'both'
    ? ['port', 'starboard']
    : [source];
  const operationalSides = requestedSides.filter((side) => wings[side]);
  const suffixForSide = (side: PrismMothWingSide) => (
    side === 'port' ? 'left' : 'right'
  );
  return Object.freeze(operationalSides.map((side): PrismMothRuntimeSocketId => {
    const suffix = suffixForSide(side);
    if (role === 'trail') return `wing-tip-${suffix}`;
    if (role === 'brood') return `brood-release-${suffix}`;
    return `wing-edge-${suffix}`;
  }));
};

export interface PrismMothWingbeatBeat {
  readonly index: number;
  readonly source: PrismMothWingBeatSource;
  readonly frameOffset: number;
  readonly delayedBroodEcho: boolean;
}

export const resolvePrismMothWingbeatSequence = ({
  seedKey,
  sequence = 0,
  useIndex = 0,
  phaseIndex = 1,
  sequenceLength = 5,
  cadenceFrames = 18,
  wings
}: {
  seedKey: string;
  sequence?: number;
  useIndex?: number;
  phaseIndex?: number;
  sequenceLength?: number;
  cadenceFrames?: number;
  wings: Readonly<PrismMothWingAvailability>;
}): readonly PrismMothWingbeatBeat[] => {
  const count = clampInteger(sequenceLength, 3, 5, 5);
  const cadence = clampInteger(cadenceFrames, 8, 30, 18);
  const available = [
    ...(wings.port ? ['port' as const] : []),
    ...(wings.starboard ? ['starboard' as const] : [])
  ];
  if (available.length === 0) return Object.freeze([]);
  const firstSide: PrismMothWingSide = resolvePrismMothSeedBranch({
    seedKey,
    sequence,
    useIndex,
    branchCount: 2
  }) === 0 ? 'port' : 'starboard';
  const resolvedFirst = available.includes(firstSide) ? firstSide : available[0];
  const phaseTwo = Math.floor(finiteOr(phaseIndex, 1)) >= 2;
  const beats = Array.from({ length: count }, (_, index): PrismMothWingbeatBeat => {
    let source: PrismMothWingBeatSource;
    if (available.length === 2 && index === count - 1) {
      source = 'both';
    } else if (available.length === 1) {
      source = available[0];
    } else {
      source = index % 2 === 0 ? resolvedFirst : oppositeWing(resolvedFirst);
    }
    return Object.freeze({
      index,
      source,
      frameOffset: index * cadence,
      delayedBroodEcho: phaseTwo && index > 0 && index < count - 1 && index % 2 === 1
    });
  });
  return Object.freeze(beats);
};

export const PRISM_MOTH_FORMATION_TEMPLATE_IDS = Object.freeze([
  'mirrored-arcs',
  'alternating-diagonals',
  'v-opening',
  'split-corridor',
  'staggered-wave',
  'center-bloom'
] as const);

export type PrismMothFormationTemplateId = (
  typeof PRISM_MOTH_FORMATION_TEMPLATE_IDS
)[number];

interface PrismMothFormationSlotSpec {
  readonly side: PrismMothWingSide;
  readonly startOffsetRatio: number;
  readonly middleOffsetRatio: number;
  readonly endOffsetRatio: number;
  readonly cocoonYRatio: number;
  readonly hatchStep: number;
  readonly flutterPhase: number;
}

interface PrismMothFormationTemplate {
  readonly corridorStartRatio: number;
  readonly corridorMiddleRatio: number;
  readonly corridorEndRatio: number;
  readonly slots: readonly PrismMothFormationSlotSpec[];
}

const freezeFormationSlots = (
  slots: readonly PrismMothFormationSlotSpec[]
) => Object.freeze(slots.map((slot) => Object.freeze({ ...slot })));

const FORMATION_TEMPLATES: Readonly<Record<
  PrismMothFormationTemplateId,
  PrismMothFormationTemplate
>> = Object.freeze({
  'mirrored-arcs': Object.freeze({
    corridorStartRatio: 0.5,
    corridorMiddleRatio: 0.5,
    corridorEndRatio: 0.5,
    slots: freezeFormationSlots([
      { side: 'port', startOffsetRatio: -0.28, middleOffsetRatio: -0.34, endOffsetRatio: -0.28, cocoonYRatio: 0.3, hatchStep: 0, flutterPhase: 0 },
      { side: 'starboard', startOffsetRatio: 0.28, middleOffsetRatio: 0.34, endOffsetRatio: 0.28, cocoonYRatio: 0.34, hatchStep: 1, flutterPhase: 0.5 },
      { side: 'port', startOffsetRatio: -0.4, middleOffsetRatio: -0.43, endOffsetRatio: -0.36, cocoonYRatio: 0.44, hatchStep: 2, flutterPhase: 0.2 },
      { side: 'starboard', startOffsetRatio: 0.4, middleOffsetRatio: 0.43, endOffsetRatio: 0.36, cocoonYRatio: 0.48, hatchStep: 3, flutterPhase: 0.7 },
      { side: 'port', startOffsetRatio: -0.33, middleOffsetRatio: -0.38, endOffsetRatio: -0.31, cocoonYRatio: 0.57, hatchStep: 4, flutterPhase: 0.35 },
      { side: 'starboard', startOffsetRatio: 0.33, middleOffsetRatio: 0.38, endOffsetRatio: 0.31, cocoonYRatio: 0.61, hatchStep: 5, flutterPhase: 0.85 }
    ])
  }),
  'alternating-diagonals': Object.freeze({
    corridorStartRatio: 0.42,
    corridorMiddleRatio: 0.58,
    corridorEndRatio: 0.42,
    slots: freezeFormationSlots([
      { side: 'port', startOffsetRatio: -0.3, middleOffsetRatio: -0.27, endOffsetRatio: -0.34, cocoonYRatio: 0.28, hatchStep: 0, flutterPhase: 0.1 },
      { side: 'starboard', startOffsetRatio: 0.3, middleOffsetRatio: 0.27, endOffsetRatio: 0.34, cocoonYRatio: 0.38, hatchStep: 1, flutterPhase: 0.6 },
      { side: 'starboard', startOffsetRatio: 0.41, middleOffsetRatio: 0.37, endOffsetRatio: 0.4, cocoonYRatio: 0.47, hatchStep: 2, flutterPhase: 0.25 },
      { side: 'port', startOffsetRatio: -0.41, middleOffsetRatio: -0.37, endOffsetRatio: -0.4, cocoonYRatio: 0.53, hatchStep: 3, flutterPhase: 0.8 },
      { side: 'starboard', startOffsetRatio: 0.34, middleOffsetRatio: 0.3, endOffsetRatio: 0.36, cocoonYRatio: 0.61, hatchStep: 4, flutterPhase: 0.4 },
      { side: 'port', startOffsetRatio: -0.34, middleOffsetRatio: -0.3, endOffsetRatio: -0.36, cocoonYRatio: 0.63, hatchStep: 5, flutterPhase: 0.9 }
    ])
  }),
  'v-opening': Object.freeze({
    corridorStartRatio: 0.5,
    corridorMiddleRatio: 0.5,
    corridorEndRatio: 0.5,
    slots: freezeFormationSlots([
      { side: 'port', startOffsetRatio: -0.24, middleOffsetRatio: -0.34, endOffsetRatio: -0.44, cocoonYRatio: 0.31, hatchStep: 0, flutterPhase: 0 },
      { side: 'starboard', startOffsetRatio: 0.24, middleOffsetRatio: 0.34, endOffsetRatio: 0.44, cocoonYRatio: 0.31, hatchStep: 1, flutterPhase: 0.5 },
      { side: 'port', startOffsetRatio: -0.35, middleOffsetRatio: -0.4, endOffsetRatio: -0.46, cocoonYRatio: 0.43, hatchStep: 2, flutterPhase: 0.2 },
      { side: 'starboard', startOffsetRatio: 0.35, middleOffsetRatio: 0.4, endOffsetRatio: 0.46, cocoonYRatio: 0.47, hatchStep: 3, flutterPhase: 0.7 },
      { side: 'port', startOffsetRatio: -0.28, middleOffsetRatio: -0.37, endOffsetRatio: -0.43, cocoonYRatio: 0.58, hatchStep: 4, flutterPhase: 0.35 },
      { side: 'starboard', startOffsetRatio: 0.28, middleOffsetRatio: 0.37, endOffsetRatio: 0.43, cocoonYRatio: 0.62, hatchStep: 5, flutterPhase: 0.85 }
    ])
  }),
  'split-corridor': Object.freeze({
    corridorStartRatio: 0.36,
    corridorMiddleRatio: 0.5,
    corridorEndRatio: 0.64,
    slots: freezeFormationSlots([
      { side: 'port', startOffsetRatio: -0.28, middleOffsetRatio: -0.31, endOffsetRatio: -0.28, cocoonYRatio: 0.3, hatchStep: 0, flutterPhase: 0.1 },
      { side: 'starboard', startOffsetRatio: 0.28, middleOffsetRatio: 0.31, endOffsetRatio: 0.28, cocoonYRatio: 0.36, hatchStep: 1, flutterPhase: 0.6 },
      { side: 'port', startOffsetRatio: -0.39, middleOffsetRatio: -0.4, endOffsetRatio: -0.36, cocoonYRatio: 0.45, hatchStep: 2, flutterPhase: 0.25 },
      { side: 'starboard', startOffsetRatio: 0.39, middleOffsetRatio: 0.4, endOffsetRatio: 0.36, cocoonYRatio: 0.51, hatchStep: 3, flutterPhase: 0.75 },
      { side: 'port', startOffsetRatio: -0.33, middleOffsetRatio: -0.35, endOffsetRatio: -0.31, cocoonYRatio: 0.6, hatchStep: 4, flutterPhase: 0.4 },
      { side: 'starboard', startOffsetRatio: 0.33, middleOffsetRatio: 0.35, endOffsetRatio: 0.31, cocoonYRatio: 0.63, hatchStep: 5, flutterPhase: 0.9 }
    ])
  }),
  'staggered-wave': Object.freeze({
    corridorStartRatio: 0.62,
    corridorMiddleRatio: 0.38,
    corridorEndRatio: 0.62,
    slots: freezeFormationSlots([
      { side: 'port', startOffsetRatio: -0.3, middleOffsetRatio: -0.26, endOffsetRatio: -0.32, cocoonYRatio: 0.29, hatchStep: 0, flutterPhase: 0 },
      { side: 'starboard', startOffsetRatio: 0.3, middleOffsetRatio: 0.26, endOffsetRatio: 0.32, cocoonYRatio: 0.39, hatchStep: 1, flutterPhase: 0.5 },
      { side: 'port', startOffsetRatio: -0.42, middleOffsetRatio: -0.39, endOffsetRatio: -0.4, cocoonYRatio: 0.46, hatchStep: 2, flutterPhase: 0.2 },
      { side: 'starboard', startOffsetRatio: 0.42, middleOffsetRatio: 0.39, endOffsetRatio: 0.4, cocoonYRatio: 0.54, hatchStep: 3, flutterPhase: 0.7 },
      { side: 'starboard', startOffsetRatio: 0.34, middleOffsetRatio: 0.3, endOffsetRatio: 0.35, cocoonYRatio: 0.62, hatchStep: 4, flutterPhase: 0.35 },
      { side: 'port', startOffsetRatio: -0.34, middleOffsetRatio: -0.3, endOffsetRatio: -0.35, cocoonYRatio: 0.64, hatchStep: 5, flutterPhase: 0.85 }
    ])
  }),
  'center-bloom': Object.freeze({
    corridorStartRatio: 0.5,
    corridorMiddleRatio: 0.5,
    corridorEndRatio: 0.5,
    slots: freezeFormationSlots([
      { side: 'port', startOffsetRatio: -0.25, middleOffsetRatio: -0.42, endOffsetRatio: -0.3, cocoonYRatio: 0.3, hatchStep: 0, flutterPhase: 0.1 },
      { side: 'starboard', startOffsetRatio: 0.25, middleOffsetRatio: 0.42, endOffsetRatio: 0.3, cocoonYRatio: 0.34, hatchStep: 1, flutterPhase: 0.6 },
      { side: 'port', startOffsetRatio: -0.36, middleOffsetRatio: -0.46, endOffsetRatio: -0.38, cocoonYRatio: 0.45, hatchStep: 2, flutterPhase: 0.25 },
      { side: 'starboard', startOffsetRatio: 0.36, middleOffsetRatio: 0.46, endOffsetRatio: 0.38, cocoonYRatio: 0.5, hatchStep: 3, flutterPhase: 0.75 },
      { side: 'port', startOffsetRatio: -0.29, middleOffsetRatio: -0.4, endOffsetRatio: -0.33, cocoonYRatio: 0.6, hatchStep: 4, flutterPhase: 0.4 },
      { side: 'starboard', startOffsetRatio: 0.29, middleOffsetRatio: 0.4, endOffsetRatio: 0.33, cocoonYRatio: 0.63, hatchStep: 5, flutterPhase: 0.9 }
    ])
  })
});

export interface PrismMothBroodFormationSlot {
  readonly index: number;
  readonly templateId: PrismMothFormationTemplateId;
  readonly side: PrismMothWingSide;
  readonly startOffsetRatio: number;
  readonly middleOffsetRatio: number;
  readonly endOffsetRatio: number;
  readonly cocoonXRatio: number;
  readonly cocoonYRatio: number;
  readonly hatchDelayFrames: number;
  readonly flutterPhase: number;
}

export interface PrismMothBroodFormation {
  readonly templateId: PrismMothFormationTemplateId;
  readonly sequence: number;
  readonly waveIndex: number;
  readonly reversed: boolean;
  readonly corridorStartRatio: number;
  readonly corridorMiddleRatio: number;
  readonly corridorEndRatio: number;
  readonly routeWidthRatio: number;
  readonly slots: readonly PrismMothBroodFormationSlot[];
}

export interface PrismMothCorridorSample {
  readonly progress: number;
  readonly centerRatio: number;
  readonly centerX: number;
  readonly widthRatio: number;
  readonly widthPx: number;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly replayedClearancePx: number;
  readonly routeSafe: boolean;
}

export interface PrismMothBroodPathSample {
  readonly progress: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly outsideArena: boolean;
}

export const resolvePrismMothFormationTemplateId = (
  sequence: number
): PrismMothFormationTemplateId => PRISM_MOTH_FORMATION_TEMPLATE_IDS[
  positiveModulo(sequence, PRISM_MOTH_FORMATION_TEMPLATE_IDS.length)
];

export const resolvePrismMothFormationSequence = ({
  seedKey,
  sequence = 0,
  waveIndex = 0,
  phaseIndex = 1
}: {
  seedKey: string;
  sequence?: number;
  waveIndex?: number;
  phaseIndex?: number;
}) => (
  Math.max(0, Math.floor(finiteOr(sequence, 0)))
  + resolvePrismMothSeedBranch({
    seedKey,
    sequence: waveIndex,
    useIndex: phaseIndex,
    branchCount: PRISM_MOTH_FORMATION_TEMPLATE_IDS.length
  })
);

export const resolvePrismMothBroodFormation = ({
  sequence,
  nodeCount,
  hatchDelayFrames = 22,
  routeWidthRatio = 0.3,
  waveIndex = 0,
  phaseIndex = 1
}: {
  sequence: number;
  nodeCount: number;
  hatchDelayFrames?: number;
  routeWidthRatio?: number;
  waveIndex?: number;
  phaseIndex?: number;
}): PrismMothBroodFormation => {
  const templateId = resolvePrismMothFormationTemplateId(sequence);
  const template = FORMATION_TEMPLATES[templateId];
  const count = clampInteger(nodeCount, 3, 6, 4);
  const hatchDelay = clampInteger(hatchDelayFrames, 10, 48, 22);
  const normalizedWaveIndex = clampInteger(waveIndex, 0, 1, 0);
  const reversed = Math.floor(finiteOr(phaseIndex, 1)) >= 2 && normalizedWaveIndex === 1;
  const transformRatio = (ratio: number) => reversed ? 1 - ratio : ratio;
  const startRatio = reversed
    ? transformRatio(template.corridorEndRatio)
    : template.corridorStartRatio;
  const middleRatio = transformRatio(template.corridorMiddleRatio);
  const endRatio = reversed
    ? transformRatio(template.corridorStartRatio)
    : template.corridorEndRatio;
  const slots = template.slots.slice(0, count).map((source, index) => {
    const startOffsetRatio = reversed ? -source.endOffsetRatio : source.startOffsetRatio;
    const middleOffsetRatio = reversed ? -source.middleOffsetRatio : source.middleOffsetRatio;
    const endOffsetRatio = reversed ? -source.startOffsetRatio : source.endOffsetRatio;
    return Object.freeze({
      index,
      templateId,
      side: reversed ? oppositeWing(source.side) : source.side,
      startOffsetRatio,
      middleOffsetRatio,
      endOffsetRatio,
      cocoonXRatio: clamp(startRatio + startOffsetRatio, 0.06, 0.94),
      cocoonYRatio: source.cocoonYRatio,
      hatchDelayFrames: source.hatchStep * hatchDelay,
      flutterPhase: reversed ? 1 - source.flutterPhase : source.flutterPhase
    });
  });
  return Object.freeze({
    templateId,
    sequence: Math.max(0, Math.floor(finiteOr(sequence, 0))),
    waveIndex: normalizedWaveIndex,
    reversed,
    corridorStartRatio: startRatio,
    corridorMiddleRatio: middleRatio,
    corridorEndRatio: endRatio,
    routeWidthRatio: clamp(
      finiteOr(routeWidthRatio, 0.3),
      PRISM_MOTH_MIN_CORRIDOR_WIDTH_RATIO,
      0.44
    ),
    slots: Object.freeze(slots)
  });
};

export const samplePrismMothFormationCorridor = ({
  formation,
  progress,
  arenaWidth,
  playerRadiusPx = 12,
  geometryUncertaintyPx = PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX
}: {
  formation: Readonly<PrismMothBroodFormation>;
  progress: number;
  arenaWidth: number;
  playerRadiusPx?: number;
  geometryUncertaintyPx?: number;
}): PrismMothCorridorSample => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const t = clamp01(progress);
  const centerRatio = quadratic(
    formation.corridorStartRatio,
    formation.corridorMiddleRatio,
    formation.corridorEndRatio,
    t
  );
  const widthRatio = clamp(
    finiteOr(formation.routeWidthRatio, 0.3),
    PRISM_MOTH_MIN_CORRIDOR_WIDTH_RATIO,
    0.44
  );
  const widthPx = width * widthRatio;
  const centerX = width * centerRatio;
  const minimumX = Math.max(0, centerX - widthPx / 2);
  const maximumX = Math.min(width, centerX + widthPx / 2);
  const replayedClearancePx = widthPx / 2
    - Math.max(0, finiteOr(playerRadiusPx, 12))
    - Math.max(0, finiteOr(geometryUncertaintyPx, PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX));
  return Object.freeze({
    progress: t,
    centerRatio,
    centerX,
    widthRatio,
    widthPx,
    minimumX,
    maximumX,
    replayedClearancePx,
    routeSafe: replayedClearancePx >= PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX
  });
};

const sampleBroodPathPosition = ({
  formation,
  slot,
  progress,
  arenaWidth,
  arenaHeight,
  broodRadiusPx,
  edgePaddingPx
}: {
  formation: Readonly<PrismMothBroodFormation>;
  slot: Readonly<PrismMothBroodFormationSlot>;
  progress: number;
  arenaWidth: number;
  arenaHeight: number;
  broodRadiusPx: number;
  edgePaddingPx: number;
}) => {
  const width = Math.max(1, arenaWidth);
  const height = Math.max(1, arenaHeight);
  const t = clamp01(progress);
  const corridorRatio = quadratic(
    formation.corridorStartRatio,
    formation.corridorMiddleRatio,
    formation.corridorEndRatio,
    t
  );
  const offsetRatio = quadratic(
    slot.startOffsetRatio,
    slot.middleOffsetRatio,
    slot.endOffsetRatio,
    t
  );
  const flutterRatio = Math.sin((t * 2 + slot.flutterPhase) * Math.PI) * 0.008;
  const inset = Math.min(
    width / 2,
    Math.max(0, broodRadiusPx) + Math.max(0, edgePaddingPx)
  );
  const centerX = clamp(
    width * (corridorRatio + offsetRatio + flutterRatio),
    inset,
    width - inset
  );
  const travel = smoothstep(t);
  const centerY = height * (
    lerp(slot.cocoonYRatio, 1.08, travel)
    + Math.sin(Math.PI * t) * 0.035
  );
  return { centerX, centerY };
};

export const samplePrismMothBroodPath = ({
  formation,
  slot,
  progress,
  arenaWidth,
  arenaHeight,
  broodRadiusPx = 10,
  edgePaddingPx = 8
}: {
  formation: Readonly<PrismMothBroodFormation>;
  slot: Readonly<PrismMothBroodFormationSlot>;
  progress: number;
  arenaWidth: number;
  arenaHeight: number;
  broodRadiusPx?: number;
  edgePaddingPx?: number;
}): PrismMothBroodPathSample => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const height = Math.max(1, finiteOr(arenaHeight, 1));
  const t = clamp01(progress);
  const current = sampleBroodPathPosition({
    formation,
    slot,
    progress: t,
    arenaWidth: width,
    arenaHeight: height,
    broodRadiusPx,
    edgePaddingPx
  });
  const previous = sampleBroodPathPosition({
    formation,
    slot,
    progress: Math.max(0, t - 1 / 240),
    arenaWidth: width,
    arenaHeight: height,
    broodRadiusPx,
    edgePaddingPx
  });
  return Object.freeze({
    progress: t,
    centerX: current.centerX,
    centerY: current.centerY,
    velocityX: current.centerX - previous.centerX,
    velocityY: current.centerY - previous.centerY,
    outsideArena: current.centerY - Math.max(0, broodRadiusPx) > height
  });
};

export interface PrismMothFormationRouteSafety {
  readonly routeSafe: boolean;
  readonly corridorClearancePx: number;
  readonly nearestBroodClearancePx: number;
  readonly minimumReplayedClearancePx: number;
}

export const evaluatePrismMothFormationRouteSafety = ({
  formation,
  progress,
  arenaWidth,
  arenaHeight,
  playerRadiusPx = 12,
  broodRadiusPx = 10,
  geometryUncertaintyPx = PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX
}: {
  formation: Readonly<PrismMothBroodFormation>;
  progress: number;
  arenaWidth: number;
  arenaHeight: number;
  playerRadiusPx?: number;
  broodRadiusPx?: number;
  geometryUncertaintyPx?: number;
}): PrismMothFormationRouteSafety => {
  const corridor = samplePrismMothFormationCorridor({
    formation,
    progress,
    arenaWidth,
    playerRadiusPx,
    geometryUncertaintyPx
  });
  const nearestBroodClearancePx = formation.slots.reduce((minimum, slot) => {
    const sample = samplePrismMothBroodPath({
      formation,
      slot,
      progress,
      arenaWidth,
      arenaHeight,
      broodRadiusPx
    });
    const clearance = Math.abs(sample.centerX - corridor.centerX)
      - Math.max(0, broodRadiusPx)
      - Math.max(0, playerRadiusPx)
      - Math.max(0, geometryUncertaintyPx);
    return Math.min(minimum, clearance);
  }, Number.POSITIVE_INFINITY);
  const minimumReplayedClearancePx = Math.min(
    corridor.replayedClearancePx,
    nearestBroodClearancePx
  );
  return Object.freeze({
    routeSafe: minimumReplayedClearancePx >= PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX,
    corridorClearancePx: corridor.replayedClearancePx,
    nearestBroodClearancePx,
    minimumReplayedClearancePx
  });
};

export type PrismMothBroodStage =
  | 'cocoon-deploying'
  | 'cocoon-armed'
  | 'hatching'
  | 'flying'
  | 'exiting'
  | 'expired';

export interface PrismMothBroodLifecycleSample {
  readonly stage: PrismMothBroodStage;
  readonly frameIndex: number;
  readonly visualFrameId: PrismMothBroodVisualFrameId | null;
  readonly collisionActive: boolean;
  readonly damageActive: boolean;
  readonly shouldCleanup: boolean;
}

export const samplePrismMothBroodLifecycle = ({
  ageFrames,
  deployFrames = 30,
  hatchDelayFrames = 22,
  hatchFrames = 18,
  flightFrames = 180,
  exitFrames = 30
}: {
  ageFrames: number;
  deployFrames?: number;
  hatchDelayFrames?: number;
  hatchFrames?: number;
  flightFrames?: number;
  exitFrames?: number;
}): PrismMothBroodLifecycleSample => {
  const age = Math.max(0, Math.floor(finiteOr(ageFrames, 0)));
  const deploy = clampInteger(deployFrames, 12, 90, 30);
  const hatchDelay = clampInteger(hatchDelayFrames, 10, 90, 22);
  const hatch = clampInteger(hatchFrames, 8, 48, 18);
  const flight = clampInteger(flightFrames, 60, 480, 180);
  const exit = clampInteger(exitFrames, 12, 90, 30);
  const armedAt = deploy;
  const hatchingAt = armedAt + hatchDelay;
  const flyingAt = hatchingAt + hatch;
  const exitingAt = flyingAt + flight;
  const expiredAt = exitingAt + exit;

  if (age < armedAt) {
    return Object.freeze({
      stage: 'cocoon-deploying',
      frameIndex: Math.min(2, Math.floor(age / Math.max(1, deploy / 3))),
      visualFrameId: PRISM_MOTH_COCOON_FRAME_IDS[0],
      collisionActive: false,
      damageActive: false,
      shouldCleanup: false
    });
  }
  if (age < hatchingAt) {
    return Object.freeze({
      stage: 'cocoon-armed',
      frameIndex: 3,
      visualFrameId: PRISM_MOTH_COCOON_FRAME_IDS[1],
      collisionActive: false,
      damageActive: false,
      shouldCleanup: false
    });
  }
  if (age < flyingAt) {
    const hatchAge = age - hatchingAt;
    const hatchFrameIndex = 2 + Math.min(1, Math.floor(hatchAge / Math.max(1, hatch / 2)));
    return Object.freeze({
      stage: 'hatching',
      frameIndex: 4 + Math.min(3, Math.floor(hatchAge / Math.max(1, hatch / 4))),
      visualFrameId: PRISM_MOTH_COCOON_FRAME_IDS[hatchFrameIndex],
      collisionActive: false,
      damageActive: false,
      shouldCleanup: false
    });
  }
  if (age < exitingAt) {
    const flutterFrameIndex = positiveModulo(age - flyingAt, 4);
    return Object.freeze({
      stage: 'flying',
      frameIndex: 8 + flutterFrameIndex,
      visualFrameId: PRISM_MOTH_BROODLING_FRAME_IDS[flutterFrameIndex],
      collisionActive: true,
      damageActive: true,
      shouldCleanup: false
    });
  }
  if (age < expiredAt) {
    const exitFrameIndex = positiveModulo(age - exitingAt, 4);
    return Object.freeze({
      stage: 'exiting',
      frameIndex: 12 + Math.min(2, Math.floor((age - exitingAt) / Math.max(1, exit / 3))),
      visualFrameId: PRISM_MOTH_BROODLING_FRAME_IDS[exitFrameIndex],
      collisionActive: false,
      damageActive: false,
      shouldCleanup: false
    });
  }
  return Object.freeze({
    stage: 'expired',
    frameIndex: 15,
    visualFrameId: null,
    collisionActive: false,
    damageActive: false,
    shouldCleanup: true
  });
};

export interface PrismMothSwoopPass {
  readonly index: number;
  readonly entrySide: PrismMothWingSide;
  readonly exitSide: PrismMothWingSide;
  readonly trailSourceWing: PrismMothWingSide;
  readonly curveDepthRatio: number;
  readonly leavesCocoon: boolean;
}

export interface PrismMothSwoopSample {
  readonly progress: number;
  readonly x: number;
  readonly y: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly bankRadians: number;
  readonly visible: boolean;
  readonly damageActive: boolean;
  readonly featherTrailActive: boolean;
  readonly safeEdge: 'lower';
}

export const resolvePrismMothSwoopPasses = ({
  seedKey,
  sequence = 0,
  useIndex = 0,
  phaseIndex = 1,
  requestedPassCount = 2,
  curveDepthRatio = 0.26,
  wings
}: {
  seedKey: string;
  sequence?: number;
  useIndex?: number;
  phaseIndex?: number;
  requestedPassCount?: number;
  curveDepthRatio?: number;
  wings: Readonly<PrismMothWingAvailability>;
}): readonly PrismMothSwoopPass[] => {
  const available = [
    ...(wings.port ? ['port' as const] : []),
    ...(wings.starboard ? ['starboard' as const] : [])
  ];
  if (available.length === 0) return Object.freeze([]);
  const count = clampInteger(requestedPassCount, 2, 3, 2);
  const firstEntry: PrismMothWingSide = resolvePrismMothSeedBranch({
    seedKey,
    sequence,
    useIndex,
    branchCount: 2
  }) === 0 ? 'port' : 'starboard';
  const phaseTwo = Math.floor(finiteOr(phaseIndex, 1)) >= 2;
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const entrySide = index % 2 === 0 ? firstEntry : oppositeWing(firstEntry);
    const preferredSource = entrySide;
    const trailSourceWing = available.includes(preferredSource)
      ? preferredSource
      : available[0];
    return Object.freeze({
      index,
      entrySide,
      exitSide: oppositeWing(entrySide),
      trailSourceWing,
      curveDepthRatio: clamp(
        finiteOr(curveDepthRatio, 0.26) + (index % 2 === 0 ? 0 : -0.025),
        0.16,
        0.34
      ),
      leavesCocoon: phaseTwo && index === count - 1
    });
  }));
};

export const samplePrismMothSwoopPass = ({
  pass,
  progress,
  arenaWidth,
  arenaHeight,
  bossWidth,
  bossHeight,
  edgePaddingPx = 8,
  lowerSafetyRatio = 0.22
}: {
  pass: Readonly<PrismMothSwoopPass>;
  progress: number;
  arenaWidth: number;
  arenaHeight: number;
  bossWidth: number;
  bossHeight: number;
  edgePaddingPx?: number;
  lowerSafetyRatio?: number;
}): PrismMothSwoopSample => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const height = Math.max(1, finiteOr(arenaHeight, 1));
  const resolvedBossWidth = clamp(finiteOr(bossWidth, 1), 1, width);
  const resolvedBossHeight = clamp(finiteOr(bossHeight, 1), 1, height);
  const padding = clamp(finiteOr(edgePaddingPx, 8), 0, width / 2);
  const leftCenterX = Math.min(width / 2, resolvedBossWidth / 2 + padding);
  const rightCenterX = Math.max(width / 2, width - resolvedBossWidth / 2 - padding);
  const startCenterX = pass.entrySide === 'port' ? leftCenterX : rightCenterX;
  const endCenterX = pass.entrySide === 'port' ? rightCenterX : leftCenterX;
  const topHudInset = Math.max(72, Math.min(height * 0.13, 116));
  const topCenterY = Math.max(
    resolvedBossHeight / 2 + topHudInset,
    height * 0.16
  );
  const endCenterY = topCenterY + Math.min(24, height * 0.025);
  const lowerReserve = Math.max(72, height * clamp(finiteOr(lowerSafetyRatio, 0.22), 0.18, 0.32));
  const maximumCenterY = Math.max(
    topCenterY,
    height - resolvedBossHeight / 2 - lowerReserve
  );
  const curveDepthPx = Math.min(
    height * clamp(finiteOr(pass.curveDepthRatio, 0.26), 0.16, 0.34),
    maximumCenterY - Math.max(topCenterY, endCenterY)
  );
  const t = clamp01(progress);
  const easedX = smoothstep(t);
  const centerX = lerp(startCenterX, endCenterX, easedX);
  const centerY = lerp(topCenterY, endCenterY, t) + Math.sin(Math.PI * t) * curveDepthPx;
  const previousT = Math.max(0, t - 1 / 240);
  const previousCenterX = lerp(startCenterX, endCenterX, smoothstep(previousT));
  const previousCenterY = lerp(topCenterY, endCenterY, previousT)
    + Math.sin(Math.PI * previousT) * curveDepthPx;
  const velocityX = centerX - previousCenterX;
  const velocityY = centerY - previousCenterY;
  const directionSign = pass.entrySide === 'port' ? 1 : -1;
  const bankRadians = clamp(
    Math.atan2(velocityY, Math.max(0.0001, Math.abs(velocityX))) * directionSign,
    -0.65,
    0.65
  );
  const x = centerX - resolvedBossWidth / 2;
  const y = centerY - resolvedBossHeight / 2;
  const visible = x + resolvedBossWidth > 0
    && x < width
    && y + resolvedBossHeight > 0
    && y < height;
  return Object.freeze({
    progress: t,
    x,
    y,
    centerX,
    centerY,
    velocityX,
    velocityY,
    bankRadians,
    visible,
    damageActive: visible && t >= 0.14 && t <= 0.86,
    featherTrailActive: visible && t >= 0.18 && t <= 0.8,
    safeEdge: 'lower'
  });
};

export type PrismMothWingSection =
  | 'port-upper'
  | 'port-lower'
  | 'starboard-upper'
  | 'starboard-lower'
  | 'core';

export interface PrismMothSignatureBeat {
  readonly index: number;
  readonly source: PrismMothWingSide | 'core';
  readonly wingSection: PrismMothWingSection;
  readonly formationTemplateId: PrismMothFormationTemplateId;
  readonly rotationDirection: PrismMothRotationDirection;
  readonly corridorStartRatio: number;
  readonly corridorEndRatio: number;
  readonly corridorWidthRatio: number;
  readonly activatedNodeIndexes: readonly number[];
  readonly finalEscapeBeat: boolean;
}

const signatureOffsetPattern = (
  phaseIndex: number,
  firstDirection: -1 | 1
) => (phaseIndex >= 2
  ? [0.17, 0.02, -0.17, -0.04].map((offset) => 0.5 + offset * firstDirection)
  : [0.14, -0.14, 0.12, -0.12].map((offset) => 0.5 + offset * firstDirection));

export const resolvePrismMothSignatureSequence = ({
  seedKey,
  sequence = 0,
  useIndex = 0,
  phaseIndex = 1,
  parameters = resolvePrismKaleidoscopeBroodParameters(),
  wings
}: {
  seedKey: string;
  sequence?: number;
  useIndex?: number;
  phaseIndex?: number;
  parameters?: Readonly<PrismKaleidoscopeBroodParameters>;
  wings: Readonly<PrismMothWingAvailability>;
}): readonly PrismMothSignatureBeat[] => {
  const resolvedParameters = resolvePrismKaleidoscopeBroodParameters(parameters);
  const count = resolvedParameters.patternBeats;
  const phase = Math.floor(finiteOr(phaseIndex, 1)) >= 2 ? 2 : 1;
  const branch = resolvePrismMothSeedBranch({
    seedKey,
    sequence: Math.floor(finiteOr(sequence, 0)) + resolvedParameters.activationSequence,
    useIndex,
    branchCount: PRISM_MOTH_FORMATION_TEMPLATE_IDS.length * 2
  });
  const firstSide: PrismMothWingSide = branch % 2 === 0 ? 'port' : 'starboard';
  const firstDirection = (branch % 2 === 0 ? -1 : 1) as -1 | 1;
  const targets = signatureOffsetPattern(phase, firstDirection);
  const baseRotation = resolvedParameters.rotationDirection;
  const rotationFlipIndex = Math.ceil(count / 2);
  const available = [
    ...(wings.port ? ['port' as const] : []),
    ...(wings.starboard ? ['starboard' as const] : [])
  ];
  let corridorStartRatio = 0.5;

  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const finalEscapeBeat = index === count - 1;
    const desiredSide = index % 2 === 0 ? firstSide : oppositeWing(firstSide);
    const source = finalEscapeBeat || available.length === 0
      ? 'core' as const
      : available.includes(desiredSide)
        ? desiredSide
        : available[0];
    const corridorEndRatio = finalEscapeBeat
      ? 0.5
      : clamp(targets[index % targets.length], 0.32, 0.68);
    const rotationDirection = phase >= 2 && index >= rotationFlipIndex
      ? baseRotation === 'clockwise' ? 'counterclockwise' : 'clockwise'
      : baseRotation;
    const wingSection: PrismMothWingSection = source === 'core'
      ? 'core'
      : `${source}-${index % 2 === 0 ? 'upper' : 'lower'}` as PrismMothWingSection;
    const firstNode = positiveModulo(index, resolvedParameters.broodNodeCount);
    const secondNode = positiveModulo(
      index + Math.ceil(resolvedParameters.broodNodeCount / 2),
      resolvedParameters.broodNodeCount
    );
    const beat = Object.freeze({
      index,
      source,
      wingSection,
      formationTemplateId: resolvePrismMothFormationTemplateId(branch + index),
      rotationDirection,
      corridorStartRatio,
      corridorEndRatio,
      corridorWidthRatio: resolvedParameters.corridorWidthRatio,
      activatedNodeIndexes: Object.freeze([firstNode, secondNode]),
      finalEscapeBeat
    });
    corridorStartRatio = corridorEndRatio;
    return beat;
  }));
};

export const samplePrismMothSignatureCorridor = ({
  beat,
  progress,
  arenaWidth,
  playerRadiusPx = 12,
  geometryUncertaintyPx = PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX
}: {
  beat: Readonly<PrismMothSignatureBeat>;
  progress: number;
  arenaWidth: number;
  playerRadiusPx?: number;
  geometryUncertaintyPx?: number;
}): PrismMothCorridorSample => {
  const width = Math.max(1, finiteOr(arenaWidth, 1));
  const t = clamp01(progress);
  const centerRatio = lerp(
    beat.corridorStartRatio,
    beat.corridorEndRatio,
    smoothstep(t)
  );
  const widthRatio = clamp(beat.corridorWidthRatio, 0.26, 0.44);
  const widthPx = width * widthRatio;
  const centerX = width * centerRatio;
  const minimumX = Math.max(0, centerX - widthPx / 2);
  const maximumX = Math.min(width, centerX + widthPx / 2);
  const replayedClearancePx = widthPx / 2
    - Math.max(0, finiteOr(playerRadiusPx, 12))
    - Math.max(0, finiteOr(geometryUncertaintyPx, PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX));
  return Object.freeze({
    progress: t,
    centerRatio,
    centerX,
    widthRatio,
    widthPx,
    minimumX,
    maximumX,
    replayedClearancePx,
    routeSafe: replayedClearancePx >= PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX
  });
};

export interface PrismMothPhaseRemixRules {
  readonly phaseIndex: 1 | 2;
  readonly wingbeatWeave: Readonly<{
    reverseSequence: boolean;
    delayedBroodEcho: boolean;
  }>;
  readonly broodProcession: Readonly<{
    reverseSecondWave: boolean;
    nextTemplateStep: number;
  }>;
  readonly lunarPrismSwoop: Readonly<{
    alternateEntryEdge: boolean;
    leaveFinalCocoon: boolean;
  }>;
  readonly kaleidoscopeBrood: Readonly<{
    mirrorActivationOrder: boolean;
    corridorDirectionChanges: 0 | 1;
  }>;
  readonly driftArcSide: PrismMothWingSide;
}

export const resolvePrismMothPhaseRemixRules = ({
  seedKey,
  sequence = 0,
  useIndex = 0,
  phaseIndex = 1
}: {
  seedKey: string;
  sequence?: number;
  useIndex?: number;
  phaseIndex?: number;
}): PrismMothPhaseRemixRules => {
  const phase = Math.floor(finiteOr(phaseIndex, 1)) >= 2 ? 2 : 1;
  const branch = resolvePrismMothSeedBranch({
    seedKey,
    sequence,
    useIndex,
    branchCount: 2
  });
  const phaseTwo = phase === 2;
  return Object.freeze({
    phaseIndex: phase,
    wingbeatWeave: Object.freeze({
      reverseSequence: phaseTwo && branch === 1,
      delayedBroodEcho: phaseTwo
    }),
    broodProcession: Object.freeze({
      reverseSecondWave: phaseTwo,
      nextTemplateStep: phaseTwo ? 2 : 1
    }),
    lunarPrismSwoop: Object.freeze({
      alternateEntryEdge: phaseTwo,
      leaveFinalCocoon: phaseTwo
    }),
    kaleidoscopeBrood: Object.freeze({
      mirrorActivationOrder: phaseTwo && branch === 1,
      corridorDirectionChanges: phaseTwo ? 1 : 0
    }),
    driftArcSide: branch === 0 ? 'port' : 'starboard'
  });
};

export type PrismMothFallbackMode = 'none' | 'single-wing' | 'core-brood';

export interface PrismMothActionResolution {
  readonly requestedActionId: PrismMothActionId;
  readonly resolvedActionId: PrismMothActionId;
  readonly requestedActionDisabled: boolean;
  readonly fallbackMode: PrismMothFallbackMode;
  readonly operationalWings: readonly PrismMothWingSide[];
  readonly coreOwnsFallback: boolean;
}

export const resolvePrismMothActionForWings = ({
  actionId,
  wings
}: {
  actionId: PrismMothActionId;
  wings: Readonly<PrismMothWingAvailability>;
}): PrismMothActionResolution => {
  const operationalWings = Object.freeze([
    ...(wings.port ? ['port' as const] : []),
    ...(wings.starboard ? ['starboard' as const] : [])
  ]);
  if (actionId === 'brood-procession') {
    return Object.freeze({
      requestedActionId: actionId,
      resolvedActionId: actionId,
      requestedActionDisabled: false,
      fallbackMode: 'none',
      operationalWings,
      coreOwnsFallback: operationalWings.length === 0
    });
  }
  if (operationalWings.length === 0) {
    return Object.freeze({
      requestedActionId: actionId,
      resolvedActionId: 'brood-procession',
      requestedActionDisabled: true,
      fallbackMode: 'core-brood',
      operationalWings,
      coreOwnsFallback: true
    });
  }
  return Object.freeze({
    requestedActionId: actionId,
    resolvedActionId: actionId,
    requestedActionDisabled: false,
    fallbackMode: operationalWings.length === 1 ? 'single-wing' : 'none',
    operationalWings,
    coreOwnsFallback: false
  });
};

export interface PrismMothOwnedArtifactState {
  readonly shouldCleanup: boolean;
  readonly collisionActive: boolean;
  readonly damageActive: boolean;
}

/**
 * Final authority for boss-owned cocoons, broodlings, feathers, and trail
 * hazards. An entity cannot damage after owner loss, action cancellation, or
 * lifecycle expiry, even if a caller retains an old local animation state.
 */
export const resolvePrismMothOwnedArtifactState = ({
  ownerAlive,
  sourceActionActive,
  lifecycleComplete,
  visibleCollisionActive,
  visibleDamageActive
}: {
  ownerAlive: boolean;
  sourceActionActive: boolean;
  lifecycleComplete: boolean;
  visibleCollisionActive: boolean;
  visibleDamageActive: boolean;
}): PrismMothOwnedArtifactState => {
  const shouldCleanup = !ownerAlive || !sourceActionActive || lifecycleComplete;
  return Object.freeze({
    shouldCleanup,
    collisionActive: !shouldCleanup && visibleCollisionActive,
    damageActive: !shouldCleanup && visibleCollisionActive && visibleDamageActive
  });
};
