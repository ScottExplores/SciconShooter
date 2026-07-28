import {
  FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT,
  FRONTIER_CROWNCLAW_MOTION_CUES,
  resolveFrontierChainclawPlan,
  resolveFrontierCrownclawPhaseState,
  sampleFrontierChainclawHarpoon,
  type FrontierChainclawSample,
  type FrontierCrownclawPoint,
  type FrontierCrownclawSide,
  type FrontierCrownclawTimelineStage
} from '../../gameplay/bosses/FrontierCrownclawRuntime';
import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';
import type {
  PreviewBossModularPoseInput,
  PreviewBossModularPoseSampler
} from './PreviewBossRigContracts';

const PORT_CHAIN_PART_IDS = Array.from(
  { length: FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT },
  (_, index) => `chain.port.${index}` as const
);
const STARBOARD_CHAIN_PART_IDS = Array.from(
  { length: FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT },
  (_, index) => `chain.starboard.${index}` as const
);

/**
 * The rig keeps structural pieces separate from VFX. Every chain link is a
 * root-space child so it can follow a sampled curve without stretching one
 * texture, while each claw jaw remains parented to its matching palm.
 */
export const FRONTIER_CROWNCLAW_MODULAR_PART_IDS = Object.freeze([
  'root',
  'body',
  'shell.port',
  'shell.starboard',
  'crown',
  'reactor',
  'mandible.port',
  'mandible.starboard',
  'leg.port.front',
  'leg.port.mid',
  'leg.port.rear',
  'leg.starboard.front',
  'leg.starboard.mid',
  'leg.starboard.rear',
  'claw.port.mount',
  'claw.starboard.mount',
  'spool.port',
  'spool.starboard',
  'claw.port.palm',
  'claw.port.pincer.upper',
  'claw.port.pincer.lower',
  'claw.starboard.palm',
  'claw.starboard.pincer.upper',
  'claw.starboard.pincer.lower',
  'rear-appendage.port',
  'rear-appendage.starboard',
  'bastion.port',
  'bastion.starboard',
  ...PORT_CHAIN_PART_IDS,
  ...STARBOARD_CHAIN_PART_IDS
] as const);

export type FrontierCrownclawModularPartId =
  (typeof FRONTIER_CROWNCLAW_MODULAR_PART_IDS)[number];

export const FRONTIER_CROWNCLAW_MODULAR_SOCKET_IDS = Object.freeze([
  'claw-socket-port',
  'claw-socket-starboard',
  'claw-tip-port',
  'claw-tip-starboard',
  'chain-spool-port',
  'chain-spool-starboard',
  'crown-reactor',
  'bastion-port-port',
  'bastion-port-starboard',
  'rear-bastion-port',
  'rear-bastion-starboard'
] as const);

export type FrontierCrownclawModularSocketId =
  (typeof FRONTIER_CROWNCLAW_MODULAR_SOCKET_IDS)[number];

export const FRONTIER_CROWNCLAW_DESIGN_GEOMETRY = Object.freeze({
  designSize: Object.freeze({ width: 260, height: 210 }),
  port: Object.freeze({
    spool: Object.freeze({ x: -49, y: 18 }),
    clawRest: Object.freeze({ x: -50, y: 37 })
  }),
  starboard: Object.freeze({
    spool: Object.freeze({ x: 49, y: 18 }),
    clawRest: Object.freeze({ x: 50, y: 37 })
  }),
  attackTargetY: 112,
  crossLinkTargetX: 84
} as const);

const REACTOR_IDLE_FRAME_IDS = Object.freeze([
  'reactor.idle.0',
  'reactor.idle.1'
] as const);
const BEAM_FRAME_IDS = Object.freeze([
  'beam.0',
  'beam.1',
  'beam.2',
  'beam.3'
] as const);
const DAMAGE_VFX_OFFSETS = Object.freeze([
  Object.freeze({ x: -28, y: 2 }),
  Object.freeze({ x: 24, y: 8 }),
  Object.freeze({ x: -12, y: 33 }),
  Object.freeze({ x: 18, y: -16 })
] as const);

const resolveClawFrameId = (
  sample: FrontierChainclawSample,
  active: boolean
) => {
  if (!active || sample.lifecycle === 'seated') return 'claw.closed';
  if (
    sample.lifecycle === 'launching'
    || sample.lifecycle === 'latched'
    || sample.lifecycle === 'tensioned'
  ) {
    return 'claw.harpoon';
  }
  return sample.clawOpenAmount > 0.04 ? 'claw.open' : 'claw.closed';
};

