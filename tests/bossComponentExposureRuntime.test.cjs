const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'bosses', 'BossComponentRuntime.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Boolean, Math, Number, Object }
  );
  return moduleBox.exports;
};

const createComponent = (overrides = {}) => ({
  id: 'helmet',
  hp: 40,
  maxHp: 40,
  destroyed: false,
  exposed: true,
  ...overrides
});

test('weak-point exposure is reversible without mutating health or destruction', () => {
  const {
    isBossComponentTargetable,
    setBossComponentExposure
  } = loadRuntime();
  const component = createComponent();

  assert.equal(setBossComponentExposure(component, false), false);
  assert.equal(isBossComponentTargetable(component), false);
  assert.equal(component.hp, 40);
  assert.equal(component.destroyed, false);

  assert.equal(setBossComponentExposure(component, true), true);
  assert.equal(isBossComponentTargetable(component), true);
  assert.equal(component.hp, 40);
  assert.equal(component.destroyed, false);
});

test('closed components ignore damage and destruction remains irreversible', () => {
  const {
    applyBossComponentDamage,
    setBossComponentExposure
  } = loadRuntime();
  const component = createComponent({ exposed: false });

  const closedResult = applyBossComponentDamage(component, 100);
  assert.equal(closedResult.applied, false);
  assert.equal(closedResult.destroyedNow, false);
  assert.equal(component.hp, 40);
  assert.equal(component.destroyed, false);
  assert.equal(component.exposed, false);

  setBossComponentExposure(component, true);
  const hitResult = applyBossComponentDamage(component, 10, 2);
  assert.equal(hitResult.applied, true);
  assert.equal(hitResult.remainingHealth, 20);
  assert.equal(hitResult.destroyedNow, false);

  const fatalResult = applyBossComponentDamage(component, 25);
  assert.equal(fatalResult.applied, true);
  assert.equal(fatalResult.remainingHealth, 0);
  assert.equal(fatalResult.destroyedNow, true);
  assert.equal(component.destroyed, true);
  assert.equal(component.exposed, false);

  assert.equal(setBossComponentExposure(component, true), false);
  assert.equal(component.hp, 0);
  assert.equal(component.destroyed, true);
  assert.equal(component.exposed, false);
});

test('helmet hull protection depends on destruction, not reversible exposure', () => {
  const { isBossHullProtectedByComponents } = loadRuntime();

  assert.equal(
    isBossHullProtectedByComponents([createComponent({ exposed: false })]),
    true,
    'an intact sealed helmet must still protect the hull'
  );
  assert.equal(
    isBossHullProtectedByComponents([createComponent({ destroyed: true, exposed: false, hp: 0 })]),
    false,
    'destroying the helmet must permanently expose the hull'
  );
  assert.equal(
    isBossHullProtectedByComponents([
      createComponent({ id: 'left-cannon', exposed: false }),
      createComponent({ id: 'right-cannon', exposed: true })
    ]),
    false,
    'weapon components must never protect the hull'
  );
});

test('engine and renderer integrate exposure without reusing destruction state', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const renderer = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );
  const weakPointDispatch = engine.slice(
    engine.indexOf("case 'set-weak-point':"),
    engine.indexOf("case 'set-movement':")
  );
  const componentDamage = engine.slice(
    engine.indexOf('damageBossComponent(boss: Entity'),
    engine.indexOf('isBossHullProtected(boss: Entity)')
  );

  assert.match(weakPointDispatch, /setBossComponentExposure\(component, enabled\)/);
  assert.doesNotMatch(weakPointDispatch, /component\.(?:destroyed|hp)\s*=/);
  assert.match(componentDamage, /if \(!damageResult\.applied\) return;/);
  assert.ok(
    componentDamage.indexOf('if (!damageResult.applied) return;')
      < componentDamage.indexOf('this.telemetrySink.record'),
    'closed-component early return must precede telemetry'
  );
  assert.match(engine, /\.filter\(isBossComponentTargetable\)/);
  assert.match(renderer, /component\.exposed \? '#fef08a' : '#64748b'/);
  assert.match(renderer, /nextState\[component\.id\] = component\.destroyed/);
});
