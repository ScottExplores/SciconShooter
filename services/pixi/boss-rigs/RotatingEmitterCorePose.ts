import type {
  BossTimelineMotionCue,
  BossTimelinePrimitiveId
} from '../../../game-config/types';
import {
  sampleRotatingEmitterQuarterTurnRotorAngle,
  sampleRotatingEmitterPulseState,
  sampleRotatingEmitterRotorAngle
} from '../../gameplay/bosses/RotatingEmitterCoreRuntime';

export interface RotatingEmitterCoreActionPresentation {
  readonly primitiveId?: BossTimelinePrimitiveId | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly sequence?: number | null;
  readonly motionCue?: BossTimelineMotionCue | null;
  readonly elapsedFrames?: number | null;
  readonly framesPerSecond?: number | null;
  readonly projectileCount?: number | null;
  readonly pulseIntervalSeconds?: number | null;
}

export interface RotatingEmitterCorePoseInput {
  readonly attackFrame: number;
  readonly reducedMotion: boolean;
  /** Optional simulation-owned angle shared with beam collision geometry. */
  readonly rotorAngleRadians?: number;
  /** Phase-selected direction used while no action clip owns the rotor. */
  readonly baseSequence?: number;
  readonly action?: RotatingEmitterCoreActionPresentation | null;
  /** A live beam entity is already in the arena, even if the clip cue is absent. */
  readonly liveBeam?: boolean;
}

export interface RotatingEmitterCorePose {
  readonly chassisOffsetY: number;
  readonly chassisScale: number;
  readonly rotorAngle: number;
  readonly rotorScale: number;
  readonly muzzleEnergy: number;
  readonly activeMuzzleParity: 0 | 1;
  readonly activeMuzzleMask: number;
  readonly pulseIndex: number;
  readonly relayEnergy: number;
  readonly portalAlpha: number;
  readonly portalShift: number;
  readonly guideAlpha: number;
  readonly beamEnergy: number;
  readonly pulseFrame: 0 | 1 | 2;
  readonly pulseAlpha: number;
  readonly pulseScale: number;
}

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

/**
 * A deliberately authored four-second settle loop. It is piecewise and
 * reconstructible at any fixed frame; there is no random drift or independent
 * oscillation competing with the boss's one mechanical rotor.
 */
const sampleChassisSettle = (attackFrame: number, reducedMotion: boolean) => {
  const phase = ((Math.max(0, Math.floor(attackFrame)) % 240) + 240) % 240;
  const half = phase < 120 ? phase / 120 : (240 - phase) / 120;
  return smoothstep(half) * (reducedMotion ? 1.2 : 5);
};

const samplePostFirePulseEnvelope = (framesSincePulse: number) => {
  const elapsed = Math.max(0, Math.floor(framesSincePulse));
  if (elapsed < 3) return 1;
  if (elapsed < 12) return 1 - smoothstep((elapsed - 3) / 9);
  return 0;
};

export const sampleRotatingEmitterCorePose = (
  input: RotatingEmitterCorePoseInput
): RotatingEmitterCorePose => {
  const attackFrame = Math.max(0, Math.floor(finiteOr(input.attackFrame, 0)));
  const action = input.action;
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const sequence = Math.max(
    0,
    Math.floor(finiteOr(action?.sequence, finiteOr(input.baseSequence, 0)))
  );
  const stage = action?.stage ?? '';
  const motionCue = action?.motionCue;
  const rotorVolley = motionCue === 'rotor-volley';
  const authoredBeam = motionCue === 'radial-beam'
    || action?.primitiveId === 'radial-beam-array'
    || action?.primitiveId === 'cross-beam'
    || action?.primitiveId === 'rail-sweep';
  const radialBeam = authoredBeam;
  const liveBeam = input.liveBeam === true;
  const gapRing = action?.primitiveId === 'gap-ring';
  const warning = stage === 'warning';
  const firing = stage === 'fire';
  const rotorPulse = sampleRotatingEmitterPulseState({
    elapsedFrames: finiteOr(action?.elapsedFrames, attackFrame),
    pulseIntervalSeconds: finiteOr(action?.pulseIntervalSeconds, 1),
    projectileCount: finiteOr(action?.projectileCount, 6),
    framesPerSecond: finiteOr(action?.framesPerSecond, 60)
  });
  const rotorPulseEnvelope = rotorVolley && firing
    ? samplePostFirePulseEnvelope(rotorPulse.framesSincePulse)
    : 0;
  const rotorWarningEnergy = rotorVolley && warning
    ? 0.18 + smoothstep(progress) * 0.64
    : 0;
  const gapRingEnergy = gapRing && firing
    ? 1 - smoothstep(progress)
    : 0;
  const guideAlpha = radialBeam && warning
    ? 0.42 + smoothstep(progress) * 0.48
    : 0;
  const beamEnergy = radialBeam && firing
    ? 1 - smoothstep(Math.max(0, progress - 0.68) / 0.32) * 0.22
    : liveBeam
      ? 0.82
      : 0;
  const portalAlpha = rotorVolley
    ? warning
      ? smoothstep(progress) * 0.72
      : firing
        ? 0.48 + rotorPulseEnvelope * 0.42
        : 0
    : 0;
  const energy = Math.max(
    rotorPulseEnvelope,
    rotorWarningEnergy,
    guideAlpha,
    beamEnergy,
    gapRingEnergy,
    liveBeam ? 0.82 : 0
  );
  const rotorAngle = Number.isFinite(input.rotorAngleRadians)
    ? Number(input.rotorAngleRadians)
    : radialBeam && (warning || firing)
      ? sampleRotatingEmitterQuarterTurnRotorAngle({
          progress: firing ? progress : 0,
          sequence
        })
      : sampleRotatingEmitterRotorAngle({ attackFrame, sequence });
  const relayEnergy = radialBeam
    ? warning
      ? 0.18 + smoothstep(progress) * 0.82
      : firing
        ? 1
        : 0.12
    : liveBeam
      ? 0.92
      : 0.12 + rotorPulseEnvelope * 0.18;

  return {
    chassisOffsetY: sampleChassisSettle(attackFrame, input.reducedMotion),
    chassisScale: 1 + energy * 0.012,
    rotorAngle,
    rotorScale: 1 + (rotorVolley && warning ? smoothstep(progress) * 0.045 : 0),
    muzzleEnergy: Math.max(rotorWarningEnergy, rotorPulseEnvelope),
    activeMuzzleParity: sequence % 2 === 0 ? 0 : 1,
    activeMuzzleMask: rotorVolley ? rotorPulse.activeSocketMask : 0,
    pulseIndex: rotorPulse.pulseIndex,
    relayEnergy,
    portalAlpha,
    portalShift: rotorVolley && firing
      ? (Math.floor(attackFrame / 30) % 4) - 1.5
      : 0,
    guideAlpha,
    beamEnergy,
    pulseFrame: gapRing && firing
      ? progress < 1 / 3
        ? 0
        : progress < 2 / 3
          ? 1
          : 2
      : beamEnergy > 0.66
        ? 2
        : energy > 0.34
          ? 1
          : 0,
    pulseAlpha: clamp(gapRingEnergy > 0 ? gapRingEnergy : energy, 0, 0.96),
    pulseScale: gapRing && firing
      ? 0.68 + smoothstep(progress) * 0.78
      : 0.7 + energy * 0.46
  };
};
