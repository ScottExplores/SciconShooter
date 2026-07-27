const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const sourcePath = path.resolve(
  __dirname,
  '..',
  'services',
  'gameplay',
  'bosses',
  'PrismMothRuntime.ts'
);
const source = fs.readFileSync(sourcePath, 'utf8');
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
    exports: moduleBox.exports,
    require,
    Array,
    Math,
    Number,
    Object,
    String
  }
);

const {
  PRISM_MOTH_ACTION_IDS,
  PRISM_MOTH_ACTION_MOTION_CUES,
  PRISM_MOTH_ACTION_STAGES,
  PRISM_MOTH_BROODLING_FRAME_IDS,
  PRISM_MOTH_COCOON_FRAME_IDS,
  PRISM_MOTH_FORMATION_TEMPLATE_IDS,
  PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX,
  PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX,
  PRISM_MOTH_PLAYER_SPAWN_PROTECTED_Y_RATIO,
  PRISM_MOTH_PROJECTILE_KIND_IDS,
  PRISM_MOTH_RUNTIME_SOCKET_IDS,
  PRISM_MOTH_RUNTIME_LIMITS,
  PRISM_MOTH_SIGNATURE_ROUTE_IDS,
  evaluatePrismMothFormationRouteSafety,
  resolvePrismBroodProcessionParameters,
  resolvePrismKaleidoscopeBroodParameters,
  resolvePrismLunarSwoopParameters,
  resolvePrismMothActionForWings,
  resolvePrismMothBroodFormation,
  resolvePrismMothEmitterSockets,
  resolvePrismMothFormationSequence,
  resolvePrismMothFormationTemplateId,
  resolvePrismMothOwnedArtifactState,
  resolvePrismMothPhaseRemixRules,
  resolvePrismMothSeedBranch,
  resolvePrismMothSignatureSequence,
  resolvePrismMothStageDurations,
  resolvePrismMothSwoopPasses,
  resolvePrismMothWingbeatSequence,
  resolvePrismWingbeatWeaveParameters,
  samplePrismMothActionStage,
  samplePrismMothBroodLifecycle,
  samplePrismMothBroodPath,
  samplePrismMothFormationCorridor,
  samplePrismMothSignatureCorridor,
  samplePrismMothSwoopPass
} = moduleBox.exports;

const toPlain = (value) => JSON.parse(JSON.stringify(value));

test('Prism Moth exposes exactly four identity-owned action and motion cues', () => {
  assert.deepEqual(Array.from(PRISM_MOTH_ACTION_IDS), [
    'wingbeat-weave',
    'brood-procession',
    'lunar-prism-swoop',
    'kaleidoscope-brood'
  ]);
  assert.deepEqual(toPlain(PRISM_MOTH_ACTION_MOTION_CUES), {
    'wingbeat-weave': 'prism-wingbeat',
    'brood-procession': 'prism-brood-deploy',
    'lunar-prism-swoop': 'prism-swoop',
    'kaleidoscope-brood': 'prism-kaleidoscope'
  });
  assert.deepEqual(Array.from(PRISM_MOTH_ACTION_STAGES), [
    'preparation',
    'telegraph',
    'fire',
    'recovery'
  ]);
  assert.equal(Object.isFrozen(PRISM_MOTH_ACTION_IDS), true);
  assert.equal(Object.isFrozen(PRISM_MOTH_RUNTIME_LIMITS), true);
  assert.equal(PRISM_MOTH_RUNTIME_LIMITS.maximumSwoopPasses, 3);
  assert.equal(PRISM_MOTH_RUNTIME_LIMITS.maximumBroodWaves, 2);
});

