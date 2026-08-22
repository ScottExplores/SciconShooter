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
const { createSandboxOnlyBossArtwork } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');
const { EntityType } = await vite.ssrLoadModule('/types.ts');
const octarchRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/AbyssalOctarchRuntime.ts'
);
const cameraRuntime = await vite.ssrLoadModule(
  '/services/gameplay/EncounterCameraRuntime.ts'
);
const previewRuntime = await vite.ssrLoadModule(
  '/services/gameplay/previewSession.ts'
);
const timelineRuntime = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossTimelineRuntime.ts'
);
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);

const preview = buildSandboxBossPrototypePreview(campaign, 'abyssal-octarch');
const event = preview.previewWave.events.find((candidate) => candidate.kind === 'boss');
assert.ok(event?.timeline, 'Abyssal Octarch must compile one authored boss timeline');
const artwork = createSandboxOnlyBossArtwork(preview);
assert.ok(artwork.modularRig, 'Abyssal Octarch must use its registered modular rig');
assert.ok(artwork.encounterCamera, 'Abyssal Octarch must register its camera profile');
const poseSampler = createModularBossWeaponSocketPoseSampler(
  artwork.modularRig,
  artwork.sampleModularPose
);
const display = Object.freeze({ width: 390, height: 844 });
const world = cameraRuntime.resolveEncounterWorldSize(
  display.width,
  display.height,
  artwork.encounterCamera
);

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

const createEngine = (
  seed,
  { spawnBoss = true, previewInvincible = true } = {}
) => {
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible,
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
    previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {}),
    previewEncounterCamera: artwork.encounterCamera,
    previewDisplayViewport: display
  });
  engine.init(world.width, world.height);
  engine.introFlightFrames = 0;
  engine.invincibleTimer = previewInvincible ? 100_000 : 0;
  if (spawnBoss) {
    assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
    assert.ok(engine.bossRef);
  }
  return engine;
};

const seedReleasedThrow = (engine) => {
  const boss = engine.bossRef;
  assert.ok(boss);
  engine.playerVel = { x: 9.25, y: -7.5 };
  boss.bossAbyssalGrabState = 'immunity';
  boss.bossAbyssalOctarchTransition = { attackId: 'sweeping-arm' };
  boss.bossAbyssalOctarchState = {
    captured: false,
    stage: 'recovery',
    throwStartFrame: 1,
    throwVelocityX: 9.25,
    throwVelocityY: -7.5,
    plan: { tentacleIds: ['tentacle-upper-port'] }
  };
  return boss;
};

const assertZeroReleasedThrow = (engine, boss, label) => {
  assert.deepEqual(engine.playerVel, { x: 0, y: 0 }, `${label} velocity`);
  assert.equal(boss.bossAbyssalOctarchState, undefined, `${label} state`);
  assert.equal(boss.bossAbyssalOctarchTransition, undefined, `${label} transition`);
  assert.equal(boss.bossAbyssalGrabState, 'none', `${label} grab state`);
};

