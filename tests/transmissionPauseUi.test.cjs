const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('story transmissions unseal the layered funding vault before typewriter playback', () => {
  const story = fs.readFileSync(path.join(root, 'components', 'StoryTransmission.tsx'), 'utf8');
  const vault = fs.readFileSync(path.join(root, 'components', 'FundingVaultUnseal.tsx'), 'utf8');
  const partsRoot = path.join(
    root,
    'public',
    'game-art',
    'generated',
    'ui',
    'scicon-ui-system-v2',
    'animations',
    'funding-vault-unseal',
    'parts'
  );

  [
    'vault-frame-body.png',
    'shutter-left.png',
    'shutter-right.png',
    'mechanical-seal.png',
    'research-core.png',
    'energy-ring.png',
    'energy-glow.png',
    'energy-beam.png'
  ].forEach((name) => assert.ok(fs.existsSync(path.join(partsRoot, name)), `${name} should ship with the vault rig`));

  assert.match(vault, /FUNDING_VAULT_UNSEAL_DURATION_MS = 2184/);
  assert.match(story, /const \[vaultUnsealed, setVaultUnsealed\]/);
  assert.match(story, /if \(!vaultUnsealed \|\| isComplete\) return/);
  assert.match(story, /!vaultUnsealed \? <FundingVaultUnseal \/>/);
  assert.match(vault, /shutter-left\.png/);
  assert.match(vault, /shutter-right\.png/);
  assert.match(vault, /research-core\.png/);
});

test('pause menu uses the generated game interface while preserving real setting controls', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const pause = fs.readFileSync(path.join(root, 'components', 'PauseMenu.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles', 'pause-menu.css'), 'utf8');

  assert.match(app, /<PauseMenu/);
  assert.match(app, /onToggleAudio=\{toggleGameAudio\}/);
  assert.match(app, /onTogglePolishSetting=\{togglePolishSetting\}/);
  assert.match(app, /founderControls=\{isOwnerWallet && isOwnerTestRun/);

  assert.match(pause, /aria-pressed=\{enabled\}/);
  assert.match(pause, /toggle-\$\{enabled \? 'on' : 'off'\}\.png/);
  assert.match(pause, /onTogglePolishSetting\('screenShake'\)/);
  assert.match(pause, /onTogglePolishSetting\('highDensityParticles'\)/);

  assert.match(css, /pause-menu-frame\.png/);
  assert.match(css, /resume-button\.png/);
  assert.match(css, /quit-button\.png/);
  assert.match(css, /audio-settings-row\.png/);
  assert.match(css, /controls-settings-row\.png/);
});
