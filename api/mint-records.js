const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { reserveRunWalletAssociation } = require('./_lib/runWalletAssociation');
const { checkRateLimit } = require('./_lib/rateLimit');
const { assertSameOrigin } = require('./_lib/walletProfileAuth');
const { handlePlayerRuns } = require('./_lib/playerRuns');
const continuePaymentHandler = require('./_lib/continuePaymentRoute');
const walletProfileHandler = require('./_lib/walletProfileRoute');
const walletPurchaseHandler = require('./_lib/walletPurchaseRoute');
const playerShipAccessHandler = require('./_lib/playerShipAccessRoute');
const walletTokenSpendHandler = require('./_lib/walletTokenSpendRoute');

const MINTS_TABLE = process.env.SUPABASE_MINT_RECORDS_TABLE || 'scicon_mint_records';
const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};
const addressPattern = /^0x[a-f0-9]{40}$/i;
const hashPattern = /^0x[a-f0-9]{64}$/i;

const ownershipSyncError = (error) => {
  if (error?.code === 'RUN_ASSOCIATION_CONFLICT') {
    return Object.assign(
      new Error('This run is already attached to another Base Account.'),
      { statusCode: 409, code: 'MINT_OWNERSHIP_CONFLICT' }
    );
  }
  return Object.assign(
    new Error('The mint confirmed, but wallet ownership is still syncing. Retry to finish.'),
    { statusCode: 503, code: 'MINT_OWNERSHIP_SYNC_PENDING' }
  );
};

const syncMintOwnership = async ({ runId, walletAddress, confirmedAt }) => {
  try {
    // The receipt is canonical. Do not denormalize the leaderboard unless the
    // first-destination lock confirms this exact wallet owns the run.
    await reserveRunWalletAssociation({
      runId,
      walletAddress,
      associatedAt: confirmedAt
    });
  } catch (error) {
    console.error('Mint receipt ownership sync failed:', error);
    throw ownershipSyncError(error);
  }

  try {
    await fetchSupabaseJson(
      `${LEADERBOARD_TABLE}?run_id=eq.${encodeURIComponent(runId)}`,
      {
        method: 'PATCH',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ wallet_address: walletAddress })
      }
    );
  } catch (error) {
    console.error('Mint leaderboard ownership sync failed:', error);
    throw ownershipSyncError(error);
  }
};

const mintConfirmationPersistenceError = () => Object.assign(
  new Error('The mint confirmed on Base, but its Mission Record is still saving. Retry to finish.'),
  { statusCode: 503, code: 'MINT_CONFIRMATION_PERSISTENCE_PENDING' }
);

const resolveConfirmedMintSponsorship = (pendingMint) => Boolean(pendingMint?.sponsored);

