const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRotatingEmitterCoreRuntime = () => {
  const source = fs.readFileSync(
    path.join(
      root,
      'services',
      'gameplay',
      'bosses',
      'RotatingEmitterCoreRuntime.ts'
    ),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    {
      module: moduleBox,
      require,
      exports: moduleBox.exports,
      Math,
      Number,
      Object,
      Array
    }
  );
  return { source, ...moduleBox.exports };
};

const loadRotationDirectionRuntime = () => {
  const compile = (relativePath, customRequire = require) => {
    const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }).outputText;
    const moduleBox = { exports: {} };
    vm.runInNewContext(
      `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
      {
        module: moduleBox,
        require: customRequire,
        exports: moduleBox.exports,
        Math,
        Number,
        Object,
        Array
      }
    );
    return { source, exports: moduleBox.exports };
  };
  const random = compile(
    path.join('services', 'gameplay', 'random', 'gameplayRandom.ts')
  );
  const resolver = compile(
    path.join(
      'services',
      'gameplay',
      'bosses',
      'BossRotationDirectionRuntime.ts'
    ),
    (specifier) => specifier === '../random' ? random.exports : require(specifier)
  );
  return { source: resolver.source, ...resolver.exports };
};

const normalizeAxisAngle = (angleRadians) => {
  const wrapped = angleRadians % Math.PI;
  return wrapped < 0 ? wrapped + Math.PI : wrapped;
};

const normalizeSignedAngle = (angleRadians) => {
  const wrapped = angleRadians % (Math.PI * 2);
  if (wrapped > Math.PI) return wrapped - Math.PI * 2;
  if (wrapped < -Math.PI) return wrapped + Math.PI * 2;
  return wrapped;
};

const assertClose = (actual, expected, epsilon = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
};

test('rotor direction alternates deterministically from the authored sequence', () => {
  const {
    ROTATING_EMITTER_FRAME_STEP_RADIANS,
    ROTATING_EMITTER_DIRECTION,
    ROTATING_EMITTER_SEQUENCE_STEP_RADIANS,
    resolveRotatingEmitterDirection,
    sampleRotatingEmitterRotorAngle,
    source
  } = loadRotatingEmitterCoreRuntime();
  const counterClockwiseInput = { attackFrame: 150, sequence: 2 };
  const counterClockwiseAngle = sampleRotatingEmitterRotorAngle(counterClockwiseInput);
  const clockwiseInput = { attackFrame: 150, sequence: 3 };
  const clockwiseAngle = sampleRotatingEmitterRotorAngle(clockwiseInput);

  assert.equal(
    sampleRotatingEmitterRotorAngle(counterClockwiseInput),
    counterClockwiseAngle
  );
  assert.equal(resolveRotatingEmitterDirection(2), ROTATING_EMITTER_DIRECTION);
  assert.equal(resolveRotatingEmitterDirection(3), 1);
  assertClose(
    normalizeSignedAngle(
      sampleRotatingEmitterRotorAngle({ attackFrame: 151, sequence: 2 })
      - counterClockwiseAngle
    ),
    -ROTATING_EMITTER_FRAME_STEP_RADIANS
  );
  assertClose(
    normalizeSignedAngle(
      sampleRotatingEmitterRotorAngle({ attackFrame: 151, sequence: 3 })
      - clockwiseAngle
    ),
    ROTATING_EMITTER_FRAME_STEP_RADIANS
  );
  assertClose(
    normalizeSignedAngle(
      sampleRotatingEmitterRotorAngle({ attackFrame: 150, sequence: 4 })
      - counterClockwiseAngle
    ),
    ROTATING_EMITTER_SEQUENCE_STEP_RADIANS * 2
  );
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});

test('seeded laser direction is stable per timeline loop and can choose both directions', () => {
  const { resolveBossRotationSequence, source } = loadRotationDirectionRuntime();
  const clockwise = resolveBossRotationSequence({
    sequence: 0,
    rotationDirection: 'clockwise',
    seedKey: 'fixed'
  });
  const counterclockwise = resolveBossRotationSequence({
    sequence: 1,
    rotationDirection: 'counterclockwise',
    seedKey: 'fixed'
  });
  const stable = Array.from({ length: 3 }, () => resolveBossRotationSequence({
    sequence: 0,
    rotationDirection: 'seeded-random',
    seedKey: 'seed:event:phase:4:beam'
  }));
  const seededDirections = new Set(
    Array.from({ length: 64 }, (_, loopIndex) => (
      resolveBossRotationSequence({
        sequence: 0,
        rotationDirection: 'seeded-random',
        seedKey: `seed:event:phase:${loopIndex}:beam`
      }) % 2
    ))
  );

  assert.equal(clockwise % 2, 1);
  assert.equal(counterclockwise % 2, 0);
  assert.deepEqual(stable, [stable[0], stable[0], stable[0]]);
  assert.deepEqual([...seededDirections].sort(), [0, 1]);
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});

test('eight emitter sockets rotate locally around one stationary chassis', () => {
  const {
    ROTATING_EMITTER_SOCKET_COUNT,
    sampleRotatingEmitterCore
  } = loadRotatingEmitterCoreRuntime();
  const initial = sampleRotatingEmitterCore({
    centerX: 320,
    centerY: 180,
    radius: 72,
    attackFrame: 0,
    sequence: 0
  });
  const rotated = sampleRotatingEmitterCore({
    centerX: 320,
    centerY: 180,
    radius: 72,
    attackFrame: 90,
    sequence: 0
  });

  assert.equal(initial.sockets.length, ROTATING_EMITTER_SOCKET_COUNT);
  assert.deepEqual(
    [initial.centerX, initial.centerY],
    [rotated.centerX, rotated.centerY]
  );
  assert.notEqual(
    initial.sockets[0].angleRadians,
    rotated.sockets[0].angleRadians
  );
  initial.sockets.forEach((socket, index) => {
    assert.equal(socket.index, index);
    assertClose(Math.hypot(socket.localX, socket.localY), initial.radius);
    assertClose(socket.x, initial.centerX + socket.localX);
    assertClose(socket.y, initial.centerY + socket.localY);
    const opposite = initial.sockets[(index + 4) % initial.sockets.length];
    assertClose(socket.localX + opposite.localX, 0);
    assertClose(socket.localY + opposite.localY, 0);
  });
});

test('gameplay and rendered muzzle centers share one elliptical bounds sampler', () => {
  const {
    ROTATING_EMITTER_CORE_DESIGN_SIZE,
    ROTATING_EMITTER_SOCKET_RADIUS_RATIO,
    sampleRotatingEmitterSocketPositionsForBounds
  } = loadRotatingEmitterCoreRuntime();
  const rotorAngleRadians = 0.63;
  const design = sampleRotatingEmitterSocketPositionsForBounds({
    centerX: 0,
    centerY: 0,
    width: ROTATING_EMITTER_CORE_DESIGN_SIZE,
    height: ROTATING_EMITTER_CORE_DESIGN_SIZE,
    rotorAngleRadians
  });
  const sizes = [
    { width: 517, height: 470 },
    { width: 320, height: 291 }
  ];

  for (const size of sizes) {
    const gameplay = sampleRotatingEmitterSocketPositionsForBounds({
      centerX: 195,
      centerY: 210,
      ...size,
      rotorAngleRadians
    });
    gameplay.forEach((socket, index) => {
      const rendered = design[index];
      assertClose(
        socket.localX,
        rendered.localX * size.width / ROTATING_EMITTER_CORE_DESIGN_SIZE
      );
      assertClose(
        socket.localY,
        rendered.localY * size.height / ROTATING_EMITTER_CORE_DESIGN_SIZE
      );
      assertClose(socket.x, 195 + socket.localX);
      assertClose(socket.y, 210 + socket.localY);
      assertClose(
        socket.angleRadians,
        (
          Math.atan2(socket.localY, socket.localX)
          + Math.PI * 2
        ) % (Math.PI * 2)
      );
      const normalizedX = socket.localX
        / (size.width * ROTATING_EMITTER_SOCKET_RADIUS_RATIO);
      const normalizedY = socket.localY
        / (size.height * ROTATING_EMITTER_SOCKET_RADIUS_RATIO);
      assertClose(normalizedX * normalizedX + normalizedY * normalizedY, 1);
    });
    assert.ok(
      Math.max(...gameplay.map((socket) => Math.abs(socket.localX)))
        <= size.width * ROTATING_EMITTER_SOCKET_RADIUS_RATIO
    );
    assert.ok(
      Math.max(...gameplay.map((socket) => Math.abs(socket.localY)))
        <= size.height * ROTATING_EMITTER_SOCKET_RADIUS_RATIO
    );
  }
});

test('authored rotor intervals select the exact six firing sockets on fixed-step frames', () => {
  const { sampleRotatingEmitterPulseState } = loadRotatingEmitterCoreRuntime();
  const authoredIntervals = [
    [0.9, 54],
    [0.85, 51],
    [0.75, 45],
    [0.65, 39]
  ];

  for (const [pulseIntervalSeconds, expectedFrames] of authoredIntervals) {
    const first = sampleRotatingEmitterPulseState({
      elapsedFrames: 0,
      pulseIntervalSeconds,
      projectileCount: 6,
      framesPerSecond: 60
    });
    const beforeSecond = sampleRotatingEmitterPulseState({
      elapsedFrames: expectedFrames - 1,
      pulseIntervalSeconds,
      projectileCount: 6,
      framesPerSecond: 60
    });
    const second = sampleRotatingEmitterPulseState({
      elapsedFrames: expectedFrames,
      pulseIntervalSeconds,
      projectileCount: 6,
      framesPerSecond: 60
    });

    assert.equal(first.intervalFrames, expectedFrames);
    assert.equal(first.shouldEmit, true);
    assert.deepEqual(
      JSON.parse(JSON.stringify(first.activeSocketIndices)),
      [0, 1, 2, 3, 4, 5]
    );
    assert.equal(beforeSecond.shouldEmit, false);
    assert.equal(second.shouldEmit, true);
    assert.equal(second.pulseIndex, 1);
    assert.equal(second.firstSocketIndex, 1);
    assert.deepEqual(
      JSON.parse(JSON.stringify(second.activeSocketIndices)),
      [1, 2, 3, 4, 5, 6]
    );
    assert.equal(second.activeSocketMask, 0b01111110);
  }
});

test('four beam axes share the rotor angle with sockets zero, two, four, and six', () => {
  const {
    ROTATING_EMITTER_BEAM_AXIS_COUNT,
    sampleRotatingEmitterCore,
    sampleRotatingEmitterBeamAxisAngles,
    sampleRotatingEmitterSocketPositions
  } = loadRotatingEmitterCoreRuntime();
  const input = {
    centerX: 410,
    centerY: 125,
    radius: 88,
    attackFrame: 217,
    sequence: 5
  };
  const sample = sampleRotatingEmitterCore(input);
  const socketSamples = sampleRotatingEmitterSocketPositions(input);
  const beamAxes = sampleRotatingEmitterBeamAxisAngles(input);

  assert.equal(sample.beamAxisAngles.length, ROTATING_EMITTER_BEAM_AXIS_COUNT);
  assert.equal(beamAxes.length, ROTATING_EMITTER_BEAM_AXIS_COUNT);
  [0, 2, 4, 6].forEach((socketIndex, beamIndex) => {
    assertClose(
      normalizeAxisAngle(sample.beamAxisAngles[beamIndex]),
      normalizeAxisAngle(sample.sockets[socketIndex].angleRadians)
    );
    assertClose(
      normalizeAxisAngle(beamAxes[beamIndex]),
      normalizeAxisAngle(socketSamples[socketIndex].angleRadians)
    );
  });
});

test('four relay origins share deterministic clockwise and counter-clockwise 90 degree paths', () => {
  const {
    ROTATING_EMITTER_BEAM_SWEEP_RADIANS,
    ROTATING_EMITTER_RELAY_COUNT,
    sampleRotatingEmitterQuarterTurnRotorAngle,
    sampleRotatingEmitterRelayPositions
  } = loadRotatingEmitterCoreRuntime();
  const startAngle = sampleRotatingEmitterQuarterTurnRotorAngle({
    progress: 0,
    sequence: 2
  });
  const endAngle = sampleRotatingEmitterQuarterTurnRotorAngle({
    progress: 1,
    sequence: 2
  });
  const start = sampleRotatingEmitterRelayPositions({
    centerX: 400,
    centerY: 180,
    radiusX: 96,
    radiusY: 72,
    rotorAngleRadians: startAngle
  });
  const end = sampleRotatingEmitterRelayPositions({
    centerX: 400,
    centerY: 180,
    radiusX: 96,
    radiusY: 72,
    rotorAngleRadians: endAngle
  });

  assert.equal(start.length, ROTATING_EMITTER_RELAY_COUNT);
  assert.equal(end.length, ROTATING_EMITTER_RELAY_COUNT);
  assertClose(
    normalizeSignedAngle(endAngle - startAngle),
    -ROTATING_EMITTER_BEAM_SWEEP_RADIANS
  );
  start.forEach((relay, index) => {
    assert.equal(relay.index, index);
    assertClose(relay.x, 400 + relay.localX);
    assertClose(relay.y, 180 + relay.localY);
    assert.ok(Math.abs(relay.localX) <= 96);
    assert.ok(Math.abs(relay.localY) <= 72);
    assert.notEqual(relay.angleRadians, end[index].angleRadians);
  });

  const clockwiseStart = sampleRotatingEmitterQuarterTurnRotorAngle({
    progress: 0,
    sequence: 3
  });
  const clockwiseEnd = sampleRotatingEmitterQuarterTurnRotorAngle({
    progress: 1,
    sequence: 3
  });
  assertClose(
    normalizeSignedAngle(clockwiseEnd - clockwiseStart),
    ROTATING_EMITTER_BEAM_SWEEP_RADIANS
  );
});

test('radial spokes visibly cover the core-to-relay bypass while preserving mobile-safe wedges', () => {
  const {
    resolveRotatingEmitterRadialBeamGeometry,
    sampleRotatingEmitterRelayPositions
  } = loadRotatingEmitterCoreRuntime();
  const centerX = 195;
  const centerY = 210;
  const relays = sampleRotatingEmitterRelayPositions({
    centerX,
    centerY,
    radiusX: 320 * (186.68 / 420),
    radiusY: 291 * (186.68 / 420),
    rotorAngleRadians: 0.37
  });
  const outwardLength = Math.hypot(390, 844) * 1.18;
  const geometries = relays.map((relay) => (
    resolveRotatingEmitterRadialBeamGeometry({
      centerX,
      centerY,
      relay,
      outwardLength
    })
  ));

  geometries.forEach((geometry, index) => {
    const relay = relays[index];
    const relayDistance = Math.hypot(relay.x - centerX, relay.y - centerY);
    assertClose(geometry.startX, centerX);
    assertClose(geometry.startY, centerY);
    assertClose(geometry.length, relayDistance + outwardLength);

    // The relay lies on the visible segment instead of sitting behind its
    // damaging ray, including when the boss rig is elliptically scaled.
    const crossProduct = (
      (relay.x - geometry.startX) * (geometry.endY - geometry.startY)
      - (relay.y - geometry.startY) * (geometry.endX - geometry.startX)
    );
    assertClose(crossProduct, 0, 1e-7);
    const halfwayToRelayX = centerX + (relay.x - centerX) * 0.5;
    const halfwayToRelayY = centerY + (relay.y - centerY) * 0.5;
    const halfwayProjection = (
      (halfwayToRelayX - geometry.startX) * Math.cos(geometry.angleRadians)
      + (halfwayToRelayY - geometry.startY) * Math.sin(geometry.angleRadians)
    );
    assert.ok(halfwayProjection > 0);
    assert.ok(halfwayProjection < geometry.length);
  });

  const sortedAngles = geometries
    .map((geometry) => (
      (geometry.angleRadians + Math.PI * 2) % (Math.PI * 2)
    ))
    .sort((left, right) => left - right);
  const angularGaps = sortedAngles.map((angle, index) => {
    const next = sortedAngles[(index + 1) % sortedAngles.length]
      + (index === sortedAngles.length - 1 ? Math.PI * 2 : 0);
    return next - angle;
  });
  assert.ok(
    Math.min(...angularGaps) > Math.PI / 3,
    'four spokes must retain broad navigable sectors on a phone viewport'
  );
});

test('engine wires core-covering beam geometry and changes rotor direction for projectile sentences', () => {
  const engineSource = fs.readFileSync(
    path.join(root, 'services', 'gameLogic.ts'),
    'utf8'
  );

  assert.match(engineSource, /resolveRotatingEmitterRadialBeamGeometry\(\{/);
  assert.match(engineSource, /beam\.beamRadialOutwardLength = length/);
  assert.match(
    engineSource,
    /sourceClip\.primitiveId === 'radial-beam-array'\s*\|\| sourceClip\.primitiveId === 'rotor-hazard-sentence'/
  );
  assert.match(
    engineSource,
    /boss\.bossRotorDirection = resolveRotatingEmitterDirection\(presentation\.sequence\)/
  );
  assert.match(engineSource, /sampleRotatingEmitterPulseState\(\{/);
  assert.match(engineSource, /sampleRotatingEmitterSocketPositionsForBounds\(\{/);
  assert.match(engineSource, /for \(const socketIndex of pulse\.activeSocketIndices\)/);
});
