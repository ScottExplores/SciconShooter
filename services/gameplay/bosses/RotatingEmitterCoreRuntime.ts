export const ROTATING_EMITTER_SOCKET_COUNT = 8;
export const ROTATING_EMITTER_BEAM_AXIS_COUNT = 4;
export const ROTATING_EMITTER_RELAY_COUNT = 4;
export const ROTATING_EMITTER_FULL_TURN_RADIANS = Math.PI * 2;
export const ROTATING_EMITTER_SOCKET_STEP_RADIANS = (
  ROTATING_EMITTER_FULL_TURN_RADIANS / ROTATING_EMITTER_SOCKET_COUNT
);
export const ROTATING_EMITTER_FULL_TURN_FRAMES = 480;
export const ROTATING_EMITTER_FRAME_STEP_RADIANS = (
  ROTATING_EMITTER_FULL_TURN_RADIANS / ROTATING_EMITTER_FULL_TURN_FRAMES
);
/** Screen-space angles increase clockwise because y grows downward. */
export const ROTATING_EMITTER_DIRECTION = -1;
export const ROTATING_EMITTER_SEQUENCE_STEP_RADIANS = (
  ROTATING_EMITTER_SOCKET_STEP_RADIANS / 2
);
export const ROTATING_EMITTER_RELAY_BASE_ANGLE_RADIANS = -Math.PI * 0.75;
export const ROTATING_EMITTER_BEAM_SWEEP_RADIANS = Math.PI / 2;
export const ROTATING_EMITTER_CORE_DESIGN_SIZE = 420;
export const ROTATING_EMITTER_SOCKET_RADIUS_RATIO = (
  132 / ROTATING_EMITTER_CORE_DESIGN_SIZE
);
export const ROTATING_EMITTER_MIN_PULSE_INTERVAL_SECONDS = 0.5;
export const ROTATING_EMITTER_MAX_PULSE_INTERVAL_SECONDS = 2;
export const ROTATING_EMITTER_MIN_PROJECTILE_COUNT = 4;
export const ROTATING_EMITTER_MAX_PROJECTILE_COUNT = ROTATING_EMITTER_SOCKET_COUNT;

export interface RotatingEmitterCoreInput {
  centerX: number;
  centerY: number;
  radius: number;
  attackFrame: number;
  sequence: number;
}

export interface RotatingEmitterSocketPosition {
  index: number;
  /** Parametric angle around the authored ellipse. */
  orbitAngleRadians: number;
  /** Actual screen-space direction from the core to this socket. */
  angleRadians: number;
  localX: number;
  localY: number;
  x: number;
  y: number;
}

export interface RotatingEmitterCoreSample {
  centerX: number;
  centerY: number;
  radius: number;
  rotorAngleRadians: number;
  sockets: readonly RotatingEmitterSocketPosition[];
  beamAxisAngles: readonly number[];
}

export interface RotatingEmitterRelayInput {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  rotorAngleRadians: number;
}

export interface RotatingEmitterRelayPosition {
  index: number;
  angleRadians: number;
  localX: number;
  localY: number;
  x: number;
  y: number;
}

export interface RotatingEmitterRadialBeamGeometry {
  angleRadians: number;
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
  relayX: number;
  relayY: number;
  endX: number;
  endY: number;
  length: number;
}

export interface RotatingEmitterPulseState {
  intervalFrames: number;
  pulseIndex: number;
  framesSincePulse: number;
  shouldEmit: boolean;
  firstSocketIndex: number;
  projectileCount: number;
  activeSocketMask: number;
  activeSocketIndices: readonly number[];
}

const normalizeFinite = (value: number, fallback = 0) => (
  Number.isFinite(value) ? value : fallback
);

const normalizeFrameOrSequence = (value: number) => (
  Math.max(0, Math.floor(normalizeFinite(value)))
);