test('normal, expanded, and restored camera modes share one visible player arena', () => {
  const engine = createEngine('octarch-camera-lifecycle', { spawnBoss: false });
  const normalBounds = engine.getPlayerMovementBounds();
  const normalTransform = engine.getEncounterCameraTransform();
  const normalTopLeft = engine.mapDisplayPointToWorld(0, 0);
  const normalBottomRight = engine.mapDisplayPointToWorld(display.width, display.height);

  assert.equal(normalTransform.scale, artwork.encounterCamera.normalScale);
  assert.ok(Math.abs(
    (normalBounds.maxX - normalBounds.minX) - (display.width - engine.player.width)
  ) < 1e-9);
  assert.ok(Math.abs(
    (normalBounds.maxY - normalBounds.minY) - (display.height - engine.player.height)
  ) < 1e-9);
  assert.ok(Math.abs(normalBounds.minX - normalTopLeft.x) < 1e-9);
  assert.ok(Math.abs(normalBounds.maxX - (
    normalBottomRight.x - engine.player.width
  )) < 1e-9);

  assert.equal(engine.setPreviewEncounterCameraMode('expanded'), true);
  const expandedBounds = engine.getPlayerMovementBounds();
  assert.equal(engine.getEncounterCameraTransform().scale, artwork.encounterCamera.expandedScale);
  assert.ok(expandedBounds.maxX - expandedBounds.minX > normalBounds.maxX - normalBounds.minX);
  assert.ok(expandedBounds.maxY - expandedBounds.minY > normalBounds.maxY - normalBounds.minY);

  engine.player.x = expandedBounds.maxX;
  engine.player.y = expandedBounds.maxY;
  assert.equal(engine.setPreviewEncounterCameraMode('normal'), true);
  for (let frame = 0; frame < artwork.encounterCamera.restoreDurationFrames; frame += 1) {
    engine.update(true);
  }
  const restoredBounds = engine.getPlayerMovementBounds();
  assert.equal(engine.getEncounterCameraTransform().scale, artwork.encounterCamera.normalScale);
  assert.deepEqual(restoredBounds, normalBounds);
  assert.ok(engine.player.x >= restoredBounds.minX && engine.player.x <= restoredBounds.maxX);
  assert.ok(engine.player.y >= restoredBounds.minY && engine.player.y <= restoredBounds.maxY);
});

test('Octarch cancellation boundaries revoke released throw momentum', () => {
  {
    const engine = createEngine('octarch-clear-hazards');
    const boss = seedReleasedThrow(engine);
    assert.equal(engine.clearPreviewBossHazards(event.id), true);
    assertZeroReleasedThrow(engine, boss, 'clear hazards');
  }
  {
    const engine = createEngine('octarch-phase-jump');
    const boss = seedReleasedThrow(engine);
    assert.equal(engine.jumpToAuthoredBossPhase('octarch-hunts', event.id), true);
    assertZeroReleasedThrow(engine, boss, 'phase jump');
  }
  {
    const engine = createEngine('octarch-event-clear');
    const boss = seedReleasedThrow(engine);
    engine.clearPreviewEventRuntime(event.id);
    assertZeroReleasedThrow(engine, boss, 'event clear');
    assert.equal(engine.bossRef, null);
    assert.equal(engine.getEncounterCameraTransform().scale, artwork.encounterCamera.normalScale);
  }
  {
    const engine = createEngine('octarch-loop-rewind');
    const phaseId = 'octarch-first-contact';
    const attackId = 'sweeping-arm';
    const window = timelineRuntime.getBossTimelineAttackWindow(
      event.timeline,
      attackId,
      phaseId,
      60
    );
    assert.ok(window);
    assert.equal(engine.triggerAuthoredBossAttack(attackId, event.id, phaseId, true), true);
    const boss = seedReleasedThrow(engine);
    const releasedState = boss.bossAbyssalOctarchState;
    boss.attackTimer = window.endFrame;
    engine.update();
    assert.deepEqual(engine.playerVel, { x: 0, y: 0 }, 'loop rewind velocity');
    assert.equal(boss.bossAbyssalOctarchTransition, undefined, 'loop rewind transition');
    assert.equal(boss.bossAbyssalGrabState, 'none', 'loop rewind grab state');
    assert.notEqual(boss.bossAbyssalOctarchState, releasedState);
    assert.equal(boss.bossAbyssalOctarchState?.actionId, attackId);
  }
});

