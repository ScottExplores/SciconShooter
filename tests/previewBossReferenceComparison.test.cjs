const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const loadTypeScriptModule = (relativePath) => {
  const compiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, exports: moduleBox.exports, require, Math, Number, Object }
  );
  return moduleBox.exports;
};

const comparisonModule = loadTypeScriptModule(
  'services/pixi/boss-rigs/PreviewBossReferenceComparison.ts'
);
const previewSession = loadTypeScriptModule('services/gameplay/previewSession.ts');
const artworkAssets = loadTypeScriptModule(
  'director/src/tools/bosses/bossSandboxArtworkAssets.ts'
);

test('reference comparison fits the crop to the live modular center and height', () => {
  const descriptor = {
    kind: comparisonModule.MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
    url: '/review-only/reference.png',
    contentHash: 'a'.repeat(64),
    width: 394,
    height: 271,
    provenance: 'fixture',
    landmarks: [{
      id: 'core',
      label: 'Core',
      reference: { xRatio: 0.5, yRatio: 0.6 },
      rig: { kind: 'normalized-design-point', xRatio: 0.5, yRatio: 0.4 }
    }]
  };
  const layout = comparisonModule.resolvePreviewBossReferenceComparisonLayout(
    descriptor,
    { width: 720, height: 620 }
  );

  assert.ok(layout);
  assert.equal(layout.centerX, 0);
  assert.equal(layout.centerY, 0);
  assert.equal(layout.height, 620);
  assert.ok(Math.abs(layout.width - (620 * 394 / 271)) < 1e-9);
  assert.equal(layout.landmarks.length, 1);
  assert.equal(layout.landmarks[0].referenceX, 0);
  assert.equal(layout.landmarks[0].rigX, 0);
  assert.ok(layout.landmarks[0].referenceY > layout.landmarks[0].rigY);
});

test('socket-linked comparison landmarks follow the current resolved rig', () => {
  const descriptor = {
    kind: comparisonModule.MODULAR_BOSS_REFERENCE_COMPARISON_KIND,
    url: '/review-only/reference.png',
    contentHash: 'a'.repeat(64),
    width: 394,
    height: 271,
    provenance: 'fixture',
    landmarks: [{
      id: 'muzzle',
      label: 'Muzzle',
      reference: { xRatio: 0.25, yRatio: 0.75 },
      rig: { kind: 'socket', socketId: 'heavy-muzzle-port' }
    }]
  };
  const layout = comparisonModule.resolvePreviewBossReferenceComparisonLayout(
    descriptor,
    { width: 460, height: 330 }
  );

  assert.ok(layout);
  assert.equal(layout.landmarks[0].rigSocketId, 'heavy-muzzle-port');
  assert.equal(layout.landmarks[0].rigX, undefined);
  assert.equal(layout.landmarks[0].rigY, undefined);
});

test('comparison controls are off by default and normalize bounded review state', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(previewSession.DEFAULT_PREVIEW_BOSS_REFERENCE_COMPARISON)),
    { enabled: false, opacity: 0.45, layer: 'under', landmarks: false }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(previewSession.normalizePreviewBossReferenceComparison({
      enabled: true,
      opacity: 4,
      layer: 'over',
      landmarks: true
    }))),
    { enabled: true, opacity: 1, layer: 'over', landmarks: true }
  );
  assert.equal(
    previewSession.normalizePreviewBossReferenceComparison({ opacity: -2 }).opacity,
    0
  );
});

test('reference comparison participates in the browser integrity gate exactly once', () => {
  const assembled = { url: '/assembled.png', contentHash: 'a' };
  const sheet = { url: '/sheet.png', contentHash: 'b' };
  const reference = { url: '/reference.png', contentHash: 'c' };
  const assets = artworkAssets.getBossSandboxIntegrityAssets({
    assembled,
    sheet,
    modularReferenceComparison: reference
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(assets)),
    [assembled, sheet, reference]
  );
});

test('canonical command and Pixi path remain a review overlay, not gameplay art', () => {
  const session = read('services/gameplay/previewSession.ts');
  const canvas = read('components/GameCanvas.tsx');
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const panel = read('director/src/tools/bosses/BossFactoryDebugPanel.tsx');

  assert.match(session, /type: 'set-boss-reference-comparison'/);
  assert.match(canvas, /setPreviewBossReferenceComparison\(\s*command\.comparison/);
  assert.match(renderer, /textureBank\.get\(descriptor\.url\)/);
  assert.match(renderer, /referenceView\.sprite\.position\.set\(layout\.centerX, layout\.centerY\)/);
  assert.match(renderer, /referenceView\.sprite\.height = layout\.height/);
  assert.match(renderer, /state\.layer === 'under'/);
  assert.match(renderer, /referenceView\.landmarks\.visible = state\.landmarks/);
  assert.match(renderer, /hierarchy\.socketById\[landmark\.rigSocketId\]/);
  assert.doesNotMatch(renderer, /view\.sprite\.texture\s*=\s*.*modularReferenceComparison/);
  assert.match(panel, /Show neutral reference comparison/);
  assert.match(panel, /Under rig/);
  assert.match(panel, /Over rig/);
  assert.match(panel, /Show paired landmarks/);
});
