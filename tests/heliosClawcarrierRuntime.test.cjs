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
  'HeliosClawcarrierRuntime.ts'
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
    Object
  }
);

const {
  HELIOS_MACHINE_GUN_CHANNEL_FIRST_SHOT_FRAME,
  HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE,
  HELIOS_MINE_DEPLOY_FRAMES,
  HELIOS_MINE_FORMATION_TEMPLATE_IDS,
  buildHeliosReactorFanAngles,
  resolveHeliosClampPlan,
  resolveHeliosCornerClampPlacement,
  resolveHeliosCrossfireAngle,
  resolveHeliosCrossfireSides,
  resolveHeliosMachineGunChannelAngle,
  resolveHeliosMachineGunChannelHorizontalPadding,
  resolveHeliosMachineGunChannelSequence,
  resolveHeliosMachineGunChannelTargetPadding,
  resolveHeliosMachineGunChannelTargets,
  resolveHeliosMineArmPoint,
  resolveHeliosMineFormation,
  resolveHeliosMineFormationSequence,
  resolveHeliosMineFormationTemplateId,
  sampleHeliosCornerClamp,
  sampleHeliosClawSweep,
  sampleHeliosCrossfirePulse,
  sampleHeliosMachineGunChannelMovement,
  sampleHeliosMachineGunChannelPulse,
  sampleHeliosMineDeployment,
  sampleHeliosMineLifecycle,
  sampleHeliosMineRuntime,
  sampleHeliosReactorFanShot,
  sampleHeliosTrackingPincer
} = moduleBox.exports;

test('Helios rotary fire emits one alternating live-mount pulse per cadence slot', () => {
  const firing = [];
  const samples = [];
  for (let elapsedFrames = 0; elapsedFrames <= 28; elapsedFrames += 1) {
    const sample = sampleHeliosCrossfirePulse({
      elapsedFrames,
      roundsPerSide: 3,
      sides: ['port', 'starboard'],
      intervalFrames: 4
    });
    if (sample) samples.push({ elapsedFrames, ...sample });
    if (sample?.firing) firing.push({ elapsedFrames, ...sample });
  }

  assert.deepEqual(
    firing.map(({ elapsedFrames, shotIndex, side, sideShotIndex }) => ({
      elapsedFrames,
      shotIndex,
      side,
      sideShotIndex
    })),
    [
      { elapsedFrames: 2, shotIndex: 0, side: 'port', sideShotIndex: 0 },
      { elapsedFrames: 6, shotIndex: 1, side: 'starboard', sideShotIndex: 0 },
      { elapsedFrames: 10, shotIndex: 2, side: 'port', sideShotIndex: 1 },
      { elapsedFrames: 14, shotIndex: 3, side: 'starboard', sideShotIndex: 1 },
      { elapsedFrames: 18, shotIndex: 4, side: 'port', sideShotIndex: 2 },
      { elapsedFrames: 22, shotIndex: 5, side: 'starboard', sideShotIndex: 2 }
    ]
  );
  assert.equal(
    new Set(firing.map(({ elapsedFrames }) => elapsedFrames)).size,
    firing.length,
    'rapid fire must never materialize multiple rounds on one simulation frame'
  );
  firing.forEach((sample) => {
    assert.equal(sample.flashEnergy, 1);
    assert.equal(sample.recoilEnergy, 1);
  });
  assert.ok(
    samples.some((sample) => !sample.firing && sample.flashEnergy > 0),
    'the synchronized flash/recoil may decay for one visible frame after each shot'
  );
});

