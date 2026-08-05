const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const loadPreviewService = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'playerWeaponPreview.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const previewService = loadPreviewService();

test('Hangar previews a new hull before committing the selection', () => {
  const hangar = read('components', 'SquadHangar.tsx');
  const catalog = hangar.slice(
    hangar.indexOf('const renderMainCatalog = () =>'),
    hangar.indexOf('const renderMiniCatalog = () =>')
  );

  assert.match(hangar, /const \[weaponPreviewShipId, setWeaponPreviewShipId\] = useState<PlayerShipId \| null>\(null\)/);
  assert.match(catalog, /if \(selected\) \{\s*setMode\('upgrades'\);\s*return;\s*\}/);
  assert.match(catalog, /setWeaponPreviewShipId\(shipId\)/);
  assert.doesNotMatch(catalog, /onSelectMainShip\(shipId\)/);
  assert.match(hangar, /<ShipWeaponPreviewDialog[\s\S]*?onSelect=\{onSelectMainShip\}/);
  assert.match(hangar, /Tap a new ship to preview it/);
});

test('the selected hull has an explicit replay control above the fleet', () => {
  const hangar = read('components', 'SquadHangar.tsx');

  assert.match(hangar, /className="sci-weapon-spec-row"/);
  assert.match(hangar, /onClick=\{\(\) => setWeaponPreviewShipId\(mainShipId\)\}/);
  assert.match(hangar, />\s*Preview fire\s*<\/PixelActionButton>/);
  assert.match(hangar, /fireRateLevel=\{weaponPreviewShipId \? state\.shipUpgrades\[weaponPreviewShipId\]\.fireRate : 0\}/);
});

test('weapon preview reuses gameplay lane plans and the live base projectile families', () => {
  const preview = read('services', 'playerWeaponPreview.ts');

  assert.match(preview, /getBioPrimaryShotPlan/);
  assert.match(preview, /sampleTripleShotSideAngleRadians\(-1, MIDPOINT_SPREAD_SAMPLE\)/);
  assert.match(preview, /sampleTripleShotSideAngleRadians\(1, MIDPOINT_SPREAD_SAMPLE\)/);
  assert.match(preview, /getTightVolleyOffsets\(volleySize\)/);
  assert.match(preview, /getTightVolleyAngleOffsets\(volleySize\)/);
  assert.match(preview, /shipId === 'bio' \? 'bio-primary' : 'pulse'/);
  assert.match(preview, /PLAYER_SHIP_WEAPON_PREVIEW_SPECS/);

  const pack = path.join(root, 'public', 'game-art', 'generated', 'scicon-player-weapon-fx-v1');
  for (const family of ['research', 'bio']) {
    for (let frame = 1; frame <= 4; frame += 1) {
      assert.ok(fs.existsSync(path.join(pack, family, 'level-0', `frame-${frame}.png`)));
    }
  }
});

test('weapon preview cadence and travel duration match the live fixed-step weapon', () => {
  const near = (actual, expected) => assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${actual} should equal ${expected}`
  );

  near(previewService.getPlayerWeaponPreviewVolleyIntervalMs(0), 15 * 1000 / 60);
  near(previewService.getPlayerWeaponPreviewVolleyIntervalMs(49), 4 * 1000 / 60);
  near(
    previewService.PLAYER_WEAPON_PREVIEW_FLIGHT_MS,
    190 / 10 * 1000 / 60
  );
});

test('overlapping preview volleys are bounded across every hull and fire-rate extreme', () => {
  const shipIds = ['researchhub', 'bio', 'eth', 'btc'];
  for (const shipId of shipIds) {
    for (const level of [0, 49]) {
      const shots = previewService.getPlayerWeaponPreviewShots(shipId, level);
      const limit = previewService.getPlayerWeaponPreviewActiveVolleyLimit(level, shots);
      assert.ok(limit >= 1, `${shipId} L${level} keeps a visible volley`);
      assert.ok(
        limit <= previewService.PLAYER_WEAPON_PREVIEW_MAX_ACTIVE_VOLLEYS,
        `${shipId} L${level} stays inside the DOM volley cap`
      );
    }
  }

  assert.equal(previewService.getPlayerWeaponPreviewActiveVolleyLimit(
    49,
    previewService.getPlayerWeaponPreviewShots('researchhub', 49)
  ), 5);
  assert.equal(previewService.getPlayerWeaponPreviewActiveVolleyLimit(
    49,
    previewService.getPlayerWeaponPreviewShots('eth', 49)
  ), 6);
  assert.equal(previewService.getPlayerWeaponPreviewActiveVolleyLimit(
    49,
    previewService.getPlayerWeaponPreviewShots('bio', 49)
  ), 8);
});

test('weapon preview dialog is keyboard-safe, mobile-bounded, and reduced-motion aware', () => {
  const dialog = read('components', 'ShipWeaponPreviewDialog.tsx');
  const styles = read('styles', 'tailwind.input.css');

  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.key !== 'Tab'/);
  assert.match(dialog, /max-h-\[calc\(100svh-1\.5rem\)\]/);
  assert.match(dialog, /min-h-11 min-w-11/);
  assert.match(dialog, /selected \? 'Currently equipped' : `Equip/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.sci-hangar-weapon-preview__shot/);
  assert.match(styles, /@keyframes sci-hangar-shot-flight/);
});

test('reduced motion reacts to preference changes without creating animation timers', () => {
  const dialog = read('components', 'ShipWeaponPreviewDialog.tsx');
  const styles = read('styles', 'tailwind.input.css');
  const shipTimerIndex = dialog.indexOf('const shipTimer = window.setInterval');
  const volleyTimerIndex = dialog.indexOf('const volleyTimer = window.setInterval');
  const shipGuardIndex = dialog.lastIndexOf('if (!shipId || reducedMotion)', shipTimerIndex);
  const volleyGuardIndex = dialog.lastIndexOf('if (!shipId || reducedMotion)', volleyTimerIndex);
  const shotRule = styles.match(/\.sci-hangar-weapon-preview__shot \{([\s\S]*?)\}/)?.[1] ?? '';

  assert.match(dialog, /window\.matchMedia\(REDUCED_MOTION_QUERY\)/);
  assert.match(dialog, /addEventListener\('change', updatePreference\)/);
  assert.match(dialog, /removeEventListener\('change', updatePreference\)/);
  assert.ok(shipGuardIndex >= 0 && shipGuardIndex < shipTimerIndex);
  assert.ok(volleyGuardIndex > shipTimerIndex && volleyGuardIndex < volleyTimerIndex);
  assert.doesNotMatch(dialog, /projectileTimer/);
  assert.match(dialog, /projectileFrames\[projectileFrames\.length - 1\]/);
  assert.match(dialog, /reducedMotion \? STATIC_PREVIEW_VOLLEYS : activeVolleys/);
  assert.match(dialog, /data-reduced-motion=\{reducedMotion \? 'true' : 'false'\}/);
  assert.match(shotRule, /var\(--shot-flight-ms\)/);
  assert.doesNotMatch(shotRule, /infinite/);
});