/**
 * Even authored sequences rotate counter-clockwise; odd sequences rotate
 * clockwise. Direction is content-selected and deterministic so pose, muzzle
 * origins, warning guides, and damaging beams can all share one sample.
 */
export const resolveRotatingEmitterDirection = (sequence: number): -1 | 1 => (
  normalizeFrameOrSequence(sequence) % 2 === 0
    ? ROTATING_EMITTER_DIRECTION
    : 1
);

const normalizeAngle = (angleRadians: number) => {
  const wrapped = angleRadians % ROTATING_EMITTER_FULL_TURN_RADIANS;
  return wrapped < 0 ? wrapped + ROTATING_EMITTER_FULL_TURN_RADIANS : wrapped;
};

export const sampleRotatingEmitterRotorAngle = ({
  attackFrame,
  sequence
}: Pick<RotatingEmitterCoreInput, 'attackFrame' | 'sequence'>): number => (
  normalizeAngle(
    normalizeFrameOrSequence(attackFrame)
      * ROTATING_EMITTER_FRAME_STEP_RADIANS
      * resolveRotatingEmitterDirection(sequence)
    + normalizeFrameOrSequence(sequence) * ROTATING_EMITTER_SEQUENCE_STEP_RADIANS
  )
);

export const sampleRotatingEmitterQuarterTurnRotorAngle = ({
  progress,
  sequence
}: {
  progress: number;
  sequence: number;
}): number => (
  normalizeAngle(
    normalizeFrameOrSequence(sequence) * ROTATING_EMITTER_SEQUENCE_STEP_RADIANS
    + Math.max(0, Math.min(1, normalizeFinite(progress)))
      * ROTATING_EMITTER_BEAM_SWEEP_RADIANS
      * resolveRotatingEmitterDirection(sequence)
  )
);

export const sampleRotatingEmitterRelayPositions = ({
  centerX,
  centerY,
  radiusX,
  radiusY,
  rotorAngleRadians
}: RotatingEmitterRelayInput): readonly RotatingEmitterRelayPosition[] => {
  const normalizedCenterX = normalizeFinite(centerX);
  const normalizedCenterY = normalizeFinite(centerY);
  const normalizedRadiusX = Math.max(0, normalizeFinite(radiusX));
  const normalizedRadiusY = Math.max(0, normalizeFinite(radiusY));
  const normalizedRotorAngle = normalizeAngle(normalizeFinite(rotorAngleRadians));
  return Array.from({ length: ROTATING_EMITTER_RELAY_COUNT }, (_, index) => {
    const angleRadians = normalizeAngle(
      normalizedRotorAngle
      + ROTATING_EMITTER_RELAY_BASE_ANGLE_RADIANS
      + index * Math.PI * 0.5
    );
    const localX = Math.cos(angleRadians) * normalizedRadiusX;
    const localY = Math.sin(angleRadians) * normalizedRadiusY;
    return {
      index,
      angleRadians,
      localX,
      localY,
      x: normalizedCenterX + localX,
      y: normalizedCenterY + localY
    };
  });
};

/**
 * Builds one visible spoke from the core, through its relay, and out into the
 * arena. Starting the spoke at the relay leaves a permanent inner safe ring
 * where the rotating-laser puzzle can be bypassed. The screen-space direction
 * is derived from the sampled relay position because a non-square rendered rig
 * turns the relay's authored circular path into an ellipse.
 */