test('Helios moving machine-gun channel approaches, sweeps, reverses, and returns without teleporting', () => {
  assert.equal(HELIOS_MACHINE_GUN_CHANNEL_MOTION_CUE, 'machinegun-channel');
  const input = {
    sequence: 0,
    anchorX: 400,
    anchorY: 100,
    arenaWidth: 1000,
    arenaHeight: 800,
    bossWidth: 200,
    bossHeight: 160,
    horizontalPadding: 40,
    sweepRangeRatio: 0.5,
    sweepPasses: 1,
    upperLaneRatio: 0.15
  };
  const warningStart = sampleHeliosMachineGunChannelMovement({
    ...input,
    stage: 'warning',
    progress: 0
  });
  const warningEnd = sampleHeliosMachineGunChannelMovement({
    ...input,
    stage: 'warning',
    progress: 1
  });
  const fireStart = sampleHeliosMachineGunChannelMovement({
    ...input,
    stage: 'fire',
    progress: 0
  });
  const fireMiddle = sampleHeliosMachineGunChannelMovement({
    ...input,
    stage: 'fire',
    progress: 0.5
  });
  const fireEnd = sampleHeliosMachineGunChannelMovement({
    ...input,
    stage: 'fire',
    progress: 1
  });
  const recoveryEnd = sampleHeliosMachineGunChannelMovement({
    ...input,
    stage: 'recovery',
    progress: 1
  });

  assert.deepEqual(
    [warningStart.x, warningStart.y, warningEnd.x, warningEnd.y],
    [400, 100, 150, 120]
  );
  assert.deepEqual(
    [fireStart.x, fireMiddle.x, fireEnd.x],
    [150, 400, 650]
  );
  assert.equal(warningEnd.x, fireStart.x, 'warning must finish at the first firing position');
  assert.equal(warningEnd.y, fireStart.y);
  assert.equal(fireStart.firing, true);
  assert.equal(warningEnd.firing, false);
  assert.deepEqual([recoveryEnd.x, recoveryEnd.y], [400, 100]);
  assert.equal(Object.isFrozen(fireMiddle), true);

  const reverseStart = sampleHeliosMachineGunChannelMovement({
    ...input,
    sequence: 1,
    stage: 'fire',
    progress: 0
  });
  const reverseEnd = sampleHeliosMachineGunChannelMovement({
    ...input,
    sequence: 1,
    stage: 'fire',
    progress: 1
  });
  assert.deepEqual([reverseStart.x, reverseEnd.x], [650, 150]);
  assert.equal(reverseStart.direction, -1);

  const twoPassTurn = sampleHeliosMachineGunChannelMovement({
    ...input,
    sweepPasses: 2,
    stage: 'fire',
    progress: 0.5
  });
  const twoPassEnd = sampleHeliosMachineGunChannelMovement({
    ...input,
    sweepPasses: 2,
    stage: 'fire',
    progress: 1
  });
  assert.equal(twoPassTurn.x, 650);
  assert.equal(twoPassTurn.passIndex, 1);
  assert.equal(twoPassTurn.direction, -1);
  assert.equal(twoPassEnd.x, 150, 'two passes must reverse instead of wrapping');
});

test('Helios moving channel alternates its first sweep edge once per deterministic use', () => {
  const seedKey = 'helios-channel-seed';
  const sequences = Array.from({ length: 4 }, (_, useIndex) => (
    resolveHeliosMachineGunChannelSequence({
      sequence: 8,
      useIndex,
      seedKey
    })
  ));
  assert.deepEqual(
    sequences.map((sequence) => sequence % 2),
    [sequences[0] % 2, 1 - sequences[0] % 2, sequences[0] % 2, 1 - sequences[0] % 2]
  );
  assert.equal(
    resolveHeliosMachineGunChannelSequence({ sequence: 8, useIndex: 2, seedKey }),
    sequences[2],
    'fixed seed and use index must replay the same direction'
  );

  const movementInput = {
    anchorX: 400,
    anchorY: 100,
    arenaWidth: 1000,
    arenaHeight: 800,
    bossWidth: 200,
    bossHeight: 160,
    horizontalPadding: 40,
    sweepRangeRatio: 0.46,
    sweepPasses: 1,
    upperLaneRatio: 0.15
  };
  const firstStart = sampleHeliosMachineGunChannelMovement({
    ...movementInput,
    sequence: sequences[0],
    stage: 'fire',
    progress: 0
  });
  const firstEnd = sampleHeliosMachineGunChannelMovement({
    ...movementInput,
    sequence: sequences[0],
    stage: 'fire',
    progress: 1
  });
  const secondStart = sampleHeliosMachineGunChannelMovement({
    ...movementInput,
    sequence: sequences[1],
    stage: 'fire',
    progress: 0
  });
  const secondEnd = sampleHeliosMachineGunChannelMovement({
    ...movementInput,
    sequence: sequences[1],
    stage: 'fire',
    progress: 1
  });
  assert.deepEqual(
    [secondStart.x, secondEnd.x],
    [firstEnd.x, firstStart.x],
    'the next use must mirror the full sweep rather than repeating the same edge order'
  );
});

