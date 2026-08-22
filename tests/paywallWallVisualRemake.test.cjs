const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const { PNG } = require(path.join(root, 'director', 'node_modules', 'pngjs'));
const frameRoot = path.join(root, 'public', 'game-art', 'generated', 'elite-enemies', 'paywall-wall-v2');
const manifest = JSON.parse(fs.readFileSync(path.join(frameRoot, 'manifest.json'), 'utf8'));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const loadTypeScriptModule = (relativePath) => {
  const compiled = ts.transpileModule(readText(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, exports: module.exports, require, Math, Number, Object }
  );
  return module.exports;
};

const runtime = loadTypeScriptModule('services/gameplay/bosses/PaywallWallRuntime.ts');

let bundledGameLogic;
const loadGameLogic = () => {
  if (bundledGameLogic) return bundledGameLogic;
  global.Image ??= class ImageStub {
    complete = true;
    naturalWidth = 1;
    naturalHeight = 1;
    crossOrigin = 'anonymous';
    src = '';
  };
  global.document ??= {
    hidden: false,
    addEventListener() {},
    removeEventListener() {}
  };
  global.window ??= {
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
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'gameLogic.ts')],
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
  bundledGameLogic = module.exports;
  return bundledGameLogic;
};

const createStats = () => ({
  score: 0,
  highScore: 0,
  wave: 4,
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

const countOpaqueComponents = (image) => {
  const seen = new Uint8Array(image.width * image.height);
  let components = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const start = y * image.width + x;
      if (seen[start] || image.data[start * 4 + 3] === 0) continue;
      components += 1;
      const stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const current = stack.pop();
        const cx = current % image.width;
        const cy = Math.floor(current / image.width);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
            const next = ny * image.width + nx;
            if (seen[next] || image.data[next * 4 + 3] === 0) continue;
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
  }
  return components;
};

test('Paywall Wall V2 preserves the authored campaign combat contract', () => {
  const campaign = JSON.parse(readText('game-config/campaign.json'));
  const matches = campaign.levels.flatMap((level) => level.waves.flatMap((wave) => (
    wave.events.filter((event) => event.bossId === 'paywall-wall').map((event) => ({ level, wave, event }))
  )));
  assert.equal(matches.length, 1);
  const { level, wave, event } = matches[0];
  assert.equal(level.id, 'stage-open-galaxy');
  assert.equal(wave.id, 'stage-open-galaxy-wave-7');
  assert.deepEqual(
    JSON.parse(JSON.stringify({
      health: event.health,
      speed: event.speed,
      damage: event.damage,
      count: event.count,
      movementPatternId: event.movementPatternId,
      warningSeconds: event.warningSeconds,
      durationSeconds: event.durationSeconds,
      scoreReward: event.scoreReward,
      weapons: event.weapons,
      phases: event.phases
    })),
    {
      health: 128,
      speed: 1.55,
      damage: 1,
      count: 1,
      movementPatternId: 'wall-march',
      warningSeconds: 1.2,
      durationSeconds: 14,
      scoreReward: 2600,
      weapons: [{
        id: 'bastion-phalanx-bolt',
        weaponId: 'wall-bolt',
        attackIntervalSeconds: 1.8,
        damage: 1,
        projectileSpeed: 5.4,
        burstCount: 1
      }],
      phases: [{
        id: 'bastion-phalanx-march',
        label: 'Phalanx march',
        triggerHealthRatio: 1,
        movementPatternId: 'wall-march',
        speedMultiplier: 1,
        weaponSettingIds: ['bastion-phalanx-bolt']
      }]
    }
  );
});

test('Paywall Wall V2 frames are crisp, connected, aligned, and safe at real segment scale', () => {
  assert.equal(manifest.id, 'paywall-wall-v2');
  assert.deepEqual(manifest.processing.targetFrame, { width: 84, height: 100 });
  assert.deepEqual(manifest.processing.runtimeFrame, { width: 42, height: 50 });
  assert.equal(manifest.processing.sourceToRuntimeScale, 0.5);
  assert.equal(manifest.processing.sharedPaletteSize, 32);
  assert.equal(manifest.processing.alpha, 'binary');
  assert.equal(manifest.processing.scaling, 'nearest-neighbor');
  assert.equal(manifest.processing.transparentSafetyMarginPixels, 4);
  assert.deepEqual(
    manifest.frames.map(({ id }) => id),
    ['idle', 'neutral', 'attack', 'damage-50', 'critical-15']
  );

  const hashes = new Set();
  for (const definition of manifest.frames) {
    const bytes = fs.readFileSync(path.join(frameRoot, definition.path));
    const image = PNG.sync.read(bytes);
    assert.equal(image.width, 84);
    assert.equal(image.height, 100);
    assert.equal(countOpaqueComponents(image), 1, `${definition.id} must be one connected structure`);
    const colors = new Set();
    let opaquePixels = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const offset = (y * image.width + x) * 4;
        const alpha = image.data[offset + 3];
        assert.ok(alpha === 0 || alpha === 255, `${definition.id} must use binary alpha`);
        if (!alpha) continue;
        assert.ok(x >= 4 && y >= 4 && x < image.width - 4 && y < image.height - 4);
        opaquePixels += 1;
        colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
      }
    }
    assert.ok(opaquePixels > 2_000, `${definition.id} must remain readable at 2x source scale`);
    assert.ok(colors.size <= 32);
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size, 5);
  const structuralCentroidXs = manifest.frames
    .filter(({ id }) => id !== 'attack')
    .map(({ centroid }) => centroid.x);
  assert.ok(Math.max(...structuralCentroidXs) - Math.min(...structuralCentroidXs) < 1.5);
});

