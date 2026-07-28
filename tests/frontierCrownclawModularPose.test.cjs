const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const compileModule = (sourcePath, requireOverride = require) => {
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
      require: requireOverride,
      Array,
      Math,
      Number,
      Object
    }
  );
  return { exports: moduleBox.exports, source };
};

const runtimePath = path.resolve(
  __dirname,
  '..',
  'services',
  'gameplay',
  'bosses',
  'FrontierCrownclawRuntime.ts'
);
const posePath = path.resolve(
  __dirname,
  '..',
  'services',
  'pixi',
  'boss-rigs',
  'FrontierCrownclawModularPose.ts'
);
const rigPath = path.resolve(
  __dirname,
  '..',
  'director-data',
  'prototype-assets',
  'frontier-crownclaw',
  'frontier-crownclaw.rig.json'
);
const atlasPath = path.resolve(
  __dirname,
  '..',
  'director-data',
  'prototype-assets',
  'frontier-crownclaw',
  'frontier-crownclaw-atlas.json'
);
const runtime = compileModule(runtimePath);
const pose = compileModule(posePath, (specifier) => {
  if (specifier.endsWith('FrontierCrownclawRuntime')) return runtime.exports;
  return require(specifier);
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const rig = JSON.parse(fs.readFileSync(rigPath, 'utf8'));
const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
const rigPartById = Object.fromEntries(rig.parts.map((part) => [part.id, part]));

const assertAtlasFrame = (frameId) => {
  assert.ok(atlas.frames[frameId], `generated atlas must contain ${frameId}`);
};

const baseInput = Object.freeze({
  frameCount: 120,
  reducedMotion: false,
  healthRatio: 0.82,
  phaseIndex: 1,
  entranceProgress: 1,
  damageStage: 0
});

test('Frontier rig contract includes a full hierarchical claw, spool, and ten-link chain per side', () => {
  const partIds = Array.from(pose.exports.FRONTIER_CROWNCLAW_MODULAR_PART_IDS);
  const geometry = plain(pose.exports.FRONTIER_CROWNCLAW_DESIGN_GEOMETRY);
  assert.deepEqual(geometry.designSize, {
    width: rig.canvas.width,
    height: rig.canvas.height
  });
  assert.deepEqual(geometry.port.spool, {
    x: rigPartById['claw.port.mount'].transform.x
      + rigPartById['spool.port'].transform.x,
    y: rigPartById['claw.port.mount'].transform.y
      + rigPartById['spool.port'].transform.y
  });
  assert.deepEqual(geometry.starboard.spool, {
    x: rigPartById['claw.starboard.mount'].transform.x
      + rigPartById['spool.starboard'].transform.x,
    y: rigPartById['claw.starboard.mount'].transform.y
      + rigPartById['spool.starboard'].transform.y
  });
  assert.deepEqual(geometry.port.clawRest, {
    x: rigPartById['claw.port.mount'].transform.x,
    y: rigPartById['claw.port.mount'].transform.y
  });
  assert.deepEqual(geometry.starboard.clawRest, {
    x: rigPartById['claw.starboard.mount'].transform.x,
    y: rigPartById['claw.starboard.mount'].transform.y
  });
  assert.equal(new Set(partIds).size, partIds.length);
  for (const side of ['port', 'starboard']) {
    assert.ok(partIds.includes(`claw.${side}.mount`));
    assert.ok(partIds.includes(`spool.${side}`));
    assert.ok(partIds.includes(`claw.${side}.palm`));
    assert.ok(partIds.includes(`claw.${side}.pincer.upper`));
    assert.ok(partIds.includes(`claw.${side}.pincer.lower`));
    const layout = pose.exports.resolveFrontierCrownclawNeutralChainLayout(side);
    assert.equal(layout.length, runtime.exports.FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT);
    assert.equal(layout[0].partId, `chain.${side}.0`);
    assert.equal(layout.at(-1).partId, `chain.${side}.9`);
    assert.equal(Object.isFrozen(layout), true);
    layout.forEach((entry) => assert.equal(Object.isFrozen(entry), true));
  }
  assert.ok(partIds.includes('rear-appendage.port'));
  assert.ok(partIds.includes('rear-appendage.starboard'));
  [
    'hull.closed',
    'hull.open',
    'hull.damaged',
    'claw.closed',
    'claw.open',
    'claw.harpoon',
    'reactor.idle.0',
    'reactor.idle.1',
    'reactor.charge',
    'reactor.overcharged',
    'beam.0',
    'beam.1',
    'beam.2',
    'beam.3',
    'claw-impact.0',
    'chain-tension.0',
    'winch-retract.0',
    'mechanical-reseat.0',
    'damage.spark.0',
    'shell-crack-burst.0',
    'armor-explosion.0',
    'reactor-collapse.0'
  ].forEach(assertAtlasFrame);
});

test('neutral Crownclaw breathes, articulates its legs, and preserves connected slack chains', () => {
  const resolved = pose.exports.resolveFrontierCrownclawModularPose(baseInput);
  const overrides = resolved.partOverrides;
  assert.equal(resolved.phaseTwo, false);
  assert.equal(resolved.portChain.lifecycle, 'seated');
  assert.equal(resolved.starboardChain.lifecycle, 'seated');
  assert.equal(resolved.portChain.reseated, true);
  assert.equal(resolved.starboardChain.reseated, true);
  assert.ok(Number.isFinite(overrides.root.yOffset));
  assert.notEqual(
    overrides['leg.port.front'].rotationOffset,
    overrides['leg.port.mid'].rotationOffset
  );
  assert.notEqual(
    overrides['mandible.port'].rotationOffset,
    overrides['mandible.starboard'].rotationOffset
  );
  assert.equal(overrides['chain.port.0'].visible, true);
  assert.equal(overrides['chain.starboard.9'].visible, true);
  assert.equal(overrides.body.frameId, 'hull.closed');
  assert.equal(overrides['claw.port.palm'].frameId, 'claw.closed');
  assert.equal(overrides['claw.starboard.palm'].frameId, 'claw.closed');
  assert.equal(overrides.reactor.frameId, 'reactor.idle.0');
  assert.equal(overrides.beam.visible, false);
  assert.equal(overrides['chain-contact'].visible, false);
  assert.equal(overrides['damage-vfx'].visible, false);
  const nextIdleFrame = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    frameCount: 126
  });
  assert.equal(nextIdleFrame.partOverrides.reactor.frameId, 'reactor.idle.1');
  assert.equal(Object.isFrozen(overrides), true);
});

