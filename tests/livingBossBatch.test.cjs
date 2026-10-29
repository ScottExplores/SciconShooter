const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const transpile = (relativePath, customRequire = require) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
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
      require: customRequire,
      exports: moduleBox.exports,
      Math,
      Number,
      Object,
      Array
    }
  );
  return { source, exports: moduleBox.exports };
};

const poseModule = transpile('services/pixi/boss-rigs/IntactBossLivingPose.ts');
const signatureModule = transpile('services/gameplay/bosses/LivingBossSignatureRuntime.ts');
const patternModule = transpile('services/gameplay/bosses/BossPatternRuntime.ts');
const emitterCore = transpile('services/gameplay/bosses/RotatingEmitterCoreRuntime.ts');
const emitterPose = transpile(
  'services/pixi/boss-rigs/RotatingEmitterCorePose.ts',
  (specifier) => {
    if (specifier.endsWith('RotatingEmitterCoreRuntime')) return emitterCore.exports;
    return require(specifier);
  }
);

const cinderjaw = '/game-art/generated/bosses/cinderjaw-siege-beetle/cinderjaw-siege-beetle-intact.png';
const vesperglass = '/game-art/generated/bosses/vesperglass-mothmother/vesperglass-mothmother-intact.png';
const harrower = '/game-art/generated/bosses/meridian-harrower/meridian-harrower-intact.png';

test('intact paintings resolve to a three-part living rig', () => {
  const { intactBossFamilyForSprite, sampleIntactBossLivingPose } = poseModule.exports;
  assert.equal(intactBossFamilyForSprite(cinderjaw), 'siege-beetle');
  assert.equal(intactBossFamilyForSprite(vesperglass), 'glass-moth');
  assert.equal(intactBossFamilyForSprite(harrower), 'crescent-hunter');
  assert.equal(intactBossFamilyForSprite('/game-art/other.png'), null);
  const pose = sampleIntactBossLivingPose({
    spriteUrl: cinderjaw,
    frame: 12,
    healthRatio: 1,
    actionPose: 'idle'
  });
  assert.equal(pose.parts.length, 3);
  assert.equal(pose.parts.map((part) => part.id).join(','), 'left,core,right');
  assert.ok(pose.parts.every((part) => part.visible));
  assert.doesNotMatch(poseModule.source, /Math\.random|Date\.|setTimeout/);
});

test('attack pose opens the claws and wings farther than idle', () => {
  const { sampleIntactBossLivingPose } = poseModule.exports;
  const idle = sampleIntactBossLivingPose({
    spriteUrl: cinderjaw,
    frame: 40,
    healthRatio: 1,
    actionPose: 'idle'
  });
  const warning = sampleIntactBossLivingPose({
    spriteUrl: cinderjaw,
    frame: 40,
    healthRatio: 1,
    actionPose: 'warning'
  });
  assert.ok(Math.abs(warning.parts[0].rotation) > Math.abs(idle.parts[0].rotation));
  assert.ok(warning.parts[0].offsetX < idle.parts[0].offsetX);
  assert.ok(warning.parts[2].offsetX > idle.parts[2].offsetX);
});

test('reduced motion shrinks the living rig without removing it', () => {
  const { sampleIntactBossLivingPose } = poseModule.exports;
  const full = sampleIntactBossLivingPose({
    spriteUrl: vesperglass,
    frame: 18,
    healthRatio: 0.8,
    actionPose: 'warning',
    reducedMotion: false
  });
  const reduced = sampleIntactBossLivingPose({
    spriteUrl: vesperglass,
    frame: 18,
    healthRatio: 0.8,
    actionPose: 'warning',
    reducedMotion: true
  });
  assert.ok(Math.abs(reduced.parts[0].rotation) < Math.abs(full.parts[0].rotation));
  assert.ok(reduced.parts.every((part) => part.visible));
});

test('armor and claws break off at the 66 and 33 percent marks', () => {
  const { intactBossBreakMask, sampleIntactBossLivingPose } = poseModule.exports;
  assert.equal(intactBossBreakMask(0.67), 0);
  assert.equal(intactBossBreakMask(0.66), 1);
  assert.equal(intactBossBreakMask(0.34), 1);
  assert.equal(intactBossBreakMask(0.33), 3);
  const broken = sampleIntactBossLivingPose({
    spriteUrl: harrower,
    frame: 4,
    healthRatio: 0.2
  });
  assert.equal(broken.parts[0].visible, false);
  assert.equal(broken.parts[1].visible, true);
  assert.equal(broken.parts[2].visible, false);
});