test('restartPreview restores the entrance arena and clears combat feedback', () => {
  const engine = createEngine('octarch-restart-reset');
  assert.equal(engine.setPreviewEncounterCameraMode('expanded'), true);
  engine.addHitStop(12);
  engine.addShake(7);
  engine.kickPlayerSquash(0.23);
  engine.addPlayerAfterimage();
  engine.shakeX = 4;
  engine.shakeY = -3;
  engine.flashAlpha = 0.8;
  engine.playerSquashVelocity = -0.1;
  engine.lastPrimaryImpactShakeFrame = 250;
  engine.bioBeamCanvasVisualStartFrame = 180;

  engine.restartPreview();

  assert.equal(engine.getEncounterCameraTransform().scale, artwork.encounterCamera.normalScale);
  assert.equal(engine.hitStopFrames, 0);
  assert.equal(engine.shakeStrength, 0);
  assert.equal(engine.shakeX, 0);
  assert.equal(engine.shakeY, 0);
  assert.equal(engine.flashAlpha, 0);
  assert.equal(engine.playerSquash, 0);
  assert.equal(engine.playerSquashVelocity, 0);
  assert.deepEqual(engine.playerAfterimages, []);
  assert.equal(engine.lastPrimaryImpactShakeFrame, -999);
  assert.equal(engine.bioBeamCanvasVisualStartFrame, -1);
  assert.deepEqual(engine.playerVel, { x: 0, y: 0 });
  assert.deepEqual(
    { x: engine.player.x, y: engine.player.y },
    engine.getPlayerHomePosition()
  );

  assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
  for (
    let frame = 0;
    frame < artwork.encounterCamera.zoomDelayFrames + artwork.encounterCamera.zoomDurationFrames;
    frame += 1
  ) {
    engine.update(true);
  }
  assert.equal(engine.getEncounterCameraTransform().expanded, true);
});

test('Grasp and Hurl exposes purposeful preparation through recovery states', () => {
  const engine = createEngine('octarch-grasp-stage-flow');
  assert.equal(
    engine.triggerAuthoredBossAttack(
      'grasp-and-hurl',
      event.id,
      'octarch-first-contact',
      true
    ),
    true
  );
  const observedStages = new Set();
  const stageTrace = [];
  let previousStage = null;
  for (let frame = 0; frame < 900; frame += 1) {
    engine.update();
    const stage = engine.getPreviewSnapshot().boss?.octarch?.actionStage;
    if (stage) {
      observedStages.add(stage);
      if (stage !== previousStage) {
        stageTrace.push({
          frame,
          stage,
          attackTimer: engine.bossRef?.attackTimer ?? null,
          captured: engine.bossRef?.bossAbyssalOctarchState?.captured ?? null,
          recoveryEndFrame: engine.bossRef?.bossAbyssalOctarchState?.recoveryEndFrame ?? null
        });
        previousStage = stage;
      }
    }
    if (
      observedStages.has('preparation')
      && observedStages.has('telegraph')
      && observedStages.has('active')
      && observedStages.has('recovery')
    ) break;
  }
  assert.equal(observedStages.has('preparation'), true);
  assert.equal(observedStages.has('telegraph'), true);
  assert.equal(observedStages.has('active'), true);
  assert.equal(observedStages.has('recovery'), true);
  if (observedStages.has('held')) {
    assert.equal(
      observedStages.has('throwing'),
      true,
      `a successful capture must always flow into one bounded throw; trace ${JSON.stringify(stageTrace)}`
    );
  }
});

