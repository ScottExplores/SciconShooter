import type {
  BossAttackSentence,
  BossTimelineClip,
  BossTimelineConfig
} from '@game/game-config/types';

export const FRONTIER_CROWNCLAW_TUNING_FRAMES_PER_SECOND = 60;

export interface FrontierCrownclawHarpoonTuning {
  readonly targetLockFrames: number;
  readonly launchSpeedMultiplier: number;
  readonly maxExtensionRatio: number;
  readonly tensionFrames: number;
  readonly closeDelayFrames: number;
  readonly retractSpeedMultiplier: number;
  readonly launchCount: number;
  readonly launchAngleDegrees: number;
  readonly crossLinkSpacingFrames: number;
  readonly crossLinkSafeOpeningPixels: number;
}

export interface FrontierCrownclawReactorTuning {
  readonly chargeFrames: number;
  readonly pulseCount: number;
  readonly beamWidthPixels: number;
  readonly beamDurationFrames: number;
  readonly sweepSpeedMultiplier: number;
  readonly sweepRangeRatio: number;
  readonly recoveryFrames: number;
  readonly safeRegionRatio: number;
}

export interface FrontierCrownclawCrabwalkTuning {
  readonly speedMultiplier: number;
  readonly rangeRatio: number;
  readonly directionChanges: number;
  readonly projectileCount: number;
  readonly projectileCadenceFrames: number;
  readonly formationSpacingFrames: number;
  readonly formationBeats: number;
  readonly recoveryFrames: number;
}

export interface FrontierCrownclawAttackTuning {
  readonly harpoon: FrontierCrownclawHarpoonTuning;
  readonly reactor: FrontierCrownclawReactorTuning;
  readonly crabwalk: FrontierCrownclawCrabwalkTuning;
}

export type FrontierCrownclawAttackTuningDraft = {
  readonly harpoon?: Partial<FrontierCrownclawHarpoonTuning>;
  readonly reactor?: Partial<FrontierCrownclawReactorTuning>;
  readonly crabwalk?: Partial<FrontierCrownclawCrabwalkTuning>;
};

export interface FrontierCrownclawNumericTuningRange {
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly defaultValue: number;
}

const range = (
  minimum: number,
  maximum: number,
  step: number,
  defaultValue: number
): FrontierCrownclawNumericTuningRange => Object.freeze({
  minimum,
  maximum,
  step,
  defaultValue
});

/**
 * These bounds deliberately stay close to the proven 390x844 route package.
 * The engine owns the final emergency clamps; the authoring surface is tighter.
 */
export const FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES = Object.freeze({
  harpoon: Object.freeze({
    targetLockFrames: range(42, 72, 1, 54),
    launchSpeedMultiplier: range(0.85, 1.2, 0.05, 1),
    maxExtensionRatio: range(0.66, 0.78, 0.01, 0.72),
    tensionFrames: range(16, 28, 1, 22),
    closeDelayFrames: range(6, 16, 1, 10),
    retractSpeedMultiplier: range(0.85, 1.2, 0.05, 1),
    launchCount: range(1, 2, 1, 1),
    launchAngleDegrees: range(18, 30, 1, 24),
    crossLinkSpacingFrames: range(87, 102, 1, 93),
    crossLinkSafeOpeningPixels: range(116, 152, 2, 128)
  }),
  reactor: Object.freeze({
    chargeFrames: range(54, 84, 1, 72),
    pulseCount: range(1, 2, 1, 1),
    beamWidthPixels: range(18, 24, 1, 21),
    beamDurationFrames: range(84, 120, 1, 108),
    sweepSpeedMultiplier: range(0.9, 1.15, 0.05, 1),
    sweepRangeRatio: range(0.28, 0.36, 0.01, 0.32),
    recoveryFrames: range(48, 72, 1, 54),
    safeRegionRatio: range(0.28, 0.38, 0.01, 0.32)
  }),
  crabwalk: Object.freeze({
    speedMultiplier: range(0.9, 1.15, 0.05, 1),
    rangeRatio: range(0.42, 0.54, 0.01, 0.48),
    directionChanges: range(1, 4, 1, 2),
    projectileCount: range(9, 14, 1, 12),
    projectileCadenceFrames: range(5, 8, 1, 5),
    formationSpacingFrames: range(180, 228, 3, 201),
    formationBeats: range(2, 4, 1, 2),
    recoveryFrames: range(42, 66, 1, 48)
  })
});

