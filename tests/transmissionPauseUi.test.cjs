const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('story transmissions open a simple fitted shutter before typewriter playback', () => {
  const story = fs.readFileSync(path.join(root, 'components', 'StoryTransmission.tsx'), 'utf8');
  const vault = fs.readFileSync(path.join(root, 'components', 'FundingVaultUnseal.tsx'), 'utf8');
  const vaultCss = fs.readFileSync(path.join(root, 'styles', 'funding-vault-unseal.css'), 'utf8');
  assert.match(vault, /FUNDING_VAULT_UNSEAL_DURATION_MS = 2184/);
  assert.match(story, /const \[vaultUnsealed, setVaultUnsealed\]/);
  assert.match(story, /if \(!vaultUnsealed \|\| isComplete\) return/);
  assert.match(story, /<FundingVaultUnseal open=\{vaultUnsealed\}>/);
  assert.match(story, /sci-funding-vault__transmission/);
  // Beats key to Sectors now, one per Sector, so the header names the Sector.
  assert.match(story, /Sector \{beat\.phase\}: \{beat\.title\}/);
  assert.doesNotMatch(story, /Stage \{beat\.phase\}: \{beat\.title\}/);
  assert.doesNotMatch(story, /Wave \{beat\.phase\}: \{beat\.title\}/);
  assert.match(vault, /sci-funding-vault--portrait/);
  assert.match(vault, /sci-funding-vault__content/);
  assert.match(vault, /sci-funding-vault__aperture/);
  assert.match(vaultCss, /aspect-ratio: 1 \/ 1/);
  assert.match(vaultCss, /sci-vault-shutter-left/);
  assert.match(vaultCss, /sci-vault-shutter-right/);
  assert.doesNotMatch(vault, /research-core|energy-ring|mechanical-seal|energy-beam|energy-glow/);
  assert.doesNotMatch(vaultCss, /rotate\(90deg\)/);
  assert.match(story, /h-\[76px\] w-\[76px\]/);
  assert.match(story, /items-start overflow-y-auto/);
  assert.match(story, /sci-funding-vault__copy max-w-full font-mono text-\[12px\] leading-\[1\.38\]/);
  assert.match(vaultCss, /width: min\(94%, 390px, 76dvh\)/);
  assert.match(vaultCss, /overflow-wrap: anywhere/);

  const beats = fs.readFileSync(path.join(root, 'services', 'storyBeats.ts'), 'utf8');
  // One transmission per Sector now, ten in all, so the story runs the whole
  // Campaign instead of stopping at Mission 5. Pinned loosely: the copy is
  // meant to be editable, the structure is not.
  assert.match(beats, /predatory journals/i);
  assert.equal((beats.match(/phase: \d+/g) || []).length, 10);
  assert.doesNotMatch(beats, /Top pilots can help point the weekly RSC allocation toward ResearchHub proposals/);
});

test('pause menu uses the generated game interface while preserving real setting controls', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const pause = fs.readFileSync(path.join(root, 'components', 'PauseMenu.tsx'), 'utf8');
  const audioSettings = fs.readFileSync(path.join(root, 'components', 'AudioSettingsControls.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles', 'pause-menu.css'), 'utf8');
  const actionCss = fs.readFileSync(path.join(root, 'styles', 'tailwind.input.css'), 'utf8');

  assert.match(app, /<PauseMenu/);
  assert.match(app, /onToggleAudio=\{toggleGameAudio\}/);
  assert.match(app, /sfxVolumeLevel=\{sfxVolumeLevel\}/);
  assert.match(app, /onRuntimeState: handleRuntimeState/);
  assert.match(app, /missionNumber=\{pauseMissionPosition\?\.levelNumber/);
  assert.match(app, /waveNumber=\{pauseMissionPosition\?\.waveNumber/);
  assert.match(app, /waveTotal=\{pauseMissionPosition\?\.waveTotal/);
  assert.match(app, /onSfxVolumeChange=\{setGameSfxVolume\}/);
  assert.match(app, /onTogglePolishSetting=\{togglePolishSetting\}/);
  assert.match(app, /founderControls=\{isOwnerWallet && isOwnerTestRun/);

  assert.match(audioSettings, /aria-pressed=\{enabled\}/);
  assert.match(pause, /PixelActionButton/);
  assert.match(pause, /tone="green"/);
  assert.match(pause, /tone="danger"/);
  assert.ok(
    pause.indexOf('sci-pause-action--quit') < pause.indexOf('sci-pause-action--resume'),
    'forfeit must be the left/first action and resume the right/second action'
  );
  assert.doesNotMatch(pause, /quitWarning/);
  assert.doesNotMatch(pause, /icons\/system\/settings\.png/);
  assert.doesNotMatch(app, /Forfeiting consumes this attempt/);
  assert.match(pause, /sci-pause-setting__toggle-track/);
  assert.match(audioSettings, /type="range"/);
  assert.match(audioSettings, /min=\{0\}/);
  assert.match(audioSettings, /max=\{5\}/);
  assert.match(audioSettings, /step=\{1\}/);
  assert.match(audioSettings, /AUDIO_VOLUME_NOTCHES\.map/);
  assert.match(audioSettings, /label="Sound effects"/);
  assert.match(audioSettings, /label="Music"/);
  assert.match(pause, /idPrefix="sci-pause"/);
  assert.match(app, /musicVolumeLevel=\{musicVolumeLevel\}/);
  assert.match(app, /onMusicVolumeChange=\{setGameMusicVolume\}/);
  assert.match(pause, /Mission \{String\(missionNumber\)\.padStart\(2, '0'\)\}/);
  assert.match(pause, /Wave \{waveNumber\}\/\{waveTotal\}/);
  assert.match(pause, /sci-pause-mission-position/);
  assert.match(pause, /onTogglePolishSetting\('screenShake'\)/);
  assert.match(pause, /onTogglePolishSetting\('highDensityParticles'\)/);

  assert.match(css, /\.sci-pause-shell::before/);
  assert.match(css, /\.sci-pause-settings \{/);
  assert.match(css, /\.sci-pause-setting__toggle-knob/);
  assert.match(css, /\.sci-pause-volume__notches/);
  assert.match(css, /\.sci-pause-mission-position \{/);
  assert.match(css, /\.sci-pause-mission-position__wave \{/);
  assert.match(css, /grid-template-columns: 0\.7fr 1fr/);
  assert.match(actionCss, /\.sci-pixel-action\[data-tone='danger'\]/);
  assert.match(css, /grid-template-columns: repeat\(6, 1fr\)/);
  assert.doesNotMatch(css, /pause-menu-frame\.png/);
  assert.doesNotMatch(css, /resume-button\.png/);
});

test('More keeps compact audio controls without the oversized settings artwork', () => {
  const start = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
  const aboutDashboardStart = start.indexOf('const AboutDashboard');
  const aboutDashboardEnd = start.indexOf("dashboardTab === 'hangar'", aboutDashboardStart);
  const aboutDashboard = start.slice(aboutDashboardStart, aboutDashboardEnd);

  assert.ok(aboutDashboardStart >= 0, 'More dashboard should remain present');
  assert.match(aboutDashboard, /aria-label="Audio settings"/);
  assert.match(aboutDashboard, /<span>Audio Settings<\/span>/);
  assert.match(aboutDashboard, /<AudioSettingsControls/);
  assert.match(aboutDashboard, /idPrefix="sci-more"/);
  assert.doesNotMatch(aboutDashboard, /icons\/system\/settings\.png/);
});
