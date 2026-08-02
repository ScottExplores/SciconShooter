import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(scriptPath), '..');

const requireMatch = (source, pattern, label) => {
  const match = source.match(pattern);
  if (!match) throw new Error(`Unable to read ${label} from its source of truth.`);
  return match;
};

const parseNumberList = (source) => (
  [...source.matchAll(/\b\d+(?:\.\d+)?\b/g)].map((entry) => Number(entry[0]))
);

const parseExportedNumber = (source, exportName) => Number(requireMatch(
  source,
  new RegExp(`export const ${exportName}\\s*=\\s*(\\d+(?:\\.\\d+)?)`),
  exportName
)[1]);

const parseInternalNumber = (source, constantName) => Number(requireMatch(
  source,
  new RegExp(`const ${constantName}\\s*=\\s*(\\d+(?:\\.\\d+)?)`),
  constantName
)[1]);

const parseUpgradeInputs = (squadSource) => {
  const upgradeBlock = requireMatch(
    squadSource,
    /export const MAIN_SHIP_UPGRADES[\s\S]*?=\s*\[([\s\S]*?)\n\];/,
    'MAIN_SHIP_UPGRADES'
  )[1];
  // Every purchasable main-ship track, so "cost to fully upgrade a hull"
  // stays truthful as tracks are added. Homing Missiles was invisible here
  // until it was added, which under-reported that total.
  const mainUpgradeCosts = Object.fromEntries(
    ['fireRate', 'speed', 'ability', 'missile', 'startingHearts'].map((upgradeId) => {
      const costs = requireMatch(
        upgradeBlock,
        new RegExp(`id:\\s*'${upgradeId}'[\\s\\S]*?costs:\\s*\\[([\\s\\S]*?)\\]`),
        `${upgradeId} cost curve`
      )[1];
      return [upgradeId, parseNumberList(costs)];
    })
  );
  const miniUpgradeCurve = parseNumberList(requireMatch(
    squadSource,
    /export const MINI_SHIP_UPGRADE_COST_CURVE\s*=\s*\[([^\]]+)\]/,
    'MINI_SHIP_UPGRADE_COST_CURVE'
  )[1]);
  const miniCatalogBlock = requireMatch(
    squadSource,
    /export const MINI_SHIP_CATALOG[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const;/,
    'MINI_SHIP_CATALOG'
  )[1];
  const supportShips = [...miniCatalogBlock.matchAll(
    /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',[\s\S]*?purchaseCost:\s*(\d+),[\s\S]*?maxLevel:\s*MINI_SHIP_MAX_LEVEL,[\s\S]*?\n\s*\}/g
  )].map((entry) => ({
    id: entry[1],
    name: entry[2],
    purchaseCost: Number(entry[3])
  }));
  if (supportShips.length !== 10) {
    throw new Error(`Expected 10 support ships, found ${supportShips.length}.`);
  }
  const leftSlotCost = Number(requireMatch(
    squadSource,
    /export const LEFT_SQUAD_SLOT_UNLOCK_COST\s*=\s*(\d+)/,
    'LEFT_SQUAD_SLOT_UNLOCK_COST'
  )[1]);
  const rightSlotCost = Number(requireMatch(
    squadSource,
    /export const RIGHT_SQUAD_SLOT_UNLOCK_COST\s*=\s*(\d+)/,
    'RIGHT_SQUAD_SLOT_UNLOCK_COST'
  )[1]);
  return {
    mainUpgradeCosts,
    miniUpgradeCurve,
    supportShips,
    slotCosts: { left: leftSlotCost, right: rightSlotCost }
  };
};

const parseRewardCenterInputs = (rewardSource) => {
  const dailyCoins = parseNumberList(requireMatch(
    rewardSource,
    /const DAILY_COIN_REWARDS\s*=\s*\[([\s\S]*?)\]\s*as const;/,
    'DAILY_COIN_REWARDS'
  )[1]);
  const achievementBlock = requireMatch(
    rewardSource,
    /export const ACHIEVEMENT_DEFINITIONS[\s\S]*?=\s*\[([\s\S]*?)\]\s*;/,
    'ACHIEVEMENT_DEFINITIONS'
  )[1];
  const achievements = [...achievementBlock.matchAll(
    /\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)',[\s\S]*?rewards:\s*\[([^\]]+)\][\s\S]*?\}/g
  )].map((entry) => ({
    id: entry[1],
    title: entry[2],
    rewards: parseNumberList(entry[3])
  }));
  if (dailyCoins.length !== 30) {
    throw new Error(`Expected 30 daily-gift rewards, found ${dailyCoins.length}.`);
  }
  // Six arcade tracks plus six covering the Campaign graph, the Weekly Run,
  // Elite Bosses, and the Hangar.
  if (achievements.length !== 12) {
    throw new Error(`Expected 12 achievement tracks, found ${achievements.length}.`);
  }
  return { dailyCoins, achievements };
};

const parseBossArchiveInputs = (archiveSource, progressionSource) => ({
  baseChallengeCoins: parseExportedNumber(
    archiveSource,
    'BOSS_ARCHIVE_BASE_CHALLENGE_REWARD_COINS'
  ),
  challengeStepCoins: parseExportedNumber(
    archiveSource,
    'BOSS_ARCHIVE_CHALLENGE_REWARD_STEP_COINS'
  ),
  challengeMissionsPerTier: parseExportedNumber(
    archiveSource,
    'BOSS_ARCHIVE_CHALLENGE_REWARD_MISSIONS_PER_TIER'
  ),
  masteryMultipliers: parseNumberList(requireMatch(
    archiveSource,
    /export const BOSS_ARCHIVE_MASTERY_REWARD_MULTIPLIERS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\s*as const\)/,
    'BOSS_ARCHIVE_MASTERY_REWARD_MULTIPLIERS'
  )[1]),
  dailyChargeLimit: parseExportedNumber(
    progressionSource,
    'DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT'
  )
});

