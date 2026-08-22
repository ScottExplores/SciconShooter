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

const camera = await vite.ssrLoadModule(
  '/services/gameplay/EncounterCameraRuntime.ts'
);

const mobileDisplay = Object.freeze({ width: 390, height: 844 });
const octarchProfile = Object.freeze({
  eventId: 'sandbox-abyssal-octarch',
  normalScale: 1,
  expandedScale: 0.72,
  zoomDelayFrames: 54,
  zoomDurationFrames: 132,
  restoreDurationFrames: 90,
  verticalAnchor: 'top'
});

const buildSample = (overrides = {}) => {
  const world = camera.resolveEncounterWorldSize(
    mobileDisplay.width,
    mobileDisplay.height,
    octarchProfile
  );
  return camera.sampleEncounterCameraTransform({
    frame: 0,
    displayWidth: mobileDisplay.width,
    displayHeight: mobileDisplay.height,
    worldWidth: world.width,
    worldHeight: world.height,
    profile: octarchProfile,
    ...overrides
  });
};

test('world sizing preserves ordinary encounters and expands the Octarch simulation arena', () => {
  assert.deepEqual(camera.resolveEncounterWorldSize(390, 844, undefined), {
    width: 390,
    height: 844
  });
  assert.deepEqual(camera.resolveEncounterWorldSize(
    mobileDisplay.width,
    mobileDisplay.height,
    octarchProfile
  ), {
    width: 542,
    height: 1172
  });

  const tiny = camera.resolveEncounterWorldSize(-100, 0, undefined);
  assert.deepEqual(tiny, { width: 1, height: 1 });
  assert.ok(Number.isFinite(tiny.width));
  assert.ok(Number.isFinite(tiny.height));
});

test('automatic camera sampling waits, smoothsteps, and reaches the expanded scale', () => {
  const beforeDelay = buildSample({ frame: 53 });
  const delayBoundary = buildSample({ frame: 54 });
  const quarter = buildSample({ frame: 87 });
  const midpoint = buildSample({ frame: 120 });
  const complete = buildSample({ frame: 186 });

  assert.equal(beforeDelay.progress, 0);
  assert.equal(beforeDelay.scale, 1);
  assert.equal(delayBoundary.progress, 0);
  assert.equal(delayBoundary.scale, 1);
  assert.equal(quarter.progress, 0.15625);
  assert.equal(
    quarter.scale,
    1 + (octarchProfile.expandedScale - 1) * 0.15625
  );
  assert.equal(midpoint.progress, 0.5);
  assert.equal(midpoint.scale, 0.86);
  assert.equal(midpoint.expanded, false);
  assert.equal(complete.progress, 1);
  assert.equal(complete.scale, octarchProfile.expandedScale);
  assert.equal(complete.expanded, true);

  assert.ok([
    beforeDelay,
    delayBoundary,
    quarter,
    midpoint,
    complete
  ].every((sample) => (
    Number.isFinite(sample.scale)
    && Number.isFinite(sample.offsetX)
    && Number.isFinite(sample.offsetY)
    && Number.isFinite(sample.progress)
    && sample.progress >= 0
    && sample.progress <= 1
    && sample.scale >= octarchProfile.expandedScale
    && sample.scale <= octarchProfile.normalScale
  )));
});

test('normal and expanded overrides ignore encounter time but retain top anchoring', () => {
  const normal = buildSample({ frame: 99_999, mode: 'normal' });
  const expanded = buildSample({ frame: -99_999, mode: 'expanded' });

  assert.equal(normal.scale, 1);
  assert.equal(normal.progress, 0);
  assert.equal(normal.expanded, false);
  assert.equal(normal.offsetY, 0);

  assert.equal(expanded.scale, octarchProfile.expandedScale);
  assert.equal(expanded.progress, 1);
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.offsetY, 0);
  assert.ok(Math.abs(expanded.offsetX) < 0.13);
});

test('visible world bounds restore the normal mobile arena and expand to the full Octarch world', () => {
  const world = camera.resolveEncounterWorldSize(
    mobileDisplay.width,
    mobileDisplay.height,
    octarchProfile
  );
  const normal = buildSample({ mode: 'normal' });
  const expanded = buildSample({ mode: 'expanded' });
  const normalBounds = camera.resolveEncounterVisibleWorldBounds({
    transform: normal,
    displayWidth: mobileDisplay.width,
    displayHeight: mobileDisplay.height,
    worldWidth: world.width,
    worldHeight: world.height
  });
  const expandedBounds = camera.resolveEncounterVisibleWorldBounds({
    transform: expanded,
    displayWidth: mobileDisplay.width,
    displayHeight: mobileDisplay.height,
    worldWidth: world.width,
    worldHeight: world.height
  });

  assert.ok(Math.abs(normalBounds.width - mobileDisplay.width) < 1e-9);
  assert.ok(Math.abs(normalBounds.height - mobileDisplay.height) < 1e-9);
  assert.ok(Math.abs(normalBounds.minX - 76) < 1e-9);
  assert.equal(normalBounds.minY, 0);
  assert.ok(Math.abs(expandedBounds.minX) < 0.2);
  assert.ok(Math.abs(expandedBounds.maxX - world.width) < 0.2);
  assert.equal(expandedBounds.minY, 0);
  assert.equal(expandedBounds.maxY, world.height);
});

