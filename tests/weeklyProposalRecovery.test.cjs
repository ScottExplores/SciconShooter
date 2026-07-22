const test = require('node:test');
const assert = require('node:assert/strict');

const { getWeeklyProposalRecovery } = require('../services/weeklyProposalRecovery.ts');
const { getMissionRecordWeeklyFunding } = require('../services/weeklyFundingFlow.ts');

const wallet = '0x1111111111111111111111111111111111111111';
const receipt = (overrides = {}) => ({
  runId: 'verified-leading-run',
  gameVersion: 'test',
  startedAt: '2026-07-20T00:00:00.000Z',
  finishedAt: '2026-07-20T00:05:00.000Z',
  expiresAt: '2026-07-27T00:05:00.000Z',
  metrics: {
    score: 12345,
    wave: 8,
    durationMs: 300000,
    enemiesDefeated: 100,
    coinsCollected: 50,
    playerShipId: 'researchhub'
  },
  integrity: 'server-verified',
  anomalies: [],
  receiptToken: 'signed.server.receipt',
  persisted: true,
  ...overrides
});
const leader = (overrides = {}) => ({
  name: 'PILOT',
  score: 12345,
  wave: 8,
  date: '2026-07-20T00:05:00.000Z',
  walletAddress: wallet,
  runId: 'verified-leading-run',
  verified: true,
  ...overrides
});

test('recovery identifies the exact wallet-bound verified weekly leader run', () => {
  const record = { pilotName: 'PILOT', receipt: receipt() };
  const result = getWeeklyProposalRecovery({
    weeklyLeaderboard: [leader()],
    walletRuns: [record],
    walletAddress: wallet
  });

  assert.equal(result?.record, record);
  assert.equal(result?.needsProposal, true);
  assert.equal(result?.canEditProposal, true);
});

test('recovery remains editable when the current leader already selected a proposal', () => {
  const result = getWeeklyProposalRecovery({
    weeklyLeaderboard: [leader({ proposalId: '321', proposalTitle: 'Original pick' })],
    walletRuns: [{ pilotName: 'PILOT', receipt: receipt() }],
    walletAddress: wallet
  });

  assert.equal(result?.needsProposal, false);
  assert.equal(result?.canEditProposal, true);
});

test('recovery rejects mismatched wallet, run, metrics, and verification state', () => {
  const base = {
    weeklyLeaderboard: [leader()],
    walletRuns: [{ pilotName: 'PILOT', receipt: receipt() }],
    walletAddress: wallet
  };
  assert.equal(getWeeklyProposalRecovery({ ...base, walletAddress: '0x2222222222222222222222222222222222222222' }), null);
  assert.equal(getWeeklyProposalRecovery({ ...base, weeklyLeaderboard: [leader({ runId: 'other-run' })] }), null);
  assert.equal(getWeeklyProposalRecovery({ ...base, walletRuns: [{ pilotName: 'PILOT', receipt: receipt({
    metrics: { ...receipt().metrics, score: 12344 }
  }) }] }), null);
  assert.equal(getWeeklyProposalRecovery({ ...base, weeklyLeaderboard: [leader({ verified: false })] }), null);
  assert.equal(getWeeklyProposalRecovery({ ...base, walletRuns: [{ pilotName: 'PILOT', receipt: receipt({
    integrity: 'review'
  }) }] }), null);
});

test('a selected proposal remains editable only while that receipt is the current leader', () => {
  const selectedLeader = leader({ proposalId: '321', proposalTitle: 'Original pick' });
  const funding = getMissionRecordWeeklyFunding({
    receipt: receipt(),
    pilotName: 'PILOT',
    weeklyLeaderboard: [selectedLeader],
    archivedWinners: []
  });
  assert.equal(funding?.status, 'selected');
  assert.equal(funding?.canEditProposal, true);

  const displaced = getMissionRecordWeeklyFunding({
    receipt: receipt(),
    pilotName: 'PILOT',
    weeklyLeaderboard: [leader({ runId: 'new-leading-run', score: 99999 })],
    archivedWinners: []
  });
  assert.equal(displaced, null);
});
