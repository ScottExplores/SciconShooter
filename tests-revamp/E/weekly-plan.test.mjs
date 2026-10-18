import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const server = require('../../shared/weeklyRunPlan.js');
const rotation = require('../../services/revamp/weekly/bossRotation.js');
const campaign = require('../../game-config/campaign.json');
const bundle = await build({
  stdin: { contents: "export * from './shared/weeklyRunPlan.browser'; export { planWeeklyRunStages, buildWeeklyRunCampaign } from './services/weeklyRunGenerator';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm'
});
const browser = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const weekAt = (index) => new Date(Date.UTC(2026, 0, 4 + index * 7)).toISOString().slice(0, 10);

test('three distinct weekly bosses rotate through the entire registered catalog', () => {
  const pool = rotation.getCampaignWeeklyBossPool(campaign);
  const seen = new Set();
  let previous;
  for (let week = 0; week < 54; week++) {
    const key = weekAt(week);
    const stages = server.buildWeeklyRunStagePlans(key, { ...pool, stageCount: 48 });
    const bosses = [...new Set(stages.map((stage) => stage.bossId))];
    assert.equal(bosses.length, 3);
    assert.ok(bosses.every(Boolean));
    assert.notDeepEqual(bosses, previous);
    bosses.forEach((id) => seen.add(id));
    previous = bosses;
    assert.deepEqual(browser.planWeeklyRunStages(key, campaign, 48), stages);
    assert.deepEqual(browser.planWeeklyRunStages(key, undefined, 48), stages, 'shipped normalized campaign must agree with raw server content');
    assert.deepEqual(browser.buildWeeklyRunGraphDefinition(key, { ...pool, stageCount: 48 }), server.buildWeeklyRunGraphDefinition(key, { ...pool, stageCount: 48 }));
    assert.deepEqual(server.buildWeeklyRunStagePlans(key, { ...pool, stageCount: 24 }), stages.slice(0, 24));
  }
  assert.deepEqual([...seen].sort(), [...pool.eliteBossIds, ...pool.majorBossIds].sort());
});

test('campaign additions join automatically and duplicate registrations do not weight rotation', () => {
  const expanded = structuredClone(campaign);
  expanded.campaignGraph.nodes.push({ bossId: 'new-job-c-major', miniBossIds: ['new-job-c-elite'] });
  expanded.levels[0].waves[0].events.push(...['new-authored-boss', 'new-job-c-major', 'new-job-c-elite'].map((bossId) => ({ kind: 'boss', bossId })));
  expanded.campaignGraph.nodes.push({ bossId: 'not-authored-yet' });
  expanded.sectors.push({ ...expanded.sectors[0] });
  const pool = rotation.getCampaignWeeklyBossPool(expanded);
  assert.ok(pool.majorBossIds.includes('new-job-c-major'));
  assert.ok(!pool.majorBossIds.includes('not-authored-yet'));
  assert.ok(pool.majorBossIds.includes('new-authored-boss'));
  assert.ok(pool.eliteBossIds.includes('new-job-c-elite'));
  assert.equal(pool.majorBossIds.length, new Set(pool.majorBossIds).size);
  const seen = new Set();
  for (let index = 0; index < 54; index++) {
    const chosen = rotation.selectWeeklyBossRotation(weekAt(index), pool);
    [...chosen.majorBossIds, ...chosen.eliteBossIds].forEach((id) => seen.add(id));
  }
  assert.ok(seen.has('new-job-c-major') && seen.has('new-job-c-elite') && seen.has('new-authored-boss'));
});

test('persisted Sunday key and next ISO week select the same bosses, including year rollover', () => {
  assert.equal(rotation.getWeeklyRotationOrdinal('2026-10-11'), rotation.getWeeklyRotationOrdinal('2026-W42'));
  assert.equal(rotation.getWeeklyRotationOrdinal('2025-12-28'), rotation.getWeeklyRotationOrdinal('2026-W01'));
});

test('empty and tiny catalogs terminate safely and keep server/browser parity', () => {
  for (const pool of [{}, { eliteBossIds: ['one'] }, { majorBossIds: ['one', 'two', 'three', 'four'] }]) {
    assert.deepEqual(browser.buildWeeklyRunStagePlans('2026-10-11', pool), server.buildWeeklyRunStagePlans('2026-10-11', pool));
  }
});

test('every weekly rotation materializes real authored combat encounters', () => {
  for (let week = 0; week < 12; week++) {
    const generated = browser.buildWeeklyRunCampaign(weekAt(week), campaign, 8);
    const events = generated.levels.flatMap((level) => level.waves.flatMap((wave) => wave.events))
      .filter((event) => event.kind === 'boss');
    assert.equal(events.length, 8);
    assert.equal(new Set(events.map((event) => event.bossId)).size, 3);
    assert.ok(events.every((event) => event.health > 0 && event.weapons.length > 0));
  }
});
