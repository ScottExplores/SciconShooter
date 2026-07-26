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
const { GameEngine } = await vite.ssrLoadModule('/services/gameLogic.ts');

const preview = buildSandboxBossPrototypePreview(campaign, 'helios-clawcarrier');

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

const createEngine = (previewMode) => new GameEngine(createStats(), {
  campaign: preview.campaign,
  previewMode,
  previewInvincible: true,
  audioEnabled: false,
  initialLevelId: preview.levelId,
  initialWaveId: preview.waveId,
  randomSeed: previewMode
    ? 'boss-health-invincibility-preview'
    : 'boss-health-invincibility-production',
  previewBossCollisionEventId: preview.eventId
});

const spawnHelios = (engine) => {
  assert.equal(engine.spawnPreviewEventNow(preview.eventId), true);
  const boss = engine.bossRef;
  assert.ok(boss, 'the canonical preview must spawn Helios');
  assert.equal(boss.bossRigId, 'crown-claw');
  assert.ok((boss.bossComponents?.length ?? 0) >= 2);
  return boss;
};

const requireBossSnapshot = (engine) => {
  const boss = engine.getPreviewSnapshot().boss;
  assert.ok(boss, 'the preview snapshot must publish the active boss');
  return boss;
};

test('preview hull and component invincibility freeze real damage until switched off', () => {
  const engine = createEngine(true);
  engine.init(390, 844);
  const boss = spawnHelios(engine);
  const component = boss.bossComponents.find((candidate) => candidate.id === 'left-cannon');
  assert.ok(component, 'Helios must expose the left claw as a damageable component');

  let snapshot = requireBossSnapshot(engine);
  assert.equal(snapshot.invincible, false);
  assert.equal(snapshot.components.find((candidate) => candidate.id === component.id)?.invincible, false);

  const componentHealthBeforeLock = component.hp;
  assert.equal(
    engine.setPreviewBossComponentInvincibility(component.id, true, preview.eventId),
    true
  );
  snapshot = requireBossSnapshot(engine);
  assert.equal(
    snapshot.components.find((candidate) => candidate.id === component.id)?.invincible,
    true
  );
  engine.damageBossComponent(boss, component, 1);
  assert.equal(component.hp, componentHealthBeforeLock, 'locked component HP must not change');

  assert.equal(
    engine.setPreviewBossComponentInvincibility(component.id, false, preview.eventId),
    true
  );
  snapshot = requireBossSnapshot(engine);
  assert.equal(
    snapshot.components.find((candidate) => candidate.id === component.id)?.invincible,
    false
  );
  engine.damageBossComponent(boss, component, 1);
  assert.ok(component.hp < componentHealthBeforeLock, 'component damage must resume immediately');
  assert.equal(
    requireBossSnapshot(engine).components.find((candidate) => candidate.id === component.id)?.health,
    component.hp
  );

  const hullHealthBeforeLock = boss.hp;
  assert.equal(engine.setPreviewBossHullInvincibility(true, preview.eventId), true);
  assert.equal(requireBossSnapshot(engine).invincible, true);
  engine.damageBossHull(boss, 1);
  assert.equal(boss.hp, hullHealthBeforeLock, 'locked hull HP must not change');

  assert.equal(engine.setPreviewBossHullInvincibility(false, preview.eventId), true);
  assert.equal(requireBossSnapshot(engine).invincible, false);
  engine.damageBossHull(boss, 1);
  assert.ok(boss.hp < hullHealthBeforeLock, 'hull damage must resume immediately');
  assert.equal(requireBossSnapshot(engine).health, boss.hp);
});

test('restart clears fight-local health locks for the replacement boss', () => {
  const engine = createEngine(true);
  engine.init(390, 844);
  const originalBoss = spawnHelios(engine);
  const originalComponent = originalBoss.bossComponents.find(
    (candidate) => candidate.id === 'right-cannon'
  );
  assert.ok(originalComponent);

  assert.equal(engine.setPreviewBossHullInvincibility(true, preview.eventId), true);
  assert.equal(
    engine.setPreviewBossComponentInvincibility(originalComponent.id, true, preview.eventId),
    true
  );
  assert.equal(requireBossSnapshot(engine).invincible, true);

  engine.restartPreview();
  const replacementBoss = spawnHelios(engine);
  assert.notEqual(replacementBoss, originalBoss, 'restart must construct a fresh boss runtime');
  const snapshot = requireBossSnapshot(engine);
  assert.equal(snapshot.invincible, false);
  assert.ok(snapshot.components.length > 0);
  assert.ok(
    snapshot.components.every((component) => component.invincible === false),
    'all replacement components must start damageable'
  );
});

test('production engines reject preview-only boss health locks even with a live target', () => {
  const engine = createEngine(false);
  engine.init(390, 844);
  engine.setTestMode(true);
  assert.equal(engine.loadPreviewWave(preview.levelId, preview.waveId), true);
  const boss = spawnHelios(engine);
  const component = boss.bossComponents[0];
  assert.ok(component);

  assert.equal(engine.setPreviewBossHullInvincibility(true, preview.eventId), false);
  assert.equal(
    engine.setPreviewBossComponentInvincibility(component.id, true, preview.eventId),
    false
  );
  const snapshot = requireBossSnapshot(engine);
  assert.equal(snapshot.invincible, false);
  assert.ok(snapshot.components.every((candidate) => candidate.invincible === false));
});