const resolveChainContactFrameId = (
  sample: FrontierChainclawSample | null
): string | null => {
  if (!sample) return null;
  switch (sample.lifecycle) {
    case 'latched':
      return 'claw-impact.0';
    case 'tensioned':
      return 'chain-tension.0';
    case 'retracting':
      return 'winch-retract.0';
    case 'reseating':
      return 'mechanical-reseat.0';
    default:
      return null;
  }
};

export interface FrontierCrownclawRigCompatibilityIssue {
  readonly path: string;
  readonly message: string;
}

const EXPECTED_PARENTS = Object.freeze({
  body: 'root',
  'shell.port': 'body',
  'shell.starboard': 'body',
  crown: 'body',
  reactor: 'body',
  'mandible.port': 'body',
  'mandible.starboard': 'body',
  'leg.port.front': 'body',
  'leg.port.mid': 'body',
  'leg.port.rear': 'body',
  'leg.starboard.front': 'body',
  'leg.starboard.mid': 'body',
  'leg.starboard.rear': 'body',
  'claw.port.mount': 'root',
  'claw.starboard.mount': 'root',
  'spool.port': 'claw.port.mount',
  'spool.starboard': 'claw.starboard.mount',
  'claw.port.palm': 'claw.port.mount',
  'claw.port.pincer.upper': 'claw.port.palm',
  'claw.port.pincer.lower': 'claw.port.palm',
  'claw.starboard.palm': 'claw.starboard.mount',
  'claw.starboard.pincer.upper': 'claw.starboard.palm',
  'claw.starboard.pincer.lower': 'claw.starboard.palm',
  'rear-appendage.port': 'body',
  'rear-appendage.starboard': 'body',
  'bastion.port': 'shell.port',
  'bastion.starboard': 'shell.starboard',
  ...Object.fromEntries(PORT_CHAIN_PART_IDS.map((partId) => [partId, 'root'])),
  ...Object.fromEntries(STARBOARD_CHAIN_PART_IDS.map((partId) => [partId, 'root']))
} as Readonly<Partial<Record<FrontierCrownclawModularPartId, FrontierCrownclawModularPartId>>>);

const EXPECTED_SOCKETS = Object.freeze({
  'claw-socket-port': Object.freeze({ partId: 'claw.port.mount', role: 'melee-root' }),
  'claw-socket-starboard': Object.freeze({ partId: 'claw.starboard.mount', role: 'melee-root' }),
  'claw-tip-port': Object.freeze({ partId: 'claw.port.palm', role: 'melee-root' }),
  'claw-tip-starboard': Object.freeze({ partId: 'claw.starboard.palm', role: 'melee-root' }),
  'chain-spool-port': Object.freeze({ partId: 'spool.port', role: 'effect-origin' }),
  'chain-spool-starboard': Object.freeze({ partId: 'spool.starboard', role: 'effect-origin' }),
  'crown-reactor': Object.freeze({ partId: 'reactor', role: 'beam-origin' }),
  'bastion-port-port': Object.freeze({ partId: 'bastion.port', role: 'projectile-muzzle' }),
  'bastion-port-starboard': Object.freeze({ partId: 'bastion.starboard', role: 'projectile-muzzle' }),
  'rear-bastion-port': Object.freeze({ partId: 'rear-appendage.port', role: 'projectile-muzzle' }),
  'rear-bastion-starboard': Object.freeze({ partId: 'rear-appendage.starboard', role: 'projectile-muzzle' })
} as const);

/**
 * Semantic validation is intentionally frame-name agnostic. Equal-canvas
 * alternates can evolve without weakening the anatomy and socket ownership.
 */
export const validateFrontierCrownclawRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly FrontierCrownclawRigCompatibilityIssue[] => {
  const issues: FrontierCrownclawRigCompatibilityIssue[] = [];
  FRONTIER_CROWNCLAW_MODULAR_PART_IDS.forEach((partId) => {
    const part = registration.partById[partId];
    if (!part) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Frontier Crownclaw part ${partId}.`
      }));
      return;
    }
    const expectedParent = EXPECTED_PARENTS[partId];
    if (expectedParent !== undefined && part.parentId !== expectedParent) {
      issues.push(Object.freeze({
        path: `/parts/${partId}/parentId`,
        message: `${partId} must remain attached to ${expectedParent}.`
      }));
    }
  });
  FRONTIER_CROWNCLAW_MODULAR_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    const expected = EXPECTED_SOCKETS[socketId];
    if (!socket) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Frontier Crownclaw socket ${socketId}.`
      }));
      return;
    }
    if (socket.partId !== expected.partId || socket.role !== expected.role) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `${socketId} must follow ${expected.partId} as ${expected.role}.`
      }));
    }
  });
  return Object.freeze(issues);
};

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

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const normalizeStage = (stage: string): FrontierCrownclawTimelineStage => {
  if (stage === 'warning' || stage === 'prepare' || stage === 'telegraph') {
    return 'warning';
  }
  if (stage === 'fire' || stage === 'active' || stage === 'peak') return 'fire';
  if (stage === 'recovery' || stage === 'cooldown' || stage === 'return') {
    return 'recovery';
  }
  return 'idle';
};

