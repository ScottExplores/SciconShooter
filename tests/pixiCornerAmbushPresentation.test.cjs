const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
);
const previewSession = fs.readFileSync(
  path.join(root, 'services', 'gameplay', 'previewSession.ts'),
  'utf8'
);

const sliceMethod = (start, end) => {
  const startIndex = renderer.indexOf(start);
  const endIndex = renderer.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `missing method marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing method end marker: ${end}`);
  return renderer.slice(startIndex, endIndex);
};

test('corner ambush blackout covers world overlays while preserving the real player and boss HUD', () => {
  assert.match(renderer, /private readonly cornerAmbushShade = new Graphics\(\)/);
  assert.match(renderer, /private readonly cornerAmbushGuide = new Graphics\(\)/);
  assert.match(
    renderer,
    /this\.app\.stage\.addChild\([\s\S]*?this\.layers\.background,[\s\S]*?this\.camera,[\s\S]*?this\.layers\.overlay,[\s\S]*?this\.cornerAmbushShade,[\s\S]*?this\.cornerAmbushGuide,[\s\S]*?this\.bossHealthRoot/
  );
  const overlayRegistration = sliceMethod(
    'this.layers.overlay.addChild(',
    'this.warningShade.visible = false;'
  );
  assert.doesNotMatch(overlayRegistration, /this\.bossHealthRoot/);
  assert.match(renderer, /this\.cornerAmbushShade\.eventMode = 'none'/);
  assert.match(renderer, /this\.cornerAmbushGuide\.eventMode = 'none'/);
  assert.match(renderer, /private cornerAmbushPlayerLayerRaised = false/);
  assert.match(renderer, /candidate\.bossUmbraBlackoutHuntActive/);
  assert.match(renderer, /this\.app\.stage\.addChildAt\(playerLayer/);
  assert.match(renderer, /this\.world\.addChildAt\(playerLayer/);
});

test('Umbra blackout hides the world without spotlights and draws exact threats above it', () => {
  const eyes = sliceMethod(
    'private drawUmbraBlackoutEyes(',
    'private drawUmbraBlackoutDashSilhouette('
  );
  const dash = sliceMethod(
    'private drawUmbraBlackoutDashSilhouette(',
    'private drawUmbraBlackoutReentrySilhouette('
  );
  const reentry = sliceMethod(
    'private drawUmbraBlackoutReentrySilhouette(',
    'private syncUmbraBlackoutPresentation('
  );
  const umbra = sliceMethod(
    'private syncUmbraBlackoutPresentation(',
    'private syncCornerAmbushPresentation(engine: GameEngine)'
  );
  const presentation = sliceMethod(
    'private syncCornerAmbushPresentation(engine: GameEngine)',
    'private updateWarnings(engine: GameEngine)'
  );

  assert.match(umbra, /this\.setCornerAmbushPlayerLayerRaised\(true, engine\)/);
  assert.match(umbra, /vanishStage === 'fade-out'/);
  assert.match(umbra, /0\.998 \* smoothstep\(vanishProgress\)/);
  assert.match(umbra, /vanishStage === 'recovery'/);
  assert.match(umbra, /0\.998 \* \(1 - smoothstep\(vanishProgress\)\)/);
  assert.match(umbra, /smoothstep\(\(vanishProgress - 0\.68\) \/ 0\.32\)/);
  assert.match(umbra, /fill\(\{ color: '#000002', alpha: blackoutAlpha \}\)/);
  assert.match(umbra, /this\.drawUmbraBlackoutEyes\(/);
  assert.match(umbra, /this\.drawUmbraBlackoutDashSilhouette\(/);
  assert.match(umbra, /const vanishReentry = boss\.bossVanishReentryState/);
  assert.match(umbra, /vanishStage === 'reentry-warning'/);
  assert.match(umbra, /vanishStage === 'reappear' \|\| vanishStage === 'recovery'/);
  assert.match(umbra, /0\.78 \* \(1 - smoothstep\(vanishProgress\)\)/);
  assert.match(umbra, /this\.drawUmbraBlackoutReentrySilhouette\(/);
  assert.match(umbra, /const warning = ram\.stage === 'warning'/);
  assert.match(umbra, /const warning = beam\.isTelegraph/);
  assert.match(umbra, /candidate\.bossOwnerId !== boss\.id/);
  assert.match(umbra, /!candidate\.isCornerAmbushBeam/);
  assert.match(umbra, /const startX = beamCenterX - tangentX \* halfLength/);
  assert.match(umbra, /const endX = beamCenterX \+ tangentX \* halfLength/);
  assert.match(umbra, /color: '#7f0017'/);
  assert.match(umbra, /color: '#ef233c'/);
  assert.match(umbra, /color: '#fff1f2'/);
  assert.match(umbra, /this\.previewDebugOverlays\.safeRegions/);
  assert.doesNotMatch(umbra, /\.cut\(\)|\.ellipse\(/);
  assert.doesNotMatch(umbra, /Math\.random|new (?:Graphics|Container|Sprite)/);
  assert.match(eyes, /\(0\.42 \+ alpha \* 0\.5\) \* alpha/);
  assert.match(eyes, /\(0\.55 \+ alpha \* 0\.45\) \* alpha/);
  assert.match(dash, /\(0\.68 \+ pulse \* 0\.3\) \* pulse/);
  assert.match(dash, /\(0\.42 \+ pulse \* 0\.42\) \* pulse/);
  assert.match(reentry, /this\.drawUmbraBlackoutEyes\(/);
  assert.match(reentry, /\(0\.18 \+ reveal \* 0\.72\) \* reveal/);
  assert.match(reentry, /\(0\.16 \+ reveal \* 0\.5\) \* reveal/);
  assert.doesNotMatch(reentry, /\.cut\(\)|\.ellipse\(/);
  assert.doesNotMatch(reentry, /Math\.random|new (?:Graphics|Container|Sprite)/);

  const ramPresentation = umbra.slice(
    umbra.indexOf('if (isRam && ram)'),
    umbra.indexOf('let beam: Entity | null')
  );
  const ramDebugStart = ramPresentation.indexOf(
    'if (this.previewDebugOverlays.safeRegions)'
  );
  assert.ok(ramDebugStart >= 0, 'Umbra ram route has an explicit debug gate');
  assert.match(ramPresentation.slice(0, ramDebugStart), /this\.drawUmbraBlackoutEyes\(/);
  assert.doesNotMatch(ramPresentation.slice(0, ramDebugStart), /lineTo\(targetX, targetY\)/);
  assert.match(ramPresentation.slice(ramDebugStart), /lineTo\(targetX, targetY\)/);
  assert.match(previewSession, /safeRegions: false/);

  assert.match(presentation, /const umbraRuntime = this\.isUmbraNeedlewingBlackoutBoss\(candidate\)/);
  assert.match(presentation, /candidate\.bossCornerAmbushBeamState/);
  assert.match(presentation, /candidate\.bossCornerAmbushRamState/);
  assert.match(presentation, /candidate\.bossVanishReentryState/);
  assert.match(presentation, /this\.syncUmbraBlackoutPresentation\(engine, boss, presentation\)/);
  assert.match(presentation, /this\.setCornerAmbushPlayerLayerRaised\(false\)/);
  assert.match(presentation, /String\(presentation\.primitiveId\) === CORNER_AMBUSH_BEAM_PRIMITIVE_ID/);
  assert.match(presentation, /String\(presentation\.primitiveId\) === CORNER_AMBUSH_RAM_PRIMITIVE_ID/);
  assert.match(presentation, /presentation\.stage === 'warning' \|\| presentation\.stage === 'fire'/);
  assert.match(presentation, /engine\.player\.x \+ engine\.player\.width \/ 2 \+ shakeX/);
  assert.match(presentation, /boss\.x \+ boss\.width \/ 2 \+ shakeX/);
  assert.ok(
    (presentation.match(/\.cut\(\)/g) || []).length >= 3,
    'generic bosses retain their existing player, boss, and beam reveals'
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
