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
  // REVAMP_NOTES_B: wave income follows generated encounter counts. Recompute
  // the grants independently, then prove every envelope and aggregate balances.
  const { simulation } = await loadSimulation();
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  assert.equal(simulation.campaignRevision, campaign.revision);
  assert.equal(simulation.sectorRows.length, 10);
  assert.equal(simulation.missionRows.length, 50);
  for (const row of simulation.missionRows) {
    const level = campaign.levels.find(level => level.id === row.missionId);
    const reward = level.campaignProgression.reward;
    assert.equal(row.waveCount, level.waves.length);
    assert.equal(row.clearCoins, level.waves.length * reward.waveClearCoins + reward.missionClearCoins);
    assert.equal(row.firstClearCoins, reward.firstClearCoins + reward.bossFirstClearCoins);
    assert.equal(row.clearOnlyCoins, row.clearCoins + row.firstClearCoins + row.star1Coins);
    assert.equal(row.expectedCoins, row.clearOnlyCoins + row.star2Coins);
    assert.equal(row.fullMasteryCoins, row.expectedCoins + row.star3Coins + row.masteryCoins);
  }
  for (const row of simulation.sectorRows) {
    const missions = simulation.missionRows.filter(mission => mission.sectorId === row.sectorId);
    assert.equal(missions.length, 5);
    assert.equal(row.alternateRouteCount, 1);
    assert.equal(row.waveCount, missions.reduce((sum, mission) => sum + mission.waveCount, 0));
    assert.equal(row.clearOnlyCoins, missions.reduce((sum, mission) => sum + mission.clearOnlyCoins, 0));
    assert.equal(row.expectedCoins, missions.reduce((sum, mission) => sum + mission.expectedCoins, 0));
    const mastery = missions.reduce((sum, mission) => sum + mission.fullMasteryCoins, 0) + row.alternateFullMasteryCoins;
    assert.equal(row.fullMasteryMinimumCoins, mastery + row.branchMinimumCoins);
    assert.equal(row.fullMasteryMaximumCoins, mastery + row.branchMaximumCoins);
    assert.ok(row.clearOnlyCoins < row.expectedCoins && row.expectedCoins < row.fullMasteryMinimumCoins);
  }
  for (const [key, value] of Object.entries(simulation.totals)) {
    assert.equal(value, simulation.sectorRows.reduce((sum, row) => sum + row[key], 0), key);
    assert.ok(Number.isSafeInteger(value) && value > 0, key);
  }

});

test('economy simulation consumes premium-adjusted support and main-ship costs from the runtime catalog', async () => {
  const { simulation } = await loadSimulation();
  const reference = simulation.upgradeReference;

  assert.equal(reference.fullMainShipCoins, 571445);
  assert.equal(reference.allFourMainShipsCoins, 2285780);
  assert.equal(reference.allSupportsAndSlotsCoins, 38310);
  assert.equal(reference.mainUpgradeCosts.fireRate.length, 49);
  assert.equal(reference.mainUpgradeCosts.fireRate.slice(0, 21).reduce((sum, cost) => sum + cost, 0), 40250);
  assert.equal(reference.mainUpgradeCosts.fireRate.reduce((sum, cost) => sum + cost, 0), 551350);
  assert.equal(reference.mainUpgradeQueue.length, 69);
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
  for (const cadence of Object.values(simulation.cadences)) {
    let bank = 0;
    let count = 0;
    for (const mission of cadence.missionCadence) {
      bank += mission.earned;
      for (const purchase of mission.purchases) {
        assert.equal(purchase.cost, reference.mainUpgradeCosts[purchase.id][purchase.level - 1]);
        assert.ok(bank >= purchase.cost, 'no upgrade can overspend earned coins');
        bank -= purchase.cost;
        count++;
      }
      assert.equal(mission.bank, bank);
      assert.equal(mission.totalPurchases, count);
    }
    assert.equal(cadence.purchasesFunded, count);
    assert.equal(cadence.remainingBank, bank);
    assert.ok(bank < cadence.nextUpgrade.cost);
  }
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
