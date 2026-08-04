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
  assert.doesNotMatch(canvas, /musicEnabled/);
  assert.match(canvas, /const initialStats = cloneStatsForReact\(setup\.stats\)/);
  assert.match(canvas, /new GameEngine\(initialStats,/);
  assert.match(gameLogic, /const isInvincible = \(this\.previewMode && this\.previewInvincible\)/);
  assert.match(directorEntry, /\.\.\/\.\.\/styles\/tailwind\.generated\.css/);
});

test('the shared editor can hide field upgrades and react to sandbox ship tuning', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'GameEditorCanvas.tsx'), 'utf8');
  assert.match(source, /fieldUpgradesEnabled\?: boolean/);
  assert.match(source, /fieldUpgradesEnabled = true/);
  assert.match(source, /fieldUpgradesEnabled,/);
  assert.match(source, /audioEnabled = false/);
  assert.doesNotMatch(source, /musicEnabled/);
  assert.match(source, /onPreviewSnapshot,\s*audioEnabled,/);
  assert.match(source, /previewSettings\.upgrades\?\.fireRate/);
  assert.match(source, /previewSettings\.upgrades\?\.speed/);
  assert.match(source, /setStats\(\(previous\)/);
});

test('the shared editor preview exposes the selected ship ability through the canonical stage', () => {
  const editorCanvas = read('components/GameEditorCanvas.tsx');
  const canvas = read('components/GameCanvas.tsx');

  assert.match(editorCanvas, /const \[shipAbilityCommand, setShipAbilityCommand\] = useState/);
  assert.match(editorCanvas, /shipAbilityCommand,/);
  assert.match(editorCanvas, /selectedShipId: playerShipId/);
  assert.match(editorCanvas, /onUseShipAbility: \(\) => setShipAbilityCommand\(\{ nonce: Date\.now\(\) \}\)/);
  assert.match(editorCanvas, /shipAbilityLocked: !playing/);
  assert.match(canvas, /engineRef\.current\.triggerShipAbility\(\)/);
  assert.match(read('services/gameLogic.ts'), /restartPreview\(\)[\s\S]*this\.stats\.shipAbilityCooldown = 0/);
});

test('preview reconstruction keeps configured starting lives instead of damaged HUD lives', () => {
  const editorCanvas = read('components/GameEditorCanvas.tsx');
  const canvas = read('components/GameCanvas.tsx');

  assert.match(editorCanvas, /previewStartingLives: previewSettings\.startingLives \?\? GAME_CONFIG\.PLAYER_LIVES/);
  assert.match(canvas, /previewStartingLives\?: number/);
  assert.match(canvas, /if \(previewMode && setup\.previewStartingLives !== undefined\)/);
  assert.match(canvas, /initialStats\.lives = setup\.previewStartingLives/);
  assert.match(canvas, /new GameEngine\(initialStats,/);
  assert.match(canvas, /previewStartingLives,/);
});

test('preview device sizes keep one canonical renderer and map scaled pointer input to logical coordinates', () => {
  const editorCanvas = read('components/GameEditorCanvas.tsx');
  const canvas = read('components/GameCanvas.tsx');
  const combatLab = read('director/src/combat-lab/CombatLabApp.tsx');

  assert.match(editorCanvas, /previewViewport\?: Readonly<\{ width: number; height: number \}>/);
  assert.match(editorCanvas, /previewViewport,/);
  assert.match(canvas, /previewViewportWidth \?\? Math\.max/);
  assert.match(canvas, /previewViewportHeight \?\? Math\.max/);
  assert.match(canvas, /\(clientX - rect\.left\) \* \(engine\.width \/ displayWidth\)/);
  assert.match(canvas, /\(clientY - rect\.top\) \* \(engine\.height \/ displayHeight\)/);
  assert.match(combatLab, /const PREVIEW_DEVICES/);
  assert.match(combatLab, /Pixel 8/);
  assert.match(combatLab, /iPhone 15/);
  assert.match(combatLab, /iPad mini/);
  assert.match(combatLab, /Desktop/);
  assert.match(combatLab, /previewViewport=\{previewDimensions\}/);
  assert.match(editorCanvas, /scicon-game-stage--compact-preview/);
  assert.match(read('components/UIOverlay.tsx'), /scicon-wave-progress/);
  assert.match(read('components/game-stage.css'), /scicon-game-stage--compact-preview \.scicon-wave-progress/);
});
