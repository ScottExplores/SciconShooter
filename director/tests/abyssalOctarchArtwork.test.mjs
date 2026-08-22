import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
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
  '/services/pixi/boss-rigs/AbyssalOctarchArtwork.ts'
);
const poseModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/AbyssalOctarchModularPose.ts'
);
const rigLayoutModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/AbyssalOctarchRigLayout.ts'
);
const hierarchyModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularHierarchyRig.ts'
);
const projectileModule = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossProjectilePresentationRuntime.ts'
);
const runtimeModule = await vite.ssrLoadModule(
  '/services/gameplay/bosses/AbyssalOctarchRuntime.ts'
);
const limbPresentationModule = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/AbyssalOctarchLimbPresentation.ts'
);

const packageDefinition = artworkModule.ABYSSAL_OCTARCH_ARTWORK_PACKAGE;
const manifest = artworkModule.ABYSSAL_OCTARCH_RIG_MANIFEST;
const registration = artworkModule.ABYSSAL_OCTARCH_MODULAR_RIG;
const samplePose = poseModule.sampleAbyssalOctarchModularPose;
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

test('Abyssal Octarch exposes eight ordered HUD limb states and damage tints', () => {
  assert.deepEqual(
    plain(limbPresentationModule.ABYSSAL_OCTARCH_LIMB_HUD_ORDER),
    plain(runtimeModule.ABYSSAL_OCTARCH_TENTACLE_IDS)
  );
  const resolve = limbPresentationModule.resolveAbyssalOctarchLimbPresentation;
  assert.deepEqual(
    ['healthy', 'damaged', 'critical', 'severed'],
    [
      resolve({ id: 'tentacle-upper-port', hp: 90, maxHp: 100, destroyed: false }),
      resolve({ id: 'tentacle-mid-port', hp: 50, maxHp: 100, destroyed: false }),
      resolve({ id: 'tentacle-lower-starboard', hp: 20, maxHp: 100, destroyed: false }),
      resolve({ id: 'tentacle-ventral-starboard', hp: 20, maxHp: 100, destroyed: true })
    ].map((presentation) => presentation?.state)
  );
  assert.equal(
    resolve({ id: 'tentacle-upper-port', hp: 90, maxHp: 100, destroyed: false })?.indicatorStroke,
    '#67e8f9'
  );
  assert.equal(
    resolve({ id: 'tentacle-upper-starboard', hp: 90, maxHp: 100, destroyed: false })?.indicatorStroke,
    '#e879f9'
  );
  assert.equal(resolve({ id: 'helmet', hp: 1, maxHp: 1, destroyed: false }), null);
});

test('Abyssal Octarch phase entry has a deterministic rage and final-core exposure pose', () => {
  const transitionInput = Object.freeze({
    ...basePose,
    frameCount: 240,
    phaseIndex: 4,
    healthRatio: 0.3,
    phaseProgress: 0.5,
    action: Object.freeze({
      primitiveId: 'abyssal-octarch-phase-enter',
      motionCue: 'octarch-phase-enter',
      stage: 'phase-enter',
      progress: 0.5,
      sequence: 4
    })
  });
  const first = samplePose(transitionInput);
  const repeated = samplePose(transitionInput);
  assert.deepEqual(plain(repeated), plain(first), 'phase reaction must replay deterministically');
  assert.equal(first.body.frameId, 'body.core-exposed');
  assert.equal(first['effect.core'].visible, true);
  assert.equal(first['effect.damage'].visible, true);
  assert.equal(first['effect.void-cloud'].visible, true);
  assert.ok(first.root.yOffset > samplePose({ ...transitionInput, phaseProgress: 0 }).root.yOffset);
  assert.notEqual(
    first['tentacle.0.port.mount'].rotationOffset,
    samplePose({ ...transitionInput, phaseProgress: 0 })['tentacle.0.port.mount'].rotationOffset
  );
});

