const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'shipCarouselDrag.ts'),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  },
  fileName: 'shipCarouselDrag.ts'
}).outputText;
const runtimeModule = { exports: {} };
new Function('module', 'exports', 'require', compiled)(
  runtimeModule,
  runtimeModule.exports,
  require
);

const {
  SHIP_CAROUSEL_MIN_DRAG_STEP_PX,
  SHIP_CAROUSEL_MAX_DRAG_STEP_PX,
  getShipCarouselDragStep,
  resolveHeldCarouselDrag,
  resolveReleasedCarouselDrag
} = runtimeModule.exports;

const SHIPS = ['researchhub', 'bio', 'eth', 'btc'];

test('held drag crosses multiple ships before release and preserves the unconsumed distance', () => {
  assert.deepEqual(resolveHeldCarouselDrag(SHIPS, 'researchhub', -101, 100), {
    focusedItemId: 'bio',
    remainderX: -1,
    stepCount: 1
  });
  assert.deepEqual(resolveHeldCarouselDrag(SHIPS, 'researchhub', -201, 100), {
    focusedItemId: 'eth',
    remainderX: -1,
    stepCount: 2
  });
  assert.deepEqual(resolveHeldCarouselDrag(SHIPS, 'researchhub', -301, 100), {
    focusedItemId: 'btc',
    remainderX: -1,
    stepCount: 3
  });
});

test('held drag loops across either end of the ship order', () => {
  assert.deepEqual(resolveHeldCarouselDrag(SHIPS, 'researchhub', -401, 100), {
    focusedItemId: 'researchhub',
    remainderX: -1,
    stepCount: 4
  });
  assert.deepEqual(resolveHeldCarouselDrag(SHIPS, 'researchhub', 101, 100), {
    focusedItemId: 'btc',
    remainderX: 1,
    stepCount: -1
  });
  assert.deepEqual(resolveHeldCarouselDrag(SHIPS, 'researchhub', 401, 100), {
    focusedItemId: 'researchhub',
    remainderX: 1,
    stepCount: -4
  });
});

test('held drag reverses from crossed ships using the original gesture and recomputes its remainder', () => {
  const twoShipsLeft = resolveHeldCarouselDrag(SHIPS, 'researchhub', -220, 100);
  const reversedInsideOrigin = resolveHeldCarouselDrag(SHIPS, 'researchhub', -80, 100);
  const oneShipRight = resolveHeldCarouselDrag(SHIPS, 'researchhub', 125, 100);

  assert.deepEqual(twoShipsLeft, {
    focusedItemId: 'eth',
    remainderX: -20,
    stepCount: 2
  });
  assert.deepEqual(reversedInsideOrigin, {
    focusedItemId: 'researchhub',
    remainderX: -80,
    stepCount: 0
  });
  assert.deepEqual(oneShipRight, {
    focusedItemId: 'btc',
    remainderX: 25,
    stepCount: -1
  });
});

test('release selects the nearest ship symmetrically in both drag directions', () => {
  assert.equal(resolveReleasedCarouselDrag(SHIPS, 'researchhub', -49, 100).focusedItemId, 'researchhub');
  assert.equal(resolveReleasedCarouselDrag(SHIPS, 'researchhub', 49, 100).focusedItemId, 'researchhub');
  assert.equal(resolveReleasedCarouselDrag(SHIPS, 'researchhub', -50, 100).focusedItemId, 'bio');
  assert.equal(resolveReleasedCarouselDrag(SHIPS, 'researchhub', 50, 100).focusedItemId, 'btc');

  assert.deepEqual(resolveReleasedCarouselDrag(SHIPS, 'researchhub', -249, 100), {
    focusedItemId: 'eth',
    remainderX: -49,
    stepCount: 2
  });
  assert.deepEqual(resolveReleasedCarouselDrag(SHIPS, 'researchhub', -250, 100), {
    focusedItemId: 'btc',
    remainderX: 50,
    stepCount: 3
  });
  assert.deepEqual(resolveReleasedCarouselDrag(SHIPS, 'researchhub', 249, 100), {
    focusedItemId: 'eth',
    remainderX: 49,
    stepCount: -2
  });
  assert.deepEqual(resolveReleasedCarouselDrag(SHIPS, 'researchhub', 250, 100), {
    focusedItemId: 'bio',
    remainderX: -50,
    stepCount: -3
  });
});

test('drag spacing scales with the stage and remains inside its mobile-safe clamps', () => {
  assert.equal(getShipCarouselDragStep(0), SHIP_CAROUSEL_MIN_DRAG_STEP_PX);
  assert.equal(getShipCarouselDragStep(100), SHIP_CAROUSEL_MIN_DRAG_STEP_PX);
  assert.equal(getShipCarouselDragStep(200), 144);
  assert.equal(getShipCarouselDragStep(300), SHIP_CAROUSEL_MAX_DRAG_STEP_PX);
  assert.equal(getShipCarouselDragStep(10_000), SHIP_CAROUSEL_MAX_DRAG_STEP_PX);
});
