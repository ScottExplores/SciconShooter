import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const runtime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/AbyssalOctarchRuntime.ts'
);

const allTentacleIds = runtime.ABYSSAL_OCTARCH_TENTACLE_IDS;

test('surviving tentacle count resolves the four structural phases at exact boundaries', () => {
  const expected = [
    [99, 'octarch-first-contact', 1],
    [8, 'octarch-first-contact', 1],
    [6, 'octarch-first-contact', 1],
    [5, 'octarch-hunts', 2],
    [3, 'octarch-hunts', 2],
    [2, 'octarch-severed-fury', 3],
    [1, 'octarch-severed-fury', 3],
    [0, 'octarch-final-core', 4],
    [-4, 'octarch-final-core', 4]
  ];

  for (const [survivors, phaseId, phaseIndex] of expected) {
    const phase = runtime.resolveAbyssalOctarchPhase(survivors);
    assert.equal(phase.id, phaseId);
    assert.equal(phase.index, phaseIndex);
  }
});

test('tentacle selection is deterministic, excludes destroyed limbs, and pairs opposite sides when available', () => {
  const destroyed = new Set([
    'tentacle-mid-port',
    'tentacle-lower-starboard',
    'tentacle-ventral-port'
  ]);
  const activeTentacleIds = allTentacleIds.filter((id) => !destroyed.has(id));
  const request = {
    actionId: 'constricting-ring',
    activeTentacleIds,
    sequence: 23,
    phaseIndex: 3
  };
  const first = runtime.selectAbyssalOctarchTentacles(request);
  const repeated = runtime.selectAbyssalOctarchTentacles(request);

  assert.deepEqual(first, repeated);
  assert.equal(first.length, 2);
  assert.ok(first.every((id) => activeTentacleIds.includes(id)));
  assert.ok(first.every((id) => !destroyed.has(id)));
  assert.equal(new Set(first).size, 2);

  const descriptors = first.map((id) => (
    runtime.ABYSSAL_OCTARCH_TENTACLES.find((tentacle) => tentacle.id === id)
  ));
  assert.notEqual(descriptors[0].side, descriptors[1].side);

  assert.deepEqual(runtime.selectAbyssalOctarchTentacles({
    ...request,
    phaseIndex: 4
  }), []);
  assert.deepEqual(runtime.selectAbyssalOctarchTentacles({
    ...request,
    activeTentacleIds: []
  }), []);
});

test('role-owned actions prefer a surviving matching limb and fall back deterministically', () => {
  const oneByRole = Object.freeze({
    'grasp-and-hurl': 'tentacle-ventral-starboard',
    'tentacle-slam': 'tentacle-mid-port',
    'sweeping-arm': 'tentacle-upper-starboard',
    'needle-tip-stab': 'tentacle-lower-starboard',
    'constricting-ring': 'tentacle-ventral-port',
    'suction-current': 'tentacle-lower-port',
    'asteroid-hurl': 'tentacle-upper-port'
  });

  for (const [actionId, expectedTentacleId] of Object.entries(oneByRole)) {
    const activeTentacleIds = [
      expectedTentacleId,
      'tentacle-upper-port'
    ];
    const selected = runtime.selectAbyssalOctarchTentacles({
      actionId,
      activeTentacleIds,
      sequence: 7,
      phaseIndex: 1
    });
    assert.deepEqual(selected, [expectedTentacleId]);
  }

  const onlySurvivor = ['tentacle-upper-port'];
  assert.deepEqual(runtime.selectAbyssalOctarchTentacles({
    actionId: 'needle-tip-stab',
    activeTentacleIds: onlySurvivor,
    sequence: 7,
    phaseIndex: 3
  }), onlySurvivor);

  assert.deepEqual(runtime.selectAbyssalOctarchTentacles({
    actionId: 'abyssal-gaze',
    activeTentacleIds: allTentacleIds,
    sequence: 7,
    phaseIndex: 3
  }), []);
});

