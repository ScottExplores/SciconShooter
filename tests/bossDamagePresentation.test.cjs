const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'services', 'pixi', 'BossDamagePresentation.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
  { module: moduleBox, exports: moduleBox.exports, require, Number, Math, Object }
);

const {
  BOSS_LOW_HEALTH_DAMAGE_THRESHOLD,
  BOSS_DAMAGE_NORMAL_CADENCE_FRAMES,
  BOSS_DAMAGE_PERFORMANCE_CADENCE_FRAMES,
  sampleBossLowHealthDamageCue
} = moduleBox.exports;

test('boss low-health wear uses a bounded deterministic sprite cue', () => {
  assert.equal(BOSS_LOW_HEALTH_DAMAGE_THRESHOLD, 0.52);
  assert.equal(BOSS_DAMAGE_NORMAL_CADENCE_FRAMES, 30);
  assert.equal(BOSS_DAMAGE_PERFORMANCE_CADENCE_FRAMES, 48);
  assert.equal(sampleBossLowHealthDamageCue({
    healthRatio: 0.52,
    frameCount: 30,
    performanceMode: false,
    bossId: 7,
    bossWidth: 200
  }), undefined);
  assert.equal(sampleBossLowHealthDamageCue({
    healthRatio: 0.51,
    frameCount: 29,
    performanceMode: false,
    bossId: 7,
    bossWidth: 200
  }), undefined);

  const normal = sampleBossLowHealthDamageCue({
    healthRatio: 0.25,
    frameCount: 30,
    performanceMode: false,
    bossId: 7,
    bossWidth: 200
  });
  const repeated = sampleBossLowHealthDamageCue({
    healthRatio: 0.25,
    frameCount: 30,
    performanceMode: false,
    bossId: 7,
    bossWidth: 200
  });
  assert.deepEqual(normal, repeated);
  assert.ok(normal.xRatio >= 0.39 && normal.xRatio <= 0.61);
  assert.ok(normal.yRatio >= 0.36 && normal.yRatio <= 0.61);
  assert.equal(normal.size, 20);
  assert.equal(normal.durationMs, 220);
  assert.equal(sampleBossLowHealthDamageCue({
    healthRatio: 0.25,
    frameCount: 47,
    performanceMode: true,
    bossId: 7,
    bossWidth: 200
  }), undefined);
  assert.ok(sampleBossLowHealthDamageCue({
    healthRatio: 0.25,
    frameCount: 48,
    performanceMode: true,
    bossId: 7,
    bossWidth: 200
  }));
  assert.equal(sampleBossLowHealthDamageCue({
    healthRatio: 0.1,
    frameCount: 60,
    performanceMode: false,
    bossId: 1,
    bossWidth: 20
  }).size, 12);
  assert.equal(sampleBossLowHealthDamageCue({
    healthRatio: 0.1,
    frameCount: 60,
    performanceMode: false,
    bossId: 1,
    bossWidth: 600
  }).size, 24);
});

test('shared boss wear path renders registered pixels and not procedural spark lines', () => {
  const poolSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'ArcadeEffectPool.ts'), 'utf8');
  const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');
  const methodStart = poolSource.indexOf('  spawnBossDamageSprite(');
  const methodEnd = poolSource.indexOf('\n  private drawLight(', methodStart);
  const method = poolSource.slice(methodStart, methodEnd);
  assert.match(method, /this\.spawnBossSpriteExplosion\(x, y, size, duration\)/);
  assert.doesNotMatch(method, /new (Graphics|Sprite|Container|Texture)/);

  const blockStart = rendererSource.indexOf('    const damageCue = sampleBossLowHealthDamageCue({');
  const blockEnd = rendererSource.indexOf('\n  }', blockStart);
  const block = rendererSource.slice(blockStart, blockEnd);
  assert.match(block, /spawnBossDamageSprite/);
  assert.doesNotMatch(block, /spawn\('spark'/);
  for (let index = 1; index <= 5; index += 1) {
    assert.equal(
      fs.existsSync(path.join(root, 'public', 'game-art', 'pixi', 'effects', 'boss-damage', `frame-${index}.png`)),
      true
    );
  }
});
