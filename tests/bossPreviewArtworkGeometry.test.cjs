const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const source = read('services/gameplay/bosses/BossPreviewArtworkGeometry.ts');
const compiled = ts.transpileModule(source, {
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
const { resolveBossPreviewArtworkDimensions } = moduleBox.exports;

test('selected modular preview bosses preserve registered art aspect without stretching', () => {
  const designSize = { width: 370, height: 311 };
  const dimensions = resolveBossPreviewArtworkDimensions({
    configuredWidth: 290,
    configuredHeight: 264,
    sourceEventId: 'sandbox-nullwake-revenant',
    selectedEventId: 'sandbox-nullwake-revenant',
    designSize
  });

  assert.deepEqual(JSON.parse(JSON.stringify(dimensions)), {
    width: 290,
    height: 244,
    preservesDesignAspect: true
  });
  const scaleX = dimensions.width / designSize.width;
  const scaleY = dimensions.height / designSize.height;
  assert.ok(
    Math.abs(scaleX - scaleY) / Math.max(scaleX, scaleY) < 0.002,
    'integer rounding must keep runtime scale distortion below 0.2%'
  );
});

test('production, unrelated events, and invalid art metadata retain configured dimensions', () => {
  const inputs = [
    {
      configuredWidth: 290,
      configuredHeight: 264,
      designSize: { width: 370, height: 311 }
    },
    {
      configuredWidth: 290,
      configuredHeight: 264,
      sourceEventId: 'other-boss',
      selectedEventId: 'sandbox-nullwake-revenant',
      designSize: { width: 370, height: 311 }
    },
    {
      configuredWidth: 290,
      configuredHeight: 264,
      sourceEventId: 'sandbox-nullwake-revenant',
      selectedEventId: 'sandbox-nullwake-revenant',
      designSize: { width: 0, height: 311 }
    }
  ];

  inputs.forEach((input) => {
    assert.deepEqual(
      JSON.parse(JSON.stringify(resolveBossPreviewArtworkDimensions(input))),
      { width: 290, height: 264, preservesDesignAspect: false }
    );
  });
});

test('the canonical canvas passes selected modular design bounds into GameEngine', () => {
  const canvas = read('components/GameCanvas.tsx');
  const engine = read('services/gameLogic.ts');

  assert.match(
    canvas,
    /previewBossArtworkDesignSize:[\s\S]*?setupBossArtwork\?\.modularRig\?\.manifest\.designSize/
  );
  assert.match(engine, /resolveBossPreviewArtworkDimensions\(\{/);
  assert.match(engine, /selectedEventId: this\.previewBossCollisionEventId/);
  assert.match(
    engine,
    /this\.previewBossArtworkDesignSize = options\.previewBossArtworkDesignSize[\s\S]*?: undefined;/
  );
});