test('action plans replay identically and keep every authored point inside the expanded arena', () => {
  const request = {
    actionId: 'grasp-and-hurl',
    activeTentacleIds: allTentacleIds,
    sequence: 41,
    phaseIndex: 3,
    arenaWidth: 542,
    arenaHeight: 1172,
    playerCenterX: -900,
    playerCenterY: 9_000
  };
  const first = runtime.createAbyssalOctarchActionPlan(request);
  const repeated = runtime.createAbyssalOctarchActionPlan(request);
  const changedSequence = runtime.createAbyssalOctarchActionPlan({
    ...request,
    sequence: request.sequence + 1
  });
  const padding = runtime.ABYSSAL_OCTARCH_CAMERA_PROFILE.boundaryPadding;

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, changedSequence);
  assert.equal(first.sequence, request.sequence);
  assert.equal(first.phaseIndex, request.phaseIndex);
  assert.equal(first.safeGapWidthRadians, 0.48);
  assert.ok(first.tentacleIds.length >= 1);
  assert.ok(first.tentacleIds.every((id) => allTentacleIds.includes(id)));
  assert.ok(first.safeGapAngleRadians >= 0);
  assert.ok(first.safeGapAngleRadians < Math.PI * 2);

  for (const point of [first.target, first.secondaryTarget, first.throwLanding]) {
    assert.ok(point.x >= padding && point.x <= request.arenaWidth - padding);
    assert.ok(point.y >= padding && point.y <= request.arenaHeight - padding);
  }
  assert.ok(first.target.y >= request.arenaHeight * 0.34);
  assert.ok(first.throwLanding.y >= request.arenaHeight * 0.58);
});

test('throw landing clamps to the arena and velocity remains directional and bounded', () => {
  const padding = runtime.ABYSSAL_OCTARCH_CAMERA_PROFILE.boundaryPadding;
  const clamped = runtime.clampAbyssalOctarchPoint(
    { x: -1_000, y: 20_000 },
    390,
    844
  );
  assert.deepEqual(clamped, { x: padding, y: 844 - padding });

  const forward = runtime.resolveAbyssalOctarchThrowVelocity({
    from: { x: 18, y: 18 },
    landing: { x: 10_000, y: 10_000 },
    frames: 1
  });
  const reverse = runtime.resolveAbyssalOctarchThrowVelocity({
    from: { x: 10_000, y: 10_000 },
    landing: { x: 18, y: 18 },
    frames: 0
  });
  const maximum = runtime.ABYSSAL_OCTARCH_LIMITS.maximumThrowSpeed;

  assert.deepEqual(forward, { vx: maximum, vy: maximum });
  assert.deepEqual(reverse, { vx: -maximum, vy: -maximum });

  const ordinary = runtime.resolveAbyssalOctarchThrowVelocity({
    from: { x: 195, y: 700 },
    landing: { x: 86, y: 620 },
    frames: 38
  });
  assert.ok(ordinary.vx < 0);
  assert.ok(ordinary.vy < 0);
  assert.ok(Math.abs(ordinary.vx) <= maximum);
  assert.ok(Math.abs(ordinary.vy) <= maximum);
});

test('Grasp and Hurl follows a visible deterministic Bezier arc inside expanded bounds', () => {
  const request = {
    from: { x: 195, y: 178 },
    landing: { x: 86, y: 690 },
    arenaWidth: 542,
    arenaHeight: 1172,
    playerWidth: 42,
    playerHeight: 54
  };
  const samples = Array.from({ length: 39 }, (_, frame) => (
    runtime.sampleAbyssalOctarchThrowPath({
      ...request,
      progress: frame / 38
    })
  ));
  const repeated = samples.map((_, frame) => (
    runtime.sampleAbyssalOctarchThrowPath({
      ...request,
      progress: frame / 38
    })
  ));
  const padding = runtime.ABYSSAL_OCTARCH_CAMERA_PROFILE.boundaryPadding;
  const minimumX = padding + request.playerWidth / 2;
  const maximumX = request.arenaWidth - padding - request.playerWidth / 2;
  const minimumY = padding + request.playerHeight / 2;
  const maximumY = request.arenaHeight - padding - request.playerHeight / 2;

  assert.deepEqual(samples, repeated);
  assert.deepEqual(
    { x: samples[0].x, y: samples[0].y },
    request.from
  );
  assert.deepEqual(
    { x: samples.at(-1).x, y: samples.at(-1).y },
    request.landing
  );
  assert.ok(samples.every((sample) => (
    sample.x >= minimumX
    && sample.x <= maximumX
    && sample.y >= minimumY
    && sample.y <= maximumY
  )));
  const midpoint = samples[19];
  const linearMidpointY = (request.from.y + request.landing.y) / 2;
  assert.ok(
    midpoint.y < linearMidpointY - 80,
    'the throw must visibly rise above a straight interpolation'
  );

  const clamped = runtime.sampleAbyssalOctarchThrowPath({
    ...request,
    from: { x: -9_000, y: -9_000 },
    landing: { x: 9_000, y: 9_000 },
    progress: 0.5
  });
  assert.ok(clamped.x >= minimumX && clamped.x <= maximumX);
  assert.ok(clamped.y >= minimumY && clamped.y <= maximumY);
  assert.ok(clamped.controlX >= minimumX && clamped.controlX <= maximumX);
  assert.ok(clamped.controlY >= minimumY && clamped.controlY <= maximumY);
});