test('anatomy emission roles resolve to the registered live Prism sockets', () => {
  assert.deepEqual(Array.from(PRISM_MOTH_RUNTIME_SOCKET_IDS), [
    'wing-edge-left',
    'wing-edge-right',
    'wing-tip-left',
    'wing-tip-right',
    'brood-release-left',
    'brood-release-right',
    'prism-core'
  ]);
  const wings = { port: true, starboard: true };
  assert.deepEqual(Array.from(resolvePrismMothEmitterSockets({
    role: 'feather',
    source: 'both',
    wings
  })), ['wing-edge-left', 'wing-edge-right']);
  assert.deepEqual(Array.from(resolvePrismMothEmitterSockets({
    role: 'trail',
    source: 'starboard',
    wings
  })), ['wing-tip-right']);
  assert.deepEqual(Array.from(resolvePrismMothEmitterSockets({
    role: 'brood',
    source: 'port',
    wings
  })), ['brood-release-left']);
  assert.deepEqual(Array.from(resolvePrismMothEmitterSockets({
    role: 'core',
    source: 'core',
    wings
  })), ['prism-core']);
  assert.deepEqual(Array.from(resolvePrismMothEmitterSockets({
    role: 'feather',
    source: 'both',
    wings: { port: false, starboard: true }
  })), ['wing-edge-right']);
  assert.deepEqual(Array.from(resolvePrismMothEmitterSockets({
    role: 'trail',
    source: 'port',
    wings: { port: false, starboard: true }
  })), [], 'a destroyed wing must never retain an emitter');
  assert.deepEqual(Array.from(PRISM_MOTH_PROJECTILE_KIND_IDS), ['prism-feather']);
  assert.deepEqual(Array.from(PRISM_MOTH_COCOON_FRAME_IDS), [
    'cocoon.lifecycle.0',
    'cocoon.lifecycle.1',
    'cocoon.lifecycle.2',
    'cocoon.lifecycle.3'
  ]);
  assert.deepEqual(Array.from(PRISM_MOTH_BROODLING_FRAME_IDS), [
    'broodling.flutter.0',
    'broodling.flutter.1',
    'broodling.flutter.2',
    'broodling.flutter.3'
  ]);
});

test('Prism Moth runtime is deterministic and contains no foreign choreography or playfield copy', () => {
  assert.doesNotMatch(
    source,
    /Math\.random|\bHelios\b|machinegun|machine-gun|proximity mine|mechanical claw|spawnFloatingText|SAFE GAP|aiming line|future trajectory/i
  );
  const first = resolvePrismMothSeedBranch({
    seedKey: 'prism-fixed-seed',
    sequence: 7,
    useIndex: 3,
    branchCount: 6
  });
  assert.equal(resolvePrismMothSeedBranch({
    seedKey: 'prism-fixed-seed',
    sequence: 7,
    useIndex: 3,
    branchCount: 6
  }), first);
  assert.ok(first >= 0 && first < 6);
});

test('Prism attack parameter helpers clamp every tuning surface to safe bounded values', () => {
  const weave = resolvePrismWingbeatWeaveParameters({
    cadenceFrames: -99,
    featherCount: 100,
    featherSpacingRadians: 9,
    fanAngleRadians: -2,
    safeLaneWidthRatio: 0.01,
    driftSpeedRatio: 5,
    sequenceLength: 99
  });
  assert.deepEqual(toPlain(weave), {
    cadenceFrames: 8,
    featherCount: 9,
    featherSpacingRadians: 0.22,
    fanAngleRadians: 0.28,
    safeLaneWidthRatio: 0.24,
    driftSpeedRatio: 0.18,
    sequenceLength: 5
  });

  const brood = resolvePrismBroodProcessionParameters({
    broodNodeCount: 99,
    hatchDelayFrames: 1,
    formationSequence: -5,
    broodSpeedRatio: 2,
    formationSpacingRatio: 0,
    routeWidthRatio: 0,
    formationWaves: 99
  });
  assert.deepEqual(toPlain(brood), {
    broodNodeCount: 5,
    hatchDelayFrames: 10,
    formationSequence: 0,
    broodSpeedRatio: 0.022,
    formationSpacingRatio: 0.16,
    routeWidthRatio: 0.24,
    formationWaves: 2
  });

  const swoop = resolvePrismLunarSwoopParameters({
    passCount: 99,
    swoopFrames: 1,
    curveDepthRatio: 9,
    edgeTelegraphFrames: 1,
    featherTrailFrames: 999,
    recoveryFrames: 1
  });
  assert.deepEqual(toPlain(swoop), {
    passCount: 3,
    swoopFrames: 42,
    curveDepthRatio: 0.34,
    edgeTelegraphFrames: 24,
    featherTrailFrames: 90,
    recoveryFrames: 36
  });

  const signature = resolvePrismKaleidoscopeBroodParameters({
    broodNodeCount: 1,
    activationSequence: 99_999,
    rotationDirection: 'counterclockwise',
    corridorWidthRatio: 0.01,
    patternBeats: 99,
    coreChargeFrames: 1,
    recoveryFrames: 999
  });
  assert.deepEqual(toPlain(signature), {
    broodNodeCount: 4,
    activationSequence: 4095,
    rotationDirection: 'counterclockwise',
    corridorWidthRatio: 0.26,
    patternBeats: 5,
    coreChargeFrames: 48,
    recoveryFrames: 240
  });
  [weave, brood, swoop, signature].forEach((parameters) => {
    assert.equal(Object.isFrozen(parameters), true);
  });
});

