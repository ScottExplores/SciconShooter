const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readSource = (...segments) => (
  fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n')
);

test('pausing a mission silences only music and resumes the selected loop', () => {
  const app = readSource('App.tsx');
  const audio = readSource('services', 'audioService.ts');

  assert.match(app, /gameState === GameState\.PAUSED[\s\S]{0,100}audioService\.pauseMusic\(\)/);
  assert.match(app, /audioService\.getCurrentMusic\(\) === targetMusic[\s\S]{0,100}audioService\.resumeMusic\(\)/);
  assert.match(audio, /pauseMusic\(fadeSeconds = 0\)/);
  assert.match(audio, /resumeMusic\(fadeSeconds = 0\.18\)/);
  assert.match(audio, /this\.stopMusicSource\(fadeSeconds, true\)/);
  assert.match(audio, /this\.musicPlaybackOffset \+ elapsed/);
  assert.match(audio, /source\.start\(startAt, offset\)/);
  assert.match(audio, /this\.muted \|\| this\.musicPaused/);
  assert.match(
    audio,
    /private applyAudioLevels\(\)[\s\S]*?this\.applyMusicDuckLevel\(\)/
  );
  // REVAMP(G): A's ducking must still preserve page silence and restore the selected gain.
  assert.match(audio, /const target = this\.pageActive \? this\.musicTargetGain : 0/);
  assert.match(audio, /setTargetAtTime\(target, this\.musicDuckUntil, 0\.24\)/);
  assert.doesNotMatch(app, /gameState !== GameState\.PLAYING\) \{\s*void audioService\.playMusic\('menu'\)/);
});

test('More and Mission Paused bind the same App-owned persisted audio state', () => {
  const app = readSource('App.tsx');
  const start = readSource('components', 'StartScreen.tsx');
  const pause = readSource('components', 'PauseMenu.tsx');
  const controls = readSource('components', 'AudioSettingsControls.tsx');

  assert.match(start, /idPrefix="sci-more"/);
  assert.match(pause, /idPrefix="sci-pause"/);
  assert.match(start, /onSfxVolumeChange=\{onSfxVolumeChange\}/);
  assert.match(start, /onMusicVolumeChange=\{onMusicVolumeChange\}/);
  assert.match(controls, /The one canonical audio-settings surface/);
  assert.ok((app.match(/onSfxVolumeChange=\{setGameSfxVolume\}/g) ?? []).length >= 3);
  assert.ok((app.match(/onMusicVolumeChange=\{setGameMusicVolume\}/g) ?? []).length >= 3);
});
