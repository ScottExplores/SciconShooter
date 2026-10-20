import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
const gameLogicSource = await readFile(
  path.join(repositoryRoot, 'services', 'gameLogic.ts'),
  'utf8'
);
const traceSource = await readFile(
  path.join(
    repositoryRoot,
    'services',
    'gameplay',
    'bosses',
    'FrontierCrownclawEngineTraceProof.ts'
  ),
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

const prototypes = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const model = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const hierarchy = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularHierarchyRig.ts'
);
const poseRuntime = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/FrontierCrownclawModularPose.ts'
);
const frontierRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/FrontierCrownclawRuntime.ts'
);
const safeRoute = await vite.ssrLoadModule(
  '/services/gameplay/bosses/FrontierCrownclawSafeRouteProof.ts'
);
const traceRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/FrontierCrownclawEngineTraceProof.ts'
);
const portableValidation = await vite.ssrLoadModule('/game-config/validate.ts');
const serverValidation = await import('../server/gameCampaignValidation.mjs');

const preview = prototypes.buildSandboxBossPrototypePreview(
  campaign,
  'frontier-crownclaw'
);
const boss = preview.previewWave.events.find((event) => (
  event.id === 'sandbox-frontier-crownclaw'
));
const registration = model.getSandboxBossArtworkRegistration(
  'frontier-crownclaw'
);
const rig = registration?.modularRig;
const samplePose = registration?.sampleModularPose;

assert.ok(boss, 'Frontier preview must expose its sandbox boss event.');
assert.ok(boss.timeline, 'Frontier preview must expose its compiled timeline.');
assert.ok(registration, 'Frontier artwork registration must resolve.');
assert.ok(rig, 'Frontier modular rig must resolve.');
assert.equal(typeof samplePose, 'function');

const mobile = Object.freeze({
  id: 'mobile-390x844',
  width: 390,
  height: 844,
  mobileProfile: true
});
const desktop = Object.freeze({
  id: 'desktop-1280x720',
  width: 1280,
  height: 720,
  mobileProfile: false
});
const viewports = Object.freeze([mobile, desktop]);
const phaseIds = boss.phases.map((phase) => phase.id);
const sandboxBoundary = Object.freeze({
  source: preview.sandboxPrototype.source,
  sandboxOnly: preview.sandboxPrototype.sandboxOnly,
  promotionAllowed: preview.sandboxPrototype.promotionAllowed
});

const plain = (value) => JSON.parse(JSON.stringify(value));
const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);

const resolveRegisteredRigSockets = (request) => {
  const overrides = samplePose({
    frameCount: request.frameCount,
    reducedMotion: false,
    healthRatio: request.healthRatio,
    phaseIndex: request.phaseIndex,
    phaseProgress: request.phaseIndex === 2 ? 1 : 0,
    entranceProgress: 1,
    damageStage: request.phaseIndex === 2 ? 2 : 0,
    action: {
      primitiveId: request.primitiveId,
      stage: request.stage,
      progress: request.progress,
      side: request.side,
      sequence: request.sequence,
      motionCue: request.motionCue
    }
  });
  const resolved = hierarchy.resolveModularBossRigHierarchy(rig, overrides);
  const scale = Math.min(
    request.bossBox.width / rig.manifest.designSize.width,
    request.bossBox.height / rig.manifest.designSize.height
  );
  const centerX = request.bossBox.x + request.bossBox.width / 2;
  const centerY = request.bossBox.y + request.bossBox.height / 2;
  return Object.freeze(Object.fromEntries(
    frontierRuntime.FRONTIER_CROWNCLAW_RUNTIME_SOCKET_IDS.map((socketId) => {
      const socket = resolved.socketById[socketId];
      assert.ok(socket, `${socketId} must resolve from the registered rig.`);
      return [socketId, Object.freeze({
        x: centerX + socket.worldX * scale,
        y: centerY + socket.worldY * scale
      })];
    })
  ));
};

