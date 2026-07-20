const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = import('../shared/record-card/renderRecordCardSvg.mjs');
const root = path.resolve(__dirname, '..');

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
    frameImage: '/frame.png?one=1&two="2"',
    presentation: { copy: { title: '<MISSION & RECORD>' } }
  };

  const first = renderRecordCardSvg(options);
  const second = renderRecordCardSvg(options);

  assert.equal(first, second);
  assert.match(first, /&lt;MISSION &amp; RECORD&gt;/);
  assert.match(first, /&lt;ACE &amp; &quot;CO&quot;&gt;/);
  assert.match(first, /ship\.png\?one=1&amp;two=&quot;2&quot;/);
  assert.match(first, /boss\.png\?one=1&amp;two=&quot;2&quot;/);
  assert.match(first, /frame\.png\?one=1&amp;two=&quot;2&quot;/);
  assert.doesNotMatch(first, /<ACE/);
});

test('shared record-card renderer uses the pixel frame as the outermost layer', async () => {
  const { renderRecordCardSvg } = await renderer;
  const svg = renderRecordCardSvg({ record, frameImage: '/frame.png' });

  assert.match(svg, /href="\/frame\.png" x="0" y="0" width="1200" height="1200"/);
  assert.ok(svg.lastIndexOf('href="/frame.png"') > svg.lastIndexOf('SCICON V'));
});

test('record-card URLs and completion timestamps stay canonical across preview and mint metadata', async () => {
  const {
    RECORD_CARD_RENDER_VERSION,
    buildMissionRecordCardPath,
    buildMissionRecordMetadataPath,
    formatRecordCardCompletedLabel
  } = await renderer;

  const runId = '11111111-2222-4333-8444-555555555555';
  assert.equal(
    buildMissionRecordCardPath(runId),
    `/api/record-card?runId=${runId}&v=${encodeURIComponent(RECORD_CARD_RENDER_VERSION)}`
  );
  assert.equal(
    buildMissionRecordMetadataPath(runId),
    `/api/record-metadata?type=mission&runId=${runId}&v=${encodeURIComponent(RECORD_CARD_RENDER_VERSION)}`
  );
  assert.equal(
    buildMissionRecordCardPath(runId, 'bio'),
    `/api/record-card?runId=${runId}&ship=bio&v=${encodeURIComponent(RECORD_CARD_RENDER_VERSION)}`
  );
  assert.equal(
    buildMissionRecordMetadataPath(runId, 'eth'),
    `/api/record-metadata?type=mission&runId=${runId}&ship=eth&v=${encodeURIComponent(RECORD_CARD_RENDER_VERSION)}`
  );
  assert.equal(formatRecordCardCompletedLabel('2026-07-10T22:09:00.000Z'), 'JUL 10, 2026 - 10:09 PM UTC');
  assert.equal(formatRecordCardCompletedLabel('not-a-date'), 'VERIFIED RUN');
});

test('record-card layout keeps long callsigns, encounter names, and scores inside the pixel frame', async () => {
  const { renderRecordCardSvg } = await renderer;
  const svg = renderRecordCardSvg({
    record: {
      ...record,
      pilotName: 'LONGPILOTNAME15',
      encounter: 'Deep Review Space',
      score: 9_999_999,
      completedLabel: 'JUL 10, 2026 - 10:09 PM UTC'
    }
  });

  assert.match(svg, /font-size="42" font-weight="900">LONGPILOTNAME15/);
  assert.match(svg, /font-size="34" font-weight="900">Deep Review Space/);
  assert.match(svg, /x="1010" y="836" text-anchor="end"/);
  assert.match(svg, /JUL 10, 2026 - 10:09 PM UTC/);
});

test('record-card content stays on one inset plate inside the pixel border', async () => {
  const { renderRecordCardSvg } = await renderer;
  const svg = renderRecordCardSvg({ record, frameImage: '/frame.png' });

  assert.match(svg, /M150 190H1050L1070 210V1000L1050 1020H150L130 1000V210Z/);
  assert.match(svg, /<rect x="170" y="338" width="860" height="368"/);
  assert.match(svg, /<rect x="190" y="856" width="190" height="112"/);
  assert.match(svg, /font-size="20" font-weight="700" letter-spacing="3">WAVE/);
  assert.ok(svg.lastIndexOf('href="/frame.png"') > svg.lastIndexOf('SCICON V'));
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

test('modern encounter art resolves to the same body and cannon rig used in gameplay', async () => {
  const { renderRecordCardSvg, resolveRecordCardEncounterArt } = await renderer;
  const expectedByAssetKey = {
    PIXI_BOSS_OPEN_ORBIT_FRAMES: [
      '/game-art/pixi/bosses/open-orbit/frame-1.png',
      '/game-art/generated/boss-weapons/open-orbit-railgun-arm-left.png',
      '/game-art/generated/boss-weapons/open-orbit-railgun-arm-right.png'
    ],
    PIXI_BOSS_CITATION_FRAMES: [
      '/game-art/pixi/bosses/citation-storm/frame-1.png',
      '/game-art/generated/boss-weapons/citation-storm-plasma-claw-left.png',
      '/game-art/generated/boss-weapons/citation-storm-plasma-claw-right.png'
    ],
    PIXI_BOSS_PAYWALL_FRAMES: [
      '/game-art/pixi/bosses/paywall-decimator/body/frame-1.png',
      '/game-art/pixi/bosses/paywall-decimator/cannon-left.png',
      '/game-art/pixi/bosses/paywall-decimator/cannon-right.png',
      '/game-art/pixi/bosses/paywall-decimator/helmet.png'
    ],
    PIXI_BOSS_CROWNCLAW_FRAMES: [
      '/game-art/generated/bosses/astral-crownclaw/astral-crownclaw-intact.png'
    ],
    PIXI_BOSS_OPEN_GALAXY_FRAMES: [
      '/game-art/pixi/bosses/open-galaxy/frame-1.png',
      '/game-art/generated/boss-weapons/open-galaxy-launch-cannon-left.png',
      '/game-art/generated/boss-weapons/open-galaxy-launch-cannon-right.png'
    ]
  };

  for (const [assetKey, expectedPaths] of Object.entries(expectedByAssetKey)) {
    const layers = resolveRecordCardEncounterArt(assetKey, '/legacy.png');
    assert.deepEqual(layers.map((layer) => layer.path), expectedPaths);
    layers.forEach((layer) => {
      assert.equal(fs.existsSync(path.join(root, 'public', layer.path.replace(/^\//, ''))), true, layer.path);
    });

    const svg = renderRecordCardSvg({
      record,
      encounterImages: layers.map((layer) => ({ ...layer, image: layer.path }))
    });
    layers.forEach((layer) => assert.ok(svg.includes(layer.path)));
    assert.doesNotMatch(svg, /legacy\.png|SERVER VERIFIED/);
  }
});