export const DEFAULT_FRONTIER_CROWNCLAW_ATTACK_TUNING: Readonly<FrontierCrownclawAttackTuning> = Object.freeze({
  harpoon: Object.freeze({
    targetLockFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.targetLockFrames.defaultValue,
    launchSpeedMultiplier: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.launchSpeedMultiplier.defaultValue,
    maxExtensionRatio: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.maxExtensionRatio.defaultValue,
    tensionFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.tensionFrames.defaultValue,
    closeDelayFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.closeDelayFrames.defaultValue,
    retractSpeedMultiplier: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.retractSpeedMultiplier.defaultValue,
    launchCount: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.launchCount.defaultValue,
    launchAngleDegrees: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.launchAngleDegrees.defaultValue,
    crossLinkSpacingFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.crossLinkSpacingFrames.defaultValue,
    crossLinkSafeOpeningPixels: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.crossLinkSafeOpeningPixels.defaultValue
  }),
  reactor: Object.freeze({
    chargeFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.chargeFrames.defaultValue,
    pulseCount: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.pulseCount.defaultValue,
    beamWidthPixels: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.beamWidthPixels.defaultValue,
    beamDurationFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.beamDurationFrames.defaultValue,
    sweepSpeedMultiplier: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.sweepSpeedMultiplier.defaultValue,
    sweepRangeRatio: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.sweepRangeRatio.defaultValue,
    recoveryFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.recoveryFrames.defaultValue,
    safeRegionRatio: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.safeRegionRatio.defaultValue
  }),
  crabwalk: Object.freeze({
    speedMultiplier: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.speedMultiplier.defaultValue,
    rangeRatio: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.rangeRatio.defaultValue,
    directionChanges: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.directionChanges.defaultValue,
    projectileCount: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.projectileCount.defaultValue,
    projectileCadenceFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.projectileCadenceFrames.defaultValue,
    formationSpacingFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.formationSpacingFrames.defaultValue,
    formationBeats: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.formationBeats.defaultValue,
    recoveryFrames: FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.recoveryFrames.defaultValue
  })
});

/**
 * Exact schema-v1 mapping for controls that do not yet own a dedicated runtime
 * parameter. This is exported so the UI and tests cannot overstate behavior.
 */
export const FRONTIER_CROWNCLAW_TUNING_FIELD_MAPPINGS = Object.freeze({
  harpoon: Object.freeze({
    targetLockFrames: 'telegraph.durationSeconds and warningSeconds',
    launchSpeedMultiplier: 'projectileSpeedScale plus the launch share of action duration',
    maxExtensionRatio: 'action-duration reach budget; the runtime hard reach cap remains authoritative',
    tensionFrames: 'the tension share of action duration',
    closeDelayFrames: 'the latch/close share of action duration and repeated-launch interval',
    retractSpeedMultiplier: 'the retract share of action duration',
    launchCount: 'bounded action and telegraph repeat count',
    launchAngleDegrees: 'bounded deterministic sequence branch offset',
    crossLinkSpacingFrames: 'warning-to-warning spacing for the four signature beats',
    crossLinkSafeOpeningPixels: 'temporal safe-opening budget between signature beats; one extra frame per four pixels above the proven baseline'
  }),
  reactor: Object.freeze({
    chargeFrames: 'telegraph.durationSeconds and warningSeconds',
    pulseCount: 'bounded action and telegraph repeat count',
    beamWidthPixels: 'conservative warning/gap budget; rendered thickness remains the engine-owned 21px mobile/24px desktop value',
    beamDurationFrames: 'action.durationSeconds',
    sweepSpeedMultiplier: 'inverse action-duration multiplier',
    sweepRangeRatio: 'action-duration travel budget relative to the phase-bounded runtime sweep',
    recoveryFrames: 'recovery clip durationSeconds',
    safeRegionRatio: 'non-damaging inter-pulse and inter-sweep gap budget'
  }),
  crabwalk: Object.freeze({
    speedMultiplier: 'inverse action-duration multiplier',
    rangeRatio: 'action-duration travel budget relative to the registered route template',
    directionChanges: 'bounded deterministic sequence branch offset',
    projectileCount: 'projectileCount parameter; phase one remains three rounds lighter',
    projectileCadenceFrames: 'shotIntervalFrames parameter; phase one remains one frame slower',
    formationSpacingFrames: 'warning-to-warning spacing and two-lane repeat interval',
    formationBeats: 'bounded action and telegraph repeat distribution across outbound/return beats',
    recoveryFrames: 'recovery clip durationSeconds'
  })
});

