const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('pixel action buttons retain live labels over transparent generated presentation layers', () => {
  const component = read('components', 'PixelActionButton.tsx');
  const startScreen = read('components', 'StartScreen.tsx');
  const assets = [
    'upgrade-panel.png',
    'start-mission-panel.png'
  ];

  assert.match(component, /data-upgrade-ready=\{!disabled && ready \? 'true' : 'false'\}/);
  assert.match(component, /data-shine=\{!disabled && shine \? 'true' : 'false'\}/);
  assert.match(component, /sci-pixel-action__content/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(startScreen, /<PixelActionButton[\s\S]*?tone="green"[\s\S]*?ready[\s\S]*?shine[\s\S]*?min-h-\[4\.25rem\][\s\S]*?<span>Start Mission<\/span>/);

  assets.forEach((name) => {
    const assetPath = path.join(root, 'public', 'game-art', 'generated', 'ui', 'scicon-pixel-action-buttons-v1', name);
    assert.ok(fs.existsSync(assetPath), `${name} must ship with the UI`);
    const png = fs.readFileSync(assetPath);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png[25], 6, `${name} must retain RGBA transparency`);
  });
});

test('Hangar readiness follows exact affordability, ownership, equip, and max-level state', () => {
  const hangar = read('components', 'SquadHangar.tsx');

  assert.match(hangar, /level < maxLevel && \(founderSandbox \|\| \(Number\.isFinite\(cost\) && state\.coins >= cost\)\)/);
  assert.match(hangar, /activeMainUpgradeReady = MAIN_SHIP_UPGRADES\.some/);
  assert.match(hangar, /activeMiniOwned[\s\S]*?activeMiniLevel < MINI_SHIP_MAX_LEVEL[\s\S]*?state\.coins >= activeMiniUpgradeCost/);
  assert.match(hangar, /!activeMiniOwned[\s\S]*?state\.coins >= activeMini\.purchaseCost/);
  assert.match(hangar, /const slotUnlockReady = !unlocked && \(founderSandbox \|\| state\.coins >= unlockCost\)/);
  assert.doesNotMatch(hangar, /ready=\{!activeMiniEquipped\}/);
  assert.match(hangar, /disabled=\{activeMiniEquipped\}/);
  assert.match(hangar, /ready=\{!atMax && state\.coins >= cost\}/);
  assert.match(hangar, /disabled=\{atMax \|\| state\.coins < cost\}/);
  assert.match(hangar, /ready=\{activeMiniUpgradeReady\}/);
  assert.match(hangar, /ready=\{activeMiniUnlockReady\}/);
  assert.ok((hangar.match(/disabled=\{!founderSandbox && state\.coins < activeMini\.purchaseCost\}/g) || []).length >= 2);
});

test('eligibility aura expands outside the layout, retains an interior glow, and respects reduced motion', () => {
  const styles = read('styles', 'tailwind.input.css');
  const pulseStart = styles.indexOf('@keyframes sci-pixel-ready-pulse');
  const pulseEnd = styles.indexOf('@keyframes sci-pixel-ready-interior');
  const pulse = styles.slice(pulseStart, pulseEnd);

  assert.match(pulse, /drop-shadow\(7px 0 0/);
  assert.match(pulse, /color-mix\(in srgb, var\(--sci-pixel-edge\) 0%, transparent\)/);
  assert.match(pulse, /drop-shadow\(2px 0 0/);
  assert.doesNotMatch(pulse, /scale\(/);
  assert.match(styles, /animation: sci-pixel-ready-pulse 1\.75s ease-out infinite/);
  assert.match(styles, /\.sci-pixel-action\[data-upgrade-ready='true'\]::before \{\s*animation: sci-pixel-ready-interior 1\.75s ease-in-out infinite/);
  assert.match(styles, /sci-upgrade-ready-frame-pulse 1\.75s ease-out infinite/);
  assert.match(styles, /animation: sci-pixel-shine-sweep 3\.4s ease-in-out infinite/);
  assert.match(styles, /skewX\(-22deg\)/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*?animation: none/);
  assert.match(styles, /image-rendering: pixelated/);
  assert.match(styles, /--sci-pixel-mid: #facc15/);
  assert.match(styles, /--sci-pixel-mid: #10d99a/);
  assert.match(styles, /--sci-pixel-rail: #22d3ee/);
});