test('lethal Octarch contact enters the normal death sequence exactly once and cancels player ownership', () => {
  const engine = createEngine('octarch-lethal-grab', {
    previewInvincible: false
  });
  const boss = seedReleasedThrow(engine);
  const state = boss.bossAbyssalOctarchState;
  state.actionClipId = 'lethal-grasp';
  state.damageApplied = false;
  state.captured = true;
  state.stage = 'held';
  boss.bossActionPresentation = {
    actionClipId: state.actionClipId,
    stage: 'fire'
  };
  boss.bossAbyssalGrabState = 'held';
  engine.lives = 1;
  engine.stats.lives = 1;
  engine.invincibleTimer = 0;
  let deathSequenceCalls = 0;
  const startDeathSequence = engine.startDeathSequence.bind(engine);
  engine.startDeathSequence = () => {
    deathSequenceCalls += 1;
    return startDeathSequence();
  };

  assert.equal(
    engine.applyAbyssalOctarchPlayerHit(boss, state, 'GRABBED'),
    true
  );
  assert.equal(engine.lives, 0);
  assert.ok(engine.deathSequenceFrames > 0);
  assert.equal(deathSequenceCalls, 1);
  assert.equal(state.captured, false);
  assert.equal(state.stage, 'complete');
  assert.equal(state.throwVelocityX, 0);
  assert.equal(state.throwVelocityY, 0);
  assertZeroReleasedThrow(engine, boss, 'lethal grab');
  assert.equal(boss.bossActionPresentation, undefined);

  assert.equal(
    engine.applyAbyssalOctarchPlayerHit(boss, state, 'GRABBED'),
    false
  );
  assert.equal(deathSequenceCalls, 1);
});

test('Needle-Tip Stab locks, warns, strikes once, and recovers independently per thrust', () => {
  const engine = createEngine('octarch-multi-needle');
  assert.equal(
    engine.triggerAuthoredBossAttack(
      'needle-tip-stab',
      event.id,
      'octarch-first-contact',
      true
    ),
    true
  );
  const thrusts = new Map();
  for (let frame = 0; frame < 520; frame += 1) {
    engine.update();
    const boss = engine.bossRef;
    const state = boss?.bossAbyssalOctarchState;
    if (!state || state.actionId !== 'needle-tip-stab') continue;
    let thrust = thrusts.get(state.actionClipId);
    if (!thrust) {
      const warning = [...engine.entities].reverse().find((entity) => (
        entity.effectType === 'ring'
        && entity.color === '#fbbf24'
        && !entity.markedForDeletion
      ));
      assert.ok(warning, 'every thrust must create its own visible target warning');
      thrust = {
        target: { ...state.plan.target },
        stages: new Set(),
        warning,
        guardChecked: false
      };
      thrusts.set(state.actionClipId, thrust);
      const bounds = engine.getPlayerMovementBounds();
      engine.player.x = state.plan.target.x < engine.width / 2
        ? bounds.maxX
        : bounds.minX;
      engine.player.y = bounds.maxY;
    }
    thrust.stages.add(state.stage);
    if (state.stage === 'active' && !thrust.guardChecked) {
      assert.equal(state.damageApplied, false);
      assert.ok(
        engine.entities.includes(thrust.warning)
          && !thrust.warning.markedForDeletion
          && thrust.warning.life > 0,
        'the locked warning must not be removed when its thrust begins'
      );
      assert.equal(
        engine.applyAbyssalOctarchPlayerHit(boss, state, 'HIT'),
        false
      );
      assert.equal(state.damageApplied, true);
      const entityCountAfterFirstHit = engine.entities.length;
      assert.equal(
        engine.applyAbyssalOctarchPlayerHit(boss, state, 'HIT'),
        false
      );
      assert.equal(
        engine.entities.length,
        entityCountAfterFirstHit,
        'one thrust may apply feedback only once'
      );
      thrust.guardChecked = true;
    }
    if (
      thrusts.size >= 3
      && [...thrusts.values()].every((entry) => (
        entry.guardChecked && entry.stages.has('recovery')
      ))
    ) break;
  }

  assert.equal(thrusts.size, 3);
  assert.equal(
    new Set([...thrusts.values()].map((thrust) => (
      `${thrust.target.x}:${thrust.target.y}`
    ))).size,
    3,
    'each warning must lock the player position anew'
  );
  for (const thrust of thrusts.values()) {
    assert.equal(thrust.stages.has('preparation') || thrust.stages.has('telegraph'), true);
    assert.equal(thrust.stages.has('active'), true);
    assert.equal(thrust.stages.has('recovery'), true);
    assert.equal(thrust.guardChecked, true);
  }
});

