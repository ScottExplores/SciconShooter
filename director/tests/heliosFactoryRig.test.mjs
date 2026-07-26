import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { createServer } from 'vite';
import { analyzeBossPixelArtPng } from '../../tools/quantize-boss-pixel-art.mjs';

const { PNG } = pngjs;
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const atlasPath = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'helios-clawcarrier-v2',
  'helios-clawcarrier-v2-atlas.png'
);
const rendererSource = await readFile(
  path.join(repositoryRoot, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
);
const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const model = await vite.ssrLoadModule('/director/src/tools/bosses/bossSandboxModel.ts');
const hierarchy = await vite.ssrLoadModule('/services/pixi/boss-rigs/ModularHierarchyRig.ts');
const helios = await vite.ssrLoadModule('/services/pixi/boss-rigs/HeliosModularPose.ts');
const registration = model.getSandboxBossArtworkRegistration('helios-clawcarrier');
const rig = registration?.modularRig;
const samplePose = registration?.sampleModularPose;

const basePose = Object.freeze({
  frameCount: 0,
  reducedMotion: false,
  healthRatio: 1,
  phaseIndex: 1,
  entranceProgress: 1,
  damageStage: 0
});

const uniqueFrames = (frames, action) => new Set(frames.map((frameCount) => (
  helios.sampleHeliosModularPose({ ...basePose, frameCount, action }).portRotaryFrameId
)));

test('Helios V2 registers one exact connected hierarchy with anatomy-owned sockets', () => {
  assert.ok(registration);
  assert.ok(rig);
  assert.equal(typeof samplePose, 'function');
  assert.equal(helios.validateHeliosRigCompatibility(rig).length, 0);
  assert.equal(rig.manifest.id, 'helios-clawcarrier-v2');
  assert.deepEqual(rig.manifest.designSize, { width: 460, height: 330 });
  assert.deepEqual(
    Array.from(rig.manifest.parts, (part) => part.id),
    Array.from(helios.HELIOS_MODULAR_PART_IDS)
  );
  assert.deepEqual(
    rig.manifest.parts.filter((part) => part.parentId === null).map((part) => part.id),
    ['root']
  );

  for (const part of rig.manifest.parts) {
    const visited = new Set();
    let current = part;
    while (current.parentId !== null) {
      assert.equal(visited.has(current.id), false, `${part.id} must not form a parent cycle`);
      visited.add(current.id);
      current = rig.partById[current.parentId];
      assert.ok(current, `${part.id} must resolve parent ${current?.parentId ?? 'unknown'}`);
    }
    assert.equal(current.id, 'root', `${part.id} must remain connected to the root`);
  }

  assert.deepEqual(
    rig.manifest.sockets.map(({ id, role, partId }) => ({ id, role, partId })),
    [
      { id: 'heavy-muzzle-port', role: 'projectile-muzzle', partId: 'rotary.port' },
      { id: 'heavy-muzzle-starboard', role: 'projectile-muzzle', partId: 'rotary.starboard' },
      { id: 'rotary-muzzle-port', role: 'projectile-muzzle', partId: 'rotary.port' },
      { id: 'rotary-muzzle-starboard', role: 'projectile-muzzle', partId: 'rotary.starboard' },
      { id: 'reactor-core', role: 'core-origin', partId: 'body' },
      { id: 'claw-joint-port', role: 'melee-root', partId: 'claw.port.mount' },
      { id: 'claw-joint-starboard', role: 'melee-root', partId: 'claw.starboard.mount' },
      { id: 'claw-tip-port', role: 'melee-root', partId: 'claw.port' },
      { id: 'claw-tip-starboard', role: 'melee-root', partId: 'claw.starboard' }
    ]
  );
});

test('Helios paired crossfire uses true multi-frame spin-up, full fire, and recovery spin-down', () => {
  const warning = Object.freeze({
    primitiveId: 'paired-cannon-burst',
    motionCue: 'paired-crossfire',
    stage: 'warning',
    progress: 0.72,
    sequence: 0
  });
  const firing = Object.freeze({ ...warning, stage: 'fire', progress: 0.4 });
  const earlyRecovery = Object.freeze({ ...warning, stage: 'recovery', progress: 0.1 });
  const lateRecovery = Object.freeze({ ...warning, stage: 'recovery', progress: 0.8 });

  assert.equal(uniqueFrames([0, 5, 10, 15], warning).size, 4);
  assert.equal(uniqueFrames([0, 2, 4, 6], firing).size, 4);
  assert.ok(uniqueFrames([0, 5, 10, 15], earlyRecovery).size > 1);
  assert.equal(uniqueFrames([0, 5, 10, 15], lateRecovery).size, 1);

  const early = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 9,
    action: earlyRecovery
  });
  const late = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 9,
    action: lateRecovery
  });
  const stopped = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 9,
    action: { ...lateRecovery, progress: 1 }
  });
  assert.ok(early.rotarySpinEnergy > late.rotarySpinEnergy);
  assert.ok(late.rotarySpinEnergy > stopped.rotarySpinEnergy);
  assert.equal(stopped.rotarySpinEnergy, 0);

  const portFlash = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 0,
    action: { ...firing, side: 'port', elapsedFrames: 2, projectileCount: 3 }
  }).partOverrides;
  const starboardFlash = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 2,
    action: { ...firing, side: 'starboard', elapsedFrames: 2, projectileCount: 3 }
  }).partOverrides;
  const coordinatedPort = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 4,
    action: { ...firing, elapsedFrames: 2, projectileCount: 4 }
  }).partOverrides;
  const coordinatedStarboard = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 8,
    action: { ...firing, elapsedFrames: 6, projectileCount: 4 }
  }).partOverrides;
  const betweenShots = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 9,
    action: { ...firing, elapsedFrames: 5, projectileCount: 4 }
  }).partOverrides;
  assert.equal(portFlash['muzzle.port'].visible, true);
  assert.equal(portFlash['muzzle.starboard'].visible, false);
  assert.equal(starboardFlash['muzzle.port'].visible, false);
  assert.equal(starboardFlash['muzzle.starboard'].visible, true);
  assert.equal(coordinatedPort['muzzle.port'].visible, true);
  assert.equal(coordinatedPort['muzzle.starboard'].visible, false);
  assert.equal(coordinatedStarboard['muzzle.port'].visible, false);
  assert.equal(coordinatedStarboard['muzzle.starboard'].visible, true);
  assert.equal(betweenShots['muzzle.port'].visible, false);
  assert.equal(betweenShots['muzzle.starboard'].visible, false);
  assert.equal(portFlash['muzzle.port'].frameId, 'muzzle.flash.2');
});