test('Chainclaw Harpoon moves the selected claw and every link while the other claw stays seated', () => {
  const warning = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'chainclaw-harpoon',
      stage: 'warning',
      progress: 1,
      side: 'port',
      sequence: 2,
      motionCue: 'frontier-chainclaw-harpoon'
    }
  });
  const firing = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'chainclaw-harpoon',
      stage: 'fire',
      progress: 0.5,
      side: 'port',
      sequence: 2,
      motionCue: 'frontier-chainclaw-harpoon'
    }
  });

  assert.equal(warning.portChain.lifecycle, 'unspooling');
  assert.equal(firing.portChain.lifecycle, 'tensioned');
  assert.equal(firing.starboardChain.lifecycle, 'seated');
  assert.ok(Math.abs(firing.partOverrides['claw.port.palm'].xOffset) > 1);
  assert.equal(firing.partOverrides['claw.starboard.palm'].xOffset, 0);
  assert.notEqual(
    firing.partOverrides['chain.port.5'].xOffset,
    warning.partOverrides['chain.port.5'].xOffset
  );
  assert.ok(firing.partOverrides['spool.port'].scaleXMultiplier > 1);
  assert.equal(firing.partOverrides['claw.port.pincer.upper'].alpha, 1);
  assert.equal(warning.partOverrides['claw.port.palm'].frameId, 'claw.open');
  assert.equal(firing.partOverrides['claw.port.palm'].frameId, 'claw.harpoon');
  assert.equal(
    firing.partOverrides['claw.port.palm'].visible,
    false,
    'the live gameplay harpoon sprite owns the fired claw without a duplicate rig palm'
  );
  assert.equal(
    firing.partOverrides['chain.port.5'].visible,
    false,
    'live gameplay chain-link sprites replace the rig-local links during fire'
  );
  assert.equal(firing.partOverrides['claw.starboard.palm'].frameId, 'claw.closed');
  assert.equal(firing.partOverrides['chain-contact'].frameId, 'chain-tension.0');
  assert.equal(firing.partOverrides['chain-contact'].visible, false);
});

test('Chainclaw contact frames remain deterministic while live fire owns exact world-space VFX', () => {
  const expectedFrames = [
    [0.3, 'claw-impact.0'],
    [0.5, 'chain-tension.0'],
    [0.75, 'winch-retract.0'],
    [0.96, 'mechanical-reseat.0']
  ];
  for (const [progress, expectedFrameId] of expectedFrames) {
    const resolved = pose.exports.resolveFrontierCrownclawModularPose({
      ...baseInput,
      action: {
        primitiveId: 'chainclaw-harpoon',
        stage: 'fire',
        progress,
        side: 'port',
        sequence: 2,
        motionCue: 'frontier-chainclaw-harpoon'
      }
    });
    assert.equal(resolved.partOverrides['chain-contact'].visible, false);
    assert.equal(resolved.partOverrides['chain-contact'].frameId, expectedFrameId);
    assertAtlasFrame(resolved.partOverrides['chain-contact'].frameId);
  }
  const recovery = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'chainclaw-harpoon',
      stage: 'recovery',
      progress: 0.35,
      side: 'port',
      sequence: 2,
      motionCue: 'frontier-chainclaw-harpoon'
    }
  });
  assert.equal(recovery.partOverrides['chain-contact'].visible, true);
  assert.equal(recovery.partOverrides['chain-contact'].frameId, 'mechanical-reseat.0');
});