test('selected tentacle shot collision follows the shared live attack tip while neutral limbs stay fixed', () => {
  const engine = createEngine('octarch-live-tip-hit-region');
  const boss = engine.bossRef;
  assert.ok(boss);
  assert.equal(
    engine.triggerAuthoredBossAttack(
      'sweeping-arm',
      event.id,
      'octarch-first-contact',
      true
    ),
    true
  );
  let state;
  for (let frame = 0; frame < 360; frame += 1) {
    engine.update();
    state = boss.bossAbyssalOctarchState;
    if (
      state?.actionId === 'sweeping-arm'
      && state.stage === 'active'
      && (boss.attackTimer - state.fireStartFrame)
        / Math.max(1, state.fireEndFrame - state.fireStartFrame) >= 0.52
    ) break;
  }
  assert.ok(state?.actionId === 'sweeping-arm' && state.stage === 'active');
  const selected = boss.bossComponents.find((component) => (
    component.id === state.plan.tentacleIds[0]
  ));
  const neutral = boss.bossComponents.find((component) => (
    component.id !== state.plan.tentacleIds[0] && !component.destroyed
  ));
  assert.ok(selected && neutral);
  const progress = (boss.attackTimer - state.fireStartFrame)
    / Math.max(1, state.fireEndFrame - state.fireStartFrame);
  const descriptor = octarchRuntime.ABYSSAL_OCTARCH_TENTACLES.find((tentacle) => (
    tentacle.id === selected.id
  ));
  assert.ok(descriptor);
  const tip = octarchRuntime.sampleAbyssalOctarchAttackTip({
    actionId: state.actionId,
    start: {
      x: boss.x + boss.width * descriptor.centerXRatio,
      y: boss.y + boss.height * descriptor.centerYRatio
    },
    finalTarget: state.plan.target,
    sequence: state.plan.sequence,
    activeProgress: progress,
    arenaWidth: engine.width,
    bossWidth: boss.width
  }).tip;
  const selectedBox = engine.getBossComponentVisualBox(boss, selected);
  assert.ok(tip.x >= selectedBox.x && tip.x <= selectedBox.x + selectedBox.width);
  assert.ok(tip.y >= selectedBox.y && tip.y <= selectedBox.y + selectedBox.height);
  assert.equal(
    engine.getBossComponentHit(boss, {
      x: tip.x - 3,
      y: tip.y - 3,
      width: 6,
      height: 6
    })?.id,
    selected.id
  );

  const neutralBox = engine.getBossComponentVisualBox(boss, neutral);
  const expectedNeutralWidth = Math.max(18, boss.width * neutral.widthRatio);
  const expectedNeutralHeight = Math.max(18, boss.height * neutral.heightRatio);
  assert.deepEqual(neutralBox, {
    x: boss.x + boss.width * neutral.centerXRatio - expectedNeutralWidth / 2,
    y: boss.y + boss.height * neutral.centerYRatio - expectedNeutralHeight / 2,
    width: expectedNeutralWidth,
    height: expectedNeutralHeight
  });
});