test('Helios moving channel maps its ordered safe gap across both viewport gutters', () => {
  assert.equal(resolveHeliosMachineGunChannelHorizontalPadding(true), 4);
  assert.equal(resolveHeliosMachineGunChannelHorizontalPadding(false), 24);
  assert.equal(resolveHeliosMachineGunChannelTargetPadding(true), 4);
  assert.equal(resolveHeliosMachineGunChannelTargetPadding(false, 1280), 396.8);

  const input = {
    startX: 0,
    endX: 93,
    arenaWidth: 390,
    channelWidthPixels: 122,
    edgePadding: resolveHeliosMachineGunChannelTargetPadding(true)
  };
  const left = resolveHeliosMachineGunChannelTargets({ ...input, bossX: 0 });
  const middle = resolveHeliosMachineGunChannelTargets({ ...input, bossX: 46.5 });
  const right = resolveHeliosMachineGunChannelTargets({ ...input, bossX: 93 });
  const mirroredLeft = resolveHeliosMachineGunChannelTargets({
    ...input,
    startX: 93,
    endX: 0,
    bossX: 0
  });

  assert.deepEqual(
    [left.portX, left.starboardX, left.centerX],
    [4, 126, 65]
  );
  assert.deepEqual(
    [middle.portX, middle.starboardX, middle.centerX],
    [134, 256, 195]
  );
  assert.deepEqual(
    [right.portX, right.starboardX, right.centerX],
    [264, 386, 325]
  );
  assert.deepEqual(mirroredLeft, left, 'target geometry depends on position, not sweep order');
  for (const sample of [left, middle, right]) {
    assert.equal(sample.starboardX - sample.portX, 122);
    assert.equal(Object.isFrozen(sample), true);
  }
});

test('Helios moving channel keeps both rails live on every cadence slot', () => {
  const firing = [];
  const samples = [];
  for (let elapsedFrames = 0; elapsedFrames <= 30; elapsedFrames += 1) {
    const sample = sampleHeliosMachineGunChannelPulse({
      elapsedFrames,
      durationFrames: 30,
      intervalFrames: 2,
      sequence: 0
    });
    if (sample) samples.push(sample);
    if (sample?.firing) firing.push(sample);
  }

  assert.equal(HELIOS_MACHINE_GUN_CHANNEL_FIRST_SHOT_FRAME, 2);
  assert.deepEqual(
    firing.map(({ elapsedFrames }) => elapsedFrames),
    [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28]
  );
  assert.deepEqual(
    firing.slice(0, 6).map(({ side }) => side),
    ['port', 'starboard', 'port', 'starboard', 'port', 'starboard']
  );
  firing.forEach((pulse) => {
    assert.deepEqual([...pulse.firingSides], ['port', 'starboard']);
  });
  assert.equal(new Set(firing.map(({ elapsedFrames }) => elapsedFrames)).size, firing.length);
  assert.equal(firing.at(-1).sideShotIndex, 6);
  assert.equal(sampleHeliosMachineGunChannelPulse({
    elapsedFrames: 30,
    durationFrames: 30
  }), undefined);
  assert.equal(
    samples.find(({ elapsedFrames }) => elapsedFrames === 3).flashEnergy,
    0.42,
    'each round owns one brief decay frame for its flash and local recoil'
  );
  assert.equal(
    sampleHeliosMachineGunChannelPulse({
      elapsedFrames: 2,
      durationFrames: 30,
      sequence: 1
    }).side,
    'starboard',
    'sequence parity deterministically swaps the first firing mount'
  );

  const vertical = Math.PI / 2;
  const portAngle = resolveHeliosMachineGunChannelAngle('port', 0.04);
  const starboardAngle = resolveHeliosMachineGunChannelAngle('starboard', 0.04);
  assert.ok(portAngle > vertical && starboardAngle < vertical);
  assert.ok(Math.abs((portAngle - vertical) - (vertical - starboardAngle)) < 1e-12);
  assert.ok(portAngle - vertical <= 0.2, 'channel streams remain generally down-screen');
});

