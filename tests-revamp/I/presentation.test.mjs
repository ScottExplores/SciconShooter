import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const bundle = await build({
  stdin: { contents: `export * from './services/revamp/presentation/firstFlightHint'; export * from './services/revamp/presentation/backgroundGrade';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
});
const presentation = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const campaign = JSON.parse(await readFile(new URL('../../game-config/campaign.json', import.meta.url), 'utf8'));

test('first-flight hint only permits normal Mission 1 waves, never authored mini-bosses or bosses', () => {
  const firstMissionId = campaign.sectors[0].missionIds[0];
  let ordinaryOpeningWaves = 0;
  let blockedBossWaves = 0;
  for (const level of campaign.levels) for (const wave of level.waves) {
    const bossWave = wave.events.some(event => event.kind === 'boss');
    const expected = level.id === firstMissionId && !bossWave;
    assert.equal(presentation.canShowFirstFlightHint(campaign, level.id, wave.id, false), expected, `${level.id}/${wave.id}`);
    assert.equal(presentation.canShowFirstFlightHint(campaign, level.id, wave.id, true), false, 'a live boss closes every hint');
    if (expected) ordinaryOpeningWaves++;
    if (bossWave) blockedBossWaves++;
  }
  assert.ok(ordinaryOpeningWaves > 0);
  assert.ok(blockedBossWaves > 0);
  assert.equal(presentation.canShowFirstFlightHint(campaign, undefined, undefined, false), false);
});

test('the short hint accepts only steering keys', () => {
  assert.equal(presentation.FIRST_FLIGHT_HINT_MS, 3_000);
  for (const key of ['w', 'A', 's', 'D', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) assert.equal(presentation.isSteeringKey(key), true, key);
  for (const key of ['Escape', 'Enter', ' ', 'b', 'Shift', 'Arrow', 'wasd']) assert.equal(presentation.isSteeringKey(key), false, key);
});

test('cached background grade removes 40% chroma without changing alpha, edges or transparent texels', () => {
  const pixels = new Uint8ClampedArray([255, 40, 120, 200, 0, 210, 95, 255, 60, 60, 60, 128, 16, 120, 240, 0]);
  const before = pixels.slice();
  presentation.desaturateBackgroundPixels(pixels);
  assert.equal(pixels.length, before.length);
  for (let start = 0; start < 12; start += 4) {
    assert.equal(pixels[start + 3], before[start + 3]);
    const originalChroma = Math.max(...before.slice(start, start + 3)) - Math.min(...before.slice(start, start + 3));
    const mutedChroma = Math.max(...pixels.slice(start, start + 3)) - Math.min(...pixels.slice(start, start + 3));
    assert.ok(Math.abs(mutedChroma - originalChroma * 0.6) <= 1);
  }
  assert.deepEqual([...pixels.slice(8)], [...before.slice(8)], 'neutral shades and transparent edge texels remain intact');
});
