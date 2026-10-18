import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await build({ stdin: { resolveDir: root, contents: `
  export * from './services/revamp/formations/spline.ts';
  export * from './services/revamp/formations/entryLibrary.ts';
  export * from './services/revamp/formations/galagaDive.ts';
  export * from './services/gameplay/formations/FormationRuntime.ts';
  export * from './services/gameplay/formations/FormationFlight.ts';
` }, bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const close = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≠ ${b}`);
const pointClose = (a, b, epsilon) => { close(a.x, b.x, epsilon); close(a.y, b.y, epsilon); };
const world = { width: 390, height: 844 };
const input = (path, slot = { x: 170, y: 185 }) => ({ path, world, side: -1, hullWidth: 44,
  start: api.entrySpawn(path, world, -1), slot });

test('all eight entry routes arrive exactly, remain bounded and mirror at every sampled age', () => {
  assert.equal(api.REVAMP_ENTRY_PATHS.length, 8);
  for (const path of api.REVAMP_ENTRY_PATHS) {
    const spec = input(path);
    const left = api.getEntryFlight(spec);
    const mirror = point => ({ x: world.width - spec.hullWidth - point.x, y: point.y });
    const right = api.getEntryFlight({ ...spec, side: 1, start: mirror(spec.start), slot: mirror(spec.slot) });
    pointClose(api.sampleEntry(left, 0), spec.start);
    pointClose(api.sampleEntry(left, left.spline.durationSeconds), spec.slot);
    pointClose(api.sampleEntry(left, left.spline.durationSeconds + 20), spec.slot);
    close(left.spline.durationSeconds, right.spline.durationSeconds);
    let previous = api.sampleEntry(left, 0);
    for (let frame = 0; frame <= Math.ceil(left.spline.durationSeconds * 60); frame++) {
      const time = frame / 60;
      const pose = api.sampleEntry(left, time);
      pointClose(api.sampleEntry(right, time), mirror(pose));
      assert.ok(Number.isFinite(pose.x + pose.y + pose.angle), path);
      assert.ok(pose.x >= -80 && pose.x <= world.width + 80, path);
      assert.ok(pose.y >= -90 && pose.y <= world.height + 75, path);
      if (path !== 'revamp-bottom-flank') assert.ok(pose.y < world.height * 0.45, path);
      assert.ok(Math.hypot(pose.x - previous.x, pose.y - previous.y) <= left.cruiseSpeed / 60 + 0.01, path);
      previous = pose;
    }
    const beforeStop = api.sampleEntry(left, left.spline.durationSeconds - 1 / 60);
    assert.ok(Math.hypot(beforeStop.x - spec.slot.x, beforeStop.y - spec.slot.y) < 0.2, `${path} brakes gently`);
  }
});

test('swoop becomes visible promptly and all sampling is independent of rendering cadence', () => {
  const flight = api.getEntryFlight(input('revamp-swoop'));
  assert.ok(api.sampleEntry(flight, 0.65).y >= 0);
  const direct = api.sampleEntry(flight, 1.5);
  for (const refreshRate of [30, 60, 120, 144]) {
    for (let frame = 0; frame < refreshRate * 1.5; frame++) api.sampleEntry(flight, frame / refreshRate);
    assert.deepEqual(api.sampleEntry(flight, 1.5), direct);
  }
});

test('followers ride identical shared geometry until their final individual slot glide', () => {
  for (const path of api.REVAMP_ENTRY_PATHS) {
    const lead = api.getEntryFlight(input(path, { x: 80, y: 160 }));
    const follower = api.getEntryFlight(input(path, { x: 250, y: 220 }));
    close(lead.settleStartsAtSeconds, follower.settleStartsAtSeconds);
    for (let t = 0; t < lead.settleStartsAtSeconds; t += 0.05) {
      pointClose(api.sampleEntry(lead, t), api.sampleEntry(follower, t + api.TRAIN_STAGGER_SECONDS * 3, 3));
    }
    pointClose(api.sampleEntry(follower, api.TRAIN_STAGGER_SECONDS * 2, 3), input(path).start);
    assert.notDeepEqual(api.sampleEntry(lead, lead.spline.durationSeconds), api.sampleEntry(follower, follower.spline.durationSeconds));
  }
});

test('edge entries expose a full 0.8 second warning at the actual entry edge', () => {
  for (const path of ['revamp-bottom-flank', 'revamp-side-sweep', 'revamp-pincer']) {
    for (const side of [-1, 1]) {
      const warning = api.getEntryWarning({ path, side, world });
      assert.equal(warning.seconds, 0.8);
      assert.equal(warning.edge, path === 'revamp-bottom-flank' ? 'bottom' : side < 0 ? 'left' : 'right');
      assert.ok(warning.x > 0 && warning.x < world.width);
      assert.ok(warning.y > 0 && warning.y < world.height);
    }
  }
  assert.equal(api.getEntryWarning({ path: 'revamp-swoop', side: -1, world }), undefined);
});

test('Galaga dive commits its route, fires once at deepest point, and returns to its own slot', () => {
  for (const cycle of [0, 1]) for (const escortPosition of [-1, 0, 1]) {
    const start = { x: 115, y: 180 };
    const target = { x: 220, y: 750 };
    const dive = api.createGalagaDive({ start, target, world, speedPerSecond: 270, cycle, escortPosition });
    const bottom = api.sampleTimedSpline(dive.spline, dive.shotAtSeconds);
    target.x = 5;
    target.y = 5;
    pointClose(api.sampleTimedSpline(dive.spline, dive.spline.durationSeconds), start);
    pointClose(api.sampleTimedSpline(dive.spline, dive.shotAtSeconds), bottom);
    assert.ok(bottom.y <= world.height * 0.68);
    let shots = 0;
    let previousAge = 0;
    for (let age = 0; age <= dive.spline.durationSeconds + 0.09; age += 0.09) {
      if (api.crossedDiveShot(previousAge, age, dive.shotAtSeconds)) shots++;
      const point = api.sampleTimedSpline(dive.spline, age);
      assert.ok(point.y <= bottom.y + 0.001);
      assert.ok(point.x >= 0 && point.x <= world.width);
      previousAge = age;
    }
    assert.equal(shots, 1);
  }
});

test('dive selection supports single and escort trio and cadence ramps without spikes', () => {
  assert.deepEqual(api.resolveFormationAttackIndices('revamp-dive', 3, 8, 5), [3]);
  assert.deepEqual(api.resolveFormationAttackIndices('revamp-escort', 1, 8, 3), [3, 4, 5]);
  assert.deepEqual(api.resolveFormationAttackIndices('revamp-escort', 1, 2, 3), [1, 0]);
  for (let tier = 0; tier < 4; tier++) {
    let previous = Infinity;
    for (let step = 0; step <= 20; step++) {
      const cadence = api.resolveDiveCadenceSeconds({ waveProgress: step / 20, difficultyTier: tier, mission: 10 });
      assert.ok(cadence >= 2.1 && cadence <= previous);
      previous = cadence;
    }
  }
});

test('a diver leaving a swaying formation rejoins the immutable slot without a terminal snap', () => {
  const start = { x: 88, y: 153 };
  const returnSlot = { x: 80, y: 150 };
  const spec = { start, target: { x: 220, y: 750 }, world, speedPerSecond: 270, cycle: 0 };
  const dive = api.createGalagaDive({ ...spec, returnSlot });
  const oldDive = api.createGalagaDive(spec);
  close(dive.shotAtSeconds, oldDive.shotAtSeconds);
  pointClose(api.sampleTimedSpline(dive.spline, dive.shotAtSeconds), api.sampleTimedSpline(oldDive.spline, oldDive.shotAtSeconds));
  pointClose(api.sampleTimedSpline(dive.spline, 0), start);
  pointClose(api.sampleTimedSpline(dive.spline, dive.spline.durationSeconds), returnSlot);
  const flight = api.createFormationAttackFlight({ start, returnSlot, target: spec.target,
    width: world.width, height: world.height, hullHeight: 44, index: 0, cycle: 0, attack: 'revamp-dive', speed: 4.5 });
  pointClose(api.sampleFormationFlight(flight, flight.duration), returnSlot);
  const before = api.sampleFormationFlight(flight, flight.duration - 1);
  assert.ok(Math.hypot(before.x - returnSlot.x, before.y - returnSlot.y) <= 4.5 + 1e-7);
});

test('runtime hooks preserve spline timing, exact slot endpoints, breathing and flight shot metadata', () => {
  for (const path of api.REVAMP_ENTRY_PATHS) {
    const spec = input(path);
    const runtimeInput = { mode: 'grid', index: 0, count: 4, groupSeed: 0, progress: 0,
      viewport: world, entityWidth: 44, entityHeight: 44, start: spec.start, target: spec.slot,
      entryDirection: 'left', entryPath: path };
    const duration = api.resolveFormationTrainDuration(runtimeInput);
    close(duration, api.getEntryFlight(spec).spline.durationSeconds * 60);
    pointClose(api.resolveFormationCohortEntryPose(runtimeInput), spec.start);
    pointClose(api.resolveFormationCohortEntryPose({ ...runtimeInput, progress: 1 }), spec.slot);
  }
  const base = { x: 80, y: 150 };
  const breathing = api.resolveFormationMovementPoint({ movementId: 'revamp-breathe', base, groupCenter: { x: 180, y: 180 },
    frame: 90, groupSeed: 4, index: 0, count: 4, viewport: world });
  assert.ok(Math.abs(breathing.x - base.x) <= 11 && Math.abs(breathing.y - base.y) <= 4);
  const flight = api.createFormationAttackFlight({ start: base, target: { x: 200, y: 700 },
    width: world.width, height: world.height, hullHeight: 44, index: 0, cycle: 0, attack: 'revamp-dive', speed: 4.5 });
  assert.equal(flight.revampReturnsToSlot, true);
  assert.ok(flight.revampShotAtAge > 0 && flight.revampShotAtAge < flight.duration);
  pointClose(api.sampleFormationFlight(flight, flight.duration), base);
});
