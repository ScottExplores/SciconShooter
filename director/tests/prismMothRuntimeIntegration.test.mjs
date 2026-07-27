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
  DEFAULT_PRISM_MOTH_ATTACK_TUNING,
  applyPrismMothAttackTuningToTimeline
} = await vite.ssrLoadModule(
  '/director/src/tools/bosses/prismMothAttackTuning.ts'
);
const { createSandboxOnlyBossArtwork } = await vite.ssrLoadModule(
  '/director/src/tools/bosses/bossSandboxModel.ts'
);
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');

const sourcePreview = buildSandboxBossPrototypePreview(campaign, 'prism-moth-brood');
const sourceBoss = sourcePreview.previewWave.events.find((event) => (
  event.kind === 'boss' && event.id === sourcePreview.eventId
));
assert.ok(sourceBoss?.timeline, 'Prism preview must expose its authored timeline');
const tunedTimeline = applyPrismMothAttackTuningToTimeline(
  sourceBoss.timeline,
  DEFAULT_PRISM_MOTH_ATTACK_TUNING
);
const tuneEvents = (events) => events.map((event) => (
  event.kind === 'boss' && event.id === sourcePreview.eventId
    ? { ...event, timeline: tunedTimeline }
    : event
));
const previewWave = {
  ...sourcePreview.previewWave,
  events: tuneEvents(sourcePreview.previewWave.events)
};
const preview = {
  ...sourcePreview,
  previewWave,
  campaign: {
    ...sourcePreview.campaign,
    levels: sourcePreview.campaign.levels.map((level) => (
      level.id !== sourcePreview.levelId
        ? level
        : {
            ...level,
            waves: level.waves.map((wave) => (
              wave.id === sourcePreview.waveId
                ? { ...wave, events: tuneEvents(wave.events) }
                : wave
            ))
          }
    ))
  }
};
const artwork = createSandboxOnlyBossArtwork(preview);
assert.equal(preview.eventId, 'sandbox-prism-moth-brood');
assert.ok(artwork.modularRig, 'Prism must use its registered modular rig in preview');
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

const createHarness = (
  seed,
  { width = 390, height = 844 } = {}
) => {
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
  engine.init(width, height);
  return { engine, width, height };
};

const settleAndStart = (
  harness,
  attackId,
  { phaseId, playerXRatio } = {}
) => {
  const { engine, width, height } = harness;
  assert.equal(engine.triggerAuthoredBossAttack(attackId, preview.eventId), true);
  const boss = engine.bossRef;
  assert.ok(boss, 'the canonical preview must spawn Prism Moth');
  const combatAnchorY = Math.max(72, Math.min(height * 0.13, 116));
  for (let frame = 0; boss.y < combatAnchorY && frame < 300; frame += 1) {
    engine.update();
  }
  assert.ok(boss.y >= combatAnchorY, 'Prism Moth must settle before an isolated attack');
  if (phaseId) {
    assert.equal(engine.jumpToAuthoredBossPhase(phaseId, preview.eventId), true);
  }
  if (Number.isFinite(playerXRatio)) {
    engine.player.x = Math.max(
      0,
      Math.min(
        width - engine.player.width,
        width * playerXRatio - engine.player.width / 2
      )
    );
  }
  assert.equal(
    engine.triggerAuthoredBossAttack(
      attackId,
      preview.eventId,
      phaseId ?? boss.activeBossPhaseId
    ),
    true
  );
  boss.y = Math.max(boss.y, combatAnchorY);
  return boss;
};

const activePrismArtifacts = (engine) => engine.entities.filter((entity) => (
  !entity.markedForDeletion && entity.prismMothArtifactState
));

const assertNoGameplayGuides = (engine) => {
  assert.equal(engine.entities.some((entity) => (
    entity.isBossGapGuide
    || entity.isBossSideBarrageGuide
    || (entity.isDetachedBeam && entity.isTelegraph)
    || (
      typeof entity.text === 'string'
      && /warning|safe gap|safe route|formation|future trajectory/i.test(entity.text)
    )
  )), false, 'Prism must communicate through anatomy and VFX, not gameplay guide copy');
};

