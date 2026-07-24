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
const pointerMoveSource = carouselSource.slice(
  carouselSource.indexOf('const handlePointerMove ='),
  carouselSource.indexOf('const snapToFocusedShip =')
);
const pointerFinishSource = carouselSource.slice(
  carouselSource.indexOf('const finishPointerGesture ='),
  carouselSource.indexOf('const handleKeyDown =')
);
const cycleShipSource = carouselSource.slice(
  carouselSource.indexOf('const cycleShip ='),
  carouselSource.indexOf('const handlePointerDown =')
);
const pointerDownSource = carouselSource.slice(
  carouselSource.indexOf('const handlePointerDown ='),
  carouselSource.indexOf('const handlePointerMove =')
);
const scrubSteeringSource = carouselSource.slice(
  carouselSource.indexOf('const getScrubSteeringState ='),
  carouselSource.indexOf('const getScrubItemStyle =')
);
const scrubItemsSource = carouselSource.slice(
  carouselSource.indexOf('const scrubItems ='),
  carouselSource.indexOf('\n\n  return (', carouselSource.indexOf('const scrubItems ='))
);
const pendingListenerSource = carouselSource.slice(
  carouselSource.indexOf('const clearPendingPointerListeners ='),
  carouselSource.indexOf('\n\n  useEffect(', carouselSource.indexOf('const clearPendingPointerListeners ='))
);

