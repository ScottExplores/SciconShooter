const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);

class TestImage {
  complete = true;
  naturalWidth = 1;
  naturalHeight = 1;
  crossOrigin = '';
  src = '';
}

global.Image = TestImage;

const loadModule = (entryPoint) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entryPoint)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    module,
    module.exports
  );
  return module.exports;
};

const { GameEngine } = loadModule(path.join('services', 'gameLogic.ts'));

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
  lives: 10,
  repairsCount: 0,
  upgrades: { fireRate: 0, speed: 0, ability: 0 },
  powerupUses: {},
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

const findMajorBossFixture = () => {
  const majorBossIds = new Set(campaign.sectors.map((sector) => sector.majorBossId));
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const event = wave.events.find((candidate) => (
        candidate.kind === 'boss' && majorBossIds.has(candidate.bossId)
      ));
      if (event) return { level, wave, event };
    }
  }
  throw new Error('Campaign must contain a major boss fixture');
};

const fixture = findMajorBossFixture();
const umbraEventId = 'sandbox-umbra-needlewing';

const createEngine = () => {
  const engine = new GameEngine(createStats(), {
    campaign,
    audioEnabled: false,
    preloadCanvasAssets: false,
    previewMode: true,
    previewInvincible: false,
    previewBossWeaponSocketEventId: umbraEventId,
    previewBossProjectileVisualKinds: [
      'boss-umbra-needle',
      'boss-umbra-wing-shard'
    ],
    initialLevelId: fixture.level.id,
    initialWaveId: fixture.wave.id,
    randomSeed: 'umbra-runtime-integration'
  });
  engine.init(390, 844);
  engine.entities = [];
  engine.frameCount = 300;
  engine.invincibleTimer = 0;
  return engine;
};

const spawnUmbra = (engine) => {
  engine.spawnBoss({
    ...structuredClone(fixture.event),
    id: umbraEventId,
    bossId: 'umbra-needlewing',
    label: 'Umbra Needlewing',
    componentMode: 'hull-only',
    componentHealth: undefined,
    health: 500,
    sizeMultiplier: 1,
    revival: undefined,
    timeline: undefined
  });
  const boss = engine.entities.find((entity) => entity.type === 'BOSS');
  assert.ok(boss, 'Umbra should spawn through the canonical GameEngine boss path');
  boss.x = 84;
  boss.y = 110;
  boss.vx = 0;
  boss.vy = 0;
  boss.spriteUrl = undefined;
  boss.spriteFrames = undefined;
  boss.bossComponents = [];
  boss.scoreReward = 777;
  return boss;
};

const createOverlappingPlayerShot = (engine, boss, damage = 10) => {
  const shot = engine.createEntity(
    'PROJECTILE',
    boss.x + boss.width / 2 - 6,
    boss.y + boss.height / 2 - 6
  );
  shot.width = 12;
  shot.height = 12;
  shot.isPlayerShot = true;
  shot.damage = damage;
  shot.color = '#ffffff';
  shot.life = 120;
  engine.entities.push(shot);
  return shot;
};

const advanceVanishLifecycleTo = (engine, boss, desiredStage) => {
  const startFrame = boss.bossVanishReentryState.startFrame;
  const maximumFrame = startFrame + 300;
  for (let frame = startFrame; frame <= maximumFrame; frame += 1) {
    engine.frameCount = frame;
    engine.updateBossVanishReentry(boss);
    if (boss.bossVanishReentryStage === desiredStage) return frame;
  }
  throw new Error(`Vanish lifecycle never reached ${desiredStage}`);
};

test('vanish and re-entry gate targeting, shot consumption, and body collision in the canonical engine', () => {
  const engine = createEngine();
  const boss = spawnUmbra(engine);
  const startingHealth = boss.hp;
  const startingLives = engine.lives;
  const started = engine.beginUmbraVanishReentry(
    boss,
    60,
    18,
    610,
    205,
    730
  );

  assert.equal(started, true);
  assert.equal(engine.isBossCombatInteractive(boss), false);
  assert.equal(engine.isBossBodyCollisionActive(boss), false);
  assert.equal(engine.getPreviewSnapshot().boss.lifecycle.kind, 'vanish-reentry');

  engine.player.x = boss.x + boss.width / 2 - engine.player.width / 2;
  engine.player.y = boss.y + boss.height / 2 - engine.player.height / 2;
  const hiddenShot = createOverlappingPlayerShot(engine, boss);
  engine.checkCollisions();

  assert.equal(boss.hp, startingHealth, 'vanished anatomy takes no damage');
  assert.equal(hiddenShot.markedForDeletion, false, 'rounds pass through without a false hit');
  assert.equal(engine.lives, startingLives, 'the vanished body has no ram collision');
  hiddenShot.markedForDeletion = true;

  advanceVanishLifecycleTo(engine, boss, 'recovery');
  assert.equal(engine.isBossCombatInteractive(boss), true);
  assert.equal(engine.isBossBodyCollisionActive(boss), true);
  const recoveryShot = createOverlappingPlayerShot(engine, boss, 12);
  engine.checkCollisions();
  assert.equal(recoveryShot.markedForDeletion, true);
  assert.ok(boss.hp < startingHealth, 'visible recovery anatomy is targetable again');

  const state = boss.bossVanishReentryState;
  engine.frameCount = state.startFrame + Object.values(state.durations)
    .reduce((sum, frames) => sum + frames, 0);
  engine.updateBossVanishReentry(boss);
  assert.equal(boss.bossVanishReentryState, undefined);
  assert.equal(boss.bossVanishOpacity, 1);
});

