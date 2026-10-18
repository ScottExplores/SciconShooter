import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['services/revamp/weekly/presentation.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const ui = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = Date.parse('2026-10-17T12:00:00Z');
const row = (score, runId, date = '2026-10-16T12:00:00Z') => ({ name: 'PILOT', score, runId, date });

test('standings filter expired and malformed data; ties favor the earlier score', () => {
  const board = ui.weeklyStandings([row(NaN, 'bad'), row(90, 'old', '2026-09-01'), row(100, 'later'), row(100, 'earlier', '2026-10-15T12:00:00Z')], now);
  assert.deepEqual(board.map((entry) => entry.runId), ['earlier', 'later']);
  assert.equal(ui.findPilotStanding(board, null, ['later']).rank, 2);
  assert.equal(ui.findPilotStanding(board, null, ['same-name']), null);
});

test('results state exact rank only for a saved matching run; no invented ranks outside top 100', () => {
  const board = [row(10000, 'first'), ...Array.from({ length: 5 }, (_, i) => row(9999 - i, `other-${i}`)), row(8760, 'you')];
  assert.equal(ui.weeklyResultNudge(board, 8760, 'you', now), "You're #7 — 1,240 pts behind #1.");
  assert.equal(ui.weeklyResultNudge(board, 8760, 'unsaved', now), '1,240 pts behind #1. Submit to see your rank.');
  assert.match(ui.weeklyResultNudge(board, 10000, null, now), /earlier verified score/);
  assert.match(ui.weeklyResultNudge(board, 10000, 'first', now), /You're #1/);
});

test('countdown uses Sunday noon Pacific across DST, exact cutoff, and year rollover', () => {
  for (const [time, reset] of [
    ['2026-03-07T20:00:00Z', '2026-03-08T19:00:00.000Z'],
    ['2026-10-31T19:00:00Z', '2026-11-01T20:00:00.000Z'],
    ['2026-12-31T20:00:00Z', '2027-01-03T20:00:00.000Z']
  ]) assert.equal(ui.weeklyCountdown(Date.parse(time)).endsAt.toISOString(), reset);
  assert.equal(ui.weeklyCountdown(Date.parse('2026-10-18T18:59:59Z')).label, '0h 00m 01s');
  assert.equal(ui.weeklyCountdown(Date.parse('2026-10-18T19:00:00Z')).label, '7d 0h 00m 00s');
});
