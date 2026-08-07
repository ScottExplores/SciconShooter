import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
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

const artworkModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/UmbraNeedlewingArtwork.ts'
);
const poseModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/UmbraNeedlewingModularPose.ts'
);
const hierarchyModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularHierarchyRig.ts'
);
const socketModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);
const projectileModule = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossProjectilePresentationRuntime.ts'
);
const sandboxModel = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);

const packageDefinition = artworkModule.UMBRA_NEEDLEWING_ARTWORK_PACKAGE;
const registration = artworkModule.UMBRA_NEEDLEWING_MODULAR_RIG;
const manifest = artworkModule.UMBRA_NEEDLEWING_RIG_MANIFEST;
const samplePose = poseModule.sampleUmbraNeedlewingModularPose;
const plain = (value) => JSON.parse(JSON.stringify(value));
const basePose = Object.freeze({
  frameCount: 120,
  reducedMotion: false,
  healthRatio: 1,
  phaseIndex: 1,
  entranceProgress: 1,
  damageStage: 0,
  action: null
});

test('Umbra package pins the exact neutral, atlas, and locked comparison bytes', async () => {
  assert.equal(packageDefinition.bossId, 'umbra-needlewing');
  assert.equal(packageDefinition.artwork.url, artworkModule.UMBRA_NEEDLEWING_NEUTRAL_URL);
  assert.equal(packageDefinition.artwork.modularRigManifest, manifest);
  assert.equal(packageDefinition.artwork.renderMode, 'articulated');

  const assets = [
    {
      file: 'umbra-needlewing-neutral.png',
      hash: artworkModule.UMBRA_NEEDLEWING_NEUTRAL_SHA256,
      url: artworkModule.UMBRA_NEEDLEWING_NEUTRAL_URL
    },
    {
      file: 'umbra-needlewing-atlas.png',
      hash: artworkModule.UMBRA_NEEDLEWING_ATLAS_SHA256,
      url: artworkModule.UMBRA_NEEDLEWING_ATLAS_URL
    },
    {
      file: 'umbra-needlewing-reference.png',
      hash: artworkModule.UMBRA_NEEDLEWING_REFERENCE_SHA256,
      url: artworkModule.UMBRA_NEEDLEWING_REFERENCE_URL
    }
  ];
  for (const asset of assets) {
    const bytes = await readFile(path.join(
      repositoryRoot,
      'director-data',
      'prototype-assets',
      'umbra-needlewing',
      asset.file
    ));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.hash);
    assert.ok(asset.url.includes(asset.hash));
  }
});

test('Umbra registers one complete aspect-preserving hierarchy and all moving sockets', () => {
  assert.equal(hierarchyModule.validateModularBossRigManifest(manifest).length, 0);
  assert.equal(poseModule.validateUmbraNeedlewingRigCompatibility(registration).length, 0);
  assert.equal(manifest.preserveAspectRatio, true);
  assert.equal(Object.keys(registration.frameById).length, 33);
  assert.equal(registration.manifest.parts.length, poseModule.UMBRA_NEEDLEWING_PART_IDS.length);
  assert.equal(registration.manifest.sockets.length, poseModule.UMBRA_NEEDLEWING_SOCKET_IDS.length);
  assert.equal(registration.manifest.animations.length, 4);
  assert.deepEqual(
    registration.manifest.parts.filter((part) => part.parentId === null).map((part) => part.id),
    ['root']
  );
  assert.equal(registration.partById.root.transform.x, 0);
  assert.equal(registration.partById.root.transform.y, -4);
  assert.equal(
    registration.manifest.parts.filter((part) => part.role === 'arm').length,
    8
  );

  const neutral = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    samplePose(basePose)
  );
  const visibleWings = neutral.parts.filter((part) => (
    part.visible && /^wing\.(?:port|starboard)\.\d$/.test(part.id)
  ));
  assert.equal(visibleWings.length, 8);
  assert.equal(neutral.partById.body.visible, true);
  assert.equal(neutral.partById.core.frameId, 'core.closed');
  for (const socketId of poseModule.UMBRA_NEEDLEWING_SOCKET_IDS) {
    assert.ok(Number.isFinite(neutral.socketById[socketId].worldX));
    assert.ok(Number.isFinite(neutral.socketById[socketId].worldY));
  }
});