test('typed action stages isolate damage to fire and cleanup after recovery', () => {
  const durations = resolvePrismMothStageDurations('wingbeat-weave', {
    preparationFrames: 12,
    telegraphFrames: 18,
    fireFrames: 12,
    recoveryFrames: 12
  });
  const preparation = samplePrismMothActionStage({ elapsedFrames: 0, durations });
  const telegraph = samplePrismMothActionStage({ elapsedFrames: 12, durations });
  const fire = samplePrismMothActionStage({ elapsedFrames: 30, durations });
  const recovery = samplePrismMothActionStage({ elapsedFrames: 42, durations });
  const complete = samplePrismMothActionStage({ elapsedFrames: 54, durations });

  assert.deepEqual(
    [preparation.stage, telegraph.stage, fire.stage, recovery.stage, complete.stage],
    ['preparation', 'telegraph', 'fire', 'recovery', 'recovery']
  );
  assert.equal(preparation.damageWindowActive, false);
  assert.equal(telegraph.damageWindowActive, false);
  assert.equal(fire.damageWindowActive, true);
  assert.equal(recovery.damageWindowActive, false);
  assert.equal(complete.damageWindowActive, false);
  assert.equal(complete.complete, true);
  assert.equal(complete.shouldCleanupOwnedArtifacts, true);
  assert.equal(complete.stageProgress, 1);
});

test('wingbeat sequence deterministically alternates live wings and never emits from a missing wing', () => {
  const full = resolvePrismMothWingbeatSequence({
    seedKey: 'wing-seed',
    sequence: 2,
    useIndex: 1,
    phaseIndex: 1,
    sequenceLength: 5,
    cadenceFrames: 16,
    wings: { port: true, starboard: true }
  });
  const replay = resolvePrismMothWingbeatSequence({
    seedKey: 'wing-seed',
    sequence: 2,
    useIndex: 1,
    phaseIndex: 1,
    sequenceLength: 5,
    cadenceFrames: 16,
    wings: { port: true, starboard: true }
  });
  assert.deepEqual(toPlain(replay), toPlain(full));
  assert.equal(full.length, 5);
  assert.notEqual(full[0].source, full[1].source);
  assert.equal(full[0].source, full[2].source);
  assert.equal(full[1].source, full[3].source);
  assert.equal(full[4].source, 'both');
  assert.deepEqual(full.map(({ frameOffset }) => frameOffset), [0, 16, 32, 48, 64]);

  const portOnly = resolvePrismMothWingbeatSequence({
    seedKey: 'wing-seed',
    phaseIndex: 2,
    wings: { port: true, starboard: false }
  });
  assert.ok(portOnly.every(({ source }) => source === 'port'));
  assert.ok(portOnly.some(({ delayedBroodEcho }) => delayedBroodEcho));
  assert.deepEqual(Array.from(resolvePrismMothWingbeatSequence({
    seedKey: 'wing-seed',
    wings: { port: false, starboard: false }
  })), []);
});