test('Blackout Ambush preserves one exact warning lock through vanish and damaging re-entry', () => {
  const engine = createEngine();
  const boss = spawnUmbra(engine);
  const warning = {
    id: 'umbra-blackout-warning',
    label: 'Blackout ambush warning',
    track: 'presentation',
    primitiveId: 'telegraph',
    trigger: 'time',
    startSeconds: 0,
    durationSeconds: 0.75,
    parameters: {
      telegraphStyle: 'target',
      motionCue: 'umbra-blackout-ambush'
    }
  };
  const ram = {
    id: 'umbra-blackout-ram',
    label: 'Blackout ambush ram',
    track: 'attack',
    primitiveId: 'corner-ambush-ram',
    trigger: 'time',
    startSeconds: 0.75,
    durationSeconds: 0.55,
    telegraphClipId: warning.id,
    parameters: {
      sequence: 1,
      motionCue: 'umbra-blackout-ambush'
    }
  };
  boss.bossTimeline = {
    durationSeconds: 3,
    loop: false,
    clips: [warning, ram]
  };
  engine.player.x = 255;
  engine.player.y = 690;

  engine.dispatchBossTimelineCue(boss, {
    clip: warning,
    executionIndex: 0,
    timelineFrame: 0
  }, 3);

  const warnedRam = boss.bossCornerAmbushRamState;
  const vanish = boss.bossVanishReentryState;
  assert.ok(warnedRam);
  assert.ok(vanish);
  assert.deepEqual(
    { x: vanish.lock.reentry.x, y: vanish.lock.reentry.y },
    {
      x: warnedRam.lock.startX + boss.width / 2,
      y: warnedRam.lock.startY + boss.height / 2
    },
    'the reappearing sprite uses the warned ram origin'
  );
  assert.deepEqual(
    { x: vanish.lock.target.x, y: vanish.lock.target.y },
    { x: warnedRam.lock.targetX, y: warnedRam.lock.targetY },
    'the re-entry warning and damaging ram share one locked target'
  );

  engine.frameCount = vanish.startFrame + Object.values(vanish.durations)
    .reduce((sum, frames) => sum + frames, 0);
  engine.updateBossVanishReentry(boss);
  boss.attackTimer = Math.round(ram.startSeconds * 60);
  engine.dispatchBossTimelineCue(boss, {
    clip: ram,
    executionIndex: 0,
    timelineFrame: boss.attackTimer
  }, 3);

  assert.equal(boss.bossVanishReentryState, undefined);
  assert.equal(boss.bossCornerAmbushRamState.stage, 'charge');
  assert.deepEqual(
    {
      x: boss.bossCornerAmbushRamState.lock.targetX,
      y: boss.bossCornerAmbushRamState.lock.targetY
    },
    { x: warnedRam.lock.targetX, y: warnedRam.lock.targetY }
  );
});

test('Umbra projectiles carry the registered animated needle and wing-shard presentation kinds', () => {
  const engine = createEngine();
  const boss = spawnUmbra(engine);

  engine.spawnBossSideBarrage(
    boss,
    2,
    'port',
    6,
    'umbra-needle-lattice',
    { x: 190, y: 720 },
    [{ x: 115, y: 215 }]
  );
  const needles = engine.entities.filter((entity) => (
    entity.bossOwnerId === boss.id
    && entity.projectileVisualKind === 'boss-umbra-needle'
  ));
  assert.equal(needles.length, 6);
  assert.ok(needles.every((projectile) => projectile.isPlayerShot === false));

  boss.bossActionPresentation = {
    motionCue: 'umbra-wing-shard-gate'
  };
  engine.spawnBossSafeGapRing(boss, 2, 2, false, 16);
  const shards = engine.entities.filter((entity) => (
    entity.bossOwnerId === boss.id
    && entity.projectileVisualKind === 'boss-umbra-wing-shard'
  ));
  assert.ok(shards.length >= 10, 'the gap remains readable while using visible shard art');
});