test('Abyssal Octarch pins only accepted runtime art at content-addressed public URLs', async () => {
  assert.equal(packageDefinition.bossId, 'abyssal-octarch');
  assert.equal(packageDefinition.prototypeId, 'abyssal-octarch');
  assert.equal(packageDefinition.artwork.url, artworkModule.ABYSSAL_OCTARCH_NEUTRAL_URL);
  assert.equal(packageDefinition.artwork.contentHash, artworkModule.ABYSSAL_OCTARCH_NEUTRAL_SHA256);
  assert.equal(packageDefinition.artwork.modularRigManifest, manifest);
  assert.equal(packageDefinition.artwork.renderMode, 'articulated');

  const assets = [
    Object.freeze({
      url: artworkModule.ABYSSAL_OCTARCH_NEUTRAL_URL,
      hash: artworkModule.ABYSSAL_OCTARCH_NEUTRAL_SHA256
    }),
    Object.freeze({
      url: artworkModule.ABYSSAL_OCTARCH_ATLAS_URL,
      hash: artworkModule.ABYSSAL_OCTARCH_ATLAS_SHA256
    }),
    Object.freeze({
      url: artworkModule.ABYSSAL_OCTARCH_REFERENCE_URL,
      hash: artworkModule.ABYSSAL_OCTARCH_REFERENCE_SHA256
    })
  ];
  for (const asset of assets) {
    assert.match(
      asset.url,
      /^\/game-art\/generated\/bosses\/test-packages\/abyssal-octarch-v1\//
    );
    assert.ok(asset.url.includes(asset.hash));
    assert.doesNotMatch(asset.url, /director|__director|prototype-assets/);
    const filePath = path.join(repositoryRoot, 'public', asset.url.replace(/^\//, ''));
    assert.ok((await stat(filePath)).size > 64_000, `${asset.url} must be non-empty`);
    const digest = createHash('sha256').update(await readFile(filePath)).digest('hex');
    assert.equal(digest, asset.hash, `${asset.url} hash must remain fresh`);
  }
});

test('Abyssal Octarch registers one aspect-preserving body with eight independent tentacles', () => {
  assert.equal(hierarchyModule.validateModularBossRigManifest(manifest).length, 0);
  assert.equal(poseModule.validateAbyssalOctarchRigCompatibility(registration).length, 0);
  assert.equal(manifest.preserveAspectRatio, true);
  assert.deepEqual(plain(manifest.designSize), { width: 720, height: 480 });
  assert.equal(Object.keys(registration.frameById).length, 32);
  assert.equal(registration.manifest.parts.length, poseModule.ABYSSAL_OCTARCH_PART_IDS.length);
  assert.equal(registration.manifest.sockets.length, poseModule.ABYSSAL_OCTARCH_SOCKET_IDS.length);
  assert.equal(registration.manifest.animations.length, 5);
  assert.deepEqual(
    registration.manifest.parts.filter((part) => part.parentId === null).map((part) => part.id),
    ['root']
  );
  assert.equal(
    registration.manifest.parts.filter((part) => part.role === 'arm').length,
    8
  );
  rigLayoutModule.ABYSSAL_OCTARCH_NEUTRAL_TENTACLE_MOUNTS.forEach((mount, index) => {
    for (const side of ['port', 'starboard']) {
      const part = registration.partById[`tentacle.${index}.${side}.mount`];
      assert.equal(part.transform.x, side === 'port' ? -mount.x : mount.x);
      assert.equal(part.transform.y, mount.y);
      assert.ok(Math.abs(
        part.transform.rotation
        - (side === 'port' ? mount.portRotation : mount.starboardRotation) * Math.PI / 180
      ) < 1e-12);
    }
  });

  const neutral = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    samplePose(basePose)
  );
  const visibleTentacles = neutral.parts.filter((part) => (
    part.visible && /^tentacle\.\d\.(?:port|starboard)$/.test(part.id)
  ));
  assert.equal(visibleTentacles.length, 8);
  assert.equal(neutral.partById.body.visible, true);
  assert.equal(neutral.partById.body.frameId, 'body.neutral');
  for (const part of neutral.parts.filter((candidate) => (
    candidate.visible && candidate.role !== 'effect'
  ))) {
    assert.equal(part.alpha, 1, `${part.id} must be opaque in the neutral pose`);
  }
  for (const socketId of poseModule.ABYSSAL_OCTARCH_SOCKET_IDS) {
    const socket = neutral.socketById[socketId];
    assert.ok(socket, `${socketId} must resolve`);
    assert.ok(Number.isFinite(socket.worldX));
    assert.ok(Number.isFinite(socket.worldY));
  }
});

test('idle and all eight Octarch motion cues sample deterministic, purposeful anatomy', () => {
  const idle = samplePose(basePose);
  assert.deepEqual(plain(idle), plain(samplePose(basePose)));
  assert.equal(Object.isFrozen(idle), true);
  assert.notEqual(
    idle.root.yOffset,
    samplePose({ ...basePose, frameCount: 154 }).root.yOffset,
    'fixed-frame idle must remain alive'
  );

  const expected = Object.freeze({
    'grasp-and-hurl': (pose) => {
      assert.equal(pose['tentacle.3.port'].frameId, 'tentacle.grasp.reach');
      assert.equal(pose['effect.attack.port'].frameId, 'vfx.grab-ring');
    },
    'tentacle-slam': (pose) => {
      assert.equal(pose['tentacle.1.port'].frameId, 'tentacle.slam.needle');
      assert.equal(pose['effect.attack.port'].frameId, 'vfx.slam-shockwave');
    },
    'sweeping-arm': (pose) => {
      assert.equal(pose['tentacle.0.port'].frameId, 'tentacle.sweep.extended');
      assert.equal(pose['effect.attack.port'].frameId, 'vfx.socket-burst');
    },
    'needle-tip-stab': (pose) => {
      assert.equal(pose['tentacle.1.port'].frameId, 'tentacle.slam.hanging');
      assert.equal(pose['tentacle.2.port'].frameId, 'tentacle.constrict.extended');
      assert.equal(pose['effect.attack.port'].frameId, 'vfx.bolt');
    },
    'constricting-ring': (pose) => {
      assert.equal(pose['tentacle.2.port'].frameId, 'tentacle.constrict.tight');
      assert.equal(pose['effect.void-cloud'].visible, true);
    },
    'suction-current': (pose) => {
      assert.equal(pose['effect.mouth'].visible, true);
      assert.equal(pose['effect.void-cloud'].visible, true);
    },
    'asteroid-hurl': (pose) => {
      assert.equal(pose['tentacle.0.port'].frameId, 'tentacle.grasp.reach');
      assert.equal(pose['tentacle.3.port'].frameId, 'tentacle.grasp.open');
      assert.equal(pose['effect.attack.port'].frameId, 'vfx.asteroid');
    },
    'abyssal-gaze': (pose) => {
      assert.equal(pose.body.frameId, 'body.core-exposed');
      assert.equal(pose['effect.core'].visible, true);
      assert.equal(pose['effect.core'].frameId, 'vfx.beam-segment');
    }
  });

  for (const actionId of runtimeModule.ABYSSAL_OCTARCH_ACTION_IDS) {
    const pose = samplePose({
      ...basePose,
      action: {
        primitiveId: `abyssal-octarch-${actionId}`,
        motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES[actionId],
        side: 'port',
        stage: 'active',
        progress: 0.5,
        sequence: 2
      }
    });
    assert.notDeepEqual(plain(pose), plain(idle), `${actionId} must not look idle`);
    expected[actionId](pose);
  }

  const needlePose = samplePose({
    ...basePose,
    action: {
      primitiveId: 'abyssal-octarch-needle-tip-stab',
      motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES['needle-tip-stab'],
      side: 'port',
      stage: 'active',
      progress: 0.5,
      sequence: 2
    }
  });
  assert.equal(needlePose['tentacle.1.port.mount'].xOffset, idle['tentacle.1.port.mount'].xOffset);
  assert.notEqual(needlePose['tentacle.2.port.mount'].yOffset, idle['tentacle.2.port.mount'].yOffset);
  assert.notEqual(
    needlePose['tentacle.2.port.mount'].rotationOffset,
    idle['tentacle.2.port.mount'].rotationOffset
  );

  const targetedGrab = samplePose({
    ...basePose,
    action: {
      primitiveId: 'abyssal-octarch-grasp-and-hurl',
      motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES['grasp-and-hurl'],
      side: 'port',
      stage: 'held',
      progress: 0.5,
      sequence: 3,
      targetDesignPoint: { x: 18, y: 720 }
    }
  });
  assert.equal(targetedGrab['tentacle.3.port'].frameId, 'tentacle.grasp.closed');
  assert.ok(
    targetedGrab['tentacle.3.port'].scaleXMultiplier > 2,
    'the authored grab arm must reach the held ship instead of leaving invisible contact'
  );
  assert.notEqual(
    targetedGrab['tentacle.3.port.mount'].rotationOffset,
    idle['tentacle.3.port.mount'].rotationOffset
  );

  const recoveredGrab = samplePose({
    ...basePose,
    action: {
      primitiveId: 'abyssal-octarch-grasp-and-hurl',
      motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES['grasp-and-hurl'],
      side: 'port',
      stage: 'recovery',
      progress: 1,
      sequence: 3,
      targetDesignPoint: { x: 18, y: 720 }
    }
  });
  assert.equal(recoveredGrab['tentacle.3.port'].frameId, 'tentacle.grasp.open');
  assert.equal(recoveredGrab['tentacle.3.port'].scaleXMultiplier, 1);

  assert.deepEqual(
    plain(samplePose(basePose)),
    plain(idle),
    'sampling attacks must never accumulate transform drift'
  );
});

test('the runtime-selected mid arm owns the Tentacle Slam lane and recovers without drift', () => {
  assert.equal(
    poseModule.resolveAbyssalOctarchPresentationSide(
      'tentacle-mid-starboard',
      'port'
    ),
    'starboard',
    'the simulation-selected arm must override a stale authored preview side'
  );
  assert.equal(
    poseModule.resolveAbyssalOctarchPresentationSide(undefined, 'left'),
    'port',
    'authored side remains the preview-only fallback'
  );

  const targetDesignPoint = Object.freeze({ x: 120, y: 620 });
  const slamInput = (stage, progress) => ({
    ...basePose,
    action: {
      primitiveId: 'abyssal-octarch-tentacle-slam',
      motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES['tentacle-slam'],
      side: 'starboard',
      stage,
      progress,
      sequence: 9,
      targetDesignPoint
    }
  });
  const idlePose = samplePose(basePose);
  const warningPose = samplePose(slamInput('telegraph', 0.75));
  const activePose = samplePose(slamInput('active', 0.5));
  const recoveryPose = samplePose(slamInput('recovery', 1));
  const idleHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    idlePose
  );
  const warningHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    warningPose
  );
  const activeHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    activePose
  );
  const recoveryHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    recoveryPose
  );
  const socketDistance = (hierarchy) => {
    const socket = hierarchy.socketById['tentacle-1-starboard-tip'];
    return Math.hypot(
      socket.worldX - targetDesignPoint.x,
      socket.worldY - targetDesignPoint.y
    );
  };

  assert.ok(
    socketDistance(warningHierarchy) < socketDistance(idleHierarchy),
    'the selected arm must visibly preview the same lane during telegraph'
  );
  assert.ok(
    socketDistance(activeHierarchy) < 0.001,
    'the selected arm tip must reach the simulation-owned slam target at peak'
  );
  assert.equal(activePose['tentacle.1.starboard'].frameId, 'tentacle.slam.needle');
  assert.ok(activePose['tentacle.1.starboard'].scaleXMultiplier > 2);

  for (const index of [0, 1, 2, 3]) {
    for (const side of ['port', 'starboard']) {
      if (index === 1 && side === 'starboard') continue;
      assert.deepEqual(
        plain(activePose[`tentacle.${index}.${side}.mount`]),
        plain(idlePose[`tentacle.${index}.${side}.mount`]),
        `unselected tentacle ${index}.${side} mount must remain canonical`
      );
      assert.deepEqual(
        plain(activePose[`tentacle.${index}.${side}`]),
        plain(idlePose[`tentacle.${index}.${side}`]),
        `unselected tentacle ${index}.${side} art must remain canonical`
      );
    }
  }

  assert.deepEqual(
    plain(recoveryPose['tentacle.1.starboard.mount']),
    plain(idlePose['tentacle.1.starboard.mount']),
    'recovery must restore the exact canonical mount'
  );
  assert.deepEqual(
    plain(recoveryPose['tentacle.1.starboard']),
    plain(idlePose['tentacle.1.starboard']),
    'recovery must restore the exact canonical sprite transform and frame'
  );
  assert.deepEqual(
    plain(recoveryHierarchy.socketById['tentacle-1-starboard-tip']),
    plain(idleHierarchy.socketById['tentacle-1-starboard-tip']),
    'recovery must restore the canonical socket without accumulated drift'
  );
  assert.deepEqual(
    plain(samplePose(slamInput('active', 0.5))),
    plain(activePose),
    'targeted slam sampling must remain deterministic'
  );
});

