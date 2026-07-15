const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('connected Trophy Deck shows five clickable runs instead of transaction links', () => {
  const appSource = read('App.tsx');
  const screenSource = read('components/StartScreen.tsx');
  const previewSource = read('components/MissionRecordPreview.tsx');
  const clientSource = read('services/playerRunService.ts');
  const viteSource = read('vite.config.ts');

  assert.match(clientSource, /\/api\/player-runs\?wallet=/);
  assert.match(clientSource, /\.slice\(0, 5\)/);
  assert.match(screenSource, /walletRuns\.slice\(0, 5\)\.map/);
  assert.match(screenSource, /onClick=\{\(\) => onOpenWalletRun\(run\)\}/);
  assert.match(screenSource, /\{minted \? 'Minted' : 'View'\}/);
  assert.doesNotMatch(screenSource, /basescan\.org|transactionHash \?/);
  assert.match(appSource, /const openWalletRunRecord = \(record: WalletRunRecord\)/);
  assert.match(appSource, /setRunReceipt\(record\.receipt\)/);
  assert.match(appSource, /setMissionRecordPilotName\(record\.pilotName\)/);
  assert.match(screenSource, /month: 'short', day: 'numeric', year: 'numeric'/);
  assert.doesNotMatch(previewSource, /View Score Record transaction|basescan\.org/);
  assert.match(viteSource, /mount\('\/api\/player-runs'/);
});

test('player run history shares a Vercel function and stays within the Hobby limit', () => {
  const vercelConfig = JSON.parse(read('vercel.json'));
  const mintSource = read('api/mint-records.js');
  const apiFunctions = fs.readdirSync(path.join(root, 'api'))
    .filter((entry) => entry.endsWith('.js'));

  assert.deepEqual(vercelConfig.rewrites[0], {
    source: '/api/player-runs',
    destination: '/api/mint-records?route=player-runs'
  });
  assert.ok(apiFunctions.length <= 12, `Expected at most 12 Vercel functions, found ${apiFunctions.length}`);
  assert.equal(apiFunctions.includes('player-runs.js'), false);
  assert.match(mintSource, /req\.query\?\.route === 'player-runs'/);
  assert.match(mintSource, /handlePlayerRuns\(req, res\)/);
});

test('recent run API returns a wallet-bound, mintable receipt', async () => {
  const wallet = '0x1111111111111111111111111111111111111111';
  const runId = '11111111-2222-4333-8444-555555555555';
  const now = new Date('2026-07-14T20:00:00.000Z');
  const storedRun = {
    run_id: runId,
    started_at: new Date(now.getTime() - 90_000).toISOString(),
    finished_at: now.toISOString(),
    duration_ms: 90_000,
    score: 12_345,
    wave: 3,
    enemies_defeated: 42,
    coins_collected: 27,
    player_ship_id: 'btc',
    game_version: '2.2.0-base-readiness',
    integrity_status: 'server-verified',
    anomaly_flags: [],
    wallet_address: wallet
  };
  const supabasePath = require.resolve('../api/_lib/supabase');
  const handlerPath = require.resolve('../api/_lib/playerRuns');
  const runReceiptsPath = require.resolve('../api/_lib/runReceipts');
  const originalSupabaseCache = require.cache[supabasePath];
  const originalSecret = process.env.RUN_RECEIPT_SECRET;
  const patchCalls = [];
  process.env.RUN_RECEIPT_SECRET = 'player-run-history-test-secret';

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (url, options = {}) => {
        const value = String(url);
        if (value.includes('scicon_leaderboard')) {
          return [{ run_id: runId, name: 'SCOTT', date: now.toISOString() }];
        }
        if (options.method === 'PATCH') {
          patchCalls.push({ url: value, body: JSON.parse(options.body) });
          return [];
        }
        if (value.includes('wallet_address=eq.') && value.includes('run_id=in.')) return [storedRun];
        if (value.includes('wallet_address=eq.')) return [];
        throw new Error(`Unexpected query: ${value}`);
      }
    }
  };
  delete require.cache[handlerPath];
  delete require.cache[runReceiptsPath];
  const { handlePlayerRuns: handler } = require('../api/_lib/playerRuns');
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };

  try {
    await handler({ method: 'GET', query: { wallet } }, response);
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.runs.length, 1);
    assert.equal(payload.runs[0].pilotName, 'SCOTT');
    assert.equal(payload.runs[0].receipt.metrics.score, 12_345);
    assert.equal(payload.runs[0].receipt.metrics.playerShipId, 'btc');
    assert.ok(payload.runs[0].receipt.receiptToken);
    assert.equal(patchCalls.length, 1);
    assert.equal(patchCalls[0].body.wallet_address, wallet);

    const { verifyRunReceipt } = require('../api/_lib/runReceipts');
    const verified = verifyRunReceipt(payload.runs[0].receipt.receiptToken);
    assert.equal(verified.runId, runId);
    assert.equal(verified.metrics.score, 12_345);
  } finally {
    delete require.cache[handlerPath];
    delete require.cache[runReceiptsPath];
    if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
    else delete require.cache[supabasePath];
    if (originalSecret === undefined) delete process.env.RUN_RECEIPT_SECRET;
    else process.env.RUN_RECEIPT_SECRET = originalSecret;
  }
});

test('recent run API reports schema drift instead of discarding the selected ship', async () => {
  const wallet = '0x2222222222222222222222222222222222222222';
  const supabasePath = require.resolve('../api/_lib/supabase');
  const handlerPath = require.resolve('../api/_lib/playerRuns');
  const runReceiptsPath = require.resolve('../api/_lib/runReceipts');
  const originalSupabaseCache = require.cache[supabasePath];
  const originalSecret = process.env.RUN_RECEIPT_SECRET;
  let modernSelectAttempts = 0;
  process.env.RUN_RECEIPT_SECRET = 'legacy-player-run-history-test-secret';

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (url) => {
        const value = String(url);
        if (value.includes('scicon_leaderboard')) return [];
        if (value.includes('player_ship_id')) {
          modernSelectAttempts += 1;
          throw new Error('column scicon_run_receipts.player_ship_id does not exist');
        }
        throw new Error(`Unexpected query: ${value}`);
      }
    }
  };
  delete require.cache[handlerPath];
  delete require.cache[runReceiptsPath];
  const { handlePlayerRuns } = require('../api/_lib/playerRuns');
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };

  try {
    await handlePlayerRuns({ method: 'GET', query: { wallet } }, response);
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 500);
    assert.equal(modernSelectAttempts, 1);
    assert.match(payload.error, /player_ship_id/);
  } finally {
    delete require.cache[handlerPath];
    delete require.cache[runReceiptsPath];
    if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
    else delete require.cache[supabasePath];
    if (originalSecret === undefined) delete process.env.RUN_RECEIPT_SECRET;
    else process.env.RUN_RECEIPT_SECRET = originalSecret;
  }
});
