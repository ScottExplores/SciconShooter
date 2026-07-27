const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rigRoot = path.join(root, 'services', 'pixi', 'boss-rigs');

const loadTypescriptModule = (fileName) => {
  const source = fs.readFileSync(path.join(rigRoot, fileName), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, String, Set, Error }
  );
  return moduleBox.exports;
};

const prism = loadTypescriptModule('PrismMothModularPose.ts');
const hierarchy = loadTypescriptModule('ModularHierarchyRig.ts');

const baseInput = Object.freeze({
  frameCount: 180,
  reducedMotion: false,
  healthRatio: 0.8,
  phaseIndex: 1,
  entranceProgress: 1,
  phaseProgress: 0,
  damageStage: 0,
  reaction: null,
  action: null
});

const transform = (x, y) => Object.freeze({
  x,
  y,
  rotation: 0,
  scaleX: 1,
  scaleY: 1
});

const joint = (id, parentId, x, y) => Object.freeze({
  id,
  role: id === 'body' || id === 'core' || id === 'abdomen' ? 'body' : 'joint',
  parentId,
  frameId: null,
  transform: transform(x, y),
  anchor: null,
  layer: 0,
  visible: false
});

const createRegistration = () => hierarchy.registerModularBossRig({
  kind: 'modular-hierarchy-v1',
  id: 'prism-moth-test-rig',
  designSize: Object.freeze({ width: 180, height: 180 }),
  atlas: Object.freeze({
    url: '/test/prism-moth.png',
    contentHash: 'a'.repeat(64),
    width: 1,
    height: 1,
    frames: Object.freeze({
      unused: Object.freeze({ x: 0, y: 0, width: 1, height: 1 })
    })
  }),
  parts: Object.freeze([
    joint('root', null, 0, 0),
    joint('body', 'root', 0, 0),
    joint('core', 'body', 0, 0),
    joint('abdomen', 'body', 0, 24),
    joint('crest', 'body', 0, -22),
    joint('shoulder.left', 'body', -18, -4),
    joint('shoulder.right', 'body', 18, -4),
    joint('wing.left.upper', 'shoulder.left', -13, -12),
    joint('wing.right.upper', 'shoulder.right', 13, -12),
    joint('wing.left.mid', 'shoulder.left', -17, 0),
    joint('wing.right.mid', 'shoulder.right', 17, 0),
    joint('wing.left.lower-inner', 'shoulder.left', -10, 12),
    joint('wing.right.lower-inner', 'shoulder.right', 10, 12),
    joint('wing.left.lower-outer', 'shoulder.left', -17, 15),
    joint('wing.right.lower-outer', 'shoulder.right', 17, 15),
    joint('brood-pod.left', 'shoulder.left', -8, 13),
    joint('brood-pod.right', 'shoulder.right', 8, 13)
  ]),
  animations: Object.freeze([]),
  sockets: Object.freeze([
    Object.freeze({
      id: 'wing-edge-left',
      role: 'projectile-muzzle',
      partId: 'wing.left.mid',
      x: -15,
      y: 0,
      rotation: -Math.PI / 2
    }),
    Object.freeze({
      id: 'wing-edge-right',
      role: 'projectile-muzzle',
      partId: 'wing.right.mid',
      x: 15,
      y: 0,
      rotation: Math.PI / 2
    }),
    Object.freeze({
      id: 'wing-tip-left',
      role: 'projectile-muzzle',
      partId: 'wing.left.upper',
      x: -16,
      y: -5,
      rotation: -Math.PI / 2
    }),
    Object.freeze({
      id: 'wing-tip-right',
      role: 'projectile-muzzle',
      partId: 'wing.right.upper',
      x: 16,
      y: -5,
      rotation: Math.PI / 2
    }),
    Object.freeze({
      id: 'brood-release-left',
      role: 'detachable-pod',
      partId: 'brood-pod.left',
      x: 0,
      y: 7,
      rotation: 0
    }),
    Object.freeze({
      id: 'brood-release-right',
      role: 'detachable-pod',
      partId: 'brood-pod.right',
      x: 0,
      y: 7,
      rotation: 0
    }),
    Object.freeze({
      id: 'prism-core',
      role: 'core-origin',
      partId: 'core',
      x: 0,
      y: 0,
      rotation: 0
    })
  ])
});

const action = (motionCue, stage, progress, side, sequence = 0) => ({
  primitiveId: 'prism-pose-test',
  motionCue,
  stage,
  progress,
  side,
  sequence
});

test('Prism Moth pose sampler is deterministic, complete, frozen, and sampleModularPose-compatible', () => {
  const sampled = prism.samplePrismMothModularPose(baseInput);
  const repeated = prism.samplePrismMothSandboxPose(baseInput);

  assert.deepEqual(sampled, repeated);
  assert.deepEqual(
    Object.keys(sampled).sort(),
    Array.from(prism.PRISM_MOTH_MODULAR_PART_IDS).sort()
  );
  assert.equal(Object.isFrozen(sampled), true);
  Object.values(sampled).forEach((override) => {
    assert.equal(Object.isFrozen(override), true);
  });
});

