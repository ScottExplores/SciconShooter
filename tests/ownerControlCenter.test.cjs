const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('the Director launcher opens the owner hub and recognizes every curated route', () => {
  const launcher = read('tools', 'start-scicon-director.ps1');
  assert.match(launcher, /\[string\]\$Page = 'hub'/);
  for (const route of ['reports', 'project', 'missions', 'bosses', 'sandbox']) {
    assert.match(launcher, new RegExp(`'${route}'`));
  }
  assert.match(launcher, /cache-player-reports\.mjs/);
  assert.match(launcher, /--env-file-if-exists=\.env\.local/);
  assert.match(launcher, /player-reports\.json/);
});

test('the one-click Control Center warms the game and opens the local dashboard', () => {
  const launcher = read('tools', 'start-scicon-control-center.ps1');
  assert.match(launcher, /start-scicon-shooter-local\.ps1/);
  assert.match(launcher, /start-scicon-director\.ps1/);
  assert.match(launcher, /-OpenBrowser -Page hub/);
  assert.match(launcher, /-WindowStyle Hidden/);
});

test('local game shortcuts use the canonical mobile preview and never the retired port', () => {
  const gameLauncher = read('tools', 'start-scicon-shooter-local.ps1');
  const gameInstaller = read('tools', 'install-scicon-shooter-local-shortcut.ps1');
  const directorInstaller = read('tools', 'install-scicon-director-shortcuts.ps1');
  const sources = `${gameLauncher}\n${gameInstaller}\n${directorInstaller}`;
  assert.match(sources, /127\.0\.0\.1:5179\/\?display=mobile-frame/);
  assert.doesNotMatch(sources, /127\.0\.0\.1:5176/);
  assert.match(gameLauncher, /'5179'/);
});

test('the shortcut installer creates an organized owner folder without removing loose shortcuts', () => {
  const installer = read('tools', 'install-scicon-director-shortcuts.ps1');
  for (const label of [
    'Scicon Shooter Control Center.lnk',
    'Scicon Shooter Tools',
    'Bug and Feedback Log.lnk',
    'Boss Sandbox.lnk',
    'Mission Builder.lnk',
    'Combat Lab.lnk',
    'Project Guide.lnk',
    'Local Game.lnk',
    'Live Game.lnk',
    'Project Folder.lnk',
    'Sprite Gallery.lnk'
  ]) {
    assert.match(installer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(installer, /Remove-Item|Move-Item/);
  assert.match(installer, /ExistingLooseShortcutsPreserved = \$true/);
});

test('the durable owner guide explains report review and the canonical project map', () => {
  const guide = read('docs', 'OWNER_CONTROL_CENTER.md');
  assert.match(guide, /Where to review bug reports/);
  assert.match(guide, /Player Reports/);
  assert.match(guide, /Scicon Shooter Tools/);
  assert.match(guide, /SUPABASE_SECRET_KEY/);
  assert.match(guide, /never paste a secret into the browser UI/i);
  assert.match(guide, /codex\/scicon-experimental/);
  assert.match(guide, /Vercel is the production host/);
  assert.match(guide, /Netlify and Render are not part/);
});
