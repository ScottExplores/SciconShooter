import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const server = await createServer({
  root: repositoryRoot,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom'
});

after(async () => {
  await server.close();
});

const timelineModel = await server.ssrLoadModule('/director/src/editor/eventTimelineModel.ts');
const editorOperations = await server.ssrLoadModule('/director/src/editor/editorOperations.ts');

const {
  buildEventTimelineTicks,
  clampEventTimelineStart,
  getEventTimelineClipPercent,
  getEventTimelineStartRange,
  layoutEventTimelineLane,
  moveEventTimelineStart
} = timelineModel;
const { sortWaveEvents } = editorOperations;

const eventFixture = (overrides = {}) => ({
  id: 'spawn-a',
  label: 'Formation A',
  kind: 'spawn',
  startSeconds: 0,
  durationSeconds: 4,
  delayAfterSeconds: 0,
  blocksWaveClock: false,
  count: 1,
  patternId: 'v',
  positionId: 'formation-top',
  spawnIntervalSeconds: 0.5,
  enemies: [],
  ...overrides
});

test('timeline start edits keep non-blocking clips inside the active wave clock', () => {
  const nonBlocking = eventFixture({ durationSeconds: 4, blocksWaveClock: false });
  const blocking = eventFixture({ durationSeconds: 40, blocksWaveClock: true });

  assert.deepEqual(getEventTimelineStartRange(nonBlocking, 10), {
    minimum: 0,
    maximum: 6
  });
  assert.equal(clampEventTimelineStart(nonBlocking, 10, 9.94), 6);
  assert.equal(clampEventTimelineStart(nonBlocking, 10, -2), 0);

  assert.deepEqual(getEventTimelineStartRange(blocking, 10), {
    minimum: 0,
    maximum: 10
  });
  assert.equal(clampEventTimelineStart(blocking, 10, 9.94), 9.9);
});

test('keyboard timeline moves use editor precision and honor both limits', () => {
  const event = eventFixture({ startSeconds: 2, durationSeconds: 3 });

  assert.equal(moveEventTimelineStart(event, 10, 2, 'forward', 0.5), 2.5);
  assert.equal(moveEventTimelineStart(event, 10, 2, 'backward', 1), 1);
  assert.equal(moveEventTimelineStart(event, 10, 2, 'start'), 0);
  assert.equal(moveEventTimelineStart(event, 10, 2, 'end'), 7);
  assert.equal(moveEventTimelineStart(event, 10, 6.8, 'forward', 1), 7);
});

test('ruler and clip geometry scale against the selected wave duration', () => {
  const ticks = buildEventTimelineTicks(60);
  assert.deepEqual(ticks.map((tick) => tick.seconds), [0, 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(
    ticks.map((tick) => Math.round(tick.percent * 100) / 100),
    [0, 16.67, 33.33, 50, 66.67, 83.33, 100]
  );

  const position = getEventTimelineClipPercent(
    eventFixture({ startSeconds: 15, durationSeconds: 10 }),
    60
  );
  assert.equal(position.left, 25);
  assert.ok(Math.abs(position.width - 100 / 6) < 0.0001);

  const clippedAtEnd = getEventTimelineClipPercent(
    eventFixture({ startSeconds: 55, durationSeconds: 10, blocksWaveClock: true }),
    60
  );
  assert.ok(Math.abs(clippedAtEnd.left - 275 / 3) < 0.0001);
  assert.ok(Math.abs(clippedAtEnd.width - 25 / 3) < 0.0001);
});

test('overlapping clips stack within their content lane without changing authored order', () => {
  const events = [
    eventFixture({ id: 'spawn-a', label: 'A', startSeconds: 0, durationSeconds: 5 }),
    eventFixture({ id: 'boss', label: 'Boss', kind: 'boss', startSeconds: 1, durationSeconds: 8 }),
    eventFixture({ id: 'spawn-b', label: 'B', startSeconds: 2, durationSeconds: 3 }),
    eventFixture({ id: 'spawn-c', label: 'C', startSeconds: 5, durationSeconds: 2 })
  ];
  const layout = layoutEventTimelineLane(events, 'spawn');

  assert.equal(layout.rowCount, 2);
  assert.deepEqual(layout.items.map(({ event, row }) => [event.id, row]), [
    ['spawn-a', 0],
    ['spawn-b', 1],
    ['spawn-c', 0]
  ]);
});

test('committing a timeline edit uses the existing stable wave-event sort contract', () => {
  const events = [
    eventFixture({ id: 'late', label: 'Late', startSeconds: 8 }),
    eventFixture({ id: 'early', label: 'Early', startSeconds: 1 }),
    eventFixture({ id: 'middle', label: 'Middle', startSeconds: 4 })
  ];
  const moved = events.map((event) => (
    event.id === 'late' ? { ...event, startSeconds: 2 } : event
  ));

  assert.deepEqual(sortWaveEvents(moved).map((event) => event.id), [
    'early',
    'late',
    'middle'
  ]);
});
