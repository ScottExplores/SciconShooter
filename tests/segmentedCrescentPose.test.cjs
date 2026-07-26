const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const posePath = path.join(
  root,
  'services',
  'pixi',
  'boss-rigs',
  'SegmentedCrescentPose.ts'
);
const rendererPath = path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts');
const contractsPath = path.join(
  root,
  'services',
  'pixi',
  'boss-rigs',
  'PreviewBossRigContracts.ts'
);

const loadPoseSampler = () => {
  const source = fs.readFileSync(posePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, String }
  );
  return moduleBox.exports;
};

const baseInput = Object.freeze({
  frameCount: 120,
  reducedMotion: false,
  healthRatio: 0.72,
  bankRadians: 0.08,
  charging: false
});

test('segmented crescent pose sampling is deterministic and simulation-frame driven', () => {
  const { sampleSegmentedCrescentPose } = loadPoseSampler();
  const first = sampleSegmentedCrescentPose(baseInput);
  const repeated = sampleSegmentedCrescentPose(baseInput);
  const advanced = sampleSegmentedCrescentPose({ ...baseInput, frameCount: 128 });

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first, advanced);
  Object.values(first).forEach((value) => assert.equal(Number.isFinite(value), true));
});

test('typed actions produce readable ring, side recoil, and tail poses', () => {
  const { sampleSegmentedCrescentPose } = loadPoseSampler();
  const ring = sampleSegmentedCrescentPose({
    ...baseInput,
    action: {
      primitiveId: 'gap-ring',
      stage: 'warning',
      progress: 0.6
    }
  });
  const sideBarrage = sampleSegmentedCrescentPose({
    ...baseInput,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.1,
      side: 'port'
    }
  });
  const tail = sampleSegmentedCrescentPose({
    ...baseInput,
    action: {
      primitiveId: 'tail-fan',
      stage: 'fire',
      progress: 0.25
    }
  });

  assert.ok(ring.ringAlpha > 0.5);
  assert.ok(ring.ringScale > 0.9);
  assert.ok(sideBarrage.leftPodRecoil > sideBarrage.rightPodRecoil);
  assert.ok(Math.abs(tail.tailSway) > 0.01);
  assert.ok([0, 1, 2].includes(tail.tailFrame));

  const collapse = sampleSegmentedCrescentPose({
    ...baseInput,
    action: {
      primitiveId: 'inward-collapse',
      stage: 'warning',
      progress: 0.7
    }
  });
  assert.ok(collapse.leftArmSpread < ring.leftArmSpread);
  assert.ok(collapse.rightArmSpread < ring.rightArmSpread);
  assert.ok(collapse.ringAlpha > 0.5);
});

test('low-health aperture has a deterministic heartbeat and staggered pod personality', () => {
  const { sampleSegmentedCrescentPose } = loadPoseSampler();
  const healthy = sampleSegmentedCrescentPose({
    ...baseInput,
    frameCount: 93,
    healthRatio: 0.8
  });
  const aperture = sampleSegmentedCrescentPose({
    ...baseInput,
    frameCount: 93,
    healthRatio: 0.3
  });
  const leftLead = sampleSegmentedCrescentPose({
    ...baseInput,
    action: {
      primitiveId: 'pod-volley',
      stage: 'fire',
      progress: 0.1,
      sequence: 0
    }
  });
  const rightLead = sampleSegmentedCrescentPose({
    ...baseInput,
    action: {
      primitiveId: 'pod-volley',
      stage: 'fire',
      progress: 0.1,
      sequence: 1
    }
  });

  assert.ok(aperture.coreScale > healthy.coreScale);
  assert.ok(aperture.ringAlpha > 0);
  assert.ok(leftLead.leftPodRecoil > leftLead.rightPodRecoil);
  assert.ok(rightLead.rightPodRecoil > rightLead.leftPodRecoil);
  assert.deepEqual(
    aperture,
    sampleSegmentedCrescentPose({
      ...baseInput,
      frameCount: 93,
      healthRatio: 0.3
    })
  );
});

test('reduced motion damps idle movement while retaining authored action poses', () => {
  const { sampleSegmentedCrescentPose } = loadPoseSampler();
  const full = sampleSegmentedCrescentPose({
    ...baseInput,
    frameCount: 37,
    action: {
      primitiveId: 'rotating-cross',
      stage: 'warning',
      progress: 0.5
    }
  });
  const reduced = sampleSegmentedCrescentPose({
    ...baseInput,
    frameCount: 37,
    reducedMotion: true,
    action: {
      primitiveId: 'rotating-cross',
      stage: 'warning',
      progress: 0.5
    }
  });

  assert.ok(Math.abs(reduced.bodyBob) < Math.abs(full.bodyBob));
  assert.ok(reduced.ringAlpha > 0.2);
  assert.ok(reduced.leftArmSpread > 0.03);
});

test('renderer owns one generic preview atlas rig with fallback and cleanup', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const contracts = fs.readFileSync(contractsPath, 'utf8');
  const expectedPartIds = [
    'coreBody',
    'coreClosed',
    'coreOpen',
    'leftOuter',
    'rightOuter',
    'leftMidA',
    'rightMidA',
    'leftMidB',
    'rightMidB',
    'leftBase',
    'rightBase',
    'leftPod',
    'rightPod',
    'ring',
    'tailA',
    'tailB',
    'tailC'
  ];

  expectedPartIds.forEach((partId) => assert.match(source, new RegExp(`'${partId}'`)));
  assert.match(contracts, /readonly articulatedAtlas\?: PreviewBossAtlas/);
  assert.match(contracts, /kind: 'segmented-crescent-v1'/);
  assert.match(source, /new Texture\(\{\s*source: sheet\.source,\s*frame: new Rectangle/);
  assert.match(source, /texture\.destroy\(false\)/);
  assert.match(source, /entity\.bossActionPresentation/);
  assert.match(source, /helmet\?\.exposed \|\| helmet\?\.destroyed/);
  assert.match(source, /view\.sprite\.visible = !previewAtlasReady/);
  assert.match(source, /String\(entity\.projectileVisualKind \?\? ''\) !== 'boss-pod'/);
  assert.match(source, /entity\.bossOwnerId !== this\.previewBossRuntimeEntityId/);
  assert.match(source, /Math\.atan2\(entity\.vy, entity\.vx\) - Math\.PI \/ 2/);
  assert.doesNotMatch(source, /meridian|director/i);

  const presenter = source.slice(
    source.indexOf('private drawSegmentedCrescentPreviewBossAtlas'),
    source.indexOf('private getBossComponentVisualScale')
  );
  assert.doesNotMatch(
    presenter,
    /entity\.(?:x|y|width|height|vx|vy|hp|maxHp|bossComponents)\s*=/,
    'the articulated presenter must never mutate simulation or collision state'
  );
});
