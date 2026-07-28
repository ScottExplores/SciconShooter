const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const campaignPath = path.join(root, 'game-config', 'campaign.json');
const readCampaign = () => JSON.parse(fs.readFileSync(campaignPath, 'utf8'));

const compileService = (name) => {
  const source = fs.readFileSync(path.join(root, 'services', name), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', compiled)(module.exports, require, module);
  return module.exports;
};

const runtime = compileService('campaignBranchRuntime.ts');
const progression = compileService('campaignBranchProgression.ts');
const COMBAT_BRANCH_IDS = [
  'branch-null-helix-formation',
  'branch-ion-support-relay',
  'branch-terminus-elite-remix'
];

test('playable sectors 2-4 each expose a distinct optional three-star mastery route', () => {
  const campaign = readCampaign();
  const branchesById = new Map(campaign.campaignBranches.map((branch) => [branch.branchId, branch]));
  const expectedBySector = new Map([
    ['sector-redline', ['branch-null-helix-formation', 'formation-challenge']],
    ['sector-gravity', ['branch-ion-support-relay', 'support-trial']],
    ['sector-terminus', ['branch-terminus-elite-remix', 'elite-remix']]
  ]);

  expectedBySector.forEach(([branchId, missionType], sectorId) => {
    const sector = campaign.sectors.find((candidate) => candidate.id === sectorId);
    const branch = branchesById.get(branchId);
    const source = campaign.levels.find((level) => level.id === branch.sourceMissionId);
    assert.deepEqual(sector.branchIds, [branchId]);
    assert.equal(branch.missionType, missionType);
    assert.equal(branch.missionDefinition.kind, missionType);
    assert.deepEqual(branch.unlockCondition, {
      kind: 'all-stars-earned',
      missionId: branch.sourceMissionId
    });
    assert.equal(branch.requiredStars, 3);
    assert.equal(branch.oneTimeCompletion, true);
    assert.equal(branch.replayPolicy, 'no-replay-after-claim');
    assert.equal(branch.failurePolicy, 'retry-no-reward');
    assert.equal(branch.completionReward.maximumPerformanceCoins, 0);
    assert.deepEqual(branch.routeControlPoints[0], source.campaignProgression.mapPosition);
    assert.deepEqual(branch.routeControlPoints.at(-1), branch.mapPosition);
  });

  const combatBranches = COMBAT_BRANCH_IDS.map((branchId) => branchesById.get(branchId));
  assert.equal(new Set(combatBranches.map((branch) => branch.missionType)).size, 3);
  assert.deepEqual(
    combatBranches.map((branch) => branch.missionDefinition.events.map((event) => event.kind).join('|')),
    ['spawn|spawn|spawn', 'powerup|asteroid-belt|spawn|powerup|spawn', 'spawn|spawn|spawn']
  );
  assert.ok(combatBranches.every((branch) => (
    branch.missionDefinition.events.every((event) => event.kind !== 'boss')
  )));
});

test('the completed Bastion Present Drop subsystem remains byte-for-byte stable', () => {
  const campaign = readCampaign();
  const branch = campaign.campaignBranches.find((entry) => (
    entry.branchId === 'branch-bastion-research-supply'
  ));
  const digest = crypto.createHash('sha256').update(JSON.stringify(branch)).digest('hex');

  assert.equal(digest, '3dc2421415e5a7190ab3d7375177b588087e59d981f9fede42e24b11a26b23e0');
  assert.equal(branch.sourceMissionId, 'stage-bastion-protocol');
  assert.equal(branch.missionDefinitionId, 'present-drop-bastion-supply-01');
  assert.deepEqual(branch.completionReward, {
    baseCoins: 40,
    oneTimeBonusCoins: 80,
    maximumPerformanceCoins: 257,
    totalMinimumCoins: 120,
    totalMaximumCoins: 377
  });
  assert.equal(branch.missionDefinition.spawnGroups.reduce((sum, group) => sum + group.count, 0), 34);
});

test('combat branch manifests adapt deterministically onto one canonical GameEngine wave', () => {
  const campaign = readCampaign();
  const before = JSON.stringify(campaign);
  const fingerprints = [];

  COMBAT_BRANCH_IDS.forEach((branchId) => {
    const branch = campaign.campaignBranches.find((entry) => entry.branchId === branchId);
    const first = runtime.buildCampaignBranchRuntimeCampaign(campaign, branch);
    const second = runtime.buildCampaignBranchRuntimeCampaign(campaign, branch);
    const mission = first.levels[0];
    const wave = mission.waves[0];

    assert.equal(first.campaignBranches, undefined);
    assert.deepEqual(first.sectors, []);
    assert.equal(first.levels.length, 1);
    assert.equal(mission.id, branch.missionDefinition.id);
    assert.equal(mission.waves.length, 1);
    assert.equal(wave.id, `${branch.missionDefinition.id}:encounter`);
    assert.equal(wave.completionRule, 'clear-after-duration');
    assert.equal(wave.combatBudget, branch.missionDefinition.combatBudget);
    assert.equal(wave.threatCap, branch.missionDefinition.threatCap);
    assert.deepEqual(wave.events, branch.missionDefinition.events);
    assert.deepEqual(first, second);
    assert.ok(wave.events.every((event) => event.kind !== 'boss'));
    fingerprints.push(wave.events.map((event) => `${event.kind}:${event.patternId ?? event.powerupIds?.join(',') ?? ''}`).join('|'));

    const sourceLabel = branch.missionDefinition.events[0].label;
    wave.events[0].label = 'MUTATED RUNTIME COPY';
    assert.equal(branch.missionDefinition.events[0].label, sourceLabel);
  });

  assert.equal(new Set(fingerprints).size, COMBAT_BRANCH_IDS.length);
  assert.equal(JSON.stringify(campaign), before, 'runtime adaptation must not mutate Campaign or checkpoint data');
});

test('combat verification grants only the fixed authored envelope on a verified clear', () => {
  const campaign = readCampaign();
  COMBAT_BRANCH_IDS.forEach((branchId) => {
    const branch = campaign.campaignBranches.find((entry) => entry.branchId === branchId);
    const expected = branch.completionReward.totalMinimumCoins;
    const failed = runtime.verifyCampaignCombatBranchRuntimeResult(branch, {
      stageComplete: false,
      objectiveUnitsCompleted: 999_999,
      score: 999_999,
      coinsCollected: 999_999
    });
    const succeeded = runtime.verifyCampaignCombatBranchRuntimeResult(branch, {
      stageComplete: true,
      objectiveUnitsCompleted: 999_999,
      score: 999_999,
      coinsCollected: 999_999
    });

    assert.deepEqual(failed, {
      success: false,
      objectiveUnitsCompleted: 0,
      baseCompletionReward: 0,
      oneTimeCompletionBonus: 0,
      performanceCoins: 0,
      totalCoins: 0
    });
    assert.equal(succeeded.baseCompletionReward, branch.completionReward.baseCoins);
    assert.equal(succeeded.oneTimeCompletionBonus, branch.completionReward.oneTimeBonusCoins);
    assert.equal(succeeded.performanceCoins, 0);
    assert.equal(succeeded.totalCoins, expected);
    assert.equal(succeeded.objectiveUnitsCompleted, branch.missionDefinition.events.length);
  });
});

test('failure remains retryable and success becomes a visible, nonlaunchable one-time claim', () => {
  const campaign = readCampaign();
  const definitions = campaign.campaignBranches;

  COMBAT_BRANCH_IDS.forEach((branchId, index) => {
    const definition = definitions.find((branch) => branch.branchId === branchId);
    const mastered = progression.reconcileCampaignBranchUnlocks(
      progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
      definitions,
      { [definition.sourceMissionId]: { stars: 3 } },
      '2026-07-27T10:01:00.000Z'
    );
    assert.equal(progression.canLaunchCampaignBranch(mastered, definition), true);

    const failure = progression.settleCampaignBranchAttempt(mastered, {
      branchId,
      attemptId: `combat-failure-${index}`,
      playerId: 'wallet:0xbranch',
      outcome: 'failed',
      verifiedCoinsAwarded: 999_999,
      completedAt: '2026-07-27T10:02:00.000Z'
    }, definitions);
    assert.equal(failure.accepted, true);
    assert.equal(failure.coinsAwarded, 0);
    assert.equal(failure.retryAllowed, true);
    assert.equal(progression.canLaunchCampaignBranch(failure.progress, definition), true);

    const reward = definition.completionReward.totalMinimumCoins;
    const successInput = {
      branchId,
      attemptId: `combat-success-${index}`,
      playerId: 'wallet:0xbranch',
      outcome: 'success',
      verifiedCoinsAwarded: reward,
      rewardReceiptId: `combat-reward-${index}`,
      completedAt: '2026-07-27T10:03:00.000Z'
    };
    const success = progression.settleCampaignBranchAttempt(
      failure.progress,
      successInput,
      definitions
    );
    assert.equal(success.accepted, true);
    assert.equal(success.coinsAwarded, reward);
    assert.equal(success.retryAllowed, false);
    assert.equal(progression.getCampaignBranchNodeState(success.progress, branchId), 'claimed');
    assert.equal(progression.canLaunchCampaignBranch(success.progress, definition), false);

    const duplicate = progression.settleCampaignBranchAttempt(success.progress, successInput, definitions);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.coinsAwarded, 0);
    assert.equal(duplicate.progress.attemptReceipts.length, 2);
    assert.equal('weekly' in success.progress, false);
    assert.equal('checkpoint' in success.progress, false);
    assert.equal('highestUnlockedMission' in success.progress, false);
  });
});
