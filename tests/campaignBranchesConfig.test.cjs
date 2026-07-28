const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const validatorUrl = pathToFileURL(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs')).href;
const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

test('Mission 05 mastery preserves the original concrete, data-driven Present Drop branch', async () => {
  const campaign = readCampaign();
  const { validateGameCampaign } = await import(validatorUrl);
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
  assert.ok(campaign.revision >= 22);
  assert.equal(campaign.campaignBranches.length, 4);

  const branch = campaign.campaignBranches.find((entry) => entry.branchId === 'branch-bastion-research-supply');
  assert.ok(branch);
  const sourceMission = campaign.levels.find((mission) => mission.id === branch.sourceMissionId);
  assert.equal(sourceMission.order, 5);
  assert.deepEqual(branch.unlockCondition, {
    kind: 'all-stars-earned',
    missionId: sourceMission.id
  });
  assert.equal(branch.requiredStars, 3);
  assert.equal(branch.missionType, 'present-drop');
  assert.equal(branch.oneTimeCompletion, true);
  assert.equal(branch.replayPolicy, 'no-replay-after-claim');
  assert.equal(branch.failurePolicy, 'retry-no-reward');
  assert.equal(branch.rewardCommitPolicy, 'authoritative-idempotent-on-success');
  assert.equal(branch.returnNodeId, sourceMission.id);
  assert.equal(branch.nextBranchNodeId, null);
  assert.deepEqual(branch.routeControlPoints[0], sourceMission.campaignProgression.mapPosition);
  assert.deepEqual(branch.routeControlPoints.at(-1), branch.mapPosition);
});

test('Present Drop target values, timing, and reward preview close exactly', () => {
  const campaign = readCampaign();
  const branch = campaign.campaignBranches.find((entry) => entry.branchId === 'branch-bastion-research-supply');
  const mission = branch.missionDefinition;
  const types = new Map(mission.presentTypes.map((present) => [present.id, present]));
  const performanceCoins = mission.spawnGroups.reduce((total, group) => (
    total + group.count * types.get(group.presentTypeId).coinValue
  ), 0);
  const minimumCoins = branch.completionReward.baseCoins + branch.completionReward.oneTimeBonusCoins;
  const maximumCoins = minimumCoins + performanceCoins;

  assert.equal(mission.durationSeconds, 48);
  assert.deepEqual(mission.presentTypes.map(({ kind, health, coinValue }) => ({ kind, health, coinValue })), [
    { kind: 'standard', health: 1, coinValue: 4 },
    { kind: 'armored', health: 4, coinValue: 12 },
    { kind: 'fast', health: 1, coinValue: 7 },
    { kind: 'golden', health: 6, coinValue: 60 }
  ]);
  assert.ok(mission.spawnGroups.every((group) => (
    group.startSeconds + Math.max(0, group.count - 1) * group.spawnIntervalSeconds <= mission.durationSeconds
  )));
  assert.equal(performanceCoins, 257);
  assert.equal(minimumCoins, 120);
  assert.equal(maximumCoins, 377);
  assert.equal(branch.completionReward.maximumPerformanceCoins, performanceCoins);
  assert.equal(branch.completionReward.totalMinimumCoins, minimumCoins);
  assert.equal(branch.completionReward.totalMaximumCoins, maximumCoins);
  assert.equal(branch.rewardPreview.minimumCoins, minimumCoins);
  assert.equal(branch.rewardPreview.maximumCoins, maximumCoins);

  const firstSectorAuthoredCoins = campaign.levels.slice(0, 5).reduce((total, missionDefinition) => {
    const progression = missionDefinition.campaignProgression;
    return total
      + progression.reward.waveClearCoins * missionDefinition.waves.length
      + progression.reward.missionClearCoins
      + progression.reward.firstClearCoins
      + progression.reward.bossFirstClearCoins
      + progression.masteryObjectives.reduce((subtotal, objective) => subtotal + objective.rewardCoins, 0);
  }, 0);
  assert.ok(firstSectorAuthoredCoins > maximumCoins);
  assert.ok(maximumCoins >= 360, 'a perfect cache funds a meaningful mid-sector upgrade');
  assert.ok(maximumCoins < firstSectorAuthoredCoins / 2, 'the optional cache cannot replace normal sector progression');
});

test('Present Drop sprite IDs are allowlisted asteroid-role assets', () => {
  const campaign = readCampaign();
  const generated = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'generated-assets.json'), 'utf8'));
  const assets = new Map(generated.assets.map((asset) => [asset.id, asset]));

  const presentDrop = campaign.campaignBranches.find((entry) => entry.branchId === 'branch-bastion-research-supply');
  for (const present of presentDrop.missionDefinition.presentTypes) {
    const asset = assets.get(present.spriteKey);
    assert.ok(asset, `${present.spriteKey} is registered`);
    assert.ok(asset.roles.includes('asteroid'), `${present.spriteKey} is safe for canonical asteroid rendering`);
    assert.ok(fs.existsSync(path.join(root, 'public', asset.path.slice(1))), `${asset.path} exists`);
  }
});

test('branch validation rejects partial mastery, bad routes, farming policies, and forged reward totals', async () => {
  const { validateGameCampaign } = await import(validatorUrl);
  const campaign = readCampaign();

  const invalid = structuredClone(campaign);
  const branch = invalid.campaignBranches.find((entry) => entry.branchId === 'branch-bastion-research-supply');
  branch.requiredStars = 2;
  branch.routeControlPoints[0].x = 0.1;
  branch.replayPolicy = 'repeatable-rewarded';
  branch.completionReward.totalMaximumCoins += 1;
  const result = validateGameCampaign(invalid);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/requiredStars')));
  assert.ok(result.errors.some((error) => error.includes('/routeControlPoints/0')));
  assert.ok(result.errors.some((error) => error.includes('/replayPolicy')));
  assert.ok(result.errors.some((error) => error.includes('/completionReward/totalMaximumCoins')));
});

test('campaign branches remain optional and bonus asteroid metadata is strictly paired', async () => {
  const { validateGameCampaign } = await import(validatorUrl);
  const legacyCompatible = readCampaign();
  delete legacyCompatible.campaignBranches;
  legacyCompatible.sectors.forEach((sector) => {
    sector.branchIds = [];
  });
  assert.deepEqual(validateGameCampaign(legacyCompatible), { valid: true, errors: [] });

  const bonusTargetCampaign = readCampaign();
  const authoredBranchAsteroid = bonusTargetCampaign.campaignBranches
    .flatMap((branch) => branch.missionDefinition.events ?? [])
    .find((event) => event.kind === 'asteroid-belt');
  assert.ok(authoredBranchAsteroid, 'tracked campaign includes an asteroid event fixture');
  const asteroidEvent = structuredClone(authoredBranchAsteroid);
  asteroidEvent.id = 'validation-bonus-asteroid';
  asteroidEvent.startSeconds = 0;
  asteroidEvent.durationSeconds = 1;
  asteroidEvent.coinDropValue = 12;
  asteroidEvent.bonusTargetKind = 'armored';
  bonusTargetCampaign.levels[0].waves[0].events.unshift(asteroidEvent);
  assert.deepEqual(validateGameCampaign(bonusTargetCampaign), { valid: true, errors: [] });

  delete asteroidEvent.coinDropValue;
  const invalid = validateGameCampaign(bonusTargetCampaign);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes('/coinDropValue')));
});
