const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readSource = (...segments) => (
  fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n')
);

test('resume keeps the mission paused behind a visible 3-2-1 countdown', () => {
  const app = readSource('App.tsx');
  const stage = readSource('components', 'GameStage.tsx');
  const stageCss = readSource('components', 'game-stage.css');

  assert.match(app, /const RESUME_COUNTDOWN_START = 3/);
  assert.match(app, /const RESUME_COUNTDOWN_STEP_MS = 1_000/);
  assert.match(app, /const \[resumeCountdown, setResumeCountdown\] = useState<number \| null>\(null\)/);
  assert.match(app, /gameStateRef\.current !== GameState\.PAUSED/);
  assert.match(app, /onResume=\{beginResumeCountdown\}/);
  assert.doesNotMatch(
    app,
    /onResume=\{\(\) => \{[\s\S]{0,140}setGameState\(GameState\.PLAYING\)/,
    'the Resume button must not immediately restart simulation'
  );
  assert.match(
    app,
    /if \(current > 1\)[\s\S]{0,220}setResumeCountdown\(null\);[\s\S]{0,160}setGameState\(GameState\.PLAYING\)/
  );
  assert.match(app, /document\.hidden/);
  assert.match(app, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(app, /document\.removeEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(app, /resumeCountdown=\{resumeCountdown\}/);
  assert.match(app, /gameState === GameState\.PAUSED && !resumeCountdownActive/);

  assert.match(stage, /role="status"/);
  assert.match(stage, /aria-live="assertive"/);
  assert.match(stage, /Mission resumes in \$\{resumeCountdown\}/);
  assert.match(stage, /key=\{resumeCountdown\}/);
  assert.match(stageCss, /\.scicon-resume-countdown \{/);
  assert.match(stageCss, /pointer-events: auto/);
  assert.match(stageCss, /touch-action: none/);
  assert.doesNotMatch(stageCss, /backdrop-filter/);
  assert.match(stageCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('countdown stays under the existing paused music lifecycle', () => {
  const app = readSource('App.tsx');

  assert.match(
    app,
    /if \(gameState === GameState\.PAUSED\) \{\s*audioService\.pauseMusic\(\)/
  );
  assert.match(
    app,
    /setResumeCountdown\(null\);\s*setOwnerFrameFrozen\(false\);\s*setGameState\(GameState\.PLAYING\)/
  );
});
