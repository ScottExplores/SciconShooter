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

test('tracked campaign contains five ordered stages with tactical internal waves', () => {
  assert.equal(campaign.schemaVersion, 1);
  assert.equal(campaign.revision, 17);
  assert.equal(campaign.fps, 60);
  assert.equal(campaign.hudAssets.bombIconAssetKey, 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F');
  assert.equal(campaign.levels.length, 5);
  assert.deepEqual(
    campaign.levels.map((level) => level.name),
    ['OPEN ORBIT', 'CITATION STORM', 'PAYWALL SIEGE', 'OPEN GALAXY', 'BASTION PROTOCOL']
  );
  assert.deepEqual(campaign.levels.map((level) => level.order), [1, 2, 3, 4, 5]);
  assert.deepEqual(campaign.levels.map((level) => level.waves.length), [3, 3, 3, 3, 5]);
  assert.deepEqual(campaign.levels.map((level) => level.waves[0].scoreMultiplier), [1, 2, 4, 8, 16]);
  campaign.levels.forEach((level) => {
    assert.equal(level.loopWaves, false);
    assert.equal(level.durationSeconds, null);
    assert.equal(level.startingDifficulty, 1);
    assert.ok(level.availablePowerupIds.includes('extra-life'));
    assert.deepEqual(level.waves.map((wave) => wave.order), level.waves.map((_, index) => index + 1));
    assert.ok(level.waves.every((wave) => wave.difficultyMultiplier === 1));
    assert.ok(level.waves.every((wave) => wave.scoreMultiplier === level.waves[0].scoreMultiplier));
  });
});

test('mission records enlarge the complete boss rig and the Paywall Siege mini-boss is visually larger', () => {
  assert.equal(campaign.recordCard.copy.verifiedLabel, '');
  assert.deepEqual(campaign.recordCard.art.encounter, {
    x: 755,
    y: 330,
    width: 273,
    height: 273,
    rotation: 0,
    opacity: 0.88,
    visible: true
  });
  assert.equal(campaign.recordCard.art.encounter.width / 210, 1.3);
  assert.equal(campaign.recordCard.art.encounter.height / 210, 1.3);
  const paywallMiniBoss = campaign.levels[2].waves[0].events.find((event) => event.id === 'paywall-siege-mini-boss');
  assert.ok(paywallMiniBoss);
  assert.equal(paywallMiniBoss.spriteStyle.scale, 1.15);
  assert.equal(campaign.levels[0].waves[0].events.find((event) => event.id === 'open-orbit-mini-boss').spriteStyle, undefined);
});

test('main bosses are reserved for stage finales and follow a clear health curve', () => {
  const finalBosses = campaign.levels
    .flatMap((level) => level.waves)
    .filter((wave) => wave.completionRule === 'boss-defeat')
    .map((wave) => wave.events.find((event) => event.kind === 'boss' && event.bossId === 'gatekeeper'));
  const bursts = finalBosses.map((boss) => boss.weapons.find((weapon) => weapon.id.endsWith('burst')));

  assert.deepEqual(finalBosses.map((boss) => boss.health), [170, 400, 720]);
  assert.deepEqual(finalBosses.map((boss) => boss.scoreReward), [1010, 4040, 10000]);
  assert.deepEqual(bursts.map((weapon) => weapon.projectileSpeed), [6.55, 7.65, 8.4]);
  assert.deepEqual(bursts.map((weapon) => weapon.burstCount), [3, 7, 8]);

  for (let index = 1; index < finalBosses.length; index += 1) {
    assert.ok(finalBosses[index].health > finalBosses[index - 1].health);
    assert.ok(finalBosses[index].scoreReward > finalBosses[index - 1].scoreReward);
    assert.ok(bursts[index].projectileSpeed > bursts[index - 1].projectileSpeed);
    assert.ok(bursts[index].burstCount >= bursts[index - 1].burstCount);
  }
});

test('sector stages expose ordered internal waves with stage-only Gatekeepers', () => {
  campaign.levels.slice(0, 4).forEach((level, index) => {
    assert.equal(level.waves.length, 3);
    assert.ok(level.waves[0].events.some((event) => event.kind === 'powerup'));
    level.waves.forEach((wave) => {
      assert.ok(wave.events.some((event) => event.kind === 'spawn' || event.kind === 'asteroid-belt'));
      const starts = wave.events.map((event) => event.startSeconds);
      assert.deepEqual(starts, [...starts].sort((left, right) => left - right));
      assert.ok(wave.events.every((event) => event.startSeconds <= wave.durationSeconds));
    });
    const finalWave = level.waves.at(-1);
    const hasGatekeeper = finalWave.events.some((event) => event.kind === 'boss' && event.bossId === 'gatekeeper');
    assert.equal(hasGatekeeper, index === 0 || index === 2);
    assert.equal(finalWave.completionRule, hasGatekeeper ? 'boss-defeat' : 'clear-after-duration');
    assert.ok(level.waves.slice(0, -1).every((wave) => wave.completionRule === 'clear-after-duration'));
  });
});

test('Stage 5 is a five-wave escalating Paywall Bastion endurance encounter', () => {
  const stage = campaign.levels[4];
  const events = stage.waves.flatMap((wave) => wave.events);
  const walls = events.filter((event) => event.kind === 'boss' && event.bossId === 'paywall-wall');
  const gatekeeper = events.find((event) => event.id === 'bastion-protocol-gatekeeper');

  assert.equal(stage.id, 'stage-bastion-protocol');
  assert.equal(stage.waves.length, 5);
  assert.ok(events.some((event) => event.kind === 'powerup'));
  assert.equal(walls.length, 4);
  assert.deepEqual(walls.map((event) => event.count), [1, 2, 3, 4]);
  assert.deepEqual(walls.map((event) => event.spriteKey), Array(4).fill('PAYWALL_BASTION_FRAMES'));
  assert.ok(walls.every((event) => event.blocksWaveClock));
  assert.ok(walls.every((event, index) => index === 0 || event.health > walls[index - 1].health));
  assert.ok(walls.every((event, index) => index === 0 || event.speed > walls[index - 1].speed));
  assert.ok(gatekeeper);
  assert.equal(gatekeeper.bossId, 'gatekeeper');
  assert.equal(gatekeeper.movementPatternId, 'gatekeeper-cycle');
  assert.equal(gatekeeper.spriteKey, 'PIXI_BOSS_CROWNCLAW_FRAMES');
  assert.ok(stage.waves.slice(0, -1).every((wave) => wave.completionRule === 'clear-after-duration'));
  assert.equal(stage.waves.at(-1).completionRule, 'boss-defeat');
  assert.equal(stage.waves.at(-1).delayAfterSeconds, 5);
});

test('browser campaign validation permits multiple Paywall Bastion rows', () => {
  const validator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');
  const directorValidator = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');

  assert.match(validator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(String\(event\.bossId\)\)/);
  assert.match(directorValidator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(event\.bossId\)/);
  assert.match(directorValidator, /'bastion-protocol'/);
});

test('interstitial elite packs escalate from Citation Storm to Open Galaxy', () => {
  const citationStorm = campaign.levels[1];
  const openGalaxy = campaign.levels[3];
  const elitePacks = (level) => level.waves.flatMap((wave) => wave.events).filter((event) => (
    event.kind === 'spawn' && event.enemies.every((enemy) => enemy.rank === 'elite')
  ));
  const citationPacks = elitePacks(citationStorm);
  const frontierPacks = elitePacks(openGalaxy);

  assert.deepEqual(citationPacks.map((event) => event.count), [3, 4]);
  assert.deepEqual(frontierPacks.map((event) => event.count), [3, 4]);
  assert.ok(Math.min(...frontierPacks.map((event) => event.enemies[0].health))
    > Math.max(...citationPacks.map((event) => event.enemies[0].health)));
  assert.ok(frontierPacks.every((event) => event.enemies[0].attackIntervalSeconds <= 1.05));
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

test('sector stages escalate through readable formation packs instead of slow single-file spawns', () => {
  const sectorStages = campaign.levels.slice(0, 4);
  const wavePatterns = sectorStages.map((level) => (
    level.waves.flatMap((wave) => wave.events)
      .filter((event) => event.kind === 'spawn' && event.patternId !== 'single-random')
      .map((event) => event.patternId)
  ));
  const spawnIntervals = sectorStages.map((level) => (
    level.waves.flatMap((wave) => wave.events)
      .filter((event) => event.kind === 'spawn' && event.patternId !== 'single-random')
      .map((event) => event.spawnIntervalSeconds)
  ));

  assert.deepEqual(wavePatterns[0], ['v', 'grid', 'sine']);
  assert.deepEqual(wavePatterns[1], ['spiral', 'diamond', 'grid', 'diamond', 'diamond']);
  assert.deepEqual(wavePatterns[2], ['grid', 'pincer', 'diamond']);
  assert.deepEqual(wavePatterns[3], ['spiral', 'diamond', 'pincer', 'grid', 'grid']);
  spawnIntervals.flat().forEach((interval) => assert.ok(interval <= 0.18));
  assert.ok(Math.max(...spawnIntervals[3]) < Math.max(...spawnIntervals[0]));
});

test('each stage opens with loose interceptors before formations and scales the pressure upward', () => {
  const stages = campaign.levels.slice(0, 4);
  const openingCounts = [];
  const firstFormationCounts = [];

  stages.forEach((stage) => {
    const prefix = stage.waves[0].id;
    const opening = stage.waves[0].events.find((event) => event.id === `${prefix}-opening-drifters`);
    const firstFormation = stage.waves[0].events.find((event) => event.id === `${prefix}-phase-1`);

    assert.ok(opening);
    assert.equal(opening.patternId, 'single-random');
    assert.equal(opening.positionId, 'random-top');
    assert.equal(opening.startSeconds, 0);
    assert.ok(opening.spawnIntervalSeconds >= 0.8);
    assert.ok(firstFormation.startSeconds > opening.durationSeconds);
    if (stage.order <= 2) {
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

  const firstFinalBoss = stages[0].waves.at(-1).events.find((event) => event.id === 'open-orbit-gatekeeper');
  assert.equal(firstFinalBoss.health, 170);
});

test('small random intercepts bridge formations and boss encounters without replacing either', () => {
  campaign.levels.slice(0, 4).forEach((level) => {
    const prefix = level.waves[0].id;
    const events = level.waves.flatMap((wave) => wave.events);
    const drifters = events.filter((event) => (
      event.kind === 'spawn' && event.patternId === 'single-random' && event.id.includes('-drifters-')
    ));
    const phaseTwo = events.find((event) => event.id === `${prefix}-phase-2`);
    const postMini = drifters.find((event) => event.id === `${prefix}-drifters-after-mini`);
    const phaseThree = events.find((event) => event.id === `${prefix}-phase-3`);
    const postCheckpoint = drifters.find((event) => event.id === `${prefix}-drifters-after-checkpoint`);

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

test('enemy families unlock progressively across stages', () => {
  const stages = campaign.levels.slice(0, 4);
  const stageEnemyIds = (level) => [...new Set(
    level.waves.flatMap((wave) => wave.events)
      .filter((event) => event.kind === 'spawn')
      .flatMap((event) => event.enemies.map((enemy) => enemy.enemyId))
  )];

  assert.deepEqual(stageEnemyIds(stages[0]), ['drone']);
  assert.deepEqual(stageEnemyIds(stages[1]), ['drone', 'swarm']);
  assert.deepEqual(stageEnemyIds(stages[2]), ['drone', 'swarm', 'brick']);
  assert.deepEqual(stageEnemyIds(stages[3]), ['drone', 'swarm', 'brick', 'journal']);
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

test('legacy hierarchy migration preserves custom events and existing combat tuning', async () => {
  const { migrateLegacyStageWaveHierarchy } = await import('../game-config/legacyCampaignMigration.mjs');
  const legacyWaveIds = ['open-orbit', 'citation-storm', 'paywall-siege', 'open-galaxy', 'bastion-protocol'];
  const legacy = {
    ...campaign,
    levels: [{
      ...campaign.levels[0],
      id: 'operation-open-galaxy',
      name: 'Research Frontier',
      waves: campaign.levels.map((stage, index) => ({
        ...stage.waves[0],
        id: legacyWaveIds[index],
        name: stage.name,
        events: stage.waves.flatMap((wave) => wave.events.map((event) => ({ ...event })))
      }))
    }]
  };
  const tuned = structuredClone(legacy);
  const asteroid = tuned.levels[0].waves[1].events.find((event) => event.id === 'citation-storm-asteroid-belt');
  asteroid.count = 99;
  asteroid.health = 77;
  asteroid.label = 'CUSTOM STORM';
  const migrated = migrateLegacyStageWaveHierarchy(tuned);
  const migratedAsteroid = migrated.levels[1].waves.flatMap((wave) => wave.events)
    .find((event) => event.id === 'citation-storm-asteroid-belt');
  assert.equal(migratedAsteroid.count, 99);
  assert.equal(migratedAsteroid.health, 77);
  assert.equal(migratedAsteroid.label, 'CUSTOM STORM');

  const withCustomEvent = structuredClone(legacy);
  withCustomEvent.levels[0].waves[0].events.push({ id: 'director-custom-event' });
  assert.equal(migrateLegacyStageWaveHierarchy(withCustomEvent), withCustomEvent);
  assert.equal(withCustomEvent.levels[0].waves[0].events.at(-1).id, 'director-custom-event');
});
