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

globalThis.Image ??= class ImageStub {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = 'anonymous';
  src = '';
};
globalThis.document ??= {
  hidden: false,
  addEventListener() {},
  removeEventListener() {}
};
globalThis.window ??= {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  addEventListener() {},
  removeEventListener() {},
  setInterval,
  clearInterval,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};

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

const { buildSandboxBossPrototypePreview } = await vite.ssrLoadModule(
  '/director/src/combat-lab/sandboxBossPrototypes.ts'
);
const {
  createSandboxOnlyBossArtwork,
  getBossSandboxAttacks
} = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');
const timelineRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossTimelineRuntime.ts'
);
const octarchRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/AbyssalOctarchRuntime.ts'
);
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);

const preview = buildSandboxBossPrototypePreview(campaign, 'abyssal-octarch');
const event = preview.previewWave.events.find((candidate) => candidate.kind === 'boss');
assert.ok(event?.timeline, 'Abyssal Octarch must compile one authored boss timeline');
const timeline = event.timeline;
const artwork = createSandboxOnlyBossArtwork(preview);
assert.ok(artwork.modularRig, 'Abyssal Octarch must use its registered modular rig');
const poseSampler = createModularBossWeaponSocketPoseSampler(
  artwork.modularRig,
  artwork.sampleModularPose
);

const attackOrder = Object.freeze([
  'grasp-and-hurl',
  'tentacle-slam',
  'sweeping-arm',
  'needle-tip-stab',
  'constricting-ring',
  'suction-current',
  'asteroid-hurl',
  'abyssal-gaze'
]);
const expectedByPhase = Object.freeze({
  'octarch-first-contact': Object.freeze(attackOrder.slice(0, 4)),
  'octarch-hunts': Object.freeze(attackOrder.slice(0, 7)),
  'octarch-severed-fury': attackOrder,
  'octarch-final-core': Object.freeze([
    'constricting-ring',
    'suction-current',
    'abyssal-gaze'
  ])
});

const createStats = () => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: 100,
  shipAbilityCooldown: 0,
  shipAbilityCooldownMax: 960,
  lives: 3,
  repairsCount: 0,
  upgrades: { fireRate: 1, speed: 1, missile: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const createEngine = (seed) => {
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: seed,
    previewBossCollisionEventId: preview.eventId,
    previewBossCollisionMask: artwork.collisionMask,
    previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
    previewBossWeaponSockets: artwork.weaponSockets,
    previewBossWeaponSocketPoseSampler: poseSampler,
    previewBossReducedMotion: false,
    previewBossWeaponSocketEventId: preview.eventId,
    previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
  });
  engine.init(390, 844);
  engine.invincibleTimer = 100_000;
  assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
  assert.ok(engine.bossRef);
  return engine;
};

test('Octarch phases expose purposeful anatomy rosters while retaining global Attack 1-8 numbering', () => {
  assert.equal(timeline.attackAvailability, 'phase-subset');
  assert.deepEqual(timeline.attacks.map((attack) => attack.id), attackOrder);
  assert.deepEqual(octarchRuntime.ABYSSAL_OCTARCH_PHASE_ACTIONS, expectedByPhase);

  for (const [phaseId, expectedAttackIds] of Object.entries(expectedByPhase)) {
    const attacks = getBossSandboxAttacks(preview, phaseId);
    assert.deepEqual(attacks.map((attack) => attack.id), expectedAttackIds);
    assert.deepEqual(
      attacks.map((attack) => attack.attackNumber),
      expectedAttackIds.map((attackId) => attackOrder.indexOf(attackId) + 1)
    );
    assert.deepEqual(
      timeline.attacks
        .filter((attack) => attack.variants.some((variant) => variant.phaseId === phaseId))
        .map((attack) => attack.id),
      expectedAttackIds
    );
    for (const attackId of attackOrder) {
      assert.equal(
        Boolean(timelineRuntime.resolveBossTimelineAttackVariant(
          timeline,
          attackId,
          phaseId
        )),
        expectedAttackIds.includes(attackId),
        `${attackId} availability in ${phaseId}`
      );
    }
  }

  const constrictingRing = timeline.attacks.find((attack) => (
    attack.id === 'constricting-ring'
  ));
  assert.ok(constrictingRing);
  assert.deepEqual(
    constrictingRing.sourceSocketRoles,
    ['core', 'port', 'starboard']
  );
});

