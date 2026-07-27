import {
  HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
  resolveHeliosCrossfireSides,
  sampleHeliosCornerClamp,
  sampleHeliosCrossfirePulse,
  sampleHeliosMachineGunChannelPulse,
  sampleHeliosTrackingPincer
} from '../../gameplay/bosses/HeliosClawcarrierRuntime';
import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';

export const HELIOS_MODULAR_PART_IDS = [
  'root',
  'claw.port.mount',
  'claw.port',
  'claw.starboard.mount',
  'claw.starboard',
  'mandible.port',
  'mandible.starboard',
  'body',
  'leg.outer-port',
  'leg.inner-port',
  'leg.inner-starboard',
  'leg.outer-starboard',
  'reactor',
  'weapons.mount',
  'rotary.port',
  'rotary.starboard',
  'muzzle.port',
  'muzzle.starboard'
] as const;

export type HeliosModularPartId = (typeof HELIOS_MODULAR_PART_IDS)[number];

export const HELIOS_ROTARY_PORT_FRAME_IDS = [
  'rotary.port.0',
  'rotary.port.1',
  'rotary.port.2',
  'rotary.port.3'
] as const;

export const HELIOS_ROTARY_STARBOARD_FRAME_IDS = [
  'rotary.starboard.0',
  'rotary.starboard.1',
  'rotary.starboard.2',
  'rotary.starboard.3'
] as const;

export const HELIOS_MUZZLE_FRAME_IDS = [
  'muzzle.flash.2'
] as const;

export const HELIOS_MODULAR_SOCKET_IDS = [
  'heavy-muzzle-port',
  'heavy-muzzle-starboard',
  'rotary-muzzle-port',
  'rotary-muzzle-starboard',
  'reactor-core',
  'claw-joint-port',
  'claw-joint-starboard',
  'claw-tip-port',
  'claw-tip-starboard'
] as const;

export interface HeliosActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
  readonly motionCue?: string | null;
  readonly elapsedFrames?: number | null;
  readonly framesPerSecond?: number | null;
  readonly durationFrames?: number | null;
  readonly projectileCount?: number | null;
  readonly shotIntervalFrames?: number | null;
}

export interface HeliosModularPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly phaseIndex: number;
  readonly entranceProgress?: number | null;
  readonly damageStage?: number | null;
  readonly reaction?: {
    readonly kind: 'impact' | 'stagger';
    readonly progress: number;
    readonly direction: -1 | 1;
    readonly strength: number;
  } | null;
  readonly action?: HeliosActionPresentation | null;
}

export interface HeliosModularPose {
  readonly bodyFrameId: 'body.closed' | 'body.open' | 'body.damaged';
  readonly portRotaryFrameId: (typeof HELIOS_ROTARY_PORT_FRAME_IDS)[number];
  readonly starboardRotaryFrameId: (typeof HELIOS_ROTARY_STARBOARD_FRAME_IDS)[number];
  readonly rotarySpinEnergy: number;
  readonly reactorOpen: boolean;
  readonly partOverrides: ModularBossRigPoseOverrides;
}

