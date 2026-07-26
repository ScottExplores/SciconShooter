import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';

export const GLOAMFORGE_MODULAR_PART_IDS = [
  'root',
  'body',
  'baffle.port',
  'baffle.starboard',
  'arm.port.mount',
  'arm.starboard.mount',
  'arm.port.shell',
  'arm.starboard.shell',
  'arm.port.inner',
  'arm.starboard.inner',
  'cannon.port',
  'cannon.starboard',
  'pod.port',
  'pod.starboard',
  'leg.outer-port',
  'leg.inner-port',
  'leg.inner-starboard',
  'leg.outer-starboard',
  'cleaver',
  'exhaust',
  'muzzle.port',
  'muzzle.starboard'
] as const;

export type GloamforgeModularPartId = (typeof GLOAMFORGE_MODULAR_PART_IDS)[number];

export const GLOAMFORGE_MODULAR_FRAME_IDS = [
  'body.closed',
  'body.open',
  'baffle.port',
  'baffle.starboard',
  'arm.port.shell',
  'arm.starboard.shell',
  'arm.port.inner',
  'arm.starboard.inner',
  'cannon.port.idle',
  'cannon.port.charge',
  'cannon.port.fire',
  'cannon.port.recover',
  'cannon.starboard.idle',
  'cannon.starboard.charge',
  'cannon.starboard.fire',
  'cannon.starboard.recover',
  'pod.port',
  'pod.starboard',
  'leg.outer-port',
  'leg.inner-port',
  'leg.inner-starboard',
  'leg.outer-starboard',
  'cleaver',
  'exhaust.small',
  'exhaust.medium',
  'exhaust.large',
  'muzzle.small',
  'muzzle.medium',
  'muzzle.burst'
] as const;

export type GloamforgeModularFrameId = (typeof GLOAMFORGE_MODULAR_FRAME_IDS)[number];

export const GLOAMFORGE_MODULAR_SOCKET_IDS = [
  'muzzle-port',
  'muzzle-starboard',
  'pod-port',
  'pod-starboard',
  'crucible-core',
  'cleaver-root'
] as const;

export type GloamforgeModularSocketId = (typeof GLOAMFORGE_MODULAR_SOCKET_IDS)[number];

export interface GloamforgeActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
  readonly motionCue?: string | null;
}

export interface GloamforgeModularPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly phaseIndex: number;
  /** Optional authored transition progress; phase two defaults to fully open. */
  readonly phaseProgress?: number | null;
  readonly action?: GloamforgeActionPresentation | null;
}

export type GloamforgeArmState = 'idle' | 'brace' | 'open' | 'return';
export type GloamforgeCannonState = 'idle' | 'charge' | 'fire' | 'recover';

export interface GloamforgeModularPose {
  readonly bodyFrameId: 'body.closed' | 'body.open';
  readonly portArmState: GloamforgeArmState;
  readonly starboardArmState: GloamforgeArmState;
  readonly portCannonState: GloamforgeCannonState;
  readonly starboardCannonState: GloamforgeCannonState;
  readonly portCannonFrameId:
    | 'cannon.port.idle'
    | 'cannon.port.charge'
    | 'cannon.port.fire'
    | 'cannon.port.recover';
  readonly starboardCannonFrameId:
    | 'cannon.starboard.idle'
    | 'cannon.starboard.charge'
    | 'cannon.starboard.fire'
    | 'cannon.starboard.recover';
  readonly exhaustFrameId: 'exhaust.small' | 'exhaust.medium' | 'exhaust.large';
  readonly muzzleFrameId: 'muzzle.small' | 'muzzle.medium' | 'muzzle.burst';
  readonly portPodDetach: number;
  readonly starboardPodDetach: number;
  readonly cleaverDeployment: number;
  readonly phaseTwo: boolean;
  /** Feed directly into resolveModularBossRigHierarchy. */
  readonly partOverrides: ModularBossRigPoseOverrides;
}