const decimalsForStep = (step: number) => {
  const text = String(step);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
};

const normalizeNumber = (
  value: unknown,
  specification: FrontierCrownclawNumericTuningRange
) => {
  const finite = typeof value === 'number' && Number.isFinite(value)
    ? value
    : specification.defaultValue;
  const clamped = Math.max(
    specification.minimum,
    Math.min(specification.maximum, finite)
  );
  const stepped = specification.minimum + Math.round(
    (clamped - specification.minimum) / specification.step
  ) * specification.step;
  return Number(stepped.toFixed(decimalsForStep(specification.step)));
};

export const normalizeFrontierCrownclawAttackTuning = (
  draft: FrontierCrownclawAttackTuningDraft = {}
): Readonly<FrontierCrownclawAttackTuning> => {
  const harpoon = draft.harpoon ?? {};
  const reactor = draft.reactor ?? {};
  const crabwalk = draft.crabwalk ?? {};
  const normalizeGroup = <Group extends Record<string, unknown>>(
    values: Group,
    ranges: Record<keyof Group, FrontierCrownclawNumericTuningRange>
  ) => Object.fromEntries(Object.entries(ranges).map(([key, specification]) => [
    key,
    normalizeNumber(values[key], specification)
  ]));
  return Object.freeze({
    harpoon: Object.freeze(normalizeGroup(
      harpoon,
      FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon
    )) as unknown as FrontierCrownclawHarpoonTuning,
    reactor: Object.freeze(normalizeGroup(
      reactor,
      FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor
    )) as unknown as FrontierCrownclawReactorTuning,
    crabwalk: Object.freeze(normalizeGroup(
      crabwalk,
      FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk
    )) as unknown as FrontierCrownclawCrabwalkTuning
  });
};

const cloneClip = (clip: BossTimelineClip): BossTimelineClip => ({
  ...clip,
  ...(clip.repeat ? { repeat: { ...clip.repeat } } : {}),
  ...(clip.parameters ? { parameters: { ...clip.parameters } } : {})
});

const cloneAttack = (attack: BossAttackSentence): BossAttackSentence => ({
  ...attack,
  sourceSocketRoles: [...attack.sourceSocketRoles],
  variants: attack.variants.map((variant) => ({
    ...variant,
    beatClipIds: [...variant.beatClipIds]
  }))
});

const secondsFromFrames = (frames: number) => Number((frames
  / FRONTIER_CROWNCLAW_TUNING_FRAMES_PER_SECOND).toFixed(6));
const framesFromSeconds = (seconds: number) => Math.round(
  seconds * FRONTIER_CROWNCLAW_TUNING_FRAMES_PER_SECOND
);
const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finalExecutionEndFrames = (clip: BossTimelineClip) => (
  framesFromSeconds(clip.startSeconds)
  + (clip.repeat ? (clip.repeat.count - 1) * framesFromSeconds(clip.repeat.intervalSeconds) : 0)
  + framesFromSeconds(clip.durationSeconds)
);

const setRepeat = (
  action: BossTimelineClip,
  warning: BossTimelineClip | undefined,
  count: number,
  intervalFrames: number
) => {
  if (count <= 1) {
    delete action.repeat;
    if (warning) delete warning.repeat;
    return;
  }
  action.repeat = {
    count,
    intervalSeconds: secondsFromFrames(intervalFrames)
  };
  if (warning) warning.repeat = { ...action.repeat };
};

const setWarning = (
  warning: BossTimelineClip | undefined,
  startFrame: number,
  leadFrames: number
) => {
  if (!warning) return;
  warning.startSeconds = secondsFromFrames(startFrame);
  warning.durationSeconds = secondsFromFrames(leadFrames);
  warning.parameters = {
    ...warning.parameters,
    warningSeconds: secondsFromFrames(leadFrames)
  };
};