test('terminal escape cleans owned hazards, grants one escape reward, and produces an escaped summary', () => {
  const engine = createEngine();
  const boss = spawnUmbra(engine);
  const normalEffects = { explosions: 0, coinBursts: 0, recordedKills: 0 };
  engine.spawnExplosion = () => { normalEffects.explosions += 1; };
  engine.spawnBossCoinBurst = () => { normalEffects.coinBursts += 1; return 0; };
  engine.recordWaveVictoryKill = () => { normalEffects.recordedKills += 1; };

  const ownedHazard = engine.createEntity('PROJECTILE', 100, 300);
  ownedHazard.bossOwnerId = boss.id;
  ownedHazard.damage = 3;
  ownedHazard.isPlayerShot = false;
  engine.entities.push(ownedHazard);
  engine.pendingBossStrikes = [{ bossId: boss.id }];
  engine.pendingEnemyLasers = [{ sourceId: boss.id, telegraphId: 'umbra-laser' }];
  boss.bossTimeline = {
    durationSeconds: 2,
    loop: false,
    clips: [{
      id: 'umbra-terminal-decoy',
      label: 'Terminal decoy',
      track: 'summon',
      primitiveId: 'summon-formation',
      trigger: 'death',
      startSeconds: 0,
      durationSeconds: 0.2,
      parameters: {
        enemyId: 'drone',
        formationPatternId: 'v',
        summonCount: 2
      }
    }]
  };
  const startingDefeats = engine.stats.enemiesDefeated;
  const startingScore = engine.stats.score;

  boss.hp = 0;
  engine.handleEnemyDestroyed(boss);

  assert.equal(boss.markedForDeletion, false);
  assert.equal(boss.bossEscapeStage, 'damaged-stagger');
  assert.equal(engine.isBossCombatInteractive(boss), false);
  assert.equal(ownedHazard.markedForDeletion, true);
  assert.equal(engine.pendingBossStrikes.length, 0);
  assert.equal(engine.pendingEnemyLasers.length, 0);
  assert.equal(
    engine.entities.some((entity) => (
      entity.bossOwnerId === boss.id && !entity.markedForDeletion
    )),
    false,
    'death cues cannot leave a newly dispatched hostile alive during escape'
  );
  assert.deepEqual(normalEffects, { explosions: 0, coinBursts: 0, recordedKills: 0 });
  assert.equal(engine.stats.enemiesDefeated, startingDefeats);
  assert.equal(engine.getPreviewSnapshot().boss.lifecycle.kind, 'escape');

  const escapeState = boss.bossEscapeState;
  engine.frameCount = escapeState.startFrame + Object.values(escapeState.durations)
    .reduce((sum, frames) => sum + frames, 0);
  engine.updateUmbraEscape(boss);

  assert.equal(boss.markedForDeletion, true);
  assert.equal(engine.bossRef, null);
  assert.equal(engine.mainBossDefeated, true);
  assert.equal(engine.lastBossTerminalOutcome, 'escaped');
  assert.equal(engine.stats.score, startingScore + boss.scoreReward);
  assert.equal(engine.getPreviewSnapshot().boss, null);
  assert.equal(engine.buildWaveVictorySummary().bossTerminalOutcome, 'escaped');
  assert.deepEqual(normalEffects, { explosions: 0, coinBursts: 0, recordedKills: 0 });

  engine.updateUmbraEscape(boss);
  assert.equal(
    engine.stats.score,
    startingScore + boss.scoreReward,
    'escape completion cannot pay the reward twice'
  );
});

test('preview restart clears escape state, owner hazards, pending timers, and terminal outcome', () => {
  const engine = createEngine();
  const boss = spawnUmbra(engine);
  const ownedHazard = engine.createEntity('PROJECTILE', 100, 300);
  ownedHazard.bossOwnerId = boss.id;
  engine.entities.push(ownedHazard);
  engine.pendingBossStrikes = [{ bossId: boss.id }];
  engine.pendingEnemyLasers = [{ sourceId: boss.id, telegraphId: 'umbra-laser' }];
  boss.hp = 0;
  engine.handleEnemyDestroyed(boss);
  assert.ok(boss.bossEscapeState);

  engine.restartPreview();

  assert.equal(engine.entities.length, 0);
  assert.equal(engine.pendingBossStrikes.length, 0);
  assert.equal(engine.pendingEnemyLasers.length, 0);
  assert.equal(engine.bossRef, null);
  assert.equal(engine.lastBossTerminalOutcome, null);
  assert.equal(engine.getPreviewSnapshot().boss, null);
});

test('renderer, preview snapshot, and permanent records all consume the escape lifecycle contract', () => {
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const previewSource = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'previewSession.ts'),
    'utf8'
  );
  const rendererSource = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(previewSource, /readonly lifecycle: Readonly<\{/);
  assert.match(previewSource, /kind: 'vanish-reentry' \| 'escape'/);
  assert.match(engineSource, /lifecycle: activeBoss\.bossEscapeStage/);
  assert.match(rendererSource, /vanishReentry: entity\.bossVanishReentryStage/);
  assert.match(rendererSource, /escape: entity\.bossEscapeStage/);
  assert.match(
    rendererSource,
    /reaction: entity\.bossEscapeState\s*\?\s*null\s*:\s*this\.getPreviewBossPoseReaction/
  );
  assert.match(rendererSource, /engine\.lastBossTerminalOutcome !== 'escaped'/);
  assert.match(rendererSource, /engine\.lastBossTerminalOutcome === 'escaped'/);

  const escapeRecordGuards = appSource.match(
    /summary\.bossTerminalOutcome !== 'escaped'/g
  ) ?? [];
  assert.equal(
    escapeRecordGuards.length,
    2,
    'campaign and non-campaign permanent boss records both reject escapes'
  );
});
