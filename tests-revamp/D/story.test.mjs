import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = await mkdtemp(path.join(tmpdir(), 'scicon-story-'));
const outfile = path.join(dir, 'story.mjs');
await build({
  stdin: { contents: `export * from './services/storyBeats.ts'; export * from './services/storyTransmissionSchedule.ts'; export * from './services/revamp/story/campaignStory.ts';`, resolveDir: root },
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent'
});
const story = await import(pathToFileURL(outfile).href);
const campaign = JSON.parse(await readFile(path.join(root, 'game-config/campaign.json'), 'utf8'));
await rm(dir, { recursive: true, force: true });

const memoryStorage = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
};

test('all ten authored sectors have four distinct short Open Science Frontier cues', () => {
  assert.equal(story.OPEN_SCIENCE_FRONTIER.length, 10);
  assert.equal(story.FRONTIER_STORY_BEATS.length, 41);
  assert.equal(new Set(story.FRONTIER_STORY_BEATS.map((beat) => beat.id)).size, 41);
  for (const sector of campaign.sectors) {
    const beats = story.FRONTIER_STORY_BEATS.filter((beat) => beat.phase === sector.order && beat.kind !== 'cold-open');
    assert.deepEqual(beats.map((beat) => beat.kind), ['intro', 'midpoint', 'boss', 'victory']);
    for (const beat of beats) {
      assert.equal(beat.presentation, 'inline');
      assert.ok(beat.text.split(/\s+/).length <= 30, `${beat.id} is longer than a short radio line`);
    }
  }
});

test('cold-open and Launch Bay intro are spaced across the first two launches', () => {
  const firstSector = campaign.sectors[0];
  assert.equal(story.getStoryBeatForMission(firstSector.missionIds[0]).kind, 'cold-open');
  assert.equal(story.getStoryBeatForMission(firstSector.missionIds[1]).kind, 'intro');
  assert.match(story.COLD_OPEN_STORY_BEAT.text, /Drag to fly/);
});

test('midpoint, boss taunt, and victory follow the authored main route in every sector', () => {
  for (const sector of campaign.sectors) {
    const midpoint = sector.missionIds[Math.floor(sector.missionIds.length / 2)];
    const last = sector.missionIds.at(-1);
    assert.equal(story.getStoryBeatForMission(midpoint).kind, 'midpoint');
    assert.equal(story.getStoryBeatForMission(last).kind, 'boss');
    assert.equal(story.getStoryBeatForMission(last, 'victory').kind, 'victory');
    assert.equal(story.getStoryBeatForMission(midpoint, 'victory'), null);
  }
});

test('alternate route Mission numbers resolve to their real sector instead of invented sectors 11 and 12', () => {
  const missions = [...campaign.levels].sort((a, b) => a.order - b.order);
  for (let index = 50; index < missions.length; index++) {
    const beat = story.getStoryBeatForPhase(index + 1);
    const sector = campaign.sectors.find((entry) => entry.id === missions[index].campaignProgression.sectorId);
    assert.equal(beat.phase, sector.order);
    assert.equal(beat.kind, 'midpoint');
  }
  assert.equal(story.getStoryBeatForPhase(999), null);
  assert.equal(story.getStoryBeatForMission('not-a-mission'), null);
});

test('same-sector intro, twist, taunt, and victory have independent profile-scoped daily seen markers', () => {
  const storage = memoryStorage();
  const today = new Date(2026, 9, 17, 23, 59);
  const tomorrow = new Date(2026, 9, 18, 0, 1);
  const beats = story.FRONTIER_STORY_BEATS.filter((beat) => beat.phase === 3);
  story.markStoryBeatSeenTodayForProfile(beats[0], 'pilot-a', storage, today);
  assert.equal(story.hasSeenStoryBeatTodayForProfile(beats[0], 'pilot-a', storage, today), true);
  assert.equal(story.hasSeenStoryBeatTodayForProfile(beats[0], 'pilot-b', storage, today), false);
  assert.equal(story.hasSeenStoryBeatTodayForProfile(beats[1], 'pilot-a', storage, today), false);
  assert.equal(story.hasSeenStoryBeatTodayForProfile(beats[0], 'pilot-a', storage, tomorrow), false);
});

test('storage refusal and corrupt state cannot block deployment or skipping', () => {
  const denied = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const corrupt = { getItem() { return '{oops'; }, setItem() {} };
  for (const storage of [denied, corrupt, null]) {
    assert.equal(story.hasSeenStoryBeatTodayForProfile(story.COLD_OPEN_STORY_BEAT, 'pilot', storage), false);
    assert.doesNotThrow(() => story.markStoryBeatSeenTodayForProfile(story.COLD_OPEN_STORY_BEAT, 'pilot', storage));
  }
});

test('legacy transmissions keep their original identity and guest schedule', () => {
  const legacy = { phase: 2, title: 'Old transmission' };
  const storage = memoryStorage();
  assert.equal(story.getStoryBeatDailyId(legacy), '2:Old transmission');
  story.markStoryBeatSeenToday(legacy, storage);
  assert.equal(story.hasSeenStoryBeatToday(legacy, storage), true);
});

test('live transmission duration provides reading time and is bounded', () => {
  assert.equal(story.getInlineTransmissionDurationMs('Copy.'), 5200);
  assert.equal(story.getInlineTransmissionDurationMs('word '.repeat(100)), 9000);
  for (const beat of story.FRONTIER_STORY_BEATS) {
    const duration = story.getInlineTransmissionDurationMs(beat.text);
    assert.ok(duration >= 5200 && duration <= 9000);
  }
});
