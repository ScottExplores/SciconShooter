const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the local editor manipulates the canonical game canvas instead of a mock scene', () => {
  const app = read('director/src/editor/LevelEditorApp.tsx');
  const canvas = read('components/GameEditorCanvas.tsx');
  const overlay = read('director/src/editor/GameplayPlacementOverlay.tsx');

  assert.match(app, /<GameEditorCanvas/);
  assert.match(app, /onEditorSnapshot=\{setEditorSnapshot\}/);
  assert.match(app, /<GameplayPlacementOverlay/);
  assert.match(canvas, /<GameStage/);
  assert.match(overlay, /sourceEventId/);
  assert.match(overlay, /onCommitAnchor/);
});

test('Sprite Generator creates catalog assets through the loopback-only Director client', () => {
  const workshop = read('director/src/editor/SpriteWorkshop.tsx');
  const inspector = read('director/src/editor/EditorInspector.tsx');

  assert.match(workshop, /ASSET_CATALOG/);
  assert.match(workshop, /application\/x-scicon-asset-key/);
  assert.match(workshop, /fetchGeneratedAssets/);
  assert.match(workshop, /generateAsset/);
  assert.match(workshop, /Generate new artwork/);
  assert.doesNotMatch(workshop, /\bfetch\s*\(/);
  assert.doesNotMatch(workshop, /OPENAI_API_KEY\s*=/);
  assert.doesNotMatch(workshop, /api\.openai\.com/);
  assert.doesNotMatch(workshop, /type=["']file["']/);
  assert.match(inspector, /Open Sprite Generator/);
  assert.match(inspector, /spriteStyle/);
});

test('Director, in-game mission record, and NFT image share the same card config and SVG renderer', () => {
  const editor = read('director/src/editor/LevelEditorApp.tsx');
  const missionRecord = read('components/MissionRecordPreview.tsx');
  const cardSurface = read('components/MissionRecordCard.tsx');
  const api = read('api/record-card.js');
  const levelConfig = read('services/levelConfig.ts');

  assert.match(editor, /campaign\.value\.recordCard/);
  assert.match(missionRecord, /DEFAULT_GAME_CAMPAIGN\.recordCard/);
  assert.match(missionRecord, /presentation=\{recordCardConfig\}/);
  assert.match(cardSurface, /renderRecordCardSvg/);
  assert.match(api, /renderRecordCardSvg/);
  assert.match(api, /presentation: cardConfig/);
  assert.match(levelConfig, /normalizeGameCampaignRecordCard\(parseGameCampaign\(campaignJson\)\)/);
});