test('Helios reactor fan stays downward, changes deterministic order, and staggers every projectile', () => {
  const minimum = Math.PI / 6;
  const maximum = Math.PI * 5 / 6;
  const ascending = buildHeliosReactorFanAngles({ sequence: 0, projectileCount: 7 });
  const descending = buildHeliosReactorFanAngles({ sequence: 1, projectileCount: 7 });
  const centerOut = buildHeliosReactorFanAngles({ sequence: 2, projectileCount: 7 });

  for (const pattern of [ascending, descending, centerOut]) {
    assert.equal(pattern.length, 7);
    pattern.forEach((angle) => {
      assert.ok(angle >= minimum && angle <= maximum);
      assert.ok(Math.sin(angle) > 0, 'all fan projectiles must travel down-screen');
    });
  }
  assert.deepEqual(Array.from(descending), Array.from(ascending).reverse());
  assert.notDeepEqual(Array.from(centerOut), Array.from(ascending));
  assert.deepEqual(
    buildHeliosReactorFanAngles({ sequence: 2, projectileCount: 7 }),
    centerOut
  );
  const leftBiased = buildHeliosReactorFanAngles({
    sequence: 3,
    projectileCount: 7,
    targetAngleRadians: minimum
  });
  const rightBiased = buildHeliosReactorFanAngles({
    sequence: 3,
    projectileCount: 7,
    targetAngleRadians: maximum
  });
  assert.ok(leftBiased[0] < rightBiased[0]);
  assert.ok(leftBiased.at(-1) < rightBiased.at(-1));

  const emitted = [];
  for (let elapsedFrames = 0; elapsedFrames < 50; elapsedFrames += 1) {
    const sample = sampleHeliosReactorFanShot({
      elapsedFrames,
      sequence: 2,
      projectileCount: 7,
      intervalFrames: 5
    });
    if (sample?.firing) emitted.push({ elapsedFrames, ...sample });
  }
  assert.deepEqual(emitted.map(({ elapsedFrames }) => elapsedFrames), [2, 7, 12, 17, 22, 27, 32]);
  assert.deepEqual(emitted.map(({ angleRadians }) => angleRadians), Array.from(centerOut));
  assert.equal(new Set(emitted.map(({ elapsedFrames }) => elapsedFrames)).size, 7);
});

