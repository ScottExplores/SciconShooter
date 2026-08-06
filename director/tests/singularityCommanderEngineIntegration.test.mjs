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

const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');
const { getBossTimelineAttackWindow } = await vite.ssrLoadModule(
  '/services/gameplay/bosses/BossTimelineRuntime.ts'
);
const { resolveCampaignBossArtwork } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/CampaignBossArtworkRegistry.ts'
);
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);

const level = campaign.levels.find((candidate) => candidate.order === 35);
const wave = level?.waves.find((candidate) => candidate.events.some(
  (event) => event.id === 'stage-singularity-reach-commander-major-boss'
));
const event = wave?.events.find(
  (candidate) => candidate.id === 'stage-singularity-reach-commander-major-boss'
);
assert.ok(level, 'Mission 35 must exist');
assert.ok(wave, 'Mission 35 boss wave must exist');
assert.equal(event?.kind, 'boss');
assert.equal(event.bossId, 'singularity-crab');

const artwork = resolveCampaignBossArtwork(campaign, level.id, wave.id);
assert.ok(artwork?.modularRig, 'the campaign-native Singularity modular rig must resolve');
assert.ok(artwork.sampleModularPose, 'the campaign-native Singularity pose sampler must resolve');
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

const createEngine = (seed) => {
  const engine = new GameEngine(createStats(), {
    campaign,
    // Test controls are enabled without previewMode so these assertions cover
    // the shared production simulation path used by Campaign and Weekly Run.
    previewMode: false,
    testMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: level.id,
    initialWaveId: wave.id,
    randomSeed: seed,
    previewBossCollisionEventId: event.id,
    previewBossCollisionMask: artwork.collisionMask,
    previewBossWeaponSockets: artwork.weaponSockets,
    previewBossWeaponSocketPoseSampler: poseSampler,
    previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
    previewBossReducedMotion: false,
    previewBossWeaponSocketEventId: event.id,
    previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
  });
  engine.init(390, 844);
  engine.invincibleTimer = 100_000;
  assert.equal(engine.spawnPreviewEventNow(event.id), true);
  assert.equal(engine.bossRef?.sourceItemId, 'singularity-crab');
  return engine;
};

const ATTACK_PHASES = Object.freeze({
  'gravity-well-genesis': 'gravitational-calibration',
  'event-horizon-gaze': 'gravitational-calibration',
  'tidal-claw-pincer': 'spatial-compression',
  'orbital-pylon-barrage': 'gravitational-calibration',
  'singularity-pulse': 'spatial-compression',
  'gravity-collapse': 'event-horizon-instability'
});

const EXPECTED_ATTACK_ART = Object.freeze({
  'gravity-well-genesis': ['boss-singularity-seed', 'boss-singularity-well', 'boss-singularity-shard'],
  'event-horizon-gaze': ['boss-singularity-beam'],
  'tidal-claw-pincer': ['boss-singularity-claw'],
  'orbital-pylon-barrage': ['boss-singularity-bolt'],
  'singularity-pulse': ['boss-singularity-pulse'],
  'gravity-collapse': ['boss-singularity-seed', 'boss-singularity-well', 'boss-singularity-collapse']
});