test('Tentacle Slam retracts inside the expanded portrait before turning into either lane', () => {
  const expandedWorld = Object.freeze({ width: 542, height: 1172 });
  const bossSize = Object.freeze({ width: 444, height: 296 });
  const bossCenter = Object.freeze({
    x: expandedWorld.width / 2,
    y: Math.max(16, expandedWorld.height * 0.035) + bossSize.height / 2
  });
  const designScale = Math.min(
    bossSize.width / artworkModule.ABYSSAL_OCTARCH_DESIGN_SIZE.width,
    bossSize.height / artworkModule.ABYSSAL_OCTARCH_DESIGN_SIZE.height
  );
  const toDesignPoint = (worldPoint) => Object.freeze({
    x: (worldPoint.x - bossCenter.x) / designScale,
    y: (worldPoint.y - bossCenter.y) / designScale
  });
  const partWorldCorners = (hierarchy, partId) => {
    const part = hierarchy.partById[partId];
    assert.ok(part.frame && part.anchor, `${partId} must resolve a framed sprite`);
    const left = -part.anchor.x * part.frame.width;
    const right = (1 - part.anchor.x) * part.frame.width;
    const top = -part.anchor.y * part.frame.height;
    const bottom = (1 - part.anchor.y) * part.frame.height;
    return [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom]
    ].map(([x, y]) => {
      const designX = part.worldTransform.a * x
        + part.worldTransform.c * y
        + part.worldTransform.tx;
      const designY = part.worldTransform.b * x
        + part.worldTransform.d * y
        + part.worldTransform.ty;
      return Object.freeze({
        x: bossCenter.x + designX * designScale,
        y: bossCenter.y + designY * designScale
      });
    });
  };
  const progressSamples = Object.freeze([0, 0.08, 0.16, 0.24, 0.4, 0.55, 0.7, 0.85, 1]);

  for (const side of ['port', 'starboard']) {
    // Phase 3 can lock the player across the body near the lower arena. This
    // deliberately exercises the longest safe portrait wind-up on each side.
    const targetWorld = Object.freeze({
      x: side === 'port' ? 430 : 112,
      y: 1090
    });
    const targetDesignPoint = toDesignPoint(targetWorld);
    const sampleWarning = (stage, progress) => {
      const pose = samplePose({
        ...basePose,
        phaseIndex: 3,
        healthRatio: 0.3,
        action: {
          primitiveId: 'abyssal-octarch-tentacle-slam',
          motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES['tentacle-slam'],
          side,
          stage,
          progress,
          sequence: 27,
          targetDesignPoint
        }
      });
      return hierarchyModule.resolveModularBossRigHierarchy(registration, pose);
    };
    const socketId = `tentacle-1-${side}-tip`;
    const partId = `tentacle.1.${side}`;
    const distances = [];

    for (const stage of ['preparation', 'telegraph']) {
      for (const progress of progressSamples) {
        const hierarchy = sampleWarning(stage, progress);
        for (const corner of partWorldCorners(hierarchy, partId)) {
          assert.ok(
            corner.x >= 2 && corner.x <= expandedWorld.width - 2,
            `${side} ${stage} ${progress} must keep the complete arm inside portrait width; x=${corner.x}`
          );
          assert.ok(
            corner.y >= 2 && corner.y <= expandedWorld.height - 2,
            `${side} ${stage} ${progress} must keep the complete arm inside portrait height; y=${corner.y}`
          );
        }
        if (stage === 'telegraph') {
          const socket = hierarchy.socketById[socketId];
          distances.push(Math.hypot(
            socket.worldX - targetDesignPoint.x,
            socket.worldY - targetDesignPoint.y
          ));
        }
      }
    }

    assert.ok(
      distances.at(-1) < 0.001,
      `${side} warning must finish on the locked slam target`
    );
    assert.ok(
      distances[7] < distances[6] && distances[8] < distances[7],
      `${side} arm must visibly approach once its safe inward turn is complete`
    );
  }
});

