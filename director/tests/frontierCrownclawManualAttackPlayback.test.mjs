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
assert.equal(preview.eventId, 'sandbox-frontier-crownclaw');
assert.ok(artwork.modularRig, 'Frontier must use its registered modular rig');

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

const createEngine = () => new GameEngine(createStats(), {
  campaign: preview.campaign,
  previewMode: true,
  previewInvincible: true,
  audioEnabled: false,
  initialLevelId: preview.levelId,
  initialWaveId: preview.waveId,
  randomSeed: 'frontier-manual-reactor-entry-regression',
  previewBossCollisionEventId: preview.eventId,
  previewBossCollisionMask: artwork.collisionMask,
  previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
  previewBossWeaponSockets: artwork.weaponSockets,
  previewBossWeaponSocketPoseSampler: poseSampler,
  previewBossReducedMotion: false,
  previewBossWeaponSocketEventId: preview.eventId,
  previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
});

test('manual Crown Reactor Beam starts during entry without falling back to Attack 1', () => {
  const engine = createEngine();
  const width = 390;
  const height = 844;
  const combatAnchorY = Math.max(72, Math.min(height * 0.13, 116));
  engine.init(width, height);
  assert.equal(
    engine.spawnPreviewEventNow(preview.eventId),
    true,
    'the focused preview must spawn the authored Frontier event on demand'
  );

  const boss = engine.bossRef;
  assert.ok(boss, 'the canonical mobile preview must spawn Frontier Crownclaw');

  // Recreate the exact UI race: the user presses Attack 2 before the entrance
  // has reached its combat anchor.
  boss.y = combatAnchorY - 48;
  boss.vy = Math.max(1, boss.configuredSpeed || 1);
  assert.ok(boss.y < combatAnchorY);

  assert.equal(
    engine.triggerAuthoredBossAttack('crown-reactor-beam', preview.eventId),
    true
  );
  assert.equal(boss.y, combatAnchorY, 'manual playback must settle the entering boss');

  const observedAttackIds = new Set();
  const observedPrimitiveIds = new Set();
  const observedStages = new Set();
  let sawReactorGuide = false;
  let sawReactorBeam = false;
  let sawDamagingReactorBeam = false;

  for (let frame = 0; frame < 360 && !sawDamagingReactorBeam; frame += 1) {
    engine.update();
    const snapshot = engine.getPreviewSnapshot();
    const activeAttack = snapshot.boss?.activeAttack;
    if (activeAttack) {
      observedAttackIds.add(activeAttack.id);
      observedStages.add(activeAttack.stage);
    }
    if (snapshot.boss?.activePrimitiveId) {
      observedPrimitiveIds.add(snapshot.boss.activePrimitiveId);
    }

    for (const entity of engine.entities) {
      if (entity.markedForDeletion || entity.bossOwnerId !== boss.id) continue;
      if (entity.frontierCrownclawArtifactKind === 'reactor-guide') {
        sawReactorGuide = true;
      }
      if (entity.frontierCrownclawArtifactKind === 'reactor-beam') {
        sawReactorBeam = true;
        assert.equal(entity.projectileVisualKind, 'boss-frontier-reactor-beam');
        sawDamagingReactorBeam ||= entity.frontierCrownclawDamageActive === true;
      }
    }
  }

  assert.deepEqual([...observedAttackIds], ['crown-reactor-beam']);
  assert.ok(observedStages.has('warning'), 'Attack 2 must retain its linked warning');
  assert.ok(observedStages.has('fire'), 'Attack 2 must advance into its fire window');
  assert.deepEqual([...observedPrimitiveIds], ['crown-reactor-beam']);
  assert.equal(sawReactorGuide, true, 'the crown warning must own reactor guide geometry');
  assert.equal(sawReactorBeam, true, 'the crown must create its owned reactor beam');
  assert.equal(sawDamagingReactorBeam, true, 'the owned beam must reach its damage window');
  assert.equal(
    engine.entities.some((entity) => (
      entity.bossOwnerId === boss.id
      && (
        entity.frontierCrownclawArtifactKind === 'harpoon-guide'
        || entity.frontierCrownclawArtifactKind === 'harpoon-claw'
        || entity.frontierCrownclawArtifactKind === 'harpoon-link'
      )
    )),
    false,
    'manual Attack 2 playback must never fall back to Chainclaw Harpoon'
  );
});

test('Chainclaw throws the full-size open claw toward the warning-locked ship and its visible chain hits', () => {
  const engine = createEngine();
  engine.init(390, 844);
  assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
  const boss = engine.bossRef;
  assert.ok(boss);

  engine.player.x = 286;
  engine.player.y = 700;
  const lockedPlayer = {
    x: engine.player.x + engine.player.width / 2,
    y: engine.player.y + engine.player.height / 2
  };
  assert.equal(
    engine.triggerAuthoredBossAttack('chainclaw-harpoon', preview.eventId),
    true
  );

  let guide;
  for (let frame = 0; frame < 180 && !guide; frame += 1) {
    engine.update();
    guide = engine.entities.find((entity) => (
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.frontierCrownclawArtifactKind === 'harpoon-guide'
    ));
  }
  assert.ok(guide, 'the warning must expose its exact locked throw path');
  assert.ok(
    Math.abs(guide.beamTargetY - lockedPlayer.y) < 1,
    'the chain arm must target the ship depth captured during warning'
  );

  const lockedTarget = {
    x: guide.beamTargetX,
    y: guide.beamTargetY
  };
  engine.player.x = 16;
  engine.player.y = 300;

  let activeClaw;
  let activeLink;
  let deepestClawY = 0;
  for (let frame = 0; frame < 300; frame += 1) {
    engine.update();
    const claw = engine.entities.find((entity) => (
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.frontierCrownclawArtifactKind === 'harpoon-claw'
    ));
    if (claw) {
      deepestClawY = Math.max(deepestClawY, claw.y + claw.height / 2);
      activeClaw ||= claw;
    }
    const link = engine.entities.find((entity) => (
      !entity.markedForDeletion
      && entity.bossOwnerId === boss.id
      && entity.frontierCrownclawArtifactKind === 'harpoon-link'
      && entity.frontierCrownclawDamageActive
    ));
    if (link) {
      activeLink = link;
      break;
    }
  }

  assert.ok(activeClaw, 'the warning must advance into a launched claw');
  assert.equal(activeClaw.projectileVisualKind, 'boss-frontier-chainclaw');
  assert.equal(activeClaw.width, 108);
  assert.equal(activeClaw.height, 70);
  assert.ok(
    Math.abs(deepestClawY - lockedTarget.y) < 8,
    'moving after warning must not pull the claw away from its locked lower target'
  );
  assert.ok(activeLink, 'ordinary Chainclaw Harpoon must expose a damaging visible tether');
  assert.equal(activeLink.projectileVisualKind, 'boss-frontier-chain-link');
  assert.equal(activeLink.width, 52);
  assert.equal(activeLink.height, 13);
  assert.ok(Number.isFinite(activeLink.beamAngleRadians));

  const livesBefore = engine.stats.lives;
  const feedbackBefore = engine.lastPreviewPlayerHitFeedbackFrame;
  engine.player.x = activeLink.x + activeLink.width / 2 - engine.player.width / 2;
  engine.player.y = activeLink.y + activeLink.height / 2 - engine.player.height / 2;
  engine.update();
  assert.equal(engine.stats.lives, livesBefore, 'safe preview must suppress only damage');
  assert.ok(
    engine.lastPreviewPlayerHitFeedbackFrame > feedbackBefore,
    'touching the visible chain must still trigger normal hit feedback'
  );
});
