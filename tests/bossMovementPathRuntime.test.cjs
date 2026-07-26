const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadMovementPaths = () => {
  const source = fs.readFileSync(
    path.join(root, 'game-config', 'movementPaths.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    {
      module: moduleBox,
      require,
      exports: moduleBox.exports,
      Math,
      Number,
      Object,
      Array
    }
  );
  return { source, ...moduleBox.exports };
};

test('movement path descriptors stay normalized, bounded, and immutable', () => {
  const { MOVEMENT_PATH_CATALOG } = loadMovementPaths();
  const descriptor = MOVEMENT_PATH_CATALOG['sweep-bank-reentry'];
  const keyframes = Array.from(descriptor.keyframes);

  assert.equal(Object.isFrozen(MOVEMENT_PATH_CATALOG), true);
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(Object.isFrozen(descriptor.keyframes), true);
  assert.equal(keyframes[0].progress, 0);
  assert.equal(keyframes.at(-1).progress, 1);
  keyframes.forEach((keyframe, index) => {
    assert.equal(Object.isFrozen(keyframe), true);
    assert.ok(keyframe.progress >= 0 && keyframe.progress <= 1);
    assert.ok(keyframe.centerXRatio >= -0.12 && keyframe.centerXRatio <= 1.12);
    assert.ok(keyframe.centerYRatio >= -0.16 && keyframe.centerYRatio <= 0.32);
    if (index > 0) assert.ok(keyframe.progress > keyframes[index - 1].progress);
  });
});

test('movement path sampling is deterministic and banking follows the path tangent', () => {
  const {
    isMovementPathId,
    MOVEMENT_PATH_CATALOG,
    sampleNormalizedMovementPath,
    source
  } = loadMovementPaths();
  const descriptor = MOVEMENT_PATH_CATALOG['sweep-bank-reentry'];
  const sample = sampleNormalizedMovementPath('sweep-bank-reentry', 0.2);
  const repeated = sampleNormalizedMovementPath('sweep-bank-reentry', 0.2);
  const reverse = sampleNormalizedMovementPath('sweep-bank-reentry', 0.65);
  const endpoint = sampleNormalizedMovementPath('sweep-bank-reentry', 1);

  assert.deepEqual(
    [
      sample.centerXRatio,
      sample.centerYRatio,
      sample.tangentX,
      sample.tangentY,
      sample.bankRadians
    ],
    [
      repeated.centerXRatio,
      repeated.centerYRatio,
      repeated.tangentX,
      repeated.tangentY,
      repeated.bankRadians
    ]
  );
  assert.ok(sample.tangentX > 0);
  assert.ok(sample.bankRadians > 0);
  assert.ok(reverse.tangentX < 0);
  assert.ok(reverse.bankRadians < 0);
  assert.ok(Math.abs(sample.bankRadians) <= descriptor.maxBankRadians);
  assert.ok(Math.abs(endpoint.bankRadians) < Number.EPSILON);
  assert.equal(isMovementPathId('sweep-bank-reentry'), true);
  assert.equal(isMovementPathId('unreviewed-arbitrary-path'), false);
  assert.doesNotMatch(source, /Math\.random/);
});

test('the GameEngine owns path traversal state while Pixi banks presentation only', () => {
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const rendererSource = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );

  assert.match(engineSource, /boss\.x = sample\.centerXRatio \* this\.width - boss\.width \/ 2/);
  assert.match(engineSource, /boss\.y = sample\.centerYRatio \* this\.height - boss\.height \/ 2/);
  assert.match(engineSource, /boss\.bossPresentationBankRadians = sample\.bankRadians/);
  assert.match(rendererSource, /view\.root\.rotation = entity\.bossPresentationBankRadians/);
  assert.doesNotMatch(
    engineSource,
    /boss\.(?:width|height)\s*=.*bossPresentationBankRadians/
  );
});