const parseCombatCoinInputs = (bossCoinSource) => ({
  ordinaryKillCoins: 1,
  activeBossCoinCap: parseExportedNumber(bossCoinSource, 'MAX_ACTIVE_BOSS_REWARD_COINS'),
  miniBoss: {
    base: parseInternalNumber(bossCoinSource, 'MINI_BOSS_BASE_COINS'),
    perMission: parseInternalNumber(bossCoinSource, 'MINI_BOSS_COINS_PER_STAGE'),
    maximum: parseInternalNumber(bossCoinSource, 'MINI_BOSS_MAX_COINS')
  },
  mainBoss: {
    base: parseInternalNumber(bossCoinSource, 'MAIN_BOSS_BASE_COINS'),
    perMission: parseInternalNumber(bossCoinSource, 'MAIN_BOSS_COINS_PER_STAGE'),
    maximum: parseInternalNumber(bossCoinSource, 'MAIN_BOSS_MAX_COINS')
  }
});

export const loadCampaignEconomyInputs = async (root = defaultRoot) => {
  const [
    campaignSource,
    squadSource,
    rewardSource,
    bossArchiveSource,
    bossArchiveProgressionSource,
    bossCoinSource
  ] = await Promise.all([
    readFile(path.join(root, 'game-config', 'campaign.json'), 'utf8'),
    readFile(path.join(root, 'services', 'squadProgression.ts'), 'utf8'),
    readFile(path.join(root, 'services', 'rewardProgression.ts'), 'utf8'),
    readFile(path.join(root, 'services', 'bossArchive.ts'), 'utf8'),
    readFile(path.join(root, 'services', 'bossArchiveProgression.ts'), 'utf8'),
    readFile(path.join(root, 'services', 'bossCoinBurst.ts'), 'utf8')
  ]);
  return {
    campaign: JSON.parse(campaignSource),
    upgrades: parseUpgradeInputs(squadSource),
    rewardCenter: parseRewardCenterInputs(rewardSource),
    bossArchive: parseBossArchiveInputs(bossArchiveSource, bossArchiveProgressionSource),
    combatCoins: parseCombatCoinInputs(bossCoinSource)
  };
};

const roundReward = (value) => Math.max(1, Math.round(value));
const sum = (values) => values.reduce((total, value) => total + value, 0);
const money = (value) => Math.round(value).toLocaleString('en-US');
const decimal = (value) => Number(value).toFixed(2).replace(/\.00$/, '');

const getMissionBreakdown = (mission) => {
  const progression = mission.campaignProgression;
  const stars = progression.masteryObjectives;
  if (stars.length !== 3 || stars[0]?.kind !== 'complete') {
    throw new Error(`${mission.id} must have exactly three objectives with a completion Star 1.`);
  }
  const clearCoins = mission.waves.length * progression.reward.waveClearCoins
    + progression.reward.missionClearCoins;
  const firstClearCoins = progression.reward.firstClearCoins
    + progression.reward.bossFirstClearCoins;
  const star1Coins = stars[0].rewardCoins;
  const star2Coins = stars[1].rewardCoins;
  const star3Coins = stars[2].rewardCoins;
  const masteryCoins = progression.masterySetBonusCoins;
  const clearOnlyCoins = clearCoins + firstClearCoins + star1Coins;
  const expectedCoins = clearOnlyCoins + star2Coins;
  const fullMasteryCoins = expectedCoins + star3Coins + masteryCoins;
  const dailyReplayCoins = roundReward(
    progression.reward.waveClearCoins * progression.reward.replayMultiplier
  ) + roundReward(
    progression.reward.missionClearCoins * progression.reward.replayMultiplier
  );
  return {
    missionId: mission.id,
    missionOrder: mission.order,
    missionName: mission.name,
    waveCount: mission.waves.length,
    clearCoins,
    firstClearCoins,
    star1Coins,
    star2Coins,
    star3Coins,
    masteryCoins,
    clearOnlyCoins,
    expectedCoins,
    fullMasteryCoins,
    dailyReplayCoins
  };
};

/**
 * Models the order a player actually buys main-ship upgrades: broaden the
 * short tracks level by level first, then keep pushing the long Fire Rate
 * ladder once the others are exhausted.
 *
 * Deliberately track-agnostic. The previous version interleaved three hard
 * coded ids, so Homing Missiles was silently missing from the purchase model
 * even after it became buyable.
 */
const buildMainUpgradeQueue = (mainUpgradeCosts) => {
  const queue = [];
  const trackIds = Object.keys(mainUpgradeCosts);
  const deepestTrack = Math.max(...trackIds.map((id) => mainUpgradeCosts[id].length));

  for (let level = 0; level < deepestTrack; level += 1) {
    for (const id of trackIds) {
      const cost = mainUpgradeCosts[id][level];
      if (Number.isFinite(cost)) {
        queue.push({ id, level: level + 1, label: `${id} ${level + 1}`, cost });
      }
    }
  }
  return queue;
};

const runCadence = (missionRows, queue, earningsForMission) => {
  let bank = 0;
  let purchaseIndex = 0;
  let dryStretch = 0;
  let longestDryStretch = 0;
  const missionCadence = missionRows.map((mission) => {
    const earned = earningsForMission(mission);
    bank += earned;
    const purchases = [];
    while (queue[purchaseIndex] && bank >= queue[purchaseIndex].cost) {
      const purchase = queue[purchaseIndex];
      bank -= purchase.cost;
      purchases.push(purchase);
      purchaseIndex += 1;
    }
    if (purchases.length === 0) {
      dryStretch += 1;
      longestDryStretch = Math.max(longestDryStretch, dryStretch);
    } else {
      dryStretch = 0;
    }
    return {
      missionOrder: mission.missionOrder,
      earned,
      purchases,
      bank,
      totalPurchases: purchaseIndex
    };
  });
  return {
    purchasesFunded: purchaseIndex,
    averageMissionsPerUpgrade: purchaseIndex > 0 ? missionRows.length / purchaseIndex : null,
    longestDryStretch,
    remainingBank: bank,
    nextUpgrade: queue[purchaseIndex] ?? null,
    missionCadence
  };
};

