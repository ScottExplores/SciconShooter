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
const gameCanvasSource = await readFile(
  path.join(repositoryRoot, 'components', 'GameCanvas.tsx'),
  'utf8'
);
const gameLogicSource = await readFile(
  path.join(repositoryRoot, 'services', 'gameLogic.ts'),
  'utf8'
);
const previewSessionSource = await readFile(
  path.join(repositoryRoot, 'services', 'gameplay', 'previewSession.ts'),
  'utf8'
);

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

const {
  SANDBOX_BOSS_PROTOTYPES,
  buildSandboxBossPrototypePreview
} = await vite.ssrLoadModule('/director/src/combat-lab/sandboxBossPrototypes.ts');
const {
  MINI_BOSS_LAB_ENCOUNTER_IDS,
  createMiniBossMemberInstances,
  getMiniBossEncounterByEventId,
  getMiniBossEncounterDefinition,
  sampleMiniBossEncounter
} = await vite.ssrLoadModule('/services/gameplay/mini-bosses/index.ts');
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');

const EXPECTED_MINI_BOSS_IDS = Object.freeze([
  'fracture-engine-elite',
  'aegis-brood-core',
  'railspine-wallcrawler',
  'maw-carrier',
  'twin-meridian-sentinels',
  'prism-bloom',
  'aegis-convoy-captain',
  'gridline-sentries'
]);

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

const createHarness = (prototypeId) => {
  const preview = buildSandboxBossPrototypePreview(campaign, prototypeId);
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: `mini-boss-lab-integration:${prototypeId}`,
    previewBossCollisionEventId: preview.eventId
  });
  engine.init(390, 844);
  assert.equal(
    engine.spawnPreviewEventNow(preview.eventId),
    true,
    `${prototypeId} must spawn through the canonical preview command`
  );
  return { engine, preview };
};

const sourceSection = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
};

const switchCase = (source, commandType) => {
  const marker = `case '${commandType}':`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `GameCanvas is missing ${marker}`);
  const tail = source.slice(start + marker.length);
  const nextCaseOffset = tail.search(/\n\s*case\s+'/);
  return nextCaseOffset < 0
    ? source.slice(start)
    : source.slice(start, start + marker.length + nextCaseOffset);
};

const compactSource = (source) => source.replace(/\s+/g, '');

test('all eight Mini-Boss Lab prototype events resolve and spawn the registered runtime definition', () => {
  assert.deepEqual([...MINI_BOSS_LAB_ENCOUNTER_IDS], EXPECTED_MINI_BOSS_IDS);
  const descriptors = SANDBOX_BOSS_PROTOTYPES.filter((descriptor) => (
    descriptor.encounterClass === 'mini-boss'
  ));
  assert.deepEqual(descriptors.map((descriptor) => descriptor.id), EXPECTED_MINI_BOSS_IDS);

  for (const encounterId of EXPECTED_MINI_BOSS_IDS) {
    const descriptor = descriptors.find((candidate) => candidate.id === encounterId);
    assert.ok(descriptor, `${encounterId} must remain selectable in the Boss Sandbox`);
    assert.equal(descriptor.sandboxOnly, true);
    assert.equal(descriptor.miniBoss?.sandboxReady, true);
    assert.equal(descriptor.miniBoss?.campaignAssigned, true);

    const { engine, preview } = createHarness(encounterId);
    const definition = getMiniBossEncounterByEventId(preview.eventId);
    assert.equal(definition?.id, encounterId, `${preview.eventId} must resolve its registry entry`);

    const snapshot = engine.getPreviewSnapshot().miniBossEncounter;
    assert.ok(snapshot, `${encounterId} must publish a Mini-Boss Lab preview snapshot`);
    assert.equal(snapshot.eventId, preview.eventId);
    assert.equal(snapshot.encounterId, encounterId);
    assert.equal(snapshot.compactHealthBars, true);
    assert.deepEqual(
      snapshot.members.map((member) => member.id),
      createMiniBossMemberInstances(definition).map((member) => member.id)
    );
    assert.ok(snapshot.members.every((member) => member.alive));
  }
});

