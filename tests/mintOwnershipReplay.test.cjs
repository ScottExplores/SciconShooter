const test = require('node:test');
const assert = require('node:assert/strict');

const walletA = '0x1111111111111111111111111111111111111111';
const walletB = '0x2222222222222222222222222222222222222222';
const runId = '11111111-2222-4333-8444-555555555555';
const transactionHash = `0x${'ab'.repeat(32)}`;

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const loadHandler = ({
  initialReceiptWallet = null,
  failFirstReceiptPatch = false,
  mintPatchRows = null
} = {}) => {
  const supabasePath = require.resolve('../api/_lib/supabase');
  const associationPath = require.resolve('../api/_lib/runWalletAssociation');
  const handlerPath = require.resolve('../api/mint-records');
  const originalSupabaseCache = require.cache[supabasePath];
  const originalAssociationCache = require.cache[associationPath];
  const state = {
    receiptWallet: initialReceiptWallet,
    leaderboardWallet: null,
    receiptPatchAttempts: 0,
    supabaseCalls: [],
    mintPatchOptions: null
  };

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (path, options = {}) => {
        const value = String(path);
        state.supabaseCalls.push({ path: value, options });
        if (value.startsWith('scicon_mint_records')) {
          if (options.method === 'PATCH') {
            state.mintPatchOptions = options;
            return mintPatchRows;
          }
          return [{
            status: 'confirmed',
            token_id: '42',
            transaction_hash: transactionHash,
            confirmed_at: '2026-08-22T12:00:00.000Z'
          }];
        }
        if (value.startsWith('scicon_run_receipts')) {
          if (options.method === 'PATCH') {
            state.receiptPatchAttempts += 1;
            if (failFirstReceiptPatch && state.receiptPatchAttempts === 1) {
              throw new Error('temporary receipt update outage');
            }
            if (state.receiptWallet) return [];
            const body = JSON.parse(options.body);
            state.receiptWallet = body.wallet_address;
            return [{
              wallet_address: state.receiptWallet,
              wallet_claimed_at: body.wallet_claimed_at,
              receipt_provenance_version: 1
            }];
          }
          return [{
            wallet_address: state.receiptWallet,
            wallet_claimed_at: null,
            receipt_provenance_version: 1
          }];
        }
        if (value.startsWith('scicon_leaderboard') && options.method === 'PATCH') {
          state.leaderboardWallet = JSON.parse(options.body).wallet_address;
          return null;
        }
        throw new Error(`Unexpected query: ${value}`);
      }
    }
  };
  delete require.cache[associationPath];
  delete require.cache[handlerPath];
  const handler = require('../api/mint-records');

  return {
    handler,
    state,
    restore() {
      delete require.cache[handlerPath];
      if (originalAssociationCache) require.cache[associationPath] = originalAssociationCache;
      else delete require.cache[associationPath];
      if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
      else delete require.cache[supabasePath];
    }
  };
};

const confirm = async (handler, address = walletA) => {
  const res = makeResponse();
  await handler({
    method: 'POST',
    query: {},
    headers: {
      host: 'www.sciconshooter.xyz',
      origin: 'https://www.sciconshooter.xyz',
      'x-forwarded-for': '203.0.113.141'
    },
    body: {
      action: 'confirm',
      recordType: 'mission',
      runId,
      address,
      transactionHash
    }
  }, res);
  return res;
};

test('an already-confirmed mint returns retryable failure until ownership replay converges', async () => {
  const scenario = loadHandler({ failFirstReceiptPatch: true });
  const originalError = console.error;
  console.error = () => {};
  try {
    const interrupted = await confirm(scenario.handler);
    assert.equal(interrupted.statusCode, 503);
    assert.equal(interrupted.body.code, 'MINT_OWNERSHIP_SYNC_PENDING');
    assert.equal(scenario.state.receiptWallet, null);
    assert.equal(scenario.state.leaderboardWallet, null);

    const replay = await confirm(scenario.handler);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body.confirmed, true);
    assert.equal(scenario.state.receiptWallet, walletA);
    assert.equal(scenario.state.leaderboardWallet, walletA);
    assert.equal(scenario.state.receiptPatchAttempts, 2);
  } finally {
    console.error = originalError;
    scenario.restore();
  }
});

