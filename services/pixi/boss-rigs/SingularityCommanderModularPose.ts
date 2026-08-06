import { SINGULARITY_PRIMITIVE_IDS } from '../../gameplay/bosses/SingularityCommanderRuntime';
import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';
import type { PreviewBossModularPoseInput } from './PreviewBossRigContracts';

export const SINGULARITY_COMMANDER_PART_IDS = Object.freeze([
  'root',
  'rear-armor',
  'pylon.port.mount',
  'pylon.port',
  'pylon.starboard.mount',
  'pylon.starboard',
  'claw.port.mount',
  'claw.port',
  'claw.starboard.mount',
  'claw.starboard',
  'body',
  'core',
  'effect.gravity-seed',
  'effect.beam',
  'effect.claw.port',
  'effect.claw.starboard',
  'effect.pylon.port',
  'effect.pylon.starboard',
  'effect.damage.sparks',
  'effect.damage.wisps',
  'effect.damage.debris',
  'effect.phase-distortion'
] as const);

export type SingularityCommanderPartId = (
  typeof SINGULARITY_COMMANDER_PART_IDS
)[number];

export const SINGULARITY_COMMANDER_SOCKET_IDS = Object.freeze([
  'pylon-muzzle-upper-port',
  'pylon-muzzle-lower-port',
  'pylon-muzzle-lower-starboard',
  'pylon-muzzle-upper-starboard',
  'singularity-core',
  'claw-tip-port',
  'claw-tip-starboard',
  'gravity-seed-origin'
] as const);

export type SingularityCommanderSocketId = (
  typeof SINGULARITY_COMMANDER_SOCKET_IDS
)[number];

