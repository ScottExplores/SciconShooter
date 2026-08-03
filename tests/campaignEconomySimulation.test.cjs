const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const simulatorUrl = pathToFileURL(path.join(root, 'tools', 'simulate-campaign-economy.mjs')).href;

const loadSimulation = async () => {
  const simulator = await import(simulatorUrl);
  const inputs = await simulator.loadCampaignEconomyInputs(root);
  return {
    simulator,
    simulation: simulator.simulateCampaignEconomy(inputs)
  };
};

test('revision-24 economy reports main, alternate-route, and mastery envelopes for all ten sectors', async () => {
  const { simulation } = await loadSimulation();

  assert.equal(simulation.campaignRevision, 24);
  assert.equal(simulation.sectorRows.length, 10);
  assert.equal(simulation.missionRows.length, 50);
  assert.equal(simulation.sectorRows.every((sector) => sector.missionCount === 5), true);
  assert.equal(simulation.sectorRows.every((sector) => sector.waveCount === 23), true);
  assert.equal(simulation.sectorRows.every((sector) => sector.alternateRouteCount === 1), true);
  assert.deepEqual(
    simulation.sectorRows.map((sector) => ({
      clearOnly: sector.clearOnlyCoins,
      expected: sector.expectedCoins,
      fullMinimum: sector.fullMasteryMinimumCoins,
      fullMaximum: sector.fullMasteryMaximumCoins
    })),
    [
      { clearOnly: 982, expected: 1117, fullMinimum: 2108, fullMaximum: 2365 },
      { clearOnly: 1166, expected: 1326, fullMinimum: 2574, fullMaximum: 2574 },
      { clearOnly: 1364, expected: 1549, fullMinimum: 3021, fullMaximum: 3021 },
      { clearOnly: 1548, expected: 1758, fullMinimum: 3467, fullMaximum: 3467 },
      { clearOnly: 1746, expected: 1981, fullMinimum: 3852, fullMaximum: 3852 },
      { clearOnly: 1930, expected: 2190, fullMinimum: 4262, fullMaximum: 4262 },
      { clearOnly: 2128, expected: 2413, fullMinimum: 4702, fullMaximum: 4702 },
      { clearOnly: 2312, expected: 2622, fullMinimum: 5113, fullMaximum: 5113 },
      { clearOnly: 2510, expected: 2845, fullMinimum: 5537, fullMaximum: 5537 },
      { clearOnly: 2694, expected: 3054, fullMinimum: 5949, fullMaximum: 5949 }
    ]
  );
  assert.deepEqual(simulation.totals, {
    clearCoins: 9070,
    firstClearCoins: 7785,
    star1Coins: 1525,
    star2Coins: 2475,
    star3Coins: 3900,
    masteryCoins: 5700,
    alternateClearOnlyCoins: 4320,
    alternateExpectedCoins: 4815,
    alternateFullMasteryCoins: 6735,
    branchMinimumCoins: 3395,
    branchMaximumCoins: 3652,
    clearOnlyCoins: 18380,
    expectedCoins: 20855,
    fullMasteryMinimumCoins: 40585,
    fullMasteryMaximumCoins: 40842,
    dailyReplayCoins: 825
  });
});

test('economy simulation consumes premium-adjusted support and main-ship costs from the runtime catalog', async () => {
  const { simulation } = await loadSimulation();
  const reference = simulation.upgradeReference;

  assert.equal(reference.fullMainShipCoins, 567445);
  assert.equal(reference.allFourMainShipsCoins, 2269780);
  assert.equal(reference.allSupportsAndSlotsCoins, 38310);
  assert.equal(reference.mainUpgradeCosts.fireRate.length, 49);
  assert.equal(reference.mainUpgradeCosts.fireRate.slice(0, 21).reduce((sum, cost) => sum + cost, 0), 40250);
  assert.equal(reference.mainUpgradeCosts.fireRate.reduce((sum, cost) => sum + cost, 0), 551350);
  assert.equal(reference.mainUpgradeQueue.length, 68);
  // Every purchasable track appears in the purchase model, so the cost to max a
  // hull stays truthful as tracks come and go.
  assert.deepEqual(Object.keys(reference.mainUpgradeCosts), ['fireRate', 'speed', 'ability', 'startingHearts']);
  assert.equal(reference.mainUpgradeQueue.reduce((sum, entry) => sum + entry.cost, 0), reference.fullMainShipCoins);
  assert.deepEqual(reference.mainUpgradeCosts.startingHearts, [180, 320, 560, 900, 1400, 2100, 3000]);
  assert.deepEqual(reference.slotCosts, { left: 50, right: 500 });
  assert.equal(reference.supportShips.length, 10);
  assert.deepEqual(reference.supportShips[0], {
    id: 'citation-dart',
    name: 'Citation Dart',
    purchaseCost: 0,
    upgradeCosts: [160, 360, 650, 1050],
    levelOneToFiveCoins: 2220,
    acquireAndMaxCoins: 2220
  });
  assert.deepEqual(reference.supportShips.at(-1), {
    id: 'nebula-tern',
    name: 'Nebula Tern',
    purchaseCost: 760,
    upgradeCosts: [692, 1006, 1410, 1924],
    levelOneToFiveCoins: 5032,
    acquireAndMaxCoins: 5792
  });
  // Homing Missiles was retired from the Hangar (homing is the wing's job),
  // so a hull is cheaper to max and the Campaign funds fewer, costlier tiers.
  assert.equal(simulation.cadences.clearOnly.purchasesFunded, 27);
  assert.equal(simulation.cadences.expected.purchasesFunded, 29);
  assert.equal(simulation.cadences.fullMasteryMinimum.purchasesFunded, 37);
  // Clearing Missions must always fund fewer upgrades than mastering them,
  // or mastery objectives stop being worth playing for.
  assert.ok(
    simulation.cadences.clearOnly.purchasesFunded < simulation.cadences.fullMasteryMinimum.purchasesFunded
  );
});

