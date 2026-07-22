const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'game-config', 'types.ts'), 'utf8');
const recordCardApiSource = fs.readFileSync(path.join(root, 'api', 'record-card.js'), 'utf8');

const bossAssets = {
  CAMPAIGN_BOSS_ECLIPSE_ENGINE: 'bosses/frames/eclipse-engine.png',
  CAMPAIGN_BOSS_HAMMERHEAD_SIEGE: 'bosses/frames/hammerhead-siege.png',
  CAMPAIGN_BOSS_HELIX_LEVIATHAN: 'bosses/frames/helix-leviathan.png',
  CAMPAIGN_BOSS_ORBIT_GYROSCOPE: 'bosses/frames/orbit-gyroscope.png',
  CAMPAIGN_BOSS_PRISM_MOTH: 'bosses/frames/prism-moth.png',
  CAMPAIGN_BOSS_RAIL_SERPENT: 'bosses/frames/rail-serpent.png',
  CAMPAIGN_BOSS_SINGULARITY_CRAB: 'bosses/frames/singularity-crab.png',
  CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT: 'bosses/frames/tribunal-dreadnought.png'
};

const enemyAssets = {
  CAMPAIGN_ENEMY_BULLET_RING_EMITTER: 'enemies/frames/bullet-ring-emitter.png',
  CAMPAIGN_ENEMY_CRESCENT_MINELAYER: 'enemies/frames/crescent-minelayer.png',
  CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL: 'enemies/frames/dark-asteroid-sentinel.png',
  CAMPAIGN_ENEMY_DNA_CONDUCTOR: 'enemies/frames/dna-conductor.png',
  CAMPAIGN_ENEMY_LASER_HUNTER: 'enemies/frames/laser-hunter.png',
  CAMPAIGN_ENEMY_LASER_STALKER: 'enemies/frames/laser-stalker.png',
  CAMPAIGN_ENEMY_ORBIT_DISC: 'enemies/frames/orbit-disc.png',
  CAMPAIGN_ENEMY_PRISM_ARTILLERY: 'enemies/frames/prism-artillery.png',
  CAMPAIGN_ENEMY_RING_SENTINEL: 'enemies/frames/ring-sentinel.png',
  CAMPAIGN_ENEMY_SHIELD_RAMMER: 'enemies/frames/shield-rammer.png',
  CAMPAIGN_ENEMY_WALL_SNIPER_LEFT: 'enemies/frames/wall-sniper-left.png',
  CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT: 'enemies/frames/wall-sniper-right.png'
};

const expansionRoot = path.join(root, 'public', 'game-art', 'generated', 'scicon-stage20-expansion-v1');

test('the Stage 20 expansion registers every generated combat image behind a built-in catalog key', () => {
  for (const [key, relativePath] of Object.entries({ ...bossAssets, ...enemyAssets })) {
    assert.match(constantsSource, new RegExp(`${key}:\\s*\"/game-art/generated/scicon-stage20-expansion-v1/`));
    assert.match(typesSource, new RegExp(`'${key}'`));
    assert.match(catalogSource, new RegExp(`${key}: asset\\('${key}'`));
    assert.match(
      recordCardApiSource,
      new RegExp(`${key}:\\s*'/game-art/generated/scicon-stage20-expansion-v1/${relativePath.replaceAll('.', '\\.')}'`),
      `${key} server record-card mapping`
    );
    assert.equal(fs.existsSync(path.join(expansionRoot, relativePath)), true, relativePath);
  }
});