export interface SingularityCommanderRigCompatibilityIssue {
  readonly path: string;
  readonly message: string;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const smoothstep = (value: number) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const sampleActionEnergy = (stage: string, progress: number) => {
  if (stage === 'preparation') return smoothstep(progress) * 0.62;
  if (stage === 'telegraph' || stage === 'warning') return 0.62 + smoothstep(progress) * 0.38;
  if (stage === 'fire') return 1;
  if (stage === 'recovery' || stage === 'cooldown') return 1 - smoothstep(progress);
  return 0;
};

const CORE_FRAME_CENTERS_X: Readonly<Record<string, number>> = Object.freeze({
  'core.idle.dark': 73,
  'core.idle.pulse': 65,
  'core.charge.begin': 67,
  'core.charge.full': 49.5,
  'core.beam.fire': 73,
  'core.pulse.fire': 64,
  'core.damage.unstable': 67,
  'core.shutdown': 49
});

const resolveCoreFrame = ({
  primitiveId,
  stage,
  progress,
  frame,
  critical
}: Readonly<{
  primitiveId: string;
  stage: string;
  progress: number;
  frame: number;
  critical: boolean;
}>) => {
  if (primitiveId === SINGULARITY_PRIMITIVE_IDS['gravity-collapse']) {
    return stage === 'recovery' || stage === 'complete'
      ? 'core.shutdown'
      : progress > 0.55 || stage === 'fire'
        ? 'core.damage.unstable'
        : 'core.charge.full';
  }
  if (primitiveId === SINGULARITY_PRIMITIVE_IDS['event-horizon-gaze']) {
    if (stage === 'fire') return 'core.beam.fire';
    if (stage === 'recovery' || stage === 'cooldown') return 'core.idle.dark';
    return progress > 0.5 ? 'core.charge.full' : 'core.charge.begin';
  }
  if (primitiveId === SINGULARITY_PRIMITIVE_IDS['singularity-pulse']) {
    return stage === 'fire'
      ? 'core.pulse.fire'
      : progress > 0.48
        ? 'core.charge.full'
        : 'core.charge.begin';
  }
  if (primitiveId === SINGULARITY_PRIMITIVE_IDS['gravity-well-genesis']) {
    return stage === 'fire'
      ? 'core.pulse.fire'
      : progress > 0.5
        ? 'core.charge.full'
        : 'core.charge.begin';
  }
  if (critical) return 'core.damage.unstable';
  return Math.floor(frame / 12) % 2 === 0 ? 'core.idle.dark' : 'core.idle.pulse';
};

/**
 * Verifies the fixed anatomy needed by the gravity runtime. This stays pure so
 * production and focused tests can prove that every damaging origin remains
 * attached to visible, articulated art.
 */
export const validateSingularityCommanderRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly SingularityCommanderRigCompatibilityIssue[] => {
  const issues: SingularityCommanderRigCompatibilityIssue[] = [];
  SINGULARITY_COMMANDER_PART_IDS.forEach((partId) => {
    if (!registration.partById[partId]) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Singularity Commander part ${partId}.`
      }));
    }
  });
  const expectedParents = Object.freeze({
    'pylon.port': 'pylon.port.mount',
    'pylon.starboard': 'pylon.starboard.mount',
    'claw.port': 'claw.port.mount',
    'claw.starboard': 'claw.starboard.mount',
    core: 'body',
    'effect.gravity-seed': 'core',
    'effect.beam': 'body',
    'effect.claw.port': 'claw.port',
    'effect.claw.starboard': 'claw.starboard',
    'effect.pylon.port': 'pylon.port',
    'effect.pylon.starboard': 'pylon.starboard'
  } as const);
  Object.entries(expectedParents).forEach(([partId, parentId]) => {
    const part = registration.partById[partId];
    if (part && part.parentId !== parentId) {
      issues.push(Object.freeze({
        path: `/parts/${partId}/parentId`,
        message: `${partId} must remain parented to ${parentId}.`
      }));
    }
  });
  const expectedSockets = Object.freeze({
    'pylon-muzzle-upper-port': Object.freeze({ partId: 'pylon.port', role: 'projectile-muzzle' }),
    'pylon-muzzle-lower-port': Object.freeze({ partId: 'pylon.port', role: 'projectile-muzzle' }),
    'pylon-muzzle-lower-starboard': Object.freeze({ partId: 'pylon.starboard', role: 'projectile-muzzle' }),
    'pylon-muzzle-upper-starboard': Object.freeze({ partId: 'pylon.starboard', role: 'projectile-muzzle' }),
    'singularity-core': Object.freeze({ partId: 'core', role: 'core-origin' }),
    'claw-tip-port': Object.freeze({ partId: 'claw.port', role: 'melee-root' }),
    'claw-tip-starboard': Object.freeze({ partId: 'claw.starboard', role: 'melee-root' }),
    'gravity-seed-origin': Object.freeze({ partId: 'core', role: 'core-origin' })
  } as const);
  SINGULARITY_COMMANDER_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    const expected = expectedSockets[socketId];
    if (!socket) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Singularity Commander socket ${socketId}.`
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

/**
 * Deterministic, fixed-step pose sampling for the Singularity Reach Commander.
 * The modular rig owns its living idle, visible preparation, anatomy recoil,
 * phase pressure, restrained large-hit response, and critical instability.
 */
export const sampleSingularityCommanderModularPose = (
  input: PreviewBossModularPoseInput
): ModularBossRigPoseOverrides => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = clamp(Math.floor(finiteOr(input.phaseIndex, 1)), 1, 3);
  const damageStage = clamp(Math.floor(finiteOr(input.damageStage, 0)), 0, 5);
  const entrance = smoothstep(finiteOr(input.entranceProgress, 1));
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const stage = String(action?.stage ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const actionEnergy = sampleActionEnergy(stage, progress);
  const pressure = 1 - healthRatio;
  const critical = phaseIndex >= 3 || healthRatio <= 0.35 || damageStage >= 4;
  const reducedScale = input.reducedMotion ? 0.28 : 1;
  const hover = Math.sin(frame * 0.035) * 2.4 * reducedScale;
  const drift = Math.sin(frame * 0.016 + 0.72) * 2 * reducedScale;
  const breathing = Math.sin(frame * 0.047 + 0.18) * reducedScale;
  const instability = critical
    ? Math.sin(frame * 0.129 + 0.7) * (1.4 + pressure * 1.8) * reducedScale
    : 0;
  const entranceFold = 1 - entrance;
  const reactionProgress = clamp(finiteOr(input.reaction?.progress, 1), 0, 1);
  const reactionEnergy = input.reaction
    ? Math.sin(reactionProgress * Math.PI)
      * clamp(finiteOr(input.reaction.strength, 0), 0, 2)
      * (input.reaction.kind === 'stagger' ? 1 : 0.46)
    : 0;
  const reactionDirection = input.reaction?.direction ?? 1;
  const phaseSpread = phaseIndex === 1 ? 0 : phaseIndex === 2 ? 7 : 12;
  const isWell = primitiveId === SINGULARITY_PRIMITIVE_IDS['gravity-well-genesis'];
  const isBeam = primitiveId === SINGULARITY_PRIMITIVE_IDS['event-horizon-gaze'];
  const isPincer = primitiveId === SINGULARITY_PRIMITIVE_IDS['tidal-claw-pincer'];
  const isPylon = primitiveId === SINGULARITY_PRIMITIVE_IDS['orbital-pylon-barrage'];
  const isPulse = primitiveId === SINGULARITY_PRIMITIVE_IDS['singularity-pulse'];
  const isCollapse = primitiveId === SINGULARITY_PRIMITIVE_IDS['gravity-collapse'];
  const pincerClose = isPincer
    ? stage === 'fire'
      ? Math.sin(progress * Math.PI * 0.82)
      : actionEnergy * 0.52
    : 0;
  const pylonAim = isPylon ? actionEnergy : 0;
  const pylonRecoil = isPylon && stage === 'fire'
    ? Math.max(0, Math.sin((frame + Math.floor(finiteOr(action?.sequence, 0)) * 7) * 0.78))
    : 0;
  const coreBloom = isWell || isBeam || isPulse || isCollapse ? actionEnergy : 0;
  const collapseStrain = isCollapse ? actionEnergy : 0;
  const coreFrameId = resolveCoreFrame({
    primitiveId,
    stage,
    progress,
    frame,
    critical
  });
  const coreCenterCorrection = 64 - (CORE_FRAME_CENTERS_X[coreFrameId] ?? 64);
  const showGravitySeed = isWell && (stage === 'preparation' || stage === 'telegraph' || stage === 'warning');
  const showBeam = isBeam && stage === 'fire';
  const showClawEffects = isPincer && actionEnergy > 0.08;
  const showPylonEffects = isPylon && actionEnergy > 0.08;
  const showSparks = damageStage >= 2 || healthRatio <= 0.58;
  const showWisps = damageStage >= 3 || healthRatio <= 0.42;
  const showDebris = critical;
  const showDistortion = phaseIndex >= 2 && (
    isCollapse
    || (stage === 'telegraph' || stage === 'warning') && (isBeam || isPulse)
  );

  return Object.freeze({
    root: freezeOverride({
      xOffset: drift + instability + reactionDirection * reactionEnergy * 4.2,
      yOffset: hover + entranceFold * -26 + reactionEnergy * 1.4,
      rotationOffset: drift * 0.006 + instability * 0.006 + reactionDirection * reactionEnergy * 0.035
    }),
    'rear-armor': freezeOverride({
      yOffset: breathing * -0.9,
      rotationOffset: breathing * 0.008
    }),
    'pylon.port.mount': freezeOverride({
      xOffset: -phaseSpread + entranceFold * 22 - collapseStrain * 11,
      yOffset: breathing * 1.2 + entranceFold * 20 - pylonRecoil * 4,
      rotationOffset: entranceFold * 0.35 - phaseSpread * 0.004 - pylonAim * 0.13 - collapseStrain * 0.08
    }),
    'pylon.port': freezeOverride({}),
    'pylon.starboard.mount': freezeOverride({
      xOffset: phaseSpread - entranceFold * 22 + collapseStrain * 11,
      yOffset: -breathing * 1.2 + entranceFold * 20 - pylonRecoil * 4,
      rotationOffset: -entranceFold * 0.35 + phaseSpread * 0.004 + pylonAim * 0.13 + collapseStrain * 0.08
    }),
    'pylon.starboard': freezeOverride({}),
    'claw.port.mount': freezeOverride({
      xOffset: -phaseSpread * 0.7 + entranceFold * 27 + pincerClose * 31 - collapseStrain * 14,
      yOffset: -breathing * 1.5 - entranceFold * 15 + pincerClose * 13,
      rotationOffset: entranceFold * 0.5 + pincerClose * 0.52 - collapseStrain * 0.12
    }),
    'claw.port': freezeOverride({}),
    'claw.starboard.mount': freezeOverride({
      xOffset: phaseSpread * 0.7 - entranceFold * 27 - pincerClose * 31 + collapseStrain * 14,
      yOffset: breathing * 1.5 - entranceFold * 15 + pincerClose * 13,
      rotationOffset: -entranceFold * 0.5 - pincerClose * 0.52 + collapseStrain * 0.12
    }),
    'claw.starboard': freezeOverride({}),
    body: freezeOverride({
      yOffset: -breathing * 0.8,
      rotationOffset: instability * 0.003,
      scaleXMultiplier: 1 + coreBloom * 0.018,
      scaleYMultiplier: 1 + coreBloom * 0.012
    }),
    core: freezeOverride({
      frameId: coreFrameId,
      xOffset: coreCenterCorrection,
      yOffset: breathing * 0.7,
      rotationOffset: frame * (critical ? -0.008 : 0.005),
      scaleXMultiplier: 1 + coreBloom * 0.11,
      scaleYMultiplier: 1 + coreBloom * 0.11
    }),
    'effect.gravity-seed': freezeOverride({
      frameId: progress > 0.55 ? 'well.warning' : 'well.seed',
      visible: showGravitySeed,
      alpha: showGravitySeed ? 0.72 + actionEnergy * 0.28 : 0,
      scaleXMultiplier: 0.9 + actionEnergy * 0.72,
      scaleYMultiplier: 0.9 + actionEnergy * 0.72,
      rotationOffset: frame * 0.018
    }),
    'effect.beam': freezeOverride({
      frameId: stage === 'fire' && progress > 0.72 ? 'beam.glow' : 'beam.startup',
      visible: showBeam,
      alpha: showBeam ? 1 : 0,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1 + progress * 0.54
    }),
    'effect.claw.port': freezeOverride({
      frameId: stage === 'fire' ? 'claw.slash' : 'claw.charge',
      visible: showClawEffects,
      alpha: showClawEffects ? 0.84 + actionEnergy * 0.16 : 0,
      rotationOffset: -0.38,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.claw.starboard': freezeOverride({
      frameId: stage === 'fire' ? 'claw.slash' : 'claw.charge',
      visible: showClawEffects,
      alpha: showClawEffects ? 0.84 + actionEnergy * 0.16 : 0,
      rotationOffset: 0.38,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.pylon.port': freezeOverride({
      frameId: stage === 'fire' ? 'pylon.muzzle' : 'pylon.charge',
      visible: showPylonEffects,
      alpha: showPylonEffects ? 1 : 0,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.pylon.starboard': freezeOverride({
      frameId: stage === 'fire' ? 'pylon.muzzle' : 'pylon.charge',
      visible: showPylonEffects,
      alpha: showPylonEffects ? 1 : 0,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.damage.sparks': freezeOverride({
      visible: showSparks,
      alpha: showSparks ? 0.58 + Math.abs(Math.sin(frame * 0.23)) * 0.42 : 0,
      rotationOffset: frame * 0.014,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.damage.wisps': freezeOverride({
      visible: showWisps,
      alpha: showWisps ? 0.5 + Math.abs(Math.sin(frame * 0.17 + 0.8)) * 0.42 : 0,
      yOffset: Math.sin(frame * 0.04) * 3,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.damage.debris': freezeOverride({
      visible: showDebris,
      alpha: showDebris ? 0.48 + Math.abs(Math.sin(frame * 0.11)) * 0.4 : 0,
      rotationOffset: frame * -0.021,
      scaleXMultiplier: 1,
      scaleYMultiplier: 1
    }),
    'effect.phase-distortion': freezeOverride({
      visible: showDistortion,
      alpha: showDistortion ? 0.28 + actionEnergy * 0.45 : 0,
      rotationOffset: frame * 0.009,
      scaleXMultiplier: 1 + actionEnergy * 0.21,
      scaleYMultiplier: 1 + actionEnergy * 0.21
    })
  } satisfies Record<SingularityCommanderPartId, ModularBossPartPoseOverride>);
};
