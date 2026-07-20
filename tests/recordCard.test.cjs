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
    assert.match(res.body, /Replication Rift/);
    assert.match(res.body, /JUL 10, 2026 - 12:00 PM UTC/);
    assert.match(res.body, /data:image\/png;base64,/);
    assert.match(res.body, /preserveAspectRatio="none" style="image-rendering:pixelated"/);
    assert.ok(fetchedUrls.some((url) => url.includes('/game-art/branding/bio-ship.png')));

    await recordCardHandler({ method: 'GET', query: { runId, ship: 'btc' } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(fetchedUrls.some((url) => url.includes('/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png')));
  } finally {
    global.fetch = originalFetch;
  }
});