test('Helios mines resolve six deterministic bounded templates with varied X, Y, delays, and speeds', () => {
  assert.deepEqual(Array.from(HELIOS_MINE_FORMATION_TEMPLATE_IDS), [
    'staggered-diagonal',
    'reverse-diagonal',
    'zigzag',
    'shallow-arc',
    'offset-triangle',
    'asymmetric-cluster'
  ]);
  const formations = Array.from(
    { length: HELIOS_MINE_FORMATION_TEMPLATE_IDS.length },
    (_, sequence) => resolveHeliosMineFormation({ sequence, count: 4 })
  );
  assert.equal(new Set(formations.map((formation) => formation[0].templateId)).size, 6);
  assert.equal(new Set(formations.map((formation) => JSON.stringify(
    formation.map(({ targetXRatio, targetYRatio }) => [targetXRatio, targetYRatio])
  ))).size, 6);

  formations.forEach((formation, sequence) => {
    assert.equal(Object.isFrozen(formation), true);
    assert.equal(formation.length, 4);
    assert.equal(formation[0].templateId, resolveHeliosMineFormationTemplateId(sequence));
    assert.equal(new Set(formation.map(({ targetXRatio }) => targetXRatio)).size, 4);
    assert.ok(
      new Set(formation.map(({ targetYRatio }) => targetYRatio)).size >= 3,
      `${formation[0].templateId} must vary Y instead of creating a horizontal line`
    );
    assert.equal(new Set(formation.map(({ delayFrames }) => delayFrames)).size, 4);
    assert.equal(new Set(formation.map(({ deployFrames }) => deployFrames)).size, 4);
    formation.forEach((slot, index) => {
      assert.equal(Object.isFrozen(slot), true);
      assert.equal(slot.index, index);
      assert.ok(slot.targetXRatio >= 0.18 && slot.targetXRatio <= 0.82);
      assert.ok(slot.targetYRatio >= 0.47 && slot.targetYRatio <= 0.79);
      assert.ok(slot.delayFrames >= 0 && slot.delayFrames <= 38);
      assert.ok(slot.deployFrames >= 36 && slot.deployFrames <= 48);
      assert.equal(slot.speedScale, HELIOS_MINE_DEPLOY_FRAMES / slot.deployFrames);
      assert.ok(slot.angleRadians >= Math.PI / 2 - 0.48);
      assert.ok(slot.angleRadians <= Math.PI / 2 + 0.48);
      for (const other of formation.slice(index + 1)) {
        assert.ok(
          Math.hypot(
            slot.targetXRatio - other.targetXRatio,
            slot.targetYRatio - other.targetYRatio
          ) >= 0.18,
          `${formation[0].templateId} must preserve normalized mine spacing`
        );
      }
    });
  });

  const first = resolveHeliosMineFormation({ sequence: 0, count: 4 });
  assert.deepEqual(resolveHeliosMineFormation({ sequence: 0, count: 4 }), first);
  assert.deepEqual(resolveHeliosMineFormation({ sequence: 6, count: 4 }), first);
  assert.equal(resolveHeliosMineFormation({ sequence: 0, count: 2 }).length, 2);
  assert.equal(resolveHeliosMineFormation({ sequence: 0, count: 99 }).length, 4);

  const armPoints = first.map((slot) => resolveHeliosMineArmPoint({
    slot,
    arenaWidth: 390,
    arenaHeight: 844,
    originX: 195,
    originY: 150,
    mineSize: 24
  }));
  assert.equal(new Set(armPoints.map(({ x }) => x)).size, 4);
  assert.equal(new Set(armPoints.map(({ y }) => y)).size, 4);
  armPoints.forEach((point, index) => {
    assert.equal(Object.isFrozen(point), true);
    assert.ok(point.x >= 24 && point.x <= 366);
    assert.ok(point.y >= 246 && point.y <= 814);
    assert.ok(Math.sin(point.angleRadians) > 0, 'mines must travel down-screen to arm');
    assert.equal(point.deployFrames, first[index].deployFrames);
  });
});

test('Helios mine template selection is stable for one gameplay seed and varies across seeds', () => {
  const sequence = 3;
  const seedKeys = [
    'helios:alpha',
    'helios:beta',
    'helios:gamma',
    'helios:delta',
    'helios:epsilon',
    'helios:zeta',
    'helios:eta',
    'helios:theta'
  ];
  const first = resolveHeliosMineFormationSequence({
    sequence,
    seedKey: seedKeys[0]
  });
  assert.equal(
    resolveHeliosMineFormationSequence({ sequence, seedKey: seedKeys[0] }),
    first,
    'replaying the same gameplay seed must select the same mine formation'
  );

  const selectedTemplates = seedKeys.map((seedKey) => (
    resolveHeliosMineFormation({
      sequence: resolveHeliosMineFormationSequence({ sequence, seedKey }),
      count: 4
    })[0].templateId
  ));
  assert.ok(
    new Set(selectedTemplates).size >= 3,
    'bounded seeded variation must visibly exercise several authored templates'
  );
});