test('Needle-Tip Stab authors independently warned sequential thrust clips', () => {
  const expectedThrustCount = Object.freeze({
    'octarch-first-contact': 3,
    'octarch-hunts': 3,
    'octarch-severed-fury': 4
  });
  for (const [phaseId, thrustCount] of Object.entries(expectedThrustCount)) {
    const resolved = timelineRuntime.resolveBossTimelineAttackVariant(
      timeline,
      'needle-tip-stab',
      phaseId
    );
    assert.ok(resolved);
    const thrusts = resolved.variant.beatClipIds.map((clipId) => (
      timeline.clips.find((clip) => clip.id === clipId)
    ));
    assert.equal(thrusts.length, thrustCount);
    assert.ok(thrusts.every((clip) => (
      clip
      && clip.primitiveId === 'tracking-pincer-dive'
      && clip.parameters?.motionCue === 'octarch-needle-stab'
      && Boolean(clip.telegraphClipId)
    )));
    assert.equal(new Set(thrusts.map((clip) => clip.telegraphClipId)).size, thrustCount);

    for (let index = 0; index < thrusts.length; index += 1) {
      const thrust = thrusts[index];
      const warning = timeline.clips.find((clip) => (
        clip.id === thrust.telegraphClipId
      ));
      assert.ok(warning);
      assert.equal(warning.primitiveId, 'telegraph');
      assert.equal(warning.parameters?.telegraphStyle, 'target');
      assert.equal(
        warning.startSeconds + warning.durationSeconds,
        thrust.startSeconds
      );
      const next = thrusts[index + 1];
      if (next) {
        const nextWarning = timeline.clips.find((clip) => (
          clip.id === next.telegraphClipId
        ));
        assert.ok(nextWarning);
        assert.ok(
          nextWarning.startSeconds > thrust.startSeconds + thrust.durationSeconds,
          'each thrust must recover before the next independent target warning'
        );
      }
    }
  }
});

test('next-available transitions preserve attack windows and wrap deterministically', () => {
  const durationFrames = timelineRuntime.getBossTimelineDurationFrames(timeline, 60);
  for (const [phaseId, expectedAttackIds] of Object.entries(expectedByPhase)) {
    const windows = expectedAttackIds.map((attackId) => {
      const window = timelineRuntime.getBossTimelineAttackWindow(
        timeline,
        attackId,
        phaseId,
        60
      );
      assert.ok(window, `${attackId} must have a ${phaseId} attack window`);
      return { attackId, window };
    });
    assert.equal(windows[0].window.startFrame, 15, `${phaseId} begins at 0.25 seconds`);

    for (const { attackId, window } of windows) {
      assert.equal(
        octarchRuntime.resolveAbyssalOctarchQueuedAttackTransition({
          timeline,
          phaseId,
          attackFrame: window.endFrame - 1,
          framesPerSecond: 60
        }),
        null,
        `${attackId} recovery may not be shortened`
      );
    }

    const last = windows.at(-1);
    const phase = octarchRuntime.ABYSSAL_OCTARCH_PHASES.find((candidate) => (
      candidate.id === phaseId
    ));
    assert.ok(last && phase);
    const request = {
      timeline,
      phaseId,
      attackFrame: last.window.endFrame,
      framesPerSecond: 60
    };
    const first = octarchRuntime.resolveAbyssalOctarchQueuedAttackTransition(request);
    const repeated = octarchRuntime.resolveAbyssalOctarchQueuedAttackTransition(request);
    assert.ok(first);
    assert.deepEqual(repeated, first);
    assert.equal(first.attackId, expectedAttackIds[0]);
    assert.equal(first.nextAttackStartFrame, durationFrames + windows[0].window.startFrame);
    assert.equal(
      first.transitionStartFrame,
      Math.max(last.window.endFrame, first.nextAttackStartFrame - phase.transitionFrames)
    );
    assert.ok(first.transitionFrames <= phase.transitionFrames);
    assert.equal(octarchRuntime.resolveAbyssalOctarchQueuedAttackTransition({
      ...request,
      selectedAttackLoopActive: true
    }), null);
  }
});

