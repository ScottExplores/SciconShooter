import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/backgrounds/timeline'; export * from './services/revamp/backgrounds/themes'; export * from './services/revamp/backgrounds/layout';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const backgrounds = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {
  SET_PIECE_DURATION, BACKDROP_CYCLE_SECONDS, WARP_DURATION_SECONDS,
  sampleBackdropEvent, warpEnvelope, backdropDetailBudget,
  resolveMissionBackdrop, createMissionBackdropLayout,
} = backgrounds;
const campaign = JSON.parse(await readFile(new URL('../../game-config/campaign.json', import.meta.url), 'utf8'));
const events = [
  { kind: 'capital-flyby', atSeconds: 5, side: -1, seed: 1 },
  { kind: 'station-flythrough', atSeconds: 17, side: 1, seed: 2 },
  { kind: 'asteroid-shower', atSeconds: 36, side: -1, seed: 3 },
];
const fixture = { setPieces: events };

test('capital, station and shower events have complete bounded entrance and exit windows', () => {
  for (const event of events) {
    const duration = SET_PIECE_DURATION[event.kind];
    const entrance = sampleBackdropEvent(fixture, event.atSeconds);
    assert.equal(entrance?.event, event);
    assert.equal(entrance?.progress, 0);
    assert.equal(sampleBackdropEvent(fixture, event.atSeconds - 0.001), null);
    assert.equal(sampleBackdropEvent(fixture, event.atSeconds + duration / 2)?.progress, 0.5);
    const exit = sampleBackdropEvent(fixture, event.atSeconds + duration - 0.001);
    assert.equal(exit?.event, event);
    assert.ok(exit.progress > 0.99 && exit.progress < 1);
    assert.equal(sampleBackdropEvent(fixture, event.atSeconds + duration), null);
  }
  assert.equal(sampleBackdropEvent(fixture, -5), null, 'pre-run ticks never start a flyby');
  assert.equal(sampleBackdropEvent(fixture, 0), null);
  assert.equal(sampleBackdropEvent(fixture, BACKDROP_CYCLE_SECONDS - 0.001), null, 'calm gap before repeat');
});

test('long missions repeat cosmetic events without accumulating timer drift or mutating the recipe', () => {
  const before = structuredClone(fixture);
  for (const event of events) for (const cycle of [0, 1, 3, 20]) {
    const sample = sampleBackdropEvent(fixture, event.atSeconds + SET_PIECE_DURATION[event.kind] / 2 + BACKDROP_CYCLE_SECONDS * cycle);
    assert.equal(sample?.event, event);
    assert.equal(sample?.progress, 0.5);
  }
  assert.deepEqual(fixture, before);
});

test('warp rises smoothly to one bounded peak and respects reduced motion at every stage', () => {
  assert.equal(warpEnvelope(-0.01, false), 0);
  assert.equal(warpEnvelope(0, false), 0);
  assert.equal(warpEnvelope(WARP_DURATION_SECONDS / 2, false), 1);
  assert.ok(warpEnvelope(WARP_DURATION_SECONDS, false) < 1e-10);
  assert.equal(warpEnvelope(WARP_DURATION_SECONDS + 0.01, false), 0);
  let previous = 0;
  for (let step = 0; step <= 50; step += 1) {
    const elapsed = WARP_DURATION_SECONDS * step / 100;
    const value = warpEnvelope(elapsed, false);
    assert.ok(value >= previous && value >= 0 && value <= 1);
    assert.ok(Math.abs(value - warpEnvelope(WARP_DURATION_SECONDS - elapsed, false)) < 1e-12);
    previous = value;
  }
  for (const elapsed of [-10, 0, 0.1, WARP_DURATION_SECONDS / 2, WARP_DURATION_SECONDS, 20]) {
    assert.equal(warpEnvelope(elapsed, true), 0, 'reduced motion suppresses every warp flash/stretch');
  }
});

test('quality tiers lower optional detail while retaining three star depths and foreground debris', () => {
  const low = backdropDetailBudget(0.4);
  const medium = backdropDetailBudget(0.65);
  const high = backdropDetailBudget(1);
  assert.ok(low.stars < medium.stars && medium.stars < high.stars);
  assert.ok(low.debris < medium.debris && medium.debris < high.debris);
  assert.ok(low.stars >= 3 && low.debris > 0, 'Low is still an animated world');
  for (const budget of [low, medium, high]) {
    assert.equal(budget.stars % 3, 0, 'sequential depth cycling retains equal star populations');
    assert.ok(budget.stars <= 54 && budget.debris <= 12, 'does not exceed allocated sprites');
  }
  assert.equal(low.battle, false);
  assert.equal(low.secondary, false);
  assert.equal(medium.battle, true);
  assert.equal(medium.secondary, true);
  assert.deepEqual(backdropDetailBudget(0.5), low);
  assert.deepEqual(backdropDetailBudget(0.75), medium);
  assert.deepEqual(backdropDetailBudget(2), high);
});

test('every campaign event starts at its entrance instead of being concealed by an earlier set piece', () => {
  const missionIds = new Set([
    ...campaign.sectors.flatMap(sector => sector.missionIds),
    ...campaign.campaignGraph.nodes.map(node => node.missionDefinitionId),
    ...campaign.campaignBranches.map(branch => branch.missionDefinitionId),
  ]);
  for (const missionId of missionIds) {
    const layout = createMissionBackdropLayout(resolveMissionBackdrop(campaign, missionId));
    let end = -1;
    for (const event of layout.setPieces) {
      assert.ok(event.atSeconds >= end + 1, `${missionId}: ${event.kind} needs a one-second calm gap after the previous set piece`);
      const sample = sampleBackdropEvent(layout, event.atSeconds);
      assert.equal(sample?.event, event, `${missionId}: ${event.kind} starts visibly`);
      assert.equal(sample?.progress, 0);
      end = event.atSeconds + SET_PIECE_DURATION[event.kind];
    }
    assert.ok(end < BACKDROP_CYCLE_SECONDS, `${missionId}: final event leaves a quiet cycle boundary`);
  }
});