const getWarning = (
  action: BossTimelineClip,
  clipsById: ReadonlyMap<string, BossTimelineClip>
) => action.telegraphClipId ? clipsById.get(action.telegraphClipId) : undefined;

const getAttackVariant = (
  attacks: readonly BossAttackSentence[],
  attackId: string,
  phaseId: string
) => attacks.find((attack) => attack.id === attackId)
  ?.variants.find((variant) => variant.phaseId === phaseId);

const getVariantActions = (
  attacks: readonly BossAttackSentence[],
  clipsById: ReadonlyMap<string, BossTimelineClip>,
  attackId: string,
  phaseId: string
) => getAttackVariant(attacks, attackId, phaseId)?.beatClipIds.flatMap((clipId) => {
  const clip = clipsById.get(clipId);
  return clip ? [clip] : [];
}) ?? [];

const sequenceOffsetForHarpoon = (
  tuning: Readonly<FrontierCrownclawHarpoonTuning>
) => Math.round((tuning.launchAngleDegrees - 24) * 2)
  + Math.round((tuning.maxExtensionRatio - 0.72) * 100);

const harpoonDurationScale = (
  tuning: Readonly<FrontierCrownclawHarpoonTuning>
) => clamp(
  0.25 * (tuning.maxExtensionRatio / 0.72) / tuning.launchSpeedMultiplier
    + 0.27 * (tuning.tensionFrames / 22)
    + 0.14 * (tuning.closeDelayFrames / 10)
    + 0.27 / tuning.retractSpeedMultiplier
    + 0.07,
  0.72,
  1.36
);

