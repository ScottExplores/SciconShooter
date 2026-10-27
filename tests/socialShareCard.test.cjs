const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { SCICON_BIG_EVENT } = require('../shared/weeklyCompetitionBoundary.js');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const pngSize = (relative) => {
  const bytes = fs.readFileSync(path.join(root, relative));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

test('social cards are 1200x630 and the metadata follows the 25K close', async () => {
  const card = await import(pathToFileURL(path.join(root, 'shared/socialShareCard.mjs')).href);
  const html = read('index.html');
  const middleware = read('middleware.js');
  const renderer = read('tools/render-social-share-card.py');

  assert.equal(card.SHARE_EVENT_START, SCICON_BIG_EVENT.startsAt);
  assert.equal(card.SHARE_EVENT_CLOSE, SCICON_BIG_EVENT.closesAt);

  const during = card.shareCardForTime('2026-10-27T15:00:00.000Z');
  const lastInstant = card.shareCardForTime(new Date(Date.parse(SCICON_BIG_EVENT.closesAt) - 1).toISOString());
  const closed = card.shareCardForTime(SCICON_BIG_EVENT.closesAt);
  const before = card.shareCardForTime('2026-10-25T12:00:00.000Z');

  assert.equal(during.live, true);
  assert.equal(lastInstant.live, true);
  assert.equal(closed.live, false);
  assert.equal(before.live, false);
  assert.equal(during.url, 'https://sciconshooter.xyz/social/scicon-share-25k.png?v=gen2-25k');
  assert.equal(closed.url, 'https://sciconshooter.xyz/social/scicon-share.png?v=gen2');
  assert.equal(during.width, 1200);
  assert.equal(during.height, 630);
  assert.match(during.alt, /25K RSC high score event/);
  assert.doesNotMatch(closed.alt, /25K RSC high score event/);
  assert.match(during.url, /\?v=/);
  assert.notEqual(during.url, closed.url);

  const sample = [
    '<meta property="og:image" content="https://example.test/old.png" />',
    '<meta property="og:image:alt" content="old alt" />',
    '<meta property="og:image:width" content="100" />',
    '<meta property="og:image:height" content="100" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:image" content="https://example.test/old.png" />',
    '<meta name="twitter:image:alt" content="old alt" />'
  ].join('\n');
  const applied = card.applyShareCardMeta(sample, closed);
  assert.match(applied, /property="og:image" content="https:\/\/sciconshooter\.xyz\/social\/scicon-share\.png\?v=gen2"/);
  assert.match(applied, /property="og:image:height" content="630"/);
  assert.match(applied, /name="twitter:image" content="https:\/\/sciconshooter\.xyz\/social\/scicon-share\.png\?v=gen2"/);
  assert.match(applied, /name="twitter:card" content="summary_large_image"/);

  assert.match(html, /property="og:image" content="https:\/\/sciconshooter\.xyz\/social\/scicon-share-25k\.png\?v=gen2-25k"/);
  assert.match(html, /name="twitter:image" content="https:\/\/sciconshooter\.xyz\/social\/scicon-share-25k\.png\?v=gen2-25k"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(middleware, /shareCardForTime\(Date\.now\(\)\)/);
  assert.match(middleware, /applyShareCardMeta/);
  assert.match(renderer, /researchhub-ship\.png/);
  assert.match(renderer, /nih-ship\.png/);
  assert.match(renderer, /btc-token-ship-03-neutral\.png/);
  assert.match(renderer, /umbra-needlewing/);
  assert.match(renderer, /25K RSC HIGH SCORE EVENT/);
  assert.doesNotMatch(renderer, /bio-ship\.png/);

  for (const relative of ['public/social/scicon-share-25k.png', 'public/social/scicon-share.png']) {
    assert.deepEqual(pngSize(relative), { width: 1200, height: 630 });
  }
  const eventBytes = fs.readFileSync(path.join(root, 'public/social/scicon-share-25k.png'));
  const baseBytes = fs.readFileSync(path.join(root, 'public/social/scicon-share.png'));
  assert.notEqual(eventBytes.equals(baseBytes), true);
});
