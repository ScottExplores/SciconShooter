const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const sourcePath = path.resolve(
  __dirname,
  '..',
  'services',
  'pixi',
  'boss-rigs',
  'NullwakeModularPose.ts'
);
const source = fs.readFileSync(sourcePath, 'utf8');
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
    exports: moduleBox.exports,
    require,
    Array,
    Error,
    Map,
    Math,
    Number,
    Object,
    Set,
    String
  }
);

const poseRuntime = moduleBox.exports;
const sample = poseRuntime.sampleNullwakeModularPose;

const base = Object.freeze({
  frameCount: 93,
  reducedMotion: false,
  healthRatio: 0.72,
  phaseIndex: 1,
  revivalStage: 'armed',
  revivalProgress: 0,
  revived: false
});

test('Nullwake breathes through four independent opaque limbs without random timing', () => {
  const idle = sample(base);
  const later = sample({ ...base, frameCount: 147 });

  assert.equal(idle.bodyFrameId, 'body.shell');
  assert.notEqual(idle.breathingAmount, later.breathingAmount);
  assert.notEqual(
    idle.partOverrides['arm.upper-port.mount'].rotationOffset,
    later.partOverrides['arm.upper-port.mount'].rotationOffset
  );
  assert.notEqual(
    idle.partOverrides['arm.lower-starboard.mount'].rotationOffset,
    later.partOverrides['arm.lower-starboard.mount'].rotationOffset
  );
  for (const partId of [
    'arm.upper-port',
    'arm.upper-starboard',
    'arm.lower-port',
    'arm.lower-starboard',
    'body'
  ]) {
    assert.equal(idle.partOverrides[partId].alpha, 1);
  }
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});

test('side-owned attacks brace and recoil only the matching Nullwake limbs', () => {
  const idle = sample(base);
  const portWarning = sample({
    ...base,
    action: {
      primitiveId: 'side-barrage',
      stage: 'warning',
      progress: 0.8,
      side: 'port',
      sequence: 0
    }
  });
  const portFire = sample({
    ...base,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.1,
      side: 'port',
      sequence: 0
    }
  });

  assert.ok(portWarning.portAttackEnergy > 0);
  assert.equal(portWarning.starboardAttackEnergy, 0);
  assert.notEqual(
    portWarning.partOverrides['arm.upper-port.mount'].rotationOffset,
    idle.partOverrides['arm.upper-port.mount'].rotationOffset
  );
  assert.equal(
    portWarning.partOverrides['arm.upper-starboard.mount'].rotationOffset,
    idle.partOverrides['arm.upper-starboard.mount'].rotationOffset
  );
  assert.ok(
    portFire.partOverrides['arm.upper-port.mount'].rotationOffset
    > portWarning.partOverrides['arm.upper-port.mount'].rotationOffset
  );
});

test('core attacks bloom all four limbs while reduced motion preserves the warning', () => {
  const full = sample({
    ...base,
    frameCount: 71,
    action: {
      primitiveId: 'gap-ring',
      stage: 'warning',
      progress: 0.72,
      sequence: 2
    }
  });
  const reduced = sample({
    ...base,
    frameCount: 71,
    reducedMotion: true,
    action: {
      primitiveId: 'gap-ring',
      stage: 'warning',
      progress: 0.72,
      sequence: 2
    }
  });
  const idle = sample({ ...base, frameCount: 71 });

  assert.ok(full.portAttackEnergy > 0);
  assert.ok(full.starboardAttackEnergy > 0);
  assert.notEqual(
    full.partOverrides['arm.lower-port.mount'].rotationOffset,
    idle.partOverrides['arm.lower-port.mount'].rotationOffset
  );
  assert.notEqual(
    full.partOverrides['arm.lower-starboard.mount'].rotationOffset,
    idle.partOverrides['arm.lower-starboard.mount'].rotationOffset
  );
  assert.equal(reduced.portAttackEnergy, full.portAttackEnergy);
  assert.equal(reduced.starboardAttackEnergy, full.starboardAttackEnergy);
  assert.ok(Math.abs(reduced.partOverrides.root.yOffset) < Math.abs(full.partOverrides.root.yOffset));
  assert.match(full.bodyFrameId, /^body\.core\.[0-3]$/);
  assert.equal(full.coreMuzzleVisible, false);

  const firing = sample({
    ...base,
    frameCount: 71,
    action: {
      primitiveId: 'gap-ring',
      stage: 'fire',
      progress: 0.52,
      sequence: 2
    }
  });
  assert.equal(firing.bodyFrameId, 'body.core.3');
  assert.equal(firing.coreMuzzleVisible, true);
  assert.equal(firing.partOverrides['effect.core-muzzle'].visible, true);
  assert.match(firing.coreMuzzleFrameId, /^effect\.core-muzzle\.[0-2]$/);
});