test('every direct attack follows the exact surviving fallback limb selected by runtime', () => {
  const phaseThreeBasePose = Object.freeze({ ...basePose, phaseIndex: 3 });
  const idlePose = samplePose(phaseThreeBasePose);
  const idleHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    idlePose
  );
  const cases = Object.freeze([
    Object.freeze({
      actionId: 'grasp-and-hurl',
      selectedComponentId: 'tentacle-mid-port',
      stage: 'held',
      expectedFrame: 'tentacle.grasp.closed',
      preferredPartId: 'tentacle.3.port'
    }),
    Object.freeze({
      actionId: 'tentacle-slam',
      selectedComponentId: 'tentacle-upper-starboard',
      stage: 'active',
      expectedFrame: 'tentacle.slam.needle',
      preferredPartId: 'tentacle.1.starboard'
    }),
    Object.freeze({
      actionId: 'sweeping-arm',
      selectedComponentId: 'tentacle-mid-starboard',
      stage: 'active',
      expectedFrame: 'tentacle.sweep.extended',
      preferredPartId: 'tentacle.0.starboard'
    }),
    Object.freeze({
      actionId: 'needle-tip-stab',
      selectedComponentId: 'tentacle-mid-port',
      stage: 'active',
      expectedFrame: 'tentacle.constrict.extended',
      preferredPartId: 'tentacle.2.port'
    }),
    Object.freeze({
      actionId: 'asteroid-hurl',
      selectedComponentId: 'tentacle-mid-starboard',
      stage: 'active',
      expectedFrame: 'tentacle.grasp.reach',
      preferredPartId: 'tentacle.0.starboard'
    })
  ]);

  for (const [caseIndex, testCase] of cases.entries()) {
    const descriptor = runtimeModule.ABYSSAL_OCTARCH_TENTACLES.find((candidate) => (
      candidate.id === testCase.selectedComponentId
    ));
    assert.ok(descriptor, `${testCase.selectedComponentId} must resolve`);
    const targetDesignPoint = Object.freeze({
      x: caseIndex % 2 === 0 ? -128 : 136,
      y: 604 + caseIndex * 17
    });
    const action = Object.freeze({
      primitiveId: `abyssal-octarch-${testCase.actionId}`,
      motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES[testCase.actionId],
      side: descriptor.side === 'port' ? 'starboard' : 'port',
      selectedComponentId: descriptor.id,
      stage: testCase.stage,
      progress: 0.5,
      sequence: 31 + caseIndex,
      targetDesignPoint
    });
    const activePose = samplePose({ ...phaseThreeBasePose, action });
    const activeHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
      registration,
      activePose
    );
    const selectedSocket = activeHierarchy.socketById[descriptor.socketId];

    assert.equal(
      activePose[descriptor.partId].frameId,
      testCase.expectedFrame,
      `${testCase.actionId} must animate the runtime-selected fallback frame`
    );
    assert.ok(
      Math.hypot(
        selectedSocket.worldX - targetDesignPoint.x,
        selectedSocket.worldY - targetDesignPoint.y
      ) < 0.001,
      `${testCase.actionId} must connect its selected tip to the runtime target`
    );
    assert.deepEqual(
      plain(activePose[testCase.preferredPartId]),
      plain(idlePose[testCase.preferredPartId]),
      `${testCase.actionId} must not animate its destroyed preferred-role limb`
    );

    const recoveredPose = samplePose({
      ...phaseThreeBasePose,
      action: { ...action, stage: 'recovery', progress: 1 }
    });
    const recoveredHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
      registration,
      recoveredPose
    );
    assert.deepEqual(
      plain(recoveredPose[`${descriptor.partId}.mount`]),
      plain(idlePose[`${descriptor.partId}.mount`]),
      `${testCase.actionId} recovery must restore the selected mount`
    );
    assert.deepEqual(
      plain(recoveredPose[descriptor.partId]),
      plain(idlePose[descriptor.partId]),
      `${testCase.actionId} recovery must restore the selected frame`
    );
    assert.deepEqual(
      plain(recoveredHierarchy.socketById[descriptor.socketId]),
      plain(idleHierarchy.socketById[descriptor.socketId]),
      `${testCase.actionId} recovery must restore the selected socket without drift`
    );
  }
});

