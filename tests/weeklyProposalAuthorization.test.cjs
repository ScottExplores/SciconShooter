const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WEEKLY_PROPOSAL_CHALLENGE_STALE_CODE,
  selectWeeklyProposalWithFreshChallenge
} = require('../services/weeklyProposalAuthorization.ts');

const wallet = '0x1111111111111111111111111111111111111111';

test('proposal authorization obtains and signs a fresh challenge before each submit attempt', async () => {
  const actions = [];
  const signedMessages = [];
  let challengeNumber = 0;
  const post = async (payload) => {
    actions.push(payload);
    if (payload.action === 'select-proposal-challenge') {
      challengeNumber += 1;
      return {
        challenge: {
          signatureRequired: true,
          challengeId: `challenge-${challengeNumber}`,
          message: `fresh-message-${challengeNumber}`
        }
      };
    }
    if (payload.challengeId === 'challenge-1') {
      throw Object.assign(new Error('Weekly proposal challenge is invalid or expired.'), {
        status: 410,
        code: WEEKLY_PROPOSAL_CHALLENGE_STALE_CODE
      });
    }
    return { selectedProposal: { id: '321' } };
  };

  const result = await selectWeeklyProposalWithFreshChallenge({
    address: wallet,
    signMessage: async (address, message) => {
      assert.equal(address, wallet);
      signedMessages.push(message);
      return `signature-for-${message}`;
    }
  }, post);

  assert.deepEqual(signedMessages, ['fresh-message-1', 'fresh-message-2']);
  assert.deepEqual(actions.map((action) => action.action), [
    'select-proposal-challenge',
    'select-proposal',
    'select-proposal-challenge',
    'select-proposal'
  ]);
  assert.equal(actions[1].challengeId, 'challenge-1');
  assert.equal(actions[1].signature, 'signature-for-fresh-message-1');
  assert.equal(actions[3].challengeId, 'challenge-2');
  assert.equal(actions[3].signature, 'signature-for-fresh-message-2');
  assert.equal(result.selectedProposal.id, '321');
});

test('proposal authorization does not retry a rejected wallet signature', async () => {
  let challengeRequests = 0;
  const post = async (payload) => {
    if (payload.action === 'select-proposal-challenge') {
      challengeRequests += 1;
      return {
        challenge: {
          signatureRequired: true,
          challengeId: 'challenge-1',
          message: 'message-1'
        }
      };
    }
    throw Object.assign(new Error('Weekly proposal signature could not be verified.'), {
      status: 401,
      code: 'WEEKLY_PROPOSAL_SIGNATURE_INVALID'
    });
  };

  await assert.rejects(
    selectWeeklyProposalWithFreshChallenge({
      address: wallet,
      signMessage: async () => '0xdeadbeef'
    }, post),
    /signature could not be verified/i
  );
  assert.equal(challengeRequests, 1);
});