test('live Prism Wingbeat Weave fires sequential feathers from both posed wings', () => {
  const harness = createHarness('prism-wingbeat-live-engine');
  const { engine } = harness;
  const boss = settleAndStart(harness, 'wingbeat-weave');
  assert.deepEqual(boss.bossComponents, [], 'Prism owns one hull health pool');

  const emittingSides = new Set();
  let featherCount = 0;
  for (let frame = 0; frame < 360; frame += 1) {
    const priorIds = new Set(engine.entities.map(({ id }) => id));
    engine.update();
    const newFeathers = engine.entities.filter((entity) => (
      !priorIds.has(entity.id)
      && entity.projectileVisualKind === 'boss-prism-feather'
      && entity.prismMothArtifactState?.kind === 'feather'
    ));
    assert.ok(newFeathers.length <= 1, 'a wingbeat must reveal feathers sequentially');
    for (const feather of newFeathers) {
      featherCount += 1;
      const center = {
        x: feather.x + feather.width / 2,
        y: feather.y + feather.height / 2
      };
      const bySide = ['port', 'starboard'].map((side) => ({
        side,
        distance: Math.min(...engine.getPreviewBossWeaponOrigins(boss, [side]).map((origin) => (
          Math.hypot(center.x - origin.x, center.y - origin.y)
        )))
      })).sort((left, right) => left.distance - right.distance);
      assert.ok(bySide[0].distance <= Math.max(14, boss.width * 0.09));
      emittingSides.add(bySide[0].side);
    }
    assertNoGameplayGuides(engine);
  }

  assert.equal(featherCount, 35, 'five authored wingbeats must each release seven feathers');
  assert.deepEqual([...emittingSides].sort(), ['port', 'starboard']);
});

test('Prism wings remain permanent animated anatomy while visible pixels damage its hull', () => {
  const harness = createHarness('prism-permanent-wing-anatomy');
  const { engine } = harness;
  const boss = settleAndStart(harness, 'wingbeat-weave');
  const startingHealth = boss.hp;
  assert.deepEqual(boss.bossComponents, []);
  assert.ok(engine.getPreviewBossWeaponOrigins(boss, ['port']).length > 0);
  assert.ok(engine.getPreviewBossWeaponOrigins(boss, ['starboard']).length > 0);

  engine.damageBossHull(boss, 5);

  assert.ok(boss.hp < startingHealth);
  assert.equal(boss.bossSignificantImpactIsComponent, false);
  assert.deepEqual(boss.bossComponents, []);
});

const collectBroodTrace = (seed, { playerXRatio = 0.5 } = {}) => {
  const harness = createHarness(seed);
  const { engine } = harness;
  settleAndStart(harness, 'brood-procession', { playerXRatio });
  const visualKinds = new Set();
  const trace = [];
  let damageFrames = 0;
  let maximumBroodCount = 0;
  for (let frame = 0; frame < 520; frame += 1) {
    engine.update();
    const brood = activePrismArtifacts(engine)
      .filter((entity) => entity.prismMothArtifactState.kind === 'brood')
      .sort((left, right) => left.variant - right.variant);
    maximumBroodCount = Math.max(maximumBroodCount, brood.length);
    for (const entity of brood) {
      visualKinds.add(entity.projectileVisualKind);
      if (entity.prismMothArtifactState.damageActive) {
        damageFrames += 1;
        assert.equal(entity.projectileVisualKind, 'boss-prism-broodling');
      }
    }
    if (frame % 12 === 0) {
      trace.push(brood.map((entity) => ({
        variant: entity.variant,
        visualKind: entity.projectileVisualKind,
        x: Number(entity.x.toFixed(3)),
        y: Number(entity.y.toFixed(3)),
        targetable: entity.prismMothArtifactState.targetable,
        damageActive: entity.prismMothArtifactState.damageActive
      })));
    }
    assertNoGameplayGuides(engine);
  }
  return { engine, trace, visualKinds, damageFrames, maximumBroodCount };
};

test('live Brood Procession deterministically deploys, hatches, flies, and cleans up', () => {
  const first = collectBroodTrace('prism-brood-live-engine');
  const replay = collectBroodTrace('prism-brood-live-engine');
  assert.deepEqual(replay.trace, first.trace);
  assert.deepEqual([...first.visualKinds].sort(), [
    'boss-prism-broodling',
    'boss-prism-cocoon'
  ]);
  assert.ok(first.damageFrames > 0, 'visible flying broodlings must own a damage window');
  assert.equal(first.maximumBroodCount, 8, 'two four-node authored waves must remain bounded');
  assert.equal(activePrismArtifacts(first.engine).length, 0, 'completed brood must not leak');

  const cleanupHarness = createHarness('prism-brood-cancel-engine');
  const cleanupBoss = settleAndStart(cleanupHarness, 'brood-procession');
  for (let frame = 0; frame < 130; frame += 1) cleanupHarness.engine.update();
  assert.ok(activePrismArtifacts(cleanupHarness.engine).length > 0);
  assert.equal(
    cleanupHarness.engine.triggerAuthoredBossAttack(
      'wingbeat-weave',
      preview.eventId,
      cleanupBoss.activeBossPhaseId
    ),
    true
  );
  cleanupHarness.engine.update();
  assert.equal(
    activePrismArtifacts(cleanupHarness.engine)
      .some((entity) => entity.prismMothArtifactState.kind === 'brood'),
    false,
    'phase/attack reconstruction must remove the previous action artifacts'
  );
});

