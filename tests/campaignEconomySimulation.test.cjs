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
  assert.equal(simulation.sectorRows.every((sector) => sector.waveCount === 18), true);
  assert.equal(simulation.sectorRows.every((sector) => sector.alternateRouteCount === 1), true);
  assert.deepEqual(
    simulation.sectorRows.map((sector) => ({
      clearOnly: sector.clearOnlyCoins,
      expected: sector.expectedCoins,
      fullMinimum: sector.fullMasteryMinimumCoins,
      fullMaximum: sector.fullMasteryMaximumCoins
    })),
    [
      { clearOnly: 911, expected: 1046, fullMinimum: 1986, fullMaximum: 2243 },
      { clearOnly: 1082, expected: 1242, fullMinimum: 2430, fullMaximum: 2430 },
      { clearOnly: 1265, expected: 1450, fullMinimum: 2850, fullMaximum: 2850 },
      { clearOnly: 1436, expected: 1646, fullMinimum: 3274, fullMaximum: 3274 },
      { clearOnly: 1619, expected: 1854, fullMinimum: 3635, fullMaximum: 3635 },
      { clearOnly: 1790, expected: 2050, fullMinimum: 4023, fullMaximum: 4023 },
      { clearOnly: 1973, expected: 2258, fullMinimum: 4433, fullMaximum: 4433 },
      { clearOnly: 2144, expected: 2454, fullMinimum: 4822, fullMaximum: 4822 },
      { clearOnly: 2327, expected: 2662, fullMinimum: 5222, fullMaximum: 5222 },
      { clearOnly: 2498, expected: 2858, fullMinimum: 5612, fullMaximum: 5612 }
    ]
  );
  assert.deepEqual(simulation.totals, {
    clearCoins: 7735,
    firstClearCoins: 7785,
    star1Coins: 1525,
    star2Coins: 2475,
    star3Coins: 3900,
    masteryCoins: 5700,
    alternateClearOnlyCoins: 3357,
    alternateExpectedCoins: 3852,
    alternateFullMasteryCoins: 5772,
    branchMinimumCoins: 3395,
    branchMaximumCoins: 3652,
    clearOnlyCoins: 17045,
    expectedCoins: 19520,
    fullMasteryMinimumCoins: 38287,
    fullMasteryMaximumCoins: 38544,
    dailyReplayCoins: 825
  });
});

test('economy simulation consumes premium-adjusted support and main-ship costs from the runtime catalog', async () => {
  const { simulation } = await loadSimulation();
  const reference = simulation.upgradeReference;

  assert.equal(reference.fullMainShipCoins, 561645);
  assert.equal(reference.allFourMainShipsCoins, 2246580);
  assert.equal(reference.allSupportsAndSlotsCoins, 38310);
  assert.equal(reference.mainUpgradeCosts.fireRate.length, 49);
  assert.equal(reference.mainUpgradeCosts.fireRate.slice(0, 21).reduce((sum, cost) => sum + cost, 0), 40250);
  assert.equal(reference.mainUpgradeCosts.fireRate.reduce((sum, cost) => sum + cost, 0), 551350);
  assert.equal(reference.mainUpgradeQueue.length, 63);
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
  assert.equal(simulation.cadences.clearOnly.purchasesFunded, 25);
  assert.equal(simulation.cadences.expected.purchasesFunded, 27);
  assert.equal(simulation.cadences.fullMasteryMinimum.purchasesFunded, 32);
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
  assert.equal(simulation.rewardCenterInventory.achievementCoins, 10400);
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
