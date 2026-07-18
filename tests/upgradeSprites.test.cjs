const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const spriteNames = ['rapid-fire.png', 'speed.png', 'extra-life.png'];

test('pixel upgrade sprites are optimized square PNG assets', () => {
  spriteNames.forEach((name) => {
    const spritePath = path.join(root, 'public', 'game-art', 'powerups', name);
    const png = fs.readFileSync(spritePath);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
    assert.ok(png.length < 100_000, `${name} should remain lightweight for mobile`);
  });
});

test('the HUD uses enlarged sprite-only upgrade buttons with cost and appropriate level badges', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');
  spriteNames.forEach((name) => assert.match(source, new RegExp(`/game-art/powerups/${name.replace('.', '\\.')}`)));
  assert.match(source, /highlighted=\{highlighted\}/);
  assert.match(source, /h-\[4\.375rem\] w-\[4\.375rem\]/);
  assert.match(source, /h-\[3\.5rem\] w-\[3\.5rem\]/);
  assert.match(source, /w-\[4\.375rem\] flex-col/);
  assert.match(source, /type === 'speed' \? '-rotate-90'/);
  assert.match(source, /h-6 min-w-6.*text-xs font-black/);
  assert.match(source, /x\{flaskCost\}/);
  assert.match(source, /isAtCap \? 'MAX' : `L\$\{displayedLevel\}`/);
  assert.match(source, /\(isAtCap \|\| !isLifeUpgrade\)/);
  assert.match(source, /saturate-125 brightness-110/);
  assert.match(source, /grayscale opacity-35 brightness-50/);
  assert.match(source, /\[image-rendering:pixelated\]/);
  assert.doesNotMatch(source, /\{shortTitle\}/);
  assert.doesNotMatch(source, /style=\{\{ width: `\$\{Math\.min\(100, \(level \/ config\.maxLevel\)/);
});

test('the top HUD prioritizes hearts and flask progress while the upgrade rail shows only stored flasks', () => {
  const source = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');

  assert.doesNotMatch(source, /Wave \{stats\.wave\}/);
  assert.match(source, /Flasks \{flaskCount\}/);
  assert.match(source, /style=\{\{ width: `\$\{nextFlaskPct\}%` \}\}/);
  assert.match(source, /scicon-compact-top-hud-v1/);
  assert.match(source, /life-counter-frame\.png/);
  assert.match(source, /flask-progress-frame\.png/);
  assert.match(source, /score-counter-frame\.png/);
  assert.match(source, /heart-health-fill\.png/);
  assert.match(source, /beaker-charge-liquid\.png/);
  assert.match(source, /pause-button-normal\.png/);
  assert.match(source, /data-testid="compact-status-hud"/);
  assert.match(source, /clipPath: `inset\(\$\{100 - remainingLifePct\}% 0 0 0\)`/);
  assert.match(source, /h-\[4\.625rem\] w-\[9\.25rem\]/);
  assert.doesNotMatch(source, /aria-label=\{muted \? 'Unmute sound' : 'Mute sound'\}/);
  assert.match(source, /arcade-font text-sm font-black leading-none">x\{flaskCount\}/);
});

test('sound controls live in the pause menu instead of consuming gameplay HUD space', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const pauseMenu = fs.readFileSync(path.join(root, 'components', 'PauseMenu.tsx'), 'utf8');
  const hud = fs.readFileSync(path.join(root, 'components', 'UIOverlay.tsx'), 'utf8');

  assert.match(pauseMenu, /Mission Settings/);
  assert.match(pauseMenu, /Game audio/);
  assert.match(app, /<PauseMenu/);
  assert.match(app, /audioService\.toggleMute\(\)/);
  assert.doesNotMatch(hud, /onClick=\{toggleMute\}/);
  assert.doesNotMatch(hud, /name=\{muted \? 'muted' : 'sound'\}/);
});

test('speed upgrades visibly evolve the player thruster palette and flame strength', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(source, /const PLAYER_THRUSTER_PALETTES = \[/);
  assert.match(source, /glow: '#22d3ee'/);
  assert.match(source, /glow: '#a78bfa'/);
  assert.match(source, /glow: '#facc15'/);
  assert.match(source, /const speedLevel = Math\.min\(6, Math\.max\(0, Math\.floor\(this\.stats\.upgrades\.speed \|\| 0\)\)\)/);
  assert.match(source, /const upgradeBoost = 1 \+ speedLevel \* 0\.055/);
  assert.match(source, /ctx\.shadowColor = palette\.glow/);
  assert.match(source, /drawPlayerThrusterUpgradeOverlay\(ctx: CanvasRenderingContext2D, e: Entity\)/);
  assert.match(source, /if \(speedLevel <= 0\) return/);
  assert.match(source, /this\.drawPlayerThrusterUpgradeOverlay\(ctx, e\)/);
});
