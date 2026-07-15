const crypto = require('crypto');
const {
  fetchSupabaseJson,
  hasSupabaseConfig,
  supabaseHeaders
} = require('./supabase');

const RUN_RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const MAX_RUN_DURATION_MS = 3 * 60 * 60 * 1000;
const RECEIPT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PLAYER_SHIP_IDS = new Set(['researchhub', 'bio', 'eth', 'btc']);

const getReceiptSecret = () => (
  process.env.RUN_RECEIPT_SECRET
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.CRON_SECRET
  || ''
);

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const signPayload = (payload) => {
  const secret = getReceiptSecret();
  if (!secret) throw new Error('RUN_RECEIPT_SECRET is not configured.');
  const encoded = encode(payload);
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const verifyPayload = (token, expectedType) => {
  const secret = getReceiptSecret();
  if (!secret || typeof token !== 'string') throw new Error('Run receipt token is unavailable.');
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) throw new Error('Run receipt token is malformed.');

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(signatureBytes, expectedBytes)) {
    throw new Error('Run receipt signature is invalid.');
  }

  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (payload.type !== expectedType) throw new Error('Run receipt token type is invalid.');
  if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) {
    throw new Error('Run receipt token has expired.');
  }
  return payload;
};

const normalizeMetric = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
};

const normalizePlayerShipId = (value) => (
  PLAYER_SHIP_IDS.has(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'researchhub'
);

const normalizeRunMetrics = (metrics = {}) => ({
  score: normalizeMetric(metrics.score, 0, 100000000),
  wave: normalizeMetric(metrics.wave, 1, 1000),
  durationMs: normalizeMetric(metrics.durationMs, 0, MAX_RUN_DURATION_MS + 1),
  enemiesDefeated: normalizeMetric(metrics.enemiesDefeated, 0, 1000000),
  coinsCollected: normalizeMetric(metrics.coinsCollected, 0, 1000000),
  playerShipId: normalizePlayerShipId(metrics.playerShipId)
});

const inspectRunMetrics = (metrics) => {
  const anomalies = [];
  const durationSeconds = Math.max(1, metrics.durationMs / 1000);
  const maximumPlausibleWave = Math.ceil(durationSeconds / 12) + 4;
  const maximumPlausibleEnemies = Math.ceil(durationSeconds * 15) + 150;
  const maximumPlausibleCoins = metrics.enemiesDefeated * 6 + Math.ceil(durationSeconds * 3) + 150;
  const maximumPlausibleScore = 5000
    + metrics.enemiesDefeated * 650 * Math.max(1, metrics.wave)
    + metrics.coinsCollected * 300
    + Math.ceil(durationSeconds * 180);

  if (metrics.durationMs < 1500) anomalies.push('run_too_short');
  if (metrics.durationMs > MAX_RUN_DURATION_MS) anomalies.push('run_too_long');
  if (metrics.wave > maximumPlausibleWave) anomalies.push('wave_rate_impossible');
  if (metrics.enemiesDefeated > maximumPlausibleEnemies) anomalies.push('enemy_rate_impossible');
  if (metrics.coinsCollected > maximumPlausibleCoins) anomalies.push('coin_rate_impossible');
  if (metrics.score > maximumPlausibleScore) anomalies.push('score_rate_impossible');

  return anomalies;
};

const hashIp = (req) => {
  const rawIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  return crypto.createHmac('sha256', getReceiptSecret()).update(rawIp).digest('hex').slice(0, 32);
};

const createRunStart = (gameVersion = 'unknown', { testRun = false, playerShipId = 'researchhub' } = {}) => {
  const issuedAt = Date.now();
  const payload = {
    type: 'run-start',
    runId: crypto.randomUUID(),
    gameVersion: String(gameVersion || 'unknown').slice(0, 32),
    playerShipId: normalizePlayerShipId(playerShipId),
    testRun: Boolean(testRun),
    issuedAt,
    expiresAt: issuedAt + MAX_RUN_DURATION_MS
  };

  return {
    runId: payload.runId,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(payload.expiresAt).toISOString(),
    playerShipId: payload.playerShipId,
    testRun: payload.testRun,
    startToken: signPayload(payload)
  };
};

const saveReceipt = async (receipt, req) => {
  if (!hasSupabaseConfig()) return false;
  const receiptHash = crypto.createHash('sha256').update(receipt.receiptToken).digest('hex');
  const row = {
    run_id: receipt.runId,
    started_at: receipt.startedAt,
    finished_at: receipt.finishedAt,
    duration_ms: receipt.metrics.durationMs,
    score: receipt.metrics.score,
    wave: receipt.metrics.wave,
    enemies_defeated: receipt.metrics.enemiesDefeated,
    coins_collected: receipt.metrics.coinsCollected,
    player_ship_id: receipt.metrics.playerShipId,
    game_version: receipt.gameVersion,
    integrity_status: receipt.integrity,
    anomaly_flags: receipt.anomalies,
    ip_hash: hashIp(req),
    receipt_hash: receiptHash
  };

  const persistRow = (value) => fetchSupabaseJson(`${RUN_RECEIPTS_TABLE}?on_conflict=run_id`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(value)
  });

  try {
    await persistRow(row);
    return true;
  } catch (error) {
    if (/PGRST205|schema cache|Could not find the table/i.test(error.message || '')) return false;
    throw error;
  }
};

