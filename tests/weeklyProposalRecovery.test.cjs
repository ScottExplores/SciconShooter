const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { getPublicPrizeState } = require('../shared/weeklyCompetitionBoundary.js');

const root = path.resolve(__dirname, '..');
const loadTypeScriptService = (relativePath, dependencyMap) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const serviceModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: serviceModule,
    exports: serviceModule.exports,
    require: (specifier) => {
      if (Object.hasOwn(dependencyMap, specifier)) return dependencyMap[specifier];
      throw new Error(`Unexpected ${relativePath} dependency: ${specifier}`);
    }
  });
  return serviceModule.exports;
};
const proposalFunding = require('../services/proposalFunding.ts');
const weeklyProposalReminder = require('../services/weeklyProposalReminder.ts');
const { getWeeklyProposalLifecycle } = loadTypeScriptService(
  'services/weeklyProposalLifecycle.ts',
  { './proposalFunding': proposalFunding }
);
const { getWeeklyProposalRecovery } = loadTypeScriptService(
  'services/weeklyProposalRecovery.ts',
  { './weeklyProposalReminder': weeklyProposalReminder }
);
const { getMissionRecordWeeklyFunding } = loadTypeScriptService(
  'services/weeklyFundingFlow.ts',
  { '../shared/weeklyCompetitionBoundary.browser': { getPublicPrizeState } }
);

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
  assert.equal(result?.attentionReason, 'missing');
  assert.equal(
    result?.reminderStorageKey,
    'scicon.weekly-proposal-reminder:verified-leading-run:missing'
  );
  assert.equal(result?.canEditProposal, true);
});

test('a stored research pick cannot be submitted again', () => {
  const result = getWeeklyProposalRecovery({
    weeklyLeaderboard: [leader({ proposalId: '321', proposalTitle: 'Original pick' })],
    walletRuns: [{ pilotName: 'PILOT', receipt: receipt() }],
    walletAddress: wallet
  });

  assert.equal(result?.needsProposal, false);
  assert.equal(result?.attentionReason, null);
  assert.equal(result?.reminderStorageKey, null);
  assert.equal(result?.canEditProposal, false);
});

test('a completed proposal does not reopen the one-time research pick', () => {
  const selected = leader({ proposalId: '321', proposalTitle: 'Original pick' });
  const proposalLifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: selected.proposalId,
    referencedProposals: [{
      id: '321',
      title: 'Original pick',
      author: 'Researcher',
      backers: 5,
      votes: 8,
      comments: 2,
      goalCurrency: 'USD',
      requestedUsd: 1000,
      raisedUsd: 1000,
      status: 'FUNDED',
      url: 'https://www.researchhub.com/post/321/original-pick'
    }]
  });
  const result = getWeeklyProposalRecovery({
    weeklyLeaderboard: [selected],
    walletRuns: [{ pilotName: 'PILOT', receipt: receipt() }],
    walletAddress: wallet,
    proposalLifecycle
  });

  assert.equal(result?.needsProposal, false);
  assert.equal(result?.attentionReason, null);
  assert.equal(result?.reminderStorageKey, null);
  assert.equal(result?.canEditProposal, false);
});

test('recovery never treats an absent or mismatched referenced proposal as completed', () => {
  const selected = leader({ proposalId: '321', proposalTitle: 'Original pick' });
  const unknownLifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: selected.proposalId,
    referencedProposals: []
  });
  const mismatchedLifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: '999',
    referencedProposals: [{
      id: '999',
      title: 'Other completed proposal',
      author: 'Researcher',
      backers: 5,
      votes: 8,
      comments: 2,
      goalCurrency: 'USD',
      requestedUsd: 1000,
      raisedUsd: 1000,
      url: 'https://www.researchhub.com/post/999/other'
    }]
  });
  const base = {
    weeklyLeaderboard: [selected],
    walletRuns: [{ pilotName: 'PILOT', receipt: receipt() }],
    walletAddress: wallet
  };

  assert.equal(getWeeklyProposalRecovery({
    ...base,
    proposalLifecycle: unknownLifecycle
  })?.attentionReason, null);
  assert.equal(getWeeklyProposalRecovery({
    ...base,
    proposalLifecycle: mismatchedLifecycle
  })?.attentionReason, null);
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

test('a selected proposal stays locked to the current leader receipt', () => {
  const selectedLeader = leader({ proposalId: '321', proposalTitle: 'Original pick' });
  const funding = getMissionRecordWeeklyFunding({
    receipt: receipt(),
    pilotName: 'PILOT',
    weeklyLeaderboard: [selectedLeader],
    archivedWinners: []
  });
  assert.equal(funding?.status, 'selected');
  assert.equal(funding?.canEditProposal, false);
  assert.equal(funding?.allocationRsc, 25_000);

  const displaced = getMissionRecordWeeklyFunding({
    receipt: receipt(),
    pilotName: 'PILOT',
    weeklyLeaderboard: [leader({ runId: 'new-leading-run', score: 99999 })],
    archivedWinners: []
  });
  assert.equal(displaced, null);
});