export interface GloamforgeRigCompatibilityIssue {
  readonly path: string;
  readonly message: string;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const selectedSides = (action: GloamforgeActionPresentation | null | undefined) => {
  const motionCue = String(action?.motionCue ?? '').toLowerCase();
  if (motionCue === 'gatling-barrage' || motionCue === 'paired-cannons') {
    return Object.freeze({ port: true, starboard: true });
  }
  const side = action?.side;
  if (side === 'port' || side === 'left') {
    return Object.freeze({ port: true, starboard: false });
  }
  if (side === 'starboard' || side === 'right') {
    return Object.freeze({ port: false, starboard: true });
  }
  return Object.freeze({ port: true, starboard: true });
};

const sampleArmState = (
  selected: boolean,
  stage: string
): GloamforgeArmState => {
  if (!selected) return 'idle';
  if (stage === 'warning') return 'brace';
  if (stage === 'fire') return 'open';
  if (stage === 'recovery' || stage === 'cooldown') return 'return';
  return 'idle';
};

const sampleCannonState = (
  selected: boolean,
  stage: string,
  pulseIndex: number,
  progress: number
): GloamforgeCannonState => {
  if (!selected) return 'idle';
  if (stage === 'warning') return 'charge';
  if (stage === 'fire') return pulseIndex < 2 ? 'fire' : 'recover';
  if ((stage === 'recovery' || stage === 'cooldown') && progress < 0.72) return 'recover';
  return 'idle';
};

const cannonFrameId = <Side extends 'port' | 'starboard'>(
  side: Side,
  state: GloamforgeCannonState
): `cannon.${Side}.${GloamforgeCannonState}` => `cannon.${side}.${state}`;

const actionEnvelope = (stage: string, progress: number) => {
  if (stage === 'warning') return Math.sin(progress * Math.PI * 0.5);
  if (stage === 'fire') return 1 - progress * 0.38;
  if (stage === 'recovery' || stage === 'cooldown') return 1 - progress;
  return 0;
};

/**
 * Checks that a generic modular registration carries the complete Gloamforge
 * visual vocabulary and that attack sockets remain attached to the anatomy
 * that visibly emits each attack.
 */
export const validateGloamforgeRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly GloamforgeRigCompatibilityIssue[] => {
  const issues: GloamforgeRigCompatibilityIssue[] = [];
  GLOAMFORGE_MODULAR_PART_IDS.forEach((partId) => {
    if (!registration.partById[partId]) {
      issues.push(Object.freeze({ path: `/parts/${partId}`, message: `Missing Gloamforge part ${partId}.` }));
    }
  });
  GLOAMFORGE_MODULAR_FRAME_IDS.forEach((frameId) => {
    if (!registration.frameById[frameId]) {
      issues.push(Object.freeze({ path: `/frames/${frameId}`, message: `Missing Gloamforge frame ${frameId}.` }));
    }
  });
  const expectedSockets = Object.freeze({
    'muzzle-port': Object.freeze({ partId: 'cannon.port', role: 'projectile-muzzle' }),
    'muzzle-starboard': Object.freeze({ partId: 'cannon.starboard', role: 'projectile-muzzle' }),
    'pod-port': Object.freeze({ partId: 'pod.port', role: 'detachable-pod' }),
    'pod-starboard': Object.freeze({ partId: 'pod.starboard', role: 'detachable-pod' }),
    'crucible-core': Object.freeze({ partId: 'body', role: 'core-origin' }),
    'cleaver-root': Object.freeze({ partId: 'body', role: 'melee-root' })
  } as const);
  GLOAMFORGE_MODULAR_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    const expected = expectedSockets[socketId];
    if (!socket) {
      issues.push(Object.freeze({ path: `/sockets/${socketId}`, message: `Missing Gloamforge socket ${socketId}.` }));
      return;
    }
    if (socket.partId !== expected.partId) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}/partId`,
        message: `${socketId} must follow ${expected.partId}, not ${socket.partId}.`
      }));
    }
    if (socket.role !== expected.role) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}/role`,
        message: `${socketId} must use the ${expected.role} role.`
      }));
    }
  });
  return Object.freeze(issues);
};

