const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.WALLET_PROFILE_AUTH_SECRET = process.env.WALLET_PROFILE_AUTH_SECRET
  || 'player-run-history-wallet-profile-secret';

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const walletSessionHeaders = (wallet) => {
  const { SESSION_COOKIE_NAME, createWalletProfileSession } = require('../api/_lib/walletProfileAuth');
  return {
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(wallet))}`
  };
};

test('connected Trophy Deck shows five clickable runs instead of transaction links', () => {
  const appSource = read('App.tsx');
  const screenSource = read('components/StartScreen.tsx');
  const previewSource = read('components/MissionRecordPreview.tsx');
  const clientSource = read('services/playerRunService.ts');
  const viteSource = read('vite.config.ts');

  assert.match(clientSource, /\/api\/player-runs\?wallet=/);
  assert.match(clientSource, /\.slice\(0, 5\)/);
  assert.match(screenSource, /walletRuns\.slice\(0, 5\)\.map/);
  assert.match(screenSource, /const runShip = PLAYER_SHIPS\[run\.receipt\.metrics\.playerShipId\]/);
  assert.match(screenSource, /src=\{runShip\.assetUrl\}/);
  assert.match(screenSource, /alt=\{`\$\{runShip\.name\} used for this mission`\}/);
  assert.match(screenSource, /weeklyProposalRunId === run\.receipt\.runId/);
  assert.match(screenSource, /onOpenWeeklyLeaderProposal\(run\)/);
  assert.match(screenSource, /onOpenWalletRun\(run\)/);
  assert.match(screenSource, /\? 'Choose proposal'[\s\S]*: 'Change proposal'[\s\S]*\? 'Minted'[\s\S]*: 'View'/);
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

  assert.deepEqual(vercelConfig.rewrites.find((route) => route.source === '/api/player-runs'), {
    source: '/api/player-runs',
    destination: '/api/mint-records?route=player-runs'
  });
  assert.ok(apiFunctions.length <= 12, `Expected at most 12 Vercel functions, found ${apiFunctions.length}`);
  assert.equal(apiFunctions.includes('player-runs.js'), false);
  assert.match(mintSource, /req\.query\?\.route === 'player-runs'/);
  assert.match(mintSource, /handlePlayerRuns\(req, res\)/);
});

test('stored run mode reissues Weekly receipts while legacy rows remain standard', () => {
  const originalSecret = process.env.RUN_RECEIPT_SECRET;
  process.env.RUN_RECEIPT_SECRET = 'stored-run-mode-reissue-test-secret';
  try {
    const { reissueStoredRunReceipt } = require('../api/_lib/runReceipts');
    const row = {
      run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      started_at: '2026-08-20T12:00:00.000Z',
      finished_at: '2026-08-20T12:01:00.000Z',
      duration_ms: 60_000,
      score: 100,
      wave: 2,
      enemies_defeated: 3,
      coins_collected: 1,
      player_ship_id: 'researchhub',
      game_version: 'test',
      receipt_provenance_version: 1,
      integrity_status: 'server-verified',
      anomaly_flags: [],
      wallet_address: null
    };
    assert.equal(
      reissueStoredRunReceipt({ ...row, run_mode: 'weekly-streak' }).runMode,
      'weekly-streak'
    );
    assert.equal(reissueStoredRunReceipt(row).runMode, 'standard');
    const pilotReceipt = reissueStoredRunReceipt({ ...row, test_run: true });
    assert.equal(pilotReceipt.testRun, true);
    assert.equal(
      require('../api/_lib/runReceipts').verifyRunReceipt(pilotReceipt.receiptToken).testRun,
      true
    );
  } finally {
    if (originalSecret === undefined) delete process.env.RUN_RECEIPT_SECRET;
    else process.env.RUN_RECEIPT_SECRET = originalSecret;
  }
});

test('focused receipt migrations persist both run mode and Pilot Test provenance', () => {
  const runModeMigration = read('supabase/20260822-run-receipt-run-mode.sql');
  const testRunMigration = read('supabase/20260822-run-receipt-test-run.sql');
  const provenanceMigration = read('supabase/20260823-run-receipt-provenance.sql');
  assert.match(runModeMigration, /add column if not exists run_mode text not null default 'standard'/i);
  assert.match(testRunMigration, /add column if not exists test_run boolean not null default false/i);
  assert.match(provenanceMigration, /add column if not exists receipt_provenance_version smallint not null default 0/i);
});

test('legacy receipts cannot be reissued as newly trusted wallet capabilities', () => {
  const { reissueStoredRunReceipt } = require('../api/_lib/runReceipts');
  assert.throws(
    () => reissueStoredRunReceipt({
      run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      started_at: '2026-08-01T12:00:00.000Z',
      finished_at: '2026-08-01T12:01:00.000Z'
    }),
    (error) => error?.code === 'RUN_RECEIPT_PROVENANCE_UNTRUSTED'
  );
});

test('player run history requires the exact wallet profile session', async () => {
  const wallet = '0x1010101010101010101010101010101010101010';
  const { handlePlayerRuns } = require('../api/_lib/playerRuns');
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); }
  };

  await handlePlayerRuns({ method: 'GET', query: { wallet }, headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.match(response.body.error, /authorization is required/i);
});

test('unverified leaderboard rows cannot seize or reissue a guest receipt', async () => {
  const wallet = '0x2020202020202020202020202020202020202020';
  const runId = '20202020-2020-4020-8020-202020202020';
  const supabasePath = require.resolve('../api/_lib/supabase');
  const handlerPath = require.resolve('../api/_lib/playerRuns');
  const originalSupabaseCache = require.cache[supabasePath];
  let patchCount = 0;

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (url, options = {}) => {
        const value = String(url);
        if (value.includes('scicon_leaderboard')) {
          return [{
            run_id: runId,
            name: 'UNVERIFIED',
            date: new Date().toISOString(),
            wallet_address: wallet,
            verified: false
          }];
        }
        if (options.method === 'PATCH') {
          patchCount += 1;
          return [];
        }
        if (value.includes('scicon_run_receipts')) return [];
        throw new Error(`Unexpected query: ${value}`);
      }
    }
  };
  delete require.cache[handlerPath];
  const { handlePlayerRuns } = require('../api/_lib/playerRuns');
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); }
  };

  try {
    await handlePlayerRuns({
      method: 'GET',
      query: { wallet },
      headers: walletSessionHeaders(wallet)
    }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.runs, []);
    assert.equal(patchCount, 0);
  } finally {
    delete require.cache[handlerPath];
    if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
    else delete require.cache[supabasePath];
  }
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
    receipt_provenance_version: 1,
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
          return [{ run_id: runId, name: 'SCOTT', date: now.toISOString(), verified: true }];
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
    await handler({ method: 'GET', query: { wallet }, headers: walletSessionHeaders(wallet) }, response);
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
    assert.equal(verified.identity.kind, 'wallet');
    assert.equal(verified.identity.walletAddress, wallet);
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
    await handlePlayerRuns({ method: 'GET', query: { wallet }, headers: walletSessionHeaders(wallet) }, response);
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

test('player run history pins the current verified weekly leader ahead of newer runs', async () => {
  const wallet = '0x3333333333333333333333333333333333333333';
  const leaderRunId = '33333333-3333-4333-8333-333333333333';
  const supabasePath = require.resolve('../api/_lib/supabase');
  const handlerPath = require.resolve('../api/_lib/playerRuns');
  const runReceiptsPath = require.resolve('../api/_lib/runReceipts');
  const originalSupabaseCache = require.cache[supabasePath];
  const originalSecret = process.env.RUN_RECEIPT_SECRET;
  const originalAuthSecret = process.env.WALLET_PROFILE_AUTH_SECRET;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.RUN_RECEIPT_SECRET = 'weekly-leader-pinning-test-secret';
  process.env.WALLET_PROFILE_AUTH_SECRET = 'weekly-leader-pinning-profile-secret';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const storedRun = (runId, finishedAt, score) => ({
    run_id: runId,
    started_at: new Date(new Date(finishedAt).getTime() - 60_000).toISOString(),
    finished_at: finishedAt,
    duration_ms: 60_000,
    score,
    wave: 3,
    enemies_defeated: 20,
    coins_collected: 10,
    player_ship_id: 'researchhub',
    game_version: 'test',
    receipt_provenance_version: 1,
    integrity_status: 'server-verified',
    anomaly_flags: [],
    wallet_address: wallet
  });
  const currentTime = new Date();
  const leaderReceipt = storedRun(leaderRunId, currentTime.toISOString(), 99999);
  const recentReceipts = Array.from({ length: 5 }, (_, index) => storedRun(
    `44444444-4444-4444-8444-44444444444${index}`,
    `2026-07-22T1${index}:00:00.000Z`,
    1000 + index
  )).reverse();

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (url, options = {}) => {
        const value = String(url);
        if (value.includes('scicon_leaderboard') && value.includes('order=score.desc')) {
          return [{
            run_id: leaderRunId,
            name: 'CHAMPION',
            date: leaderReceipt.finished_at,
            wallet_address: wallet,
            verified: true
          }];
        }
        if (value.includes('scicon_leaderboard')) {
          return [{ run_id: leaderRunId, name: 'CHAMPION', date: leaderReceipt.finished_at, verified: true }];
        }
        if (options.method === 'PATCH') return [];
        if (value.includes('run_id=in.')) return [leaderReceipt];
        if (value.includes('wallet_address=eq.')) return recentReceipts;
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
    await handlePlayerRuns({ method: 'GET', query: { wallet }, headers: walletSessionHeaders(wallet) }, response);
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.runs.length, 5);
    assert.equal(payload.runs[0].receipt.runId, leaderRunId);
    assert.equal(payload.runs[0].receipt.runMode, 'weekly-streak');
    assert.equal(payload.runs[0].pilotName, 'CHAMPION');
    assert.deepEqual(
      payload.runs.slice(1).map((run) => run.receipt.runId),
      recentReceipts.slice(0, 4).map((run) => run.run_id)
    );

    const { verifyRunReceipt } = require('../api/_lib/runReceipts');
    const recoveredToken = payload.runs[0].receipt.receiptToken;
    assert.equal(verifyRunReceipt(recoveredToken).runMode, 'weekly-streak');

    const { SESSION_COOKIE_NAME, createWalletProfileSession } = require('../api/_lib/walletProfileAuth');
    const leaderboardHandler = require('../api/leaderboard');
    const originalFetch = global.fetch;
    let selected = false;
    const leaderboardRow = () => ({
      name: 'CHAMPION',
      score: 99999,
      wave: 3,
      date: leaderReceipt.finished_at,
      wallet_address: wallet,
      donated: false,
      proposal_id: selected ? '321' : null,
      proposal_title: selected ? 'Open Science Target' : null,
      proposal_url: selected ? 'https://www.researchhub.com/post/321/open-science-target' : null,
      proposal_author: selected ? 'Ada Researcher' : null,
      proposal_image_url: null,
      run_id: leaderRunId,
      verified: true,
      receipt_hash: 'hash'
    });
    global.fetch = async (url, options = {}) => {
      const value = String(url);
      if (value.includes('backend.prod.researchhub.com')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { results: [{
              content_object: {
                id: 321,
                title: 'Open Science Target',
                slug: 'open-science-target',
                fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
              },
              author: { first_name: 'Ada', last_name: 'Researcher' }
            }] };
          },
          async text() { return ''; }
        };
      }
      if (options.method === 'PATCH') selected = true;
      const data = [leaderboardRow()];
      return {
        ok: true,
        status: 200,
        async json() { return data; },
        async text() { return JSON.stringify(data); }
      };
    };
    const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(wallet))}`;
    const callLeaderboard = async (body, remoteAddress) => {
      const apiResponse = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        end(bodyText) { this.body = JSON.parse(bodyText); }
      };
      await leaderboardHandler({
        method: 'POST',
        body,
        headers: { cookie },
        socket: { remoteAddress }
      }, apiResponse);
      return apiResponse;
    };

    try {
      const challenge = await callLeaderboard({
        action: 'select-proposal-challenge',
        proposalId: '321',
        receiptToken: recoveredToken,
        address: wallet
      }, '127.0.9.1');
      assert.equal(challenge.statusCode, 200);
      assert.equal(challenge.body.challenge.sessionAuthorized, true);

      const selection = await callLeaderboard({
        action: 'select-proposal',
        proposalId: '321',
        receiptToken: recoveredToken
      }, '127.0.9.2');
      assert.equal(selection.statusCode, 200);
      assert.equal(selection.body.monthlyScores[0].proposalId, '321');
    } finally {
      global.fetch = originalFetch;
    }
  } finally {
    delete require.cache[handlerPath];
    delete require.cache[runReceiptsPath];
    if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
    else delete require.cache[supabasePath];
    if (originalSecret === undefined) delete process.env.RUN_RECEIPT_SECRET;
    else process.env.RUN_RECEIPT_SECRET = originalSecret;
    if (originalAuthSecret === undefined) delete process.env.WALLET_PROFILE_AUTH_SECRET;
    else process.env.WALLET_PROFILE_AUTH_SECRET = originalAuthSecret;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseKey;
  }
});
