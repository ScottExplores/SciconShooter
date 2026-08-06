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
const sandboxModel = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
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
  assert.equal(
    packageDefinition.artwork.url.endsWith('/reference/singularity-reach-commander-canonical.png'),
    true
  );
  assert.equal(
    packageDefinition.artwork.contentHash,
    '2c8401e89268951be1e9cf851f13c6cf4ad80969ca9ac4afbfeabcd4f17093ac'
  );
  assert.equal(packageDefinition.artwork.modularRigManifest, manifest);
  assert.equal(
    packageDefinition.artwork.modularReferenceComparison.url,
    packageDefinition.artwork.url
  );
  assert.equal(packageDefinition.artwork.modularReferenceComparison.width, 384);
  assert.equal(packageDefinition.artwork.modularReferenceComparison.height, 384);
  assert.equal(packageDefinition.artwork.modularReferenceComparison.landmarks.length, 5);

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
  assert.deepEqual(plain(registration.frameById['rig.core-neutral']), {
    x: 278,
    y: 62,
    width: 100,
    height: 102
  });
  assert.deepEqual(plain(registration.frameById['rig.joint-cap']), {
    x: 411,
    y: 267,
    width: 45,
    height: 65
  });
  assert.equal(registration.manifest.preserveAspectRatio, true);
  assert.equal(registration.partById.core.frameId, 'rig.core-neutral');
  assert.equal(registration.partById.core.transform.scaleX, 0.82);
  assert.equal(registration.partById.core.transform.scaleY, 0.82);
  assert.equal(registration.partById['claw.port'].transform.scaleX, 0.72);
  assert.equal(registration.partById['claw.starboard'].transform.scaleX, 0.72);
  assert.equal(registration.partById['pylon.port'].transform.scaleX, 0.86);
  assert.equal(registration.partById['pylon.starboard'].transform.scaleX, 0.86);
  assert.equal(
    registration.partById['pylon.port.mount'].transform.x,
    -registration.partById['pylon.starboard.mount'].transform.x
  );
  assert.equal(
    registration.partById['claw.port.mount'].transform.x,
    -registration.partById['claw.starboard.mount'].transform.x
  );
  assert.ok(
    Math.abs(registration.partById['pylon.port.mount'].transform.x)
      > Math.abs(registration.partById['claw.port.mount'].transform.x),
    'upper pylons must reproduce the wider archived silhouette'
  );

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

  const structuralParts = resolved.parts.filter((part) => (
    part.visible
    && part.frame
    && part.anchor
    && part.role !== 'effect'
  ));
  const alphaBoundsByPart = Object.freeze({
    'rear-armor': Object.freeze({ left: -22.5, top: -32.5, right: 22.5, bottom: 32.5 }),
    'pylon.port': Object.freeze({ left: -53, top: -91, right: 55, bottom: 92 }),
    'pylon.starboard': Object.freeze({ left: -53, top: -91, right: 54, bottom: 90 }),
    'claw.port': Object.freeze({ left: -56, top: -90, right: 52, bottom: 91 }),
    'claw.starboard': Object.freeze({ left: -53, top: -90, right: 56, bottom: 91 }),
    body: Object.freeze({ left: -62, top: -91, right: 65, bottom: 91 }),
    core: Object.freeze({ left: -50, top: -51, right: 50, bottom: 51 })
  });
  const corners = structuralParts.flatMap((part) => {
    const bounds = alphaBoundsByPart[part.id];
    assert.ok(bounds, `missing audited alpha bounds for ${part.id}`);
    const { left, top, right, bottom } = bounds;
    return [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => ({
      x: part.worldTransform.a * x + part.worldTransform.c * y + part.worldTransform.tx,
      y: part.worldTransform.b * x + part.worldTransform.d * y + part.worldTransform.ty
    }));
  });
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));
  const width = maxX - minX;
  const height = maxY - minY;
  assert.ok(width >= 270 && width <= 300, `neutral width ${width} must match the archive`);
  assert.ok(height >= 255 && height <= 285, `neutral height ${height} must match the archive`);
  assert.ok(width / height >= 0.98 && width / height <= 1.1);
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
  assert.equal(critical.core.frameId, 'rig.core-neutral');
  assert.equal(critical['effect.damage.sparks'].visible, true);
  assert.equal(critical['effect.damage.wisps'].visible, true);
  assert.equal(critical['effect.damage.debris'].visible, true);

  const well = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-gravity-well-genesis', stage: 'telegraph', progress: 0.8, sequence: 0 }
  });
  assert.equal(well['effect.gravity-seed'].visible, true);
  assert.equal(well.core.frameId, 'rig.core-neutral');

  const queuedWell = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-gravity-well-genesis', stage: 'transition', progress: 0.5, sequence: 0 }
  });
  assert.equal(queuedWell['effect.gravity-seed'].visible, true);
  assert.ok(
    queuedWell.core.scaleXMultiplier > idle.core.scaleXMultiplier,
    'a queued move must visibly prepare before its warning begins'
  );

  const firingWell = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-gravity-well-genesis', stage: 'fire', progress: 0.4, sequence: 0 }
  });
  assert.equal(firingWell['effect.gravity-seed'].visible, true);
  assert.equal(firingWell['effect.gravity-seed'].frameId, 'well.grow');

  const beam = samplePose({
    ...basePose,
    action: { primitiveId: 'singularity-event-horizon-gaze', stage: 'fire', progress: 0.4, sequence: 1 }
  });
  assert.equal(beam.core.frameId, 'rig.core-neutral');
  assert.equal(beam['effect.beam'].visible, true);

  const pincer = samplePose({
    ...basePose,
    phaseIndex: 2,
    action: { primitiveId: 'singularity-tidal-claw-pincer', stage: 'fire', progress: 0.55, sequence: 2 }
  });
  assert.equal(pincer['effect.claw.port'].visible, true);
  assert.equal(pincer['effect.claw.starboard'].visible, true);
  assert.ok(pincer['claw.port.mount'].xOffset > idle['claw.port.mount'].xOffset);

  const recoveringPincer = samplePose({
    ...basePose,
    phaseIndex: 2,
    action: { primitiveId: 'singularity-tidal-claw-pincer', stage: 'recovery', progress: 0.35, sequence: 2 }
  });
  assert.equal(recoveringPincer['effect.claw.port'].visible, true);
  assert.equal(recoveringPincer['effect.claw.port'].frameId, 'claw.impact');
  assert.equal(recoveringPincer['effect.claw.starboard'].frameId, 'claw.impact');

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
  assert.equal(collapse.core.frameId, 'rig.core-neutral');
  assert.equal(collapse['effect.phase-distortion'].visible, true);

  const returnedToIdle = samplePose(basePose);
  assert.deepEqual(
    plain(returnedToIdle),
    plain(idle),
    'attack sampling must never accumulate transforms into the canonical idle layout'
  );
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
  assert.ok(animations['boss-singularity-bolt'].minimumVisualHeight >= 42);
  assert.equal(animations['boss-singularity-bolt'].entityHeightScale, 2);
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