test('Brood Procession locks onto the player lane and its animated spawns can be destroyed', () => {
  const leftHarness = createHarness('prism-brood-player-lock-left');
  const rightHarness = createHarness('prism-brood-player-lock-right');
  const leftBoss = settleAndStart(leftHarness, 'brood-procession', { playerXRatio: 0.2 });
  const rightBoss = settleAndStart(rightHarness, 'brood-procession', { playerXRatio: 0.8 });
  const findFormation = (harness, boss) => {
    for (let frame = 0; frame < 12; frame += 1) {
      const formation = boss.bossPrismMothActionStates.find((state) => (
        state.resolvedActionId === 'brood-procession'
      ))?.formation;
      if (formation) return formation;
      harness.engine.update();
    }
    return null;
  };
  const leftFormation = findFormation(leftHarness, leftBoss);
  const rightFormation = findFormation(rightHarness, rightBoss);
  assert.ok(leftFormation);
  assert.ok(rightFormation);
  assert.equal(leftFormation.pursuitTargetRatio, 0.2);
  assert.equal(rightFormation.pursuitTargetRatio, 0.8);
  assert.ok(
    rightFormation.corridorEndRatio - leftFormation.corridorEndRatio >= 0.35,
    'the locked formation route must visibly bend toward the chosen player lane'
  );

  const { engine } = leftHarness;
  let target = null;
  for (let frame = 0; frame < 180 && !target; frame += 1) {
    engine.update();
    target = engine.entities.find((entity) => (
      entity.prismMothArtifactState?.kind === 'brood'
      && entity.prismMothArtifactState.destructible
      && entity.prismMothArtifactState.targetable
    )) ?? null;
  }
  assert.ok(target, 'an armed cocoon or visible broodling must become targetable');
  assert.equal(target.hp, 2);
  assert.equal(target.maxHp, 2);
  assert.equal(engine.isEnemyTarget(target), true);
  const before = {
    score: engine.stats.score,
    coins: engine.stats.coins,
    enemiesDefeated: engine.stats.enemiesDefeated
  };

  const hitTarget = (damage) => {
    assert.equal(
      engine.spawnPlayerBullet(0, 0, 0, 0, 0, false, 'pulse', undefined, damage),
      true
    );
    const shot = [...engine.entities].reverse().find((entity) => entity.isPlayerShot);
    assert.ok(shot);
    shot.x = target.x + target.width / 2 - shot.width / 2;
    shot.y = target.y + target.height / 2 - shot.height / 2;
    engine.checkCollisions();
  };

  hitTarget(1);
  assert.equal(target.hp, 1);
  assert.equal(target.markedForDeletion, false);
  hitTarget(1);
  assert.equal(target.markedForDeletion, true);
  assert.deepEqual({
    score: engine.stats.score,
    coins: engine.stats.coins,
    enemiesDefeated: engine.stats.enemiesDefeated
  }, before, 'destroying a boss-owned broodling must not create a farmable reward');
});

