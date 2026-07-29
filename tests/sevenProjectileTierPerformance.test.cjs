const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileModule = (relativePath, dependencies = {}) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    {
      module: moduleBox,
      exports: moduleBox.exports,
      require: (request) => dependencies[request] ?? require(request),
      Math,
      Number,
      Array
    }
  );
  return moduleBox.exports;
};

const weapon = compileModule('services/weaponTierProgression.ts');
const combat = compileModule('services/campaignCombatProgression.ts', {
  './weaponTierProgression': weapon
});
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

test('mobile and desktop Tier-7 Triple + Max Shot stay inside bounded simulation and render budgets', () => {
  const cadence = weapon.getFireRateIntervalFrames(weapon.FIRE_RATE_MAX_LEVEL);
  const lanes = combat.getPrimaryVolleySimulationEntityCount(true);
  const visualRoundsPerStandardLane = weapon.FIRE_RATE_MAX_VOLLEY_SIZE
    * combat.MAX_SHOT_VOLLEY_MULTIPLIER;
  const visualRoundsPerBioLane = visualRoundsPerStandardLane * 2;
  const viewports = [
    { id: 'mobile', height: 844, simulationBudget: 96, standardVisualBudget: 900, bioVisualBudget: 1800 },
    { id: 'desktop', height: 720, simulationBudget: 148, standardVisualBudget: 800, bioVisualBudget: 1600 }
  ];

  assert.equal(cadence, 4);
  assert.equal(lanes, 3);
  viewports.forEach((viewport) => {
    const angledFlightFrames = Math.ceil((viewport.height * 0.88) / (10 * Math.cos(20 * Math.PI / 180)));
    const activeVolleys = Math.ceil(Math.min(combat.MAX_SHOT_BUNDLE_LIFETIME_FRAMES, angledFlightFrames) / cadence);
    const simulationEntities = activeVolleys * lanes;
    assert.ok(simulationEntities <= viewport.simulationBudget, `${viewport.id} collision budget`);
    assert.ok(
      simulationEntities * visualRoundsPerStandardLane <= viewport.standardVisualBudget,
      `${viewport.id} standard render budget`
    );
    assert.ok(
      simulationEntities * visualRoundsPerBioLane <= viewport.bioVisualBudget,
      `${viewport.id} BIO render budget`
    );
  });

  assert.match(rendererSource, /ensureProjectileCopySprites\(view, visualPattern\.length\)/);
  assert.match(engineSource, /getPrimaryVolleySimulationEntityCount\(overdriveSpread\)/);
  assert.match(engineSource, /index === 0,[\s\S]*'bio-primary'/);
  assert.match(engineSource, /playSound: false,[\s\S]*maxShotVisualPattern/);
});

test('seven-tier TTK improves monotonically while Tier 7 remains below twice legacy max DPS', () => {
  const tierStartLevels = [0, 7, 14, 21, 28, 35, 42];
  const dps = tierStartLevels.map((level) => {
    const volleySize = weapon.getFireRateVolleySize(level);
    return weapon.getFireRateVolleyDamageMultiplier(volleySize)
      * 60
      / weapon.getFireRateIntervalFrames(level);
  });
  dps.forEach((value, index) => {
    if (index > 0) assert.ok(value > dps[index - 1], `Tier ${index + 1} should improve TTK`);
  });

  const legacyMaxDps = weapon.getFireRateVolleyDamageMultiplier(3)
    * 60
    / weapon.getFireRateIntervalFrames(21);
  const newMaxDps = weapon.getFireRateVolleyDamageMultiplier(7)
    * 60
    / weapon.getFireRateIntervalFrames(49);
  assert.ok(newMaxDps < legacyMaxDps * 2, 'advanced tiers add less than 2x the shipped max DPS');

  const representativeBossHp = 2_100;
  const bossDamageBonus = 1.35;
  const maxTierTtkSeconds = representativeBossHp / (newMaxDps * bossDamageBonus);
  assert.ok(maxTierTtkSeconds > 15 && maxTierTtkSeconds < 30);
  assert.ok(weapon.getFireRateProjectileDamageMultiplier(7) < 0.65, 'seven visible rounds are not seven full hits');
});