test('Prism Moth preserves authored handedness and never nonuniformly stretches structural art', () => {
  const poses = [
    prism.samplePrismMothModularPose(baseInput),
    prism.samplePrismMothModularPose({
      ...baseInput,
      action: action(prism.PRISM_MOTH_MOTION_CUES.fold, 'warning', 1)
    }),
    prism.samplePrismMothModularPose({
      ...baseInput,
      action: action(prism.PRISM_MOTH_MOTION_CUES.open, 'warning', 1)
    }),
    prism.samplePrismMothModularPose({
      ...baseInput,
      phaseIndex: 2,
      phaseProgress: 1
    }),
    prism.samplePrismMothModularPose({
      ...baseInput,
      action: action(prism.PRISM_MOTH_MOTION_CUES.death, 'fire', 0.88, null, 1)
    })
  ];

  poses.forEach((pose) => {
    Object.entries(pose).forEach(([partId, override]) => {
      const hasScale = override.scaleXMultiplier !== undefined
        || override.scaleYMultiplier !== undefined;
      if (!hasScale) return;
      assert.equal(
        override.scaleXMultiplier,
        override.scaleYMultiplier,
        `${partId} must use uniform structural scale`
      );
      assert.ok(override.scaleXMultiplier > 0, `${partId} must never mirror handed art`);
    });
  });

  const open = poses[2];
  assert.ok(open['shoulder.left'].rotationOffset < 0);
  assert.ok(open['shoulder.right'].rotationOffset > 0);
  assert.ok(open['wing.left.upper'].rotationOffset < 0);
  assert.ok(open['wing.right.upper'].rotationOffset > 0);
  assert.equal(
    open['shoulder.left'].rotationOffset,
    -open['shoulder.right'].rotationOffset
  );
});

test('Prism Moth has distinct fold, one-sided wingbeats, brood deployment, swoop, kaleidoscope, and metamorphosis poses', () => {
  const idle = prism.samplePrismMothModularPose(baseInput);
  const folded = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.fold, 'warning', 1)
  });
  const leftBeat = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.wingbeatLeft, 'fire', 0.5, 'left')
  });
  const rightBeat = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.wingbeatRight, 'fire', 0.5, 'right')
  });
  const brood = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.broodDeploy, 'fire', 0.5)
  });
  const swoopPrep = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.swoopPrep, 'warning', 1, 'left')
  });
  const swoopMid = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.swoopMid, 'fire', 0.5, 'left')
  });
  const charge = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.kaleidoscopeCharge, 'warning', 1)
  });
  const peak = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.kaleidoscopePeak, 'fire', 0.25)
  });
  const phaseTwo = prism.samplePrismMothModularPose({
    ...baseInput,
    phaseIndex: 2,
    phaseProgress: 1
  });

  assert.ok(folded['shoulder.left'].rotationOffset > idle['shoulder.left'].rotationOffset);
  assert.notEqual(leftBeat['wing.left.upper'].rotationOffset, idle['wing.left.upper'].rotationOffset);
  assert.equal(leftBeat['wing.right.upper'].rotationOffset, idle['wing.right.upper'].rotationOffset);
  assert.notEqual(rightBeat['wing.right.upper'].rotationOffset, idle['wing.right.upper'].rotationOffset);
  assert.equal(rightBeat['wing.left.upper'].rotationOffset, idle['wing.left.upper'].rotationOffset);
  assert.ok(brood['brood-pod.left'].xOffset < 0);
  assert.ok(brood['brood-pod.right'].xOffset > 0);
  assert.ok(brood['brood-pod.left'].yOffset > 0);
  assert.ok(Math.abs(swoopMid.root.yOffset - idle.root.yOffset)
    > Math.abs(swoopPrep.root.yOffset - idle.root.yOffset));
  assert.ok(peak.core.scaleXMultiplier > charge.core.scaleXMultiplier);
  assert.ok(phaseTwo['shoulder.left'].xOffset < idle['shoulder.left'].xOffset);
  assert.ok(phaseTwo['shoulder.right'].xOffset > idle['shoulder.right'].xOffset);
  assert.ok(phaseTwo.crest.yOffset < idle.crest.yOffset);
  assert.ok(phaseTwo.abdomen.yOffset > idle.abdomen.yOffset);
});

