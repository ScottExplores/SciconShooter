const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const rendererSource = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
);

test('Pixi waits for every registered modular atlas before publishing textures as ready', () => {
  const createStart = rendererSource.indexOf('private createModularPreviewBossTextures(');
  const createEnd = rendererSource.indexOf('\n  async init(', createStart);
  const createSource = rendererSource.slice(createStart, createEnd);
  const initStart = createEnd;
  const initEnd = rendererSource.indexOf('\n    this.app.canvas.className', initStart);
  const initSource = rendererSource.slice(initStart, initEnd);

  assert.ok(createStart >= 0 && createEnd > createStart);
  assert.match(createSource, /loadedAtlases\.length\s*!==\s*registration\.atlases\.length/);
  assert.match(createSource, /atlas\s*!==\s*registration\.atlases\[atlasIndex\]/);
  assert.match(createSource, /for \(const \[frameId, frame\] of Object\.entries\(atlas\.frames\)\)/);
  assert.match(createSource, /created\.has\(frameId\)/);
  assert.ok(
    createSource.indexOf('this.modularPreviewBossReady = true')
    > createSource.lastIndexOf('for (const [frameId, texture] of created)')
  );

  assert.match(initSource, /Promise\.all\(modularRig\.atlases\.map/);
  assert.match(initSource, /sheet:\s*await this\.textureBank\.load\(atlas\.url\)/);
  assert.match(initSource, /createModularPreviewBossTextures\(loadedAtlases\)/);
  assert.doesNotMatch(initSource, /modularRig\?\.manifest\.atlas/);
});

test('modular projectile art resolves frame geometry through the global registration index', () => {
  const methodStart = rendererSource.indexOf('private getPreviewBossPodTexture(');
  const methodEnd = rendererSource.indexOf('\n  private getPreviewBossProjectileVfxTexture(', methodStart);
  const methodSource = rendererSource.slice(methodStart, methodEnd);

  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  assert.match(methodSource, /modularRig\.frameById\[frameId\]/);
  assert.doesNotMatch(methodSource, /modularRig\.manifest\.atlas\.frames/);
});

test('semantic modular projectile animations select boss-owned atlas frames with bounded presentation', () => {
  const methodStart = rendererSource.indexOf('private getPreviewBossModularProjectileTexture(');
  const methodEnd = rendererSource.indexOf('\n  private getPreviewBossPodTexture(', methodStart);
  const methodSource = rendererSource.slice(methodStart, methodEnd);

  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  assert.match(methodSource, /entity\.bossOwnerId !== this\.previewBossRuntimeEntityId/);
  assert.match(methodSource, /this\.previewBossArtwork\?\.projectileAnimations/);
  assert.match(methodSource, /modularRig\.frameById\[frameId\]/);
  assert.match(methodSource, /this\.getModularPreviewBossTexture\(frameId\)/);
  assert.match(methodSource, /Array\.isArray\(animation\.frameIds\)/);
  assert.match(methodSource, /animation\.frameIds\.every/);
  assert.match(methodSource, /Number\.isFinite\(animation\.frameHoldFrames\)/);
  assert.match(methodSource, /Number\.isFinite\(animation\.minimumVisualHeight\)/);
  assert.match(methodSource, /Number\.isFinite\(animation\.entityHeightScale\)/);
  assert.match(methodSource, /Number\.isFinite\(animation\.orientationOffsetRadians\)/);

  const drawStart = rendererSource.indexOf('private drawProjectile(');
  const drawEnd = rendererSource.indexOf('\n  private drawBossWarning', drawStart);
  const drawSource = rendererSource.slice(drawStart, drawEnd);
  assert.match(drawSource, /getPreviewBossModularProjectileTexture\(entity, engineFrame\)/);
  assert.match(drawSource, /Math\.max\([\s\S]*minimumVisualHeight[\s\S]*entityHeightScale/);
  assert.match(drawSource, /Math\.atan2\(entity\.vy, entity\.vx\)[\s\S]*orientationOffsetRadians/);
  assert.ok(
    drawSource.indexOf('getPreviewBossModularProjectileTexture(entity, engineFrame)')
    < drawSource.indexOf('getPreviewBossProjectileVfxTexture(entity, engineFrame)')
  );
});
