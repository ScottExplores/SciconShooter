const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'gameplay', 'formations', 'FormationRuntime.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const runtime = loadRuntime();
const viewport = { width: 412, height: 915 };

test('entry, movement, attack, firing, and return behaviors resolve independently', () => {
  const pack = {
    id: 'proof-pack',
    label: 'Proof pack',
    formationIds: ['double-v'],
    enemyRoleIds: ['basic'],
    entryDirection: 'top',
    entryPath: 'formation-drop',
    movementBehavior: 'gentle-drift',
    attackBehavior: 'paired-dive',
    firingBehavior: 'post-formation',
    returnBehavior: 'reform',
    holdSeconds: 2,
    telegraphSeconds: 0.6,
    attackDurationSeconds: 1.4,
    attackRecoverySeconds: 1.1,
    attackGroupSize: 2,
    attackCycles: 2,
    maximumSimultaneousGroups: 1,
    cooldownSeconds: 1
  };
  const resolved = runtime.resolveFormationChoreography({
    patternId: 'double-v',
    formationBehavior: {
      entryPathId: 'paired-flank',
      movementId: 'expand-collapse',
      attackId: 'alternating-wings',
      firingBehavior: 'staggered',
      returnId: 'transform',
      attackGroupSize: 3
    }
  }, pack);

  assert.deepEqual({
    entryPathId: resolved.entryPathId,
    movementId: resolved.movementId,
    attackId: resolved.attackId,
    firingBehavior: resolved.firingBehavior,
    returnId: resolved.returnId,
    attackGroupSize: resolved.attackGroupSize
  }, {
    entryPathId: 'paired-flank',
    movementId: 'expand-collapse',
    attackId: 'alternating-wings',
    firingBehavior: 'staggered',
    returnId: 'transform',
    attackGroupSize: 3
  });
  assert.equal(resolved.holdSeconds, 2, 'unoverridden timing remains inherited from the pack');
});

test('one formation shape can enter from genuinely different authored paths', () => {
  const common = { id: 'same-shape', patternId: 'double-v' };
  const drop = runtime.resolveConfiguredFormationSpawnPoint({
    event: { ...common, entryPathId: 'formation-drop' },
    index: 0,
    count: 6,
    viewport,
    randomSample: 0.5
  });
  const flank = runtime.resolveConfiguredFormationSpawnPoint({
    event: { ...common, entryPathId: 'paired-flank' },
    index: 0,
    count: 6,
    viewport,
    randomSample: 0.5
  });
  assert.ok(drop.x > 0 && drop.x < viewport.width, 'formation drop begins above the playfield');
  assert.ok(flank.x < 0 || flank.x > viewport.width, 'paired flank begins outside a side edge');
  assert.notDeepEqual(drop, flank);
});

test('attack cycles choose small deterministic subgroups rather than the whole formation', () => {
  assert.deepEqual(runtime.resolveFormationAttackIndices('paired-dive', 0, 10, 2), [0, 9]);
  assert.deepEqual(runtime.resolveFormationAttackIndices('paired-dive', 1, 10, 2), [1, 8]);
  assert.deepEqual(runtime.resolveFormationAttackIndices('alternating-wings', 0, 10, 3), [0, 1, 2]);
  assert.deepEqual(runtime.resolveFormationAttackIndices('alternating-wings', 1, 10, 3), [5, 6, 7]);
});

test('assembled movement is a stable sample around immutable slot geometry', () => {
  const input = {
    movementId: 'rotating-wheel',
    base: { x: 120, y: 140 },
    groupCenter: { x: 206, y: 180 },
    frame: 240,
    groupSeed: 11,
    index: 2,
    count: 8,
    viewport,
    transformCycle: 0
  };
  const first = runtime.resolveFormationMovementPoint(input);
  const repeated = runtime.resolveFormationMovementPoint(input);
  const later = runtime.resolveFormationMovementPoint({ ...input, frame: 300 });
  assert.deepEqual(first, repeated, 'replaying the same frame cannot accumulate positional drift');
  assert.notDeepEqual(first, later, 'the formation still has readable assembled motion');
  assert.ok(Math.hypot(first.x - input.groupCenter.x, first.y - input.groupCenter.y) < 140);
});

