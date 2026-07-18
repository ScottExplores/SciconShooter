const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('public/game-art/generated/scicon-flight-motion-pack-v1/pack-manifest.json'));

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

test('player motion catalog mirrors the four production PNG sets in the manifest', () => {
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
  assert.match(motion, /PLAYER_SHIP_STEERING_BLEND_MS = 90/);
  assert.match(motion, /PLAYER_SHIP_BASE_STEERING_BLEND_MS = 165/);
  assert.match(motion, /PLAYER_SHIP_LEVEL_ONE_STEERING_BLEND_MS = 125/);
  assert.match(motion, /if \(speedLevel <= 0\) return PLAYER_SHIP_BASE_STEERING_BLEND_MS/);
  assert.match(motion, /if \(speedLevel === 1\) return PLAYER_SHIP_LEVEL_ONE_STEERING_BLEND_MS/);
  assert.match(motion, /return PLAYER_SHIP_STEERING_BLEND_MS/);
  assert.match(motion, /PLAYER_SHIP_BANK_THRESHOLD = 0\.42/);
  assert.match(motion, /PLAYER_SHIP_HARD_BANK_THRESHOLD = 0\.95/);
  assert.match(motion, /PLAYER_SHIP_HARD_BANK_SWEEP_RATIO = 0\.72/);
  assert.match(motion, /PLAYER_SHIP_TOUCH_SPEED_SCALE = 1\.34/);
  assert.match(motion, /'hard-left': `\$\{packPath\}\/researchhub\/frames\/researchhub-05-hard-right\.png`/);
  assert.match(motion, /'bank-left': `\$\{packPath\}\/researchhub\/frames\/researchhub-04-bank-right\.png`/);
  assert.match(motion, /'bank-right': `\$\{packPath\}\/researchhub\/frames\/researchhub-02-bank-left\.png`/);
  assert.match(motion, /'hard-right': `\$\{packPath\}\/researchhub\/frames\/researchhub-01-hard-left\.png`/);
  assert.doesNotMatch(motion, /\/enemies\//);
  assert.doesNotMatch(motion, /previewGif|\.gif/);
});

test('ship selection loops preloaded PNG frames at 5 FPS and cleans up its timer', () => {
  const selector = read('components/StartScreen.tsx');
  const motion = read('services/playerShipMotion.ts');
  const generator = read('tools/build-scicon-flight-motion-pack.py');

  assert.match(selector, /const playerShipOrder: PlayerShipId\[\] = \['researchhub', 'bio', 'eth', 'btc'\]/);
  assert.match(selector, /preloadPlayerShipSelectionFrames\(\)\.then/);
  assert.match(selector, /window\.setInterval/);
  assert.match(selector, /1000 \/ PLAYER_SHIP_SELECTION_FPS/);
  assert.match(selector, /frameIndex = \(frameIndex \+ 1\) % frames\.length/);
  assert.match(selector, /window\.clearInterval\(timer\)/);
  assert.match(selector, /data-selection-frame=/);
  assert.doesNotMatch(selector, /previewGif|\.gif/);
  assert.match(motion, /PLAYER_SHIP_SELECTION_FPS = 5/);
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
  assert.match(renderer, /const steeringBlendMs = getPlayerSteeringBlendMs\(speedLevel\)/);
  assert.match(renderer, /Math\.exp\(-Math\.max\(0, deltaMs\) \/ steeringBlendMs\)/);
  assert.match(renderer, /engine\.width - engine\.player\.width/);
  assert.match(renderer, /Math\.max\(0, signedSweep\) \/ playableWidth\s*>= PLAYER_SHIP_HARD_BANK_SWEEP_RATIO/);
  assert.match(renderer, /selectPlayerSteeringState\(this\.playerSteeringVisual, hardBankEligible\)/);
  assert.match(renderer, /this\.playerSteeringState === 'hard-left' \|\| this\.playerSteeringState === 'hard-right'/);
  assert.match(renderer, /thruster\.visible = !hardBank \|\| index === 0/);
  assert.match(renderer, /hardBank \? 0 : \(index === 0 \? -1 : 1\)/);
  assert.match(renderer, /sprite\.rotation = 0/);
  assert.doesNotMatch(renderer, /paywall-interceptor\/frames|citation-wraith\/frames|peer-review-bulwark\/frames|predatory-journal-raider\/frames/);
});
