const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const engineSource = read('services/gameLogic.ts');
const poolSource = read('services/pixi/ArcadeEffectPool.ts');
const softLightSource = read('services/pixi/SoftRadialLight.ts');

const helperStart = engineSource.indexOf('export const getPrimaryImpactShakeCooldownFrames');
const helperEnd = engineSource.indexOf('\nconst BASE_COIN_MAGNET_RADIUS', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'primary impact helpers are extractable');
const compiledHelpers = ts.transpileModule(engineSource.slice(helperStart, helperEnd), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const helperModule = { exports: {} };
vm.runInNewContext(
  `(function(exports, require, module) { ${compiledHelpers} })(module.exports, require, module);`,
  { module: helperModule, exports: helperModule.exports, require }
);

test('impact shake helpers cap rapid-fire feedback for desktop, mobile, and lean modes', () => {
  const {
    getPrimaryImpactShakeCooldownFrames,
    getPrimaryImpactShakeStrength
  } = helperModule.exports;

  assert.equal(getPrimaryImpactShakeCooldownFrames(false), 4);
  assert.equal(getPrimaryImpactShakeCooldownFrames(true), 6);
  assert.equal(getPrimaryImpactShakeStrength(false, true), 0.28);
  assert.equal(getPrimaryImpactShakeStrength(false, false), 0.2);
  assert.equal(getPrimaryImpactShakeStrength(true, true), 0.12);
  assert.equal(getPrimaryImpactShakeStrength(true, false), 0.12);
});

test('primary impact shake is preference-aware, rate-limited, and never adds hit-stop', () => {
  const methodStart = engineSource.indexOf('  registerPrimaryWeaponImpact(');
  const methodEnd = engineSource.indexOf('\n  addHitStop(', methodStart);
  const method = engineSource.slice(methodStart, methodEnd);

  assert.match(method, /!this\.polishSettings\.screenShake/);
  assert.match(method, /shot\.weaponKind !== 'pulse' && shot\.weaponKind !== 'bio-primary'/);
  assert.match(method, /shot\.shipAbilityKind/);
  assert.match(method, /shot\.squadAbilityKind/);
  assert.match(method, /target\.type !== EntityType\.BOSS/);
  assert.match(method, /target\.type !== EntityType\.MINI_BOSS/);
  assert.match(method, /!target\.isElite/);
  assert.match(method, /getPrimaryImpactShakeCooldownFrames\(this\.mobileProfile\)/);
  assert.match(method, /this\.shouldUseLeanEffects\(\)/);
  assert.match(method, /this\.lastPrimaryImpactShakeFrame = this\.frameCount/);
  assert.doesNotMatch(method, /addHitStop/);

  assert.match(engineSource, /this\.lastPrimaryImpactShakeFrame = -999/);
  assert.ok(
    (engineSource.match(/this\.registerPrimaryWeaponImpact\(target, shot\)/g) || []).length >= 2,
    'shielded and direct primary impacts both use the bounded feedback path'
  );
});

test('light pulses use a separate preallocated additive pool with mobile quality caps', () => {
  assert.match(poolSource, /const MAX_POOLED_LIGHTS = 12/);
  assert.match(poolSource, /private readonly lights: PooledLight\[\] = \[\]/);
  assert.match(poolSource, /for \(let index = 0; index < MAX_POOLED_LIGHTS; index\+\+\)/);
  assert.match(poolSource, /const visual = createSoftRadialLight\(\)/);
  assert.match(softLightSource, /halo\.blendMode = 'add'/);
  assert.match(softLightSource, /reflection\.blendMode = 'add'/);
  assert.match(poolSource, /this\.maxLights = performanceMode\s*\? \(mobileProfile \? 3 : 6\)\s*:\s*\(mobileProfile \? 5 : MAX_POOLED_LIGHTS\)/);
  assert.match(poolSource, /spawnLightPulse\(/);

  const acquireStart = poolSource.indexOf('  private acquireLight()');
  const acquireEnd = poolSource.indexOf('\n  spawnLightPulse(', acquireStart);
  const acquire = poolSource.slice(acquireStart, acquireEnd);
  assert.match(acquire, /index < this\.maxLights/);
  assert.doesNotMatch(acquire, /new (Graphics|Sprite|Container|Texture)/);

  const updateStart = poolSource.indexOf('  update(deltaMs: number)');
  const updateEnd = poolSource.indexOf('\n  destroy()', updateStart);
  const update = poolSource.slice(updateStart, updateEnd);
  assert.doesNotMatch(update, /new (Graphics|Sprite|Container|Texture)/);
});

test('pooled light pulses animate transforms without rebuilding gradient geometry per frame', () => {
  const drawStart = poolSource.indexOf('  private drawLight(');
  const drawEnd = poolSource.indexOf('\n  private spawnSpriteExplosion(', drawStart);
  const draw = poolSource.slice(drawStart, drawEnd);

  assert.match(draw, /showSoftRadialLight\(/);
  assert.match(draw, /radius \* \(0\.82 \+ progress \* 0\.08\)/);
  assert.doesNotMatch(draw, /\.clear\(\)|\.circle\(|\.ellipse\(|new (Graphics|Sprite|Container|Texture)/);
  assert.match(softLightSource, /let sharedSoftRadialTexture: Texture \| null = null/);
  assert.match(softLightSource, /context\.createRadialGradient\(/);
  assert.match(softLightSource, /sharedSoftRadialTexture = Texture\.from\(canvas\)/);
  assert.match(softLightSource, /sharedSoftRadialTexture\.source\.scaleMode = 'linear'/);
  assert.doesNotMatch(softLightSource, /BlurFilter|\.circle\(|\.ellipse\(/);
});

test('high-value effects emit bounded light while smoke and debris stay normally blended', () => {
  const blendStart = poolSource.indexOf('  private usesAdditiveBlend(');
  const blendEnd = poolSource.indexOf('\n  private acquire(', blendStart);
  const blend = poolSource.slice(blendStart, blendEnd);
  assert.match(blend, /kind !== 'smoke'/);
  assert.match(blend, /kind !== 'debris'/);
  assert.match(blend, /kind !== 'sprite-debris'/);
  assert.match(poolSource, /effect\.graphic\.blendMode = this\.usesAdditiveBlend\(kind\) \? 'add' : 'normal'/);

  for (const methodName of ['spawnExplosion', 'spawnBossExplosion', 'spawnEnemyExplosion', 'spawnImpact']) {
    const start = poolSource.indexOf(`  ${methodName}(`);
    const next = poolSource.indexOf('\n  }', start);
    assert.ok(start >= 0 && next > start, `${methodName} exists`);
    assert.match(poolSource.slice(start, next), /this\.spawnLightPulse\(/, `${methodName} emits a light pulse`);
  }
});

test('adaptive quality retires and cannot reacquire pooled effects above the new cap', () => {
  const qualityStart = poolSource.indexOf('  setQuality(');
  const qualityEnd = poolSource.indexOf('\n  private usesAdditiveBlend(', qualityStart);
  const quality = poolSource.slice(qualityStart, qualityEnd);
  assert.match(quality, /for \(let index = this\.maxEffects; index < this\.effects\.length; index\+\+\)/);
  assert.match(quality, /this\.effects\[index\]\.root\.visible = false/);
  assert.match(quality, /for \(let index = this\.maxLights; index < this\.lights\.length; index\+\+\)/);
  assert.match(quality, /hideSoftRadialLight\(this\.lights\[index\]\)/);

  const acquireStart = poolSource.indexOf('  private acquire(kind: ArcadeEffectKind)');
  const acquireEnd = poolSource.indexOf('\n  private acquireLight()', acquireStart);
  const acquire = poolSource.slice(acquireStart, acquireEnd);
  assert.match(acquire, /const reusableCount = Math\.min\(this\.effects\.length, this\.maxEffects\)/);
  assert.match(acquire, /index < reusableCount/);
  assert.doesNotMatch(acquire, /this\.effects\.find/);
  assert.doesNotMatch(acquire, /this\.effects\.reduce/);
  assert.doesNotMatch(acquire, /this\.effects\.slice/);
});
