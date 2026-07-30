const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object, Boolean, Array }
  );
  return module.exports;
};

const paywall = loadTypeScriptModule(
  'services/gameplay/bosses/PaywallBossRuntime.ts'
);

test('Easy Paywall cadence remains exactly the authored Campaign loop', () => {
  const fullHealth = paywall.resolvePaywallBossCadence({
    healthRatio: 1,
    allArmorDestroyed: false,
    coreExposed: false
  });
  assert.deepEqual(
    {
      rayCycleLength: fullHealth.rayCycleLength,
      rayChargeStart: fullHealth.rayChargeStart,
      rayChargeFrames: fullHealth.rayChargeFrames,
      rayFireFrame: fullHealth.rayFireFrame,
      rayLifetimeFrames: fullHealth.rayLifetimeFrames,
      boltInterval: fullHealth.boltInterval,
      coreInterval: fullHealth.coreInterval
    },
    {
      rayCycleLength: 318,
      rayChargeStart: 165,
      rayChargeFrames: 48,
      rayFireFrame: 213,
      rayLifetimeFrames: 62,
      boltInterval: 76,
      coreInterval: 74
    }
  );

  const exposedOverdrive = paywall.resolvePaywallBossCadence({
    healthRatio: 0.2,
    allArmorDestroyed: true,
    coreExposed: true
  });
  assert.equal(exposedOverdrive.rayCycleLength, 232);
  assert.equal(exposedOverdrive.rayChargeStart, 107);
  assert.equal(exposedOverdrive.rayChargeFrames, 32);
  assert.equal(exposedOverdrive.rayFireFrame, 139);
  assert.equal(exposedOverdrive.rayLifetimeFrames, 70);
  assert.equal(exposedOverdrive.boltInterval, 46);
  assert.equal(exposedOverdrive.coreInterval, 42);
});

test('Medium and Heroic Paywall attacks accelerate with a readable ray warning', () => {
  const easyTempo = 1;
  const mediumTempo = 1.12;
  const heroicTempo = 1.28;
  assert.ok(mediumTempo > easyTempo);
  assert.ok(heroicTempo > mediumTempo);

  const resolve = (attackTempoMultiplier) => paywall.resolvePaywallBossCadence({
    healthRatio: 0.2,
    allArmorDestroyed: true,
    coreExposed: true,
    attackTempoMultiplier
  });
  const easy = resolve(easyTempo);
  const medium = resolve(mediumTempo);
  const heroic = resolve(heroicTempo);

  assert.ok(medium.rayCycleLength < easy.rayCycleLength);
  assert.ok(heroic.rayCycleLength < medium.rayCycleLength);
  assert.ok(medium.boltInterval < easy.boltInterval);
  assert.ok(heroic.boltInterval < medium.boltInterval);
  assert.ok(medium.coreInterval < easy.coreInterval);
  assert.ok(heroic.coreInterval < medium.coreInterval);
  assert.ok(medium.rayLifetimeFrames < easy.rayLifetimeFrames);
  assert.ok(heroic.rayLifetimeFrames < medium.rayLifetimeFrames);

  for (const cadence of [easy, medium, heroic]) {
    assert.ok(cadence.rayChargeFrames >= paywall.PAYWALL_BOSS_MINIMUM_RAY_WARNING_FRAMES);
    assert.equal(cadence.rayFireFrame, cadence.rayChargeStart + cadence.rayChargeFrames);
    assert.ok(cadence.rayFireFrame < cadence.rayCycleLength);
    assert.ok(cadence.rayFireFrame + cadence.rayLifetimeFrames < cadence.rayCycleLength);
  }
});

test('game runtime routes Paywall custom timers through the resolved Archive cadence', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(source, /const attackTempoMultiplier = boss\.configuredAttackTempoMultiplier/);
  assert.match(source, /resolvePaywallBossCadence\(\{/);
  assert.match(source, /boss\.attackTimer % cadence\.rayCycleLength/);
  assert.match(source, /cadence\.boltInterval/);
  assert.match(source, /cadence\.coreInterval/);
  assert.match(source, /cadence\.rayLifetimeFrames/);
});
