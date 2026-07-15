const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const appSource = read('App.tsx');
const receiptClientSource = read('services/runReceiptService.ts');
const receiptServerSource = read('api/_lib/runReceipts.js');
const playerRunsSource = read('api/_lib/playerRuns.js');
const previewSource = read('components/MissionRecordPreview.tsx');
const cardApiSource = read('api/record-card.js');
const metadataApiSource = read('api/record-metadata.js');
const mintAuthorizationSource = read('api/mint-authorization.js');

test('flight time begins when the first transmission deploys instead of when the intro starts', () => {
  assert.match(appSource, /completedPhase === 1[\s\S]*?beginRunSession\(isOwnerTestRun \|\| isOwnerWallet\)/);
  assert.match(appSource, /runStartedAtRef\.current = Date\.now\(\)/);
  assert.match(appSource, /durationMs: Math\.max\(0, Date\.now\(\) - gameplayStartedAt\)/);
  assert.doesNotMatch(appSource, /Date\.now\(\) - new Date\(session\.issuedAt\)/);
});

test('selected ship identity travels through the signed receipt and scorecard preview', () => {
  assert.match(appSource, /activeRunShipIdRef\.current = usableShipId/);
  assert.match(receiptClientSource, /playerShipId: PlayerShipId/);
  assert.match(receiptClientSource, /action: 'start'[\s\S]*?playerShipId/);
  assert.match(receiptServerSource, /playerShipId: normalizePlayerShipId\(playerShipId\)/);
  assert.match(receiptServerSource, /playerShipId: normalizePlayerShipId\(start\.playerShipId\)/);
  assert.match(receiptServerSource, /player_ship_id: receipt\.metrics\.playerShipId/);
  assert.doesNotMatch(receiptServerSource, /legacyRow|\.\.\.legacyRow/);
  assert.match(playerRunsSource, /'player_ship_id'/);
  assert.doesNotMatch(playerRunsSource, /legacyReceiptColumns/);
  assert.match(previewSource, /PLAYER_SHIPS\[playerShipId\]\.assetUrl/);
  assert.match(previewSource, /buildMissionRecordCardPath\(receipt\.runId, playerShipId\)/);
});

test('shared card and mint metadata resolve the signed ship with legacy ResearchHub fallback', () => {
  assert.match(cardApiSource, /BIO_SHIP: '\/game-art\/branding\/bio-ship\.png'/);
  assert.match(cardApiSource, /ETH_SHIP: '\/game-art\/branding\/eth-ship\.png'/);
  assert.match(cardApiSource, /BTC_SHIP: '\/game-art\/branding\/btc-ship\.svg'/);
  assert.match(cardApiSource, /getPlayerShipId\(req\.query\?\.ship \|\| receipt\.player_ship_id\)/);
  assert.match(metadataApiSource, /buildMissionRecordCardPath\(runId, record\.playerShipId\)/);
  assert.match(mintAuthorizationSource, /buildMissionRecordMetadataPath\(receipt\.runId, receipt\.metrics\.playerShipId\)/);
});
