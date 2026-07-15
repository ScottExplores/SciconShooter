const test = require('node:test');
const assert = require('node:assert/strict');

test('wallet mint records are enriched with their verified run score', async () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const runId = '11111111-2222-4333-8444-555555555555';
  const supabasePath = require.resolve('../api/_lib/supabase');
  const handlerPath = require.resolve('../api/mint-records');
  const originalSupabaseCache = require.cache[supabasePath];
  const originalContract = process.env.MISSION_RECORD_CONTRACT_ADDRESS;
  delete process.env.MISSION_RECORD_CONTRACT_ADDRESS;

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: () => ({}),
      fetchSupabaseJson: async (url) => {
        const value = String(url);
        if (value.includes('scicon_mint_records')) {
          return [{
            record_type: 'mission',
            run_id: runId,
            wallet_address: wallet,
            chain_id: 8453,
            token_id: '42',
            status: 'confirmed',
            sponsored: false,
            created_at: '2026-07-14T12:00:00.000Z'
          }];
        }
        if (value.includes('scicon_run_receipts')) {
          return [{ run_id: runId, score: 12_500 }];
        }
        throw new Error(`Unexpected query: ${value}`);
      }
    }
  };
  delete require.cache[handlerPath];
  const handler = require('../api/mint-records');
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };

  try {
    await handler({ method: 'GET', query: { wallet } }, response);
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.records[0].score, 12_500);
    assert.equal(payload.records[0].record_type, 'mission');
  } finally {
    delete require.cache[handlerPath];
    if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
    else delete require.cache[supabasePath];
    if (originalContract === undefined) delete process.env.MISSION_RECORD_CONTRACT_ADDRESS;
    else process.env.MISSION_RECORD_CONTRACT_ADDRESS = originalContract;
  }
});
