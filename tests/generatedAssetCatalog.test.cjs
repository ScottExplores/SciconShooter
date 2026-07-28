const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'generated-assets.json'), 'utf8'));
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const validatorSource = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

test('generated asset manifest registers the content-addressed biohazard HUD icon', () => {
  assert.equal(manifest.schemaVersion, 1);
  const biohazardEntry = manifest.assets.find((entry) => (
    entry.id === 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F'
  ));
  assert.deepEqual(biohazardEntry, {
    id: 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F',
    label: 'Pixel biohazard bomb',
    roles: ['hud'],
    path: '/game-art/generated/biohazard-bomb-e5d01d651f2f.png',
    sha256: 'e5d01d651f2fde72e26a6634ff35d311379350e0b7273a703d23fb250d74d899',
    width: 256,
    height: 256,
    createdAt: '2026-07-12T00:00:00.000Z'
  });
});

test('registered biohazard PNG exists with the manifest hash and dimensions', () => {
  const entry = manifest.assets.find((candidate) => (
    candidate.id === 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F'
  ));
  assert.ok(entry);
  const filePath = path.join(root, 'public', ...entry.path.split('/').filter(Boolean));
  const png = fs.readFileSync(filePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(createHash('sha256').update(png).digest('hex'), entry.sha256);
  assert.equal(png.readUInt32BE(16), entry.width);
  assert.equal(png.readUInt32BE(20), entry.height);
});

test('shared catalog validates generated metadata, exposes role helpers, and campaign validation uses them', () => {
  assert.match(catalogSource, /parseGeneratedAssetCatalog/);
  assert.match(catalogSource, /GENERATED_ASSET_PATH_PATTERN/);
  assert.match(catalogSource, /export const getAssetKeysForRole/);
  assert.match(catalogSource, /export const isAssetAllowedForRole/);
  assert.match(catalogSource, /export const registerGeneratedAssetForPreview/);
  assert.match(validatorSource, /validateHudAssets/);
  assert.match(validatorSource, /isAssetAllowedForRole\(candidate\.spriteKey as string, 'enemy'\)/);
  assert.match(validatorSource, /isAssetAllowedForRole\(event\.spriteKey as string, 'boss'\)/);
  assert.match(validatorSource, /isAssetAllowedForRole\(candidate\.spriteKey as string, 'asteroid'\)/);
});

test('engine resolves catalog art on demand instead of adding generated images to eager preload constants', () => {
  assert.match(engineSource, /getPrimaryAssetPath\(spriteKey as AssetKey\)/);
  assert.match(engineSource, /loadImage\(catalogPath\)/);
  assert.match(engineSource, /getPrimaryAssetPath\(this\.campaign\.hudAssets\.bombIconAssetKey\)/);
  assert.match(engineSource, /this\.drawSprite\(ctx, this\.bombSpriteUrl/);
  assert.doesNotMatch(engineSource, /GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F/);
});
