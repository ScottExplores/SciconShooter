const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const rigRoot = path.join(root, 'services', 'pixi', 'boss-rigs');
const rendererPath = path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts');

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
    { module: moduleBox, require, Math, Number, Object, String }
  );
  return moduleBox.exports;
};

test('preview atlas contracts keep three exact discriminated part registries', () => {
  const contracts = loadTypescriptModule('PreviewBossRigContracts.ts');
  assert.equal(contracts.SEGMENTED_CRESCENT_PART_IDS.length, 17);
  assert.equal(contracts.ARTICULATED_PINCER_PART_IDS.length, 20);
  assert.equal(contracts.TRANSFORMING_ORBITER_PART_IDS.length, 23);
  assert.equal(new Set(contracts.ARTICULATED_PINCER_PART_IDS).size, 20);
  assert.equal(new Set(contracts.TRANSFORMING_ORBITER_PART_IDS).size, 23);

  assert.deepEqual(
    Array.from(contracts.getPreviewBossProjectilePartIds('articulated-pincer-v1')),
    ['mineLeft', 'mineRight']
  );
  assert.deepEqual(
    Array.from(contracts.getPreviewBossProjectilePartIds('transforming-orbiter-v1')),
    ['nodeA', 'nodeB']
  );
});

test('articulated pincer pose scuttles, recoils one side, opens, and deploys its blade deterministically', () => {
  const { sampleArticulatedPincerPose } = loadTypescriptModule('ArticulatedPincerPose.ts');
  const base = {
    frameCount: 180,
    reducedMotion: false,
    healthRatio: 0.7,
    bankRadians: 0,
    charging: false,
    coreExposed: false,
    finalPhase: false
  };
  const repeated = sampleArticulatedPincerPose(base);
  assert.deepEqual(repeated, sampleArticulatedPincerPose(base));

  const leftVolley = sampleArticulatedPincerPose({
    ...base,
    action: {
      primitiveId: 'pod-volley',
      stage: 'fire',
      progress: 0.1,
      side: 'port',
      sequence: 0
    }
  });
  assert.ok(leftVolley.leftWeaponRecoil > 0.5);
  assert.equal(leftVolley.rightWeaponRecoil, 0);
  assert.ok(leftVolley.leftMineDetach > leftVolley.rightMineDetach);

  const gatlings = sampleArticulatedPincerPose({
    ...base,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.2,
      side: 'port',
      sequence: 0,
      motionCue: 'gatling-barrage'
    }
  });
  assert.ok(gatlings.leftWeaponRecoil > 0);
  assert.ok(gatlings.rightWeaponRecoil > 0);

  const blade = sampleArticulatedPincerPose({
    ...base,
    action: {
      primitiveId: 'rail-sweep',
      stage: 'warning',
      progress: 0.7
    }
  });
  assert.ok(blade.shockBladeAlpha > 0.5);

  const tailBlade = sampleArticulatedPincerPose({
    ...base,
    action: {
      primitiveId: 'tail-fan',
      stage: 'warning',
      progress: 0.7
    }
  });
  assert.notEqual(tailBlade.shockBladeRotation, blade.shockBladeRotation);

  const brace = sampleArticulatedPincerPose({
    ...base,
    shieldActive: true,
    action: {
      primitiveId: 'weave-wall',
      stage: 'warning',
      progress: 0.7,
      sequence: 1
    }
  });
  assert.ok(brace.shieldDeploy > 0.7);
  assert.ok(brace.bodyBob < repeated.bodyBob);
  assert.notEqual(brace.legOuterLeftRotation, repeated.legOuterLeftRotation);

  const opened = sampleArticulatedPincerPose({ ...base, coreExposed: true });
  assert.equal(opened.bodyOpenAmount, 1);

  const breach = sampleArticulatedPincerPose({
    ...base,
    frameCount: 190,
    healthRatio: 0.3,
    coreExposed: true,
    finalPhase: true
  });
  assert.equal(breach.bodyOpenAmount, 1);
  assert.ok(breach.coreHeartbeatScale > 1);
  assert.ok(breach.flameScale > opened.flameScale);
});

