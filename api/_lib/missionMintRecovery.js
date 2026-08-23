const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { reserveRunWalletAssociation } = require('./runWalletAssociation');

const MINTS_TABLE = process.env.SUPABASE_MINT_RECORDS_TABLE || 'scicon_mint_records';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const AUTHORIZATION_LOOKBACK_MS = 5 * 60 * 1000;
const AUTHORIZATION_EVENT_WINDOW_MS = 20 * 60 * 1000;
const RECOVERY_DEADLINE_MS = 7_000;

const missionRecordMintedEvent = {
  type: 'event',
  name: 'MissionRecordMinted',
  inputs: [
    { name: 'tokenId', type: 'uint256', indexed: true },
    { name: 'runId', type: 'bytes32', indexed: true },
    { name: 'player', type: 'address', indexed: true },
    { name: 'score', type: 'uint256', indexed: false },
    { name: 'wave', type: 'uint256', indexed: false }
  ]
};

const recoveryError = (message, code = 'MINT_CHAIN_RECOVERY_PENDING') => Object.assign(
  new Error(message),
  { statusCode: 503, code }
);

const runIdBytes32 = (runId) => (
  `0x${crypto.createHash('sha256').update(String(runId || '')).digest('hex')}`
);

const firstBlockAtOrAfter = async ({ client, targetMs, latestBlockNumber }) => {
  let low = 0n;
  let high = latestBlockNumber;
  while (low < high) {
    const middle = low + ((high - low) / 2n);
    const block = await client.getBlock({ blockNumber: middle });
    const timestampMs = Number(block.timestamp) * 1000;
    if (!Number.isFinite(timestampMs)) {
      throw recoveryError('Mission Record chain history returned an invalid block timestamp.');
    }
    if (timestampMs < targetMs) low = middle + 1n;
    else high = middle;
  }
  return low;
};

const createMissionMintClient = async (chainId) => {
  const { createPublicClient, http } = await import('viem');
  const { base, baseSepolia } = await import('viem/chains');
  const chain = chainId === 8453 ? base : baseSepolia;
  return createPublicClient({
    chain,
    transport: http(chainId === 8453
      ? (process.env.BASE_RPC_URL || 'https://mainnet.base.org')
      : (process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'), {
      retryCount: 0,
      timeout: 3_500
    })
  });
};

const withRecoveryDeadline = async (task) => {
  let timeoutId;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(recoveryError(
          'Mission Record chain recovery timed out. Retry before submitting another mint.'
        )), RECOVERY_DEADLINE_MS);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const findCanonicalMissionMintEvent = async ({
  runId,
  walletAddress,
  contractAddress,
  chainId,
  authorizedAt,
  expectedScore,
  expectedWave,
  client: providedClient
}) => {
  const authorizedAtMs = Date.parse(authorizedAt);
  if (!Number.isFinite(authorizedAtMs)) {
    throw recoveryError('Pending Mission Record authorization has no recoverable timestamp.');
  }
  const expectedRunId = runIdBytes32(runId);
  const player = String(walletAddress || '').toLowerCase();
  const client = providedClient || await createMissionMintClient(chainId);

  return withRecoveryDeadline((async () => {
    const latestBlockNumber = await client.getBlockNumber();
    const [fromBlock, throughBlock] = await Promise.all([
      firstBlockAtOrAfter({
        client,
        targetMs: authorizedAtMs - AUTHORIZATION_LOOKBACK_MS,
        latestBlockNumber
      }),
      firstBlockAtOrAfter({
        client,
        targetMs: authorizedAtMs + AUTHORIZATION_EVENT_WINDOW_MS,
        latestBlockNumber
      })
    ]);
    const toBlock = throughBlock < latestBlockNumber ? throughBlock : latestBlockNumber;
    const logs = await client.getLogs({
      address: contractAddress,
      event: missionRecordMintedEvent,
      args: { runId: expectedRunId, player },
      fromBlock,
      toBlock
    });
    const matches = (Array.isArray(logs) ? logs : []).filter((log) => (
      String(log?.args?.runId || '').toLowerCase() === expectedRunId
      && String(log?.args?.player || '').toLowerCase() === player
      && Number(log?.args?.score) === Number(expectedScore)
      && Number(log?.args?.wave) === Number(expectedWave)
      && /^0x[a-f0-9]{64}$/i.test(String(log?.transactionHash || ''))
      && /^\d+$/.test(String(log?.args?.tokenId ?? ''))
    ));
    if (matches.length > 1) {
      throw recoveryError(
        'Mission Record chain history returned more than one canonical mint.',
        'MINT_CHAIN_RECOVERY_AMBIGUOUS'
      );
    }
    if (matches.length === 0) return null;
    const match = matches[0];
    return {
      transactionHash: String(match.transactionHash).toLowerCase(),
      tokenId: String(match.args.tokenId),
      score: Number(match.args.score),
      wave: Number(match.args.wave)
    };
  })());
};

