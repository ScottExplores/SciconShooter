const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'public', 'game-art', 'generated', 'scicon-player-weapon-fx-v1');
const families = ['research', 'bio', 'eth', 'btc'];

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
};

const decodeRgbaPng = (file) => {
  const png = fs.readFileSync(file);
  const idat = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.equal(body[8], 8, `${file} should use 8-bit channels`);
      assert.equal(body[9], 6, `${file} should be RGBA`);
      assert.equal(body[12], 0, `${file} should not be interlaced`);
    } else if (kind === 'IDAT') {
      idat.push(body);
    }
    offset += length + 12;
    if (kind === 'IEND') break;
  }

  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : assert.fail(`Unsupported PNG filter ${filter}`);
      row[x] = (raw + predictor) & 0xff;
    }
    row.copy(pixels, y * stride);
    previous = row;
    sourceOffset += stride;
  }
  return { width, height, pixels };
};

const alphaMetrics = ({ width, height, pixels }) => {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
      area += 1;
    }
  }
  return { width: right - left, height: bottom - top, bottom, area };
};

test('every player ship has eight monotonic four-frame launch animations', () => {
  let frameCount = 0;
  families.forEach((family) => {
    for (let level = 0; level < 8; level += 1) {
      const metrics = [];
      for (let frame = 1; frame <= 4; frame += 1) {
        const file = path.join(pack, family, `level-${level}`, `frame-${frame}.png`);
        const png = fs.readFileSync(file);
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(png.readUInt32BE(16), 96);
        assert.equal(png.readUInt32BE(20), 128);
        assert.equal(png[25], 6, `${file} should be RGBA`);
        metrics.push(alphaMetrics(decodeRgbaPng(file)));
        frameCount += 1;
      }
      for (let index = 1; index < metrics.length; index += 1) {
        assert.ok(metrics[index].height > metrics[index - 1].height, `${family} L${level} height should grow at frame ${index + 1}`);
        assert.ok(metrics[index].area > metrics[index - 1].area, `${family} L${level} area should grow at frame ${index + 1}`);
      }
      assert.equal(metrics.at(-1).height, 78 + level * 6);
      metrics.forEach((metric) => assert.equal(metric.bottom, 122, `${family} L${level} should stay on the muzzle baseline`));
      const sheet = fs.readFileSync(path.join(pack, family, `level-${level}`, 'sprite-sheet.png'));
      assert.equal(sheet.readUInt32BE(16), 384);
      assert.equal(sheet.readUInt32BE(20), 128);
      assert.equal(sheet[25], 6);
      assert.ok(fs.existsSync(path.join(pack, family, `level-${level}`, 'preview.gif')));
    }
    const masterSheet = fs.readFileSync(path.join(pack, family, `${family}-weapon-levels-sprite-sheet.png`));
    assert.equal(masterSheet.readUInt32BE(16), 384);
    assert.equal(masterSheet.readUInt32BE(20), 1024);
    assert.equal(masterSheet[25], 6);
  });
  assert.equal(frameCount, 128);
});