test('brood formations use six bounded templates with protected spawns and phase-two reversal', () => {
  assert.deepEqual(Array.from(PRISM_MOTH_FORMATION_TEMPLATE_IDS), [
    'mirrored-arcs',
    'alternating-diagonals',
    'v-opening',
    'split-corridor',
    'staggered-wave',
    'center-bloom'
  ]);
  const templates = PRISM_MOTH_FORMATION_TEMPLATE_IDS.map((_, sequence) => (
    resolvePrismMothBroodFormation({
      sequence,
      nodeCount: 5,
      hatchDelayFrames: 20,
      waveIndex: 0,
      phaseIndex: 1
    })
  ));
  assert.equal(new Set(templates.map(({ templateId }) => templateId)).size, 6);
  templates.forEach((formation, sequence) => {
    assert.equal(formation.templateId, resolvePrismMothFormationTemplateId(sequence));
    assert.equal(formation.slots.length, 5);
    assert.equal(Object.isFrozen(formation), true);
    assert.equal(Object.isFrozen(formation.slots), true);
    formation.slots.forEach((slot, index) => {
      assert.equal(Object.isFrozen(slot), true);
      assert.equal(slot.index, index);
      assert.ok(slot.cocoonXRatio >= 0.06 && slot.cocoonXRatio <= 0.94);
      assert.ok(slot.cocoonYRatio < PRISM_MOTH_PLAYER_SPAWN_PROTECTED_Y_RATIO);
      assert.equal(slot.hatchDelayFrames, index * 20);
    });
  });

  const base = resolvePrismMothBroodFormation({
    sequence: 3,
    nodeCount: 4,
    waveIndex: 1,
    phaseIndex: 1
  });
  const remixed = resolvePrismMothBroodFormation({
    sequence: 3,
    nodeCount: 4,
    waveIndex: 1,
    phaseIndex: 2
  });
  assert.equal(base.reversed, false);
  assert.equal(remixed.reversed, true);
  assert.equal(remixed.corridorStartRatio, 1 - base.corridorEndRatio);
  assert.equal(remixed.corridorEndRatio, 1 - base.corridorStartRatio);
  assert.equal(remixed.slots[0].side, base.slots[0].side === 'port' ? 'starboard' : 'port');

  const seeded = resolvePrismMothFormationSequence({
    seedKey: 'formation-seed',
    sequence: 4,
    waveIndex: 1,
    phaseIndex: 2
  });
  assert.equal(resolvePrismMothFormationSequence({
    seedKey: 'formation-seed',
    sequence: 4,
    waveIndex: 1,
    phaseIndex: 2
  }), seeded);
});

test('every retained brood path preserves the constructive center route on mobile and desktop', () => {
  for (const arena of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 }
  ]) {
    for (let sequence = 0; sequence < PRISM_MOTH_FORMATION_TEMPLATE_IDS.length; sequence += 1) {
      const formation = resolvePrismMothBroodFormation({
        sequence,
        nodeCount: 5,
        routeWidthRatio: 0.3,
        waveIndex: 0,
        phaseIndex: 1
      });
      for (let step = 0; step <= 80; step += 1) {
        const progress = step / 80;
        const safety = evaluatePrismMothFormationRouteSafety({
          formation,
          progress,
          arenaWidth: arena.width,
          arenaHeight: arena.height,
          playerRadiusPx: 12,
          broodRadiusPx: 10
        });
        assert.equal(
          safety.routeSafe,
          true,
          `${formation.templateId} lost its route at ${arena.width}x${arena.height}, t=${progress}`
        );
        assert.ok(safety.minimumReplayedClearancePx >= PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX);
      }
      const corridor = samplePrismMothFormationCorridor({
        formation,
        progress: 0.5,
        arenaWidth: arena.width
      });
      assert.equal(corridor.routeSafe, true);
      assert.ok(corridor.replayedClearancePx >= PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX);
    }
  }
});

test('Brood Procession locks a bounded player lane and bends every safe formation toward it', () => {
  for (const arena of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 }
  ]) {
    for (const pursuitTargetRatio of [0.2, 0.5, 0.8]) {
      for (let sequence = 0; sequence < PRISM_MOTH_FORMATION_TEMPLATE_IDS.length; sequence += 1) {
        const baseline = resolvePrismMothBroodFormation({
          sequence,
          nodeCount: 5,
          routeWidthRatio: 0.3
        });
        const targeted = resolvePrismMothBroodFormation({
          sequence,
          nodeCount: 5,
          routeWidthRatio: 0.3,
          pursuitTargetRatio
        });
        assert.equal(targeted.pursuitTargetRatio, pursuitTargetRatio);
        assert.ok(
          Math.abs(targeted.corridorEndRatio - pursuitTargetRatio)
            <= Math.abs(baseline.corridorEndRatio - pursuitTargetRatio)
        );
        for (let step = 0; step <= 80; step += 1) {
          const progress = step / 80;
          const safety = evaluatePrismMothFormationRouteSafety({
            formation: targeted,
            progress,
            arenaWidth: arena.width,
            arenaHeight: arena.height,
            playerRadiusPx: 12,
            broodRadiusPx: 10
          });
          assert.equal(
            safety.routeSafe,
            true,
            `${targeted.templateId} pursuit ${pursuitTargetRatio} lost its route at ${arena.width}x${arena.height}, t=${progress}`
          );
        }
      }
    }
  }
});

