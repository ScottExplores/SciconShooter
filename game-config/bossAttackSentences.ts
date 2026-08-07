import { BOSS_TIMELINE_PRIMITIVES, isDamagingBossTimelinePrimitive } from './bossTimeline';
import type {
  BossAttackSafeRouteRule,
  BossAttackAvailability,
  BossAttackSentence,
  BossAttackSentenceVariant,
  BossAttackSentenceRole,
  BossAttackSkillTest,
  BossAttackSocketRole,
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelinePrimitiveId,
  BossTimelineTelegraphStyle
} from './types';

export type BossAttackDamagingPrimitiveId = Exclude<
  BossTimelinePrimitiveId,
  | 'telegraph'
  | 'set-shield'
  | 'set-weak-point'
  | 'set-movement'
  | 'follow-path'
  | 'effect-cue'
  | 'camera-cue'
>;

export type BossAttackBeatPrimitiveId = BossAttackDamagingPrimitiveId | 'effect-cue';

export interface BossAttackBeatBlueprint {
  readonly id: string;
  readonly label: string;
  readonly primitiveId: BossAttackBeatPrimitiveId;
  /** Seconds after the attack sentence begins. */
  readonly offsetSeconds: number;
  readonly telegraphStyle: BossTimelineTelegraphStyle;
  readonly leadSeconds?: number;
  readonly actionDurationSeconds?: number;
  readonly parameters?: NonNullable<BossTimelineClip['parameters']>;
  readonly repeat?: BossTimelineClip['repeat'];
}

export interface BossAttackSentenceBlueprint {
  readonly id: string;
  readonly label: string;
  readonly phaseId: string;
  readonly role: BossAttackSentenceRole;
  readonly skillTest: BossAttackSkillTest;
  readonly recognitionCue: string;
  readonly solution: string;
  readonly safeRouteRule: BossAttackSafeRouteRule;
  readonly sourceSocketRoles: readonly BossAttackSocketRole[];
  readonly startSeconds: number;
  readonly recoverySeconds: number;
  readonly color: string;
  readonly beats: readonly BossAttackBeatBlueprint[];
}

export interface BossAttackPhaseBlueprint {
  readonly phaseId: string;
  readonly color: string;
  readonly cameraStrength?: number;
  readonly attacks: readonly BossAttackSentenceBlueprint[];
}

export interface BossAttackTimelineBlueprint {
  readonly durationSeconds: number;
  readonly loop?: boolean;
  /** Omit to preserve the original fixed four-attack, every-phase contract. */
  readonly attackAvailability?: BossAttackAvailability;
  /** Required by phase-subset rosters so later unlocks do not reorder Sandbox controls. */
  readonly attackOrder?: readonly string[];
  readonly phases: readonly BossAttackPhaseBlueprint[];
}

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ATTACK_ROLES = new Set<BossAttackSentenceRole>(['core', 'signature']);
const ATTACK_AVAILABILITY = new Set<BossAttackAvailability>(['every-phase', 'phase-subset']);
const PHASE_SUBSET_MINIMUM_GLOBAL_ATTACKS = 4;
const PHASE_SUBSET_MAXIMUM_GLOBAL_ATTACKS = 6;
const PHASE_SUBSET_MINIMUM_ATTACKS_PER_PHASE = 3;
const ATTACK_SKILL_TESTS = new Set<BossAttackSkillTest>([
  'rhythm-dodge',
  'lane-routing',
  'gap-tracking',
  'route-combination'
]);
const ATTACK_SAFE_ROUTE_RULES = new Set<BossAttackSafeRouteRule>([
  'opposite-side-dodge',
  'shifting-channel',
  'rotating-gap',
  'channel-to-quadrant'
]);
const ATTACK_SOCKET_ROLES = new Set<BossAttackSocketRole>(['port', 'starboard', 'core']);

const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
};

const bounded = (value: number, label: string, minimum: number, maximum: number) => {
  finite(value, label);
  if (value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
};

const safeId = (value: string, label: string) => {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new Error(`${label} must be a safe lowercase hyphenated ID.`);
  }
  return value;
};