test('Phase 3 Asteroid Hurl keeps its held art on the fallback upper-port tip through release', () => {
  const selectedComponentId = 'tentacle-upper-port';
  const plan = runtimeModule.createAbyssalOctarchActionPlan({
    actionId: 'asteroid-hurl',
    activeTentacleIds: [selectedComponentId],
    sequence: 37,
    phaseIndex: 3,
    arenaWidth: 542,
    arenaHeight: 1172,
    playerCenterX: 430,
    playerCenterY: 1030
  });
  assert.deepEqual(
    plain(plan.tentacleIds),
    [selectedComponentId],
    'the single surviving upper-port arm must own the deterministic fallback'
  );

  const bossBounds = Object.freeze({ x: 49, y: 52, width: 444, height: 296 });
  const releaseWorld = poseModule.resolveAbyssalOctarchAsteroidReleasePresentationTarget({
    selectedTentacleId: plan.tentacleIds[0],
    bossX: bossBounds.x,
    bossY: bossBounds.y,
    bossWidth: bossBounds.width,
    bossHeight: bossBounds.height
  });
  assert.deepEqual(plain(releaseWorld), {
    x: bossBounds.x + bossBounds.width * 0.2,
    y: bossBounds.y + bossBounds.height * 0.33
  });
  assert.equal(Object.isFrozen(releaseWorld), true);
  assert.deepEqual(
    plain(poseModule.resolveAbyssalOctarchAsteroidReleasePresentationTarget({
      selectedTentacleId: plan.tentacleIds[0],
      bossX: bossBounds.x,
      bossY: bossBounds.y,
      bossWidth: bossBounds.width,
      bossHeight: bossBounds.height
    })),
    plain(releaseWorld),
    'the fallback release origin must be deterministic'
  );

  const designScale = Math.min(
    bossBounds.width / artworkModule.ABYSSAL_OCTARCH_DESIGN_SIZE.width,
    bossBounds.height / artworkModule.ABYSSAL_OCTARCH_DESIGN_SIZE.height
  );
  const bossCenter = Object.freeze({
    x: bossBounds.x + bossBounds.width / 2,
    y: bossBounds.y + bossBounds.height / 2
  });
  const releaseDesignPoint = Object.freeze({
    x: (releaseWorld.x - bossCenter.x) / designScale,
    y: (releaseWorld.y - bossCenter.y) / designScale
  });
  const phaseThreePose = Object.freeze({
    ...basePose,
    phaseIndex: 3,
    healthRatio: 0.3
  });
  const sampleHurl = (stage, progress) => samplePose({
    ...phaseThreePose,
    action: {
      primitiveId: 'abyssal-octarch-asteroid-hurl',
      motionCue: runtimeModule.ABYSSAL_OCTARCH_MOTION_CUES['asteroid-hurl'],
      side: 'starboard',
      selectedComponentId,
      stage,
      progress,
      sequence: plan.sequence,
      targetDesignPoint: releaseDesignPoint
    }
  });
  const socketId = 'tentacle-0-port-tip';
  const heldSamples = Object.freeze([
    ['preparation', 0],
    ['preparation', 0.2],
    ['telegraph', 0.34],
    ['telegraph', 0.5],
    ['telegraph', 0.75],
    ['telegraph', 1]
  ]);

  for (const [stage, progress] of heldSamples) {
    const pose = sampleHurl(stage, progress);
    const hierarchy = hierarchyModule.resolveModularBossRigHierarchy(registration, pose);
    const socket = hierarchy.socketById[socketId];
    const heldAsteroid = hierarchy.partById['effect.attack.port'];
    assert.equal(heldAsteroid.visible, true, `${stage}/${progress} held art must stay visible`);
    assert.ok(
      Math.hypot(
        heldAsteroid.worldTransform.tx - socket.worldX,
        heldAsteroid.worldTransform.ty - socket.worldY
      ) < 0.000001,
      `${stage}/${progress} held art must remain on the registered fallback tip`
    );
    assert.equal(
      hierarchy.partById['effect.attack.starboard'].visible,
      false,
      `${stage}/${progress} stale authored side must not retain a duplicate`
    );
  }
  assert.equal(
    sampleHurl('preparation', 0)['tentacle.0.port'].frameId,
    'tentacle.grasp.reach',
    'the fallback arm must visibly retrieve the asteroid'
  );
  assert.equal(
    sampleHurl('preparation', 0.2)['tentacle.0.port'].frameId,
    'tentacle.grasp.closed',
    'the fallback arm must close around the asteroid before telegraph'
  );
  assert.equal(
    sampleHurl('telegraph', 1)['tentacle.0.port'].frameId,
    'tentacle.grasp.closed',
    'the fallback arm must hold the asteroid until release'
  );

  const releasePose = sampleHurl('telegraph', 1);
  const releaseHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    releasePose
  );
  const releaseSocket = releaseHierarchy.socketById[socketId];
  assert.ok(
    Math.hypot(
      bossCenter.x + releaseSocket.worldX * designScale - releaseWorld.x,
      bossCenter.y + releaseSocket.worldY * designScale - releaseWorld.y
    ) < 0.000001,
    'the selected tip must return to the engine projectile origin before launch'
  );

  const launchedPose = sampleHurl('active', 0);
  assert.equal(
    launchedPose['effect.attack.port'].visible,
    false,
    'the seated asteroid copy must hide on the projectile launch frame'
  );

  const idlePose = samplePose(phaseThreePose);
  const idleHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    idlePose
  );
  const recoveredPose = sampleHurl('recovery', 1);
  const recoveredHierarchy = hierarchyModule.resolveModularBossRigHierarchy(
    registration,
    recoveredPose
  );
  assert.deepEqual(
    plain(recoveredPose['tentacle.0.port.mount']),
    plain(idlePose['tentacle.0.port.mount']),
    'recovery must restore the exact fallback mount pose'
  );
  assert.deepEqual(
    plain(recoveredPose['tentacle.0.port']),
    plain(idlePose['tentacle.0.port']),
    'recovery must restore the exact fallback tentacle pose'
  );
  assert.deepEqual(
    plain(recoveredHierarchy.socketById[socketId]),
    plain(idleHierarchy.socketById[socketId]),
    'recovery must restore the canonical fallback tip with no drift'
  );
  assert.deepEqual(
    plain(sampleHurl('telegraph', 0.75)),
    plain(sampleHurl('telegraph', 0.75)),
    'held-asteroid fallback sampling must be deterministic'
  );
});

