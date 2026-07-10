const {
  finalizeWeeklyCompetition,
  isAuthorized,
  parseBody,
  readWeeklyCompetitions,
  sendJson
} = require('./_lib/weeklyCompetitionService');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  try {
    if (req.method === 'GET') {
      return sendJson(res, 200, { competitions: await readWeeklyCompetitions() });
    }
    if (req.method === 'POST') {
      if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
      const body = parseBody(req.body);
      return sendJson(res, 200, await finalizeWeeklyCompetition(body.weekKey));
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    if (/Missing Supabase|not configured/i.test(error.message || '')) {
      return sendJson(res, 200, { competitions: [] });
    }
    console.error('Weekly competition API error:', error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Weekly competition request failed' });
  }
};
