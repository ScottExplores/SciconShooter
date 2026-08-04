const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const loadShipAbilities = () => {
  const compiled = ts.transpileModule(read('services/shipAbilityService.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Object, Array, Number, String }
  );
  return module.exports;
};

test('rarer hulls recharge their signature faster, so the Hangar chase is progression', () => {
  const { SHIP_ABILITY_DEFINITIONS: definitions } = loadShipAbilities();

  const ladder = ['researchhub', 'bio', 'eth', 'btc']
    .map((shipId) => definitions[shipId].cooldownSeconds);

  // Every hull used to share the ResearchHub cooldown, which made a hard-won
  // BTC hull feel identical to the starter.
  for (let index = 1; index < ladder.length; index += 1) {
    assert.ok(
      ladder[index] < ladder[index - 1],
      `cooldown must strictly improve down the ladder, got ${ladder.join(' -> ')}`
    );
  }

  // Cooldown frames stay consistent with the advertised seconds.
  for (const shipId of ['researchhub', 'bio', 'eth', 'btc']) {
    const ability = definitions[shipId];
    assert.equal(ability.cooldownFrames, ability.cooldownSeconds * 60, `${shipId} frames match seconds`);
  }

  // Each hull keeps a distinct signature identity, not just a different timer.
  const ids = new Set(['researchhub', 'bio', 'eth', 'btc'].map((shipId) => definitions[shipId].id));
  assert.equal(ids.size, 4);
});

test('the Signature Move track owns its four cooldown reductions', () => {
  const {
    getShipAbilityCooldownFrames,
    SHIP_ABILITY_COOLDOWN_MIN_MULTIPLIER: floor,
    SHIP_ABILITY_COOLDOWN_STEP_BY_LEVEL: cooldownSteps,
    SHIP_ABILITY_MAX_LEVEL: maxLevel
  } = loadShipAbilities();
  const base = 960;

  assert.equal(maxLevel, 6);
  assert.deepEqual(Array.from(cooldownSteps), [0, 1, 1, 2, 2, 3, 4]);
  assert.equal(getShipAbilityCooldownFrames(base, 0), base, 'level 0 is the base cooldown');

  assert.equal(
    getShipAbilityCooldownFrames(base, maxLevel),
    Math.round(base * floor),
    'the maxed track lands exactly on the floor'
  );

  const ladder = Array.from(
    { length: maxLevel + 1 },
    (_, level) => getShipAbilityCooldownFrames(base, level)
  );
  assert.deepEqual(ladder, [960, 876, 876, 792, 792, 708, 624]);
  assert.equal(getShipAbilityCooldownFrames(base, 999), Math.round(base * floor));
  assert.equal(getShipAbilityCooldownFrames(base, -5), base);
});

test('the pure upgrade profile drives Spark, Bolt, Charged, and Hit I-IV previews', () => {
  const {
    getShipAbilityUpgradeProfile,
    getShipAbilityDamageMultiplier,
    getShipAbilityRadiusMultiplier
  } = loadShipAbilities();
  const profiles = Array.from({ length: 7 }, (_, level) => getShipAbilityUpgradeProfile(level));

  assert.deepEqual(
    profiles.map((profile) => profile.projectileTier),
    ['spark', 'spark', 'bolt', 'bolt', 'charged', 'charged', 'charged']
  );
  assert.deepEqual(
    profiles.map((profile) => profile.impactTier),
    [1, 1, 2, 2, 3, 3, 4]
  );
  assert.deepEqual(
    profiles.map((profile) => profile.cooldownStep),
    [0, 1, 1, 2, 2, 3, 4]
  );
  assert.equal(getShipAbilityDamageMultiplier(6), 2.4);
  assert.equal(getShipAbilityRadiusMultiplier(6), 1.55);
  assert.equal(getShipAbilityUpgradeProfile(-50).level, 0);
  assert.equal(getShipAbilityUpgradeProfile(999).level, 6);
});

test('the engine routes both cooldown writes through the upgrade-aware helper', () => {
  const engine = read('services/gameLogic.ts');
  assert.match(engine, /getShipAbilityCooldownFrames\(baseCooldownFrames: number\)/);
  assert.match(engine, /getShipAbilityCooldownFrames\([\s\S]*?this\.stats\.upgrades\?\.ability \|\| 0/);
  assert.doesNotMatch(engine, /getShipAbilityCooldownFrames\([\s\S]{0,160}FIRE_RATE_MAX_LEVEL/);
  // Loadout swap and ability launch must both use it, or the HUD ring and the
  // real cooldown disagree.
  assert.match(engine, /shipAbilityCooldownMax = this\.getShipAbilityCooldownFrames\(/);
  assert.match(engine, /const abilityCooldownFrames = this\.getShipAbilityCooldownFrames\(ability\.cooldownFrames\)/);
  assert.doesNotMatch(engine, /shipAbilityCooldownMax = ability\.cooldownFrames/);
});
