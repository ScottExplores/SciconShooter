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

test('revision 23 contains ten five-depth sectors, explicit route alternatives, and tactical internal Waves', () => {
  assert.equal(campaign.schemaVersion, 1);
  assert.equal(campaign.revision, 23);
  assert.equal(campaign.fps, 60);
  assert.equal(campaign.hudAssets.bombIconAssetKey, 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F');
  assert.equal(campaign.sectors.length, 10);
  assert.equal(campaign.levels.length, 60);
  assert.equal(campaign.campaignGraph.nodes.length, 60);
  assert.equal(campaign.campaignGraph.entryNodeId, campaign.sectors[0].mainNodeIds[0]);

  const mainMissionIds = campaign.sectors.flatMap((sector) => sector.missionIds);
  const routeMissionIds = campaign.sectors.flatMap((sector) => (
    sector.routeNodeIds.map((nodeId) => (
      campaign.campaignGraph.nodes.find((node) => node.nodeId === nodeId)?.missionDefinitionId
    ))
  ));
  assert.equal(new Set(mainMissionIds).size, 50);
  assert.equal(new Set(routeMissionIds).size, 10);
  assert.equal(new Set([...mainMissionIds, ...routeMissionIds]).size, campaign.levels.length);

  const firstFive = campaign.sectors[0].missionIds.map((missionId) => (
    campaign.levels.find((level) => level.id === missionId)
  ));
  assert.deepEqual(
    firstFive.map((level) => level.name),
    ['ORBIT ENTRY', 'CITATION CROSSING', 'PAYWALL CHECKPOINT', 'BASTION APPROACH', 'BASTION PROTOCOL']
  );
  assert.deepEqual(campaign.levels.map((level) => level.order), Array.from({ length: 60 }, (_, index) => index + 1));
  assert.deepEqual(firstFive.map((level) => level.waves.length), [5, 6, 5, 7, 4]);
  assert.equal(campaign.levels.reduce((total, level) => total + level.waves.length, 0), 330);
  assert.deepEqual(firstFive.map((level) => level.waves[0].scoreMultiplier), [1, 2, 3, 4, 5]);
  campaign.levels.forEach((level) => {
    assert.equal(level.loopWaves, false);
    assert.ok(level.durationSeconds > 0);
    assert.ok(level.availablePowerupIds.includes('extra-life'));
    assert.deepEqual(level.waves.map((wave) => wave.order), level.waves.map((_, index) => index + 1));
    assert.ok(level.waves.every((wave) => wave.scoreMultiplier === level.waves[0].scoreMultiplier));
    assert.ok(level.waves.every((wave) => wave.difficultyMultiplier >= 1 && wave.difficultyMultiplier <= 2));
  });
  campaign.sectors.forEach((sector) => {
    const levels = sector.missionIds.map((missionId) => campaign.levels.find((level) => level.id === missionId));
    assert.ok(levels.every(Boolean));
    assert.equal(sector.mainNodeIds.length, 5);
    assert.equal(sector.routeNodeIds.length, 1);
    assert.deepEqual(levels.map((level) => level.waves.length), [5, 6, 5, 7, 4]);
    assert.deepEqual(levels.map((level) => level.campaignProgression.missionRole), [
      'introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'
    ]);
  });
});

test('ten deliberate mini-bosses occupy both checkpoint Missions in every sector', () => {
  assert.equal(campaign.miniBosses.length, 10);
  const catalogByBossId = new Map(campaign.miniBosses.map((entry) => [entry.bossId, entry]));
  assert.equal(catalogByBossId.size, 10);
  campaign.miniBosses.forEach((entry) => {
    assert.equal(entry.campaignReady, true, `${entry.bossId} is Campaign-ready`);
    assert.equal(entry.validationStatus, 'validated', `${entry.bossId} is validated`);
    assert.ok(entry.mainAttacks.length >= 2 && entry.mainAttacks.length <= 3);
    assert.equal(new Set(entry.mainAttacks).size, entry.mainAttacks.length);
    assert.ok(entry.suitableSectorIds.length > 0);
  });

  const miniBossNodes = campaign.campaignGraph.nodes.filter((node) => node.miniBossIds.length > 0);
  assert.equal(miniBossNodes.length, 20);
  campaign.sectors.forEach((sector) => {
    const sectorNodes = miniBossNodes
      .filter((node) => node.sectorId === sector.id)
      .sort((left, right) => left.depth - right.depth);
    assert.equal(sectorNodes.length, 2, `${sector.id} has two checkpoint encounters`);
    sectorNodes.forEach((node) => {
      assert.equal(node.miniBossIds.length, 1);
      const [bossId] = node.miniBossIds;
      assert.equal(catalogByBossId.has(bossId), true, `${bossId} exists in the catalog`);
      const mission = campaign.levels.find((level) => level.id === node.missionDefinitionId);
      const bossEvents = mission.waves.flatMap((wave) => wave.events).filter((event) => event.kind === 'boss');
      assert.equal(bossEvents.length, 1, `${mission.id} has one mini-boss event`);
      assert.equal(bossEvents[0].bossId, bossId, `${mission.id} graph and runtime agree`);
      assert.equal(bossEvents[0].count, 1, `${mission.id} starts one bounded encounter controller`);
    });
  });

  const getSectorMiniBossIds = (sectorId) => miniBossNodes
    .filter((node) => node.sectorId === sectorId)
    .sort((left, right) => left.depth - right.depth)
    .flatMap((node) => node.miniBossIds);
  assert.deepEqual(getSectorMiniBossIds('sector-open-orbit'), ['bottleneck-drone', 'paywall-wall']);
  assert.deepEqual(
    new Set([
      ...getSectorMiniBossIds('sector-redline'),
      ...getSectorMiniBossIds('sector-gravity'),
      ...getSectorMiniBossIds('sector-terminus'),
      ...getSectorMiniBossIds('sector-prism-expanse')
    ]),
    new Set([
      'fracture-engine-elite',
      'aegis-brood-core',
      'railspine-wallcrawler',
      'maw-carrier',
      'twin-meridian-sentinels',
      'prism-bloom',
      'aegis-convoy-captain',
      'gridline-sentries'
    ])
  );
  assert.deepEqual(new Set(miniBossNodes.flatMap((node) => node.miniBossIds)), new Set(catalogByBossId.keys()));
});

test('all sixty Mission definitions author balanced rewards, three mastery stars, and normalized graph positions', () => {
  const objectiveIds = new Set();
  const graphNodeByMissionId = new Map(
    campaign.campaignGraph.nodes.map((node) => [node.missionDefinitionId, node])
  );

  campaign.levels.forEach((level) => {
    const progression = level.campaignProgression;
    assert.ok(progression, `${level.id} should author Campaign progression metadata`);
    const sectorIndex = campaign.sectors.findIndex((sector) => sector.id === progression.sectorId);
    const sector = campaign.sectors[sectorIndex];
    const mainSlotIndex = sector.missionIds.indexOf(level.id);
    const graphNode = graphNodeByMissionId.get(level.id);
    const isRouteAlternative = sector.routeNodeIds.includes(graphNode.nodeId);
    const slot = isRouteAlternative ? 2 : mainSlotIndex + 1;
    const routePremium = isRouteAlternative ? 1.12 : 1;
    const sectorNumber = sectorIndex + 1;
    assert.equal(progression.reward.waveClearCoins, Math.round((8 + sectorNumber * 2) * routePremium));
    assert.equal(progression.reward.missionClearCoins, Math.round((24 + sectorNumber * 5) * routePremium));
    assert.equal(progression.reward.firstClearCoins, Math.round((46 + sectorNumber * 11) * routePremium));
    assert.equal(progression.reward.replayMultiplier, 0.2);
    assert.equal(
      progression.reward.bossFirstClearCoins,
      slot === 5 ? 70 + sectorNumber * 22 : slot === 3 ? 22 + sectorNumber * 6 : 0
    );
    assert.equal(progression.masteryObjectives.length, 3);
    assert.equal(progression.masteryObjectives.filter((objective) => objective.kind === 'complete').length, 1);
    progression.masteryObjectives.forEach((objective) => {
      assert.match(objective.id, new RegExp(`^${level.id}:`));
      assert.equal(objectiveIds.has(objective.id), false, `duplicate mastery receipt ${objective.id}`);
      objectiveIds.add(objective.id);
      assert.ok(objective.rewardCoins >= 0);
    });
    assert.deepEqual(progression.mapPosition, graphNode.mapPosition);
    assert.ok(progression.mapPosition.x >= 0 && progression.mapPosition.x <= 1);
    assert.ok(progression.mapPosition.y >= 0 && progression.mapPosition.y <= 1);
    if (progression.nextMissionId !== null) {
      assert.ok(campaign.levels.some((candidate) => candidate.id === progression.nextMissionId));
    }
  });

  assert.equal(objectiveIds.size, 180);
  const firstMainMission = campaign.levels.find((level) => level.id === campaign.sectors[0].missionIds[0]);
  const finalMainMission = campaign.levels.find((level) => level.id === campaign.sectors.at(-1).missionIds.at(-1));
  assert.equal(firstMainMission.campaignProgression.mapPosition.y, 0);
  assert.equal(finalMainMission.campaignProgression.mapPosition.y, 1);
});

test('browser validation owns the authored Campaign progression contract', () => {
  const validator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');

  assert.match(validator, /CAMPAIGN_PROGRESSION_KEYS/);
  assert.match(validator, /Campaign Missions require exactly three mastery objectives/);
  assert.match(validator, /Campaign Missions require exactly one completion mastery objective/);
  assert.match(validator, /Unknown next Campaign Mission/);
  assert.match(validator, /validateCampaignProgression\(candidate\.campaignProgression/);
});

test('fifty main depths form a non-recycling campaign with ten authored sector climaxes and bounded scoring', () => {
  const stageSix = campaign.levels[5];
  const finalStage = campaign.levels.find((level) => level.id === campaign.sectors.at(-1).missionIds.at(-1));
  const sectorBosses = campaign.sectors.map((sector) => {
    const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
    return level.waves.at(-1).events.find((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
  });

  assert.equal(stageSix.id, 'stage-helix-convergence');
  assert.equal(finalStage.id, 'stage-crownclaw-frontier-commander');
  assert.equal(finalStage.order, 50);
  assert.ok(campaign.levels.every((stage) => stage.loopWaves === false));
  assert.deepEqual(sectorBosses.map((boss) => boss.bossId), [
    'gatekeeper-prime', 'paywall-decimator', 'prism-moth', 'frontier-crownclaw', 'helios-clawcarrier',
    'rail-serpent', 'singularity-crab', 'orbit-gyroscope', 'hammerhead-siege', 'frontier-crownclaw'
  ]);
  assert.deepEqual(
    campaign.levels.filter((level) => level.waves.some((wave) => wave.completionRule === 'boss-defeat')).map((level) => level.order),
    [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]
  );
  sectorBosses.forEach((boss, index) => {
    if (index === 0) return;
    assert.ok(boss.health > sectorBosses[index - 1].health);
    assert.ok(boss.scoreReward > sectorBosses[index - 1].scoreReward);
  });

  assert.ok(finalStage.startingDifficulty > stageSix.startingDifficulty);
  assert.ok(finalStage.waves.at(-1).difficultyMultiplier > stageSix.waves.at(-1).difficultyMultiplier);
  assert.ok(finalStage.waves.at(-1).threatCap >= stageSix.waves.at(-1).threatCap);

  const mainLevels = campaign.sectors.flatMap((sector) => (
    sector.missionIds.map((missionId) => campaign.levels.find((level) => level.id === missionId))
  ));
  const scoreMultipliers = mainLevels.map((stage) => stage.waves[0].scoreMultiplier);
  assert.deepEqual(scoreMultipliers, Array.from({ length: 50 }, (_, index) => index + 1));
  campaign.sectors.forEach((sector, sectorIndex) => {
    const routeNode = campaign.campaignGraph.nodes.find((node) => node.nodeId === sector.routeNodeIds[0]);
    const routeLevel = campaign.levels.find((level) => level.id === routeNode.missionDefinitionId);
    assert.equal(routeLevel.waves[0].scoreMultiplier, sectorIndex * 5 + 2);
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

test('ten sector bosses follow a readable durability, bounded score, and projectile-pressure curve', () => {
  const finalBosses = campaign.sectors.map((sector) => {
    const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
    return level.waves.at(-1).events.find((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
  });
  const bursts = finalBosses.map((boss) => boss.weapons.find((weapon) => weapon.projectileSpeed > 0));

  assert.deepEqual(finalBosses.map((boss) => boss.health), [500, 650, 1150, 1600, 1800, 1850, 1950, 2100, 2300, 2450]);
  assert.deepEqual(finalBosses.map((boss) => boss.scoreReward), [1010, 5010, 9010, 13010, 17010, 21010, 25010, 29010, 33010, 37010]);
  assert.deepEqual(bursts.map((weapon) => weapon.burstCount), [3, 7, 4, 4, 4, 3, 1, 2, 1, 3]);
  finalBosses.slice(1).forEach((boss, index) => {
    assert.ok(boss.health > finalBosses[index].health);
    assert.ok(boss.scoreReward > finalBosses[index].scoreReward);
  });
  assert.ok(bursts.every((weapon) => weapon.projectileSpeed >= 4.6 && weapon.projectileSpeed <= 7.65));
  assert.ok(bursts.every((weapon) => weapon.burstCount >= 1 && weapon.burstCount <= 7));
  assert.ok(new Set(bursts.map((weapon) => weapon.projectileSpeed)).size >= 6, 'bosses preserve distinct projectile vocabularies');
  assert.ok(finalBosses.at(-1).scoreReward < 40_000);
});

test('sector Missions expose ordered role-specific Waves with short major-boss lead-ins', () => {
  const expectedCounts = new Map([
    ['introduction', 5],
    ['formation-remix', 6],
    ['elite-checkpoint', 5],
    ['boss-preparation', 7],
    ['major-boss', 4]
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
      assert.deepEqual(level.waves.map((wave) => wave.completionRule), [
        'clear-after-duration', 'clear-after-duration', 'clear-after-duration', 'boss-defeat'
      ]);
      assert.deepEqual(level.waves.map((wave) => wave.rhythm), ['warm-up', 'variation', 'recovery', 'boss']);
      assert.ok(level.waves.slice(0, 3).every((wave) => wave.events.every((event) => event.kind !== 'boss')));
      assert.equal(level.waves.at(-1).events.length, 1);
      assert.equal(level.waves.at(-1).events[0].bossId, sector.majorBossId);
    } else {
      assert.ok(level.waves.every((wave) => wave.completionRule === 'clear-after-duration'));
    }
  });
});

test('each sector finale has two bounded combat lead-ins, recovery, one major-boss encounter, and a five-second reward window', () => {
  campaign.sectors.forEach((sector) => {
    const stage = campaign.levels.find((level) => level.id === sector.missionIds.at(-1));
    assert.equal(stage.campaignProgression.missionRole, 'major-boss');
    assert.equal(stage.waves.length, 4);
    assert.deepEqual(stage.waves.slice(0, 3).map((wave) => wave.durationSeconds), [11, 12, 7]);
    assert.ok(stage.waves.slice(0, 3).every((wave) => wave.events.every((event) => event.kind !== 'boss')));
    const bossWave = stage.waves.at(-1);
    assert.equal(bossWave.events.length, 1);
    assert.equal(bossWave.events[0].kind, 'boss');
    assert.equal(bossWave.events[0].bossId, sector.majorBossId);
    assert.equal(bossWave.completionRule, 'boss-defeat');
    assert.equal(bossWave.delayAfterSeconds, 5);
  });
});

test('browser campaign validation permits multiple Paywall Bastion rows', () => {
  const validator = fs.readFileSync(path.join(root, 'game-config', 'validate.ts'), 'utf8');
  const directorValidator = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');

  assert.match(validator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(String\(event\.bossId\)\)/);
  assert.match(directorValidator, /\['bottleneck-drone', 'paywall-wall'\]\.includes\(event\.bossId\)/);
  assert.match(directorValidator, /'bastion-protocol'/);
});

test('elite checkpoints and boss-preparation climaxes remain bounded and non-decreasing across ten sectors', () => {
  for (const role of ['elite-checkpoint', 'boss-preparation']) {
    const missions = campaign.levels.filter((level) => level.campaignProgression.missionRole === role);
    const climaxes = missions.map((level) => level.waves.at(-1).events.find((event) => event.kind === 'boss'));
    assert.equal(climaxes.length, 10);
    assert.ok(climaxes.every(Boolean));
    climaxes.slice(1).forEach((event, index) => {
      assert.ok(event.health >= climaxes[index].health);
    });
    assert.ok(climaxes.every((event) => event.health <= 340));
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
      assert.ok(event.spawnIntervalSeconds >= 0.28);
      assert.ok(event.spawnIntervalSeconds <= 0.6);
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

test('recovery Waves keep light downward traffic between formation peaks', () => {
  campaign.levels.filter((level) => level.campaignProgression.missionRole !== 'major-boss').forEach((level) => {
    const recoveryIndex = level.waves.findIndex((wave) => wave.rhythm === 'recovery');
    assert.ok(recoveryIndex > 0);
    assert.ok(recoveryIndex < level.waves.length - 1);
    const recovery = level.waves[recoveryIndex];
    assert.equal(recovery.events.filter((event) => event.kind === 'recovery').length, 1);
    const drifters = recovery.events.filter((event) => event.kind === 'spawn');
    assert.equal(drifters.length, 1);
    assert.equal(drifters[0].patternId, 'single-random');
    assert.equal(drifters[0].positionId, 'random-top');
    assert.equal(drifters[0].count, 3);
    assert.equal(drifters[0].spawnIntervalSeconds, 1.25);
    assert.equal('spawnAnchor' in drifters[0], false);
    assert.equal('formationSlots' in drifters[0], false);
    assert.ok(drifters[0].enemies.every((enemy) => enemy.health <= 10 && enemy.rank !== 'elite'));
    assert.ok(drifters[0].enemies.every((enemy) => enemy.powerupDropChance === 0));
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

test('enemy roles author readable spawn delays and explicit specialist firing states', () => {
  const behaviors = new Set(campaign.enemyRoles.map((role) => role.fireBehavior));
  assert.equal(behaviors.has('formation-command'), true);
  assert.equal(behaviors.has('elite-only'), true);
  campaign.enemyRoles.forEach((role) => {
    assert.equal(Number.isFinite(role.fireDelaySeconds), true, `${role.id} has a fire delay`);
    if (role.fireBehavior === 'none') {
      assert.equal(role.fireDelaySeconds, 0, `${role.id} never fires`);
    } else {
      assert.ok(role.fireDelaySeconds >= 0.5, `${role.id} has a readable quiet window`);
    }
    if (role.fireBehavior === 'elite-only') {
      assert.equal(role.durabilityClass, 'elite', `${role.id} is an elite-only shooter`);
    }
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

test('legacy migration leaves current revision-23 structure untouched and infers only omitted legacy completion rules', async () => {
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