test('one pure tip sampler owns direct-thrust, retracting slam, and sequence sweep geometry', () => {
  const base = {
    start: { x: 80, y: 120 },
    finalTarget: { x: 310, y: 610 },
    sequence: 2,
    arenaWidth: 390,
    bossWidth: 180
  };
  const needle = runtime.sampleAbyssalOctarchAttackTip({
    ...base,
    actionId: 'needle-tip-stab',
    activeProgress: 0.4
  });
  assert.deepEqual(needle.tip, base.finalTarget);
  assert.deepEqual(
    runtime.sampleAbyssalOctarchAttackTip({
      ...base,
      actionId: 'needle-tip-stab',
      activeProgress: 0.4
    }),
    needle
  );

  const slamStart = runtime.sampleAbyssalOctarchAttackTip({
    ...base,
    actionId: 'tentacle-slam',
    activeProgress: 0
  });
  const slamPeak = runtime.sampleAbyssalOctarchAttackTip({
    ...base,
    actionId: 'tentacle-slam',
    activeProgress: 0.5
  });
  const slamEnd = runtime.sampleAbyssalOctarchAttackTip({
    ...base,
    actionId: 'tentacle-slam',
    activeProgress: 1
  });
  assert.deepEqual(slamStart.tip, base.start);
  assert.deepEqual(slamPeak.tip, base.finalTarget);
  assert.ok(Math.abs(slamEnd.tip.x - base.start.x) < 1e-9);
  assert.ok(Math.abs(slamEnd.tip.y - base.start.y) < 1e-9);

  const sweepStart = runtime.sampleAbyssalOctarchAttackTip({
    ...base,
    actionId: 'sweeping-arm',
    activeProgress: 0
  });
  const sweepEnd = runtime.sampleAbyssalOctarchAttackTip({
    ...base,
    actionId: 'sweeping-arm',
    activeProgress: 1
  });
  assert.ok(sweepStart.target.x < 0);
  assert.ok(sweepEnd.target.x > base.arenaWidth);
  assert.equal(sweepStart.target.y, base.finalTarget.y);
  assert.equal(sweepEnd.target.y, base.finalTarget.y);
});

test('phase reactions deterministically recoil, rage, expose, and complete before attacks', () => {
  for (const phase of runtime.ABYSSAL_OCTARCH_PHASES) {
    const start = runtime.sampleAbyssalOctarchPhaseReaction({
      phaseId: phase.id,
      elapsedFrames: 0
    });
    const middle = runtime.sampleAbyssalOctarchPhaseReaction({
      phaseId: phase.id,
      elapsedFrames: Math.ceil(phase.reactionFrames * 0.5)
    });
    const exposure = runtime.sampleAbyssalOctarchPhaseReaction({
      phaseId: phase.id,
      elapsedFrames: Math.ceil(phase.reactionFrames * 0.85)
    });
    const complete = runtime.sampleAbyssalOctarchPhaseReaction({
      phaseId: phase.id,
      elapsedFrames: phase.reactionFrames
    });

    assert.equal(start.stage, 'recoil');
    assert.equal(middle.stage, 'rage');
    assert.equal(exposure.stage, 'core-exposure');
    assert.equal(complete.stage, 'complete');
    assert.equal(complete.complete, true);
    assert.equal(complete.progress, 1);
    assert.equal(start.reactionFrames, phase.reactionFrames);
    assert.equal(
      exposure.coreExposed,
      phase.id === 'octarch-final-core'
    );
  }
});