test('manual commands reject attacks outside the reconstructed anatomy phase', () => {
  for (const [phaseId, expectedAttackIds] of Object.entries(expectedByPhase)) {
    const engine = createEngine(`octarch-roster-${phaseId}`);
    assert.equal(engine.jumpToAuthoredBossPhase(phaseId, event.id), true);
    for (const attackId of attackOrder) {
      assert.equal(
        engine.triggerAuthoredBossAttack(attackId, event.id, phaseId),
        expectedAttackIds.includes(attackId),
        `${attackId} manual availability in ${phaseId}`
      );
    }
  }

  const gaze = timelineRuntime.resolveBossTimelineAttackVariant(
    timeline,
    'abyssal-gaze',
    'octarch-severed-fury'
  );
  const rawGazeClipId = gaze?.variant.beatClipIds.find((clipId) => (
    timeline.clips.some((clip) => (
      clip.id === clipId
      && clip.trigger === 'time'
      && clip.primitiveId === 'singularity-event-horizon-gaze'
    ))
  ));
  assert.ok(rawGazeClipId);
  const engine = createEngine('octarch-raw-clip-phase-gate');
  assert.equal(
    engine.triggerAuthoredBossAttack(
      rawGazeClipId,
      event.id,
      'octarch-first-contact'
    ),
    false,
    'an internal later-phase clip may not bypass the requested anatomy phase'
  );
});

test('engine queues the next phase-valid attack without exposing a blank idle gap', () => {
  for (const [phaseId, expectedAttackIds] of Object.entries(expectedByPhase)) {
    const engine = createEngine(`octarch-flow-${phaseId}`);
    assert.equal(engine.jumpToAuthoredBossPhase(phaseId, event.id), true);
    const firstWindow = timelineRuntime.getBossTimelineAttackWindow(
      timeline,
      expectedAttackIds[0],
      phaseId,
      60
    );
    assert.ok(firstWindow && engine.bossRef);
    engine.bossRef.attackTimer = firstWindow.endFrame;
    engine.update();
    const snapshot = engine.getPreviewSnapshot().boss;
    assert.ok(snapshot?.nextAttack);
    assert.equal(snapshot.nextAttack.id, expectedAttackIds[1] ?? expectedAttackIds[0]);
    assert.equal(snapshot.state, 'transition');
    assert.equal(snapshot.activeAttack?.stage, 'transition');
    assert.ok(snapshot.transitionFrames > 0);
    assert.ok(
      snapshot.transitionFrames <= octarchRuntime.ABYSSAL_OCTARCH_PHASES.find(
        (phase) => phase.id === phaseId
      ).transitionFrames
    );
  }
});

test('selected Octarch attack loops retain their authored window without flow compression', () => {
  const phaseId = 'octarch-first-contact';
  const attackId = 'sweeping-arm';
  const window = timelineRuntime.getBossTimelineAttackWindow(
    timeline,
    attackId,
    phaseId,
    60
  );
  assert.ok(window);
  const engine = createEngine('octarch-selected-attack-loop');
  assert.equal(
    engine.triggerAuthoredBossAttack(attackId, event.id, phaseId, true),
    true
  );
  let warningEntries = 0;
  let previousStage = null;
  const sampleFrames = (window.endFrame - window.startFrame) * 2 + 24;
  for (let frame = 0; frame < sampleFrames; frame += 1) {
    engine.update();
    const snapshot = engine.getPreviewSnapshot().boss;
    assert.ok(snapshot && engine.bossRef);
    if (snapshot.activeAttack) assert.equal(snapshot.activeAttack.id, attackId);
    if (snapshot.activeAttack?.stage === 'warning' && previousStage !== 'warning') {
      warningEntries += 1;
    }
    previousStage = snapshot.activeAttack?.stage ?? null;
    assert.equal(engine.bossRef.bossAbyssalOctarchTransition, undefined);
    assert.equal(snapshot.transitionFrames, 0);
    assert.equal(snapshot.nextAttack, null);
  }
  assert.ok(warningEntries >= 2, 'the selected warning must replay on its exact loop');
});
