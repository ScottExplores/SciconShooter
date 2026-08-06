import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const campaign = JSON.parse(await readFile(
  path.join(repositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));
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
  '/services/pixi/boss-rigs/SingularityCommanderArtwork.ts'
);
const poseModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/SingularityCommanderModularPose.ts'
);
const hierarchyModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularHierarchyRig.ts'
);
const socketModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);
const registryModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/CampaignBossArtworkRegistry.ts'
);
const projectileModule = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossProjectilePresentationRuntime.ts'
);

const packageDefinition = artworkModule.SINGULARITY_COMMANDER_ARTWORK_PACKAGE;
const manifest = artworkModule.SINGULARITY_COMMANDER_RIG_MANIFEST;
const registration = hierarchyModule.registerModularBossRig(manifest);
const samplePose = poseModule.sampleSingularityCommanderModularPose;
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

test('Singularity Commander package owns checked-in, hash-verified production art', async () => {
  assert.equal(packageDefinition.bossId, 'singularity-crab');
  assert.equal(packageDefinition.prototypeId, 'singularity-reach-commander');
  assert.equal(packageDefinition.artwork.url.endsWith('/poses/02-neutral-idle.png'), true);
  assert.equal(packageDefinition.artwork.modularRigManifest, manifest);

  const assets = [
    Object.freeze({
      url: packageDefinition.artwork.url,
      contentHash: packageDefinition.artwork.contentHash
    }),
    manifest.atlas,
    ...manifest.supplementalAtlases
  ];
  for (const asset of assets) {
    assert.match(asset.url, /^\/game-art\/generated\/bosses\/singularity-reach-commander\//);
    assert.doesNotMatch(asset.url, /director|__director|boss-test-runner/);
    const filePath = path.join(repositoryRoot, 'public', asset.url.replace(/^\//, ''));
    assert.ok((await stat(filePath)).size > 1_024, `${asset.url} must be non-empty`);
    const digest = createHash('sha256').update(await readFile(filePath)).digest('hex');
    assert.equal(digest, asset.contentHash, `${asset.url} hash must be fresh`);
  }

  const mask = packageDefinition.artwork.collisionMask;
  assert.equal(mask.width, 64);
  assert.equal(mask.height, 64);
  assert.equal(mask.rowWords.length, 128);
  assert.ok(mask.rowWords.some((word) => word !== 0));
  assert.ok(mask.rowWords.some((word) => word === 0));
});

test('Singularity Commander registers one connected modular hierarchy and every required socket', () => {
  assert.equal(
    hierarchyModule.validateModularBossRigManifest(manifest).length,
    0
  );
  assert.equal(
    poseModule.validateSingularityCommanderRigCompatibility(registration).length,
    0
  );
  assert.deepEqual(
    registration.manifest.parts.filter((part) => part.parentId === null).map((part) => part.id),
    ['root']
  );
  assert.deepEqual(
    [...Object.keys(registration.socketById)].sort(),
    [...poseModule.SINGULARITY_COMMANDER_SOCKET_IDS].sort()
  );
  assert.equal(registration.atlases.length, 5);
  assert.equal(Object.keys(registration.frameById).length, 56);

  const resolved = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    samplePose(basePose)
  );
  for (const part of resolved.parts.filter((candidate) => candidate.visible)) {
    assert.equal(part.alpha, 1, `${part.id} must be opaque in neutral pose`);
  }
  for (const socketId of poseModule.SINGULARITY_COMMANDER_SOCKET_IDS) {
    const socket = resolved.socketById[socketId];
    assert.ok(socket, `${socketId} must resolve from the live hierarchy`);
    assert.ok(Number.isFinite(socket.worldX));
    assert.ok(Number.isFinite(socket.worldY));
  }
});

test('pose sampling is deterministic and gives entrance, idle, phases, damage, and attacks purposeful motion', () => {
  const idle = samplePose(basePose);
  assert.deepEqual(plain(idle), plain(samplePose(basePose)));
  assert.equal(Object.isFrozen(idle), true);
  assert.notEqual(
    idle.root.yOffset,
    samplePose({ ...basePose, frameCount: 150 }).root.yOffset,
    'living idle must move over fixed simulation frames'
  );

  const entrance = samplePose({ ...basePose, entranceProgress: 0 });
  assert.notEqual(entrance['pylon.port.mount'].rotationOffset, idle['pylon.port.mount'].rotationOffset);
  assert.notEqual(entrance['claw.port.mount'].xOffset, idle['claw.port.mount'].xOffset);

  const critical = samplePose({ ...basePose, healthRatio: 0.22, phaseIndex: 3, damageStage: 4 });
  assert.equal(critical.core.frameId, 'core.damage.unstable');
  assert.equal(critical['effect.damage.sparks'].visible, true);
  assert.equal(critical['effect.damage.wisps'].visible, true);
  assert.equal(critical['effect.damage.debris'].visible, true);

  const well = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-gravity-well-genesis', stage: 'telegraph', progress: 0.8, sequence: 0 }
  });
  assert.equal(well['effect.gravity-seed'].visible, true);
  assert.equal(well.core.frameId, 'core.charge.full');

  const beam = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-event-horizon-gaze', stage: 'fire', progress: 0.4, sequence: 1 }
  });
  assert.equal(beam.core.frameId, 'core.beam.fire');
  assert.equal(beam['effect.beam'].visible, true);

  const pincer = samplePose({
    ...basePose,
    phaseIndex: 2,
    action: { primitiveId: 'singularity-tidal-claw-pincer', stage: 'fire', progress: 0.55, sequence: 2 }
  });
  assert.equal(pincer['effect.claw.port'].visible, true);
  assert.equal(pincer['effect.claw.starboard'].visible, true);
  assert.ok(pincer['claw.port.mount'].xOffset > idle['claw.port.mount'].xOffset);

  const pylon = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-orbital-pylon-barrage', stage: 'fire', progress: 0.4, sequence: 3 }
  });
  assert.equal(pylon['effect.pylon.port'].visible, true);
  assert.equal(pylon['effect.pylon.starboard'].visible, true);

  const collapse = samplePose({
    ...basePose,
    healthRatio: 0.2,
    phaseIndex: 3,
    action: { primitiveId: 'singularity-gravity-collapse', stage: 'fire', progress: 0.72, sequence: 4 }
  });
  assert.equal(collapse.core.frameId, 'core.damage.unstable');
  assert.equal(collapse['effect.phase-distortion'].visible, true);
});

