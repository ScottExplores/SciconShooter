const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('Helios runtime art is covered by the Test Bosses Sprite Gallery inventory', () => {
  const componentsRoot = path.join(
    root,
    'director-data',
    'prototype-assets',
    'helios-clawcarrier-v2',
    'components'
  );
  const componentNames = new Set(fs.readdirSync(componentsRoot));
  const required = [
    'body.closed.png',
    'body.open.png',
    'claw.port.shell.png',
    'claw.starboard.shell.png',
    'rotary.port.0.png',
    'rotary.starboard.0.png',
    'muzzle.flash.0.png',
    'leg.outer-port.png',
    'leg.inner-port.png',
    'leg.inner-starboard.png',
    'leg.outer-starboard.png',
    'mine.deploy.0.png',
    'gatling-tracer.0.png',
    'heavy-shell.0.png',
    'reactor-pellet.0.png'
  ];

  for (const name of required) {
    assert.ok(componentNames.has(name), `missing Helios runtime gallery source: ${name}`);
  }

  const sync = read('tools', 'sync-scicon-sprite-gallery.ps1');
  const verify = read('tools', 'verify-scicon-sprite-gallery.mjs');
  assert.match(sync, /Get-PrototypeSimpleCategories/);
  assert.match(sync, /Get-ProjectRuntimeGalleryCategories/);
  assert.match(sync, /pixi\/effects\/explosion\/frame-\[1-7\]/);
  assert.match(verify, /requiredHeliosPrototypeAssets/);
  assert.match(verify, /Helios mine explosion frames are not discoverable/);
});
