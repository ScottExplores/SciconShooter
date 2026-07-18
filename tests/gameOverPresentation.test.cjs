const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('game over uses layered production defeat and floating-window sprites', () => {
  const component = fs.readFileSync(path.join(root, 'components', 'GameOverPresentation.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'components', 'game-over-presentation.css'), 'utf8');

  assert.match(component, /animations\/defeated-banner\/parts/);
  assert.match(component, /scicon-defeated-plaque\.png/);
  assert.match(component, /scicon-defeated-wing-left\.png/);
  assert.match(component, /scicon-defeated-warning-rotor\.png/);
  assert.match(component, /animations\/floating-window\/parts/);
  assert.match(component, /game-over-result-frame\.png/);
  assert.match(component, /footer\?: React\.ReactNode/);
  assert.match(component, /sci-gameover-footer/);
  assert.match(component, />Defeated</);
  assert.match(styles, /sciDefeatedBannerDrop/);
  assert.match(styles, /sciGameOverWindowDeploy/);
  assert.doesNotMatch(component, /\.gif/);
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
  assert.match(app, /setShowNameInput\(true\)/);
  assert.match(app, /isSubmittingScore \? 'Saving\.\.\.' : 'Submit'/);
  assert.match(app, /sci-gameover-result-content/);
  assert.match(app, /sci-gameover-skip-score/);
  assert.match(styles, /inset: 13\.5% 10\.5% 12\.5%/);
  assert.match(styles, /\.sci-gameover-result-content input,[\s\S]*max-width: 100%/);
  assert.match(styles, /@media \(max-height: 760px\)/);
  assert.doesNotMatch(app, /Prepare record/);
  assert.doesNotMatch(app, /id="pilot-score-name"[\s\S]{0,500}autoFocus/);
});
