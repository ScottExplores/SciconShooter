const test = require('node:test');
const assert = require('node:assert/strict');
const { getRecordPresentation } = require('../api/_lib/recordPresentation');

test('builds collectible fields from immutable run metrics', () => {
  const record = getRecordPresentation({
    score: 12_345,
    wave: 2,
    enemies_defeated: 47,
    coins_collected: 19,
    duration_ms: 125_000,
    player_ship_id: 'bio',
    finished_at: '2026-07-10T12:00:00.000Z',
    game_version: 'test-version',
    integrity_status: 'server-verified'
  }, { name: 'scott' });

  assert.deepEqual(record, {
    pilotName: 'SCOTT',
    score: 12_345,
    wave: 2,
    encounter: 'Replication Rift',
    targetsDefeated: 47,
    coinsCollected: 19,
    durationMs: 125_000,
    durationLabel: '2:05',
    playerShipId: 'bio',
    finishedAt: '2026-07-10T12:00:00.000Z',
    gameVersion: 'test-version',
    integrity: 'server-verified'
  });
});

test('uses receipt score data when no leaderboard row exists', () => {
  const record = getRecordPresentation({ score: 900, wave: 1, duration_ms: 9_000 });
  assert.equal(record.pilotName, 'PILOT');
  assert.equal(record.score, 900);
  assert.equal(record.encounter, 'Gatekeeper Sector');
  assert.equal(record.playerShipId, 'researchhub');
});

test('preserves the BTC ship identity for collectible rendering', () => {
  const record = getRecordPresentation({ score: 10_000, wave: 3, player_ship_id: 'btc' });
  assert.equal(record.playerShipId, 'btc');
});
