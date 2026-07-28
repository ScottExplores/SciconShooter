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

const parseUpgradeInputs = (squadSource) => {
  const upgradeBlock = requireMatch(
    squadSource,
    /export const MAIN_SHIP_UPGRADES[\s\S]*?=\s*\[([\s\S]*?)\n\];/,
    'MAIN_SHIP_UPGRADES'
  )[1];
  const mainUpgradeCosts = Object.fromEntries(
    ['fireRate', 'speed', 'startingHearts'].map((upgradeId) => {
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

export const loadCampaignEconomyInputs = async (root = defaultRoot) => {
  const [campaignSource, squadSource] = await Promise.all([
    readFile(path.join(root, 'game-config', 'campaign.json'), 'utf8'),
    readFile(path.join(root, 'services', 'squadProgression.ts'), 'utf8')
  ]);
  return {
    campaign: JSON.parse(campaignSource),
    upgrades: parseUpgradeInputs(squadSource)
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

const buildMainUpgradeQueue = (mainUpgradeCosts) => {
  const queue = [];
  const sharedLevels = Math.max(
    mainUpgradeCosts.speed.length,
    mainUpgradeCosts.startingHearts.length
  );
  for (let level = 0; level < sharedLevels; level += 1) {
    for (const id of ['speed', 'fireRate', 'startingHearts']) {
      const cost = mainUpgradeCosts[id][level];
      if (Number.isFinite(cost)) {
        queue.push({ id, level: level + 1, label: `${id} ${level + 1}`, cost });
      }
    }
  }
  for (let level = sharedLevels; level < mainUpgradeCosts.fireRate.length; level += 1) {
    queue.push({
      id: 'fireRate',
      level: level + 1,
      label: `fireRate ${level + 1}`,
      cost: mainUpgradeCosts.fireRate[level]
    });
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

export const simulateCampaignEconomy = ({ campaign, upgrades }) => {
  const missionById = new Map(campaign.levels.map((mission) => [mission.id, mission]));
  const branchById = new Map((campaign.campaignBranches ?? []).map((branch) => [branch.branchId, branch]));
  const missionRows = [];
  const sectorRows = campaign.sectors.map((sector) => {
    const missions = sector.missionIds.map((missionId) => {
      const mission = missionById.get(missionId);
      if (!mission) throw new Error(`${sector.id} references missing Mission ${missionId}.`);
      const row = { ...getMissionBreakdown(mission), sectorId: sector.id, sectorOrder: sector.order };
      missionRows.push(row);
      return row;
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
      branchMinimumCoins,
      branchMaximumCoins,
      clearOnlyCoins: sum(missions.map((mission) => mission.clearOnlyCoins)),
      expectedCoins: sum(missions.map((mission) => mission.expectedCoins)),
      fullMasteryMinimumCoins: sum(missions.map((mission) => mission.fullMasteryCoins)) + branchMinimumCoins,
      fullMasteryMaximumCoins: sum(missions.map((mission) => mission.fullMasteryCoins)) + branchMaximumCoins,
      dailyReplayCoins: sum(missions.map((mission) => mission.dailyReplayCoins)),
      branches
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

  const queue = buildMainUpgradeQueue(upgrades.mainUpgradeCosts);
  const scenarioEarnings = {
    clearOnly: (mission) => mission.clearOnlyCoins,
    expected: (mission) => mission.expectedCoins,
    fullMasteryMinimum: (mission) => mission.fullMasteryCoins
      + (branchMinimumBySourceMission.get(mission.missionId) ?? 0),
    fullMasteryMaximum: (mission) => mission.fullMasteryCoins
      + (branchMaximumBySourceMission.get(mission.missionId) ?? 0)
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
    branchMinimumCoins: sum(sectorRows.map((sector) => sector.branchMinimumCoins)),
    branchMaximumCoins: sum(sectorRows.map((sector) => sector.branchMaximumCoins)),
    clearOnlyCoins: sum(sectorRows.map((sector) => sector.clearOnlyCoins)),
    expectedCoins: sum(sectorRows.map((sector) => sector.expectedCoins)),
    fullMasteryMinimumCoins: sum(sectorRows.map((sector) => sector.fullMasteryMinimumCoins)),
    fullMasteryMaximumCoins: sum(sectorRows.map((sector) => sector.fullMasteryMaximumCoins)),
    dailyReplayCoins: sum(sectorRows.map((sector) => sector.dailyReplayCoins))
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
      supportMilestones
    },
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
  const { totals, upgradeReference } = simulation;
  const cheapestPaidSupport = upgradeReference.supportShips.find((ship) => ship.purchaseCost > 0);
  const mostExpensiveSupport = upgradeReference.supportShips.at(-1);
  const fullMainPercentMinimum = totals.fullMasteryMinimumCoins / upgradeReference.fullMainShipCoins * 100;
  const expectedPercentMinimum = totals.expectedCoins / upgradeReference.fullMainShipCoins * 100;
  const replayPercentOfMastery = totals.dailyReplayCoins / totals.fullMasteryMinimumCoins * 100;

  return `# Campaign Economy Simulation - Revision ${simulation.campaignRevision}

Generated from \`game-config/campaign.json\` and the real upgrade catalogs in \`services/squadProgression.ts\`. This is a static authored-reward model; it is not a substitute for combat telemetry or a full player-economy forecast.

## Scenario definitions

- **Clear-only:** first successful clear of every main-path Mission, including all Wave/Mission grants, one-time first-clear or boss/checkpoint grants, and the automatic Mission-clear Star 1. It excludes Star 2, Star 3, mastery-set bonuses, branches, ordinary in-wave coin pickups, and replay.
- **Expected:** clear-only plus every Mission-specific Star 2. It assumes a capable run but not a no-damage Master Clear. Three-star branches therefore remain locked.
- **Full mastery:** all main-path first-clear grants, all three stars, all mastery-set bonuses, and every optional one-time branch. The range comes only from Present Drop performance (120-377); the other three branches are fixed.

## Sector earnings

| Sector | Waves | Wave + Mission clear | First-clear + challenge | Star 1 | Star 2 | Star 3 | Mastery set | Branch | Clear-only | Expected | Full mastery |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${simulation.sectorRows.map((sector) => `| ${sector.sectorOrder} - ${sector.sectorName} | ${sector.waveCount} | ${money(sector.clearCoins)} | ${money(sector.firstClearCoins)} | ${money(sector.star1Coins)} | ${money(sector.star2Coins)} | ${money(sector.star3Coins)} | ${money(sector.masteryCoins)} | ${money(sector.branchMinimumCoins)}-${money(sector.branchMaximumCoins)} | ${money(sector.clearOnlyCoins)} | ${money(sector.expectedCoins)} | ${money(sector.fullMasteryMinimumCoins)}-${money(sector.fullMasteryMaximumCoins)} |`).join('\n')}
| **Campaign** | **${sum(simulation.sectorRows.map((sector) => sector.waveCount))}** | **${money(totals.clearCoins)}** | **${money(totals.firstClearCoins)}** | **${money(totals.star1Coins)}** | **${money(totals.star2Coins)}** | **${money(totals.star3Coins)}** | **${money(totals.masteryCoins)}** | **${money(totals.branchMinimumCoins)}-${money(totals.branchMaximumCoins)}** | **${money(totals.clearOnlyCoins)}** | **${money(totals.expectedCoins)}** | **${money(totals.fullMasteryMinimumCoins)}-${money(totals.fullMasteryMaximumCoins)}** |

The three scenarios award **${money(totals.clearOnlyCoins)}**, **${money(totals.expectedCoins)}**, and **${money(totals.fullMasteryMinimumCoins)}-${money(totals.fullMasteryMaximumCoins)}** authored coins respectively. Ordinary dropped coins are deliberately excluded because their realized value depends on kills, pickup skill, and support loadout.

## Upgrade costs from the runtime catalog

- One complete main-ship set for one ship costs **${money(upgradeReference.fullMainShipCoins)}**: Fire Rate ${money(sum(upgradeReference.mainUpgradeCosts.fireRate))}, Movement Speed ${money(sum(upgradeReference.mainUpgradeCosts.speed))}, and Starting Hearts ${money(sum(upgradeReference.mainUpgradeCosts.startingHearts))}.
- Main-ship choices begin at **55-90 coins**. The final Fire Rate purchase is **${money(upgradeReference.mainUpgradeCosts.fireRate.at(-1))} coins**.
- Squad-slot gates are **${money(upgradeReference.slotCosts.left)}** for left and **${money(upgradeReference.slotCosts.right)}** for right. The left unlock includes Citation Dart at level 1.
- Support level costs are not a flat 2,220. The runtime adds a ship-price premium at each step: \`round(base[level] + purchaseCost * (0.55 + level * 0.15))\`.
- An already-owned Citation Dart costs **${money(upgradeReference.supportShips[0].levelOneToFiveCoins)}** to take from level 1 to 5. The cheapest paid support (${cheapestPaidSupport.name}) costs **${money(cheapestPaidSupport.acquireAndMaxCoins)}** to buy and max; the premium ${mostExpensiveSupport.name} costs **${money(mostExpensiveSupport.acquireAndMaxCoins)}**.

| Support ship | Buy | L1->2 | L2->3 | L3->4 | L4->5 | L1->5 upgrades | Buy + max |
|---|---:|---:|---:|---:|---:|---:|---:|
${upgradeReference.supportShips.map((ship) => `| ${ship.name} | ${money(ship.purchaseCost)} | ${ship.upgradeCosts.map(money).join(' | ')} | ${money(ship.levelOneToFiveCoins)} | ${money(ship.acquireAndMaxCoins)} |`).join('\n')}

## Meaningful-upgrade cadence

For comparison, the simulator spends on one deterministic, balanced main-ship basket: Movement Speed, Fire Rate, and Starting Hearts alternate through level 7; remaining purchases advance Fire Rate. This is a reference path, not a required build. Branches are credited after their source sector and full-mastery cadence uses the conservative branch floor.

| Scenario | Authored coins | Basket upgrades funded | Average Missions per funded upgrade | Longest no-purchase stretch | Bank | Next basket purchase |
|---|---:|---:|---:|---:|---:|---|
${scenarioCadenceRows(simulation).map(([label, coins, cadence]) => `| ${label} | ${money(coins)} | ${cadence.purchasesFunded}/${upgradeReference.mainUpgradeQueue.length} | ${decimal(cadence.averageMissionsPerUpgrade)} | ${cadence.longestDryStretch} | ${money(cadence.remainingBank)} | ${cadence.nextUpgrade ? `${cadence.nextUpgrade.label} (${money(cadence.nextUpgrade.cost)})` : 'Basket complete'} |`).join('\n')}

The expected path supplies **${decimal(expectedPercentMinimum)}%** of one fully maxed main ship if the player saves every authored coin. Full mastery supplies **${decimal(fullMainPercentMinimum)}%-${decimal(totals.fullMasteryMaximumCoins / upgradeReference.fullMainShipCoins * 100)}%**. Because support purchases compete for the same balance, actual main-ship completion will be slower; this is an intentional long-tail constraint that still needs player telemetry.

### Early, mid, and late progression

| Segment | Expected authored coins | Full-mastery authored coins | Reference-basket purchases by segment end (expected / mastery floor) |
|---|---:|---:|---:|
${simulation.sectorRows.map((sector, index) => {
    const finalMissionOrder = (index + 1) * 5;
    const expectedPurchases = simulation.cadences.expected.missionCadence[finalMissionOrder - 1].totalPurchases;
    const masteryPurchases = simulation.cadences.fullMasteryMinimum.missionCadence[finalMissionOrder - 1].totalPurchases;
    return `| ${sector.sectorOrder} - ${sector.sectorName} | ${money(sector.expectedCoins)} | ${money(sector.fullMasteryMinimumCoins)}-${money(sector.fullMasteryMaximumCoins)} | ${expectedPurchases} / ${masteryPurchases} |`;
  }).join('\n')}

- **Early (Sector 1):** starter costs are covered without replay; saving mastery income can also open a slot or begin a support build.
- **Mid (Sectors 2-3):** authored income reaches 630-2,190 coin main choices and meaningful support premiums without a single sector buying an entire advanced track.
- **Late (Sector 4):** rewards materially advance 2,600+ Fire Rate decisions, but the 3,050-6,050 tail remains a long-term choice rather than an automatic max-out.
- The reference basket's longest authored savings stretch is one Mission for clear-only/expected and two Missions at the advanced full-mastery tail. This avoids a long static drought, but does not prove that every player-selected purchase order feels equally smooth.

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
| **All 20 Missions** | **${money(totals.dailyReplayCoins)}** |

The authored daily replay ceiling is **${decimal(replayPercentOfMastery)}%** of the one-time full-mastery floor. It prevents result-ID or same-day easy-Mission spam from dominating immediately. It is not a lifetime cap: over many days replay income and unmodeled dropped coins can still become substantial, so retention telemetry is required before calling the long-term economy final.

## Weekly isolation

- The simulation counts no weekly leaderboard reward or weekly-run earnings.
- \`creditCampaignRewardGrants\` adds Campaign grants to spendable coins without incrementing \`weeklyStats\`; Campaign progress and reward receipt IDs remain separate from weekly score/lives/checkpoints.
- One-time first-clear, boss, star, mastery, and branch coins enter the protected durable Campaign reserve and survive the Sunday rollover when unspent.
- Repeatable Wave/Mission/replay grants are intentionally not added to that durable reserve. Any unspent repeatable portion can be removed at rollover; this anti-farm distinction should be made clear to players if balances are surfaced as permanent Campaign currency.
- Ship/support upgrades and Campaign records persist independently of the weekly competition reset.

## Acceptance and honest limitations

- **Pass (static authored model):** clear-only and expected paths fund starter and mid-tier choices without forced replay; every fully mastered sector gives a meaningful step toward the next reference purchase; branches are useful but never replace the following sector.
- **Pass (reward bounds):** Present Drop remains 120-377, the other branches are fixed at 210/260/330, all are one-time, and the daily authored replay ceiling is bounded to ${money(totals.dailyReplayCoins)} across the entire campaign.
- **Warning:** full mastery yields only ${decimal(fullMainPercentMinimum)}%-${decimal(totals.fullMasteryMaximumCoins / upgradeReference.fullMainShipCoins * 100)}% of one complete main-ship set before support spending. That preserves a long tail, but late-tier grind perception must be tested rather than inferred.
- **Warning:** ordinary enemy/boss coin drops, coin-magnet effects, deaths, clear rates, play time, and player purchase order are not modeled. Actual earnings will be higher and more variable.
- **Warning:** the model covers the authored four-sector, 20-Mission revision-22 campaign only. It must be rerun when rewards, branches, upgrade prices, or new sectors change.
- **Not yet proven:** low/expected/upgraded loadout clear rates, mandatory-support risk, mobile/desktop performance, damage, death Wave, enemy/boss TTK, projectile peaks, and power-guidance accuracy require live Campaign Lab playtests.
- **Security limitation:** wallet persistence sanitizes and de-duplicates receipts, but browser-reported Campaign combat is not fully server-authoritative. Higher-value rewards still need the existing integrity roadmap.

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
