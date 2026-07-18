const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const campaign = JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const collectKeysAndStrings = (value, keys = [], strings = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeysAndStrings(item, keys, strings));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      keys.push(key);
      collectKeysAndStrings(item, keys, strings);
    });
  } else if (typeof value === 'string') {
    strings.push(value);
  }
  return { keys, strings };
};

test('tracked campaign contains four sector waves plus the Bastion Protocol endurance wave', () => {
  assert.equal(campaign.schemaVersion, 1);
  assert.equal(campaign.revision, 11);
  assert.equal(campaign.fps, 60);
  assert.equal(campaign.hudAssets.bombIconAssetKey, 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F');
  assert.equal(campaign.levels.length, 1);

  const level = campaign.levels[0];
  assert.equal(level.id, 'operation-open-galaxy');
  assert.equal(level.loopWaves, true);
  assert.equal(level.durationSeconds, null);
  assert.deepEqual(
    level.waves.map((wave) => wave.name),
    ['OPEN ORBIT', 'CITATION STORM', 'PAYWALL SIEGE', 'OPEN GALAXY', 'BASTION PROTOCOL']
  );
  assert.deepEqual(level.waves.map((wave) => wave.order), [1, 2, 3, 4, 5]);
  assert.deepEqual(level.waves.map((wave) => wave.scoreMultiplier), [1, 2, 4, 8, 16]);
  assert.equal(level.startingDifficulty, 1);
  assert.deepEqual(level.waves.map((wave) => wave.difficultyMultiplier), [1, 1, 1, 1, 1]);
});

test('the four sector waves expose editable spawns, mini-bosses, checkpoints, final bosses, and power-ups', () => {
  const waves = campaign.levels[0].waves.slice(0, 4);

  waves.forEach((wave, index) => {
    assert.equal(wave.durationSeconds, 60);
    assert.ok(wave.events.some((event) => event.kind === 'spawn'));
    assert.ok(wave.events.some((event) => event.kind === 'powerup'));
    assert.ok(wave.events.some((event) => event.kind === 'boss' && event.bossId === 'bottleneck-drone'));
    assert.ok(wave.events.some((event) => event.kind === 'boss' && event.bossId === 'gatekeeper'));

    const hasCheckpoint = index === 3
      ? wave.events.some((event) => event.id === 'open-galaxy-river-ambush' && event.kind === 'spawn')
      : wave.events.some((event) => (
        index === 1
          ? event.kind === 'asteroid-belt'
          : event.kind === 'boss' && event.bossId === 'paywall-wall'
      ));
    assert.ok(hasCheckpoint);

    const starts = wave.events.map((event) => event.startSeconds);
    assert.deepEqual(starts, [...starts].sort((left, right) => left - right));
    assert.ok(wave.events.every((event) => event.startSeconds <= wave.durationSeconds));
  });
});

test('Wave 5 is a finite escalating Paywall Bastion endurance encounter', () => {
  const wave = campaign.levels[0].waves[4];
  const walls = wave.events.filter((event) => event.kind === 'boss' && event.bossId === 'paywall-wall');
  const gatekeeper = wave.events.find((event) => event.id === 'bastion-protocol-gatekeeper');

  assert.equal(wave.id, 'bastion-protocol');
  assert.equal(wave.durationSeconds, 8);
  assert.ok(wave.events.some((event) => event.kind === 'powerup'));
  assert.equal(walls.length, 4);
  assert.deepEqual(walls.map((event) => event.count), [1, 2, 3, 4]);
  assert.deepEqual(walls.map((event) => event.spriteKey), Array(4).fill('PAYWALL_BASTION_FRAMES'));
  assert.ok(walls.every((event) => event.blocksWaveClock));
  assert.ok(walls.every((event, index) => index === 0 || event.health > walls[index - 1].health));
  assert.ok(walls.every((event, index) => index === 0 || event.speed > walls[index - 1].speed));
  assert.ok(gatekeeper);
  assert.equal(gatekeeper.bossId, 'gatekeeper');
  assert.equal(gatekeeper.movementPatternId, 'arena-roam');
  assert.equal(gatekeeper.spriteKey, 'PIXI_BOSS_CITATION_FRAMES');
  const starts = wave.events.map((event) => event.startSeconds);
  assert.deepEqual(starts, [...starts].sort((left, right) => left - right));
});

test('browser campaign validation permits multiple Paywall Bastion rows', () => {
  const validator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');
  const directorValidator = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');

  assert.match(validator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(String\(event\.bossId\)\)/);
  assert.match(directorValidator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(event\.bossId\)/);
  assert.match(directorValidator, /'bastion-protocol'/);
});

test('later waves escalate Bottleneck Drones from a relay to a simultaneous pair', () => {
  const [, citationStorm, paywallSiege] = campaign.levels[0].waves;
  const citationBottlenecks = citationStorm.events.filter((event) => (
    event.kind === 'boss' && event.bossId === 'bottleneck-drone'
  ));
  const siegeBottlenecks = paywallSiege.events.filter((event) => (
    event.kind === 'boss' && event.bossId === 'bottleneck-drone'
  ));

  assert.deepEqual(citationBottlenecks.map((event) => event.startSeconds), [19.8, 21.8]);
  assert.deepEqual(citationBottlenecks.map((event) => event.count ?? 1), [1, 1]);
  assert.equal(new Set(citationBottlenecks.map((event) => event.id)).size, 2);
  assert.equal(siegeBottlenecks.length, 1);
  assert.equal(siegeBottlenecks[0].count, 2);
  assert.equal(siegeBottlenecks[0].label, 'Twin Bottleneck Drones');
});

test('ids are unique and boss health phases are strictly descending with valid weapon references', () => {
  const ids = [];
  for (const level of campaign.levels) {
    ids.push(level.id);
    for (const wave of level.waves) {
      ids.push(wave.id);
      for (const event of wave.events) {
        ids.push(event.id);
        if (event.kind !== 'boss') continue;

        const weaponIds = new Set(event.weapons.map((weapon) => weapon.id));
        assert.ok(event.weapons.length > 0);
        assert.ok(event.phases.length > 0);
        assert.equal(event.phases[0].triggerHealthRatio, 1);

        let previous = Number.POSITIVE_INFINITY;
        event.phases.forEach((phase) => {
          assert.ok(phase.triggerHealthRatio < previous);
          previous = phase.triggerHealthRatio;
          assert.ok(phase.weaponSettingIds.length > 0);
          phase.weaponSettingIds.forEach((weaponId) => assert.ok(weaponIds.has(weaponId)));
        });
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
});

test('spawn pools are complete, weighted, and contain directly editable combat values', () => {
  const spawnEvents = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => wave.events.filter((event) => event.kind === 'spawn'))
  ));
  assert.ok(spawnEvents.length > 0);

  spawnEvents.forEach((event) => {
    assert.ok(event.count > 0);
    assert.ok(event.spawnIntervalSeconds > 0);
    assert.ok(event.enemies.length > 0);
    const sum = event.enemies.reduce((total, enemy) => total + enemy.weight, 0);
    assert.ok(Math.abs(sum - 1) < 0.0001);
    event.enemies.forEach((enemy) => {
      assert.ok(enemy.health > 0);
      assert.ok(enemy.speed >= 0);
      assert.ok(enemy.damage > 0);
      assert.ok(enemy.scoreValue >= 0);
      assert.ok(enemy.powerupDropChance >= 0 && enemy.powerupDropChance <= 1);
    });
  });
});

test('sector waves escalate through readable formation packs instead of slow single-file spawns', () => {
  const sectorWaves = campaign.levels[0].waves.slice(0, 4);
  const wavePatterns = sectorWaves.map((wave) => (
    wave.events
      .filter((event) => event.kind === 'spawn' && event.patternId !== 'single-random')
      .map((event) => event.patternId)
  ));
  const spawnIntervals = sectorWaves.map((wave) => (
    wave.events
      .filter((event) => event.kind === 'spawn' && event.patternId !== 'single-random')
      .map((event) => event.spawnIntervalSeconds)
  ));

  assert.deepEqual(wavePatterns[0], ['v', 'grid', 'sine']);
  assert.deepEqual(wavePatterns[1], ['spiral', 'grid', 'diamond']);
  assert.deepEqual(wavePatterns[2], ['grid', 'pincer', 'diamond']);
  assert.deepEqual(wavePatterns[3], ['spiral', 'pincer', 'grid']);
  spawnIntervals.flat().forEach((interval) => assert.ok(interval <= 0.18));
  assert.ok(Math.max(...spawnIntervals[3]) < Math.max(...spawnIntervals[0]));
});

test('each wave opens with loose interceptors before formations and scales the pressure upward', () => {
  const waves = campaign.levels[0].waves.slice(0, 4);
  const openingCounts = [];
  const firstFormationCounts = [];

  waves.forEach((wave) => {
    const opening = wave.events.find((event) => event.id === `${wave.id}-opening-drifters`);
    const firstFormation = wave.events.find((event) => event.id === `${wave.id}-phase-1`);

    assert.ok(opening);
    assert.equal(opening.patternId, 'single-random');
    assert.equal(opening.positionId, 'random-top');
    assert.equal(opening.startSeconds, 0);
    assert.ok(opening.spawnIntervalSeconds >= 0.8);
    assert.ok(firstFormation.startSeconds > opening.durationSeconds);
    if (wave.order <= 2) {
      assert.ok(opening.enemies.some((enemy) => enemy.spriteKey.startsWith('LEGACY_ENEMY_')));
    } else {
      assert.ok(opening.enemies.every((enemy) => (
        enemy.spriteKey.startsWith('PIXI_JET_') || enemy.spriteKey === 'ENEMY_JOURNAL_FRAMES'
      )));
    }
    openingCounts.push(opening.count);
    firstFormationCounts.push(firstFormation.count);
  });

  assert.deepEqual(openingCounts, [4, 5, 6, 7]);
  assert.deepEqual(firstFormationCounts, [8, 12, 15, 18]);

  const firstFinalBoss = waves[0].events.find((event) => event.id === 'open-orbit-gatekeeper');
  assert.equal(firstFinalBoss.health, 170);
});

test('small random intercepts bridge formations and boss encounters without replacing either', () => {
  campaign.levels[0].waves.slice(0, 4).forEach((wave) => {
    const drifters = wave.events.filter((event) => (
      event.kind === 'spawn' && event.patternId === 'single-random' && event.id.includes('-drifters-')
    ));
    const phaseTwo = wave.events.find((event) => event.id === `${wave.id}-phase-2`);
    const postMini = drifters.find((event) => event.id === `${wave.id}-drifters-after-mini`);
    const phaseThree = wave.events.find((event) => event.id === `${wave.id}-phase-3`);
    const postCheckpoint = drifters.find((event) => event.id === `${wave.id}-drifters-after-checkpoint`);

    assert.equal(drifters.length, 5);
    drifters.forEach((event) => {
      assert.equal(event.positionId, 'random-top');
      assert.ok(event.count >= 2 && event.count <= 3);
      assert.ok(event.spawnIntervalSeconds >= 0.8);
    });
    assert.ok(postMini.startSeconds < phaseTwo.startSeconds);
    assert.ok(postCheckpoint.startSeconds < phaseThree.startSeconds);
  });
});

test('enemy families unlock progressively instead of all appearing in the opening wave', () => {
  const waves = campaign.levels[0].waves.slice(0, 4);
  const waveEnemyIds = (wave) => [...new Set(
    wave.events
      .filter((event) => event.kind === 'spawn')
      .flatMap((event) => event.enemies.map((enemy) => enemy.enemyId))
  )];

  assert.deepEqual(waveEnemyIds(waves[0]), ['drone']);
  assert.deepEqual(waveEnemyIds(waves[1]), ['drone', 'swarm']);
  assert.deepEqual(waveEnemyIds(waves[2]), ['drone', 'swarm', 'brick']);
  assert.deepEqual(waveEnemyIds(waves[3]), ['drone', 'swarm', 'brick', 'journal']);
});

test('every predatory journal spawn uses the animated frame catalog', () => {
  const journalSettings = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => (
      wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => event.enemies.filter((enemy) => enemy.enemyId === 'journal'))
    ))
  ));

  assert.ok(journalSettings.length > 0);
  journalSettings.forEach((enemy) => assert.equal(enemy.spriteKey, 'ENEMY_JOURNAL_FRAMES'));
});

