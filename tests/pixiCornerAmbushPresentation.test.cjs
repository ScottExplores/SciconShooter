const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
);

const sliceMethod = (start, end) => {
  const startIndex = renderer.indexOf(start);
  const endIndex = renderer.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing method marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing method end marker: ${end}`);
  return renderer.slice(startIndex, endIndex);
};

test('corner ambush blackout is a pooled world-only layer below the Pixi HUD', () => {
  assert.match(renderer, /private readonly cornerAmbushShade = new Graphics\(\)/);
  assert.match(renderer, /private readonly cornerAmbushGuide = new Graphics\(\)/);
  assert.match(
    renderer,
    /this\.app\.stage\.addChild\([\s\S]*?this\.layers\.background,[\s\S]*?this\.camera,[\s\S]*?this\.cornerAmbushShade,[\s\S]*?this\.cornerAmbushGuide,[\s\S]*?this\.layers\.overlay/
  );
  assert.match(
    renderer,
    /this\.layers\.overlay\.addChild\([\s\S]*?this\.bossHealthRoot/
  );
  assert.match(renderer, /this\.cornerAmbushShade\.eventMode = 'none'/);
  assert.match(renderer, /this\.cornerAmbushGuide\.eventMode = 'none'/);
});

test('corner ambush presentation spotlights the real boss and player around exact beam geometry', () => {
  const presentation = sliceMethod(
    'private syncCornerAmbushPresentation(engine: GameEngine)',
    'private updateWarnings(engine: GameEngine)'
  );

  assert.match(presentation, /String\(presentation\.primitiveId\) === CORNER_AMBUSH_BEAM_PRIMITIVE_ID/);
  assert.match(presentation, /String\(presentation\.primitiveId\) === CORNER_AMBUSH_RAM_PRIMITIVE_ID/);
  assert.match(presentation, /presentation\.stage === 'warning' \|\| presentation\.stage === 'fire'/);
  assert.match(presentation, /engine\.player\.x \+ engine\.player\.width \/ 2 \+ shakeX/);
  assert.match(presentation, /boss\.x \+ boss\.width \/ 2 \+ shakeX/);
  assert.ok(
    (presentation.match(/\.cut\(\)/g) || []).length >= 3,
    'player, boss, and live beam all cut through the world shade'
  );
  assert.match(presentation, /candidate\.bossOwnerId !== boss\.id/);
  assert.match(presentation, /!candidate\.isCornerAmbushBeam/);
  assert.match(presentation, /candidate\.isTelegraph === warning/);
  assert.match(presentation, /const beamCenterX = beam\.x \+ beam\.width \/ 2 \+ shakeX/);
  assert.match(presentation, /const beamCenterY = beam\.y \+ beam\.height \/ 2 \+ shakeY/);
  assert.match(presentation, /const startX = beamCenterX - tangentX \* halfLength/);
  assert.match(presentation, /const endX = beamCenterX \+ tangentX \* halfLength/);
  assert.match(presentation, /const converge = smoothstep\(telegraphProgress\)/);
  assert.match(presentation, /for \(let direction = -1; direction <= 1; direction \+= 2\)/);
  assert.match(presentation, /for \(let side = -1; side <= 1; side \+= 2\)/);
  assert.match(presentation, /boss\.bossCornerAmbushRamState/);
  assert.match(presentation, /lineTo\(targetX, targetY\)/);
  assert.doesNotMatch(presentation, /Math\.random|new (?:Graphics|Container|Sprite)/);

  const sync = sliceMethod('sync(engine: GameEngine', '\n  destroy()');
  assert.ok(
    sync.indexOf('this.syncCornerAmbushPresentation(engine)')
      < sync.indexOf('this.syncEntities(engine)'),
    'the active ambush owner must be known before its pooled beam view is drawn'
  );
});

test('corner ambush live beam stays bright while transforming orbiter hull hits stay local', () => {
  const projectile = sliceMethod(
    'private drawProjectile(view: EntityView, entity: Entity, engine: GameEngine)',
    'private drawPlayerRig'
  );
  const orbiter = sliceMethod(
    'private drawTransformingOrbiterPreviewBossAtlas',
    'private drawRotatingEmitterCorePreviewBossAtlas'
  );

  assert.match(
    projectile,
    /const cornerAmbushBeam = entity\.isCornerAmbushBeam[\s\S]*?&& entity\.bossOwnerId === this\.cornerAmbushBossId/
  );
  assert.match(
    projectile,
    /cornerAmbushBeam[\s\S]*?\? 0\.96 \+ Math\.sin\(engineFrame \* 0\.42\) \* 0\.04/
  );
  assert.match(projectile, /alpha: cornerAmbushBeam \? 1 : 0\.96/);
  assert.doesNotMatch(orbiter, /WHITE_HIT_FILTERS/);
  assert.match(orbiter, /sprite\.filters = null/);
});
