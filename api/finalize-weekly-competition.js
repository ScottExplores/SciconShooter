const {
  captureWeeklyProposalCutoffSnapshot,
  ensureRecentWeeklyCompetitions,
  isAuthorized,
  sendJson
} = require('./_lib/weeklyCompetitionService');
const { assessEventPayout } = require('./_lib/eventResearchPick');

const eventPayoutReport = async () => {
  try {
    return await assessEventPayout();
  } catch (error) {
    console.error('Event payout pick check failed:', error);
    return {
      active: true,
      needsNewPick: null,
      fundsRedirected: false,
      reason: 'unknown',
      message: 'Pick status could not be checked. Funds were not redirected.'
    };
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
  try {
    const snapshot = await captureWeeklyProposalCutoffSnapshot();
    const eventPayout = await eventPayoutReport();
    if (eventPayout.needsNewPick) {
      console.info(JSON.stringify({
        event: 'event_payout_needs_new_pick',
        ...eventPayout
      }));
    }
    if (snapshot.captured) {
      console.info('Weekly cutoff proposal snapshot captured:', snapshot);
      return sendJson(res, 200, { ...snapshot, eventPayout });
    }
    if (snapshot.captureAttempted) {
      console.error('Weekly cutoff proposal snapshot missed:', snapshot);
      return sendJson(res, 409, { ...snapshot, eventPayout });
    }
    const recovery = await ensureRecentWeeklyCompetitions();
    console.info('Weekly competition finalization pass completed:', {
      attempted: recovery.attempted,
      changed: recovery.changed,
      weekKeys: recovery.results.map((entry) => entry.weekKey),
      eventPayoutNeedsNewPick: eventPayout.needsNewPick === true
    });
    return sendJson(res, 200, { ...recovery, eventPayout });
  } catch (error) {
    console.error('Weekly finalization cron error:', error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Weekly finalization failed' });
  }
};
