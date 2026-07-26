const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const loadPreviewSession = () => {
  const filePath = path.join(root, 'services', 'gameplay', 'previewSession.ts');
  const compiled = ts.transpileModule(read('services', 'gameplay', 'previewSession.ts'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object }
  );
  return moduleBox.exports;
};

test('preview seek and fast-forward frame budgets are executable and strictly bounded', () => {
  const preview = loadPreviewSession();

  assert.equal(preview.PREVIEW_SIMULATION_FPS, 60);
  assert.equal(preview.MAX_PREVIEW_SEEK_FRAMES, 7_200);
  assert.equal(preview.MAX_PREVIEW_FAST_FORWARD_FRAMES, 1_800);
  assert.equal(preview.clampPreviewSeekFrame(-1), 0);
  assert.equal(preview.clampPreviewSeekFrame(91.9), 91);
  assert.equal(preview.clampPreviewSeekFrame(Number.POSITIVE_INFINITY), 0);
  assert.equal(preview.clampPreviewSeekFrame(99_999), 7_200);
  assert.equal(preview.clampPreviewFastForwardFrames(-1), 0);
  assert.equal(preview.clampPreviewFastForwardFrames(45.8), 45);
  assert.equal(preview.clampPreviewFastForwardFrames(99_999), 1_800);
  assert.equal(preview.resolvePreviewAttackLoopFrame(99, 15, 100), 99);
  assert.equal(preview.resolvePreviewAttackLoopFrame(100, 15, 100), 15);
  assert.equal(preview.resolvePreviewAttackLoopFrame(145, 15, 100), 15);
});

test('Boss Factory debug controls normalize unsafe input and expose only supported safe guides', () => {
  const preview = loadPreviewSession();

  assert.equal(preview.clampPreviewBossHealthRatio(-5), 0.01);
  assert.equal(preview.clampPreviewBossHealthRatio(0.5), 0.5);
  assert.equal(preview.clampPreviewBossHealthRatio(9), 1);
  assert.equal(preview.clampPreviewHealthBudget(-5), 1);
  assert.equal(preview.clampPreviewHealthBudget(3200.4), 3200);
  assert.equal(preview.clampPreviewHealthBudget(9_000_000), 1_000_000);
  assert.deepEqual(
    JSON.parse(JSON.stringify(preview.rescalePreviewHealthBudget(1600, 3200, 2000))),
    { health: 1000, maxHealth: 2000 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(preview.rescalePreviewHealthBudget(0, 224, 112, false))),
    { health: 0, maxHealth: 112 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(preview.normalizePreviewDebugOverlays({
      modularPivots: 1,
      safeRegions: true
    }))),
    {
      modularPivots: true,
      weaponSockets: false,
      bossCollision: false,
      modularPartBounds: false,
      safeRegions: true
    }
  );
  assert.equal(preview.resolvePreviewSafeRegionGuide('gap-ring'), 'gap');
  assert.equal(preview.resolvePreviewSafeRegionGuide('weave-wall'), 'weave');
  assert.equal(preview.resolvePreviewSafeRegionGuide('side-barrage'), 'side');
  assert.equal(preview.resolvePreviewSafeRegionGuide('cross-beam'), 'cross');
  assert.equal(preview.resolvePreviewSafeRegionGuide('aimed-burst'), null);
  assert.equal(preview.resolvePreviewSafeRegionGuide(null), null);
});