test('transforming orbiter pose distinguishes beam, perimeter, and fire-pulse states', () => {
  const { sampleTransformingOrbiterPose } = loadTypescriptModule('TransformingOrbiterPose.ts');
  const base = {
    frameCount: 240,
    reducedMotion: false,
    healthRatio: 0.62,
    bankRadians: 0,
    charging: false,
    coreExposed: false,
    finalPhase: false
  };
  const beam = sampleTransformingOrbiterPose({
    ...base,
    action: {
      primitiveId: 'rotating-cross',
      stage: 'fire',
      progress: 0.15,
      sequence: 2
    }
  });
  const ring = sampleTransformingOrbiterPose({
    ...base,
    action: {
      primitiveId: 'gap-ring',
      stage: 'warning',
      progress: 0.65
    }
  });
  assert.ok(beam.laserHubAlpha > 0.5);
  assert.ok(beam.pulseAlpha > 0.5);
  assert.equal(beam.perimeterAlpha, 0);
  assert.ok(ring.perimeterAlpha > 0.5);
  assert.equal(ring.laserHubAlpha, 0);
  assert.ok(ring.deployment > 0.4);

  const opened = sampleTransformingOrbiterPose({ ...base, finalPhase: true });
  assert.equal(opened.coreOpenAmount, 1);
});

test('transforming orbiter revival becomes limp, restarts, and deploys its rear silhouette deterministically', () => {
  const { sampleTransformingOrbiterPose } = loadTypescriptModule('TransformingOrbiterPose.ts');
  const base = {
    frameCount: 240,
    reducedMotion: false,
    healthRatio: 1,
    bankRadians: 0,
    charging: false,
    coreExposed: false,
    finalPhase: false,
    revivalStage: 'armed',
    revivalProgress: 0,
    revived: false
  };
  const armed = sampleTransformingOrbiterPose(base);
  assert.deepEqual(armed, sampleTransformingOrbiterPose(base));
  assert.equal(armed.revivalControlled, true);
  assert.equal(armed.rearDeployment, 0);
  assert.equal(armed.coreOpenAmount, 0);

  const shutdown = sampleTransformingOrbiterPose({
    ...base,
    reducedMotion: true,
    revivalStage: 'shutdown',
    revived: true
  });
  assert.equal(shutdown.bodyBob, 24);
  assert.equal(shutdown.bodyRotation, 0.16);
  assert.equal(shutdown.rearDeployment, 0);
  assert.equal(shutdown.haloAlpha, 0);
  assert.equal(shutdown.pulseAlpha, 0);
  assert.equal(shutdown.laserHubAlpha, 0);
  assert.ok(shutdown.wingAngle >= 0.7);

  const earlyReboot = sampleTransformingOrbiterPose({
    ...base,
    revivalStage: 'rebooting',
    revivalProgress: 0.28,
    revived: true
  });
  const lateReboot = sampleTransformingOrbiterPose({
    ...base,
    reducedMotion: true,
    revivalStage: 'rebooting',
    revivalProgress: 0.82,
    revived: true
  });
  const lateRebootFullMotion = sampleTransformingOrbiterPose({
    ...base,
    reducedMotion: false,
    revivalStage: 'rebooting',
    revivalProgress: 0.82,
    revived: true
  });
  assert.ok(lateReboot.rearDeployment > earlyReboot.rearDeployment);
  assert.equal(earlyReboot.coreOpenAmount, 0);
  assert.equal(lateReboot.coreOpenAmount, 1);
  assert.ok(lateReboot.pulseFrame > earlyReboot.pulseFrame);
  assert.ok(lateReboot.bodyBob < earlyReboot.bodyBob);
  assert.equal(lateReboot.rearDeployment, lateRebootFullMotion.rearDeployment);
  assert.equal(lateReboot.haloFrame, lateRebootFullMotion.haloFrame);
  assert.equal(lateReboot.haloAlpha, lateRebootFullMotion.haloAlpha);
  assert.equal(lateReboot.pulseFrame, lateRebootFullMotion.pulseFrame);
  assert.equal(lateReboot.pulseAlpha, lateRebootFullMotion.pulseAlpha);

  const complete = sampleTransformingOrbiterPose({
    ...base,
    revivalStage: 'complete',
    revivalProgress: 1,
    revived: true
  });
  assert.equal(complete.rearDeployment, 1);
  assert.equal(complete.coreOpenAmount, 1);
  assert.ok(complete.deployment >= 0.76);

  const legacy = sampleTransformingOrbiterPose({
    ...base,
    revivalStage: 'none',
    revived: false
  });
  const absent = sampleTransformingOrbiterPose({
    frameCount: base.frameCount,
    reducedMotion: base.reducedMotion,
    healthRatio: base.healthRatio,
    bankRadians: base.bankRadians,
    charging: base.charging,
    coreExposed: base.coreExposed,
    finalPhase: base.finalPhase
  });
  assert.deepEqual(legacy, absent);
  assert.equal(legacy.revivalControlled, false);
  assert.equal(legacy.rearDeployment, 1);
});