test('Paywall Wall sprite sheet round-trips every cell with explicit gutters', () => {
  const sheet = PNG.sync.read(fs.readFileSync(path.join(frameRoot, manifest.spriteSheet.path)));
  assert.equal(sheet.width, 84 * 5 + 4 * 4);
  assert.equal(sheet.height, 100);
  manifest.frames.forEach((definition, index) => {
    const frame = PNG.sync.read(fs.readFileSync(path.join(frameRoot, definition.path)));
    const rectangle = manifest.spriteSheet.frames[index];
    for (let y = 0; y < frame.height; y += 1) {
      const frameRow = frame.data.subarray(y * frame.width * 4, (y + 1) * frame.width * 4);
      const sheetStart = (y * sheet.width + rectangle.x) * 4;
      assert.deepEqual(sheet.data.subarray(sheetStart, sheetStart + frame.width * 4), frameRow);
    }
  });
});

test('Paywall Wall marches as one deterministic Space-Invaders formation while descending', () => {
  assert.equal(runtime.resolvePaywallWallColumnCount({ arenaWidth: 390, wave: 4 }), 6);
  assert.equal(runtime.resolvePaywallWallColumnCount({ arenaWidth: 900, wave: 9 }), 8);
  const sample = (frameCount) => runtime.samplePaywallWallMarchOffset({
    frameCount,
    startFrame: 100,
    amplitude: 48
  });
  assert.equal(sample(100), 0);
  assert.equal(sample(104), 2);
  assert.equal(sample(196), 48);
  assert.equal(sample(292), 0);
  assert.equal(sample(388), -48);
  assert.equal(sample(484), 0);
  assert.equal(sample(196), sample(196), 'the same frame must always produce the same offset');

  const laneXs = [59, 105, 151, 197, 243, 289];
  for (const frame of [100, 196, 292, 388, 484]) {
    const offset = sample(frame);
    const positions = laneXs.map((x) => x + offset);
    assert.deepEqual(positions.slice(1).map((x, index) => x - positions[index]), [46, 46, 46, 46, 46]);
    assert.ok(positions[0] >= 8);
    assert.ok(positions.at(-1) + 42 <= 382);
  }

  const engine = readText('services/gameLogic.ts');
  assert.match(engine, /inv\.y \+= descentSpeed/);
  assert.match(engine, /inv\.x = laneX \+ groupOffset/);
  assert.doesNotMatch(engine, /wallSwayPhase[^\n]*Math\.sin/);
});