test('Crown Cross-Link visibly crosses both chains through center without creating a fourth core attack', () => {
  const crossLink = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    phaseIndex: 2,
    phaseProgress: 1,
    healthRatio: 0.42,
    action: {
      primitiveId: 'chainclaw-harpoon',
      stage: 'fire',
      progress: 0.5,
      sequence: 5,
      motionCue: 'frontier-crown-cross-link'
    }
  });

  assert.equal(crossLink.portChain.lifecycle, 'tensioned');
  assert.equal(crossLink.starboardChain.lifecycle, 'tensioned');
  assert.ok(crossLink.portChain.claw.x > 0, 'port claw must cross to starboard space');
  assert.ok(crossLink.starboardChain.claw.x < 0, 'starboard claw must cross to port space');
  assert.equal(crossLink.portChain.chainDamaging, true);
  assert.equal(crossLink.starboardChain.chainDamaging, true);
  assert.ok(Math.abs(crossLink.partOverrides['chain.port.5'].xOffset) > 20);
  assert.ok(Math.abs(crossLink.partOverrides['chain.starboard.5'].xOffset) > 20);
});

test('reactor beam opens the armor and lifts the crown before the firing pose', () => {
  const idle = pose.exports.resolveFrontierCrownclawModularPose(baseInput);
  const earlyWarning = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'crown-reactor-beam',
      stage: 'warning',
      progress: 0.45,
      sequence: 1,
      motionCue: 'frontier-reactor-charge'
    }
  });
  const warning = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'crown-reactor-beam',
      stage: 'warning',
      progress: 0.85,
      sequence: 1,
      motionCue: 'frontier-reactor-charge'
    }
  });
  const firing = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'crown-reactor-beam',
      stage: 'fire',
      progress: 0.5,
      sequence: 1,
      motionCue: 'frontier-reactor-fire'
    }
  });

  assert.ok(warning.shellOpening > idle.shellOpening);
  assert.ok(warning.crownLift > idle.crownLift);
  assert.ok(firing.reactorEnergy > idle.reactorEnergy);
  assert.ok(firing.partOverrides['shell.port'].xOffset < 0);
  assert.ok(firing.partOverrides['shell.starboard'].xOffset > 0);
  assert.ok(firing.partOverrides.crown.yOffset < idle.partOverrides.crown.yOffset);
  assert.equal(earlyWarning.partOverrides.reactor.frameId, 'reactor.charge');
  assert.equal(earlyWarning.partOverrides.beam.visible, false);
  assert.equal(warning.partOverrides.body.frameId, 'hull.open');
  assert.equal(warning.partOverrides.reactor.frameId, 'reactor.overcharged');
  assert.equal(firing.partOverrides.reactor.frameId, 'reactor.overcharged');
  assert.equal(firing.partOverrides.beam.frameId, 'beam.0');
  assert.equal(firing.partOverrides.beam.visible, false);
  const nextBeamFrame = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    frameCount: 123,
    action: {
      primitiveId: 'crown-reactor-beam',
      stage: 'fire',
      progress: 0.5,
      sequence: 1,
      motionCue: 'frontier-reactor-fire'
    }
  });
  assert.equal(nextBeamFrame.partOverrides.beam.frameId, 'beam.1');
});

test('bastion crabwalk uses coordinated leg gait and shell-owned barrage ports', () => {
  const idle = pose.exports.resolveFrontierCrownclawModularPose(baseInput);
  const crabwalk = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    action: {
      primitiveId: 'bastion-crabwalk-barrage',
      stage: 'fire',
      progress: 0.31,
      sequence: 3,
      motionCue: 'frontier-bastion-crabwalk'
    }
  });

  assert.notEqual(crabwalk.partOverrides.root.xOffset, idle.partOverrides.root.xOffset);
  assert.notEqual(
    crabwalk.partOverrides['leg.port.front'].rotationOffset,
    idle.partOverrides['leg.port.front'].rotationOffset
  );
  assert.ok(crabwalk.partOverrides['bastion.port'].rotationOffset < 0);
  assert.ok(crabwalk.partOverrides['bastion.starboard'].rotationOffset > 0);
});