test('Helios mine deployment and lifecycle share one exact cubic runtime sample', () => {
  const start = sampleHeliosMineDeployment({
    ageFrames: 0,
    deployFrames: 40,
    startX: 100,
    startY: 100,
    armX: 300,
    armY: 500
  });
  const middle = sampleHeliosMineDeployment({
    ageFrames: 20,
    deployFrames: 40,
    startX: 100,
    startY: 100,
    armX: 300,
    armY: 500
  });
  const complete = sampleHeliosMineDeployment({
    ageFrames: 40,
    deployFrames: 40,
    startX: 100,
    startY: 100,
    armX: 300,
    armY: 500
  });
  const settled = sampleHeliosMineDeployment({
    ageFrames: 41,
    deployFrames: 40,
    startX: 100,
    startY: 100,
    armX: 300,
    armY: 500
  });

  assert.deepEqual(
    [start.centerX, start.centerY, start.velocityX, start.velocityY, start.complete],
    [100, 100, 0, 0, false]
  );
  assert.equal(middle.progress, 0.5);
  assert.equal(middle.easedProgress, 0.875);
  assert.deepEqual([middle.centerX, middle.centerY], [275, 450]);
  assert.ok(middle.velocityX > 0 && middle.velocityY > 0);
  assert.deepEqual([complete.centerX, complete.centerY, complete.complete], [300, 500, true]);
  assert.deepEqual([settled.centerX, settled.centerY, settled.velocityX, settled.velocityY], [
    300, 500, 0, 0
  ]);

  const deploying = sampleHeliosMineLifecycle({
    ageFrames: 39,
    deployFrames: 40,
    triggerFrame: -1,
    distanceToPlayer: 200
  });
  const armed = sampleHeliosMineLifecycle({
    ageFrames: 40,
    deployFrames: 40,
    triggerFrame: -1,
    distanceToPlayer: 200
  });
  const proximity = sampleHeliosMineLifecycle({
    ageFrames: 60,
    deployFrames: 40,
    triggerFrame: -1,
    distanceToPlayer: 60
  });
  const explosionWarmup = sampleHeliosMineLifecycle({
    ageFrames: 102,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  const activeExplosion = sampleHeliosMineLifecycle({
    ageFrames: 109,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  const coolingExplosion = sampleHeliosMineLifecycle({
    ageFrames: 119,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  const expired = sampleHeliosMineLifecycle({
    ageFrames: 142,
    triggerFrame: 100,
    distanceToPlayer: 0
  });
  assert.deepEqual(
    [deploying.stage, armed.stage, proximity.stage, explosionWarmup.stage,
      activeExplosion.stage, coolingExplosion.stage, expired.stage],
    ['deploying', 'armed', 'armed', 'exploding', 'exploding', 'exploding', 'expired']
  );
  assert.equal(proximity.shouldTrigger, true);
  assert.equal(explosionWarmup.damageActive, false);
  assert.equal(activeExplosion.damageActive, true);
  assert.equal(coolingExplosion.damageActive, false);
  assert.equal(expired.shouldCleanup, true);

  const slot = resolveHeliosMineFormation({ sequence: 2, count: 3 })[1];
  const runtime = sampleHeliosMineRuntime({
    slot,
    ageFrames: slot.deployFrames,
    triggerFrame: -1,
    distanceToPlayer: 200,
    arenaWidth: 390,
    arenaHeight: 844,
    originX: 195,
    originY: 150,
    mineSize: 24
  });
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(runtime.deployment.complete, true);
  assert.equal(runtime.lifecycle.stage, 'armed');
  assert.deepEqual(
    [runtime.deployment.centerX, runtime.deployment.centerY],
    [runtime.armPoint.x, runtime.armPoint.y],
    'engine and proof must settle on the exact shared arm point'
  );
});

test('Helios corner clamp resolves surviving anatomy and damages only during visible closure', () => {
  const toPlain = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'port', portOperational: true, starboardOperational: true })
  ), { activeSide: 'port', fallbackToCrossfire: false, skipped: false });
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'port', portOperational: false, starboardOperational: true })
  ), { fallbackToCrossfire: false, skipped: true });
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'starboard', portOperational: true, starboardOperational: false })
  ), { fallbackToCrossfire: false, skipped: true });
  assert.deepEqual(toPlain(
    resolveHeliosClampPlan({ requestedSide: 'starboard', portOperational: false, starboardOperational: false })
  ), { fallbackToCrossfire: true, skipped: false });

  const warning = sampleHeliosCornerClamp({ stage: 'warning', progress: 0.7, side: 'port' });
  const approach = sampleHeliosCornerClamp({ stage: 'fire', progress: 0.16, side: 'port' });
  const closure = sampleHeliosCornerClamp({ stage: 'fire', progress: 0.42, side: 'port' });
  const release = sampleHeliosCornerClamp({ stage: 'fire', progress: 0.82, side: 'port' });
  assert.equal(warning.damageActive, false);
  assert.equal(warning.trackingActive, true);
  assert.equal(approach.damageActive, false);
  assert.ok(approach.closeEnergy > 0, 'the close must already be visible before damage activates');
  assert.equal(closure.damageActive, true);
  assert.ok(closure.closeEnergy > 0.9, 'damage coincides with the visible closed clamp');
  assert.equal(closure.starboardEnergy, 0);
  assert.equal(release.damageActive, false);
  assert.ok(release.returnProgress > 0);
});

