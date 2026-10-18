const crypto = require('node:crypto');
const { signPayload } = require('../../api/_lib/runReceipts');

// REVAMP(G): Legacy endpoint scenarios now model E's two-table durable receipt
// contract (REVAMP_NOTES_E.md). This is fixture setup only: negative durability
// and provenance scenarios retain their explicit raw storage responses.
const weeklyFixtureId = (label) => {
  const hex = crypto.createHash('sha256').update(String(label)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const createWeeklyDurableFixtures = () => {
  const signed = new Map();
  const stored = new Map();
  const response = (rows) => ({ ok: true, status: 200,
    async json() { return rows; }, async text() { return JSON.stringify(rows); } });
  const signReceipt = (payload) => {
    const token = signPayload(payload);
    signed.set(payload.runId, {
      run_id: payload.runId,
      receipt_hash: crypto.createHash('sha256').update(token).digest('hex'),
      receipt_provenance_version: 1,
      integrity_status: payload.integrity,
      run_mode: payload.runMode,
      test_run: Boolean(payload.testRun),
      score: payload.metrics.score,
      wave: payload.metrics.wave,
      finished_at: new Date(payload.finishedAt).toISOString()
    });
    return token;
  };
  const scoreFixture = (row) => {
    if (!row?.run_id || !Object.hasOwn(row, 'score')) return row;
    const receipt = signed.get(row.run_id);
    const fixture = {
      ...row,
      // A synthetic database score and its immutable receipt share the stored
      // hash and timestamp, just as finish-run + submit-score do in production.
      receipt_hash: receipt?.receipt_hash || row.receipt_hash?.match(/^[0-9a-f]{64}$/i)?.[0]
        || crypto.createHash('sha256').update(row.run_id).digest('hex'),
      date: receipt?.finished_at || row.date
    };
    stored.set(row.run_id, {
      run_id: row.run_id, score: row.score, wave: row.wave,
      receipt_hash: fixture.receipt_hash, finished_at: fixture.date,
      receipt_provenance_version: 1, integrity_status: row.verified ? 'server-verified' : 'review',
      run_mode: 'weekly-streak', test_run: false
    });
    return fixture;
  };
  const withStorage = (fetchFixture) => async (url, options) => {
    const parsed = new URL(String(url));
    if (parsed.pathname.endsWith('/scicon_run_receipts')) {
      const selector = parsed.searchParams.get('run_id') || '';
      if (selector.startsWith('eq.')) {
        const row = signed.get(selector.slice(3)) || stored.get(selector.slice(3));
        if (row) return response([row]);
      }
      if (selector.startsWith('in.(')) {
        const ids = selector.slice(4, -1).split(',');
        return response(ids.map((id) => stored.get(id) || signed.get(id)).filter(Boolean));
      }
    }
    const result = await fetchFixture(url, options);
    if (parsed.pathname.endsWith('/scicon_leaderboard') && result.ok
      && (!options?.method || options.method === 'GET')) {
      const rows = await result.json();
      return response(Array.isArray(rows) ? rows.map(scoreFixture) : rows);
    }
    return result;
  };
  return { signReceipt, scoreFixture, withStorage, reset() { signed.clear(); stored.clear(); } };
};
module.exports = { createWeeklyDurableFixtures, weeklyFixtureId };
