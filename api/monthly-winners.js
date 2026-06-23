const {
  archiveMonthlyWinner,
  isAuthorized,
  parseBody,
  readMonthlyWinners,
  sendJson
} = require('./monthlyWinnerService');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    if (req.method === 'GET') {
      const winners = await readMonthlyWinners();
      return sendJson(res, 200, { winners });
    }

    if (req.method === 'POST') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      const body = parseBody(req.body);
      const result = await archiveMonthlyWinner(body.monthKey);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    if (/Missing Supabase config/i.test(error.message || '')) {
      return sendJson(res, 200, { winners: [] });
    }

    console.error('Monthly winners API error:', error);
    return sendJson(res, 500, {
      error: 'Monthly winners request failed',
      details: error.message
    });
  }
};