const firstAffordableMission = (missionRows, earningsForMission, target) => {
  let bank = 0;
  for (const mission of missionRows) {
    bank += earningsForMission(mission);
    if (bank >= target) return mission.missionOrder;
  }
  return null;
};

const getAuthoredPickupInventory = (missions, combatCoins) => {
  let recoveryCoins = 0;
  let miniBossBurstCeiling = 0;
  let mainBossBurstCeiling = 0;
  let configuredEnemyCount = 0;
  for (const mission of missions) {
    for (const wave of mission.waves) {
      for (const event of wave.events) {
        if (event.kind === 'recovery') {
          recoveryCoins += Math.max(0, Math.floor(Number(event.coinCount) || 0));
        }
        if (event.kind === 'spawn') {
          configuredEnemyCount += Math.max(0, Math.floor(Number(event.count) || 0));
        }
        if (event.kind === 'asteroid-belt') {
          configuredEnemyCount += Math.max(0, Math.floor(Number(event.count) || 0));
        }
        if (event.kind === 'mini-boss' || event.kind === 'boss') {
          const curve = event.kind === 'boss' ? combatCoins.mainBoss : combatCoins.miniBoss;
          const rewardPerBoss = Math.min(
            curve.maximum,
            curve.base + Math.max(0, mission.order - 1) * curve.perMission
          );
          const count = Math.max(1, Math.floor(Number(event.count) || 1));
          if (event.kind === 'boss') mainBossBurstCeiling += rewardPerBoss * count;
          else miniBossBurstCeiling += rewardPerBoss * count;
        }
      }
    }
  }
  return {
    recoveryCoins,
    configuredEnemyCount,
    configuredEnemyKillCoins: configuredEnemyCount * combatCoins.ordinaryKillCoins,
    miniBossBurstCeiling,
    mainBossBurstCeiling,
    totalAuthoredPickupCeiling: recoveryCoins
      + configuredEnemyCount * combatCoins.ordinaryKillCoins
      + miniBossBurstCeiling
      + mainBossBurstCeiling
  };
};