test('Max Shot exposes the complete eight-frame electric aura sequence', () => {
  assert.match(constantsSource, /POWERUP_MAX_SHOT_AURA_FRAMES:\s*Array\.from\(/);
  assert.match(typesSource, /'POWERUP_MAX_SHOT_AURA_FRAMES'/);
  assert.match(catalogSource, /POWERUP_MAX_SHOT_AURA_FRAMES: asset\('POWERUP_MAX_SHOT_AURA_FRAMES'/);
  for (let frame = 1; frame <= 8; frame += 1) {
    const filename = `max-shot-aura-${String(frame).padStart(2, '0')}.png`;
    assert.equal(fs.existsSync(path.join(expansionRoot, 'powerups', 'max-shot-aura', 'frames', filename)), true);
  }
});

test('later-stage finales use the new boss fleet while Stage 6 keeps the authored violet boss', () => {
  const expected = new Map([
    [7, 'CAMPAIGN_BOSS_RAIL_SERPENT'],
    [9, 'CAMPAIGN_BOSS_PRISM_MOTH'],
    [10, 'CAMPAIGN_BOSS_ECLIPSE_ENGINE'],
    [12, 'CAMPAIGN_BOSS_ORBIT_GYROSCOPE'],
    [13, 'CAMPAIGN_BOSS_SINGULARITY_CRAB'],
    [15, 'CAMPAIGN_BOSS_HELIX_LEVIATHAN'],
    [16, 'CAMPAIGN_BOSS_HAMMERHEAD_SIEGE'],
    [18, 'CAMPAIGN_BOSS_ECLIPSE_ENGINE'],
    [20, 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT']
  ]);
  const stageSixFinale = campaign.levels[5].waves.at(-1).events.find((event) => event.kind === 'boss');
  assert.equal(stageSixFinale.spriteKey, 'PIXI_BOSS_CITATION_FRAMES');

  for (const [order, spriteKey] of expected) {
    const level = campaign.levels.find((candidate) => candidate.order === order);
    const finale = level.waves.at(-1).events.find((event) => event.kind === 'boss');
    assert.equal(finale.spriteKey, spriteKey, level.name);
    assert.equal(level.scorecard.encounterAssetKey, spriteKey, `${level.name} scorecard`);
  }
  assert.deepEqual(
    new Set(expected.values()),
    new Set(Object.keys(bossAssets))
  );
});

test('all twelve new enemy silhouettes appear across the campaign opening formations', () => {
  const laterStages = campaign.levels.filter((level) => level.order >= 6);
  const spriteKeys = new Set(laterStages.flatMap((level) => (
    level.waves.flatMap((wave) => (
      wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => event.enemies.map((enemy) => enemy.spriteKey))
    ))
  )));

  Object.keys(enemyAssets).forEach((key) => assert.equal(spriteKeys.has(key), true, key));
  laterStages.forEach((level) => {
    const opening = level.waves[0].events.find((event) => event.kind === 'spawn');
    assert.equal(opening.enemies.some((enemy) => enemy.spriteKey.startsWith('CAMPAIGN_ENEMY_')), true, level.name);
  });
});

test('later hunter cells rotate through purpose-built mini-boss silhouettes', () => {
  const expected = new Map([
    [8, 'CAMPAIGN_ENEMY_LASER_HUNTER'],
    [10, 'CAMPAIGN_ENEMY_RING_SENTINEL'],
    [12, 'CAMPAIGN_ENEMY_PRISM_ARTILLERY'],
    [14, 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'],
    [16, 'CAMPAIGN_ENEMY_LASER_HUNTER'],
    [18, 'CAMPAIGN_ENEMY_RING_SENTINEL'],
    [20, 'CAMPAIGN_ENEMY_PRISM_ARTILLERY']
  ]);

  for (const [order, spriteKey] of expected) {
    const level = campaign.levels.find((candidate) => candidate.order === order);
    const hunter = level.waves
      .flatMap((wave) => wave.events)
      .find((event) => event.kind === 'boss' && event.bossId === 'bottleneck-drone');
    assert.equal(hunter.spriteKey, spriteKey, level.name);
  }

  for (const key of new Set(expected.values())) {
    assert.match(catalogSource, new RegExp(`${key}: asset\\([^\\n]+\\['enemy', 'boss', 'scorecard'\\]`));
  }
});
