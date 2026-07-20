const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('game over uses the animated defeat banner and a tall gray-red mission frame', () => {
  const component = fs.readFileSync(path.join(root, 'components', 'GameOverPresentation.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'components', 'game-over-presentation.css'), 'utf8');

  assert.match(component, /animations\/defeated-banner\/parts/);
  assert.match(component, /scicon-defeated-plaque\.png/);
  assert.match(component, /scicon-defeated-wing-left\.png/);
  assert.match(component, /scicon-defeated-warning-rotor\.png/);
  assert.match(component, /scicon-game-over-panel-v1\/scicon-game-over-panel-tall\.png/);
  assert.match(component, /footer\?: React\.ReactNode/);
  assert.match(component, /sci-gameover-footer/);
  assert.match(component, />Defeated</);
  assert.match(styles, /sciDefeatedBannerDrop/);
  assert.match(styles, /sciGameOverWindowDeploy/);
  assert.match(styles, /aspect-ratio: 543 \/ 724/);
  assert.match(styles, /calc\(\(100dvh - 190px\) \* 0\.75\)/);
  assert.doesNotMatch(component, /\.gif/);

  const framePath = path.join(root, 'public', 'game-art', 'generated', 'ui', 'scicon-game-over-panel-v1', 'scicon-game-over-panel-tall.png');
  const frame = fs.readFileSync(framePath);
  assert.equal(frame.readUInt32BE(16), 768);
  assert.equal(frame.readUInt32BE(20), 1024);
  assert.equal(frame[25], 6);
});

test('the canonical game-over flow keeps all existing actions inside the new presentation', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'components', 'game-over-presentation.css'), 'utf8');

  assert.match(app, /gameState === GameState\.GAMEOVER/);
  assert.match(app, /<GameOverPresentation footer=\{gameOverContinueControls\}>/);
  assert.match(app, /handleContinueWithRsc/);
  assert.match(app, /onSubmit=\{submitScore\}/);
  assert.match(app, /onClick=\{skipScoreSubmission\}/);
  assert.match(app, /onClick=\{startGame\}/);
  assert.match(app, /setShowMissionRecordPreview\(true\)/);
  assert.match(app, /onRetryRun=\{startGame\}/);
  assert.match(app, /onHangar=\{openSquadHangar\}/);
  assert.match(app, /onMainMenu=\{\(\) => \{/);
  assert.match(app, /setShowNameInput\(true\)/);
  assert.match(app, /isSubmittingScore \? 'Saving\.\.\.' : 'Submit'/);
  assert.match(app, /sci-gameover-result-content/);
  assert.match(app, /sci-gameover-skip-score/);
  assert.match(styles, /inset: 11% 14% 10%/);
  assert.match(styles, /\.sci-gameover-result-content input,[\s\S]*max-width: 100%/);
  assert.match(styles, /@media \(max-height: 760px\)/);
  assert.doesNotMatch(app, /Prepare record/);
  assert.doesNotMatch(app, /id="pilot-score-name"[\s\S]{0,500}autoFocus/);
});

test('saved mission records open above the defeat layer and provide illustrated run actions', () => {
  const preview = fs.readFileSync(path.join(root, 'components', 'MissionRecordPreview.tsx'), 'utf8');

  assert.match(preview, /fixed inset-0 z-\[80\]/);
  assert.match(preview, /mission-results\/retry-button\.png/);
  assert.match(preview, /mission-results\/main-menu-button\.png/);
  assert.match(preview, />Retry run</);
  assert.match(preview, />\s*Hangar\s*</);
  assert.match(preview, />Main menu</);
  assert.match(preview, /mt-3 grid gap-2/);
});
