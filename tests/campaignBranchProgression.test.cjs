const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileService = (name) => {
  const source = fs.readFileSync(path.join(root, 'services', name), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', compiled)(module.exports, require, module);
  return module.exports;
};

const progression = compileService('campaignBranchProgression.ts');

const DEFINITIONS = [{
  branchId: 'open-orbit-supply-cache',
  sourceMissionId: 'mission-1',
  requiredStars: 3,
  oneTimeCompletion: true,
  replayPolicy: 'one-time',
  completionReward: { coins: 250 }
}, {
  branchId: 'paywall-elite-signal',
  sourceMissionId: 'mission-2',
  requiredStars: 3,
  oneTimeCompletion: true,
  replayPolicy: 'one-time',
  completionReward: { coins: 400 }
}];

const SUCCESS_AT = '2026-07-27T12:00:00.000Z';

test('one or two stars stay locked while a three-star record unlocks exactly the configured branch', () => {
  const fresh = progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z');
  const oneStar = progression.reconcileCampaignBranchUnlocks(
    fresh,
    DEFINITIONS,
    { 'mission-1': { stars: 1 } },
    '2026-07-27T10:01:00.000Z'
  );
  const twoStars = progression.reconcileCampaignBranchUnlocks(
    oneStar,
    DEFINITIONS,
    { 'mission-1': { stars: 2 } },
    '2026-07-27T10:02:00.000Z'
  );
  const mastered = progression.reconcileCampaignBranchUnlocks(
    twoStars,
    DEFINITIONS,
    { 'mission-1': { stars: 3 } },
    '2026-07-27T10:03:00.000Z'
  );

  assert.deepEqual(Array.from(oneStar.unlockedBranchIds), []);
  assert.deepEqual(Array.from(twoStars.unlockedBranchIds), []);
  assert.deepEqual(Array.from(mastered.unlockedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(mastered.newBranchIds), ['open-orbit-supply-cache']);
  assert.equal(progression.getCampaignBranchNodeState(mastered, 'open-orbit-supply-cache'), 'new');

  const viewed = progression.markCampaignBranchesViewed(
    mastered,
    DEFINITIONS,
    ['open-orbit-supply-cache'],
    '2026-07-27T10:04:00.000Z'
  );
  assert.deepEqual(Array.from(viewed.newBranchIds), []);
  assert.deepEqual(Array.from(viewed.viewedBranchIds), ['open-orbit-supply-cache']);
  assert.equal(progression.getCampaignBranchNodeState(viewed, 'open-orbit-supply-cache'), 'unlocked');
});

test('save migration auto-unlocks prior three-star mastery without fabricating completion or a claim', () => {
  const migrated = progression.sanitizeCampaignBranchProgress(
    {
      version: 0,
      unlockedBranchIds: ['injected-branch'],
      completedBranchIds: ['injected-branch'],
      claimedBranchIds: ['injected-branch'],
      attemptReceipts: [{
        attemptId: 'malformed-success',
        branchId: 'open-orbit-supply-cache',
        playerId: 'wallet:0xabc',
        outcome: 'success',
        completedAt: '2026-07-20T00:00:00.000Z',
        claimed: true
      }],
      updatedAt: '2026-07-20T00:00:00.000Z'
    },
    DEFINITIONS,
    {
      'mission-1': { stars: 3 },
      'mission-2': { stars: 2 }
    }
  );

  assert.deepEqual(Array.from(migrated.unlockedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(migrated.newBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(migrated.completedBranchIds), []);
  assert.deepEqual(Array.from(migrated.claimedBranchIds), []);
  assert.deepEqual(Array.from(migrated.attemptReceipts), []);
});

test('failed and interrupted attempts are durable but award nothing and allow a new retry attempt', () => {
  const unlocked = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const failed = progression.settleCampaignBranchAttempt(unlocked, {
    branchId: 'open-orbit-supply-cache',
    attemptId: 'attempt-failed',
    playerId: 'wallet:0xabc',
    outcome: 'failed',
    verifiedPresentsDestroyed: 12,
    verifiedCoinsAwarded: 999,
    completedAt: '2026-07-27T11:00:00.000Z'
  }, DEFINITIONS);
  const interrupted = progression.settleCampaignBranchAttempt(failed.progress, {
    branchId: 'open-orbit-supply-cache',
    attemptId: 'attempt-interrupted',
    playerId: 'wallet:0xabc',
    outcome: 'interrupted',
    verifiedPresentsDestroyed: 20,
    verifiedCoinsAwarded: 999,
    completedAt: '2026-07-27T11:05:00.000Z'
  }, DEFINITIONS);

  for (const result of [failed, interrupted]) {
    assert.equal(result.accepted, true);
    assert.equal(result.coinsAwarded, 0);
    assert.equal(result.grant, null);
    assert.equal(result.retryAllowed, true);
    assert.equal(result.receipt.claimed, false);
    assert.equal(result.receipt.coinsAwarded, 0);
  }
  assert.deepEqual(Array.from(interrupted.progress.completedBranchIds), []);
  assert.deepEqual(Array.from(interrupted.progress.claimedBranchIds), []);
  assert.equal(progression.canLaunchCampaignBranch(interrupted.progress, DEFINITIONS[0]), true);
  assert.deepEqual(
    Array.from(interrupted.progress.processedAttemptIds),
    ['attempt-failed', 'attempt-interrupted']
  );
});

test('a successful one-time branch awards its verified reward exactly once across every duplicate path', () => {
  const unlocked = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const input = {
    branchId: 'open-orbit-supply-cache',
    attemptId: 'attempt-success',
    playerId: 'wallet:0xabc',
    outcome: 'success',
    verifiedPresentsDestroyed: 24,
    verifiedCoinsAwarded: 275,
    rewardReceiptId: 'branch-receipt-001',
    completedAt: SUCCESS_AT
  };
  const success = progression.settleCampaignBranchAttempt(unlocked, input, DEFINITIONS);

  assert.equal(success.accepted, true);
  assert.equal(success.duplicate, false);
  assert.equal(success.coinsAwarded, 275);
  assert.deepEqual(success.grant, {
    id: 'branch-receipt-001',
    label: 'Optional branch completion',
    amount: 275,
    kind: 'branch',
    oneTime: true
  });
  assert.deepEqual(Array.from(success.progress.completedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(success.progress.claimedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(success.progress.claimedRewardReceiptIds), ['branch-receipt-001']);
  assert.equal(progression.canLaunchCampaignBranch(success.progress, DEFINITIONS[0]), false);

  const sameAttempt = progression.settleCampaignBranchAttempt(success.progress, input, DEFINITIONS);
  assert.equal(sameAttempt.duplicate, true);
  assert.equal(sameAttempt.reason, 'attempt-already-processed');
  assert.equal(sameAttempt.coinsAwarded, 0);

  const sameReceipt = progression.settleCampaignBranchAttempt(success.progress, {
    ...input,
    attemptId: 'attempt-other-branch'
  }, DEFINITIONS);
  assert.equal(sameReceipt.accepted, false);
  assert.equal(sameReceipt.duplicate, true);
  assert.equal(sameReceipt.reason, 'reward-receipt-already-claimed');
  assert.equal(sameReceipt.coinsAwarded, 0);

  const newAttempt = progression.settleCampaignBranchAttempt(success.progress, {
    ...input,
    attemptId: 'attempt-second-success',
    rewardReceiptId: 'branch-receipt-002'
  }, DEFINITIONS);
  assert.equal(newAttempt.duplicate, true);
  assert.equal(newAttempt.reason, 'branch-already-claimed');
  assert.equal(newAttempt.coinsAwarded, 0);
  assert.equal(newAttempt.progress.attemptReceipts.length, 1);
});

test('successful settlement requires a durable reward receipt before it can mutate completion', () => {
  const unlocked = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const missingReceipt = progression.settleCampaignBranchAttempt(unlocked, {
    branchId: 'open-orbit-supply-cache',
    attemptId: 'attempt-no-receipt',
    playerId: 'wallet:0xabc',
    outcome: 'success',
    verifiedPresentsDestroyed: 24,
    verifiedCoinsAwarded: 275,
    completedAt: SUCCESS_AT
  }, DEFINITIONS);

  assert.equal(missingReceipt.accepted, false);
  assert.equal(missingReceipt.reason, 'missing-reward-receipt');
  assert.equal(missingReceipt.coinsAwarded, 0);
  assert.deepEqual(Array.from(missingReceipt.progress.completedBranchIds), []);
  assert.deepEqual(Array.from(missingReceipt.progress.processedAttemptIds), []);
});

test('profile merging preserves unlocks and claims without duplicating attempts or reward receipts', () => {
  const first = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const completed = progression.settleCampaignBranchAttempt(first, {
    branchId: 'open-orbit-supply-cache',
    attemptId: 'attempt-success',
    playerId: 'wallet:0xabc',
    outcome: 'success',
    verifiedPresentsDestroyed: 24,
    verifiedCoinsAwarded: 275,
    rewardReceiptId: 'branch-receipt-001',
    completedAt: SUCCESS_AT
  }, DEFINITIONS).progress;
  const merged = progression.mergeCampaignBranchProgress(
    first,
    completed,
    DEFINITIONS,
    { 'mission-1': 3 }
  );

  assert.deepEqual(Array.from(merged.unlockedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(merged.completedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(merged.claimedBranchIds), ['open-orbit-supply-cache']);
  assert.deepEqual(Array.from(merged.processedAttemptIds), ['attempt-success']);
  assert.deepEqual(Array.from(merged.claimedRewardReceiptIds), ['branch-receipt-001']);
  assert.equal(merged.attemptReceipts.length, 1);
});

test('founder reset mutates the claim ledger only when the underlying service guard authorizes it', () => {
  const unlocked = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const completed = progression.settleCampaignBranchAttempt(unlocked, {
    branchId: 'open-orbit-supply-cache',
    attemptId: 'attempt-success',
    playerId: 'wallet:0xabc',
    outcome: 'success',
    verifiedPresentsDestroyed: 24,
    verifiedCoinsAwarded: 275,
    rewardReceiptId: 'branch-receipt-001',
    completedAt: SUCCESS_AT
  }, DEFINITIONS).progress;
  const unauthorized = progression.applyFounderCampaignBranchAction(
    completed,
    { walletAddress: '0xBAD', founderWalletAddresses: ['0xF0UNDER'] },
    'reset-completion',
    'open-orbit-supply-cache',
    DEFINITIONS,
    '2026-07-27T13:00:00.000Z'
  );
  assert.equal(unauthorized.authorized, false);
  assert.deepEqual(Array.from(unauthorized.progress.claimedBranchIds), ['open-orbit-supply-cache']);

  const authorized = progression.applyFounderCampaignBranchAction(
    completed,
    { walletAddress: ' 0xf0under ', founderWalletAddresses: ['0xF0UNDER'] },
    'reset-completion',
    'open-orbit-supply-cache',
    DEFINITIONS,
    '2026-07-27T13:01:00.000Z'
  );
  assert.equal(authorized.authorized, true);
  assert.deepEqual(Array.from(authorized.progress.completedBranchIds), []);
  assert.deepEqual(Array.from(authorized.progress.claimedBranchIds), []);
  assert.deepEqual(Array.from(authorized.progress.processedAttemptIds), []);
  assert.deepEqual(Array.from(authorized.progress.claimedRewardReceiptIds), []);
  assert.deepEqual(Array.from(authorized.progress.attemptReceipts), []);
  assert.equal(progression.canLaunchCampaignBranch(authorized.progress, DEFINITIONS[0]), true);
});

test('founder lock survives mastery reconciliation until an authorized unlock clears the override', () => {
  const mastered = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const authorization = {
    walletAddress: '0xf0under',
    founderWalletAddresses: ['0xF0UNDER']
  };
  const locked = progression.applyFounderCampaignBranchAction(
    mastered,
    authorization,
    'lock',
    'open-orbit-supply-cache',
    DEFINITIONS,
    '2026-07-27T10:02:00.000Z'
  ).progress;
  const reconciled = progression.reconcileCampaignBranchUnlocks(
    locked,
    DEFINITIONS,
    { 'mission-1': 3 },
    '2026-07-27T10:03:00.000Z'
  );
  assert.deepEqual(Array.from(reconciled.founderLockedBranchIds), ['open-orbit-supply-cache']);
  assert.equal(progression.getCampaignBranchNodeState(reconciled, 'open-orbit-supply-cache'), 'locked');
  assert.equal(progression.canLaunchCampaignBranch(reconciled, DEFINITIONS[0]), false);

  const unlocked = progression.applyFounderCampaignBranchAction(
    reconciled,
    authorization,
    'unlock',
    'open-orbit-supply-cache',
    DEFINITIONS,
    '2026-07-27T10:04:00.000Z'
  ).progress;
  assert.deepEqual(Array.from(unlocked.founderLockedBranchIds), []);
  assert.equal(progression.canLaunchCampaignBranch(unlocked, DEFINITIONS[0]), true);
});

test('authoritative settlement clamps a forged coin value to the authored branch reward envelope', () => {
  const definition = {
    ...DEFINITIONS[0],
    completionReward: {
      totalMinimumCoins: 120,
      totalMaximumCoins: 377
    }
  };
  const unlocked = progression.reconcileCampaignBranchUnlocks(
    progression.createCampaignBranchProgress('2026-07-27T10:00:00.000Z'),
    [definition],
    { 'mission-1': 3 },
    '2026-07-27T10:01:00.000Z'
  );
  const forged = progression.settleCampaignBranchAttempt(unlocked, {
    branchId: definition.branchId,
    attemptId: 'forged-coin-count',
    playerId: 'wallet:0xabc',
    outcome: 'success',
    verifiedPresentsDestroyed: 9_999,
    verifiedCoinsAwarded: 9_999_999,
    rewardReceiptId: 'branch-receipt-forged',
    completedAt: SUCCESS_AT
  }, [definition]);

  assert.equal(forged.accepted, true);
  assert.equal(forged.coinsAwarded, 377);
  assert.equal(forged.grant.amount, 377);
  assert.equal(forged.receipt.coinsCalculated, 377);
});
