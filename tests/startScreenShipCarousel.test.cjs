const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const carouselSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'ShipCarousel.tsx'),
  'utf8'
);
const startScreenSource = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'StartScreen.tsx'),
  'utf8'
);
const styleSource = fs.readFileSync(
  path.join(__dirname, '..', 'styles', 'tailwind.input.css'),
  'utf8'
);

test('home ship selection supports captured horizontal pointer swipes without turning taps into ship actions', () => {
  assert.match(carouselSource, /onPointerDown=\{handlePointerDown\}/);
  assert.match(carouselSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(carouselSource, /onPointerUp=\{\(event\) => finishPointerGesture\(event\)\}/);
  assert.match(carouselSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(carouselSource, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(carouselSource, /Math\.abs\(deltaX\) > Math\.abs\(deltaY\) \* 1\.15/);
  assert.match(carouselSource, /cycleShip\(deltaX < 0 \? 1 : -1\)/);
  assert.match(carouselSource, /suppressTapRef\.current = true/);
  assert.match(styleSource, /\.sci-ship-carousel-stage\s*\{[\s\S]*touch-action: pan-y/);
});

test('arrow, keyboard, and swipe navigation share opposite authored bank-frame sequences', () => {
  assert.match(carouselSource, /onClick=\{\(\) => cycleShip\(-1\)\}/);
  assert.match(carouselSource, /onClick=\{\(\) => cycleShip\(1\)\}/);
  assert.match(carouselSource, /event\.key === 'ArrowLeft' \? -1 : 1/);
  assert.match(carouselSource, /phase === 'edge'\) return \{ outgoing: 'neutral', incoming: 'hard-right' \}/);
  assert.match(carouselSource, /phase === 'bank'\) return \{ outgoing: 'bank-left', incoming: 'bank-right' \}/);
  assert.match(carouselSource, /return \{ outgoing: 'hard-left', incoming: 'neutral' \}/);
  assert.match(carouselSource, /phase === 'edge'\) return \{ outgoing: 'neutral', incoming: 'hard-left' \}/);
  assert.match(carouselSource, /phase === 'bank'\) return \{ outgoing: 'bank-right', incoming: 'bank-left' \}/);
  assert.match(carouselSource, /return \{ outgoing: 'hard-right', incoming: 'neutral' \}/);
  assert.match(carouselSource, /PLAYER_SHIP_MOTION\[shipId\]\.steeringFrames\[steeringState\]/);
  assert.match(carouselSource, /sci-ship-carousel-item--outgoing/);
  assert.match(carouselSource, /sci-ship-carousel-item--incoming/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-next-in/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-next-out/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-previous-in/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-previous-out/);
});

test('carousel loops, locks input in flight, and preserves locked-ship and reduced-motion behavior', () => {
  assert.match(carouselSource, /\(currentIndex \+ direction \+ shipIds\.length\) % shipIds\.length/);
  assert.match(carouselSource, /if \(transition \|\| !framesReady \|\| shipIds\.length < 2\) return/);
  assert.match(startScreenSource, /onSettleShip=\{\(shipId\) => \{[\s\S]*isPlayerShipUnlocked\(shipId, shipUnlocks\)/);
  assert.match(carouselSource, /prefersReducedMotion/);
  assert.match(carouselSource, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(carouselSource, /SHIP_CAROUSEL_TRANSITION_MS = 540/);
  assert.doesNotMatch(carouselSource, /rotate\(/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sci-ship-carousel-item--outgoing[\s\S]*display: none/);
});
