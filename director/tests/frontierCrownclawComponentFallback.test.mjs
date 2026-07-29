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

const preview = buildSandboxBossPrototypePreview(campaign, 'frontier-crownclaw');
const artwork = createSandboxOnlyBossArtwork(preview);
const bossEvent = preview.previewWave.events.find((event) => (
  event.id === preview.eventId
));
assert.ok(bossEvent?.timeline);
assert.ok(artwork.modularRig);

const poseSampler = createModularBossWeaponSocketPoseSampler(
  artwork.modularRig,
  artwork.sampleModularPose
);
const phaseOneId = bossEvent.phases[0].id;
const phaseTwoId = bossEvent.phases[1].id;
const phaseOneHarpoon = bossEvent.timeline.attacks
  .find((attack) => attack.id === 'chainclaw-harpoon')
  ?.variants.find((variant) => variant.phaseId === phaseOneId);
assert.equal(phaseOneHarpoon?.beatClipIds.length, 2);
const oddSequenceHarpoonClipId = phaseOneHarpoon.beatClipIds[1];

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

const createEngine = (seed) => new GameEngine(createStats(), {
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

const spawnFrontier = (seed) => {
  const engine = createEngine(seed);
  engine.init(390, 844);
  assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
  const boss = engine.bossRef;
  assert.ok(boss);
  return { engine, boss };
};

const component = (boss, id) => {
  const found = boss.bossComponents?.find((candidate) => candidate.id === id);
  assert.ok(found, `${id} must exist on the Frontier rig`);
  return found;
};

const disableWithoutCombatEffects = (boss, id) => {
  const target = component(boss, id);
  target.hp = 0;
  target.destroyed = true;
  target.exposed = false;
};

const ownedFrontierArtifacts = (engine, boss) => engine.entities.filter((entity) => (
  entity.bossOwnerId === boss.id
  && entity.frontierCrownclawArtifactKind
));

const updateUntil = (engine, predicate, maximumFrames = 360) => {
  for (let frame = 0; frame < maximumFrames; frame += 1) {
    engine.update();
    if (predicate()) return frame + 1;
  }
  return -1;
};

test('one destroyed claw redirects both core harpoon and Cross-Link to the surviving side', () => {
  for (const request of [
    { attackId: 'chainclaw-harpoon', phaseId: phaseOneId, seed: 'frontier-one-claw-core' },
    { attackId: 'crown-cross-link', phaseId: phaseTwoId, seed: 'frontier-one-claw-signature' }
  ]) {
    const { engine, boss } = spawnFrontier(request.seed);
    disableWithoutCombatEffects(boss, 'left-cannon');
    assert.equal(
      engine.triggerAuthoredBossAttack(request.attackId, preview.eventId, request.phaseId),
      true
    );

    let sawStarboardGuide = false;
    let sawStarboardClaw = false;
    let sawStarboardLink = false;
    let sawPortArtifact = false;
    const elapsed = updateUntil(engine, () => {
      for (const artifact of ownedFrontierArtifacts(engine, boss)) {
        if (artifact.markedForDeletion) continue;
        sawPortArtifact ||= artifact.frontierCrownclawSide === 'port';
        if (artifact.frontierCrownclawSide !== 'starboard') continue;
        sawStarboardGuide ||= artifact.frontierCrownclawArtifactKind === 'harpoon-guide';
        sawStarboardClaw ||= artifact.frontierCrownclawArtifactKind === 'harpoon-claw';
        sawStarboardLink ||= artifact.frontierCrownclawArtifactKind === 'harpoon-link';
      }
      return sawStarboardGuide && sawStarboardClaw && sawStarboardLink;
    });

    assert.ok(elapsed > 0, `${request.attackId} must reach its surviving-side fire geometry`);
    assert.equal(sawPortArtifact, false, 'the destroyed port claw must never warn or fire');
    assert.deepEqual([...boss.bossFrontierCrownclawState.sides], ['starboard']);
    assert.equal(boss.bossFrontierCrownclawState.kind, 'harpoon');
    assert.equal(
      boss.bossFrontierCrownclawState.signature,
      request.attackId === 'crown-cross-link'
    );
  }
});

test('two destroyed claws deterministically substitute reactor then barrage without chain geometry', () => {
  const cases = [
    {
      attackId: 'chainclaw-harpoon',
      phaseId: phaseOneId,
      expectedKind: 'reactor-beam',
      expectedPrimitiveId: 'crown-reactor-beam',
      expectedEvidence: 'reactor-beam',
      expectedBeamCount: 1
    },
    {
      attackId: 'chainclaw-harpoon',
      phaseId: phaseTwoId,
      expectedKind: 'reactor-beam',
      expectedPrimitiveId: 'crown-reactor-beam',
      expectedEvidence: 'reactor-beam',
      expectedBeamCount: 2
    },
    {
      attackId: oddSequenceHarpoonClipId,
      phaseId: phaseOneId,
      expectedKind: 'crabwalk',
      expectedPrimitiveId: 'bastion-crabwalk-barrage',
      expectedEvidence: 'boss-frontier-crown-bolt'
    }
  ];

  for (const [index, request] of cases.entries()) {
    const { engine, boss } = spawnFrontier(`frontier-no-claws-${index}`);
    disableWithoutCombatEffects(boss, 'left-cannon');
    disableWithoutCombatEffects(boss, 'right-cannon');
    assert.equal(
      engine.triggerAuthoredBossAttack(request.attackId, preview.eventId, request.phaseId),
      true
    );

    let sawExpectedPrimitive = false;
    let sawExpectedEvidence = false;
    let sawChainGeometry = false;
    let maximumDamagingBeamCount = 0;
    const elapsed = updateUntil(engine, () => {
      sawExpectedPrimitive ||= engine.getPreviewSnapshot().boss?.activePrimitiveId
        === request.expectedPrimitiveId;
      for (const entity of engine.entities) {
        if (entity.markedForDeletion || entity.bossOwnerId !== boss.id) continue;
        sawChainGeometry ||= entity.frontierCrownclawArtifactKind === 'harpoon-guide'
          || entity.frontierCrownclawArtifactKind === 'harpoon-claw'
          || entity.frontierCrownclawArtifactKind === 'harpoon-link';
        sawExpectedEvidence ||= request.expectedEvidence === 'reactor-beam'
          ? entity.frontierCrownclawArtifactKind === 'reactor-beam'
            && entity.frontierCrownclawDamageActive === true
          : entity.projectileVisualKind === request.expectedEvidence;
      }
      maximumDamagingBeamCount = Math.max(
        maximumDamagingBeamCount,
        engine.entities.filter((entity) => (
          !entity.markedForDeletion
          && entity.bossOwnerId === boss.id
          && entity.frontierCrownclawArtifactKind === 'reactor-beam'
          && entity.frontierCrownclawDamageActive
        )).length
      );
      return sawExpectedPrimitive && sawExpectedEvidence;
    });

    assert.ok(elapsed > 0, `${request.expectedKind} fallback must execute`);
    assert.equal(sawChainGeometry, false, 'no hidden claw geometry may survive substitution');
    assert.equal(boss.bossFrontierCrownclawState.kind, request.expectedKind);
    assert.deepEqual([...boss.bossFrontierCrownclawState.sides], []);
    if (request.expectedBeamCount !== undefined) {
      assert.equal(maximumDamagingBeamCount, request.expectedBeamCount);
    }
  }
});

test('destroying one claw during Cross-Link clears its collision immediately and preserves the survivor', () => {
  const { engine, boss } = spawnFrontier('frontier-mid-action-claw-loss');
  assert.equal(
    engine.triggerAuthoredBossAttack('crown-cross-link', preview.eventId, phaseTwoId),
    true
  );

  const reachedDualFire = updateUntil(engine, () => {
    const active = ownedFrontierArtifacts(engine, boss).filter((artifact) => (
      !artifact.markedForDeletion
      && (
        artifact.frontierCrownclawArtifactKind === 'harpoon-claw'
        || artifact.frontierCrownclawArtifactKind === 'harpoon-link'
      )
    ));
    return active.some((artifact) => artifact.frontierCrownclawSide === 'port')
      && active.some((artifact) => artifact.frontierCrownclawSide === 'starboard');
  });
  assert.ok(reachedDualFire > 0, 'Cross-Link must launch both claws before the damage test');

  const portArtifacts = ownedFrontierArtifacts(engine, boss).filter((artifact) => (
    artifact.frontierCrownclawSide === 'port'
    && !artifact.markedForDeletion
  ));
  assert.ok(portArtifacts.length > 0);
  const leftClaw = component(boss, 'left-cannon');
  engine.damageBossComponent(boss, leftClaw, leftClaw.hp + 1);

  assert.equal(leftClaw.destroyed, true);
  portArtifacts.forEach((artifact) => {
    assert.equal(artifact.markedForDeletion, true);
    assert.equal(artifact.frontierCrownclawDamageActive, false);
    assert.equal(artifact.damage, 0);
    assert.equal(artifact.life, 0);
  });
  assert.deepEqual([...boss.bossFrontierCrownclawState.sides], ['starboard']);
  assert.ok(ownedFrontierArtifacts(engine, boss).some((artifact) => (
    !artifact.markedForDeletion
    && artifact.frontierCrownclawSide === 'starboard'
    && artifact.frontierCrownclawArtifactKind === 'harpoon-claw'
  )));

  for (let frame = 0; frame < 4; frame += 1) engine.update();
  assert.equal(ownedFrontierArtifacts(engine, boss).some((artifact) => (
    !artifact.markedForDeletion && artifact.frontierCrownclawSide === 'port'
  )), false, 'the destroyed side must never be updated or recreated');
  assert.ok(ownedFrontierArtifacts(engine, boss).some((artifact) => (
    !artifact.markedForDeletion && artifact.frontierCrownclawSide === 'starboard'
  )), 'the surviving claw must continue its locked Cross-Link sentence');
});
