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

test('after the close the prize state is the paused weekly game at 500 RSC', () => {
  assert.equal(boundary.getPublicPrizeState(justBefore).phase, 'big-event');
  const gap = boundary.getPublicPrizeState(justAfter);
  assert.equal(gap.phase, 'big-event-closed');
  assert.equal(gap.snapshotFrozen, true);
  // The winner flow and Dec 1 cutoff keep working through the gap.
  assert.equal(gap.proposalOpenUntil.toISOString(), boundary.SCICON_BIG_EVENT.proposalOpenUntil);
  assert.equal(boundary.SCICON_WEEKLY_RETURN_COPY, 'Weekly prizes return Dec 6 at 500 RSC.');
  assert.doesNotMatch(`${boundary.SCICON_WEEKLY_RETURN_COPY} ${boundary.SCICON_WEEKLY_RETURN_LABEL}`, /25K|25,000|event/i);
  const resumed = boundary.getPublicPrizeState('2026-12-06T20:00:00.000Z');
  assert.equal(resumed.phase, 'weekly');
  assert.equal(resumed.allocationRsc, 500);
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