test('shutdown ends in the exact pose where deterministic reboot begins', () => {
  const shutdownEnd = sample({
    ...base,
    frameCount: 132,
    healthRatio: 0,
    revivalStage: 'shutdown',
    revivalProgress: 1
  });
  const rebootStart = sample({
    ...base,
    frameCount: 133,
    healthRatio: 1,
    phaseIndex: 2,
    revivalStage: 'rebooting',
    revivalProgress: 0,
    revived: true
  });
  const rebootMiddle = sample({
    ...base,
    frameCount: 210,
    healthRatio: 1,
    phaseIndex: 2,
    revivalStage: 'rebooting',
    revivalProgress: 0.5,
    revived: true
  });
  const complete = sample({
    ...base,
    frameCount: 289,
    healthRatio: 1,
    phaseIndex: 2,
    revivalStage: 'complete',
    revivalProgress: 1,
    revived: true
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(shutdownEnd.partOverrides)),
    JSON.parse(JSON.stringify(rebootStart.partOverrides))
  );
  assert.equal(shutdownEnd.limpAmount, 1);
  assert.equal(rebootStart.limpAmount, 1);
  assert.ok(rebootMiddle.limpAmount < 1 && rebootMiddle.limpAmount > 0);
  assert.equal(complete.limpAmount, 0);
  assert.equal(complete.reactivationAmount, 1);
  assert.equal(shutdownEnd.bodyFrameId, 'body.damage.2');
  assert.equal(rebootStart.bodyFrameId, 'body.damage.2');
  assert.match(rebootMiddle.bodyFrameId, /^body\.core\.[0-3]$/);
});

test('pose sampling is immutable and deterministic', () => {
  const first = sample(base);
  const second = sample(base);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.partOverrides), true);
  Object.values(first.partOverrides).forEach((override) => {
    assert.equal(Object.isFrozen(override), true);
  });
});

test('entrance, damage, and significant-impact states are purposeful and ordinary idle remains stable', () => {
  const foldedEntrance = sample({ ...base, entranceProgress: 0 });
  const settled = sample({ ...base, entranceProgress: 1 });
  const damaged = sample({ ...base, entranceProgress: 1, damageStage: 4 });
  const impact = sample({
    ...base,
    entranceProgress: 1,
    reaction: {
      kind: 'impact',
      progress: 0.5,
      direction: -1,
      strength: 1.2
    }
  });
  const stagger = sample({
    ...base,
    entranceProgress: 1,
    reaction: {
      kind: 'stagger',
      progress: 0.5,
      direction: -1,
      strength: 1.2
    }
  });

  assert.notEqual(
    foldedEntrance.partOverrides['arm.upper-port.mount'].rotationOffset,
    settled.partOverrides['arm.upper-port.mount'].rotationOffset
  );
  assert.notEqual(
    damaged.partOverrides['arm.upper-port.mount'].rotationOffset,
    settled.partOverrides['arm.upper-port.mount'].rotationOffset
  );
  assert.equal(damaged.bodyFrameId, 'body.damage.1');
  assert.ok(impact.partOverrides.root.xOffset < settled.partOverrides.root.xOffset);
  assert.ok(
    Math.abs(stagger.partOverrides.root.xOffset - settled.partOverrides.root.xOffset)
    > Math.abs(impact.partOverrides.root.xOffset - settled.partOverrides.root.xOffset)
  );
  assert.deepEqual(sample({ ...base, entranceProgress: 1 }), settled);
});
