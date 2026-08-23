const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { requireTrustedReceiptProvenance } = require('./runReceiptProvenance');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';

const normalizeAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const associationError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  code
});

const readRunWalletAssociation = async (runId) => {
  const rows = await fetchSupabaseJson(
    `${RECEIPTS_TABLE}?select=wallet_address,wallet_claimed_at,receipt_provenance_version&run_id=eq.${encodeURIComponent(runId)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? (rows[0] || null) : null;
};

const storedWallet = (row) => String(row?.wallet_address || '').trim().toLowerCase() || null;

const assertAvailableDestination = (row, walletAddress) => {
  if (!row) {
    throw associationError(
      'This verified run is not available for wallet association.',
      404,
      'RUN_ASSOCIATION_NOT_FOUND'
    );
  }
  requireTrustedReceiptProvenance(row);
  const currentWallet = storedWallet(row);
  if (currentWallet && currentWallet !== walletAddress) {
    throw associationError(
      'This run is already attached to another Base Account.',
      409,
      'RUN_ASSOCIATION_CONFLICT'
    );
  }
  return currentWallet;
};

/**
 * Atomically assigns a persisted run receipt to its first wallet destination.
 * Competing destinations both PATCH the null owner, so Postgres accepts only
 * one. A lost response or same-wallet retry is recovered by reading the
 * canonical row after the conditional PATCH.
 */
const reserveRunWalletAssociation = async ({
  runId,
  walletAddress,
  associatedAt = new Date().toISOString(),
  storedAssociation
}) => {
  const normalizedAddress = normalizeAddress(walletAddress);
  if (!normalizedAddress) {
    throw associationError('A valid Base wallet address is required.', 400, 'RUN_ASSOCIATION_WALLET_INVALID');
  }
  if (!runId) {
    throw associationError('A verified run is required.', 400, 'RUN_ASSOCIATION_RUN_INVALID');
  }

  let current = storedAssociation === undefined
    ? await readRunWalletAssociation(runId)
    : storedAssociation;
  const currentWallet = assertAvailableDestination(current, normalizedAddress);
  if (currentWallet === normalizedAddress) {
    return {
      runId,
      walletAddress: normalizedAddress,
      associatedAt: current.wallet_claimed_at || associatedAt,
      newlyAssociated: false
    };
  }

  const updatedRows = await fetchSupabaseJson(
    `${RECEIPTS_TABLE}?select=wallet_address,wallet_claimed_at,receipt_provenance_version&run_id=eq.${encodeURIComponent(runId)}&wallet_address=is.null&receipt_provenance_version=eq.1`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        wallet_address: normalizedAddress,
        wallet_claimed_at: associatedAt
      })
    }
  );
  if (Array.isArray(updatedRows) && updatedRows.length > 1) {
    throw associationError(
      'Run wallet association is not unique.',
      500,
      'RUN_ASSOCIATION_NOT_UNIQUE'
    );
  }
  const updated = Array.isArray(updatedRows) ? (updatedRows[0] || null) : null;
  if (storedWallet(updated) === normalizedAddress) {
    return {
      runId,
      walletAddress: normalizedAddress,
      associatedAt: updated.wallet_claimed_at || associatedAt,
      newlyAssociated: true
    };
  }

  // The conditional update may return no row because another request won, or
  // because its successful response was interrupted. Re-read before deciding.
  current = await readRunWalletAssociation(runId);
  const finalWallet = assertAvailableDestination(current, normalizedAddress);
  if (finalWallet === normalizedAddress) {
    return {
      runId,
      walletAddress: normalizedAddress,
      associatedAt: current.wallet_claimed_at || associatedAt,
      newlyAssociated: false
    };
  }

  throw associationError(
    'This run could not be attached. Refresh before retrying.',
    409,
    'RUN_ASSOCIATION_RETRY'
  );
};

module.exports = {
  readRunWalletAssociation,
  reserveRunWalletAssociation
};
