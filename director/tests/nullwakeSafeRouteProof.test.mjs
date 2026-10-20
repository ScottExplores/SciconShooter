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
const expectedEvidence = JSON.parse(await readFile(
  path.join(testDirectory, 'fixtures', 'nullwake-safe-route-evidence.json'),
  'utf8'
));

// GameEngine's browser asset cache is inert in this simulation-only test.
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
const { createModularBossWeaponSocketPoseSampler } = await vite.ssrLoadModule(
  '/services/pixi/boss-rigs/ModularBossWeaponSocketRuntime.ts'
);
const {
  BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS,
  proveBossAttackSafeRoute
} = await vite.ssrLoadModule('/services/gameplay/bosses/BossSafeRouteProof.ts');

const preview = buildSandboxBossPrototypePreview(campaign, 'nullwake-revenant');
assert.equal(preview.sandboxPrototype.prototypeId, 'nullwake-revenant');
assert.equal(preview.sandboxPrototype.source, 'sandbox-prototype');
const artwork = createSandboxOnlyBossArtwork(preview);
const bossEvent = preview.previewWave.events.find((event) => event.kind === 'boss');
assert.ok(bossEvent?.timeline);
assert.ok(artwork.modularRig);
assert.equal(typeof artwork.sampleModularPose, 'function');

const poseSampler = createModularBossWeaponSocketPoseSampler(
  artwork.modularRig,
  artwork.sampleModularPose
);
const attackIds = [
  'claw-corridor',
  'dead-signal-gates',
  'memory-lattice',
  'revenant-maze'
];
const attacks = attackIds.map((attackId) => {
  const attack = bossEvent.timeline.attacks.find((candidate) => candidate.id === attackId);
  assert.ok(attack, `Nullwake must compile ${attackId}`);
  return attack;
});

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

const toFrame = (seconds) => Math.max(1, Math.round(Math.max(0, Number(seconds) || 0) * 60));

const buildAttackBeats = (attack, phaseId) => {
  const variant = attack.variants.find((candidate) => candidate.phaseId === phaseId);
  assert.ok(variant, `${attack.id} must define ${phaseId}`);
  return variant.beatClipIds.map((clipId) => {
    const clip = bossEvent.timeline.clips.find((candidate) => candidate.id === clipId);
    const warning = bossEvent.timeline.clips.find(
      (candidate) => candidate.id === clip?.telegraphClipId
    );
    assert.ok(clip);
    assert.ok(warning);
    return {
      key: `${clip.id}:0`,
      clip,
      warningFrame: toFrame(warning.startSeconds),
      fireFrame: toFrame(clip.startSeconds)
    };
  });
};

const copyPoints = (origins) => origins.map(({ x, y }) => ({ x, y }));

const captureExactAttackPose = (viewport, attack, phaseId) => {
  const engine = new GameEngine(createStats(), {
    campaign: preview.campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    initialLevelId: preview.levelId,
    initialWaveId: preview.waveId,
    randomSeed: 'nullwake-safe-route-proof',
    previewBossCollisionEventId: preview.eventId,
    previewBossWeaponSockets: artwork.weaponSockets,
    previewBossWeaponSocketPoseSampler: poseSampler,
    previewBossArtworkDesignSize: artwork.modularRig.manifest.designSize,
    previewBossReducedMotion: false,
    previewBossWeaponSocketEventId: preview.eventId
  });
  engine.init(viewport.width, viewport.height);
  assert.equal(
    engine.triggerAuthoredBossAttack(attack.id, preview.eventId, phaseId),
    true
  );
  const boss = engine.bossRef;
  assert.ok(boss);
  const beats = buildAttackBeats(attack, phaseId);
  const beatOrigins = {};
  const lastFireFrame = Math.max(...beats.map((beat) => beat.fireFrame));

  while (boss.attackTimer <= lastFireFrame) {
    const beforeMove = { y: boss.y, height: boss.height };
    engine.frameCount += 1;
    engine.updateBoss(boss);
    const frame = boss.attackTimer;

    for (const beat of beats) {
      if (frame === beat.warningFrame) {
        if (beat.clip.primitiveId === 'gap-ring' || beat.clip.primitiveId === 'side-barrage') {
          const lock = boss.bossAttackOriginLocks.find((candidate) => (
            candidate.clipId === beat.clip.id && candidate.executionIndex === 0
          ));
          assert.ok(lock, `${beat.key} must capture its warning origin`);
          if (beat.clip.primitiveId === 'gap-ring') {
            beatOrigins[beat.key] = { core: copyPoints(lock.origins)[0] };
          } else {
            const side = beat.clip.parameters?.side ?? 'port';
            beatOrigins[beat.key] = {
              sockets: { [side]: copyPoints(lock.origins) }
            };
          }
        } else if (beat.clip.primitiveId === 'cross-beam') {
          assert.equal(Number.isFinite(boss.bossCrossBeamOriginX), true);
          assert.equal(Number.isFinite(boss.bossCrossBeamOriginY), true);
          beatOrigins[beat.key] = {
            core: {
              x: Number(boss.bossCrossBeamOriginX),
              y: Number(boss.bossCrossBeamOriginY)
            }
          };
        }
      }
      if (frame === beat.fireFrame && beat.clip.primitiveId === 'weave-wall') {
        beatOrigins[beat.key] = {
          weaveOriginY: Math.max(18, beforeMove.y + beforeMove.height * 0.62)
        };
      }
    }
  }

  assert.deepEqual(
    Object.keys(beatOrigins).sort(),
    beats.map((beat) => beat.key).sort(),
    `${attack.id}/${phaseId} must capture an exact origin for every compiled beat`
  );
  const cores = Object.values(beatOrigins).flatMap((origin) => origin.core ? [origin.core] : []);
  const weaveOrigins = Object.values(beatOrigins).flatMap(
    (origin) => origin.weaveOriginY === undefined ? [] : [origin.weaveOriginY]
  );
  const sockets = { port: [], starboard: [] };
  Object.values(beatOrigins).forEach((origin) => {
    for (const side of ['port', 'starboard']) {
      if (origin.sockets?.[side]) sockets[side].push(...origin.sockets[side]);
    }
  });

  return {
    core: cores[0] ?? { x: viewport.width / 2, y: viewport.height * 0.3 },
    weaveOriginY: weaveOrigins[0] ?? viewport.height * 0.35,
    sockets,
    projectileSpeed: boss.projectileSpeed,
    geometryUncertaintyPixels: 3,
    beatOrigins
  };
};