test('each live Octarch component owns one rig tentacle and severs through a brief inward fade', () => {
  const componentToPart = poseModule.ABYSSAL_OCTARCH_COMPONENT_TO_RIG_PART;
  const partToComponent = poseModule.ABYSSAL_OCTARCH_RIG_PART_TO_COMPONENT;
  assert.equal(Object.keys(componentToPart).length, 8);
  assert.equal(Object.keys(partToComponent).length, 8);
  for (const tentacle of runtimeModule.ABYSSAL_OCTARCH_TENTACLES) {
    assert.equal(componentToPart[tentacle.id], tentacle.partId);
    assert.equal(partToComponent[tentacle.partId], tentacle.id);
    assert.ok(registration.partById[tentacle.partId]);
    assert.equal(registration.partById[tentacle.partId].role, 'arm');
    assert.ok(registration.partById[`${tentacle.partId}.mount`]);
  }
  assert.equal(partToComponent.body, undefined);
  assert.equal(partToComponent['tentacle.0.port.mount'], undefined);

  const sampleSever = poseModule.sampleAbyssalOctarchTentacleSeverPresentation;
  const alive = sampleSever({
    destroyed: false,
    lastDamageFrame: 90,
    currentFrame: 120,
    side: 'port'
  });
  assert.deepEqual(plain(alive), {
    visible: true,
    progress: 0,
    alpha: 1,
    scale: 1,
    xOffset: 0,
    yOffset: 0,
    rotationOffset: 0
  });

  const portMidpoint = sampleSever({
    destroyed: true,
    lastDamageFrame: 100,
    currentFrame: 109,
    side: 'port'
  });
  const starboardMidpoint = sampleSever({
    destroyed: true,
    lastDamageFrame: 100,
    currentFrame: 109,
    side: 'starboard'
  });
  assert.equal(portMidpoint.visible, true);
  assert.equal(portMidpoint.progress, 0.5);
  assert.ok(portMidpoint.alpha > 0 && portMidpoint.alpha < 1);
  assert.ok(portMidpoint.scale > 0.42 && portMidpoint.scale < 1);
  assert.ok(portMidpoint.xOffset > 0, 'port arm must retract toward center');
  assert.ok(starboardMidpoint.xOffset < 0, 'starboard arm must retract toward center');
  assert.equal(portMidpoint.xOffset, -starboardMidpoint.xOffset);
  assert.equal(portMidpoint.rotationOffset, -starboardMidpoint.rotationOffset);

  const completed = sampleSever({
    destroyed: true,
    lastDamageFrame: 100,
    currentFrame: 100 + poseModule.ABYSSAL_OCTARCH_TENTACLE_SEVER_REACTION_FRAMES,
    side: 'port'
  });
  assert.equal(completed.visible, false);
  assert.equal(completed.alpha, 0);
  const alreadyGone = sampleSever({
    destroyed: true,
    lastDamageFrame: -999,
    currentFrame: 120,
    side: 'starboard'
  });
  assert.equal(alreadyGone.visible, false);
  assert.equal(alreadyGone.progress, 1);
});