test('live Lunar Prism Swoop preserves denser two/three-pass trails on phone and desktop', () => {
  for (const scenario of [
    {
      phaseId: 'sandbox-moth-crystal-nursery',
      expectedPasses: 2,
      expectedTrails: 28
    },
    {
      phaseId: 'sandbox-moth-prism-metamorphosis',
      expectedPasses: 3,
      expectedTrails: 42
    }
  ]) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 720 }
    ]) {
      const harness = createHarness(
        `prism-swoop-${scenario.phaseId}-${viewport.width}`,
        viewport
      );
      const { engine, width, height } = harness;
      const boss = settleAndStart(harness, 'lunar-prism-swoop', {
        phaseId: scenario.phaseId
      });
      const activeEntryCenters = [];
      const activeXs = [];
      let activeSegments = 0;
      let trailCount = 0;
      let wasActive = false;
      for (let frame = 0; frame < 440; frame += 1) {
        const priorIds = new Set(engine.entities.map(({ id }) => id));
        engine.update();
        trailCount += engine.entities.filter((entity) => (
          !priorIds.has(entity.id)
          && entity.prismMothArtifactState?.kind === 'swoop-trail'
        )).length;
        const active = boss.bossPrismMothBodyDamageActive;
        if (active && !wasActive) {
          activeSegments += 1;
          activeEntryCenters.push(boss.x + boss.width / 2);
        }
        if (active) {
          activeXs.push(boss.x);
          assert.ok(boss.x >= 0 && boss.x + boss.width <= width);
          assert.ok(boss.y >= 0 && boss.y + boss.height <= height - 72);
        }
        wasActive = active;
        assertNoGameplayGuides(engine);
      }
      assert.equal(
        activeSegments,
        scenario.expectedPasses,
        `${width}x${height} must show every authored pass: ${JSON.stringify({
          attackTimer: boss.attackTimer,
          y: boss.y,
          states: boss.bossPrismMothActionStates.map((state) => ({
            resolvedActionId: state.resolvedActionId,
            warningStartFrame: state.warningStartFrame,
            scheduledFireFrame: state.scheduledFireFrame,
            fireStartFrame: state.fireStartFrame,
            fireEndFrame: state.fireEndFrame,
            executionIndex: state.executionIndex,
            hasSwoopPass: Boolean(state.swoopPass)
          }))
        })}`
      );
      assert.equal(
        trailCount,
        scenario.expectedTrails,
        `${width}x${height} ${scenario.phaseId} must retain its four-frame feather cadence`
      );
      assert.ok(activeXs.length > 0);
      assert.ok(
        Math.max(...activeXs) - Math.min(...activeXs) >= (width - boss.width) * 0.72,
        `${width}x${height} swoops must visibly cross the playfield`
      );
      for (let index = 1; index < activeEntryCenters.length; index += 1) {
        assert.notEqual(
          activeEntryCenters[index - 1] < width / 2,
          activeEntryCenters[index] < width / 2,
          'each pass must enter from the opposite edge'
        );
      }
      assert.equal(boss.bossPrismMothBodyDamageActive, false);
    }
  }
});

test('live Kaleidoscope Brood activates cocoons in beats and leaves one route, not guides', () => {
  const harness = createHarness('prism-kaleidoscope-live-engine');
  const { engine } = harness;
  settleAndStart(harness, 'kaleidoscope-brood');
  const visualKinds = new Set();
  let maximumBroodCount = 0;
  let damageFrames = 0;
  let featherCount = 0;
  for (let frame = 0; frame < 720; frame += 1) {
    const priorIds = new Set(engine.entities.map(({ id }) => id));
    engine.update();
    const artifacts = activePrismArtifacts(engine);
    const brood = artifacts.filter((entity) => entity.prismMothArtifactState.kind === 'brood');
    maximumBroodCount = Math.max(maximumBroodCount, brood.length);
    for (const entity of brood) {
      visualKinds.add(entity.projectileVisualKind);
      if (entity.prismMothArtifactState.damageActive) damageFrames += 1;
    }
    featherCount += engine.entities.filter((entity) => (
      !priorIds.has(entity.id)
      && entity.projectileVisualKind === 'boss-prism-feather'
    )).length;
    assertNoGameplayGuides(engine);
  }
  assert.equal(maximumBroodCount, 6);
  assert.ok(visualKinds.has('boss-prism-cocoon'));
  assert.ok(visualKinds.has('boss-prism-broodling'));
  assert.ok(damageFrames > 0);
  assert.ok(featherCount > 0, 'ordered wing/core beats must close only the non-corridor lanes');
  assert.equal(
    activePrismArtifacts(engine).length,
    0,
    JSON.stringify(activePrismArtifacts(engine).map((entity) => ({
      kind: entity.prismMothArtifactState.kind,
      sourceActionId: entity.prismMothArtifactState.sourceActionId,
      sourceActionEndFrame: entity.prismMothArtifactState.sourceActionEndFrame,
      sourcePhaseId: entity.prismMothArtifactState.sourcePhaseId,
      attackTimer: engine.bossRef?.attackTimer
    })))
  );
});

test('the new Prism runtime is disabled when the exact sandbox event guard is absent', () => {
  const harness = createHarness('prism-production-guard');
  const { engine } = harness;
  const boss = settleAndStart(harness, 'wingbeat-weave');
  boss.sourceEventId = 'campaign-prism-moth-probe';
  boss.attackTimer = 0;
  boss.bossPrismMothActionStates = [];
  for (let frame = 0; frame < 520; frame += 1) engine.update();
  assert.equal(boss.bossPrismMothActionStates.length, 0);
  assert.equal(
    engine.entities.some((entity) => entity.prismMothArtifactState),
    false,
    'production-shaped Prism entities must preserve their existing campaign runtime'
  );
});