const buildProof = ({ viewport, phaseId, routeSeed }) => (
  traceRuntime.buildFrontierCrownclawEngineTraceProof({
    timeline: boss.timeline,
    phaseId,
    viewport,
    socketResolver: resolveRegisteredRigSockets,
    sandboxBoundary,
    routeSeed
  })
);

const summarize = (proof) => ({
  deterministicHash: proof.deterministicHash,
  viewportId: proof.viewport.id,
  phaseId: proof.phaseId,
  actionClipTraces: proof.actionClipTraces.map((trace) => ({
    attackId: trace.attackId,
    actionClipId: trace.actionClipId,
    primitiveId: trace.primitiveId,
    sequence: trace.sequence,
    warningLock: trace.warningLock,
    sourceSocketIds: trace.sourceSocketIds,
    liveSourceSockets: trace.liveSourceSockets,
    maximumOwnedArtifacts: trace.maximumOwnedArtifacts,
    emittedProjectileCount: trace.emittedProjectileCount,
    maximumBeamCount: trace.maximumBeamCount,
    chainLinkCount: trace.chainLinkCount,
    rearSocketShotCount: trace.rearSocketShotCount
  })),
  routes: proof.routeProofs.map((route) => ({
    attackId: route.attackId,
    phaseId: route.phaseId,
    seed: route.seed,
    routeHash: route.routeHash,
    minimumClearancePixels: route.minimumClearancePixels
  }))
});

test('compiled sandbox preview preserves exactly three Frontier cores plus Crown Cross-Link', () => {
  assert.deepEqual(plain(sandboxBoundary), {
    source: 'sandbox-prototype',
    sandboxOnly: true,
    promotionAllowed: false
  });
  assert.deepEqual(phaseIds, [
    'sandbox-frontier-bastion-lock',
    'sandbox-frontier-critical-cross-link'
  ]);
  assert.equal(boss.timeline.loop, true);
  assert.ok(
    boss.timeline.durationSeconds >= 26.4
      && boss.timeline.durationSeconds <= 30,
    'The compiled loop must retain its bounded full-sentence duration.'
  );
  assert.deepEqual(
    boss.timeline.attacks.filter((attack) => attack.role === 'core').map((attack) => attack.id),
    [
      'chainclaw-harpoon',
      'crown-reactor-beam',
      'bastion-crabwalk-barrage'
    ]
  );
  assert.deepEqual(
    boss.timeline.attacks.filter((attack) => attack.role === 'signature').map((attack) => attack.id),
    ['crown-cross-link']
  );
  assert.equal(
    registration.projectileAnimations['boss-frontier-crown-bolt'].orientationOffsetRadians,
    Math.PI / 2,
    'The native upward crown bolt must rotate clockwise by pi/2 to follow velocity.'
  );
  for (const attack of boss.timeline.attacks) {
    assert.deepEqual(attack.variants.map((variant) => variant.phaseId), phaseIds);
    for (const variant of attack.variants) {
      assert.ok(boss.timeline.clips.some((clip) => clip.id === variant.recoveryClipId));
      for (const actionClipId of variant.beatClipIds) {
        const action = boss.timeline.clips.find((clip) => clip.id === actionClipId);
        const warning = boss.timeline.clips.find((clip) => (
          clip.id === action?.telegraphClipId
        ));
        assert.ok(action);
        assert.ok(warning);
        assert.equal(warning.primitiveId, 'telegraph');
        assert.equal(
          warning.startSeconds + warning.durationSeconds,
          action.startSeconds,
          `${action.id} must begin on its warning-owned lock boundary.`
        );
      }
    }
  }
});

