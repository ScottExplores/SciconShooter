const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.RUN_RECEIPT_SECRET = 'mission-mint-recovery-receipt-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mission-mint-recovery-service-key';
process.env.MISSION_RECORD_CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';
process.env.MINT_AUTHORIZER_PRIVATE_KEY = `0x${'12'.repeat(32)}`;
process.env.MISSION_RECORD_CHAIN_ID = '8453';
process.env.WALLET_PROFILE_AUTH_SECRET = 'mission-mint-recovery-wallet-secret';

const wallet = '0x2222222222222222222222222222222222222222';
const runId = '11111111-2222-4333-8444-555555555555';
const transactionHash = `0x${'ab'.repeat(32)}`;

const jsonResponse = (data) => ({
  ok: true,
  status: 200,
  async json() { return data; },
  async text() { return JSON.stringify(data); }
});

const makeResponse = () => ({
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = JSON.parse(body); }
});

test('a canonical indexed mint event heals a pending row after browser state is lost', async () => {
  const supabasePath = require.resolve('../api/_lib/supabase');
  const associationPath = require.resolve('../api/_lib/runWalletAssociation');
  const recoveryPath = require.resolve('../api/_lib/missionMintRecovery');
  const originalSupabase = require.cache[supabasePath];
  const originalAssociation = require.cache[associationPath];
  const pending = {
    status: 'pending',
    transaction_hash: null,
    token_id: null,
    sponsored: false,
    wallet_address: wallet,
    confirmed_at: null
  };
  let associated = false;
  let leaderboardWallet = null;

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (url, options = {}) => {
        const value = String(url);
        if (value.startsWith('scicon_mint_records')) {
          if (options.method === 'PATCH') Object.assign(pending, JSON.parse(options.body));
          return [{ ...pending }];
        }
        if (value.startsWith('scicon_leaderboard') && options.method === 'PATCH') {
          leaderboardWallet = JSON.parse(options.body).wallet_address;
          return null;
        }
        throw new Error(`Unexpected Supabase request: ${value}`);
      }
    }
  };
  require.cache[associationPath] = {
    id: associationPath,
    filename: associationPath,
    loaded: true,
    exports: {
      reserveRunWalletAssociation: async ({ runId: associatedRunId, walletAddress }) => {
        assert.equal(associatedRunId, runId);
        assert.equal(walletAddress, wallet);
        associated = true;
      }
    }
  };
  delete require.cache[recoveryPath];

  const baseTimestamp = 1_700_000_000;
  const authorizedBlock = 50n;
  const authorizedAt = new Date((baseTimestamp + Number(authorizedBlock) * 2) * 1000).toISOString();
  let logQuery = null;
  const client = {
    async getBlockNumber() { return 100n; },
    async getBlock({ blockNumber }) {
      return { timestamp: BigInt(baseTimestamp + Number(blockNumber) * 2) };
    },
    async getLogs(query) {
      logQuery = query;
      return [{
        transactionHash,
        args: {
          tokenId: 7n,
          runId: `0x${crypto.createHash('sha256').update(runId).digest('hex')}`,
          player: wallet,
          score: 1234n,
          wave: 2n
        }
      }];
    }
  };

  try {
    const { recoverPendingMissionMint, runIdBytes32 } = require('../api/_lib/missionMintRecovery');
    const recovered = await recoverPendingMissionMint({
      runId,
      walletAddress: wallet,
      contractAddress: process.env.MISSION_RECORD_CONTRACT_ADDRESS,
      chainId: 8453,
      pendingMint: { ...pending, created_at: authorizedAt },
      expectedScore: 1234,
      expectedWave: 2,
      client
    });

    assert.equal(recovered.status, 'confirmed');
    assert.equal(recovered.transaction_hash, transactionHash);
    assert.equal(recovered.token_id, '7');
    assert.equal(associated, true);
    assert.equal(leaderboardWallet, wallet);
    assert.equal(logQuery.address, process.env.MISSION_RECORD_CONTRACT_ADDRESS);
    assert.equal(logQuery.args.runId, runIdBytes32(runId));
    assert.equal(logQuery.args.player, wallet);
  } finally {
    delete require.cache[recoveryPath];
    if (originalSupabase) require.cache[supabasePath] = originalSupabase;
    else delete require.cache[supabasePath];
    if (originalAssociation) require.cache[associationPath] = originalAssociation;
    else delete require.cache[associationPath];
  }
});

