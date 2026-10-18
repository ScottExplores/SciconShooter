import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { aggregate, options } from '../../tools-revamp/perf/compare.mjs';

// Normalized scenarios match compare.mjs's report ingestion, without launching
// Chrome or writing artifacts. Failed runs are measurements, never exclusions.
const scenario = (stage, fpsMedian, overrides = {}) => ({
  stage, fpsMedian, fpsSource: 'game-render-loop', status: 'passed',
  errors: { page: [], console: [], runtime: [] }, ...overrides,
});
const leg = (build, iteration, mission, boss = mission) => ({
  id: `${build}-${iteration}`, build, iteration,
  scenarios: [scenario('mission-1', mission), scenario('boss', boss)],
});
const pairs = (reference, current) => reference.flatMap((fps, i) => [
  leg('reference', i + 1, fps), leg('current', i + 1, current[i]),
]);
const missionResult = (legs, runs = 2) => aggregate(legs, runs).find(result => result.stage === 'mission-1');
const requiredArgs = ['--reference', 'ref-dist', '--current', 'current-dist', '--run-id', 'L-comparison'];

test('failed QA runs with measured game FPS remain in the aggregate and retain their failure status', () => {
  const legs = pairs([40, 60], [5, 55]);
  Object.assign(legs[1].scenarios[0], {
    status: 'failed',
    errors: { page: ['canvas exception'], console: [], runtime: ['render stall'] },
  });
  const result = missionResult(legs);
  assert.deepEqual(result.current.runMedians, [5, 55]);
  assert.equal(result.current.runsMeasured, 2);
  assert.equal(result.current.fpsMedian, 30);
  assert.equal(result.currentReferenceRatio, 0.6);
  assert.equal(result.current.qaPassed, false);
  assert.equal(result.current.browserRuntimeErrors, 2);
  assert.equal(result.withinTenPercent, false);
  assert.equal(result.mission45Target, false);

  legs[1].scenarios[0].fpsMedian = 55;
  const fastFailure = missionResult(legs);
  assert.equal(fastFailure.withinTenPercent, true, 'the FPS ratio is separate from QA correctness');
  assert.equal(fastFailure.current.qaPassed, false, 'fast frames cannot erase a browser failure');
});

test('browser-rAF fallback and unavailable FPS never enter game-render ratios or complete the required runs', () => {
  const invalidMeasurements = [
    { fpsSource: 'browser-rAF (game telemetry unavailable)', fpsMedian: 120 },
    { fpsSource: 'browserFPS', fpsMedian: 120 },
    { fpsSource: undefined, fpsMedian: 120 },
    { fpsMedian: undefined }, { fpsMedian: null }, { fpsMedian: NaN },
    { fpsMedian: Infinity }, { fpsMedian: 0 }, { fpsMedian: -1 }, { fpsMedian: '60' },
  ];
  for (const measurement of invalidMeasurements) {
    const legs = pairs([50, 50], [50, 50]);
    Object.assign(legs[3].scenarios[0], measurement);
    const result = missionResult(legs);
    assert.deepEqual(result.current.runMedians, [50]);
    assert.equal(result.current.runsMeasured, 1);
    assert.equal(result.currentReferenceRatio, 1, 'the invalid 120 FPS value cannot improve the ratio');
    assert.equal(result.withinTenPercent, false);
    assert.equal(result.mission45Target, false);

    Object.assign(legs[1].scenarios[0], measurement);
    const unavailable = missionResult(legs);
    assert.deepEqual(unavailable.current.runMedians, []);
    assert.equal(unavailable.current.fpsMedian, null);
    assert.equal(unavailable.currentReferenceRatio, null);
    assert.equal(unavailable.changePercent, null);
    assert.equal(unavailable.withinTenPercent, false);
  }
});

