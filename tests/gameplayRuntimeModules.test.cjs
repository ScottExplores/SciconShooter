const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (...segments) => {
  const filePath = path.join(root, ...segments);
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object, String }
  );
  return module.exports;
};

test('formation geometry is deterministic across custom, built-in, and entry plans', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const viewport = { width: 390, height: 844 };
  const event = {
    id: 'formation-proof',
    patternId: 'spiral',
    positionId: 'formation-top',
    spawnAnchor: { x: 0.5, y: 0.16 },
    enemySpriteKeys: []
  };

  assert.equal(formations.resolveConfiguredFormationMode('wall-march'), 'grid');
  assert.equal(formations.resolveConfiguredFormationMode('sine-wave'), 'sine');
  assert.equal(
    formations.getFormationGroupSeed(event.id),
    formations.getFormationGroupSeed(event.id)
  );

  const firstTarget = formations.resolveConfiguredFormationTarget({
    event,
    index: 2,
    count: 8,
    entityWidth: 44,
    entityHeight: 44,
    viewport
  });
  const repeatedTarget = formations.resolveConfiguredFormationTarget({
    event,
    index: 2,
    count: 8,
    entityWidth: 44,
    entityHeight: 44,
    viewport
  });
  assert.deepEqual(firstTarget, repeatedTarget);

  const firstEntry = formations.resolveConfiguredFormationSpawnPoint({
    event,
    index: 2,
    count: 8,
    viewport,
    randomSample: 0.314159
  });
  const repeatedEntry = formations.resolveConfiguredFormationSpawnPoint({
    event,
    index: 2,
    count: 8,
    viewport,
    randomSample: 0.314159
  });
  assert.deepEqual(firstEntry, repeatedEntry);
  assert.ok(
    Math.abs(firstEntry.x - 151.43511717524902) < 1e-9
      && firstEntry.y === -114,
    'events without authored entry metadata preserve their legacy spiral origin'
  );

  const legacyMotion = formations.resolveFormationEntryMotion({
    mode: 'spiral',
    index: 2,
    groupSeed: formations.getFormationGroupSeed(event.id),
    progress: 0.5,
    viewportWidth: viewport.width
  });
  assert.ok(Math.abs(legacyMotion.xOffset - 61.06706015883273) < 1e-9);
  assert.equal(legacyMotion.yOffset, -42);
  assert.equal(legacyMotion.angle, 0.5);

  const plan = formations.resolveFormationEntryPlan({
    eventId: event.id,
    patternId: event.patternId,
    index: 2,
    count: 8,
    currentFrame: 100,
    waveProgressFrames: 50,
    baseVerticalSpeed: -1.5,
    sideSentry: false,
    framesPerSecond: 60,
    target: firstTarget
  });
  assert.equal(plan.mode, 'spiral');
  assert.equal(plan.entryFrames, 64);
  assert.equal(plan.diveFrame, 252);
  assert.equal(plan.seed, 88);
  assert.equal(plan.baseSpeed, 2.2);
  assert.deepEqual(plan.target, firstTarget);
  assert.equal(plan.entryDirection, undefined);
  assert.equal(plan.entryPath, undefined);
  assert.equal(plan.entryBehavior, undefined);

  const sentryPlan = formations.resolveFormationEntryPlan({
    eventId: event.id,
    patternId: event.patternId,
    index: 2,
    count: 8,
    currentFrame: 100,
    waveProgressFrames: 50,
    baseVerticalSpeed: -1.5,
    sideSentry: true,
    framesPerSecond: 60,
    target: firstTarget
  });
  assert.equal(sentryPlan.diveFrame, 904, 'wall sentries retain the twelve-second hold');
});

