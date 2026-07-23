const {
  captureWeeklyProposalCutoffSnapshot,
  finalizeWeeklyCompetition,
  getPreviousWeekKey,
  isAuthorized,
  sendJson
} = require('./_lib/weeklyCompetitionService');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  try {
    const snapshot = await captureWeeklyProposalCutoffSnapshot();
    if (snapshot.captured) return sendJson(res, 200, snapshot);
    if (snapshot.captureAttempted) return sendJson(res, 409, snapshot);
    return sendJson(res, 200, await finalizeWeeklyCompetition(getPreviousWeekKey()));
  } catch (error) {
    console.error('Weekly finalization cron error:', error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Weekly finalization failed' });
  }
};
