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

test('revision-22 economy reports clear-only, expected, and full-mastery envelopes for all four sectors', async () => {
  const { simulation } = await loadSimulation();

  assert.equal(simulation.campaignRevision, 22);
  assert.equal(simulation.sectorRows.length, 4);
  assert.equal(simulation.missionRows.length, 20);
  assert.equal(simulation.sectorRows.every((sector) => sector.missionCount === 5), true);
  assert.equal(simulation.sectorRows.every((sector) => sector.waveCount === 24), true);
  assert.deepEqual(
    simulation.sectorRows.map((sector) => ({
      clearOnly: sector.clearOnlyCoins,
      expected: sector.expectedCoins,
      fullMinimum: sector.fullMasteryMinimumCoins,
      fullMaximum: sector.fullMasteryMaximumCoins
    })),
    [
      { clearOnly: 1709, expected: 2059, fullMinimum: 3479, fullMaximum: 3736 },
      { clearOnly: 2195, expected: 2620, fullMinimum: 4430, fullMaximum: 4430 },
      { clearOnly: 2681, expected: 3181, fullMinimum: 5341, fullMaximum: 5341 },
      { clearOnly: 3167, expected: 3742, fullMinimum: 6272, fullMaximum: 6272 }
    ]
  );
  assert.deepEqual(simulation.totals, {
    clearCoins: 3562,
    firstClearCoins: 4990,
    star1Coins: 1200,
    star2Coins: 1850,
    star3Coins: 3050,
    masteryCoins: 3950,
    branchMinimumCoins: 920,
    branchMaximumCoins: 1177,
    clearOnlyCoins: 9752,
    expectedCoins: 11602,
    fullMasteryMinimumCoins: 19522,
    fullMasteryMaximumCoins: 19779,
    dailyReplayCoins: 475
  });
});

test('economy simulation consumes premium-adjusted support and main-ship costs from the runtime catalog', async () => {
  const { simulation } = await loadSimulation();
  const reference = simulation.upgradeReference;

  assert.equal(reference.fullMainShipCoins, 44765);
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
  assert.equal(simulation.cadences.clearOnly.purchasesFunded, 24);
  assert.equal(simulation.cadences.expected.purchasesFunded, 26);
  assert.equal(simulation.cadences.fullMasteryMinimum.purchasesFunded, 29);
});

test('authored replay and branch income stay bounded and separate from weekly statistics', async () => {
  const { simulation } = await loadSimulation();
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const squadSource = fs.readFileSync(path.join(root, 'services', 'squadProgression.ts'), 'utf8');
  const progressionSource = fs.readFileSync(path.join(root, 'services', 'campaignProgression.ts'), 'utf8');

  assert.equal(campaign.campaignBranches.length, 4);
  assert.deepEqual(
    campaign.campaignBranches.map((branch) => branch.completionReward.totalMinimumCoins),
    [120, 210, 260, 330]
  );
  assert.equal(campaign.campaignBranches.every((branch) => branch.replayPolicy === 'no-replay-after-claim'), true);
  assert.deepEqual(simulation.sectorRows.map((sector) => sector.dailyReplayCoins), [85, 105, 130, 155]);

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

test('checked-in economy report is deterministic, current, and free of mojibake', async () => {
  const { simulator, simulation } = await loadSimulation();
  const expected = simulator.renderCampaignEconomyMarkdown(simulation);
  const checkedIn = fs.readFileSync(
    path.join(root, 'docs', 'CAMPAIGN_ECONOMY_SIMULATION.md'),
    'utf8'
  );

  assert.equal(checkedIn, expected);
  assert.doesNotMatch(checkedIn, /â€”|â†’|ï¿½/);
  assert.match(checkedIn, /\*\*Not run\*\*/);
});
