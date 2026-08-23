const crypto = require('crypto');
const { verifyRunReceipt } = require('./_lib/runReceipts');
const { requireRunAssociationIdentity } = require('./_lib/runIdentityAuthorization');
const { reserveRunWalletAssociation } = require('./_lib/runWalletAssociation');
const { recoverPendingMissionMint } = require('./_lib/missionMintRecovery');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { checkRateLimit } = require('./_lib/rateLimit');
const { assertSameOrigin, readWalletProfileSession } = require('./_lib/walletProfileAuth');
const { hasTrustedReceiptProvenance } = require('./_lib/runReceiptProvenance');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const MINTS_TABLE = process.env.SUPABASE_MINT_RECORDS_TABLE || 'scicon_mint_records';
const AUTH_LIFETIME_SECONDS = 10 * 60;
const AUTH_REISSUE_GRACE_SECONDS = 2 * 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const recordCardRenderer = import('../shared/record-card/renderRecordCardSvg.mjs');

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

const storedReceiptMatches = (stored, receipt) => {
  if (
    !stored
    || !hasTrustedReceiptProvenance(stored)
    || receipt.integrity !== 'server-verified'
    || stored.integrity_status !== 'server-verified'
  ) {
    return false;
  }
  const storedRunMode = stored.run_mode === 'weekly-streak' ? 'weekly-streak' : 'standard';
  const receiptRunMode = receipt.runMode === 'weekly-streak' ? 'weekly-streak' : 'standard';
  return String(stored.run_id || '') === receipt.runId
    && Number(stored.score) === Number(receipt.metrics.score)
    && Number(stored.wave) === Number(receipt.metrics.wave)
    && Number(stored.duration_ms) === Number(receipt.metrics.durationMs)
    && Number(stored.enemies_defeated) === Number(receipt.metrics.enemiesDefeated)
    && Number(stored.coins_collected) === Number(receipt.metrics.coinsCollected)
    && String(stored.player_ship_id || '').toLowerCase() === String(receipt.metrics.playerShipId || '').toLowerCase()
    && String(stored.game_version || '') === String(receipt.gameVersion || '')
    && storedRunMode === receiptRunMode
    && Boolean(stored.test_run) === Boolean(receipt.testRun);
};