const runIsolatedAttack = (attackId, options = {}) => {
  const engine = createEngine(`singularity-engine-${attackId}`);
  const phaseId = ATTACK_PHASES[attackId];
  assert.equal(
    engine.triggerAuthoredBossAttack(attackId, event.id, phaseId),
    true,
    `${attackId} must be startable through the public Boss Sandbox command surface`
  );
  const boss = engine.bossRef;
  assert.ok(boss);
  const attackWindow = getBossTimelineAttackWindow(
    event.timeline,
    attackId,
    phaseId,
    60
  );
  assert.ok(attackWindow, `${attackId} must resolve an authored timeline window`);

  const visualKinds = new Set();
  const artifactKinds = new Set();
  const ownedEntityIds = new Set();
  const activeStages = new Set();
  const snapshotSamples = [];
  const nonDamagingFrameByEntityId = new Map();
  const firstDamagingFrameByEntityId = new Map();
  let sawTargetAttack = false;

  for (let frame = 0; frame < (options.maximumFrames ?? 900); frame += 1) {
    engine.update();
    const snapshot = engine.getPreviewSnapshot();
    const activeAttack = snapshot.boss?.activeAttack;
    if (activeAttack?.id === attackId) {
      sawTargetAttack = true;
      activeStages.add(activeAttack.stage);
      snapshotSamples.push(snapshot.boss);
    }

    for (const entity of engine.entities) {
      if (entity.markedForDeletion || entity.bossOwnerId !== boss.id) continue;
      ownedEntityIds.add(entity.id);
      if (entity.projectileVisualKind) visualKinds.add(entity.projectileVisualKind);
      if (entity.singularityArtifactKind) artifactKinds.add(entity.singularityArtifactKind);
      if (entity.singularityArtifactKind === 'beam' || entity.singularityArtifactKind === 'well') {
        if (!entity.singularityDamageActive) {
          nonDamagingFrameByEntityId.set(
            entity.id,
            nonDamagingFrameByEntityId.get(entity.id) ?? frame
          );
        } else {
          firstDamagingFrameByEntityId.set(
            entity.id,
            firstDamagingFrameByEntityId.get(entity.id) ?? frame
          );
        }
      }
    }
    if (boss.attackTimer > attackWindow.endFrame + 1) break;
  }

  assert.equal(sawTargetAttack, true, `${attackId} must enter its authored timeline window`);
  return {
    engine,
    boss,
    visualKinds,
    artifactKinds,
    ownedEntityIds,
    activeStages,
    snapshotSamples,
    nonDamagingFrameByEntityId,
    firstDamagingFrameByEntityId
  };
};

test('all six preview-triggered attacks execute in the shared production engine with owned art semantics', () => {
  for (const [attackId, expectedVisualKinds] of Object.entries(EXPECTED_ATTACK_ART)) {
    const result = runIsolatedAttack(attackId);
    assert.ok(result.ownedEntityIds.size > 0, `${attackId} must create boss-owned runtime entities`);
    for (const expectedVisualKind of expectedVisualKinds) {
      assert.ok(
        result.visualKinds.has(expectedVisualKind),
        `${attackId} must expose the ${expectedVisualKind} production art semantic`
      );
      assert.ok(
        Object.hasOwn(artwork.projectileAnimations ?? {}, expectedVisualKind),
        `${expectedVisualKind} must resolve to a registered production animation`
      );
    }
    assert.ok(result.activeStages.has('warning'), `${attackId} must begin with a warning`);
    assert.ok(result.activeStages.has('fire'), `${attackId} must reach its fire beat`);
    assert.ok(result.activeStages.has('recovery'), `${attackId} must expose recovery`);
  }
});

test('Event Horizon beams and both well attacks exist harmlessly before becoming damaging', () => {
  for (const attackId of [
    'event-horizon-gaze',
    'gravity-well-genesis',
    'gravity-collapse'
  ]) {
    const result = runIsolatedAttack(attackId);
    assert.ok(
      result.firstDamagingFrameByEntityId.size > 0,
      `${attackId} must eventually expose a damaging owned beam or well`
    );
    for (const [entityId, damageFrame] of result.firstDamagingFrameByEntityId) {
      const warningFrame = result.nonDamagingFrameByEntityId.get(entityId);
      assert.ok(
        Number.isInteger(warningFrame),
        `${attackId} entity ${entityId} must visibly exist before its damage window`
      );
      assert.ok(
        warningFrame < damageFrame,
        `${attackId} entity ${entityId} warning frame ${warningFrame} must precede damage frame ${damageFrame}`
      );
    }
  }
});

test('phase jumps expose exactly the authored 3/5/6 attack rosters', () => {
  const expectedByPhase = new Map([
    ['gravitational-calibration', [
      'gravity-well-genesis',
      'event-horizon-gaze',
      'orbital-pylon-barrage'
    ]],
    ['spatial-compression', [
      'gravity-well-genesis',
      'event-horizon-gaze',
      'tidal-claw-pincer',
      'orbital-pylon-barrage',
      'singularity-pulse'
    ]],
    ['event-horizon-instability', Object.keys(EXPECTED_ATTACK_ART)]
  ]);

  for (const [phaseId, availableAttackIds] of expectedByPhase) {
    const engine = createEngine(`singularity-phase-roster-${phaseId}`);
    assert.equal(engine.jumpToAuthoredBossPhase(phaseId, event.id), true);
    assert.equal(engine.getPreviewSnapshot().boss?.phaseId, phaseId);
    for (const attackId of Object.keys(EXPECTED_ATTACK_ART)) {
      assert.equal(
        engine.triggerAuthoredBossAttack(attackId, event.id, phaseId),
        availableAttackIds.includes(attackId),
        `${attackId} availability in ${phaseId}`
      );
    }
  }
});