test('cinderjaw furnace jaw is a telegraphed weave wall that aborts when the timeline is busy', () => {
  const { stepLivingBossSignature, emptyLivingBossSignatureMemory, LIVING_SIGNATURE_WARNING_FRAMES } = signatureModule.exports;
  const opened = stepLivingBossSignature({
    bossKey: 'cinderjaw',
    attackTimer: 540,
    healthRatio: 1,
    actionBusy: false,
    memory: emptyLivingBossSignatureMemory()
  });
  assert.equal(opened.announce, 'FURNACE JAW');
  assert.equal(opened.charging, true);
  assert.equal(opened.spawn, null);
  assert.equal(opened.memory.pose, 'warning');

  const aborted = stepLivingBossSignature({
    bossKey: 'cinderjaw',
    attackTimer: 541,
    healthRatio: 1,
    actionBusy: true,
    memory: opened.memory
  });
  assert.equal(aborted.spawn, null);
  assert.equal(aborted.memory.mainStart, -1);

  const armed = stepLivingBossSignature({
    bossKey: 'cinderjaw',
    attackTimer: 540,
    healthRatio: 1,
    actionBusy: false,
    memory: emptyLivingBossSignatureMemory()
  });
  const fired = stepLivingBossSignature({
    bossKey: 'cinderjaw',
    attackTimer: 540 + LIVING_SIGNATURE_WARNING_FRAMES,
    healthRatio: 1,
    actionBusy: false,
    memory: armed.memory
  });
  assert.equal(fired.spawn.pattern, 'weave-wall');
  assert.equal(fired.spawn.projectileCount, 12);
  assert.equal(fired.memory.pose, 'fire');
});

test('vesperglass desperation starts only under 20 percent health', () => {
  const { stepLivingBossSignature, emptyLivingBossSignatureMemory } = signatureModule.exports;
  const atThreshold = stepLivingBossSignature({
    bossKey: 'vesperglass',
    attackTimer: 300,
    healthRatio: 0.2,
    actionBusy: false,
    memory: emptyLivingBossSignatureMemory()
  });
  assert.equal(atThreshold.announce, null);
  assert.equal(atThreshold.memory.desperationStart, -1);

  const under = stepLivingBossSignature({
    bossKey: 'vesperglass',
    attackTimer: 300,
    healthRatio: 0.199,
    actionBusy: false,
    memory: emptyLivingBossSignatureMemory()
  });
  assert.equal(under.announce, 'LAST LIGHT');
  assert.equal(under.memory.pose, 'warning');
  assert.ok(under.memory.desperationStart >= 0);
});

test('signature weave walls keep a gap at least 1.5 ship widths wide', () => {
  const { resolveBossWeaveWallLayout, buildBossWeaveWallSlots, bossPatternSafeGapPixels } = patternModule.exports;
  const layout = resolveBossWeaveWallLayout(412, true, 4);
  assert.ok(layout.safeGapRightX - layout.safeGapLeftX >= bossPatternSafeGapPixels());
  const slots = buildBossWeaveWallSlots(layout, 12, 4);
  assert.ok(slots.length > 0);
  assert.ok(slots.length <= 12);
  for (const slot of slots) {
    assert.ok(slot.x < layout.safeGapLeftX || slot.x > layout.safeGapRightX);
  }
});

test('aurora beam primitives and live beams drive the oculus rig', () => {
  const { sampleRotatingEmitterCorePose } = emitterPose.exports;
  const fromPrimitive = sampleRotatingEmitterCorePose({
    attackFrame: 80,
    reducedMotion: false,
    action: {
      primitiveId: 'radial-beam-array',
      stage: 'fire',
      progress: 0.2,
      sequence: 1
    }
  });
  assert.ok(fromPrimitive.beamEnergy > 0);
  assert.equal(fromPrimitive.relayEnergy, 1);

  const idle = sampleRotatingEmitterCorePose({
    attackFrame: 80,
    reducedMotion: false
  });
  const live = sampleRotatingEmitterCorePose({
    attackFrame: 80,
    reducedMotion: false,
    liveBeam: true
  });
  assert.equal(idle.beamEnergy, 0);
  assert.equal(live.beamEnergy, 0.82);
  assert.equal(live.rotorAngle, idle.rotorAngle);
  assert.ok(live.relayEnergy > idle.relayEnergy);
});

test('the living pass does not name the harrower inside the renderer and leaves generated css alone', () => {
  const renderer = fs.readFileSync(path.join(root, 'services/pixi/PixiGameRenderer.ts'), 'utf8');
  const index = fs.readFileSync(path.join(root, 'index.tsx'), 'utf8');
  const generated = fs.readFileSync(path.join(root, 'styles/tailwind.generated.css'), 'utf8');
  assert.equal(renderer.toLowerCase().includes('meridian'), false);
  assert.match(index, /tailwind\.generated\.css/);
  assert.match(index, /living-ui\.css/);
  assert.equal(generated.includes('sci-living-ship-hover'), false);
});