test('brood paths are smooth and lifecycle damage exists only during visible flight', () => {
  const formation = resolvePrismMothBroodFormation({ sequence: 2, nodeCount: 4 });
  const slot = formation.slots[1];
  const samples = Array.from({ length: 121 }, (_, index) => samplePrismMothBroodPath({
    formation,
    slot,
    progress: index / 120,
    arenaWidth: 390,
    arenaHeight: 844
  }));
  samples.forEach((sample, index) => {
    assert.equal(Object.isFrozen(sample), true);
    assert.ok(Number.isFinite(sample.centerX));
    assert.ok(Number.isFinite(sample.centerY));
    if (index > 0) {
      assert.ok(Math.abs(sample.centerX - samples[index - 1].centerX) < 18);
      assert.ok(Math.abs(sample.centerY - samples[index - 1].centerY) < 24);
    }
  });
  assert.equal(samples.at(-1).outsideArena, true);

  const lifecycleFrames = [0, 30, 52, 70, 250, 280];
  const lifecycle = lifecycleFrames.map((ageFrames) => samplePrismMothBroodLifecycle({
    ageFrames,
    deployFrames: 30,
    hatchDelayFrames: 22,
    hatchFrames: 18,
    flightFrames: 180,
    exitFrames: 30
  }));
  assert.deepEqual(lifecycle.map(({ stage }) => stage), [
    'cocoon-deploying',
    'cocoon-armed',
    'hatching',
    'flying',
    'exiting',
    'expired'
  ]);
  lifecycle.forEach((sample) => {
    assert.equal(sample.damageActive, sample.stage === 'flying');
    assert.equal(sample.collisionActive, sample.stage === 'flying');
    assert.equal(
      sample.targetable,
      ['cocoon-armed', 'hatching', 'flying'].includes(sample.stage)
    );
    assert.equal(sample.shouldCleanup, sample.stage === 'expired');
  });
  assert.deepEqual(lifecycle.map(({ visualFrameId }) => visualFrameId), [
    'cocoon.lifecycle.0',
    'cocoon.lifecycle.1',
    'cocoon.lifecycle.2',
    'broodling.flutter.0',
    'broodling.flutter.0',
    null
  ]);
});

test('lunar swoop resolves two or three alternating visible passes with live-wing trail ownership', () => {
  const full = resolvePrismMothSwoopPasses({
    seedKey: 'swoop-seed',
    sequence: 3,
    useIndex: 2,
    phaseIndex: 2,
    requestedPassCount: 99,
    wings: { port: true, starboard: true }
  });
  assert.equal(full.length, 3);
  assert.notEqual(full[0].entrySide, full[1].entrySide);
  assert.equal(full[0].entrySide, full[2].entrySide);
  assert.equal(full[2].leavesCocoon, true);
  assert.deepEqual(toPlain(resolvePrismMothSwoopPasses({
    seedKey: 'swoop-seed',
    sequence: 3,
    useIndex: 2,
    phaseIndex: 2,
    requestedPassCount: 99,
    wings: { port: true, starboard: true }
  })), toPlain(full));

  const starboardOnly = resolvePrismMothSwoopPasses({
    seedKey: 'swoop-seed',
    requestedPassCount: 2,
    wings: { port: false, starboard: true }
  });
  assert.equal(starboardOnly.length, 2);
  assert.ok(starboardOnly.every(({ trailSourceWing }) => trailSourceWing === 'starboard'));
  assert.deepEqual(Array.from(resolvePrismMothSwoopPasses({
    seedKey: 'swoop-seed',
    wings: { port: false, starboard: false }
  })), []);

  for (const arena of [
    { width: 390, height: 844, bossWidth: 220, bossHeight: 200 },
    { width: 1280, height: 720, bossWidth: 280, bossHeight: 240 }
  ]) {
    for (const pass of full) {
      const samples = Array.from({ length: 121 }, (_, index) => samplePrismMothSwoopPass({
        pass,
        progress: index / 120,
        arenaWidth: arena.width,
        arenaHeight: arena.height,
        bossWidth: arena.bossWidth,
        bossHeight: arena.bossHeight
      }));
      samples.forEach((sample, index) => {
        assert.equal(sample.visible, true);
        assert.ok(sample.x >= 0 && sample.x + arena.bossWidth <= arena.width);
        assert.ok(sample.y >= 0 && sample.y + arena.bossHeight <= arena.height - 72);
        assert.equal(sample.damageActive && !sample.visible, false);
        if (index > 0) {
          assert.ok(
            Math.abs(sample.centerX - samples[index - 1].centerX) < arena.width / 64
          );
          assert.ok(
            Math.abs(sample.centerY - samples[index - 1].centerY) < arena.height / 64
          );
        }
      });
      assert.equal(samples[0].damageActive, false);
      assert.equal(samples[60].damageActive, true);
      assert.equal(samples.at(-1).damageActive, false);
      assert.equal(samples[60].safeEdge, 'lower');
    }
  }
});

