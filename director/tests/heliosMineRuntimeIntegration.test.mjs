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
