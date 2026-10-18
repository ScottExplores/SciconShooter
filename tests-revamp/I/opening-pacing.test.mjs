import test from 'node:test';
import assert from 'node:assert/strict';
import { loadOpeningRuntime, measureOpeningMission } from '../../tools-revamp/measure-opening.mjs';

const runtime = await loadOpeningRuntime();
const campaign = runtime.DEFAULT_GAME_CAMPAIGN;
const first = campaign.levels.find(level => level.id === campaign.sectors[0].missionIds[0]);

test('actual opening gives the baseline pilot a dense, readable 60–90 second mission', () => {
  const result = measureOpeningMission(runtime, first);
  assert.ok(result.complete && result.lives > 0, JSON.stringify(result.damage));
  assert.ok(result.elapsedSeconds >= 60 && result.elapsedSeconds <= 90, `duration ${result.elapsedSeconds}`);
  assert.ok(result.firstEnemySeconds <= 1, `first contact ${result.firstEnemySeconds}`);
  assert.ok(result.maxEnemies >= 24 && result.maxEnemies <= 40, `visible fleet ${result.maxEnemies}`);
  assert.ok(result.maxHolding >= 18, `assembled fleet ${result.maxHolding}`);
  assert.ok(result.samples.some(sample => sample.seconds <= 8 && sample.holding >= 18),
    'the first grid assembles in the opening eight seconds, without waiting for kills to release its last members');
  assert.ok(result.denseSeconds >= 10, `dense combat seconds ${result.denseSeconds}`);
  assert.ok(result.kills >= 60, `opening kills ${result.kills}`);
  assert.ok(result.maxEnemyBullets >= 4 && result.maxEnemyBullets <= 18, `readable pressure ${result.maxEnemyBullets}`);
});

test('the complete first mission has identical simulation on mobile and desktop', () => {
  const mobile = measureOpeningMission(runtime, first, { mobile: true });
  const desktop = measureOpeningMission(runtime, first, { mobile: false });
  const reducedEffects = measureOpeningMission(runtime, first, { mobile: true, performance: true });
  assert.deepEqual(mobile, desktop);
  assert.deepEqual(mobile, reducedEffects);
});

test('opening sector and optional route all complete with no paid power in the target window', () => {
  const ids = new Set(campaign.campaignGraph.nodes.filter(node => node.sectorId === campaign.sectors[0].id)
    .map(node => node.missionDefinitionId));
  for (const level of campaign.levels.filter(level => ids.has(level.id))) {
    // God mode isolates encounter pacing from bot mastery; the separate M1 test takes damage.
    const result = measureOpeningMission(runtime, level, { god: true, seconds: 120 });
    assert.ok(result.complete, `${level.id} did not finish at ${result.elapsedSeconds}s`);
    assert.ok(result.elapsedSeconds >= 60 && result.elapsedSeconds <= 90,
      `${level.id} took ${result.elapsedSeconds}s`);
    assert.ok(result.maxEnemies >= 24, `${level.id} only presented ${result.maxEnemies} enemies`);
  }
});
