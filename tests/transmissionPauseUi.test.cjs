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
  assert.match(story, /Mission \{beat\.phase\}: \{beat\.title\}/);
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
  assert.match(beats, /Nice flying\. Predatory journals and review traps crowd this sector\./);
  assert.doesNotMatch(beats, /Top pilots can help point the weekly RSC allocation toward ResearchHub proposals/);
});

test('pause menu uses the generated game interface while preserving real setting controls', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const pause = fs.readFileSync(path.join(root, 'components', 'PauseMenu.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles', 'pause-menu.css'), 'utf8');

  assert.match(app, /<PauseMenu/);
  assert.match(app, /onToggleAudio=\{toggleGameAudio\}/);
  assert.match(app, /audioVolumeLevel=\{audioVolumeLevel\}/);
  assert.match(app, /onAudioVolumeChange=\{setGameAudioVolume\}/);
  assert.match(app, /onTogglePolishSetting=\{togglePolishSetting\}/);
  assert.match(app, /founderControls=\{isOwnerWallet && isOwnerTestRun/);

  assert.match(pause, /aria-pressed=\{enabled\}/);
  assert.match(pause, /PixelActionButton/);
  assert.match(pause, /tone="green"/);
  assert.match(pause, /tone="neutral"/);
  assert.match(pause, /sci-pause-setting__toggle-track/);
  assert.match(pause, /type="range"/);
  assert.match(pause, /min=\{0\}/);
  assert.match(pause, /max=\{5\}/);
  assert.match(pause, /step=\{1\}/);
  assert.match(pause, /AUDIO_VOLUME_NOTCHES\.map/);
  assert.match(pause, /onTogglePolishSetting\('screenShake'\)/);
  assert.match(pause, /onTogglePolishSetting\('highDensityParticles'\)/);

  assert.match(css, /\.sci-pause-shell::before/);
  assert.match(css, /\.sci-pause-settings \{/);
  assert.match(css, /\.sci-pause-setting__toggle-knob/);
  assert.match(css, /\.sci-pause-volume__notches/);
  assert.match(css, /grid-template-columns: repeat\(6, 1fr\)/);
  assert.doesNotMatch(css, /pause-menu-frame\.png/);
  assert.doesNotMatch(css, /resume-button\.png/);
});