test('Kaleidoscope Brood builds one continuous ordered corridor and filters destroyed wings', () => {
  const parameters = resolvePrismKaleidoscopeBroodParameters({
    patternBeats: 5,
    broodNodeCount: 6,
    corridorWidthRatio: 0.3,
    rotationDirection: 'clockwise'
  });
  const phaseTwo = resolvePrismMothSignatureSequence({
    seedKey: 'signature-seed',
    sequence: 8,
    useIndex: 1,
    phaseIndex: 2,
    parameters,
    wings: { port: true, starboard: false }
  });
  assert.equal(phaseTwo.length, 5);
  assert.equal(Object.isFrozen(phaseTwo), true);
  phaseTwo.forEach((beat, index) => {
    assert.equal(Object.isFrozen(beat), true);
    assert.equal(Object.isFrozen(beat.activatedNodeIndexes), true);
    assert.notEqual(beat.source, 'starboard');
    assert.ok(beat.activatedNodeIndexes.every((nodeIndex) => nodeIndex >= 0 && nodeIndex < 6));
    if (index > 0) {
      assert.equal(
        beat.corridorStartRatio,
        phaseTwo[index - 1].corridorEndRatio,
        'the route must not teleport between signature beats'
      );
    }
  });
  assert.equal(phaseTwo.at(-1).source, 'core');
  assert.equal(phaseTwo.at(-1).wingSection, 'core');
  assert.equal(phaseTwo.at(-1).finalEscapeBeat, true);
  assert.equal(phaseTwo.at(-1).corridorEndRatio, 0.5);
  const directionTransitions = phaseTwo.slice(1).filter((beat, index) => (
    beat.rotationDirection !== phaseTwo[index].rotationDirection
  ));
  assert.equal(directionTransitions.length, 1);
  assert.deepEqual(toPlain(resolvePrismMothSignatureSequence({
    seedKey: 'signature-seed',
    sequence: 8,
    useIndex: 1,
    phaseIndex: 2,
    parameters,
    wings: { port: true, starboard: false }
  })), toPlain(phaseTwo));

  const alternateActivation = resolvePrismMothSignatureSequence({
    seedKey: 'signature-seed',
    sequence: 8,
    useIndex: 1,
    phaseIndex: 2,
    parameters: resolvePrismKaleidoscopeBroodParameters({
      ...parameters,
      activationSequence: parameters.activationSequence + 1
    }),
    wings: { port: true, starboard: true }
  });
  const baseActivation = resolvePrismMothSignatureSequence({
    seedKey: 'signature-seed',
    sequence: 8,
    useIndex: 1,
    phaseIndex: 2,
    parameters,
    wings: { port: true, starboard: true }
  });
  assert.notDeepEqual(
    baseActivation.map(({ wingSection, formationTemplateId }) => ({ wingSection, formationTemplateId })),
    alternateActivation.map(({ wingSection, formationTemplateId }) => ({ wingSection, formationTemplateId })),
    'the bounded activation-order control must materially change the signature sequence'
  );
});

