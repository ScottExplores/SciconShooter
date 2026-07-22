const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const startScreenSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'StartScreen.tsx'),
  'utf8'
);
const styleSource = fs.readFileSync(
  path.join(__dirname, '..', 'styles', 'tailwind.input.css'),
  'utf8'
);

test('home ship selection supports captured horizontal pointer swipes without turning taps into ship actions', () => {
  assert.match(startScreenSource, /onPointerDown=\{handleShipPointerDown\}/);
  assert.match(startScreenSource, /onPointerMove=\{handleShipPointerMove\}/);
  assert.match(startScreenSource, /onPointerUp=\{\(event\) => finishShipPointerGesture\(event\)\}/);
  assert.match(startScreenSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(startScreenSource, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(startScreenSource, /Math\.abs\(deltaX\) > Math\.abs\(deltaY\) \* 1\.15/);
  assert.match(startScreenSource, /cycleShip\(deltaX < 0 \? 1 : -1\)/);
  assert.match(startScreenSource, /suppressShipTapRef\.current = true/);
  assert.match(styleSource, /\.sci-ship-carousel-stage\s*\{[\s\S]*touch-action: pan-y/);
});

test('arrow, keyboard, and swipe navigation share the same directional bank transition', () => {
  assert.match(startScreenSource, /onClick=\{\(\) => cycleShip\(-1\)\}/);
  assert.match(startScreenSource, /onClick=\{\(\) => cycleShip\(1\)\}/);
  assert.match(startScreenSource, /event\.key === 'ArrowLeft' \? -1 : 1/);
  assert.match(startScreenSource, /direction === 1[\s\S]*'hard-left'[\s\S]*'bank-left'/);
  assert.match(startScreenSource, /'hard-right'[\s\S]*'bank-right'/);
  assert.match(startScreenSource, /PLAYER_SHIP_MOTION\[shipId\]\.steeringFrames\[steeringState\]/);
  assert.match(startScreenSource, /sci-ship-carousel-item--outgoing/);
  assert.match(startScreenSource, /sci-ship-carousel-item--incoming/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-next-in/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-next-out/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-previous-in/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-previous-out/);
});

test('carousel transitions preserve locked-ship selection rules and reduced-motion behavior', () => {
  assert.match(startScreenSource, /if \(isPlayerShipUnlocked\(nextShipId, shipUnlocks\)\) \{/);
  assert.match(startScreenSource, /prefersReducedMotion/);
  assert.match(startScreenSource, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sci-ship-carousel-item--outgoing[\s\S]*display: none/);
});
