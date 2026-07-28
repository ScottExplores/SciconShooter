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
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');

const preview = buildSandboxBossPrototypePreview(campaign, 'helios-clawcarrier');
const artwork = createSandboxOnlyBossArtwork(preview);
const poseSampler = createModularBossWeaponSocketPoseSampler(
  artwork.modularRig,
  artwork.sampleModularPose
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
  upgrades: { fireRate: 0, speed: 0, missile: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const createHeliosEngine = (seed) => new GameEngine(createStats(), {
  campaign: preview.campaign,
  previewMode: true,
  previewInvincible: true,
  audioEnabled: false,
  initialLevelId: preview.levelId,
  initialWaveId: preview.waveId,
  randomSeed: seed,
  previewBossCollisionEventId: preview.eventId,
  previewBossCollisionMask: artwork.collisionMask,
  previewBossWeaponSockets: artwork.weaponSockets,
  previewBossWeaponSocketPoseSampler: poseSampler,
  previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
  previewBossReducedMotion: false,
  previewBossWeaponSocketEventId: preview.eventId,
  previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
});

test('Helios Attack 3 mines complete their visible lifecycle through the real engine update', () => {
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: 'helios-mine-real-engine-regression',
    previewBossCollisionEventId: preview.eventId,
    previewBossWeaponSockets: artwork.weaponSockets,
    previewBossWeaponSocketPoseSampler: poseSampler,
    previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
    previewBossReducedMotion: false,
    previewBossWeaponSocketEventId: preview.eventId,
    previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
  });
  engine.init(390, 844);
  assert.equal(
    engine.triggerAuthoredBossAttack('reactor-maze', preview.eventId),
    true
  );
  const boss = engine.bossRef;
  assert.ok(boss, 'the canonical preview must spawn Helios');

  const combatAnchorY = Math.max(72, Math.min(844 * 0.13, 116));
  for (let frame = 0; boss.y < combatAnchorY && frame < 300; frame += 1) {
    engine.update();
  }
  assert.ok(boss.y >= combatAnchorY, 'Helios must settle before the isolated attack starts');
  assert.equal(
    engine.triggerAuthoredBossAttack('reactor-maze', preview.eventId, boss.activeBossPhaseId),
    true
  );
  boss.y = Math.max(boss.y, combatAnchorY);

  const lifecycleById = new Map();
  const removedIds = new Set();
  let priorMineIds = new Set();
  for (let frame = 0; frame < 900; frame += 1) {
    engine.update();
    const mines = engine.entities.filter((entity) => entity.heliosMineState);
    const mineIds = new Set(mines.map((mine) => mine.id));
    for (const id of priorMineIds) {
      if (!mineIds.has(id)) removedIds.add(id);
    }
    priorMineIds = mineIds;
    for (const mine of mines) {
      const evidence = lifecycleById.get(mine.id) ?? {
        stages: new Set(),
        visualKinds: new Set(),
        damageFrames: 0,
        explosionFrames: 0,
        spriteFrameCounts: new Set(),
        maximumArmedBossClearance: Number.NEGATIVE_INFINITY,
        maximumExplosionCenterClearance: Number.NEGATIVE_INFINITY
      };
      evidence.stages.add(mine.heliosMineStage);
      evidence.visualKinds.add(mine.projectileVisualKind);
      evidence.spriteFrameCounts.add(mine.spriteFrames?.length ?? 0);
      if (engine.isHeliosMineDamageActive(mine)) evidence.damageFrames += 1;
      if (mine.heliosMineStage === 'armed') {
        evidence.maximumArmedBossClearance = Math.max(
          evidence.maximumArmedBossClearance,
          mine.y - (boss.y + boss.height)
        );
      }
      if (mine.heliosMineStage === 'exploding') {
        evidence.explosionFrames += 1;
        evidence.maximumExplosionCenterClearance = Math.max(
          evidence.maximumExplosionCenterClearance,
          mine.y + mine.height / 2 - (boss.y + boss.height)
        );
      }
      lifecycleById.set(mine.id, evidence);
    }
  }

  assert.equal(lifecycleById.size, 3, 'Attack 3 must deploy its complete three-mine formation');
  for (const [mineId, evidence] of lifecycleById) {
    assert.deepEqual(
      [...evidence.stages],
      ['deploying', 'armed', 'exploding'],
      `mine ${mineId} must visibly deploy, arm, and explode`
    );
    assert.ok(evidence.visualKinds.has('boss-helios-mine'));
    assert.ok(evidence.visualKinds.has('boss-helios-explosion'));
    assert.ok(evidence.spriteFrameCounts.has(7), 'the visible explosion must expose all sprite frames');
    assert.ok(evidence.damageFrames > 0, 'damage must be active during visible explosion frames');
    assert.ok(
      evidence.maximumArmedBossClearance >= 8,
      `mine ${mineId} must arm fully below the boss silhouette; clearance=${evidence.maximumArmedBossClearance}`
    );
    assert.ok(
      evidence.maximumExplosionCenterClearance >= 28,
      `mine ${mineId} explosion must remain visibly clear of the boss; clearance=${evidence.maximumExplosionCenterClearance}`
    );
    assert.ok(evidence.explosionFrames >= 36, 'the animated explosion must remain readable at normal speed');
    assert.ok(removedIds.has(mineId), 'the exploded mine must be removed after its final frame');
  }
  assert.equal(
    engine.entities.some((entity) => entity.heliosMineState),
    false,
    'no Helios mine may leak after cleanup'
  );
});

