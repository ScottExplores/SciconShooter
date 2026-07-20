const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('one pointer exclusively owns ship steering while secondary pointer events remain available to the HUD', () => {
  const canvas = read('components/GameCanvas.tsx');

  assert.match(canvas, /if \(activePointerIdRef\.current !== null\) return;/);
  assert.match(canvas, /canvas\.setPointerCapture\(e\.pointerId\)/);
  assert.match(canvas, /activePointerIdRef\.current === null \|\| e\.pointerId !== activePointerIdRef\.current/);
  assert.match(canvas, /const supportsPointerEvents = typeof window\.PointerEvent !== 'undefined'/);
  assert.match(canvas, /if \(supportsPointerEvents\) \{[\s\S]*addEventListener\('pointerdown'/);
  assert.match(canvas, /\} else \{[\s\S]*addEventListener\('touchstart'/);
  assert.doesNotMatch(canvas, /activeTouchIdRef\.current = fallbackTouch\.identifier/);
});

test('legacy touch cleanup only ends steering when the tracked steering contact ends', () => {
  const canvas = read('components/GameCanvas.tsx');

  assert.match(canvas, /const includesTrackedTouch = \(touches: TouchList\)/);
  assert.match(canvas, /if \(!includesTrackedTouch\(e\.changedTouches\)\) return;/);
  assert.match(canvas, /Ending a HUD tap must not release the separate steering finger/);
});

test('bomb and ship ability activate directly for secondary touch pointers without double-firing click', () => {
  const hud = read('components/UIOverlay.tsx');

  assert.match(hud, /const useMultitouchAction = \(onActivate\?: \(\) => void\)/);
  assert.match(hud, /event\.pointerType !== 'touch'.*event\.pointerType !== 'pen'/);
  assert.match(hud, /suppressSyntheticClickUntilRef\.current = Date\.now\(\) \+ SYNTHETIC_TOUCH_CLICK_WINDOW_MS/);
  assert.match(hud, /event\.detail > 0[\s\S]*Date\.now\(\) <= suppressSyntheticClickUntilRef\.current/);
  assert.match(hud, /const bombActionHandlers = useMultitouchAction\(onUseBomb\)/);
  assert.match(hud, /const shipAbilityActionHandlers = useMultitouchAction\(onUseShipAbility\)/);
  assert.match(hud, /\{\.\.\.bombActionHandlers\}/);
  assert.match(hud, /\{\.\.\.shipAbilityActionHandlers\}/);
});
