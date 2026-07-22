const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const loadTypeScriptModule = (...segments) => {
  const source = read(...segments);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
    module: moduleBox,
    require
  });
  return moduleBox.exports;
};

const powerupRuntime = loadTypeScriptModule('services', 'powerupRuntime.ts');
const engine = read('services', 'gameLogic.ts');
const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');

test('Max Shot shield remains authoritative for exactly its positive timer frames', () => {
  const timers = new Map([['MAX_SHOT', 3]]);
  const active = () => powerupRuntime.isMaxShotShieldActive(timers, 'MAX_SHOT');

  assert.equal(active(), true);
  powerupRuntime.tickTimedPowerups(timers);
  assert.equal(timers.get('MAX_SHOT'), 2);
  assert.equal(active(), true);
  powerupRuntime.tickTimedPowerups(timers);
  assert.equal(timers.get('MAX_SHOT'), 1);
  assert.equal(active(), true);
  powerupRuntime.tickTimedPowerups(timers);
  assert.equal(active(), false);
  assert.equal(timers.has('MAX_SHOT'), false, 'expiry removes stale shield state in the same fixed step');
});

test('timed power-up ticking deterministically removes zero and malformed entries', () => {
  const timers = new Map([
    ['ZERO', 0],
    ['NEGATIVE', -4],
    ['INVALID', Number.NaN],
    ['ACTIVE', 2]
  ]);

  powerupRuntime.tickTimedPowerups(timers);
  assert.deepEqual(Array.from(timers.entries()), [['ACTIVE', 1]]);
  powerupRuntime.tickTimedPowerups(timers);
  assert.equal(timers.size, 0);
});

test('combat immunity and the reused blue aura share the same Max Shot state', () => {
  const timerTick = engine.indexOf('tickTimedPowerups(this.activePowerups)');
  const fireRead = engine.indexOf("const primaryFireHeld = Boolean(this.keys[' ']", timerTick);
  assert.ok(timerTick >= 0 && fireRead > timerTick, 'expiry is resolved before firing and collision work');
  assert.match(
    engine,
    /const isInvincible = \(this\.previewMode && this\.previewInvincible\)[\s\S]*?\|\| this\.hasMaxShotShield\(\)/
  );
  assert.match(engine, /hasMaxShotShield\(\) \{[\s\S]*?isMaxShotShieldActive/);
  assert.match(renderer, /private readonly maxShotAura = new Sprite\(Texture\.WHITE\)/);
  assert.match(renderer, /private readonly maxShotScreenGlow = new Graphics\(\)/);
  assert.match(renderer, /const active = engine\.hasMaxShotShield\(\)/);
  assert.match(renderer, /if \(!active \|\| !auraTexture\) \{[\s\S]*?maxShotAura\.alpha = 0;[\s\S]*?maxShotScreenGlow\.clear\(\)/);
});