test('Helios Attack 3 escalates sequential reactor sprites and mines by health phase', () => {
  const expected = [
    { pellets: 25, mines: 3 },
    { pellets: 27, mines: 4 },
    { pellets: 31, mines: 5 }
  ];
  for (const [phaseIndex, phase] of preview.previewWave.events
    .find((event) => event.kind === 'boss').phases.entries()) {
    const engine = createHeliosEngine(`helios-reactor-density-${phaseIndex}`);
    engine.init(390, 844);
    assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
    assert.equal(engine.jumpToAuthoredBossPhase(phase.id, preview.eventId), true);
    assert.equal(
      engine.triggerAuthoredBossAttack('reactor-maze', preview.eventId, phase.id),
      true
    );
    const pelletIds = new Set();
    const mineIds = new Set();
    for (let frame = 0; frame < 620; frame += 1) {
      engine.update();
      for (const entity of engine.entities) {
        if (entity.projectileVisualKind === 'boss-reactor-pellet') {
          pelletIds.add(entity.id);
        }
        if (entity.heliosMineState) mineIds.add(entity.id);
      }
    }
    assert.equal(pelletIds.size, expected[phaseIndex].pellets, `${phase.label} pellet count`);
    assert.equal(mineIds.size, expected[phaseIndex].mines, `${phase.label} mine count`);
  }
});