const cueMatches = (cue: string, ...values: readonly string[]) => (
  values.some((value) => cue === value)
);

const actionEnvelope = (
  stage: FrontierCrownclawTimelineStage,
  progress: number
) => {
  if (stage === 'warning') return smoothstep(progress);
  if (stage === 'fire') return 1;
  if (stage === 'recovery') return 1 - smoothstep(progress);
  return 0;
};

const toPoseTarget = (point: FrontierCrownclawPoint) => Object.freeze({
  x: (point.x - 0.5)
    * (FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.designSize.width - 28),
  y: 26 + point.y
    * (FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.designSize.height - 90)
});

const resolveSideGeometry = (side: FrontierCrownclawSide) => (
  FRONTIER_CROWNCLAW_DESIGN_GEOMETRY[side]
);

const samplePoseChain = ({
  side,
  active,
  signature,
  stage,
  progress,
  sequence,
  target
}: {
  readonly side: FrontierCrownclawSide;
  readonly active: boolean;
  readonly signature: boolean;
  readonly stage: FrontierCrownclawTimelineStage;
  readonly progress: number;
  readonly sequence: number;
  readonly target: FrontierCrownclawPoint;
}) => {
  const geometry = resolveSideGeometry(side);
  return sampleFrontierChainclawHarpoon({
    side,
    stage: active ? stage : 'idle',
    progress: active ? progress : 0,
    sequence,
    spool: geometry.spool,
    rest: geometry.clawRest,
    target,
    signature
  });
};

export const resolveFrontierCrownclawNeutralChainLayout = (
  side: FrontierCrownclawSide
): readonly Readonly<{
  readonly partId: FrontierCrownclawModularPartId;
  readonly x: number;
  readonly y: number;
  readonly rotationRadians: number;
}>[] => {
  const geometry = resolveSideGeometry(side);
  const sample = sampleFrontierChainclawHarpoon({
    side,
    stage: 'idle',
    progress: 0,
    spool: geometry.spool,
    rest: geometry.clawRest,
    target: geometry.clawRest
  });
  return Object.freeze(sample.links.map((link) => Object.freeze({
    partId: `chain.${side}.${link.index}` as FrontierCrownclawModularPartId,
    x: link.x,
    y: link.y,
    rotationRadians: link.rotationRadians
  })));
};

const buildChainOverrides = (
  side: FrontierCrownclawSide,
  sample: FrontierChainclawSample,
  structuralAlpha: number,
  overcharge: number,
  visible: boolean
): Readonly<Record<string, ModularBossPartPoseOverride>> => {
  const neutral = resolveFrontierCrownclawNeutralChainLayout(side);
  return Object.freeze(Object.fromEntries(sample.links.map((link, index) => {
    const base = neutral[index];
    return [
      `chain.${side}.${index}`,
      freezeOverride({
        xOffset: link.x - base.x,
        yOffset: link.y - base.y,
        rotationOffset: link.rotationRadians - base.rotationRadians,
        alpha: structuralAlpha * (0.82 + overcharge * 0.18),
        visible,
        scaleXMultiplier: 1 + link.tension * 0.025,
        scaleYMultiplier: 1 + overcharge * 0.035
      })
    ];
  })));
};

export interface FrontierCrownclawResolvedPose {
  readonly phaseTwo: boolean;
  readonly shellOpening: number;
  readonly crownLift: number;
  readonly reactorEnergy: number;
  readonly portChain: FrontierChainclawSample;
  readonly starboardChain: FrontierChainclawSample;
  readonly partOverrides: ModularBossRigPoseOverrides;
}

/**
 * Pure simulation-frame pose sampling. The transforms intentionally avoid
 * structural mirroring, wall-time reads, unseeded randomness, and whole-boss
 * flinch on ordinary hits.
 */
