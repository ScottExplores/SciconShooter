const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('production and the Director compose the same canonical game stage', () => {
  const app = read('App.tsx');
  const editorCanvas = read('components/GameEditorCanvas.tsx');
  const stage = read('components/GameStage.tsx');

  assert.match(app, /import\('\.\/components\/GameStage'\)/);
  assert.match(app, /<GameStage/);
  assert.match(editorCanvas, /import GameStage from '\.\/GameStage'/);
  assert.match(editorCanvas, /<GameStage/);
  assert.doesNotMatch(editorCanvas, /new GameEngine/);
  assert.match(stage, /import GameCanvas/);
  assert.match(stage, /import UIOverlay/);
});

test('the shared canvas accepts draft campaign data without changing production defaults', () => {
  const canvas = read('components/GameCanvas.tsx');
  const gameLogic = read('services/gameLogic.ts');
  const directorEntry = read('director/src/main.tsx');

  assert.match(canvas, /campaign\?: GameCampaign/);
  assert.match(canvas, /previewMode\?: boolean/);
  assert.match(canvas, /audioEnabled = !previewMode/);
  assert.match(canvas, /new GameEngine\(cloneStatsForReact\(stats\),/);
  assert.match(gameLogic, /const isInvincible = this\.previewMode \|\|/);
  assert.match(directorEntry, /\.\.\/\.\.\/styles\/tailwind\.generated\.css/);
});
