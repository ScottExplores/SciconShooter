const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const campaign = JSON.parse(read('game-config', 'campaign.json'));
const squadSource = read('services', 'squadProgression.ts');
const weaponTierSource = read('services', 'weaponTierProgression.ts');

const extractExportedNumber = (source, exportName) => {
  const match = source.match(new RegExp(`export const ${exportName}\\s*=\\s*(\\d+)`));
  assert.ok(match, `${exportName} must remain an exported numeric economy constant`);
  return Number(match[1]);
};

const extractNumberList = (source, pattern, label) => {
  const match = source.match(pattern);
  assert.ok(match, `${label} must remain data driven`);
  return [...match[1].matchAll(/\b\d+(?:\.\d+)?\b/g)].map((entry) => Number(entry[0]));
};

const extractMainShipUpgradeCosts = (upgradeId) => {
  const upgrades = squadSource.match(/export const MAIN_SHIP_UPGRADES[\s\S]*?=\s*\[([\s\S]*?)\n\];/);
  assert.ok(upgrades, 'main-ship upgrade catalog must remain data driven');
  const entry = upgrades[1].match(new RegExp(
    `id:\\s*'${upgradeId}'[\\s\\S]*?costs:\\s*\\[([\\s\\S]*?)\\]`
  ));
  assert.ok(entry, `${upgradeId} must expose an authored cost curve`);
  return [...entry[1].matchAll(/\b\d+\b/g)].map((value) => Number(value[0]));
};

const affordablePrefixCount = (costs, budget) => {
  let spent = 0;
  let count = 0;
  for (const cost of costs) {
    if (spent + cost > budget) break;
    spent += cost;
    count += 1;
  }
  return { count, spent };
};

const authoredMissionCoins = (mission) => {
  const progression = mission.campaignProgression;
  return progression.reward.waveClearCoins * mission.waves.length
    + progression.reward.missionClearCoins
    + progression.reward.firstClearCoins
    + progression.reward.bossFirstClearCoins
    + progression.masteryObjectives.reduce((total, objective) => total + objective.rewardCoins, 0);
};

test('Present Drop reward is meaningful against current ship and support costs without skipping a tier', () => {
  const branch = campaign.campaignBranches.find((entry) => entry.missionType === 'present-drop');
  assert.ok(branch, 'the campaign must author a Present Drop branch');

  const minimumReward = branch.completionReward.totalMinimumCoins;
  const maximumReward = branch.completionReward.totalMaximumCoins;
  const fireRateCosts = extractMainShipUpgradeCosts('fireRate');
  const speedCosts = extractMainShipUpgradeCosts('speed');
  const heartCosts = extractMainShipUpgradeCosts('startingHearts');
  const levelsPerTier = extractExportedNumber(weaponTierSource, 'FIRE_RATE_LEVELS_PER_TIER');
  const rightWingCost = extractExportedNumber(squadSource, 'RIGHT_SQUAD_SLOT_UNLOCK_COST');
  const miniUpgradeCurve = extractNumberList(
    squadSource,
    /export const MINI_SHIP_UPGRADE_COST_CURVE\s*=\s*\[([^\]]+)\]/,
    'mini-ship upgrade curve'
  );
  const miniCatalog = squadSource.match(/export const MINI_SHIP_CATALOG[\s\S]*?=\s*\[([\s\S]*?)\]\s*as const;/);
  assert.ok(miniCatalog, 'mini-ship catalog must remain data driven');
  const paidMiniShipCosts = [...miniCatalog[1].matchAll(/purchaseCost:\s*(\d+)/g)]
    .map((entry) => Number(entry[1]))
    .filter((cost) => cost > 0);

  assert.equal(minimumReward, 120, 'the authored successful-run floor should remain deliberate');
  assert.equal(maximumReward, 377, 'the authored perfect-run ceiling should remain deliberate');

  const cheapestStarterUpgrade = Math.min(fireRateCosts[0], speedCosts[0], heartCosts[0]);
  assert.ok(
    minimumReward >= cheapestStarterUpgrade,
    'even the minimum successful reward should buy a real starter ship upgrade'
  );
  assert.ok(
    minimumReward >= Math.min(...paidMiniShipCosts),
    'the minimum reward should also make the first paid support ship attainable'
  );

  const fireRateResult = affordablePrefixCount(fireRateCosts, maximumReward);
  assert.deepEqual(
    fireRateResult,
    { count: 3, spent: 280 },
    'a perfect run should fund three early fire-rate upgrades, not merely pocket change'
  );
  assert.ok(
    fireRateResult.count < levelsPerTier,
    'one optional branch must not complete an entire weapon tier'
  );
  assert.equal(affordablePrefixCount(speedCosts, maximumReward).count, 3);
  assert.equal(
    affordablePrefixCount(heartCosts, maximumReward).count,
    1,
    'premium survivability should not let one branch buy two permanent hearts'
  );

  assert.ok(
    maximumReward >= miniUpgradeCurve[1],
    'a strong branch clear should fund one meaningful support-ship level'
  );
  assert.ok(
    maximumReward < miniUpgradeCurve[1] + miniUpgradeCurve[2],
    'the branch should not hand out two consecutive free-support upgrades'
  );
  assert.ok(maximumReward < rightWingCost, 'the optional cache must not bypass the 500-coin right wing gate');
});

test('Present Drop ceiling remains a minority bonus beside the next five-mission sector', () => {
  const branch = campaign.campaignBranches.find((entry) => entry.missionType === 'present-drop');
  assert.ok(branch, 'the campaign must author a Present Drop branch');

  const sourceIndex = campaign.levels.findIndex((mission) => mission.id === branch.sourceMissionId);
  assert.ok(sourceIndex >= 0, 'the branch source mission must exist');
  const nextSector = campaign.levels.slice(sourceIndex + 1, sourceIndex + 6);
  assert.equal(nextSector.length, 5, 'the balance comparison expects the next five-mission sector');

  const nextSectorCoins = nextSector.reduce((total, mission) => total + authoredMissionCoins(mission), 0);
  const minimumReward = branch.completionReward.totalMinimumCoins;
  const maximumReward = branch.completionReward.totalMaximumCoins;

  // Reviewed 2026-08-02 after the surge waves grew sector clear income ~6%.
  // The branch minimum (120) still clears the 3% noticeability floor by 2.5x,
  // and the maximum stays a minority bonus, so the branch needs no retune.
  assert.equal(nextSectorCoins, 1_576, 'the next-sector economy changed and needs a branch review');
  assert.ok(
    minimumReward >= nextSectorCoins * 0.03,
    'the preserved guaranteed bonus should remain noticeable beside the expanded sector economy'
  );
  assert.ok(
    maximumReward < nextSectorCoins / 3,
    'even a perfect branch clear must not replace one third of the next sector economy'
  );
});
