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

const createEngine = (previewInvincible) => new GameEngine(createStats(), {
  campaign: preview.campaign,
  previewMode: true,
  previewInvincible,
  audioEnabled: false,
  initialLevelId: preview.levelId,
  initialWaveId: preview.waveId,
  randomSeed: 'helios-continuous-crush-regression',
  previewBossCollisionEventId: preview.eventId,
  previewBossCollisionMask: artwork.collisionMask,
  previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
  previewBossWeaponSockets: artwork.weaponSockets,
  previewBossWeaponSocketPoseSampler: poseSampler,
  previewBossReducedMotion: false,
  previewBossWeaponSocketEventId: preview.eventId,
  previewBossProjectileVisualKinds: Object.keys(artwork.projectileAnimations ?? {})
});

const settleAndStartCrush = (engine) => {
  engine.init(390, 844);
  assert.equal(engine.triggerAuthoredBossAttack('clawcarrier-crush', preview.eventId), true);
  const boss = engine.bossRef;
  assert.ok(boss);
  const combatAnchorY = Math.max(72, Math.min(844 * 0.13, 116));
  for (let frame = 0; boss.y < combatAnchorY && frame < 300; frame += 1) {
    engine.update();
  }
  assert.ok(boss.y >= combatAnchorY);
  assert.equal(
    engine.triggerAuthoredBossAttack(
      'clawcarrier-crush',
      preview.eventId,
      boss.activeBossPhaseId
    ),
    true
  );
  return boss;
};

test('Helios Attack 4 runs one uninterrupted rise, lock, dive, and return sentence', () => {
  const engine = createEngine(true);
  const boss = settleAndStartCrush(engine);
  // Motion continuity is measured without collision hit-stop; contact and
  // protected/unprotected damage are exercised separately below.
  engine.checkCollisions = () => {};
  const fireFramesByExecution = new Map();
  const fireStarts = new Map();
  const lastPositionByExecution = new Map();
  const firstPositionByExecution = new Map();
  const positionsByExecution = new Map();
  const continuationWarnings = [];

  for (let frame = 0; frame < 420; frame += 1) {
    engine.update();
    const action = boss.bossActionPresentation;
    if (action?.primitiveId !== 'tracking-pincer-dive') continue;
    if (action.stage === 'warning' && action.executionIndex > 0) {
      continuationWarnings.push({ frame, executionIndex: action.executionIndex });
    }
    if (action.stage !== 'fire') continue;
    fireFramesByExecution.set(
      action.executionIndex,
      (fireFramesByExecution.get(action.executionIndex) ?? 0) + 1
    );
    fireStarts.set(
      action.executionIndex,
      Math.min(fireStarts.get(action.executionIndex) ?? Infinity, action.startFrame)
    );
    const position = { x: boss.x, y: boss.y };
    const positions = positionsByExecution.get(action.executionIndex) ?? [];
    positions.push(position);
    positionsByExecution.set(action.executionIndex, positions);
    firstPositionByExecution.set(
      action.executionIndex,
      firstPositionByExecution.get(action.executionIndex) ?? position
    );
    lastPositionByExecution.set(action.executionIndex, position);
  }

  assert.deepEqual([...fireFramesByExecution.keys()], [0, 1, 2, 3]);
  assert.deepEqual([...fireFramesByExecution.values()], [39, 39, 39, 39]);
  assert.deepEqual(
    [...fireStarts.values()].map((start, index, values) => (
      index === 0 ? 0 : start - values[index - 1]
    )),
    [0, 39, 39, 39],
    'each motion stage must begin on the exact frame the prior stage ends'
  );
  assert.deepEqual(continuationWarnings, []);
  const lockPositions = positionsByExecution.get(1) ?? [];
  const lockTail = lockPositions.slice(-8);
  const lockTailTravel = lockTail.slice(1).reduce((distance, position, index) => (
    distance + Math.hypot(
      position.x - lockTail[index].x,
      position.y - lockTail[index].y
    )
  ), 0);
  assert.ok(
    lockTailTravel > 4,
    'the final lock frames must keep flowing into the dive instead of pausing in place'
  );
  const diveEnd = lastPositionByExecution.get(2);
  const returnStart = firstPositionByExecution.get(3);
  assert.ok(diveEnd && returnStart);
  assert.ok(
    Math.hypot(diveEnd.x - returnStart.x, diveEnd.y - returnStart.y) < 12,
    'the return must continue from the completed dive instead of snapping into a second drop'
  );
});

test('Helios Attack 4 contact reacts safely when protected and removes a life when unprotected', () => {
  const safeEngine = createEngine(true);
  settleAndStartCrush(safeEngine);
  for (let frame = 0; frame < 420 && safeEngine.lastPlayerRamFrame < 0; frame += 1) {
    safeEngine.update();
  }
  assert.ok(safeEngine.lastPlayerRamFrame >= 0);
  assert.equal(safeEngine.lives, 3, 'Watch safely must preserve lives while retaining hit feedback');

  const engine = createEngine(false);
  settleAndStartCrush(engine);
  for (let frame = 0; frame < 420 && engine.lives === 3; frame += 1) {
    engine.update();
  }
  assert.ok(engine.lastPlayerRamFrame >= 0);
  assert.equal(engine.lives, 2);
});