test('Umbra pose deterministically owns wing fire, core rings, locks, re-entry, and escape anatomy', () => {
  const idle = samplePose(basePose);
  assert.deepEqual(plain(idle), plain(samplePose(basePose)));
  assert.notEqual(
    idle['wing.port.0.mount'].rotationOffset,
    samplePose({ ...basePose, frameCount: 150 })['wing.port.0.mount'].rotationOffset
  );

  const portShear = samplePose({
    ...basePose,
    action: {
      primitiveId: 'side-barrage',
      motionCue: 'umbra-needle-lattice',
      side: 'port',
      stage: 'fire',
      progress: 0.35,
      sequence: 2
    }
  });
  assert.equal(portShear['needle.mount.port'].visible, true);
  assert.equal(portShear['needle.mount.starboard'].visible, false);
  assert.equal(portShear['eye.port'].visible, true);
  assert.equal(portShear['eye.starboard'].visible, false);

  const ring = samplePose({
    ...basePose,
    phaseIndex: 2,
    action: {
      primitiveId: 'gap-ring',
      motionCue: 'umbra-wing-shard-gate',
      stage: 'fire',
      progress: 0.4,
      sequence: 3
    }
  });
  assert.equal(ring.core.frameId, 'core.open');
  assert.notEqual(
    ring['wing.port.0.mount'].rotationOffset,
    idle['wing.port.0.mount'].rotationOffset
  );

  const lock = samplePose({
    ...basePose,
    action: {
      primitiveId: 'corner-ambush-beam',
      motionCue: 'umbra-predator-lock',
      stage: 'warning',
      progress: 0.75,
      sequence: 1
    }
  });
  assert.equal(lock['needle.launcher'].visible, true);
  assert.equal(lock['vfx.reticle'].visible, true);

  const phaseTransition = samplePose({
    ...basePose,
    phaseIndex: 2,
    phaseProgress: 0.5
  });
  assert.equal(phaseTransition.core.frameId, 'core.open');
  assert.equal(phaseTransition['vfx.reentry'].visible, true);
  assert.ok(phaseTransition['vfx.reentry'].alpha > 0);
  assert.ok(
    Math.abs(phaseTransition['wing.port.0.mount'].rotationOffset)
      > Math.abs(idle['wing.port.0.mount'].rotationOffset)
  );

  const hiddenWarning = samplePose({
    ...basePose,
    vanishReentry: { stage: 'reentry-warning', progress: 0.62, opacity: 0 }
  });
  assert.equal(hiddenWarning.body.visible, false);
  assert.equal(hiddenWarning['vfx.reentry'].visible, true);
  assert.equal(hiddenWarning['vfx.reentry'].frameId, 'reentry.2');
  assert.ok(hiddenWarning['vfx.reentry'].alpha > 0);

  const escapeCharge = samplePose({
    ...basePose,
    escape: {
      stage: 'escape-charge',
      progress: 0.8,
      opacity: 1,
      trailIntensity: 0.72
    }
  });
  assert.equal(escapeCharge['escape.module'].visible, true);
  assert.equal(escapeCharge['vfx.escape-flame'].visible, true);
  assert.equal(escapeCharge['vfx.dash-trail'].visible, true);

  const escaped = samplePose({
    ...basePose,
    escape: { stage: 'complete', progress: 1, opacity: 0, trailIntensity: 0 }
  });
  assert.equal(escaped.body.visible, false);
  assert.equal(escaped['escape.module'].visible, false);
});

test('Umbra moving sockets select the exact anatomy that owns each attack', () => {
  const sampler = socketModule.createModularBossWeaponSocketPoseSampler(
    registration,
    samplePose
  );
  const sampleIds = (action) => sampler({ ...basePose, action })
    .sockets.map((socket) => socket.id)
    .sort();

  assert.deepEqual(sampleIds(null), [
    'core.emitter',
    'needle.port.muzzle',
    'needle.starboard.muzzle'
  ]);
  assert.deepEqual(sampleIds({
    primitiveId: 'side-barrage',
    motionCue: 'umbra-needle-lattice',
    side: 'port',
    stage: 'fire',
    progress: 0.5
  }), ['needle.port.muzzle']);
  assert.deepEqual(sampleIds({
    primitiveId: 'gap-ring',
    motionCue: 'umbra-wing-shard-gate',
    stage: 'fire',
    progress: 0.5
  }), ['core.emitter']);
  assert.deepEqual(sampleIds({
    primitiveId: 'corner-ambush-beam',
    motionCue: 'umbra-predator-lock',
    stage: 'fire',
    progress: 0.5
  }), ['needle.launcher.muzzle']);
});

test('Umbra registers both semantic projectile animations and Sandbox review metadata', () => {
  const animations = artworkModule.UMBRA_NEEDLEWING_PROJECTILE_ANIMATIONS;
  assert.deepEqual(Object.keys(animations), [
    'boss-umbra-needle',
    'boss-umbra-wing-shard'
  ]);
  for (const [kind, animation] of Object.entries(animations)) {
    assert.ok(projectileModule.BOSS_MODULAR_PROJECTILE_VISUAL_KINDS.includes(kind));
    assert.equal(animation.frameIds.length, 4);
    for (const frameId of animation.frameIds) {
      assert.ok(registration.frameById[frameId], `${kind}/${frameId} must resolve`);
    }
  }

  const sandboxRegistration = sandboxModel.getSandboxBossArtworkRegistration(
    'umbra-needlewing'
  );
  assert.ok(sandboxRegistration);
  assert.equal(sandboxRegistration.modularRig, registration);
  assert.equal(sandboxRegistration.sampleModularPose, samplePose);
  assert.equal(
    sandboxRegistration.modularReferenceComparison,
    artworkModule.UMBRA_NEEDLEWING_REFERENCE_COMPARISON
  );
  assert.equal(sandboxRegistration.modularReferenceComparison.landmarks.length, 5);
  assert.equal(
    sandboxRegistration.assembled.contentHash,
    artworkModule.UMBRA_NEEDLEWING_NEUTRAL_SHA256
  );
});
