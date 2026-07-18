const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('legacy combat samples are checked in while player fire uses the softer synthesized beam', () => {
  const expectedSamples = [
    'player-shot.wav',
    'boss-shot.wav',
    'hit.wav',
    'explosion.wav'
  ];

  expectedSamples.forEach((fileName) => {
    const filePath = path.join(root, 'public', 'audio', 'sfx', fileName);
    assert.ok(fs.existsSync(filePath), `${fileName} should be checked in`);
    assert.ok(fs.statSync(filePath).size > 1_000, `${fileName} should contain audio data`);
  });

  const audioSource = fs.readFileSync(path.join(root, 'services', 'audioService.ts'), 'utf8');
  assert.match(audioSource, /player-shot\.wav/);
  assert.match(audioSource, /boss-shot\.wav/);
  assert.match(audioSource, /private preloadSamples\(\)/);
  assert.match(audioSource, /private playSample\(/);
  assert.match(audioSource, /stopActiveSampleNodes/);
  assert.doesNotMatch(audioSource, /shoot: \{ sample: 'player-shot'/);
  assert.match(audioSource, /case 'shoot':\s*osc\.type = 'triangle'/);
  assert.match(audioSource, /osc\.frequency\.setValueAtTime\(520 \* pitch, t\)/);
  assert.match(audioSource, /gain\.gain\.setValueAtTime\(0\.045, t\)/);
});

test('combat events distinguish player fire, boss fire, impacts, and destruction', () => {
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engineSource, /this\.playSound\('boss_shoot'/);
  assert.match(engineSource, /this\.playSound\('impact'/);
  assert.match(engineSource, /if \(intensity >= 1\.2\) \{\s*this\.playSound\('explode'/);
  assert.match(engineSource, /spawnExplosion\(target\.x, target\.y, target\.color, destructionIntensity\)/);
});