const persistConfirmedMint = async ({
  runId,
  walletAddress,
  transactionHash,
  tokenId,
  confirmedAt,
  sponsored
}) => {
  const rows = await fetchSupabaseJson(
    `${MINTS_TABLE}?record_type=eq.mission&run_id=eq.${encodeURIComponent(runId)}&wallet_address=eq.${walletAddress}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        status: 'confirmed',
        token_id: tokenId,
        transaction_hash: transactionHash,
        confirmed_at: confirmedAt,
        sponsored: Boolean(sponsored)
      })
    }
  );
  const persisted = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (
    !persisted
    || persisted.status !== 'confirmed'
    || String(persisted.token_id) !== String(tokenId)
    || String(persisted.transaction_hash || '').toLowerCase() !== transactionHash.toLowerCase()
  ) {
    throw mintConfirmationPersistenceError();
  }
  return persisted;
};

const loadMissionScores = async (rows) => {
  const runIds = [...new Set(rows
    .filter((row) => row?.record_type === 'mission' && row?.run_id)
    .map((row) => String(row.run_id))
  )];
  if (runIds.length === 0) return new Map();

  try {
    const receipts = await fetchSupabaseJson(
      `${RECEIPTS_TABLE}?select=run_id,score&run_id=in.(${runIds.map(encodeURIComponent).join(',')})&limit=${runIds.length}`,
      { headers: supabaseHeaders() }
    );
    return new Map((Array.isArray(receipts) ? receipts : []).map((receipt) => [
      String(receipt.run_id),
      Math.max(0, Math.floor(Number(receipt.score) || 0))
    ]));
  } catch (error) {
    console.error('Mint score enrichment failed:', error);
    return new Map();
  }
};

const verifyCurrentTokenOwnership = async (rows, wallet) => {
  const contractAddress = process.env.MISSION_RECORD_CONTRACT_ADDRESS?.toLowerCase();
  const tokenRows = rows.filter((row) => (
    row?.status === 'confirmed'
    && /^\d+$/.test(String(row.token_id || ''))
  ));
  if (!addressPattern.test(contractAddress || '') || tokenRows.length === 0) return new Map();

  try {
    const { createPublicClient, http } = await import('viem');
    const { base, baseSepolia } = await import('viem/chains');
    const chainId = Number(process.env.MISSION_RECORD_CHAIN_ID || 8453);
    const chain = chainId === 8453 ? base : baseSepolia;
    const client = createPublicClient({
      chain,
      transport: http(chainId === 8453
        ? (process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        : (process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'), {
        retryCount: 0,
        timeout: 3500
      })
    });
    const ownershipResults = await client.multicall({
      allowFailure: true,
      contracts: tokenRows.map((row) => ({
        address: contractAddress,
        abi: [{
          type: 'function',
          name: 'ownerOf',
          stateMutability: 'view',
          inputs: [{ name: 'tokenId', type: 'uint256' }],
          outputs: [{ name: '', type: 'address' }]
        }],
        functionName: 'ownerOf',
        args: [BigInt(row.token_id)]
      }))
    });
    return new Map(tokenRows.map((row, index) => {
      const result = ownershipResults[index];
      return [String(row.token_id), result?.status === 'success' && String(result.result).toLowerCase() === wallet];
    }));
  } catch (error) {
    console.error('Mint ownership verification failed:', error);
    return new Map();
  }
};

module.exports = async (req, res) => {
  if (req.query?.route === 'player-runs') return handlePlayerRuns(req, res);
  if (req.query?.route === 'continue-payments') return continuePaymentHandler(req, res);
  if (req.query?.route === 'wallet-profile') return walletProfileHandler(req, res);
  if (req.query?.route === 'wallet-purchases') return walletPurchaseHandler(req, res);
  if (req.query?.route === 'player-ship-access') return playerShipAccessHandler(req, res);
  if (req.query?.route === 'wallet-token-spends') return walletTokenSpendHandler(req, res);

  try {
    assertSameOrigin(req, { required: false, matchProtocol: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 403, { error: error.message });
  }

  if (req.method === 'POST') {
    const rateLimit = checkRateLimit(req, {
      scope: 'mint-confirmation',
      limit: 30,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))));
      return sendJson(res, 429, {
        error: 'Too many mint confirmation requests. Try again shortly.',
        code: 'MINT_CONFIRMATION_RATE_LIMITED'
      });
    }
  }

  try {
    if (req.method === 'GET') {
      const wallet = String(req.query?.wallet || '').toLowerCase();
      if (!addressPattern.test(wallet)) return sendJson(res, 400, { error: 'Valid wallet is required' });
      const rows = await fetchSupabaseJson(`${MINTS_TABLE}?select=record_type,run_id,week_key,wallet_address,chain_id,token_id,transaction_hash,status,sponsored,created_at,confirmed_at&wallet_address=eq.${wallet}&order=created_at.desc&limit=100`, {
        headers: supabaseHeaders()
      });
      const records = Array.isArray(rows) ? rows : [];
      const [scoresByRunId, ownershipByTokenId] = await Promise.all([
        loadMissionScores(records),
        verifyCurrentTokenOwnership(records, wallet)
      ]);
      return sendJson(res, 200, {
        records: records.map((record) => ({
          ...record,
          score: scoresByRunId.get(String(record.run_id)),
          ownership_verified: record.token_id && ownershipByTokenId.has(String(record.token_id))
            ? ownershipByTokenId.get(String(record.token_id))
            : undefined
        }))
      });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.action !== 'confirm' || body.recordType !== 'mission' || !body.runId || !addressPattern.test(body.address || '') || !hashPattern.test(body.transactionHash || '')) {
      return sendJson(res, 400, { error: 'Mint confirmation details are invalid' });
    }
    const walletAddress = body.address.toLowerCase();
    const existingRows = await fetchSupabaseJson(`${MINTS_TABLE}?select=status,token_id,transaction_hash,confirmed_at,sponsored&record_type=eq.mission&run_id=eq.${encodeURIComponent(body.runId)}&wallet_address=eq.${walletAddress}&limit=1`, {
      headers: supabaseHeaders()
    });
    const existingMint = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existingMint?.status === 'confirmed') {
      await syncMintOwnership({
        runId: body.runId,
        walletAddress,
        confirmedAt: existingMint.confirmed_at || new Date().toISOString()
      });
      return sendJson(res, 200, {
        confirmed: true,
        transactionHash: existingMint.transaction_hash,
        tokenId: existingMint.token_id
      });
    }
    const contractAddress = process.env.MISSION_RECORD_CONTRACT_ADDRESS?.toLowerCase();
    if (!addressPattern.test(contractAddress || '')) return sendJson(res, 503, { error: 'Mission Record contract is not configured' });
    const { createPublicClient, decodeEventLog, http } = await import('viem');
    const { base, baseSepolia } = await import('viem/chains');
    const chainId = Number(process.env.MISSION_RECORD_CHAIN_ID || 8453);
    const chain = chainId === 8453 ? base : baseSepolia;
    const client = createPublicClient({
      chain,
      transport: http(chainId === 8453
        ? (process.env.BASE_RPC_URL || 'https://mainnet.base.org')
        : (process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'))
    });
    const receipt = await client.getTransactionReceipt({ hash: body.transactionHash });
    if (receipt.status !== 'success') {
      return sendJson(res, 409, { error: 'The Mission Record transaction did not confirm successfully' });
    }
    const missionEventAbi = [{
      type: 'event',
      name: 'MissionRecordMinted',
      inputs: [
        { name: 'tokenId', type: 'uint256', indexed: true },
        { name: 'runId', type: 'bytes32', indexed: true },
        { name: 'player', type: 'address', indexed: true },
        { name: 'score', type: 'uint256', indexed: false },
        { name: 'wave', type: 'uint256', indexed: false }
      ]
    }];
    const expectedRunId = `0x${crypto.createHash('sha256').update(body.runId).digest('hex')}`;
    const mintEvent = receipt.logs
      .filter((log) => log.address.toLowerCase() === contractAddress)
      .map((log) => {
        try {
          return decodeEventLog({ abi: missionEventAbi, data: log.data, topics: log.topics });
        } catch {
          return null;
        }
      })
      .find((event) => event?.eventName === 'MissionRecordMinted'
        && event.args.runId?.toLowerCase() === expectedRunId
        && event.args.player?.toLowerCase() === walletAddress);
    if (!mintEvent) {
      return sendJson(res, 409, { error: 'The confirmed transaction did not mint this Mission Record' });
    }
    const confirmedAt = new Date().toISOString();
    await persistConfirmedMint({
      runId: body.runId,
      walletAddress,
      transactionHash: body.transactionHash,
      tokenId: mintEvent.args.tokenId.toString(),
      confirmedAt,
      // Sponsorship was reserved server-side during authorization. Never let
      // a public transaction observer choose or consume this wallet's weekly
      // sponsored eligibility from the confirmation request body.
      sponsored: resolveConfirmedMintSponsorship(existingMint)
    });
    await syncMintOwnership({
      runId: body.runId,
      walletAddress,
      confirmedAt
    });
    return sendJson(res, 200, { confirmed: true, transactionHash: body.transactionHash, tokenId: mintEvent.args.tokenId.toString() });
  } catch (error) {
    console.error('Mint confirmation failed:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Mint confirmation failed',
      ...(error?.code ? { code: error.code } : {})
    });
  }
};

module.exports.persistConfirmedMint = persistConfirmedMint;
module.exports.resolveConfirmedMintSponsorship = resolveConfirmedMintSponsorship;
