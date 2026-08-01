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

test('the Fire Rate track also tightens the signature cooldown', () => {
  const {
    getShipAbilityCooldownFrames,
    SHIP_ABILITY_COOLDOWN_MIN_MULTIPLIER: floor
  } = loadShipAbilities();
  const base = 960;
  const maxLevel = 49;

  assert.equal(getShipAbilityCooldownFrames(base, 0, maxLevel), base, 'level 0 is the base cooldown');

  const mid = getShipAbilityCooldownFrames(base, 25, maxLevel);
  assert.ok(mid < base, 'mid track is faster than base');
  assert.ok(mid > base * floor, 'mid track has not reached the floor');

  assert.equal(
    getShipAbilityCooldownFrames(base, maxLevel, maxLevel),
    Math.round(base * floor),
    'the maxed track lands exactly on the floor'
  );

  // Monotonic, and never below the floor no matter what is passed in.
  let previous = Number.POSITIVE_INFINITY;
  for (let level = 0; level <= maxLevel; level += 1) {
    const frames = getShipAbilityCooldownFrames(base, level, maxLevel);
    assert.ok(frames <= previous, `cooldown never increases with level (level ${level})`);
    assert.ok(frames >= Math.round(base * floor), `cooldown never dips under the floor (level ${level})`);
    previous = frames;
  }
  assert.equal(getShipAbilityCooldownFrames(base, 999, maxLevel), Math.round(base * floor));
  assert.equal(getShipAbilityCooldownFrames(base, -5, maxLevel), base);
});

test('the engine routes both cooldown writes through the upgrade-aware helper', () => {
  const engine = read('services/gameLogic.ts');
  assert.match(engine, /getShipAbilityCooldownFrames\(baseCooldownFrames: number\)/);
  assert.match(engine, /this\.stats\.upgrades\?\.fireRate \|\| 0,\s*\n\s*FIRE_RATE_MAX_LEVEL/);
  // Loadout swap and ability launch must both use it, or the HUD ring and the
  // real cooldown disagree.
  assert.match(engine, /shipAbilityCooldownMax = this\.getShipAbilityCooldownFrames\(/);
  assert.match(engine, /const abilityCooldownFrames = this\.getShipAbilityCooldownFrames\(ability\.cooldownFrames\)/);
  assert.doesNotMatch(engine, /shipAbilityCooldownMax = ability\.cooldownFrames/);
});