export interface HeliosRigCompatibilityIssue {
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
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const actionEnvelope = (stage: string, progress: number) => {
  if (stage === 'warning') return smoothstep(progress);
  if (stage === 'fire') return 1;
  if (stage === 'recovery' || stage === 'cooldown') return 1 - smoothstep(progress);
  return 0;
};

export const validateHeliosRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly HeliosRigCompatibilityIssue[] => {
  const issues: HeliosRigCompatibilityIssue[] = [];
  HELIOS_MODULAR_PART_IDS.forEach((partId) => {
    if (!registration.partById[partId]) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Helios part ${partId}.`
      }));
    }
  });
  const expectedParents = Object.freeze({
    'weapons.mount': 'body',
    'rotary.port': 'weapons.mount',
    'rotary.starboard': 'weapons.mount',
    'muzzle.port': 'rotary.port',
    'muzzle.starboard': 'rotary.starboard'
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
    'heavy-muzzle-port': Object.freeze({ partId: 'rotary.port', role: 'projectile-muzzle' }),
    'heavy-muzzle-starboard': Object.freeze({ partId: 'rotary.starboard', role: 'projectile-muzzle' }),
    'rotary-muzzle-port': Object.freeze({ partId: 'rotary.port', role: 'projectile-muzzle' }),
    'rotary-muzzle-starboard': Object.freeze({ partId: 'rotary.starboard', role: 'projectile-muzzle' }),
    'reactor-core': Object.freeze({ partId: 'body', role: 'core-origin' }),
    'claw-joint-port': Object.freeze({ partId: 'claw.port.mount', role: 'melee-root' }),
    'claw-joint-starboard': Object.freeze({ partId: 'claw.starboard.mount', role: 'melee-root' }),
    'claw-tip-port': Object.freeze({ partId: 'claw.port', role: 'melee-root' }),
    'claw-tip-starboard': Object.freeze({ partId: 'claw.starboard', role: 'melee-root' })
  } as const);
  HELIOS_MODULAR_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    const expected = expectedSockets[socketId];
    if (!socket) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Helios socket ${socketId}.`
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
 * Pure, fixed-frame Helios articulation. Structural parts translate, rotate,
 * or swap registered frames; no limb uses non-uniform breathing distortion.
 */
export const sampleHeliosModularPose = (
  input: HeliosModularPoseInput
): HeliosModularPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = Math.max(1, Math.floor(finiteOr(input.phaseIndex, 1)));
  const damageStage = clamp(Math.floor(finiteOr(input.damageStage, 0)), 0, 5);
  const entranceProgress = smoothstep(finiteOr(input.entranceProgress, 1));
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const stage = String(action?.stage ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const energy = actionEnvelope(stage, progress);
  const isCrossfire = primitiveId === 'paired-cannon-burst'
    || String(action?.motionCue ?? '') === 'paired-crossfire';
  const isMachineGunChannel = (
    String(action?.motionCue ?? '') === HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE
  );
  const isSweep = primitiveId === 'articulated-melee-sweep';
  const isReactor = primitiveId === 'reactor-aperture-pattern';
  const isCrush = primitiveId === 'tracking-pincer-dive';
  const recovery = stage === 'recovery' || stage === 'cooldown';
  const sweepSide = action?.side === 'port' || action?.side === 'starboard'
    ? action.side
    : 'port';
  const sweep = isSweep
    ? sampleHeliosCornerClamp({
        stage: stage === 'warning' ? 'warning' : 'fire',
        progress,
        side: sweepSide
      })
    : null;
  const crush = isCrush
    ? sampleHeliosTrackingPincer({ sequence, progress })
    : null;
  const phaseTwo = phaseIndex >= 2 || healthRatio <= 0.67;
  const phaseThree = phaseIndex >= 3 || damageStage >= 3 || healthRatio <= 0.32;
  const bodyFrameId = phaseThree
    ? 'body.damaged'
    : phaseTwo || isReactor || recovery
      ? 'body.open'
      : 'body.closed';
  const reactorOpen = bodyFrameId !== 'body.closed' || isReactor || recovery;
  const ambient = input.reducedMotion ? 0.28 : 1;
  const breath = Math.sin(frame * 0.034) * ambient;
  const secondary = Math.sin(frame * 0.021 + 1.1) * ambient;
  const entranceFold = 1 - entranceProgress;
  const reactionProgress = clamp(finiteOr(input.reaction?.progress, 1), 0, 1);
  const reactionEnergy = input.reaction
    ? Math.sin(reactionProgress * Math.PI)
      * clamp(finiteOr(input.reaction.strength, 0), 0, 2)
    : 0;
  const reactionDirection = input.reaction?.direction ?? 1;

  const phaseSpread = phaseTwo ? 10 : 0;
  const phaseRoll = phaseTwo ? 0.075 : 0;
  const phaseThreePortDroop = phaseThree ? 0.09 : 0;
  const phaseThreeStarboardBrace = phaseThree ? 0.045 : 0;
  const sweepPort = sweep?.portEnergy ?? 0;
  const sweepStarboard = sweep?.starboardEnergy ?? 0;
  const crushOpen = crush && (crush.stage === 'rise-open' || crush.stage === 'track-lock')
    ? Math.max(crush.portEnergy, crush.starboardEnergy)
    : 0;
  const crushClose = crush?.closeEnergy ?? 0;

  const rotarySpinEnergy = isCrossfire
    ? stage === 'warning'
      ? 0.25 + energy * 0.65
      : stage === 'fire'
        ? 1
        : recovery
          ? energy * 0.65
          : 0
    : 0;
  const spinHold = rotarySpinEnergy > 0.78 ? 2 : rotarySpinEnergy > 0.12 ? 5 : 18;
  const rotaryIndex = rotarySpinEnergy > 0
    ? Math.floor(frame / spinHold + sequence) % 4
    : 0;
  const portRotaryFrameId = HELIOS_ROTARY_PORT_FRAME_IDS[rotaryIndex];
  const starboardRotaryFrameId = rotarySpinEnergy > 0
    ? HELIOS_ROTARY_STARBOARD_FRAME_IDS[(rotaryIndex + 2) % 4]
    : HELIOS_ROTARY_STARBOARD_FRAME_IDS[0];
  const muzzleFrameId = HELIOS_MUZZLE_FRAME_IDS[0];
  const crossfireSides = resolveHeliosCrossfireSides(
    action?.side === 'port' || action?.side === 'starboard' ? action.side : undefined
  );
  const crossfirePulse = isCrossfire && stage === 'fire'
    ? isMachineGunChannel
      ? sampleHeliosMachineGunChannelPulse({
          elapsedFrames: finiteOr(action?.elapsedFrames, 0),
          durationFrames: finiteOr(action?.durationFrames, 1),
          sequence,
          intervalFrames: finiteOr(action?.shotIntervalFrames, phaseIndex >= 3 ? 2 : 3)
        })
      : sampleHeliosCrossfirePulse({
          elapsedFrames: finiteOr(action?.elapsedFrames, 0),
          roundsPerSide: finiteOr(action?.projectileCount, 4),
          sides: crossfireSides,
          intervalFrames: finiteOr(action?.shotIntervalFrames, phaseIndex >= 3 ? 2 : 3)
        })
    : undefined;
  const portMuzzleVisible = Boolean(
    crossfirePulse?.flashEnergy
    && (isMachineGunChannel || crossfirePulse.side === 'port')
  );
  const starboardMuzzleVisible = Boolean(
    crossfirePulse?.flashEnergy
    && (isMachineGunChannel || crossfirePulse.side === 'starboard')
  );
  const recoil = crossfirePulse?.recoilEnergy ?? 0;
  const reactorCharge = isReactor ? (stage === 'warning' ? energy : 1 - progress * 0.2) : 0;

  const portMountX = -phaseSpread - crushOpen * 20 + crushClose * 30 + sweepPort * 14;
  const starboardMountX = phaseSpread + crushOpen * 20 - crushClose * 30 - sweepStarboard * 14;
  const portMountRotation = -phaseRoll
    - crushOpen * 0.24
    + crushClose * 0.42
    + sweepPort * 0.5
    + phaseThreePortDroop;
  const starboardMountRotation = phaseRoll
    + crushOpen * 0.24
    - crushClose * 0.42
    - sweepStarboard * 0.5
    - phaseThreeStarboardBrace;

  const partOverrides = Object.freeze({
    root: freezeOverride({
      xOffset: secondary * 1.6 + reactionDirection * reactionEnergy * 5.4,
      yOffset: breath * 2.2 + reactionEnergy * 1.2,
      rotationOffset: secondary * 0.008 + reactionDirection * reactionEnergy * 0.045
    }),
    'claw.port.mount': freezeOverride({
      xOffset: portMountX - entranceFold * 22,
      yOffset: breath * 1.1 + sweepPort * 24 + crushClose * 12,
      rotationOffset: portMountRotation - entranceFold * 0.34
    }),
    'claw.port': freezeOverride({
      frameId: 'claw.port.shell'
    }),
    'claw.starboard.mount': freezeOverride({
      xOffset: starboardMountX + entranceFold * 22,
      yOffset: -breath * 1.1 + sweepStarboard * 24 + crushClose * 12,
      rotationOffset: starboardMountRotation + entranceFold * 0.34
    }),
    'claw.starboard': freezeOverride({
      frameId: 'claw.starboard.shell'
    }),
    'mandible.port': freezeOverride({
      xOffset: sweepPort * 10 + crushClose * 18,
      rotationOffset: sweepPort * 0.32 + crushClose * 0.44
    }),
    'mandible.starboard': freezeOverride({
      xOffset: -sweepStarboard * 10 - crushClose * 18,
      rotationOffset: -sweepStarboard * 0.32 - crushClose * 0.44
    }),
    body: freezeOverride({
      frameId: bodyFrameId,
      yOffset: -breath * 0.7
    }),
    'leg.outer-port': freezeOverride({
      xOffset: secondary * -1.1 - sweepPort * 4 + crushClose * 3,
      yOffset: breath * 0.7 + sweepPort * 3,
      rotationOffset: -0.018 + secondary * 0.008 - sweepPort * 0.06
    }),
    'leg.inner-port': freezeOverride({
      xOffset: secondary * -0.55 - sweepPort * 2,
      yOffset: -breath * 0.55 + sweepPort * 2,
      rotationOffset: -0.008 - secondary * 0.006 - sweepPort * 0.035
    }),
    'leg.inner-starboard': freezeOverride({
      xOffset: secondary * 0.55 + sweepStarboard * 2,
      yOffset: breath * 0.55 + sweepStarboard * 2,
      rotationOffset: 0.008 + secondary * 0.006 + sweepStarboard * 0.035
    }),
    'leg.outer-starboard': freezeOverride({
      xOffset: secondary * 1.1 + sweepStarboard * 4 - crushClose * 3,
      yOffset: -breath * 0.7 + sweepStarboard * 3,
      rotationOffset: 0.018 - secondary * 0.008 + sweepStarboard * 0.06
    }),
    reactor: freezeOverride({
      frameId: reactorOpen ? 'reactor.open' : 'reactor.closed',
      visible: isReactor || phaseTwo,
      alpha: isReactor || phaseTwo ? 1 : 0,
      rotationOffset: frame * (phaseThree ? -0.012 : 0.008),
      scaleXMultiplier: 0.92 + reactorCharge * 0.18,
      scaleYMultiplier: 0.92 + reactorCharge * 0.18
    }),
    'weapons.mount': freezeOverride({}),
    'rotary.port': freezeOverride({
      frameId: portRotaryFrameId,
      yOffset: portMuzzleVisible ? -recoil * 8 : 0
    }),
    'rotary.starboard': freezeOverride({
      frameId: starboardRotaryFrameId,
      yOffset: starboardMuzzleVisible ? -recoil * 8 : 0
    }),
    'muzzle.port': freezeOverride({
      frameId: muzzleFrameId,
      visible: portMuzzleVisible,
      alpha: portMuzzleVisible ? 1 : 0
    }),
    'muzzle.starboard': freezeOverride({
      frameId: muzzleFrameId,
      visible: starboardMuzzleVisible,
      alpha: starboardMuzzleVisible ? 1 : 0
    })
  } satisfies Record<HeliosModularPartId, ModularBossPartPoseOverride>);

  return Object.freeze({
    bodyFrameId,
    portRotaryFrameId,
    starboardRotaryFrameId,
    rotarySpinEnergy,
    reactorOpen,
    partOverrides
  });
};