const tunePhase = ({
  phaseId,
  phaseIndex,
  attacks,
  clipsById,
  tuning
}: {
  phaseId: string;
  phaseIndex: number;
  attacks: readonly BossAttackSentence[];
  clipsById: ReadonlyMap<string, BossTimelineClip>;
  tuning: Readonly<FrontierCrownclawAttackTuning>;
}) => {
  const harpoonVariant = getAttackVariant(attacks, 'chainclaw-harpoon', phaseId);
  const harpoonActions = getVariantActions(
    attacks,
    clipsById,
    'chainclaw-harpoon',
    phaseId
  );
  const firstWarning = harpoonActions[0]
    ? getWarning(harpoonActions[0], clipsById)
    : undefined;
  let cursor = firstWarning ? framesFromSeconds(firstWarning.startSeconds) : 12;
  const harpoonScale = harpoonDurationScale(tuning.harpoon);
  const harpoonSequenceOffset = sequenceOffsetForHarpoon(tuning.harpoon);
  let lastEnd = cursor;

  harpoonActions.forEach((action, beatIndex) => {
    const warning = getWarning(action, clipsById);
    const leadFrames = Math.round(
      tuning.harpoon.targetLockFrames * (beatIndex === 0 ? 1 : 8 / 9)
    );
    const sourceDurationFrames = framesFromSeconds(action.durationSeconds);
    const durationFrames = Math.max(36, Math.round(sourceDurationFrames * harpoonScale));
    setWarning(warning, cursor, leadFrames);
    action.startSeconds = secondsFromFrames(cursor + leadFrames);
    action.durationSeconds = secondsFromFrames(durationFrames);
    action.parameters = {
      ...action.parameters,
      sequence: clamp(
        Math.max(0, Math.floor(action.parameters?.sequence ?? 0)) + harpoonSequenceOffset,
        0,
        100000
      ),
      projectileSpeedScale: clamp(
        (Number(action.parameters?.projectileSpeedScale) || 1)
          * tuning.harpoon.launchSpeedMultiplier,
        0.5,
        2
      )
    };
    const repeatIntervalFrames = durationFrames + tuning.harpoon.closeDelayFrames;
    setRepeat(action, warning, tuning.harpoon.launchCount, repeatIntervalFrames);
    lastEnd = finalExecutionEndFrames(action);
    cursor = lastEnd + 18;
  });
  const harpoonRecovery = harpoonVariant
    ? clipsById.get(harpoonVariant.recoveryClipId)
    : undefined;
  if (harpoonRecovery) {
    harpoonRecovery.startSeconds = secondsFromFrames(lastEnd);
    cursor = lastEnd + framesFromSeconds(harpoonRecovery.durationSeconds) + 6;
  }

  const reactorVariant = getAttackVariant(attacks, 'crown-reactor-beam', phaseId);
  const reactorActions = getVariantActions(
    attacks,
    clipsById,
    'crown-reactor-beam',
    phaseId
  );
  const reactorSafeGapFrames = clamp(
    9
      + Math.round((tuning.reactor.safeRegionRatio - 0.32) * 100)
      + (tuning.reactor.beamWidthPixels - 21),
    6,
    20
  );
  lastEnd = cursor;
  reactorActions.forEach((action, beatIndex) => {
    const warning = getWarning(action, clipsById);
    const widthWarningBudget = tuning.reactor.beamWidthPixels - 21;
    const leadFrames = Math.max(30, Math.round(
      tuning.reactor.chargeFrames * (beatIndex === 0 ? 1 : 5 / 6)
        + widthWarningBudget
    ));
    const baseDurationFrames = beatIndex === 0
      ? tuning.reactor.beamDurationFrames
      : Math.round(tuning.reactor.beamDurationFrames * 93 / 108);
    const durationFrames = Math.max(54, Math.round(
      baseDurationFrames
        * (tuning.reactor.sweepRangeRatio / 0.32)
        / tuning.reactor.sweepSpeedMultiplier
    ));
    setWarning(warning, cursor, leadFrames);
    action.startSeconds = secondsFromFrames(cursor + leadFrames);
    action.durationSeconds = secondsFromFrames(durationFrames);
    setRepeat(
      action,
      warning,
      tuning.reactor.pulseCount,
      durationFrames + reactorSafeGapFrames
    );
    lastEnd = finalExecutionEndFrames(action);
    cursor = lastEnd + reactorSafeGapFrames;
  });
  const reactorRecovery = reactorVariant
    ? clipsById.get(reactorVariant.recoveryClipId)
    : undefined;
  if (reactorRecovery) {
    reactorRecovery.startSeconds = secondsFromFrames(lastEnd);
    reactorRecovery.durationSeconds = secondsFromFrames(tuning.reactor.recoveryFrames);
    cursor = lastEnd + tuning.reactor.recoveryFrames + 3;
  }

  const crabwalkVariant = getAttackVariant(
    attacks,
    'bastion-crabwalk-barrage',
    phaseId
  );
  const crabwalkActions = getVariantActions(
    attacks,
    clipsById,
    'bastion-crabwalk-barrage',
    phaseId
  );
  const crabwalkWarningLeadFrames = [51, 45];
  const crabwalkBaseDurationFrames = [141, 129];
  const crabwalkBeatCounts = [
    Math.ceil(tuning.crabwalk.formationBeats / 2),
    Math.floor(tuning.crabwalk.formationBeats / 2)
  ];
  const crabwalkPhaseProjectileCount = phaseIndex === 0
    ? Math.max(6, tuning.crabwalk.projectileCount - 3)
    : tuning.crabwalk.projectileCount;
  const crabwalkPhaseCadence = phaseIndex === 0
    ? Math.min(12, tuning.crabwalk.projectileCadenceFrames + 1)
    : tuning.crabwalk.projectileCadenceFrames;
  let crabwalkLastEnd = cursor;
  crabwalkActions.forEach((action, beatIndex) => {
    const warning = getWarning(action, clipsById);
    const warningStartFrame = cursor
      + beatIndex * tuning.crabwalk.formationSpacingFrames;
    const leadFrames = crabwalkWarningLeadFrames[beatIndex] ?? 45;
    const durationFrames = Math.max(96, Math.round(
      (crabwalkBaseDurationFrames[beatIndex] ?? 129)
        * (tuning.crabwalk.rangeRatio / 0.48)
        / tuning.crabwalk.speedMultiplier
    ));
    setWarning(warning, warningStartFrame, leadFrames);
    action.startSeconds = secondsFromFrames(warningStartFrame + leadFrames);
    action.durationSeconds = secondsFromFrames(durationFrames);
    action.parameters = {
      ...action.parameters,
      projectileCount: crabwalkPhaseProjectileCount,
      sequence: clamp(
        Math.max(0, Math.floor(action.parameters?.sequence ?? 0))
          + (tuning.crabwalk.directionChanges - 2) * 3,
        0,
        100000
      ),
      shotIntervalFrames: crabwalkPhaseCadence
    };
    setRepeat(
      action,
      warning,
      crabwalkBeatCounts[beatIndex] ?? 1,
      tuning.crabwalk.formationSpacingFrames * 2
    );
    crabwalkLastEnd = Math.max(crabwalkLastEnd, finalExecutionEndFrames(action));
  });
  lastEnd = crabwalkLastEnd;
  const crabwalkRecovery = crabwalkVariant
    ? clipsById.get(crabwalkVariant.recoveryClipId)
    : undefined;
  if (crabwalkRecovery) {
    crabwalkRecovery.startSeconds = secondsFromFrames(lastEnd);
    crabwalkRecovery.durationSeconds = secondsFromFrames(tuning.crabwalk.recoveryFrames);
    cursor = lastEnd + tuning.crabwalk.recoveryFrames + 3;
  }

  const crossLinkVariant = getAttackVariant(attacks, 'crown-cross-link', phaseId);
  const crossLinkActions = getVariantActions(
    attacks,
    clipsById,
    'crown-cross-link',
    phaseId
  );
  const crossLinkLeadFrames = 39;
  const crossLinkGapFrames = clamp(
    3 + Math.round((tuning.harpoon.crossLinkSafeOpeningPixels - 128) / 4),
    0,
    12
  );
  lastEnd = cursor;
  crossLinkActions.forEach((action, beatIndex) => {
    const warning = getWarning(action, clipsById);
    const warningStartFrame = cursor
      + beatIndex * tuning.harpoon.crossLinkSpacingFrames;
    const durationFrames = Math.max(
      30,
      tuning.harpoon.crossLinkSpacingFrames
        - crossLinkLeadFrames
        - crossLinkGapFrames
    );
    setWarning(warning, warningStartFrame, crossLinkLeadFrames);
    action.startSeconds = secondsFromFrames(warningStartFrame + crossLinkLeadFrames);
    action.durationSeconds = secondsFromFrames(durationFrames);
    action.parameters = {
      ...action.parameters,
      sequence: clamp(
        Math.max(0, Math.floor(action.parameters?.sequence ?? 0))
          + harpoonSequenceOffset,
        0,
        100000
      ),
      projectileSpeedScale: clamp(
        (Number(action.parameters?.projectileSpeedScale) || 1)
          * tuning.harpoon.launchSpeedMultiplier,
        0.5,
        2
      )
    };
    delete action.repeat;
    if (warning) delete warning.repeat;
    lastEnd = Math.max(lastEnd, finalExecutionEndFrames(action));
  });
  const crossLinkRecovery = crossLinkVariant
    ? clipsById.get(crossLinkVariant.recoveryClipId)
    : undefined;
  if (crossLinkRecovery) {
    crossLinkRecovery.startSeconds = secondsFromFrames(lastEnd);
    return lastEnd + framesFromSeconds(crossLinkRecovery.durationSeconds);
  }
  return lastEnd;
};

