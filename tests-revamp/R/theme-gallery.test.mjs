import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { options, themeScenarios, gameplayFailures } from '../../tools-revamp/qa/theme-gallery.mjs';

const campaign = JSON.parse(await readFile(new URL('../../game-config/campaign.json', import.meta.url), 'utf8'));

test('gallery resolves four distinct real sectors, their own major bosses, and labeled result fixtures', () => {
  const scenarios = themeScenarios(campaign, options([]));
  assert.equal(scenarios.length, 13);
  for (const kind of ['mission', 'boss', 'result']) assert.equal(scenarios.filter(scene => scene.kind === kind).length, 4);
  assert.equal(new Set(scenarios.filter(scene => scene.kind === 'mission').map(scene => scene.sectorId)).size, 4);
  for (const scene of scenarios.filter(item => item.kind === 'boss')) {
    const sector = campaign.sectors.find(item => item.id === scene.sectorId);
    const level = campaign.levels.find(item => item.id === scene.mission);
    assert.ok(sector.missionIds.includes(scene.mission));
    assert.equal(scene.bossId, sector.majorBossId);
    assert.ok(level.waves.some(wave => wave.events.some(event => event.id === scene.bossEvent && event.kind === 'boss')));
  }
  assert.equal(scenarios.at(-1).mission, null);
});

test('explicit sector IDs and order aliases deduplicate; typos never fall back to another sector', () => {
  const config = options(['--sectors', '2,sector-redline,8', '--kinds', 'boss,result']);
  assert.equal(themeScenarios(campaign, config).length, 4);
  assert.throws(() => themeScenarios(campaign, options(['--sectors', 'unknown'])), /Unknown authored sector/);
  assert.throws(() => themeScenarios({ ...campaign, levels: [] }, options(['--sectors', '1'])), /No authored mission/);
  const noBosses = { ...campaign, levels: campaign.levels.map(level => ({ ...level, waves: level.waves.map(wave => ({ ...wave, events: wave.events.filter(event => event.kind !== 'boss') })) })) };
  assert.throws(() => themeScenarios(noBosses, options(['--sectors', '1', '--kinds', 'boss'])), /No authored major boss/);
});

test('before/after evidence has separate defaults and invalid diagnostics fail early', () => {
  assert.match(options([]).output, /R-themes\/after$/);
  assert.match(options(['--before']).output, /R-themes\/before$/);
  assert.equal(options(['--before', '--output', '/tmp/r-gallery']).output, '/tmp/r-gallery');
  for (const args of [['--seconds', '0'], ['--seconds', 'NaN'], ['--seconds', '100'], ['--seed', 'NaN'], ['--quality', 'ultra'], ['--kinds', 'fake'], ['--sectors', ','], ['--dist'], ['--wat']]) assert.throws(() => options(args));
});

test('blank, frozen, wrong-size, missing-boss and runtime-error captures cannot pass', () => {
  const good = { kind: 'boss', canvas: { variance: 10, nonBlackFraction: .5 }, finalState: { state: { frame: 120, gameActive: true, worldWidth: 390, worldHeight: 844 } }, samples: [{ state: { bossHp: 20 } }] };
  const started = { state: { frame: 10 } };
  assert.deepEqual(gameplayFailures(good, started), []);
  assert.match(gameplayFailures({ ...good, canvas: { variance: 0 } }, started).join(), /Blank canvas/);
  assert.match(gameplayFailures(good, { state: { frame: 120 } }).join(), /Simulation did not advance/);
  assert.match(gameplayFailures({ ...good, finalState: { state: { ...good.finalState.state, worldWidth: 1280 } } }, started).join(), /Unexpected world dimensions/);
  assert.match(gameplayFailures({ ...good, samples: [] }, started).join(), /No live boss/);
  assert.match(gameplayFailures({ ...good, samples: [{ state: { bossHp: 20, errors: ['bad'] } }] }, started).join(), /Game runtime errors/);
});