test('the canonical canvas routes typed preview commands through the real engine facade', () => {
  const canvas = read('components', 'GameCanvas.tsx');
  const engine = read('services', 'gameLogic.ts');
  const contract = read('services', 'gameplay', 'previewSession.ts');

  assert.match(contract, /type: 'spawn-event-now'/);
  assert.match(contract, /type: 'jump-to-boss-phase'/);
  assert.match(contract, /type: 'trigger-boss-attack'/);
  assert.match(contract, /readonly attackId: string/);
  assert.match(contract, /readonly phaseId\?: string/);
  assert.match(contract, /readonly loop\?: boolean/);
  assert.match(contract, /type: 'seek-to-frame'/);
  assert.match(contract, /type: 'fast-forward'/);
  assert.match(contract, /type: 'step-frame'/);
  assert.match(contract, /type: 'set-boss-health'/);
  assert.match(contract, /type: 'set-boss-max-health'/);
  assert.match(contract, /type: 'set-boss-component-max-health'/);
  assert.match(contract, /readonly components: readonly PreviewBossComponentSnapshot\[\]/);
  assert.match(contract, /type: 'set-debug-overlays'/);
  assert.match(contract, /type: 'capture-frame'/);
  assert.match(contract, /export interface PreviewSnapshot/);

  assert.match(canvas, /engine\.spawnPreviewEventNow\(command\.eventId\)/);
  assert.match(canvas, /engine\.jumpToAuthoredBossPhase\(command\.phaseId, command\.eventId\)/);
  assert.match(
    canvas,
    /engine\.triggerAuthoredBossAttack\([\s\S]*command\.attackId,[\s\S]*command\.eventId,[\s\S]*command\.phaseId,[\s\S]*command\.loop \?\? false[\s\S]*\)/
  );
  assert.match(canvas, /engine\.seekPreviewToFrame\(command\.frame\)/);
  assert.match(canvas, /engine\.fastForwardPreviewFrames\(command\.frames\)/);
  assert.match(canvas, /!runningRef\.current && engine\.stepPreviewFrame\(\)/);
  assert.match(canvas, /engine\.setPreviewBossHealthRatio\(/);
  assert.match(canvas, /engine\.setPreviewBossMaxHealth\(/);
  assert.match(canvas, /engine\.setPreviewBossComponentMaxHealth\(/);
  assert.match(canvas, /pixiRendererRef\.current\?\.setPreviewDebugOverlays/);
  assert.match(canvas, /pixiRendererRef\.current\?\.capturePngDataUrl\(\)/);
  assert.match(canvas, /onPreviewSnapshot\?: \(snapshot: PreviewSnapshot\) => void/);
  assert.match(canvas, /RUNTIME_STATE_SYNC_INTERVAL_MS/);

  assert.match(engine, /private canUsePreviewControl\(\)/);
  assert.match(engine, /return this\.previewMode \|\| this\.testMode/);
  assert.match(engine, /spawnPreviewEventNow\(eventId: string\)/);
  assert.match(engine, /jumpToAuthoredBossPhase\(phaseId: string, eventId\?: string\)/);
  assert.match(engine, /triggerAuthoredBossAttack\([\s\S]*attackId: string,[\s\S]*eventId\?: string,[\s\S]*requestedPhaseId\?: string,[\s\S]*loop = false/);
  assert.match(engine, /seekPreviewToFrame\(targetFrame: number\)[\s\S]*this\.restartPreview\(\)/);
  assert.match(engine, /fastForwardPreviewFrames\(frameCount: number\)[\s\S]*this\.update\(false\)/);
  assert.match(engine, /stepPreviewFrame\(\)[\s\S]*this\.update\(false\)/);
  assert.match(engine, /setPreviewBossHealthRatio\(healthRatio: number, eventId\?: string\)/);
  assert.match(engine, /setPreviewBossMaxHealth\(maxHealth: number, eventId\?: string\)/);
  assert.match(engine, /setPreviewBossComponentMaxHealth\([\s\S]*componentId: string,[\s\S]*maxHealth: number,[\s\S]*eventId\?: string/);
  assert.match(engine, /clampPreviewBossHealthRatio\(healthRatio\)/);
  assert.match(engine, /components: Object\.freeze\(\(activeBoss\.bossComponents \?\? \[\]\)\.map/);
  assert.match(engine, /rescalePreviewHealthBudget\([\s\S]*boss\.hp,[\s\S]*previousMaxHealth,[\s\S]*maxHealth/);
  assert.match(engine, /safeRegionGuide: resolvePreviewSafeRegionGuide\(activePrimitiveId\)/);
});

test('Pixi owns preview-only modular diagnostics and uses its extract system for PNG capture', () => {
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');

  assert.match(renderer, /private readonly previewDebugOverlay = new Graphics\(\)/);
  assert.match(renderer, /setPreviewDebugOverlays\(overlays: PreviewDebugOverlayState\)/);
  assert.match(renderer, /private syncPreviewDebugOverlay\(engine: GameEngine\)/);
  assert.match(renderer, /this\.modularBossDebugSnapshot = Object\.freeze\(/);
  assert.match(renderer, /engine\.getBossCollisionMask\(boss\)/);
  assert.match(renderer, /resolveBossGapRoute\(/);
  assert.match(renderer, /resolveBossWeaveWallLayout\(/);
  assert.match(renderer, /resolvePreviewSafeRegionGuide\(action\?\.primitiveId\)/);
  assert.match(renderer, /this\.app\.renderer\.extract\.base64\(/);
  assert.match(renderer, /dataUrl\.startsWith\('data:image\/png'\)/);
  assert.match(renderer, /this\.previewDebugOverlay\.clear\(\)/);
  assert.doesNotMatch(renderer, /bossDeathRoot\.addChild\(this\.previewDebugOverlay/);
});

test('manual boss attack commands preserve warning-first scheduling across all runtime sources', () => {
  const engine = read('services', 'gameLogic.ts');
  const methodStart = engine.indexOf('  triggerAuthoredBossAttack(');
  const methodEnd = engine.indexOf('\n  fastForwardPreviewFrames(', methodStart);
  const method = engine.slice(methodStart, methodEnd);

  assert.ok(methodStart >= 0 && methodEnd > methodStart);
  assert.match(method, /isDamagingBossTimelinePrimitive\(clip\.primitiveId\)/);
  assert.match(method, /getBossTimelineAttackWindow\(/);
  assert.match(method, /boss\.attackTimer = Math\.max\(0, attackWindow\.startFrame - 1\)/);
  assert.match(method, /getGeneratedBossPreviewAttackStart\(archetype, attackId\)/);
  assert.match(method, /boss\.attackTimer = Math\.max\(0, generatedStart\.startFrame - 1\)/);
  assert.match(method, /previewBossAttackLoop = loop \?/);
  assert.match(method, /event\.weapons\.find\(\(setting\) => setting\.id === attackId\)/);
  assert.match(method, /queuePreviewBossLaneLaser\(sources\[0\]\)/);
  assert.match(method, /this\.spawnBossBurst\(/);
  assert.match(engine, /private applyPreviewBossAttackLoop\(boss: Entity\)/);
  assert.match(engine, /resolvePreviewAttackLoopFrame\([\s\S]*loop\.startFrame,[\s\S]*loop\.endFrame/);
  assert.match(engine, /boss\.attackTimer\+\+;[\s\S]*this\.applyPreviewBossAttackLoop\(boss\)/);
});

test('authored lane warnings reuse beam presenters and helix emissions share the primitive cap', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(
    engine,
    /linkedAction\?\.primitiveId === 'cross-beam'[\s\S]*spawnBossCrossBeamPair\(boss, true, warningFrames\)/
  );
  assert.match(
    engine,
    /linkedAction\?\.primitiveId === 'rail-sweep'[\s\S]*spawnBossRailSweep\([\s\S]*true/
  );
  assert.match(
    engine,
    /const defaultProjectileCount = Math\.max\([\s\S]*MAX_GENERATED_BOSS_PROJECTILES_PER_CUE/
  );
  assert.match(
    engine,
    /Math\.min\(MAX_GENERATED_BOSS_PROJECTILES_PER_CUE, Math\.round\(projectileCount\)\)/
  );
});
