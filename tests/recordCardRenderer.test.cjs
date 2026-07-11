const test = require('node:test');
const assert = require('node:assert/strict');

const renderer = import('../shared/record-card/renderRecordCardSvg.mjs');

const record = {
  pilotName: 'ACE',
  score: 12_345,
  wave: 2,
  encounter: 'Replication Rift',
  targetsDefeated: 48,
  coinsCollected: 17,
  durationLabel: '2:05',
  completedLabel: 'JUL 10, 2026',
  gameVersion: '2.1.0',
  integrity: 'server-verified'
};

test('shared record-card renderer is deterministic and escapes record, copy, and image values', async () => {
  const { renderRecordCardSvg } = await renderer;
  const options = {
    record: { ...record, pilotName: '<ACE & "CO">' },
    shipImage: '/ship.png?one=1&two="2"',
    encounterImage: '/boss.png?one=1&two="2"',
    presentation: { copy: { title: '<MISSION & RECORD>' } }
  };

  const first = renderRecordCardSvg(options);
  const second = renderRecordCardSvg(options);

  assert.equal(first, second);
  assert.match(first, /&lt;MISSION &amp; RECORD&gt;/);
  assert.match(first, /&lt;ACE &amp; &quot;CO&quot;&gt;/);
  assert.match(first, /ship\.png\?one=1&amp;two=&quot;2&quot;/);
  assert.match(first, /boss\.png\?one=1&amp;two=&quot;2&quot;/);
  assert.doesNotMatch(first, /<ACE/);
});

test('shared record-card renderer applies safe presentation and art layout overrides', async () => {
  const { renderRecordCardSvg } = await renderer;
  const svg = renderRecordCardSvg({
    record,
    shipImage: '/ship.png',
    encounterImage: '/boss.png',
    presentation: {
      colors: { primary: '#123456', background: 'url(javascript:bad)' },
      showGrid: false,
      art: {
        ship: { x: 320, y: 410, width: 280, height: 220, rotation: 12, opacity: 0.8 },
        encounter: { visible: false }
      }
    }
  });

  assert.match(svg, /stroke="#123456"/);
  assert.match(svg, /background:#020617/);
  assert.match(svg, /href="\/ship\.png" x="320" y="410" width="280" height="220" opacity="0\.8" transform="rotate\(12 460 520\)"/);
  assert.doesNotMatch(svg, /href="\/boss\.png"/);
  assert.doesNotMatch(svg, /<rect width="1200" height="1200" fill="url\(#grid\)"\/>/);
});

test('AUTO encounter art resolves from the same ordered campaign wave for every surface', async () => {
  const { resolveRecordCardEncounterAssetKey } = await renderer;
  const campaign = {
    levels: [{ order: 1, waves: [
      { id: 'one', order: 1, events: [{ kind: 'boss', spriteKey: 'MINI_BOSS' }] },
      { id: 'two', order: 2, events: [{ kind: 'spawn', enemies: [{ spriteKey: 'ENEMY_JOURNAL' }] }] }
    ] }]
  };
  assert.equal(resolveRecordCardEncounterAssetKey(campaign, 1), 'MINI_BOSS');
  assert.equal(resolveRecordCardEncounterAssetKey(campaign, 2), 'ENEMY_JOURNAL');
  assert.equal(resolveRecordCardEncounterAssetKey(campaign, 3), 'MINI_BOSS');
  assert.equal(resolveRecordCardEncounterAssetKey(null, campaign.levels[0].waves[1]), 'ENEMY_JOURNAL');
});