test('clear-boss-hazards removes Singularity-owned hazards and resets telemetry', () => {
  const engine = createEngine('singularity-clear-hazards');
  assert.equal(
    engine.triggerAuthoredBossAttack(
      'gravity-well-genesis',
      event.id,
      'event-horizon-instability'
    ),
    true
  );
  const boss = engine.bossRef;
  assert.ok(boss);

  let liveSnapshot;
  for (let frame = 0; frame < 540; frame += 1) {
    engine.update();
    const snapshot = engine.getPreviewSnapshot().boss;
    if ((snapshot?.activeWells ?? 0) > 0 && (snapshot?.hazardCount ?? 0) > 0) {
      liveSnapshot = snapshot;
      break;
    }
  }
  assert.ok(liveSnapshot, 'the command test must first observe a live damaging gravity well');
  assert.ok(liveSnapshot.activeWells > 0);
  assert.ok(liveSnapshot.hazardCount > 0);

  assert.equal(engine.clearPreviewBossHazards(event.id), true);
  const clearedSnapshot = engine.getPreviewSnapshot().boss;
  assert.equal(clearedSnapshot?.activeWells, 0);
  assert.equal(clearedSnapshot?.hazardCount, 0);
  assert.equal(
    engine.entities.some((entity) => (
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.type === 'projectile'
    )),
    false,
    'the public clear command must remove every owned hostile projectile immediately'
  );
  for (let frame = 0; frame < 8; frame += 1) engine.update();
  const settledSnapshot = engine.getPreviewSnapshot().boss;
  assert.equal(settledSnapshot?.activeWells, 0);
  assert.equal(settledSnapshot?.hazardCount, 0);
  assert.equal(
    engine.entities.some((entity) => (
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.type === 'projectile'
    )),
    false,
    'cleared Singularity runtime must not respawn its owned hazards on the next simulation step'
  );
});

test('preview snapshot reports active wells, damaging hazards, and recovery cooldown', () => {
  const result = runIsolatedAttack('gravity-well-genesis');
  assert.ok(
    result.snapshotSamples.some((snapshot) => snapshot.activeWells > 0),
    'active well count must become observable'
  );
  assert.ok(
    result.snapshotSamples.some((snapshot) => snapshot.hazardCount > 0),
    'damaging owned hazard count must become observable'
  );
  assert.ok(
    result.snapshotSamples.some((snapshot) => snapshot.cooldownFrames > 0),
    'recovery cooldown must become observable'
  );
});

test('multi-step Singularity defeat delays removal and rewards until collapse completes', () => {
  const engine = createEngine('singularity-engine-defeat-gate');
  const boss = engine.bossRef;
  assert.ok(boss);
  const startingScore = engine.stats.score;
  const startingDefeats = engine.stats.enemiesDefeated;

  boss.hp = 0;
  engine.handleEnemyDestroyed(boss);
  assert.equal(boss.markedForDeletion, false);
  assert.equal(engine.bossRef, boss);
  assert.equal(engine.stats.score, startingScore);
  assert.equal(engine.stats.enemiesDefeated, startingDefeats);
  assert.equal(engine.mainBossDefeated, false);

  const observedStages = new Set([boss.bossSingularityDefeatLastStage]);
  for (let frame = 0; frame < 185; frame += 1) {
    engine.update();
    observedStages.add(boss.bossSingularityDefeatLastStage);
  }
  assert.equal(boss.markedForDeletion, false, 'the boss must remain through the final collapse frame');
  assert.equal(engine.stats.score, startingScore, 'reward must not arrive before defeat completion');
  assert.equal(engine.stats.enemiesDefeated, startingDefeats);
  assert.equal(engine.mainBossDefeated, false);
  for (const stage of ['pylons-failing', 'claws-limp', 'core-compression', 'final-collapse']) {
    assert.ok(observedStages.has(stage), `defeat must visibly pass through ${stage}`);
  }

  for (let frame = 0; frame < 8 && !boss.markedForDeletion; frame += 1) {
    engine.update();
  }
  assert.equal(boss.markedForDeletion, true, 'the completed collapse may finally remove the boss');
  assert.ok(engine.stats.score > startingScore, 'the configured boss reward arrives only at completion');
  assert.equal(engine.stats.enemiesDefeated, startingDefeats + 1);
  assert.equal(engine.mainBossDefeated, true);
});
