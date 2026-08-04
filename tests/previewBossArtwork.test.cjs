const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const canvasSource = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
const editorSource = fs.readFileSync(path.join(root, 'components', 'GameEditorCanvas.tsx'), 'utf8');
const rendererSource = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
);
const environmentSource = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiEnvironment.ts'),
  'utf8'
);
const exclusionSource = fs.readFileSync(
  path.join(root, 'tools', 'assert-director-excluded.mjs'),
  'utf8'
);

test('preview overrides and promoted campaign boss artwork share the canonical canvas', () => {
  assert.match(editorSource, /previewBossArtwork/);
  assert.match(editorSource, /onReady/);
  assert.match(editorSource, /onInitializationError/);
  assert.match(canvasSource, /resolveCampaignBossArtwork/);
  assert.match(canvasSource, /previewBossArtwork \?\? resolveCampaignBossArtwork/);
  assert.match(canvasSource, /previewBossArtwork: setupBossArtwork/);
  assert.match(rendererSource, /entity\.sourceEventId !== this\.previewBossArtwork\?\.eventId/);
  assert.match(rendererSource, /usesStandaloneBossArt/);
  assert.doesNotMatch(rendererSource, /meridian-harrower|director-data|__director/);
});

test('an unmounted preview cannot resume environment setup after asynchronous preload', () => {
  assert.match(environmentSource, /await this\.preloadProfileWindow\(profileWindow, true\);\s+if \(this\.destroyed\) return;/);
  assert.match(environmentSource, /destroy\(\) \{\s+if \(this\.destroyed\) return;\s+this\.destroyed = true;/);
  assert.match(canvasSource, /setupRuntime\(\)\.catch\(\(error\) => \{\s+if \(disposed\) return;/);
});

test('production exclusion rejects every local animated prototype asset filename', () => {
  assert.match(exclusionSource, /forbiddenPrototypeAssetBasenames/);
  assert.match(exclusionSource, /meridian-harrower-assembled/);
  assert.match(exclusionSource, /meridian-harrower-modular-sheet/);
  assert.match(exclusionSource, /helios-clawcarrier-assembled/);
  assert.match(exclusionSource, /helios-clawcarrier-modular-sheet/);
  assert.match(exclusionSource, /aurora-storm-engine-assembled/);
  assert.match(exclusionSource, /aurora-storm-engine-modular-sheet/);
  assert.match(exclusionSource, /umbra-needlewing-assembled/);
  assert.match(exclusionSource, /umbra-needlewing-modular-sheet/);
  assert.match(exclusionSource, /cinderjaw-siege-beetle-assembled/);
  assert.match(exclusionSource, /cinderjaw-siege-beetle-modular-sheet/);
  assert.match(exclusionSource, /vesperglass-mothmother-assembled/);
  assert.match(exclusionSource, /vesperglass-mothmother-modular-sheet/);
  assert.match(exclusionSource, /twin-halo-wardens-assembled/);
  assert.match(exclusionSource, /twin-halo-wardens-modular-sheet/);
  assert.match(exclusionSource, /riftcoil-wyrm-assembled/);
  assert.match(exclusionSource, /riftcoil-wyrm-modular-sheet/);
  assert.match(exclusionSource, /gloamforge-mantis-neutral/);
  assert.match(exclusionSource, /gloamforge-mantis-atlas/);
  assert.match(exclusionSource, /gloamforge-mantis/);
  assert.match(
    exclusionSource,
    /forbiddenPrototypeAssetBasenames\.some\(\(basename\) => lowerRelative\.includes\(basename\)\)/
  );
});