test('reduced motion damps only ambient rig drift, not authored warning readability', () => {
  const { sampleTransformingOrbiterPose } = loadTypescriptModule('TransformingOrbiterPose.ts');
  const action = {
    primitiveId: 'gap-ring',
    stage: 'warning',
    progress: 0.5
  };
  const full = sampleTransformingOrbiterPose({
    frameCount: 91,
    reducedMotion: false,
    healthRatio: 0.5,
    bankRadians: 0,
    charging: false,
    coreExposed: false,
    finalPhase: false,
    action
  });
  const reduced = sampleTransformingOrbiterPose({
    frameCount: 91,
    reducedMotion: true,
    healthRatio: 0.5,
    bankRadians: 0,
    charging: false,
    coreExposed: false,
    finalPhase: false,
    action
  });
  assert.ok(Math.abs(reduced.bodyBob) < Math.abs(full.bodyBob));
  assert.equal(reduced.perimeterAlpha, full.perimeterAlpha);
  assert.equal(reduced.deployment, full.deployment);
});

test('assembled silhouette motion stays deterministic, opaque, and revival-aware', () => {
  const { sampleAssembledBossMotion } = loadTypescriptModule('AssembledBossMotion.ts');
  const wingbeat = sampleAssembledBossMotion({
    profile: 'wingbeat-hover',
    frameCount: 120,
    reducedMotion: false,
    charging: false
  });
  assert.deepEqual(wingbeat, sampleAssembledBossMotion({
    profile: 'wingbeat-hover',
    frameCount: 120,
    reducedMotion: false,
    charging: false
  }));
  assert.ok(wingbeat.scaleX > 0.95 && wingbeat.scaleX < 1.05);
  assert.ok(wingbeat.scaleY > 0.95 && wingbeat.scaleY < 1.05);

  const shutdown = sampleAssembledBossMotion({
    profile: 'revival-shell',
    frameCount: 120,
    reducedMotion: false,
    charging: false,
    revivalStage: 'shutdown',
    revivalProgress: 0.8
  });
  const rebooting = sampleAssembledBossMotion({
    profile: 'revival-shell',
    frameCount: 120,
    reducedMotion: false,
    charging: false,
    revivalStage: 'rebooting',
    revivalProgress: 0.8
  });
  assert.ok(shutdown.offsetY > rebooting.offsetY);
  assert.ok(shutdown.rotation > rebooting.rotation);
  assert.ok(rebooting.scaleX > shutdown.scaleX);

  const shutdownEnd = sampleAssembledBossMotion({
    profile: 'revival-shell',
    frameCount: 120,
    reducedMotion: false,
    charging: false,
    revivalStage: 'shutdown',
    revivalProgress: 1
  });
  const rebootStart = sampleAssembledBossMotion({
    profile: 'revival-shell',
    frameCount: 120,
    reducedMotion: false,
    charging: false,
    revivalStage: 'rebooting',
    revivalProgress: 0
  });
  assert.deepEqual(rebootStart, shutdownEnd);
});

test('assembled boss accents add deterministic weapon, charge, and revival animation', () => {
  const { sampleAssembledBossAccentPose } = loadTypescriptModule('AssembledBossAccentPose.ts');
  const idle = sampleAssembledBossAccentPose({
    profile: 'wingbeat-hover',
    frameCount: 160,
    reducedMotion: false,
    charging: false,
    healthRatio: 0.8
  });
  const repeated = sampleAssembledBossAccentPose({
    profile: 'wingbeat-hover',
    frameCount: 160,
    reducedMotion: false,
    charging: false,
    healthRatio: 0.8
  });
  assert.deepEqual(idle, repeated);
  assert.ok(idle.nodeAlpha > 0.7);
  assert.equal(idle.coreAlpha, 0);
  assert.equal(idle.pulseAlpha, 0);

  const charging = sampleAssembledBossAccentPose({
    profile: 'paired-resonance',
    frameCount: 160,
    reducedMotion: false,
    charging: true,
    healthRatio: 0.45
  });
  assert.equal(charging.corePart, 'coreOpen');
  assert.equal(charging.coreAlpha, 1);
  assert.equal(charging.pulseAlpha, 0);
  assert.equal(charging.emitterAlpha, 1);
  assert.ok(charging.emitterRecoil > 0);

  const shutdown = sampleAssembledBossAccentPose({
    profile: 'revival-shell',
    frameCount: 160,
    reducedMotion: false,
    charging: false,
    healthRatio: 0,
    revivalStage: 'shutdown',
    revivalProgress: 0.8
  });
  const rebooting = sampleAssembledBossAccentPose({
    profile: 'revival-shell',
    frameCount: 160,
    reducedMotion: false,
    charging: false,
    healthRatio: 0,
    revivalStage: 'rebooting',
    revivalProgress: 0.8
  });
  assert.equal(shutdown.nodeAlpha, 0);
  assert.equal(shutdown.haloAlpha, 0);
  assert.equal(rebooting.corePart, 'coreOpen');
  assert.equal(rebooting.coreAlpha, 1);
  assert.equal(rebooting.pulseAlpha, 1);
});

