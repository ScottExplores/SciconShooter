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
  // REVAMP(G): A retains authored assets but routes primary fire through the layered synth.
  const { loadService } = require('./helpers/loadService.cjs');
  const { createCueLayers } = loadService(path.join(root, 'services/revamp/feel/audioSynthesis.ts'));
  assert.deepEqual(createCueLayers('shoot').map(({ wave, startHz, endHz, gain }) =>
    ({ wave, startHz, endHz, gain })), [
    { wave: 'triangle', startHz: 620, endHz: 180, gain: 0.10 },
    { wave: 'noise', startHz: 0, endHz: 0, gain: 0.022 }
  ]);
  assert.match(audioSource, /this\.feelSynth\?\.play\(feelCue,/);
});

test('combat events distinguish player fire, boss fire, impacts, and destruction', () => {
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engineSource, /this\.playSound\('boss_shoot'/);
  assert.match(engineSource, /this\.playSound\(type === 'gatekeeper' \? 'boss_alert' : 'siren'\)/);
  assert.match(engineSource, /this\.playSound\('launch'\)/);
  assert.match(engineSource, /this\.playSound\('impact'/);
  assert.match(engineSource, /this\.playSound\(intensity >= 2 \? 'explosion_boss_part'\s*: intensity >= 1\.2 \? 'explosion_elite' : 'explosion_small', intensity/);
  assert.match(engineSource, /spawnExplosion\(target\.x, target\.y, target\.color, destructionIntensity\)/);
});

test('the hosted boss runner enables sound effects and unlocks audio on a user gesture', () => {
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
  assert.match(runnerSource, /previewBossArtwork=\{previewBossArtwork\}\s+audioEnabled/);
  assert.match(editorSource, /audioEnabled = false/);
  assert.match(canvasSource, /audioEnabled = !previewMode/);
  assert.doesNotMatch(runnerSource, /musicEnabled/);
  assert.doesNotMatch(editorSource, /musicEnabled/);
  assert.doesNotMatch(canvasSource, /musicEnabled|setMusicPlaybackEnabled/);
});
