const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const contracts = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'boss-rigs', 'PreviewBossRigContracts.ts'),
  'utf8'
);
const projectileRuntime = fs.readFileSync(
  path.join(root, 'services', 'gameplay', 'bosses', 'BossProjectilePresentationRuntime.ts'),
  'utf8'
);
const gameLogic = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const bossSandboxModel = fs.readFileSync(
  path.join(root, 'director', 'src', 'tools', 'bosses', 'bossSandboxModel.ts'),
  'utf8'
);
const pixiRenderer = fs.readFileSync(
  path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
  'utf8'
);

test('preview boss artwork declares a bounded per-kind modular projectile animation profile', () => {
  assert.match(projectileRuntime, /'boss-heavy-shell'/);
  assert.match(projectileRuntime, /'boss-gatling-tracer'/);
  assert.match(projectileRuntime, /'boss-reactor-pellet'/);
  assert.match(projectileRuntime, /export type BossModularProjectileVisualKind/);

  assert.match(contracts, /export interface PreviewBossProjectileAnimation/);
  assert.match(contracts, /readonly frameIds: readonly string\[\]/);
  assert.match(contracts, /readonly frameHoldFrames: number/);
  assert.match(contracts, /readonly minimumVisualHeight: number/);
  assert.match(contracts, /readonly entityHeightScale: number/);
  assert.match(contracts, /readonly orientationOffsetRadians: number/);
  assert.match(contracts, /readonly projectileAnimations\?: PreviewBossProjectileAnimationProfile/);
  assert.match(gameLogic, /\| BossModularProjectileVisualKind/);
});

test('Helios gatling tracers correct their native -X art axis exactly once from velocity', () => {
  const tracerRegistration = bossSandboxModel.match(
    /'boss-gatling-tracer': Object\.freeze\(\{[\s\S]*?orientationOffsetRadians:\s*([^\n\r}]+)/
  );
  assert.ok(tracerRegistration, 'the Helios gatling tracer profile must be registered');
  assert.equal(
    tracerRegistration[1].trim(),
    'Math.PI',
    'the source tracer faces -X, so its authored orientation offset must add exactly PI'
  );
  assert.match(
    pixiRenderer,
    /entity\.spriteFrameFixedRotationRadians[\s\S]*?\?\? Math\.atan2\(entity\.vy, entity\.vx\)[\s\S]*?\+ modularProjectile\.animation\.orientationOffsetRadians/,
    'Pixi must honor an authored fixed axis or live velocity, then apply the registered offset exactly once'
  );
});

test('Frontier modular hazards use the open claw, chain segment, and animated beam sprites', () => {
  assert.match(projectileRuntime, /'boss-frontier-reactor-beam'/);
  assert.match(
    bossSandboxModel,
    /'boss-frontier-chainclaw':[\s\S]*?frameIds:\s*Object\.freeze\(\['claw\.open'\]\)/
  );
  assert.match(
    bossSandboxModel,
    /'boss-frontier-chain-link':[\s\S]*?frameIds:\s*Object\.freeze\(\['chain\.segment'\]\)/
  );
  assert.match(
    bossSandboxModel,
    /'boss-frontier-reactor-beam':[\s\S]*?'beam\.0'[\s\S]*?'beam\.3'/
  );
  assert.match(
    gameLogic,
    /beam\.projectileVisualKind = 'boss-frontier-reactor-beam'/
  );
  assert.match(
    pixiRenderer,
    /getPreviewBossModularProjectileTexture\([\s\S]*?entity,[\s\S]*?engineFrame,[\s\S]*?true[\s\S]*?\)/
  );
});

test('Helios mines use generic renderer playback controls for arming and explosion frames', () => {
  assert.match(
    pixiRenderer,
    /entity\.projectileAnimationMode === 'play-once-before-last'[\s\S]*?animation\.frameIds\.length - 2[\s\S]*?Math\.floor\(age \/ frameHold\)/,
    'deploying modular projectiles must reserve their final authored frame without looping'
  );
  assert.match(
    pixiRenderer,
    /entity\.projectileAnimationMode === 'hold-last'[\s\S]*?animation\.frameIds\.length - 1/,
    'the generic modular playback contract must hold its dedicated final frame'
  );
  assert.match(
    gameLogic,
    /mine\.projectileAnimationMode = sample\.stage === 'armed'[\s\S]*?\? 'hold-last'[\s\S]*?: sample\.stage === 'deploying'[\s\S]*?\? 'play-once-before-last'/,
    'gameplay must expose the armed lifecycle through the generic playback contract'
  );
  assert.match(
    gameLogic,
    /mine\.spriteFramePlaybackMode = 'once';[\s\S]*?mine\.spriteFrameHoldFrames = 6;/,
    'gameplay must configure the readable explosion pacing without a boss-specific renderer branch'
  );
  assert.match(
    pixiRenderer,
    /const isOneShotAnimation = entity\.spriteFramePlaybackMode === 'once';[\s\S]*?entity\.spriteFrameHoldFrames/,
    'Pixi must consume the generic one-shot sprite-sheet controls'
  );
  assert.match(
    pixiRenderer,
    /entity\.spriteFrameFixedRotationRadians !== undefined[\s\S]*?view\.root\.rotation = entity\.spriteFrameFixedRotationRadians/,
    'one-shot playback and fixed orientation must remain independent generic controls'
  );
});
