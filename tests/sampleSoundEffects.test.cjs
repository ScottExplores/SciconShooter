const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('combat samples include distinct authored boss warning, rotary burst, and mission launch cues', () => {
  const expectedSamples = [
    'player-shot.wav',
    'boss-shot.wav',
    'boss-warning.wav',
    'boss-rotary-burst.wav',
    'mission-launch.wav',
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
  assert.match(audioSource, /boss-warning\.wav/);
  assert.match(audioSource, /boss-rotary-burst\.wav/);
  assert.match(audioSource, /mission-launch\.wav/);
  assert.match(audioSource, /private preloadSamples\(keys: ReadonlyArray<SampleKey> = ALL_SAMPLE_KEYS\)/);
  assert.match(audioSource, /private playSample\(/);
  assert.match(audioSource, /stopActiveSampleNodes/);
  assert.doesNotMatch(audioSource, /shoot: \{ sample: 'player-shot'/);
  assert.match(audioSource, /boss_cannon: \{ sample: 'boss-shot'/);
  assert.match(audioSource, /boss_machinegun: \{ sample: 'boss-rotary-burst'/);
  assert.doesNotMatch(audioSource, /boss_machinegun: \{ sample: 'player-shot'/);
  assert.match(audioSource, /boss_alert: \{ sample: 'boss-warning'/);
  assert.match(audioSource, /siren: \{ sample: 'boss-warning'/);
  assert.match(audioSource, /launch: \{ sample: 'mission-launch'/);
  assert.match(audioSource, /boss_cannon:\s*160/);
  assert.match(audioSource, /boss_machinegun:\s*620/);
  assert.match(audioSource, /boss_alert:\s*2_600/);
  assert.match(audioSource, /const PLAYER_SHOT_GAIN = 0\.12/);
  assert.match(audioSource, /case 'shoot':\s*osc\.type = 'triangle'/);
  assert.match(audioSource, /osc\.frequency\.setValueAtTime\(520 \* pitch, t\)/);
  assert.match(audioSource, /gain\.gain\.setValueAtTime\(PLAYER_SHOT_GAIN, t\)/);
});

test('combat events distinguish player fire, boss fire, impacts, and destruction', () => {
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engineSource, /this\.playSound\('boss_shoot'/);
  assert.match(engineSource, /this\.playSound\(type === 'gatekeeper' \? 'boss_alert' : 'siren'\)/);
  assert.match(engineSource, /this\.playSound\('launch'\)/);
  assert.match(engineSource, /this\.playSound\('impact'/);
  assert.match(engineSource, /if \(intensity >= 1\.2\) \{\s*this\.playSound\('explode'/);
  assert.match(engineSource, /spawnExplosion\(target\.x, target\.y, target\.color, destructionIntensity\)/);
});

test('the hosted boss runner enables only sound effects and unlocks audio on a user gesture', () => {
  const runnerSource = fs.readFileSync(
    path.join(root, 'director', 'remote', 'RemoteBossRunnerApp.tsx'),
    'utf8'
  );
  const editorSource = fs.readFileSync(
    path.join(root, 'components', 'GameEditorCanvas.tsx'),
    'utf8'
  );
  const canvasSource = fs.readFileSync(
    path.join(root, 'components', 'GameCanvas.tsx'),
    'utf8'
  );

  assert.match(runnerSource, /audioService\.init\(\)/);
  assert.match(runnerSource, /addEventListener\('pointerdown', initializeAudio, true\)/);
  assert.match(runnerSource, /audioEnabled\s+musicEnabled=\{false\}/);
  assert.match(editorSource, /audioEnabled = false/);
  assert.match(editorSource, /musicEnabled = false/);
  assert.match(canvasSource, /audioService\.setMusicPlaybackEnabled\(musicEnabled\)/);
});