test('authored pack directions and role behaviors deterministically vary formation entries', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const viewport = { width: 390, height: 844 };
  const event = {
    id: 'authored-entry-proof',
    patternId: 'sine',
    positionId: 'formation-top',
    entryDirection: 'split',
    entryPath: 'double-helix',
    entryBehavior: 'formation'
  };
  const resolveSpawn = (entryEvent, index) => (
    formations.resolveConfiguredFormationSpawnPoint({
      event: entryEvent,
      index,
      count: 6,
      viewport,
      randomSample: 0.987654
    })
  );

  const splitLeft = resolveSpawn(event, 0);
  const splitRight = resolveSpawn(event, 1);
  assert.ok(
    (splitLeft.x < 0 && splitRight.x > viewport.width)
      || (splitRight.x < 0 && splitLeft.x > viewport.width),
    'split entry alternates deterministic offscreen sides'
  );
  assert.deepEqual(resolveSpawn(event, 0), splitLeft, 'authored origins never consume random placement');

  const fixedLeft = resolveSpawn({ ...event, entryDirection: 'left' }, 3);
  const fixedRight = resolveSpawn({ ...event, entryDirection: 'right' }, 3);
  assert.ok(fixedLeft.x < 0);
  assert.ok(fixedRight.x > viewport.width);

  const laneSpawn = resolveSpawn({ ...event, entryBehavior: 'lane' }, 0);
  assert.ok(laneSpawn.x >= 0 && laneSpawn.x <= viewport.width);
  assert.ok(laneSpawn.y < 0, 'lane roles override a split pack with a staggered top lane');

  const groupSeed = formations.getFormationGroupSeed(event.id);
  const resolveMotion = (entryBehavior) => formations.resolveFormationEntryMotion({
    mode: 'sine',
    index: 2,
    groupSeed,
    progress: 0.5,
    viewportWidth: viewport.width,
    entryDirection: event.entryDirection,
    entryPath: event.entryPath,
    entryBehavior
  });
  const formationMotion = resolveMotion('formation');
  const flankMotion = resolveMotion('flank');
  const laneMotion = resolveMotion('lane');
  assert.deepEqual(resolveMotion('formation'), formationMotion);
  assert.ok(Math.abs(flankMotion.xOffset) > Math.abs(formationMotion.xOffset));
  assert.ok(Math.abs(laneMotion.xOffset) < Math.abs(formationMotion.xOffset));
  assert.ok(Math.abs(laneMotion.yOffset) < Math.abs(formationMotion.yOffset));

  const endpoint = formations.resolveFormationEntryMotion({
    mode: 'sine',
    index: 2,
    groupSeed,
    progress: 1,
    viewportWidth: viewport.width,
    entryDirection: event.entryDirection,
    entryPath: event.entryPath,
    entryBehavior: event.entryBehavior
  });
  assert.ok(Math.abs(endpoint.xOffset) < 1e-9);
  assert.ok(Math.abs(endpoint.yOffset) < 1e-9);
  assert.ok(Math.abs(endpoint.angle) < 1e-9, 'authored curves still settle exactly on the target');

  const plan = formations.resolveFormationEntryPlan({
    eventId: event.id,
    patternId: event.patternId,
    entryDirection: event.entryDirection,
    entryPath: event.entryPath,
    entryBehavior: event.entryBehavior,
    index: 2,
    count: 6,
    currentFrame: 100,
    waveProgressFrames: 50,
    baseVerticalSpeed: -1.5,
    sideSentry: false,
    framesPerSecond: 60,
    target: { x: 120, y: 160 }
  });
  assert.equal(plan.entryDirection, 'split');
  assert.equal(plan.entryPath, 'double-helix');
  assert.equal(plan.entryBehavior, 'formation');
});