test('Helios corner clamp uses center-aware mobile and desktop tracking lanes', () => {
  const mobileBoss = { width: 297, height: 213 };
  const mobilePort = resolveHeliosCornerClampPlacement({
    side: 'port',
    viewportWidth: 390,
    viewportHeight: 844,
    bossWidth: mobileBoss.width,
    bossHeight: mobileBoss.height,
    mobileProfile: true
  });
  const mobileStarboard = resolveHeliosCornerClampPlacement({
    side: 'starboard',
    viewportWidth: 390,
    viewportHeight: 844,
    bossWidth: mobileBoss.width,
    bossHeight: mobileBoss.height,
    mobileProfile: true
  });

  assert.equal(mobilePort.visualPadding, 44);
  assert.equal(mobilePort.cornerX, 44);
  assert.equal(mobileStarboard.cornerX, 49);
  assert.ok(mobilePort.trackingMinX <= mobilePort.trackingMaxX);
  assert.ok(mobileStarboard.trackingMinX <= mobileStarboard.trackingMaxX);
  assert.ok(mobilePort.trackingMaxX + mobileBoss.width / 2 <= 390 / 2);
  assert.ok(mobileStarboard.trackingMinX + mobileBoss.width / 2 >= 390 / 2);
  assert.ok(mobileStarboard.trackingMaxX + mobileBoss.width <= 390 - 44);

  const desktopStarboard = resolveHeliosCornerClampPlacement({
    side: 'starboard',
    viewportWidth: 1280,
    viewportHeight: 720,
    bossWidth: mobileBoss.width,
    bossHeight: mobileBoss.height,
    mobileProfile: false
  });
  assert.equal(desktopStarboard.visualPadding, 56);
  assert.equal(desktopStarboard.cornerX, 927);
  assert.ok(desktopStarboard.trackingMinX >= 1280 / 2 - mobileBoss.width / 2);
  assert.ok(desktopStarboard.trackingMaxX + mobileBoss.width <= 1280 - 56);
});