test('fresh mint persistence cannot report success when the conditional update affects zero rows', async () => {
  const scenario = loadHandler({ mintPatchRows: [] });
  try {
    await assert.rejects(
      scenario.handler.persistConfirmedMint({
        runId,
        walletAddress: walletA,
        transactionHash,
        tokenId: '42',
        confirmedAt: '2026-08-22T12:00:00.000Z',
        sponsored: false
      }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, 'MINT_CONFIRMATION_PERSISTENCE_PENDING');
        return true;
      }
    );
    assert.equal(scenario.state.mintPatchOptions.headers.Prefer, 'return=representation');
  } finally {
    scenario.restore();
  }
});

test('fresh mint persistence succeeds only after exactly one matching row is represented', async () => {
  const represented = {
    status: 'confirmed',
    token_id: '42',
    transaction_hash: transactionHash
  };
  const scenario = loadHandler({ mintPatchRows: [represented] });
  try {
    const persisted = await scenario.handler.persistConfirmedMint({
      runId,
      walletAddress: walletA,
      transactionHash,
      tokenId: '42',
      confirmedAt: '2026-08-22T12:00:00.000Z',
      sponsored: true
    });
    assert.equal(persisted, represented);
    assert.equal(scenario.state.mintPatchOptions.headers.Prefer, 'return=representation');
    assert.equal(JSON.parse(scenario.state.mintPatchOptions.body).status, 'confirmed');
  } finally {
    scenario.restore();
  }
});

test('mint confirmation sponsorship comes only from the server pending row', () => {
  const scenario = loadHandler();
  try {
    assert.equal(scenario.handler.resolveConfirmedMintSponsorship({ sponsored: true }), true);
    assert.equal(scenario.handler.resolveConfirmedMintSponsorship({ sponsored: false }), false);
    assert.equal(scenario.handler.resolveConfirmedMintSponsorship(null), false);
  } finally {
    scenario.restore();
  }
});

test('mint confirmation rejects foreign origins before RPC or database work', async () => {
  const scenario = loadHandler();
  try {
    const res = makeResponse();
    await scenario.handler({
      method: 'POST',
      query: {},
      headers: {
        host: 'www.sciconshooter.xyz',
        origin: 'https://attacker.example',
        'x-forwarded-for': '203.0.113.142'
      },
      body: {
        action: 'confirm',
        recordType: 'mission',
        runId,
        address: walletA,
        transactionHash
      }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(scenario.state.supabaseCalls.length, 0);
  } finally {
    scenario.restore();
  }
});

test('mint confirmation requests are bounded per client before RPC or database work', async () => {
  const scenario = loadHandler();
  const request = {
    method: 'POST',
    query: {},
    headers: {
      host: 'www.sciconshooter.xyz',
      origin: 'https://www.sciconshooter.xyz',
      'x-forwarded-for': '203.0.113.143'
    },
    body: {}
  };
  try {
    for (let index = 0; index < 30; index += 1) {
      const res = makeResponse();
      await scenario.handler(request, res);
      assert.equal(res.statusCode, 400);
    }
    const limited = makeResponse();
    await scenario.handler(request, limited);
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.body.code, 'MINT_CONFIRMATION_RATE_LIMITED');
    assert.ok(Number(limited.headers['Retry-After']) >= 1);
    assert.equal(scenario.state.supabaseCalls.length, 0);
  } finally {
    scenario.restore();
  }
});

test('an already-confirmed mint never reports success across a canonical wallet conflict', async () => {
  const scenario = loadHandler({ initialReceiptWallet: walletB });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await confirm(scenario.handler, walletA);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'MINT_OWNERSHIP_CONFLICT');
    assert.equal(scenario.state.receiptWallet, walletB);
    assert.equal(scenario.state.leaderboardWallet, null);
  } finally {
    console.error = originalError;
    scenario.restore();
  }
});
