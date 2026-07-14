const { createRunStart, finishRun } = require('./_lib/runReceipts');
const { checkRateLimit } = require('./_lib/rateLimit');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const body = parseBody(req.body);
    const rate = checkRateLimit(req, {
      scope: body.action === 'finish' ? 'run-finish' : 'run-start',
      limit: body.action === 'finish' ? 45 : 30,
      windowMs: 10 * 60 * 1000
    });
    if (!rate.allowed) return sendJson(res, 429, { error: 'Too many run requests. Please wait before trying again.' });
    if (body.action === 'start') {
      return sendJson(res, 200, createRunStart(body.gameVersion, { testRun: Boolean(body.testRun) }));
    }
    if (body.action === 'finish') {
      const receipt = await finishRun(body.startToken, body.metrics, req);
      return sendJson(res, 200, { receipt });
    }
    return sendJson(res, 400, { error: 'Unknown run receipt action' });
  } catch (error) {
    console.error('Run receipt API error:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Run receipt failed',
      details: error.details
    });
  }
};
