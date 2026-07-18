const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('the shared editor HUD toggles between pause and resume', () => {
  const editorCanvas = read('components/GameEditorCanvas.tsx');
  const hud = read('components/UIOverlay.tsx');

  assert.match(editorCanvas, /paused: !playing/);
  assert.match(editorCanvas, /onPause: \(\) => onPlayingChange\?\.\(!playing\)/);
  assert.match(hud, /paused = false/);
  assert.match(hud, /aria-label=\{paused \? 'Resume mission' : 'Pause mission'\}/);
  assert.match(hud, /src=\{paused \? compactHudAssets\.pauseSelected : compactHudAssets\.pauseNormal\}/);
});
