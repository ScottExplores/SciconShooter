/**
 * Weekly funding release.
 *
 * The signed champion claim records which eligible proposal the winner chose.
 * It does not move RSC. An admin then approves that choice (`pending-funding`).
 * Recording `funded` requires a second admin action that cites a transfer
 * hash the admin already broadcast outside this API. This module never builds,
 * signs, or submits a transaction.
 */

const TX_HASH = /^0x[a-fA-F0-9]{64}$/;

const fail = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  code
});

const normalizeStatus = (competition) => String(competition?.status || '').toLowerCase();

const approvalRecord = (competition, status, extra = {}) => ({
  weekKey: String(competition.week_key || ''),
  status,
  proposalId: String(competition.proposal_id || ''),
  proposalTitle: String(competition.proposal_title || ''),
  winnerRunId: String(competition.winner_run_id || ''),
  winnerWallet: String(competition.winner_wallet || ''),
  allocationRsc: Number(competition.allocation_rsc) || 0,
  ...extra
});

/**
 * Winner has signed a proposal choice. Approve it for a later manual transfer.
 * Rejects anything that is not an untouched `claimed` row.
 */
const approveClaimedSelection = (competition) => {
  const status = normalizeStatus(competition);
  if (status === 'pending-funding') {
    return {
      alreadyApproved: true,
      patch: null,
      record: approvalRecord(competition, 'pending-funding')
    };
  }
  if (status !== 'claimed') {
    throw fail(
      'Only a claimed weekly winner can be approved for funding.',
      409,
      'WEEKLY_FUNDING_NOT_CLAIMED'
    );
  }
  if (!String(competition?.proposal_id || '').trim() || !String(competition?.winner_run_id || '').trim()) {
    throw fail(
      'The claimed week has no proposal or winning run to approve.',
      409,
      'WEEKLY_FUNDING_CLAIM_INCOMPLETE'
    );
  }
  return {
    alreadyApproved: false,
    patch: {
      status: 'pending-funding',
      allocation_tx_hash: null
    },
    record: approvalRecord(competition, 'pending-funding')
  };
};

/**
 * Record a transfer that an admin already sent. Does not create one.
 */
const recordManualFundingTransfer = (competition, txHash) => {
  const status = normalizeStatus(competition);
  const hash = String(txHash || '').trim();
  if (!TX_HASH.test(hash)) {
    throw fail(
      'A manual funding record needs the 32-byte transaction hash of a transfer that already happened.',
      400,
      'WEEKLY_FUNDING_TX_HASH_REQUIRED'
    );
  }
  if (status === 'funded') {
    const stored = String(competition?.allocation_tx_hash || '');
    // REVAMP(E): Never acknowledge a transfer hash that was not persisted.
    if (!TX_HASH.test(stored)) {
      throw fail(
        'This funded week has no valid recorded transfer hash. An admin must repair the archive before retrying.',
        409,
        'WEEKLY_FUNDING_RECORD_INCOMPLETE'
      );
    }
    if (stored && stored.toLowerCase() !== hash.toLowerCase()) {
      throw fail(
        'This week already records a different funding transaction.',
        409,
        'WEEKLY_FUNDING_TX_MISMATCH'
      );
    }
    return {
      alreadyRecorded: true,
      patch: null,
      record: approvalRecord(competition, 'funded', { allocationTxHash: stored || hash })
    };
  }
  if (status !== 'pending-funding') {
    throw fail(
      'Funding can be recorded only after an admin has approved the winner\'s proposal.',
      409,
      'WEEKLY_FUNDING_NOT_APPROVED'
    );
  }
  return {
    alreadyRecorded: false,
    patch: {
      status: 'funded',
      allocation_tx_hash: hash
    },
    record: approvalRecord(competition, 'funded', { allocationTxHash: hash })
  };
};

module.exports = {
  approveClaimedSelection,
  recordManualFundingTransfer
};
