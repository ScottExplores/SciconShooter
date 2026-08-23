const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');

const modulePath = path.resolve(__dirname, '..', 'services', 'gameplay', 'EncounterCameraRuntime.ts');
const result = esbuild.buildSync({
  entryPoints: [modulePath],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
});
const loadRuntime = () => {
  const holder = { exports: {} };
  new Function('module', 'exports', result.outputFiles[0].text)(holder, holder.exports);
  return holder.exports;
};

test('mobile client coordinates map to logical Pixi display pixels independent of DPR', () => {
  const { mapEncounterClientPointToDisplay } = loadRuntime();
  const viewport = { left: 12, top: 96, width: 390, height: 844 };

  assert.deepEqual(
    mapEncounterClientPointToDisplay({
      clientX: 207,
      clientY: 518,
      viewport,
      displayWidth: 390,
      displayHeight: 844
    }),
    { x: 195, y: 422 }
  );

  // A 1.35x backing store is deliberately absent from the conversion. The
  // same finger location therefore remains centered rather than becoming
  // x=263/y=570 and pushing the ship below the finger.
  assert.deepEqual(
    mapEncounterClientPointToDisplay({
      clientX: 207,
      clientY: 518,
      viewport,
      displayWidth: 390,
      displayHeight: 844
    }),
    { x: 195, y: 422 }
  );
});

test('mobile client mapping clamps edges and composes with an encounter camera', () => {
  const {
    mapEncounterClientPointToDisplay,
    mapEncounterDisplayPointToWorld
  } = loadRuntime();
  const viewport = { left: 20, top: 80, width: 390, height: 844 };
  const display = mapEncounterClientPointToDisplay({
    clientX: 500,
    clientY: 0,
    viewport,
    displayWidth: 390,
    displayHeight: 844
  });
  assert.deepEqual(display, { x: 390, y: 0 });
  assert.deepEqual(
    mapEncounterDisplayPointToWorld({
      ...display,
      transform: { scale: 0.75, offsetX: -50, offsetY: 0, progress: 1, expanded: true },
      worldWidth: 700,
      worldHeight: 1126
    }),
    { x: 586.6666666666666, y: 0 }
  );
});