test('home ship selection continuously advances a captured horizontal pointer drag before release', () => {
  assert.match(carouselSource, /onPointerDown=\{handlePointerDown\}/);
  assert.match(carouselSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(carouselSource, /onPointerUp=\{\(event\) => finishPointerGesture\(event\)\}/);
  assert.match(carouselSource, /onPointerCancel=\{\(event\) => finishPointerGesture\(event, true\)\}/);
  assert.match(carouselSource, /onLostPointerCapture=\{\(event\) => finishPointerGesture\(event, true\)\}/);
  assert.match(carouselSource, /setPointerCapture\(event\.pointerId\)/);
  assert.match(carouselSource, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(carouselSource, /Math\.abs\(deltaX\) > Math\.abs\(deltaY\) \* 1\.15/);
  assert.match(pointerMoveSource, /resolveHeldCarouselDrag\(\s*shipIds,\s*gesture\.originShipId,\s*deltaX,\s*gesture\.stepPx\s*\)/);
  assert.match(pointerMoveSource, /resolution\.focusedItemId !== focusedShipIdRef\.current/);
  assert.match(pointerMoveSource, /setScrubFocusedShipId\(resolution\.focusedItemId\)/);
  assert.match(pointerMoveSource, /onFocusShip\(resolution\.focusedItemId\)/);
  assert.match(pointerMoveSource, /updateDragOffset\(resolution\.remainderX\)/);
  assert.match(pointerFinishSource, /resolveReleasedCarouselDrag\(shipIds, gesture\.originShipId, deltaX, gesture\.stepPx\)/);
  assert.match(pointerFinishSource, /snapToFocusedShip\(resolution\.focusedItemId, resolution\.remainderX, direction\)/);
  assert.doesNotMatch(pointerFinishSource, /cycleShip\(/);
  assert.match(carouselSource, /suppressTapRef\.current = true/);
  assert.match(styleSource, /\.sci-ship-carousel-stage\s*\{[\s\S]*touch-action: pan-y/);
});

test('pointerdown owns a tap-safe pending interaction before any drag or timed transition can start', () => {
  assert.match(carouselSource, /type ShipCarouselInteraction = 'idle' \| 'pending' \| 'timed' \| 'drag' \| 'snap'/);
  assert.match(pointerDownSource, /if \(interactionRef\.current !== 'idle'\) return/);
  assert.match(pointerDownSource, /if \(swipeGestureRef\.current !== null\) return/);
  assert.match(pointerDownSource, /interactionRef\.current = 'pending'/);
  assert.doesNotMatch(pointerDownSource, /setPointerCapture\(/);
  assert.match(cycleShipSource, /interactionRef\.current === 'pending'[\s\S]*return/);
  assert.match(
    pointerMoveSource,
    /if \(interactionRef\.current !== 'pending' \|\| transitionRef\.current\) \{[\s\S]*swipeGestureRef\.current = null;[\s\S]*return;[\s\S]*gesture\.horizontal = true;[\s\S]*setPointerCapture\(event\.pointerId\);[\s\S]*interactionRef\.current = 'drag'/
  );
});

test('pending contact cleans up outside releases while preserving an ordinary active-ship click', () => {
  assert.match(carouselSource, /const pendingPointerEndRef = useRef<\(\(event: PointerEvent\) => void\) \| null>\(null\)/);
  assert.match(pendingListenerSource, /window\.removeEventListener\('pointerup', handler\)/);
  assert.match(pendingListenerSource, /window\.removeEventListener\('pointercancel', handler\)/);
  assert.match(pendingListenerSource, /pendingPointerEndRef\.current = null/);
  assert.match(pointerDownSource, /const clearPendingContact = \(nativeEvent: PointerEvent\) =>/);
  assert.match(pointerDownSource, /if \(nativeEvent\.pointerId !== pointerId\) return/);
  assert.match(pointerDownSource, /if \(!activeGesture \|\| activeGesture\.pointerId !== pointerId \|\| activeGesture\.horizontal\) return/);
  assert.match(pointerDownSource, /swipeGestureRef\.current = null;[\s\S]*interactionRef\.current = 'idle'/);
  assert.match(pointerDownSource, /pendingPointerEndRef\.current = clearPendingContact/);
  assert.match(pointerDownSource, /window\.addEventListener\('pointerup', clearPendingContact\)/);
  assert.match(pointerDownSource, /window\.addEventListener\('pointercancel', clearPendingContact\)/);
  assert.match(pointerFinishSource, /clearPendingPointerListeners\(\)/);
  assert.match(
    carouselSource,
    /onClick=\{\(\) => \{[\s\S]*if \(suppressTapRef\.current \|\| transition \|\| isSnapping\)[\s\S]*onActivateFocusedShip\(\)/
  );
});

test('held dragging renders both neighbors and exposes stable snap state for browser verification', () => {
  assert.match(carouselSource, /const scrubItems = isScrubbing && dragDirection !== null/);
  assert.match(carouselSource, /role: 'outgoing' as const/);
  assert.match(carouselSource, /role: 'active' as const/);
  assert.match(carouselSource, /role: 'incoming' as const/);
  assert.match(carouselSource, /isScrubbing \? scrubItems\.map\(\(item\) =>/);
  assert.match(carouselSource, /sci-ship-carousel-item--scrubbing/);
  assert.match(carouselSource, /data-carousel-role=\{item\.role\}/);
  assert.match(carouselSource, /const snapToFocusedShip =/);
  assert.match(carouselSource, /requestAnimationFrame\(\(\) =>/);
  assert.match(carouselSource, /SHIP_CAROUSEL_SNAP_MS \+ 40/);
  assert.match(carouselSource, /data-focused-ship=\{displayFocusedShipId\}/);
  assert.match(carouselSource, /data-dragging=\{isDragging \? 'true' : 'false'\}/);
  assert.match(carouselSource, /data-snapping=\{isSnapping \? 'true' : 'false'\}/);
  assert.match(carouselSource, /data-drag-offset=\{Math\.round\(dragOffset\)\}/);
  assert.match(carouselSource, /aria-busy=\{Boolean\(transition\) \|\| isSnapping\}/);
});

test('scrub neighbors keep canonical previous and next positions across drag rebases and reversals', () => {
  assert.match(
    scrubItemsSource,
    /shipId: getLoopedShipId\(shipIds, displayFocusedShipId, -1\),[\s\S]*role: 'outgoing' as const,[\s\S]*offsetX: dragOffset - dragStepPx/
  );
  assert.match(
    scrubItemsSource,
    /shipId: displayFocusedShipId,[\s\S]*role: 'active' as const,[\s\S]*offsetX: dragOffset/
  );
  assert.match(
    scrubItemsSource,
    /shipId: getLoopedShipId\(shipIds, displayFocusedShipId, 1\),[\s\S]*role: 'incoming' as const,[\s\S]*offsetX: dragOffset \+ dragStepPx/
  );
  assert.doesNotMatch(scrubItemsSource, /getLoopedShipId\([^\n]*dragDirection/);
});

test('scrub steering is derived from each item position with neutral, bank, and hard frames', () => {
  assert.match(scrubSteeringSource, /Math\.abs\(offsetX\) \/ Math\.max\(1, dragStepPx\)/);
  assert.match(scrubSteeringSource, /if \(positionProgress < 0\.18\) return 'neutral'/);
  assert.match(scrubSteeringSource, /if \(positionProgress < 0\.58\) return offsetX < 0 \? 'bank-left' : 'bank-right'/);
  assert.match(scrubSteeringSource, /return offsetX < 0 \? 'hard-left' : 'hard-right'/);
  assert.doesNotMatch(scrubSteeringSource, /dragDirection/);
  assert.match(scrubItemsSource, /steeringState: getScrubSteeringState\(dragOffset - dragStepPx\)/);
  assert.match(scrubItemsSource, /steeringState: isSnapping \? null : getScrubSteeringState\(dragOffset\)/);
  assert.match(scrubItemsSource, /steeringState: getScrubSteeringState\(dragOffset \+ dragStepPx\)/);
});

test('arrow, keyboard, and swipe navigation share opposite authored bank-frame sequences', () => {
  assert.match(carouselSource, /onClick=\{\(\) => cycleShip\(-1\)\}/);
  assert.match(carouselSource, /onClick=\{\(\) => cycleShip\(1\)\}/);
  assert.match(carouselSource, /event\.key === 'ArrowLeft' \? -1 : 1/);
  assert.match(carouselSource, /phase === 'edge'\) return \{ outgoing: 'neutral', incoming: 'hard-right' \}/);
  assert.match(carouselSource, /phase === 'bank'\) return \{ outgoing: 'bank-left', incoming: 'bank-right' \}/);
  assert.match(carouselSource, /phase === 'crossing'\) return \{ outgoing: 'hard-left', incoming: 'bank-right' \}/);
  assert.match(carouselSource, /return \{ outgoing: 'hard-left', incoming: 'neutral' \}/);
  assert.match(carouselSource, /phase === 'edge'\) return \{ outgoing: 'neutral', incoming: 'hard-left' \}/);
  assert.match(carouselSource, /phase === 'bank'\) return \{ outgoing: 'bank-right', incoming: 'bank-left' \}/);
  assert.match(carouselSource, /phase === 'crossing'\) return \{ outgoing: 'hard-right', incoming: 'bank-left' \}/);
  assert.match(carouselSource, /return \{ outgoing: 'hard-right', incoming: 'neutral' \}/);
  assert.match(carouselSource, /PLAYER_SHIP_MOTION\[shipId\]\.steeringFrames\[steeringState\]/);
  assert.match(carouselSource, /sci-ship-carousel-item--outgoing/);
  assert.match(carouselSource, /sci-ship-carousel-item--incoming/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-next-in/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-next-out/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-previous-in/);
  assert.match(styleSource, /@keyframes sci-ship-carousel-previous-out/);
  assert.match(carouselSource, /PLAYER_SHIP_MOTION\[shipId\]\.selectionIdleFrames\[0\]/);
  assert.doesNotMatch(carouselSource, /PLAYER_SHIPS\[shipId\]\.assetUrl/);
});

test('carousel loops, queues repeated input in flight, and preserves locked-ship and reduced-motion behavior', () => {
  assert.match(carouselSource, /\(currentIndex \+ direction \+ shipIds\.length\) % shipIds\.length/);
  assert.match(carouselSource, /SHIP_CAROUSEL_MAX_QUEUED_STEPS = 8/);
  assert.match(carouselSource, /queuedDirectionsRef\.current\.push\(direction\)/);
  assert.match(carouselSource, /const queuedDirection = queuedDirectionsRef\.current\.shift\(\)/);
  assert.match(carouselSource, /startShipTransition\(nextShipId, queuedDirection\)/);
  assert.match(carouselSource, /disabled=\{!framesReady\}/);
  assert.doesNotMatch(carouselSource, /disabled=\{Boolean\(transition\) \|\| !framesReady\}/);
  assert.match(startScreenSource, /onSettleShip=\{\(shipId\) => \{[\s\S]*isPlayerShipUnlocked\(shipId, shipUnlocks\)/);
  assert.match(startScreenSource, /renderHeroPanel\(\{ compact: true, fill: true \}\)/);
  assert.doesNotMatch(startScreenSource, /<HeroPanel/);
  assert.match(carouselSource, /prefersReducedMotion/);
  assert.match(carouselSource, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(carouselSource, /SHIP_CAROUSEL_TRANSITION_MS = 540/);
  assert.match(carouselSource, /SHIP_CAROUSEL_SETTLE_PHASE_MS = 475/);
  assert.doesNotMatch(carouselSource, /rotate\(/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sci-ship-carousel-item--outgoing[\s\S]*display: none/);
});
