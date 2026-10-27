const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'proposalFunding.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleBox = { exports: {} };
vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
  module: moduleBox,
  require
});

const {
  formatFundingAmount,
  formatFundingPercent,
  getProposalFundingMetrics,
  sortProposalsByFunding
} = moduleBox.exports;

const proposal = (overrides = {}) => ({
  id: 'proposal',
  title: 'Proposal',
  backers: 0,
  goalCurrency: 'USD',
  requestedUsd: 10000,
  raisedUsd: 0,
  requestedRsc: 120000,
  raisedRsc: 0,
  ...overrides
});

test('explicit zero funding stays zero instead of becoming engagement progress', () => {
  const funding = getProposalFundingMetrics(proposal({ votes: 12, comments: 0 }));

  assert.equal(funding.progressPercent, 0);
  assert.equal(funding.barPercent, 0);
  assert.equal(formatFundingPercent(funding.progressPercent), '0%');
  assert.equal(formatFundingAmount(funding.raisedAmount, funding.currency), '$0');
  assert.equal(formatFundingAmount(funding.goalAmount, funding.currency), '$10K');
});

test('funding percentages retain real low values and clamp only the visual bar', () => {
  const partial = getProposalFundingMetrics(proposal({ requestedUsd: 15000, raisedUsd: 657.285 }));
  const tiny = getProposalFundingMetrics(proposal({ raisedUsd: 5 }));
  const overfunded = getProposalFundingMetrics(proposal({ raisedUsd: 12500 }));

  assert.ok(Math.abs(partial.progressPercent - 4.3819) < 0.001);
  assert.equal(formatFundingPercent(partial.progressPercent), '4.4%');
  assert.ok(partial.barPercent < 8);
  assert.equal(formatFundingPercent(tiny.progressPercent), '<0.1%');
  assert.equal(formatFundingPercent(overfunded.progressPercent), '125%');
  assert.equal(overfunded.barPercent, 100);
});

test('declared goal currency chooses one complete denomination without mixing values', () => {
  const usd = getProposalFundingMetrics(proposal({
    goalCurrency: 'USD',
    raisedUsd: 0,
    requestedRsc: 100,
    raisedRsc: 90
  }));
  const rsc = getProposalFundingMetrics(proposal({
    goalCurrency: 'RSC',
    requestedUsd: 100,
    raisedUsd: 90,
    requestedRsc: 1000,
    raisedRsc: 500
  }));
  const unavailable = getProposalFundingMetrics(proposal({ raisedUsd: undefined }));

  assert.equal(usd.progressPercent, 0);
  assert.equal(rsc.progressPercent, 50);
  assert.equal(rsc.currency, 'RSC');
  assert.equal(unavailable.progressPercent, null);
  assert.equal(formatFundingPercent(unavailable.progressPercent), 'Not reported');
});

test('proposal ordering uses raw funded percentage and does not mutate the input', () => {
  const input = [
    proposal({ id: 'unknown', title: 'Unknown', raisedUsd: undefined }),
    proposal({ id: 'zero', title: 'Zero', raisedUsd: 0 }),
    proposal({ id: 'eight', title: 'Eight', raisedUsd: 818.23 }),
    proposal({ id: 'seventy-five', title: 'Seventy Five', requestedUsd: 1000, raisedUsd: 748.22 })
  ];
  const originalOrder = input.map((item) => item.id);
  const sorted = sortProposalsByFunding(input);

  assert.deepEqual(Array.from(sorted, (item) => item.id), ['seventy-five', 'eight', 'zero', 'unknown']);
  assert.deepEqual(input.map((item) => item.id), originalOrder);
});

test('equal ratios use raised amount, backers, title, and ID as stable tie breakers', () => {
  const sorted = sortProposalsByFunding([
    proposal({ id: 'b', title: 'Beta', requestedUsd: 1000, raisedUsd: 100, backers: 2 }),
    proposal({ id: 'c', title: 'Gamma', requestedUsd: 2000, raisedUsd: 200, backers: 1 }),
    proposal({ id: 'a', title: 'Alpha', requestedUsd: 1000, raisedUsd: 100, backers: 2 })
  ]);

  assert.deepEqual(Array.from(sorted, (item) => item.id), ['c', 'a', 'b']);
});

test('both proposal surfaces use the shared funding order and no synthetic RSC remains', () => {
  const startScreen = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'components', 'PrizeWinnerFlow.tsx'), 'utf8');
  const feed = fs.readFileSync(path.join(root, 'services', 'researchHubProposals.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(startScreen, /sortProposalsByFunding\(proposals\)/);
  assert.match(picker, /sortProposalsByFunding\(proposals\)/);
  assert.match(startScreen, /formatFundingAmount\(funding\.raisedAmount, funding\.currency\)/);
  assert.doesNotMatch(startScreen, /getProposalSignalRsc|signalRsc|proposal\.votes \* 20/);
  assert.doesNotMatch(startScreen, /Math\.max\(8, Math\.min\(100/);
  assert.match(feed, /if \(!normalized\) return undefined/);
  assert.match(feed, /goalCurrency: asString\(fundraise\?\.goal_currency\)\?\.toUpperCase\(\)/);
  assert.match(app, /const PROPOSAL_REFRESH_MS = 5 \* 60 \* 1000/);
  assert.match(app, /refreshFundingProposals\(true\)/);
  assert.match(app, /window\.clearInterval\(refreshId\)/);
});
