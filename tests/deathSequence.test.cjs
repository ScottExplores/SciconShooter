const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('the mission-lost animation always reaches the results screen', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const canvasSource = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');

  assert.match(source, /deathSequenceMaxDurationMs: number = 2200/);
  assert.match(source, /this\.deathSequenceStartedAtMs = Date\.now\(\)/);
  assert.match(source, /Date\.now\(\) - this\.deathSequenceStartedAtMs >= this\.deathSequenceMaxDurationMs/);
  assert.match(source, /finishDeathSequence\(\) \{/);
  assert.match(source, /this\.hitStopFrames = 0/);
  assert.match(source, /this\.gameActive = false/);
  assert.match(canvasSource, /const armDeathSequenceSafetyTimer = \(\) =>/);
  assert.match(canvasSource, /engine\.finishDeathSequence\(\)/);
  assert.match(canvasSource, /dispatchGameOver\(\)/);
  assert.match(canvasSource, /window\.clearTimeout\(deathSequenceSafetyTimer\)/);
});