test('shared cohort entries preserve exact endpoints while flying as a compact procession', () => {
  const common = {
    mode: 'v',
    count: 6,
    groupSeed: 41,
    viewport,
    entityWidth: 40,
    entityHeight: 40,
    start: { x: 58, y: -74 },
    entryDirection: 'top',
    entryPath: 'sweep-bank-reentry',
    entryBehavior: 'formation'
  };
  const leftTarget = { x: 52, y: 128 };
  const rightTarget = { x: 316, y: 128 };
  const leftStart = runtime.resolveFormationCohortEntryPose({
    ...common, index: 0, progress: 0, target: leftTarget
  });
  const leftMid = runtime.resolveFormationCohortEntryPose({
    ...common, index: 0, progress: 0.38, target: leftTarget
  });
  const leftReveal = runtime.resolveFormationCohortEntryPose({
    ...common, index: 0, progress: 0.12, target: leftTarget
  });
  const rightMid = runtime.resolveFormationCohortEntryPose({
    ...common, index: 1, progress: 0.38, target: rightTarget
  });
  const leftEnd = runtime.resolveFormationCohortEntryPose({
    ...common, index: 0, progress: 1, target: leftTarget
  });

  assert.deepEqual({ x: leftStart.x, y: leftStart.y }, common.start);
  assert.deepEqual({ x: leftEnd.x, y: leftEnd.y }, leftTarget);
  assert.equal(leftEnd.angle, 0);
  assert.ok(leftReveal.y > -40, 'the slow arrival becomes visible before it begins its long maneuver');
  assert.equal(leftReveal.phase, 'procession');
  assert.ok(
    Math.abs(leftMid.x - rightMid.x) < Math.abs(leftTarget.x - rightTarget.x) * 0.8,
    'members remain in one inbound ribbon before their authored slots bloom'
  );
  assert.equal(leftMid.phase, 'maneuver');
});

test('offscreen slot corrections reveal promptly while visible corrections remain smooth', () => {
  const offscreen = runtime.sampleFormationSlotTransition({
    start: { x: 180, y: -84 },
    target: { x: 140, y: 126 },
    progress: 0.2
  });
  const visible = runtime.sampleFormationSlotTransition({
    start: { x: 180, y: 84 },
    target: { x: 140, y: 126 },
    progress: 0.2
  });
  assert.ok(offscreen.y > -10, 'an inbound slot correction reaches the viewport early');
  assert.ok(visible.y < 92, 'an already visible member keeps the gentle no-snap settle');
});

test('completed dive passes cannot leave a live survivor hidden beside the viewport', () => {
  const common = {
    entityWidth: 40,
    entityHeight: 44,
    viewport,
    current: { x: -52, y: 180 }
  };
  assert.equal(
    runtime.shouldEndFormationDivePass({ ...common, ageFrames: 23 }),
    false,
    'a fresh flank still gets enough time to read as an intentional maneuver'
  );
  assert.equal(
    runtime.shouldEndFormationDivePass({ ...common, ageFrames: 24 }),
    true,
    'a committed diver reforms as soon as its full hull clears the edge'
  );
  assert.equal(runtime.shouldEndFormationDivePass({
    ...common,
    current: { x: 80, y: 180 },
    ageFrames: 180
  }), false, 'an on-screen dive is never recalled just because it is old');
  assert.equal(runtime.shouldEndFormationDivePass({
    ...common,
    current: { x: -141, y: 180 },
    ageFrames: 0
  }), true, 'the existing hard safety bound remains immediate');
  const m17bRightEdge = {
    current: { x: 399, y: 534.494 },
    entityWidth: 50,
    entityHeight: 41,
    viewport: { width: 390, height: 844 }
  };
  assert.equal(
    runtime.shouldEndFormationDivePass({ ...m17bRightEdge, ageFrames: 76 }),
    true,
    'the exact M17B Orbit Disc survivor cannot linger beyond the phone edge'
  );
  assert.equal(
    runtime.shouldEndFormationDivePass({ ...m17bRightEdge, ageFrames: 23 }),
    false,
    'the same right-wing break keeps its readable commitment grace'
  );
});

test('spiral entry completes visible turns and double helix keeps opposite strands', () => {
  const common = {
    count: 8,
    groupSeed: 13,
    viewport,
    entityWidth: 38,
    entityHeight: 38,
    start: { x: 206, y: -82 },
    target: { x: 187, y: 150 },
    entryDirection: 'top',
    entryBehavior: 'formation'
  };
  const spiralXs = [0.1, 0.18, 0.26, 0.34, 0.42, 0.5, 0.58].map((progress) => (
    runtime.resolveFormationCohortEntryPose({
      ...common,
      mode: 'spiral',
      index: 0,
      progress,
      entryPath: 'spiral-entry'
    }).x
  ));
  const directions = spiralXs.slice(1).map((value, index) => Math.sign(value - spiralXs[index]));
  const reversals = directions.slice(1).filter((value, index) => value !== directions[index]).length;
  assert.ok(reversals >= 2, `spiral ribbon should visibly turn, got ${spiralXs.join(', ')}`);

  const strandA = runtime.resolveFormationCohortEntryPose({
    ...common,
    mode: 'sine',
    index: 0,
    progress: 0.4,
    entryPath: 'double-helix'
  });
  const strandB = runtime.resolveFormationCohortEntryPose({
    ...common,
    mode: 'sine',
    index: 1,
    progress: 0.4,
    entryPath: 'double-helix'
  });
  assert.ok(Math.abs(strandA.x - strandB.x) >= 28, 'paired helix strands stay visually opposed');
  assert.ok(Math.abs(strandA.y - strandB.y) <= 42, 'both strands share the same moving centerline');
});

