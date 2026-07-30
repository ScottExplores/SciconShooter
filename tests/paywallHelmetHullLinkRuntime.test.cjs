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

const createHelmet = () => ({
  id: 'helmet',
  hp: 144,
  maxHp: 144,
  destroyed: false,
  exposed: true
});

test('Paywall helmet is hull-linked and never protects the hull', () => {
  const { isBossHullProtectedByComponents } = loadRuntime();
  const helmet = createHelmet();

  assert.equal(
    isBossHullProtectedByComponents([helmet]),
    true,
    'independent helmets retain the legacy protection contract'
  );
  assert.equal(
    isBossHullProtectedByComponents([helmet], true),
    false,
    'a hull-linked Paywall helmet must never intercept hull damage'
  );
});

test('Paywall helmet detaches once when hull health first reaches 90 percent', () => {
  const {
    PAYWALL_HELMET_DETACH_HEALTH_RATIO,
    syncHullLinkedHelmetToHullHealth
  } = loadRuntime();
  const helmet = createHelmet();
  const components = [helmet];

  assert.equal(PAYWALL_HELMET_DETACH_HEALTH_RATIO, 0.9);
  assert.equal(syncHullLinkedHelmetToHullHealth(components, 721, 800), undefined);
  assert.equal(helmet.destroyed, false);
  assert.equal(helmet.hp, 144);

  assert.equal(syncHullLinkedHelmetToHullHealth(components, 720, 800), helmet);
  assert.equal(helmet.destroyed, true);
  assert.equal(helmet.exposed, false);
  assert.equal(helmet.hp, 0);

  assert.equal(
    syncHullLinkedHelmetToHullHealth(components, 640, 800),
    undefined,
    'a destroyed helmet must not emit a second detach transition'
  );
});

test('engine routes Paywall helmet hits into hull damage and renderer hides full-boss part bars', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const renderer = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );
  const componentDamage = engine.slice(
    engine.indexOf('damageBossComponent(boss: Entity'),
    engine.indexOf('detachPaywallHelmetForHullHealth(boss: Entity)')
  );
  const hullDamage = engine.slice(
    engine.indexOf('isBossHullProtected(boss: Entity)'),
    engine.indexOf('spawnBoss(configured?: RuntimeBossEvent')
  );

  assert.match(
    componentDamage,
    /boss\.bossRigId === 'paywall-siege' && component\.id === 'helmet'[\s\S]*?this\.damageBossHull\(boss, damage\);[\s\S]*?return;/
  );
  assert.ok(
    componentDamage.indexOf("boss.bossRigId === 'paywall-siege'")
      < componentDamage.indexOf('applyBossComponentDamage('),
    'helmet routing must happen before independent component damage'
  );
  assert.match(
    hullDamage,
    /isBossHullProtectedByComponents\([\s\S]*?boss\.bossRigId === 'paywall-siege'[\s\S]*?\)/
  );
  assert.match(
    hullDamage,
    /boss\.hp -= damage;\s*this\.detachPaywallHelmetForHullHealth\(boss\);/
  );
  assert.match(
    renderer,
    /shouldDrawBossComponentHealthBars\(entity: Entity\)[\s\S]*?return entity\.type === EntityType\.MINI_BOSS;/
  );
  assert.match(
    renderer,
    /if \(this\.shouldDrawBossComponentHealthBars\(entity\)\) \{\s*this\.drawBossComponentHealthBar\(/
  );
});