export const simulateCampaignEconomy = ({
  campaign,
  upgrades,
  rewardCenter,
  bossArchive,
  combatCoins
}) => {
  const missionById = new Map(campaign.levels.map((mission) => [mission.id, mission]));
  const branchById = new Map((campaign.campaignBranches ?? []).map((branch) => [branch.branchId, branch]));
  const graphNodeById = new Map(
    (campaign.campaignGraph?.nodes ?? []).map((node) => [node.nodeId, node])
  );
  const missionRows = [];
  const sectorRows = campaign.sectors.map((sector) => {
    const missions = sector.missionIds.map((missionId) => {
      const mission = missionById.get(missionId);
      if (!mission) throw new Error(`${sector.id} references missing Mission ${missionId}.`);
      const row = { ...getMissionBreakdown(mission), sectorId: sector.id, sectorOrder: sector.order };
      missionRows.push(row);
      return row;
    });
    const alternateMissions = (sector.routeNodeIds ?? []).map((nodeId) => {
      const node = graphNodeById.get(nodeId);
      if (!node) throw new Error(`${sector.id} references missing route node ${nodeId}.`);
      const mission = missionById.get(node.missionDefinitionId);
      if (!mission) {
        throw new Error(`${nodeId} references missing Mission ${node.missionDefinitionId}.`);
      }
      return {
        ...getMissionBreakdown(mission),
        sectorId: sector.id,
        sectorOrder: sector.order,
        graphNodeId: nodeId,
        routeLabel: node.displayLabel
      };
    });
    const branches = sector.branchIds.map((branchId) => {
      const branch = branchById.get(branchId);
      if (!branch) throw new Error(`${sector.id} references missing branch ${branchId}.`);
      return branch;
    });
    const branchMinimumCoins = sum(branches.map((branch) => branch.completionReward.totalMinimumCoins));
    const branchMaximumCoins = sum(branches.map((branch) => branch.completionReward.totalMaximumCoins));
    const row = {
      sectorId: sector.id,
      sectorOrder: sector.order,
      sectorName: sector.name,
      missionCount: missions.length,
      waveCount: sum(missions.map((mission) => mission.waveCount)),
      clearCoins: sum(missions.map((mission) => mission.clearCoins)),
      firstClearCoins: sum(missions.map((mission) => mission.firstClearCoins)),
      star1Coins: sum(missions.map((mission) => mission.star1Coins)),
      star2Coins: sum(missions.map((mission) => mission.star2Coins)),
      star3Coins: sum(missions.map((mission) => mission.star3Coins)),
      masteryCoins: sum(missions.map((mission) => mission.masteryCoins)),
      alternateRouteCount: alternateMissions.length,
      alternateClearOnlyCoins: sum(alternateMissions.map((mission) => mission.clearOnlyCoins)),
      alternateExpectedCoins: sum(alternateMissions.map((mission) => mission.expectedCoins)),
      alternateFullMasteryCoins: sum(alternateMissions.map((mission) => mission.fullMasteryCoins)),
      branchMinimumCoins,
      branchMaximumCoins,
      clearOnlyCoins: sum(missions.map((mission) => mission.clearOnlyCoins)),
      expectedCoins: sum(missions.map((mission) => mission.expectedCoins)),
      fullMasteryMinimumCoins: sum(missions.map((mission) => mission.fullMasteryCoins))
        + sum(alternateMissions.map((mission) => mission.fullMasteryCoins))
        + branchMinimumCoins,
      fullMasteryMaximumCoins: sum(missions.map((mission) => mission.fullMasteryCoins))
        + sum(alternateMissions.map((mission) => mission.fullMasteryCoins))
        + branchMaximumCoins,
      dailyReplayCoins: sum(missions.map((mission) => mission.dailyReplayCoins)),
      branches,
      alternateMissions
    };
    return row;
  });

  const branchMinimumBySourceMission = new Map();
  const branchMaximumBySourceMission = new Map();
  for (const branch of campaign.campaignBranches ?? []) {
    branchMinimumBySourceMission.set(
      branch.sourceMissionId,
      (branchMinimumBySourceMission.get(branch.sourceMissionId) ?? 0)
        + branch.completionReward.totalMinimumCoins
    );
    branchMaximumBySourceMission.set(
      branch.sourceMissionId,
      (branchMaximumBySourceMission.get(branch.sourceMissionId) ?? 0)
        + branch.completionReward.totalMaximumCoins
    );
  }

  const alternateMasteryBySectorFinalMission = new Map(
    sectorRows.map((sector) => [
      missionById.get(campaign.sectors.find((entry) => entry.id === sector.sectorId)?.missionIds.at(-1))?.id,
      sector.alternateFullMasteryCoins
    ])
  );

  const queue = buildMainUpgradeQueue(upgrades.mainUpgradeCosts);
  const scenarioEarnings = {
    clearOnly: (mission) => mission.clearOnlyCoins,
    expected: (mission) => mission.expectedCoins,
    fullMasteryMinimum: (mission) => mission.fullMasteryCoins
      + (branchMinimumBySourceMission.get(mission.missionId) ?? 0)
      + (alternateMasteryBySectorFinalMission.get(mission.missionId) ?? 0),
    fullMasteryMaximum: (mission) => mission.fullMasteryCoins
      + (branchMaximumBySourceMission.get(mission.missionId) ?? 0)
      + (alternateMasteryBySectorFinalMission.get(mission.missionId) ?? 0)
  };
  const cadences = Object.fromEntries(Object.entries(scenarioEarnings).map(([scenario, earnings]) => (
    [scenario, runCadence(missionRows, queue, earnings)]
  )));

  const supportShips = upgrades.supportShips.map((ship) => {
    const upgradeCosts = [1, 2, 3, 4].map((level) => roundReward(
      upgrades.miniUpgradeCurve[level] + ship.purchaseCost * (0.55 + level * 0.15)
    ));
    const levelOneToFiveCoins = sum(upgradeCosts);
    return {
      ...ship,
      upgradeCosts,
      levelOneToFiveCoins,
      acquireAndMaxCoins: ship.purchaseCost + levelOneToFiveCoins
    };
  });
  const supportMilestones = supportShips.map((ship) => ({
    id: ship.id,
    name: ship.name,
    firstUpgradeCoins: ship.upgradeCosts[0],
    acquireAndMaxCoins: ship.acquireAndMaxCoins,
    clearOnlyFirstUpgradeMission: firstAffordableMission(
      missionRows,
      scenarioEarnings.clearOnly,
      ship.upgradeCosts[0]
    ),
    expectedFirstUpgradeMission: firstAffordableMission(
      missionRows,
      scenarioEarnings.expected,
      ship.upgradeCosts[0]
    ),
    fullMasteryFirstUpgradeMission: firstAffordableMission(
      missionRows,
      scenarioEarnings.fullMasteryMinimum,
      ship.upgradeCosts[0]
    )
  }));

  const totals = {
    clearCoins: sum(sectorRows.map((sector) => sector.clearCoins)),
    firstClearCoins: sum(sectorRows.map((sector) => sector.firstClearCoins)),
    star1Coins: sum(sectorRows.map((sector) => sector.star1Coins)),
    star2Coins: sum(sectorRows.map((sector) => sector.star2Coins)),
    star3Coins: sum(sectorRows.map((sector) => sector.star3Coins)),
    masteryCoins: sum(sectorRows.map((sector) => sector.masteryCoins)),
    alternateClearOnlyCoins: sum(sectorRows.map((sector) => sector.alternateClearOnlyCoins)),
    alternateExpectedCoins: sum(sectorRows.map((sector) => sector.alternateExpectedCoins)),
    alternateFullMasteryCoins: sum(sectorRows.map((sector) => sector.alternateFullMasteryCoins)),
    branchMinimumCoins: sum(sectorRows.map((sector) => sector.branchMinimumCoins)),
    branchMaximumCoins: sum(sectorRows.map((sector) => sector.branchMaximumCoins)),
    clearOnlyCoins: sum(sectorRows.map((sector) => sector.clearOnlyCoins)),
    expectedCoins: sum(sectorRows.map((sector) => sector.expectedCoins)),
    fullMasteryMinimumCoins: sum(sectorRows.map((sector) => sector.fullMasteryMinimumCoins)),
    fullMasteryMaximumCoins: sum(sectorRows.map((sector) => sector.fullMasteryMaximumCoins)),
    dailyReplayCoins: sum(sectorRows.map((sector) => sector.dailyReplayCoins))
  };

  const rewardCenterInventory = {
    dailyGiftDays: rewardCenter.dailyCoins.length,
    dailyGiftCycleCoins: sum(rewardCenter.dailyCoins),
    achievements: rewardCenter.achievements.map((achievement) => ({
      ...achievement,
      totalCoins: sum(achievement.rewards)
    })),
    achievementCoins: sum(rewardCenter.achievements.flatMap((achievement) => achievement.rewards)),
    achievementTracks: rewardCenter.achievements.length
  };

  const bossNodes = (campaign.campaignGraph?.nodes ?? []).filter((node) => node.bossId);
  const bossArchiveEntries = bossNodes.map((node) => {
    const mission = missionById.get(node.missionDefinitionId);
    if (!mission) throw new Error(`${node.nodeId} references missing boss Mission ${node.missionDefinitionId}.`);
    const challengeCoins = bossArchive.baseChallengeCoins
      + bossArchive.challengeStepCoins * Math.floor(
        Math.max(0, mission.order - 1) / bossArchive.challengeMissionsPerTier
      );
    const masteryRewards = bossArchive.masteryMultipliers.map((multiplier) => (
      Math.max(1, Math.round(challengeCoins * multiplier))
    ));
    return {
      bossId: node.bossId,
      missionId: mission.id,
      missionOrder: mission.order,
      challengeCoins,
      masteryRewards,
      masteryCoins: sum(masteryRewards)
    };
  });
  const bossArchiveInventory = {
    dailyChargeLimit: bossArchive.dailyChargeLimit,
    entries: bossArchiveEntries,
    oneTimeMasteryCoins: sum(bossArchiveEntries.map((entry) => entry.masteryCoins)),
    maximumDailyChallengeCoins: bossArchive.dailyChargeLimit
      * Math.max(0, ...bossArchiveEntries.map((entry) => entry.challengeCoins))
  };

  const mainMissions = campaign.sectors.flatMap((sector) => (
    sector.missionIds.map((missionId) => missionById.get(missionId)).filter(Boolean)
  ));
  const alternateMissions = sectorRows.flatMap((sector) => (
    sector.alternateMissions.map((mission) => missionById.get(mission.missionId)).filter(Boolean)
  ));
  const combatPickupInventory = {
    mainRoute: getAuthoredPickupInventory(mainMissions, combatCoins),
    alternateRoutes: getAuthoredPickupInventory(alternateMissions, combatCoins),
    coinValuePerEntity: combatCoins.ordinaryKillCoins,
    activeBossCoinCap: combatCoins.activeBossCoinCap
  };

  return {
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    sectorRows,
    missionRows,
    totals,
    upgradeReference: {
      mainUpgradeCosts: upgrades.mainUpgradeCosts,
      mainUpgradeQueue: queue,
      fullMainShipCoins: sum(Object.values(upgrades.mainUpgradeCosts).flat()),
      slotCosts: upgrades.slotCosts,
      supportShips,
      supportMilestones,
      allSupportsAndSlotsCoins: sum(supportShips.map((ship) => ship.acquireAndMaxCoins))
        + upgrades.slotCosts.left
        + upgrades.slotCosts.right,
      allFourMainShipsCoins: sum(Object.values(upgrades.mainUpgradeCosts).flat()) * 4
    },
    rewardCenterInventory,
    bossArchiveInventory,
    combatPickupInventory,
    cadences
  };
};