const getProofSettings = (attackId, phaseId, viewportId) => {
  const mobile = viewportId === 'mobile-390x844';
  if (attackId === 'claw-corridor' && mobile) {
    if (phaseId === 'sandbox-nullwake-borrowed-charge') {
      return { searchBreadth: 56, controlFrames: 8 };
    }
    if (phaseId === 'sandbox-nullwake-backplane-crown') {
      return { searchBreadth: 77, controlFrames: 6 };
    }
    return { searchBreadth: 153, controlFrames: 8 };
  }
  if (attackId === 'claw-corridor') {
    return { searchBreadth: 63, controlFrames: 7 };
  }
  if (
    attackId === 'memory-lattice'
    && phaseId === 'sandbox-nullwake-terminal-overclock'
    && mobile
  ) {
    return { searchBreadth: 16, controlFrames: 5 };
  }
  if (attackId === 'memory-lattice') {
    return { searchBreadth: 16, controlFrames: 8 };
  }
  if (attackId === 'revenant-maze' && mobile) {
    if (phaseId === 'sandbox-nullwake-borrowed-charge') {
      return { searchBreadth: 17, controlFrames: 5 };
    }
    if (phaseId === 'sandbox-nullwake-backplane-crown') {
      return { searchBreadth: 16, controlFrames: 2 };
    }
    return { searchBreadth: 17, controlFrames: 3 };
  }
  return { searchBreadth: 16, controlFrames: 6 };
};

const MINIMUM_ACCEPTANCE_CLEARANCE_PIXELS = 6;

const toEvidence = (proof, settings) => ({
  attackId: proof.attackId,
  phaseId: proof.phaseId,
  viewportId: proof.viewportId,
  searchBreadth: settings.searchBreadth,
  controlFrames: settings.controlFrames,
  checkedFrames: proof.checkedFrames,
  minimumClearancePixels: Number(proof.minimumClearancePixels.toFixed(6)),
  witnessHash: proof.witnessHash,
  modeledPrimitives: proof.modeledPrimitives
});

test('the real compiled Nullwake core attacks retain professional deterministic clearance in every phase and viewport', () => {
  const evidence = [];
  const repeatedEvidence = [];
  for (const attack of attacks) {
    for (const phase of bossEvent.phases) {
      for (const viewport of Object.values(BOSS_SAFE_ROUTE_BENCHMARK_VIEWPORTS)) {
        const settings = getProofSettings(attack.id, phase.id, viewport.id);
        const pose = captureExactAttackPose(viewport, attack, phase.id);
        const request = {
          timeline: bossEvent.timeline,
          attackId: attack.id,
          phaseId: phase.id,
          viewport,
          pose,
          ...settings
        };
        const first = proveBossAttackSafeRoute(request);
        assert.equal(first.status, 'proven', first.detail);
        assert.ok(
          first.minimumClearancePixels >= MINIMUM_ACCEPTANCE_CLEARANCE_PIXELS,
          `${attack.id}/${phase.id}/${viewport.id} clearance ${first.minimumClearancePixels}px is below ${MINIMUM_ACCEPTANCE_CLEARANCE_PIXELS}px`
        );
        assert.match(first.witnessHash, /^[0-9a-f]{8}$/);

        const repeated = proveBossAttackSafeRoute(request);
        assert.equal(repeated.status, 'proven', repeated.detail);
        evidence.push(toEvidence(first, settings));
        repeatedEvidence.push(toEvidence(repeated, settings));
      }
    }
  }
  assert.equal(evidence.length, 24);
  assert.equal(repeatedEvidence.length, 24);
  assert.deepEqual(repeatedEvidence, evidence);
  assert.deepEqual(evidence, expectedEvidence);
});