export const resolveRotatingEmitterRadialBeamGeometry = ({
  centerX,
  centerY,
  relay,
  outwardLength
}: {
  centerX: number;
  centerY: number;
  relay: RotatingEmitterRelayPosition;
  outwardLength: number;
}): RotatingEmitterRadialBeamGeometry => {
  const normalizedCenterX = normalizeFinite(centerX);
  const normalizedCenterY = normalizeFinite(centerY);
  const relayX = normalizeFinite(relay.x, normalizedCenterX);
  const relayY = normalizeFinite(relay.y, normalizedCenterY);
  const offsetX = relayX - normalizedCenterX;
  const offsetY = relayY - normalizedCenterY;
  const relayDistance = Math.hypot(offsetX, offsetY);
  const angleRadians = relayDistance > 0
    ? Math.atan2(offsetY, offsetX)
    : normalizeAngle(normalizeFinite(relay.angleRadians));
  const directionX = Math.cos(angleRadians);
  const directionY = Math.sin(angleRadians);
  const normalizedOutwardLength = Math.max(1, normalizeFinite(outwardLength, 1));
  const length = Math.max(1, relayDistance + normalizedOutwardLength);
  const startX = normalizedCenterX;
  const startY = normalizedCenterY;
  const endX = relayX + directionX * normalizedOutwardLength;
  const endY = relayY + directionY * normalizedOutwardLength;
  return {
    angleRadians,
    startX,
    startY,
    centerX: (startX + endX) / 2,
    centerY: (startY + endY) / 2,
    relayX,
    relayY,
    endX,
    endY,
    length
  };
};

const buildSocketPositions = (
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  rotorAngleRadians: number
): readonly RotatingEmitterSocketPosition[] => (
  Array.from({ length: ROTATING_EMITTER_SOCKET_COUNT }, (_, index) => {
    const orbitAngleRadians = normalizeAngle(
      rotorAngleRadians + index * ROTATING_EMITTER_SOCKET_STEP_RADIANS
    );
    const localX = Math.cos(orbitAngleRadians) * radiusX;
    const localY = Math.sin(orbitAngleRadians) * radiusY;
    const angleRadians = normalizeAngle(
      Math.hypot(localX, localY) > 0
        ? Math.atan2(localY, localX)
        : orbitAngleRadians
    );
    return {
      index,
      orbitAngleRadians,
      angleRadians,
      localX,
      localY,
      x: centerX + localX,
      y: centerY + localY
    };
  })
);

export const sampleRotatingEmitterSocketPositionsAtAngle = ({
  centerX,
  centerY,
  radius,
  rotorAngleRadians
}: {
  centerX: number;
  centerY: number;
  radius: number;
  rotorAngleRadians: number;
}): readonly RotatingEmitterSocketPosition[] => (
  buildSocketPositions(
    normalizeFinite(centerX),
    normalizeFinite(centerY),
    Math.max(0, normalizeFinite(radius)),
    Math.max(0, normalizeFinite(radius)),
    normalizeAngle(normalizeFinite(rotorAngleRadians))
  )
);

/**
 * Samples the eight gameplay muzzle centers from the same non-square bounds
 * that Pixi scales the authored rig into. This keeps desktop and mobile
 * projectile origins centered on the visible orb sprites.
 */
export const sampleRotatingEmitterSocketPositionsForBounds = ({
  centerX,
  centerY,
  width,
  height,
  rotorAngleRadians
}: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  rotorAngleRadians: number;
}): readonly RotatingEmitterSocketPosition[] => (
  buildSocketPositions(
    normalizeFinite(centerX),
    normalizeFinite(centerY),
    Math.max(0, normalizeFinite(width)) * ROTATING_EMITTER_SOCKET_RADIUS_RATIO,
    Math.max(0, normalizeFinite(height)) * ROTATING_EMITTER_SOCKET_RADIUS_RATIO,
    normalizeAngle(normalizeFinite(rotorAngleRadians))
  )
);

/**
 * One deterministic pulse sentence shared by spawning and presentation.
 * `shouldEmit` is true only on the exact fixed-step frame that owns a volley;
 * the active mask remains available between pulses so Pixi can decay the
 * already-fired socket animation without inventing another clock.
 */