test('Helios idle remains restrained while significant reactions and state changes read clearly', () => {
  const idle = helios.sampleHeliosModularPose({ ...basePose, frameCount: 90 });
  const laterIdle = helios.sampleHeliosModularPose({ ...basePose, frameCount: 120 });
  const impact = helios.sampleHeliosModularPose({
    ...basePose,
    frameCount: 90,
    reaction: { kind: 'impact', progress: 0.5, direction: 1, strength: 1.5 }
  });
  const root = idle.partOverrides.root;
  const laterRoot = laterIdle.partOverrides.root;
  const impactRoot = impact.partOverrides.root;

  assert.ok(Math.abs(root.xOffset) <= 3.2);
  assert.ok(Math.abs(root.yOffset) <= 4.1);
  assert.ok(Math.abs(root.rotationOffset) <= 0.016);
  assert.ok(Math.abs(laterRoot.xOffset - root.xOffset) <= 6.3);
  assert.ok(Math.abs(laterRoot.yOffset - root.yOffset) <= 8.1);
  assert.ok(Math.abs(impactRoot.xOffset - root.xOffset) >= 6);
  assert.ok(Math.abs(impactRoot.rotationOffset - root.rotationOffset) >= 0.045);

  const closed = helios.sampleHeliosModularPose(basePose);
  const phaseOpen = helios.sampleHeliosModularPose({ ...basePose, phaseIndex: 2 });
  const recoveryOpen = helios.sampleHeliosModularPose({
    ...basePose,
    action: { primitiveId: 'side-barrage', stage: 'recovery', progress: 0.4 }
  });
  const damaged = helios.sampleHeliosModularPose({
    ...basePose,
    healthRatio: 0.3,
    damageStage: 4
  });
  assert.equal(closed.bodyFrameId, 'body.closed');
  assert.equal(closed.reactorOpen, false);
  assert.equal(phaseOpen.bodyFrameId, 'body.open');
  assert.equal(phaseOpen.reactorOpen, true);
  assert.equal(recoveryOpen.bodyFrameId, 'body.open');
  assert.equal(recoveryOpen.reactorOpen, true);
  assert.equal(damaged.bodyFrameId, 'body.damaged');
  assert.equal(damaged.reactorOpen, true);
});

