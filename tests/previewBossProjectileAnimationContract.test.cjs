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

test('Helios gatling tracers keep their native +X art axis and rotate exactly once from velocity', () => {
  const tracerRegistration = bossSandboxModel.match(
    /'boss-gatling-tracer': Object\.freeze\(\{[\s\S]*?orientationOffsetRadians:\s*([^\n\r}]+)/
  );
  assert.ok(tracerRegistration, 'the Helios gatling tracer profile must be registered');
  assert.equal(
    tracerRegistration[1].trim(),
    '0',
    'the source tracer already faces +X, so its authored orientation offset must stay zero'
  );
  assert.match(
    pixiRenderer,
    /view\.root\.rotation\s*=\s*Math\.atan2\(entity\.vy, entity\.vx\)\s*\+\s*modularProjectile\.animation\.orientationOffsetRadians/,
    'Pixi must orient the native tracer once from its live velocity plus the registered offset'
  );
});

test('Helios mines expose a distinct armed frame and a readable seven-frame explosion', () => {
  assert.match(
    pixiRenderer,
    /visualKind === 'boss-helios-mine'[\s\S]*?entity\.heliosMineStage === 'armed'[\s\S]*?animation\.frameIds\.length - 1/,
    'the armed mine must hold its dedicated final modular frame'
  );
  assert.match(
    pixiRenderer,
    /const isHeliosExplosion = entity\.projectileVisualKind === 'boss-helios-explosion';[\s\S]*?const frameDelay = isHeliosExplosion\s*\? 6/,
    'the Helios explosion must pace its seven frames across the readable active lifecycle'
  );
});
