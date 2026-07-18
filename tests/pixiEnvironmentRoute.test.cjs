const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('campaign follows a coherent space-to-planet-to-space environment route', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const environment = read('services/pixi/PixiEnvironment.ts');

  assert.deepEqual(
    campaign.levels[0].waves.map((wave) => wave.backgroundId),
    ['open-orbit', 'citation-storm', 'paywall-siege', 'open-galaxy', 'bastion-protocol']
  );
  assert.match(environment, /orbital-departure/);
  assert.match(environment, /deep-nebula/);
  assert.match(environment, /planetary-descent/);
  assert.match(environment, /biosphere-expedition/);
  assert.match(environment, /orbital-return/);
});

test('long round masters do not hard-wrap and props stay inside their terrain family', () => {
  const constants = read('constants.ts');
  const environment = read('services/pixi/PixiEnvironment.ts');

  for (const asset of [
    'space-round-master-512x4096.png',
    'desert-round-master-512x4096.png',
    'river-round-master-512x4096.png',
    'space-props-atlas-3x3.png',
    'desert-props-atlas-3x3.png',
    'river-props-atlas-3x3.png'
  ]) {
    assert.match(constants, new RegExp(asset.replaceAll('.', '\\.')));
  }

  assert.match(environment, /loop: false/);
  assert.match(environment, /Math\.min\(maxTravel, startingOffset \+ localFrame \* layer\.speed\)/);
  assert.match(environment, /prop\.terrain === profile\.terrain/);
  assert.match(environment, /TERRAIN_PROP_ATLASES/);
});

test('ground sectors use terrain aircraft and the river checkpoint is not an asteroid belt', () => {
  const campaign = JSON.parse(read('game-config/campaign.json'));
  const [, , desertWave, riverWave] = campaign.levels[0].waves;

  for (const wave of [desertWave, riverWave]) {
    const opening = wave.events.find((event) => event.id === `${wave.id}-opening-drifters`);
    assert.ok(opening.enemies.every((enemy) => (
      enemy.spriteKey.startsWith('PIXI_JET_') || enemy.spriteKey === 'ENEMY_JOURNAL_FRAMES'
    )));
  }

  assert.equal(riverWave.events.some((event) => event.kind === 'asteroid-belt'), false);
  const ambush = riverWave.events.find((event) => event.id === 'open-galaxy-river-ambush');
  assert.equal(ambush.kind, 'spawn');
  assert.deepEqual(
    ambush.enemies.map((enemy) => enemy.spriteKey),
    ['PIXI_JET_SCOUT_FRAMES', 'ENEMY_JOURNAL_FRAMES']
  );
});