test('Octarch projectile and VFX maps resolve every accepted atlas frame without global type expansion', () => {
  const roleMap = artworkModule.ABYSSAL_OCTARCH_VISUAL_ROLE_TO_KIND;
  const animations = artworkModule.ABYSSAL_OCTARCH_PROJECTILE_ANIMATIONS;
  assert.equal(Object.keys(roleMap).length, 8);
  assert.equal(new Set(Object.values(roleMap)).size, 8);
  assert.deepEqual(
    Object.values(roleMap),
    Object.keys(animations)
  );
  for (const [role, kind] of Object.entries(roleMap)) {
    assert.ok(role.length > 0);
    assert.ok(projectileModule.BOSS_MODULAR_PROJECTILE_VISUAL_KINDS.includes(kind));
    const animation = animations[kind];
    assert.ok(animation.frameIds.length >= 2);
    assert.ok(animation.frameHoldFrames >= 1);
    assert.ok(animation.minimumVisualHeight >= 32);
    for (const frameId of animation.frameIds) {
      assert.ok(registration.frameById[frameId], `${role}/${frameId} must resolve`);
      assert.equal(registration.atlasByFrameId[frameId].url, artworkModule.ABYSSAL_OCTARCH_ATLAS_URL);
    }
  }

  const mappedVfxFrames = new Set(
    Object.values(artworkModule.ABYSSAL_OCTARCH_VFX_FRAME_MAP).flat()
  );
  const atlasVfxFrames = Object.keys(registration.frameById)
    .filter((frameId) => frameId.startsWith('vfx.'));
  assert.equal(atlasVfxFrames.length, 16);
  assert.deepEqual(
    [...mappedVfxFrames].sort(),
    [...atlasVfxFrames].sort(),
    'every accepted VFX frame must have an explicit runtime purpose'
  );
});

test('Octarch encounter camera remains HUD-safe and pinned to the colossal runtime profile', () => {
  const camera = packageDefinition.artwork.encounterCamera;
  assert.equal(camera.eventId, runtimeModule.ABYSSAL_OCTARCH_EVENT_ID);
  assert.equal(camera.normalScale, 1);
  assert.equal(camera.expandedScale, runtimeModule.ABYSSAL_OCTARCH_CAMERA_PROFILE.expandedScale);
  assert.equal(camera.zoomDelayFrames, runtimeModule.ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDelayFrames);
  assert.equal(camera.zoomDurationFrames, runtimeModule.ABYSSAL_OCTARCH_CAMERA_PROFILE.zoomDurationFrames);
  assert.equal(camera.restoreDurationFrames, runtimeModule.ABYSSAL_OCTARCH_CAMERA_PROFILE.restoreDurationFrames);
  assert.equal(camera.verticalAnchor, 'top');
  assert.equal(packageDefinition.artwork.modularReferenceComparison.landmarks.length, 5);
});