test('Helios rapid bursts and moving channel emit sequential rounds from live mounted muzzles', () => {
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
      previewBossWeaponSockets: artwork.weaponSockets,
      previewBossWeaponSocketPoseSampler: poseSampler,
      previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
      previewBossReducedMotion: false,
      previewBossWeaponSocketEventId: preview.eventId,
      previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
    });
    engine.init(390, 844);
    return engine;
  };
  const settleAndStart = (engine, attackId) => {
    assert.equal(engine.triggerAuthoredBossAttack(attackId, preview.eventId), true);
    const boss = engine.bossRef;
    assert.ok(boss);
    const combatAnchorY = Math.max(72, Math.min(844 * 0.13, 116));
    for (let frame = 0; boss.y < combatAnchorY && frame < 300; frame += 1) {
      engine.update();
    }
    assert.ok(boss.y >= combatAnchorY);
    assert.equal(
      engine.triggerAuthoredBossAttack(attackId, preview.eventId, boss.activeBossPhaseId),
      true
    );
    boss.y = Math.max(boss.y, combatAnchorY);
    return boss;
  };
  const collectNewTracers = (engine, existingIds) => engine.entities.filter((entity) => (
    entity.projectileVisualKind === 'boss-gatling-tracer'
    && !existingIds.has(entity.id)
  ));

  const burstEngine = createEngine('helios-rapid-burst-real-engine');
  const burstBoss = settleAndStart(burstEngine, 'twin-rotary-crossfire');
  let burstTracerCount = 0;
  let burstFrames = 0;
  for (let frame = 0; frame < 330; frame += 1) {
    const existingIds = new Set(burstEngine.entities.map((entity) => entity.id));
    burstEngine.update();
    const tracers = collectNewTracers(burstEngine, existingIds);
    assert.ok(tracers.length <= 1, 'Attack 1 must emit individual rounds sequentially');
    if (tracers.length > 0) {
      burstTracerCount += tracers.length;
      burstFrames += 1;
      const tracer = tracers[0];
      assert.ok(tracer.vy > 0, 'Attack 1 tracers must travel down-screen');
    }
  }
  assert.equal(burstTracerCount, 22, 'phase-one Attack 1 must fire 5 + 5 + 12 rounds');
  assert.equal(burstFrames, burstTracerCount);
  assert.equal(
    burstEngine.entities.some((entity) => (
      entity.isBossGapGuide || entity.isBossSideBarrageGuide
    )),
    false
  );

  const channelEngine = createEngine('helios-channel-real-engine');
  const channelBoss = settleAndStart(channelEngine, 'machinegun-channel');
  const xSamples = [];
  const boundaryBySide = new Map();
  let channelAnchor;
  let channelShots = 0;
  let previousBossX = channelBoss.x;
  let maximumStep = 0;
  let minimumObservedOpening = Number.POSITIVE_INFINITY;
  let minimumPortBoundaryX = Number.POSITIVE_INFINITY;
  let maximumStarboardBoundaryX = Number.NEGATIVE_INFINITY;
  let leftEdgeCampThreatened = false;
  let rightEdgeCampThreatened = false;
  let previousChannelX;
  let previousChannelDirection = 0;
  let channelDirectionChanges = 0;
  let wasChannelActive = false;
  let settledChannelPosition;
  let firstDirectionSequence;
  let entryTracerCount = 0;
  let entryLeftThreatened = false;
  let entryRightThreatened = false;
  let entryCenterStayedOpen = true;
  for (let frame = 0; frame < 1_200; frame += 1) {
    const existingIds = new Set(channelEngine.entities.map((entity) => entity.id));
    channelEngine.update();
    const channelState = channelBoss.bossHeliosMachineGunChannelState;
    if (channelState && !channelAnchor) {
      channelAnchor = { x: channelState.anchorX, y: channelState.anchorY };
    }
    if (channelState && firstDirectionSequence === undefined) {
      firstDirectionSequence = channelState.directionSequence;
    }
    if (!channelState && wasChannelActive && !settledChannelPosition) {
      settledChannelPosition = { x: channelBoss.x, y: channelBoss.y };
    }
    if (!channelState && settledChannelPosition) break;
    if (channelState) wasChannelActive = true;
    if (channelState) {
      xSamples.push(channelBoss.x);
      if (previousChannelX !== undefined) {
        const deltaX = channelBoss.x - previousChannelX;
        const direction = Math.abs(deltaX) < 0.001 ? 0 : Math.sign(deltaX);
        if (
          direction !== 0
          && previousChannelDirection !== 0
          && direction !== previousChannelDirection
        ) {
          channelDirectionChanges += 1;
        }
        if (direction !== 0) previousChannelDirection = direction;
      }
      previousChannelX = channelBoss.x;
    }
    maximumStep = Math.max(maximumStep, Math.abs(channelBoss.x - previousBossX));
    previousBossX = channelBoss.x;

    const tracers = collectNewTracers(channelEngine, existingIds);
    assert.ok(tracers.length <= 2, 'the channel may emit one anatomy-owned round per rotary per frame');
    if (tracers.length === 0) continue;
    if (tracers.length === 1) {
      const tracer = tracers[0];
      assert.equal(channelState, undefined, 'the exterior herd must finish before the moving rails begin');
      assert.ok(tracer.vy > 0, 'entry tracers must travel toward the player lanes');
      entryTracerCount += 1;
      const tracerCenter = {
        x: tracer.x + tracer.width / 2,
        y: tracer.y + tracer.height / 2
      };
      const playerCenterY = channelEngine.player.y + channelEngine.player.height / 2;
      const projectedX = tracerCenter.x
        + (playerCenterY - tracerCenter.y) * tracer.vx / tracer.vy;
      const collisionReach = channelEngine.player.width / 2 + tracer.width * 0.3 + 3;
      entryLeftThreatened ||= Math.abs(projectedX - channelEngine.player.width / 2) <= collisionReach;
      entryRightThreatened ||= Math.abs(
        projectedX - (390 - channelEngine.player.width / 2)
      ) <= collisionReach;
      entryCenterStayedOpen &&= Math.abs(projectedX - 390 / 2) > 50;
      continue;
    }
    assert.equal(tracers.length, 2, 'both rotaries must maintain the channel rails together');
    channelShots += tracers.length;
    const origins = {
      port: channelEngine.getPreviewBossWeaponOrigins(channelBoss, ['port'])[0],
      starboard: channelEngine.getPreviewBossWeaponOrigins(channelBoss, ['starboard'])[0]
    };
    const emittedSides = new Set();
    for (const tracer of tracers) {
      assert.ok(tracer.vy > 0, 'channel tracers must travel generally toward 6 o’clock');
      const tracerCenter = {
        x: tracer.x + tracer.width / 2,
        y: tracer.y + tracer.height / 2
      };
      const distance = (point) => Math.hypot(
        tracerCenter.x - tracer.vx - point.x,
        tracerCenter.y - tracer.vy - point.y
      );
      const side = distance(origins.port) <= distance(origins.starboard)
        ? 'port'
        : 'starboard';
      emittedSides.add(side);
      const targetY = 844 + 44;
      const boundaryX = tracerCenter.x
        + (targetY - tracerCenter.y) * tracer.vx / tracer.vy;
      boundaryBySide.set(side, boundaryX);
      if (side === 'port') {
        minimumPortBoundaryX = Math.min(minimumPortBoundaryX, boundaryX);
      } else {
        maximumStarboardBoundaryX = Math.max(maximumStarboardBoundaryX, boundaryX);
      }
      const playerCenterY = channelEngine.player.y + channelEngine.player.height / 2;
      const boundaryAtPlayerY = tracerCenter.x
        + (playerCenterY - tracerCenter.y) * tracer.vx / tracer.vy;
      const collisionReach = channelEngine.player.width / 2 + tracer.width * 0.3 + 3;
      leftEdgeCampThreatened ||= Math.abs(
        boundaryAtPlayerY - channelEngine.player.width / 2
      ) <= collisionReach;
      rightEdgeCampThreatened ||= Math.abs(
        boundaryAtPlayerY - (390 - channelEngine.player.width / 2)
      ) <= collisionReach;
    }
    assert.deepEqual(
      [...emittedSides].sort(),
      ['port', 'starboard'],
      'every cadence pulse must retain both ordered channel rails'
    );
    if (boundaryBySide.size === 2) {
      const opening = boundaryBySide.get('starboard') - boundaryBySide.get('port');
      assert.ok(opening > 0, 'the channel boundaries must remain correctly ordered');
      minimumObservedOpening = Math.min(minimumObservedOpening, opening);
    }
  }
  assert.ok(channelAnchor);
  assert.equal(entryTracerCount, 10, 'the warned entry must fire five live tracers per rotary');
  assert.equal(entryLeftThreatened, true, 'the entry must herd the left exterior lane inward');
  assert.equal(entryRightThreatened, true, 'the entry must herd the right exterior lane inward');
  assert.equal(entryCenterStayedOpen, true, 'the entry herd must preserve the intended center route');
  assert.ok(channelShots >= 90, `the signature must sustain rapid fire; shots=${channelShots}`);
  const maximumViewportSafeSweep = Math.max(0, 390 - channelBoss.width - 8);
  const requiredVisibleSweep = Math.min(100, maximumViewportSafeSweep * 0.9);
  assert.ok(
    Math.max(...xSamples) - Math.min(...xSamples) >= requiredVisibleSweep,
    `mobile Helios must use nearly all available safe sweep travel; `
      + `required=${requiredVisibleSweep}`
  );
  assert.ok(maximumStep < 8, `the channel movement must not teleport; max step=${maximumStep}`);
  assert.ok(
    channelDirectionChanges >= 1,
    'the complete channel must reverse at least once instead of making one slow pass'
  );
  assert.ok(
    minimumObservedOpening >= 80,
    `the moving channel must preserve a ship-sized opening; width=${minimumObservedOpening}`
  );
  assert.ok(
    minimumPortBoundaryX <= 5,
    `the port boundary must sweep the left mobile gutter; minimum=${minimumPortBoundaryX}`
  );
  assert.ok(
    maximumStarboardBoundaryX >= 385,
    `the starboard boundary must sweep the right mobile gutter; maximum=${maximumStarboardBoundaryX}`
  );
  assert.equal(
    leftEdgeCampThreatened,
    true,
    'a stationary player at the left edge must be forced into the moving channel'
  );
  assert.equal(
    rightEdgeCampThreatened,
    true,
    'a stationary player at the right edge must be forced into the moving channel'
  );
  assert.ok(
    settledChannelPosition
      && Math.abs(settledChannelPosition.x - channelAnchor.x) <= 0.001
      && Math.abs(settledChannelPosition.y - channelAnchor.y) <= 0.001,
    'Helios must settle to the exact captured anchor after channel recovery'
  );
  assert.equal(channelBoss.bossHeliosMachineGunChannelState, undefined);
  assert.equal(
    channelBoss.bossHeliosMachineGunChannelUseCount,
    1,
    'four authored continuation segments must count as one complete channel use'
  );
  channelEngine.entities
    .filter((entity) => entity.projectileVisualKind === 'boss-gatling-tracer')
    .forEach((entity) => {
      entity.markedForDeletion = true;
    });
  channelEngine.hitStopFrames = 0;
  assert.equal(
    channelEngine.triggerAuthoredBossAttack(
      'machinegun-channel',
      preview.eventId,
      channelBoss.activeBossPhaseId
    ),
    true
  );
  let secondChannelState;
  const secondBoss = channelEngine.bossRef ?? channelBoss;
  for (let frame = 0; frame < 240 && !secondChannelState; frame += 1) {
    channelEngine.frameCount += 1;
    channelEngine.updateBoss(secondBoss);
    secondChannelState = secondBoss.bossHeliosMachineGunChannelState;
  }
  assert.ok(secondChannelState, 'a second manual use must rebuild the channel state');
  assert.notEqual(
    secondChannelState.directionSequence % 2,
    firstDirectionSequence % 2,
    'consecutive complete uses must begin from opposite horizontal edges'
  );
  assert.equal(secondBoss.bossHeliosMachineGunChannelUseCount, 2);
  assert.equal(
    channelEngine.entities.some((entity) => (
      entity.isBossGapGuide || entity.isBossSideBarrageGuide
    )),
    false,
    'normal gameplay must not draw safe-channel or targeting guides'
  );
});