test('authored path timing gives spiral and braid arrivals room to read', () => {
  const makePlan = (entryPathId) => runtime.resolveFormationEntryPlan({
    eventId: `timing-${entryPathId}`,
    patternId: entryPathId === 'spiral-entry' ? 'spiral' : 'grid',
    entryDirection: 'top',
    entryPathId,
    entryBehavior: 'formation',
    index: 0,
    count: 8,
    currentFrame: 0,
    waveProgressFrames: 0,
    baseVerticalSpeed: 2.5,
    sideSentry: false,
    framesPerSecond: 60,
    target: { x: 180, y: 140 }
  });
  const drop = makePlan('formation-drop');
  const spiral = makePlan('spiral-entry');
  assert.ok(drop.entryFrames >= 80);
  assert.ok(spiral.entryFrames >= 120);
  assert.ok(spiral.entryFrames > drop.entryFrames);
});

test('authored attack verbs select distinct dive maneuvers', () => {
  const common = {
    mode: 'row',
    index: 1,
    groupSize: 8,
    groupSeed: 17,
    cycle: 0,
    ageFrames: 8,
    baseSpeed: 3,
    current: { x: 130, y: 160 },
    anchorX: 130,
    player: { x: 206, y: 780 },
    playerVelocityX: 0,
    viewportWidth: viewport.width,
    mobile: true,
    entryBehavior: 'formation'
  };
  assert.equal(runtime.resolveFormationDiveMotion({ ...common, attackId: 'ring-collapse' }).maneuver, 'corkscrew');
  assert.equal(runtime.resolveFormationDiveMotion({ ...common, attackId: 'pincer-pass' }).maneuver, 'crossing-flanks');
  assert.equal(runtime.resolveFormationDiveMotion({ ...common, attackId: 'alternating-wings' }).maneuver, 'synchronized-break');
  assert.equal(runtime.resolveFormationDiveMotion({ ...common, attackId: 'leader-escorts' }).maneuver, 'feint-dive');
});

// The two arcade train routes added for the Galaxiga-style swarm pass.
const sampleTrainRoute = (entryPath, entryDirection) => {
  const points = [];
  for (let step = 0; step <= 240; step++) {
    points.push(runtime.resolveFormationCohortEntryPose({
      mode: 'grid',
      index: 0,
      count: 8,
      groupSeed: 4321,
      progress: step / 240,
      viewport,
      entityWidth: 34,
      entityHeight: 30,
      start: { x: 40, y: -60 },
      target: { x: 210, y: 150 },
      entryPath,
      entryDirection,
      entryBehavior: 'formation'
    }));
  }
  return points;
};

const countDirectionChanges = (points, axis) => {
  let changes = 0;
  let previousSign = 0;
  for (let index = 1; index < points.length; index++) {
    const delta = points[index][axis] - points[index - 1][axis];
    const sign = delta > 0.01 ? 1 : delta < -0.01 ? -1 : 0;
    if (sign !== 0 && previousSign !== 0 && sign !== previousSign) changes++;
    if (sign !== 0) previousSign = sign;
  }
  return changes;
};

test('loop-the-loop performs a full visible loop and still lands on its slot', () => {
  const points = sampleTrainRoute('loop-the-loop', 'left');
  const first = points[0];
  const last = points[points.length - 1];
  assert.equal(Math.round(first.x), 40);
  assert.equal(Math.round(first.y), -60);
  assert.equal(Math.round(last.x), 210);
  assert.equal(Math.round(last.y), 150);
  assert.equal(last.phase, 'settle');
  // A real loop climbs back up at least once mid-route.
  assert.ok(countDirectionChanges(points, 'y') >= 2, 'route reverses vertically through the loop');
  // The loop stays inside the visible field on a phone viewport.
  assert.ok(points.every((point) => point.x > -40 && point.x < viewport.width + 40));
  assert.ok(points.every((point) => point.y < viewport.height * 0.5));
});

test('serpentine-weave sweeps wide S-curves before assembling', () => {
  const points = sampleTrainRoute('serpentine-weave', 'top');
  const last = points[points.length - 1];
  assert.equal(Math.round(last.x), 210);
  assert.equal(Math.round(last.y), 150);
  assert.ok(countDirectionChanges(points, 'x') >= 4, 'route weaves across the field');
  const xs = points.map((point) => point.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > viewport.width * 0.45, 'sweep is wide enough to read');
});
