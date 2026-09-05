const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/UIOverlay.tsx'), 'utf8');
const compiled = esbuild.buildSync({
  entryPoints: [path.join(root, 'components/UIOverlay.tsx')],
  bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['react', 'react-dom'], logLevel: 'silent'
});
const overlayModule = { exports: {} };
Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, overlayModule, overlayModule.exports);
const UIOverlay = overlayModule.exports.default;
const stats = {
  wave: 1, lives: 3, coins: 0, score: 0, bombs: 0, bombCharge: 0, bombChargeMax: 100,
  shipAbilityCooldown: 0, shipAbilityCooldownMax: 960,
  upgrades: { ability: 0, speed: 0, fireRate: 0 }, bossProgress: 0
};
const render = (props = {}) => renderToStaticMarkup(React.createElement(UIOverlay, {
  stats, showLabGlow: false, onDisableLabGlow() {}, onPause() {}, onUseBomb() {},
  onUseShipAbility() {}, onUpgrade() {}, selectedShipId: 'researchhub', fieldUpgradesEnabled: false,
  ...props
}));
const abilityButton = (html) => html.match(/<button[^>]*data-onboarding-target="flight-special"[\s\S]*?<\/button>/)[0];

test('the ability badge distinguishes ready, actual recharge, locked, and paused without a false one-second promise', () => {
  const ready = abilityButton(render());
  assert.match(ready, /data-ability-state="ready"/);
  assert.match(ready, />READY<\/span>/);
  assert.doesNotMatch(ready, /disabled=""/);
  for (const [frames, seconds] of [[1, 1], [60, 1], [61, 2], [960, 16]]) {
    const recharging = abilityButton(render({ stats: { ...stats, shipAbilityCooldown: frames } }));
    assert.match(recharging, /data-ability-state="recharging"/);
    assert.match(recharging, new RegExp(`>${seconds}s<\\/span>`));
    assert.match(recharging, /disabled=""/);
    assert.doesNotMatch(recharging, /1 seconds/);
  }
  for (const props of [{ shipAbilityLocked: true }, { paused: true }, { frozen: true }]) {
    const locked = abilityButton(render(props));
    assert.match(locked, /data-ability-state="locked"/);
    assert.match(locked, /disabled=""/);
    assert.match(locked, props.shipAbilityLocked ? />LOCKED<\/span>/ : />PAUSED<\/span>/);
    assert.doesNotMatch(locked, /ready in|>1s</);
  }
});

test('flask progress cannot flash an empty bomb, and preview unlimited bombs stay usable', () => {
  const html = render({ stats: { ...stats, bombCharge: 90 } });
  const bomb = html.match(/<button[^>]*data-onboarding-target="flight-bomb"[\s\S]*?<\/button>/)[0];
  assert.match(bomb, /disabled=""/);
  assert.doesNotMatch(bomb, /animate-ping/);
  const preview = render({ unlimitedBombs: true });
  const previewBomb = preview.match(/<button[^>]*data-onboarding-target="flight-bomb"[\s\S]*?<\/button>/)[0];
  assert.doesNotMatch(previewBomb, /disabled=""/);
  assert.match(previewBomb, /∞/);
});

const createActionHarness = ({ pointerEvents = true, disabled = false, onboardingTarget } = {}) => {
  const start = source.indexOf('const SYNTHETIC_TOUCH_CLICK_WINDOW_MS');
  const end = source.indexOf('\nconst UIOverlay:', start);
  assert.ok(start >= 0 && end > start);
  const hookSource = esbuild.transformSync(source.slice(start, end), { loader: 'tsx', target: 'es2020' }).code;
  const events = [];
  let activated = 0;
  const createHook = Function('useRef', 'window', 'CustomEvent', 'ONBOARDING_GAMEPLAY_ACTION_EVENT', 'Date',
    `${hookSource}\nreturn useMultitouchAction;`);
  const hook = createHook((value) => ({ current: value }), { PointerEvent: pointerEvents ? function () {} : undefined },
    class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, 'onboarding-action', { now: () => 1000 });
  const handlers = hook(() => { activated++; });
  const button = { disabled, dataset: { onboardingTarget }, dispatchEvent(event) { events.push(event); } };
  const event = { pointerType: 'touch', isPrimary: false, currentTarget: button, detail: 1, preventDefault() {} };
  return { handlers, event, events, count: () => activated };
};

test('secondary-finger pause activates on press once, without an onboarding action or synthesized double click', () => {
  assert.match(source, /const pauseActionHandlers = useMultitouchAction\(onPause\)/);
  assert.match(source, /\{\.\.\.pauseActionHandlers\}/);
  const harness = createActionHarness();
  harness.handlers.onPointerDown(harness.event);
  harness.handlers.onTouchStart(harness.event);
  harness.handlers.onPointerUp(harness.event);
  harness.handlers.onClick(harness.event);
  assert.equal(harness.count(), 1);
  assert.equal(harness.events.length, 0, 'pause is not a bomb/special onboarding action');
  harness.handlers.onClick({ ...harness.event, detail: 0 });
  assert.equal(harness.count(), 2, 'keyboard activation remains available');
});

test('legacy touch fallback deduplicates click and disabled controls reject every activation path', () => {
  const legacy = createActionHarness({ pointerEvents: false, onboardingTarget: 'flight-special' });
  legacy.handlers.onTouchStart(legacy.event);
  legacy.handlers.onTouchEnd();
  legacy.handlers.onClick(legacy.event);
  assert.equal(legacy.count(), 1);
  assert.deepEqual(legacy.events.map((event) => event.detail), [{ target: 'flight-special' }]);
  const disabled = createActionHarness({ pointerEvents: false, disabled: true });
  disabled.handlers.onPointerDown(disabled.event);
  disabled.handlers.onTouchStart(disabled.event);
  disabled.handlers.onClick({ ...disabled.event, detail: 0 });
  assert.equal(disabled.count(), 0);
  assert.equal(disabled.events.length, 0);
  const mouse = createActionHarness();
  mouse.handlers.onPointerDown({ ...mouse.event, pointerType: 'mouse' });
  assert.equal(mouse.count(), 0);
  mouse.handlers.onClick(mouse.event);
  assert.equal(mouse.count(), 1);
});

test('mobile HUD status needs no animation timer and pause retains a 44-pixel touch target', () => {
  const css = fs.readFileSync(path.join(root, 'components/game-stage.css'), 'utf8');
  assert.match(css, /\.scicon-pause-control\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(css, /\.scicon-ability-status\s*\{[^}]*pointer-events: none;/);
  assert.doesNotMatch(source, /setInterval|requestAnimationFrame|animate-ping/);
});