test('sub-50% Kaleidoscope Brood deterministically selects four distinct safe routes', () => {
  assert.deepEqual(Array.from(PRISM_MOTH_SIGNATURE_ROUTE_IDS), [
    'nursery-alternating',
    'metamorphosis-crosscut',
    'metamorphosis-reverse-crosscut',
    'metamorphosis-diamond',
    'metamorphosis-reverse-diamond'
  ]);
  const expectedTargets = new Map([
    ['metamorphosis-crosscut', [0.3, 0.48, 0.7, 0.44, 0.5]],
    ['metamorphosis-reverse-crosscut', [0.7, 0.52, 0.3, 0.56, 0.5]],
    ['metamorphosis-diamond', [0.42, 0.7, 0.34, 0.62, 0.5]],
    ['metamorphosis-reverse-diamond', [0.58, 0.3, 0.66, 0.38, 0.5]]
  ]);
  const routes = new Map();
  const parameters = resolvePrismKaleidoscopeBroodParameters({
    patternBeats: 5,
    corridorWidthRatio: 0.26
  });
  for (let useIndex = 0; useIndex < 4; useIndex += 1) {
    const beats = resolvePrismMothSignatureSequence({
      seedKey: 'low-health-route-families',
      sequence: 7,
      useIndex,
      phaseIndex: 2,
      parameters,
      wings: { port: true, starboard: true }
    });
    const routeId = beats[0].routeId;
    assert.ok(beats.every((beat) => beat.routeId === routeId));
    assert.deepEqual(
      beats.map(({ corridorEndRatio }) => corridorEndRatio),
      expectedTargets.get(routeId)
    );
    beats.forEach((beat, index) => {
      assert.ok(beat.corridorEndRatio >= 0.3 && beat.corridorEndRatio <= 0.7);
      if (index > 0) {
        assert.equal(beat.corridorStartRatio, beats[index - 1].corridorEndRatio);
      }
      for (const arenaWidth of [390, 1280]) {
        for (let step = 0; step <= 40; step += 1) {
          const sample = samplePrismMothSignatureCorridor({
            beat,
            progress: step / 40,
            arenaWidth,
            playerRadiusPx: 12
          });
          assert.equal(sample.routeSafe, true);
        }
      }
    });
    assert.deepEqual(toPlain(resolvePrismMothSignatureSequence({
      seedKey: 'low-health-route-families',
      sequence: 7,
      useIndex,
      phaseIndex: 2,
      parameters,
      wings: { port: true, starboard: true }
    })), toPlain(beats));
    routes.set(routeId, beats.map(({ corridorEndRatio }) => corridorEndRatio));
  }
  assert.equal(routes.size, 4);

  const nursery = resolvePrismMothSignatureSequence({
    seedKey: 'low-health-route-families',
    phaseIndex: 1,
    parameters,
    wings: { port: true, starboard: true }
  });
  assert.ok(nursery.every((beat) => beat.routeId === 'nursery-alternating'));
});

test('signature corridor exceeds replay clearance on canonical mobile and desktop widths', () => {
  const beats = resolvePrismMothSignatureSequence({
    seedKey: 'signature-route',
    phaseIndex: 2,
    parameters: resolvePrismKaleidoscopeBroodParameters({
      patternBeats: 5,
      corridorWidthRatio: 0.26
    }),
    wings: { port: true, starboard: true }
  });
  for (const arenaWidth of [390, 1280]) {
    beats.forEach((beat, beatIndex) => {
      for (let step = 0; step <= 60; step += 1) {
        const sample = samplePrismMothSignatureCorridor({
          beat,
          progress: step / 60,
          arenaWidth,
          playerRadiusPx: 12,
          geometryUncertaintyPx: PRISM_MOTH_GEOMETRY_UNCERTAINTY_PX
        });
        assert.equal(sample.routeSafe, true, `beat ${beatIndex} failed at ${arenaWidth}px`);
        assert.ok(sample.replayedClearancePx >= PRISM_MOTH_MIN_ROUTE_CLEARANCE_PX);
        assert.ok(sample.minimumX >= 0);
        assert.ok(sample.maximumX <= arenaWidth);
      }
    });
  }
});