const text = (value: string, label: string, maximum: number) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${label} must contain 1-${maximum} characters.`);
  }
  return value;
};

const color = (value: string, label: string) => {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new Error(`${label} must be a six-digit hexadecimal color.`);
  }
  return value;
};

const compileBeat = (
  attack: BossAttackSentenceBlueprint,
  beat: BossAttackBeatBlueprint
): readonly [BossTimelineClip, BossTimelineClip] => {
  safeId(beat.id, `${attack.id} beat ID`);
  text(beat.label, `${attack.id}/${beat.id} label`, 100);
  const presentationTransition = beat.primitiveId === 'effect-cue';
  if (
    !Object.prototype.hasOwnProperty.call(BOSS_TIMELINE_PRIMITIVES, beat.primitiveId)
    || (!isDamagingBossTimelinePrimitive(beat.primitiveId) && !presentationTransition)
  ) {
    throw new Error(
      `${attack.id}/${beat.id} must use a damaging Boss Factory primitive or an effect-cue transition.`
    );
  }
  if (!['warning', 'lane', 'target', 'ring', 'spokes'].includes(beat.telegraphStyle)) {
    throw new Error(`${attack.id}/${beat.id} uses an unsupported telegraph style.`);
  }
  bounded(beat.offsetSeconds, `${attack.id}/${beat.id} offset`, 0, 180);
  const leadSeconds = bounded(
    beat.leadSeconds ?? 0.7,
    `${attack.id}/${beat.id} lead`,
    0.45,
    10
  );
  const actionDurationSeconds = bounded(
    beat.actionDurationSeconds ?? 0.35,
    `${attack.id}/${beat.id} duration`,
    0.1,
    10
  );
  if (beat.repeat) {
    if (!BOSS_TIMELINE_PRIMITIVES[beat.primitiveId].supportsRepeat) {
      throw new Error(`${attack.id}/${beat.id} uses repeat on an unsupported primitive.`);
    }
    bounded(beat.repeat.count, `${attack.id}/${beat.id} repeat count`, 1, 8);
    if (!Number.isInteger(beat.repeat.count)) {
      throw new Error(`${attack.id}/${beat.id} repeat count must be an integer.`);
    }
    bounded(
      beat.repeat.intervalSeconds,
      `${attack.id}/${beat.id} repeat interval`,
      0.05,
      30
    );
  }
  const warningStartSeconds = finite(
    attack.startSeconds + beat.offsetSeconds,
    `${beat.id} start`
  );
  const actionId = `${attack.phaseId}-${attack.id}-${beat.id}`;
  const warningId = `${actionId}-warning`;
  const warning: BossTimelineClip = {
    id: warningId,
    label: `${beat.label} warning`,
    track: 'presentation',
    primitiveId: 'telegraph',
    trigger: 'time',
    startSeconds: warningStartSeconds,
    durationSeconds: leadSeconds,
    phaseId: attack.phaseId,
    parameters: {
      warningSeconds: leadSeconds,
      telegraphStyle: beat.telegraphStyle,
      color: attack.color
    },
    ...(beat.repeat ? { repeat: { ...beat.repeat } } : {})
  };
  const action: BossTimelineClip = {
    id: actionId,
    label: beat.label,
    track: BOSS_TIMELINE_PRIMITIVES[beat.primitiveId].track,
    primitiveId: beat.primitiveId,
    trigger: 'time',
    startSeconds: warningStartSeconds + leadSeconds,
    durationSeconds: actionDurationSeconds,
    phaseId: attack.phaseId,
    telegraphClipId: warningId,
    ...(beat.parameters ? { parameters: { ...beat.parameters } } : {}),
    ...(beat.repeat ? { repeat: { ...beat.repeat } } : {})
  };
  return [warning, action];
};

const compileAttack = (
  attack: BossAttackSentenceBlueprint,
  timelineDurationSeconds: number
): {
  readonly clips: readonly BossTimelineClip[];
  readonly metadata: Omit<BossAttackSentence, 'variants'>;
  readonly variant: BossAttackSentenceVariant;
} => {
  safeId(attack.id, 'Boss attack ID');
  safeId(attack.phaseId, `${attack.id} phase ID`);
  text(attack.label, `${attack.id} label`, 100);
  text(attack.recognitionCue, `${attack.id} recognition cue`, 160);
  text(attack.solution, `${attack.id} solution`, 200);
  color(attack.color, `${attack.id} color`);
  if (!ATTACK_ROLES.has(attack.role)) {
    throw new Error(`${attack.id} has an unsupported attack role.`);
  }
  if (!ATTACK_SKILL_TESTS.has(attack.skillTest)) {
    throw new Error(`${attack.id} has an unsupported skill test.`);
  }
  if (!ATTACK_SAFE_ROUTE_RULES.has(attack.safeRouteRule)) {
    throw new Error(`${attack.id} has an unsupported safe-route rule.`);
  }
  bounded(attack.startSeconds, `${attack.id} start`, 0, timelineDurationSeconds);
  bounded(attack.recoverySeconds, `${attack.id} recovery`, 0.6, 10);
  if (!Array.isArray(attack.beats) || attack.beats.length === 0 || attack.beats.length > 8) {
    throw new Error(`${attack.id} must contain between 1 and 8 authored beat clips.`);
  }
  const expandedBeatCount = attack.beats.reduce((total, beat) => (
    total + (beat.repeat?.count ?? 1)
  ), 0);
  const minimumBeats = attack.role === 'signature' ? 4 : 2;
  if (expandedBeatCount < minimumBeats) {
    throw new Error(`${attack.id} requires at least ${minimumBeats} connected beats.`);
  }
  if (
    !Array.isArray(attack.sourceSocketRoles)
    || attack.sourceSocketRoles.length === 0
    || attack.sourceSocketRoles.length > 3
  ) {
    throw new Error(`${attack.id} must name at least one anatomy-owned socket role.`);
  }
  const uniqueSocketRoles = new Set<BossAttackSocketRole>();
  attack.sourceSocketRoles.forEach((role) => {
    if (!ATTACK_SOCKET_ROLES.has(role)) {
      throw new Error(`${attack.id} uses an unsupported anatomy-owned socket role.`);
    }
    if (uniqueSocketRoles.has(role)) {
      throw new Error(`${attack.id} repeats anatomy-owned socket role ${role}.`);
    }
    uniqueSocketRoles.add(role);
  });
  let previousOffset = -1;
  const beatIds = new Set<string>();
  const compiledBeatPairs = attack.beats.map((beat) => {
    if (beatIds.has(beat.id)) {
      throw new Error(`${attack.id} has duplicate beat ID ${beat.id}.`);
    }
    beatIds.add(beat.id);
    if (beat.offsetSeconds <= previousOffset) {
      throw new Error(`${attack.id} beat offsets must be strictly increasing.`);
    }
    previousOffset = beat.offsetSeconds;
    return compileBeat(attack, beat);
  });
  const beatClips = compiledBeatPairs.map(([, action]) => action);
  const finalActionEnd = Math.max(...beatClips.map((clip) => {
    const repeatSpan = clip.repeat
      ? (Math.max(1, clip.repeat.count) - 1) * clip.repeat.intervalSeconds
      : 0;
    return clip.startSeconds + repeatSpan + clip.durationSeconds;
  }));
  const recoveryClipId = `${attack.phaseId}-${attack.id}-recovery`;
  const recoveryClip: BossTimelineClip = {
    id: recoveryClipId,
    label: `${attack.label} recovery`,
    track: 'presentation',
    primitiveId: 'effect-cue',
    trigger: 'time',
    startSeconds: finalActionEnd,
    durationSeconds: attack.recoverySeconds,
    phaseId: attack.phaseId,
    parameters: { color: attack.color }
  };
  if (recoveryClip.startSeconds + recoveryClip.durationSeconds > timelineDurationSeconds) {
    throw new Error(`${attack.id} recovery must finish inside the timeline loop.`);
  }
  return {
    clips: [
      ...compiledBeatPairs.flatMap(([warning, action]) => [warning, action]),
      recoveryClip
    ],
    metadata: {
      id: attack.id,
      label: attack.label,
      role: attack.role,
      skillTest: attack.skillTest,
      recognitionCue: attack.recognitionCue,
      solution: attack.solution,
      safeRouteRule: attack.safeRouteRule,
      sourceSocketRoles: [...attack.sourceSocketRoles]
    },
    variant: {
      phaseId: attack.phaseId,
      beatClipIds: beatClips.map((clip) => clip.id),
      recoveryClipId
    }
  };
};

/**
 * Compiles Boss Factory attack sentences into the existing safe timeline
 * primitives. The executable engine facade remains unchanged; authoring gains
 * meaningful attacks instead of disconnected single-clip buttons.
 */
export const compileBossAttackTimeline = (
  blueprint: BossAttackTimelineBlueprint
): BossTimelineConfig => {
  const durationSeconds = bounded(
    blueprint.durationSeconds,
    'Boss attack timeline duration',
    0.1,
    180
  );
  if (!Array.isArray(blueprint.phases) || blueprint.phases.length === 0) {
    throw new Error('Boss attack timeline requires at least one phase.');
  }
  const attackAvailability = blueprint.attackAvailability ?? 'every-phase';
  if (!ATTACK_AVAILABILITY.has(attackAvailability)) {
    throw new Error(`Boss attack timeline uses unsupported attack availability ${String(attackAvailability)}.`);
  }
  const usesPhaseSubsets = attackAvailability === 'phase-subset';
  const phaseIds = new Set<string>();
  blueprint.phases.forEach((phase) => {
    const attacks: readonly BossAttackSentenceBlueprint[] = phase.attacks;
    safeId(phase.phaseId, 'Boss attack phase ID');
    color(phase.color, `${phase.phaseId} phase color`);
    if (phaseIds.has(phase.phaseId)) {
      throw new Error(`Boss attack timeline has duplicate phase ${phase.phaseId}.`);
    }
    phaseIds.add(phase.phaseId);
    if (!Array.isArray(attacks)) {
      throw new Error(`${phase.phaseId} attacks must be an array.`);
    }
    if (usesPhaseSubsets) {
      if (
        attacks.length < PHASE_SUBSET_MINIMUM_ATTACKS_PER_PHASE
        || attacks.length > PHASE_SUBSET_MAXIMUM_GLOBAL_ATTACKS
      ) {
        throw new Error(
          `${phase.phaseId} must make between ${PHASE_SUBSET_MINIMUM_ATTACKS_PER_PHASE} and ${PHASE_SUBSET_MAXIMUM_GLOBAL_ATTACKS} attacks available.`
        );
      }
    } else {
      if (attacks.length !== 4) {
        throw new Error(`${phase.phaseId} must define exactly three core attacks and one signature attack.`);
      }
      const roleCounts = attacks.reduce((counts, attack) => ({
        core: counts.core + (attack.role === 'core' ? 1 : 0),
        signature: counts.signature + (attack.role === 'signature' ? 1 : 0)
      }), { core: 0, signature: 0 });
      if (roleCounts.core !== 3 || roleCounts.signature !== 1) {
        throw new Error(`${phase.phaseId} must define exactly three core attacks and one signature attack.`);
      }
    }
    const attackIds = new Set<string>();
    attacks.forEach((attack) => {
      if (attackIds.has(attack.id)) {
        throw new Error(`${phase.phaseId} has duplicate attack ID ${attack.id}.`);
      }
      attackIds.add(attack.id);
    });
    if (phase.cameraStrength !== undefined) {
      bounded(phase.cameraStrength, `${phase.phaseId} camera strength`, 0, 10);
    }
  });
  const compiled = blueprint.phases.flatMap((phase) => (
    (phase.attacks as readonly BossAttackSentenceBlueprint[]).map((attack) => {
      if (attack.phaseId !== phase.phaseId) {
        throw new Error(`${attack.id} must use its containing phase ${phase.phaseId}.`);
      }
      return compileAttack(attack, durationSeconds);
    })
  ));
  const phaseCues: BossTimelineClip[] = blueprint.phases.flatMap((phase) => [
    {
      id: `${phase.phaseId}-identity`,
      label: `${phase.phaseId} identity`,
      track: 'presentation',
      primitiveId: 'effect-cue',
      trigger: 'phase-enter',
      startSeconds: 0,
      durationSeconds: 0.2,
      phaseId: phase.phaseId,
      parameters: { color: phase.color }
    },
    ...(phase.cameraStrength === undefined
      ? []
      : [{
          id: `${phase.phaseId}-camera`,
          label: `${phase.phaseId} camera cue`,
          track: 'presentation' as const,
          primitiveId: 'camera-cue' as const,
          trigger: 'phase-enter' as const,
          startSeconds: 0,
          durationSeconds: 0.2,
          phaseId: phase.phaseId,
          parameters: { strength: phase.cameraStrength }
        }])
  ]);
  const attacksById = new Map<string, BossAttackSentence>();
  compiled.forEach(({ metadata, variant }) => {
    const existing = attacksById.get(metadata.id);
    if (!existing) {
      attacksById.set(metadata.id, {
        ...metadata,
        sourceSocketRoles: [...metadata.sourceSocketRoles],
        variants: [{ ...variant, beatClipIds: [...variant.beatClipIds] }]
      });
      return;
    }
    const comparableExisting = JSON.stringify({
      ...existing,
      variants: undefined
    });
    const comparableMetadata = JSON.stringify({
      ...metadata,
      variants: undefined
    });
    if (comparableExisting !== comparableMetadata) {
      throw new Error(`${metadata.id} must keep the same learned-rule metadata in every phase.`);
    }
    if (existing.variants.some((candidate) => candidate.phaseId === variant.phaseId)) {
      throw new Error(`${metadata.id} has duplicate phase variant ${variant.phaseId}.`);
    }
    existing.variants.push({ ...variant, beatClipIds: [...variant.beatClipIds] });
  });
  let attacks = [...attacksById.values()];
  if (usesPhaseSubsets) {
    if (!Array.isArray(blueprint.attackOrder)) {
      throw new Error('Phase-subset attack timelines require one stable global attack order.');
    }
    const orderedIds = new Set<string>();
    blueprint.attackOrder.forEach((attackId) => {
      safeId(attackId, 'Global boss attack order ID');
      if (orderedIds.has(attackId)) {
        throw new Error(`Global boss attack order repeats ${attackId}.`);
      }
      orderedIds.add(attackId);
    });
    if (
      orderedIds.size !== attacksById.size
      || [...attacksById.keys()].some((attackId) => !orderedIds.has(attackId))
    ) {
      throw new Error('Global boss attack order must reference every compiled attack exactly once.');
    }
    attacks = blueprint.attackOrder.map((attackId) => attacksById.get(attackId)!);
  } else if (blueprint.attackOrder !== undefined) {
    throw new Error('Global boss attack order is only supported by phase-subset timelines.');
  }
  const roleCounts = attacks.reduce((counts, attack) => ({
    core: counts.core + (attack.role === 'core' ? 1 : 0),
    signature: counts.signature + (attack.role === 'signature' ? 1 : 0)
  }), { core: 0, signature: 0 });
  if (usesPhaseSubsets) {
    if (
      attacks.length < PHASE_SUBSET_MINIMUM_GLOBAL_ATTACKS
      || attacks.length > PHASE_SUBSET_MAXIMUM_GLOBAL_ATTACKS
      || roleCounts.core < 3
      || roleCounts.signature !== 1
    ) {
      throw new Error(
        'Phase-subset timelines require between four and six global attacks, at least three core attacks, and exactly one signature attack.'
      );
    }
  } else if (attacks.length !== 4 || roleCounts.core !== 3 || roleCounts.signature !== 1) {
    throw new Error('Every phase must remix the same three core attacks and one signature attack.');
  }
  if (!usesPhaseSubsets) {
    attacks.forEach((attack) => {
      const variantPhaseIds = new Set(attack.variants.map((variant) => variant.phaseId));
      if (
        variantPhaseIds.size !== phaseIds.size
        || [...phaseIds].some((phaseId) => !variantPhaseIds.has(phaseId))
      ) {
        throw new Error(`${attack.id} must define exactly one variant for every boss phase.`);
      }
    });
  }
  const clips = [
    ...phaseCues,
    ...compiled.flatMap((entry) => entry.clips)
  ];
  if (clips.length > 128) {
    throw new Error('Boss attack timelines support at most 128 compiled clips.');
  }
  return {
    durationSeconds,
    loop: blueprint.loop !== false,
    clips,
    ...(usesPhaseSubsets ? { attackAvailability } : {}),
    attacks
  };
};