test('camera sampling delays, eases, and completes the deterministic arena expansion', () => {
  const profile = runtime.ABYSSAL_OCTARCH_CAMERA_PROFILE;
  const before = runtime.sampleAbyssalOctarchCamera(profile.zoomDelayFrames - 1);
  const start = runtime.sampleAbyssalOctarchCamera(profile.zoomDelayFrames);
  const midpoint = runtime.sampleAbyssalOctarchCamera(
    profile.zoomDelayFrames + profile.zoomDurationFrames / 2
  );
  const complete = runtime.sampleAbyssalOctarchCamera(
    profile.zoomDelayFrames + profile.zoomDurationFrames
  );

  assert.deepEqual(before, { scale: 1, progress: 0, expanded: false });
  assert.deepEqual(start, { scale: 1, progress: 0, expanded: false });
  assert.equal(midpoint.progress, 0.5);
  assert.equal(midpoint.scale, (1 + profile.expandedScale) / 2);
  assert.equal(midpoint.expanded, false);
  assert.deepEqual(complete, {
    scale: profile.expandedScale,
    progress: 1,
    expanded: true
  });
  assert.deepEqual(runtime.sampleAbyssalOctarchCamera(0, 'normal'), {
    scale: 1,
    progress: 0,
    expanded: false
  });
  assert.deepEqual(runtime.sampleAbyssalOctarchCamera(0, 'expanded'), {
    scale: profile.expandedScale,
    progress: 1,
    expanded: true
  });
});

test('ordinary attacks sequence preparation, telegraph, damage, recovery, and cleanup on exact boundaries', () => {
  const request = {
    actionId: 'tentacle-slam',
    warningFrames: 60,
    activeFrames: 24,
    recoveryFrames: 18
  };
  const samples = [
    [0, 'preparation'],
    [19, 'preparation'],
    [20, 'telegraph'],
    [59, 'telegraph'],
    [60, 'active'],
    [83, 'active'],
    [84, 'recovery'],
    [101, 'recovery'],
    [102, 'complete']
  ].map(([elapsedFrames, expectedStage]) => {
    const sample = runtime.sampleAbyssalOctarchAction({
      ...request,
      elapsedFrames
    });
    assert.equal(sample.stage, expectedStage);
    return sample;
  });

  assert.ok(samples.slice(0, 2).every((sample) => !sample.damageActive));
  assert.ok(samples.slice(2, 4).every((sample) => !sample.damageActive));
  assert.ok(samples.slice(4, 6).every((sample) => sample.damageActive));
  assert.ok(samples.every((sample) => !sample.captureActive));
  assert.equal(samples.at(-1).complete, true);
  assert.equal(samples.at(-1).progress, 1);
});

test('Grasp & Hurl uniquely sequences capture, hold, throw, recovery, and completion', () => {
  const request = {
    actionId: 'grasp-and-hurl',
    warningFrames: 60,
    activeFrames: 26,
    recoveryFrames: 18
  };
  const holdFrames = runtime.ABYSSAL_OCTARCH_LIMITS.grabHoldFrames;
  const throwFrames = runtime.ABYSSAL_OCTARCH_LIMITS.grabThrowFrames;
  const activeStart = request.warningFrames;
  const activeEnd = activeStart + request.activeFrames;
  const holdEnd = activeEnd + holdFrames;
  const throwEnd = holdEnd + throwFrames;
  const completeFrame = throwEnd + request.recoveryFrames;

  const active = runtime.sampleAbyssalOctarchAction({
    ...request,
    elapsedFrames: activeStart
  });
  const held = runtime.sampleAbyssalOctarchAction({
    ...request,
    elapsedFrames: activeEnd
  });
  const throwing = runtime.sampleAbyssalOctarchAction({
    ...request,
    elapsedFrames: holdEnd
  });
  const recovery = runtime.sampleAbyssalOctarchAction({
    ...request,
    elapsedFrames: throwEnd
  });
  const complete = runtime.sampleAbyssalOctarchAction({
    ...request,
    elapsedFrames: completeFrame
  });

  assert.deepEqual(
    [active.stage, held.stage, throwing.stage, recovery.stage, complete.stage],
    ['active', 'held', 'throwing', 'recovery', 'complete']
  );
  assert.equal(active.captureActive, true);
  assert.equal(active.damageActive, false);
  assert.ok([held, throwing, recovery, complete].every((sample) => (
    !sample.captureActive && !sample.damageActive
  )));
  assert.equal(complete.complete, true);
});
