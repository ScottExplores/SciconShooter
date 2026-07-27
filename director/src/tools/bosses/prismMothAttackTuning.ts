import { BOSS_TIMELINE_PRIMITIVES } from '@game/game-config/bossTimeline';
import type {
  BossAttackSentence,
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelinePrimitiveId
} from '@game/game-config/types';

/** The narrowest supported playfield is the authority for route-width controls. */
export const PRISM_MOTH_TUNING_VIEWPORT_WIDTH = 390;
export const PRISM_MOTH_TUNING_FRAMES_PER_SECOND = 60;

export const PRISM_MOTH_FORMATION_TEMPLATES = Object.freeze([
  'mirrored-arcs',
  'alternating-diagonals',
  'v-opening',
  'split-corridor',
  'staggered-wave',
  'center-bloom'
] as const);

export type PrismMothFormationTemplate = (
  typeof PRISM_MOTH_FORMATION_TEMPLATES
)[number];

export const PRISM_MOTH_ACTIVATION_ORDERS = Object.freeze([
  'outer-to-inner',
  'inner-to-outer',
  'left-to-right',
  'right-to-left'
] as const);

export type PrismMothActivationOrder = (
  typeof PRISM_MOTH_ACTIVATION_ORDERS
)[number];

export const PRISM_MOTH_FORMATION_ROTATIONS = Object.freeze([
  'clockwise',
  'counterclockwise'
] as const);

export type PrismMothFormationRotation = (
  typeof PRISM_MOTH_FORMATION_ROTATIONS
)[number];

export interface PrismMothAttack1Tuning {
  readonly wingbeatCadenceFrames: number;
  readonly featherCount: number;
  readonly featherSpacingRadians: number;
  readonly fanAngleRadians: number;
  readonly safeLaneWidthRatio: number;
  readonly bossDriftRatio: number;
  readonly sequenceLength: number;
}

export interface PrismMothAttack2Tuning {
  readonly nodeCount: number;
  readonly hatchDelayFrames: number;
  readonly formationTemplate: PrismMothFormationTemplate;
  readonly broodSpeedRatio: number;
  readonly spacingRatio: number;
  readonly routeWidthRatio: number;
  readonly waves: number;
}

export interface PrismMothAttack3Tuning {
  readonly swoopCount: number;
  /** Multiplier over the authored baseline. Higher values complete a pass sooner. */
  readonly speedMultiplier: number;
  readonly curveDepthRatio: number;
  readonly edgeTelegraphFrames: number;
  /** Simulation frames between successive visible feather-trail projectiles. */
  readonly trailCadenceFrames: number;
  readonly recoveryFrames: number;
}

export interface PrismMothAttack4Tuning {
  readonly nodeCount: number;
  readonly activationOrder: PrismMothActivationOrder;
  readonly formationRotation: PrismMothFormationRotation;
  readonly corridorWidthRatio: number;
  readonly beats: number;
  readonly coreChargeFrames: number;
  readonly recoveryFrames: number;
}

/**
 * Intentionally contains exactly the four authored Prism attack identities.
 * Presentation-only pose controls and unrelated boss tuning do not belong here.
 */
export interface PrismMothAttackTuning {
  readonly attack1: PrismMothAttack1Tuning;
  readonly attack2: PrismMothAttack2Tuning;
  readonly attack3: PrismMothAttack3Tuning;
  readonly attack4: PrismMothAttack4Tuning;
}

export type PrismMothAttackTuningDraft = {
  readonly attack1?: Partial<PrismMothAttack1Tuning>;
  readonly attack2?: Partial<PrismMothAttack2Tuning>;
  readonly attack3?: Partial<PrismMothAttack3Tuning>;
  readonly attack4?: Partial<PrismMothAttack4Tuning>;
};

export interface PrismMothNumericTuningRange {
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
): PrismMothNumericTuningRange => Object.freeze({
  minimum,
  maximum,
  step,
  defaultValue
});

/**
 * These are deliberately narrower than the engine's emergency clamps. They
 * keep the default 390x844 test viewport readable while still exposing useful
 * variation for every requested control.
 */