test('live Paywall Wall formation preserves lanes, reverses, survives member loss, and fires from its visible socket', () => {
  const campaign = JSON.parse(readText('game-config/campaign.json'));
  const event = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((candidate) => candidate.bossId === 'paywall-wall');
  assert.ok(event);
  const { GameEngine } = loadGameLogic();
  const engine = new GameEngine(createStats(), {
    campaign,
    previewMode: true,
    previewInvincible: true,
    audioEnabled: false,
    preloadCanvasAssets: false,
    randomSeed: 'paywall-wall-v2-engine'
  });
  engine.init(390, 844);
  engine.entities = [];
  engine.wave = 4;
  engine.frameCount = 100;
  engine.spawnWallBoss(event);

  let segments = engine.entities.filter((entity) => entity.type === 'ENEMY_INVADER');
  assert.equal(segments.length, 6);
  assert.ok(segments.every((segment) => segment.width === 42 && segment.height === 50));
  const lanes = segments.map((segment) => segment.wallLaneX);
  assert.deepEqual(lanes.slice(1).map((x, index) => x - lanes[index]), [46, 46, 46, 46, 46]);
  assert.ok(segments.every((segment) => segment.wallMarchAmplitude >= 48));
  const legacySegmentCount = 8;
  const expectedLegacyHealth = Math.ceil(
    (event.health * engine.getCurrentDifficultyMultiplier()) / legacySegmentCount
  ) * legacySegmentCount;
  assert.equal(segments.reduce((sum, segment) => sum + segment.hp, 0), expectedLegacyHealth);
  assert.equal(segments.reduce((sum, segment) => sum + segment.scoreValue, 0), 2600);
  const oldAnyDropChance = 1 - Math.pow(1 - event.powerupDropChance, legacySegmentCount);
  const newAnyDropChance = 1 - Math.pow(1 - segments[0].powerupDropChance, segments.length);
  assert.ok(Math.abs(oldAnyDropChance - newAnyDropChance) < 1e-12);

  const initialY = segments[0].y;
  engine.frameCount = 196;
  engine.updateWallBoss();
  segments = engine.entities.filter((entity) => entity.type === 'ENEMY_INVADER');
  assert.ok(segments.every((segment) => segment.x - segment.wallLaneX === 48));
  assert.deepEqual(
    segments.slice(1).map((segment, index) => segment.x - segments[index].x),
    [46, 46, 46, 46, 46]
  );
  assert.ok(segments[0].y > initialY, 'horizontal march must retain authored descent');

  segments[2].markedForDeletion = true;
  engine.frameCount = 388;
  engine.updateWallBoss();
  const survivors = engine.entities.filter((entity) => (
    entity.type === 'ENEMY_INVADER' && !entity.markedForDeletion
  ));
  assert.equal(survivors.length, 5);
  assert.ok(survivors.every((segment) => segment.x - segment.wallLaneX === -48));
  assert.ok(survivors.every((segment) => segment.x >= 8 && segment.x + segment.width <= 382));

  survivors.forEach((segment) => { segment.attackIntervalFrames = 1; });
  const projectileCount = engine.entities.filter((entity) => entity.type === 'PROJECTILE').length;
  engine.frameCount = 389;
  engine.updateWallBoss();
  const projectiles = engine.entities.filter((entity) => entity.type === 'PROJECTILE');
  assert.equal(projectiles.length, projectileCount + 1);
  const projectile = projectiles.at(-1);
  const shooter = survivors.find((segment) => segment.attackTimer === 12);
  assert.ok(shooter, 'one live wall node must own the firing state');
  assert.equal(projectile.x + projectile.width / 2, shooter.x + shooter.width / 2);
  assert.equal(projectile.y, shooter.y + shooter.height);
});

test('Paywall Wall state priority stays purposeful and its collision tooling matches the V2 art', () => {
  const neutralUrl = '/game-art/generated/elite-enemies/paywall-wall-v2/frames/paywall-wall-01-idle.png';
  assert.ok(readText('constants.ts').includes(neutralUrl));
  assert.ok(readText('tools/generate-boss-collision-masks.mjs').includes(`key: '${neutralUrl}'`));
  assert.ok(readText('services/gameplay/bosses/generatedBossCollisionMasks.ts').includes(JSON.stringify(neutralUrl)));
  assert.ok(readText('services/pixi/PixiGameRenderer.ts').includes('...ASSETS.PAYWALL_BASTION_FRAMES'));
  const renderer = readText('services/pixi/PixiGameRenderer.ts');
  const selector = renderer.slice(
    renderer.indexOf('const getPaywallBastionFrameIndex'),
    renderer.indexOf('const getStaticAsteroidTexture')
  );
  assert.ok(selector.indexOf('entity.attackTimer > 0') < selector.indexOf('healthRatio <= 0.15'));
  assert.match(renderer, /entity\.type === EntityType\.ENEMY_INVADER\) \{[\s\S]{0,180}view\.root\.rotation = 0/);
  const engine = readText('services/gameLogic.ts');
  assert.match(engine, /case EntityType\.ENEMY_INVADER:[\s\S]{0,120}insetX = entity\.width \* 0\.1/);
});