export const sampleRotatingEmitterPulseState = ({
  elapsedFrames,
  pulseIntervalSeconds,
  projectileCount,
  framesPerSecond
}: {
  elapsedFrames: number;
  pulseIntervalSeconds?: number;
  projectileCount?: number;
  framesPerSecond: number;
}): RotatingEmitterPulseState => {
  const normalizedElapsedFrames = Math.floor(normalizeFinite(elapsedFrames, -1));
  const normalizedFramesPerSecond = Math.max(
    1,
    Math.round(normalizeFinite(framesPerSecond, 60))
  );
  const normalizedIntervalSeconds = Math.max(
    ROTATING_EMITTER_MIN_PULSE_INTERVAL_SECONDS,
    Math.min(
      ROTATING_EMITTER_MAX_PULSE_INTERVAL_SECONDS,
      normalizeFinite(pulseIntervalSeconds ?? 1, 1)
    )
  );
  const intervalFrames = Math.max(
    1,
    Math.round(normalizedIntervalSeconds * normalizedFramesPerSecond)
  );
  const activeElapsedFrames = Math.max(0, normalizedElapsedFrames);
  const pulseIndex = Math.floor(activeElapsedFrames / intervalFrames);
  const framesSincePulse = activeElapsedFrames % intervalFrames;
  const normalizedProjectileCount = Math.max(
    ROTATING_EMITTER_MIN_PROJECTILE_COUNT,
    Math.min(
      ROTATING_EMITTER_MAX_PROJECTILE_COUNT,
      Math.floor(normalizeFinite(projectileCount ?? 6, 6))
    )
  );
  const firstSocketIndex = pulseIndex % ROTATING_EMITTER_SOCKET_COUNT;
  const activeSocketIndices = Array.from(
    { length: normalizedProjectileCount },
    (_, index) => (firstSocketIndex + index) % ROTATING_EMITTER_SOCKET_COUNT
  );
  const activeSocketMask = activeSocketIndices.reduce(
    (mask, socketIndex) => mask | (1 << socketIndex),
    0
  );
  return {
    intervalFrames,
    pulseIndex,
    framesSincePulse,
    shouldEmit: normalizedElapsedFrames >= 0 && framesSincePulse === 0,
    firstSocketIndex,
    projectileCount: normalizedProjectileCount,
    activeSocketMask,
    activeSocketIndices
  };
};

const buildBeamAxisAngles = (
  rotorAngleRadians: number
): readonly number[] => (
  Array.from({ length: ROTATING_EMITTER_BEAM_AXIS_COUNT }, (_, axisIndex) => (
    normalizeAngle(
      rotorAngleRadians
      + axisIndex * 2 * ROTATING_EMITTER_SOCKET_STEP_RADIANS
    )
  ))
);

export const sampleRotatingEmitterSocketPositions = (
  input: RotatingEmitterCoreInput
): readonly RotatingEmitterSocketPosition[] => {
  const centerX = normalizeFinite(input.centerX);
  const centerY = normalizeFinite(input.centerY);
  const radius = Math.max(0, normalizeFinite(input.radius));
  const rotorAngleRadians = sampleRotatingEmitterRotorAngle(input);
  return buildSocketPositions(
    centerX,
    centerY,
    radius,
    radius,
    rotorAngleRadians
  );
};

export const sampleRotatingEmitterBeamAxisAngles = (
  input: Pick<RotatingEmitterCoreInput, 'attackFrame' | 'sequence'>
): readonly number[] => (
  buildBeamAxisAngles(sampleRotatingEmitterRotorAngle(input))
);

export const sampleRotatingEmitterCore = (
  input: RotatingEmitterCoreInput
): RotatingEmitterCoreSample => {
  const centerX = normalizeFinite(input.centerX);
  const centerY = normalizeFinite(input.centerY);
  const radius = Math.max(0, normalizeFinite(input.radius));
  const rotorAngleRadians = sampleRotatingEmitterRotorAngle(input);
  return {
    centerX,
    centerY,
    radius,
    rotorAngleRadians,
    sockets: buildSocketPositions(
      centerX,
      centerY,
      radius,
      radius,
      rotorAngleRadians
    ),
    beamAxisAngles: buildBeamAxisAngles(rotorAngleRadians)
  };
};