test('revival shell accents wake by stage and visibly own side, ring, and beam attacks', () => {
  const { sampleAssembledBossAccentPose } = loadTypescriptModule('AssembledBossAccentPose.ts');
  const { sampleAssembledBossMotion } = loadTypescriptModule('AssembledBossMotion.ts');
  const base = {
    profile: 'revival-shell',
    frameCount: 160,
    reducedMotion: false,
    charging: false,
    healthRatio: 1
  };
  const armed = sampleAssembledBossAccentPose({
    ...base,
    revivalStage: 'armed',
    revivalProgress: 0
  });
  const earlyReboot = sampleAssembledBossAccentPose({
    ...base,
    healthRatio: 0,
    revivalStage: 'rebooting',
    revivalProgress: 0.24
  });
  const awakeReboot = sampleAssembledBossAccentPose({
    ...base,
    healthRatio: 0,
    revivalStage: 'rebooting',
    revivalProgress: 0.25
  });
  const complete = sampleAssembledBossAccentPose({
    ...base,
    revivalStage: 'complete',
    revivalProgress: 1
  });

  assert.equal(armed.nodeAlpha, 0);
  assert.equal(earlyReboot.nodeAlpha, 0);
  assert.equal(awakeReboot.nodeAlpha, 1);
  assert.equal(complete.nodeAlpha, 1);
  assert.ok(earlyReboot.nodeDeployment < 0.25);
  assert.ok(awakeReboot.nodeDeployment >= 0.25);
  assert.equal(awakeReboot.corePart, 'coreOpen');
  assert.equal(awakeReboot.coreAlpha, 1);
  assert.equal(awakeReboot.pulseAlpha, 1);

  const port = sampleAssembledBossAccentPose({
    ...base,
    revivalStage: 'complete',
    action: {
      primitiveId: 'side-barrage',
      stage: 'warning',
      progress: 0.75,
      side: 'port',
      sequence: 0
    }
  });
  const starboard = sampleAssembledBossAccentPose({
    ...base,
    revivalStage: 'complete',
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.5,
      side: 'starboard',
      sequence: 1
    }
  });
  assert.equal(port.leftEmitterAlpha, 1);
  assert.equal(port.rightEmitterAlpha, 0);
  assert.ok(port.leftEmitterRecoil > 0);
  assert.equal(port.rightEmitterRecoil, 0);
  assert.equal(starboard.leftEmitterAlpha, 0);
  assert.equal(starboard.rightEmitterAlpha, 1);
  assert.equal(starboard.leftEmitterRecoil, 0);
  assert.ok(starboard.rightEmitterRecoil > 0);

  const ring = sampleAssembledBossAccentPose({
    ...base,
    revivalStage: 'complete',
    action: {
      primitiveId: 'gap-ring',
      stage: 'warning',
      progress: 0.6,
      sequence: 0
    }
  });
  const crossBeam = sampleAssembledBossAccentPose({
    ...base,
    revivalStage: 'complete',
    action: {
      primitiveId: 'cross-beam',
      stage: 'fire',
      progress: 0.5,
      sequence: 0
    }
  });
  assert.equal(ring.perimeterAlpha, 1);
  assert.equal(ring.laserHubAlpha, 0);
  assert.equal(ring.coreAlpha, 1);
  assert.equal(crossBeam.perimeterAlpha, 0);
  assert.equal(crossBeam.laserHubAlpha, 1);
  assert.equal(crossBeam.coreAlpha, 1);

  const motionBase = {
    profile: 'revival-shell',
    frameCount: 160,
    reducedMotion: false,
    charging: false,
    revivalStage: 'complete'
  };
  const idleMotion = sampleAssembledBossMotion(motionBase);
  const portMotion = sampleAssembledBossMotion({
    ...motionBase,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.5,
      side: 'port',
      sequence: 0
    }
  });
  const starboardMotion = sampleAssembledBossMotion({
    ...motionBase,
    action: {
      primitiveId: 'side-barrage',
      stage: 'fire',
      progress: 0.5,
      side: 'starboard',
      sequence: 1
    }
  });
  const ringMotion = sampleAssembledBossMotion({
    ...motionBase,
    action: {
      primitiveId: 'gap-ring',
      stage: 'fire',
      progress: 0.5,
      sequence: 0
    }
  });
  assert.ok(portMotion.rotation < idleMotion.rotation);
  assert.ok(starboardMotion.rotation > idleMotion.rotation);
  assert.ok(ringMotion.offsetY > idleMotion.offsetY);
  assert.ok(ringMotion.scaleX > idleMotion.scaleX);
  assert.ok(ringMotion.scaleY < idleMotion.scaleY);
});