test('GameCanvas routes every Mini-Boss Lab PreviewCommand to its exact GameEngine method', () => {
  const routingContract = Object.freeze([
    ['set-mini-boss-signature-loop', 'engine.setPreviewMiniBossSignatureLoop(command.eventId,command.enabled)'],
    ['trigger-mini-boss-support', 'engine.triggerPreviewMiniBossSupport(command.eventId)'],
    ['set-mini-boss-low-health', 'engine.setPreviewMiniBossLowHealth(command.eventId)'],
    ['trigger-mini-boss-hit', 'engine.triggerPreviewMiniBossHit(command.eventId)'],
    ['trigger-mini-boss-death', 'engine.triggerPreviewMiniBossDeath(command.eventId)'],
    ['destroy-mini-boss-unit', 'engine.destroyPreviewMiniBossUnit(command.eventId)'],
    ['destroy-mini-boss-guardians', 'engine.destroyPreviewMiniBossGuardians(command.eventId)'],
    ['set-mini-boss-shield', 'engine.setPreviewMiniBossShield(command.eventId,command.enabled)'],
    ['set-mini-boss-wall-side', 'engine.setPreviewMiniBossWallSide(command.eventId,command.side)'],
    ['set-compact-health-bars', 'engine.setPreviewCompactHealthBars(command.enabled)']
  ]);

  for (const [commandType, invocation] of routingContract) {
    assert.equal(
      previewSessionSource.split(`readonly type: '${commandType}'`).length - 1,
      1,
      `${commandType} must appear exactly once in the PreviewCommand union`
    );
    assert.ok(
      compactSource(switchCase(gameCanvasSource, commandType)).includes(invocation),
      `${commandType} must route to ${invocation}`
    );
  }
});

test('guarded damage, staged member death, and compact snapshots execute in one live encounter', () => {
  const { engine, preview } = createHarness('aegis-brood-core');
  engine.update();

  const core = engine.entities.find((entity) => (
    entity.sourceEventId === preview.eventId && entity.miniBossLabRole === 'primary'
  ));
  const guardians = engine.entities.filter((entity) => (
    entity.sourceEventId === preview.eventId && entity.miniBossLabRole === 'guardian'
  ));
  assert.ok(core, 'the live encounter must expose its primary core entity');
  assert.equal(guardians.length, 6);
  assert.equal(core.miniBossLabShielded, true);
  assert.equal(core.miniBossLabDamageable, false);

  const guardedHealth = core.hp;
  engine.damageBossHull(core, 100);
  assert.equal(core.hp, guardedHealth, 'guarded Mini-Boss Lab members must reject hull damage');

  assert.equal(engine.setPreviewCompactHealthBars(false), true);
  assert.equal(engine.getPreviewSnapshot().miniBossEncounter?.compactHealthBars, false);
  assert.equal(engine.destroyPreviewMiniBossGuardians(preview.eventId), true);
  assert.ok(guardians.every((guardian) => guardian.hp === 0));
  assert.ok(guardians.every((guardian) => guardian.miniBossLabDeathStartedFrame >= 0));
  assert.ok(
    guardians.every((guardian) => !guardian.markedForDeletion),
    'member death must begin with a visible staged state instead of immediate deletion'
  );

  for (let frame = 0; frame < 4 && core.miniBossLabShielded; frame += 1) {
    engine.update();
  }
  assert.equal(core.miniBossLabShielded, false);
  assert.equal(core.miniBossLabDamageable, true);
  const exposedHealth = core.hp;
  engine.damageBossHull(core, 100);
  assert.ok(core.hp < exposedHealth, 'the core must take damage after its guardians are gone');

  for (let frame = 0; frame < 44; frame += 1) engine.update();
  assert.ok(
    guardians.every((guardian) => guardian.markedForDeletion),
    'the staged death must eventually retire every destroyed guardian'
  );
});