test('live socket sampler selects only the anatomy that owns each Singularity attack', () => {
  const socketSampler = socketModule.createModularBossWeaponSocketPoseSampler(
    registration,
    samplePose
  );
  const sample = (primitiveId) => socketSampler({
    ...basePose,
    action: { primitiveId, stage: 'fire', progress: 0.5, sequence: 0 }
  }).sockets.map((socket) => socket.id).sort();

  assert.deepEqual(sample('singularity-orbital-pylon-barrage'), [
    'pylon-muzzle-lower-port',
    'pylon-muzzle-lower-starboard',
    'pylon-muzzle-upper-port',
    'pylon-muzzle-upper-starboard'
  ]);
  assert.deepEqual(sample('singularity-tidal-claw-pincer'), [
    'claw-tip-port',
    'claw-tip-starboard'
  ]);
  assert.deepEqual(sample('singularity-event-horizon-gaze'), ['singularity-core']);
  assert.deepEqual(sample('singularity-pulse'), ['singularity-core']);
  assert.deepEqual(sample('singularity-gravity-collapse'), ['singularity-core']);
  assert.deepEqual(sample('singularity-gravity-well-genesis'), [
    'gravity-seed-origin',
    'singularity-core'
  ]);
});

test('all eight Singularity semantic projectile roles resolve validated atlas animation frames', () => {
  const expectedKinds = [
    'boss-singularity-seed',
    'boss-singularity-well',
    'boss-singularity-shard',
    'boss-singularity-beam',
    'boss-singularity-claw',
    'boss-singularity-bolt',
    'boss-singularity-pulse',
    'boss-singularity-collapse'
  ];
  const animations = packageDefinition.artwork.projectileAnimations;
  assert.deepEqual(Object.keys(animations), expectedKinds);
  for (const [kind, animation] of Object.entries(animations)) {
    assert.ok(projectileModule.BOSS_MODULAR_PROJECTILE_VISUAL_KINDS.includes(kind));
    assert.ok(animation.frameIds.length >= 2);
    assert.ok(animation.frameHoldFrames >= 1);
    assert.ok(animation.minimumVisualHeight >= 22);
    assert.ok(animation.entityHeightScale > 0);
    assert.ok(Number.isFinite(animation.orientationOffsetRadians));
    for (const frameId of animation.frameIds) {
      assert.ok(registration.frameById[frameId], `${kind} frame ${frameId} must be registered`);
      assert.ok(registration.atlasByFrameId[frameId], `${frameId} must resolve an owning atlas`);
    }
  }
});

test('M35 resolves the production-owned Singularity package through the canonical registry', () => {
  const level = campaign.levels.find((candidate) => candidate.order === 35);
  assert.ok(level);
  const boss = level.waves
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss');
  assert.equal(boss.bossId, 'singularity-crab');

  const resolved = registryModule.resolveCampaignBossArtwork(campaign, level.id);
  assert.ok(resolved);
  assert.equal(resolved.eventId, boss.id);
  assert.equal(resolved.url, packageDefinition.artwork.url);
  assert.equal(resolved.modularRig.manifest.id, 'singularity-reach-commander');
  assert.equal(typeof resolved.sampleModularPose, 'function');
  assert.equal(resolved.weaponSockets.sockets.length, 8);
  assert.deepEqual(
    Object.keys(resolved.projectileAnimations),
    Object.keys(packageDefinition.artwork.projectileAnimations)
  );
  assert.ok(registryModule.CAMPAIGN_BOSS_ARTWORK_PACKAGE_IDS.includes('singularity-crab'));
});