test('Frontier anatomy primitives follow the promoted Frontier boss identity', () => {
  const buildValidationFixture = (eventId, bossId) => {
    const fixture = plain(campaign);
    const wave = fixture.levels[0].waves[0];
    const frontierEvent = plain(boss);
    frontierEvent.id = eventId;
    frontierEvent.bossId = bossId;
    frontierEvent.startSeconds = 0;
    wave.events = [frontierEvent];
    wave.durationSeconds = Math.max(
      Number(wave.durationSeconds) || 0,
      Number(frontierEvent.timeline?.durationSeconds) || 0,
      Number(frontierEvent.durationSeconds) || 0
    );
    return fixture;
  };
  const wrongIdentity = buildValidationFixture('sandbox-frontier-crownclaw', 'gatekeeper');
  const promoted = buildValidationFixture(
    'stage-terminus-ascendant-major-boss',
    'frontier-crownclaw'
  );

  const portableRestricted = portableValidation.validateGameCampaign(wrongIdentity);
  assert.ok(
    portableRestricted.issues.some((issue) => (
      issue.code === 'sandbox_only_primitive'
      && /Frontier Crownclaw Boss Sandbox prototype/.test(issue.message)
    )),
    'The portable validator must reject Frontier-only execution primitives in campaign content.'
  );
  assert.equal(
    portableValidation.validateGameCampaign(promoted).issues.some((issue) => (
      issue.code === 'sandbox_only_primitive'
    )),
    false,
    'The Frontier identity must retain access to its registered execution primitives after promotion.'
  );

  const serverRestricted = serverValidation.validateGameCampaign(wrongIdentity);
  assert.ok(
    serverRestricted.errors.some((error) => (
      /restricted to the Frontier Crownclaw Boss Sandbox prototype/.test(error)
    )),
    'The server validator must enforce the same Sandbox-only primitive boundary.'
  );
  assert.equal(
    serverValidation.validateGameCampaign(promoted).errors.some((error) => (
      /restricted to the Frontier Crownclaw Boss Sandbox prototype/.test(error)
    )),
    false,
    'The server validator must accept the promoted Frontier boss identity.'
  );
});

test('mobile and desktop compiled traces replay deterministically across both bounded seeds', () => {
  const seeds = safeRoute.FRONTIER_CROWNCLAW_SAFE_ROUTE_VARIANT_SEEDS;
  const matrix = viewports.flatMap((viewport) => phaseIds.flatMap((phaseId) => (
    seeds.map((routeSeed) => buildProof({ viewport, phaseId, routeSeed }))
  )));
  assert.equal(matrix.length, 8);

  for (const proof of matrix) {
    const repeated = buildProof({
      viewport: proof.viewport,
      phaseId: proof.phaseId,
      routeSeed: proof.routeProofs[0].seed
    });
    assert.deepEqual(summarize(repeated), summarize(proof));
    assert.match(proof.deterministicHash, /^[0-9a-f]{8}$/);
    assert.equal(proof.traceKind, 'compiled-timeline-plus-runtime-samplers');
    assert.equal(proof.productionEligible, false);
    assert.equal(proof.actionClipTraces.length, 10);
    assert.ok(proof.maximumOwnedArtifacts <= 22);
    assert.ok(proof.weakestRouteClearancePixels >= 6);
    assert.match(proof.limitation, /approximate sockets/i);
    assert.match(proof.limitation, /exact GameEngine playback/i);
  }

  const allRoutes = matrix.flatMap((proof) => proof.routeProofs);
  assert.equal(allRoutes.length, 28);
  allRoutes.forEach((route) => {
    assert.equal(route.status, 'proven');
    assert.equal(route.geometryUncertaintyPixels, 3);
    assert.ok(route.minimumClearancePixels >= 6);
    assert.match(route.routeHash, /^[0-9a-f]{8}$/);
  });
  const weakest = [...allRoutes].sort((left, right) => (
    left.minimumClearancePixels - right.minimumClearancePixels
  ))[0];
  assert.equal(weakest.attackId, 'crown-reactor-beam');
  assert.equal(weakest.phaseId, safeRoute.FRONTIER_CROWNCLAW_PHASE_IDS.critical);
  assert.equal(weakest.viewportId, desktop.id);
  assert.ok(weakest.minimumClearancePixels > 6.01);
});

