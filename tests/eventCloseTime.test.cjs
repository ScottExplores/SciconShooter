const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCICON_BIG_EVENT,
  getPublicPrizeState
} = require('../shared/weeklyCompetitionBoundary.js');

test('25K High Score closes Sunday Nov 29 at 4 PM Pacific', () => {
  assert.equal(SCICON_BIG_EVENT.closesAt, '2026-11-30T00:00:00.000Z');
  assert.equal(getPublicPrizeState('2026-11-29T23:59:59.999Z').phase, 'big-event');
  assert.equal(getPublicPrizeState('2026-11-30T00:00:00.000Z').phase, 'weekly');
});

test('event countdown counts Pacific calendar days to the close', () => {
  assert.equal(getPublicPrizeState('2026-11-27T15:50:00.000Z').daysLeft, 2); // Fri 7:50 AM PT
  assert.equal(getPublicPrizeState('2026-11-29T05:00:00.000Z').daysLeft, 1); // Sat 9 PM PT
  assert.equal(getPublicPrizeState('2026-11-29T08:30:00.000Z').daysLeft, 0); // Sun 12:30 AM PT
  assert.equal(getPublicPrizeState('2026-11-29T23:59:00.000Z').daysLeft, 0); // Sun 3:59 PM PT
});

test('the event pick window stays separate from the first weekly round', () => {
  const { getEventPickWindow } = require('../shared/weeklyCompetitionBoundary.js');
  for (const at of ['2026-11-29T12:00:00.000Z', '2026-11-30T00:00:00.000Z', '2026-12-01T07:59:59.999Z']) {
    const pick = getEventPickWindow(at);
    assert.equal(pick.pickOpen, true, at);
    assert.equal(pick.requiredOpenUntil.toISOString(), '2026-12-01T08:00:00.000Z');
    assert.equal(pick.scoreWindow.end.toISOString(), '2026-11-30T00:00:00.000Z');
  }
  assert.equal(getEventPickWindow('2026-12-01T08:00:00.000Z').pickOpen, false);
  assert.equal(getEventPickWindow('2026-12-01T08:00:00.000Z').reviewOpen, true);
  assert.equal(getEventPickWindow('2026-12-06T20:00:00.000Z').reviewOpen, false);
});
