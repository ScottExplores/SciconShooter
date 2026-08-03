const {
  captureWeeklyProposalCutoffSnapshot,
  ensureRecentWeeklyCompetitions,
  isAuthorized,
  sendJson
} = require('./_lib/weeklyCompetitionService');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  try {
    const snapshot = await captureWeeklyProposalCutoffSnapshot();
    if (snapshot.captured) {
      console.info('Weekly cutoff proposal snapshot captured:', snapshot);
      return sendJson(res, 200, snapshot);
    }
    if (snapshot.captureAttempted) {
      console.error('Weekly cutoff proposal snapshot missed:', snapshot);
      return sendJson(res, 409, snapshot);
    }
    const recovery = await ensureRecentWeeklyCompetitions();
    console.info('Weekly competition finalization pass completed:', {
      attempted: recovery.attempted,
      changed: recovery.changed,
      weekKeys: recovery.results.map((entry) => entry.weekKey)
    });
    return sendJson(res, 200, recovery);
  } catch (error) {
    console.error('Weekly finalization cron error:', error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Weekly finalization failed' });
  }
};
