import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const load = async (name) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../../services/revamp/performance/${name}.ts`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [{ nextRenderTimestamp, RENDER_FRAME_INTERVAL_MS }, { wingHudSnapshotsEqual }] = await Promise.all([
  load('RenderCadence'), load('wingHudEquality')
]);

const scheduledFrames = (timestamps) => {
  let previous = 0;
  return timestamps.filter((timestamp) => {
    const next = nextRenderTimestamp(timestamp, previous);
    if (next === null) return false;
    previous = next;
    return true;
  });
};

test('rounded 60Hz callbacks all render without the old near-30FPS cadence regression', () => {
  const timestamps = Array.from({ length: 600 }, (_, index) => Math.round((index + 1) * RENDER_FRAME_INTERVAL_MS * 10) / 10);
  assert.equal(scheduledFrames(timestamps).length, 600);
  const jittered = timestamps.map((timestamp, index) => timestamp + (index % 2 ? -0.2 : 0.2));
  assert.equal(scheduledFrames(jittered).length, 600);
});

test('120Hz and 144Hz displays retain a common 60Hz presentation cap', () => {
  for (const hz of [120, 144]) {
    const timestamps = Array.from({ length: hz * 10 }, (_, index) => Math.round((index + 1) * 1000 / hz * 10) / 10);
    assert.equal(scheduledFrames(timestamps).length, 600, `${hz}Hz panel`);
  }
});

test('late frames render once without a backlog burst or stalled next frame', () => {
  const previous = nextRenderTimestamp(1000, 0);
  assert.ok(Math.abs(previous - 1000) < 0.001);
  assert.equal(nextRenderTimestamp(1008.3, previous), null);
  assert.ok(nextRenderTimestamp(1016.6, previous) !== null);
  assert.equal(nextRenderTimestamp(NaN, previous), null);
  assert.equal(nextRenderTimestamp(-10, previous), null);
  const slow = Array.from({ length: 300 }, (_, index) => (index + 1) * 1000 / 30);
  assert.equal(scheduledFrames(slow).length, 300);
});

const wing = () => ({
  slot: 'left', id: 'citation-dart', image: '/wing.png', level: 1, special: 'lance',
  label: 'Laser Lance', evolved: false, cooldownFrames: 90, cooldownMax: 600, ready: false
});
const snapshot = () => ({ enabled: true, autoCast: true, wings: [wing()] });

test('equivalent allocated wing snapshots do not require React updates', () => {
  const previous = snapshot();
  assert.equal(wingHudSnapshotsEqual(previous, structuredClone(previous)), true);
  assert.equal(wingHudSnapshotsEqual(null, previous), false);
  assert.equal(wingHudSnapshotsEqual({ enabled: true, autoCast: true, wings: [] }, { enabled: true, autoCast: true, wings: [] }), true);
});

test('cooldown, ready state, autocast, unlock and equipment changes remain visible', () => {
  const previous = snapshot();
  const changes = [
    next => next.wings[0].cooldownFrames--,
    next => next.wings[0].ready = true,
    next => next.wings[0].cooldownMax = 480,
    next => next.autoCast = false,
    next => next.enabled = false,
    next => next.wings.push({ ...wing(), slot: 'right', id: 'quorum-crab' }),
    next => next.wings[0].id = 'nebula-tern',
    next => next.wings[0].image = '/new-wing.png',
    next => next.wings[0].level = 5,
    next => next.wings[0].evolved = true,
    next => next.wings[0].label = 'Evolved Laser Lance',
    next => next.wings[0].special = 'swarm'
  ];
  for (const change of changes) {
    const next = structuredClone(previous);
    change(next);
    assert.equal(wingHudSnapshotsEqual(previous, next), false);
  }
});