/**
 * Pure, simulation-frame-driven presentation sampling for the Gloamforge
 * modular assembly. It never mutates gameplay state or reads wall time.
 */
export const sampleGloamforgeModularPose = (
  input: GloamforgeModularPoseInput
): GloamforgeModularPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = Math.max(1, Math.floor(finiteOr(input.phaseIndex, 1)));
  const pressure = 1 - healthRatio;
  const action = input.action;
  const stage = String(action?.stage ?? '').toLowerCase();
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const motionCue = String(action?.motionCue ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const selection = selectedSides(action);
  const phaseTwo = phaseIndex >= 2 || healthRatio <= 0.34;
  const healthDrivenDeployment = clamp((0.4 - healthRatio) / 0.12, 0, 1);
  const phaseDeployment = phaseIndex >= 2
    ? clamp(finiteOr(input.phaseProgress, 1), 0, 1)
    : healthDrivenDeployment;
  const actionEnergy = actionEnvelope(stage, progress);
  const heavyCannon = motionCue === 'heavy-cannon';
  const gatling = motionCue === 'gatling-barrage';
  const pulseHold = heavyCannon ? 5 : gatling ? 2 : 3;
  const pulseIndex = Math.floor(frame / pulseHold + sequence) % 4;
  const portArmState = sampleArmState(selection.port, stage);
  const starboardArmState = sampleArmState(selection.starboard, stage);
  const portCannonState = sampleCannonState(selection.port, stage, pulseIndex, progress);
  const starboardCannonState = sampleCannonState(selection.starboard, stage, pulseIndex, progress);
  const portCannonFrameId = cannonFrameId('port', portCannonState);
  const starboardCannonFrameId = cannonFrameId('starboard', starboardCannonState);
  const openAttack = primitiveId === 'gap-ring'
    || primitiveId === 'cross-beam'
    || primitiveId === 'rotating-cross'
    || primitiveId === 'rail-sweep'
    || motionCue.includes('crucible')
    || motionCue.includes('cleaver');
  const bodyOpen = phaseTwo || (openAttack && actionEnergy >= 0.32);
  const bodyFrameId = bodyOpen ? 'body.open' : 'body.closed';
  const ambientScale = input.reducedMotion ? 0.24 : 1;
  const bodyBob = Math.sin(frame * (0.038 + pressure * 0.006))
    * (3.2 + pressure * 1.8)
    * ambientScale;
  const bodySway = Math.sin(frame * 0.018) * (5 + pressure * 2) * ambientScale;
  const bodyRoll = Math.sin(frame * 0.018 + Math.PI * 0.5) * 0.022 * ambientScale;
  const braceEnergy = stage === 'warning' ? actionEnergy : 0;
  const openEnergy = stage === 'fire'
    ? actionEnergy
    : stage === 'recovery' || stage === 'cooldown'
      ? actionEnergy * 0.82
      : 0;
  const portArmRotation = selection.port ? braceEnergy * 0.18 - openEnergy * 0.26 : 0;
  const starboardArmRotation = selection.starboard ? -braceEnergy * 0.18 + openEnergy * 0.26 : 0;
  const portCannonRecoil = portCannonState === 'fire'
    ? actionEnergy * 4
    : portCannonState === 'recover'
      ? actionEnergy * 8
      : 0;
  const starboardCannonRecoil = starboardCannonState === 'fire'
    ? actionEnergy * 4
    : starboardCannonState === 'recover'
      ? actionEnergy * 8
      : 0;
  const podAction = primitiveId === 'pod-volley' || motionCue === 'slag-pods';
  const detachEnvelope = podAction
    ? stage === 'fire'
      ? easeOutCubic(progress)
      : stage === 'recovery' || stage === 'cooldown'
        ? 1 - easeOutCubic(progress)
        : 0
    : 0;
  const sequenceLeadsPort = sequence % 2 === 0;
  const bothPodsSelected = selection.port && selection.starboard;
  const portPodDetach = bothPodsSelected
    ? detachEnvelope * (sequenceLeadsPort ? 1 : 0.65)
    : selection.port ? detachEnvelope : 0;
  const starboardPodDetach = bothPodsSelected
    ? detachEnvelope * (sequenceLeadsPort ? 0.65 : 1)
    : selection.starboard ? detachEnvelope : 0;
  const gait = frame * (0.052 + pressure * 0.012);
  const gaitAmplitude = (0.075 + pressure * 0.025) * ambientScale;
  const actionBrace = Math.max(braceEnergy * 0.055, openEnergy * 0.025);
  const exhaustHold = phaseTwo ? (input.reducedMotion ? 5 : 3) : (input.reducedMotion ? 8 : 5);
  const exhaustIndex = Math.floor(frame / exhaustHold) % 3;
  const exhaustFrameId = (
    ['exhaust.small', 'exhaust.medium', 'exhaust.large'] as const
  )[exhaustIndex];
  const muzzleIndex = Math.floor(frame / (gatling ? 1 : 2) + sequence) % 3;
  const muzzleFrameId = (
    ['muzzle.small', 'muzzle.medium', 'muzzle.burst'] as const
  )[muzzleIndex];
  const portMuzzleVisible = stage === 'fire' && selection.port && portCannonState === 'fire';
  const starboardMuzzleVisible = stage === 'fire'
    && selection.starboard
    && starboardCannonState === 'fire';
  const cleaverAction = primitiveId === 'tail-fan'
    || primitiveId === 'rail-sweep'
    || primitiveId === 'cross-beam'
    || motionCue.includes('cleaver');
  const cleaverAttackRotation = cleaverAction
    ? stage === 'warning'
      ? -0.42 * actionEnergy
      : stage === 'fire'
        ? -0.72 + progress * 1.44
        : stage === 'recovery' || stage === 'cooldown'
          ? 0.72 * (1 - progress)
          : 0
    : 0;
  const cleaverDeployment = phaseTwo ? phaseDeployment : 0;
  const baffleDeployment = phaseTwo ? phaseDeployment : Math.max(0, braceEnergy * 0.24);

  const partOverrides = Object.freeze({
    root: freezeOverride({
      xOffset: bodySway,
      yOffset: bodyBob,
      rotationOffset: bodyRoll
    }),
    body: freezeOverride({
      frameId: bodyFrameId
    }),
    'baffle.port': freezeOverride({
      rotationOffset: -0.16 * baffleDeployment,
      xOffset: -10 * baffleDeployment,
      alpha: clamp(0.72 + baffleDeployment * 0.28, 0, 1),
      visible: baffleDeployment > 0.001
    }),
    'baffle.starboard': freezeOverride({
      rotationOffset: 0.16 * baffleDeployment,
      xOffset: 10 * baffleDeployment,
      alpha: clamp(0.72 + baffleDeployment * 0.28, 0, 1),
      visible: baffleDeployment > 0.001
    }),
    'arm.port.mount': freezeOverride({
      rotationOffset: portArmRotation,
      xOffset: -openEnergy * (selection.port ? 7 : 0)
    }),
    'arm.starboard.mount': freezeOverride({
      rotationOffset: starboardArmRotation,
      xOffset: openEnergy * (selection.starboard ? 7 : 0)
    }),
    'arm.port.shell': freezeOverride({}),
    'arm.starboard.shell': freezeOverride({}),
    'arm.port.inner': freezeOverride({ rotationOffset: portArmRotation * 0.62 }),
    'arm.starboard.inner': freezeOverride({ rotationOffset: starboardArmRotation * 0.62 }),
    'cannon.port': freezeOverride({
      frameId: portCannonFrameId,
      yOffset: -portCannonRecoil,
      rotationOffset: portCannonRecoil * -0.004
    }),
    'cannon.starboard': freezeOverride({
      frameId: starboardCannonFrameId,
      yOffset: -starboardCannonRecoil,
      rotationOffset: starboardCannonRecoil * 0.004
    }),
    'pod.port': freezeOverride({
      xOffset: -portPodDetach * 18,
      yOffset: portPodDetach * 46,
      rotationOffset: -portPodDetach * 0.32,
      alpha: clamp(1 - portPodDetach * 0.82, 0, 1),
      scaleXMultiplier: 1 - portPodDetach * 0.18,
      scaleYMultiplier: 1 - portPodDetach * 0.18
    }),
    'pod.starboard': freezeOverride({
      xOffset: starboardPodDetach * 18,
      yOffset: starboardPodDetach * 46,
      rotationOffset: starboardPodDetach * 0.32,
      alpha: clamp(1 - starboardPodDetach * 0.82, 0, 1),
      scaleXMultiplier: 1 - starboardPodDetach * 0.18,
      scaleYMultiplier: 1 - starboardPodDetach * 0.18
    }),
    'leg.outer-port': freezeOverride({
      rotationOffset: Math.sin(gait) * gaitAmplitude - actionBrace
    }),
    'leg.inner-port': freezeOverride({
      rotationOffset: Math.sin(gait + Math.PI) * gaitAmplitude * 0.78 + actionBrace * 0.72
    }),
    'leg.inner-starboard': freezeOverride({
      rotationOffset: -Math.sin(gait) * gaitAmplitude * 0.78 - actionBrace * 0.72
    }),
    'leg.outer-starboard': freezeOverride({
      rotationOffset: -Math.sin(gait + Math.PI) * gaitAmplitude + actionBrace
    }),
    cleaver: freezeOverride({
      visible: cleaverDeployment > 0.001,
      alpha: cleaverDeployment,
      yOffset: (1 - cleaverDeployment) * -26,
      rotationOffset: (1 - cleaverDeployment) * -0.36 + cleaverAttackRotation,
      scaleXMultiplier: 0.58 + cleaverDeployment * 0.42,
      scaleYMultiplier: 0.58 + cleaverDeployment * 0.42
    }),
    exhaust: freezeOverride({
      frameId: exhaustFrameId,
      scaleXMultiplier: 0.92 + pressure * 0.1 + (phaseTwo ? 0.12 : 0),
      scaleYMultiplier: 0.92 + pressure * 0.1 + (phaseTwo ? 0.18 : 0)
    }),
    'muzzle.port': freezeOverride({
      visible: portMuzzleVisible,
      alpha: portMuzzleVisible ? 1 : 0,
      frameId: muzzleFrameId,
      scaleXMultiplier: heavyCannon ? 1.28 : 1,
      scaleYMultiplier: heavyCannon ? 1.28 : 1
    }),
    'muzzle.starboard': freezeOverride({
      visible: starboardMuzzleVisible,
      alpha: starboardMuzzleVisible ? 1 : 0,
      frameId: muzzleFrameId,
      scaleXMultiplier: heavyCannon ? 1.28 : 1,
      scaleYMultiplier: heavyCannon ? 1.28 : 1
    })
  } satisfies Record<GloamforgeModularPartId, ModularBossPartPoseOverride>);

  return Object.freeze({
    bodyFrameId,
    portArmState,
    starboardArmState,
    portCannonState,
    starboardCannonState,
    portCannonFrameId,
    starboardCannonFrameId,
    exhaustFrameId,
    muzzleFrameId,
    portPodDetach,
    starboardPodDetach,
    cleaverDeployment,
    phaseTwo,
    partOverrides
  });
};