test('GameEngine retains Campaign and sandbox-owned spawn, cleanup, staged-death, and snapshot boundaries', () => {
  const spawnSection = sourceSection(
    gameLogicSource,
    'spawnMiniBoss(_num: number, configured?: RuntimeBossEvent)',
    'spawnWallBoss(configured?: RuntimeBossEvent)'
  );
  assert.match(spawnSection, /this\.getConfiguredMiniBossLabDefinition\(configured\)/);
  assert.match(spawnSection, /this\.spawnMiniBossLabEncounter\(configured, miniBossLabDefinition\)/);
  assert.match(
    gameLogicSource,
    /getMiniBossEncounterDefinition\(configured\.bossId\)[\s\S]*?getMiniBossEncounterByEventId\(configured\.id\)/
  );

  const damageSection = sourceSection(
    gameLogicSource,
    'damageBossHull(boss: Entity, damage: number)',
    'spawnBoss(configured?: RuntimeBossEvent)'
  );
  const guardedDamageGate = damageSection.indexOf(
    'boss.miniBossLabEncounterId && !boss.miniBossLabDamageable'
  );
  const damageMutation = damageSection.indexOf('boss.hp -= damage');
  assert.ok(guardedDamageGate >= 0 && guardedDamageGate < damageMutation);
  assert.match(damageSection, /miniBossLabDamageable[\s\S]*?pulseDamageFlash\(boss\)[\s\S]*?return;/);

  assert.match(
    gameLogicSource,
    /target\.type === EntityType\.MINI_BOSS && target\.miniBossLabEncounterId[\s\S]*?this\.beginMiniBossLabMemberDeath\(target\);[\s\S]*?return;/
  );
  const deathSection = sourceSection(
    gameLogicSource,
    'private beginMiniBossLabMemberDeath(entity: Entity)',
    'private updateMiniBossLabEncounter('
  );
  assert.match(deathSection, /entity\.hp = 0;/);
  assert.match(deathSection, /entity\.miniBossLabDeathStartedFrame = this\.frameCount;/);
  assert.match(deathSection, /state\.destroyedMemberIds\.add\(memberId\)/);

  const updateSection = sourceSection(
    gameLogicSource,
    'private updateMiniBossLabEncounter(',
    'updateMiniBoss(boss: Entity)'
  );
  assert.match(updateSection, /if \(deathAge >= 42\)/);
  assert.match(updateSection, /this\.spawnMiniBossLabDeathSprite\(definition, entity\)/);
  assert.match(updateSection, /entity\.markedForDeletion = true;/);
  assert.match(updateSection, /sample\.cleanup\.requested[\s\S]*?cleanupMiniBossLabOwnedArtifacts\(state, false\)/);

  const cleanupSection = sourceSection(
    gameLogicSource,
    'private cleanupMiniBossLabOwnedArtifacts(',
    'private spawnMiniBossLabDeathSprite('
  );
  assert.match(cleanupSection, /entity\.sourceEventId !== state\.eventId/);
  assert.match(cleanupSection, /preserveMembers && memberEntityIds\.has\(entity\.id\)/);
  assert.match(cleanupSection, /entity\.markedForDeletion = true/);
  assert.match(cleanupSection, /state\.pendingProjectiles\.length = 0/);
  assert.match(cleanupSection, /this\.pendingEnemyLasers = this\.pendingEnemyLasers\.filter/);

  const snapshotSection = sourceSection(
    gameLogicSource,
    'getPreviewSnapshot(',
    'getEditorSnapshot()'
  );
  assert.match(snapshotSection, /const miniBossEncounter = activeMiniBossState/);
  assert.match(snapshotSection, /compactHealthBars: this\.compactMiniBossHealthBarsVisible/);
  assert.match(snapshotSection, /members: Object\.freeze\(createMiniBossMemberInstances/);
  assert.match(snapshotSection, /healthRatio: clamp\(health \/ maxHealth, 0, 1\)/);
  assert.match(snapshotSection, /miniBossEncounter/);
});

test('Gridline Sentries are exactly two independently owned boundary units', () => {
  const definition = getMiniBossEncounterDefinition('gridline-sentries');
  assert.ok(definition);
  const instances = createMiniBossMemberInstances(definition);
  assert.deepEqual(instances.map((member) => member.role), ['sentry-west', 'sentry-north']);
  assert.equal(definition.budgets.maximumHostileEntities, 2);
  assert.equal(definition.budgets.maximumBeams, 2);

  const actionFrame = Math.round(definition.entranceSeconds * 60)
    + Math.round(definition.signature.telegraphSeconds * 60);
  const live = sampleMiniBossEncounter(definition, {
    frame: actionFrame,
    viewportWidth: 390,
    viewportHeight: 844,
    seed: 'gridline-runtime-integration'
  });
  assert.equal(live.members.length, 2);
  assert.equal(live.hazards.length, 2);
  assert.deepEqual(
    new Set(live.hazards.map((hazard) => hazard.sourceMemberId)),
    new Set(instances.map((member) => member.id))
  );

  for (const destroyed of instances) {
    const survivor = instances.find((member) => member.id !== destroyed.id);
    const afterDestruction = sampleMiniBossEncounter(definition, {
      frame: actionFrame,
      viewportWidth: 390,
      viewportHeight: 844,
      seed: 'gridline-runtime-integration',
      members: [{ id: destroyed.id, health: 0, alive: false }]
    });
    assert.equal(afterDestruction.hazards.length, 1);
    assert.equal(afterDestruction.hazards[0].sourceMemberId, survivor.id);
  }
});

const getLiveMiniBossState = (engine, eventId) => {
  const state = engine.miniBossLabEncounters.get(eventId);
  assert.ok(state, `${eventId} must own one engine encounter state`);
  return state;
};

const forceNextMiniBossSampleFrame = (engine, preview, sampleFrame) => {
  const state = getLiveMiniBossState(engine, preview.eventId);
  state.startFrame = engine.frameCount + 1 - sampleFrame;
  state.supportStartFrame = null;
  state.lastSampleFrame = -1;
  state.emittedHazardIds.clear();
  state.pendingProjectiles.length = 0;
  return state;
};

const signatureActionFrame = (definition, actionAge = 0) => (
  Math.round(definition.entranceSeconds * 60)
  + Math.round(definition.signature.telegraphSeconds * 60)
  + actionAge
);

test('each active encounter ticks once per fixed step and lab poses bypass generic velocity integration', () => {
  const { engine, preview } = createHarness('fracture-engine-elite');
  const state = getLiveMiniBossState(engine, preview.eventId);
  const originalUpdate = engine.updateMiniBossLabEncounter.bind(engine);
  const sampledPositions = new Map();
  let updateCount = 0;
  engine.updateMiniBossLabEncounter = (...args) => {
    updateCount += 1;
    originalUpdate(...args);
    for (const entityId of state.memberEntityIds.values()) {
      const entity = engine.entities.find((candidate) => candidate.id === entityId);
      if (entity) sampledPositions.set(entity.id, { x: entity.x, y: entity.y });
    }
  };

  engine.update();
  assert.equal(updateCount, 1, 'six linked members must still advance one encounter tick');
  assert.equal(state.lastUpdateFrame, engine.frameCount);
  for (const [entityId, sampled] of sampledPositions) {
    const entity = engine.entities.find((candidate) => candidate.id === entityId);
    assert.ok(entity);
    assert.equal(entity.x, sampled.x, `${entityId} must not integrate its authored vx twice`);
    assert.equal(entity.y, sampled.y, `${entityId} must not integrate its authored vy twice`);
  }

  for (const entityId of state.memberEntityIds.values()) {
    const entity = engine.entities.find((candidate) => candidate.id === entityId);
    if (entity) entity.markedForDeletion = true;
  }
  engine.update();
  assert.equal(
    updateCount,
    2,
    'the encounter tick must not depend on finding a live member in the entity iteration'
  );
});

test('staged death remains active through cleanup and cleanup executes exactly once', () => {
  const { engine, preview } = createHarness('fracture-engine-elite');
  const state = getLiveMiniBossState(engine, preview.eventId);
  const originalCleanup = engine.cleanupMiniBossLabOwnedArtifacts.bind(engine);
  let terminalCleanupCount = 0;
  engine.cleanupMiniBossLabOwnedArtifacts = (...args) => {
    if (args[1] === false) terminalCleanupCount += 1;
    return originalCleanup(...args);
  };

  assert.equal(engine.triggerPreviewMiniBossDeath(preview.eventId), true);
  for (let frame = 0; frame < 43; frame += 1) engine.update();
  assert.ok(
    Array.from(state.memberEntityIds.values()).every((entityId) => (
      !engine.entities.some((entity) => entity.id === entityId)
    )),
    'member sprites should retire before terminal encounter cleanup'
  );
  assert.ok(
    engine.getPreviewSnapshot().miniBossEncounter,
    'the encounter snapshot must survive the sprite-retirement gap'
  );

  for (let frame = 0; frame < 12 && !state.completionTriggered; frame += 1) engine.update();
  assert.equal(state.completionTriggered, true);
  assert.equal(state.completionFrame, engine.frameCount);
  assert.equal(terminalCleanupCount, 1);
  assert.equal(engine.getPreviewSnapshot().miniBossEncounter?.stage, 'cleanup');

  engine.update();
  assert.equal(engine.getPreviewSnapshot().miniBossEncounter, null);
  assert.equal(terminalCleanupCount, 1, 'terminal cleanup must never replay on later fixed steps');
  assert.equal(
    engine.miniBossLabEncounters.has(preview.eventId),
    false,
    'completed encounter state must retire after its final cleanup-frame snapshot'
  );
});

test('Fracture core loss retires only its owned satellites and enters the solo fallback', () => {
  const { engine, preview } = createHarness('fracture-engine-elite');
  const definition = getMiniBossEncounterDefinition('fracture-engine-elite');
  assert.ok(definition);
  assert.equal(definition.choreography.kind, 'paired-crossfire');
  forceNextMiniBossSampleFrame(engine, preview, signatureActionFrame(definition));
  engine.update();

  const instances = createMiniBossMemberInstances(definition);
  const cores = instances.filter((instance) => (
    instance.archetypeId === definition.choreography.coreArchetypeId
  ));
  const satellites = instances.filter((instance) => (
    instance.archetypeId === definition.choreography.satelliteArchetypeId
  ));
  const state = getLiveMiniBossState(engine, preview.eventId);
  const coreEntities = cores.map((instance) => engine.entities.find((entity) => (
    entity.id === state.memberEntityIds.get(instance.id)
  )));
  const satelliteEntities = satellites.map((instance) => engine.entities.find((entity) => (
    entity.id === state.memberEntityIds.get(instance.id)
  )));
  assert.ok(coreEntities.every(Boolean));
  assert.ok(satelliteEntities.every(Boolean));
  const fractureBodyUrl = definition.assets.find((asset) => asset.id === 'fracture-core-body')?.url;
  assert.match(fractureBodyUrl ?? '', /mini-boss-lab-v2\/fracture-engine-elite\/fracture-engine-elite-neutral\.png$/);
  assert.equal(
    coreEntities[0].spriteUrl,
    fractureBodyUrl,
    'the engine must publish Fracture’s exact generated body art for collision parity'
  );

  assert.equal(engine.destroyPreviewMiniBossUnit(preview.eventId), true);
  assert.equal(coreEntities[0].miniBossLabDeathStartedFrame >= 0, true);
  for (let index = 0; index < satelliteEntities.length; index += 1) {
    const ownedByDestroyedCore = index % cores.length === 0;
    assert.equal(
      satelliteEntities[index].miniBossLabDeathStartedFrame >= 0,
      ownedByDestroyedCore,
      `${satellites[index].id} ownership must follow its deterministic core slot`
    );
  }
  assert.equal(coreEntities[1].miniBossLabDeathStartedFrame, -1);

  for (let frame = 0; frame < 8 && state.activeStage !== 'survivor'; frame += 1) {
    engine.update();
  }
  assert.equal(state.activeStage, 'survivor');
  assert.ok(definition.choreography.survivorCadenceMultiplier > 1);
  const retiredOwnerIds = new Set([
    coreEntities[0].id,
    ...satelliteEntities
      .filter((_, index) => index % cores.length === 0)
      .map((entity) => entity.id)
  ]);
  assert.ok(
    state.pendingProjectiles.every((projectile) => !retiredOwnerIds.has(projectile.ownerEntityId)),
    'retired Fracture anatomy must stop every queued emission immediately'
  );
  assert.ok(
    engine.entities.every((entity) => (
      !retiredOwnerIds.has(entity.bossOwnerId) || entity.markedForDeletion
    )),
    'retired Fracture anatomy must clean up its already-owned hazards'
  );
});

test('Railspine warning and live beam slots track forced wall geometry continuously', () => {
  const warningHarness = createHarness('railspine-wallcrawler');
  const definition = getMiniBossEncounterDefinition('railspine-wallcrawler');
  assert.ok(definition);
  assert.equal(
    warningHarness.engine.setPreviewMiniBossWallSide(warningHarness.preview.eventId, 'right'),
    true
  );
  forceNextMiniBossSampleFrame(
    warningHarness.engine,
    warningHarness.preview,
    Math.round(definition.entranceSeconds * 60)
  );
  warningHarness.engine.update();
  const warningWall = warningHarness.engine.entities.find((entity) => (
    entity.sourceEventId === warningHarness.preview.eventId
    && entity.miniBossLabRole === 'primary'
  ));
  const warningBrace = warningHarness.engine.entities.find((entity) => (
    entity.sourceEventId === warningHarness.preview.eventId
    && entity.sourceItemId?.includes(':rail-warning-brace:')
  ));
  assert.ok(warningWall);
  assert.ok(warningBrace, 'Railspine must show an emitter-local edge brace while charging');
  assert.equal(warningBrace.isTelegraph, true);
  assert.equal(
    warningHarness.engine.entities.some((entity) => (
      entity.sourceEventId === warningHarness.preview.eventId
      && entity.isBeam
      && entity.isTelegraph
    )),
    false,
    'Railspine warning must never reveal a future full-arena targeting line'
  );
  const warningBraceId = warningBrace.id;
  warningHarness.engine.update();
  const refreshedBrace = warningHarness.engine.entities.find((entity) => entity.id === warningBraceId);
  assert.ok(refreshedBrace);
  assert.ok(
    Math.abs(
      (refreshedBrace.x + refreshedBrace.width / 2)
      - (warningWall.x + warningWall.width / 2)
    ) < 0.001,
    'the local warning brace must follow the live wall emitter'
  );

  const { engine, preview } = createHarness('railspine-wallcrawler');
  assert.equal(engine.setPreviewMiniBossWallSide(preview.eventId, 'right'), true);
  forceNextMiniBossSampleFrame(engine, preview, signatureActionFrame(definition));
  engine.update();
  const wall = engine.entities.find((entity) => (
    entity.sourceEventId === preview.eventId && entity.miniBossLabRole === 'primary'
  ));
  assert.ok(wall);
  assert.ok(wall.x + wall.width / 2 > 390 / 2);
  let liveBeams = engine.entities.filter((entity) => (
    entity.sourceEventId === preview.eventId && entity.isBeam && !entity.isTelegraph && !entity.markedForDeletion
  ));
  assert.equal(liveBeams.length, 1);
  const beamId = liveBeams[0].id;
  const rightWallAngle = liveBeams[0].beamAngleRadians;
  const observedAngles = [rightWallAngle];
  for (let frame = 0; frame < 6; frame += 1) {
    engine.update();
    liveBeams = engine.entities.filter((entity) => (
      entity.sourceEventId === preview.eventId && entity.isBeam && !entity.isTelegraph && !entity.markedForDeletion
    ));
    assert.equal(liveBeams.length, 1, `Railspine beam slot must exist on live frame ${frame + 1}`);
    assert.equal(liveBeams[0].id, beamId, 'the live beam must update in place, not respawn per sample');
    observedAngles.push(liveBeams[0].beamAngleRadians);
  }
  assert.ok(new Set(observedAngles.map((angle) => angle.toFixed(5))).size > 1);

  assert.equal(engine.setPreviewMiniBossWallSide(preview.eventId, 'left'), true);
  engine.update();
  const mirroredBeam = engine.entities.find((entity) => entity.id === beamId);
  assert.ok(mirroredBeam);
  assert.ok(wall.x + wall.width / 2 < 390 / 2);
  assert.ok(
    rightWallAngle * mirroredBeam.beamAngleRadians < 0,
    'forcing the opposite wall must mirror both pose and damaging beam direction'
  );
});

test('Gridline owns two uninterrupted independently refreshed boundary slots', () => {
  const { engine, preview } = createHarness('gridline-sentries');
  const definition = getMiniBossEncounterDefinition('gridline-sentries');
  assert.ok(definition);
  forceNextMiniBossSampleFrame(engine, preview, signatureActionFrame(definition));
  engine.update();
  const beamIds = engine.entities
    .filter((entity) => (
      entity.sourceEventId === preview.eventId && entity.isBeam && !entity.isTelegraph && !entity.markedForDeletion
    ))
    .map((entity) => entity.id)
    .sort();
  assert.equal(beamIds.length, 2);
  for (let frame = 0; frame < 10; frame += 1) {
    engine.update();
    const currentIds = engine.entities
      .filter((entity) => (
        entity.sourceEventId === preview.eventId && entity.isBeam && !entity.isTelegraph && !entity.markedForDeletion
      ))
      .map((entity) => entity.id)
      .sort();
    assert.deepEqual(currentIds, beamIds, `both Gridline boundary slots must survive frame ${frame + 1}`);
  }
});

test('preview max-health rebudgeting scales every intended lab member deterministically', () => {
  const { engine, preview } = createHarness('aegis-brood-core');
  const members = engine.entities.filter((entity) => entity.sourceEventId === preview.eventId);
  const core = members.find((entity) => entity.miniBossLabRole === 'primary');
  assert.ok(core);
  const originalMaxById = new Map(members.map((entity) => [entity.id, entity.maxHp]));
  const originalRatioById = new Map(members.map((entity) => [entity.id, entity.hp / entity.maxHp]));
  const requestedCoreMaximum = 2400;
  const scale = requestedCoreMaximum / core.maxHp;

  assert.equal(engine.setPreviewBossMaxHealth(requestedCoreMaximum, preview.eventId), true);
  for (const member of members) {
    assert.equal(
      member.maxHp,
      member === core
        ? requestedCoreMaximum
        : Math.max(1, Math.round(originalMaxById.get(member.id) * scale))
    );
    assert.equal(member.hp / member.maxHp, originalRatioById.get(member.id));
  }
  const firstBudget = members.map((member) => [member.id, member.hp, member.maxHp]);
  assert.equal(engine.setPreviewBossMaxHealth(requestedCoreMaximum, preview.eventId), true);
  assert.deepEqual(
    members.map((member) => [member.id, member.hp, member.maxHp]),
    firstBudget,
    'reapplying the same requested budget must not compound linked-member scaling'
  );
});

test('snapshots expose shield, damage, visual, and staged-death state for every member', () => {
  const { engine, preview } = createHarness('aegis-brood-core');
  engine.update();
  let snapshot = engine.getPreviewSnapshot().miniBossEncounter;
  assert.ok(snapshot);
  const core = snapshot.members.find((member) => member.role === 'primary');
  assert.ok(core);
  assert.equal(core.shielded, true);
  assert.equal(core.damageable, false);
  assert.equal(core.deathState, 'alive');
  assert.equal(typeof core.visualState, 'string');
  assert.equal(core.deathStartedFrame, null);

  assert.equal(engine.destroyPreviewMiniBossGuardians(preview.eventId), true);
  snapshot = engine.getPreviewSnapshot().miniBossEncounter;
  assert.ok(snapshot);
  const guardian = snapshot.members.find((member) => member.role === 'guardian');
  assert.ok(guardian);
  assert.equal(guardian.alive, false);
  assert.equal(guardian.damageable, false);
  assert.equal(guardian.visualState, 'death');
  assert.equal(guardian.deathState, 'staged');
  assert.equal(typeof guardian.deathStartedFrame, 'number');
});

test('Maw reinforcements deploy and activate before targeting or contact damage', () => {
  const { engine, preview } = createHarness('maw-carrier');
  const definition = getMiniBossEncounterDefinition('maw-carrier');
  assert.ok(definition);
  forceNextMiniBossSampleFrame(engine, preview, signatureActionFrame(definition));
  engine.update();
  const reinforcement = engine.entities.find((entity) => (
    entity.sourceEventId === preview.eventId
    && entity.sourceItemId === 'maw-carrier:reinforcement'
  ));
  assert.ok(reinforcement, 'Maw signature must deploy an owned reinforcement');
  assert.equal(reinforcement.miniBossLabReinforcementStage, 'deploy');
  assert.equal(reinforcement.contactDamage, 0);
  assert.equal(engine.isEnemyTarget(reinforcement), false);

  for (let frame = 0; frame < 18; frame += 1) engine.update();
  assert.equal(reinforcement.miniBossLabReinforcementStage, 'activation');
  assert.equal(reinforcement.contactDamage, 0);
  assert.equal(engine.isEnemyTarget(reinforcement), false);

  for (let frame = 0; frame < 12; frame += 1) engine.update();
  assert.equal(reinforcement.miniBossLabReinforcementStage, 'active');
  assert.ok(reinforcement.contactDamage > 0);
  assert.equal(engine.isEnemyTarget(reinforcement), true);
});