module.exports = async (req, res) => {
  try {
    assertSameOrigin(req, { required: false, matchProtocol: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 403, { error: error.message });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rateLimit = checkRateLimit(req, {
      scope: 'mint-authorization',
      limit: 20,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))));
      return sendJson(res, 429, {
        error: 'Too many mint authorization requests. Try again shortly.',
        code: 'MINT_AUTHORIZATION_RATE_LIMITED'
      });
    }
    if (body.recordType !== 'mission') return sendJson(res, 400, { error: 'Unsupported record type' });
    const address = normalizeAddress(body.address);
    if (!address) return sendJson(res, 400, { error: 'A valid Base wallet is required' });
    const walletSession = readWalletProfileSession(req);
    if (walletSession.walletAddress !== address) {
      return sendJson(res, 403, { error: 'This wallet profile session belongs to another Base Account.' });
    }
    const receipt = verifyRunReceipt(body.receiptToken);
    requireRunAssociationIdentity({ receipt, requestedAddress: address, req });
    const pilotTestWallet = String(process.env.PILOT_TEST_WALLET || '0x3a8d692aabdd4981080a8f6af8375a21359464bf').toLowerCase();
    if (receipt.testRun && address !== pilotTestWallet) {
      return sendJson(res, 403, { error: 'Pilot Test records can only be minted by the project wallet.' });
    }
    const contractAddress = normalizeAddress(process.env.MISSION_RECORD_CONTRACT_ADDRESS);
    const privateKey = process.env.MINT_AUTHORIZER_PRIVATE_KEY;
    const chainId = Number(process.env.MISSION_RECORD_CHAIN_ID || 8453);
    if (!contractAddress || !/^0x[a-fA-F0-9]{64}$/.test(privateKey || '')) {
      return sendJson(res, 503, { error: 'Base minting is prepared but the record contract is not configured.' });
    }

    const receiptRows = await fetchSupabaseJson(`${RECEIPTS_TABLE}?select=*&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`, {
      headers: supabaseHeaders()
    });
    const stored = Array.isArray(receiptRows) ? receiptRows[0] : null;
    if (!stored) {
      return sendJson(res, 404, { error: 'This verified run is not available for minting.' });
    }
    if (!storedReceiptMatches(stored, receipt)) {
      return sendJson(res, 409, {
        error: 'This Mission Record receipt is not the canonical persisted run.',
        code: 'MINT_RECEIPT_NOT_CANONICAL'
      });
    }
    if (stored.wallet_address && stored.wallet_address.toLowerCase() !== address) {
      return sendJson(res, 403, { error: 'This run is already attached to another Base Account.' });
    }

    const existingRows = await fetchSupabaseJson(`${MINTS_TABLE}?select=status,transaction_hash,token_id,sponsored,wallet_address,chain_id,created_at,confirmed_at&record_type=eq.mission&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`, {
      headers: supabaseHeaders()
    });
    let confirmedMint = Array.isArray(existingRows) ? existingRows.find((row) => row.status === 'confirmed') : null;
    if (confirmedMint && confirmedMint.wallet_address?.toLowerCase() !== address) {
      return sendJson(res, 409, { error: 'This run was already minted by another Base Account.' });
    }
    const pendingMint = Array.isArray(existingRows) ? existingRows.find((row) => row.status === 'pending') : null;
    if (pendingMint && pendingMint.wallet_address?.toLowerCase() !== address) {
      return sendJson(res, 409, { error: 'A mint is already pending for this run.' });
    }
    if (pendingMint && Number(pendingMint.chain_id) !== chainId) {
      return sendJson(res, 409, {
        error: 'This Mission Record has a pending authorization on another chain.',
        code: 'MINT_PENDING_CHAIN_MISMATCH'
      });
    }
    if (!confirmedMint && pendingMint) {
      confirmedMint = await recoverPendingMissionMint({
        runId: receipt.runId,
        walletAddress: address,
        contractAddress,
        chainId,
        pendingMint,
        expectedScore: receipt.metrics.score,
        expectedWave: receipt.metrics.wave
      });

      if (!confirmedMint) {
        const priorAuthorizedAtMs = Date.parse(pendingMint.created_at);
        const safeReissueAtMs = priorAuthorizedAtMs
          + (AUTH_LIFETIME_SECONDS + AUTH_REISSUE_GRACE_SECONDS) * 1000;
        if (!Number.isFinite(priorAuthorizedAtMs) || safeReissueAtMs > Date.now()) {
          const retryAfterSeconds = Number.isFinite(safeReissueAtMs)
            ? Math.max(1, Math.ceil((safeReissueAtMs - Date.now()) / 1000))
            : AUTH_LIFETIME_SECONDS + AUTH_REISSUE_GRACE_SECONDS;
          res.setHeader('Retry-After', String(retryAfterSeconds));
          return sendJson(res, 425, {
            error: 'The prior Mission Record authorization may still settle. Retry chain recovery shortly.',
            code: 'MINT_AUTHORIZATION_STILL_PENDING'
          });
        }
        // The next authorization may be used long after the original pending
        // row was created. Move its bounded event-recovery window immediately
        // before issuing the replacement signature, after proving that the
        // prior window contains no canonical mint. The old timestamp is part
        // of the conditional write so concurrent retries cannot both issue a
        // replacement authorization.
        const refreshedAt = new Date().toISOString();
        const refreshedRows = await fetchSupabaseJson(
          `${MINTS_TABLE}?select=status,transaction_hash,token_id,sponsored,wallet_address,chain_id,created_at,confirmed_at`
          + `&record_type=eq.mission&run_id=eq.${encodeURIComponent(receipt.runId)}`
          + `&wallet_address=eq.${address}&status=eq.pending`
          + `&created_at=eq.${encodeURIComponent(pendingMint.created_at)}`,
          {
            method: 'PATCH',
            headers: supabaseHeaders({ Prefer: 'return=representation' }),
            body: JSON.stringify({ created_at: refreshedAt })
          }
        );
        if (!Array.isArray(refreshedRows) || refreshedRows.length !== 1) {
          throw Object.assign(
            new Error('Pending Mission Record state changed during chain recovery. Retry before minting.'),
            { statusCode: 503, code: 'MINT_CHAIN_RECOVERY_PENDING' }
          );
        }
      }
    }

    // Reserve the receipt owner before returning any reusable mint signature.
    // This shares the same conditional lock as the signed run-claim path.
    await reserveRunWalletAssociation({
      runId: receipt.runId,
      walletAddress: address,
      storedAssociation: stored
    });

    if (confirmedMint) {
      return sendJson(res, 200, {
        alreadyMinted: true,
        transactionHash: confirmedMint.transaction_hash,
        tokenId: confirmedMint.token_id,
        sponsored: Boolean(confirmedMint.sponsored)
      });
    }
    // Production does not yet have a trusted paymaster attestation or an
    // atomic wallet/week sponsorship reservation. Keep every new mint
    // self-paid and recorded as such until that server-side capability exists.
    const sponsoredEligible = false;

    const runId = toBytes32(receipt.runId);
    const visualSeed = BigInt(`0x${crypto.createHash('sha256').update(`visual:${receipt.runId}`).digest('hex').slice(0, 16)}`);
    const expiresAt = Math.floor(Date.now() / 1000) + AUTH_LIFETIME_SECONDS;
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'sciconshooter.xyz'}`;
    const { buildMissionRecordMetadataPath } = await recordCardRenderer;
    const tokenUri = `${origin}${buildMissionRecordMetadataPath(receipt.runId, receipt.metrics.playerShipId)}`;
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

    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      await fetchSupabaseJson(MINTS_TABLE, {
        method: 'POST',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          record_type: 'mission', run_id: receipt.runId, wallet_address: address, chain_id: chainId,
          status: 'pending', sponsored: sponsoredEligible
        })
      });
    }

    return sendJson(res, 200, {
      contractAddress, chainId, runId, score: receipt.metrics.score, wave: receipt.metrics.wave,
      visualSeed: visualSeed.toString(), tokenUri, expiresAt, signature, sponsoredEligible
    });
  } catch (error) {
    console.error('Mint authorization failed:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Mint authorization failed',
      ...(error?.code ? { code: error.code } : {})
    });
  }
};