export const PRISM_MOTH_ATTACK_TUNING_RANGES = Object.freeze({
  attack1: Object.freeze({
    wingbeatCadenceFrames: range(24, 30, 1, 30),
    featherCount: range(3, 7, 1, 7),
    featherSpacingRadians: range(0.04, 0.12, 0.01, 0.11),
    fanAngleRadians: range(0.32, 0.72, 0.01, 0.56),
    safeLaneWidthRatio: range(0.3, 0.46, 0.01, 0.32),
    bossDriftRatio: range(0, 0.12, 0.01, 0.06),
    sequenceLength: range(3, 5, 1, 5)
  }),
  attack2: Object.freeze({
    nodeCount: range(3, 5, 1, 4),
    hatchDelayFrames: range(10, 48, 1, 22),
    broodSpeedRatio: range(0.006, 0.018, 0.001, 0.01),
    spacingRatio: range(0.16, 0.32, 0.01, 0.22),
    routeWidthRatio: range(0.3, 0.44, 0.01, 0.32),
    waves: range(1, 2, 1, 2)
  }),
  attack3: Object.freeze({
    swoopCount: range(2, 3, 1, 2),
    speedMultiplier: range(0.8, 1.3, 0.05, 1),
    curveDepthRatio: range(0.16, 0.34, 0.01, 0.26),
    edgeTelegraphFrames: range(36, 54, 1, 48),
    trailCadenceFrames: range(3, 8, 1, 4),
    recoveryFrames: range(36, 60, 1, 60)
  }),
  attack4: Object.freeze({
    nodeCount: range(4, 6, 1, 6),
    corridorWidthRatio: range(0.26, 0.44, 0.01, 0.34),
    beats: range(3, 5, 1, 4),
    coreChargeFrames: range(48, 120, 1, 96),
    recoveryFrames: range(60, 120, 1, 87)
  })
});

export const DEFAULT_PRISM_MOTH_ATTACK_TUNING: Readonly<PrismMothAttackTuning> = Object.freeze({
  attack1: Object.freeze({
    wingbeatCadenceFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.wingbeatCadenceFrames.defaultValue,
    featherCount: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.featherCount.defaultValue,
    featherSpacingRadians: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.featherSpacingRadians.defaultValue,
    fanAngleRadians: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.fanAngleRadians.defaultValue,
    safeLaneWidthRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.safeLaneWidthRatio.defaultValue,
    bossDriftRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.bossDriftRatio.defaultValue,
    sequenceLength: PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.sequenceLength.defaultValue
  }),
  attack2: Object.freeze({
    nodeCount: PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.nodeCount.defaultValue,
    hatchDelayFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.hatchDelayFrames.defaultValue,
    formationTemplate: 'mirrored-arcs',
    broodSpeedRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.broodSpeedRatio.defaultValue,
    spacingRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.spacingRatio.defaultValue,
    routeWidthRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.routeWidthRatio.defaultValue,
    waves: PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.waves.defaultValue
  }),
  attack3: Object.freeze({
    swoopCount: PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.swoopCount.defaultValue,
    speedMultiplier: PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.speedMultiplier.defaultValue,
    curveDepthRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.curveDepthRatio.defaultValue,
    edgeTelegraphFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.edgeTelegraphFrames.defaultValue,
    trailCadenceFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.trailCadenceFrames.defaultValue,
    recoveryFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.recoveryFrames.defaultValue
  }),
  attack4: Object.freeze({
    nodeCount: PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.nodeCount.defaultValue,
    activationOrder: 'outer-to-inner',
    formationRotation: 'clockwise',
    corridorWidthRatio: PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.corridorWidthRatio.defaultValue,
    beats: PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.beats.defaultValue,
    coreChargeFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.coreChargeFrames.defaultValue,
    recoveryFrames: PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.recoveryFrames.defaultValue
  })
});

const decimalsForStep = (step: number) => {
  const text = String(step);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
};

const normalizeNumber = (
  value: unknown,
  specification: PrismMothNumericTuningRange
) => {
  const finiteValue = typeof value === 'number' && Number.isFinite(value)
    ? value
    : specification.defaultValue;
  const clamped = Math.max(
    specification.minimum,
    Math.min(specification.maximum, finiteValue)
  );
  const stepped = specification.minimum + Math.round(
    (clamped - specification.minimum) / specification.step
  ) * specification.step;
  return Number(stepped.toFixed(Math.max(0, decimalsForStep(specification.step))));
};

