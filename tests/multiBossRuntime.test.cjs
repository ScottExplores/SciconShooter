const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('the runtime keeps grouped Bottleneck Drones distinct and aggregates their health', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(source, /const count = Math\.max\(1, Math\.min\(4, Math\.floor\(requestedCount\) \|\| 1\)\)/);
  assert.match(source, /mb\.encounterGroupSize = count/);
  assert.match(source, /mb\.formationIndex = index/);
  assert.match(source, /activeMiniBosses\.reduce\(\(total, boss\) => total \+ Math\.max\(0, boss\.hp\), 0\)/);
  assert.match(source, /if \(remainingMiniBosses\.length === 0\) this\.waveProgressFrames \+= 120/);
  assert.match(source, /TWIN BOTTLENECKS!/);
});

test('the Director exposes and validates the same Bottleneck boss count', () => {
  const inspector = fs.readFileSync(path.join(root, 'director', 'src', 'editor', 'EditorInspector.tsx'), 'utf8');
  const validator = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');

  assert.match(inspector, /label="Boss count"/);
  assert.match(inspector, /boss\.count \?\? 1/);
  assert.match(validator, /!\['bottleneck-drone', 'paywall-wall'\]\.includes\(event\.bossId\) && event\.count > 1/);
});
