const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');

const MINTS_TABLE = process.env.SUPABASE_MINT_RECORDS_TABLE || 'scicon_mint_records';
const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};
const addressPattern = /^0x[a-f0-9]{40}$/i;
const hashPattern = /^0x[a-f0-9]{64}$/i;

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const wallet = String(req.query?.wallet || '').toLowerCase();
      if (!addressPattern.test(wallet)) return sendJson(res, 400, { error: 'Valid wallet is required' });
      const rows = await fetchSupabaseJson(`${MINTS_TABLE}?select=record_type,run_id,week_key,wallet_address,chain_id,token_id,transaction_hash,status,sponsored,created_at,confirmed_at&wallet_address=eq.${wallet}&order=created_at.desc&limit=50`, {
        headers: supabaseHeaders()
      });
      return sendJson(res, 200, { records: Array.isArray(rows) ? rows : [] });
    }
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.action !== 'confirm' || body.recordType !== 'mission' || !body.runId || !addressPattern.test(body.address || '') || !hashPattern.test(body.transactionHash || '')) {
      return sendJson(res, 400, { error: 'Mint confirmation details are invalid' });
    }
    const existingRows = await fetchSupabaseJson(`${MINTS_TABLE}?select=status,token_id,transaction_hash&record_type=eq.mission&run_id=eq.${encodeURIComponent(body.runId)}&wallet_address=eq.${body.address.toLowerCase()}&limit=1`, {
      headers: supabaseHeaders()
    });
    const existingMint = Array.isArray(existingRows) ? existingRows[0] : null;
    if (existingMint?.status === 'confirmed') {
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
        && event.args.player?.toLowerCase() === body.address.toLowerCase());
    if (!mintEvent) {
      return sendJson(res, 409, { error: 'The confirmed transaction did not mint this Mission Record' });
    }
    const confirmedAt = new Date().toISOString();
    await fetchSupabaseJson(`${MINTS_TABLE}?record_type=eq.mission&run_id=eq.${encodeURIComponent(body.runId)}&wallet_address=eq.${body.address.toLowerCase()}`, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        status: 'confirmed',
        token_id: mintEvent.args.tokenId.toString(),
        transaction_hash: body.transactionHash,
        confirmed_at: confirmedAt,
        sponsored: Boolean(body.sponsored)
      })
    });
    const ownershipUpdates = await Promise.allSettled([
      fetchSupabaseJson(`${RECEIPTS_TABLE}?run_id=eq.${encodeURIComponent(body.runId)}&wallet_address=is.null`, {
        method: 'PATCH',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ wallet_address: body.address.toLowerCase(), wallet_claimed_at: confirmedAt })
      }),
      fetchSupabaseJson(`${LEADERBOARD_TABLE}?run_id=eq.${encodeURIComponent(body.runId)}&wallet_address=is.null`, {
        method: 'PATCH',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ wallet_address: body.address.toLowerCase() })
      })
    ]);
    ownershipUpdates.forEach((result) => {
      if (result.status === 'rejected') console.error('Mint ownership sync failed:', result.reason);
    });
    return sendJson(res, 200, { confirmed: true, transactionHash: body.transactionHash, tokenId: mintEvent.args.tokenId.toString() });
  } catch (error) {
    console.error('Mint confirmation failed:', error);
    return sendJson(res, 500, { error: error.message || 'Mint confirmation failed' });
  }
};
