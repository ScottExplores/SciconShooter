const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'components', 'living-ui.css'), 'utf8');

const durations = (name) => [...css.matchAll(new RegExp(`${name}\\s+([\\d.]+)(ms|s)`, 'g'))]
  .map(([, value, unit]) => Number(value) * (unit === 'ms' ? 0.001 : 1));

test('home ship hover is a slow smooth bob without a strobing glow', () => {
  const hover = durations('sci-living-ship-hover');
  assert.ok(hover.length > 0);
  for (const seconds of hover) assert.ok(seconds >= 3, `ship hover ${seconds}s is too fast`);
  assert.doesNotMatch(css, /sci-living-ship-hover[^;]*steps\(/);
  const keyframes = css.slice(css.indexOf('@keyframes sci-living-ship-hover'));
  const body = keyframes.slice(0, keyframes.indexOf('\n}\n'));
  assert.doesNotMatch(body, /filter|opacity/);
});

test('home reward glows pulse slower than once a second and stop under reduced motion', () => {
  for (const name of ['sci-reward-edge-claimable', 'sci-dashboard-reward-frame', 'sci-dashboard-reward-dot']) {
    const values = durations(name);
    assert.ok(values.length > 0, `${name} is overridden`);
    for (const seconds of values) assert.ok(seconds >= 3, `${name} ${seconds}s is too fast`);
  }
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.sci-reward-edge-trigger--claimable', '.sci-dashboard-reward-ready', '.sci-hangar-weapon-preview__ship']) {
    assert.ok(reduced.includes(selector), `${selector} stops under reduced motion`);
  }
});

test('home ship does not swap img src every tick and home loops keep brightness steady', () => {
  const fsx = require('node:fs'); const px = require('node:path');
  const carousel = fsx.readFileSync(px.join(__dirname, '../components/ShipCarousel.tsx'), 'utf8');
  const body = carousel.slice(carousel.indexOf('const PlayerShipSelectionImage'), carousel.indexOf('interface ShipCarouselProps'));
  assert.ok(!/setInterval/.test(body));
  const css = fsx.readFileSync(px.join(__dirname, '../components/living-ui.css'), 'utf8');
  for (const k of ['sci-home-nebula-drift-a', 'sci-pixel-fixture-breathe', 'sci-dashboard-active-frame', 'sci-weekly-fixture-pulse-a']) {
    assert.ok(css.includes(`@keyframes ${k}{`), k);
  }
});
