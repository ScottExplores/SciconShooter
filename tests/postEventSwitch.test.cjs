const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const boundary = require('../shared/weeklyCompetitionBoundary.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const CLOSE = boundary.SCICON_BIG_EVENT.closesAt;
const justBefore = new Date(Date.parse(CLOSE) - 1);
const justAfter = new Date(Date.parse(CLOSE));

test('the share card, its description, and the boot loader flip at closesAt', async () => {
  const card = await import(pathToFileURL(path.join(root, 'shared/socialShareCard.mjs')).href);
  const before = card.shareCardForTime(justBefore);
  const after = card.shareCardForTime(justAfter);
  assert.equal(before.live, true);
  assert.match(before.description, /25,000 RSC/);
  assert.equal(after.live, false);
  assert.equal(after.url, 'https://sciconshooter.xyz/social/scicon-share.png?v=gen2');
  assert.doesNotMatch(`${after.alt} ${after.description}`, /25K|25,000/);

  const html = read('index.html');
  const served = card.applyShareCardMeta(html, after);
  for (const key of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
    const match = served.match(new RegExp(`<meta ${key} content="([^"]*)"`));
    assert.ok(match, key);
    assert.doesNotMatch(match[1], /25K|25,000/);
  }
  assert.doesNotMatch(served.match(/property="og:image" content="([^"]*)"/)[1], /25k/);
  // The inline boot script picks the event loader only before the same instant.
  assert.equal((html.match(new RegExp(CLOSE.replace(/\./g, '\\.'), 'g')) || []).length, 2);
});

test('after the close the live weekly board is the 500 RSC first round to Dec 6 noon PT', () => {
  assert.equal(boundary.getPublicPrizeState(justBefore).phase, 'big-event');
  const after = boundary.getPublicPrizeState(justAfter);
  assert.equal(after.phase, 'weekly');
  assert.equal(after.allocationRsc, 500);
  assert.equal(after.snapshotFrozen, false);
  assert.equal(after.scoreWindow.start.toISOString(), CLOSE);
  assert.equal(after.scoreWindow.end.toISOString(), '2026-12-06T20:00:00.000Z');
  const meta = boundary.getWeeklyPresentationMeta('2026-11-30T01:00:00.000Z', 'en-US');
  assert.equal(meta.weekKey, '2026-11-29');
  assert.equal(meta.isFinalizing, false);
  assert.equal(meta.endsAt.toISOString(), '2026-12-06T20:00:00.000Z');
  assert.equal(meta.endLabel, 'Dec 6');
  // No weekly predecessor exists, so the board never waits on a Past Pick.
  const publication = boundary.resolveWeeklyDashboardPublication([], '2026-11-30T01:00:00.000Z');
  assert.equal(publication.waitingForArchive, false);
  assert.equal(publication.visibleWeekKey, '2026-11-29');
  assert.doesNotMatch(boundary.SCICON_EVENT_PAUSE_COPY, /Dec 6|paused|return/i);
});

test('ranked runs get five fresh weekly attempts at the close, not the event ten', () => {
  const before = boundary.resolveRunAttemptPolicy(justBefore);
  assert.equal(before.scopeId, boundary.SCICON_EVENT_ATTEMPT_SCOPE_ID);
  assert.equal(before.freeAttempts, 10);
  const after = boundary.resolveRunAttemptPolicy(justAfter);
  assert.equal(after.scopeId, '2026-11-29');
  assert.equal(after.freeAttempts, 5);
  assert.deepEqual([...after.countedScopeIds], ['2026-11-29']);
  assert.equal(after.resetAt.toISOString(), '2026-12-06T20:00:00.000Z');
  const rolled = boundary.resolveRunAttemptPolicy('2026-12-06T20:00:00.000Z');
  assert.equal(rolled.scopeId, '2026-12-06');
  assert.equal(rolled.freeAttempts, 5);
});

test('the first weekly round never includes event scores and is not paused', () => {
  const firstRound = boundary.getWeekRange('2026-11-29');
  assert.equal(boundary.weekOverlapsBigEventPause(firstRound.start, firstRound.end), false);
  const lastEventWeek = boundary.getWeekRange('2026-11-22');
  assert.equal(boundary.weekOverlapsBigEventPause(lastEventWeek.start, lastEventWeek.end), true);
  // The event attempt bucket is unchanged for the event's final hours.
  assert.equal(boundary.weekKeyOverlapsPlayableEvent('2026-11-29'), true);
  assert.equal(boundary.getPreviousWeekKey('2026-12-06T20:10:00.000Z'), '2026-11-29');
  assert.equal(boundary.getPreviousWeekKey(firstRound.start), '2026-11-22');
});

test('static install metadata no longer names the event', () => {
  assert.doesNotMatch(read('public/site.webmanifest'), /25K|25,000|Big Event/);
  assert.doesNotMatch(read('metadata.json'), /25K|25,000|Big Event/);
});

test('every 25K UI label is gated to the live event phase', () => {
  for (const file of ['components/StartScreen.tsx', 'components/MissionRecordPreview.tsx', 'components/WeeklyProposalSelection.tsx']) {
    const source = read(file);
    for (const line of source.split('\n')) {
      if (!/'25K High Score|25,000 RSC prize/.test(line)) continue;
      assert.match(line, /phase === 'big-event'|^\s*: \(weeklyProposalSelection \? '25K|^\s*\? '(?:Campaign records|Your winning score)/, `${file}: ${line.trim()}`);
    }
  }
});