test('mint authorization returns recovered chain state instead of issuing a second mint', async () => {
  const recoveryPath = require.resolve('../api/_lib/missionMintRecovery');
  const authorizationPath = require.resolve('../api/mint-authorization');
  const originalRecovery = require.cache[recoveryPath];
  const originalFetch = global.fetch;
  let recoveryCalls = 0;
  let mintWrites = 0;

  require.cache[recoveryPath] = {
    id: recoveryPath,
    filename: recoveryPath,
    loaded: true,
    exports: {
      recoverPendingMissionMint: async ({ pendingMint, expectedScore, expectedWave }) => {
        recoveryCalls += 1;
        assert.equal(pendingMint.status, 'pending');
        assert.equal(expectedScore, 1234);
        assert.equal(expectedWave, 2);
        return {
          status: 'confirmed',
          transaction_hash: transactionHash,
          token_id: '7',
          sponsored: false,
          wallet_address: wallet,
          confirmed_at: new Date().toISOString()
        };
      }
    }
  };
  delete require.cache[authorizationPath];

  const { signPayload, verifyRunReceipt } = require('../api/_lib/runReceipts');
  const receiptToken = signPayload({
    type: 'run-receipt',
    runId,
    gameVersion: 'test',
    runMode: 'standard',
    startedAt: Date.now() - 30_000,
    finishedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    metrics: {
      score: 1234,
      wave: 2,
      durationMs: 30_000,
      enemiesDefeated: 12,
      coinsCollected: 8,
      playerShipId: 'researchhub'
    },
    identity: { kind: 'wallet', walletAddress: wallet, profileIdHash: 'wallet-profile-hash' },
    integrity: 'server-verified'
  });
  const receipt = verifyRunReceipt(receiptToken);
  const stored = {
    run_id: runId,
    score: receipt.metrics.score,
    wave: receipt.metrics.wave,
    duration_ms: receipt.metrics.durationMs,
    enemies_defeated: receipt.metrics.enemiesDefeated,
    coins_collected: receipt.metrics.coinsCollected,
    player_ship_id: receipt.metrics.playerShipId,
    game_version: receipt.gameVersion,
    run_mode: receipt.runMode,
    test_run: false,
    receipt_provenance_version: 1,
    integrity_status: 'server-verified',
    wallet_address: wallet,
    wallet_claimed_at: new Date().toISOString()
  };

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) return jsonResponse([stored]);
    if (value.includes('scicon_mint_records')) {
      if (options.method === 'POST') mintWrites += 1;
      return jsonResponse([{
        status: 'pending',
        transaction_hash: null,
        token_id: null,
        sponsored: false,
        wallet_address: wallet,
        chain_id: 8453,
        created_at: new Date().toISOString(),
        confirmed_at: null
      }]);
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    const handler = require('../api/mint-authorization');
    const {
      SESSION_COOKIE_NAME,
      createWalletProfileSession
    } = require('../api/_lib/walletProfileAuth');
    const res = makeResponse();
    await handler({
      method: 'POST',
      headers: {
        host: 'sciconshooter.xyz',
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(wallet))}`
      },
      socket: { remoteAddress: '203.0.113.190' },
      body: { recordType: 'mission', address: wallet, receiptToken }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.alreadyMinted, true);
    assert.equal(res.body.transactionHash, transactionHash);
    assert.equal(res.body.tokenId, '7');
    assert.equal(recoveryCalls, 1);
    assert.equal(mintWrites, 0);
    assert.equal(Object.hasOwn(res.body, 'signature'), false);
  } finally {
    global.fetch = originalFetch;
    delete require.cache[authorizationPath];
    if (originalRecovery) require.cache[recoveryPath] = originalRecovery;
    else delete require.cache[recoveryPath];
  }
});