test('Final Core phase reaction cancels attacks and hazards until exposure completes', () => {
  const engine = createEngine('octarch-final-core-reaction');
  assert.equal(
    engine.jumpToAuthoredBossPhase('octarch-severed-fury', event.id),
    true
  );
  const boss = seedReleasedThrow(engine);
  const hazard = engine.createEntity(EntityType.PROJECTILE, 80, 180);
  hazard.bossOwnerId = boss.id;
  hazard.damage = 1;
  engine.entities.push(hazard);
  const survivors = boss.bossComponents.filter((component) => !component.destroyed);
  assert.equal(survivors.length, 2);
  for (const component of survivors) {
    engine.damageBossComponent(boss, component, component.maxHp + 1);
  }

  assert.equal(boss.activeBossPhaseId, 'octarch-final-core');
  assert.equal(boss.bossAbyssalOctarchState, undefined);
  assert.equal(boss.bossAbyssalOctarchTransition, undefined);
  assert.equal(boss.bossAbyssalGrabState, 'none');
  assert.deepEqual(engine.playerVel, { x: 0, y: 0 });
  assert.equal(hazard.markedForDeletion, true);
  assert.ok(boss.bossAbyssalOctarchPhaseReaction);
  assert.equal(boss.bossActionPresentation?.stage, 'phase-enter');
  const duration = boss.bossAbyssalOctarchPhaseReaction.durationFrames;
  const observedStages = new Set();
  let activeReactionFrames = 0;
  for (let frame = 0; frame < duration + 80; frame += 1) {
    engine.update();
    const reaction = boss.bossAbyssalOctarchPhaseReaction;
    if (!reaction) break;
    activeReactionFrames += 1;
    observedStages.add(reaction.stage);
    assert.equal(boss.bossAbyssalOctarchState, undefined);
    assert.equal(boss.bossActionPresentation?.stage, 'phase-enter');
    assert.equal(
      engine.entities.some((entity) => (
        entity.bossOwnerId === boss.id
        && entity.type === EntityType.PROJECTILE
        && !entity.markedForDeletion
      )),
      false
    );
    const snapshotBoss = engine.getPreviewSnapshot().boss;
    const snapshot = snapshotBoss?.octarch?.phaseReaction;
    assert.ok(snapshot);
    assert.ok(snapshot.progress >= 0 && snapshot.progress < 1);
    assert.equal(snapshotBoss.state, 'phase-enter');
    assert.equal(snapshotBoss.activeAttack, null);
    assert.equal(snapshotBoss.nextAttack, null);
  }
  assert.ok(activeReactionFrames >= duration);
  assert.equal(observedStages.has('recoil'), true);
  assert.equal(observedStages.has('rage'), true);
  assert.equal(observedStages.has('core-exposure'), true);
  assert.equal(boss.bossAbyssalOctarchPhaseReaction, undefined);
  assert.equal(boss.bossActionPresentation, undefined);
  assert.equal(boss.attackTimer, 0);

  for (let frame = 0; frame < 180 && !boss.bossAbyssalOctarchState; frame += 1) {
    engine.update();
  }
  assert.ok(boss.bossAbyssalOctarchState, 'attacks resume only after reaction cleanup');
  assert.equal(boss.bossAbyssalOctarchState.phaseIndex, 4);
});

test('manual phase reconstruction clears an in-flight Octarch reaction presentation', () => {
  const engine = createEngine('octarch-reaction-phase-jump-cleanup');
  assert.equal(
    engine.jumpToAuthoredBossPhase('octarch-severed-fury', event.id),
    true
  );
  const boss = seedReleasedThrow(engine);
  const survivors = boss.bossComponents.filter((component) => !component.destroyed);
  for (const component of survivors) {
    engine.damageBossComponent(boss, component, component.maxHp + 1);
  }
  assert.equal(boss.bossAbyssalOctarchPhaseReaction?.phaseId, 'octarch-final-core');
  assert.equal(boss.bossActionPresentation?.actionClipId, 'octarch-final-core-reaction');
  engine.update();

  assert.equal(
    engine.jumpToAuthoredBossPhase('octarch-first-contact', event.id),
    true
  );
  assert.equal(boss.bossAbyssalOctarchPhaseReaction, undefined);
  assert.equal(boss.bossActionPresentation, undefined);
  const snapshotBoss = engine.getPreviewSnapshot().boss;
  assert.notEqual(snapshotBoss?.state, 'phase-enter');
  assert.equal(snapshotBoss?.octarch?.phaseReaction, null);
});

