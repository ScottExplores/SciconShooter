const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const load = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'enemyCharacteristics.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const characteristics = load();

test('every enemy role declares a characteristic, and all six are used', () => {
  const used = new Map();
  for (const role of campaign.enemyRoles) {
    assert.ok(role.characteristic, `${role.id} has no characteristic`);
    assert.ok(
      characteristics.ENEMY_CHARACTERISTICS.includes(role.characteristic),
      `${role.id} uses unknown characteristic ${role.characteristic}`
    );
    used.set(role.characteristic, (used.get(role.characteristic) ?? 0) + 1);
  }

  // A roster where everything is a diver is the problem this replaced.
  for (const id of characteristics.ENEMY_CHARACTERISTICS) {
    assert.ok(used.get(id) > 0, `no role uses the ${id} characteristic`);
  }
  assert.ok(used.get('holder') >= 3, 'the block needs enough hulls that hold it');
  assert.ok(used.get('diver') >= 3, 'something has to peel off and dive');
});

test('the six characteristics are genuinely different policies', () => {
  const profiles = characteristics.ENEMY_CHARACTERISTIC_PROFILES;

  // Holders and artillery are the wall: they never leave the block.
  assert.equal(profiles.holder.divesFromFormation, false);
  assert.equal(profiles.artillery.divesFromFormation, false);

  // A kamikaze commits; a diver comes back for another pass.
  assert.equal(profiles.kamikaze.divesFromFormation, true);
  assert.equal(profiles.kamikaze.returnsToFormation, false);
  assert.equal(profiles.diver.returnsToFormation, true);

  // Only the commander pulls its neighbours out with it.
  const leaders = characteristics.ENEMY_CHARACTERISTICS
    .filter((id) => profiles[id].leadsFormation);
  assert.deepEqual(leaders, ['commander']);

  // A hull that cannot dive has to threaten with fire instead.
  assert.ok(profiles.artillery.fireIntervalScale < profiles.holder.fireIntervalScale);
  assert.ok(profiles.diver.fireIntervalScale > profiles.holder.fireIntervalScale);

  // Every policy differs from every other on at least one axis.
  const signatures = characteristics.ENEMY_CHARACTERISTICS.map((id) => JSON.stringify({
    ...profiles[id], id: undefined, label: undefined, summary: undefined
  }));
  assert.equal(new Set(signatures).size, signatures.length, 'two characteristics are identical');
});

test('legacy enemies without a characteristic keep their old behaviour', () => {
  // Arcade and legacy hostiles carry no characteristic. Inventing a policy for
  // them would silently change every non-Campaign mode.
  assert.equal(characteristics.resolveEnemyCharacteristic(undefined), 'diver');
  assert.equal(characteristics.resolveEnemyCharacteristic(null), 'diver');
  assert.equal(characteristics.resolveEnemyCharacteristic('nonsense'), 'diver');
  assert.equal(
    characteristics.resolveEnemyCharacteristic(undefined, { entryBehavior: 'dive' }),
    'kamikaze'
  );
});

test('the engine honours the characteristic rather than storing it unused', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  // The dive gate: this is what stops the whole roster reading as one stream.
  assert.match(engine, /if \(!characteristic\.divesFromFormation\) return true;/);
  // The one-way commit.
  assert.match(engine, /returnsToFormation\) \{[\s\S]{0,120}markedForDeletion = true/);
  // Commanders pull their wing.
  assert.match(engine, /if \(characteristic\.leadsFormation\) this\.pullFormationNeighboursIntoDive/);
  // Strafe must be an offset from the slot. Adding it to enemy.x each frame
  // integrated into a drift that carried holders off the field.
  assert.match(engine, /enemy\.x = lerp\([\s\S]{0,120}targetX \+ groupSway \+ strafeOffset/);
  assert.doesNotMatch(engine, /enemy\.x \+= Math\.sin[\s\S]{0,80}holdStrafePixels/);
});