test('restore sampling uses the authored duration without skipping expanded or normal endpoints', () => {
  const world = camera.resolveEncounterWorldSize(
    mobileDisplay.width,
    mobileDisplay.height,
    octarchProfile
  );
  const sampleRestore = (elapsedFrames) => camera.sampleEncounterCameraRestoreTransform({
    elapsedFrames,
    startScale: octarchProfile.expandedScale,
    displayWidth: mobileDisplay.width,
    displayHeight: mobileDisplay.height,
    worldWidth: world.width,
    worldHeight: world.height,
    profile: octarchProfile
  });
  const start = sampleRestore(0);
  const midpoint = sampleRestore(octarchProfile.restoreDurationFrames / 2);
  const complete = sampleRestore(octarchProfile.restoreDurationFrames);

  assert.equal(start.scale, octarchProfile.expandedScale);
  assert.equal(start.progress, 1);
  assert.equal(midpoint.scale, 0.86);
  assert.equal(midpoint.progress, 0.5);
  assert.equal(complete.scale, octarchProfile.normalScale);
  assert.equal(complete.progress, 0);
  assert.equal(complete.expanded, false);
});

test('390x844 display coordinates round-trip through the expanded world transform', () => {
  const world = camera.resolveEncounterWorldSize(
    mobileDisplay.width,
    mobileDisplay.height,
    octarchProfile
  );
  const transform = buildSample({ frame: 120 });
  const worldPoints = [
    { x: 0, y: 0 },
    { x: world.width / 2, y: world.height / 2 },
    { x: world.width, y: world.height },
    { x: 111.25, y: 972.75 }
  ];

  for (const point of worldPoints) {
    const display = {
      x: point.x * transform.scale + transform.offsetX,
      y: point.y * transform.scale + transform.offsetY
    };
    const roundTrip = camera.mapEncounterDisplayPointToWorld({
      ...display,
      transform,
      worldWidth: world.width,
      worldHeight: world.height
    });
    assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - point.y) < 1e-9);
  }
});

test('display input mapping remains finite and clamps extreme finite points to world bounds', () => {
  const world = camera.resolveEncounterWorldSize(
    mobileDisplay.width,
    mobileDisplay.height,
    octarchProfile
  );
  const transform = buildSample({ frame: 120 });
  const requests = [
    { x: -1_000_000_000, y: -1_000_000_000, expected: { x: 0, y: 0 } },
    {
      x: 1_000_000_000,
      y: 1_000_000_000,
      expected: { x: world.width, y: world.height }
    },
    { x: transform.offsetX, y: transform.offsetY, expected: { x: 0, y: 0 } }
  ];

  for (const request of requests) {
    const mapped = camera.mapEncounterDisplayPointToWorld({
      x: request.x,
      y: request.y,
      transform,
      worldWidth: world.width,
      worldHeight: world.height
    });
    assert.deepEqual(mapped, request.expected);
    assert.ok(Number.isFinite(mapped.x));
    assert.ok(Number.isFinite(mapped.y));
    assert.ok(mapped.x >= 0 && mapped.x <= world.width);
    assert.ok(mapped.y >= 0 && mapped.y <= world.height);
  }
});

test('non-finite camera and input values degrade to finite bounded fallbacks', () => {
  assert.deepEqual(camera.resolveEncounterWorldSize(NaN, NaN, undefined), {
    width: 1,
    height: 1
  });
  assert.deepEqual(camera.resolveEncounterWorldSize(
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    octarchProfile
  ), {
    width: 1,
    height: 1
  });

  const transform = camera.sampleEncounterCameraTransform({
    frame: NaN,
    displayWidth: NaN,
    displayHeight: NaN,
    worldWidth: NaN,
    worldHeight: NaN,
    profile: octarchProfile
  });
  assert.ok(Object.values(transform).every((value) => (
    typeof value === 'boolean' || Number.isFinite(value)
  )));
  assert.equal(transform.scale, 1);
  assert.equal(transform.offsetX, 0);
  assert.equal(transform.offsetY, 0);

  const mapped = camera.mapEncounterDisplayPointToWorld({
    x: NaN,
    y: NaN,
    transform: {
      scale: NaN,
      offsetX: NaN,
      offsetY: NaN,
      progress: NaN,
      expanded: false
    },
    worldWidth: NaN,
    worldHeight: NaN
  });
  assert.deepEqual(mapped, { x: 0, y: 0 });
  assert.ok(Number.isFinite(mapped.x));
  assert.ok(Number.isFinite(mapped.y));
});

test('profile normalization clamps scale and duration inputs before world or camera math', () => {
  const normalized = camera.normalizeEncounterCameraProfile({
    eventId: 'bounded-camera-profile',
    normalScale: 99,
    expandedScale: -99,
    zoomDelayFrames: -40,
    zoomDurationFrames: 0,
    restoreDurationFrames: -8,
    verticalAnchor: 'unexpected'
  });
  assert.deepEqual(normalized, {
    eventId: 'bounded-camera-profile',
    normalScale: 1.5,
    expandedScale: 0.5,
    zoomDelayFrames: 0,
    zoomDurationFrames: 1,
    restoreDurationFrames: 1,
    verticalAnchor: 'top'
  });

  const centered = camera.sampleEncounterCameraTransform({
    frame: 1,
    displayWidth: 390,
    displayHeight: 844,
    worldWidth: 780,
    worldHeight: 1_688,
    profile: { ...normalized, verticalAnchor: 'center' },
    mode: 'expanded'
  });
  assert.equal(centered.offsetX, 0);
  assert.equal(centered.offsetY, 0);
  assert.ok(Object.values(centered).every((value) => (
    typeof value === 'boolean' || Number.isFinite(value)
  )));
});