export const resolveFrontierCrownclawModularPose = (
  input: PreviewBossModularPoseInput
): FrontierCrownclawResolvedPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = Math.max(1, Math.floor(finiteOr(input.phaseIndex, 1)));
  const phaseProgress = phaseIndex >= 2
    ? clamp(finiteOr(input.phaseProgress, 1), 0, 1)
    : 0;
  const phaseState = resolveFrontierCrownclawPhaseState({
    phaseIndex,
    phaseProgress,
    healthRatio
  });
  const damageStage = clamp(Math.floor(finiteOr(input.damageStage, 0)), 0, 5);
  const damagePressure = damageStage / 5;
  const entranceProgress = smoothstep(finiteOr(input.entranceProgress, 1));
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const cue = String(action?.motionCue ?? '').toLowerCase();
  const stage = normalizeStage(String(action?.stage ?? '').toLowerCase());
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const envelope = actionEnvelope(stage, progress);
  const reducedAmbient = input.reducedMotion ? 0.24 : 1;

  const isHarpoon = primitiveId === 'chainclaw-harpoon'
    || cueMatches(cue, FRONTIER_CROWNCLAW_MOTION_CUES.harpoon, 'chainclaw-harpoon')
    || cueMatches(cue, FRONTIER_CROWNCLAW_MOTION_CUES.crossLink, 'crown-cross-link');
  const isSignature = cueMatches(
    cue,
    FRONTIER_CROWNCLAW_MOTION_CUES.crossLink,
    'crown-cross-link'
  );
  const isBeam = primitiveId === 'crown-reactor-beam'
    || cueMatches(
      cue,
      FRONTIER_CROWNCLAW_MOTION_CUES.reactorCharge,
      FRONTIER_CROWNCLAW_MOTION_CUES.reactorFire,
      'crown-reactor-beam'
    );
  const isCrabwalk = primitiveId === 'bastion-crabwalk-barrage'
    || cueMatches(
      cue,
      FRONTIER_CROWNCLAW_MOTION_CUES.crabwalk,
      'bastion-crabwalk-barrage'
    );
  const isPhaseTransition = cueMatches(
    cue,
    FRONTIER_CROWNCLAW_MOTION_CUES.phaseTwo,
    'critical-cross-link',
    'phase2'
  );
  const isDeath = cueMatches(cue, FRONTIER_CROWNCLAW_MOTION_CUES.death, 'death')
    || primitiveId === 'frontier-death';

  const plan = resolveFrontierChainclawPlan({
    seedKey: 'frontier-crownclaw-pose',
    sequence,
    phaseIndex,
    signature: isSignature
  });
  const actionSide = action?.side === 'port' || action?.side === 'left'
    ? 'port'
    : action?.side === 'starboard' || action?.side === 'right'
      ? 'starboard'
      : plan.primarySide;
  const portActive = isHarpoon && (
    isSignature
    || phaseState.dualHarpoonsEnabled
    || actionSide === 'port'
  );
  const starboardActive = isHarpoon && (
    isSignature
    || phaseState.dualHarpoonsEnabled
    || actionSide === 'starboard'
  );
  const portTarget = toPoseTarget(plan.portTargetRatio);
  const starboardTarget = toPoseTarget(plan.starboardTargetRatio);
  const portChain = samplePoseChain({
    side: 'port',
    active: portActive,
    signature: isSignature,
    stage,
    progress,
    sequence,
    target: portTarget
  });
  const starboardChain = samplePoseChain({
    side: 'starboard',
    active: starboardActive,
    signature: isSignature,
    stage,
    progress,
    sequence,
    target: starboardTarget
  });

  const entranceFold = 1 - entranceProgress;
  const hoverPhase = frame * (0.032 + (1 - healthRatio) * 0.003);
  const breathPhase = frame * 0.066;
  const hover = Math.sin(hoverPhase) * 1.45 * reducedAmbient;
  const idleSway = Math.sin(frame * 0.017 + 0.4) * 0.75 * reducedAmbient;
  const shellBreath = Math.sin(breathPhase) * 0.018 * reducedAmbient;
  const mandibleBreath = Math.sin(breathPhase * 1.16 + 0.8) * 0.04 * reducedAmbient;
  const damageTremor = Math.sin(frame * 0.27 + 0.5)
    * 0.022
    * damagePressure
    * reducedAmbient;

  const beamCharge = isBeam
    ? stage === 'warning'
      ? smoothstep(progress)
      : stage === 'fire'
        ? 1
        : stage === 'recovery'
          ? 1 - smoothstep(progress)
          : 0
    : 0;
  const harpoonBrace = isHarpoon ? envelope : 0;
  const crabwalkEnergy = isCrabwalk ? envelope : 0;
  const crabwalkDirection = sequence % 2 === 0 ? -1 : 1;
  const crabwalkStride = isCrabwalk && stage === 'fire'
    ? Math.sin(progress * Math.PI * 8) * 0.11
    : 0;
  const crabwalkBodyShift = isCrabwalk
    ? crabwalkDirection * (
      stage === 'warning'
        ? smoothstep(progress) * 5
        : stage === 'fire'
          ? Math.sin(progress * Math.PI * 3) * 8
          : (1 - smoothstep(progress)) * 5
    )
    : 0;

  const reaction = input.reaction;
  const reactionStrength = clamp(finiteOr(reaction?.strength, 0), 0, 2);
  const significantReaction = Boolean(
    reaction && (reaction.kind === 'stagger' || reactionStrength >= 0.78)
  );
  const reactionProgress = clamp(finiteOr(reaction?.progress, 1), 0, 1);
  const stagger = significantReaction
    ? Math.sin(reactionProgress * Math.PI)
      * reactionStrength
      * (reaction?.kind === 'stagger' ? 1 : 0.42)
    : 0;
  const reactionDirection = reaction?.direction ?? 1;

  const transitionEnergy = isPhaseTransition
    ? stage === 'recovery'
      ? 1
      : smoothstep(progress)
    : phaseState.transitionProgress;
  const shellOpening = clamp(
    phaseState.shellOpening * 0.72
      + transitionEnergy * 0.28
      + beamCharge * 0.62,
    0,
    1
  );
  const crownLift = clamp(
    phaseState.crownLift * 0.8 + transitionEnergy * 0.2 + beamCharge * 0.34,
    0,
    1.2
  );
  const rearDeployment = clamp(
    phaseState.rearAppendageDeployment + transitionEnergy * 0.18,
    0,
    1
  );
  const reactorEnergy = clamp(
    0.46
      + phaseState.reactorExposure * 0.24
      + beamCharge * 0.3
      + Math.sin(frame * 0.12) * 0.025 * reducedAmbient,
    0.32,
    1.12
  );

  const deathProgress = isDeath ? smoothstep(progress) : 0;
  const deathBreak = smoothstep(clamp((deathProgress - 0.2) / 0.55, 0, 1));
  const deathFade = smoothstep(clamp((deathProgress - 0.72) / 0.28, 0, 1));
  const structuralAlpha = clamp(1 - deathFade * 0.96, 0, 1);
  const deathDirection = sequence % 2 === 0 ? -1 : 1;

  const hullFrameId = isDeath || healthRatio <= 0.26 || damageStage >= 4
    ? 'hull.damaged'
    : shellOpening >= 0.24 || phaseState.critical || isPhaseTransition
      ? 'hull.open'
      : 'hull.closed';
  const reactorIdleFrameId = REACTOR_IDLE_FRAME_IDS[
    Math.floor(frame / 6) % REACTOR_IDLE_FRAME_IDS.length
  ];
  const reactorFrameId = isBeam
    ? stage === 'fire'
      ? 'reactor.overcharged'
      : stage === 'warning'
        ? progress >= 0.68
          ? 'reactor.overcharged'
          : 'reactor.charge'
        : progress < 0.56
          ? 'reactor.charge'
          : reactorIdleFrameId
    : isPhaseTransition
      ? progress >= 0.68
        ? 'reactor.overcharged'
        : 'reactor.charge'
      : reactorIdleFrameId;
  const beamFrameId = BEAM_FRAME_IDS[
    Math.floor(frame / 3) % BEAM_FRAME_IDS.length
  ];
  // The engine-owned rotated beam is the authoritative visible and damaging
  // geometry. Keeping the rig-local vertical strip visible would create a
  // second beam that does not follow the authored sweep angle.
  const beamVisible = false;
  const portExternalHarpoon = isHarpoon && stage === 'fire' && portActive;
  const starboardExternalHarpoon = isHarpoon && stage === 'fire' && starboardActive;

  const activeContactSamples: FrontierChainclawSample[] = [];
  if (portActive) activeContactSamples.push(portChain);
  if (starboardActive) activeContactSamples.push(starboardChain);
  const chainContactSample = activeContactSamples.length === 0
    ? null
    : activeContactSamples[Math.floor(frame / 5) % activeContactSamples.length];
  const chainContactFrameId = resolveChainContactFrameId(chainContactSample);
  const chainContactVisible = Boolean(
    isHarpoon
    && stage !== 'fire'
    && chainContactSample
    && chainContactFrameId
  );

  const majorHitVfx = significantReaction
    && reactionProgress >= 0.12
    && reactionProgress <= 0.78;
  const lowHealthDamage = healthRatio <= 0.5 || damageStage >= 2;
  const severeDamage = healthRatio <= 0.25 || damageStage >= 4;
  const damagePulseCycle = severeDamage ? 22 : 34;
  const damagePulseDuration = severeDamage ? 11 : 6;
  const lowHealthDamageVfx = lowHealthDamage
    && (frame + sequence * 7) % damagePulseCycle < damagePulseDuration;
  const damageVfxVisible = structuralAlpha > 0.02 && (
    isDeath || majorHitVfx || lowHealthDamageVfx
  );
  const damageFrameStep = Math.floor(frame / 6);
  const damageFrameId = isDeath
    ? deathProgress >= 0.72
      ? 'reactor-collapse.0'
      : deathProgress >= 0.38
        ? 'armor-explosion.0'
        : 'shell-crack-burst.0'
    : severeDamage && damageFrameStep % 3 === 2
      ? 'shell-crack-burst.0'
      : 'damage.spark.0';
  const damageVfxOffset = DAMAGE_VFX_OFFSETS[
    Math.floor(frame / 10) % DAMAGE_VFX_OFFSETS.length
  ];

  const portNeutral = FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.port.clawRest;
  const starboardNeutral = FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.starboard.clawRest;
  const portClawOffset = Object.freeze({
    x: portChain.claw.x - portNeutral.x,
    y: portChain.claw.y - portNeutral.y
  });
  const starboardClawOffset = Object.freeze({
    x: starboardChain.claw.x - starboardNeutral.x,
    y: starboardChain.claw.y - starboardNeutral.y
  });
  const portBaseAngle = Math.atan2(
    portNeutral.y - FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.port.spool.y,
    portNeutral.x - FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.port.spool.x
  );
  const starboardBaseAngle = Math.atan2(
    starboardNeutral.y - FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.starboard.spool.y,
    starboardNeutral.x - FRONTIER_CROWNCLAW_DESIGN_GEOMETRY.starboard.spool.x
  );

  const legPose = (side: FrontierCrownclawSide, index: number) => {
    const sideSign = side === 'port' ? -1 : 1;
    const phaseOffset = index * Math.PI * 2 / 3 + (side === 'port' ? 0 : Math.PI);
    const idle = Math.sin(breathPhase * 0.74 + phaseOffset) * 0.025 * reducedAmbient;
    const walk = isCrabwalk
      ? Math.sin(progress * Math.PI * 8 + phaseOffset) * 0.105 * crabwalkEnergy
      : 0;
    return freezeOverride({
      xOffset: crabwalkDirection * crabwalkEnergy * (index - 1) * 0.8,
      yOffset: Math.abs(Math.sin(progress * Math.PI * 8 + phaseOffset))
        * -1.8
        * crabwalkEnergy,
      rotationOffset: sideSign * (idle + walk + crabwalkStride * 0.2)
        + sideSign * deathBreak * (0.12 + index * 0.03),
      alpha: structuralAlpha
    });
  };

  const commonClawAlpha = structuralAlpha;
  const baseOverrides: Record<string, ModularBossPartPoseOverride> = {
    root: freezeOverride({
      xOffset: idleSway
        + crabwalkBodyShift
        + reactionDirection * stagger * 4.2
        + deathDirection * deathBreak * 9,
      yOffset: hover
        + entranceFold * -18
        + harpoonBrace * 1.8
        + stagger * 1.2
        + deathBreak * 13,
      rotationOffset: Math.sin(hoverPhase + Math.PI * 0.5) * 0.009 * reducedAmbient
        + crabwalkDirection * crabwalkEnergy * 0.022
        + reactionDirection * stagger * 0.035
        + deathDirection * deathBreak * 0.13
    }),
    body: freezeOverride({
      frameId: hullFrameId,
      yOffset: shellBreath * 8 + beamCharge * 1.5,
      rotationOffset: damageTremor + crabwalkDirection * crabwalkEnergy * 0.012,
      alpha: structuralAlpha,
      visible: structuralAlpha > 0.02,
      scaleXMultiplier: 1 + shellBreath - deathFade * 0.06,
      scaleYMultiplier: 1 - shellBreath * 0.7 - deathFade * 0.06
    }),
    'shell.port': freezeOverride({
      xOffset: -shellOpening * 8 - deathBreak * 6,
      yOffset: shellOpening * 1.5 + deathBreak * 3,
      rotationOffset: -shellOpening * 0.16 - deathBreak * 0.18,
      alpha: structuralAlpha
    }),
    'shell.starboard': freezeOverride({
      xOffset: shellOpening * 8 + deathBreak * 6,
      yOffset: shellOpening * 1.5 + deathBreak * 3,
      rotationOffset: shellOpening * 0.16 + deathBreak * 0.18,
      alpha: structuralAlpha
    }),
    crown: freezeOverride({
      yOffset: -crownLift * 8 - deathBreak * 4,
      rotationOffset: damageTremor * 0.5 - deathDirection * deathBreak * 0.08,
      alpha: structuralAlpha,
      scaleXMultiplier: 1 + crownLift * 0.035,
      scaleYMultiplier: 1 + crownLift * 0.035
    }),
    reactor: freezeOverride({
      frameId: reactorFrameId,
      yOffset: crownLift * 1.5,
      rotationOffset: phaseState.critical
        ? frame * 0.006 * (sequence % 2 === 0 ? -1 : 1)
        : 0,
      alpha: structuralAlpha,
      visible: structuralAlpha > 0.02,
      scaleXMultiplier: reactorEnergy,
      scaleYMultiplier: reactorEnergy
    }),
    'mandible.port': freezeOverride({
      rotationOffset: -mandibleBreath
        - portChain.clawOpenAmount * 0.13
        - beamCharge * 0.05
        - deathBreak * 0.16,
      alpha: structuralAlpha
    }),
    'mandible.starboard': freezeOverride({
      rotationOffset: mandibleBreath
        + starboardChain.clawOpenAmount * 0.13
        + beamCharge * 0.05
        + deathBreak * 0.16,
      alpha: structuralAlpha
    }),
    'leg.port.front': legPose('port', 0),
    'leg.port.mid': legPose('port', 1),
    'leg.port.rear': legPose('port', 2),
    'leg.starboard.front': legPose('starboard', 0),
    'leg.starboard.mid': legPose('starboard', 1),
    'leg.starboard.rear': legPose('starboard', 2),
    'claw.port.mount': freezeOverride({
      rotationOffset: -harpoonBrace * (portActive ? 0.08 : 0.025)
        - deathBreak * 0.22,
      alpha: commonClawAlpha
    }),
    'claw.starboard.mount': freezeOverride({
      rotationOffset: harpoonBrace * (starboardActive ? 0.08 : 0.025)
        + deathBreak * 0.22,
      alpha: commonClawAlpha
    }),
    'spool.port': freezeOverride({
      rotationOffset: portChain.spoolRotationRadians,
      alpha: structuralAlpha,
      scaleXMultiplier: 1 + portChain.tension * 0.06,
      scaleYMultiplier: 1 + portChain.tension * 0.06
    }),
    'spool.starboard': freezeOverride({
      rotationOffset: starboardChain.spoolRotationRadians,
      alpha: structuralAlpha,
      scaleXMultiplier: 1 + starboardChain.tension * 0.06,
      scaleYMultiplier: 1 + starboardChain.tension * 0.06
    }),
    'claw.port.palm': freezeOverride({
      frameId: resolveClawFrameId(portChain, portActive),
      xOffset: portClawOffset.x - deathBreak * 8,
      yOffset: portClawOffset.y + deathBreak * 7,
      rotationOffset: portChain.clawRotationRadians - portBaseAngle - deathBreak * 0.22,
      alpha: commonClawAlpha,
      visible: structuralAlpha > 0.02 && !portExternalHarpoon
    }),
    'claw.port.pincer.upper': freezeOverride({
      rotationOffset: -portChain.clawOpenAmount * 0.26 - deathBreak * 0.11,
      alpha: commonClawAlpha,
      visible: !portExternalHarpoon
    }),
    'claw.port.pincer.lower': freezeOverride({
      rotationOffset: portChain.clawOpenAmount * 0.21 + deathBreak * 0.13,
      alpha: commonClawAlpha,
      visible: !portExternalHarpoon
    }),
    'claw.starboard.palm': freezeOverride({
      frameId: resolveClawFrameId(starboardChain, starboardActive),
      xOffset: starboardClawOffset.x + deathBreak * 8,
      yOffset: starboardClawOffset.y + deathBreak * 7,
      rotationOffset: starboardChain.clawRotationRadians - starboardBaseAngle + deathBreak * 0.22,
      alpha: commonClawAlpha,
      visible: structuralAlpha > 0.02 && !starboardExternalHarpoon
    }),
    'claw.starboard.pincer.upper': freezeOverride({
      rotationOffset: starboardChain.clawOpenAmount * 0.26 + deathBreak * 0.11,
      alpha: commonClawAlpha,
      visible: !starboardExternalHarpoon
    }),
    'claw.starboard.pincer.lower': freezeOverride({
      rotationOffset: -starboardChain.clawOpenAmount * 0.21 - deathBreak * 0.13,
      alpha: commonClawAlpha,
      visible: !starboardExternalHarpoon
    }),
    'rear-appendage.port': freezeOverride({
      xOffset: -rearDeployment * 5 - deathBreak * 5,
      yOffset: rearDeployment * 3 + deathBreak * 8,
      rotationOffset: -rearDeployment * 0.34 - deathBreak * 0.18,
      visible: rearDeployment > 0.02,
      alpha: structuralAlpha * rearDeployment
    }),
    'rear-appendage.starboard': freezeOverride({
      xOffset: rearDeployment * 5 + deathBreak * 5,
      yOffset: rearDeployment * 3 + deathBreak * 8,
      rotationOffset: rearDeployment * 0.34 + deathBreak * 0.18,
      visible: rearDeployment > 0.02,
      alpha: structuralAlpha * rearDeployment
    }),
    'bastion.port': freezeOverride({
      xOffset: -crabwalkEnergy * 1.5,
      yOffset: crabwalkEnergy * 1.2,
      rotationOffset: -crabwalkEnergy * 0.055 - deathBreak * 0.14,
      alpha: structuralAlpha
    }),
    'bastion.starboard': freezeOverride({
      xOffset: crabwalkEnergy * 1.5,
      yOffset: crabwalkEnergy * 1.2,
      rotationOffset: crabwalkEnergy * 0.055 + deathBreak * 0.14,
      alpha: structuralAlpha
    }),
    beam: freezeOverride({
      frameId: beamFrameId,
      visible: beamVisible,
      alpha: beamVisible
        ? structuralAlpha * (0.88 + Math.sin(frame * 0.42) * 0.08)
        : 0,
      scaleXMultiplier: 1 + Math.sin(frame * 0.37) * 0.06,
      scaleYMultiplier: 1 + phaseState.chainOvercharge * 0.08
    }),
    'chain-contact': freezeOverride({
      frameId: chainContactFrameId ?? 'claw-impact.0',
      xOffset: chainContactSample?.claw.x ?? 0,
      yOffset: (chainContactSample?.claw.y ?? 58) - 58,
      visible: chainContactVisible,
      alpha: chainContactVisible ? structuralAlpha : 0,
      scaleXMultiplier: 1 + (chainContactSample?.tension ?? 0) * 0.14,
      scaleYMultiplier: 1 + (chainContactSample?.tension ?? 0) * 0.14
    }),
    'damage-vfx': freezeOverride({
      frameId: damageFrameId,
      xOffset: damageVfxOffset.x,
      yOffset: damageVfxOffset.y - 15,
      visible: damageVfxVisible,
      alpha: damageVfxVisible ? structuralAlpha : 0,
      scaleXMultiplier: severeDamage || isDeath ? 1.12 : 0.84,
      scaleYMultiplier: severeDamage || isDeath ? 1.12 : 0.84
    })
  };
  const chainOverrides = {
    ...buildChainOverrides(
      'port',
      portChain,
      structuralAlpha,
      phaseState.chainOvercharge,
      !portExternalHarpoon
    ),
    ...buildChainOverrides(
      'starboard',
      starboardChain,
      structuralAlpha,
      phaseState.chainOvercharge,
      !starboardExternalHarpoon
    )
  };
  const partOverrides = Object.freeze({
    ...baseOverrides,
    ...chainOverrides
  }) as ModularBossRigPoseOverrides;

  return Object.freeze({
    phaseTwo: phaseState.critical,
    shellOpening,
    crownLift,
    reactorEnergy,
    portChain,
    starboardChain,
    partOverrides
  });
};

export const sampleFrontierCrownclawModularPose = (
  input: PreviewBossModularPoseInput
): ModularBossRigPoseOverrides => (
  resolveFrontierCrownclawModularPose(input).partOverrides
);

/** Compile-time assertion and explicit sandbox artwork-registration export. */
export const sampleFrontierCrownclawSandboxPose: PreviewBossModularPoseSampler = (
  input
) => sampleFrontierCrownclawModularPose(input);
