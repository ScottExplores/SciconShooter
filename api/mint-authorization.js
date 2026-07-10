const crypto = require('crypto');
const { verifyRunReceipt } = require('./_lib/runReceipts');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const MINTS_TABLE = process.env.SUPABASE_MINT_RECORDS_TABLE || 'scicon_mint_records';
const AUTH_LIFETIME_SECONDS = 10 * 60;

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const normalizeAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const toBytes32 = (runId) => `0x${crypto.createHash('sha256').update(runId).digest('hex')}`;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (body.recordType !== 'mission') return sendJson(res, 400, { error: 'Unsupported record type' });
    const address = normalizeAddress(body.address);
    if (!address) return sendJson(res, 400, { error: 'A valid Base wallet is required' });
    const receipt = verifyRunReceipt(body.receiptToken);
    const contractAddress = normalizeAddress(process.env.MISSION_RECORD_CONTRACT_ADDRESS);
    const privateKey = process.env.MINT_AUTHORIZER_PRIVATE_KEY;
    const chainId = Number(process.env.MISSION_RECORD_CHAIN_ID || 84532);
    if (!contractAddress || !/^0x[a-fA-F0-9]{64}$/.test(privateKey || '')) {
      return sendJson(res, 503, { error: 'Base Sepolia minting is prepared but not deployed.' });
    }

    const receiptRows = await fetchSupabaseJson(`${RECEIPTS_TABLE}?select=*&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`, {
      headers: supabaseHeaders()
    });
    const stored = Array.isArray(receiptRows) ? receiptRows[0] : null;
    if (!stored || stored.wallet_address?.toLowerCase() !== address) {
      return sendJson(res, 403, { error: 'Attach this verified run to the connected Base Account first.' });
    }

    const existingRows = await fetchSupabaseJson(`${MINTS_TABLE}?select=status,transaction_hash&record_type=eq.mission&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`, {
      headers: supabaseHeaders()
    });
    if (Array.isArray(existingRows) && existingRows.some((row) => row.status === 'confirmed' || row.status === 'pending')) {
      return sendJson(res, 409, { error: 'A Mission Record for this run already exists or is pending.' });
    }

    const now = new Date();
    const dayOffset = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - dayOffset);
    weekStart.setUTCHours(0, 0, 0, 0);
    const sponsoredRows = await fetchSupabaseJson(`${MINTS_TABLE}?select=id&wallet_address=eq.${address}&record_type=eq.mission&sponsored=eq.true&created_at=gte.${encodeURIComponent(weekStart.toISOString())}&limit=1`, {
      headers: supabaseHeaders()
    });
    const sponsoredEligible = !Array.isArray(sponsoredRows) || sponsoredRows.length === 0;

    const runId = toBytes32(receipt.runId);
    const visualSeed = BigInt(`0x${crypto.createHash('sha256').update(`visual:${receipt.runId}`).digest('hex').slice(0, 16)}`);
    const expiresAt = Math.floor(Date.now() / 1000) + AUTH_LIFETIME_SECONDS;
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'sciconshooter.xyz'}`;
    const tokenUri = `${origin}/api/record-metadata?type=mission&runId=${encodeURIComponent(receipt.runId)}`;
    const { privateKeyToAccount } = await import('viem/accounts');
    const { keccak256, toBytes } = await import('viem');
    const account = privateKeyToAccount(privateKey);
    const signature = await account.signTypedData({
      domain: { name: 'Scicon Shooter Records', version: '1', chainId, verifyingContract: contractAddress },
      types: {
        MissionAuthorization: [
          { name: 'runId', type: 'bytes32' }, { name: 'player', type: 'address' },
          { name: 'score', type: 'uint256' }, { name: 'wave', type: 'uint256' },
          { name: 'visualSeed', type: 'uint256' }, { name: 'tokenUriHash', type: 'bytes32' },
          { name: 'expiresAt', type: 'uint256' }
        ]
      },
      primaryType: 'MissionAuthorization',
      message: {
        runId, player: address, score: BigInt(receipt.metrics.score), wave: BigInt(receipt.metrics.wave),
        visualSeed, tokenUriHash: keccak256(toBytes(tokenUri)), expiresAt: BigInt(expiresAt)
      }
    });

    await fetchSupabaseJson(`${MINTS_TABLE}?on_conflict=record_type,run_id`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        record_type: 'mission', run_id: receipt.runId, wallet_address: address, chain_id: chainId,
        status: 'pending', sponsored: sponsoredEligible
      })
    });

    return sendJson(res, 200, {
      contractAddress, chainId, runId, score: receipt.metrics.score, wave: receipt.metrics.wave,
      visualSeed: visualSeed.toString(), tokenUri, expiresAt, signature, sponsoredEligible
    });
  } catch (error) {
    console.error('Mint authorization failed:', error);
    return sendJson(res, 500, { error: error.message || 'Mint authorization failed' });
  }
};