test('primary shots preload every level and Projectile Upgrade selects hull-themed progression art', () => {
  const visuals = fs.readFileSync(path.join(root, 'services', 'playerWeaponVisuals.ts'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const pixi = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

  assert.equal((visuals.match(/frame-[1234]\.png/g) || []).length, 128);
  assert.match(visuals, /UNIVERSAL_PLAYER_WEAPON_FRAMES = research\[0\]/);
  assert.match(visuals, /BIO_PRIMARY_PLAYER_WEAPON_FRAMES = PLAYER_WEAPON_VISUALS\.bio\[0\]/);
  assert.match(visuals, /PLAYER_WEAPON_FRAME_URLS = Object\.freeze\(\[[\s\S]*\.\.\.research\.flat\(\),[\s\S]*\.\.\.PLAYER_WEAPON_VISUALS\.bio\.flat\(\),[\s\S]*\.\.\.PLAYER_WEAPON_VISUALS\.eth\.flat\(\),[\s\S]*\.\.\.PLAYER_WEAPON_VISUALS\.btc\.flat\(\)/);
  assert.match(visuals, /const family = familyOverride \?\? getPlayerWeaponVisualFamily\(weaponKind\)/);
  assert.match(visuals, /return PLAYER_WEAPON_VISUALS\[family\]\[visualLevel\]/);
  assert.match(engine, /weaponVisualLevel: number = 0/);
  assert.match(engine, /weaponVisualFamily\?: PlayerWeaponVisualFamily/);
  assert.match(engine, /weaponVisualStartFrame: number = 0/);
  // Hull primaries always wear their own family; the art level follows the
  // Fire Rate tier and an Overdrive pickup raises it further.
  assert.match(engine, /const hullVisualLevel = hullPrimary\r?\n\s*\? Math\.max\(0, getFireRateTier\(this\.stats\.upgrades\.fireRate \|\| 0\) - 1\)/);
  assert.match(engine, /b\.weaponVisualLevel = Math\.min\(7, Math\.max\(\r?\n\s*hullVisualLevel,\r?\n\s*overdrivePrimary \? this\.missionOverdriveLevel : 0/);
  assert.match(engine, /b\.weaponVisualFamily = hullPrimary\r?\n\s*\? getPlayerShipWeaponVisualFamily\(this\.playerShipId\)/);
  assert.match(engine, /const weaponKind: PlayerWeaponKind = hullProfile\.primaryKind === 'btc-bolt' \? 'btc-bolt' : 'pulse'/);
  assert.match(engine, /this\.playerShipId === 'bio'[\s\S]*getBioPrimaryShotPlan/);
  assert.match(engine, /'bio-primary'/);
  assert.match(engine, /BIO_PRIMARY_DAMAGE_PER_ROUND/);
  assert.match(engine, /const weaponSpeed = weaponKind === 'btc-bolt' \? 9 : 10/);
  assert.match(engine, /PLAYER_PRIMARY_SHOT_SPREAD_DEGREES = 5/);
  assert.match(engine, /Math\.floor\(sample \* 3\) - 1/);
  assert.match(engine, /getRandomPrimaryShotAngle\(this\.nextGameplayRandom\(\)\)/);
  assert.doesNotMatch(engine, /const angle = randomRange\(-0\.035, 0\.035\)/);
  assert.match(engine, /\.\.\.PLAYER_WEAPON_FRAME_URLS/);
  assert.match(pixi, /\.\.\.PLAYER_WEAPON_FRAME_URLS/);
  assert.match(pixi, /getPlayerWeaponFrames\([\s\S]*?entity\.weaponKind,[\s\S]*?entity\.weaponVisualLevel,[\s\S]*?entity\.weaponVisualFamily[\s\S]*?\)/);
  assert.match(pixi, /engineFrame - entity\.weaponVisualStartFrame/);
  assert.match(pixi, /const textureKey = frames\[launchFrame\]/);
  assert.match(pixi, /getPlayerProjectileUpgradePresentation\(entity\.weaponVisualLevel\)/);
  assert.match(pixi, /view\.trail\.blendMode = 'add'/);
  assert.doesNotMatch(pixi, /if \(playerShot\) \{[\s\S]{0,1200}view\.aura\.ellipse/);
  assert.match(engine, /ctx\.globalCompositeOperation = e\.isPlayerShot \? 'source-over' : 'lighter'/);
  assert.match(engine, /ctx\.shadowBlur = e\.isPlayerShot\s*\? 0/);
  assert.doesNotMatch(pixi, /renderFrame \+ entity\.variant\) \/ 3\) % frames\.length/);
  assert.match(engine, /this\.frameCount - e\.weaponVisualStartFrame/);
});

test('the old continuous BIO beam stays disabled while the bounded green primary is active', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const pixi = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');
  assert.match(engine, /isBioBeamFiring\(\) \{\s*return false;\s*\}/);
  assert.doesNotMatch(engine, /if \(bioLaserEquipped\)/);
  assert.match(engine, /getBioPrimaryShotPlan/);
  assert.match(pixi, /bioBeamEmitter = new Sprite\(Texture\.WHITE\)/);
  assert.match(pixi, /const active = engine\.isBioBeamFiring\(\)/);
});