test('Critical Cross-Link visibly changes shell, crown, reactor, and rear appendage anatomy', () => {
  const phaseOne = pose.exports.resolveFrontierCrownclawModularPose(baseInput);
  const phaseTwo = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    phaseIndex: 2,
    phaseProgress: 1,
    healthRatio: 0.45
  });

  assert.equal(phaseTwo.phaseTwo, true);
  assert.ok(phaseTwo.shellOpening > phaseOne.shellOpening);
  assert.ok(phaseTwo.crownLift > phaseOne.crownLift);
  assert.ok(phaseTwo.reactorEnergy > phaseOne.reactorEnergy);
  assert.equal(phaseOne.partOverrides['rear-appendage.port'].visible, false);
  assert.equal(phaseTwo.partOverrides['rear-appendage.port'].visible, true);
  assert.equal(phaseTwo.partOverrides['rear-appendage.starboard'].visible, true);
  assert.ok(phaseTwo.partOverrides['rear-appendage.port'].alpha > 0.9);
  assert.ok(phaseTwo.partOverrides['chain.port.4'].scaleYMultiplier > 1);
  assert.equal(phaseOne.partOverrides.body.frameId, 'hull.closed');
  assert.equal(phaseTwo.partOverrides.body.frameId, 'hull.open');
});

test('low-health and destruction states use bounded authored damage frames', () => {
  const healthy = pose.exports.resolveFrontierCrownclawModularPose(baseInput);
  const severe = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    frameCount: 120,
    healthRatio: 0.2,
    damageStage: 4
  });
  const destruction = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    frameCount: 120,
    healthRatio: 0,
    damageStage: 5,
    action: {
      primitiveId: 'frontier-death',
      stage: 'fire',
      progress: 0.8,
      sequence: 2,
      motionCue: 'frontier-death'
    }
  });

  assert.equal(healthy.partOverrides['damage-vfx'].visible, false);
  assert.equal(severe.partOverrides.body.frameId, 'hull.damaged');
  assert.equal(severe.partOverrides['damage-vfx'].visible, true);
  assert.equal(severe.partOverrides['damage-vfx'].frameId, 'shell-crack-burst.0');
  assert.equal(destruction.partOverrides.body.frameId, 'hull.damaged');
  assert.equal(destruction.partOverrides['damage-vfx'].visible, true);
  assert.equal(destruction.partOverrides['damage-vfx'].frameId, 'reactor-collapse.0');
});

test('ordinary impacts do not flinch the entire boss, while large stagger remains visible', () => {
  const idle = pose.exports.resolveFrontierCrownclawModularPose(baseInput);
  const ordinary = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    reaction: {
      kind: 'impact',
      progress: 0.5,
      direction: 1,
      strength: 0.2
    }
  });
  const stagger = pose.exports.resolveFrontierCrownclawModularPose({
    ...baseInput,
    reaction: {
      kind: 'stagger',
      progress: 0.5,
      direction: -1,
      strength: 1
    }
  });

  assert.deepEqual(plain(ordinary.partOverrides.root), plain(idle.partOverrides.root));
  assert.notDeepEqual(plain(stagger.partOverrides.root), plain(idle.partOverrides.root));
});

test('pose sampling is deterministic, reduced motion preserves authored attack state, and no wall-time RNG is used', () => {
  const input = {
    ...baseInput,
    action: {
      primitiveId: 'chainclaw-harpoon',
      stage: 'fire',
      progress: 0.42,
      side: 'starboard',
      sequence: 7,
      motionCue: 'frontier-chainclaw-harpoon'
    }
  };
  const full = pose.exports.resolveFrontierCrownclawModularPose(input);
  const repeated = pose.exports.resolveFrontierCrownclawModularPose(input);
  const reduced = pose.exports.resolveFrontierCrownclawModularPose({
    ...input,
    reducedMotion: true
  });

  assert.deepEqual(plain(full), plain(repeated));
  assert.ok(
    Math.abs(reduced.partOverrides.root.yOffset - 1.8)
      < Math.abs(full.partOverrides.root.yOffset - 1.8),
    'reduced motion lowers ambient hover without weakening the authored harpoon brace'
  );
  assert.equal(reduced.starboardChain.lifecycle, full.starboardChain.lifecycle);
  assert.equal(
    reduced.partOverrides['claw.starboard.palm'].xOffset,
    full.partOverrides['claw.starboard.palm'].xOffset
  );
  assert.doesNotMatch(
    pose.source,
    /Math\.random|Date\.|performance\.|requestAnimationFrame|setTimeout|setInterval/
  );
});