test('only significant damage drives a body reaction and death separates attached groups in stages', () => {
  const idle = prism.samplePrismMothModularPose(baseInput);
  const smallHit = prism.samplePrismMothModularPose({
    ...baseInput,
    reaction: Object.freeze({
      kind: 'impact',
      progress: 0.5,
      direction: 1,
      strength: 0.4
    })
  });
  const stagger = prism.samplePrismMothModularPose({
    ...baseInput,
    reaction: Object.freeze({
      kind: 'stagger',
      progress: 0.5,
      direction: -1,
      strength: 1
    })
  });
  const earlyDeath = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.death, 'fire', 0.2, null, 0)
  });
  const lateDeath = prism.samplePrismMothModularPose({
    ...baseInput,
    action: action(prism.PRISM_MOTH_MOTION_CUES.death, 'fire', 0.86, null, 0)
  });

  assert.deepEqual(smallHit, idle, 'ordinary hits must not jerk the entire boss');
  assert.notEqual(stagger.root.xOffset, idle.root.xOffset);
  assert.notEqual(stagger['shoulder.left'].rotationOffset, idle['shoulder.left'].rotationOffset);
  assert.ok(lateDeath['shoulder.left'].xOffset < earlyDeath['shoulder.left'].xOffset);
  assert.ok(lateDeath['shoulder.right'].xOffset > earlyDeath['shoulder.right'].xOffset);
  assert.ok(lateDeath.abdomen.yOffset > earlyDeath.abdomen.yOffset);
  assert.ok(lateDeath.body.alpha < earlyDeath.body.alpha);
});

test('persistent damage produces a restrained deterministic wing tremor and prism-core flicker', () => {
  const healthy = prism.samplePrismMothModularPose(baseInput);
  const damagedInput = {
    ...baseInput,
    healthRatio: 0.25,
    damageStage: 3
  };
  const damaged = prism.samplePrismMothModularPose(damagedInput);
  const replay = prism.samplePrismMothModularPose(damagedInput);

  assert.deepEqual(damaged, replay);
  assert.notEqual(damaged.root.rotationOffset, healthy.root.rotationOffset);
  assert.ok(damaged.root.yOffset > healthy.root.yOffset);
  assert.notEqual(
    damaged['shoulder.left'].rotationOffset,
    healthy['shoulder.left'].rotationOffset
  );
  assert.ok(damaged.core.scaleXMultiplier > healthy.core.scaleXMultiplier);
  Object.values(damaged).forEach((override) => {
    assert.equal(override.alpha ?? 1, 1, 'persistent damage must not make anatomy translucent');
  });
});

test('Prism hierarchy keeps wing groups attached and moves every anatomy-owned socket with its pose', () => {
  const registration = createRegistration();
  assert.equal(prism.validatePrismMothRigCompatibility(registration).length, 0);

  const folded = hierarchy.resolveModularBossRigHierarchy(
    registration,
    prism.samplePrismMothModularPose({
      ...baseInput,
      action: action(prism.PRISM_MOTH_MOTION_CUES.fold, 'warning', 1)
    })
  );
  const opened = hierarchy.resolveModularBossRigHierarchy(
    registration,
    prism.samplePrismMothModularPose({
      ...baseInput,
      action: action(prism.PRISM_MOTH_MOTION_CUES.open, 'warning', 1)
    })
  );
  const brood = hierarchy.resolveModularBossRigHierarchy(
    registration,
    prism.samplePrismMothModularPose({
      ...baseInput,
      action: action(prism.PRISM_MOTH_MOTION_CUES.broodDeploy, 'fire', 0.5)
    })
  );

  for (const side of ['left', 'right']) {
    for (const segment of ['upper', 'mid', 'lower-inner', 'lower-outer']) {
      assert.equal(
        registration.partById[`wing.${side}.${segment}`].parentId,
        `shoulder.${side}`
      );
      assert.equal(
        opened.partById[`wing.${side}.${segment}`].localTransform.x,
        registration.partById[`wing.${side}.${segment}`].transform.x,
        'wing articulation must rotate around its authored attached joint'
      );
      assert.equal(
        opened.partById[`wing.${side}.${segment}`].localTransform.y,
        registration.partById[`wing.${side}.${segment}`].transform.y
      );
    }
  }

  assert.ok(opened.socketById['wing-tip-left'].worldX < opened.socketById['prism-core'].worldX);
  assert.ok(opened.socketById['wing-tip-right'].worldX > opened.socketById['prism-core'].worldX);
  assert.notEqual(
    opened.socketById['wing-edge-left'].worldX,
    folded.socketById['wing-edge-left'].worldX
  );
  assert.notEqual(
    opened.socketById['wing-edge-right'].worldX,
    folded.socketById['wing-edge-right'].worldX
  );
  assert.notEqual(
    brood.socketById['brood-release-left'].worldY,
    opened.socketById['brood-release-left'].worldY
  );
  assert.notEqual(
    brood.socketById['brood-release-right'].worldY,
    opened.socketById['brood-release-right'].worldY
  );
});

test('Prism motion vocabulary remains boss-specific and contains no Helios choreography', () => {
  const source = fs.readFileSync(
    path.join(rigRoot, 'PrismMothModularPose.ts'),
    'utf8'
  );
  assert.doesNotMatch(
    source,
    /helios|clawcarrier|paired-crossfire|machine-gun-channel|tracking-pincer|reactor-aperture|articulated-melee-sweep/i
  );
});
