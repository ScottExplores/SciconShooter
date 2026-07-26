const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const transpile = (relativePath, customRequire = require) => {
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

const loadPoseRuntime = () => {
  const core = transpile(
    path.join('services', 'gameplay', 'bosses', 'RotatingEmitterCoreRuntime.ts')
  );
  const pose = transpile(
    path.join('services', 'pixi', 'boss-rigs', 'RotatingEmitterCorePose.ts'),
    (specifier) => {
      if (specifier.endsWith('RotatingEmitterCoreRuntime')) return core.exports;
      return require(specifier);
    }
  );
  return { core, pose };
};

test('eye chassis stays stable while the relay warning leads into one exact quarter-turn sweep', () => {
  const { core, pose } = loadPoseRuntime();
  const sample = pose.exports.sampleRotatingEmitterCorePose;
  const idle = sample({ attackFrame: 250, reducedMotion: false });
  const reverseIdle = sample({
    attackFrame: 250,
    reducedMotion: false,
    baseSequence: 1
  });
  const volley = sample({
    attackFrame: 250,
    reducedMotion: false,
    action: {
      stage: 'fire',
      progress: 0.4,
      sequence: 0,
      motionCue: 'rotor-volley'
    }
  });
  const guide = sample({
    attackFrame: 250,
    reducedMotion: false,
    action: {
      stage: 'warning',
      progress: 0.65,
      sequence: 0,
      motionCue: 'radial-beam'
    }
  });
  const beam = sample({
    attackFrame: 250,
    reducedMotion: false,
    action: {
      stage: 'fire',
      progress: 0.2,
      sequence: 0,
      motionCue: 'radial-beam'
    }
  });

  const beamEnd = sample({
    attackFrame: 370,
    reducedMotion: false,
    action: {
      stage: 'fire',
      progress: 1,
      sequence: 0,
      motionCue: 'radial-beam'
    }
  });

  assert.equal(idle.rotorAngle, volley.rotorAngle);
  assert.equal(
    reverseIdle.rotorAngle,
    core.exports.sampleRotatingEmitterRotorAngle({
      attackFrame: 250,
      sequence: 1
    })
  );
  assert.notEqual(reverseIdle.rotorAngle, idle.rotorAngle);
  assert.equal(guide.rotorAngle, 0);
  assert.equal(
    beam.rotorAngle,
    core.exports.sampleRotatingEmitterQuarterTurnRotorAngle({
      progress: 0.2,
      sequence: 0
    })
  );
  assert.equal(
    beamEnd.rotorAngle,
    core.exports.sampleRotatingEmitterQuarterTurnRotorAngle({
      progress: 1,
      sequence: 0
    })
  );
  assert.ok(Math.abs(volley.chassisOffsetY) <= 5);
  assert.ok(volley.portalAlpha > 0);
  assert.ok(volley.muzzleEnergy > 0);
  assert.equal(volley.guideAlpha, 0);
  assert.equal(guide.beamEnergy, 0);
  assert.ok(guide.guideAlpha > 0);
  assert.ok(guide.relayEnergy > idle.relayEnergy);
  assert.ok(beam.beamEnergy > 0);
  assert.equal(beam.relayEnergy, 1);
  assert.equal(beam.guideAlpha, 0);
});

test('reduced motion does not weaken authored warning or beam geometry', () => {
  const { pose } = loadPoseRuntime();
  const action = {
    stage: 'warning',
    progress: 0.7,
    sequence: 2,
    motionCue: 'radial-beam'
  };
  const full = pose.exports.sampleRotatingEmitterCorePose({
    attackFrame: 644,
    reducedMotion: false,
    action
  });
  const reduced = pose.exports.sampleRotatingEmitterCorePose({
    attackFrame: 644,
    reducedMotion: true,
    action
  });

  assert.equal(reduced.rotorAngle, full.rotorAngle);
  assert.equal(reduced.guideAlpha, full.guideAlpha);
  assert.ok(Math.abs(reduced.chassisOffsetY) < Math.abs(full.chassisOffsetY));
  assert.doesNotMatch(
    pose.source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});

test('simulation-owned rotor angle prevents warning and firing pose snaps', () => {
  const { pose } = loadPoseRuntime();
  const liveRotorAngle = 1.2345;
  const warning = pose.exports.sampleRotatingEmitterCorePose({
    attackFrame: 412,
    reducedMotion: false,
    rotorAngleRadians: liveRotorAngle,
    action: {
      stage: 'warning',
      progress: 0.9,
      sequence: 7,
      motionCue: 'radial-beam'
    }
  });
  const firing = pose.exports.sampleRotatingEmitterCorePose({
    attackFrame: 413,
    reducedMotion: false,
    rotorAngleRadians: liveRotorAngle,
    action: {
      stage: 'fire',
      progress: 0,
      sequence: 7,
      motionCue: 'radial-beam'
    }
  });

  assert.equal(warning.rotorAngle, liveRotorAngle);
  assert.equal(firing.rotorAngle, liveRotorAngle);
  assert.ok(warning.guideAlpha > 0);
  assert.ok(firing.beamEnergy > 0);
});

test('muzzle animation follows the exact authored pulse cadence and six-socket mask', () => {
  const { pose } = loadPoseRuntime();
  const sample = pose.exports.sampleRotatingEmitterCorePose;
  const intervals = [
    [0.9, 54],
    [0.85, 51],
    [0.75, 45],
    [0.65, 39]
  ];

  for (const [pulseIntervalSeconds, intervalFrames] of intervals) {
    const beforePulse = sample({
      attackFrame: 900 + intervalFrames - 1,
      reducedMotion: false,
      action: {
        primitiveId: 'rotor-hazard-sentence',
        stage: 'fire',
        progress: 0.2,
        sequence: 0,
        motionCue: 'rotor-volley',
        elapsedFrames: intervalFrames - 1,
        framesPerSecond: 60,
        projectileCount: 6,
        pulseIntervalSeconds
      }
    });
    const onPulse = sample({
      attackFrame: 900 + intervalFrames,
      reducedMotion: false,
      action: {
        primitiveId: 'rotor-hazard-sentence',
        stage: 'fire',
        progress: 0.2,
        sequence: 0,
        motionCue: 'rotor-volley',
        elapsedFrames: intervalFrames,
        framesPerSecond: 60,
        projectileCount: 6,
        pulseIntervalSeconds
      }
    });

    assert.equal(beforePulse.muzzleEnergy, 0);
    assert.equal(onPulse.muzzleEnergy, 1);
    assert.equal(onPulse.pulseIndex, 1);
    assert.equal(onPulse.activeMuzzleMask, 0b01111110);
  }

  const warning = sample({
    attackFrame: 500,
    reducedMotion: false,
    action: {
      primitiveId: 'rotor-hazard-sentence',
      stage: 'warning',
      progress: 1,
      sequence: 3,
      motionCue: 'rotor-volley',
      elapsedFrames: 35,
      framesPerSecond: 60,
      projectileCount: 6,
      pulseIntervalSeconds: 0.65
    }
  });
  assert.equal(warning.activeMuzzleMask, 0b00111111);
  assert.ok(warning.muzzleEnergy > 0.8);
});

test('repeated gap-ring executions reuse the sprite pulse atlas as an expanding core flash', () => {
  const { pose } = loadPoseRuntime();
  const sample = pose.exports.sampleRotatingEmitterCorePose;
  const samples = [0.1, 0.5, 0.8].map((progress) => sample({
    attackFrame: 600,
    reducedMotion: false,
    action: {
      primitiveId: 'gap-ring',
      stage: 'fire',
      progress,
      sequence: 2,
      elapsedFrames: Math.round(progress * 15),
      framesPerSecond: 60
    }
  }));

  assert.deepEqual(samples.map((entry) => entry.pulseFrame), [0, 1, 2]);
  assert.ok(samples[0].pulseAlpha > samples[1].pulseAlpha);
  assert.ok(samples[1].pulseAlpha > samples[2].pulseAlpha);
  assert.ok(samples[0].pulseScale < samples[1].pulseScale);
  assert.ok(samples[1].pulseScale < samples[2].pulseScale);
  assert.ok(samples.every((entry) => entry.activeMuzzleMask === 0));
});

test('Pixi consumes shared socket geometry and pulse state without allocating rig sprites per frame', () => {
  const rendererSource = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );
  const methodStart = rendererSource.indexOf(
    'private drawRotatingEmitterCorePreviewBossAtlas'
  );
  const methodEnd = rendererSource.indexOf(
    'private drawPreviewBossAtlas',
    methodStart
  );
  assert.ok(methodStart >= 0);
  assert.ok(methodEnd > methodStart);
  const method = rendererSource.slice(methodStart, methodEnd);

  assert.match(method, /sampleRotatingEmitterSocketPositionsForBounds\(\{/);
  assert.match(method, /muzzle\.position\.set\(socket\.localX, socket\.localY\)/);
  assert.match(method, /pose\.activeMuzzleMask & \(1 << index\)/);
  assert.match(method, /pose\.muzzleEnergy/);
  assert.match(method, /'orbCharge'/);
  assert.match(method, /'orbMuzzle'/);
  assert.match(method, /rig\.root\.position\.set\(0, 0\)/);
  assert.doesNotMatch(method, /muzzle\.position\.set\(Math\.cos\(angle\) \* 132/);
  assert.doesNotMatch(method, /new (?:Sprite|Container|Graphics)\(/);
});