test('asteroid art is reserved for asteroid-belt encounters', () => {
  const events = campaign.levels.flatMap((level) => level.waves.flatMap((wave) => wave.events));
  const asteroidEvents = events.filter((event) => event.kind === 'asteroid-belt');
  const formationEnemies = events
    .filter((event) => event.kind === 'spawn')
    .flatMap((event) => event.enemies);

  assert.ok(asteroidEvents.length > 0);
  asteroidEvents.forEach((event) => assert.equal(event.spriteKey, 'ASTEROID_BELT_FRAMES'));
  formationEnemies.forEach((enemy) => assert.notEqual(enemy.spriteKey, 'ASTEROID_BELT_FRAMES'));
});

test('campaign JSON contains catalog keys only, never arbitrary asset paths or executable fields', () => {
  const { keys, strings } = collectKeysAndStrings(campaign);
  const forbiddenKeys = new Set(['assetPath', 'path', 'url', 'script', 'code', 'handler', 'function']);
  keys.forEach((key) => assert.equal(forbiddenKeys.has(key), false, `forbidden key: ${key}`));
  strings.forEach((value) => {
    assert.equal(value.startsWith('/game-art/'), false, `raw asset path: ${value}`);
    assert.equal(/^javascript:/i.test(value), false, `executable URI: ${value}`);
  });
});

test('shared loader validates campaign JSON before exposing it to the game', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'levelConfig.ts'), 'utf8');
  assert.match(source, /parseGameCampaign\(campaignJson\)/);
  assert.match(source, /DEFAULT_GAME_CAMPAIGN/);
  assert.match(source, /cloneGameCampaign/);
  assert.match(source, /getPrimaryAssetPath/);
  assert.match(source, /getDifficultyMultiplier/);
});
