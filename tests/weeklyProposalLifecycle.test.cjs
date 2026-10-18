const { loadService } = require('./helpers/loadService.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'weeklyProposalLifecycle.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;
const lifecycleModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: lifecycleModule,
  exports: lifecycleModule.exports,
  require: (specifier) => {
    if (specifier === './proposalFunding') {
      return loadService(require('node:path').resolve(__dirname, '../services/proposalFunding.ts'));
    }
    throw new Error(`Unexpected weekly proposal lifecycle dependency: ${specifier}`);
  }
});
const {
  getWeeklyProposalLifecycle,
  isProposalExplicitlyCompleted
} = lifecycleModule.exports;

const proposal = (overrides = {}) => ({
  id: '321',
  title: 'Fund the observable',
  author: 'Researcher',
  backers: 3,
  votes: 4,
  comments: 2,
  goalCurrency: 'USD',
  requestedUsd: 1000,
  raisedUsd: 450,
  status: 'OPEN',
  url: 'https://www.researchhub.com/post/321/fund-the-observable',
  ...overrides
});

test('a leader with no proposal has a missing lifecycle state', () => {
  const lifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: null,
    referencedProposals: [proposal()]
  });
  assert.equal(lifecycle.state, 'missing');
  assert.equal(lifecycle.proposalId, null);
  assert.equal(lifecycle.proposal, null);
});

test('an exact open proposal snapshot is active', () => {
  const activeProposal = proposal();
  const lifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: activeProposal.id,
    referencedProposals: [activeProposal]
  });

  assert.equal(lifecycle.state, 'active');
  assert.equal(lifecycle.proposal, activeProposal);
});

test('explicit status or complete funding requires a replacement', () => {
  const statusComplete = proposal({ status: 'FUNDED' });
  const amountComplete = proposal({ raisedUsd: 1000 });

  assert.equal(isProposalExplicitlyCompleted(statusComplete), true);
  assert.equal(isProposalExplicitlyCompleted(amountComplete), true);
  const lifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: amountComplete.id,
    referencedProposals: [amountComplete]
  });
  assert.equal(lifecycle.state, 'replacement-required');
  assert.equal(lifecycle.reason, 'completed');
  assert.equal(lifecycle.proposalId, amountComplete.id);
  assert.equal(lifecycle.proposal, amountComplete);
});

test('absence from the exact referenced feed is status-unknown, never completed', () => {
  const lifecycle = getWeeklyProposalLifecycle({
    selectedProposalId: '321',
    referencedProposals: [proposal({ id: '999' })]
  });
  assert.equal(lifecycle.state, 'status-unknown');
  assert.equal(lifecycle.proposalId, '321');
  assert.equal(lifecycle.proposal, null);
});
