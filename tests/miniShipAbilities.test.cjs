const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const squadSource = read('services', 'squadProgression.ts');
const engineSource = read('services', 'gameLogic.ts');
const rendererSource = read('services', 'pixi', 'PixiGameRenderer.ts');

const catalogStart = squadSource.indexOf('export const MINI_SHIP_CATALOG');
const catalogEnd = squadSource.indexOf('] as const;', catalogStart);
const catalogSource = squadSource.slice(catalogStart, catalogEnd);

test('the mini-ship catalog defines ten distinct, progressively priced roles', () => {
  assert.ok(catalogStart >= 0 && catalogEnd > catalogStart, 'mini-ship catalog must remain data driven');

  const ids = [...catalogSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
  const abilities = [...catalogSource.matchAll(/\bability:\s*'([^']+)'/g)].map((match) => match[1]);
  const costs = [...catalogSource.matchAll(/\bpurchaseCost:\s*(\d+)/g)].map((match) => Number(match[1]));

  assert.equal(ids.length, 10, 'the squad should expose all ten mini ships');
  assert.equal(new Set(ids).size, 10, 'every mini ship needs its own catalog id');
  assert.equal(abilities.length, 10, 'every mini ship needs an ability');
  assert.equal(new Set(abilities).size, 10, 'mini ships should not share generic ability identities');

  for (const requiredAbility of ['coin-magnet', 'piercing-laser', 'homing-missile', 'spread-cycle']) {
    assert.ok(abilities.includes(requiredAbility), `missing requested ${requiredAbility} role`);
  }

  assert.equal(costs.length, 10, 'every mini ship needs an unlock price');
  for (let index = 1; index < costs.length; index += 1) {
    assert.ok(
      costs[index] >= costs[index - 1],
      `later mini ships should not cost less (${costs[index - 1]} -> ${costs[index]})`
    );
  }

  assert.match(squadSource, /export const MINI_SHIP_MAX_LEVEL = 5/);
  assert.equal(
    (catalogSource.match(/maxLevel:\s*MINI_SHIP_MAX_LEVEL/g) || []).length,
    10,
    'all mini ships should use the shared five-level cap'
  );
});

test('runtime squad loadouts preserve ability identity and scale upgrades', () => {
  const loadoutStart = squadSource.indexOf('export const buildRuntimeSquadLoadout');
  const loadoutSource = squadSource.slice(loadoutStart, squadSource.indexOf('export const preloadMiniShipTextures', loadoutStart));

  assert.ok(loadoutStart >= 0, 'runtime squad loadout builder must exist');
  assert.match(loadoutSource, /ability:\s*entry\.ability/);
  assert.match(loadoutSource, /fireIntervalFrames:\s*getMiniShipFireIntervalFrames\(entry\.fireIntervalFrames, level\)/);
  assert.match(loadoutSource, /projectileDamage:\s*entry\.projectileDamage \* getMiniShipDamageMultiplier\(level\)/);
  assert.match(loadoutSource, /volleySize:\s*getMiniShipVolleySize\(entry\.ability, level\)/);
});

test('the game engine gives every catalog role a real combat branch', () => {
  const abilities = [...catalogSource.matchAll(/\bability:\s*'([^']+)'/g)].map((match) => match[1]);
  const companionStart = engineSource.indexOf('private updateSquadCompanions()');
  const companionEnd = engineSource.indexOf('isBioBeamFiring()', companionStart);
  const companionSource = engineSource.slice(companionStart, companionEnd);

  assert.ok(companionStart >= 0 && companionEnd > companionStart, 'companion combat implementation must exist');
  for (const ability of abilities) {
    assert.match(companionSource, new RegExp(`['\"]${ability}['\"]`), `${ability} needs an engine behavior`);
  }

  assert.match(companionSource, /companion\.ability/);
  assert.match(companionSource, /shotSequence/);
  assert.match(
    companionSource,
    /25\s*\*\s*Math\.PI\s*\/\s*180|Math\.PI\s*\*\s*25\s*\/\s*180|(?:degrees|deg)[A-Za-z]*\(25\)/i,
    'spread-cycle should repeat at a 25-degree side angle'
  );

  assert.match(companionSource, /pierceRemaining[\s\S]*?companion\.level/);
  assert.match(companionSource, /homing-missile[\s\S]*?EntityType\.MISSILE/);

  const coinStart = engineSource.indexOf('private updateCoinEntity(coin: Entity)');
  const coinEnd = engineSource.indexOf('private collectCoinIfReachedPlayer', coinStart);
  const coinSource = engineSource.slice(coinStart, coinEnd);
  assert.ok(coinStart >= 0 && coinEnd > coinStart, 'shared coin movement branch must exist');
  assert.match(coinSource, /coin-magnet|squad[^\n]*(?:magnet|Magnet)|magnet[^\n]*companion/i);
  assert.match(coinSource, /(?:magnetCompanion|companion)\?*\.level|MagnetLevel|magnetLevel/, 'magnet range or pull should improve with level');

  const collisionStart = engineSource.indexOf('checkCollisions()');
  const collisionSource = engineSource.slice(collisionStart);
  assert.match(collisionSource, /shot\.pierceRemaining\s*>\s*0/);
  assert.match(collisionSource, /shot\.hitTargetIds/);

  const homingStart = engineSource.indexOf('if (e.type === EntityType.MISSILE)');
  const homingSource = engineSource.slice(homingStart, engineSource.indexOf('if (e.type === EntityType.ENEMY_DRONE', homingStart));
  assert.match(homingSource, /homingTargetsBuffer/);
  assert.match(homingSource, /Math\.atan2/);

  assert.match(rendererSource, /entity\.squadAbilityKind/);
  ['homing-missile', 'piercing-laser', 'coin-magnet', 'heavy-cannon'].forEach((ability) => {
    assert.match(rendererSource, new RegExp(`['\"]${ability}['\"]`));
  });
});

test('enemy power-up rolls include a rare existing extra-life drop', () => {
  const campaign = JSON.parse(read('game-config', 'campaign.json'));
  const configuredPowerups = campaign.levels.flatMap((level) => level.availablePowerupIds || []);
  assert.ok(configuredPowerups.includes('extra-life'));

  const extraLifeWeight = engineSource.match(/\[PowerupType\.EXTRA_LIFE,\s*(0?\.\d+)\]/);
  assert.ok(extraLifeWeight, 'extra life must participate in weighted enemy power-up rolls');
  assert.ok(Number(extraLifeWeight[1]) > 0 && Number(extraLifeWeight[1]) <= 0.05, 'extra life should be possible but rare');
  assert.match(engineSource, /'extra-life':\s*PowerupType\.EXTRA_LIFE/);
  assert.match(engineSource, /type\s*===\s*PowerupType\.EXTRA_LIFE/);

  const destroyStart = engineSource.indexOf('handleEnemyDestroyed(target: Entity)');
  const destroyEnd = engineSource.indexOf('\n  spawn', destroyStart);
  const destroySource = engineSource.slice(destroyStart, destroyEnd > destroyStart ? destroyEnd : undefined);
  assert.match(destroySource, /target\.type\s*!==\s*EntityType\.BOSS[\s\S]*?spawnPowerup\(target\.x,\s*target\.y\)/);
  assert.match(engineSource, /EXTRA_LIFE_DROP_CHANCE\s*=\s*0?\.\d+/);
  assert.match(destroySource, /spawnPowerup\(centerX\s*-\s*18,\s*centerY\s*-\s*18,\s*'extra-life'\)/);

  assert.ok(
    fs.existsSync(path.join(root, 'public', 'game-art', 'powerups', 'extra-life.png')),
    'the existing extra-life sprite should remain available to the drop renderer'
  );
});
