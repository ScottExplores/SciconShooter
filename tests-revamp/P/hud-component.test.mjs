import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const bundle = buildSync({
  stdin: { contents: "export { default as UIOverlay } from './components/UIOverlay'; export { default as WingSupportHud } from './components/revamp/WingSupportHud';", resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' }, logLevel: 'silent'
});
const compiled = { exports: {} };
Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, compiled, compiled.exports);
const { UIOverlay, WingSupportHud } = compiled.exports;
const noop = () => {};
const wing = (slot, cooldownFrames = 0) => ({ slot, id: slot, image: '/game-art/powerups/rapid-fire.png', level: 1, special: 'laser-lance', label: 'Laser Lance', evolved: false, ready: cooldownFrames === 0, cooldownFrames, cooldownMax: 960 });
const snapshot = { enabled: true, autoCast: true, wings: [wing('left'), wing('right', 61)] };

function render(stats = {}) {
  return renderToStaticMarkup(React.createElement(UIOverlay, {
    stats: { wave: 1, lives: 3, coins: 8, score: 990, bombs: 2, bombCharge: 0, shipAbilityCooldown: 0, upgrades: { ability: 0 }, ...stats },
    showLabGlow: false, onDisableLabGlow: noop, onPause: noop, onUseBomb: noop, onUpgrade: noop, selectedShipId: 'researchhub', onUseShipAbility: noop, fieldUpgradesEnabled: false,
    wingControls: React.createElement(WingSupportHud, { snapshot, onCast: noop, onAutoCastChange: noop })
  }));
}

test('both wing specials fit the HUD composition while retaining full accessible cooldown state', () => {
  const html = render();
  assert.equal((html.match(/class="revamp-wing-hud"/g) || []).length, 1);
  assert.match(html, /aria-label="Offense wing: Laser Lance, ready"/);
  assert.match(html, /disabled=""[^>]*aria-label="Utility wing: Laser Lance, 2 seconds"/);
  assert.match(html, /aria-pressed="true" aria-label="Auto-cast wing specials"/);
  assert.match(html, /scicon-thumb-button--bomb/);
  assert.match(html, /scicon-thumb-button--ability/);
  assert.ok(html.indexOf('revamp-wing-hud') < html.indexOf('scicon-top-pause'));
});

test('large score and token counts abbreviate visually while full amounts remain accessible', () => {
  const html = render({ score: 123456789, coins: 1234567 });
  assert.match(html, /aria-label="Score 123456789"/);
  assert.match(html, /title="123456789">123M/);
  assert.match(html, /title="1234567">x1.2M/);
  assert.match(html, /aria-label="[^"]*1,234,567[^\"]*collected this match"/);
  const small = render();
  assert.match(small, /revamp-hud-counter">x8</);
  assert.match(small, /revamp-hud-counter">000990</);
});

test('wing buttons preserve slot and auto preference commands and disabled presentation', () => {
  const casts = [], autos = [];
  const element = WingSupportHud({ snapshot, onCast: slot => casts.push(slot), onAutoCastChange: enabled => autos.push(enabled) });
  const [wings, auto] = element.props.children;
  wings[0].props.onClick();
  auto.props.onClick();
  assert.deepEqual(casts, ['left']);
  assert.deepEqual(autos, [false]);
  assert.equal(wings[1].props.disabled, true);
  const locked = WingSupportHud({ snapshot, disabled: true, onCast: noop, onAutoCastChange: noop });
  assert.ok(locked.props.children[0].every(button => button.props.disabled));
  assert.equal(locked.props.children[1].props.disabled, true);
  assert.equal(WingSupportHud({ snapshot: { ...snapshot, enabled: false }, onCast: noop, onAutoCastChange: noop }), null);
});
