const { loadService } = require('./helpers/loadService.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveProposalSelection } = loadService(require('node:path').resolve(__dirname, '../services/weeklyProposalDisplay.ts'));

const proposals = [
  {
    id: '111',
    title: 'Popular but not selected',
    author: 'Wrong Researcher',
    imageUrl: 'https://images.example/wrong.png',
    url: 'https://www.researchhub.com/post/111/wrong',
    votes: 999,
    backers: 999,
    comments: 999
  },
  {
    id: '321',
    title: 'Live title',
    author: 'Live Researcher',
    imageUrl: 'https://images.example/chosen.png',
    url: 'https://www.researchhub.com/post/321/chosen',
    votes: 1,
    backers: 1,
    comments: 1
  }
];

test('weekly display resolves the leader-selected proposal by exact ID, not feed position', () => {
  const result = resolveProposalSelection({
    proposalId: '321',
    proposalTitle: 'Saved winning proposal',
    proposalAuthor: 'Saved Researcher',
    proposalUrl: 'https://www.researchhub.com/post/321/saved'
  }, proposals);

  assert.equal(result.id, '321');
  assert.equal(result.title, 'Saved winning proposal');
  assert.equal(result.author, 'Saved Researcher');
  assert.equal(result.imageUrl, 'https://images.example/chosen.png');
  assert.equal(result.liveProposal.id, '321');
  assert.notEqual(result.imageUrl, proposals[0].imageUrl);
});

test('an open pilot slot or a leader without a saved pick resolves no proposal', () => {
  assert.equal(resolveProposalSelection(undefined, proposals), null);
  assert.equal(resolveProposalSelection({ proposalId: undefined, proposalTitle: undefined }, proposals), null);
  assert.equal(resolveProposalSelection({ proposalId: '321', proposalTitle: undefined }, proposals), null);
});

test('archived snapshot image wins and an exact-ID live image is the only fallback', () => {
  const snapshot = resolveProposalSelection({
    proposalId: '321',
    proposalTitle: 'Archived choice',
    proposalImageUrl: 'https://archive.example/chosen.png'
  }, proposals);
  assert.equal(snapshot.imageUrl, 'https://archive.example/chosen.png');

  const legacyExactMatch = resolveProposalSelection({
    proposalId: '321',
    proposalTitle: 'Legacy choice'
  }, proposals);
  assert.equal(legacyExactMatch.imageUrl, 'https://images.example/chosen.png');

  const missingArchiveImage = resolveProposalSelection({
    proposalId: '999',
    proposalTitle: 'No longer in feed'
  }, proposals);
  assert.equal(missingArchiveImage.imageUrl, undefined);
  assert.equal(missingArchiveImage.liveProposal, undefined);
});

test('unsafe archived image URLs are rejected instead of displayed', () => {
  const result = resolveProposalSelection({
    proposalId: '999',
    proposalTitle: 'Archived choice',
    proposalImageUrl: 'javascript:alert(1)'
  }, proposals);

  assert.equal(result.imageUrl, undefined);
});