test('Helios projectile profiles resolve four compatible frames from the registered atlas', () => {
  assert.ok(rig);
  assert.deepEqual(Object.keys(registration.projectileAnimations).sort(), [
    'boss-gatling-tracer',
    'boss-heavy-shell',
    'boss-helios-mine',
    'boss-reactor-pellet'
  ]);
  const expectedPrefixes = Object.freeze({
    'boss-heavy-shell': 'heavy-shell.',
    'boss-gatling-tracer': 'gatling-tracer.',
    'boss-helios-mine': 'mine.deploy.',
    'boss-reactor-pellet': 'reactor-pellet.'
  });
  for (const [kind, animation] of Object.entries(registration.projectileAnimations)) {
    assert.equal(animation.frameIds.length, 4, `${kind} must be a four-frame pixel cycle`);
    assert.equal(new Set(animation.frameIds).size, 4, `${kind} frames must be distinct`);
    assert.ok(animation.frameHoldFrames >= 1 && animation.frameHoldFrames <= 4);
    assert.ok(animation.minimumVisualHeight >= 14);
    assert.ok(animation.entityHeightScale > 1);
    const dimensions = animation.frameIds.map((frameId) => {
      assert.match(frameId, new RegExp(`^${expectedPrefixes[kind].replace('.', '\\.')}`));
      assert.ok(rig.frameById[frameId], `${kind}/${frameId} must exist in the global frame index`);
      assert.equal(rig.atlasByFrameId[frameId], rig.manifest.atlas);
      return {
        width: rig.frameById[frameId].width,
        height: rig.frameById[frameId].height
      };
    });
    assert.deepEqual(
      dimensions,
      Array.from({ length: 4 }, () => dimensions[0]),
      `${kind} frames need equal registered canvases`
    );
  }
});

test('Helios runtime atlas is hash-pinned, visible, binary-alpha, and palette-bounded', async () => {
  assert.ok(rig);
  const bytes = await readFile(atlasPath);
  const image = PNG.sync.read(bytes);
  const analysis = analyzeBossPixelArtPng(image);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), model.HELIOS_CLAWCARRIER_SHEET_SHA256);
  assert.equal(image.width, rig.manifest.atlas.width);
  assert.equal(image.height, rig.manifest.atlas.height);
  assert.equal(analysis.semitransparentPixels, 0);
  assert.ok(analysis.transparentPixels > 0);
  assert.ok(analysis.opaquePaletteSize <= 128, `Helios atlas palette is ${analysis.opaquePaletteSize}`);

  for (const [frameId, frame] of Object.entries(rig.manifest.atlas.frames)) {
    assert.ok(frame.x >= 0 && frame.y >= 0, `${frameId} starts in bounds`);
    assert.ok(frame.width > 0 && frame.height > 0, `${frameId} has positive dimensions`);
    assert.ok(frame.x + frame.width <= image.width, `${frameId} stays inside atlas width`);
    assert.ok(frame.y + frame.height <= image.height, `${frameId} stays inside atlas height`);
    let visiblePixels = 0;
    for (let y = frame.y; y < frame.y + frame.height; y += 1) {
      for (let x = frame.x; x < frame.x + frame.width; x += 1) {
        if (image.data[((y * image.width + x) * 4) + 3] === 255) visiblePixels += 1;
      }
    }
    assert.ok(visiblePixels > 0, `${frameId} contains opaque pixel art`);
  }
});

test('destroyed crown-claw components leave Helios inner rotary weapons renderable', () => {
  const methodStart = rendererSource.indexOf('private drawModularPreviewBoss(');
  const methodEnd = rendererSource.indexOf('\n  private drawWingbeatHoverPreviewBossAtlas(', methodStart);
  const methodSource = rendererSource.slice(methodStart, methodEnd);
  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  const componentMapping = methodSource.slice(
    methodSource.indexOf('const sideBreakableRole'),
    methodSource.indexOf('const destroyedByComponent')
  );
  assert.match(componentMapping, /part\.role === 'arm'/);
  assert.match(componentMapping, /part\.role === 'armor'/);
  assert.match(componentMapping, /part\.role === 'pod'/);
  assert.doesNotMatch(componentMapping, /part\.role === 'weapon'/);
  assert.equal(rig.partById['rotary.port'].role, 'weapon');
  assert.equal(rig.partById['rotary.starboard'].role, 'weapon');
  assert.equal(rig.partById['claw.port'].role, 'arm');
  assert.equal(rig.partById['claw.starboard'].role, 'arm');
  assert.match(methodSource, /&& !destroyedByComponent/);
});