test('wingbeat hover rig animates opaque wings and folds them for a corner ram', () => {
  const { sampleWingbeatHoverPose } = loadTypescriptModule('WingbeatHoverPose.ts');
  const idle = sampleWingbeatHoverPose({
    frameCount: 120,
    reducedMotion: false,
    healthRatio: 0.8,
    charging: false
  });
  const next = sampleWingbeatHoverPose({
    frameCount: 132,
    reducedMotion: false,
    healthRatio: 0.8,
    charging: false
  });
  assert.notEqual(idle.leftWingRotation, next.leftWingRotation);
  assert.notEqual(idle.leftWingY, next.leftWingY);

  const ram = sampleWingbeatHoverPose({
    frameCount: 132,
    reducedMotion: false,
    healthRatio: 0.5,
    charging: true,
    primitiveId: 'corner-ambush-ram',
    stage: 'warning',
    progress: 1
  });
  assert.equal(ram.ramFold, 1);
  assert.ok(ram.leftWingX > idle.leftWingX);
  assert.ok(ram.rightWingX < idle.rightWingX);
  assert.equal(ram.coreOpen, true);
});

test('renderer pools all preview rig profiles and never embeds prototype identity or local paths', () => {
  const renderer = fs.readFileSync(rendererPath, 'utf8');
  assert.match(renderer, /case 'articulated-pincer-v1'/);
  assert.match(renderer, /case 'transforming-orbiter-v1'/);
  assert.match(renderer, /createTypedPreviewBossAtlasRigView/);
  assert.match(renderer, /getPreviewBossProjectilePartIds\(atlas\.kind\)/);
  assert.match(renderer, /candidate\.bossOwnerId === entity\.id/);
  assert.match(renderer, /view\.sprite\.visible = !previewAtlasReady/);
  assert.match(renderer, /this\.resetPreviewBossAtlasRig\(reused\.bossRig\.previewAtlas\)/);
  assert.match(renderer, /this\.destroyPreviewBossAtlasTextures\(\)/);
  assert.match(renderer, /parts\.gatlingLeft\.visible = true/);
  assert.match(renderer, /parts\.gatlingRight\.visible = true/);
  assert.match(renderer, /entity\.bossRevivalStage/);
  assert.match(renderer, /entity\.bossRevivalProgress/);
  assert.match(renderer, /entity\.bossRevivalConsumed/);
  assert.match(renderer, /pose\.rearDeployment \* 4 - index \* 0\.72/);
  assert.match(renderer, /const revivalCoreOpen = pose\.coreOpenAmount >= 0\.5/);
  assert.match(renderer, /parts\.coreClosed\.alpha = 1/);
  assert.match(renderer, /parts\.coreOpen\.alpha = 1/);
  assert.match(renderer, /sampleAssembledBossMotion/);
  assert.match(renderer, /sampleAssembledBossAccentPose/);
  assert.match(renderer, /sampleWingbeatHoverPose/);
  assert.match(renderer, /drawWingbeatHoverPreviewBossAtlas/);
  assert.match(renderer, /drawAssembledPreviewBossAccents/);
  assert.match(renderer, /sampleBossWeaponSockets\(\{/);
  assert.match(renderer, /usesAuthoredSocketLayout/);
  assert.match(renderer, /pose\.nodeDeployment >= deploymentThreshold/);
  assert.match(renderer, /renderMode === 'assembled'/);
  assert.match(renderer, /view\.sprite\.alpha = 1/);
  assert.match(renderer, /view\.sprite\.filters = null/);
  assert.doesNotMatch(
    renderer,
    /helios|aurora|meridian|clawcarrier|storm-engine|director-data|prototype-assets/i
  );

  const presenters = renderer.slice(
    renderer.indexOf('private drawSegmentedCrescentPreviewBossAtlas'),
    renderer.indexOf('private getBossComponentVisualScale')
  );
  assert.doesNotMatch(
    presenters,
    /entity\.(?:x|y|width|height|vx|vy|hp|maxHp|bossComponents)\s*=/,
    'preview presenters must never mutate gameplay or collision state'
  );
});