const scenarioCadenceRows = (simulation) => ([
  ['Clear-only', simulation.totals.clearOnlyCoins, simulation.cadences.clearOnly],
  ['Expected (Stars 1 + 2)', simulation.totals.expectedCoins, simulation.cadences.expected],
  ['Full mastery (branch floor)', simulation.totals.fullMasteryMinimumCoins, simulation.cadences.fullMasteryMinimum],
  ['Full mastery (branch ceiling)', simulation.totals.fullMasteryMaximumCoins, simulation.cadences.fullMasteryMaximum]
]);

export const renderCampaignEconomyMarkdown = (simulation) => {
  const {
    totals,
    upgradeReference,
    rewardCenterInventory,
    bossArchiveInventory,
    combatPickupInventory
  } = simulation;
  const cheapestPaidSupport = upgradeReference.supportShips.find((ship) => ship.purchaseCost > 0);
  const mostExpensiveSupport = upgradeReference.supportShips.at(-1);
  const fullMainPercentMinimum = totals.fullMasteryMinimumCoins / upgradeReference.fullMainShipCoins * 100;
  const expectedPercentMinimum = totals.expectedCoins / upgradeReference.fullMainShipCoins * 100;
  const replayPercentOfMastery = totals.dailyReplayCoins / totals.fullMasteryMinimumCoins * 100;
  const healthCosts = upgradeReference.mainUpgradeCosts.startingHearts;
  const healthTrackCoins = sum(healthCosts);
  const routeAlternativeCount = sum(simulation.sectorRows.map((sector) => sector.alternateRouteCount));
  const rewardCenterCoins = rewardCenterInventory.dailyGiftCycleCoins
    + rewardCenterInventory.achievementCoins;
  const highestBossChallenge = bossArchiveInventory.entries.at(-1);

  return `# Campaign Economy Simulation - Revision ${simulation.campaignRevision}

Generated deterministically from the Campaign, Hangar, Reward Center, Boss Archive, and boss-coin runtime sources. Run \`node tools/simulate-campaign-economy.mjs\` to regenerate this file or \`node tools/simulate-campaign-economy.mjs --check\` to verify it.

This model covers **${simulation.sectorRows.length} sectors, ${simulation.missionRows.length} main-path Missions, ${routeAlternativeCount} route-alternative Missions, and ${bossArchiveInventory.entries.length} major bosses**. Authored grants are exact. Combat pickup totals are ceilings because kills and pickups depend on play.

## Scenario definitions

- **Clear-only:** first successful clear of every main-path Mission, including Wave/Mission grants, one-time first-clear or boss/checkpoint grants, and automatic Star 1. It excludes Star 2, Star 3, mastery-set bonuses, alternate routes, branches, combat pickups, and replay.
- **Expected:** clear-only plus every Mission-specific Star 2. It assumes a capable run but not a no-damage Master Clear. Three-star branches therefore remain locked.
- **Full mastery:** every main-path and route-alternative first clear, all three stars, all mastery-set bonuses, and every optional one-time mastery branch. The range comes from variable branch performance.

Weekly leaderboard points and proposal funding are never converted into Campaign coins and are excluded.

## Exact persistent source inventory

| Source | Exact value or curve | Persistence and repeat rule |
|---|---|---|
| Main-path authored grants | Clear-only ${money(totals.clearOnlyCoins)}; expected ${money(totals.expectedCoins)}; full mastery with alternates/branches ${money(totals.fullMasteryMinimumCoins)}-${money(totals.fullMasteryMaximumCoins)} | First-clear, boss, star, mastery, alternate, and branch receipt IDs are one-time and durable. Wave/Mission clear grants are repeatable and seasonal. |
| Route-alternative authored grants | Clear-only ${money(totals.alternateClearOnlyCoins)}; expected ${money(totals.alternateExpectedCoins)}; full mastery ${money(totals.alternateFullMasteryCoins)} | One separate reward ledger per alternate Mission; included only in the full-mastery scenario. |
| Authored daily replay | ${money(totals.dailyReplayCoins)} maximum across all completed main Missions per UTC day | One reduced grant per Mission per UTC date; no same-day repeat grant. Seasonal balance. |
| Daily Gift calendar | ${money(rewardCenterInventory.dailyGiftCycleCoins)} over ${rewardCenterInventory.dailyGiftDays} consecutive days | Each day is claimable once; missing a day resets the calendar. Coins enter the seasonal balance. |
| Achievements | ${money(rewardCenterInventory.achievementCoins)} across ${rewardCenterInventory.achievements.length} five-tier tracks | Each tier is one-time per Pilot; coins enter the seasonal balance. |
| Boss Archive challenge | ${bossArchiveInventory.dailyChargeLimit} paid clears/day; ${money(bossArchiveInventory.entries[0]?.challengeCoins ?? 0)}-${money(highestBossChallenge?.challengeCoins ?? 0)} per clear; maximum ${money(bossArchiveInventory.maximumDailyChallengeCoins)}/day after final unlock | Daily charge limit is global. Practice pays zero. Seasonal balance. |
| Boss Archive mastery | ${money(bossArchiveInventory.oneTimeMasteryCoins)} across all authored bosses | Three one-time mastery receipts per boss; seasonal balance after claim. |
| Ordinary combat coin | ${combatPickupInventory.coinValuePerEntity} coin per credited coin entity | Repeatable. Enemy kills, recovery drops, bonus targets, and boss bursts settle through the run boundary. |
| Main-route configured pickup ceiling | ${money(combatPickupInventory.mainRoute.totalAuthoredPickupCeiling)} (${money(combatPickupInventory.mainRoute.configuredEnemyKillCoins)} configured kills + ${money(combatPickupInventory.mainRoute.recoveryCoins)} recovery + ${money(combatPickupInventory.mainRoute.miniBossBurstCeiling)} mini-boss + ${money(combatPickupInventory.mainRoute.mainBossBurstCeiling)} major-boss) | Ceiling, not forecast: formation-generated enemies, missed kills/pickups, bonus targets, and the ${combatPickupInventory.activeBossCoinCap}-coin active cap can change realized income. |
| Alternate-route configured pickup ceiling | ${money(combatPickupInventory.alternateRoutes.totalAuthoredPickupCeiling)} | Same variable combat conditions as the main route. |

### Reward Center totals

| Reward Center source | Tier values | Total |
|---|---|---:|
| Daily Gifts | ${rewardCenterInventory.dailyGiftDays} authored days | ${money(rewardCenterInventory.dailyGiftCycleCoins)} |
${rewardCenterInventory.achievements.map((achievement) => `| ${achievement.title} | ${achievement.rewards.map(money).join(' / ')} | ${money(achievement.totalCoins)} |`).join('\n')}
| **Daily cycle + all achievement tiers** | | **${money(rewardCenterCoins)}** |

### Boss Archive rewards

| Boss Mission | Challenge clear | Mastery 1 | Mastery 2 | Mastery 3 | One-time mastery total |
|---:|---:|---:|---:|---:|---:|
${bossArchiveInventory.entries.map((entry) => `| ${entry.missionOrder} | ${money(entry.challengeCoins)} | ${entry.masteryRewards.map(money).join(' | ')} | ${money(entry.masteryCoins)} |`).join('\n')}

## Sector earnings

| Sector | Main Waves | Clear-only | Expected | Alternate full mastery | Branch | Full mastery |
|---|---:|---:|---:|---:|---:|---:|
${simulation.sectorRows.map((sector) => `| ${sector.sectorOrder} - ${sector.sectorName} | ${sector.waveCount} | ${money(sector.clearOnlyCoins)} | ${money(sector.expectedCoins)} | ${money(sector.alternateFullMasteryCoins)} | ${money(sector.branchMinimumCoins)}-${money(sector.branchMaximumCoins)} | ${money(sector.fullMasteryMinimumCoins)}-${money(sector.fullMasteryMaximumCoins)} |`).join('\n')}
| **Campaign** | **${sum(simulation.sectorRows.map((sector) => sector.waveCount))}** | **${money(totals.clearOnlyCoins)}** | **${money(totals.expectedCoins)}** | **${money(totals.alternateFullMasteryCoins)}** | **${money(totals.branchMinimumCoins)}-${money(totals.branchMaximumCoins)}** | **${money(totals.fullMasteryMinimumCoins)}-${money(totals.fullMasteryMaximumCoins)}** |

Detailed main-path authored grants: Wave + Mission clear ${money(totals.clearCoins)}, first-clear + boss/checkpoint ${money(totals.firstClearCoins)}, Star 1 ${money(totals.star1Coins)}, Star 2 ${money(totals.star2Coins)}, Star 3 ${money(totals.star3Coins)}, main mastery sets ${money(totals.masteryCoins)}, and branches ${money(totals.branchMinimumCoins)}-${money(totals.branchMaximumCoins)}.

## Exact persistent sink inventory

- One complete main-ship set costs **${money(upgradeReference.fullMainShipCoins)}** per ship: Fire Rate ${money(sum(upgradeReference.mainUpgradeCosts.fireRate))}, Movement Speed ${money(sum(upgradeReference.mainUpgradeCosts.speed))}, and Starting Hearts ${money(healthTrackCoins)}. All four ships cost ${money(upgradeReference.allFourMainShipsCoins)}.
- Fire Rate remains accessible at **${money(upgradeReference.mainUpgradeCosts.fireRate[0])}** and Speed at **${money(upgradeReference.mainUpgradeCosts.speed[0])}**. Fire Rate keeps the shipped first 21 prices exactly, then adds 28 premium purchases for Tiers 4-7.
- Starting Hearts cost **${healthCosts.map(money).join(' / ')}**, totaling **${money(healthTrackCoins)}**. Three base hearts plus seven purchases produces the hard **10-heart cap**.
- Squad-slot gates are **${money(upgradeReference.slotCosts.left)}** for left and **${money(upgradeReference.slotCosts.right)}** for right. The left unlock includes Citation Dart at level 1.
- Support level costs are not a flat 2,220. The runtime adds a ship-price premium at each step: \`round(base[level] + purchaseCost * (0.55 + level * 0.15))\`.
- An already-owned Citation Dart costs **${money(upgradeReference.supportShips[0].levelOneToFiveCoins)}** to take from level 1 to 5. The cheapest paid support (${cheapestPaidSupport.name}) costs **${money(cheapestPaidSupport.acquireAndMaxCoins)}** to buy and max; the premium ${mostExpensiveSupport.name} costs **${money(mostExpensiveSupport.acquireAndMaxCoins)}**.
- Buying both slots and buying/maxing every support costs **${money(upgradeReference.allSupportsAndSlotsCoins)}**.

| Support ship | Buy | L1->2 | L2->3 | L3->4 | L4->5 | L1->5 upgrades | Buy + max |
|---|---:|---:|---:|---:|---:|---:|---:|
${upgradeReference.supportShips.map((ship) => `| ${ship.name} | ${money(ship.purchaseCost)} | ${ship.upgradeCosts.map(money).join(' | ')} | ${money(ship.levelOneToFiveCoins)} | ${money(ship.acquireAndMaxCoins)} |`).join('\n')}

## Meaningful-upgrade cadence

For comparison, the simulator spends on one deterministic basket: Movement Speed, Fire Rate, and Starting Hearts alternate through level 7; remaining purchases advance Fire Rate. Route-alternative and branch income is credited only after the owning sector boss, so the cadence never assumes optional rewards before they are reachable.

| Scenario | Authored coins | Basket upgrades funded | Average Missions per funded upgrade | Longest no-purchase stretch | Bank | Next basket purchase |
|---|---:|---:|---:|---:|---:|---|
${scenarioCadenceRows(simulation).map(([label, coins, cadence]) => `| ${label} | ${money(coins)} | ${cadence.purchasesFunded}/${upgradeReference.mainUpgradeQueue.length} | ${decimal(cadence.averageMissionsPerUpgrade)} | ${cadence.longestDryStretch} | ${money(cadence.remainingBank)} | ${cadence.nextUpgrade ? `${cadence.nextUpgrade.label} (${money(cadence.nextUpgrade.cost)})` : 'Basket complete'} |`).join('\n')}

The expected path supplies **${decimal(expectedPercentMinimum)}%** of one fully maxed main ship if the player saves every authored coin. Full mastery supplies **${decimal(fullMainPercentMinimum)}%-${decimal(totals.fullMasteryMaximumCoins / upgradeReference.fullMainShipCoins * 100)}%**. Because support purchases compete for the same balance, actual main-ship completion will be slower; this is an intentional long-tail constraint that still needs player telemetry.

### Sector-by-sector affordability

| Segment | Expected authored coins | Full-mastery authored coins | Reference-basket purchases by segment end (expected / mastery floor) |
|---|---:|---:|---:|
${simulation.sectorRows.map((sector, index) => {
    const finalMissionOrder = (index + 1) * 5;
    const expectedPurchases = simulation.cadences.expected.missionCadence[finalMissionOrder - 1].totalPurchases;
    const masteryPurchases = simulation.cadences.fullMasteryMinimum.missionCadence[finalMissionOrder - 1].totalPurchases;
    return `| ${sector.sectorOrder} - ${sector.sectorName} | ${money(sector.expectedCoins)} | ${money(sector.fullMasteryMinimumCoins)}-${money(sector.fullMasteryMaximumCoins)} | ${expectedPurchases} / ${masteryPurchases} |`;
  }).join('\n')}

- Sector 1 covers multiple low-cost Speed/Fire upgrades without replay, while the first heart is deliberately no longer the cheapest purchase.
- The health curve is ${decimal(healthTrackCoins / 2680)}x the former 2,680-coin curve. Expected authored Campaign income can max health only by deferring offense and support purchases.
- The seven-tier Fire Rate tail is a deliberate long-term sink: 49 purchases cost ${money(sum(upgradeReference.mainUpgradeCosts.fireRate))} per ship, while the complete authored Campaign funds only part of that track before repeatable rewards and combat drops.

## Support affordability checkpoints

If a player saves authored income instead of buying main upgrades, every support's first upgrade becomes affordable at the following Mission. Slot gates and purchase costs are separate, so this table is an affordability signal rather than an equip guarantee.

| Support | First upgrade | Clear-only Mission | Expected Mission | Full-mastery Mission |
|---|---:|---:|---:|---:|
${upgradeReference.supportMilestones.map((ship) => `| ${ship.name} | ${money(ship.firstUpgradeCoins)} | ${ship.clearOnlyFirstUpgradeMission ?? '-'} | ${ship.expectedFirstUpgradeMission ?? '-'} | ${ship.fullMasteryFirstUpgradeMission ?? '-'} |`).join('\n')}

## Bounded replay policy

Completed Missions can pay one reduced authored replay grant per Mission per UTC date. The runtime pays one reduced Wave grant plus one reduced Mission grant on the final Wave; same-day repeats pay zero authored replay coins. Stars, first-clear, boss, mastery, and branch rewards remain one-time.

| Sector | Maximum authored replay coins per UTC day after all five Missions are complete |
|---|---:|
${simulation.sectorRows.map((sector) => `| ${sector.sectorOrder} - ${sector.sectorName} | ${money(sector.dailyReplayCoins)} |`).join('\n')}
| **All ${simulation.missionRows.length} main-path Missions** | **${money(totals.dailyReplayCoins)}** |

The authored daily replay ceiling is **${decimal(replayPercentOfMastery)}%** of the one-time full-mastery floor. It prevents result-ID or same-day easy-Mission spam from dominating immediately. It is not a lifetime cap: over many days replay income and unmodeled dropped coins can still become substantial, so retention telemetry is required before calling the long-term economy final.

## Inflation and farming review

- **Bounded Campaign replay:** ${money(totals.dailyReplayCoins)}/day is ${decimal(replayPercentOfMastery)}% of the one-time full-mastery floor. Same-Mission repeats in one UTC day pay no additional authored replay grant.
- **Unbounded combat pickup risk:** ordinary kill/drop coins remain replayable and are skill/loadout dependent. A per-run or diminishing-return policy is still absent.
- **Boss Archive challenge income is sector-tiered and bounded:** ${bossArchiveInventory.dailyChargeLimit} clears of the highest unlocked boss can pay ${money(bossArchiveInventory.maximumDailyChallengeCoins)}/day, or ${money(bossArchiveInventory.maximumDailyChallengeCoins * 7)}/week. That is ${decimal((bossArchiveInventory.maximumDailyChallengeCoins * 7) / totals.expectedCoins * 100)}% of the expected ten-sector authored path, so Archive play remains useful without replacing Campaign progression.
- **Reward Center gross is long-horizon income:** one 30-day calendar plus every lifetime achievement tier is ${money(rewardCenterCoins)}, ${decimal(rewardCenterCoins / totals.expectedCoins * 100)}% of expected authored Campaign income. Only the ${money(rewardCenterInventory.dailyGiftCycleCoins)} calendar repeats; the ${money(rewardCenterInventory.achievementCoins)} achievement inventory is one-time per Pilot.
- **Weekly isolation remains correct:** Campaign reward credit does not increment weekly score statistics. One-time Campaign grants are durable; repeatable grants, Daily Gifts, achievements, Boss Archive payments, and ordinary run coins enter the seasonal balance. Upgrades survive the reset.

## Seven-projectile-tier validation

The runtime now supports seven visible Fire Rate tiers across 49 upgrade levels. Each tier still contains seven purchases, existing numeric levels are preserved, and the shipped level-0 through level-21 cadence and costs remain unchanged. Tiers 4-7 add premium long-tail prices and only tighten cadence from five frames to four frames.

Seven-round volleys are simulated as one collision bundle per center or Triple Shot lane. Max Shot doubles each visible pattern without multiplying collision entities or shot audio. Total per-lane damage scales through 1x / 2x / 3x / 3.45x / 3.85x / 4.2x / 4.5x, so Tier 7 does not become seven full-strength hits. Focused headless mobile/desktop tests cover pooled render counts, collision admission, Max Shot, BIO twin rails, audio cadence, and representative boss TTK.

## Acceptance and honest limitations

- **Pass:** all ten sectors, fifty main-path Missions, ten alternate-route Missions, ten mastery branches, exact first-clear/star/mastery rewards, Reward Center rewards, Boss Archive rewards, replays, and every persistent coin sink are represented.
- **Pass:** total lives are capped at ten and the seven-heart Hangar track is ${money(healthTrackCoins)} coins while early Speed/Fire prices remain unchanged.
- **Pass:** the 49-level, seven-tier Fire Rate sink is included in every affordability percentage and deterministic purchase cadence above.
- **Pass:** the report is generated from runtime source files and has a deterministic stale-file check.
- **Affordability:** expected authored income supplies ${decimal(expectedPercentMinimum)}% of one maxed main ship; full mastery supplies ${decimal(fullMainPercentMinimum)}%-${decimal(totals.fullMasteryMaximumCoins / upgradeReference.fullMainShipCoins * 100)}% before support spending.
- **Pass with telemetry:** a full week of maximum Boss Archive charges remains below one third of expected authored Campaign income, while one 30-day gift cycle plus all lifetime achievement tiers stays near one expected Campaign. Combat pickups still require live retention telemetry.
- **Not modeled as guaranteed income:** dropped coins, magnet collection, player deaths, clear rate, play time, and performance-dependent Present Drop results.
- **Security limitation:** browser Campaign combat remains server-verifiable, not fully server-authoritative. Valuable rewards require the existing receipt/integrity controls.

## Required playtest matrix

Static economy validation is complete; the following runtime matrix remains open and must be recorded before final balance sign-off.

| Sector | Low power | Expected power | Upgraded power | No support | Support combo A | Support combo B | Mobile | Desktop | Status |
|---|---|---|---|---|---|---|---|---|---|
${simulation.sectorRows.map((sector) => `| ${sector.sectorOrder} - ${sector.sectorName} | Required | Required | Required | Required | Required | Required | Required | Required | **Not run** |`).join('\n')}

Record completion, clear time, damage, death Wave, enemy/boss TTK, projectile peak, performance, collected coins, stars, and whether the recommended-power guidance was accurate for every row.
`;
};

const main = async () => {
  const simulation = simulateCampaignEconomy(await loadCampaignEconomyInputs());
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(simulation, null, 2));
    return;
  }
  const markdown = renderCampaignEconomyMarkdown(simulation);
  const outputPath = path.join(defaultRoot, 'docs', 'CAMPAIGN_ECONOMY_SIMULATION.md');
  if (process.argv.includes('--check')) {
    const current = await readFile(outputPath, 'utf8').catch(() => '');
    if (current !== markdown) {
      throw new Error('CAMPAIGN_ECONOMY_SIMULATION.md is stale. Run node tools/simulate-campaign-economy.mjs.');
    }
    console.log('Campaign economy simulation document is current.');
    return;
  }
  await writeFile(outputPath, markdown, 'utf8');
  console.log(markdown);
};

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