test('Octarch defeat restores normal camera, player home, and action lifecycle', () => {
  const engine = createEngine('octarch-defeat-restore');
  assert.equal(
    engine.jumpToAuthoredBossPhase('octarch-first-contact', event.id),
    true
  );
  assert.equal(engine.setPreviewEncounterCameraMode('expanded'), true);
  const expandedBounds = engine.getPlayerMovementBounds();
  engine.player.x = expandedBounds.maxX;
  engine.player.y = expandedBounds.maxY;
  const defeatedBoss = seedReleasedThrow(engine);

  engine.handleEnemyDestroyed(defeatedBoss);
  assert.ok(defeatedBoss.bossAbyssalDefeatStartFrame >= 0);
  assert.deepEqual(engine.playerVel, { x: 0, y: 0 });
  for (
    let frame = 0;
    frame < 166 + artwork.encounterCamera.restoreDurationFrames + 2;
    frame += 1
  ) {
    engine.update();
  }

  assert.equal(engine.getEncounterCameraTransform().scale, artwork.encounterCamera.normalScale);
  assert.deepEqual(
    { x: engine.player.x, y: engine.player.y },
    engine.getPlayerHomePosition()
  );
  assertZeroReleasedThrow(engine, defeatedBoss, 'defeat');
  assert.equal(engine.bossRef, null);
  assert.equal(
    engine.entities.some((entity) => (
      entity.bossOwnerId === defeatedBoss.id && !entity.markedForDeletion
    )),
    false
  );
});

test('Replay then Skip defeat completes the camera restore across the stopped preview loop', () => {
  const engine = createEngine('octarch-expanded-completion-restore');
  const normalBounds = engine.getPlayerMovementBounds();
  assert.equal(engine.replayPreviewEncounterCameraEntrance(), true);
  assert.equal(engine.setPreviewEncounterCameraMode('expanded'), true);
  assert.equal(
    engine.getEncounterCameraTransform().scale,
    artwork.encounterCamera.expandedScale
  );
  assert.equal(
    engine.jumpToAuthoredBossPhase('octarch-final-core', event.id),
    true
  );
  const boss = engine.bossRef;
  assert.ok(boss);
  assert.equal(engine.setPreviewBossHealthRatio(0.01, event.id), true);
  engine.damageBossHull(boss, boss.hp + 1);
  assert.ok(boss.hp <= 0);
  engine.handleEnemyDestroyed(boss);
  assert.ok(boss.bossAbyssalDefeatStartFrame >= 0);

  let inactiveRestoreTicks = 0;
  let scaleAtCompletionBoundary = null;
  for (let frame = 0; frame < 500; frame += 1) {
    const pendingCameraRestore = engine.hasPendingPreviewEncounterCameraRestore();
    if (!engine.gameActive && pendingCameraRestore) {
      inactiveRestoreTicks += 1;
      scaleAtCompletionBoundary ??= engine.getEncounterCameraTransform().scale;
    }
    const shouldAdvance = previewRuntime.shouldAdvancePreviewRuntimeFrame({
      running: true,
      gameActive: engine.gameActive,
      pendingCameraRestore
    });
    if (!shouldAdvance) break;
    engine.update();
  }

  assert.ok(scaleAtCompletionBoundary >= artwork.encounterCamera.expandedScale);
  assert.ok(scaleAtCompletionBoundary < artwork.encounterCamera.normalScale);
  assert.ok(inactiveRestoreTicks > 0);
  assert.equal(engine.gameActive, false);
  assert.equal(engine.previewComplete, true);
  assert.equal(engine.hasPendingPreviewEncounterCameraRestore(), false);
  assert.equal(
    engine.getEncounterCameraTransform().scale,
    artwork.encounterCamera.normalScale
  );
  assert.deepEqual(engine.getPlayerMovementBounds(), normalBounds);
  const snapshotCamera = engine.getPreviewSnapshot().encounterCamera;
  assert.equal(snapshotCamera?.mode, 'normal');
  assert.equal(snapshotCamera?.scale, artwork.encounterCamera.normalScale);
  assert.equal(snapshotCamera?.expanded, false);
});