const finishRun = async (startToken, rawMetrics, req) => {
  const start = verifyPayload(startToken, 'run-start');
  const metrics = {
    ...normalizeRunMetrics(rawMetrics),
    playerShipId: normalizePlayerShipId(start.playerShipId)
  };
  const now = Date.now();
  const measuredDuration = Math.max(0, now - start.issuedAt);
  const durationDelta = Math.abs(measuredDuration - metrics.durationMs);
  const testRun = Boolean(start.testRun);
  const anomalies = testRun ? [] : inspectRunMetrics(metrics);
  if (!testRun && durationDelta > Math.max(30000, measuredDuration * 0.35)) anomalies.push('duration_mismatch');

  const hardFailure = anomalies.some((flag) => flag.endsWith('_impossible') || flag === 'run_too_long');
  if (hardFailure) {
    const error = new Error('Run metrics failed integrity checks.');
    error.statusCode = 422;
    error.details = anomalies;
    throw error;
  }

  const receiptPayload = {
    type: 'run-receipt',
    runId: start.runId,
    gameVersion: start.gameVersion,
    startedAt: start.issuedAt,
    finishedAt: now,
    expiresAt: now + RECEIPT_LIFETIME_MS,
    metrics,
    testRun,
    integrity: anomalies.length > 0 ? 'review' : 'server-verified'
  };
  const receiptToken = signPayload(receiptPayload);
  const receipt = {
    runId: start.runId,
    gameVersion: start.gameVersion,
    startedAt: new Date(start.issuedAt).toISOString(),
    finishedAt: new Date(now).toISOString(),
    expiresAt: new Date(receiptPayload.expiresAt).toISOString(),
    metrics,
    testRun,
    integrity: receiptPayload.integrity,
    anomalies,
    receiptToken
  };
  receipt.persisted = await saveReceipt(receipt, req);
  return receipt;
};

const reissueStoredRunReceipt = (row) => {
  const startedAt = new Date(row?.started_at);
  const finishedAt = new Date(row?.finished_at);
  if (!row?.run_id || Number.isNaN(startedAt.getTime()) || Number.isNaN(finishedAt.getTime())) {
    throw new Error('Stored run receipt data is incomplete.');
  }

  const expiresAt = Date.now() + RECEIPT_LIFETIME_MS;
  const metrics = normalizeRunMetrics({
    score: row.score,
    wave: row.wave,
    durationMs: row.duration_ms,
    enemiesDefeated: row.enemies_defeated,
    coinsCollected: row.coins_collected,
    playerShipId: row.player_ship_id
  });
  const integrity = row.integrity_status === 'review' ? 'review' : 'server-verified';
  const receiptPayload = {
    type: 'run-receipt',
    runId: String(row.run_id),
    gameVersion: String(row.game_version || 'unknown').slice(0, 32),
    startedAt: startedAt.getTime(),
    finishedAt: finishedAt.getTime(),
    expiresAt,
    metrics,
    testRun: false,
    integrity
  };

  return {
    runId: receiptPayload.runId,
    gameVersion: receiptPayload.gameVersion,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    metrics,
    testRun: false,
    integrity,
    anomalies: Array.isArray(row.anomaly_flags) ? row.anomaly_flags : [],
    receiptToken: signPayload(receiptPayload),
    persisted: true
  };
};

const verifyRunReceipt = (receiptToken) => verifyPayload(receiptToken, 'run-receipt');

module.exports = {
  createRunStart,
  finishRun,
  getReceiptSecret,
  reissueStoredRunReceipt,
  signPayload,
  verifyRunReceipt
};
