const { readGuestIdentity } = require('./guestIdentity');
const { createRunIdentityBinding } = require('./runReceipts');

const normalizeAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const identityError = (message) => Object.assign(new Error(message), {
  statusCode: 403,
  code: 'RUN_IDENTITY_MISMATCH'
});

/**
 * Authorizes the original browser/wallet identity to begin associating a run
 * with an onchain wallet. The destination wallet still needs its normal proof
 * (Base signature for claims or the actual mint transaction).
 */
const requireRunAssociationIdentity = ({ receipt, requestedAddress, req }) => {
  const address = normalizeAddress(requestedAddress);
  if (!address) throw Object.assign(new Error('A valid Base wallet address is required.'), { statusCode: 400 });

  if (receipt?.identity?.kind === 'wallet') {
    if (normalizeAddress(receipt.identity.walletAddress) !== address) {
      throw identityError('This run was started by a different Base Account.');
    }
    return { kind: 'wallet', walletAddress: address };
  }

  if (receipt?.identity?.kind === 'guest') {
    const guestIdentity = readGuestIdentity(req);
    if (!guestIdentity) {
      throw identityError('This guest run must be claimed from the browser that started it.');
    }
    const expected = createRunIdentityBinding({ guestIdentityId: guestIdentity.guestId });
    if (expected.profileIdHash !== receipt.identity.profileIdHash) {
      throw identityError('This guest run belongs to a different browser session.');
    }
    return { kind: 'guest', walletAddress: address };
  }

  // Identity-less legacy receipts cannot be safely associated because neither
  // the starting wallet nor browser can be proven after the fact.
  throw identityError('This legacy run cannot be attached to a wallet. Play a new verified run to mint or claim it.');
};

module.exports = {
  requireRunAssociationIdentity
};
