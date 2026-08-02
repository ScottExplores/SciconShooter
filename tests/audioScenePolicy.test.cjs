const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readSource = (...segments) => (
  fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n')
);
const appSource = readSource('App.tsx');
const audioSource = readSource('services', 'audioService.ts');
const canvasSource = readSource('components', 'GameCanvas.tsx');
const editorSource = readSource('components', 'GameEditorCanvas.tsx');
const pauseSource = readSource('components', 'PauseMenu.tsx');
const startSource = readSource('components', 'StartScreen.tsx');

test('the application has no background-music scheduler, preload, or media-element path', () => {
  [
    appSource,
    audioSource,
    canvasSource,
    editorSource,
    pauseSource,
    startSource
  ].forEach((source) => {
    assert.doesNotMatch(source, /\/audio\/music\//);
  });

  assert.doesNotMatch(appSource, /setMusicScene|prepareMusicScene|advanceMusicTrack/);
  assert.doesNotMatch(audioSource, /MusicScene|MISSION_MUSIC_TRACKS|HTMLAudioElement|new Audio\(|\.play\(\)/);
  assert.doesNotMatch(canvasSource, /musicEnabled|setMusicPlaybackEnabled/);
  assert.doesNotMatch(editorSource, /musicEnabled/);
});

test('pause settings expose sound-effects and music sliders without a legacy track picker', () => {
  assert.match(pauseSource, /label="Sound effects"/);
  assert.match(pauseSource, /sfxVolumeLevel/);
  assert.match(pauseSource, /onSfxVolumeChange/);
  assert.match(pauseSource, /label="Music"/);
  assert.match(pauseSource, /onMusicVolumeChange/);
  assert.doesNotMatch(pauseSource, /Mission music|musicTrackId/);
  assert.doesNotMatch(appSource, /musicTrackId/);
});

test('all background music binaries and product-facing credits are removed', () => {
  const musicDirectory = path.join(root, 'public', 'audio', 'music');
  const files = fs.existsSync(musicDirectory)
    ? fs.readdirSync(musicDirectory).filter((file) => !file.startsWith('.'))
    : [];

  assert.deepEqual(files, []);
  assert.doesNotMatch(appSource, /Outer Space Music Pack|Final Hour/);
  assert.doesNotMatch(startSource, /Outer Space Music Pack|Final Hour/);
});

test('mission completion still plays the authored victory SFX only at the final clear', () => {
  const handlerStart = appSource.indexOf('const showWaveVictory = async');
  const handlerEnd = appSource.indexOf('const continueAfterWaveVictory', handlerStart);
  const handler = appSource.slice(handlerStart, handlerEnd);
  const internalWaveReturn = handler.indexOf('if (!summary.stageComplete)');
  const victoryCue = handler.indexOf("audioService.playSound('mission_victory'");

  assert.ok(internalWaveReturn >= 0);
  assert.ok(victoryCue > internalWaveReturn);
  assert.match(handler, /if \(!summary\.stageComplete\) \{[\s\S]*?setGameState\(GameState\.PLAYING\);[\s\S]*?return;/);
  assert.equal((handler.match(/playSound\('mission_victory'/g) ?? []).length, 1);
});