test('a missing leg or stage cannot pass relative or absolute targets', () => {
  for (const missingBuild of ['reference', 'current']) {
    const complete = pairs([50, 50], [60, 60]);
    const missingLeg = complete.filter(item => item.id !== `${missingBuild}-2`);
    const missingStage = structuredClone(complete);
    missingStage.find(item => item.id === `${missingBuild}-2`).scenarios.shift();
    for (const legs of [missingLeg, missingStage]) {
      const result = missionResult(legs);
      assert.equal(result[missingBuild].runsMeasured, 1);
      assert.equal(result[missingBuild].qaPassed, false);
      assert.equal(result.withinTenPercent, false);
      assert.equal(result.mission45Target, false);
    }
    const boss = aggregate(missingStage, 2).find(result => result.stage === 'boss');
    assert.equal(boss.withinTenPercent, true, 'missing mission evidence does not rewrite the independently measured boss');
    assert.equal(boss.mission45Target, null);
  }
  for (const result of aggregate([], 2)) {
    assert.equal(result.currentReferenceRatio, null);
    assert.equal(result.withinTenPercent, false);
    assert.equal(result.reference.qaPassed, false);
    assert.equal(result.current.qaPassed, false);
  }
});

test('the 0.9 relative target is inclusive and uses the unrounded ratio for acceptance', () => {
  const boundary = missionResult(pairs([50, 50], [45, 45]));
  assert.equal(boundary.currentReferenceRatio, 0.9);
  assert.equal(boundary.changePercent, -10);
  assert.equal(boundary.withinTenPercent, true);
  assert.equal(boundary.mission45Target, true);

  const below = missionResult(pairs([50, 50], [44.999, 44.999]));
  assert.equal(below.currentReferenceRatio, 0.9, 'display rounding can look equal to the threshold');
  assert.equal(below.withinTenPercent, false, 'rounding must never promote a failing ratio');
  assert.equal(below.mission45Target, false);
});

test('even aggregates use the mean of the middle pair of run medians, without mutating run order', () => {
  // Documented compare.md convention: (20 + 90) / 2 = 55, not the upper median 90.
  const legs = pairs([100, 10, 90, 20], [120, 20, 80, 40]);
  const before = structuredClone(legs);
  const result = missionResult(legs, 4);
  assert.deepEqual(result.reference.runMedians, [100, 10, 90, 20]);
  assert.deepEqual(result.current.runMedians, [120, 20, 80, 40]);
  assert.equal(result.reference.fpsMedian, 55);
  assert.equal(result.current.fpsMedian, 60);
  assert.equal(result.currentReferenceRatio, 1.091);
  assert.equal(result.withinTenPercent, true);
  assert.deepEqual(legs, before);
});

test('CLI defaults require two alternating runs per build and resolve independent dist paths', () => {
  const config = options(requiredArgs);
  assert.equal(config.runs, 2);
  assert.equal(config.reference, path.resolve('ref-dist'));
  assert.equal(config.current, path.resolve('current-dist'));
  assert.equal(config.runId, 'L-comparison');
  assert.equal(options([...requiredArgs, '--runs', '3', '--output', 'artifacts']).runs, 3);
  assert.equal(options([...requiredArgs, '--output', 'artifacts']).output, path.resolve('artifacts'));
});

test('invalid CLI inputs cannot lower the minimum run count or escape the artifact directory', () => {
  for (const runs of ['0', '1', '-1', '2.5', 'NaN', 'Infinity', '9007199254740992']) {
    assert.throws(() => options([...requiredArgs, '--runs', runs]), /integer of at least 2/);
  }
  for (const runId of ['.', '..', '../outside', '/absolute', 'has space', 'nested/name']) {
    assert.throws(() => options([...requiredArgs, '--run-id', runId]), /simple directory name/);
  }
  assert.throws(() => options([]), /Required:/);
  assert.throws(() => options(requiredArgs.slice(2)), /Required:/);
  assert.throws(() => options([...requiredArgs, '--runs']), /Missing value/);
  assert.throws(() => options([...requiredArgs, '--output', '--runs', '2']), /Missing value/);
  assert.throws(() => options([...requiredArgs, '--god']), /Unknown option/);
  assert.throws(() => options([...requiredArgs, '--seconds', '5']), /Unknown option/);
});