/**
 * Applies bounded tuning to a cloned Frontier timeline. The source is never
 * mutated, no campaign resource is written, and only registered Frontier
 * attack variants participate in the phase relayout.
 */
export const applyFrontierCrownclawAttackTuningToTimeline = (
  source: BossTimelineConfig,
  draft: FrontierCrownclawAttackTuningDraft = {}
): BossTimelineConfig => {
  const tuning = normalizeFrontierCrownclawAttackTuning(draft);
  const clips = source.clips.map(cloneClip);
  const attacks = source.attacks?.map(cloneAttack) ?? [];
  const frontierAttackIds = new Set([
    'chainclaw-harpoon',
    'crown-reactor-beam',
    'bastion-crabwalk-barrage',
    'crown-cross-link'
  ]);
  if (!attacks.some((attack) => frontierAttackIds.has(attack.id))) {
    return { ...source, clips, attacks };
  }
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const phaseIds = Array.from(new Set(attacks.flatMap((attack) => (
    attack.variants.map((variant) => variant.phaseId)
  ))));
  let finalFrame = 0;
  phaseIds.forEach((phaseId, phaseIndex) => {
    finalFrame = Math.max(finalFrame, tunePhase({
      phaseId,
      phaseIndex,
      attacks,
      clipsById,
      tuning
    }));
  });
  return {
    ...source,
    durationSeconds: secondsFromFrames(Math.max(6, finalFrame + 15)),
    clips,
    attacks
  };
};