test('warning-owned locks stay fixed while live rig sockets continue to follow anatomy', () => {
  const proof = buildProof({
    viewport: mobile,
    phaseId: phaseIds[1],
    routeSeed: safeRoute.FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED
  });
  for (const trace of proof.actionClipTraces) {
    assert.equal(trace.warningLock.warningEndSeconds, trace.warningLock.actionStartSeconds);
    assert.ok(trace.warningLock.warningFrames >= 30);
    assert.ok(distance(
      trace.warningLock.lockedPlayer,
      trace.warningLock.movedPlayerAtFire
    ) > 100);
    assert.equal(trace.warningLock.lockedGeometryHash, trace.warningLock.fireGeometryHash);
    assert.equal(trace.warningLock.lockRetainedAfterPlayerMovement, true);
    assert.equal(trace.cleanupClearsAllOwnedArtifacts, true);
    trace.sourceSocketIds.forEach((socketId) => {
      const socket = trace.liveSourceSockets[socketId];
      assert.ok(Number.isFinite(socket.x));
      assert.ok(Number.isFinite(socket.y));
    });
  }

  const baseBox = Object.freeze({ x: 82, y: 92, width: 226, height: 182.54 });
  const baseRequest = {
    viewport: mobile,
    bossBox: baseBox,
    frameCount: 120,
    healthRatio: 0.72,
    phaseIndex: 1,
    primitiveId: 'chainclaw-harpoon',
    attackId: 'chainclaw-harpoon',
    sequence: 0,
    side: 'port',
    motionCue: 'frontier-chainclaw-harpoon'
  };
  const warningSockets = resolveRegisteredRigSockets({
    ...baseRequest,
    stage: 'warning',
    progress: 0.7
  });
  const fireSockets = resolveRegisteredRigSockets({
    ...baseRequest,
    stage: 'fire',
    progress: 0.5
  });
  assert.ok(
    distance(warningSockets['claw-tip-port'], fireSockets['claw-tip-port']) > 10,
    'The attacking claw tip must follow its launched modular palm.'
  );
  assert.ok(
    distance(warningSockets['chain-spool-port'], fireSockets['chain-spool-port']) < 10,
    'The chain spool must stay attached while its claw launches.'
  );
});

test('harpoon links, reactor relays, rear bastions, and budgets match the engine contracts', () => {
  const phaseOne = buildProof({
    viewport: mobile,
    phaseId: phaseIds[0],
    routeSeed: safeRoute.FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED
  });
  const phaseTwo = buildProof({
    viewport: mobile,
    phaseId: phaseIds[1],
    routeSeed: safeRoute.FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED
  });

  const phaseOneHarpoons = phaseOne.actionClipTraces.filter((trace) => (
    trace.primitiveId === 'chainclaw-harpoon' && trace.role === 'core'
  ));
  const crossLink = phaseTwo.actionClipTraces.filter((trace) => (
    trace.role === 'signature'
  ));
  assert.equal(phaseOneHarpoons.length, 2);
  phaseOneHarpoons.forEach((trace) => {
    assert.equal(trace.chainLinkCount, 10);
    assert.equal(trace.maximumOwnedArtifacts, 11);
    assert.equal(trace.chainEndpointsAttached, true);
  });
  assert.equal(crossLink.length, 4);
  crossLink.forEach((trace) => {
    assert.equal(trace.chainLinkCount, 20);
    assert.equal(trace.maximumOwnedArtifacts, 22);
    assert.equal(trace.chainEndpointsAttached, true);
  });

  phaseOne.actionClipTraces
    .filter((trace) => trace.primitiveId === 'crown-reactor-beam')
    .forEach((trace) => assert.equal(trace.maximumBeamCount, 1));
  phaseTwo.actionClipTraces
    .filter((trace) => trace.primitiveId === 'crown-reactor-beam')
    .forEach((trace) => assert.equal(trace.maximumBeamCount, 2));

  phaseOne.actionClipTraces
    .filter((trace) => trace.primitiveId === 'bastion-crabwalk-barrage')
    .forEach((trace) => {
      assert.equal(trace.rearSocketShotCount, 0);
      assert.ok(trace.emittedProjectileCount <= 14);
    });
  phaseTwo.actionClipTraces
    .filter((trace) => trace.primitiveId === 'bastion-crabwalk-barrage')
    .forEach((trace) => {
      assert.ok(trace.rearSocketShotCount > 0);
      assert.ok(trace.emittedProjectileCount <= 14);
      assert.ok(trace.sourceSocketIds.includes('rear-bastion-port'));
      assert.ok(trace.sourceSocketIds.includes('rear-bastion-starboard'));
    });

  const phaseTwoPose = samplePose({
    frameCount: 240,
    reducedMotion: false,
    healthRatio: 0.38,
    phaseIndex: 2,
    phaseProgress: 1,
    entranceProgress: 1,
    damageStage: 2,
    action: {
      primitiveId: 'bastion-crabwalk-barrage',
      stage: 'fire',
      progress: 0.5,
      sequence: 24,
      motionCue: 'frontier-bastion-crabwalk'
    }
  });
  const resolvedPhaseTwo = hierarchy.resolveModularBossRigHierarchy(rig, phaseTwoPose);
  assert.equal(resolvedPhaseTwo.partById['rear-appendage.port'].visible, true);
  assert.equal(resolvedPhaseTwo.partById['rear-appendage.starboard'].visible, true);
  assert.ok(resolvedPhaseTwo.socketById['rear-bastion-port']);
  assert.ok(resolvedPhaseTwo.socketById['rear-bastion-starboard']);
});

