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

test('revision 22 contains four ordered five-Mission sectors with tactical internal Waves', () => {
  assert.equal(campaign.schemaVersion, 1);
  assert.equal(campaign.revision, 22);
  assert.equal(campaign.fps, 60);
  assert.equal(campaign.hudAssets.bombIconAssetKey, 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F');
  assert.equal(campaign.levels.length, 20);
  const firstFive = campaign.levels.slice(0, 5);
  assert.deepEqual(
    firstFive.map((level) => level.name),
    ['OPEN ORBIT', 'CITATION STORM', 'PAYWALL SIEGE', 'OPEN GALAXY', 'BASTION PROTOCOL']
  );
  assert.deepEqual(campaign.levels.map((level) => level.order), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(firstFive.map((level) => level.waves.length), [5, 6, 5, 7, 1]);
  assert.deepEqual(firstFive.map((level) => level.waves[0].scoreMultiplier), [1, 2, 4, 8, 16]);
  campaign.levels.forEach((level) => {
    assert.equal(level.loopWaves, false);
    assert.ok(level.durationSeconds > 0);
    assert.ok(level.availablePowerupIds.includes('extra-life'));
    assert.deepEqual(level.waves.map((wave) => wave.order), level.waves.map((_, index) => index + 1));
    assert.ok(level.waves.every((wave) => wave.scoreMultiplier === level.waves[0].scoreMultiplier));
  });
  campaign.levels.forEach((level) => {
    const multipliers = level.waves.map((wave) => wave.difficultyMultiplier);
    multipliers.slice(1).forEach((multiplier, index) => assert.ok(multiplier > multipliers[index]));
  });
  assert.equal(campaign.sectors.length, 4);
  campaign.sectors.forEach((sector) => {
    const levels = sector.missionIds.map((missionId) => campaign.levels.find((level) => level.id === missionId));
    assert.ok(levels.every(Boolean));
    assert.deepEqual(levels.map((level) => level.waves.length), [5, 6, 5, 7, 1]);
    assert.deepEqual(levels.map((level) => level.campaignProgression.missionRole), [
      'introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'
    ]);
  });
});

test('all twenty Missions author Campaign rewards, three mastery stars, and a normalized map route', () => {
  const objectiveIds = new Set();
  const sectorRewardTiers = [
    { waveClearCoins: 16, missionClearCoins: 50, firstClearCoins: 115 },
    { waveClearCoins: 20, missionClearCoins: 65, firstClearCoins: 150 },
    { waveClearCoins: 24, missionClearCoins: 80, firstClearCoins: 185 },
    { waveClearCoins: 28, missionClearCoins: 95, firstClearCoins: 220 }
  ];

  campaign.levels.forEach((level, index) => {
    const progression = level.campaignProgression;
    const rewardTier = sectorRewardTiers[Math.floor(index / 5)];
    const earnsBossBonus = ['elite-checkpoint', 'major-boss'].includes(progression.missionRole);

    assert.ok(progression, `${level.id} should author Campaign progression metadata`);
    assert.equal(progression.reward.waveClearCoins, rewardTier.waveClearCoins);
    assert.equal(progression.reward.missionClearCoins, rewardTier.missionClearCoins);
    assert.equal(progression.reward.firstClearCoins, rewardTier.firstClearCoins);
    assert.equal(progression.reward.replayMultiplier, 0.25);
    assert.equal(progression.reward.bossFirstClearCoins > 0, earnsBossBonus);
    assert.equal(progression.masteryObjectives.length, 3);
    assert.equal(progression.masteryObjectives.filter((objective) => objective.kind === 'complete').length, 1);
    progression.masteryObjectives.forEach((objective) => {
      assert.match(objective.id, new RegExp(`^${level.id}:`));
      assert.equal(objectiveIds.has(objective.id), false, `duplicate mastery receipt ${objective.id}`);
      objectiveIds.add(objective.id);
      assert.ok(objective.rewardCoins >= 0);
    });
    const sectorIndex = Math.floor(index / 5);
    const sectorMissionIndex = index % 5;
    const splitLeft = sectorIndex % 2 === 0 ? 0.24 : 0.76;
    const splitRight = sectorIndex % 2 === 0 ? 0.76 : 0.24;
    const expectedX = [0.5, splitLeft, splitRight, 0.5, 0.74][sectorMissionIndex];
    assert.equal(progression.mapPosition.x, expectedX);
    assert.ok(progression.mapPosition.y >= 0 && progression.mapPosition.y <= 1);
    assert.equal(progression.nextMissionId, campaign.levels[index + 1]?.id ?? null);
  });

  assert.equal(objectiveIds.size, 60);
  assert.equal(campaign.levels[0].campaignProgression.mapPosition.y, 0);
  assert.equal(campaign.levels.at(-1).campaignProgression.mapPosition.y, 1);
});

test('browser validation owns the authored Campaign progression contract', () => {
  const validator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');

  assert.match(validator, /CAMPAIGN_PROGRESSION_KEYS/);
  assert.match(validator, /Campaign Missions require exactly three mastery objectives/);
  assert.match(validator, /Campaign Missions require exactly one completion mastery objective/);
  assert.match(validator, /Unknown next Campaign Mission/);
  assert.match(validator, /validateCampaignProgression\(candidate\.campaignProgression/);
});

test('all twenty Missions form a non-recycling campaign with distinct sector climaxes', () => {
  const stageSix = campaign.levels[5];
  const stageTwenty = campaign.levels[19];
  const sectorBosses = campaign.sectors.map((sector) => {
    const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
    return level.waves[0].events.find((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
  });

  assert.equal(stageSix.id, 'stage-helix-convergence');
  assert.equal(stageTwenty.id, 'stage-terminus-ascendant');
  assert.equal(stageTwenty.order, 20);
  assert.ok(campaign.levels.every((stage) => stage.loopWaves === false));
  assert.deepEqual(sectorBosses.map((boss) => boss.bossId), [
    'gatekeeper-prime', 'eclipse-engine', 'helix-leviathan', 'research-tribunal'
  ]);
  assert.deepEqual(campaign.levels.filter((level) => level.waves.some((wave) => wave.completionRule === 'boss-defeat')).map((level) => level.order), [5, 10, 15, 20]);
  sectorBosses.forEach((boss, index) => {
    if (index === 0) return;
    assert.ok(boss.health > sectorBosses[index - 1].health);
    assert.ok(boss.scoreReward > sectorBosses[index - 1].scoreReward);
  });

  assert.ok(stageTwenty.startingDifficulty > stageSix.startingDifficulty);
  assert.ok(stageTwenty.waves[0].difficultyMultiplier > stageSix.waves.at(-1).difficultyMultiplier);
  assert.ok(stageTwenty.waves[0].threatCap >= stageSix.waves.at(-1).threatCap);

  const scoreMultipliers = campaign.levels.map((stage) => stage.waves[0].scoreMultiplier);
  scoreMultipliers.slice(1).forEach((multiplier, index) => {
    assert.ok(multiplier > scoreMultipliers[index], `Stage ${index + 2} should reward more than Stage ${index + 1}`);
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
  const paywallMiniBoss = campaign.levels[2].waves.at(-1).events.find((event) => event.bossId === 'bottleneck-drone');
  assert.ok(paywallMiniBoss);
  assert.equal(paywallMiniBoss.spriteStyle.scale, 1.15);
  assert.equal(campaign.levels[0].waves.some((wave) => wave.events.some((event) => event.kind === 'boss')), false);
});

test('four sector bosses follow a readable durability, score, and projectile-pressure curve', () => {
  const finalBosses = campaign.sectors.map((sector) => {
    const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
    return level.waves[0].events.find((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
  });
  const bursts = finalBosses.map((boss) => boss.weapons.find((weapon) => weapon.projectileSpeed > 0));

  assert.deepEqual(finalBosses.map((boss) => boss.health), [170, 1180, 1650, 2100]);
  assert.deepEqual(finalBosses.map((boss) => boss.scoreReward), [1010, 16700, 23200, 29700]);
  assert.deepEqual(bursts.map((weapon) => weapon.projectileSpeed), [6.55, 8.9, 9.25, 9.5]);
  assert.deepEqual(bursts.map((weapon) => weapon.burstCount), [3, 6, 6, 6]);
  finalBosses.slice(1).forEach((boss, index) => {
    assert.ok(boss.health > finalBosses[index].health);
    assert.ok(boss.scoreReward > finalBosses[index].scoreReward);
    assert.ok(bursts[index + 1].projectileSpeed > bursts[index].projectileSpeed);
  });
});

test('sector Missions expose ordered role-specific Waves with direct major-boss encounters', () => {
  const expectedCounts = new Map([
    ['introduction', 5],
    ['formation-remix', 6],
    ['elite-checkpoint', 5],
    ['boss-preparation', 7],
    ['major-boss', 1]
  ]);
  campaign.levels.forEach((level) => {
    const role = level.campaignProgression.missionRole;
    assert.equal(level.waves.length, expectedCounts.get(role));
    if (role !== 'major-boss') assert.ok(level.waves[0].events.some((event) => event.kind === 'powerup'));
    level.waves.forEach((wave) => {
      const starts = wave.events.map((event) => event.startSeconds);
      assert.deepEqual(starts, [...starts].sort((left, right) => left - right));
      assert.ok(wave.events.every((event) => event.startSeconds <= wave.durationSeconds));
    });
    if (role === 'major-boss') {
      const sector = campaign.sectors.find((candidate) => candidate.id === level.campaignProgression.sectorId);
      assert.equal(level.waves[0].completionRule, 'boss-defeat');
      assert.equal(level.waves[0].events.length, 1);
      assert.equal(level.waves[0].events[0].bossId, sector.majorBossId);
    } else {
      assert.ok(level.waves.every((wave) => wave.completionRule === 'clear-after-duration'));
    }
  });
});

test('each sector finale is one direct major-boss encounter with a five-second reward window', () => {
  campaign.sectors.forEach((sector) => {
    const stage = campaign.levels.find((level) => level.id === sector.missionIds.at(-1));
    assert.equal(stage.campaignProgression.missionRole, 'major-boss');
    assert.equal(stage.waves.length, 1);
    assert.equal(stage.waves[0].events.length, 1);
    assert.equal(stage.waves[0].events[0].kind, 'boss');
    assert.equal(stage.waves[0].events[0].bossId, sector.majorBossId);
    assert.equal(stage.waves[0].completionRule, 'boss-defeat');
    assert.equal(stage.waves[0].delayAfterSeconds, 5);
  });
});

test('browser campaign validation permits multiple Paywall Bastion rows', () => {
  const validator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');
  const directorValidator = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');

  assert.match(validator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(String\(event\.bossId\)\)/);
  assert.match(directorValidator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(event\.bossId\)/);
  assert.match(directorValidator, /'bastion-protocol'/);
});

test('elite checkpoints and boss-preparation climaxes escalate across the four sectors', () => {
  for (const role of ['elite-checkpoint', 'boss-preparation']) {
    const missions = campaign.levels.filter((level) => level.campaignProgression.missionRole === role);
    const climaxes = missions.map((level) => level.waves.at(-1).events.find((event) => event.kind === 'boss'));
    assert.equal(climaxes.length, 4);
    assert.ok(climaxes.every(Boolean));
    climaxes.slice(1).forEach((event, index) => {
      assert.ok(event.health > climaxes[index].health);
    });
  }
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

test('non-boss Missions escalate through readable authored formation packs', () => {
  const packIds = new Set(campaign.formationPacks.map((pack) => pack.id));
  const nonBossMissions = campaign.levels.filter((level) => level.campaignProgression.missionRole !== 'major-boss');
  nonBossMissions.forEach((level) => {
    const introduce = level.waves.find((wave) => wave.rhythm === 'introduce');
    assert.ok(introduce, `${level.id} has an introduction Wave`);
    assert.ok(introduce.formationPackIds.length > 0);
    introduce.formationPackIds.forEach((packId) => assert.equal(packIds.has(packId), true));
    introduce.events.filter((event) => event.kind === 'spawn').forEach((event) => {
      assert.notEqual(event.patternId, 'single-random');
      assert.ok(event.spawnIntervalSeconds <= 0.32);
    });
  });
});

test('each non-boss Mission teaches before it peaks and budgets cover every authored Wave', () => {
  const expectedPowerBySector = [];
  campaign.sectors.forEach((sector) => {
    const missions = sector.missionIds.slice(0, 4).map((missionId) => campaign.levels.find((level) => level.id === missionId));
    missions.forEach((stage) => {
      const introduceIndex = stage.waves.findIndex((wave) => wave.rhythm === 'introduce');
      const peakIndex = stage.waves.findIndex((wave) => ['peak', 'clear'].includes(wave.rhythm));
      assert.ok(introduceIndex >= 0);
      assert.ok(peakIndex > introduceIndex);
      assert.ok(stage.waves[0].events.some((event) => event.kind === 'powerup'));
    });
    missions.forEach((mission) => {
      assert.ok(mission.campaignProgression.combatBudget >= Math.max(...mission.waves.map((wave) => wave.combatBudget)));
    });
    expectedPowerBySector.push(Math.min(...missions.map((mission) => mission.campaignProgression.recommendedPower.expected)));
  });
  expectedPowerBySector.slice(1).forEach((power, index) => assert.ok(power > expectedPowerBySector[index]));
});

test('explicit recovery Waves separate formation pressure from each non-boss climax', () => {
  campaign.levels.filter((level) => level.campaignProgression.missionRole !== 'major-boss').forEach((level) => {
    const recoveryIndex = level.waves.findIndex((wave) => wave.rhythm === 'recovery');
    assert.ok(recoveryIndex > 0);
    assert.ok(recoveryIndex < level.waves.length - 1);
    const recovery = level.waves[recoveryIndex];
    assert.ok(recovery.events.every((event) => event.kind === 'recovery'));
    assert.ok(['peak', 'clear'].includes(level.waves.at(-1).rhythm));
  });
});

test('each sector teaches all four enemy families through role-bound spawn definitions', () => {
  const roles = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  campaign.sectors.forEach((sector) => {
    const enemies = sector.missionIds.slice(0, 4)
      .map((missionId) => campaign.levels.find((level) => level.id === missionId))
      .flatMap((level) => level.waves)
      .flatMap((wave) => wave.events)
      .filter((event) => event.kind === 'spawn')
      .flatMap((event) => event.enemies);
    assert.deepEqual(new Set(enemies.map((enemy) => enemy.enemyId)), new Set(['drone', 'swarm', 'brick', 'journal']));
    enemies.forEach((enemy) => {
      const role = roles.get(enemy.roleId);
      assert.equal(role.enemyId, enemy.enemyId);
      assert.equal(role.spriteKey, enemy.spriteKey);
    });
  });
});

test('predatory journal spawns use the original animation or registered campaign variants', () => {
  const journalSettings = campaign.levels.flatMap((level) => (
    level.waves.flatMap((wave) => (
      wave.events
        .filter((event) => event.kind === 'spawn')
        .flatMap((event) => event.enemies.filter((enemy) => enemy.enemyId === 'journal'))
    ))
  ));

  assert.ok(journalSettings.length > 0);
  const allowedJournalSprites = new Set([
    'ENEMY_JOURNAL_FRAMES',
    'CAMPAIGN_ENEMY_DNA_CONDUCTOR',
    'CAMPAIGN_ENEMY_LASER_HUNTER',
    'CAMPAIGN_ENEMY_CRESCENT_MINELAYER',
    'CAMPAIGN_ENEMY_PRISM_ARTILLERY'
  ]);
  journalSettings.forEach((enemy) => assert.equal(allowedJournalSprites.has(enemy.spriteKey), true));
});

test('dark asteroid sentinels use their role-bound art while legacy belt frames stay out of formations', () => {
  const events = campaign.levels.flatMap((level) => level.waves.flatMap((wave) => wave.events));
  const formationEnemies = events
    .filter((event) => event.kind === 'spawn')
    .flatMap((event) => event.enemies);

  const sentinels = formationEnemies.filter((enemy) => enemy.spriteKey === 'CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL');
  assert.ok(sentinels.length > 0);
  assert.ok(sentinels.every((enemy) => enemy.enemyId === 'brick'));
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

test('legacy migration leaves revision-22 structure untouched and infers only omitted legacy completion rules', async () => {
  const {
    migrateLegacyStageWaveHierarchy,
    migrateLegacyWaveCompletionRule
  } = await import('../game-config/legacyCampaignMigration.mjs');
  const current = structuredClone(campaign);
  assert.equal(migrateLegacyStageWaveHierarchy(current), current);

  const legacyBossWave = { id: 'legacy-boss', events: [{ kind: 'boss', bossId: 'gatekeeper' }] };
  const migratedBoss = migrateLegacyWaveCompletionRule(legacyBossWave);
  assert.equal(migratedBoss.completionRule, 'boss-defeat');
  assert.equal(Object.hasOwn(legacyBossWave, 'completionRule'), false);

  const legacyClearWave = { id: 'legacy-clear', events: [{ kind: 'spawn' }] };
  assert.equal(migrateLegacyWaveCompletionRule(legacyClearWave).completionRule, 'clear-after-duration');

  const explicit = { ...legacyClearWave, completionRule: 'clear-after-duration' };
  assert.equal(migrateLegacyWaveCompletionRule(explicit), explicit);
});