test('M35 Campaign and its Boss Sandbox choice use one identical boss definition and artwork package', () => {
  const level = campaign.levels.find((candidate) => candidate.order === 35);
  assert.ok(level);
  const choice = sandboxModel.buildBossSandboxGroups(campaign)
    .flatMap((group) => group.choices)
    .find((candidate) => candidate.source === 'campaign' && candidate.missionOrder === 35);
  assert.ok(choice);
  const preview = sandboxModel.buildBossSandboxPreview(campaign, choice);
  const campaignEvent = level.waves
    .flatMap((candidate) => candidate.events)
    .find((candidate) => candidate.id === choice.eventId);
  const previewEvent = preview.previewWave.events
    .find((candidate) => candidate.id === choice.eventId);
  assert.ok(campaignEvent);
  assert.ok(previewEvent);
  assert.deepEqual(plain({
    bossId: previewEvent.bossId,
    health: previewEvent.health,
    phases: previewEvent.phases,
    weapons: previewEvent.weapons,
    timeline: previewEvent.timeline
  }), plain({
    bossId: campaignEvent.bossId,
    health: campaignEvent.health,
    phases: campaignEvent.phases,
    weapons: campaignEvent.weapons,
    timeline: campaignEvent.timeline
  }));

  const campaignArtwork = registryModule.resolveCampaignBossArtwork(
    campaign,
    level.id,
    choice.waveId
  );
  const sandboxArtwork = registryModule.resolveCampaignBossArtwork(
    preview.campaign,
    preview.levelId,
    preview.waveId
  );
  assert.ok(campaignArtwork);
  assert.ok(sandboxArtwork);
  assert.equal(sandboxArtwork.url, campaignArtwork.url);
  assert.equal(sandboxArtwork.contentHash, campaignArtwork.contentHash);
  assert.equal(sandboxArtwork.modularRig.manifest, campaignArtwork.modularRig.manifest);
  assert.deepEqual(
    Object.keys(sandboxArtwork.projectileAnimations),
    Object.keys(campaignArtwork.projectileAnimations)
  );
});