test('phase two remixes learned rules instead of only increasing numeric pressure', () => {
  const phaseOne = resolvePrismMothPhaseRemixRules({
    seedKey: 'remix-seed',
    sequence: 1,
    useIndex: 0,
    phaseIndex: 1
  });
  const phaseTwo = resolvePrismMothPhaseRemixRules({
    seedKey: 'remix-seed',
    sequence: 1,
    useIndex: 0,
    phaseIndex: 2
  });
  assert.equal(phaseOne.wingbeatWeave.delayedBroodEcho, false);
  assert.equal(phaseOne.broodProcession.reverseSecondWave, false);
  assert.equal(phaseOne.lunarPrismSwoop.leaveFinalCocoon, false);
  assert.equal(phaseOne.kaleidoscopeBrood.corridorDirectionChanges, 0);
  assert.equal(phaseTwo.wingbeatWeave.delayedBroodEcho, true);
  assert.equal(phaseTwo.broodProcession.reverseSecondWave, true);
  assert.equal(phaseTwo.lunarPrismSwoop.alternateEntryEdge, true);
  assert.equal(phaseTwo.lunarPrismSwoop.leaveFinalCocoon, true);
  assert.equal(phaseTwo.kaleidoscopeBrood.corridorDirectionChanges, 1);
  assert.equal(Object.isFrozen(phaseTwo.kaleidoscopeBrood), true);
});

test('wing availability produces deliberate one-wing remixes and core-brood fallbacks', () => {
  const full = resolvePrismMothActionForWings({
    actionId: 'wingbeat-weave',
    wings: { port: true, starboard: true }
  });
  const single = resolvePrismMothActionForWings({
    actionId: 'wingbeat-weave',
    wings: { port: true, starboard: false }
  });
  const noSwoop = resolvePrismMothActionForWings({
    actionId: 'lunar-prism-swoop',
    wings: { port: false, starboard: false }
  });
  const coreBrood = resolvePrismMothActionForWings({
    actionId: 'brood-procession',
    wings: { port: false, starboard: false }
  });
  assert.deepEqual(toPlain(full), {
    requestedActionId: 'wingbeat-weave',
    resolvedActionId: 'wingbeat-weave',
    requestedActionDisabled: false,
    fallbackMode: 'none',
    operationalWings: ['port', 'starboard'],
    coreOwnsFallback: false
  });
  assert.equal(single.fallbackMode, 'single-wing');
  assert.deepEqual(Array.from(single.operationalWings), ['port']);
  assert.equal(noSwoop.requestedActionDisabled, true);
  assert.equal(noSwoop.resolvedActionId, 'brood-procession');
  assert.equal(noSwoop.fallbackMode, 'core-brood');
  assert.equal(coreBrood.requestedActionDisabled, false);
  assert.equal(coreBrood.coreOwnsFallback, true);
});

test('owner loss, action cancellation, and expiry immediately suppress collision and damage', () => {
  const active = resolvePrismMothOwnedArtifactState({
    ownerAlive: true,
    sourceActionActive: true,
    lifecycleComplete: false,
    visibleCollisionActive: true,
    visibleDamageActive: true
  });
  assert.deepEqual(toPlain(active), {
    shouldCleanup: false,
    collisionActive: true,
    damageActive: true
  });
  for (const terminal of [
    { ownerAlive: false, sourceActionActive: true, lifecycleComplete: false },
    { ownerAlive: true, sourceActionActive: false, lifecycleComplete: false },
    { ownerAlive: true, sourceActionActive: true, lifecycleComplete: true }
  ]) {
    const state = resolvePrismMothOwnedArtifactState({
      ...terminal,
      visibleCollisionActive: true,
      visibleDamageActive: true
    });
    assert.deepEqual(toPlain(state), {
      shouldCleanup: true,
      collisionActive: false,
      damageActive: false
    });
  }
  const hidden = resolvePrismMothOwnedArtifactState({
    ownerAlive: true,
    sourceActionActive: true,
    lifecycleComplete: false,
    visibleCollisionActive: false,
    visibleDamageActive: true
  });
  assert.equal(hidden.damageActive, false);
});
