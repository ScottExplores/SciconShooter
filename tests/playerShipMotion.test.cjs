const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('public/game-art/generated/scicon-flight-motion-pack-v1/pack-manifest.json'));

const motionBundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'services', 'playerShipMotion.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false
}).outputFiles[0].text;
const loadMotionRuntime = () => {
  const holder = { exports: {} };
  new Function('module', 'exports', motionBundle)(holder, holder.exports);
  return holder.exports;
};

const steeringIds = ['researchhub', 'bio', 'eth', 'btc-token-ship'];
const selectionIds = steeringIds.map((id) => `${id}-selection-idle`);
const playerAssets = manifest.assets.filter((asset) => (
  steeringIds.includes(asset.id) || selectionIds.includes(asset.id)
));

const readPngHeader = (publicUrl) => {
  const filePath = path.join(root, 'public', publicUrl.replace(/^\//, ''));
  const png = fs.readFileSync(filePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], publicUrl);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25],
    hasTransparencyChunk: png.includes(Buffer.from('tRNS'))
  };
};

test('player motion catalog mirrors the four animated production PNG sets in the manifest', () => {
  const motion = read('services/playerShipMotion.ts');

  assert.equal(playerAssets.length, 8);
  assert.equal(playerAssets.filter((asset) => steeringIds.includes(asset.id)).length, 4);
  assert.equal(playerAssets.filter((asset) => selectionIds.includes(asset.id)).length, 4);
  assert.equal(playerAssets.flatMap((asset) => asset.frames).length, 44);

  for (const asset of playerAssets) {
    const expectedFrameCount = selectionIds.includes(asset.id) ? 6 : 5;
    assert.equal(asset.frames.length, expectedFrameCount, asset.id);
    assert.equal(asset.role, 'ships', asset.id);
    if (selectionIds.includes(asset.id)) assert.equal(asset.fps, 5, asset.id);

    for (const frame of asset.frames) {
      assert.equal(path.extname(frame), '.png', frame);
      assert.match(frame, /\/frames\//, frame);
      assert.match(motion, new RegExp(path.basename(frame).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      const header = readPngHeader(frame);
      assert.equal(header.width, 256, frame);
      assert.equal(header.height, 256, frame);
      assert.ok(
        header.colorType === 4 || header.colorType === 6 || header.hasTransparencyChunk,
        `${frame} must preserve transparency`
      );
    }
  }

  assert.match(motion, /PLAYER_SHIP_STEERING_DEADZONE = 0\.12/);
  assert.match(motion, /PLAYER_SHIP_STEERING_BLEND_MS = 180/);
  assert.match(motion, /PLAYER_SHIP_BANK_THRESHOLD = 0\.42/);
  assert.match(motion, /PLAYER_SHIP_HARD_BANK_THRESHOLD = 0\.95/);
  assert.match(motion, /PLAYER_SHIP_HARD_BANK_SWEEP_RATIO = 0\.72/);
  assert.match(motion, /PLAYER_SHIP_TOUCH_SPEED_SCALE = 1\.34/);
  assert.match(motion, /PLAYER_SHIP_HARD_BANK_HOLD_MS = 140/);
  assert.match(motion, /'hard-left': `\$\{packPath\}\/researchhub\/frames\/researchhub-05-hard-right\.png`/);
  assert.match(motion, /'bank-left': `\$\{packPath\}\/researchhub\/frames\/researchhub-04-bank-right\.png`/);
  assert.match(motion, /'bank-right': `\$\{packPath\}\/researchhub\/frames\/researchhub-02-bank-left\.png`/);
  assert.match(motion, /'hard-right': `\$\{packPath\}\/researchhub\/frames\/researchhub-01-hard-left\.png`/);
  assert.match(motion, /'hard-left': `\$\{packPath\}\/btc-token-ship\/frames\/btc-token-ship-01-hard-left\.png`/);
  assert.match(motion, /'bank-left': `\$\{packPath\}\/btc-token-ship\/frames\/btc-token-ship-04-bank-right\.png`/);
  assert.match(motion, /'bank-right': `\$\{packPath\}\/btc-token-ship\/frames\/btc-token-ship-02-bank-left\.png`/);
  assert.match(motion, /'hard-right': `\$\{packPath\}\/btc-token-ship\/frames\/btc-token-ship-05-hard-right\.png`/);
  assert.doesNotMatch(motion, /\/enemies\//);
  assert.doesNotMatch(motion, /previewGif|\.gif/);
});

test('ship selection loops preloaded PNG frames at 5 FPS and cleans up its timer', () => {
  const selector = read('components/ShipCarousel.tsx');
  const startScreen = read('components/StartScreen.tsx');
  const motion = read('services/playerShipMotion.ts');
  const generator = read('tools/build-scicon-flight-motion-pack.py');

  assert.match(startScreen, /const playerShipOrder: PlayerShipId\[\] = \[\.\.\.PLAYABLE_PLAYER_SHIP_IDS\]/);
  assert.match(selector, /preloadPlayerShipCarouselFrames\(\)\.then/);
  assert.match(selector, /window\.setInterval/);
  assert.match(selector, /1000 \/ PLAYER_SHIP_SELECTION_FPS/);
  assert.match(selector, /frameIndex = \(frameIndex \+ 1\) % frames\.length/);
  assert.match(selector, /window\.clearInterval\(timer\)/);
  assert.match(selector, /data-selection-frame=/);
  assert.doesNotMatch(selector, /previewGif|\.gif/);
  assert.match(motion, /PLAYER_SHIP_SELECTION_FPS = 5/);
  assert.match(motion, /PLAYER_SHIP_CAROUSEL_FRAME_URLS = \[[\s\S]*PLAYER_SHIP_STEERING_FRAME_URLS[\s\S]*PLAYER_SHIP_SELECTION_FRAME_URLS/);
  assert.match(motion, /preloadDecodedImageUrls\(\s*PLAYER_SHIP_CAROUSEL_FRAME_URLS/);
  assert.match(motion, /btc-token-ship\/frames\/btc-token-ship-03-neutral\.png/);
  assert.match(motion, /btc-token-ship-selection-idle\/frames/);
  assert.doesNotMatch(generator, /booster_lock_y|resting_lower/);
});

test('Pixi preloads steering textures and swaps frames only for the player presentation', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const updateIndex = renderer.indexOf('this.updatePlayerSteeringPresentation(engine, deltaMs);');
  const syncIndex = renderer.indexOf('this.syncEntities(engine);', updateIndex);

  assert.match(renderer, /\.\.\.PLAYER_SHIP_STEERING_FRAME_URLS/);
  assert.ok(updateIndex >= 0 && syncIndex > updateIndex, 'steering presentation updates before entity sync');
  assert.match(renderer, /entity\.type === EntityType\.PLAYER\s*\? this\.playerSteeringTextureKey \?\? engine\.playerShipUrl\s*:\s*getDefaultEntityTexture\(engine, entity\)/);
  assert.match(renderer, /view\.sprite\.width = entity\.width \* styleScale/);
  assert.match(renderer, /view\.sprite\.height = entity\.height \* styleScale/);
  assert.match(renderer, /view\.root\.rotation = 0/);
  assert.match(renderer, /view\.root\.scale\.set\(visualScale\)/);
  assert.match(renderer, /this\.playerThrusterRoot\.rotation = 0/);
  assert.match(renderer, /advancePlayerSteeringVisual\(this\.playerSteeringVisual, normalizedHorizontal, deltaMs\)/);
  assert.match(renderer, /this\.playerSteeringVisual <= -PLAYER_SHIP_HARD_BANK_THRESHOLD/);
  assert.match(renderer, /triggerEligible: requestedHardBankDirection !== 0\s*&& hardBankEligible/);
  assert.match(renderer, /engine\.width - engine\.player\.width/);
  assert.match(renderer, /Math\.max\(0, signedSweep\) \/ playableWidth\s*>= PLAYER_SHIP_HARD_BANK_SWEEP_RATIO/);
  assert.match(renderer, /getPlayerSteeringPresentationSpeed/);
  assert.match(renderer, /updatePlayerHardBankLatch/);
  assert.match(renderer, /hardBankDirection === requestedDirection/);
  assert.match(renderer, /selectPlayerSteeringState\(this\.playerSteeringVisual, false\)/);
  assert.match(renderer, /engine\.waveDepartureFrames > 0[\s\S]*?this\.playerSteeringState = 'neutral'/);
  assert.match(renderer, /const hardBank = !takeoffActive[\s\S]*?this\.playerSteeringState === 'hard-left'/);
  assert.match(renderer, /thruster\.visible = !hardBank \|\| index === 0/);
  assert.match(renderer, /hardBank \? 0 : \(index === 0 \? -1 : 1\)/);
  assert.match(renderer, /sprite\.rotation = 0/);
  assert.doesNotMatch(renderer, /paywall-interceptor\/frames|citation-wraith\/frames|peer-review-bulwark\/frames|predatory-journal-raider\/frames/);
});

test('touch steering presentation stays equally responsive after speed upgrades', () => {
  const { getPlayerSteeringPresentationSpeed } = loadMotionRuntime();
  const baseHorizontalSpeed = 2.5;

  for (const upgradedSpeed of [2.5, 5.5, 10, 15]) {
    assert.equal(
      getPlayerSteeringPresentationSpeed({
        baseHorizontalSpeed,
        maxHorizontalSpeed: upgradedSpeed,
        touchActive: true
      }),
      baseHorizontalSpeed * 1.34
    );
  }
  assert.equal(
    getPlayerSteeringPresentationSpeed({
      baseHorizontalSpeed,
      maxHorizontalSpeed: 15,
      touchActive: false
    }),
    15
  );
});

test('a hard bank remains visible briefly and clears on an intentional reversal', () => {
  const { updatePlayerHardBankLatch } = loadMotionRuntime();
  let latch = { direction: 0, remainingMs: 0, triggeredDirection: 0 };
  latch = updatePlayerHardBankLatch(latch, {
    requestedDirection: 1,
    hardBankDirection: 1,
    triggerEligible: true,
    deltaMs: 16
  });
  assert.deepEqual(latch, { direction: 1, remainingMs: 140, triggeredDirection: 1 });

  latch = updatePlayerHardBankLatch(latch, {
    requestedDirection: 1,
    hardBankDirection: 0,
    triggerEligible: false,
    deltaMs: 120
  });
  assert.deepEqual(latch, { direction: 1, remainingMs: 20, triggeredDirection: 1 });

  latch = updatePlayerHardBankLatch(latch, {
    requestedDirection: -1,
    hardBankDirection: 0,
    triggerEligible: false,
    deltaMs: 16
  });
  assert.deepEqual(latch, { direction: 0, remainingMs: 0, triggeredDirection: 1 });
});

test('a sustained touch gesture triggers one bank and an opposite gesture can trigger next', () => {
  const { updatePlayerHardBankLatch } = loadMotionRuntime();
  let latch = { direction: 0, remainingMs: 0, triggeredDirection: 0 };
  latch = updatePlayerHardBankLatch(latch, {
    requestedDirection: 1,
    hardBankDirection: 1,
    triggerEligible: true,
    deltaMs: 16
  });
  for (let index = 0; index < 20; index += 1) {
    latch = updatePlayerHardBankLatch(latch, {
      requestedDirection: 1,
      hardBankDirection: 1,
      triggerEligible: true,
      deltaMs: 16
    });
  }
  assert.deepEqual(latch, { direction: 0, remainingMs: 0, triggeredDirection: 1 });

  latch = updatePlayerHardBankLatch(latch, {
    requestedDirection: -1,
    hardBankDirection: -1,
    triggerEligible: true,
    deltaMs: 16
  });
  assert.deepEqual(latch, { direction: -1, remainingMs: 140, triggeredDirection: -1 });
});

// Execute the actual renderer method with a minimal engine, so the touch gate,
// sweep distance, easing, latch and texture selection are tested together.
const shipCatalog = { exports: {} };
new Function('module', 'exports', esbuild.buildSync({
  entryPoints: [path.join(root, 'services/playerShipService.ts')],
  bundle: true, platform: 'node', format: 'cjs', write: false
}).outputFiles[0].text)(shipCatalog, shipCatalog.exports);

const createSteeringHarness = (speedLevel = 0, shipId = 'researchhub') => {
  const runtime = loadMotionRuntime();
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const start = renderer.indexOf('  private updatePlayerSteeringPresentation(');
  const end = renderer.indexOf('  private ensureArticulatedBossRigLoad(', start);
  const code = esbuild.transformSync(`class SteeringHarness {${renderer.slice(start, end)}}`, {
    loader: 'ts', target: 'es2020'
  }).code;
  const Harness = new Function(...Object.keys(runtime), 'GAME_CONFIG', `${code}; return SteeringHarness;`)(
    ...Object.values(runtime), { BASE_PLAYER_SPEED: 2.5 }
  );
  const view = new Harness();
  const engine = {
    playerShipUrl: shipCatalog.exports.PLAYER_SHIPS[shipId].assetUrl,
    player: { x: 0, width: 40 }, width: 1040,
    waveDepartureFrames: 0, stats: { upgrades: { speed: speedLevel } },
    playerVel: { x: 0 }, touchPos: { x: 1020 }
  };
  view.updatePlayerSteeringPresentation(engine, 0);
  return { view, engine, step: (dt) => {
    view.updatePlayerSteeringPresentation(engine, dt);
    return view.playerSteeringState;
  } };
};

test('ordinary touch swipes favor the intermediate pose at every speed upgrade', () => {
  for (let speed = 0; speed <= 7; speed += 1) {
    const { engine, step } = createSteeringHarness(speed);
    engine.playerVel.x = 15;
    const states = [];
    for (let frame = 0; frame < 60; frame += 1) {
      engine.player.x = frame * 5; // less than a third of the arena
      states.push(step(1000 / 60));
    }
    assert.equal(states[0], 'neutral', `speed ${speed} must not snap on touch`);
    assert.ok(states.includes('bank-right'));
    assert.ok(!states.some((state) => state.startsWith('hard-')));
  }
});

test('all four hulls retain their authored mild-bank sprites in both directions', () => {
  const { PLAYER_SHIP_MOTION } = loadMotionRuntime();
  for (const shipId of ['researchhub', 'bio', 'eth', 'btc']) {
    const { view, engine, step } = createSteeringHarness(7, shipId);
    for (const direction of [-1, 1]) {
      engine.touchPos.x = direction * 1000;
      engine.playerVel.x = direction * 15;
      for (let frame = 0; frame < 50; frame += 1) step(16);
      const state = direction < 0 ? 'bank-left' : 'bank-right';
      assert.equal(view.playerSteeringState, state);
      assert.equal(view.playerSteeringTextureKey, PLAYER_SHIP_MOTION[shipId].steeringFrames[state]);
    }
  }
});

test('an arena-wide swipe shows a long intermediate bank before one brief hard pose', () => {
  for (const fps of [30, 60, 120]) {
    const { engine, step } = createSteeringHarness(7);
    engine.playerVel.x = 15;
    const timeline = [];
    for (let frame = 0; frame < fps; frame += 1) {
      engine.player.x = frame * 1000 / fps;
      timeline.push({ time: (frame + 1) * 1000 / fps, state: step(1000 / fps) });
    }
    const mild = timeline.find((entry) => entry.state === 'bank-right');
    const hard = timeline.find((entry) => entry.state === 'hard-right');
    assert.ok(mild && hard);
    assert.ok(hard.time - mild.time >= 400, `${fps} FPS must dwell in the 45-degree pose`);
    assert.equal(timeline.at(-1).state, 'bank-right', 'must not stay edge-on');
    assert.ok(timeline.filter((entry) => entry.state === 'hard-right').length * 1000 / fps <= 180);
  }
});

test('reversals ease through neutral, release settles, and a stalled frame cannot skip the bank', () => {
  const { engine, step } = createSteeringHarness(7);
  engine.playerVel.x = 15;
  assert.equal(step(2000), 'neutral', 'background resume must not jump to a hard pose');
  for (let frame = 0; frame < 40; frame += 1) step(16);
  engine.touchPos.x = -500;
  engine.playerVel.x = -15;
  const reversal = Array.from({ length: 40 }, () => step(16));
  assert.equal(reversal[0], 'bank-right');
  assert.ok(reversal.includes('neutral'));
  assert.equal(reversal.at(-1), 'bank-left');
  assert.ok(!reversal.some((state) => state.startsWith('hard-')));
  engine.touchPos = null;
  engine.playerVel.x = 0;
  for (let frame = 0; frame < 60; frame += 1) step(16);
  assert.equal(step(16), 'neutral');
  engine.waveDepartureFrames = 10;
  engine.playerVel.x = 15;
  assert.equal(step(16), 'neutral');
});

test('lifting the finger cancels a hard-bank hold immediately', () => {
  const { updatePlayerHardBankLatch } = loadMotionRuntime();
  const next = updatePlayerHardBankLatch({ direction: 1, remainingMs: 140, triggeredDirection: 1 }, {
    requestedDirection: 0, hardBankDirection: 0, triggerEligible: false, deltaMs: 16
  });
  assert.equal(next.direction, 0);
  assert.equal(next.remainingMs, 0);
});