const isOneOf = <Value extends string>(
  value: unknown,
  options: readonly Value[]
): value is Value => typeof value === 'string' && options.includes(value as Value);

export const normalizePrismMothAttackTuning = (
  draft: PrismMothAttackTuningDraft = {}
): Readonly<PrismMothAttackTuning> => {
  const attack1 = draft.attack1 ?? {};
  const attack2 = draft.attack2 ?? {};
  const attack3 = draft.attack3 ?? {};
  const attack4 = draft.attack4 ?? {};
  return Object.freeze({
    attack1: Object.freeze({
      wingbeatCadenceFrames: normalizeNumber(
        attack1.wingbeatCadenceFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.wingbeatCadenceFrames
      ),
      featherCount: normalizeNumber(
        attack1.featherCount,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.featherCount
      ),
      featherSpacingRadians: normalizeNumber(
        attack1.featherSpacingRadians,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.featherSpacingRadians
      ),
      fanAngleRadians: normalizeNumber(
        attack1.fanAngleRadians,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.fanAngleRadians
      ),
      safeLaneWidthRatio: normalizeNumber(
        attack1.safeLaneWidthRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.safeLaneWidthRatio
      ),
      bossDriftRatio: normalizeNumber(
        attack1.bossDriftRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.bossDriftRatio
      ),
      sequenceLength: normalizeNumber(
        attack1.sequenceLength,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.sequenceLength
      )
    }),
    attack2: Object.freeze({
      nodeCount: normalizeNumber(
        attack2.nodeCount,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.nodeCount
      ),
      hatchDelayFrames: normalizeNumber(
        attack2.hatchDelayFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.hatchDelayFrames
      ),
      formationTemplate: isOneOf(attack2.formationTemplate, PRISM_MOTH_FORMATION_TEMPLATES)
        ? attack2.formationTemplate
        : DEFAULT_PRISM_MOTH_ATTACK_TUNING.attack2.formationTemplate,
      broodSpeedRatio: normalizeNumber(
        attack2.broodSpeedRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.broodSpeedRatio
      ),
      spacingRatio: normalizeNumber(
        attack2.spacingRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.spacingRatio
      ),
      routeWidthRatio: normalizeNumber(
        attack2.routeWidthRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.routeWidthRatio
      ),
      waves: normalizeNumber(
        attack2.waves,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.waves
      )
    }),
    attack3: Object.freeze({
      swoopCount: normalizeNumber(
        attack3.swoopCount,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.swoopCount
      ),
      speedMultiplier: normalizeNumber(
        attack3.speedMultiplier,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.speedMultiplier
      ),
      curveDepthRatio: normalizeNumber(
        attack3.curveDepthRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.curveDepthRatio
      ),
      edgeTelegraphFrames: normalizeNumber(
        attack3.edgeTelegraphFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.edgeTelegraphFrames
      ),
      trailCadenceFrames: normalizeNumber(
        attack3.trailCadenceFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.trailCadenceFrames
      ),
      recoveryFrames: normalizeNumber(
        attack3.recoveryFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.recoveryFrames
      )
    }),
    attack4: Object.freeze({
      nodeCount: normalizeNumber(
        attack4.nodeCount,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.nodeCount
      ),
      activationOrder: isOneOf(attack4.activationOrder, PRISM_MOTH_ACTIVATION_ORDERS)
        ? attack4.activationOrder
        : DEFAULT_PRISM_MOTH_ATTACK_TUNING.attack4.activationOrder,
      formationRotation: isOneOf(
        attack4.formationRotation,
        PRISM_MOTH_FORMATION_ROTATIONS
      )
        ? attack4.formationRotation
        : DEFAULT_PRISM_MOTH_ATTACK_TUNING.attack4.formationRotation,
      corridorWidthRatio: normalizeNumber(
        attack4.corridorWidthRatio,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.corridorWidthRatio
      ),
      beats: normalizeNumber(
        attack4.beats,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.beats
      ),
      coreChargeFrames: normalizeNumber(
        attack4.coreChargeFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.coreChargeFrames
      ),
      recoveryFrames: normalizeNumber(
        attack4.recoveryFrames,
        PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.recoveryFrames
      )
    })
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

const secondsFromFrames = (frames: number) => (
  frames / PRISM_MOTH_TUNING_FRAMES_PER_SECOND
);

const widthFromRatio = (ratio: number) => Math.round(
  ratio * PRISM_MOTH_TUNING_VIEWPORT_WIDTH
);

const clampTimelineNumber = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const supportsParameter = (
  primitiveId: BossTimelinePrimitiveId,
  parameter: keyof NonNullable<BossTimelineClip['parameters']>
) => BOSS_TIMELINE_PRIMITIVES[primitiveId].parameterKeys.includes(parameter);

interface ClipOwnership {
  readonly attackId: string;
  readonly phaseId: string;
  readonly phaseIndex: number;
  readonly beatIndex: number;
  readonly recoveryClipId: string;
}

const buildClipOwnership = (
  attacks: readonly BossAttackSentence[]
) => {
  const ownership = new Map<string, ClipOwnership>();
  const orderedPhaseIds: string[] = [];
  attacks.forEach((attack) => {
    attack.variants.forEach((variant) => {
      if (!orderedPhaseIds.includes(variant.phaseId)) orderedPhaseIds.push(variant.phaseId);
    });
  });
  attacks.forEach((attack) => {
    attack.variants.forEach((variant) => {
      const phaseIndex = Math.max(0, orderedPhaseIds.indexOf(variant.phaseId));
      variant.beatClipIds.forEach((clipId, beatIndex) => {
        ownership.set(clipId, {
          attackId: attack.id,
          phaseId: variant.phaseId,
          phaseIndex,
          beatIndex,
          recoveryClipId: variant.recoveryClipId
        });
      });
    });
  });
  return ownership;
};

const formationTemplateSequence = (template: PrismMothFormationTemplate) => (
  Math.max(0, PRISM_MOTH_FORMATION_TEMPLATES.indexOf(template))
);

/**
 * Packs controls which do not yet have their own schema-v1 parameter into the
 * existing deterministic sequence. Current runtimes still receive a bounded
 * variation seed; a future schema field can unpack this without draft loss.
 */
const kaleidoscopeSequence = ({
  phaseIndex,
  beatIndex,
  tuning
}: {
  phaseIndex: number;
  beatIndex: number;
  tuning: Readonly<PrismMothAttack4Tuning>;
}) => {
  const order = Math.max(0, PRISM_MOTH_ACTIVATION_ORDERS.indexOf(tuning.activationOrder));
  const rotation = tuning.formationRotation === 'counterclockwise' ? 1 : 0;
  return phaseIndex * 256
    + order * 32
    + rotation * 16
    + (tuning.beats - 3) * 4
    + Math.min(3, Math.max(0, beatIndex));
};

const finalClipExecutionEnd = (clip: BossTimelineClip) => (
  clip.startSeconds
  + (clip.repeat ? (clip.repeat.count - 1) * clip.repeat.intervalSeconds : 0)
  + clip.durationSeconds
);

const firstWarningStartForAttack = ({
  attackId,
  phaseId,
  attacks,
  clipsById
}: {
  attackId: string;
  phaseId: string;
  attacks: readonly BossAttackSentence[];
  clipsById: ReadonlyMap<string, BossTimelineClip>;
}) => {
  const variant = attacks
    .find((attack) => attack.id === attackId)
    ?.variants.find((candidate) => candidate.phaseId === phaseId);
  if (!variant) return undefined;
  const starts = variant.beatClipIds.flatMap((clipId) => {
    const action = clipsById.get(clipId);
    const warning = action?.telegraphClipId
      ? clipsById.get(action.telegraphClipId)
      : undefined;
    return warning ? [warning.startSeconds] : [];
  });
  return starts.length > 0 ? Math.min(...starts) : undefined;
};

const mirrorActionRepeatToWarning = (
  action: BossTimelineClip,
  clipsById: ReadonlyMap<string, BossTimelineClip>
) => {
  const warning = action.telegraphClipId
    ? clipsById.get(action.telegraphClipId)
    : undefined;
  if (!warning) return;
  if (action.repeat) {
    warning.repeat = { ...action.repeat };
  } else {
    delete warning.repeat;
  }
};

const setWarningLead = (
  action: BossTimelineClip,
  clipsById: ReadonlyMap<string, BossTimelineClip>,
  leadSeconds: number
) => {
  const warning = action.telegraphClipId
    ? clipsById.get(action.telegraphClipId)
    : undefined;
  if (!warning) return;
  warning.durationSeconds = leadSeconds;
  warning.parameters = {
    ...warning.parameters,
    warningSeconds: leadSeconds
  };
  action.startSeconds = warning.startSeconds + leadSeconds;
};

const updateRecoveryClips = ({
  attacks,
  clipsById,
  tuning
}: {
  attacks: readonly BossAttackSentence[];
  clipsById: ReadonlyMap<string, BossTimelineClip>;
  tuning: Readonly<PrismMothAttackTuning>;
}) => {
  attacks.forEach((attack) => {
    attack.variants.forEach((variant) => {
      const beatClips = variant.beatClipIds.flatMap((clipId) => {
        const clip = clipsById.get(clipId);
        return clip ? [clip] : [];
      });
      const recovery = clipsById.get(variant.recoveryClipId);
      if (!recovery || beatClips.length === 0) return;
      recovery.startSeconds = Math.max(...beatClips.map(finalClipExecutionEnd));
      if (attack.id === 'lunar-prism-swoop') {
        recovery.durationSeconds = secondsFromFrames(tuning.attack3.recoveryFrames);
      } else if (attack.id === 'kaleidoscope-brood') {
        recovery.durationSeconds = secondsFromFrames(tuning.attack4.recoveryFrames);
      }
    });
  });
};

/**
 * Applies one controlled Prism tuning draft to a compiled preview timeline.
 * The source timeline, its clips, parameters, repeats, and attack metadata are
 * never mutated. Only the four registered Prism primitives are changed.
 */
export const applyPrismMothAttackTuningToTimeline = (
  source: BossTimelineConfig,
  draft: PrismMothAttackTuningDraft = {}
): BossTimelineConfig => {
  const tuning = normalizePrismMothAttackTuning(draft);
  const clips = source.clips.map(cloneClip);
  const attacks = source.attacks?.map(cloneAttack) ?? [];
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const ownershipByClipId = buildClipOwnership(attacks);

  clips.forEach((clip) => {
    const ownership = ownershipByClipId.get(clip.id);
    const phaseIndex = ownership?.phaseIndex ?? 0;
    const parameters = { ...clip.parameters };

    if (clip.primitiveId === 'prism-wingbeat-weave') {
      clip.repeat = {
        count: tuning.attack1.sequenceLength,
        intervalSeconds: secondsFromFrames(tuning.attack1.wingbeatCadenceFrames)
      };
      clip.parameters = {
        ...parameters,
        projectileCount: tuning.attack1.featherCount,
        shotIntervalFrames: Math.round(tuning.attack1.featherSpacingRadians * 100),
        projectileSpeedScale: clampTimelineNumber(
          0.9 + tuning.attack1.bossDriftRatio + phaseIndex * 0.08,
          0.5,
          2
        ),
        channelWidthPixels: widthFromRatio(tuning.attack1.safeLaneWidthRatio),
        sweepRangeRatio: tuning.attack1.fanAngleRadians,
        sweepPasses: Math.min(3, tuning.attack1.sequenceLength)
      };
      mirrorActionRepeatToWarning(clip, clipsById);
      return;
    }

    if (clip.primitiveId === 'prism-brood-procession') {
      const durationSeconds = 2.2 + (
        (tuning.attack2.hatchDelayFrames - 10) / 38
      ) * 1.1;
      clip.durationSeconds = durationSeconds;
      clip.repeat = {
        count: tuning.attack2.waves,
        intervalSeconds: durationSeconds + 0.35
      };
      clip.parameters = {
        ...parameters,
        projectileCount: tuning.attack2.nodeCount,
        sequence: phaseIndex * 16 + formationTemplateSequence(tuning.attack2.formationTemplate),
        shotIntervalFrames: clampTimelineNumber(tuning.attack2.hatchDelayFrames, 2, 12),
        projectileSpeedScale: clampTimelineNumber(
          (tuning.attack2.broodSpeedRatio / 0.01) * (phaseIndex > 0 ? 1.08 : 1),
          0.5,
          2
        ),
        channelWidthPixels: widthFromRatio(tuning.attack2.routeWidthRatio),
        sweepRangeRatio: tuning.attack2.spacingRatio,
        sweepPasses: tuning.attack2.waves
      };
      mirrorActionRepeatToWarning(clip, clipsById);
      return;
    }

    if (clip.primitiveId === 'prism-lunar-swoop') {
      const baselineFrames = phaseIndex > 0 ? 81 : 89;
      const swoopCount = Math.max(
        phaseIndex > 0 ? 3 : 2,
        tuning.attack3.swoopCount
      );
      clip.durationSeconds = secondsFromFrames(baselineFrames) / tuning.attack3.speedMultiplier;
      clip.repeat = {
        count: swoopCount,
        intervalSeconds: clip.repeat?.intervalSeconds ?? 1.7
      };
      clip.parameters = {
        ...parameters,
        projectileCount: swoopCount,
        projectileSpeedScale: clampTimelineNumber(
          tuning.attack3.speedMultiplier * (phaseIndex > 0 ? 1.06 : 1),
          0.5,
          2
        ),
        sweepRangeRatio: tuning.attack3.curveDepthRatio,
        sweepPasses: swoopCount,
        ...(supportsParameter('prism-lunar-swoop', 'shotIntervalFrames')
          ? {
              shotIntervalFrames: tuning.attack3.trailCadenceFrames
            }
          : {})
      };
      setWarningLead(
        clip,
        clipsById,
        secondsFromFrames(tuning.attack3.edgeTelegraphFrames)
      );
      const nextAttackStart = clip.phaseId
        ? firstWarningStartForAttack({
            attackId: 'kaleidoscope-brood',
            phaseId: clip.phaseId,
            attacks,
            clipsById
          })
        : undefined;
      if (nextAttackStart !== undefined && clip.repeat.count > 1) {
        const availableIntervalSpan = nextAttackStart
          - clip.startSeconds
          - clip.durationSeconds
          - secondsFromFrames(tuning.attack3.recoveryFrames)
          - 0.05;
        clip.repeat.intervalSeconds = Math.max(
          0.05,
          Math.min(
            clip.repeat.intervalSeconds,
            availableIntervalSpan / (clip.repeat.count - 1)
          )
        );
      }
      mirrorActionRepeatToWarning(clip, clipsById);
      return;
    }

    if (clip.primitiveId === 'prism-kaleidoscope-brood') {
      const beatIndex = ownership?.beatIndex ?? 0;
      const rotationSupported = supportsParameter(
        'prism-kaleidoscope-brood',
        'rotationDirection'
      );
      clip.parameters = {
        ...parameters,
        projectileCount: tuning.attack4.nodeCount,
        sequence: kaleidoscopeSequence({ phaseIndex, beatIndex, tuning: tuning.attack4 }),
        channelWidthPixels: widthFromRatio(tuning.attack4.corridorWidthRatio),
        sweepPasses: Math.min(3, tuning.attack4.beats),
        ...(rotationSupported
          ? { rotationDirection: tuning.attack4.formationRotation }
          : {}),
        ...(beatIndex === 0
          ? { pulseIntervalSeconds: secondsFromFrames(tuning.attack4.coreChargeFrames) }
          : {})
      };
      if (beatIndex === 0) {
        setWarningLead(
          clip,
          clipsById,
          secondsFromFrames(tuning.attack4.coreChargeFrames)
        );
      }
      mirrorActionRepeatToWarning(clip, clipsById);
    }
  });

  updateRecoveryClips({ attacks, clipsById, tuning });

  return {
    durationSeconds: source.durationSeconds,
    loop: source.loop,
    clips,
    ...(source.attacks ? { attacks } : {})
  };
};
