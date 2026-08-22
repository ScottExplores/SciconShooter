const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rendererPath = path.resolve(
  __dirname,
  '..',
  'services',
  'pixi',
  'PixiGameRenderer.ts'
);
const renderer = fs.readFileSync(rendererPath, 'utf8');

const methodSource = (name, nextName) => {
  const start = renderer.indexOf(`  private ${name}(`);
  const end = renderer.indexOf(`  private ${nextName}(`, start + 1);
  assert.ok(start >= 0, `missing renderer method ${name}`);
  assert.ok(end > start, `missing renderer boundary ${nextName}`);
  return renderer.slice(start, end);
};

test('Prism modular preview is sandbox-scoped and suppresses only its legacy articulated presenter', () => {
  assert.match(
    renderer,
    /const PRISM_MOTH_MODULAR_RIG_ID = 'prism-moth-broodkeeper';/
  );

  const discriminator = methodSource(
    'isPrismMothModularPreview',
    'getPreviewBossArtwork'
  );
  assert.match(discriminator, /entity\.bossAttackArchetype === 'prism-moth'/);
  assert.match(discriminator, /this\.isPreviewBossEntity\(entity\)/);
  assert.match(
    discriminator,
    /registration\?\.manifest\.id === PRISM_MOTH_MODULAR_RIG_ID/
  );

  const articulated = methodSource(
    'drawArticulatedGeneratedBoss',
    'bindPreviewBossAtlasRigTextures'
  );
  const hideLegacyIndex = articulated.indexOf(
    'bossRig.articulated.prismMoth.root.visible = false'
  );
  const modularGuardIndex = articulated.indexOf(
    'if (this.isPrismMothModularPreview(entity)) return false'
  );
  const legacyDrawIndex = articulated.indexOf(
    'return this.drawPrismMothRig(view, entity, engine)'
  );
  assert.ok(hideLegacyIndex >= 0);
  assert.ok(modularGuardIndex > hideLegacyIndex);
  assert.ok(legacyDrawIndex > modularGuardIndex);

  const legacyPrism = methodSource(
    'drawPrismMothRig',
    'drawArticulatedGeneratedBoss'
  );
  assert.match(legacyPrism, /ensureArticulatedBossRigLoad\('prism-moth'\)/);
  assert.match(legacyPrism, /return true;/);
});

test('Prism modular preview receives the complete live pose/action presentation contract', () => {
  const modular = methodSource(
    'drawModularPreviewBoss',
    'drawWingbeatHoverPreviewBossAtlas'
  );
  assert.match(modular, /const action = this\.getPreviewBossActionPresentation\(entity\)/);
  assert.match(modular, /const partOverrides = samplePose\(\{/);
  assert.match(modular, /frameCount: engine\.frameCount/);
  assert.match(modular, /reducedMotion: this\.reducedMotion/);
  assert.match(modular, /healthRatio: entity\.hp \/ Math\.max\(1, entity\.maxHp\)/);
  assert.match(modular, /phaseIndex: Math\.max\(1, entity\.activeBossPhaseIndex \+ 1\)/);
  assert.match(modular, /entranceProgress,/);
  assert.match(modular, /phaseProgress: poseAction\?\.stage === 'phase-enter'/);
  assert.match(modular, /:\s*action;/);
  assert.match(
    modular,
    /reaction: entity\.bossEscapeState\s*\? null\s*:\s*this\.getPreviewBossPoseReaction\(entity, engine\)/
  );
  assert.match(modular, /action: poseAction\s*\n\s*\}\);/);
  assert.match(modular, /registration\.manifest\.destruction/);
});

test('Prism modular root, parts, and death fragments retain uniform pixel-art scaling', () => {
  const createRig = renderer.slice(
    renderer.indexOf('const createModularPreviewBossRigView = ('),
    renderer.indexOf('const createText =', renderer.indexOf('const createModularPreviewBossRigView = ('))
  );
  assert.match(
    createRig,
    /registration\.manifest\.preserveAspectRatio[\s\S]*registration\.manifest\.id === PRISM_MOTH_MODULAR_RIG_ID/
  );

  const modular = methodSource(
    'drawModularPreviewBoss',
    'drawWingbeatHoverPreviewBossAtlas'
  );
  assert.match(modular, /const uniformScale = Math\.min\(authoredScaleX, authoredScaleY\)/);
  assert.match(
    modular,
    /const designScaleX = preserveStructuralAspect \? uniformScale : authoredScaleX/
  );
  assert.match(
    modular,
    /const designScaleY = preserveStructuralAspect \? uniformScale : authoredScaleY/
  );
  assert.match(modular, /rigView\.root\.scale\.set\(designScaleX, designScaleY\)/);
  assert.match(
    modular,
    /const fragmentScaleY = preserveStructuralAspect[\s\S]*Math\.sign\(authoredScaleY \|\| 1\) \* scaleX/
  );
  assert.match(
    modular,
    /const partScaleY = preserveStructuralAspect[\s\S]*Math\.sign\(authoredPartScaleY \|\| 1\) \* scaleX/
  );
  assert.match(modular, /sprite\.scale\.set\(scaleX, partScaleY\)/);

  const debugScaleUses = Array.from(modular.matchAll(/designScaleX,\s*\n\s*designScaleY,/g));
  assert.ok(
    debugScaleUses.length >= 2,
    'debug and destruction snapshots must use the same uniform Prism scale'
  );
});

test('destroyed Prism left/right wing and brood-pod anatomy is hidden through existing component health', () => {
  const modular = methodSource(
    'drawModularPreviewBoss',
    'drawWingbeatHoverPreviewBossAtlas'
  );
  assert.match(
    modular,
    /part\.role === 'arm'[\s\S]*part\.role === 'armor'[\s\S]*part\.role === 'pod'/
  );
  assert.match(modular, /part\.id\.includes\('\.left'\)/);
  assert.match(modular, /part\.id\.includes\('\.right'\)/);
  assert.match(
    modular,
    /\(portComponentPart \|\| leftComponentPart\)[\s\S]*Boolean\(portCannon\?\.destroyed\)/
  );
  assert.match(
    modular,
    /\(starboardComponentPart \|\| rightComponentPart\)[\s\S]*Boolean\(starboardCannon\?\.destroyed\)/
  );
  assert.match(modular, /&& !destroyedByComponent/);
});
