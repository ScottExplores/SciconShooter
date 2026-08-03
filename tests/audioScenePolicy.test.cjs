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
const audioSettingsSource = readSource('components', 'AudioSettingsControls.tsx');
const gameLogicSource = readSource('services', 'gameLogic.ts');

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

test('pause and More reuse persisted sound controls and the same match-music picker', () => {
  assert.match(audioSettingsSource, /label="Sound effects"/);
  assert.match(audioSettingsSource, /sfxVolumeLevel/);
  assert.match(audioSettingsSource, /onSfxVolumeChange/);
  assert.match(audioSettingsSource, /label="Music"/);
  assert.match(audioSettingsSource, /onMusicVolumeChange/);
  assert.match(audioSettingsSource, /Match music/);
  assert.match(audioSettingsSource, /MATCH_MUSIC_TRACKS\.map/);
  assert.match(pauseSource, /<AudioSettingsControls/);
  assert.match(pauseSource, /idPrefix="sci-pause"/);
  assert.match(pauseSource, /matchMusicTrackId/);
  assert.match(pauseSource, /onMatchMusicTrackChange/);
  assert.match(startSource, /<AudioSettingsControls/);
  assert.match(startSource, /idPrefix="sci-more"/);
  assert.match(startSource, /matchMusicTrackId/);
  assert.match(appSource, /audioService\.getMatchMusicTrackId\(\)/);
  assert.match(appSource, /audioService\.setMatchMusicTrackId\(trackId\)/);
});

test('legacy externally sourced music and product-facing credits remain removed', () => {
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

test('match tracks use the procedural WebAudio bus and defeat gets its authored one-shot', () => {
  assert.match(audioSource, /Research Velocity/);
  assert.match(audioSource, /Open Orbit Relay/);
  assert.match(audioSource, /Ion Veil Pursuit/);
  assert.match(audioSource, /Event Horizon Run/);
  assert.match(audioSource, /defeat:\s*`\$\{MUSIC_ROOT\}\/stinger-defeat\.wav`/);
  assert.match(audioSource, /defeat:\s*false/);
  assert.match(audioSource, /source\.loop = MUSIC_LOOPS\[track\]/);
  assert.match(
    appSource,
    /gameState === GameState\.GAMEOVER && !campaignCompletedRun[\s\S]{0,80}\? 'defeat'/
  );
  assert.match(
    appSource,
    /gameState === GameState\.PLAYING[\s\S]{0,80}stats\.isBossActive \? 'boss' : matchMusicTrackId/
  );
  assert.match(gameLogicSource, /this\.playSound\('gameover'\)/);
});