test('authored replay, route, and branch income stay bounded and separate from weekly statistics', async () => {
  const { simulation } = await loadSimulation();
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const squadSource = fs.readFileSync(path.join(root, 'services', 'squadProgression.ts'), 'utf8').replace(/\r\n/g, '\n');
  const progressionSource = fs.readFileSync(path.join(root, 'services', 'campaignProgression.ts'), 'utf8').replace(/\r\n/g, '\n');

  assert.equal(campaign.campaignBranches.length, 10);
  assert.deepEqual(
    campaign.campaignBranches.map((branch) => branch.completionReward.totalMinimumCoins),
    [120, 210, 260, 330, 325, 360, 395, 430, 465, 500]
  );
  assert.equal(campaign.campaignBranches.every((branch) => branch.replayPolicy === 'no-replay-after-claim'), true);
  assert.deepEqual(
    simulation.sectorRows.map((sector) => sector.dailyReplayCoins),
    [47, 54, 63, 70, 78, 86, 96, 102, 111, 118]
  );

  const campaignCreditBody = squadSource.match(
    /export const creditCampaignRewardGrants\s*=([\s\S]*?)\n\};\n\nexport const buildRuntimeSquadLoadout/
  );
  assert.ok(campaignCreditBody, 'Campaign credit boundary must remain inspectable');
  assert.doesNotMatch(campaignCreditBody[1], /weeklyStats\s*:/);
  assert.match(campaignCreditBody[1], /durableCampaignCoins:\s*state\.durableCampaignCoins \+ durableCreditedAmount/);
  assert.match(progressionSource, /replayRewardEpochByMission/);
  assert.match(progressionSource, /previousReplayRewardEpoch/);
  assert.match(progressionSource, /replayRewardEpoch > previousReplayRewardEpoch/);
});

test('Reward Center, Boss Archive, and combat pickup sources remain explicit', async () => {
  const { simulation } = await loadSimulation();

  assert.equal(simulation.rewardCenterInventory.dailyGiftDays, 30);
  assert.equal(simulation.rewardCenterInventory.dailyGiftCycleCoins, 9450);
  // Twelve tracks now, not six: the Campaign graph, Weekly Run, Elite Bosses,
  // and Hangar each earned one. The lifetime pool only grew by 500 coins
  // because the six arcade tracks were rebalanced down to make room -- the
  // guardrail below caps free lifetime income near one expected Campaign.
  assert.equal(simulation.rewardCenterInventory.achievementCoins, 10900);
  assert.equal(simulation.rewardCenterInventory.achievementTracks, 12);
  assert.equal(simulation.bossArchiveInventory.entries.length, 10);
  assert.equal(simulation.bossArchiveInventory.dailyChargeLimit, 3);
  assert.equal(simulation.bossArchiveInventory.oneTimeMasteryCoins, 5700);
  assert.equal(simulation.bossArchiveInventory.maximumDailyChallengeCoins, 840);
  assert.ok(
    simulation.bossArchiveInventory.maximumDailyChallengeCoins * 7
      <= simulation.totals.expectedCoins / 3,
    'a full week of Archive charges must not replace the authored Campaign'
  );
  assert.ok(
    simulation.rewardCenterInventory.dailyGiftCycleCoins
      + simulation.rewardCenterInventory.achievementCoins
      <= simulation.totals.expectedCoins * 1.05,
    'one calendar plus every lifetime achievement must stay near one expected Campaign'
  );
  assert.equal(simulation.combatPickupInventory.coinValuePerEntity, 1);
  assert.equal(simulation.combatPickupInventory.activeBossCoinCap, 128);
  assert.ok(simulation.combatPickupInventory.mainRoute.totalAuthoredPickupCeiling > 0);
});

test('checked-in economy report is deterministic, current, and free of mojibake', async () => {
  const { simulator, simulation } = await loadSimulation();
  const expected = simulator.renderCampaignEconomyMarkdown(simulation);
  const checkedIn = fs.readFileSync(
    path.join(root, 'docs', 'CAMPAIGN_ECONOMY_SIMULATION.md'),
    'utf8'
  );

  assert.equal(checkedIn.replaceAll('\r\n', '\n'), expected.replaceAll('\r\n', '\n'));
  assert.doesNotMatch(checkedIn, /â€”|â†’|ï¿½/);
  assert.match(checkedIn, /\*\*Not run\*\*/);
});