test('Helios claw sweeps damage only during the visible middle of the selected strike', () => {
  const preparation = sampleHeliosClawSweep({ progress: 0.2, side: 'port' });
  const strike = sampleHeliosClawSweep({ progress: 0.5, side: 'port' });
  const recovery = sampleHeliosClawSweep({ progress: 0.8, side: 'port' });
  const pairedStrike = sampleHeliosClawSweep({ progress: 0.5 });

  assert.equal(preparation.damageActive, false);
  assert.ok(preparation.portEnergy > 0);
  assert.equal(preparation.starboardEnergy, 0);
  assert.equal(strike.damageActive, true);
  assert.ok(strike.portEnergy > preparation.portEnergy);
  assert.equal(strike.starboardEnergy, 0);
  assert.equal(recovery.damageActive, false);
  assert.ok(recovery.portEnergy > 0, 'the claw remains visibly extended during safe recovery');
  assert.equal(pairedStrike.damageActive, true);
  assert.ok(pairedStrike.portEnergy > 0);
  assert.equal(pairedStrike.portEnergy, pairedStrike.starboardEnergy);
});

test('Helios tracking pincer exposes four deterministic stages and one bounded close window', () => {
  const rise = sampleHeliosTrackingPincer({ sequence: 0, progress: 0.8 });
  const tracking = sampleHeliosTrackingPincer({ sequence: 1, progress: 0.5 });
  const locked = sampleHeliosTrackingPincer({ sequence: 1, progress: 0.8 });
  const diveBeforeClose = sampleHeliosTrackingPincer({ sequence: 2, progress: 0.5 });
  const diveClose = sampleHeliosTrackingPincer({ sequence: 2, progress: 0.7 });
  const hold = sampleHeliosTrackingPincer({ sequence: 3, progress: 0.2 });
  const returnPose = sampleHeliosTrackingPincer({ sequence: 3, progress: 0.8 });

  assert.equal(rise.stage, 'rise-open');
  assert.equal(rise.damageActive, false);
  assert.equal(tracking.stage, 'track-lock');
  assert.equal(tracking.trackingActive, true);
  assert.equal(tracking.lockActive, false);
  assert.equal(locked.trackingActive, false);
  assert.equal(locked.lockActive, true);
  assert.equal(diveBeforeClose.stage, 'dive-close');
  assert.equal(diveBeforeClose.damageActive, false);
  assert.equal(diveClose.damageActive, true);
  assert.ok(diveClose.closeEnergy > diveBeforeClose.closeEnergy);
  assert.equal(hold.stage, 'hold-release-return');
  assert.equal(hold.damageActive, true);
  assert.equal(returnPose.damageActive, false);
  assert.ok(returnPose.returnProgress > 0.5);
});

test('Helios cannon branches remain bounded, frozen, and repeatable', () => {
  const port = resolveHeliosCrossfireSides('port');
  const coordinated = resolveHeliosCrossfireSides(undefined);

  assert.deepEqual(Array.from(port), ['port']);
  assert.deepEqual(Array.from(coordinated), ['port', 'starboard']);
  assert.equal(Object.isFrozen(port), true);
  assert.equal(Object.isFrozen(coordinated), true);
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});

test('Helios fixed crossfire lanes are mirrored around vertical and widen together', () => {
  const vertical = Math.PI / 2;
  const portSingle = resolveHeliosCrossfireAngle('port', false);
  const starboardSingle = resolveHeliosCrossfireAngle('starboard', false);
  const portCoordinated = resolveHeliosCrossfireAngle('port', true);
  const starboardCoordinated = resolveHeliosCrossfireAngle('starboard', true);
  const epsilon = 1e-12;

  assert.ok(portSingle > vertical);
  assert.ok(starboardSingle < vertical);
  assert.ok(Math.abs((portSingle - vertical) - 0.08) < epsilon);
  assert.ok(Math.abs((vertical - starboardSingle) - 0.08) < epsilon);
  assert.ok(Math.abs((portSingle - vertical) - (vertical - starboardSingle)) < epsilon);

  assert.ok(portCoordinated > portSingle);
  assert.ok(starboardCoordinated < starboardSingle);
  assert.ok(Math.abs((portCoordinated - vertical) - 0.3) < epsilon);
  assert.ok(Math.abs((vertical - starboardCoordinated) - 0.3) < epsilon);
  assert.ok(
    Math.abs((portCoordinated - vertical) - (vertical - starboardCoordinated)) < epsilon
  );
});