const persistRecoveredMissionMint = async ({
  runId,
  walletAddress,
  pendingMint,
  recoveredMint,
  confirmedAt = new Date().toISOString()
}) => {
  const selector = `${MINTS_TABLE}?select=status,transaction_hash,token_id,sponsored,wallet_address,confirmed_at`
    + `&record_type=eq.mission&run_id=eq.${encodeURIComponent(runId)}`
    + `&wallet_address=eq.${walletAddress}`;
  const updatedRows = await fetchSupabaseJson(`${selector}&status=eq.pending`, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      status: 'confirmed',
      transaction_hash: recoveredMint.transactionHash,
      token_id: recoveredMint.tokenId,
      confirmed_at: confirmedAt,
      sponsored: Boolean(pendingMint?.sponsored)
    })
  });
  if (Array.isArray(updatedRows) && updatedRows.length > 1) {
    throw recoveryError(
      'Mission Record recovery affected more than one pending row.',
      'MINT_CHAIN_RECOVERY_AMBIGUOUS'
    );
  }
  let persisted = Array.isArray(updatedRows) ? (updatedRows[0] || null) : null;
  if (!persisted) {
    const currentRows = await fetchSupabaseJson(`${selector}&limit=1`, {
      headers: supabaseHeaders()
    });
    persisted = Array.isArray(currentRows) ? (currentRows[0] || null) : null;
  }
  if (
    persisted?.status !== 'confirmed'
    || String(persisted.wallet_address || '').toLowerCase() !== walletAddress
    || String(persisted.transaction_hash || '').toLowerCase() !== recoveredMint.transactionHash
    || String(persisted.token_id || '') !== recoveredMint.tokenId
  ) {
    throw recoveryError('Recovered Mission Record confirmation could not be persisted.');
  }

  await reserveRunWalletAssociation({
    runId,
    walletAddress,
    associatedAt: persisted.confirmed_at || confirmedAt
  });
  await fetchSupabaseJson(`${LEADERBOARD_TABLE}?run_id=eq.${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ wallet_address: walletAddress })
  });
  return persisted;
};

const recoverPendingMissionMint = async ({
  runId,
  walletAddress,
  contractAddress,
  chainId,
  pendingMint,
  expectedScore,
  expectedWave,
  client
}) => {
  if (!pendingMint || pendingMint.status !== 'pending') return null;
  const recoveredMint = await findCanonicalMissionMintEvent({
    runId,
    walletAddress,
    contractAddress,
    chainId,
    authorizedAt: pendingMint.created_at,
    expectedScore,
    expectedWave,
    client
  });
  if (!recoveredMint) return null;
  return persistRecoveredMissionMint({
    runId,
    walletAddress,
    pendingMint,
    recoveredMint
  });
};

module.exports = {
  findCanonicalMissionMintEvent,
  firstBlockAtOrAfter,
  missionRecordMintedEvent,
  persistRecoveredMissionMint,
  recoverPendingMissionMint,
  runIdBytes32
};
