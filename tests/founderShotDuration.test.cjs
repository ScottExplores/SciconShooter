const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

test('Founder double and triple shot pickups last twice as long as standard powerups', () => {
  assert.match(constantsSource, /POWERUP_DURATION:\s*720/);
  assert.match(constantsSource, /FOUNDER_SHOT_DURATION:\s*1440/);
  assert.match(
    engineSource,
    /type === PowerupType\.DOUBLE_SHOT \|\| type === PowerupType\.TRIPLE_SHOT/
  );
  assert.match(engineSource, /\? GAME_CONFIG\.FOUNDER_SHOT_DURATION/);
});

test('Founder gun-pod animation uses the full doubled duration', () => {
  assert.match(
    engineSource,
    /const entryAge = GAME_CONFIG\.FOUNDER_SHOT_DURATION\s*- Math\.min\(GAME_CONFIG\.FOUNDER_SHOT_DURATION, remaining\)/
  );
});
