const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.PUBLIC_APP_URL = 'https://www.sciconshooter.xyz';

const recordCardHandler = require('../api/record-card');

const jsonResponse = (data) => ({
  ok: true,
  status: 200,
  async json() { return data; },
  async text() { return JSON.stringify(data); }
});

test('record card embeds encounter art and meaningful run values', async () => {
  const runId = '11111111-2222-4333-8444-555555555555';
  const originalFetch = global.fetch;
  const fetchedUrls = [];
  global.fetch = async (url) => {
    const value = String(url);
    fetchedUrls.push(value);
    if (value.includes('scicon_run_receipts')) {
      return jsonResponse([{
        game_version: '2.1.0',
        integrity_status: 'server-verified',
        finished_at: '2026-07-10T12:00:00.000Z',
        duration_ms: 125000,
        score: 12345,
        wave: 2,
        enemies_defeated: 48,
        coins_collected: 17
      }]);
    }
    if (value.includes('scicon_leaderboard')) {
      return jsonResponse([{ name: 'ACE', score: 12345, wave: 2, date: '2026-07-10T12:00:00.000Z' }]);
    }
    if (value.includes('/game-art/')) {
      return {
        ok: true,
        headers: { get: () => 'image/png' },
        async arrayBuffer() { return Uint8Array.from([137, 80, 78, 71]).buffer; }
      };
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };

  try {
    await recordCardHandler({ method: 'GET', query: { runId, ship: 'bio' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'image/svg+xml');
    assert.match(res.body, /MISSION RECORD/);
    assert.match(res.body, /ACE/);
    assert.match(res.body, /12,345/);
    assert.match(res.body, /Citation Storm/);
    assert.match(res.body, /JUL 10, 2026 - 12:00 PM UTC/);
    assert.match(res.body, /data:image\/png;base64,/);
    assert.match(res.body, /preserveAspectRatio="none" style="image-rendering:pixelated"/);
    assert.doesNotMatch(res.body, /SERVER VERIFIED/);
    assert.ok(fetchedUrls.some((url) => url.includes('/game-art/branding/bio-ship.png')));
    assert.ok(fetchedUrls.some((url) => url.includes('/game-art/enemies/paywall-interceptor.png')));
    assert.equal(fetchedUrls.some((url) => url.includes('/game-art/generated/boss-weapons/citation-storm-plasma-claw-left.png')), false);
    assert.equal(fetchedUrls.some((url) => url.includes('/game-art/generated/boss-weapons/citation-storm-plasma-claw-right.png')), false);
    assert.equal(fetchedUrls.some((url) => url.includes('/game-art/bosses/final-boss-sentinel.png')), false);

    await recordCardHandler({ method: 'GET', query: { runId, ship: 'btc' } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(fetchedUrls.some((url) => url.includes('/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('revision-24 record cards embed their resolved mission encounter art without the legacy boss fallback', async () => {
  const runId = '66666666-7777-4888-8999-000000000000';
  const expectedStages = new Map([
    [7, '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-left.png'],
    [8, '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dna-conductor.png'],
    [9, '/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/ring-sentinel.png'],
    [20, '/game-art/generated/bosses/campaign-packages/frontier-crownclaw/assembled.png'],
    [25, '/game-art/generated/bosses/campaign-packages/helios-clawcarrier/assembled.png']
  ]);
  const originalFetch = global.fetch;
  let activeStage = 7;
  let fetchedAssetUrls = [];

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) {
      return jsonResponse([{
        game_version: '2.1.0',
        integrity_status: 'server-verified',
        finished_at: '2026-07-21T12:00:00.000Z',
        duration_ms: 180000,
        score: activeStage * 1000,
        wave: activeStage,
        enemies_defeated: activeStage * 10,
        coins_collected: activeStage
      }]);
    }
    if (value.includes('scicon_leaderboard')) {
      return jsonResponse([{ name: 'ACE', score: activeStage * 1000, wave: activeStage }]);
    }
    if (value.includes('/game-art/')) {
      fetchedAssetUrls.push(value);
      return {
        ok: true,
        headers: { get: () => 'image/png' },
        async arrayBuffer() { return Uint8Array.from([137, 80, 78, 71]).buffer; }
      };
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    for (const [stage, expectedPath] of expectedStages) {
      activeStage = stage;
      fetchedAssetUrls = [];
      const res = {
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        end(body) { this.body = body; }
      };

      await recordCardHandler({ method: 'GET', query: { runId } }, res);

      assert.equal(res.statusCode, 200, `Stage ${stage} response`);
      assert.ok(
        fetchedAssetUrls.some((url) => url.endsWith(expectedPath)),
        `Stage ${stage} should embed ${expectedPath}`
      );
      assert.equal(
        fetchedAssetUrls.some((url) => url.endsWith('/game-art/bosses/final-boss-sentinel.png')),
        false,
        `Stage ${stage} must not use the legacy fallback`
      );
    }
  } finally {
    global.fetch = originalFetch;
  }
});