test('formation dives use deterministic shape-appropriate squad maneuvers with bounded speed', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const expectedManeuvers = {
    row: 'sequential-peel',
    grid: 'sequential-peel',
    v: 'synchronized-break',
    diamond: 'synchronized-break',
    sine: 'feint-dive',
    pincer: 'crossing-flanks',
    spiral: 'corkscrew'
  };
  Object.entries(expectedManeuvers).forEach(([mode, maneuver]) => {
    assert.equal(formations.resolveFormationManeuverKind(mode), maneuver);
  });
  assert.equal(formations.resolveFormationManeuverKind('row', 'flank'), 'crossing-flanks');
  assert.equal(formations.resolveFormationManeuverKind('spiral', 'lane'), 'sequential-peel');
  assert.equal(formations.resolveFormationManeuverKind('grid', 'dive'), 'feint-dive');

  const baseInput = {
    index: 1,
    groupSize: 6,
    groupSeed: 431,
    cycle: 0,
    ageFrames: 8,
    baseSpeed: 3.4,
    current: { x: 195, y: 180 },
    anchorX: 195,
    player: { x: 195, y: 700 },
    playerVelocityX: 0,
    viewportWidth: 390,
    mobile: true
  };
  const first = formations.resolveFormationDiveMotion({ ...baseInput, mode: 'spiral' });
  const repeated = formations.resolveFormationDiveMotion({ ...baseInput, mode: 'spiral' });
  assert.deepEqual(first, repeated, 'maneuver sampling never consumes random state');

  Object.keys(expectedManeuvers).forEach((mode) => {
    [0, 8, 16, 28, 54, 90].forEach((ageFrames) => {
      const motion = formations.resolveFormationDiveMotion({
        ...baseInput,
        mode,
        ageFrames
      });
      assert.equal(motion.maneuver, expectedManeuvers[mode]);
      assert.ok(Number.isFinite(motion.velocityX));
      assert.ok(Number.isFinite(motion.velocityY));
      assert.ok(Number.isFinite(motion.angle));
      assert.ok(motion.steering > 0 && motion.steering <= 1);
      assert.ok(
        Math.hypot(motion.velocityX, motion.velocityY) <= baseInput.baseSpeed * 1.32 + 1e-9,
        `${mode} maneuver stays within its authored speed envelope`
      );
    });
  });

  const leftPincer = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'pincer',
    index: 0,
    anchorX: 96,
    ageFrames: 0
  });
  const rightPincer = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'pincer',
    index: 1,
    anchorX: 294,
    ageFrames: 0
  });
  assert.ok(leftPincer.velocityX > 0 && rightPincer.velocityX < 0, 'pincer wings cross through each other');

  const feintDown = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'sine',
    ageFrames: 5
  });
  const feintPullUp = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'sine',
    ageFrames: 16
  });
  const feintCommit = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'sine',
    ageFrames: 36
  });
  assert.ok(feintDown.velocityY > 0 && feintPullUp.velocityY < 0 && feintCommit.velocityY > 0);

  const spiralA = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'spiral',
    ageFrames: 0
  });
  const spiralB = formations.resolveFormationDiveMotion({
    ...baseInput,
    mode: 'spiral',
    ageFrames: 20
  });
  assert.notEqual(
    Math.sign(spiralA.velocityX),
    Math.sign(spiralB.velocityX),
    'corkscrew changes lateral direction during the dive'
  );
});

test('formation compatibility layouts preserve the DNA and ring fleet geometry', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const viewport = { width: 390, height: 844 };
  const resolveFleet = (id, enemySpriteKeys) => Array.from({ length: 4 }, (_, index) => (
    formations.resolveConfiguredFormationTarget({
      event: { id, patternId: 'row', enemySpriteKeys },
      index,
      count: 4,
      entityWidth: 44,
      entityHeight: 44,
      viewport
    })
  )).map(({ x, y }) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);

  assert.deepEqual(
    resolveFleet('null-sector-proof', ['CAMPAIGN_ENEMY_DNA_CONDUCTOR']),
    [[63.8, 113.04], [227.6, 183.04], [227.6, 253.04], [63.8, 323.04]]
  );
  assert.deepEqual(
    resolveFleet('ring-proof', ['CAMPAIGN_ENEMY_RING_SENTINEL']),
    [[173, 133.04], [254.9, 175.04], [173, 217.04], [91.1, 175.04]]
  );
});

test('difficulty resolution preserves authored values and bounds compatibility tiers', () => {
  const difficulty = loadTypeScriptModule(
    'services',
    'gameplay',
    'difficulty',
    'DifficultyResolver.ts'
  );

  assert.equal(difficulty.resolveAuthoredDifficulty({
    startingDifficulty: 1.23,
    waveDifficultyMultiplier: 1.1
  }), 1.23 * 1.1);
  assert.equal(difficulty.resolveAuthoredDifficulty({
    startingDifficulty: 0,
    waveDifficultyMultiplier: 0
  }), 0.01);

  const source = {
    startingDifficulty: 1.23,
    waveDifficultyMultiplier: 1.1
  };
  assert.equal(difficulty.resolveCampaignDifficulty({
    ...source,
    progressionTier: 0
  }), 1.23 * 1.1);
  assert.equal(difficulty.resolveCampaignDifficulty({
    ...source,
    progressionTier: 2
  }), 1.23 * 1.1 * 1.08);
  assert.equal(difficulty.resolveCampaignDifficulty({
    ...source,
    progressionTier: 999
  }), 1.23 * 1.1 * 1.12);
});