test('owner loss clears every owned artifact and the promoted identity remains guarded', () => {
  for (const actionId of frontierRuntime.FRONTIER_CROWNCLAW_ACTION_IDS) {
    const cleared = frontierRuntime.resolveFrontierCrownclawOwnedArtifactState({
      ownerAlive: false,
      actionId,
      stage: 'fire',
      phaseState: frontierRuntime.resolveFrontierCrownclawPhaseState({
        phaseIndex: 2,
        phaseProgress: 1,
        healthRatio: 0.2
      })
    });
    assert.deepEqual(plain(cleared), {
      chainsVisible: false,
      portClawConnected: false,
      starboardClawConnected: false,
      beamActive: false,
      barrageActive: false,
      rearSocketsActive: false,
      clearOnOwnerLoss: true
    });
  }

  assert.match(
    gameLogicSource,
    /private isSandboxFrontierCrownclaw\(boss: Entity\)[\s\S]*?return boss\.sourceItemId === 'frontier-crownclaw'/
  );
  for (const runtimeCall of [
    'this.showFrontierCrownclawTelegraph(boss, cue, linkedAction)',
    'this.beginFrontierCrownclawAction(boss, cue)',
    'this.updateFrontierCrownclawActionRuntime(boss)',
    'this.updateFrontierCrownclawTimelineMovement(boss)'
  ]) {
    assert.ok(
      gameLogicSource.includes(runtimeCall),
      `GameEngine must retain its Frontier integration call: ${runtimeCall}`
    );
  }
  assert.match(
    gameLogicSource,
    /entity\.bossOwnerId && removedEntityIds\.has\(entity\.bossOwnerId\)[\s\S]*?entity\.markedForDeletion = true/,
    'Preview cleanup must delete all entities owned by the removed Frontier boss.'
  );
  const promotedCampaignEvent = campaign.levels
    .find((level) => level.order === 20)
    ?.waves.flatMap((wave) => wave.events)
    .find((event) => event.kind === 'boss');
  assert.equal(promotedCampaignEvent?.id, 'stage-terminus-ascendant-major-boss');
  assert.equal(promotedCampaignEvent?.bossId, 'frontier-crownclaw');
  assert.ok(promotedCampaignEvent?.timeline);
  assert.doesNotMatch(traceSource, /Math\.random|Date\.|performance\./);
  assert.equal(
    poseRuntime.validateFrontierCrownclawRigCompatibility(rig).length,
    0
  );
});
